/* What changed in a company's risk factors (2026-10-12). The reviews are
   hand-written from the two latest 10-Ks; these rules keep them to the
   boundary: linked filings, counts that add up, our words, short quotes. */

import { describe, expect, it } from 'vitest';
import { RISK_REVIEWS, riskReviewFor } from '@/lib/risk-factors';

describe.each(RISK_REVIEWS.map((r) => [r.symbol, r] as const))('the %s review', (_sym, rv) => {
  it('compares the two latest 10-Ks, linked on EDGAR, newer first', () => {
    for (const f of [rv.current, rv.previous]) expect(f.url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/[\w-]+\.htm$/);
    expect(rv.current.filed > rv.previous.filed).toBe(true);
    expect(rv.current.fiscalYear).toBe(rv.previous.fiscalYear + 1);
  });

  it('has counts that add up to the filings’ own', () => {
    const { sameHeading, reworded, added, dropped } = rv.counts;
    expect(sameHeading + reworded + added).toBe(rv.current.count);
    expect(sameHeading + reworded + dropped).toBe(rv.previous.count);
  });

  it('lists every new and dropped risk factor the counts report', () => {
    expect(rv.changes.filter((c) => c.kind === 'new').length).toBe(rv.counts.added);
    expect(rv.changes.filter((c) => c.kind === 'removed').length).toBe(rv.counts.dropped);
    expect(rv.changes.filter((c) => c.kind === 'reworded').length).toBeLessThanOrEqual(rv.counts.reworded);
  });

  it('quotes the company in fifteen words or fewer, and only where a change carries a quote', () => {
    for (const c of rv.changes) {
      if (c.quote) expect(c.quote.split(/\s+/).length, c.subject).toBeLessThanOrEqual(15);
    }
  });

  it('keeps each description short, in our words', () => {
    for (const c of rv.changes) {
      expect(c.what.split(/\s+/).length, c.subject).toBeLessThanOrEqual(75);
      expect(c.subject.length, c.subject).toBeLessThan(60);
    }
  });
});

describe('the lookup', () => {
  it('finds a review by symbol and returns null where there is none', () => {
    expect(riskReviewFor('AAPL')?.current.fiscalYear).toBe(2025);
    expect(riskReviewFor('ZZZZ')).toBeNull();
  });
});
