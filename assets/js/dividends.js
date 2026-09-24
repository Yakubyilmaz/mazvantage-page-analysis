/* ==========================================================================
   Vanlior — the Dividends tab

   Four questions, in the order they matter:

     1. What does it pay?          yield, per share, against the market
     2. Is it covered?             out of profit, and out of cash
     3. Has it held up?            history by year, cuts, growth
     4. When is the next one?      the payment record

   The Analysis tab already carries a dividend section; this is the same
   subject opened out, with the payment record and the buyback leg that
   section has no room for.

   Two conventions worth knowing:

   - **History is aggregated by calendar year**, and the current year is
     dropped until it is complete. A company three quarters through its year
     would otherwise appear to have cut its dividend by a quarter.
   - **Cover is asked twice.** The payout ratio measures the dividend against
     reported profit; the cash payout ratio measures it against free cash
     flow. The second is the one that matters — profit is an opinion and the
     dividend is paid in cash — and the two are shown side by side rather than
     collapsed into one verdict.
   ========================================================================== */

import { el, isNum, money, num, pct, dec, mult, price, trim, fmtDate, yearOf, yoy, signClass } from './util.js';
import { card, notice, feedGate, cmpBars, statLine, ohead, table, curSymbol, perfCagr } from './ui.js';
import { columnChart, lineChart, multiLineChart, gauge } from './charts.js';
import { dividendScoresPanel } from './dividendscores.js';

/* ==========================================================================
   The tab
   ========================================================================== */

export function renderDividendsTab(a, nav = {}) {
  const f = a.facts;
  const d = a.dividends || {};

  // A company that has never paid is not a broken page — it is a one-line
  // answer, and eight empty cards would bury it.
  const pays = isNum(f.dividendYield) && f.dividendYield > 0;
  if (!pays && !d.available) {
    return el('div', { class: 'ovw' }, [
      card('dv-none', [
        ohead(`${f.name} dividends`),
        feedGate(a, 'dividends', 'Dividend history') || notice(
          `<b>${f.symbol}</b> pays no dividend and has no payment history on record. Cash is `
          + 'either retained in the business or returned through buybacks — the Financials tab '
          + 'shows which.'),
      ], 'ocard ovw__c12'),
    ]);
  }

  // Two panels, because the dividend and the whole of what goes back to
  // shareholders are different questions and this company answers the second
  // one four times more loudly than the first. Folding buybacks into the
  // dividend page would either bury them or make every dividend figure read
  // as though it included them.
  const PANELS = [
    { key: 'dividend', label: 'Dividend', build: dividendPanel },
    // The scored view of the same subject, from the dividend module. Its own
    // panel rather than a strip of cards among the figures above: those cards
    // report what the dividend *is*, and these rank it against the sector's
    // other payers, which is a different question with a different universe.
    { key: 'scores', label: 'Scores', build: dividendScoresPanel },
    { key: 'shareholder', label: 'Shareholder returns', build: shareholderPanel },
  ];

  const panel = el('div', { class: 'ovw', id: 'dv-panel', role: 'tabpanel' });
  let current = PANELS[0].key;

  const buttons = PANELS.map((p) => el('button', {
    type: 'button', class: 'subtab', role: 'tab', id: `dv-tab-${p.key}`,
    'aria-controls': 'dv-panel', text: p.label,
    onclick: () => show(p.key),
  }));

  function show(key) {
    current = key;
    const chosen = PANELS.find((p) => p.key === key) || PANELS[0];
    panel.replaceChildren(...chosen.build(a, nav).filter(Boolean));
    panel.setAttribute('aria-labelledby', `dv-tab-${chosen.key}`);
    buttons.forEach((b, i) => {
      const on = PANELS[i].key === key;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }

  const strip = el('div', { class: 'subtabs', role: 'tablist', 'aria-label': 'Dividends view' }, buttons);
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
  return el('div', {}, [strip, panel]);
}

function dividendPanel(a, nav) {
  const f = a.facts;
  return [
    keyMetricsCard(a),
    headlineCard(a),
    yieldCard(a),

    perShareCard(a),
    coverCard(a, 'payout', 'Covered by profit', {
      value: f.payoutRatio,
      label: 'of earnings paid out',
      info: 'The dividend as a share of reported profit. Over 100% means the company is paying '
        + 'out more than it earned.',
      note: coverNote(a),
    }),
    coverCard(a, 'cash', 'Covered by cash', {
      value: f.cashPayoutRatio,
      label: 'of free cash flow paid out',
      info: 'The dividend as a share of free cash flow — the test that matters more, because a '
        + 'dividend is paid in cash rather than in profit.',
      note: cashNote(a),
    }),

    yieldHistoryCard(a),
    payoutHistoryCard(a),
    growthCard(a),
    projectionCard(a),

    historyCard(a),
    recordCard(a),
    basisCard(a, nav),
  ];
}

function shareholderPanel(a) {
  return [
    returnsCard(a),
    returnsFiguresCard(a),
    shareholderYieldCard(a),
    shareholderPayoutCard(a),
    shareholderBasisCard(a),
  ];
}

/* ==========================================================================
   The dividend, over time

   Everything below reads off `a.dividends.byYear` (declared payments summed
   per calendar year), `a.series` (the filed statements joined per fiscal
   year) and `a.yieldHistory` (a yield recomputed at every close in the price
   history). None of it is graded.
   ========================================================================== */

/** The two figures that summarise a run of years. */
function runBadges(rows, get, opts = {}) {
  const vals = rows.map(get).map((v) => (isNum(v) ? v : null));
  const from = vals.findIndex(isNum);
  if (from < 0) return null;
  const to = vals.length - 1 - [...vals].reverse().findIndex(isNum);
  if (to <= from) return null;
  return perfCagr(vals[from], vals[to], to - from, opts);
}

/** High / median / low, for a series read against its own history. */
function rangeBadges(stat, fmt = (v) => pct(v, { dp: 2 })) {
  const pill = (label, v, cls) => el('span', { class: `perfpill ${cls}` }, [
    el('i', { text: label }),
    el('b', { text: isNum(v) ? fmt(v) : 'n/a' }),
  ]);
  return el('div', { class: 'perfrow' }, [
    pill('High', stat.high, 'is-up'),
    pill('Median', stat.median, 'is-mid'),
    pill('Low', stat.low, 'is-down'),
  ]);
}

/* ---------- 0. the reference card ----------------------------------------- */

/**
 * Everything a reader checks before looking at anything else.
 *
 * The one card on this tab with no chart and no comparison: yield, cover, how
 * long the run of increases is, how fast it has grown, and when the next
 * cheque lands. A dividend page that made you scroll for the pay date would
 * be a dividend page written for somebody who does not own the share.
 */
function keyMetricsCard(a) {
  const f = a.facts;
  const d = a.dividends || {};
  const cur = curSymbol(f.currency);
  const byYear = d.byYear || [];

  // Consecutive complete years of a higher payment, counted back from the
  // last one. A flat year breaks the run: "years of increases" means what it
  // says, and a company that held its dividend did not increase it.
  let streak = 0;
  for (let i = byYear.length - 1; i > 0; i -= 1) {
    if (isNum(byYear[i].amount) && isNum(byYear[i - 1].amount) && byYear[i].amount > byYear[i - 1].amount) streak += 1;
    else break;
  }

  const cagrOver = (n) => {
    if (byYear.length <= n) return null;
    const from = byYear.at(-1 - n);
    const to = byYear.at(-1);
    return from?.amount > 0 && to?.amount > 0 ? (to.amount / from.amount) ** (1 / n) - 1 : null;
  };

  const rows = d.rows || [];
  const dated = rows.map((r) => ({ ...r, at: new Date(r.date).getTime() }))
    .filter((r) => Number.isFinite(r.at))
    .sort((x, y) => y.at - x.at);
  const now = Date.now();
  const past = dated.find((r) => r.at <= now) || null;
  const next = [...dated].reverse().find((r) => r.at > now) || null;
  const frequency = past?.frequency || dated[0]?.frequency || null;

  const money2 = (v) => (isNum(v) ? `${cur}${trim(v, 4)}` : 'n/a');

  return card('dv-key', [
    ohead('Key figures', null,
      'The reference set. Growth rates are compounded over complete calendar years of declared '
      + 'payments, which is a different basis from the trailing-twelve yield above it.'),
    el('div', { class: 'ostats' }, [
      statLine('Yield, trailing twelve months', pct(f.dividendYield, { dp: 2 })),
      statLine('Payout ratio', pct(f.payoutRatio), { note: 'of earnings' }),
      statLine('Cash payout ratio', pct(f.cashPayoutRatio), { note: 'of free cash flow' }),
      statLine('Consecutive years of increase', streak ? `${streak} year${streak === 1 ? '' : 's'}` : 'none', {
        tone: streak >= 5 ? 'pos' : '',
        title: 'Counted back from the last complete calendar year. A year the company held the '
          + 'dividend flat ends the run — it did not cut, but it did not increase either.',
      }),
      statLine('Growth, 5-year', isNum(cagrOver(5)) ? pct(cagrOver(5), { sign: true }) : 'n/a',
        { note: 'annualised', tone: signClass(cagrOver(5)) }),
      statLine('Growth, 10-year', isNum(cagrOver(10)) ? pct(cagrOver(10), { sign: true }) : 'n/a',
        { note: 'annualised', tone: signClass(cagrOver(10)) }),
      statLine('Frequency', frequency || 'n/a'),
      statLine('Last payment', past ? `${fmtDate(past.date)} · ${money2(past.dividend ?? past.adjDividend)}` : 'n/a',
        { note: 'ex-dividend date' }),
      statLine('Next declared', next ? `${fmtDate(next.date)} · ${money2(next.dividend ?? next.adjDividend)}` : 'none declared',
        { note: next ? 'ex-dividend date' : 'nothing on the feed yet' }),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- dividend per share, by year ----------------------------------- */

function perShareCard(a) {
  const d = a.dividends || {};
  const byYear = d.byYear || [];
  const cur = curSymbol(a.facts.currency);

  if (byYear.length < 2) {
    return card('dv-dps', [
      ohead('Dividend per share'),
      notice('At least two complete calendar years of payments are needed to draw a history.'),
    ], 'ocard ovw__c8');
  }

  return card('dv-dps', [
    ohead('Dividend per share', null,
      'Declared payments summed by calendar year, not by fiscal year — a dividend is paid on a '
      + 'date rather than in a reporting period. The current year is excluded until it is '
      + 'complete, so a part-year does not read as a cut.'),
    columnChart(byYear.map((r) => String(r.year)), [{
      name: 'Dividend per share', color: 'var(--chart-02)',
      values: byYear.map((r) => r.amount),
    }], { height: 260, valueFmt: (v) => `${cur}${trim(v, 4)}`, legend: false }),
    runBadges(byYear, (r) => r.amount),
  ], 'ocard ovw__c8');
}

/* ---------- the yield, against its own history ---------------------------- */

/**
 * Today's yield is only a number. Against this company's own range it is an
 * answer — and the median is the line that turns one into the other.
 *
 * Recomputed at every close rather than taken from a vendor series, because
 * no vendor publishes one: the trailing twelve months of declared payments
 * over that day's price. The steps are quarters entering and leaving the
 * window; the slopes between them are the share price moving.
 */
function yieldHistoryCard(a) {
  const h = a.yieldHistory || { available: false };

  if (!h.available) {
    return card('dv-yield-history', [
      ohead('Yield over time'),
      feedGate(a, 'prices', 'The price history')
        || notice('Not enough overlapping price and dividend history to recompute a yield.'),
    ], 'ocard ovw__c8');
  }

  return card('dv-yield-history', [
    ohead('Yield over time', null,
      'The trailing twelve months of declared dividends over the closing price of each day. '
      + 'Where the line sits against its own median is the question a single current yield '
      + 'cannot answer.'),
    lineChart(h.points, {
      height: 260,
      color: 'var(--chart-01)',
      valueFmt: (v) => pct(v, { dp: 2 }),
      refLine: { value: h.median, label: `Median ${pct(h.median, { dp: 2 })}` },
      empty: 'Not enough history to draw a yield.',
    }),
    rangeBadges(h),
    el('p', { class: 't-tiny subtle mt2', text: `${h.span}. The window is however much price `
      + 'history this data plan returns, which is a year without a key and six years with one.' }),
  ], 'ocard ovw__c8');
}

/* ---------- cover, by year ------------------------------------------------ */

function payoutHistoryCard(a) {
  const rows = (a.series?.rows || []).filter((r) => isNum(r.dividends) && r.dividends > 0);
  const sh = a.shareholder || { rows: [] };
  const byYear = new Map(sh.rows.map((r) => [r.year, r]));

  if (rows.length < 2) {
    return card('dv-payout-history', [
      ohead('Cover over time'),
      notice('At least two filed years with a dividend are needed to draw a cover history.'),
    ], 'ocard ovw__c8');
  }

  const line = (name, color, get) => ({
    name, color, points: rows.map((r) => ({ date: r.date, value: get(byYear.get(r.year) || {}) })),
  });

  const last = byYear.get(rows.at(-1).year) || {};
  return card('dv-payout-history', [
    ohead('Cover over time', null,
      'The dividend against the profit it is declared out of and the free cash flow it is '
      + 'actually paid out of. The gap between the two lines is the difference between an '
      + 'accounting result and money.'),
    multiLineChart([
      line('Of earnings', 'var(--chart-01)', (r) => r.dividendEarningsPayout),
      line('Of free cash flow', 'var(--chart-04)', (r) => r.dividendFcfPayout),
    ], { height: 260, valueFmt: (v) => pct(v, { dp: 0 }) }),
    el('div', { class: 'ostats ostats--split' }, [
      statLine('Paid out of earnings', pct(last.dividendEarningsPayout), { note: `FY${rows.at(-1).year}` }),
      statLine('Paid out of free cash flow', pct(last.dividendFcfPayout), { note: `FY${rows.at(-1).year}` }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- growth, year on year ------------------------------------------ */

function growthCard(a) {
  const byYear = a.dividends?.byYear || [];
  if (byYear.length < 3) {
    return card('dv-growth', [
      ohead('Growth in the payment'),
      notice('At least three complete calendar years are needed to draw a growth history.'),
    ], 'ocard ovw__c8');
  }

  const steps = byYear.slice(1).map((r, i) => ({
    year: r.year,
    change: yoy(r.amount, byYear[i].amount),
  }));
  const cuts = steps.filter((r) => isNum(r.change) && r.change < 0).length;
  const held = steps.filter((r) => isNum(r.change) && r.change === 0).length;

  return card('dv-growth', [
    ohead('Growth in the payment', null,
      'Each complete calendar year against the one before it. A year at zero is a dividend held '
      + 'rather than raised, which is not a cut and is not a rise either.'),
    columnChart(steps.map((r) => String(r.year)), [{
      name: 'Change on the year', color: 'var(--good)',
      // A cut is drawn in the colour a cut deserves, one bar at a time.
      colors: steps.map((r) => (isNum(r.change) && r.change < 0 ? 'var(--bad)' : 'var(--good)')),
      values: steps.map((r) => r.change),
    }], { height: 260, valueFmt: (v) => pct(v, { sign: true, dp: 0 }), legend: false }),
    el('div', { class: 'ostats ostats--split' }, [
      statLine('Years raised', String(steps.length - cuts - held), { note: `of ${steps.length}` }),
      statLine('Years held flat', String(held)),
      statLine('Years cut', String(cuts), { tone: cuts ? 'neg' : 'pos' }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- what it becomes ----------------------------------------------- */

/**
 * A projection, and plainly labelled as one.
 *
 * It compounds one number — the historical growth rate — forward for ten
 * years and shows the income and the yield on the original cost. That is
 * arithmetic, not a forecast: no company grows a dividend at a constant rate
 * for a decade, and the card says so rather than dressing the sum up.
 *
 * The rate is editable because the whole value of the card is watching the
 * answer move when you disagree with it.
 */
function projectionCard(a) {
  const f = a.facts;
  const d = a.dividends || {};
  const byYear = d.byYear || [];
  const cur = curSymbol(f.currency);

  const cagrOver = (n) => {
    if (byYear.length <= n) return null;
    const from = byYear.at(-1 - n);
    const to = byYear.at(-1);
    return from?.amount > 0 && to?.amount > 0 ? (to.amount / from.amount) ** (1 / n) - 1 : null;
  };
  const suggested = cagrOver(10) ?? cagrOver(5) ?? d.growth ?? null;

  if (!isNum(f.dividendYield) || f.dividendYield <= 0 || !isNum(suggested)) {
    return card('dv-projection', [
      ohead('What it compounds to'),
      notice('A current yield and a growth history are both needed to project an income.'),
    ], 'ocard ovw__c8');
  }

  const YEARS = 10;
  let amount = 10000;
  // Clamped hard: a 40% dividend growth rate compounded for ten years is a
  // 29-fold income, which is arithmetic the chart would draw and nobody
  // should plan on. Held to something a mature payer might sustain.
  let growth = Math.min(Math.max(suggested, -0.1), 0.25);

  const host = el('div', {});
  const thisYear = new Date().getUTCFullYear();

  const amountInput = el('input', {
    type: 'number', class: 'calfield__input', min: '100', step: '1000', value: String(amount),
    'aria-label': 'Amount invested',
    oninput: (e) => { amount = Math.max(Number(e.target.value) || 0, 0); draw(); },
  });
  const growthInput = el('input', {
    type: 'number', class: 'calfield__input', min: '-20', max: '40', step: '0.5',
    value: String(Math.round(growth * 1000) / 10),
    'aria-label': 'Annual dividend growth, per cent',
    oninput: (e) => { growth = (Number(e.target.value) || 0) / 100; draw(); },
  });

  function draw() {
    const income = [];
    const onCost = [];
    const labels = [];
    let dividend = amount * f.dividendYield;
    for (let i = 0; i < YEARS; i += 1) {
      labels.push(String(thisYear + i));
      income.push(dividend);
      onCost.push(amount > 0 ? dividend / amount : null);
      dividend *= 1 + growth;
    }

    host.replaceChildren(
      columnChart(labels, [{
        name: 'Annual income', color: 'var(--chart-02)', values: income,
      }], { height: 260, valueFmt: (v) => `${cur}${num(v, 0)}`, legend: false }),
      el('div', { class: 'ostats ostats--split' }, [
        statLine(`Income in ${labels[0]}`, `${cur}${num(income[0], 0)}`, { note: 'at today’s yield' }),
        statLine(`Income in ${labels.at(-1)}`, `${cur}${num(income.at(-1), 0)}`, {
          note: `after ${YEARS} years at ${pct(growth, { sign: true })}`,
        }),
        statLine('Yield on cost by then', pct(onCost.at(-1), { dp: 2 }), {
          title: 'The projected payment over what was originally paid for the shares — not over '
            + 'what they are worth by then, which nobody can know.',
        }),
      ]),
    );
  }
  draw();

  return card('dv-projection', [
    ohead('What it compounds to', null,
      'One growth rate compounded for ten years. This is arithmetic and not a forecast: no '
      + 'company raises a dividend at a constant rate for a decade, and nothing here models a '
      + 'cut, a recession or a rerating. Change the rate and watch it move.'),
    el('div', { class: 'calbar' }, [
      el('label', { class: 'calfield' }, [
        el('span', { class: 'calfield__label', text: `Invested (${a.facts.currency || 'currency'})` }),
        amountInput,
      ]),
      el('label', { class: 'calfield' }, [
        el('span', { class: 'calfield__label', text: 'Annual growth %' }),
        growthInput,
      ]),
    ]),
    host,
    el('p', { class: 't-tiny subtle mt2', text: `Opens on ${pct(growth, { sign: true })}, this `
      + 'company’s own compound growth over the longest run of complete years on record, capped '
      + 'at 25% — a rate above that is a young dividend rather than a sustainable one.' }),
  ], 'ocard ovw__c8');
}

/* ==========================================================================
   The shareholder panel

   The dividend is one of two ways cash leaves for shareholders and, at a
   company that buys back stock, usually the smaller. Everything on this panel
   counts both.
   ========================================================================== */

function returnsCard(a) {
  const sh = a.shareholder || { rows: [] };
  const rows = sh.rows.filter((r) => isNum(r.returned));
  const fmt = (v) => money(v, { currency: curSymbol(a.facts.currency) });

  if (rows.length < 2) {
    return card('sh-returns', [
      ohead('Returned to shareholders'),
      feedGate(a, 'cashflow', 'The cash flow statement')
        || notice('At least two filed years are needed to draw what went back to shareholders.'),
    ], 'ocard ovw__c8');
  }

  return card('sh-returns', [
    ohead('Returned to shareholders', null,
      'Dividends and buybacks stacked, with their filed minus signs removed. Buybacks are cash '
      + 'spent, not shares retired — a company that repurchases exactly what it issues to staff '
      + 'appears here in full and leaves the share count where it was.'),
    columnChart(rows.map((r) => String(r.year)), [
      { name: 'Dividends', color: 'var(--chart-02)', values: rows.map((r) => r.dividends) },
      { name: 'Buybacks', color: 'var(--chart-05)', values: rows.map((r) => r.buybacks) },
    ], { height: 280, stacked: true, valueFmt: fmt }),
    runBadges(rows, (r) => r.returned),
  ], 'ocard ovw__c8');
}

function returnsFiguresCard(a) {
  const sh = a.shareholder || {};
  const fmt = (v) => money(v, { currency: curSymbol(a.facts.currency) });
  const last = sh.latest || {};
  const share = isNum(sh.lifetimeReturned) && sh.lifetimeReturned > 0 && isNum(sh.lifetimeBuybacks)
    ? sh.lifetimeBuybacks / sh.lifetimeReturned : null;

  return card('sh-figures', [
    ohead('The whole of it', null,
      'Summed across every filed year on this tab. The split is the policy: a company returning '
      + 'four fifths of it through buybacks is making a different promise from one paying it as '
      + 'a dividend, because a buyback can be stopped without anybody calling it a cut.'),
    el('div', { class: 'ostats' }, [
      statLine(`Dividends, fiscal ${last.year ?? 'year'}`, fmt(last.dividends)),
      statLine(`Buybacks, fiscal ${last.year ?? 'year'}`, fmt(last.buybacks)),
      statLine(`Returned, fiscal ${last.year ?? 'year'}`, fmt(last.returned)),
      statLine('Shareholder yield', pct(last.shareholderYield, { dp: 2 }), {
        note: 'on that year’s market cap',
        title: 'Everything returned over what the whole company was worth that year — a yield '
          + 'on a price somebody could have paid, rather than on today’s.',
      }),
    ]),
    el('div', { class: 'ostats ostats--split' }, [
      statLine('Dividends in total', fmt(sh.lifetimeDividends), { note: sh.span }),
      statLine('Buybacks in total', fmt(sh.lifetimeBuybacks), { note: sh.span }),
      statLine('Returned in total', fmt(sh.lifetimeReturned), { note: sh.span }),
      statLine('Through buybacks', isNum(share) ? pct(share) : 'n/a', { note: 'of the total' }),
    ]),
  ], 'ocard ovw__c4');
}

function shareholderYieldCard(a) {
  const sh = a.shareholder || { rows: [] };
  const rows = sh.rows.filter((r) => isNum(r.shareholderYield));

  if (rows.length < 2) {
    return card('sh-yield', [
      ohead('Shareholder yield over time'),
      notice('At least two filed years with a market capitalisation are needed to draw a yield.'),
    ], 'ocard ovw__c8');
  }

  const line = (name, color, get) => ({
    name, color, points: rows.map((r) => ({ date: r.date, value: get(r) })),
  });

  return card('sh-yield', [
    ohead('Shareholder yield over time', null,
      'Per filed year rather than per day: the buyback half is only known once a year, so a '
      + 'daily line would be a step function pretending to be a measurement. Each year divides '
      + 'by that year’s own market capitalisation.'),
    multiLineChart([
      line('Everything returned', 'var(--chart-01)', (r) => r.shareholderYield),
      line('Dividends alone', 'var(--chart-02)', (r) => r.dividendYield),
      line('Buybacks alone', 'var(--chart-05)', (r) => r.buybackYield),
    ], { height: 260, valueFmt: (v) => pct(v, { dp: 1 }) }),
    rangeBadges(sh.yieldStat, (v) => pct(v, { dp: 2 })),
  ], 'ocard ovw__c8');
}

function shareholderPayoutCard(a) {
  const sh = a.shareholder || { rows: [] };
  const rows = sh.rows.filter((r) => isNum(r.shareholderEarningsPayout) || isNum(r.shareholderFcfPayout));

  if (rows.length < 2) {
    return card('sh-payout', [
      ohead('Cover for the whole return'),
      notice('At least two filed years are needed to draw a cover history.'),
    ], 'ocard ovw__c8');
  }

  const line = (name, color, get) => ({
    name, color, points: rows.map((r) => ({ date: r.date, value: get(r) })),
  });
  const last = rows.at(-1) || {};
  const over = (v) => (isNum(v) && v > 1 ? 'neg' : '');

  return card('sh-payout', [
    ohead('Cover for the whole return', null,
      'Dividends and buybacks together against the profit and the free cash flow of the same '
      + 'year. Above 100% the return was not funded by the year that paid it — it came from cash '
      + 'on hand, from borrowing, or from selling something.'),
    multiLineChart([
      line('Of earnings', 'var(--chart-01)', (r) => r.shareholderEarningsPayout),
      line('Of free cash flow', 'var(--chart-04)', (r) => r.shareholderFcfPayout),
    ], { height: 260, valueFmt: (v) => pct(v, { dp: 0 }) }),
    el('div', { class: 'ostats ostats--split' }, [
      statLine('Of earnings', pct(last.shareholderEarningsPayout), {
        note: `FY${last.year ?? ''}`, tone: over(last.shareholderEarningsPayout),
      }),
      statLine('Of free cash flow', pct(last.shareholderFcfPayout), {
        note: `FY${last.year ?? ''}`, tone: over(last.shareholderFcfPayout),
      }),
    ]),
  ], 'ocard ovw__c8');
}

function shareholderBasisCard(a) {
  const sh = a.shareholder || {};
  return card('sh-basis', [
    ohead('About these figures'),
    el('ul', { class: 'rlimits' }, [
      'Every figure on this panel is a filed fiscal year from the cash flow statement, not a '
        + 'trailing twelve months. It will not tie to the yields in the metrics grid.',
      'Buybacks are the cash the company spent repurchasing stock. They are not the same as the '
        + 'share count falling: a repurchase that only offsets stock issued to employees leaves '
        + 'the count flat and still appears here in full.',
      'The yields divide by the market capitalisation of the year in question, taken from the '
        + 'annual key-metrics feed. Where a plan does not return one, that year has no yield.',
      'Nothing here is graded or ranked. The dividend is graded, as one of the six factors; what '
        + 'a company returns through buybacks is not.',
    ].map((text) => el('li', { text }))),
    el('p', { class: 't-tiny subtle mt2', text: `Covering ${sh.span || 'the filed years'}.` }),
  ], 'ocard ovw__c12');
}

/* ---------- 1. what it pays ----------------------------------------------- */

function headlineCard(a) {
  const f = a.facts;
  const d = a.dividends || {};
  const cur = curSymbol(f.currency);

  const stability = (() => {
    if (!isNum(d.worstDrop)) return { text: 'not enough history', tone: '' };
    if (d.worstDrop >= 0) return { text: 'never cut', tone: 'pos' };
    if (d.stable) return { text: `deepest cut ${pct(Math.abs(d.worstDrop))}`, tone: '' };
    return { text: `cut ${pct(Math.abs(d.worstDrop))} in a year`, tone: 'neg' };
  })();

  return card('dv-headline', [
    ohead(`${f.name} dividend`, null,
      'Yield and per-share figures are trailing twelve months. Growth and stability are measured '
      + 'over the complete calendar years on record.'),

    el('div', { class: 'fhero__score' }, [
      el('b', { text: isNum(f.dividendYield) ? pct(f.dividendYield, { dp: 2 }) : '—' }),
      el('i', { text: 'yield' }),
      el('span', { class: 'fhero__basis', text: isNum(f.dividendPerShare)
        ? `${price(f.dividendPerShare, cur)} per share over the last twelve months`
        : 'no trailing dividend per share' }),
    ]),

    el('div', { class: 'ostats ostats--split' }, [
      statLine('Payout ratio', pct(f.payoutRatio, { dp: 0 }), { note: 'of earnings' }),
      statLine('Cash payout ratio', pct(f.cashPayoutRatio, { dp: 0 }), { note: 'of free cash flow' }),
      statLine('Dividend growth', isNum(d.growth) ? pct(d.growth, { sign: true }) : 'n/a', {
        note: d.years ? `annualised over ${d.years} years` : '',
      }),
      statLine('Years on record', d.years ? String(d.years) : 'n/a', {
        note: 'complete calendar years',
      }),
      statLine('Stability', stability.text, { tone: stability.tone }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- 2. against the market ----------------------------------------- */

/**
 * The yield against the quartile bars from Settings.
 *
 * Not against the sector: the sector distribution the report grades on covers
 * every company in it, most of which pay nothing, so a percentile against it
 * would tell a reader more about how many non-payers the sector holds than
 * about this dividend. The two market quartiles are among dividend *payers*,
 * which is the comparison somebody buying for income actually wants.
 */
function yieldCard(a) {
  const f = a.facts;

  return card('dv-yield', [
    ohead('Against other payers', null,
      'The quartile marks are among dividend-paying companies, not all listed companies — a '
      + 'percentile against everything would mostly be counting non-payers. Both marks are '
      + 'editable in Settings.'),

    cmpBars([
      { label: 'Bottom quartile of payers', value: a.bm.dividendNotable },
      { label: 'Top quartile of payers', value: a.bm.dividendTopTier },
      { label: f.symbol, value: f.dividendYield, self: true },
    ], { fmt: (v) => pct(v, { dp: 2 }) }),

    el('p', { class: 't-xs soft mt3', text: yieldNote(a) }),
  ], 'ocard ovw__c4');
}

function yieldNote(a) {
  const f = a.facts;
  const y = f.dividendYield;
  if (!isNum(y) || y <= 0) return `${f.symbol} pays no dividend, so there is no yield to rank.`;
  if (y >= a.bm.dividendTopTier) {
    return `At ${pct(y, { dp: 2 })} the yield sits in the top quartile of payers. A high yield is `
      + 'as often a fallen share price as a generous board — the cover figures beside this say '
      + 'which.';
  }
  if (y >= a.bm.dividendNotable) {
    return `At ${pct(y, { dp: 2 })} the yield is in the middle of the range for payers — enough to `
      + 'count as income, not enough to be the reason for holding it.';
  }
  return `At ${pct(y, { dp: 2 })} the yield is below the bottom quartile of payers. The dividend is `
    + 'a token rather than a source of income, which is usually a choice to retain cash or to '
    + 'return it through buybacks instead.';
}

/* ---------- 3. is it covered? --------------------------------------------- */

/**
 * One gauge, one sentence.
 *
 * The bands are fixed rather than sector-relative, and stop at 120%: past
 * that the needle pins and the exact figure stops mattering — the dividend is
 * not covered, and by how much is a detail.
 */
function coverCard(a, key, title, { value, label, info, note }) {
  return card(`dv-${key}`, [
    ohead(title, null, info),
    el('div', { class: 'dvgauge' }, [
      gauge(value, {
        min: 0, max: 1.2, label,
        bands: [
          { from: 0, to: 0.6, color: 'var(--good)' },
          { from: 0.6, to: 0.9, color: 'var(--neutral)' },
          { from: 0.9, to: 1.2, color: 'var(--bad)' },
        ],
      }),
      el('p', { class: 't-xs soft', text: note }),
    ]),
  ], 'ocard ovw__c4');
}

/** Whether reported profit covers the dividend. */
function coverNote(a) {
  const f = a.facts;
  if (!isNum(f.dividendYield) || f.dividendYield <= 0) return `${f.symbol} pays no dividend, so there is nothing to cover.`;
  if (!isNum(f.payoutRatio)) return 'The payout ratio needs both a dividend and trailing earnings.';
  if (f.payoutRatio < 0) return `${f.symbol} is paying a dividend out of losses, which cannot continue indefinitely.`;
  return f.payoutRatio <= a.bm.payoutCeiling
    ? `At ${pct(f.payoutRatio, { dp: 0 })} of earnings the dividend is comfortably covered, leaving `
      + `${pct(1 - f.payoutRatio, { dp: 0 })} of profit retained in the business.`
    : `At ${pct(f.payoutRatio, { dp: 0 })} of earnings the dividend is not covered by profit — it is `
      + 'being funded from reserves, borrowing or asset sales.';
}

/** The same question asked of cash rather than of reported profit. */
function cashNote(a) {
  const f = a.facts;
  if (!isNum(f.dividendYield) || f.dividendYield <= 0) return `${f.symbol} pays no dividend.`;
  if (!isNum(f.cashPayoutRatio)) return 'A cash payout ratio needs free cash flow per share, which is not available.';
  return f.cashPayoutRatio <= a.bm.payoutCeiling
    ? `Free cash flow covers the payout ${mult(1 / f.cashPayoutRatio)} over — the test that matters `
      + 'more than the profit one, because the dividend is paid in cash.'
    : `The payout is ${pct(f.cashPayoutRatio, { dp: 0 })} of free cash flow, so the cash going out `
      + 'exceeds the cash coming in. That is funded from the balance sheet, and it is the earlier '
      + 'warning of the two.';
}

/* ---------- 4. has it held up? -------------------------------------------- */

/**
 * Dividends per share by year, with the buyback leg beside it.
 *
 * The dividend on its own understates what a company returns — a business
 * paying a token dividend and buying back 2% of itself a year is returning
 * more than one yielding 3% and issuing stock. Both bars are per fiscal year
 * off the cash flow statement, so they are comparable to each other even
 * though the dividend history above is by calendar year.
 */
function historyCard(a) {
  const d = a.dividends || {};
  const cur = curSymbol(a.facts.currency);

  const chart = d.available && d.byYear.length > 1
    ? columnChart(d.byYear.map((r) => String(r.year)),
        [{ name: 'Dividend per share', color: 'var(--brand-01)', values: d.byYear.map((r) => r.amount) }],
        // Two decimals flat: `price()` switches to four below a dollar, which
        // puts "US$0.5000" on the same axis as "US$1.00".
        { valueFmt: (v) => `${cur}${dec(v, 2)}`, height: 250, legend: false })
    : (feedGate(a, 'dividends', 'Dividend history')
      || notice('At least two complete years of payments are needed to chart a history.'));

  const cash = a.facts.statements.cash || [];
  const abs = (v) => (isNum(v) ? Math.abs(v) : null);
  const returns = cash.length >= 2
    ? columnChart(cash.map((r) => String(yearOf(r.date))), [
        { name: 'Dividends', color: 'var(--chart-03)',
          values: cash.map((r) => abs(r.commonDividendsPaid ?? r.netDividendsPaid)) },
        { name: 'Buybacks', color: 'var(--chart-05)',
          values: cash.map((r) => abs(r.commonStockRepurchased)) },
      ], { valueFmt: (v) => money(v, { currency: cur }), height: 250 })
    : null;

  return card('dv-history', [
    ohead('Payment history', null,
      'Per share by calendar year — the current, incomplete year is excluded so a part-year does '
      + 'not read as a cut.'),
    chart,

    returns ? el('div', {}, [
      el('p', { class: 'osub' }, ['The whole of what was returned']),
      returns,
      el('p', { class: 't-tiny subtle mt1', text: 'Both legs by fiscal year, from the cash flow '
        + 'statement, with their filed minus signs removed. A company can return far more through '
        + 'buybacks than through its dividend, and the yield alone would never show it.' }),
    ]) : null,
  ], 'ocard ovw__c12');
}

/* ---------- 5. the payment record ----------------------------------------- */

/**
 * The individual payments, newest first.
 *
 * The charts above answer "has it held up"; this answers "when, and how
 * much", which is the question somebody already holding the share is asking.
 * Twenty rows is about two years for a quarterly payer and five for an annual
 * one — enough to see the pattern without becoming a ledger.
 */
function recordCard(a) {
  const d = a.dividends || {};
  const cur = curSymbol(a.facts.currency);
  const rows = [...(d.rows || [])]
    .filter((r) => r && r.date)
    .sort((x, y) => new Date(y.date) - new Date(x.date))
    .slice(0, 20);

  if (!rows.length) {
    return card('dv-record', [
      ohead('Payment record'),
      feedGate(a, 'dividends', 'Dividend payments')
        || notice('No individual dividend payments are on record.'),
    ], 'ocard ovw__c12');
  }

  /*
   * Columns are chosen from what the rows actually carry.
   *
   * A record date that equals the ex-dividend date in every single row is not
   * a fact about the company — it is what a trimmed feed looks like when the
   * field was copied rather than returned. Printing it as its own column
   * invites the reader to read a coincidence as a schedule, so it comes out,
   * the same way the statement tables drop a line the feed never fills.
   */
  const has = (get) => rows.some((r) => get(r));
  const differs = (get) => rows.some((r) => get(r) && get(r) !== r.date);

  const cols = [
    { label: 'Ex-dividend date', get: (r) => fmtDate(r.date) },
    has((r) => r.declarationDate) && differs((r) => r.declarationDate)
      ? { label: 'Declared', get: (r) => (r.declarationDate ? fmtDate(r.declarationDate) : '—') } : null,
    has((r) => r.recordDate) && differs((r) => r.recordDate)
      ? { label: 'Record date', get: (r) => (r.recordDate ? fmtDate(r.recordDate) : '—') } : null,
    has((r) => r.paymentDate)
      ? { label: 'Payment date', get: (r) => (r.paymentDate ? fmtDate(r.paymentDate) : '—') } : null,
    { label: 'Amount', num: true,
      get: (r) => (isNum(r.adjDividend ?? r.dividend) ? price(r.adjDividend ?? r.dividend, cur) : 'n/a') },
    has((r) => r.frequency) ? { label: 'Frequency', get: (r) => r.frequency || '—' } : null,
  ].filter(Boolean);

  return card('dv-record', [
    ohead('Payment record', null,
      'The last 20 payments. Amounts are adjusted for splits where the vendor provides an '
      + 'adjusted figure, so a historic payment is comparable to a recent one.'),

    table(cols.map((c) => ({ label: c.label, num: c.num })),
      rows.map((r) => cols.map((c) => c.get(r)))),

    el('p', { class: 't-tiny subtle mt2', text: `${rows.length} of ${d.rows.length} payments on `
      + 'record. Declaration, record and payment dates are shown only where the feed returns '
      + 'them as distinct dates.' }),
  ], 'ocard ovw__c12');
}

/* ---------- 6. the basis -------------------------------------------------- */

function basisCard(a, nav) {
  const f = a.facts;
  const d = a.dividends || {};

  return card('dv-basis', [
    ohead('About these figures'),

    el('div', { class: 'ostats' }, [
      statLine('Yield basis', 'Trailing twelve months', { note: 'not forward' }),
      statLine('History basis', 'Complete calendar years', {
        note: d.byYear?.length ? `${d.byYear[0].year}–${d.byYear.at(-1).year}` : 'none on record',
      }),
      statLine('Payments on record', d.rows?.length ? String(d.rows.length) : 'none'),
      statLine('Reporting currency', f.currency || 'n/a'),
    ]),

    el('p', { class: 'osub', text: 'What these figures do not say' }),
    el('ul', { class: 'rlimits' }, [
      'The yield is trailing, not forward. A board that has announced an increase, or a cut, '
        + 'will not show it here until the payments land.',
      'History is aggregated by calendar year while the cover ratios are trailing twelve months '
        + 'and the buyback bars are fiscal years. Three periods, because that is what each '
        + 'source carries — they will not tie exactly.',
      'A special or one-off dividend is counted the same as a regular one, so a year holding one '
        + 'shows as growth followed by a cut.',
      'Nothing on this tab is a forecast. The consensus dividend, where analysts publish one, is '
        + 'not part of the estimates feed this report fetches.',
    ].map((text) => el('li', { text }))),

    nav.openAnalysis ? el('button', {
      type: 'button', class: 'omore', text: 'Read the dividend section in the full report',
      onclick: () => nav.openAnalysis('dividend'),
    }) : null,
  ], 'ocard ovw__c12');
}
