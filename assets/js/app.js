/* ==========================================================================
   Maz Vantage — application shell

   Owns routing (?symbol=), the chrome around the report, the settings
   dialog, and the fetch → analyse → render pipeline.
   ========================================================================== */

import { el, esc, isNum, money, pct, price, trim, dec, fmtDate, ago, signClass } from './util.js';
import { loadDataset, fetchFor, mapLimited, getApiKey, setApiKey, hasApiKey, clearCache } from './fmp.js';
import { analyse, loadBenchmarks, saveBenchmarks, DEFAULT_BENCHMARKS } from './model.js';
import { loadSectorStats, MAX_SCORE } from './grading.js';
import { FACTOR_KEYS, FACTOR_BY_KEY } from './factors.js';
import { renderFactor, renderFactorTab, renderRatings, renderRatingsTab } from './gradeview.js';
import { snowflake, AXES } from './snowflake.js';
import { curSymbol } from './ui.js';
import {
  renderOverview, renderPriceHistory, renderAbout, renderDividend, renderManagement,
  renderOwnership, renderCompetitors, renderDataStatus,
} from './sections.js';
import { renderOverviewHead, renderOverviewTab } from './overview.js';
import { marketRail } from './marketrail.js';
import { renderFinancialsTab } from './financials.js';
import { renderStatisticsTab } from './statistics.js';
import { renderAlphaDesk } from './alphadesk.js';
import { renderAlphaTab } from './alphatab.js';
import { renderForecastTab } from './forecast.js';
import { renderDividendsTab } from './dividends.js';
import { renderShariahTab } from './shariah.js';
import { renderTranscriptsTab } from './transcripts.js';
import { renderNewsTab } from './news.js';
import { renderResearchTab } from './research.js';
import { renderPortfoliosPage, IDEA_PARAMS } from './portfolios.js';
import { renderCalendarPage } from './calendar.js';
import { buildRailNav, NAV_VIEWS, defaultSub, hasSub, labelFor, NAV_BY_VIEW, SECTOR_ETF, MARKET_ETF } from './nav.js';
import { renderMarketsPage } from './markets.js';
import { renderNewsroomPage } from './newsroom.js';
import { renderStocksPage } from './screens.js';
import { renderQuantPage } from './quant.js';
import { renderShariahDesk } from './shariahdesk.js';
import { renderEtfScreenerPage } from './etfscreener.js';
import { renderSectorsPage } from './sectorpage.js';
import { renderWatchlistPage } from './watchlist.js';
import { renderResearchHubPage } from './researchhub.js';
import { RESEARCH_PARAMS, queryToParams } from './taxonomy.js';
import { renderEarningsPage } from './earningsdesk.js';
import { renderHomePage } from './home.js';

/* ---------- constants ----------------------------------------------------- */

const DEFAULT_SYMBOL = 'AAPL';
const THEME_KEY = 'mazvantage.theme';

/**
 * The rail's second group: shortcuts, under the seven menus.
 *
 * Short. Stock Screener, Sectors & Industries and Investment Ideas moved into
 * the menus above when those were built, and listing a destination twice in
 * one rail makes both copies look like different places.
 *
 * Calendar is the exception and stays: it is reached often enough to be worth
 * one click from anywhere, and Research → Earnings is not an obvious place to
 * look for it.
 */
const SIDE_NAV = [
  { label: 'Maz Picks', icon: 'trending', view: 'quant', sub: 'screener' },
  { label: 'Calendar', icon: 'calendar', view: 'calendar' },
  { label: 'Analysis reports', icon: 'file' },
];
/* Home leads the rail rather than sitting in the shortcuts below it: it is the
   market's front page, not a shortcut to one part of the product. */
const HOME_ITEM = { label: 'Home', icon: 'dashboard', view: 'home' };

/**
 * The tab strip under the report head.
 *
 * Overview is the summary page in `overview.js`, Analysis is the whole
 * report, and the five factors each open their own view of the grade the
 * report already computed. The rest are destinations the wider product will
 * have and are marked `aria-disabled`, so a tab that does nothing says so
 * rather than swallowing the click.
 */
/* `Alpha Signal` sits directly after `Ratings`, which is where the report
   stops describing what the company *is* and starts describing what has
   recently happened to it. It is deliberately not next to the five factor
   tabs: it is not a factor, it does not grade on the 0-5 scale, and putting
   it inside that run would imply it was a sixth one. */
const TABS = [
  'Overview', 'Analysis', 'Research', 'Ratings', 'Alpha Signal', 'Financials',
  'Statistics & Metrics', 'Valuation', 'Growth', 'Financial Health',
  'Profitability', 'Momentum', 'Analysts Forecast', 'Dividends', 'Transcripts', 'News',
  'Shariah Compliance',
];

/**
 * Tab label -> factor key, for the five that open a factor.
 *
 * The labels are the product's, the keys are `factors.js`'s, and they differ
 * in one place: the factor keyed `health` is called Financial Health on the
 * strip and in every heading.
 */
const FACTOR_TABS = {
  Valuation: 'valuation',
  Growth: 'growth',
  'Financial Health': 'health',
  Profitability: 'profitability',
  Momentum: 'momentum',
};

/**
 * Tab label -> the renderer that builds its panel.
 *
 * Every one of these returns a card grid and takes `(a, nav)`, so the panel
 * builder does not need a branch each. Overview is not here — it also owns
 * the head above the tab strip — and neither are the five factors, which all
 * go through one renderer keyed by `FACTOR_TABS` below.
 */
const PLAIN_TABS = {
  Research: renderResearchTab,
  'Alpha Signal': renderAlphaTab,
  Ratings: renderRatingsTab,
  Financials: renderFinancialsTab,
  'Statistics & Metrics': renderStatisticsTab,
  'Analysts Forecast': renderForecastTab,
  Dividends: renderDividendsTab,
  Transcripts: renderTranscriptsTab,
  News: renderNewsTab,
  'Shariah Compliance': renderShariahTab,
};

/** Factor key -> the tab label that opens it. */
const TAB_FOR_FACTOR = Object.fromEntries(
  Object.entries(FACTOR_TABS).map(([label, key]) => [key, label]));

/** The tabs with a panel behind them. */
/**
 * The tabs with a panel behind them — which is now all thirteen.
 *
 * Kept as its own list rather than folded into `TABS` because `buildTabs`
 * still greys anything absent from it, and that is the mechanism a future
 * tab is added through: build the panel, add the label here.
 */
const LIVE_TABS = TABS;


/* `SECTOR_ETF` and `MARKET_ETF` — the two benchmarks returns are measured
   against — live in `nav.js` beside the sector list, because the sector pages
   read them too. */

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
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>'
    + '<line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
  bars: '<line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="4"/>'
    + '<line x1="18" y1="20" x2="18" y2="9"/>',
  news: '<path d="M4 5h11v15H5a1 1 0 0 1-1-1z"/><path d="M15 9h4v9a2 2 0 0 1-2 2h-2"/>'
    + '<line x1="7" y1="9" x2="12" y2="9"/><line x1="7" y1="13" x2="12" y2="13"/>'
    + '<line x1="7" y1="16" x2="10" y2="16"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  basket: '<path d="M3 9h18l-1.6 9.2A2 2 0 0 1 17.4 20H6.6a2 2 0 0 1-2-1.8z"/>'
    + '<path d="M8 9 10.5 4"/><path d="M16 9 13.5 4"/>'
    + '<line x1="10" y1="13" x2="10" y2="16"/><line x1="14" y1="13" x2="14" y2="16"/>',
  star: '<polygon points="12 3 14.9 9.2 21.5 10 16.7 14.6 18 21.1 12 17.9 6 21.1 7.3 14.6 2.5 10 9.1 9.2"/>',
  shield: '<path d="M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/>'
    + '<line x1="12" y1="18" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>',
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
/**
 * The rail.
 *
 * An item with a `view` is a real destination and renders as a button; the
 * rest stay inert spans, which is the same rule the tab strip follows — a
 * thing that looks clickable and is not is worse than a thing that plainly
 * is not built yet.
 */
function buildSideNav(current = null, nav = {}) {
  const menus = buildRailNav(current, nav, strokeIcon);
  const railItem = (item) => {
    if (!item.view) {
      return el('span', { class: 'sidenav__item', title: 'Not built yet' }, [
        strokeIcon(item.icon),
        el('span', { text: item.label }),
      ]);
    }
    const on = current?.view === item.view && (!item.sub || current?.sub === item.sub);
    return el('button', {
      type: 'button',
      class: `sidenav__item is-live ${on ? 'is-active' : ''}`.trim(),
      'aria-current': on ? 'page' : null,
      onclick: () => goView(item.view, item.sub || null),
    }, [
      strokeIcon(item.icon),
      el('span', { text: item.label }),
    ]);
  };
  // Into the menu group rather than above it, so it reads as the first item of
  // the navigation instead of a second navigation with one item in it.
  menus.prepend(railItem(HOME_ITEM));

  const shortcuts = el('nav', { class: 'sidenav__nav sidenav__nav--minor', 'aria-label': 'Shortcuts' },
    SIDE_NAV.map(railItem));

  const aside = el('aside', { class: 'sidenav' }, [
    el('button', {
      type: 'button', class: 'sidenav__brand', title: 'Home',
      onclick: () => goView('home'),
    }, [
      el('img', { class: 'sidenav__mark', src: 'assets/img/logo-mark.svg', alt: '' }),
      el('img', { class: 'sidenav__word', src: 'assets/img/logo-word.svg', alt: 'Vantage' }),
    ]),
    menus,
    el('div', { class: 'sidenav__rule' }),
    shortcuts,
  ]);

  // The rail owns the menus' document listeners now, so it owns tearing them
  // down. `chrome()` calls this before replacing the rail.
  aside.dispose = () => menus.dispose?.();
  return aside;
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

/**
 * The tab strip.
 *
 * Returns the strip and a `mark(tab)` that moves the current-tab styling, so
 * switching a tab does not rebuild the row of buttons underneath the pointer.
 */
function buildTabs(active, onSelect) {
  const buttons = TABS.map((label) => {
    const live = LIVE_TABS.includes(label);
    const b = el('button', {
      type: 'button',
      class: `tab ${live ? '' : 'is-inert'}`.trim(),
      'aria-disabled': live ? null : 'true',
      title: live ? null : 'Not built yet',
      text: label,
    });
    if (live) b.addEventListener('click', () => onSelect(label));
    return b;
  });

  const mark = (tab) => buttons.forEach((b) => {
    const on = b.textContent === tab;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  mark(active);

  // On the market canvas like everything below it: the strip sat on the report
  // canvas's own surface, which read as a beige band between a white head and
  // a white panel.
  return { node: el('div', { class: 'tabs mh-page' }, [el('div', { class: 'tabs__strip' }, buttons)]), mark };
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

/**
 * The chrome with no page behind it yet.
 *
 * The loading and error screens carry the same rail, utility bar and nav bar
 * as a finished page, so the chrome does not appear and shift once the report
 * lands. It builds its own nav adapter because there is no page nav yet.
 */
function chromeShell(body) {
  return chrome(null, navFor({}), el('div', {}, body));
}

function skeleton(symbol) {
  return chromeShell([el('div', { class: 'shell' }, [
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
  ])]);
}

function errorScreen(symbol, message, extra) {
  return chromeShell([el('div', { class: 'shell' }, [
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
  ])]);
}

/* ==========================================================================
   Boot
   ========================================================================== */

function symbolFromUrl() {
  return (new URLSearchParams(location.search).get('symbol') || DEFAULT_SYMBOL).toUpperCase();
}

/**
 * Which tab to open on.
 *
 * A hash decides it when no tab is named: every anchor in the app — the five
 * factors, the dividend section, the data status — lives on the Analysis tab,
 * so a link to one is a link into that tab rather than a broken jump on the
 * Overview.
 */
/* Punctuation out, not just whitespace: "Statistics & Metrics" would
   otherwise slug to `statistics-&-metrics` and reach the address bar
   percent-encoded. Every other label is unaffected. */
const tabSlug = (tab) => tab.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function tabFromUrl() {
  const q = (new URLSearchParams(location.search).get('tab') || '').toLowerCase();
  const named = LIVE_TABS.find((t) => tabSlug(t) === q);
  if (named) return named;
  return location.hash ? 'Analysis' : 'Overview';
}

/* `replaceState`, not `push`: flicking between two tabs is not five pages of
   history to back out through, but a reloaded or shared link should still
   land where the sender was. */
function setTabInUrl(tab) {
  const url = new URL(location.href);
  if (tab === LIVE_TABS[0]) url.searchParams.delete('tab');
  else url.searchParams.set('tab', tabSlug(tab));
  history.replaceState({ ...history.state, tab }, '', url);
}

function go(symbol) {
  const url = new URL(location.href);
  url.searchParams.set('symbol', symbol);
  // Searching a ticker means "show me that company", so it leaves whatever
  // non-report view the reader was on rather than searching inside it.
  url.searchParams.delete('view');
  VIEW_PARAMS.forEach((p) => url.searchParams.delete(p));
  history.pushState({ symbol }, '', url);
  boot();
}

/* ==========================================================================
   Views

   The app is a company report with tabs, plus — from the rail — a small
   number of pages that are not about one company at all. `?view=` picks
   between them; absent, the report is the view.
   ========================================================================== */

/**
 * Every page that is not a company report.
 *
 * `ideas` and `calendar` predate the nav bar and keep their own slugs; the
 * seven in `NAV_VIEWS` come from `nav.js`, which is the one place the menu
 * and the router agree on what a destination is called.
 *
 * `home` is in neither list on purpose. It is not in `NAV_PAGES` because
 * every page there renders from nothing and fetches afterwards, and Home
 * cannot: its top tile is a company, so it has to wait for the dataset. It
 * is dispatched further down `render`, after the load the report also pays
 * for.
 */
// `ideas` is no longer listed here: it is a rail menu now, so `NAV_VIEWS`
// already carries it and a second copy could only ever disagree.
const VIEWS = new Set(['home', 'calendar', ...NAV_VIEWS]);

/**
 * Query parameters that belong to a view rather than to the report.
 *
 * Cleared on every `goView`, so a filter left over from one page is never
 * carried into another. `RESEARCH_PARAMS` is the Research feed's own set —
 * imported rather than repeated, because a filter added to the taxonomy and
 * forgotten here would survive a navigation and quietly filter the next page.
 */
const VIEW_PARAMS = ['kind', 'week', 'country', 'collection', 'board', 'table', 'bench', 'sample', 'screen', 'days', 'sub', 'industry', ...IDEA_PARAMS, ...RESEARCH_PARAMS];

/** The ten nav pages and the renderer each one dispatches to. */
const NAV_PAGES = {
  markets:  renderMarketsPage,
  watchlist: renderWatchlistPage,
  news:     renderNewsroomPage,
  stocks:   renderStocksPage,
  // Funds got a menu of their own: same screener component, its own page, so
  // a fund collection is not filed under a menu called Stock Screener.
  etfs:     renderEtfScreenerPage,
  sectors:  renderSectorsPage,
  ideas:    renderPortfoliosPage,
  research: renderResearchHubPage,
  earnings: renderEarningsPage,
  quant:    renderQuantPage,
  alpha:    renderAlphaDesk,
  shariah:  renderShariahDesk,
};

function viewFromUrl() {
  const v = (new URLSearchParams(location.search).get('view') || '').toLowerCase();
  return VIEWS.has(v) ? v : null;
}

/**
 * Which section of a nav page to open.
 *
 * An unknown or absent `sub` falls back to the page's first section, so
 * `?view=markets` and a stale link to a section that has been renamed both
 * land somewhere real rather than on an empty page.
 */
function subFromUrl(view) {
  const raw = (new URLSearchParams(location.search).get('sub') || '').toLowerCase();
  return hasSub(view, raw) ? raw : defaultSub(view);
}

/**
 * Push a view onto the history. `null` goes back to the company report.
 *
 * The second argument is the section, for every nav page. It used to mean an
 * idea key when `view` was `ideas`, which was the one place this signature
 * meant two things; Investment Ideas became a rail menu with its own sections,
 * so a portfolio now travels in the third argument as `{ idea: key }` like any
 * other page state and the special case is gone.
 *
 * The optional third is a bag of extra query parameters for pages that carry
 * state beyond their section — today only the Research feed's filters. Every
 * existing caller passes two arguments and is unaffected.
 */
function goView(view, arg = null, params = null) {
  if (view === 'markets' && arg === 'country') {
    arg = 'overview';
    params = { ...params, country: 'US' };
  }
  const url = new URL(location.href);
  if (view) url.searchParams.set('view', view);
  else url.searchParams.delete('view');
  // Every view's own state, cleared on the way out. A calendar week left in
  // the query string behind an idea is dead weight in a link somebody shares.
  VIEW_PARAMS.forEach((p) => url.searchParams.delete(p));
  // `tab` belongs to the company report and means nothing on a view. `symbol`
  // stays: it is the company context a reader returns to, and `goSymbolTab`
  // reads it back out.
  url.searchParams.delete('tab');
  url.hash = '';
  if (arg && NAV_PAGES[view]) url.searchParams.set('sub', arg);

  // A third argument, for a page whose section is not the whole of its state.
  // The Research feed is the only one so far: its filters are the URL, so a
  // pill click is a navigation rather than a re-render, and the back button
  // steps through filters for free. Written after `VIEW_PARAMS` has cleared
  // the old ones, so a query replaces the previous one rather than merging
  // with it.
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      // `null` means "not set"; an empty string does not. The screener needs
      // `f=` present and empty to mean "this portfolio, with its rules
      // deliberately cleared", which is a different screen from `f=` absent.
      if (v == null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  // A push, not a replace: a page somebody arrived at deliberately is one the
  // browser's back button should leave.
  history.pushState({ view, arg }, '', url);
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

/**
 * The Calendar view.
 *
 * Mounted once and left alone. Unlike the report and unlike an idea, the page
 * owns its own fetching — a week is a request and the reader pages through
 * them — so re-booting the app on every arrow would tear down the filters
 * they had set to get there. It keeps `?view=calendar&kind=&week=` in step
 * with `replaceState` instead, which is enough to make the link shareable.
 */
/**
 * One of the seven nav pages.
 *
 * Every one of them is a `(view, sub)` pair, renders synchronously into a
 * node, and fetches whatever it needs afterwards — none of them pays for the
 * company dataset. `nav` is the same three ways out for all of them:
 * another page, a company, or a tab on the company report.
 */
/* Home boots the way the nav pages do. It used to wait for a company dataset,
   because it used to be about a company; the market's front page needs no
   symbol and should not pay for one before it draws. */
const BOOT_PAGES = { ...NAV_PAGES, home: renderHomePage };

function bootNavPage(app, view) {
  const sub = view === 'home' ? null : subFromUrl(view);
  const label = view === 'home' ? 'Home' : (labelFor(view, sub) || NAV_BY_VIEW[view]?.label || view);
  document.title = `${label} — Maz Vantage`;

  const nav = {
    goView: (v, arg, params) => goView(v, arg, params),
    openSettings: () => openSettings(),
    // The Research feed's filters travel here. Everything else on a page uses
    // `goView`; this is the one that also writes a query.
    goQuery: (v, arg, params) => goView(v, arg, queryToParams(params || {})),
    goSymbol: (sym) => go(sym),
    goSymbolTab: (tab, symbol) => goSymbolTab(tab, symbol),
    openSymbol: (sym) => go(sym),
    openIdeas: () => goView('ideas', 'all'),
    // A portfolio is page state, not a section, so it travels in the params
    // bag. `goIdea` is what the directory tiles and the portfolio switcher
    // call; `openIdea` is the older name the result views still use.
    goIdea: (key, extra = null) => goView('ideas', null, { idea: key, ...(extra || {}) }),
    openIdea: (key) => goView('ideas', null, { idea: key }),
    // An industry is page state for the same reason a portfolio is: the vendor
    // publishes about a hundred and thirty of them and renames them, so there
    // is no fixed list to slug against and the name travels in the query.
    goIndustry: (name) => goView('sectors', 'industry', { industry: name }),
  };

  app.replaceChildren(chrome({ view, sub }, nav,
    el('div', { class: 'shell shell--wide' }, [BOOT_PAGES[view](sub, nav)])));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/**
 * Leave whatever page this is and open a tab on the company report.
 *
 * The nav bar offers several of these — Stock Analysis, Valuation, Dividends
 * — and they are the one kind of destination that needs a symbol. There is
 * always one: `symbolFromUrl` falls back to the default ticker.
 */
function goSymbolTab(tab, symbol = null) {
  const url = new URL(location.href);
  url.searchParams.delete('view');
  VIEW_PARAMS.forEach((p) => url.searchParams.delete(p));
  // A caller can name the company — the Earnings library opens a transcript
  // for whichever row was clicked, not for whatever was last in the URL.
  url.searchParams.set('symbol', (symbol || symbolFromUrl()).toUpperCase());
  if (tab) url.searchParams.set('tab', tabSlug(tab));
  else url.searchParams.delete('tab');
  history.pushState({ tab }, '', url);
  boot();
}

/**
 * The frame every page shares: rail, utility bar, nav bar, body.
 *
 * `current` is the `(view, sub)` the bar should mark active, or null on the
 * company report. The previous bar's document listeners are torn down here —
 * the bar is rebuilt on every navigation, and without this each one would
 * leave a live click and keydown handler behind.
 */
let liveRail = null;
function chrome(current, nav, body) {
  document.querySelector('.mh-page')?.dispose?.();
  liveRail?.dispose?.();
  const rail = buildSideNav(current, nav);
  liveRail = rail;

  /* The market rail is a singleton that survives navigation, so it is moved
     into each new layout rather than rebuilt — see `marketrail.js`. It carries
     the market canvas's own class so it themes with the rest of the app. */
  const market = marketRail(navFor(nav));
  market.classList.add('mh-page');

  return el('div', { class: 'layout has-rail' }, [
    rail,
    el('div', { class: 'content' }, [buildTopbar(go), body]),
    market,
  ]);
}

/** The bar needs `goView`/`goSymbol`/`goSymbolTab`; older pages pass their own. */
function navFor(nav = {}) {
  return {
    ...nav,
    goView: nav.goView || ((v, arg, params) => goView(v, arg, params)),
    goQuery: nav.goQuery || ((v, arg, params) => goView(v, arg, queryToParams(params || {}))),
    goIdea: nav.goIdea || ((key, extra = null) => goView('ideas', null, { idea: key, ...(extra || {}) })),
    goIndustry: nav.goIndustry || ((name) => goView('sectors', 'industry', { industry: name })),
    goSymbol: nav.goSymbol || nav.openSymbol || ((sym) => go(sym)),
    goSymbolTab: nav.goSymbolTab || ((tab, symbol) => goSymbolTab(tab, symbol)),
  };
}

function bootCalendar(app) {
  document.title = 'Calendar — Maz Vantage';

  const nav = { openSymbol: (sym) => go(sym) };

  app.replaceChildren(chrome({ view: 'calendar' }, navFor(nav), renderCalendarPage(nav)));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

let booting = false;
// Named apart from the flake's own rAF `queued` below, which is function-local
// and unrelated.
let queuedBoot = null;

/**
 * Render whatever the URL currently says, one pass at a time.
 *
 * A pass can take seconds — 27 feeds on a cold cache — and the reader can
 * navigate inside that window: the rail, the ticker search and the browser's
 * own back button all land here. Dropping the second call, which is what a
 * bare `if (booting) return` did, left the address bar on the new page and
 * the screen on the old one.
 *
 * So a call that arrives mid-pass is remembered rather than discarded, and
 * runs once the pass in flight lands. Only the newest is kept: three clicks
 * during one load should end on the third, not replay all three.
 */
export async function boot(force = false) {
  if (booting) { queuedBoot = { force }; return; }
  booting = true;
  try {
    await render(force);
  } finally {
    booting = false;
    const next = queuedBoot;
    queuedBoot = null;
    if (next) boot(next.force);
  }
}

async function render(force) {
  const app = document.getElementById('app');

  // A view off the rail is not about a company, so it does not pay for a
  // dataset. It returns before the 27-feed load below ever starts.
  // A URL that names neither a view nor a company is somebody arriving at
  // the product rather than at a report, so it lands on Home. `?symbol=AAPL`
  // with no view still opens the report directly, which is what every link
  // this app writes for a company looks like.
  const params = new URLSearchParams(location.search);
  const view = viewFromUrl() || (!params.get('view') && !params.get('symbol') ? 'home' : null);

  if (view === 'calendar') {
    bootCalendar(app);
    return;
  }
  if (view === 'home' || NAV_PAGES[view]) {
    bootNavPage(app, view);
    return;
  }

  const symbol = symbolFromUrl();
  document.title = `${symbol} — Maz Vantage Stock Analysis`;

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

    // One banner per panel: a node lives in one place, and both tabs need to
    // say the report is running off the bundled snapshot.
    const banner = () => (ds.source !== 'snapshot' ? null : el('div', {
      class: `notice ${ds.liveError ? 'notice--error' : ''}`.trim(),
      style: { marginBottom: '16px' },
    }, [
      el('div', { html: ds.liveError
        ? `Live FMP requests all failed — <b>${esc(ds.liveError)}</b> — so the <b>bundled snapshot</b> is shown instead. `
          + 'Check the key in Settings.'
        : 'No API key configured — showing the <b>bundled snapshot</b>. Open Settings to connect your FMP key for live data on any ticker.' }),
    ]));

    /** How anything on any panel sends the reader somewhere else.
     *
     *  The first two switch tabs inside this report. The rest leave it: the
     *  rebuilt stock page has a breadcrumb into the markets pages, peer cards
     *  that open another company, and section headings that open the tab
     *  behind them, and all three need the app's own router. */
    const nav = {
      openAnalysis: (anchor) => selectTab('Analysis', anchor),
      openFactor: (key) => selectTab(TAB_FOR_FACTOR[key] || 'Analysis',
        TAB_FOR_FACTOR[key] ? null : FACTOR_BY_KEY[key]?.anchor),
      goView: (v, arg, params) => goView(v, arg, params),
      goSymbol: (sym) => go(sym),
      // A tab on *this* report is a panel switch, not a navigation: rebuilding
      // the page to move between its own tabs would throw away every panel
      // already built. Only another company's tab goes through the router.
      goSymbolTab: (tab, symbol = null) => (
        !symbol || String(symbol).toUpperCase() === String(a.facts.symbol).toUpperCase()
          ? selectTab(tab)
          : goSymbolTab(tab, symbol)),
      openSettings: () => openSettings(),
    };

    /* Every panel is mounted on the market canvas.
     *
     * `.mh-page` is what carries that canvas's tokens, and `reportcanvas.css`
     * remaps the report's own token set onto them inside it — so a panel
     * built from the shared `ui.js` primitives adopts the canvas without a
     * line of its rendering code changing. `--flush` because the shell below
     * already owns the page gutter. */
    const CANVAS = 'mh-page mh-page--flush';
    const buildPanel = (tab) => {
      if (tab === 'Overview') {
        // No flake column: the Overview is a grid of sections rather than a
        // long scroll through five of them, so there is nothing to spy on.
        return el('div', { class: `shell shell--wide ${CANVAS}` }, [banner(), renderOverviewTab(a, extras, nav)]);
      }
      const plain = PLAIN_TABS[tab];
      if (plain) return el('div', { class: `shell shell--wide ${CANVAS}` }, [banner(), plain(a, nav)]);
      if (FACTOR_TABS[tab]) {
        return el('div', { class: `shell shell--wide ${CANVAS}` },
          [banner(), renderFactorTab(a, FACTOR_TABS[tab], nav)]);
      }
      const main = el('main', {}, [
        banner(),
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
      return el('div', { class: `shell ${CANVAS}` }, [buildPageFlake(a), main]);
    };

    // Panels are built on first visit and kept: the Analysis is ~50,000px of
    // charts, and rebuilding it every time someone glances at the Overview
    // would throw away every range selector and model picker they had set.
    const panels = {};
    const headSlot = el('div', {});
    const panelSlot = el('div', {});
    let current = null;

    function selectTab(tab, anchor) {
      if (tab !== current) {
        current = tab;
        tabs.mark(tab);
        headSlot.replaceChildren(tab === 'Overview'
          ? renderOverviewHead(a, nav)
          : el('div', { class: `${CANVAS} rc-head` }, [buildPriceHead(a)]));
        if (!panels[tab]) panels[tab] = buildPanel(tab);
        panelSlot.replaceChildren(panels[tab]);
        setTabInUrl(tab);
      }
      // Synchronous, and deliberately not behind a `requestAnimationFrame`:
      // the panel is in the document by the line above, `scrollIntoView`
      // forces the layout it needs itself, and a hidden tab never gets an
      // animation frame at all — so deferring it would silently drop the
      // jump whenever the page was in the background.
      //
      // Instant, not smooth: `html` sets `scroll-behavior: smooth` for
      // in-page anchors, and the Momentum section sits about 32,000px down
      // the Analysis tab. Animating that is seconds of blur on the way to a
      // section the reader has already chosen.
      if (anchor) {
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'instant', block: 'start' });
      } else {
        // `behavior: 'instant'` literally. The guard this replaces asked
        // `'instant' in window`, which is never true — there is no global of
        // that name — so it always fell through to 'auto', and 'auto' means
        // "use the CSS", which `html { scroll-behavior: smooth }` sets to
        // smooth. Switching tabs then glided the page to the top instead of
        // starting there.
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }

    const tabs = buildTabs(tabFromUrl(), (t) => selectTab(t));

    app.replaceChildren(chrome(null, navFor(nav),
      el('div', {}, [headSlot, tabs.node, panelSlot])));

    selectTab(tabFromUrl(), location.hash ? location.hash.slice(1) : null);
  } catch (err) {
    console.error(err);
    app.replaceChildren(errorScreen(symbol, `Unexpected error: ${err.message}`,
      el('pre', { class: 't-tiny softer', style: { whiteSpace: 'pre-wrap' }, text: String(err.stack || '') })));
  }
}

/* ---------- start --------------------------------------------------------- */

applyTheme(currentTheme());
window.addEventListener('popstate', () => boot());
boot();
