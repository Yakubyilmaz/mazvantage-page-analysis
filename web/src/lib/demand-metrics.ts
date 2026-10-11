/* ==========================================================================
   Maz Vantage — Demand Discovery: the measurements on one company

   Plain arithmetic over filed quarters. No scores here and no opinions:
   each function returns a number with the inputs that made it, or null when
   the inputs are missing, so the layer that scores (`demand-cycle.ts`) can
   drop a measurement rather than score it zero.

   Two guards run under everything, because quarterly data breaks quietly:

   - **Consecutive means consecutive.** A trailing twelve months is four
     quarters whose period ends are 60–120 days apart. A gap (a missed
     filing, a change of fiscal year) makes the sum null instead of summing
     three quarters and calling it a year.
   - **Year-on-year means a year.** The comparison quarter must end 330–400
     days earlier. Fiscal calendars of 52/53 weeks drift by days, not months.

   Growth on a negative or zero base is undefined and returned as null —
   "up 400% from a loss" is not a growth rate.
   ========================================================================== */

import { isNum, mean, median } from './format';
import { daysBetween, type Quarter } from './demand-data';

type Key = 'rev' | 'gp' | 'oi' | 'ni' | 'inv' | 'cl' | 'cash' | 'debt' | 'ocf' | 'capex';

const consecutive = (a: Quarter, b: Quarter) => {
  const d = daysBetween(a.date, b.date);
  return d >= 60 && d <= 120;
};

const yearApart = (a: Quarter, b: Quarter) => {
  const d = daysBetween(a.date, b.date);
  return d >= 330 && d <= 400;
};

const growth = (now: number | null, base: number | null) =>
  (isNum(now) && isNum(base) && base > 0 ? now / base - 1 : null);

/** Sum of four consecutive quarters ending at `i`. */
export function ttm(qs: Quarter[], i: number, key: Key): number | null {
  if (i < 3 || i >= qs.length) return null;
  let total = 0;
  for (let k = i - 3; k <= i; k++) {
    const v = qs[k][key];
    if (!isNum(v)) return null;
    if (k > i - 3 && !consecutive(qs[k - 1], qs[k])) return null;
    total += v;
  }
  return total;
}

/** One quarter against the same quarter a year earlier. */
export function yoyQuarter(qs: Quarter[], i: number, key: Key): number | null {
  if (i < 4 || i >= qs.length || !yearApart(qs[i - 4], qs[i])) return null;
  return growth(qs[i][key], qs[i - 4][key]);
}

/** Trailing twelve months against the twelve before. */
export function ttmGrowth(qs: Quarter[], i: number, key: Key): number | null {
  if (i < 7) return null;
  if (!yearApart(qs[i - 4], qs[i])) return null;
  return growth(ttm(qs, i, key), ttm(qs, i - 4, key));
}

export interface GrowthProfile {
  /** mean year-on-year growth of the two newest quarters */
  recent: number | null;
  /** mean year-on-year growth of the four quarters before those */
  base: number | null;
  /** recent − base, in fractional points (0.10 = ten percentage points) */
  acceleration: number | null;
  /** trailing twelve months against the twelve before */
  ttmGrowth: number | null;
  /** quarterly year-on-year growth, oldest first, for a chart */
  series: { date: string; yoy: number | null }[];
  latest: string | null;
}

/**
 * Is growth speeding up?
 *
 * The spec asks for "latest growth rate minus multi-year average growth
 * rate". Read literally on single quarters that is noise: one lumpy quarter
 * swings it twenty points. So "latest" is the mean of the two newest
 * quarters' year-on-year growth and "average" the mean of the four before —
 * six quarters of evidence for one number, and a single odd quarter moves
 * it by half as much.
 */
export function growthProfile(qs: Quarter[], key: Key = 'rev'): GrowthProfile {
  const n = qs.length;
  const at = (back: number) => yoyQuarter(qs, n - 1 - back, key);
  const r = [at(0), at(1)];
  const b = [at(2), at(3), at(4), at(5)].filter(isNum);
  const recent = r.every(isNum) ? (r[0]! + r[1]!) / 2 : null;
  const base = b.length >= 3 ? mean(b) : null;
  const series = qs.slice(-12).map((q, k) => ({ date: q.date, yoy: yoyQuarter(qs, n - Math.min(12, n) + k, key) }));
  return {
    recent,
    base,
    acceleration: isNum(recent) && isNum(base) ? recent - base : null,
    ttmGrowth: ttmGrowth(qs, n - 1, key),
    series,
    latest: n ? qs[n - 1].date : null,
  };
}

/** Gross margin of quarters `[i-1, i]` combined. */
function grossMarginPair(qs: Quarter[], i: number): number | null {
  if (i < 1) return null;
  const a = qs[i - 1];
  const b = qs[i];
  if (!consecutive(a, b) || !isNum(a.rev) || !isNum(b.rev) || !isNum(a.gp) || !isNum(b.gp)) return null;
  const rev = a.rev + b.rev;
  return rev > 0 ? (a.gp + b.gp) / rev : null;
}

/**
 * Pricing power, read off the income statement: the gross margin of the
 * two newest quarters against the same two quarters a year earlier. A seller
 * whose margin widens while volume grows is being paid more for each unit —
 * the signature of demand outrunning supply.
 */
export function grossMarginShift(qs: Quarter[]) {
  const n = qs.length;
  if (n < 6 || !yearApart(qs[n - 5], qs[n - 1])) return { now: null, yearAgo: null, shift: null };
  const now = grossMarginPair(qs, n - 1);
  const yearAgo = grossMarginPair(qs, n - 5);
  return { now, yearAgo, shift: isNum(now) && isNum(yearAgo) ? now - yearAgo : null };
}

/** Days of cost of sales the inventory would cover. Null when the company carries none. */
export function inventoryDays(q: Quarter): number | null {
  if (!isNum(q.inv) || q.inv <= 0 || !isNum(q.rev) || !isNum(q.gp)) return null;
  const cogs = q.rev - q.gp;
  return cogs > 0 ? (q.inv / cogs) * 91.25 : null;
}

/** Inventory days now against a year earlier, as a fraction (−0.3 = 30% fewer days). */
export function inventoryShift(qs: Quarter[]) {
  const n = qs.length;
  if (n < 5 || !yearApart(qs[n - 5], qs[n - 1])) return { now: null, yearAgo: null, change: null };
  const now = inventoryDays(qs[n - 1]);
  const yearAgo = inventoryDays(qs[n - 5]);
  return { now, yearAgo, change: isNum(now) && isNum(yearAgo) && yearAgo > 0 ? now / yearAgo - 1 : null };
}

/**
 * Customer prepayments: contract liabilities now against a year earlier.
 *
 * Only read when the balance is material — at least 1% of trailing revenue
 * at both ends. Below that, a change from $2m to $9m is a 350% "surge" that
 * means nothing. The field is also tagged inconsistently by filers (a
 * balance can move between "deferred revenue" and "other liabilities" from
 * one quarter to the next), which is why the scoring layer gives it the
 * least weight of the five shortage tests.
 */
export function contractLiabilityGrowth(qs: Quarter[]) {
  const n = qs.length;
  if (n < 8 || !yearApart(qs[n - 5], qs[n - 1])) return { now: null, yearAgo: null, growth: null };
  const now = qs[n - 1].cl;
  const yearAgo = qs[n - 5].cl;
  const revNow = ttm(qs, n - 1, 'rev');
  const revThen = ttm(qs, n - 5, 'rev');
  const material = isNum(now) && isNum(yearAgo) && isNum(revNow) && isNum(revThen)
    && now >= 0.01 * revNow && yearAgo >= 0.01 * revThen;
  return { now, yearAgo, growth: material ? growth(now, yearAgo) : null };
}

/**
 * Capital spending: its growth, and how heavy it is against the company's
 * own recent history.
 *
 * Capex is where a company says what it believes about demand before the
 * demand arrives — and, at the other end of a cycle, where a whole industry
 * builds the capacity that floods it. `intensityVsHistory` is trailing
 * capex/revenue divided by the mean of the same ratio one, two and three
 * years earlier: above 1 the company is spending more of each dollar of
 * sales on capacity than it used to.
 */
export function capexProfile(qs: Quarter[]) {
  const n = qs.length;
  const i = n - 1;
  const capexNow = ttm(qs, i, 'capex');
  const revNow = ttm(qs, i, 'rev');
  const intensity = isNum(capexNow) && isNum(revNow) && revNow > 0 ? capexNow / revNow : null;
  const past = [4, 8, 12].map((k) => {
    const c = ttm(qs, i - k, 'capex');
    const r = ttm(qs, i - k, 'rev');
    return isNum(c) && isNum(r) && r > 0 ? c / r : null;
  }).filter(isNum) as number[];
  const history = past.length >= 2 ? mean(past) : null;
  return {
    ttm: capexNow,
    growth: ttmGrowth(qs, i, 'capex'),
    intensity,
    intensityHistory: history,
    intensityVsHistory: isNum(intensity) && isNum(history) && history > 0 ? intensity / history : null,
  };
}

/**
 * Free-cash-flow margin, trailing and through the cycle.
 *
 * `throughCycle` is the median trailing-twelve-month margin over up to the
 * last twenty quarters — five years, roughly one semiconductor or commodity
 * cycle. A reverse DCF on the peak margin of a cyclical makes it look cheap
 * at exactly the wrong moment; on the trough margin, expensive at the right
 * one. The median of a cycle is the least-bad single number.
 */
export function cashMargins(qs: Quarter[]) {
  const n = qs.length;
  const margins: number[] = [];
  for (let i = Math.max(3, n - 20); i < n; i++) {
    const ocf = ttm(qs, i, 'ocf');
    const capex = ttm(qs, i, 'capex');
    const rev = ttm(qs, i, 'rev');
    if (isNum(ocf) && isNum(capex) && isNum(rev) && rev > 0) margins.push((ocf - capex) / rev);
  }
  const ocf = ttm(qs, n - 1, 'ocf');
  const capex = ttm(qs, n - 1, 'capex');
  const rev = ttm(qs, n - 1, 'rev');
  const oi = ttm(qs, n - 1, 'oi');
  return {
    fcfTtm: isNum(ocf) && isNum(capex) && isNum(rev) && rev > 0 ? (ocf - capex) / rev : null,
    throughCycle: margins.length >= 4 ? median(margins) : null,
    windows: margins.length,
    operatingTtm: isNum(oi) && isNum(rev) && rev > 0 ? oi / rev : null,
    revenueTtm: rev,
  };
}

/** Net cash (cash less debt) as a share of trailing revenue. */
export function netCash(qs: Quarter[]) {
  const n = qs.length;
  if (!n) return { cash: null, debt: null, netCash: null, toRevenue: null };
  const q = qs[n - 1];
  const rev = ttm(qs, n - 1, 'rev');
  const net = isNum(q.cash) && isNum(q.debt) ? q.cash - q.debt : null;
  return { cash: q.cash, debt: q.debt, netCash: net, toRevenue: isNum(net) && isNum(rev) && rev > 0 ? net / rev : null };
}

/** Compound annual growth of trailing revenue over `years`. */
export function revenueCagr(qs: Quarter[], years: number): number | null {
  const n = qs.length;
  const now = ttm(qs, n - 1, 'rev');
  const then = ttm(qs, n - 1 - 4 * years, 'rev');
  if (!isNum(now) || !isNum(then) || then <= 0 || now <= 0) return null;
  return (now / then) ** (1 / years) - 1;
}
