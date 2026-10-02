import { describe, expect, it } from 'vitest';
import { formatMix, fundDataOf, lookThrough, normalise, parseMix, weightOf, type FundData } from '@/lib/fund-xray';

const ok = { info: 'ok', holdings: 'ok', sectors: 'ok', countries: 'ok' };
const fund = (symbol: string, holdings: [string, number][], sectors: [string, number][], expenseRatio: number | null = 0.1, countries: [string, string][] = [['United States', '100%']]): FundData =>
  fundDataOf(symbol, { name: `${symbol} fund`, expenseRatio },
    holdings.map(([asset, w]) => ({ asset, name: asset, weightPercentage: w })),
    sectors.map(([sector, w]) => ({ sector, weightPercentage: w })),
    countries.map(([country, w]) => ({ country, weightPercentage: w })), ok);

const A = fund('AAA', [['X', 50], ['Y', 30], ['Z', 20]], [['Technology', 80], ['Healthcare', 20]], 0.2);
const B = fund('BBB', [['X', 10], ['Y', 10], ['W', 80]], [['Technology', 20], ['Energy', 80]], 0.05);
const funds = new Map([[A.symbol, A], [B.symbol, B]]);

describe('the mix in the address bar', () => {
  it('round-trips, cleans symbols and drops duplicates and zero weights', () => {
    expect(parseMix('spy:60, qqq:40,SPY:10,bad:0')).toEqual([{ symbol: 'SPY', allocation: 60 }, { symbol: 'QQQ', allocation: 40 }]);
    expect(formatMix(parseMix('SPY:60,QQQ:40'))).toBe('SPY:60,QQQ:40');
  });
  it('normalises allocations to sum to one', () => {
    expect(normalise([{ symbol: 'A', allocation: 30 }, { symbol: 'B', allocation: 10 }]).map((l) => l.allocation)).toEqual([0.75, 0.25]);
  });
  it('reads a weight written as a number or as a percent string', () => {
    expect(weightOf(12.5)).toBe(0.125);
    expect(weightOf('14.98%')).toBeCloseTo(0.1498, 12);
    expect(weightOf('n/a')).toBeNull();
  });
});

describe('the look-through', () => {
  const x = lookThrough([{ symbol: 'AAA', allocation: 50 }, { symbol: 'BBB', allocation: 50 }], funds);
  it('blends sectors by allocation', () => {
    const tech = x.sectors.find((s) => s.name === 'Technology')!;
    expect(tech.weight).toBeCloseTo(0.5 * 0.8 + 0.5 * 0.2, 12);
    expect(tech.byFund).toEqual({ AAA: 0.4, BBB: 0.1 });
    expect(x.sectorsCovered).toBe(1);
  });
  it('adds the same holding across funds and remembers who holds it', () => {
    const X = x.holdings.find((h) => h.key === 'X')!;
    expect(X.weight).toBeCloseTo(0.5 * 0.5 + 0.5 * 0.1, 12);
    expect(X.funds).toEqual(['AAA', 'BBB']);
  });
  it('measures overlap as the sum of the smaller weights', () => {
    expect(x.pairs).toEqual([{ a: 'AAA', b: 'BBB', overlap: expect.closeTo(0.1 + 0.1, 12), common: 2 }]);
  });
  it('blends the fee over the funds that publish one', () => {
    expect(x.blendedFee).toBeCloseTo(0.125, 12);
    const noFee = new Map([[A.symbol, A], [B.symbol, { ...B, expenseRatio: null }]]);
    const y = lookThrough([{ symbol: 'AAA', allocation: 50 }, { symbol: 'BBB', allocation: 50 }], noFee);
    expect(y.blendedFee).toBeCloseTo(0.2, 12);
    expect(y.feeCovered).toBe(0.5);
  });
  it('reports how much of the mix a dimension covers when a fund publishes nothing for it', () => {
    const C = fund('CCC', [], [], 0.1, []);
    const z = lookThrough([{ symbol: 'AAA', allocation: 75 }, { symbol: 'CCC', allocation: 25 }], new Map([[A.symbol, A], [C.symbol, C]]));
    expect(z.holdingsCovered).toBe(0.75);
    expect(z.countriesCovered).toBe(0.75);
  });
});

describe('a fund’s lines', () => {
  it('keep a negative futures line and drop zero-weight ones', () => {
    const f = fundDataOf('F', null, [{ asset: 'ES', name: 'Future', weightPercentage: -0.5 }, { asset: 'Q', weightPercentage: 0 }, { asset: '', securityCusip: 'CASH1', name: 'US DOLLAR', weightPercentage: 1 }], [], [], ok);
    expect(f.holdings.map((h) => [h.key, h.weight])).toEqual([['ES', -0.005], ['CASH1', 0.01]]);
  });
});
