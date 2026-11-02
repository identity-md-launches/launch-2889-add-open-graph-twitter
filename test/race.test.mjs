import test from "node:test";
import assert from "node:assert/strict";
import {
  outcome, scoreLine, blocksWorth, illustrationLine, blocksLine, ruleNotes, boutLine, shareText, raceWhen, article,
  inputsUsed, inputLine,
} from "../js/race.js";
import { createSensor } from "../js/sensor.js";

const race = {
  title: "Fastest 30 s of the night", startAt: "2026-10-28T21:28:11.037000Z",
  bout: { seconds: 2172 }, blocks: [{ block: 2045, passage: 22398, at: 4100 }],
};

const MINE = /\bmine[sd]?\b|\bmining\b|\bminer/i;

test("outcomes", () => {
  assert.equal(outcome(41, 50).headline, "Squeektoshi wins by 9");
  assert.equal(outcome(52, 50).headline, "You win by 2");
  assert.equal(outcome(50, 50).kind, "tie");
  assert.equal(scoreLine(1, 50), "You 1 passage, Squeektoshi 50");
});

test("the illustration prices passages at a stated difficulty and says it certifies nothing", () => {
  assert.equal(blocksWorth(41, 10906).toFixed(2), "3.76");
  const line = illustrationLine(41, 10906);
  assert.match(line, /10,906 work units per 1,000 blocks/);
  assert.match(line, /certifies nothing/);
});

test("no sentence says the player mines", () => {
  const s = createSensor();
  s.rejected = { initial: 1, rearm: 2, spacing: 3 };
  s.holds = 1;
  const all = [
    outcome(1, 2).headline, outcome(2, 1).headline, scoreLine(3, 4), illustrationLine(41, 10906),
    blocksLine(race.blocks), blocksLine([]), ...ruleNotes(s, 5), boutLine(race),
    shareText(race, 41, 50, "https://example.org"),
    shareText(race, 41, 50, "https://example.org", ["keys", "mouse"]),
    inputLine(["keys"]), inputLine(["finger"]), inputLine(["mouse", "keys"]),
  ];
  for (const line of all) assert.doesNotMatch(line, MINE, line);
});

test("rule notes appear only for rules that fired", () => {
  assert.deepEqual(ruleNotes(createSensor(), 0), []);
  const s = createSensor();
  s.rejected.spacing = 2;
  const notes = ruleNotes(s, 0);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /At least 60 milliseconds between accepted passages/);
});

test("block and time lines", () => {
  assert.match(blocksLine(race.blocks), /1 real Squeek block \(#2045\)/);
  assert.equal(raceWhen(race), "28 Oct, 21:28:11 UTC");
  assert.match(boutLine(race), /part of a 36-minute stretch/);
});

test("bout lengths are rounded once and take the right article", () => {
  const line = (seconds) => boutLine({ bout: { seconds } });
  assert.match(line(45.9), /part of a 46-second stretch/);
  assert.match(line(657.9), /part of an 11-minute stretch/);
  assert.match(line(1347.5), /part of a 22-minute stretch/);
  assert.match(line(480), /part of an 8-minute stretch/);
  assert.match(line(223.9), /part of a 3.7-minute stretch/);
  assert.equal(article("18-minute"), "an");
  assert.equal(article("83-minute"), "an");
  assert.equal(article("1.5-minute"), "a");
});

test("the share text speaks in one voice", () => {
  assert.equal(
    shareText(race, 41, 50, "https://example.org"),
    "Ghost Wheel: I raced Squeektoshi's real run (Fastest 30 s of the night, 28 Oct, 21:28:11 UTC). " +
      "Me 41, Squeektoshi 50 (passages in 30 s). Squeektoshi won by 9. https://example.org",
  );
  assert.match(shareText(race, 52, 50, "u"), /I won by 2\./);
  assert.match(shareText(race, 50, 50, "u"), /Dead heat\./);
  assert.match(shareText(race, 48, 50, "u", ["keys"]), /Me 48 \(with the keys\), Squeektoshi 50 \(passages in 30 s\)\./);
});

test("the result names the inputs that turned the wheel", () => {
  assert.deepEqual(inputsUsed({}), []);
  assert.deepEqual(inputsUsed({ keys: 29000 }), ["keys"]);
  assert.deepEqual(inputsUsed({ keys: 2000, mouse: 27000 }), ["mouse"]);
  assert.deepEqual(inputsUsed({ keys: 9000, finger: 20000 }), ["finger", "keys"]);
  assert.equal(inputLine([]), "");
  assert.equal(inputLine(["keys"]), "You pedalled with the keys.");
  assert.equal(inputLine(["mouse"]), "You spun with the mouse or trackpad.");
  assert.equal(inputLine(["finger", "keys"]), "You spun with a finger and the keys.");
});
