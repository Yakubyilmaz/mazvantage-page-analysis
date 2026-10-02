/* ==========================================================================
   Maz Vantage — the dense market table: column sets and filling (from markettable.js)

   One table shape for every page that lists a lot of companies: column-set
   tabs over the same rows, a sticky identity column, every column sortable.

   The data problem that shapes it: the screener is one request for the whole
   universe with ~8 usable columns, and everything else is two to five
   requests PER COMPANY. So Overview is free and every other tab is bought —
   loaded for the rows on screen, when the reader asks, after saying what it
   will cost. A filled company's bag is cached by `fmp.ts` for the session.

   Formatters return a `Cell` rather than markup; the component decides how a
   missing value and a signed change look.
   ========================================================================== */

import { dec, isNum, money, mult, num, pct, price } from './format';
import { fetchFor, mapLimited } from './fmp';
import { loadBag } from './ideas';

/** What a formatter returns: plain text, or text with a tone. */
export type Cell = string | { text: string; tone: 'na' | 'pos' | 'neg' | '' };

export interface Column {
  key: string;
  label: string;
  num?: boolean;
  get: (row: any) => any;
  fmt: (v: any) => Cell;
  /** Draws the cell as a component instead of text (a grade pill). `fmt` still sorts nothing; `get` sorts. */
  render?: (v: any, row: any) => unknown;
}

export interface ColumnSet {
  key: string;
  label: string;
  /** What the set costs per company. Empty means the screener row carries it. */
  bags: string[];
  columns: Column[];
}

export interface TableState {
  set: string;
  sort: string;
  dir: 1 | -1;
  page: number;
}

/** Rows per page. */
export const PAGE = 50;
/** How many symbols are filled at once when a bought tab is opened. */
const FILL_CONCURRENCY = 6;

export function newTableState(sets: ColumnSet[] = STOCK_COLUMN_SETS): TableState {
  return { set: sets[0].key, sort: sets[0].columns[0].key, dir: -1, page: 1 };
}

/* ---------- cell formatters ------------------------------------------------- */

const NA: Cell = { text: 'n/a', tone: 'na' };
const fmtMoney = (v: unknown): Cell => (isNum(v) ? money(v) : NA);
const fmtPrice = (v: unknown): Cell => (isNum(v) ? price(v) : NA);
const fmtNum = (v: unknown, dp = 0): Cell => (isNum(v) ? num(v, dp) : NA);
const fmtMult = (v: unknown): Cell => (isNum(v) ? mult(v) : NA);
const fmtDec = (v: unknown, dp = 2): Cell => (isNum(v) ? dec(v, dp) : NA);
const fmtPct = (v: unknown): Cell => (isNum(v) ? pct(v) : NA);
const fmtText = (v: unknown): Cell => (v ? String(v) : NA);
/** A percentage where the sign is the point: signed, coloured. */
const fmtChange = (v: unknown): Cell => (isNum(v) ? { text: pct(v, { sign: true }), tone: v > 0 ? 'pos' : v < 0 ? 'neg' : '' } : NA);

/* ---------- the column sets -------------------------------------------------- */

/** Screener-row accessors — these cost nothing beyond the one universe call. */
const S = {
  marketCap: (r: any) => r.marketCap,
  price: (r: any) => r.price,
  volume: (r: any) => r.volume,
  beta: (r: any) => r.beta,
  turnover: (r: any) => (isNum(r.volume) && isNum(r.price) ? r.volume * r.price : null),
  // The screener gives the last annual dividend per share, not a yield. The
  // division is ours and it is a trailing indicated yield, not a forward one.
  yieldFromDividend: (r: any) => (isNum(r.lastAnnualDividend) && isNum(r.price) && r.price > 0 ? r.lastAnnualDividend / r.price : null),
};

/** Bag accessors. `r.bags[bag]` is filled by `fillBags` below. */
const B = (bag: string, field: string) => (r: any) => r.bags?.[bag]?.[field];

export const STOCK_COLUMN_SETS: ColumnSet[] = [
  {
    key: 'overview', label: 'Overview', bags: [],
    columns: [
      { key: 'marketCap', label: 'Market cap', num: true, get: S.marketCap, fmt: fmtMoney },
      { key: 'price', label: 'Price', num: true, get: S.price, fmt: fmtPrice },
      { key: 'volume', label: 'Volume', num: true, get: S.volume, fmt: (v) => fmtNum(v, 0) },
      { key: 'turnover', label: 'Traded value', num: true, get: S.turnover, fmt: fmtMoney },
      { key: 'beta', label: 'Beta', num: true, get: S.beta, fmt: (v) => fmtDec(v, 2) },
      { key: 'divYield', label: 'Div yield', num: true, get: S.yieldFromDividend, fmt: fmtPct },
      { key: 'sector', label: 'Sector', get: (r) => r.sector, fmt: fmtText },
      { key: 'industry', label: 'Industry', get: (r) => r.industry, fmt: fmtText },
    ],
  },
  {
    key: 'valuation', label: 'Valuation', bags: ['ratios', 'metrics'],
    columns: [
      { key: 'marketCap', label: 'Market cap', num: true, get: S.marketCap, fmt: fmtMoney },
      { key: 'pe', label: 'P/E', num: true, get: B('ratios', 'priceToEarningsRatioTTM'), fmt: fmtMult },
      { key: 'pb', label: 'P/B', num: true, get: B('ratios', 'priceToBookRatioTTM'), fmt: fmtMult },
      { key: 'ps', label: 'P/S', num: true, get: B('ratios', 'priceToSalesRatioTTM'), fmt: fmtMult },
      { key: 'peg', label: 'PEG', num: true, get: B('ratios', 'priceToEarningsGrowthRatioTTM'), fmt: fmtMult },
      { key: 'evEbitda', label: 'EV/EBITDA', num: true, get: B('metrics', 'evToEBITDATTM'), fmt: fmtMult },
      { key: 'fcfYield', label: 'FCF yield', num: true, get: B('metrics', 'freeCashFlowYieldTTM'), fmt: fmtPct },
    ],
  },
  {
    key: 'profitability', label: 'Profitability', bags: ['ratios', 'metrics'],
    columns: [
      { key: 'gross', label: 'Gross margin', num: true, get: B('ratios', 'grossProfitMarginTTM'), fmt: fmtPct },
      { key: 'operating', label: 'Operating margin', num: true, get: B('ratios', 'operatingProfitMarginTTM'), fmt: fmtPct },
      { key: 'net', label: 'Net margin', num: true, get: B('ratios', 'netProfitMarginTTM'), fmt: fmtPct },
      { key: 'roe', label: 'ROE', num: true, get: B('metrics', 'returnOnEquityTTM'), fmt: fmtPct },
      { key: 'roic', label: 'ROIC', num: true, get: B('metrics', 'returnOnInvestedCapitalTTM'), fmt: fmtPct },
      { key: 'quality', label: 'Cash conversion', num: true, get: B('metrics', 'incomeQualityTTM'), fmt: fmtMult },
    ],
  },
  {
    key: 'growth', label: 'Growth', bags: ['growth'],
    columns: [
      { key: 'rev', label: 'Revenue growth', num: true, get: B('growth', 'revenueGrowth'), fmt: fmtChange },
      { key: 'eps', label: 'EPS growth', num: true, get: B('growth', 'epsgrowth'), fmt: fmtChange },
      { key: 'fcf', label: 'FCF growth', num: true, get: B('growth', 'freeCashFlowGrowth'), fmt: fmtChange },
      { key: 'marketCap', label: 'Market cap', num: true, get: S.marketCap, fmt: fmtMoney },
    ],
  },
  {
    key: 'dividends', label: 'Dividends', bags: ['ratios'],
    columns: [
      { key: 'yield', label: 'Yield (TTM)', num: true, get: B('ratios', 'dividendYieldTTM'), fmt: fmtPct },
      { key: 'indicated', label: 'Last annual', num: true, get: (r) => r.lastAnnualDividend, fmt: fmtPrice },
      { key: 'payout', label: 'Payout ratio', num: true, get: B('ratios', 'dividendPayoutRatioTTM'), fmt: fmtPct },
      { key: 'cover', label: 'FCF / operating CF', num: true, get: B('ratios', 'freeCashFlowOperatingCashFlowRatioTTM'), fmt: fmtMult },
      { key: 'marketCap', label: 'Market cap', num: true, get: S.marketCap, fmt: fmtMoney },
    ],
  },
  {
    // The dearest tab on the page: a year of daily closes per company rather
    // than one TTM row, which is why it is last and says so.
    key: 'performance', label: 'Performance', bags: ['returns'],
    columns: [
      { key: 'r1m', label: '1 month', num: true, get: B('returns', 'r1m'), fmt: fmtChange },
      { key: 'r6m', label: '6 months', num: true, get: B('returns', 'r6m'), fmt: fmtChange },
      { key: 'r1y', label: '1 year', num: true, get: B('returns', 'r1y'), fmt: fmtChange },
      { key: 'dd', label: 'Worst fall', num: true, get: B('returns', 'drawdown'), fmt: fmtPct },
      { key: 'beta', label: 'Beta', num: true, get: S.beta, fmt: (v) => fmtDec(v, 2) },
    ],
  },
  {
    key: 'analysts', label: 'Analysts', bags: ['grades'],
    columns: [
      { key: 'score', label: 'Analyst rating', num: true, get: B('grades', 'score'), fmt: (v) => fmtDec(v, 2) },
      { key: 'consensus', label: 'Consensus', get: B('grades', 'consensus'), fmt: fmtText },
      { key: 'count', label: 'Covering', num: true, get: B('grades', 'total'), fmt: (v) => fmtNum(v, 0) },
      { key: 'buyShare', label: 'Buy or better', num: true, get: B('grades', 'buyShare'), fmt: fmtPct },
      { key: 'marketCap', label: 'Market cap', num: true, get: S.marketCap, fmt: fmtMoney },
    ],
  },
];

const setOf = (key: string) => STOCK_COLUMN_SETS.find((s) => s.key === key)!;

/**
 * The big-banks portfolio's own tab: its 13F figures, which `runIdea` has
 * already put on every row — so it costs nothing to open. "Adding" leads
 * because it is what the portfolio is sorted on.
 */
export const BANK_COLUMN_SET: ColumnSet = {
  key: 'banks', label: 'Banks', bags: [],
  columns: [
    { key: 'adders', label: 'Banks adding', num: true, get: B('banks', 'adders'), fmt: (v) => fmtNum(v, 0) },
    { key: 'holders', label: 'Banks holding', num: true, get: B('banks', 'holders'), fmt: (v) => fmtNum(v, 0) },
    { key: 'cutters', label: 'Banks cutting', num: true, get: B('banks', 'cutters'), fmt: (v) => fmtNum(v, 0) },
    { key: 'stake', label: 'Banks’ stake', num: true, get: B('banks', 'ofCompany'), fmt: (v) => (isNum(v) ? pct(v, { dp: 2 }) : NA) },
    // In percentage points of the company, which is what the portfolio sorts on inside a count.
    { key: 'stakeGain', label: 'Stake change', num: true, get: B('banks', 'stakeGain'),
      fmt: (v) => (isNum(v) ? { text: `${v >= 0 ? '+' : '−'}${num(Math.abs(v) * 100, 2)} pts`, tone: v > 0 ? 'pos' : v < 0 ? 'neg' : '' } : NA) },
    { key: 'change', label: 'Their shares, change', num: true, get: B('banks', 'change'), fmt: fmtChange },
    { key: 'excess', label: 'Beyond all 13F filers', num: true, get: B('banks', 'excess'), fmt: fmtChange },
    { key: 'value', label: 'Banks’ holding', num: true, get: B('banks', 'value'), fmt: fmtMoney },
  ],
};

/** The fund directory: no fundamentals exist for a fund, so one set only. */
export const FUND_COLUMN_SETS: ColumnSet[] = [
  {
    key: 'overview', label: 'Overview', bags: [],
    columns: [
      { key: 'marketCap', label: 'Size', num: true, get: S.marketCap, fmt: fmtMoney },
      { key: 'price', label: 'Price', num: true, get: S.price, fmt: fmtPrice },
      { key: 'volume', label: 'Volume', num: true, get: S.volume, fmt: (v) => fmtNum(v, 0) },
      { key: 'turnover', label: 'Traded value', num: true, get: S.turnover, fmt: fmtMoney },
      { key: 'beta', label: 'Beta', num: true, get: S.beta, fmt: (v) => fmtDec(v, 2) },
      { key: 'divYield', label: 'Distribution yield', num: true, get: S.yieldFromDividend, fmt: fmtPct },
      { key: 'exchange', label: 'Exchange', get: (r) => r.exchangeShortName || r.exchange, fmt: fmtText },
    ],
  },
];

const statementSet = (key: string, label: string, fields: [string, string][]): ColumnSet => ({
  key, label, bags: [key],
  columns: [
    { key: 'date', label: 'Fiscal year end', get: B(key, 'date'), fmt: fmtText },
    ...fields.map(([field, name]) => ({ key: field, label: name, num: true, get: B(key, field), fmt: fmtMoney })),
  ],
});

export const SCREENER_COLUMN_SETS: ColumnSet[] = [
  setOf('overview'),
  setOf('performance'),
  {
    key: 'technicals', label: 'Technicals', bags: ['quote'],
    columns: ([['price', 'Price'], ['priceAvg50', '50-day average'], ['priceAvg200', '200-day average'], ['dayHigh', 'Day high'], ['dayLow', 'Day low'], ['yearHigh', '52-week high'], ['yearLow', '52-week low']] as [string, string][])
      .map(([key, label]) => ({ key, label, num: true, get: B('quote', key), fmt: fmtPrice })),
  },
  setOf('valuation'),
  setOf('dividends'),
  setOf('profitability'),
  statementSet('income', 'Income statement', [['revenue', 'Revenue'], ['grossProfit', 'Gross profit'], ['operatingIncome', 'Operating income'], ['netIncome', 'Net income']]),
  statementSet('balance', 'Balance sheet', [['totalAssets', 'Total assets'], ['totalLiabilities', 'Total liabilities'], ['totalStockholdersEquity', 'Equity'], ['totalDebt', 'Total debt'], ['cashAndCashEquivalents', 'Cash']]),
  statementSet('cashflow', 'Cash flow', [['operatingCashFlow', 'Operating cash flow'], ['capitalExpenditure', 'Capital expenditure'], ['freeCashFlow', 'Free cash flow'], ['netCashProvidedByInvestingActivities', 'Investing cash flow'], ['netCashProvidedByFinancingActivities', 'Financing cash flow']]),
];

/* ---------- filling a bought tab ---------------------------------------------- */

/**
 * Load the bags a column set needs, for these rows only. Mutates `row.bags`,
 * which is what lets a row keep what it has learned as the reader switches
 * tabs; `fmp.ts` caches per request, so a bag shared by two tabs costs once.
 */
export async function fillBags(rows: any[], bags: string[], onProgress?: (done: number, total: number) => void) {
  const wanted = rows.filter((r) => bags.some((b) => !r.bags?.[b]));
  let done = 0;
  await mapLimited(wanted, async (row: any) => {
    row.bags = row.bags || {};
    const extra = bags.includes('returns') ? { from: new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10) } : {};
    await Promise.all(bags.map(async (b) => {
      if (row.bags[b]) return;
      if (['income', 'cashflow', 'quote'].includes(b)) {
        const result = await fetchFor(b, row.symbol);
        if (result.status === 'ok') {
          row.bags[b] = Array.isArray(result.data)
            ? [...result.data].sort((a: any, c: any) => String(c.date).localeCompare(String(a.date)))[0] || {}
            : result.data || {};
        }
        return;
      }
      row.bags[b] = (await loadBag(b, row.symbol, b === 'returns' ? extra : {})) || {};
    }));
    onProgress?.(++done, wanted.length);
  }, FILL_CONCURRENCY);
  return wanted.length;
}

/* ---------- export ------------------------------------------------------------------ */

const cellString = (c: Cell) => (typeof c === 'string' ? c : c.text);

/** The first number a formatted cell prints: "US$4.54t" -> 4.54, "-12.5%" -> -12.5. */
function printedNumber(text: string): number | null {
  const m = /[-−]?\d[\d,]*\.?\d*/.exec(text.replace(/−/g, '-'));
  return m ? Number(m[0].replace(/,/g, '')) : null;
}

/**
 * Every row of a column set as CSV-ready cells — all pages, in the order
 * shown. Numbers go out raw rather than as the "US$4.54t" the table prints,
 * with one exception worked out per column: a column the table prints as a
 * percentage goes out in percent, labelled "(%)", whether its values are held
 * as fractions (0.123) or already as percents (12.3) — the printed figure
 * says which. A value the table has not loaded yet goes out blank.
 */
export function exportColumns(columns: Column[], rows: any[]): { headers: string[]; rows: (string | number | null)[][] } {
  const plan = columns.map((c) => {
    const sample = rows.map((r) => c.get(r)).find(isNum);
    const shown = isNum(sample) ? cellString(c.fmt(sample)) : '';
    const percent = !!c.num && /%\s*$/.test(shown);
    let factor = 1;
    if (percent && isNum(sample)) {
      const printed = printedNumber(shown);
      if (printed != null && Math.abs(printed - sample * 100) < Math.abs(printed - sample)) factor = 100;
    }
    return { c, percent, factor };
  });
  return {
    headers: ['Symbol', 'Name', ...plan.map((p) => (p.percent ? `${p.c.label} (%)` : p.c.label))],
    rows: rows.map((r) => [
      r.symbol ?? '',
      r.companyName || r.name || '',
      ...plan.map(({ c, factor }) => {
        const v = c.get(r);
        if (c.num) return isNum(v) ? Number((v * factor).toPrecision(12)) : null;
        const text = v == null || v === '' ? '' : cellString(c.fmt(v));
        return text === 'n/a' || text === '—' ? '' : text;
      }),
    ]),
  };
}

/* ---------- sorting --------------------------------------------------------------- */

/**
 * Sort by one column. Missing values sink to the bottom whichever way the
 * column is sorted: an unmeasurable company is not the best or the worst.
 */
export function sortRows(rows: any[], col: Column, dir: 1 | -1) {
  return [...rows].sort((a, b) => {
    const x = col.get(a);
    const y = col.get(b);
    if (!col.num) {
      if (x == null || x === '') return y == null || y === '' ? 0 : 1;
      if (y == null || y === '') return -1;
      return dir * String(x).localeCompare(String(y));
    }
    const xn = isNum(x);
    const yn = isNum(y);
    if (!xn && !yn) return 0;
    if (!xn) return 1;
    if (!yn) return -1;
    return dir * (x - y);
  });
}
