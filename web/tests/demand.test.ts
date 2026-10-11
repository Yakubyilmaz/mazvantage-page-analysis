/* Demand Discovery — unit checks on synthetic quarters.

   What is pinned here, and why each is not obvious:

   - Point in time is enforced by filing date, not period end. The bug this
     prevents is a backtest that reads a quarter five weeks before it was
     public and looks prescient.
   - Trailing sums refuse a gap. Three quarters summed and called a year is
     the quiet failure of every quarterly model.
   - Growth on a negative or zero base is null, never a huge number.
   - The reverse DCF recovers a growth rate it was built from.
   - The opportunity score is an AND: one weak component drags the whole
     score, which a weighted average would not do.
   - An `indirect` chain member never moves its layer's cohort.
   - The transcript reader treats shortage words as demand-positive and
     flips negated words.
   - Evidence counts distinct origins, and ignores rows not yet published. */
import { describe, expect, it } from 'vitest';
import {
  calendarQuarter, closeAfter, closeOn, fromStatements, pointInTime, readCapture, shiftQuarter, type Company, type Quarter,
} from '@/lib/demand-data';
import { growthProfile, inventoryDays, ttm, ttmGrowth, yoyQuarter } from '@/lib/demand-metrics';
import { cyclePhase, glutWarning, shortageSignature, supplyDiscipline } from '@/lib/demand-cycle';
import { impliedGrowth, pricedIn, PRICED_IN_ASSUMPTIONS } from '@/lib/demand-pricedin';
import { opportunityScore, opportunityConfidence } from '@/lib/demand-score';
import { readCohort, scanCohorts } from '@/lib/demand-cohort';
import { band, evidenceConfidence, type Evidence, type Source } from '@/lib/demand-signals';
import { readTranscript, scoreSentence } from '@/lib/demand-language';
import { cohortWeights, analyseChain } from '@/lib/demand-engine';
import { CHAINS, CHAIN_BY_ID, chainSymbols } from '@/lib/demand-chains';
import { backtestCompany, bucketize, spearman } from '@/lib/demand-backtest';

/* ---------- synthetic companies ---------------------------------------- */

const QUARTER_ENDS = (() => {
  const out: string[] = [];
  for (let y = 2018; y <= 2026; y++) for (const md of ['03-31', '06-30', '09-30', '12-31']) out.push(`${y}-${md}`);
  return out;
})();

function addDays(d: string, n: number) {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Build quarters from per-quarter revenue, with fixed ratios unless overridden. */
function company(symbol: string, revs: number[], over: (i: number) => Partial<Quarter> = () => ({})): Company {
  const quarters: Quarter[] = revs.map((rev, i) => ({
    date: QUARTER_ENDS[i], filed: addDays(QUARTER_ENDS[i], 40),
    rev, gp: rev * 0.4, oi: rev * 0.15, ni: rev * 0.1, inv: rev * 0.6 * 0.6, cl: rev * 0.05,
    cash: 100, debt: 50, ocf: rev * 0.2, capex: rev * 0.08, sh: 10, ...over(i),
  }));
  const prices: [string, number][] = [];
  for (let d = '2018-01-05'; d <= '2026-12-31'; d = addDays(d, 7)) prices.push([d, 100]);
  return { symbol, name: symbol, quarters, prices };
}

const flat = (n: number, v = 100) => Array.from({ length: n }, () => v);
const growing = (n: number, start: number, q: number) => Array.from({ length: n }, (_, i) => start * (1 + q) ** i);

describe('point in time', () => {
  it('hides a quarter until the day it was filed', () => {
    const c = company('AAA', flat(12));
    const q = c.quarters[5];
    expect(pointInTime(c, addDays(q.filed, -1)).quarters.map((x) => x.date)).not.toContain(q.date);
    expect(pointInTime(c, q.filed).quarters.map((x) => x.date)).toContain(q.date);
  });

  it('finds the close on or before, and on or after, a date', () => {
    const px: [string, number][] = [['2024-01-05', 1], ['2024-01-12', 2], ['2024-01-19', 3]];
    expect(closeOn(px, '2024-01-15')?.close).toBe(2);
    expect(closeAfter(px, '2024-01-15')?.close).toBe(3);
    expect(closeOn(px, '2024-01-01')).toBeNull();
    expect(closeAfter(px, '2024-02-01')).toBeNull();
  });

  it('maps fiscal quarters to the calendar quarter they mostly cover', () => {
    expect(calendarQuarter('2026-09-03')).toBe('2026-Q3'); // Micron, June–August
    expect(calendarQuarter('2026-07-26')).toBe('2026-Q2'); // NVIDIA, May–July
    expect(calendarQuarter('2026-06-30')).toBe('2026-Q2');
    expect(shiftQuarter('2026-Q1', 4)).toBe('2025-Q1');
    expect(shiftQuarter('2026-Q1', 1)).toBe('2025-Q4');
  });

  it('reads live statement rows newest-first into the same shape', () => {
    const c = fromStatements('ZZZ', 'Zed',
      [{ date: '2026-06-30', filingDate: '2026-07-30', revenue: 2e9, grossProfit: 1e9, operatingIncome: 5e8, netIncome: 4e8, weightedAverageShsOutDil: 1e8 },
        { date: '2026-03-31', filingDate: '2026-04-30', revenue: 1e9, grossProfit: 4e8, operatingIncome: 1e8, netIncome: 1e8 }],
      [{ date: '2026-06-30', inventory: 3e8, deferredRevenue: 1e8, deferredRevenueNonCurrent: 5e7, cashAndShortTermInvestments: 9e8, totalDebt: 2e8 }],
      [{ date: '2026-06-30', operatingCashFlow: 6e8, capitalExpenditure: -1e8 }],
      [{ date: '2026-07-01', price: 10 }]);
    expect(c.quarters.map((q) => q.date)).toEqual(['2026-03-31', '2026-06-30']);
    expect(c.quarters[1]).toMatchObject({ rev: 2000, cl: 150, capex: 100, sh: 100 });
    expect(c.prices).toEqual([['2026-07-01', 10]]);
  });

  it('expands the compact capture file', () => {
    const doc = { capturedAt: '2026-10-08', cols: ['date', 'filed', 'rev'], companies: { X: { name: 'X', quarters: [['2026-06-30', '2026-07-30', 5]], prices: [['2026-07-01', 3]] } }, benchmarks: {} };
    const c = readCapture(doc).companies.X;
    expect(c.quarters[0]).toMatchObject({ date: '2026-06-30', filed: '2026-07-30', rev: 5, gp: null });
  });
});

describe('the arithmetic on one company', () => {
  it('refuses a trailing year with a missing quarter', () => {
    const c = company('GAP', flat(12));
    expect(ttm(c.quarters, 7, 'rev')).toBe(400);
    const gappy = [...c.quarters.slice(0, 6), ...c.quarters.slice(7)];
    expect(ttm(gappy, 7, 'rev')).toBeNull();
  });

  it('gives no growth rate on a negative or zero base', () => {
    const c = company('NEG', flat(12), (i) => ({ ni: i < 4 ? -10 : 10 }));
    expect(yoyQuarter(c.quarters, 5, 'ni')).toBeNull();
    expect(yoyQuarter(c.quarters, 9, 'ni')).toBe(0);
  });

  it('measures acceleration as recent growth minus the four quarters before', () => {
    // flat for two years, then +10% a quarter: growth speeds up sharply
    const revs = [...flat(10), ...growing(4, 110, 0.1)];
    const g = growthProfile(company('ACC', revs).quarters);
    expect(g.recent!).toBeGreaterThan(g.base!);
    expect(g.acceleration!).toBeCloseTo(g.recent! - g.base!, 10);
    expect(ttmGrowth(company('ACC', revs).quarters, 13, 'rev')!).toBeGreaterThan(0);
  });

  it('counts inventory days against cost of sales, and none when there is no inventory', () => {
    const q = company('INV', [100]).quarters[0];
    expect(inventoryDays(q)).toBeCloseTo((36 / 60) * 91.25, 6);
    expect(inventoryDays({ ...q, inv: 0 })).toBeNull();
  });
});

describe('shortage, glut and phase', () => {
  const boom = company('BOOM', [...flat(10), ...growing(6, 115, 0.15)], (i) => (i >= 10
    ? { gp: 100 * (1.15 ** (i - 9)) * 0.55, inv: 20, cl: 30 + 20 * (i - 9), capex: 12 * (1.2 ** (i - 9)) }
    : { capex: 10 }));
  const bust = company('BUST', [...growing(10, 100, 0.08), ...growing(6, 200, -0.1)], (i) => (i >= 10
    ? { gp: 200 * (0.9 ** (i - 10)) * 0.2, inv: 400, capex: 40 * (1.25 ** (i - 9)) }
    : { capex: 15 }));

  it('reads a boom as a shortage and a bust as a glut', () => {
    const s = shortageSignature(boom.quarters);
    const g = glutWarning(bust.quarters);
    expect(s.score!).toBeGreaterThan(60);
    expect(g.risk!).toBeGreaterThan(55);
    expect(g.level).toBe('high');
    expect(glutWarning(boom.quarters).level).toBe('low');
  });

  it('drops a test without data rather than scoring it zero', () => {
    const noCl = company('NOCL', boom.quarters.map((q) => q.rev!), () => ({ cl: null }));
    const s = shortageSignature(noCl.quarters);
    expect(s.readings.find((r) => r.id === 'prepayments')!.score).toBeNull();
    expect(s.coverage).toBeCloseTo(0.8, 6);
  });

  it('ignores capex at a company whose capacity is not on its balance sheet', () => {
    const light = company('LITE', boom.quarters.map((q) => q.rev!), () => ({ capex: 0.5 }));
    const s = shortageSignature(light.quarters);
    const g = glutWarning(light.quarters);
    expect(s.readings.find((r) => r.id === 'capacity')!.score).toBeNull();
    expect(g.readings.find((r) => r.id === 'capexOverRevenue')!.score).toBeNull();
  });

  it('calls a capex cut in a downturn supply discipline, and nothing else', () => {
    const cut = company('CUT', [...growing(10, 100, 0.05), ...growing(6, 160, -0.08)], (i) => ({ capex: i >= 10 ? 4 : 16 }));
    expect(supplyDiscipline(cut.quarters)).toBe(true);
    expect(cyclePhase(shortageSignature(cut.quarters), glutWarning(cut.quarters), cut.quarters)).toBe('early-cycle');
    expect(supplyDiscipline(boom.quarters)).toBe(false);
  });
});

describe('the priced-in gate', () => {
  it('recovers the growth a value was built from', () => {
    const { discountRate: r, terminalGrowth: gT } = PRICED_IN_ASSUMPTIONS;
    const g = 0.12;
    const m = 0.2;
    let ev = 0;
    for (let t = 1; t <= 10; t++) ev += 1000 * (1 + g) ** t * m / (1 + r) ** t;
    ev += (1000 * (1 + g) ** 10 * m * (1 + gT) / (r - gT)) / (1 + r) ** 10;
    expect(impliedGrowth(ev, 1000, m)!).toBeCloseTo(g, 6);
    expect(impliedGrowth(ev, 1000, -0.1)).toBeNull();
  });

  it('reads a cheap stock as modest and an expensive one as extreme', () => {
    const c = company('VAL', flat(24));
    const cheap = pricedIn(c.quarters, 20, 10); // $200m for $400m revenue at a 12% cash margin
    const dear = pricedIn(c.quarters, 2000, 10);
    expect(cheap.level).toBe('modest');
    expect(dear.level).toBe('extreme');
    expect(dear.factor).toBeLessThan(cheap.factor);
  });

  it('never calls a business with no cash through the cycle cheap on its trailing margin', () => {
    const c = company('CYC', flat(24), (i) => ({ ocf: i < 20 ? 2 : 40, capex: i < 20 ? 30 : 8 }));
    const r = pricedIn(c.quarters, 30, 10);
    expect(r.marginThroughCycle!).toBeLessThanOrEqual(0);
    expect(['aggressive', 'extreme']).toContain(r.level);
  });
});

describe('the opportunity score', () => {
  const gate = { level: 'modest', factor: 1 } as any;

  it('is an AND: one weak component drags the whole score', () => {
    const even = opportunityScore({ demand: 70, supply: 70, exposure: 70, quality: 70, pricedIn: gate, glut: 'low' });
    const lopsided = opportunityScore({ demand: 100, supply: 100, exposure: 100, quality: 10, pricedIn: gate, glut: 'low' });
    const arithmetic = 0.35 * 100 + 0.25 * 100 + 0.2 * 100 + 0.2 * 10;
    expect(even.score).toBeCloseTo(70, 6);
    expect(lopsided.score!).toBeLessThan(arithmetic);
  });

  it('applies the gates after the base and drops missing components', () => {
    const r = opportunityScore({ demand: 80, supply: null, exposure: 80, quality: 80, pricedIn: { level: 'aggressive', factor: 0.6 } as any, glut: 'high' });
    expect(r.base).toBeCloseTo(80, 6);
    expect(r.score).toBeCloseTo(80 * 0.6 * 0.6, 1);
    expect(r.coverage).toBe(0.75);
  });

  it('caps confidence at the weakest input', () => {
    const c = opportunityConfidence({ coverage: 1, shortageCoverage: 1, evidence: 'high', daysSinceFiling: 30, exposureBasis: 'ACTUAL', pricedInKnown: true });
    expect(c.level).toBe('high');
    expect(opportunityConfidence({ coverage: 1, shortageCoverage: 1, evidence: 'high', daysSinceFiling: 30, exposureBasis: 'INFERRED', pricedInKnown: true }).level).toBe('medium');
    expect(opportunityConfidence({ coverage: 0.5, shortageCoverage: 1, evidence: 'high', daysSinceFiling: 30, exposureBasis: 'ACTUAL', pricedInKnown: true }).level).toBe('low');
  });
});

describe('cohorts', () => {
  it('sums members by calendar quarter and reports breadth', () => {
    const a = company('A', [...flat(10), ...growing(6, 120, 0.1)]);
    const b = company('B', [...flat(10), ...growing(6, 110, 0.05)]);
    const r = readCohort('x', 'X', [a, b]);
    expect(r.breadth).toBe(1);
    expect(r.acceleration!).toBeGreaterThan(0);
    expect(scanCohorts([r])[0].flags).toContain('Demand acceleration detected');
  });

  it('never lets an indirect member move its layer', () => {
    const robotics = CHAIN_BY_ID.robotics.layers[0];
    expect(cohortWeights(robotics).TER).toBe(0);
    const rok = company('ROK', flat(16));
    const ter = company('TER', [...flat(10), ...growing(6, 200, 0.3)]);
    const without = readCohort('a', 'A', [rok]);
    const withTer = readCohort('a', 'A', [rok, ter], 'rev', { TER: 0 });
    expect(withTer.recentGrowth).toBe(without.recentGrowth);
    expect(withTer.measured).toEqual(['ROK']);
  });
});

describe('the chains', () => {
  it('name every member once per layer and give every membership a basis', () => {
    for (const c of CHAINS) {
      for (const l of c.layers) {
        const syms = l.members.map((m) => m.symbol);
        expect(new Set(syms).size).toBe(syms.length);
        for (const m of l.members) expect(m.evidence.length).toBeGreaterThan(20);
      }
      for (const e of c.edges) {
        expect(c.layers.some((l) => l.id === e.from)).toBe(true);
        expect(c.layers.some((l) => l.id === e.to)).toBe(true);
      }
    }
    expect(chainSymbols()).toContain('MU');
  });
});

describe('evidence and confidence', () => {
  const sources: Source[] = [
    { id: 'iea', name: 'IEA', kind: 'official', url: 'x', publisher: 'IEA', access: 'public' },
    { id: 'paper', name: 'Paper', kind: 'financial-media', url: 'x', publisher: 'Paper', access: 'public' },
    { id: 'wsts', name: 'WSTS', kind: 'industry-body', url: 'x', publisher: 'WSTS', access: 'public' },
  ];
  const row = (id: string, sourceId: string, published: string, origin?: string): Evidence => ({
    id, theme: 't', claim: 'c', metric: 'm', value: 1, unit: 'u', period: 'p', type: 'ACTUAL', sourceId, origin, published, accessed: published, url: 'x', direction: 1,
  });

  it('counts a newspaper repeating the IEA as one source', () => {
    const c = evidenceConfidence([row('a', 'iea', '2026-01-01'), row('b', 'paper', '2026-02-01', 'iea')], sources, '2026-06-01');
    expect(c.independent).toBe(1);
    expect(c.level).toBe('medium');
  });

  it('needs two strong independent recent sources for high', () => {
    expect(evidenceConfidence([row('a', 'iea', '2026-01-01'), row('b', 'wsts', '2026-02-01')], sources, '2026-06-01').level).toBe('high');
    expect(evidenceConfidence([row('a', 'iea', '2022-01-01'), row('b', 'wsts', '2022-02-01')], sources, '2026-06-01').level).toBe('medium');
  });

  it('ignores rows published after the date', () => {
    expect(evidenceConfidence([row('a', 'iea', '2026-09-01')], sources, '2026-06-01').level).toBe('none');
  });

  it('bands values with either direction', () => {
    expect(band(0, -1, 1)).toBe(50);
    expect(band(5, -1, 1)).toBe(100);
    expect(band(-0.3, 0.3, -0.3)).toBe(100);
    expect(band(null, 0, 1)).toBeNull();
  });
});

describe('the transcript reader', () => {
  it('reads weak demand as negative and strong demand as positive', () => {
    expect(scoreSentence('Demand remains weak.').polarity).toBeLessThan(0);
    expect(scoreSentence('Demand remains exceptionally strong.').polarity).toBeGreaterThan(0);
  });

  it('flips a negated word', () => {
    const s = scoreSentence('We are not seeing any weakness in demand.');
    expect(s.polarity).toBeGreaterThan(0);
    expect(s.positives).toContain('not weakness');
  });

  it('counts shortage language for demand, and flags it', () => {
    const s = scoreSentence('Supply is tight and our HBM is sold out for the year.');
    expect(s.polarity).toBeGreaterThan(0);
    expect(s.flags).toContain('supplyShortage');
    expect(scoreSentence('Customers are destocking after an inventory correction.').flags).toContain('inventoryCorrection');
  });

  it('skips the analysts and shrinks a thin call toward zero', () => {
    const raw = [
      'symbol: X', '---',
      'Jane Analyst: Are you seeing weak demand? Is pricing soft? What about orders?',
      'Joe Chief: Demand is strong. Orders are robust.',
    ].join('\n');
    const r = readTranscript(raw);
    expect(r.speakersSkipped).toContain('Jane Analyst');
    expect(r.positive).toBe(2);
    expect(r.negative).toBe(0);
    expect(r.score!).toBeLessThan(100);
    expect(r.score!).toBeGreaterThan(0);
  });
});

describe('the backtest', () => {
  it('enters after the filing and measures against the benchmark', () => {
    const c = company('BT', growing(36, 100, 0.03));
    c.prices = c.prices.map(([d], i) => [d, 100 * 1.002 ** i]);
    const bench: [string, number][] = c.prices.map(([d]) => [d, 100]);
    const rows = backtestCompany(c, bench, { from: '2019-01-01' });
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) if (r.entry) expect(r.entry > r.filed).toBe(true);
    const done = rows.filter((r) => r.excess12 !== null);
    expect(done.every((r) => r.excess12! > 0)).toBe(true);
    expect(bucketize(rows, () => 'all')[0].hitRate12).toBe(1);
  });

  it('ranks with ties', () => {
    expect(spearman([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 10);
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });
});

describe('the engine end to end', () => {
  it('reads a whole chain from synthetic companies without throwing', () => {
    const chain = CHAIN_BY_ID['copper-electrification'];
    const companies: Record<string, Company> = {
      ETN: company('ETN', growing(30, 100, 0.02)),
      FCX: company('FCX', [...flat(24), ...growing(6, 110, 0.06)]),
      SCCO: company('SCCO', growing(30, 100, 0.03)),
    };
    const r = analyseChain(chain, {
      capture: { capturedAt: '2026-10-08', about: '', companies, benchmarks: { HGUSD: { symbol: 'HGUSD', name: 'Cu', prices: [['2025-10-01', 4], ['2026-10-01', 5]] } } },
      register: { asOf: '2026-10-08', sources: [], evidence: [] },
      asOf: '2026-10-08',
    });
    expect(r.companies.map((c) => c.symbol).sort()).toEqual(['ETN', 'FCX', 'SCCO']);
    expect(r.commodity!.change1y).toBeCloseTo(0.25, 6);
    expect(r.confidence).toBe('none');
    for (const c of r.companies) expect(c.thesis.length + c.bear.length).toBeGreaterThan(0);
  });
});
