import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BENEISH_THRESHOLD, beneishFrom } from '@/lib/beneish';

const snap = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/AAPL.json'), 'utf8'));
const { income, balance, cashflow } = snap.feeds;

/** Beneish (1999), eight variables, written out longhand from the paper. */
function longhand(i0: any, i1: any, b0: any, b1: any, c0: any, c1: any) {
  const dsri = (b0.netReceivables / i0.revenue) / (b1.netReceivables / i1.revenue);
  const gm = (r: any) => (r.revenue - r.costOfRevenue) / r.revenue;
  const soft = (b: any) => 1 - (b.totalCurrentAssets + b.propertyPlantEquipmentNet + b.longTermInvestments) / b.totalAssets;
  const rate = (c: any, b: any) => c.depreciationAndAmortization / (c.depreciationAndAmortization + b.propertyPlantEquipmentNet);
  const lev = (b: any) => (b.totalCurrentLiabilities + b.longTermDebt) / b.totalAssets;
  return -4.84
    + 0.920 * dsri
    + 0.528 * (gm(i1) / gm(i0))
    + 0.404 * (soft(b0) / soft(b1))
    + 0.892 * (i0.revenue / i1.revenue)
    + 0.115 * (rate(c1, b1) / rate(c0, b0))
    - 0.172 * ((i0.sellingGeneralAndAdministrativeExpenses / i0.revenue) / (i1.sellingGeneralAndAdministrativeExpenses / i1.revenue))
    + 4.679 * ((i0.netIncome - c0.operatingCashFlow) / b0.totalAssets)
    - 0.327 * (lev(b0) / lev(b1));
}

describe('Apple, from the bundled capture', () => {
  const b = beneishFrom(income, balance, cashflow, 'Technology');
  it('matches the paper’s formula for the newest pair of years', () => {
    expect(b.latest?.year).toBe(2025);
    expect(b.latest?.m).toBeCloseTo(longhand(income[0], income[1], balance[0], balance[1], cashflow[0], cashflow[1]), 12);
  });
  it('scores one year per consecutive pair, oldest first', () => {
    expect(b.history.map((h) => h.year)).toEqual([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
  });
  it('sits below the flag line', () => {
    expect(b.latest!.m!).toBeLessThan(BENEISH_THRESHOLD);
    expect(b.zone).toBe('clear');
  });
});

describe('gaps', () => {
  it('refuses a score when the vendor left an input blank, and names it', () => {
    const bal = balance.map((r: any, i: number) => (i === 0 ? { ...r, netReceivables: null } : r));
    const b = beneishFrom(income, bal, cashflow, 'Technology');
    expect(b.latest?.m).toBeNull();
    expect(b.latest?.missing).toEqual(['dsri']);
    expect(b.zone).toBeNull();
  });
  it('treats a line that is zero in both years as neutral, per Beneish', () => {
    const inc = income.map((r: any) => ({ ...r, sellingGeneralAndAdministrativeExpenses: 0 }));
    const b = beneishFrom(inc, balance, cashflow, 'Technology');
    expect(b.latest?.indices.sgai).toBe(1);
    expect(b.latest?.neutral).toEqual(['sgai']);
    expect(b.latest?.m).not.toBeNull();
  });
  it('marks a financial company as outside the model, without hiding the number', () => {
    const b = beneishFrom(income, balance, cashflow, 'Financial Services');
    expect(b.applicable).toBe(false);
    expect(b.latest?.m).not.toBeNull();
  });
  it('is unavailable with a single year on file', () => {
    expect(beneishFrom(income.slice(0, 1), balance.slice(0, 1), cashflow.slice(0, 1)).available).toBe(false);
  });
});
