import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  actionCounts, addMonths, insiderName, insiderRole, latestByFirm, monthlyFlows, monthsBetween, normaliseInsiderTrades,
  normaliseRatingActions, ratingSide, readAction, readInsiderRow, summariseInsiders,
} from '@/lib/insider-trading';

const snap = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/AAPL.json'), 'utf8'));
const { insiderHistory, gradeActions } = snap.feeds;

/* Two rows of Tim Cook's 2026-10-01 vesting, read live on 2026-10-07: the
   same 374,541 shares filed once as units going out and once as stock coming
   in, then 199,038 withheld for tax at the day's price. */
const COOK_VESTING = [
  { filingDate: '2026-10-05', transactionDate: '2026-10-01', transactionType: 'M-Exempt', securitiesOwned: 3654959, reportingName: 'COOK TIMOTHY D',
    typeOfOwner: 'director, officer: Executive Chair', acquisitionOrDisposition: 'A', directOrIndirect: 'D', formType: '4',
    securitiesTransacted: 374541, price: 0, securityName: 'Common Stock', url: 'https://www.sec.gov/Archives/edgar/data/320193/000114036126038674/0001140361-26-038674-index.htm' },
  { filingDate: '2026-10-05', transactionDate: '2026-10-01', transactionType: 'M-Exempt', securitiesOwned: 0, reportingName: 'COOK TIMOTHY D',
    typeOfOwner: 'director, officer: Executive Chair', acquisitionOrDisposition: 'D', directOrIndirect: 'D', formType: '4',
    securitiesTransacted: 374541, price: 0, securityName: 'Restricted Stock Unit', url: 'https://www.sec.gov/x' },
  { filingDate: '2026-10-05', transactionDate: '2026-10-01', transactionType: 'F-InKind', securitiesOwned: 3455921, reportingName: 'COOK TIMOTHY D',
    typeOfOwner: 'director, officer: Executive Chair', acquisitionOrDisposition: 'D', directOrIndirect: 'D', formType: '4',
    securitiesTransacted: 199038, price: 330.32, securityName: 'Common Stock', url: 'https://www.sec.gov/x' },
  { filingDate: '2026-10-05', transactionDate: '2026-10-02', transactionType: 'S-Sale', securitiesOwned: 3432778, reportingName: 'COOK TIMOTHY D',
    typeOfOwner: 'director, officer: Executive Chair', acquisitionOrDisposition: 'D', directOrIndirect: 'D', formType: '4',
    securitiesTransacted: 23143, price: 331.44, securityName: 'Common Stock', url: 'https://www.sec.gov/x' },
];

describe('names and roles', () => {
  it('undoes the capitals but keeps the SEC order', () => {
    expect(insiderName('COOK TIMOTHY D')).toBe('Cook Timothy D');
    expect(insiderName("O'BRIEN DEIRDRE")).toBe("O'Brien Deirdre");
    expect(insiderName('MCDONALD ROBERT A')).toBe('McDonald Robert A');
    expect(insiderName('SMITH-JONES ANNA III')).toBe('Smith-Jones Anna III');
    expect(insiderName('BERKSHIRE HATHAWAY INC')).toBe('Berkshire Hathaway Inc');
    expect(insiderName('ACME CAPITAL LLC')).toBe('Acme Capital LLC');
  });

  it('leaves a mixed-case name as the filer wrote it', () => {
    expect(insiderName('Newstead Jennifer')).toBe('Newstead Jennifer');
    expect(insiderName('  ')).toBe('Unnamed filer');
  });

  it('drops the form labels from a role', () => {
    expect(insiderRole('director, officer: Executive Chair')).toBe('Director, Executive Chair');
    expect(insiderRole('officer: SVP, GC and Secretary')).toBe('SVP, GC and Secretary');
    expect(insiderRole('officer: Senior Vice President,  CFO')).toBe('Senior Vice President, CFO');
    expect(insiderRole('10 percent owner')).toBe('10% owner');
    expect(insiderRole('director')).toBe('Director');
  });
});

describe('one filed row', () => {
  const [stock, units, tax, sale] = COOK_VESTING.map(readInsiderRow);

  it('reads the code, the direction and the money', () => {
    expect(sale).toMatchObject({ code: 'S', category: 'sell', label: 'Sale', direction: 'D', shares: 23143, price: 331.44 });
    expect(sale!.value).toBeCloseTo(23143 * 331.44, 2);
    expect(tax).toMatchObject({ code: 'F', category: 'tax', direction: 'D' });
  });

  it('gives an exercise no price rather than a price of zero', () => {
    expect(stock).toMatchObject({ category: 'exercise', direction: 'A', price: null, value: null, derivative: false });
  });

  it('marks stock units as derivative', () => {
    expect(units!.derivative).toBe(true);
    expect(readInsiderRow({ ...COOK_VESTING[0], securityName: 'Stock Option (Right to Buy)' })!.derivative).toBe(true);
    expect(readInsiderRow({ ...COOK_VESTING[0], securityName: 'Class A Common Stock' })!.derivative).toBe(false);
  });

  it('reads a Form 3 with no code as a holdings statement', () => {
    const r = readInsiderRow({ ...COOK_VESTING[0], transactionType: '', acquisitionOrDisposition: '', formType: '3', securitiesTransacted: 0 });
    expect(r).toMatchObject({ category: 'holding', label: 'Holdings statement', direction: null });
  });

  it('only links to sec.gov', () => {
    expect(readInsiderRow({ ...COOK_VESTING[0], url: 'https://example.com/x' })!.url).toBeNull();
    expect(stock!.url).toMatch(/^https:\/\/www\.sec\.gov\//);
  });
});

describe('months', () => {
  it('steps across a year end', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-11', 3)).toBe('2026-02');
    expect(addMonths('2026-09', -23)).toBe('2024-10'); // a 24-month range ending Sep 2026
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('charts a vesting once, not as a buy and a sale of the same size', () => {
    const rows = normaliseInsiderTrades(COOK_VESTING);
    const [oct] = monthlyFlows(rows, '2026-10', '2026-10');
    expect(oct.otherInShares).toBe(374541);
    expect(oct.otherOutShares).toBe(199038);
    expect(oct).toMatchObject({ sells: 1, sellShares: 23143, buys: 0, buyShares: 0 });
  });
});

describe('the AAPL capture', () => {
  const rows = normaliseInsiderTrades(insiderHistory);

  it('reads every row, newest first, and stops at the capture date', () => {
    expect(rows).toHaveLength(insiderHistory.length);
    expect(rows[0].date >= rows[rows.length - 1].date).toBe(true);
    expect(rows.every((r) => !r.filed || r.filed <= snap.capturedAt)).toBe(true);
    // The pull ended part-way through October 2022; that month was dropped.
    expect(rows[rows.length - 1].date >= '2022-11-01').toBe(true);
  });

  it('has no open-market purchases and sums its sales month by month', () => {
    const flows = monthlyFlows(rows, '2022-11', '2026-09');
    const sales = rows.filter((r) => r.category === 'sell' && !r.derivative);
    expect(flows.reduce((t, f) => t + f.buys, 0)).toBe(0);
    expect(flows.reduce((t, f) => t + f.sells, 0)).toBe(sales.length);
    expect(flows.reduce((t, f) => t + f.sellValue, 0)).toBeCloseTo(sales.reduce((t, r) => t + (r.value ?? 0), 0), 2);
  });

  it('summarises a window: net is purchases less sales, traders ranked by money moved', () => {
    const s = summariseInsiders(rows, '2025-09-01');
    expect(s.buys.trades).toBe(0);
    expect(s.sells.trades).toBeGreaterThan(0);
    expect(s.net).toBeCloseTo(-s.sells.value, 2);
    const moved = s.top.map((p) => p.bought + p.sold);
    expect(moved).toEqual([...moved].sort((x, y) => y - x));
  });
});

describe('rating actions', () => {
  it('reads the action, and a first rating as coverage starting', () => {
    expect(readAction('upgrade', 'Hold')).toBe('upgrade');
    expect(readAction('downgrade', 'Buy')).toBe('downgrade');
    expect(readAction('maintain', 'Buy')).toBe('maintain');
    expect(readAction('maintain', null)).toBe('initiate');
    expect(readAction('init', null)).toBe('initiate');
  });

  it('puts each firm’s word on a side, sell first', () => {
    expect(ratingSide('Overweight')).toBe('buy');
    expect(ratingSide('Outperform')).toBe('buy');
    expect(ratingSide('Long Term Buy')).toBe('buy');
    expect(ratingSide('Underweight')).toBe('sell');
    expect(ratingSide('Underperform')).toBe('sell');
    expect(ratingSide('Reduce')).toBe('sell');
    expect(ratingSide('Market Perform')).toBe('hold');
    expect(ratingSide('Sector Weight')).toBe('hold');
    expect(ratingSide('Equal Weight')).toBe('hold');
    expect(ratingSide('Peer Perform')).toBe('hold');
    expect(ratingSide('Speculative')).toBeNull();
  });

  const rows = normaliseRatingActions(gradeActions);

  it('reads the AAPL capture newest first, and places every word in it', () => {
    expect(rows).toHaveLength(gradeActions.length);
    expect(rows[0].date >= rows[rows.length - 1].date).toBe(true);
    expect(rows.every((r) => ratingSide(r.to) !== null)).toBe(true);
    const all = actionCounts(rows, '0000');
    expect(all.upgrade).toBeGreaterThan(0);
    expect(all.downgrade).toBeGreaterThan(0);
    expect(all.upgrade + all.downgrade + all.maintain + all.initiate).toBe(rows.length);
  });

  it('keeps one latest call per firm inside the window', () => {
    const firms = latestByFirm(rows, '2025-09-22');
    expect(new Set(firms.map((f) => f.firm)).size).toBe(firms.length);
    for (const f of firms) {
      expect(f.date >= '2025-09-22').toBe(true);
      expect(rows.filter((r) => r.firm === f.firm).every((r) => r.date <= f.date)).toBe(true);
    }
  });
});
