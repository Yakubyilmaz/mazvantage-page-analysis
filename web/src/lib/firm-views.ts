/* ==========================================================================
   Maz Vantage — what the firms are publishing about a company and its industry

   The Alpha Signal tab's view of outside research, in one place:

   - **On the company**: each named firm's latest rating call, the consensus
     forecasts (revenue and EPS, with the spread and the number of analysts),
     and the average price target over a month, a quarter and a year.
   - **On its industry**: the same consensus for its peers, so a forecast can
     be read against what the Street expects of the rest of the industry; the
     dated industry figures in Demand Discovery's evidence register (WSTS,
     IEA, USGS…) when the company sits in one of its chains; and the outlooks
     and letters in Research → Letters & Outlooks that name the company or
     cover its sector's subject.

   None of it enters a score. These are other people's views, labelled with
   whose they are and when they were published.

   The market data carries a firm's *rating* and the consensus *number*, but
   not the firm's report or its own forecast: a broker's note is licensed to
   its clients. So the page names the firm and its call and does not pretend
   to quote research it cannot see.
   ========================================================================== */

import { isNum } from '@/lib/format';
import { CHAINS, type Chain } from '@/lib/demand-chains';
import { LETTERS, lettersForTicker, mentionOf, type Letter, type Mention, type Topic } from '@/lib/letters';

/* ---------- consensus forecasts ----------------------------------------------- */

export interface ConsensusYear {
  /** fiscal year end, YYYY-MM-DD */
  date: string;
  revenue: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
  /** against the fiscal year before, from the same feed */
  revenueGrowth: number | null;
  eps: number | null;
  epsLow: number | null;
  epsHigh: number | null;
  epsGrowth: number | null;
  analystsRevenue: number | null;
  analystsEps: number | null;
}

const num = (v: unknown) => (isNum(v) ? (v as number) : null);
const growth = (now: number | null, before: number | null) => (now !== null && before !== null && before > 0 ? now / before - 1 : null);

/** A reported fiscal year, from the annual income statement. */
export interface Reported { date: string; revenue: number | null; eps: number | null }

export function reportedYears(income: unknown): Reported[] {
  if (!Array.isArray(income)) return [];
  return income.filter((r: any) => r?.date).map((r: any) => ({
    date: String(r.date).slice(0, 10), revenue: num(r.revenue), eps: num(r.epsDiluted ?? r.eps),
  }));
}

const YEAR_MS = 400 * 864e5;

/**
 * The fiscal years still ahead on `asOf` (a year whose end has passed is a
 * reported year, not a forecast), oldest first, at most `n`.
 *
 * Growth is read against the year before: the **reported** year when the
 * income statement has one ending within the previous 400 days, otherwise the
 * consensus for that year from the same feed. The feed often starts at the
 * year in progress, and growth against a filed figure is the honest base.
 */
export function consensusYears(raw: unknown, asOf: string, n = 3, reported: Reported[] = []): ConsensusYear[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw.filter((r: any) => r?.date).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
  const out: ConsensusYear[] = [];
  rows.forEach((r: any, i: number) => {
    const date = String(r.date).slice(0, 10);
    if (date < asOf) return;
    const filed = reported
      .filter((x) => x.date < date && Date.parse(date) - Date.parse(x.date) <= YEAR_MS && Date.parse(date) - Date.parse(x.date) > 300 * 864e5)
      .sort((x, y) => y.date.localeCompare(x.date))[0];
    const prev = i > 0 ? rows[i - 1] : null;
    const baseRevenue = filed?.revenue ?? num(prev?.revenueAvg);
    const baseEps = filed?.eps ?? num(prev?.epsAvg);
    out.push({
      date,
      revenue: num(r.revenueAvg), revenueLow: num(r.revenueLow), revenueHigh: num(r.revenueHigh),
      revenueGrowth: growth(num(r.revenueAvg), baseRevenue),
      eps: num(r.epsAvg), epsLow: num(r.epsLow), epsHigh: num(r.epsHigh),
      epsGrowth: growth(num(r.epsAvg), baseEps),
      analystsRevenue: num(r.numAnalystsRevenue), analystsEps: num(r.numAnalystsEps),
    });
  });
  return out.slice(0, n);
}

/** How wide the forecasts are: (high − low) / average. A wide band is disagreement, not information. */
export const spread = (avg: number | null, low: number | null, high: number | null) =>
  (avg !== null && low !== null && high !== null && avg !== 0 ? (high - low) / Math.abs(avg) : null);

/* ---------- price targets ----------------------------------------------------- */

export interface TargetWindow { label: string; average: number | null; count: number | null; upside: number | null }

/** The price-target summary as three windows, each against today's price. */
export function targetWindows(summary: any, price: number | null): TargetWindow[] {
  if (!summary) return [];
  const w = (label: string, avg: unknown, count: unknown): TargetWindow => {
    const average = num(avg);
    return { label, average, count: num(count), upside: average !== null && price ? average / price - 1 : null };
  };
  return [
    w('Last month', summary.lastMonthAvgPriceTarget, summary.lastMonthCount),
    w('Last quarter', summary.lastQuarterAvgPriceTarget, summary.lastQuarterCount),
    w('Last year', summary.lastYearAvgPriceTarget, summary.lastYearCount),
  ].filter((x) => x.average !== null && (x.count ?? 0) > 0);
}

/* ---------- the industry: peers' consensus -------------------------------------- */

export interface PeerForecast {
  symbol: string;
  /** the first fiscal year still ahead */
  year: string | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  analysts: number | null;
}

export function peerForecast(symbol: string, raw: unknown, asOf: string, reported: Reported[] = []): PeerForecast {
  const [first] = consensusYears(raw, asOf, 1, reported);
  return {
    symbol,
    year: first?.date ?? null,
    revenueGrowth: first?.revenueGrowth ?? null,
    epsGrowth: first?.epsGrowth ?? null,
    analysts: first?.analystsRevenue ?? null,
  };
}

export function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => isNum(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** The peer symbols the report holds, excluding the company itself, at most `n`. */
export function peerSymbols(raw: unknown, self: string, n = 8): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const p of raw) {
    const s = String(p?.symbol || '').toUpperCase();
    if (s && s !== self.toUpperCase() && !out.includes(s) && /^[A-Z][A-Z.-]{0,9}$/.test(s)) out.push(s);
    if (out.length >= n) break;
  }
  return out;
}

/* ---------- the industry: published figures and outlooks ------------------------ */

/** Demand Discovery chains that name the company, with its layer in each. */
export function chainsFor(symbol: string, chains: Chain[] = CHAINS): { chain: Chain; layer: string; layerName: string; exposure: string }[] {
  const s = symbol.toUpperCase();
  const out: { chain: Chain; layer: string; layerName: string; exposure: string }[] = [];
  for (const chain of chains) {
    for (const layer of chain.layers) {
      const m = layer.members.find((x) => x.symbol === s);
      if (m) out.push({ chain, layer: layer.id, layerName: layer.name, exposure: m.exposure });
    }
  }
  return out;
}

/* The library's subjects are a house view's, not a sector list: the
   nearest heading for each sector, stated on the page as the nearest. */
const SECTOR_TOPICS: Record<string, Topic[]> = {
  Technology: ['ai'],
  'Communication Services': ['ai'],
  Energy: ['energy'],
  Utilities: ['energy'],
  'Financial Services': ['credit', 'rates'],
  'Real Estate': ['rates', 'credit'],
  Industrials: ['macro'],
  'Basic Materials': ['macro'],
  'Consumer Cyclical': ['macro'],
  'Consumer Defensive': ['inflation'],
  Healthcare: ['policy'],
};

export const sectorTopics = (sector: string | null | undefined): Topic[] => SECTOR_TOPICS[String(sector || '')] || [];

export interface LetterHit { letter: Letter; why: 'names it' | 'sector'; mention?: Mention | null }

/* A document that says what it thinks of the company beats one that only
   names it; a trade beats a passing mention; then the newest. */
const namedRank = (m: Mention | null) => (m?.view ? 0 : 2) + (m && m.action !== 'discussed' ? 0 : 1);

/**
 * Documents that name the company first — read ones, with a view, ahead of
 * the rest — then the newest outlooks and research on its sector's subject.
 * Fund letters about other holdings are left out of the second group: a
 * letter's subject is its own portfolio. When the company is named anywhere,
 * the sector reading is cut to `sectorWhenNamed`, so it cannot crowd out the
 * documents that are actually about it.
 */
export function lettersFor(symbol: string, sector: string | null | undefined, n = 6, list: Letter[] = LETTERS, sectorWhenNamed = 3): LetterHit[] {
  const named = lettersForTicker(symbol, list)
    .map((letter) => ({ letter, mention: mentionOf(letter, symbol) }))
    .sort((a, b) => namedRank(a.mention) - namedRank(b.mention) || b.letter.date.localeCompare(a.letter.date));
  const topics = sectorTopics(sector);
  const ids = new Set(named.map((h) => h.letter.id));
  const onTopic = list
    .filter((l) => !ids.has(l.id) && l.kind !== 'letter' && l.topics.some((t) => topics.includes(t)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return [
    ...named.slice(0, n).map((h) => ({ ...h, why: 'names it' as const })),
    ...onTopic.slice(0, named.length ? sectorWhenNamed : n).map((letter) => ({ letter, why: 'sector' as const })),
  ];
}

/* ==========================================================================
   The rating firms' own public views

   The firms that rate a stock publish their analysts' notes to clients only,
   but several also publish a house view in the open — Morgan Stanley's and
   Goldman's outlooks, UBS's CIO notes. Where the library holds one, the page
   can show what that house is saying in public beside the rating it gave.
   It is labelled as the house view, never as the analyst's note on the stock.
   ========================================================================== */

/** Rating-firm names as the rating feed spells them, to the library's firms. */
const RATER_TO_FIRMS: [RegExp, string[]][] = [
  [/morgan stanley/i, ['ms']],
  [/goldman/i, ['gs']],
  [/j\.?\s?p\.?\s?morgan|jpmorgan/i, ['jpm-am', 'jpm-pb']],
  [/^ubs\b/i, ['ubs']],
  [/deutsche/i, ['db']],
  [/blackrock/i, ['blackrock']],
];

export interface HouseView {
  rater: string;
  firmKey: string;
  letter: Letter;
  /** why this document: it is on the stock's subject, on equities, or only the firm's newest */
  fit: 'subject' | 'equities' | 'newest';
}

/**
 * For each rating firm with a public house view in the library, the document
 * nearest the stock: its newest on the stock's sector subject, else its newest
 * on equities, else simply its newest — and the page says which, because a
 * bank's note on European gas is its view, but not a view on Apple.
 */
export function houseViews(raters: string[], list: Letter[] = LETTERS, topics: Topic[] = []): HouseView[] {
  const out: HouseView[] = [];
  const seen = new Set<string>();
  const newest = (ls: Letter[]) => ls.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  for (const rater of raters) {
    const keys = RATER_TO_FIRMS.find(([rx]) => rx.test(rater))?.[1];
    if (!keys) continue;
    const own = list.filter((l) => keys.includes(l.firm));
    const onSubject = newest(own.filter((l) => l.topics.some((t) => topics.includes(t))));
    const onEquities = newest(own.filter((l) => l.topics.includes('equities')));
    const letter = onSubject || onEquities || newest(own);
    if (!letter || seen.has(letter.firm)) continue;
    seen.add(letter.firm);
    out.push({ rater, firmKey: letter.firm, letter, fit: onSubject ? 'subject' : onEquities ? 'equities' : 'newest' });
  }
  return out;
}
