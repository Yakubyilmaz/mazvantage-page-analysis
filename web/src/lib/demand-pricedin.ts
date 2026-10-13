/* ==========================================================================
   Maz Vantage — Demand Discovery: how much growth the price already assumes

   The spec gave "market expectation gap" 5% of the score. It is the whole
   question: a theme everyone has heard of is usually priced, and a stock can
   fall while its industry grows exactly as forecast. So here it is a gate,
   not a weight. It does not add points to anything; it caps the opportunity
   score when the price already asks for more growth than is plausible.

   ---------------------------------------------------------------------------
   The reverse DCF
   ---------------------------------------------------------------------------

   Solve for the constant annual revenue growth `g` over ten years that makes

       EV = Σ_{t=1..10} R₀(1+g)^t · m / (1+r)^t  +  TV / (1+r)^10
       TV = R₀(1+g)^10 · m · (1+gT) / (r − gT)

   where R₀ is trailing revenue, m a free-cash-flow margin held flat, r = 9%
   and gT = 3%. The answer is "the price asks for g% a year for ten years at
   an m% cash margin". Bisection, because the left side rises monotonically
   in g.

   Which margin? On a cyclical at its peak the trailing margin makes the
   stock look cheap — Albemarle in early 2023 — and the through-cycle median
   makes a company whose margins have genuinely re-rated look expensive.
   Neither is right, so the gate solves on both and reads the midpoint, and
   the page prints all three. The difference between them is the honest
   uncertainty.

   ---------------------------------------------------------------------------
   The levels
   ---------------------------------------------------------------------------

   Ten years of 8% revenue growth is ordinary for a good business; 15% is
   demanding; above 25% very few large companies have ever sustained for a
   decade. Those cut points are judgement, stated once in `PRICED_IN_LEVELS`.
   When the theme has a sourced long-run growth figure (a FORECAST row in the
   evidence register) and the implied growth sits below it, the level is
   eased by one step: the price asks for less than the industry is forecast
   to grow.
   ========================================================================== */

import { isNum } from './format';
import { cashMargins, netCash } from './demand-metrics';
import type { Quarter } from './demand-data';

export const PRICED_IN_ASSUMPTIONS = { discountRate: 0.09, terminalGrowth: 0.03, years: 10 };

export type PricedInLevel = 'modest' | 'demanding' | 'aggressive' | 'extreme' | 'unknown';

/** Upper bound of implied ten-year growth for each level, and what it does to the score. */
export const PRICED_IN_LEVELS: Record<Exclude<PricedInLevel, 'unknown'>, { upTo: number; factor: number; label: string; blurb: string }> = {
  modest: { upTo: 0.08, factor: 1.0, label: 'Not priced in', blurb: 'The price asks for growth an ordinary good business delivers.' },
  demanding: { upTo: 0.15, factor: 0.85, label: 'Partly priced in', blurb: 'The price asks for well-above-average growth for a decade.' },
  aggressive: { upTo: 0.25, factor: 0.6, label: 'Priced in', blurb: 'The price already assumes most of the opportunity is captured.' },
  extreme: { upTo: Infinity, factor: 0.4, label: 'Beyond the evidence', blurb: 'The price asks for growth very few large companies have sustained for ten years.' },
};

const ORDER: Exclude<PricedInLevel, 'unknown'>[] = ['modest', 'demanding', 'aggressive', 'extreme'];

/** Present value of the stream, per unit of trailing revenue. */
function valuePerRevenue(g: number, m: number, a = PRICED_IN_ASSUMPTIONS): number {
  const { discountRate: r, terminalGrowth: gT, years: n } = a;
  let pv = 0;
  for (let t = 1; t <= n; t++) pv += ((1 + g) ** t * m) / (1 + r) ** t;
  const tv = ((1 + g) ** n * m * (1 + gT)) / (r - gT);
  return pv + tv / (1 + r) ** n;
}

/** The ten-year revenue growth that makes the cash flows worth `ev`. Null when the margin is not positive. */
export function impliedGrowth(ev: number, revenue: number, margin: number, a = PRICED_IN_ASSUMPTIONS): number | null {
  if (!isNum(ev) || !isNum(revenue) || !isNum(margin) || revenue <= 0 || margin <= 0 || ev <= 0) return null;
  const target = ev / revenue;
  let lo = -0.5;
  let hi = 2.0;
  if (valuePerRevenue(lo, margin, a) > target) return lo;
  if (valuePerRevenue(hi, margin, a) < target) return hi;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (valuePerRevenue(mid, margin, a) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function levelOf(g: number): Exclude<PricedInLevel, 'unknown'> {
  return ORDER.find((k) => g <= PRICED_IN_LEVELS[k].upTo)!;
}

/** The level an implied growth falls in; shared with the Valuation tab's reading (`implied-growth.ts`). */
export const pricedInLevel = levelOf;

export interface PricedIn {
  level: PricedInLevel;
  factor: number;
  /** midpoint of the two implied growths — what the gate reads */
  implied: number | null;
  impliedAtTrailing: number | null;
  impliedThroughCycle: number | null;
  marginTrailing: number | null;
  marginThroughCycle: number | null;
  enterpriseValue: number | null;
  revenue: number | null;
  /** the sourced long-run growth the level was compared with, if any */
  reference: number | null;
  eased: boolean;
  detail: string;
}

/**
 * Read the gate for one company at one price.
 *
 * `price` is per share, `shares` in millions (the newest diluted count), so
 * market value is in USD millions like everything else. Enterprise value
 * adds debt and subtracts cash from the newest balance sheet.
 */
export function pricedIn(qs: Quarter[], price: number | null, shares: number | null, reference: number | null = null): PricedIn {
  const cm = cashMargins(qs);
  const nc = netCash(qs);
  const ev = isNum(price) && isNum(shares) && isNum(nc.netCash) ? price * shares - nc.netCash : null;
  const rev = cm.revenueTtm;
  const atT = isNum(ev) && isNum(rev) && isNum(cm.fcfTtm) ? impliedGrowth(ev, rev, cm.fcfTtm) : null;
  const atC = isNum(ev) && isNum(rev) && isNum(cm.throughCycle) ? impliedGrowth(ev, rev, cm.throughCycle) : null;
  const both = [atT, atC].filter(isNum) as number[];
  const implied = both.length ? both.reduce((a, b) => a + b, 0) / both.length : null;
  /* A business that has not produced free cash through the cycle cannot
     justify any price on through-cycle cash, so the gate does not fall back
     to the trailing margin alone — that is the value trap at a cyclical
     peak. It reads at least "priced in". */
  const noCycleCash = isNum(cm.throughCycle) && cm.throughCycle <= 0 && isNum(atT);

  if (!isNum(implied)) {
    return {
      level: 'unknown', factor: 1, implied: null, impliedAtTrailing: atT, impliedThroughCycle: atC,
      marginTrailing: cm.fcfTtm, marginThroughCycle: cm.throughCycle, enterpriseValue: ev, revenue: rev,
      reference, eased: false,
      detail: 'No positive free-cash-flow margin to capitalise, or no price — the gate is open and the confidence lower.',
    };
  }
  let level = levelOf(implied);
  if (noCycleCash && ORDER.indexOf(level) < ORDER.indexOf('aggressive')) level = 'aggressive';
  let eased = false;
  if (isNum(reference) && implied < reference && level !== 'modest' && !noCycleCash) {
    level = ORDER[ORDER.indexOf(level) - 1];
    eased = true;
  }
  const p = (v: number | null) => (isNum(v) ? `${(v * 100).toFixed(1)}%` : 'n/a');
  return {
    level, factor: PRICED_IN_LEVELS[level].factor, implied,
    impliedAtTrailing: atT, impliedThroughCycle: atC,
    marginTrailing: cm.fcfTtm, marginThroughCycle: cm.throughCycle,
    enterpriseValue: ev, revenue: rev, reference, eased,
    detail: `At an enterprise value of $${Math.round(ev!).toLocaleString('en-US')}m the price asks for about ${p(implied)} revenue growth a year for ten years `
      + `(${p(atT)} at the trailing ${p(cm.fcfTtm)} cash margin, ${p(atC)} at the through-cycle ${p(cm.throughCycle)}), `
      + `discounted at ${PRICED_IN_ASSUMPTIONS.discountRate * 100}% with ${PRICED_IN_ASSUMPTIONS.terminalGrowth * 100}% terminal growth.`
      + (noCycleCash ? ' The business has not generated free cash through the cycle, so the price rests on the current margin lasting; read as at least priced in.' : '')
      + (eased ? ` Eased one level: the sourced long-run growth for this part of the chain is ${p(reference)}.` : ''),
  };
}
