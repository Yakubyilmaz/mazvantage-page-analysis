import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FUNDS, compareQuarters, consensusOf, fundByCik, normaliseCik, positionsOf, quartersOf, quartersStale,
} from '@/lib/superinvestors';

const cap = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/13f-capture.json'), 'utf8'));
const brk = cap.funds['0001067983'];
const now = positionsOf(brk.holdings['2026-2']);
const prev = positionsOf(brk.holdings['2026-1']);
const v = compareQuarters(now, prev);
const of = (s: string) => v.holdings.find((h) => h.symbol === s)!;

describe('Berkshire, Q2 2026 against Q1', () => {
  it('adds up to the vendor’s own portfolio value', () => {
    expect(v.total).toBe(299_253_556_246);
    expect(v.totalPrev).toBe(263_095_703_570);
    expect(now.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 12);
  });
  it('finds the one new position and the one sold out', () => {
    expect(v.holdings.filter((h) => h.move === 'new').map((h) => h.symbol)).toEqual(['DHI']);
    expect(v.soldOut.map((p) => p.symbol)).toEqual(['STZ']);
  });
  it('reads adds and trims from the shares, not the value', () => {
    expect(of('GOOGL').move).toBe('added');
    expect(of('GOOGL').change).toBeCloseTo(78_791_167 / 54_249_798 - 1, 12);
    expect(of('BAC').move).toBe('reduced');
    // Apple's value rose with its price; its share count did not move.
    expect(of('AAPL').move).toBe('unchanged');
  });
  it('keeps share classes apart, matched by CUSIP', () => {
    expect(of('LEN').cusip).not.toBe(of('LEN-B').cusip);
    expect(v.counts.positions).toBe(29);
  });
});

describe('a quarter’s extract', () => {
  it('merges a security filed on several lines, and keeps an option apart from the stock', () => {
    const rows = [
      { securityCusip: 'X1', symbol: 'AAA', nameOfIssuer: 'A', shares: 10, value: 100, putCallShare: '' },
      { securityCusip: 'X1', symbol: 'AAA', nameOfIssuer: 'A', shares: 5, value: 50, putCallShare: '' },
      { securityCusip: 'X1', symbol: 'AAA', nameOfIssuer: 'A', shares: 7, value: 70, putCallShare: 'Put' },
    ];
    const p = positionsOf(rows);
    expect(p).toHaveLength(2);
    expect(p.find((x) => !x.option)).toMatchObject({ shares: 15, value: 150 });
    expect(p.find((x) => x.option)?.option).toBe('put');
  });
});

describe('across funds', () => {
  it('counts a holder once per company and never counts a put as one', () => {
    const fund = (cik: string) => FUNDS.find((f) => f.cik === cik)!;
    const a = compareQuarters(positionsOf([
      { securityCusip: 'C1', symbol: 'GOOGL', nameOfIssuer: 'ALPHABET', shares: 1, value: 10 },
      { securityCusip: 'C2', symbol: 'GOOG', nameOfIssuer: 'ALPHABET', shares: 1, value: 10 },
      { securityCusip: 'C3', symbol: 'ZZZ', nameOfIssuer: 'Z', shares: 1, value: 10, putCallShare: 'Put' },
    ]), []);
    const b = compareQuarters(positionsOf([{ securityCusip: 'C1', symbol: 'GOOGL', nameOfIssuer: 'ALPHABET', shares: 1, value: 10 }]), []);
    const c = consensusOf([
      { fund: fund('0001067983'), holdings: a.holdings, soldOut: a.soldOut },
      { fund: fund('0001336528'), holdings: b.holdings, soldOut: b.soldOut },
    ]);
    expect(c.find((x) => x.symbol === 'GOOGL')?.holders).toBe(2);
    expect(c.find((x) => x.symbol === 'ZZZ')).toBeUndefined();
  });
});

describe('quarters and CIKs', () => {
  it('sorts filing dates newest first', () => {
    expect(quartersOf(brk.dates)[0]).toMatchObject({ year: 2026, quarter: 2 });
  });
  it('measures a filer’s lag against the 45-day deadline', () => {
    const oct1 = new Date('2026-10-01T00:00:00Z');
    expect(quartersStale({ year: 2026, quarter: 2 }, oct1)).toBe(0);
    expect(quartersStale({ year: 2026, quarter: 1 }, oct1)).toBe(1);
    // Q3 ended on 30 September; its filings are not due until mid-November.
    expect(quartersStale({ year: 2026, quarter: 2 }, new Date('2026-11-20T00:00:00Z'))).toBe(1);
  });
  it('pads a CIK to ten digits and finds the fund by it', () => {
    expect(normaliseCik(1067983)).toBe('0001067983');
    expect(fundByCik('1067983')?.name).toBe('Berkshire Hathaway');
    expect(new Set(FUNDS.map((f) => f.cik)).size).toBe(FUNDS.length);
  });
});
