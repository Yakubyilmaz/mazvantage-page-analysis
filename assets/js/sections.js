/* ==========================================================================
   Maz Vantage — report sections

   Each `renderX(a, ctx)` returns a detached element. `a` is the analysis
   object from model.js; `ctx` carries things fetched alongside the main
   dataset (benchmark price series, peer ratios).
   ========================================================================== */

import {
  el, esc, isNum, money, num, pct, mult, price, trim, dec, fmtDate, ago,
  yearOf, initials, signClass, mean, cagr, clamp,
} from './util.js';
import {
  lineChart, columnChart, forecastChart, rangeChart, fairValueChart,
  waterfallChart, gauge, donut, volatilityStrip,
} from './charts.js';
import {
  card, blockEl, notice, keyInfo, cmpBars, table, feedGate, icon, curSymbol,
} from './ui.js';
import { normalisePrices, computeReturns, weeklyVolatility } from './model.js';
import { FACTOR_BY_KEY } from './factors.js';
import { gradePill } from './gradeview.js';
import { MAX_SCORE } from './grading.js';

/* ==========================================================================
   Shared building blocks
   ========================================================================== */






/** The 0-6 score header plus its check list. */



/** Horizontal comparison bars sharing one scale. */


/** Renders the gated/unavailable message for a feed, or null when it is fine. */

/* ==========================================================================
   1. Overview
   ========================================================================== */

export function renderOverview(a) {
  const f = a.facts;

  const desc = el('p', { class: 't-xs soft', style: { marginTop: '8px', lineHeight: '1.7' } },
    [f.description ? f.description.slice(0, 420) + (f.description.length > 420 ? '…' : '') : 'No company description available.']);

  const more = el('button', { class: 'btn btn--ghost t-tiny', text: 'Show more' });
  let open = false;
  more.addEventListener('click', () => {
    open = !open;
    desc.textContent = open ? f.description : f.description.slice(0, 420) + '…';
    more.textContent = open ? 'Show less' : 'Show more';
  });

  return card('overview', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: `${f.symbol} Stock Overview` }),
      el('p', { text: shortPitch(f) }),
    ]),
    desc,
    f.description && f.description.length > 420 ? more : null,

    el('div', { class: 'block' }, [
      el('div', { class: 'block__head' }, [
        el('div', {}, [
          el('h3', { class: 'block__title', text: 'Vantage Flake Analysis' }),
          el('p', { class: 'block__desc', text: a.verdict }),
        ]),
      ]),
      // No flake here: the sticky one beside the report carries the same five
      // scores and never leaves the screen, so a second copy inline was
      // repeating itself and squeezing the rewards and risks into half the
      // width they read better at.
      el('div', { class: 'block__body' }, [
        el('div', { class: 'rrgrid' }, [
          rrList('Rewards', a.rewards, 'reward'),
          rrList('Risk Analysis', a.risks, 'risk'),
        ]),
      ]),
    ]),
  ]);
}

function shortPitch(f) {
  const bits = [f.industry, f.sector].filter(Boolean);
  return bits.length ? `${f.name} · ${bits.join(' · ')}` : f.name;
}

function rrList(title, items, kind) {
  return el('div', { class: `rr rr--${kind}` }, [
    el('h3', { text: title }),
    items.length
      ? el('ul', {}, items.map((t) => el('li', {}, [el('span', { text: t })])))
      : el('p', { class: 'rr__empty', text: kind === 'reward' ? 'No standout rewards identified.' : 'No material risks flagged by the checks.' }),
  ]);
}

/* ==========================================================================
   2. Price history & performance
   ========================================================================== */

const RANGES = [
  { key: '1M', days: 30 }, { key: '3M', days: 92 }, { key: '6M', days: 183 },
  { key: '1Y', days: 365 }, { key: '3Y', days: 1095 }, { key: '5Y', days: 1825 },
  { key: 'Max', days: Infinity },
];

export function renderPriceHistory(a, ctx) {
  const f = a.facts;
  const prices = normalisePrices(a.ds.get('prices'));

  const chartHost = el('div', {});
  const sel = el('div', { class: 'rangesel' });
  let active = '1Y';

  const draw = () => {
    const days = RANGES.find((r) => r.key === active).days;
    const cutoff = Date.now() - days * 864e5;
    const pts = prices.filter((p) => days === Infinity || new Date(p.date).getTime() >= cutoff);
    chartHost.replaceChildren(
      pts.length > 1
        ? lineChart(pts.map((p) => ({ date: p.date, value: p.price })), {
            valueFmt: (v) => price(v, curSymbol(f.currency)),
            labelFmt: (d) => fmtDate(d, { month: 'short', year: '2-digit' }),
          })
        : (feedGate(a, 'prices', 'Price history') || notice('No price history for this range.')),
    );
    [...sel.children].forEach((b) => b.classList.toggle('is-on', b.textContent === active));
  };

  RANGES.forEach((r) => {
    const b = el('button', { type: 'button', text: r.key });
    b.addEventListener('click', () => { active = r.key; draw(); });
    sel.append(b);
  });
  draw();   // paint the default range before the card is attached

  const returns = computeReturns(prices);
  const bench = ctx?.benchmarks || {};
  const industryR = computeReturns(normalisePrices(bench.industry));

  const periods = ['7D', '1M', '3M', '1Y', '3Y', '5Y'];
  const retRows = [
    [el('b', { text: f.symbol }), ...periods.map((p) => tone(returns[p]))],
    [el('span', { class: 'soft', text: `${f.sector || 'Industry'}` }), ...periods.map((p) => tone(industryR[p]))],
  ];

  const sectorName = f.sector ? `${f.sector} sector` : 'industry';
  const vsIndustry = verdictVs(returns['1Y'], industryR['1Y'], f.symbol, sectorName);

  const vol = weeklyVolatility(prices);

  return card('price-history', [
    el('div', { class: 'card__head' }, [el('h2', { text: 'Price History & Performance' })]),

    blockEl('Share price', `Closing prices${prices.length ? ` since ${fmtDate(prices[0].date)}` : ''}.`,
      [chartHost], sel),

    blockEl('Shareholder Returns', 'Total price return over each period, against the sector.', [
      table([{ label: '' }, ...periods.map((p) => ({ label: p, num: true }))], retRows),
      el('div', { class: 'mt2' }, [
        el('p', { class: 't-xs soft' }, [el('b', { text: 'Return vs Industry: ' }), vsIndustry]),
      ]),
      bench.note ? el('p', { class: 't-tiny subtle mt1', text: bench.note }) : null,
    ]),

    blockEl('Price Volatility', 'Weekly price movement compared with the market and the sector.', [
      volatilityStrip({
        stock: vol,
        market: weeklyVolatility(normalisePrices(bench.market)),
        industry: weeklyVolatility(normalisePrices(bench.industry)),
      }),
      el('p', { class: 't-xs soft mt2' }, [
        el('b', { text: 'Volatility Over Time: ' }),
        isNum(vol)
          ? `${f.symbol}'s weekly volatility (${pct(vol)}) is ${vol < 0.05 ? 'in line with' : 'above'} a typical large-cap range over the past year.`
          : 'Not enough price history to measure volatility.',
      ]),
    ]),

    renderNews(a),
  ]);
}




function tone(v) {
  return el('span', { class: signClass(v), text: isNum(v) ? pct(v, { sign: true }) : 'n/a' });
}

function verdictVs(stock, bench, sym, what) {
  if (!isNum(stock) || !isNum(bench)) return `Not enough history to compare ${sym} with the ${what}.`;
  const beat = stock > bench;
  return `${sym} ${beat ? 'outperformed' : 'underperformed'} the ${what}, which returned ${pct(bench)} over the past year.`;
}


function renderNews(a) {
  const news = a.ds.get('news');
  if (!Array.isArray(news) || !news.length) {
    const gate = feedGate(a, 'news', 'Recent news');
    return blockEl('Recent News & Updates', 'Company headlines from the last few weeks.',
      [gate || notice('No recent headlines returned for this ticker.')]);
  }
  return blockEl('Recent News & Updates', 'Company headlines from the last few weeks.', [
    el('div', { class: 'people' }, news.slice(0, 8).map((n) => el('article', { class: 'person', style: { alignItems: 'flex-start' } }, [
      el('div', { class: 'person__av', text: (n.publisher || n.site || '?').slice(0, 2).toUpperCase() }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'person__t' }, [`${n.publisher || n.site || 'News'} · ${fmtDate(n.publishedDate || n.date)}`]),
        el('a', {
          class: 'person__n', href: n.url || '#', target: '_blank', rel: 'noopener noreferrer',
          text: n.title || 'Untitled',
        }),
        n.text ? el('p', { class: 't-tiny soft', style: { marginTop: '4px' }, text: String(n.text).slice(0, 220) + '…' }) : null,
      ]),
    ]))),
  ]);
}

/* ==========================================================================
   3. About the company + fundamentals summary
   ========================================================================== */

export function renderAbout(a) {
  const f = a.facts;

  const breakdown = (() => {
    const rev = f.revenue;
    if (!isNum(rev)) return null;
    const gross = isNum(f.grossMargin) ? rev * f.grossMargin : null;
    const cor = isNum(gross) ? rev - gross : null;
    const earnings = f.netIncome;
    const other = isNum(gross) && isNum(earnings) ? gross - earnings : null;
    return { rev, cor, gross, other, earnings };
  })();

  return card('about', [
    el('div', { class: 'card__head' }, [el('h2', { text: 'About the Company' })]),

    keyInfo([
      // FMP reports the listing date, not the incorporation date — label it honestly.
      ['Listed since', f.ipoDate ? String(yearOf(f.ipoDate)) : 'n/a'],
      ['Employees', isNum(f.employees) ? f.employees.toLocaleString('en-US') : 'n/a'],
      ['CEO', f.ceo || 'n/a'],
      ['Website', f.website ? f.website.replace(/^https?:\/\//, '') : 'n/a'],
    ]),

    blockEl(`${f.name} Fundamentals Summary`, 'How the trailing twelve months translate into the headline multiples.', [
      keyInfo([
        ['Market cap', money(f.marketCap)],
        ['Revenue (TTM)', money(f.revenue)],
        ['Earnings (TTM)', money(f.netIncome)],
        ['P/E ratio', mult(f.pe)],
        ['P/S ratio', mult(f.ps)],
      ]),

      breakdown ? el('div', { class: 'mt3' }, [
        el('h4', { class: 'block__title', text: 'Earnings & Revenue' }),
        el('p', { class: 'block__desc', text: `What each dollar of revenue has to cover before it reaches `
          + `${f.symbol}'s bottom line, over the trailing twelve months.` }),
        el('div', { class: 'mt2' }, [
          waterfallChart([
            { label: 'Revenue', value: breakdown.rev, kind: 'total', color: 'var(--brand-01)' },
            { label: 'Cost of revenue', value: isNum(breakdown.cor) ? -breakdown.cor : null, kind: 'delta' },
            { label: 'Gross profit', value: breakdown.gross, kind: 'total', color: 'var(--chart-01)' },
            { label: 'Other expenses', value: isNum(breakdown.other) ? -breakdown.other : null, kind: 'delta' },
            { label: 'Earnings', value: breakdown.earnings, kind: 'total', color: 'var(--good)' },
          ], { valueFmt: (v) => money(v) }),
        ]),
      ]) : null,

      el('div', { class: 'mt3' }, [
        keyInfo([
          ['Last reported earnings', lastEarnings(a) ?? (f.lastReported ? fmtDate(f.lastReported) : 'n/a')],
          ['Next earnings date', nextEarnings(a) ?? 'n/a'],
          ['Earnings per share (TTM)', dec(f.eps, 2)],
          ['Gross margin', pct(f.grossMargin, { dp: 2 })],
          ['Net profit margin', pct(f.netMargin, { dp: 2 })],
          ['Debt/equity ratio', pct(f.debtToEquity)],
          ['Dividend yield', pct(f.dividendYield, { dp: 2 })],
          ['Payout ratio', pct(f.payoutRatio, { dp: 0 })],
          ['Beta', dec(f.beta, 2)],
        ]),
      ]),
    ]),
  ]);
}

/** Most recent past / next upcoming date from the earnings calendar feed. */
function splitEarnings(a) {
  const rows = (a.ds.get('earnings') || []).filter((r) => r && r.date);
  const now = Date.now();
  const past = rows.filter((r) => new Date(r.date).getTime() <= now)
    .sort((x, y) => new Date(y.date) - new Date(x.date));
  const future = rows.filter((r) => new Date(r.date).getTime() > now)
    .sort((x, y) => new Date(x.date) - new Date(y.date));
  return { last: past[0] || null, next: future[0] || null };
}

function lastEarnings(a) {
  const d = splitEarnings(a).last;
  return d ? fmtDate(d.date) : null;
}

function nextEarnings(a) {
  const d = splitEarnings(a).next;
  return d ? fmtDate(d.date) : null;
}

/* ==========================================================================
   4. Valuation
   ========================================================================== */





/* ==========================================================================
   5. Future growth
   ========================================================================== */



/* ==========================================================================
   6. Past performance
   ========================================================================== */



/* ==========================================================================
   Dividend

   Unscored. The payout ratios feed the graded factors (dividend yield sits
   under Valuation, payout growth under Growth); this section is the detail
   behind them rather than a sixth score.
   ========================================================================== */

export function renderDividend(a) {
  const f = a.facts, d = a.dividends;

  const historyChart = d.available && d.byYear.length > 1
    ? columnChart(d.byYear.map((r) => String(r.year)),
        [{ name: 'Dividend per share', color: 'var(--brand-01)', values: d.byYear.map((r) => r.amount) }],
        { valueFmt: (v) => dec(v, 2), height: 230, legend: false })
    : (feedGate(a, 'dividends', 'Dividend history') || notice('No dividend payment history available.'));

  const yieldCompare = cmpBars([
    { label: 'Bottom 25% of payers', value: a.bm.dividendNotable },
    { label: 'Top 25% of payers', value: a.bm.dividendTopTier },
    { label: `${f.symbol}`, value: f.dividendYield, self: true },
  ], { fmt: (v) => pct(v, { dp: 2 }) });

  return card('dividend', [
    el('div', { class: 'sec__intro' }, [
      el('h2', { text: `${f.name} Dividends and Buybacks` }),
      el('p', { text: `How much ${f.symbol} pays out, whether it is covered, and whether it has held up.` }),
      el('p', { class: 'sec__summary', text: dividendSummary(f) }),
    ]),

    blockEl('Key information', 'Yield, cover and growth at a glance.', [
      keyInfo([
        ['Dividend yield', pct(f.dividendYield, { dp: 2 })],
        ['Dividend per share', isNum(f.dividendPerShare) ? price(f.dividendPerShare, curSymbol(f.currency)) : 'n/a'],
        ['Payout ratio', pct(f.payoutRatio, { dp: 0 })],
        ['Cash payout ratio', pct(f.cashPayoutRatio, { dp: 0 })],
        ['Dividend growth (p.a.)', pct(d.growth, { dp: 1 })],
        ['Years of history', d.years ? String(d.years) : 'n/a'],
      ]),
    ]),

    blockEl('Stability and Growth of Payments',
      'Dividends per share by calendar year — the current, incomplete year is excluded.', [historyChart]),

    blockEl('Dividend Yield vs Market',
      `How ${f.symbol}'s yield ranks against dividend payers generally.`, [yieldCompare]),

    blockEl('Earnings Payout to Shareholders',
      'The share of profit paid out as dividends.', [
        el('div', { class: 'gauge' }, [
          gauge(f.payoutRatio, {
            min: 0, max: 1.2, label: 'of earnings paid out',
            bands: [
              { from: 0, to: 0.6, color: 'var(--good)' },
              { from: 0.6, to: 0.9, color: 'var(--neutral)' },
              { from: 0.9, to: 1.2, color: 'var(--bad)' },
            ],
          }),
          el('p', { class: 't-xs soft', style: { maxWidth: '360px' } },
            [dividendCoverNote(a)]),
        ]),
      ]),

    blockEl('Cash Payout to Shareholders',
      'The share of free cash flow paid out as dividends.', [
        el('div', { class: 'gauge' }, [
          gauge(f.cashPayoutRatio, {
            min: 0, max: 1.2, label: 'of free cash flow paid out',
            bands: [
              { from: 0, to: 0.6, color: 'var(--good)' },
              { from: 0.6, to: 0.9, color: 'var(--neutral)' },
              { from: 0.9, to: 1.2, color: 'var(--bad)' },
            ],
          }),
          el('p', { class: 't-xs soft', style: { maxWidth: '360px' } },
            [dividendCashNote(a)]),
        ]),
      ]),
  ]);
}

/**
 * Whether reported profit covers the dividend. The threshold is the payout
 * ceiling from Settings, so this note and the benchmarks stay in step.
 */
function dividendCoverNote(a) {
  const f = a.facts;
  if (!isNum(f.dividendYield) || f.dividendYield <= 0) return `${f.symbol} pays no dividend, so there is nothing to cover.`;
  if (!isNum(f.payoutRatio)) return 'The payout ratio needs both a dividend and trailing earnings.';
  if (f.payoutRatio < 0) return `${f.symbol} is paying a dividend out of losses, which cannot continue indefinitely.`;
  return f.payoutRatio <= a.bm.payoutCeiling
    ? `At ${pct(f.payoutRatio, { dp: 0 })} of earnings the dividend is comfortably covered, leaving `
      + `${pct(1 - f.payoutRatio, { dp: 0 })} of profit retained in the business.`
    : `At ${pct(f.payoutRatio, { dp: 0 })} of earnings the dividend is not covered by profit — it is being `
      + 'funded from reserves, borrowing or asset sales.';
}

/** The same question asked of cash rather than of reported profit. */
function dividendCashNote(a) {
  const f = a.facts;
  if (!isNum(f.dividendYield) || f.dividendYield <= 0) return `${f.symbol} pays no dividend.`;
  if (!isNum(f.cashPayoutRatio)) return 'A cash payout ratio needs free cash flow per share, which is not available.';
  return f.cashPayoutRatio <= a.bm.payoutCeiling
    ? `Free cash flow covers the payout ${mult(1 / f.cashPayoutRatio)} over — the test that matters more than `
      + 'the earnings one, because dividends are paid in cash.'
    : `The dividend takes ${pct(f.cashPayoutRatio, { dp: 0 })} of free cash flow, so there is little room for it `
      + 'to grow without the cash generation improving first.';
}

function dividendSummary(f) {
  if (!isNum(f.dividendYield) || f.dividendYield <= 0) return `${f.name} does not currently pay a dividend.`;
  return `${f.name} is a dividend paying company with a current yield of ${pct(f.dividendYield, { dp: 2 })}.`;
}

/* ==========================================================================
   9. Management
   ========================================================================== */

export function renderManagement(a) {
  const f = a.facts, x = a.execs;

  const ceoCard = x.ceo ? el('div', { class: 'person' }, [
    el('div', { class: 'person__av', text: initials(x.ceo.name) }),
    el('div', { style: { flex: '1' } }, [
      el('div', { class: 'person__n', text: x.ceo.name }),
      el('div', { class: 'person__t', text: x.ceo.title || 'Chief Executive Officer' }),
    ]),
    el('div', { class: 'person__pay' }, [
      el('div', { class: 'bold', text: isNum(x.ceoTotal) ? money(x.ceoTotal) : 'n/a' }),
      el('div', { class: 't-tiny softer', text: 'total compensation' }),
    ]),
  ]) : notice('No CEO detail is available for this company.');

  const peopleList = (list, empty) => list.length
    ? el('div', { class: 'people' }, list.map((p) => el('div', { class: 'person' }, [
        el('div', { class: 'person__av', text: initials(p.name) }),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'person__n', text: p.name }),
          el('div', { class: 'person__t', text: p.title || '' }),
        ]),
        el('div', { class: 'person__pay' }, [
          el('div', { text: isNum(p.pay) ? money(p.pay) : '—' }),
          p.yearBorn ? el('div', { class: 't-tiny softer', text: `born ${p.yearBorn}` }) : null,
        ]),
      ])))
    : (feedGate(a, 'executives', 'Leadership data') || notice(empty));

  const compChart = x.compHistory.length > 1
    ? columnChart(x.compHistory.map((c) => String(c.year)), [
        { name: 'Salary', color: 'var(--chart-01)', values: x.compHistory.map((c) => c.salary ?? null) },
        { name: 'Bonus & stock', color: 'var(--chart-04)', values: x.compHistory.map((c) => (c.total ?? 0) - (c.salary ?? 0)) },
      ], { stacked: true, valueFmt: (v) => money(v), height: 230 })
    : (feedGate(a, 'execComp', 'Executive compensation') || notice('No multi-year compensation history available.'));

  return card('management', [
    el('div', { class: 'sec__intro' }, [
      el('h2', { text: 'Management' }),
      el('p', { text: 'Who runs the company, how long they have been there, and what they are paid.' }),
    ]),

    blockEl('Key information', 'Tenure and pay across the leadership team.', [
      keyInfo([
        ['Chief executive officer', x.ceo?.name || f.ceo || 'n/a'],
        ['Total compensation', isNum(x.ceoTotal) ? money(x.ceoTotal) : 'n/a'],
        ['CEO tenure', isNum(x.ceoTenure) ? `${dec(x.ceoTenure, 1)} yrs` : 'n/a'],
        ['Management average tenure', isNum(x.managementTenure) ? `${dec(x.managementTenure, 1)} yrs` : 'n/a'],
        ['Board average tenure', isNum(x.boardTenure) ? `${dec(x.boardTenure, 1)} yrs` : 'n/a'],
        ['Size benchmark', x.capBand ? `${x.capBand.label} · ${money(x.capBand.typical)}` : 'n/a'],
      ]),
    ]),

    blockEl('CEO', 'Who runs the company.', [ceoCard]),
    blockEl('CEO Compensation Analysis', 'How the package is split and how it has moved.', [compChart]),
    blockEl('Leadership Team', 'Executives reporting into the CEO.', [peopleList(x.mgmt, 'No executive list available.')]),
    blockEl('Board Members', 'Directors and chairs.', [peopleList(x.board, 'No board list available.')]),
  ]);
}

/* ==========================================================================
   10. Ownership
   ========================================================================== */

/** The four-quarter roll-up from `deriveInsiders`, as a block. */
function insiderSummary(a) {
  const ins = a.insiders;
  if (!ins.available) return feedGate(a, 'insiderStats', 'Insider trading summary');

  return blockEl('Insider trading summary', `Shares acquired against shares disposed across ${ins.span}.`, [
    keyInfo([
      ['Shares acquired', ins.acquired.toLocaleString('en-US')],
      ['Shares disposed', ins.disposed.toLocaleString('en-US')],
      ['Net', `${ins.net >= 0 ? '+' : ''}${ins.net.toLocaleString('en-US')}`],
      ['Acquired / disposed', isNum(ins.ratio) ? dec(ins.ratio, 2) : 'n/a'],
    ]),
    el('p', { class: 't-xs soft mt2' }, [ins.note]),
  ]);
}

export function renderOwnership(a) {
  const f = a.facts;
  const trades = a.insiders.trades;
  const inst = a.ds.get('institutional');
  const float = a.ds.get('sharesFloat');

  const insiderTable = Array.isArray(trades) && trades.length
    ? table(
        [{ label: 'Date' }, { label: 'Insider' }, { label: 'Role' }, { label: 'Type' },
         { label: 'Shares', num: true }, { label: 'Value', num: true }],
        trades.slice(0, 12).map((t) => {
          // `acquisitionOrDisposition` is the reliable direction flag; the
          // transaction code ("S-Sale", "M-Exempt", "P-Purchase") is the label.
          const acquired = (t.acquisitionOrDisposition || '').toUpperCase() === 'A';
          return [
            fmtDate(t.transactionDate || t.filingDate),
            t.reportingName || 'n/a',
            (t.typeOfOwner || '—').replace(/^officer:\s*/i, ''),
            el('span', {
              class: `pill ${acquired ? 'pill--good' : 'pill--bad'}`,
              text: (t.transactionType || (acquired ? 'Acquired' : 'Disposed')).replace(/^[A-Z]-/, ''),
            }),
            isNum(t.securitiesTransacted) ? t.securitiesTransacted.toLocaleString('en-US') : 'n/a',
            isNum(t.price) && t.price > 0 && isNum(t.securitiesTransacted)
              ? money(t.price * t.securitiesTransacted) : '—',
          ];
        }),
      )
    : (feedGate(a, 'insiderTrades', 'Insider transactions') || notice('No insider transactions reported.'));

  const ownershipDonut = (() => {
    const freeFloat = float?.floatShares;
    const outstanding = float?.outstandingShares ?? f.shares;
    if (!isNum(freeFloat) || !isNum(outstanding) || outstanding <= 0) {
      return feedGate(a, 'sharesFloat', 'Ownership breakdown')
        || notice('No share float breakdown available.');
    }
    const closelyHeld = Math.max(outstanding - freeFloat, 0);
    return donut([
      { name: 'Free float', value: freeFloat, color: 'var(--chart-01)', display: num(freeFloat, 1) },
      { name: 'Closely held / insiders', value: closelyHeld, color: 'var(--brand-01)', display: num(closelyHeld, 1) },
    ], { centerValue: num(outstanding, 1), centerLabel: 'shares out' });
  })();

  const holders = Array.isArray(inst) && inst.length
    ? table(
        [{ label: 'Holder' }, { label: 'Shares', num: true }, { label: 'Value', num: true }, { label: 'Change', num: true }],
        inst.slice(0, 12).map((h) => [
          h.investorName || h.holder || 'n/a',
          isNum(h.sharesNumber) ? h.sharesNumber.toLocaleString('en-US') : 'n/a',
          money(h.marketValue),
          el('span', { class: signClass(h.changeInSharesNumberPercentage), text: pct(h.changeInSharesNumberPercentage, { already: true, sign: true }) }),
        ]),
      )
    : (feedGate(a, 'institutional', 'Top shareholders') || notice('No institutional holdings reported.'));

  return card('ownership', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: 'Ownership' }),
      el('p', { text: 'Who are the major shareholders, and have insiders been buying or selling?' }),
    ]),

    insiderSummary(a),

    blockEl('Recent Insider Transactions', 'Form 4 filings, most recent first.', [insiderTable]),
    blockEl('Ownership Breakdown', 'Free float against closely held stock.', [ownershipDonut]),
    blockEl('Top Shareholders', 'Largest reported institutional positions.', [holders]),
  ]);
}

/* ==========================================================================
   12. Competitors
   ========================================================================== */

export function renderCompetitors(a) {
  const peers = a.peers.peers;
  return card('competitors', [
    el('div', { class: 'card__head' }, [el('h2', { text: `${a.facts.name} Competitors` })]),
    peers.length
      ? el('div', { class: 'peers' }, peers.map((p) => el('a', { class: 'peer', href: `?symbol=${encodeURIComponent(p.symbol)}` }, [
          el('h3', { text: p.name }),
          el('dl', {}, [
            el('dt', { text: 'Symbol' }), el('dd', { text: p.symbol }),
            el('dt', { text: 'Market cap' }), el('dd', { text: money(p.marketCap) }),
            el('dt', { text: 'P/E' }), el('dd', { text: mult(p.pe) }),
          ]),
        ])))
      : (feedGate(a, 'peers', 'Competitors') || notice('No peer list available.')),
  ]);
}

/* ==========================================================================
   13. Data status
   ========================================================================== */

export function renderDataStatus(a) {
  const feeds = a.ds.feeds;
  const rows = Object.entries(feeds).map(([name, r]) => [
    name,
    el('span', {
      class: `pill ${r.status === 'ok' ? 'pill--good' : r.status === 'gated' ? 'pill--neutral' : r.status === 'error' ? 'pill--bad' : 'pill--muted'}`,
      text: r.fromSnapshot ? 'snapshot' : r.status,
    }),
    r.message || (r.fromSnapshot ? 'Served from the bundled snapshot' : ''),
  ]);

  const gatedList = a.ds.gatedFeeds();

  return card('data-status', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: 'Company Analysis and Data Status' }),
      el('p', { text: `Generated ${fmtDate(a.ds.asOf, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · source: ${a.ds.source}` }),
    ]),

    gatedList.length ? notice(
      `<b>${gatedList.length} feed${gatedList.length > 1 ? 's are' : ' is'} outside your current FMP plan:</b> `
      + `<code>${gatedList.map(esc).join('</code> <code>')}</code>. `
      + 'Ratios that depend on them are left out of the averages rather than scored zero, so grades stay honest.') : null,

    blockEl('Data Sources',
      'Every figure in this report comes from Financial Modeling Prep. Ratios are trailing twelve month unless stated.', [
      table([{ label: 'Feed' }, { label: 'Status' }, { label: 'Detail' }], rows),
    ]),

    blockEl('Analysis Model',
      `Every ratio is ranked against its sector and scored 0-${MAX_SCORE}; a factor is the mean of its ratios. `
      + 'The distributions live in assets/data/sector-stats.json and are rebuilt by tools/build_sector_stats.py.', [
      table([{ label: 'Factor' }, { label: 'Ratios', num: true }, { label: 'Graded', num: true },
             { label: 'Not assessed', num: true }, { label: 'Grade', num: true }],
        Object.values(FACTOR_BY_KEY).map((m) => {
          const f = a.scores[m.key];
          return [m.title, String(f.total), String(f.graded), String(f.total - f.graded),
                  gradePill(f.score, f.letter)];
        })),
    ]),

    blockEl('Sector Distributions',
      'Where the rankings on every ratio table come from.', [
      table([{ label: 'Property' }, { label: 'Value' }], [
        ['Sector', a.facts.sector || 'unknown'],
        ['Table loaded', a.sectorTable.available ? 'yes' : 'no — ratios fall back to peer-relative grading'],
        ['Source', a.sectorTable.quality === 'measured' ? 'measured from the FMP universe'
          : a.sectorTable.quality === 'seed' ? 'modelled seed — run tools/build_sector_stats.py to replace'
          : 'not loaded'],
        ['Built', a.sectorTable.generatedAt || 'n/a'],
        ['Companies in sector', isNum(a.sectorTable.count) ? a.sectorTable.count.toLocaleString('en-US') : 'n/a'],
      ]),
    ]),
  ]);
}
