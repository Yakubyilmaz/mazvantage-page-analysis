// The Stock Screener's company filters — offline, against the bundled AAPL snapshot.
//
// What would go wrong quietly here is a filter reading a different number from
// the one the Statistics tab prints for the same company, or a filter whose
// feed list is short so it reads n/a for everyone and the screen comes back
// empty for a reason nobody can see. Both are checked against the report.
import { expect, test, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/AAPL.json'), 'utf8'));
const sectorStats = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/sector-stats.json'), 'utf8'));

// The network, replaced by the snapshot. The benchmark series come from the
// snapshot's extras, keyed by the symbols the engine asks for.
const requested: string[] = [];
vi.mock('@/lib/fmp', async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    fetchFor: async (feed: string, symbol: string) => {
      requested.push(`${symbol}|${feed}`);
      if (symbol === 'SPY' && feed === 'prices') return { status: 'ok', data: snap.extras.benchmarks.market };
      if (symbol === 'XLK' && feed === 'prices') return { status: 'ok', data: snap.extras.benchmarks.industry };
      if (symbol !== 'AAPL' || !(feed in snap.feeds)) return { status: 'skipped', data: null };
      return { status: 'ok', data: snap.feeds[feed] };
    },
  };
});
vi.mock('@/lib/grading', async (orig) => ({ ...(await orig() as any), loadSectorStats: async () => sectorStats }));

const { makeDataset } = await import('@/lib/fmp');
const { analyse, scoreLite } = await import('@/lib/model');
const { buildGroups } = await import('@/lib/statistics');
const { sectorLookup } = await import('@/lib/grading');
const F = await import('@/lib/screener-filters');

const same = (x: any, y: any) => (x == null && y == null)
  || (typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)));

/** The full report's figure for every Statistics row, as the tab prints it. */
function fullReport() {
  const feeds = Object.fromEntries(Object.entries(snap.feeds).map(([k, v]) => [k, { status: 'ok', data: v }]));
  const a = analyse(makeDataset('AAPL', feeds as any), { sectorStats, benchmarks: snap.extras.benchmarks, peerRatios: snap.extras.peerRatios });
  const out: Record<string, number | null> = {};
  for (const g of buildGroups(a)) for (const r of g.rows) if (r.kind) out[F.statId(g.key, r.label)] = r.raw ?? null;
  return out;
}

test('every numeric Statistics row is a filter with a feed list', () => {
  const rows = F.statRows();
  expect(rows.length).toBe(239);
  const ids = F.screenMetrics().map((m) => m.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const m of F.screenMetrics()) {
    expect(m.feeds.length, `${m.id} lists no feeds`).toBeGreaterThan(0);
  }
  // 6 of ours, 3 Wall Street, and the tab's 239 less its three printed twice.
  expect(F.screenMetrics().length).toBe(6 + 3 + 236);
  const labels = F.screenMetrics().map((m) => m.label);
  expect(new Set(labels).size, 'two filters share a label').toBe(labels.length);
});

test('each row\'s feed list alone reproduces the full report', () => {
  const full = fullReport();
  let checked = 0;
  for (const m of F.screenMetrics().filter((x) => x.id.startsWith('stat:'))) {
    if (full[m.id] == null) continue; // AAPL does not fill it; mapped by reading the code
    const have = new Set(m.feeds);
    const feeds = Object.fromEntries(Object.entries(snap.feeds).filter(([k]) => have.has(k)).map(([k, v]) => [k, { status: 'ok', data: v }]));
    const a = analyse(makeDataset('AAPL', feeds as any), { benchmarks: have.has('benchmarks') ? snap.extras.benchmarks : null });
    let got: any = null;
    for (const g of buildGroups(a)) for (const r of g.rows) if (F.statId(g.key, r.label) === m.id) got = r.raw;
    expect(same(got, full[m.id]), `${m.label}: ${got} with [${m.feeds}] vs ${full[m.id]} in the report`).toBe(true);
    checked++;
  }
  expect(checked).toBeGreaterThanOrEqual(214);
});

test('measuring a company through the engine gives the report\'s figures', async () => {
  const full = fullReport();
  const row: any = { symbol: 'AAPL', sector: 'Technology', marketCap: 3e12 };
  requested.length = 0;
  const all = F.screenMetrics();
  await F.measureRows([row], all);
  for (const m of all) expect(F.isMeasured(row, m), m.id).toBe(true);
  for (const m of all.filter((x) => x.id.startsWith('stat:'))) {
    expect(same(F.valueOf(row, m.id), full[m.id]), `${m.label}: ${F.valueOf(row, m.id)} vs ${full[m.id]}`).toBe(true);
  }
  // Our overall score is the two-feed lite score, as the Watchlist's column has it.
  const lookup = sectorLookup(sectorStats, 'Technology');
  const lite = scoreLite({ ratios: snap.feeds.ratiosTtm, metrics: snap.feeds.metricsTtm }, lookup);
  expect(F.valueOf(row, 'score:overall')).toBeCloseTo(lite.score, 9);
  expect(F.valueOf(row, 'ws:total')).toBeGreaterThan(0);

  // Nothing is fetched twice: a second pass over the same row costs nothing.
  const before = requested.length;
  await F.measureRows([row], all);
  expect(requested.length).toBe(before);
  expect(F.runCost([row], all)).toBe(0);
});

test('a later run without scores keeps the scores an earlier run computed', async () => {
  const row: any = { symbol: 'AAPL', sector: 'Technology' };
  await F.measureRows([row], [F.screenMetric('score:overall')!]);
  const score = F.valueOf(row, 'score:overall');
  expect(score).not.toBeNull();
  await F.measureRows([row], [F.screenMetric('stat:multiples:p-e')!, F.screenMetric('stat:momentum:excess-over-market')!]);
  expect(F.valueOf(row, 'score:overall')).toBe(score);
  expect(F.valueOf(row, 'stat:momentum:excess-over-market')).not.toBeNull();
});

test('typed thresholds', () => {
  expect(F.parseInput('money', '2b')).toBe(2e9);
  expect(F.parseInput('money', '1.5 T')).toBe(1.5e12);
  expect(F.parseInput('count', '250k')).toBe(250e3);
  expect(F.parseInput('pct', '12.5%')).toBeCloseTo(0.125, 12);
  expect(F.parseInput('pct', '−5')).toBeCloseTo(-0.05, 12);
  expect(F.parseInput('mult', '20x')).toBe(20);
  expect(F.parseInput('mult', '')).toBeNull();
  expect(F.parseInput('mult', 'abc')).toBeNull();
  expect(F.toInput('money', 2e9)).toBe('2b');
  expect(F.toInput('pct', 0.125)).toBe('12.5');
  expect(F.parseInput('money', F.toInput('money', 3.25e11))).toBe(3.25e11);
});

test('what passes', () => {
  const pe = F.screenMetric('stat:multiples:p-e')!;
  const margin = F.screenMetric('stat:margins:net-margin')!;
  const f = (op: any, value: any) => ({ id: 'x', metric: pe.id, op, value });
  expect(F.passes(f('lte', 20), pe, 15)).toBe(true);
  expect(F.passes(f('lte', 20), pe, -8)).toBe(false);       // a loss is not a low P/E
  expect(F.passes(f('lte', 20), pe, null)).toBe(false);     // unknown fails
  expect(F.passes(f('gte', 10), pe, 10)).toBe(true);
  expect(F.passes({ ...f('lte', -0.05), metric: margin.id }, margin, -0.2)).toBe(true); // negatives mean something here
  expect(F.passes(f('between', [10, null]), pe, 400)).toBe(true);
  expect(F.passes(f('between', [10, 20]), pe, 25)).toBe(false);
  expect(F.isActive(f('gte', null))).toBe(false);
  expect(F.isActive(f('between', [null, null]))).toBe(false);
  expect(F.filterText(f('lte', 20), pe)).toBe('P/E at most 20×');
});
