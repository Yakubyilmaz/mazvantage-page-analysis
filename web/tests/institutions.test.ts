// The big-banks 13F model (`lib/institutions.ts`) and the portfolio built on
// it, against a cut of the real Q1/Q2 2026 filings of all nine banks. The
// expected figures were computed separately, from the same rows, in Python.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fx = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'fixtures/bank-13f.json'), 'utf8'));
const DATES = [
  { date: '2026-06-30', year: 2026, quarter: 2 },
  { date: '2026-03-31', year: 2026, quarter: 1 },
  { date: '2025-12-31', year: 2025, quarter: 4 },
];

/* The connector, answered from the fixture. `fail` makes a filer's holdings
   read fail; `gated` makes every 13F read gated. */
const asked: string[] = [];
const fail = new Set<string>();
let gated = false;
vi.mock('@/lib/fmp', async (orig) => ({
  ...(await orig() as any),
  fetchFund13F: async (kind: string, cik: string, period: any) => {
    asked.push(`${kind}|${cik}`);
    if (gated) return { status: 'gated', data: null, message: 'not included in this FMP plan' };
    if (kind === 'dates') return { status: 'ok', data: DATES };
    if (fail.has(cik)) return { status: 'error', data: null, message: 'FMP returned HTTP 500' };
    return { status: 'ok', data: fx.holdings[cik]?.[`${period.year}-${period.quarter}`] ?? [] };
  },
  fetchCalendar: async (kind: string, from: string, to: string) => {
    asked.push(`calendar|${kind}|${from}|${to}`);
    return { status: 'ok', data: fx.splits.filter((r: any) => r.date >= from && r.date <= to) };
  },
  // For the end-to-end run: one listing per fixture company, and per-company
  // feeds that answer only the all-filer summary (the rest come back empty).
  fetchScreener: async () => ({
    status: 'ok',
    data: fx.symbols.map((symbol: string, i: number) => ({ symbol, companyName: `${symbol} Corp`, marketCap: (i + 1) * 1e10, sector: 'Technology', isEtf: false, isFund: false })),
  }),
  fetchFor: async (feed: string, symbol: string, extra: any) => {
    asked.push(`feed|${feed}|${symbol}|${extra?.lastQuarter ? `${extra.lastQuarter.year}Q${extra.lastQuarter.quarter}` : ''}`);
    return { status: 'ok', data: feed === 'holdersSummary' ? fx.summaries[symbol] ?? null : null };
  },
}));

const {
  BANKS, BANK_REQUESTS, filerHoldings, loadBankBook, longStock, mergeFilers, moveOf, pickQuarter,
  prevQuarter, quarterEnd, quorumOf, splitFactors, stakesOf, withBaseline,
} = await import('@/lib/institutions');
const { IDEA_BY_KEY, bagsFor, capFor, requestsFor, runIdea } = await import('@/lib/ideas');

beforeEach(() => { asked.length = 0; fail.clear(); gated = false; });

/** The nine banks' holdings straight from the fixture, as `loadBankBook` assembles them. */
const fromFixture = () => BANKS.map((b) => ({
  key: b.key,
  holdings: mergeFilers(b.filers.map((f) => filerHoldings(fx.holdings[f.cik]['2026-2'], fx.holdings[f.cik]['2026-1']))),
}));
const SPLITS = splitFactors(fx.splits, '2026-03-31', '2026-06-30');
const stakes = stakesOf(fromFixture(), SPLITS);
const raw = stakesOf(fromFixture(), new Map());

describe('quarters', () => {
  it('knows each quarter’s last day and the one before', () => {
    expect([1, 2, 3, 4].map((q) => quarterEnd({ year: 2024, quarter: q }))).toEqual(['2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31']);
    expect(prevQuarter({ year: 2026, quarter: 1 })).toEqual({ year: 2025, quarter: 4 });
  });
  it('reads the newest quarter most banks have filed with the one before, not the newest anyone filed', () => {
    const q2 = [DATES];
    const q1 = [DATES.slice(1)];
    // Six of nine banks have Q2 and Q1: that is two-thirds, so Q2.
    expect(pickQuarter([...Array(6).fill(q2), ...Array(3).fill(q1)])).toMatchObject({ year: 2026, quarter: 2 });
    // Five is not: step back to Q1 against Q4, which all nine have.
    expect(pickQuarter([...Array(5).fill(q2), ...Array(4).fill(q1)])).toMatchObject({ year: 2026, quarter: 1, date: '2026-03-31' });
    // A bank counts when any one of its filers has the pair.
    expect(pickQuarter([...Array(5).fill(q2), [DATES.slice(1), DATES], ...Array(3).fill(q1)])).toMatchObject({ quarter: 2 });
    expect(quorumOf(9)).toBe(6);
    expect(quorumOf(8)).toBe(6);
  });
});

describe('one filing to long stock', () => {
  const gs = fx.holdings['0000886982']['2026-2'];
  it('leaves options and principal-amount lines out, and merges a CUSIP reported several times', () => {
    const apple = gs.filter((r: any) => r.symbol === 'AAPL');
    expect(apple.some((r: any) => r.putCallShare)).toBe(true);
    const stock = apple.filter((r: any) => !r.putCallShare && r.sharesType === 'SH');
    const line = longStock(gs).get(stock[0].securityCusip)!;
    expect(line.shares).toBe(stock.reduce((s: number, r: any) => s + r.shares, 0));
    expect(longStock([{ securityCusip: 'X', symbol: 'X', shares: 10, value: 1, sharesType: 'PRN' }]).size).toBe(0);
  });
  it('matches quarters by CUSIP and names the position by the latest ticker', () => {
    const h = filerHoldings(
      [{ securityCusip: 'C1', symbol: 'NEW', shares: 120, value: 5, sharesType: 'SH' }],
      [{ securityCusip: 'C1', symbol: 'OLD', shares: 100, value: 4, sharesType: 'SH' }],
    );
    expect([...h.keys()]).toEqual(['NEW']);
    expect(h.get('NEW')).toEqual({ shares: 120, prevShares: 100, value: 5 });
  });
  it('names each move', () => {
    expect([moveOf(5, 0), moveOf(0, 5), moveOf(6, 5), moveOf(4, 5), moveOf(5, 5), moveOf(0, 0)])
      .toEqual(['new', 'sold', 'added', 'reduced', 'unchanged', 'none']);
  });
});

describe('splits', () => {
  it('finds Q2 2026’s two among the fixture’s names, and the window is (after, through]', () => {
    expect(Object.fromEntries(SPLITS)).toEqual({ BKNG: 25, KLAC: 10 });
    const row = (date: string) => ({ symbol: 'Z', date, numerator: 2, denominator: 1 });
    expect(splitFactors([row('2026-03-31')], '2026-03-31', '2026-06-30').size).toBe(0);
    expect(splitFactors([row('2026-06-30')], '2026-03-31', '2026-06-30').get('Z')).toBe(2);
  });
  it('applies a split once even if two reads of the calendar both return it, and multiplies two different ones', () => {
    const r = { symbol: 'Z', date: '2026-05-01', numerator: 1, denominator: 10 };
    expect(splitFactors([r, r], '2026-03-31', '2026-06-30').get('Z')).toBeCloseTo(0.1, 12);
    expect(splitFactors([r, { ...r, date: '2026-06-01', numerator: 3, denominator: 1 }], '2026-03-31', '2026-06-30').get('Z')).toBeCloseTo(0.3, 12);
  });
});

describe('across the nine banks, Q2 2026 against Q1', () => {
  it('without the split calendar, every bank “bought” Booking and KLA', () => {
    expect(raw.get('BKNG')).toMatchObject({ holders: 9, adders: 9, cutters: 0 });
    expect(raw.get('BKNG')!.change).toBeCloseTo(20.867454857708392, 9);
    expect(raw.get('KLAC')).toMatchObject({ adders: 9 });
  });
  it('with it, Booking was a net sale and KLA nearly flat', () => {
    expect(stakes.get('BKNG')).toMatchObject({ holders: 9, adders: 4, cutters: 5, shares: 63104314, prevShares: 72144100, split: 25 });
    expect(stakes.get('BKNG')!.change).toBeCloseTo(-0.12530180569166427, 12);
    expect(stakes.get('KLAC')).toMatchObject({ adders: 5, cutters: 4 });
    expect(stakes.get('KLAC')!.change).toBeCloseTo(0.03756708046924273, 12);
  });
  it('counts the ordinary names the same either way', () => {
    expect(stakes.get('MU')).toMatchObject({ holders: 9, adders: 8, cutters: 1, shares: 105003409, prevShares: 82564159 });
    expect(stakes.get('NVDA')).toMatchObject({ adders: 7, cutters: 2, shares: 1554055071 });
    expect(stakes.get('AAPL')).toMatchObject({ adders: 5, cutters: 4, shares: 891902021 });
    expect(stakes.get('DVN')).toMatchObject({ holders: 9, adders: 9 });
  });
});

describe('against every 13F filer', () => {
  const s = fx.summaries;
  it('catches Devon’s all-stock merger: nine banks up 77%, all filers up 92%', () => {
    const d = withBaseline(stakes.get('DVN')!, s.DVN);
    expect(d.change).toBeCloseTo(0.7706759174200695, 12);
    expect(d.allChange).toBeCloseTo(1054084757 / 549582357 - 1, 12);
    expect(d.excess!).toBeLessThan(0);
  });
  it('passes Micron, where the banks added 27% and all filers 3%', () => {
    const m = withBaseline(stakes.get('MU')!, s.MU);
    expect(m.excess).toBeCloseTo((105003409 / 82564159) / (885599099 / 856077507) - 1, 12);
    expect(m.ofCompany).toBeCloseTo(105003409 / (885599099 / 0.785106), 12);
    expect(m.ofCompanyBefore).toBeCloseTo(82564159 / (856077507 / 0.760958), 12);
    expect(m.stakeGain).toBeCloseTo(m.ofCompany! - m.ofCompanyBefore!, 15);
    expect(m.stakeGain!).toBeGreaterThan(0.015);
  });
  it('measures Booking’s earlier stake on that day’s pre-split share count', () => {
    const b = withBaseline(stakes.get('BKNG')!, s.BKNG);
    expect(b.ofCompanyBefore).toBeCloseTo(2885764 / (31664190 / 1.002031), 12);
    expect(b.stakeGain!).toBeLessThan(0);
  });
  it('shows why the rule is the all-filer comparison: Devon’s stake rose with nobody buying', () => {
    const d = withBaseline(stakes.get('DVN')!, s.DVN);
    expect(d.stakeGain!).toBeGreaterThan(0);
    expect(d.excess!).toBeLessThan(0);
  });
  it('is split-invariant: the same answer with or without the split calendar', () => {
    const adjusted = withBaseline(stakes.get('BKNG')!, s.BKNG);
    const unadjusted = withBaseline(raw.get('BKNG')!, s.BKNG);
    expect(adjusted.excess).toBeCloseTo(unadjusted.excess!, 12);
    expect(adjusted.excess!).toBeLessThan(0);
  });
  it('has no answer without a summary, rather than a guess', () => {
    expect(withBaseline(stakes.get('MU')!, null)).toMatchObject({ allChange: null, excess: null, ofCompany: null, stakeGain: null });
  });
});

describe('reading the banks', () => {
  it('costs exactly BANK_REQUESTS and reads all nine for Q2 2026', async () => {
    const book = await loadBankBook();
    expect(book).toMatchObject({ status: 'ok', read: 9, latest: { year: 2026, quarter: 2 }, previous: { year: 2026, quarter: 1, date: '2026-03-31' } });
    expect(asked.length).toBe(BANK_REQUESTS);
    expect(BANK_REQUESTS).toBe(35);
    expect(book.splits).toEqual({ read: true, applied: ['BKNG', 'KLAC'] });
    expect(book.stakes.get('BKNG')).toMatchObject({ adders: 4, cutters: 5 });
    // The calendar is read in two halves that together cover the quarter exactly.
    const cal = asked.filter((a) => a.startsWith('calendar')).map((a) => a.split('|').slice(2));
    expect(cal[0][0]).toBe('2026-04-01');
    expect(cal[1][1]).toBe('2026-06-30');
    expect(new Date(cal[1][0]).getTime() - new Date(cal[0][1]).getTime()).toBe(864e5);
  });
  it('adds BNP Paribas’s three filers together, and still reads the bank when one fails', async () => {
    fail.add('0000872786');
    const book = await loadBankBook();
    const bnp = book.banks.find((b) => b.key === 'bnp')!;
    expect(bnp.read).toBe(true);
    expect(bnp.filers.map((f) => f.state)).toEqual(['failed', 'read', 'read']);
    expect(book.read).toBe(9);
  });
  it('runs on six banks, refuses on five, and says which were missing', async () => {
    for (const b of BANKS.slice(0, 3)) for (const f of b.filers) fail.add(f.cik);
    expect(await loadBankBook()).toMatchObject({ status: 'ok', read: 6 });
    for (const f of BANKS[3].filers) fail.add(f.cik);
    const book = await loadBankBook();
    expect(book.status).toBe('error');
    expect(book.message).toContain('Only 5 of the 9 banks');
    expect(book.message).toContain('Goldman Sachs');
  });
  it('reports a plan gate as a gate', async () => {
    gated = true;
    expect(await loadBankBook()).toMatchObject({ status: 'gated', read: 0 });
  });
});

describe('the portfolio', () => {
  const idea = (IDEA_BY_KEY as any)['big-bank-buying'];
  const c = (sym: string, summary: any) => ({ banks: withBaseline(stakes.get(sym)!, summary) });
  const verdicts = (x: any) => idea.rules.map((r: any) => r.test(x));
  it('is filed under Institutional holders and reads the banks’ table first', () => {
    expect(idea).toMatchObject({ group: 'Institutional holders', title: 'Following the big banks', banks: true });
    // The thesis names three banks and "six other": keep it true.
    expect(BANKS.length).toBe(9);
    expect(idea.thesis).toContain('six other');
    expect(bagsFor(idea)).toEqual(['ratios', 'metrics', 'instSummary']);
    expect(requestsFor(idea)).toBe(1 + BANK_REQUESTS + capFor(idea) * 3);
  });
  it('keeps Micron, drops Devon on the last rule alone, and Booking on the buying rules', () => {
    expect(verdicts(c('MU', fx.summaries.MU))).toEqual([true, true, true, true]);
    expect(verdicts(c('DVN', fx.summaries.DVN))).toEqual([true, true, true, false]);
    expect(verdicts(c('BKNG', fx.summaries.BKNG))).toEqual([true, false, false, false]);
  });
  it('fails a company it could not measure, rather than passing it', () => {
    expect(verdicts({ banks: null }).some(Boolean)).toBe(false);
    expect(verdicts(c('MU', null))[3]).toBe(false);
  });
  it('sorts on banks adding, then on the rise in their stake, never jumping a count', () => {
    const at = (adders: number, stakeGain: number | null) => idea.sort({ banks: { adders, stakeGain } });
    expect(at(8, 0.05)).toBeGreaterThan(at(8, 0.02));
    expect(at(8, 0.02)).toBeGreaterThan(at(8, -0.01));
    expect(at(8, -0.01)).toBeGreaterThan(at(8, null));
    expect(at(8, 0.99)).toBeLessThan(at(9, -0.99));
  });
});

describe('one run, end to end', () => {
  const idea = (IDEA_BY_KEY as any)['big-bank-buying'];
  it('reads the banks, keeps what the free rules pass, and asks the summary for the filings’ quarter', async () => {
    const r: any = await runIdea(idea);
    expect(r.state).toBe('ok');
    expect(r.book.read).toBe(9);
    const free = idea.rules.slice(0, 3);
    const pool = fx.symbols.filter((s: string) => free.every((rl: any) => rl.test({ banks: stakes.get(s) })));
    expect(r.prefiltered).toBe(pool.length);
    expect(r.tested).toBe(pool.length);
    // Every company tested got its summary for Q2 2026, and nothing asked for the `banks` bag per company.
    const feeds = asked.filter((a) => a.startsWith('feed|'));
    expect(feeds.filter((a) => a.startsWith('feed|holdersSummary|')).every((a) => a.endsWith('|2026Q2'))).toBe(true);
    expect(new Set(feeds.map((a) => a.split('|')[2]))).toEqual(new Set(pool));
    expect(feeds.some((a) => a.includes('|undefined|'))).toBe(false);
    // Micron passes; Devon's merger and Booking's split do not.
    const passed = r.rows.map((c: any) => c.symbol);
    expect(passed).toContain('MU');
    expect(passed).not.toContain('DVN');
    expect(passed).not.toContain('BKNG');
    expect(r.rows.find((c: any) => c.symbol === 'MU').banks.excess).toBeCloseTo((105003409 / 82564159) / (885599099 / 856077507) - 1, 12);
  });
  it('tests the most widely bought first, not the largest', async () => {
    await runIdea(idea);
    const order = [...new Set(asked.filter((a) => a.startsWith('feed|')).map((a) => a.split('|')[2]))];
    const strength = (s: string) => idea.prerank({ banks: stakes.get(s) });
    expect(order).toEqual([...order].sort((a, b) => strength(b) - strength(a)));
  });
  it('stops at a failed read of the banks, before spending a screener call', async () => {
    gated = true;
    const r: any = await runIdea(idea);
    expect(r.state).toBe('gated');
    expect(asked.some((a) => a.startsWith('feed|'))).toBe(false);
  });
});
