/* ==========================================================================
   Maz Vantage — Demand Discovery: the company series and point-in-time views

   Everything in the Demand Discovery engine reads one shape: a company's
   quarterly filed figures plus a price series. Two places produce it — the
   bundled pilot capture (`public/data/demand-capture.json`) and the live
   quarterly statements — and this file is the only one that knows either
   source's field names.

   ---------------------------------------------------------------------------
   Point in time, or it is not a test
   ---------------------------------------------------------------------------

   A quarter is visible from the day it was **filed**, not the day it ended.
   Micron's quarter ending 2023-08-31 was not public until 2023-10-06; a
   backtest that reads it on 2023-09-01 is using the future. So every view of
   a company at a date goes through `pointInTime`, which drops the quarters
   filed after that date and the prices after it, and nothing downstream is
   allowed to look at the raw arrays.

   Two captured companies need a floor on their filing dates, and the capture
   applies it: Sandisk's carve-out quarters were first published with its
   spin-off, and Vertiv's 2019 rows were filed by the blank-cheque company
   that bought it. See `tools/capture/build_demand_capture.py`.

   Money is USD millions; shares are millions; prices are per share.
   ========================================================================== */

import { isNum } from './format';

export interface Quarter {
  /** period end */
  date: string;
  /** the day the figures became public */
  filed: string;
  rev: number | null;
  gp: number | null;
  oi: number | null;
  ni: number | null;
  inv: number | null;
  /** contract liabilities: deferred revenue, current and non-current — customer prepayments live here */
  cl: number | null;
  cash: number | null;
  debt: number | null;
  ocf: number | null;
  /** capital expenditure, positive */
  capex: number | null;
  /** diluted weighted shares, millions */
  sh: number | null;
}

export type PricePoint = [date: string, close: number];

export interface Company {
  symbol: string;
  name: string;
  /** oldest first */
  quarters: Quarter[];
  /** oldest first */
  prices: PricePoint[];
  pricesNote?: string;
}

export interface Benchmark {
  symbol: string;
  name: string;
  prices: PricePoint[];
}

export interface DemandCapture {
  capturedAt: string;
  about: string;
  companies: Record<string, Company>;
  benchmarks: Record<string, Benchmark>;
}

const QUARTER_KEYS: (keyof Quarter)[] = ['date', 'filed', 'rev', 'gp', 'oi', 'ni', 'inv', 'cl', 'cash', 'debt', 'ocf', 'capex', 'sh'];

const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null);

/** Expand the compact capture file into companies. */
export function readCapture(doc: any): DemandCapture {
  const cols: string[] = Array.isArray(doc?.cols) ? doc.cols : QUARTER_KEYS as string[];
  const companies: Record<string, Company> = {};
  for (const [symbol, c] of Object.entries<any>(doc?.companies || {})) {
    const quarters: Quarter[] = (c.quarters || []).map((row: unknown[]) => {
      const q: any = {};
      cols.forEach((k, i) => { q[k] = k === 'date' || k === 'filed' ? String(row[i]) : numOrNull(row[i]); });
      for (const k of QUARTER_KEYS) if (!(k in q)) q[k] = null;
      return q as Quarter;
    }).sort((a: Quarter, b: Quarter) => a.date.localeCompare(b.date));
    companies[symbol] = {
      symbol,
      name: String(c.name || symbol),
      quarters,
      prices: sortPrices(c.prices || []),
      ...(c.pricesNote ? { pricesNote: String(c.pricesNote) } : {}),
    };
  }
  const benchmarks: Record<string, Benchmark> = {};
  for (const [symbol, b] of Object.entries<any>(doc?.benchmarks || {})) {
    benchmarks[symbol] = { symbol, name: String(b.name || symbol), prices: sortPrices(b.prices || []) };
  }
  return { capturedAt: String(doc?.capturedAt || ''), about: String(doc?.about || ''), companies, benchmarks };
}

function sortPrices(rows: unknown[]): PricePoint[] {
  return (rows as any[])
    .filter((r) => Array.isArray(r) && typeof r[0] === 'string' && isNum(r[1]))
    .map((r) => [r[0], r[1]] as PricePoint)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Build a company from the live quarterly statements (the rows the data
 * proxy returns). Rows may arrive newest first; they are matched on the
 * period-end date, and a balance sheet or cash flow row with no income row
 * is dropped because a quarter without revenue cannot be read.
 */
export function fromStatements(
  symbol: string,
  name: string,
  income: any[] = [],
  balance: any[] = [],
  cashflow: any[] = [],
  prices: any[] = [],
): Company {
  const m = (v: unknown) => (isNum(v) ? Math.round((v / 1e6) * 10) / 10 : null);
  const byDate = new Map<string, Quarter>();
  for (const r of income || []) {
    if (!r?.date || !isNum(r.revenue) || r.revenue === 0) continue;
    byDate.set(r.date, {
      date: r.date, filed: r.filingDate || r.fillingDate || r.acceptedDate?.slice(0, 10) || r.date,
      rev: m(r.revenue), gp: m(r.grossProfit), oi: m(r.operatingIncome), ni: m(r.netIncome),
      inv: null, cl: null, cash: null, debt: null, ocf: null, capex: null, sh: m(r.weightedAverageShsOutDil),
    });
  }
  for (const r of balance || []) {
    const q = byDate.get(r?.date);
    if (!q) continue;
    q.inv = m(r.inventory);
    const cl = (isNum(r.deferredRevenue) ? r.deferredRevenue : 0) + (isNum(r.deferredRevenueNonCurrent) ? r.deferredRevenueNonCurrent : 0);
    q.cl = m(cl);
    q.cash = m(r.cashAndShortTermInvestments);
    q.debt = m(r.totalDebt);
  }
  for (const r of cashflow || []) {
    const q = byDate.get(r?.date);
    if (!q) continue;
    q.ocf = m(r.operatingCashFlow);
    q.capex = isNum(r.capitalExpenditure) ? Math.abs(m(r.capitalExpenditure)!) : null;
  }
  const px = sortPrices((prices || []).map((p: any) => [p?.date, isNum(p?.price) ? p.price : p?.close]));
  return {
    symbol, name,
    quarters: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    prices: px,
  };
}

/** The company as a reader could have seen it at the end of `asOf`. */
export function pointInTime(c: Company, asOf: string): Company {
  return {
    ...c,
    quarters: c.quarters.filter((q) => q.filed <= asOf),
    prices: c.prices.filter((p) => p[0] <= asOf),
  };
}

/** The last close on or before `date`. */
export function closeOn(prices: PricePoint[], date: string): { date: string; close: number } | null {
  let lo = 0;
  let hi = prices.length - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid][0] <= date) { hit = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return hit < 0 ? null : { date: prices[hit][0], close: prices[hit][1] };
}

/** The first close on or after `date`. */
export function closeAfter(prices: PricePoint[], date: string): { date: string; close: number } | null {
  let lo = 0;
  let hi = prices.length - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid][0] >= date) { hit = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return hit < 0 ? null : { date: prices[hit][0], close: prices[hit][1] };
}

/** Whole days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** `date` moved by whole days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The calendar quarter a fiscal quarter mostly covers, as `YYYY-Qn`.
 *
 * Fiscal calendars disagree: Micron's quarter ends early September, NVIDIA's
 * late July, Vertiv's on the 30th. Stepping 45 days back from the period end
 * lands in the middle of the three months the quarter reported, so a
 * June–August quarter and a July–September one are both read as Q3 rather
 * than one of them leaking into the next quarter. A cohort sums its members
 * by this key.
 */
export function calendarQuarter(periodEnd: string): string {
  const d = new Date(Date.parse(`${periodEnd}T00:00:00Z`) - 45 * 86_400_000);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/** The `YYYY-Qn` key `n` quarters earlier. */
export function shiftQuarter(key: string, n: number): string {
  const [y, q] = key.split('-Q').map(Number);
  const idx = y * 4 + (q - 1) - n;
  return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
}
