/* ==========================================================================
   Maz Vantage — the bull and bear case

   Morningstar's report carries a bull case and a bear case: a fair value
   under optimistic and pessimistic assumptions, with the assumptions named.
   Theirs come from an analyst's judgement; this page has no analyst, so the
   cases are built from the one spread of outcomes the data does publish —
   the range of the sell side's own revenue estimates.

     bear   every forecast year at the **lowest** published revenue estimate
     base   every forecast year at the consensus (the report's own DCF input)
     bull   every forecast year at the **highest** published estimate

   Each case then goes through the report's six discounted cash flow models
   unchanged — same discount rate, same terminal assumptions, same capex and
   depreciation intensity — and the case's value is the median of the six,
   the same rule the headline fair value uses across its thirteen.

   Three things this is not, and the card says each:
   - **Not anyone's forecast.** The low for one year and the low for the next
     can come from different analysts, so the bear path is more pessimistic
     than any single analyst's, and the bull more optimistic.
   - **Not a margin view.** Operating profit is scaled with revenue, so each
     year's consensus margin is held. Estimates publish no margin range; a
     case that flexed margins would be inventing one.
   - **Not graded.** Like every fair value in the report, it never reaches a
     factor score.
   ========================================================================== */

import { cagr, isNum, median } from './format';
import { MODELS } from './valuation-models';

export type CaseKey = 'bear' | 'base' | 'bull';

export interface CaseResult {
  key: CaseKey;
  /** median of the DCF values that priced, per share */
  value: number | null;
  /** value over the current price, less one */
  upside: number | null;
  perModel: { id: string; label: string; value: number | null }[];
  /** revenue in the first forecast year and the last published one */
  revenueFrom: number | null;
  revenueTo: number | null;
  fromYear: number | null;
  toYear: number | null;
  /** annual growth along the case's revenue path */
  growth: number | null;
  /** EPS at this end of the range, for `epsYear` */
  eps: number | null;
  epsYear: number | null;
}

export interface Scenarios {
  available: boolean;
  /** why there is no case, when there is none */
  why: string | null;
  cases: Record<CaseKey, CaseResult> | null;
  analysts: number | null;
  /** the Street's own targets, a separate read on the same question */
  targets: { low: number | null; consensus: number | null; high: number | null };
}

const DCFS = MODELS.filter((m: any) => m.dcf);
const FIELD: Record<CaseKey, string | null> = { bear: 'revenueLow', base: null, bull: 'revenueHigh' };
const EPS_FIELD: Record<CaseKey, string> = { bear: 'epsLow', base: 'eps', bull: 'epsHigh' };

/** The analysis with every forecast year moved to one end of the revenue range, margins held. */
function flexed(a: any, key: CaseKey): { a: any; missing: number[] } {
  const field = FIELD[key];
  if (!field) return { a, missing: [] };
  const from = a.forecast?.base?.year;
  const missing: number[] = [];
  const rows = (a.forecast?.rows || []).map((r: any) => {
    if (isNum(from) && r.year < from) return r;
    const rev = r[field];
    if (!isNum(r.revenue) || r.revenue <= 0) return r;
    if (!isNum(rev) || rev <= 0) { missing.push(r.year); return r; }
    const k = rev / r.revenue;
    return { ...r, revenue: rev, ebit: isNum(r.ebit) ? r.ebit * k : r.ebit, ebitda: isNum(r.ebitda) ? r.ebitda * k : r.ebitda };
  });
  return { a: { ...a, forecast: { ...a.forecast, rows } }, missing };
}

function runCase(a: any, key: CaseKey): CaseResult & { missing: number[] } {
  const { a: x, missing } = flexed(a, key);
  const perModel = DCFS.map((m: any) => {
    let v: number | null = null;
    try { const r = m.fairValue(x); v = isNum(r?.value) && r.value > 0 ? r.value : null; } catch { v = null; }
    return { id: m.id, label: m.short || m.label, value: v };
  });
  const vals = perModel.map((m) => m.value).filter(isNum);
  const value = vals.length ? median(vals) : null;
  const price = a.facts?.price;

  const from = a.forecast?.base?.year;
  const path = (x.forecast?.rows || []).filter((r: any) => (!isNum(from) || r.year >= from) && isNum(r.revenue) && r.revenue > 0);
  const first = path[0] ?? null;
  const last = path.at(-1) ?? null;
  // The year after the base where there is one: the base year is often all
  // but reported by the time a reader sees it, and its range has closed up.
  const fy = (a.forecast?.rows || []);
  const epsRow = fy.find((r: any) => isNum(from) && r.year === from + 1 && isNum(r[EPS_FIELD[key]]))
    ?? fy.find((r: any) => r.year === from) ?? null;

  return {
    key,
    value,
    upside: isNum(value) && isNum(price) && price > 0 ? value / price - 1 : null,
    perModel,
    revenueFrom: first?.revenue ?? null,
    revenueTo: last?.revenue ?? null,
    fromYear: first?.year ?? null,
    toYear: last?.year ?? null,
    growth: first && last && last.year > first.year ? cagr(first.revenue, last.revenue, last.year - first.year) : null,
    eps: epsRow?.[EPS_FIELD[key]] ?? null,
    epsYear: epsRow?.year ?? null,
    missing,
  };
}

export function buildScenarios(a: any): Scenarios {
  const pt = a.ds?.get?.('priceTarget') || {};
  const targets = {
    low: isNum(pt.targetLow) ? pt.targetLow : null,
    consensus: isNum(pt.targetConsensus) ? pt.targetConsensus : null,
    high: isNum(pt.targetHigh) ? pt.targetHigh : null,
  };
  const none = (why: string): Scenarios => ({ available: false, why, cases: null, analysts: null, targets });

  if (!(a.forecast?.rows || []).length) return none('No analyst estimates were returned, so there is no range of outcomes to build the cases from.');
  const bear = runCase(a, 'bear');
  const base = runCase(a, 'base');
  const bull = runCase(a, 'bull');
  if (bear.missing.length || bull.missing.length) {
    const years = [...new Set([...bear.missing, ...bull.missing])].sort();
    return none(`The estimates publish no low or high revenue for ${years.map((y) => `FY${y}`).join(', ')}, so one end of the range cannot be drawn.`);
  }
  if (!isNum(base.value)) return none('None of the six discounted cash flow models could price this company on the consensus, so there is no base for the cases to sit either side of.');

  const baseRow = (a.forecast?.rows || []).find((r: any) => r.year === a.forecast?.base?.year);
  const strip = ({ missing: _m, ...r }: CaseResult & { missing: number[] }): CaseResult => r;
  return {
    available: true,
    why: null,
    cases: { bear: strip(bear), base: strip(base), bull: strip(bull) },
    analysts: isNum(baseRow?.analystsRevenue) ? baseRow.analystsRevenue : null,
    targets,
  };
}
