/* The axis arithmetic every chart shares — ported from the legacy `charts.js`
   so the rebuilt charts put their gridlines on the same friendly values. */

import { isNum } from './format';

export interface NiceDomain {
  lo: number;
  hi: number;
  step: number;
}

/** Round a domain out to friendly tick values. */
export function niceDomain(min: number, max: number, ticks = 5): NiceDomain {
  if (!isNum(min) || !isNum(max)) return { lo: 0, hi: 1, step: 0.25 };
  if (min === max) {
    min -= Math.abs(min || 1) * 0.1;
    max += Math.abs(max || 1) * 0.1;
  }
  const span = max - min;
  const raw = span / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

export function ticksOf({ lo, hi, step }: NiceDomain): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi + step * 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) => {
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
};

/** The index of the charted point nearest a date, or null when out of range. */
export function nearestIndex(pts: { date: string }[], date: string): number | null {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t) || !pts.length) return null;
  const first = new Date(pts[0].date).getTime();
  const last = new Date(pts[pts.length - 1].date).getTime();
  // A day of slack at each end: a Form 4 dated on a weekend or a holiday sits
  // just outside a series of closes and should still land on the chart.
  if (t < first - 4 * 864e5 || t > last + 4 * 864e5) return null;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (new Date(pts[mid].date).getTime() < t) lo = mid + 1; else hi = mid;
  }
  const prev = Math.max(0, lo - 1);
  const dPrev = Math.abs(new Date(pts[prev].date).getTime() - t);
  const dLo = Math.abs(new Date(pts[lo].date).getTime() - t);
  return dPrev < dLo ? prev : lo;
}
