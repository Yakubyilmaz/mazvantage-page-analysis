/* The valuation inputs table on the Research tab (2026-10-12): every input
   the discounted cash flows share, and they must be the inputs the models
   actually used, not a second calculation that could drift from them. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { fairValueEstimate } from '@/lib/research-model';
import { valuationParameters } from '@/lib/research-valuation';
import { discountInputs } from '@/lib/valuation-models';

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

describe.each(['AAPL', 'NVDA'])('%s discount inputs', (sym) => {
  const a = report(sym);
  const d = discountInputs(a)!;

  it('builds the cost of equity from the CAPM pieces it prints', () => {
    expect(d.ke).toBeCloseTo(d.riskFree! + d.beta! * d.equityRiskPremium!, 10);
  });

  it('weights equity and after-tax debt into the rate it prints', () => {
    expect(d.wacc).toBeCloseTo(d.ke * (1 - d.weightD) + d.kd * (1 - d.tax) * d.weightD, 10);
  });

  it('is the rate the models discounted at', () => {
    const p = valuationParameters(a, fairValueEstimate(a));
    expect(p.wacc).toBeCloseTo(d.wacc, 6);
  });
});
