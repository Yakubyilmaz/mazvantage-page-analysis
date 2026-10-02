/* ==========================================================================
   Maz Vantage — Superinvestors (13F portfolios)

   What a fund owns, as it told the SEC on its quarterly Form 13F, and what it
   changed since the quarter before. Two quarters of one filer is all a page
   needs: the change is the difference, computed here, not a vendor field.

   The 13F's limits are the page's limits, and the page prints them:
   - **Long US-listed positions only.** No shorts, no cash, no bonds, no
     foreign listings, no private holdings — a fund that is mostly hedged
     looks fully long here.
   - **45 days late, at quarter end.** The filing is due 45 days after the
     quarter closes, so the newest is six weeks to four and a half months old
     by the time anyone reads it, and says nothing about the days in between.
   - **Options are listed by the shares they control**, flagged as puts or
     calls, and are never added to a holding of the stock itself.

   Positions are matched across quarters by CUSIP and option type, not by
   ticker: the ticker is the vendor's mapping and can be missing or move,
   while the CUSIP is what the filer actually reported.
   ========================================================================== */

import { isNum } from './format';
import { fetchFund13F, type FeedResult } from './fmp';

export interface Fund {
  cik: string;
  name: string;
  /** who the fund is known by, for recognition — not a claim about who runs it today */
  person: string;
  /** what kind of filer it is — never a characterisation of its style */
  blurb: string;
}

/**
 * The funds on the list. On 2026-10-01 every CIK was checked against the
 * SEC's company record (name and address), and the vendor's 13F dates were
 * read for each: eighteen have Q2 2026 on file and Pershing Square Q1 2026.
 * Two were left off for being stale — Scion Asset Management (last 13F
 * Q3 2025) and Greenlight Capital (last Q4 2023 under its CIK) — because a
 * filer that has stopped does not belong in a list of what funds own now.
 * The page still measures every fund's lag itself, so one that falls behind
 * later is labelled rather than passed off as current.
 */
export const FUNDS: Fund[] = [
  { cik: '0001067983', name: 'Berkshire Hathaway', person: 'Warren Buffett', blurb: 'The conglomerate’s listed US stock portfolio.' },
  { cik: '0001336528', name: 'Pershing Square Capital', person: 'Bill Ackman', blurb: 'Hedge fund manager.' },
  { cik: '0001061768', name: 'Baupost Group', person: 'Seth Klarman', blurb: 'Investment partnership.' },
  { cik: '0001656456', name: 'Appaloosa', person: 'David Tepper', blurb: 'Hedge fund manager.' },
  { cik: '0001040273', name: 'Third Point', person: 'Dan Loeb', blurb: 'Hedge fund manager.' },
  { cik: '0001709323', name: 'Himalaya Capital', person: 'Li Lu', blurb: 'Investment manager.' },
  { cik: '0001536411', name: 'Duquesne Family Office', person: 'Stanley Druckenmiller', blurb: 'Family office.' },
  { cik: '0001350694', name: 'Bridgewater Associates', person: 'Ray Dalio', blurb: 'Macro hedge fund manager; its listed equity and ETF positions.' },
  { cik: '0000921669', name: 'Carl Icahn', person: 'Carl Icahn', blurb: 'Filed in Carl Icahn’s own name.' },
  { cik: '0001112520', name: 'Akre Capital Management', person: 'Chuck Akre', blurb: 'Investment manager.' },
  { cik: '0001096343', name: 'Markel Group', person: 'Tom Gayner', blurb: 'Insurer; its equity portfolio.' },
  { cik: '0000949509', name: 'Oaktree Capital Management', person: 'Howard Marks', blurb: 'Credit-focused manager; its listed equity holdings.' },
  { cik: '0001167483', name: 'Tiger Global Management', person: 'Chase Coleman', blurb: 'Hedge fund and venture manager.' },
  { cik: '0001549575', name: 'Dalal Street', person: 'Mohnish Pabrai', blurb: 'Mohnish Pabrai’s investment firm.' },
  { cik: '0001418814', name: 'ValueAct Holdings', person: 'ValueAct', blurb: 'Activist investment firm.' },
  { cik: '0001166559', name: 'Gates Foundation Trust', person: 'Bill & Melinda Gates Foundation', blurb: 'The foundation’s endowment.' },
  { cik: '0001569205', name: 'Fundsmith', person: 'Terry Smith', blurb: 'UK fund manager; its US-listed holdings.' },
  { cik: '0001345471', name: 'Trian Fund Management', person: 'Nelson Peltz', blurb: 'Activist investment firm.' },
  { cik: '0000783412', name: 'Daily Journal', person: 'Charlie Munger (until 2023)', blurb: 'Newspaper publisher; its securities portfolio.' },
];

export const fundByCik = (cik: string | null | undefined) => FUNDS.find((f) => f.cik === normaliseCik(cik)) ?? null;

/** Ten digits, zero-padded, as the SEC writes a CIK. */
export const normaliseCik = (cik: string | number | null | undefined) =>
  cik == null || cik === '' ? '' : String(cik).replace(/\D/g, '').padStart(10, '0');

/* ---------- positions --------------------------------------------------------- */

export interface Position {
  key: string;
  cusip: string;
  symbol: string | null;
  name: string;
  cls: string;
  /** 'put' or 'call' for an option line, null for the stock */
  option: 'put' | 'call' | null;
  shares: number;
  value: number;
  weight: number;
}

const optionOf = (v: unknown): 'put' | 'call' | null => {
  const s = String(v || '').trim().toLowerCase();
  return s === 'put' ? 'put' : s === 'call' ? 'call' : null;
};

/** One quarter's extract to positions, duplicates (one filer, several managers) merged, largest first. */
export function positionsOf(rows: unknown): Position[] {
  const byKey = new Map<string, Position>();
  if (Array.isArray(rows)) {
    for (const r of rows as any[]) {
      if (!r || !isNum(r.value)) continue;
      const option = optionOf(r.putCallShare);
      const cusip = String(r.securityCusip || r.cusip || '').trim().toUpperCase();
      const key = `${cusip || r.symbol || r.nameOfIssuer}|${option || ''}`;
      const hit = byKey.get(key);
      if (hit) {
        hit.shares += isNum(r.shares) ? r.shares : 0;
        hit.value += r.value;
      } else {
        byKey.set(key, {
          key, cusip, option,
          symbol: typeof r.symbol === 'string' && r.symbol.trim() ? r.symbol.trim().toUpperCase() : null,
          name: String(r.nameOfIssuer || r.symbol || 'Unnamed security'),
          cls: String(r.titleOfClass || ''),
          shares: isNum(r.shares) ? r.shares : 0,
          value: r.value,
          weight: 0,
        });
      }
    }
  }
  const list = [...byKey.values()];
  const total = list.reduce((s, p) => s + p.value, 0);
  for (const p of list) p.weight = total > 0 ? p.value / total : 0;
  return list.sort((a, b) => b.value - a.value);
}

export type Move = 'new' | 'added' | 'reduced' | 'unchanged';

export interface Holding extends Position {
  move: Move;
  /** shares held the quarter before, 0 for a new position */
  prevShares: number;
  /** the change in shares as a fraction of the prior holding; null for a new one */
  change: number | null;
  prevWeight: number | null;
}

/** This quarter against the last: every position with its move, plus what was sold out entirely. */
export function compareQuarters(now: Position[], prev: Position[] | null) {
  const before = new Map((prev || []).map((p) => [p.key, p]));
  const holdings: Holding[] = now.map((p) => {
    const b = before.get(p.key);
    if (!prev) return { ...p, move: 'unchanged', prevShares: p.shares, change: null, prevWeight: null };
    if (!b) return { ...p, move: 'new', prevShares: 0, change: null, prevWeight: 0 };
    const change = b.shares > 0 ? p.shares / b.shares - 1 : null;
    const move: Move = p.shares > b.shares ? 'added' : p.shares < b.shares ? 'reduced' : 'unchanged';
    return { ...p, move, prevShares: b.shares, change, prevWeight: b.weight };
  });
  const held = new Set(now.map((p) => p.key));
  const soldOut = (prev || []).filter((p) => !held.has(p.key));
  const total = now.reduce((s, p) => s + p.value, 0);
  const totalPrev = (prev || []).reduce((s, p) => s + p.value, 0);
  const top10 = now.slice(0, 10).reduce((s, p) => s + p.weight, 0);
  return {
    holdings,
    soldOut,
    total,
    totalPrev: prev ? totalPrev : null,
    counts: {
      positions: now.length,
      new: holdings.filter((h) => h.move === 'new').length,
      added: holdings.filter((h) => h.move === 'added').length,
      reduced: holdings.filter((h) => h.move === 'reduced').length,
      soldOut: soldOut.length,
    },
    top10,
  };
}

/* ---------- quarters ------------------------------------------------------------ */

export interface Quarter { year: number; quarter: number; date: string }

/** The vendor's filing dates, newest first, deduplicated. */
export function quartersOf(rows: unknown): Quarter[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: Quarter[] = [];
  for (const r of rows as any[]) {
    if (!isNum(r?.year) || !isNum(r?.quarter)) continue;
    const k = `${r.year}-${r.quarter}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ year: r.year, quarter: r.quarter, date: String(r.date || '') });
  }
  return out.sort((a, b) => b.year - a.year || b.quarter - a.quarter);
}

export const quarterLabel = (q: Pick<Quarter, 'year' | 'quarter'> | null | undefined) => (q ? `Q${q.quarter} ${q.year}` : 'n/a');

/** How many quarters behind the newest one any filer could have filed by `now`. */
export function quartersStale(q: Pick<Quarter, 'year' | 'quarter'>, now = new Date()): number {
  // A quarter's 13F is due 45 days after it ends; before that the newest
  // possible filing is the quarter before.
  const d = new Date(now.getTime() - 45 * 864e5);
  const latestYear = d.getUTCFullYear();
  const latestQ = Math.floor(d.getUTCMonth() / 3); // completed quarters this year, 0..3
  const [y, qq] = latestQ === 0 ? [latestYear - 1, 4] : [latestYear, latestQ];
  return Math.max(0, (y - q.year) * 4 + (qq - q.quarter));
}

/* ---------- across funds ---------------------------------------------------------- */

export interface Consensus {
  symbol: string;
  name: string;
  funds: { cik: string; name: string; weight: number; move: Move }[];
  holders: number;
  buyers: number;
  sellers: number;
  value: number;
}

/**
 * Stocks the listed funds hold in common. Options are left out — a put is a
 * bet against the stock, and counting it as a holder would be backwards.
 * `sold` adds the funds that sold a position out entirely, which no
 * "holders" count can see.
 */
export function consensusOf(perFund: { fund: Fund; holdings: Holding[]; soldOut: Position[] }[]): Consensus[] {
  const map = new Map<string, Consensus>();
  const at = (symbol: string, name: string) => {
    let c = map.get(symbol);
    if (!c) { c = { symbol, name, funds: [], holders: 0, buyers: 0, sellers: 0, value: 0 }; map.set(symbol, c); }
    return c;
  };
  for (const { fund, holdings, soldOut } of perFund) {
    // One fund, one vote per company, however many share classes it holds.
    const seen = new Set<string>();
    for (const h of holdings) {
      if (h.option || !h.symbol) continue;
      const c = at(h.symbol, h.name);
      c.value += h.value;
      if (seen.has(h.symbol)) continue;
      seen.add(h.symbol);
      c.holders += 1;
      if (h.move === 'new' || h.move === 'added') c.buyers += 1;
      if (h.move === 'reduced') c.sellers += 1;
      c.funds.push({ cik: fund.cik, name: fund.name, weight: h.weight, move: h.move });
    }
    for (const s of soldOut) {
      if (s.option || !s.symbol || seen.has(s.symbol)) continue;
      at(s.symbol, s.name).sellers += 1;
    }
  }
  return [...map.values()].sort((a, b) => b.holders - a.holders || b.buyers - a.buyers || b.value - a.value);
}

/* ---------- loading one fund ------------------------------------------------------ */


export interface FundLoad {
  status: FeedResult['status'];
  message: string | null;
  /** 'capture' when the bundled file answered because the live read could not */
  source: 'live' | 'capture' | null;
  capturedAt: string | null;
  quarters: Quarter[];
  latest: Quarter | null;
  previous: Quarter | null;
  /** the filing's own date and link, from the first holding row */
  filedOn: string | null;
  filingUrl: string | null;
  view: ReturnType<typeof compareQuarters> | null;
  performance: any | null;
  industries: { title: string; weight: number; lastWeight: number | null }[];
}

let capture: Promise<any | null> | null = null;
/** The bundled 13F capture, fetched once per page load. */
export function loadFundCapture(): Promise<any | null> {
  capture ??= fetch('/data/13f-capture.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return capture;
}

const key = (q: Quarter) => `${q.year}-${q.quarter}`;
const safeLink = (u: unknown) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

function build(dates: unknown, now: unknown, prev: unknown, perf: unknown, inds: unknown): Omit<FundLoad, 'status' | 'message' | 'source' | 'capturedAt'> {
  const quarters = quartersOf(dates);
  const [latest = null, previous = null] = quarters;
  const first = Array.isArray(now) ? (now as any[])[0] : null;
  const perfRows = Array.isArray(perf) ? (perf as any[]) : [];
  const latestPerf = latest ? perfRows.find((r) => String(r.date || '').startsWith(latest.date.slice(0, 7))) ?? perfRows[0] ?? null : perfRows[0] ?? null;
  return {
    quarters, latest, previous,
    filedOn: typeof first?.filingDate === 'string' ? first.filingDate.slice(0, 10) : null,
    filingUrl: safeLink(first?.link),
    view: Array.isArray(now) ? compareQuarters(positionsOf(now), Array.isArray(prev) ? positionsOf(prev) : null) : null,
    performance: latestPerf,
    industries: (Array.isArray(inds) ? (inds as any[]) : [])
      .filter((r) => isNum(r?.weight) && r.industryTitle)
      .map((r) => ({ title: String(r.industryTitle), weight: r.weight, lastWeight: isNum(r.lastWeight) ? r.lastWeight : null }))
      .sort((a, b) => b.weight - a.weight),
  };
}

/**
 * Everything the fund page shows, in five requests: the filing dates, the
 * newest two quarters' holdings, and the vendor's performance and industry
 * summaries — three with `lite`, which is what the cross-fund table needs. A
 * fund the bundled capture holds falls back to it when the live read fails,
 * and says so.
 */
export async function loadFund(cikRaw: string, { lite = false }: { lite?: boolean } = {}): Promise<FundLoad> {
  const cik = normaliseCik(cikRaw);
  const empty = { quarters: [], latest: null, previous: null, filedOn: null, filingUrl: null, view: null, performance: null, industries: [] };
  const dates = await fetchFund13F('dates', cik);
  if (dates.status === 'ok' && quartersOf(dates.data).length) {
    const [latest, previous] = quartersOf(dates.data);
    const [now, prev, perf, inds] = await Promise.all([
      fetchFund13F('holdings', cik, latest),
      previous ? fetchFund13F('holdings', cik, previous) : Promise.resolve(null),
      lite ? Promise.resolve(null) : fetchFund13F('performance', cik),
      lite ? Promise.resolve(null) : fetchFund13F('industries', cik, latest),
    ]);
    if (now.status === 'ok') {
      return {
        status: 'ok', message: null, source: 'live', capturedAt: null,
        ...build(dates.data, now.data, prev?.status === 'ok' ? prev.data : null,
          perf?.status === 'ok' ? perf.data : null, inds?.status === 'ok' ? inds.data : null),
      };
    }
    dates.status = now.status;
    dates.message = now.message;
  }
  const cap = await loadFundCapture();
  const f = cap?.funds?.[cik];
  if (f) {
    const qs = quartersOf(f.dates);
    return {
      status: 'ok', message: null, source: 'capture', capturedAt: cap.capturedAt ?? null,
      ...build(f.dates, f.holdings?.[key(qs[0])], qs[1] ? f.holdings?.[key(qs[1])] : null, f.performance, f.industries?.[key(qs[0])]),
    };
  }
  return {
    status: dates.status === 'ok' ? 'error' : dates.status,
    message: dates.status === 'ok' ? 'No 13F filings were returned for this filer.' : dates.message ?? null,
    source: null, capturedAt: null, ...empty,
  };
}
