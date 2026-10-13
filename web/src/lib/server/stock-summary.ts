/* ==========================================================================
   Maz Vantage — the server-side company summary (search engines read this)

   The report renders in the browser, so the HTML a search engine fetches for
   `/stock/AAPL` held a loading skeleton and nothing to index. This module
   builds, on the server, the part of a report that answers the question
   people actually search — "is <company> halal?" — plus who the company is:

   - five reads per company: profile, the annual balance sheet and income
     statement, dividends, and the market-cap history the averaged screens
     divide by. The same `FEEDS` specs the browser uses, so a path or a
     parameter cannot drift between the two;
   - cached by the framework for a day (`revalidate`), so a popular page costs
     the data plan five reads a day however many crawlers and readers open it;
   - without a key, or when the reads fail, the bundled snapshot in
     `public/data/` where there is one, and otherwise nothing: the page then
     renders without the summary rather than with an invented one.

   Server only: it reads the operator's key from the environment and the
   snapshot from disk. Nothing here is sent to the browser except the
   rendered text, which names no data provider (house rule 2).
   ========================================================================== */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FEEDS, makeDataset, type FeedCtx, type FeedResult } from '../fmp';
import { ALLOWED_PATHS, FMP_BASE } from '../fmp/paths';
import { halalLabel, type HalalLabel } from '../halal-label';

/** A day: statements change quarterly, prices daily; the label is a daily reading. */
export const SUMMARY_REVALIDATE = 86_400;

const SUMMARY_FEEDS = ['profile', 'balance', 'income', 'dividends', 'marketCapHist'] as const;

export interface StockSummary {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  description: string | null;
  label: HalalLabel;
  /** the newest balance sheet the label read */
  asOf: string | null;
  source: 'live' | 'snapshot';
}

const ctx: FeedCtx = { from: '', to: '', lastQuarter: { year: 0, quarter: 0 } };

async function liveFeed(name: (typeof SUMMARY_FEEDS)[number], symbol: string, key: string): Promise<FeedResult> {
  const spec = (FEEDS as Record<string, { path: string; params: (s: string, c: FeedCtx) => Record<string, unknown>; pick?: (x: any) => any }>)[name];
  if (!spec || !ALLOWED_PATHS.has(spec.path)) return { status: 'error', data: null };
  const qs = new URLSearchParams(Object.entries(spec.params(symbol, ctx)).map(([k, v]) => [k, String(v)]));
  qs.set('apikey', key);
  try {
    const res = await fetch(`${FMP_BASE}/${spec.path}?${qs}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: SUMMARY_REVALIDATE },
    } as RequestInit);
    if (!res.ok) return { status: 'error', data: null };
    const json = await res.json();
    if (json && !Array.isArray(json) && (json['Error Message'] || json.error)) return { status: 'error', data: null };
    const data = spec.pick ? spec.pick(json) : json;
    return { status: data == null || (Array.isArray(data) && !data.length) ? 'error' : 'ok', data };
  } catch {
    return { status: 'error', data: null };
  }
}

async function snapshotFeeds(symbol: string): Promise<Record<string, FeedResult> | null> {
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return null;
  try {
    const file = path.join(process.cwd(), 'public', 'data', `${symbol}.json`);
    const snap = JSON.parse(await readFile(file, 'utf8'));
    if (!snap?.feeds) return null;
    return Object.fromEntries(SUMMARY_FEEDS.map((n) => [n, { status: snap.feeds[n] ? 'ok' : 'error', data: snap.feeds[n] ?? null } as FeedResult]));
  } catch {
    return null;
  }
}

/**
 * The vendor's profile fields, in one place, for the summary's own facts.
 * The label itself reads the statements through `quickInputs`, as the
 * Shariah tab does.
 */
function factsFrom(symbol: string, profile: any) {
  return {
    symbol,
    name: profile?.companyName || symbol,
    sector: profile?.sector || null,
    industry: profile?.industry || null,
    exchange: profile?.exchangeFullName || profile?.exchange || null,
    description: profile?.description || null,
    marketCap: profile?.marketCap ?? profile?.mktCap ?? null,
  };
}

/** The summary for one symbol, or null when nothing trustworthy could be read. */
export async function loadStockSummary(raw: string): Promise<StockSummary | null> {
  const symbol = decodeURIComponent(raw).toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) return null;
  const key = process.env.FMP_API_KEY?.trim();

  let feeds: Record<string, FeedResult> | null = null;
  let source: StockSummary['source'] = 'live';
  if (key) {
    const got = await Promise.all(SUMMARY_FEEDS.map((n) => liveFeed(n, symbol, key)));
    feeds = Object.fromEntries(SUMMARY_FEEDS.map((n, i) => [n, got[i]]));
    if (feeds.profile.status !== 'ok' || feeds.balance.status !== 'ok') feeds = null;
  }
  if (!feeds) {
    feeds = await snapshotFeeds(symbol);
    source = 'snapshot';
  }
  if (!feeds || !feeds.profile?.data) return null;

  const ds = makeDataset(symbol, feeds);
  const facts = factsFrom(symbol, ds.get('profile'));
  const mcap = Array.isArray(ds.get('marketCapHist')) ? ds.get('marketCapHist') : null;
  const label = halalLabel({ facts, ds }, mcap);
  const balance = ds.get('balance');
  const newest = Array.isArray(balance) ? balance.reduce((m: any, r: any) => (!m || String(r?.date) > String(m.date) ? r : m), null) : null;
  return {
    symbol, name: facts.name, sector: facts.sector, industry: facts.industry, exchange: facts.exchange,
    description: facts.description, label, asOf: newest?.date ?? null, source,
  };
}
