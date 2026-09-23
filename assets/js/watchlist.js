/* ==========================================================================
   Maz Vantage — Watchlists

   A reader's own list of companies, in the same dense table the Quotes
   screener uses, with the same column sets: Overview through Cash flow. The
   table is the screener's, not a copy of it — `markettable.js` owns the
   sorting, the paging, the column tabs and the per-company loading, and this
   page owns only *which* companies are in it.

   ---------------------------------------------------------------------------
   Where the rows come from, and what they cost
   ---------------------------------------------------------------------------

   A watchlist is a handful of symbols rather than a screened universe, so
   there is no screener call to build it from. `batch-quote` takes fifty
   symbols in one request and returns the price, the session, the volume and
   the market value — which is the whole Overview tab, free, however many lists
   a reader keeps.

   Everything else is per company and therefore bought, exactly as it is on the
   Quotes screener: a tab that needs ratios, statements or a profile says what
   it will cost and waits to be asked.

   ---------------------------------------------------------------------------
   The Maz Quant column
   ---------------------------------------------------------------------------

   This report's own composite, on the reduced set the screens use: a handful
   of ratios per factor, each ranked against **the company's own sector
   distribution**. That is why the column costs a profile as well as the
   ratios — without the sector there is no distribution to rank against, and a
   number ranked against the wrong sector would be worse than no number.

   It is the lite score, not the full report grade. A company's own page runs
   the whole model; this ranks what two feeds can answer.

   ---------------------------------------------------------------------------
   Storage
   ---------------------------------------------------------------------------

   Lists live in `localStorage` under one key, because they are this reader's
   and this browser's. Every read and write is wrapped: a private window with
   storage blocked should show an empty list and a working page, not a broken
   one.
   ========================================================================== */

import { el, isNum } from './util.js';
import { fetchBatchQuotes, hasApiKey, logoUrl } from './fmp.js';
import { logo } from './ui.js';
import { marketTable, SCREENER_COLUMN_SETS, newTableState, fillBags } from './markettable.js';
import { loadSectorStats, sectorLookup, letterFor } from './grading.js';
import { scoreLite } from './model.js';
import { gradePill } from './gradeview.js';
import { emptyState, arrow } from './markethub-ui.js';

const KEY = 'mazvantage.watchlists';
const newId = () => `wl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A symbol as the vendor spells it: upper case, no spaces, no $ prefix. */
const cleanSymbol = (value) => String(value || '').trim().toUpperCase().replace(/^\$/, '').replace(/\s+/g, '');

/* ---------- the store ------------------------------------------------------ */

const emptyStore = () => ({ active: null, lists: [] });

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || !Array.isArray(raw.lists)) return emptyStore();
    const lists = raw.lists
      .filter((l) => l && typeof l.name === 'string')
      .map((l) => ({
        id: l.id || newId(),
        name: l.name,
        symbols: (l.symbols || []).map(cleanSymbol).filter(Boolean),
        // What the reader holds and what they purify on it. Keyed by symbol
        // rather than parallel to `symbols`, so removing a ticker and adding it
        // back does not shuffle someone's share count onto another company.
        holdings: (l.holdings && typeof l.holdings === 'object') ? l.holdings : {},
      }));
    return { lists, active: lists.some((l) => l.id === raw.active) ? raw.active : lists[0]?.id || null };
  } catch { return emptyStore(); }
}

function writeStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
  return store;
}

/* ---------- the Maz Quant column ------------------------------------------

   `get` returns the number so the column sorts like any other; `fmt` draws the
   pill. A row whose bags are not loaded yet returns null, which the table
   already knows to sink to the bottom whichever way the column is sorted. */
function quantScore(row, stats) {
  const bags = row.bags;
  if (!bags?.ratios || !bags?.metrics) return null;
  const lookup = sectorLookup(stats, bags.profile?.sector || null);
  if (!lookup.available) return null;
  const lite = scoreLite(bags, lookup);
  return isNum(lite?.score) ? lite.score : null;
}

/**
 * The column sets: the screener's own, with Overview carrying the score.
 *
 * Adding `profile`, `ratios` and `metrics` to Overview's bags is what turns it
 * into a bought tab — the same trade the Quotes screener makes to show a Wall
 * Street rating there. The free columns still draw immediately; the score
 * fills when the reader asks.
 */
function columnSets(stats) {
  const quote = {
    key: 'overview',
    label: 'Overview',
    bags: ['profile', 'ratios', 'metrics'],
    columns: [
      { key: 'marketCap', label: 'Market cap', num: true, get: (r) => r.marketCap, fmt: fmtMoney },
      { key: 'price', label: 'Price', num: true, get: (r) => r.price, fmt: fmtPrice },
      { key: 'changePercentage', label: 'Day', num: true, get: (r) => r.changePercentage, fmt: fmtChange },
      { key: 'volume', label: 'Volume', num: true, get: (r) => r.volume, fmt: (v) => fmtNum(v) },
      { key: 'turnover', label: 'Traded value', num: true,
        get: (r) => (isNum(r.volume) && isNum(r.price) ? r.volume * r.price : null), fmt: fmtMoney },
      { key: 'quant', label: 'Maz Quant', num: true,
        get: (r) => quantScore(r, stats),
        fmt: (v) => (isNum(v) ? gradePill(v, letterFor(v)) : na()) },
      { key: 'sector', label: 'Sector', get: (r) => r.bags?.profile?.sector, fmt: (v) => v || na() },
      { key: 'exchange', label: 'Exchange', get: (r) => r.exchange, fmt: (v) => v || na() },
    ],
  };
  return SCREENER_COLUMN_SETS.map((set) => (set.key === 'overview' ? quote : set));
}

const na = () => el('span', { class: 'subtle', text: 'n/a' });
const compact = (value, options = {}) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2, ...options }).format(value);
const fmtMoney = (v) => (isNum(v) ? el('span', { text: `US$${compact(v)}` }) : na());
const fmtPrice = (v) => (isNum(v) ? el('span', { text: Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : na());
const fmtNum = (v) => (isNum(v) ? el('span', { text: compact(v) }) : na());
const fmtChange = (v) => (isNum(v)
  ? el('span', { class: v > 0 ? 'is-up' : v < 0 ? 'is-down' : '', text: `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%` })
  : na());

/* ==========================================================================
   Purification

   Passing a compliance screen does not make the whole of a dividend
   permissible: a company can clear both balance-sheet ratios and still earn a
   slice of its income from interest or from an incidental non-compliant
   activity, and the convention is that the same slice of any dividend received
   is given away rather than kept. The arithmetic is three steps, and this app
   has two of them:

     1. **The impure fraction.** Non-compliant income ÷ total income.
     2. **Per share.** That fraction × the dividend per share received.
     3. **The amount.** Per share × shares held, annually or by the month.

   Steps two and three are data this page already has. Step one is not, and
   this is the part worth being exact about rather than papering over:

   FMP's income statement carries an `interestIncome` line, and it is populated
   for some filers and zero for others — Microsoft's last year reports $3.3bn,
   Apple's reports **zero**, which is a gap in the vendor's parsing rather than
   a finding about Apple's cash. A ratio computed from that field alone would
   therefore tell a reader "nothing to purify" precisely where the data is
   missing, which is the worst direction for this number to be wrong in.

   So the field is offered as a **starting figure where the filing reports
   one**, clearly labelled, and the cell is editable: the authoritative number
   is the company's own annual report, or the purification ratio an index
   provider publishes for its constituents. Neither is in this data plan. What
   the page does is the arithmetic, honestly, around whichever fraction the
   reader supplies.

   It is a calculation, not a ruling. Scholars differ on whether capital gains
   as well as dividends require purification, and on whether the fraction runs
   on income or on revenue.
   ========================================================================== */

/** Both feeds are per company, so the block says what it costs before loading. */
const PURIFY_BAGS = ['ratios', 'income'];
const MONTHS = 12;

/** The dividend a share paid over the trailing year. */
function dividendPerShare(row) {
  const ratios = row.bags?.ratios;
  if (!ratios) return null;
  if (isNum(ratios.dividendPerShareTTM)) return Number(ratios.dividendPerShareTTM);
  // The yield is a fraction of the price, so the two multiply back to the
  // payment. Used only when the per-share line itself is absent.
  if (isNum(ratios.dividendYieldTTM) && isNum(row.price)) return Number(ratios.dividendYieldTTM) * row.price;
  return null;
}

/** Interest income as a share of revenue, where the filing reports one. */
function reportedInterestShare(row) {
  const income = row.bags?.income;
  if (!income) return null;
  const interest = Number(income.interestIncome);
  const revenue = Number(income.revenue);
  if (!Number.isFinite(interest) || !Number.isFinite(revenue) || revenue <= 0) return null;
  return { share: (interest / revenue) * 100, reported: interest > 0, year: income.fiscalYear || income.date };
}

const money2 = (v) => `US$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The block under the table.
 *
 * `holdings` is mutated and written through `onSave` as the reader types, and
 * only the derived cells are redrawn — replacing the inputs on every keystroke
 * would take the caret with them.
 */
function purificationBlock(list, rows, onSave, onOpen, onShariah) {
  const host = el('section', { class: 'wl-purify', id: 'watchlist-purification' });
  let period = 'annual';
  const holdings = list.holdings;

  const draw = () => {
    const payers = rows.filter((r) => isNum(dividendPerShare(r)));
    const needsFill = rows.some((r) => PURIFY_BAGS.some((b) => !r.bags?.[b]));
    const per = period === 'annual' ? 1 : 1 / MONTHS;

    const heading = el('div', { class: 'wl-purify__head' }, [
      el('h2', { class: 'mh-heading mh-heading--section', text: 'Purification' }),
      el('div', { class: 'mh-ideas__rail' }, [['annual', 'Annual'], ['monthly', 'Monthly']].map(([id, label]) => el('button', {
        type: 'button', class: `mh-idea${period === id ? ' is-active' : ''}`, 'aria-pressed': String(period === id),
        text: label, onclick: () => { period = id; draw(); },
      }))),
    ]);

    const note = el('p', { class: 'mh-section-description', text: 'The share of a dividend that convention says is given away rather than kept. This page does the arithmetic — dividend per share, shares held, annually or by the month. The impure fraction itself is yours to set: the authoritative source is the company’s annual report or the purification ratio an index provider publishes, and neither is in this data plan.' });

    if (needsFill) {
      const progress = el('span', { class: 'mi-progress', 'aria-live': 'polite' });
      const button = el('button', {
        type: 'button', class: 'mi-load',
        text: `Load dividends and income lines for these ${rows.length} — two requests each`,
        onclick: async () => {
          button.disabled = true;
          button.textContent = 'Loading…';
          await fillBags(rows, PURIFY_BAGS, (done, total) => { progress.textContent = ` ${done} of ${total}…`; });
          progress.textContent = '';
          draw();
        },
      });
      host.replaceChildren(heading, note, el('div', { class: 'gp-consent' }, [button, progress]));
      return;
    }

    if (!payers.length) {
      host.replaceChildren(heading, note, el('p', { class: 'wl-purify__none', text: 'None of these companies paid a dividend over the trailing year, so there is nothing to purify from dividends. Scholars differ on whether capital gains require purification too; that question is not one this page answers.' }));
      return;
    }

    const totalCell = el('strong', { class: 'wl-purify__total-v' });
    const totalNote = el('span', { class: 'wl-purify__total-n' });
    const rowNodes = [];

    const recompute = () => {
      let total = 0;
      let counted = 0;
      for (const { row, cells } of rowNodes) {
        const held = holdings[row.symbol] || {};
        const dps = dividendPerShare(row);
        const shares = Number(held.shares);
        const impure = Number(held.impure);
        const received = isNum(dps) && Number.isFinite(shares) && shares > 0 ? dps * shares * per : null;
        const owed = received != null && Number.isFinite(impure) && impure > 0 ? received * (impure / 100) : null;
        cells.received.replaceChildren(received == null ? na() : el('span', { text: money2(received) }));
        cells.owed.replaceChildren(owed == null ? na() : el('strong', { text: money2(owed) }));
        cells.row.classList.toggle('is-idle', owed == null);
        if (owed != null) { total += owed; counted += 1; }
      }
      totalCell.textContent = counted ? money2(total) : '—';
      totalNote.textContent = counted
        ? `${period === 'annual' ? 'a year' : 'a month'}, across ${counted} ${counted === 1 ? 'holding' : 'holdings'}`
        : 'enter shares held and an impure fraction to see the amount';
    };

    const body = payers.map((row) => {
      const held = holdings[row.symbol] = holdings[row.symbol] || {};
      const dps = dividendPerShare(row);
      const reported = reportedInterestShare(row);
      if (held.impure == null && reported?.reported) held.impure = Number(reported.share.toFixed(3));

      const shares = el('input', { type: 'number', min: '0', step: 'any', class: 'wl-cell', value: held.shares ?? '',
        'aria-label': `Shares of ${row.symbol} held` });
      const impure = el('input', { type: 'number', min: '0', max: '100', step: 'any', class: 'wl-cell', value: held.impure ?? '',
        'aria-label': `Impure fraction for ${row.symbol}, per cent` });
      shares.addEventListener('input', () => { held.shares = shares.value === '' ? null : Number(shares.value); onSave(); recompute(); });
      impure.addEventListener('input', () => { held.impure = impure.value === '' ? null : Number(impure.value); onSave(); recompute(); });

      const cells = {
        received: el('td', { class: 'num' }),
        owed: el('td', { class: 'num' }),
      };
      const tr = el('tr', {}, [
        el('td', { class: 'mi-table__id' }, [
          el('button', { type: 'button', class: 'mkticker', text: row.symbol, onclick: () => onOpen(row.symbol) }),
          el('span', { class: 'wl-purify__co', text: row.companyName || '' }),
        ]),
        el('td', { class: 'num', text: isNum(dps) ? money2(dps * per) : 'n/a' }),
        el('td', { class: 'num' }, [shares]),
        cells.received,
        el('td', { class: 'num' }, [impure,
          el('span', { class: 'wl-purify__src', title: reported
            ? `Interest income ÷ revenue, ${reported.year}`
            : 'The income statement for this company is not loaded',
          text: reported ? (reported.reported ? `filing: ${reported.share.toFixed(2)}%` : 'filing reports none') : '' })]),
        cells.owed,
      ]);
      cells.row = tr;
      rowNodes.push({ row, cells });
      return tr;
    });

    host.replaceChildren(
      heading,
      note,
      el('div', { class: 'mi-table__scroll' }, [
        el('table', { class: 'mi-table wl-purify__table' }, [
          el('thead', {}, [el('tr', {}, [
            el('th', { scope: 'col', text: 'Company' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: period === 'annual' ? 'Dividend / share' : 'Dividend / share, monthly' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: 'Shares held' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: 'Dividend received' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: 'Impure %' }),
            el('th', { class: 'mi-table__n', scope: 'col', text: 'To purify' }),
          ])]),
          el('tbody', {}, body),
        ]),
      ]),
      el('div', { class: 'wl-purify__total' }, [
        el('span', { class: 'wl-purify__total-k', text: 'To purify' }),
        totalCell,
        totalNote,
      ]),
      el('button', { type: 'button', class: 'mh-see-all', onclick: onShariah },
        ['Check these against the compliance screen', arrow()]),
      el('p', { class: 'mh-panel-note', text: 'The dividend is the trailing twelve months as the vendor reports it, not a forecast, and the monthly view is that year divided by twelve rather than a schedule of payments. Where a filing reports an interest-income line, its share of revenue is offered as a starting figure — it covers interest only, not revenue from non-compliant activities, so it is a floor rather than the full fraction, and a company whose filing reports none is a gap in the data rather than a company with nothing to purify. This is a calculation, not a ruling.' }),
    );
    recompute();
  };

  draw();
  return host;
}

/* ---------- the page ------------------------------------------------------- */

export function renderWatchlistPage(sub, nav = {}) {
  let store = readStore();
  let stats = null;
  let rows = [];
  let status = { state: hasApiKey() ? 'loading' : 'skipped', message: '' };
  let disposed = false;
  let state = newTableState(columnSets(null));

  const page = el('main', { class: 'mh-page mi-page wl-page', id: 'watchlist' });
  const lists = el('nav', { class: 'mh-navigation wl-lists', 'aria-label': 'Watchlists' });
  const tools = el('div', { class: 'wl-tools' });
  const tabHost = el('div');
  const tableHost = el('div', { class: 'wl-table' });
  const meta = el('div', { class: 'mh-hero__meta' });
  const title = el('h1', { class: 'mi-title', text: 'Watchlist' });

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'WATCHLIST' }),
      title,
      meta,
    ]),
    lists, tools, tabHost, tableHost,
  );
  page.dispose = () => { disposed = true; };

  const activeList = () => store.lists.find((l) => l.id === store.active) || null;

  /* ---- loading the rows --------------------------------------------------
     One request per fifty symbols, and only for the list on screen: switching
     lists reloads, rather than holding every list's quotes in memory. */
  async function load() {
    const list = activeList();
    rows = [];
    if (!list || !list.symbols.length) { status = { state: 'empty', message: '' }; draw(); return; }
    if (!hasApiKey()) { status = { state: 'skipped', message: '' }; draw(); return; }
    status = { state: 'loading', message: '' };
    draw();
    const result = await fetchBatchQuotes(list.symbols);
    if (disposed) return;
    if (result.status !== 'ok') { status = { state: result.status, message: result.message || '' }; draw(); return; }
    const quoted = new Map((result.data || []).map((q) => [String(q.symbol).toUpperCase(), q]));
    /* A symbol the vendor does not know still gets a row, with its numbers
       blank: a watchlist that silently drops what it cannot price would leave
       the reader wondering where their ticker went. */
    rows = list.symbols.map((symbol) => {
      const q = quoted.get(symbol) || {};
      return {
        symbol,
        companyName: q.name || '',
        price: num(q.price), changePercentage: num(q.changePercentage ?? q.changesPercentage),
        volume: num(q.volume), marketCap: num(q.marketCap ?? q.mktCap),
        exchange: q.exchange || q.exchangeShortName || '',
        found: !!quoted.get(symbol),
        bags: {},
      };
    });
    status = { state: 'ok', message: '' };
    draw();
  }
  const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

  /* ---- the list tabs ------------------------------------------------------ */
  function drawLists() {
    lists.replaceChildren(
      ...store.lists.map((list) => el('button', {
        type: 'button', 'data-list': list.id,
        class: list.id === store.active ? 'is-active' : '',
        'aria-current': list.id === store.active ? 'page' : null,
        onclick: () => { if (list.id === store.active) return; store.active = list.id; writeStore(store); load(); },
      }, [list.name, el('span', { class: 'wl-count', text: String(list.symbols.length) })])),
      el('button', { type: 'button', class: 'wl-new', text: '+ New list', onclick: () => {
        const list = { id: newId(), name: `Watchlist ${store.lists.length + 1}`, symbols: [], holdings: {} };
        store.lists.push(list);
        store.active = list.id;
        writeStore(store);
        load();
      } }),
    );
  }

  /* ---- the toolbar -------------------------------------------------------- */
  function drawTools() {
    const list = activeList();
    if (!list) { tools.replaceChildren(); return; }
    const input = el('input', { type: 'search', class: 'wl-add', placeholder: 'Add a symbol — AAPL',
      'aria-label': 'Add a symbol to this watchlist' });
    const add = () => {
      const symbol = cleanSymbol(input.value);
      if (!symbol) return;
      if (!list.symbols.includes(symbol)) list.symbols.push(symbol);
      input.value = '';
      writeStore(store);
      load();
    };
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') add(); });

    tools.replaceChildren(
      el('div', { class: 'wl-add__row' }, [input, el('button', { type: 'button', class: 'wl-btn wl-btn--go', text: 'Add', onclick: add })]),
      el('div', { class: 'wl-tools__acts' }, [
        el('button', { type: 'button', class: 'wl-btn', text: 'Rename', onclick: () => {
          const name = el('input', { class: 'wl-add', value: list.name, 'aria-label': 'List name' });
          const done = () => { const value = name.value.trim(); if (value) { list.name = value; writeStore(store); } drawLists(); drawTools(); };
          name.addEventListener('keydown', (event) => { if (event.key === 'Enter') done(); });
          tools.replaceChildren(el('div', { class: 'wl-add__row' }, [name,
            el('button', { type: 'button', class: 'wl-btn wl-btn--go', text: 'Save', onclick: done })]));
          name.focus();
        } }),
        el('button', { type: 'button', class: 'wl-btn', text: 'Delete list', onclick: () => {
          // Deleting the last list leaves none rather than resurrecting a
          // default: an empty page says what to do next.
          store.lists = store.lists.filter((l) => l.id !== list.id);
          store.active = store.lists[0]?.id || null;
          writeStore(store);
          load();
        } }),
      ]),
    );
  }

  /* ---- the table ---------------------------------------------------------- */
  const identity = (row) => el('div', { class: 'wl-identity' }, [
    el('button', { type: 'button', class: 'ms-screen-identity', title: row.companyName || row.symbol,
      onclick: () => nav.goSymbol?.(row.symbol) }, [
      logo(logoUrl(row.symbol), row.symbol, { size: 'xs', fallback: 'letter' }),
      el('strong', { class: 'ms-screen-symbol', text: row.symbol }),
      el('span', { class: 'ms-screen-company', text: row.found ? (row.companyName || '') : 'Not found by FMP' }),
    ]),
    el('button', { type: 'button', class: 'wl-remove', title: `Remove ${row.symbol}`, 'aria-label': `Remove ${row.symbol}`,
      text: '×', onclick: () => {
        const list = activeList();
        if (!list) return;
        list.symbols = list.symbols.filter((s) => s !== row.symbol);
        writeStore(store);
        load();
      } }),
  ]);

  function tabs(sets) {
    return el('nav', { class: 'ms-screen-tabs', 'aria-label': 'Table views' }, sets.map((set) => el('button', {
      type: 'button', class: set.key === state.set ? 'is-active' : '',
      text: set.label,
      onclick: () => { if (set.key === state.set) return; state.set = set.key; state.page = 1; draw(); },
    })));
  }

  function draw() {
    const list = activeList();
    const sets = columnSets(stats);
    drawLists();
    drawTools();
    title.textContent = list ? list.name : 'Watchlists';
    meta.replaceChildren(el('span', { text: list
      ? `${list.symbols.length} ${list.symbols.length === 1 ? 'symbol' : 'symbols'} · kept in this browser`
      : 'No lists yet — make one and add the companies you follow.' }));

    /* The two empty states are first-run copy rather than `emptyState`: that
       component titles an empty result "No results available", which is right
       for a screen that returned nothing and wrong for a page waiting to be
       filled in. */
    if (!list) {
      tabHost.replaceChildren();
      tableHost.replaceChildren(el('div', { class: 'wl-blank' }, [
        el('h2', { text: 'No watchlists yet' }),
        el('p', { text: 'A watchlist is a list of companies you choose, priced together and gradeable in the same table the screener uses. Press “New list” above to start one.' }),
      ]));
      return;
    }
    if (!list.symbols.length) {
      tabHost.replaceChildren();
      tableHost.replaceChildren(el('div', { class: 'wl-blank' }, [
        el('h2', { text: `${list.name} is empty` }),
        el('p', { text: 'Add a symbol above — a ticker as FMP spells it, like AAPL, or MC.PA for a listing outside the US.' }),
      ]));
      return;
    }
    if (status.state !== 'ok') {
      tabHost.replaceChildren();
      tableHost.replaceChildren(emptyState(status.state === 'empty' ? 'ok' : status.state,
        status.message || (status.state === 'skipped' ? 'Quotes come from FMP. Add your API key in Settings.' : '')));
      return;
    }
    tabHost.replaceChildren(tabs(sets));
    tableHost.replaceChildren(
      el('p', { class: 'mh-section-description', text: 'Your own list, in the screener’s table. Overview is one request for the whole list; every other tab is per company and says so before it loads. Maz Quant is this report’s composite on the reduced set — a handful of ratios per factor against the company’s own sector distribution, not the full report grade.' }),
      marketTable({ rows, sets, state, showTabs: false, identity,
        emptyText: 'Nothing in this list matches that.' }),
      purificationBlock(list, rows, () => writeStore(store), (symbol) => nav.goSymbol?.(symbol),
        () => nav.goView?.('shariah', 'screener')),
    );
  }

  draw();
  load();
  // The distributions ship with the app, so this is a file read rather than a
  // request; the score column is blank until it lands and redraws.
  loadSectorStats().then((loaded) => { if (disposed) return; stats = loaded; draw(); }).catch(() => { /* graded columns stay blank */ });
  return page;
}
