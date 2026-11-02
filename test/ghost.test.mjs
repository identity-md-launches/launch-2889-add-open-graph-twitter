import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ghostAngle, ghostCount, ghostBlocks, timeline } from "../js/ghost.js";
import { SENSOR_ANGLE, TAU, ZONE, inZone, STEP_MS } from "../js/wheel.js";
import { createSensor, sample, startWindow } from "../js/sensor.js";

const data = JSON.parse(readFileSync(new URL("../data/races.json", import.meta.url)));
const races = data.races.map((r) => ({ ...r, raceMs: data.raceMs }));

const near = (a, b) => {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return Math.min(d, TAU - d) < 1e-9;
};

test("the ghost's magnet reaches the sensor at every recorded passage", () => {
  for (const race of races) {
    for (const t of timeline(race)) assert.ok(near(ghostAngle(race, t), SENSOR_ANGLE - ZONE), `${race.id} at ${t}`);
  }
});

test("the ghost never turns backwards and never jumps", () => {
  for (const race of races) {
    let prev = ghostAngle(race, -3000);
    for (let t = -3000 + 5; t <= data.raceMs + 1000; t += 5) {
      const a = ghostAngle(race, t);
      assert.ok(a >= prev - 1e-9, `${race.id}: backwards at ${t}`);
      assert.ok(a - prev < 1.0, `${race.id}: jump at ${t}`);
      prev = a;
    }
  }
});

test("run through the same rules and sampling as your wheel, the replay gives exactly his recorded count", () => {
  for (const race of races) {
    // As in the game: the sensor watches through the 3-second countdown, and the window opens at Go.
    const s = createSensor();
    for (let t = -3000; t < 0; t += STEP_MS) sample(s, t, inZone(ghostAngle(race, t)));
    startWindow(s);
    for (let t = 0; t < data.raceMs; t += STEP_MS) sample(s, t, inZone(ghostAngle(race, t)));
    assert.equal(s.accepted, race.passages, race.id);
    assert.equal(ghostCount(race, data.raceMs - 1), race.passages);
  }
});

test("his real blocks appear at the passages SqueekCore names", () => {
  for (const race of races) {
    for (const b of race.blocks) {
      assert.equal(b.at, race.t[b.passage - race.firstPassage], `${race.id} block ${b.block}`);
    }
    assert.equal(ghostBlocks(race, data.raceMs).length, race.blocks.length);
    assert.equal(ghostBlocks(race, -1).length, 0);
  }
});
