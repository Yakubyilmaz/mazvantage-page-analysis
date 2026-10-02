/* ==========================================================================
   The FMP paths this app is allowed to ask for.

   Shared by the browser client (`lib/fmp.ts`) and the server proxy
   (`app/api/data/[...path]/route.ts`). The proxy spends the operator's key when
   one is configured, so it refuses any path not listed here — otherwise it
   would be an open door to every endpoint on the operator's plan.

   Adding a feed means adding its path here and in the catalogue that uses it.
   ========================================================================== */

export const FMP_BASE = 'https://financialmodelingprep.com/stable';

/** Per-symbol feeds (the `FEEDS` catalogue). */
export const FEED_PATHS = [
  'quote', 'profile', 'ratios-ttm', 'key-metrics-ttm', 'financial-scores',
  'income-statement', 'balance-sheet-statement', 'cash-flow-statement',
  'ratios', 'key-metrics', 'financial-growth', 'owner-earnings',
  'historical-employee-count', 'ratings-snapshot', 'earning-call-transcript-dates',
  'revenue-product-segmentation', 'revenue-geographic-segments', 'revenue-geographic-segmentation',
  'analyst-estimates', 'price-target-consensus', 'grades-consensus',
  'discounted-cash-flow', 'levered-discounted-cash-flow',
  'historical-price-eod/light', 'historical-price-eod/full', 'historical-chart/5min',
  'dividends', 'stock-peers', 'key-executives', 'governance-executive-compensation',
  'shares-float', 'insider-trading/search', 'insider-trading/statistics',
  'institutional-ownership/extract-analytics/holder',
  'news/stock', 'news/press-releases', 'earnings',
  'historical-grades', 'price-target-summary',
  'institutional-ownership/symbol-positions-summary',
  'sec-filings-search/symbol',
] as const;

/** Market-wide reads outside the per-symbol catalogue. */
export const MARKET_WIDE_PATHS = [
  'company-screener', 'earning-call-transcript', 'earnings-transcript-list',
  'earnings-calendar', 'dividends-calendar', 'splits-calendar',
  'biggest-gainers', 'biggest-losers', 'most-actives',
  'sector-performance-snapshot', 'industry-performance-snapshot',
  'sector-PE-snapshot', 'industry-PE-snapshot',
  'treasury-rates', 'economic-calendar',
  'news/general-latest', 'news/stock-latest', 'news/press-releases-latest',
  'batch-quote', 'etf/info', 'etf-info',
  'batch-index-quotes', 'batch-crypto-quotes', 'batch-forex-quotes', 'batch-commodity-quotes',
  'commodities-list', 'ipos-calendar', 'economic-indicators', 'stock-price-change',
  'etf/asset-exposure', 'etf/holdings', 'etf/sector-weightings', 'etf/country-weightings',
  'institutional-ownership/dates', 'institutional-ownership/extract',
  'institutional-ownership/holder-performance-summary', 'institutional-ownership/holder-industry-breakdown',
] as const;

export const ALLOWED_PATHS: ReadonlySet<string> = new Set<string>([...FEED_PATHS, ...MARKET_WIDE_PATHS]);

/** The request header a key set through the hidden link travels in (never the query string). */
export const KEY_HEADER = 'x-data-key';

/**
 * The vendor's image hosts, each under a short alias in this app's own
 * `/api/img/<alias>/<path>` route. The data proxy rewrites every response's
 * addresses with this list, and the image route reverses it — so a logo or a
 * news picture never points at the vendor. Longest prefix first, so the
 * legacy `image-stock` path is matched before the bare host would be.
 */
export const IMAGE_HOSTS: [string, string][] = [
  ['https://images.financialmodelingprep.com/', 'i'],
  ['https://financialmodelingprep.com/image-stock/', 's'],
];
export const IMAGE_ORIGIN: Record<string, string> = Object.fromEntries(IMAGE_HOSTS.map(([host, alias]) => [alias, host]));
