import { describe, expect, it } from 'vitest';
import {
  adx, atr, barsFromFeed, bollinger, candlePatterns, cci, ema, macd, pivots, resample, rsi, seasonality, sma,
  stochastic, technicalSummary, verdictOf, williamsR, wilder, type Bar,
} from '@/lib/technicals';

const bar = (date: string, o: number, h: number, l: number, c: number, v = 1000): Bar => ({ date, open: o, high: h, low: l, close: c, volume: v });

/** Consecutive weekdays from a start date. */
function days(start: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe('moving averages', () => {
  it('sma waits for a full window and averages it', () => {
    const s = sma([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
    expect(s.slice(0, 2)).toEqual([null, null]);
    expect(s[2]).toBe(2);
    expect(s[9]).toBe(9);
  });
  it('sma refuses a window with a hole in it', () => {
    expect(sma([1, null, 3, 4, 5], 3)).toEqual([null, null, null, null, 4]);
  });
  it('ema is seeded with the simple average, then alpha = 2/(n+1)', () => {
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e.slice(0, 2)).toEqual([null, null]);
    expect(e[2]).toBe(2);
    expect(e[3]).toBe(3);
    expect(e[4]).toBe(4);
  });
  it("wilder's smoothing uses alpha = 1/n", () => {
    const w = wilder([1, 2, 3, 4, 5], 3);
    expect(w[2]).toBe(2);
    expect(w[3]).toBeCloseTo(2.6667, 4);
    expect(w[4]).toBeCloseTo(3.4444, 4);
  });
});

describe('RSI', () => {
  // Wilder's worked example as StockCharts publishes it: the first 14-day RSI is 70.53.
  const closes = [44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931, 46.0328, 45.614,
    46.282, 46.282, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122];
  it('matches the published worked example', () => {
    const r = rsi(closes, 14);
    expect(r[13]).toBeNull();
    expect(r[14]).toBeCloseTo(70.53, 1);
    expect(r[15]).toBeCloseTo(66.32, 1);
    expect(r[16]).toBeCloseTo(66.55, 1);
  });
  it('is 100 when nothing ever fell and 50 when nothing moved', () => {
    expect(rsi(Array.from({ length: 20 }, (_, i) => 10 + i), 14).at(-1)).toBe(100);
    expect(rsi(Array.from({ length: 20 }, () => 10), 14).at(-1)).toBe(50);
  });
});

describe('bands, MACD and the range oscillators', () => {
  it('Bollinger bands collapse onto a flat price', () => {
    const b = bollinger(Array.from({ length: 25 }, () => 7), 20, 2);
    expect(b.upper.at(-1)).toBe(7);
    expect(b.lower.at(-1)).toBe(7);
  });
  it('Bollinger uses the population standard deviation', () => {
    const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 1);
    // population sd of that set is exactly 2, mean 5
    expect(b.middle.at(-1)).toBe(5);
    expect(b.upper.at(-1)).toBe(7);
    expect(b.lower.at(-1)).toBe(3);
  });
  it('MACD is zero on a flat price', () => {
    const m = macd(Array.from({ length: 60 }, () => 50));
    expect(m.macd.at(-1)).toBe(0);
    expect(m.signal.at(-1)).toBe(0);
  });
  const dates = days('2025-01-01', 60);
  const rising = dates.map((d, i) => bar(d, 100 + i, 101 + i, 99 + i, 100.5 + i));
  it('a steady climb reads overbought on %K and %R and trends on ADX', () => {
    expect(stochastic(rising, 9, 6).k.at(-1)).toBeGreaterThan(80);
    expect(williamsR(rising, 14).at(-1)).toBeGreaterThan(-20);
    const d = adx(rising, 14);
    expect(d.plusDI.at(-1)!).toBeGreaterThan(d.minusDI.at(-1)!);
    expect(d.adx.at(-1)!).toBeGreaterThan(20);
  });
  it('ATR of a constant 2-point range is 2', () => {
    const flat = dates.map((d) => bar(d, 100, 101, 99, 100));
    expect(atr(flat, 14).at(-1)).toBeCloseTo(2, 6);
    expect(cci(flat, 14).at(-1)).toBe(0);
  });
  it('the summary votes buy on a steady climb and says why it cannot vote on too little history', () => {
    const s = technicalSummary(rising);
    expect(s.verdict.ma).toBe('Strong Buy');
    // Sixty bars cannot fill a 100- or 200-day average: those are null, not substituted.
    const long = s.movingAverages.find((m) => m.period === 200)!;
    expect(long.simple.value).toBeNull();
    expect(long.simple.action).toBeNull();
    expect(technicalSummary([]).verdict.all).toBe('Not enough history');
  });
  it('verdict thresholds are the printed ones', () => {
    expect(verdictOf({ buy: 5, sell: 0, neutral: 5, counted: 10 })).toBe('Strong Buy');
    expect(verdictOf({ buy: 3, sell: 2, neutral: 5, counted: 10 })).toBe('Buy');
    expect(verdictOf({ buy: 2, sell: 2, neutral: 6, counted: 10 })).toBe('Neutral');
    expect(verdictOf({ buy: 0, sell: 6, neutral: 4, counted: 10 })).toBe('Strong Sell');
  });
});

describe('pivot points', () => {
  it('classic and Fibonacci from H 110, L 90, C 100', () => {
    const [classic, fib, cam, woodie, demark] = pivots({ open: 95, high: 110, low: 90, close: 100 });
    expect(classic).toMatchObject({ p: 100, r1: 110, s1: 90, r2: 120, s2: 80, r3: 130, s3: 70 });
    expect(fib.r1).toBeCloseTo(107.64, 6);
    expect(fib.s2).toBeCloseTo(87.64, 6);
    expect(cam.r3).toBeCloseTo(100 + (20 * 1.1) / 4, 6);
    expect(woodie.p).toBe(100);
    // Close above open: X = 2H + L + C = 410
    expect(demark).toMatchObject({ p: 102.5, r1: 115, s1: 95 });
  });
  it('DeMark is left empty without an open', () => {
    expect(pivots({ open: null, high: 110, low: 90, close: 100 })[4].p).toBeNull();
  });
});

describe('candlestick patterns', () => {
  it('finds a bullish engulfing after a fall, and only there', () => {
    const d = days('2025-03-03', 14);
    const bars = d.slice(0, 12).map((x, i) => bar(x, 120 - i * 2, 121 - i * 2, 117 - i * 2, 118 - i * 2));
    // a small red day, then a big green day that swallows it
    bars.push(bar(d[12], 97, 97.5, 95.5, 96));
    bars.push(bar(d[13], 95.5, 99, 95, 98.5));
    const hits = candlePatterns(bars, 5);
    expect(hits.some((h) => h.name === 'Bullish Engulfing' && h.barsAgo === 0 && h.direction === 'bullish')).toBe(true);
    expect(hits.some((h) => h.name === 'Bearish Engulfing')).toBe(false);
  });
  it('calls a long lower shadow a hammer after a fall and a hanging man after a rise', () => {
    const d = days('2025-05-01', 13);
    const falling = d.slice(0, 12).map((x, i) => bar(x, 100 - i, 100.5 - i, 98.5 - i, 99 - i));
    falling.push(bar(d[12], 88.6, 89, 85, 88.8));
    expect(candlePatterns(falling, 1).map((h) => h.name)).toContain('Hammer');
    const risingBars = d.slice(0, 12).map((x, i) => bar(x, 100 + i, 101.5 + i, 99.5 + i, 101 + i));
    risingBars.push(bar(d[12], 112.6, 113, 109, 112.8));
    expect(candlePatterns(risingBars, 1).map((h) => h.name)).toContain('Hanging Man');
  });
});

describe('resampling and seasonality', () => {
  it('rolls days into weeks: first open, extreme high and low, last close, summed volume', () => {
    const w = resample([
      bar('2025-06-02', 10, 12, 9, 11, 100), bar('2025-06-03', 11, 15, 10, 14, 200), bar('2025-06-06', 14, 14, 8, 9, 300),
      bar('2025-06-09', 9, 10, 8.5, 9.5, 50),
    ], 'week');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ date: '2025-06-06', open: 10, high: 15, low: 8, close: 9, volume: 600 });
    expect(w[1]).toMatchObject({ date: '2025-06-09', open: 9, close: 9.5 });
  });
  it('measures each complete month against the one before, and leaves out the month in progress', () => {
    const bars = [
      bar('2024-11-29', 1, 1, 1, 100), bar('2024-12-31', 1, 1, 1, 110), bar('2025-01-31', 1, 1, 1, 99),
      bar('2025-02-28', 1, 1, 1, 99), bar('2025-03-10', 1, 1, 1, 150),
    ];
    const s = seasonality(bars, new Date('2025-03-15T00:00:00Z'));
    expect(s.cells.map((c) => [c.year, c.month, Number(c.ret.toFixed(4))])).toEqual([[2024, 12, 0.1], [2025, 1, -0.1], [2025, 2, 0]]);
    const dec = s.months[11];
    expect(dec).toMatchObject({ years: 1, positive: 1 });
    expect(s.months[2].years).toBe(0); // March is still in progress
  });
  it('reads FMP rows in either order and drops rows it cannot use', () => {
    const bars = barsFromFeed([
      { date: '2025-01-03', open: 2, high: 3, low: 1, close: 2.5, volume: 10 },
      { date: '2025-01-02', close: '2', volume: null },
      { date: 'bad', close: 5 },
      { date: '2025-01-06', close: null },
    ]);
    expect(bars.map((b) => b.date)).toEqual(['2025-01-02', '2025-01-03']);
    expect(bars[0]).toMatchObject({ close: 2, open: null, high: null });
  });
});
