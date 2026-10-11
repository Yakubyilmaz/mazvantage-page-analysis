/* ==========================================================================
   Maz Vantage — Demand Discovery: the bull and bear case from the newest quarter

   The engine's thesis and bear lines read trends: two quarters against four,
   twenty quarters of cash margin. This reads one thing only — the newest
   filed quarter — and says what it shows for and against the company, each
   line a filed figure against the same quarter a year earlier (or the
   quarter before, where it says so).

   Every line has a stated threshold and lands on one side. A figure inside
   the dead band (revenue up 2%, margin flat) is left out rather than argued
   either way, because "flat" is not a case.
   ========================================================================== */

import { isNum } from './format';
import { daysBetween, type Quarter } from './demand-data';
import { inventoryDays, yoyQuarter } from './demand-metrics';

export interface QuarterCase {
  /** period end of the newest quarter */
  quarter: string;
  filed: string;
  bull: string[];
  bear: string[];
}

/** The thresholds, printed on the page so a reader can argue with them. */
export const CASE_BANDS = {
  /** revenue growth on a year earlier at or above which it argues for the company */
  revenueFor: 0.05,
  /** margin change, in points, that counts either way */
  marginPts: 0.01,
  /** free-cash-flow margin at or above which cash generation argues for it */
  cashFor: 0.15,
  /** prepayment growth that counts either way, when prepayments are at least 2% of quarterly revenue */
  prepayments: 0.2,
  /** inventory-days change that counts: building argues against, falling for */
  inventoryBuild: 0.15,
  inventoryFall: 0.1,
  /** capex growth beyond revenue growth, in points, that argues against (when capex is at least 5% of revenue) */
  capexOverRevenue: 0.2,
} as const;

const money = (m: number) => {
  const a = Math.abs(m);
  const s = a >= 1000 ? `$${(a / 1000).toFixed(a >= 10000 ? 1 : 2)}bn` : `$${a.toFixed(a >= 100 ? 0 : 1)}m`;
  return m < 0 ? `−${s}` : s;
};
const pct = (v: number) => `${(Math.abs(v) * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%`;
const pts = (v: number) => `${(Math.abs(v) * 100).toFixed(1)} points`;
const ratio = (a: number | null, b: number | null) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);

/** The newest quarter's case, both ways. Null when there is no quarter with revenue. */
export function latestQuarterCase(qs: Quarter[]): QuarterCase | null {
  const i = qs.length - 1;
  if (i < 0 || !isNum(qs[i].rev)) return null;
  const q = qs[i];
  // The same quarter a year earlier, only when the filings really are a year apart.
  const back = i >= 4 ? qs[i - 4] : null;
  const yearAgo = back && daysBetween(back.date, q.date) >= 330 && daysBetween(back.date, q.date) <= 400 ? back : null;
  const before = i >= 1 ? qs[i - 1] : null;
  const prev = before && daysBetween(before.date, q.date) <= 100 ? before : null;
  const bull: string[] = [];
  const bear: string[] = [];
  const b = CASE_BANDS;

  // Revenue, on a year earlier and on the quarter before.
  const g = yoyQuarter(qs, i, 'rev');
  if (isNum(g)) {
    const line = `Revenue ${money(q.rev!)}, ${g >= 0 ? 'up' : 'down'} ${pct(g)} on the same quarter a year earlier.`;
    if (g >= b.revenueFor) bull.push(line);
    else if (g < 0) bear.push(line);
  }
  if (prev && isNum(prev.rev) && prev.rev > 0) {
    const s = q.rev! / prev.rev - 1;
    if (s <= -0.03) bear.push(`Revenue fell ${pct(s)} on the quarter before.`);
    else if (s >= 0.1) bull.push(`Revenue rose ${pct(s)} on the quarter before.`);
  }

  // Margins against a year earlier.
  const gm = ratio(q.gp, q.rev);
  const gm0 = yearAgo ? ratio(yearAgo.gp, yearAgo.rev) : null;
  if (isNum(gm) && isNum(gm0)) {
    const d = gm - gm0;
    const line = `Gross margin ${(gm * 100).toFixed(1)}%, ${d >= 0 ? 'up' : 'down'} ${pts(d)} on a year earlier.`;
    if (d >= b.marginPts) bull.push(line);
    else if (d <= -b.marginPts) bear.push(line);
  }
  const om = ratio(q.oi, q.rev);
  const om0 = yearAgo ? ratio(yearAgo.oi, yearAgo.rev) : null;
  if (isNum(om) && isNum(om0)) {
    const d = om - om0;
    const line = `Operating margin ${(om * 100).toFixed(1)}%, ${d >= 0 ? 'up' : 'down'} ${pts(d)} on a year earlier.`;
    if (d >= b.marginPts) bull.push(line);
    else if (d <= -b.marginPts) bear.push(line);
  }
  if (isNum(q.ni) && q.ni < 0) bear.push(`A net loss of ${money(-q.ni)}.`);

  // Cash: operating cash flow less capital spending.
  if (isNum(q.ocf) && isNum(q.capex)) {
    const fcf = q.ocf - q.capex;
    const m = fcf / q.rev!;
    if (fcf < 0) bear.push(`Spent ${money(-fcf)} more than operations brought in (operating cash flow ${money(q.ocf)}, capital spending ${money(q.capex)}).`);
    else if (m >= b.cashFor) bull.push(`Free cash flow ${money(fcf)}, ${pct(m)} of revenue.`);
  }

  // Customer prepayments, when they are material.
  if (yearAgo && isNum(q.cl) && isNum(yearAgo.cl) && yearAgo.cl > 0 && q.cl >= 0.02 * q.rev!) {
    const c = q.cl / yearAgo.cl - 1;
    if (c >= b.prepayments) bull.push(`Customer prepayments and deferred revenue ${money(q.cl)}, up ${pct(c)} on a year earlier: customers paying ahead.`);
    else if (c <= -b.prepayments) bear.push(`Customer prepayments and deferred revenue ${money(q.cl)}, down ${pct(c)} on a year earlier.`);
  }

  // Inventory days against a year earlier.
  const d1 = inventoryDays(q);
  const d0 = yearAgo ? inventoryDays(yearAgo) : null;
  if (isNum(d1) && isNum(d0) && d0 > 0) {
    const c = d1 / d0 - 1;
    if (c >= b.inventoryBuild) bear.push(`Inventory covers ${Math.round(d1)} days of costs against ${Math.round(d0)} a year earlier: goods are building up.`);
    else if (c <= -b.inventoryFall) bull.push(`Inventory covers ${Math.round(d1)} days of costs against ${Math.round(d0)} a year earlier: goods are leaving faster.`);
  }

  // Capacity spending running ahead of sales, at a company that builds capacity.
  const cg = yoyQuarter(qs, i, 'capex');
  if (isNum(cg) && isNum(g) && isNum(q.capex) && q.capex >= 0.05 * q.rev! && cg - g >= b.capexOverRevenue) {
    bear.push(`Capital spending ${money(q.capex)}, up ${pct(cg)} on a year earlier against revenue ${g >= 0 ? 'up' : 'down'} ${pct(g)}: capacity is being added faster than sales grow.`);
  }

  return { quarter: q.date, filed: q.filed, bull, bear };
}
