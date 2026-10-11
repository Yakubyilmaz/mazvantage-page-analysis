'use client';

/* ==========================================================================
   Flow chart — what came in above the line, what went out below it, and the
   price it happened at

   Monthly columns on a signed scale: series with `sign: 1` stack upwards,
   `sign: -1` stack downwards, so a month of buying and a month of selling
   read as opposite things rather than two bars of a colour. The axis prints
   sizes without a sign — the legend and the zero line say which way is out.

   The optional line is drawn on its own right-hand axis. It is there to say
   *when* in the price's path the money moved, not to be read against the
   bars' scale, and the two never share a tick.
   ========================================================================== */

import * as React from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { isNum } from '@/lib/format';
import { niceDomain, ticksOf } from '@/lib/chart-scale';
import { TipBox } from '@/components/charts/chart-tip';
import { ChartEmpty, ChartLegend, axisWidth } from '@/components/charts/charts';

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' } as const;

export interface FlowSeries {
  key: string;
  name: string;
  color: string;
  /** 1 stacks above zero, -1 below */
  sign: 1 | -1;
  /** drawn lighter: the flows that are not somebody's decision */
  muted?: boolean;
  values: number[];
}

export interface FlowLine {
  name: string;
  color: string;
  values: (number | null)[];
  fmt: (v: number) => string;
}

export function FlowChart({
  categories, series, line = null, height = 300, valueFmt, axisFmt, labelFmt = (c) => c, tipExtra, empty = 'Nothing to chart',
}: {
  categories: string[];
  series: FlowSeries[];
  line?: FlowLine | null;
  height?: number;
  /** a size, always positive — the side is the series' sign */
  valueFmt: (v: number) => string;
  /** the axis's shorter form of `valueFmt`; defaults to it */
  axisFmt?: (v: number) => string;
  labelFmt?: (category: string) => string;
  /** a closing line for a month's tooltip, such as a count of trades */
  tipExtra?: (index: number) => React.ReactNode;
  empty?: string;
}) {
  if (!categories.length) return <ChartEmpty height={height} message={empty} />;

  const data = categories.map((c, i) => {
    const row: Record<string, any> = { i, cat: c };
    for (const s of series) row[s.key] = s.values[i] ? s.sign * s.values[i] : 0;
    if (line) row.line = isNum(line.values[i]) ? line.values[i] : null;
    return row;
  });

  let hi = 0;
  let lo = 0;
  categories.forEach((_, i) => {
    hi = Math.max(hi, series.filter((s) => s.sign > 0).reduce((t, s) => t + (s.values[i] || 0), 0));
    lo = Math.min(lo, -series.filter((s) => s.sign < 0).reduce((t, s) => t + (s.values[i] || 0), 0));
  });
  const anything = hi > 0 || lo < 0;
  // Ticks only on the side that has something on it. The empty side keeps a
  // sliver of room without a tick of its own, so the zero line is not drawn
  // on the plot's edge and a month of selling does not spend a quarter of
  // the chart on an empty band of buying.
  const nice = niceDomain(lo, hi, 4);
  const sliver = nice.step * 0.3;
  const flowDomain: [number, number] = !anything ? [-1, 1] : [lo < 0 ? nice.lo : -sliver, hi > 0 ? nice.hi : sliver];
  const flowTicks = anything ? ticksOf({ lo: lo < 0 ? nice.lo : 0, hi: hi > 0 ? nice.hi : 0, step: nice.step }) : [0];
  const tickFmt = axisFmt ?? valueFmt;
  const absFmt = (v: number) => (v === 0 ? '0' : tickFmt(Math.abs(v)));

  const lineVals = line ? line.values.filter(isNum) : [];
  const lineDom = lineVals.length ? niceDomain(Math.min(...lineVals), Math.max(...lineVals), 4) : null;
  const lineTicks = lineDom ? ticksOf(lineDom) : [];

  // About one label per 70px of a typical plot; the chart is responsive, so
  // this is a ceiling on crowding, not a promise of spacing.
  const every = Math.max(1, Math.ceil(categories.length / 10));

  if (!anything && !lineVals.length) return <ChartEmpty height={height} message={empty} />;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 12, right: line ? 4 : 16, bottom: 0, left: 0 }} barCategoryGap="22%" stackOffset="sign">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="i" type="category" tick={AXIS_TICK} axisLine={false} tickLine={false} height={26}
            interval={every - 1} tickFormatter={(i: number) => labelFmt(categories[i])} />
          <YAxis yAxisId="flow" domain={flowDomain} ticks={flowTicks} tickFormatter={absFmt}
            tick={AXIS_TICK} axisLine={false} tickLine={false} width={axisWidth(flowTicks, absFmt)} />
          {line && lineDom ? (
            <YAxis yAxisId="line" orientation="right" domain={[lineDom.lo, lineDom.hi]} ticks={lineTicks} tickFormatter={line.fmt}
              tick={{ ...AXIS_TICK, fill: line.color }} axisLine={false} tickLine={false} width={axisWidth(lineTicks, line.fmt)} />
          ) : null}
          <Tooltip cursor={{ fill: 'var(--accent)', opacity: 0.5 }}
            content={(p: any) => {
              if (!p.active || !p.payload?.length) return null;
              const i = p.payload[0].payload.i as number;
              const lines = series.filter((s) => s.values[i] > 0)
                .map((s) => ({ label: `${s.name}: `, value: valueFmt(s.values[i]) }));
              if (line && isNum(line.values[i])) lines.push({ label: `${line.name}: `, value: line.fmt(line.values[i] as number) });
              if (!lines.length) lines.push({ label: 'Nothing filed this month', value: '' });
              const extra = tipExtra?.(i);
              return (
                <TipBox title={labelFmt(categories[i])}
                  lines={extra ? [...lines, { label: extra, value: '' }] : lines} />
              );
            }} />
          {series.map((s) => (
            <Bar key={s.key} yAxisId="flow" dataKey={s.key} name={s.name} stackId="flow" fill={s.color}
              fillOpacity={s.muted ? 0.38 : 1} isAnimationActive={false} />
          ))}
          <ReferenceLine yAxisId="flow" y={0} stroke="var(--chart-axis)" />
          {line ? (
            <Line yAxisId="line" type="linear" dataKey="line" name={line.name} stroke={line.color} strokeWidth={1.75}
              dot={false} activeDot={{ r: 3.5, fill: line.color, stroke: 'var(--background)', strokeWidth: 2 }}
              connectNulls={false} isAnimationActive={false} />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend items={[
        ...series.map((s) => ({
          name: s.name,
          color: s.muted ? `color-mix(in srgb, ${s.color} 38%, transparent)` : s.color,
        })),
        ...(line ? [{ name: line.name, color: line.color }] : []),
      ]} />
    </div>
  );
}
