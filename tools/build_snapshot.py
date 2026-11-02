#!/usr/bin/env python3
"""Build data/races.json for Ghost Wheel from Squeektoshi's recorded runs.

Run once, offline, by the builder. Python 3 standard library only.

Sources
- GET https://api.squeekchain.com/v1/measurement/runs: the device's record of
  wheel passages with exact times. The API says: "This is evidence signed by
  the device's key, not work certified by SqueekCore."
- SqueekCore on Sepolia, read-only eth_call: roundPage(afterRound, throughRound, 16)
  for each round a race touches, and blockInfo(b), "The round that completed
  Squeek block b ... and the cumulative physical work at which it completed".
  On this deployment cumulative work equals the count of accepted passages, so
  block b completed at passage number workThreshold(b). The script checks that
  against every round it reads and stops if the two records disagree.

Usage
  python3 tools/build_snapshot.py --runs-file runs.json --out data/races.json
  python3 tools/build_snapshot.py --fetch-runs --save-runs runs.json --out data/races.json
"""
import argparse
import bisect
import datetime as dt
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.squeekchain.com"
RPC = "https://ethereum-sepolia-rpc.publicnode.com"
CORE = "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44"  # live SqueekCore proxy, Sepolia: identities.core in /v1/core
CHAIN_ID = 11155111
GENESIS = 1793022600  # configuration().genesisTimestamp: 2026-10-26T13:50:00Z, round 1 starts here
ROUND_S = 600
UNITS_PER_BLOCK = 10**9
SEL_ROUND_PAGE = "0xc8b9e08f"  # keccak256("roundPage(uint64,uint64,uint256)")[:4]
SEL_BLOCK_INFO = "0x9bc84ea0"  # keccak256("blockInfo(uint64)")[:4]
SEL_STATE = "0xc19d93fb"  # keccak256("state()")[:4]
RACE_MS = 30000
RPC_GAP_S = 3.1  # public RPC etiquette: one request per 3 s
API_GAP_S = 1.1
UA = {"User-Agent": "squeek-ghost-wheel-snapshot/1", "Content-Type": "application/json"}

_last = {}
_head = {}  # the one Ethereum block every network read in this run is made at
LEGACY_CACHE = []  # set when the cache holds reads made without a pinned block


def _pace(key, gap):
    wait = gap - (time.time() - _last.get(key, 0))
    if wait > 0:
        time.sleep(wait)
    _last[key] = time.time()


class CursorRefused(Exception):
    pass


def http_json(url, body=None, key="api", gap=API_GAP_S, restart_on=()):
    for attempt in range(5):
        _pace(key, gap)
        req = urllib.request.Request(url, data=body, headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in restart_on:
                raise CursorRefused(e.code)
            if 400 <= e.code < 500 and e.code != 429:  # a request the server will never accept
                raise SystemExit(f"HTTP {e.code} from {url}")
            err = e
            time.sleep(5 * (attempt + 1))
        except Exception as e:  # back off on any refusal, never give up silently
            err = e
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"request failed after retries: {url}: {err}")


def rpc_call(rpc, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    res = http_json(rpc, body, key="rpc", gap=RPC_GAP_S)
    if "error" in res:
        raise SystemExit(f"{method} error: {res['error']}")
    return res["result"]


def chain_head(rpc):
    """Check the chain, then fix one block for every read in this run ("One block per snapshot")."""
    if LEGACY_CACHE:
        raise SystemExit("the cache holds reads made without a pinned block; delete it to read the chain again")
    if "block" not in _head:
        chain = int(rpc_call(rpc, "eth_chainId", []), 16)
        if chain != CHAIN_ID:
            raise SystemExit(f"RPC is on chain {chain}, not Sepolia ({CHAIN_ID})")
        _head["block"] = rpc_call(rpc, "eth_blockNumber", [])
    return _head["block"]


def eth_call(rpc, data):
    return bytes.fromhex(rpc_call(rpc, "eth_call", [{"to": CORE, "data": data}, chain_head(rpc)])[2:])


def word(n):
    return format(n, "064x")


def words(raw):
    return [int.from_bytes(raw[i:i + 32], "big") for i in range(0, len(raw), 32)]


def round_page(rpc, after_round, through_round):
    """Return (start, end) LedgerPositions as dicts (cumulativeWork, cumulativeBlockUnits, workPerThousandBlocks)."""
    w = words(eth_call(rpc, SEL_ROUND_PAGE + word(after_round) + word(through_round) + word(16)))
    base = w[0] // 32  # offset of the RoundPage tuple
    certified = w[base]
    start = dict(cumulativeWork=w[base + 1], cumulativeBlockUnits=w[base + 2], workPerThousandBlocks=w[base + 3])
    end = dict(cumulativeWork=w[base + 4], cumulativeBlockUnits=w[base + 5], workPerThousandBlocks=w[base + 6])
    if certified < through_round:
        raise SystemExit(f"round {through_round} is not certified yet (certifiedThroughRound {certified})")
    return start, end


def block_info(rpc, b):
    w = words(eth_call(rpc, SEL_BLOCK_INFO + word(b)))
    return dict(roundId=w[0], workThreshold=w[1])


def core_state(rpc):
    w = words(eth_call(rpc, SEL_STATE))
    return dict(settledThroughRound=w[0], cumulativeWork=w[1], cumulativeBlockUnits=w[2],
                blockHeight=w[3], workPerThousandBlocks=w[5])


def fetch_runs(max_pages=None, start=None):
    """Page through the runs feed from `start` (the first page when None). Its docs: keep
    nextCursor "even on an empty page and continue from it until `items` is empty"; a cursor
    refused with 400 or 409 means starting again from the first page."""
    for attempt in range(3):
        items, cursor, pages, meta = [], start if attempt == 0 else None, 0, None
        try:
            while True:
                url = f"{API}/v1/measurement/runs?limit=100" + (f"&cursor={urllib.parse.quote(cursor)}" if cursor else "")
                page = http_json(url, restart_on=(400, 409))
                meta = meta or {k: v for k, v in page.items() if k not in ("items", "nextCursor")}
                got = page.get("items") or []
                items += got
                pages += 1
                cursor = page.get("nextCursor") or cursor
                if not got or not page.get("nextCursor") or (max_pages and pages >= max_pages):
                    break
        except CursorRefused as e:
            print(f"cursor refused (HTTP {e}); starting again from the first page", file=sys.stderr)
            continue
        return {"fetchedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "meta": meta, "nextCursor": cursor, "items": items}
    raise SystemExit("the runs feed refused its cursor three times")


def parse_ts(s):
    """ISO time with microseconds -> epoch milliseconds (float)."""
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000.0


def iso(ms):
    return dt.datetime.fromtimestamp(ms / 1000.0, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def round_of(ms):
    return int((ms / 1000.0 - GENESIS) // ROUND_S) + 1


def round_start_ms(r):
    return (GENESIS + (r - 1) * ROUND_S) * 1000.0


def flatten(runs):
    segs = sorted(runs["items"], key=lambda s: s["startAt"])
    times = []
    for s in segs:
        if s.get("provenance") != "hardware" or s.get("measurementEligible") is not True:
            raise SystemExit(f"segment {s['segmentId']}: provenance {s.get('provenance')!r}, "
                             f"measurementEligible {s.get('measurementEligible')!r}; only eligible hardware runs are used")
        ts = [parse_ts(p["at"]) for p in s["passages"]]
        if len(ts) != int(s["workUnits"]):
            raise SystemExit(f"segment {s['segmentId']}: {len(ts)} passages but workUnits {s['workUnits']}")
        times += ts
    if any(b <= a for a, b in zip(times, times[1:])):
        raise SystemExit("passages are not in strictly increasing time order")
    return times  # passage number k (1-based) is times[k-1]


def night_of(ms):
    """A night is named after the evening it starts on (UTC)."""
    return (dt.datetime.fromtimestamp(ms / 1000.0, dt.timezone.utc) - dt.timedelta(hours=12)).date().isoformat()


def bouts(times, gap_ms=60000):
    out, start = [], 0
    for i in range(1, len(times) + 1):
        if i == len(times) or times[i] - times[i - 1] > gap_ms:
            out.append((start, i - 1))
            start = i
    return out


def window(times, i):
    j = bisect.bisect_left(times, times[i] + RACE_MS)
    return i, j  # passages i .. j-1 fall inside [t_i, t_i + 30 s)


def max_gap(times, i, j):
    return max((times[k + 1] - times[k] for k in range(i, j - 1)), default=0)


def pick_races(times):
    by_night = {}
    for i, t in enumerate(times):
        by_night.setdefault(night_of(t), []).append(i)
    chosen = []

    def far(i):
        return all(abs(times[i] - times[c["i"]]) > 10 * 60000 for c in chosen)

    for night in sorted(by_night):
        idx = by_night[night]
        counts = [(window(times, i)[1] - i, i) for i in idx]
        hard_n, hard_i = max(counts, key=lambda c: (c[0], -c[1]))
        chosen.append(dict(i=hard_i, level="hard", night=night))
        # a steady medium window: about 36 passages (about 72 rpm), no pause longer than 2.5 s
        med = [(abs(n - 36), max_gap(times, i, i + n), i) for n, i in counts if 33 <= n <= 39]
        med = [m for m in med if m[1] <= 2500 and far(m[2])]
        if med:
            chosen.append(dict(i=min(med)[2], level="medium", night=night))
    # two easy windows from different nights: about 28 passages, no pause longer than 3 s
    easy_nights = []
    for night in sorted(by_night, key=lambda n: (n not in ("2026-10-27", "2026-10-29"), n)):
        if len(easy_nights) == 2:
            break
        cands = []
        for i in by_night[night]:
            n = window(times, i)[1] - i
            if 26 <= n <= 30 and max_gap(times, i, i + n) <= 3000 and far(i):
                cands.append((abs(n - 28), max_gap(times, i, i + n), i))
        if cands:
            chosen.append(dict(i=min(cands)[2], level="easy", night=night))
            easy_nights.append(night)
    return sorted(chosen, key=lambda c: times[c["i"]])


def title_for(times, i, n, level, night_best):
    """A title states only what the snapshot proves."""
    pace = "sprint" if n >= 45 else "run" if n >= 35 else "jog"
    if i == 0:
        return f"First {pace} on chain"
    if level == "hard":
        if n != night_best:
            raise SystemExit(f"window at passage {i + 1} holds {n}, but the night's best 30 s holds {night_best}")
        return "Fastest 30 s of the night"
    hour = dt.datetime.fromtimestamp(times[i] / 1000.0, dt.timezone.utc).hour
    if 12 <= hour <= 23:
        return f"Late-evening {pace}"
    if hour <= 2:
        return f"Small-hours {pace}"
    return f"Pre-dawn {pace}"


def blocks_in(rpc, times, first_k, last_k, cache):
    """Blocks whose workThreshold falls on passage numbers first_k..last_k, read from SqueekCore."""
    found = []
    for r in range(round_of(times[first_k - 1]), round_of(times[last_k - 1]) + 1):
        key = f"round:{r}"
        if key not in cache:
            cache[key] = round_page(rpc, r - 1, r)
        start, end = cache[key]
        # cross-check: the core's work before and through round r equals the device's passage count
        before = bisect.bisect_left(times, round_start_ms(r))
        through = bisect.bisect_left(times, round_start_ms(r + 1))
        if (start["cumulativeWork"], end["cumulativeWork"]) != (before, through):
            raise SystemExit(f"round {r}: core work {start['cumulativeWork']}..{end['cumulativeWork']} "
                             f"but device passages {before}..{through}; refusing to mark blocks")
        b_lo = start["cumulativeBlockUnits"] // UNITS_PER_BLOCK + 1
        b_hi = end["cumulativeBlockUnits"] // UNITS_PER_BLOCK
        if b_lo > b_hi:
            continue
        lo_k, hi_k = max(first_k, start["cumulativeWork"] + 1), min(last_k, end["cumulativeWork"])

        def info(b):
            bkey = f"block:{b}"
            if bkey not in cache:
                cache[bkey] = block_info(rpc, b)
            if cache[bkey]["roundId"] != r:
                raise SystemExit(f"block {b}: blockInfo says round {cache[bkey]['roundId']}, expected {r}")
            return cache[bkey]

        # Only to choose where to start reading: the core prices this round's work at the
        # difficulty in force for it. Every stored value below comes from blockInfo itself.
        d = start["workPerThousandBlocks"]
        guess = start["cumulativeBlockUnits"] + (lo_k - 1 - start["cumulativeWork"]) * 10**12 // d
        b = min(b_hi, max(b_lo, guess // UNITS_PER_BLOCK))
        while b > b_lo and info(b)["workThreshold"] >= lo_k:
            b -= 1
        while b <= b_hi:
            wt = info(b)["workThreshold"]
            if wt > hi_k:
                break
            if wt >= lo_k:
                found.append(dict(block=b, passage=wt, round=r))
            b += 1
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--runs-file", help="saved /v1/measurement/runs pages ({'items': [...]})")
    ap.add_argument("--fetch-runs", action="store_true", help="fetch every runs page from the API")
    ap.add_argument("--max-pages", type=int, default=None, help="stop fetching after this many pages (testing)")
    ap.add_argument("--save-runs", help="write the fetched runs here")
    ap.add_argument("--rpc", default=RPC)
    ap.add_argument("--cache", help="JSON cache of chain reads, so a rerun makes no new calls")
    ap.add_argument("--out", default="data/races.json")
    a = ap.parse_args()

    if a.fetch_runs:
        runs = fetch_runs(a.max_pages)
        if a.save_runs:
            json.dump(runs, open(a.save_runs, "w"))
    elif a.runs_file:
        runs = json.load(open(a.runs_file))
    else:
        ap.error("give --runs-file or --fetch-runs")

    times = flatten(runs)
    cache = json.load(open(a.cache)) if a.cache and _exists(a.cache) else {}
    if cache and "block" not in cache:
        LEGACY_CACHE.append(True)  # reads from before block pinning: usable offline, never mixed with new ones
    state = cache.get("state") or core_state(a.rpc)
    cache["state"] = state
    if "block" in _head:
        cache["block"] = _head["block"]
    if state["cumulativeWork"] < len(times):
        print(f"note: the core has settled {state['cumulativeWork']} passages, the device shows {len(times)}; "
              "only settled rounds are used", file=sys.stderr)
    night_total = {}
    for t in times:
        night_total[night_of(t)] = night_total.get(night_of(t), 0) + 1
    night_best = {}
    for i, t in enumerate(times):
        n = window(times, i)[1] - i
        night_best[night_of(t)] = max(night_best.get(night_of(t), 0), n)
    bout_list = bouts(times)

    races = []
    for c in pick_races(times):
        i, j = window(times, c["i"])
        t0 = times[i]
        first_k, last_k = i + 1, j  # passage numbers are 1-based
        if round_of(times[j - 1]) > state["settledThroughRound"]:
            continue
        bs, be = next((s, e) for s, e in bout_list if s <= i <= e)
        blocks = blocks_in(a.rpc, times, first_k, last_k, cache)
        if "block" in _head:
            cache["block"] = _head["block"]
        if a.cache:
            json.dump(cache, open(a.cache, "w"))
        races.append(dict(
            id=dt.datetime.fromtimestamp(t0 / 1000.0, dt.timezone.utc).strftime("%Y-%m-%dT%H%M%SZ"),
            title=title_for(times, i, j - i, c["level"], night_best[c["night"]]),
            level=c["level"],
            night=c["night"],
            startAt=iso(t0),
            passages=j - i,
            t=[round(times[k] - t0) for k in range(i, j)],
            lead=round(times[i - 1] - t0) if i > 0 else None,
            tail=round(times[j] - t0) if j < len(times) else None,
            firstPassage=first_k,
            blocks=[dict(b, at=round(times[b["passage"] - 1] - t0)) for b in blocks],
            bout=dict(startAt=iso(times[bs]), endAt=iso(times[be]),
                      seconds=round((times[be] - times[bs]) / 1000.0, 1), passages=be - bs + 1),
            nightPassages=night_total[c["night"]],
        ))

    out = dict(
        schema="ghost-wheel-races.v1",
        generatedAt=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        sources=dict(
            runs=f"{API}/v1/measurement/runs",
            runsFetchedAt=runs.get("fetchedAt"),
            runsAuthority=(runs.get("meta") or {}).get("authority"),
            certifiedCoreWork=(runs.get("meta") or {}).get("certifiedCoreWork"),
            core=CORE, chainId=CHAIN_ID, reads="roundPage, blockInfo, state (eth_call, read-only)",
            coreSource="identities.core in https://api.squeekchain.com/v1/core; the docs' Deployments table "
                       "still lists the 12 Oct deployment 0x74665dAecA35A2303e767E76a2FF1FB6F93e119f",
            block=int(cache["block"], 16) if cache.get("block") else None,
        ),
        difficulty=dict(workPerThousandBlocks=state["workPerThousandBlocks"],
                        settledThroughRound=state["settledThroughRound"]),
        raceMs=RACE_MS,
        races=races,
    )
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {a.out}: {len(races)} races, "
          f"{sum(len(r['blocks']) for r in races)} block marks", file=sys.stderr)


def _exists(p):
    try:
        open(p).close()
        return True
    except OSError:
        return False


if __name__ == "__main__":
    main()
