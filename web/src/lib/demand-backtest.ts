/* ==========================================================================
   Maz Vantage — Demand Discovery: the point-in-time backtest

   For every company and every quarterly filing, the engine is run as of the
   filing date on exactly the data a reader had that day, and the stock's
   return over the next six and twelve months is set against the S&P 500
   ETF's over the same dates.

   ---------------------------------------------------------------------------
   The rules that keep it honest
   ---------------------------------------------------------------------------

   - **Entry is the first weekly close after the filing day.** Never the
     period end — Micron's quarter ending 2023-08-31 was filed 2023-10-06,
     and the five weeks between are not tradable on information nobody had.
   - **Evidence rows count only after their publication date**, and the
     chains are applied as written today — that last part is look-ahead and
     is stated: the choice of AI, copper and robotics as themes, and of these
     companies, was made in 2026. The controls (lithium, solar) exist to
     partly offset it, and the report says the sample is small and chosen.
   - **Windows overlap.** Twelve-month returns from consecutive quarters
     share nine months. The summaries print counts and medians, never
     t-statistics, because the observations are not independent.
   - **Nothing is tuned.** The bands and weights were written before the
     backtest was run and were not changed after.

   ---------------------------------------------------------------------------
   One hypothesis added after looking, and labelled as such
   ---------------------------------------------------------------------------

   The 2019–2026 run showed the shortage signature at its highest near
   cyclical peaks and the glut tests firing near troughs (Micron in 2023,
   Albemarle in 2024–25). That suggested a rule the engine did not have:
   **supply discipline** (`supplyDiscipline` in `demand-cycle.ts`). Because
   it was conceived after seeing 2019–2026, it is only evidence if it also
   holds on 1998–2017, which the engine never saw; `discipline` marks every
   row so both periods can be read separately.
   ========================================================================== */

import { isNum, mean, median } from './format';
import { addDays, closeAfter, daysBetween, pointInTime, type Company, type PricePoint } from './demand-data';
import { cyclePhase, glutWarning, shortageSignature, supplyDiscipline, type GlutLevel, type Phase } from './demand-cycle';
import { growthProfile } from './demand-metrics';
import { pricedIn, type PricedInLevel } from './demand-pricedin';

export interface BacktestRow {
  symbol: string;
  period: string;
  filed: string;
  entry: string | null;
  shortage: number | null;
  glutRisk: number | null;
  glut: GlutLevel;
  phase: Phase;
  acceleration: number | null;
  pricedIn: PricedInLevel;
  implied: number | null;
  /** the post-hoc supply-discipline rule; null when capex is too light to judge */
  discipline: boolean | null;
  ret6: number | null;
  ret12: number | null;
  ret24: number | null;
  bench6: number | null;
  bench12: number | null;
  bench24: number | null;
  excess6: number | null;
  excess12: number | null;
  excess24: number | null;
}

function forward(prices: PricePoint[], entryDate: string, days: number, lastDate: string) {
  const exitTarget = addDays(entryDate, days);
  if (exitTarget > lastDate) return null;
  return closeAfter(prices, exitTarget);
}

export function backtestCompany(c: Company, bench: PricePoint[], { from = '2019-06-01', to = '9999-12-31' } = {}): BacktestRow[] {
  const rows: BacktestRow[] = [];
  if (!c.prices.length) return rows;
  const lastPrice = c.prices[c.prices.length - 1][0];
  const lastBench = bench.length ? bench[bench.length - 1][0] : '';
  const filings = [...new Set(c.quarters.map((q) => q.filed))].filter((f) => f >= from && f <= to).sort();
  for (const filed of filings) {
    const view = pointInTime(c, filed);
    const qs = view.quarters;
    if (qs.length < 8) continue;
    const s = shortageSignature(qs);
    const gl = glutWarning(qs);
    const phase = cyclePhase(s, gl, qs);
    // A trade needs a price within two weeks of the filing; a series that
    // starts later (a spin-off, a listing) is not entered retroactively.
    const first = closeAfter(c.prices, addDays(filed, 1));
    const entry = first && daysBetween(filed, first.date) <= 14 ? first : null;
    const benchEntry = entry ? closeAfter(bench, entry.date) : null;
    const shares = [...qs].reverse().find((q) => isNum(q.sh))?.sh ?? null;
    const pi = pricedIn(qs, entry?.close ?? null, shares);
    const out = (days: number) => {
      if (!entry || !benchEntry) return { ret: null, bench: null };
      const x = forward(c.prices, entry.date, days, lastPrice);
      const b = forward(bench, entry.date, days, lastBench);
      return {
        ret: x ? x.close / entry.close - 1 : null,
        bench: b ? b.close / benchEntry.close - 1 : null,
      };
    };
    const six = out(182);
    const twelve = out(365);
    const two = out(730);
    rows.push({
      symbol: c.symbol,
      period: qs[qs.length - 1].date,
      filed,
      entry: entry?.date ?? null,
      shortage: s.score,
      glutRisk: gl.risk,
      glut: gl.level,
      phase,
      acceleration: growthProfile(qs).acceleration,
      pricedIn: pi.level,
      implied: pi.implied,
      discipline: supplyDiscipline(qs),
      ret6: six.ret, ret12: twelve.ret, ret24: two.ret, bench6: six.bench, bench12: twelve.bench, bench24: two.bench,
      excess6: isNum(six.ret) && isNum(six.bench) ? six.ret - six.bench : null,
      excess12: isNum(twelve.ret) && isNum(twelve.bench) ? twelve.ret - twelve.bench : null,
      excess24: isNum(two.ret) && isNum(two.bench) ? two.ret - two.bench : null,
    });
  }
  return rows;
}

export interface Bucket {
  key: string;
  n: number;
  meanExcess12: number | null;
  medianExcess12: number | null;
  hitRate12: number | null;
  medianExcess6: number | null;
  n24: number;
  medianExcess24: number | null;
  symbols: string[];
}

export function bucketize(rows: BacktestRow[], keyOf: (r: BacktestRow) => string | null): Bucket[] {
  const groups = new Map<string, BacktestRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k === null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return [...groups].map(([key, rs]) => {
    const e12 = rs.map((r) => r.excess12).filter(isNum) as number[];
    const e6 = rs.map((r) => r.excess6).filter(isNum) as number[];
    const e24 = rs.map((r) => r.excess24).filter(isNum) as number[];
    return {
      key,
      n: e12.length,
      meanExcess12: e12.length ? mean(e12) : null,
      medianExcess12: e12.length ? median(e12) : null,
      hitRate12: e12.length ? e12.filter((x) => x > 0).length / e12.length : null,
      medianExcess6: e6.length ? median(e6) : null,
      n24: e24.length,
      medianExcess24: e24.length ? median(e24) : null,
      symbols: [...new Set(rs.map((r) => r.symbol))],
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

/** Spearman rank correlation, for a direction-only read of a score against returns. */
export function spearman(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const rank = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs.slice(0, n));
  const ry = rank(ys.slice(0, n));
  const mx = mean(rx)!;
  const my = mean(ry)!;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

/**
 * The first filing at which a company entered a phase after at least
 * `quiet` filings outside it — "when would the engine have flagged it?" —
 * with what the stock did next.
 */
export function firstSignals(rows: BacktestRow[], phases: Phase[], quiet = 2): BacktestRow[] {
  const out: BacktestRow[] = [];
  let outside = quiet;
  for (const r of rows) {
    if (phases.includes(r.phase)) {
      if (outside >= quiet) out.push(r);
      outside = 0;
    } else outside += 1;
  }
  return out;
}
