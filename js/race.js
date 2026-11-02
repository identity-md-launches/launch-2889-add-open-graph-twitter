// Scoring and every sentence the result screen shows. Kept pure so the tests can
// read each sentence against the docs. Nothing here says that you mine: in the
// docs' words, "The hamster mines Squeek blocks; Squeeks don't mine."

export function outcome(you, him) {
  if (you > him) return { kind: "win", margin: you - him, headline: `You win by ${you - him}` };
  if (you < him) return { kind: "lose", margin: him - you, headline: `Squeektoshi wins by ${him - you}` };
  return { kind: "tie", margin: 0, headline: "Dead heat" };
}

export function scoreLine(you, him) {
  return `You ${you} ${plural(you, "passage")}, Squeektoshi ${him}`;
}

// SqueekCore's pricing step: "Each active round is priced at the current difficulty into
// block units", the difficulty in force before the round, in work units per 1,000 blocks.
// This only illustrates that price for your passages; his blocks are never worked out this
// way, they are read from blockInfo. The game certifies nothing.
export function blocksWorth(passages, workPerThousandBlocks) {
  return (passages * 1000) / workPerThousandBlocks;
}

export function illustrationLine(passages, workPerThousandBlocks) {
  const worth = blocksWorth(passages, workPerThousandBlocks).toFixed(2);
  const d = workPerThousandBlocks.toLocaleString("en-US");
  return (
    `At the difficulty of 31 October (${d} work units per 1,000 blocks), SqueekCore's pricing step ` +
    `would turn ${passages} ${plural(passages, "passage")} into about ${worth} blocks. ` +
    `An illustration only: Squeek blocks come from his certified work, and this game certifies nothing.`
  );
}

export function blocksLine(blocks) {
  if (!blocks.length) {
    return "No Squeek block completed inside this window.";
  }
  const list = blocks.map((b) => `#${b.block}`).join(", ");
  const n = blocks.length;
  return (
    `His passages in this window completed ${n} real Squeek ${plural(n, "block")} (${list}). ` +
    `Each mark sits on the passage that SqueekCore's blockInfo names for it.`
  );
}

// One note per rule that actually fired, and nothing when no rule fired.
export function ruleNotes(sensor, backwards) {
  const notes = [];
  if (sensor.rejected.spacing) {
    notes.push(
      `${sensor.rejected.spacing} ${plural(sensor.rejected.spacing, "passage")} came less than 60 ms after ` +
        `the one before and did not count. The device needs "At least 60 milliseconds between accepted passages".`,
    );
  }
  if (sensor.rejected.rearm) {
    notes.push(
      `${sensor.rejected.rearm} ${plural(sensor.rejected.rearm, "passage")} did not count because the magnet ` +
        `left the sensor for less than 10 ms. The device needs "At least 10 milliseconds of observed inactive state".`,
    );
  }
  if (sensor.rejected.initial) {
    notes.push(`The magnet started at the sensor, so the first contact did not count: the device must see the sensor inactive first.`);
  }
  if (sensor.holds) {
    notes.push(`You held the magnet at the sensor and it counted once, as on the real device: "A magnet held beside the sensor counts once."`);
  }
  if (backwards) {
    notes.push(
      `${backwards} of your passages went backwards. They count: the docs say accepted work does not prove direction.`,
    );
  }
  return notes;
}

// "a 4.5-minute", "an 8-second", "an 11-minute", "an 18-minute", "an 80-minute".
export function article(span) {
  return /^(8|11-|18-)/.test(span) ? "an" : "a";
}

export function boutLine(race) {
  const s = race.bout.seconds;
  const m = s / 60;
  const span = s < 90 ? `${Math.round(s)}-second` : `${m < 10 ? Number(m.toFixed(1)) : Math.round(m)}-minute`;
  return `That night this was part of ${article(span)} ${span} stretch of running with no break longer than a minute.`;
}

// Which inputs turned your wheel, so that scores can be compared: each input that drove
// it for at least a fifth of the time it was driven, the main one first.
const INPUTS = { keys: "the keys", mouse: "the mouse or trackpad", finger: "a finger", pen: "a pen" };

export function inputsUsed(ms) {
  const total = Object.values(ms).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return Object.keys(INPUTS)
    .filter((k) => (ms[k] ?? 0) >= total / 5)
    .sort((a, b) => ms[b] - ms[a]);
}

export function inputPhrase(used) {
  const names = used.map((k) => INPUTS[k]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}

export function inputLine(used) {
  if (!used.length) return "";
  return used.length === 1 && used[0] === "keys" ? "You pedalled with the keys." : `You spun with ${inputPhrase(used)}.`;
}

export function shareText(race, you, him, url, used = []) {
  const when = raceWhen(race);
  const o = outcome(you, him);
  const verdict = o.kind === "win" ? `I won by ${o.margin}` : o.kind === "lose" ? `Squeektoshi won by ${o.margin}` : "Dead heat";
  const how = used.length ? ` (with ${inputPhrase(used)})` : "";
  return (
    `Ghost Wheel: I raced Squeektoshi's real run (${race.title}, ${when}). ` +
    `Me ${you}${how}, Squeektoshi ${him} (passages in 30 s). ${verdict}. ${url}`
  );
}

export function raceWhen(race) {
  const d = new Date(race.startAt);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${hh}:${mm}:${ss} UTC`;
}

export function plural(n, word) {
  return n === 1 ? word : `${word}s`;
}
