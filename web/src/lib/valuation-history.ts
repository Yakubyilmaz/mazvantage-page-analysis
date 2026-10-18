/* ==========================================================================
   Maz Vantage — the stock against its own past

   "Expensive" means little without "compared with when". Three readings:

   - **multiples by fiscal year**: P/E, EV/EBITDA, P/S and free cash flow
     yield at each fiscal year end, from the market value at that date and the
     year's filed figures, set against today's trailing multiples: where today
     sits in the company's own range;
   - **drawdowns**: the deepest peak-to-trough falls in the daily closes, with
     how long each took to recover, so a reader knows what holding it has
     actually felt like;
   - **earnings reactions**: the move from the close before each report to
     the close after it, beside the surprise, so the next report's typical
     stakes are on the page.

   The closes are bundled in public/data/history/<SYMBOL>.json (captured from
   the data connector, split-adjusted, dividends not added back); with a live
   key the daily history feed replaces them. Nothing here enters a grade.
   ========================================================================== */

import { isNum, median } from './format';

/* ---------- multiples by fiscal year --------------------------------------- */

export interface YearMultiples { year: number; date: string; pe: number | null; evEbitda: number | null; ps: number | null; fcfYield: number | null }

const byYear = (rows: any[]) => new Map((rows || []).filter((r) => isNum(Number(r?.fiscalYear))).map((r) => [Number(r.fiscalYear), r]));
const pos = (v: unknown) => (isNum(v) && v > 0 ? v : null);

export function multiplesByYear(get: (name: string) => any): YearMultiples[] {
  const inc = byYear(get('income') || []);
  const bal = byYear(get('balance') || []);
  const cf = byYear(get('cashflow') || []);
  const mh = byYear(get('metricsHist') || []);
  const out: YearMultiples[] = [];
  for (const [year, m] of mh) {
    const cap = pos(m.marketCap);
    const i = inc.get(year);
    if (!cap || !i) continue;
    const b = bal.get(year);
    const c = cf.get(year);
    const netDebt = isNum(b?.netDebt) ? b.netDebt : (isNum(b?.totalDebt) && isNum(b?.cashAndShortTermInvestments) ? b.totalDebt - b.cashAndShortTermInvestments : null);
    const ni = pos(i.netIncome);
    const ebitda = pos(i.ebitda);
    const rev = pos(i.revenue);
    out.push({
      year, date: m.date || i.date,
      pe: ni ? cap / ni : null,
      evEbitda: ebitda && isNum(netDebt) ? (cap + netDebt) / ebitda : null,
      ps: rev ? cap / rev : null,
      fcfYield: isNum(c?.freeCashFlow) ? c.freeCashFlow / cap : null,
    });
  }
  return out.sort((x, y) => x.year - y.year);
}

export type MultipleKey = 'pe' | 'evEbitda' | 'ps' | 'fcfYield';

export const MULTIPLE_LABEL: Record<MultipleKey, string> = { pe: 'P/E', evEbitda: 'EV/EBITDA', ps: 'Price/sales', fcfYield: 'Free cash flow yield' };

export interface Band {
  key: MultipleKey; label: string; today: number | null;
  low: number | null; lowYear: number | null; median: number | null; high: number | null; highYear: number | null;
  years: number;
  /** how many of the filed years were cheaper than today (dearer, for the yield) */
  cheaperYears: number | null;
  /** today against the median: above 0 is dearer than usual, for every multiple (the yield is turned) */
  vsMedian: number | null;
}

/** Today's trailing multiples, on the definitions the report uses elsewhere. */
export function todayMultiples(a: any): Record<MultipleKey, number | null> {
  const f = a?.facts || {};
  const v = a?.val || {};
  return {
    pe: pos(f.pe),
    evEbitda: pos(v.evToEbitda),
    ps: isNum(f.marketCap) && pos(f.revenue) ? f.marketCap / f.revenue : null,
    fcfYield: isNum(v.fcfYield) ? v.fcfYield : null,
  };
}

export function bands(a: any, years: YearMultiples[]): Band[] {
  const now = todayMultiples(a);
  return (Object.keys(MULTIPLE_LABEL) as MultipleKey[]).map((key) => {
    const pts = years.filter((y) => isNum(y[key])).map((y) => ({ year: y.year, v: y[key] as number }));
    const today = now[key];
    if (!pts.length) return { key, label: MULTIPLE_LABEL[key], today, low: null, lowYear: null, median: null, high: null, highYear: null, years: 0, cheaperYears: null, vsMedian: null };
    const lo = pts.reduce((p, x) => (x.v < p.v ? x : p));
    const hi = pts.reduce((p, x) => (x.v > p.v ? x : p));
    const med = median(pts.map((p) => p.v));
    const yieldLike = key === 'fcfYield';
    return {
      key, label: MULTIPLE_LABEL[key], today,
      low: lo.v, lowYear: lo.year, median: med, high: hi.v, highYear: hi.year, years: pts.length,
      cheaperYears: isNum(today) ? pts.filter((p) => (yieldLike ? p.v > today : p.v < today)).length : null,
      vsMedian: isNum(today) && isNum(med) && med !== 0 ? (yieldLike ? med / today - 1 : today / med - 1) : null,
    };
  });
}

/* ---------- drawdowns ------------------------------------------------------- */

export type Close = [string, number];

export interface Drawdown { peakDate: string; peak: number; troughDate: string; trough: number; depth: number; recoveredDate: string | null; days: number | null }

/** Every peak-to-trough episode, deepest first: an episode ends when the price regains its old peak. */
export function drawdowns(closes: Close[], n = 3): Drawdown[] {
  const eps: Drawdown[] = [];
  let peakI = 0;
  let troughI = 0;
  for (let i = 1; i < closes.length; i++) {
    const p = closes[i][1];
    if (p >= closes[peakI][1]) {
      if (troughI > peakI && closes[troughI][1] < closes[peakI][1]) {
        eps.push(ep(closes, peakI, troughI, i));
      }
      peakI = i;
      troughI = i;
    } else if (p < closes[troughI][1]) {
      troughI = i;
    }
  }
  if (troughI > peakI && closes[troughI][1] < closes[peakI][1]) eps.push(ep(closes, peakI, troughI, null));
  return eps.sort((x, y) => x.depth - y.depth).slice(0, n);
}

function ep(c: Close[], p: number, t: number, r: number | null): Drawdown {
  return {
    peakDate: c[p][0], peak: c[p][1], troughDate: c[t][0], trough: c[t][1], depth: c[t][1] / c[p][1] - 1,
    recoveredDate: r == null ? null : c[r][0],
    days: r == null ? null : Math.round((+new Date(c[r][0]) - +new Date(c[p][0])) / 864e5),
  };
}

/** Annualised price return over `years`, ending on the last close. */
export function trailingReturn(closes: Close[], years: number): number | null {
  if (closes.length < 2) return null;
  const end = closes[closes.length - 1];
  const target = new Date(end[0]);
  target.setUTCFullYear(target.getUTCFullYear() - years);
  const iso = target.toISOString().slice(0, 10);
  if (closes[0][0] > iso) return null;
  const start = closes.find((c) => c[0] >= iso);
  return start ? (end[1] / start[1]) ** (1 / years) - 1 : null;
}

/* ---------- earnings reactions ---------------------------------------------- */

export interface Reaction { date: string; move: number; epsSurprise: number | null; revenueSurprise: number | null }

/**
 * The close on the report date (or the last before it) to the next close
 * after it: both companies report after the market closes, so the next
 * session is the first to trade on the news.
 */
export function earningsReactions(closes: Close[], rows: any[]): Reaction[] {
  const out: Reaction[] = [];
  for (const r of rows || []) {
    if (!r?.date || !isNum(r.epsActual)) continue;
    const before = [...closes].reverse().find((c) => c[0] <= r.date);
    const after = closes.find((c) => c[0] > r.date);
    if (!before || !after) continue;
    out.push({
      date: r.date, move: after[1] / before[1] - 1,
      epsSurprise: isNum(r.epsEstimated) && r.epsEstimated ? r.epsActual / Math.abs(r.epsEstimated) - 1 : null,
      revenueSurprise: isNum(r.revenueActual) && isNum(r.revenueEstimated) && r.revenueEstimated ? r.revenueActual / r.revenueEstimated - 1 : null,
    });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

export interface ReactionSummary { count: number; medianAbs: number | null; up: number; down: number; beatButFell: number; biggest: Reaction | null }

export function reactionSummary(rs: Reaction[]): ReactionSummary {
  return {
    count: rs.length,
    medianAbs: rs.length ? median(rs.map((r) => Math.abs(r.move))) : null,
    up: rs.filter((r) => r.move > 0).length,
    down: rs.filter((r) => r.move < 0).length,
    beatButFell: rs.filter((r) => isNum(r.epsSurprise) && r.epsSurprise >= 0 && r.move < 0).length,
    biggest: rs.length ? rs.reduce((p, x) => (Math.abs(x.move) > Math.abs(p.move) ? x : p)) : null,
  };
}

let histLoads = new Map<string, Promise<Close[] | null>>();
/** The bundled daily closes for a symbol, or null. */
export function loadCloses(symbol: string): Promise<Close[] | null> {
  const s = symbol.toUpperCase();
  if (!histLoads.has(s)) {
    histLoads.set(s, fetch(`/data/history/${s}.json`).then((r) => (r.ok ? r.json() : null))
      .then((d) => (Array.isArray(d?.closes) ? d.closes as Close[] : null)).catch(() => null));
  }
  return histLoads.get(s)!;
}
export const _resetCloses = () => { histLoads = new Map(); };
