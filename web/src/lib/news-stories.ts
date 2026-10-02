/* ==========================================================================
   Maz Vantage — Market News categories and the story stream (from newsroom.js)

   FMP publishes two wires — the market-wide firehose and the stock wire,
   which tags every story with its symbol — and no topic classification. So a
   category here is one of three things, and each says which it is:

   - **A wire, unfiltered.** Latest is both merged; Stocks is the stock wire.
   - **The vendor's own tag.** ETFs keeps stories filed under a tracked fund;
     Indices and Futures keep stories that *name* one — a rule about names.
   - **A keyword filter run in the browser.** Economy, and the four topic
     filters reached by link. The page prints the pattern beside every one.
   ========================================================================== */

import { fetchNewsFeed } from './fmp';
import { loadEtfNews, loadFuturesNews, loadIndexNews, normalizeHubQuote } from './markethub-data';

const ECONOMY = /\b(fed|federal reserve|fomc|rate cut|rate hike|interest rates?|inflation|cpi|ppi|deflation|gdp|recession|unemployment|payrolls?|jobs report|jobless|consumer confidence|retail sales|housing starts|trade deficit|tariffs?|central bank|ecb|boe|boj|treasur\w+|yields?|stimulus|budget|debt ceiling)\b/i;

export interface NewsCategory {
  id: string;
  label?: string;
  title?: string;
  blurb?: string;
  wires?: string[];
  load?: (options?: any) => Promise<any>;
  any?: RegExp;
  hidden?: boolean;
  alias?: string;
}

export const NEWS_CATEGORIES: NewsCategory[] = [
  { id: 'latest', label: 'Latest', title: 'Latest market news',
    blurb: 'The market-wide and company wires merged and de-duplicated, newest first. Nothing is filtered, ranked or scored.',
    wires: ['general', 'stock'] },
  { id: 'stocks', label: 'Stocks', title: 'Stock news',
    blurb: 'The company wire across every ticker covered, unfiltered. Each story is filed under the symbol it is about.',
    wires: ['stock'] },
  { id: 'etfs', label: 'ETFs', title: 'ETF news',
    blurb: 'Stories filed under one of the funds this product tracks, and market-wide stories that name one.',
    load: loadEtfNews },
  { id: 'indices', label: 'Indices', title: 'Index news',
    blurb: 'Market-wide stories that name an index this product tracks — whichever country the index belongs to.',
    load: loadIndexNews },
  { id: 'futures', label: 'Futures', title: 'Futures news',
    blurb: 'Market-wide stories that name a contract this product tracks. Gold is a contract; Goldman is not.',
    load: loadFuturesNews },
  { id: 'economy', label: 'Economy', title: 'Economy news',
    blurb: 'The market-wide wire kept to headlines about rates, prices, jobs and output.',
    wires: ['general'], any: ECONOMY },
  /* The topic filters, reachable by link: keyword searches over a wire. */
  { id: 'earnings', label: 'Earnings', title: 'Earnings news', hidden: true,
    blurb: 'Headlines mentioning results, guidance or the earnings calendar.',
    wires: ['stock', 'general'],
    any: /\b(earnings|results|quarterly|quarter|EPS|guidance|beats?|misses|missed|profit|revenue|outlook|forecast)\b/i },
  { id: 'dividends', label: 'Dividends', title: 'Dividend news', hidden: true,
    blurb: 'Headlines mentioning dividends, payouts or distributions.',
    wires: ['stock', 'general'],
    any: /\b(dividend|payout|distribution|ex-dividend|yield|buyback|repurchase)\b/i },
  { id: 'ma', label: 'M&A', title: 'Mergers & acquisitions', hidden: true,
    blurb: 'Headlines mentioning deals, takeovers and stakes.',
    wires: ['general', 'stock'],
    any: /\b(acquir\w*|acquisition|merger|merges?|takeover|buyout|bid for|deal|stake|divest\w*|spin[- ]?off|tender offer)\b/i },
  { id: 'ratings', label: 'Analyst ratings', title: 'Analyst ratings', hidden: true,
    blurb: 'Headlines mentioning upgrades, downgrades, initiations and price targets.',
    wires: ['stock', 'general'],
    any: /\b(upgrade[sd]?|downgrade[sd]?|price target|initiat\w+ coverage|reiterat\w*|outperform|underperform|overweight|underweight|buy rating|sell rating|analyst)\b/i },
  // The old name for Stocks, so a link written before the rebuild still lands.
  { id: 'stock', alias: 'stocks', hidden: true },
];

export const newsCategoryOf = (id: string | null | undefined): NewsCategory => {
  const found = NEWS_CATEGORIES.find((c) => c.id === id);
  return found?.alias ? NEWS_CATEGORIES.find((c) => c.id === found.alias)! : found || NEWS_CATEGORIES[0];
};

export interface Story { title: string; url: string | null; date: string | null; source: string; text: string; image: string | null; marks: any[] }

/** Both wires carry the same row shape; this is the only shape a page reads. */
function story(raw: any): Story | null {
  const title = String(raw.title || '').trim();
  if (!title) return null;
  return {
    title,
    url: raw.url || null,
    date: raw.publishedDate || raw.date || null,
    source: raw.publisher || raw.site || '',
    text: String(raw.text || raw.content || '').replace(/\s+/g, ' ').trim().slice(0, 320),
    image: raw.image || null,
    // One tagged symbol from the stock wire, or the marks a board matched.
    marks: raw.indices?.length ? raw.indices
      : raw.symbol ? [normalizeHubQuote({}, { symbol: String(raw.symbol).toUpperCase(), kind: 'stock' })] : [],
  };
}

/** Newest first, one row per story: the two wires overlap heavily. */
function merge(lists: any[][]): Story[] {
  const seen = new Set<string>();
  const out: Story[] = [];
  for (const rows of lists) {
    for (const raw of rows) {
      const item = story(raw);
      if (!item) continue;
      const id = item.url || item.title.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
  }
  return out.filter((i) => i.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export interface StoryResult { stories: Story[]; status: string; message?: string; notes: string[]; scanned: number }

export async function categoryStories(category: NewsCategory): Promise<StoryResult> {
  if (category.load) {
    const result = await category.load();
    return { stories: merge([result.data?.articles || []]), status: result.status, message: result.message, notes: result.notes || [], scanned: result.data?.scanned || 0 };
  }
  const wires = category.wires || [];
  const results = await Promise.all(wires.map((wire) => fetchNewsFeed(wire, { limit: 200 })));
  const ok = results.filter((r: any) => r.status === 'ok');
  const all = merge(ok.map((r: any) => (Array.isArray(r.data) ? r.data : [])));
  const kept = category.any ? all.filter((i) => category.any!.test(`${i.title} ${i.text}`)) : all;
  return {
    stories: kept, scanned: all.length, notes: [],
    status: ok.length ? 'ok' : (results[0] as any)?.status || 'error',
    message: ok.length ? '' : results.map((r: any) => r.message).find(Boolean) || '',
  };
}

/** The stories in one category, for the News page and for the front page. */
export const newsStories = (id: string) => categoryStories(newsCategoryOf(id));
