/* ==========================================================================
   Maz Vantage — the growth the price already assumes

   A reverse DCF on every company, from the annual statements the report
   already loads. Demand Discovery built it as a gate on twenty-nine hand-
   picked names; its backtest found this was one of the parts that held up
   (`DEMAND_DISCOVERY_PILOT_REPORT.md` §1), and it answers the question a
   stock picker asks on any company, so it moved to the Valuation tab.

   The arithmetic is Demand Discovery's own (`impliedGrowth` and the levels in
   `demand-pricedin.ts`), so one solver and one set of cut points serve both.
   What differs is the input: annual years instead of trailing quarters.

   - **Latest margin**: free cash flow over revenue in the newest year.
   - **Through-cycle margin**: the median of that ratio over every year on
     file (up to ten), and only with at least four of them.
   - **Read the midpoint** of the two growths, as the gate does: a cyclical at
     its peak looks cheap on the latest margin and a re-rated business looks
     dear on the median, and the gap between them is the honest uncertainty.
   - **No cash through the cycle**: a business whose median free-cash margin
     is not positive reads as at least "Priced in" — the price rests on the
     current margin lasting.

   Like the fair values, this is **never an input to a grade**. It is printed
   beside the Valuation grade, not inside it.

   Not run, with the reason stated, when:
   - the company is a bank, insurer or other financial (free cash flow and
     enterprise value do not describe a balance-sheet business);
   - the statements are reported in a different currency from the price (an
     ADR), because market value and revenue would not be in the same unit;
   - the latest free-cash margin and the median are both missing or negative.
   ========================================================================== */

import { isNum } from './format';
import { impliedGrowth, PRICED_IN_ASSUMPTIONS, PRICED_IN_LEVELS, pricedInLevel, type PricedInLevel } from './demand-pricedin';

export interface ImpliedGrowthInput {
  marketCap: number | null;
  /** cash and short-term investments, newest balance sheet */
  cash: number | null;
  /** total debt, newest balance sheet */
  debt: number | null;
  /** annual revenue, oldest first */
  revenue: (number | null)[];
  /** annual free cash flow, oldest first, same years as `revenue` */
  fcf: (number | null)[];
  /** the reason to refuse, decided by the caller from fields this module does not read */
  refuse?: string | null;
}

export interface ImpliedGrowth {
  available: boolean;
  /** why it is not available, or null */
  reason: string | null;
  level: PricedInLevel;
  label: string;
  blurb: string;
  /** the midpoint the level reads */
  implied: number | null;
  atLatest: number | null;
  atThroughCycle: number | null;
  marginLatest: number | null;
  marginThroughCycle: number | null;
  /** years behind the through-cycle median */
  years: number;
  enterpriseValue: number | null;
  revenue: number | null;
  /** the business's own revenue growth a year over the last five years (or as many as there are, at least three) */
  pastGrowth: number | null;
  pastYears: number;
  noCycleCash: boolean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const empty = (reason: string): ImpliedGrowth => ({
  available: false, reason, level: 'unknown', label: 'Not measured', blurb: reason,
  implied: null, atLatest: null, atThroughCycle: null, marginLatest: null, marginThroughCycle: null,
  years: 0, enterpriseValue: null, revenue: null, pastGrowth: null, pastYears: 0, noCycleCash: false,
});

/** The ten-year revenue growth today's enterprise value implies, on the latest and the through-cycle free-cash margin. */
export function priceImpliedGrowth(input: ImpliedGrowthInput): ImpliedGrowth {
  if (input.refuse) return empty(input.refuse);
  const { marketCap, cash, debt } = input;
  if (!isNum(marketCap) || marketCap <= 0) return empty('No market value to read.');
  if (!isNum(cash) || !isNum(debt)) return empty('No cash or debt figure on the newest balance sheet.');
  const ev = marketCap + debt - cash;
  if (ev <= 0) return empty('Cash exceeds market value plus debt, so the price implies no growth to solve for.');

  const n = Math.min(input.revenue.length, input.fcf.length);
  const margins: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = input.revenue[i];
    const f = input.fcf[i];
    if (isNum(r) && r > 0 && isNum(f)) margins.push(f / r);
  }
  const rev = input.revenue[n - 1];
  const latestFcf = input.fcf[n - 1];
  if (!isNum(rev) || rev <= 0) return empty('No revenue for the newest year.');
  const marginLatest = isNum(latestFcf) ? latestFcf / rev : null;
  const marginThroughCycle = margins.length >= 4 ? median(margins) : null;

  const atLatest = isNum(marginLatest) ? impliedGrowth(ev, rev, marginLatest) : null;
  const atThroughCycle = isNum(marginThroughCycle) ? impliedGrowth(ev, rev, marginThroughCycle) : null;
  const both = [atLatest, atThroughCycle].filter(isNum) as number[];

  // Past growth, so the reader can set the ask beside the record.
  const firstPast = Math.max(0, n - 1 - 5);
  const pastYears = n - 1 - firstPast;
  const then = input.revenue[firstPast];
  const pastGrowth = pastYears >= 3 && isNum(then) && then > 0 ? (rev / then) ** (1 / pastYears) - 1 : null;

  const base = {
    atLatest, atThroughCycle, marginLatest, marginThroughCycle, years: margins.length,
    enterpriseValue: ev, revenue: rev, pastGrowth, pastYears: pastGrowth === null ? 0 : pastYears,
  };
  if (!both.length) {
    return { ...empty('The business has not produced positive free cash flow to capitalise, so no growth rate makes the price add up.'), ...base };
  }
  const implied = both.reduce((x, y) => x + y, 0) / both.length;
  const noCycleCash = isNum(marginThroughCycle) && marginThroughCycle <= 0 && isNum(atLatest);
  let level = pricedInLevel(implied);
  if (noCycleCash && (level === 'modest' || level === 'demanding')) level = 'aggressive';
  const meta = PRICED_IN_LEVELS[level as Exclude<PricedInLevel, 'unknown'>];
  return { available: true, reason: null, level, label: meta.label, blurb: meta.blurb, implied, noCycleCash, ...base };
}

export const IMPLIED_GROWTH_NOTE = `A reverse discounted cash flow: the constant revenue growth a year, for ten years, that makes `
  + `today's enterprise value (market value plus debt, less cash) equal to the free cash flow that growth would produce, discounted at `
  + `${PRICED_IN_ASSUMPTIONS.discountRate * 100}% with ${PRICED_IN_ASSUMPTIONS.terminalGrowth * 100}% growth after year ten. `
  + `Solved on the newest year's free-cash margin and on the median across the years on file; the midpoint is read. `
  + `Ten years at 8% is ordinary for a good business, 15% demanding, above 25% very few large companies have done. `
  + `It does not feed the Valuation grade.`;
