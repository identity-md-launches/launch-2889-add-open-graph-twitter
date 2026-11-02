import test from "node:test";
import assert from "node:assert/strict";
import {
  createWheel, step, inZone, wrap, rpm, STEP_MS, TAU,
  createHand, pointerMove, createPedals, pedal, handNow,
} from "../js/wheel.js";
import { createSensor, sample } from "../js/sensor.js";

// Run the wheel for `ms`, sampling the sensor every STEP_MS, with a hand chosen per step.
function run(ms, handAt, wheel = createWheel()) {
  const sensor = createSensor();
  for (let t = 0; t <= ms; t += STEP_MS) {
    step(wheel, STEP_MS / 1000, handAt(t, wheel));
    sample(sensor, t, inZone(wheel.angle));
  }
  return { wheel, sensor };
}

test("wrap keeps angles in (-pi, pi]", () => {
  for (const a of [0, 1, -1, 3.2, -3.2, 10, -10, 100]) {
    const w = wrap(a);
    assert.ok(w > -Math.PI - 1e-9 && w <= Math.PI + 1e-9, `${a} -> ${w}`);
    assert.ok(Math.abs(Math.sin(w) - Math.sin(a)) < 1e-9 && Math.abs(Math.cos(w) - Math.cos(a)) < 1e-9);
  }
});

test("a steady hand at about 100 rpm gives about his sprint pace: 50 passages in 30 s", () => {
  const omega = (100 / 60) * TAU;
  const { sensor, wheel } = run(30000, () => ({ omega, engaged: true }));
  assert.ok(Math.abs(rpm(wheel.omega) - 100) < 3, `wheel at ${rpm(wheel.omega)} rpm`);
  assert.ok(sensor.accepted >= 47 && sensor.accepted <= 51, `${sensor.accepted} passages`);
});

test("rocking the wheel across the sensor is slow because the wheel is heavy", () => {
  // A hand that flips direction 8 times a second at 2 turns a second.
  const flip = (t) => ((Math.floor(t / 62.5) % 2) ? -1 : 1) * 2 * TAU;
  const start = createWheel(-Math.PI / 2 + 0.3); // magnet just beside the sensor
  const rocked = run(10000, (t) => ({ omega: flip(t), engaged: true }), start).sensor.accepted;
  // A weightless wheel that followed the hand would cross the sensor twice per flip.
  assert.ok(rocked < 40, `rocking gave ${rocked} passages in 10 s`);
});

test("a hand cannot stop a turning wheel dead, and a coasting wheel comes to rest", () => {
  const w = createWheel();
  w.omega = 10;
  step(w, 0.05, { omega: -10, engaged: true });
  assert.ok(w.omega > 5, "one 50 ms brake leaves most of the speed");
  for (let i = 0; i < 6000; i++) step(w, STEP_MS / 1000, { omega: 0, engaged: false });
  assert.equal(w.omega, 0);
});

test("pointer circling turns into hand speed, in the direction of travel", () => {
  const h = createHand();
  const cx = 100, cy = 100, r = 60;
  for (let t = 0; t <= 500; t += 16) {
    const a = (t / 1000) * TAU; // one turn a second, clockwise on screen
    pointerMove(h, t, cx + r * Math.cos(a), cy + r * Math.sin(a), cx, cy);
  }
  assert.ok(Math.abs(h.omega - TAU) < 0.6, `hand at ${h.omega} rad/s`);
  pointerMove(h, 520, cx + 1, cy + 1, cx, cy); // too close to the hub to read
  assert.equal(h.lastAngle, null);
});

test("pedals: the same key twice is not a stroke; six alternations a second hold about 97 rpm", () => {
  const p = createPedals();
  assert.equal(pedal(p, 0, "ArrowLeft"), true);
  assert.equal(pedal(p, 100, "ArrowLeft"), false);
  const h = createHand();
  const w = createWheel();
  const keys = ["ArrowRight", "ArrowLeft"];
  let k = 0;
  for (let t = 250; t <= 20000; t += STEP_MS) {
    if (t % 166 === 0) pedal(p, t, keys[k++ % 2]);
    step(w, STEP_MS / 1000, handNow(h, p, t));
  }
  assert.ok(Math.abs(rpm(w.omega) - 97) < 8, `pedalled to ${rpm(w.omega)} rpm`);
  assert.equal(handNow(h, p, 20000).source, "keys");
  assert.equal(handNow(createHand(), createPedals(), 0).source, null);
});
