import { describe, expect, it } from 'vitest';
import { annualisedReturn, dividendReinvestment, investmentGrowth, positionSize } from '@/lib/calculators';

describe('investment growth', () => {
  it('compounds a lump sum at the stated annual rate, not 1/12th of it monthly', () => {
    const g = investmentGrowth({ initial: 10_000, monthly: 0, rate: 0.07, years: 10 });
    expect(g.final).toBeCloseTo(10_000 * 1.07 ** 10, 6);
    expect(g.rows).toHaveLength(11);
  });
  it('matches the annuity formula for end-of-month contributions', () => {
    const g = investmentGrowth({ initial: 0, monthly: 100, rate: 0.06, years: 5 });
    const rm = 1.06 ** (1 / 12) - 1;
    expect(g.final).toBeCloseTo(100 * ((1 + rm) ** 60 - 1) / rm, 6);
    expect(g.contributed).toBe(6000);
  });
  it('earns one more month on each payment when contributions come first', () => {
    const end = investmentGrowth({ initial: 0, monthly: 100, rate: 0.06, years: 5 });
    const start = investmentGrowth({ initial: 0, monthly: 100, rate: 0.06, years: 5, atStart: true });
    expect(start.final).toBeCloseTo(end.final * 1.06 ** (1 / 12), 6);
  });
  it('takes a fee off the return and reports what it cost', () => {
    const g = investmentGrowth({ initial: 10_000, monthly: 0, rate: 0.07, years: 10, fee: 0.01 });
    expect(g.final).toBeCloseTo(10_000 * (1.07 * 0.99) ** 10, 6);
    expect(g.feeCost).toBeCloseTo(10_000 * (1.07 ** 10 - (1.07 * 0.99) ** 10), 6);
  });
});

describe('dividend reinvestment', () => {
  const base = { amount: 10_000, price: 100, yieldPct: 0.04, divGrowth: 0, priceGrowth: 0, years: 10 };
  it('with a flat price and dividend, taking cash is simple interest and reinvesting compounds quarterly', () => {
    const d = dividendReinvestment(base);
    expect(d.cash).toBeCloseTo(10_000 * (1 + 0.04 * 10), 6);
    expect(d.reinvested).toBeCloseTo(10_000 * 1.01 ** 40, 6);
    expect(d.advantage).toBeGreaterThan(0);
  });
  it('taxes each payment before it is reinvested', () => {
    const d = dividendReinvestment({ ...base, tax: 0.25 });
    expect(d.reinvested).toBeCloseTo(10_000 * 1.0075 ** 40, 6);
  });
  it('grows the payout per share once a year', () => {
    const d = dividendReinvestment({ ...base, years: 2, divGrowth: 0.1 });
    expect(d.rows[2].cashIncome).toBeCloseTo(d.rows[1].cashIncome * 1.1, 9);
  });
});

describe('position size', () => {
  it('sizes a long trade so the stop costs the stated share of the account', () => {
    const p = positionSize({ account: 50_000, riskPct: 0.01, entry: 100, stop: 95, target: 115 });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p).toMatchObject({ direction: 'long', shares: 100, value: 10_000, atRisk: 500, rewardRisk: 3, leveraged: false });
  });
  it('reads a stop above the entry as a short', () => {
    const p = positionSize({ account: 50_000, riskPct: 0.01, entry: 100, stop: 104 });
    expect(p.ok && p.direction).toBe('short');
    expect(p.ok && p.shares).toBe(125);
  });
  it('rounds shares down, never up past the budget', () => {
    const p = positionSize({ account: 10_000, riskPct: 0.02, entry: 33, stop: 30 });
    expect(p.ok && p.shares).toBe(66);
    expect(p.ok && p.atRisk).toBeLessThanOrEqual(200);
  });
  it('flags a target on the wrong side of the entry rather than a negative ratio', () => {
    const p = positionSize({ account: 10_000, riskPct: 0.01, entry: 100, stop: 95, target: 90 });
    expect(p.ok && p.rewardRisk).toBeNull();
    expect(p.ok && p.targetWarning).toMatch(/above the entry/);
  });
  it('refuses a stop at the entry', () => {
    expect(positionSize({ account: 10_000, riskPct: 0.01, entry: 100, stop: 100 }).ok).toBe(false);
  });
});

describe('annualised return', () => {
  it('turns a start and end into a compound annual rate', () => {
    const r = annualisedReturn({ start: 100, end: 200, years: 10 })!;
    expect(r.cagr).toBeCloseTo(2 ** 0.1 - 1, 12);
    expect(r.total).toBe(1);
    expect(r.doubling).toBeCloseTo(10, 9);
  });
  it('takes inflation out by division, not subtraction', () => {
    const r = annualisedReturn({ start: 100, end: 110, years: 1, inflation: 0.05 })!;
    expect(r.real).toBeCloseTo(1.1 / 1.05 - 1, 12);
  });
  it('has nothing to say about a zero start', () => {
    expect(annualisedReturn({ start: 0, end: 10, years: 1 })).toBeNull();
  });
});
