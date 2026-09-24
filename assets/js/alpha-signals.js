/* ==========================================================================
   Vanlior — the Alpha Signal vocabulary

   One place that knows what a signal is, what a source is, and what the
   eleven categories are called. No DOM, no fetching, no arithmetic about a
   particular company — `alpha-providers.js` produces signals through these
   factories, `alpha-score.js` reduces them, and the two views only format.

   ---------------------------------------------------------------------------
   The one idea this file exists to enforce
   ---------------------------------------------------------------------------

   A signal is not a number. It is a **claim with its basis attached**, and
   the basis is not optional: `signal()` refuses to build one without a
   source, a retrieval time and a data quality. That refusal is the whole
   point — every other guarantee this feature makes ("no fabricated data",
   "the reader can inspect the calculation", "facts are distinguishable from
   interpretations") is enforced here or nowhere.

   Four things are kept apart on purpose, because collapsing them is how a
   research tool starts lying:

     VERIFIED FACT        a number somebody filed or published. `raw` and
                          `previous` are the filed figures, unmodified.
     CALCULATED SIGNAL    arithmetic this app did on those figures.
                          `calculation` states it in full.
     MODEL INTERPRETATION what this app makes of the result. Always a
                          separate field, never mixed into the fact.
     ATTENTION DATA       how much notice the market is taking. Never
                          evidence about the business, and tagged so it
                          cannot be read as such.

   ---------------------------------------------------------------------------
   Why "insufficient_data" is a first-class status
   ---------------------------------------------------------------------------

   Most of what the spec for this feature asks for is not purchasable. Job
   postings, patent grants, search interest and supply-chain relationships
   have no provider behind them here. The temptation in each case is to
   approximate — to call headcount "hiring momentum", or news volume
   "search interest" — and every one of those approximations would be a
   different measurement wearing the name of the one the reader expects.

   So a provider with nothing to say returns a signal whose status is
   `insufficient_data` and whose `unavailable` field names the provider that
   would be needed. The category still appears on the page, still shows its
   weight, and still counts against data coverage. A missing signal you can
   see is worth more than a plausible one you cannot check.
   ========================================================================== */

import { isNum } from './util.js';

/* ==========================================================================
   Source types and their reliability tier
   ========================================================================== */

/**
 * Where a fact can come from, and how far it is to be trusted.
 *
 * `primary` is the company or the regulator saying it themselves. `secondary`
 * is a vendor that compiled it — FMP is here, and so is any licensed feed,
 * because a compiler can drop a restatement or mis-map a field. `contextual`
 * is everything that colours a reading without being evidence for it.
 *
 * The tier is not decoration. `alpha-score.js` caps the confidence of any
 * signal built on a contextual source, so a category cannot reach high
 * confidence on commentary alone.
 */
export const SOURCE_TYPES = {
  sec_filing:        { label: 'SEC filing',        tier: 'primary' },
  company_ir:        { label: 'Company IR',        tier: 'primary' },
  earnings_release:  { label: 'Earnings release',  tier: 'primary' },
  transcript:        { label: 'Call transcript',   tier: 'primary' },
  government:        { label: 'Government data',   tier: 'primary' },
  fmp:               { label: 'Financial Modeling Prep', tier: 'secondary' },
  licensed_provider: { label: 'Licensed provider', tier: 'secondary' },
  market_data:       { label: 'Market data',       tier: 'secondary' },
  news:              { label: 'News',              tier: 'contextual' },
  attention_data:    { label: 'Attention data',    tier: 'contextual' },
};

/**
 * A source record.
 *
 * `url` is left null far more often than it is filled, and deliberately:
 * FMP normalises filings into JSON without carrying the EDGAR document they
 * came from, so a link back to "the original source" would have to be
 * constructed. A constructed link that lands on the wrong filing is worse
 * than no link, so this only ever carries a URL a feed actually supplied.
 */
export function source({
  id, type, publisher, title = null, url = null,
  publicationDate = null, retrievedAt = new Date().toISOString(),
}) {
  const spec = SOURCE_TYPES[type];
  if (!spec) throw new Error(`alpha: unknown source type "${type}"`);
  return {
    id,
    sourceType: type,
    typeLabel: spec.label,
    reliabilityTier: spec.tier,
    publisher,
    title,
    url,
    publicationDate,
    retrievedAt,
  };
}

/** The FMP source record every vendor-derived signal cites. */
export const fmpSource = (feed, { publicationDate = null, title = null } = {}) => source({
  id: `fmp:${feed}`,
  type: 'fmp',
  publisher: 'Financial Modeling Prep',
  title: title || `${feed} feed`,
  publicationDate,
});

/* ==========================================================================
   The eleven categories
   ========================================================================== */

/**
 * Every category the engine can speak about, in the order the page reads.
 *
 * `weight` is the share of the composite it carries; the weights are edited
 * in `alpha-score.js`, which imports this list and is the one place they are
 * defined. `evidence` says what kind of thing the category is made of, which
 * is what lets the page print the ATTENTION DATA badge without each provider
 * having to remember to.
 *
 * `question` is printed above the category's card. It is phrased as a
 * question rather than as a claim because that is what the category is: a
 * thing the engine looked into, not a thing it concluded.
 */
export const CATEGORIES = [
  {
    id: 'fundamental',
    title: 'Fundamental inflection',
    question: 'Has the reported business changed direction?',
    evidence: 'fundamental',
  },
  {
    id: 'revisions',
    title: 'Revision momentum',
    question: 'Are the people who cover it marking their expectations up or down?',
    evidence: 'fundamental',
  },
  {
    id: 'commercial',
    title: 'Commercial momentum',
    question: 'Is the revenue mix moving, and is the company announcing more?',
    evidence: 'fundamental',
  },
  {
    id: 'institutional',
    title: 'Institutional activity',
    question: 'Are reporting institutions adding or reducing?',
    evidence: 'fundamental',
  },
  {
    id: 'insider',
    title: 'Insider conviction',
    question: 'Are insiders buying on the open market with their own money?',
    evidence: 'fundamental',
  },
  {
    id: 'product',
    title: 'Product and investment',
    question: 'Is the company spending more on building things?',
    evidence: 'fundamental',
  },
  {
    id: 'hiring',
    title: 'Workforce',
    question: 'Is the headcount it reports growing?',
    evidence: 'fundamental',
  },
  {
    id: 'priceVolume',
    title: 'Price and volume',
    question: 'Is the market already moving, and on what participation?',
    evidence: 'market',
  },
  {
    id: 'catalysts',
    title: 'Catalysts',
    question: 'What is dated and coming?',
    evidence: 'fundamental',
  },
  {
    id: 'attention',
    title: 'Investor attention',
    question: 'How closely is this followed, relative to its size?',
    evidence: 'attention',
  },
  {
    id: 'macro',
    title: 'Industry context',
    question: 'What is the sector doing underneath it?',
    evidence: 'context',
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/* ==========================================================================
   Statuses, quality and confidence
   ========================================================================== */

export const STATUSES = ['positive', 'negative', 'neutral', 'insufficient_data'];

/**
 * How a value came to be, printed as a badge beside every signal.
 *
 * `verified` is a filed or published figure, reproduced. `calculated` is
 * arithmetic this app did on verified figures. `estimated` is a figure a
 * third party modelled — a consensus, a rating. `unavailable` is a signal
 * with no data behind it at all.
 */
export const QUALITY_LABELS = {
  verified: 'VERIFIED FACT',
  calculated: 'CALCULATED SIGNAL',
  estimated: 'MODEL INTERPRETATION',
  attention: 'ATTENTION DATA',
  unavailable: 'INSUFFICIENT DATA',
};

export const CONFIDENCE_ORDER = { high: 3, medium: 2, low: 1, none: 0 };

/**
 * How stale a dated fact is, as a 0..1 multiplier and a readable phrase.
 *
 * Full weight for a month, then a straight-line decay to a floor over two
 * years. The floor is not zero on purpose: a filed figure from eighteen
 * months ago is old, but it is not *wrong*, and scoring it to nothing would
 * make a company that files annually look like a company with no data.
 */
const FRESH_FULL_DAYS = 35;
const FRESH_FLOOR_DAYS = 730;
const FRESH_FLOOR = 0.35;

export function freshness(dateish, now = new Date()) {
  const d = dateish ? new Date(dateish) : null;
  if (!d || Number.isNaN(d.getTime())) {
    return { days: null, factor: FRESH_FLOOR, text: 'undated' };
  }
  const days = Math.max(0, Math.round((now - d) / 864e5));
  let factor = 1;
  if (days > FRESH_FULL_DAYS) {
    const span = FRESH_FLOOR_DAYS - FRESH_FULL_DAYS;
    const over = Math.min(days - FRESH_FULL_DAYS, span);
    factor = 1 - (over / span) * (1 - FRESH_FLOOR);
  }
  const text = days === 0 ? 'today'
    : days === 1 ? 'yesterday'
    : days < 31 ? `${days} days ago`
    : days < 365 ? `${Math.round(days / 30)} months ago`
    : `${(days / 365).toFixed(1)} years ago`;
  return { days, factor, text };
}

/* ==========================================================================
   The signal factory
   ========================================================================== */

let seq = 0;

/**
 * Build one signal.
 *
 * Every field the evidence drawer prints is a parameter here, and the three
 * that make a claim checkable — `sourceRef`, `calculation`, `dataQuality` —
 * are required rather than defaulted. A provider that cannot supply them is
 * a provider that should be returning `unavailableSignal()` instead, and
 * throwing here is how that stays true as providers get added.
 *
 * `score` is 0..100 in the signal's own terms, or null when there is nothing
 * to score. It is deliberately **not** derived from `status`: a signal can be
 * positive and weak, and a category that averaged statuses rather than scores
 * would rate a 1% margin gain the same as a 6% one.
 */
export function signal({
  category,
  name,
  symbol,
  status = 'neutral',
  score = null,
  raw = null,
  previous = null,
  change = null,
  unit = null,
  sourceRef,
  sourceDate = null,
  calculation,
  dataQuality,
  confidence = 'medium',
  historical = null,
  interpretation = null,
  limitations = null,
}) {
  if (!CATEGORY_BY_ID[category]) throw new Error(`alpha: unknown category "${category}"`);
  if (!STATUSES.includes(status)) throw new Error(`alpha: unknown status "${status}"`);
  if (!sourceRef) throw new Error(`alpha: signal "${name}" has no source`);
  if (!calculation) throw new Error(`alpha: signal "${name}" states no calculation`);
  if (!QUALITY_LABELS[dataQuality]) throw new Error(`alpha: signal "${name}" has no data quality`);

  const fresh = freshness(sourceDate);

  return {
    id: `${category}.${slug(name)}.${seq += 1}`,
    key: `${category}.${slug(name)}`,
    category,
    name,
    symbol: symbol || null,
    status,
    score: isNum(score) ? Math.max(0, Math.min(100, score)) : null,
    raw,
    previous,
    change,
    unit,
    source: sourceRef,
    sourceDate,
    retrievedAt: sourceRef.retrievedAt,
    freshness: fresh,
    calculation,
    historical,
    interpretation,
    limitations,
    dataQuality,
    qualityLabel: QUALITY_LABELS[dataQuality],
    confidence,
    unavailable: null,
  };
}

/**
 * A signal that could not be built, and why.
 *
 * `provider` names what would have to be connected — not "no data", but the
 * specific integration missing. That is the difference between a gap a reader
 * can act on and a shrug.
 */
export function unavailableSignal({
  category, name, symbol = null, provider, note = null,
}) {
  if (!CATEGORY_BY_ID[category]) throw new Error(`alpha: unknown category "${category}"`);
  return {
    id: `${category}.${slug(name)}.${seq += 1}`,
    key: `${category}.${slug(name)}`,
    category,
    name,
    symbol,
    status: 'insufficient_data',
    score: null,
    raw: null,
    previous: null,
    change: null,
    unit: null,
    source: null,
    sourceDate: null,
    retrievedAt: new Date().toISOString(),
    freshness: freshness(null),
    calculation: null,
    historical: null,
    interpretation: null,
    limitations: note,
    dataQuality: 'unavailable',
    qualityLabel: QUALITY_LABELS.unavailable,
    confidence: 'none',
    unavailable: { provider, note },
  };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ==========================================================================
   Small shared helpers for providers
   ========================================================================== */

/**
 * Map a measured change onto 0..100 through a stated band.
 *
 * `mid` is the value that scores 50 — usually zero, "no change" — and `span`
 * is the distance either side that saturates the scale. Linear and clamped
 * rather than a curve, because the band is the thing a reader has to be able
 * to check, and "±8 percentage points of margin is the full scale" is a
 * sentence the page can print. A logistic would not be.
 */
export function bandScore(value, { mid = 0, span = 1, invert = false } = {}) {
  if (!isNum(value) || !isNum(span) || span === 0) return null;
  const t = (value - mid) / span;
  const pos = 50 + (invert ? -t : t) * 50;
  return Math.max(0, Math.min(100, pos));
}

/** The status a scored signal argues for, on one shared set of cut points. */
export function statusFor(score, { dead = 8 } = {}) {
  if (!isNum(score)) return 'insufficient_data';
  if (score >= 50 + dead) return 'positive';
  if (score <= 50 - dead) return 'negative';
  return 'neutral';
}
