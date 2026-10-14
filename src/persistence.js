const between = (n, low, high) => Number.isFinite(n) && n >= low && n <= high;
const validSession = (s) =>
  s &&
  typeof s.id === "string" &&
  typeof s.device === "string" &&
  ["demo", "estimate", "sensor"].includes(s.mode) &&
  between(s.start, 0, Number.MAX_SAFE_INTEGER) &&
  between(s.kwh, 0, Number.MAX_SAFE_INTEGER) &&
  between(s.seconds, 0, Number.MAX_SAFE_INTEGER) &&
  between(s.peak, 0, 10000) &&
  Array.isArray(s.points) &&
  s.points.every(
    (p) =>
      between(p.time, 0, Number.MAX_SAFE_INTEGER) &&
      between(p.watts, 0, 10000) &&
      between(p.seconds, 0, Number.MAX_SAFE_INTEGER) &&
      between(p.kwh, 0, Number.MAX_SAFE_INTEGER),
  );

export function restoreState(raw) {
  try {
    const v = JSON.parse(raw);
    const s = v?.settings;
    if (
      v?.version !== 1 ||
      !s ||
      !["INR", "USD", "EUR", "GBP", "JPY", "AED"].includes(s.currency) ||
      typeof s.device !== "string" ||
      s.device.length > 40 ||
      !between(s.rate, 0, 100000) ||
      !between(s.watts, 1, 10000) ||
      !between(s.budget, 1, 10000000) ||
      !between(s.hours, 0.5, 24) ||
      !validSession(v.session) ||
      !Array.isArray(v.history) ||
      v.history.length > 49 ||
      !v.history.every(validSession)
    )
      return null;
    return v;
  } catch {
    return null;
  }
}
