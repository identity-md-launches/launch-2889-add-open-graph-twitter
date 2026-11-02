// The WHEELY9000's counting rules, as the Squeekchain docs publish them
// (docs.squeekchain.com/system/measurement/, "Acceptance property | Counting rule"):
//
//   Initial state            The Pi must observe an inactive sensor before accepting a passage
//   Inactive rearm           At least 10 milliseconds of observed inactive state
//   Passage spacing          At least 60 milliseconds between accepted passages
//   Repeated active samples  Add no work while the sensor stays active
//
// The game samples your wheel every 2 ms and runs each sample through these rules.

export const REARM_MS = 10;
export const SPACING_MS = 60;
export const HOLD_NOTE_MS = 400; // a magnet parked this long at the sensor gets a note

export function createSensor() {
  return {
    seenInactive: false,
    active: false,
    inactiveSince: null,
    activeSince: null,
    lastAccepted: null,
    activeAccepted: false, // the current contact was accepted in this window
    accepted: 0,
    rejected: { initial: 0, rearm: 0, spacing: 0 },
    holds: 0, // accepted contacts that stayed at the sensor for HOLD_NOTE_MS or longer
  };
}

// The device watches the sensor all the time; a race is a window onto that. Open the
// window: keep what the sensor has seen, and start the counts from zero.
export function startWindow(s) {
  s.activeAccepted = false;
  s.accepted = 0;
  s.rejected = { initial: 0, rearm: 0, spacing: 0 };
  s.holds = 0;
}

// Feed one sample: the time in ms and whether the magnet is at the sensor.
// Returns "accepted", the rule that refused the passage ("initial", "rearm",
// "spacing"), or null when nothing changed.
export function sample(s, tMs, isActive) {
  if (!isActive) {
    if (s.active) {
      if (s.activeAccepted && tMs - s.activeSince >= HOLD_NOTE_MS) s.holds += 1;
      s.inactiveSince = tMs;
    } else if (s.inactiveSince === null) {
      s.inactiveSince = tMs;
    }
    s.active = false;
    s.seenInactive = true;
    return null;
  }
  if (s.active) return null; // repeated active samples add no work
  s.active = true;
  s.activeSince = tMs;
  let verdict = "accepted";
  if (!s.seenInactive) verdict = "initial";
  else if (tMs - s.inactiveSince < REARM_MS) verdict = "rearm";
  else if (s.lastAccepted !== null && tMs - s.lastAccepted < SPACING_MS) verdict = "spacing";
  s.activeAccepted = verdict === "accepted";
  if (verdict === "accepted") {
    s.accepted += 1;
    s.lastAccepted = tMs;
  } else {
    s.rejected[verdict] += 1;
  }
  return verdict;
}

// Close the books at the end of a race: an accepted magnet still parked at the sensor counts as a hold.
export function finish(s, tMs) {
  if (s.active && s.activeAccepted && tMs - s.activeSince >= HOLD_NOTE_MS) s.holds += 1;
}
