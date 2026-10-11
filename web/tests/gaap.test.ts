import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountingStandard, adjustedYears, basisYears, joinQuarters, sameUnit, trailingFour } from '@/lib/gaap';

const snap = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/AAPL.json'), 'utf8'));
const { earnings, incomeQ, income, balance, cashflow, incomeAsReported } = snap.feeds;
const chron = (rows: any[]) => [...rows].sort((x, y) => Date.parse(x.date) - Date.parse(y.date));

/* Salesforce, read live on 2026-10-07: the earnings calendar and the
   quarterly income statement for the same six quarters. Q1 FY26 is the
   published pair — $2.58 non-GAAP against $1.59 GAAP. */
const CRM_EARNINGS = [
  { date: '2025-05-28', epsActual: 2.58, epsEstimated: 2.55, revenueActual: 9829000000 },
  { date: '2025-09-03', epsActual: 2.91, epsEstimated: 2.78, revenueActual: 10236000000 },
  { date: '2025-12-03', epsActual: 3.25, epsEstimated: 2.86, revenueActual: 10259000000 },
  { date: '2026-02-25', epsActual: 3.81, epsEstimated: 3.05, revenueActual: 11201000000 },
  { date: '2026-05-27', epsActual: 3.88, epsEstimated: 3.13, revenueActual: 11133000000 },
  { date: '2026-08-26', epsActual: 5.9, epsEstimated: 3.27, revenueActual: 11345000000 },
  { date: '2026-12-02', epsActual: null, epsEstimated: 3.43, revenueActual: null },
];
const CRM_QUARTERS = [
  { date: '2026-07-31', fiscalYear: '2027', period: 'Q2', filingDate: '2026-08-27', revenue: 11345000000, epsDiluted: 4.29 },
  { date: '2026-04-30', fiscalYear: '2027', period: 'Q1', filingDate: '2026-05-28', revenue: 11133000000, epsDiluted: 2.42 },
  { date: '2026-01-31', fiscalYear: '2026', period: 'Q4', filingDate: '2026-03-02', revenue: 11201000000, epsDiluted: 2.07 },
  { date: '2025-10-31', fiscalYear: '2026', period: 'Q3', filingDate: '2025-12-04', revenue: 10259000000, epsDiluted: 2.18 },
  { date: '2025-07-31', fiscalYear: '2026', period: 'Q2', filingDate: '2025-09-04', revenue: 10236000000, epsDiluted: 1.96 },
  { date: '2025-04-30', fiscalYear: '2026', period: 'Q1', filingDate: '2025-05-29', revenue: 9829000000, epsDiluted: 1.59 },
];

describe('the accounting standard, from the filing’s own tags', () => {
  it('reads Apple’s 10-K as US GAAP, and says which tags decided it', () => {
    const s = accountingStandard(incomeAsReported);
    expect(s.standard).toBe('US GAAP');
    expect(s.fiscalYear).toBe(2025);
    expect(s.tags).toEqual(expect.arrayContaining(['NetIncomeLoss', 'EarningsPerShareDiluted', 'OperatingIncomeLoss']));
  });
  it('reads an IFRS filer as IFRS', () => {
    // SAP's FY2025 20-F, as tagged (a subset of its income-statement keys).
    const sap = [{ date: '2025-12-31', fiscalYear: 2025, data: {
      revenue: 1, profitlossfromoperatingactivities: 1, financecosts: 1, profitlossbeforetax: 1,
      incometaxexpensecontinuingoperations: 1, profitloss: 1, profitlossattributabletoownersofparent: 1,
      basicearningslosspershare: 6.14, dilutedearningslosspershare: 6.1,
    } }];
    expect(accountingStandard(sap).standard).toBe('IFRS');
  });
  it('does not guess when there is no tagged filing, or only one stray tag', () => {
    expect(accountingStandard([]).standard).toBeNull();
    expect(accountingStandard(null).standard).toBeNull();
    expect(accountingStandard([{ date: '2025-12-31', data: { netincomeloss: 1, revenue: 2 } }]).standard).toBeNull();
  });
  it('treats `ProfitLoss` as neither — US GAAP has it too', () => {
    const us = [{ date: '2025-12-31', data: { profitloss: 1, netincomeloss: 1, earningspersharediluted: 1 } }];
    expect(accountingStandard(us).standard).toBe('US GAAP');
  });
});

describe('reported EPS and filed EPS are only compared in the same unit', () => {
  it('flags an ADR quoted in dollars against statements in euros', () => {
    expect(sameUnit('USD', 'EUR')).toBe(false);
    expect(sameUnit('usd', 'USD')).toBe(true);
  });
  it('reads a missing currency as the listing’s own', () => {
    expect(sameUnit('USD', undefined)).toBe(true);
    expect(sameUnit('USD', '')).toBe(true);
  });
});

describe('Salesforce: adjusted and filed EPS, quarter by quarter', () => {
  const qs = joinQuarters(CRM_EARNINGS, CRM_QUARTERS);
  it('joins every reported quarter to the quarter it covers, and leaves the unreported one out', () => {
    expect(qs.map((q) => q.label)).toEqual(['Q1 FY26', 'Q2 FY26', 'Q3 FY26', 'Q4 FY26', 'Q1 FY27', 'Q2 FY27']);
    expect(qs.every((q) => q.revenueAgrees)).toBe(true);
  });
  it('keeps the two figures apart: $2.58 adjusted, $1.59 filed', () => {
    expect(qs[0]).toMatchObject({ adjusted: 2.58, gaap: 1.59, estimate: 2.55, announced: '2025-05-28' });
  });
  it('sums a fiscal year only when all four quarters are in it', () => {
    const ys = adjustedYears(qs);
    expect(ys.map((y) => y.fiscalYear)).toEqual(['2026']);
    expect(ys[0]).toMatchObject({ year: 2026, adjusted: 12.55, gaapQuarters: 7.8, adjustedQuarters: 4 });
  });
  it('takes the trailing four over the four newest filed quarters', () => {
    const t = trailingFour(qs, CRM_QUARTERS)!;
    expect(t.adjusted).toBeCloseTo(3.25 + 3.81 + 3.88 + 5.9, 10);
    expect(t.gaap).toBeCloseTo(2.18 + 2.07 + 2.42 + 4.29, 10);
    expect([t.first.label, t.last.label]).toEqual(['Q3 FY26', 'Q2 FY27']);
  });
});

describe('the join does not place a release it cannot place', () => {
  const q = { date: '2025-06-30', fiscalYear: '2025', period: 'Q2', filingDate: '2025-07-25', revenue: 100, epsDiluted: 1 };
  it('skips a release whose quarter was filed six weeks before it', () => {
    // 112 days after the quarter closed, inside the window — but that
    // quarter's results were public in July, so this is not their release.
    expect(joinQuarters([{ date: '2025-10-20', epsActual: 1.2 }], [q])).toEqual([]);
  });
  it('skips a release four months after the nearest quarter when revenue does not tie it', () => {
    expect(joinQuarters([{ date: '2025-11-05', epsActual: 1.2 }], [{ ...q, filingDate: undefined }])).toEqual([]);
  });
  it('places it when revenue ties it, inside five months', () => {
    expect(joinQuarters([{ date: '2025-11-05', epsActual: 1.2, revenueActual: 100.2 }], [{ ...q, filingDate: undefined }])).toHaveLength(1);
  });
  it('never gives one filed quarter two releases', () => {
    const two = [{ date: '2025-07-24', epsActual: 1.2 }, { date: '2025-07-30', epsActual: 1.3 }];
    expect(joinQuarters(two, [q]).map((x) => x.adjusted)).toEqual([1.2]);
  });
});

describe('Apple, from the bundled capture', () => {
  const qs = joinQuarters(earnings, incomeQ);
  it('places all twelve filed quarters, and not the release before them', () => {
    expect(qs).toHaveLength(12);
    expect(qs[0].label).toBe('Q4 FY23');
    expect(qs.some((x) => x.announced === '2023-08-03')).toBe(false);
  });
  it('shows the September 2024 tax charge as an adjustment: $1.64 against $0.97', () => {
    expect(qs.find((x) => x.label === 'Q4 FY24')).toMatchObject({ adjusted: 1.64, gaap: 0.97 });
  });
  it('sums FY2024 and FY2025, the two complete fiscal years', () => {
    const ys = adjustedYears(qs);
    expect(ys.map((y) => y.year)).toEqual([2024, 2025]);
    expect(ys[0]).toMatchObject({ adjusted: 6.75, gaapQuarters: 6.08, adjustedQuarters: 1 });
    expect(ys[1]).toMatchObject({ adjusted: 7.47, gaapQuarters: 7.47, adjustedQuarters: 0 });
  });
  it('has the same trailing four on both bases when no quarter was adjusted by more than a cent', () => {
    const t = trailingFour(qs, incomeQ)!;
    expect(t.adjusted).toBe(8.73);
    expect(t.gaap).toBe(8.73);
  });

  const years = basisYears({ income: chron(income), balance: chron(balance), cash: chron(cashflow) }, adjustedYears(qs));
  const fy = (y: number) => years.find((r) => r.year === y)!;
  it('builds free cash flow from its two filed lines, and lands on the published figure', () => {
    const c = cashflow.find((r: any) => r.date === '2025-09-27');
    expect(fy(2025).fcf).toBe(c.operatingCashFlow - Math.abs(c.capitalExpenditure));
    expect(fy(2025).fcf).toBe(c.freeCashFlow);
  });
  it('builds EBITDA from operating income and the cash flow statement’s depreciation', () => {
    const i = income.find((r: any) => r.date === '2025-09-27');
    const c = cashflow.find((r: any) => r.date === '2025-09-27');
    expect(fy(2025).ebitda).toBe(i.operatingIncome + c.depreciationAndAmortization);
    expect(fy(2025).ebitdaExSbc).toBe(fy(2025).ebitda! + 12863000000);
  });
  it('nets debt against cash and short-term investments, and takes goodwill out of book value', () => {
    expect(fy(2025).netDebt).toBe(112377000000 - 54697000000);
    expect(fy(2017).tangibleBook).toBe(fy(2017).equity! - 8015000000);
    expect(fy(2025).tangibleBook).toBe(fy(2025).equity);
  });
  it('reconciles adjusted EPS to filed EPS only in the years both exist', () => {
    expect(fy(2024)).toMatchObject({ epsAdjusted: 6.75, epsGaapQuarters: 6.08, epsGaap: 6.08, epsAdjustment: 0.67 });
    expect(fy(2023).epsAdjusted).toBeNull();
    expect(fy(2023).epsAdjustment).toBeNull();
  });
  it('compares like with like: FY2025’s quarters sum a cent above the annual EPS, and that cent is not an adjustment', () => {
    expect(fy(2025)).toMatchObject({ epsAdjusted: 7.47, epsGaapQuarters: 7.47, epsGaap: 7.46, epsAdjustment: 0 });
  });
});
