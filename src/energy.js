export const DEFAULT_SETTINGS = {
  currency: "INR",
  rate: 8,
  watts: 65,
  budget: 500,
  hours: 8,
  device: "My laptop",
};
export function energyFor(watts, seconds) {
  return (Math.max(0, watts) * Math.max(0, seconds)) / 3600000;
}
export function costFor(kwh, rate) {
  return kwh * rate;
}
export function money(value, currency = "INR", digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
export function duration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${Math.floor(seconds % 60)}s`;
}
export function demoWatts(t) {
  return Math.max(
    16,
    49 + 12 * Math.sin(t / 15) + 6 * Math.sin(t / 3.4) + 5 * Math.cos(t / 7),
  );
}
export function makeDemo(now = Date.now()) {
  const points = Array.from({ length: 360 }, (_, i) => {
    const watts = demoWatts(i * 2.4);
    return {
      time: now - (359 - i) * 60000,
      watts,
      seconds: 60,
      kwh: energyFor(watts, 60),
    };
  });
  return {
    id: "demo",
    mode: "demo",
    start: now - 21600000,
    points,
    kwh: points.reduce((sum, p) => sum + p.kwh, 0),
    seconds: 21600,
    peak: Math.max(...points.map((p) => p.watts)),
    device: "My laptop",
  };
}
export function aggregate(points, interval) {
  const size = { Second: 1000, Minute: 60000, Hour: 3600000 }[interval];
  const buckets = new Map();
  for (const p of points) {
    const time = Math.floor(p.time / size) * size;
    const b = buckets.get(time) || { time, weighted: 0, seconds: 0, kwh: 0 };
    b.weighted += p.watts * p.seconds;
    b.seconds += p.seconds;
    b.kwh += p.kwh;
    buckets.set(time, b);
  }
  return [...buckets.values()]
    .sort((a, b) => a.time - b.time)
    .map((b) => ({
      time: b.time,
      watts: b.seconds ? b.weighted / b.seconds : 0,
      kwh: b.kwh,
    }));
}
// Keep one-second detail for 10 minutes; compact older samples into minutes (up to 7 days).
export function compactPoints(points, now) {
  if (points.length < 1800) return points;
  const cutoff = now - 600000;
  const old = new Map();
  const recent = [];
  for (const p of points) {
    if (p.time >= cutoff) {
      recent.push(p);
      continue;
    }
    if (p.time < now - 7 * 86400000) continue;
    const key = Math.floor(p.time / 60000) * 60000;
    const b = old.get(key) || {
      time: key,
      watts: 0,
      seconds: 0,
      kwh: 0,
      weight: 0,
    };
    b.weight += p.watts * p.seconds;
    b.seconds += p.seconds;
    b.kwh += p.kwh;
    old.set(key, b);
  }
  return [...old.values()]
    .map(({ weight, ...b }) => ({ ...b, watts: weight / b.seconds }))
    .concat(recent);
}
export function csvFor(sessions, settings) {
  const escape = (v) => `"${String(v).replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [
      "Session,Source,Time,Watts,Sample seconds,Energy (kWh),Cost,Currency",
      ...sessions.flatMap((s) =>
        s.points.map((p) =>
          [
            s.id,
            s.mode,
            new Date(p.time).toISOString(),
            p.watts.toFixed(3),
            p.seconds.toFixed(3),
            p.kwh.toFixed(9),
            costFor(p.kwh, settings.rate).toFixed(8),
            settings.currency,
          ]
            .map(escape)
            .join(","),
        ),
      ),
    ].join("\n")
  );
}
