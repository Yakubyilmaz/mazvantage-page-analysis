'use client';

/* ==========================================================================
   The study chart — the price with indicators and the reader's own drawings

   One component on the Technicals tab. Every figure on it is computed in the
   browser from the daily bars the tab already loaded (`lib/technicals.ts`),
   so adding a study costs nothing.

   - **Interval**: studies are computed on the bars shown. Weekly candles get
     a weekly RSI, not a daily one sampled once a week — the way every
     charting package does it, and the only way the two panes agree.
   - **Warm-up**: studies are computed over the whole history and then cut to
     the range on screen, so a 200-day average exists from the first visible
     bar rather than starting 200 bars in.
   - **Drawings** are stored in price and date, not pixels, so a line drawn on
     the one-year view is in the same place on the five-year one. They are
     kept per symbol in this browser; the layout (which studies, which range)
     is kept once and follows the reader from company to company.
   ========================================================================== */

import * as React from 'react';
import {
  Bar as RBar, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Minus, MoveUpRight, Ruler, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { bollinger, ema, macd, resample, rsi, sma, type Bar } from '@/lib/technicals';
import { newId, useStoredJson, writeJson } from '@/lib/local-store';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/* ---------- stored state -------------------------------------------------------------- */

const LAYOUT_KEY = 'mazvantage.chart.layout';
const DRAWINGS_KEY = 'mazvantage.chart.drawings';

const RANGES = ['3M', '6M', '1Y', '2Y', '5Y', '10Y', 'ALL'] as const;
type RangeKey = (typeof RANGES)[number];
type Interval = 'auto' | 'day' | 'week' | 'month';

interface Layout {
  range: RangeKey;
  interval: Interval;
  style: 'candles' | 'line';
  sma: number[];
  ema: number[];
  bollinger: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
}

const DEFAULT_LAYOUT: Layout = { range: '1Y', interval: 'auto', style: 'candles', sma: [50, 200], ema: [], bollinger: false, volume: true, rsi: true, macd: false };

type Point = { date: string; price: number };
interface Drawing { id: string; type: 'hline' | 'trend' | 'fib'; a: Point; b?: Point }
type Tool = 'none' | 'hline' | 'trend' | 'fib';

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const SMA_COLORS = ['#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9'];
const EMA_COLORS = ['#06b6d4', '#10b981', '#f97316', '#a855f7'];
const UP = '#089981';
const DOWN = '#f23645';
const AXIS_W = 64;
const MARGIN = { top: 12, right: 0, bottom: 0, left: 8 };

function parseLayout(raw: unknown): Layout {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const periods = (v: unknown, fallback: number[]) => (Array.isArray(v)
    ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 2 && n <= 400))].slice(0, 4)
    : fallback);
  return {
    range: RANGES.includes(r.range) ? r.range : DEFAULT_LAYOUT.range,
    interval: ['auto', 'day', 'week', 'month'].includes(r.interval) ? r.interval : 'auto',
    style: r.style === 'line' ? 'line' : 'candles',
    sma: periods(r.sma, DEFAULT_LAYOUT.sma),
    ema: periods(r.ema, DEFAULT_LAYOUT.ema),
    bollinger: typeof r.bollinger === 'boolean' ? r.bollinger : DEFAULT_LAYOUT.bollinger,
    volume: typeof r.volume === 'boolean' ? r.volume : DEFAULT_LAYOUT.volume,
    rsi: typeof r.rsi === 'boolean' ? r.rsi : DEFAULT_LAYOUT.rsi,
    macd: typeof r.macd === 'boolean' ? r.macd : DEFAULT_LAYOUT.macd,
  };
}

/* ---------- time -------------------------------------------------------------------------- */

function rangeStart(range: RangeKey, lastDate: string): string {
  if (range === 'ALL') return '0000-00-00';
  const d = new Date(`${lastDate}T00:00:00Z`);
  if (range.endsWith('M')) d.setUTCMonth(d.getUTCMonth() - Number(range.slice(0, -1)));
  else d.setUTCFullYear(d.getUTCFullYear() - Number(range.slice(0, -1)));
  return d.toISOString().slice(0, 10);
}

/** Auto picks a bar size that keeps a few hundred candles on screen. */
const autoInterval = (range: RangeKey): Exclude<Interval, 'auto'> => (['3M', '6M', '1Y', '2Y'].includes(range) ? 'day' : 'week');

const label = (date: string, full = false) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US',
  full ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' } : { month: 'short', year: '2-digit', timeZone: 'UTC' });

/* ---------- the candle ---------------------------------------------------------------------- */

/** A candlestick drawn over a [low, high] range bar: wick first, body on top. */
function Candle(props: any) {
  const { x, width, y, height, payload } = props;
  if (!payload || ![payload.o, payload.h, payload.l, payload.c].every(Number.isFinite)) return null;
  const { o, h, l, c } = payload;
  const toY = (v: number) => (h === l ? y + height / 2 : y + ((h - v) / (h - l)) * height);
  const color = c >= o ? UP : DOWN;
  const bodyW = Math.max(1.5, Math.min(11, width * 0.7));
  const cx = x + width / 2;
  const top = Math.min(toY(o), toY(c));
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyW / 2} y={top} width={bodyW} height={Math.max(1, Math.abs(toY(o) - toY(c)))} fill={color} />
    </g>
  );
}

/* ---------- the plot area, measured -------------------------------------------------------------- */

/**
 * Where the plot sits on screen. Recharts clips the series to the plot area
 * with a `clipPath` rectangle, which is the exact box a click has to be read
 * against — measuring it beats re-deriving it from margins and axis widths.
 */
function plotBox(host: HTMLElement | null) {
  const svg = host?.querySelector('svg.recharts-surface');
  const rect = svg?.querySelector('defs clipPath rect');
  if (!svg || !rect) return null;
  const s = svg.getBoundingClientRect();
  const n = (k: string) => Number(rect.getAttribute(k));
  return { left: s.left + n('x'), top: s.top + n('y'), width: n('width'), height: n('height') };
}

/* ==========================================================================
   The chart
   ========================================================================== */

export function StudyChart({ symbol, bars, currency = 'USD', ohlc }: { symbol: string; bars: Bar[]; currency?: string; ohlc: boolean }) {
  const stored = useStoredJson<unknown>(LAYOUT_KEY, null);
  const layout = React.useMemo(() => parseLayout(stored), [stored]);
  const setLayout = (patch: Partial<Layout>) => writeJson(LAYOUT_KEY, { ...layout, ...patch });

  const allDrawings = useStoredJson<Record<string, Drawing[]>>(DRAWINGS_KEY, {});
  const drawings = React.useMemo(() => (Array.isArray(allDrawings?.[symbol]) ? allDrawings[symbol] : []), [allDrawings, symbol]);
  const saveDrawings = (next: Drawing[]) => writeJson(DRAWINGS_KEY, { ...(allDrawings || {}), [symbol]: next });

  const [tool, setTool] = React.useState<Tool>('none');
  const [pending, setPending] = React.useState<Point | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const plotRef = React.useRef<HTMLDivElement>(null);

  const interval = layout.interval === 'auto' ? autoInterval(layout.range) : layout.interval;
  const candles = layout.style === 'candles' && ohlc;

  /* Bars at the chosen interval, studies over all of them, then the window. */
  const frame = React.useMemo(() => {
    const ib = interval === 'day' ? bars : resample(bars, interval);
    if (ib.length < 2) return null;
    const closes = ib.map((b) => b.close);
    const smas = layout.sma.map((p) => ({ p, s: sma(closes, p) }));
    const emas = layout.ema.map((p) => ({ p, s: ema(closes, p) }));
    const bb = layout.bollinger ? bollinger(closes, 20, 2) : null;
    const r = layout.rsi ? rsi(closes, 14) : null;
    const m = layout.macd ? macd(closes) : null;
    const from = rangeStart(layout.range, ib[ib.length - 1].date);
    let start = ib.findIndex((b) => b.date >= from);
    if (start < 0) start = 0;
    const rows = ib.slice(start).map((b, k) => {
      const i = start + k;
      const row: Record<string, any> = {
        i: k, date: b.date, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume,
        range: Number.isFinite(b.low as number) && Number.isFinite(b.high as number) ? [b.low, b.high] : null,
        up: Number.isFinite(b.open as number) ? b.close >= (b.open as number) : i > 0 ? b.close >= ib[i - 1].close : true,
      };
      smas.forEach(({ p, s }) => { row[`sma${p}`] = s[i]; });
      emas.forEach(({ p, s }) => { row[`ema${p}`] = s[i]; });
      if (bb) { row.bbU = bb.upper[i]; row.bbM = bb.middle[i]; row.bbL = bb.lower[i]; }
      if (r) row.rsi = r[i];
      if (m) { row.macd = m.macd[i]; row.sig = m.signal[i]; row.hist = m.histogram[i]; }
      return row;
    });
    return { ib, start, rows };
  }, [bars, interval, layout.sma.join(','), layout.ema.join(','), layout.bollinger, layout.rsi, layout.macd, layout.range]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!frame) return <p className="py-10 text-center text-13 text-muted-foreground">Not enough history to chart.</p>;
  const { ib, start, rows } = frame;
  const n = rows.length;

  /* The price scale: what is drawn, overlays included, padded a little. */
  const values: number[] = [];
  for (const row of rows) {
    if (candles && row.range) values.push(row.range[0], row.range[1]); else values.push(row.c);
    for (const p of layout.sma) if (Number.isFinite(row[`sma${p}`])) values.push(row[`sma${p}`]);
    for (const p of layout.ema) if (Number.isFinite(row[`ema${p}`])) values.push(row[`ema${p}`]);
    if (layout.bollinger) { if (Number.isFinite(row.bbU)) values.push(row.bbU); if (Number.isFinite(row.bbL)) values.push(row.bbL); }
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || Math.abs(max) * 0.02 || 1) * 0.06;
  const lo = min - pad;
  const hi = max + pad;
  const fmt = (v: number) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');

  /* A stored date back to an x position on this interval and window. */
  const xOf = (date: string) => {
    let lo2 = 0;
    let hi2 = ib.length - 1;
    while (lo2 < hi2) { const mid = (lo2 + hi2) >> 1; if (ib[mid].date < date) lo2 = mid + 1; else hi2 = mid; }
    return lo2 - start;
  };

  const place = (e: React.MouseEvent) => {
    if (tool === 'none') return;
    const box = plotBox(plotRef.current);
    if (!box || box.width <= 0 || box.height <= 0) return;
    const fx = (e.clientX - box.left) / box.width;
    const fy = (e.clientY - box.top) / box.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    const idx = Math.max(0, Math.min(n - 1, Math.round(fx * (n - 1))));
    const point: Point = { date: rows[idx].date, price: Number((hi - fy * (hi - lo)).toFixed(4)) };
    if (tool === 'hline') { saveDrawings([...drawings, { id: newId('dr'), type: 'hline', a: point }]); setTool('none'); return; }
    if (!pending) { setPending(point); return; }
    saveDrawings([...drawings, { id: newId('dr'), type: tool, a: pending, b: point }]);
    setPending(null);
    setTool('none');
  };

  const hoverRow = hover !== null && hover >= 0 && hover < n ? rows[hover] : rows[n - 1];
  const prevClose = hover !== null && hover > 0 ? rows[hover - 1]?.c : start > 0 ? ib[start - 1].close : rows[0].c;
  const change = Number.isFinite(prevClose) ? hoverRow.c - prevClose : null;

  const xTicks = [...new Set(Array.from({ length: 6 }, (_, k) => Math.round((k / 5) * (n - 1))))];
  const xAxis = (hide: boolean) => (
    <XAxis dataKey="i" type="number" domain={[0, Math.max(1, n - 1)]} ticks={xTicks} hide={hide} height={hide ? 0 : 26}
      tickFormatter={(i: number) => (rows[i] ? label(rows[i].date) : '')} axisLine={false} tickLine={false}
      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} allowDataOverflow />
  );
  const cursor = { stroke: 'var(--muted-foreground)', strokeDasharray: '4 4', strokeWidth: 0.8 };
  const onMove = (s: any) => { const i = Number(s?.activeTooltipIndex); if (Number.isFinite(i)) setHover(i); };

  const toolBtn = (id: Tool, title: string, icon: React.ReactNode) => (
    <button type="button" title={title} aria-label={title} aria-pressed={tool === id}
      onClick={() => { setPending(null); setTool(tool === id ? 'none' : id); }}
      className={cn('inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
        tool === id && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary')}>
      {icon}
    </button>
  );

  return (
    <div className="grid min-w-0 gap-2">
      {/* the toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Range" className="flex gap-0.5">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={r === layout.range} onClick={() => setLayout({ range: r })}
              className={cn('rounded-md px-2 py-1 text-tiny font-medium text-muted-foreground hover:bg-accent hover:text-foreground',
                r === layout.range && 'bg-primary/10 text-primary')}>
              {r === 'ALL' ? 'All' : r}
            </button>
          ))}
        </div>
        <select aria-label="Bar interval" value={layout.interval} onChange={(e) => setLayout({ interval: e.target.value as Interval })}
          className="h-8 rounded-md border border-border bg-background px-2 text-tiny">
          <option value="auto">Auto ({autoInterval(layout.range) === 'day' ? 'daily' : 'weekly'})</option>
          <option value="day">Daily bars</option>
          <option value="week">Weekly bars</option>
          <option value="month">Monthly bars</option>
        </select>
        <select aria-label="Chart style" value={candles ? 'candles' : 'line'} onChange={(e) => setLayout({ style: e.target.value as Layout['style'] })}
          className="h-8 rounded-md border border-border bg-background px-2 text-tiny">
          <option value="candles" disabled={!ohlc}>Candles{ohlc ? '' : ' (needs OHLC)'}</option>
          <option value="line">Line</option>
        </select>
        <StudiesMenu layout={layout} setLayout={setLayout} />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <div role="group" aria-label="Drawing tools" className="flex items-center gap-0.5">
          {toolBtn('hline', 'Horizontal line — click a price', <Minus className="size-4" />)}
          {toolBtn('trend', 'Trend line — click two points', <MoveUpRight className="size-4" />)}
          {toolBtn('fib', 'Fibonacci retracement — click the swing start, then its end', <Ruler className="size-4" />)}
          {drawings.length ? (
            <button type="button" title="Delete every drawing on this chart" aria-label="Delete every drawing on this chart" onClick={() => saveDrawings([])}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-down">
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
        <button type="button" onClick={() => writeJson(LAYOUT_KEY, DEFAULT_LAYOUT)} title="Back to the default studies and range"
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-tiny text-muted-foreground hover:bg-accent hover:text-foreground">
          <RotateCcw className="size-3.5" />Reset
        </button>
      </div>

      {/* the readout: the bar under the pointer, or the latest */}
      <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted-foreground tnum">
        <span className="font-semibold text-foreground">{label(hoverRow.date, true)}</span>
        {ohlc && Number.isFinite(hoverRow.o) ? (
          <>
            <span>O {fmt(hoverRow.o)}</span><span>H {fmt(hoverRow.h)}</span><span>L {fmt(hoverRow.l)}</span>
          </>
        ) : null}
        <span>C <b className="text-foreground">{fmt(hoverRow.c)}</b> {currency}</span>
        {change !== null && Number.isFinite(prevClose) ? (
          <span className={change >= 0 ? 'text-up' : 'text-down'}>{change >= 0 ? '+' : ''}{fmt(change)} ({((change / prevClose) * 100).toFixed(2)}%)</span>
        ) : null}
        {layout.sma.map((p, k) => <span key={`s${p}`} style={{ color: SMA_COLORS[k % SMA_COLORS.length] }}>SMA {p} {fmt(hoverRow[`sma${p}`])}</span>)}
        {layout.ema.map((p, k) => <span key={`e${p}`} style={{ color: EMA_COLORS[k % EMA_COLORS.length] }}>EMA {p} {fmt(hoverRow[`ema${p}`])}</span>)}
        {layout.bollinger ? <span>BB(20, 2) {fmt(hoverRow.bbL)} – {fmt(hoverRow.bbU)}</span> : null}
      </div>

      {tool !== 'none' ? (
        <p role="status" className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-tiny text-primary">
          {tool === 'hline' ? 'Click the chart at the price to mark.' : pending ? 'Now click the second point.' : tool === 'fib' ? 'Click where the swing starts.' : 'Click the first point of the line.'}
          <button type="button" onClick={() => { setTool('none'); setPending(null); }} className="ml-auto inline-flex items-center gap-1 font-semibold hover:underline">
            <X className="size-3.5" />Cancel
          </button>
        </p>
      ) : null}

      {/* the price */}
      <div ref={plotRef} onClick={place} className={cn('relative min-w-0', tool !== 'none' && 'cursor-crosshair')} style={{ height: 380 }}
        role="img" aria-label={`${symbol} price chart, ${layout.range === 'ALL' ? 'all history' : layout.range}, ${interval === 'day' ? 'daily' : interval === 'week' ? 'weekly' : 'monthly'} bars`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={MARGIN} syncId={`study-${symbol}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={0.65} />
            {xAxis(false)}
            <YAxis orientation="right" domain={[lo, hi]} width={AXIS_W} tickFormatter={(v: number) => fmt(v)} axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} allowDataOverflow />
            <Tooltip content={() => null} cursor={cursor} isAnimationActive={false} />
            {candles
              ? <RBar dataKey="range" shape={<Candle />} isAnimationActive={false} />
              : <Line type="linear" dataKey="c" stroke="var(--primary)" strokeWidth={1.8} dot={false} isAnimationActive={false} />}
            {layout.bollinger ? (
              <>
                <Line dataKey="bbU" stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                <Line dataKey="bbM" stroke="#64748b" strokeWidth={0.8} dot={false} isAnimationActive={false} />
                <Line dataKey="bbL" stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              </>
            ) : null}
            {layout.sma.map((p, k) => <Line key={`s${p}`} dataKey={`sma${p}`} stroke={SMA_COLORS[k % SMA_COLORS.length]} strokeWidth={1.4} dot={false} isAnimationActive={false} />)}
            {layout.ema.map((p, k) => <Line key={`e${p}`} dataKey={`ema${p}`} stroke={EMA_COLORS[k % EMA_COLORS.length]} strokeWidth={1.4} dot={false} isAnimationActive={false} />)}
            {drawings.map((d) => {
              if (d.type === 'hline') {
                return <ReferenceLine key={d.id} y={d.a.price} stroke="#2962ff" strokeWidth={1.2} ifOverflow="hidden"
                  label={{ value: fmt(d.a.price), position: 'insideTopLeft', fill: '#2962ff', fontSize: 10 }} />;
              }
              if (!d.b) return null;
              const xa = xOf(d.a.date);
              const xb = xOf(d.b.date);
              if (d.type === 'trend') {
                return <ReferenceLine key={d.id} segment={[{ x: xa, y: d.a.price }, { x: xb, y: d.b.price }]} stroke="#2962ff" strokeWidth={1.5} ifOverflow="hidden" />;
              }
              const x0 = Math.min(xa, xb);
              return FIB_LEVELS.map((lv) => {
                const y = d.b!.price + (d.a.price - d.b!.price) * lv;
                return <ReferenceLine key={`${d.id}-${lv}`} segment={[{ x: x0, y }, { x: n - 1, y }]} stroke={lv === 0.5 || lv === 0.618 ? '#e11d48' : '#94a3b8'}
                  strokeWidth={1} ifOverflow="hidden" label={{ value: `${(lv * 100).toFixed(1)}%  ${fmt(y)}`, position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 10 }} />;
              });
            })}
            {pending ? <ReferenceDot x={xOf(pending.date)} y={pending.price} r={4} fill="#2962ff" stroke="var(--background)" strokeWidth={2} ifOverflow="hidden" /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {layout.volume ? (
        <Pane title="Volume" syncId={`study-${symbol}`} rows={rows} onMove={onMove} xAxis={xAxis(true)} cursor={cursor}
          yFmt={(v) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}
          body={<RBar dataKey="v" isAnimationActive={false} shape={(p: any) => <rect x={p.x} y={p.y} width={Math.max(1, p.width)} height={Math.max(0, p.height)} fill={p.payload?.up ? UP : DOWN} fillOpacity={0.55} />} />} />
      ) : null}
      {layout.rsi ? (
        <Pane title="RSI (14)" syncId={`study-${symbol}`} rows={rows} onMove={onMove} xAxis={xAxis(true)} cursor={cursor} domain={[0, 100]} ticks={[30, 50, 70]}
          body={<>
            <ReferenceLine y={70} stroke={DOWN} strokeDasharray="3 3" strokeOpacity={0.6} />
            <ReferenceLine y={30} stroke={UP} strokeDasharray="3 3" strokeOpacity={0.6} />
            <Line dataKey="rsi" stroke="#7e57c2" strokeWidth={1.4} dot={false} isAnimationActive={false} />
          </>} readout={Number.isFinite(hoverRow.rsi) ? hoverRow.rsi.toFixed(1) : '—'} />
      ) : null}
      {layout.macd ? (
        <Pane title="MACD (12, 26, 9)" syncId={`study-${symbol}`} rows={rows} onMove={onMove} xAxis={xAxis(true)} cursor={cursor}
          body={<>
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <RBar dataKey="hist" isAnimationActive={false} shape={(p: any) => <rect x={p.x} y={Math.min(p.y, p.y + p.height)} width={Math.max(1, p.width)} height={Math.abs(p.height)} fill={(p.payload?.hist ?? 0) >= 0 ? UP : DOWN} fillOpacity={0.5} />} />
            <Line dataKey="macd" stroke="#2962ff" strokeWidth={1.3} dot={false} isAnimationActive={false} />
            <Line dataKey="sig" stroke="#ff9800" strokeWidth={1.3} dot={false} isAnimationActive={false} />
          </>} readout={Number.isFinite(hoverRow.macd) ? `${hoverRow.macd.toFixed(2)} · signal ${Number.isFinite(hoverRow.sig) ? hoverRow.sig.toFixed(2) : '—'}` : '—'} />
      ) : null}

      {drawings.length ? (
        <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Your drawings on this chart">
          {drawings.map((d) => (
            <li key={d.id} className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-micro text-muted-foreground">
              {d.type === 'hline' ? `Line at ${fmt(d.a.price)}` : d.type === 'trend' ? `Trend ${label(d.a.date)} → ${label(d.b!.date)}` : `Fibonacci ${fmt(d.a.price)} → ${fmt(d.b!.price)}`}
              <button type="button" aria-label="Delete this drawing" onClick={() => saveDrawings(drawings.filter((x) => x.id !== d.id))}
                className="rounded-full p-0.5 hover:bg-accent hover:text-down"><X className="size-3" /></button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- a study pane under the price ------------------------------------------------------------- */

function Pane({ title, rows, body, xAxis, syncId, onMove, cursor, domain, ticks, yFmt, readout }: {
  title: string; rows: any[]; body: React.ReactNode; xAxis: React.ReactNode; syncId: string; onMove: (s: any) => void; cursor: any;
  domain?: [number, number]; ticks?: number[]; yFmt?: (v: number) => string; readout?: string;
}) {
  return (
    <div className="border-t border-border pt-1">
      <div className="flex items-center gap-2 text-micro text-muted-foreground"><b className="font-semibold">{title}</b>{readout ? <span className="tnum">{readout}</span> : null}</div>
      <div style={{ height: 96 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={MARGIN} syncId={syncId} onMouseMove={onMove}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={0.5} />
            {xAxis}
            <YAxis orientation="right" width={AXIS_W} domain={domain || ['auto', 'auto']} ticks={ticks} axisLine={false} tickLine={false}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={yFmt || ((v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)))} />
            <Tooltip content={() => null} cursor={cursor} isAnimationActive={false} />
            {body}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- which studies ------------------------------------------------------------------------------ */

function PeriodsField({ label: text, value, onChange }: { label: string; value: number[]; onChange: (v: number[]) => void }) {
  const [draft, setDraft] = React.useState(value.join(', '));
  React.useEffect(() => setDraft(value.join(', ')), [value.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => onChange([...new Set(draft.split(/[\s,;]+/).map(Number).filter((x) => Number.isInteger(x) && x >= 2 && x <= 400))].slice(0, 4));
  return (
    <label className="grid gap-1 text-tiny">
      <span className="font-semibold">{text}</span>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        placeholder="e.g. 20, 50, 200 — empty for none" aria-label={`${text} periods`}
        className="h-8 rounded-md border border-border bg-muted px-2 text-13 tnum" />
    </label>
  );
}

function StudiesMenu({ layout, setLayout }: { layout: Layout; setLayout: (p: Partial<Layout>) => void }) {
  const check = (key: 'bollinger' | 'volume' | 'rsi' | 'macd', text: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-13">
      <input type="checkbox" checked={layout[key]} onChange={(e) => setLayout({ [key]: e.target.checked } as Partial<Layout>)} className="size-4 accent-[var(--primary)]" />
      {text}
    </label>
  );
  const count = layout.sma.length + layout.ema.length + ['bollinger', 'volume', 'rsi', 'macd'].filter((k) => (layout as any)[k]).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-tiny font-semibold hover:bg-accent">
          <SlidersHorizontal className="size-3.5" />Studies<span className="rounded-full bg-accent px-1.5 text-[10px] tnum">{count}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-72 gap-3 p-3">
        <PeriodsField label="Simple moving averages" value={layout.sma} onChange={(v) => setLayout({ sma: v })} />
        <PeriodsField label="Exponential moving averages" value={layout.ema} onChange={(v) => setLayout({ ema: v })} />
        <div className="grid gap-1.5 border-t border-border pt-3">
          {check('bollinger', 'Bollinger bands (20, 2)')}
          {check('volume', 'Volume')}
          {check('rsi', 'RSI (14)')}
          {check('macd', 'MACD (12, 26, 9)')}
        </div>
        <p className="text-micro text-muted-foreground">Kept in this browser, and applied to every company you open. Up to four periods per average.</p>
      </PopoverContent>
    </Popover>
  );
}
