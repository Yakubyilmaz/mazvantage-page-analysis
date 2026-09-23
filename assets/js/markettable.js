/* ==========================================================================
   Maz Vantage — the dense market table

   One table shape, used by every page that lists a lot of companies: All
   Stocks, the ETF directory, and anything added later. It is the interaction
   pattern the big market sites converged on, and it converged for good
   reasons:

     * **Column-set tabs.** Overview, Valuation, Profitability, Growth,
       Dividends, Performance, Analysts — the *same rows* with a different set
       of columns. Far better than one forty-column table, because a reader
       comparing margins does not want P/E in the way.
     * **A sticky identity column.** The symbol stays put while the rest
       scrolls sideways, so you never lose which row you are reading.
     * **Every column sorts.** Click to sort, click again to reverse.
     * **Tabular numerals, right-aligned, colour only on change.** A column of
       numbers you can scan down is most of what makes a table like this
       useful.

   ---------------------------------------------------------------------------
   The one way this differs, and it is a data problem rather than a taste one
   ---------------------------------------------------------------------------

   A site with its own data pipeline fills forty columns for five thousand rows
   server-side and ships the answer. This app has a vendor API metered per
   request, and the split is stark:

     the screener      one request, the whole universe, ~8 usable columns
     everything else   two to five requests PER COMPANY

   So **Overview is free and every other tab is bought**. A tab that needs
   per-company data loads for the fifty rows actually on screen, when the
   reader asks, and says what it will cost first. That is the same consent rule
   the screens and the sector page already follow, and it is why the tab strip
   here shows a cost rather than pretending the data is already there.

   Once loaded, a company's bag is cached by `fmp.js` for the session, so
   paging back to a page you have already filled is free.
   ========================================================================== */

import { el, isNum, pct, price, num, dec, mult, money, signClass } from './util.js';
import { notice } from './ui.js';
import { hasApiKey, mapLimited, fetchFor } from './fmp.js';
import { loadBag } from './ideas.js';

/** Rows per page. */
const PAGE = 50;

/** The state a table keeps: which tab, which sort, which page. */
export function newTableState(sets = STOCK_COLUMN_SETS) {
  return { set: sets[0].key, sort: sets[0].columns[0].key, dir: -1, page: 1, filling: false };
}

/** How many symbols are filled at once when a bought tab is opened. */
const FILL_CONCURRENCY = 6;

/* ==========================================================================
   Cell formatters
   ========================================================================== */

const naSpan = () => el('span', { class: 'subtle', text: 'n/a' });

const fmtMoney = (v) => (isNum(v) ? money(v) : naSpan());
const fmtPrice = (v) => (isNum(v) ? price(v) : naSpan());
const fmtNum = (v, dp = 0) => (isNum(v) ? num(v, dp) : naSpan());
const fmtMult = (v) => (isNum(v) ? mult(v) : naSpan());
const fmtDec = (v, dp = 2) => (isNum(v) ? dec(v, dp) : naSpan());
const fmtPct = (v) => (isNum(v) ? pct(v) : naSpan());

/** A percentage where the sign is the point: signed, coloured. */
const fmtChange = (v) => (isNum(v)
  ? el('span', { class: signClass(v), text: pct(v, { sign: true }) })
  : naSpan());

/* ==========================================================================
   The column sets

   `bags` is what a set costs. An empty list means the screener row already
   carries everything the set needs, which is what makes Overview free.
   ========================================================================== */

/** Screener-row accessors — these cost nothing beyond the one universe call. */
const S = {
  marketCap: (r) => r.marketCap,
  price: (r) => r.price,
  volume: (r) => r.volume,
  beta: (r) => r.beta,
  turnover: (r) => (isNum(r.volume) && isNum(r.price) ? r.volume * r.price : null),
  // The screener gives the last annual dividend per share, not a yield. The
  // division is ours and it is a trailing indicated yield, not a forward one.
  yieldFromDividend: (r) => (isNum(r.lastAnnualDividend) && isNum(r.price) && r.price > 0
    ? r.lastAnnualDividend / r.price : null),
};

/** Bag accessors. `r.bags[bag]` is filled by `fillBags` below. */
const B = (bag, field) => (r) => r.bags?.[bag]?.[field];

export const STOCK_COLUMN_SETS = [
  {
    key: 'overview',
    label: 'Overview',
    bags: [],
    columns: [
      { key: 'marketCap', label: 'Market cap', num: true, get: S.marketCap, fmt: fmtMoney },
      { key: 'price', label: 'Price', num: true, get: S.price, fmt: fmtPrice },
      { key: 'volume', label: 'Volume', num: true, get: S.volume, fmt: (v) => fmtNum(v, 0) },
      { key: 'turnover', label: 'Traded value', num: true, get: S.turnover, fmt: fmtMoney },
      { key: 'beta', label: 'Beta', num: true, get: S.beta, fmt: (v) => fmtDec(v, 2) },
      { key: 'divYield', label: 'Div yield', num: true, get: S.yieldFromDividend, fmt: fmtPct },
      { key: 'sector', label: 'Sector', get: (r) => r.sector, fmt: (v) => v || naSpan() },
      { key: 'industry', label: 'Industry', get: (r) => r.industry, fmt: (v) => v || naSpan() },
    ],
  },
  {
    key: 'valuation',
    label: 'Valuation',
    bags: ['ratios', 'metrics'],
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
    key: 'profitability',
    label: 'Profitability',
    bags: ['ratios', 'metrics'],
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
    key: 'growth',
    label: 'Growth',
    bags: ['growth'],
    columns: [
      { key: 'rev', label: 'Revenue growth', num: true, get: B('growth', 'revenueGrowth'), fmt: fmtChange },
      { key: 'eps', label: 'EPS growth', num: true, get: B('growth', 'epsgrowth'), fmt: fmtChange },
      { key: 'fcf', label: 'FCF growth', num: true, get: B('growth', 'freeCashFlowGrowth'), fmt: fmtChange },
      { key: 'marketCap', label: 'Market cap', num: true, get: S.marketCap, fmt: fmtMoney },
    ],
  },
  {
    key: 'dividends',
    label: 'Dividends',
    bags: ['ratios'],
    columns: [
      { key: 'yield', label: 'Yield (TTM)', num: true, get: B('ratios', 'dividendYieldTTM'), fmt: fmtPct },
      { key: 'indicated', label: 'Last annual', num: true, get: (r) => r.lastAnnualDividend, fmt: fmtPrice },
      { key: 'payout', label: 'Payout ratio', num: true, get: B('ratios', 'dividendPayoutRatioTTM'), fmt: fmtPct },
      { key: 'cover', label: 'FCF / operating CF', num: true, get: B('ratios', 'freeCashFlowOperatingCashFlowRatioTTM'), fmt: fmtMult },
      { key: 'marketCap', label: 'Market cap', num: true, get: S.marketCap, fmt: fmtMoney },
    ],
  },
  {
    key: 'performance',
    label: 'Performance',
    // The dearest tab on the page: a year of daily closes per company rather
    // than one TTM row, which is why it is last and says so.
    bags: ['returns'],
    columns: [
      { key: 'r1m', label: '1 month', num: true, get: B('returns', 'r1m'), fmt: fmtChange },
      { key: 'r6m', label: '6 months', num: true, get: B('returns', 'r6m'), fmt: fmtChange },
      { key: 'r1y', label: '1 year', num: true, get: B('returns', 'r1y'), fmt: fmtChange },
      { key: 'dd', label: 'Worst fall', num: true, get: B('returns', 'drawdown'), fmt: fmtPct },
      { key: 'beta', label: 'Beta', num: true, get: S.beta, fmt: (v) => fmtDec(v, 2) },
    ],
  },
  {
    key: 'analysts',
    label: 'Analysts',
    bags: ['grades'],
    columns: [
      { key: 'score', label: 'Analyst rating', num: true, get: B('grades', 'score'), fmt: (v) => fmtDec(v, 2) },
      { key: 'consensus', label: 'Consensus', get: B('grades', 'consensus'), fmt: (v) => v || naSpan() },
      { key: 'count', label: 'Covering', num: true, get: B('grades', 'total'), fmt: (v) => fmtNum(v, 0) },
      { key: 'buyShare', label: 'Buy or better', num: true, get: B('grades', 'buyShare'), fmt: fmtPct },
      { key: 'marketCap', label: 'Market cap', num: true, get: S.marketCap, fmt: fmtMoney },
    ],
  },
];

/** The fund directory: no fundamentals exist for a fund, so one set only. */
export const FUND_COLUMN_SETS = [
  {
    key: 'overview',
    label: 'Overview',
    bags: [],
    columns: [
      { key: 'marketCap', label: 'Size', num: true, get: S.marketCap, fmt: fmtMoney },
      { key: 'price', label: 'Price', num: true, get: S.price, fmt: fmtPrice },
      { key: 'volume', label: 'Volume', num: true, get: S.volume, fmt: (v) => fmtNum(v, 0) },
      { key: 'turnover', label: 'Traded value', num: true, get: S.turnover, fmt: fmtMoney },
      { key: 'beta', label: 'Beta', num: true, get: S.beta, fmt: (v) => fmtDec(v, 2) },
      { key: 'divYield', label: 'Distribution yield', num: true, get: S.yieldFromDividend, fmt: fmtPct },
      { key: 'exchange', label: 'Exchange', get: (r) => r.exchangeShortName || r.exchange, fmt: (v) => v || naSpan() },
    ],
  },
];

const statementSet = (key,label,fields) => ({key,label,bags:[key],columns:[
  {key:'date',label:'Fiscal year end',get:B(key,'date'),fmt:v=>v||naSpan()},
  ...fields.map(([field,name])=>({key:field,label:name,num:true,get:B(key,field),fmt:fmtMoney})),
]});
export const SCREENER_COLUMN_SETS = [
  STOCK_COLUMN_SETS.find(s=>s.key==='overview'),
  STOCK_COLUMN_SETS.find(s=>s.key==='performance'),
  {key:'technicals',label:'Technicals',bags:['quote'],columns:[
    ...[['price','Price'],['priceAvg50','50-day average'],['priceAvg200','200-day average'],['dayHigh','Day high'],['dayLow','Day low'],['yearHigh','52-week high'],['yearLow','52-week low']].map(([key,label])=>({key,label,num:true,get:B('quote',key),fmt:fmtPrice})),
  ]},
  STOCK_COLUMN_SETS.find(s=>s.key==='valuation'),
  STOCK_COLUMN_SETS.find(s=>s.key==='dividends'),
  STOCK_COLUMN_SETS.find(s=>s.key==='profitability'),
  statementSet('income','Income statement',[['revenue','Revenue'],['grossProfit','Gross profit'],['operatingIncome','Operating income'],['netIncome','Net income']]),
  statementSet('balance','Balance sheet',[['totalAssets','Total assets'],['totalLiabilities','Total liabilities'],['totalStockholdersEquity','Equity'],['totalDebt','Total debt'],['cashAndCashEquivalents','Cash']]),
  statementSet('cashflow','Cash flow',[['operatingCashFlow','Operating cash flow'],['capitalExpenditure','Capital expenditure'],['freeCashFlow','Free cash flow'],['netCashProvidedByInvestingActivities','Investing cash flow'],['netCashProvidedByFinancingActivities','Financing cash flow']]),
];

/* ==========================================================================
   Filling a bought tab
   ========================================================================== */

/**
 * Load the bags a column set needs, for these rows only.
 *
 * Mutates `row.bags`, which is what lets a row keep what it has learned as the
 * reader switches tabs. `fmp.js` caches per request, so a symbol already
 * filled for one tab costs nothing when a second tab needs the same bag.
 */
export async function fillBags(rows, bags, onProgress) {
  const wanted = rows.filter((r) => bags.some((b) => !r.bags?.[b]));
  let done = 0;

  await mapLimited(wanted, async (row) => {
    row.bags = row.bags || {};
    const extra = bags.includes('returns')
      ? { from: new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10) }
      : {};
    await Promise.all(bags.map(async (b) => {
      if (row.bags[b]) return;
      if(['income','cashflow','quote'].includes(b)){
        const result=await fetchFor(b,row.symbol);
        if(result.status==='ok')row.bags[b]=Array.isArray(result.data)?[...result.data].sort((a,c)=>String(c.date).localeCompare(String(a.date)))[0]||{}:result.data||{};
        return;
      }
      row.bags[b] = (await loadBag(b, row.symbol, b === 'returns' ? extra : {})) || {};
    }));
    onProgress?.(++done, wanted.length);
  }, FILL_CONCURRENCY);

  return wanted.length;
}

/* ==========================================================================
   The component
   ========================================================================== */

/**
 * A dense, sortable, tab-switched table over `rows`.
 *
 * Returns a node and owns its own state — sort, page, tab, and whatever the
 * caller's filters put in `state`. None of it is in the URL, deliberately: a
 * re-render per keystroke on a five-thousand-row table is the wrong trade, and
 * the same reasoning already governs the screener panel and the two
 * directories.
 *
 * `identity(row)` renders the sticky first cell, so a caller decides whether a
 * symbol is a link (a company) or plain text (a fund).
 */
export function marketTable({
  rows,
  sets = STOCK_COLUMN_SETS,
  identity,
  perPage = PAGE,
  emptyText = 'Nothing matches that.',
  costNote = null,
  // A caller with its own filters above the table passes a state object it
  // owns, so changing a filter rebuilds the table without throwing away which
  // tab and which sort the reader had chosen. Without one the table keeps its
  // own and resets on every rebuild, which is right for a table nothing
  // filters.
  state = null,
  showTabs = true,
}) {
  const host = el('div', { class: 'mtwrap' });
  state = state || newTableState(sets);

  const draw = () => {
    const set = sets.find((s) => s.key === state.set) || sets[0];
    /* Filtered, because `replaceChildren` is not `el`: it turns a null child
       into the text "null" on the page. With `showTabs: false` — which the
       Quotes screener passes, having its own tab strip — that printed the word
       above the table. */
    host.replaceChildren(...[
      showTabs ? tabStrip(sets, state, set, rows, draw) : null,
      body(set, rows, state, identity, perPage, draw, emptyText),
      costNote ? el('p', { class: 't-tiny subtle mt2', text: costNote }) : null,
    ].filter(Boolean));
  };

  draw();
  return host;
}

/* ---------- the tab strip --------------------------------------------------- */

function tabStrip(sets, state, current, rows, draw) {
  return el('div', { class: 'mttabs', role: 'tablist', 'aria-label': 'Column sets' },
    sets.map((s) => {
      const on = s.key === current.key;
      const free = !s.bags.length;
      return el('button', {
        type: 'button',
        class: `mttab ${on ? 'is-active' : ''}`.trim(),
        role: 'tab',
        'aria-selected': on ? 'true' : 'false',
        title: free
          ? 'Already loaded with the company list'
          : `Needs ${s.bags.join(' and ')} per company — loads the page you are on, when you ask`,
        onclick: () => {
          if (on) return;
          state.set = s.key;
          state.page = 1;
          // A bought tab keeps whatever sort still makes sense; a column that
          // no longer exists falls back to the first one in the new set.
          if (!s.columns.some((c) => c.key === state.sort)) {
            state.sort = s.columns[0].key;
            state.dir = -1;
          }
          draw();
        },
      }, [
        el('span', { text: s.label }),
        free ? null : el('i', { class: 'mttab__c', title: 'Costs requests to fill', text: '·' }),
      ]);
    }));
}

/* ---------- the body -------------------------------------------------------- */

function body(set, rows, state, identity, perPage, draw, emptyText) {
  const col = set.columns.find((c) => c.key === state.sort) || set.columns[0];

  const sorted = [...rows].sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (!col.num) {
      if (x == null || x === '') return y == null || y === '' ? 0 : 1;
      if (y == null || y === '') return -1;
      return state.dir * String(x).localeCompare(String(y));
    }
    const xn = isNum(x), yn = isNum(y);
    // Missing values sink to the bottom whichever way the column is sorted:
    // an unmeasurable company is not the best or the worst, and putting it at
    // either end would read as if it were.
    if (!xn && !yn) return 0;
    if (!xn) return 1;
    if (!yn) return -1;
    if (typeof x === 'string') return state.dir * String(x).localeCompare(String(y));
    return state.dir * (x - y);
  });

  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const page = Math.min(Math.max(1, state.page), pages);
  const slice = sorted.slice((page - 1) * perPage, page * perPage);

  const needsFill = set.bags.length
    && slice.some((r) => set.bags.some((b) => !r.bags?.[b]));

  return el('div', {}, [
    needsFill ? fillBar(set, slice, state, draw) : null,

    slice.length
      ? el('div', { class: 'mtscroll' }, [
          el('table', { class: 'mt' }, [
            el('thead', {}, [el('tr', {}, [
              el('th', { class: 'mt__id', scope: 'col' }, ['Symbol']),
              ...set.columns.map((c) => headerCell(c, state, draw)),
            ])]),
            el('tbody', {}, slice.map((r) => el('tr', {}, [
              el('td', { class: 'mt__id' }, [identity(r)]),
              ...set.columns.map((c) => el('td', { class: c.num ? 'num' : '' }, [
                render(c, r),
              ])),
            ]))),
          ]),
        ])
      : el('p', { class: 'fempty__t', style: { padding: '32px 0', textAlign: 'center' }, text: emptyText }),

    pages > 1 ? pager(page, pages, sorted.length, perPage, state, draw) : null,
  ]);
}

function render(col, row) {
  const v = col.get(row);
  const out = col.fmt(v);
  return out instanceof Node ? out : el('span', { text: String(out ?? '') });
}

function headerCell(col, state, draw) {
  const on = state.sort === col.key;
  return el('th', {
    class: `${col.num ? 'num' : ''} mt__h ${on ? 'is-sorted' : ''}`.trim(),
    scope: 'col',
    'aria-sort': on ? (state.dir === 1 ? 'ascending' : 'descending') : 'none',
  }, [
    el('button', {
      type: 'button', class: 'mt__sort',
      title: `Sort by ${col.label}`,
      onclick: () => {
        if (state.sort === col.key) state.dir = -state.dir;
        else { state.sort = col.key; state.dir = -1; }
        draw();
      },
    }, [
      el('span', { text: col.label }),
      el('i', { class: 'mt__arrow', 'aria-hidden': 'true', text: on ? (state.dir === 1 ? '▲' : '▼') : '' }),
    ]),
  ]);
}

/* ---------- the consent bar for a bought tab -------------------------------- */

/**
 * What a bought tab costs, and the button that agrees to it.
 *
 * Nothing fetches until this is clicked. The arithmetic is stated rather than
 * described — fifty rows times two feeds is a hundred requests, and a reader
 * on a metered key should see that number before it is spent.
 */
function fillBar(set, slice, state, draw) {
  const missing = slice.filter((r) => set.bags.some((b) => !r.bags?.[b]));
  const cost = missing.length * set.bags.length;

  if (!hasApiKey()) {
    return notice(`<b>${set.label}</b> reads ${set.bags.join(' and ')} data per company, which `
      + 'needs a live FMP connection. Add your API key in <code>Settings</code>. The Overview tab '
      + 'works without one because the whole company list arrives in a single request.');
  }

  const progress = el('span', { class: 't-tiny softer' });
  const btn = el('button', {
    type: 'button', class: 'btn btn--primary',
    text: `Load ${set.label.toLowerCase()} for these ${missing.length}`,
    onclick: async () => {
      if (state.filling) return;
      state.filling = true;
      btn.disabled = true;
      btn.textContent = 'Loading…';
      await fillBags(missing, set.bags, (done, total) => {
        progress.textContent = ` ${done} of ${total}…`;
      });
      state.filling = false;
      draw();
    },
  });

  return el('div', { class: 'mtfill' }, [
    el('div', {}, [
      el('p', { class: 'mtfill__t', text: `${set.label} is not loaded for this page yet.` }),
      el('p', { class: 'mtfill__b', text: `The company list costs one request; this tab costs `
        + `${set.bags.length} per company. Filling the ${missing.length} rows on this page is about `
        + `${cost} requests. Rows already loaded are reused, and paging back here later is free.` }),
    ]),
    el('div', { class: 'mtfill__a' }, [btn, progress]),
  ]);
}

/* ---------- paging ---------------------------------------------------------- */

function pager(page, pages, total, perPage, state, draw) {
  const go = (n) => () => { state.page = n; draw(); };
  return el('nav', { class: 'fpager', 'aria-label': 'Table pages' }, [
    el('button', { type: 'button', class: 'btn', text: '← Previous',
      disabled: page <= 1 ? true : null, onclick: go(page - 1) }),
    el('span', { class: 'fpager__n',
      text: `${num((page - 1) * perPage + 1, 0)}–${num(Math.min(page * perPage, total), 0)} of ${num(total, 0)}` }),
    el('button', { type: 'button', class: 'btn', text: 'Next →',
      disabled: page >= pages ? true : null, onclick: go(page + 1) }),
  ]);
}
