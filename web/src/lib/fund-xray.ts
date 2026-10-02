/* ==========================================================================
   Maz Vantage — Fund X-Ray (look-through)

   A mix of funds read as the one portfolio it really is: what it owns
   underneath, which sectors and countries that adds up to, how much the
   funds overlap, and what the mix costs a year. Morningstar's X-Ray is the
   model; the arithmetic is the plain weighted sum, and each figure is
   computed from the funds' own published holdings and weightings.

     exposure(s)  = Σ_f  allocation_f × weight_f(s)
     overlap(a,b) = Σ_h  min(weight_a(h), weight_b(h))

   The overlap is the share of one fund's money that sits in the same
   holdings as the other's, at the smaller of the two weights — the measure
   fund-overlap tools generally use. 100% is the same fund twice.

   What the page cannot see, and says:
   - Holdings are as the vendor last updated each fund, which differ.
   - A fund's lines do not always sum to 100%: cash, futures and swaps sit
     beside the stocks, and a futures line can be negative. They are kept,
     not rescaled away.
   - A fund that holds other funds is not looked through a second time.
   ========================================================================== */

import { isNum } from './format';
import { fetchEtfInfo, fetchHubFeed, mapLimited } from './fmp';

export const MAX_FUNDS = 6;

export interface MixLine { symbol: string; allocation: number }

/** `SPY:60,QQQ:40` ⇄ lines. Symbols upper-cased, letters/digits/dot/dash only. */
export function parseMix(raw: string | null | undefined): MixLine[] {
  if (!raw) return [];
  const out: MixLine[] = [];
  for (const part of raw.split(',')) {
    const [s, a] = part.split(':');
    const symbol = String(s || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
    const allocation = Number(a);
    if (symbol && Number.isFinite(allocation) && allocation > 0 && !out.some((l) => l.symbol === symbol)) out.push({ symbol, allocation });
  }
  return out.slice(0, MAX_FUNDS);
}
export const formatMix = (lines: MixLine[]) => lines.map((l) => `${l.symbol}:${+l.allocation.toFixed(4)}`).join(',');

/** Allocations as fractions summing to 1. */
export function normalise(lines: MixLine[]): MixLine[] {
  const total = lines.reduce((s, l) => s + l.allocation, 0);
  return total > 0 ? lines.map((l) => ({ ...l, allocation: l.allocation / total })) : [];
}

/** A weight the vendor wrote as 12.7, "12.7%" or "12.7 %", as a fraction. */
export const weightOf = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace('%', '').trim()) : v;
  return isNum(n) ? n / 100 : null;
};

export interface FundData {
  symbol: string;
  name: string | null;
  expenseRatio: number | null;
  /** underlying lines: key is the ticker when there is one, else the CUSIP or name */
  holdings: { key: string; symbol: string | null; name: string; weight: number }[];
  sectors: { name: string; weight: number }[];
  countries: { name: string; weight: number }[];
  updatedAt: string | null;
  status: { info: string; holdings: string; sectors: string; countries: string };
}

export function fundDataOf(symbol: string, info: any, holdings: unknown, sectors: unknown, countries: unknown,
  status: FundData['status']): FundData {
  const hs = (Array.isArray(holdings) ? holdings : []) as any[];
  return {
    symbol,
    name: info?.name ?? null,
    expenseRatio: isNum(info?.expenseRatio) ? info.expenseRatio : null,
    holdings: hs.map((h) => {
      const sym = typeof h?.asset === 'string' && h.asset.trim() ? h.asset.trim().toUpperCase() : null;
      return { key: sym || h?.securityCusip || h?.name || '?', symbol: sym, name: String(h?.name || sym || 'Unnamed line'), weight: weightOf(h?.weightPercentage) ?? 0 };
    }).filter((h) => h.weight !== 0),
    sectors: ((Array.isArray(sectors) ? sectors : []) as any[])
      .map((r) => ({ name: String(r?.sector || 'Unclassified'), weight: weightOf(r?.weightPercentage) ?? 0 })).filter((r) => r.weight > 0),
    countries: ((Array.isArray(countries) ? countries : []) as any[])
      .map((r) => ({ name: String(r?.country || 'Unclassified'), weight: weightOf(r?.weightPercentage) ?? 0 })).filter((r) => r.weight > 0),
    updatedAt: typeof hs[0]?.updatedAt === 'string' ? hs[0].updatedAt.slice(0, 10) : null,
    status,
  };
}

/* ---------- the look-through ------------------------------------------------------ */

export interface Exposure { name: string; weight: number; byFund: Record<string, number> }

/** Σ allocation × weight over one dimension, largest first; `covered` is the share of the mix that published it. */
function blend(mix: MixLine[], funds: Map<string, FundData>, pick: (f: FundData) => { name: string; weight: number }[]) {
  const map = new Map<string, Exposure>();
  let covered = 0;
  for (const l of mix) {
    const f = funds.get(l.symbol);
    const rows = f ? pick(f) : [];
    if (!rows.length) continue;
    covered += l.allocation;
    for (const r of rows) {
      const e = map.get(r.name) ?? { name: r.name, weight: 0, byFund: {} };
      const w = l.allocation * r.weight;
      e.weight += w;
      e.byFund[l.symbol] = (e.byFund[l.symbol] ?? 0) + w;
      map.set(r.name, e);
    }
  }
  return { rows: [...map.values()].sort((a, b) => b.weight - a.weight), covered };
}

export interface Underlying { key: string; symbol: string | null; name: string; weight: number; funds: string[] }

export function lookThrough(mixIn: MixLine[], funds: Map<string, FundData>) {
  const mix = normalise(mixIn);
  const sectors = blend(mix, funds, (f) => f.sectors);
  const countries = blend(mix, funds, (f) => f.countries);

  const under = new Map<string, Underlying>();
  let coveredHoldings = 0;
  for (const l of mix) {
    const f = funds.get(l.symbol);
    if (!f?.holdings.length) continue;
    coveredHoldings += l.allocation;
    for (const h of f.holdings) {
      const u = under.get(h.key) ?? { key: h.key, symbol: h.symbol, name: h.name, weight: 0, funds: [] };
      u.weight += l.allocation * h.weight;
      if (!u.funds.includes(l.symbol)) u.funds.push(l.symbol);
      under.set(h.key, u);
    }
  }
  const holdings = [...under.values()].sort((a, b) => b.weight - a.weight);

  const pairs: { a: string; b: string; overlap: number; common: number }[] = [];
  for (let i = 0; i < mix.length; i += 1) {
    for (let j = i + 1; j < mix.length; j += 1) {
      const A = funds.get(mix[i].symbol);
      const B = funds.get(mix[j].symbol);
      if (!A?.holdings.length || !B?.holdings.length) continue;
      const wb = new Map(B.holdings.map((h) => [h.key, h.weight]));
      let overlap = 0;
      let common = 0;
      for (const h of A.holdings) {
        const w = wb.get(h.key);
        if (w == null || h.weight <= 0 || w <= 0) continue;
        overlap += Math.min(h.weight, w);
        common += 1;
      }
      pairs.push({ a: A.symbol, b: B.symbol, overlap, common });
    }
  }

  const priced = mix.filter((l) => isNum(funds.get(l.symbol)?.expenseRatio));
  const pricedShare = priced.reduce((s, l) => s + l.allocation, 0);
  // Expense ratios are published in percent (0.09 = 0.09%), so the blend is too.
  const blendedFee = pricedShare > 0 ? priced.reduce((s, l) => s + l.allocation * (funds.get(l.symbol)!.expenseRatio as number), 0) / pricedShare : null;

  return {
    mix,
    sectors: sectors.rows, sectorsCovered: sectors.covered,
    countries: countries.rows, countriesCovered: countries.covered,
    holdings, holdingsCovered: coveredHoldings,
    top10: holdings.filter((h) => h.weight > 0).slice(0, 10).reduce((s, h) => s + h.weight, 0),
    pairs,
    blendedFee, feeCovered: pricedShare,
  };
}

/* ---------- loading ------------------------------------------------------------------ */

/** Four requests a fund: the record, the holdings, and the two weightings. */
export async function loadMix(symbols: string[]) {
  const loaded = await mapLimited(symbols, async (s) => {
    const [info, holdings, sectors, countries] = await Promise.all([
      fetchEtfInfo(s), fetchHubFeed('etfHoldings', { symbol: s }), fetchHubFeed('etfSectors', { symbol: s }), fetchHubFeed('etfCountries', { symbol: s }),
    ]);
    return fundDataOf(s, info.status === 'ok' ? info.data : null,
      holdings.status === 'ok' ? holdings.data : null, sectors.status === 'ok' ? sectors.data : null, countries.status === 'ok' ? countries.data : null,
      { info: info.status, holdings: holdings.status, sectors: sectors.status, countries: countries.status });
  }, 3);
  return new Map(loaded.map((f) => [f.symbol, f]));
}
