// Peak simultaneous usage inside the requested interval. Adjacent events do
// not consume two staff members when the first ends as the next one starts.
export function peakResourceUsage(start, duration, windows) {
  const peak = { animadores: 0, payasos: 0 };
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return peak;
  const points = new Map();
  const add = (time, resources, direction) => {
    if (!points.has(time)) points.set(time, { animadores: 0, payasos: 0 });
    const point = points.get(time);
    for (const key of Object.keys(peak)) {
      const count = Number(resources[key]);
      point[key] += direction * (Number.isFinite(count) ? Math.max(0, count) : 0);
    }
  };
  for (const window of windows) {
    if (!Number.isFinite(window.start) || !Number.isFinite(window.duration)) continue;
    const from = Math.max(start, window.start);
    const to = Math.min(start + duration, window.start + window.duration);
    if (from >= to) continue;
    add(from, window, 1);
    add(to, window, -1);
  }
  const current = { animadores: 0, payasos: 0 };
  for (const [, delta] of [...points].sort(([a], [b]) => a - b)) {
    for (const key of Object.keys(peak)) {
      current[key] += delta[key];
      peak[key] = Math.max(peak[key], current[key]);
    }
  }
  return peak;
}
