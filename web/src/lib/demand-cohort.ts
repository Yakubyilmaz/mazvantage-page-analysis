/* ==========================================================================
   Maz Vantage — Demand Discovery: cohorts and the inflection scanner

   A cohort is a group of companies read as one: a layer of a supply chain
   ("memory makers"), or — in the live scanner — every company in one
   industry. Its job is to answer "is this whole part of the economy
   inflecting?" without trusting any one company's quarter.

   ---------------------------------------------------------------------------
   Summing across fiscal calendars
   ---------------------------------------------------------------------------

   Members are summed by calendar quarter (`calendarQuarter` in
   `demand-data.ts`), and a quarter's growth uses only the members reporting
   in both that quarter and the same one a year earlier. A member that has
   not filed yet does not drag the sum down; it is simply absent from that
   quarter, and the count beside every number says how many were in it.

   The newest quarter a cohort is read at is the newest one at least 60% of
   its measured members have reported. Reading the very newest quarter would
   let the one early filer speak for the group.

   ---------------------------------------------------------------------------
   Breadth
   ---------------------------------------------------------------------------

   A cohort whose total accelerates because one giant did is a company
   story, not an industry one. Breadth — the share of members whose own
   growth is accelerating — is printed beside the total and is a third of
   the cohort's demand score, so a broad inflection outscores a narrow one
   of the same size.
   ========================================================================== */

import { isNum, mean } from './format';
import { calendarQuarter, shiftQuarter, type Company } from './demand-data';
import { growthProfile } from './demand-metrics';
import { glutWarning, shortageSignature } from './demand-cycle';
import { band } from './demand-signals';

export type CohortMetric = 'rev' | 'capex';

export interface CohortQuarter {
  key: string;
  growth: number | null;
  /** members in both this quarter and a year earlier */
  members: number;
  total: number | null;
}

export interface CohortReading {
  id: string;
  label: string;
  metric: CohortMetric;
  members: string[];
  /** members with enough quarters to measure */
  measured: string[];
  latestKey: string | null;
  recentGrowth: number | null;
  baseGrowth: number | null;
  acceleration: number | null;
  breadth: number | null;
  /** mean shortage signature of the members (revenue cohorts only) */
  shortage: number | null;
  /** mean glut risk of the members (revenue cohorts only) */
  glutRisk: number | null;
  demandScore: number | null;
  series: CohortQuarter[];
}

/** Each company's metric by calendar quarter; a later fiscal quarter wins a collision. */
function byKey(c: Company, metric: CohortMetric): Map<string, number> {
  const m = new Map<string, number>();
  for (const q of c.quarters) {
    const v = q[metric];
    if (isNum(v)) m.set(calendarQuarter(q.date), v);
  }
  return m;
}

/**
 * Read a cohort. `weights` (by symbol, default 1) scale each member's
 * figures in the sums and its vote in breadth and the mean shortage — the
 * engine passes the share of revenue a member earns from this part of the
 * chain, so a company that only partly belongs counts only partly. A member
 * weighted 0 is listed but not measured.
 */
export function readCohort(
  id: string, label: string, companies: Company[], metric: CohortMetric = 'rev', weights: Record<string, number> = {},
): CohortReading {
  const wOf = (c: Company) => (isNum(weights[c.symbol]) ? weights[c.symbol] : 1);
  const maps = companies.map((c) => ({ c, m: byKey(c, metric), w: wOf(c) }));
  const measured = maps.filter((x) => x.m.size >= 5 && x.w > 0);
  const keys = [...new Set(measured.flatMap((x) => [...x.m.keys()]))].sort();

  const series: CohortQuarter[] = keys.map((key) => {
    const prev = shiftQuarter(key, 4);
    let now = 0;
    let then = 0;
    let n = 0;
    for (const { m, w } of measured) {
      const a = m.get(key);
      const b = m.get(prev);
      if (isNum(a) && isNum(b)) { now += a * w; then += b * w; n += 1; }
    }
    return { key, growth: n && then > 0 ? now / then - 1 : null, members: n, total: n ? now : null };
  });

  const quorum = Math.max(1, Math.ceil(measured.length * 0.6));
  let last = -1;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].members >= quorum && isNum(series[i].growth)) { last = i; break; }
  }
  const g = (back: number) => (last - back >= 0 ? series[last - back].growth : null);
  const r = [g(0), g(1)];
  const b = [g(2), g(3), g(4), g(5)].filter(isNum) as number[];
  const recentGrowth = r.every(isNum) ? (r[0]! + r[1]!) / 2 : null;
  const baseGrowth = b.length >= 3 ? mean(b) : null;
  const acceleration = isNum(recentGrowth) && isNum(baseGrowth) ? recentGrowth - baseGrowth : null;

  const wmean = (xs: { v: number | null; w: number }[]) => {
    const ok = xs.filter((x) => isNum(x.v));
    const tw = ok.reduce((a, x) => a + x.w, 0);
    return ok.length && tw > 0 ? ok.reduce((a, x) => a + x.v! * x.w, 0) / tw : null;
  };
  const accels = measured.map(({ c, w }) => ({ v: growthProfile(c.quarters, metric).acceleration, w }));
  const breadth = wmean(accels.map((a) => ({ v: isNum(a.v) ? (a.v > 0 ? 1 : 0) : null, w: a.w })));

  let shortage: number | null = null;
  let glutRisk: number | null = null;
  if (metric === 'rev') {
    shortage = wmean(measured.map(({ c, w }) => ({ v: shortageSignature(c.quarters).score, w })));
    glutRisk = wmean(measured.map(({ c, w }) => ({ v: glutWarning(c.quarters).risk, w })));
  }

  const parts = [band(recentGrowth, -0.1, 0.4), band(acceleration, -0.15, 0.15), isNum(breadth) ? breadth * 100 : null]
    .filter(isNum) as number[];

  return {
    id, label, metric,
    members: companies.map((c) => c.symbol),
    measured: measured.map(({ c }) => c.symbol),
    latestKey: last >= 0 ? series[last].key : null,
    recentGrowth, baseGrowth, acceleration, breadth, shortage, glutRisk,
    demandScore: parts.length >= 2 ? Math.round(mean(parts)! * 10) / 10 : null,
    series: series.slice(-16),
  };
}

export interface ScanRow {
  cohort: CohortReading;
  /** 0–100: demand score blended with the members' shortage signature */
  inflection: number | null;
  flags: string[];
}

/**
 * Rank cohorts by how hard they are inflecting.
 *
 * This is the spec's "theme emergence detector" run first instead of last:
 * it needs no theme named in advance, so it can surface a part of the
 * economy nobody was watching. The score is 60% the cohort's demand score
 * and 40% its members' mean shortage signature; flags say why in words.
 */
export function scanCohorts(cohorts: CohortReading[]): ScanRow[] {
  return cohorts.map((c) => {
    const parts: [number | null, number][] = [[c.demandScore, 0.6], [c.shortage, 0.4]];
    const have = parts.filter(([v]) => isNum(v)) as [number, number][];
    const w = have.reduce((a, [, k]) => a + k, 0);
    const inflection = have.length ? Math.round((have.reduce((a, [v, k]) => a + v * k, 0) / w) * 10) / 10 : null;
    const flags: string[] = [];
    if (isNum(c.acceleration) && c.acceleration > 0.05) flags.push('Demand acceleration detected');
    if (isNum(c.breadth) && c.breadth >= 0.75 && c.measured.length >= 2) flags.push('Most members accelerating');
    if (isNum(c.shortage) && c.shortage >= 60) flags.push('Shortage signature');
    if (isNum(c.glutRisk) && c.glutRisk >= 55) flags.push('Glut warning');
    if (isNum(c.acceleration) && c.acceleration < -0.1) flags.push('Decelerating');
    return { cohort: c, inflection, flags };
  }).sort((a, b) => (b.inflection ?? -1) - (a.inflection ?? -1));
}
