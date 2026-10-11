/* ==========================================================================
   Maz Vantage — Demand Discovery: the opportunity score and its confidence

   The spec proposed a weighted sum: 30% demand growth, 15% acceleration,
   15% supply constraint, 15% exposure, 10% quality, 10% valuation, 5%
   expectation gap. A weighted sum lets strength in one place buy back a
   fail in another — under it a crowded, fully priced theme at its peak
   still scores in the high seventies. An opportunity is an AND: demand
   rising, supply tight, real exposure, a sound business, and not already in
   the price. So:

   1. **Four components, combined geometrically.** Demand, supply tightness,
      exposure and financial quality are each 0–100; the score is their
      weighted geometric mean (each floored at 5 so one zero does not erase
      the rest). A 20 in any one of them drags the whole score down in a way
      an average would not.
   2. **Two gates, multiplied in after.** The priced-in gate
      (`demand-pricedin.ts`) and the glut warning (`demand-cycle.ts`) each
      scale the score by a factor at most 1. They are shown beside the
      score, so a reader can see a high base score being cut by a high
      price rather than wondering why it is low.
   3. **A missing component is dropped and the weights renormalised**, the
      house rule for every score in this app. Coverage is reported.

   Nothing here has been fitted to returns. `OPPORTUNITY_WEIGHTS` and the
   gate factors are starting values; `DEMAND_CALC_VERSION` is printed with
   every score so numbers computed under different settings are never
   compared silently. The pilot backtest says how they did — see
   `DEMAND_DISCOVERY_PILOT_REPORT.md` at the repository root.
   ========================================================================== */

import { isNum } from './format';
import { cashMargins, netCash } from './demand-metrics';
import { band, CONFIDENCE_ORDER, meanScore, minConfidence, reading, type Confidence, type DataType, type Reading } from './demand-signals';
import type { GlutLevel } from './demand-cycle';
import type { PricedIn } from './demand-pricedin';
import type { Quarter } from './demand-data';

/**
 * 1.0.0 — first run. 1.1.0 — capex floors, inventory discounts, the
 * no-cycle-cash rule in the priced-in gate, exposure-weighted cohorts (all
 * before the backtest was read), and the supply-discipline phase (after it,
 * kept because it held on 1998–2017). Weights and gate factors unchanged.
 */
export const DEMAND_CALC_VERSION = '1.1.0';

export const OPPORTUNITY_WEIGHTS = { demand: 0.35, supply: 0.25, exposure: 0.2, quality: 0.2 };

export const GLUT_FACTOR: Record<GlutLevel, number> = { low: 1, elevated: 0.85, high: 0.6, unknown: 0.9 };

/**
 * A financial-quality proxy from the filed figures the engine already has:
 * trailing operating margin, through-cycle cash margin, and net cash. The
 * live page can pass the app's quant rating instead; the pilot cannot,
 * because the rating needs feeds the capture does not hold.
 */
export function financialQuality(qs: Quarter[]): { score: number | null; coverage: number; readings: Reading[] } {
  const cm = cashMargins(qs);
  const nc = netCash(qs);
  const pct = (v: number | null) => (isNum(v) ? `${(v * 100).toFixed(1)}%` : 'n/a');
  const readings = [
    reading({ id: 'operatingMargin', label: 'Operating margin', value: cm.operatingTtm, unit: 'pct', score: band(cm.operatingTtm, 0, 0.3),
      detail: `Trailing-twelve-month operating margin ${pct(cm.operatingTtm)}.` }),
    reading({ id: 'cashMargin', label: 'Cash margin through the cycle', value: cm.throughCycle, unit: 'pct', score: band(cm.throughCycle, -0.05, 0.2),
      detail: `Median trailing free-cash-flow margin over ${cm.windows} quarters: ${pct(cm.throughCycle)}.` }),
    reading({ id: 'netCash', label: 'Balance sheet', value: nc.toRevenue, unit: 'pct', score: band(nc.toRevenue, -1, 0.3),
      detail: isNum(nc.netCash) ? `Net ${nc.netCash >= 0 ? 'cash' : 'debt'} of $${Math.abs(Math.round(nc.netCash)).toLocaleString('en-US')}m, ${pct(nc.toRevenue)} of trailing revenue.` : 'No cash or debt figure.' }),
  ];
  return { ...meanScore(readings), readings };
}

export interface OpportunityInputs {
  demand: number | null;
  supply: number | null;
  exposure: number | null;
  quality: number | null;
  pricedIn: PricedIn;
  glut: GlutLevel;
}

export interface Opportunity {
  /** before the gates */
  base: number | null;
  score: number | null;
  coverage: number;
  factors: { pricedIn: number; glut: number };
  components: Record<keyof typeof OPPORTUNITY_WEIGHTS, number | null>;
}

export function opportunityScore(i: OpportunityInputs, w = OPPORTUNITY_WEIGHTS): Opportunity {
  const components = { demand: i.demand, supply: i.supply, exposure: i.exposure, quality: i.quality };
  const have = (Object.keys(w) as (keyof typeof w)[]).filter((k) => isNum(components[k]));
  const total = have.reduce((a, k) => a + w[k], 0);
  const base = have.length >= 2 && total > 0
    ? Math.exp(have.reduce((a, k) => a + w[k] * Math.log(Math.max(5, components[k]!)), 0) / total)
    : null;
  const factors = { pricedIn: i.pricedIn.factor, glut: GLUT_FACTOR[i.glut] };
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    base: isNum(base) ? round(base) : null,
    score: isNum(base) ? round(base * factors.pricedIn * factors.glut) : null,
    coverage: have.length / Object.keys(w).length,
    factors,
    components,
  };
}

export interface ConfidenceInputs {
  coverage: number;
  shortageCoverage: number;
  evidence: Confidence;
  daysSinceFiling: number | null;
  exposureBasis: DataType;
  pricedInKnown: boolean;
}

/**
 * How sure the engine is about one company's score, with the reasons it is
 * not surer. Starts at high and every rule can only lower it, so no
 * combination of inputs routes around a weak one.
 */
export function opportunityConfidence(c: ConfidenceInputs): { level: Confidence; reasons: string[] } {
  let level: Confidence = 'high';
  const reasons: string[] = [];
  const cap = (to: Confidence, why: string) => {
    if (CONFIDENCE_ORDER.indexOf(to) < CONFIDENCE_ORDER.indexOf(level)) level = to;
    reasons.push(why);
  };
  if (c.evidence === 'none') cap('low', 'No published evidence in the register for this part of the chain.');
  else if (c.evidence !== 'high') cap(c.evidence, `Published evidence for this part of the chain is ${c.evidence}-confidence (fewer than two strong independent sources, or none recent).`);
  if (c.coverage < 0.75) cap('low', 'Fewer than three of the four score components could be measured.');
  else if (c.coverage < 1) cap('medium', 'One score component could not be measured.');
  if (c.shortageCoverage < 0.6) cap('medium', 'Fewer than three of the five shortage tests had data.');
  if (isNum(c.daysSinceFiling) && c.daysSinceFiling > 150) cap('medium', `The newest filing is ${c.daysSinceFiling} days old.`);
  if (c.exposureBasis === 'INFERRED') cap('medium', 'Exposure is inferred from stated products, not disclosed as a share of revenue.');
  if (!c.pricedInKnown) cap('medium', 'The priced-in gate could not be read (no positive cash margin or no price).');
  return { level: minConfidence(level, 'high'), reasons };
}

export const CONFIDENCE_SCORE: Record<Confidence, number> = { high: 85, medium: 60, low: 35, none: 10 };
