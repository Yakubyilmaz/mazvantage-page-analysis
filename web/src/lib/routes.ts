/* ==========================================================================
   Maz Vantage — URLs

   The only file that turns a destination into a URL. The legacy build had
   two kinds of address — `?symbol=&tab=` for a company report and
   `?view=&sub=` for everything else — and this one keeps exactly that split
   as real routes:

     /stock/AAPL                    the report, on its Overview
     /stock/AAPL/financial-health   one tab of it
     /markets                       a page, on its first section
     /markets/gainers               one section of it
     /ideas?idea=deep-value&f=…     page state beyond the section travels
                                    in the query, as it always did

   `src/middleware.ts` rewrites the legacy query-string links onto these, so
   a link saved from the old build still lands.
   ========================================================================== */

import { slugify } from './format';
import { NAV_VIEWS, defaultSub, hasSub } from './nav';

/**
 * The tab strip under the report head.
 *
 * `Alpha Signal` sits directly after `Ratings`, where the report stops
 * describing what the company *is* and starts describing what has recently
 * happened to it — deliberately not beside the five factor tabs, because it
 * is not a factor and does not grade on the 0-5 scale.
 */
export const TABS = [
  'Overview', 'Analysis', 'Research', 'Ratings', 'Alpha Signal', 'Financials',
  'Statistics & Metrics', 'Valuation', 'Growth', 'Financial Health',
  'Profitability', 'Momentum', 'Technicals', 'Analysts Forecast', 'Dividends', 'Transcripts', 'News',
  'Shariah Compliance',
] as const;

export type TabLabel = (typeof TABS)[number];

/**
 * Tab label -> factor key, for the five that open a factor. The labels are the
 * product's, the keys are `factors.ts`'s, and they differ in one place: the
 * factor keyed `health` is called Financial Health on the strip.
 */
export const FACTOR_TABS: Partial<Record<TabLabel, string>> = {
  Valuation: 'valuation',
  Growth: 'growth',
  'Financial Health': 'health',
  Profitability: 'profitability',
  Momentum: 'momentum',
};

/** Factor key -> the tab label that opens it. */
export const TAB_FOR_FACTOR: Record<string, TabLabel> = Object.fromEntries(
  Object.entries(FACTOR_TABS).map(([label, key]) => [key, label as TabLabel]),
);

/* Punctuation out, not just whitespace: "Statistics & Metrics" would otherwise
   reach the address bar percent-encoded. */
export const tabSlug = (tab: string) => slugify(tab);

export function tabFromSlug(slug: string | null | undefined): TabLabel | null {
  if (!slug) return null;
  return TABS.find((t) => tabSlug(t) === slug.toLowerCase()) ?? null;
}

export const DEFAULT_SYMBOL = 'AAPL';

/** A company report, optionally opened on a tab. The Overview is the bare URL. */
export function stockHref(symbol: string, tab?: string | null, hash?: string | null): string {
  const base = `/stock/${encodeURIComponent(symbol.toUpperCase())}`;
  const slug = tab ? tabSlug(tab) : '';
  const path = slug && slug !== tabSlug(TABS[0]) ? `${base}/${slug}` : base;
  return hash ? `${path}#${hash}` : path;
}

/**
 * Pages that are not about one company. `home` is `/`; `calendar` and
 * `pricing` route like a menu page but are not in `NAV` (Calendar is a rail
 * shortcut, Pricing is reached from the utility bar and the footer).
 */
export const PAGE_VIEWS = new Set<string>(['calendar', 'pricing', ...NAV_VIEWS]);

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/**
 * A page, optionally on a section, with optional page state.
 *
 * `null` means "not set"; an empty string does not. The screener needs `f=`
 * present and empty to mean "this portfolio, with its rules deliberately
 * cleared", which is a different screen from `f=` absent.
 */
export function viewHref(view: string, sub?: string | null, params?: QueryParams | null): string {
  // "Country" in the markets menu is the overview with the picker on the US.
  if (view === 'markets' && sub === 'country') {
    sub = 'overview';
    params = { ...params, country: 'US' };
  }
  if (view === 'home') return withQuery('/', params);
  const path = sub ? `/${view}/${encodeURIComponent(sub)}` : `/${view}`;
  return withQuery(path, params);
}

export function withQuery(path: string, params?: QueryParams | null): string {
  if (!params) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * Which section of a nav page to open. An unknown or absent `sub` falls back
 * to the page's first section, so a stale link to a renamed section lands
 * somewhere real rather than on an empty page.
 */
export function resolveSub(view: string, raw: string | null | undefined): string | null {
  const sub = (raw || '').toLowerCase();
  return hasSub(view, sub) ? sub : defaultSub(view);
}

/** The route for a legacy `?symbol=&tab=` / `?view=&sub=` URL, or null. */
export function legacyTarget(search: URLSearchParams, hash = ''): string | null {
  const view = (search.get('view') || '').toLowerCase();
  const symbol = search.get('symbol');
  const rest = new URLSearchParams(search);
  for (const k of ['view', 'sub', 'symbol', 'tab']) rest.delete(k);
  const tail = rest.toString() ? `?${rest}` : '';

  if (view === 'home') return `/${tail}`;
  if (view && PAGE_VIEWS.has(view)) {
    const sub = search.get('sub');
    return `/${view}${sub ? `/${encodeURIComponent(sub)}` : ''}${tail}${hash}`;
  }
  if (symbol) {
    const tab = tabFromSlug(search.get('tab'));
    return `${stockHref(symbol, tab)}${tail}${hash}`;
  }
  return null;
}
