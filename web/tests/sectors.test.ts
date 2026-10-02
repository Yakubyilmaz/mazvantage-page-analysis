// Offline checks for the sector pages' pure helpers: the treemap geometry,
// the median read off a binned distribution, the date alignment behind every
// comparison chart, and the one-company-one-row universe.
import { test } from 'vitest';
import assert from 'node:assert/strict';

const { squarify } = await import('@/lib/treemap');
const { medianOfBins, align, thin, buildUniverse, parentSectorOf, capWeightedDay, averageFor } = await import('@/lib/sectors');

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

test('the treemap fills the box exactly, every tile inside it, each sized by its value', () => {
  const weights = [30, 20, 15, 12, 8, 6, 4, 3, 1.5, 0.5];
  const total = weights.reduce((a, b) => a + b, 0);
  const tiles = squarify(weights.map((w, i) => ({ id: i, value: w / total })));
  assert.equal(tiles.length, weights.length);
  const area = tiles.reduce((a, t) => a + t.w * t.h, 0);
  assert.ok(near(area, 100 * 100, 1e-6), `area ${area}`);
  for (const t of tiles) {
    assert.ok(t.x >= -1e-9 && t.y >= -1e-9 && t.x + t.w <= 100 + 1e-9 && t.y + t.h <= 100 + 1e-9, `tile ${t.id} escapes the box`);
    assert.ok(near(t.w * t.h, (t.value) * 10000, 1e-6), `tile ${t.id} area is not its share`);
  }
});

test('the treemap drops zero and negative tiles rather than drawing slivers', () => {
  const tiles = squarify([{ value: 1 }, { value: 0 }, { value: -2 }]);
  assert.equal(tiles.length, 1);
  assert.deepEqual([tiles[0].x, tiles[0].y, tiles[0].w, tiles[0].h], [0, 0, 100, 100]);
});

test('squarified tiles stay squarer than slicing would make them', () => {
  const tiles = squarify(Array.from({ length: 11 }, () => ({ value: 1 / 11 })));
  const worst = Math.max(...tiles.map((t) => Math.max(t.w / t.h, t.h / t.w)));
  // Eleven equal slices of a square would be 11:1; squarified stays near square.
  assert.ok(worst < 3, `worst aspect ${worst}`);
});

test('the median is interpolated inside the bin the halfway company falls in', () => {
  // 10 companies, uniform over four bins of width 1.25 on a 0-5 scale.
  assert.ok(near(medianOfBins({ bins: [2.5, 2.5, 2.5, 2.5], max: 5 })!, 2.5));
  // Everything in the top bin: the median is halfway through it.
  assert.ok(near(medianOfBins({ bins: [0, 0, 0, 10], max: 5 })!, 4.375));
  assert.equal(medianOfBins({ bins: [], max: 5 }), null);
  assert.equal(medianOfBins({ bins: [0, 0], max: 5 }), null);
  assert.equal(medianOfBins(null), null);
});

test('two series are compared only on the dates both have, from the cut onwards', () => {
  const a = [{ date: '2026-01-02', price: 10 }, { date: '2026-01-03', price: 11 }, { date: '2026-01-05', price: 12 }];
  const b = [{ date: '2026-01-02', price: 100 }, { date: '2026-01-05', price: 90 }];
  assert.deepEqual(align(a, b, 0).map((p) => p.date), ['2026-01-02', '2026-01-05']);
  assert.deepEqual(align(a, b, Date.parse('2026-01-04')).map((p) => p.date), ['2026-01-05']);
});

test('thinning keeps the last point', () => {
  const list = Array.from({ length: 100 }, (_, i) => i);
  const out = thin(list, 10);
  assert.equal(out.at(-1), 99);
  assert.ok(out.length <= 11);
  assert.equal(thin([1, 2, 3], 10).length, 3);
});

test('the universe is one US line per company, weighted in dollars', () => {
  const u = buildUniverse({
    status: 'ok',
    data: [
      { symbol: 'NVDA', companyName: 'NVIDIA', sector: 'Technology', industry: 'Semiconductors', marketCap: 300, price: 10, exchangeShortName: 'NASDAQ' },
      { symbol: 'NVDA.NE', companyName: 'NVIDIA', sector: 'Technology', industry: 'Semiconductors', marketCap: 400, price: 14, exchangeShortName: 'NEO' },
      { symbol: 'AMD.BA', companyName: 'AMD', sector: 'Technology', industry: 'Semiconductors', marketCap: 1.36e15, price: 1, exchangeShortName: 'BUE' },
      { symbol: 'MSFT', companyName: 'Microsoft', sector: 'Technology', industry: 'Software', marketCap: 100, price: 5, exchangeShortName: 'NASDAQ' },
      { symbol: 'SPY', companyName: 'SPDR', isEtf: true, marketCap: 999, price: 5, exchangeShortName: 'NYSEARCA' },
    ],
  });
  assert.ok(u.ok);
  if (!u.ok) return;
  assert.deepEqual(u.rows.map((r) => r.symbol), ['NVDA', 'MSFT']);
  assert.equal(u.total, 400);
  assert.ok(near(u.rows[0].weight!, 0.75));
  assert.deepEqual(u.industries.map((i) => i.industry), ['Semiconductors', 'Software']);
  assert.equal(parentSectorOf(u), 'Technology');
});

test('the cap-weighted day counts only quoted members', () => {
  const u = buildUniverse({ status: 'ok', data: [
    { symbol: 'AAA', sector: 'X', industry: 'Y', marketCap: 300, price: 1, exchangeShortName: 'NYSE' },
    { symbol: 'BBB', sector: 'X', industry: 'Y', marketCap: 100, price: 1, exchangeShortName: 'NYSE' },
  ] });
  assert.ok(u.ok);
  if (!u.ok) return;
  assert.equal(capWeightedDay(u), null);
  u.rows[0].quoted = true; u.rows[0].change = 2;
  u.rows[1].quoted = true; u.rows[1].change = -2;
  assert.ok(near(capWeightedDay(u)!, 1));
});

test('a snapshot is averaged across the exchanges it lists a group on', () => {
  const res = { status: 'ok' as const, data: [
    { sector: 'Energy', exchange: 'NASDAQ', averageChange: 1 },
    { sector: 'Energy', exchange: 'NYSE', averageChange: 3 },
    { sector: 'Utilities', exchange: 'NYSE', averageChange: -1 },
  ] };
  assert.equal(averageFor(res, 'Energy', 'averageChange'), 2);
  assert.equal(averageFor(res, 'Materials', 'averageChange'), null);
  assert.equal(averageFor({ status: 'skipped', data: null }, 'Energy', 'averageChange'), null);
});
