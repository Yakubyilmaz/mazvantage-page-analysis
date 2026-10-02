/* ==========================================================================
   Maz Vantage — Beat the Market (the rule)

   Port of the data half of the legacy `beatmarket.js`. One rule, applied
   twice: measure what the market returned over three years, then list
   everything that returned more — stocks on Market Data → Stocks, funds on
   Market Data → ETFs, same benchmark and same arithmetic on both.

   **The list has no membership, only a rule.** Nothing is stored, so the
   basket is recomputed from live returns every time it is opened: it can
   never be stale, and it cannot tell you *when* something joined or left.

   Three things about the number that the number does not say, each printed
   on the page: it is a price return, not a total return; a listing younger
   than the window reports its whole history in the 3Y field (`shortHistory`);
   and everything delisted in the last three years is missing, because the
   universe is whatever the screener returns today.
   ========================================================================== */

import { isNum } from './format';
import { fetchScreener, fetchHubFeed, hasApiKey } from './fmp';
import { dedupeStocks } from './markethub-data';

/**
 * The benchmarks the basket can be measured against. SPY first because "the
 * market" means the S&P 500 to most people asking; each of the others is the
 * same question asked of a different market, and costs one extra symbol.
 */
export const BENCHMARKS = [
  { symbol: 'SPY', label: 'S&P 500', note: 'The five hundred largest US companies, capitalisation-weighted.' },
  { symbol: 'QQQ', label: 'Nasdaq 100', note: 'The largest hundred non-financial companies on Nasdaq. A much higher bar than the S&P 500 over most three-year windows, and concentrated in technology.' },
  { symbol: 'IWM', label: 'Russell 2000', note: 'US small caps. A lower bar than the S&P 500 over most recent windows, so this list will be far longer.' },
  { symbol: 'ACWI', label: 'World', note: 'Developed and emerging markets together, in US dollars.' },
] as const;
export type Benchmark = (typeof BENCHMARKS)[number];
export const benchmarkOf = (symbol: string | null | undefined): Benchmark =>
  BENCHMARKS.find((b) => b.symbol === symbol) || BENCHMARKS[0];

/**
 * How many candidates to test. The universe is taken largest-first and cut
 * here, which is the one real distortion in the list — the biggest three-year
 * returns are usually *not* in the largest names — so it is a control with its
 * cost printed beside it. `stock-price-change` takes fifty symbols a call.
 */
export const SAMPLES = [250, 500, 1000, 2000];
export const CHUNK = 50;

const num = (row: any, key: string): number | null => {
  if (!row) return null;
  const v = typeof row[key] === 'string' ? Number(row[key]) : row[key];
  return isNum(v) ? v : null;
};

/**
 * Is this listing too young for the window it is measured over?
 *
 *   `certain`  three- and five-year figures identical: both are the same
 *              partial history. IBIT answers 72.81 to 3Y, 5Y, 10Y and max
 *              alike. Dropped.
 *   `possible` five-year and max identical, three-year different: younger
 *              than five years, and whether older than three the feed does
 *              not say. Kept and marked.
 *
 * Neither is a listing date; that is on the per-company profile, a request each.
 */
export function shortHistory(window: any): 'certain' | 'possible' | null {
  const y3 = num(window, '3Y'), y5 = num(window, '5Y'), max = num(window, 'max');
  const same = (a: number | null, b: number | null) => isNum(a) && isNum(b) && Math.abs(a - b) < 0.0001;
  if (same(y3, y5)) return 'certain';
  if (same(y5, max)) return 'possible';
  return null;
}

/** The whole candidate list's windows, fifty symbols a request. */
async function windowsOf(symbols: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += CHUNK) chunks.push(symbols.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map((c) => fetchHubFeed('priceChanges', { symbol: c.join(',') })));
  const out = new Map<string, any>();
  for (const r of results) {
    if (r.status !== 'ok') continue;
    for (const row of r.data || []) if (row?.symbol) out.set(String(row.symbol).toUpperCase(), row);
  }
  const failed = results.find((r) => r.status !== 'ok');
  return { windows: out, status: out.size ? 'ok' : failed?.status || 'ok', message: failed?.message || '' };
}

export interface BasketRow {
  symbol: string; name: string; sector: string; kind: 'etf' | 'stock';
  price: number | null; marketCap: number | null;
  y3: number; excess: number; y1: number | null; ytd: number | null; m1: number | null;
  short: 'possible' | null;
}
export type Basket =
  | { status: 'ok'; rows: BasketRow[]; benchY3: number; tested: number; dropped: number; universe: number; message: string }
  | { status: string; message: string };

export async function loadBasket({ kind, country, benchmark, sample }: {
  kind: 'stocks' | 'etfs'; country: string; benchmark: Benchmark; sample: number;
}): Promise<Basket> {
  const funds = kind === 'etfs';
  const noun = funds ? 'fund' : 'stock';
  if (!hasApiKey()) {
    return { status: 'skipped', message: `This basket is measured across the market, so it needs live data, which is unavailable right now. The rule itself is part of the page: a ${noun} is in it when its three-year price return beats the benchmark's, and out when it does not.` };
  }
  const [benchResult, universe] = await Promise.all([
    fetchHubFeed('priceChanges', { symbol: benchmark.symbol }),
    fetchScreener(funds
      ? { isEtf: true, isActivelyTrading: true, country, limit: 5000 }
      : { isEtf: false, isFund: false, isActivelyTrading: true, includeAllShareClasses: false, country, limit: 5000 }),
  ]);
  const benchWindow = (benchResult.status === 'ok' ? benchResult.data || [] : [])
    .find((row: any) => String(row.symbol).toUpperCase() === benchmark.symbol);
  const benchY3 = num(benchWindow, '3Y');
  if (!isNum(benchY3)) {
    return { status: benchResult.status === 'ok' ? 'unavailable' : benchResult.status,
      message: 'The benchmark’s own three-year return did not come back, so there is no line to beat. Nothing below it can be listed without it.' };
  }
  if (universe.status !== 'ok') return { status: universe.status, message: universe.message || `The ${noun} listings could not be loaded.` };

  const listings: any[] = funds
    ? [...new Map((universe.data || []).filter((r: any) => r?.symbol).map((r: any) => [r.symbol, r])).values()]
    : dedupeStocks(universe.data || [], { usOnly: country === 'US' });
  const candidates = [...listings].sort((a, b) => (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0)).slice(0, sample);
  const { windows, message } = await windowsOf(candidates.map((r) => String(r.symbol).toUpperCase()));

  let tested = 0, dropped = 0;
  const rows: BasketRow[] = [];
  for (const listing of candidates) {
    const window = windows.get(String(listing.symbol).toUpperCase());
    const y3 = num(window, '3Y');
    if (!isNum(y3)) continue;
    tested += 1;
    const short = shortHistory(window);
    if (short === 'certain') { dropped += 1; continue; }
    if (y3 <= benchY3) continue;
    rows.push({
      symbol: listing.symbol,
      name: listing.companyName || listing.name || listing.symbol,
      sector: listing.sector || '',
      kind: funds ? 'etf' : 'stock',
      price: Number(listing.price) || null,
      marketCap: Number(listing.marketCap) || null,
      y3, excess: y3 - benchY3,
      y1: num(window, '1Y'), ytd: num(window, 'ytd'), m1: num(window, '1M'),
      short,
    });
  }
  // A refused chunk leaves its symbols untested; `message` says why, and `tested` counts only what came back.
  return { status: 'ok', rows, benchY3, tested, dropped, universe: listings.length, message };
}
