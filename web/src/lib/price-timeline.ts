/* ==========================================================================
   Maz Vantage — the price change timeline

   The change in a company's price over a ladder of periods — a week, a
   month, three and six, the year to date, one, three and five years, and
   everything loaded — read off the closes the report already holds. No
   request is made for it.

   **Same arithmetic as the Momentum tab.** A period's base is the last close
   on or before the start date, the start counted back in days from the last
   close (`RETURN_SPANS`), with the same 90% allowance when the series begins
   a few days inside the window; the year to date opens on the last close of
   the previous year. So "1Y" here and the one-year return on the Momentum
   tab are one number, which `tests/price-timeline.test.ts` holds them to.

   A period the loaded history cannot reach is not shown as a shorter one
   under a longer name: it is unavailable, and says from when the history
   runs.
   ========================================================================== */

import { isNum } from './format';
import { RETURN_SPANS } from './model';

export interface PricePoint { date: string; price: number }

export type PeriodKey = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL';

export interface PeriodDef { key: PeriodKey; label: string; long: string; days: number | null }

export const PERIODS: PeriodDef[] = [
  { key: '1W', label: '1W', long: 'past week', days: RETURN_SPANS['7D'] },
  { key: '1M', label: '1M', long: 'past month', days: RETURN_SPANS['1M'] },
  { key: '3M', label: '3M', long: 'past three months', days: RETURN_SPANS['3M'] },
  { key: '6M', label: '6M', long: 'past six months', days: RETURN_SPANS['6M'] },
  { key: 'YTD', label: 'YTD', long: 'year to date', days: null },
  { key: '1Y', label: '1Y', long: 'past year', days: RETURN_SPANS['1Y'] },
  { key: '3Y', label: '3Y', long: 'past three years', days: RETURN_SPANS['3Y'] },
  { key: '5Y', label: '5Y', long: 'past five years', days: RETURN_SPANS['5Y'] },
  { key: 'ALL', label: 'All', long: 'all loaded history', days: null },
];

export interface PeriodChange extends PeriodDef {
  available: boolean;
  /** the close the change is measured from, and the last close */
  from: PricePoint | null;
  to: PricePoint | null;
  change: number | null;
  pct: number | null;
  /** the closes from `from` to the end — what the chart draws */
  window: PricePoint[];
  /** true when the base is the first close loaded rather than one on or before the start (the 90% allowance) */
  approx: boolean;
}

const t = (d: string) => new Date(d).getTime();

/** Index of the base close for one period, and whether it is the 90% allowance. */
function baseIndex(pts: PricePoint[], def: PeriodDef): { i: number; approx: boolean } | null {
  const last = pts[pts.length - 1];
  const lastT = t(last.date);
  if (def.key === 'ALL') return { i: 0, approx: false };

  let target: number;
  if (def.key === 'YTD') {
    // As `ytdReturn`: the last close on or before 1 January of the last close's year.
    target = new Date(new Date(last.date).getUTCFullYear(), 0, 1).getTime();
  } else {
    target = lastT - (def.days as number) * 864e5;
  }
  let ref = -1;
  for (let i = 0; i < pts.length; i += 1) { if (t(pts[i].date) <= target) ref = i; else break; }
  if (ref >= 0) return ref < pts.length - 1 ? { i: ref, approx: false } : null;

  if (def.key === 'YTD') {
    // `ytdReturn` falls back to the first close of the year.
    const first = pts.findIndex((p) => t(p.date) >= target);
    return first >= 0 && first < pts.length - 1 ? { i: first, approx: true } : null;
  }
  // `computeReturns`' allowance: a series starting a few days inside the window still quotes it.
  return lastT - t(pts[0].date) >= (def.days as number) * 0.9 * 864e5 ? { i: 0, approx: true } : null;
}

/** Every period's change over the loaded closes, oldest data first. */
export function priceTimeline(series: readonly { date: string; price: number | null | undefined }[]): PeriodChange[] {
  const pts = series.filter((p): p is PricePoint => !!p.date && isNum(p.price) && p.price > 0);
  return PERIODS.map((def) => {
    const none: PeriodChange = { ...def, available: false, from: null, to: null, change: null, pct: null, window: [], approx: false };
    if (pts.length < 2) return none;
    const base = baseIndex(pts, def);
    if (!base) return none;
    const from = pts[base.i];
    const to = pts[pts.length - 1];
    return {
      ...def, available: true, from, to,
      change: to.price - from.price,
      pct: to.price / from.price - 1,
      window: pts.slice(base.i),
      approx: base.approx,
    };
  });
}
