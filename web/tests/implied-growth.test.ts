/* The growth the price assumes (2026-10-13): Demand Discovery's reverse DCF,
   moved to every company's Valuation tab on annual statements. Pinned on the
   bundled AAPL and NVDA copies and on hand-built inputs. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { impliedGrowth } from '@/lib/demand-pricedin';
import { priceImpliedGrowth } from '@/lib/implied-growth';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const report = (sym: string) => {
  const snap = load(`${sym}.json`);
  return analyse(
    makeDataset(sym, Object.fromEntries(Object.entries(snap.feeds).map(([k, v]) => [k, { status: 'ok', data: v }])) as any),
    { sectorStats: load('sector-stats.json'), benchmarks: snap.extras.benchmarks },
  ) as any;
};

const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

describe('priceImpliedGrowth', () => {
  it('solves the same growth as the gate when both margins agree', () => {
    const r = priceImpliedGrowth({ marketCap: 2000, cash: 100, debt: 100, revenue: flat(6, 100), fcf: flat(6, 10) });
    expect(r.available).toBe(true);
    expect(r.enterpriseValue).toBe(2000);
    expect(r.implied).toBeCloseTo(impliedGrowth(2000, 100, 0.1)!, 6);
    expect(r.atLatest).toBeCloseTo(r.atThroughCycle!, 9);
  });

  it('reads the midpoint of the latest and the through-cycle margin', () => {
    const r = priceImpliedGrowth({ marketCap: 3000, cash: 0, debt: 0, revenue: flat(6, 100), fcf: [5, 5, 5, 5, 5, 20] });
    expect(r.marginLatest).toBeCloseTo(0.2);
    expect(r.marginThroughCycle).toBeCloseTo(0.05);
    expect(r.implied).toBeCloseTo((r.atLatest! + r.atThroughCycle!) / 2, 9);
    expect(r.atThroughCycle!).toBeGreaterThan(r.atLatest!);
  });

  it('needs four years for a through-cycle margin', () => {
    const r = priceImpliedGrowth({ marketCap: 1000, cash: 0, debt: 0, revenue: flat(3, 100), fcf: flat(3, 10) });
    expect(r.marginThroughCycle).toBeNull();
    expect(r.implied).toBeCloseTo(r.atLatest!, 9);
  });

  it('reads at least "Priced in" when the business has not made cash through the cycle', () => {
    const r = priceImpliedGrowth({ marketCap: 500, cash: 0, debt: 0, revenue: flat(6, 100), fcf: [-5, -5, -5, -5, -5, 15] });
    expect(r.noCycleCash).toBe(true);
    expect(r.level).toBe('aggressive');
  });

  it('states why when it cannot run, never a number', () => {
    expect(priceImpliedGrowth({ marketCap: 100, cash: 0, debt: 0, revenue: flat(5, 100), fcf: flat(5, 1), refuse: 'A bank.' }))
      .toMatchObject({ available: false, reason: 'A bank.', implied: null });
    expect(priceImpliedGrowth({ marketCap: 100, cash: null, debt: 0, revenue: flat(5, 100), fcf: flat(5, 1) }).available).toBe(false);
    expect(priceImpliedGrowth({ marketCap: 100, cash: 500, debt: 0, revenue: flat(5, 100), fcf: flat(5, 1) }).reason).toMatch(/Cash exceeds/);
    expect(priceImpliedGrowth({ marketCap: 100, cash: 0, debt: 0, revenue: flat(5, 100), fcf: flat(5, -1) }).available).toBe(false);
  });

  it('prints the past growth beside the ask', () => {
    const r = priceImpliedGrowth({ marketCap: 2000, cash: 0, debt: 0, revenue: [100, 110, 121, 133.1, 146.41, 161.051], fcf: flat(6, 15) });
    expect(r.pastYears).toBe(5);
    expect(r.pastGrowth).toBeCloseTo(0.1, 6);
  });
});

describe('on the bundled reports', () => {
  it('reads AAPL and NVDA', () => {
    for (const sym of ['AAPL', 'NVDA']) {
      const a = report(sym);
      expect(a.impliedGrowth.available, sym).toBe(true);
      expect(a.impliedGrowth.implied, sym).toBeGreaterThan(-0.5);
      expect(a.impliedGrowth.implied, sym).toBeLessThan(2);
      expect(a.impliedGrowth.years, sym).toBeGreaterThanOrEqual(4);
    }
  });
});
