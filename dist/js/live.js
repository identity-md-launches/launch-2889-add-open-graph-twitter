// The "Live" chip: is his wheel turning right now? Reads the public pipeline status
// (GET https://api.squeekchain.com/v1/status), which the docs say to poll "to show
// whether the wheel is turning". Anything unavailable is shown as unknown, never as zero.

export const STATUS_URL = "https://api.squeekchain.com/v1/status";
export const POLL_MS = 15000;

export function describeStatus(body) {
  const m = body && body.measurement;
  if (!m || body.status === "unavailable") {
    return { state: "unknown", text: "Live: unknown right now" };
  }
  if (m.freshness !== "online") {
    return { state: "unknown", text: "Live: no fresh reading from his wheel" };
  }
  if (m.coreStatus === "COUNTER_FAULT") {
    return { state: "unknown", text: "Live: the device reports a counter fault" };
  }
  // Only readings from his wheel's own sensor say anything about him; the API also
  // documents "simulated", "replay" and "derived" data.
  if (m.provenance !== "hardware") {
    return { state: "unknown", text: m.provenance ? `Live: unknown (the feed is labelled "${m.provenance}")` : "Live: unknown right now" };
  }
  // The speed says whether the wheel is turning. coreStatus is only the "Device state: IDLE,
  // ACTIVE or COUNTER_FAULT", and it reads IDLE while he runs: the docs' own example shows
  // IDLE at 77 rpm, and so did the live feed at 66 to 73 rpm on 31 Oct, 21:47 to 21:48 UTC.
  const rpm = Math.round((m.rpmMilli || 0) / 1000);
  if (rpm > 0) {
    return { state: "running", text: `Live: his wheel is turning, ${rpm} rpm` };
  }
  return { state: "resting", text: "Live: resting. His care policy never forces or encourages running." };
}

export function startLive(el, fetchImpl = fetch) {
  let timer = null;
  async function poll() {
    let view;
    try {
      const r = await fetchImpl(STATUS_URL, { cache: "no-cache" });
      view = r.ok ? describeStatus(await r.json()) : describeStatus(null);
    } catch {
      view = describeStatus(null);
    }
    el.textContent = view.text;
    el.dataset.state = view.state;
    timer = setTimeout(poll, document.hidden ? POLL_MS * 4 : POLL_MS);
  }
  poll();
  return () => clearTimeout(timer);
}
