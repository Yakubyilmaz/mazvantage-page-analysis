/* ==========================================================================
   Maz Vantage — the Earnings desk

   `?view=earnings`. One canvas, three tabs:

     screener      the earnings calendar as a table, with six screens over it
     transcripts   which companies the vendor holds calls for, as a table
     method        what this page reads, and the signal it does not produce

   ---------------------------------------------------------------------------
   The calendar is a screen, so it is a table
   ---------------------------------------------------------------------------

   The earnings calendar returns one row per company per report: the date, the
   consensus that preceded it, and — once the result is in — the actual. Every
   question anyone asks of it is a filter over those four numbers. Who reports
   this week is a date filter. Who beat is `actual > estimate`. Who beat on
   both lines is two of those at once. So the page is one table with the filter
   as a control, rather than a set of cards each answering one of them and
   none of them sortable.

   ---------------------------------------------------------------------------
   Two requests for the whole table
   ---------------------------------------------------------------------------

   The calendar carries a symbol and nothing else about the company — no name,
   no sector, no size, and no report time. Joining it against one
   `company-screener` call supplies all three and filters to real US listings
   in the same pass, because the calendar returns Toronto, the venture board
   and the OTC sheets alongside them. A row whose symbol the screener does not
   return is dropped, and the count says how many that was.

   ---------------------------------------------------------------------------
   What "insight" means here, and what it does not
   ---------------------------------------------------------------------------

   It means **a surprise measured against consensus**, plus the written
   summaries this repo ships. It does **not** mean a model reading the call:
   nothing here runs sentiment over a transcript, counts hedging words, or
   scores management tone. FMP supplies none of that and this app runs no model
   that could produce it, so a page implying otherwise would be inventing a
   signal. The Method tab says so where a reader can find it.
   ========================================================================== */

import { el, isNum, money, fmtDate } from './util.js';
import { fetchCalendar, fetchScreener, fetchTranscriptList, hasApiKey } from './fmp.js';
import { dedupeStocks } from './markethub-data.js';
import { arrow, emptyState, instrumentMark } from './markethub-ui.js';
import { loadArticles, articlesReady, queryArticles, SAMPLE_NOTICE } from './articles.js';
import { articleCard } from './feed.js';
import { CATEGORY_BY_KEY } from './taxonomy.js';

/* ==========================================================================
   The screens
   ========================================================================== */

/**
 * Six filters over the same calendar rows.
 *
 * `reported` says whether the screen needs a result in hand: the three
 * surprise screens are meaningless before the actual lands, and `upcoming` is
 * meaningless after. `test` runs on the assembled row.
 *
 * `Double beat` last because it is the intersection of the two above it and
 * reads as the strictest, the same way the Quant rail ends on its strictest
 * screen.
 */
export const EARNINGS_SCREENS = [
  { id: 'upcoming', label: 'Upcoming', tag: 'Scheduled', reported: false,
    line: 'Scheduled to report in the window, with the consensus that stands going in.' },
  { id: 'reported', label: 'Reported', tag: 'Results in', reported: true,
    line: 'Already reported in the window. Everything with an actual against it.' },
  { id: 'beats', label: 'EPS beats', tag: 'Beat', reported: true,
    line: 'Reported earnings per share above the estimate that preceded them.',
    test: (row) => isNum(row.surprise) && row.surprise > 0 },
  { id: 'misses', label: 'EPS misses', tag: 'Miss', reported: true,
    line: 'Reported earnings per share below the estimate that preceded them.',
    test: (row) => isNum(row.surprise) && row.surprise < 0 },
  { id: 'revbeats', label: 'Revenue beats', tag: 'Top line', reported: true,
    line: 'Reported revenue above the estimate. A different question from the earnings line, and often a different answer.',
    test: (row) => isNum(row.revSurprise) && row.revSurprise > 0 },
  { id: 'double', label: 'Double beats', tag: 'Both lines', reported: true,
    line: 'Beat on earnings and on revenue at once — growth that reached the bottom line rather than a cost line that came in light.',
    test: (row) => isNum(row.surprise) && row.surprise > 0 && isNum(row.revSurprise) && row.revSurprise > 0 },
];
export const earningsScreen = (id) =>
  EARNINGS_SCREENS.find((screen) => screen.id === id) || EARNINGS_SCREENS[0];

/** How far the window reaches, in days, and what it costs. One request each. */
export const WINDOWS = [7, 14, 30, 90];
const PAGE = 50;

const iso = (d) => d.toISOString().slice(0, 10);

/* ==========================================================================
   The columns
   ========================================================================== */

const num2 = (value, dp = 2) => (isNum(value)
  ? value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : null);

const plain = (value, dp = 2) => (isNum(value)
  ? el('span', { text: num2(value, dp) })
  : el('span', { class: 'ed-na', text: '—' }));

/** A surprise, signed and coloured. Already a fraction, printed as per cent. */
function surprise(value) {
  if (!isNum(value)) return el('span', { class: 'ed-na', text: '—' });
  const shown = value * 100;
  const sign = shown > 0 ? '+' : shown < 0 ? '−' : '';
  return el('span', {
    class: `ed-pc ${shown > 0 ? 'is-up' : shown < 0 ? 'is-down' : ''}`.trim(),
    // A surprise on a near-zero estimate runs to thousands of per cent and
    // says nothing, so it is capped in the display and the raw figure stays
    // in the title.
    title: `${shown.toFixed(1)}%`,
    text: Math.abs(shown) >= 999 ? `${sign}999%+` : `${sign}${Math.abs(shown).toFixed(1)}%`,
  });
}

const columnsFor = (screen) => [
  { key: 'date', label: 'Date', get: (r) => r.date,
    cell: (r) => el('span', { text: r.date ? fmtDate(r.date, { day: 'numeric', month: 'short' }) : '—' }) },
  ...(screen.reported ? [
    { key: 'epsEstimate', label: 'EPS est.', num: true, get: (r) => r.epsEstimate, cell: (r) => plain(r.epsEstimate) },
    { key: 'eps', label: 'EPS actual', num: true, get: (r) => r.eps,
      cell: (r) => (isNum(r.eps) ? el('b', { text: num2(r.eps) }) : el('span', { class: 'ed-na', text: '—' })) },
    { key: 'surprise', label: 'EPS surprise', num: true, get: (r) => r.surprise, cell: (r) => surprise(r.surprise) },
    { key: 'revenue', label: 'Revenue', num: true, get: (r) => r.revenue,
      cell: (r) => (isNum(r.revenue) ? el('span', { text: money(r.revenue, { currency: '$' }) }) : el('span', { class: 'ed-na', text: '—' })) },
    { key: 'revSurprise', label: 'Rev. surprise', num: true, get: (r) => r.revSurprise, cell: (r) => surprise(r.revSurprise) },
  ] : [
    { key: 'epsEstimate', label: 'EPS est.', num: true, get: (r) => r.epsEstimate, cell: (r) => plain(r.epsEstimate) },
    { key: 'revenueEstimate', label: 'Revenue est.', num: true, get: (r) => r.revenueEstimate,
      cell: (r) => (isNum(r.revenueEstimate) ? el('span', { text: money(r.revenueEstimate, { currency: '$' }) }) : el('span', { class: 'ed-na', text: '—' })) },
  ]),
  { key: 'marketCap', label: 'Market cap', num: true, get: (r) => r.marketCap,
    cell: (r) => (isNum(r.marketCap) ? el('span', { text: money(r.marketCap, { currency: '$' }) }) : el('span', { class: 'ed-na', text: '—' })) },
  { key: 'sector', label: 'Sector', get: (r) => r.sector,
    cell: (r) => el('span', { class: 'ed-sector', text: r.sector || '—' }) },
];

/* ==========================================================================
   Loading
   ========================================================================== */

/**
 * The calendar for a window, joined to the listings that identify it.
 *
 * Two requests whatever the window: the calendar, and one screener call whose
 * rows carry the name, the sector and the size the calendar does not. The join
 * is also the filter — the screener is US-only, so a Toronto or OTC row simply
 * finds no match and is counted rather than shown.
 */
async function loadWindow(days) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 864e5);
  const ahead = new Date(to.getTime() + days * 864e5);

  const [calendar, universe] = await Promise.all([
    fetchCalendar('earnings', iso(from), iso(ahead)),
    fetchScreener({ isEtf: false, isFund: false, isActivelyTrading: true,
      includeAllShareClasses: false, country: 'US', limit: 5000 }),
  ]);
  if (calendar.status !== 'ok') return { status: calendar.status, message: calendar.message, rows: [] };

  const listings = universe.status === 'ok'
    ? dedupeStocks(universe.data || [], { usOnly: true }) : [];
  const by = new Map(listings.map((row) => [String(row.symbol).toUpperCase(), row]));

  const today = iso(to);
  let unmatched = 0;
  const rows = [];
  for (const entry of calendar.data || []) {
    if (!entry?.symbol || !entry.date) continue;
    const listing = by.get(String(entry.symbol).toUpperCase());
    if (!listing) { unmatched += 1; continue; }

    const est = isNum(entry.epsEstimated) ? entry.epsEstimated : null;
    const actual = isNum(entry.epsActual) ? entry.epsActual : null;
    /* A surprise needs an estimate with enough size to divide by. Consensus
       of a cent either way turns any result into a four-figure percentage,
       which is arithmetic rather than news, so those are left empty. */
    const pct = (actual != null && est != null && Math.abs(est) > 0.005)
      ? (actual - est) / Math.abs(est) : null;
    const revActual = isNum(entry.revenueActual) ? entry.revenueActual : null;
    const revEst = isNum(entry.revenueEstimated) ? entry.revenueEstimated : null;

    rows.push({
      symbol: listing.symbol,
      name: listing.companyName || listing.name || listing.symbol,
      sector: listing.sector || '',
      marketCap: Number(listing.marketCap) || null,
      kind: 'stock',
      date: entry.date,
      ahead: entry.date > today,
      eps: actual,
      epsEstimate: est,
      surprise: pct,
      revenue: revActual,
      revenueEstimate: revEst,
      revSurprise: (revActual != null && revEst != null && revEst > 0) ? revActual / revEst - 1 : null,
      hasResult: actual != null,
    });
  }
  return {
    status: universe.status === 'ok' ? 'ok' : universe.status,
    message: universe.status === 'ok' ? '' : universe.message || '',
    rows, unmatched, from: iso(from), to: iso(ahead), today,
  };
}

/* ==========================================================================
   The block
   ========================================================================== */

export function earningsScreener(nav = {}) {
  const root = el('div', { class: 'ed' });
  let disposed = false;
  let generation = 0;

  const params = new URLSearchParams(location.search);
  let screen = earningsScreen(params.get('screen'));
  let days = WINDOWS.includes(Number(params.get('days'))) ? Number(params.get('days')) : WINDOWS[0];
  let query = '';
  let sort = 'date';
  let direction = -1;
  let shown = PAGE;
  let data = null;

  const rail = el('div', { class: 'qd-rail', role: 'tablist', 'aria-label': 'Earnings screens' });
  const chips = EARNINGS_SCREENS.map((item) => el('button', {
    type: 'button', role: 'tab', 'data-screen': item.id, class: 'qd-chip',
    'aria-selected': 'false', tabIndex: -1, onclick: () => choose(item.id),
  }, [
    el('span', { class: 'qd-chip__t', text: item.label }),
    el('span', { class: 'qd-chip__g', text: item.tag }),
  ]));
  rail.replaceChildren(...chips);
  rail.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1
      : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : 0;
    if (!step) return;
    event.preventDefault();
    const at = EARNINGS_SCREENS.findIndex((item) => item.id === screen.id);
    const next = step === 'first' ? 0 : step === 'last' ? chips.length - 1
      : (at + step + chips.length) % chips.length;
    chips[next].focus();
    choose(EARNINGS_SCREENS[next].id);
  });

  const windowPick = el('select', { class: 'ed-select', 'aria-label': 'Window',
    onchange: (event) => { days = Number(event.target.value); remember(); load(); } },
  WINDOWS.map((n) => el('option', { value: n, text: `${n} days` })));
  windowPick.value = String(days);

  const search = el('input', { type: 'search', class: 'ed-search',
    placeholder: 'Search company or symbol', 'aria-label': 'Search these results',
    oninput: () => { query = search.value; shown = PAGE; paint(); } });

  const intro = el('div', { class: 'qd-screen' });
  const table = el('div', { class: 'ed-table' });

  root.append(
    el('p', { class: 'qd-lede', text: 'The earnings calendar as one table. Pick a screen; the '
      + 'window, the columns and the search stay where they are. Every figure is the vendor’s — '
      + 'the actual it reported, and the consensus it carried before the result.' }),
    rail,
    el('div', { class: 'ed-controls' }, [
      el('label', { class: 'ed-field' }, [el('span', { text: 'Window' }), windowPick]),
      el('label', { class: 'ed-field ed-field--grow' }, [el('span', { text: 'Search' }), search]),
    ]),
    intro, table,
  );

  /* The screen is always written, even when it is the default one. A tidier
     URL is not worth a menu that highlights nothing on a bare `?view=earnings`
     — every item on that flyout names a screen, and `matchesDestination` reads
     the query to decide which is current. The window is dropped at its default
     because no menu item carries it. */
  function remember() {
    try {
      const url = new URL(location.href);
      url.searchParams.set('screen', screen.id);
      if (days === WINDOWS[0]) url.searchParams.delete('days');
      else url.searchParams.set('days', String(days));
      history.replaceState(history.state, '', url);
    } catch { /* history unavailable */ }
  }

  /** Which screen the rail shows as chosen. Independent of whether the table
   *  behind it has loaded — a disconnected page still says where you are. */
  function markChips() {
    /* The bar named the page after the first menu item before this rendered,
       and all six screens share one slug — so the desk names the open screen
       itself, the same way the Quant and Shariah desks do. */
    document.title = `${screen.label} earnings — Maz Vantage`;
    for (const chip of chips) {
      const active = chip.dataset.screen === screen.id;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-selected', String(active));
      chip.tabIndex = active ? 0 : -1;
    }
  }

  function choose(id) {
    screen = earningsScreen(id);
    markChips();
    // A column that exists on one screen and not the other cannot stay sorted
    // across the switch, so the sort falls back to the date both always have.
    if (!columnsFor(screen).some((column) => column.key === sort) && sort !== 'name') sort = 'date';
    shown = PAGE;
    remember();
    paint();
  }

  async function load() {
    if (!hasApiKey()) {
      intro.replaceChildren();
      table.replaceChildren(emptyState('skipped', 'The earnings calendar is market-wide data and '
        + 'needs a live FMP connection. The bundled snapshot covers one company, so there is '
        + 'nothing to fall back to here.'));
      return;
    }
    const run = ++generation;
    intro.replaceChildren();
    table.replaceChildren(emptyState('loading', `Loading ${days} days either side of today…`));
    try {
      const result = await loadWindow(days);
      if (disposed || run !== generation) return;
      if (result.status !== 'ok' && !result.rows.length) {
        table.replaceChildren(emptyState(result.status, result.message
          || 'The earnings calendar returned nothing for this window.'));
        return;
      }
      data = result;
      shown = PAGE;
      paint();
    } catch (error) {
      if (!disposed && run === generation) {
        table.replaceChildren(emptyState('error', String(error?.message || error)));
      }
    }
  }

  /* ---- drawing ------------------------------------------------------------ */

  function matching() {
    if (!data) return [];
    return data.rows
      .filter((row) => (screen.reported ? row.hasResult : row.ahead && !row.hasResult))
      .filter((row) => !screen.test || screen.test(row));
  }

  function visible(rows) {
    const needle = query.trim().toLowerCase();
    const column = columnsFor(screen).find((c) => c.key === sort);
    const read = sort === 'name' ? (r) => r.name : (column?.get || ((r) => r.date));
    return rows
      .filter((row) => !needle || `${row.symbol} ${row.name}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const x = read(a);
        const y = read(b);
        if (x == null || x === '') return y == null || y === '' ? 0 : 1;
        if (y == null || y === '') return -1;
        return (typeof x === 'string' ? x.localeCompare(String(y)) : x - y) * direction;
      });
  }

  function paint() {
    if (!data) return;
    markChips();

    const pool = matching();
    const rows = visible(pool);
    const columns = columnsFor(screen);

    const reported = data.rows.filter((row) => row.hasResult);
    const beat = reported.filter((row) => isNum(row.surprise) && row.surprise > 0).length;
    const measured = reported.filter((row) => isNum(row.surprise)).length;

    intro.replaceChildren(...[
      el('div', { class: 'qd-screen__head' }, [
        el('h2', { class: 'qd-screen__t', text: screen.label }),
        el('span', { class: 'qd-screen__tag', text: screen.tag }),
      ]),
      el('p', { class: 'qd-screen__b', text: screen.line }),
      el('p', { class: 'ed-stats' }, [
        el('span', {}, [el('b', { text: String(pool.length) }), ` ${screen.reported ? 'results' : 'scheduled'}`]),
        el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
        el('span', { text: `${days} days either side of ${fmtDate(data.today, { day: 'numeric', month: 'short' })}` }),
        measured ? el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }) : null,
        measured ? el('span', {}, [el('b', { text: `${Math.round((beat / measured) * 100)}%` }),
          ` of the ${measured} measurable results beat`]) : null,
        data.unmatched ? el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }) : null,
        data.unmatched ? el('span', { class: 'ed-drop',
          title: 'The calendar covers Toronto, the venture board and the OTC sheets as well. A row the US screener does not return has no name, sector or size to show, so it is left out.',
          text: `${data.unmatched.toLocaleString('en-US')} non-US rows dropped` }) : null,
      ].filter(Boolean)),
    ].filter(Boolean));

    if (!rows.length) {
      table.replaceChildren(emptyState('ok', query
        ? 'Nothing in this screen matches that.'
        : screen.reported
          ? 'Nothing in this window matched this screen. A quiet stretch between reporting seasons really is empty — widen the window.'
          : 'Nothing is scheduled in this window that the US listings cover.', true));
      return;
    }

    const sortButton = (key, label) => {
      const active = sort === key;
      return el('button', { type: 'button', class: `ed-sort${active ? ' is-active' : ''}`,
        onclick: () => {
          if (sort === key) direction = -direction;
          else { sort = key; direction = key === 'name' || key === 'sector' ? 1 : -1; }
          shown = PAGE;
          paint();
        } }, [label, active ? el('span', { class: 'ed-sort__a', 'aria-hidden': 'true', text: direction === 1 ? ' ↑' : ' ↓' }) : null]);
    };
    const ariaSort = (key) => (sort === key ? (direction === 1 ? 'ascending' : 'descending') : 'none');

    const head = el('tr', {}, [
      el('th', { class: 'ed-th ed-th--id', scope: 'col', 'aria-sort': ariaSort('name') },
        [sortButton('name', 'Company')]),
      ...columns.map((column) => el('th', {
        class: `ed-th${column.num ? ' ed-th--num' : ''}`, scope: 'col', 'aria-sort': ariaSort(column.key),
      }, [sortButton(column.key, column.label)])),
    ]);

    const body = el('tbody', {}, rows.slice(0, shown).map((row) => el('tr', {}, [
      el('td', { class: 'ed-td ed-td--id' }, [
        el('button', { type: 'button', class: 'ed-id', title: row.name,
          onclick: () => nav.goSymbol?.(row.symbol) }, [
          instrumentMark(row),
          el('span', { class: 'ed-id__text' }, [el('span', { class: 'ed-id__name', text: row.name })]),
          el('span', { class: 'ed-id__sym', text: row.symbol }),
        ]),
      ]),
      ...columns.map((column) => el('td', {
        class: `ed-td${column.num ? ' ed-td--num' : ''}`,
      }, [column.cell(row)])),
    ])));

    const more = rows.length > shown
      ? el('button', { type: 'button', class: 'ed-more',
        text: `Show ${Math.min(PAGE, rows.length - shown)} more — ${rows.length - shown} left`,
        onclick: () => { shown += PAGE; paint(); } })
      : null;

    table.replaceChildren(
      el('div', { class: 'ed-scroll' }, [el('table', { class: 'ed-grid' }, [el('thead', {}, [head]), body])]),
      more,
      el('details', { class: 'mh-coverage ed-coverage' }, [
        el('summary', { text: 'Where these numbers come from' }),
        el('div', {}, [
          'The vendor’s earnings calendar: one row per company per report, carrying the date, the '
          + 'consensus estimate it held before the result, and the actual once it lands. A row '
          + 'without an actual has not reported yet, which is what separates the Upcoming screen '
          + 'from the other five.',
          'The calendar carries a symbol and nothing else about the company, so it is joined to '
          + 'one screener call for the name, the sector and the size. That join is also the '
          + 'filter: the calendar covers Toronto, the venture board and the OTC sheets, and a row '
          + 'the US screener does not return is counted above rather than shown with three empty '
          + 'columns.',
          'A surprise is the actual against the estimate, divided by the size of the estimate. '
          + 'Where consensus was within half a cent of zero the division is left empty — any '
          + 'result over an estimate that small is a four-figure percentage, which is arithmetic '
          + 'rather than news.',
          'A beat rate above half is the market’s normal state, not a signal: consensus is guided '
          + 'by the companies it measures, and one that expects to miss usually resets the '
          + 'estimate first. Read the distance from the usual, not the direction.',
          'Nothing here reads a transcript. No model scores management tone, counts hedging words '
          + 'or produces a sentiment reading — the vendor supplies none of that and this app runs '
          + 'none.',
        ].map((line) => el('p', { text: line }))),
      ]),
    );
  }

  /* The screen has to be in the query before the rail is built, or the flyout
     marks nothing active on a bare `?view=earnings` — every item on that menu
     names one. The page renders before the bar does, so writing it here is
     early enough, the same move the Quant and Shariah desks make. */
  remember();
  markChips();
  load();
  root.dispose = () => { disposed = true; generation += 1; };
  return root;
}

/* ==========================================================================
   The transcript library, as a table
   ========================================================================== */

export function transcriptLibrary(nav = {}) {
  const root = el('div', { class: 'ed' });
  let disposed = false;
  let query = '';
  let sort = 'calls';
  let direction = -1;
  let shown = PAGE;
  let rows = [];

  const search = el('input', { type: 'search', class: 'ed-search',
    placeholder: 'Search company or symbol', 'aria-label': 'Search the transcript library',
    oninput: () => { query = search.value; shown = PAGE; paint(); } });
  const table = el('div', { class: 'ed-table' }, [emptyState('loading', 'Loading the call library…')]);
  const count = el('p', { class: 'ed-stats' });

  root.append(
    el('p', { class: 'qd-lede', text: 'Which companies the vendor holds earnings calls for, and '
      + 'how many each. A transcript is about one company and there is nothing useful to say '
      + 'about eighty of them at once, so this is a way in rather than a reader — the text opens '
      + 'on that company’s own Transcripts tab.' }),
    el('div', { class: 'ed-controls' }, [
      el('label', { class: 'ed-field ed-field--grow' }, [el('span', { text: 'Search' }), search]),
    ]),
    count, table,
  );

  if (!hasApiKey()) {
    count.textContent = '';
    table.replaceChildren(emptyState('skipped', 'The call library is a market-wide list and needs '
      + 'a live FMP connection.'));
  } else {
    fetchTranscriptList().then((result) => {
      if (disposed) return;
      if (result.status !== 'ok') {
        table.replaceChildren(emptyState(result.status, result.message
          || 'The call library could not be loaded.'));
        return;
      }
      rows = (result.data || []).filter((row) => row?.symbol).map((row) => ({
        symbol: row.symbol,
        name: row.companyName || row.name || row.symbol,
        kind: 'stock',
        calls: Number(row.noOfTranscripts ?? row.count ?? row.transcripts) || null,
      }));
      paint();
    }).catch((error) => {
      if (!disposed) table.replaceChildren(emptyState('error', String(error?.message || error)));
    });
  }

  function paint() {
    const needle = query.trim().toLowerCase();
    const list = rows
      .filter((row) => !needle || `${row.symbol} ${row.name}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const x = sort === 'name' ? a.name : a.calls;
        const y = sort === 'name' ? b.name : b.calls;
        if (x == null) return y == null ? 0 : 1;
        if (y == null) return -1;
        return (typeof x === 'string' ? x.localeCompare(String(y)) : x - y) * direction;
      });

    count.replaceChildren(
      el('span', {}, [el('b', { text: list.length.toLocaleString('en-US') }), ' companies']),
      el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
      el('span', { text: `${rows.length.toLocaleString('en-US')} in the library` }),
    );

    if (!list.length) {
      table.replaceChildren(emptyState('ok', rows.length
        ? 'No company in the library matches that.'
        : 'The vendor returned no companies.', true));
      return;
    }

    const sortButton = (key, label) => {
      const active = sort === key;
      return el('button', { type: 'button', class: `ed-sort${active ? ' is-active' : ''}`,
        onclick: () => {
          if (sort === key) direction = -direction;
          else { sort = key; direction = key === 'name' ? 1 : -1; }
          shown = PAGE;
          paint();
        } }, [label, active ? el('span', { class: 'ed-sort__a', 'aria-hidden': 'true', text: direction === 1 ? ' ↑' : ' ↓' }) : null]);
    };
    const ariaSort = (key) => (sort === key ? (direction === 1 ? 'ascending' : 'descending') : 'none');

    const head = el('tr', {}, [
      el('th', { class: 'ed-th ed-th--id', scope: 'col', 'aria-sort': ariaSort('name') }, [sortButton('name', 'Company')]),
      el('th', { class: 'ed-th ed-th--num', scope: 'col', 'aria-sort': ariaSort('calls') }, [sortButton('calls', 'Calls held')]),
      el('th', { class: 'ed-th', scope: 'col', text: '' }),
    ]);

    const body = el('tbody', {}, list.slice(0, shown).map((row) => el('tr', {}, [
      el('td', { class: 'ed-td ed-td--id' }, [
        el('button', { type: 'button', class: 'ed-id', title: row.name,
          onclick: () => nav.goSymbolTab?.('Transcripts', row.symbol) }, [
          instrumentMark(row),
          el('span', { class: 'ed-id__text' }, [el('span', { class: 'ed-id__name', text: row.name })]),
          el('span', { class: 'ed-id__sym', text: row.symbol }),
        ]),
      ]),
      el('td', { class: 'ed-td ed-td--num' }, [isNum(row.calls)
        ? el('span', { text: row.calls.toLocaleString('en-US') })
        : el('span', { class: 'ed-na', text: '—' })]),
      el('td', { class: 'ed-td' }, [el('button', { type: 'button', class: 'ed-open',
        onclick: () => nav.goSymbolTab?.('Transcripts', row.symbol) }, ['Read the calls', arrow()])]),
    ])));

    const more = list.length > shown
      ? el('button', { type: 'button', class: 'ed-more',
        text: `Show ${Math.min(PAGE, list.length - shown)} more — ${list.length - shown} left`,
        onclick: () => { shown += PAGE; paint(); } })
      : null;

    table.replaceChildren(
      el('div', { class: 'ed-scroll' }, [el('table', { class: 'ed-grid' }, [el('thead', {}, [head]), body])]),
      more,
    );
  }

  root.dispose = () => { disposed = true; };
  return root;
}

/* ==========================================================================
   The written summaries

   The only thing on this desk a person wrote. They ship with the repo rather
   than arriving from a feed, which is why the list is short and why every one
   of them carries a byline: an unattributed summary of a call is
   indistinguishable from a generated one, and this product does not generate
   them.
   ========================================================================== */

let summariesPromise = null;
const loadSummaries = () => {
  summariesPromise ??= fetch('assets/data/summaries.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}));
  return summariesPromise;
};

function summariesBlock(nav) {
  const host = el('section', { class: 'ed-sums', 'aria-label': 'Written summaries' });
  loadSummaries().then((summaries) => {
    const entries = Object.entries(summaries || {})
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => {
        const [symbol, year, quarter] = key.split('|');
        return { key, symbol, year, quarter, ...value };
      })
      .sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter));

    host.replaceChildren(
      el('div', { class: 'ed-sums__head' }, [
        el('h3', { class: 'ed-sums__t', text: 'Calls somebody read' }),
        el('span', { class: 'ed-sums__n',
          text: `${entries.length} call${entries.length === 1 ? '' : 's'}` }),
      ]),
      el('p', { class: 'ed-sums__b', text: 'Written by hand from the transcript and shipped with '
        + 'the repo, each with its byline. There is no model reading transcripts in the '
        + 'background — a call without an entry here shows its transcript alone, which was always '
        + 'the point.' }),
      entries.length
        ? el('div', { class: 'ed-sums__grid' }, entries.map((entry) => el('button', {
          type: 'button', class: 'ed-sum',
          onclick: () => nav.goSymbolTab?.('Transcripts', entry.symbol),
        }, [
          el('div', { class: 'ed-sum__h' }, [
            el('b', { text: entry.symbol }),
            el('span', { class: 'ed-sum__q', text: `Q${entry.quarter} ${entry.year}` }),
          ]),
          entry.headline ? el('p', { class: 'ed-sum__t', text: entry.headline }) : null,
          el('span', { class: 'ed-sum__by', text: `${entry.writtenBy || 'unattributed'}`
            + `${entry.writtenAt ? ` · ${fmtDate(entry.writtenAt)}` : ''}` }),
        ].filter(Boolean))))
        : el('p', { class: 'ed-sums__b', text: 'No summaries are shipped yet.' }),
    );
  }).catch(() => host.replaceChildren());
  return host;
}

/* ==========================================================================
   The Insights tab
   ========================================================================== */

/**
 * Written analysis of results — the editorial layer over the arithmetic.
 *
 * The screener says Apple beat by four cents. This tab is where somebody says
 * what that was worth, and it is the only surface on this desk that is prose
 * rather than a number with a basis under it.
 *
 * ---------------------------------------------------------------------------
 * It is a *view* of the research store, not a second store
 * ---------------------------------------------------------------------------
 *
 * Every article here already exists at `?view=research&category=earnings`. The
 * taxonomy has carried an Earnings category with four types since the feed was
 * built, so this tab adds no schema, no fixture and no second definition of
 * what an earnings article is — it filters the same store through the same
 * `matches`, and renders the same `articleCard` the feed uses.
 *
 * That matters more than it sounds. The alternative — an `earnings-insights`
 * list of its own — would have been a second place to file an article, a
 * second thing to keep in step with the taxonomy, and a way for the same piece
 * to appear on one surface and not the other. Here an article filed under
 * Earnings anywhere shows up here, and an article opened here is the same
 * article page with the same URL.
 *
 * The tab links out to the full feed rather than reimplementing its sort,
 * pagination and eight other filters. A reader who wants those wants the feed.
 */

/** Articles per press of the button. Small: these are long reads. */
const INSIGHT_PAGE = 6;

function insightsTab(nav) {
  const host = el('section', { class: 'ed-ins', 'aria-label': 'Earnings insights' });
  const rail = el('div', { class: 'qd-rail', role: 'tablist', 'aria-label': 'Insight types' });
  const feed = el('div', { class: 'afeed' });
  const foot = el('div', { class: 'ed-ins__foot' });

  const types = CATEGORY_BY_KEY.earnings?.types || [];
  let type = null;
  let shown = INSIGHT_PAGE;
  let chips = [];

  host.append(
    el('p', { class: 'qd-lede', text: 'Written work on results: what the consensus expected, '
      + 'what landed against it, and what management said about the quarter after. These are '
      + 'read and written by people — nothing here is a model summarising a call, for the same '
      + 'reason the Method tab gives.' }),
    rail, feed, foot,
  );

  /** Everything filed under Earnings, newest first. */
  const pool = () => (articlesReady() || []).filter((a) => a.primaryCategory === 'earnings');

  function choose(next) {
    type = next;
    shown = INSIGHT_PAGE;
    draw();
  }

  function buildRail(all) {
    const counts = [['All', null, all.length]].concat(
      types.map((t) => [t.label, t.key, all.filter((a) => a.articleType === t.key).length]));
    // A type nobody has written for yet is left off rather than shown as a
    // zero: the four types are the taxonomy's, and a rail of empty chips
    // would read as a broken filter rather than an unwritten one.
    chips = counts
      .filter(([, key, n]) => key === null || n > 0)
      .map(([label, key, n]) => el('button', {
        type: 'button', role: 'tab', class: `qd-chip ${key === type ? 'is-active' : ''}`.trim(),
        'aria-selected': key === type ? 'true' : 'false',
        tabIndex: key === type ? 0 : -1,
        onclick: () => choose(key),
      }, [
        el('span', { class: 'qd-chip__t', text: label }),
        el('span', { class: 'qd-chip__g', text: String(n) }),
      ]));
    rail.replaceChildren(...chips);
  }

  rail.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step || !chips.length) return;
    event.preventDefault();
    const at = chips.findIndex((c) => c.getAttribute('aria-selected') === 'true');
    const next = ((at < 0 ? 0 : at) + step + chips.length) % chips.length;
    chips[next].focus();
    chips[next].click();
  });

  function draw() {
    const all = pool();
    buildRail(all);

    if (!all.length) {
      feed.replaceChildren(emptyState('No earnings articles are in the store.',
        'The research fixture ships none filed under Earnings.'));
      foot.replaceChildren();
      return;
    }

    // `queryArticles` rather than a filter of my own, so the type filter is
    // the taxonomy's `matches` and behaves exactly as the feed's does.
    const { items, total } = queryArticles(
      { category: 'earnings', ...(type ? { type } : {}) }, { perPage: shown });

    feed.replaceChildren(...(items.length
      ? items.map((a) => articleCard(a, nav))
      : [emptyState('Nothing filed under that type yet.',
        'The other types above still have articles.')]));

    // Filtered, because `replaceChildren` stringifies a null into the page
    // where `el` would drop it — the "show more" slot is empty most of the
    // time, and unfiltered it printed the word "null" above the count.
    foot.replaceChildren(...[
      total > items.length
        ? el('button', {
          type: 'button', class: 'ed-ins__more',
          text: `Show ${Math.min(INSIGHT_PAGE, total - items.length)} more`,
          onclick: () => { shown += INSIGHT_PAGE; draw(); },
        })
        : null,
      el('p', { class: 'ed-ins__n', text:
        `${items.length} of ${total} article${total === 1 ? '' : 's'} filed under Earnings.` }),
      el('div', { class: 'ed-ins__note', html: SAMPLE_NOTICE }),
      el('button', {
        type: 'button', class: 'ed-ins__all',
        onclick: () => nav.goQuery?.('research', 'latest', { category: 'earnings' }),
      }, ['Open these in the research feed', arrow()]),
    ].filter(Boolean));
  }

  // First paint is the skeleton; the store is a fetch. Every later draw is
  // synchronous, because `articlesReady` has the list by then.
  feed.replaceChildren(el('p', { class: 'ed-ins__wait', text: 'Loading written work …' }));
  loadArticles().then(draw).catch(() => {
    feed.replaceChildren(emptyState('The research store could not be loaded.',
      'assets/data/articles.json is missing or malformed.'));
  });

  return host;
}


/* ==========================================================================
   The page
   ========================================================================== */

/* Insights sits second: the screener says what happened, this says what it was
   worth, and the transcript is the source under both. */
const TABS = [
  { id: 'screener', label: 'Earnings Screener' },
  { id: 'insights', label: 'Insights' },
  { id: 'transcripts', label: 'Transcripts' },
  { id: 'method', label: 'Method' },
];
/* `insights` used to alias to the screener: the old section of that name was
   the beat-and-miss arithmetic, which is what the surprise columns are, so
   there was no tab to send it to. There is now, and it is a different thing —
   written work rather than arithmetic — so the slug lands on its own tab and
   the alias is gone. An old link keeps working; it arrives somewhere better. */
const TAB_ALIAS = {};

export function renderEarningsPage(sub, nav = {}) {
  const asked = TAB_ALIAS[sub] || sub;
  let tab = TABS.some((item) => item.id === asked) ? asked : 'screener';

  const page = el('main', { class: 'mh-page qd-page ed-page', id: 'earnings-desk' });
  const views = {};
  const resources = new Set();
  const track = (node) => { resources.add(node); return node; };

  const navigation = el('nav', { class: 'mh-navigation', 'aria-label': 'Earnings sections' });
  const body = el('div', { class: 'qd-body' });

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'EARNINGS' }),
      el('h1', { class: 'qd-title', text: 'Earnings' }),
      el('p', { class: 'qd-strap', text: 'The calendar as a table: who reports next, who has '
        + 'reported, and how each result landed against the consensus that preceded it. Plus the '
        + 'library of calls the vendor holds a transcript for.' }),
      el('div', { class: 'mh-hero__meta' }, [
        el('button', {
          type: 'button', class: `mh-connection ${hasApiKey() ? 'is-connected' : ''}`,
          text: hasApiKey() ? 'FMP connected' : 'Connect FMP',
          onclick: () => nav.openSettings?.(),
        }),
        el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
        el('span', { class: 'qd-meta', text: 'Surprises against consensus — no model reads the call' }),
      ]),
    ]),
    navigation, body,
  );

  navigation.replaceChildren(...TABS.map((item) => el('button', {
    type: 'button', 'data-tab': item.id, text: item.label,
    class: item.id === tab ? 'is-active' : '',
    onclick: () => setTab(item.id),
  })));

  function setTab(id) {
    tab = TABS.some((item) => item.id === id) ? id : 'screener';
    try {
      const url = new URL(location.href);
      url.searchParams.set('sub', tab);
      history.replaceState(history.state, '', url);
    } catch { /* history unavailable */ }
    for (const button of navigation.querySelectorAll('[data-tab]')) {
      const active = button.dataset.tab === tab;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    views[tab] ||= track(buildTab(tab));
    body.replaceChildren(views[tab]);
    page.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  function buildTab(id) {
    if (id === 'screener') return earningsScreener(nav);
    if (id === 'insights') return insightsTab(nav);
    if (id === 'transcripts') {
      const host = el('div', {});
      const library = track(transcriptLibrary(nav));
      host.append(summariesBlock(nav), library);
      host.dispose = () => library.dispose?.();
      return host;
    }
    return methodTab(nav);
  }

  views[tab] = track(buildTab(tab));
  body.replaceChildren(views[tab]);
  navigation.querySelector(`[data-tab="${tab}"]`)?.setAttribute('aria-current', 'page');

  page.dispose = () => {
    for (const node of resources) node.dispose?.();
    resources.clear();
  };
  return page;
}

/* ---- the method tab ------------------------------------------------------ */

const panel = (title, children) =>
  el('section', { class: 'qd-panel', 'aria-label': title }, [
    el('h2', { class: 'qd-panel__t', text: title }),
    ...[].concat(children).filter(Boolean),
  ]);

const grid = (heads, rows) => el('div', { class: 'qd-scroll' }, [
  el('table', { class: 'qd-grid' }, [
    el('thead', {}, [el('tr', {}, heads.map((head) => el('th', { scope: 'col', text: head })))]),
    el('tbody', {}, rows.map((row) => el('tr', {}, row.map((cell) =>
      el('td', {}, [cell instanceof Node ? cell : document.createTextNode(String(cell))]))))),
  ]),
]);

function methodTab(nav) {
  return el('div', { class: 'qd-read' }, [
    panel('What this desk measures', [
      el('p', { class: 'qd-p', text: 'Two things, both of them checkable: a result measured '
        + 'against the estimate that preceded it, and a summary somebody wrote after reading the '
        + 'call.' }),
      grid(['It does', 'It does not'], [
        ['Compare reported earnings per share with the consensus the vendor carried before the result.',
          'Read the transcript. No model here scores management tone, counts hedging words or produces a sentiment reading — FMP supplies none of that and this app runs none.'],
        ['Show the surprise on both lines, with the actual and the estimate beside the percentage, sortable in either direction.',
          'Claim a surprise caused a price move. The two are not matched anywhere on this desk.'],
        ['List the calls that have a written summary, with who wrote it and when.',
          'Summarise the rest. A call without an entry shows its transcript alone.'],
      ]),
    ]),

    panel('How to read a beat rate', [
      el('p', { class: 'qd-warn', html: 'A beat rate above half is the market’s <b>normal state, '
        + 'not a signal</b>. Consensus is guided by the companies it measures, and one that '
        + 'expects to miss usually resets the estimate first. Read the distance from the usual, '
        + 'not the direction.' }),
      el('p', { class: 'qd-p', text: 'The rate printed above the table is over the results in the '
        + 'window that had a usable estimate behind them — not over everything that reported. A '
        + 'company the vendor carried no consensus for cannot beat or miss, and counting it as '
        + 'either would move the rate for a reason that has nothing to do with the quarter.' }),
    ]),

    panel('Where each column comes from', [
      grid(['Column', 'Source'], [
        ['Date', 'The calendar’s own date for the report. It carries no session time, so a row does not say whether the call was before the open or after the close.'],
        ['EPS estimate and actual', 'The vendor’s consensus and the reported figure, both as filed on the calendar row.'],
        ['EPS surprise', 'Actual minus estimate, over the size of the estimate. Left empty where consensus was within half a cent of zero.'],
        ['Revenue and revenue surprise', 'The same pair on the top line, where the vendor carries both.'],
        ['Market cap and sector', 'Joined from one screener call. The calendar itself carries neither.'],
      ]),
    ]),

    panel('What is not here', [
      grid(['Missing', 'Why'], [
        ['Report time (before open or after close)', 'The calendar feed returns no session time, so the page does not guess one.'],
        ['Guidance', 'Forward guidance is given on the call and in the release, not on this feed. The Analysts Forecast tab on a company report carries the estimates that follow it.'],
        ['Price reaction', 'Matching a surprise to the next session’s move needs a quote per company per date. That is a request each, and the causal claim it invites would not survive the arithmetic.'],
      ]),
      el('div', { class: 'qd-actions' }, [
        el('button', { type: 'button', class: 'qd-btn qd-btn--primary',
          onclick: () => nav.goSymbolTab?.('Analysts Forecast') }, ['A company’s forecast tab', arrow()]),
        el('button', { type: 'button', class: 'qd-btn',
          onclick: () => nav.goView?.('calendar') }, ['The full calendar', arrow()]),
      ]),
    ]),
  ]);
}
