'use client';

/* ==========================================================================
   The market summary chart: several instruments on one percentage axis

   Port of the legacy `markethub-compare.js`, on Recharts. Every line starts
   at zero on the first session of the window it draws, so what is compared is
   performance over that window and nothing else — levels are never mixed
   into one scale. A series with no history draws nothing rather than a flat
   line at zero.

   Markets keep different holidays, so the x axis is the union of the sessions
   the visible series traded and each line carries its last close across a day
   its own market was shut: a drawn line between two real observations, not an
   invented observation. Each series has its own checkbox; unchecking one drops
   it from the chart *and* from the scale, which is the point of a relative axis.
   ========================================================================== */

import * as React from 'react';
import { CartesianGrid, Line, LineChart as RLineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchFor } from '@/lib/fmp';
import { niceDomain, ticksOf } from '@/lib/chart-scale';
import { isNum } from '@/lib/format';
import { observations, startFor, dateLabel } from '@/components/market/market-chart';
import { TipBox } from '@/components/charts/chart-tip';
import { useDataEpoch } from '@/components/providers';
import { cn } from '@/lib/cn';

const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'] as const;
type Range = (typeof RANGES)[number];
export const SERIES_COLORS = ['#2962ff', '#22ab94', '#ff9800', '#26c6da', '#d500a0', '#f7b500', '#7e57c2', '#ef5350'];
const signedPercent = (v: unknown) => (!isNum(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`);
const axisPercent = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;

export interface CompareSeries { symbol: string; name?: string; shortName?: string; color?: string }

/** A daily series for one symbol: the light feed first, the full one if that comes back empty. */
async function fetchSeries(symbol: string, from: string, to: string) {
  let res = await fetchFor('prices', symbol, { from, to });
  if (res.status !== 'skipped' && (res.status !== 'ok' || !observations(res.data).length)) {
    const full = await fetchFor('marketHistory', symbol, { from, to });
    if (full.status === 'ok' && observations(full.data).length) res = full;
  }
  return res;
}

export function CompareChart({ series, initialRange = '6M', height = 420 }: { series: CompareSeries[]; initialRange?: Range; height?: number }) {
  const { epoch } = useDataEpoch();
  const [range, setRange] = React.useState<Range>(initialRange);
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [nonce, setNonce] = React.useState(0);
  const [loaded, setLoaded] = React.useState<{ key: string; history: Map<string, { date: string; close: number }[]>; first: any } | null>(null);
  const colored = series.map((s, i) => ({ ...s, color: s.color || SERIES_COLORS[i % SERIES_COLORS.length] }));
  const symbols = colored.map((s) => s.symbol).join(',');
  const key = `${symbols}|${range}|${epoch}|${nonce}`;

  React.useEffect(() => {
    let live = true;
    const from = startFor(range);
    const to = new Date().toISOString().slice(0, 10);
    Promise.all(colored.map(async (s) => [s.symbol, await fetchSeries(s.symbol, from, to)] as const)).then((pairs) => {
      if (!live) return;
      const history = new Map(pairs.map(([sym, res]) => [sym, observations(res.data)
        .filter((p) => p.date.slice(0, 10) >= from && p.date.slice(0, 10) <= to)
        .map((p) => ({ date: p.date.slice(0, 10), close: p.close }))]));
      setLoaded({ key, history, first: pairs[0]?.[1] || null });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ready = loaded?.key === key ? loaded : null;
  const visible = colored.filter((s) => !hidden.has(s.symbol) && (ready?.history.get(s.symbol) || []).length > 1);

  /* One row per session, each series carrying its last close across a day its
     own market did not trade. */
  const frame = React.useMemo(() => {
    if (!ready || !visible.length) return null;
    const dates = [...new Set(visible.flatMap((s) => ready.history.get(s.symbol)!.map((p) => p.date)))].sort();
    if (dates.length < 2) return null;
    const rows: Record<string, any>[] = dates.map((d) => ({ d }));
    for (const s of visible) {
      const points = ready.history.get(s.symbol)!;
      let i = 0, last: number | null = null, base: number | null = null;
      dates.forEach((date, k) => {
        while (i < points.length && points[i].date <= date) { last = points[i].close; i += 1; }
        if (last === null) { rows[k][s.symbol] = null; return; }
        if (base === null && last > 0) base = last;
        rows[k][s.symbol] = base && base > 0 ? (last / base - 1) * 100 : null;
      });
    }
    return { dates, rows };
  }, [ready, visible.map((s) => s.symbol).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (symbol: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(symbol)) next.delete(symbol);
    // The last visible line stays: an empty chart has no scale to draw.
    else if (colored.length - next.size > 1) next.add(symbol);
    return next;
  });

  let plot: React.ReactNode;
  if (!ready) {
    plot = <div role="status" className="grid place-items-center text-13 text-muted-foreground" style={{ height }}>Loading price history…</div>;
  } else if (!frame) {
    const st = ready.first?.status;
    const copy = !colored.length ? 'No instruments are selected.'
      : st === 'skipped' ? 'Price history is unavailable right now.'
        : st === 'gated' ? 'Price history is not available for these symbols.'
          : 'No daily history came back for these symbols over this period.';
    plot = (
      <div role="status" className="grid place-content-center justify-items-center gap-1.5 text-center text-13 text-muted-foreground" style={{ height }}>
        <strong className="text-foreground">No chart data</strong><span>{copy}</span>
        <button type="button" className="text-primary hover:underline" onClick={() => setNonce((n) => n + 1)}>Try again</button>
      </div>
    );
  } else {
    const all = frame.rows.flatMap((r) => visible.map((s) => r[s.symbol])).filter(isNum);
    const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    const pad = (hi - lo || 1) * 0.08;
    const dom = niceDomain(lo - pad, hi + pad, 6);
    const short = range === '1M' || range === '3M';
    const label = (d: string) => (short ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : dateLabel(d));
    const ends = visible.map((s) => `${s.shortName || s.name || s.symbol} ${signedPercent([...frame.rows].reverse().find((r) => isNum(r[s.symbol]))?.[s.symbol])}`);
    plot = (
      <div role="img" aria-label={`Performance since ${dateLabel(frame.dates[0], false, true)}: ${ends.join(', ')}`}>
        <ResponsiveContainer width="100%" height={height}>
          <RLineChart data={frame.rows} margin={{ top: 18, right: 0, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <XAxis dataKey="d" tickFormatter={label} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              interval={Math.max(0, Math.ceil(frame.dates.length / 6) - 1)} height={28} />
            <YAxis orientation="right" domain={[dom.lo, dom.hi]} ticks={ticksOf(dom)} tickFormatter={axisPercent} axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={64} />
            <Tooltip cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
              content={(p: any) => (p.active && p.payload?.length ? (
                <TipBox title={dateLabel(p.label, false, true)} lines={p.payload.map((l: any) => ({
                  label: <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2 rounded-full" style={{ background: l.color }} />{l.name}: </span>,
                  value: signedPercent(l.value),
                }))} />
              ) : null)} />
            {visible.map((s) => (
              <Line key={s.symbol} dataKey={s.symbol} name={s.shortName || s.name || s.symbol} stroke={s.color} strokeWidth={1.8}
                dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} connectNulls={false} />
            ))}
          </RLineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const drawn = ready ? [...ready.history.values()].filter((p) => p.length > 1).length : 0;
  return (
    <div className="grid min-w-0 gap-3">
      <div role="group" aria-label="Instruments on the chart" className="flex flex-wrap gap-2">
        {colored.map((s) => {
          const on = !hidden.has(s.symbol);
          return (
            <button key={s.symbol} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(s.symbol)}
              className={cn('inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-tiny font-medium hover:bg-accent', !on && 'text-muted-foreground')}>
              <span aria-hidden="true" className="grid size-3.5 place-items-center rounded-[3px] text-[9px] text-white" style={{ background: on ? s.color : 'transparent', border: `1.5px solid ${s.color}` }}>{on ? '✓' : ''}</span>
              {s.shortName || s.name || s.symbol}
            </button>
          );
        })}
      </div>
      {plot}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2.5">
        <div role="group" aria-label="Chart time range" className="flex flex-wrap gap-0.5">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={r === range} onClick={() => setRange(r)}
              className={cn('rounded-md px-2.5 py-1 text-tiny font-medium text-muted-foreground hover:bg-accent', r === range && 'bg-accent text-foreground')}>{r}</button>
          ))}
        </div>
        <span className="text-micro text-muted-foreground">{drawn ? `Daily closes · ${drawn} of ${colored.length} series` : ''}</span>
      </div>
    </div>
  );
}
