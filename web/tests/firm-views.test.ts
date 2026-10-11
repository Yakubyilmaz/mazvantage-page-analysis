/* What the firms are publishing: consensus years, targets, peers, chains and
   the letters a company page lists. Checked on the bundled AAPL capture where
   the shape matters. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chainsFor, consensusYears, houseViews, lettersFor, median, peerForecast, peerSymbols, reportedYears, sectorTopics, spread, targetWindows,
} from '@/lib/firm-views';
import type { Letter } from '@/lib/letters';

const AAPL = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/AAPL.json'), 'utf8'));
const asOf = AAPL.capturedAt as string;

describe('consensus forecasts', () => {
  it('keeps only fiscal years still ahead, oldest first', () => {
    const years = consensusYears(AAPL.feeds.estimates, asOf);
    expect(years.length).toBeGreaterThan(0);
    expect(years.every((y) => y.date >= asOf)).toBe(true);
    expect([...years].sort((a, b) => a.date.localeCompare(b.date))).toEqual(years);
  });

  it('grows the first forecast year from the filed year, later ones from the consensus before', () => {
    const reported = reportedYears(AAPL.feeds.income);
    const years = consensusYears(AAPL.feeds.estimates, asOf, 3, reported);
    const filed = reported.sort((a, b) => b.date.localeCompare(a.date))[0];
    // The saved feed starts at the year in progress: nothing in it to compare with.
    expect(consensusYears(AAPL.feeds.estimates, asOf)[0].revenueGrowth).toBeNull();
    expect(years[0].revenueGrowth).toBeCloseTo(years[0].revenue! / filed.revenue! - 1, 10);
    expect(years[1].revenueGrowth).toBeCloseTo(years[1].revenue! / years[0].revenue! - 1, 10);
  });

  it('reads nothing from nothing', () => {
    expect(consensusYears(null, asOf)).toEqual([]);
    expect(spread(null, 1, 2)).toBeNull();
    expect(spread(100, 90, 120)).toBeCloseTo(0.3);
  });
});

describe('price targets', () => {
  it('turns the summary into windows against the price, dropping empty ones', () => {
    const w = targetWindows({ lastMonthAvgPriceTarget: 110, lastMonthCount: 2, lastQuarterAvgPriceTarget: 90, lastQuarterCount: 0, lastYearAvgPriceTarget: 120, lastYearCount: 9 }, 100);
    expect(w.map((x) => x.label)).toEqual(['Last month', 'Last year']);
    expect(w[0].upside).toBeCloseTo(0.1);
    expect(targetWindows(AAPL.feeds.targetSummary, null).every((x) => x.upside === null)).toBe(true);
  });
});

describe('peers', () => {
  it('lists peers without the company itself, capped', () => {
    expect(peerSymbols([{ symbol: 'aapl' }, { symbol: 'MSFT' }, { symbol: 'MSFT' }, { symbol: 'DELL' }], 'AAPL', 1)).toEqual(['MSFT']);
    expect(peerSymbols(null, 'AAPL')).toEqual([]);
  });

  it('reads a peer’s next fiscal year and takes a median', () => {
    const f = peerForecast('AAPL', AAPL.feeds.estimates, asOf);
    expect(f.year! >= asOf).toBe(true);
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([null])).toBeNull();
  });
});

describe('the industry', () => {
  it('finds the Demand Discovery chains a company sits in', () => {
    expect(chainsFor('MU').map((m) => m.layer)).toContain('memory');
    expect(chainsFor('AAPL')).toEqual([]);
  });

  it('lists documents that name the company before sector outlooks, and no other fund’s letter', () => {
    const doc = (id: string, over: Partial<Letter>): Letter => ({
      id, firm: 'blackrock', kind: 'outlook', title: id, date: '2026-01-01', url: 'https://example.org', format: 'web', topics: [], regions: ['global'], ...over,
    });
    const list = [
      doc('ai-outlook', { topics: ['ai'], date: '2026-06-01' }),
      doc('ai-letter', { kind: 'letter', topics: ['ai'], date: '2026-07-01' }),
      doc('names-it', { kind: 'letter', date: '2025-01-01', mentions: [{ name: 'Apple', ticker: 'AAPL', action: 'bought' }] }),
      doc('energy', { topics: ['energy'] }),
    ];
    const hits = lettersFor('AAPL', 'Technology', 6, list);
    expect(hits.map((h) => h.letter.id)).toEqual(['names-it', 'ai-outlook']);
    expect(hits[0].why).toBe('names it');
    expect(sectorTopics('Nonsense')).toEqual([]);
  });

  it('puts a read view ahead of a bare mention, and cuts the sector reading once the company is named', () => {
    const doc = (id: string, over: Partial<Letter>): Letter => ({
      id, firm: 'blackrock', kind: 'outlook', title: id, date: '2026-01-01', url: `https://example.org/${id}`, format: 'web', topics: ['ai'], regions: ['global'], ...over,
    });
    const list = [
      doc('bare', { kind: 'letter', date: '2026-09-01', mentions: [{ name: 'Apple', ticker: 'AAPL', action: 'discussed' }] }),
      doc('read', { kind: 'letter', date: '2026-01-01', mentions: [{ name: 'Apple', ticker: 'AAPL', action: 'discussed', stance: 'positive', view: 'Likes it.' }] }),
      ...['s1', 's2', 's3', 's4', 's5'].map((id) => doc(id, {})),
    ];
    const hits = lettersFor('AAPL', 'Technology', 6, list);
    expect(hits.filter((h) => h.why === 'names it').map((h) => h.letter.id)).toEqual(['read', 'bare']);
    expect(hits[0].mention?.view).toBe('Likes it.');
    expect(hits.filter((h) => h.why === 'sector')).toHaveLength(3);
  });

  it('finds the public house view of a rating firm, never another firm', () => {
    const doc = (id: string, firm: string, date: string): Letter => ({
      id, firm, kind: 'outlook', title: id, date, url: `https://example.org/${id}`, format: 'web', topics: [], regions: ['global'],
    });
    const list = [doc('ms-old', 'ms', '2026-01-01'), doc('ms-new', 'ms', '2026-09-01'), doc('gs-1', 'gs', '2026-08-01'), doc('other', 'blackrock', '2026-09-30')];
    const views = houseViews(['Morgan Stanley', 'Goldman Sachs', 'Evercore ISI Group', 'B of A Securities'], list);
    expect(views.map((v) => v.letter.id)).toEqual(['ms-new', 'gs-1']);
    expect(views[0].rater).toBe('Morgan Stanley');
  });
});
