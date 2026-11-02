import test from "node:test";
import assert from "node:assert/strict";
import { describeStatus } from "../js/live.js";

const m = (over) => ({ measurement: { freshness: "online", coreStatus: "IDLE", rpmMilli: 0, provenance: "hardware", ...over } });

test("unknown is never shown as zero", () => {
  assert.equal(describeStatus(null).state, "unknown");
  assert.equal(describeStatus({ status: "unavailable", reason: "x" }).state, "unknown");
  assert.equal(describeStatus({ measurement: null }).state, "unknown");
  assert.equal(describeStatus(m({ freshness: "stale" })).state, "unknown");
  assert.equal(describeStatus(m({ coreStatus: "COUNTER_FAULT" })).state, "unknown");
});

test("the speed says whether he runs, whatever the device state", () => {
  // The docs' own example response: coreStatus IDLE at 77 rpm, while he was running.
  const running = { state: "running", text: "Live: his wheel is turning, 77 rpm" };
  assert.deepEqual(describeStatus(m({ rpmMilli: 77005 })), running);
  assert.deepEqual(describeStatus(m({ coreStatus: "ACTIVE", rpmMilli: 77005 })), running);
  for (const over of [{}, { coreStatus: "ACTIVE" }, { rpmMilli: 400 }]) {
    const rest = describeStatus(m(over));
    assert.equal(rest.state, "resting", JSON.stringify(over));
    assert.match(rest.text, /never forces or encourages running/);
  }
});

test("only his wheel's own sensor says anything about him", () => {
  for (const provenance of ["simulated", "replay", "derived"]) {
    const v = describeStatus(m({ coreStatus: "ACTIVE", rpmMilli: 77005, provenance }));
    assert.equal(v.state, "unknown", provenance);
    assert.match(v.text, new RegExp(`labelled "${provenance}"`));
  }
  assert.equal(describeStatus(m({ provenance: null })).state, "unknown");
});
