/* Purification worked out automatically, and zakat on shares (2026-10-13). */

import { describe, expect, it } from 'vitest';
import { autoImpure } from '@/lib/purification';
import { ZAKAT_RATE, zakatLine, zakatTotal, zakatablePerShare } from '@/lib/zakat';
import { AAPL, screenIssuer } from '@/lib/shariah-issuers';

describe('autoImpure', () => {
  it('uses the researched screen first, as after-tax impure income over earnings', () => {
    const r = autoImpure('AAPL', { interestIncome: 1, netIncome: 1 })!;
    expect(r.source).toBe('researched');
    const p = screenIssuer(AAPL).scenarios.B.purification;
    expect(r.percent).toBeCloseTo((p.perShare / AAPL.income.epsDiluted) * 100, 9);
  });

  it('otherwise reads after-tax interest over net income, not over revenue', () => {
    const r = autoImpure('ZZZ', { interestIncome: 100, netIncome: 1000, incomeBeforeTax: 1250, incomeTaxExpense: 250, revenue: 50_000, fiscalYear: '2025' })!;
    expect(r.source).toBe('interest');
    expect(r.percent).toBeCloseTo(8, 9); // 100 × 0.8 / 1000
    expect(r.detail).toMatch(/2025/);
  });

  it('returns nothing rather than zero when there is no interest line or the year was a loss', () => {
    expect(autoImpure('ZZZ', { interestIncome: 0, netIncome: 1000 })).toBeNull();
    expect(autoImpure('ZZZ', { interestIncome: 10, netIncome: -5 })).toBeNull();
    expect(autoImpure('ZZZ', null)).toBeNull();
  });
});

describe('zakat', () => {
  const balance = { cashAndShortTermInvestments: 300, netReceivables: 100, inventory: 100, totalCurrentLiabilities: 200 };

  it('charges trade shares on their market value', () => {
    const l = zakatLine({ symbol: 'X', shares: 10, intent: 'trade' }, { price: 50, balance, sharesOutstanding: 100 });
    expect(l.base).toBe(500);
    expect(l.zakat).toBeCloseTo(12.5);
  });

  it('charges long-term shares on the zakatable assets per share, liabilities deducted only when asked', () => {
    expect(zakatablePerShare(balance, 100)).toBe(5);
    expect(zakatablePerShare(balance, 100, { deductCurrentLiabilities: true })).toBe(3);
    const l = zakatLine({ symbol: 'X', shares: 10, intent: 'hold' }, { price: 50, balance, sharesOutstanding: 100 });
    expect(l.base).toBe(50);
    expect(l.zakat).toBeCloseTo(1.25);
  });

  it('uses the solar rate when asked', () => {
    const l = zakatLine({ symbol: 'X', shares: 10, intent: 'trade' }, { price: 100, balance: null, sharesOutstanding: null }, { year: 'solar' });
    expect(l.zakat).toBeCloseTo(1000 * ZAKAT_RATE.solar);
    expect(ZAKAT_RATE.solar).toBeCloseTo(0.025 * 365.25 / 354.37, 4);
  });

  it('leaves a line out, and says so, rather than guessing', () => {
    const noSheet = zakatLine({ symbol: 'X', shares: 10, intent: 'hold' }, { price: 50, balance: null, sharesOutstanding: 100 });
    expect(noSheet.zakat).toBeNull();
    expect(noSheet.note).toMatch(/left out/);
    const noShares = zakatLine({ symbol: 'Y', shares: null, intent: 'trade' }, { price: 50, balance, sharesOutstanding: 100 });
    const t = zakatTotal([noSheet, noShares, zakatLine({ symbol: 'Z', shares: 2, intent: 'trade' }, { price: 100, balance: null, sharesOutstanding: null })]);
    expect(t).toMatchObject({ counted: 1, missing: 2 });
    expect(t.zakat).toBeCloseTo(5);
  });
});
