/* ==========================================================================
   Maz Vantage — the Financials tab

   The filed statements, as filed. Three of them — income, cash flow, balance
   sheet — each as a chart of the shape and a table of the lines, plus the two
   small cards that answer "and where does that leave it now".

   Nothing on this tab is graded and nothing is compared to a sector. Every
   other tab in the report is an opinion about a number; this one is the
   number. The only arithmetic done here is subtraction between two filed
   lines (working capital, margins, payout cover), and each of those rows says
   it is derived.

   Two things about the data are worth knowing before reading the code:

   - **Annual only.** `fmp.js` fetches `period: 'annual'`, so a column is a
     fiscal year and the newest one can be eleven months old. The TTM figures
     the rest of the report runs on are not here, on purpose: a statement
     column that mixed the two would not add up.
   - **The feed is narrower than a filing.** FMP returns a subset of the lines
     a 10-K carries, and the bundled snapshot is narrower still. A row with no
     figure in any year is dropped rather than printed as a row of n/a, so the
     tables differ in length between a live key and the snapshot.
   ========================================================================== */

import { el, isNum, money, num, pct, dec, trim, yearOf, yoy, fmtDate, signClass } from './util.js';
import { card, notice, feedGate, statLine, ohead, curSymbol, perfCagr } from './ui.js';
import { columnChart, multiLineChart, waterfallChart } from './charts.js';

/* ==========================================================================
   Shared helpers
   ========================================================================== */

/** How many year columns a table shows before the reader asks for the rest. */
const DEFAULT_YEARS = 6;

/** Chronological rows, oldest first, as `deriveFacts` already stores them. */
const statementRows = (a, which) => a.facts.statements[which] || [];

/** The money formatter bound to the company's reporting currency. */
const moneyIn = (a) => (v) => money(v, { currency: curSymbol(a.facts.currency) });

/**
 * A row definition's value across every filed year.
 *
 * `get` takes the statement row and may return null — a line the feed does
 * not carry, or one the company does not report — and the caller decides what
 * an all-null row means.
 */
const seriesOf = (rows, get) => rows.map((r) => {
  const v = get(r);
  return isNum(v) ? v : null;
});

/**
 * The income statement keyed by fiscal year.
 *
 * The cash flow panel measures its own lines against revenue, which lives on
 * the other statement. Matching by year rather than by array position because
 * the two feeds can come back with different numbers of years — a plan that
 * returns eight cash flow statements and ten income statements would
 * otherwise divide 2018's cash by 2016's revenue and print it as a margin.
 */
const incomeByYear = (a) => new Map(
  statementRows(a, 'income').map((r) => [yearOf(r.date), r]));

/**
 * The Perf / CAGR pair for a run of filed years.
 *
 * Measured over the filed history alone, never over the forecast tail some of
 * these charts carry: a compound rate that includes years nobody has reported
 * is a rate for what analysts think, and it would print beside bars that say
 * otherwise.
 */
function runBadges(rows, get, opts = {}) {
  const vals = rows.map(get).map((v) => (isNum(v) ? v : null));
  const from = vals.findIndex(isNum);
  if (from < 0) return null;
  const to = vals.length - 1 - [...vals].reverse().findIndex(isNum);
  if (to <= from) return null;
  return perfCagr(vals[from], vals[to], to - from, opts);
}

/**
 * The consensus years that come after the last filed one.
 *
 * `columnChart` draws anything past `forecastFrom` washed out and hatched, so
 * the two are one chart and still plainly two kinds of number. Only years
 * strictly after the last filed one are taken: the estimate set usually opens
 * on the year the company has already reported, and drawing that twice would
 * put a forecast bar on top of a fact.
 */
function forecastTail(a, lastFiledYear, get) {
  const rows = (a.forecast?.rows || [])
    .filter((r) => isNum(r.year) && r.year > lastFiledYear && isNum(get(r)))
    .sort((x, y) => x.year - y.year);
  return rows.map((r) => ({ year: r.year, value: get(r) }));
}

/* ==========================================================================
   The statements, as data

   One entry per line the tables print. `strong` marks a subtotal — the lines
   a reader's eye should be able to run down without reading the rest — and
   `derived` marks a figure this app computed from two filed lines rather than
   one the statement carries. `fmt` defaults to money in the reporting
   currency.
   ========================================================================== */

const INCOME_ROWS = [
  { label: 'Revenue', get: (r) => r.revenue, strong: true },
  { label: 'Cost of revenue', get: (r) => r.costOfRevenue },
  { label: 'Gross profit', get: (r) => r.grossProfit, strong: true },
  { label: 'Research & development', get: (r) => r.researchAndDevelopmentExpenses },
  { label: 'Selling, general & admin', get: (r) => r.sellingGeneralAndAdministrativeExpenses },
  { label: 'Operating income', get: (r) => r.operatingIncome, strong: true },
  { label: 'EBITDA', get: (r) => r.ebitda },
  { label: 'Interest expense', get: (r) => r.interestExpense },
  { label: 'Net income', get: (r) => r.netIncome, strong: true },
  {
    label: 'Earnings per share (diluted)',
    get: (r) => r.epsDiluted ?? r.eps,
    fmt: (v, a) => (isNum(v) ? `${curSymbol(a.facts.currency)}${dec(v, 2)}` : 'n/a'),
  },
  { label: 'Diluted shares', get: (r) => r.weightedAverageShsOutDil, fmt: (v) => num(v, 2) },

  { label: 'Gross margin', derived: true, fmt: (v) => pct(v), group: 'Margins',
    get: (r) => (r.revenue > 0 && isNum(r.grossProfit) ? r.grossProfit / r.revenue : null) },
  { label: 'Operating margin', derived: true, fmt: (v) => pct(v),
    get: (r) => (r.revenue > 0 && isNum(r.operatingIncome) ? r.operatingIncome / r.revenue : null) },
  { label: 'Net margin', derived: true, fmt: (v) => pct(v),
    get: (r) => (r.revenue > 0 && isNum(r.netIncome) ? r.netIncome / r.revenue : null) },
];

const CASHFLOW_ROWS = [
  { label: 'Net income', get: (r) => r.netIncome },
  { label: 'Operating cash flow', get: (r) => r.operatingCashFlow, strong: true },
  { label: 'Capital expenditure', get: (r) => r.capitalExpenditure },
  { label: 'Free cash flow', get: (r) => r.freeCashFlow, strong: true },
  { label: 'Dividends paid', get: (r) => r.commonDividendsPaid ?? r.netDividendsPaid },
  { label: 'Stock issued', get: (r) => r.commonStockIssuance },
  { label: 'Share repurchases', get: (r) => r.commonStockRepurchased },
  { label: 'Cash conversion', derived: true, fmt: (v) => pct(v), group: 'Quality',
    // Operating cash against the profit it is supposed to have produced. Only
    // meaningful when the company made a profit — dividing cash flow by a loss
    // returns a number, and it means nothing.
    get: (r) => (isNum(r.operatingCashFlow) && isNum(r.netIncome) && r.netIncome > 0
      ? r.operatingCashFlow / r.netIncome : null) },
];

const BALANCE_ROWS = [
  { label: 'Cash & short-term investments', get: (r) => r.cashAndShortTermInvestments },
  { label: 'Total current assets', get: (r) => r.totalCurrentAssets },
  { label: 'Total assets', get: (r) => r.totalAssets, strong: true },
  { label: 'Total current liabilities', get: (r) => r.totalCurrentLiabilities },
  { label: 'Total liabilities', get: (r) => r.totalLiabilities, strong: true },
  { label: 'Total debt', get: (r) => r.totalDebt },
  { label: 'Net debt', get: (r) => r.netDebt },
  { label: 'Shareholders’ equity', get: (r) => r.totalStockholdersEquity, strong: true },
  { label: 'Working capital', derived: true, group: 'Derived',
    get: (r) => (isNum(r.totalCurrentAssets) && isNum(r.totalCurrentLiabilities)
      ? r.totalCurrentAssets - r.totalCurrentLiabilities : null) },
  { label: 'Debt / equity', derived: true, fmt: (v) => `${dec(v, 2)}x`,
    get: (r) => (r.totalStockholdersEquity > 0 && isNum(r.totalDebt)
      ? r.totalDebt / r.totalStockholdersEquity : null) },
];

/* ==========================================================================
   The tab

   Three statements, one at a time. They used to run down a single page —
   nine cards and three tables, about eleven screens — which made the balance
   sheet something you scrolled past on the way to nothing in particular.
   Nobody reads three statements at once; they open one.

   Each panel has the same shape, so the strip changes the subject rather than
   the layout: the shape of the statement as a chart, the figures it leaves
   the company with beside it, then the statement itself as a table.

   The basis card sits under the strip rather than inside a panel. What it
   says — annual, as filed, and where that will not tie to the rest of the
   report — is true of all three, and repeating it three times would make it
   read as three different caveats.
   ========================================================================== */

const PANELS = [
  { key: 'income', label: 'Income', build: incomePanel },
  { key: 'balance', label: 'Balance sheet', build: balancePanel },
  { key: 'cash', label: 'Cash flow', build: cashPanel },
];

export function renderFinancialsTab(a, nav = {}) {
  // Every card on this tab reads the same three arrays. With none of them
  // there is no tab, so say why once rather than printing eight empty cards.
  if (!a.facts.hasStatements) {
    return el('div', { class: 'ovw' }, [
      card('fin-none', [
        ohead('Financial statements'),
        feedGate(a, 'income', 'Annual financial statements')
          || notice('No annual financial statements were returned for this company.'),
      ], 'ocard ovw__c12'),
    ]);
  }

  // Chart cards run full width or two-thirds, never a quarter: `charts.js`
  // draws into a fixed 760-wide viewBox and scales the whole drawing with its
  // container, so an axis label in a quarter-width card lands at about 5px.
  // The narrow cards on this tab carry figures instead.
  const panel = el('div', { class: 'ovw', id: 'fin-panel', role: 'tabpanel' });
  let current = PANELS[0].key;

  const buttons = PANELS.map((p) => el('button', {
    type: 'button', class: 'subtab', role: 'tab', id: `fin-tab-${p.key}`,
    'aria-controls': 'fin-panel', text: p.label,
    onclick: () => show(p.key),
  }));

  function show(key) {
    current = key;
    const chosen = PANELS.find((p) => p.key === key) || PANELS[0];
    panel.replaceChildren(...chosen.build(a).filter(Boolean));
    panel.setAttribute('aria-labelledby', `fin-tab-${chosen.key}`);
    buttons.forEach((b, i) => {
      const on = PANELS[i].key === key;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      // One stop for the whole strip, arrow keys inside it — which is what a
      // tablist owes a keyboard, and what three tab stops in a row would not.
      b.tabIndex = on ? 0 : -1;
    });
  }

  const strip = el('div', {
    class: 'subtabs', role: 'tablist', 'aria-label': 'Financial statement',
  }, buttons);

  strip.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = PANELS.findIndex((p) => p.key === current);
    const next = (i + step + PANELS.length) % PANELS.length;
    show(PANELS[next].key);
    buttons[next].focus();
  });

  show(current);

  return el('div', {}, [
    strip,
    panel,
    el('div', { class: 'ovw mt3' }, [basisCard(a, nav)]),
  ]);
}

/* ---------- the three panels ----------------------------------------------
   All three read the same way down the page: three rows of a chart beside the
   figures it leaves you with, then whatever needs the full width, then the
   statement itself.

   The rhythm is the point. Someone who has read one panel should not have to
   work out where anything is on the next one, and a reader who wants the
   table can learn once that it is at the bottom.
   ------------------------------------------------------------------------- */

function incomePanel(a) {
  return [
    revenueEarningsCard(a),
    incomeYearCard(a),

    incomeBridgeCard(a),
    growthCard(a),

    epsCard(a),
    shareCountCard(a),

    marginCard(a),
    statementCard(a, 'income', 'Income statement', INCOME_ROWS,
      'Annual, as filed. The report’s ratios run on trailing twelve months and will not tie to '
      + 'these columns.'),
  ];
}

function balancePanel(a) {
  return [
    balanceHistoryCard(a),
    positionCard(a),

    cashDebtCard(a),
    strengthCard(a),

    workingCapitalCard(a),
    equityCard(a),

    statementCard(a, 'balance', 'Balance sheet', BALANCE_ROWS,
      'Position at each fiscal year end, as filed. The headline figures elsewhere in the report '
      + 'are trailing twelve months and will be more recent than the last column here.'),
  ];
}

function cashPanel(a) {
  return [
    cashGenerationCard(a),
    shareholderReturnCard(a),

    allocationCard(a),
    cashQualityCard(a),

    cashMarginsCard(a),
    statementCard(a, 'cash', 'Cash flow statement', CASHFLOW_ROWS,
      'As filed, which means money leaving the company is negative — capital expenditure, '
      + 'dividends and buybacks all print with a minus.'),
  ];
}

/* ---------- income · revenue and earnings --------------------------------- */

/**
 * The top line and the bottom line, one bar each per filed year.
 *
 * Grouped rather than stacked: net income is not a part of revenue that could
 * be stacked inside it, it is what survived the whole statement, and the gap
 * between the two bars is the thing worth looking at.
 */
function revenueEarningsCard(a) {
  const rows = statementRows(a, 'income');
  const fmt = moneyIn(a);
  const last = rows.at(-1);
  const prev = rows.at(-2);
  const lastYear = yearOf(last?.date);

  const revChange = yoy(last?.revenue, prev?.revenue);
  const niChange = yoy(last?.netIncome, prev?.netIncome);

  // One axis for both, filed years then consensus years. The two series share
  // the tail's year list, so a year the analysts cover for revenue but not for
  // earnings still gets a column with one bar in it rather than shifting the
  // other series along by one.
  const revTail = forecastTail(a, lastYear, (r) => r.revenue);
  const niTail = forecastTail(a, lastYear, (r) => r.netIncome);
  const tailYears = [...new Set([...revTail, ...niTail].map((t) => t.year))].sort((x, y) => x - y);
  const at = (tail, year) => tail.find((t) => t.year === year)?.value ?? null;

  const years = [
    ...rows.map((r) => String(yearOf(r.date))),
    ...tailYears.map((y) => String(y)),
  ];

  return card('fin-revenue', [
    ohead('Revenue and earnings', null,
      'Filed fiscal years, oldest on the left, and then the consensus years — drawn hatched, '
      + 'because a forecast is not a filing. The Perf and CAGR figures under the chart are '
      + 'measured over the filed years alone.'),

    columnChart(years, [
      {
        name: 'Revenue',
        color: 'var(--chart-01)',
        values: [...seriesOf(rows, (r) => r.revenue), ...tailYears.map((y) => at(revTail, y))],
      },
      {
        name: 'Net income',
        color: 'var(--good)',
        values: [...seriesOf(rows, (r) => r.netIncome), ...tailYears.map((y) => at(niTail, y))],
      },
    ], {
      height: 280,
      valueFmt: fmt,
      forecastFrom: tailYears.length ? rows.length : null,
    }),

    runBadges(rows, (r) => r.revenue),

    el('div', { class: 'ostats ostats--split' }, [
      statLine(`Revenue, fiscal ${lastYear ?? 'n/a'}`, fmt(last?.revenue), {
        note: isNum(revChange) ? `${pct(revChange, { sign: true })} YoY` : '',
        tone: signClass(revChange),
      }),
      statLine(`Net income, fiscal ${lastYear ?? 'n/a'}`, fmt(last?.netIncome), {
        note: isNum(niChange) ? `${pct(niChange, { sign: true })} YoY` : '',
        tone: signClass(niChange),
      }),
      tailYears.length ? statLine('Consensus to', String(tailYears.at(-1)), {
        note: `${tailYears.length} forecast year${tailYears.length === 1 ? '' : 's'}`,
      }) : null,
    ].filter(Boolean)),
  ], 'ocard ovw__c8');
}

/* ---------- income · what the last filed year earned ---------------------- */

/**
 * The last filed income statement as eight figures.
 *
 * The counterpart to `positionCard` on the balance panel: the chart beside it
 * is ten years of shape, and this is the year the shape ends on, read down
 * the statement in the order the statement runs. Nothing here is computed
 * except the three margins, which are that year's line over that year's
 * revenue and are marked as the derived rows in the table below are.
 *
 * Filed, not trailing twelve months — the opposite choice to the balance
 * panel, and deliberately so. There the reader wants the position now; here
 * they want the year the two charts above are drawn from.
 */
function incomeYearCard(a) {
  const rows = statementRows(a, 'income');
  const last = rows.at(-1) || {};
  const prev = rows.at(-2);
  const fmt = moneyIn(a);
  const cur = curSymbol(a.facts.currency);

  const margin = (line) => (last.revenue > 0 && isNum(line) ? line / last.revenue : null);
  const delta = (get) => {
    const v = yoy(get(last), prev ? get(prev) : null);
    return isNum(v) ? `${pct(v, { sign: true })} YoY` : '';
  };

  return card('fin-income-year', [
    ohead(`Fiscal ${yearOf(last.date) ?? 'year'}`, null,
      'The last filed year of the statement beside it, top to bottom. Annual and as filed, so '
      + 'these are the figures in the final column of the table below rather than the trailing '
      + 'twelve months the report grades on.'),
    el('div', { class: 'ostats' }, [
      statLine('Revenue', fmt(last.revenue), { note: delta((r) => r.revenue) }),
      statLine('Gross profit', fmt(last.grossProfit), { note: delta((r) => r.grossProfit) }),
      statLine('Operating income', fmt(last.operatingIncome), { note: delta((r) => r.operatingIncome) }),
      statLine('Net income', fmt(last.netIncome), { note: delta((r) => r.netIncome) }),
      statLine('Earnings per share', isNum(last.epsDiluted ?? last.eps)
        ? `${cur}${dec(last.epsDiluted ?? last.eps, 2)}` : 'n/a', { note: 'diluted' }),
      statLine('Gross margin', pct(margin(last.grossProfit))),
      statLine('Operating margin', pct(margin(last.operatingIncome))),
      statLine('Net margin', pct(margin(last.netIncome))),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- income · margins ---------------------------------------------- */

/**
 * The three margins on one axis.
 *
 * Lines, not bars: the question here is whether the gaps between them are
 * holding, which is a shape over time rather than a set of levels to compare
 * one year at a time.
 */
function marginCard(a) {
  const rows = statementRows(a, 'income').filter((r) => r.revenue > 0);
  const line = (name, color, get) => ({
    name, color, points: rows.map((r) => ({ date: r.date, value: get(r) })),
  });

  const body = rows.length >= 2
    ? multiLineChart([
        line('Gross', 'var(--chart-02)', (r) => (isNum(r.grossProfit) ? r.grossProfit / r.revenue : null)),
        line('Operating', 'var(--chart-01)', (r) => (isNum(r.operatingIncome) ? r.operatingIncome / r.revenue : null)),
        line('Net', 'var(--good)', (r) => (isNum(r.netIncome) ? r.netIncome / r.revenue : null)),
      ], { height: 280, valueFmt: (v) => pct(v, { dp: 0 }) })
    : notice('At least two filed years are needed to chart a margin trend.');

  return card('fin-margins', [
    ohead('Margins', null,
      'Each margin is that year’s filed line over that year’s filed revenue. The trailing-twelve '
      + 'margins graded under Profitability are computed from a different period and will differ.'),
    body,
  ], 'ocard ovw__c12');
}

/* ---------- cash · cash generation ---------------------------------------- */

/**
 * Where the cash came from and what the business kept of it.
 *
 * Capital expenditure is left as filed, below the zero line, rather than
 * flipped to a positive bar. Free cash flow is drawn beside the two it is made
 * of, so the reader can see the subtraction rather than take it.
 */
function cashGenerationCard(a) {
  const rows = statementRows(a, 'cash');
  const fmt = moneyIn(a);
  const years = rows.map((r) => String(yearOf(r.date)));
  const last = rows.at(-1);

  const conversion = isNum(last?.operatingCashFlow) && isNum(last?.netIncome) && last.netIncome > 0
    ? last.operatingCashFlow / last.netIncome : null;

  return card('fin-cash', [
    ohead('Cash generation', null,
      'Operating cash flow less capital expenditure is free cash flow. Capital expenditure is '
      + 'shown as the statement files it — negative, because it is money going out.'),

    columnChart(years, [
      { name: 'Operating cash flow', color: 'var(--chart-01)', values: seriesOf(rows, (r) => r.operatingCashFlow) },
      { name: 'Capital expenditure', color: 'var(--chart-06)', values: seriesOf(rows, (r) => r.capitalExpenditure) },
      { name: 'Free cash flow', color: 'var(--good)', values: seriesOf(rows, (r) => r.freeCashFlow) },
    ], { height: 280, valueFmt: fmt }),

    runBadges(rows, (r) => r.freeCashFlow),

    el('div', { class: 'ostats ostats--split' }, [
      statLine(`Free cash flow, fiscal ${yearOf(last?.date) ?? 'n/a'}`, fmt(last?.freeCashFlow)),
      statLine('Cash conversion', isNum(conversion) ? pct(conversion) : 'n/a', {
        note: 'operating cash / net income',
        title: 'Above 100% means the business collected more cash than it booked as profit. '
          + 'Not shown in a loss-making year, where the ratio has no meaning.',
      }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- balance · where that leaves it -------------------------------- */

/**
 * The current position, from the trailing-twelve set rather than the tables.
 *
 * Deliberately the odd card out on this tab: everything else here is a filed
 * fiscal year, and this is the company as it stands now. It is the figure a
 * reader wants after eight columns of history, and the note under it says
 * which basis it is on so the two are not read as the same thing.
 */
function positionCard(a) {
  const f = a.facts;
  const fmt = moneyIn(a);

  return card('fin-position', [
    ohead('Position today', null,
      'Trailing twelve months, not the last filed year — the same basis the rest of the report '
      + 'grades on, and more recent than the final column of the tables.'),
    el('div', { class: 'ostats' }, [
      statLine('Cash & equivalents', fmt(f.cash)),
      statLine('Total debt', fmt(f.totalDebt)),
      statLine('Net debt', fmt(f.netDebt), {
        tone: isNum(f.netDebt) && f.netDebt < 0 ? 'pos' : '',
        note: isNum(f.netDebt) && f.netDebt < 0 ? 'net cash' : '',
      }),
      statLine('Working capital', fmt(f.workingCapital)),
      statLine('Shareholders’ equity', fmt(f.equity)),
      // `dec`, not `trim`: a current ratio of 1.0033 printed as "1x" reads as
      // a round number the company hit, rather than as the coin-flip it is.
      statLine('Current ratio', isNum(f.currentRatio) ? `${dec(f.currentRatio, 2)}x` : 'n/a'),
      statLine('Debt / equity', isNum(f.debtToEquity) ? `${dec(f.debtToEquity, 2)}x` : 'n/a'),
      statLine('Book value / share', isNum(f.bookValuePerShare)
        ? `${curSymbol(f.currency)}${dec(f.bookValuePerShare, 2)}` : 'n/a'),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- balance · the balance sheet over time ------------------------- */

/**
 * Assets, liabilities and equity as three lines.
 *
 * The three are related by an identity — assets are liabilities plus equity —
 * so stacking them would draw the same total twice. As lines the identity is
 * still visible (the gap between the top line and the middle one *is* equity)
 * and the direction of each is readable on its own.
 */
function balanceHistoryCard(a) {
  const rows = statementRows(a, 'balance');
  const fmt = moneyIn(a);
  const line = (name, color, get) => ({
    name, color, points: rows.map((r) => ({ date: r.date, value: get(r) })),
  });

  const body = rows.length >= 2
    ? multiLineChart([
        line('Total assets', 'var(--chart-01)', (r) => r.totalAssets),
        line('Total liabilities', 'var(--chart-06)', (r) => r.totalLiabilities),
        line('Shareholders’ equity', 'var(--good)', (r) => r.totalStockholdersEquity),
        line('Total debt', 'var(--chart-04)', (r) => r.totalDebt),
      ], { height: 280, valueFmt: fmt })
    : notice('At least two filed balance sheets are needed to chart a history.');

  return card('fin-balance-history', [
    ohead('Balance sheet over time', null,
      'Assets equal liabilities plus equity, so the gap between the top two lines is the equity '
      + 'line drawn a second way.'),
    body,
  ], 'ocard ovw__c8');
}

/* ---------- cash · what went back to shareholders ------------------------- */

/**
 * Dividends and buybacks against the cash that paid for them.
 *
 * Figures rather than a chart: this card is a quarter of the grid, and three
 * series across ten years drawn into that width is a legend with some ink
 * under it. The two rows that matter are the last filed year and the whole
 * filed period, and both are readable as numbers.
 *
 * The filed minus signs come off. On the statement these are outflows and
 * negative; here they are the size of a return being read against the cash
 * that funded it, and a negative percentage of a positive would invert the
 * question.
 */
function shareholderReturnCard(a) {
  const rows = statementRows(a, 'cash');
  const fmt = moneyIn(a);
  const abs = (v) => (isNum(v) ? Math.abs(v) : null);

  const divOf = (r) => abs(r.commonDividendsPaid ?? r.netDividendsPaid);
  const bbOf = (r) => abs(r.commonStockRepurchased);
  const total = (get) => {
    const xs = rows.map(get).filter(isNum);
    return xs.length ? xs.reduce((x, y) => x + y, 0) : null;
  };

  const last = rows.at(-1) || {};
  const lastDiv = divOf(last);
  const lastBb = bbOf(last);
  const lastTotal = (lastDiv ?? 0) + (lastBb ?? 0);
  const share = (returned, fcf) => (isNum(fcf) && fcf > 0 && returned > 0 ? returned / fcf : null);

  const lifeDiv = total(divOf);
  const lifeBb = total(bbOf);
  const lifeTotal = (lifeDiv ?? 0) + (lifeBb ?? 0);
  const lifeShare = share(lifeTotal, total((r) => r.freeCashFlow));

  const year = yearOf(last.date) ?? 'n/a';
  const span = rows.length
    ? `${yearOf(rows[0].date)}–${yearOf(rows.at(-1).date)}`
    : 'the filed years';

  const coverTone = (v) => (isNum(v) && v > 1 ? 'neg' : '');
  const coverTitle = 'Over 100% means the payouts cost more than the free cash flow of the same '
    + 'period, so the difference came from cash on hand or from borrowing.';

  return card('fin-returns', [
    ohead('Returned to shareholders', null,
      'Dividends and buybacks with their filed minus signs removed, so they can be read against '
      + 'the free cash flow that funded them.'),

    el('div', { class: 'ostats' }, [
      statLine('Dividends paid', fmt(lastDiv), { note: `fiscal ${year}` }),
      statLine('Share repurchases', fmt(lastBb), { note: `fiscal ${year}` }),
      statLine('Total returned', lastTotal > 0 ? fmt(lastTotal) : 'nil'),
      statLine('Share of free cash flow', (() => {
        const v = share(lastTotal, last.freeCashFlow);
        return isNum(v) ? pct(v) : 'n/a';
      })(), { tone: coverTone(share(lastTotal, last.freeCashFlow)), title: coverTitle }),
    ]),

    el('div', { class: 'ostats ostats--split' }, [
      statLine('Returned in total', lifeTotal > 0 ? fmt(lifeTotal) : 'nil', { note: span }),
      statLine('Share of free cash flow', isNum(lifeShare) ? pct(lifeShare) : 'n/a', {
        note: span, tone: coverTone(lifeShare), title: coverTitle,
      }),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- income · how revenue became earnings --------------------------- */

/**
 * The last filed year read as a subtraction rather than as a list.
 *
 * The Analysis tab draws a version of this on trailing twelve months with
 * every cost after gross profit lumped into one "other expenses" bar. This is
 * the filed year with the lines the statement actually names, which is the
 * whole reason to be looking at it here rather than there.
 *
 * The final step is a residual — operating income to net income — rather than
 * a filed line. Tax, interest and non-operating income are not all reliably
 * returned, and a bar labelled "tax" that is actually three things would be
 * worse than a bar that says so.
 *
 * `waterfallChart` skips a step whose value is missing and re-bases at every
 * `total`, so a plan that does not return R&D still lands on the right
 * operating income — with an unexplained drop before it, which is honest.
 */
function incomeBridgeCard(a) {
  const last = statementRows(a, 'income').at(-1) || {};
  const fmt = moneyIn(a);
  const out = (v) => (isNum(v) ? -v : null);

  const below = isNum(last.operatingIncome) && isNum(last.netIncome)
    ? last.netIncome - last.operatingIncome : null;
  const kept = last.revenue > 0 && isNum(last.netIncome) ? last.netIncome / last.revenue : null;

  return card('fin-bridge', [
    ohead(`How revenue became earnings, fiscal ${yearOf(last.date) ?? 'year'}`, null,
      'Each cost bar hangs off the running total of the bar before it, so its height is what '
      + 'that cost took out. The last step is everything between operating income and net '
      + 'income — mostly tax, but not only tax.'),

    waterfallChart([
      { label: 'Revenue', value: last.revenue ?? null, kind: 'total', color: 'var(--brand-01)' },
      { label: 'Cost of revenue', value: out(last.costOfRevenue), kind: 'delta' },
      { label: 'Gross profit', value: last.grossProfit ?? null, kind: 'total', color: 'var(--chart-01)' },
      { label: 'R&D', value: out(last.researchAndDevelopmentExpenses), kind: 'delta' },
      { label: 'SG&A', value: out(last.sellingGeneralAndAdministrativeExpenses), kind: 'delta' },
      { label: 'Operating income', value: last.operatingIncome ?? null, kind: 'total', color: 'var(--chart-01)' },
      { label: 'Tax & other', value: below, kind: 'delta' },
      { label: 'Net income', value: last.netIncome ?? null, kind: 'total', color: 'var(--good)' },
    ], { height: 300, valueFmt: fmt }),

    el('div', { class: 'ostats ostats--split' }, [
      statLine('Kept as profit', pct(kept), { note: 'of every unit of revenue' }),
      statLine('Below the operating line', fmt(below), { note: 'tax, interest and other' }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- income · growth ----------------------------------------------- */

/**
 * The growth rates, on this tab's basis rather than the report's.
 *
 * The Growth factor grades a trailing-twelve figure against the prior twelve.
 * These are filed year against filed year, which is one reporting period
 * behind it — the same discrepancy the basis card at the foot of the tab
 * warns about, stated again here because this is the card most likely to be
 * read against that one.
 */
function growthCard(a) {
  const g = a.growth || {};
  const filedYear = yearOf(a.facts.lastReported);
  const onPrior = isNum(filedYear) ? `FY${filedYear} vs prior` : 'vs prior year';

  const line = (label, v, note) => statLine(
    label, isNum(v) ? pct(v, { sign: true }) : 'n/a', { note, tone: signClass(v) });

  return card('fin-growth', [
    ohead('Growth', null,
      'Filed year against the year before it. The multi-year figures are annualised, so a '
      + '5-year rate is the constant rate that would have got from the first year to the last '
      + 'rather than the sum of five annual steps.'),
    el('div', { class: 'ostats' }, [
      line('Revenue', g.revenueYoy, onPrior),
      line('Revenue, 3-year', g.revenue3y, 'annualised'),
      line('Revenue, 5-year', g.revenue5y, 'annualised'),
      line('EBITDA', g.ebitda, onPrior),
      line('Operating income', g.ebit, onPrior),
      line('Net income', g.netIncome, onPrior),
      line('Earnings per share', g.epsDiluted ?? g.eps, onPrior),
      line('Research & development', g.rdExpense, onPrior),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- income · earnings per share ----------------------------------- */

/**
 * Diluted earnings per share, by filed year.
 *
 * EPS and net income are the same story divided by different numbers, and the
 * gap between how fast the two grew is the share count — which is to say the
 * buyback, already paid for over on the cash flow panel. That gap is the
 * point of the card, so it is printed under the chart rather than left to be
 * worked out from two rows of the table.
 *
 * Diluted rather than basic, because it counts the shares the company has
 * already promised to issue and those are shares the profit will have to be
 * divided by.
 */
function epsCard(a) {
  const rows = statementRows(a, 'income');
  const cur = curSymbol(a.facts.currency);
  const epsOf = (r) => r.epsDiluted ?? r.eps;
  const last = rows.at(-1) || {};
  const prev = rows.at(-2);

  const epsGrowth = yoy(epsOf(last), prev ? epsOf(prev) : null);
  const niGrowth = yoy(last.netIncome, prev?.netIncome);
  const gap = isNum(epsGrowth) && isNum(niGrowth) ? epsGrowth - niGrowth : null;

  return card('fin-eps', [
    ohead('Earnings per share', null,
      'Diluted, as filed. This is the same figure as the earnings-per-share row of the table '
      + 'below, drawn so a run of years reads as a shape.'),

    columnChart(rows.map((r) => String(yearOf(r.date) ?? '—')),
      [{ name: 'Diluted EPS', color: 'var(--chart-05)', values: seriesOf(rows, epsOf) }],
      { height: 250, valueFmt: (v) => `${cur}${dec(v, 2)}`, legend: false }),

    runBadges(rows, epsOf),

    el('div', { class: 'ostats ostats--split' }, [
      statLine('Earnings per share grew', isNum(epsGrowth) ? pct(epsGrowth, { sign: true }) : 'n/a',
        { note: 'on the year before', tone: signClass(epsGrowth) }),
      statLine('Earnings grew', isNum(niGrowth) ? pct(niGrowth, { sign: true }) : 'n/a',
        { note: 'on the year before', tone: signClass(niGrowth) }),
      // Points, not per cent: this is one rate subtracted from another, and
      // printing "+3.2%" would invite it to be read as a third growth rate.
      statLine('The difference', isNum(gap)
        ? `${gap > 0 ? '+' : ''}${trim(gap * 100, 1)} pp` : 'n/a', {
        tone: signClass(gap), note: 'is the share count',
        title: 'Earnings per share grows faster than earnings when the share count falls, and '
          + 'slower when it rises. This is the gap between the two rates.',
      }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- income · the share count -------------------------------------- */

/**
 * How many shares the earnings are divided between, and which way it is going.
 *
 * A falling count is good for the holder and a rising one is not, so the
 * tone on the two change rows is inverted against the usual "up is green"
 * rule. That is the one place on this tab where a colour is an opinion, and
 * it is an arithmetic one: fewer shares, more of the company each.
 */
function shareCountCard(a) {
  const rows = statementRows(a, 'income').filter((r) => isNum(r.weightedAverageShsOutDil));
  const last = rows.at(-1);
  const first = rows[0];
  const fiveBack = rows.length > 5 ? rows.at(-6) : first;

  const changeFrom = (from) => (from && last
    ? yoy(last.weightedAverageShsOutDil, from.weightedAverageShsOutDil) : null);
  const over5 = changeFrom(fiveBack);
  const overAll = changeFrom(first);
  // Fewer shares is the good direction, so `signClass` is deliberately not used.
  const shrinkTone = (v) => (isNum(v) && v !== 0 ? (v < 0 ? 'pos' : 'neg') : '');

  if (!rows.length) {
    return card('fin-shares', [
      ohead('Share count'),
      notice('The income statements returned for this company carry no share count.'),
    ], 'ocard ovw__c4');
  }

  return card('fin-shares', [
    ohead('Share count', null,
      'Weighted average diluted shares, as the income statement files them — an average over '
      + 'the year rather than the count on the last day of it, which is why it will not match '
      + 'the shares outstanding below.'),
    el('div', { class: 'ostats' }, [
      statLine(`Diluted shares, fiscal ${yearOf(last.date) ?? 'year'}`,
        num(last.weightedAverageShsOutDil, 2)),
      fiveBack && fiveBack !== last
        ? statLine(`Diluted shares, fiscal ${yearOf(fiveBack.date) ?? 'year'}`,
          num(fiveBack.weightedAverageShsOutDil, 2))
        : null,
      statLine('Change over five years', isNum(over5) ? pct(over5, { sign: true }) : 'n/a',
        { tone: shrinkTone(over5) }),
      statLine('Change over the filed years', isNum(overAll) ? pct(overAll, { sign: true }) : 'n/a',
        { note: rows.length > 1 ? `since ${yearOf(first.date)}` : '', tone: shrinkTone(overAll) }),
      statLine('Shares outstanding', num(a.facts.shares, 2), { note: 'latest reported' }),
      statLine('Buyback yield', pct(a.val?.buybackYield), {
        note: 'against market cap',
        title: 'Shares bought back over the filed year as a share of today’s market '
          + 'capitalisation. Cash spent, not shares retired — the two differ when a buyback '
          + 'only offsets issuance.',
      }),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- balance · cash against debt ----------------------------------- */

/**
 * The two figures net debt is the difference between, drawn side by side.
 *
 * Grouped rather than stacked, and deliberately: cash is not part of debt,
 * and the thing worth seeing is which bar is taller. Where the cash bar wins
 * the company is in net cash, which the figures underneath say in words.
 */
function cashDebtCard(a) {
  const rows = statementRows(a, 'balance');
  const fmt = moneyIn(a);
  const last = rows.at(-1) || {};
  const netCash = isNum(last.netDebt) && last.netDebt < 0;

  return card('fin-cash-debt', [
    ohead('Cash against debt', null,
      'Both as filed at each year end, so neither is the position today — the trailing-twelve '
      + 'figures under "Position today" are more recent than the last pair of bars here.'),

    columnChart(rows.map((r) => String(yearOf(r.date) ?? '—')), [
      { name: 'Cash & short-term investments', color: 'var(--good)',
        values: seriesOf(rows, (r) => r.cashAndShortTermInvestments) },
      { name: 'Total debt', color: 'var(--chart-06)', values: seriesOf(rows, (r) => r.totalDebt) },
    ], { height: 280, valueFmt: fmt }),

    el('div', { class: 'ostats ostats--split' }, [
      statLine(`Net debt, fiscal ${yearOf(last.date) ?? 'year'}`, fmt(last.netDebt), {
        tone: netCash ? 'pos' : '', note: netCash ? 'net cash' : 'debt over cash',
      }),
      statLine('Net debt / EBITDA', isNum(a.facts.netDebtToEbitda)
        ? `${dec(a.facts.netDebtToEbitda, 2)}x` : 'n/a', {
        note: 'TTM',
        title: 'Roughly how many years of earnings before interest, tax and depreciation the '
          + 'net debt represents. Negative where the company holds more cash than debt.',
      }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- balance · financial strength ---------------------------------- */

/**
 * The distress scores and the coverage behind them.
 *
 * The Financial Health factor grades most of these against the sector. Here
 * they are the numbers, so a reader who wants to know what the grade was
 * computed from can see it without a distribution in the way.
 */
function strengthCard(a) {
  const f = a.facts;
  const x = (v) => (isNum(v) ? `${dec(v, 2)}x` : 'n/a');

  return card('fin-strength', [
    ohead('Financial strength', null,
      'Vendor-published scores plus the ratios they are built from. The two scores are as of '
      + 'the last filed year; the ratios are trailing twelve months.'),
    el('div', { class: 'ostats' }, [
      statLine('Altman Z-score', isNum(f.altmanZ) ? dec(f.altmanZ, 2) : 'n/a', {
        note: 'latest filed',
        title: 'A bankruptcy-distance score. Above 3 is conventionally safe and under 1.8 '
          + 'distressed. Built for manufacturers, and misleading for banks and for asset-light '
          + 'businesses.',
      }),
      statLine('Piotroski F-score', isNum(f.piotroski) ? `${dec(f.piotroski, 0)} / 9` : 'n/a', {
        note: 'latest filed',
        title: 'Nine pass/fail accounting tests. Counts how many the company passes, not how '
          + 'well it passes them.',
      }),
      statLine('Interest coverage', x(f.interestCover), {
        note: 'TTM',
        title: 'Operating profit over the interest bill. Not shown where the company reports no '
          + 'interest expense, which is not the same as covering it infinitely.',
      }),
      statLine('Debt / assets', x(f.debtToAssets), { note: 'TTM' }),
      statLine('Debt / capital', x(f.debtToCapital), { note: 'TTM' }),
      statLine('Quick ratio', x(f.quickRatio), {
        note: 'TTM', title: 'The current ratio with inventory taken out — what could be paid '
          + 'without selling stock first.' }),
      statLine('Cash ratio', x(f.cashRatio), { note: 'TTM' }),
      statLine('Financial leverage', x(f.financialLeverage), {
        note: 'TTM', title: 'Total assets over equity: how many units of balance sheet each '
          + 'unit of shareholders’ money is carrying.' }),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- balance · working capital ------------------------------------- */

/**
 * What comes due within a year against what turns into cash within a year.
 *
 * Drawn rather than tabulated because the interesting case is the crossover —
 * the year the shorter bar became the taller one. A working capital figure on
 * its own says nothing about whether it has been that way for a decade.
 */
function workingCapitalCard(a) {
  const rows = statementRows(a, 'balance');
  const fmt = moneyIn(a);
  const last = rows.at(-1) || {};

  const wc = isNum(last.totalCurrentAssets) && isNum(last.totalCurrentLiabilities)
    ? last.totalCurrentAssets - last.totalCurrentLiabilities : null;
  const ratio = last.totalCurrentLiabilities > 0 && isNum(last.totalCurrentAssets)
    ? last.totalCurrentAssets / last.totalCurrentLiabilities : null;

  return card('fin-working-capital', [
    ohead('Working capital', null,
      'Current assets against current liabilities at each year end. A ratio under 1x is not by '
      + 'itself a warning — a business paid before it pays its own suppliers runs there on '
      + 'purpose — but it does mean the year’s bills are not covered by the year’s assets '
      + 'alone.'),

    columnChart(rows.map((r) => String(yearOf(r.date) ?? '—')), [
      { name: 'Current assets', color: 'var(--chart-01)',
        values: seriesOf(rows, (r) => r.totalCurrentAssets) },
      { name: 'Current liabilities', color: 'var(--chart-04)',
        values: seriesOf(rows, (r) => r.totalCurrentLiabilities) },
    ], { height: 280, valueFmt: fmt }),

    el('div', { class: 'ostats ostats--split' }, [
      statLine(`Working capital, fiscal ${yearOf(last.date) ?? 'year'}`, fmt(wc),
        { tone: isNum(wc) && wc < 0 ? 'neg' : '' }),
      // `dec`, not `trim`: a current ratio of 1.0033 printed as "1x" reads as
      // a round number the company hit rather than as the coin-flip it is.
      statLine('Current ratio, that year', isNum(ratio) ? `${dec(ratio, 2)}x` : 'n/a',
        { note: 'filed, not TTM' }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- balance · equity and book value ------------------------------- */

/**
 * What is left of the assets once every liability is met.
 *
 * Worth one caveat, which the card carries: a small or even negative equity
 * is ordinary for a company that has bought back more stock than it has
 * retained profit. It is an accounting residue, not a solvency reading, and
 * the strength card beside it is the one that answers solvency.
 */
function equityCard(a) {
  const f = a.facts;
  const rows = statementRows(a, 'balance');
  const last = rows.at(-1) || {};
  const prev = rows.at(-2);
  const cur = curSymbol(f.currency);
  const fmt = moneyIn(a);

  const growth = yoy(last.totalStockholdersEquity, prev?.totalStockholdersEquity);
  const ofAssets = last.totalAssets > 0 && isNum(last.totalStockholdersEquity)
    ? last.totalStockholdersEquity / last.totalAssets : null;
  const perShare = (v) => (isNum(v) ? `${cur}${dec(v, 2)}` : 'n/a');

  return card('fin-equity', [
    ohead('Equity and book value', null,
      'A low or negative equity is normal for a company that has returned more to shareholders '
      + 'than it has retained, and is not on its own a solvency problem — the card beside this '
      + 'one is where solvency is answered.'),
    el('div', { class: 'ostats' }, [
      statLine(`Equity, fiscal ${yearOf(last.date) ?? 'year'}`, fmt(last.totalStockholdersEquity)),
      statLine('Change on the year', isNum(growth) ? pct(growth, { sign: true }) : 'n/a',
        { tone: signClass(growth) }),
      statLine('Equity / assets', pct(ofAssets), {
        note: 'filed',
        title: 'The share of the balance sheet the shareholders own outright. The rest is '
          + 'funded by somebody else.',
      }),
      statLine('Book value / share', perShare(f.bookValuePerShare), { note: 'TTM' }),
      statLine('Tangible book value / share', perShare(f.tangibleBookValuePerShare), {
        note: 'TTM',
        title: 'Book value with goodwill and other intangibles removed — what would be left if '
          + 'the acquisitions were written off.',
      }),
      statLine('Price / book', isNum(f.pb) ? `${dec(f.pb, 2)}x` : 'n/a', { note: 'TTM' }),
      statLine('Return on equity', pct(f.roe), { note: 'TTM' }),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- cash · where the cash went ------------------------------------ */

/**
 * The three big uses of the cash, stacked so the whole bar is the year's bill.
 *
 * Filed minus signs come off. On the statement these are outflows and print
 * negative; stacked below the zero line they would be a mirror image of the
 * same chart with no extra meaning, and the question here is how big the
 * spend was and what it was made of.
 *
 * Capital expenditure is in the stack even though it is paid before free cash
 * flow rather than out of it. All three compete for the same operating cash,
 * which is the figure printed underneath.
 */
function allocationCard(a) {
  const rows = statementRows(a, 'cash');
  const fmt = moneyIn(a);
  const abs = (v) => (isNum(v) ? Math.abs(v) : null);
  const last = rows.at(-1) || {};

  const capexOf = (r) => abs(r.capitalExpenditure);
  const divOf = (r) => abs(r.commonDividendsPaid ?? r.netDividendsPaid);
  const bbOf = (r) => abs(r.commonStockRepurchased);

  const spent = [capexOf(last), divOf(last), bbOf(last)]
    .filter(isNum).reduce((x, y) => x + y, 0);
  const ofOcf = last.operatingCashFlow > 0 && spent > 0 ? spent / last.operatingCashFlow : null;

  return card('fin-allocation', [
    ohead('Where the cash went', null,
      'Capital expenditure, dividends and buybacks with their filed minus signs removed, so the '
      + 'height of a bar is what the year spent. Debt repayment and acquisitions are not in the '
      + 'stack — this data plan does not return them separately.'),

    columnChart(rows.map((r) => String(yearOf(r.date) ?? '—')), [
      { name: 'Capital expenditure', color: 'var(--chart-01)', values: seriesOf(rows, capexOf) },
      { name: 'Dividends', color: 'var(--chart-02)', values: seriesOf(rows, divOf) },
      { name: 'Buybacks', color: 'var(--chart-05)', values: seriesOf(rows, bbOf) },
    ], { height: 280, stacked: true, valueFmt: fmt }),

    el('div', { class: 'ostats ostats--split' }, [
      statLine(`Spent, fiscal ${yearOf(last.date) ?? 'year'}`, spent > 0 ? fmt(spent) : 'nil'),
      statLine('Operating cash flow, that year', fmt(last.operatingCashFlow), {
        note: isNum(ofOcf) ? `${pct(ofOcf)} of it used` : '',
        tone: isNum(ofOcf) && ofOcf > 1 ? 'neg' : '',
        title: 'Over 100% means the three uses cost more than the year’s operating cash, so the '
          + 'difference came from cash on hand, from borrowing, or from selling something.',
      }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- cash · quality ------------------------------------------------ */

/**
 * Whether the profit turned into cash, and what the business had to spend
 * again to stay where it is.
 *
 * The filed-year rows divide that year's cash flow by that year's revenue,
 * matched by fiscal year across the two statements. The TTM rows come from
 * the vendor's ratios and are more recent — each row says which it is.
 */
function cashQualityCard(a) {
  const f = a.facts;
  const rows = statementRows(a, 'cash');
  const last = rows.at(-1) || {};
  const year = yearOf(last.date);
  const basis = isNum(year) ? `fiscal ${year}` : 'last filed year';

  const revenue = incomeByYear(a).get(year)?.revenue ?? null;
  const ofRevenue = (v) => (isNum(v) && revenue > 0 ? v / revenue : null);
  const abs = (v) => (isNum(v) ? Math.abs(v) : null);

  const conversion = isNum(last.operatingCashFlow) && last.netIncome > 0
    ? last.operatingCashFlow / last.netIncome : null;
  const capexOfOcf = last.operatingCashFlow > 0 && isNum(last.capitalExpenditure)
    ? Math.abs(last.capitalExpenditure) / last.operatingCashFlow : null;

  return card('fin-cash-quality', [
    ohead('Cash quality', null,
      'Cash flow against the revenue that produced it and the profit it is supposed to '
      + 'correspond to. Where a row says a fiscal year, both halves come from that year’s '
      + 'statements.'),
    el('div', { class: 'ostats' }, [
      statLine('Operating cash flow margin', pct(ofRevenue(last.operatingCashFlow)), { note: basis }),
      statLine('Free cash flow margin', pct(ofRevenue(last.freeCashFlow)), { note: basis }),
      statLine('Cash conversion', pct(conversion), {
        note: 'operating cash / net income',
        title: 'Above 100% means the business collected more cash than it booked as profit. '
          + 'Not shown in a loss-making year, where the ratio has no meaning.',
      }),
      statLine('Free cash flow / operating cash flow', pct(f.fcfToOcf), { note: 'TTM' }),
      statLine('Capital expenditure / revenue', pct(ofRevenue(abs(last.capitalExpenditure))), { note: basis }),
      statLine('Capital expenditure / operating cash flow', pct(capexOfOcf), { note: basis }),
      statLine('Income quality', isNum(f.incomeQuality) ? `${dec(f.incomeQuality, 2)}x` : 'n/a', {
        note: 'TTM',
        title: 'Operating cash flow over net income. Below 1 for long means profit is being '
          + 'booked faster than it is collected.',
      }),
      statLine('Stock compensation / revenue', pct(f.sbcToRevenue), {
        note: 'TTM',
        title: 'A non-cash charge added back inside operating cash flow, so it flatters every '
          + 'ratio on this card.',
      }),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- cash · margins over time -------------------------------------- */

/**
 * The cash margins as a shape, which is the form the question takes.
 *
 * "Free cash flow was 24% of revenue" is a fact about one year. Whether that
 * 24% used to be 30% is the thing anyone asking has in mind, and it needs the
 * run of years.
 *
 * Capital expenditure is drawn as a positive share so all three lines share a
 * direction — the gap between the top two lines is it, which is the
 * subtraction the card is about.
 */
function cashMarginsCard(a) {
  const rows = statementRows(a, 'cash');
  const income = incomeByYear(a);

  const ratio = (r, get) => {
    const revenue = income.get(yearOf(r.date))?.revenue ?? null;
    const v = get(r);
    return revenue > 0 && isNum(v) ? v / revenue : null;
  };
  const line = (name, color, get) => ({
    name, color, points: rows.map((r) => ({ date: r.date, value: ratio(r, get) })),
  });

  const charted = rows.filter((r) => isNum(ratio(r, (x) => x.operatingCashFlow)));
  const body = charted.length >= 2
    ? multiLineChart([
        line('Operating cash flow', 'var(--chart-01)', (r) => r.operatingCashFlow),
        line('Free cash flow', 'var(--good)', (r) => r.freeCashFlow),
        line('Capital expenditure', 'var(--chart-06)',
          (r) => (isNum(r.capitalExpenditure) ? Math.abs(r.capitalExpenditure) : null)),
      ], { height: 280, valueFmt: (v) => pct(v, { dp: 0 }) })
    : notice('At least two fiscal years present on both the cash flow statement and the income '
      + 'statement are needed to chart a cash margin.');

  return card('fin-cash-margins', [
    ohead('Cash margins', null,
      'Each year’s cash flow over the same year’s revenue. The margins graded under '
      + 'Profitability are trailing twelve months and computed from the vendor’s ratios, so '
      + 'they will not land exactly on the last point of these lines.'),
    body,
  ], 'ocard ovw__c12');
}

/* ---------- shared · the statements themselves ---------------------------- */

/**
 * One filed statement as a table: a row per line, a column per fiscal year.
 *
 * Most recent first. The charts above run oldest-to-newest because that is
 * how a trend reads; a table is scanned rather than read, and the column
 * almost every reader wants is the newest one, so it sits where the eye
 * lands.
 *
 * A row with no figure in any year is dropped. FMP returns a narrower set of
 * lines than a filing carries and the bundled snapshot narrower still, so the
 * alternative is a table with rows that are n/a in every column — which says
 * nothing except that the row was defined here.
 */
function statementCard(a, which, title, defs, info) {
  const chron = statementRows(a, which);
  const rows = [...chron].reverse();                // newest first, for the table only
  const fmtMoney = moneyIn(a);

  // Resolve every row once: the drop test and the cells both need the values,
  // and `get` runs over ten statements per row.
  const live = defs
    .map((d) => ({ ...d, values: seriesOf(rows, d.get) }))
    .filter((d) => d.values.some(isNum));

  if (!rows.length || !live.length) {
    return card(`fin-stmt-${which}`, [
      ohead(title),
      feedGate(a, which === 'cash' ? 'cashflow' : which, `The ${title.toLowerCase()}`)
        || notice(`No ${title.toLowerCase()} lines were returned for this company.`),
    ], 'ocard ovw__c12');
  }

  const host = el('div', {});
  let showAll = rows.length <= DEFAULT_YEARS;

  const toggle = rows.length > DEFAULT_YEARS
    ? el('button', { type: 'button', class: 'omore omore--plain' })
    : null;

  const draw = () => {
    const n = showAll ? rows.length : DEFAULT_YEARS;
    host.replaceChildren(statementTable(a, rows.slice(0, n), live, fmtMoney));
    if (toggle) toggle.textContent = showAll ? `Show last ${DEFAULT_YEARS} years` : `Show all ${rows.length} years`;
  };
  toggle?.addEventListener('click', () => { showAll = !showAll; draw(); });
  draw();

  return card(`fin-stmt-${which}`, [
    ohead(title, toggle, info),
    host,
    el('p', { class: 't-tiny subtle mt2', text: `Fiscal years ending ${fmtDate(rows.at(-1).date)} `
      + `to ${fmtDate(rows[0].date)}. Figures in ${a.facts.currency || 'the reporting currency'}, `
      + 'as reported — lines this data plan does not return are left out rather than shown empty.' }),
  ], 'ocard ovw__c12');
}

/** The table itself: line items down, fiscal years across. */
function statementTable(a, rows, defs, fmtMoney) {
  const head = el('tr', {}, [
    el('th', { class: 'fintbl__line', text: 'Line item' }),
    ...rows.map((r) => el('th', { class: 'num', text: String(yearOf(r.date) ?? '—') })),
  ]);

  const body = [];
  let group = null;
  for (const d of defs) {
    // A named group opens a labelled band — the derived rows under the filed
    // ones, so nothing computed here is mistaken for something filed.
    if (d.group && d.group !== group) {
      group = d.group;
      body.push(el('tr', { class: 'fintbl__group' }, [
        el('td', { colspan: rows.length + 1, text: `${d.group} · calculated from the lines above` }),
      ]));
    }

    const fmt = d.fmt || ((v) => fmtMoney(v));
    body.push(el('tr', { class: d.strong ? 'fintbl__strong' : '' }, [
      el('td', { class: 'fintbl__line', text: d.label }),
      ...d.values.slice(0, rows.length).map((v, i) => el('td', {
        class: `num ${d.derived ? '' : signClass(v)}`.trim(),
        text: isNum(v) ? fmt(v, a) : '—',
        title: i + 1 < rows.length && isNum(yoy(v, d.values[i + 1]))
          ? `${pct(yoy(v, d.values[i + 1]), { sign: true })} on ${yearOf(rows[i + 1].date)}`
          : null,
      })),
    ]));
  }

  return el('div', { class: 'tbl-wrap' }, [
    el('table', { class: 'tbl fintbl' }, [el('thead', {}, [head]), el('tbody', {}, body)]),
  ]);
}

/* ---------- shared · what you are looking at ------------------------------ */

/**
 * The basis card.
 *
 * Short, because this tab claims very little: the numbers are the vendor's
 * copy of the filing and nothing on the page interprets them. What it does
 * owe the reader is the period, the source, and the two places these figures
 * will disagree with the rest of the report.
 */
function basisCard(a, nav) {
  const f = a.facts;
  const income = statementRows(a, 'income');
  const span = income.length
    ? `${yearOf(income[0].date)}–${yearOf(income.at(-1).date)}`
    : 'n/a';

  const gates = [
    feedGate(a, 'income', 'The income statement'),
    feedGate(a, 'balance', 'The balance sheet'),
    feedGate(a, 'cashflow', 'The cash flow statement'),
  ].filter(Boolean);

  return card('fin-basis', [
    ohead('About these figures'),

    ...gates,

    el('div', { class: 'ostats' }, [
      statLine('Period', 'Annual', { note: 'not quarterly' }),
      statLine('Fiscal years shown', span, { note: `${income.length} filed` }),
      statLine('Last filed year end', fmtDate(f.lastReported)),
      statLine('Reporting currency', f.currency || 'n/a'),
    ]),

    el('p', { class: 'osub', text: 'Where these will not tie to the rest of the report' }),
    el('ul', { class: 'rlimits' }, [
      'The ratios, grades and headline figures elsewhere are trailing twelve months. These '
        + 'columns are fiscal years, so the two are different periods and will not reconcile.',
      'Every year-on-year line in the graded factors is therefore FY0 against FY−1, one '
        + 'reporting period behind the spec’s trailing-twelve comparison.',
      'The feed returns a subset of the lines a filing carries. Rows it never returns are '
        + 'dropped from these tables, so a shorter table is a narrower feed and not a simpler '
        + 'company.',
    ].map((text) => el('li', { text }))),

    nav.openAnalysis ? el('button', {
      type: 'button', class: 'omore', text: 'See which feeds loaded',
      onclick: () => nav.openAnalysis('data-status'),
    }) : null,
  ], 'ocard ovw__c12');
}
