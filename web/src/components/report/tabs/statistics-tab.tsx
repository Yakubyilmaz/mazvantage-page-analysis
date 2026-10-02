'use client';

/* ==========================================================================
   Maz Vantage — the Statistics & Metrics tab

   The reference sheet: every current figure the report holds, grouped by
   subject, each saying what period it covers — and a filter box, because a
   page of three hundred numbers is something you look things up in.

   - **Nothing is graded and nothing is ranked.** The factor tabs do that.
   - **Every row states its basis.** TTM, a fiscal year, "current", or a window.
   - **Only changes are coloured.** A level has no direction to colour.
   - Rows with no value are kept by default: here "the report does not have
     this figure" is itself the answer to the lookup.

   Four panels behind one strip: the metrics grid, a Performance panel of
   trend charts, and one panel for each revenue breakdown.
   ========================================================================== */

import * as React from 'react';
import { isNum, num, pct, signClass, yearOf } from '@/lib/format';
import { buildGroups, formatters } from '@/lib/statistics';
import type { Analysis } from '@/lib/model';
import { ColumnChart, MultiLineChart } from '@/components/charts/charts';
import { FeedGate, Notice, OCard, OHead, PerfCagr, StatLine, StatLines, toneClass } from '@/components/report/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger, Input, Switch, Label } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const OTHER_COLOR = 'var(--muted-foreground)';
/* Reordered so adjacent stacked bands are as far apart as the palette allows,
   with the folded band grey — the one band that is a residual, not a name. */
const MIX_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-3)', 'var(--chart-6)'];

const gateOr = (a: Analysis, feed: string, what: string, missing: string) =>
  a.ds.status(feed) !== 'ok' ? <FeedGate a={a} feed={feed} what={what} /> : <Notice>{missing}</Notice>;

function RunBadges({ rows, get, invert }: { rows: any[]; get: (r: any) => unknown; invert?: boolean }) {
  const vals = rows.map(get).map((v) => (isNum(v) ? v : null));
  const from = vals.findIndex(isNum);
  if (from < 0) return null;
  const to = vals.length - 1 - [...vals].reverse().findIndex(isNum);
  if (to <= from) return null;
  return <PerfCagr first={vals[from]} last={vals[to]} years={to - from} invert={invert} />;
}

/* ---------- the metrics grid ---------------------------------------------- */

/**
 * The operating expense card's chart: three bands rather than five rows. The
 * selling / administrative split is reported by some companies and not
 * others, and a chart whose bands change shape between tickers has to be
 * re-read each time. Cost of revenue is a row, not a band — stacked, it would
 * be almost the whole bar with the operating lines a stripe on top.
 */
function OpexChart({ o, fmt }: { o: any; fmt: any }) {
  const series = [
    { name: 'Research & development', color: 'var(--chart-1)', get: (x: any) => x.rnd },
    { name: 'Selling, general & admin', color: 'var(--chart-2)', get: (x: any) => x.sga },
    { name: 'Other operating expenses', color: OTHER_COLOR, get: (x: any) => x.other },
  ].map((s) => ({ ...s, values: o.rows.map(s.get) })).filter((s) => s.values.some(isNum));
  return <ColumnChart stacked height={300} valueFmt={fmt.money} categories={o.rows.map((x: any) => String(x.year ?? '—'))} series={series} />;
}

function MetricsPanel({ a }: { a: Analysis }) {
  const groups = React.useMemo(() => buildGroups(a), [a]);
  const fmt = React.useMemo(() => formatters(a), [a]);
  const total = groups.reduce((n: number, g: any) => n + g.rows.length, 0);
  const [query, setQuery] = React.useState('');
  const [hideEmpty, setHideEmpty] = React.useState(false);
  const q = query.trim().toLowerCase();
  const available = (r: any) => !(hideEmpty && r.value === 'n/a');

  /* Metric names first, section names only if nothing is named that: matching
     both at once returned the Margins card whole for "margin", so "Effective
     tax rate" appeared under a search for margins. The basis and tooltip are
     not searched — "TTM" is on most of the page. */
  const visible = React.useMemo(() => {
    const byLabel = new Map<any, any[]>();
    let hits = 0;
    for (const g of groups) {
      const rows = g.rows.filter((r: any) => available(r) && (!q || r.label.toLowerCase().includes(q)));
      hits += rows.length;
      byLabel.set(g, rows);
    }
    if (!q || hits) return byLabel;
    const byTitle = new Map<any, any[]>();
    for (const g of groups) byTitle.set(g, g.title.toLowerCase().includes(q) ? g.rows.filter(available) : []);
    return byTitle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, q, hideEmpty]);

  let shown = 0;
  const cards: React.ReactNode[] = [];
  for (const g of groups) {
    const rows = visible.get(g) || [];
    // A group the filter emptied is dropped; a group whose feed is missing is
    // kept, because "there is no such data" is the answer to the lookup.
    const gate = !q && !g.rows.length && g.gate ? gateOr(a, g.gate.feed, g.gate.what, g.gate.missing) : null;
    if (!rows.length && !gate) continue;
    shown += rows.length;
    cards.push(
      <OCard key={g.key} span={g.c} id={`st-${g.key}`}>
        <OHead title={g.title} info={g.info} />
        {gate}
        {/* A chart is the shape of a whole card; a filtered card is a few rows lifted out of it. */}
        {!q && rows.length && g.opex ? <OpexChart o={g.opex} fmt={fmt} /> : null}
        {rows.length ? (
          <StatLines>
            {rows.map((r: any) => (
              <StatLine key={r.label} label={r.label} note={r.basis} title={r.title || undefined}
                value={<span className={r.value === 'n/a' ? 'text-muted-foreground/60' : toneClass(signClass(r.dir))}>{r.value}</span>} />
            ))}
          </StatLines>
        ) : null}
      </OCard>,
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-[420px] flex-1"
          placeholder='Filter metrics — try "margin", "debt", "yield"' aria-label="Filter metrics" />
        <div className="flex items-center gap-2">
          <Switch id="hide-empty" checked={hideEmpty} onCheckedChange={setHideEmpty} />
          <Label htmlFor="hide-empty" className="text-13">Hide unavailable</Label>
        </div>
        <span className="text-tiny text-muted-foreground tnum">{q || hideEmpty ? `${shown} of ${total} metrics` : `${total} metrics`}</span>
      </div>
      <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
        {cards.length ? cards : (
          <OCard span={12} id="st-none">
            <Notice>
              No metric or section matches <b>{query}</b>{hideEmpty ? ' among the metrics with a figure' : ''}. Try a shorter word — &ldquo;debt&rdquo;, &ldquo;margin&rdquo;, &ldquo;yield&rdquo;, &ldquo;growth&rdquo;.
            </Notice>
          </OCard>
        )}
      </div>
    </div>
  );
}

/* ---------- the Performance panel -------------------------------------------
   Charts that all answer "which way has it been going", over the filed
   fiscal years `deriveSeries` joined across the three statements. */

const lineOf = (rows: any[], name: string, color: string, get: (r: any) => unknown) => ({
  name, color, points: rows.map((r) => ({ date: r.date, value: get(r) as number | null })),
});

function PerformancePanel({ a }: { a: Analysis }) {
  const fmt = formatters(a);
  const series = a.series || { available: false, rows: [] };
  const employees = a.employees || { available: false, rows: [] };
  if (!series.available || series.rows.length < 2) {
    return (
      <OCard span={12} id="perf-none">
        <OHead title="Performance" />
        {gateOr(a, 'income', 'The annual statements', 'At least two filed fiscal years are needed to draw a trend.')}
      </OCard>
    );
  }
  const rows = series.rows;
  const last = series.latest || {};
  const years = rows.map((r: any) => String(r.year ?? '—'));
  const asPct = (v: number) => pct(v, { dp: 0 });
  const fy = `FY${last.year ?? ''}`;
  const spreads = rows.map((r: any) => r.spread).filter(isNum);
  const cleared = spreads.filter((v: number) => v > 0).length;

  return (
    <>
      <OCard span={8} id="perf-margins">
        <OHead title="Margins" info="Each margin is that year’s filed line over that year’s filed revenue. The trailing-twelve margins in the metrics grid come from the published ratios and will not land exactly on the last point here." />
        <MultiLineChart height={280} valueFmt={asPct} series={[
          lineOf(rows, 'Gross', 'var(--chart-2)', (r) => r.grossMargin),
          lineOf(rows, 'Operating', 'var(--chart-1)', (r) => r.operatingMargin),
          lineOf(rows, 'Net', 'var(--up)', (r) => r.netMargin),
        ]} />
        <StatLines split>
          <StatLine label="Gross margin" value={fmt.pct(last.grossMargin)} note={fy} />
          <StatLine label="Operating margin" value={fmt.pct(last.operatingMargin)} note={fy} />
          <StatLine label="Net margin" value={fmt.pct(last.netMargin)} note={fy} />
        </StatLines>
      </OCard>

      <OCard span={8} id="perf-returns">
        <OHead title="Returns on capital" info="What the business earns on the money tied up in it. Return on equity flatters a company that has bought back enough stock to shrink its own equity — which is why the other two are drawn beside it." />
        <MultiLineChart height={280} valueFmt={asPct} series={[
          lineOf(rows, 'Return on equity', 'var(--chart-1)', (r) => r.roe),
          lineOf(rows, 'Return on invested capital', 'var(--chart-4)', (r) => r.roic),
          lineOf(rows, 'Return on capital employed', 'var(--chart-6)', (r) => r.roce),
        ]} />
        <StatLines split>
          <StatLine label="Return on equity" value={fmt.pct(last.roe)} note={fy} />
          <StatLine label="Return on invested capital" value={fmt.pct(last.roic)} note={fy} />
          <StatLine label="Return on capital employed" value={fmt.pct(last.roce)} note={fy} />
        </StatLines>
      </OCard>

      {/* The one chart here with an opinion in its shape: a green bar above the
          red is a year the business earned more than its funding cost. */}
      <OCard span={4} id="perf-wacc">
        <OHead title="Return on capital against its cost"
          info={'The cost of equity inside the weighted cost is today’s beta and today’s risk-free rate, both editable in Settings — it is not what capital cost in 2018. The debt cost, the mix and the tax rate are each year’s own.'
            + (series.waccBasis === 'book'
              ? ' The equity leg is weighted on book value, because this data plan returns no market capitalisation per year — which understates the equity weight and so the whole hurdle.'
              : ' The equity leg is weighted on market capitalisation, which is what the equity is worth rather than what it is carried at.')} />
        <ColumnChart height={280} valueFmt={(v) => pct(v, { dp: 0 })} categories={years} width={340} series={[
          { name: 'Return on invested capital', color: 'var(--up)', values: rows.map((r: any) => r.roic) },
          { name: 'Weighted cost of capital', color: 'var(--down)', values: rows.map((r: any) => r.wacc) },
        ]} />
        <StatLines split>
          <StatLine label="Return on invested capital" value={fmt.pct(last.roic)} note={fy} />
          <StatLine label="Weighted cost of capital" value={fmt.pct(last.wacc)} note={series.waccBasis === 'market' ? 'market-weighted' : 'book-weighted'} />
          <StatLine label="Spread" value={isNum(last.spread) ? pct(last.spread, { sign: true }) : 'n/a'} tone={signClass(last.spread)} note="earned less cost"
            title="Positive means the last filed year earned more on its capital than that capital costs. Sustained, it is the whole case for a company compounding." />
          <StatLine label="Years above cost" value={spreads.length ? `${cleared} of ${spreads.length}` : 'n/a'} note={series.span} />
        </StatLines>
      </OCard>

      <OCard span={8} id="perf-spend">
        <OHead title="Expense burden" info="Each cost against the cash it is spent out of, rather than against revenue — which is the test of whether the business can keep paying for it. All three rising together is a company buying its growth." />
        <MultiLineChart height={280} valueFmt={asPct} series={[
          lineOf(rows, 'Capex / operating cash flow', 'var(--chart-1)', (r) => r.capexToOcf),
          lineOf(rows, 'R&D / operating cash flow', 'var(--chart-4)', (r) => r.rndToOcf),
          lineOf(rows, 'Stock comp / free cash flow', 'var(--chart-6)', (r) => r.sbcToFcf),
        ]} />
        <StatLines split>
          <StatLine label="Capex / operating cash flow" value={fmt.pct(last.capexToOcf)} note={fy} />
          <StatLine label="R&D / operating cash flow" value={fmt.pct(last.rndToOcf)} note={fy} />
          <StatLine label="Stock comp / free cash flow" value={fmt.pct(last.sbcToFcf)} note={fy}
            title="Reconstructed from the published key-metrics ratio, so it goes missing where that ratio is unavailable rather than being computed from the cash flow statement." />
        </StatLines>
      </OCard>

      <OCard span={8} id="perf-shares">
        <OHead title="Shares in issue" info="Weighted average diluted shares, as the income statement files them. Falling is a buyback and rising is dilution — the denominator every per-share figure in the report is divided by." />
        <ColumnChart height={260} legend={false} valueFmt={(v) => num(v, 2)} categories={years}
          series={[{ name: 'Diluted shares', color: 'var(--chart-5)', values: rows.map((r: any) => r.shares) }]} />
        {/* Down is the welcome direction here, so the badge colours invert. */}
        <RunBadges rows={rows} get={(r) => r.shares} invert />
      </OCard>

      {employees.available && employees.rows.length >= 2 ? (
        <OCard span={8} id="perf-employees">
          <OHead title="Headcount" info="As each annual filing reported it, so this is the figure on the 10-K rather than a live number — and it is a point-in-time count, not an average over the year." />
          <ColumnChart height={260} legend={false} valueFmt={(v) => num(v, 0)} categories={employees.rows.map((r: any) => String(r.year ?? '—'))}
            series={[{ name: 'Employees', color: 'var(--chart-6)', values: employees.rows.map((r: any) => r.count) }]} />
          <RunBadges rows={employees.rows} get={(r) => r.count} />
        </OCard>
      ) : (
        <OCard span={8} id="perf-employees">
          <OHead title="Headcount" />
          {gateOr(a, 'employees', 'The employee history', 'No filed headcount history was returned for this company.')}
        </OCard>
      )}

      {employees.available && employees.latest ? (
        <OCard span={4} id="perf-perhead">
          <OHead title="Per employee" info="The whole company divided by the people in it. Useful across a decade of one company and misleading across two — a business that contracts out its manufacturing has fewer employees to divide by, not more productive ones." />
          <ColumnChart height={260} width={340} valueFmt={fmt.money} categories={employees.rows.map((r: any) => String(r.year ?? '—'))} series={[
            { name: 'Revenue', color: 'var(--chart-1)', values: employees.rows.map((r: any) => r.revenuePerHead) },
            { name: 'Net income', color: 'var(--chart-4)', values: employees.rows.map((r: any) => r.profitPerHead) },
            { name: 'Free cash flow', color: 'var(--chart-6)', values: employees.rows.map((r: any) => r.fcfPerHead) },
          ]} />
          <StatLines split>
            <StatLine label="Revenue per employee" value={fmt.money(employees.latest.revenuePerHead)} note={`FY${employees.latest.year}`} />
            <StatLine label="Net income per employee" value={fmt.money(employees.latest.profitPerHead)} note={`FY${employees.latest.year}`} />
            <StatLine label="Free cash flow per employee" value={fmt.money(employees.latest.fcfPerHead)} note={`FY${employees.latest.year}`} />
          </StatLines>
        </OCard>
      ) : null}
    </>
  );
}

/* ---------- the two revenue breakdown panels ----------------------------------
   The same code with different words: the two breakdowns are one question
   asked along a different axis, and any difference would be arbitrary. */

const SEGMENT_META = {
  segment: {
    key: 'seg-product', title: 'Revenue by segment', feed: 'segProduct',
    info: 'Product and service lines as the company itself names them in its filings, so the names are the filing’s words and change when the company changes them.',
    missing: 'This company does not report a product or service breakdown of its revenue.',
  },
  geography: {
    key: 'seg-geo', title: 'Revenue by geography', feed: 'segGeography',
    info: 'Regions as the company itself defines them, which is rarely a country and never a consistent map between two companies. “Americas” and “Europe” mean whatever the filing says they mean.',
    missing: 'This company does not report a geographic breakdown of its revenue.',
  },
} as const;

function SegmentPanel({ a, seg, meta }: { a: Analysis; seg: any; meta: (typeof SEGMENT_META)[keyof typeof SEGMENT_META] }) {
  const fmt = formatters(a);
  if (!seg || !seg.available) {
    return (
      <OCard span={12} id={`${meta.key}-none`}>
        <OHead title={meta.title} />
        {gateOr(a, meta.feed, meta.title, meta.missing)}
      </OCard>
    );
  }
  const parts = seg.latest.parts;
  const top = parts[0] || null;
  const topThree = parts.slice(0, 3).map((p: any) => p.value).filter(isNum).reduce((x: number, y: number) => x + y, 0);
  const basis = isNum(seg.latest.year) ? `FY${seg.latest.year}` : 'latest filed year';
  const { names, years } = seg.all;

  return (
    <>
      <OCard span={8} id={`${meta.key}-mix`}>
        <OHead title={meta.title} info={meta.info} />
        <ColumnChart stacked height={320} valueFmt={fmt.money} categories={seg.rows.map((x: any) => String(x.year ?? '—'))}
          series={seg.names.map((name: string, i: number) => ({
            name,
            color: name === seg.foldedInto ? OTHER_COLOR : (MIX_COLORS[i] || OTHER_COLOR),
            values: seg.rows.map((x: any) => x.values[name]),
          }))} />
        <p className="mt-4 text-tiny text-muted-foreground/80">
          Fiscal {seg.span}, oldest on the left. Bands are ordered by their size in the newest year
          {seg.foldedInto ? `, with everything past the sixth largest grouped into “${seg.foldedInto}”` : ''}. The table below carries every year and every name, ungrouped.
        </p>
      </OCard>

      <OCard span={4} id={`${meta.key}-latest`}>
        <OHead title={`Fiscal ${seg.latest.year ?? 'year'}`} info="The newest filed year, biggest first, with each segment’s change on the year before it." />
        <StatLines>
          {parts.map((p: any) => (
            <StatLine key={p.name} label={p.name} value={isNum(p.share) ? fmt.pct(p.share, 0) : fmt.money(p.value)} note={fmt.money(p.value)}
              title={isNum(p.change) ? `${pct(p.change, { sign: true })} on the year before` : undefined} />
          ))}
          <StatLine label="Total reported" value={fmt.money(seg.latest.total)} note={basis}
            title="The named segments added up. Where this falls short of revenue the company reports an unallocated or intersegment balance outside the names above." />
        </StatLines>
        <StatLines split>
          <StatLine label="Segments reported" value={String(parts.length)} note={basis} />
          <StatLine label="Largest" value={top ? top.name : 'n/a'} note={top && isNum(top.share) ? fmt.pct(top.share, 0) : ''} />
          <StatLine label="Top three combined" value={seg.latest.total > 0 && topThree > 0 ? fmt.pct(topThree / seg.latest.total, 0) : 'n/a'} note="concentration"
            title="How much of the reported revenue the three largest segments account for. The higher it is, the more the whole company depends on fewer things." />
        </StatLines>
      </OCard>

      <OCard span={12} id={`${meta.key}-table`}>
        <OHead title="Every filed year" info="As the company reported it each year. A blank is a year in which that name was not reported — either because the segment did not exist yet, or because the company was breaking its revenue out differently then." />
        <div className="overflow-x-auto scroll-thin">
          <table className="text-13">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
                <th className="sticky left-0 border-b border-border bg-background px-3 py-2 text-left font-semibold">Segment</th>
                {years.map((y: any) => <th key={y.year} className="border-b border-border px-3 py-2 text-right font-semibold">{y.year ?? '—'}</th>)}
              </tr>
            </thead>
            <tbody>
              {names.map((name: string) => (
                <tr key={name} className="hover:bg-accent/60">
                  <td className="sticky left-0 whitespace-nowrap border-b border-border bg-background px-3 py-2">{name}</td>
                  {years.map((y: any, i: number) => {
                    const now = y.values[name];
                    const before = years[i + 1]?.values[name];
                    const change = isNum(now) && before > 0 ? now / before - 1 : null;
                    return <td key={i} title={isNum(change) ? `${pct(change, { sign: true })} on ${years[i + 1].year}` : undefined}
                      className="whitespace-nowrap border-b border-border px-3 py-2 text-right tnum">{isNum(now) ? fmt.money(now) : '—'}</td>;
                  })}
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="sticky left-0 border-b border-border bg-background px-3 py-2">Total reported</td>
                {years.map((y: any, i: number) => <td key={i} className="border-b border-border px-3 py-2 text-right tnum">{isNum(y.total) ? fmt.money(y.total) : '—'}</td>)}
              </tr>
              <tr>
                <td colSpan={years.length + 1} className="border-b border-border bg-muted px-3 py-1.5 text-micro font-semibold uppercase tracking-[.05em] text-muted-foreground">
                  Share of the year · calculated from the rows above
                </td>
              </tr>
              {names.map((name: string) => (
                <tr key={`s-${name}`} className="hover:bg-accent/60">
                  <td className="sticky left-0 whitespace-nowrap border-b border-border bg-background px-3 py-2">{name}</td>
                  {years.map((y: any, i: number) => {
                    const val = y.values[name];
                    return <td key={i} className="border-b border-border px-3 py-2 text-right tnum">{isNum(val) && y.total > 0 ? fmt.pct(val / y.total, 0) : '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-tiny text-muted-foreground/80">
          Fiscal {seg.all.span}. Figures in {a.facts.currency || 'the reporting currency'}, as reported. Segments come from a different
          feed than the income statement, so they will not always add up to revenue exactly.
        </p>
      </OCard>
    </>
  );
}

export function StatisticsTab({ a }: { a: Analysis }) {
  const filed = yearOf(a.facts.lastReported);
  const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';
  return (
    <div>
      <Tabs defaultValue="metrics">
        <TabsList aria-label="Statistics view">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="segment">Revenue by segment</TabsTrigger>
          <TabsTrigger value="geography">Revenue by geography</TabsTrigger>
        </TabsList>
        {/* forceMount on the grid: it carries the filter box, and rebuilding it
            would throw away whatever the reader had typed. */}
        <TabsContent value="metrics" forceMount className="data-[state=inactive]:hidden"><MetricsPanel a={a} /></TabsContent>
        <TabsContent value="performance" className={grid}><PerformancePanel a={a} /></TabsContent>
        <TabsContent value="segment" className={grid}><SegmentPanel a={a} seg={a.segments?.product} meta={SEGMENT_META.segment} /></TabsContent>
        <TabsContent value="geography" className={grid}><SegmentPanel a={a} seg={a.segments?.geography} meta={SEGMENT_META.geography} /></TabsContent>
      </Tabs>
      {/* Under the panel, not above it: a caveat between the reader and the
          search box is one they scroll past. */}
      <p className={cn('mt-6 text-13 text-muted-foreground')}>
        Every figure here is read from the same analysis the rest of the report is built on — nothing on this page is graded, ranked
        against a sector, or interpreted. Trailing-twelve-month figures come from the published TTM ratios; anything marked with a fiscal
        year comes from the filed annual statements{isNum(filed) ? `, the most recent of which ends in ${filed}` : ''}. Where the two
        disagree, they are measuring different periods rather than contradicting each other. Green and red mark the direction of a
        change, never whether a level is good.
      </p>
    </div>
  );
}
