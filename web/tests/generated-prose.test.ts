/* The generated prose every company without a written narrative gets
   (2026-10-12): Bulls Say / Bears Say from diversified evidence, the moat's
   likely sources read from the accounts, and which valuation models deserve
   weight. Plus the rule that a "compound" rate is a compound rate. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { bullsBears, moatEvidence, modelWeightProse, moatProse, researchRatings } from '@/lib/research-model';
import { buildBrief, compoundMisuse } from '@/lib/narrative';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const sectorStats = load('sector-stats.json');
const report = (sym: string) => {
  const snap = load(`${sym}.json`);
  return analyse(
    makeDataset(sym, Object.fromEntries(Object.entries(snap.feeds).map(([k, v]) => [k, { status: 'ok', data: v }])) as any),
    { sectorStats, benchmarks: snap.extras.benchmarks, peerRatios: snap.extras.peerRatios, peerGrowth: snap.extras.peerGrowth, peerMetrics: snap.extras.peerMetrics },
  ) as any;
};

describe.each(['AAPL', 'NVDA'])('%s generated prose', (sym) => {
  const a = report(sym);
  const r = researchRatings(a);
  const bb = bullsBears(a, r);

  it('gives three of each side, none repeated', () => {
    expect(bb.bulls).toHaveLength(3);
    expect(bb.bears).toHaveLength(3);
    expect(new Set([...bb.bulls, ...bb.bears]).size).toBe(6);
  });

  it('never says "ahead of 100%", and never ranks a company by its size', () => {
    for (const t of [...bb.bulls, ...bb.bears]) {
      expect(t).not.toMatch(/(ahead of|behind) 100%/);
      expect(t).not.toMatch(/^Cash from operations|^Revenue \(TTM\)|^Market cap/);
    }
  });

  it('takes at most one strength from the returns on capital', () => {
    expect(bb.bulls.filter((t) => /return on|ROE|beaten the cost of capital/i.test(t)).length).toBeLessThanOrEqual(1);
  });

  it('names the likely sources of a moat as an inference, with their figures', () => {
    const paras = moatProse(a, r).join(' ');
    if (r.moat.key === 'wide' || r.moat.key === 'narrow') expect(paras).toMatch(/inference from the figures, not a finding/);
    for (const s of moatEvidence(a).sources) expect(s).toMatch(/\d/);
  });

  it('says which cash flow model leans most on the consensus and which least', () => {
    const t = modelWeightProse(a, r.fve, 'US$')!;
    expect(t).toMatch(/rests least on its terminal value \(\d+% of the total\)/);
    expect(t).toMatch(/least reliable of the cash flow models/);
  });
});

describe('a compound rate', () => {
  const a = report('AAPL');
  const r = researchRatings(a);
  const brief = buildBrief(a, r);

  it('is checked against the brief’s compound rates, not its median steps', () => {
    expect(brief.forecast.revenueCompound).not.toBe(brief.forecast.revenueMedianStep);
    const wrong = { strategy: [`Analysts expect revenue to compound at ${brief.forecast.revenueMedianStep} a year to 2029, as the consensus has it.`] };
    const right = { strategy: [`Analysts expect revenue to compound at ${brief.forecast.revenueCompound} a year to 2029, as the consensus has it.`] };
    expect(compoundMisuse(wrong, brief).map((x) => x.figure)).toEqual([brief.forecast.revenueMedianStep]);
    expect(compoundMisuse(right, brief)).toEqual([]);
  });

  it('leaves a margin in the same sentence alone', () => {
    const s = { strategy: ['Revenue compounded from US$215.6b to US$416.2b while the operating margin widened from 27.8% to 32%, which is rare.'] };
    expect(compoundMisuse(s, brief)).toEqual([]);
  });
});
