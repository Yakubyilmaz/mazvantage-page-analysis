/* ==========================================================================
   Maz Vantage — application shell

   Owns routing (?symbol=), the chrome around the report, the settings
   dialog, and the fetch → analyse → render pipeline.
   ========================================================================== */

import { el, esc, isNum, money, pct, price, trim, dec, fmtDate, ago, signClass } from './util.js';
import { loadDataset, fetchFor, mapLimited, getApiKey, setApiKey, hasApiKey, clearCache } from './fmp.js';
import { analyse, loadBenchmarks, saveBenchmarks, DEFAULT_BENCHMARKS, FACTOR_META } from './model.js';
import { snowflake, AXES } from './snowflake.js';
import {
  renderOverview, renderPriceHistory, renderAbout, renderValuation, renderFuture,
  renderPast, renderHealth, renderDividend, renderManagement, renderOwnership,
  renderCompanyInfo, renderCompetitors, renderDataStatus,
} from './sections.js';

/* ---------- constants ----------------------------------------------------- */

const DEFAULT_SYMBOL = 'AAPL';
const THEME_KEY = 'mazvantage.theme';

const NAV = [
  { label: 'Company Overview', anchor: 'overview' },
  { label: 'Valuation', anchor: 'valuation', n: 1 },
  { label: 'Future Growth', anchor: 'future-growth', n: 2 },
  { label: 'Past Performance', anchor: 'past-performance', n: 3 },
  { label: 'Financial Health', anchor: 'financial-health', n: 4 },
  { label: 'Dividend', anchor: 'dividend', n: 5 },
  { label: 'Management', anchor: 'management', n: 6 },
  { label: 'Ownership', anchor: 'ownership', n: 7 },
  { label: 'Other Information', anchor: 'company-info' },
];

/** Sector → SPDR sector ETF, used as the industry benchmark for returns. */
const SECTOR_ETF = {
  'Technology': 'XLK', 'Communication Services': 'XLC', 'Consumer Cyclical': 'XLY',
  'Consumer Defensive': 'XLP', 'Healthcare': 'XLV', 'Financial Services': 'XLF',
  'Industrials': 'XLI', 'Energy': 'XLE', 'Basic Materials': 'XLB',
  'Utilities': 'XLU', 'Real Estate': 'XLRE',
};
const MARKET_ETF = 'SPY';

/* ---------- theme --------------------------------------------------------- */

function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem(THEME_KEY, mode);
}
function currentTheme() { return localStorage.getItem(THEME_KEY) || 'dark'; }

/* ---------- icons --------------------------------------------------------- */

const SVG = {
  search: 'M10 2a8 8 0 105.293 14.293l4.707 4.707 1.414-1.414-4.707-4.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z',
  gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0 6a2 2 0 110-4 2 2 0 010 4zm8.94-2a7.94 7.94 0 00-.14-1.46l2.03-1.58-2-3.46-2.4.96a8.1 8.1 0 00-2.53-1.46L15.5 2h-4l-.4 2.54a8.1 8.1 0 00-2.53 1.46l-2.4-.96-2 3.46L6.2 10.1a8.03 8.03 0 000 3.8l-2.03 1.58 2 3.46 2.4-.96c.76.62 1.62 1.12 2.53 1.46l.4 2.56h4l.4-2.56a8.1 8.1 0 002.53-1.46l2.4.96 2-3.46-2.03-1.58c.09-.48.14-.97.14-1.46z',
  sun: 'M12 17a5 5 0 110-10 5 5 0 010 10zm0-14a1 1 0 011 1v2a1 1 0 11-2 0V4a1 1 0 011-1zm0 16a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1zM3 12a1 1 0 011-1h2a1 1 0 110 2H4a1 1 0 01-1-1zm15 0a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zM5.6 5.6a1 1 0 011.4 0l1.5 1.5a1 1 0 11-1.4 1.4L5.6 7a1 1 0 010-1.4zm9.9 9.9a1 1 0 011.4 0l1.5 1.5a1 1 0 01-1.4 1.4l-1.5-1.5a1 1 0 010-1.4zm3-9.9a1 1 0 010 1.4L17 8.5a1 1 0 11-1.4-1.4l1.5-1.5a1 1 0 011.4 0zM8.5 17l-1.5 1.5a1 1 0 01-1.4-1.4L7 15.6A1 1 0 118.5 17z',
  print: 'M19 8H5a3 3 0 00-3 3v6h4v4h12v-4h4v-6a3 3 0 00-3-3zm-3 11H8v-5h8v5zm3-8a1 1 0 110-2 1 1 0 010 2zM18 3H6v4h12V3z',
  refresh: 'M17.65 6.35A8 8 0 106 18.35l1.42-1.42A6 6 0 1112 18a6 6 0 01-4.24-1.76l2.83-2.83H3.5v7.07l2.84-2.83A8 8 0 0020 12h-2a6 6 0 01-6 6V4l5.65 2.35z',
};

function iconSvg(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', SVG[name]);
  s.append(p);
  return s;
}

/* ==========================================================================
   Chrome
   ========================================================================== */

function buildTopbar(onSearch) {
  const input = el('input', {
    type: 'search', placeholder: 'Search ticker…', 'aria-label': 'Search ticker',
    autocomplete: 'off', spellcheck: 'false',
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) onSearch(input.value.trim().toUpperCase());
  });

  const themeBtn = el('button', { class: 'icon-btn', title: 'Toggle theme', 'aria-label': 'Toggle theme' }, [iconSvg('sun')]);
  themeBtn.addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));

  const gearBtn = el('button', { class: 'icon-btn', title: 'Settings', 'aria-label': 'Settings' }, [iconSvg('gear')]);
  gearBtn.addEventListener('click', () => openSettings());

  return el('header', { class: 'topbar' }, [
    el('div', { class: 'topbar__inner' }, [
      el('a', { class: 'logo', href: '?', 'aria-label': 'Maz Vantage home' }, [
        logoMark(),
        el('span', { class: 'logo__word', html: 'Maz <em>Vantage</em>' }),
      ]),
      el('nav', { class: 'topnav' }, [
        el('a', { href: '#overview', 'aria-current': 'page', text: 'Stock report' }),
        el('a', { href: '#valuation', text: 'Valuation' }),
        el('a', { href: '#data-status', text: 'Data' }),
      ]),
      el('div', { class: 'topbar__spacer' }),
      el('div', { class: 'ticker-search' }, [iconSvg('search'), input]),
      themeBtn,
      gearBtn,
    ]),
  ]);
}

function logoMark() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 32 32');
  s.setAttribute('class', 'logo__mark');
  s.innerHTML = `
    <defs><linearGradient id="mv-g" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="var(--brand-02)"/><stop offset="100%" stop-color="var(--brand-01)"/>
    </linearGradient></defs>
    <path d="M4 26V6h4.6L16 18.4 23.4 6H28v20h-4.4V13.6L17.4 24h-2.8L8.4 13.6V26H4Z" fill="url(#mv-g)"/>`;
  return s;
}

/* ---------- left rail ----------------------------------------------------- */

function buildRail(a) {
  const f = a.facts;
  const scores = Object.fromEntries(AXES.map((x) => [x.key, a.scores[x.key].passed]));

  const nav = el('nav', { class: 'rail__nav' }, NAV.map((item) =>
    el('a', { href: `#${item.anchor}`, 'data-anchor': item.anchor }, [
      el('span', { class: 'num', text: item.n ? String(item.n) : '' }),
      el('span', { text: item.label }),
    ])));

  return el('aside', { class: 'rail' }, [
    el('div', { class: 'rail__flake' }, [snowflake(scores, { size: 200 })]),
    el('div', { class: 'rail__name', text: f.name }),
    el('div', { class: 'rail__meta', text: `${f.exchange}:${f.symbol}` }),
    el('div', { class: 'rail__meta', text: `Market cap ${money(f.marketCap)}` }),
    el('div', { class: 'rail__actions' }, [
      el('button', { class: 'btn btn--primary', text: 'Print report', onclick: () => window.print() }),
    ]),
    nav,
  ]);
}

/* ---------- report header ------------------------------------------------- */

function buildHeader(a) {
  const f = a.facts;
  const cur = ({ USD: 'US$', EUR: '€', GBP: '£', JPY: '¥' })[f.currency] || `${f.currency} `;

  const disc = a.discount;
  const discPill = isNum(disc)
    ? el('span', { class: `pill ${disc > 0 ? 'pill--good' : 'pill--bad'}`, text: `${pct(Math.abs(disc))} ${disc > 0 ? 'undervalued' : 'overvalued'}` })
    : null;

  return el('div', { class: 'rpt-head' }, [
    el('div', { class: 'crumbs' }, [
      el('span', { text: 'Stocks' }),
      el('span', { text: f.sector || 'Market' }),
      el('span', { class: 'subtle', text: `Updated ${ago(a.ds.asOf)}` }),
    ]),
    el('div', { class: 'rpt-head__top' }, [
      f.image ? el('img', { class: 'rpt-head__logo', src: f.image, alt: '', loading: 'lazy',
        onerror: (e) => e.target.remove() }) : null,
      el('div', {}, [
        el('h1', { text: f.name }),
        el('p', { class: 'rpt-head__sub', text: `${f.exchangeFull || f.exchange}:${f.symbol} · Stock Report · Market cap ${money(f.marketCap)}` }),
      ]),
      el('div', { class: 'rpt-head__actions' }, [
        el('button', { class: 'btn', title: 'Reload from FMP', onclick: () => { clearCache(); boot(true); } }, [iconSvg('refresh'), 'Refresh']),
        el('button', { class: 'btn', onclick: () => window.print() }, [iconSvg('print'), 'Print']),
      ]),
    ]),

    el('div', { class: 'statstrip' }, [
      statCell('Share price', price(f.price, cur), [
        el('span', { class: signClass(f.changePct), text: isNum(f.changePct) ? `${pct(f.changePct, { sign: true })} today` : '' }),
      ]),
      statCell('Fair value', isNum(a.fairValue) ? price(a.fairValue, cur) : 'n/a', [discPill]),
      statCell('Market cap', money(f.marketCap)),
      statCell('P/E ratio', isNum(f.pe) ? `${dec(f.pe, 1)}x` : 'n/a'),
      statCell('Dividend yield', pct(f.dividendYield, { dp: 2 })),
      statCell('52-week range', isNum(f.yearLow) && isNum(f.yearHigh) ? `${trim(f.yearLow, 0)}–${trim(f.yearHigh, 0)}` : 'n/a'),
    ]),
  ]);
}

function statCell(label, value, extra = []) {
  return el('div', { class: 'statstrip__cell' }, [
    el('div', { class: 'statstrip__label', text: label }),
    el('div', { class: 'statstrip__value', text: value }),
    ...extra.filter(Boolean).map((n) => el('div', { class: 'statstrip__note' }, [n])),
  ]);
}

/* ---------- footer -------------------------------------------------------- */

function buildFooter() {
  const col = (title, items) => el('div', {}, [
    el('h4', { text: title }),
    el('ul', {}, items.map((i) => el('li', { text: i }))),
  ]);
  return el('footer', { class: 'foot' }, [
    el('div', { class: 'foot__cols' }, [
      col('Coverage', ['US: NYSE & NASDAQ', 'Europe', 'Asia-Pacific', 'Any FMP-listed ticker']),
      col('The five factors', ['Valuation', 'Future Growth', 'Past Performance', 'Financial Health', 'Dividend']),
      col('Report', ['Vantage Flake', 'Rewards & risks', '34 analysis checks', 'Data status']),
      col('Data', ['Financial Modeling Prep', 'Trailing twelve month basis', 'Benchmarks editable in Settings']),
    ]),
    el('p', { class: 'foot__legal' },
      ['Maz Vantage is a research tool, not financial advice. Every figure is generated from Financial Modeling Prep data '
        + 'and the analysis model in this repository, without considering your objectives, financial situation or needs. '
        + 'Verify anything you intend to act on against primary filings. © ' + new Date().getFullYear() + ' Maz Vantage.']),
  ]);
}

/* ==========================================================================
   Snapshot capture

   Serialises whatever the live connection returned into the same shape
   `assets/data/<SYMBOL>.json` expects, so a report can be pinned for offline
   use, review, or sharing without handing over an API key.
   ========================================================================== */

let lastLoad = null;   // { ds, extras } from the most recent successful boot

function saveSnapshot() {
  if (!lastLoad) return;
  const { ds, extras } = lastLoad;

  const feeds = {};
  let live = 0;
  for (const [name, r] of Object.entries(ds.feeds)) {
    if (r.status !== 'ok' || r.data == null) continue;
    feeds[name] = r.data;
    if (!r.fromSnapshot) live++;
  }

  const payload = {
    symbol: ds.symbol,
    capturedAt: new Date().toISOString().slice(0, 10),
    note: `Captured from Financial Modeling Prep on ${new Date().toISOString().slice(0, 10)} `
      + `by Maz Vantage. ${live} feed${live === 1 ? '' : 's'} came back live; feeds absent here `
      + 'were gated by the plan or returned nothing, and degrade to "not assessed" in the report.',
    extras: { peerRatios: extras?.peerRatios || {}, benchmarks: extras?.benchmarks || {} },
    feeds,
  };

  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: `${ds.symbol}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ==========================================================================
   Settings dialog
   ========================================================================== */

function openSettings() {
  const bm = loadBenchmarks();
  const dlg = el('dialog', {}, []);

  const keyInput = el('input', { type: 'password', value: getApiKey(), placeholder: 'FMP API key', autocomplete: 'off' });
  const fields = [
    ['riskFreeRate', 'Risk-free / savings rate', 'e.g. 0.042 for 4.2%'],
    ['marketEarningsGrowth', 'Market forecast earnings growth', ''],
    ['marketRevenueGrowth', 'Market forecast revenue growth', ''],
    ['highGrowth', 'High-growth threshold', ''],
    ['roeBar', 'High ROE threshold', ''],
    ['dividendNotable', 'Notable dividend yield', ''],
    ['dividendTopTier', 'Top-tier dividend yield', ''],
    ['netDebtToEquityCeiling', 'Net debt / equity ceiling', ''],
  ];
  const inputs = {};
  const fieldNodes = fields.map(([k, label, hint]) => {
    const inp = el('input', { type: 'number', step: '0.001', value: String(bm[k]) });
    inputs[k] = inp;
    return el('div', {}, [el('label', { text: label }), inp, hint ? el('p', { class: 'hint', text: hint }) : null]);
  });

  dlg.append(
    el('h2', { text: 'Settings' }),
    el('label', { text: 'Financial Modeling Prep API key' }),
    keyInput,
    el('p', { class: 'hint', html: 'Stored in this browser only (<code>localStorage</code>) and sent directly to financialmodelingprep.com. '
      + 'Leave blank to render the bundled snapshot instead of live data.' }),
    el('h2', { class: 'mt3', text: 'Benchmarks', style: { fontSize: '14px', marginTop: '24px' } }),
    el('p', { class: 'hint', text: 'Thresholds the 34 checks compare against. Enter decimals, not percentages.' }),
    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '4px 16px' } }, fieldNodes),

    el('h2', { text: 'Snapshot', style: { fontSize: '14px', marginTop: '24px' } }),
    el('p', { class: 'hint', html: 'Save everything this report loaded as <code>'
      + esc(lastLoad?.ds.symbol || 'SYMBOL') + '.json</code>. Drop it in <code>assets/data/</code> '
      + 'and the ticker renders with no API key — useful for pinning a point in time, or for '
      + 'sharing a report without sharing your key.' }),
    el('button', {
      class: 'btn mt1', text: `Save ${lastLoad?.ds.symbol || 'snapshot'}.json`,
      disabled: !lastLoad, onclick: () => saveSnapshot(),
    }),

    el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'Reset benchmarks', onclick: () => {
        localStorage.removeItem('mazvantage.benchmarks');
        dlg.close(); boot(true);
      } }),
      el('button', { class: 'btn', text: 'Cancel', onclick: () => dlg.close() }),
      el('button', { class: 'btn btn--primary', text: 'Save & reload', onclick: () => {
        setApiKey(keyInput.value);
        const patch = {};
        for (const [k, inp] of Object.entries(inputs)) {
          const v = parseFloat(inp.value);
          if (Number.isFinite(v)) patch[k] = v;
        }
        saveBenchmarks(patch);
        dlg.close();
        boot(true);
      } }),
    ]),
  );

  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

/* ==========================================================================
   Scroll spy
   ========================================================================== */

function wireScrollSpy(root) {
  const links = [...root.querySelectorAll('.rail__nav a')];
  if (!links.length) return;
  const targets = links
    .map((l) => ({ link: l, node: document.getElementById(l.dataset.anchor) }))
    .filter((t) => t.node);

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const hit = targets.find((t) => t.node === e.target);
      if (!hit) continue;
      links.forEach((l) => l.classList.toggle('is-active', l === hit.link));
    }
  }, { rootMargin: '-88px 0px -70% 0px', threshold: 0 });

  targets.forEach((t) => io.observe(t.node));
}

/* ==========================================================================
   Loading / error states
   ========================================================================== */

function skeleton(symbol) {
  return el('div', { class: 'shell' }, [
    el('aside', { class: 'rail' }, [
      el('div', { class: 'sk', style: { width: '190px', height: '190px', borderRadius: '50%' } }),
      el('div', { class: 'sk sk--line', style: { width: '70%' } }),
      el('div', { class: 'sk sk--line', style: { width: '45%' } }),
    ]),
    el('main', {}, [
      el('div', { class: 'sk sk--line', style: { width: '260px', height: '28px' } }),
      el('div', { class: 'sk sk--line', style: { width: '40%' } }),
      el('div', { class: 'card' }, [
        el('div', { class: 'sk sk--block' }),
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'sk sk--line' }), el('div', { class: 'sk sk--line', style: { width: '80%' } }),
        el('div', { class: 'sk sk--block', style: { marginTop: '16px' } }),
      ]),
      el('p', { class: 't-xs softer center', text: `Loading ${symbol}…` }),
    ]),
  ]);
}

function errorScreen(symbol, message, extra) {
  return el('div', { class: 'shell', style: { gridTemplateColumns: 'minmax(0,1fr)' } }, [
    el('main', {}, [
      el('div', { class: 'card' }, [
        el('div', { class: 'card__head' }, [el('h2', { text: `Could not build a report for ${symbol}` })]),
        el('p', { class: 't-sm soft', text: message }),
        extra ? el('div', { class: 'mt3' }, [extra]) : null,
        el('div', { class: 'mt3', style: { display: 'flex', gap: '8px' } }, [
          el('button', { class: 'btn btn--primary', text: 'Open settings', onclick: () => openSettings() }),
          el('button', { class: 'btn', text: 'Try AAPL', onclick: () => go('AAPL') }),
        ]),
      ]),
    ]),
  ]);
}

/* ==========================================================================
   Boot
   ========================================================================== */

function symbolFromUrl() {
  return (new URLSearchParams(location.search).get('symbol') || DEFAULT_SYMBOL).toUpperCase();
}

function go(symbol) {
  const url = new URL(location.href);
  url.searchParams.set('symbol', symbol);
  history.pushState({ symbol }, '', url);
  boot();
}

/** Peer P/E ratios and benchmark price series — fetched after the main pass. */
async function loadExtras(ds, facts) {
  const out = { peerRatios: {}, benchmarks: {} };

  // A snapshot can ship its own peer ratios and benchmark series so the
  // offline report is complete rather than half-empty.
  if (ds.snapshotExtras) {
    Object.assign(out.peerRatios, ds.snapshotExtras.peerRatios || {});
    Object.assign(out.benchmarks, ds.snapshotExtras.benchmarks || {});
  }

  if (!hasApiKey()) {
    out.benchmarks.note = out.benchmarks.note
      || 'Sector and market comparisons need a live FMP connection.';
    return out;
  }

  const peers = (ds.get('peers') || []).slice(0, 8).map((p) => p.symbol).filter(Boolean);
  if (peers.length) {
    const rs = await mapLimited(peers, (sym) => fetchFor('ratiosTtm', sym), 4);
    peers.forEach((sym, i) => { if (rs[i]?.status === 'ok' && rs[i].data) out.peerRatios[sym] = rs[i].data; });
  }

  const etf = SECTOR_ETF[facts.sector];
  const wanted = [MARKET_ETF, etf].filter(Boolean);
  const series = await mapLimited(wanted, (sym) => fetchFor('prices', sym), 2);
  if (series[0]?.status === 'ok') out.benchmarks.market = series[0].data;
  if (etf && series[1]?.status === 'ok') {
    out.benchmarks.industry = series[1].data;
    out.benchmarks.note = `Sector benchmark: ${etf}. Market benchmark: ${MARKET_ETF}.`;
  } else {
    out.benchmarks.note = `Market benchmark: ${MARKET_ETF}.`;
  }
  return out;
}

let booting = false;

export async function boot(force = false) {
  if (booting) return;
  booting = true;

  const symbol = symbolFromUrl();
  document.title = `${symbol} — Maz Vantage Stock Analysis`;

  const app = document.getElementById('app');
  app.replaceChildren(skeleton(symbol));

  try {
    if (force) clearCache();
    const ds = await loadDataset(symbol);

    if (ds.source === 'none') {
      app.replaceChildren(errorScreen(symbol,
        'No FMP API key is configured and no bundled snapshot exists for this ticker.',
        el('p', { class: 't-xs softer', html: 'Add a key in Settings, or open <code>?symbol=AAPL</code> to see the bundled example.' })));
      return;
    }
    if (ds.source === 'error') {
      const msgs = Object.entries(ds.feeds)
        .filter(([, r]) => r.status === 'error')
        .slice(0, 3).map(([n, r]) => `${n}: ${r.message}`);
      app.replaceChildren(errorScreen(symbol,
        'Every FMP request failed. The ticker may not exist, or the key may be invalid.',
        el('ul', { class: 't-xs softer' }, msgs.map((m) => el('li', { text: m })))));
      return;
    }

    // First pass so we know the sector, then fetch the extras it implies.
    let a = analyse(ds);
    const extras = await loadExtras(ds, a.facts);
    a = analyse(ds, { peerRatios: extras.peerRatios });
    lastLoad = { ds, extras };

    const main = el('main', {}, [
      buildHeader(a),
      renderOverview(a),
      renderCompetitors(a),
      renderPriceHistory(a, extras),
      renderAbout(a),
      renderValuation(a),
      renderFuture(a),
      renderPast(a),
      renderHealth(a),
      renderDividend(a),
      renderManagement(a),
      renderOwnership(a),
      renderCompanyInfo(a),
      renderDataStatus(a),
      buildFooter(),
    ]);

    const shell = el('div', { class: 'shell' }, [buildRail(a), main]);
    app.replaceChildren(shell);
    wireScrollSpy(shell);

    if (ds.source === 'snapshot') {
      const banner = el('div', {
        class: `notice ${ds.liveError ? 'notice--error' : ''}`.trim(),
        style: { marginBottom: '16px' },
      }, [
        el('div', { html: ds.liveError
          ? `Live FMP requests all failed — <b>${esc(ds.liveError)}</b> — so the <b>bundled snapshot</b> is shown instead. `
            + 'Check the key in Settings.'
          : 'No API key configured — showing the <b>bundled snapshot</b>. Open Settings to connect your FMP key for live data on any ticker.' }),
      ]);
      shell.querySelector('main').prepend(banner);
    }

    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  } catch (err) {
    console.error(err);
    app.replaceChildren(errorScreen(symbol, `Unexpected error: ${err.message}`,
      el('pre', { class: 't-tiny softer', style: { whiteSpace: 'pre-wrap' }, text: String(err.stack || '') })));
  } finally {
    booting = false;
  }
}

/* ---------- start --------------------------------------------------------- */

applyTheme(currentTheme());
document.body.prepend(buildTopbar(go));
window.addEventListener('popstate', () => boot());
boot();
