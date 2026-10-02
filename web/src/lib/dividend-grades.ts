/* ==========================================================================
   Maz Vantage — the dividend composites, shaped for the report's grade design

   The four composites from `dividend-score.ts`, adapted into the metric
   objects `GradeTable`, `SubtopicSummary` and `LeadColumn` already read, so a
   reader who has learned one ratio table has learned this one.

   What still differs, and has to:

   - The **universe is payers only**, ranked against payers. A non-payer is
     outside it rather than last in it.
   - The **scale runs 1 to 5**, not 0 to 5, so the grade bar never empties.
   - A composite is a **weighted** average of its lines, and a line that could
     not be computed is dropped with its weight renormalised across the rest.
   - There is **no overall dividend grade**, and the page says why.
   - **No spoke on the flake.** The snowflake has five axes because the quant
     composite has five factors; the dividend module is not a sixth.
   ========================================================================== */

import { dec, isNum, trim } from '@/lib/format';
import type { GradedMetric } from '@/lib/factors';
import type { Letter, Rank } from '@/lib/grading';
import { DIV_GROUP_NOTES, DIV_LINE_BY_ID } from '@/lib/dividend-lines';
import { loadDividendStats, scoreDividends } from '@/lib/dividend-score';
import { loadDividendFeeds } from '@/lib/dividend-model';

/* ---------- the shapes `scoreDividends` returns ------------------------------ */

export interface DivLine {
  id: string;
  label: string;
  group?: string;
  desc?: string;
  note?: string;
  why?: string;
  better: 'high' | 'low';
  weight: number;
  value: number | null;
  text?: string;
  median: number | null;
  sampleSize?: number | null;
  source?: string;
  state: 'ok' | 'nm' | 'missing' | string;
  score: number | null;
  letter: Letter | null;
  pctile: number | null;
  rank: Rank | null;
  workaround?: 'A' | 'B' | null;
  approximate?: boolean;
}

export interface DivFactor {
  key: string;
  title: string;
  anchor: string;
  question: string;
  blurb: string;
  lines: DivLine[];
  score: number | null;
  letter: Letter | null;
  rank: Rank | null;
  reranked: boolean;
  coverage: number | null;
  gradedLines: number;
  totalLines: number;
}

export interface DivResult {
  pays: boolean;
  lapsed: boolean;
  why?: string;
  inputs: { sector?: string | null; lastPaymentAt?: string | number | null; [k: string]: any };
  factors: Record<string, DivFactor>;
  order: string[];
  table: { available?: boolean; quality?: string; generatedAt?: string; count?: number; sector?: string | null };
}

/** A dividend line in the graded-metric shape, with the chip beside its name. */
export type DivMetric = GradedMetric & { tag: { text: string; title: string } | null };

/* ---------- loading --------------------------------------------------------- */

/*
  One load per analysis, shared by both surfaces. The payer table is a single
  fetch per page load; the two quarterly statements behind it are two requests
  that only a reader who reached one of these surfaces pays for.
*/
const LOADS = new WeakMap<object, Promise<DivResult>>();

export function loadDividendScores(a: any): Promise<DivResult> {
  let p = LOADS.get(a);
  if (!p) {
    p = Promise.all([loadDividendStats(), loadDividendFeeds(a.facts?.symbol || a.ds?.symbol, a.ds)])
      .then(([stats, feeds]) => scoreDividends(a, stats, { feeds }) as unknown as DivResult);
    LOADS.set(a, p);
  }
  return p;
}

/* ---------- a dividend line, as a graded metric ------------------------------ */

/*
  Two of the sixty-four lines stand in for feeds that do not exist, and a few
  more are computed on a narrower definition than the specification asks for.
  A caveat that belongs to the figure belongs beside the figure's name.
*/
function tagFor(l: DivLine) {
  if (l.workaround === 'A') {
    return {
      text: 'Indicated rate',
      title: 'Uses the indicated forward rate: the latest declared payment annualised at its own '
        + 'cadence. Not an analyst forecast — no dividend-estimate feed exists in this data source.',
    };
  }
  if (l.workaround === 'B') {
    return {
      text: 'Modelled forward',
      title: 'Uses a modelled forward cash flow: the consensus earnings estimate scaled by the '
        + 'company’s own three-year cash conversion.',
    };
  }
  if (l.approximate) return { text: 'Approximate', title: l.note || 'An approximation — see the note under the row.' };
  return null;
}

const weightClause = (l: DivLine, f: DivFactor) =>
  l.weight > 0 ? ` Carries ${trim(l.weight, 1)}% of the ${f.title.toLowerCase()} weighting.` : '';

/** The sentence under the row — how the graded factors phrase theirs. */
function explainFor(l: DivLine, f: DivFactor, r: DivResult, fmt: (v: number) => string) {
  if (l.state !== 'ok') return l.why || 'Not available for this company.';
  const where = l.source === 'peers' ? 'the payers in its peer group' : `${r.inputs.sector || 'sector'} payers`;
  let out = l.desc || '';
  if (l.rank && isNum(l.median)) out += ` At ${l.text} that is ${l.rank.text} of ${where}, where the median sits at ${fmt(l.median)}.`;
  else if (isNum(l.median)) out += ` The median across ${where} is ${fmt(l.median)}.`;
  out += weightClause(l, f);
  if (l.note) out += ` ${l.note}`;
  return out.trim();
}

function divMetric(l: DivLine, f: DivFactor, r: DivResult): DivMetric {
  const fmt: (v: number) => string = (DIV_LINE_BY_ID as any)[l.id]?.fmt || ((v: number) => dec(v, 2));

  /* The tick beside the name: which side of the payer median the figure falls
     on, already accounting for lines where low is the good direction. A
     reading aid, never summed. */
  let vsMedian: 'pass' | 'fail' | 'na' = 'na';
  if (isNum(l.value) && isNum(l.median)) {
    vsMedian = l.value === l.median ? 'pass' : ((l.better === 'low' ? l.value < l.median : l.value > l.median) ? 'pass' : 'fail');
  }

  return {
    id: l.id,
    label: l.label,
    fmt,
    better: l.better,
    value: l.value,
    median: l.median,
    sampleSize: l.sampleSize ?? null,
    // Only `ok` rows are read for the column headings, so a line with no
    // distribution never votes on the wording.
    source: l.source || 'sector',
    state: l.state === 'ok' ? 'ok' : 'na',
    grade: l.score,
    letter: l.letter,
    pctile: l.pctile,
    rank: l.rank,
    vsMedian,
    tickTitle: vsMedian === 'na'
      ? 'No payer median is available for this line'
      : `${vsMedian === 'pass' ? 'Better' : 'Worse'} than the median across ${r.inputs.sector || 'sector'} payers`,
    why: l.why || '',
    tag: tagFor(l),
    explanation: explainFor(l, f, r, fmt),
  } as DivMetric;
}

/**
 * One factor's lines, as subtopics, in first-appearance order — the
 * consistency factor interleaves its three groups, and re-sorting them would
 * put the lines in an order the specification does not use.
 */
export function divGroups(f: DivFactor, r: DivResult) {
  const seen = new Map<string, DivMetric[]>();
  for (const line of f.lines) {
    const name = line.group || 'Other';
    if (!seen.has(name)) seen.set(name, []);
    seen.get(name)!.push(divMetric(line, f, r));
  }
  return [...seen.entries()].map(([name, metrics]) => ({
    name,
    desc: ((DIV_GROUP_NOTES as Record<string, string>)[`${f.key}|${name}`] || null) as string | null,
    metrics,
  }));
}

/** Every line of one composite, flat — so the ends can sit beside each other. */
export const divLines = (f: DivFactor, r: DivResult) => f.lines.map((line) => divMetric(line, f, r));

/** The tick, counted. A display marker only; never summed into a grade. */
export function divCheckCounts(metrics: DivMetric[]) {
  const out = { pass: 0, fail: 0, na: 0 };
  for (const m of metrics) out[m.vsMedian === 'pass' ? 'pass' : m.vsMedian === 'fail' ? 'fail' : 'na']++;
  return out;
}

/**
 * The lines carrying the grade and the lines holding it back — split at the
 * composite's own score rather than into halves, so both headings are true by
 * construction.
 */
export function divLeaders(metrics: DivMetric[], score: number | null) {
  const s = isNum(score) ? score : 0;
  const ranked = metrics.filter((m) => isNum(m.grade) && isNum(m.pctile)).sort((x, y) => y.grade! - x.grade!);
  return {
    above: ranked.filter((m) => m.grade! >= s).slice(0, 5),
    below: ranked.filter((m) => m.grade! < s).sort((x, y) => x.grade! - y.grade!).slice(0, 5),
  };
}

/** The line under a composite's score: what was weighted, and against what. */
export function basisLine(f: DivFactor, r: DivResult) {
  const share = isNum(f.coverage) ? Math.round(f.coverage * 100) : null;
  let out = `Weighted across ${f.gradedLines} of ${f.totalLines} lines`;
  out += isNum(share) ? ` — ${share}% of the factor’s designed weight` : '';
  out += f.gradedLines < f.totalLines
    ? '. The rest was dropped and its weight shared across the lines that did compute; nothing is filled in with a zero or a median.'
    : '.';
  if (f.rank) {
    out += ` ${f.rank.text} of ${r.inputs.sector || 'sector'} payers`;
    out += f.reranked
      ? ', ranked against the sector’s own spread of composites.'
      : '. No spread of sector composites was available, so the weighted average is shown as it stands.';
  }
  return out;
}

/** Every disclosure the module owes, as sentences. `**bold**` is the only markup. */
export function disclosureParas(r: DivResult) {
  const t = r.table;
  return [
    `Ranked against ${t.count ? `${t.count.toLocaleString('en-US')} ` : ''}dividend payers in `
      + `${t.sector || 'the sector'}. **Payers only**: a company that pays nothing is outside this `
      + 'universe rather than at the bottom of it, because a non-payer ranked against payers would come '
      + 'last on every line and read as a bad dividend rather than as no dividend.',
    'Each grade is the **weighted** average of its lines — the specification’s weights, printed under '
      + 'every row — re-ranked against the sector’s own spread of composites. A weighted average of '
      + 'percentiles bunches around the middle, and the re-rank is what puts the 1 to 5 scale back.',
    'Two figures are substitutes for feeds that do not exist. The **forward dividend** is the latest '
      + 'declared payment annualised at its own cadence — an indicated rate, not an analyst forecast. '
      + '**Forward cash flow** is the consensus earnings estimate scaled by the company’s own three-year '
      + 'cash conversion. Every line that uses either carries a chip beside its name.',
    'A payout ratio above 100% is kept exactly as it computes and ranks badly. It is never capped and '
      + 'never reported as not-meaningful, because a company paying out more than it earns is the single '
      + 'most useful thing this module can tell you.',
    'These grades are **entirely separate from the quant rating** on the Ratings tab: a different '
      + 'universe, a different scale and a different distribution table. Nothing here feeds the five '
      + 'factor grades and nothing there feeds these, which is why the dividend has no spoke on the flake.',
  ];
}
