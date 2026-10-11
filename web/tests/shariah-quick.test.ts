import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARIAH_STANDARDS, mcapAverages, quickInputs, quickPurification, quickScreen, shariahVerdict } from '@/lib/shariah';
import { INDEX_RULES } from '@/lib/shariah-v5';

/* The quick screen every ticker gets, on the bundled AAPL capture: averaged
   market cap from the month-end history, receivables, interest income, and
   purification for one share. */

const snap = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/AAPL.json'), 'utf8'));
const apple = { facts: { marketCap: snap.feeds.quote.marketCap, sector: 'Technology', industry: 'Consumer Electronics' }, ds: { get: (n: string) => snap.feeds[n] } };
const std = (k: string) => SHARIAH_STANDARDS.find((s) => s.key === k)!;

describe('averaged market capitalisation', () => {
  it('averages each window over the months before the newest point', () => {
    const m = mcapAverages(snap.feeds.marketCapHist);
    expect(m.to).toBe('2026-10-07');
    expect(m.m12! / 1e12).toBeGreaterThan(4.1);
    expect(m.m12! / 1e12).toBeLessThan(4.4);
    expect(m.m36! / 1e12).toBeGreaterThan(3.4);
    expect(m.m36! / 1e12).toBeLessThan(3.7);
    expect(m.m24!).toBeGreaterThan(m.m36!);
  });

  it('leaves a window blank when the history does not reach back to its start', () => {
    // Thirteen month-ends, October 2025 to October 2026: one year of history.
    const months = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    const m = mcapAverages(months.map((mo) => ({ date: `${mo}-28`, marketCap: 100 })));
    expect(m.m12).not.toBeNull();
    expect(m.m24).toBeNull();
    expect(m.m36).toBeNull();
  });
});

describe('the quick screen on Apple', () => {
  const inp = quickInputs(apple, snap.feeds.marketCapHist);

  it('counts long-term investments in cash, and reads trade receivables', () => {
    // Cash and short-term $54.7b + long-term $77.7b: the filing's $132.4b at FY2025 year-end.
    expect(inp.cashIbs).toBe(132_420_000_000);
    expect(inp.ar).toBe(39_777_000_000);
  });

  it('reads a zero interest line as not reported, never as a pass', () => {
    expect(inp.interestIncome).toBeNull();
    const aaoifi = quickScreen(inp, std('aaoifi'));
    expect(aaoifi.tests.find((t) => t.key === 'interest')!.state).toBe('na');
    expect('reason' in quickPurification(inp)).toBe(true);
  });

  it('divides by each provider\'s own average, and fails MSCI on total assets', () => {
    const sp = quickScreen(inp, std('sp'));
    expect(sp.averaged).toBe(true);
    expect(sp.basis).toBe('36-month market cap');
    expect(sp.state).toBe('pass');
    const msci = quickScreen(inp, std('msci'));
    expect(msci.tests.find((t) => t.key === 'cash')!.value).toBeCloseTo(132_420 / 359_241, 4);
    expect(msci.state).toBe('fail');
  });

  it('falls back to today\'s market cap without history, and says so', () => {
    const spot = quickScreen(quickInputs(apple), std('djim'));
    expect(spot.averaged).toBe(false);
    expect(spot.basis).toBe('Current market cap');
    expect(shariahVerdict(apple, std('djim')).state).toBe(spot.state);
  });
});

describe('purification for one share', () => {
  it('is interest after tax per share, split by the payout', () => {
    const p = quickPurification({
      asOf: null, totalDebt: 0, cashIbs: 0, cash: 0, longTermInvestments: 0, ar: 0, totalAssets: 1, revenue: 1_000,
      interestIncome: 100, taxRate: 0.2, epsDiluted: 5, dilutedShares: 10, dps: 1,
      mcap: mcapAverages([]), sector: null, industry: null,
    });
    if ('reason' in p) throw new Error(p.reason);
    expect(p.perShare).toBeCloseTo(8, 9);
    expect(p.payout).toBeCloseTo(0.2, 9);
    expect(p.dividendPart).toBeCloseTo(1.6, 9);
    expect(p.ratioMethod).toBeCloseTo(0.1, 9);
  });
});

describe('one definition of the five standards', () => {
  it('feeds the full screen the same limits the quick screen uses', () => {
    for (const s of SHARIAH_STANDARDS) {
      const r = INDEX_RULES.find((x) => x.key === s.key)!;
      expect([r.debtCap, r.cashCap, r.income]).toEqual([s.debt, s.liquid, s.income]);
    }
    expect(std('djim').debt).toBe(0.30);
    expect(std('ftse').divisor).toBe('marketCap');
  });
});
