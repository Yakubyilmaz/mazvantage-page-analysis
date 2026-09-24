/* ==========================================================================
   Vanlior — Financial Modeling Prep connector

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
   * With no API key configured the connector serves the bundled snapshot in
     assets/data/, so the report renders offline.
   ========================================================================== */

const BASE = 'https://financialmodelingprep.com/stable';
const CACHE_TTL = 10 * 60 * 1000;     // 10 minutes
const MAX_PARALLEL = 5;
const KEY_STORAGE = 'mazvantage.fmp.key';

/* ---------- key management ------------------------------------------------ */

export function getApiKey() {
  const fromUrl = new URLSearchParams(location.search).get('apikey');
  if (fromUrl) {
    localStorage.setItem(KEY_STORAGE, fromUrl);
    // Do not leave the key sitting in the address bar / history.
    const url = new URL(location.href);
    url.searchParams.delete('apikey');
    history.replaceState(null, '', url);
    return fromUrl;
  }
  return localStorage.getItem(KEY_STORAGE) || '';
}

export function setApiKey(key) {
  const k = (key || '').trim();
  if (k) localStorage.setItem(KEY_STORAGE, k);
  else localStorage.removeItem(KEY_STORAGE);
  cache.clear();
}

export const hasApiKey = () => !!getApiKey();

/**
 * The vendor's logo for a symbol.
 *
 * `profile.image` carries this for the company being reported on, but a peer
 * is only ever a symbol and a name, so the peer table has to build the URL.
 * It lives here because this is the one file allowed to know one; callers
 * treat it as a string that may or may not resolve, and fall back when the
 * image 404s.
 */
export function logoUrl(symbol) {
  return symbol ? `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(symbol)}.png` : null;
}

/* ---------- feed catalogue ------------------------------------------------
   `path` is appended to BASE; `params` is a function of the request context.
   `pick` reshapes the raw payload into what the model wants.
   -------------------------------------------------------------------------- */

const YEARS = 10;

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
  ownerEarnings:    { path: 'owner-earnings',                params: (s) => ({ symbol: s, limit: 8 }) },
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
  segGeography:     { path: 'revenue-geographic-segments',   params: (s) => segParams(s),
                      altPath: 'revenue-geographic-segmentation' },
  estimates:        { path: 'analyst-estimates',              params: (s) => ({ symbol: s, period: 'annual', limit: 6 }) },
  priceTarget:      { path: 'price-target-consensus',         params: (s) => ({ symbol: s }),                                   pick: first },
  grades:           { path: 'grades-consensus',               params: (s) => ({ symbol: s }),                                   pick: first },
  dcf:              { path: 'discounted-cash-flow',           params: (s) => ({ symbol: s }),                                   pick: first },
  dcfLevered:       { path: 'levered-discounted-cash-flow',   params: (s) => ({ symbol: s }),                                   pick: first },
  prices:           { path: 'historical-price-eod/light',     params: (s, c) => ({ symbol: s, from: c.from, to: c.to }) },
  // Opt-in market charts: these are not part of every company report pull.
  marketHistory:    { path: 'historical-price-eod/full',      params: (s, c) => ({ symbol: s, from: c.from, to: c.to }), marketOnly: true },
  marketIntraday:   { path: 'historical-chart/5min',           params: (s, c) => ({ symbol: s, from: c.from, to: c.to }), marketOnly: true },
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
     by `alpha-providers.js` when a reader opens the Alpha Signal tab or runs
     a scan, the same way a transcript and the 13F history are fetched only
     when somebody asks for them.

     All five were checked against a live key before being written here; the
     field names the providers read are the ones these paths actually return.
     ------------------------------------------------------------------------ */

  // Quarterly, where the rest of the report is annual. An inflection is a
  // change of direction, and a change of direction cannot be seen at all in a
  // series that produces one point a year — twelve quarters is three years of
  // year-on-year comparisons plus the sequential ones.
  incomeQ:          { path: 'income-statement',               params: (s) => ({ symbol: s, period: 'quarter', limit: 12 }), onDemand: true },
  cashflowQ:        { path: 'cash-flow-statement',            params: (s) => ({ symbol: s, period: 'quarter', limit: 12 }), onDemand: true },
  // One row per month: how many analysts sat in each of the five rating
  // buckets on the first of that month. This is a **rating** history, not an
  // estimate history — FMP publishes no time series of consensus EPS, so the
  // revision provider says so rather than implying it has one.
  gradesHistorical: { path: 'historical-grades',              params: (s) => ({ symbol: s, limit: 24 }), onDemand: true },
  // Average price target over the last month, quarter and year, each with the
  // number of targets behind it. Three points is not a series, but the spread
  // between them is the only published measure of which way targets are moving.
  targetSummary:    { path: 'price-target-summary',           params: (s) => ({ symbol: s }), pick: first, onDemand: true },
  // 13F aggregated to one row per quarter: holders, shares, new/closed/
  // increased/reduced positions and the change in each. Gated below the
  // Ultimate plan, which the provider reports rather than hides.
  holdersSummary:   { path: 'institutional-ownership/symbol-positions-summary',
                      params: (s, c) => ({ symbol: s, year: c.lastQuarter.year, quarter: c.lastQuarter.quarter }),
                      pick: first, onDemand: true },
};

function first(x) { return Array.isArray(x) ? (x[0] ?? null) : x; }

/* `structure: 'flat'` returns one `{ segment: amount }` object per fiscal
   year. The nested alternative wraps the same numbers in a second layer keyed
   by date, which the caller would only have to unwrap again. */
function segParams(symbol) {
  return { symbol, period: 'annual', structure: 'flat' };
}

/* ---------- low-level fetch ----------------------------------------------- */

const cache = new Map();   // `${symbol}|${feed}` -> { at, result }

/** A feed result is always one of these shapes. */
const ok      = (data) => ({ status: 'ok', data });
const gated   = (msg)  => ({ status: 'gated', data: null, message: msg });
const failed  = (msg)  => ({ status: 'error', data: null, message: msg });
const skipped = ()     => ({ status: 'skipped', data: null });

/**
 * One GET against the API, with every failure mode FMP has mapped onto the
 * four result shapes above.
 *
 * Split out of `fetchFeed` so the screener can reuse it: the screener is not
 * a per-symbol feed and has no entry in `FEEDS`, but a 402 means the same
 * thing to it as it does to everything else.
 */
async function request(path, params) {
  const key = getApiKey();
  if (!key) return skipped();

  const qs = new URLSearchParams({ ...params, apikey: key });

  let res;
  try {
    res = await fetch(`${BASE}/${path}?${qs}`, { headers: { Accept: 'application/json' } });
  } catch (e) {
    return failed(`the network request failed — ${e.message}`);
  }

  if (res.status === 401) return failed('the API key was rejected (HTTP 401)');
  if (res.status === 402 || res.status === 403) return gated('not included in this FMP plan');
  if (res.status === 429) return failed('the FMP rate limit was reached (HTTP 429)');
  if (!res.ok) return failed(`FMP returned HTTP ${res.status}`);

  let json;
  try { json = await res.json(); } catch { return failed('FMP returned a malformed response'); }

  // FMP also signals plan limits with a 200 + { "Error Message": ... }
  const errText = json && !Array.isArray(json) && (json['Error Message'] || json.error);
  if (errText) {
    return /plan|subscription|upgrade|exclusive|premium/i.test(errText) ? gated(errText) : failed(errText);
  }
  return ok(json);
}

async function fetchFeed(name, symbol, ctx) {
  const spec = FEEDS[name];
  if (!spec) return failed(`unknown feed "${name}"`);

  const params = spec.params(symbol, ctx);
  let r = await request(spec.path, params);
  // Only a 404 is retried, and only once: a missing path is the one failure an
  // alternative spelling can fix. A gate, a rejected key or a rate limit would
  // answer the same way twice and cost a second request to find out.
  if (spec.altPath && r.status === 'error' && (r.message || '').includes('HTTP 404')) {
    r = await request(spec.altPath, params);
  }
  if (r.status !== 'ok') return r;

  const json = r.data;
  if (Array.isArray(json) && json.length === 0) return ok(spec.pick ? null : []);
  return ok(spec.pick ? spec.pick(json) : json);
}

/* ---------- the screener --------------------------------------------------
   Market-wide rather than per-symbol, so it sits outside `FEEDS` — there is
   no symbol to key it by and no `pick` to apply.

   FMP screens server-side on size, sector, industry, exchange, beta, price,
   dividend and volume. It does **not** screen on ratios, so anything an idea
   asks about margins, returns or multiples has to be tested by the caller
   against a `ratios-ttm` / `key-metrics-ttm` pull per candidate. That is why
   `ideas.js` fetches a capped candidate list rather than the whole market.
   ------------------------------------------------------------------------- */

export async function fetchScreener(params) {
  const ck = `screener|${new URLSearchParams(params).toString()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

  const r = await request('company-screener', params);
  const result = r.status === 'ok' ? ok(Array.isArray(r.data) ? r.data : []) : r;
  if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
  return result;
}

/* ---------- one earnings call transcript -----------------------------------
   Outside `FEEDS` because it is not a per-symbol feed: it takes a quarter as
   well, and a company has eighty of them. Fetching the set with the rest of
   the report would be eighty requests and several megabytes of text for a tab
   most readers never open, so the index comes with the dataset and the text
   arrives when somebody asks for it.

   FMP gates transcripts to its top plans, so this is the one part of the
   report that is unavailable on most keys. The result shape is the same as
   every feed's, and the tab says which of "no key", "not on this plan" and
   "no transcript for that quarter" it got.
   -------------------------------------------------------------------------- */

export async function fetchTranscript(symbol, year, quarter) {
  const ck = `transcript|${symbol}|${year}|${quarter}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

  const r = await request('earning-call-transcript', { symbol, year, quarter });
  const result = r.status === 'ok'
    ? ok(Array.isArray(r.data) ? (r.data[0] ?? null) : r.data)
    : r;
  if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
  return result;
}

/* ---------- the calendars --------------------------------------------------
   Market-wide rather than per-symbol, so like the screener these sit outside
   `FEEDS`: there is no symbol to key them by and no `pick` to apply.

   One request covers a whole week of one kind, which is what keeps the page
   affordable — the earnings calendar alone returns several hundred rows a day
   across every exchange FMP carries, and asking per day would be five times
   the quota for the same answer.
   ------------------------------------------------------------------------- */

const CALENDARS = {
  earnings: 'earnings-calendar',
  dividends: 'dividends-calendar',
  splits: 'splits-calendar',
};

/**
 * One kind of calendar over a date range, inclusive at both ends.
 *
 * Returns the same four result shapes every feed does, so the caller can tell
 * "no key" from "not on this plan" from "the week is genuinely empty".
 */
export async function fetchCalendar(kind, from, to) {
  const path = CALENDARS[kind];
  if (!path) return failed(`unknown calendar "${kind}"`);

  const ck = `calendar|${kind}|${from}|${to}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

  // The earnings calendar gives the report time — before the open or after
  // the close — plus the fiscal period only when asked for it.
  const r = await request(path, kind === 'earnings' ? { from, to, includeReportTimes: 'true' } : { from, to });
  const result = r.status === 'ok' ? ok(Array.isArray(r.data) ? r.data : []) : r;
  if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
  return result;
}

/* ---------- market-wide reads ----------------------------------------------
   The movers, the sector and industry snapshots, and the market-wide news
   feeds. Like the screener and the calendars these sit outside `FEEDS`: there
   is no symbol to key them by.

   The two snapshot endpoints take a date and answer for that trading day, so
   a request on a Sunday returns nothing at all. `fetchMarket` walks back up
   to four days to find the last session rather than reporting an empty
   market, and says which date it landed on.
   -------------------------------------------------------------------------- */

const MARKET_PATHS = {
  gainers:      'biggest-gainers',
  losers:       'biggest-losers',
  active:       'most-actives',
  sectorPerf:   'sector-performance-snapshot',
  industryPerf: 'industry-performance-snapshot',
  sectorPe:     'sector-PE-snapshot',
  industryPe:   'industry-PE-snapshot',

  /* Added for the Economy page, and both now checked against the published
     endpoint rather than against a connector's endpoint *name* — which is what
     went wrong here once already. Each takes `from`/`to` and caps the range at
     90 days. */
  treasuryRates: 'treasury-rates',
  // `economic-calendar`, not `economics-calendar`: the documentation page is
  // filed under the plural and the MCP connector names its endpoint after that
  // page, but the URL FMP actually serves is singular. The plural spelling was
  // a 404, which is what an unverified path costs. Both take `from`/`to` and
  // cap the range at 90 days.
  // https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar
  econCalendar:  'economic-calendar',
};

/** Does this snapshot need a trading date? */
const DATED = new Set(['sectorPerf', 'industryPerf', 'sectorPe', 'industryPe']);

export async function fetchMarket(kind, params = {}) {
  const path = MARKET_PATHS[kind];
  if (!path) return failed(`unknown market feed "${kind}"`);

  const ck = `market|${kind}|${new URLSearchParams(params).toString()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

  let result;
  if (DATED.has(kind) && !params.date) {
    // Back off a day at a time. Four is enough for a long weekend plus a
    // public holiday, which is the longest gap a US market takes.
    result = failed('no trading day found');
    for (let back = 0; back < 5; back += 1) {
      const d = new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);
      const r = await request(path, { ...params, date: d });
      if (r.status !== 'ok') { result = r; break; }
      if (Array.isArray(r.data) && r.data.length) { result = ok(r.data); result.date = d; break; }
      result = ok([]);
      result.date = d;
    }
  } else {
    const r = await request(path, params);
    result = r.status === 'ok' ? ok(Array.isArray(r.data) ? r.data : []) : r;
  }

  if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
  return result;
}

/* Market-wide news. The per-symbol pair in `FEEDS` searches by ticker; these
   are the unfiltered firehoses, which is what a market news page reads. */
const NEWS_PATHS = {
  general: { path: 'news/general-latest' },
  stock:   { path: 'news/stock-latest' },
  press:   { path: 'news/press-releases-latest' },
};

export async function fetchNewsFeed(kind, { limit = 100, page = 0, from, to } = {}) {
  const spec = NEWS_PATHS[kind];
  if (!spec) return failed(`unknown news feed "${kind}"`);

  const params = { limit, page };
  if (from) params.from = from;
  if (to) params.to = to;

  const ck = `news|${kind}|${new URLSearchParams(params).toString()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

  const r = await request(spec.path, params);
  const result = r.status === 'ok' ? ok(Array.isArray(r.data) ? r.data : []) : r;
  if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
  return result;
}

/* ---------- many quotes in one request --------------------------------------
   `quote` takes one symbol; `batch-quote` takes a list and returns the same
   shape per row. Six tiles then cost one request rather than six, and the
   response carries `dayHigh`/`dayLow`, which is what the overview's volatility
   ranking is computed from.

   Exercised through an authenticated FMP connector before being written here
   and returned the documented shape; like `treasury-rates` it has not yet gone
   through a live key on this app's own `request()`. If a tile strip comes back
   empty against a real key, this path is the first thing to check.

   Chunked at fifty because the symbol list travels in the query string, and a
   few hundred tickers is a URL long enough for a proxy to truncate.
   -------------------------------------------------------------------------- */

const BATCH_SIZE = 50;

export async function fetchBatchQuotes(symbols) {
  const list = [...new Set((symbols || []).filter(Boolean))];
  if (!list.length) return ok([]);

  const chunks = [];
  for (let i = 0; i < list.length; i += BATCH_SIZE) chunks.push(list.slice(i, i + BATCH_SIZE));

  // `pool`, not `mapLimited`: the latter is only an export alias and is not a
  // binding inside this module.
  const results = await pool(chunks, async (chunk) => {
    const key = chunk.join(',');
    const ck = `batch|${key}`;
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

    const r = await request('batch-quote', { symbols: key });
    const result = r.status === 'ok' ? ok(Array.isArray(r.data) ? r.data : []) : r;
    if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
    return result;
  }, 3);

  // One failed chunk should not lose the rest: the caller renders whatever
  // symbols came back and leaves the others as "n/a", which is what every
  // other partial failure in this app does.
  const rows = results.flatMap((r) => (r.status === 'ok' ? r.data : []));
  const failed = results.find((r) => r.status !== 'ok');
  if (!rows.length && failed) return failed;
  return ok(rows);
}

/* ---------- one ETF's fund facts -------------------------------------------
   Outside `FEEDS` on purpose: `loadDataset` walks that map for every company,
   and a sector ETF's assets under management is not a fact about a company.
   The sector breakdown asks for eleven of these directly.
   -------------------------------------------------------------------------- */

export async function fetchEtfInfo(symbol) {
  const ck = `etfinfo|${symbol}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

  // Two spellings, one retried on a 404 only — same rule as `altPath` in the
  // feed catalogue. A wrong path here fails silently as an all-`n/a` column
  // rather than as an error anybody would notice.
  let r = await request('etf/info', { symbol });
  if (r.status === 'error' && (r.message || '').includes('HTTP 404')) {
    r = await request('etf-info', { symbol });
  }
  const result = r.status === 'ok'
    ? ok(Array.isArray(r.data) ? (r.data[0] ?? null) : r.data)
    : r;
  if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
  return result;
}

/* ---------- 13F holders, several quarters deep ------------------------------
   The dataset fetches one quarter, which is all the ownership table needs.
   Marking fund activity on a price chart needs a run of them, and each is its
   own request — so this is called on demand rather than at load.
   -------------------------------------------------------------------------- */

export async function fetchHolderQuarters(symbol, count = 8) {
  const now = new Date();
  // Back off one quarter before starting: 13Fs are filed up to 45 days after
  // the quarter ends, so the most recent one is usually not there yet.
  const quarters = [];
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - 4);
  for (let i = 0; i < count; i += 1) {
    quarters.push({ year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 });
    d.setMonth(d.getMonth() - 3);
  }

  return pool(quarters, async ({ year, quarter }) => {
    const ck = `holders|${symbol}|${year}|${quarter}`;
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

    const r = await request('institutional-ownership/extract-analytics/holder',
      { symbol, year, quarter, limit: 100 });
    const result = r.status === 'ok' ? ok(Array.isArray(r.data) ? r.data : []) : r;
    if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
    return result;
  }, 4);
}

/* ---------- the transcript library -----------------------------------------
   Every company FMP holds a transcript for, with a count. One request and a
   large payload — several thousand rows — so it is cached like everything
   else and the page searches it in the browser rather than asking again.
   -------------------------------------------------------------------------- */

export async function fetchTranscriptList() {
  const ck = 'transcript-list';
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;

  const r = await request('earnings-transcript-list', {});
  const result = r.status === 'ok' ? ok(Array.isArray(r.data) ? r.data : []) : r;
  if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
  return result;
}

/** Cached single-feed read. */
async function readFeed(name, symbol, ctx) {
  const range = ['prices', 'marketHistory', 'marketIntraday'].includes(name)
    ? `|${ctx.from || ''}|${ctx.to || ''}` : '';
  const ck = `${symbol}|${name}${range}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;
  const result = await fetchFeed(name, symbol, ctx);
  // Never cache transient failures — only definitive answers.
  if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
  return result;
}

/** Run promise-returning tasks with bounded concurrency. */
async function pool(items, worker, limit = MAX_PARALLEL) {
  const out = new Array(items.length);
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

/* ---------- snapshot fallback --------------------------------------------- */

/**
 * The bundled snapshot for a symbol, or null.
 *
 * Exported because `loadDataset` is no longer the only caller: the Alpha
 * Signal's feeds are `onDemand`, so `loadDataset` never asks for them and
 * they would be permanently missing without a key. `loadAlphaBag` falls back
 * to the same file `loadDataset` does, so "what a snapshot covers" stays one
 * question with one answer.
 */
export async function loadSnapshot(symbol) {
  try {
    const res = await fetch(`assets/data/${symbol.toUpperCase()}.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/* ---------- public API ----------------------------------------------------- */

function lastCompleteQuarter(now = new Date()) {
  // 13F filings lag by ~45 days; step back one quarter to be safe.
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - 4);
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
}

/**
 * Fetch every feed for `symbol`.
 * Returns { symbol, source, feeds, get(name), status(name) }.
 */
export async function loadDataset(symbol, { onProgress } = {}) {
  const sym = symbol.toUpperCase().trim();
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 365 * 24 * 3600 * 1000);
  const ctx = {
    to: to.toISOString().slice(0, 10),
    from: from.toISOString().slice(0, 10),
    lastQuarter: lastCompleteQuarter(to),
  };

  // `marketOnly` is the hub's asset-class history; `onDemand` is the Alpha
  // Signal's five. Neither belongs in the load a company report pays for.
  const names = Object.keys(FEEDS).filter((name) => !FEEDS[name].marketOnly && !FEEDS[name].onDemand);
  const feeds = {};

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
  let source = liveCount ? 'live' : 'snapshot';
  let snapshotExtras = null;

  // If a key is configured but nothing came back, keep the reason around —
  // falling back to a snapshot without saying why would look like success.
  const liveError = (liveCount === 0 && hasApiKey())
    ? (names.map((n) => feeds[n].message).find(Boolean) || 'every FMP request failed')
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

  return {
    symbol: sym,
    source,
    asOf: new Date(),
    feeds,
    /** peer ratios / benchmark series bundled with a snapshot, if any */
    snapshotExtras,
    /** set when a key was configured but every live request failed */
    liveError,
    get: (name) => feeds[name]?.data ?? null,
    status: (name) => feeds[name]?.status ?? 'skipped',
    message: (name) => feeds[name]?.message ?? '',
    /** true when the feed simply is not on the caller's plan */
    isGated: (name) => feeds[name]?.status === 'gated',
    /** feeds that came back gated, for the "upgrade" summary */
    gatedFeeds: () => names.filter((n) => feeds[n]?.status === 'gated'),
  };
}

/**
 * Fetch a single feed for an arbitrary symbol — used for peer ratios and the
 * market / sector benchmark price series, which sit outside the main dataset.
 */
export async function fetchFor(feedName, symbol, extra = {}) {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 365 * 24 * 3600 * 1000);
  const ctx = {
    to: to.toISOString().slice(0, 10),
    from: from.toISOString().slice(0, 10),
    lastQuarter: lastCompleteQuarter(to),
    ...extra,
  };
  return readFeed(feedName, symbol.toUpperCase(), ctx);
}

/** Bounded-concurrency map, exported so callers can batch peer lookups. */
export { pool as mapLimited };

export function clearCache() { cache.clear(); }

/* On-demand feeds for the Market Data hub. Stable endpoint paths verified
   against https://site.financialmodelingprep.com/developer/docs (2026-09-12).
   Kept outside FEEDS so an equity report never downloads entire asset classes. */
const HUB_FEEDS = {
  indices: 'batch-index-quotes',
  crypto: 'batch-crypto-quotes',
  forex: 'batch-forex-quotes',
  commodities: 'batch-commodity-quotes',
  commoditiesList: 'commodities-list',
  ipos: 'ipos-calendar',
  indicators: 'economic-indicators',
  priceChanges: 'stock-price-change',
  /* Every fund holding one symbol, with its weight in each. Half a megabyte
     for a megacap — four thousand funds hold NVIDIA — so it is only ever
     fetched when a reader asks for it by name.

     The path is `etf/asset-exposure`, not `etf-asset-exposure`: the latter is
     what the MCP connector calls the endpoint and it 404s here, the same trap
     `economic-calendar` sprang. The ETF endpoints are namespaced under `etf/`,
     as `etf/info` above already is. */
  etfExposure: 'etf/asset-exposure',
};
const hubPending = new Map();

/** Cached, coalesced market-wide request; no fallback or invented values. */
export async function fetchHubFeed(kind, params = {}) {
  const path = HUB_FEEDS[kind];
  if (!path) return failed(`unknown hub feed "${kind}"`);
  const clean = Object.fromEntries(Object.entries(params).filter(([, value]) => value != null));
  const ck = `hub|${kind}|${new URLSearchParams(clean).toString()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.result;
  if (hubPending.has(ck)) return hubPending.get(ck);
  const task = request(path, clean).then((r) => {
    const result = r.status === 'ok' ? ok(Array.isArray(r.data) ? r.data : []) : r;
    if (result.status !== 'error') cache.set(ck, { at: Date.now(), result });
    return result;
  }).finally(() => hubPending.delete(ck));
  hubPending.set(ck, task);
  return task;
}
