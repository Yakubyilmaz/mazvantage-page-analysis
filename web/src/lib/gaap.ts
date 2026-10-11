/* ==========================================================================
   Maz Vantage — GAAP and non-GAAP, kept apart

   The Financials tab has two bases, and this file is what stops a figure on
   one of them from leaking onto the other.

   **GAAP** is what the company filed. The standard is read off the filing's
   own XBRL tags rather than assumed from where the company is listed: a 10-K
   tags `NetIncomeLoss`, an IFRS filer tags `ProfitLossAttributableToOwnersOfParent`,
   and SAP's statements relabelled "GAAP" would simply be wrong. Where no
   tagged filing exists the standard is reported as unconfirmed, not guessed.

   **Non-GAAP** is anything else, and it comes in two kinds that are labelled
   apart because they answer to different people:

   - *Reported by the company.* Adjusted EPS — the figure each quarter was
     announced and measured against consensus on. It lives on the earnings
     calendar, not in a filing's tagged statements, and the definition is the
     company's: Salesforce's Q1 FY26 was $2.58 adjusted against $1.59 filed.
     A company that publishes no non-GAAP figure still gets one when the
     market strips out a one-off — Apple's September 2024 quarter was $1.64
     against $0.97 filed, after a one-off tax charge.
   - *Calculated here, by a fixed formula from GAAP lines.* EBITDA, free cash
     flow, net debt, tangible book value. No adjustment in them is anyone's
     choice, but each is still a non-GAAP measure under the SEC's Regulation G,
     so each is shown beside the GAAP line it starts from — the reconciliation
     the regulation asks of a company is asked of this page too.

   Nothing here combines the two bases into one figure, and a forecast is
   never filed: consensus EPS is on the adjusted basis, so it may extend the
   adjusted series and never the GAAP one.
   ========================================================================== */

import { isNum, yearOf } from './format';
import { fetchFor, loadSnapshot } from './fmp';

const DAY = 86400000;
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const time = (d: unknown): number | null => {
  const t = Date.parse(String(d ?? ''));
  return Number.isNaN(t) ? null : t;
};
const sum = (xs: number[]) => xs.reduce((p, q) => p + q, 0);
/** EPS is reported in cents; four of them summed in floating point are not. */
const cents = (v: number) => Math.round(v * 1e4) / 1e4;

/* ---------- the accounting standard ------------------------------------ */

export type Standard = 'US GAAP' | 'IFRS';

/* Tags only one of the two taxonomies has, by the name the taxonomy gives
   them. `ProfitLoss` is deliberately absent: US GAAP has it too, for net
   income including the minority's share. */
const MARKERS: Record<Standard, string[]> = {
  'US GAAP': [
    'NetIncomeLoss', 'EarningsPerShareDiluted', 'EarningsPerShareBasic', 'OperatingIncomeLoss',
    'IncomeTaxExpenseBenefit', 'RevenueFromContractWithCustomerExcludingAssessedTax',
    'WeightedAverageNumberOfDilutedSharesOutstanding',
  ],
  IFRS: [
    'ProfitLossAttributableToOwnersOfParent', 'DilutedEarningsLossPerShare', 'BasicEarningsLossPerShare',
    'ProfitLossBeforeTax', 'ProfitLossFromOperatingActivities', 'FinanceCosts',
    'IncomeTaxExpenseContinuingOperations',
  ],
};

export interface StandardRead {
  standard: Standard | null;
  /** The tags that decided it, so the page can show its evidence. */
  tags: string[];
  /** The fiscal year of the filing the tags were read from. */
  fiscalYear: number | null;
}

/**
 * The standard the newest annual filing was tagged under. Two marker tags at
 * least, and more of one taxonomy's than the other's — a single stray tag is
 * not a standard.
 */
export function accountingStandard(asReported: unknown): StandardRead {
  const row = arr(asReported)
    .filter((r) => r && r.data && typeof r.data === 'object')
    .sort((x, y) => (time(y.date) ?? 0) - (time(x.date) ?? 0))[0];
  if (!row) return { standard: null, tags: [], fiscalYear: null };
  const keys = new Set(Object.keys(row.data).map((k) => k.toLowerCase()));
  const hits = (s: Standard) => MARKERS[s].filter((t) => keys.has(t.toLowerCase()));
  const us = hits('US GAAP');
  const ifrs = hits('IFRS');
  const fy = Number(row.fiscalYear);
  const fiscalYear = isNum(fy) ? fy : yearOf(row.date);
  if (us.length >= 2 && us.length > ifrs.length) return { standard: 'US GAAP', tags: us, fiscalYear };
  if (ifrs.length >= 2 && ifrs.length > us.length) return { standard: 'IFRS', tags: ifrs, fiscalYear };
  return { standard: null, tags: [], fiscalYear };
}

/**
 * Whether reported EPS and filed EPS are in the same unit. The earnings
 * calendar quotes the listed line — an ADR in dollars — while the statements
 * are in the reporting currency per ordinary share, so for SAP or TSMC the
 * "gap" between the two would be a currency and a share ratio, not an
 * adjustment. Unknown is not a mismatch: a statement row with no currency on
 * it is read as the listing's own.
 */
export function sameUnit(listingCurrency: unknown, reportingCurrency: unknown): boolean {
  if (typeof listingCurrency !== 'string' || typeof reportingCurrency !== 'string') return true;
  if (!listingCurrency || !reportingCurrency) return true;
  return listingCurrency.toUpperCase() === reportingCurrency.toUpperCase();
}

/* ---------- adjusted EPS, quarter by quarter ----------------------------- */

export interface Quarter {
  /** The quarter's last day, as filed. */
  periodEnd: string;
  fiscalYear: string | null;
  /** 'Q1' … 'Q4', as filed. */
  period: string | null;
  label: string;
  /** The day the results were released. */
  announced: string;
  /** EPS as reported and measured against consensus — the adjusted figure. */
  adjusted: number;
  estimate: number | null;
  /** Diluted EPS as filed for the same quarter — the GAAP figure. */
  gaap: number | null;
  /** Whether the release's revenue matched the filed quarter's; null when either is missing. */
  revenueAgrees: boolean | null;
}

/* A release comes after the quarter closes — a week at the earliest, four
   months at the latest — and before the next filing is long out. The 10-Q
   or 10-K for the quarter is filed with the release or after it; one filed
   six weeks before a release belongs to an earlier announcement. */
const MIN_LAG = 7;
const MAX_LAG = 120;
const REVENUE_LAG = 150;
const FILED_BEFORE = 45;
const REVENUE_TOL = 0.005;

function quarterLabel(q: any): string {
  if (q.period && q.fiscalYear != null) return `${q.period} FY${String(q.fiscalYear).slice(-2)}`;
  const t = time(q.date);
  if (t == null) return '—';
  const d = new Date(t);
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ’${String(d.getUTCFullYear()).slice(2)}`;
}

/**
 * Each reported quarter on the earnings calendar joined to the filed quarter
 * it covers. The calendar carries no fiscal period, only the day of the
 * release, so the join is by date — and where the release states revenue
 * and it ties to a filed quarter within half a per cent, by revenue first,
 * because revenue identifies a quarter far better than a date window does.
 * A release that matches no filed quarter is left out rather than placed.
 */
export function joinQuarters(earnings: unknown, incomeQ: unknown): Quarter[] {
  const filed = arr(incomeQ)
    .filter((q) => q && time(q.date) != null)
    .sort((x, y) => time(y.date)! - time(x.date)!);
  const reported = arr(earnings)
    .filter((e) => e && isNum(e.epsActual) && time(e.date) != null)
    .sort((x, y) => time(x.date)! - time(y.date)!);

  const claimed = new Set<string>();
  const out: Quarter[] = [];
  for (const e of reported) {
    const at = time(e.date)!;
    const lag = (q: any) => (at - time(q.date)!) / DAY;
    const filedLongBefore = (q: any) => {
      const f = time(q.filingDate);
      return f != null && f < at - FILED_BEFORE * DAY;
    };
    const open = filed.filter((q) => !claimed.has(q.date) && lag(q) >= MIN_LAG && lag(q) <= REVENUE_LAG && !filedLongBefore(q));
    const agrees = (q: any) => isNum(e.revenueActual) && isNum(q.revenue) && q.revenue > 0
      && Math.abs(e.revenueActual / q.revenue - 1) <= REVENUE_TOL;
    const q = open.find(agrees) ?? open.find((c) => lag(c) <= MAX_LAG);
    if (!q) continue;
    claimed.add(q.date);
    const gaap = q.epsDiluted ?? q.eps;
    out.push({
      periodEnd: q.date,
      fiscalYear: q.fiscalYear != null ? String(q.fiscalYear) : null,
      period: typeof q.period === 'string' ? q.period : null,
      label: quarterLabel(q),
      announced: e.date,
      adjusted: e.epsActual,
      estimate: isNum(e.epsEstimated) ? e.epsEstimated : null,
      gaap: isNum(gaap) ? gaap : null,
      revenueAgrees: isNum(e.revenueActual) && isNum(q.revenue) ? agrees(q) : null,
    });
  }
  return out.sort((x, y) => time(x.periodEnd)! - time(y.periodEnd)!);
}

export interface AdjustedYear {
  /** The calendar year the fiscal year ended in — how the annual statements are keyed. */
  year: number;
  fiscalYear: string;
  periodEnd: string;
  /** The four reported quarters summed. */
  adjusted: number;
  /** The four filed quarters summed, for the same span. */
  gaapQuarters: number | null;
  /** How many of the four quarters carried an adjustment of a cent or more. */
  adjustedQuarters: number;
}

/**
 * Fiscal years with all four quarters reported. Never an annualised three:
 * a year with a quarter missing is not a year. The sum of four quarterly EPS
 * figures can differ from the annual one by a cent, because each quarter
 * divides by its own share count.
 */
export function adjustedYears(quarters: Quarter[]): AdjustedYear[] {
  const byFy = new Map<string, Quarter[]>();
  for (const q of quarters) {
    if (!q.fiscalYear || !/^Q[1-4]$/.test(q.period ?? '')) continue;
    if (!byFy.has(q.fiscalYear)) byFy.set(q.fiscalYear, []);
    byFy.get(q.fiscalYear)!.push(q);
  }
  const out: AdjustedYear[] = [];
  for (const [fiscalYear, qs] of byFy) {
    if (qs.length !== 4 || new Set(qs.map((q) => q.period)).size !== 4) continue;
    const q4 = qs.find((q) => q.period === 'Q4')!;
    const year = yearOf(q4.periodEnd);
    if (!isNum(year)) continue;
    const gaaps = qs.map((q) => q.gaap);
    out.push({
      year, fiscalYear, periodEnd: q4.periodEnd,
      adjusted: cents(sum(qs.map((q) => q.adjusted))),
      gaapQuarters: gaaps.every(isNum) ? cents(sum(gaaps as number[])) : null,
      adjustedQuarters: qs.filter((q) => isNum(q.gaap) && Math.abs(q.adjusted - q.gaap) >= 0.005).length,
    });
  }
  return out.sort((x, y) => x.year - y.year);
}

export interface Trailing {
  adjusted: number;
  gaap: number | null;
  first: Quarter;
  last: Quarter;
}

/**
 * The four newest filed quarters, on both bases. Only when every one of the
 * four has a reported figure — the two sums have to cover the same span.
 */
export function trailingFour(quarters: Quarter[], incomeQ: unknown): Trailing | null {
  const newest = arr(incomeQ)
    .filter((q) => q && time(q.date) != null)
    .sort((x, y) => time(y.date)! - time(x.date)!)
    .slice(0, 4)
    .map((q) => q.date);
  if (newest.length < 4) return null;
  const four = newest.map((d) => quarters.find((q) => q.periodEnd === d));
  if (four.some((q) => !q)) return null;
  const qs = four as Quarter[];
  const gaaps = qs.map((q) => q.gaap);
  return {
    adjusted: cents(sum(qs.map((q) => q.adjusted))),
    gaap: gaaps.every(isNum) ? cents(sum(gaaps as number[])) : null,
    first: qs[3],
    last: qs[0],
  };
}

/* ---------- measures calculated from GAAP lines -------------------------- */

/** The formula behind every calculated measure, in the words the page prints. */
export const FORMULA = {
  ebitda: 'operating income + D&A',
  ebitdaExSbc: 'EBITDA + stock compensation',
  fcf: 'operating cash flow − capex',
  fcfExSbc: 'free cash flow − stock compensation',
  netDebt: 'total debt − cash & short-term investments',
  tangibleBook: 'equity − goodwill & intangibles',
} as const;

export interface BasisYear {
  date: string;
  year: number;

  // GAAP starting points, as filed.
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  da: number | null;
  sbc: number | null;
  ocf: number | null;
  /** As filed — negative, because it is money going out. */
  capex: number | null;
  dividends: number | null;
  buybacks: number | null;
  shares: number | null;
  epsGaap: number | null;
  totalDebt: number | null;
  cashSti: number | null;
  equity: number | null;
  intangibles: number | null;

  // Calculated here, by FORMULA.
  ebitda: number | null;
  ebitdaMargin: number | null;
  ebitdaExSbc: number | null;
  fcf: number | null;
  fcfMargin: number | null;
  fcfPerShare: number | null;
  fcfExSbc: number | null;
  fcfExSbcMargin: number | null;
  returned: number | null;
  returnedOfFcf: number | null;
  netDebt: number | null;
  netDebtToEbitda: number | null;
  tangibleBook: number | null;

  // Reported by the company, and its like-for-like GAAP figure.
  epsAdjusted: number | null;
  /** The four filed quarters summed — the GAAP side of the same span. */
  epsGaapQuarters: number | null;
  /** Adjusted less GAAP over the same four quarters, so a share-count cent is not called an adjustment. */
  epsAdjustment: number | null;
}

const n = (v: unknown): number | null => (isNum(v) ? v : null);
const both = (a: number | null, b: number | null, f: (a: number, b: number) => number) => (a != null && b != null ? f(a, b) : null);
const over = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? a / b : null);

/**
 * One row per fiscal year across the three statements, matched by the year
 * the fiscal year ended in — never by position, because the three feeds can
 * return different numbers of years.
 *
 * Depreciation comes from the cash flow statement, where it is the filed
 * add-back, before the income statement's line: some quarters' income rows
 * carry it as zero when it was not broken out.
 */
export function basisYears(
  statements: { income?: any[]; balance?: any[]; cash?: any[] },
  adjusted: AdjustedYear[] = [],
): BasisYear[] {
  const byYear = (rows: any[] | undefined) => new Map(arr(rows).filter((r) => isNum(yearOf(r?.date))).map((r) => [yearOf(r.date)!, r]));
  const inc = byYear(statements.income);
  const bal = byYear(statements.balance);
  const cf = byYear(statements.cash);
  const adj = new Map(adjusted.map((y) => [y.year, y]));
  const years = [...new Set([...inc.keys(), ...bal.keys(), ...cf.keys()])].sort((x, y) => x - y);

  return years.map((year) => {
    const i = inc.get(year) || {};
    const b = bal.get(year) || {};
    const c = cf.get(year) || {};

    const revenue = n(i.revenue);
    const operatingIncome = n(i.operatingIncome);
    const da = n(c.depreciationAndAmortization) ?? n(i.depreciationAndAmortization);
    const sbc = n(c.stockBasedCompensation);
    const ocf = n(c.operatingCashFlow) ?? n(c.netCashProvidedByOperatingActivities);
    const capex = n(c.capitalExpenditure) ?? n(c.investmentsInPropertyPlantAndEquipment);
    const dividends = n(c.commonDividendsPaid) ?? n(c.netDividendsPaid);
    const buybacks = n(c.commonStockRepurchased);
    const shares = n(i.weightedAverageShsOutDil);
    const totalDebt = n(b.totalDebt);
    const cashSti = n(b.cashAndShortTermInvestments);
    const equity = n(b.totalStockholdersEquity);
    const intangibles = n(b.goodwillAndIntangibleAssets)
      ?? (isNum(b.goodwill) && isNum(b.intangibleAssets) ? b.goodwill + b.intangibleAssets : null);

    const ebitda = both(operatingIncome, da, (o, d) => o + d);
    const ebitdaExSbc = both(ebitda, sbc, (e, s) => e + s);
    const fcf = both(ocf, capex, (o, x) => o - Math.abs(x));
    const fcfExSbc = both(fcf, sbc, (f, s) => f - s);
    const returned = dividends == null && buybacks == null ? null : Math.abs(dividends ?? 0) + Math.abs(buybacks ?? 0);
    const netDebt = both(totalDebt, cashSti, (d, x) => d - x);
    const epsGaap = n(i.epsDiluted) ?? n(i.eps);
    const epsAdjusted = adj.get(year)?.adjusted ?? null;
    const epsGaapQuarters = adj.get(year)?.gaapQuarters ?? null;

    return {
      date: i.date ?? c.date ?? b.date,
      year,
      revenue, operatingIncome, netIncome: n(i.netIncome), da, sbc, ocf, capex, dividends, buybacks, shares, epsGaap,
      totalDebt, cashSti, equity, intangibles,
      ebitda,
      ebitdaMargin: over(ebitda, revenue),
      ebitdaExSbc,
      fcf,
      fcfMargin: over(fcf, revenue),
      fcfPerShare: over(fcf, shares),
      fcfExSbc,
      fcfExSbcMargin: over(fcfExSbc, revenue),
      returned,
      // Only against a positive free cash flow: a share of a negative number
      // is a number, and it means nothing.
      returnedOfFcf: returned != null && returned > 0 ? over(returned, fcf) : null,
      netDebt,
      netDebtToEbitda: over(netDebt, ebitda),
      tangibleBook: both(equity, intangibles, (e, g) => e - g),
      epsAdjusted,
      epsGaapQuarters,
      epsAdjustment: both(epsAdjusted, epsGaapQuarters ?? epsGaap, (a, g) => cents(a - g)),
    };
  });
}

/* ---------- loading -------------------------------------------------------- */

export type BasisFeed = 'incomeQ' | 'incomeAsReported';

const LOADS = new WeakMap<object, Map<string, Promise<any[] | null>>>();

/**
 * One on-demand feed for the Financials tab: whatever the dataset already
 * holds, then live, then the bundled snapshot — the order `loadDividendFeeds`
 * uses. A live answer always wins, an empty one included: a company with no
 * tagged filing returns none, and the snapshot of another company's must not
 * stand in for it. One load per dataset and feed.
 */
export function loadBasisFeed(name: BasisFeed, symbol: string, ds: any): Promise<any[] | null> {
  let memo: Map<string, Promise<any[] | null>> | null = null;
  if (ds && typeof ds === 'object') {
    memo = LOADS.get(ds) ?? null;
    if (!memo) LOADS.set(ds, (memo = new Map()));
    const hit = memo.get(name);
    if (hit) return hit;
  }
  const p = (async () => {
    const have = ds?.feeds?.[name];
    if (have?.status === 'ok' && Array.isArray(have.data)) return have.data;
    const live = await fetchFor(name, symbol).catch(() => null);
    if (live?.status === 'ok' && Array.isArray(live.data)) return live.data;
    const snap = await loadSnapshot(symbol).catch(() => null);
    const cap = snap?.feeds?.[name];
    return Array.isArray(cap) ? cap : null;
  })();
  memo?.set(name, p);
  return p;
}
