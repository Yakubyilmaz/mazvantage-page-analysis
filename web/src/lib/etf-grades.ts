/* ==========================================================================
   Maz Vantage — ETF grades

   A fund is never given the company score: that ranks a business's ratios
   against its own sector, and a basket has neither. What a fund *does* have
   is the set of facts a buyer compares funds on — what it costs, how easily
   it trades, how much it swings, what it pays, how it has moved — and those
   can be ranked fund against fund, which is what Seeking Alpha's ETF grades
   do.

   **The peer group is a group on the ETF tables board.** "US equity sectors",
   "Gold miners", "Treasury bonds": somebody chose those funds as answers to
   one question, which makes them a fairer comparison set than anything a
   field on the vendor's record could produce. A group grades a figure only
   when at least `MIN_PEERS` of its funds have it — a percentile over three
   funds is first, middle, last, and that is not a grade.

   The five, each a percentile within the group mapped onto the report's own
   0–5 scale and letter bands:

     Expenses    expense ratio                                lower is better
     Liquidity   assets under management, average $ volume    higher
     Risk        1-year daily volatility, 1-year max drawdown lower
     Dividends   trailing-twelve-month yield, payers only     higher
     Momentum    3-month, 6-month and 1-year total return     higher

   A fund that pays nothing is not graded on dividends — ranked against
   payers it would come last, which says nothing a reader did not know. The
   same rule the dividend module uses for companies.
   ========================================================================== */

import { isNum, mean, stdev } from './format';
import { fetchEtfInfo, fetchFor, mapLimited, type FeedStatus } from './fmp';
import { MAX_SCORE, letterFor, type Letter } from './grading';

export const MIN_PEERS = 5;

export type EtfGradeKey = 'expenses' | 'liquidity' | 'risk' | 'dividends' | 'momentum';

export const ETF_GRADES: { key: EtfGradeKey; label: string; what: string }[] = [
  { key: 'expenses', label: 'Expenses', what: 'Expense ratio — what the fund charges a year. Lower ranks higher.' },
  { key: 'liquidity', label: 'Liquidity', what: 'Assets under management and average daily dollar volume. Bigger and busier ranks higher.' },
  { key: 'risk', label: 'Risk', what: 'One-year volatility of daily returns and the deepest fall from a high over the year. Calmer ranks higher.' },
  { key: 'dividends', label: 'Dividends', what: 'Trailing-twelve-month distributions over the price. Payers only; higher ranks higher.' },
  { key: 'momentum', label: 'Momentum', what: 'Total return over three months, six months and a year. Stronger ranks higher.' },
];

/** The facts one fund is graded on. Every field is optional; a missing one is left out, never zeroed. */
export interface FundFacts {
  symbol: string;
  expenseRatio: number | null;
  aum: number | null;
  dollarVolume: number | null;
  volatility: number | null;
  drawdown: number | null;
  yieldTtm: number | null;
  /** false when the fund paid nothing over the year */
  pays: boolean | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
}

export interface EtfGrade {
  grade: number | null;
  letter: Letter | null;
  /** how many funds in the group were ranked on this */
  peers: number;
  why: string | null;
}

export type FundGrades = Record<EtfGradeKey, EtfGrade>;

/* ---------- the facts --------------------------------------------------------- */

/** Annualised volatility of daily log returns and the largest peak-to-trough fall, over a close series oldest first. */
export function riskOf(closes: number[]): { volatility: number | null; drawdown: number | null } {
  const px = closes.filter((v) => isNum(v) && v > 0);
  if (px.length < 120) return { volatility: null, drawdown: null };
  const r: number[] = [];
  for (let i = 1; i < px.length; i += 1) r.push(Math.log(px[i] / px[i - 1]));
  const sd = stdev(r);
  let peak = px[0];
  let worst = 0;
  for (const p of px) {
    peak = Math.max(peak, p);
    worst = Math.min(worst, p / peak - 1);
  }
  return { volatility: isNum(sd) ? sd * Math.sqrt(252) : null, drawdown: Math.abs(worst) };
}

const n = (v: unknown) => (typeof v === 'string' ? Number(v) : v);
const num = (v: unknown): number | null => { const x = n(v); return isNum(x) ? x : null; };

/**
 * One fund's facts from the vendor's fund record, its dividend list, a year
 * of closes and the board's quote row. `now` is a parameter so a test can
 * pin the twelve-month window.
 */
export function factsOf(symbol: string, { info, dividends, prices, row }: { info: any; dividends: any[] | null; prices: any[] | null; row: any },
  now = Date.now()): FundFacts {
  const price = num(row?.price) ?? num(info?.nav);
  const avgVolume = num(info?.avgVolume) ?? num(row?.avgVolume);
  const year = now - 365 * 864e5;
  // Distributions dated in the last twelve months. `adjDividend` first: it is
  // the vendor's split-adjusted figure, which a yield on today's price needs.
  const paid = Array.isArray(dividends)
    ? dividends.filter((d) => { const t = new Date(d?.date).getTime(); return Number.isFinite(t) && t > year && t <= now; })
      .reduce((s, d) => s + (num(d.adjDividend) ?? num(d.dividend) ?? 0), 0)
    : null;
  const closes = Array.isArray(prices)
    ? [...prices].filter((p) => p?.date && new Date(p.date).getTime() > year)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))).map((p) => num(p.price) ?? num(p.close) ?? NaN)
    : [];
  const { volatility, drawdown } = riskOf(closes);
  return {
    symbol,
    expenseRatio: num(info?.expenseRatio),
    aum: num(info?.assetsUnderManagement),
    dollarVolume: isNum(avgVolume) && isNum(price) ? avgVolume * price : null,
    volatility,
    drawdown,
    yieldTtm: isNum(paid) && paid > 0 && isNum(price) && price > 0 ? paid / price : null,
    pays: dividends == null ? null : (paid ?? 0) > 0,
    m3: num(row?.m3),
    m6: num(row?.m6),
    y1: num(row?.y1),
  };
}

/* ---------- ranking ----------------------------------------------------------- */

/**
 * Percentile of each fund's value within the group, 0 for the worst and 1
 * for the best, ties sharing the average of their positions. Funds without
 * the figure get null.
 */
export function ranks(values: (number | null)[], better: 'high' | 'low'): (number | null)[] {
  const have = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => isNum(x.v));
  const out: (number | null)[] = values.map(() => null);
  if (have.length < 2) return out;
  const sorted = [...have].sort((a, b) => (better === 'high' ? a.v - b.v : b.v - a.v));
  let k = 0;
  while (k < sorted.length) {
    let j = k;
    while (j + 1 < sorted.length && sorted[j + 1].v === sorted[k].v) j += 1;
    const pos = (k + j) / 2 / (sorted.length - 1);
    for (let t = k; t <= j; t += 1) out[sorted[t].i] = pos;
    k = j + 1;
  }
  return out;
}

const blank = (peers: number, why: string): EtfGrade => ({ grade: null, letter: null, peers, why });

/** One grade per fund from one or more ranked figures, averaged. */
function combine(parts: (number | null)[][], peers: number, minPeers: number, why: string): EtfGrade[] {
  const count = parts[0].length;
  return Array.from({ length: count }, (_, i) => {
    if (peers < minPeers) return blank(peers, `Only ${peers} fund${peers === 1 ? '' : 's'} in this group ${peers === 1 ? 'has' : 'have'} this figure; a grade needs ${minPeers}.`);
    const ps = parts.map((p) => p[i]).filter(isNum);
    if (!ps.length) return blank(peers, why);
    const grade = (mean(ps) as number) * MAX_SCORE;
    return { grade, letter: letterFor(grade), peers, why: null };
  });
}

/** Grade every fund in one peer group. */
export function gradeGroup(funds: FundFacts[], { minPeers = MIN_PEERS }: { minPeers?: number } = {}): Map<string, FundGrades> {
  const col = (f: (x: FundFacts) => number | null) => funds.map(f);
  const peersOf = (...cols: (number | null)[][]) => funds.filter((_, i) => cols.some((c) => isNum(c[i]))).length;

  const er = col((f) => f.expenseRatio);
  const aum = col((f) => f.aum);
  const dv = col((f) => f.dollarVolume);
  const vol = col((f) => f.volatility);
  const dd = col((f) => f.drawdown);
  const yl = col((f) => (f.pays ? f.yieldTtm : null));
  const m3 = col((f) => f.m3);
  const m6 = col((f) => f.m6);
  const y1 = col((f) => f.y1);

  const expenses = combine([ranks(er, 'low')], peersOf(er), minPeers, 'No expense ratio is published for this fund.');
  const liquidity = combine([ranks(aum, 'high'), ranks(dv, 'high')], peersOf(aum, dv), minPeers, 'No assets or volume figure was returned.');
  const risk = combine([ranks(vol, 'low'), ranks(dd, 'low')], peersOf(vol, dd), minPeers, 'Less than six months of prices, too short to measure.');
  const dividends = combine([ranks(yl, 'high')], peersOf(yl), minPeers, 'Not graded: it paid no distribution in the last twelve months.');
  const momentum = combine([ranks(m3, 'high'), ranks(m6, 'high'), ranks(y1, 'high')], peersOf(m3, m6, y1), minPeers, 'No return history was returned.');

  const out = new Map<string, FundGrades>();
  funds.forEach((f, i) => {
    const div = f.pays === false ? blank(dividends[i].peers, 'Not graded: it paid no distribution in the last twelve months.') : dividends[i];
    out.set(f.symbol, { expenses: expenses[i], liquidity: liquidity[i], risk: risk[i], dividends: div, momentum: momentum[i] });
  });
  return out;
}

/* ---------- loading ------------------------------------------------------------ */

/**
 * The facts for a board's funds: the fund record, the dividend list and a
 * year of closes, three requests each, on the reader's click. `rows` is the
 * board's own quote map, which already carries the price and the returns.
 */
export async function loadFundFacts(symbols: string[], rows: Map<string, any>, onProgress?: (done: number, total: number) => void) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 370 * 864e5).toISOString().slice(0, 10);
  const statuses: FeedStatus[] = [];
  let done = 0;
  const facts = await mapLimited(symbols, async (s) => {
    const [info, divs, px] = await Promise.all([fetchEtfInfo(s), fetchFor('dividends', s), fetchFor('prices', s, { from, to })]);
    statuses.push(info.status);
    onProgress?.(++done, symbols.length);
    return factsOf(s, {
      info: info.status === 'ok' ? info.data : null,
      dividends: divs.status === 'ok' ? (Array.isArray(divs.data) ? divs.data : []) : null,
      prices: px.status === 'ok' ? px.data : null,
      row: rows.get(s) || null,
    });
  }, 4);
  // The fund record is the one gated feed among the three; when every fund
  // came back gated, the plan is the reason and the page should say so.
  const gated = statuses.length > 0 && statuses.every((x) => x === 'gated');
  return { facts: new Map(facts.map((f) => [f.symbol, f])), gated };
}
