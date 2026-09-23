/* ==========================================================================
   Maz Vantage — the Alpha Signal narrative

   The written half of the feature: what is improving, what is deteriorating,
   what is worth watching, and what nothing here can answer. Pure — signals
   in, structured prose out, no DOM and no fetching.

   ---------------------------------------------------------------------------
   Why there is no model behind this
   ---------------------------------------------------------------------------

   The specification this feature was built from asks for an AI layer that
   reads the structured signals and writes the summary, under a list of
   constraints: do not hallucinate values, cite the source of every factual
   statement, never invent a citation, say so when evidence is missing.

   This app is a static page with no server, so there is no model endpoint to
   call. That turned out to be the better answer rather than a limitation to
   apologise for, because those four constraints describe a function, not a
   model. Every sentence below is emitted **by the signal that owns the fact**
   — the numbers come from the signal's own fields and the wording from its
   own `interpretation`, which the provider wrote next to the arithmetic that
   produced it.

   The consequences are worth stating plainly, in both directions:

     * A value cannot be hallucinated, because no step in this file composes
       a number. It moves them.
     * A citation cannot be invented, because every item carries the `id` of
       a real signal and the source record attached to it, and an item with
       no signal cannot be constructed.
     * Missing evidence is reported, because `insufficient_data` signals are
       routed to their own section rather than skipped.
     * The prose is **flatter than a language model's**. It repeats sentence
       shapes and it will never notice that two findings are the same story
       told twice. That is the trade, and it is a trade this file loses.

   If a model is ever wired in, it should take this structure as its input and
   be forbidden from adding facts to it — the job would be rewriting these
   sentences, not sourcing them.

   ---------------------------------------------------------------------------
   What it refuses to write
   ---------------------------------------------------------------------------

   No verdict, no target, no "buy". The closest this file comes to a
   conclusion is `whatWouldConfirm`, which lists the measurements that would
   settle the question — a next-quarter figure, a margin, a filing. That is
   the honest shape of an early-stage thesis: not an answer, but a list of
   things that are about to become answerable.
   ========================================================================== */

import { isNum } from './util.js';
import { CATEGORY_BY_ID } from './alpha-signals.js';

/* ==========================================================================
   Evidence items
   ========================================================================== */

/**
 * One line of evidence, with everything needed to check it.
 *
 * `signalId` is what the page uses to open the evidence drawer, so an item
 * can always be traced back to the arithmetic behind it. There is no path
 * through this file that produces an item without one.
 */
function item(sig) {
  return {
    signalId: sig.id,
    signalKey: sig.key,
    category: sig.category,
    categoryTitle: CATEGORY_BY_ID[sig.category]?.title || sig.category,
    name: sig.name,
    text: sig.interpretation || sig.name,
    detail: sig.calculation || null,
    quality: sig.dataQuality,
    qualityLabel: sig.qualityLabel,
    confidence: sig.confidence,
    source: sig.source,
    sourceDate: sig.sourceDate,
    freshness: sig.freshness,
    score: sig.score,
    limitations: sig.limitations || null,
  };
}

/** Strongest first, then freshest — the order a reader should meet them in. */
function rank(signals, direction) {
  return signals
    .slice()
    .sort((a, b) => {
      const aScore = isNum(a.score) ? a.score : 50;
      const bScore = isNum(b.score) ? b.score : 50;
      const byScore = direction === 'up' ? bScore - aScore : aScore - bScore;
      if (byScore !== 0) return byScore;
      return (b.freshness?.factor ?? 0) - (a.freshness?.factor ?? 0);
    });
}

/* ==========================================================================
   The summary sentence
   ========================================================================== */

/**
 * Two or three sentences over the top of everything else.
 *
 * Assembled from counts and the single strongest finding, never from a
 * template with adjectives in it. The one editorial decision is the opening
 * clause, which is chosen from the coverage figure rather than from the
 * score — because how much was measured has to be the first thing a reader
 * learns, not a footnote under a number they have already believed.
 */
function summarise(result, classification, symbol) {
  const { score, coveragePct, counts, confidence } = result;
  const parts = [];

  if (!isNum(score)) {
    return `Nothing in this engine could be measured for ${symbol}. No category returned a `
      + 'scoreable signal, so there is no Alpha Signal score — not a low one.';
  }

  parts.push(
    `${symbol} scores ${score} out of 100 on ${counts.categories} of the eleven signal `
    + `categories, covering ${coveragePct}% of the model's weight at ${confidence} confidence.`,
  );

  const label = classification.primary.label;
  if (classification.primary.id === 'none') {
    parts.push('The evidence does not group into a pattern this engine names, which is the '
      + 'most common outcome and not a negative finding.');
  } else {
    parts.push(`The pattern it best matches is ${label.toLowerCase()}: `
      + `${classification.primary.blurb.replace(/^[A-Z]/, (m) => m.toLowerCase())}`);
  }

  parts.push(
    `${counts.positive} signal${counts.positive === 1 ? '' : 's'} read positive, `
    + `${counts.negative} negative, and ${counts.missing} could not be measured at all.`,
  );

  return parts.join(' ');
}

/* ==========================================================================
   What would settle it
   ========================================================================== */

/**
 * The measurements that would confirm or kill the reading, per category.
 *
 * Keyed by category rather than written per company, because the thing that
 * would confirm a margin inflection is the same thing for every company that
 * has one: the next quarter's margin. Only categories that actually scored
 * produce a line — there is nothing to confirm about a measurement that was
 * never taken.
 */
const CONFIRMATIONS = {
  fundamental: 'Whether the next quarterly filing extends the direction or reverses it. One '
    + 'quarter of acceleration is a data point; two is a trend.',
  revisions: 'Whether analysts follow a rating change with a numbers change, and whether the '
    + 'next report lands above or below the estimates they are carrying now.',
  commercial: 'Whether the segment whose share moved keeps moving in the next annual '
    + 'breakdown, and whether management names it as a driver.',
  institutional: 'The next 13F cycle, 45 days after this quarter ends. One quarter of '
    + 'accumulation is a quarter, not a position.',
  insider: 'Whether any open-market purchases follow. A single buy is one person; several '
    + 'insiders buying in the same window is a different reading.',
  product: 'Whether raised development spending shows up as revenue in a segment, which is '
    + 'the only place it becomes checkable.',
  hiring: 'The next annual filing\'s headcount, which is the only workforce figure this app '
    + 'can see.',
  priceVolume: 'Whether relative strength persists through the next report, or was the market '
    + 'pricing in something the report then contradicts.',
  catalysts: 'The scheduled report itself. Every other signal in this engine is a prediction '
    + 'about what it will contain.',
  attention: 'Whether coverage or institutional ownership actually rises. Undercoverage that '
    + 'never resolves is just a small company.',
  macro: 'Whether the sector move reaches this company\'s own reported numbers, which this '
    + 'engine cannot tell you in advance.',
};

/* ==========================================================================
   The narrative
   ========================================================================== */

/**
 * Build the whole written view.
 *
 * @param {object} result        from `scoreAlpha`
 * @param {object} classification from `classify`
 * @param {string} symbol
 * @returns {{summary, improving, deteriorating, watch, unconfirmed, risks,
 *            whatWouldConfirm, sources}}
 */
export function narrate(result, classification, symbol = '') {
  const all = result.categories.flatMap((c) => c.signals);

  const positive = all.filter((s) => s.status === 'positive');
  const negative = all.filter((s) => s.status === 'negative');
  const neutral = all.filter((s) => s.status === 'neutral' && isNum(s.score));
  const missing = all.filter((s) => s.status === 'insufficient_data');

  /* Risks are not a separate measurement — they are the negative evidence,
     plus anything whose own provider flagged a limitation strong enough to
     undercut it. Inventing a "risks" list that is not made of the signals
     already on the page would be the one place this file could smuggle in a
     claim, so it is built from them and nothing else. */
  const thin = all.filter((s) => isNum(s.score)
    && (s.confidence === 'low' || (s.freshness?.days ?? 0) > 365));

  return {
    symbol,
    summary: summarise(result, classification, symbol || 'This company'),

    /** Source-backed positive evidence, strongest first. */
    improving: rank(positive, 'up').map(item),

    /** Source-backed negative evidence, worst first. */
    deteriorating: rank(negative, 'down').map(item),

    /** Measured, but not arguing either way. */
    watch: rank(neutral, 'up').map(item),

    /** Named gaps, each with the integration that would close it. */
    unconfirmed: missing.map((s) => ({
      signalId: s.id,
      category: s.category,
      categoryTitle: CATEGORY_BY_ID[s.category]?.title || s.category,
      name: s.name,
      provider: s.unavailable?.provider || 'an unnamed provider',
      note: s.unavailable?.note || null,
    })),

    /** Evidence that is real but weak, so a reader does not over-read it. */
    risks: [
      ...rank(negative, 'down').map(item),
      ...thin.filter((s) => s.status !== 'negative').map((s) => ({
        ...item(s),
        text: (s.freshness?.days ?? 0) > 365
          ? `${s.name} is ${s.freshness.text} and is weighted down accordingly.`
          : `${s.name} is a low-confidence measurement: ${s.limitations || 'see its calculation.'}`,
      })),
    ],

    /** What would settle each question the engine actually asked. */
    whatWouldConfirm: result.categories
      .filter((c) => isNum(c.score) && CONFIRMATIONS[c.id])
      .sort((a, b) => b.weight - a.weight)
      .map((c) => ({ category: c.id, categoryTitle: c.title, text: CONFIRMATIONS[c.id] })),

    /** Every distinct source cited anywhere above, for the footer. */
    sources: dedupeSources(all),
  };
}

function dedupeSources(signals) {
  const seen = new Map();
  for (const s of signals) {
    if (!s.source) continue;
    if (!seen.has(s.source.id)) seen.set(s.source.id, { ...s.source, uses: 0 });
    seen.get(s.source.id).uses += 1;
  }
  return [...seen.values()].sort((a, b) => b.uses - a.uses);
}
