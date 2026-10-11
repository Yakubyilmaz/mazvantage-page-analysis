/* ==========================================================================
   Maz Vantage — Demand Discovery: shortage signature and glut warning

   Two readings of one company's filed quarters, built to answer the two
   questions the original spec left out:

   1. **Is demand outrunning supply right now?** (the shortage signature)
   2. **Is supply about to outrun demand?** (the glut warning)

   The first is what "catching it early" looks like in a filing: revenue
   growth speeding up, gross margin widening (the seller is being paid more
   per unit), inventory days falling (goods leave as fast as they are made),
   customers prepaying to secure supply, and capital spending rising to meet
   it. None of these is proof alone; together they are hard to fake, because
   management language can be optimistic but a balance sheet cannot ship
   inventory it does not have.

   The second exists because every theme the spec names has a precedent of
   being right about demand and wrong about the stock: lithium demand kept
   growing after 2022 while prices fell by more than 80% (IEA, Global
   Critical Minerals Outlook 2025), because supply answered. The warning
   reads the same filings for the opposite pattern — capex growing faster
   than revenue, inventory building, margins rolling over, growth slowing —
   and it is shown beside every opportunity, never averaged into it.

   ---------------------------------------------------------------------------
   The bands are starting values
   ---------------------------------------------------------------------------

   Each test maps a measurement onto 0–100 between two stated points. They
   are chosen to make a typical industrial company read near the middle and
   a 2024 memory maker read near the top; they are not fitted to any
   outcome, and `DEMAND_BANDS` is the one place to change them.
   ========================================================================== */

import { isNum } from './format';
import { capexProfile, contractLiabilityGrowth, grossMarginShift, growthProfile, inventoryShift } from './demand-metrics';
import { band, meanScore, reading, type Reading } from './demand-signals';
import type { Quarter } from './demand-data';

/** [value that scores 0, value that scores 100] for each test. Fractions, not percents. */
export const DEMAND_BANDS = {
  acceleration: [-0.15, 0.15],
  pricing: [-0.05, 0.05],
  inventory: [0.3, -0.3],
  prepayments: [-0.2, 0.6],
  capacity: [-0.1, 0.5],
  capexOverRevenue: [0, 0.4],
  inventoryBuild: [0, 0.4],
  marginRollover: [0, -0.06],
  deceleration: [0, -0.25],
  intensity: [1.0, 1.8],
} as const;

/**
 * Capex below these shares of revenue is not where the company's capacity
 * lives — a design house, a contract-manufactured product, a joint-venture
 * fab — so a change in it says nothing about supply. Below `capacityFloor`
 * the shortage test "capacity build" is dropped; below `glutFloor` the two
 * capex glut tests are. Both were set after the first run read Vertiv's
 * capex (3.7% of revenue, up 130%) as a glut and Sandisk's (0.9%, its
 * fabs sit in a joint venture) as a missing capacity build, and before the
 * backtest was looked at.
 */
export const CAPEX_FLOORS = { capacityFloor: 0.03, glutFloor: 0.06 };

const pct = (v: number | null | undefined, dp = 0) => (isNum(v) ? `${(v * 100).toFixed(dp)}%` : 'n/a');
const pts = (v: number | null | undefined, dp = 1) => (isNum(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(dp)} pts` : 'n/a');

export interface ShortageSignature {
  score: number | null;
  coverage: number;
  readings: Reading[];
}

export function shortageSignature(qs: Quarter[]): ShortageSignature {
  const g = growthProfile(qs);
  const gm = grossMarginShift(qs);
  const inv = inventoryShift(qs);
  const cl = contractLiabilityGrowth(qs);
  const cx = capexProfile(qs);
  const b = DEMAND_BANDS;
  const readings: Reading[] = [
    reading({
      id: 'acceleration', label: 'Demand acceleration', value: g.acceleration, unit: 'pp',
      score: band(g.acceleration, b.acceleration[0], b.acceleration[1]),
      detail: `Revenue grew ${pct(g.recent)} a year on average over the two newest quarters, against ${pct(g.base)} over the four before: ${pts(g.acceleration)}.`,
    }),
    reading({
      id: 'pricing', label: 'Pricing power', value: gm.shift, unit: 'pp',
      score: band(gm.shift, b.pricing[0], b.pricing[1]),
      detail: `Gross margin of the two newest quarters ${pct(gm.now, 1)} against ${pct(gm.yearAgo, 1)} a year earlier: ${pts(gm.shift)}.`,
    }),
    reading({
      id: 'inventory', label: 'Inventory tightness', value: inv.change, unit: 'pct',
      score: band(inv.change, b.inventory[0], b.inventory[1]),
      detail: isNum(inv.now)
        ? `Inventory covers ${Math.round(inv.now)} days of cost of sales against ${isNum(inv.yearAgo) ? Math.round(inv.yearAgo) : 'n/a'} a year earlier (${pct(inv.change)}). Falling days mean goods leave as fast as they are made.`
        : 'No inventory on the balance sheet, or no cost of sales to measure it against.',
    }),
    reading({
      id: 'prepayments', label: 'Customer prepayments', value: cl.growth, unit: 'pct',
      score: band(cl.growth, b.prepayments[0], b.prepayments[1]),
      detail: isNum(cl.growth)
        ? `Contract liabilities (deferred revenue) $${Math.round(cl.now!).toLocaleString('en-US')}m against $${Math.round(cl.yearAgo!).toLocaleString('en-US')}m a year earlier (${pct(cl.growth)}). Customers paying ahead are securing supply.`
        : 'Contract liabilities absent or below 1% of revenue at one end, so a change in them says nothing.',
    }),
    reading({
      id: 'capacity', label: 'Capacity build', value: cx.growth, unit: 'pct',
      score: isNum(cx.intensity) && cx.intensity >= CAPEX_FLOORS.capacityFloor ? band(cx.growth, b.capacity[0], b.capacity[1]) : null,
      detail: isNum(cx.intensity) && cx.intensity < CAPEX_FLOORS.capacityFloor
        ? `Capital spending is ${pct(cx.intensity, 1)} of revenue — the company's capacity is not on its own balance sheet, so its capex says nothing about supply.`
        : `Trailing-year capital spending ${pct(cx.growth)} on the year before, at ${pct(cx.intensity, 1)} of revenue.`,
    }),
  ];
  return { ...meanScore(readings), readings };
}

export type GlutLevel = 'low' | 'elevated' | 'high' | 'unknown';

export interface GlutWarning {
  /** 0–100, higher is more risk */
  risk: number | null;
  level: GlutLevel;
  coverage: number;
  readings: Reading[];
}

/** A glut reading's status reads from the risk side: high risk is "negative". */
function riskReading(r: Omit<Reading, 'status' | 'type'>): Reading {
  const base = reading(r);
  const inverted = isNum(r.score) ? reading({ ...r, score: 100 - r.score }).status : 'unavailable';
  return { ...base, status: inverted };
}

export function glutWarning(qs: Quarter[]): GlutWarning {
  const g = growthProfile(qs);
  const gm = grossMarginShift(qs);
  const inv = inventoryShift(qs);
  const cx = capexProfile(qs);
  const b = DEMAND_BANDS;
  const cl = contractLiabilityGrowth(qs);
  const heavy = isNum(cx.intensity) && cx.intensity >= CAPEX_FLOORS.glutFloor;
  const light = isNum(cx.intensity)
    ? `Capex is ${pct(cx.intensity, 1)} of revenue, under the ${pct(CAPEX_FLOORS.glutFloor)} at which capacity additions can flood a market.`
    : 'No capital-spending figure to measure.';
  const gap = heavy && isNum(cx.growth) && isNum(g.ttmGrowth) ? cx.growth - g.ttmGrowth : null;
  /* Inventory building in a shortage is often deliberate: stock built
     against orders customers have already paid for, or held while prices
     rise. So the risk is halved when gross margin is widening by more than
     two points, and halved (again) when prepayments grew faster than
     inventory — each discount printed in the reading. */
  const invGrowth = inv.change;
  const discounts: string[] = [];
  let invRisk = band(invGrowth, b.inventoryBuild[0], b.inventoryBuild[1]);
  if (isNum(invRisk) && invRisk > 0) {
    if (isNum(gm.shift) && gm.shift > 0.02) { invRisk /= 2; discounts.push('halved because gross margin is widening'); }
    const invNow = qs.length ? qs[qs.length - 1].inv : null;
    const invThen = qs.length >= 5 ? qs[qs.length - 5].inv : null;
    const invDollar = isNum(invNow) && isNum(invThen) && invThen > 0 ? invNow / invThen - 1 : null;
    if (isNum(cl.growth) && isNum(invDollar) && cl.growth > invDollar) { invRisk /= 2; discounts.push('halved because customer prepayments grew faster than inventory'); }
    invRisk = Math.round(invRisk * 10) / 10;
  }
  const readings: Reading[] = [
    riskReading({
      id: 'capexOverRevenue', label: 'Capex outrunning revenue', value: gap, unit: 'pp',
      score: band(gap, b.capexOverRevenue[0], b.capexOverRevenue[1]),
      detail: heavy
        ? `Trailing capex grew ${pct(cx.growth)} while trailing revenue grew ${pct(g.ttmGrowth)}: a gap of ${pts(gap, 0)}. Capacity growing faster than sales is how gluts are built.`
        : light,
    }),
    riskReading({
      id: 'inventoryBuild', label: 'Inventory building', value: inv.change, unit: 'pct',
      score: invRisk,
      detail: `Inventory days ${pct(inv.change)} on a year earlier${discounts.length ? ` (risk ${discounts.join('; ')})` : ''}.`,
    }),
    riskReading({
      id: 'marginRollover', label: 'Margin rolling over', value: gm.shift, unit: 'pp',
      score: band(gm.shift, b.marginRollover[0], b.marginRollover[1]),
      detail: `Gross margin ${pts(gm.shift)} on a year earlier.`,
    }),
    riskReading({
      id: 'deceleration', label: 'Growth slowing', value: g.acceleration, unit: 'pp',
      score: band(g.acceleration, b.deceleration[0], b.deceleration[1]),
      detail: `Year-on-year growth ${pts(g.acceleration)} against the four quarters before.`,
    }),
    riskReading({
      id: 'intensity', label: 'Capex heavy against its own history', value: cx.intensityVsHistory, unit: 'x',
      score: heavy ? band(cx.intensityVsHistory, b.intensity[0], b.intensity[1]) : null,
      detail: heavy ? `Capex is ${pct(cx.intensity, 1)} of revenue against ${pct(cx.intensityHistory, 1)} on average one to three years earlier.` : light,
    }),
  ];
  const { score, coverage } = meanScore(readings);
  const level: GlutLevel = !isNum(score) || coverage < 0.4 ? 'unknown' : score >= 55 ? 'high' : score >= 35 ? 'elevated' : 'low';
  return { risk: score, level, coverage, readings };
}

/**
 * Supply discipline: a capital-intensive company (capex at least 6% of
 * revenue now, or on average over the past three years) cutting trailing
 * capex by a fifth or more while trailing revenue is not growing.
 *
 * Added in version 1.1, after the 2019–2026 backtest showed the glut tests
 * firing at troughs and the recoveries starting where the industry cut
 * supply (Micron 2023, Albemarle 2024–25). Because it was conceived after
 * looking, it was checked on 1998–2017, which the engine had never been run
 * on, before it was kept: see `DEMAND_DISCOVERY_PILOT_REPORT.md`.
 */
export function supplyDiscipline(qs: Quarter[]): boolean | null {
  const cx = capexProfile(qs);
  const g = growthProfile(qs);
  if (!isNum(cx.intensity) || !isNum(cx.growth) || !isNum(g.ttmGrowth)) return null;
  if (cx.intensity < CAPEX_FLOORS.glutFloor && !(isNum(cx.intensityHistory) && cx.intensityHistory >= CAPEX_FLOORS.glutFloor)) return null;
  return cx.growth <= -0.2 && g.ttmGrowth <= 0;
}

export type Phase = 'early-cycle' | 'inflection' | 'tight' | 'overbuilding' | 'downturn' | 'cooling' | 'quiet' | 'unknown';

/**
 * The phases, in the order `cyclePhase` tests them. The blurbs say what the
 * backtest found, in words, because a label like "Tight" reads as good news
 * and for cyclicals it mostly was not.
 */
export const PHASES: Record<Phase, { label: string; blurb: string }> = {
  'early-cycle': { label: 'Supply cut', blurb: 'A capital-intensive company is cutting capex by a fifth or more while revenue is not growing — the supply response that ends a glut. Held up on 1999–2017 data, but the rule was written after looking at 2019–2026.' },
  downturn: { label: 'Downturn', blurb: 'The glut tests are firing: inventory, margins or growth have turned. By the time filings show it, the price usually has too.' },
  overbuilding: { label: 'Overbuilding', blurb: 'Revenue is still growing but capital spending is growing much faster at a capital-intensive company — the pattern that comes before a glut.' },
  tight: { label: 'Tight', blurb: 'Demand is running ahead of supply on most tests and growth is already fast. For cyclicals this has usually been late: in 1999–2017, buying here lagged the market over two years.' },
  inflection: { label: 'Inflection', blurb: 'Growth is speeding up and the shortage tests lean positive, with no glut warning yet.' },
  cooling: { label: 'Cooling', blurb: 'Growth is slowing and the shortage tests have faded.' },
  quiet: { label: 'No signal', blurb: 'Nothing in the filings argues strongly either way.' },
  unknown: { label: 'Not enough data', blurb: 'Too few comparable quarters to read the cycle.' },
};

/**
 * One word for where a company sits, so a table can be read at a glance and
 * the backtest can bucket by it. The rules run in order; the first match wins.
 */
export function cyclePhase(s: ShortageSignature, gl: GlutWarning, qs: Quarter[]): Phase {
  const g = growthProfile(qs);
  if (!isNum(s.score) || s.coverage < 0.4) return 'unknown';
  if (supplyDiscipline(qs)) return 'early-cycle';
  if (gl.level === 'high') return 'downturn';
  const over = gl.readings.find((r) => r.id === 'capexOverRevenue')?.score;
  if (isNum(over) && over >= 70 && isNum(g.ttmGrowth) && g.ttmGrowth > 0) return 'overbuilding';
  if (s.score >= 60 && isNum(g.recent) && g.recent >= 0.2) return 'tight';
  if (s.score >= 55 && isNum(g.acceleration) && g.acceleration > 0) return 'inflection';
  if (isNum(g.acceleration) && g.acceleration < -0.1 && s.score < 45) return 'cooling';
  return 'quiet';
}
