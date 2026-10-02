// The price change timeline on the Research tab: the same arithmetic as the
// Momentum tab's returns, on the bundled AAPL closes, and the edges by hand.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETURN_SPANS, computeReturns, normalisePrices, ytdReturn } from '@/lib/model';
import { PERIODS, priceTimeline } from '@/lib/price-timeline';

const snap = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/AAPL.json'), 'utf8'));
const pts = normalisePrices(snap.feeds.prices);
const tl = priceTimeline(pts);
const of = (k: string) => tl.find((p) => p.key === k)!;

describe('AAPL, the bundled year of closes', () => {
  it('quotes every period the Momentum tab quotes, to the same number', () => {
    const r = computeReturns(pts, RETURN_SPANS);
    expect(of('1W').pct).toBeCloseTo(r['7D'], 12);
    for (const k of ['1M', '3M', '6M', '1Y'] as const) expect(of(k).pct).toBeCloseTo(r[k], 12);
    expect(of('YTD').pct).toBeCloseTo(ytdReturn(pts)!, 12);
  });
  it('marks three and five years unavailable rather than quoting a year under their names', () => {
    expect(of('3Y').available).toBe(false);
    expect(of('5Y').available).toBe(false);
    expect(of('3Y').pct).toBeNull();
  });
  it('draws each window from its base close to the last, and the change is last minus base', () => {
    for (const p of tl.filter((x) => x.available)) {
      expect(p.window[0]).toEqual(p.from);
      expect(p.window.at(-1)).toEqual(p.to);
      expect(p.change).toBeCloseTo(p.to!.price - p.from!.price, 9);
    }
    expect(of('ALL').window).toHaveLength(pts.length);
    // The snapshot opens four days inside the year: the 90% allowance, said so.
    expect(of('1Y').approx).toBe(true);
    expect(of('1Y').from).toEqual(pts[0]);
  });
  it('has nine periods in a fixed order', () => {
    expect(PERIODS.map((p) => p.key)).toEqual(['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL']);
  });
});

describe('the edges', () => {
  const day = (iso: string, price: number) => ({ date: iso, price });
  it('takes the last close on or before the start, not the first after it', () => {
    const s = [day('2026-01-01', 90), day('2026-01-30', 100), day('2026-02-02', 105), day('2026-03-02', 120)];
    // 30 days before 2 March is 31 January: the close on 30 January.
    const m = priceTimeline(s).find((p) => p.key === '1M')!;
    expect(m).toMatchObject({ available: true, approx: false, from: { price: 100 }, change: 20 });
    expect(m.pct).toBeCloseTo(0.2, 12);
  });
  it('opens the year to date on the previous year’s last close', () => {
    const s = [day('2025-12-31', 50), day('2026-01-02', 55), day('2026-06-01', 60)];
    expect(priceTimeline(s).find((p) => p.key === 'YTD')).toMatchObject({ from: { price: 50 }, approx: false });
  });
  it('needs two closes, and ignores ones without a price', () => {
    expect(priceTimeline([day('2026-01-01', 10)]).every((p) => !p.available)).toBe(true);
    expect(priceTimeline([day('2026-01-01', 10), { date: '2026-01-02', price: null }]).every((p) => !p.available)).toBe(true);
  });
});
