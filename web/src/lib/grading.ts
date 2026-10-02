/* ==========================================================================
   Maz Vantage — sector-relative grading

   The one place that knows how a raw ratio becomes a grade.

   A metric is graded by locating its value inside the distribution of that
   same metric across the company's sector, then reading the position off as:

     pctile   0..1, already oriented so 1 is always "good"
     grade    pctile * 5, matching the 0-5 scale the report scores on
     letter   A..F, from LETTER_BANDS below
     rank     "Top 12%" / "Bottom 39%"
     vsMedian 'pass' | 'fail' | 'na', against the sector median

   `vsMedian` is a **display marker only**. It is never summed, averaged or
   counted into any score — a factor's score comes from the mean of its
   metric grades and nothing else. The tick tells you which side of the
   sector's midpoint a number falls on, the grade tells you how far.

   Distributions come from public/data/sector-stats.json, generated offline by
   tools/build_sector_stats.py. When the table has no entry for a sector or a
   metric, the caller can pass a live peer sample instead and the result is
   tagged `source: 'peers'`, so the UI can say "peer relative" rather than
   claim a sector percentile that was never measured.
   ========================================================================== */

import { isNum, clamp, mean, type Maybe } from './format';

/* ==========================================================================
   Scale
   ========================================================================== */

export const MAX_SCORE = 5;

export type Letter = 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

/**
 * Score -> letter. Deliberately harsher below the midpoint than a linear
 * ladder would be, which is what makes a 1.6 read as a D rather than a C.
 * Calibrated against the three grades observable on the reference report
 * (1.61 -> D, 3.23 -> B+, 4.98 -> A). Edit freely; it is display only.
 */
export const LETTER_BANDS: readonly [Letter, number][] = [
  ['A', 4.5],
  ['A-', 3.9],
  ['B+', 3.0],
  ['B', 2.6],
  ['B-', 2.25],
  ['C+', 2.0],
  ['C', 1.8],
  ['C-', 1.65],
  ['D', 0.9],
  ['F', -Infinity],
];

export function letterFor(score: Maybe<number>): Letter | null {
  if (!isNum(score)) return null;
  for (const [letter, floor] of LETTER_BANDS) if (score >= floor) return letter;
  return 'F';
}

export type GradeTone = 'strong' | 'good' | 'mid' | 'weak' | 'poor' | 'na';

/** Letter -> a coarse tone bucket, for pill colouring. */
export function toneForLetter(letter: Maybe<string>): GradeTone {
  if (!letter) return 'na';
  if (letter.startsWith('A')) return 'strong';
  if (letter.startsWith('B')) return 'good';
  if (letter.startsWith('C')) return 'mid';
  if (letter.startsWith('D')) return 'weak';
  return 'poor';
}

/**
 * Score -> the word for the position it argues for.
 *
 * Five equal bands across 0..MAX_SCORE, which is exactly how the score
 * distribution strip is labelled. Kept here rather than in a view so the
 * word one surface prints and the band another draws its marker in can never
 * disagree.
 */
export const VERDICT_BANDS = ['Strong sell', 'Sell', 'Hold', 'Buy', 'Strong buy'] as const;

export function verdictWord(score: Maybe<number>): string | null {
  if (!isNum(score)) return null;
  return VERDICT_BANDS[clamp(Math.floor(score), 0, VERDICT_BANDS.length - 1)];
}

export type VerdictTone = 'good' | 'warn' | 'bad' | 'muted';

/* Three tones, not five: the word above already makes the finer distinction,
   and colouring "Sell" and "Strong sell" differently would imply a precision
   the mean of five factor grades does not have. */
export function verdictTone(score: Maybe<number>): VerdictTone {
  if (!isNum(score)) return 'muted';
  if (score >= 3) return 'good';
  if (score >= 2) return 'warn';
  return 'bad';
}

/* ==========================================================================
   Percentiles
   ========================================================================== */

/** Quantile levels the breakpoint arrays in sector-stats.json describe. */
export const QUANTILE_STEP = 0.05;

/**
 * Where `value` sits inside a distribution described by `breaks` — an
 * ascending array of quantiles at 0, 5, 10 … 100 percent.
 *
 * Returns 0..1 in the metric's own direction (bigger value -> bigger result),
 * before any "lower is better" flip. Flat runs in the breakpoints resolve to
 * the middle of the run rather than to either edge.
 */
export function percentileOf(value: Maybe<number>, breaks: Maybe<readonly number[]>): number | null {
  if (!isNum(value) || !Array.isArray(breaks) || breaks.length < 2) return null;

  const n = breaks.length;
  const q = (i: number) => i / (n - 1);

  // Strictly outside the observed range. Equality falls through to the loop,
  // so a value sitting on a flat run at either edge lands mid-run.
  if (value < breaks[0]) return 0;
  if (value > breaks[n - 1]) return 1;

  for (let i = 0; i < n - 1; i++) {
    const lo = breaks[i];
    const hi = breaks[i + 1];
    if (value < lo || value > hi) continue;

    if (hi === lo) {
      // Flat run: walk to its far edge and sit in the middle of it.
      let j = i;
      while (j < n - 1 && breaks[j + 1] === lo) j++;
      return (q(i) + q(j)) / 2;
    }
    return q(i) + ((value - lo) / (hi - lo)) * QUANTILE_STEP;
  }
  return null;
}

/** The median of a breakpoint array — the 50th percentile, dead centre. */
export function medianOf(breaks: Maybe<readonly number[]>): number | null {
  if (!Array.isArray(breaks) || breaks.length < 2) return null;
  const mid = (breaks.length - 1) / 2;
  if (Number.isInteger(mid)) return breaks[mid];
  return (breaks[Math.floor(mid)] + breaks[Math.ceil(mid)]) / 2;
}

/** Build breakpoints from a raw sample — used for the peer-relative fallback. */
export function breaksFromSample(values: readonly unknown[]): number[] | null {
  const xs = values.filter(isNum).sort((a, b) => a - b);
  if (xs.length < 3) return null;
  const steps = Math.round(1 / QUANTILE_STEP);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const pos = (i / steps) * (xs.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
  });
}

/* ==========================================================================
   Ranking label
   ========================================================================== */

export interface Rank {
  side: 'top' | 'bottom';
  pct: number;
  text: string;
}

/**
 * "Top 12%" / "Bottom 39%" from an oriented percentile.
 * At exactly the median both readings are true; we say Top 50%.
 */
export function rankLabel(pctile: Maybe<number>): Rank | null {
  if (!isNum(pctile)) return null;
  const side = pctile >= 0.5 ? 'top' : 'bottom';
  const share = side === 'top' ? 1 - pctile : pctile;
  const p = Math.max(1, Math.round(share * 100));
  return { side, pct: p, text: `${side === 'top' ? 'Top' : 'Bottom'} ${p}%` };
}

export interface Histogram {
  bins: number[];
  max?: number;
  /** Companies the histogram was built from. */
  n?: number;
}

/**
 * Place one score inside a histogram of scores.
 *
 * `hist` is { bins, max } — equal-width buckets across 0..max, as emitted by
 * tools/build_sector_stats.py. Within the company's own bucket the position is
 * interpolated rather than rounded to the bucket edge, so two companies a
 * tenth of a point apart do not report the same rank.
 */
export function histogramRank(score: Maybe<number>, hist: Maybe<Histogram>) {
  const bins = hist?.bins;
  if (!isNum(score) || !Array.isArray(bins) || !bins.length) return null;

  const total = bins.reduce((a, b) => a + (isNum(b) ? b : 0), 0);
  if (total <= 0) return null;

  const max = isNum(hist?.max) ? hist!.max! : MAX_SCORE;
  const binWidth = max / bins.length;
  const idx = Math.round(clamp(Math.floor(score / binWidth), 0, bins.length - 1));

  let below = 0;
  for (let i = 0; i < idx; i++) below += bins[i];
  const within = clamp((score - idx * binWidth) / binWidth, 0, 1);
  below += bins[idx] * within;

  return {
    pctile: clamp(below / total, 0, 1),
    better: Math.round(below),
    total,
    binIndex: idx,
    binWidth,
  };
}

/* ==========================================================================
   Grading one metric
   ========================================================================== */

export type Better = 'high' | 'low';
export type Tick = 'pass' | 'fail' | 'na';

export interface Distribution {
  p: number[];
  n?: number | null;
  /** set on the flat absolute rulers built by `linearDist` */
  synthetic?: boolean;
}

export interface GradedValue {
  value: Maybe<number>;
  better: Better;
  source: string;
  grade: number | null;
  letter: Letter | null;
  pctile: number | null;
  rank: Rank | null;
  median: number | null;
  vsMedian: Tick;
  state: 'ok' | 'na';
  why: string;
  sampleSize?: number | null;
}

export function gradeMetric(
  value: Maybe<number>,
  dist: Maybe<Distribution>,
  { better = 'high', source = 'sector' }: { better?: Better; source?: string } = {},
): GradedValue {
  const base: GradedValue = {
    value, better, source,
    grade: null, letter: null, pctile: null, rank: null,
    median: null, vsMedian: 'na', state: 'na', why: '',
  };

  if (!isNum(value)) return { ...base, why: 'This figure is not available for the company.' };
  if (!dist || !Array.isArray(dist.p) || dist.p.length < 2) {
    return { ...base, why: 'No sector distribution is available for this ratio.' };
  }

  const raw = percentileOf(value, dist.p);
  if (!isNum(raw)) return { ...base, why: 'The figure could not be placed in the sector distribution.' };

  const pctile = better === 'low' ? 1 - raw : raw;
  const median = medianOf(dist.p);
  const grade = clamp(pctile * MAX_SCORE, 0, MAX_SCORE);

  // The visual tick. Purely a side-of-the-median read; never scored.
  let vsMedian: Tick = 'na';
  if (isNum(median)) {
    if (value === median) vsMedian = 'pass';
    else vsMedian = (better === 'low' ? value < median : value > median) ? 'pass' : 'fail';
  }

  return {
    ...base,
    state: 'ok',
    pctile,
    grade,
    letter: letterFor(grade),
    rank: rankLabel(pctile),
    median,
    vsMedian,
    sampleSize: dist.n ?? null,
  };
}

/* ==========================================================================
   Rolling up
   ========================================================================== */

export interface RollUp {
  score: number | null;
  letter: Letter | null;
  graded: number;
  total: number;
  confident: boolean;
}

/**
 * Mean of the graded children, ignoring anything that could not be evaluated.
 * A metric with no data is excluded rather than scored zero: a gated feed
 * should lower confidence, not manufacture a bad score.
 */
export function rollUp(children: readonly ({ grade?: number | null } | null | undefined)[]): RollUp {
  const graded = children.filter((c): c is { grade: number } => isNum(c?.grade));
  const score = graded.length ? mean(graded.map((c) => c.grade)) : null;
  return {
    score,
    letter: letterFor(score),
    graded: graded.length,
    total: children.length,
    confident: graded.length === children.length,
  };
}

/* ==========================================================================
   The sector table
   ========================================================================== */

export interface SectorTable {
  count?: number;
  overall?: Histogram | null;
  metrics?: Record<string, Distribution>;
  [k: string]: unknown;
}

export interface SectorStats {
  source?: string;
  generatedAt?: string;
  sectors?: Record<string, SectorTable>;
  [k: string]: unknown;
}

let statsPromise: Promise<SectorStats | null> | null = null;

/** Fetch public/data/sector-stats.json once per page load. */
export function loadSectorStats(url = '/data/sector-stats.json'): Promise<SectorStats | null> {
  statsPromise ??= fetch(url, { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<SectorStats>) : null))
    .catch(() => null);
  return statsPromise;
}

export interface SectorLookup {
  sector: string | null | undefined;
  available: boolean;
  count: number | null;
  generatedAt: string | null;
  /** 'measured' when built from a real universe, 'seed' when modelled. */
  quality: string | null;
  overall: Histogram | null;
  distFor(metricId: string): { dist: Distribution; source: string } | null;
  medianFor(metricId: string): number | null;
  grade(metricId: string, value: Maybe<number>, better?: Better): GradedValue;
}

/**
 * A lookup bound to one sector, with a peer sample to fall back on.
 *
 * `peerSamples` is { metricId: number[] } gathered from the live peer set.
 * It only gets used where the sector table has nothing, and anything graded
 * from it comes back tagged `source: 'peers'`.
 */
export function sectorLookup(
  stats: Maybe<SectorStats>,
  sector: Maybe<string>,
  peerSamples: Record<string, readonly unknown[]> = {},
): SectorLookup {
  const table = (sector && stats?.sectors?.[sector]) || null;
  const peerBreaks = new Map<string, Distribution | null>();

  const lookup: SectorLookup = {
    sector,
    available: !!table,
    count: table?.count ?? null,
    generatedAt: stats?.generatedAt ?? null,
    quality: stats?.source ?? null,
    overall: (table?.overall as Histogram | undefined) ?? null,

    distFor(metricId) {
      const d = table?.metrics?.[metricId];
      if (d && Array.isArray(d.p)) return { dist: d, source: 'sector' };

      if (!peerBreaks.has(metricId)) {
        const sample = (peerSamples[metricId] || []).filter(isNum);
        const p = breaksFromSample(sample);
        peerBreaks.set(metricId, p ? { p, n: sample.length } : null);
      }
      const pd = peerBreaks.get(metricId);
      return pd ? { dist: pd, source: 'peers' } : null;
    },

    /** The sector's median for one metric — used where a ratio is compared
     *  against the sector directly rather than ranked within it. */
    medianFor(metricId) {
      const found = lookup.distFor(metricId);
      return found ? medianOf(found.dist.p) : null;
    },

    grade(metricId, value, better) {
      const found = lookup.distFor(metricId);
      if (!found) return gradeMetric(value, null, { better });
      return gradeMetric(value, found.dist, { better, source: found.source });
    },
  };
  return lookup;
}
