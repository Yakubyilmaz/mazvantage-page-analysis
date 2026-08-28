/* ==========================================================================
   Maz Vantage — non-factor report sections

   The five graded factors live in factors.js. Everything here is context:
   the overview, price and momentum, the business itself, and the two
   evidence sections — Dividend and Management — that are deliberately not
   scored, because a payout policy is a style choice rather than a quality
   dimension and grading it would cap every non-payer for no reason.
   ========================================================================== */

import {
  el, esc, isNum, money, num, pct, mult, price, trim, dec, fmtDate, ago,
  yearOf, initials, signClass, mean, clamp,
} from './util.js';
import {
  lineChart, columnChart, forecastChart, rangeChart, fairValueChart,
  gauge, donut, volatilityStrip, gradeBar,
} from './charts.js';
import { snowflake, AXES } from './snowflake.js';
import { FACTOR_META } from './metrics.js';

/* ==========================================================================
   Shared building blocks
   ========================================================================== */

const ICON = {
  pass: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12ZM5.70711 13.7071L9.29289 17.2929C9.68342 17.6834 10.3166 17.6834 10.7071 17.2929L18.2929 9.70711C18.6834 9.31658 18.6834 8.68342 18.2929 8.29289L17.7071 7.70711C17.3166 7.31658 16.6834 7.31658 16.2929 7.70711L10 14L7.70711 11.7071C7.31658 11.3166 6.68342 11.3166 6.29289 11.7071L5.70711 12.2929C5.31658 12.6834 5.31658 13.3166 5.70711 13.7071Z',
  fail: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12ZM12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L6.70711 7.29289C6.31658 7.68342 6.31658 8.31658 6.70711 8.70711L10 12L6.70711 15.2929C6.31658 15.6834 6.31658 16.3166 6.70711 16.7071L7.29289 17.2929C7.68342 17.6834 8.31658 17.6834 8.70711 17.2929L12 14L15.2929 17.2929C15.6834 17.6834 16.3166 17.6834 16.7071 17.2929L17.2929 16.7071C17.6834 16.3166 17.6834 15.6834 17.2929 15.2929L14 12L17.2929 8.70711C17.6834 8.31658 17.6834 7.68342 17.2929 7.29289L16.7071 6.70711C16.3166 6.31658 15.6834 6.31658 15.2929 6.70711L12 10Z',
  na: 'M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12ZM7 11H17C17.5523 11 18 11.4477 18 12V12C18 12.5523 17.5523 13 17 13H7C6.44772 13 6 12.5523 6 12V12C6 11.4477 6.44772 11 7 11Z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
};

function icon(kind, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON[kind] || ICON.info);
  path.setAttribute('fill-rule', 'evenodd');
  svg.append(path);
  return svg;
}

export function card(id, children, cls = '') {
  return el('section', { class: `card sec ${cls}`.trim(), id }, children);
}

function blockEl(title, desc, body, aside) {
  return el('div', { class: 'block' }, [
    el('div', { class: 'block__head' }, [
      el('div', {}, [
        el('h3', { class: 'block__title', text: title }),
        desc ? el('p', { class: 'block__desc', text: desc }) : null,
      ]),
      aside || null,
    ]),
    el('div', { class: 'block__body' }, body),
  ]);
}

function notice(text, kind = '') {
  return el('div', { class: `notice ${kind}`.trim() }, [icon('info'), el('div', { html: text })]);
}

function keyInfo(items) {
  return el('div', { class: 'keyinfo' }, items.filter(Boolean).map(([k, v]) =>
    el('div', { class: 'keyinfo__cell' }, [
      el('div', { class: 'keyinfo__v', text: v }),
      el('div', { class: 'keyinfo__k', text: k }),
    ])));
}

function cmpBars(rows, { fmt = (v) => mult(v) } = {}) {
  const vals = rows.map((r) => r.value).filter(isNum);
  const max = vals.length ? Math.max(...vals) : 1;
  return el('div', { class: 'cmp' }, rows.map((r) => {
    const w = isNum(r.value) && max > 0 ? clamp((r.value / max) * 100, 1.5, 100) : 0;
    return el('div', { class: `cmp__row ${r.self ? 'is-self' : ''}`.trim() }, [
      el('div', { class: 'cmp__label', title: r.label, text: r.label }),
      el('div', { class: 'cmp__track' }, [
        el('div', { class: `cmp__fill ${r.self ? 'is-self' : ''} ${r.tone ? 'is-' + r.tone : ''}`.trim(),
          style: { width: `${w}%` } }),
      ]),
      el('div', { class: 'cmp__val', text: isNum(r.value) ? fmt(r.value) : 'n/a' }),
    ]);
  }));
}

function table(headers, rows) {
  return el('div', { class: 'tbl-wrap' }, [
    el('table', { class: 'tbl' }, [
      el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { class: h.num ? 'num' : '', text: h.label ?? h })))]),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) =>
        el('td', { class: headers[i]?.num ? 'num' : '' }, [c instanceof Node ? c : String(c ?? 'n/a')]))))),
    ]),
  ]);
}

function feedGate(a, feed, what) {
  const s = a.ds.status(feed);
  if (s === 'ok') return null;
  if (s === 'gated') {
    return notice(`<b>${esc(what)}</b> is not included in your current FMP plan.`);
  }
  if (s === 'skipped') {
    return notice(`<b>${esc(what)}</b> needs a live FMP connection. Add your API key in <code>Settings</code>.`);
  }
  return notice(`<b>${esc(what)}</b> could not be loaded — ${esc(a.ds.message(feed) || 'unknown error')}.`, 'notice--error');
}

/** Pass/fail evidence rows for the two unscored sections. */
function checkList(checks) {
  return el('ul', { class: 'checks' }, checks.map((c) => el('li', { class: 'check' }, [
    icon(c.state, `check__icon ${c.state}`),
    el('div', {}, [
      el('p', { class: 'check__label', text: c.label }),
      c.note ? el('p', { class: 'check__note', text: c.note }) : null,
    ]),
  ])));
}

const st = (b) => (b === null || b === undefined ? 'na' : b ? 'pass' : 'fail');

export function curSymbol(code) {
  return ({ USD: 'US$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'AU$', CHF: 'CHF ', INR: '₹' })[code] || `${code} `;
}

/* ==========================================================================
   Overview
   ========================================================================== */

export function renderOverview(a) {
  const f = a.facts;

  const desc = el('p', { class: 't-xs soft', style: { marginTop: '8px', lineHeight: '1.7' } },
    [f.description ? f.description.slice(0, 420) + (f.description.length > 420 ? '…' : '') : 'No description available.']);
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
      el('p', { text: [f.industry, f.sector].filter(Boolean).join(' · ') || f.name }),
    ]),
    desc,
    f.description && f.description.length > 420 ? more : null,

    el('div', { class: 'block' }, [
      el('div', { class: 'block__head' }, [
        el('div', {}, [el('h3', { class: 'block__title', text: 'What stands out' })]),
      ]),
      el('div', { class: 'block__body' }, [
        el('div', { class: 'rrgrid' }, [
          rrList('Strengths', a.rewards, 'reward'),
          rrList('Weaknesses', a.risks, 'risk'),
        ]),
      ]),
    ]),
  ]);
}

function rrList(title, items, kind) {
  return el('div', { class: `rr rr--${kind}` }, [
    el('h3', { text: title }),
    items.length
      ? el('ul', {}, items.map((t) => el('li', {}, [el('span', { text: t })])))
      : el('p', { class: 'rr__empty', text: kind === 'reward'
          ? 'Nothing grades meaningfully above its cohort.'
          : 'Nothing grades meaningfully below its cohort.' }),
  ]);
}

/* ==========================================================================
   Price history & momentum context
   ========================================================================== */

const RANGES = [
  { key: '1M', days: 30 }, { key: '3M', days: 92 }, { key: '6M', days: 183 },
  { key: '1Y', days: 365 }, { key: '3Y', days: 1095 }, { key: '5Y', days: 1825 },
  { key: 'Max', days: Infinity },
];

export function renderPriceHistory(a, ctx) {
  const f = a.facts;
  const prices = a.momentum.self;

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
  draw();

  const m = a.momentum;
  const benchNote = m.benchmarkLoaded
    ? `Relative figures are excess return over the ${f.sector || 'sector'} benchmark.`
    : 'No sector benchmark loaded, so relative figures fall back to absolute return.';

  return card('price-history', [
    el('div', { class: 'card__head' }, [el('h2', { text: 'Price History' })]),

    blockEl('Share price', prices.length ? `Closing prices since ${fmtDate(prices[0].date)}.` : '', [chartHost], sel),

    blockEl('Relative performance', benchNote, [
      keyInfo([
        ['12-1 month vs sector', pct(m.rel12m1, { sign: true })],
        ['6 month vs sector', pct(m.rel6m, { sign: true })],
        ['3 month vs sector', pct(m.rel3m, { sign: true })],
        ['1 month vs sector', pct(m.rel1m, { sign: true })],
        ['vs 50-day average', pct(m.vs50d, { sign: true })],
        ['vs 200-day average', pct(m.vs200d, { sign: true })],
      ]),
    ]),

    blockEl('Price Volatility', 'Weekly price movement over the past year.', [
      volatilityStrip({
        stock: weeklyVolatility(prices),
        market: weeklyVolatility(m.bench),
        industry: null,
      }),
    ]),

    renderNews(a),
  ]);
}

function weeklyVolatility(pts) {
  if (!pts || pts.length < 60) return null;
  const year = pts.slice(-260);
  const weekly = [];
  for (let i = 5; i < year.length; i += 5) {
    const a = year[i - 5].price, b = year[i].price;
    if (a > 0) weekly.push(b / a - 1);
  }
  if (weekly.length < 8) return null;
  const mu = mean(weekly);
  return Math.sqrt(mean(weekly.map((r) => (r - mu) ** 2)));
}

function renderNews(a) {
  const news = a.ds.get('news');
  if (!Array.isArray(news) || !news.length) {
    return blockEl('Recent News', '', [feedGate(a, 'news', 'Recent news') || notice('No recent headlines.')]);
  }
  return blockEl('Recent News', 'Company headlines from the last few weeks.', [
    el('div', { class: 'people' }, news.slice(0, 6).map((n) => el('article', { class: 'person', style: { alignItems: 'flex-start' } }, [
      el('div', { class: 'person__av', text: (n.publisher || n.site || '?').slice(0, 2).toUpperCase() }),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: 'person__t', text: `${n.publisher || n.site || 'News'} · ${fmtDate(n.publishedDate || n.date)}` }),
        el('a', { class: 'person__n', href: n.url || '#', target: '_blank', rel: 'noopener noreferrer',
          text: n.title || 'Untitled' }),
      ]),
    ]))),
  ]);
}

/* ==========================================================================
   About + fundamentals
   ========================================================================== */

export function renderAbout(a) {
  const f = a.facts;
  const gross = isNum(f.grossMargin) && isNum(f.revenue) ? f.revenue * f.grossMargin : null;

  return card('about', [
    el('div', { class: 'card__head' }, [el('h2', { text: 'About the Company' })]),

    keyInfo([
      ['Listed since', f.ipoDate ? String(yearOf(f.ipoDate)) : 'n/a'],
      ['Employees', isNum(f.employees) ? f.employees.toLocaleString('en-US') : 'n/a'],
      ['CEO', f.ceo || 'n/a'],
      ['Website', f.website ? f.website.replace(/^https?:\/\//, '') : 'n/a'],
    ]),

    blockEl('Fundamentals', 'Trailing twelve months.', [
      keyInfo([
        ['Market cap', money(f.marketCap)],
        ['Revenue', money(f.revenue)],
        ['Earnings', money(f.netIncome)],
        ['Free cash flow', money(f.fcf)],
        ['EPS', dec(f.eps, 2)],
        ['P/E ratio', mult(f.pe, 1)],
        ['Gross margin', pct(f.grossMargin, { dp: 2 })],
        ['Net margin', pct(f.netMargin, { dp: 2 })],
        ['Return on invested capital', pct(f.roic, { dp: 2 })],
        ['Debt / equity', pct(f.debtToEquity)],
        ['Last reported', lastEarnings(a) ?? (f.lastReported ? fmtDate(f.lastReported) : 'n/a')],
        ['Next earnings', nextEarnings(a) ?? 'n/a'],
      ]),
      gross ? el('div', { class: 'mt3' }, [
        el('h4', { class: 'block__title', text: 'Where the revenue goes' }),
        el('div', { class: 'mt2' }, [
          cmpBars([
            { label: 'Revenue', value: f.revenue, self: true },
            { label: 'Cost of revenue', value: f.revenue - gross },
            { label: 'Gross profit', value: gross, tone: 'good' },
            { label: 'Operating profit', value: isNum(f.operatingMargin) ? f.revenue * f.operatingMargin : null },
            { label: 'Earnings', value: f.netIncome, tone: 'good' },
            { label: 'Free cash flow', value: f.fcf, tone: 'good' },
          ], { fmt: (v) => money(v) }),
        ]),
      ]) : null,
    ]),

    blockEl('Fair value', 'A levered discounted cash flow estimate, shown against the market price.', [
      isNum(a.fairValue)
        ? fairValueChart({ current: f.price, fair: a.fairValue, currency: curSymbol(f.currency) })
        : (feedGate(a, 'dcfLevered', 'Discounted cash flow') || notice('No fair value estimate available.')),
    ]),

    renderForecastBlock(a),
  ]);
}

function splitEarnings(a) {
  const rows = (a.ds.get('earnings') || []).filter((r) => r && r.date);
  const now = Date.now();
  const past = rows.filter((r) => new Date(r.date).getTime() <= now).sort((x, y) => new Date(y.date) - new Date(x.date));
  const future = rows.filter((r) => new Date(r.date).getTime() > now).sort((x, y) => new Date(x.date) - new Date(y.date));
  return { last: past[0] || null, next: future[0] || null };
}
const lastEarnings = (a) => { const d = splitEarnings(a).last; return d ? fmtDate(d.date) : null; };
const nextEarnings = (a) => { const d = splitEarnings(a).next; return d ? fmtDate(d.date) : null; };

function renderForecastBlock(a) {
  const fc = a.forecast;
  if (!fc.available || !fc.rows.length) {
    return blockEl('Analyst forecast', '', [feedGate(a, 'estimates', 'Analyst forecasts') || notice('No consensus available.')]);
  }
  const hist = a.history.available ? a.history.income.slice(-4) : [];
  const histLabels = hist.map((r) => String(yearOf(r.date)));
  const fcRows = fc.rows.filter((r) => r.year >= (fc.base?.year ?? 0));
  const labels = [...histLabels, ...fcRows.map((r) => String(r.year))];
  const pad = (vals) => [...Array(histLabels.length).fill(null), ...vals];

  return blockEl('Analyst forecast',
    'Reported results left of the divider, consensus right. The band is the analyst high-to-low range.', [
    forecastChart(labels, [
      { name: 'Revenue', color: 'var(--chart-01)',
        values: [...hist.map((r) => r.revenue), ...fcRows.map((r) => r.revenue)],
        low: pad(fcRows.map((r) => r.revenueLow)), high: pad(fcRows.map((r) => r.revenueHigh)) },
      { name: 'Earnings', color: 'var(--chart-02)',
        values: [...hist.map((r) => r.netIncome), ...fcRows.map((r) => r.netIncome)],
        low: pad(fcRows.map((r) => r.netIncomeLow)), high: pad(fcRows.map((r) => r.netIncomeHigh)) },
    ], { splitAt: Math.max(histLabels.length - 1, 0), valueFmt: (v) => money(v) }),
    table([{ label: 'Year' }, { label: 'Revenue', num: true }, { label: 'Earnings', num: true },
           { label: 'EPS', num: true }, { label: 'Analysts', num: true }],
      fcRows.map((r) => [String(r.year), money(r.revenue), money(r.netIncome),
        isNum(r.eps) ? dec(r.eps, 2) : 'n/a', String(r.analystsEps ?? r.analystsRevenue ?? 'n/a')])),
  ]);
}

/* ==========================================================================
   History — the trends the factor grades lean on
   ========================================================================== */

export function renderHistory(a) {
  const f = a.facts, h = a.history;

  const revEarn = h.available
    ? columnChart(h.income.slice(-10).map((r) => String(yearOf(r.date))), [
        { name: 'Revenue', color: 'var(--chart-01)', values: h.income.slice(-10).map((r) => r.revenue) },
        { name: 'Earnings', color: 'var(--chart-02)', values: h.income.slice(-10).map((r) => r.netIncome) },
      ], { valueFmt: (v) => money(v) })
    : (feedGate(a, 'income', 'Statement history') || notice('No annual statements available.'));

  const fcfChart = h.cash.length
    ? columnChart(h.cash.slice(-10).map((r) => String(yearOf(r.date))), [
        { name: 'Free cash flow', color: 'var(--chart-04)', values: h.cash.slice(-10).map((r) => r.freeCashFlow) },
        { name: 'Operating cash flow', color: 'var(--chart-02)', values: h.cash.slice(-10).map((r) => r.operatingCashFlow) },
      ], { valueFmt: (v) => money(v) })
    : null;

  const peChart = h.peSeries.length > 1
    ? el('div', {}, [
        columnChart(h.peSeries.map((r) => String(yearOf(r.date))),
          [{ name: 'Price to earnings', color: 'var(--chart-05)', values: h.peSeries.map((r) => r.pe) }],
          { valueFmt: (v) => mult(v, 0), height: 220, legend: false }),
        el('p', { class: 't-xs soft mt2' }, [
          isNum(h.peMedian) && isNum(f.pe)
            ? `${f.symbol} trades at ${mult(f.pe, 1)} today against a ${h.peSeries.length}-year median of ${mult(h.peMedian, 1)}.`
            : '',
        ]),
      ])
    : (feedGate(a, 'ratiosHist', 'Multiple history') || notice('No multiple history available.'));

  const roeChart = h.roeSeries.length > 1
    ? columnChart(h.roeSeries.map((r) => String(yearOf(r.date))),
        [{ name: 'Return on equity', color: 'var(--chart-05)', values: h.roeSeries.map((r) => r.roe) }],
        { valueFmt: (v) => pct(v, { dp: 0 }), height: 220, legend: false })
    : null;

  const deChart = h.debtSeries.filter((d) => isNum(d.debtToEquity)).length > 1
    ? columnChart(h.debtSeries.map((d) => String(yearOf(d.date))),
        [{ name: 'Debt to equity', color: 'var(--chart-06)', values: h.debtSeries.map((d) => d.debtToEquity) }],
        { valueFmt: (v) => pct(v, { dp: 0 }), height: 220, legend: false })
    : null;

  return card('history', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: 'Ten-Year Record' }),
      el('p', { text: 'The trends behind the Growth, Profitability and Health grades.' }),
    ]),
    blockEl('Revenue and earnings', '', [revEarn]),
    fcfChart ? blockEl('Cash generation', 'Free cash flow against operating cash flow.', [fcfChart]) : null,
    blockEl('Earnings multiple over time', 'What investors have paid for a dollar of earnings.', [peChart]),
    roeChart ? blockEl('Return on equity', '', [roeChart]) : null,
    deChart ? blockEl('Leverage', 'Debt to equity across the last ten fiscal years.', [deChart]) : null,
    blockEl('Balance sheet today', '', [
      keyInfo([
        ['Cash', money(f.cash)],
        ['Debt', money(f.totalDebt)],
        ['Net debt', isNum(f.netDebt) ? (f.netDebt < 0 ? `net cash ${money(Math.abs(f.netDebt))}` : money(f.netDebt)) : 'n/a'],
        ['Equity', money(f.equity)],
        ['Total assets', money(f.totalAssets)],
        ['Total liabilities', money(f.totalLiabilities)],
        ['Current ratio', dec(f.currentRatio, 2)],
        ['Altman Z-score', dec(f.altmanZ, 2)],
        ['Piotroski F-score', isNum(f.piotroski) ? `${f.piotroski}/9` : 'n/a'],
      ]),
    ]),
  ]);
}

/* ==========================================================================
   Dividend — evidence only, not a factor
   ========================================================================== */

export function renderDividend(a) {
  const f = a.facts, d = a.dividends, bm = a.bm;
  const pays = isNum(f.dividendYield) && f.dividendYield > 0;

  const checks = [
    { label: 'Notable dividend', state: st(isNum(f.dividendYield) ? f.dividendYield > bm.dividendNotable : null),
      note: isNum(f.dividendYield)
        ? `Yield of ${pct(f.dividendYield, { dp: 2 })} against a ${pct(bm.dividendNotable)} bar for the bottom quartile of payers.`
        : 'No yield available.' },
    { label: 'High dividend', state: st(isNum(f.dividendYield) ? f.dividendYield > bm.dividendTopTier : null),
      note: isNum(f.dividendYield)
        ? `The top quartile of payers yields above ${pct(bm.dividendTopTier)}.` : 'No yield available.' },
    { label: 'Stable dividend', state: st(d.stable),
      note: d.available && isNum(d.worstDrop)
        ? `Largest annual cut over ${d.years} years was ${pct(d.worstDrop)}.`
        : 'Needs dividend history.' },
    { label: 'Growing dividend', state: st(d.growing),
      note: isNum(d.growth)
        ? `Payments have ${d.growth > 0 ? 'grown' : 'fallen'} ${pct(Math.abs(d.growth))} per year over ${d.years} years.`
        : 'Needs dividend history.' },
    { label: 'Covered by earnings', state: st(pays && isNum(f.payoutRatio) ? f.payoutRatio < bm.payoutCeiling : (pays ? null : false)),
      note: isNum(f.payoutRatio) ? `Payout ratio of ${pct(f.payoutRatio)}.` : `${f.symbol} pays no dividend.` },
    { label: 'Covered by free cash flow', state: st(pays && isNum(f.cashPayoutRatio) ? f.cashPayoutRatio < bm.payoutCeiling : (pays ? null : false)),
      note: isNum(f.cashPayoutRatio) ? `Cash payout ratio of ${pct(f.cashPayoutRatio)}.` : `${f.symbol} pays no dividend.` },
  ];

  const history = d.available && d.byYear.length > 1
    ? columnChart(d.byYear.map((r) => String(r.year)),
        [{ name: 'Dividend per share', color: 'var(--brand-01)', values: d.byYear.map((r) => r.amount) }],
        { valueFmt: (v) => dec(v, 2), height: 220, legend: false })
    : (feedGate(a, 'dividends', 'Dividend history') || notice('No dividend history available.'));

  return card('dividend', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: 'Dividend' }),
      el('p', { text: pays
        ? `${f.name} yields ${pct(f.dividendYield, { dp: 2 })}. Shown as evidence, not graded — a payout policy is a style choice rather than a measure of quality.`
        : `${f.name} does not pay a dividend. Shown as evidence, not graded.` }),
    ]),
    keyInfo([
      ['Yield', pct(f.dividendYield, { dp: 2 })],
      ['Per share', isNum(f.dividendPerShare) ? price(f.dividendPerShare, curSymbol(f.currency)) : 'n/a'],
      ['Payout ratio', pct(f.payoutRatio, { dp: 0 })],
      ['Cash payout ratio', pct(f.cashPayoutRatio, { dp: 0 })],
      ['Growth p.a.', pct(d.growth, { dp: 1 })],
      ['Years of history', d.years ? String(d.years) : 'n/a'],
    ]),
    blockEl('Payment record', 'Dividends per calendar year; the current partial year is excluded.', [history]),
    blockEl('Checks', '', [checkList(checks)]),
  ]);
}

/* ==========================================================================
   Management — evidence only, not a factor
   ========================================================================== */

export function renderManagement(a) {
  const f = a.facts, x = a.execs, bm = a.bm;

  const compVsMarket = (isNum(x.ceoTotal) && x.capBand) ? x.ceoTotal <= x.capBand.typical * 1.25 : null;
  const compVsEarnings = (isNum(x.payChange) && isNum(x.earningsChange))
    ? x.payChange <= x.earningsChange + 0.05
    : (isNum(x.payChange) ? x.payChange <= 0.10 : null);

  const checks = [
    { label: 'Compensation vs market', state: st(compVsMarket),
      note: (isNum(x.ceoTotal) && x.capBand)
        ? `${x.ceo?.name || 'The CEO'} received ${money(x.ceoTotal)} against a ${x.capBand.label} benchmark of about ${money(x.capBand.typical)}.`
        : 'CEO compensation is not reported.' },
    { label: 'Compensation vs earnings', state: st(compVsEarnings),
      note: isNum(x.payChange)
        ? (isNum(x.earningsChange)
            ? `Pay moved ${pct(x.payChange, { sign: true })} against an earnings change of ${pct(x.earningsChange, { sign: true })}.`
            : `Pay moved ${pct(x.payChange, { sign: true })}; no earnings history to compare against.`)
        : 'Not enough compensation history.' },
    { label: 'Experienced management', state: st(isNum(x.managementTenure) ? x.managementTenure >= bm.managementTenureBar : null),
      note: isNum(x.managementTenure) ? `Average tenure ${dec(x.managementTenure, 1)} years.` : 'Tenure not reported.' },
    { label: 'Experienced board', state: st(isNum(x.boardTenure) ? x.boardTenure >= bm.boardTenureBar : null),
      note: isNum(x.boardTenure) ? `Average tenure ${dec(x.boardTenure, 1)} years.` : 'Tenure not reported.' },
  ];

  const peopleList = (list, empty) => list.length
    ? el('div', { class: 'people' }, list.map((p) => el('div', { class: 'person' }, [
        el('div', { class: 'person__av', text: initials(p.name) }),
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'person__n', text: p.name }),
          el('div', { class: 'person__t', text: p.title || '' }),
        ]),
        el('div', { class: 'person__pay', text: isNum(p.pay) ? money(p.pay) : '—' }),
      ])))
    : (feedGate(a, 'executives', 'Leadership data') || notice(empty));

  const compChart = x.compHistory.length > 1
    ? columnChart(x.compHistory.map((c) => String(c.year)), [
        { name: 'Salary', color: 'var(--chart-01)', values: x.compHistory.map((c) => c.salary ?? null) },
        { name: 'Stock & incentives', color: 'var(--chart-04)', values: x.compHistory.map((c) => (c.total ?? 0) - (c.salary ?? 0)) },
      ], { stacked: true, valueFmt: (v) => money(v), height: 220 })
    : (feedGate(a, 'execComp', 'Executive compensation') || notice('No compensation history.'));

  return card('management', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: 'Management' }),
      el('p', { text: 'Shown as evidence, not graded — governance is a qualitative judgement the grades deliberately stay out of.' }),
    ]),
    keyInfo([
      ['Chief executive', x.ceo?.name || f.ceo || 'n/a'],
      ['Total compensation', isNum(x.ceoTotal) ? money(x.ceoTotal) : 'n/a'],
      ['CEO tenure', isNum(x.ceoTenure) ? `${dec(x.ceoTenure, 1)} yrs` : 'n/a'],
      ['Management tenure', isNum(x.managementTenure) ? `${dec(x.managementTenure, 1)} yrs` : 'n/a'],
      ['Board tenure', isNum(x.boardTenure) ? `${dec(x.boardTenure, 1)} yrs` : 'n/a'],
    ]),
    blockEl('Checks', '', [checkList(checks)]),
    blockEl('CEO compensation', 'How the package splits and how it has moved.', [compChart]),
    blockEl('Leadership team', '', [peopleList(x.mgmt, 'No executive list available.')]),
    blockEl('Board', '', [peopleList(x.board, 'No board list available.')]),
  ]);
}

/* ==========================================================================
   Ownership
   ========================================================================== */

export function renderOwnership(a) {
  const f = a.facts;
  const trades = a.ds.get('insiderTrades');
  const stats = a.ds.get('insiderStats');
  const inst = a.ds.get('institutional');
  const float = a.ds.get('sharesFloat');

  const insiderTable = Array.isArray(trades) && trades.length
    ? table([{ label: 'Date' }, { label: 'Insider' }, { label: 'Role' }, { label: 'Type' },
             { label: 'Shares', num: true }, { label: 'Value', num: true }],
        trades.slice(0, 10).map((t) => {
          const acquired = (t.acquisitionOrDisposition || '').toUpperCase() === 'A';
          return [
            fmtDate(t.transactionDate || t.filingDate),
            t.reportingName || 'n/a',
            (t.typeOfOwner || '—').replace(/^officer:\s*/i, ''),
            el('span', { class: `pill ${acquired ? 'pill--good' : 'pill--bad'}`,
              text: (t.transactionType || (acquired ? 'Acquired' : 'Disposed')).replace(/^[A-Z]-/, '') }),
            isNum(t.securitiesTransacted) ? t.securitiesTransacted.toLocaleString('en-US') : 'n/a',
            isNum(t.price) && t.price > 0 && isNum(t.securitiesTransacted) ? money(t.price * t.securitiesTransacted) : '—',
          ];
        }))
    : (feedGate(a, 'insiderTrades', 'Insider transactions') || notice('No insider transactions reported.'));

  const ownershipDonut = (() => {
    const freeFloat = float?.floatShares;
    const outstanding = float?.outstandingShares ?? f.shares;
    if (!isNum(freeFloat) || !isNum(outstanding) || outstanding <= 0) {
      return feedGate(a, 'sharesFloat', 'Ownership breakdown') || notice('No float breakdown available.');
    }
    return donut([
      { name: 'Free float', value: freeFloat, color: 'var(--chart-01)', display: num(freeFloat, 1) },
      { name: 'Closely held', value: Math.max(outstanding - freeFloat, 0), color: 'var(--brand-01)',
        display: num(Math.max(outstanding - freeFloat, 0), 1) },
    ], { centerValue: num(outstanding, 1), centerLabel: 'shares out' });
  })();

  const holders = Array.isArray(inst) && inst.length
    ? table([{ label: 'Holder' }, { label: 'Shares', num: true }, { label: 'Value', num: true }, { label: 'Change', num: true }],
        inst.slice(0, 10).map((h) => [
          h.investorName || h.holder || 'n/a',
          isNum(h.sharesNumber) ? h.sharesNumber.toLocaleString('en-US') : 'n/a',
          money(h.marketValue),
          el('span', { class: signClass(h.changeInSharesNumberPercentage),
            text: pct(h.changeInSharesNumberPercentage, { already: true, sign: true }) }),
        ]))
    : (feedGate(a, 'institutional', 'Top shareholders') || notice('No institutional holdings reported.'));

  return card('ownership', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: 'Ownership' }),
      el('p', { text: 'Who holds the stock, and what insiders have been doing.' }),
    ]),
    insiderSummary(a, stats),
    blockEl('Recent insider transactions', 'Form 4 filings, most recent first.', [insiderTable]),
    blockEl('Ownership breakdown', '', [ownershipDonut]),
    blockEl('Top shareholders', '', [holders]),
  ]);
}

function insiderSummary(a, stats) {
  const rows = Array.isArray(stats) ? stats : (stats ? [stats] : []);
  if (!rows.length) return feedGate(a, 'insiderStats', 'Insider trading summary');

  const recent = rows.slice().sort((x, y) => (y.year - x.year) || (y.quarter - x.quarter)).slice(0, 4);
  const acquired = recent.reduce((t, r) => t + (r.totalAcquired || 0), 0);
  const disposed = recent.reduce((t, r) => t + (r.totalDisposed || 0), 0);
  const net = acquired - disposed;

  return blockEl('Insider activity', 'Shares acquired against disposed over the last four reported quarters.', [
    keyInfo([
      ['Acquired', acquired.toLocaleString('en-US')],
      ['Disposed', disposed.toLocaleString('en-US')],
      ['Net', `${net >= 0 ? '+' : ''}${net.toLocaleString('en-US')}`],
      ['Ratio', disposed > 0 ? dec(acquired / disposed, 2) : 'n/a'],
    ]),
    el('p', { class: 't-xs soft mt2', text: net >= 0
      ? `Insiders have been net acquirers of ${a.facts.symbol} stock.`
      : 'Insiders sold more than they acquired. Much of that is usually vesting and tax-related rather than a view on the business.' }),
  ]);
}

/* ==========================================================================
   Company information & data status
   ========================================================================== */

export function renderCompanyInfo(a) {
  const f = a.facts;
  const emp = a.ds.get('employees');

  const empChart = Array.isArray(emp) && emp.length > 1
    ? columnChart(emp.slice().reverse().map((e) => String(yearOf(e.periodOfReport || e.filingDate))),
        [{ name: 'Employees', color: 'var(--chart-02)', values: emp.slice().reverse().map((e) => e.employeeCount) }],
        { valueFmt: (v) => num(v, 0), height: 200, legend: false })
    : (feedGate(a, 'employees', 'Employee history') || notice('No employee history available.'));

  return card('company-info', [
    el('div', { class: 'card__head' }, [el('h2', { text: 'Company Information' })]),
    keyInfo([
      ['Name', f.name],
      ['Ticker', `${f.exchange}:${f.symbol}`],
      ['Exchange', f.exchangeFull || f.exchange || 'n/a'],
      ['Sector', f.sector || 'n/a'],
      ['Industry', f.industry || 'n/a'],
      ['ISIN', f.isin || 'n/a'],
      ['CIK', f.cik || 'n/a'],
      ['Currency', f.currency],
    ]),
    blockEl('Headcount', '', [empChart]),
    blockEl('Location', '', [
      el('p', { class: 't-sm soft', text: f.address || 'n/a' }),
      f.website ? el('a', { class: 'btn mt2', href: f.website, target: '_blank', rel: 'noopener noreferrer',
        text: f.website.replace(/^https?:\/\//, '') }) : null,
    ]),
  ]);
}

export function renderDataStatus(a) {
  const rows = Object.entries(a.ds.feeds).map(([name, r]) => [
    name,
    el('span', { class: `pill ${r.status === 'ok' ? 'pill--good' : r.status === 'gated' ? 'pill--neutral'
      : r.status === 'error' ? 'pill--bad' : 'pill--muted'}`,
      text: r.fromSnapshot ? 'snapshot' : r.status }),
    r.message || (r.fromSnapshot ? 'From the bundled snapshot' : ''),
  ]);

  const gated = a.ds.gatedFeeds();

  return card('data-status', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: 'Model & Data' }),
      el('p', { text: `Generated ${fmtDate(a.ds.asOf, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · source: ${a.ds.source}` }),
    ]),

    gated.length ? notice(`<b>${gated.length} feed${gated.length > 1 ? 's are' : ' is'} outside your plan:</b> `
      + `<code>${gated.map(esc).join('</code> <code>')}</code>. Metrics that depend on them drop out of the `
      + 'weighted average rather than scoring zero.') : null,

    blockEl('How each factor scored', '', [
      table([{ label: 'Factor' }, { label: 'Grade', num: true }, { label: 'Weight', num: true },
             { label: 'Metrics graded', num: true }],
        FACTOR_META.map((m) => {
          const f = a.factors[m.key];
          return [f.label, isNum(f.grade) ? dec(f.grade, 2) : '—',
            pct(a.weights[m.key], { dp: 0 }), `${f.graded} of ${f.total}`];
        })),
    ]),

    blockEl('Data sources', 'Everything comes from Financial Modeling Prep. Ratios are trailing twelve month unless stated.', [
      table([{ label: 'Feed' }, { label: 'Status' }, { label: 'Detail' }], rows),
    ]),
  ]);
}
