/* ==========================================================================
   Maz Vantage — the Alpha Signal score

   Signals in, one number out, and every step of the reduction inspectable.
   Pure: no DOM, no fetching, no vendor field names. `alpha-providers.js`
   produces the signals; this file is the only place that decides what they
   are worth together.

   ---------------------------------------------------------------------------
   The score is 0-100 and the quant rating is 0-5, on purpose
   ---------------------------------------------------------------------------

   Everything else in this product grades on 0-5 against the company's own
   sector, and HANDOVER §8 is emphatic that one scale printed the same way
   everywhere is the rule. This breaks it deliberately.

   The two numbers answer different questions. The quant rating asks "how good
   is this company relative to its sector, right now"; the Alpha Signal asks
   "how much has recently changed, and how little is anyone looking". A
   company can be excellent and static, or mediocre and inflecting. Printing
   both on the same 0-5 ladder invites the reader to average them, and the
   average of those two questions is not a question.

   So the scales differ visibly, and every surface that prints one prints the
   other beside it with its own units attached.

   ---------------------------------------------------------------------------
   What the weights are, and what they are not
   ---------------------------------------------------------------------------

   They are a starting allocation, chosen for a defensible reason each, and
   **they have not been validated against anything**. No backtest has been run
   — the app stores no history to run one against (see `alpha-score` notes in
   HANDOVER). They are versioned so that a score computed under one set is
   never silently compared with a score computed under another, and they live
   in one object so that changing them is one edit.

   Anyone who tells you a hand-set weight vector is optimal is guessing. This
   file says so on the page rather than in a comment nobody reads.

   ---------------------------------------------------------------------------
   Three rules the reduction follows
   ---------------------------------------------------------------------------

   1. **A category with no data is dropped, not scored zero.** The same rule
      `rollUp` in grading.js follows, for the same reason: a gated feed should
      lower confidence, not manufacture a bad score. The weight of a dropped
      category is redistributed across the ones that did score, and the share
      that was dropped is reported as the coverage figure.

   2. **Confidence is capped by coverage.** A score built on three of eleven
      categories cannot be high-confidence however clean those three are, and
      the cap is applied after everything else so no combination of inputs can
      route around it.

   3. **Stale evidence weighs less.** Each signal's contribution is multiplied
      by its freshness factor and its confidence multiplier before the
      category mean, so a two-year-old filing and last week's one do not carry
      the same vote.
   ========================================================================== */

import { isNum, mean } from './util.js';
import { CATEGORIES, CATEGORY_BY_ID, CONFIDENCE_ORDER } from './alpha-signals.js';

/* ==========================================================================
   Weights
   ========================================================================== */

/**
 * Bump this whenever a weight, a band or a category changes.
 *
 * It is printed beside every score and stored with any snapshot, so two
 * numbers produced by different versions of this file can be told apart.
 * Without it, a weight edit silently rewrites the meaning of every score the
 * product has ever shown.
 */
export const CALC_VERSION = '1.0.0';

/**
 * The starting allocation. Sums to 1.
 *
 * The reasoning, category by category, so a future edit is an argument rather
 * than a nudge:
 *
 *   fundamental   .20  the only category made entirely of filed figures about
 *                      the business itself. Everything else is either a
 *                      derivative of it or somebody's opinion about it.
 *   revisions     .14  the fastest-moving evidence that is still somebody's
 *                      professional judgement rather than a price.
 *   commercial    .12  revenue mix and announcement cadence — filed and
 *                      published, but coarser than the statements.
 *   institutional .10  large, informed, and 45 days late. The lag is what
 *                      keeps it from being worth more.
 *   insider       .10  small samples, but the only signal where somebody
 *                      spends their own money on the open market.
 *   catalysts     .09  dated and forthcoming. Weighted for being forward-
 *                      looking, capped for being scheduling rather than news.
 *   priceVolume   .08  confirmation, never cause. Low because a price that
 *                      has already moved is the thing this feature exists to
 *                      get ahead of.
 *   attention     .07  the undercoverage leg. Genuinely part of the thesis,
 *                      and genuinely not evidence about the business.
 *   product       .05  R&D and capital spend. Real, filed, and slow.
 *   hiring        .03  annual headcount off the 10-K. Almost a year stale by
 *                      construction; weighted accordingly.
 *   macro         .02  the sector underneath. Context, and context that
 *                      applies to every company in the sector equally.
 */
export const ALPHA_WEIGHTS = {
  fundamental: 0.20,
  revisions: 0.14,
  commercial: 0.12,
  institutional: 0.10,
  insider: 0.10,
  catalysts: 0.09,
  priceVolume: 0.08,
  attention: 0.07,
  product: 0.05,
  hiring: 0.03,
  macro: 0.02,
};

/** How much a signal's vote is scaled by how sure its provider is. */
const CONFIDENCE_MULTIPLIER = { high: 1, medium: 0.8, low: 0.55, none: 0 };

/** A contextual source can never carry a high-confidence signal. */
const TIER_CAP = { primary: 'high', secondary: 'high', contextual: 'medium' };

/* ==========================================================================
   One category
   ========================================================================== */

/**
 * Reduce the signals of one category to a score, or to nothing.
 *
 * The mean is weighted by `confidence × freshness`, which is what makes a
 * fresh high-confidence signal outvote a stale low-confidence one inside the
 * same category. Signals with no score — the unavailable ones, and the
 * purely descriptive ones like an upcoming earnings date — are counted for
 * coverage but excluded from the mean, exactly as an ungraded ratio is
 * excluded from a factor score elsewhere in this app.
 */
export function scoreCategory(id, signals) {
  const spec = CATEGORY_BY_ID[id];
  if (!spec) throw new Error(`alpha: unknown category "${id}"`);

  const mine = signals.filter((s) => s.category === id);
  const scored = mine.filter((s) => isNum(s.score));

  let weightSum = 0;
  let acc = 0;
  for (const s of scored) {
    const w = (CONFIDENCE_MULTIPLIER[s.confidence] ?? 0) * (s.freshness?.factor ?? 1);
    if (w <= 0) continue;
    acc += s.score * w;
    weightSum += w;
  }

  const score = weightSum > 0 ? acc / weightSum : null;
  const positive = mine.filter((s) => s.status === 'positive').length;
  const negative = mine.filter((s) => s.status === 'negative').length;
  const missing = mine.filter((s) => s.status === 'insufficient_data').length;

  return {
    id,
    title: spec.title,
    question: spec.question,
    evidence: spec.evidence,
    weight: ALPHA_WEIGHTS[id] ?? 0,
    score,
    signals: mine,
    counts: { total: mine.length, scored: scored.length, positive, negative, missing },
    confidence: categoryConfidence(scored),
    /* The freshest dated thing in the category, which is what the card prints
       — a category is exactly as current as its most recent evidence. */
    asOf: mine.map((s) => s.sourceDate).filter(Boolean).sort().slice(-1)[0] || null,
  };
}

/** The best confidence any signal in a category supports, capped by its tier. */
function categoryConfidence(scored) {
  if (!scored.length) return 'none';
  const best = scored.reduce((top, s) => {
    const capped = capConfidence(s.confidence, TIER_CAP[s.source?.reliabilityTier] || 'medium');
    return CONFIDENCE_ORDER[capped] > CONFIDENCE_ORDER[top] ? capped : top;
  }, 'none');
  // Two agreeing signals are worth more than one, but one signal is never
  // worth "high" on its own: a category resting on a single measurement is a
  // measurement, not a finding.
  return scored.length === 1 ? capConfidence(best, 'medium') : best;
}

function capConfidence(value, cap) {
  return CONFIDENCE_ORDER[value] > CONFIDENCE_ORDER[cap] ? cap : value;
}

/* ==========================================================================
   The composite
   ========================================================================== */

/**
 * Every category, the composite, coverage and confidence.
 *
 * @param {Array} signals every signal any provider produced
 * @returns {object} the whole result, with the categories kept whole so the
 *   page can open any one of them without re-reducing anything.
 */
export function scoreAlpha(signals = []) {
  const categories = CATEGORIES.map((c) => scoreCategory(c.id, signals));

  const live = categories.filter((c) => isNum(c.score));
  const liveWeight = live.reduce((sum, c) => sum + c.weight, 0);
  const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);

  // Redistribution, not zero-filling: the composite is the weighted mean of
  // what was measured, over the weight of what was measured.
  const score = liveWeight > 0
    ? live.reduce((sum, c) => sum + c.score * c.weight, 0) / liveWeight
    : null;

  const coverage = totalWeight > 0 ? liveWeight / totalWeight : 0;

  const all = categories.flatMap((c) => c.signals);
  const positive = all.filter((s) => s.status === 'positive').length;
  const negative = all.filter((s) => s.status === 'negative').length;
  const missing = all.filter((s) => s.status === 'insufficient_data').length;

  const freshnessFactor = mean(all.filter((s) => s.sourceDate).map((s) => s.freshness.factor));

  return {
    score: isNum(score) ? Math.round(score) : null,
    version: CALC_VERSION,
    weights: { ...ALPHA_WEIGHTS },
    categories,
    coverage,
    coveragePct: Math.round(coverage * 100),
    confidence: overallConfidence(live, coverage),
    counts: { total: all.length, positive, negative, missing, categories: live.length },
    freshness: isNum(freshnessFactor) ? freshnessFactor : null,
    computedAt: new Date().toISOString(),
  };
}

/**
 * The confidence printed beside the composite.
 *
 * Coverage is a hard ceiling and is applied last. This is rule 3 of the
 * feature's acceptance criteria — "do not assign a high confidence rating
 * when the data coverage is low" — and it is expressed as a cap rather than
 * as a term in an average so that no amount of certainty elsewhere can lift
 * it. Below 30% coverage the answer is `low` regardless of anything else.
 */
function overallConfidence(live, coverage) {
  if (!live.length) return 'none';

  const ceiling = coverage >= 0.65 ? 'high' : coverage >= 0.40 ? 'medium' : 'low';

  // What the evidence itself supports, weighted the way the score is.
  const weighted = live.reduce((sum, c) => sum + CONFIDENCE_ORDER[c.confidence] * c.weight, 0)
    / live.reduce((sum, c) => sum + c.weight, 0);
  const own = weighted >= 2.5 ? 'high' : weighted >= 1.6 ? 'medium' : 'low';

  return capConfidence(own, ceiling);
}

/* ==========================================================================
   Archetypes
   ========================================================================== */

/**
 * The ten classifications, in priority order.
 *
 * Each `when` is a predicate over the reduced result plus the company's quant
 * rating, and the **first** one that matches is the primary classification.
 * Order therefore matters and is editorial: the more specific and more
 * falsifiable descriptions come first, so a company that would satisfy three
 * of them is filed under the narrowest.
 *
 * `No clear setup` is last and matches everything, which is the point — a
 * classifier that can decline to classify is the only kind worth trusting,
 * and this one declines often.
 *
 * Every archetype states its `needs`: the categories that must have scored
 * for the label to be claimable at all. A turnaround call made without
 * fundamentals is a guess with a name on it, so `when` is never even
 * consulted until `needs` are present.
 */
export const ARCHETYPES = [
  {
    id: 'fundamental-inflection',
    label: 'Fundamental inflection',
    needs: ['fundamental'],
    blurb: 'The reported numbers changed direction, and something else agrees.',
    when: (c, q) => c.fundamental >= 65 && (c.revisions >= 55 || c.commercial >= 60),
  },
  {
    id: 'emerging-compounder',
    label: 'Emerging compounder',
    needs: ['fundamental'],
    blurb: 'Already rated well, and still improving rather than coasting.',
    when: (c, q) => isNum(q) && q >= 3.5 && c.fundamental >= 60,
  },
  {
    id: 'turnaround-watch',
    label: 'Turnaround watch',
    needs: ['fundamental'],
    blurb: 'Weak on the current numbers, but the direction has turned.',
    when: (c, q) => isNum(q) && q < 2.5 && c.fundamental >= 60,
  },
  {
    id: 'fallen-leader',
    label: 'Fallen leader',
    needs: ['fundamental', 'priceVolume'],
    blurb: 'Still a good business on the current numbers; the market has left it.',
    when: (c, q) => isNum(q) && q >= 3.2 && c.priceVolume <= 35,
  },
  {
    id: 'smart-money-accumulation',
    label: 'Smart money accumulation',
    needs: ['institutional'],
    blurb: 'Reporting institutions added, on a filing that is already 45 days old.',
    when: (c) => c.institutional >= 70 && (c.insider ?? 50) >= 45,
  },
  {
    id: 'insider-conviction',
    label: 'Insider conviction',
    needs: ['insider'],
    blurb: 'Open-market insider buying, which is rare enough to be worth naming.',
    when: (c) => c.insider >= 75,
  },
  {
    id: 'catalyst-setup',
    label: 'Catalyst setup',
    needs: ['catalysts'],
    blurb: 'Something dated is close, with the rest of the evidence not against it.',
    when: (c) => c.catalysts >= 70 && (c.fundamental ?? 50) >= 45,
  },
  {
    id: 'undercovered-growth',
    label: 'Undercovered growth',
    needs: ['attention', 'fundamental'],
    blurb: 'Growing, and followed by fewer people than its size would suggest.',
    when: (c) => c.attention >= 65 && c.fundamental >= 55,
  },
  {
    id: 'crowded-winner',
    label: 'Crowded winner',
    needs: ['attention', 'priceVolume'],
    blurb: 'Everything is working and everyone already knows.',
    when: (c) => c.attention <= 30 && c.priceVolume >= 65,
  },
  {
    id: 'deteriorating-leader',
    label: 'Deteriorating leader',
    needs: ['fundamental'],
    blurb: 'Rated well today, with the recent direction against it.',
    when: (c, q) => isNum(q) && q >= 3.2 && c.fundamental <= 35,
  },
  {
    id: 'none',
    label: 'No clear setup',
    needs: [],
    blurb: 'Nothing in the evidence groups into a pattern this engine names.',
    when: () => true,
  },
];

export const ARCHETYPE_BY_ID = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));

/**
 * Classify a result.
 *
 * Returns the primary archetype plus every other one that also matched, so
 * the page can show the secondaries as tags without implying they are the
 * headline. `quantScore` is the company's existing 0-5 rating, or null — the
 * archetypes that read it are skipped when it is absent rather than
 * defaulting it, because a missing rating is not a mediocre one.
 */
export function classify(result, quantScore = null) {
  const c = Object.fromEntries(result.categories.map((x) => [x.id, x.score]));
  const has = (ids) => ids.every((id) => isNum(c[id]));

  const matched = ARCHETYPES.filter((a) => {
    if (a.id === 'none') return false;
    if (!has(a.needs)) return false;
    try { return !!a.when(c, quantScore); } catch { return false; }
  });

  const primary = matched[0] || ARCHETYPE_BY_ID.none;

  return {
    primary,
    others: matched.slice(1),
    /* The categories that argued for the label, and the ones that argue
       against it. Printed under the classification, because a classification
       without its counter-evidence is a headline. */
    supporting: result.categories
      .filter((x) => isNum(x.score) && x.score >= 60)
      .sort((a, b) => b.score - a.score),
    opposing: result.categories
      .filter((x) => isNum(x.score) && x.score <= 40)
      .sort((a, b) => a.score - b.score),
  };
}

/**
 * The sentence that explains a quant / alpha pair to somebody seeing both.
 *
 * Four quadrants, stated plainly. This is printed wherever the two numbers
 * appear together, because the single most likely misreading of this feature
 * is that a high Alpha Signal means a good company.
 */
export function pairNote(quantScore, alphaScore) {
  if (!isNum(quantScore) || !isNum(alphaScore)) {
    return 'The two ratings measure different things and are not comparable. '
      + 'One of them is unavailable for this company.';
  }
  const goodQuant = quantScore >= 3;
  const highAlpha = alphaScore >= 60;

  if (goodQuant && highAlpha) {
    return 'Rated well on its current numbers, and with recent evidence still moving in '
      + 'its favour. The two ratings agree, which is the least common of the four cases.';
  }
  if (goodQuant && !highAlpha) {
    return 'Rated well on its current numbers, with little recently changed. An established '
      + 'company that is not inflecting is exactly what this pattern looks like, and it is '
      + 'not a criticism of either rating.';
  }
  if (!goodQuant && highAlpha) {
    return 'Rated poorly on its current numbers, with recent evidence moving in its favour. '
      + 'That is what an early turnaround looks like, and also what a dead-cat bounce looks '
      + 'like; the evidence below is how you tell them apart.';
  }
  return 'Rated poorly on its current numbers, with little positive recent evidence. '
    + 'Neither rating is arguing for this company.';
}
