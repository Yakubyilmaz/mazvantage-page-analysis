/* ==========================================================================
   Maz Vantage — why is it moving?

   One line under the stock's price: how far it moved in its latest session,
   whether the market or its sector moved the same way, and what the company,
   the analysts and the press published between the last two closes.

   Rule-based and fixed, like the headline reader it uses (`news-events.ts`):
   the same feeds always give the same line, and every clause names the row it
   was read from. It matches **dates**, so it can say what coincided with a
   move and never that one caused it. The line says "the main company story
   that day", not "because", unless the cause is mechanical (a dividend coming
   off the price) or the results themselves (a report in the window).

   What it reads, in the order it prefers a cause:
     1. a results report in the window (EPS and revenue against the estimate);
     2. the ex-dividend date, when the dividend accounts for most of a fall;
     3. upgrades, downgrades and new coverage dated in the window;
     4. the company's own releases and the press, tagged by event, with a
        direction only where the headline's verb has one meaning.
   ========================================================================== */

import { isNum, money, trim } from './format';
import { EVENT_LABEL, EVENT_ORDER, groupStories, type NewsDirection, type NewsEvent } from './news-events';

export interface Bar { date: string; price: number }

export interface NewsRow { title: string; publishedDate?: string; date?: string; publisher?: string; site?: string; url?: string | null }
export interface RatingRow { date: string; gradingCompany?: string; previousGrade?: string; newGrade?: string; action?: string }
export interface EarningsRow { date: string; epsActual?: number | null; epsEstimated?: number | null; revenueActual?: number | null; revenueEstimated?: number | null }
export interface DividendRow { date: string; dividend?: number | null; adjDividend?: number | null }

export interface MoveInput {
  symbol: string;
  /** the quote: `changePct` is a fraction (−0.0157 for −1.57%); `time` is ISO */
  quote?: { price?: number | null; changePct?: number | null; time?: string | null } | null;
  /** daily closes, any order */
  prices?: Bar[] | null;
  market?: Bar[] | null;
  sector?: Bar[] | null;
  /** the sector fund's ticker, for the line ("XLK") */
  sectorName?: string | null;
  /** live intraday moves for the benchmarks, used when their daily series stops before the move's date */
  marketPct?: number | null;
  sectorPct?: number | null;
  /** `null` = the feed was not loaded, which the line must not read as "no news" */
  news?: NewsRow[] | null;
  press?: NewsRow[] | null;
  ratings?: RatingRow[] | null;
  earnings?: EarningsRow[] | null;
  dividends?: DividendRow[] | null;
  /** YYYY-MM-DD, for "today"; defaults to the clock */
  today?: string;
}

export type CauseKind = 'earnings' | 'ex-dividend' | 'rating' | 'story';
export interface Cause {
  kind: CauseKind;
  /** a clause, without a full stop */
  text: string;
  date: string;
  source?: string;
  url?: string | null;
  direction?: NewsDirection | null;
  /** for a story: the event tag's label */
  label?: string;
}

export type MoveKind = 'quiet' | 'market' | 'sector' | 'specific';

export interface MoveReading {
  symbol: string;
  date: string;
  /** the session before, whose close the move is measured from */
  prevDate: string | null;
  pct: number;
  /** the standard deviation of daily moves over the 60 sessions before */
  typical: number | null;
  marketPct: number | null;
  sectorPct: number | null;
  sectorName: string | null;
  kind: MoveKind;
  lead: Cause | null;
  causes: Cause[];
  /** feeds the line could not read, by their reader-facing names */
  unread: string[];
  line: string;
}

/* ---------- dates and series --------------------------------------------------- */

const day = (s: string | null | undefined) => String(s || '').slice(0, 10);
const sorted = (bars: Bar[] | null | undefined) => (bars || [])
  .filter((b) => b && isNum(b.price) && b.price > 0 && /^\d{4}-\d{2}-\d{2}/.test(String(b.date)))
  .map((b) => ({ date: day(b.date), price: b.price }))
  .sort((a, b) => a.date.localeCompare(b.date));

/** The move on `date` in a daily series: its close over the close before. */
export function moveOn(bars: Bar[] | null | undefined, date: string): number | null {
  const s = sorted(bars);
  const i = s.findIndex((b) => b.date === date);
  if (i < 1) return null;
  return s[i].price / s[i - 1].price - 1;
}

/** Standard deviation of daily moves over the `n` sessions before `date`. */
export function typicalMove(bars: Bar[] | null | undefined, date: string, n = 60): number | null {
  const s = sorted(bars).filter((b) => b.date < date);
  const rets: number[] = [];
  for (let i = Math.max(1, s.length - n); i < s.length; i++) rets.push(s[i].price / s[i - 1].price - 1);
  if (rets.length < 20) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  return Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
}

/**
 * Which session the line is about, and how far it moved. The quote wins when
 * it is at least as new as the last daily close (intraday, it is the only
 * figure for today). A quote older than the closes — a saved copy whose
 * prices were refreshed and its quote not — would describe a stale day, so
 * the last two closes are used instead.
 */
export function sessionOf(input: Pick<MoveInput, 'quote' | 'prices'>): { date: string; prevDate: string | null; pct: number } | null {
  const s = sorted(input.prices);
  const last = s[s.length - 1];
  const qDate = day(input.quote?.time);
  const qPct = input.quote?.changePct;
  if (qDate && isNum(qPct) && (!last || qDate >= last.date)) {
    const before = s.filter((b) => b.date < qDate);
    return { date: qDate, prevDate: before.length ? before[before.length - 1].date : null, pct: qPct };
  }
  if (s.length < 2) return null;
  return { date: last.date, prevDate: s[s.length - 2].date, pct: last.price / s[s.length - 2].price - 1 };
}

/* ---------- formatting ---------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'today';
  const [y, m, d] = date.split('-').map(Number);
  const year = y === Number(today.slice(0, 4)) ? '' : ` ${y}`;
  return `on ${d} ${MONTHS[m - 1]}${year}`;
}
const shortDate = (date: string, today: string) => dayLabel(date, today).replace(/^on /, '');

/** −0.0157 → "−1.6%", 0.003 → "+0.3%". */
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${trim(Math.abs(v) * 100, 1)}%`;
const usd = (v: number) => (Math.abs(v) >= 1e6 ? money(v, { currency: '$', dp: 1 }) : `$${v.toFixed(2)}`);

/* ---------- the causes ------------------------------------------------------------ */

const ACTIONS: Record<string, string> = { upgrade: 'upgraded it', downgrade: 'downgraded it', initiate: 'started coverage', init: 'started coverage' };

function ratingCauses(rows: RatingRow[], from: string | null, to: string): Cause[] {
  return rows
    .filter((r) => r && ACTIONS[String(r.action || '').toLowerCase()] && day(r.date) <= to && (!from || day(r.date) > from))
    .map((r) => {
      const action = String(r.action).toLowerCase();
      const firm = r.gradingCompany || 'A firm';
      const text = action === 'upgrade' || action === 'downgrade'
        ? `${firm} ${ACTIONS[action]} to ${r.newGrade}${r.previousGrade && r.previousGrade !== r.newGrade ? ` from ${r.previousGrade}` : ''}`
        : `${firm} started coverage at ${r.newGrade}`;
      const direction: NewsDirection | null = action === 'upgrade' ? 'up' : action === 'downgrade' ? 'down' : null;
      return { kind: 'rating' as const, text, date: day(r.date), source: firm, direction };
    });
}

function earningsCause(rows: EarningsRow[], from: string | null, to: string, today: string): Cause | null {
  // A report dated on the session itself (before the open), else the session
  // before (after its close) — the feed carries no time of day.
  const reported = rows.filter((r) => r && isNum(r.epsActual));
  const hit = reported.find((r) => day(r.date) === to) || (from ? reported.find((r) => day(r.date) === from) : null);
  if (!hit) return null;
  const parts: string[] = [];
  if (isNum(hit.epsActual)) parts.push(`earnings per share ${usd(hit.epsActual)}${isNum(hit.epsEstimated) ? ` against ${usd(hit.epsEstimated)} expected` : ''}`);
  if (isNum(hit.revenueActual)) parts.push(`revenue ${usd(hit.revenueActual)}${isNum(hit.revenueEstimated) ? ` against ${usd(hit.revenueEstimated)}` : ''}`);
  const when = day(hit.date) === to ? '' : ` on ${shortDate(day(hit.date), today)}`;
  const beat = isNum(hit.epsActual) && isNum(hit.epsEstimated) ? (hit.epsActual > hit.epsEstimated ? 'up' : hit.epsActual < hit.epsEstimated ? 'down' : null) : null;
  return { kind: 'earnings', text: `it reported quarterly results${when}: ${parts.join(', ')}`, date: day(hit.date), direction: beat };
}

function dividendCause(rows: DividendRow[], date: string, priceNow: number | null): { cause: Cause; share: number | null } | null {
  const hit = rows.find((r) => r && day(r.date) === date);
  const amount = hit ? (isNum(hit.dividend) ? hit.dividend : hit.adjDividend) : null;
  if (!hit || !isNum(amount)) return null;
  const share = isNum(priceNow) && priceNow > 0 ? amount / (priceNow + amount) : null;
  return {
    cause: { kind: 'ex-dividend', text: `it went ex-dividend, so the ${usd(amount)} payout came off the price${share != null ? ` (${trim(share * 100, 1)}%)` : ''}`, date, direction: 'down' },
    share,
  };
}

/** News and the company's releases dated after the previous close, read by event. */
function storyCauses(rows: NewsRow[], from: string | null, to: string): Cause[] {
  const inWindow = rows
    .map((r) => ({ title: r.title, date: String(r.publishedDate || r.date || ''), source: r.publisher || r.site || undefined, url: r.url ?? null }))
    .filter((r) => r.title && r.date && day(r.date) <= to && (!from || r.date.slice(0, 16) > `${from} 16:00`));
  return groupStories(inWindow)
    .filter((s) => s.reading.event)
    .map((s) => ({
      kind: 'story' as const,
      text: `“${s.lead.title.trim()}”${s.lead.source ? ` (${s.lead.source})` : ''}`,
      date: day(s.lead.date),
      source: s.lead.source,
      url: s.lead.url,
      direction: s.reading.direction,
      label: EVENT_LABEL[s.reading.event as NewsEvent],
      _event: s.reading.event as NewsEvent,
      _copies: s.copies.length,
    }))
    .sort((a, b) => EVENT_ORDER.indexOf(a._event) - EVENT_ORDER.indexOf(b._event) || b._copies - a._copies)
    .map(({ _event, _copies, ...c }) => c);
}

/* ---------- the reading ------------------------------------------------------------ */

export function readMove(input: MoveInput): MoveReading | null {
  const session = sessionOf(input);
  if (!session) return null;
  const { date, prevDate, pct } = session;
  const today = input.today || new Date().toISOString().slice(0, 10);
  const typical = typicalMove(input.prices, date);
  const marketPct = moveOn(input.market, date) ?? (isNum(input.marketPct) ? input.marketPct : null);
  const sectorPct = moveOn(input.sector, date) ?? (isNum(input.sectorPct) ? input.sectorPct : null);
  const sd = typical ?? 0.015;
  const dir: NewsDirection = pct >= 0 ? 'up' : 'down';

  // What kind of day: ordinary, the market's, the sector's, or its own.
  const sameWay = (b: number | null) => b != null && Math.sign(b) === Math.sign(pct) && Math.abs(b) >= 0.25 * sd;
  let kind: MoveKind = 'specific';
  if (Math.abs(pct) < 0.75 * sd) kind = 'quiet';
  else if (sameWay(marketPct) && Math.abs(pct - (marketPct as number)) < 0.6 * sd) kind = 'market';
  else if (sameWay(sectorPct) && Math.abs(pct - (sectorPct as number)) < 0.6 * sd) kind = 'sector';

  const unread: string[] = [];
  const causes: Cause[] = [];
  const priceNow = isNum(input.quote?.price) && day(input.quote?.time) === date ? input.quote!.price! : (sorted(input.prices).find((b) => b.date === date)?.price ?? null);

  const earnings = input.earnings ? earningsCause(input.earnings, prevDate, date, today) : null;
  if (!input.earnings) unread.push('results');
  const div = input.dividends ? dividendCause(input.dividends, date, priceNow) : null;
  const ratings = input.ratings ? ratingCauses(input.ratings, prevDate, date) : [];
  if (!input.ratings) unread.push('rating changes');
  const stories = input.news || input.press ? storyCauses([...(input.press || []), ...(input.news || [])], prevDate, date) : [];
  if (!input.news && !input.press) unread.push('news');

  if (earnings) causes.push(earnings);
  if (div) causes.push(div.cause);
  causes.push(...ratings, ...stories);

  // The lead: the report itself; then a dividend that accounts for most of a
  // fall; then a rating change or a story whose verb points the way the price
  // went; then whatever was tagged first. A story pointing the other way is
  // listed, never led with.
  const matching = (c: Cause) => c.direction === dir;
  const lead = earnings
    ?? (div && pct < 0 && div.share != null && div.share >= 0.5 * Math.abs(pct) ? div.cause : null)
    ?? ratings.find(matching) ?? stories.find(matching)
    ?? stories.find((c) => !c.direction) ?? ratings.find((c) => !c.direction)
    ?? null;

  const line = compose({ pct, date, today, kind, marketPct, sectorPct, sectorName: input.sectorName ?? null, lead, causes, unread });
  return { symbol: input.symbol, date, prevDate, pct, typical, marketPct, sectorPct, sectorName: input.sectorName ?? null, kind, lead, causes, unread, line };
}

function compose(r: {
  pct: number; date: string; today: string; kind: MoveKind; marketPct: number | null; sectorPct: number | null;
  sectorName: string | null; lead: Cause | null; causes: Cause[]; unread: string[];
}): string {
  const when = dayLabel(r.date, r.today);
  const size = trim(Math.abs(r.pct) * 100, 1);
  const head = Math.abs(r.pct) < 0.0005 ? `Flat ${when}` : `${r.pct > 0 ? 'Up' : 'Down'} ${size}% ${when}`;
  const sector = r.sectorName ? `its sector fund (${r.sectorName})` : 'its sector';

  let context = '';
  if (r.kind === 'quiet') {
    context = r.marketPct != null ? `, an ordinary move for it, with the market ${signed(r.marketPct)}` : ', an ordinary move for it';
  } else if (r.kind === 'market') {
    context = `, in step with the market (${signed(r.marketPct as number)})`;
  } else if (r.kind === 'sector') {
    context = `, with ${sector} (${signed(r.sectorPct as number)}) while the market moved ${signed(r.marketPct ?? 0)}`;
  } else if (r.marketPct != null) {
    const gap = (r.pct - r.marketPct) * 100;
    context = `, ${trim(Math.abs(gap), 1)} points ${gap > 0 ? 'better' : 'worse'} than the market (${signed(r.marketPct)})`;
  }

  const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  let why = '';
  if (r.lead) {
    const text = r.lead.kind === 'story' ? `the main company story that day: ${r.lead.text}` : r.lead.text;
    const extra = r.causes.length - 1;
    const more = extra > 0 ? `; ${extra} more item${extra === 1 ? '' : 's'} that day` : '';
    why = r.kind === 'market' || r.kind === 'sector'
      ? ` Most of it was the ${r.kind === 'market' ? 'market' : 'sector'}’s; also that day, ${text}${more}.`
      : ` ${sentence(text)}${more}.`;
  } else if (r.kind === 'specific') {
    why = r.unread.includes('news')
      ? ' The company’s news was not loaded, so the cause is not read.'
      : r.causes.length
        ? ` Nothing published that day points the way it moved (${r.causes.length} item${r.causes.length === 1 ? '' : 's'} listed).`
        : ' We found no company news that day to account for it.';
  }
  return `${head}${context}.${why}`;
}
