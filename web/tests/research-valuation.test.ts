/* The Research tab's fair value in depth (2026-10-10): which models fit the
   company, the parameters behind the ones kept, and where the profit came
   from. Pinned on the bundled NVDA copy, where all three questions have
   sharp answers. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { fairValueEstimate, modelFit } from '@/lib/research-model';
import { parameterProse, profitDriverProse, profitDrivers, valuationParameters } from '@/lib/research-valuation';

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
const nvda = report('NVDA');

describe('which models fit', () => {
  it('sets price / book aside for a company earning far more than its book', () => {
    expect(modelFit(nvda, 'priceBookMultiple').fit).toBe(false);
    expect(modelFit(nvda, 'priceBookMultiple').why).toMatch(/Return on equity/);
  });

  it('sets the sales multiples aside when the margin is far above the sector’s', () => {
    expect(modelFit(nvda, 'priceSalesMultiple').fit).toBe(false);
    expect(modelFit(nvda, 'evRevenueMultiple').fit).toBe(false);
  });

  it('keeps the earnings multiples and every DCF', () => {
    for (const id of ['peMultiple', 'evEbitdaMultiple', 'evEbitMultiple', 'dcf10yTerminalGrowth', 'dcf5yEbitdaExit']) {
      expect(modelFit(nvda, id).fit, id).toBe(true);
    }
  });

  it('takes the estimate from the models that fit, and lists the rest with a reason', () => {
    const fve = fairValueEstimate(nvda);
    expect(fve.setAside.map((m: any) => m.id).sort()).toEqual(['evRevenueMultiple', 'priceBookMultiple', 'priceSalesMultiple']);
    expect(fve.models.every((m: any) => m.fit)).toBe(true);
    expect(fve.count).toBe(fve.models.length);
    // The set-aside models all sat far below the price; dropping them lifts the median.
    const all = [...fve.models, ...fve.setAside].map((m: any) => m.value).sort((x: number, y: number) => x - y);
    expect(fve.value!).toBeGreaterThan(all[Math.floor(all.length / 2)]);
  });
});

describe('the parameters', () => {
  const p = valuationParameters(nvda, fairValueEstimate(nvda));

  it('reads one discount rate for every DCF, with how it was built', () => {
    expect(p.wacc).toBeGreaterThan(0.05);
    expect(p.waccNote).toMatch(/cost of equity/);
  });

  it('gives each kept model its key input, and each DCF its terminal share', () => {
    expect(p.rows.length).toBe(fairValueEstimate(nvda).count);
    for (const r of p.rows) expect(r.key.length, r.id).toBeGreaterThan(5);
    for (const r of p.rows.filter((x) => x.family === 'dcf' && x.id !== 'fmpLevered')) {
      expect(r.terminalShare!, r.id).toBeGreaterThan(0);
      expect(r.terminalShare!, r.id).toBeLessThan(1);
    }
  });

  it('says how much of the value rests on the terminal years, consistently with the number', () => {
    const text = parameterProse(nvda, p, fairValueEstimate(nvda)).join(' ');
    const share = Number(text.match(/On the median model (\d+)%/)![1]) / 100;
    if (share > 0.5) expect(text).not.toMatch(/Most of the value is in the forecast years/);
  });
});

describe('the profit drivers', () => {
  const d = profitDrivers(nvda);

  it('splits the operating profit added into growth and margin, exactly', () => {
    expect(d.available).toBe(true);
    expect(d.from).toBe(2022);
    expect(d.to).toBe(2026);
    expect(d.volume + d.marginEffect).toBeCloseTo(d.opIncome[1] - d.opIncome[0], 0);
  });

  it('names Data Center as the source of the revenue added', () => {
    expect(d.segments[0].name).toBe('Data Center');
    const text = profitDriverProse(nvda, d).join(' ');
    expect(text).toMatch(/Data Center supplied 97% of the revenue added/);
  });

  it('says gaming was outgrown, not abandoned: it grew while its share fell', () => {
    const gaming = d.segments.find((s) => s.name === 'Gaming')!;
    expect(gaming.added!).toBeGreaterThan(0);
    expect(gaming.shareTo!).toBeLessThan(gaming.shareFrom!);
    expect(profitDriverProse(nvda, d).join(' ')).toMatch(/Gaming still grew.*outgrown, not abandoned/);
  });

  it('finds the FY2023 trough inside the window', () => {
    expect(d.trough?.year).toBe(2023);
  });
});
