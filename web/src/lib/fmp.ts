/* ==========================================================================
   Maz Vantage — Financial Modeling Prep connector

   One place that knows how to talk to FMP. Everything else in the app
   consumes the normalised `Dataset` produced by `loadDataset()` and never
   touches a URL.

   Design notes
   ------------
   * Every feed is optional. FMP gates endpoints by plan tier, so a feed can
     come back as {status:'gated'} and the UI degrades to a notice instead of
     breaking. `Dataset.feeds` records what happened to each request.
   * Responses are cached per (symbol, feed) for CACHE_TTL so switching
     between sections/tickers does not burn quota.
   * With no API key the connector serves the bundled snapshot in
     public/data/, so the report renders offline.

   What changed in the port
   ------------------------
   Requests no longer go to financialmodelingprep.com from the browser. They
   go to this app's own `/api/data/<path>` route, which adds the key on the
   server: the operator's (`FMP_API_KEY`), or one set through the hidden
   `?apikey=` link. "Is there a key" therefore has two answers, and
   `hasApiKey()` is true for either.

   Readers are never told where the data comes from (2026-10-01): no provider
   name, no "API", no plan names. Every message this module produces is
   written in neutral terms, and the provider's own error text is never
   passed through — the UI prints `message` verbatim in places, so anything
   here is reader-facing. The route, the request header and the storage key
   are neutral for the same reason.
   ========================================================================== */

import { KEY_HEADER } from './fmp/paths';

const PROXY = '/api/data';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_PARALLEL = 5;
const KEY_STORAGE = 'mazvantage.data.key';
/** Where the key lived before the neutral name; moved across once, on first read. */
const OLD_KEY_STORAGE = 'mazvantage.fmp.key';

/* ---------- result shapes -------------------------------------------------- */

export type FeedStatus = 'ok' | 'gated' | 'error' | 'skipped';

export interface FeedResult<T = any> {
  status: FeedStatus;
  data: T | null;
  message?: string;
  /** set when a feed was filled from the bundled snapshot */
  fromSnapshot?: boolean;
  /** the trading day a dated market snapshot landed on */
  date?: string;
  /** the HTTP status of a failed read, for retry decisions only — never shown */
  code?: number;
}

/* ---------- key management ------------------------------------------------ */

let serverKey = false;

/** Called once at boot with whether the operator configured a server key. */
export function setServerKeyAvailable(v: boolean) {
  serverKey = v;
}

export const hasServerKey = () => serverKey;

/* Browser globals are read off `globalThis` rather than `window`, and every
   read is guarded: on the server there is no page (and Node's own experimental
   `localStorage` throws without a backing file), while the ported regression
   suites stub exactly these three globals to drive this module offline. */
const browser = () => globalThis as unknown as Partial<Pick<Window, 'localStorage' | 'location' | 'history'>>;

function storage(): Storage | null {
  try {
    return typeof document === 'undefined' && !browser().location ? null : browser().localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The key set through the hidden `?apikey=` link, if any. There is no field
 * for it in the UI: readers are not told a key exists. The operator's key
 * never reaches the browser.
 */
export function getApiKey(): string {
  const loc = browser().location;
  if (!loc) return '';
  const fromUrl = new URLSearchParams(loc.search).get('apikey');
  if (fromUrl) {
    storage()?.setItem(KEY_STORAGE, fromUrl);
    // Do not leave the key sitting in the address bar / history.
    try {
      const url = new URL(loc.href);
      url.searchParams.delete('apikey');
      browser().history?.replaceState(browser().history?.state, '', url);
    } catch { /* a stubbed location with no href */ }
    return fromUrl;
  }
  const store = storage();
  const old = store?.getItem(OLD_KEY_STORAGE);
  if (old) {
    if (!store?.getItem(KEY_STORAGE)) store?.setItem(KEY_STORAGE, old);
    store?.removeItem(OLD_KEY_STORAGE);
  }
  return store?.getItem(KEY_STORAGE) || '';
}

export function setApiKey(key: string) {
  const k = (key || '').trim();
  if (k) storage()?.setItem(KEY_STORAGE, k);
  else storage()?.removeItem(KEY_STORAGE);
  cache.clear();
}

/** A live request can be made: the reader brought a key, or the server has one. */
export const hasApiKey = () => serverKey || !!getApiKey();

/**
 * The vendor's logo for a symbol.
 *
 * `profile.image` carries this for the company being reported on, but a peer
 * is only ever a symbol and a name, so the peer table has to build the URL.
 * It lives here because this is the one file allowed to know one; callers
 * treat it as a string that may or may not resolve, and fall back when the
 * image 404s.
 */
export function logoUrl(symbol: string | null | undefined): string | null {
  // Through this app's own image route, so no address names the provider.
  return symbol ? `/api/img/i/symbol/${encodeURIComponent(symbol)}.png` : null;
}

/* ---------- feed catalogue ------------------------------------------------
   `path` is appended to the proxy; `params` is a function of the request
   context. `pick` reshapes the raw payload into what the model wants.
   -------------------------------------------------------------------------- */

const YEARS = 10;

/** The most rows the filings search returns in one request. */
export const SEC_FILINGS_CAP = 1000;

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

export interface FeedCtx {
  from: string;
  to: string;
  lastQuarter: { year: number; quarter: number };
  [k: string]: unknown;
}

type Params = Record<string, string | number | boolean>;

interface FeedSpec {
  path: string;
  params: (symbol: string, ctx: FeedCtx) => Params;
  pick?: (x: any) => any;
  altPath?: string;
  marketOnly?: boolean;
  onDemand?: boolean;
}

function first(x: any) {
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

/* `structure: 'flat'` returns one `{ segment: amount }` object per fiscal
   year. The nested alternative wraps the same numbers in a second layer keyed
   by date, which the caller would only have to unwrap again. */
function segParams(symbol: string): Params {
  return { symbol, period: 'annual', structure: 'flat' };
}

export const FEEDS = {
  quote:            { path: 'quote',                          params: (s) => ({ symbol: s }),                                   pick: first },
  profile:          { path: 'profile',                        params: (s) => ({ symbol: s }),                                   pick: first },
  ratiosTtm:        { path: 'ratios-ttm',                     params: (s) => ({ symbol: s }),                                   pick: first },
  metricsTtm:       { path: 'key-metrics-ttm',                params: (s) => ({ symbol: s }),                                   pick: first },
  scores:           { path: 'financial-scores',               params: (s) => ({ symbol: s }),                                   pick: first },
  income:           { path: 'income-statement',               params: (s) => ({ symbol: s, period: 'annual', limit: YEARS }) },
  balance:          { path: 'balance-sheet-statement',        params: (s) => ({ symbol: s, period: 'annual', limit: YEARS }) },
  cashflow:         { path: 'cash-flow-statement',            params: (s) => ({ symbol: s, period: 'annual', limit: YEARS }) },
  ratiosHist:       { path: 'ratios',                         params: (s) => ({ symbol: s, period: 'annual', limit: YEARS }) },
  metricsHist:      { path: 'key-metrics',                    params: (s) => ({ symbol: s, period: 'annual', limit: YEARS }) },
  growth:           { path: 'financial-growth',               params: (s) => ({ symbol: s, period: 'annual', limit: YEARS }) },
  // Quarterly, unlike everything else here: FMP publishes owner earnings per
  // reporting quarter only. Eight of them so four can be summed into a
  // trailing twelve even when the newest quarter has not landed yet.
  ownerEarnings:    { path: 'owner-earnings',                 params: (s) => ({ symbol: s, limit: 8 }) },
  // Headcount as each 10-K reported it. One row per annual filing, so it
  // lines up with the statements without any date matching.
  employees:        { path: 'historical-employee-count',      params: (s) => ({ symbol: s, limit: 15 }) },
  ratings:          { path: 'ratings-snapshot',               params: (s) => ({ symbol: s }),                                   pick: first },
  // Just the index — which quarters exist and when they were held. The text
  // of one is a separate request, made only when a reader opens it.
  transcriptDates:  { path: 'earning-call-transcript-dates',  params: (s) => ({ symbol: s }) },
  segProduct:       { path: 'revenue-product-segmentation',   params: (s) => segParams(s) },
  // FMP names this pair inconsistently — one "segmentation", one "segments" —
  // and which spelling answers has moved between doc revisions. `altPath`
  // retries the other on a 404 rather than reporting a company as not
  // breaking its revenue down when it does.
  segGeography:     { path: 'revenue-geographic-segments',    params: (s) => segParams(s),
                      altPath: 'revenue-geographic-segmentation' },
  estimates:        { path: 'analyst-estimates',              params: (s) => ({ symbol: s, period: 'annual', limit: 6 }) },
  priceTarget:      { path: 'price-target-consensus',         params: (s) => ({ symbol: s }),                                   pick: first },
  grades:           { path: 'grades-consensus',               params: (s) => ({ symbol: s }),                                   pick: first },
  dcf:              { path: 'discounted-cash-flow',           params: (s) => ({ symbol: s }),                                   pick: first },
  dcfLevered:       { path: 'levered-discounted-cash-flow',   params: (s) => ({ symbol: s }),                                   pick: first },
  prices:           { path: 'historical-price-eod/light',     params: (s, c) => ({ symbol: s, from: c.from, to: c.to }) },
  // Opt-in market charts: these are not part of every company report pull.
  marketHistory:    { path: 'historical-price-eod/full',      params: (s, c) => ({ symbol: s, from: c.from, to: c.to }), marketOnly: true },
  marketIntraday:   { path: 'historical-chart/5min',          params: (s, c) => ({ symbol: s, from: c.from, to: c.to }), marketOnly: true },
  dividends:        { path: 'dividends',                      params: (s) => ({ symbol: s, limit: 60 }) },
  peers:            { path: 'stock-peers',                    params: (s) => ({ symbol: s }) },
  executives:       { path: 'key-executives',                 params: (s) => ({ symbol: s }) },
  execComp:         { path: 'governance-executive-compensation', params: (s) => ({ symbol: s }) },
  sharesFloat:      { path: 'shares-float',                   params: (s) => ({ symbol: s }),                                   pick: first },
  // 100 rather than the 20 the ownership section needed: the price chart marks
  // every open-market Form 4 on the line, and twenty filings is a couple of
  // months for a company with a large board.
  insiderTrades:    { path: 'insider-trading/search',         params: (s) => ({ symbol: s, limit: 100 }) },
  insiderStats:     { path: 'insider-trading/statistics',     params: (s) => ({ symbol: s }) },
  institutional:    { path: 'institutional-ownership/extract-analytics/holder',
                      params: (s, c) => ({ symbol: s, year: c.lastQuarter.year, quarter: c.lastQuarter.quarter, limit: 20 }) },
  // The News tab reads both of these, and the distinction between them is the
  // reason they are two feeds rather than one: `news/stock` is what other
  // people wrote about the company, `news/press-releases` is what the company
  // said about itself. Merging them would put a filing and a comment piece on
  // the same footing, which is the one thing a news page must not do.
  //
  // 100 rather than the 12 the Overview's teaser needed: a stream is only
  // useful if it goes back far enough to show a quiet week as quiet, and FMP
  // charges the same for either limit.
  news:             { path: 'news/stock',                     params: (s) => ({ symbols: s, limit: 100 }) },
  pressReleases:    { path: 'news/press-releases',            params: (s) => ({ symbols: s, limit: 50 }) },
  earnings:         { path: 'earnings',                       params: (s) => ({ symbol: s, limit: 12 }) },

  /* ---- the Alpha Signal feeds ---------------------------------------------
     `onDemand`, so `loadDataset` skips them: a company report is already 32
     requests and none of these is read by any of its tabs. They are fetched
     by `alpha-providers` when a reader opens the Alpha Signal tab or runs a
     scan, the same way a transcript and the 13F history are fetched only
     when somebody asks for them.
     ------------------------------------------------------------------------ */

  // Quarterly, where the rest of the report is annual. An inflection is a
  // change of direction, and a change of direction cannot be seen at all in a
  // series that produces one point a year — twelve quarters is three years of
  // year-on-year comparisons plus the sequential ones.
  incomeQ:          { path: 'income-statement',               params: (s) => ({ symbol: s, period: 'quarter', limit: 12 }), onDemand: true },
  cashflowQ:        { path: 'cash-flow-statement',            params: (s) => ({ symbol: s, period: 'quarter', limit: 12 }), onDemand: true },
  // One row per month: how many analysts sat in each of the five rating
  // buckets on the first of that month. A **rating** history, not an estimate
  // history — FMP publishes no time series of consensus EPS.
  gradesHistorical: { path: 'historical-grades',              params: (s) => ({ symbol: s, limit: 24 }), onDemand: true },
  // Average price target over the last month, quarter and year, each with the
  // number of targets behind it.
  targetSummary:    { path: 'price-target-summary',           params: (s) => ({ symbol: s }), pick: first, onDemand: true },
  // 13F aggregated to one row per quarter. Gated below the Ultimate plan,
  // which the provider reports rather than hides.
  holdersSummary:   { path: 'institutional-ownership/symbol-positions-summary',
                      params: (s, c) => ({ symbol: s, year: c.lastQuarter.year, quarter: c.lastQuarter.quarter }),
                      pick: first, onDemand: true },

  // Every form the company filed with the SEC over two years — the News tab's
  // third stream, fetched when a reader opens it. Two years, so the list
  // always holds two annual reports to compare; capped at `SEC_FILINGS_CAP`
  // rows, which a bank filing structured notes daily can reach in months, and
  // the page then says how far back the list actually goes.
  secFilings:       { path: 'sec-filings-search/symbol',
                      params: (s) => ({ symbol: s, from: isoDaysAgo(730), to: isoDaysAgo(0), page: 0, limit: SEC_FILINGS_CAP }),
                      onDemand: true },
} satisfies Record<string, FeedSpec>;

export type FeedName = keyof typeof FEEDS;

const FEED_SPECS: Record<string, FeedSpec> = FEEDS;

/* ---------- low-level fetch ----------------------------------------------- */

const cache = new Map<string, { at: number; result: FeedResult }>();

/** A feed result is always one of these shapes. */
const ok = <T>(data: T): FeedResult<T> => ({ status: 'ok', data });
const gated = (msg: string): FeedResult => ({ status: 'gated', data: null, message: msg });
const failed = (msg: string, code?: number): FeedResult => ({ status: 'error', data: null, message: msg, ...(code ? { code } : {}) });

/* Reader-facing wording for every failure. Deliberately plain: no provider,
   no status codes, no plan names. */
const MSG = {
  network: 'the connection failed',
  refused: 'live data access was refused',
  coverage: 'not part of the current data coverage',
  busy: 'the data service is busy — try again in a minute',
  error: 'the data service returned an error',
  unreadable: 'the data came back unreadable',
};
const skipped = (): FeedResult => ({ status: 'skipped', data: null });

function cached(ck: string): FeedResult | null {
  const hit = cache.get(ck);
  return hit && Date.now() - hit.at < CACHE_TTL ? hit.result : null;
}
function remember(ck: string, result: FeedResult) {
  // Never cache transient failures — only definitive answers.
  if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
  return result;
}

const toQuery = (params: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

/**
 * One GET against the API, with every failure mode FMP has mapped onto the
 * four result shapes above.
 */
async function request(path: string, params: Record<string, unknown>): Promise<FeedResult> {
  if (!hasApiKey()) return skipped();

  const headers: Record<string, string> = { Accept: 'application/json' };
  const own = getApiKey();
  if (own) headers[KEY_HEADER] = own;

  let res: Response;
  try {
    res = await fetch(`${PROXY}/${path}?${toQuery(params)}`, { headers, cache: 'no-store' });
  } catch {
    return failed(MSG.network);
  }

  if (res.status === 401) return failed(MSG.refused, 401);
  if (res.status === 402 || res.status === 403) return gated(MSG.coverage);
  if (res.status === 429) return failed(MSG.busy, 429);
  if (!res.ok) return failed(MSG.error, res.status);

  let json: any;
  try {
    json = await res.json();
  } catch {
    return failed(MSG.unreadable);
  }

  // FMP also signals plan limits with a 200 + { "Error Message": ... }. Its
  // wording names the provider and its plans, so it is classified, never shown.
  const errText = json && !Array.isArray(json) && (json['Error Message'] || json.error);
  if (errText) {
    return /plan|subscription|upgrade|exclusive|premium/i.test(errText) ? gated(MSG.coverage) : failed(MSG.error);
  }
  return ok(json);
}

async function fetchFeed(name: string, symbol: string, ctx: FeedCtx): Promise<FeedResult> {
  const spec = FEED_SPECS[name];
  if (!spec) return failed(`unknown feed "${name}"`);

  const params = spec.params(symbol, ctx);
  let r = await request(spec.path, params);
  // Only a 404 is retried, and only once: a missing path is the one failure an
  // alternative spelling can fix.
  if (spec.altPath && r.status === 'error' && r.code === 404) {
    r = await request(spec.altPath, params);
  }
  if (r.status !== 'ok') return r;

  const json = r.data;
  if (Array.isArray(json) && json.length === 0) return ok(spec.pick ? null : []);
  return ok(spec.pick ? spec.pick(json) : json);
}

const asList = (r: FeedResult): FeedResult<any[]> =>
  r.status === 'ok' ? ok(Array.isArray(r.data) ? r.data : []) : (r as FeedResult<any[]>);

/* ---------- the screener --------------------------------------------------
   Market-wide rather than per-symbol, so it sits outside `FEEDS`.

   FMP screens server-side on size, sector, industry, exchange, beta, price,
   dividend and volume. It does **not** screen on ratios, so anything an idea
   asks about margins, returns or multiples has to be tested by the caller
   against a `ratios-ttm` / `key-metrics-ttm` pull per candidate.
   ------------------------------------------------------------------------- */

export async function fetchScreener(params: Record<string, unknown>): Promise<FeedResult<any[]>> {
  const ck = `screener|${toQuery(params)}`;
  const hit = cached(ck);
  if (hit) return hit;
  return remember(ck, asList(await request('company-screener', params)));
}

/* ---------- one earnings call transcript -----------------------------------
   Outside `FEEDS` because it takes a quarter as well, and a company has
   eighty of them. The index comes with the dataset and the text arrives when
   somebody asks for it. FMP gates transcripts to its top plans.
   -------------------------------------------------------------------------- */

export async function fetchTranscript(symbol: string, year: number, quarter: number): Promise<FeedResult> {
  const ck = `transcript|${symbol}|${year}|${quarter}`;
  const hit = cached(ck);
  if (hit) return hit;
  const r = await request('earning-call-transcript', { symbol, year, quarter });
  const result = r.status === 'ok' ? ok(Array.isArray(r.data) ? (r.data[0] ?? null) : r.data) : r;
  return remember(ck, result);
}

/* ---------- the calendars --------------------------------------------------
   One request covers a whole week of one kind, which is what keeps the page
   affordable — asking per day would be five times the quota for the same
   answer.
   ------------------------------------------------------------------------- */

const CALENDARS: Record<string, string> = {
  earnings: 'earnings-calendar',
  dividends: 'dividends-calendar',
  splits: 'splits-calendar',
};

/** One kind of calendar over a date range, inclusive at both ends. */
export async function fetchCalendar(kind: string, from: string, to: string): Promise<FeedResult<any[]>> {
  const path = CALENDARS[kind];
  if (!path) return failed(`unknown calendar "${kind}"`);
  const ck = `calendar|${kind}|${from}|${to}`;
  const hit = cached(ck);
  if (hit) return hit;
  // The earnings calendar gives the report time — before the open or after
  // the close — plus the fiscal period only when asked for it.
  const r = await request(path, kind === 'earnings' ? { from, to, includeReportTimes: 'true' } : { from, to });
  return remember(ck, asList(r));
}

/* ---------- market-wide reads ----------------------------------------------
   The two snapshot endpoints take a date and answer for that trading day, so
   a request on a Sunday returns nothing at all. `fetchMarket` walks back up
   to four days to find the last session rather than reporting an empty
   market, and says which date it landed on.
   -------------------------------------------------------------------------- */

const MARKET_PATHS: Record<string, string> = {
  gainers: 'biggest-gainers',
  losers: 'biggest-losers',
  active: 'most-actives',
  sectorPerf: 'sector-performance-snapshot',
  industryPerf: 'industry-performance-snapshot',
  sectorPe: 'sector-PE-snapshot',
  industryPe: 'industry-PE-snapshot',
  // Each takes `from`/`to` and caps the range at 90 days.
  treasuryRates: 'treasury-rates',
  // `economic-calendar`, not `economics-calendar`: the documentation page is
  // filed under the plural, the URL FMP serves is singular. The plural was a
  // 404, which is what an unverified path costs.
  econCalendar: 'economic-calendar',
};

/** Does this snapshot need a trading date? */
const DATED = new Set(['sectorPerf', 'industryPerf', 'sectorPe', 'industryPe']);

export async function fetchMarket(kind: string, params: Record<string, unknown> = {}): Promise<FeedResult<any[]>> {
  const path = MARKET_PATHS[kind];
  if (!path) return failed(`unknown market feed "${kind}"`);

  const ck = `market|${kind}|${toQuery(params)}`;
  const hit = cached(ck);
  if (hit) return hit;

  let result: FeedResult<any[]>;
  if (DATED.has(kind) && !params.date) {
    // Back off a day at a time. Four is enough for a long weekend plus a
    // public holiday, which is the longest gap a US market takes.
    result = failed('no trading day found');
    for (let back = 0; back < 5; back += 1) {
      const d = new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);
      const r = await request(path, { ...params, date: d });
      if (r.status !== 'ok') { result = r; break; }
      if (Array.isArray(r.data) && r.data.length) { result = { ...ok(r.data), date: d }; break; }
      result = { ...ok([]), date: d };
    }
  } else {
    result = asList(await request(path, params));
  }
  return remember(ck, result);
}

/* Market-wide news. The per-symbol pair in `FEEDS` searches by ticker; these
   are the unfiltered firehoses, which is what a market news page reads. */
const NEWS_PATHS: Record<string, string> = {
  general: 'news/general-latest',
  stock: 'news/stock-latest',
  press: 'news/press-releases-latest',
};

export async function fetchNewsFeed(
  kind: string,
  { limit = 100, page = 0, from, to }: { limit?: number; page?: number; from?: string; to?: string } = {},
): Promise<FeedResult<any[]>> {
  const path = NEWS_PATHS[kind];
  if (!path) return failed(`unknown news feed "${kind}"`);
  const params: Record<string, unknown> = { limit, page };
  if (from) params.from = from;
  if (to) params.to = to;
  const ck = `news|${kind}|${toQuery(params)}`;
  const hit = cached(ck);
  if (hit) return hit;
  return remember(ck, asList(await request(path, params)));
}

/* ---------- many quotes in one request --------------------------------------
   `quote` takes one symbol; `batch-quote` takes a list and returns the same
   shape per row. Six tiles then cost one request rather than six, and the
   response carries `dayHigh`/`dayLow`.

   Chunked at fifty because the symbol list travels in the query string, and a
   few hundred tickers is a URL long enough for a proxy to truncate.
   -------------------------------------------------------------------------- */

const BATCH_SIZE = 50;

export async function fetchBatchQuotes(symbols: readonly unknown[]): Promise<FeedResult<any[]>> {
  const list = [...new Set((symbols || []).filter((s): s is string => typeof s === 'string' && !!s))];
  if (!list.length) return ok([]);

  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += BATCH_SIZE) chunks.push(list.slice(i, i + BATCH_SIZE));

  const results = await pool(chunks, async (chunk) => {
    const key = chunk.join(',');
    const ck = `batch|${key}`;
    const hit = cached(ck);
    if (hit) return hit;
    return remember(ck, asList(await request('batch-quote', { symbols: key })));
  }, 3);

  // One failed chunk should not lose the rest: the caller renders whatever
  // symbols came back and leaves the others as "n/a".
  const rows = results.flatMap((r) => (r.status === 'ok' ? (r.data as any[]) : []));
  const bad = results.find((r) => r.status !== 'ok');
  if (!rows.length && bad) return bad as FeedResult<any[]>;
  return ok(rows);
}

/* ---------- one ETF's fund facts -------------------------------------------
   Outside `FEEDS` on purpose: `loadDataset` walks that map for every company,
   and a sector ETF's assets under management is not a fact about a company.
   -------------------------------------------------------------------------- */

export async function fetchEtfInfo(symbol: string): Promise<FeedResult> {
  const ck = `etfinfo|${symbol}`;
  const hit = cached(ck);
  if (hit) return hit;
  // Two spellings, one retried on a 404 only — same rule as `altPath`.
  let r = await request('etf/info', { symbol });
  if (r.status === 'error' && r.code === 404) {
    r = await request('etf-info', { symbol });
  }
  const result = r.status === 'ok' ? ok(Array.isArray(r.data) ? (r.data[0] ?? null) : r.data) : r;
  return remember(ck, result);
}

/* ---------- 13F holders, several quarters deep ------------------------------
   Marking fund activity on a price chart needs a run of quarters, each its
   own request — so this is called on demand rather than at load.
   -------------------------------------------------------------------------- */

export async function fetchHolderQuarters(symbol: string, count = 8): Promise<FeedResult<any[]>[]> {
  // Back off one quarter before starting: 13Fs are filed up to 45 days after
  // the quarter ends, so the most recent one is usually not there yet.
  const quarters: { year: number; quarter: number }[] = [];
  const d = new Date();
  d.setMonth(d.getMonth() - 4);
  for (let i = 0; i < count; i += 1) {
    quarters.push({ year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 });
    d.setMonth(d.getMonth() - 3);
  }

  return pool(quarters, async ({ year, quarter }) => {
    const ck = `holders|${symbol}|${year}|${quarter}`;
    const hit = cached(ck);
    if (hit) return hit as FeedResult<any[]>;
    const r = await request('institutional-ownership/extract-analytics/holder', { symbol, year, quarter, limit: 100 });
    return remember(ck, asList(r)) as FeedResult<any[]>;
  }, 4);
}

/* ---------- one filer's 13F ---------------------------------------------------
   The Superinvestors page reads a fund, not a company: which quarters it has
   filed, what it held in one of them, and the vendor's performance and
   industry summaries. Keyed by CIK, ten digits. All four sit on FMP's
   Ultimate plan, which the result reports as gated rather than hides.
   -------------------------------------------------------------------------- */

const FUND_PATHS: Record<string, string> = {
  dates: 'institutional-ownership/dates',
  holdings: 'institutional-ownership/extract',
  performance: 'institutional-ownership/holder-performance-summary',
  industries: 'institutional-ownership/holder-industry-breakdown',
};

export async function fetchFund13F(
  kind: 'dates' | 'holdings' | 'performance' | 'industries',
  cik: string,
  period: { year: number; quarter: number } | null = null,
): Promise<FeedResult<any[]>> {
  const path = FUND_PATHS[kind];
  if (!path) return failed(`unknown 13F feed "${kind}"`);
  const params: Record<string, unknown> = { cik };
  if (period) { params.year = period.year; params.quarter = period.quarter; }
  if (kind === 'performance') params.page = 0;
  const ck = `fund|${kind}|${toQuery(params)}`;
  const hit = cached(ck);
  if (hit) return hit as FeedResult<any[]>;
  return remember(ck, asList(await request(path, params))) as FeedResult<any[]>;
}

/* ---------- the transcript library -----------------------------------------
   Every company FMP holds a transcript for, with a count. One request, several
   thousand rows — cached, and searched in the browser rather than re-asked.
   -------------------------------------------------------------------------- */

export async function fetchTranscriptList(): Promise<FeedResult<any[]>> {
  const ck = 'transcript-list';
  const hit = cached(ck);
  if (hit) return hit;
  return remember(ck, asList(await request('earnings-transcript-list', {})));
}

/** Cached single-feed read. */
async function readFeed(name: string, symbol: string, ctx: FeedCtx): Promise<FeedResult> {
  const range = ['prices', 'marketHistory', 'marketIntraday'].includes(name) ? `|${ctx.from || ''}|${ctx.to || ''}` : '';
  // The two 13F feeds answer for one quarter, and a caller may ask for a
  // quarter other than the default (the big-banks portfolio asks for the one
  // its filings describe) — so the quarter is part of what was asked.
  const period = ['institutional', 'holdersSummary'].includes(name) && ctx.lastQuarter
    ? `|${ctx.lastQuarter.year}Q${ctx.lastQuarter.quarter}` : '';
  const ck = `${symbol}|${name}${range}${period}`;
  const hit = cached(ck);
  if (hit) return hit;
  return remember(ck, await fetchFeed(name, symbol, ctx));
}

/** Run promise-returning tasks with bounded concurrency. */
export async function mapLimited<T, R>(
  items: readonly T[],
  worker: (item: T, i: number) => Promise<R>,
  limit = MAX_PARALLEL,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}
const pool = mapLimited;

/* ---------- snapshot fallback --------------------------------------------- */

export interface Snapshot {
  symbol: string;
  capturedAt?: string;
  note?: string;
  extras?: { peerRatios?: Record<string, any>; peerGrowth?: Record<string, any>; benchmarks?: Record<string, any> };
  feeds: Record<string, any>;
}

const snapshots = new Map<string, Promise<Snapshot | null>>();

/**
 * The bundled snapshot for a symbol, or null.
 *
 * Exported because `loadDataset` is not the only caller: the Alpha Signal's
 * feeds are `onDemand`, so `loadDataset` never asks for them and they would be
 * permanently missing without a key. `loadAlphaBag` falls back to the same
 * file, so "what a snapshot covers" stays one question with one answer.
 */
export function loadSnapshot(symbol: string): Promise<Snapshot | null> {
  const sym = symbol.toUpperCase();
  if (!snapshots.has(sym)) {
    snapshots.set(sym, (async () => {
      try {
        const res = await fetch(`/data/${sym}.json`, { cache: 'no-cache' });
        if (!res.ok) return null;
        return (await res.json()) as Snapshot;
      } catch {
        return null;
      }
    })());
  }
  return snapshots.get(sym)!;
}

/* ---------- public API ----------------------------------------------------- */

function lastCompleteQuarter(now = new Date()) {
  // 13F filings lag by ~45 days; step back one quarter to be safe.
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - 4);
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
}

function requestCtx(extra: Record<string, unknown> = {}): FeedCtx {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 365 * 24 * 3600 * 1000);
  return {
    to: to.toISOString().slice(0, 10),
    from: from.toISOString().slice(0, 10),
    lastQuarter: lastCompleteQuarter(to),
    ...extra,
  };
}

export type DataSource = 'live' | 'snapshot' | 'error' | 'none';

export interface Dataset {
  symbol: string;
  source: DataSource;
  asOf: Date;
  feeds: Record<string, FeedResult>;
  /** peer ratios / benchmark series bundled with a snapshot, if any */
  snapshotExtras: Snapshot['extras'] | null;
  /** set when a key was configured but every live request failed */
  liveError: string | null;
  get: (name: string) => any;
  status: (name: string) => FeedStatus;
  message: (name: string) => string;
  /** true when the feed simply is not on the caller's plan */
  isGated: (name: string) => boolean;
  /** feeds that came back gated, for the "upgrade" summary */
  gatedFeeds: () => string[];
}

/** Wrap a feed map in the accessor object every consumer reads through. */
export function makeDataset(
  symbol: string,
  feeds: Record<string, FeedResult>,
  extra: Partial<Pick<Dataset, 'source' | 'asOf' | 'snapshotExtras' | 'liveError'>> = {},
): Dataset {
  const names = Object.keys(feeds);
  return {
    symbol,
    source: extra.source ?? 'live',
    asOf: extra.asOf ?? new Date(),
    feeds,
    snapshotExtras: extra.snapshotExtras ?? null,
    liveError: extra.liveError ?? null,
    get: (name) => feeds[name]?.data ?? null,
    status: (name) => feeds[name]?.status ?? 'skipped',
    message: (name) => feeds[name]?.message ?? '',
    isGated: (name) => feeds[name]?.status === 'gated',
    gatedFeeds: () => names.filter((n) => feeds[n]?.status === 'gated'),
  };
}

/** Fetch every feed for `symbol`. */
export async function loadDataset(
  symbol: string,
  { onProgress }: { onProgress?: (done: number, total: number) => void } = {},
): Promise<Dataset> {
  const sym = symbol.toUpperCase().trim();
  const ctx = requestCtx();

  // `marketOnly` is the hub's asset-class history; `onDemand` is the Alpha
  // Signal's five. Neither belongs in the load a company report pays for.
  const names = Object.keys(FEED_SPECS).filter((n) => !FEED_SPECS[n].marketOnly && !FEED_SPECS[n].onDemand);
  const feeds: Record<string, FeedResult> = {};

  if (hasApiKey()) {
    let done = 0;
    const results = await pool(names, async (name) => {
      const r = await readFeed(name, sym, ctx);
      onProgress?.(++done, names.length);
      return r;
    });
    names.forEach((n, i) => { feeds[n] = results[i]; });
  } else {
    names.forEach((n) => { feeds[n] = skipped(); });
  }

  // Fill anything we could not fetch from the bundled snapshot, so the report
  // still renders. Snapshot-sourced feeds are tagged so the UI can say so.
  const liveCount = names.filter((n) => feeds[n].status === 'ok').length;
  let source: DataSource = liveCount ? 'live' : 'snapshot';
  let snapshotExtras: Snapshot['extras'] | null = null;

  // If a key is configured but nothing came back, keep the reason around —
  // falling back to a snapshot without saying why would look like success.
  const liveError = liveCount === 0 && hasApiKey()
    ? names.map((n) => feeds[n].message).find(Boolean) || 'no live data came back'
    : null;

  if (liveCount === 0) {
    const snap = await loadSnapshot(sym);
    if (snap) {
      for (const n of names) {
        if (snap.feeds?.[n] != null) feeds[n] = { status: 'ok', data: snap.feeds[n], fromSnapshot: true };
      }
      snapshotExtras = snap.extras || null;
      source = 'snapshot';
    } else if (hasApiKey()) {
      source = 'error';
    } else {
      source = 'none';
    }
  }

  return makeDataset(sym, feeds, { source, snapshotExtras, liveError });
}

/**
 * Fetch a single feed for an arbitrary symbol — used for peer ratios and the
 * market / sector benchmark price series, which sit outside the main dataset.
 */
export function fetchFor(feedName: string, symbol: string, extra: Record<string, unknown> = {}): Promise<FeedResult> {
  return readFeed(feedName, symbol.toUpperCase(), requestCtx(extra));
}

export function clearCache() {
  cache.clear();
}

/* On-demand feeds for the Market Data hub. Kept outside FEEDS so an equity
   report never downloads entire asset classes. */
const HUB_FEEDS: Record<string, string> = {
  indices: 'batch-index-quotes',
  crypto: 'batch-crypto-quotes',
  forex: 'batch-forex-quotes',
  commodities: 'batch-commodity-quotes',
  commoditiesList: 'commodities-list',
  ipos: 'ipos-calendar',
  indicators: 'economic-indicators',
  priceChanges: 'stock-price-change',
  /* Every fund holding one symbol, with its weight in each. Half a megabyte
     for a megacap, so it is only ever fetched when a reader asks for it.
     `etf/asset-exposure`, not `etf-asset-exposure` — the ETF endpoints are
     namespaced under `etf/`, and the connector's spelling 404s. */
  etfExposure: 'etf/asset-exposure',
  // One fund's own lines and weightings, for the Fund X-Ray.
  etfHoldings: 'etf/holdings',
  etfSectors: 'etf/sector-weightings',
  etfCountries: 'etf/country-weightings',
};
const hubPending = new Map<string, Promise<FeedResult<any[]>>>();

/** Cached, coalesced market-wide request; no fallback or invented values. */
export async function fetchHubFeed(kind: string, params: Record<string, unknown> = {}): Promise<FeedResult<any[]>> {
  const path = HUB_FEEDS[kind];
  if (!path) return failed(`unknown hub feed "${kind}"`);
  const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value != null));
  const ck = `hub|${kind}|${toQuery(clean)}`;
  const hit = cached(ck);
  if (hit) return hit;
  const pending = hubPending.get(ck);
  if (pending) return pending;
  const task = request(path, clean)
    .then((r) => remember(ck, asList(r)) as FeedResult<any[]>)
    .finally(() => hubPending.delete(ck));
  hubPending.set(ck, task);
  return task;
}
