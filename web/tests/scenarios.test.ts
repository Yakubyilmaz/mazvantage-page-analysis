import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { buildScenarios } from '@/lib/scenarios';
import { modelById } from '@/lib/valuation-models';
import { median } from '@/lib/format';

const ROOT = path.resolve(import.meta.dirname, '..');
const snap = JSON.parse(readFileSync(path.join(ROOT, 'public/data/AAPL.json'), 'utf8'));
const sectorStats = JSON.parse(readFileSync(path.join(ROOT, 'public/data/sector-stats.json'), 'utf8'));

const report = (feeds = snap.feeds) => analyse(
  makeDataset('AAPL', Object.fromEntries(Object.entries(feeds).map(([k, v]) => [k, { status: 'ok', data: v }])) as any),
  { sectorStats, benchmarks: snap.extras.benchmarks, peerRatios: snap.extras.peerRatios },
);

describe('Apple’s cases', () => {
  const a = report();
  const s = buildScenarios(a);
  it('are ordered bear ≤ consensus ≤ bull', () => {
    expect(s.available).toBe(true);
    const { bear, base, bull } = s.cases!;
    expect(bear.value!).toBeLessThanOrEqual(base.value!);
    expect(base.value!).toBeLessThanOrEqual(bull.value!);
  });
  it('put the consensus case on the report’s own six DCFs, unchanged', () => {
    const own = s.cases!.base.perModel.map((m) => modelById(m.id).fairValue(a)?.value ?? null);
    expect(s.cases!.base.perModel.map((m) => m.value)).toEqual(own);
    expect(s.cases!.base.value).toBeCloseTo(median(own.filter((v): v is number => v != null))!, 9);
  });
  it('walk the bear path at the lowest published revenue, every year', () => {
    const last = a.forecast.rows.at(-1);
    expect(s.cases!.bear.revenueTo).toBe(last.revenueLow);
    expect(s.cases!.bull.revenueTo).toBe(last.revenueHigh);
  });
  it('carry the Street’s targets as published', () => {
    expect(s.targets).toEqual({ low: 245, consensus: 340.72, high: 400 });
  });
  it('do not move a single grade', () => {
    expect(report().scores.overall).toEqual(a.scores.overall);
  });
});

describe('a gap in the range', () => {
  it('blocks the cases and names the year, rather than filling it', () => {
    const est = snap.feeds.estimates.map((e: any, i: number) => (i === 0 ? { ...e, revenueHigh: null } : e));
    const s = buildScenarios(report({ ...snap.feeds, estimates: est }));
    expect(s.available).toBe(false);
    expect(s.why).toMatch(/FY2030/);
  });
  it('says so when there are no estimates at all', () => {
    const s = buildScenarios(report({ ...snap.feeds, estimates: [] }));
    expect(s.available).toBe(false);
    expect(s.why).toMatch(/No analyst estimates/);
  });
});
