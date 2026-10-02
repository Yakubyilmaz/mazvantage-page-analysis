/* ==========================================================================
   Maz Vantage — the Stock Screener's company filters

   The screener list is one vendor request for the whole universe, and it
   carries about eight figures per company: price, size, volume, beta, the
   last dividend, sector, industry, exchange. Everything else a reader might
   want to filter on — a margin, a growth rate, one of our scores, what the
   sell side thinks — is at least one more request **per company**. So these
   filters work the way the rest of this app spends quota: nothing is fetched
   until the reader asks, the ask says what it costs, and a run tests the
   largest companies first and says how many it reached.

   Three families of metric, in picker order:

     Our scores        the lite factor scores Investment Ideas ranks on
     Wall Street       the analyst rating tally, on the same 1-5 scale
     Statistics        every numeric row of the Statistics & Metrics tab

   The third is the one worth explaining. Those rows are **not** redefined
   here. For each company tested, the feeds a metric needs are wrapped in an
   ordinary dataset and run through the report's own `analyse()` and the
   tab's own `buildGroups()`, and the filter reads the `raw` number that row
   printed. A P/E on the screener is therefore the P/E on the tab by
   construction, and a row added to the tab is a filter as soon as its feeds
   are listed below — `tests/screener-filters.test.ts` fails until they are.

   `STAT_FEEDS` says which feeds each row needs. It was derived, not guessed:
   every feed was removed from the bundled AAPL snapshot in turn, and each
   row's list is the smallest set that still reproduces the value the full
   report prints (the test re-checks this). Twenty-one rows AAPL cannot fill
   were mapped by reading the code. The lists name each row's **primary**
   source. Where the model falls back to a second feed — a figure the vendor
   left out, rebuilt from the statements — a screen reads n/a where the full
   report would have found a number. That makes a screen narrower than it
   could be, never wrong: a company without the figure fails the filter.
   ========================================================================== */

import { dec, isNum, money, mult, num, pct } from './format';
import { fetchFor, makeDataset, mapLimited, type FeedResult } from './fmp';
import { analyse, gradesFromFeed, returnsFromPrices, scoreLite, LITE_SOURCES } from './model';
import { buildGroups, type StatKind } from './statistics';
import { BAG_FEED, BAG_SHAPE, MAX_CANDIDATES, MIN_CANDIDATES, REQUEST_BUDGET } from './ideas';
import { FACTOR_BY_KEY, FACTOR_KEYS } from './factors';
import { MAX_SCORE, loadSectorStats, sectorLookup } from './grading';
import { MARKET_ETF, SECTOR_ETF } from './nav';

/* ==========================================================================
   1. Units — what a typed number means
   ========================================================================== */

/**
 * How a threshold is typed and printed.
 *
 *   pct     stored 0.10, typed 10, suffixed %
 *   mult    stored 20,   typed 20, suffixed ×
 *   num     a plain ratio (beta, Altman Z)
 *   money   stored 2e9,  typed 2b — k, m, b and t are all understood
 *   count   shares, headcount, analysts; k/m/b accepted
 *   price   per share, in the company's reporting currency
 *   days    a cycle length
 *   score   our 0-5 scale
 *   year    a calendar year
 */
export type InputKind = 'pct' | 'mult' | 'num' | 'money' | 'count' | 'price' | 'days' | 'score' | 'year';

const KIND_OF: Record<StatKind, InputKind> = {
  money: 'money', price: 'price', perShare: 'price', pct: 'pct', signed: 'pct', mult: 'mult',
  ratio: 'num', count: 'count', whole: 'count', days: 'days', year: 'year',
};

export const unitOf = (kind: InputKind) => ({
  pct: '%', mult: '×', num: '', money: '', count: '', price: 'per share', days: 'days', score: `/ ${MAX_SCORE}`, year: '',
} as Record<InputKind, string>)[kind];

const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

/** What was typed -> the stored threshold, or null for "no number". */
export function parseInput(kind: InputKind, text: string): number | null {
  const clean = String(text ?? '').trim().toLowerCase().replace(/,/g, '').replace(/[−–]/g, '-').replace(/[%×x$]/g, '');
  const m = /^([+-]?\d*\.?\d+)\s*([kmbt])?$/.exec(clean);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2]) n *= SCALE[m[2]];
  if (!Number.isFinite(n)) return null;
  return kind === 'pct' ? n / 100 : n;
}

const tidy = (v: number) => String(Number(v.toFixed(4)));

/** A stored threshold -> what goes back in the box. */
export function toInput(kind: InputKind, v: number | null | undefined): string {
  if (!isNum(v)) return '';
  if (kind === 'pct') return tidy(v * 100);
  if (kind === 'money' || kind === 'count') {
    const a = Math.abs(v);
    for (const [s, f] of [['t', 1e12], ['b', 1e9], ['m', 1e6]] as const) if (a >= f) return `${tidy(v / f)}${s}`;
  }
  return tidy(v);
}

/** A value for the table, in the unit its filter is typed in. */
export function formatValue(kind: InputKind, v: unknown): string {
  if (!isNum(v)) return 'n/a';
  switch (kind) {
    case 'pct': return pct(v);
    case 'mult': return mult(v, 2);
    case 'money': return money(v, { currency: '' });
    case 'count': return num(v, Math.abs(v) >= 1e3 ? 2 : 0);
    case 'days': return `${dec(v, 0)} days`;
    case 'year': return String(v);
    default: return dec(v, 2);
  }
}

/* ==========================================================================
   2. The metric registry
   ========================================================================== */

export interface ScreenMetric {
  id: string;
  label: string;
  /** picker heading */
  group: string;
  kind: InputKind;
  /** per-company feeds, by `FEEDS` name; `benchmarks` is the SPY + sector ETF pair */
  feeds: string[];
  /** what period the figure covers, from the Statistics row */
  basis?: string;
  /** one line for the editor */
  hint?: string;
}

export const OUR_SCORES = 'Our scores';
export const WALL_STREET = 'Wall Street';

/**
 * Feeds per Statistics row, keyed by the tab's group key and the row's label.
 * Space-separated `FEEDS` names. See the header for how this was derived.
 */
const STAT_FEEDS: Record<string, Record<string, string>> = {
  company: {
    'Employees': 'profile',
    'Listed since': 'profile',
  },
  price: {
    'Price': 'profile',
    'Change today': 'quote',
    'Open': 'quote',
    'Previous close': 'quote',
    '50-day average': 'quote',
    '200-day average': 'quote',
    'Volume': 'quote',
    'Average volume': 'profile',
    'Volume against average': 'quote profile',
    'Beta': 'profile',
  },
  size: {
    'Market capitalisation': 'scores',
    'Enterprise value': 'metricsTtm',
    'Shares outstanding': 'sharesFloat',
    'Free float': 'sharesFloat',
    'Closely held': 'sharesFloat',
    'Float share': 'sharesFloat',
    'Diluted share count growth': 'growth',
    'Employees': 'profile',
    'Revenue per employee': 'profile scores',
  },
  multiples: {
    'P/E': 'ratiosTtm',
    'P/E (diluted)': 'ratiosTtm',
    'P/E (forward)': 'profile estimates',
    'PEG': 'ratiosTtm',
    'PEG (diluted)': 'ratiosTtm',
    'PEG (forward, non-GAAP)': 'profile estimates',
    'Price / book': 'ratiosTtm',
    'Price / sales': 'ratiosTtm',
    'Price / sales (forward)': 'scores estimates',
    'Price / free cash flow': 'ratiosTtm',
    'Price / operating cash flow': 'ratiosTtm',
    'EV / sales': 'metricsTtm',
    'EV / EBITDA': 'metricsTtm',
    'EV / EBIT': 'metricsTtm scores',
    'EV / operating cash flow': 'metricsTtm',
    'EV / free cash flow': 'metricsTtm',
    'Enterprise value multiple': 'ratiosTtm',
    'Debt / market capitalisation': 'ratiosTtm',
  },
  fairvalue: {
    'Discounted cash flow': 'dcfLevered',
    'Discount to that value': 'profile dcfLevered',
    'Price / fair value': 'ratiosTtm',
    'Graham number': 'metricsTtm',
    'Graham net-net': 'metricsTtm',
    'Fair P/E for this growth': 'estimates',
    'Price target (consensus)': 'priceTarget',
    'Price target (median)': 'priceTarget',
    'Implied upside': 'profile priceTarget',
    'Implied total return': 'profile ratiosTtm priceTarget',
  },
  yields: {
    'Earnings yield': 'metricsTtm',
    'Free cash flow yield': 'metricsTtm',
    'Owner earnings yield': 'scores ownerEarnings',
    'Dividend yield': 'ratiosTtm',
    'Buyback yield': 'scores cashflow',
    'Shareholder yield': 'ratiosTtm scores cashflow',
  },
  pershare: {
    'Revenue per share': 'ratiosTtm',
    'Earnings per share': 'ratiosTtm',
    'Net income per share': 'ratiosTtm',
    'Operating cash flow per share': 'ratiosTtm',
    'Free cash flow per share': 'ratiosTtm',
    'Owner earnings per share': 'ownerEarnings',
    'Capital expenditure per share': 'ratiosTtm',
    'Book value per share': 'ratiosTtm',
    'Tangible book value per share': 'ratiosTtm',
    'Shareholders’ equity per share': 'ratiosTtm',
    'Cash per share': 'ratiosTtm',
    'Interest-bearing debt per share': 'ratiosTtm',
    'Dividend per share': 'ratiosTtm',
  },
  margins: {
    'Gross margin': 'ratiosTtm',
    'Operating margin': 'ratiosTtm',
    'EBIT margin': 'ratiosTtm',
    'EBITDA margin': 'ratiosTtm',
    'Pre-tax margin': 'ratiosTtm',
    'Net margin': 'ratiosTtm',
    'Continuing operations margin': 'ratiosTtm',
    'Bottom-line margin': 'ratiosTtm',
    'Operating cash flow margin': 'ratiosTtm',
    'Effective tax rate': 'ratiosTtm',
    'Tax burden': 'metricsTtm',
    'Interest burden': 'metricsTtm',
  },
  returns: {
    'Return on equity': 'metricsTtm',
    'Return on assets': 'metricsTtm',
    'Return on invested capital': 'metricsTtm',
    'Return on capital employed': 'metricsTtm',
    'Return on tangible assets': 'metricsTtm',
    'Operating return on assets': 'metricsTtm',
    'Invested capital': 'metricsTtm',
    'Retained earnings': 'scores',
  },
  opex: {
    'Revenue': 'income',
    'Cost of revenue': 'income',
    'Research & development': 'income',
    'Selling & marketing': 'income',
    'General & administrative': 'income',
    'Selling, general & administrative': 'income',
    'Other operating expenses': 'income',
    'Total operating expenses': 'income',
    'Depreciation & amortisation': 'income',
    'Total costs & expenses': 'income',
    'Operating income': 'income',
  },
  efficiency: {
    'Asset turnover': 'ratiosTtm',
    'Fixed asset turnover': 'ratiosTtm',
    'Working capital turnover': 'ratiosTtm',
    'Receivables turnover': 'ratiosTtm',
    'Inventory turnover': 'ratiosTtm',
    'Payables turnover': 'ratiosTtm',
    'Days sales outstanding': 'metricsTtm',
    'Days inventory outstanding': 'metricsTtm',
    'Days payables outstanding': 'metricsTtm',
    'Operating cycle': 'metricsTtm',
    'Cash conversion cycle': 'metricsTtm',
    'Average receivables': 'metricsTtm',
    'Average inventory': 'metricsTtm',
    'Average payables': 'metricsTtm',
    'Capex / revenue': 'metricsTtm',
    'Capex / operating cash flow': 'metricsTtm',
    'Capex / depreciation': 'metricsTtm',
    'R&D / revenue': 'metricsTtm',
    'SG&A / revenue': 'metricsTtm',
    'Stock compensation / revenue': 'metricsTtm',
  },
  position: {
    'Cash & equivalents': 'profile ratiosTtm',
    'Total debt': 'profile ratiosTtm',
    'Net debt': 'profile ratiosTtm',
    'Working capital': 'scores',
    'Current ratio': 'ratiosTtm',
    'Quick ratio': 'ratiosTtm',
    'Cash ratio': 'ratiosTtm',
    'Debt / equity': 'ratiosTtm',
    'Debt / assets': 'ratiosTtm',
    'Debt / capital': 'ratiosTtm',
    'Long-term debt / capital': 'ratiosTtm',
    'Financial leverage': 'ratiosTtm',
    'Net debt / EBITDA': 'metricsTtm',
    'Interest coverage': 'ratiosTtm income',
    'Debt service coverage': 'ratiosTtm',
    'Solvency ratio': 'ratiosTtm',
    'Operating cash flow ratio': 'ratiosTtm',
    'Operating cash flow / debt': 'ratiosTtm',
    'Short-term debt coverage': 'ratiosTtm',
    'Capital expenditure coverage': 'ratiosTtm',
    'Dividend and capex coverage': 'ratiosTtm',
  },
  quality: {
    'Altman Z-score': 'scores',
    'Piotroski F-score': 'scores',
    'Beneish M-Score': 'income balance cashflow',
    'Income quality': 'metricsTtm',
    'Free cash flow / operating cash flow': 'ratiosTtm',
    'Owner earnings': 'ownerEarnings',
    'Free cash flow to equity': 'metricsTtm',
    'Free cash flow to firm': 'metricsTtm',
    'Intangibles / total assets': 'metricsTtm',
    'Tangible asset value': 'metricsTtm',
    'Net current asset value': 'metricsTtm',
  },
  growth: {
    'Revenue growth': 'growth',
    'Revenue growth, 3-year': 'income',
    'Revenue growth, 5-year': 'income',
    'Gross profit growth': 'growth',
    'EBITDA growth': 'growth',
    'EBIT growth': 'growth',
    'Operating income growth': 'growth',
    'Net income growth': 'growth',
    'Net income growth, 5-year': 'growth',
    'EPS growth': 'growth',
    'Diluted EPS growth': 'growth',
    'Operating cash flow growth': 'growth',
    'Free cash flow growth': 'growth',
    'Capital expenditure growth': 'growth',
    'R&D growth': 'growth',
    'SG&A growth': 'growth',
    'Receivables growth': 'growth',
    'Inventory growth': 'growth',
    'Total asset growth': 'growth',
    'Debt growth': 'growth',
    'Book value per share growth': 'growth',
    'Dividend per share growth': 'growth',
    'Dividend growth, 3-year': 'growth',
  },
  'pershare-growth': {
    'Revenue per share, 3-year': 'growth',
    'Revenue per share, 5-year': 'growth',
    'Revenue per share, 10-year': 'growth',
    'Net income per share, 3-year': 'growth',
    'Net income per share, 5-year': 'growth',
    'Net income per share, 10-year': 'growth',
    'Operating cash flow per share, 3-year': 'growth',
    'Operating cash flow per share, 5-year': 'growth',
    'Operating cash flow per share, 10-year': 'growth',
    'Equity per share, 3-year': 'growth',
    'Equity per share, 5-year': 'growth',
    'Equity per share, 10-year': 'growth',
    'Dividend per share, 3-year': 'growth',
    'Dividend per share, 5-year': 'growth',
    'Dividend per share, 10-year': 'growth',
  },
  forecast: {
    'Analysts covering (earnings)': 'estimates',
    'Analysts covering (revenue)': 'estimates',
    'Forecast revenue growth': 'estimates',
    'Forecast earnings growth': 'estimates',
    'Forecast EPS growth': 'estimates',
    'Forecast revenue': 'estimates',
    'Forecast EBITDA': 'estimates',
    'Forecast EBIT': 'estimates',
    'Forecast net income': 'estimates',
    'Forecast EPS': 'estimates',
    'Forecast return on equity': 'profile ratiosTtm cashflow estimates',
    'Earnings retention': 'profile ratiosTtm cashflow estimates',
  },
  quarter: {
    'Earnings per share': 'earnings',
    'Earnings per share expected': 'earnings',
    'Earnings surprise': 'earnings',
    'Revenue': 'earnings',
    'Revenue expected': 'earnings',
    'Revenue surprise': 'earnings',
  },
  momentum: {
    'Return, 1 month': 'prices',
    'Return, 3 months': 'prices',
    'Return, 6 months': 'prices',
    'Return, 9 months': 'prices',
    'Return, 1 year': 'prices',
    'Return, year to date': 'prices',
    'Sector return, 1 year': 'benchmarks',
    'Market return, 1 year': 'benchmarks',
    'Excess over sector': 'prices benchmarks',
    'Excess over market': 'prices benchmarks',
    'Price / 50-day average': 'quote',
    'Price / 200-day average': 'quote',
    'Below 52-week high': 'quote',
    'Above 52-week low': 'quote',
    'Weekly volatility': 'prices',
    'Maximum drawdown': 'prices',
    'Cost of equity': 'profile',
  },
  dividends: {
    'Dividend yield': 'ratiosTtm',
    'Dividend per share': 'ratiosTtm',
    'Last dividend': 'profile',
    'Payout ratio': 'ratiosTtm',
    'Cash payout ratio': 'ratiosTtm',
    'Years of history': 'dividends',
    'Dividend growth': 'dividends',
    'Deepest annual cut': 'dividends',
  },
  ownership: {
    'Insider shares acquired': 'insiderStats',
    'Insider shares disposed': 'insiderStats',
    'Insider net': 'insiderStats',
    'Acquired / disposed': 'insiderStats',
    'Institutional holders listed': 'institutional',
    'Largest holder’s stake': 'institutional',
    'Largest holder’s position': 'institutional',
  },
};

/* Rows the tab prints twice, once in each of two groups, with the same
   figure. The screener lists each once, under the group a reader would look
   in — headcount under size, the dividend under dividends. */
const DUPLICATES = new Set(['company|Employees', 'yields|Dividend yield', 'pershare|Dividend per share']);

/* Two labels mean different figures in different groups. On the tab the card
   title says which; a filter chip has no card, so the label has to. */
const QUALIFIED: Record<string, string> = {
  'quarter|Earnings per share': 'Earnings per share, last quarter',
  'quarter|Revenue': 'Revenue, last quarter',
  'opex|Revenue': 'Revenue, filed year',
};

const slug = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const statId = (group: string, label: string) => `stat:${group}:${slug(label)}`;

/**
 * An analysis with nothing in it, for reading the tab's row list.
 *
 * `buildGroups` builds its rows from an analysis, and every row it builds is
 * printed whether or not there is a figure — except the operating expense
 * card, which lists its lines only when the income statement came back. The
 * stub says it did, with every line empty, so those rows are listed too.
 */
function emptyAnalysis() {
  return {
    facts: {}, val: {}, growth: {}, forecast: {}, momentum: {}, dividends: {}, quarter: {},
    ownerEarnings: {}, insiders: {}, ds: makeDataset('—', {}),
    opex: { available: true, latest: {}, rows: [] },
  };
}

/** Every Statistics row the screener can filter on: `{ id, key, label, group, kind }`. */
export function statRows() {
  const out: { id: string; key: string; groupKey: string; label: string; group: string; kind: StatKind; basis: string; title: string }[] = [];
  for (const g of buildGroups(emptyAnalysis())) {
    for (const r of g.rows) {
      if (!r.kind) continue;
      out.push({ id: statId(g.key, r.label), key: `${g.key}|${r.label}`, groupKey: g.key, label: r.label, group: g.title, kind: r.kind, basis: r.basis, title: r.title });
    }
  }
  return out;
}

const SCORE_HINT = `Graded against the company’s own sector, 0 to ${MAX_SCORE}. The lighter Investment Ideas score, from the TTM feeds — not the full report’s grade.`;

function buildRegistry(): ScreenMetric[] {
  const scores: ScreenMetric[] = [
    {
      id: 'score:overall', label: 'Overall score (Maz Vantage Quant)', group: OUR_SCORES, kind: 'score',
      feeds: ['ratiosTtm', 'metricsTtm'], hint: `${SCORE_HINT} Built from the ratios and key-metrics feeds, like the Watchlist’s Maz Vantage Quant column.`,
    },
    ...FACTOR_KEYS.map((k): ScreenMetric => ({
      id: `score:${k}`, label: `${FACTOR_BY_KEY[k].title} score`, group: OUR_SCORES, kind: 'score',
      feeds: [...new Set<string>((LITE_SOURCES[k] || []).map((b: string) => (BAG_FEED as any)[b]))], hint: SCORE_HINT,
    })),
  ];
  const street: ScreenMetric[] = [
    {
      id: 'ws:score', label: 'Analyst rating', group: WALL_STREET, kind: 'score', feeds: ['grades'],
      hint: 'The sell side’s published ratings averaged on a 1-5 scale: 5 strong buy, 4 buy, 3 hold, 2 sell, 1 strong sell. Their opinion, not our grade.',
    },
    {
      id: 'ws:buyShare', label: 'Rated buy or better', group: WALL_STREET, kind: 'pct', feeds: ['grades'],
      hint: 'Share of the analysts covering the company who rate it buy or strong buy.',
    },
    {
      id: 'ws:total', label: 'Analysts rating it', group: WALL_STREET, kind: 'count', feeds: ['grades'],
      hint: 'How many published ratings the tally is built from.',
    },
  ];
  const rows = statRows().filter((r) => !DUPLICATES.has(r.key));
  const stats = rows.map((r): ScreenMetric => ({
    id: r.id,
    label: QUALIFIED[r.key] || r.label,
    group: r.group,
    kind: KIND_OF[r.kind],
    feeds: (STAT_FEEDS[r.groupKey]?.[r.label] || '').split(' ').filter(Boolean),
    basis: r.basis,
    hint: r.title || undefined,
  }));
  return [...scores, ...street, ...stats];
}

let registry: ScreenMetric[] | null = null;
let byId: Map<string, ScreenMetric> | null = null;

/** Every filterable metric, in picker order. Built once, on first use. */
export function screenMetrics(): ScreenMetric[] {
  if (!registry) {
    registry = buildRegistry();
    byId = new Map(registry.map((m) => [m.id, m]));
  }
  return registry;
}

export function screenMetric(id: string): ScreenMetric | undefined {
  screenMetrics();
  return byId!.get(id);
}

/** `[{ name, metrics }]` in picker order: our scores, Wall Street, then the tab's groups. */
export function metricGroups() {
  const out = new Map<string, ScreenMetric[]>();
  for (const m of screenMetrics()) {
    if (!out.has(m.group)) out.set(m.group, []);
    out.get(m.group)!.push(m);
  }
  return [...out].map(([name, metrics]) => ({ name, metrics }));
}

/* ==========================================================================
   3. Filters
   ========================================================================== */

export type FilterOp = 'gte' | 'lte' | 'between';

export interface ScreenFilter {
  id: string;
  metric: string;
  op: FilterOp;
  /** a number for gte/lte, a pair for between (either end may be open); null until typed */
  value: number | [number | null, number | null] | null;
}

export const OPS: { key: FilterOp; label: string }[] = [
  { key: 'gte', label: 'at least' }, { key: 'lte', label: 'at most' }, { key: 'between', label: 'between' },
];

/** A filter with no number yet is a chip waiting to be filled in, not a rule. */
export function isActive(f: ScreenFilter) {
  if (Array.isArray(f.value)) return isNum(f.value[0]) || isNum(f.value[1]);
  return isNum(f.value);
}

/**
 * Does one company's figure pass one filter?
 *
 * A missing figure fails: a screen asking for a margin above 20% must not
 * admit the companies it knows nothing about. And a multiple "at most" a
 * number must be positive — a P/E of -8 is a loss, not a bargain, and a
 * negative debt/equity is negative equity — which is the same default the
 * Investment Ideas rules use.
 */
export function passes(f: ScreenFilter, m: ScreenMetric, v: unknown): boolean {
  if (!isNum(v)) return false;
  if (Array.isArray(f.value)) {
    const [lo, hi] = f.value;
    return (!isNum(lo) || v >= lo) && (!isNum(hi) || v <= hi);
  }
  if (!isNum(f.value)) return true;
  if (f.op === 'lte') return (m.kind !== 'mult' || v > 0) && v <= f.value;
  return v >= f.value;
}

/** The sentence on a chip: "P/E at most 20×". */
export function filterText(f: ScreenFilter, m: ScreenMetric) {
  const show = (v: number | null | undefined) => {
    if (!isNum(v)) return 'any';
    const u = unitOf(m.kind);
    return `${toInput(m.kind, v)}${u && u !== 'per share' && u !== 'days' ? (u.startsWith('/') ? ` ${u}` : u) : ''}`;
  };
  if (!isActive(f)) return `${m.label}: any`;
  if (Array.isArray(f.value)) {
    const [lo, hi] = f.value;
    if (isNum(lo) && isNum(hi)) return `${m.label} ${show(lo)} to ${show(hi)}`;
    return isNum(lo) ? `${m.label} at least ${show(lo)}` : `${m.label} at most ${show(hi)}`;
  }
  return `${m.label} ${f.op === 'lte' ? 'at most' : 'at least'} ${show(f.value)}`;
}

/* ==========================================================================
   4. Measuring companies
   ========================================================================== */

/** What a tested row carries: the raw feeds it has, and every figure they give. */
export interface RowScreen {
  feeds: Record<string, FeedResult>;
  values: Record<string, number | null>;
  /** the SPY and sector ETF series, once a momentum filter has asked for them */
  bench?: any;
}

const screenOf = (row: any): RowScreen | undefined => row.screen;

/** Has this row had every feed the metric reads (whatever came back)? */
export function isMeasured(row: any, m: ScreenMetric) {
  const s = screenOf(row);
  return !!s && m.feeds.every((f) => f in s.feeds);
}

export const valueOf = (row: any, id: string) => screenOf(row)?.values?.[id] ?? null;

/** Requests one company costs for these metrics, before anything is cached. */
export function feedsFor(metrics: ScreenMetric[]) {
  return [...new Set(metrics.flatMap((m) => m.feeds))];
}

/** How many companies one run tests: the Investment Ideas budget, spread over the feeds. */
export function runCap(metrics: ScreenMetric[]) {
  const per = Math.max(1, feedsFor(metrics).filter((f) => f !== 'benchmarks').length);
  return Math.min(MAX_CANDIDATES, Math.max(MIN_CANDIDATES, Math.floor(REQUEST_BUDGET / per)));
}

/** Requests a run over `rows` would make: only the feeds each row is missing. */
export function runCost(rows: any[], metrics: ScreenMetric[]) {
  const feeds = feedsFor(metrics).filter((f) => f !== 'benchmarks');
  let n = 0;
  for (const r of rows) n += feeds.filter((f) => !(f in (screenOf(r)?.feeds || {}))).length;
  return n;
}

/* The benchmark pair a momentum row compares against: SPY and the company's
   sector ETF. One series each, shared by every company in the run. */
const benchmarkCache = new Map<string, Promise<any>>();
let marketSeries: Promise<FeedResult> | null = null;
function benchmarksFor(sector: string) {
  const key = sector || '—';
  if (!benchmarkCache.has(key)) {
    benchmarkCache.set(key, (async () => {
      const etf = SECTOR_ETF[sector];
      // One SPY request however many sectors ask at once: `fmp.ts` caches a
      // result, not a request still in flight.
      marketSeries ??= fetchFor('prices', MARKET_ETF).then((r) => {
        if (r.status === 'error') marketSeries = null;
        return r;
      });
      const [market, industry] = await Promise.all([
        marketSeries,
        etf ? fetchFor('prices', etf) : Promise.resolve(null),
      ]);
      // A failed download is not remembered, so the next run asks again.
      if (market.status === 'error' || industry?.status === 'error') benchmarkCache.delete(key);
      return {
        market: market.status === 'ok' ? market.data : null,
        industry: industry?.status === 'ok' ? industry.data : null,
      };
    })());
  }
  return benchmarkCache.get(key)!;
}

const skipped: FeedResult = { status: 'skipped', data: null };

/* The lite score's momentum reads thirteen months, as Investment Ideas
   fetches it; the report's own price feed is six years. Slicing the longer
   series to the same window gives the same returns without a second request. */
const LITE_WINDOW_DAYS = 400;
function liteWindow(prices: any) {
  if (!Array.isArray(prices)) return prices;
  const from = new Date(Date.now() - LITE_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  return prices.filter((p) => String(p?.date || '') >= from);
}

/** Every figure the row's feeds can give, keyed by metric id. */
function computeValues(row: any, lookup: any) {
  const s = screenOf(row)!;
  const prev = s.values || {};
  const feeds: Record<string, FeedResult> = {};
  for (const [k, r] of Object.entries(s.feeds)) if (k !== 'benchmarks') feeds[k] = r;
  const ds = makeDataset(row.symbol, feeds);
  const values: Record<string, number | null> = {};

  if (Object.keys(feeds).length) {
    const a = analyse(ds, { benchmarks: s.bench ?? null });
    for (const g of buildGroups(a)) for (const r of g.rows) if (r.kind) values[statId(g.key, r.label)] = r.raw ?? null;
  }

  // The lite scores. Each factor reads only its own sources, so one pass over
  // everything loaded gives every factor; the overall is re-run on the two
  // base feeds alone, so it does not drift with whatever else was loaded.
  const bags = {
    ratios: ds.get('ratiosTtm'),
    metrics: ds.get('metricsTtm'),
    growth: ds.get('growth') ? BAG_SHAPE.growth(ds.get('growth')) : null,
    returns: ds.get('prices') ? returnsFromPrices(liteWindow(ds.get('prices'))) : null,
  };
  // Sector distributions are loaded only by a run that asks for a score; a
  // later run that does not keeps the scores the earlier one computed.
  if (lookup) {
    const lite = scoreLite(bags, lookup);
    for (const k of FACTOR_KEYS) values[`score:${k}`] = lite.factors?.[k]?.score ?? null;
    values['score:overall'] = scoreLite({ ratios: bags.ratios, metrics: bags.metrics }, lookup).score ?? null;
  } else {
    for (const [k, v] of Object.entries(prev)) if (k.startsWith('score:')) values[k] = v;
  }

  const grades = gradesFromFeed(ds.get('grades'));
  values['ws:score'] = grades?.score ?? null;
  values['ws:buyShare'] = grades?.buyShare ?? null;
  values['ws:total'] = grades?.total ?? null;

  s.values = values;
}

/**
 * Load what `metrics` need for `rows`, and compute every figure it gives.
 *
 * Only missing feeds are requested, and `fmp.ts` caches each one for ten
 * minutes, so re-running after a change of threshold costs nothing and adding
 * a filter on a feed already loaded costs nothing either. The results live on
 * the row objects, which is also how the market table keeps what it bought.
 */
export async function measureRows(rows: any[], metrics: ScreenMetric[], { onProgress }: { onProgress?: (done: number, total: number) => void } = {}) {
  const feeds = feedsFor(metrics);
  const wantsBench = feeds.includes('benchmarks');
  const wantsScore = metrics.some((m) => m.group === OUR_SCORES);
  const stats = wantsScore ? await loadSectorStats() : null;
  const lookups = new Map<string, any>();
  const lookupFor = (sector: string) => {
    if (!stats) return null;
    if (!lookups.has(sector)) lookups.set(sector, sectorLookup(stats, sector));
    return lookups.get(sector);
  };

  let done = 0;
  await mapLimited(rows, async (row: any) => {
    row.screen = row.screen || { feeds: {}, values: {} };
    const s: RowScreen = row.screen;
    const missing = feeds.filter((f) => f !== 'benchmarks' && !(f in s.feeds));
    const results = await Promise.all(missing.map((f) => fetchFor(f, row.symbol).catch(() => skipped)));
    missing.forEach((f, i) => { s.feeds[f] = results[i]; });
    if (wantsBench && !('benchmarks' in s.feeds)) {
      s.bench = await benchmarksFor(row.sector || '');
      s.feeds.benchmarks = { status: 'ok', data: null };
    }
    computeValues(row, lookupFor(row.sector || ''));
    onProgress?.(++done, rows.length);
  }, 6);
}
