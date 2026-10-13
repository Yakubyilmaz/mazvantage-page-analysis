/* The halal check on a fund's holdings (2026-10-13): one label per holding,
   the fund's weight added up under each standard, and nothing unscreened
   counted as a pass or a fail. */

import { describe, expect, it } from 'vitest';
import { checkHolding, checkCost, summariseFund, type HoldingCheck } from '@/lib/etf-halal';

const sheet = (debt: number, cash: number, assets = 1000) =>
  [{ date: '2026-06-30', totalDebt: debt, cashAndShortTermInvestments: cash, longTermInvestments: 0, accountsReceivables: 0, totalAssets: assets }];
const tech = { name: 'Tech Co', sector: 'Technology', industry: 'Software', marketCap: 1000 };
const line = (symbol: string | null, weight: number) => ({ key: symbol || `line-${weight}`, symbol, name: symbol || 'Cash', weight });

describe('checkHolding', () => {
  it('passes a company inside every limit, under every standard', () => {
    const h = checkHolding(line('AAA', 0.1), tech, sheet(50, 50, 2000));
    expect(h.status).toBe('screened');
    expect(h.label?.tone).toBe('good');
    expect(Object.values(h.byStandard).every((s) => s === 'pass')).toBe(true);
  });

  it('fails a company over the debt limit', () => {
    const h = checkHolding(line('BBB', 0.1), tech, sheet(600, 10, 1000));
    expect(h.label?.tone).toBe('bad');
    expect(h.byStandard.aaoifi).toBe('fail');
  });

  it('lets the activity screen decide for an excluded business', () => {
    const h = checkHolding(line('BNK', 0.1), { ...tech, sector: 'Financial Services', industry: 'Banks - Regional' }, sheet(0, 0));
    expect(h.label).toMatchObject({ tone: 'bad', headline: 'Excluded on activity' });
  });

  it('never screens a line without a ticker or without a balance sheet', () => {
    expect(checkHolding(line(null, 0.02), null, null).status).toBe('no-ticker');
    expect(checkHolding(line('CCC', 0.02), tech, null).status).toBe('no-data');
    expect(checkHolding(line('CCC', 0.02), null, sheet(0, 0)).status).toBe('no-data');
  });
});

describe('summariseFund', () => {
  const holdings: HoldingCheck[] = [
    checkHolding(line('AAA', 0.5), tech, sheet(50, 50, 2000)),
    checkHolding(line('BBB', 0.3), tech, sheet(600, 10, 1000)),
    checkHolding(line(null, 0.05), null, null),
    { ...line('DDD', 0.15), status: 'beyond-cap', label: null, byStandard: {}, sector: null },
  ];
  const s = summariseFund({ symbol: 'TEST', name: 'Test fund', updatedAt: null }, holdings, 2);

  it('adds the weight up by label, with everything unscreened kept apart', () => {
    expect(s.total).toBeCloseTo(1);
    expect(s.byLabel.good).toBeCloseTo(0.5);
    expect(s.byLabel.bad).toBeCloseTo(0.3);
    expect(s.byLabel.unscreened).toBeCloseTo(0.2);
    expect(s.beyondCap).toBe(1);
  });

  it('adds it up under each standard, and each standard sums to the fund', () => {
    expect(s.byStandard.aaoifi).toMatchObject({ pass: 0.5, fail: 0.3 });
    for (const v of Object.values(s.byStandard)) expect(v.pass + v.fail + v.na).toBeCloseTo(s.total);
  });

  it('prices the check', () => {
    expect(checkCost(220, 50)).toBe(53);
    expect(checkCost(20, 50)).toBe(23);
  });
});

describe('the standards disagree, and the check shows where', () => {
  it('reads a company over the market-cap limits but inside the asset one as mixed', () => {
    const h = checkHolding(line('MIX', 0.1), tech, sheet(600, 10, 5000));
    expect(h.label?.tone).toBe('warn');
    expect(h.byStandard.aaoifi).toBe('fail');
    expect(h.byStandard.msci).toBe('pass');
  });
});
