/* ==========================================================================
   Maz Vantage — the prefiltered stock screens (the data half of stockmarkets.js)

   Modelled on the market-movers screens a big terminal offers, and cut to what
   this vendor can answer. FMP's screener filters on market cap, price, beta,
   dividend, volume, sector, industry, exchange and country — so every screen
   below is one of those, applied by the vendor, and the whole list still
   costs the one request the page was already making.

   Deliberately absent, and named once rather than quietly missing:

   - **Top gainers, losers and most volatile.** The screener returns no
     session change at all; the vendor publishes those as separate mover feeds,
     US exchanges only.
   - **52-week and all-time highs, RSI, unusual volume.** These need a quote or
     a technical series per company: thousands of requests to filter a universe.

   `test` is the one thing done here rather than by the vendor: a yield is a
   dividend over a price and the screener filters on the dividend alone.
   ========================================================================== */

import { countryOf, dedupeStocks } from './markethub-data';
import { changeOf } from './market-format';
import { fetchBatchQuotes, fetchScreener, hasApiKey } from './fmp';

export interface Collection {
  id: string;
  title: string;
  group: string;
  params: Record<string, unknown>;
  note: string;
  test: ((row: any) => boolean) | null;
}

const screen = (id: string, title: string, group: string, params: Record<string, unknown> = {}, note = '', test: Collection['test'] = null): Collection =>
  ({ id, title, group, params, note, test });
const yieldOf = (row: any) => (Number(row.price) > 0 && Number(row.lastAnnualDividend) > 0
  ? Number(row.lastAnnualDividend) / Number(row.price) * 100 : null);

export const COLLECTIONS: Collection[] = [
  screen('all', 'All stocks', 'Everything', {}, 'Every listing the screener returns for this market.'),

  screen('mega', 'Mega-cap', 'Size', { marketCapMoreThan: 200e9 }, 'Companies worth more than $200bn.'),
  screen('large', 'Large-cap', 'Size', { marketCapMoreThan: 10e9 }, 'Companies worth more than $10bn.'),
  screen('mid', 'Mid-cap', 'Size', { marketCapMoreThan: 2e9, marketCapLowerThan: 10e9 }, 'Companies worth between $2bn and $10bn.'),
  screen('small', 'Small-cap', 'Size', { marketCapMoreThan: 300e6, marketCapLowerThan: 2e9 }, 'Companies worth between $300m and $2bn.'),
  screen('micro', 'Micro-cap', 'Size', { marketCapMoreThan: 50e6, marketCapLowerThan: 300e6 }, 'Companies worth between $50m and $300m.'),

  screen('penny', 'Penny stocks', 'Price and liquidity', { priceLowerThan: 5 }, 'Listings trading under $5 — a price, not a judgement of the company.'),
  screen('active', 'Actively traded', 'Price and liquidity', { volumeMoreThan: 1e6 }, 'More than a million shares in the latest session. Sort the volume column to rank them.'),
  screen('heavy', 'Heavily traded', 'Price and liquidity', { volumeMoreThan: 10e6 }, 'More than ten million shares in the latest session.'),

  screen('dividend', 'Dividend payers', 'Income', { dividendMoreThan: 0 }, 'Companies that declared a dividend over the trailing year.'),
  screen('highyield', 'High dividend yield', 'Income', { dividendMoreThan: 0 },
    'Trailing dividend over the latest price, above 3%. The yield is computed here — the screener filters on the dividend, not on the yield — so it is the rows of the dividend screen, narrowed.',
    (row) => (yieldOf(row) ?? 0) >= 3),

  screen('highbeta', 'High beta', 'Volatility', { betaMoreThan: 1.5 }, 'Beta above 1.5, as reported against the US market.'),
  screen('lowbeta', 'Low beta', 'Volatility', { betaMoreThan: 0, betaLowerThan: 0.5 }, 'Beta between zero and 0.5, as reported against the US market.'),
  screen('negbeta', 'Negative beta', 'Volatility', { betaLowerThan: 0 }, 'Companies reported as moving against the US market.'),

  ...[['energy', 'Oil and gas', 'Energy'], ['tech', 'Tech', 'Technology'], ['finance', 'Finance', 'Financial Services'], ['health', 'Healthcare', 'Healthcare'], ['consumer', 'Consumer discretionary', 'Consumer Cyclical']]
    .map(([id, title, sector]) => screen(id, title, 'Sectors', { sector }, `The ${sector} sector.`)),
  ...[['semiconductors', 'Semiconductors'], ['software', 'Software - Application'], ['banks', 'Banks - Diversified'], ['biotech', 'Biotechnology'], ['automakers', 'Auto - Manufacturers'], ['restaurants', 'Restaurants']]
    .map(([id, industry]) => screen(id, industry, 'Industries', { industry }, `The ${industry} industry.`)),
];

export const collectionOf = (id: string | null | undefined) => COLLECTIONS.find((c) => c.id === id) || COLLECTIONS[0];

export function stockScreenParams(code: string, collection = 'all') {
  return {
    isEtf: false, isFund: false, isActivelyTrading: true, includeAllShareClasses: false,
    ...(code === 'WORLD' ? {} : { country: countryOf(code).code }),
    ...collectionOf(collection).params, limit: 5000,
  };
}

/** Equal-weight session change per sector or industry. */
export function aggregatePerformance(rows: any[], field: string) {
  const groups = new Map<string, { name: string; total: number; count: number }>();
  for (const row of rows) {
    const change = changeOf(row);
    const name = row[field];
    if (!name || typeof change !== 'number' || !Number.isFinite(change)) continue;
    const group = groups.get(name) || { name, total: 0, count: 0 };
    group.total += change;
    group.count++;
    groups.set(name, group);
  }
  return [...groups.values()].map((g) => ({ ...g, change: g.total / g.count })).sort((a, b) => b.change - a.change);
}

const rowsOf = (result: any): any[] => (Array.isArray(result?.data) ? result.data : []);

/** The up-to-250 largest companies in a market, each joined to its session quote. */
export async function loadCountryPerformance(code: string): Promise<{ status: string; rows: any[] }> {
  if (!hasApiKey()) return { status: 'skipped', rows: [] };
  const universe = await fetchScreener(stockScreenParams(code));
  if (universe.status !== 'ok') return { ...universe, rows: [] };
  const companies = dedupeStocks(rowsOf(universe), { usOnly: code === 'US' })
    .sort((a: any, b: any) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 250);
  if (!companies.length) return { status: 'empty', rows: [] };
  const quotes = await fetchBatchQuotes(companies.map((r: any) => r.symbol));
  const by = new Map(rowsOf(quotes).map((r: any) => [r.symbol, r]));
  return {
    status: quotes.status,
    rows: companies.filter((r: any) => by.has(r.symbol))
      .map((r: any) => ({ ...r, ...by.get(r.symbol), sector: r.sector, industry: r.industry, changesPercentage: changeOf(by.get(r.symbol)) })),
  };
}
