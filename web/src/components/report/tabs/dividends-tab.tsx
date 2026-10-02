'use client';

/* ==========================================================================
   Maz Vantage — the Dividends tab

   Four questions, in the order they matter:

     1. What does it pay?          yield, per share, against the market
     2. Is it covered?             out of profit, and out of cash
     3. Has it held up?            history by year, cuts, growth
     4. When is the next one?      the payment record

   Two conventions worth knowing:

   - **History is aggregated by calendar year**, and the current year is
     dropped until it is complete. A company three quarters through its year
     would otherwise appear to have cut its dividend by a quarter.
   - **Cover is asked twice.** The payout ratio measures the dividend against
     reported profit; the cash payout ratio against free cash flow. The second
     is the one that matters — profit is an opinion and the dividend is paid in
     cash — and the two are shown side by side rather than collapsed.
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, fmtDate, isNum, money, mult, num, pct, price, signClass, trim, yearOf, yoy } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { ColumnChart, LineChart, MultiLineChart } from '@/components/charts/charts';
import { Gauge } from '@/components/charts/diagrams';
import {
  CmpBars, DataTable, FeedGate, Limits, Notice, OCard, OHead, OMore, PerfCagr, PerfPill, StatLine, StatLines,
} from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { DividendScoresPanel } from '@/components/report/dividend-grades';
import { Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';

type Span = 4 | 8 | 12;
const Fallback = ({ a, feed, what, children }: { a: Analysis; feed?: string; what?: string; children: React.ReactNode }) =>
  feed && a.ds.status(feed) !== 'ok' ? <FeedGate a={a} feed={feed} what={what!} /> : <Notice>{children}</Notice>;

function Empty({ id, span, title, children, feed, what, a }: {
  id: string; span: Span; title: string; children: React.ReactNode; feed?: string; what?: string; a: Analysis;
}) {
  return (
    <OCard span={span} id={id}>
      <OHead title={title} />
      <Fallback a={a} feed={feed} what={what}>{children}</Fallback>
    </OCard>
  );
}

const Tiny = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-tiny text-muted-foreground/80">{children}</p>;

/** The two figures that summarise a run of years. */
function RunBadges<T>({ rows, get }: { rows: T[]; get: (r: T) => unknown }) {
  const vals = rows.map(get).map((v) => (isNum(v) ? v : null));
  const from = vals.findIndex(isNum);
  if (from < 0) return null;
  const to = vals.length - 1 - [...vals].reverse().findIndex(isNum);
  if (to <= from) return null;
  return <PerfCagr first={vals[from]} last={vals[to]} years={to - from} />;
}

/** High / median / low, for a series read against its own history. */
function RangeBadges({ stat, fmt = (v: number) => pct(v, { dp: 2 }) }: { stat: any; fmt?: (v: number) => string }) {
  if (!stat) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <PerfPill label="High" tone="up" value={isNum(stat.high) ? fmt(stat.high) : 'n/a'} />
      <PerfPill label="Median" tone="mid" value={isNum(stat.median) ? fmt(stat.median) : 'n/a'} />
      <PerfPill label="Low" tone="down" value={isNum(stat.low) ? fmt(stat.low) : 'n/a'} />
    </div>
  );
}

const cagrOver = (byYear: any[], n: number) => {
  if (byYear.length <= n) return null;
  const from = byYear.at(-1 - n);
  const to = byYear.at(-1);
  return from?.amount > 0 && to?.amount > 0 ? (to.amount / from.amount) ** (1 / n) - 1 : null;
};

/* ---------- 0. the reference card ------------------------------------------- */

/*
  Everything a reader checks before anything else: yield, cover, how long the
  run of increases is, how fast it has grown, and when the next cheque lands.
*/
function KeyMetricsCard({ a }: { a: Analysis }) {
  const f = a.facts;
  const d = a.dividends || {};
  const cur = curSymbol(f.currency);
  const byYear: any[] = d.byYear || [];

  // A flat year breaks the run: "years of increases" means what it says.
  let streak = 0;
  for (let i = byYear.length - 1; i > 0; i -= 1) {
    if (isNum(byYear[i].amount) && isNum(byYear[i - 1].amount) && byYear[i].amount > byYear[i - 1].amount) streak += 1;
    else break;
  }
  const g5 = cagrOver(byYear, 5);
  const g10 = cagrOver(byYear, 10);

  const dated = (d.rows || []).map((r: any) => ({ ...r, at: new Date(r.date).getTime() }))
    .filter((r: any) => Number.isFinite(r.at)).sort((x: any, y: any) => y.at - x.at);
  const now = Date.now();
  const past = dated.find((r: any) => r.at <= now) || null;
  const next = [...dated].reverse().find((r: any) => r.at > now) || null;
  const frequency = past?.frequency || dated[0]?.frequency || null;
  const money2 = (v: unknown) => (isNum(v) ? `${cur}${trim(v, 4)}` : 'n/a');

  return (
    <OCard span={4} id="dv-key">
      <OHead title="Key figures" info="The reference set. Growth rates are compounded over complete calendar years of declared payments, which is a different basis from the trailing-twelve yield above it." />
      <StatLines>
        <StatLine label="Yield, trailing twelve months" value={pct(f.dividendYield, { dp: 2 })} />
        <StatLine label="Payout ratio" value={pct(f.payoutRatio)} note="of earnings" />
        <StatLine label="Cash payout ratio" value={pct(f.cashPayoutRatio)} note="of free cash flow" />
        <StatLine label="Consecutive years of increase" value={streak ? `${streak} year${streak === 1 ? '' : 's'}` : 'none'} tone={streak >= 5 ? 'pos' : ''}
          title="Counted back from the last complete calendar year. A year the company held the dividend flat ends the run — it did not cut, but it did not increase either." />
        <StatLine label="Growth, 5-year" value={isNum(g5) ? pct(g5, { sign: true }) : 'n/a'} note="annualised" tone={signClass(g5)} />
        <StatLine label="Growth, 10-year" value={isNum(g10) ? pct(g10, { sign: true }) : 'n/a'} note="annualised" tone={signClass(g10)} />
        <StatLine label="Frequency" value={frequency || 'n/a'} />
        <StatLine label="Last payment" value={past ? `${fmtDate(past.date)} · ${money2(past.dividend ?? past.adjDividend)}` : 'n/a'} note="ex-dividend date" />
        <StatLine label="Next declared" value={next ? `${fmtDate(next.date)} · ${money2(next.dividend ?? next.adjDividend)}` : 'none declared'}
          note={next ? 'ex-dividend date' : 'nothing on the feed yet'} />
      </StatLines>
    </OCard>
  );
}

/* ---------- 1. what it pays -------------------------------------------------- */

function HeadlineCard({ a }: { a: Analysis }) {
  const f = a.facts;
  const d = a.dividends || {};
  const cur = curSymbol(f.currency);
  const stability = !isNum(d.worstDrop) ? { text: 'not enough history', tone: '' as const }
    : d.worstDrop >= 0 ? { text: 'never cut', tone: 'pos' as const }
      : d.stable ? { text: `deepest cut ${pct(Math.abs(d.worstDrop))}`, tone: '' as const }
        : { text: `cut ${pct(Math.abs(d.worstDrop))} in a year`, tone: 'neg' as const };

  return (
    <OCard span={8} id="dv-headline">
      <OHead title={`${f.name} dividend`} info="Yield and per-share figures are trailing twelve months. Growth and stability are measured over the complete calendar years on record." />
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-4xl font-bold leading-none tracking-[-.02em] tnum">{isNum(f.dividendYield) ? pct(f.dividendYield, { dp: 2 }) : '—'}</b>
        <i className="text-sm not-italic text-muted-foreground">yield</i>
        <span className="ml-auto text-tiny text-muted-foreground/80">
          {isNum(f.dividendPerShare) ? `${price(f.dividendPerShare, cur)} per share over the last twelve months` : 'no trailing dividend per share'}
        </span>
      </div>
      <StatLines split className="mt-4">
        <StatLine label="Payout ratio" value={pct(f.payoutRatio, { dp: 0 })} note="of earnings" />
        <StatLine label="Cash payout ratio" value={pct(f.cashPayoutRatio, { dp: 0 })} note="of free cash flow" />
        <StatLine label="Dividend growth" value={isNum(d.growth) ? pct(d.growth, { sign: true }) : 'n/a'} note={d.years ? `annualised over ${d.years} years` : ''} />
        <StatLine label="Years on record" value={d.years ? String(d.years) : 'n/a'} note="complete calendar years" />
        <StatLine label="Stability" value={stability.text} tone={stability.tone} />
      </StatLines>
    </OCard>
  );
}

/* ---------- 2. against the market ------------------------------------------- */

/*
  Against the quartile bars from Settings, not the sector: the sector
  distribution covers every company in it, most of which pay nothing, so a
  percentile against it would mostly count non-payers.
*/
function yieldNote(a: Analysis) {
  const f = a.facts;
  const y = f.dividendYield;
  if (!isNum(y) || y <= 0) return `${f.symbol} pays no dividend, so there is no yield to rank.`;
  if (y >= a.bm.dividendTopTier) {
    return `At ${pct(y, { dp: 2 })} the yield sits in the top quartile of payers. A high yield is as often a fallen share price as a generous board — the cover figures beside this say which.`;
  }
  if (y >= a.bm.dividendNotable) {
    return `At ${pct(y, { dp: 2 })} the yield is in the middle of the range for payers — enough to count as income, not enough to be the reason for holding it.`;
  }
  return `At ${pct(y, { dp: 2 })} the yield is below the bottom quartile of payers. The dividend is a token rather than a source of income, which is usually a choice to retain cash or to return it through buybacks instead.`;
}

function YieldCard({ a }: { a: Analysis }) {
  const f = a.facts;
  return (
    <OCard span={4} id="dv-yield">
      <OHead title="Against other payers" info="The quartile marks are among dividend-paying companies, not all listed companies — a percentile against everything would mostly be counting non-payers. Both marks are editable in Settings." />
      <CmpBars fmt={(v) => pct(v, { dp: 2 })} rows={[
        { label: 'Bottom quartile of payers', value: a.bm.dividendNotable },
        { label: 'Top quartile of payers', value: a.bm.dividendTopTier },
        { label: f.symbol, value: f.dividendYield, self: true },
      ]} />
      <p className="mt-6 text-13 leading-relaxed text-muted-foreground">{yieldNote(a)}</p>
    </OCard>
  );
}

/* ---------- 3. is it covered? ----------------------------------------------- */

function coverNote(a: Analysis) {
  const f = a.facts;
  if (!isNum(f.dividendYield) || f.dividendYield <= 0) return `${f.symbol} pays no dividend, so there is nothing to cover.`;
  if (!isNum(f.payoutRatio)) return 'The payout ratio needs both a dividend and trailing earnings.';
  if (f.payoutRatio < 0) return `${f.symbol} is paying a dividend out of losses, which cannot continue indefinitely.`;
  return f.payoutRatio <= a.bm.payoutCeiling
    ? `At ${pct(f.payoutRatio, { dp: 0 })} of earnings the dividend is comfortably covered, leaving ${pct(1 - f.payoutRatio, { dp: 0 })} of profit retained in the business.`
    : `At ${pct(f.payoutRatio, { dp: 0 })} of earnings the dividend is not covered by profit — it is being funded from reserves, borrowing or asset sales.`;
}

function cashNote(a: Analysis) {
  const f = a.facts;
  if (!isNum(f.dividendYield) || f.dividendYield <= 0) return `${f.symbol} pays no dividend.`;
  if (!isNum(f.cashPayoutRatio)) return 'A cash payout ratio needs free cash flow per share, which is not available.';
  return f.cashPayoutRatio <= a.bm.payoutCeiling
    ? `Free cash flow covers the payout ${mult(1 / f.cashPayoutRatio)} over — the test that matters more than the profit one, because the dividend is paid in cash.`
    : `The payout is ${pct(f.cashPayoutRatio, { dp: 0 })} of free cash flow, so the cash going out exceeds the cash coming in. That is funded from the balance sheet, and it is the earlier warning of the two.`;
}

/*
  One gauge, one sentence. The bands are fixed rather than sector-relative and
  stop at 120%: past that the needle pins and the exact figure stops mattering.
*/
const COVER_BANDS = [
  { from: 0, to: 0.6, color: 'var(--up)' },
  { from: 0.6, to: 0.9, color: 'var(--grade-mid)' },
  { from: 0.9, to: 1.2, color: 'var(--down)' },
];

function CoverCard({ id, title, value, label, info, note }: { id: string; title: string; value: unknown; label: string; info: string; note: string }) {
  return (
    <OCard span={4} id={`dv-${id}`}>
      <OHead title={title} info={info} />
      <div className="grid justify-items-center gap-3">
        <Gauge value={isNum(value) ? value : null} min={0} max={1.2} label={label} bands={COVER_BANDS} />
        <p className="text-13 leading-relaxed text-muted-foreground">{note}</p>
      </div>
    </OCard>
  );
}

/* ---------- the dividend, over time ----------------------------------------- */

function PerShareCard({ a }: { a: Analysis }) {
  const byYear: any[] = a.dividends?.byYear || [];
  const cur = curSymbol(a.facts.currency);
  if (byYear.length < 2) return <Empty a={a} id="dv-dps" span={8} title="Dividend per share">At least two complete calendar years of payments are needed to draw a history.</Empty>;
  return (
    <OCard span={8} id="dv-dps">
      <OHead title="Dividend per share" info="Declared payments summed by calendar year, not by fiscal year — a dividend is paid on a date rather than in a reporting period. The current year is excluded until it is complete, so a part-year does not read as a cut." />
      <ColumnChart height={260} legend={false} valueFmt={(v) => `${cur}${trim(v, 4)}`} categories={byYear.map((r) => String(r.year))}
        series={[{ name: 'Dividend per share', color: 'var(--chart-2)', values: byYear.map((r) => r.amount) }]} />
      <RunBadges rows={byYear} get={(r) => r.amount} />
    </OCard>
  );
}

/*
  Today's yield is only a number; against this company's own range it is an
  answer. Recomputed at every close — no vendor publishes one — so the steps
  are quarters entering and leaving the window and the slopes are the price.
*/
function YieldHistoryCard({ a }: { a: Analysis }) {
  const h = a.yieldHistory || { available: false };
  if (!h.available) return <Empty a={a} id="dv-yield-history" span={8} title="Yield over time" feed="prices" what="The price history">Not enough overlapping price and dividend history to recompute a yield.</Empty>;
  return (
    <OCard span={8} id="dv-yield-history">
      <OHead title="Yield over time" info="The trailing twelve months of declared dividends over the closing price of each day. Where the line sits against its own median is the question a single current yield cannot answer." />
      <LineChart series={h.points} height={260} color="var(--chart-1)" valueFmt={(v) => pct(v, { dp: 2 })}
        refLine={{ value: h.median, label: `Median ${pct(h.median, { dp: 2 })}` }} empty="Not enough history to draw a yield." />
      <RangeBadges stat={h} />
      <Tiny>{h.span}. The window is however much price history is loaded, up to six years.</Tiny>
    </OCard>
  );
}

function PayoutHistoryCard({ a }: { a: Analysis }) {
  const rows = (a.series?.rows || []).filter((r: any) => isNum(r.dividends) && r.dividends > 0);
  const byYear = new Map<any, any>((a.shareholder?.rows || []).map((r: any) => [r.year, r]));
  if (rows.length < 2) return <Empty a={a} id="dv-payout-history" span={8} title="Cover over time">At least two filed years with a dividend are needed to draw a cover history.</Empty>;
  const line = (name: string, color: string, get: (r: any) => number | null | undefined) => ({
    name, color, points: rows.map((r: any) => ({ date: r.date, value: get(byYear.get(r.year) || {}) })),
  });
  const lastYear = rows.at(-1).year;
  const last = byYear.get(lastYear) || {};
  return (
    <OCard span={8} id="dv-payout-history">
      <OHead title="Cover over time" info="The dividend against the profit it is declared out of and the free cash flow it is actually paid out of. The gap between the two lines is the difference between an accounting result and money." />
      <MultiLineChart height={260} valueFmt={(v) => pct(v, { dp: 0 })} series={[
        line('Of earnings', 'var(--chart-1)', (r) => r.dividendEarningsPayout),
        line('Of free cash flow', 'var(--chart-4)', (r) => r.dividendFcfPayout),
      ]} />
      <StatLines split>
        <StatLine label="Paid out of earnings" value={pct(last.dividendEarningsPayout)} note={`FY${lastYear}`} />
        <StatLine label="Paid out of free cash flow" value={pct(last.dividendFcfPayout)} note={`FY${lastYear}`} />
      </StatLines>
    </OCard>
  );
}

function GrowthCard({ a }: { a: Analysis }) {
  const byYear: any[] = a.dividends?.byYear || [];
  if (byYear.length < 3) return <Empty a={a} id="dv-growth" span={8} title="Growth in the payment">At least three complete calendar years are needed to draw a growth history.</Empty>;
  const steps = byYear.slice(1).map((r, i) => ({ year: r.year, change: yoy(r.amount, byYear[i].amount) }));
  const cuts = steps.filter((r) => isNum(r.change) && r.change < 0).length;
  const held = steps.filter((r) => isNum(r.change) && r.change === 0).length;
  return (
    <OCard span={8} id="dv-growth">
      <OHead title="Growth in the payment" info="Each complete calendar year against the one before it. A year at zero is a dividend held rather than raised, which is not a cut and is not a rise either." />
      <ColumnChart height={260} legend={false} valueFmt={(v) => pct(v, { sign: true, dp: 0 })} categories={steps.map((r) => String(r.year))}
        series={[{
          name: 'Change on the year', color: 'var(--up)',
          // A cut is drawn in the colour a cut deserves, one bar at a time.
          colors: steps.map((r) => (isNum(r.change) && r.change < 0 ? 'var(--down)' : 'var(--up)')),
          values: steps.map((r) => r.change),
        }]} />
      <StatLines split>
        <StatLine label="Years raised" value={String(steps.length - cuts - held)} note={`of ${steps.length}`} />
        <StatLine label="Years held flat" value={String(held)} />
        <StatLine label="Years cut" value={String(cuts)} tone={cuts ? 'neg' : 'pos'} />
      </StatLines>
    </OCard>
  );
}

/* ---------- what it becomes -------------------------------------------------- */

/*
  A projection, and plainly labelled as one: one growth rate compounded for ten
  years. Arithmetic, not a forecast. The rate is editable because the value of
  the card is watching the answer move when you disagree with it.
*/
const YEARS = 10;

function ProjectionCard({ a }: { a: Analysis }) {
  const f = a.facts;
  const d = a.dividends || {};
  const byYear: any[] = d.byYear || [];
  const cur = curSymbol(f.currency);
  const suggested = cagrOver(byYear, 10) ?? cagrOver(byYear, 5) ?? d.growth ?? null;
  // Clamped hard: a 40% rate compounded for ten years is a 29-fold income,
  // which is arithmetic the chart would draw and nobody should plan on.
  const opening = isNum(suggested) ? Math.min(Math.max(suggested, -0.1), 0.25) : 0;
  const [amount, setAmount] = React.useState(10000);
  const [growthPct, setGrowthPct] = React.useState(String(Math.round(opening * 1000) / 10));

  if (!isNum(f.dividendYield) || f.dividendYield <= 0 || !isNum(suggested)) {
    return <Empty a={a} id="dv-projection" span={8} title="What it compounds to">A current yield and a growth history are both needed to project an income.</Empty>;
  }
  const growth = (Number(growthPct) || 0) / 100;
  const thisYear = new Date().getUTCFullYear();
  const labels: string[] = [];
  const income: number[] = [];
  const onCost: (number | null)[] = [];
  let dividend = amount * f.dividendYield;
  for (let i = 0; i < YEARS; i += 1) {
    labels.push(String(thisYear + i));
    income.push(dividend);
    onCost.push(amount > 0 ? dividend / amount : null);
    dividend *= 1 + growth;
  }

  return (
    <OCard span={8} id="dv-projection">
      <OHead title="What it compounds to" info="One growth rate compounded for ten years. This is arithmetic and not a forecast: no company raises a dividend at a constant rate for a decade, and nothing here models a cut, a recession or a rerating. Change the rate and watch it move." />
      <div className="mb-4 flex flex-wrap gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="dv-amount" className="text-micro text-muted-foreground">Invested ({f.currency || 'currency'})</Label>
          <Input id="dv-amount" type="number" min={100} step={1000} value={amount} className="h-9 w-36 tnum"
            onChange={(e) => setAmount(Math.max(Number(e.target.value) || 0, 0))} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dv-growth" className="text-micro text-muted-foreground">Annual growth %</Label>
          <Input id="dv-growth" type="number" min={-20} max={40} step={0.5} value={growthPct} className="h-9 w-28 tnum"
            onChange={(e) => setGrowthPct(e.target.value)} />
        </div>
      </div>
      <ColumnChart height={260} legend={false} valueFmt={(v) => `${cur}${num(v, 0)}`} categories={labels}
        series={[{ name: 'Annual income', color: 'var(--chart-2)', values: income }]} />
      <StatLines split>
        <StatLine label={`Income in ${labels[0]}`} value={`${cur}${num(income[0], 0)}`} note="at today’s yield" />
        <StatLine label={`Income in ${labels.at(-1)}`} value={`${cur}${num(income.at(-1), 0)}`} note={`after ${YEARS} years at ${pct(growth, { sign: true })}`} />
        <StatLine label="Yield on cost by then" value={pct(onCost.at(-1), { dp: 2 })}
          title="The projected payment over what was originally paid for the shares — not over what they are worth by then, which nobody can know." />
      </StatLines>
      <Tiny>
        Opens on {pct(opening, { sign: true })}, this company’s own compound growth over the longest run of complete years on record,
        capped at 25% — a rate above that is a young dividend rather than a sustainable one.
      </Tiny>
    </OCard>
  );
}

/* ---------- 4. has it held up? ----------------------------------------------- */

/*
  Dividends per share by year, with the buyback leg beside it: the dividend
  alone understates what a company returns. Both bars below are per fiscal
  year off the cash flow statement, so they compare with each other even
  though the history above is by calendar year.
*/
function HistoryCard({ a }: { a: Analysis }) {
  const d = a.dividends || {};
  const cur = curSymbol(a.facts.currency);
  const cash: any[] = a.facts.statements.cash || [];
  const abs = (v: unknown) => (isNum(v) ? Math.abs(v) : null);
  return (
    <OCard span={12} id="dv-history">
      <OHead title="Payment history" info="Per share by calendar year — the current, incomplete year is excluded so a part-year does not read as a cut." />
      {d.available && d.byYear.length > 1 ? (
        // Two decimals flat: `price()` switches to four below a dollar, which
        // puts "US$0.5000" on the same axis as "US$1.00".
        <ColumnChart height={250} legend={false} valueFmt={(v) => `${cur}${dec(v, 2)}`} categories={d.byYear.map((r: any) => String(r.year))}
          series={[{ name: 'Dividend per share', color: 'var(--primary)', values: d.byYear.map((r: any) => r.amount) }]} />
      ) : <Fallback a={a} feed="dividends" what="Dividend history">At least two complete years of payments are needed to chart a history.</Fallback>}
      {cash.length >= 2 ? (
        <div>
          <OSub>The whole of what was returned</OSub>
          <ColumnChart height={250} valueFmt={(v) => money(v, { currency: cur })} categories={cash.map((r) => String(yearOf(r.date)))} series={[
            { name: 'Dividends', color: 'var(--chart-3)', values: cash.map((r) => abs(r.commonDividendsPaid ?? r.netDividendsPaid)) },
            { name: 'Buybacks', color: 'var(--chart-5)', values: cash.map((r) => abs(r.commonStockRepurchased)) },
          ]} />
          <p className="mt-2 text-tiny text-muted-foreground/80">
            Both legs by fiscal year, from the cash flow statement, with their filed minus signs removed. A company can return far more
            through buybacks than through its dividend, and the yield alone would never show it.
          </p>
        </div>
      ) : null}
    </OCard>
  );
}

/* ---------- 5. the payment record -------------------------------------------- */

/*
  The individual payments, newest first. Twenty rows is about two years for a
  quarterly payer and five for an annual one. Columns are chosen from what the
  rows carry: a record date equal to the ex-date in every row is what a
  trimmed feed looks like, not a schedule, so it comes out.
*/
function RecordCard({ a }: { a: Analysis }) {
  const d = a.dividends || {};
  const cur = curSymbol(a.facts.currency);
  const rows: any[] = [...(d.rows || [])].filter((r) => r && r.date)
    .sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime()).slice(0, 20);
  if (!rows.length) return <Empty a={a} id="dv-record" span={12} title="Payment record" feed="dividends" what="Dividend payments">No individual dividend payments are on record.</Empty>;

  const has = (get: (r: any) => unknown) => rows.some((r) => get(r));
  const differs = (get: (r: any) => unknown) => rows.some((r) => get(r) && get(r) !== r.date);
  const cols = [
    { label: 'Ex-dividend date', get: (r: any) => fmtDate(r.date) },
    has((r) => r.declarationDate) && differs((r) => r.declarationDate) ? { label: 'Declared', get: (r: any) => (r.declarationDate ? fmtDate(r.declarationDate) : '—') } : null,
    has((r) => r.recordDate) && differs((r) => r.recordDate) ? { label: 'Record date', get: (r: any) => (r.recordDate ? fmtDate(r.recordDate) : '—') } : null,
    has((r) => r.paymentDate) ? { label: 'Payment date', get: (r: any) => (r.paymentDate ? fmtDate(r.paymentDate) : '—') } : null,
    { label: 'Amount', num: true, get: (r: any) => (isNum(r.adjDividend ?? r.dividend) ? price(r.adjDividend ?? r.dividend, cur) : 'n/a') },
    has((r) => r.frequency) ? { label: 'Frequency', get: (r: any) => r.frequency || '—' } : null,
  ].filter(Boolean) as { label: string; num?: boolean; get: (r: any) => string }[];

  return (
    <OCard span={12} id="dv-record">
      <OHead title="Payment record" info="The last 20 payments. Amounts are adjusted for splits where an adjusted figure is published, so a historic payment is comparable to a recent one." />
      <DataTable headers={cols.map((c) => ({ label: c.label, num: c.num }))} rows={rows.map((r) => cols.map((c) => c.get(r)))} />
      <Tiny>
        {rows.length} of {d.rows.length} payments on record. Declaration, record and payment dates are shown only where the feed returns them as distinct dates.
      </Tiny>
    </OCard>
  );
}

/* ---------- 6. the basis ------------------------------------------------------ */

function BasisCard({ a }: { a: Analysis }) {
  const nav = useNav();
  const f = a.facts;
  const d = a.dividends || {};
  return (
    <OCard span={12} id="dv-basis">
      <OHead title="About these figures" />
      <StatLines>
        <StatLine label="Yield basis" value="Trailing twelve months" note="not forward" />
        <StatLine label="History basis" value="Complete calendar years" note={d.byYear?.length ? `${d.byYear[0].year}–${d.byYear.at(-1).year}` : 'none on record'} />
        <StatLine label="Payments on record" value={d.rows?.length ? String(d.rows.length) : 'none'} />
        <StatLine label="Reporting currency" value={f.currency || 'n/a'} />
      </StatLines>
      <OSub>What these figures do not say</OSub>
      <Limits items={[
        'The yield is trailing, not forward. A board that has announced an increase, or a cut, will not show it here until the payments land.',
        'History is aggregated by calendar year while the cover ratios are trailing twelve months and the buyback bars are fiscal years. Three periods, because that is what each source carries — they will not tie exactly.',
        'A special or one-off dividend is counted the same as a regular one, so a year holding one shows as growth followed by a cut.',
        'Nothing on this tab is a forecast. The consensus dividend, where analysts publish one, is not part of the estimates feed this report fetches.',
      ]} />
      {nav.openAnalysis ? <OMore onClick={() => nav.openAnalysis?.('dividend')}>Read the dividend section in the full report</OMore> : null}
    </OCard>
  );
}

/* ==========================================================================
   The shareholder panel — dividends and buybacks, counted together
   ========================================================================== */

function ReturnsCard({ a }: { a: Analysis }) {
  const rows = (a.shareholder?.rows || []).filter((r: any) => isNum(r.returned));
  const fmt = (v: number) => money(v, { currency: curSymbol(a.facts.currency) });
  if (rows.length < 2) return <Empty a={a} id="sh-returns" span={8} title="Returned to shareholders" feed="cashflow" what="The cash flow statement">At least two filed years are needed to draw what went back to shareholders.</Empty>;
  return (
    <OCard span={8} id="sh-returns">
      <OHead title="Returned to shareholders" info="Dividends and buybacks stacked, with their filed minus signs removed. Buybacks are cash spent, not shares retired — a company that repurchases exactly what it issues to staff appears here in full and leaves the share count where it was." />
      <ColumnChart height={280} stacked valueFmt={fmt} categories={rows.map((r: any) => String(r.year))} series={[
        { name: 'Dividends', color: 'var(--chart-2)', values: rows.map((r: any) => r.dividends) },
        { name: 'Buybacks', color: 'var(--chart-5)', values: rows.map((r: any) => r.buybacks) },
      ]} />
      <RunBadges rows={rows} get={(r: any) => r.returned} />
    </OCard>
  );
}

function ReturnsFiguresCard({ a }: { a: Analysis }) {
  const sh = a.shareholder || {};
  const fmt = (v: unknown) => money(v as number, { currency: curSymbol(a.facts.currency) });
  const last = sh.latest || {};
  const share = isNum(sh.lifetimeReturned) && sh.lifetimeReturned > 0 && isNum(sh.lifetimeBuybacks) ? sh.lifetimeBuybacks / sh.lifetimeReturned : null;
  const fy = last.year ?? 'year';
  return (
    <OCard span={4} id="sh-figures">
      <OHead title="The whole of it" info="Summed across every filed year on this tab. The split is the policy: a company returning four fifths of it through buybacks is making a different promise from one paying it as a dividend, because a buyback can be stopped without anybody calling it a cut." />
      <StatLines>
        <StatLine label={`Dividends, fiscal ${fy}`} value={fmt(last.dividends)} />
        <StatLine label={`Buybacks, fiscal ${fy}`} value={fmt(last.buybacks)} />
        <StatLine label={`Returned, fiscal ${fy}`} value={fmt(last.returned)} />
        <StatLine label="Shareholder yield" value={pct(last.shareholderYield, { dp: 2 })} note="on that year’s market cap"
          title="Everything returned over what the whole company was worth that year — a yield on a price somebody could have paid, rather than on today’s." />
      </StatLines>
      <StatLines split>
        <StatLine label="Dividends in total" value={fmt(sh.lifetimeDividends)} note={sh.span} />
        <StatLine label="Buybacks in total" value={fmt(sh.lifetimeBuybacks)} note={sh.span} />
        <StatLine label="Returned in total" value={fmt(sh.lifetimeReturned)} note={sh.span} />
        <StatLine label="Through buybacks" value={isNum(share) ? pct(share) : 'n/a'} note="of the total" />
      </StatLines>
    </OCard>
  );
}

function ShareholderYieldCard({ a }: { a: Analysis }) {
  const sh = a.shareholder || { rows: [] };
  const rows = sh.rows.filter((r: any) => isNum(r.shareholderYield));
  if (rows.length < 2) return <Empty a={a} id="sh-yield" span={8} title="Shareholder yield over time">At least two filed years with a market capitalisation are needed to draw a yield.</Empty>;
  const line = (name: string, color: string, get: (r: any) => number | null | undefined) => ({ name, color, points: rows.map((r: any) => ({ date: r.date, value: get(r) })) });
  return (
    <OCard span={8} id="sh-yield">
      <OHead title="Shareholder yield over time" info="Per filed year rather than per day: the buyback half is only known once a year, so a daily line would be a step function pretending to be a measurement. Each year divides by that year’s own market capitalisation." />
      <MultiLineChart height={260} valueFmt={(v) => pct(v, { dp: 1 })} series={[
        line('Everything returned', 'var(--chart-1)', (r) => r.shareholderYield),
        line('Dividends alone', 'var(--chart-2)', (r) => r.dividendYield),
        line('Buybacks alone', 'var(--chart-5)', (r) => r.buybackYield),
      ]} />
      <RangeBadges stat={sh.yieldStat} />
    </OCard>
  );
}

function ShareholderPayoutCard({ a }: { a: Analysis }) {
  const rows = (a.shareholder?.rows || []).filter((r: any) => isNum(r.shareholderEarningsPayout) || isNum(r.shareholderFcfPayout));
  if (rows.length < 2) return <Empty a={a} id="sh-payout" span={8} title="Cover for the whole return">At least two filed years are needed to draw a cover history.</Empty>;
  const line = (name: string, color: string, get: (r: any) => number | null | undefined) => ({ name, color, points: rows.map((r: any) => ({ date: r.date, value: get(r) })) });
  const last = rows.at(-1) || {};
  const over = (v: unknown) => (isNum(v) && v > 1 ? 'neg' as const : '' as const);
  return (
    <OCard span={8} id="sh-payout">
      <OHead title="Cover for the whole return" info="Dividends and buybacks together against the profit and the free cash flow of the same year. Above 100% the return was not funded by the year that paid it — it came from cash on hand, from borrowing, or from selling something." />
      <MultiLineChart height={260} valueFmt={(v) => pct(v, { dp: 0 })} series={[
        line('Of earnings', 'var(--chart-1)', (r) => r.shareholderEarningsPayout),
        line('Of free cash flow', 'var(--chart-4)', (r) => r.shareholderFcfPayout),
      ]} />
      <StatLines split>
        <StatLine label="Of earnings" value={pct(last.shareholderEarningsPayout)} note={`FY${last.year ?? ''}`} tone={over(last.shareholderEarningsPayout)} />
        <StatLine label="Of free cash flow" value={pct(last.shareholderFcfPayout)} note={`FY${last.year ?? ''}`} tone={over(last.shareholderFcfPayout)} />
      </StatLines>
    </OCard>
  );
}

function ShareholderBasisCard({ a }: { a: Analysis }) {
  return (
    <OCard span={12} id="sh-basis">
      <OHead title="About these figures" />
      <Limits items={[
        'Every figure on this panel is a filed fiscal year from the cash flow statement, not a trailing twelve months. It will not tie to the yields in the metrics grid.',
        'Buybacks are the cash the company spent repurchasing stock. They are not the same as the share count falling: a repurchase that only offsets stock issued to employees leaves the count flat and still appears here in full.',
        'The yields divide by the market capitalisation of the year in question, taken from the annual key metrics. Where none is reported, that year has no yield.',
        'Nothing here is graded or ranked. The dividend is scored by its own module, on the Scores panel; what a company returns through buybacks is not.',
      ]} />
      <Tiny>Covering {a.shareholder?.span || 'the filed years'}.</Tiny>
    </OCard>
  );
}

/* ==========================================================================
   The tab
   ========================================================================== */

export function DividendsTab({ a }: { a: Analysis }) {
  const f = a.facts;
  const d = a.dividends || {};
  const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';

  // A company that has never paid is not a broken page — it is a one-line
  // answer, and eight empty cards would bury it.
  const pays = isNum(f.dividendYield) && f.dividendYield > 0;
  if (!pays && !d.available) {
    return (
      <div className={grid}>
        <Empty a={a} id="dv-none" span={12} title={`${f.name} dividends`} feed="dividends" what="Dividend history">
          <b>{f.symbol}</b> pays no dividend and has no payment history on record. Cash is either retained in the business or
          returned through buybacks — the Financials tab shows which.
        </Empty>
      </div>
    );
  }

  /* Three panels. The dividend and the whole of what goes back to shareholders
     are different questions, and the scored view ranks against the sector's
     other payers — a different universe from the figures that say what the
     dividend *is*. */
  return (
    <Tabs defaultValue="dividend">
      <TabsList aria-label="Dividends view">
        <TabsTrigger value="dividend">Dividend</TabsTrigger>
        <TabsTrigger value="scores">Scores</TabsTrigger>
        <TabsTrigger value="shareholder">Shareholder returns</TabsTrigger>
      </TabsList>
      <TabsContent value="dividend" className={grid}>
        <KeyMetricsCard a={a} />
        <HeadlineCard a={a} />
        <YieldCard a={a} />
        <PerShareCard a={a} />
        <CoverCard id="payout" title="Covered by profit" value={f.payoutRatio} label="of earnings paid out" note={coverNote(a)}
          info="The dividend as a share of reported profit. Over 100% means the company is paying out more than it earned." />
        <CoverCard id="cash" title="Covered by cash" value={f.cashPayoutRatio} label="of free cash flow paid out" note={cashNote(a)}
          info="The dividend as a share of free cash flow — the test that matters more, because a dividend is paid in cash rather than in profit." />
        <YieldHistoryCard a={a} />
        <PayoutHistoryCard a={a} />
        <GrowthCard a={a} />
        <ProjectionCard a={a} />
        <HistoryCard a={a} />
        <RecordCard a={a} />
        <BasisCard a={a} />
      </TabsContent>
      <TabsContent value="scores" className={grid}>
        <DividendScoresPanel a={a} />
      </TabsContent>
      <TabsContent value="shareholder" className={grid}>
        <ReturnsCard a={a} />
        <ReturnsFiguresCard a={a} />
        <ShareholderYieldCard a={a} />
        <ShareholderPayoutCard a={a} />
        <ShareholderBasisCard a={a} />
      </TabsContent>
    </Tabs>
  );
}
