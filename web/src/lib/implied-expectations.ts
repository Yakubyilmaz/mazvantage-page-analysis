/* ==========================================================================
   Maz Vantage — what the price implies (a reverse DCF)

   The fair value estimate asks what the consensus forecast is worth. This
   asks the opposite question: what would have to be true for today's price
   to be fair? It runs the same discounted cash flow the ten-year models run
   (same discount rate, tax rate, capital spending, depreciation, terminal
   growth and net debt) and solves for one unknown at a time:

   - **implied growth**: the revenue growth a year, for ten years from the
     trailing twelve months, that the price needs at the consensus margin;
   - **implied margin**: the operating margin, held flat, that the price
     needs on the consensus revenue path;
   - **implied return**: the yearly return an investor earns buying at today's
     price if the consensus cash flows arrive exactly (the discount rate that
     equates the two), set against the cost of equity-weighted capital the
     models charge.

   Plus a grid of growth against margin, so a reader can see how much of the
   price each assumption carries. Like every fair value on the page, none of
   this reaches a grade.
   ========================================================================== */

import { cagr, isNum, median, pct, price } from './format';
import { dcfBasis } from './valuation-models';

export const HORIZON = 10;

export interface ReverseInputs {
  revenueTtm: number;
  wacc: number;
  g: number;
  tax: number;
  dnaRate: number;
  capexRate: number;
  netDebt: number;
  shares: number;
  /** the consensus path's operating margin in its last published year */
  margin: number;
  marginYear: number;
  /** the consensus revenue path the ten-year models discount, ten years */
  path: { year: number; revenue: number; ebit: number; dna: number; fcff: number; estimated: boolean }[];
}

/** Value per share of a revenue path at a flat (or yearly) operating margin. */
export function valueOf(inp: ReverseInputs, revenues: number[], margin: number | number[], rate = inp.wacc): number | null {
  if (rate <= inp.g || !revenues.length) return null;
  let pv = 0;
  let last = 0;
  revenues.forEach((rev, i) => {
    const m = Array.isArray(margin) ? margin[i] : margin;
    const fcff = rev * m * (1 - inp.tax) + rev * inp.dnaRate - rev * inp.capexRate;
    pv += fcff / (1 + rate) ** (i + 1);
    last = fcff;
  });
  const tv = (last * (1 + inp.g)) / (rate - inp.g);
  const ev = pv + tv / (1 + rate) ** revenues.length;
  return (ev - inp.netDebt) / inp.shares;
}

/** Value per share of the consensus free cash flows themselves, at a given rate. */
export function pathValue(inp: ReverseInputs, rate = inp.wacc): number | null {
  if (rate <= inp.g || !inp.path.length) return null;
  const pv = inp.path.reduce((t, r, i) => t + r.fcff / (1 + rate) ** (i + 1), 0);
  const last = inp.path[inp.path.length - 1].fcff;
  const tv = (last * (1 + inp.g)) / (rate - inp.g);
  return (pv + tv / (1 + rate) ** inp.path.length - inp.netDebt) / inp.shares;
}

export const grownPath = (base: number, growth: number, years = HORIZON) =>
  Array.from({ length: years }, (_, i) => base * (1 + growth) ** (i + 1));

/** Bisection on a function that rises with x; null when [lo, hi] does not bracket the target. */
export function solve(f: (x: number) => number | null, target: number, lo: number, hi: number): number | null {
  let flo = f(lo);
  const fhi = f(hi);
  if (!isNum(flo) || !isNum(fhi)) return null;
  if ((flo - target) * (fhi - target) > 0) return null;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (!isNum(fm)) return null;
    if ((fm - target) * (flo - target) <= 0) hi = mid;
    else { lo = mid; flo = fm; }
    if (hi - lo < 1e-7) break;
  }
  return (lo + hi) / 2;
}

export function reverseInputs(a: any): ReverseInputs | null {
  const b = dcfBasis(a, HORIZON);
  if (!b || !b.path || b.path.length < HORIZON) return null;
  if (![b.revenueTtm, b.netDebt, b.shares].every(isNum) || b.revenueTtm <= 0 || b.shares <= 0) return null;
  const last: any = b.path.filter((r: any) => r.estimated).at(-1) || b.path.at(-1);
  const margin = isNum(last.ebit) && last.revenue > 0 ? last.ebit / last.revenue : null;
  const dnaRate = isNum(last.dna) && last.revenue > 0 ? last.dna / last.revenue : 0;
  if (!isNum(margin) || margin <= 0) return null;
  return {
    revenueTtm: b.revenueTtm, wacc: b.wacc, g: b.g, tax: b.tax, dnaRate, capexRate: b.capexRate,
    netDebt: b.netDebt, shares: b.shares, margin, marginYear: last.year,
    path: b.path.map((r: any) => ({ year: r.year, revenue: r.revenue, ebit: r.ebit, dna: r.dna ?? 0, fcff: r.fcff, estimated: !!r.estimated })),
  };
}

export type Lean = 'more' | 'in line' | 'less';

export interface Implied {
  available: true;
  price: number;
  inputs: ReverseInputs;
  /** revenue growth a year for ten years, at the consensus margin */
  growth: number | null;
  /** the consensus path's own ten-year rate, from trailing revenue */
  consensusGrowth: number | null;
  /** the published consensus years alone, base to target, as a true compound rate */
  publishedGrowth: number | null;
  publishedSpan: string | null;
  /** filed revenue, compound, over the last five fiscal years and the whole filed record */
  history5: Span | null;
  historyAll: Span | null;
  /** flat operating margin on the consensus revenue path */
  margin: number | null;
  consensusMargin: number;
  filedMargins: { latest: number | null; peak: number | null; peakYear: number | null; median10: number | null };
  /** yearly return at today's price if the consensus cash flows arrive */
  impliedReturn: number | null;
  /** the consensus path at the models' own discount rate (the 10-year perpetuity model) */
  consensusValue: number | null;
  /** growth against margin; each cell a value per share */
  grid: { growths: number[]; margins: number[]; values: (number | null)[][] };
  lean: Lean | null;
}

const LEAN_BAND = 0.01;

export interface Span { rate: number; from: number; to: number }

function filedCagr(rows: any[], years: number | null): Span | null {
  const r = rows.filter((x) => isNum(x.revenue) && x.revenue > 0 && isNum(x.year));
  const n = years ?? r.length - 1;
  if (n < 1 || r.length < n + 1) return null;
  const end = r[r.length - 1];
  const start = r[r.length - 1 - n];
  const rate = cagr(start.revenue, end.revenue, end.year - start.year);
  return isNum(rate) ? { rate, from: start.year, to: end.year } : null;
}

const round = (x: number, step: number) => Math.round(x / step) * step;

export function impliedExpectations(a: any): Implied | { available: false; why: string } {
  const px = a?.facts?.price;
  if (!isNum(px) || px <= 0) return { available: false, why: 'There is no price to read.' };
  const inp = reverseInputs(a);
  if (!inp) return { available: false, why: 'The discounted cash flow cannot run for this company: it needs a discount rate and ten years of consensus revenue and operating profit.' };

  const growth = solve((x) => valueOf(inp, grownPath(inp.revenueTtm, x), inp.margin), px, -0.3, 1.0);
  const revs = inp.path.map((r) => r.revenue);
  const margin = solve((m) => valueOf(inp, revs, m), px, -0.5, 1.5);
  // The value falls as the rate rises, so solve on the negated rate.
  const ret = solve((r) => { const v = pathValue(inp, -r); return isNum(v) ? v : null; }, px, -0.6, -(inp.g + 0.0005));
  const impliedReturn = isNum(ret) ? -ret : null;

  const lastRev = inp.path[inp.path.length - 1].revenue;
  const consensusGrowth = cagr(inp.revenueTtm, lastRev, HORIZON);
  const fc = a.forecast || {};
  const publishedGrowth = isNum(fc.base?.revenue) && isNum(fc.target?.revenue) && fc.span > 0 ? cagr(fc.base.revenue, fc.target.revenue, fc.span) : null;
  const rows = (a.series?.rows || []) as any[];
  const opm = rows.map((x) => x.operatingMargin).filter(isNum);
  const peakRow = rows.filter((x) => isNum(x.operatingMargin)).reduce((p: any, x: any) => (!p || x.operatingMargin > p.operatingMargin ? x : p), null);

  // The grid: growth around the consensus and the implied rates, margin around the consensus.
  const centres = [consensusGrowth, growth].filter(isNum) as number[];
  const gLo = round(Math.min(...centres) - 0.02, 0.01);
  const gHi = round(Math.max(...centres) + 0.02, 0.01);
  const gStep = Math.max(0.01, round((gHi - gLo) / 5, 0.01));
  const growths: number[] = [];
  for (let x = gLo; x <= gHi + 1e-9 && growths.length < 8; x += gStep) growths.push(Number(x.toFixed(4)));
  const mBase = round(inp.margin, 0.01);
  const margins = [-0.1, -0.05, 0, 0.05, 0.1].map((d) => Number((mBase + d).toFixed(4))).filter((m) => m > 0 && m < 1);
  const values = growths.map((x) => margins.map((m) => valueOf(inp, grownPath(inp.revenueTtm, x), m)));

  const lean: Lean | null = isNum(growth) && isNum(consensusGrowth)
    ? (growth > consensusGrowth + LEAN_BAND ? 'more' : growth < consensusGrowth - LEAN_BAND ? 'less' : 'in line')
    : null;

  return {
    available: true, price: px, inputs: inp,
    growth, consensusGrowth, publishedGrowth,
    publishedSpan: isNum(fc.base?.year) && isNum(fc.target?.year) ? `FY${fc.base.year}–FY${fc.target.year}` : null,
    history5: filedCagr(rows, 5), historyAll: filedCagr(rows, null),
    margin, consensusMargin: inp.margin,
    filedMargins: {
      latest: opm.length ? opm[opm.length - 1] : null,
      peak: peakRow ? peakRow.operatingMargin : null,
      peakYear: peakRow ? peakRow.year : null,
      median10: opm.length ? median(opm.slice(-10)) : null,
    },
    impliedReturn, consensusValue: pathValue(inp),
    grid: { growths, margins, values },
    lean,
  };
}

/* ---------- the prose ------------------------------------------------------- */

const pts = (x: number) => `${Math.abs(x * 100).toFixed(1)} percentage points`;
const ptsAdj = (x: number) => `${Math.abs(x * 100).toFixed(1)}-percentage-point`;

/** The section's paragraphs: what the price needs, against the forecast and the record; then the same thing as a return. */
export function impliedProse(im: Implied, name: string, cur = 'US$'): string[] {
  const i = im.inputs;
  const out: string[] = [];
  if (isNum(im.growth)) {
    const record = [
      im.history5 ? `${name} grew revenue ${pct(im.history5.rate)} a year over FY${im.history5.from}–FY${im.history5.to}` : null,
      im.historyAll && im.history5 && im.historyAll.from !== im.history5.from ? `${pct(im.historyAll.rate)} over FY${im.historyAll.from}–FY${im.historyAll.to}` : null,
    ].filter(Boolean).join(', and ');
    out.push(
      `At ${price(im.price, cur)} the shares are priced for revenue growth of ${pct(im.growth)} a year for the next ${HORIZON} years, `
      + `at the ${pct(i.margin)} operating margin the consensus reaches in FY${i.marginYear}, discounted at the ${pct(i.wacc)} the models charge `
      + `and growing ${pct(i.g)} a year after that. `
      + (isNum(im.consensusGrowth) ? `The analysts’ path, as the ten-year models extend it, grows ${pct(im.consensusGrowth)} a year from trailing revenue` : '')
      + (isNum(im.publishedGrowth) && im.publishedSpan ? `; the published years alone (${im.publishedSpan}) compound at ${pct(im.publishedGrowth)}. ` : '. ')
      + (record ? `${record}.` : ''),
    );
  }
  if (im.lean && isNum(im.growth) && isNum(im.consensusGrowth)) {
    const gap = im.growth - im.consensusGrowth;
    const lead = im.lean === 'more'
      ? `The price asks for more than the analysts forecast: ${pts(gap)} more growth a year, every year for a decade.`
      : im.lean === 'less'
        ? `The price asks for less than the analysts forecast: ${pts(gap)} less growth a year than their path, so the consensus could disappoint and still leave the price covered.`
        : `The price asks for roughly what the analysts forecast: the two growth rates are within ${pts(LEAN_BAND)} of each other.`;
    const m = isNum(im.margin)
      ? ` Held to the consensus revenue path instead, the operating margin would have to average ${pct(im.margin)}, against ${pct(im.consensusMargin)} in the forecast`
        + (isNum(im.filedMargins.peak) ? ` and a filed peak of ${pct(im.filedMargins.peak)} in FY${im.filedMargins.peakYear}.` : '.')
      : '';
    out.push(lead + m);
  }
  if (isNum(im.impliedReturn)) {
    const r = im.impliedReturn;
    out.push(
      `Put the other way round: buying at ${price(im.price, cur)} and receiving exactly the consensus cash flows would return ${pct(r)} a year, `
      + `against the ${pct(i.wacc)} cost of capital the models use. `
      + (r < i.wacc - 0.0005
        ? `The ${ptsAdj(i.wacc - r)} shortfall is what the market pays above the consensus case, and it is the same gap the fair value estimate records from the other side: the consensus cash flows are worth ${price(im.consensusValue, cur)} a share at the models’ rate.`
        : r > i.wacc + 0.0005
          ? `The ${ptsAdj(r - i.wacc)} excess is the margin of safety the consensus case offers at this price: the same cash flows are worth ${price(im.consensusValue, cur)} a share at the models’ rate.`
          : 'The two are the same to a rounding, which is to say the price is the consensus case.'),
    );
  }
  out.push(
    'None of these is a forecast. Each holds every other input of the model where the ten-year discounted cash flow puts it and asks how far one input '
    + 'would have to move for the price to be fair; the grid below lets growth and margin move together.',
  );
  return out;
}

/* ---------- sensitivity ------------------------------------------------------ */

export interface Shift { rate?: number; g?: number; margin?: number; growth?: number; tax?: number; capex?: number }

/**
 * The consensus path's value per share with inputs shifted: the discount
 * rate, terminal growth, operating margin and tax rate by points, revenue
 * growth by points a year (compounded along the path), capital spending by
 * points of revenue. With no shift it equals `pathValue`, the ten-year
 * perpetuity model.
 */
export function shiftedValue(inp: ReverseInputs, s: Shift = {}): number | null {
  const rate = inp.wacc + (s.rate ?? 0);
  const g = inp.g + (s.g ?? 0);
  if (rate <= g) return null;
  const tax = inp.tax + (s.tax ?? 0);
  const capex = inp.capexRate + (s.capex ?? 0);
  let pv = 0;
  let last = 0;
  inp.path.forEach((r, i) => {
    const rev = r.revenue * (1 + (s.growth ?? 0)) ** (i + 1);
    const m = r.ebit / r.revenue + (s.margin ?? 0);
    const fcff = rev * m * (1 - tax) + rev * (r.dna / r.revenue) - rev * capex;
    pv += fcff / (1 + rate) ** (i + 1);
    last = fcff;
  });
  const tv = (last * (1 + g)) / (rate - g);
  return (pv + tv / (1 + rate) ** inp.path.length - inp.netDebt) / inp.shares;
}

export interface TornadoBar { key: keyof Shift; label: string; step: string; low: number | null; high: number | null; range: number }

const TORNADO: { key: keyof Shift; label: string; d: number; step: string }[] = [
  { key: 'rate', label: 'Discount rate', d: 0.01, step: '±1 point' },
  { key: 'growth', label: 'Revenue growth', d: 0.02, step: '±2 points a year' },
  { key: 'margin', label: 'Operating margin', d: 0.02, step: '±2 points' },
  { key: 'g', label: 'Terminal growth', d: 0.005, step: '±0.5 point' },
  { key: 'tax', label: 'Tax rate', d: 0.03, step: '±3 points' },
  { key: 'capex', label: 'Capital spending', d: 0.01, step: '±1 point of revenue' },
];

export interface Sensitivity {
  base: number | null;
  rates: number[];
  growths: number[];
  /** rows: discount rates; columns: terminal growth */
  grid: (number | null)[][];
  tornado: TornadoBar[];
}

export function sensitivity(inp: ReverseInputs): Sensitivity {
  const base = shiftedValue(inp);
  const rateSteps = [-0.02, -0.01, 0, 0.01, 0.02];
  const gSteps = [-0.01, -0.005, 0, 0.005, 0.01];
  const rates = rateSteps.map((d) => inp.wacc + d);
  const growths = gSteps.map((d) => inp.g + d);
  const grid = rateSteps.map((dr) => gSteps.map((dg) => shiftedValue(inp, { rate: dr, g: dg })));
  const tornado = TORNADO.map((t) => {
    // For the discount rate, tax and capital spending the value falls as the input rises: low is the higher input.
    const up = shiftedValue(inp, { [t.key]: t.d });
    const down = shiftedValue(inp, { [t.key]: -t.d });
    const vals = [up, down].filter(isNum) as number[];
    const low = vals.length ? Math.min(...vals) : null;
    const high = vals.length ? Math.max(...vals) : null;
    return { key: t.key, label: t.label, step: t.step, low, high, range: isNum(low) && isNum(high) ? high - low : 0 };
  }).sort((x, y) => y.range - x.range);
  return { base, rates, growths, grid, tornado };
}

/** A probability-weighted value over the bear, consensus and bull cases: the weights are a stated convention, not a forecast. */
export const CASE_WEIGHTS = { bear: 0.25, base: 0.5, bull: 0.25 } as const;

export function weightedValue(cases: { bear: { value: number | null }; base: { value: number | null }; bull: { value: number | null } } | null | undefined) {
  if (!cases) return null;
  const ks = ['bear', 'base', 'bull'] as const;
  if (!ks.every((k) => isNum(cases[k].value))) return null;
  return ks.reduce((t, k) => t + CASE_WEIGHTS[k] * (cases[k].value as number), 0);
}
