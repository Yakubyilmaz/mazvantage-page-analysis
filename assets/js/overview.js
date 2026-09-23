/* ==========================================================================
   Maz Vantage — the stock page

   The company's front page, rebuilt on the market canvas against
   TradingView's symbol page (https://www.tradingview.com/symbols/NASDAQ-NVDA/)
   as the reference layout.

   ---------------------------------------------------------------------------
   What it borrows, and what it does not
   ---------------------------------------------------------------------------

   From TradingView: the shape. A breadcrumb into the sector, an identity
   block with the logo and the live price beside it, a full-width chart with
   its own ranges, then a run of labelled sections — the peers, the key stats,
   what is due to report, the headcount, the company itself — each one a flat
   four-column grid of label-over-value rather than a card. That grid is the
   whole visual idea: a reader scans labels down a column, not boxes across a
   page.

   Not from TradingView: anything the vendor does not give us. Its symbol page
   carries a pre-market print, an AI "key facts" carousel, a community idea
   stream, a technicals gauge, seasonality and a bond ladder. FMP supplies
   none of those, so none of them are here, and the coverage note at the foot
   says so by name rather than leaving a reader to wonder why a section they
   remember is missing.

   And one thing TradingView has no equivalent for: the five factor grades.
   Its page answers "what is this doing"; the whole point of this product is
   "what is this worth", so the grade block sits directly under the chart
   where TradingView puts its technical gauge.

   ---------------------------------------------------------------------------
   Two entry points
   ---------------------------------------------------------------------------

     renderOverviewHead(a, nav)     breadcrumb, identity, price, grade
     renderOverviewTab(a, ctx, nav) everything below the tab strip

   Both wrap themselves in `.mh-page`, which is what carries the market
   canvas's tokens — this page is the one part of the company report that
   lives on that canvas rather than on `app.css`'s.
   ========================================================================== */

import {
  el, isNum, money, num, pct, mult, price, dec, fmtDate, titleCase,
} from './util.js';
import { marketChart } from './markethub-chart.js';
import { logoUrl, hasApiKey } from './fmp.js';
import { lineChart } from './charts.js';
import { normalisePrices } from './model.js';
import { curSymbol, notice, feedGate } from './ui.js';
import { storyRow, heading, paintQuotes } from './markethub-ui.js';
import { snowflake } from './snowflake.js';

import { FACTOR_KEYS } from './factors.js';
import { MAX_SCORE, letterFor, verdictWord, verdictTone } from './grading.js';
import { gradePill } from './gradeview.js';
import { SHARIAH_STANDARDS, shariahVerdict } from './shariah.js';
import { loadArticles, articlesReady, articlesForTicker } from './articles.js';
import { relatedResearchCard } from './feed.js';

/** Peers compared beside the chart, and stories at the foot. */
const PEERS = 4;
const STORIES = 5;
/** Years of revenue and profit in the financials bars. */
const YEARS = 5;

const DASH = '—';

/* ==========================================================================
   The pieces every section is built from

   One label-over-value block and one section wrapper. TradingView's page is
   almost entirely these two, which is why they live here once rather than
   being spelled out per section.
   ========================================================================== */

/** A label over a value, the unit tucked after it. */
function stat(label, value, { unit = null, tone = null, note = null } = {}) {
  return el('div', { class: 'sp-stat' }, [
    el('span', { class: 'sp-stat__k', text: label }),
    el('span', { class: `sp-stat__v${tone ? ` is-${tone}` : ''}` }, [
      el('b', { text: value ?? DASH }),
      unit ? el('i', { text: unit }) : null,
    ].filter(Boolean)),
    note ? el('span', { class: 'sp-stat__n', text: note }) : null,
  ].filter(Boolean));
}

/** A titled section; `onAll` turns the title into the way into its own tab. */
function section(title, children, onAll = null, blurb = null) {
  const body = [].concat(children).filter(Boolean);
  if (!body.length) return null;
  return el('section', { class: 'sp-block', 'aria-label': title }, [
    heading(title, onAll),
    blurb ? el('p', { class: 'mh-section-description', text: blurb }) : null,
    ...body,
  ].filter(Boolean));
}

/** The four-column grid every stat section is laid out on. */
const grid = (stats) => el('div', { class: 'sp-grid' }, stats.filter(Boolean));

/* ==========================================================================
   The head — above the tab strip
   ========================================================================== */

export function renderOverviewHead(a, nav = {}) {
  const f = a.facts;
  const overall = a.scores?.overall || {};
  const up = isNum(f.change) && f.change > 0;
  const down = isNum(f.change) && f.change < 0;

  const crumb = (text, onClick) => (onClick
    ? el('button', { type: 'button', class: 'sp-crumb', text, onclick: onClick })
    : el('span', { class: 'sp-crumb', text }));

  const logo = el('span', { class: 'sp-head__logo', 'aria-hidden': 'true' },
    [el('span', { text: String(f.symbol || '?').slice(0, 3) })]);
  const image = el('img', { src: f.image || logoUrl(f.symbol), alt: '', loading: 'lazy', decoding: 'async' });
  image.addEventListener('error', () => image.remove(), { once: true });
  logo.append(image);

  return el('div', { class: 'mh-page mh-page--flush sp-head' }, [
    /* Markets / country / Stocks / sector / industry / symbol — the same path
       TradingView prints, over the two fields the profile actually carries. */
    el('nav', { class: 'sp-crumbs', 'aria-label': 'Breadcrumb' }, [
      crumb('Markets', () => nav.goView?.('markets', 'overview')),
      crumb(f.country || 'Stocks', () => nav.goView?.('markets', 'stocks')),
      f.sector ? crumb(f.sector, () => nav.goView?.('sectors')) : null,
      f.industry ? crumb(f.industry) : null,
      crumb(f.symbol),
    ].filter(Boolean)),

    el('div', { class: 'sp-head__row' }, [
      logo,
      el('div', { class: 'sp-head__id' }, [
        el('h1', { class: 'sp-head__name', text: f.name }),
        el('div', { class: 'sp-head__sub' }, [
          el('b', { text: f.symbol }),
          el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
          el('span', { text: f.exchangeFull || f.exchange || 'Listed' }),
          a.execs?.capBand
            ? el('span', { class: 'sp-tag', text: titleCase(a.execs.capBand.label.replace('-', ' ')) })
            : null,
        ].filter(Boolean)),
      ]),

      el('div', { class: 'sp-head__quote' }, [
        el('div', { class: 'sp-head__price' }, [
          el('b', { text: isNum(f.price) ? price(f.price, '') : DASH }),
          el('i', { text: f.currency || 'USD' }),
          isNum(f.change) ? el('span', {
            class: `sp-head__chg ${up ? 'is-up' : down ? 'is-down' : ''}`.trim(),
            text: `${up ? '+' : ''}${dec(f.change, 2)}  ${pct(f.changePct ?? 0, { sign: true })}`,
          }) : null,
        ].filter(Boolean)),
        el('p', { class: 'sp-head__asof', text: f.quoteTime
          ? `Last trade ${fmtDate(f.quoteTime, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
          : 'Delayed quote from FMP' }),
      ]),

      /* Where TradingView puts a "technicals" dial, this page puts the thing
         it exists to say: the grade, and the word for it. */
      el('button', {
        type: 'button', class: 'sp-head__score',
        'aria-label': 'Open the Analysis tab', onclick: () => nav.openAnalysis?.(),
      }, [
        el('span', { class: 'sp-head__scorek', text: 'Maz score' }),
        gradePill(overall.score, letterFor(overall.score), { size: 'lg' }),
        el('span', { class: `sp-head__verdict is-${verdictTone(overall.score)}`,
          text: verdictWord(overall.score) || 'Not rated' }),
      ]),
    ]),
  ]);
}

/* ==========================================================================
   The page — below the tab strip
   ========================================================================== */

export function renderOverviewTab(a, ctx = {}, nav = {}) {
  const page = el('div', { class: 'mh-page mh-page--flush sp-page' });
  const resources = [];

  page.append(...[
    chartSection(a, nav, resources),
    peerSection(a, nav),
    gradeSection(a, nav),
    keyStatsSection(a, nav),
    earningsSection(a, nav),
    employeesSection(a),
    financialsSection(a, nav),
    analystSection(a, nav),
    companySection(a),
    newsSection(a, nav),
    researchSlot(a, nav),
    coverageNote(),
  ].filter(Boolean));

  page.dispose = () => { for (const node of resources) { node.destroy?.(); node.dispose?.(); } };
  return page;
}

/* ---- the chart, and what the price has done ------------------------------
   The same chart every market page draws, so its ranges, crosshair,
   candlesticks and expanded view come with it rather than being rebuilt. The
   performance row under it is TradingView's, over the windows our own price
   series actually covers — it is thirteen months, so there is no five-year or
   all-time column to print and none is shown. */
function chartSection(a, nav, resources) {
  const f = a.facts;
  const m = a.momentum || {};
  /* `marketChart` fetches its own series, which is the right chart when there
     is a key and no chart at all when there is not. The bundled snapshot is
     the case a developer opens first, so without a key this falls back to the
     report's own line over the dataset's price history. */
  const chart = hasApiKey() ? marketChart({
    symbol: f.symbol, name: f.name, shortName: f.name, kind: 'stock',
    currency: f.currency, price: f.price, change: f.change,
    changesPercentage: isNum(f.changePct) ? f.changePct * 100 : null,
    previousClose: f.previousClose, quote: { price: f.price, previousClose: f.previousClose },
  }) : snapshotChart(a);
  if (hasApiKey()) resources.push(chart);

  const windows = [
    ['1 month', m.r1m], ['3 months', m.r3m], ['6 months', m.r6m],
    ['Year to date', m.rYtd], ['1 year', m.r1y],
  ].filter(([, v]) => isNum(v));

  return el('section', { class: 'sp-block sp-block--chart', 'aria-label': 'Price' }, [
    chart,
    windows.length ? el('div', { class: 'sp-perf' }, windows.map(([label, value]) => el('div', {
      class: 'sp-perf__i',
    }, [
      el('span', { class: 'sp-perf__k', text: label }),
      el('b', { class: `sp-perf__v ${value > 0 ? 'is-up' : value < 0 ? 'is-down' : ''}`.trim(),
        text: pct(value, { sign: true }) }),
    ]))) : null,
  ].filter(Boolean));
}

/** The bundled dataset's own price history, for the disconnected page. */
function snapshotChart(a) {
  const f = a.facts;
  const points = normalisePrices(a.ds.get('prices'));
  const body = points.length > 1
    ? lineChart(points.map((p) => ({ date: p.date, value: p.price })), {
      height: 300,
      valueFmt: (v) => price(v, curSymbol(f.currency)),
      labelFmt: (d) => fmtDate(d, { month: 'short', year: '2-digit' }),
    })
    : (feedGate(a, 'prices', 'Price history') || notice('No price history in this dataset.'));
  return el('div', { class: 'sp-snapshot' }, [
    el('div', { class: 'sp-snapshot__head' }, [
      el('b', { text: `${f.name} · ${f.symbol}` }),
      el('span', { text: 'Bundled snapshot — connect FMP for the live chart and its ranges.' }),
    ]),
    body,
  ]);
}

/* ---- compare with peers --------------------------------------------------
   TradingView's row of comparison cards, over the peer set the report already
   holds. Each one opens that company's own report. */
function peerSection(a, nav) {
  const rows = (a.peers?.peers || []).filter((p) => p.symbol).slice(0, PEERS);
  if (!rows.length) return null;
  return section(`Compare with ${a.facts.name}`, [
    el('div', { class: 'sp-peers' }, rows.map((p) => {
      const mark = el('span', { class: 'sp-peer__mark', 'aria-hidden': 'true' },
        [el('span', { text: String(p.symbol).slice(0, 3) })]);
      const img = el('img', { src: logoUrl(p.symbol), alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', () => img.remove(), { once: true });
      mark.append(img);
      return el('button', {
        type: 'button', class: 'sp-peer', 'aria-label': `Open ${p.name || p.symbol}`,
        onclick: () => nav.goSymbol?.(p.symbol),
      }, [
        el('div', { class: 'sp-peer__id' }, [mark, el('div', {}, [
          el('strong', { text: p.symbol }),
          el('small', { text: p.name || p.symbol, title: p.name || p.symbol }),
        ])]),
        /* TradingView prints the day's move on these cards. The peers feed
           carries no change and quoting four more symbols to print one would
           cost a request per peer, so the card shows what the feed does
           give — the multiple and the size, which is the comparison a reader
           of this product is making anyway. */
        el('div', { class: 'sp-peer__v' }, [
          el('b', { text: isNum(p.price) ? price(p.price, '') : DASH }),
          el('span', { class: 'sp-peer__mult', text: isNum(p.pe) ? `${mult(p.pe)} P/E` : money(p.marketCap) }),
        ]),
      ]);
    })),
  ]);
}

/* ---- the grades ----------------------------------------------------------
   The product's own reading, in the slot TradingView gives a technical gauge.
   The flake is the report's, so a reader who has seen one anywhere else in
   the app reads this one for free. */
function gradeSection(a, nav) {
  const scores = Object.fromEntries(FACTOR_KEYS.map((k) => [k, a.scores?.[k]?.score]));
  const overall = a.scores?.overall || {};
  const shariah = SHARIAH_STANDARDS.map((std) => shariahVerdict(a, std));
  const passed = shariah.filter((r) => r.state === 'pass').length;

  return section('Factor grades', [
    el('div', { class: 'sp-grades' }, [
      el('div', { class: 'sp-grades__flake' }, [
        snowflake(scores, { size: 250, onSelect: (ax) => nav.openFactor?.(ax.key) }),
      ]),
      el('div', { class: 'sp-grades__rows' }, [
        ...FACTOR_KEYS.map((k) => {
          const s = a.scores?.[k] || {};
          return el('button', {
            type: 'button', class: 'sp-grade', onclick: () => nav.openFactor?.(k),
            'aria-label': `Open the ${s.title || k} tab`,
          }, [
            el('span', { class: 'sp-grade__k', text: s.title || titleCase(k) }),
            el('span', { class: 'sp-grade__bar' }, [el('i', {
              style: { width: `${Math.max(0, Math.min(1, (s.score || 0) / MAX_SCORE)) * 100}%` },
              class: `is-${verdictTone(s.score)}`,
            })]),
            el('b', { class: 'sp-grade__v', text: isNum(s.score) ? dec(s.score, 1) : DASH }),
          ]);
        }),
        el('div', { class: 'sp-grades__foot' }, [
          stat('Overall', isNum(overall.score) ? dec(overall.score, 2) : DASH, { unit: `/ ${MAX_SCORE}` }),
          stat('Shariah screens', `${passed} of ${shariah.length}`, { note: 'standards passed' }),
          stat('Sector', a.facts.sector || 'Unclassified',
            { note: `graded against ${a.sectorTable?.count || 0} peers` }),
        ]),
      ]),
    ]),
  ], () => nav.openAnalysis?.(),
  `Each factor is a percentile against the ${a.facts.sector || 'wider'} sector, on a scale of 0 to ${MAX_SCORE}. Click a spoke or a row to open it.`);
}

/* ---- key stats ----------------------------------------------------------- */
function keyStatsSection(a, nav) {
  const f = a.facts;
  return section('Key stats', [grid([
    stat('Market capitalisation', money(f.marketCap), { unit: f.currency }),
    stat('Dividend yield (TTM)', pct(f.dividendYield, { dp: 2 })),
    stat('Price to earnings (TTM)', mult(f.pe)),
    stat('Earnings per share (TTM)', isNum(f.eps) ? dec(f.eps, 2) : DASH, { unit: f.currency }),
    stat('Net income (TTM)', money(f.netIncome), { unit: f.currency }),
    stat('Revenue (TTM)', money(f.revenue), { unit: f.currency }),
    stat('Shares outstanding', isNum(f.shares) ? num(f.shares, 2) : DASH),
    stat('Beta', dec(f.beta, 2)),
    stat('52-week range', isNum(f.yearLow) && isNum(f.yearHigh)
      ? `${dec(f.yearLow, 2)} – ${dec(f.yearHigh, 2)}` : DASH, { unit: f.currency }),
    stat('Day range', isNum(f.dayLow) && isNum(f.dayHigh)
      ? `${dec(f.dayLow, 2)} – ${dec(f.dayHigh, 2)}` : DASH, { unit: f.currency }),
    stat('Volume', isNum(f.volume) ? num(f.volume, 1) : DASH),
    stat('Price to book', mult(f.pb)),
  ])], () => nav.openAnalysis?.());
}

/* ---- what is due to report ----------------------------------------------- */
function earningsSection(a, nav) {
  const q = a.quarter || {};
  const next = a.forecast?.rows?.find((r) => r.year >= new Date().getUTCFullYear()) || null;
  if (!q.next && !q.available && !next) return null;
  return section('Upcoming earnings', [grid([
    stat('Next report date', q.next
      ? fmtDate(q.next, { day: 'numeric', month: 'long', year: 'numeric' }) : DASH),
    stat('Last reported', q.date
      ? fmtDate(q.date, { day: 'numeric', month: 'short', year: 'numeric' }) : DASH),
    stat('EPS estimate', isNum(next?.eps) ? dec(next.eps, 2) : DASH,
      { unit: a.facts.currency, note: next?.analystsEps ? `${next.analystsEps} analysts` : null }),
    stat('Revenue estimate', money(next?.revenue), { unit: a.facts.currency,
      note: next?.analystsRevenue ? `${next.analystsRevenue} analysts` : null }),
    stat('Last EPS surprise', isNum(q.epsSurprise) ? pct(q.epsSurprise, { sign: true, dp: 1 }) : DASH,
      { tone: isNum(q.epsSurprise) ? (q.epsSurprise >= 0 ? 'up' : 'down') : null }),
    stat('Last revenue surprise', isNum(q.revenueSurprise) ? pct(q.revenueSurprise, { sign: true, dp: 1 }) : DASH,
      { tone: isNum(q.revenueSurprise) ? (q.revenueSurprise >= 0 ? 'up' : 'down') : null }),
  ])], () => nav.goSymbolTab?.('Analysts Forecast', a.facts.symbol));
}

/* ---- headcount ----------------------------------------------------------- */
function employeesSection(a) {
  const rows = a.employees?.rows || [];
  const latest = rows.at(-1);
  const prior = rows.at(-2);
  if (!latest && !isNum(a.facts.employees)) return null;
  const change = latest && prior && isNum(latest.count) && isNum(prior.count)
    ? latest.count - prior.count : null;
  return section('Employees', [grid([
    stat('Employees', isNum(latest?.count) ? num(latest.count, 0) : (isNum(a.facts.employees) ? num(a.facts.employees, 0) : DASH),
      { note: latest?.year ? `FY ${latest.year}` : 'latest filing' }),
    stat('Change on the year', isNum(change) ? `${change > 0 ? '+' : ''}${num(change, 0)}` : DASH,
      { tone: isNum(change) ? (change > 0 ? 'up' : change < 0 ? 'down' : null) : null,
        note: isNum(change) && prior?.count ? pct(change / prior.count, { sign: true, dp: 1 }) : null }),
    stat('Revenue per employee', money(latest?.revenuePerHead), { unit: a.facts.currency }),
    stat('Profit per employee', money(latest?.profitPerHead), { unit: a.facts.currency }),
  ])]);
}

/* ---- the financial history -----------------------------------------------
   TradingView's revenue-and-profit block, as bars over the annual series the
   report already derives. Two bars a year and the margin beside them; the
   statements themselves are a tab away. */
function financialsSection(a, nav) {
  const rows = (a.series?.rows || []).filter((r) => isNum(r.revenue)).slice(-YEARS);
  if (rows.length < 2) return null;
  const peak = Math.max(...rows.map((r) => Math.max(r.revenue || 0, Math.abs(r.netIncome || 0))));
  const height = (v) => (peak > 0 && isNum(v) ? `${Math.max(1, Math.abs(v) / peak * 100)}%` : '0%');

  return section('Financials', [
    el('div', { class: 'sp-bars' }, rows.map((r) => el('div', { class: 'sp-bars__yr' }, [
      el('div', { class: 'sp-bars__plot' }, [
        el('span', { class: 'sp-bars__b sp-bars__b--rev', style: { height: height(r.revenue) },
          title: `Revenue ${money(r.revenue)}` }),
        el('span', { class: `sp-bars__b sp-bars__b--ni${(r.netIncome || 0) < 0 ? ' is-neg' : ''}`,
          style: { height: height(r.netIncome) }, title: `Net income ${money(r.netIncome)}` }),
      ]),
      el('span', { class: 'sp-bars__k', text: String(r.year) }),
    ]))),
    el('div', { class: 'sp-legend' }, [
      el('span', { class: 'sp-legend__i' }, [el('i', { class: 'sp-legend__sw sp-legend__sw--rev' }), 'Revenue']),
      el('span', { class: 'sp-legend__i' }, [el('i', { class: 'sp-legend__sw sp-legend__sw--ni' }), 'Net income']),
    ]),
    grid([
      stat('Revenue, latest year', money(rows.at(-1)?.revenue), { unit: a.facts.currency }),
      stat('Net income, latest year', money(rows.at(-1)?.netIncome), { unit: a.facts.currency }),
      stat('Net margin', pct(a.facts.netMargin, { dp: 1 })),
      stat('Free cash flow (TTM)', money(a.facts.fcf), { unit: a.facts.currency }),
    ]),
  ], () => nav.goSymbolTab?.('Financials', a.facts.symbol));
}

/* ---- what the analysts say -----------------------------------------------
   The vendor's consensus, kept clearly separate from our own grade: they are
   two different opinions and a reader who conflates them is being misled. */
function analystSection(a, nav) {
  const m = a.momentum || {};
  if (!isNum(m.analystScore) && !isNum(m.targetPrice)) return null;
  const word = ['Strong sell', 'Sell', 'Hold', 'Buy', 'Strong buy'];
  const label = isNum(m.analystScore) ? word[Math.max(0, Math.min(4, Math.round(m.analystScore) - 1))] : null;
  return section('Analyst consensus', [grid([
    stat('Consensus', label || DASH, { note: m.analystTotal ? `${m.analystTotal} ratings` : null }),
    stat('Average price target', isNum(m.targetPrice) ? price(m.targetPrice, '') : DASH,
      { unit: a.facts.currency }),
    stat('Implied upside', isNum(m.targetUpside) ? pct(m.targetUpside, { sign: true, dp: 1 }) : DASH,
      { tone: isNum(m.targetUpside) ? (m.targetUpside >= 0 ? 'up' : 'down') : null }),
    stat('Cost of equity (CAPM)', pct(m.costOfEquity, { dp: 1 })),
  ])], () => nav.goSymbolTab?.('Ratings', a.facts.symbol),
  'FMP’s analyst consensus and price target. This is the sell side’s view, not the Maz score above it.');
}

/* ---- the company itself --------------------------------------------------- */
function companySection(a) {
  const f = a.facts;
  const site = f.website ? String(f.website).replace(/^https?:\/\//, '').replace(/\/$/, '') : null;
  return section('Company info', [
    grid([
      stat('Sector', f.sector || DASH),
      stat('Industry', f.industry || DASH),
      stat('CEO', f.ceo || DASH),
      stat('Website', site || DASH),
      stat('Headquarters', f.address ? f.address.split(',').slice(1, 3).join(',').trim() || f.country : (f.country || DASH)),
      stat('Listed since', f.ipoDate ? fmtDate(f.ipoDate, { day: 'numeric', month: 'short', year: 'numeric' }) : DASH),
      stat('ISIN', f.isin || DASH),
      stat('CIK', f.cik || DASH),
    ]),
    f.description ? el('p', { class: 'sp-about', text: f.description }) : null,
  ].filter(Boolean));
}

/* ---- the wire ------------------------------------------------------------- */
function newsSection(a, nav) {
  const rows = (a.news?.articles || []).slice(0, STORIES);
  if (!rows.length) return null;
  const list = el('div', { class: 'nw-list' }, rows.map((item) => storyRow({
    title: item.title, url: item.url, date: item.date, source: item.source, text: item.text,
    image: item.image, marks: [{ symbol: a.facts.symbol, shortName: a.facts.symbol, kind: 'stock' }],
  }, { nav })));
  // The one symbol this page is already about, so the tick can carry its move
  // without a request: the quote is in `facts`.
  paintQuotes(list, new Map([[String(a.facts.symbol).toUpperCase(), {
    change: a.facts.change,
    changesPercentage: isNum(a.facts.changePct) ? a.facts.changePct * 100 : null,
    previousClose: a.facts.previousClose,
  }]]));
  return section('News', [list], () => nav.goSymbolTab?.('News', a.facts.symbol));
}

/* ---- our own research on this company -------------------------------------
   A slot rather than a section: the article store is fetched separately and
   the page must not wait for it. Stays absent when there is nothing filed. */
function researchSlot(a, nav) {
  const sym = a.facts?.symbol;
  const slot = el('div', { class: 'sp-block', hidden: true });
  const fill = () => {
    const card = relatedResearchCard(articlesForTicker(sym, 4), nav, {
      title: `Vantace research on ${a.facts?.name || sym}`, cls: 'ocard',
    });
    if (!card) return;
    slot.replaceChildren(card);
    slot.hidden = false;
  };
  if (articlesReady()) fill();
  else loadArticles().then(fill).catch(() => { /* the slot simply stays empty */ });
  return slot;
}

/* ---- what this page does not carry ---------------------------------------
   The standing rule: a surface says what it is measuring and what it cannot.
   Everything named here is on the reference page and absent from ours because
   the vendor does not supply it — not because it was forgotten. */
function coverageNote() {
  return el('details', { class: 'mh-coverage sp-block' }, [
    el('summary', { text: 'What this page does not show' }),
    el('div', {}, [
      'Pre- and post-market prints, an order book and per-exchange volume: FMP’s quote is one consolidated, delayed print.',
      'A technical-rating gauge and seasonality: this product grades companies on their accounts against their sector, and does not compute signals from the price series alone. The factor grades above are the reading it does make.',
      'Community ideas and discussion: there is no such feed, and an empty one would be worse than none.',
      'The bond ladder and the funds holding the stock: not fetched for the company report.',
    ].map((line) => el('p', { text: line }))),
  ]);
}
