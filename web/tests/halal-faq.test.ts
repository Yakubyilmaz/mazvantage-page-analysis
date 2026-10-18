/* The halal FAQ under the Shariah tab (2026-10-18): each answer is the
   company's own figures, and the structured data is the page's words. */

import { afterEach, describe, expect, it } from 'vitest';
import { faqJsonLd, halalFaq, standardLine, type FaqSubject } from '@/lib/halal-faq';
import { labelFromQuick, quickRows } from '@/lib/halal-label';
import type { QuickInputs } from '@/lib/shariah';
import { loadStockSummary } from '@/lib/server/stock-summary';
import { POPULAR_HALAL_CHECKS, halalCheckHref, halalCheckLabel } from '@/lib/popular-halal';

/** Every standard measures on 1,000 of market value or assets unless overridden. */
const inputs = (o: Partial<QuickInputs> = {}): QuickInputs => ({
  asOf: '2026-01-31', totalDebt: 100, cashIbs: 50, cash: 20, longTermInvestments: 0, ar: 30, totalAssets: 1000,
  revenue: 500, interestIncome: 5, taxRate: 0.2, epsDiluted: 2, dilutedShares: 100, dps: 1,
  mcap: { spot: 1000, m12: 1000, m24: 1000, m36: 1000, from: '2023-01-31', to: '2026-01-31', points: 37 },
  sector: 'Technology', industry: 'Software', ...o,
});

const subject = (inp: QuickInputs, name = 'Acme Corp'): FaqSubject => {
  const rows = quickRows(inp);
  return { symbol: 'ACME', name, label: labelFromQuick(rows, name), rows, inputs: inp, asOf: inp.asOf };
};
const ask = (s: FaqSubject, start: string) => halalFaq(s).find((it) => it.q.startsWith(start));

describe('halalFaq', () => {
  it('answers a passing company with its ratios, its margin and its purification', () => {
    const s = subject(inputs());
    const faq = halalFaq(s);
    expect(faq[0]).toMatchObject({ q: 'Is Acme Corp (ACME) halal to invest in?' });
    expect(faq[0].a[0]).toMatch(/^Yes\. Acme Corp passes all 5/);
    expect(faq[0].a[1]).toBe('Read from the balance sheet of 2026-01-31.');

    const which = ask(s, 'Which Shariah standards')!;
    expect(which.list).toHaveLength(5);
    expect(which.list![0]).toBe('AAOIFI: passes — debt 10% of 12-month market cap (limit 30%); cash and interest-bearing investments 5% of 12-month market cap (limit 30%); interest income 1% of revenue (limit 5%).');

    // Debt at 10% of a 30% limit is the tightest market-value test (Dow Jones and AAOIFI tie; the first wins).
    const close = ask(s, 'How close')!;
    expect(close.a[0]).toMatch(/AAOIFI's limit on debt: 10% of 12-month market cap, against 30%/);
    expect(close.a[0]).toMatch(/would have to fall about 67% to cross it/);

    // Interest 1% of revenue: 1.00 of dividends carries 0.01 to purify.
    expect(ask(s, 'Do I need to purify')!.a[0]).toMatch(/1% of revenue.*about US\$0\.01 of the US\$1\.00 per share it paid/);
    expect(faq.at(-1)!.q).toBe('Is this a fatwa?');
  });

  it('explains a split verdict, and what the nearest failing standard would need', () => {
    // Debt of 320: over 30% (AAOIFI, Dow Jones), under 33% (S&P, FTSE) and MSCI's 33.33% of assets.
    const s = subject(inputs({ totalDebt: 320 }));
    expect(s.label.tone).toBe('warn');
    expect(halalFaq(s)[0].a[0]).toMatch(/^It depends on the standard you follow\./);
    const why = ask(s, 'Why do the standards disagree')!;
    expect(why.a[0]).toBe('It fails under AAOIFI, on debt at 32% of 12-month market cap against a 30% limit; and under Dow Jones, on debt at 32% of 24-month market cap against a 30% limit. It passes S&P Global, FTSE and MSCI.');
    const fix = ask(s, 'What would it take')!;
    expect(fix.a[0]).toBe('The nearest is AAOIFI. AAOIFI measures its debt at 32% of 12-month market cap, against a 30% limit. It would need its debt to fall about 6%, or its 12-month market cap to rise about 7%.');
    expect(ask(s, 'How close')).toBeUndefined();
  });

  it('gives an excluded business its reason and nothing a ratio could change', () => {
    const s = subject(inputs({ industry: 'Banks - Diversified', sector: 'Financial Services' }));
    const qs = halalFaq(s).map((it) => it.q);
    expect(qs).toEqual([
      'Is Acme Corp (ACME) halal to invest in?', 'Why is Acme Corp not halal?',
      "How often is Acme Corp's halal status checked?", 'Is this a fatwa?',
    ]);
    expect(halalFaq(s)[1].a[0]).toMatch(/line of business \(bank\) is excluded/);
  });

  it('says so when there is nothing to screen, and invents nothing', () => {
    const empty = inputs({ totalDebt: null, cashIbs: null, ar: null, totalAssets: null, interestIncome: null,
      mcap: { spot: null, m12: null, m24: null, m36: null, from: null, to: null, points: 0 } });
    const s = subject(empty);
    expect(s.label.tone).toBe('muted');
    expect(halalFaq(s).map((it) => it.q)).toEqual([
      'Is Acme Corp (ACME) halal to invest in?', "How often is Acme Corp's halal status checked?", 'Is this a fatwa?',
    ]);
  });

  it('gives purification as a share, and in money only with a dividend on record', () => {
    expect(ask(subject(inputs({ interestIncome: null })), 'Do I need')!.a[0]).toMatch(/reports no interest income/);
    // No dividend history is not "no dividend": the share still holds, the money is left out.
    const none = ask(subject(inputs({ dps: 0 })), 'Do I need')!.a[0];
    expect(none).toMatch(/that is the share of each dividend to give to charity\.$/);
    expect(none).not.toMatch(/US\$/);
  });

  it('marks a standard it could not measure as not measured', () => {
    const rows = quickRows(inputs({ totalAssets: null }));
    expect(standardLine(rows[4])).toMatch(/^MSCI: not measured — /);
  });

  it('builds structured data from exactly the printed words', () => {
    const faq = halalFaq(subject(inputs()));
    const ld = faqJsonLd(faq);
    expect(ld.mainEntity.map((q) => q.name)).toEqual(faq.map((it) => it.q));
    expect(ld.mainEntity[1].acceptedAnswer.text).toContain(faq[1].list![0]);
  });
});

describe('on the bundled companies', () => {
  const key = process.env.FMP_API_KEY;
  afterEach(() => { process.env.FMP_API_KEY = key; });

  it('answers the quick screen for NVDA and the researched screen for AAPL', async () => {
    delete process.env.FMP_API_KEY;
    const nvda = (await loadStockSummary('NVDA'))!;
    const nq = halalFaq(nvda).map((it) => it.q);
    expect(nq[0]).toBe('Is NVIDIA Corporation (NVDA) halal to invest in?');
    expect(nq).toContain('Which Shariah standards does NVIDIA Corporation pass?');

    const aapl = (await loadStockSummary('AAPL'))!;
    const aq = halalFaq(aapl);
    expect(aq.map((it) => it.q)).toContain('What did the researched screen of Apple Inc. find?');
    expect(aq.some((it) => it.q.startsWith('How close') || it.q.startsWith('What would it take'))).toBe(false);
  });
});

describe('the footer links', () => {
  it('reads like the search and opens the Shariah tab', () => {
    const nvda = POPULAR_HALAL_CHECKS.find((c) => c.symbol === 'NVDA')!;
    expect(halalCheckLabel(nvda)).toBe('Is Nvidia stock halal?');
    expect(halalCheckHref(nvda)).toBe('/stock/NVDA/shariah-compliance');
    expect(new Set(POPULAR_HALAL_CHECKS.map((c) => c.symbol)).size).toBe(POPULAR_HALAL_CHECKS.length);
  });
});
