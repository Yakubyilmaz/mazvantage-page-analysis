/* ==========================================================================
   Vanlior — the market rail

   A sticky column down the right of every page: the local index board, the
   reader's watchlist, the day's movers, and what reports next. TradingView's
   watchlist panel is the reference — the same idea that whatever page you are
   on, the market is still beside you.

   Each section's title opens the page behind it; the caret beside the title
   is what folds the section away. The button at the top right puts the whole
   rail away to a slim strip and brings it back, and that choice is remembered.

   ---------------------------------------------------------------------------
   One node, kept across navigations
   ---------------------------------------------------------------------------

   `app.js` rebuilds the whole tree on every navigation (`app.replaceChildren`),
   so a rail built inside `chrome()` would be thrown away and refetched every
   time the reader opened a page. This module returns a **singleton**: the same
   element is moved into each new layout rather than recreated, which
   `replaceChildren` does without touching the node's own state. The reader
   keeps their scroll position in the rail, the sections they collapsed, and
   the quotes already fetched.

   That also settles the cost question. The rail loads once per session and
   then only when the reader asks it to, rather than once per page view.

   ---------------------------------------------------------------------------
   Scrolling
   ---------------------------------------------------------------------------

   The rail is its own scroll container: `position: sticky`, a viewport's
   height, `overflow-y: auto`. That gives the behaviour asked for for free —
   a wheel over the rail scrolls the rail, a wheel anywhere else scrolls the
   page. The one thing it does not give for free is what happens when the rail
   hits its end: by default the browser hands the remaining scroll to the page,
   so a reader who reaches the bottom of their watchlist suddenly finds the
   article behind it moving. `overscroll-behavior: contain` in the stylesheet
   stops that, and is the reason the rail feels like a panel rather than a
   tall div.
   ========================================================================== */

import { el, isNum, ago } from './util.js';
import { fetchMarket, fetchCalendar, fetchBatchQuotes, hasApiKey } from './fmp.js';
import { normalizeHubQuote, loadHubSection, countryOf } from './markethub-data.js';
import { emptyState, instrumentMark, priceText, signed, changeOf, arrow, storedCountry } from './markethub-ui.js';

/** Rows in a mover block, and symbols the watchlist starts with. */
const ROWS = 6;
/** Indices in the market summary — the country's first five benchmarks. */
const SUMMARY_ROWS = 5;
const CALENDAR_ROWS = 6;
const WATCHLIST_KEY = 'mazvantage.watchlist';
const WATCHLIST_SEED = ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL'];
/** Sections the reader has collapsed, so the rail reopens as they left it. */
const COLLAPSED_KEY = 'mazvantage.rail.collapsed';
/** Whether the reader has put the whole rail away. Same prefix as every other
    key, deliberately: renaming stored keys would wipe what readers saved. */
const CLOSED_KEY = 'mazvantage.rail.closed';

/* The two states of the hide/show control: a panel with its right-hand column
   marked, and a chevron pointing the way the rail will move. */
const PANEL_ICON = {
  close: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>',
  open: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/><path d="m10 15-3-3 3-3"/>',
};
const panelIcon = (kind) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'mr__toggle-i');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PANEL_ICON[kind];
  return svg;
};

function readFlag(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeFlag(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* not stored this session */ }
}

/* ---- what the reader is watching ----------------------------------------
   Their own list, so it is stored rather than derived. Every read is wrapped:
   a private window or blocked site data throws on access, and a rail that
   cannot remember a watchlist should still show one. */

function readList(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
}
function writeList(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not stored this session */ }
}

export const watchlist = () => readList(WATCHLIST_KEY, WATCHLIST_SEED)
  .map((s) => String(s).toUpperCase()).filter(Boolean);

function setWatchlist(symbols) {
  writeList(WATCHLIST_KEY, [...new Set(symbols.map((s) => String(s).toUpperCase()))]);
}

/* ==========================================================================
   The rail
   ========================================================================== */

let instance = null;

/**
 * The rail, built once and handed back on every later call.
 *
 * `nav` is rebound each time rather than captured, because the object
 * `app.js` passes is recreated per navigation and the old one's `goSymbol`
 * would route from a page the reader has left.
 */
export function marketRail(nav = {}) {
  if (instance) { instance.setNav(nav); return instance; }

  let current = nav;
  const openSymbol = (row) => current.goSymbol?.(row.symbol || row);
  const goView = (...args) => current.goView?.(...args);

  const root = el('aside', { class: 'mr', 'aria-label': 'Market rail' });
  const body = el('div', { class: 'mr__body' });

  /* ---- a section, collapsible and remembered ---------------------------
     Two controls in the bar, because a title is where a reader clicks to go
     somewhere: the title opens the section's page, and the caret alone folds
     the section. One button doing both made "Watchlist" a fold rather than a
     way to the Watchlist page. */
  const collapsed = new Set(readList(COLLAPSED_KEY, []));
  function section(id, title, open) {
    const slot = el('div', { class: 'mr__slot' }, [emptyState('loading', '', true)]);
    const label = el('span', { class: 'mr__title', text: title });
    const fold = el('button', {
      type: 'button', class: 'mr__head', 'aria-expanded': String(!collapsed.has(id)),
      'aria-label': `Show or hide ${title}`,
      onclick: () => {
        const opening = collapsed.has(id);
        if (opening) collapsed.delete(id); else collapsed.add(id);
        writeList(COLLAPSED_KEY, [...collapsed]);
        fold.setAttribute('aria-expanded', String(opening));
        node.classList.toggle('is-collapsed', !opening);
      },
    }, [el('span', { class: 'mr__caret', 'aria-hidden': 'true', text: '⌄' })]);
    const node = el('section', {
      class: `mr__sec${collapsed.has(id) ? ' is-collapsed' : ''}`, 'data-section': id,
    }, [
      el('div', { class: 'mr__bar' }, [fold,
        el('button', { type: 'button', class: 'mr__name', onclick: open }, [label]),
        el('button', { type: 'button', class: 'mr__all', 'aria-label': `See all ${title}`, onclick: open }, [arrow()]),
      ]),
      slot,
    ]);
    // NOT `node.slot`: `Element.prototype.slot` is the shadow-DOM slot name, a
    // DOMString, so assigning an element to it silently stores "[object
    // HTMLDivElement]" and every later `.replaceChildren` throws.
    node.rowsHost = slot;
    node.setTitle = (text) => {
      label.textContent = text;
      fold.setAttribute('aria-label', `Show or hide ${text}`);
      node.querySelector('.mr__all').setAttribute('aria-label', `See all ${text}`);
    };
    return node;
  }

  /** One quote as a rail row: mark, symbol, last and change. An index leads
      with its name — "S&P 500" is what a reader looks for, not "GSPC". */
  const quoteRow = (row, pick = openSymbol) => {
    const symbol = String(row.symbol || '').replace(/^\^/, '');
    const name = row.shortName || row.name || '';
    const [main, sub] = row.kind === 'index' && name ? [name, symbol] : [symbol, name];
    return el('button', {
      type: 'button', class: 'mr__row', 'aria-label': `Open ${main}`,
      onclick: () => pick(row),
    }, [
      instrumentMark(row),
      el('span', { class: 'mr__id' }, [el('strong', { text: main }), el('small', { text: sub })]),
      el('span', { class: 'mr__v' }, [priceText(row), signed(changeOf(row))]),
    ]);
  };

  const fill = (sec, rows, status, message, pick) => {
    sec.rowsHost.replaceChildren(rows.length
      ? el('div', { class: 'mr__rows' }, rows.map((row) => quoteRow(row, pick)))
      : emptyState(status, message, true));
  };

  /* ---- the sections ---------------------------------------------------- */

  /* The market summary follows the country picked on the markets pages, read
     when the rail loads; World has no index board of its own, so it reads as
     the US. */
  const summaryCountry = () => countryOf(storedCountry() === 'WORLD' ? 'US' : storedCountry());
  const openIndices = () => goView('markets', 'indices', { country: summaryCountry().code });
  const summary = section('summary', `${summaryCountry().short} market summary`, openIndices);
  const watch = section('watchlist', 'Watchlist', () => goView('watchlist'));
  const gainers = section('gainers', 'Gainers', () => goView('markets', 'gainers'));
  const losers = section('losers', 'Losers', () => goView('markets', 'losers'));
  const active = section('active', 'Most active', () => goView('markets', 'active'));
  const calendar = section('calendar', 'Stocks calendar', () => goView('calendar'));

  /* The watchlist is the one section the reader edits, so it carries its own
     control. Adding is a symbol and a return; removing is the row's own ×. */
  const input = el('input', {
    type: 'search', class: 'mr__add', placeholder: 'Add symbol', 'aria-label': 'Add a symbol to the watchlist',
    maxlength: '12', autocomplete: 'off', spellcheck: 'false',
  });
  const addForm = el('form', { class: 'mr__addwrap', onsubmit: (e) => {
    e.preventDefault();
    const symbol = input.value.trim().toUpperCase();
    if (!symbol) return;
    setWatchlist([...watchlist(), symbol]);
    input.value = '';
    loadWatchlist();
  } }, [input]);
  watch.append(addForm);

  async function loadWatchlist() {
    const symbols = watchlist();
    if (!symbols.length) {
      watch.rowsHost.replaceChildren(emptyState('unavailable', 'Add a symbol to start a list.', true));
      return;
    }
    if (!hasApiKey()) {
      // Named, unpriced: the list is the reader's own and still worth showing.
      watch.rowsHost.replaceChildren(el('div', { class: 'mr__rows' }, symbols.map((symbol) =>
        withRemove(quoteRow(normalizeHubQuote({}, { symbol, kind: 'stock' })), symbol))));
      return;
    }
    const res = await fetchBatchQuotes(symbols).catch(() => null);
    const by = new Map((Array.isArray(res?.data) ? res.data : []).map((r) => [String(r.symbol).toUpperCase(), r]));
    watch.rowsHost.replaceChildren(el('div', { class: 'mr__rows' }, symbols.map((symbol) =>
      withRemove(quoteRow(normalizeHubQuote(by.get(symbol) || {}, { symbol, kind: 'stock' })), symbol))));
  }

  /** The row, plus the control that takes it off the list. */
  function withRemove(row, symbol) {
    const wrap = el('div', { class: 'mr__watch' }, [row]);
    wrap.append(el('button', {
      type: 'button', class: 'mr__rm', 'aria-label': `Remove ${symbol} from the watchlist`,
      text: '×',
      onclick: () => { setWatchlist(watchlist().filter((s) => s !== symbol)); loadWatchlist(); },
    }));
    return wrap;
  }

  /* An index is not a company, so its row opens the country's index board
     rather than a report. The board is the markets hub's own section and
     shares its cache, so a reader who has been to Markets pays nothing here. */
  async function loadSummary(refresh = false) {
    const country = summaryCountry();
    summary.setTitle(`${country.short} market summary`);
    if (!hasApiKey()) {
      summary.rowsHost.replaceChildren(emptyState('skipped', 'Connect FMP to see the market summary.', true));
      return;
    }
    const res = await loadHubSection('indices', { country: country.code, refresh });
    const rows = (res.data?.quotes || []).filter((row) => row.available).slice(0, SUMMARY_ROWS);
    fill(summary, rows, res.status, res.message || 'No index quotes returned.', openIndices);
  }

  async function loadMovers() {
    if (!hasApiKey()) {
      for (const sec of [gainers, losers, active]) {
        sec.rowsHost.replaceChildren(emptyState('skipped', 'Connect FMP to see the day’s movers.', true));
      }
      return;
    }
    const [g, l, a] = await Promise.all([
      fetchMarket('gainers'), fetchMarket('losers'), fetchMarket('active'),
    ]);
    const rows = (res) => (Array.isArray(res?.data) ? res.data : [])
      .map((r) => normalizeHubQuote(r, { kind: 'stock' })).filter((r) => r.available).slice(0, ROWS);
    fill(gainers, rows(g), g.status, g.message || 'No gainers returned.');
    fill(losers, rows(l), l.status, l.message || 'No losers returned.');
    fill(active, rows(a), a.status, a.message || 'No active listings returned.');
  }

  async function loadCalendar() {
    if (!hasApiKey()) {
      calendar.rowsHost.replaceChildren(emptyState('skipped', 'Connect FMP to see what reports next.', true));
      return;
    }
    const iso = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    const res = await fetchCalendar('earnings', iso(0), iso(7));
    const rows = (Array.isArray(res?.data) ? res.data : [])
      .filter((r) => r.symbol && /^[A-Z]{1,5}$/.test(r.symbol))
      .sort((x, y) => String(x.date).localeCompare(String(y.date)))
      .slice(0, CALENDAR_ROWS);
    calendar.rowsHost.replaceChildren(rows.length
      ? el('div', { class: 'mr__rows' }, rows.map((r) => el('button', {
        type: 'button', class: 'mr__row mr__row--cal', 'aria-label': `Open ${r.symbol}`,
        onclick: () => openSymbol(r),
      }, [
        instrumentMark({ symbol: r.symbol, kind: 'stock' }),
        el('span', { class: 'mr__id' }, [
          el('strong', { text: r.symbol }),
          el('small', { text: r.date ? ago(r.date) : '' }),
        ]),
        el('span', { class: 'mr__est', text: isNum(r.epsEstimated) ? `${r.epsEstimated.toFixed(2)} est` : '' }),
      ])))
      : emptyState(res.status, 'No reports scheduled in the next week.', true));
  }

  body.append(summary, watch, gainers, losers, active, calendar);
  body.id = 'market-rail-body';

  /* ---- put away and brought back ----------------------------------------
     Closing leaves a slim strip holding only this button, so the way back is
     where the reader left it rather than somewhere else on the page. The
     layout gives the strip its narrow column by itself (`:has(.mr.is-closed)`
     in the stylesheet): the rail is a singleton and the layout is rebuilt on
     every navigation, so a class on the rail is the one place the state can
     live without every page having to ask for it. */
  const toggle = el('button', { type: 'button', class: 'mr__toggle', 'aria-controls': body.id });
  function setClosed(closed) {
    root.classList.toggle('is-closed', closed);
    toggle.setAttribute('aria-expanded', String(!closed));
    const label = closed ? 'Show the market panel' : 'Hide the market panel';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.replaceChildren(panelIcon(closed ? 'open' : 'close'));
  }
  toggle.addEventListener('click', () => {
    const closed = !root.classList.contains('is-closed');
    writeFlag(CLOSED_KEY, closed);
    setClosed(closed);
    // A rail that started closed has not fetched anything yet.
    if (!closed) load();
  });

  root.append(
    el('div', { class: 'mr__top' }, [
      el('span', { class: 'mr__brand', text: 'Markets' }),
      el('button', { type: 'button', class: 'mr__refresh', 'aria-label': 'Refresh the rail',
        text: '↻', onclick: () => load(true) }),
      toggle,
    ]),
    body,
  );

  /* The rail is loaded once and then only when asked. It is on every page, so
     loading it per navigation would be the same four requests over and over. */
  let loaded = false;
  function load(force = false) {
    if (loaded && !force) return;
    loaded = true;
    /* A section that throws says so. Swallowing it leaves the rail showing
       "Loading market data" for the rest of the session, which reads as a slow
       network rather than as the bug it is. */
    const guard = (sec, run) => run().catch((error) => {
      sec.rowsHost.replaceChildren(emptyState('error', String(error?.message || error), true));
    });
    guard(summary, () => loadSummary(force));
    guard(watch, loadWatchlist);
    guard(gainers, loadMovers);
    guard(calendar, loadCalendar);
  }

  instance = root;
  root.setNav = (next) => { current = next || {}; };
  root.reload = () => load(true);
  /* Closed from a previous visit: stay closed, and fetch nothing until the
     reader opens it — a panel nobody is looking at should not cost requests. */
  const startClosed = readFlag(CLOSED_KEY);
  setClosed(startClosed);
  if (!startClosed) load();
  return root;
}
