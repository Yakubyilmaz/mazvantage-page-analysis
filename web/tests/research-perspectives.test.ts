/* The Research tab's outside perspectives (2026-10-12): what the price
   implies, the key debates, the Street's view, ownership, management's
   record, the market around the company, valuation history and the
   signposts. Pinned on the bundled AAPL and NVDA copies and the capture
   files beside them, so a figure the page prints is checked against its
   source here rather than by eye. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { researchRatings } from '@/lib/research-model';
import { MODELS } from '@/lib/valuation-models';
import {
  grownPath, impliedExpectations, pathValue, reverseInputs, sensitivity, shiftedValue, valueOf, weightedValue, type Implied,
} from '@/lib/implied-expectations';
import { DEBATES, MAP_GROUPS, cellOf, debatesFor } from '@/lib/debates';
import { VOICES, wordCount } from '@/lib/research-voices';
import { LETTERS } from '@/lib/letters';
import { beatRecord, dispersion, ratingsMix, revisions, streetProse, streetView, type Ledger } from '@/lib/street-view';
import { GUIDANCE, PAY, guideSummary, guidanceFor, marginForVerdict, verdictOf } from '@/lib/guidance';
import { MARKETS } from '@/lib/industry';
import { bands, drawdowns, earningsReactions, multiplesByYear, trailingReturn, type Close } from '@/lib/valuation-history';
import { holderChange, holderName, insiderQuarters, ownershipOf } from '@/lib/ownership';
import { signposts, trackRecord, verdictEdges } from '@/lib/signposts';
import { editionsFor } from '@/lib/research-editions';

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
const aapl = report('AAPL');
const nvda = report('NVDA');
const ledger: Ledger = load('consensus-ledger.json');

/* ---------- what the price implies ------------------------------------------ */

describe('the reverse DCF', () => {
  for (const [sym, a] of [['AAPL', aapl], ['NVDA', nvda]] as const) {
    const im = impliedExpectations(a) as Implied;
    const inp = reverseInputs(a)!;

    it(`${sym}: the consensus path at the models’ rate is the ten-year perpetuity model`, () => {
      const model = MODELS.find((m: any) => m.id === 'dcf10yTerminalGrowth').fairValue(a);
      expect(im.consensusValue).toBeCloseTo(model.value, 6);
      expect(shiftedValue(inp)).toBeCloseTo(model.value, 6);
    });

    it(`${sym}: each solved input reproduces the price`, () => {
      // To the cent: the solver stops at a step of 1e-7 in the input.
      expect(valueOf(inp, grownPath(inp.revenueTtm, im.growth!), inp.margin)).toBeCloseTo(a.facts.price, 2);
      expect(valueOf(inp, inp.path.map((r) => r.revenue), im.margin!)).toBeCloseTo(a.facts.price, 2);
      expect(pathValue(inp, im.impliedReturn!)).toBeCloseTo(a.facts.price, 2);
    });

    it(`${sym}: the price is above the consensus value, so it implies more growth and a lower return`, () => {
      expect(a.facts.price).toBeGreaterThan(im.consensusValue!);
      expect(im.lean).toBe('more');
      expect(im.growth!).toBeGreaterThan(im.consensusGrowth!);
      expect(im.impliedReturn!).toBeLessThan(inp.wacc);
    });

    it(`${sym}: the grid rises with growth and with margin`, () => {
      const v = im.grid.values;
      for (let i = 1; i < v.length; i++) for (let j = 0; j < v[i].length; j++) expect(v[i][j]!).toBeGreaterThan(v[i - 1][j]!);
      for (const row of v) for (let j = 1; j < row.length; j++) expect(row[j]!).toBeGreaterThan(row[j - 1]!);
    });

    it(`${sym}: the tornado is sorted, and the discount-rate grid falls as the rate rises`, () => {
      const s = sensitivity(inp);
      for (let i = 1; i < s.tornado.length; i++) expect(s.tornado[i].range).toBeLessThanOrEqual(s.tornado[i - 1].range);
      for (let i = 1; i < s.grid.length; i++) expect(s.grid[i][2]!).toBeLessThan(s.grid[i - 1][2]!);
      expect(s.grid[2][2]).toBeCloseTo(s.base!, 6);
    });
  }

  it('reads AAPL at the figures the page prints', () => {
    const im = impliedExpectations(aapl) as Implied;
    expect(im.growth!).toBeCloseTo(0.1216, 3);
    expect(im.impliedReturn!).toBeCloseTo(0.0668, 3);
    expect(im.history5).toMatchObject({ from: 2020, to: 2025 });
  });

  it('weights the three cases a quarter, a half and a quarter', () => {
    expect(weightedValue({ bear: { value: 100 }, base: { value: 200 }, bull: { value: 400 } })).toBe(225);
    expect(weightedValue({ bear: { value: null }, base: { value: 200 }, bull: { value: 400 } })).toBeNull();
  });
});

/* ---------- the key debates --------------------------------------------------- */

describe('the key debates', () => {
  const voiceQuotes = new Set(VOICES.map((v) => v.quote));

  it('every quote is a sentence or two, at most 35 words, and a cut is marked', () => {
    for (const d of DEBATES) for (const e of d.evidence) {
      expect(wordCount(e.quote), e.quote).toBeLessThanOrEqual(35);
      expect(e.quote.trim()).toBe(e.quote);
    }
  });

  it('a quote already on the page as an outside voice is copied exactly', () => {
    const fromVoices = DEBATES.flatMap((d) => d.evidence).filter((e) => VOICES.some((v) => v.speaker === e.speaker && v.date === e.date && v.symbol === DEBATES.find((x) => x.evidence.includes(e))!.symbol));
    expect(fromVoices.length).toBeGreaterThan(10);
    for (const e of fromVoices.filter((x) => x.symbol === undefined)) expect(voiceQuotes.has(e.quote)).toBe(true);
    // Apple's debates draw only on voices verified for the page.
    for (const e of debatesFor('AAPL').flatMap((d) => d.evidence)) expect(voiceQuotes.has(e.quote), e.quote).toBe(true);
  });

  it('every debate has both sides, a dated next test, and our reading', () => {
    for (const d of DEBATES) {
      expect(d.evidence.some((e) => e.side === 'bull'), d.id).toBe(true);
      expect(d.evidence.some((e) => e.side === 'bear'), d.id).toBe(true);
      expect(d.next.date === 'next' || /^\d{4}-\d{2}-\d{2}$/.test(d.next.date)).toBe(true);
      expect(d.ours.text.length).toBeGreaterThan(40);
    }
  });

  it('library letters exist', () => {
    for (const e of DEBATES.flatMap((d) => d.evidence)) if (e.letterId) expect(LETTERS.some((l) => l.id === e.letterId), e.letterId).toBe(true);
  });

  it('the map files a group’s evidence on one side, both, or none', () => {
    const d = debatesFor('NVDA').find((x) => x.id === 'nvda-financing')!;
    expect(cellOf(d, MAP_GROUPS[0].kinds)).toBe('split');
    expect(cellOf(d, ['competitor'])).toBeNull();
  });
});

/* ---------- the Street ------------------------------------------------------- */

describe('the consensus ledger', () => {
  it('keeps captures oldest first, each dated and sourced', () => {
    for (const caps of Object.values(ledger.symbols)) {
      const dates = caps.map((c) => c.date);
      expect([...dates].sort()).toEqual(dates);
      for (const c of caps) expect(['snapshot', 'connector', 'live']).toContain(c.source);
    }
  });

  it('the 9 Oct AAPL capture is the bundled snapshot’s estimates', () => {
    const snap = load('AAPL.json').feeds.estimates;
    const cap = ledger.symbols.AAPL.find((c) => c.date === '2026-10-09')!;
    for (const r of snap) expect(cap.estimates.find((e) => e.fy === r.date)?.eps).toBe(r.epsAvg);
  });

  it('measures a revision only where three or more analysts covered the year in both captures', () => {
    const rv = revisions(ledger.symbols.AAPL, 2026);
    expect(rv.captures).toBe(3);
    expect(rv.rows.map((r) => r.year)).toEqual([2026, 2027, 2028]);
    const fy27 = rv.rows.find((r) => r.year === 2027)!;
    expect(fy27.epsFrom).toBe(9.52458);
    expect(fy27.epsChange!).toBeCloseTo(9.61286 / 9.52458 - 1, 8);
  });

  it('reads the spread between the published estimates', () => {
    const d = dispersion(ledger.symbols.AAPL.at(-1), 2026).find((x) => x.year === 2028)!;
    expect(d.eps!).toBeCloseTo((11.67869 - 9.48151) / 10.68732, 6);
  });

  it('counts strong buys with buys, by month', () => {
    const mix = ratingsMix((n) => load('AAPL.json').feeds[n]);
    const last = mix.at(-1)!;
    expect(last.date).toBe('2026-10-01');
    expect(last.buy).toBe(25);
    expect(last.total).toBe(44);
  });

  it('reads NVIDIA’s record from the ledger when its snapshot has no earnings feed', () => {
    const r = beatRecord(nvda, ledger)!;
    expect(r.quarters).toBe(12);
    expect(r.epsBeats).toBe(12);
  });

  it('writes no direction from a single capture', () => {
    const sv = streetView(aapl, { symbols: { AAPL: [ledger.symbols.AAPL[0]] } });
    expect(streetProse(sv, 'Apple', 309.35)[0]).toMatch(/cannot yet say/);
  });
});

/* ---------- management’s record ------------------------------------------------- */

describe('guidance against delivery', () => {
  it('Apple’s results are the filed quarters', () => {
    const q: any[] = load('AAPL.json').feeds.incomeQ;
    const rev = (d: string) => q.find((r) => r.date === d).revenue / 1e9;
    const g = guidanceFor('AAPL');
    expect(g[0].revenueActual!).toBeCloseTo(rev('2025-06-28') / rev('2024-06-29') - 1, 6);
    expect(g[4].revenueActual!).toBeCloseTo(rev('2026-06-27') / rev('2025-06-28') - 1, 6);
    // Gross margin as the call reported it, against the filed quarter.
    expect(g[3].marginActual!).toBeCloseTo(q.find((r) => r.date === '2026-03-28').grossProfit / q.find((r) => r.date === '2026-03-28').revenue, 2);
  });

  it('NVIDIA’s results are the reported quarters on the ledger', () => {
    const rows: any[] = (ledger.reported!.NVDA as any).rows;
    for (const g of guidanceFor('NVDA').filter((x) => x.reportedOn)) {
      const r = rows.find((x) => x.date === g.reportedOn);
      expect(r, g.quarter).toBeTruthy();
      expect(g.revenueActual!).toBeCloseTo(r.revenueActual / 1e9, 3);
    }
  });

  it('NVIDIA landed above every revenue range; Apple never below one', () => {
    expect(guideSummary(guidanceFor('NVDA'))!.revenue).toEqual({ above: 5, within: 0, below: 0 });
    expect(guideSummary(guidanceFor('AAPL'))!.revenue.below).toBe(0);
  });

  it('a margin verdict is read without the one-off the company named', () => {
    const g = guidanceFor('AAPL').find((x) => x.quarter === 'June quarter FY2026')!;
    expect(verdictOf(g.marginActual, g.margin)).toBe('above');
    expect(verdictOf(marginForVerdict(g), g.margin)).toBe('within');
  });

  it('pay goals: the prior-year column is the filed year', () => {
    const a = PAY.find((p) => p.symbol === 'AAPL')!;
    const fy24 = aapl.series.rows.find((r: any) => r.year === 2024);
    expect(a.goals[0].priorYear!).toBeCloseTo(fy24.revenue / 1e9, 2);
    const n = PAY.find((p) => p.symbol === 'NVDA')!;
    const fy25 = nvda.series.rows.find((r: any) => r.year === 2025);
    expect(n.goals[0].priorYear!).toBeCloseTo(fy25.revenue / 1e9, 2);
    expect(GUIDANCE.every((g) => g.revenue.low < g.revenue.high)).toBe(true);
  });
});

/* ---------- the market around it -------------------------------------------------- */

describe('market-share tables', () => {
  for (const m of MARKETS.filter((x) => x.rows.length)) {
    it(`${m.id}: shares add up, growth matches the units, totals match`, () => {
      const share = m.rows.reduce((t, r) => t + r.share, 0);
      expect(share).toBeCloseTo(1, 2);
      // The publisher computes growth from unrounded units; the table rounds units to 0.1, so allow what that rounding can move.
      for (const r of m.rows) {
        const slack = (0.05 / r.units + 0.05 / r.unitsYearAgo) * (r.units / r.unitsYearAgo) + 0.0005;
        expect(Math.abs(r.growth - (r.units / r.unitsYearAgo - 1)), r.name).toBeLessThanOrEqual(slack);
      }
      expect(m.rows.reduce((t, r) => t + r.units, 0)).toBeCloseTo(m.total!.units, 0);
      expect(m.total!.growth).toBeCloseTo(m.total!.units / m.total!.unitsYearAgo - 1, 2);
    });
  }
  it('every market bears on a debate that exists', () => {
    for (const m of MARKETS) expect(DEBATES.some((d) => d.id === m.debate && d.symbol === m.symbol), m.id).toBe(true);
  });
});

/* ---------- valuation history ------------------------------------------------------ */

describe('valuation history', () => {
  it('a year’s P/E is the fiscal-year-end market value over that year’s net income', () => {
    const snap = load('AAPL.json').feeds;
    const y = multiplesByYear((n) => snap[n]).find((r) => r.year === 2025)!;
    const cap = snap.metricsHist.find((r: any) => Number(r.fiscalYear) === 2025).marketCap;
    const ni = snap.income.find((r: any) => Number(r.fiscalYear) === 2025).netIncome;
    expect(y.pe!).toBeCloseTo(cap / ni, 8);
  });

  it('reads AAPL dearer than its own record on every measure', () => {
    const b = bands(aapl, multiplesByYear((n) => aapl.ds.get(n)));
    for (const x of b) expect(x.vsMedian!, x.key).toBeGreaterThan(0);
  });

  it('finds drawdowns as peak to trough to recovery', () => {
    const c: Close[] = [['a', 10], ['b', 12], ['c', 6], ['d', 9], ['e', 13], ['f', 11], ['g', 12]];
    const d = drawdowns(c);
    expect(d[0]).toMatchObject({ peakDate: 'b', troughDate: 'c', recoveredDate: 'e', depth: -0.5 });
    expect(d[1]).toMatchObject({ peakDate: 'e', troughDate: 'f', recoveredDate: null });
  });

  it('the bundled history is split-adjusted across NVIDIA’s 2024 split', () => {
    const c: Close[] = load('history/NVDA.json').closes;
    const at = (d: string) => c.find((x) => x[0] === d)![1];
    expect(Math.abs(at('2024-06-10') / at('2024-06-07') - 1)).toBeLessThan(0.05);
    expect(trailingReturn(c, 1)).not.toBeNull();
  });

  it('an earnings reaction runs from the report-date close to the next', () => {
    const c: Close[] = [['2026-07-29', 100], ['2026-07-30', 101], ['2026-07-31', 90.9]];
    const r = earningsReactions(c, [{ date: '2026-07-30', epsActual: 2.02, epsEstimated: 1.89 }]);
    expect(r[0].move).toBeCloseTo(-0.1, 6);
  });
});

/* ---------- ownership and signposts -------------------------------------------------- */

describe('ownership', () => {
  const file = load('ownership.json');
  it('shows no change, not a purchase, where a filer has no prior filing under its number', () => {
    const norges = file.symbols.AAPL.holders.find((h: any) => /NORGES/.test(h.investorName));
    expect(holderChange(norges)).toBeNull();
    expect(holderChange({ sharesNumber: 110, lastSharesNumber: 100 } as any)).toBeCloseTo(0.1, 8);
  });
  it('names filers readably', () => {
    expect(holderName('JPMORGAN CHASE & CO')).toBe('JPMorgan Chase & Co');
    expect(holderName('PRICE T ROWE ASSOCIATES INC /MD/')).toBe('T. Rowe Price Associates');
    expect(holderName('BLACKROCK, INC.')).toBe('BlackRock, Inc.');
  });
  it('counts only open-market trades, newest eight quarters, oldest first', () => {
    const q = insiderQuarters(file.symbols.NVDA.insiderStats);
    expect(q).toHaveLength(8);
    expect(q.at(-1)).toMatchObject({ year: 2026, quarter: 4 });
    expect(q.every((x) => x.purchases === 0)).toBe(true);
    expect(ownershipOf('NVDA', file, null).holders).toHaveLength(10);
  });
});

describe('signposts', () => {
  it('the quant verdict changes on whole numbers', () => {
    expect(verdictEdges(2.98)).toEqual({ up: { at: 3, word: 'Buy' }, down: { at: 2, word: 'Sell' } });
    expect(verdictEdges(4.2).up).toBeNull();
  });

  it('the record sets each edition against the close that day, not only the price it used', () => {
    const closes: Close[] = load('history/AAPL.json').closes;
    const rec = trackRecord(editionsFor('AAPL'), closes);
    const sep = rec.find((x) => x.date === '2026-09-08')!;
    expect(sep.price).toBe(309.35);
    expect(sep.closeThen).toBe(316.22);
  });

  it('lists a signpost for each rating and each debate', () => {
    const r = researchRatings(aapl);
    const s = signposts({
      price: aapl.facts.price, cur: 'US$', zone: { label: r.zone.label, low: r.zone.low, high: r.zone.high },
      quant: { score: r.quant.score, verdict: r.quant.verdict }, implied: impliedExpectations(aapl) as Implied,
      debates: debatesFor('AAPL'), nextEarnings: aapl.quarter.next, fmt: { price: String, pct: String },
    });
    expect(s.map((x) => x.kind)).toEqual(['zone', 'quant', 'growth', 'margin', 'debate', 'debate', 'debate', 'debate']);
    expect(s.filter((x) => x.kind === 'debate').every((x) => x.date)).toBe(true);
  });
});
