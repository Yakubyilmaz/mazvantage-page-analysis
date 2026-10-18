/* Compliance changes and the Ideas track record (2026-10-13): the shared
   logic the browser uses today and the back end will import. */

import { describe, expect, it } from 'vitest';
import { diffLabels, direction, type LabelRecord } from '@/lib/compliance-changes';
import { trackRecord, type Period } from '@/lib/track-record';

const rec = (symbol: string, tone: LabelRecord['tone'], word = tone): LabelRecord => ({ symbol, tone, word, headline: word, at: '2026-10-01' });

describe('compliance changes', () => {
  it('ranks by tone, and never calls missing data a move', () => {
    expect(direction('good', 'bad')).toBe('worse');
    expect(direction('bad', 'warn')).toBe('better');
    expect(direction('good', 'muted')).toBe('other');
  });

  it('lists changes, worst first, and ignores symbols new to either side', () => {
    const prev = { A: rec('A', 'good'), B: rec('B', 'bad'), C: rec('C', 'warn', 'Mixed · 3 of 5'), D: rec('D', 'good') };
    const next = { A: rec('A', 'bad'), B: rec('B', 'good'), C: rec('C', 'warn', 'Mixed · 2 of 5'), D: rec('D', 'good'), E: rec('E', 'bad') };
    const changes = diffLabels(prev, next);
    expect(changes.map((c) => [c.symbol, c.direction])).toEqual([['A', 'worse'], ['B', 'better'], ['C', 'other']]);
  });
});

describe('trackRecord', () => {
  const periods: Period[] = [
    { from: '2025-01-01', to: '2025-07-01', members: [{ symbol: 'A', start: 100, end: 110 }, { symbol: 'B', start: 50, end: 45 }], benchmark: { symbol: 'SPY', start: 500, end: 525 } },
    { from: '2025-07-01', to: '2026-01-01', members: [{ symbol: 'A', start: 110, end: 132 }, { symbol: 'C', start: 20, end: null }], benchmark: { symbol: 'SPY', start: 525, end: 551.25 } },
  ];

  it('chains equal-weight periods against the benchmark over the same dates', () => {
    const r = trackRecord(periods)!;
    // period 1: (+10% − 10%) / 2 = 0; period 2: A +20%, C left out → +20%.
    expect(r.byPeriod.map((p) => p.portfolio)).toEqual([expect.closeTo(0, 9), expect.closeTo(0.2, 9)]);
    expect(r.portfolio).toBeCloseTo(0.2, 9);
    expect(r.benchmark).toBeCloseTo(0.1025, 9);
    expect(r.excess).toBeCloseTo(0.0975, 9);
    expect(r.missing).toBe(1);
    expect(r.annualised).toBeCloseTo(0.2, 2);
  });

  it('says nothing rather than something without a usable period', () => {
    expect(trackRecord([])).toBeNull();
    expect(trackRecord([{ ...periods[0], to: '2025-03-01' }])!.annualised).toBeNull();
  });
});
