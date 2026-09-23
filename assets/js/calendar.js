/* ==========================================================================
   Maz Vantage — the Calendar

   What the market has coming, a week at a time: who reports, who goes
   ex-dividend, who splits. One of the two surfaces in the app that is not
   about a single company — the other is Investment Ideas — so it has no
   dataset, no grade and no opinion. It is a diary.

   Three things shape the whole page.

   **A week is the unit.** FMP's calendars are date-range endpoints and the
   earnings one alone returns several hundred rows a day across every exchange
   it carries. One request per week per kind is what makes the page
   affordable; a month would be four times the payload for a view nobody
   scans that way, and a day would be five requests for the same week.

   **The feed is a symbol and a date.** There is no company name, no exchange,
   no sector on any of the three calendars. So the logo does the naming — the
   vendor serves one per symbol — and everything the filters offer is derived
   from the symbol's own exchange suffix, which is the only other thing the
   row carries. Nothing here is looked up per row: three hundred profile
   requests to label three hundred tiles would cost more than the rest of the
   report put together.

   **A tile is a link, not a record.** The grid answers "who, and when". The
   numbers behind an event — the estimate, the dividend, the ratio — are on
   the tile's tooltip and, for dividends and splits, on a second line, because
   for those two the number *is* the event. For earnings it is not: the event
   is that they report at all.
   ========================================================================== */

import { el, esc, isNum, dec, trim, money, pct, fmtDate } from './util.js';
import { card, notice, ohead } from './ui.js';
import { fetchCalendar, logoUrl, hasApiKey } from './fmp.js';

/* ==========================================================================
   Dates

   Everything is UTC. The calendars are date-strings without a timezone, and
   a local-midnight Date would shift half the world's events a day either way
   depending on where the reader is sitting.
   ========================================================================== */

const DAY_MS = 24 * 3600 * 1000;

/** `YYYY-MM-DD` from a Date, in UTC. */
const iso = (d) => d.toISOString().slice(0, 10);

/** A UTC midnight Date from a `YYYY-MM-DD` string, or null. */
function fromIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The Monday of whatever week `date` falls in, at UTC midnight. */
function mondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay is 0 for Sunday, so shift the week to start on Monday before
  // subtracting — otherwise a Sunday jumps forward six days instead of back one.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);

/** Today at UTC midnight, from the reader's own calendar date. */
function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const dayLabel = (d) => `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} `
  + d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

/* ==========================================================================
   Where a symbol trades

   The only thing a calendar row carries besides a date. FMP suffixes a
   symbol with its exchange — `RUI.PA`, `7203.T`, `0700.HK` — and leaves US
   listings bare, so the suffix is enough to place almost every row on a map.

   This is a market, not a country of incorporation. `SHKLY` is a Hong Kong
   company trading over the counter in New York and lands under United States,
   which is right: the reader filtering for what they can buy before lunch
   wants the venue, not the head office.
   ========================================================================== */

const AMERICAS = 'Americas';
const EUROPE = 'Europe';
const ASIA = 'Asia-Pacific';
const MEA = 'Middle East & Africa';

const MARKETS = {
  '': ['United States', AMERICAS],
  TO: ['Canada', AMERICAS], V: ['Canada', AMERICAS], CN: ['Canada', AMERICAS],
  NE: ['Canada', AMERICAS],
  MX: ['Mexico', AMERICAS], SA: ['Brazil', AMERICAS], BA: ['Argentina', AMERICAS],
  SN: ['Chile', AMERICAS],

  L: ['United Kingdom', EUROPE], IL: ['United Kingdom', EUROPE],
  IR: ['Ireland', EUROPE],
  PA: ['France', EUROPE], BR: ['Belgium', EUROPE], AS: ['Netherlands', EUROPE],
  LS: ['Portugal', EUROPE], MC: ['Spain', EUROPE], MI: ['Italy', EUROPE],
  DE: ['Germany', EUROPE], F: ['Germany', EUROPE], BE: ['Germany', EUROPE],
  DU: ['Germany', EUROPE], HM: ['Germany', EUROPE], HA: ['Germany', EUROPE],
  MU: ['Germany', EUROPE], SG: ['Germany', EUROPE], XETRA: ['Germany', EUROPE],
  SW: ['Switzerland', EUROPE], VX: ['Switzerland', EUROPE],
  VI: ['Austria', EUROPE],
  ST: ['Sweden', EUROPE], OL: ['Norway', EUROPE], CO: ['Denmark', EUROPE],
  HE: ['Finland', EUROPE], IC: ['Iceland', EUROPE],
  WA: ['Poland', EUROPE], PR: ['Czechia', EUROPE], BD: ['Hungary', EUROPE],
  RO: ['Romania', EUROPE], AT: ['Greece', EUROPE], IS: ['Türkiye', EUROPE],

  T: ['Japan', ASIA],
  HK: ['Hong Kong', ASIA], SS: ['China', ASIA], SZ: ['China', ASIA],
  TW: ['Taiwan', ASIA], TWO: ['Taiwan', ASIA],
  KS: ['South Korea', ASIA], KQ: ['South Korea', ASIA],
  NS: ['India', ASIA], BO: ['India', ASIA],
  SI: ['Singapore', ASIA], KL: ['Malaysia', ASIA], BK: ['Thailand', ASIA],
  JK: ['Indonesia', ASIA], VN: ['Vietnam', ASIA], PSE: ['Philippines', ASIA],
  AX: ['Australia', ASIA], NZ: ['New Zealand', ASIA],

  TA: ['Israel', MEA], SR: ['Saudi Arabia', MEA], QA: ['Qatar', MEA],
  AE: ['United Arab Emirates', MEA], KW: ['Kuwait', MEA],
  CA: ['Egypt', MEA], JO: ['South Africa', MEA],
};

const REGION_ORDER = [AMERICAS, EUROPE, ASIA, MEA, 'Other'];

/**
 * `['France', 'Europe']` for `RUI.PA`.
 *
 * A leading dot is not a suffix — `.PA` at position 0 would be a symbol that
 * is nothing but an exchange — and a hyphenated US class (`UHAL-B`, `SCE-PG`)
 * has no dot at all, so both fall through to the bare-symbol case.
 */
function marketOf(symbol) {
  const at = String(symbol || '').lastIndexOf('.');
  const suffix = at > 0 ? symbol.slice(at + 1).toUpperCase() : '';
  return MARKETS[suffix] || ['Other', 'Other'];
}

/** The part of the symbol a reader recognises, without its exchange tag. */
function shortSymbol(symbol) {
  const at = String(symbol || '').lastIndexOf('.');
  return at > 0 ? symbol.slice(0, at) : String(symbol || '');
}

/* ==========================================================================
   One row per company

   A week of the earnings calendar is full of the same company several times
   over. Three distinct patterns, and they need three different answers:

   1. **The same root on another exchange.** `GXI.SW` and `GXI.DE`,
      `HITI` and `HITI.V`, `TVSSCS.BO` and `TVSSCS.NS`. Caught by the ticker
      root once the exchange suffix is off.
   2. **A share class or a second US line.** `LEN` and `LEN-B`. Caught by the
      same root once the `-B` is off too.
   3. **A different ticker entirely.** Lennar is `LEN` in New York and
      `0JU0.L` in London; Hain Celestial is `HAIN` and `0J2I.L`. Nothing in
      the symbol connects them, and the feed carries no company name — so the
      only thing left to match on is the event itself.

   The third case is why `fingerprint` exists. Two earnings rows on the same
   day quoting a revenue estimate of exactly 8,318,685,000 are not two
   companies; a ten-digit figure agreeing to the dollar is as good as an
   identifier. That is a deliberate trade: it is precise enough to be safe and
   it will miss any pair where the vendor's two estimates differ even slightly
   (`KIE.L` and `KIERF` do), which shows up as a duplicate rather than as a
   hidden company. Wrong in the visible direction.

   Splits get the root pass only. Half a dozen unrelated companies can run a
   2-for-1 on the same morning, so the ratio is no fingerprint at all.
   ========================================================================== */

/**
 * The ticker with its exchange and share-class tags removed.
 *
 * `ADBE.SW` -> `ADBE`, `LEN-B` -> `LEN`. A leading dot is not a suffix, and
 * a trailing `W` or `R` is left alone on purpose: stripping it would fold
 * `LW` into `L` and `TW` into `T`, which is a far more common shape than the
 * warrant lines it would catch.
 */
export function symbolRoot(symbol) {
  const s = String(symbol || '').toUpperCase();
  const at = s.lastIndexOf('.');
  const base = at > 0 ? s.slice(0, at) : s;
  const dash = base.lastIndexOf('-');
  // Only a short tag after the dash is a share class; `BRK-B` yes,
  // `SOME-THING` no.
  return (dash > 0 && base.length - dash <= 3) ? base.slice(0, dash) : base;
}

/** How many of the fields that carry information are actually filled. */
function richness(r) {
  return ['epsActual', 'epsEstimated', 'revenueActual', 'revenueEstimated',
    'dividend', 'yield', 'frequency', 'paymentDate', 'recordDate',
    'numerator', 'denominator']
    .reduce((n, k) => n + (r[k] == null ? 0 : 1), 0);
}

/**
 * Which of two rows for the same company to keep.
 *
 * The plainest symbol first — a bare `LEN` is the listing a reader recognises
 * and the one whose report opens — then whichever row the vendor filled in
 * more of, then alphabetical so the choice does not wander between draws.
 */
function preferred(a, b) {
  const plain = (r) => (r.symbol.includes('.') ? 1 : 0) + (r.symbol.includes('-') ? 1 : 0);
  const pa = plain(a); const pb = plain(b);
  if (pa !== pb) return pa < pb ? a : b;

  const ra = richness(a); const rb = richness(b);
  if (ra !== rb) return ra > rb ? a : b;

  return a.symbol.localeCompare(b.symbol) <= 0 ? a : b;
}

/**
 * The event's own numbers, as a key — or null where they cannot identify it.
 *
 * Only figures precise enough that agreement is not coincidence. An earnings
 * row needs a revenue estimate to the dollar; a dividend needs an amount and
 * a payment date together. Anything thinner returns null and that row is left
 * to the root pass alone.
 */
function fingerprint(r, kindKey) {
  if (kindKey === 'earnings') {
    const rev = r.revenueEstimated ?? r.revenueActual;
    if (!Number.isFinite(rev) || Math.abs(rev) < 1e6) return null;
    // EPS is quoted in the listing's own currency, so it cannot join the key —
    // Lennar's London line reports the same revenue and a different EPS.
    return `e|${r.date.slice(0, 10)}|${Math.round(rev)}`;
  }
  if (kindKey === 'dividends') {
    if (!Number.isFinite(r.dividend) || !r.paymentDate) return null;
    return `d|${r.date.slice(0, 10)}|${r.paymentDate}|${r.dividend}`;
  }
  return null;
}

/**
 * Collapse a week to one row per company.
 *
 * Returns the survivors and how many rows went, because a count of what was
 * hidden is the only way a reader can tell a tidy list from a lossy one. Each
 * survivor carries `alsoListed` — the symbols it absorbed — which the tile
 * puts on its tooltip.
 */
export function dedupeEvents(rows, kindKey) {
  const collapse = (list, keyOf) => {
    const best = new Map();
    const loose = [];
    for (const r of list) {
      const k = keyOf(r);
      if (!k) { loose.push(r); continue; }
      const cur = best.get(k);
      if (!cur) { best.set(k, r); continue; }
      const win = preferred(cur, r);
      const lose = win === cur ? r : cur;
      win.alsoListed = [...(win.alsoListed || []), ...(lose.alsoListed || []), lose.symbol];
      best.set(k, win);
    }
    return [...best.values(), ...loose];
  };

  // Work on copies: the cached week is redrawn whenever a filter changes, and
  // writing `alsoListed` onto the cached rows would accumulate across draws.
  const fresh = rows.map((r) => ({ ...r, alsoListed: undefined }));

  const byRoot = collapse(fresh, (r) => symbolRoot(r.symbol));
  const byEvent = collapse(byRoot, (r) => fingerprint(r, kindKey));

  return {
    rows: byEvent,
    removed: rows.length - byEvent.length,
  };
}

/* ==========================================================================
   The three kinds

   Each one knows how to describe a row, how to sort it, and what the "show"
   filter means for it — which is all that differs between the three panels.
   The grid, the week navigation and the market filters are the same code.
   ========================================================================== */

/** A split as the ratio a reader says out loud: 4-for-1, or 1-for-20. */
function splitRatio(r) {
  const n = r.numerator;
  const d = r.denominator;
  if (!isNum(n) || !isNum(d) || d === 0) return null;
  return { forOne: n / d, text: `${trim(n, 4)}-for-${trim(d, 4)}` };
}

const KINDS = {
  earnings: {
    key: 'earnings',
    label: 'Earnings',
    title: 'Earnings calendar',
    blurb: 'Companies expected to report, by the day they report. Estimates are the '
      + 'consensus the vendor carries; a figure appears beside an actual only once the '
      + 'results are in.',
    /* Earnings tiles carry no second line. The event is that they report at
       all, and a consensus estimate printed under three hundred tickers would
       be three hundred numbers nobody asked for. It is on the tooltip. */
    note: () => '',
    detail: (r) => {
      const bits = [];
      if (isNum(r.epsActual)) bits.push(`EPS ${dec(r.epsActual, 2)} reported`);
      else if (isNum(r.epsEstimated)) bits.push(`EPS ${dec(r.epsEstimated, 2)} expected`);
      if (isNum(r.revenueActual)) bits.push(`revenue ${money(r.revenueActual, { currency: '' })} reported`);
      else if (isNum(r.revenueEstimated)) bits.push(`revenue ${money(r.revenueEstimated, { currency: '' })} expected`);
      return bits.join(' · ');
    },
    shows: [
      { key: 'all', label: 'All companies', test: () => true },
      { key: 'est', label: 'With an estimate', test: (r) => isNum(r.epsEstimated) },
      { key: 'done', label: 'Already reported', test: (r) => isNum(r.epsActual) },
    ],
    sorts: [
      { key: 'size', label: 'Largest expected revenue', by: (r) => -(r.revenueEstimated ?? r.revenueActual ?? -Infinity) },
      { key: 'symbol', label: 'Symbol A–Z', by: null },
      { key: 'eps', label: 'Highest expected EPS', by: (r) => -(r.epsEstimated ?? r.epsActual ?? -Infinity) },
    ],
  },

  dividends: {
    key: 'dividends',
    label: 'Dividends',
    title: 'Dividend calendar',
    blurb: 'Shares going ex-dividend, by the ex-date — the first day the stock trades '
      + 'without the payment attached. Buying on this day does not earn it.',
    note: (r) => (isNum(r.dividend) ? trim(r.dividend, 4) : ''),
    detail: (r) => {
      const bits = [];
      if (isNum(r.dividend)) bits.push(`${trim(r.dividend, 4)} per share`);
      // The vendor publishes this already in percent, not as a fraction.
      if (isNum(r.yield) && r.yield > 0) bits.push(`${pct(r.yield, { already: true })} yield`);
      if (r.frequency) bits.push(String(r.frequency).toLowerCase());
      if (r.paymentDate) bits.push(`paid ${fmtDate(r.paymentDate)}`);
      return bits.join(' · ');
    },
    shows: [
      { key: 'all', label: 'All payers', test: () => true },
      { key: 'regular', label: 'Regular only', test: (r) => !/special|irregular/i.test(r.frequency || '') },
      { key: 'special', label: 'Special and irregular', test: (r) => /special|irregular/i.test(r.frequency || '') },
      { key: 'quarterly', label: 'Quarterly', test: (r) => /quarter/i.test(r.frequency || '') },
      { key: 'monthly', label: 'Monthly', test: (r) => /month/i.test(r.frequency || '') },
    ],
    sorts: [
      { key: 'yield', label: 'Highest yield', by: (r) => -(isNum(r.yield) ? r.yield : -Infinity) },
      { key: 'symbol', label: 'Symbol A–Z', by: null },
      { key: 'amount', label: 'Largest payment', by: (r) => -(isNum(r.dividend) ? r.dividend : -Infinity) },
    ],
  },

  splits: {
    key: 'splits',
    label: 'Splits',
    title: 'Split calendar',
    blurb: 'Share splits and consolidations by their effective date. A split changes the '
      + 'number of shares and the price per share and nothing else — the company is worth '
      + 'exactly what it was the day before.',
    note: (r) => splitRatio(r)?.text || '',
    detail: (r) => {
      const s = splitRatio(r);
      if (!s) return String(r.splitType || 'split');
      const kind = s.forOne >= 1 ? 'split' : 'reverse split';
      return `${s.text} ${kind}${r.splitType ? ` · ${String(r.splitType).replace(/-/g, ' ')}` : ''}`;
    },
    shows: [
      { key: 'all', label: 'All splits', test: () => true },
      { key: 'forward', label: 'Forward splits', test: (r) => (splitRatio(r)?.forOne ?? 0) > 1 },
      { key: 'reverse', label: 'Reverse splits', test: (r) => (splitRatio(r)?.forOne ?? 2) < 1 },
    ],
    sorts: [
      { key: 'ratio', label: 'Largest ratio', by: (r) => -(splitRatio(r)?.forOne ?? -Infinity) },
      { key: 'symbol', label: 'Symbol A–Z', by: null },
    ],
  },
};

const KIND_LIST = [KINDS.earnings, KINDS.dividends, KINDS.splits];

/** How many tiles a day shows before the reader asks for the rest. */
const DEFAULT_TILES = 24;

/* ==========================================================================
   The page
   ========================================================================== */

export function renderCalendarPage(nav = {}) {
  const params = new URLSearchParams(location.search);

  const state = {
    kind: KINDS[(params.get('kind') || '').toLowerCase()] ? params.get('kind').toLowerCase() : 'earnings',
    week: mondayOf(fromIso(params.get('week')) || todayUtc()),
    region: 'all',
    market: 'all',
    show: 'all',
    sort: null,          // null means the kind's first sort
    query: '',
    // One row per company, on by default. A week of the earnings calendar
    // otherwise carries the same company three or four times over — the US
    // line, the Swiss one, the German one and a London depositary — which
    // reads as a busier week than it is.
    unique: true,
  };

  /** `${kind}|${monday}` -> the fetch result, so a week already seen is instant. */
  const weeks = new Map();

  const body = el('div', { class: 'calbody' });
  const rangeLabel = el('span', { class: 'calnav__range' });

  /* ---------- the kind strip -------------------------------------------- */

  const kindButtons = KIND_LIST.map((k) => el('button', {
    type: 'button', class: 'subtab', role: 'tab', id: `cal-tab-${k.key}`,
    'aria-controls': 'cal-body', text: k.label,
    onclick: () => { if (state.kind !== k.key) { state.kind = k.key; resetFilters(); load(); } },
  }));

  const strip = el('div', {
    class: 'subtabs', role: 'tablist', 'aria-label': 'Calendar',
  }, kindButtons);

  strip.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = KIND_LIST.findIndex((k) => k.key === state.kind);
    const next = KIND_LIST[(i + step + KIND_LIST.length) % KIND_LIST.length];
    state.kind = next.key;
    resetFilters();
    load();
    kindButtons[KIND_LIST.indexOf(next)].focus();
  });

  /**
   * A filter set belongs to the kind that defined it.
   *
   * "Quarterly" is a dividend frequency and means nothing to a split, so
   * carrying a selection across the strip would silently empty the page and
   * look like a week with no events in it.
   */
  function resetFilters() {
    state.show = 'all';
    state.sort = null;
    state.region = 'all';
    state.market = 'all';
  }

  /* ---------- the controls ---------------------------------------------- */

  const field = (label, id, onChange) => {
    const sel = el('select', { class: 'calfield__input', id, onchange: (e) => onChange(e.target.value) });
    return {
      sel,
      node: el('label', { class: 'calfield', for: id }, [
        el('span', { class: 'calfield__label', text: label }),
        sel,
      ]),
    };
  };

  const setOptions = (sel, options, value) => {
    sel.replaceChildren(...options.map((o) => el('option', {
      value: o.value, text: o.label, selected: o.value === value ? 'selected' : null,
    })));
    sel.value = value;
  };

  /**
   * Fill the four selects.
   *
   * Show and Sort come from the kind and are always available. Region and
   * Market come from the week on screen, so they fall back to their "all"
   * entry alone until there is a week to read them off — offering forty
   * exchanges when this week has four is a menu the reader has to open to
   * discover is mostly empty.
   */
  function syncControls(kind, regions, markets) {
    setOptions(showField.sel, kind.shows.map((x) => ({ value: x.key, label: x.label })), state.show);
    setOptions(sortField.sel, kind.sorts.map((x) => ({ value: x.key, label: x.label })),
      state.sort ?? kind.sorts[0].key);
    setOptions(uniqueField.sel, [
      { value: 'unique', label: 'One per company' },
      { value: 'all', label: 'Every listing' },
    ], state.unique ? 'unique' : 'all');
    setOptions(regionField.sel, [
      { value: 'all', label: 'All regions' },
      ...regions.map((rg) => ({ value: rg, label: rg })),
    ], state.region);
    setOptions(marketField.sel, [
      { value: 'all', label: 'All markets' },
      ...markets.map((m) => ({ value: m.market, label: `${m.market} (${m.n.toLocaleString('en-US')})` })),
    ], state.market);
  }

  const showField = field('Show', 'cal-show', (v) => { state.show = v; draw(); });
  const regionField = field('Region', 'cal-region', (v) => { state.region = v; state.market = 'all'; draw(); });
  const marketField = field('Market', 'cal-market', (v) => { state.market = v; draw(); });
  const sortField = field('Sort', 'cal-sort', (v) => { state.sort = v; draw(); });
  const uniqueField = field('Listings', 'cal-unique', (v) => { state.unique = v === 'unique'; draw(); });

  const search = el('input', {
    type: 'search', class: 'calfield__input', id: 'cal-search',
    placeholder: 'Ticker…', 'aria-label': 'Filter by ticker',
    oninput: (e) => { state.query = e.target.value.trim().toUpperCase(); draw(); },
  });

  const step = (n) => { state.week = addDays(state.week, n * 7); load(); };

  const nav_ = el('div', { class: 'calnav' }, [
    rangeLabel,
    el('button', {
      type: 'button', class: 'calnav__btn', 'aria-label': 'Previous week',
      title: 'Previous week', text: '‹', onclick: () => step(-1),
    }),
    el('button', {
      type: 'button', class: 'calnav__btn calnav__btn--today', text: 'Today',
      onclick: () => { state.week = mondayOf(todayUtc()); load(); },
    }),
    el('button', {
      type: 'button', class: 'calnav__btn', 'aria-label': 'Next week',
      title: 'Next week', text: '›', onclick: () => step(1),
    }),
  ]);

  const bar = el('div', { class: 'calbar' }, [
    showField.node, regionField.node, marketField.node, uniqueField.node, sortField.node,
    el('label', { class: 'calfield calfield--search', for: 'cal-search' }, [
      el('span', { class: 'calfield__label', text: 'Ticker' }),
      search,
    ]),
    nav_,
  ]);

  /* ---------- loading ---------------------------------------------------- */

  async function load() {
    const kind = KINDS[state.kind];
    const from = iso(state.week);
    const to = iso(addDays(state.week, 6));
    const ck = `${state.kind}|${from}`;

    markKind();
    setRangeLabel();

    if (!weeks.has(ck)) {
      body.replaceChildren(loadingWeek(state.week));
      // Re-read the key each time rather than once at render: Settings can add
      // one while this page is open, and the next arrow should then work.
      const result = hasApiKey()
        ? await fetchCalendar(kind.key, from, to)
        : { status: 'skipped', data: null, message: '' };
      // The reader may have moved on while the request was in flight; store
      // the answer either way, and only paint if it is still the week on screen.
      weeks.set(ck, result);
      if (`${state.kind}|${iso(state.week)}` !== ck) return;
    }
    draw();
  }

  function markKind() {
    kindButtons.forEach((b, i) => {
      const on = KIND_LIST[i].key === state.kind;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    body.setAttribute('aria-labelledby', `cal-tab-${state.kind}`);
    const k = KINDS[state.kind];
    head.querySelector('h1').textContent = k.title;
    head.querySelector('p').textContent = k.blurb;
  }

  function setRangeLabel() {
    const end = addDays(state.week, 6);
    const opts = { day: 'numeric', month: 'short', timeZone: 'UTC' };
    const sameMonth = state.week.getUTCMonth() === end.getUTCMonth();
    rangeLabel.textContent = `${state.week.toLocaleDateString('en-GB', sameMonth ? { day: 'numeric', timeZone: 'UTC' } : opts)}`
      + ` – ${end.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`;
  }

  /* ---------- drawing ---------------------------------------------------- */

  function draw() {
    const kind = KINDS[state.kind];
    const result = weeks.get(`${state.kind}|${iso(state.week)}`);
    syncUrl();

    // The kind's own controls do not depend on the week, so they are filled
    // before the data is checked: a page that could not load still has to
    // show what it would have offered, or the empty selects read as broken
    // rather than as unpopulated.
    syncControls(kind, [], []);

    if (!result || result.status !== 'ok') {
      body.replaceChildren(unavailable(result, kind));
      return;
    }

    const all = result.data.filter((r) => r && r.symbol && fromIso(r.date));

    // The market and region options come from the week on screen rather than
    // from the full map: offering forty exchanges when this week has four is
    // a menu the reader has to read to discover it is mostly empty.
    const present = new Map();
    for (const r of all) {
      const [market, region] = marketOf(r.symbol);
      if (!present.has(market)) present.set(market, { market, region, n: 0 });
      present.get(market).n += 1;
    }
    const regions = REGION_ORDER.filter((rg) => [...present.values()].some((m) => m.region === rg));
    if (state.region !== 'all' && !regions.includes(state.region)) state.region = 'all';

    const markets = [...present.values()]
      .filter((m) => state.region === 'all' || m.region === state.region)
      .sort((a, b) => b.n - a.n || a.market.localeCompare(b.market));
    if (state.market !== 'all' && !markets.some((m) => m.market === state.market)) state.market = 'all';

    syncControls(kind, regions, markets);

    const show = kind.shows.find((s) => s.key === state.show) || kind.shows[0];
    const sort = kind.sorts.find((s) => s.key === (state.sort ?? kind.sorts[0].key)) || kind.sorts[0];

    const kept = all.filter((r) => {
      if (!show.test(r)) return false;
      if (state.query && !r.symbol.toUpperCase().includes(state.query)) return false;
      const [market, region] = marketOf(r.symbol);
      if (state.region !== 'all' && region !== state.region) return false;
      if (state.market !== 'all' && market !== state.market) return false;
      return true;
    });

    // After the filters, not before: with a market chosen the reader is
    // asking for that market's listings, and collapsing them onto a primary
    // line somewhere else would empty the very filter they set. With "All
    // markets" — which is where the duplicates actually show — it collapses.
    const merged = state.unique ? dedupeEvents(kept, kind.key) : { rows: kept, removed: 0 };
    const rows = merged.rows;

    // Symbol order is the tie-break under every sort, so two events with the
    // same estimate do not swap places between one draw and the next.
    rows.sort((a, b) => {
      if (sort.by) {
        const d = sort.by(a) - sort.by(b);
        if (d) return d;
      }
      return a.symbol.localeCompare(b.symbol);
    });

    const byDay = new Map();
    for (const r of rows) {
      const day = r.date.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(r);
    }

    // Monday to Friday always, because an empty Wednesday is information.
    // The weekend only appears when something is actually on it — a few
    // exchanges settle dividends on a Saturday — and two permanently empty
    // columns would take a fifth of the width to say nothing.
    const days = [0, 1, 2, 3, 4].map((n) => addDays(state.week, n));
    for (const n of [5, 6]) {
      const d = addDays(state.week, n);
      if (byDay.has(iso(d))) days.push(d);
    }

    const today = iso(todayUtc());
    const grid = el('div', { class: 'calweek', style: { '--cal-cols': String(days.length) } },
      days.map((d) => dayColumn(d, byDay.get(iso(d)) || [], kind, nav, iso(d) === today)));

    const n = (v) => v.toLocaleString('en-US');
    const shown = rows.length === all.length
      ? `${n(all.length)} event${all.length === 1 ? '' : 's'} this week`
      : `${n(rows.length)} of ${n(all.length)} events this week`;

    body.replaceChildren(
      el('p', { class: 'calcount' }, [
        shown,
        // Never silent about it. A tidier list is only an improvement if the
        // reader can see what it cost, and a wrong merge hides a company.
        merged.removed
          ? el('span', { class: 'calcount__note',
              text: ` · ${n(merged.removed)} duplicate listing${merged.removed === 1 ? '' : 's'} merged` })
          : null,
      ]),
      grid,
    );
  }

  /** Keep the URL on the week and kind being read, so the page is shareable. */
  function syncUrl() {
    const url = new URL(location.href);
    url.searchParams.set('view', 'calendar');
    url.searchParams.set('kind', state.kind);
    url.searchParams.set('week', iso(state.week));
    // `replaceState`, not push: paging through six weeks is not six pages to
    // back out through, but a copied link should still land where the sender was.
    history.replaceState(history.state, '', url);
  }

  const head = el('div', { class: 'ideashead' }, [
    el('h1', { text: KINDS[state.kind].title }),
    el('p', { text: KINDS[state.kind].blurb }),
  ]);

  body.id = 'cal-body';
  body.setAttribute('role', 'tabpanel');

  load();

  return el('div', { class: 'shell shell--wide' }, [head, strip, bar, body]);
}

/* ==========================================================================
   Pieces
   ========================================================================== */

/** One day: its date, its count, and its tiles. */
function dayColumn(date, rows, kind, nav, isToday) {
  const host = el('div', { class: 'calday__grid' });
  let showAll = rows.length <= DEFAULT_TILES;

  const more = rows.length > DEFAULT_TILES
    ? el('button', { type: 'button', class: 'calday__more' })
    : null;

  const paint = () => {
    const n = showAll ? rows.length : DEFAULT_TILES;
    host.replaceChildren(...rows.slice(0, n).map((r) => tile(r, kind, nav)));
    if (more) more.textContent = showAll ? 'Show fewer' : `+${rows.length - DEFAULT_TILES} more`;
  };
  more?.addEventListener('click', () => { showAll = !showAll; paint(); });
  paint();

  return el('div', { class: `calday ${isToday ? 'is-today' : ''}`.trim() }, [
    el('div', { class: 'calday__head' }, [
      el('span', { class: 'calday__name', text: dayLabel(date) }),
      rows.length ? el('span', { class: 'calday__count', text: String(rows.length) }) : null,
    ]),
    rows.length ? host : el('p', { class: 'calday__empty', text: 'Nothing scheduled' }),
    more,
  ]);
}

/**
 * One event.
 *
 * The logo names the company, because the feed does not. When the vendor has
 * no image for a symbol — which is most of the long tail — the `onerror`
 * swaps in a monogram rather than leaving a broken frame, and the ticker
 * under it was always going to be the thing the reader read anyway.
 */
function tile(row, kind, nav) {
  const sym = row.symbol;
  const [market] = marketOf(sym);
  const detail = kind.detail(row);
  const note = kind.note(row);

  const logo = el('img', {
    class: 'caltile__logo', src: logoUrl(sym), alt: '', loading: 'lazy',
    onerror: (e) => e.target.replaceWith(monogram(sym)),
  });

  // The other listings this row absorbed, so a reader who wonders where the
  // Swiss line went can see it was not dropped.
  const also = row.alsoListed?.length
    ? ` · also listed as ${[...new Set(row.alsoListed)].sort().join(', ')}`
    : '';

  return el('button', {
    type: 'button',
    class: `caltile ${also ? 'is-merged' : ''}`.trim(),
    title: `${sym} · ${market}${detail ? ` · ${detail}` : ''}${also}`,
    onclick: () => nav.openSymbol?.(sym),
  }, [
    logo,
    el('span', { class: 'caltile__sym', text: shortSymbol(sym) }),
    note ? el('span', { class: 'caltile__note', text: note }) : null,
  ]);
}

/** The stand-in for a symbol the vendor has no logo for. */
function monogram(symbol) {
  const short = shortSymbol(symbol);
  return el('span', {
    class: 'caltile__mono',
    text: short.slice(0, /^\d/.test(short) ? 4 : 3),
    'aria-hidden': 'true',
  });
}

/** Five grey columns while the week is in flight. */
function loadingWeek(monday) {
  return el('div', { class: 'calweek', style: { '--cal-cols': '5' } },
    [0, 1, 2, 3, 4].map((n) => el('div', { class: 'calday' }, [
      el('div', { class: 'calday__head' }, [
        el('span', { class: 'calday__name', text: dayLabel(addDays(monday, n)) }),
      ]),
      el('div', { class: 'calday__grid' }, Array.from({ length: 8 }, () =>
        el('span', { class: 'sk caltile--skeleton' }))),
    ])));
}

/**
 * Why there is no week on the page.
 *
 * The calendars are date-relative and nothing about them can be bundled — a
 * snapshot of next week's earnings is wrong the week after — so unlike every
 * other surface in the app this one has no offline fallback to degrade to.
 * It says so rather than showing an empty grid.
 */
function unavailable(result, kind) {
  const status = result?.status || 'skipped';
  const body = status === 'gated'
    ? `<b>The ${kind.label.toLowerCase()} calendar</b> is not included in your current FMP plan. `
      + 'The rest of the report is unaffected — upgrade the plan behind your API key to fill this in.'
    : status === 'error'
      ? `The ${kind.label.toLowerCase()} calendar could not be loaded — ${esc(result.message || 'unknown error')}.`
      : '<b>The calendar needs a live FMP connection.</b> Add your API key in <code>Settings</code> to '
        + 'load it. This is the one page with no bundled fallback: a saved copy of next week’s '
        + 'events would be wrong by the week after.';

  return card('cal-none', [
    ohead(kind.title),
    notice(body, status === 'error' ? 'notice--error' : ''),
  ], 'ocard');
}
