// Small clicks for passages and a soft chime for his real blocks. Off until a tap starts it,
// as browsers require.
let ctx = null;
let on = true;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function setSound(value) {
  on = value;
}

function blip(freq, dur, gain, delay = 0) {
  if (!on || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const clickYou = () => blip(1760, 0.05, 0.12);
export const clickHim = () => blip(880, 0.06, 0.1);
export const chime = () => {
  blip(1318.5, 0.25, 0.08);
  blip(1975.5, 0.35, 0.06, 0.09);
};
