# Ghost Wheel

Race a ghost of Squeektoshi's real recorded runs. You spin an on-screen wheel with your mouse, trackpad, finger or the arrow keys. A ghost replays one of his real runs passage by passage. Your passages are counted with the WHEELY9000's published counting rules, and his real Squeek blocks pop at the exact passages that completed them on SqueekCore.

It is a static site: no build step, no packages, no wallet. It works at any hour, because the ghosts are his real recorded runs, and Squeektoshi sleeps by day.

## The 60-second demo

1. Open the site. The run picker starts on **Fastest 30 s of the night · 28 Oct, 21:28:11 UTC · 50 in 30 s**.
2. Press **Start race** (or tap the stage). After 3, 2, 1, Go, circle your pointer or finger around your (blue) wheel. You don't need to click. Or press ← and → in turn.
3. For 30 seconds, his ghost turns beside you at his recorded times. Four of his real Squeek blocks, #2057 to #2060, pop where SqueekCore says they completed.
4. Read the result: the score in passages, the input you used, his real blocks, and a note for any counting rule that fired.
5. Press **Save share card** for a PNG, or **Copy result**.
6. Look at the **Live** chip at the top. It shows his wheel turning now, or that he is resting.

## How it works

| Piece | What it does | Where |
|---|---|---|
| Counting rules | Initial state, 10 ms rearm, 60 ms spacing, and repeated active samples ("Add no work while the sensor stays active"), sampled every 2 ms; the sensor watches through the countdown, as the device's always does | `js/sensor.js` |
| Your wheel | A wheel with weight: strokes push it, it coasts, and rocking across the sensor is slow | `js/wheel.js` |
| His ghost | Replays recorded passage times from `/v1/measurement/runs`; the magnet is at the sensor at each one | `js/ghost.js` |
| His blocks | `blockInfo(b)` on SqueekCore gives the cumulative work at which block b completed; on this deployment that is a passage number | `tools/build_snapshot.py`, `data/races.json` |
| Result text | Every sentence the result screen shows; tested so that none says the player mines | `js/race.js` |
| Live chip | `GET https://api.squeekchain.com/v1/status` every 15 s; unknown is never shown as zero | `js/live.js` |

The snapshot holds 12 thirty-second windows from 26 to 31 October 2026, with 43 block marks. The script that builds it checks SqueekCore's work before and after every round it uses against the device's passage count, and if they ever disagree it stops and writes no snapshot.

**The data.** `data/races.json` is derived from Squeekchain's public API (`/v1/measurement/runs`, fetched at 08:45:55 UTC on 31 October 2026) and from read-only calls to SqueekCore on Sepolia, every one made at block 12,033,882 (`sources.block`), from 12:37 to 12:41 UTC the same day. The file was written at 12:41:32 UTC (its `generatedAt`). The MIT licence covers the code. SqueekCore here is `0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44`, the live core the API names in `/v1/core` (`identities.core`); the docs' Deployments table still lists an earlier deployment from 12 October, `0x74665dAecA35A2303e767E76a2FF1FB6F93e119f`.

What the game does **not** claim:
- The runs feed is "evidence signed by the device's key, not work certified by SqueekCore". The game labels his ghost as recorded by the device, and his blocks as read from SqueekCore.
- Nobody mines here. "The hamster mines Squeek blocks; Squeeks don't mine." (Squeeks are the NFTs.) The one block figure for your score is labelled as an illustration of SqueekCore's pricing step ("Each active round is priced at the current difficulty into block units"); his own blocks are always read from `blockInfo`, never worked out.

## Care policy

"Never force exercise, wake the hamster for mining, or restrict food, water or rest to encourage running. Accept periods without block production." Ghost Wheel only reads public records of runs he chose to make. It never asks him to run, and nothing a player does reaches his wheel.

## Run it locally

```sh
python3 -m http.server 8000      # then open http://localhost:8000
node --test                      # 34 tests, Node 20 or later, no packages
```

Rebuild the snapshot (optional; it makes paced, read-only calls to the API and to a public Sepolia RPC):

```sh
python3 tools/build_snapshot.py --fetch-runs --save-runs runs.json --out data/races.json
```

## Files

- `index.html`, `about.html`, `css/style.css`, `assets/icon.svg`
- `js/`: `main.js` (page), `sensor.js`, `wheel.js`, `ghost.js`, `race.js`, `live.js`, `card.js`, `audio.js`
- `data/races.json`: the snapshot (about 9.5 KB)
- `tools/build_snapshot.py`: builds the snapshot (Python 3 standard library)
- `test/`: `node --test` suites for the rules, the wheel, the ghost, the result text, the live chip and the data

## Sources

- Squeekchain docs: [Measuring wheel activity](https://docs.squeekchain.com/system/measurement/), [SqueekCore](https://docs.squeekchain.com/developers/core/), [API](https://docs.squeekchain.com/developers/api/), [Squeektoshi](https://docs.squeekchain.com/system/squeektoshi/)
- SqueekCore (Sepolia): `0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44`

A community build for Squeekchain, not an official Squeekchain product. MIT licence.
