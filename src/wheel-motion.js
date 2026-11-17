export function wheelProgress(elapsed, acceleration = 0.24, cruise = 0.12) {
  const t = Math.max(0, Math.min(1, elapsed));
  const a = acceleration;
  const c = cruise;
  const d = 1 - a - c;
  const area = (a + d) / 2 + c;
  if (t < a) {
    const x = t / a;
    return (a * (x / 2 - Math.sin(Math.PI * x) / (2 * Math.PI))) / area;
  }
  if (t < a + c) return (a / 2 + t - a) / area;
  const x = (t - a - c) / d;
  return (
    (a / 2 + c + d * (x / 2 + Math.sin(Math.PI * x) / (2 * Math.PI))) / area
  );
}
