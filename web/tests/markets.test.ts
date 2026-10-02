// Offline checks for the Market Data pages' pure helpers: the mover filter,
// the per-exchange sector averaging, Beat the Market's short-history rule, and
// how an economic series is printed.
import { test } from 'vitest';
import assert from 'node:assert/strict';

const { looksLikeStock, sectorRows } = await import('@/lib/movers');
const { shortHistory, benchmarkOf } = await import('@/lib/beat-market');
const { indicatorValue, periodOf, usMovement, releaseMovement, windowsFor, INDICATOR_RANGES } = await import('@/lib/economy-format');

test('the mover filter drops rights, warrants, units and leveraged funds, and keeps companies', () => {
  assert.equal(looksLikeStock({ symbol: 'NVDA', name: 'NVIDIA Corporation' }), true);
  assert.equal(looksLikeStock({ symbol: 'ABCDW', name: 'Acme Acquisition Corp' }), false);
  assert.equal(looksLikeStock({ symbol: 'ABCDU', name: 'Acme Acquisition Corp' }), false);
  assert.equal(looksLikeStock({ symbol: 'XYZ.WS', name: 'Xyz Holdings' }), false);
  assert.equal(looksLikeStock({ symbol: 'SOXL', name: 'Direxion Daily Semiconductor Bull 3X Shares' }), false);
  assert.equal(looksLikeStock({ symbol: 'TQQQ', name: 'ProShares UltraPro QQQ' }), false);
  assert.equal(looksLikeStock({ symbol: 'BAC-PL', name: 'Bank of America 7.25% Preferred' }), false);
});

test('a sector listed once per exchange becomes one row, averaged, best first', () => {
  const rows = sectorRows({ status: 'ok', data: [
    { sector: 'Energy', exchange: 'NASDAQ', averageChange: 1 },
    { sector: 'Energy', exchange: 'NYSE', averageChange: 3 },
    { sector: 'Utilities', exchange: 'NYSE', averageChange: -1 },
    { sector: 'Technology', exchange: 'NYSE', averageChange: 'n/a' },
  ] });
  assert.deepEqual(rows, [{ sector: 'Energy', change: 2, exchanges: 2 }, { sector: 'Utilities', change: -1, exchanges: 1 }]);
  assert.deepEqual(sectorRows({ status: 'skipped', data: null }), []);
});

test('a listing younger than the window is caught where the feed gives it away', () => {
  // IBIT: every long window is the same partial history.
  assert.equal(shortHistory({ '3Y': 72.81, '5Y': 72.81, max: 72.81 }), 'certain');
  // ARM: younger than five years, three-year figure differs — kept and marked.
  assert.equal(shortHistory({ '3Y': 428, '5Y': 354, max: 354 }), 'possible');
  assert.equal(shortHistory({ '3Y': 40, '5Y': 90, max: 300 }), null);
  assert.equal(benchmarkOf('QQQ').label, 'Nasdaq 100');
  assert.equal(benchmarkOf('nope').symbol, 'SPY');
});

test('a series is printed in the unit it was reported in', () => {
  assert.equal(indicatorValue(4.256, 'percent'), '4.26%');
  assert.equal(indicatorValue(24269.613, 'usdBn'), '$24.27T');
  assert.equal(indicatorValue(-88576, 'usdMn'), '−$88.6B');
  assert.equal(indicatorValue(159075, 'jobs'), '159.08M');
  assert.equal(indicatorValue(null, 'percent'), '—');
  assert.equal(periodOf('2026-07-01', 'quarter'), 'Q3 2026');
  assert.equal(periodOf('2026-09-01', 'month'), 'Sep 2026');
});

test('a rate moves in percentage points, a level in its own scale and per cent', () => {
  const rate = usMovement({ name: 'x', unit: 'percent', step: 'month', latest: { date: '2026-09-01', value: 2.4 }, previous: { date: '2026-08-01', value: 2.1 } });
  assert.equal(rate?.text, '+0.30 pp since Aug 2026');
  assert.equal(rate?.direction, 'is-up');
  const level = usMovement({ name: 'x', unit: 'usdBn', step: 'quarter', latest: { date: '2026-07-01', value: 24400 }, previous: { date: '2026-04-01', value: 24200 } });
  assert.equal(level?.text, '+$200B (+0.83%) since Q2 2026');
  const release = releaseMovement({ unit: '%', latest: { value: 2.1 }, previous: { value: 2.4, date: '2026-08-12 12:30:00' } });
  assert.equal(release?.text, '−0.30 pp since Aug 12, 2026');
});

test('a chart range states its cost: ninety days a request, the first window ninety-five (so a 366-day year is five)', () => {
  const cost = Object.fromEntries(INDICATOR_RANGES.map((r) => [r.id, windowsFor(r)]));
  assert.deepEqual(cost, { '3M': 1, '6M': 2, '9M': 3, '1Y': 5, '3Y': 13, '5Y': 21, '10Y': 41 });
});
