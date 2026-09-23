/* ==========================================================================
   Maz Vantage — the ETF tables board

   The component that draws the catalogue in `etf-tables.js`: a category rail,
   a search box that reads the whole catalogue at once, and one sortable table
   per group with the session and five return windows beside each fund.

   ---------------------------------------------------------------------------
   Search is the front door, and it searches everything
   ---------------------------------------------------------------------------

   Seventeen boards is more than anyone will page through, so the search box is
   not a filter on the open board — it is a lookup over the whole catalogue,
   and a match tells you which board the fund is filed on as well as what it
   did. Typing `gold` finds GLD on Key markets *and* on Commodities and the
   gold miners on Themes, because "where else is this" is most of the question.

   It costs nothing until a key is pressed: the catalogue is static, the filter
   is a string match in the browser, and only the matched symbols are quoted.

   ---------------------------------------------------------------------------
   One board loads at a time
   ---------------------------------------------------------------------------

   Opening a category fetches that category's symbols and nothing else, two
   feeds for the lot. A board already fetched is kept, so moving back and forth
   across the rail costs one round of requests per board per visit rather than
   one per click.
   ========================================================================== */

import { el, isNum } from './util.js';
import { hasApiKey } from './fmp.js';
import { emptyState, instrumentMark, carousel } from './markethub-ui.js';
import {
  ETF_TABLE_CATEGORIES, ETF_TABLE_INDEX, CATALOGUE_SIZE,
  etfTableCategory, categorySymbols, loadFundRows,
} from './etf-tables.js';

/* ---------- cells ----------------------------------------------------------- */

const dec2 = (value, dp = 2) => (isNum(value)
  ? value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : null);

/** A signed percentage, coloured. The feed returns these already in per cent. */
function changeCell(value) {
  if (!isNum(value)) return el('span', { class: 'etb-na', text: '—' });
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return el('span', {
    class: `etb-pc ${value > 0 ? 'is-up' : value < 0 ? 'is-down' : ''}`.trim(),
    text: `${sign}${dec2(Math.abs(value))}%`,
  });
}

/**
 * Low, high, and where the price sits between them.
 *
 * The bar is the point: a number pair says what the range was, the marker says
 * whether today is at the top of it or the bottom, which is the thing a reader
 * scanning forty rows is actually looking for. `aria-label` carries the same
 * sentence for anyone not reading the bar.
 */
function rangeCell(low, high, price) {
  if (!isNum(low) || !isNum(high) || high <= low) {
    return el('span', { class: 'etb-na', text: '—' });
  }
  const at = isNum(price) ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)) : null;
  return el('div', {
    class: 'etb-range',
    role: 'img',
    'aria-label': at == null
      ? `Range ${dec2(low)} to ${dec2(high)}`
      : `Range ${dec2(low)} to ${dec2(high)}, currently ${Math.round(at)}% of the way up it`,
  }, [
    el('span', { class: 'etb-range__end', text: dec2(low) }),
    el('span', { class: 'etb-range__track' }, [
      at == null ? null : el('i', { class: 'etb-range__dot', style: { left: `${at}%` } }),
    ]),
    el('span', { class: 'etb-range__end', text: dec2(high) }),
  ]);
}

/* ---------- columns ---------------------------------------------------------
   `get` is what the sort reads and `cell` is what the row prints, which is the
   only way a column showing a bar can still be sortable. `order` is the
   catalogue's own sequence: the default, and the one sort a reader can get
   back to once they have sorted by something else. */

const COLUMNS = [
  { key: 'price', label: 'Price', num: true, get: (r) => r.row?.price,
    cell: (r) => (isNum(r.row?.price) ? el('span', { class: 'etb-price', text: dec2(r.row.price) }) : el('span', { class: 'etb-na', text: '—' })) },
  { key: 'd1', label: 'Today', num: true, get: (r) => r.row?.d1, cell: (r) => changeCell(r.row?.d1) },
  { key: 'd5', label: '5D', num: true, get: (r) => r.row?.d5, cell: (r) => changeCell(r.row?.d5) },
  { key: 'm1', label: '1M', num: true, get: (r) => r.row?.m1, cell: (r) => changeCell(r.row?.m1) },
  { key: 'ytd', label: 'YTD', num: true, get: (r) => r.row?.ytd, cell: (r) => changeCell(r.row?.ytd) },
  { key: 'y1', label: '1Y', num: true, get: (r) => r.row?.y1, cell: (r) => changeCell(r.row?.y1) },
  { key: 'y3', label: '3Y', num: true, get: (r) => r.row?.y3, cell: (r) => changeCell(r.row?.y3) },
  { key: 'dayRange', label: 'Day range', get: (r) => r.row?.dayHigh,
    cell: (r) => rangeCell(r.row?.dayLow, r.row?.dayHigh, r.row?.price) },
  { key: 'yearRange', label: '52-week range', get: (r) => r.row?.yearHigh,
    cell: (r) => rangeCell(r.row?.yearLow, r.row?.yearHigh, r.row?.price) },
];

const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((column) => [column.key, column]));

/* ==========================================================================
   The board
   ========================================================================== */

/**
 * The ETF tables, as one node.
 *
 * `onPick` receives a row shaped like a quote — the ETFs page passes its own
 * instrument dialog, so clicking a fund opens the same chart every other
 * ranking on that canvas opens. `onNavigate` is optional and is how the board
 * points at the screener for the collections it cannot name by hand.
 *
 * `dispose()` drops the in-flight generation counter so a load that lands
 * after the page has been left writes nothing.
 */
export function etfTablesBoard({ onPick = null, onNavigate = null, onBoard = null, initial = null } = {}) {
  const root = el('div', { class: 'etb' });
  let disposed = false;
  let current = etfTableCategory(initial);
  let query = '';
  let searchTimer = null;

  /* One entry per category: the rows it loaded, and whether a load is in
     flight. A board already fetched is not fetched again — the quote cache
     would serve it anyway, but not re-rendering is cheaper than re-rendering
     from cache. */
  const boards = new Map();
  /* Search results are their own board, keyed on the query, for the same
     reason: retyping a query that was just run should not re-fetch it. */
  const searched = new Map();

  /* ---- chrome ------------------------------------------------------------ */

  const search = el('input', {
    type: 'search', class: 'etb-search__input', id: 'etf-table-search',
    placeholder: `Search ${CATALOGUE_SIZE} funds — symbol, name or theme`,
    autocomplete: 'off', spellcheck: 'false',
    'aria-describedby': 'etf-table-search-help',
  });
  const searchHelp = el('p', {
    class: 'etb-search__help', id: 'etf-table-search-help',
    text: 'Searches every board at once. Results say which board each fund is filed on.',
  });
  const clear = el('button', {
    type: 'button', class: 'etb-search__clear', text: 'Clear', hidden: true,
    onclick: () => { search.value = ''; setQuery(''); search.focus(); },
  });

  const tabs = ETF_TABLE_CATEGORIES.map((category) => el('button', {
    type: 'button', role: 'tab', 'data-category': category.id,
    class: `etb-tab${category.id === current.id ? ' is-active' : ''}`,
    'aria-selected': String(category.id === current.id),
    'aria-controls': 'etf-table-panel',
    tabIndex: category.id === current.id ? 0 : -1,
    title: category.blurb,
    text: category.short || category.title,
    onclick: () => setCategory(category.id),
  }));

  const rail = carousel(tabs, { label: 'ETF boards', className: 'etb-tabs' });
  rail.querySelector('.mh-rail')?.setAttribute('role', 'tablist');

  /* Arrow keys inside the rail, one tab stop for the whole of it — the same
     rule the report's own tab strip follows. */
  rail.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1
      : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : 0;
    if (!step) return;
    event.preventDefault();
    const at = tabs.findIndex((tab) => tab.dataset.category === current.id);
    const next = step === 'first' ? 0 : step === 'last' ? tabs.length - 1
      : (at + step + tabs.length) % tabs.length;
    tabs[next].focus();
    setCategory(tabs[next].dataset.category);
  });

  const heading = el('div', { class: 'etb-intro' });
  const panel = el('div', {
    class: 'etb-panel', id: 'etf-table-panel', role: 'tabpanel', tabIndex: -1,
  });
  const status = el('p', { class: 'etb-status', 'aria-live': 'polite' });

  root.append(
    el('div', { class: 'etb-search' }, [
      el('label', { class: 'etb-search__label', for: 'etf-table-search', text: 'Find a fund' }),
      el('div', { class: 'etb-search__row' }, [search, clear]),
      searchHelp,
    ]),
    el('p', { class: 'etb-scope' }, [
      el('b', { text: 'US-listed funds, unless a row says otherwise.' }),
      ' A board is a named list rather than a screen of one market, so these read the same '
      + 'whichever country this page is scoped to — country is what the Overview tab above and '
      + 'the screener’s own picker change, not this tab. Shariah is the one board that leaves '
      + 'the United States, because most of the world’s Shariah funds are listed elsewhere; '
      + 'every row on it that does carries its exchange and its currency.',
    ]),
    rail, heading, status, panel,
  );

  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    // Long enough that typing a five-letter ticker is one lookup rather than
    // five, short enough that it still feels like it answers as you type.
    searchTimer = setTimeout(() => setQuery(search.value), 220);
  });
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !search.value) return;
    search.value = '';
    setQuery('');
  });

  /* ---- what is on screen -------------------------------------------------- */

  function setCategory(id) {
    const next = etfTableCategory(id);
    if (next.id === current.id && !query) return;
    current = next;
    // The open board goes back into the address bar, so a link to one is a
    // link to that one — which is what the Shariah menu's entry relies on.
    onBoard?.(current.id);
    if (query) { query = ''; search.value = ''; clear.hidden = true; }
    markTabs();
    drawCategory();
  }

  /**
   * Mark the open board on the rail, and bring it into view.
   *
   * The rail scrolls, and a board can be opened from outside it — a link
   * straight to Shariah, or the menu entry that opens it. Marking a chip that
   * has scrolled out of sight leaves the rail saying nothing about where you
   * are, so the mark and the scroll happen together. `block: 'nearest'` keeps
   * it to the rail's own axis: a tab strip should never scroll the page.
   */
  function markTabs({ reveal = true } = {}) {
    let active = null;
    for (const tab of tabs) {
      const on = tab.dataset.category === current.id;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) active = tab;
    }
    if (reveal) revealTab(active);
  }

  /* The rail's scroll arrows sit over its two edges, so a chip brought flush
     against one is half under a button. `nearest` does exactly that, so the
     reveal only fires when the chip is actually out of reach — measured
     against the track inset by an arrow's width — and centres it when it
     does. A chip already comfortably in view is left where it is, because
     scrolling the strip under someone who can already see their choice is
     worse than not scrolling at all. */
  const ARROW = 46;
  function revealTab(active) {
    const track = rail.querySelector('.mh-rail');
    if (!active || !track || !track.clientWidth) return;
    const box = track.getBoundingClientRect();
    const chip = active.getBoundingClientRect();
    if (chip.left >= box.left + ARROW && chip.right <= box.right - ARROW) return;
    active.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function setQuery(raw) {
    query = String(raw || '').trim();
    clear.hidden = !query;
    if (!query) { drawCategory(); return; }
    drawSearch();
  }

  /** The catalogue rows a query matches, capped so one letter is not a board. */
  const LIMIT = 80;
  function matches() {
    const needle = query.toLowerCase();
    const hits = ETF_TABLE_INDEX.filter((entry) =>
      entry.symbol.toLowerCase().includes(needle)
      || entry.label.toLowerCase().includes(needle)
      || entry.group.toLowerCase().includes(needle)
      || entry.category.toLowerCase().includes(needle)
      || (entry.hint || '').toLowerCase().includes(needle));
    /* An exact ticker first, then a ticker that starts with the query, then
       everything else in catalogue order. Typing `ETH` should not bury the
       ether trust under every fund whose group name contains the letters. */
    const rank = (entry) => (entry.symbol.toLowerCase() === needle ? 0
      : entry.symbol.toLowerCase().startsWith(needle) ? 1
        : entry.label.toLowerCase().startsWith(needle) ? 2 : 3);
    return hits.sort((a, b) => rank(a) - rank(b)).slice(0, LIMIT);
  }

  /* ---- drawing ------------------------------------------------------------ */

  function drawCategory() {
    const category = current;
    /* `replaceChildren` stringifies a null argument into the literal word, so
       an optional child is filtered out rather than passed through — `el` does
       this for its own children and this is the same rule one level up. */
    heading.replaceChildren(...[
      el('h2', { class: 'etb-intro__t', text: category.title }),
      el('p', { class: 'etb-intro__b', text: category.blurb }),
      category.note ? el('p', { class: 'etb-intro__n', text: category.note }) : null,
    ].filter(Boolean));
    const board = boards.get(category.id);
    if (board?.state === 'ready') { paintCategory(category, board); return; }
    status.textContent = `Loading ${categorySymbols(category).length} funds…`;
    panel.replaceChildren(skeleton(category));
    if (board?.state === 'loading') return;
    boards.set(category.id, { state: 'loading' });
    loadFundRows(categorySymbols(category)).then((result) => {
      if (disposed) return;
      boards.set(category.id, { state: 'ready', ...result });
      if (current.id === category.id && !query) paintCategory(category, boards.get(category.id));
    }).catch((error) => {
      if (disposed) return;
      boards.set(category.id, { state: 'ready', rows: new Map(), status: 'error', message: String(error?.message || error) });
      if (current.id === category.id && !query) paintCategory(category, boards.get(category.id));
    });
  }

  function paintCategory(category, board) {
    const missing = categorySymbols(category).filter((symbol) => !board.rows.has(symbol));
    status.replaceChildren(...coverageLine(category, board, missing));
    if (board.status !== 'ok' && !board.rows.size) {
      panel.replaceChildren(emptyState(board.status, board.message || 'These funds could not be quoted.'));
      return;
    }
    panel.replaceChildren(...category.groups.map((group) => groupTable({
      title: group.title,
      note: group.note,
      entries: group.funds.map(([label, symbol, hint], index) => ({
        label, symbol, sub: hint || null, order: index, row: board.rows.get(symbol) || null,
      })),
    })));
  }

  function drawSearch() {
    const hits = matches();
    heading.replaceChildren(
      el('h2', { class: 'etb-intro__t', text: `Search: ${query}` }),
      el('p', { class: 'etb-intro__b', text: hits.length
        ? 'Every board searched. Each result says where it is filed — open that board for the '
          + 'funds beside it.'
        : 'No fund in the catalogue matches that. The ETF screener searches all five thousand '
          + 'listings rather than these seventeen boards.' }),
    );
    if (!hits.length) {
      status.textContent = '';
      panel.replaceChildren(el('div', { class: 'etb-empty' }, [
        emptyState('ok', 'Try a ticker, a holding such as “gold” or “semiconductor”, or a board name.', true),
        onNavigate ? el('button', {
          type: 'button', class: 'etb-cta', text: 'Open the ETF screener →',
          onclick: () => onNavigate('screener'),
        }) : null,
      ]));
      return;
    }

    const key = query.toLowerCase();
    const cached = searched.get(key);
    const paint = (board) => {
      if (disposed) return;
      status.textContent = `${hits.length}${hits.length === LIMIT ? '+' : ''} match${hits.length === 1 ? '' : 'es'} across ${new Set(hits.map((h) => h.categoryId)).size} board${new Set(hits.map((h) => h.categoryId)).size === 1 ? '' : 's'}`;
      panel.replaceChildren(...[...groupBy(hits)].map(([categoryId, entries]) => groupTable({
        title: etfTableCategory(categoryId).title,
        onTitle: () => setCategory(categoryId),
        entries: entries.map((entry, index) => ({
          label: entry.label, symbol: entry.symbol, order: index,
          sub: entry.hint ? `${entry.group} · ${entry.hint}` : entry.group,
          row: board.rows.get(entry.symbol) || null,
        })),
      })));
    };

    if (cached) { paint(cached); return; }
    status.textContent = 'Quoting matches…';
    panel.replaceChildren(el('div', { class: 'etb-group' }, [emptyState('loading', '', true)]));
    loadFundRows(hits.map((hit) => hit.symbol)).then((result) => {
      if (disposed) return;
      searched.set(key, result);
      if (query.toLowerCase() === key) paint(result);
    }).catch(() => {
      if (disposed) return;
      const blank = { rows: new Map(), status: 'error', message: '' };
      searched.set(key, blank);
      if (query.toLowerCase() === key) paint(blank);
    });
  }

  /** Search hits, filed under the board each came from, boards in rail order. */
  function groupBy(hits) {
    const out = new Map();
    for (const category of ETF_TABLE_CATEGORIES) {
      const rows = hits.filter((hit) => hit.categoryId === category.id);
      if (rows.length) out.set(category.id, rows);
    }
    return out;
  }

  function coverageLine(category, board, missing) {
    if (board.status === 'skipped') {
      return [el('span', { text: board.message || 'Connect FMP in Settings to quote these funds.' })];
    }
    const total = categorySymbols(category).length;
    const parts = [el('span', { text: `${total - missing.length} of ${total} funds quoted` })];
    if (missing.length) {
      parts.push(el('span', { class: 'etb-status__gap',
        title: `No quote returned for ${missing.join(', ')}`,
        text: `· ${missing.length} not returned by the feed` }));
    }
    if (board.status !== 'ok') {
      parts.push(el('span', { class: 'etb-status__gap', text: `· ${board.message || 'partial data'}` }));
    }
    return parts;
  }

  function skeleton(category) {
    return el('div', {}, category.groups.map((group) => el('section', { class: 'etb-group' }, [
      el('h3', { class: 'etb-group__t', text: group.title }),
      emptyState('loading', '', true),
    ])));
  }

  /* ---- one table ---------------------------------------------------------- */

  /**
   * A group, sortable in place.
   *
   * Sort state is per table rather than per board: two tables on the same
   * screen asking different questions should not be forced into one order,
   * and "back to the listed order" is always one click away because the
   * catalogue's own sequence is a column like any other.
   */
  function groupTable({ title, note = null, entries, onTitle = null }) {
    let sort = 'order';
    let direction = 1;
    const body = el('tbody');
    const head = el('tr', {}, [
      el('th', { scope: 'col', class: 'etb-th etb-th--id' }, [sortButton('order', 'Fund')]),
      ...COLUMNS.map((column) => el('th', {
        scope: 'col', class: `etb-th${column.num ? ' etb-th--num' : ''}`,
      }, [sortButton(column.key, column.label)])),
    ]);

    function sortButton(key, label) {
      const active = sort === key;
      return el('button', {
        type: 'button', class: `etb-sort${active ? ' is-active' : ''}`,
        onclick: () => {
          if (sort === key) direction = -direction;
          else { sort = key; direction = key === 'order' ? 1 : -1; }
          redraw();
        },
      }, [label, active ? el('span', { class: 'etb-sort__a', 'aria-hidden': 'true', text: direction === 1 ? ' ↑' : ' ↓' }) : null]);
    }

    function ordered() {
      const read = sort === 'order' ? (entry) => entry.order : COLUMN_BY_KEY[sort].get;
      return [...entries].sort((a, b) => {
        const x = read(a);
        const y = read(b);
        // A fund with no quote sorts last whichever way the column runs. It is
        // not the worst performer, it is the one that did not come back.
        if (!isNum(x)) return isNum(y) ? 1 : a.order - b.order;
        if (!isNum(y)) return -1;
        return (x - y) * direction;
      });
    }

    function redraw() {
      head.replaceChildren(
        el('th', { scope: 'col', class: 'etb-th etb-th--id', 'aria-sort': ariaSort('order') }, [sortButton('order', 'Fund')]),
        ...COLUMNS.map((column) => el('th', {
          scope: 'col', class: `etb-th${column.num ? ' etb-th--num' : ''}`,
          'aria-sort': ariaSort(column.key),
        }, [sortButton(column.key, column.label)])),
      );
      body.replaceChildren(...ordered().map(rowNode));
    }

    const ariaSort = (key) => (sort === key ? (direction === 1 ? 'ascending' : 'descending') : 'none');

    function rowNode(entry) {
      const quoted = !!entry.row;
      const identity = el('button', {
        type: 'button', class: 'etb-id', disabled: !quoted && !onPick,
        title: entry.row?.fundName || entry.label,
        onclick: () => onPick?.(entry.row || { symbol: entry.symbol, name: entry.label, kind: 'etf' }),
      }, [
        instrumentMark({ symbol: entry.symbol, kind: 'etf' }),
        el('span', { class: 'etb-id__text' }, [
          el('span', { class: 'etb-id__name', text: entry.label }),
          el('span', { class: 'etb-id__sub', text: entry.sub || entry.row?.fundName || '' }),
        ]),
        el('span', { class: 'etb-id__sym', text: entry.symbol }),
      ]);

      return el('tr', { class: quoted ? '' : 'is-blank' }, [
        el('td', { class: 'etb-td etb-td--id' }, [identity]),
        ...COLUMNS.map((column) => el('td', {
          class: `etb-td${column.num ? ' etb-td--num' : ''}`,
        }, [column.cell(entry)])),
      ]);
    }

    redraw();

    return el('section', { class: 'etb-group', 'aria-label': title }, [
      el('div', { class: 'etb-group__head' }, [
        onTitle
          ? el('button', { type: 'button', class: 'etb-group__t etb-group__t--link', onclick: onTitle }, [title, el('span', { class: 'mh-chevron', 'aria-hidden': 'true', text: '›' })])
          : el('h3', { class: 'etb-group__t', text: title }),
        el('span', { class: 'etb-group__n', text: `${entries.length} fund${entries.length === 1 ? '' : 's'}` }),
      ]),
      note ? el('p', { class: 'etb-group__note', text: note }) : null,
      el('div', { class: 'etb-scroll' }, [
        el('table', { class: 'etb-table' }, [el('thead', {}, [head]), body]),
      ]),
    ]);
  }

  /* ---- go ----------------------------------------------------------------- */

  if (!hasApiKey()) {
    /* The caveat is part of what the board *is*, not part of its data — the
       Shariah board's compliance note especially — so it prints whether or not
       there is a key to quote the rows with. */
    heading.replaceChildren(...[
      el('h2', { class: 'etb-intro__t', text: current.title }),
      el('p', { class: 'etb-intro__b', text: current.blurb }),
      current.note ? el('p', { class: 'etb-intro__n', text: current.note }) : null,
    ].filter(Boolean));
    status.textContent = '';
    panel.replaceChildren(emptyState('skipped',
      'These boards quote real funds, so they need a live FMP connection. The catalogue itself '
      + 'is part of the page — the rail above lists every board it can fill once a key is set.'));
  } else {
    drawCategory();
  }
  /* The opening reveal has to wait for layout, and a frame is not enough: this
     node is built before it is appended, so at the next frame the rail may
     still be unattached and measure zero. A ResizeObserver fires the moment it
     has a width, which is exactly the moment the reveal can work — then it is
     done, and it disconnects. Without it, a link straight to one board leaves
     the rail scrolled to the first and marking a chip nobody can see. */
  const reveal = new ResizeObserver(() => {
    const track = rail.querySelector('.mh-rail');
    if (!track || !track.clientWidth) return;
    reveal.disconnect();
    if (!disposed) markTabs();
  });
  reveal.observe(rail);

  /* The rail owns a ResizeObserver, so the board's own teardown has to reach
     it — the carousel is a child node here rather than the returned one. */
  root.dispose = () => {
    disposed = true; clearTimeout(searchTimer); reveal.disconnect(); rail.dispose?.();
  };
  /** Open one board from outside — what a heading elsewhere on the page does. */
  root.open = (id) => setCategory(id);
  return root;
}
