/* ==========================================================================
   Vanlior — the Calendar

   One page, five calendars, a week at a time. TradingView's calendar is the
   reference: the week as a strip of day cards, each counting what is on that
   day across every kind; the kinds as pills; and the selected day as one
   table whose columns change with the kind.

   ---------------------------------------------------------------------------
   What it reads, and what a week costs
   ---------------------------------------------------------------------------

     economic   economic-calendar    releases with actual, forecast and prior,
                                     timed in UTC and shown in the reader's zone
     earnings   earnings-calendar    with the report time — before the open or
                                     after the close — where the vendor has one
     dividends  dividends-calendar   by ex-date
     ipos       ipos-calendar        with the vendor's own company name
     splits     splits-calendar      by effective date

   Five requests a week, one per kind, because the strip counts all five
   whichever is open. After that nothing: changing the kind, the day or a
   filter redraws what is already here, and a week already seen is instant.

   ---------------------------------------------------------------------------
   Names and sizes come from the screener, not from each row
   ---------------------------------------------------------------------------

   The earnings, dividend and split feeds carry a symbol and a date and
   nothing else — no company name, no size. A US listing is named by joining
   the week against two `company-screener` calls, one for companies and one
   for funds, made with exactly the parameters the Earnings desk and the ETF
   pages already use, so the cache usually has both. The same join is what
   ranks a day by market cap. A row the screener does not know — most of the
   world outside the US — keeps its ticker and its market and sorts after the
   rest. Nothing is looked up per row: three hundred profile requests to name
   three hundred rows would cost more than the rest of the app put together.

   ---------------------------------------------------------------------------
   Time
   ---------------------------------------------------------------------------

   The company calendars are dates without a time zone, and are shown as the
   vendor dates them. The economic calendar is instants in UTC, so a release
   is shown at the reader's own clock time and filed under the reader's own
   day — a 23:01 UTC release belongs to tomorrow in Tokyo. Public holidays are
   the exception: a holiday is a date, not an instant, and stays on its day.
   ========================================================================== */

import { el, isNum, trim, dec } from './util.js';
import { fetchCalendar, fetchScreener, fetchMarket, fetchHubFeed, hasApiKey } from './fmp.js';
import { emptyState, instrumentMark, countryFlag } from './markethub-ui.js';

/* ==========================================================================
   Dates

   Company dates are handled as UTC midnights, so a `YYYY-MM-DD` never moves
   a day either way depending on where the reader is sitting. "Today" is the
   reader's own calendar date, written the same way.
   ========================================================================== */

const DAY_MS = 24 * 3600 * 1000;

/** `YYYY-MM-DD` from a UTC-midnight Date. */
const iso = (d) => d.toISOString().slice(0, 10);

/** A UTC midnight Date from a `YYYY-MM-DD` string, or null. `Date.UTC` rolls
    month 13 into next January, so the date must read back as it was written. */
export function fromIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) || iso(d) !== m[0] ? null : d;
}

/** The Monday of whatever week `date` falls in, at UTC midnight. */
export function mondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay is 0 for Sunday, so the week is shifted to start on Monday
  // first — otherwise a Sunday jumps forward six days instead of back one.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);

/** The reader's own calendar date, as a UTC midnight. */
function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekday = (d) => WEEKDAY[(d.getUTCDay() + 6) % 7];
const longDay = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const shortDate = (s) => {
  const d = fromIso(String(s || '').slice(0, 10));
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
};

/** "Sep 21 — Sep 27, 2026", the way TradingView heads its week. */
function rangeLabel(monday) {
  const end = addDays(monday, 6);
  const md = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${md(monday)} — ${md(end)}, ${end.getUTCFullYear()}`;
}

/** A release's instant. The vendor writes UTC as `YYYY-MM-DD HH:MM:SS`. */
function releaseAt(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The reader's own calendar day for an instant. */
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localTime = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "UTC+2", "UTC−5", "UTC+5:30" — the zone every release time is shown in. */
function zoneLabel(now = new Date()) {
  const m = -now.getTimezoneOffset();
  if (!m) return 'UTC';
  const a = Math.abs(m);
  return `UTC${m > 0 ? '+' : '−'}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
}

/** "in 2h 05m", "in 12m" — how long until a release, to the minute. */
function countdown(ms) {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `in ${h}h ${String(mins % 60).padStart(2, '0')}m` : `in ${mins}m`;
}

/* ==========================================================================
   Where a symbol trades

   Besides a date, the only thing a company calendar row carries. FMP
   suffixes a symbol with its exchange — `RUI.PA`, `7203.T`, `0700.HK` — and
   leaves US listings bare, so the suffix places almost every row. This is a
   market, not a country of incorporation: `SHKLY` is a Hong Kong company
   trading over the counter in New York, and lands under United States.
   ========================================================================== */

const US = 'United States';

const MARKETS = {
  '': US,
  TO: 'Canada', V: 'Canada', CN: 'Canada', NE: 'Canada',
  MX: 'Mexico', SA: 'Brazil', BA: 'Argentina', SN: 'Chile',
  L: 'United Kingdom', IL: 'United Kingdom', IR: 'Ireland',
  PA: 'France', BR: 'Belgium', AS: 'Netherlands', LS: 'Portugal', MC: 'Spain', MI: 'Italy',
  DE: 'Germany', F: 'Germany', BE: 'Germany', DU: 'Germany', HM: 'Germany', HA: 'Germany',
  MU: 'Germany', SG: 'Germany', XETRA: 'Germany',
  SW: 'Switzerland', VX: 'Switzerland', VI: 'Austria',
  ST: 'Sweden', OL: 'Norway', CO: 'Denmark', HE: 'Finland', IC: 'Iceland',
  WA: 'Poland', PR: 'Czechia', BD: 'Hungary', RO: 'Romania', AT: 'Greece', IS: 'Türkiye',
  T: 'Japan', HK: 'Hong Kong', SS: 'China', SZ: 'China', TW: 'Taiwan', TWO: 'Taiwan',
  KS: 'South Korea', KQ: 'South Korea', SI: 'Singapore', KL: 'Malaysia', BK: 'Thailand',
  JK: 'Indonesia', PS: 'Philippines', VN: 'Vietnam',
  NS: 'India', BO: 'India', AX: 'Australia', NZ: 'New Zealand',
  SR: 'Saudi Arabia', QA: 'Qatar', AE: 'United Arab Emirates', KW: 'Kuwait',
  TA: 'Israel', JO: 'South Africa', CA: 'Egypt',
};

/** `France` for `RUI.PA`. A leading dot is not a suffix, and a hyphenated US
    class (`UHAL-B`) has no dot at all, so both fall through to the US. */
export function marketOf(symbol) {
  const s = String(symbol || '');
  const at = s.lastIndexOf('.');
  const suffix = at > 0 ? s.slice(at + 1).toUpperCase() : '';
  return MARKETS[suffix] || 'Other markets';
}

/** The part of the symbol a reader recognises, without its exchange tag. */
function shortSymbol(symbol) {
  const s = String(symbol || '');
  const at = s.lastIndexOf('.');
  return at > 0 ? s.slice(0, at) : s;
}

/* ==========================================================================
   One row per company

   A week of the earnings calendar carries the same company several times
   over, in three patterns that need three answers:

   1. **The same root on another exchange.** `GXI.SW` and `GXI.DE`. Caught by
      the ticker root once the exchange suffix is off.
   2. **A share class or a second US line.** `LEN` and `LEN-B`. Caught by the
      same root once the `-B` is off too.
   3. **A different ticker entirely.** Lennar is `LEN` in New York and
      `0JU0.L` in London, and nothing in the symbol connects them. The feed
      carries no name, so the only thing left is the event itself: two
      earnings rows on the same day quoting a revenue estimate agreeing to the
      dollar are one company. It misses a pair whose two estimates differ at
      all, which shows as a duplicate rather than a hidden company — wrong in
      the visible direction.

   Splits get the root pass only: half a dozen unrelated companies can run a
   2-for-1 on the same morning, so a ratio is no fingerprint.
   ========================================================================== */

/** `ADBE.SW` -> `ADBE`, `LEN-B` -> `LEN`. Only a short tag after a dash is a
    share class; a trailing `W` or `R` is left alone, or `LW` would fold into
    `L`. */
export function symbolRoot(symbol) {
  const s = String(symbol || '').toUpperCase();
  const at = s.lastIndexOf('.');
  const base = at > 0 ? s.slice(0, at) : s;
  const dash = base.lastIndexOf('-');
  return (dash > 0 && base.length - dash <= 3) ? base.slice(0, dash) : base;
}

/** How many of the fields that carry information are filled. */
function richness(r) {
  return ['epsActual', 'epsEstimated', 'revenueActual', 'revenueEstimated', 'time',
    'dividend', 'yield', 'frequency', 'paymentDate', 'recordDate', 'numerator', 'denominator']
    .reduce((n, k) => n + (r[k] == null ? 0 : 1), 0);
}

/** Which of two rows for one company to keep: the plainest symbol, then the
    fuller row, then alphabetical so the choice does not wander between draws. */
function preferred(a, b) {
  const plain = (r) => (r.symbol.includes('.') ? 1 : 0) + (r.symbol.includes('-') ? 1 : 0);
  const pa = plain(a); const pb = plain(b);
  if (pa !== pb) return pa < pb ? a : b;
  const ra = richness(a); const rb = richness(b);
  if (ra !== rb) return ra > rb ? a : b;
  return a.symbol.localeCompare(b.symbol) <= 0 ? a : b;
}

/** The event's own numbers as a key, or null where they cannot identify it. */
function fingerprint(r, kindKey) {
  if (kindKey === 'earnings') {
    const rev = r.revenueEstimated ?? r.revenueActual;
    if (!Number.isFinite(rev) || Math.abs(rev) < 1e6) return null;
    // EPS is quoted in the listing's own currency, so it cannot join the key:
    // Lennar's London line reports the same revenue and a different EPS.
    return `e|${r.day}|${Math.round(rev)}`;
  }
  if (kindKey === 'dividends') {
    if (!Number.isFinite(r.dividend) || !r.paymentDate) return null;
    return `d|${r.day}|${r.paymentDate}|${r.dividend}`;
  }
  return null;
}

/**
 * Collapse rows to one per company. Returns the survivors and how many went,
 * because a count of what was merged is the only way a reader can tell a
 * tidy list from a lossy one. Each survivor carries `alsoListed`.
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
  // Copies: the cached week is redrawn on every filter change, and writing
  // `alsoListed` onto it would accumulate across draws.
  const fresh = rows.map((r) => ({ ...r, alsoListed: undefined }));
  const byEvent = collapse(collapse(fresh, (r) => symbolRoot(r.symbol)), (r) => fingerprint(r, kindKey));
  return { rows: byEvent, removed: rows.length - byEvent.length };
}

/* ==========================================================================
   Countries, for the economic calendar

   The vendor writes ISO codes with three exceptions (`UK`, `EL`, `EU`), and
   covers well over a hundred countries — so names come from the browser's
   own region names rather than from a table here that would always be short.
   ========================================================================== */

const COUNTRY_ALIAS = { UK: 'GB', EL: 'GR', UAE: 'AE' };
const REGION_NAMES = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();

export function countryName(code) {
  const raw = String(code || '').toUpperCase();
  if (raw === 'EU' || raw === 'EMU') return 'Euro area';
  const isoCode = COUNTRY_ALIAS[raw] || raw;
  try { return REGION_NAMES?.of(isoCode) || raw; } catch { return raw; }
}

/** The G20, with the euro area standing in for the EU member seat. */
const G20 = new Set(['US', 'EU', 'UK', 'GB', 'JP', 'CN', 'DE', 'FR', 'IT', 'CA', 'AU', 'KR',
  'IN', 'BR', 'MX', 'RU', 'ZA', 'TR', 'SA', 'ID', 'AR']);

const IMPACT = { high: 3, medium: 2, low: 1, none: 0 };

/* ==========================================================================
   Reading each feed into rows

   Every row gets a `day` — the date it is filed under on the strip — and the
   company kinds get a `market`. Nothing else is renamed: a row keeps the
   vendor's own fields, so a column is one property read away from the feed.
   ========================================================================== */

/** Economic releases filed under the reader's own days, for one week. */
export function economicRows(data, monday) {
  const first = iso(monday);
  const last = iso(addDays(monday, 6));
  const out = [];
  for (const r of Array.isArray(data) ? data : []) {
    if (!r || !r.event) continue;
    const at = releaseAt(r.date);
    if (!at) continue;
    const impact = IMPACT[String(r.impact || '').toLowerCase()] ?? 1;
    const holiday = impact === 0 && ![r.actual, r.estimate, r.previous].some(isNum);
    // A holiday is a date: it stays on the vendor's day. A release is an
    // instant: it moves to the reader's.
    const day = holiday ? String(r.date).slice(0, 10) : localDay(at);
    if (day < first || day > last) continue;
    out.push({
      day, at, holiday, impact,
      country: String(r.country || '').toUpperCase(),
      event: String(r.event),
      actual: isNum(r.actual) ? r.actual : null,
      estimate: isNum(r.estimate) ? r.estimate : null,
      previous: isNum(r.previous) ? r.previous : null,
      unit: r.unit && r.unit !== 'N/A' ? String(r.unit) : '',
    });
  }
  return out;
}

/** Earnings, dividend and split rows, each filed under its own date. */
export function companyRows(data) {
  return (Array.isArray(data) ? data : [])
    .filter((r) => r && r.symbol && fromIso(String(r.date || '').slice(0, 10)))
    .map((r) => ({ ...r, day: String(r.date).slice(0, 10), market: marketOf(r.symbol) }));
}

/** "15.00 - 17.00" -> [15, 17]; "18.00" -> [18, 18]; anything else -> []. */
function priceRange(text) {
  const nums = String(text || '').match(/\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const [a, b = a] = nums.map(Number);
  return [Math.min(a, b), Math.max(a, b)];
}

export function ipoRows(data) {
  return (Array.isArray(data) ? data : [])
    .filter((r) => r && r.symbol && fromIso(String(r.date || '').slice(0, 10)))
    .map((r) => {
      const [low, high] = priceRange(r.priceRange);
      const shares = isNum(r.shares) ? r.shares : null;
      return {
        symbol: r.symbol, day: String(r.date).slice(0, 10), market: marketOf(r.symbol),
        name: r.company || '', exchange: r.exchange || '', status: r.actions || '',
        shares, low: isNum(low) ? low : null, high: isNum(high) ? high : null,
        // The deal at the midpoint of the range: what the offer raises if it
        // prices where the company said it would. Never shown without both.
        deal: shares != null && isNum(low) ? shares * (low + high) / 2 : null,
        cap: isNum(r.marketCap) && r.marketCap > 0 ? r.marketCap : null,
      };
    });
}

/* ==========================================================================
   Fetching
   ========================================================================== */

/* The two screens the directory is built from. Byte-for-byte the parameters
   the Earnings desk (companies) and the ETF pages (funds) send, because the
   fetch cache is keyed on them: the same object here is a cache hit there. */
const STOCK_SCREEN = { isEtf: false, isFund: false, isActivelyTrading: true,
  includeAllShareClasses: false, country: 'US', limit: 5000 };
const FUND_SCREEN = { isEtf: true, isActivelyTrading: true, country: 'US', limit: 5000 };

/** Symbol -> { name, cap } for every US company and fund the screener lists. */
async function loadDirectory() {
  const [stocks, funds] = await Promise.all([fetchScreener(STOCK_SCREEN), fetchScreener(FUND_SCREEN)]);
  const map = new Map();
  for (const res of [stocks, funds]) {
    if (res?.status !== 'ok') continue;
    for (const r of res.data || []) {
      const s = String(r.symbol || '').toUpperCase();
      if (!s || map.has(s)) continue;
      map.set(s, { name: r.companyName || r.name || '', cap: Number(r.marketCap) > 0 ? Number(r.marketCap) : null });
    }
  }
  return map;
}

/** One kind for one week, as `{ status, message, rows }`. Never throws. */
async function loadKind(key, monday) {
  const from = iso(monday);
  const to = iso(addDays(monday, 6));
  try {
    if (key === 'economic') {
      // A day either side: a reader east or west of UTC has releases on the
      // first and last days of their week that are dated outside it in UTC.
      const r = await fetchMarket('econCalendar', { from: iso(addDays(monday, -1)), to: iso(addDays(monday, 7)) });
      return r.status === 'ok' ? { status: 'ok', rows: economicRows(r.data, monday) } : { ...r, rows: [] };
    }
    if (key === 'ipos') {
      const r = await fetchHubFeed('ipos', { from, to });
      return r.status === 'ok' ? { status: 'ok', rows: ipoRows(r.data) } : { ...r, rows: [] };
    }
    const r = await fetchCalendar(key, from, to);
    return r.status === 'ok' ? { status: 'ok', rows: companyRows(r.data) } : { ...r, rows: [] };
  } catch (error) {
    return { status: 'error', message: String(error?.message || error), rows: [] };
  }
}

/* ==========================================================================
   Cells
   ========================================================================== */

const DASH = '—';

/** A figure with its unit set small after it, the way TradingView prints money. */
function figure(text, unit = '') {
  if (text == null || text === '') return DASH;
  return el('span', { class: 'cl-fig' }, [text, unit ? el('small', { text: unit }) : null]);
}

/** 427656250 -> "427.66 M". */
export function big(v) {
  if (!isNum(v)) return null;
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  for (const [n, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
    if (a >= n) return `${sign}${dec(a / n, 2)} ${u}`;
  }
  return `${sign}${trim(a, 2)}`;
}

/** A per-share figure: two decimals, four under a cent. */
const perShare = (v) => (isNum(v) ? `${v < 0 ? '−' : ''}${dec(Math.abs(v), Math.abs(v) > 0 && Math.abs(v) < 0.01 ? 4 : 2)}` : null);

/** The listing currency, where it is known. The feeds name none, so it is
    stated only for a US line, which is dollars. */
const unitOf = (r) => (r.market === US ? 'USD' : '');

/** (actual − estimate) / |estimate|. Empty against an estimate too small to
    divide by: consensus of a cent turns any result into four figures. */
function surprise(actual, estimate, floor = 0.005) {
  if (!isNum(actual) || !isNum(estimate) || Math.abs(estimate) <= floor) return null;
  return (actual - estimate) / Math.abs(estimate);
}

function signed(v) {
  if (!isNum(v)) return DASH;
  const text = `${v > 0 ? '+' : v < 0 ? '−' : ''}${trim(Math.abs(v) * 100, 2)}%`;
  return el('span', { class: v > 0 ? 'mh-up' : v < 0 ? 'mh-down' : '', text });
}

/** An economic figure with its unit: 4.5%, 201K, 52.5. */
function econValue(v, unit) {
  if (!isNum(v)) return DASH;
  const n = `${v < 0 ? '−' : ''}${trim(Math.abs(v), 3)}`;
  if (unit === '%') return `${n}%`;
  if (['K', 'M', 'B', 'T'].includes(unit)) return `${n}${unit}`;
  return n;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(paths, cls = 'cl-i') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
}
const ICON = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
};

function reportTime(time) {
  if (time === 'bmo') return el('span', { class: 'cl-when' }, [icon(ICON.sun), 'Before open']);
  if (time === 'amc') return el('span', { class: 'cl-when' }, [icon(ICON.moon), 'After close']);
  return DASH;
}

/** Three bars, filled to the release's importance — the vendor's own grade. */
function impactCell(r) {
  if (r.holiday) return el('span', { class: 'cl-tag', text: 'Holiday' });
  const label = ['No impact rating', 'Low impact', 'Medium impact', 'High impact'][r.impact];
  return el('span', { class: `cl-impact cl-impact--${r.impact}`, role: 'img', 'aria-label': label, title: label },
    [1, 2, 3].map((n) => el('i', { class: n <= r.impact ? 'is-on' : '' })));
}

/* ==========================================================================
   The kinds

   Each one names itself, says what a row is, and lists its columns. A column
   is a label, a cell, and — if it can be sorted — the value it sorts on. The
   page, the strip, the filters and the table are the same code for all five.
   ========================================================================== */

const company = {
  key: 'company', label: 'Symbol', cls: 'cl-l cl-first',
  sort: (r) => (r.name || r.symbol).toUpperCase(), numeric: false,
};

const capColumn = { key: 'cap', label: 'Market cap', sort: (r) => r.cap, cell: (r) => figure(big(r.cap), r.cap ? 'USD' : '') };

export const KINDS = {
  economic: {
    key: 'economic', label: 'Economic', title: 'Economic calendar', noun: ['release', 'releases'],
    defaultSort: { key: 'time', dir: 1 },
    columns: [
      { key: 'time', label: 'Time', cls: 'cl-l', sort: (r) => (r.holiday ? -Infinity : r.at.getTime()) },
      { key: 'country', label: 'Country', cls: 'cl-l', sort: (r) => countryName(r.country), numeric: false,
        cell: (r) => el('span', { class: 'cl-country' }, [countryFlag(r.country), el('span', { text: countryName(r.country) })]) },
      { key: 'impact', label: 'Impact', cls: 'cl-c', sort: (r) => r.impact, cell: impactCell },
      { key: 'event', label: 'Event', cls: 'cl-l cl-grow', sort: (r) => r.event.toUpperCase(), numeric: false,
        cell: (r) => el('span', { class: 'cl-event', text: r.event, title: r.event }) },
      { key: 'actual', label: 'Actual', sort: (r) => r.actual },
      { key: 'estimate', label: 'Forecast', sort: (r) => r.estimate, cell: (r) => econValue(r.estimate, r.unit) },
      { key: 'previous', label: 'Prior', sort: (r) => r.previous, cell: (r) => econValue(r.previous, r.unit) },
    ],
  },
  earnings: {
    key: 'earnings', label: 'Earnings', title: 'Earnings calendar', noun: ['company', 'companies'],
    defaultSort: { key: 'cap', dir: -1 },
    columns: [
      company,
      { key: 'when', label: 'Time', cls: 'cl-l', sort: (r) => ({ bmo: 0, amc: 2 }[r.time] ?? 1), cell: (r) => reportTime(r.time) },
      { key: 'period', label: 'Period', cls: 'cl-l', sort: (r) => r.periodEnding || '', numeric: false,
        cell: (r) => (r.fiscalPeriod ? el('span', { text: `${r.fiscalPeriod} ${r.fiscalYear || ''}`.trim(),
          title: r.periodEnding ? `Period ending ${shortDate(r.periodEnding)}` : null }) : DASH) },
      { key: 'epsEst', label: 'EPS estimate', sort: (r) => r.epsEstimated, cell: (r) => figure(perShare(r.epsEstimated), unitOf(r)) },
      { key: 'eps', label: 'EPS reported', sort: (r) => r.epsActual, cell: (r) => figure(perShare(r.epsActual), unitOf(r)) },
      { key: 'epsSurprise', label: 'Surprise', sort: (r) => surprise(r.epsActual, r.epsEstimated), cell: (r) => signed(surprise(r.epsActual, r.epsEstimated)) },
      { key: 'revEst', label: 'Revenue estimate', sort: (r) => r.revenueEstimated, cell: (r) => figure(big(r.revenueEstimated), unitOf(r)) },
      { key: 'rev', label: 'Revenue reported', sort: (r) => r.revenueActual, cell: (r) => figure(big(r.revenueActual), unitOf(r)) },
      { key: 'revSurprise', label: 'Surprise', sort: (r) => surprise(r.revenueActual, r.revenueEstimated, 0), cell: (r) => signed(surprise(r.revenueActual, r.revenueEstimated, 0)) },
      capColumn,
    ],
  },
  dividends: {
    key: 'dividends', label: 'Dividends', title: 'Dividend calendar', noun: ['payer', 'payers'],
    defaultSort: { key: 'cap', dir: -1 },
    dayLabel: 'Ex-dividend',
    columns: [
      company,
      { key: 'amount', label: 'Amount', sort: (r) => r.dividend, cell: (r) => figure(perShare(r.dividend), unitOf(r)) },
      // Already a percentage in the vendor's feed, not a fraction.
      { key: 'yield', label: 'Yield', sort: (r) => (isNum(r.yield) && r.yield > 0 ? r.yield : null),
        cell: (r) => (isNum(r.yield) && r.yield > 0 ? `${trim(r.yield, 2)}%` : DASH) },
      { key: 'freq', label: 'Frequency', cls: 'cl-l', sort: (r) => r.frequency || '', numeric: false, cell: (r) => r.frequency || DASH },
      { key: 'record', label: 'Record date', sort: (r) => r.recordDate || '', numeric: false, cell: (r) => shortDate(r.recordDate) || DASH },
      { key: 'pay', label: 'Payment date', sort: (r) => r.paymentDate || '', numeric: false, cell: (r) => shortDate(r.paymentDate) || DASH },
      capColumn,
    ],
  },
  ipos: {
    key: 'ipos', label: 'IPO', title: 'IPO calendar', noun: ['listing', 'listings'],
    defaultSort: { key: 'cap', dir: -1 },
    // Not yet trading, so there is no report to open.
    noReport: true,
    columns: [
      company,
      { key: 'exchange', label: 'Exchange', cls: 'cl-l', sort: (r) => r.exchange, numeric: false, cell: (r) => r.exchange || DASH },
      { key: 'status', label: 'Status', cls: 'cl-l', sort: (r) => r.status, numeric: false,
        cell: (r) => (r.status ? el('span', { class: `cl-tag cl-tag--${r.status.toLowerCase()}`, text: r.status }) : DASH) },
      { key: 'range', label: 'Price range', sort: (r) => r.low,
        cell: (r) => figure(r.low == null ? null : r.low === r.high ? dec(r.low, 2) : `${dec(r.low, 2)} – ${dec(r.high, 2)}`, 'USD') },
      { key: 'shares', label: 'Shares offered', sort: (r) => r.shares, cell: (r) => (r.shares ? r.shares.toLocaleString('en-US') : DASH) },
      { key: 'deal', label: 'Deal size', title: 'Shares offered at the midpoint of the price range', sort: (r) => r.deal,
        cell: (r) => figure(big(r.deal), 'USD') },
      { ...capColumn, title: 'The valuation the vendor gives the offer' },
    ],
  },
  splits: {
    key: 'splits', label: 'Splits', title: 'Split calendar', noun: ['split', 'splits'],
    defaultSort: { key: 'cap', dir: -1 },
    columns: [
      company,
      { key: 'ratio', label: 'Ratio', sort: (r) => ratioOf(r)?.forOne, cell: (r) => ratioOf(r)?.text || DASH },
      { key: 'type', label: 'Type', cls: 'cl-l', sort: (r) => ratioOf(r)?.forOne ?? 0,
        cell: (r) => { const s = ratioOf(r); return s ? (s.forOne >= 1 ? 'Split' : 'Reverse split') : DASH; } },
      capColumn,
    ],
  },
};

export const KIND_ORDER = ['economic', 'earnings', 'dividends', 'ipos', 'splits'];

/** A split as the ratio a reader says out loud: 4-for-1, or 1-for-20. */
function ratioOf(r) {
  const n = r.numerator;
  const d = r.denominator;
  if (!isNum(n) || !isNum(d) || !d) return null;
  return { forOne: n / d, text: `${trim(n, 4)}-for-${trim(d, 4)}` };
}

/** How many rows a day shows before the reader asks for the rest. */
const LIMIT = 100;

/* ==========================================================================
   The page
   ========================================================================== */

export function renderCalendarPage(nav = {}) {
  const params = new URLSearchParams(location.search);
  const today = todayUtc();
  const askedKind = String(params.get('kind') || '').toLowerCase();
  const askedWeek = mondayOf(fromIso(params.get('week')) || today);
  const askedDay = fromIso(params.get('day'));

  const state = {
    kind: KINDS[askedKind] ? askedKind : 'earnings',
    week: askedWeek,
    day: iso(askedDay && iso(mondayOf(askedDay)) === iso(askedWeek) ? askedDay
      : iso(mondayOf(today)) === iso(askedWeek) ? today : askedWeek),
    // The US by default: it is where the directory has names and sizes, and a
    // day of every exchange is a thousand rows most of them unnamed.
    market: US,
    country: 'all',
    impact: 'all',
    query: '',
    sort: null,
    expanded: false,
  };

  let disposed = false;
  const weeks = new Map();
  // Symbol -> name and size. Null while in flight; an empty Map without a key
  // or if both screens fail, in which case rows keep their tickers.
  let directory = null;
  if (hasApiKey()) {
    loadDirectory().catch(() => new Map()).then((map) => { directory = map; if (!disposed) draw(); });
  } else {
    directory = new Map();
  }

  const open = (symbol) => (nav.goSymbol || nav.openSymbol)?.(symbol);

  /* ---------- the week, loaded once --------------------------------------- */

  function week(monday) {
    const key = iso(monday);
    if (weeks.has(key)) return weeks.get(key);
    const w = { key, data: {} };
    weeks.set(key, w);
    for (const kind of KIND_ORDER) {
      if (!hasApiKey()) { w.data[kind] = { status: 'skipped', rows: [] }; continue; }
      loadKind(kind, monday).then((res) => {
        w.data[kind] = res;
        if (!disposed && iso(state.week) === key) draw();
      });
    }
    return w;
  }

  /** The kind's rows under the page's own filters, one per company. The
      search box is not one of them: it narrows the table, not the counts. */
  function scoped(kind, rows) {
    if (kind === 'economic') {
      const min = { all: -1, medium: 2, high: 3 }[state.impact];
      return {
        rows: rows.filter((r) => (r.holiday ? state.impact === 'all' : r.impact >= min)
          && (state.country === 'all' || (state.country === 'g20' ? G20.has(r.country) : r.country === state.country))),
        removed: 0,
      };
    }
    const kept = rows.filter((r) => state.market === 'all' || r.market === state.market);
    return kind === 'ipos' ? { rows: kept, removed: 0 } : dedupeEvents(kept, kind);
  }

  /** Every loaded kind, filtered and split by day: what the strip counts. */
  function byDay(w) {
    const out = {};
    for (const kind of KIND_ORDER) {
      const res = w.data[kind];
      if (!res || res.status !== 'ok') continue;
      const { rows, removed } = scoped(kind, res.rows);
      const days = new Map();
      for (const r of rows) {
        if (!days.has(r.day)) days.set(r.day, []);
        days.get(r.day).push(r);
      }
      out[kind] = { days, removed };
    }
    return out;
  }

  /* ---------- the head ------------------------------------------------------ */

  const rangeTitle = el('h2', { class: 'cl-range' });
  const picker = el('input', {
    type: 'date', class: 'cl-picker', tabindex: '-1', 'aria-hidden': 'true',
    onchange: (e) => { const d = fromIso(e.target.value); if (d) goTo(d); },
  });
  const pick = el('button', {
    type: 'button', class: 'cl-btn cl-btn--icon', 'aria-label': 'Go to a date', title: 'Go to a date',
    onclick: () => {
      picker.value = state.day;
      try { picker.showPicker(); } catch { picker.focus(); }
    },
  }, [icon(ICON.calendar)]);

  const head = el('header', { class: 'cl-head' }, [
    el('div', { class: 'cl-top' }, [
      el('h1', { class: 'cl-title', text: 'Calendar' }),
      el('span', { class: 'cl-zone', text: `Times in your time zone · ${zoneLabel()}` }),
    ]),
    el('div', { class: 'cl-tools' }, [
      el('button', { type: 'button', class: 'cl-btn', text: 'Today', onclick: () => goTo(todayUtc()) }),
      el('span', { class: 'cl-pickwrap' }, [pick, picker]),
      el('button', { type: 'button', class: 'cl-btn cl-btn--icon', 'aria-label': 'Previous week', title: 'Previous week',
        onclick: () => shift(-7) }, [icon(ICON.prev)]),
      el('button', { type: 'button', class: 'cl-btn cl-btn--icon', 'aria-label': 'Next week', title: 'Next week',
        onclick: () => shift(7) }, [icon(ICON.next)]),
      rangeTitle,
    ]),
  ]);

  function goTo(date) {
    state.week = mondayOf(date);
    state.day = iso(date);
    state.expanded = false;
    draw();
  }
  function shift(days) {
    state.week = addDays(state.week, days);
    state.day = iso(addDays(fromIso(state.day), days));
    state.expanded = false;
    draw();
  }

  /* ---------- the strip, the pills, the filters, the table ----------------- */

  const strip = el('div', { class: 'cl-week', role: 'group', 'aria-label': 'Days of the week' });
  const kinds = el('div', { class: 'cl-kinds', role: 'group', 'aria-label': 'Calendar' });
  const filters = el('div', { class: 'cl-filters' });
  const table = el('section', { class: 'cl-day', 'aria-live': 'polite' });
  const coverage = el('details', { class: 'mh-coverage' });

  const search = el('input', {
    type: 'search', class: 'cl-input', placeholder: 'Search', 'aria-label': 'Search this day',
    oninput: (e) => { state.query = e.target.value.trim().toUpperCase(); state.expanded = false; paintTable(week(state.week)); },
  });

  function select(label, value, options, onChange) {
    const sel = el('select', { class: 'cl-input', 'aria-label': label, onchange: (e) => onChange(e.target.value) },
      options.map((o) => el('option', { value: o.value, text: o.label, selected: o.value === value ? 'selected' : null })));
    sel.value = value;
    return sel;
  }

  function paintStrip(w, split) {
    const todayIso = iso(todayUtc());
    strip.replaceChildren(...[0, 1, 2, 3, 4, 5, 6].map((n) => {
      const d = addDays(state.week, n);
      const day = iso(d);
      const lines = KIND_ORDER.map((kind) => {
        const res = w.data[kind];
        if (!res) return el('span', { class: 'cl-card__row is-loading' }, [el('span', { text: KINDS[kind].label }), el('span', { class: 'sk cl-sk' })]);
        const count = split[kind]?.days.get(day)?.length || 0;
        if (!count) return null;
        return el('span', { class: `cl-card__row${kind === state.kind ? ' is-kind' : ''}` }, [
          el('span', { text: KINDS[kind].label }), el('span', { text: count.toLocaleString('en-US') }),
        ]);
      }).filter(Boolean);
      const selected = day === state.day;
      return el('button', {
        type: 'button', class: `cl-card${selected ? ' is-selected' : ''}${day === todayIso ? ' is-today' : ''}`,
        'aria-pressed': String(selected),
        onclick: () => { if (state.day !== day) { state.day = day; state.expanded = false; draw(); } },
      }, [
        el('span', { class: 'cl-card__day' }, [
          el('span', { class: 'cl-card__name', text: `${weekday(d)} ${d.getUTCDate()}` }),
          day === todayIso ? el('span', { class: 'cl-card__today', text: 'Today' }) : null,
        ]),
        el('span', { class: 'cl-card__rows' }, lines.length ? lines
          : [el('span', { class: 'cl-card__none', text: hasApiKey() ? 'Nothing scheduled' : 'No data' })]),
      ]);
    }));
  }

  function paintKinds() {
    kinds.replaceChildren(...KIND_ORDER.map((kind) => el('button', {
      type: 'button', class: kind === state.kind ? 'is-active' : '',
      'aria-pressed': String(kind === state.kind), text: KINDS[kind].label,
      onclick: () => {
        if (state.kind === kind) return;
        state.kind = kind; state.sort = null; state.query = ''; state.expanded = false;
        search.value = '';
        draw();
      },
    })));
  }

  function paintFilters(w) {
    const res = w.data[state.kind];
    const rows = res?.status === 'ok' ? res.rows : [];
    const controls = [];
    if (state.kind === 'economic') {
      const counts = new Map();
      for (const r of rows) counts.set(r.country, (counts.get(r.country) || 0) + 1);
      const countries = [...counts.entries()].sort((a, b) => b[1] - a[1] || countryName(a[0]).localeCompare(countryName(b[0])));
      if (state.country !== 'all' && state.country !== 'g20' && !counts.has(state.country)) state.country = 'all';
      controls.push(
        select('Country', state.country, [
          { value: 'all', label: 'All countries' }, { value: 'g20', label: 'G20 economies' },
          ...countries.map(([code, n]) => ({ value: code, label: `${countryName(code)} (${n})` })),
        ], (v) => { state.country = v; state.expanded = false; draw(); }),
        select('Impact', state.impact, [
          { value: 'all', label: 'All impact' }, { value: 'medium', label: 'Medium and high' }, { value: 'high', label: 'High impact' },
        ], (v) => { state.impact = v; state.expanded = false; draw(); }),
      );
    } else {
      const counts = new Map();
      for (const r of rows) counts.set(r.market, (counts.get(r.market) || 0) + 1);
      const others = [...counts.entries()].filter(([m]) => m !== US).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (state.market !== 'all' && state.market !== US && !counts.has(state.market)) state.market = US;
      controls.push(select('Market', state.market, [
        { value: US, label: US }, { value: 'all', label: 'All markets' },
        ...others.map(([m, n]) => ({ value: m, label: `${m} (${n.toLocaleString('en-US')})` })),
      ], (v) => { state.market = v; state.expanded = false; draw(); }));
    }
    search.placeholder = state.kind === 'economic' ? 'Search events' : 'Search symbols';
    controls.push(search);
    filters.replaceChildren(...controls);
  }

  /* ---------- the table ------------------------------------------------------ */

  let nextAt = null;   // the instant the "next release" marker is drawn for

  function paintTable(w, split = byDay(w)) {
    const kind = KINDS[state.kind];
    const res = w.data[state.kind];
    const date = fromIso(state.day);
    const bar = (count, extra = []) => el('div', { class: 'cl-daybar' }, [
      el('span', { class: 'cl-daybar__date', text: `${kind.dayLabel ? `${kind.dayLabel} · ` : ''}${longDay(date)}` }),
      count != null ? el('span', { class: 'cl-daybar__n', text: `${count.toLocaleString('en-US')} ${kind.noun[count === 1 ? 0 : 1]}` }) : null,
      ...extra,
    ]);

    if (!res || (state.kind !== 'economic' && !kind.noReport && directory === null)) {
      table.replaceChildren(bar(null), skeletonRows());
      return;
    }
    if (res.status !== 'ok') {
      table.replaceChildren(bar(null), unavailable(res, kind));
      return;
    }

    const all = split[state.kind]?.days.get(state.day) || [];
    const removed = split[state.kind]?.removed || 0;
    const q = state.query;
    let rows = all.map((r) => enrich(r));
    if (q) {
      rows = rows.filter((r) => (state.kind === 'economic'
        ? `${r.event} ${countryName(r.country)} ${r.country}`
        : `${r.symbol} ${r.name || ''}`).toUpperCase().includes(q));
    }

    const sort = state.sort || kind.defaultSort;
    const column = kind.columns.find((c) => c.key === sort.key) || kind.columns[0];
    rows.sort((a, b) => compare(column.sort(a), column.sort(b), sort.dir)
      || (state.kind === 'economic' ? b.impact - a.impact : 0)
      || String(a.symbol || a.event).localeCompare(String(b.symbol || b.event)));

    if (!rows.length) {
      table.replaceChildren(bar(0), emptyDay(kind, all.length, w));
      return;
    }

    const shown = state.expanded ? rows : rows.slice(0, LIMIT);
    const merged = removed && state.kind !== 'economic'
      ? el('span', { class: 'cl-daybar__note', text: `${removed.toLocaleString('en-US')} duplicate listing${removed === 1 ? '' : 's'} merged this week` })
      : null;

    // On today's economic calendar, in time order: the first release still
    // to come gets the marker, and a line is drawn where "now" falls.
    const live = state.kind === 'economic' && state.day === iso(todayUtc()) && column.key === 'time' && sort.dir === 1;
    const now = Date.now();
    const next = live ? shown.find((r) => !r.holiday && r.at.getTime() > now) : null;
    nextAt = next ? next.at.getTime() : null;

    const body = el('tbody');
    for (const r of shown) {
      if (next && r === next) {
        body.append(el('tr', { class: 'cl-now', 'aria-hidden': 'true' }, [
          el('td', { colspan: String(kind.columns.length) }, [el('span', { class: 'cl-now__tag', text: `Now ${localTime(new Date(now))}` })]),
        ]));
      }
      body.append(row(r, kind, r === next));
    }

    table.replaceChildren(
      bar(rows.length, [merged]),
      el('div', { class: 'cl-scroll', role: 'region', 'aria-label': `${kind.title}, ${longDay(date)}`, tabindex: '0' }, [
        el('table', { class: `cl-table cl-table--${state.kind}` }, [header(kind, sort), body]),
      ]),
      rows.length > shown.length
        ? el('button', { type: 'button', class: 'cl-more', text: `Show all ${rows.length.toLocaleString('en-US')}`,
          onclick: () => { state.expanded = true; paintTable(week(state.week)); } })
        : null,
    );
  }

  /** A row with the directory's name and size joined on, for this draw only. */
  function enrich(r) {
    if (state.kind === 'economic') return r;
    if (state.kind === 'ipos') return r;
    const hit = directory?.get(String(r.symbol).toUpperCase());
    return { ...r, name: hit?.name || '', cap: hit?.cap ?? null };
  }

  function header(kind, sort) {
    return el('thead', {}, [el('tr', {}, kind.columns.map((c) => {
      const on = c.key === sort.key;
      return el('th', {
        scope: 'col', class: `${c.cls || 'cl-r'}${on ? ' is-sorted' : ''}`,
        'aria-sort': on ? (sort.dir > 0 ? 'ascending' : 'descending') : null, title: c.title || null,
      }, [el('button', {
        type: 'button', class: 'cl-sort',
        onclick: () => {
          const numeric = c.numeric !== false && c.key !== 'time';
          state.sort = on ? { key: c.key, dir: -sort.dir } : { key: c.key, dir: numeric ? -1 : 1 };
          paintTable(week(state.week));
        },
      }, [c.label, on ? el('span', { class: 'cl-sort__dir', 'aria-hidden': 'true', text: sort.dir > 0 ? '↑' : '↓' }) : null])]);
    }))]);
  }

  function row(r, kind, isNext) {
    const cells = kind.columns.map((c) => {
      let content;
      if (c.key === 'company') content = companyCell(r, kind);
      else if (c.key === 'time') content = timeCell(r, isNext);
      else if (c.key === 'actual') content = actualCell(r);
      else content = c.cell(r);
      return el('td', { class: c.cls || 'cl-r' }, [content]);
    });
    return el('tr', { class: `${r.holiday ? 'is-holiday' : ''}${isNext ? ' is-next' : ''}`.trim() || null }, cells);
  }

  function companyCell(r, kind) {
    const also = r.alsoListed?.length ? ` · also listed as ${[...new Set(r.alsoListed)].sort().join(', ')}` : '';
    const parts = [
      instrumentMark({ symbol: r.symbol, kind: 'stock' }),
      el('span', { class: 'cl-co__sym', text: shortSymbol(r.symbol) }),
      el('span', { class: 'cl-co__name', text: r.name || (r.market !== US ? r.market : '') }),
    ];
    if (kind.noReport) return el('span', { class: 'cl-co', title: `${r.symbol}${r.name ? ` · ${r.name}` : ''}` }, parts);
    return el('button', {
      type: 'button', class: 'cl-co', title: `Open ${r.symbol}${r.name ? ` · ${r.name}` : ''}${also}`,
      onclick: () => open(r.symbol),
    }, parts);
  }

  function timeCell(r, isNext) {
    if (r.holiday) return el('span', { class: 'cl-time', text: 'All day' });
    return el('span', { class: `cl-time${isNext ? ' is-next' : ''}`, text: localTime(r.at) });
  }

  function actualCell(r) {
    if (isNum(r.actual)) return el('strong', { class: 'cl-actual', text: econValue(r.actual, r.unit) });
    const wait = !r.holiday ? r.at.getTime() - Date.now() : -1;
    // Due within the day: say when, and keep saying it — the ticker below
    // rewrites every `data-at` cell each half minute.
    if (wait > 0 && wait < DAY_MS) return el('span', { class: 'cl-soon', 'data-at': String(r.at.getTime()), text: countdown(wait) });
    return DASH;
  }

  function emptyDay(kind, before, w) {
    const lines = [];
    if (state.query) lines.push(`Nothing on this day matches “${search.value}”.`);
    else if (before) lines.push('Nothing on this day passes the filters above.');
    else lines.push(`Nothing on the ${kind.title.toLowerCase()} for ${longDay(fromIso(state.day))}.`);
    // The US filter is the default, so an empty US day with rows elsewhere
    // should say so — and offer the way to them — rather than read as quiet.
    let widen = null;
    if (!state.query && state.kind !== 'economic' && state.market === US) {
      const res = w.data[state.kind];
      const elsewhere = (res?.rows || []).filter((r) => r.day === state.day && r.market !== US).length;
      if (elsewhere) {
        widen = el('button', { type: 'button', class: 'cl-btn', text: `Show ${elsewhere.toLocaleString('en-US')} in other markets`,
          onclick: () => { state.market = 'all'; draw(); } });
      }
    }
    return el('div', { class: 'mh-empty mh-empty--compact cl-empty', role: 'status' }, [
      el('strong', { text: lines[0] }), widen,
    ]);
  }

  /* ---------- the coverage note --------------------------------------------- */

  function paintCoverage() {
    const lines = {
      economic: [
        'From FMP’s economic calendar. Each release is timed in UTC by the vendor and shown here at your own clock time '
          + `(${zoneLabel()}), filed under your own day; public holidays stay on their date.`,
        'Impact is the vendor’s own three-level grade. Actual, forecast and prior are printed as supplied, with the '
          + 'vendor’s unit; nothing is coloured as better or worse, because whether a higher number is good news depends '
          + 'on the release.',
      ],
      earnings: [
        'From FMP’s earnings calendar, with report times where the vendor has one: before the open, or after the close.',
        'Surprise is (reported − estimate) ÷ |estimate|, left empty when the estimate is too small to divide by.',
      ],
      dividends: ['From FMP’s dividend calendar, by ex-dividend date — the first day the shares trade without the payment. '
        + 'Buying on this day does not earn it. Yield is the vendor’s own figure.'],
      ipos: ['From FMP’s IPO calendar, which names each company itself. Deal size is the shares offered at the midpoint of '
        + 'the price range, so it is shown only where both are published; market cap is the vendor’s valuation of the offer.'],
      splits: ['From FMP’s split calendar, by effective date. A split changes the number of shares and the price per share '
        + 'and nothing else.'],
    }[state.kind];
    const isCompany = state.kind !== 'economic' && state.kind !== 'ipos';
    if (isCompany) {
      lines.push('The feed carries a ticker and a date and nothing else. US names and market caps come from two screener '
        + 'calls — companies and funds — so a listing outside the US, or one the screener does not carry, shows its ticker '
        + 'and market only and sorts after the rest.');
      lines.push('One row per company: the same company listed on several exchanges, or as a second share class, is merged '
        + 'into its plainest listing, and the bar above the table says how many were.');
    }
    lines.push('Market-wide data from Financial Modeling Prep, which may be delayed. Nothing here is ranked for you, scored or '
      + 'recommended.');
    coverage.replaceChildren(
      el('summary', { text: 'Where this calendar comes from' }),
      el('div', {}, lines.map((line) => el('p', { text: line }))),
    );
  }

  /* ---------- drawing ---------------------------------------------------------- */

  function draw() {
    if (disposed) return;
    const w = week(state.week);
    const split = byDay(w);
    rangeTitle.textContent = rangeLabel(state.week);
    try { document.title = `${KINDS[state.kind].title} — Vanlior`; } catch { /* no document */ }
    syncUrl();
    paintStrip(w, split);
    // On a phone the strip scrolls sideways, and Thursday opens off the edge.
    // Centre the chosen day — within the strip only, never scrolling the page.
    // A timeout rather than a frame: a hidden tab suspends animation frames,
    // and layout is measurable either way once the caller has mounted the page.
    setTimeout(() => {
      const card = strip.querySelector('.cl-card.is-selected');
      if (!card || strip.scrollWidth <= strip.clientWidth) return;
      const s = strip.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      strip.scrollLeft += c.left - s.left - (s.width - c.width) / 2;
    }, 0);
    paintKinds();
    paintFilters(w);
    paintTable(w, split);
    paintCoverage();
  }

  /** Keep the URL on what is being read, so a copied link lands there. */
  function syncUrl() {
    try {
      const url = new URL(location.href);
      url.searchParams.set('view', 'calendar');
      url.searchParams.set('kind', state.kind);
      url.searchParams.set('week', iso(state.week));
      url.searchParams.set('day', state.day);
      // Replace, not push: paging through six weeks is not six pages to back
      // out through.
      history.replaceState(history.state, '', url);
    } catch { /* no history to write to */ }
  }

  /* The countdowns and the "now" line on today's economic calendar. Half a
     minute is fine-grained enough for a countdown to the minute; the table
     is only redrawn when a release actually passes the line. */
  const ticker = setInterval(() => {
    if (disposed) { clearInterval(ticker); return; }
    if (state.kind !== 'economic' || state.day !== iso(todayUtc())) return;
    if (nextAt != null && Date.now() >= nextAt) { paintTable(week(state.week)); return; }
    for (const cell of table.querySelectorAll('[data-at]')) {
      const wait = Number(cell.dataset.at) - Date.now();
      cell.textContent = wait > 0 ? countdown(wait) : DASH;
    }
  }, 30000);

  const page = el('main', { class: 'mh-page cl-page', id: 'calendar' }, [
    head, strip,
    el('div', { class: 'cl-bar' }, [kinds, filters]),
    table,
    coverage,
  ]);
  page.dispose = () => { disposed = true; clearInterval(ticker); };

  draw();
  return page;
}

/* ==========================================================================
   Pieces
   ========================================================================== */

/** Compare two sort values in `dir`, with blanks always last. */
function compare(a, b, dir) {
  const blank = (v) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v) && v !== -Infinity);
  if (blank(a) && blank(b)) return 0;
  if (blank(a)) return 1;
  if (blank(b)) return -1;
  if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b)) * dir;
  return (a - b) * dir;
}

function skeletonRows() {
  return el('div', { class: 'cl-skeleton', 'aria-busy': 'true' },
    Array.from({ length: 8 }, () => el('div', { class: 'cl-skeleton__row' }, [el('span', { class: 'sk' }), el('span', { class: 'sk' })])));
}

/**
 * Why a kind has nothing to show. The calendars are date-relative and cannot
 * be bundled — a saved copy of next week's events is wrong by the week after —
 * so unlike most of the app this page has no offline fallback to degrade to.
 */
function unavailable(res, kind) {
  const name = kind.title.toLowerCase();
  const message = res.status === 'skipped'
    ? 'Add your Financial Modeling Prep API key in Settings to load the calendar. There is no bundled copy: a saved '
      + 'week of events would be wrong by the week after.'
    : res.status === 'gated'
      ? `The ${name} is not included in the FMP plan behind your key.`
      : `The ${name} could not be loaded${res.message ? ` — ${res.message}` : ''}.`;
  return emptyState(res.status === 'skipped' ? 'skipped' : res.status === 'gated' ? 'gated' : 'error', message, true);
}
