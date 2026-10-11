/* ==========================================================================
   Maz Vantage — the quick Shariah screen (the model)

   Five published index methodologies, run against the figures the report
   already loads. Several surfaces read it — the Overview, the Shariah
   Compliance tab, the Shariah desk, the ideas engine — so the model lives
   apart from any view. Where an issuer also has a researched screen
   (`shariah-v5.ts`, `shariah-issuers.ts`), that is the verdict and this is the
   cross-check; the index rules below are the one definition both read.

   What it runs: debt, cash and receivables against each provider's own
   denominator — the 12-, 24- or 36-month average market cap where the daily
   market-cap history has loaded, total assets for MSCI — interest income
   against revenue, and the interest part of purification for one share.

   What it cannot run is the rest of the revenue test: income from alcohol,
   gambling, music, conventional finance and the like needs a breakdown by
   activity that no statement line carries. That is per-issuer research, and
   the tab says so rather than printing a pass it did not earn.
   ========================================================================== */

import { isNum, pct } from './format';

/**
 * Industry and sector wordings a business-activity screen excludes outright.
 * Keyword matching against the reported classification, which is as far as
 * this data goes: it catches a bank and a distiller, not a conglomerate's
 * financing arm.
 */
export const EXCLUDED_ACTIVITIES = [
  'bank', 'insurance', 'capital markets', 'credit services', 'mortgage',
  'financial data', 'asset management', 'gambling', 'casino', 'tobacco',
  'brewer', 'distiller', 'winerie', 'alcoholic',
];

export type McapWindow = 'm12' | 'm24' | 'm36';

export interface ShariahStandard {
  key: 'aaoifi' | 'sp' | 'djim' | 'ftse' | 'msci';
  /** Short name, for lists. */
  name: string;
  /** The rulebook's own name, for tables. */
  fullName: string;
  divisor: 'marketCap' | 'assets';
  /** Which average market cap the provider divides by; ignored for total assets. */
  window: McapWindow | null;
  debt: number;
  liquid: number;
  /** Receivables test, if the provider runs one; `withCash` adds cash and equivalents. */
  ar?: { cap: number; withCash?: boolean };
  /**
   * The revenue test: all non-permissible income (interest first); the same
   * without interest; activities the provider excludes counted whole; or a
   * sector list with no revenue percentage.
   */
  income: 'npi' | 'npi-ex-interest' | 'whole-line' | 'sector';
  note: string;
}

/**
 * As the rulebooks stand in October 2026. Dow Jones moved from 33% to 30% at
 * the September 2026 rebalance (S&P DJI announcement 1484596, 20 Aug 2026).
 * FTSE's US Shariah index is screened by IdealRatings, which divides by the
 * 24-month average market cap (screening guide v1.4, March 2026) — total
 * assets only when market cap is the smaller of the two.
 */
export const SHARIAH_STANDARDS: ShariahStandard[] = [
  { key: 'aaoifi', name: 'AAOIFI', fullName: 'AAOIFI Shariah Standard 21', divisor: 'marketCap', window: 'm12', debt: 0.30, liquid: 0.30, income: 'npi',
    note: 'The standard itself: borrowings and interest-bearing deposits each under 30% of market value; non-permissible income under 5%.' },
  { key: 'sp', name: 'S&P Global', fullName: 'S&P Shariah', divisor: 'marketCap', window: 'm36', debt: 0.33, liquid: 0.33, ar: { cap: 0.49 }, income: 'npi-ex-interest',
    note: 'Interest is tested through the cash ratio; the revenue test covers other non-permissible income.' },
  { key: 'djim', name: 'Dow Jones', fullName: 'Dow Jones Islamic Market', divisor: 'marketCap', window: 'm24', debt: 0.30, liquid: 0.30, ar: { cap: 0.30 }, income: 'sector',
    note: '30% since the September 2026 rebalance (33% before). The business test is a sector exclusion list, with no revenue percentage.' },
  { key: 'ftse', name: 'FTSE', fullName: 'FTSE Shariah (IdealRatings)', divisor: 'marketCap', window: 'm24', debt: 0.33, liquid: 0.33, income: 'whole-line',
    note: 'Music, film and TV, insurance broking, conventional finance and gambling count whole toward a 5% cap with interest.' },
  { key: 'msci', name: 'MSCI', fullName: 'MSCI Islamic', divisor: 'assets', window: null, debt: 0.3333, liquid: 0.3333, ar: { cap: 0.3333, withCash: true }, income: 'npi',
    note: 'Total assets is the denominator, and a new entrant must be under 30%.' },
];

/** "24-month market cap", "Total assets" — what a standard divides by, in words. */
export const basisLabel = (std: ShariahStandard) =>
  (std.divisor === 'assets' ? 'Total assets' : `${std.window ? std.window.slice(1) : '12'}-month market cap`);

/** The cap on non-permissible income every revenue test here uses. */
export const INCOME_CAP = 0.05;

export const SHARIAH_INFO = 'A mechanical screen, not a scholarly ruling. AAOIFI, S&P, Dow Jones and FTSE measure debt and '
  + 'cash against an average market capitalisation (12, 36, 24 and 24 months); MSCI against total assets, which is why '
  + 'the same company can pass one and fail another. Interest income is tested against revenue where the company '
  + 'reports it; the rest of the revenue test — income from excluded activities — needs a breakdown no statement '
  + 'carries, and is not run here. Verify against the provider before relying on it.';

/** Is the business itself excluded, regardless of the balance sheet? */
export function excludedActivity(f: { industry?: string | null; sector?: string | null }): string | null {
  const hay = `${f.industry || ''} ${f.sector || ''}`.toLowerCase();
  return EXCLUDED_ACTIVITIES.find((w) => hay.includes(w)) || null;
}

/* ---------- averaged market capitalisation ------------------------------------ */

export interface McapAverages {
  m12: number | null;
  m24: number | null;
  m36: number | null;
  spot: number | null;
  /** The span of history the averages were taken over, and how many points it held. */
  from: string | null;
  to: string | null;
  points: number;
}

const DAY = 864e5;
const monthsBefore = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.getTime();
};

/**
 * Trailing averages of a market-cap history, each over the months before the
 * newest point. A window counts only when the history reaches back to its
 * start (within 40 days, so month-end series qualify) — an average over half
 * the window would be a different number with the same label.
 */
export function mcapAverages(rows: { date: string; marketCap: number }[] | null | undefined, spot?: number | null): McapAverages {
  const clean = (rows ?? []).filter((r) => r && typeof r.date === 'string' && isNum(r.marketCap) && r.marketCap > 0)
    .sort((x, y) => (x.date < y.date ? -1 : 1));
  const out: McapAverages = { m12: null, m24: null, m36: null, spot: isNum(spot) ? spot : null, from: null, to: null, points: clean.length };
  if (!clean.length) return out;
  const end = clean[clean.length - 1].date;
  const first = Date.parse(`${clean[0].date}T00:00:00Z`);
  out.from = clean[0].date;
  out.to = end;
  if (out.spot == null) out.spot = clean[clean.length - 1].marketCap;
  for (const [key, n] of [['m12', 12], ['m24', 24], ['m36', 36]] as const) {
    const start = monthsBefore(end, n);
    if (first > start + 40 * DAY) continue;
    const span = clean.filter((r) => Date.parse(`${r.date}T00:00:00Z`) > start);
    if (span.length) out[key] = span.reduce((t, r) => t + r.marketCap, 0) / span.length;
  }
  return out;
}

/* ---------- the inputs -------------------------------------------------------- */

export interface QuickInputs {
  /** Latest annual balance sheet's date. */
  asOf: string | null;
  totalDebt: number | null;
  /** Cash and short-term investments plus long-term investments — every security the statement holds. */
  cashIbs: number | null;
  cash: number | null;
  longTermInvestments: number | null;
  ar: number | null;
  totalAssets: number | null;
  revenue: number | null;
  /** Gross interest income; `null` when the statement reports none (a zero there is "not reported"). */
  interestIncome: number | null;
  taxRate: number | null;
  epsDiluted: number | null;
  dilutedShares: number | null;
  /** Dividends per share over the trailing twelve months. */
  dps: number | null;
  mcap: McapAverages;
  sector: string | null;
  industry: string | null;
}

const num = (v: unknown): number | null => (isNum(v) ? v : null);
const newest = (rows: unknown): any => {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  return list.reduce((a: any, b: any) => (!a || String(b.date || '') > String(a.date || '') ? b : a), null);
};

/** Everything the quick screen reads, from a report's dataset and the market-cap history if it has loaded. */
export function quickInputs(a: { facts: any; ds?: { get: (n: string) => any } }, mcapRows?: { date: string; marketCap: number }[] | null): QuickInputs {
  const f = a.facts ?? {};
  const get = (n: string) => (a.ds && typeof a.ds.get === 'function' ? a.ds.get(n) : null);
  const b = newest(get('balance'));
  const i = newest(get('income'));
  const short = num(b?.cashAndShortTermInvestments);
  const long = num(b?.longTermInvestments);
  const cashIbs = short != null ? short + (long ?? 0) : num(f.cash);
  const pre = num(i?.incomeBeforeTax);
  const tax = num(i?.incomeTaxExpense);
  const interest = num(i?.interestIncome);
  const divs = Array.isArray(get('dividends')) ? get('dividends') : [];
  const lastDiv = newest(divs);
  const cutoff = lastDiv ? Date.parse(`${lastDiv.date}T00:00:00Z`) - 365 * DAY : 0;
  const ttm = divs.filter((d: any) => d?.date && Date.parse(`${d.date}T00:00:00Z`) > cutoff)
    .reduce((t: number, d: any) => t + (num(d.adjDividend) ?? num(d.dividend) ?? 0), 0);
  return {
    asOf: b?.date ?? null,
    totalDebt: num(b?.totalDebt) ?? num(f.totalDebt),
    cashIbs,
    cash: num(b?.cashAndCashEquivalents),
    longTermInvestments: long,
    ar: num(b?.accountsReceivables),
    totalAssets: num(b?.totalAssets) ?? num(f.totalAssets),
    revenue: num(i?.revenue) ?? num(f.revenue),
    interestIncome: interest != null && interest > 0 ? interest : null,
    taxRate: pre != null && pre > 0 && tax != null ? Math.max(0, tax / pre) : null,
    epsDiluted: num(i?.epsDiluted),
    dilutedShares: num(i?.weightedAverageShsOutDil),
    dps: lastDiv ? ttm : 0,
    mcap: mcapAverages(mcapRows, num(f.marketCap)),
    sector: f.sector ?? null,
    industry: f.industry ?? null,
  };
}

/* ---------- one standard ------------------------------------------------------ */

export type QuickState = 'pass' | 'fail' | 'na';

export interface QuickTest { key: 'debt' | 'cash' | 'ar' | 'interest'; value: number | null; limit: number; state: QuickState }

export interface QuickResult {
  std: ShariahStandard;
  /** What was divided by, and whether it was the provider's own window or a stand-in. */
  base: number | null;
  basis: string;
  averaged: boolean;
  excluded: string | null;
  tests: QuickTest[];
  state: QuickState;
  note: string;
}

const judge = (value: number | null, limit: number): QuickState => (value == null ? 'na' : value <= limit ? 'pass' : 'fail');

/**
 * One provider's verdict on the quick inputs. The market-cap providers divide
 * by their own average where the history reaches back far enough, and by
 * today's market cap otherwise — said in `basis`, because the two can differ.
 */
export function quickScreen(inp: QuickInputs, std: ShariahStandard): QuickResult {
  const excluded = excludedActivity({ industry: inp.industry, sector: inp.sector });
  const avg = std.divisor === 'marketCap' && std.window ? inp.mcap[std.window] : null;
  const base = std.divisor === 'assets' ? inp.totalAssets : avg ?? inp.mcap.spot;
  const averaged = std.divisor === 'assets' || avg != null;
  const basis = std.divisor === 'assets' ? 'Total assets' : avg != null ? basisLabel(std) : 'Current market cap';
  const over = (v: number | null) => (v != null && isNum(base) && base > 0 ? v / base : null);
  const tests: QuickTest[] = [
    { key: 'debt', value: over(inp.totalDebt), limit: std.debt, state: 'na' },
    { key: 'cash', value: over(inp.cashIbs), limit: std.liquid, state: 'na' },
  ];
  if (std.ar) {
    const ar = inp.ar != null ? inp.ar + (std.ar.withCash ? inp.cash ?? 0 : 0) : null;
    tests.push({ key: 'ar', value: over(ar), limit: std.ar.cap, state: 'na' });
  }
  if (std.income === 'npi' || std.income === 'whole-line') {
    const v = inp.interestIncome != null && isNum(inp.revenue) && inp.revenue > 0 ? inp.interestIncome / inp.revenue : null;
    tests.push({ key: 'interest', value: v, limit: INCOME_CAP, state: 'na' });
  }
  for (const t of tests) t.state = judge(t.value, t.limit);

  const ratios = tests.filter((t) => t.key === 'debt' || t.key === 'cash');
  let state: QuickState;
  if (excluded || tests.some((t) => t.state === 'fail')) state = 'fail';
  else if (ratios.some((t) => t.state === 'na')) state = 'na';
  else state = 'pass';

  const note = excluded ? 'Excluded business activity'
    : tests.filter((t) => t.value != null).map((t) => `${t.key === 'ar' ? 'receivables' : t.key} ${pct(t.value)}`).join(' · ') || 'Not enough of the balance sheet is loaded';
  return { std, base: isNum(base) ? base : null, basis, averaged, excluded, tests, state, note };
}

/* ---------- purification, for one share ---------------------------------------- */

export interface QuickPurification {
  /** Interest after tax, per diluted share: what one share earned from interest over the year. */
  perShare: number;
  /** The part that arrives with the dividend (payout = dividends ÷ earnings). */
  dividendPart: number;
  dps: number;
  payout: number;
  /** Dividend × interest share of revenue: the shortcut most retail screeners print. */
  ratioMethod: number;
  taxRate: number;
}

/**
 * The interest part of purification, for one share and the dividend it
 * carries — methodology v5.0's Δ6 with interest as the only measured impurity,
 * where the old and new formulas agree. It is a floor: income from excluded
 * activities would add to it, and is not measured here.
 */
export function quickPurification(inp: QuickInputs): QuickPurification | { reason: string } {
  if (inp.interestIncome == null) return { reason: 'The latest annual income statement reports no interest income, so there is nothing to compute it from.' };
  if (!isNum(inp.dilutedShares) || inp.dilutedShares <= 0) return { reason: 'The share count is missing from the latest income statement.' };
  const t = inp.taxRate ?? 0;
  const perShare = (inp.interestIncome * (1 - t)) / inp.dilutedShares;
  const dps = inp.dps ?? 0;
  const payout = isNum(inp.epsDiluted) && inp.epsDiluted > 0 ? Math.min(1, dps / inp.epsDiluted) : dps > 0 ? 1 : 0;
  const share = isNum(inp.revenue) && inp.revenue > 0 ? inp.interestIncome / inp.revenue : 0;
  return { perShare, dividendPart: perShare * payout, dps, payout, ratioMethod: dps * share, taxRate: t };
}

/* ---------- the Overview's summary ----------------------------------------------- */

export interface ShariahVerdict {
  std: ShariahStandard;
  state: QuickState;
  note: string;
}

/**
 * One standard's verdict for surfaces that do not load the market-cap history
 * (the Overview's count): the quick screen on today's market cap.
 */
export function shariahVerdict(a: { facts: any; ds?: { get: (n: string) => any } }, std: ShariahStandard): ShariahVerdict {
  const r = quickScreen(quickInputs(a), std);
  return { std, state: r.state, note: r.note };
}
