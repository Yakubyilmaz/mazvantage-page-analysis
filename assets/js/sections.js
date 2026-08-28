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
  gauge, donut, volatilityStrip,
} from './charts.js';
import { snowflake, AXES } from './snowflake.js';
import { FACTOR_META } from './model.js';

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

/** The 0-6 score header plus its check list. */
function scorePanel(title, checks, max) {
  const passed = checks.filter((c) => c.state === 'pass').length;
  const na = checks.filter((c) => c.state === 'na').length;

  const bar = el('div', { class: 'scorebar' },
    Array.from({ length: max }, (_, i) => el('i', { class: i < passed ? 'on' : '' })));

  return el('div', { class: 'scorepanel' }, [
    el('div', { class: 'scorepanel__head' }, [
      el('p', {}, [`${title} Score `, el('b', { text: `${passed}/${max}` })]),
      bar,
      na ? el('span', { class: 'pill pill--muted', text: `${na} not assessed` }) : null,
    ]),
    el('ul', { class: 'checks' }, checks.map(checkRow)),
  ]);
}

function checkRow(c) {
  return el('li', { class: 'check', 'data-check': c.id }, [
    icon(c.state, `check__icon ${c.state}`),
    el('div', {}, [
      el('p', { class: 'check__label', text: c.label }),
      c.note ? el('p', { class: 'check__note', text: c.note }) : null,
      c.state === 'na' && c.why ? el('p', { class: 'check__note subtle', text: c.why }) : null,
    ]),
  ]);
}

function keyInfo(items) {
  return el('div', { class: 'keyinfo' }, items
    .filter(Boolean)
    .map(([k, v]) => el('div', { class: 'keyinfo__cell' }, [
      el('div', { class: 'keyinfo__v', text: v }),
      el('div', { class: 'keyinfo__k', text: k }),
    ])));
}

/** Horizontal comparison bars sharing one scale. */
function cmpBars(rows, { fmt = (v) => mult(v) } = {}) {
  const vals = rows.map((r) => r.value).filter(isNum);
  const max = vals.length ? Math.max(...vals) : 1;
  return el('div', { class: 'cmp' }, rows.map((r) => {
    const w = isNum(r.value) && max > 0 ? clamp((r.value / max) * 100, 1.5, 100) : 0;
    return el('div', { class: `cmp__row ${r.self ? 'is-self' : ''}`.trim() }, [
      el('div', { class: 'cmp__label', title: r.label, text: r.label }),
      el('div', { class: 'cmp__track' }, [
        el('div', {
          class: `cmp__fill ${r.self ? 'is-self' : ''} ${r.tone ? 'is-' + r.tone : ''}`.trim(),
          style: { width: `${w}%` },
        }),
      ]),
      el('div', { class: 'cmp__val', text: isNum(r.value) ? fmt(r.value) : 'n/a' }),
    ]);
  }));
}

function table(headers, rows) {
  return el('div', { class: 'tbl-wrap' }, [
    el('table', { class: 'tbl' }, [
      el('thead', {}, [el('tr', {}, headers.map((h) =>
        el('th', { class: h.num ? 'num' : '', text: h.label ?? h })))]),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c, i) =>
        el('td', { class: headers[i]?.num ? 'num' : '' }, [c instanceof Node ? c : String(c ?? 'n/a')]))))),
    ]),
  ]);
}

/** Renders the gated/unavailable message for a feed, or null when it is fine. */
function feedGate(a, feed, what) {
  const s = a.ds.status(feed);
  if (s === 'ok') return null;
  if (s === 'gated') {
    return notice(`<b>${esc(what)}</b> is not included in your current FMP plan. `
      + `The rest of the report is unaffected — upgrade the plan behind your API key to fill this in.`);
  }
  if (s === 'skipped') {
    return notice(`<b>${esc(what)}</b> needs a live FMP connection. Add your API key in <code>Settings</code> to load it.`);
  }
  return notice(`<b>${esc(what)}</b> could not be loaded — ${esc(a.ds.message(feed) || 'unknown error')}.`, 'notice--error');
}

/* ==========================================================================
   1. Overview
   ========================================================================== */

export function renderOverview(a) {
  const f = a.facts;
  const flakeScores = Object.fromEntries(AXES.map((x) => [x.key, a.scores[x.key].passed]));

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
      el('div', {
        class: 'block__body',
        style: { display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' },
      }, [
        snowflake(flakeScores, { size: 230 }),
        el('div', { style: { flex: '1', minWidth: '260px' } }, [
          el('div', { class: 'rrgrid' }, [
            rrList('Rewards', a.rewards, 'reward'),
            rrList('Risk Analysis', a.risks, 'risk'),
          ]),
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
  const marketR = computeReturns(normalisePrices(bench.market));
  const industryR = computeReturns(normalisePrices(bench.industry));

  const periods = ['7D', '1M', '3M', '1Y', '3Y', '5Y'];
  const retRows = [
    [el('b', { text: f.symbol }), ...periods.map((p) => tone(returns[p]))],
    [el('span', { class: 'soft', text: `${f.sector || 'Industry'}` }), ...periods.map((p) => tone(industryR[p]))],
    [el('span', { class: 'soft', text: 'US Market' }), ...periods.map((p) => tone(marketR[p]))],
  ];

  const sectorName = f.sector ? `${f.sector} sector` : 'industry';
  const vsIndustry = verdictVs(returns['1Y'], industryR['1Y'], f.symbol, sectorName);
  const vsMarket = verdictVs(returns['1Y'], marketR['1Y'], f.symbol, 'US Market');

  const vol = weeklyVolatility(prices);

  return card('price-history', [
    el('div', { class: 'card__head' }, [el('h2', { text: 'Price History & Performance' })]),

    blockEl('Share price', `Closing prices${prices.length ? ` since ${fmtDate(prices[0].date)}` : ''}.`,
      [chartHost], sel),

    blockEl('Shareholder Returns', 'Total price return over each period, against the sector and the wider market.', [
      table([{ label: '' }, ...periods.map((p) => ({ label: p, num: true }))], retRows),
      el('div', { class: 'mt2' }, [
        el('p', { class: 't-xs soft' }, [el('b', { text: 'Return vs Industry: ' }), vsIndustry]),
        el('p', { class: 't-xs soft mt1' }, [el('b', { text: 'Return vs Market: ' }), vsMarket]),
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

function curSymbol(code) {
  return ({ USD: 'US$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'AU$', CHF: 'CHF ', INR: '₹' })[code] || `${code} `;
}

function normalisePrices(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ date: r.date, price: r.price ?? r.close ?? r.adjClose ?? null }))
    .filter((r) => r.date && isNum(r.price))
    .sort((x, y) => new Date(x.date) - new Date(y.date));
}

function computeReturns(pts) {
  const out = {};
  if (!pts.length) return out;
  const last = pts.at(-1);
  const lastT = new Date(last.date).getTime();
  const firstT = new Date(pts[0].date).getTime();
  const spans = { '7D': 7, '1M': 30, '3M': 92, '1Y': 365, '3Y': 1095, '5Y': 1825 };

  for (const [k, days] of Object.entries(spans)) {
    const target = lastT - days * 864e5;
    // nearest observation at or before the target date
    let ref = null;
    for (const p of pts) { if (new Date(p.date).getTime() <= target) ref = p; else break; }
    // A series that starts a few days inside the window would otherwise drop
    // the period entirely. Fall back to the earliest point when it covers at
    // least 90% of the span, which is close enough to quote.
    if (!ref && lastT - firstT >= days * 0.9 * 864e5) ref = pts[0];
    if (ref && ref.price > 0) out[k] = last.price / ref.price - 1;
  }
  return out;
}

function tone(v) {
  return el('span', { class: signClass(v), text: isNum(v) ? pct(v, { sign: true }) : 'n/a' });
}

function verdictVs(stock, bench, sym, what) {
  if (!isNum(stock) || !isNum(bench)) return `Not enough history to compare ${sym} with the ${what}.`;
  const beat = stock > bench;
  return `${sym} ${beat ? 'outperformed' : 'underperformed'} the ${what}, which returned ${pct(bench)} over the past year.`;
}

function weeklyVolatility(pts) {
  if (pts.length < 60) return null;
  const year = pts.slice(-260);
  const weekly = [];
  for (let i = 5; i < year.length; i += 5) {
    const a = year[i - 5].price, b = year[i].price;
    if (a > 0) weekly.push(b / a - 1);
  }
  if (weekly.length < 8) return null;
  const m = mean(weekly);
  const variance = mean(weekly.map((r) => (r - m) ** 2));
  return Math.sqrt(variance);
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
        el('div', { class: 'mt2' }, [
          cmpBars([
            { label: 'Revenue', value: breakdown.rev, self: true },
            { label: 'Cost of revenue', value: breakdown.cor },
            { label: 'Gross profit', value: breakdown.gross, tone: 'good' },
            { label: 'Other expenses', value: breakdown.other },
            { label: 'Earnings', value: breakdown.earnings, tone: 'good' },
          ], { fmt: (v) => money(v) }),
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

export function renderValuation(a) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const pt = a.ds.get('priceTarget');

  const peerRows = [
    ...a.peers.peers.filter((p) => isNum(p.pe)).map((p) => ({ label: `${p.symbol} · ${p.name}`, value: p.pe })),
  ];
  if (isNum(a.peers.peerPe)) peerRows.push({ label: 'Peer average', value: a.peers.peerPe, tone: 'muted' });
  peerRows.push({ label: `${f.symbol}`, value: f.pe, self: true });

  return card('valuation', [
    el('div', { class: 'sec__intro' }, [
      el('h2', { text: 'Valuation' }),
      el('p', { text: `Is ${f.symbol} undervalued compared to its fair value, analyst forecasts and its price relative to the market?` }),
      scorePanel('Valuation', a.checks.value, 6),
    ]),

    blockEl('Share Price vs Fair Value',
      `What is the fair price of ${f.symbol} when looking at its future cash flows? This estimate uses a levered discounted cash flow model.`,
      [
        isNum(a.fairValue)
          ? fairValueChart({ current: f.price, fair: a.fairValue, currency: cur })
          : (feedGate(a, 'dcfLevered', 'Discounted cash flow') || notice('No fair value estimate available.')),
      ]),

    blockEl('Key Valuation Metric',
      `Which multiple is most useful for ${f.symbol}?`,
      [
        keyInfo([
          ['Price to Earnings', mult(f.pe)],
          ['Price to Sales', mult(f.ps)],
          ['Price to Book', mult(f.pb)],
          ['Price to Free Cash Flow', mult(f.pfcf)],
          ['PEG ratio', dec(f.peg, 2)],
        ]),
        el('p', { class: 't-xs soft mt2' },
          [preferredMultipleNote(f)]),
      ]),

    blockEl('Price to Earnings Ratio vs Peers',
      `How does ${f.symbol}'s P/E compare with the companies FMP lists as its closest peers?`,
      [
        peerRows.length > 1
          ? cmpBars(peerRows)
          : (feedGate(a, 'peers', 'Peer comparison') || notice('No peer earnings multiples available.')),
      ]),

    blockEl('Historical Price to Earnings Ratio',
      `How much investors have been willing to pay for a dollar of ${f.symbol}'s earnings over time.`,
      [
        a.history.peSeries.length > 1
          ? el('div', {}, [
              columnChart(
                a.history.peSeries.map((r) => String(yearOf(r.date))),
                [{ name: 'Price to earnings', color: 'var(--chart-05)', values: a.history.peSeries.map((r) => r.pe) }],
                { valueFmt: (v) => mult(v, 0), height: 230, legend: false },
              ),
              el('p', { class: 't-xs soft mt2', text: historicalPeNote(a) }),
            ])
          : (feedGate(a, 'ratiosHist', 'Historical earnings multiples')
              || notice('No annual multiple history available for this company.')),
      ]),

    blockEl('Price to Earnings Ratio vs Industry',
      `How does ${f.symbol}'s P/E compare with the wider ${f.sector || 'market'} industry?`,
      [
        cmpBars([
          { label: `${f.sector || 'Industry'} average`, value: a.industryPe },
          { label: f.symbol, value: f.pe, self: true },
        ]),
        el('p', { class: 't-tiny subtle mt1', text: 'Industry averages are benchmark figures held in Settings — adjust them to match your own universe.' }),
      ]),

    blockEl('Price to Earnings Ratio vs Fair Ratio',
      `What is ${f.symbol}'s P/E compared with the fair ratio implied by its forecast earnings growth, using the revised Graham formula?`,
      [
        isNum(a.fairPe)
          ? cmpBars([
              { label: 'Fair P/E ratio', value: a.fairPe, tone: 'good' },
              { label: `${f.symbol} P/E ratio`, value: f.pe, self: true },
            ])
          : notice('A fair ratio needs a forecast growth rate from the analyst-estimates feed.'),
      ]),

    blockEl('Analyst Price Targets',
      'The 12-month consensus target, and how widely analysts disagree about it.',
      [
        pt && isNum(pt.targetConsensus)
          ? el('div', {}, [
              rangeChart({ low: pt.targetLow, avg: pt.targetConsensus, high: pt.targetHigh, current: f.price, currency: cur }),
              gradesRow(a),
            ])
          : (feedGate(a, 'priceTarget', 'Analyst price targets') || notice('No consensus target available.')),
      ]),
  ]);
}

function historicalPeNote(a) {
  const series = a.history.peSeries;
  const avg = mean(series.map((r) => r.pe));
  const f = a.facts;
  if (!isNum(avg) || !isNum(f.pe)) return '';
  const rel = f.pe / avg - 1;
  return `${f.symbol} currently trades at ${mult(f.pe)}, ${pct(Math.abs(rel))} `
    + `${rel > 0 ? 'above' : 'below'} its ${series.length}-year average of ${mult(avg)}.`;
}

function preferredMultipleNote(f) {
  if (isNum(f.pe) && f.pe > 0) {
    return `${f.symbol} is profitable, so the Price-To-Earnings ratio is used as the preferred multiple throughout this report.`;
  }
  if (isNum(f.ps)) {
    return `${f.symbol} has no positive trailing earnings, so the Price-To-Sales ratio is the more useful comparison.`;
  }
  return 'No preferred multiple could be established for this company.';
}

function gradesRow(a) {
  const g = a.ds.get('grades');
  if (!g) return null;
  const total = (g.strongBuy || 0) + (g.buy || 0) + (g.hold || 0) + (g.sell || 0) + (g.strongSell || 0);
  if (!total) return null;
  return el('div', { class: 'mt3' }, [
    el('h4', { class: 'block__title', text: 'Analyst ratings' }),
    el('div', { class: 'mt2' }, [
      cmpBars([
        { label: 'Strong buy', value: g.strongBuy, tone: 'good' },
        { label: 'Buy', value: g.buy, tone: 'good' },
        { label: 'Hold', value: g.hold },
        { label: 'Sell', value: g.sell, tone: 'bad' },
        { label: 'Strong sell', value: g.strongSell, tone: 'bad' },
      ], { fmt: (v) => `${v}` }),
    ]),
    el('p', { class: 't-xs soft mt2', text: `Consensus across ${total} analysts: ${g.consensus || 'n/a'}.` }),
  ]);
}

/* ==========================================================================
   5. Future growth
   ========================================================================== */

export function renderFuture(a) {
  const f = a.facts, fc = a.forecast;

  let chart = feedGate(a, 'estimates', 'Analyst forecasts') || notice('No consensus forecast available.');
  let epsChart = null;
  let estTable = null;

  if (fc.available && fc.rows.length) {
    const hist = a.history.available ? a.history.income.slice(-4) : [];
    const histLabels = hist.map((r) => String(yearOf(r.date)));
    const fcRows = fc.rows.filter((r) => r.year >= (fc.base?.year ?? 0));
    const labels = [...histLabels, ...fcRows.map((r) => String(r.year))];
    const splitAt = Math.max(histLabels.length - 1, 0);

    const pad = (vals) => [...Array(histLabels.length).fill(null), ...vals];

    chart = forecastChart(labels, [
      {
        name: 'Revenue', color: 'var(--chart-01)',
        values: [...hist.map((r) => r.revenue), ...fcRows.map((r) => r.revenue)],
        low: pad(fcRows.map((r) => r.revenueLow)), high: pad(fcRows.map((r) => r.revenueHigh)),
      },
      {
        name: 'Earnings', color: 'var(--chart-02)',
        values: [...hist.map((r) => r.netIncome), ...fcRows.map((r) => r.netIncome)],
        low: pad(fcRows.map((r) => r.netIncomeLow)), high: pad(fcRows.map((r) => r.netIncomeHigh)),
      },
    ], { splitAt, valueFmt: (v) => money(v) });

    epsChart = columnChart(
      fcRows.map((r) => String(r.year)),
      [{ name: 'Consensus EPS', color: 'var(--brand-01)', values: fcRows.map((r) => r.eps) }],
      { valueFmt: (v) => dec(v, 2), height: 230, legend: false },
    );

    estTable = table(
      [{ label: 'Year' }, { label: 'Revenue', num: true }, { label: 'Earnings', num: true },
       { label: 'EPS', num: true }, { label: 'Analysts', num: true }],
      fcRows.map((r) => [
        String(r.year), money(r.revenue), money(r.netIncome),
        dec(r.eps, 2),
        String(r.analystsEps ?? r.analystsRevenue ?? 'n/a'),
      ]),
    );
  }

  return card('future-growth', [
    el('div', { class: 'sec__intro' }, [
      el('h2', { text: 'Future Growth' }),
      el('p', { text: `Future criteria checks ${a.scores.future.passed}/6` }),
      el('p', { class: 'sec__summary', text: futureSummary(a) }),
      scorePanel('Future', a.checks.future, 6),
    ]),

    blockEl('Key information', 'Consensus expectations over the next three fiscal years.', [
      keyInfo([
        ['Earnings growth rate', pct(fc.earningsGrowth, { dp: 2 })],
        ['EPS growth rate', pct(fc.epsGrowth, { dp: 2 })],
        ['Revenue growth rate', pct(fc.revenueGrowth, { dp: 2 })],
        ['Future return on equity', pct(fc.futureRoe, { dp: 2 })],
        ['Analyst coverage', fc.analystCount ? `${fc.analystCount} analysts` : 'n/a'],
        [`${f.sector || 'Industry'} earnings growth`, pct(a.bm.industryEarningsGrowth[f.sector] ?? a.bm.industryEarningsGrowth._default)],
      ]),
    ]),

    blockEl('Earnings and Revenue Growth Forecasts',
      'Reported results to the left of the divider, consensus forecast to the right. The shaded band is the analyst high-to-low range.',
      [chart]),

    epsChart ? blockEl('Earnings per Share Growth Forecasts',
      'Consensus EPS for each forecast year.', [epsChart]) : null,

    estTable ? blockEl('Analyst Future Growth Forecasts',
      'The consensus numbers behind the chart above.', [estTable]) : null,

    blockEl('Future Return on Equity',
      `Projected by retaining ${isNum(fc.retention) ? pct(fc.retention) : 'an estimated share'} of forecast earnings against today's equity base.`,
      [
        el('div', { class: 'gauge' }, [
          gauge(fc.futureRoe, { min: 0, max: Math.max(0.6, (fc.futureRoe ?? 0) * 1.2), label: `in ${fc.span || 3} years` }),
          el('div', { style: { flex: '1', minWidth: '260px' } }, [
            el('p', { class: 't-xs soft', style: { maxWidth: '420px' } },
              [a.checks.future.find((c) => c.id === 'IsReturnOnEquityForecastAboveBenchmark')?.note || '']),
            fc.retentionIsGross ? el('p', { class: 't-tiny subtle mt1' }, [
              'Retention is estimated from the dividend payout ratio alone, because the cash flow '
              + 'statement is not on this plan. For a company that buys back a lot of stock the real '
              + 'equity base grows more slowly, so this figure understates future ROE.',
            ]) : null,
          ]),
        ]),
      ]),
  ]);
}

function futureSummary(a) {
  const f = a.facts, fc = a.forecast;
  if (!fc.available) return `No consensus forecast is currently available for ${f.symbol}.`;
  const parts = [];
  if (isNum(fc.earningsGrowth) && isNum(fc.revenueGrowth)) {
    parts.push(`${f.name} is forecast to grow earnings and revenue by ${pct(fc.earningsGrowth)} and ${pct(fc.revenueGrowth)} per annum respectively.`);
  }
  if (isNum(fc.epsGrowth)) parts.push(`EPS is expected to grow by ${pct(fc.epsGrowth)} per annum.`);
  if (isNum(fc.futureRoe)) parts.push(`Return on equity is forecast to be ${pct(fc.futureRoe)} in ${fc.span} years.`);
  return parts.join(' ');
}

/* ==========================================================================
   6. Past performance
   ========================================================================== */

export function renderPast(a) {
  const f = a.facts, h = a.history;
  const km = a.ds.get('metricsTtm') || {};

  const revExp = (() => {
    if (!isNum(f.revenue)) return null;
    const rd = isNum(km.researchAndDevelopementToRevenueTTM) ? f.revenue * km.researchAndDevelopementToRevenueTTM : null;
    const ga = isNum(km.salesGeneralAndAdministrativeToRevenueTTM) ? f.revenue * km.salesGeneralAndAdministrativeToRevenueTTM : null;
    const gross = isNum(f.grossMargin) ? f.revenue * f.grossMargin : null;
    const cor = isNum(gross) ? f.revenue - gross : null;
    return cmpBars([
      { label: 'Revenue', value: f.revenue, self: true },
      { label: 'Cost of revenue', value: cor },
      { label: 'Gross profit', value: gross, tone: 'good' },
      { label: 'R&D expense', value: rd },
      { label: 'General & admin', value: ga },
      { label: 'Earnings', value: f.netIncome, tone: 'good' },
    ], { fmt: (v) => money(v) });
  })();

  let historyChart = feedGate(a, 'income', 'Earnings and revenue history')
    || notice('No annual income statements available.');
  let fcfChart = null;
  const roeSeries = h.roeSeries.map((r) => ({ year: String(yearOf(r.date)), roe: r.roe }));

  if (h.available) {
    const rows = h.income.slice(-10);
    const labels = rows.map((r) => String(yearOf(r.date)));
    historyChart = columnChart(labels, [
      { name: 'Revenue', color: 'var(--chart-01)', values: rows.map((r) => r.revenue) },
      { name: 'Earnings', color: 'var(--chart-02)', values: rows.map((r) => r.netIncome) },
    ], { valueFmt: (v) => money(v) });

    const cashRows = h.cash.slice(-10);
    if (cashRows.length) {
      const clabels = cashRows.map((r) => String(yearOf(r.date)));
      const byYear = new Map(rows.map((r) => [yearOf(r.date), r.netIncome]));
      fcfChart = columnChart(clabels, [
        { name: 'Free cash flow', color: 'var(--chart-04)', values: cashRows.map((r) => r.freeCashFlow) },
        { name: 'Earnings', color: 'var(--chart-02)', values: cashRows.map((r) => byYear.get(yearOf(r.date)) ?? null) },
      ], { valueFmt: (v) => money(v) });
    }
  }

  return card('past-performance', [
    el('div', { class: 'sec__intro' }, [
      el('h2', { text: 'Past Earnings Performance' }),
      el('p', { text: `Past criteria checks ${a.scores.past.passed}/6` }),
      el('p', { class: 'sec__summary', text: pastSummary(a) }),
      scorePanel('Past', a.checks.past, 6),
    ]),

    blockEl('Key information', 'Trailing twelve month profitability and its trend.', [
      keyInfo([
        ['Earnings growth rate (5y)', pct(h.growth5y, { dp: 2 })],
        ['Revenue growth rate (5y)', pct(h.revenueGrowth5y, { dp: 2 })],
        ['Return on equity', pct(f.roe, { dp: 2 })],
        ['Return on assets', pct(f.roa, { dp: 2 })],
        ['Net margin', pct(f.netMargin, { dp: 2 })],
        ['Last earnings update', f.lastReported ? fmtDate(f.lastReported) : 'n/a'],
      ]),
    ]),

    revExp ? blockEl('Revenue & Expenses Breakdown',
      'How revenue converts to earnings on a trailing twelve month basis.', [revExp]) : null,

    blockEl('Earnings and Revenue History',
      'Reported revenue and net income for each of the last ten fiscal years.', [historyChart]),

    fcfChart ? blockEl('Free Cash Flow vs Earnings Analysis',
      'Cash generation against reported profit — a persistent gap is worth understanding.', [fcfChart]) : null,

    blockEl('Past Earnings Growth Analysis', 'How the recent year compares with the longer trend.', [
      keyInfo([
        ['Earnings growth (1y)', pct(h.growth1y, { dp: 1 })],
        ['Earnings growth (5y p.a.)', pct(h.growth5y, { dp: 1 })],
        ['Net margin now', pct(h.marginNow, { dp: 2 })],
        ['Net margin last year', pct(h.marginPrev, { dp: 2 })],
      ]),
    ]),

    blockEl('Return on Equity', `${f.symbol}'s profit generated per dollar of shareholder equity.`, [
      el('div', { class: 'gauge' }, [
        gauge(f.roe, { min: 0, max: Math.max(0.5, (f.roe ?? 0) * 1.2), label: 'trailing twelve months' }),
        roeSeries.length > 1
          ? el('div', { style: { flex: '1', minWidth: '280px' } }, [
              columnChart(roeSeries.map((r) => r.year),
                [{ name: 'Return on equity', color: 'var(--chart-05)', values: roeSeries.map((r) => r.roe) }],
                { valueFmt: (v) => pct(v, { dp: 0 }), height: 200, legend: false }),
            ])
          : null,
      ]),
    ]),
  ]);
}

function pastSummary(a) {
  const f = a.facts, h = a.history;
  if (!h.available) {
    return `${f.name} has a return on equity of ${pct(f.roe)} and net margins of ${pct(f.netMargin)}. `
      + 'Growth history needs the annual statement feeds.';
  }
  const ind = a.bm.industryEarningsGrowth[f.sector] ?? a.bm.industryEarningsGrowth._default;
  return `${f.name} has been growing earnings at an average annual rate of ${pct(h.growth5y)}, `
    + `while the ${f.sector || 'market'} industry saw earnings growing at ${pct(ind)} annually. `
    + `Revenues have been growing at an average rate of ${pct(h.revenueGrowth5y)} per year. `
    + `${f.name}'s return on equity is ${pct(f.roe)}, and it has net margins of ${pct(f.netMargin)}.`;
}

/* ==========================================================================
   7. Financial health
   ========================================================================== */

export function renderHealth(a) {
  const f = a.facts, h = a.history;

  const position = el('div', {}, [
    cmpBars([
      { label: 'Short term assets', value: f.currentAssets, tone: 'good' },
      { label: 'Short term liabilities', value: f.currentLiabilities, tone: 'bad' },
      { label: 'Long term liabilities', value: f.longTermLiabilities, tone: 'bad' },
    ], { fmt: (v) => money(v) }),
    el('p', { class: 't-xs soft mt2', text: positionNote(f) }),
  ]);

  const deChart = h.debtSeries.filter((d) => isNum(d.debtToEquity)).length > 1
    ? columnChart(
        h.debtSeries.map((d) => String(yearOf(d.date))),
        [{ name: 'Debt to equity', color: 'var(--chart-06)', values: h.debtSeries.map((d) => d.debtToEquity) }],
        { valueFmt: (v) => pct(v, { dp: 0 }), height: 220, legend: false },
      )
    : (feedGate(a, 'balance', 'Debt to equity history') || notice('Needs annual balance sheets to plot leverage over time.'));

  const bsDonut = (isNum(f.totalAssets) && isNum(f.totalLiabilities))
    ? donut([
        { name: 'Shareholder equity', value: Math.max(f.equity ?? 0, 0), color: 'var(--good)' },
        { name: 'Current liabilities', value: Math.max(f.currentLiabilities ?? 0, 0), color: 'var(--chart-04)' },
        { name: 'Long term liabilities', value: Math.max(f.longTermLiabilities ?? 0, 0), color: 'var(--chart-06)' },
      ], { centerValue: money(f.totalAssets), centerLabel: 'total assets' })
    : notice('Balance sheet composition is unavailable.');

  return card('financial-health', [
    el('div', { class: 'sec__intro' }, [
      el('h2', { text: `${f.name} Balance Sheet Health` }),
      el('p', { text: `Financial Health criteria checks ${a.scores.health.passed}/6` }),
      el('p', { class: 'sec__summary', text: healthSummary(f) }),
      scorePanel('Financial Health', a.checks.health, 6),
    ]),

    blockEl('Key information', 'The balance sheet at the latest reporting date.', [
      keyInfo([
        ['Debt to equity ratio', pct(f.debtToEquity, { dp: 2 })],
        ['Debt', money(f.totalDebt)],
        ['Cash', money(f.cash)],
        ['Net debt', isNum(f.netDebt) ? (f.netDebt < 0 ? `net cash ${money(Math.abs(f.netDebt))}` : money(f.netDebt)) : 'n/a'],
        ['Equity', money(f.equity)],
        ['Total liabilities', money(f.totalLiabilities)],
        ['Total assets', money(f.totalAssets)],
        ['Interest coverage', isNum(f.interestCover) ? `${dec(f.interestCover, 1)}x` : 'n/a'],
        ['Current ratio', dec(f.currentRatio, 2)],
        ['Altman Z-score', dec(f.altmanZ, 2)],
        ['Piotroski F-score', isNum(f.piotroski) ? `${f.piotroski}/9` : 'n/a'],
      ]),
    ]),

    blockEl('Financial Position Analysis',
      'Whether short term assets cover what falls due, near term and long term.', [position]),

    blockEl('Debt to Equity History and Analysis',
      'Leverage across the last ten fiscal years.', [deChart]),

    blockEl('Balance Sheet', 'How the asset base is funded.', [bsDonut]),
  ]);
}

function positionNote(f) {
  if (!isNum(f.currentAssets) || !isNum(f.currentLiabilities)) return 'Not enough balance sheet detail to assess the position.';
  const short = f.currentAssets > f.currentLiabilities;
  const long = isNum(f.longTermLiabilities) ? f.currentAssets > f.longTermLiabilities : null;
  return `Short term assets of ${money(f.currentAssets)} ${short ? 'exceed' : 'fall short of'} short term liabilities of ${money(f.currentLiabilities)}`
    + (long === null ? '.' : `, and ${long ? 'also cover' : 'do not cover'} long term liabilities of ${money(f.longTermLiabilities)}.`);
}

function healthSummary(f) {
  if (!isNum(f.equity) || !isNum(f.totalDebt)) return 'Balance sheet detail is incomplete for this company.';
  return `${f.name} has total shareholder equity of ${money(f.equity)} and total debt of ${money(f.totalDebt)}, `
    + `which brings its debt-to-equity ratio to ${pct(f.debtToEquity)}. `
    + `Its total assets and total liabilities are ${money(f.totalAssets)} and ${money(f.totalLiabilities)} respectively.`;
}

/* ==========================================================================
   8. Dividend
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
      el('p', { text: `Dividend criteria checks ${a.scores.dividend.passed}/6` }),
      el('p', { class: 'sec__summary', text: dividendSummary(f) }),
      scorePanel('Dividend', a.checks.dividend, 6),
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
            [a.checks.dividend.find((c) => c.id === 'IsDividendCovered')?.note || '']),
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
            [a.checks.dividend.find((c) => c.id === 'IsDividendCoveredByFreeCashFlow')?.note || '']),
        ]),
      ]),
  ]);
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
      el('p', { text: `Management criteria checks ${a.scores.management.passed}/4` }),
      scorePanel('Management', a.checks.management, 4),
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

/**
 * FMP returns insider statistics as one row per calendar quarter. Roll the
 * last four together so the summary reads as a trailing-twelve-month picture
 * rather than whatever happened in the most recent, possibly empty, quarter.
 */
function insiderSummary(a, stats) {
  const rows = Array.isArray(stats) ? stats : (stats ? [stats] : []);
  if (!rows.length) return feedGate(a, 'insiderStats', 'Insider trading summary');

  const recent = rows
    .slice()
    .sort((x, y) => (y.year - x.year) || (y.quarter - x.quarter))
    .slice(0, 4);

  const acquired = recent.reduce((t, r) => t + (r.totalAcquired || 0), 0);
  const disposed = recent.reduce((t, r) => t + (r.totalDisposed || 0), 0);
  const net = acquired - disposed;
  const span = recent.length === 4
    ? `${recent.at(-1).year} Q${recent.at(-1).quarter} – ${recent[0].year} Q${recent[0].quarter}`
    : 'the reported period';

  return blockEl('Insider trading summary', `Shares acquired against shares disposed across ${span}.`, [
    keyInfo([
      ['Shares acquired', acquired.toLocaleString('en-US')],
      ['Shares disposed', disposed.toLocaleString('en-US')],
      ['Net', `${net >= 0 ? '+' : ''}${net.toLocaleString('en-US')}`],
      ['Acquired / disposed', disposed > 0 ? dec(acquired / disposed, 2) : 'n/a'],
    ]),
    el('p', { class: 't-xs soft mt2' }, [
      net >= 0
        ? `Insiders have been net acquirers of ${a.facts.symbol} stock over the last four quarters.`
        : `Insiders have disposed of ${Math.abs(net).toLocaleString('en-US')} more shares than they acquired over the last four quarters. `
          + 'Much of that is usually vesting and tax-related selling rather than a view on the business.',
    ]),
  ]);
}

export function renderOwnership(a) {
  const f = a.facts;
  const trades = a.ds.get('insiderTrades');
  const stats = a.ds.get('insiderStats');
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

    insiderSummary(a, stats),

    blockEl('Recent Insider Transactions', 'Form 4 filings, most recent first.', [insiderTable]),
    blockEl('Ownership Breakdown', 'Free float against closely held stock.', [ownershipDonut]),
    blockEl('Top Shareholders', 'Largest reported institutional positions.', [holders]),
  ]);
}

/* ==========================================================================
   11. Company information
   ========================================================================== */

export function renderCompanyInfo(a) {
  const f = a.facts;
  const emp = a.ds.get('employees');

  const empChart = Array.isArray(emp) && emp.length > 1
    ? columnChart(
        emp.slice().reverse().map((e) => String(yearOf(e.periodOfReport || e.filingDate))),
        [{ name: 'Employees', color: 'var(--chart-02)', values: emp.slice().reverse().map((e) => e.employeeCount) }],
        { valueFmt: (v) => num(v, 0), height: 210, legend: false },
      )
    : (feedGate(a, 'employees', 'Employee history') || notice('No employee history available.'));

  return card('company-info', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: `${f.name} Company Information` }),
      el('p', { text: 'Listings, location and headcount.' }),
    ]),

    blockEl('Key Information', '', [
      keyInfo([
        ['Name', f.name],
        ['Ticker', `${f.exchange}:${f.symbol}`],
        ['Exchange', f.exchangeFull || f.exchange || 'n/a'],
        ['Sector', f.sector || 'n/a'],
        ['Industry', f.industry || 'n/a'],
        ['Listed since', f.ipoDate ? fmtDate(f.ipoDate) : 'n/a'],
        ['ISIN', f.isin || 'n/a'],
        ['CIK', f.cik || 'n/a'],
        ['Currency', f.currency],
      ]),
    ]),

    blockEl('Number of Employees', 'Reported headcount over time.', [empChart]),

    blockEl('Location', 'Registered head office.', [
      el('p', { class: 't-sm soft', text: f.address || 'n/a' }),
      f.website ? el('a', {
        class: 'btn mt2', href: f.website, target: '_blank', rel: 'noopener noreferrer',
        text: f.website.replace(/^https?:\/\//, ''),
      }) : null,
    ]),
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
      + 'Checks that depend on them are marked “not assessed” rather than failed, so scores stay honest.') : null,

    blockEl('Data Sources',
      'Every figure in this report comes from Financial Modeling Prep. Ratios are trailing twelve month unless stated.', [
      table([{ label: 'Feed' }, { label: 'Status' }, { label: 'Detail' }], rows),
    ]),

    blockEl('Analysis Model',
      'The 34 checks, their thresholds and the benchmarks they compare against are defined in assets/js/model.js and can be tuned from Settings.', [
      table([{ label: 'Factor' }, { label: 'Checks', num: true }, { label: 'Passed', num: true }, { label: 'Not assessed', num: true }],
        FACTOR_META.map((m) => {
          const s = a.scores[m.key];
          return [m.title, String(s.total), String(s.passed), String(s.total - s.evaluated)];
        })),
    ]),
  ]);
}
