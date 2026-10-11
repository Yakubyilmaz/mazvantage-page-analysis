/* The Demand Discovery pilot run.

   Always: runs the engine over the bundled capture as of the capture date
   and the backtest over every captured company, and checks invariants that
   must hold on real data (no score outside 0-100, no look-ahead, every
   company in a chain scored).

   With DEMAND_PILOT=1 it also writes the outputs the page and the report
   read:

     DEMAND_PILOT=1 npx vitest run tests/demand-pilot.test.ts

   - public/data/demand-backtest.json   both backtest periods, summarised, plus
     the chain read quarter by quarter (the page runs the engine itself)
   - and, when DEMAND_TRANSCRIPTS points at a folder of transcripts
     (`SYMBOL-YEAR-Qn.txt`, header then `---`), public/data/demand-language.json
     with each call's score and at most three 25-word snippets each way.
     The transcripts themselves are never written into the repository. */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCapture } from '@/lib/demand-data';
import { analyseAll, analyseChain, type LanguageEntry } from '@/lib/demand-engine';
import { backtestCompany, bucketize, firstSignals, spearman, type BacktestRow } from '@/lib/demand-backtest';
import { readTranscript } from '@/lib/demand-language';
import { CHAINS, CHAIN_BY_ID } from '@/lib/demand-chains';
import { addDays, closeAfter, daysBetween } from '@/lib/demand-data';
import { isNum } from '@/lib/format';

const DATA = path.resolve(import.meta.dirname, '../public/data');
const capture = readCapture(JSON.parse(readFileSync(path.join(DATA, 'demand-capture.json'), 'utf8')));
const register = JSON.parse(readFileSync(path.join(DATA, 'demand-evidence.json'), 'utf8'));
const asOf = capture.capturedAt;
const WRITE = process.env.DEMAND_PILOT === '1';

function loadLanguage(): LanguageEntry[] {
  const dir = process.env.DEMAND_TRANSCRIPTS;
  if (dir && existsSync(dir)) {
    return readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => {
      const raw = readFileSync(path.join(dir, f), 'utf8');
      const head = Object.fromEntries(raw.split('\n---\n')[0].split('\n').map((l) => l.split(': ').map((s) => s.trim())));
      return { symbol: head.symbol, period: head.period, date: head.date, reading: readTranscript(raw) };
    });
  }
  const file = path.join(DATA, 'demand-language.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).calls : [];
}

const language = loadLanguage();
const results = analyseAll({ capture, register, asOf, language });

const rows: BacktestRow[] = Object.values(capture.companies)
  .filter((c) => c.prices.length > 50)
  .flatMap((c) => backtestCompany(c, capture.benchmarks.SPY.prices));

/* Out of sample: 1999 to mid-2017 filings, on history the bands were never
   looked at against. The forward windows end by mid-2018, inside the file. */
const history = readCapture(JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'fixtures/demand-history.json'), 'utf8')));
const oosRows: BacktestRow[] = Object.values(history.companies)
  .flatMap((c) => backtestCompany(c, history.benchmarks.SPY.prices, { from: '1999-01-01', to: '2017-06-30' }));

function summarise(rs: BacktestRow[]) {
  const all = rs.filter((r) => isNum(r.excess12));
  const shortageBucket = (r: BacktestRow) => (!isNum(r.shortage) ? null : r.shortage >= 60 ? '3 high (60+)' : r.shortage >= 40 ? '2 middle (40-60)' : '1 low (<40)');
  const pair = (f: (r: BacktestRow) => number | null) => {
    const ok = all.filter((r) => isNum(f(r)));
    return spearman(ok.map((r) => f(r)!), ok.map((r) => r.excess12!));
  };
  return {
    observations: rs.length,
    withTwelveMonths: all.length,
    byPhase: bucketize(rs, (r) => r.phase),
    byShortage: bucketize(rs, shortageBucket),
    byGlut: bucketize(rs, (r) => r.glut),
    byPricedIn: bucketize(rs, (r) => r.pricedIn),
    byDiscipline: bucketize(rs, (r) => (r.discipline === null ? null : r.discipline ? 'capex cut in a downturn' : 'no')),
    all: bucketize(rs, () => 'all'),
    spearmanShortage12: pair((r) => r.shortage),
    spearmanGlut12: pair((r) => r.glutRisk),
    spearmanAcceleration12: pair((r) => r.acceleration),
    spearmanImplied12: pair((r) => r.implied),
    firstInflections: firstSignals(rs, ['inflection', 'tight']),
    firstDownturns: firstSignals(rs, ['downturn']),
    firstSupplyCuts: firstSignals(rs, ['early-cycle']),
  };
}

/* The chain read through time: each layer's cohort and the upstream flags
   at every quarter end, with the next twelve months of each layer member. */
function propagation(chainId: string, from = '2021-01-01') {
  const chain = CHAIN_BY_ID[chainId];
  const out: any[] = [];
  for (let d = from; d <= asOf; d = addDays(d, 91)) {
    const r = analyseChain(chain, { capture, register, asOf: d });
    out.push({
      asOf: d,
      layers: r.layers.map((l) => ({
        id: l.layer.id,
        acceleration: l.cohort.acceleration,
        recentGrowth: l.cohort.recentGrowth,
        demandScore: l.cohort.demandScore,
        upstream: l.upstream.map((u) => u.from),
        next12: l.layer.members.map((m) => {
          const px = capture.companies[m.symbol]?.prices || [];
          const a0 = closeAfter(px, d);
          const a = a0 && daysBetween(d, a0.date) <= 14 ? a0 : null;
          const b = a ? closeAfter(px, addDays(a.date, 365)) : null;
          const sa = closeAfter(capture.benchmarks.SPY.prices, d);
          const sb = sa ? closeAfter(capture.benchmarks.SPY.prices, addDays(sa.date, 365)) : null;
          return { symbol: m.symbol, excess12: a && b && sa && sb && b.date <= asOf ? b.close / a.close - sb.close / sa.close : null };
        }),
      })),
    });
  }
  return out;
}

describe('the pilot on real data', () => {
  it('scores every chain member that has statements', () => {
    for (const r of results) {
      const expected = r.layers.filter((l) => l.layer.metric === 'rev').flatMap((l) => l.layer.members.map((m) => m.symbol))
        .filter((s) => capture.companies[s]);
      expect(r.companies.map((c) => c.symbol).sort()).toEqual(expected.sort());
    }
  });

  it('keeps every score inside 0–100', () => {
    for (const r of results) {
      for (const v of [r.demand_score, r.acceleration_score, r.supply_constraint_score]) if (isNum(v)) expect(v).toBeGreaterThanOrEqual(0);
      for (const c of r.companies) {
        for (const v of [c.shortage.score, c.glut.risk, c.quality.score, c.demand, c.supply, c.opportunity.base, c.opportunity.score]) {
          if (isNum(v)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
        }
      }
    }
  });

  it('never enters a backtest trade before the filing it trades on', () => {
    for (const r of rows) if (r.entry) expect(r.entry > r.filed).toBe(true);
  });

  it('runs the out-of-sample period without look-ahead either', () => {
    expect(oosRows.length).toBeGreaterThan(300);
    for (const r of oosRows) if (r.entry) expect(r.entry > r.filed).toBe(true);
  });

  it('writes the pilot outputs when asked', () => {
    if (!WRITE) return;
    /* Compact rows for the page: [filed, phase, shortage, glut risk,
       priced-in level, 12-month excess, 24-month excess, supply discipline]. */
    const compact = (rs: BacktestRow[]) => {
      const out: Record<string, unknown[][]> = {};
      const r1 = (v: number | null) => (isNum(v) ? Math.round(v * 1000) / 1000 : null);
      for (const r of rs) {
        (out[r.symbol] ||= []).push([r.filed, r.phase, r1(r.shortage), r1(r.glutRisk), r.pricedIn, r1(r.excess12), r1(r.excess24), r.discipline]);
      }
      return out;
    };
    writeFileSync(path.join(DATA, 'demand-backtest.json'), JSON.stringify({
      asOf,
      calcVersion: results[0]?.calcVersion,
      about: 'Point-in-time backtest of the Demand Discovery engine. In sample: filings 2019-06 to 2026, the period the rules were written in. '
        + 'Out of sample: filings 1999-01 to 2017-06, never looked at while writing the rules. Excess = stock return minus the S&P 500 ETF over the same dates.',
      rowColumns: ['filed', 'phase', 'shortage', 'glutRisk', 'pricedIn', 'excess12', 'excess24', 'discipline'],
      inSample: { period: 'filings 2019-06 to 2026-09', summary: summarise(rows), rows: compact(rows) },
      outOfSample: { period: 'filings 1999-01 to 2017-06', summary: summarise(oosRows), rows: compact(oosRows) },
      propagation: { 'ai-compute': propagation('ai-compute', '2021-03-31'), 'copper-electrification': propagation('copper-electrification', '2021-03-31') },
    }));
    if (process.env.DEMAND_TRANSCRIPTS) {
      writeFileSync(path.join(DATA, 'demand-language.json'), JSON.stringify({
        about: 'Scores from the rule-based transcript reader. Snippets are at most 25 words; the transcripts are not stored.',
        calls: language.map((l) => ({ ...l })),
      }, null, 1));
    }
  });
});
