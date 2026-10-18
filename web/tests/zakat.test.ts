/* Zakat on shares: the rates, the nisab, the three methods for a long-term
   holding, and NVIDIA's look-through share from the bundled balance sheet. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FCNA_PROXY, LUNAR_RATE, NISAB_GRAMS, SOLAR_RATE, figuresFrom, holdingBase, lookThrough, nisabValue, perGram, zakatDue,
} from '@/lib/zakat';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));

describe('rates and nisab', () => {
  it('2.5% on a lunar year, scaled by 365/354 on a solar one', () => {
    expect(LUNAR_RATE).toBe(0.025);
    expect(SOLAR_RATE).toBeCloseTo(0.025777, 6);
  });
  it('85 g of gold or 595 g of silver at the gram price', () => {
    expect(NISAB_GRAMS).toEqual({ gold: 85, silver: 595 });
    expect(nisabValue('gold', 100)).toBe(8500);
    expect(nisabValue('silver', 1.5)).toBeCloseTo(892.5, 10);
    expect(nisabValue('gold', null)).toBeNull();
    expect(perGram(3110.34768)).toBeCloseTo(100, 6);
  });
});

describe('one holding', () => {
  it('held to sell: the whole market value', () => {
    expect(holdingBase({ value: 10_000, intention: 'trading', method: 'lookthrough', look: 0.05 })).toMatchObject({ share: 1, base: 10_000 });
  });
  it('long-term, three ways', () => {
    expect(holdingBase({ value: 10_000, intention: 'long', method: 'lookthrough', look: 0.05 }).base).toBeCloseTo(500, 10);
    expect(holdingBase({ value: 10_000, intention: 'long', method: 'proxy', look: null }).base).toBeCloseTo(10_000 * FCNA_PROXY, 10);
    expect(holdingBase({ value: 10_000, intention: 'long', method: 'dividends', look: 0.05 })).toMatchObject({ share: 0, base: 0 });
  });
  it('look-through without the company’s figures gives no amount rather than a guess', () => {
    const h = holdingBase({ value: 10_000, intention: 'long', method: 'lookthrough', look: null });
    expect(h.base).toBeNull();
    expect(h.basis).toMatch(/not loaded/);
  });
});

describe('the company’s zakatable assets', () => {
  it('cash, receivables and inventory over market cap; a missing line counts as zero and is named', () => {
    expect(lookThrough({ cash: 10, receivables: 5, inventory: 5, marketCap: 400 })).toEqual({ share: 0.05, assets: 20, missing: [] });
    expect(lookThrough({ cash: 10, receivables: null, marketCap: 400 })).toEqual({ share: 0.025, assets: 10, missing: ['receivables', 'inventory'] });
    expect(lookThrough({ cash: 900, receivables: 200, inventory: 0, marketCap: 1000 }).share).toBe(1);
    expect(lookThrough({ cash: null, marketCap: 400 }).share).toBeNull();
  });
  it('deducts current liabilities only when asked, and names the line when it is missing', () => {
    const c = { cash: 300, receivables: 100, inventory: 100, currentLiabilities: 200, marketCap: 1000 };
    expect(lookThrough(c).assets).toBe(500);
    expect(lookThrough(c, { deductCurrentLiabilities: true })).toEqual({ share: 0.3, assets: 300, missing: [] });
    expect(lookThrough({ ...c, currentLiabilities: 900 }, { deductCurrentLiabilities: true }).share).toBe(0);
    expect(lookThrough({ ...c, currentLiabilities: null }, { deductCurrentLiabilities: true }).missing).toEqual(['current liabilities']);
    expect(figuresFrom({ cashAndShortTermInvestments: 1, totalCurrentLiabilities: 7 }, 10).currentLiabilities).toBe(7);
  });
  it('NVIDIA, from its fiscal 2026 balance sheet in the bundled copy', () => {
    const d = load('NVDA.json');
    const bal = d.feeds.balance[0];
    const f = figuresFrom(bal, d.feeds.quote.marketCap);
    expect(f.asOf).toBe('2026-01-25');
    const lt = lookThrough(f);
    // 62.556bn cash and short-term investments + 38.466bn receivables + 21.403bn inventory.
    expect(lt.assets).toBe(62_556_000_000 + 38_466_000_000 + 21_403_000_000);
    expect(lt.missing).toEqual([]);
    expect(lt.share).toBeCloseTo(lt.assets! / d.feeds.quote.marketCap, 12);
    expect(lt.share!).toBeLessThan(0.05);
  });
});

describe('the whole', () => {
  it('adds the other wealth, takes off debts due now, and tests the nisab', () => {
    const r = zakatDue([500, 3000, null], { cash: 4000, metals: 0, owedToYou: 500, goods: 0, debts: 1000 }, 8500, 'lunar');
    expect(r.wealth).toBe(7000);
    expect(r.aboveNisab).toBe(false);
    expect(r.due).toBe(0);
    const above = zakatDue([500, 3000], { cash: 10_000, debts: 500 }, 8500, 'solar');
    expect(above.wealth).toBe(13_000);
    expect(above.due).toBeCloseTo(13_000 * SOLAR_RATE, 8);
  });
  it('without a metal price the nisab is untested and no amount is given', () => {
    const r = zakatDue([20_000], {}, null, 'lunar');
    expect(r.aboveNisab).toBeNull();
    expect(r.due).toBeNull();
  });
});
