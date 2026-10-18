/* Why is it moving: the session, the kind of day, the cause it leads with.

   The real case is Apple on 2026-10-09 from the bundled copy: down 1.6% from
   340.42 to 335.08 while the market fund fell, with a reported cut to iPhone
   component orders that morning. The rest are built by hand, one per rule. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dayLabel, moveOn, readMove, sessionOf, typicalMove, type Bar } from '@/lib/why-moving';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));

/** 80 sessions ending on `last`, wobbling ±1% a day around 100, then a final close. */
function series(last: string, finalMove: number, wobble = 0.01): Bar[] {
  const out: Bar[] = [];
  const end = new Date(`${last}T00:00:00Z`);
  let p = 100;
  for (let i = 80; i >= 1; i--) {
    const d = new Date(end.getTime() - i * 864e5).toISOString().slice(0, 10);
    p *= 1 + (i % 2 ? wobble : -wobble);
    out.push({ date: d, price: p });
  }
  out.push({ date: last, price: p * (1 + finalMove) });
  return out;
}

describe('the session', () => {
  it('uses the closes when the quote is older than them (a stale saved quote)', () => {
    const s = sessionOf({ quote: { changePct: -0.006, time: '2026-08-21T20:00:01Z' }, prices: [{ date: '2026-10-08', price: 340.42 }, { date: '2026-10-09', price: 335.08 }] });
    expect(s).toEqual({ date: '2026-10-09', prevDate: '2026-10-08', pct: 335.08 / 340.42 - 1 });
  });
  it('uses the quote intraday, measured from the last close before it', () => {
    const s = sessionOf({ quote: { changePct: 0.021, time: '2026-10-12T15:30:00Z' }, prices: [{ date: '2026-10-08', price: 1 }, { date: '2026-10-09', price: 1 }] });
    expect(s).toEqual({ date: '2026-10-12', prevDate: '2026-10-09', pct: 0.021 });
  });
  it('measures a benchmark on the same date and the typical day before it', () => {
    const bars = series('2026-10-09', -0.03);
    expect(moveOn(bars, '2026-10-09')).toBeCloseTo(-0.03, 10);
    expect(typicalMove(bars, '2026-10-09')).toBeCloseTo(0.01, 3);
  });
  it('labels the day', () => {
    expect(dayLabel('2026-10-17', '2026-10-17')).toBe('today');
    expect(dayLabel('2026-10-09', '2026-10-17')).toBe('on 9 Oct');
    expect(dayLabel('2025-12-31', '2026-10-17')).toBe('on 31 Dec 2025');
  });
});

describe('the kind of day', () => {
  const base = { symbol: 'XYZ', news: [], press: [], ratings: [], earnings: [], dividends: [], today: '2026-10-17' };
  it('an ordinary day is said to be one', () => {
    const r = readMove({ ...base, prices: series('2026-10-09', 0.002), market: series('2026-10-09', 0.001) })!;
    expect(r.kind).toBe('quiet');
    expect(r.line).toMatch(/^Up 0\.2% on 9 Oct, an ordinary move for it/);
  });
  it('a move the market made too is the market’s', () => {
    const r = readMove({ ...base, prices: series('2026-10-09', -0.025), market: series('2026-10-09', -0.022) })!;
    expect(r.kind).toBe('market');
    expect(r.line).toContain('in step with the market (−2.2%)');
  });
  it('the sector, when the market did not move but the sector fund did', () => {
    const r = readMove({ ...base, sectorName: 'XLE', prices: series('2026-10-09', -0.03), market: series('2026-10-09', 0.001), sector: series('2026-10-09', -0.028) })!;
    expect(r.kind).toBe('sector');
    expect(r.line).toContain('with its sector fund (XLE) (−2.8%)');
  });
  it('its own move, with nothing published, says so — and says so differently when the news was not loaded', () => {
    const own = readMove({ ...base, prices: series('2026-10-09', 0.04), market: series('2026-10-09', 0.001) })!;
    expect(own.kind).toBe('specific');
    expect(own.line).toBe('Up 4% on 9 Oct, 3.9 points better than the market (+0.1%). We found no company news that day to account for it.');
    const blind = readMove({ ...base, news: null, press: null, prices: series('2026-10-09', 0.04), market: series('2026-10-09', 0.001) })!;
    expect(blind.line).toMatch(/news was not loaded/);
    expect(blind.unread).toContain('news');
  });
});

describe('the cause it leads with', () => {
  const day = { symbol: 'XYZ', today: '2026-10-17', prices: series('2026-10-09', -0.05), market: series('2026-10-09', 0.0), press: [], dividends: [] };
  it('results in the window lead, with the figures from the feed', () => {
    const r = readMove({ ...day, news: [], ratings: [{ date: '2026-10-09', gradingCompany: 'Firm', previousGrade: 'Buy', newGrade: 'Hold', action: 'downgrade' }],
      earnings: [{ date: '2026-10-08', epsActual: 1.5, epsEstimated: 1.72, revenueActual: 94.1e9, revenueEstimated: 95e9 }] })!;
    expect(r.lead?.kind).toBe('earnings');
    expect(r.line).toContain('It reported quarterly results on 8 Oct: earnings per share $1.50 against $1.72 expected, revenue $94.1b against $95.0b; 1 more item that day.');
  });
  it('a downgrade leads a fall; an upgrade the same day is listed, not led with', () => {
    const r = readMove({ ...day, news: [], earnings: [], ratings: [
      { date: '2026-10-09', gradingCompany: 'Alpha', previousGrade: 'Hold', newGrade: 'Buy', action: 'upgrade' },
      { date: '2026-10-09', gradingCompany: 'Morgan Stanley', previousGrade: 'Overweight', newGrade: 'Equal Weight', action: 'downgrade' },
      { date: '2026-10-09', gradingCompany: 'Kept', previousGrade: 'Buy', newGrade: 'Buy', action: 'maintain' },
    ] })!;
    expect(r.lead?.text).toBe('Morgan Stanley downgraded it to Equal Weight from Overweight');
    expect(r.causes).toHaveLength(2);
  });
  it('a rating dated before the previous close belongs to an earlier session', () => {
    const r = readMove({ ...day, news: [], earnings: [], ratings: [{ date: '2026-10-08', gradingCompany: 'Old', previousGrade: 'Buy', newGrade: 'Sell', action: 'downgrade' }] })!;
    expect(r.causes).toHaveLength(0);
  });
  it('the ex-dividend date leads a fall it accounts for', () => {
    const small = { symbol: 'XYZ', today: '2026-10-17', prices: series('2026-10-09', -0.012, 0.004), market: series('2026-10-09', 0.002, 0.004), news: [], press: [], ratings: [], earnings: [] };
    const r = readMove({ ...small, dividends: [{ date: '2026-10-09', dividend: 1.1 }] })!;
    expect(r.lead?.kind).toBe('ex-dividend');
    expect(r.line).toMatch(/It went ex-dividend, so the \$1\.10 payout came off the price/);
  });
  it('a story whose verb points the other way is never the lead', () => {
    const r = readMove({ ...day, earnings: [], ratings: [], news: [{ title: 'XYZ raises full-year guidance', publishedDate: '2026-10-09 08:00:00', publisher: 'Wire' }] })!;
    expect(r.lead).toBeNull();
    expect(r.line).toContain('Nothing published that day points the way it moved (1 item listed).');
  });
});

describe('Apple, 9 Oct 2026, from the bundled copy', () => {
  const d = load('AAPL.json');
  const f = d.feeds;
  const r = readMove({
    symbol: 'AAPL', today: '2026-10-17', sectorName: 'XLK',
    quote: { price: f.quote.price, changePct: f.quote.changePercentage / 100, time: new Date(f.quote.timestamp * 1000).toISOString() },
    prices: f.prices, market: d.extras.benchmarks.market, sector: d.extras.benchmarks.industry,
    news: f.news, press: f.pressReleases ?? null, ratings: f.gradeActions, earnings: f.earnings, dividends: f.dividends,
  })!;
  it('reads the 9 Oct session from the closes, not the August quote', () => {
    expect(r.date).toBe('2026-10-09');
    expect(r.prevDate).toBe('2026-10-08');
    expect(r.pct).toBeCloseTo(335.08 / 340.42 - 1, 10);
  });
  it('leads with the reported order cut, from the outlet that had it first', () => {
    // Three copies that morning: Reuters at 02:05, Finbold at 05:07, 24/7 Wall
    // Street's recap at 09:31. The story is led by the earliest.
    expect(r.lead?.kind).toBe('story');
    expect(r.lead?.direction).toBe('down');
    expect(r.lead?.source).toBe('Reuters');
    expect(r.line).toMatch(/^Down 1\.6% on 9 Oct/);
    expect(r.line).toContain('The main company story that day: “Apple cuts iPhone 18 Pro orders due to soft demand, Nikkei Asia reports” (Reuters)');
  });
});
