'use client';

/* ==========================================================================
   The ratio table

     Ratio | AAPL | Sector Median | Sector Ranking | Sector Relative Grade

   The row reads left to right the way the grade is arrived at: what the
   company's number is, what it was measured against, where that puts it in
   the sector, and only then the letter that follows from it. A sentence under
   every row says what the number means and why it graded as it did.

   The tick beside each name says which side of the sector median the company
   falls on. It is a reading aid and carries no weight.

   Exported for the dividend module, which puts its own lines through it —
   everything that varies between the two travels on the metric objects.
   ========================================================================== */

import * as React from 'react';
import { dec, isNum, pct } from '@/lib/format';
import type { GradedMetric } from '@/lib/factors';
import type { Analysis } from '@/lib/model';
import { ColumnChart } from '@/components/charts/charts';
import { PercentileStrip } from '@/components/charts/diagrams';
import { GradePill, MedianCell, MedianTick, NotScored, RankBar, RatioTag } from '@/components/report/grade-parts';
import { FairValuePanel } from '@/components/report/fair-value';
import { PeerGrowthChart, PeerPeChart } from '@/components/report/factor-panels';
import { cn } from '@/lib/cn';

/* Header wording follows where the numbers actually came from, so the page
   never claims a sector percentile it did not measure. */
function sourcesOf(metrics: GradedMetric[]) {
  return new Set(metrics.filter((m) => m.state === 'ok').map((m) => m.source));
}
function gradeColumnLabel(metrics: GradedMetric[]) {
  const s = sourcesOf(metrics);
  if (s.size === 1 && s.has('peers')) return 'Peer Relative Grade';
  if (s.size === 1 && s.has('absolute')) return 'Grade';
  if (s.has('peers')) return 'Relative Grade';
  return 'Sector Relative Grade';
}
function rankColumnLabel(metrics: GradedMetric[]) {
  const s = sourcesOf(metrics);
  if (s.size === 1 && s.has('peers')) return 'Peer Ranking';
  if (s.size === 1 && s.has('absolute')) return 'Position';
  return 'Sector Ranking';
}
function medianColumnLabel(metrics: GradedMetric[]) {
  const s = sourcesOf(metrics);
  if (s.size === 1 && s.has('peers')) return 'Peer Median';
  if (s.has('peers')) return 'Median';
  return 'Sector Median';
}

/* ==========================================================================
   Trailing / forward pairs

   Several subtopics hold the same multiple twice — once on reported figures,
   once on next year's consensus. As independent rows they read as six
   findings, when they are three findings and a direction of travel.

   Pairing is presentation only: both legs are still graded separately and
   both still vote in the factor average. Keyed by the leading metric, and only
   applied when the follower is the very next metric, so a reordered tree
   degrades to one row per ratio rather than pairing the wrong two things.
   ========================================================================== */

interface PairDef {
  with: string;
  label: string;
  legs: [string, string];
  chartLabel: string;
  sep?: string;
  delta?: 'relative' | 'points' | 'none';
  deltaTone?: 'neutral';
  deltaAgainst?: string;
  /** declared, not inferred: the forward leg deliberately borrows its trailing twin's distribution */
  sharedDist?: boolean;
  fmt?: (v: number) => string;
  chart?: (a: Analysis) => React.ReactNode;
}

const RATIO_PAIRS: Record<string, PairDef> = {
  evToSalesTtm: { with: 'evToSalesFwd', label: 'EV / Sales', legs: ['TTM', 'FWD'], chartLabel: 'EV/Sales', sep: ' → ', delta: 'relative', sharedDist: true },
  evToEbitdaTtm: { with: 'evToEbitdaFwd', label: 'EV / EBITDA', legs: ['TTM', 'FWD'], chartLabel: 'EV/EBITDA', sep: ' → ', delta: 'relative', sharedDist: true },
  evToEbitTtm: { with: 'evToEbitFwd', label: 'EV / EBIT', legs: ['TTM', 'FWD'], chartLabel: 'EV/EBIT', sep: ' → ', delta: 'relative', sharedDist: true },
  peGaapTtm: { with: 'peNonGaapFwd', label: 'Price / Earnings', legs: ['GAAP TTM', 'Non-GAAP FWD'], chartLabel: 'P/E', sep: ' → ', delta: 'relative', sharedDist: true },
  pegGaap: { with: 'pegNonGaap', label: 'Price / Earnings to Growth', legs: ['GAAP TTM', 'Non-GAAP FWD'], chartLabel: 'PEG', sep: ' → ', delta: 'relative', sharedDist: true },
  priceToSalesTtm: { with: 'priceToSalesFwd', label: 'Price / Sales', legs: ['TTM', 'FWD'], chartLabel: 'P/S', sep: ' → ', delta: 'relative', sharedDist: true },
  earningsYieldTtm: { with: 'fcfYieldTtm', label: 'Yield on the price paid', legs: ['Earnings', 'Free cash flow'], chartLabel: 'Yield', sep: ' → ', delta: 'points', deltaAgainst: 'earnings' },
  // Two different quantities in the same units, so no delta.
  marginStability5y: { with: 'revenueVariability5y', label: 'Consistency (5Y)', legs: ['Net margin', 'Revenue growth'], chartLabel: 'Variability', delta: 'none' },
  debtToEquity: { with: 'netDebtToEquity', label: 'Debt / equity', legs: ['Gross', 'Net of cash'], chartLabel: 'Debt/equity', sep: ' → ', delta: 'relative', deltaAgainst: 'gross' },
  debtToEbitda: { with: 'netDebtToEbitda', label: 'Debt / EBITDA', legs: ['Gross', 'Net of cash'], chartLabel: 'Debt/EBITDA', sep: ' → ', delta: 'relative', deltaAgainst: 'gross' },
  longTermDebtToCapital: { with: 'debtToCapital', label: 'Debt / capital', legs: ['Long-term only', 'All debt'], chartLabel: 'Debt/capital', sep: ' → ', delta: 'points', deltaAgainst: 'long-term' },
  ocfToDebt: { with: 'fcfToDebt', label: 'Cash flow / debt', legs: ['Operating', 'Free'], chartLabel: 'Cash/debt', sep: ' → ', delta: 'points', deltaAgainst: 'operating' },
  revenueGrowthVsPeers: {
    with: 'revenueGrowthVsSector', label: 'Revenue growth against the field', legs: ['vs peers', 'vs sector median'],
    chartLabel: 'Growth gap', delta: 'points', deltaTone: 'neutral', deltaAgainst: 'the peer average',
    chart: (a) => <PeerGrowthChart a={a} />,
  },
  // Two answers to one question — how dear is this P/E against everything
  // else — so they share a row and the peer chart, which carries the sector
  // median as a bar of its own.
  peVsPeers: {
    with: 'peVsSector', label: 'P/E against the field', legs: ['vs peers', 'vs sector median'],
    chartLabel: 'P/E gap', delta: 'points', deltaTone: 'neutral', deltaAgainst: 'the peer average',
    chart: (a) => <PeerPeChart a={a} />,
  },
  epsGrowth: { with: 'epsDilutedGrowth', label: 'EPS growth', legs: ['Basic', 'Diluted'], chartLabel: 'EPS growth', sep: ' → ', delta: 'points' },
  ocfGrowth: { with: 'fcfGrowth', label: 'Cash flow growth', legs: ['Operating', 'Free'], chartLabel: 'Cash flow growth', sep: ' → ', delta: 'points', deltaAgainst: 'operating' },
  fwdEarningsGrowth: { with: 'fwdEpsGrowth', label: 'Forecast growth', legs: ['Earnings', 'Per share'], chartLabel: 'Forecast growth', sep: ' → ', delta: 'points', deltaAgainst: 'earnings' },
  dpsGrowth: { with: 'dividendGrowth3y', label: 'Dividend growth', legs: ['1 year', '3 year'], chartLabel: 'Dividend growth', delta: 'points', deltaAgainst: '1 year', deltaTone: 'neutral' },
  assetTurnover: { with: 'fixedAssetTurnover', label: 'Asset turnover', legs: ['All assets', 'Fixed assets'], chartLabel: 'Turnover', delta: 'none' },
  bookValuePerShare: { with: 'tangibleBookValuePerShare', label: 'Book value per share', legs: ['Reported', 'Tangible'], chartLabel: 'Book / share', sep: ' → ', delta: 'relative', deltaAgainst: 'reported' },
  excessReturn1yVsSector: { with: 'excessReturn1yVsMarket', label: 'Excess return (1Y)', legs: ['vs sector', 'vs market'], chartLabel: 'Excess return', delta: 'points', deltaAgainst: 'the sector', deltaTone: 'neutral' },
  priceToAvg50: { with: 'priceToAvg200', label: 'Price vs moving average', legs: ['50-day', '200-day'], chartLabel: 'Price vs average', delta: 'relative', deltaAgainst: 'the 50-day', deltaTone: 'neutral' },
};

/** A ratio listed here owns its whole table cell instead of filling four columns. */
const METRIC_PANELS: Record<string, (a: Analysis, m: GradedMetric) => React.ReactNode> = {
  dcfDiscount: (a, m) => <FairValuePanel a={a} m={m} />,
};

const fmtOf = (m: GradedMetric, fallback?: (v: number) => string) => fallback || m.fmt || ((v: number) => dec(v, 2));

const td = 'px-3 align-top';
const whyText = 'max-w-[74ch] text-tiny leading-relaxed text-muted-foreground';

/* One leg of a pair: its own tick, value (with the move against the first
   leg), median, rank and grade. A multiple moving from 36.5x to 36.2x has
   fallen 0.8% — a proportion; a growth rate moving from 8% to 16% has risen
   eight points. Ratios take the proportion, rates take the difference, and the
   colour follows the metric's own `better`. */
function PairLegCells({ m, pair, legLabel, twin }: { m: GradedMetric; pair: PairDef; legLabel: string; twin: GradedMetric | null }) {
  const fmt = fmtOf(m, pair.fmt);
  let delta: React.ReactNode = null;
  const mode = pair.delta || 'relative';
  if (twin && mode !== 'none' && isNum(m.value) && isNum(twin.value)) {
    let change: number | null = null;
    let text: string | null = null;
    if (mode === 'points') {
      change = m.value - twin.value;
      text = `${change > 0 ? '+' : ''}${dec(change * 100, 1)} pts`;
    } else if (twin.value !== 0) {
      change = m.value / twin.value - 1;
      text = `${change > 0 ? '+' : ''}${pct(change)}`;
    }
    if (isNum(change)) {
      const good = m.better === 'low' ? change < 0 : change > 0;
      delta = (
        <span className={cn('mt-0.5 block text-micro font-medium',
          pair.deltaTone === 'neutral' ? 'text-muted-foreground' : good ? 'text-up' : 'text-down')}>
          {text} vs {pair.deltaAgainst || pair.legs[0]}
        </span>
      );
    }
  }
  return (
    <>
      <td className={cn(td, 'text-right font-semibold tnum')}>
        <div className="mb-px flex items-center justify-end gap-[5px] max-sm:flex-wrap">
          <MedianTick m={m} />
          <span className="whitespace-nowrap text-micro font-normal uppercase tracking-[.04em] text-muted-foreground">{legLabel}</span>
        </div>
        <span>{isNum(m.value) ? fmt(m.value) : 'n/a'}</span>
        {delta}
      </td>
      <td className={cn(td, 'whitespace-nowrap text-right text-muted-foreground tnum')}><MedianCell m={m} fmt={fmt} /></td>
      <td className={td}>{m.ungraded ? null : <RankBar m={m} />}</td>
      <td className={cn(td, 'text-right')}>{m.ungraded ? <NotScored /> : <GradePill score={m.grade} letter={m.letter} />}</td>
    </>
  );
}

/**
 * One measure, two views, against the sector. Each leg brings its own median:
 * a trailing/forward pair genuinely shares a distribution, but a pair like
 * "excess return vs sector / vs market" is two, and one median line across
 * both would invent a comparison. The note appears only where the yardstick
 * really is shared.
 */
function PairChart({ a, lead, follow, pair }: { a: Analysis; lead: GradedMetric; follow: GradedMetric; pair: PairDef }) {
  if (!isNum(lead.value) && !isNum(follow.value)) return null;
  const valueFmt = pair.fmt || lead.fmt || follow.fmt || ((v: number) => dec(v, 2));
  return (
    <div>
      <ColumnChart height={240} valueFmt={valueFmt} categories={pair.legs.map((leg) => `${pair.chartLabel} · ${leg}`)} series={[
        { name: a.facts.symbol, color: 'var(--primary)', values: [lead.value ?? null, follow.value ?? null] },
        { name: `${a.facts.sector || 'Sector'} median`, color: 'var(--chart-1)', values: [lead.median ?? null, follow.median ?? null] },
      ]} />
      {pair.sharedDist ? (
        <p className="mt-2 text-tiny text-muted-foreground/80">
          Both are ranked against the trailing {pair.chartLabel} distribution — the same yardstick, which is why the median does not
          move between them.
        </p>
      ) : null}
    </div>
  );
}

function PairRows({ a, lead, follow, pair }: { a: Analysis; lead: GradedMetric; follow: GradedMetric; pair: PairDef }) {
  const chart = pair.chart ? pair.chart(a) : <PairChart a={a} lead={lead} follow={follow} pair={pair} />;
  const whys = [lead, follow].filter((m) => m.explanation);
  return (
    <>
      <tr className="group/pair hover:bg-accent/60 [&+tr]:hover:bg-accent/60">
        {/* `rowspan`, so the name genuinely spans its two legs and the table
            keeps its columns for every other ratio in the subtopic. */}
        <td rowSpan={2} className={cn(td, 'pt-3')}>
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{pair.label}</span>
            <span className="text-micro text-muted-foreground/70">{pair.legs.join(pair.sep || ' · ')}</span>
          </div>
        </td>
        <PairLegCells m={lead} pair={pair} legLabel={pair.legs[0]} twin={null} />
      </tr>
      <tr className="border-b border-border">
        <PairLegCells m={follow} pair={pair} legLabel={pair.legs[1]} twin={lead} />
      </tr>
      {whys.length ? (
        <tr className="border-b border-border">
          <td colSpan={5} className="px-3 pb-3 pt-2">
            {whys.map((m, i) => (
              // Each sentence carries its own leg's tick, tying the second one
              // back to the forward row it belongs to.
              <p key={m.id} className={cn(whyText, 'flex items-start gap-2', i > 0 && 'mt-1.5 text-muted-foreground/80')}>
                <MedianTick m={m} className="mt-[3px]" />
                <span>{m.explanation}</span>
              </p>
            ))}
          </td>
        </tr>
      ) : null}
      {chart ? (
        <tr className="border-b border-border">
          <td colSpan={5} className="px-3 py-4">{chart}</td>
        </tr>
      ) : null}
    </>
  );
}

export function GradeTable({ a, metrics }: { a: Analysis; metrics: GradedMetric[] }) {
  const sym = a.facts.symbol;
  const rows: React.ReactNode[] = [];

  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    const pair = RATIO_PAIRS[m.id];
    const follow = pair && metrics[i + 1];
    if (pair && follow && follow.id === pair.with) {
      rows.push(<PairRows key={m.id} a={a} lead={m} follow={follow} pair={pair} />);
      i++;
      continue;
    }

    // A ratio with its own panel takes the whole cell: its chart already
    // states the figure and which side of fair value it falls.
    const panel = METRIC_PANELS[m.id]?.(a, m);
    if (panel) {
      rows.push(
        <tr key={m.id} className="border-b border-border">
          {/* Sticky to the table's left edge, so a wide table does not slide the
              panel out of view as it scrolls sideways. */}
          <td colSpan={5} className="px-3 pb-4 pt-3">
            <div className="sticky left-0 max-w-[calc(100cqi-24px)]">{panel}</div>
          </td>
        </tr>,
      );
      continue;
    }

    const fmt = fmtOf(m);
    rows.push(
      <React.Fragment key={m.id}>
        <tr className={cn('hover:bg-accent/60 [&:hover+tr]:bg-accent/60', m.state !== 'ok' && 'opacity-55')}>
          <td className={cn(td, 'pt-3')}>
            <div className="flex items-center gap-2">
              <MedianTick m={m} />
              <span>{m.label}</span>
              <RatioTag tag={(m as any).tag} />
            </div>
          </td>
          <td className={cn(td, 'pt-3 text-right font-semibold tnum')}>{isNum(m.value) ? fmt(m.value) : 'n/a'}</td>
          <td className={cn(td, 'whitespace-nowrap pt-3 text-right text-muted-foreground tnum')}><MedianCell m={m} fmt={fmt} /></td>
          <td className={cn(td, 'pt-3')}>{m.ungraded ? null : <RankBar m={m} />}</td>
          <td className={cn(td, 'pt-3 text-right')}>{m.ungraded ? <NotScored /> : <GradePill score={m.grade} letter={m.letter} />}</td>
        </tr>
        <tr className="border-b border-border">
          <td colSpan={5} className="px-3 pb-3 pt-1">
            {m.explanation ? <p className={whyText}>{m.explanation}</p> : null}
          </td>
        </tr>
      </React.Fragment>,
    );
  }

  return (
    <div className="overflow-x-auto [container-type:inline-size] scroll-thin">
      <table className="min-w-[700px] text-13">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
            <th className="border-b border-border px-3 py-2 text-left font-semibold">Ratio</th>
            <th className="border-b border-border px-3 py-2 text-right font-semibold">{sym}</th>
            <th className="border-b border-border px-3 py-2 text-right font-semibold">{medianColumnLabel(metrics)}</th>
            <th className="border-b border-border px-3 py-2 text-left font-semibold">{rankColumnLabel(metrics)}</th>
            <th className="border-b border-border px-3 py-2 text-right font-semibold">{gradeColumnLabel(metrics)}</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

/* ==========================================================================
   Subtopic summary — how the subtopic reads as a whole, in one line and one
   axis, and which ratio is the outlier worth arguing with.

   `vsMedian` 'fail' already accounts for metrics where low is good, which is
   what lets one summary serve valuation and profitability alike.
   ========================================================================== */

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n: number) => WORDS[n] ?? String(n);

export function SubtopicSummary({ a, metrics }: { a: Analysis; metrics: GradedMetric[] }) {
  const live = metrics.filter((m) => isNum(m.pctile) && isNum(m.grade));
  if (live.length < 4) return null;
  const rows = live.map((m) => ({
    label: m.label,
    pctile: m.pctile,
    valueText: isNum(m.value) ? fmtOf(m)(m.value) : undefined,
    rankText: m.rank?.text || undefined,
  }));
  const sorted = [...rows].sort((x, y) => (x.pctile as number) - (y.pctile as number));
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  const worse = live.filter((m) => m.vsMedian === 'fail').length;
  const where = a.facts.sector || 'sector';

  const headline = worse === live.length
    ? `All ${word(live.length)} rank worse than the ${where} median.`
    : worse === 0
      ? `All ${word(live.length)} rank better than the ${where} median.`
      : `${word(worse).replace(/^./, (ch) => ch.toUpperCase())} of the ${word(live.length)} ${worse === 1 ? 'ranks' : 'rank'} worse than the ${where} median.`;
  // Where every ratio lands in the same bucket the extremes carry the same
  // label, and naming both would read as a contradiction.
  const spread = strongest.rankText && strongest.rankText === weakest.rankText
    ? ` Every one of them lands at ${strongest.rankText}.`
    : ` Strongest is ${strongest.label}${strongest.rankText ? ` at ${strongest.rankText}` : ''}; weakest is ${weakest.label}${weakest.rankText ? ` at ${weakest.rankText}` : ''}.`;

  return (
    <div className="mb-4 border-b border-border pb-3">
      <p className="mb-1 max-w-[84ch] text-13 text-muted-foreground">{headline + spread}</p>
      <PercentileStrip rows={rows} />
    </div>
  );
}
