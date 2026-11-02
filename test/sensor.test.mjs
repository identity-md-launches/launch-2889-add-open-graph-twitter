import test from "node:test";
import assert from "node:assert/strict";
import { createSensor, sample, finish, startWindow, REARM_MS, SPACING_MS } from "../js/sensor.js";

// Feed a list of [tMs, active] samples and return the verdicts that were not null.
function feed(s, samples) {
  return samples.map(([t, a]) => sample(s, t, a)).filter((v) => v !== null);
}

test("the published numbers: 10 ms rearm, 60 ms spacing", () => {
  assert.equal(REARM_MS, 10);
  assert.equal(SPACING_MS, 60);
});

test("a clean passage after a rearmed sensor counts once", () => {
  const s = createSensor();
  assert.deepEqual(feed(s, [[0, false], [12, false], [14, true], [16, true], [18, true]]), ["accepted"]);
  assert.equal(s.accepted, 1);
});

test("initial state: the sensor must be seen inactive before a passage counts", () => {
  const s = createSensor();
  assert.deepEqual(feed(s, [[0, true], [2, true], [4, false], [20, false], [22, true]]), ["initial", "accepted"]);
  assert.equal(s.accepted, 1);
  assert.equal(s.rejected.initial, 1);
});

test("inactive rearm: less than 10 ms away from the sensor does not count", () => {
  const s = createSensor();
  feed(s, [[0, false], [20, true], [22, false]]);
  assert.equal(sample(s, 30, true), "rearm"); // inactive for 8 ms only
  assert.equal(s.accepted, 1);
  assert.equal(s.rejected.rearm, 1);
});

test("passage spacing: under 60 ms after the last accepted passage does not count", () => {
  const s = createSensor();
  feed(s, [[0, false], [20, true], [22, false]]);
  assert.equal(sample(s, 50, true), "spacing"); // 30 ms after the accepted one, rearmed for 28 ms
  sample(s, 52, false);
  assert.equal(sample(s, 82, true), "accepted"); // 62 ms after the last accepted passage
  assert.equal(s.accepted, 2);
  assert.equal(s.rejected.spacing, 1);
});

test("repeated active samples add no work, and a long hold is noted once", () => {
  const s = createSensor();
  const samples = [[0, false], [20, true]];
  for (let t = 22; t <= 1000; t += 2) samples.push([t, true]);
  samples.push([1002, false]);
  assert.deepEqual(feed(s, samples), ["accepted"]);
  assert.equal(s.holds, 1);
});

test("a magnet still parked at the end counts as a hold", () => {
  const s = createSensor();
  feed(s, [[0, false], [20, true], [600, true]]);
  finish(s, 600);
  assert.equal(s.holds, 1);
});

test("a hold is noted only when its contact counted", () => {
  const s = createSensor();
  const samples = [[0, true]]; // parked at the sensor from the start: refused by the initial-state rule
  for (let t = 2; t <= 1000; t += 2) samples.push([t, true]);
  samples.push([1002, false]);
  assert.deepEqual(feed(s, samples), ["initial"]);
  assert.equal(s.holds, 0);
});

test("opening a race window keeps what the sensor has seen and zeroes the counts", () => {
  const s = createSensor();
  feed(s, [[-3000, false], [-500, true], [-498, false]]);
  assert.equal(s.accepted, 1);
  startWindow(s);
  assert.equal(s.accepted, 0);
  assert.equal(s.seenInactive, true);
  assert.equal(sample(s, 4, true), "accepted"); // watched before Go, so a passage 4 ms in counts
  // a contact accepted before the window and held into it is not a hold of this race
  const h = createSensor();
  feed(h, [[-3000, false], [-100, true]]);
  startWindow(h);
  for (let t = 0; t <= 800; t += 2) sample(h, t, true);
  sample(h, 802, false);
  assert.equal(h.accepted, 0);
  assert.equal(h.holds, 0);
});
