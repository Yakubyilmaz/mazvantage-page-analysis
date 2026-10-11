/* The bull and bear case from the newest quarter: every line on one side,
   the dead bands left out, the year-ago pairing guarded, and the real
   capture producing a case for every chain company. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASE_BANDS, latestQuarterCase } from '@/lib/demand-case';
import { readCapture, type Quarter } from '@/lib/demand-data';
import { CHAINS } from '@/lib/demand-chains';

const q = (date: string, over: Partial<Quarter> = {}): Quarter => ({
  date, filed: date, rev: 100, gp: 40, oi: 20, ni: 15, inv: 50, cl: 10, cash: 50, debt: 0, ocf: 25, capex: 5, sh: 10, ...over,
});
const year = ['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31', '2026-03-31'];

describe('the newest quarter, both ways', () => {
  it('argues for a quarter that grew, widened its margins and pulled in prepayments', () => {
    const qs = [...year.slice(0, 4).map((d) => q(d)), q(year[4], { rev: 130, gp: 60, oi: 35, cl: 20, inv: 40 })];
    const c = latestQuarterCase(qs)!;
    expect(c.bull.some((t) => t.startsWith('Revenue $130m, up 30%'))).toBe(true);
    expect(c.bull.some((t) => t.startsWith('Gross margin'))).toBe(true);
    expect(c.bull.some((t) => t.startsWith('Customer prepayments'))).toBe(true);
    expect(c.bull.some((t) => t.startsWith('Inventory covers'))).toBe(true);
    expect(c.bear).toEqual([]);
  });

  it('argues against a quarter that shrank, lost money and burned cash', () => {
    const qs = [...year.slice(0, 4).map((d) => q(d)), q(year[4], { rev: 80, gp: 20, oi: -5, ni: -8, ocf: 2, capex: 12, inv: 70 })];
    const c = latestQuarterCase(qs)!;
    expect(c.bear.some((t) => t.includes('down 20% on the same quarter'))).toBe(true);
    expect(c.bear.some((t) => t.startsWith('A net loss of $8.0m'))).toBe(true);
    expect(c.bear.some((t) => t.startsWith('Spent $10.0m more'))).toBe(true);
    expect(c.bear.some((t) => t.includes('goods are building up'))).toBe(true);
    expect(c.bull).toEqual([]);
  });

  it('leaves a flat quarter out of both columns', () => {
    const qs = [...year.slice(0, 4).map((d) => q(d)), q(year[4], { rev: 102, gp: 40.8, oi: 20.4, ocf: 10 })];
    const c = latestQuarterCase(qs)!;
    expect(c.bull.concat(c.bear).some((t) => t.startsWith('Revenue'))).toBe(false);
    expect(c.bull.concat(c.bear).some((t) => t.includes('margin'))).toBe(false);
    expect(CASE_BANDS.revenueFor).toBeGreaterThan(0.02);
  });

  it('does not pair quarters that are not a year apart', () => {
    // A missing year in the middle: four rows back is two years back.
    const qs = [q('2024-03-31'), q('2025-06-30'), q('2025-09-30'), q('2025-12-31'), q('2026-03-31', { rev: 200 })];
    const c = latestQuarterCase(qs)!;
    expect(c.bull.concat(c.bear).some((t) => t.includes('same quarter a year earlier'))).toBe(false);
    expect(latestQuarterCase([])).toBeNull();
  });

  it('reads a case for every revenue-layer company in the capture', () => {
    const capture = readCapture(JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/demand-capture.json'), 'utf8')));
    const symbols = CHAINS.flatMap((ch) => ch.layers.filter((l) => l.metric === 'rev').flatMap((l) => l.members.map((m) => m.symbol)));
    for (const s of new Set(symbols)) {
      const co = capture.companies[s];
      expect(co, s).toBeTruthy();
      const c = latestQuarterCase(co.quarters)!;
      expect(c.quarter).toBe(co.quarters[co.quarters.length - 1].date);
      expect(c.bull.length + c.bear.length, s).toBeGreaterThan(0);
    }
  });
});
