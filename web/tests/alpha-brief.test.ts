/* The Alpha Signal v2.0.0 rebuild (2026-10-09): the inputs it fixed and the
   brief the tab now leads with.

   Each check pins one of the readings that made the old tab wrong, so a later
   edit cannot bring it back quietly:
     * a 13F quarter is only read once its filings are all in;
     * a stock's return is compared with the market over the same days;
     * routine insider selling is not a vote against the company;
     * attention does not apply to a large cap, and leaves the reading;
     * a calendar date is not evidence;
     * the quarterly segment split beats the annual one;
     * the brief answers the three questions from the bundled AAPL copy. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lastCompleteQuarter } from '@/lib/fmp';
import { reportReaction, returnOver, runProviders } from '@/lib/alpha-providers';
import { scoreAlpha } from '@/lib/alpha-score';
import { disclosuresFor } from '@/lib/alpha-disclosures';
import { buildBrief, directionOf } from '@/lib/alpha-brief';

const DATA = path.resolve(import.meta.dirname, '../public/data');
const now = new Date('2026-10-09T20:00:00Z');
const ok = (data: unknown) => ({ status: 'ok', data });
const day = (d: string, price: number) => ({ date: d, price });
const find = (sigs: any[], key: string) => sigs.find((s) => s.key === key);

describe('the inputs', () => {
  it('reads a 13F quarter only once its 45-day filing window has closed', () => {
    expect(lastCompleteQuarter(new Date('2026-08-05T00:00:00Z'))).toEqual({ year: 2026, quarter: 1 });
    expect(lastCompleteQuarter(new Date('2026-08-20T00:00:00Z'))).toEqual({ year: 2026, quarter: 2 });
    expect(lastCompleteQuarter(new Date('2026-10-09T00:00:00Z'))).toEqual({ year: 2026, quarter: 2 });
    expect(lastCompleteQuarter(new Date('2026-02-20T00:00:00Z'))).toEqual({ year: 2025, quarter: 4 });
  });

  it('compares a stock with the market over the same window', () => {
    // The market keeps rising after the stock's series stops; the window must end with the stock.
    const bench = [day('2026-10-01', 130), day('2026-09-01', 120), day('2026-06-01', 100)];
    expect(returnOver(bench, 92)).toBeCloseTo(0.3);
    expect(returnOver(bench, 92, '2026-09-01')).toBeCloseTo(0.2);
  });

  it('reads the reaction to a report over the day before to the day after', () => {
    const stock = [day('2026-07-31', 90), day('2026-07-30', 99), day('2026-07-29', 100)];
    const market = [day('2026-07-31', 102), day('2026-07-30', 101), day('2026-07-29', 100)];
    const r = reportReaction(stock, market, '2026-07-30')!;
    expect(r.from).toBe('2026-07-29');
    expect(r.to).toBe('2026-07-31');
    expect(r.mine).toBeCloseTo(-0.10);
    expect(r.rel).toBeCloseTo(-0.12);
  });

  it('scores routine insider selling as neutral and only buying above it', () => {
    const q = (quarter: number, buys: number, sells: number) => ({ year: 2026, quarter, totalPurchases: buys, totalSales: sells, acquiredDisposedRatio: 0.2 });
    const selling = runProviders({ insiderStats: ok([q(3, 0, 8), q(2, 0, 14), q(1, 0, 0), q(4, 0, 11)]) }, { now });
    const sold = find(selling, 'insider.open-market-insider-activity');
    expect(sold.score).toBe(50);
    expect(sold.status).toBe('neutral');
    expect(selling.some((s) => s.key === 'insider.acquired-to-disposed-tilt')).toBe(false);
    const buying = runProviders({ insiderStats: ok([q(3, 2, 8), q(2, 0, 14), q(1, 0, 0), q(4, 0, 11)]) }, { now });
    expect(find(buying, 'insider.open-market-insider-activity').score).toBeGreaterThan(70);
  });

  it('marks attention not applicable for a large cap, and leaves it out of the reading', () => {
    const sigs = runProviders({ quote: ok({ marketCap: 4.5e12 }) }, { now });
    const att = sigs.filter((s) => s.category === 'attention');
    expect(att.length).toBe(1);
    expect(att[0].notApplicable).toBe(true);
    const r = scoreAlpha(sigs);
    const cat = r.categories.find((c: any) => c.id === 'attention');
    expect(cat.notApplicable).toBe(true);
    // Not a gap either: the share of weight it carries leaves the denominator.
    expect(r.coveragePct).toBe(0);
  });

  it('describes the next report date without scoring it', () => {
    const sigs = runProviders({ earnings: ok([{ date: '2026-11-02', epsEstimated: 1.99, revenueEstimated: 113.4e9 }]) }, { now });
    const next = find(sigs, 'catalysts.next-earnings-date');
    expect(next.score).toBeNull();
    expect(next.calculation).toMatch(/consensus EPS of 1.99/);
  });

  it('reads the revenue mix by quarter, against the same quarter a year earlier', () => {
    const seg = (date: string, period: string, a: number, b: number) => ({ date, fiscalYear: date.slice(0, 4), period, data: { A: a, B: b } });
    const sigs = runProviders({
      segProductQ: ok([seg('2026-06-27', 'Q3', 60, 40), seg('2026-03-28', 'Q2', 50, 50), seg('2025-12-27', 'Q1', 50, 50), seg('2025-09-27', 'Q4', 50, 50), seg('2025-06-28', 'Q3', 50, 50)]),
      segProduct: ok([{ date: '2025-09-27', data: { A: 10, B: 90 } }, { date: '2024-09-28', data: { A: 90, B: 10 } }]),
    }, { now });
    const mix = find(sigs, 'commercial.revenue-mix-shift');
    expect(mix.change).toBeCloseTo(0.10);
    expect(mix.calculation).toMatch(/same quarter a year earlier/);
  });
});

describe('the brief, on the bundled AAPL copy', () => {
  const snap = JSON.parse(readFileSync(path.join(DATA, 'AAPL.json'), 'utf8'));
  const bag: any = {};
  for (const [k, v] of Object.entries(snap.feeds)) bag[k] = { status: 'ok', data: v, fromSnapshot: true, date: snap.feedDates?.[k] || snap.capturedAt };
  bag.__snapshot = { capturedAt: snap.capturedAt, feedDates: snap.feedDates || {} };
  bag.__benchmarks = snap.extras.benchmarks;
  bag.__disclosures = disclosuresFor(JSON.parse(readFileSync(path.join(DATA, 'alpha-disclosures.json'), 'utf8')), 'AAPL');
  const result = scoreAlpha(runProviders(bag, { symbol: 'AAPL', marketCap: snap.feeds.profile.marketCap, now }));
  const brief = buildBrief(bag, result, now);

  it('answers the three questions, each with its facts', () => {
    expect(brief.blocks.map((b) => b.id)).toEqual(['business', 'expectations', 'market']);
    for (const b of brief.blocks) {
      expect(b.facts.length).toBeGreaterThan(2);
      expect(b.answer.length).toBeGreaterThan(20);
    }
  });

  it('does not read a mega cap as undercovered', () => {
    expect(result.categories.find((c: any) => c.id === 'attention').notApplicable).toBe(true);
  });

  it('puts the market’s verdict on the last report in the headline when it disagrees', () => {
    const market = brief.blocks.find((b) => b.id === 'market')!;
    if (market.direction !== brief.blocks[0].direction) expect(brief.headline).toMatch(/last report/);
    expect(brief.headline.startsWith(brief.blocks[0].answer)).toBe(true);
  });

  it('dates every block from its own inputs', () => {
    expect(brief.asOf.prices).toBe('2026-10-09');
    expect(brief.asOf.thirteenF).toBe('2026-06-30');
    expect(brief.blocks.every((b) => b.asOf)).toBe(true);
  });

  it('cuts the direction at 58 and 42', () => {
    expect(directionOf(58)).toBe('improving');
    expect(directionOf(57.9)).toBe('mixed');
    expect(directionOf(42)).toBe('deteriorating');
    expect(directionOf(null)).toBe('unmeasured');
  });
});
