import { describe, expect, it } from 'vitest';
import { csvFilename, parseCsv, parseDay, parseNumber, toCsv } from '@/lib/csv';
import { cleanSymbol, isSymbol, parseStore, sharesHeld } from '@/lib/watchlists';
import { exportColumns, type Column } from '@/lib/market-table';

describe('writing CSV', () => {
  it('quotes what needs quoting and doubles quotes', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], [1.5, null]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n1.5,\r\n');
  });
  it('defuses text a spreadsheet would run as a formula, but not numbers or placeholders', () => {
    const out = toCsv(['h'], [['=HYPERLINK("x")'], ['@SUM(A1)'], [-12.5], ['-12.5%'], ['-'], ['+44 20 7946']]);
    const lines = out.trim().split('\r\n');
    expect(lines[1]).toBe(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toBe("'@SUM(A1)");
    expect(lines[3]).toBe('-12.5');
    expect(lines[4]).toBe('-12.5%');
    expect(lines[5]).toBe('-');
    expect(lines[6]).toBe('+44 20 7946');
  });
  it('names files after what and when', () => {
    expect(csvFilename('AAPL', 'Income statement')).toMatch(/^mazvantage-aapl-income-statement-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(csvFilename(null, '  ')).toMatch(/^mazvantage-table-/);
  });
});

describe('reading CSV', () => {
  it('handles quotes, CRLF and a byte-order mark', () => {
    expect(parseCsv('﻿Symbol,Name\r\n"AAPL","Apple, Inc."\r\nMSFT,"Say ""hi"""\r\n')).toEqual([
      ['Symbol', 'Name'], ['AAPL', 'Apple, Inc.'], ['MSFT', 'Say "hi"'],
    ]);
  });
  it('detects semicolons and tabs', () => {
    expect(parseCsv('a;b\n1,5;2')).toEqual([['a', 'b'], ['1,5', '2']]);
    expect(parseCsv('a\tb\nx\ty')).toEqual([['a', 'b'], ['x', 'y']]);
  });
  it('reads numbers the way brokers write them', () => {
    expect(parseNumber('$1,234.50')).toBe(1234.5);
    expect(parseNumber('1.234,50')).toBe(1234.5);
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('(12.5)')).toBe(-12.5);
    expect(parseNumber('12%')).toBe(12);
    expect(parseNumber('n/a')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
  it('reads dates in the common export formats', () => {
    expect(parseDay('2024-03-14')).toBe('2024-03-14');
    expect(parseDay('03/14/2024')).toBe('2024-03-14');
    expect(parseDay('14/03/2024')).toBe('2024-03-14');
    expect(parseDay('2024/2/30')).toBeNull();
  });
});

describe('the watchlist store', () => {
  it('cleans symbols and refuses junk', () => {
    expect(cleanSymbol(' $brk-b ')).toBe('BRK-B');
    expect(isSymbol('MC.PA')).toBe(true);
    expect(isSymbol('^GSPC')).toBe(true);
    expect(isSymbol('<script>')).toBe(false);
  });
  it('normalises whatever is stored', () => {
    const s = parseStore({
      active: 'missing',
      lists: [{ id: 'a', name: 'One', symbols: ['aapl', 'AAPL', '', 'msft'], holdings: { aapl: { shares: '10', lots: [{ shares: 0 }, { shares: 5, price: 100, date: '2024-01-02' }] } } }, { name: 5 }],
    });
    expect(s.lists).toHaveLength(1);
    expect(s.active).toBe('a');
    expect(s.lists[0].symbols).toEqual(['AAPL', 'MSFT']);
    expect(s.lists[0].holdings.AAPL.lots).toHaveLength(1);
    expect(parseStore(null)).toEqual({ active: null, lists: [] });
  });
  it('sizes a holding from its lots once it has any, and never invents a size', () => {
    expect(sharesHeld({ shares: 10 })).toBe(10);
    expect(sharesHeld({ shares: 10, lots: [{ id: 'x', date: null, shares: 3, price: null }, { id: 'y', date: null, shares: 4, price: 1 }] })).toBe(7);
    expect(sharesHeld({})).toBeNull();
    expect(sharesHeld({ shares: 0 })).toBeNull();
  });
});

describe('exporting a column set', () => {
  const cols: Column[] = [
    { key: 'cap', label: 'Market cap', num: true, get: (r) => r.cap, fmt: (v) => `US$${(v / 1e9).toFixed(2)}b` },
    { key: 'yf', label: 'Yield', num: true, get: (r) => r.yf, fmt: (v) => `${(v * 100).toFixed(1)}%` },
    { key: 'yp', label: 'Growth', num: true, get: (r) => r.yp, fmt: (v) => `${v.toFixed(1)}%` },
    { key: 'sector', label: 'Sector', get: (r) => r.sector, fmt: (v) => v || 'n/a' },
  ];
  it('sends raw numbers, puts percentages in percent whichever way they are held, and blanks what is missing', () => {
    const out = exportColumns(cols, [
      { symbol: 'AAA', companyName: 'Alpha', cap: 2.5e9, yf: 0.031, yp: 12.5, sector: 'Tech' },
      { symbol: 'BBB', name: 'Beta', cap: null, yf: null, yp: null, sector: null },
    ]);
    expect(out.headers).toEqual(['Symbol', 'Name', 'Market cap', 'Yield (%)', 'Growth (%)', 'Sector']);
    expect(out.rows[0]).toEqual(['AAA', 'Alpha', 2.5e9, 3.1, 12.5, 'Tech']);
    expect(out.rows[1]).toEqual(['BBB', 'Beta', null, null, null, '']);
  });
});
