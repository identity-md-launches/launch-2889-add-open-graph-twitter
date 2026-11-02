import { createSensor, sample, finish, startWindow } from "./sensor.js";
import {
  createWheel, step, inZone, rpm, STEP_MS, SENSOR_ANGLE, TAU,
  createHand, pointerMove, pointerLeave, createPedals, pedal, handNow,
} from "./wheel.js";
import { ghostAngle, ghostCount, ghostBlocks, timeline } from "./ghost.js";
import {
  outcome, scoreLine, illustrationLine, blocksLine, ruleNotes, boutLine, shareText, raceWhen, inputsUsed, inputLine,
} from "./race.js";
import { startLive } from "./live.js";
import { unlock, setSound, clickYou, clickHim, chime } from "./audio.js";
import { drawCard, saveCard } from "./card.js";

const COUNTDOWN_MS = 3000;
const GO_MS = 600; // how long "Go" stays up after the countdown
const $ = (id) => document.getElementById(id);
const motion = () => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
const stage = $("stage");
const ctx2d = stage.getContext("2d");

const S = {
  data: null,
  race: null,
  phase: "idle", // idle, countdown, racing, done
  you: createWheel(),
  sensor: createSensor(),
  youCount: 0,
  backwards: 0,
  himCount: 0,
  himBlocks: 0,
  simT: 0,
  carry: 0,
  phaseStart: 0,
  last: performance.now(),
  flashYou: 0,
  flashHim: 0,
  goUntil: 0,
  pops: [],
  layout: null,
};
const hand = createHand();
const pedals = createPedals();

function colors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    bg: v("--surface"), text: v("--text"), muted: v("--muted"), line: v("--line"),
    you: v("--you"), him: v("--him"), accent: v("--accent"), glow: v("--glow"),
  };
}

// ---------- layout ----------
// The same breakpoint as the CSS, so the tall phone stage always comes with Start above it.
const NARROW = window.matchMedia("(max-width: 639px)");

function resize() {
  const cssW = stage.parentElement.clientWidth;
  const wide = !NARROW.matches;
  // On a short screen (a phone held sideways) the wide stage is capped to fit the window.
  const cssH = Math.round(wide ? Math.min(cssW * 0.5, Math.max(240, window.innerHeight - 40)) : cssW * 1.65);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  stage.style.height = `${cssH}px`;
  stage.width = Math.round(cssW * dpr);
  stage.height = Math.round(cssH * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (wide) {
    const R = Math.min(cssW * 0.16, cssH * 0.29);
    S.layout = { wide, W: cssW, H: cssH, R, you: { x: cssW * 0.27, y: cssH * 0.5 }, him: { x: cssW * 0.73, y: cssH * 0.5 } };
  } else {
    const R = Math.min(cssW * 0.28, cssH * 0.14);
    S.layout = { wide, W: cssW, H: cssH, R, him: { x: cssW * 0.5, y: cssH * 0.235 }, you: { x: cssW * 0.5, y: cssH * 0.7 } };
  }
}

// ---------- drawing ----------
function drawWheel(c, p, R, angle, o) {
  const { x, y } = p;
  c.save();
  c.lineCap = "round";
  c.strokeStyle = o.color;
  c.globalAlpha = o.ghost ? 0.85 : 1;
  if (o.ghost) c.setLineDash([R * 0.08, R * 0.05]);
  c.lineWidth = Math.max(3, R * 0.05);
  c.beginPath();
  c.arc(x, y, R, 0, TAU);
  c.stroke();
  c.setLineDash([]);
  c.lineWidth = Math.max(1.5, R * 0.02);
  c.beginPath();
  c.arc(x, y, R * 0.84, 0, TAU);
  c.stroke();
  c.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = angle + (i * TAU) / 28;
    c.moveTo(x + Math.cos(a) * R * 0.84, y + Math.sin(a) * R * 0.84);
    c.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
  }
  for (let i = 0; i < 6; i++) {
    const a = angle + (i * TAU) / 6 + 0.26;
    c.moveTo(x + Math.cos(a) * R * 0.1, y + Math.sin(a) * R * 0.1);
    c.lineTo(x + Math.cos(a) * R * 0.84, y + Math.sin(a) * R * 0.84);
  }
  c.stroke();
  c.fillStyle = o.color;
  c.beginPath();
  c.arc(x, y, R * 0.1, 0, TAU);
  c.fill();
  // the magnet
  c.globalAlpha = 1;
  c.fillStyle = o.magnet;
  c.beginPath();
  c.arc(x + Math.cos(angle) * R * 0.92, y + Math.sin(angle) * R * 0.92, Math.max(4, R * 0.065), 0, TAU);
  c.fill();
  // the sensor, just outside the rim at the top
  const sx = x + Math.cos(SENSOR_ANGLE) * (R + R * 0.12);
  const sy = y + Math.sin(SENSOR_ANGLE) * (R + R * 0.12);
  const lit = o.flash || inZone(angle);
  c.fillStyle = lit ? o.glow : o.sensor;
  const sw = Math.max(14, R * 0.2);
  const sh = Math.max(7, R * 0.09);
  roundRect(c, sx - sw / 2, sy - sh / 2, sw, sh, sh / 2);
  c.fill();
  c.restore();
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function label(c, p, R, name, count, sub, color, col) {
  c.save();
  c.textAlign = "center";
  c.fillStyle = color;
  c.font = `800 ${Math.round(R * 0.42)}px system-ui, sans-serif`;
  c.fillText(String(count), p.x, p.y + R * 1.42);
  c.fillStyle = col.text;
  c.font = `600 ${Math.max(13, Math.round(R * 0.13))}px system-ui, sans-serif`;
  c.fillText(name, p.x, p.y - R * 1.3);
  c.fillStyle = col.muted;
  c.font = `400 ${Math.max(12, Math.round(R * 0.11))}px system-ui, sans-serif`;
  c.fillText(sub, p.x, p.y + R * 1.62);
  c.restore();
}

function sensorTag(c, p, R, col) {
  c.save();
  c.fillStyle = col.muted;
  c.font = `400 ${Math.max(11, Math.round(R * 0.1))}px system-ui, sans-serif`;
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.fillText("sensor", p.x + Math.max(14, R * 0.2) / 2 + 6, p.y - R * 1.12);
  c.restore();
}

function draw(now) {
  const L = S.layout;
  const col = colors();
  const c = ctx2d;
  c.clearRect(0, 0, L.W, L.H);
  const gt = ghostTime();
  const race = S.race;
  drawWheel(c, L.you, L.R, S.you.angle, {
    color: col.you, magnet: col.accent, sensor: col.line, glow: col.glow, flash: now < S.flashYou,
  });
  drawWheel(c, L.him, L.R, race ? ghostAngle(race, gt) : SENSOR_ANGLE, {
    color: col.him, magnet: col.accent, sensor: col.line, glow: col.glow, flash: now < S.flashHim, ghost: true,
  });
  const youRpm = Math.round(rpm(S.you.omega));
  const live = S.phase === "racing" || S.phase === "done";
  label(c, L.you, L.R, "You", S.youCount * (live ? 1 : 0), live ? `passages · ${youRpm} rpm` : `warm up: spin your wheel · ${youRpm} rpm`, col.you, col);
  const blocks = race ? ghostBlocks(race, gt).length : 0;
  const himSub = live
    ? `passages · ${race ? ghostRpm(race, gt) : 0} rpm · ${blocks} real ${blocks === 1 ? "block" : "blocks"}`
    : `recorded ${race ? raceWhen(race) : ""}`;
  label(c, L.him, L.R, "Squeektoshi (his real run)", live ? S.himCount : 0, himSub, col.him, col);
  sensorTag(c, L.you, L.R, col);

  // block pops over the ghost wheel
  c.save();
  c.textAlign = "center";
  c.font = `700 ${Math.max(13, Math.round(L.R * 0.14))}px system-ui, sans-serif`;
  S.pops = S.pops.filter((p) => now - p.t0 < 1600);
  for (const p of S.pops) {
    const k = (now - p.t0) / 1600;
    c.globalAlpha = 1 - k;
    c.fillStyle = col.him;
    c.fillText(p.text, L.him.x, L.him.y - L.R * (0.15 + 0.5 * k));
  }
  c.restore();

  const going = S.phase === "racing" && S.simT < S.goUntil;
  if (S.phase === "countdown" || going) {
    const left = Math.ceil((COUNTDOWN_MS - (S.simT - S.phaseStart)) / 1000);
    const text = S.phase === "countdown" && left > 0 ? String(left) : "Go";
    // In the wide layout the count sits between the wheels; on a phone, inside your wheel.
    const p = L.wide ? { x: L.W / 2, y: L.H * 0.45 } : L.you;
    c.save();
    if (!L.wide) {
      c.globalAlpha = 0.85;
      c.fillStyle = col.bg;
      c.beginPath();
      c.arc(p.x, p.y, L.R * 0.5, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
    }
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = col.text;
    c.font = `800 ${Math.round(L.R * (L.wide ? 0.6 : 0.55))}px system-ui, sans-serif`;
    c.fillText(text, p.x, p.y);
    c.restore();
  } else if (S.phase === "idle" && S.race) {
    // Between the wheels on a wide stage; along the bottom edge on a phone.
    c.save();
    c.textAlign = "center";
    c.fillStyle = col.muted;
    const size = Math.max(14, Math.round(L.R * 0.13));
    c.font = `600 ${size}px system-ui, sans-serif`;
    if (L.wide) {
      c.textBaseline = "middle";
      c.fillText("Click here", L.W / 2, L.H * 0.5 - size * 0.7);
      c.fillText("or press Start", L.W / 2, L.H * 0.5 + size * 0.7);
    } else {
      c.textBaseline = "bottom";
      c.fillText("Tap here to start", L.W / 2, L.H - 8);
    }
    c.restore();
  }
  $("progress").style.width = `${S.phase === "racing" ? Math.min(100, (100 * gt) / S.data.raceMs) : S.phase === "done" ? 100 : 0}%`;
}

function ghostRpm(race, t) {
  const ts = timeline(race);
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i] <= t && t < ts[i + 1]) {
      const gap = ts[i + 1] - ts[i];
      return gap > 2500 ? 0 : Math.round(60000 / gap);
    }
  }
  return 0;
}

function ghostTime() {
  if (S.phase === "countdown") return S.simT - S.phaseStart - COUNTDOWN_MS;
  if (S.phase === "racing") return S.simT - S.phaseStart;
  if (S.phase === "done") return S.data.raceMs - 1;
  return -COUNTDOWN_MS;
}

// ---------- the loop ----------
function frame(now) {
  const dt = Math.min(50, now - S.last);
  S.last = now;
  const h = handNow(hand, pedals, now);
  if (S.phase === "racing" && h.engaged) {
    const k = h.source === "keys" ? "keys" : hand.kind === "touch" ? "finger" : hand.kind === "pen" ? "pen" : "mouse";
    S.inputMs[k] = (S.inputMs[k] ?? 0) + dt;
  }
  const total = dt + S.carry;
  const steps = Math.floor(total / STEP_MS);
  S.carry = total - steps * STEP_MS;
  for (let i = 0; i < steps; i++) {
    step(S.you, STEP_MS / 1000, h);
    S.simT += STEP_MS;
    if (S.phase === "countdown") {
      const t = S.simT - S.phaseStart - COUNTDOWN_MS;
      if (t >= 0) {
        // Go: the window opens on a sensor that has already been watching, as the device's does.
        S.phase = "racing";
        S.phaseStart = S.simT;
        S.goUntil = S.simT + GO_MS;
        startWindow(S.sensor);
      } else {
        sample(S.sensor, t, inZone(S.you.angle));
      }
    }
    if (S.phase === "racing") {
      const t = S.simT - S.phaseStart;
      if (t >= S.data.raceMs) {
        endRace();
        break;
      }
      if (sample(S.sensor, t, inZone(S.you.angle)) === "accepted") {
        S.youCount += 1;
        if (S.you.omega < 0) S.backwards += 1;
        S.flashYou = now + 120;
        clickYou();
      }
    }
  }
  if (S.phase === "racing" && S.race) {
    const t = ghostTime();
    const n = ghostCount(S.race, t);
    if (n > S.himCount) {
      S.himCount = n;
      S.flashHim = now + 120;
      clickHim();
    }
    const b = ghostBlocks(S.race, t);
    if (b.length > S.himBlocks) {
      for (const blk of b.slice(S.himBlocks)) S.pops.push({ text: `Squeek block #${blk.block}`, t0: now });
      S.himBlocks = b.length;
      chime();
    }
  }
  draw(now);
  requestAnimationFrame(frame);
}

// ---------- race flow ----------
function startRace() {
  if (!S.race || S.phase === "countdown" || S.phase === "racing") return;
  unlock();
  S.phase = "countdown";
  S.phaseStart = S.simT;
  S.sensor = createSensor();
  S.youCount = 0;
  S.backwards = 0;
  S.himCount = 0;
  S.himBlocks = 0;
  S.pops = [];
  S.inputMs = {};
  $("result").hidden = true;
  $("race").disabled = true;
  $("start").disabled = true;
  stage.classList.add("racing");
  stage.focus({ preventScroll: true });
  stage.scrollIntoView({ block: "nearest", behavior: motion() });
}

function stopRacing() {
  stage.classList.remove("racing");
  $("race").disabled = false;
  $("start").disabled = false;
}

function endRace() {
  finish(S.sensor, S.data.raceMs);
  S.phase = "done";
  S.himCount = S.race.passages;
  stopRacing();
  $("start").textContent = "Start race";
  showResult();
}

function showResult() {
  const race = S.race;
  const you = S.youCount;
  const him = race.passages;
  $("headline").textContent = outcome(you, him).headline;
  S.used = inputsUsed(S.inputMs);
  $("score").textContent = [
    `${scoreLine(you, him)}, both over 30 seconds.`,
    inputLine(S.used),
    "Yours were counted with the WHEELY9000's rules; his were recorded by the device that night.",
  ].filter(Boolean).join(" ");
  $("blocks").textContent = blocksLine(race.blocks);
  const notes = $("notes");
  notes.replaceChildren(...ruleNotes(S.sensor, S.backwards).map((n) => {
    const li = document.createElement("li");
    li.textContent = n;
    return li;
  }));
  notes.hidden = notes.children.length === 0;
  $("bout").textContent = boutLine(race);
  $("illustration").textContent = illustrationLine(you, S.data.difficulty.workPerThousandBlocks);
  $("result").hidden = false;
  $("headline").focus({ preventScroll: false });
}

function pageUrl() {
  return `${location.origin}${location.pathname}?run=${encodeURIComponent(S.race.id)}`;
}

// ---------- data and controls ----------
async function load() {
  const r = await fetch("data/races.json");
  const data = await r.json();
  data.races.forEach((x) => (x.raceMs = data.raceMs));
  S.data = data;
  const sel = $("race");
  const groups = { hard: "Hard: his fastest", medium: "Medium: steady runs", easy: "Easy: jogs" };
  for (const level of ["hard", "medium", "easy"]) {
    const g = document.createElement("optgroup");
    g.label = groups[level];
    for (const race of data.races.filter((x) => x.level === level)) {
      const o = document.createElement("option");
      o.value = race.id;
      o.textContent = `${race.title} · ${raceWhen(race)} · ${race.passages} in 30 s`;
      g.appendChild(o);
    }
    sel.appendChild(g);
  }
  const wanted = new URLSearchParams(location.search).get("run");
  const first = data.races.find((x) => x.id === wanted) || data.races.find((x) => x.id === "2026-10-28T212811Z") || data.races[0];
  sel.value = first.id;
  pick(first.id);
}

function pick(id) {
  S.race = S.data.races.find((x) => x.id === id);
  S.phase = "idle";
  S.himCount = 0;
  S.himBlocks = 0;
  $("result").hidden = true;
  const n = S.race.blocks.length;
  $("raceInfo").textContent =
    `${raceWhen(S.race)} · ${S.race.passages} passages in 30 s · ${n} real Squeek ${n === 1 ? "block" : "blocks"} ` +
    `completed in this window. Run recorded by the device, not certified by SqueekCore.`;
}

function wire() {
  $("race").addEventListener("change", (e) => pick(e.target.value));
  $("start").addEventListener("click", startRace);
  $("again").addEventListener("click", startRace);
  $("sound").addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", String(on));
    e.currentTarget.textContent = on ? "Sound on" : "Sound off";
    setSound(on);
    if (on) unlock();
  });
  $("card").addEventListener("click", async () => {
    const canvas = $("cardCanvas");
    drawCard(canvas, { race: S.race, you: S.youCount, him: S.race.passages, url: pageUrl(), colors: colors(), used: S.used });
    await saveCard(canvas, `ghost-wheel-${S.race.id}.png`);
  });
  $("copy").addEventListener("click", async () => {
    const btn = $("copy");
    const text = shareText(S.race, S.youCount, S.race.passages, pageUrl(), S.used);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy your result:", text);
      return;
    }
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = "Copy result"), 1500);
  });

  const local = (e) => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  // One finger turns the wheel: the first touch is followed and any others are ignored.
  let finger = null;
  const follows = (e) => e.pointerType === "mouse" || e.pointerId === finger;
  const release = (e) => {
    if (e.pointerType === "mouse" || e.pointerId === finger) {
      finger = null;
      pointerLeave(hand);
    }
  };
  stage.addEventListener("pointermove", (e) => {
    if (!follows(e) || (e.pointerType !== "mouse" && e.buttons === 0 && e.pressure === 0)) return;
    hand.kind = e.pointerType;
    const [x, y] = local(e);
    pointerMove(hand, performance.now(), x, y, S.layout.you.x, S.layout.you.y);
  });
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") {
      if (finger !== null) return;
      finger = e.pointerId;
    }
    stage.setPointerCapture?.(e.pointerId);
    hand.kind = e.pointerType;
    unlock();
    const [x, y] = local(e);
    pointerMove(hand, performance.now(), x, y, S.layout.you.x, S.layout.you.y);
  });
  stage.addEventListener("pointerleave", release);
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("lostpointercapture", release);
  // A tap or click on the waiting stage starts a race, as Enter does. (A swipe that
  // scrolls the page fires no click.)
  stage.addEventListener("click", () => {
    if (S.phase === "idle") startRace();
  });

  window.addEventListener("keydown", (e) => {
    const key = { ArrowLeft: "L", ArrowRight: "R", a: "L", d: "R", A: "L", D: "R" }[e.key];
    const racing = S.phase === "countdown" || S.phase === "racing";
    if (key) {
      // The arrows pedal only while you race or the stage has focus; elsewhere they scroll.
      if (!racing && document.activeElement !== stage) return;
      e.preventDefault();
      unlock();
      pedal(pedals, performance.now(), key);
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && e.target === stage) {
      e.preventDefault();
      startRace();
    }
    if (e.key === "Escape" && racing) {
      S.phase = "idle";
      stopRacing();
    }
  });
  window.addEventListener("resize", resize);
}

resize();
wire();
startLive($("live"));
load().then(() => requestAnimationFrame(frame)).catch(() => {
  $("raceInfo").textContent = "The recorded runs could not be loaded. Reload the page to try again.";
});
