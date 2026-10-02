/* ==========================================================================
   Maz Vantage — the destinations

   The data half of the legacy `nav.js`: **what the destinations are**. The
   rail that opens them is `components/shell/side-nav.tsx`; the section strip
   every page carries is `components/shell/page-head.tsx`.

   ---------------------------------------------------------------------------
   The routing model
   ---------------------------------------------------------------------------

   Every destination is a `(view, sub)` pair. The legacy build wrote it as
   `?view=markets&sub=gainers`; this one routes it as `/markets/gainers` (see
   `routes.ts`, which is the only file that turns a destination into a URL).
   A view with no `sub` opens its first section, so `/markets` and
   `/markets/overview` are the same page.

   Three kinds of item:
     { label, sub }               — a section of that page
     { label, symbolTab }         — a tab on the company report
     { label, view }              — another page entirely
   `hidden: true` is routable but not a menu item; `built: false` greys an
   item that does not render yet.
   ========================================================================== */

import { slugify } from './format';

/* ==========================================================================
   The eleven sectors
   ========================================================================== */

/**
 * The sector list, in the vendor's own spelling.
 *
 * Hard-coded rather than read from `available-sectors`, because the whole
 * grading engine keys `sector-stats.json` on exactly these strings — a nav
 * that offered a twelfth spelling would open a page with no distribution
 * behind it. If FMP renames one, this list and the stats builder move
 * together or neither moves.
 */
export const SECTORS = [
  'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
  'Communication Services', 'Industrials', 'Consumer Defensive', 'Energy',
  'Basic Materials', 'Real Estate', 'Utilities',
] as const;

/** A sector name to the slug it travels as. */
export const sectorSlug = (name: string) => slugify(name);

export const sectorFromSlug = (slug: string): string | null =>
  SECTORS.find((s) => sectorSlug(s) === slug) || null;

/**
 * Sector -> the SPDR sector ETF that tracks it.
 *
 * The nearest thing to an index for each sector, and the only way to quote a
 * sector's return over a month or a year without averaging several hundred
 * companies by hand. Two unrelated surfaces read it: the report's momentum
 * benchmark, and the sector breakdown.
 */
export const SECTOR_ETF: Record<string, string> = {
  Technology: 'XLK',
  'Communication Services': 'XLC',
  'Consumer Cyclical': 'XLY',
  'Consumer Defensive': 'XLP',
  Healthcare: 'XLV',
  'Financial Services': 'XLF',
  Industrials: 'XLI',
  Energy: 'XLE',
  'Basic Materials': 'XLB',
  Utilities: 'XLU',
  'Real Estate': 'XLRE',
};

/** The whole market, for anything a sector is measured against. */
export const MARKET_ETF = 'SPY';

/* ==========================================================================
   The portfolio groups
   ========================================================================== */

/**
 * The sections the Investment Ideas portfolios are filed under, in order.
 *
 * Here rather than in `ideas.ts` for exactly the reason `SECTORS` is here: it
 * is a **destination vocabulary**. The rail builds a menu item per group and
 * the router accepts a slug per group, so a group renamed in one place and not
 * the other would be a menu item opening an empty page.
 *
 * Editorial order: **Featured screens** first — the presets a reader arriving
 * from another research product will look for by name — then the screens built
 * on this report's own grades, and the sector screens last. A portfolio whose
 * group is missing from this list still renders, under "More".
 */
export const IDEA_GROUPS = [
  'Featured screens', 'Halal', 'Our ratings', 'Ranked portfolios', 'Value', 'Growth', 'Income',
  'Quality and safety', 'Insider signals', 'Institutional holders', 'Momentum', 'Sectors', 'Size',
] as const;

/** A group name to the slug it travels as. Same shape as `sectorSlug`. */
export const ideaGroupSlug = (name: string) => slugify(name);

export const ideaGroupFromSlug = (slug: string): string | null =>
  IDEA_GROUPS.find((g) => ideaGroupSlug(g) === slug) || null;

/* ==========================================================================
   The destinations
   ========================================================================== */

export type NavParams = Record<string, string>;

export interface NavItem {
  label: string;
  sub?: string;
  view?: string;
  symbolTab?: string;
  params?: NavParams;
  hidden?: boolean;
  built?: boolean;
}

export type NavIcon =
  | 'bars' | 'news' | 'trending' | 'basket' | 'layers' | 'star' | 'bulb' | 'file' | 'mic'
  | 'target' | 'shield' | 'dashboard' | 'calendar' | 'search';

export interface NavMenu {
  view: string;
  icon: NavIcon;
  label: string;
  blurb?: string;
  items: NavItem[];
}

const screen = (kind: string) => ([label, collection]: [string, string]): NavItem =>
  ({ label, sub: 'screener', params: { country: 'US', kind, collection } });

export const NAV: NavMenu[] = [
  {
    view: 'markets',
    icon: 'bars',
    label: 'Markets Data',
    blurb: 'What the market did today — indices, equities, funds, rates, movers and sectors.',
    items: [
      { label: 'Market Overview', sub: 'overview' },
      { label: 'Country', sub: 'country' },
      // The four asset-class pages, in the order a markets hub reads: what the
      // indices did, then equities, then funds, then the rates underneath.
      { label: 'Indices', sub: 'indices' },
      { label: 'Stocks', sub: 'stocks' },
      { label: 'Futures', sub: 'futures' },
      { label: 'Corporate Bonds', sub: 'corporate' },
      { label: 'ETFs', sub: 'etfs' },
      { label: 'Economy', sub: 'economy' },
      // The three mover lists are reached from the overview's own rankings and
      // from Home, not from the bar: `hidden` keeps the routes alive.
      { label: 'Gainers', sub: 'gainers', hidden: true },
      { label: 'Losers', sub: 'losers', hidden: true },
      { label: 'Most Active', sub: 'active', hidden: true },
      { label: 'Sectors', sub: 'sectors' },
      { label: 'Industries', sub: 'industries' },
    ],
  },
  {
    view: 'news',
    icon: 'news',
    label: 'Market News',
    blurb: 'The wire, by the part of the market it is about.',
    items: [
      { label: 'Latest', sub: 'latest' },
      { label: 'Stocks', sub: 'stocks' },
      { label: 'ETFs', sub: 'etfs' },
      { label: 'Indices', sub: 'indices' },
      { label: 'Futures', sub: 'futures' },
      { label: 'Economy', sub: 'economy' },
      // The keyword topics this menu used to carry. Searches over a wire
      // rather than parts of the market, so they keep their routes and leave
      // the menu — a link written before the rebuild still lands.
      { label: 'Earnings News', sub: 'earnings', hidden: true },
      { label: 'Dividend News', sub: 'dividends', hidden: true },
      { label: 'M&A', sub: 'ma', hidden: true },
      { label: 'Analyst Ratings', sub: 'ratings', hidden: true },
      { label: 'Stock News', sub: 'stock', hidden: true },
    ],
  },
  {
    view: 'stocks',
    icon: 'trending',
    label: 'Stock Screener',
    blurb: 'Every listed company, and screens over the whole market graded on the way through.',
    /* Funds are their own menu underneath: a company is scored against its
       sector, a fund is selected from a listing. */
    items: [
      { label: 'All Stocks', sub: 'screener', params: { country: 'US', kind: 'stocks', collection: 'all' } },
      ...([
        ['Top Quants by Maz Vantage', 'stocks-by-quant'],
        ['Top Stocks by WallStreet', 'top-wallstreet-stocks'],
        ['Top Growth', 'top-growth-stocks'],
        ['Top Value', 'top-value-stocks'],
        ['Top Performance', 'score-momentum'],
        ['Top Profitability', 'score-profitability'],
        ['Top Health', 'score-health'],
      ] as [string, string][]).map(screen('stocks')),
      // Preserve existing deep links outside the hover menu.
      ...([
        ['All Stocks', 'all'], ['Top Quant Stocks', 'top'], ['Top WallStreet Stocks', 'wallstreet'],
        ['Growth Stocks', 'growth'], ['Value Stocks', 'value'], ['Dividend Stocks', 'dividend'], ['Stock Comparison', 'compare'],
      ] as [string, string][]).map(([label, sub]) => ({ label, sub, hidden: true })),
    ],
  },
  {
    view: 'etfs',
    icon: 'basket',
    label: 'ETF Screener',
    blurb: 'Every listed fund, the collections that cut the list down, and an X-Ray of a mix of '
      + 'funds. Funds are selected here, not given the company score.',
    /* Every item is the one screener with a collection preset. The ids are
       `ETF_COLLECTIONS` keys; a rename there without one here is a menu item
       opening the default collection, so the two move together. */
    items: [
      { label: 'All ETFs', sub: 'screener', params: { country: 'US', kind: 'etfs', collection: 'all' } },
      ...([
        ['Largest funds', 'largest'],
        ['Most traded', 'most-traded'],
        ['Highest distribution yield', 'highest-yield'],
        ['Equity', 'equity'],
        ['Fixed income', 'bond'],
        ['Commodities', 'commodities'],
        ['Gold', 'gold'],
        ['Bitcoin', 'bitcoin'],
        ['Real estate', 'real-estate'],
        ['World and global', 'global'],
        ['Country funds', 'country'],
        ['Sector funds', 'sector'],
        ['Leveraged', 'leveraged'],
        ['Inverse', 'inverse'],
        ['Shariah', 'shariah'],
      ] as [string, string][]).map(screen('etfs')),
      // The curated side of funds, which a screener cannot do.
      { label: 'ETF Tables', view: 'markets', sub: 'etfs', params: { board: 'tables' } },
      { label: 'Shariah ETFs', view: 'markets', sub: 'etfs', params: { board: 'tables', table: 'shariah' } },
      // A mix of funds read as one portfolio: what it owns underneath.
      { label: 'Fund X-Ray', sub: 'xray' },
    ],
  },
  {
    view: 'sectors',
    icon: 'layers',
    label: 'Sectors',
    blurb: 'The breakdown across all eleven, then one page per sector.',
    items: [
      // The index, and the default: a bare `/sectors` opens the breakdown
      // rather than whichever sector happens to sort first.
      { label: 'Sector Breakdown', sub: 'all' },
      ...SECTORS.map((s) => ({ label: s, sub: sectorSlug(s) })),
      // One industry. A destination rather than a section, and there are a
      // hundred and thirty of them, so the name travels in `?industry=`.
      { label: 'Industry', sub: 'industry', hidden: true },
    ],
  },
  {
    view: 'watchlist',
    icon: 'star',
    label: 'Watchlist',
    blurb: 'The companies you follow, in the screener’s own table.',
    items: [{ label: 'My watchlists', sub: 'lists' }],
  },
  {
    view: 'ideas',
    icon: 'bulb',
    label: 'Investment Ideas',
    blurb: 'Portfolio screens over the whole market, curated by Maz Vantage. Open one to see its rules and the companies that pass them today.',
    items: [
      { label: 'All portfolios', sub: 'all' },
      { label: 'Superinvestors', sub: 'superinvestors' },
      ...IDEA_GROUPS.map((g) => ({ label: g, sub: ideaGroupSlug(g) })),
    ],
  },
  {
    view: 'research',
    icon: 'file',
    label: 'Research',
    blurb: 'The long-form work: the article feed, company reports, ideas and method.',
    items: [
      // First, and therefore what a bare `/research` opens.
      { label: 'Latest Research', sub: 'latest' },
      // One article: a destination, not a section.
      { label: 'Article', sub: 'article', hidden: true },
      { label: 'Stock Analysis', symbolTab: 'Research' },
      { label: 'Investing Strategy', sub: 'strategy' },
      { label: 'Calculators', sub: 'calculators' },
      { label: 'Investment Ideas', view: 'ideas' },
      { label: 'Earnings Calendar', view: 'calendar' },
      // The report's two tabs, mounted on this page for any company rather
      // than sending the reader out to the report.
      { label: 'Valuation', sub: 'valuation' },
      { label: 'Dividends', sub: 'dividends' },
      { label: 'Sectors & Industries', view: 'sectors' },
    ],
  },
  {
    view: 'earnings',
    icon: 'mic',
    label: 'Earnings',
    blurb: 'The calendar as a table — who reports next, who beat, and by how much — plus the '
      + 'library of calls with a transcript on record.',
    /* The six screens are one page with one table, so they share
       `sub: 'screener'` and differ in `screen`. */
    items: [
      ...([
        ['Upcoming Earnings', 'upcoming'],
        ['Reported Earnings', 'reported'],
        ['EPS Beats', 'beats'],
        ['EPS Misses', 'misses'],
        ['Revenue Beats', 'revbeats'],
        ['Double Beats', 'double'],
      ] as [string, string][]).map(([label, s]) => ({ label, sub: 'screener', params: { screen: s } })),
      { label: 'Earnings Insights', sub: 'insights' },
      { label: 'Earnings Call Transcripts', sub: 'transcripts' },
      { label: 'Method', sub: 'method' },
    ],
  },
  {
    view: 'quant',
    icon: 'target',
    label: 'Quant',
    blurb: 'The rating itself — the eight screens that rank on it, what it measures, and the '
      + 'one thing it cannot tell you.',
    /* The eight screens share `sub: 'screener'` and differ in `collection`;
       the ids are screener presets, repeated in `quant` as `QUANT_SCREENS`. */
    items: [
      ...([
        ['Top Quant Stocks', 'stocks-by-quant'],
        ['Top Valuation', 'score-valuation'],
        ['Top Growth', 'score-growth'],
        ['Top Profitability', 'score-profitability'],
        ['Top Health', 'score-health'],
        ['Top Momentum', 'score-momentum'],
        ['Top Dividend', 'top-quant-dividend-stocks'],
        ['Top Signal Stocks', 'score-all-round'],
      ] as [string, string][]).map(([label, collection]) => ({ label, sub: 'screener', params: { collection } })),
      { label: 'Quant Ratings', sub: 'ratings' },
      { label: 'Factor Grades', sub: 'factors' },
      { label: 'Rating Upgrades', sub: 'upgrades' },
      { label: 'Rating Downgrades', sub: 'downgrades' },
      // The slug this menu used for its leader board before the rebuild.
      { label: 'Top Quant Stocks', sub: 'top', hidden: true },
      // Both rating-change items land on one tab.
      { label: 'Rating Changes', sub: 'changes', hidden: true },
    ],
  },
  {
    view: 'alpha',
    icon: 'bulb',
    label: 'Alpha Signal',
    blurb: 'Where something measurable has recently changed, and fewer people than usual are '
      + 'looking. Eleven categories of dated, sourced evidence — separate from the quant rating '
      + 'and deliberately on a different scale.',
    /* The scanner is the default because it is the destination; Limits is a
       real section rather than a footnote — the weights are unvalidated. */
    items: [
      { label: 'Alpha Scanner', sub: 'scan' },
      { label: 'Method & Weights', sub: 'method' },
      { label: 'Limits & Validation', sub: 'limits' },
      { label: 'On a company', symbolTab: 'Alpha Signal' },
      // The slugs the three tabs also answer to.
      { label: 'Scanner', sub: 'screener', hidden: true },
      { label: 'Methodology', sub: 'methodology', hidden: true },
      { label: 'Backtesting', sub: 'backtest', hidden: true },
    ],
  },
  {
    view: 'shariah',
    icon: 'shield',
    label: 'Shariah',
    blurb: 'The compliance screen run across the market rather than one company, with the '
      + 'method, the purification question, and what the screen cannot test.',
    items: [
      { label: 'Halal Stock Screener', sub: 'screener' },
      { label: 'Top Halal Stocks', sub: 'top' },
      { label: 'Halal Dividend Stocks', sub: 'dividend' },
      { label: 'Halal Growth Stocks', sub: 'growth' },
      { label: 'Halal Value Stocks', sub: 'value' },
      { label: 'Compliance Changes', sub: 'changes' },
      { label: 'Shariah Methodology', sub: 'methodology' },
      { label: 'Purification', sub: 'purification' },
      /* Funds, which none of the screens above can reach: a fund has no
         balance sheet of its own. */
      { label: 'Shariah ETFs & Funds', view: 'markets', sub: 'etfs', params: { board: 'tables', table: 'shariah' } },
    ],
  },
];

/** view slug -> its menu. */
export const NAV_BY_VIEW: Record<string, NavMenu> = Object.fromEntries(NAV.map((m) => [m.view, m]));

/** Every view the bar can open, for the router's allow-list. */
export const NAV_VIEWS = NAV.map((m) => m.view);

/** The first section of a page — what a bare view opens. */
export function defaultSub(view: string): string | null {
  return NAV_BY_VIEW[view]?.items.find((i) => i.sub && !i.hidden)?.sub || null;
}

/**
 * Is `sub` a real section of `view`?
 *
 * Hidden sections count. This is the router's allow-list, and a section the
 * router refuses is a link that silently lands somewhere else.
 */
export function hasSub(view: string, sub: string | null | undefined): boolean {
  return !!NAV_BY_VIEW[view]?.items.some((i) => i.sub === sub);
}

/**
 * Is this menu item the page the reader is on?
 *
 * Several items share a `sub` and differ in their params (the screener
 * presets), so the query decides between them. A missing `kind`/`collection`
 * reads as the screener's own defaults; `country` never distinguishes one.
 */
export function matchesDestination(item: NavItem, sub: string | null | undefined, query: URLSearchParams): boolean {
  if (item.sub !== sub) return false;
  const defaults: Record<string, string> = { kind: 'stocks', collection: 'all' };
  return Object.entries(item.params || {}).every(([key, value]) =>
    key === 'country' || (query.get(key) || defaults[key]) === value);
}

/** The label to print for a `(view, sub)` pair. */
export function labelFor(view: string, sub: string | null | undefined): string {
  const menu = NAV_BY_VIEW[view];
  if (!menu) return '';
  const item = menu.items.find((i) => i.sub === sub);
  return item?.label || menu.label;
}

/** The items a menu lists: routable, built, and not a hidden destination. */
export const menuItems = (menu: NavMenu) => menu.items.filter((i) => !i.hidden && i.built !== false);

/** Pages that route like a menu but are not one in `NAV`. */
export const OFF_RAIL_TITLES: Record<string, string> = { pricing: 'Plans & pricing', calendar: 'Calendar', home: 'Home' };
