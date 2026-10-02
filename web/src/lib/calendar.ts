// Ported from assets/js/calendar.js (the pure half: weeks, markets, the
// one-row-per-company merge, the feed readers and the fetches) — logic
// unchanged; types added for the port. The page is components/pages/calendar-page.tsx.
import { isNum, trim, dec } from './format';
import { fetchCalendar, fetchScreener, fetchMarket, fetchHubFeed } from './fmp';

/* ==========================================================================
   Dates

   Company dates are handled as UTC midnights, so a `YYYY-MM-DD` never moves
   a day either way depending on where the reader is sitting. "Today" is the
   reader's own calendar date, written the same way.
   ========================================================================== */

export const DAY_MS = 24 * 3600 * 1000;

/** `YYYY-MM-DD` from a UTC-midnight Date. */
export const iso = (d: any) => d.toISOString().slice(0, 10);

/** A UTC midnight Date from a `YYYY-MM-DD` string, or null. `Date.UTC` rolls
    month 13 into next January, so the date must read back as it was written. */
export function fromIso(s: any) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) || iso(d) !== m[0] ? null : d;
}

/** The Monday of whatever week `date` falls in, at UTC midnight. */
export function mondayOf(date: any) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay is 0 for Sunday, so the week is shifted to start on Monday
  // first — otherwise a Sunday jumps forward six days instead of back one.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export const addDays = (d: any, n: any) => new Date(d.getTime() + n * DAY_MS);

/** The reader's own calendar date, as a UTC midnight. */
export function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const weekday = (d: any) => WEEKDAY[(d.getUTCDay() + 6) % 7];
export const longDay = (d: any) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const shortDate = (s: any) => {
  const d = fromIso(String(s || '').slice(0, 10));
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
};

/** "Sep 21 — Sep 27, 2026", the way TradingView heads its week. */
export function rangeLabel(monday: any) {
  const end = addDays(monday, 6);
  const md = (d: any) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${md(monday)} — ${md(end)}, ${end.getUTCFullYear()}`;
}

/** A release's instant. The vendor writes UTC as `YYYY-MM-DD HH:MM:SS`. */
function releaseAt(s: any) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The reader's own calendar day for an instant. */
const localDay = (d: any) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const localTime = (d: any) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "UTC+2", "UTC−5", "UTC+5:30" — the zone every release time is shown in. */
export function zoneLabel(now = new Date()) {
  const m = -now.getTimezoneOffset();
  if (!m) return 'UTC';
  const a = Math.abs(m);
  return `UTC${m > 0 ? '+' : '−'}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
}

/** "in 2h 05m", "in 12m" — how long until a release, to the minute. */
export function countdown(ms: any) {
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

export const US = 'United States';

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
export function marketOf(symbol: any) {
  const s = String(symbol || '');
  const at = s.lastIndexOf('.');
  const suffix = at > 0 ? s.slice(at + 1).toUpperCase() : '';
  return (MARKETS as any)[suffix] || 'Other markets';
}

/** The part of the symbol a reader recognises, without its exchange tag. */
export function shortSymbol(symbol: any) {
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
export function symbolRoot(symbol: any) {
  const s = String(symbol || '').toUpperCase();
  const at = s.lastIndexOf('.');
  const base = at > 0 ? s.slice(0, at) : s;
  const dash = base.lastIndexOf('-');
  return (dash > 0 && base.length - dash <= 3) ? base.slice(0, dash) : base;
}

/** How many of the fields that carry information are filled. */
function richness(r: any) {
  return ['epsActual', 'epsEstimated', 'revenueActual', 'revenueEstimated', 'time',
    'dividend', 'yield', 'frequency', 'paymentDate', 'recordDate', 'numerator', 'denominator']
    .reduce((n, k) => n + (r[k] == null ? 0 : 1), 0);
}

/** Which of two rows for one company to keep: the plainest symbol, then the
    fuller row, then alphabetical so the choice does not wander between draws. */
function preferred(a: any, b: any) {
  const plain = (r: any) => (r.symbol.includes('.') ? 1 : 0) + (r.symbol.includes('-') ? 1 : 0);
  const pa = plain(a); const pb = plain(b);
  if (pa !== pb) return pa < pb ? a : b;
  const ra = richness(a); const rb = richness(b);
  if (ra !== rb) return ra > rb ? a : b;
  return a.symbol.localeCompare(b.symbol) <= 0 ? a : b;
}

/** The event's own numbers as a key, or null where they cannot identify it. */
function fingerprint(r: any, kindKey: any) {
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
export function dedupeEvents(rows: any, kindKey: any) {
  const collapse = (list: any, keyOf: any) => {
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
  const fresh = rows.map((r: any) => ({ ...r, alsoListed: undefined }));
  const byEvent = collapse(collapse(fresh, (r: any) => symbolRoot(r.symbol)), (r: any) => fingerprint(r, kindKey));
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

export function countryName(code: any) {
  const raw = String(code || '').toUpperCase();
  if (raw === 'EU' || raw === 'EMU') return 'Euro area';
  const isoCode = (COUNTRY_ALIAS as any)[raw] || raw;
  try { return REGION_NAMES?.of(isoCode) || raw; } catch { return raw; }
}

/** The G20, with the euro area standing in for the EU member seat. */
export const G20 = new Set(['US', 'EU', 'UK', 'GB', 'JP', 'CN', 'DE', 'FR', 'IT', 'CA', 'AU', 'KR',
  'IN', 'BR', 'MX', 'RU', 'ZA', 'TR', 'SA', 'ID', 'AR']);

const IMPACT = { high: 3, medium: 2, low: 1, none: 0 };

/* ==========================================================================
   Reading each feed into rows

   Every row gets a `day` — the date it is filed under on the strip — and the
   company kinds get a `market`. Nothing else is renamed: a row keeps the
   vendor's own fields, so a column is one property read away from the feed.
   ========================================================================== */

/** Economic releases filed under the reader's own days, for one week. */
export function economicRows(data: any, monday: any) {
  const first = iso(monday);
  const last = iso(addDays(monday, 6));
  const out = [];
  for (const r of Array.isArray(data) ? data : []) {
    if (!r || !r.event) continue;
    const at = releaseAt(r.date);
    if (!at) continue;
    const impact = (IMPACT as any)[String(r.impact || '').toLowerCase()] ?? 1;
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
export function companyRows(data: any) {
  return (Array.isArray(data) ? data : [])
    .filter((r) => r && r.symbol && fromIso(String(r.date || '').slice(0, 10)))
    .map((r) => ({ ...r, day: String(r.date).slice(0, 10), market: marketOf(r.symbol) }));
}

/** "15.00 - 17.00" -> [15, 17]; "18.00" -> [18, 18]; anything else -> []. */
function priceRange(text: any) {
  const nums = String(text || '').match(/\d+(?:\.\d+)?/g);
  if (!nums) return [];
  const [a, b = a] = nums.map(Number);
  return [Math.min(a, b), Math.max(a, b)];
}

export function ipoRows(data: any) {
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
export async function loadDirectory() {
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
export async function loadKind(key: any, monday: any) {
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
    return { status: 'error', message: String((error as any)?.message || error), rows: [] };
  }
}

export const DASH = '—';

/** 427656250 -> "427.66 M". */
export function big(v: any) {
  if (!isNum(v)) return null;
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  for (const [n, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as [number, string][]) {
    if (a >= n) return `${sign}${dec(a / n, 2)} ${u}`;
  }
  return `${sign}${trim(a, 2)}`;
}

/** A per-share figure: two decimals, four under a cent. */
export const perShare = (v: any) => (isNum(v) ? `${v < 0 ? '−' : ''}${dec(Math.abs(v), Math.abs(v) > 0 && Math.abs(v) < 0.01 ? 4 : 2)}` : null);

/** The listing currency, where it is known. The feeds name none, so it is
    stated only for a US line, which is dollars. */
export const unitOf = (r: any) => (r.market === US ? 'USD' : '');

/** (actual − estimate) / |estimate|. Empty against an estimate too small to
    divide by: consensus of a cent turns any result into four figures. */
export function surprise(actual: any, estimate: any, floor = 0.005) {
  if (!isNum(actual) || !isNum(estimate) || Math.abs(estimate) <= floor) return null;
  return (actual - estimate) / Math.abs(estimate);
}

/** An economic figure with its unit: 4.5%, 201K, 52.5. */
export function econValue(v: any, unit: any) {
  if (!isNum(v)) return DASH;
  const n = `${v < 0 ? '−' : ''}${trim(Math.abs(v), 3)}`;
  if (unit === '%') return `${n}%`;
  if (['K', 'M', 'B', 'T'].includes(unit)) return `${n}${unit}`;
  return n;
}

/** A split as the ratio a reader says out loud: 4-for-1, or 1-for-20. */
export function ratioOf(r: any) {
  const n = r.numerator;
  const d = r.denominator;
  if (!isNum(n) || !isNum(d) || !d) return null;
  return { forOne: n / d, text: `${trim(n, 4)}-for-${trim(d, 4)}` };
}

/** Compare two sort values in `dir`, with blanks always last. */
export function compare(a: any, b: any, dir: any) {
  const blank = (v: any) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v) && v !== -Infinity);
  if (blank(a) && blank(b)) return 0;
  if (blank(a)) return 1;
  if (blank(b)) return -1;
  if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b)) * dir;
  return (a - b) * dir;
}
