/* Purification worked out automatically (2026-10-13). Its zakat cases went with
   the page they tested (2026-10-18 merge); zakat is tested in `zakat.test.ts`. */

import { describe, expect, it } from 'vitest';
import { autoImpure } from '@/lib/purification';
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
