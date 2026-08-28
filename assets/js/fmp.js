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
  estimates:        { path: 'analyst-estimates',              params: (s) => ({ symbol: s, period: 'annual', limit: 6 }) },
  priceTarget:      { path: 'price-target-consensus',         params: (s) => ({ symbol: s }),                                   pick: first },
  grades:           { path: 'grades-consensus',               params: (s) => ({ symbol: s }),                                   pick: first },
  dcf:              { path: 'discounted-cash-flow',           params: (s) => ({ symbol: s }),                                   pick: first },
  dcfLevered:       { path: 'levered-discounted-cash-flow',   params: (s) => ({ symbol: s }),                                   pick: first },
  prices:           { path: 'historical-price-eod/light',     params: (s, c) => ({ symbol: s, from: c.from, to: c.to }) },
  dividends:        { path: 'dividends',                      params: (s) => ({ symbol: s, limit: 60 }) },
  peers:            { path: 'stock-peers',                    params: (s) => ({ symbol: s }) },
  executives:       { path: 'key-executives',                 params: (s) => ({ symbol: s }) },
  execComp:         { path: 'governance-executive-compensation', params: (s) => ({ symbol: s }) },
  employees:        { path: 'historical-employee-count',      params: (s) => ({ symbol: s, limit: 12 }) },
  sharesFloat:      { path: 'shares-float',                   params: (s) => ({ symbol: s }),                                   pick: first },
  insiderTrades:    { path: 'insider-trading/search',         params: (s) => ({ symbol: s, limit: 20 }) },
  insiderStats:     { path: 'insider-trading/statistics',     params: (s) => ({ symbol: s }) },
  institutional:    { path: 'institutional-ownership/extract-analytics/holder',
                      params: (s, c) => ({ symbol: s, year: c.lastQuarter.year, quarter: c.lastQuarter.quarter, limit: 20 }) },
  news:             { path: 'news/stock',                     params: (s) => ({ symbols: s, limit: 12 }) },
  earnings:         { path: 'earnings',                       params: (s) => ({ symbol: s, limit: 8 }) },
  gradesHist:       { path: 'grades-historical',              params: (s) => ({ symbol: s, limit: 12 }) },

  /* ---- cohort & benchmark feeds -------------------------------------------
     These are keyed on the company's sector / industry rather than its ticker,
     so they are fetched once the profile is known (second pass).
     ------------------------------------------------------------------------ */
  industryPe:       { path: 'industry-pe-snapshot',           params: (s, c) => ({ date: c.asOfDate }) },
  industryPeHist:   { path: 'historical-industry-pe',         params: (s, c) => ({ industry: c.industry, from: c.from, to: c.to }) },
  sectorPerf:       { path: 'historical-sector-performance',  params: (s, c) => ({ sector: c.sector, from: c.from, to: c.to }) },
  screenIndustry:   { path: 'company-screener',
                      params: (s, c) => ({ industry: c.industry, marketCapMoreThan: c.capFloor,
                                           isActivelyTrading: true, isEtf: false, isFund: false, limit: 60 }) },
  screenSector:     { path: 'company-screener',
                      params: (s, c) => ({ sector: c.sector, marketCapMoreThan: c.capFloorWide,
                                           isActivelyTrading: true, isEtf: false, isFund: false, limit: 60 }) },
};

function first(x) { return Array.isArray(x) ? (x[0] ?? null) : x; }

/** Fetched in a second pass, once the profile tells us the sector/industry. */
export const COHORT_FEEDS = new Set([
  'industryPe', 'industryPeHist', 'sectorPerf', 'screenIndustry', 'screenSector',
]);

/* ---------- low-level fetch ----------------------------------------------- */

const cache = new Map();   // `${symbol}|${feed}` -> { at, result }

/** A feed result is always one of these shapes. */
const ok      = (data) => ({ status: 'ok', data });
const gated   = (msg)  => ({ status: 'gated', data: null, message: msg });
const failed  = (msg)  => ({ status: 'error', data: null, message: msg });
const skipped = ()     => ({ status: 'skipped', data: null });

async function fetchFeed(name, symbol, ctx) {
  const spec = FEEDS[name];
  if (!spec) return failed(`unknown feed "${name}"`);

  const key = getApiKey();
  if (!key) return skipped();

  const qs = new URLSearchParams({ ...spec.params(symbol, ctx), apikey: key });
  const url = `${BASE}/${spec.path}?${qs}`;

  let res;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
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
  if (Array.isArray(json) && json.length === 0) return ok(spec.pick ? null : []);

  return ok(spec.pick ? spec.pick(json) : json);
}

/** Cached single-feed read. */
async function readFeed(name, symbol, ctx) {
  const ck = `${symbol}|${name}`;
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

async function loadSnapshot(symbol) {
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

  // Cohort / benchmark feeds depend on the company's sector, which is only
  // known once `profile` lands, so they are fetched separately afterwards.
  const names = Object.keys(FEEDS).filter((n) => !COHORT_FEEDS.has(n));
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
