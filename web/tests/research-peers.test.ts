/* The Research tab's quant rating and peer comparison (2026-10-09), on the
   bundled AAPL copy: every chosen ratio is graded, the peer columns use one
   definition for every company, ranks count from the best, and the prose
   quotes what the tables print. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { PICKS, comparison, quantPeerProse } from '@/lib/research-peers';

const ROOT = path.resolve(import.meta.dirname, '..');
const snap = JSON.parse(readFileSync(path.join(ROOT, 'public/data/AAPL.json'), 'utf8'));
const sectorStats = JSON.parse(readFileSync(path.join(ROOT, 'public/data/sector-stats.json'), 'utf8'));

const a: any = analyse(
  makeDataset('AAPL', Object.fromEntries(Object.entries(snap.feeds).map(([k, v]) => [k, { status: 'ok', data: v }])) as any),
  {
    sectorStats, benchmarks: snap.extras.benchmarks,
    peerRatios: snap.extras.peerRatios, peerGrowth: snap.extras.peerGrowth, peerMetrics: snap.extras.peerMetrics,
  },
);
const cmp = comparison(a);
const row = (id: string) => cmp.rows.find((r) => r.pick.id === id)!;

describe('the comparison', () => {
  it('reads every chosen ratio against the sector', () => {
    for (const r of cmp.rows) {
      expect(r.graded.value, r.pick.id).not.toBeNull();
      expect(r.graded.median, r.pick.id).not.toBeNull();
    }
  });

  it('puts the company first and the six bundled peers after it', () => {
    expect(cmp.companies.map((c) => c.symbol)[0]).toBe('AAPL');
    expect(cmp.companies).toHaveLength(7);
    expect(cmp.rows.every((r) => r.values.length === 7)).toBe(true);
  });

  it('leaves a loss-making P/E out rather than ranking it cheapest', () => {
    const pe = row('peGaapTtm');
    const sony = cmp.companies.findIndex((c) => c.symbol === 'SONY');
    expect(pe.values[sony]).toBeNull();
    expect(pe.ranked).toBe(6);
  });

  it('counts ranks from the best, in the direction the ratio is better', () => {
    // Apple has the highest ROE of the seven and the highest P/E of the six that report one.
    expect(row('returnOnEquity').rank).toBe(1);
    expect(row('peGaapTtm').rank).toBe(row('peGaapTtm').ranked);
  });

  it('takes the peer median over the peers alone', () => {
    const r = row('grossMargin');
    const peers = (r.values.slice(1) as number[]).sort((x, y) => x - y);
    expect(r.peerMedian).toBeCloseTo((peers[2] + peers[3]) / 2);
  });

  it('chooses ratios from four factors, three or so each', () => {
    const by = PICKS.reduce((m: Record<string, number>, p) => ({ ...m, [p.factor]: (m[p.factor] || 0) + 1 }), {});
    expect(Object.keys(by).sort()).toEqual(['growth', 'health', 'profitability', 'valuation']);
  });
});

describe('the prose', () => {
  const text = quantPeerProse(a, cmp).join('\n');

  it('states the rating the report shows', () => {
    expect(text).toContain(`${a.scores.overall.letter}, ${a.scores.overall.score.toFixed(2)} of 5`);
  });

  it('keeps abbreviations upper case mid-sentence', () => {
    expect(text).not.toMatch(/\bp\/E|\beV \//);
  });

  it('never says a company is ahead of 100% of anything', () => {
    expect(text).not.toMatch(/ahead of 100%|behind 100%/);
  });

  it('says what first and last place mean', () => {
    expect(text).toMatch(/the dearest of 6 that report it/);
    expect(text).toMatch(/the highest of 7/);
  });
});
