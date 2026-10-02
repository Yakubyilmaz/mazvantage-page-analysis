/* ==========================================================================
   Maz Vantage — the Beneish M-Score

   Messod Beneish's 1999 probit model of earnings manipulation: eight ratios
   comparing one fiscal year with the one before, weighted into a single
   score. Above −1.78 — the cut-off Beneish published for the eight-variable
   model — the profile looks more like the firms in his sample that were later
   caught manipulating than like the ones that were not.

   What it is not, and every surface that prints it says so:
   - **Not a finding.** It flags a pattern — fast sales growth, receivables
     outrunning sales, accruals outrunning cash — that manipulation produces
     and plenty of honest growth produces too.
   - **Not for financial companies.** Beneish fitted it on manufacturers and
     service firms; banks and insurers have no gross margin or receivables in
     the sense it means. It is computed for them and marked as not meaningful.
   - **Not part of any grade.** It is not in the master spec's ratio set, so it
     sits beside Altman and Piotroski as a reference figure and never reaches
     a factor score.

   Inputs are the annual statements the report already loads. A field the
   vendor leaves null makes its index — and so the score — uncomputable, and
   the result names which; it is never filled with a guess. A line that is
   zero in both years (no receivables, no SG&A line) makes its index a
   neutral 1, the convention in Beneish's own paper, and that is named too.
   ========================================================================== */

import { isNum } from './format';

export const BENEISH_THRESHOLD = -1.78;

export type BeneishKey = 'dsri' | 'gmi' | 'aqi' | 'sgi' | 'depi' | 'sgai' | 'lvgi' | 'tata';

/** The index, its weight, and what it means when it moves. */
export const BENEISH_INDICES: { key: BeneishKey; label: string; weight: number; what: string; high: string }[] = [
  { key: 'dsri', label: 'Days’ sales in receivables', weight: 0.920, what: 'Receivables as a share of sales, against the prior year.',
    high: 'Above 1: receivables grew faster than sales — revenue booked before the cash arrives.' },
  { key: 'gmi', label: 'Gross margin', weight: 0.528, what: 'Last year’s gross margin over this year’s.',
    high: 'Above 1: the margin fell — a business under pressure has more reason to dress its numbers.' },
  { key: 'aqi', label: 'Asset quality', weight: 0.404, what: 'The share of assets that are neither current, plant nor investments, against the prior year.',
    high: 'Above 1: more of the balance sheet is soft assets — a sign costs may be being capitalised rather than expensed.' },
  { key: 'sgi', label: 'Sales growth', weight: 0.892, what: 'This year’s sales over last year’s.',
    high: 'Above 1: sales grew. Not manipulation in itself, but growth firms face the most pressure to keep growing.' },
  { key: 'depi', label: 'Depreciation', weight: 0.115, what: 'Last year’s depreciation rate over this year’s.',
    high: 'Above 1: assets are being depreciated more slowly, which lifts reported profit.' },
  { key: 'sgai', label: 'SG&A expenses', weight: -0.172, what: 'Selling, general and administrative cost as a share of sales, against the prior year.',
    high: 'Above 1: overheads grew faster than sales. Beneish found this lowers the score — the weight is negative.' },
  { key: 'lvgi', label: 'Leverage', weight: -0.327, what: 'Current liabilities plus long-term debt over total assets, against the prior year.',
    high: 'Above 1: leverage rose. Its weight is negative in the fitted model, so it lowers the score.' },
  { key: 'tata', label: 'Total accruals', weight: 4.679, what: 'Profit from continuing operations less operating cash flow, over total assets. A level, not a ratio of years.',
    high: 'Above 0: profit ran ahead of the cash the business collected. The heaviest weight in the model.' },
];

const INTERCEPT = -4.84;

export interface BeneishYear {
  year: number | null;
  date: string;
  priorDate: string;
  indices: Record<BeneishKey, number | null>;
  /** indices set to a neutral 1 because the line was zero in both years */
  neutral: BeneishKey[];
  /** indices that could not be computed, and so no score */
  missing: BeneishKey[];
  m: number | null;
}

export interface Beneish {
  available: boolean;
  latest: BeneishYear | null;
  /** oldest first, one per consecutive pair of filed years */
  history: BeneishYear[];
  /** false for banks and insurers, where the model does not apply */
  applicable: boolean;
  /** 'flag' above the threshold, 'clear' below it */
  zone: 'flag' | 'clear' | null;
}

const v = (x: unknown): number | null => (isNum(x) ? x : null);

/** a / b, or null when either is missing or b is zero. */
const div = (a: number | null, b: number | null): number | null => (a == null || b == null || b === 0 ? null : a / b);

/**
 * Ratio of two years' ratios, with Beneish's zero rule: a line zero in both
 * years is neutral; a line zero in one year only makes the index undefined.
 */
function index(nowNum: number | null, nowDen: number | null, prevNum: number | null, prevDen: number | null): { value: number | null; neutral: boolean } {
  if (nowNum === 0 && prevNum === 0) return { value: 1, neutral: true };
  const now = div(nowNum, nowDen);
  const prev = div(prevNum, prevDen);
  return { value: now == null || prev == null || prev === 0 ? null : now / prev, neutral: false };
}

function pair(inc: any, incP: any, bal: any, balP: any, cf: any, cfP: any): BeneishYear {
  const sales = v(inc.revenue);
  const salesP = v(incP.revenue);
  const rec = v(bal.netReceivables);
  const recP = v(balP.netReceivables);
  const gm = (r: any) => (isNum(r.revenue) && r.revenue !== 0 && isNum(r.costOfRevenue) ? (r.revenue - r.costOfRevenue) / r.revenue : null);
  const ta = v(bal.totalAssets);
  const soft = (b: any) => {
    const parts = [b.totalCurrentAssets, b.propertyPlantEquipmentNet, b.longTermInvestments];
    return isNum(b.totalAssets) && b.totalAssets !== 0 && parts.every(isNum) ? 1 - (parts[0] + parts[1] + parts[2]) / b.totalAssets : null;
  };
  const dep = v(cf.depreciationAndAmortization);
  const depP = v(cfP.depreciationAndAmortization);
  const ppe = v(bal.propertyPlantEquipmentNet);
  const ppeP = v(balP.propertyPlantEquipmentNet);
  const lev = (b: any) => (isNum(b.totalCurrentLiabilities) && isNum(b.longTermDebt) && isNum(b.totalAssets) && b.totalAssets !== 0
    ? (b.totalCurrentLiabilities + b.longTermDebt) / b.totalAssets : null);
  const profit = v(inc.netIncomeFromContinuingOperations) ?? v(inc.netIncome);
  const cfo = v(cf.operatingCashFlow) ?? v(cf.netCashProvidedByOperatingActivities);

  const neutral: BeneishKey[] = [];
  const take = (key: BeneishKey, r: { value: number | null; neutral: boolean }) => { if (r.neutral) neutral.push(key); return r.value; };

  const gmNow = gm(inc);
  const gmPrev = gm(incP);
  const softNow = soft(bal);
  const softPrev = soft(balP);
  const depRate = (d: number | null, p: number | null) => (d == null || p == null || d + p === 0 ? null : d / (d + p));

  const indices: Record<BeneishKey, number | null> = {
    dsri: take('dsri', index(rec, sales, recP, salesP)),
    // Inverted on purpose: prior over current, so a falling margin reads above 1.
    gmi: gmNow == null || gmPrev == null || gmNow === 0 ? null : gmPrev / gmNow,
    aqi: softNow == null || softPrev == null || softPrev === 0 ? null : softNow / softPrev,
    sgi: div(sales, salesP),
    depi: (() => {
      const now = depRate(dep, ppe);
      const prev = depRate(depP, ppeP);
      return now == null || prev == null || now === 0 ? null : prev / now;
    })(),
    sgai: take('sgai', index(v(inc.sellingGeneralAndAdministrativeExpenses), sales, v(incP.sellingGeneralAndAdministrativeExpenses), salesP)),
    lvgi: (() => { const a = lev(bal); const b = lev(balP); return a == null || b == null || b === 0 ? null : a / b; })(),
    tata: profit == null || cfo == null ? null : div(profit - cfo, ta),
  };

  const missing = BENEISH_INDICES.map((i) => i.key).filter((k) => indices[k] == null);
  const m = missing.length ? null
    : BENEISH_INDICES.reduce((s, i) => s + i.weight * (indices[i.key] as number), INTERCEPT);
  const year = Number.parseInt(String(inc.fiscalYear ?? inc.date?.slice(0, 4)), 10);
  return { year: Number.isFinite(year) ? year : null, date: inc.date, priorDate: incP.date, indices, neutral, missing, m };
}

const byDate = (rows: unknown): Map<string, any> => {
  const out = new Map<string, any>();
  if (Array.isArray(rows)) for (const r of rows) if (r?.date) out.set(String(r.date).slice(0, 10), r);
  return out;
};

/** Every computable year from the three annual statements, matched on fiscal year-end. */
export function beneishFrom(income: unknown, balance: unknown, cashflow: unknown, sector?: string | null): Beneish {
  const inc = byDate(income);
  const bal = byDate(balance);
  const cf = byDate(cashflow);
  const dates = [...inc.keys()].filter((d) => bal.has(d) && cf.has(d)).sort();
  const history: BeneishYear[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const [p, d] = [dates[i - 1], dates[i]];
    history.push(pair(inc.get(d), inc.get(p), bal.get(d), bal.get(p), cf.get(d), cf.get(p)));
  }
  const latest = history.at(-1) ?? null;
  const applicable = !/financial/i.test(sector || '');
  return {
    available: !!latest,
    latest,
    history,
    applicable,
    zone: latest?.m == null ? null : latest.m > BENEISH_THRESHOLD ? 'flag' : 'clear',
  };
}

/** Each index's weighted share of the score, for the breakdown table. */
export const contribution = (key: BeneishKey, value: number | null) => {
  const w = BENEISH_INDICES.find((i) => i.key === key)?.weight;
  return w == null || value == null ? null : w * value;
};
