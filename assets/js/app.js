/* ==========================================================================
   Maz Vantage — application shell

   Owns routing (?symbol=), the chrome around the report, the settings
   dialog, and the fetch → analyse → render pipeline.
   ========================================================================== */

import { el, esc, isNum, money, pct, price, trim, dec, fmtDate, ago, signClass } from './util.js';
import { loadDataset, fetchFor, mapLimited, getApiKey, setApiKey, hasApiKey, clearCache } from './fmp.js';
import { analyse, loadBenchmarks, saveBenchmarks, DEFAULT_BENCHMARKS } from './model.js';
import { loadSectorStats, MAX_SCORE } from './grading.js';
import { FACTOR_KEYS } from './factors.js';
import { renderFactor, renderRatings } from './gradeview.js';
import { snowflake, AXES } from './snowflake.js';
import { curSymbol } from './ui.js';
import {
  renderOverview, renderPriceHistory, renderAbout, renderDividend, renderManagement,
  renderOwnership, renderCompetitors, renderDataStatus,
} from './sections.js';

/* ---------- constants ----------------------------------------------------- */

const DEFAULT_SYMBOL = 'AAPL';
const THEME_KEY = 'mazvantage.theme';

/**
 * The product navigation, down the black rail.
 *
 * Inert on purpose: these are the destinations the wider product will have,
 * and wiring them to nothing would be worse than not wiring them at all. They
 * carry no href, so nothing here looks clickable that is not.
 */
const SIDE_NAV = [
  { label: 'Home', icon: 'dashboard' },
  { label: 'Maz Picks', icon: 'trending' },
  { label: 'Stock Screener', icon: 'search' },
  { label: 'Analysis reports', icon: 'file' },
  { label: 'Investment Ideas', icon: 'bulb' },
  { label: 'Sectors & Industries', icon: 'layers' },
];

/**
 * The tab strip under the report head.
 *
 * Also inert for now — no panel switching, no content. `Overview` reads as
 * the current tab because the report below it is the overview.
 */
const TABS = [
  'Overview', 'Analysis', 'Ratings', 'Financials', 'Statistics & Metrics',
  'Valuation', 'Growth', 'Financial Health', 'Profitability',
  'Analysts Forecast', 'Dividends', 'Shariah Compliance',
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
function currentTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }

/* ---------- icons --------------------------------------------------------- */

/* Rail icons are drawn as strokes rather than filled paths, which is what
   keeps them legible at 20px on black. `iconSvg` below fills, so these get
   their own renderer. */
const STROKE = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>'
    + '<rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
    + '<line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/>'
    + '<path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A5.06 5.06 0 0 1 8.91 14"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
};

function strokeIcon(kind) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'sidenav__icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = STROKE[kind] || '';
  return svg;
}

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

  return el('div', { class: 'utilbar' }, [
    el('div', { class: 'ticker-search' }, [iconSvg('search'), input]),
    el('div', { class: 'utilbar__spacer' }),
    themeBtn,
    gearBtn,
  ]);
}

/**
 * The black product rail: logo, six inert destinations, and — once there is a
 * report — the factor flake.
 *
 * The flake is the navigation. Its five wedges already scroll to their own
 * factor on click, so putting it in a rail that never leaves the screen turns
 * a 49,000px page into five destinations. `wireFlakeSpy` then keeps the wedge
 * you are reading lit.
 */
function buildSideNav() {
  return el('aside', { class: 'sidenav' }, [
    el('div', { class: 'sidenav__brand' }, [
      el('img', { class: 'sidenav__mark', src: 'assets/img/logo-mark.svg', alt: '' }),
      el('img', { class: 'sidenav__word', src: 'assets/img/logo-word.svg', alt: 'Vantage' }),
    ]),
    el('nav', { class: 'sidenav__nav' }, SIDE_NAV.map((item) =>
      el('span', { class: 'sidenav__item' }, [
        strokeIcon(item.icon),
        el('span', { text: item.label }),
      ]))),
  ]);
}

/**
 * The flake as a sticky column beside the report.
 *
 * In the page rather than in the rail: the rail is product chrome and the
 * flake is about the company on screen, so it belongs with the report it
 * navigates — and on a light page it can use the theme's own radar colours.
 */
function buildPageFlake(a) {
  const scores = Object.fromEntries(AXES.map((x) => [x.key, a.scores[x.key]?.score ?? null]));
  const host = el('div', { class: 'pageflake__host' });

  // `null` is a real state here — no factor in view — so the "already drawn"
  // guard needs a sentinel that no key can equal, or the first draw is skipped
  // and the rail renders an empty box.
  const NOTHING_DRAWN = Symbol('none');
  let current = NOTHING_DRAWN;
  const draw = (key) => {
    if (key === current) return;
    current = key;
    host.replaceChildren(snowflake(scores, { size: 260, highlight: key }));
  };
  draw(null);

  const block = el('aside', { class: 'pageflake' }, [
    el('p', { class: 'pageflake__title', text: 'Factor grades' }),
    host,
    el('p', { class: 'pageflake__hint', text: 'Click a wedge to jump to that factor.' }),
  ]);

  // Deferred: the sections do not exist until the report is in the document.
  requestAnimationFrame(() => wireFlakeSpy(draw));
  return block;
}

/**
 * Light up whichever factor is currently in view.
 *
 * Tracks every factor section and lights the topmost one still on screen,
 * rather than the last one to cross the trigger line — scrolling upward past
 * a boundary otherwise leaves the previous section lit.
 */
function wireFlakeSpy(draw) {
  const targets = AXES
    .map((ax) => ({ key: ax.key, node: document.getElementById(ax.anchor) }))
    .filter((t) => t.node);
  if (!targets.length) return;

  // A reading line a little below the sticky chrome. Exactly one factor
  // section can straddle it, so "which factor am I reading" has one answer
  // rather than a race between whatever happens to be intersecting.
  //
  // An earlier version asked an IntersectionObserver for everything in a band
  // and took the topmost. The section above always won that comparison — its
  // tail still overlapped the band — so the flake lit the previous factor the
  // whole way down the page.
  // 220 rather than something tighter to the chrome: `scroll-padding-top`
  // parks a jumped-to section at ~176px, so a line above that would sit in the
  // *previous* section the instant a wedge was clicked and light the wrong one.
  const LINE = 220;
  let queued = false;

  const update = () => {
    queued = false;
    let hit = null;
    for (const t of targets) {
      const r = t.node.getBoundingClientRect();
      if (r.top <= LINE && r.bottom > LINE) { hit = t; break; }
    }
    draw(hit ? hit.key : null);
  };

  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
}

/**
 * The stock's headline: who it is, what it costs, and two verdicts.
 *
 * Sits above the tab strip rather than inside the report, so it stays put
 * whichever tab is eventually selected — the price is true of the company,
 * not of the Overview.
 */
function buildPriceHead(a) {
  const f = a.facts;
  const grades = a.ds.get('grades') || {};
  const consensus = typeof grades.consensus === 'string' ? grades.consensus.trim() : '';
  const overall = a.scores?.overall;

  const up = isNum(f.change) && f.change > 0;
  const flat = !isNum(f.change) || f.change === 0;
  const changeText = isNum(f.change)
    ? `${up ? '+' : ''}${dec(f.change, 2)} (${pct(f.changePct ?? 0, { sign: true })})`
    : '';

  // Green for a buy, red for a sell, neutral for anything in between or
  // anything the vendor words differently.
  const word = consensus.toLowerCase();
  const tone = /strong buy|^buy/.test(word) ? 'good'
    : /sell/.test(word) ? 'bad'
    : /hold|neutral/.test(word) ? 'warn' : 'muted';

  const pills = el('div', { class: 'pricehead__pills' }, [
    consensus ? el('span', { class: `vpill vpill--${tone}`, text: consensus }) : null,
    isNum(overall?.score)
      ? el('span', { class: 'vpill vpill--score', text: `Score: ${dec(overall.score, 2)}` })
      : null,
  ]);

  return el('div', { class: 'pricehead' }, [
    el('div', { class: 'pricehead__id' }, [
      f.image ? el('img', { class: 'pricehead__logo', src: f.image, alt: '', loading: 'lazy' }) : null,
      el('div', {}, [
        el('h1', { class: 'pricehead__name', text: `${f.name} (${f.symbol})` }),
        el('p', { class: 'pricehead__meta', text: [f.exchangeFull || f.exchange, f.currency]
          .filter(Boolean).join(' \u00b7 ') }),
      ]),
    ]),
    el('div', { class: 'pricehead__quote' }, [
      el('span', { class: 'pricehead__price', text: price(f.price, curSymbol(f.currency)) }),
      changeText
        ? el('span', { class: `pricehead__change ${flat ? '' : up ? 'is-up' : 'is-down'}`.trim(), text: changeText })
        : null,
    ]),
    pills,
  ]);
}

/** The tab strip. Nothing switches yet; the report below is the Overview. */
function buildTabs() {
  return el('div', { class: 'tabs' }, [
    el('div', { class: 'tabs__strip' }, TABS.map((label, i) =>
      el('button', {
        type: 'button',
        class: `tab ${i === 0 ? 'is-active' : ''}`.trim(),
        'aria-current': i === 0 ? 'page' : null,
        text: label,
      }))),
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
      col('The five factors', ['Valuation', 'Growth', 'Profitability', 'Financial Health', 'Momentum']),
      col('Report', ['Vantage Flake', 'Sector-relative grades', 'Rewards & risks', 'Data status']),
      col('Data', ['Financial Modeling Prep', 'Trailing twelve month basis', 'Sector distributions in assets/data']),
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
    extras: {
      peerRatios: extras?.peerRatios || {},
      peerGrowth: extras?.peerGrowth || {},
      benchmarks: extras?.benchmarks || {},
    },
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
    ['equityRiskPremium', 'Equity risk premium', 'with beta, sets the cost of equity'],
    ['terminalGrowth', 'Terminal growth rate', 'perpetual growth in the DCF models'],
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
    el('p', { class: 'hint', text: 'Thresholds used by the fair-ratio model, the dividend notes and the management checks. Enter decimals, not percentages.' }),
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
   Loading / error states
   ========================================================================== */

function skeleton(symbol) {
  return el('div', { class: 'layout' }, [
    buildSideNav(),
    el('div', { class: 'content' }, [buildTopbar(go), el('div', { class: 'shell' }, [
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
    ])]),
  ]);
}

function errorScreen(symbol, message, extra) {
  return el('div', { class: 'layout' }, [
    buildSideNav(),
    el('div', { class: 'content' }, [buildTopbar(go), el('div', { class: 'shell' }, [
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
    ])]),
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
  const out = { peerRatios: {}, peerGrowth: {}, benchmarks: {} };

  // A snapshot can ship its own peer ratios and benchmark series so the
  // offline report is complete rather than half-empty.
  if (ds.snapshotExtras) {
    Object.assign(out.peerRatios, ds.snapshotExtras.peerRatios || {});
    Object.assign(out.peerGrowth, ds.snapshotExtras.peerGrowth || {});
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

    // A second call per peer, which doubles what the peer set costs. It buys
    // the only growth figure the ratios feed does not carry, and the "revenue
    // growth vs peers" line cannot be built from anything cheaper.
    const gs = await mapLimited(peers, (sym) => fetchFor('growth', sym), 4);
    peers.forEach((sym, i) => {
      const row = gs[i]?.status === 'ok' ? (gs[i].data || [])[0] : null;
      if (row) out.peerGrowth[sym] = row;
    });
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

    // First pass so we know the sector, then fetch the extras it implies and
    // grade against the sector table.
    let a = analyse(ds);
    const [extras, sectorStats] = await Promise.all([loadExtras(ds, a.facts), loadSectorStats()]);
    a = analyse(ds, {
      peerRatios: extras.peerRatios, peerGrowth: extras.peerGrowth,
      sectorStats, benchmarks: extras.benchmarks,
    });
    lastLoad = { ds, extras };

    const main = el('main', {}, [
      buildHeader(a),
      renderOverview(a),
      renderRatings(a),
      renderPriceHistory(a, extras),
      renderAbout(a),
      ...FACTOR_KEYS.map((k) => renderFactor(a, k)),
      renderDividend(a),
      renderManagement(a),
      renderOwnership(a),
      renderCompetitors(a),
      renderDataStatus(a),
      buildFooter(),
    ]);

    const shell = el('div', { class: 'shell' }, [buildPageFlake(a), main]);
    app.replaceChildren(el('div', { class: 'layout' }, [
      buildSideNav(),
      el('div', { class: 'content' }, [buildTopbar(go), buildPriceHead(a), buildTabs(), shell]),
    ]));

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
window.addEventListener('popstate', () => boot());
boot();
