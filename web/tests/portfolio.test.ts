import { describe, expect, it } from 'vitest';
import { holdingsFromCsv, holdingsToRows, portfolioHistory, portfolioTotals, positionOf, riskStats } from '@/lib/portfolio';

const lot = (date: string | null, shares: number, price: number | null, id = `${date}-${shares}`) => ({ id, date, shares, price });

describe('a position', () => {
  it('sums lots into shares, cost basis and gain', () => {
    const p = positionOf('AAA', { lots: [lot('2024-01-02', 10, 100), lot('2024-06-03', 10, 120)] }, 130);
    expect(p).toMatchObject({ shares: 20, costBasis: 2200, avgCost: 110, value: 2600, gain: 400, firstDate: '2024-01-02' });
    expect(p.gainPct).toBeCloseTo(400 / 2200, 10);
  });
  it('has no cost basis, and so no gain, when any lot lacks a price', () => {
    const p = positionOf('AAA', { lots: [lot('2024-01-02', 10, 100), lot(null, 5, null)] }, 130);
    expect(p).toMatchObject({ shares: 15, costBasis: null, gain: null, unpriced: 1, value: 1950 });
  });
  it('reads the old single share count when there are no lots', () => {
    expect(positionOf('AAA', { shares: 7 }, 10)).toMatchObject({ shares: 7, value: 70, costBasis: null });
  });
});

describe('totals', () => {
  const a = positionOf('A', { lots: [lot('2024-01-02', 10, 10)] }, 12);
  const b = positionOf('B', { lots: [lot('2024-01-02', 5, 20)] }, 18);
  it('adds up a fully sized list, the day included', () => {
    const t = portfolioTotals([a, b], { A: 20, B: -10 });
    expect(t).toMatchObject({ complete: true, costComplete: true, value: 210, cost: 200, gain: 10 });
    // A: 120 now, 100 yesterday (+20%); B: 90 now, 100 yesterday (−10%): +20 − 10 = +10
    expect(t.dayGain).toBeCloseTo(10, 10);
  });
  it('refuses a total over a partial list rather than treating the unsized as worthless', () => {
    const c = positionOf('C', {}, 50);
    const t = portfolioTotals([a, b, c], { A: 1, B: 1, C: 1 });
    expect(t).toMatchObject({ complete: false, sized: 2, holdings: 3, value: null, gain: null, dayGain: null });
  });
});

describe('the history', () => {
  const closes = {
    A: [
      { date: '2024-01-02', close: 10 }, { date: '2024-01-03', close: 11 }, { date: '2024-01-04', close: 11 },
      { date: '2024-01-05', close: 12.1 },
    ],
  };
  it('does not count money added as performance', () => {
    // 10 shares at 10, then 10 more at 11 on the 4th: value doubles that day, return does not.
    const h = portfolioHistory({ A: [lot('2024-01-02', 10, 10), lot('2024-01-04', 10, 11)] }, closes);
    expect(h.points.map((p) => p.value)).toEqual([100, 110, 220, 242]);
    expect(h.points.map((p) => p.invested)).toEqual([100, 100, 210, 210]);
    const twr = h.points.map((p) => Number(p.twr.toFixed(6)));
    expect(twr).toEqual([1, 1.1, 1.1, 1.21]);
  });
  it('names lots it cannot place and prices it did not get, instead of guessing', () => {
    const h = portfolioHistory({ A: [lot('2024-01-02', 1, 10), lot(null, 1, 10)], B: [lot('2024-01-02', 1, 5)] }, closes);
    expect(h.undated).toEqual(['A']);
    expect(h.unpriced).toEqual(['B']);
    expect(h.points[0].value).toBe(10);
  });
});

describe('risk', () => {
  it('waits for sixty sessions before printing anything', () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ date: `2024-02-${String(i + 1).padStart(2, '0')}`, value: 1, invested: 1, twr: 1 + i / 100 }));
    expect(riskStats(pts, [], 0.04).volatility).toBeNull();
  });
  it('computes a beta of one against itself and no drawdown on a steady rise', () => {
    const days = Array.from({ length: 120 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 0, 1 + i));
      return d.toISOString().slice(0, 10);
    });
    let level = 100;
    const bench = days.map((date, i) => { level *= 1 + (i % 2 ? 0.01 : -0.004); return { date, close: level }; });
    const pts = bench.map((b) => ({ date: b.date, value: b.close, invested: 100, twr: b.close / 100 }));
    const r = riskStats(pts, bench, 0.04);
    expect(r.beta).toBeCloseTo(1, 6);
    expect(r.volatility).toBeGreaterThan(0);
    expect(r.maxDrawdown).toBeLessThan(0); // the −0.4% days are small drawdowns
    expect(r.days).toBe(119);
  });
});

describe('importing holdings', () => {
  it('reads a broker export by its header names, deriving price from total cost', () => {
    const r = holdingsFromCsv('Symbol,Description,Quantity,Cost Basis,Date Acquired\r\nAAPL,Apple Inc,10,"$1,500.00",03/14/2024\r\nCash,,,,\r\nTotal,,,1500,\r\n');
    expect(r.columns).toMatchObject({ symbol: 'Symbol', shares: 'Quantity', total: 'Cost Basis', date: 'Date Acquired' });
    expect(r.rows).toEqual([{ line: 2, symbol: 'AAPL', shares: 10, price: 150, date: '2024-03-14' }]);
    // "Cash" is a valid-looking ticker with no shares, "Total" likewise: both skipped with a reason.
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });
  it('reads a headerless paste as symbol, shares, price, date — tabs or semicolons', () => {
    expect(holdingsFromCsv('msft\t5\t300\t2023-11-01\nnvda\t2').rows).toEqual([
      { line: 1, symbol: 'MSFT', shares: 5, price: 300, date: '2023-11-01' },
      { line: 2, symbol: 'NVDA', shares: 2, price: null, date: null },
    ]);
    expect(holdingsFromCsv('Ticker;Qty;Avg cost\nSAP.DE;3;123,45').rows[0]).toMatchObject({ symbol: 'SAP.DE', shares: 3, price: 123.45 });
  });
  it('writes holdings back out one row per lot', () => {
    expect(holdingsToRows(['A', 'B'], { A: { lots: [lot('2024-01-02', 1, 10), lot('2024-02-01', 2, 12)] }, B: { shares: 5 } })).toEqual([
      ['A', 1, 10, '2024-01-02'], ['A', 2, 12, '2024-02-01'], ['B', 5, null, null],
    ]);
  });
});
