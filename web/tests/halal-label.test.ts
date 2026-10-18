/* The halal label (2026-10-13): one reading for the verdict card, the
   server summary, the portfolio column and the fund holdings check. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { halalLabel, labelFromIssuer, labelFromQuick } from '@/lib/halal-label';
import { SHARIAH_STANDARDS, type QuickResult, type QuickState } from '@/lib/shariah';
import { loadStockSummary } from '@/lib/server/stock-summary';

const row = (state: QuickState, excluded: string | null = null): QuickResult =>
  ({ std: SHARIAH_STANDARDS[0], base: 1, basis: '', averaged: true, excluded, tests: [], state, note: '' });
const rows = (...s: QuickState[]) => s.map((x) => row(x));

describe('labelFromQuick', () => {
  it('counts, and says "all" only when every standard was measured and passed', () => {
    expect(labelFromQuick(rows('pass', 'pass', 'pass', 'pass', 'pass'))).toMatchObject({ tone: 'good', headline: 'Passes all 5 standards', word: 'Halal · 5 of 5' });
    expect(labelFromQuick(rows('pass', 'pass', 'pass', 'pass', 'na'))).toMatchObject({ tone: 'warn', headline: 'Passes 4 of 5 standards' });
    expect(labelFromQuick(rows('pass', 'fail', 'fail', 'pass', 'pass'))).toMatchObject({ tone: 'warn', passed: 3, failed: 2 });
    expect(labelFromQuick(rows('fail', 'fail', 'fail', 'fail', 'na'))).toMatchObject({ tone: 'bad', headline: 'Fails all 5 standards' });
    expect(labelFromQuick(rows('na', 'na', 'na', 'na', 'na'))).toMatchObject({ tone: 'muted', headline: 'Cannot be screened' });
  });

  it('lets an excluded activity decide, whatever the ratios', () => {
    const l = labelFromQuick([row('fail', 'bank'), row('fail', 'bank')], 'A Bank');
    expect(l).toMatchObject({ tone: 'bad', headline: 'Excluded on activity', excluded: 'bank' });
    expect(l.sentence).toMatch(/^A Bank is not Shariah-compliant/);
  });
});

describe('the two sources', () => {
  const snap = (sym: string) => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', 'public/data', `${sym}.json`), 'utf8'));
  const loaded = (sym: string) => {
    const s = snap(sym);
    const ds = makeDataset(sym, Object.fromEntries(Object.entries(s.feeds).map(([k, v]) => [k, { status: 'ok', data: v }])) as any);
    const p = ds.get('profile');
    return { facts: { symbol: sym, name: p.companyName, sector: p.sector, industry: p.industry, marketCap: p.marketCap }, ds };
  };

  it('reads a researched screen where one exists, at the preferred scenario', () => {
    const l = halalLabel(loaded('AAPL'));
    expect(l.source).toBe('researched');
    expect(l).toEqual(labelFromIssuer('AAPL'));
    expect(l.version).toBe('v5.0');
  });

  it('reads the quick screen everywhere else', () => {
    const l = halalLabel(loaded('NVDA'));
    expect(l.source).toBe('quick');
    expect(l.total).toBe(5);
    expect(l.passed + l.failed).toBeLessThanOrEqual(5);
  });
});

describe('the server summary without live data', () => {
  const key = process.env.FMP_API_KEY;
  afterEach(() => { process.env.FMP_API_KEY = key; });

  it('falls back to the bundled copy, and to nothing for a company without one', async () => {
    delete process.env.FMP_API_KEY;
    const s = await loadStockSummary('nvda');
    expect(s).toMatchObject({ symbol: 'NVDA', name: 'NVIDIA Corporation', source: 'snapshot' });
    expect(s!.label.source).toBe('quick');
    expect(await loadStockSummary('ZZZZ')).toBeNull();
    expect(await loadStockSummary('../etc')).toBeNull();
  });
});
