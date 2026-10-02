/* ==========================================================================
   Maz Vantage — the sector data

   Port of the data halves of the legacy `sectorsblock.js` and `sectorpage.js`.
   Everything here fetches or computes; nothing draws. The views are
   `components/market/sectors-block.tsx` and `components/pages/sectors-page.tsx`.

   Three grains of one question — what the market is made of, and how each part
   of it has done:

     - **Sectors**: eleven, each with a tracking ETF, so they get real return
       windows from `stock-price-change` (one request for all eleven funds).
     - **Industries**: about a hundred and thirty, with no fund and no grade
       distribution of their own, so the columns that would need either are
       left out rather than printed as n/a.
     - **Countries**: every market the Market Data picker offers, through the
       US-listed fund that tracks it.

   ---------------------------------------------------------------------------
   One company, one row, and its capitalisation in dollars
   ---------------------------------------------------------------------------

   `country=US` on the screener returns every listing of a US-domiciled
   company anywhere, and the vendor reports each one's market cap in the
   currency it trades in — Buenos Aires CEDEARs arrive with pesos in the field,
   `AMD.BA` at 1.36 *quadrillion*. Every weight here is summed only after
   `isUSListing` and `dedupe`, which leave the one line whose capitalisation
   and price are both in dollars.
   ========================================================================== */

import { isNum } from './format';
import {
  fetchScreener, fetchMarket, fetchHubFeed, fetchFor, fetchEtfInfo, hasApiKey, mapLimited,
  type FeedResult,
} from './fmp';
import { loadSectorStats, MAX_SCORE, type Histogram, type SectorStats, type SectorTable } from './grading';
import { normalisePrices, ytdReturn } from './model';
import { LISTED, dedupe } from './ideas';
import { SECTORS, SECTOR_ETF, MARKET_ETF } from './nav';
import { COUNTRIES, isUSListing, quoteMap } from './markethub-data';

/** How many companies a group page lists, quotes and offers to grade. */
export const TOP_N = 50;
/** How many of the group's companies the news call covers. */
export const NEWS_COVER = 30;
/** Members an industry index is built from, and members the fund search asks about. */
export const INDEX_MEMBERS = 10;
export const EXPOSURE_MEMBERS = 5;
/** Price points a comparison chart draws before it turns to mush. */
export const CHART_POINTS = 64;

/** The windows a comparison chart offers. */
export const WINDOWS = [
  { key: '1M', label: '1M', days: 30 },
  { key: '6M', label: '6M', days: 183 },
  { key: 'YTD', label: 'YTD', days: null },
  { key: '1Y', label: '1Y', days: 365 },
  { key: '5Y', label: '5Y', days: 1825 },
] as const;
export type WindowKey = (typeof WINDOWS)[number]['key'];

/** The market-wide screen every grain starts from: US, operating, over $100m. */
const MARKET_SCREEN = {
  country: 'US', isEtf: false, isFund: false, isActivelyTrading: true,
  includeAllShareClasses: false, marketCapMoreThan: 1e8, limit: 5000,
};

/* The sector block and the breakdown build their fund list the same way —
   same symbols, same order — so the two land on one cached request rather
   than two nearly identical ones. */
const FUNDS = [...new Set([...Object.values(SECTOR_ETF), MARKET_ETF])];

const rowsOf = (r: FeedResult | null | undefined): any[] => (Array.isArray(r?.data) ? r!.data : []);
const sixYearsAgo = () => new Date(Date.now() - 6 * 365 * 864e5).toISOString().slice(0, 10);

/* ==========================================================================
   Small readers
   ========================================================================== */

/** Average one group's rows across whatever exchanges the snapshot returned. */
export function averageFor(res: FeedResult | null | undefined, name: string, field: string): number | null {
  if (res?.status !== 'ok') return null;
  const rows = rowsOf(res).filter((r) => (r.sector || r.industry) === name && isNum(r[field]));
  if (!rows.length) return null;
  return rows.reduce((t, r) => t + r[field], 0) / rows.length;
}

/**
 * The middle of a binned distribution.
 *
 * The stats file stores the composite spread as counts per bin rather than as
 * quantiles, so the median is interpolated inside whichever bin the halfway
 * company falls in. Close enough to rank eleven sectors by, and the page says
 * it is read off a histogram rather than computed from the companies.
 */
export function medianOfBins(overall: Histogram | null | undefined): number | null {
  const bins = overall?.bins;
  if (!Array.isArray(bins) || !bins.length) return null;
  const total = bins.reduce((a, b) => a + b, 0);
  if (!total) return null;

  const width = (overall?.max ?? MAX_SCORE) / bins.length;
  let seen = 0;
  for (let i = 0; i < bins.length; i += 1) {
    if (seen + bins[i] >= total / 2) {
      const into = bins[i] ? (total / 2 - seen) / bins[i] : 0;
      return (i + into) * width;
    }
    seen += bins[i];
  }
  return null;
}

/** The median of one metric from a sector's distribution ladder. */
function medianMetric(tbl: SectorTable | null | undefined, id: string): number | null {
  const p = (tbl?.metrics?.[id] as any)?.p;
  return Array.isArray(p) && p.length === 21 ? p[10] : null;
}

/** A slug for an industry, which has no fixed list to look up. */
export const industrySlug = (name: string) => String(name || '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ==========================================================================
   The sector block — weights, session and the year
   ========================================================================== */

export interface BlockIndustry { name: string; weight: number; change: number | null; count: number }
export interface BlockSector extends BlockIndustry { ytd: number | null; industries: BlockIndustry[] }
export type BlockData =
  | { status: 'ok'; sectors: BlockSector[]; change: number | null; ytd: number | null; fundsStatus: string }
  | { status: string; message?: string };

/**
 * Weights and day changes, by sector and by industry.
 *
 * The screener is the only thing here that knows an industry's sector, so the
 * mapping is built from it rather than from the performance feeds — those
 * return a flat list with no parent.
 *
 * The year-to-date column is the tracking fund's, not the sector feed's:
 * `historical-sector-performance` is a *daily average change*, and compounding
 * nine months of equal-weight daily averages drifts from a real YTD by a wide
 * and unstateable margin. The tiles stay coloured by the *session*, because an
 * industry has no fund and therefore no year of its own.
 */
export async function loadSectorBlock(): Promise<BlockData> {
  if (!hasApiKey()) return { status: 'skipped' };

  const [universe, sectorPerf, industryPerf, changes] = await Promise.all([
    fetchScreener(MARKET_SCREEN),
    fetchMarket('sectorPerf'),
    fetchMarket('industryPerf'),
    fetchHubFeed('priceChanges', { symbol: FUNDS.join(',') }),
  ]);
  if (universe.status !== 'ok') return { status: universe.status, message: universe.message };

  /* The performance snapshots are per exchange, so a sector appears once per
     venue. Averaged rather than picking one: choosing NASDAQ would silently
     describe the whole market by one of its exchanges. */
  const meanBy = (rows: any[], key: string) => {
    const acc = new Map<string, { total: number; n: number }>();
    for (const r of rows) {
      const name = r[key];
      if (!name || !isNum(r.averageChange)) continue;
      const cur = acc.get(name) || { total: 0, n: 0 };
      cur.total += r.averageChange; cur.n += 1;
      acc.set(name, cur);
    }
    return new Map([...acc].map(([k, v]) => [k, v.total / v.n]));
  };
  const sectorChange = meanBy(rowsOf(sectorPerf), 'sector');
  const industryChange = meanBy(rowsOf(industryPerf), 'industry');

  /* The year, by fund. A sector with no tracking fund — or a request the
     vendor refused — leaves the cell empty rather than borrowing a number. */
  const ytdBy = new Map(rowsOf(changes)
    .filter((r) => r && r.symbol && isNum(r.ytd))
    .map((r) => [String(r.symbol).toUpperCase(), Number(r.ytd)]));
  const ytdFor = (sector: string) => ytdBy.get(String(SECTOR_ETF[sector] || '').toUpperCase()) ?? null;

  const sectors = new Map<string, { name: string; cap: number; count: number; industries: Map<string, { name: string; cap: number; count: number }> }>();
  let total = 0;
  for (const row of dedupe(rowsOf(universe).filter(isUSListing))) {
    const cap = Number(row.marketCap);
    const name = row.sector;
    if (!name || !Number.isFinite(cap) || cap <= 0) continue;
    total += cap;
    const s = sectors.get(name) || { name, cap: 0, count: 0, industries: new Map() };
    s.cap += cap; s.count += 1;
    if (row.industry) {
      const ind = s.industries.get(row.industry) || { name: row.industry, cap: 0, count: 0 };
      ind.cap += cap; ind.count += 1;
      s.industries.set(row.industry, ind);
    }
    sectors.set(name, s);
  }
  if (!total) return { status: 'empty' };

  const list: BlockSector[] = [...sectors.values()].map((s) => ({
    name: s.name,
    weight: (s.cap / total) * 100,
    change: sectorChange.get(s.name) ?? null,
    ytd: ytdFor(s.name),
    count: s.count,
    industries: [...s.industries.values()]
      .map((i) => ({ name: i.name, weight: (i.cap / s.cap) * 100, change: industryChange.get(i.name) ?? null, count: i.count }))
      .sort((a, b) => b.weight - a.weight),
  })).sort((a, b) => b.weight - a.weight);

  const changed = list.filter((s) => isNum(s.change));
  return {
    status: 'ok',
    sectors: list,
    // The market's own day change, weighted by the same caps the tiles are
    // sized by — so the "All sectors" row and the map agree.
    change: changed.length
      ? changed.reduce((a, s) => a + s.change! * s.weight, 0) / (changed.reduce((a, s) => a + s.weight, 0) || 1)
      : null,
    // And the market's own year, from the market's own fund rather than an
    // average of the eleven — the same relationship every other row has.
    ytd: ytdBy.get(MARKET_ETF.toUpperCase()) ?? null,
    fundsStatus: changes.status,
  };
}

/* ==========================================================================
   The breakdown — every sector, every industry, every country
   ========================================================================== */

export interface SectorRow {
  sector: string;
  session: number | null; pe: number | null;
  count: number | null; netMargin: number | null; median: number | null;
  etf: string | null; r1d: number | null; r1m: number | null; r6m: number | null; ytd: number | null; r1y: number | null;
  aum: number | null; fee: number | null;
}
export interface IndustryRow {
  industry: string; sector: string | null; cap: number; count: number;
  weight: number | null; session: number | null; pe: number | null;
}
export interface CountryRow {
  country: string; code: string; region: string; fund: string | null; fundName: string;
  price?: number | null; change?: number | null; m1?: number | null; m6?: number | null; ytd?: number | null; y1?: number | null;
}
export interface Breakdown {
  rows: SectorRow[];
  industries: IndustryRow[];
  date: string | null;
  seeded: boolean;
  live: boolean;
}

/** Everything the breakdown table needs: the vendor's snapshot, and this app's own. */
export async function loadBreakdown(): Promise<Breakdown> {
  const [perf, pe, stats] = await Promise.all([
    fetchMarket('sectorPerf'),
    fetchMarket('sectorPe'),
    loadSectorStats(),
  ]);

  /* The five return windows come from `stock-price-change`, which takes a
     symbol list — one request for all eleven funds, and the same source the
     sector block reads its YTD from. The fund's size and fee still cost a
     request each, because `etf/info` takes one symbol; they are only spent
     when there is a key to spend them with. */
  const [changes, infos] = hasApiKey()
    ? await Promise.all([
      fetchHubFeed('priceChanges', { symbol: FUNDS.join(',') }),
      mapLimited(SECTORS, async (s) => {
        const etf = SECTOR_ETF[s];
        const info = etf ? await fetchEtfInfo(etf) : null;
        return info?.status === 'ok' ? info.data : null;
      }, 4),
    ])
    : [{ status: 'skipped', data: [] } as FeedResult<any[]>, SECTORS.map(() => null)];
  const changeBy = new Map(rowsOf(changes).filter((r) => r && r.symbol).map((r) => [String(r.symbol).toUpperCase(), r]));

  const rows: SectorRow[] = SECTORS.map((s, i) => {
    const tbl = stats?.sectors?.[s];
    const etf = SECTOR_ETF[s] || null;
    const change = etf ? changeBy.get(etf.toUpperCase()) : null;
    const window = (key: string) => (change && isNum(change[key]) ? Number(change[key]) : null);
    const info = infos[i] as any;
    return {
      sector: s,
      session: averageFor(perf, s, 'averageChange'),
      pe: averageFor(pe, s, 'pe'),
      count: tbl?.count ?? null,
      netMargin: medianMetric(tbl, 'netMargin'),
      median: medianOfBins(tbl?.overall),
      etf,
      r1d: window('1D'), r1m: window('1M'), r6m: window('6M'), ytd: window('ytd'), r1y: window('1Y'),
      aum: info?.assetsUnderManagement ?? null,
      fee: info?.expenseRatio ?? null,
    };
  });
  return {
    rows,
    industries: await loadIndustryRows(),
    date: perf.date || null,
    seeded: stats?.source === 'seed',
    live: rows.some((r) => isNum(r.r1y)),
  };
}

/**
 * Every industry the market holds, with its parent and its weight.
 *
 * The weights and the parent come from the screener — the same request the
 * sector block already made, so `fmp.ts` serves it from cache. The session
 * and the multiple are the vendor's two industry snapshots.
 */
async function loadIndustryRows(): Promise<IndustryRow[]> {
  const [screen, perf, pe] = await Promise.all([
    hasApiKey() ? fetchScreener(MARKET_SCREEN) : Promise.resolve({ status: 'skipped', data: null } as FeedResult<any[]>),
    fetchMarket('industryPerf'),
    fetchMarket('industryPe'),
  ]);

  const by = new Map<string, { industry: string; cap: number; count: number; sectors: Map<string, number> }>();
  let total = 0;
  for (const row of dedupe(rowsOf(screen).filter(isUSListing))) {
    const name = row.industry;
    const cap = Number(row.marketCap);
    if (!name || !Number.isFinite(cap) || cap <= 0) continue;
    total += cap;
    const cur = by.get(name) || { industry: name, cap: 0, count: 0, sectors: new Map() };
    cur.cap += cap;
    cur.count += 1;
    if (row.sector) cur.sectors.set(row.sector, (cur.sectors.get(row.sector) || 0) + cap);
    by.set(name, cur);
  }

  return [...by.values()].map((r) => ({
    industry: r.industry,
    // The parent is whichever sector holds most of the industry's market
    // value: the vendor publishes the pairing on each listing, not as a table.
    sector: [...r.sectors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    cap: r.cap,
    count: r.count,
    weight: total > 0 ? (r.cap / total) * 100 : null,
    session: averageFor(perf, r.industry, 'averageChange'),
    pe: averageFor(pe, r.industry, 'pe'),
  })).sort((a, b) => b.cap - a.cap);
}

/**
 * The country grain: two requests for forty-odd countries.
 *
 * A country *is* a fund here, which neither of the other grains is, so this
 * table carries real return windows. The three countries with no fund —
 * Czechia and Iceland were never wrapped in one, and Russia's has not traded
 * since 2022 — are still rows: a table that quietly omitted them would be
 * answering a different question.
 */
export async function loadCountryRows(): Promise<CountryRow[]> {
  const places = (COUNTRIES as any[]).filter((c) => c.name);
  const bare = (c: any): CountryRow => ({ country: c.name, code: c.code, region: c.group,
    fund: c.fund?.symbol || null, fundName: c.fund?.name || '' });
  const symbols = places.map((c) => c.fund?.symbol).filter(Boolean);
  if (!symbols.length || !hasApiKey()) return places.map(bare);

  const [quotes, changes] = await Promise.all([
    quoteMap(symbols),
    fetchHubFeed('priceChanges', { symbol: symbols.join(',') }),
  ]);
  const windows = new Map(rowsOf(changes).filter((r) => r && r.symbol).map((r) => [String(r.symbol).toUpperCase(), r]));
  const number = (row: any, key: string) => (row && isNum(row[key]) ? Number(row[key]) : null);

  return places.map((c) => {
    const symbol: string | null = c.fund?.symbol || null;
    const quote = symbol ? quotes.get(symbol.toUpperCase()) : null;
    const window = symbol ? windows.get(symbol.toUpperCase()) : null;
    return {
      ...bare(c),
      price: quote?.price ?? null,
      change: quote?.changesPercentage ?? number(window, '1D'),
      m1: number(window, '1M'), m6: number(window, '6M'),
      ytd: number(window, 'ytd'), y1: number(window, '1Y'),
    };
  });
}

/* ==========================================================================
   One group — a sector, or an industry inside one
   ========================================================================== */

export interface Member {
  symbol: string; name: string; sector: string | null; industry: string;
  marketCap: number | null; price: number | null; change: number | null;
  weight: number | null; quoted?: boolean; lite: any;
}
export type Universe =
  | { ok: true; rows: Member[]; industries: { industry: string; n: number; cap: number; weight: number | null }[];
    total: number; listingCount: number; companyCount: number }
  | { ok: false; status: string; message?: string };

/**
 * Every listed company in the group, deduplicated, with the weights derived.
 *
 * US listings only, and then one row per company. `dedupe` collapses by base
 * symbol, which catches `NVDA` against `NVDA.NE` and misses `LRCX` against
 * `LAR0.DE` — Lam Research's German line, whose ticker shares nothing with its
 * US one. A US listing is the one line whose capitalisation and price are
 * both in dollars.
 */
export function buildUniverse(res: FeedResult<any[]>): Universe {
  if (res.status !== 'ok') return { ok: false, status: res.status, message: res.message };

  const listings = rowsOf(res).filter((h) => h.symbol && !h.isEtf && !h.isFund && isUSListing(h));
  const unique: any[] = dedupe(listings);

  const rows: Member[] = unique.map((h) => ({
    symbol: h.symbol,
    name: h.companyName || h.symbol,
    sector: h.sector || null,
    industry: h.industry || 'Unclassified',
    marketCap: isNum(h.marketCap) ? h.marketCap : null,
    price: isNum(h.price) ? h.price : null,
    change: isNum(h.changePercentage) ? h.changePercentage : null,
    weight: null,
    lite: null,
  }));

  const total = rows.reduce((t, r) => t + (r.marketCap || 0), 0);
  for (const r of rows) r.weight = total > 0 && isNum(r.marketCap) ? r.marketCap / total : null;

  // Industry mix, by weight rather than by count: twenty small software
  // companies and one giant semiconductor are not an equal split of the
  // sector, and a count would say they were.
  const byIndustry = new Map<string, { industry: string; n: number; cap: number }>();
  for (const r of rows) {
    const cur = byIndustry.get(r.industry) || { industry: r.industry, n: 0, cap: 0 };
    cur.n += 1;
    cur.cap += r.marketCap || 0;
    byIndustry.set(r.industry, cur);
  }
  const industries = [...byIndustry.values()]
    .map((x) => ({ ...x, weight: total > 0 ? x.cap / total : null }))
    .sort((a, b) => b.cap - a.cap);

  return {
    ok: true,
    rows: [...rows].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)),
    industries,
    total,
    listingCount: listings.length,
    companyCount: rows.length,
  };
}

/** The sector most of an industry's market value sits in. */
export function parentSectorOf(universe: Universe): string | null {
  if (!universe.ok) return null;
  const by = new Map<string, number>();
  for (const row of universe.rows) {
    if (!row.sector) continue;
    by.set(row.sector, (by.get(row.sector) || 0) + (row.marketCap || 0));
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/**
 * The day's move with members counted by size rather than one each — over the
 * quoted rows only, because weighting the whole group would need a quote for
 * every member. The label says it is the fifty it comes from.
 */
export function capWeightedDay(universe: Universe): number | null {
  if (!universe.ok) return null;
  let cap = 0, moved = 0;
  for (const row of universe.rows.filter((r) => r.quoted)) {
    if (!isNum(row.change) || !isNum(row.marketCap) || row.marketCap <= 0) continue;
    cap += row.marketCap;
    moved += row.change * row.marketCap;
  }
  return cap > 0 ? moved / cap : null;
}

export interface GroupData {
  kind: 'sector' | 'industry';
  name: string;
  etf: string | null;
  parent: string | null;
  universe: Universe;
  screenerStatus: string;
  screenerMessage?: string;
  perf: FeedResult<any[]>;
  indPerf: FeedResult<any[]>;
  session: number | null;
  multiple: number | null;
  capWeighted: number | null;
  stats: SectorStats | null;
  etfPrices: FeedResult;
  spyPrices: FeedResult;
  etfInfo: any;
  ytd: number | null;
}

/** Everything a group page shows, in the order the requests can be made. */
export async function loadGroup(kind: 'sector' | 'industry', name: string): Promise<GroupData> {
  const isSector = kind === 'sector';
  const etf = isSector ? SECTOR_ETF[name] || null : null;
  const from = sixYearsAgo();
  const query = isSector ? { sector: name } : { industry: name };
  const has = hasApiKey();
  const skipped = Promise.resolve({ status: 'skipped', data: null } as FeedResult<any>);

  const [perf, indPerf, pe, stats, screener, etfPrices, etfInfo, spyPrices] = await Promise.all([
    fetchMarket('sectorPerf'),
    fetchMarket('industryPerf'),
    fetchMarket(isSector ? 'sectorPe' : 'industryPe'),
    loadSectorStats(),
    has ? fetchScreener({ ...LISTED, ...query, limit: 5000 }) : skipped,
    etf && has ? fetchFor('prices', etf, { from }) : skipped,
    etf && has ? fetchEtfInfo(etf) : skipped,
    isSector && has ? fetchFor('prices', MARKET_ETF, { from }) : skipped,
  ]);

  const universe = buildUniverse(screener);
  /* The screener carries no day change, so the Day column would read n/a for
     every row. `batch-quote` takes fifty symbols in one request, which is
     exactly the fifty the page prints, so one call fills the column and
     refreshes the price beside it. */
  if (universe.ok) {
    const quotes = await quoteMap(universe.rows.slice(0, TOP_N).map((r) => r.symbol));
    for (const row of universe.rows) {
      const quote = quotes.get(String(row.symbol).toUpperCase());
      if (!quote) continue;
      row.quoted = true;
      if (isNum(quote.price)) row.price = quote.price;
      if (isNum(quote.changesPercentage)) row.change = quote.changesPercentage;
    }
  }

  const pts = etfPrices.status === 'ok' ? normalisePrices(etfPrices.data) : [];
  return {
    kind, name, etf,
    // An industry's parent is not published as a field of its own, so it is
    // read off its members: the sector the weight of the industry sits in.
    parent: isSector ? name : parentSectorOf(universe),
    universe,
    screenerStatus: screener.status,
    screenerMessage: screener.message,
    perf, indPerf,
    session: averageFor(isSector ? perf : indPerf, name, 'averageChange'),
    multiple: averageFor(pe, name, 'pe'),
    capWeighted: capWeightedDay(universe),
    stats,
    etfPrices, spyPrices,
    etfInfo: etfInfo.status === 'ok' ? etfInfo.data : null,
    ytd: pts.length > 1 ? ytdReturn(pts) : null,
  };
}

/** One request: `news/stock` takes a comma-separated `symbols` list. */
export async function loadGroupNews(universe: Universe): Promise<FeedResult<any[]> & { symbols: string[] }> {
  if (!universe.ok || !hasApiKey()) return { status: 'skipped', data: null, symbols: [] };
  const symbols = universe.rows.slice(0, NEWS_COVER).map((r) => r.symbol).filter(Boolean);
  if (!symbols.length) return { status: 'ok', data: [], symbols: [] };
  const res = await fetchFor('news', symbols.join(','));
  return { ...res, symbols };
}

/* ==========================================================================
   Comparisons
   ========================================================================== */

export type Point = { date: string; price: number };

/** The two series on their common dates, from `cut` onwards. */
export function align(a: Point[], b: Point[], cut: number) {
  const byDate = new Map(b.map((p) => [p.date, p.price]));
  const out: { date: string; a: number; b: number }[] = [];
  for (const p of a) {
    if (new Date(p.date).getTime() < cut) continue;
    const other = byDate.get(p.date);
    if (isNum(other) && isNum(p.price)) out.push({ date: p.date, a: p.price, b: other });
  }
  return out;
}

/** Thin a series to about `n` points, always keeping the last one. */
export function thin<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const step = Math.ceil(list.length / n);
  const out = list.filter((_, i) => i % step === 0);
  if (out.at(-1) !== list.at(-1)) out.push(list.at(-1)!);
  return out;
}

/** Where a window starts: `days` back, or 1 January for YTD. */
export function windowStart(key: WindowKey): number {
  const w = WINDOWS.find((x) => x.key === key)!;
  return w.days ? Date.now() - w.days * 864e5 : Date.UTC(new Date().getUTCFullYear(), 0, 1);
}

/* ==========================================================================
   An industry's performance, when nothing published follows one

   FMP has no industry index and no fund-to-industry classification. Name-
   matching funds to industries reached 71 of 148 and paired `Industrial -
   Machinery` with the Dow on the way; a wrong fund reads as a recommendation,
   so neither half of this guesses. Both are bought, and each says its cost.
   ========================================================================== */

export interface BuiltIndex {
  points: Point[];
  market: Point[];
  basket: (Member & { shares: number; points: Point[] })[];
  dropped: (Member & { shares: number; points: Point[] })[];
}

/**
 * A share-weighted basket of the industry's largest members.
 *
 * Share counts come from `marketCap / price` today and are held fixed across
 * the window, which is what makes this an index rather than a weighted average
 * of returns: a member's influence moves with its own price, as it does in a
 * real index between rebalances. Membership is today's.
 */
export async function buildMemberIndex(
  members: Member[], onProgress?: (done: number, total: number) => void,
): Promise<BuiltIndex | { error: string }> {
  const from = sixYearsAgo();
  let done = 0;
  const [series, market] = await Promise.all([
    mapLimited(members, async (m) => {
      const res = await fetchFor('prices', m.symbol, { from });
      onProgress?.(++done, members.length + 1);
      return { ...m, shares: m.marketCap! / m.price!, points: (res.status === 'ok' ? normalisePrices(res.data) : []) as Point[] };
    }, 4),
    fetchFor('prices', MARKET_ETF, { from }).then((res) => {
      onProgress?.(++done, members.length + 1);
      return (res.status === 'ok' ? normalisePrices(res.data) : []) as Point[];
    }),
  ]);

  const usable = series.filter((m) => m.points.length > 1);
  if (usable.length < 3) return { error: 'Fewer than three members returned a usable price history, which is not an index.' };

  /* The basket needs one date range every member covers. The newest listing
     decides it, so the shortest history is dropped and the range recomputed
     until a year of overlap survives — a member that listed last month should
     not truncate the other nine to a month. */
  const basket = [...usable].sort((a, b) => a.points[0].date.localeCompare(b.points[0].date));
  const dropped: typeof basket = [];
  let common: { date: string; level: number }[] = [];
  while (basket.length >= 3) {
    const latestStart = basket.reduce((acc, m) => (m.points[0].date > acc ? m.points[0].date : acc), '');
    const maps = basket.map((m) => new Map(m.points.map((p) => [p.date, p.price])));
    common = basket[0].points.filter((p) => p.date >= latestStart && maps.every((map) => isNum(map.get(p.date))))
      .map((p) => ({ date: p.date, level: basket.reduce((t, m, i) => t + m.shares * maps[i].get(p.date)!, 0) }));
    if (common.length > 250 || basket.length === 3) break;
    dropped.push(basket.pop()!);
  }
  if (common.length < 2) return { error: 'The members have too little overlapping price history to build an index.' };

  return { points: common.map((p) => ({ date: p.date, price: p.level })), market, basket, dropped };
}

/** A holding weight outside this range is a derivative position, not a slice. */
const saneWeight = (w: number) => isNum(w) && w > 0 && w <= 100;

export interface FundHolding { fund: string; held: string[]; weight: number }

/**
 * Which funds follow this industry, answered from holdings.
 *
 * `etf/asset-exposure` returns every fund holding one symbol and its weight in
 * each. Asked of the largest members and intersected, it finds the funds
 * genuinely concentrated in the industry rather than the ones whose name
 * happens to contain the word. About half a megabyte per symbol.
 */
export async function fundsHolding(members: Member[], onProgress?: (done: number, total: number) => void): Promise<FundHolding[]> {
  let done = 0;
  const results = await mapLimited(members, async (m) => {
    const res = await fetchHubFeed('etfExposure', { symbol: m.symbol });
    onProgress?.(++done, members.length);
    return { symbol: m.symbol, rows: rowsOf(res) };
  }, 2);

  const funds = new Map<string, FundHolding>();
  for (const { symbol, rows } of results) {
    // The feed repeats a holding and reports derivative positions with weights
    // far above a hundred; neither is a slice of a portfolio.
    const seen = new Set<string>();
    for (const row of rows) {
      const fund = String(row.symbol || '').toUpperCase();
      const weight = Number(row.weightPercentage);
      if (!fund || seen.has(fund) || !saneWeight(weight)) continue;
      seen.add(fund);
      const cur = funds.get(fund) || { fund, held: [], weight: 0 };
      cur.held.push(symbol);
      cur.weight += weight;
      funds.set(fund, cur);
    }
  }

  /* A portfolio's weights in five holdings cannot exceed the portfolio. Four
     funds came back claiming 190% and more across the five — the same feed
     reports a leveraged position as 21,217% — so the sum is the test that
     separates a reported weight from a reported number. */
  return [...funds.values()]
    .filter((f) => f.held.length > 1 && f.weight <= 100)
    .sort((a, b) => b.held.length - a.held.length || b.weight - a.weight)
    .slice(0, 40);
}

/** One fund, one row: `etf/asset-exposure` answers for every listing of a fund worldwide. */
const fundIdentity = (name: string) => String(name || '').toLowerCase()
  .replace(/\b(?:ucits|etf|etc|acc|dist|inc|plc|fund|shares?|class\s+[a-z]|[a-z]{3}\s+hedged|hedged|screened|esg)\b/g, '')
  .replace(/[^a-z0-9]/g, '');

export interface QuotedFund extends FundHolding { name: string; price: number; change: number | null }

/** Quoted first, then one row per fund; the venue that quotes is the one kept. */
export async function quoteFunds(found: FundHolding[]): Promise<QuotedFund[]> {
  const quotes = await quoteMap(found.map((f) => f.fund));
  const collapsed = new Map<string, QuotedFund>();
  for (const f of found) {
    const quote = quotes.get(f.fund);
    if (!quote || !isNum(quote.price)) continue;
    const key = fundIdentity(quote.name) || f.fund;
    const row = { ...f, name: quote.name || f.fund, price: quote.price, change: quote.changesPercentage ?? null };
    const held = collapsed.get(key);
    const better = !held || (!row.fund.includes('.') && held.fund.includes('.')) || row.weight > held.weight;
    if (better) collapsed.set(key, row);
  }
  return [...collapsed.values()]
    .sort((a, b) => b.held.length - a.held.length || b.weight - a.weight)
    .slice(0, 10);
}

/* ==========================================================================
   What each sector is, in a sentence

   Definitional rather than analytical — what kinds of company sit in the
   bucket, not whether the bucket is a good investment. Written out because the
   vendor supplies no sector description.
   ========================================================================== */

export const SECTOR_BLURB: Record<string, string> = {
  Technology: 'Companies that build, sell or run technology: semiconductors and the equipment '
    + 'that makes them, software and cloud services, hardware, and IT services. It is the largest '
    + 'sector by market value in the US market and the most concentrated in a handful of names.',
  Healthcare: 'Drug makers and biotechnology, medical devices and diagnostics, hospitals and '
    + 'insurers, and the distributors between them. Demand tracks demographics rather than the '
    + 'business cycle, but the sector carries patent, trial and reimbursement risk that little '
    + 'else does.',
  'Financial Services': 'Banks, insurers, asset managers, exchanges and payment networks. The '
    + 'only sector where leverage is the product rather than a risk to it, which is why most of '
    + 'the ratios used elsewhere in this report read differently here.',
  'Consumer Cyclical': 'What people buy when they feel comfortable: cars, homebuilders, '
    + 'restaurants, hotels, apparel and most e-commerce. Earnings swing with employment and '
    + 'credit, which is what makes the sector cyclical.',
  'Communication Services': 'Telecoms and media, and the internet platforms that sell '
    + 'advertising. A sector assembled fairly recently out of two very different halves — '
    + 'regulated network operators and high-margin advertising businesses.',
  Industrials: 'Aerospace and defence, machinery, transport and logistics, construction and '
    + 'business services. The sector most directly geared to capital spending and freight '
    + 'volumes.',
  'Consumer Defensive': 'Food, drink, household products, tobacco and the shops that sell them. '
    + 'Demand is close to inelastic, so revenue is steady and margins are thin.',
  Energy: 'Oil and gas producers, refiners, drillers and the pipelines between them. Earnings '
    + 'are a function of a commodity price the companies do not set, which dominates everything '
    + 'else about the sector.',
  'Basic Materials': 'Miners, chemicals, steel, paper and packaging. Like energy, a price-taking '
    + 'sector, but with longer capital cycles and more exposure to construction.',
  'Real Estate': 'Property owners and managers, mostly structured as REITs, which pay out the '
    + 'bulk of their income and are read on funds from operations rather than on earnings. Highly '
    + 'sensitive to interest rates.',
  Utilities: 'Regulated electricity, gas and water. Returns are set by regulators rather than by '
    + 'competition, which makes the sector bond-like: steady, income-heavy and rate-sensitive.',
};
