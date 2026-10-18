/* ==========================================================================
   Maz Vantage — an Investment Ideas portfolio's track record

   "Top Halal Growth Stocks" is only believable beside how the last list did.
   A track record cannot be rebuilt afterwards — what a screen would have
   picked a year ago depends on data as it stood a year ago — so the back end
   records each portfolio when it is published and every time it is
   rebalanced (BACKEND_CONTRACT.md §3). This file turns those records into
   the numbers the page prints, and the server can run the same function.

   Each period runs from one recorded list to the next (or to today):

       period return  = mean over members of (end price / start price − 1)
       record         = Π (1 + period return) − 1        (time-weighted)

   Equal weight, because the published lists are equal-weight; dividends not
   included (price return), and the page says so. The benchmark is chained
   over the same dates.

   A member with no end price (delisted, merged) is not dropped silently:
   the back end should supply its last traded or deal price; when it cannot,
   the member is left out of that period and counted in `missing`, which the
   page prints. Dropping losers quietly is how track records lie.
   ========================================================================== */

import { isNum } from './format';

export interface PeriodMember { symbol: string; start: number; end: number | null }

export interface Period {
  /** ISO dates */
  from: string;
  to: string;
  members: PeriodMember[];
  benchmark: { symbol: string; start: number; end: number };
}

export interface TrackRecord {
  since: string;
  through: string;
  periods: number;
  /** compounded price return of the portfolio */
  portfolio: number;
  benchmark: number;
  benchmarkSymbol: string;
  /** portfolio minus benchmark, in return points */
  excess: number;
  /** per year, when the record is at least a year long */
  annualised: number | null;
  /** member-periods left out for want of an end price */
  missing: number;
  /** each period's own returns, oldest first */
  byPeriod: { from: string; to: string; portfolio: number; benchmark: number; members: number }[];
}

const ret = (start: number, end: number) => end / start - 1;

export function trackRecord(periods: Period[]): TrackRecord | null {
  const valid = [...periods].sort((a, b) => a.from.localeCompare(b.from))
    .filter((p) => isNum(p.benchmark?.start) && p.benchmark.start > 0 && isNum(p.benchmark?.end));
  if (!valid.length) return null;
  let port = 1;
  let bench = 1;
  let missing = 0;
  const byPeriod: TrackRecord['byPeriod'] = [];
  for (const p of valid) {
    const usable = p.members.filter((m) => isNum(m.start) && m.start > 0 && isNum(m.end));
    missing += p.members.length - usable.length;
    const pr = usable.length ? usable.reduce((t, m) => t + ret(m.start, m.end as number), 0) / usable.length : 0;
    const br = ret(p.benchmark.start, p.benchmark.end);
    port *= 1 + pr;
    bench *= 1 + br;
    byPeriod.push({ from: p.from, to: p.to, portfolio: pr, benchmark: br, members: usable.length });
  }
  const since = valid[0].from;
  const through = valid.at(-1)!.to;
  const days = (Date.parse(through) - Date.parse(since)) / 864e5;
  const years = days / 365.25;
  return {
    since, through, periods: valid.length,
    portfolio: port - 1, benchmark: bench - 1, benchmarkSymbol: valid[0].benchmark.symbol,
    excess: port - bench,
    annualised: days >= 365 ? port ** (1 / years) - 1 : null,
    missing, byPeriod,
  };
}
