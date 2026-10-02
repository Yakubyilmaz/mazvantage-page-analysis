'use client';

/* ==========================================================================
   Maz Vantage — the standard charts, on Recharts

   Ports of the legacy `charts.js` primitives that map onto a chart library:
   the price line (with event markers and a reference level), grouped or
   stacked columns (with a forecast region), the history-plus-forecast line
   (with uncertainty bands), the multi-series line, the donut, the waterfall
   and the sparkline. The option names are the legacy ones, so a ported view
   passes what it always passed.

   Every colour is a CSS custom property, so every chart follows the theme,
   and the y axis uses the legacy "nice" domain so gridlines land on the same
   friendly values they always did.
   ========================================================================== */

import * as React from 'react';
import {
  ResponsiveContainer, ComposedChart, LineChart as RLineChart, BarChart, AreaChart, PieChart,
  Line, Area, Bar, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
  Scatter, LabelList,
} from 'recharts';
import { isNum, money, price, fmtDate, yearOf, pct } from '@/lib/format';
import { niceDomain, ticksOf, nearestIndex } from '@/lib/chart-scale';
import { RechartsTip, TipBox, useHoverTip } from '@/components/charts/chart-tip';
import { cn } from '@/lib/cn';

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' } as const;

/** A y-axis wide enough for its longest label at 11px, so "US$350.00" is never clipped. */
export function axisWidth(ticks: number[], fmt: (v: number) => string, min = 36): number {
  const longest = Math.max(0, ...ticks.map((v) => fmt(v).length));
  return Math.max(min, Math.min(110, Math.ceil(longest * 6.6) + 12));
}
const GRID = 'var(--grid)';

/** The line under a chart saying there is nothing to draw, at the chart's own height. */
export function ChartEmpty({ height, message, className }: { height: number; message: string; className?: string }) {
  return (
    <div className={cn('grid place-items-center text-tiny text-muted-foreground/80', className)} style={{ height }}>
      {message}
    </div>
  );
}

export interface LegendItem {
  name: string;
  color: string;
}

export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <div className={cn('mt-2 flex flex-wrap gap-x-4 gap-y-1 text-tiny text-muted-foreground', className)}>
      {items.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/* ==========================================================================
   Line / area chart — price history

   Event markers are small glyphs at the dates something happened — an
   insider filing, a fund's reported position change. Only the timing: no
   size, because the question they answer is "when".

   * a **triangle** is an exact date (a Form 4 carries the trade date);
   * a **diamond** is a quarter end (a 13F says what a fund held on the last
     day of a quarter, not when it traded).

   Markers on the same day collapse into one glyph, and the tooltip lists what
   was underneath. Each item keeps its **own** date in the tooltip, not the
   charted point it was snapped to.
   ========================================================================== */

export type MarkerKind = 'insiderBuy' | 'insiderSell' | 'fundBuy' | 'fundSell';
export interface ChartMarker { date: string; kind: MarkerKind; label: string }

const MARKER_STYLE: Record<MarkerKind, { color: string; below: boolean; exact: boolean }> = {
  insiderBuy: { color: 'var(--up)', below: true, exact: true },
  insiderSell: { color: 'var(--down)', below: false, exact: true },
  fundBuy: { color: 'var(--up)', below: true, exact: false },
  fundSell: { color: 'var(--down)', below: false, exact: false },
};

export interface SeriesPoint { date: string; value: number | null | undefined }

export interface RefLine { value: number | null | undefined; label?: string; color?: string; align?: 'start' | 'end' }

export function LineChart({
  series,
  height = 260,
  color = 'var(--primary)',
  fill = true,
  valueFmt = (v: number) => price(v),
  labelFmt = (d: string) => fmtDate(d),
  refLine = null,
  markers = [],
  empty = 'Not enough price history',
}: {
  series: SeriesPoint[];
  height?: number;
  color?: string;
  fill?: boolean;
  valueFmt?: (v: number) => string;
  labelFmt?: (d: string) => string;
  refLine?: RefLine | null;
  markers?: ChartMarker[];
  empty?: string;
}) {
  const gid = React.useId().replace(/:/g, '');
  const { bind, tip } = useHoverTip();
  const [onMarker, setOnMarker] = React.useState(false);

  const pts = series.filter((p): p is { date: string; value: number } => isNum(p.value));
  if (pts.length < 2) return <ChartEmpty height={height} message={empty} />;

  const data = pts.map((p, i) => ({ i, date: p.date, value: p.value }));
  const values = pts.map((p) => p.value);
  // The reference has to fit inside the plot or it is drawn off it.
  if (refLine && isNum(refLine.value)) values.push(refLine.value);
  const dom = niceDomain(Math.min(...values), Math.max(...values), 4);
  const last = pts.length - 1;

  // Bucket the markers by (charted point, kind) so a day with six filings draws once.
  const buckets = new Map<string, { i: number; kind: MarkerKind; items: ChartMarker[] }>();
  for (const m of markers) {
    if (!MARKER_STYLE[m.kind]) continue;
    const i = nearestIndex(pts, m.date);
    if (i == null) continue;
    const key = `${i}|${m.kind}`;
    if (!buckets.has(key)) buckets.set(key, { i, kind: m.kind, items: [] });
    buckets.get(key)!.items.push(m);
  }
  const markerData = [...buckets.values()].map((b) => ({ i: b.i, value: pts[b.i].value, bucket: b }));
  const plotTop = 12;
  const plotBottom = height - 26;

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: plotTop, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="i" type="number" domain={[0, last]} ticks={[0, Math.floor(last / 2), last]}
            tickFormatter={(i: number) => labelFmt(pts[i]?.date)} tick={AXIS_TICK} axisLine={false} tickLine={false} height={26} />
          <YAxis domain={[dom.lo, dom.hi]} ticks={ticksOf(dom)} tickFormatter={(v: number) => valueFmt(v)}
            tick={AXIS_TICK} axisLine={false} tickLine={false} width={axisWidth(ticksOf(dom), valueFmt)} />
          {onMarker ? null : (
            <Tooltip
              cursor={{ stroke: 'var(--chart-axis)', strokeDasharray: '3 3' }}
              content={(p: any) => (
                <RechartsTip {...p} names={false} valueFmt={valueFmt} labelFmt={(i: number) => labelFmt(pts[i]?.date)} />
              )}
            />
          )}
          {fill ? (
            <Area type="linear" dataKey="value" stroke="none" fill={`url(#${gid})`} isAnimationActive={false} activeDot={false} />
          ) : null}
          <Line type="linear" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false}
            activeDot={{ r: 4, fill: color, stroke: 'var(--background)', strokeWidth: 2 }} />
          {refLine && isNum(refLine.value) ? (
            // A level to read the line against — dashed and neutral, because it
            // is a rule rather than a second series.
            <ReferenceLine y={refLine.value} stroke={refLine.color || 'var(--muted-foreground)'} strokeDasharray="5 4"
              label={refLine.label ? { value: refLine.label, position: 'insideTopLeft', fontSize: 11, fill: refLine.color || 'var(--muted-foreground)' } : undefined} />
          ) : null}
          {markerData.length ? (
            <Scatter
              data={markerData}
              dataKey="value"
              isAnimationActive={false}
              shape={(props: any) => {
                const { cx, cy, payload } = props;
                const b = payload.bucket as { kind: MarkerKind; items: ChartMarker[] };
                const style = MARKER_STYLE[b.kind];
                // Held off the line so the price stays readable underneath, and
                // clamped inside the plot so a marker on a high never leaves it.
                const y = style.below ? Math.min(plotBottom - 4, cy + 13) : Math.max(plotTop + 4, cy - 13);
                const r = 4.5;
                const hover = bind(() => (
                  <TipBox lines={[
                    ...b.items.slice(0, 6).map((m) => ({ label: `${fmtDate(m.date)} — ${m.label}` })),
                    ...(b.items.length > 6 ? [{ label: `+${b.items.length - 6} more` }] : []),
                  ]} />
                ));
                const handlers = {
                  onPointerEnter: (e: React.PointerEvent) => { setOnMarker(true); hover.onPointerEnter(e); },
                  onPointerMove: hover.onPointerMove,
                  onPointerLeave: () => { setOnMarker(false); hover.onPointerLeave(); },
                };
                return style.exact ? (
                  <path {...handlers}
                    d={style.below
                      ? `M${cx},${y - r} L${cx + r},${y + r} L${cx - r},${y + r} Z`
                      : `M${cx},${y + r} L${cx + r},${y - r} L${cx - r},${y - r} Z`}
                    fill={style.color} stroke="var(--background)" strokeWidth={1} />
                ) : (
                  <rect {...handlers} x={cx - r} y={y - r} width={r * 2} height={r * 2} transform={`rotate(45 ${cx} ${y})`}
                    fill="none" stroke={style.color} strokeWidth={1.6} />
                );
              }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
      {tip}
    </div>
  );
}

/* ==========================================================================
   Column chart — several series, grouped or stacked, plus a dashed
   "forecast" region and an optional reference level.
   ========================================================================== */

export interface ColumnSeries {
  name: string;
  color: string;
  values: (number | null | undefined)[];
  /** singles out one bar inside a series — the company among its peers */
  colors?: (string | null | undefined)[];
}

export function ColumnChart({
  categories,
  series,
  height = 280,
  stacked = false,
  valueFmt = (v: number) => money(v),
  forecastFrom = null,
  refLine = null,
  legend = true,
  width,
}: {
  categories: (string | number)[];
  series: ColumnSeries[];
  height?: number;
  stacked?: boolean;
  valueFmt?: (v: number) => string;
  forecastFrom?: number | null;
  refLine?: RefLine | null;
  legend?: boolean;
  /** legacy viewBox width; a narrow chart thins its own axis labels */
  width?: number;
}) {
  if (!categories.length || !series.length) return <ChartEmpty height={height} message="No data" />;

  const data = categories.map((cat, i) => {
    const row: Record<string, any> = { cat: String(cat) };
    series.forEach((s, k) => { row[`s${k}`] = isNum(s.values[i]) ? s.values[i] : null; });
    return row;
  });

  let lo = 0;
  let hi = 0;
  if (stacked) {
    categories.forEach((_, i) => {
      hi = Math.max(hi, series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
      lo = Math.min(lo, series.reduce((a, s) => a + Math.min(0, s.values[i] ?? 0), 0));
    });
  } else {
    for (const s of series) for (const v of s.values) if (isNum(v)) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
  }
  if (refLine && isNum(refLine.value)) { hi = Math.max(hi, refLine.value); lo = Math.min(lo, refLine.value); }
  const dom = niceDomain(lo, hi, 4);
  const hasForecast = isNum(forecastFrom) && forecastFrom < categories.length;
  // Roughly one label per 60 units of the legacy viewBox, so a narrow chart
  // thins its own axis instead of overprinting every second year.
  const plotUnits = (width ?? 760) - 78;
  const every = Math.ceil(categories.length / Math.max(Math.floor(plotUnits / 60), 3));

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }} barCategoryGap="34%"
          stackOffset={stacked ? 'sign' : undefined}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="cat" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={every - 1} height={30} />
          <YAxis domain={[dom.lo, dom.hi]} ticks={ticksOf(dom)} tickFormatter={(v: number) => valueFmt(v)}
            tick={AXIS_TICK} axisLine={false} tickLine={false} width={axisWidth(ticksOf(dom), valueFmt)} />
          <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }}
            content={(p: any) => <RechartsTip {...p} valueFmt={valueFmt} />} />
          {hasForecast ? (
            <ReferenceArea x1={String(categories[forecastFrom!])} x2={String(categories[categories.length - 1])}
              fill="var(--grid)" fillOpacity={0.5} ifOverflow="extendDomain"
              label={{ value: 'forecast', position: 'insideTopLeft', fontSize: 10, fill: 'var(--muted-foreground)' }} />
          ) : null}
          {series.map((s, k) => (
            <Bar key={s.name} dataKey={`s${k}`} name={s.name} fill={s.color} stackId={stacked ? 'stack' : undefined}
              radius={2} isAnimationActive={false} minPointSize={1}>
              {categories.map((_, i) => {
                const forecast = hasForecast && i >= forecastFrom!;
                return (
                  <Cell key={i} fill={(s.colors && s.colors[i]) || s.color} fillOpacity={forecast ? 0.55 : 1}
                    stroke={forecast ? s.color : undefined} strokeDasharray={forecast ? '3 2' : undefined} />
                );
              })}
            </Bar>
          ))}
          <ReferenceLine y={0} stroke="var(--chart-axis)" />
          {refLine && isNum(refLine.value) ? (
            <ReferenceLine y={refLine.value} stroke={refLine.color || 'var(--muted-foreground)'} strokeDasharray="4 3"
              label={refLine.label ? {
                value: refLine.label, fontSize: 11, fill: refLine.color || 'var(--muted-foreground)',
                // The end of the line with room above it: on an ascending chart
                // that is the left, where the shortest bars are.
                position: refLine.align === 'start' ? 'insideTopLeft' : 'insideTopRight',
              } : undefined} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
      {legend ? <ChartLegend items={series} /> : null}
    </div>
  );
}

/* ==========================================================================
   Waterfall — how revenue becomes earnings

   A `total` stands on zero; a `delta` floats between the running total and
   the next one. Dashed connectors carry the running total from one bar to
   the next, which is what makes the subtraction legible rather than a row of
   unrelated bars. A delta's value is signed — pass costs as negatives.
   ========================================================================== */

export interface WaterfallStep { label: string; value: number | null | undefined; kind: 'total' | 'delta'; color?: string }

export function WaterfallChart({
  steps, height = 300, valueFmt = (v: number) => money(v), minWidth = 520,
}: { steps: WaterfallStep[]; height?: number; valueFmt?: (v: number) => string; minWidth?: number }) {
  let running = 0;
  const bars: { label: string; value: number; from: number; to: number; isTotal: boolean; color: string }[] = [];
  for (const s of steps) {
    if (!isNum(s.value)) continue;
    const isTotal = s.kind === 'total';
    const from = isTotal ? 0 : running;
    const to = isTotal ? s.value : running + s.value;
    running = to;
    bars.push({
      label: s.label, value: s.value, from, to, isTotal,
      color: s.color || (isTotal ? 'var(--chart-1)' : s.value < 0 ? 'var(--down)' : 'var(--up)'),
    });
  }
  if (bars.length < 2) return <ChartEmpty height={height} message="Not enough of the income statement to chart" />;

  let lo = 0;
  let hi = 0;
  for (const b of bars) { lo = Math.min(lo, b.from, b.to); hi = Math.max(hi, b.from, b.to); }
  const dom = niceDomain(lo, hi, 4);
  const data = bars.map((b) => ({
    label: b.label,
    range: [Math.min(b.from, b.to), Math.max(b.from, b.to)] as [number, number],
    shown: b.isTotal ? b.to : b.value,
    isTotal: b.isTotal,
    color: b.color,
  }));

  /* Step names are the longest axis labels in the report ("Cost of revenue"),
     so below a width the chart scrolls instead of shrinking past legibility. */
  return (
    <div className="overflow-x-auto scroll-thin">
      <div style={{ minWidth }}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 30, right: 16, bottom: 0, left: 0 }} barCategoryGap="42%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} height={34} />
            <YAxis domain={[dom.lo, dom.hi]} ticks={ticksOf(dom)} tickFormatter={(v: number) => valueFmt(v)}
              tick={AXIS_TICK} axisLine={false} tickLine={false} width={axisWidth(ticksOf(dom), valueFmt)} />
            <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }}
              content={({ active, payload }: any) => {
                const row = active && payload?.[0]?.payload;
                if (!row) return null;
                return <TipBox title={row.label} lines={[{ label: row.isTotal ? 'running total: ' : 'change: ', value: valueFmt(row.shown) }]} />;
              }} />
            {/* Connectors at the running total two neighbours share. They run
                along the bars' own edges, so only the gap between them shows. */}
            {bars.slice(0, -1).map((b, i) => (
              <ReferenceLine key={i} segment={[{ x: b.label, y: b.to }, { x: bars[i + 1].label, y: b.to }]}
                stroke="var(--chart-axis)" strokeDasharray="3 3" strokeOpacity={0.55} />
            ))}
            <Bar dataKey="range" radius={2} maxBarSize={96} isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              {/* The figure sits above the bar, which is where the eye lands first. */}
              <LabelList dataKey="shown" position="top" offset={9} formatter={(v: any) => valueFmt(v)}
                style={{ fontSize: 11, fontWeight: 600, fill: 'var(--muted-foreground)' }} />
            </Bar>
            <ReferenceLine y={0} stroke="var(--chart-axis)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ==========================================================================
   History + forecast — actuals solid, consensus dashed, with the analysts'
   low-to-high range as a band.
   ========================================================================== */

export interface ForecastSeries {
  name: string;
  color: string;
  values: (number | null | undefined)[];
  low?: (number | null | undefined)[];
  high?: (number | null | undefined)[];
}

export function ForecastChart({
  points, series, height = 290, valueFmt = (v: number) => money(v), splitAt = null,
}: {
  points: (string | number)[];
  series: ForecastSeries[];
  height?: number;
  valueFmt?: (v: number) => string;
  splitAt?: number | null;
}) {
  if (points.length < 2) return <ChartEmpty height={height} message="Not enough data to plot a forecast" />;

  const all = series.flatMap((s) => s.values.filter(isNum));
  const bandLo = series.flatMap((s) => (s.low || []).filter(isNum));
  const bandHi = series.flatMap((s) => (s.high || []).filter(isNum));
  const dom = niceDomain(Math.min(0, ...all, ...bandLo), Math.max(...all, ...bandHi), 4);
  const split = isNum(splitAt) && splitAt < points.length - 1 ? splitAt : null;

  const data = points.map((p, i) => {
    const row: Record<string, any> = { p: String(p) };
    series.forEach((s, k) => {
      const v = isNum(s.values[i]) ? s.values[i] : null;
      // Split the line so the forecast half is dashed: both halves share the
      // split point so the line is continuous.
      row[`a${k}`] = split == null || i <= split ? v : null;
      row[`f${k}`] = split != null && i >= split ? v : null;
      row[`v${k}`] = v;
      if (s.low && s.high && isNum(s.low[i]) && isNum(s.high[i])) row[`b${k}`] = [s.low[i], s.high[i]];
    });
    return row;
  });
  const every = Math.ceil(points.length / 10);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 18, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="p" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={every - 1} height={32} />
          <YAxis domain={[dom.lo, dom.hi]} ticks={ticksOf(dom)} tickFormatter={(v: number) => valueFmt(v)}
            tick={AXIS_TICK} axisLine={false} tickLine={false} width={axisWidth(ticksOf(dom), valueFmt)} />
          <Tooltip content={({ active, payload, label }: any) => {
            const row = active && payload?.[0]?.payload;
            if (!row) return null;
            return <TipBox title={label} lines={series.map((s, k) => ({ label: `${s.name}: `, value: isNum(row[`v${k}`]) ? valueFmt(row[`v${k}`]) : 'n/a' }))} />;
          }} />
          {split != null ? (
            <ReferenceArea x1={String(points[split])} x2={String(points[points.length - 1])} fill="var(--grid)" fillOpacity={0.45}
              label={{ value: 'analyst forecast', position: 'insideTopLeft', fontSize: 10, fill: 'var(--muted-foreground)' }} />
          ) : null}
          {split != null ? <ReferenceLine x={String(points[split])} stroke="var(--chart-axis)" strokeDasharray="4 3" /> : null}
          {series.map((s, k) => (s.low && s.high ? (
            <Area key={`b${k}`} dataKey={`b${k}`} stroke="none" fill={s.color} fillOpacity={0.14} isAnimationActive={false}
              activeDot={false} connectNulls legendType="none" />
          ) : null))}
          {series.map((s, k) => (
            <Line key={`a${k}`} dataKey={`a${k}`} name={s.name} stroke={s.color} strokeWidth={2.2} isAnimationActive={false}
              dot={{ r: 3.4, fill: s.color, stroke: 'none' }} activeDot={{ r: 4.5 }} connectNulls />
          ))}
          {split != null ? series.map((s, k) => (
            <Line key={`f${k}`} dataKey={`f${k}`} name={s.name} stroke={s.color} strokeWidth={2.2} strokeDasharray="5 4"
              isAnimationActive={false} dot={{ r: 3.4, fill: s.color, stroke: 'none' }} activeDot={{ r: 4.5 }} connectNulls legendType="none" />
          )) : null}
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend items={series} />
    </div>
  );
}

/* ==========================================================================
   Multi-line — several quantities sharing one axis over time.

   Zero is included on purpose: these are levels, so the distance from
   nothing is part of the reading, and a clipped axis would exaggerate every
   wobble in a line that never goes near it.
   ========================================================================== */

export interface MultiSeries { name: string; color: string; points: SeriesPoint[] }

export function MultiLineChart({
  series, height = 260, valueFmt = (v: number) => money(v), labelFmt = (d: string) => String(yearOf(d)),
}: {
  series: MultiSeries[];
  height?: number;
  valueFmt?: (v: number) => string;
  labelFmt?: (d: string) => string;
}) {
  const live = series.filter((s) => (s.points || []).some((p) => isNum(p.value)));
  if (!live.length) return <ChartEmpty height={height} message="No history to chart" />;
  const dates = live[0].points.map((p) => p.date);
  if (dates.length < 2) return <ChartEmpty height={height} message="Not enough history to chart" />;

  const all = live.flatMap((s) => s.points.map((p) => p.value)).filter(isNum);
  const dom = niceDomain(Math.min(0, ...all), Math.max(...all), 4);
  const data = dates.map((d, i) => {
    const row: Record<string, any> = { d };
    live.forEach((s, k) => { row[`s${k}`] = isNum(s.points[i]?.value) ? s.points[i].value : null; });
    return row;
  });
  const every = Math.ceil(dates.length / 10);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RLineChart data={data} margin={{ top: 16, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="d" tickFormatter={(d: string) => labelFmt(d)} tick={AXIS_TICK} axisLine={false} tickLine={false}
            interval={every - 1} height={30} />
          <YAxis domain={[dom.lo, dom.hi]} ticks={ticksOf(dom)} tickFormatter={(v: number) => valueFmt(v)}
            tick={AXIS_TICK} axisLine={false} tickLine={false} width={axisWidth(ticksOf(dom), valueFmt)} />
          <Tooltip content={(p: any) => <RechartsTip {...p} valueFmt={valueFmt} labelFmt={(d: string) => labelFmt(d)} />} />
          {live.map((s, k) => (
            <Line key={s.name} dataKey={`s${k}`} name={s.name} stroke={s.color} strokeWidth={2} isAnimationActive={false}
              dot={{ r: 3.5, fill: s.color, stroke: 'var(--background)', strokeWidth: 1.5 }} connectNulls={false} />
          ))}
        </RLineChart>
      </ResponsiveContainer>
      <ChartLegend items={live} />
    </div>
  );
}

/* ==========================================================================
   Donut — ownership breakdown, balance-sheet composition
   ========================================================================== */

export interface Slice { name: string; value: number | null | undefined; color: string; display?: string }

export function Donut({
  slices, size = 200, thickness = 34, centerLabel = '', centerValue = '',
}: { slices: Slice[]; size?: number; thickness?: number; centerLabel?: string; centerValue?: string }) {
  const live = slices.filter((s): s is Slice & { value: number } => isNum(s.value) && s.value > 0);
  const total = live.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return <ChartEmpty height={size} message="No breakdown available" />;
  const outer = (size / 2) * (82 / 100);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative" style={{ width: size, height: size, maxWidth: '100%' }}>
        <PieChart width={size} height={size}>
          <Pie data={live} dataKey="value" nameKey="name" startAngle={90} endAngle={-270} outerRadius={outer}
            innerRadius={outer - (thickness * size) / 200} stroke="var(--background)" strokeWidth={1.5} isAnimationActive={false}>
            {live.map((s) => <Cell key={s.name} fill={s.color} />)}
          </Pie>
          <Tooltip content={({ active, payload }: any) => {
            const s = active && payload?.[0]?.payload;
            if (!s) return null;
            return <TipBox title={s.name} lines={[{ value: `${pct(s.value / total)} · ${s.display ?? money(s.value)}` }]} />;
          }} />
        </PieChart>
        {centerValue || centerLabel ? (
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            {centerValue ? <span className="text-xl font-bold leading-tight">{centerValue}</span> : null}
            {centerLabel ? <span className="text-[10px] text-muted-foreground">{centerLabel}</span> : null}
          </div>
        ) : null}
      </div>
      <ChartLegend className="mt-0 grid" items={live.map((s) => ({ name: `${s.name} — ${pct(s.value / total)}`, color: s.color }))} />
    </div>
  );
}

/* ==========================================================================
   Sparkline — the one chart with no axes, labels or numbers. It is a shape,
   read beside a figure that already says the level and the change.

   Coloured by the direction of the whole run rather than by the last tick: a
   series that ended the day down inside a month that is up reads as the month.
   ========================================================================== */

export function Sparkline({
  points, width = 160, height = 38, up = null, className,
}: { points: { value?: number | null }[] | null | undefined; width?: number; height?: number; up?: boolean | null; className?: string }) {
  const vals = (points || []).map((p) => (isNum(p?.value) ? p.value : null)).filter(isNum);
  if (vals.length < 2) return <svg aria-hidden="true" className={className} style={{ width: '100%', height }} />;
  const rising = up == null ? vals[vals.length - 1] >= vals[0] : up;
  const color = rising ? 'var(--up)' : 'var(--down)';
  const gid = `spark-${rising ? 'u' : 'd'}`;
  const data = vals.map((v, i) => ({ i, v }));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  // A flat series has no range to divide by; centring it is the honest rendering.
  const pad = (hi - lo || 1) * 0.08;
  return (
    <div aria-hidden="true" className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height={height} minWidth={width / 4}>
        <AreaChart data={data} margin={{ top: 3, right: 0, bottom: 3, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={hi === lo ? [lo - 1, hi + 1] : [lo - pad, hi + pad]} />
          <XAxis hide dataKey="i" />
          <Area type="linear" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gid})`} isAnimationActive={false}
            dot={false} activeDot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
