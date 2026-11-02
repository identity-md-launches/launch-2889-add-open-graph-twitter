import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const url = new URL("../data/races.json", import.meta.url);
const data = JSON.parse(readFileSync(url));

test("the snapshot is small and says what it is", () => {
  assert.ok(statSync(url).size <= 50 * 1024, "at most 50 KB");
  assert.equal(data.schema, "ghost-wheel-races.v1");
  assert.equal(data.sources.certifiedCoreWork, false, "runs are device evidence, not certified work");
  assert.equal(data.sources.core, "0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44");
  assert.match(data.sources.coreSource, /identities\.core/);
  assert.equal(data.raceMs, 30000);
  assert.ok(data.difficulty.workPerThousandBlocks > 0);
});

test("every race is a clean 30-second window of real passages", () => {
  assert.ok(data.races.length >= 10);
  const ids = new Set();
  for (const r of data.races) {
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`);
    ids.add(r.id);
    assert.equal(r.t[0], 0);
    assert.equal(r.t.length, r.passages);
    for (let i = 1; i < r.t.length; i++) assert.ok(r.t[i] > r.t[i - 1], `${r.id} not increasing at ${i}`);
    assert.ok(r.t[r.t.length - 1] < data.raceMs);
    if (r.lead !== null) assert.ok(r.lead < 0);
    if (r.tail !== null) assert.ok(r.tail >= data.raceMs);
    assert.ok(["easy", "medium", "hard"].includes(r.level));
    assert.ok(r.blocks.length >= 1, `${r.id} has no block mark`);
    for (const b of r.blocks) {
      assert.ok(b.passage >= r.firstPassage && b.passage < r.firstPassage + r.passages, `${r.id} block ${b.block}`);
    }
    const blocks = r.blocks.map((b) => b.block);
    assert.deepEqual(blocks, [...blocks].sort((a, b) => a - b));
  }
});

test("the demo race is there: fastest 30 s of the night, 28 Oct 21:28:11 UTC, 50 passages", () => {
  const demo = data.races.find((r) => r.id === "2026-10-28T212811Z");
  assert.ok(demo);
  assert.equal(demo.passages, 50);
  assert.equal(demo.title, "Fastest 30 s of the night");
  assert.equal(demo.firstPassage, 22390);
});

test("titles claim only what the snapshot shows", () => {
  for (const r of data.races) {
    if (r.title.startsWith("First")) assert.equal(r.firstPassage, 1, `${r.id}: ${r.title}`);
    if (r.title === "Fastest 30 s of the night") assert.equal(r.level, "hard");
  }
  // every night's hard pick is that night's best: no other race that night holds more
  for (const r of data.races.filter((x) => x.level === "hard")) {
    for (const o of data.races.filter((x) => x.night === r.night)) assert.ok(o.passages <= r.passages, o.id);
  }
});
