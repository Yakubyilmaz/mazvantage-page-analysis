/* The answer under the Shariah tab's question (2026-10-18): the verdict in
   its first word, the date, the classification and the method, then why. */

import { describe, expect, it } from 'vitest';
import { answerTone, halalAnswer, labelFromIssuer, monthYear, type HalalLabel } from '@/lib/halal-label';

const quick = (over: Partial<HalalLabel>): HalalLabel => ({
  tone: 'good', word: '', headline: '', sentence: '', source: 'quick', passed: 5, failed: 0, total: 5, excluded: null,
  passing: ['AAOIFI', 'S&P', 'Dow Jones', 'FTSE', 'MSCI'], failing: [], ...over,
});

describe('halalAnswer', () => {
  it('Apple, from its researched screen: read on the AAOIFI Shariah Standard 21 row, in the table’s figures', () => {
    const label = labelFromIssuer('AAPL')!;
    expect(halalAnswer(label, 'Apple Inc.', 'AAPL', null)).toBe(
      'Yes. As of October 2026, Apple Inc. (AAPL) is classified as HALAL by Maz Vantage under AAOIFI Shariah Standard 21. '
      + 'Its interest-bearing debt is 2.04% and its cash and interest-bearing securities 3.5% of its 12-month average market value, '
      + 'both under the 30% limit; its non-permissible income is 3.68% of revenue, under the 5% limit.',
    );
    expect(answerTone(label)).toBe('good');
    // The label reads the preferred scenario, which every other surface prints. Since cash
    // is tested on the 12-month average market cap (2026-10-18), it agrees with the answer.
    expect(label.tone).toBe('good');
    expect(label.word).toBe('Halal · AAOIFI-based');
  });

  it('quick screen, every standard passed', () => {
    expect(halalAnswer(quick({}), 'Acme', 'ACME', '2026-10-09')).toBe(
      'Yes. As of October 2026, Acme (ACME) is classified as HALAL by Maz Vantage: it passes all 5 published Shariah screening standards it was tested against (AAOIFI, S&P, Dow Jones, FTSE and MSCI).',
    );
  });

  it('quick screen, mixed, and a standard that could not be measured', () => {
    const l = quick({ tone: 'warn', passed: 3, failed: 1, passing: ['AAOIFI', 'S&P', 'FTSE'], failing: ['MSCI'] });
    expect(halalAnswer(l, 'Acme', 'ACME', '2026-10-09')).toBe(
      'It depends on the standard you follow. As of October 2026, Acme (ACME) passes 3 of 5 published Shariah screening standards checked by Maz Vantage: '
      + 'it passes AAOIFI, S&P and FTSE, and fails MSCI; one could not be measured from the balance sheet available.',
    );
  });

  it('quick screen, failed, excluded and unscreenable', () => {
    expect(halalAnswer(quick({ tone: 'bad', passed: 0, failed: 5, passing: [], failing: ['AAOIFI', 'MSCI'] }), 'Acme', 'ACME', null))
      .toMatch(/^No\. Acme \(ACME\) is classified as NOT HALAL by Maz Vantage: it fails every/);
    expect(halalAnswer(quick({ tone: 'bad', excluded: 'bank' }), 'Acme', 'ACME', '2026-01-05'))
      .toMatch(/^No\. As of January 2026, Acme \(ACME\) is classified as NOT HALAL by Maz Vantage: its line of business \(bank\) is excluded/);
    expect(halalAnswer(quick({ tone: 'muted', passed: 0 }), 'Acme', 'ACME', null)).toMatch(/^Not yet\. Acme \(ACME\) cannot be screened/);
  });

  it('dates read as a month', () => {
    expect(monthYear('2026-10-07')).toBe('October 2026');
  });
});
