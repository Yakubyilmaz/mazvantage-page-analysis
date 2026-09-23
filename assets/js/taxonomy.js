/* ==========================================================================
   Maz Vantage — the research taxonomy

   The structure behind the Research feed. This file owns **what an article
   can be**; it owns no DOM, fetches nothing, and is the only place a category
   or an article type is defined.

   ---------------------------------------------------------------------------
   The one idea this file exists to enforce
   ---------------------------------------------------------------------------

   **The visible filters are flat. The model underneath is not.**

   A reader sees seven pills. An article carries a primary category, an article
   type, a set of tickers, and — derived from those tickers — sectors and
   industries, plus free themes. "Top Halal Semiconductor Stocks" is therefore
   not a category and not a template. It is:

       primaryCategory: 'shariah'
       articleType:     'shariah-idea'
       industry:        'Semiconductors'   (from its tickers)

   and it is reachable by three different filter paths without anything being
   hard-coded for it. Every time you are tempted to add a category, check
   whether it is really an attribute combination first. It usually is.

   ---------------------------------------------------------------------------
   Why the type list and the filter list are the same list
   ---------------------------------------------------------------------------

   The obvious design has two: a set of internal article types the generator
   emits, and a set of filter chips the reader clicks. Two lists that describe
   the same thing drift — a type gets added, the filter for it does not, and
   the article becomes unreachable.

   So there is one list. Every article type in a category is a filter chip in
   that category, and anything finer than a type — a sector, an industry, a
   theme — is an *attribute*, filtered independently. That is why there is no
   `halal-growth` type: it is `shariah-idea` plus `theme: growth`.

   ---------------------------------------------------------------------------
   What this file deliberately does not decide
   ---------------------------------------------------------------------------

   The **vocabulary of ratings**. A quant score's verdict word comes from
   `grading.js` and a Shariah verdict's shape from `shariah.js`, because those
   are the report's own and a feed that invented a second set of words would
   be describing a different product. `quantVerdict()` below is a re-export
   with a null guard, not a second opinion.
   ========================================================================== */

import { verdictWord, verdictTone, MAX_SCORE } from './grading.js';
import { SECTORS, sectorSlug, sectorFromSlug } from './nav.js';

export { MAX_SCORE, sectorSlug, sectorFromSlug, SECTORS };

/* ==========================================================================
   1. The seven primary categories
   ========================================================================== */

/**
 * The editorial categories, in the order their pills print.
 *
 * `types` is both the article-type vocabulary for that category and the
 * secondary filter row that appears once the category is chosen — see the
 * header. `blurb` is the one line under the feed header when the category is
 * the only thing filtered.
 */
export const CATEGORIES = [
  {
    key: 'stock-analysis',
    label: 'Stock Analysis',
    blurb: 'Company work: what the accounts say about growth, returns, the balance sheet and the price action.',
    types: [
      { key: 'growth-analysis', label: 'Growth' },
      { key: 'profitability-analysis', label: 'Profitability' },
      { key: 'financial-health-analysis', label: 'Financial Health' },
      { key: 'momentum-analysis', label: 'Momentum' },
      { key: 'stock-comparison', label: 'Stock Comparison' },
      { key: 'corporate-event', label: 'Corporate Events' },
      { key: 'price-movement', label: 'Major Price Moves' },
    ],
  },
  {
    key: 'earnings',
    label: 'Earnings',
    blurb: 'The quarter: what was expected, what landed, and what management said about the next one.',
    types: [
      { key: 'earnings-analysis', label: 'Earnings Analysis' },
      { key: 'earnings-preview', label: 'Earnings Preview' },
      { key: 'earnings-surprise', label: 'Earnings Surprise' },
      { key: 'guidance', label: 'Guidance' },
    ],
  },
  {
    key: 'quant-ratings',
    label: 'Quant Ratings',
    blurb: 'Movements in the composite rating and the six factor grades underneath it.',
    types: [
      { key: 'quant-upgrade', label: 'Quant Upgrade' },
      { key: 'quant-downgrade', label: 'Quant Downgrade' },
      { key: 'eps-revisions', label: 'EPS Revisions' },
      { key: 'analyst-ratings', label: 'Analyst Ratings' },
    ],
  },
  {
    key: 'valuation',
    label: 'Valuation',
    blurb: 'Price against the multiples, against the sector, and against a modelled estimate of what the business is worth.',
    types: [
      { key: 'valuation-analysis', label: 'Valuation Analysis' },
      { key: 'undervalued', label: 'Undervalued' },
      { key: 'overvalued', label: 'Overvalued' },
      { key: 'fair-value', label: 'Fair Value' },
      { key: 'sector-comparison', label: 'Sector Comparison' },
    ],
  },
  {
    key: 'dividends',
    label: 'Dividends',
    blurb: 'What is paid, whether it is covered, and whether it has grown.',
    types: [
      { key: 'dividend-analysis', label: 'Dividend Analysis' },
      { key: 'dividend-growth', label: 'Dividend Growth' },
      { key: 'dividend-safety', label: 'Dividend Safety' },
      { key: 'dividend-increase', label: 'Dividend Increase' },
    ],
  },
  {
    key: 'investment-ideas',
    label: 'Investment Ideas',
    blurb: 'Screens and rankings: a rule set, the companies that clear it, and the reason the rule was drawn there.',
    types: [
      { key: 'top-quant', label: 'Top Quant' },
      { key: 'growth-ideas', label: 'Growth' },
      { key: 'value-ideas', label: 'Value' },
      { key: 'dividend-ideas', label: 'Dividends' },
      { key: 'momentum-ideas', label: 'Momentum' },
      { key: 'quality-ideas', label: 'Quality' },
      { key: 'sector-ranking', label: 'Sector Rankings' },
      { key: 'industry-ranking', label: 'Industry Rankings' },
    ],
  },
  {
    key: 'shariah',
    label: 'Shariah',
    blurb: 'The compliance screen and what it is measuring — kept separate from whether the company is worth owning.',
    types: [
      { key: 'stock-compliance', label: 'Stock Compliance' },
      { key: 'compliance-change', label: 'Compliance Changes' },
      { key: 'screening-analysis', label: 'Screening Analysis' },
      { key: 'shariah-idea', label: 'Investment Ideas' },
      { key: 'purification', label: 'Purification' },
    ],
  },
];

export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

/**
 * Flat index of every article type, carrying the category it belongs to.
 *
 * Built rather than written, so a type can never appear here under a category
 * it is not actually listed in.
 */
export const TYPE_BY_KEY = Object.fromEntries(
  CATEGORIES.flatMap((c) => c.types.map((t) => [t.key, { ...t, category: c.key }])));

/** The label to print for an article type, e.g. on a card's meta line. */
export function typeLabel(key) {
  return TYPE_BY_KEY[key]?.label || null;
}

/** The label to print for a category. */
export function categoryLabel(key) {
  return CATEGORY_BY_KEY[key]?.label || null;
}

/**
 * The full name a card prints under the headline: "Earnings · Earnings Analysis".
 *
 * Both halves, because the type alone is ambiguous across categories — the
 * Investment Ideas category and the Stock Analysis category both have a
 * "Growth", and they are different kinds of piece.
 */
export function typePath(article) {
  const cat = categoryLabel(article.primaryCategory);
  const type = typeLabel(article.articleType);
  if (cat && type && cat !== type) return `${cat} · ${type}`;
  return type || cat || 'Research';
}

/* ==========================================================================
   2. Themes — the attribute that is not a category
   ========================================================================== */

/**
 * Free-form editorial themes.
 *
 * Deliberately not sectors. A sector is a fact about a company that the data
 * vendor supplies; a theme is an editorial claim about what a piece is about,
 * and the two behave differently — a company is in exactly one sector and can
 * carry any number of themes.
 */
export const THEMES = [
  { key: 'ai', label: 'AI' },
  { key: 'semiconductors', label: 'Semiconductors' },
  { key: 'cloud', label: 'Cloud' },
  { key: 'megacap', label: 'Megacap' },
  { key: 'growth', label: 'Growth' },
  { key: 'value', label: 'Value' },
  { key: 'quality', label: 'Quality' },
  { key: 'dividend-growth', label: 'Dividend Growth' },
  { key: 'buybacks', label: 'Buybacks' },
  { key: 'capex', label: 'Capex Cycle' },
];

export const THEME_BY_KEY = Object.fromEntries(THEMES.map((t) => [t.key, t]));
export const themeLabel = (key) => THEME_BY_KEY[key]?.label || key;

/**
 * The second pill row: high-value shortcuts, each of which is just a filter.
 *
 * Mixed on purpose — `Technology` is a sector, `AI` is a theme, `Undervalued`
 * is an article type — because a reader scanning a pill row is not thinking in
 * the model's terms and should not have to. Each entry is a partial query, so
 * nothing here needs its own code path.
 */
export const TOPIC_PILLS = [
  { label: 'Growth', query: { theme: 'growth' } },
  { label: 'Value', query: { theme: 'value' } },
  { label: 'Dividend Ideas', query: { category: 'investment-ideas', type: 'dividend-ideas' } },
  { label: 'AI', query: { theme: 'ai' } },
  { label: 'Technology', query: { sector: 'Technology' } },
  { label: 'Semiconductors', query: { industry: 'Semiconductors' } },
  { label: 'Undervalued', query: { category: 'valuation', type: 'undervalued' } },
  { label: 'Halal Ideas', query: { category: 'shariah', type: 'shariah-idea' } },
];

/* ==========================================================================
   3. The two ratings an article can carry
   ========================================================================== */

/**
 * A quant score's verdict word.
 *
 * `grading.js` owns the bands. This wrapper exists so a view can call one
 * function on an article without knowing whether the score is present.
 */
export function quantVerdict(score) {
  return verdictWord(score);
}

export function quantTone(score) {
  return verdictTone(score);
}

/**
 * The quant filter, as the five words the report already uses.
 *
 * Exact-verdict matching rather than "4.0 and above", because the words are
 * what the rest of the product prints and a threshold filter would introduce
 * a sixth vocabulary for the same number.
 */
export const QUANT_FILTERS = [
  { key: 'strong-buy', label: 'Strong buy' },
  { key: 'buy', label: 'Buy' },
  { key: 'hold', label: 'Hold' },
  { key: 'sell', label: 'Sell' },
];

const QUANT_FILTER_WORD = {
  'strong-buy': 'Strong buy', buy: 'Buy', hold: 'Hold', sell: 'Sell',
};

/**
 * Shariah status, as four states.
 *
 * The company report deliberately refuses a one-word verdict and prints a
 * count instead — "Passes 4 of 5" — because the five published methodologies
 * disagree on identical financials. A feed still needs something filterable,
 * so the four states here are defined **as that count**, not as a new ruling:
 *
 *   compliant      every standard measured passes
 *   questionable   some pass, some fail — the disagreement case
 *   non-compliant  none pass, or the business activity is excluded outright
 *   unrated        the balance sheet loaded is too incomplete to screen
 *
 * `standardsPassed` / `standardsOf` travel with the article so a badge can
 * print the count that produced the word.
 */
export const SHARIAH_FILTERS = [
  { key: 'compliant', label: 'Compliant', tone: 'good' },
  { key: 'questionable', label: 'Questionable', tone: 'neutral' },
  { key: 'non-compliant', label: 'Non-compliant', tone: 'bad' },
];

const SHARIAH_META = {
  compliant: { label: 'Compliant', tone: 'good' },
  questionable: { label: 'Questionable', tone: 'neutral' },
  'non-compliant': { label: 'Non-compliant', tone: 'bad' },
  unrated: { label: 'Not screened', tone: 'muted' },
};

export const shariahLabel = (s) => SHARIAH_META[s]?.label || null;
export const shariahTone = (s) => SHARIAH_META[s]?.tone || 'muted';

/**
 * Pass counts -> one of the four states.
 *
 * Exported because it is the seam a real screening job plugs into: give it
 * the counts the five-standard model in `shariah.js` already produces and the
 * feed's word follows the report's arithmetic rather than an editor's typing.
 */
export function shariahStatusFromCounts({ passed = 0, failed = 0, unknown = 0, excluded = false } = {}) {
  if (excluded) return 'non-compliant';
  if (passed + failed === 0) return 'unrated';
  if (failed === 0) return 'compliant';
  if (passed === 0) return 'non-compliant';
  return 'questionable';
}

/* ==========================================================================
   4. Sorting
   ========================================================================== */

export const SORTS = [
  { key: 'latest', label: 'Latest' },
  { key: 'popular', label: 'Popular' },
  { key: 'quant', label: 'Top Quant' },
];

const SORT_KEYS = new Set(SORTS.map((s) => s.key));

/* ==========================================================================
   5. The query

   A query is a plain object of at most nine keys, every one of which is also
   a URL parameter of the same name. There is no client-side filter state
   anywhere else: the URL is the state, which is what makes a filtered feed
   shareable and the browser's back button work on it.
   ========================================================================== */

/** The URL parameters a research query is made of, in the order they print. */
export const FILTER_KEYS = [
  'category', 'type', 'sector', 'industry', 'theme', 'ticker', 'rating', 'shariah', 'q',
];

/** Everything the Research page owns in the query string. */
export const RESEARCH_PARAMS = [...FILTER_KEYS, 'sort', 'page', 'slug'];

const EMPTY = { sort: 'latest', page: 1 };

/**
 * Read a query out of the URL, dropping anything that is not real.
 *
 * Unknown values are dropped rather than kept and matched against nothing:
 * a stale link to a category that has been renamed should show the whole feed,
 * not an empty one. Every drop is silent by design — there is nothing the
 * reader could do about it.
 */
export function parseQuery(search = location.search) {
  const p = new URLSearchParams(search);
  const out = { ...EMPTY };

  const cat = p.get('category');
  if (cat && CATEGORY_BY_KEY[cat]) out.category = cat;

  const type = p.get('type');
  // A type outside the chosen category is dropped, not honoured: the two
  // together would match nothing and read as a bug rather than as an empty
  // result.
  if (type && TYPE_BY_KEY[type] && (!out.category || TYPE_BY_KEY[type].category === out.category)) {
    out.type = type;
    out.category = out.category || TYPE_BY_KEY[type].category;
  }

  // Sectors travel as slugs (`financial-services`) but are stored and matched
  // in the vendor's own spelling, which is what `sector-stats.json` is keyed
  // on everywhere else in this app.
  const sector = p.get('sector');
  if (sector) {
    const named = sectorFromSlug(sector.toLowerCase()) || SECTORS.find((s) => s === sector);
    if (named) out.sector = named;
  }

  const industry = p.get('industry');
  if (industry) out.industry = industry;

  const theme = p.get('theme');
  if (theme && THEME_BY_KEY[theme]) out.theme = theme;

  const ticker = p.get('ticker');
  if (ticker) out.ticker = ticker.toUpperCase().slice(0, 12);

  const rating = p.get('rating');
  if (rating && QUANT_FILTER_WORD[rating]) out.rating = rating;

  const shariah = p.get('shariah');
  if (shariah && SHARIAH_META[shariah]) out.shariah = shariah;

  const q = p.get('q');
  if (q && q.trim()) out.q = q.trim().slice(0, 120);

  const sort = p.get('sort');
  if (sort && SORT_KEYS.has(sort)) out.sort = sort;

  const page = parseInt(p.get('page') || '1', 10);
  if (Number.isFinite(page) && page > 1) out.page = Math.min(page, 500);

  return out;
}

/**
 * A query back to URL parameters.
 *
 * Defaults are omitted rather than written — `?sort=latest&page=1` on every
 * link makes a shared URL look like a state dump instead of a filter.
 */
export function queryToParams(query = {}) {
  const out = {};
  for (const k of FILTER_KEYS) {
    if (!query[k]) continue;
    out[k] = k === 'sector' ? sectorSlug(query[k]) : query[k];
  }
  if (query.sort && query.sort !== 'latest') out.sort = query.sort;
  if (query.page && query.page > 1) out.page = String(query.page);
  if (query.slug) out.slug = query.slug;
  return out;
}

/**
 * Merge a partial change into a query.
 *
 * Two rules that are easy to get wrong and annoying when they are:
 *
 * * **Changing the category drops the type.** A type belongs to exactly one
 *   category, so carrying `earnings-preview` into Valuation would show an
 *   empty feed the reader did not ask for.
 * * **Any change resets the page.** Landing on page 4 of a filter that has
 *   two pages is the classic pagination bug.
 *
 * Pass `null` for a key to clear it — `{ sector: null }` removes the sector.
 */
export function mergeQuery(query, change = {}) {
  const next = { ...query };
  for (const [k, v] of Object.entries(change)) {
    if (v == null || v === '') delete next[k];
    else next[k] = v;
  }
  if ('category' in change && change.category !== query.category && !('type' in change)) {
    delete next.type;
  }
  if (next.type && next.category && TYPE_BY_KEY[next.type]?.category !== next.category) {
    delete next.type;
  }
  if (!('page' in change)) next.page = 1;
  next.sort = next.sort || 'latest';
  return next;
}

/** Is anything filtered at all? Sort and page are not filters. */
export function isFiltered(query = {}) {
  return FILTER_KEYS.some((k) => query[k]);
}

/**
 * The active filters as removable chips.
 *
 * One row of "Earnings ×  Technology ×  NVDA ×" under the pills, which is the
 * only affordance that makes a four-filter query undoable one piece at a time.
 */
export function activeChips(query = {}) {
  const chips = [];
  if (query.category) chips.push({ key: 'category', label: categoryLabel(query.category) });
  if (query.type) chips.push({ key: 'type', label: typeLabel(query.type) });
  if (query.sector) chips.push({ key: 'sector', label: query.sector });
  if (query.industry) chips.push({ key: 'industry', label: query.industry });
  if (query.theme) chips.push({ key: 'theme', label: themeLabel(query.theme) });
  if (query.ticker) chips.push({ key: 'ticker', label: query.ticker });
  if (query.rating) chips.push({ key: 'rating', label: `Quant: ${QUANT_FILTER_WORD[query.rating]}` });
  if (query.shariah) chips.push({ key: 'shariah', label: `Shariah: ${shariahLabel(query.shariah)}` });
  if (query.q) chips.push({ key: 'q', label: `“${query.q}”` });
  return chips.filter((c) => c.label);
}

/* ==========================================================================
   6. Matching and sorting

   Kept here, beside the query it reads, and deliberately pure: the store in
   `articles.js` calls these over an in-memory array today, and a server-side
   query builder would translate the same object into SQL tomorrow. Neither
   knows about the other.
   ========================================================================== */

/** Does one article satisfy a query? */
export function matches(article, query = {}) {
  if (query.category && article.primaryCategory !== query.category) return false;
  if (query.type && article.articleType !== query.type) return false;
  if (query.sector && !article.sectors.includes(query.sector)) return false;
  if (query.industry && !article.industries.includes(query.industry)) return false;
  if (query.theme && !article.themes.includes(query.theme)) return false;
  if (query.ticker && !article.tickers.includes(query.ticker)) return false;
  if (query.rating && quantVerdict(article.quantRating) !== QUANT_FILTER_WORD[query.rating]) return false;
  if (query.shariah && article.shariahStatus !== query.shariah) return false;

  if (query.q) {
    // Headline, subtitle, summary and tickers. Not the body: the body is not
    // loaded for a feed row, and a search that silently covers different
    // ground depending on what happens to be in memory is worse than one with
    // a stated scope.
    const hay = `${article.title} ${article.subtitle || ''} ${article.summary || ''} `
      + `${article.tickers.join(' ')} ${article.companies.map((c) => c.name).join(' ')}`;
    if (!hay.toLowerCase().includes(query.q.toLowerCase())) return false;
  }
  return true;
}

const time = (a) => (a.publishedAtMs ?? 0);

/**
 * Sort a matched list.
 *
 * `popular` reads a view count that the sample store carries and a real one
 * would come from analytics. It falls back to recency where the figure is
 * absent, so the control never produces an arbitrary order.
 */
export function sortArticles(list, sort = 'latest') {
  const out = [...list];
  if (sort === 'quant') {
    out.sort((a, b) => (b.quantRating ?? -1) - (a.quantRating ?? -1) || time(b) - time(a));
  } else if (sort === 'popular') {
    out.sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || time(b) - time(a));
  } else {
    out.sort((a, b) => time(b) - time(a));
  }
  return out;
}
