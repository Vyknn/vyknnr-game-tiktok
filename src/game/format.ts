/** 12345 → "12.3K". Used for HP and big numbers on stream. */
export function compact(n: number): string {
  const a = Math.abs(n);
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, s] of units) if (a >= v) return `${(n / v).toFixed(a >= v * 100 ? 0 : 1)}${s}`;
  return `${Math.ceil(n)}`;
}
