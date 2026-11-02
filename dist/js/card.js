// The share card: a 1200 x 630 PNG drawn on a canvas, saved by the player.
import { outcome, raceWhen, boutLine, inputPhrase } from "./race.js";

export function drawCard(canvas, { race, you, him, url, colors, used = [] }) {
  const c = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  c.fillStyle = colors.bg;
  c.fillRect(0, 0, W, H);
  c.fillStyle = colors.him;
  c.fillRect(0, 0, 14, H);

  c.fillStyle = colors.muted;
  c.font = "600 28px system-ui, sans-serif";
  c.fillText("GHOST WHEEL", 70, 86);
  c.fillStyle = colors.text;
  c.font = "700 46px system-ui, sans-serif";
  c.fillText(`${race.title}`, 70, 150);
  c.fillStyle = colors.muted;
  c.font = "400 30px system-ui, sans-serif";
  c.fillText(`Squeektoshi's real run, ${raceWhen(race)}`, 70, 196);

  c.font = "800 120px system-ui, sans-serif";
  c.fillStyle = colors.you;
  c.fillText(String(you), 70, 360);
  const youW = c.measureText(String(you)).width;
  c.fillStyle = colors.muted;
  c.font = "400 34px system-ui, sans-serif";
  c.fillText("you", 80 + youW, 360);
  c.font = "800 120px system-ui, sans-serif";
  c.fillStyle = colors.him;
  c.fillText(String(him), 560, 360);
  const himW = c.measureText(String(him)).width;
  c.fillStyle = colors.muted;
  c.font = "400 34px system-ui, sans-serif";
  c.fillText("Squeektoshi", 570 + himW, 360);
  if (used.length) {
    c.font = "400 26px system-ui, sans-serif";
    c.fillText(fit(c, `with ${inputPhrase(used)}`, 470), 70, 398);
  }

  c.fillStyle = colors.text;
  c.font = "700 40px system-ui, sans-serif";
  c.fillText(`${outcome(you, him).headline} (passages in 30 s)`, 70, 450);

  c.fillStyle = colors.muted;
  c.font = "400 26px system-ui, sans-serif";
  const blocks = race.blocks.map((b) => `#${b.block}`).join(", ");
  const blocksText = blocks ? `His real Squeek blocks in this window: ${blocks}` : "No Squeek block completed in this window.";
  c.fillText(fit(c, blocksText, W - 140), 70, 500);
  c.fillText(fit(c, boutLine(race), W - 140), 70, 536);
  c.font = "400 21px system-ui, sans-serif";
  c.fillText("Runs recorded by the device, not certified by SqueekCore. Blocks read from SqueekCore on Sepolia.", 70, 576);
  c.fillStyle = colors.him;
  c.fillText(fit(c, url, W - 140), 70, 606);
}

function fit(c, text, max) {
  if (c.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 8 && c.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export function saveCard(canvas, name) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(false);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
      resolve(true);
    }, "image/png");
  });
}
