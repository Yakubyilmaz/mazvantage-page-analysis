/* ==========================================================================
   Vanlior — the dividend engine

   Four composite scores, on their own 1–5 scale, computed from the lines in
   `dividend-lines.js`. **There is deliberately no overall dividend score.**

   ---------------------------------------------------------------------------
   Why there is no total, and why that is not a gap
   ---------------------------------------------------------------------------

   Safety, growth, yield and consistency pull against each other by
   construction: the highest yields in a sector usually belong to the payers
   with the least safety, and a fast-growing dividend is usually a small one.
   Averaging the four would net those tensions out into a number that moves
   for reasons a reader cannot see, and the tension is the finding. So the
   module reports four composites and stops. The spec's own weighting —
   Safety 2×, the rest 1× — is kept on each factor for anyone who wants to
   build a total later, and is printed, but nothing here multiplies by it.

   ---------------------------------------------------------------------------
   And why this is not the quant rating
   ---------------------------------------------------------------------------

   Nothing here touches `scores` from the equity model and nothing there reads
   this. Different universe (payers only, ranked against payers), different
   scale (1–5 rather than 0–5), different distribution table. A company can be
   a Strong Buy on the quant composite and a poor dividend on every one of
   these four, and that would be a coherent statement about it.

   ---------------------------------------------------------------------------
   The arithmetic, in the spec's words
   ---------------------------------------------------------------------------

     sector-relative percentile per line   (oriented so 1 is always good)
       → weighted average within the factor, over the lines that computed
       → re-rank that composite against the sector's own composite spread
       → score = 1 + 4 × percentile

   A line that cannot be computed is **dropped and its weight renormalised**
   across the survivors. Nothing is ever imputed to zero or to the median: an
   absent figure lowers the confidence a factor reports, never the score.
   ========================================================================== */

import { isNum, clamp } from './util.js';
import { percentileOf, medianOf, breaksFromSample, rankLabel } from './grading.js';
import { DIV_FACTORS, DIV_LINES } from './dividend-lines.js';
import { dividendInputs } from './dividend-model.js';

/** The dividend scale runs 1 to 5, not 0 to 5. */
export const DIV_MIN = 1;
export const DIV_MAX = 5;

/**
 * Seeking Alpha's thirteen-grade ladder, evenly spaced over 1–5.
 *
 * Its own ladder rather than the equity model's, because the two scales have
 * different floors: a 1.0 here is the worst payer in the sector, while a 1.0
 * on the quant model is a fifth of the way up a 0–5 scale. Sharing the letters
 * would mean the same letter described two different positions.
 */
export const DIV_BANDS = [
  ['A+', 4.7], ['A', 4.4], ['A-', 4.1],
  ['B+', 3.8], ['B', 3.5], ['B-', 3.2],
  ['C+', 2.9], ['C', 2.6], ['C-', 2.3],
  ['D+', 2.0], ['D', 1.7], ['D-', 1.4],
  ['F', -Infinity],
];

export function dividendLetter(score) {
  if (!isNum(score)) return null;
  for (const [letter, floor] of DIV_BANDS) if (score >= floor) return letter;
  return 'F';
}

/** Three tones, matching the report's grade colouring. */
export function dividendTone(score) {
  if (!isNum(score)) return 'na';
  if (score >= 3.8) return 'strong';
  if (score >= 3.2) return 'good';
  if (score >= 2.3) return 'mid';
  if (score >= 1.7) return 'weak';
  return 'poor';
}

/** A percentile, as the spec words it: `score = 1 + 4 × percentile`. */
export const scoreFromPercentile = (p) =>
  (isNum(p) ? clamp(DIV_MIN + (DIV_MAX - DIV_MIN) * clamp(p, 0, 1), DIV_MIN, DIV_MAX) : null);

/* ==========================================================================
   The distribution table
   ========================================================================== */

let tablePromise = null;

/**
 * The payer distributions, fetched once per page load.
 *
 * A separate table from `sector-stats.json` on purpose: these are
 * **payers ranked against payers**. A yield distribution that included every
 * non-payer's zero would put a 2% yielder in the top decile of its sector,
 * which is the failure the universe rule exists to prevent.
 */
export function loadDividendStats(url = 'assets/data/dividend-stats.json') {
  tablePromise ??= fetch(url, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return tablePromise;
}

/**
 * A lookup bound to one sector.
 *
 * `peerSamples` is `{ lineId: number[] }` from whatever live payers the page
 * has to hand; it is used only where the table has nothing, and anything
 * graded from it comes back tagged `peers` so the panel can say so.
 */
export function dividendLookup(stats, sector, peerSamples = {}) {
  const table = stats?.sectors?.[sector] || null;
  const cache = new Map();

  return {
    sector,
    available: !!table,
    count: table?.count ?? null,
    quality: stats?.source ?? null,
    generatedAt: stats?.generatedAt ?? null,
    composites: table?.composites || null,

    distFor(id) {
      const d = table?.lines?.[id];
      if (d && Array.isArray(d.p) && d.p.length > 1) return { dist: d, source: 'sector' };
      if (!cache.has(id)) {
        const sample = (peerSamples[id] || []).filter(isNum);
        const p = breaksFromSample(sample);
        cache.set(id, p ? { dist: { p, n: sample.length }, source: 'peers' } : null);
      }
      return cache.get(id);
    },
  };
}

/* ==========================================================================
   One line
   ========================================================================== */

/**
 * Grade one line against its sector distribution.
 *
 * `state` is always set: `ok`, `nm` (the line cannot be built at all — it
 * carries its own reason), `missing` (buildable, but this company has no
 * figure), or `unranked` (a figure with no distribution to rank it in).
 * Only `ok` contributes to a composite.
 */
export function gradeLine(line, inputs, lookup) {
  const base = {
    id: line.id, label: line.label, group: line.group, weight: line.weight,
    better: line.better, desc: line.desc || '', note: line.note || null,
    workaround: line.workaround || null, approximate: !!line.approximate,
    value: null, text: 'n/a', pctile: null, score: null, letter: null,
    rank: null, median: null, source: null, state: 'missing', why: '',
  };

  if (line.na) return { ...base, state: 'nm', why: line.na };

  let value = null;
  try {
    value = line.get(inputs);
  } catch {
    value = null;                       // a feed missing anywhere upstream
  }
  if (!isNum(value)) {
    return { ...base, why: 'The figures this line needs are not in the loaded data for this company.' };
  }

  const fmt = line.fmt || ((v) => String(v));
  const found = lookup.distFor(line.id);
  if (!found) {
    return {
      ...base, value, text: fmt(value), state: 'unranked',
      why: 'No distribution of dividend payers is available for this line in this sector.',
    };
  }

  const raw = percentileOf(value, found.dist.p);
  if (!isNum(raw)) {
    return { ...base, value, text: fmt(value), state: 'unranked', source: found.source,
      why: 'The figure could not be placed in the payer distribution.' };
  }

  // Oriented so 1 is always the good end. A payout ratio above 100% is not
  // clamped anywhere in this path: it simply lands at the bad end, which is
  // the whole point of ranking it rather than testing it against a threshold.
  const pctile = line.better === 'low' ? 1 - raw : raw;
  const score = scoreFromPercentile(pctile);

  return {
    ...base,
    value, text: fmt(value), state: 'ok', source: found.source,
    pctile, score, letter: dividendLetter(score),
    rank: rankLabel(pctile),
    median: medianOf(found.dist.p),
    sampleSize: found.dist.n ?? null,
  };
}

/* ==========================================================================
   One factor
   ========================================================================== */

/**
 * The weighted average of the lines that computed, renormalised.
 *
 * `coverage` is the share of the factor's designed weight that survived — the
 * honest measure of how much of the factor was actually measurable for this
 * company, and the number the panel prints instead of a confidence adjective.
 */
export function composeFactor(lines) {
  const ok = lines.filter((l) => l.state === 'ok' && isNum(l.pctile) && l.weight > 0);
  const designed = lines.reduce((a, l) => a + (l.weight || 0), 0);
  const live = ok.reduce((a, l) => a + l.weight, 0);

  if (!live) {
    return { composite: null, coverage: 0, designed, used: 0, lines: ok.length, total: lines.length };
  }
  const composite = ok.reduce((a, l) => a + l.pctile * l.weight, 0) / live;
  return {
    composite,
    coverage: designed > 0 ? live / designed : null,
    designed, used: live, lines: ok.length, total: lines.length,
  };
}

/* ==========================================================================
   The four composites
   ========================================================================== */

/**
 * Score one company's dividend.
 *
 * Returns `{ pays, factors: {...}, ... }` and never an overall figure. A
 * non-payer returns `pays: false` and no factors at all — excluded from the
 * universe rather than ranked last in it.
 */
export function scoreDividends(a, stats, { peerSamples = {}, feeds = {} } = {}) {
  const inputs = dividendInputs(a, feeds);
  const lookup = dividendLookup(stats, inputs.sector, peerSamples);

  if (!inputs.pays) {
    return {
      pays: false, lapsed: inputs.lapsed, inputs, lookup,
      factors: {}, order: [],
      why: 'This company has no record of regular dividend payments, so it is outside the dividend '
        + 'universe. It is not scored — a non-payer ranked against payers would come last on every '
        + 'line and read as a bad dividend rather than as no dividend.',
    };
  }

  const factors = {};
  for (const factor of DIV_FACTORS) {
    const lines = DIV_LINES[factor.key].map((line) => gradeLine(line, inputs, lookup));
    const { composite, coverage, designed, used, lines: n, total } = composeFactor(lines);

    /* The re-rank. A weighted average of percentiles bunches around the middle
       — average four ranks and the extremes cancel — so ranking that composite
       against the sector's own spread of composites is what puts the scale
       back. Without a table to rank in, the composite is used as it stands and
       `reranked` says so rather than the page implying a sector position that
       was never measured. */
    const spread = lookup.composites?.[factor.key];
    const reranked = isNum(composite) && Array.isArray(spread) && spread.length > 1
      ? percentileOf(composite, spread) : null;
    const pctile = isNum(reranked) ? reranked : composite;
    const score = scoreFromPercentile(pctile);

    factors[factor.key] = {
      ...factor,
      lines,
      composite, pctile, score,
      letter: dividendLetter(score),
      tone: dividendTone(score),
      rank: isNum(pctile) ? rankLabel(pctile) : null,
      reranked: isNum(reranked),
      coverage, designedWeight: designed, usedWeight: used,
      gradedLines: n, totalLines: total,
      nm: lines.filter((l) => l.state === 'nm'),
      missing: lines.filter((l) => l.state === 'missing'),
    };
  }

  return {
    pays: true,
    lapsed: inputs.lapsed,
    inputs, lookup,
    factors,
    order: DIV_FACTORS.map((f) => f.key),
    /** The table these ranks came from, for the panel's own disclosure. */
    table: {
      available: lookup.available,
      quality: lookup.quality,
      generatedAt: lookup.generatedAt,
      count: lookup.count,
      sector: inputs.sector,
    },
  };
}
