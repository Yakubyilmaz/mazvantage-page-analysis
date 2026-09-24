/* ==========================================================================
   Vanlior — Beat the Market

   One rule, applied twice: measure what the market returned over three years,
   then list everything that returned more. Stocks on Market Data → Stocks,
   funds on Market Data → ETFs, same benchmark and same arithmetic on both.

   ---------------------------------------------------------------------------
   The list has no membership, only a rule
   ---------------------------------------------------------------------------

   Nothing is added and nothing is removed, because nothing is stored. The
   basket is recomputed from live returns every time it is opened: a name that
   has fallen below the benchmark since your last visit is simply not in the
   list, and one that has climbed past it is. That is the same behaviour as a
   saved list that adds and drops on the rule — with the advantage that it can
   never be stale, and the limitation that this page cannot tell you *when*
   something joined or left. A join date needs yesterday's list, and this app
   keeps no history; the Quant desk's Rating Changes tab says the same thing
   about the same missing database.

   ---------------------------------------------------------------------------
   Three things about the number that the number does not say
   ---------------------------------------------------------------------------

   **It is a price return, not a total return.** `stock-price-change` measures
   price only, on both sides of the comparison, so the test is like-for-like —
   but a company paying a 4% yield has handed its owners roughly twelve per
   cent over three years that this column cannot see. Income names are
   therefore understated against the benchmark, and the list under-counts them.

   **A listing younger than the window reports its whole history in the 3Y
   column.** The vendor does not return a shorter window as empty; it returns
   what it has, under the longer label. IBIT listed in January 2024 and reports
   a three-year return. Where that fallback is detectable — the three and five
   year figures being identical, which only happens when both are the same
   partial history — the row is dropped. Where it is not, the row is marked.
   See `shortHistory` below for exactly what each test can and cannot catch.

   **Everything delisted in the last three years is missing.** The universe is
   whatever the screener returns *today*, so the list answers "what beat the
   market and is still listed", which is a easier question than the one it
   appears to answer. Nothing here can fix that: the vendor's screener has no
   memory of what it used to return.
   ========================================================================== */

import { el, isNum, money } from './util.js';
import { fetchScreener, fetchHubFeed, hasApiKey } from './fmp.js';
import { dedupeStocks } from './markethub-data.js';
import { emptyState, instrumentMark } from './markethub-ui.js';

/* ==========================================================================
   What the market means
   ========================================================================== */

/**
 * The benchmarks the basket can be measured against.
 *
 * SPY first because "the market" means the S&P 500 to most people asking, and
 * because it is the one every other page here already quotes. The other three
 * are the same question asked of a different market, and each is one extra
 * request — the benchmark costs a single symbol, whatever the list beneath it
 * costs.
 */
export const BENCHMARKS = [
  { symbol: 'SPY', label: 'S&P 500', note: 'The five hundred largest US companies, capitalisation-weighted.' },
  { symbol: 'QQQ', label: 'Nasdaq 100', note: 'The largest hundred non-financial companies on Nasdaq. A much higher bar than the S&P 500 over most three-year windows, and concentrated in technology.' },
  { symbol: 'IWM', label: 'Russell 2000', note: 'US small caps. A lower bar than the S&P 500 over most recent windows, so this list will be far longer.' },
  { symbol: 'ACWI', label: 'World', note: 'Developed and emerging markets together, in US dollars.' },
];
export const benchmarkOf = (symbol) =>
  BENCHMARKS.find((item) => item.symbol === symbol) || BENCHMARKS[0];

/**
 * How many candidates to test, and what each costs.
 *
 * The universe is taken largest-first and cut here, which is the one real
 * distortion in the list: the biggest three-year returns in any market are
 * usually *not* in the largest names, so a small sample is a sample of the
 * wrong end. It is a control rather than a constant for exactly that reason,
 * and the request cost is printed beside it so raising it is an informed
 * choice. `stock-price-change` takes fifty symbols a call.
 */
export const SAMPLES = [250, 500, 1000, 2000];
const CHUNK = 50;
const PAGE = 50;

/* ==========================================================================
   Reading a window
   ========================================================================== */

const number = (row, key) => {
  if (!row) return null;
  const value = typeof row[key] === 'string' ? Number(row[key]) : row[key];
  return isNum(value) ? value : null;
};

/**
 * Is this listing too young for the window it is being measured over?
 *
 * The vendor has no "not enough history" answer. Asked for three years of a
 * two-year-old listing it returns the two years, in the three-year field, and
 * says nothing. Two tests fall out of the windows it returns beside it:
 *
 *   `certain`  three-year and five-year figures identical. Both are the same
 *              partial history, so the listing is younger than three years.
 *              IBIT, listed January 2024, answers 72.81 to 3Y, 5Y, 10Y and max
 *              alike. These rows are dropped.
 *
 *   `possible` five-year and maximum figures identical, but the three-year
 *              differs. The listing is younger than five years; whether it is
 *              older than three, this feed does not say. ARM listed in
 *              September 2023 and answers 428% to 3Y against 354% to max —
 *              two different bases, neither of them three years back. These
 *              rows are kept and marked, because most of them are genuine
 *              four-year-old listings and dropping them all would cost more
 *              than it saved.
 *
 * Neither test is a listing date. A listing date would settle it, and the
 * vendor returns one only on the per-company profile — a request each, which
 * for a thousand candidates is a thousand requests to annotate a column.
 */
function shortHistory(window) {
  const y3 = number(window, '3Y');
  const y5 = number(window, '5Y');
  const max = number(window, 'max');
  const same = (a, b) => isNum(a) && isNum(b) && Math.abs(a - b) < 0.0001;
  if (same(y3, y5)) return 'certain';
  if (same(y5, max)) return 'possible';
  return null;
}

/** The whole candidate list's windows, fifty symbols a request. */
async function windowsFor(symbols) {
  const chunks = [];
  for (let i = 0; i < symbols.length; i += CHUNK) chunks.push(symbols.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map((chunk) =>
    fetchHubFeed('priceChanges', { symbol: chunk.join(',') })));
  const out = new Map();
  for (const result of results) {
    if (result.status !== 'ok') continue;
    for (const row of result.data || []) {
      if (row?.symbol) out.set(String(row.symbol).toUpperCase(), row);
    }
  }
  const failed = results.find((result) => result.status !== 'ok');
  return { windows: out, status: out.size ? 'ok' : failed?.status || 'ok', message: failed?.message || '' };
}

/* ==========================================================================
   The columns
   ========================================================================== */

const pct = (value, { sign = true } = {}) => {
  if (!isNum(value)) return el('span', { class: 'bm-na', text: '—' });
  const mark = sign && value > 0 ? '+' : value < 0 ? '−' : '';
  return el('span', {
    class: `bm-pc ${value > 0 ? 'is-up' : value < 0 ? 'is-down' : ''}`.trim(),
    text: `${mark}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
  });
};

const columnsFor = (kind, benchmark) => [
  { key: 'y3', label: '3Y return', num: true, get: (r) => r.y3, cell: (r) => pct(r.y3) },
  { key: 'excess', label: `vs ${benchmark.label}`, num: true, get: (r) => r.excess,
    cell: (r) => (isNum(r.excess)
      ? el('span', { class: 'bm-excess', title: `${r.excess.toFixed(1)} percentage points ahead of ${benchmark.label} over three years` },
        [pct(r.excess), el('span', { class: 'bm-pp', text: 'pp' })])
      : el('span', { class: 'bm-na', text: '—' })) },
  { key: 'y1', label: '1Y', num: true, get: (r) => r.y1, cell: (r) => pct(r.y1) },
  { key: 'ytd', label: 'YTD', num: true, get: (r) => r.ytd, cell: (r) => pct(r.ytd) },
  { key: 'm1', label: '1M', num: true, get: (r) => r.m1, cell: (r) => pct(r.m1) },
  { key: 'price', label: 'Price', num: true, get: (r) => r.price,
    cell: (r) => (isNum(r.price) ? el('span', { text: r.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : el('span', { class: 'bm-na', text: '—' })) },
  { key: 'marketCap', label: kind === 'etfs' ? 'Fund size' : 'Market cap', num: true, get: (r) => r.marketCap,
    cell: (r) => (isNum(r.marketCap) ? el('span', { text: money(r.marketCap, { currency: '$' }) }) : el('span', { class: 'bm-na', text: '—' })) },
  ...(kind === 'etfs' ? [] : [{ key: 'sector', label: 'Sector', get: (r) => r.sector,
    cell: (r) => el('span', { class: 'bm-sector', text: r.sector || '—' }) }]),
];

/* ==========================================================================
   The block
   ========================================================================== */

/**
 * The basket, as one node.
 *
 * `kind` is `'stocks'` or `'etfs'` and is the only difference between the two
 * copies: the universe it screens and one column. Everything else — the
 * benchmark, the rule, the caveats — is shared on purpose, because two lists
 * that answered "did it beat the market" differently would be worse than one
 * list that only covered half of it.
 */
export function beatTheMarket({ kind = 'stocks', country = 'US', nav = {} } = {}) {
  const funds = kind === 'etfs';
  const noun = funds ? 'fund' : 'stock';
  const root = el('div', { class: 'bm' });
  let disposed = false;
  let generation = 0;

  const params = new URLSearchParams(location.search);
  let benchmark = benchmarkOf(params.get('bench'));
  let sample = SAMPLES.includes(Number(params.get('sample'))) ? Number(params.get('sample')) : SAMPLES[1];
  let query = '';
  let sort = 'y3';
  let direction = -1;
  let shown = PAGE;
  let showShort = false;
  let data = null;

  /* ---- chrome ------------------------------------------------------------ */

  const select = (label, options, value, onChange) => {
    const node = el('select', { class: 'bm-select', 'aria-label': label,
      onchange: (event) => onChange(event.target.value) },
    options.map(([v, t]) => el('option', { value: v, text: t })));
    node.value = String(value);
    return node;
  };

  const benchPick = select('Benchmark', BENCHMARKS.map((b) => [b.symbol, `${b.label} (${b.symbol})`]),
    benchmark.symbol, (value) => { benchmark = benchmarkOf(value); remember(); load(); });
  const samplePick = select('Candidates tested', SAMPLES.map((n) => [n, `Largest ${n.toLocaleString('en-US')}`]),
    sample, (value) => { sample = Number(value); remember(); load(); });
  const search = el('input', { type: 'search', class: 'bm-search',
    placeholder: `Search ${noun} or symbol`, 'aria-label': `Search the basket`,
    oninput: () => { query = search.value; shown = PAGE; paint(); } });

  const banner = el('div', { class: 'bm-banner', 'aria-live': 'polite' });
  const table = el('div', { class: 'bm-table' });
  const note = el('p', { class: 'bm-cost' });

  root.append(
    el('div', { class: 'bm-head' }, [
      el('h2', { class: 'mh-heading', text: 'Beat the Market' }),
      el('p', { class: 'bm-lede', text: `Every ${noun} whose three-year price return is higher `
        + `than the benchmark's. There is no saved list: the rule is the membership, so a ${noun} `
        + `that falls below the line is simply not here next time you look.` }),
    ]),
    el('div', { class: 'bm-controls' }, [
      el('label', { class: 'bm-field' }, [el('span', { text: 'Benchmark' }), benchPick]),
      el('label', { class: 'bm-field' }, [el('span', { text: 'Candidates' }), samplePick]),
      el('label', { class: 'bm-field bm-field--grow' }, [el('span', { text: 'Search' }), search]),
    ]),
    note, banner, table,
  );

  function remember() {
    try {
      const url = new URL(location.href);
      if (benchmark.symbol === BENCHMARKS[0].symbol) url.searchParams.delete('bench');
      else url.searchParams.set('bench', benchmark.symbol);
      if (sample === SAMPLES[1]) url.searchParams.delete('sample');
      else url.searchParams.set('sample', String(sample));
      history.replaceState(history.state, '', url);
    } catch { /* history unavailable */ }
  }

  /* ---- loading ------------------------------------------------------------ */

  const screenerParams = () => (funds
    ? { isEtf: true, isActivelyTrading: true, country, limit: 5000 }
    : { isEtf: false, isFund: false, isActivelyTrading: true, includeAllShareClasses: false, country, limit: 5000 });

  async function load() {
    if (!hasApiKey()) {
      note.textContent = '';
      banner.replaceChildren();
      table.replaceChildren(emptyState('skipped',
        `This basket is measured across the market, so it needs a live FMP connection. `
        + `The rule itself is part of the page: a ${noun} is in it when its three-year price `
        + `return beats the benchmark's, and out when it does not.`));
      return;
    }
    const run = ++generation;
    note.textContent = `Testing the largest ${sample.toLocaleString('en-US')} — one screener call and ${Math.ceil(sample / CHUNK)} return requests.`;
    banner.replaceChildren();
    table.replaceChildren(emptyState('loading', `Measuring ${sample.toLocaleString('en-US')} ${noun}s against ${benchmark.label}…`));

    try {
      const [benchResult, universe] = await Promise.all([
        fetchHubFeed('priceChanges', { symbol: benchmark.symbol }),
        fetchScreener(screenerParams()),
      ]);
      if (disposed || run !== generation) return;

      const benchWindow = (benchResult.status === 'ok' ? benchResult.data || [] : [])
        .find((row) => String(row.symbol).toUpperCase() === benchmark.symbol);
      const benchY3 = number(benchWindow, '3Y');
      if (!isNum(benchY3)) {
        table.replaceChildren(emptyState(benchResult.status === 'ok' ? 'unavailable' : benchResult.status,
          `The benchmark's own three-year return did not come back, so there is no line to beat. `
          + `Nothing below it can be listed without it.`));
        return;
      }
      if (universe.status !== 'ok') {
        table.replaceChildren(emptyState(universe.status, universe.message
          || `The ${noun} listings could not be loaded.`));
        return;
      }

      const listings = funds
        ? [...new Map((universe.data || []).filter((r) => r?.symbol).map((r) => [r.symbol, r])).values()]
        : dedupeStocks(universe.data || [], { usOnly: country === 'US' });
      const candidates = [...listings]
        .sort((a, b) => (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0))
        .slice(0, sample);

      const { windows, status, message } = await windowsFor(candidates.map((r) => String(r.symbol).toUpperCase()));
      if (disposed || run !== generation) return;

      let tested = 0;
      let dropped = 0;
      const rows = [];
      for (const listing of candidates) {
        const window = windows.get(String(listing.symbol).toUpperCase());
        const y3 = number(window, '3Y');
        if (!isNum(y3)) continue;
        tested += 1;
        const short = shortHistory(window);
        if (short === 'certain') { dropped += 1; continue; }
        if (y3 <= benchY3) continue;
        rows.push({
          symbol: listing.symbol,
          name: listing.companyName || listing.name || listing.symbol,
          sector: listing.sector || '',
          kind: funds ? 'etf' : 'stock',
          price: Number(listing.price) || null,
          marketCap: Number(listing.marketCap) || null,
          y3, excess: y3 - benchY3,
          y1: number(window, '1Y'), ytd: number(window, 'ytd'), m1: number(window, '1M'),
          short,
        });
      }

      data = { rows, benchY3, tested, dropped, universe: listings.length, status, message };
      shown = PAGE;
      paint();
    } catch (error) {
      if (disposed || run !== generation) return;
      table.replaceChildren(emptyState('error', String(error?.message || error)));
    }
  }

  /* ---- drawing ------------------------------------------------------------ */

  function visible() {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    const columns = columnsFor(kind, benchmark);
    const read = columns.find((c) => c.key === sort)?.get || ((r) => r.y3);
    return data.rows
      .filter((row) => showShort || row.short !== 'possible')
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
    const columns = columnsFor(kind, benchmark);
    const marked = data.rows.filter((row) => row.short === 'possible').length;
    const rows = visible();

    banner.replaceChildren(
      el('p', { class: 'bm-banner__line' }, [
        el('b', { text: benchmark.label }),
        ` returned `,
        pct(data.benchY3),
        ` over three years. `,
        el('b', { text: `${data.rows.length.toLocaleString('en-US')} ${noun}${data.rows.length === 1 ? '' : 's'}` }),
        ` of the ${data.tested.toLocaleString('en-US')} measured beat it.`,
      ]),
      el('p', { class: 'bm-banner__sub', text: [
        `Largest ${sample.toLocaleString('en-US')} of ${data.universe.toLocaleString('en-US')} listings by size`,
        data.dropped ? `${data.dropped} dropped for reporting less than three years of history` : null,
        'Price return on both sides — dividends are in neither',
      ].filter(Boolean).join(' · ') }),
      marked ? el('label', { class: 'bm-toggle' }, [
        el('input', { type: 'checkbox', checked: showShort || null,
          onchange: (event) => { showShort = event.target.checked; shown = PAGE; paint(); } }),
        el('span', { text: `Include ${marked} listed within the last five years, whose three-year base may be shorter than three years` }),
      ]) : null,
    );

    if (!rows.length) {
      table.replaceChildren(emptyState('ok', query
        ? `No ${noun} in the basket matches that.`
        : `Nothing in the sample beat ${benchmark.label} over three years. Raising the number of `
          + `candidates widens the net; a benchmark that has run hot makes for a short list, `
          + `and an empty one is a real answer rather than a broken screen.`, true));
      return;
    }

    const head = el('tr', {}, [
      el('th', { class: 'bm-th bm-th--rank', scope: 'col', text: '#' }),
      el('th', { class: 'bm-th bm-th--id', scope: 'col',
        'aria-sort': sort === 'name' ? (direction === 1 ? 'ascending' : 'descending') : 'none',
      }, [sortButton('name', funds ? 'Fund' : 'Company')]),
      ...columns.map((column) => el('th', {
        class: `bm-th${column.num ? ' bm-th--num' : ''}`, scope: 'col',
        'aria-sort': sort === column.key ? (direction === 1 ? 'ascending' : 'descending') : 'none',
      }, [sortButton(column.key, column.label)])),
    ]);

    const page = rows.slice(0, shown);
    const body = el('tbody', {}, page.map((row, index) => el('tr', {}, [
      el('td', { class: 'bm-td bm-td--rank', text: String(index + 1) }),
      el('td', { class: 'bm-td bm-td--id' }, [
        el('button', { type: 'button', class: 'bm-id', title: row.name,
          onclick: () => nav.goSymbol?.(row.symbol) }, [
          instrumentMark(row),
          el('span', { class: 'bm-id__text' }, [
            el('span', { class: 'bm-id__name', text: row.name }),
            row.short === 'possible'
              ? el('span', { class: 'bm-id__flag', title: 'Listed within the last five years — the three-year figure may be measured over a shorter window', text: 'short history' })
              : null,
          ].filter(Boolean)),
          el('span', { class: 'bm-id__sym', text: row.symbol }),
        ]),
      ]),
      ...columns.map((column) => el('td', {
        class: `bm-td${column.num ? ' bm-td--num' : ''}`,
      }, [column.cell(row)])),
    ])));

    const more = rows.length > shown
      ? el('button', { type: 'button', class: 'bm-more',
        text: `Show ${Math.min(PAGE, rows.length - shown)} more — ${rows.length - shown} left`,
        onclick: () => { shown += PAGE; paint(); } })
      : null;

    table.replaceChildren(
      el('p', { class: 'bm-count', text: `${rows.length.toLocaleString('en-US')} in the basket${query ? ' matching your search' : ''}` }),
      el('div', { class: 'bm-scroll' }, [el('table', { class: 'bm-grid' }, [el('thead', {}, [head]), body])]),
      more,
      coverage(),
    );

    function sortButton(key, label) {
      const active = sort === key;
      return el('button', { type: 'button', class: `bm-sort${active ? ' is-active' : ''}`,
        onclick: () => {
          if (sort === key) direction = -direction;
          else { sort = key; direction = key === 'name' || key === 'sector' ? 1 : -1; }
          shown = PAGE;
          paint();
        } }, [label, active ? el('span', { class: 'bm-sort__a', 'aria-hidden': 'true', text: direction === 1 ? ' ↑' : ' ↓' }) : null]);
    }
  }

  /** What the basket owes its reader, in the canvas's own coverage block. */
  function coverage() {
    return el('details', { class: 'mh-coverage bm-coverage' }, [
      el('summary', { text: 'How this basket is built, and what it cannot see' }),
      el('div', {}, [
        `The rule: three-year price return greater than ${benchmark.label}'s. Both figures come `
        + `from the vendor's own price-change feed, so they are measured the same way from the `
        + `same date, and the comparison is like-for-like.`,
        'Price return, not total return. Dividends are in neither side of the comparison, so a '
        + 'company paying four per cent a year has handed its owners roughly twelve per cent over '
        + 'three years that this column cannot see. Income names are understated here and the '
        + 'basket under-counts them.',
        `Candidates are taken largest-first and cut at ${sample.toLocaleString('en-US')}, which is the `
        + 'real distortion in this list: the biggest three-year returns in any market are usually '
        + 'not in the biggest names. Raising the candidate count widens the net and costs one '
        + 'request per fifty.',
        'A listing younger than three years is reported by the vendor with its whole history in '
        + 'the three-year field rather than as missing. Where that is certain — the three and '
        + 'five year figures identical — the row is dropped. Where the listing is under five '
        + 'years old but the two differ, the row is kept and marked "short history", because most '
        + 'of those are genuine four-year listings.',
        'Anything delisted, acquired or wound up in the last three years is absent, because the '
        + 'universe is whatever the screener returns today. So this answers "what beat the market '
        + 'and is still listed", which is an easier question than it looks.',
        'No membership is stored. The basket is recomputed on every visit, so it can never be '
        + 'stale — and it cannot tell you when something joined or left, because that needs '
        + "yesterday's list and this app keeps no history.",
      ].map((line) => el('p', { text: line }))),
    ]);
  }

  load();
  root.dispose = () => { disposed = true; generation += 1; };
  return root;
}
