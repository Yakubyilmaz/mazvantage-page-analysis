/* ==========================================================================
   Vanlior — the research article store

   One seam between the Research feed and wherever articles come from. Today
   that is a JSON file of sample editorial fixtures; tomorrow it is a CMS or a
   generation pipeline. Nothing above this file knows which.

   ---------------------------------------------------------------------------
   The shape of the seam
   ---------------------------------------------------------------------------

   Three functions and one rule:

     loadArticles()                  -> Promise<Article[]>   (memoised)
     queryArticles(query, opts)      -> { items, total, page, pages, facets }
     articleBySlug(slug)             -> Article | null

   **`queryArticles` filters, sorts and paginates in one call and returns a
   page, never the whole set.** That is deliberate even though the sample store
   is small enough to filter in a `.filter()`. The signature is the one a
   server-side query has: pass a query object, get a page and a total back. When
   this is repointed at an endpoint, every caller above it is unchanged — the
   feed already asks for page 2 rather than slicing an array it holds.

   The corollary is the rule: **no view ever holds the full article list.** If
   a component needs a count it asks for `total`; if it needs facets it reads
   `facets`. A view that keeps its own array would be the thing that has to be
   rewritten when the store goes remote.

   ---------------------------------------------------------------------------
   Why the company directory is separate from the articles
   ---------------------------------------------------------------------------

   An article names tickers. It does **not** name the company, the sector or
   the industry, because those are facts about the company and would then be
   written out on every article that mentions it — thirty copies of "NVIDIA is
   in Semiconductors", one of which will eventually be wrong.

   So `companies`, `sectors` and `industries` are *derived* at load from
   `COMPANIES` below. An article may still set `sectors` or `industries`
   explicitly, which is what a market-wide piece with no ticker needs.
   ========================================================================== */

import { matches, sortArticles, CATEGORIES } from './taxonomy.js';

/** Where the sample store lives. One place, so a real source is one edit. */
const SOURCE = 'assets/data/articles.json';

/** Articles per feed page. */
export const PER_PAGE = 12;

/**
 * The standing disclosure the Research feed prints.
 *
 * This repo's rule is that a surface says what it is measuring and where the
 * figures came from. These articles are fixtures — the structure is real, the
 * numbers in them are not live — so the page says exactly that rather than
 * letting a plausible-looking quant score imply a computation that did not
 * happen.
 */
export const SAMPLE_NOTICE = 'These articles are <b>sample editorial data</b>, shipped so the '
  + 'feed, its taxonomy and the article layout can be seen working end to end. The tickers are '
  + 'real and the figures are realistic, but <b>nothing here is live</b>: no article was '
  + 'generated from a filing, and the quant scores and Shariah statuses on these cards were '
  + 'written into a fixture rather than computed by the report. Open a company to see figures '
  + 'that are.';

/* ==========================================================================
   The company directory
   ========================================================================== */

/**
 * Ticker -> the facts about the company that an article should not repeat.
 *
 * Hand-maintained for the sample store and about to be replaced by whatever
 * the platform's own company table is. Sector **and industry** strings use the
 * vendor's own spelling, because that is what `sector-stats.json`, the sector
 * pages and the grading engine are all keyed on — a twelfth spelling here
 * would produce a filter that matches nothing.
 *
 * The industry strings were checked against FMP's `available-industries`
 * endpoint rather than written from memory, which is how the first pass got
 * `Software — Infrastructure` (an em dash, and not a vendor value) where the
 * vendor says `Software - Infrastructure`. If you add a company here, look the
 * industry up rather than guessing a plausible one.
 */
export const COMPANIES = {
  AAPL:  { name: 'Apple',              sector: 'Technology',             industry: 'Consumer Electronics' },
  MSFT:  { name: 'Microsoft',          sector: 'Technology',             industry: 'Software - Infrastructure' },
  NVDA:  { name: 'NVIDIA',             sector: 'Technology',             industry: 'Semiconductors' },
  AMD:   { name: 'Advanced Micro Devices', sector: 'Technology',         industry: 'Semiconductors' },
  AVGO:  { name: 'Broadcom',           sector: 'Technology',             industry: 'Semiconductors' },
  TSM:   { name: 'Taiwan Semiconductor', sector: 'Technology',           industry: 'Semiconductors' },
  GOOGL: { name: 'Alphabet',           sector: 'Communication Services', industry: 'Internet Content & Information' },
  META:  { name: 'Meta Platforms',     sector: 'Communication Services', industry: 'Internet Content & Information' },
  AMZN:  { name: 'Amazon',             sector: 'Consumer Cyclical',      industry: 'Specialty Retail' },
  TSLA:  { name: 'Tesla',              sector: 'Consumer Cyclical',      industry: 'Auto - Manufacturers' },
  ADBE:  { name: 'Adobe',              sector: 'Technology',             industry: 'Software - Infrastructure' },
  CRM:   { name: 'Salesforce',         sector: 'Technology',             industry: 'Software - Application' },
  ORCL:  { name: 'Oracle',             sector: 'Technology',             industry: 'Software - Infrastructure' },
  QCOM:  { name: 'Qualcomm',           sector: 'Technology',             industry: 'Semiconductors' },
  TXN:   { name: 'Texas Instruments',  sector: 'Technology',             industry: 'Semiconductors' },
  LRCX:  { name: 'Lam Research',       sector: 'Technology',             industry: 'Semiconductors' },
  ASML:  { name: 'ASML',               sector: 'Technology',             industry: 'Semiconductors' },
  UNH:   { name: 'UnitedHealth',       sector: 'Healthcare',             industry: 'Medical - Healthcare Plans' },
  LLY:   { name: 'Eli Lilly',          sector: 'Healthcare',             industry: 'Drug Manufacturers - General' },
  JNJ:   { name: 'Johnson & Johnson',  sector: 'Healthcare',             industry: 'Drug Manufacturers - General' },
  ABBV:  { name: 'AbbVie',             sector: 'Healthcare',             industry: 'Drug Manufacturers - General' },
  XOM:   { name: 'Exxon Mobil',        sector: 'Energy',                 industry: 'Oil & Gas Integrated' },
  CVX:   { name: 'Chevron',            sector: 'Energy',                 industry: 'Oil & Gas Integrated' },
  CAT:   { name: 'Caterpillar',        sector: 'Industrials',            industry: 'Industrial - Machinery' },
  HON:   { name: 'Honeywell',          sector: 'Industrials',            industry: 'Conglomerates' },
  UNP:   { name: 'Union Pacific',      sector: 'Industrials',            industry: 'Railroads' },
  PG:    { name: 'Procter & Gamble',   sector: 'Consumer Defensive',     industry: 'Household & Personal Products' },
  KO:    { name: 'Coca-Cola',          sector: 'Consumer Defensive',     industry: 'Beverages - Non-Alcoholic' },
  COST:  { name: 'Costco',             sector: 'Consumer Defensive',     industry: 'Discount Stores' },
  NEE:   { name: 'NextEra Energy',     sector: 'Utilities',              industry: 'Regulated Electric' },
  LIN:   { name: 'Linde',              sector: 'Basic Materials',        industry: 'Chemicals - Specialty' },
  JPM:   { name: 'JPMorgan Chase',     sector: 'Financial Services',     industry: 'Banks - Diversified' },
};

/** Ticker -> its display name, for anything that needs one without the rest. */
export const companyName = (ticker) => COMPANIES[ticker]?.name || ticker;

/* ==========================================================================
   Loading and normalising
   ========================================================================== */

/**
 * The memo.
 *
 * A promise rather than an array, so two callers arriving in the same tick
 * share one request instead of racing two. `CACHE` is the resolved list and
 * exists only so the feed can render synchronously on a filter change — see
 * `articlesReady`.
 */
let PENDING = null;
let CACHE = null;

/**
 * Fill in everything an article should not have written out by hand.
 *
 * Runs once per article at load. Anything derived here is *read-only* to the
 * views above: they consume `sectors`, never recompute it.
 */
function normalise(raw, index) {
  const tickers = (raw.tickers || []).map((t) => String(t).toUpperCase());
  const companies = tickers.map((t) => ({ ticker: t, ...(COMPANIES[t] || { name: t }) }));

  // Explicit wins. A sector ranking has no ticker and names its own sector; a
  // company piece names none and inherits from the companies it is about.
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const sectors = raw.sectors?.length ? raw.sectors : uniq(companies.map((c) => c.sector));
  const industries = raw.industries?.length ? raw.industries : uniq(companies.map((c) => c.industry));

  const publishedAtMs = Date.parse(raw.publishedAt) || 0;

  return {
    id: raw.id || `a${index}`,
    slug: raw.slug,
    title: raw.title,
    subtitle: raw.subtitle || null,
    summary: raw.summary || null,
    body: raw.body || [],

    primaryCategory: raw.primaryCategory,
    articleType: raw.articleType,

    tickers,
    companies,
    sectors,
    industries,
    themes: raw.themes || [],

    // `quantLabel` is deliberately not stored. The word for a score comes from
    // `grading.js` via `quantVerdict()`, so a fixture cannot ship a score and a
    // word that disagree — which is the single most embarrassing thing a
    // ratings feed can do.
    quantRating: typeof raw.quantRating === 'number' ? raw.quantRating : null,
    quantLetter: raw.quantLetter || null,

    shariahStatus: raw.shariahStatus || null,
    standardsPassed: raw.standardsPassed ?? null,
    standardsOf: raw.standardsOf ?? null,

    author: raw.author || 'Vanlior Research',
    sourceType: raw.sourceType || 'sample',
    readingMinutes: raw.readingMinutes || estimateReading(raw),
    views: raw.views ?? 0,

    publishedAt: raw.publishedAt,
    publishedAtMs,
    updatedAt: raw.updatedAt || null,

    seoTitle: raw.seoTitle || raw.title,
    metaDescription: raw.metaDescription || raw.summary || '',
    // Derived, not stored: a canonical URL written into the data is a second
    // copy of the routing rules that will drift from the router the first time
    // a slug scheme changes.
    get canonicalUrl() { return articleUrl(this.slug); },

    /** Where the piece points on the company report, when it points anywhere. */
    stockTab: raw.stockTab || null,
    related: raw.related || [],
  };
}

/** Roughly 200 words a minute over whatever prose the body carries. */
function estimateReading(raw) {
  const words = (raw.body || [])
    .flatMap((b) => [b.text, b.lead, ...(b.bull || []), ...(b.bear || [])])
    .filter(Boolean)
    .join(' ')
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

/** The in-app URL for one article. The one place the slug scheme is written. */
export function articleUrl(slug) {
  return `?view=research&sub=article&slug=${encodeURIComponent(slug)}`;
}

/**
 * Load the store, once.
 *
 * A failed fetch resolves to an empty list rather than rejecting: the feed
 * renders its own "nothing loaded" state, and a page that throws on a missing
 * fixture is a worse failure than one that says the shelf is empty.
 */
export function loadArticles() {
  if (PENDING) return PENDING;
  PENDING = fetch(SOURCE)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
    .then((json) => {
      const list = (json.articles || []).filter((a) => a.slug && a.title).map(normalise);
      CACHE = list;
      return list;
    })
    .catch((err) => {
      console.warn(`[articles] ${SOURCE} could not be loaded — ${err.message}`);
      CACHE = [];
      return CACHE;
    });
  return PENDING;
}

/**
 * The list if it is already in memory, otherwise null.
 *
 * The feed re-renders on every filter click, and every one of those goes
 * through the router and rebuilds the page. Waiting a frame for a promise
 * that has already resolved would put a skeleton on screen between two
 * identical feeds — so the first render awaits and every one after it is
 * synchronous.
 */
export const articlesReady = () => CACHE;

/* ==========================================================================
   Querying
   ========================================================================== */

/**
 * Filter, sort and paginate.
 *
 * `facets` is the count per primary category over everything *except* the
 * category filter itself — which is what makes the pill row show how much is
 * behind each pill without the current pill zeroing the other six.
 */
export function queryArticles(query = {}, { perPage = PER_PAGE, list = CACHE } = {}) {
  const all = list || [];

  const { category, ...rest } = query;
  const withoutCategory = all.filter((a) => matches(a, rest));

  const facets = { all: withoutCategory.length };
  for (const c of CATEGORIES) {
    facets[c.key] = withoutCategory.filter((a) => a.primaryCategory === c.key).length;
  }

  const matched = category
    ? withoutCategory.filter((a) => a.primaryCategory === category)
    : withoutCategory;

  const sorted = sortArticles(matched, query.sort);
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, query.page || 1), pages);

  return {
    items: sorted.slice((page - 1) * perPage, page * perPage),
    total, page, pages, perPage, facets,
  };
}

/** One article by its slug. */
export function articleBySlug(slug, list = CACHE) {
  return (list || []).find((a) => a.slug === slug) || null;
}

/**
 * What to read next.
 *
 * Scored rather than filtered, because a strict "same ticker and same
 * category" match returns nothing on most articles and an empty Related block
 * is worse than a loosely related one. A shared ticker is worth most — it is
 * the strongest signal two pieces are about the same thing — then category,
 * then theme, then industry.
 */
export function relatedArticles(article, n = 4, list = CACHE) {
  if (!article) return [];
  const score = (b) => {
    let s = 0;
    if (b.tickers.some((t) => article.tickers.includes(t))) s += 6;
    if (b.primaryCategory === article.primaryCategory) s += 3;
    if (b.themes.some((t) => article.themes.includes(t))) s += 2;
    if (b.industries.some((i) => article.industries.includes(i))) s += 1;
    return s;
  };
  return (list || [])
    .filter((b) => b.slug !== article.slug)
    .map((b) => ({ b, s: score(b) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || y.b.publishedAtMs - x.b.publishedAtMs)
    .slice(0, n)
    .map((x) => x.b);
}

/**
 * The research a company page should surface.
 *
 * The other half of the internal-linking graph: articles link to stock pages
 * through `TickerLink`, and a stock page reads this to link back. Exported
 * from the store rather than from the feed so a company surface can call it
 * without importing any of the feed's DOM.
 */
export function articlesForTicker(ticker, n = 5, list = CACHE) {
  const sym = String(ticker || '').toUpperCase();
  return (list || [])
    .filter((a) => a.tickers.includes(sym))
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
    .slice(0, n);
}
