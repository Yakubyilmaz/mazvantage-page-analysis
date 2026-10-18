/* ==========================================================================
   Maz Vantage — what management said, against what it delivered

   Two records, read by hand from primary sources, and the arithmetic over
   them:

   - **guidance**: each quarter's outlook as given on the earnings call
     (revenue, and gross margin), against the result reported a quarter
     later. A company that clears the top of its range every time is guiding
     conservatively, and the next guide should be read with that habit;
   - **pay**: what the proxy statement says executives are paid to deliver,
     the goals set and what was achieved. A target set at last year's level
     pays for standing still.

   Sources: earnings call transcripts (read 2026-10-12) and the companies'
   DEF 14A proxy statements on EDGAR. Where the company guides in words
   ("low to mid single digits"), the band given here is our reading of the
   words, and is labelled so. Results are the reported figures; growth is
   computed from the filed quarters. Nothing here enters a grade.
   ========================================================================== */

import { isNum, median } from './format';

export interface Range { low: number; high: number; words?: string; ours?: boolean }

export interface GuideRecord {
  symbol: string;
  /** the quarter the guide is for, as the company names it */
  quarter: string;
  /** the call where the guide was given */
  guidedOn: string;
  /** the call where the result was reported, or null while pending */
  reportedOn: string | null;
  /** 'growth' = year-on-year revenue growth; 'level' = revenue in US$ billions */
  revenueKind: 'growth' | 'level';
  revenue: Range;
  revenueActual: number | null;
  /** gross margin range, on the basis the company guides (NVIDIA: non-GAAP) */
  margin: Range | null;
  marginActual: number | null;
  /** a note on the margin where a one-off sits in it */
  marginNote?: string;
  /** the margin without the one-off the company named, which the verdict uses */
  marginUnderlying?: number;
  /** for a growth guide: the same quarter a year earlier, US$ billions, as filed */
  base?: number;
}

/* Apple guides total-company revenue as year-on-year growth, in words or a range; gross margin as a range. */
const AAPL: GuideRecord[] = [
  { symbol: 'AAPL', quarter: 'June quarter FY2025', guidedOn: '2025-05-01', reportedOn: '2025-07-31', revenueKind: 'growth',
    revenue: { low: 0.01, high: 0.05, words: 'low to mid-single digits', ours: true }, revenueActual: 94.036 / 85.777 - 1,
    margin: { low: 0.455, high: 0.465 }, marginActual: 0.465 },
  { symbol: 'AAPL', quarter: 'September quarter FY2025', guidedOn: '2025-07-31', reportedOn: '2025-10-30', revenueKind: 'growth',
    revenue: { low: 0.04, high: 0.09, words: 'mid- to high single digits', ours: true }, revenueActual: 102.466 / 94.930 - 1,
    margin: { low: 0.46, high: 0.47 }, marginActual: 0.472 },
  { symbol: 'AAPL', quarter: 'December quarter FY2026', guidedOn: '2025-10-30', reportedOn: '2026-01-29', revenueKind: 'growth',
    revenue: { low: 0.10, high: 0.12 }, revenueActual: 143.756 / 124.300 - 1,
    margin: { low: 0.47, high: 0.48 }, marginActual: 0.482 },
  { symbol: 'AAPL', quarter: 'March quarter FY2026', guidedOn: '2026-01-29', reportedOn: '2026-04-30', revenueKind: 'growth',
    revenue: { low: 0.13, high: 0.16 }, revenueActual: 111.184 / 95.359 - 1,
    margin: { low: 0.48, high: 0.49 }, marginActual: 0.493 },
  { symbol: 'AAPL', quarter: 'June quarter FY2026', guidedOn: '2026-04-30', reportedOn: '2026-07-30', revenueKind: 'growth',
    revenue: { low: 0.14, high: 0.17 }, revenueActual: 109.417 / 94.036 - 1,
    margin: { low: 0.475, high: 0.485 }, marginActual: 0.501, marginUnderlying: 0.481,
    marginNote: 'Includes about two points from tariff refunds; without them, 48.1%, the middle of the range.' },
  { symbol: 'AAPL', quarter: 'September quarter FY2026', guidedOn: '2026-07-30', reportedOn: null, revenueKind: 'growth',
    revenue: { low: 0.09, high: 0.11 }, revenueActual: null, base: 102.466,
    margin: { low: 0.47, high: 0.48 }, marginActual: null,
    marginNote: 'Includes about one point expected from tariff refunds.' },
];

/* NVIDIA guides revenue as a level plus or minus 2%, and non-GAAP gross margin plus or minus 50 basis points. */
const pm2 = (mid: number): Range => ({ low: mid * 0.98, high: mid * 1.02 });
const pm50 = (mid: number): Range => ({ low: mid - 0.005, high: mid + 0.005 });
const NVDA: GuideRecord[] = [
  { symbol: 'NVDA', quarter: 'Q2 FY2026', guidedOn: '2025-05-28', reportedOn: '2025-08-27', revenueKind: 'level',
    revenue: pm2(45.0), revenueActual: 46.743, margin: pm50(0.72), marginActual: 0.727, marginUnderlying: 0.723,
    marginNote: 'Includes 0.4 point from releasing reserved H20 inventory; without it, 72.3%.' },
  { symbol: 'NVDA', quarter: 'Q3 FY2026', guidedOn: '2025-08-27', reportedOn: '2025-11-19', revenueKind: 'level',
    revenue: pm2(54.0), revenueActual: 57.006, margin: pm50(0.735), marginActual: 0.736 },
  { symbol: 'NVDA', quarter: 'Q4 FY2026', guidedOn: '2025-11-19', reportedOn: '2026-02-25', revenueKind: 'level',
    revenue: pm2(65.0), revenueActual: 68.127, margin: pm50(0.75), marginActual: 0.752,
    marginNote: 'The transcript garbles the margin guide (“74.875%”); read as 74.8% GAAP and 75% non-GAAP.' },
  { symbol: 'NVDA', quarter: 'Q1 FY2027', guidedOn: '2026-02-25', reportedOn: '2026-05-20', revenueKind: 'level',
    revenue: pm2(78.0), revenueActual: 81.615, margin: pm50(0.75), marginActual: 0.75 },
  { symbol: 'NVDA', quarter: 'Q2 FY2027', guidedOn: '2026-05-20', reportedOn: '2026-08-26', revenueKind: 'level',
    revenue: pm2(91.0), revenueActual: 96.221, margin: pm50(0.75), marginActual: 0.75 },
  { symbol: 'NVDA', quarter: 'Q3 FY2027', guidedOn: '2026-08-26', reportedOn: null, revenueKind: 'level',
    revenue: pm2(108.0), revenueActual: null, margin: pm50(0.74), marginActual: null },
];

export const GUIDANCE: GuideRecord[] = [...AAPL, ...NVDA];
export const guidanceFor = (symbol: string) => GUIDANCE.filter((g) => g.symbol === symbol);

export type Verdict = 'above' | 'within' | 'below';

/** The margin a verdict is read on: without the one-off the company itself named, where it named one. */
export const marginForVerdict = (g: GuideRecord) => (isNum(g.marginUnderlying) ? g.marginUnderlying : g.marginActual);

export const verdictOf = (actual: number | null, r: Range | null): Verdict | null =>
  (!isNum(actual) || !r ? null : actual > r.high + 1e-9 ? 'above' : actual < r.low - 1e-9 ? 'below' : 'within');

/** How far the result landed from the middle of the range: points of growth, or a share of the level. */
export function vsMidpoint(g: GuideRecord): number | null {
  if (!isNum(g.revenueActual)) return null;
  const mid = (g.revenue.low + g.revenue.high) / 2;
  return g.revenueKind === 'growth' ? g.revenueActual - mid : g.revenueActual / mid - 1;
}

export interface GuideSummary {
  resolved: number;
  revenue: Record<Verdict, number>;
  margin: Record<Verdict, number>;
  medianVsMid: number | null;
  kind: 'growth' | 'level';
  pending: GuideRecord | null;
}

export function guideSummary(list: GuideRecord[]): GuideSummary | null {
  const done = list.filter((g) => g.reportedOn);
  if (!done.length) return null;
  const count = (f: (g: GuideRecord) => Verdict | null) => {
    const out: Record<Verdict, number> = { above: 0, within: 0, below: 0 };
    for (const g of done) { const v = f(g); if (v) out[v] += 1; }
    return out;
  };
  return {
    resolved: done.length,
    revenue: count((g) => verdictOf(g.revenueActual, g.revenue)),
    margin: count((g) => verdictOf(marginForVerdict(g), g.margin)),
    medianVsMid: median(done.map(vsMidpoint).filter(isNum)),
    kind: done[0].revenueKind,
    pending: list.find((g) => !g.reportedOn) || null,
  };
}

/* ---------- pay ------------------------------------------------------------------ */

export interface PayGoal {
  plan: string;
  metric: string;
  threshold: number | null;
  target: number;
  maximum: number | null;
  actual: number | null;
  payout: string;
  /** the comparable figure a year earlier, for reading how hard the target was */
  priorYear: number | null;
  unit: 'US$b' | 'percentile';
  note?: string;
}

export interface PayRecord {
  symbol: string;
  year: string;
  source: string;
  url: string;
  filed: string;
  goals: PayGoal[];
  /** the long-term award, in words */
  longTerm: string;
}

export const PAY: PayRecord[] = [
  {
    symbol: 'AAPL', year: 'fiscal 2025', source: 'Apple 2026 proxy statement (DEF 14A)', filed: '2026-01-08',
    url: 'https://www.sec.gov/Archives/edgar/data/320193/000130817926000008/aapl014016-def14a.htm',
    goals: [
      { plan: 'Annual cash incentive (half)', metric: 'Net sales', threshold: 380, target: 391, maximum: 402, actual: 416.2, payout: 'Maximum, 200% of target', priorYear: 391.035, unit: 'US$b' },
      { plan: 'Annual cash incentive (half)', metric: 'Operating income', threshold: 113, target: 118.5, maximum: 124, actual: 133.1, payout: 'Maximum, 200% of target', priorYear: 123.216, unit: 'US$b' },
    ],
    longTerm: 'Performance-based RSUs vest on total shareholder return against the S&P 500 over three years; target needs the 55th percentile.',
  },
  {
    symbol: 'NVDA', year: 'fiscal 2026', source: 'NVIDIA 2026 proxy statement (DEF 14A)', filed: '2026-05-12',
    url: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000036/nvda-20260512.htm',
    goals: [
      { plan: 'Variable cash plan', metric: 'Revenue', threshold: 100, target: 130, maximum: 160, actual: 215.9, payout: 'Maximum, 200%', priorYear: 130.497, unit: 'US$b',
        note: 'The stretch goal was set at US$190 billion and cut to US$160 billion automatically when export controls on H20 were added.' },
      { plan: 'Single-year PSUs', metric: 'Non-GAAP operating income', threshold: 46, target: 71, maximum: 96, actual: 137.3, payout: 'Maximum: 150% for the chief executive, 200% for the others', priorYear: null, unit: 'US$b',
        note: 'The stretch goal was cut from US$120 billion on the same rule.' },
    ],
    longTerm: 'Multi-year PSUs vest on three-year total shareholder return against the S&P 500; target is the 50th percentile, and fiscal 2024–2026 ranked at the 100th.',
  },
];

export const payFor = (symbol: string) => PAY.find((p) => p.symbol === symbol) || null;
