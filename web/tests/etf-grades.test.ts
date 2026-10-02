import { describe, expect, it } from 'vitest';
import { factsOf, gradeGroup, ranks, riskOf, type FundFacts } from '@/lib/etf-grades';

const fund = (symbol: string, f: Partial<FundFacts> = {}): FundFacts => ({
  symbol, expenseRatio: null, aum: null, dollarVolume: null, volatility: null, drawdown: null,
  yieldTtm: null, pays: null, m3: null, m6: null, y1: null, ...f,
});

describe('ranking within a group', () => {
  it('puts the best at 1 and the worst at 0, either way round', () => {
    expect(ranks([3, 1, 2], 'high')).toEqual([1, 0, 0.5]);
    expect(ranks([3, 1, 2], 'low')).toEqual([0, 1, 0.5]);
  });
  it('gives tied funds the same position and leaves a missing one out', () => {
    expect(ranks([1, 1, 3, null], 'high')).toEqual([0.25, 0.25, 1, null]);
  });
});

describe('a group of funds', () => {
  const group = ['A', 'B', 'C', 'D', 'E'].map((s, i) => fund(s, {
    expenseRatio: [0.03, 0.1, 0.2, 0.4, 0.9][i], aum: 1e9 * (i + 1), dollarVolume: 1e7 * (i + 1),
    pays: i !== 2, yieldTtm: i === 2 ? null : 0.01 * (i + 1), m3: i, m6: i, y1: i,
  }));
  const g = gradeGroup(group);
  it('grades the cheapest fund highest on expenses', () => {
    expect(g.get('A')!.expenses.grade).toBe(5);
    expect(g.get('E')!.expenses.grade).toBe(0);
    expect(g.get('A')!.expenses.letter).toBe('A');
  });
  it('does not grade a fund that paid nothing on dividends, and ranks the rest among payers', () => {
    expect(g.get('C')!.dividends.grade).toBeNull();
    expect(g.get('C')!.dividends.why).toMatch(/paid no distribution/);
    // Four payers, so only four are ranked — fewer than five, so none is graded.
    expect(g.get('E')!.dividends.grade).toBeNull();
    expect(g.get('E')!.dividends.why).toMatch(/needs 5/);
  });
  it('refuses a grade when fewer than five funds have the figure', () => {
    const small = gradeGroup(group.slice(0, 4));
    expect(small.get('A')!.expenses.grade).toBeNull();
    expect(small.get('A')!.expenses.peers).toBe(4);
  });
});

describe('the facts', () => {
  it('measures volatility and the deepest fall from a run of closes', () => {
    const flat = Array.from({ length: 200 }, () => 100);
    expect(riskOf(flat)).toEqual({ volatility: 0, drawdown: 0 });
    const fall = [...Array.from({ length: 100 }, () => 100), ...Array.from({ length: 100 }, () => 80)];
    expect(riskOf(fall).drawdown).toBeCloseTo(0.2, 12);
    expect(riskOf(flat.slice(0, 50)).volatility).toBeNull();
  });
  it('sums a year of distributions over the price, and nothing older', () => {
    const now = new Date('2026-10-01T00:00:00Z').getTime();
    const f = factsOf('X', {
      info: { expenseRatio: 0.09, assetsUnderManagement: 5e9, avgVolume: 1e6 },
      dividends: [{ date: '2026-09-15', adjDividend: 0.5 }, { date: '2026-03-15', adjDividend: 0.5 }, { date: '2025-06-15', adjDividend: 9 }],
      prices: null,
      row: { price: 50, m3: 1, m6: 2, y1: 3 },
    }, now);
    expect(f.yieldTtm).toBeCloseTo(0.02, 12);
    expect(f.pays).toBe(true);
    expect(f.dollarVolume).toBe(5e7);
  });
  it('reads an unknown dividend record as unknown, not as a fund that pays nothing', () => {
    const f = factsOf('X', { info: null, dividends: null, prices: null, row: { price: 10 } });
    expect(f.pays).toBeNull();
  });
});
