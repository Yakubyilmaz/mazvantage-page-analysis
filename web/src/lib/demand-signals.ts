/* ==========================================================================
   Maz Vantage — Demand Discovery: readings, evidence and how sure we are

   Two kinds of input feed the engine, and they are kept apart on purpose:

   - **Readings** are calculated here from filed figures — a growth rate, a
     change in inventory days. They are as fresh as the last filing and as
     honest as the arithmetic, and every one carries the sentence that says
     how it was computed.
   - **Evidence** is what someone else published — an IEA projection, a WSTS
     forecast, an IFR installation count — read by a person from the
     original page and entered in `public/data/demand-evidence.json` with its
     source, date and type. Nothing in the register is fetched or scraped,
     and nothing is reproduced beyond the figure and a one-line claim.

   ---------------------------------------------------------------------------
   Fact, forecast and inference stay labelled
   ---------------------------------------------------------------------------

   Every number carries one of five types and the page prints it. A 2025
   installation count is ACTUAL; a 2029 one is FORECAST; "about 85% of Vertiv's
   sales are to data centres" from a company fact sheet rounded by a third
   party is ESTIMATE; "Teradyne's robotics exposure is minor" from its segment
   note is INFERRED. AI_DERIVED is reserved for text a language model writes,
   which this build does not produce: every sentence on the page is assembled
   from a reading or an evidence row.

   ---------------------------------------------------------------------------
   Independence
   ---------------------------------------------------------------------------

   A newspaper repeating the IEA is not a second source. Evidence rows carry
   `origin`, the source the figure first came from, and confidence counts
   distinct origins rather than rows.
   ========================================================================== */

import { isNum } from './format';
import { daysBetween } from './demand-data';

export type DataType = 'ACTUAL' | 'ESTIMATE' | 'FORECAST' | 'INFERRED' | 'AI_DERIVED';

export const DATA_TYPES: Record<DataType, { label: string; blurb: string }> = {
  ACTUAL: { label: 'Actual', blurb: 'Measured and published, or calculated from filed figures.' },
  ESTIMATE: { label: 'Estimate', blurb: 'A published approximation, or a rounded figure from a secondary summary of the original.' },
  FORECAST: { label: 'Forecast', blurb: 'A projection about a period that has not happened yet.' },
  INFERRED: { label: 'Inferred', blurb: 'Reasoned from stated products, segments or end markets; not stated as a number by the company.' },
  AI_DERIVED: { label: 'Model-written', blurb: 'Written by a language model. Not used in this build.' },
};

export type SourceKind = 'official' | 'company-filing' | 'industry-body' | 'research-firm' | 'financial-media' | 'other';

/**
 * Starting quality by kind of source — the spec's values, configurable
 * here and nowhere else. They rank how much a figure is worth before
 * anything is known about it; recency and independence come after.
 */
export const SOURCE_QUALITY: Record<SourceKind, number> = {
  official: 100,
  'company-filing': 95,
  'industry-body': 90,
  'research-firm': 85,
  'financial-media': 65,
  other: 30,
};

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  /** publisher */
  publisher: string;
  /** reuse terms as understood, e.g. "public press release" */
  access: string;
}

export interface Evidence {
  id: string;
  theme: string;
  /** chain layer id, when the figure is about one part of the chain */
  layer?: string;
  /** one line, in our words */
  claim: string;
  metric: string;
  value: number;
  unit: string;
  /** the period the figure describes, e.g. "2025" or "2026-2029" */
  period: string;
  type: DataType;
  sourceId: string;
  /** the source the figure first came from, when that is not `sourceId` */
  origin?: string;
  /** when it became public — the backtest never reads a row before this */
  published: string;
  accessed: string;
  url: string;
  /** what would make this row wrong, or how it was read */
  note?: string;
  /** +1 the figure argues demand is rising or supply tight; −1 the opposite; 0 context */
  direction: 1 | 0 | -1;
}

export interface EvidenceRegister {
  asOf: string;
  sources: Source[];
  evidence: Evidence[];
}

export type Status = 'positive' | 'neutral' | 'negative' | 'unavailable';

/** One measured test, scored 0–100 where 100 argues for the thesis being tested. */
export interface Reading {
  id: string;
  label: string;
  value: number | null;
  /** how the value prints: pct = fraction shown as %, pp = fraction shown as points */
  unit: 'pct' | 'pp' | 'ratio' | 'days' | 'x';
  score: number | null;
  status: Status;
  /** how it was calculated, with the inputs */
  detail: string;
  type: DataType;
}

/**
 * Map `value` linearly so `lo` scores 0 and `hi` scores 100, clamped.
 * Pass `lo > hi` for a measurement where less is better.
 */
export function band(value: number | null | undefined, lo: number, hi: number): number | null {
  if (!isNum(value) || lo === hi) return null;
  const t = (value - lo) / (hi - lo);
  return Math.round(Math.max(0, Math.min(1, t)) * 1000) / 10;
}

export function statusOf(score: number | null | undefined): Status {
  if (!isNum(score)) return 'unavailable';
  if (score >= 58) return 'positive';
  if (score <= 42) return 'negative';
  return 'neutral';
}

export function reading(r: Omit<Reading, 'status' | 'type'> & { type?: DataType }): Reading {
  return { ...r, status: statusOf(r.score), type: r.type ?? 'ACTUAL' };
}

/** Mean of the scores that exist; null when none do. Missing is dropped, never zero. */
export function meanScore(readings: Reading[]): { score: number | null; coverage: number } {
  const s = readings.map((r) => r.score).filter(isNum) as number[];
  return {
    score: s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null,
    coverage: readings.length ? s.length / readings.length : 0,
  };
}

export type Confidence = 'high' | 'medium' | 'low' | 'none';

export const CONFIDENCE_ORDER: Confidence[] = ['none', 'low', 'medium', 'high'];

/**
 * How sure the register lets us be about one theme or layer.
 *
 * High needs two independent sources of quality 85 or better and the newest
 * of them inside eighteen months. One analyst forecast, however reputable,
 * never makes a theme high-confidence — the spec's rule, enforced here.
 * Rows published after `asOf` do not exist yet and are not counted.
 */
export function evidenceConfidence(rows: Evidence[], sources: Source[], asOf: string) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const visible = rows.filter((e) => e.published <= asOf);
  const origins = new Map<string, number>();
  for (const e of visible) {
    const id = e.origin || e.sourceId;
    const q = SOURCE_QUALITY[byId.get(id)?.kind ?? byId.get(e.sourceId)?.kind ?? 'other'];
    origins.set(id, Math.max(origins.get(id) ?? 0, q));
  }
  const strong = [...origins.values()].filter((q) => q >= 85).length;
  const newest = visible.reduce((d, e) => (e.published > d ? e.published : d), '');
  const ageDays = newest ? daysBetween(newest, asOf) : null;
  let level: Confidence = 'none';
  if (visible.length) level = 'low';
  if (strong >= 1 || origins.size >= 2) level = 'medium';
  if (strong >= 2 && ageDays !== null && ageDays <= 540) level = 'high';
  return { level, independent: origins.size, strong, rows: visible.length, newest: newest || null, ageDays };
}

/** The lower of two confidence levels. */
export function minConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(a), CONFIDENCE_ORDER.indexOf(b))];
}
