/* ==========================================================================
   Maz Vantage — application shell

   Loading happens in three passes, because each one depends on the last:

     1. the company's own feeds
     2. the sector/industry screens, which need the profile to know which
        sector to screen
     3. the ratios for every cohort member, which need the screen results

   Only after all three can a relative grade be computed, so the report is
   rendered once at the end rather than flickering through partial states.
   ========================================================================== */

import { el, esc, isNum, money, pct, price, trim, dec, fmtDate, ago, signClass } from './util.js';
import { loadDataset, fetchFor, mapLimited, getApiKey, setApiKey, hasApiKey, clearCache } from './fmp.js';
import { analyse, loadBenchmarks, saveBenchmarks } from './model.js';
import { FACTOR_META } from './metrics.js';
import { buildCohort, screenFloors, mergeCohortStats, MAX_COHORT } from './cohort.js';
import { snowflake, AXES } from './snowflake.js';
import { renderFactor, renderScorecard, renderCohort } from './factors.js';
import {
  renderOverview, renderPriceHistory, renderAbout, renderHistory,
  renderDividend, renderManagement, renderOwnership, renderCompanyInfo, renderDataStatus,
} from './sections.js';

const DEFAULT_SYMBOL = 'AAPL';
const THEME_KEY = 'mazvantage.theme';

const NAV = [
  { label: 'Overview', anchor: 'overview' },
  { label: 'Score', anchor: 'scorecard' },
  { label: 'Value', anchor: 'value', n: 1 },
  { label: 'Growth', anchor: 'growth', n: 2 },
  { label: 'Profitability', anchor: 'profitability', n: 3 },
  { label: 'Health', anchor: 'health', n: 4 },
  { label: 'Momentum', anchor: 'momentum', n: 5 },
  { label: 'Cohort', anchor: 'cohort' },
  { label: 'Ten-year record', anchor: 'history' },
  { label: 'Price history', anchor: 'price-history' },
  { label: 'Dividend', anchor: 'dividend' },
  { label: 'Management', anchor: 'management' },
  { label: 'Ownership', anchor: 'ownership' },
  { label: 'Model & data', anchor: 'data-status' },
];

/** Sector → SPDR sector ETF, the benchmark momentum is measured against. */
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
const currentTheme = () => localStorage.getItem(THEME_KEY) || 'dark';

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
        logoMark(), el('span', { class: 'logo__word', html: 'Maz <em>Vantage</em>' }),
      ]),
      el('nav', { class: 'topnav' }, [
        el('a', { href: '#scorecard', 'aria-current': 'page', text: 'Score' }),
        el('a', { href: '#cohort', text: 'Cohort' }),
        el('a', { href: '#data-status', text: 'Model' }),
      ]),
      el('div', { class: 'topbar__spacer' }),
      el('div', { class: 'ticker-search' }, [iconSvg('search'), input]),
      themeBtn, gearBtn,
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

function flakeScores(a) {
  return Object.fromEntries(AXES.map((x) => [x.key, a.factors[x.key]?.grade ?? null]));
}

function buildRail(a) {
  const f = a.facts;
  const nav = el('nav', { class: 'rail__nav' }, NAV.map((item) =>
    el('a', { href: `#${item.anchor}`, 'data-anchor': item.anchor }, [
      el('span', { class: 'num', text: item.n ? String(item.n) : '' }),
      el('span', { text: item.label }),
    ])));

  return el('aside', { class: 'rail' }, [
    el('div', { class: 'rail__flake' }, [snowflake(flakeScores(a), { size: 200 })]),
    el('div', { class: 'rail__score' }, [
      el('span', { class: 'rail__score-num', text: isNum(a.composite) ? dec(a.composite, 2) : '—' }),
      el('span', { class: `pill pill--${ratingTone(a.rating)}`, text: a.rating }),
    ]),
    el('div', { class: 'rail__name', text: f.name }),
    el('div', { class: 'rail__meta', text: `${f.exchange}:${f.symbol}` }),
    el('div', { class: 'rail__meta', text: `Market cap ${money(f.marketCap)}` }),
    el('div', { class: 'rail__actions' }, [
      el('button', { class: 'btn btn--primary', text: 'Print report', onclick: () => window.print() }),
    ]),
    nav,
  ]);
}

function ratingTone(rating) {
  if (/buy/i.test(rating)) return 'good';
  if (/hold/i.test(rating)) return 'neutral';
  if (/sell/i.test(rating)) return 'bad';
  return 'muted';
}

function buildHeader(a) {
  const f = a.facts;
  const cur = ({ USD: 'US$', EUR: '€', GBP: '£', JPY: '¥' })[f.currency] || `${f.currency} `;
  const disc = a.discount;

  return el('div', { class: 'rpt-head' }, [
    el('div', { class: 'crumbs' }, [
      el('span', { text: f.sector || 'Stocks' }),
      el('span', { text: f.industry || '' }),
      el('span', { class: 'subtle', text: `Updated ${ago(a.ds.asOf)}` }),
    ]),
    el('div', { class: 'rpt-head__top' }, [
      f.image ? el('img', { class: 'rpt-head__logo', src: f.image, alt: '', loading: 'lazy',
        onerror: (e) => e.target.remove() }) : null,
      el('div', {}, [
        el('h1', { text: f.name }),
        el('p', { class: 'rpt-head__sub',
          text: `${f.exchangeFull || f.exchange}:${f.symbol} · ${money(f.marketCap)}` }),
      ]),
      el('div', { class: 'rpt-head__actions' }, [
        el('button', { class: 'btn', title: 'Reload from FMP', onclick: () => { clearCache(); boot(true); } },
          [iconSvg('refresh'), 'Refresh']),
        el('button', { class: 'btn', onclick: () => window.print() }, [iconSvg('print'), 'Print']),
      ]),
    ]),

    el('div', { class: 'statstrip' }, [
      statCell('Share price', price(f.price, cur), [
        el('span', { class: signClass(f.changePct),
          text: isNum(f.changePct) ? `${pct(f.changePct, { sign: true })} today` : '' }),
      ]),
      statCell('Maz Vantage score', isNum(a.composite) ? dec(a.composite, 2) : '—', [
        el('span', { class: `pill pill--${ratingTone(a.rating)}`, text: a.rating }),
      ]),
      statCell('Fair value', isNum(a.fairValue) ? price(a.fairValue, cur) : 'n/a', [
        isNum(disc) ? el('span', { class: `pill ${disc > 0 ? 'pill--good' : 'pill--bad'}`,
          text: `${pct(Math.abs(disc))} ${disc > 0 ? 'undervalued' : 'overvalued'}` }) : null,
      ]),
      statCell('P/E ratio', isNum(f.pe) && f.pe > 0 ? `${dec(f.pe, 1)}x` : 'n/a', [
        a.industryPe ? el('span', { text: `industry ${dec(a.industryPe, 1)}x` }) : null,
      ]),
      statCell('Return on capital', pct(f.roic, { dp: 1 })),
      statCell('12-1m vs sector', pct(a.momentum.rel12m1, { sign: true })),
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

function buildFooter() {
  const col = (title, items) => el('div', {}, [
    el('h4', { text: title }),
    el('ul', {}, items.map((i) => el('li', { text: i }))),
  ]);
  return el('footer', { class: 'foot' }, [
    el('div', { class: 'foot__cols' }, [
      col('Factors', FACTOR_META.map((f) => f.label)),
      col('Method', ['Sector-relative percentiles', 'Size-matched cohort', 'Median-based growth', 'Documented bands where no peer exists']),
      col('Evidence', ['Every grade decomposes', 'Peer rank on each metric', 'Ten-year trends', 'Dividend & management unscored']),
      col('Data', ['Financial Modeling Prep', 'Trailing twelve month basis', 'Weights editable in Settings']),
    ]),
    el('p', { class: 'foot__legal' },
      ['Maz Vantage is a research tool, not financial advice. Grades are generated from vendor data and the '
        + 'model in this repository, without considering your objectives or circumstances. '
        + `© ${new Date().getFullYear()} Maz Vantage.`]),
  ]);
}

/* ==========================================================================
   Snapshot capture
   ========================================================================== */

let lastLoad = null;

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
    note: `Captured by Maz Vantage. ${live} feed${live === 1 ? '' : 's'} live.`,
    extras: { cohortStats: extras?.cohortStats || {}, benchSeries: extras?.benchSeries || null },
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
   Settings
   ========================================================================== */

function openSettings() {
  const bm = loadBenchmarks();
  const dlg = el('dialog', {}, []);
  const keyInput = el('input', { type: 'password', value: getApiKey(), placeholder: 'FMP API key', autocomplete: 'off' });

  const weightFields = FACTOR_META.map((f) => {
    const k = 'w' + f.key.charAt(0).toUpperCase() + f.key.slice(1);
    const inp = el('input', { type: 'number', step: '0.05', min: '0', max: '1', value: String(bm[k]) });
    return { key: k, label: f.label, input: inp };
  });

  const otherFields = [
    ['dividendNotable', 'Notable dividend yield'],
    ['dividendTopTier', 'Top-tier dividend yield'],
    ['payoutCeiling', 'Payout ceiling'],
    ['managementTenureBar', 'Management tenure bar (yrs)'],
    ['boardTenureBar', 'Board tenure bar (yrs)'],
  ].map(([k, label]) => ({ key: k, label, input: el('input', { type: 'number', step: '0.01', value: String(bm[k]) }) }));

  const fieldGrid = (fields) => el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '4px 16px' },
  }, fields.map((f) => el('div', {}, [el('label', { text: f.label }), f.input])));

  dlg.append(
    el('h2', { text: 'Settings' }),
    el('label', { text: 'Financial Modeling Prep API key' }),
    keyInput,
    el('p', { class: 'hint', html: 'Stored in this browser only and sent directly to financialmodelingprep.com. '
      + 'Leave blank to render the bundled snapshot.' }),

    el('h2', { text: 'Composite weights', style: { fontSize: '14px', marginTop: '24px' } }),
    el('p', { class: 'hint', text: 'How much each factor contributes to the headline score. They are normalised, so they need not sum to 1.' }),
    fieldGrid(weightFields),

    el('h2', { text: 'Evidence thresholds', style: { fontSize: '14px', marginTop: '24px' } }),
    el('p', { class: 'hint', text: 'Used only by the unscored Dividend and Management checks — every factor metric is graded against the peer cohort instead.' }),
    fieldGrid(otherFields),

    el('h2', { text: 'Snapshot', style: { fontSize: '14px', marginTop: '24px' } }),
    el('button', {
      class: 'btn mt1', text: `Save ${lastLoad?.ds.symbol || 'snapshot'}.json`,
      disabled: !lastLoad, onclick: () => saveSnapshot(),
    }),

    el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'Reset', onclick: () => {
        localStorage.removeItem('mazvantage.benchmarks'); dlg.close(); boot(true);
      } }),
      el('button', { class: 'btn', text: 'Cancel', onclick: () => dlg.close() }),
      el('button', { class: 'btn btn--primary', text: 'Save & reload', onclick: () => {
        setApiKey(keyInput.value);
        const patch = {};
        for (const f of [...weightFields, ...otherFields]) {
          const v = parseFloat(f.input.value);
          if (Number.isFinite(v)) patch[f.key] = v;
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

/* ---------- scroll spy ---------------------------------------------------- */

function wireScrollSpy(root) {
  const links = [...root.querySelectorAll('.rail__nav a')];
  const targets = links.map((l) => ({ link: l, node: document.getElementById(l.dataset.anchor) }))
    .filter((t) => t.node);
  if (!targets.length) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const hit = targets.find((t) => t.node === e.target);
      if (hit) links.forEach((l) => l.classList.toggle('is-active', l === hit.link));
    }
  }, { rootMargin: '-88px 0px -70% 0px', threshold: 0 });
  targets.forEach((t) => io.observe(t.node));
}

/* ---------- loading / error ----------------------------------------------- */

function skeleton(symbol, stage = 'Loading') {
  return el('div', { class: 'shell' }, [
    el('aside', { class: 'rail' }, [
      el('div', { class: 'sk', style: { width: '190px', height: '190px', borderRadius: '50%' } }),
      el('div', { class: 'sk sk--line', style: { width: '70%' } }),
      el('div', { class: 'sk sk--line', style: { width: '45%' } }),
    ]),
    el('main', {}, [
      el('div', { class: 'sk sk--line', style: { width: '260px', height: '28px' } }),
      el('div', { class: 'card' }, [el('div', { class: 'sk sk--block' })]),
      el('div', { class: 'card' }, [
        el('div', { class: 'sk sk--line' }),
        el('div', { class: 'sk sk--block', style: { marginTop: '16px' } }),
      ]),
      el('p', { class: 't-xs softer center', text: `${stage} ${symbol}…` }),
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
   Cohort loading — passes two and three
   ========================================================================== */

async function loadCohort(ds, facts, onStage) {
  const out = { cohortStats: {}, benchSeries: null, cohort: null };

  // A snapshot can carry its own cohort so the offline report still grades.
  if (ds.snapshotExtras?.cohortStats) {
    Object.assign(out.cohortStats, ds.snapshotExtras.cohortStats);
    out.benchSeries = ds.snapshotExtras.benchSeries ?? null;
  }
  if (!hasApiKey()) return out;

  /* ---- pass 2: sector / industry screens ---- */
  onStage?.('Screening the sector for');
  const floors = screenFloors(facts.marketCap);
  const asOfDate = (ds.get('prices') || []).at(0)?.date
    || new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const ctx = {
    industry: facts.industry, sector: facts.sector,
    capFloor: floors.capFloor, capFloorWide: floors.capFloorWide,
    asOfDate,
  };

  const cohortNames = ['screenIndustry', 'screenSector', 'industryPe', 'industryPeHist', 'sectorPerf'];
  const results = await mapLimited(cohortNames, (n) => fetchFor(n, facts.symbol, ctx), 5);
  cohortNames.forEach((n, i) => { ds.feeds[n] = results[i]; });

  /* ---- pass 3: ratios for every cohort member ---- */
  const cohort = buildCohort(ds, facts);
  out.cohort = cohort;
  const symbols = cohort.members.map((m) => m.symbol);

  if (symbols.length) {
    onStage?.(`Comparing ${symbols.length} peers of`);
    const [ratios, metrics, growth] = await Promise.all([
      mapLimited(symbols, (s) => fetchFor('ratiosTtm', s), 6),
      mapLimited(symbols, (s) => fetchFor('metricsTtm', s), 6),
      mapLimited(symbols, (s) => fetchFor('growth', s), 6),
    ]);
    const pick = (list) => Object.fromEntries(symbols.map((s, i) =>
      [s, list[i]?.status === 'ok' ? (Array.isArray(list[i].data) ? list[i].data[0] : list[i].data) : null]));

    const ratioMap = pick(ratios), metricMap = pick(metrics), growthMap = pick(growth);
    // key-metrics and financial-growth both fold into one flat record per peer
    const extraMap = Object.fromEntries(symbols.map((s) =>
      [s, { ...(metricMap[s] || {}), ...(growthMap[s] || {}) }]));

    out.cohortStats = mergeCohortStats(cohort.members, ratioMap, extraMap);
  }

  /* ---- benchmark series for momentum ---- */
  const etf = SECTOR_ETF[facts.sector] || MARKET_ETF;
  const bench = await fetchFor('prices', etf);
  if (bench?.status === 'ok') out.benchSeries = bench.data;

  return out;
}

/* ==========================================================================
   Boot
   ========================================================================== */

const symbolFromUrl = () =>
  (new URLSearchParams(location.search).get('symbol') || DEFAULT_SYMBOL).toUpperCase();

function go(symbol) {
  const url = new URL(location.href);
  url.searchParams.set('symbol', symbol);
  history.pushState({ symbol }, '', url);
  boot();
}

let booting = false;

export async function boot(force = false) {
  if (booting) return;
  booting = true;

  const symbol = symbolFromUrl();
  document.title = `${symbol} — Maz Vantage`;
  const app = document.getElementById('app');
  const setStage = (stage) => app.replaceChildren(skeleton(symbol, stage));
  setStage('Loading');

  try {
    if (force) clearCache();
    const ds = await loadDataset(symbol);

    if (ds.source === 'none') {
      app.replaceChildren(errorScreen(symbol,
        'No FMP API key is configured and no bundled snapshot exists for this ticker.',
        el('p', { class: 't-xs softer', html: 'Add a key in Settings, or open <code>?symbol=AAPL</code>.' })));
      return;
    }
    if (ds.source === 'error') {
      const msgs = Object.entries(ds.feeds).filter(([, r]) => r.status === 'error')
        .slice(0, 3).map(([n, r]) => `${n}: ${r.message}`);
      app.replaceChildren(errorScreen(symbol,
        'Every FMP request failed. The ticker may not exist, or the key may be invalid.',
        el('ul', { class: 't-xs softer' }, msgs.map((m) => el('li', { text: m })))));
      return;
    }

    // Pass 1 gives us the sector; passes 2 and 3 build the cohort around it.
    const first = analyse(ds);
    const extras = await loadCohort(ds, first.facts, (stage) => setStage(stage));
    const a = analyse(ds, { cohortStats: extras.cohortStats, benchSeries: extras.benchSeries });
    lastLoad = { ds, extras };

    const main = el('main', {}, [
      buildHeader(a),
      renderScorecard(a, snowflake(flakeScores(a), { size: 260 })),
      renderOverview(a),
      ...FACTOR_META.map((m) => renderFactor(a, m.key)),
      renderCohort(a),
      renderHistory(a),
      renderPriceHistory(a, extras),
      renderAbout(a),
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
      shell.querySelector('main').prepend(el('div', {
        class: `notice ${ds.liveError ? 'notice--error' : ''}`.trim(),
        style: { marginBottom: '16px' },
      }, [
        el('div', { html: ds.liveError
          ? `Live FMP requests failed — <b>${esc(ds.liveError)}</b> — so the <b>bundled snapshot</b> is shown.`
          : 'No API key configured — showing the <b>bundled snapshot</b>. Grades still compute if the snapshot '
            + 'carries a cohort; otherwise metrics show values without a peer rank.' }),
      ]));
    }

    window.scrollTo({ top: 0 });
  } catch (err) {
    console.error(err);
    app.replaceChildren(errorScreen(symbol, `Unexpected error: ${err.message}`,
      el('pre', { class: 't-tiny softer', style: { whiteSpace: 'pre-wrap' }, text: String(err.stack || '') })));
  } finally {
    booting = false;
  }
}

applyTheme(currentTheme());
document.body.prepend(buildTopbar(go));
window.addEventListener('popstate', () => boot());
boot();
