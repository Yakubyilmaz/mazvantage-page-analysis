'use client';

/* ==========================================================================
   The market chart — every market page and the stock page draw this one.

   Eight ranges, area or candlesticks, a crosshair that rewrites the header
   with the bar under the pointer (open/high/low/close where the feed has
   them), arrow-key inspection, a last-price badge, and an expanded view. All
   plotted observations come from FMP; a plan with closes but no OHLC history
   gets the area chart and a disabled candlestick button that says why.
   ========================================================================== */

import * as React from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
} from 'recharts';
import { Maximize2, Minimize2 } from 'lucide-react';
import { fetchFor, getApiKey, type FeedResult } from '@/lib/fmp';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useDataEpoch } from '@/components/providers';
import { cn } from '@/lib/cn';

export const RANGES = ['1D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'ALL'] as const;
export type Range = (typeof RANGES)[number];

export interface ChartMeta {
  symbol: string;
  name?: string;
  shortName?: string;
  kind?: string;
  currency?: string;
  quote?: { price?: number | null; previousClose?: number | null };
  onOpen?: (symbol: string) => void;
}

interface Row { date: string; startDate?: string; close: number; open: number | null; high: number | null; low: number | null }

const finite = (v: unknown) => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v));
const num = (v: unknown) => (finite(v) ? Number(v) : null);
const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export function startFor(range: string): string {
  const date = new Date();
  if (range === 'ALL') return '1970-01-01';
  if (range === '1D') date.setUTCDate(date.getUTCDate() - 7);
  else if (range === 'YTD') date.setUTCMonth(0, 1);
  else if (range.endsWith('M')) date.setUTCMonth(date.getUTCMonth() - Number(range.slice(0, -1)));
  else date.setUTCFullYear(date.getUTCFullYear() - Number(range.slice(0, -1)));
  return dateKey(date);
}

/** FMP can return either a flat list or its older historical envelope. */
export function observations(payload: any): Row[] {
  const list = Array.isArray(payload) ? payload : payload?.historical || [];
  const byDate = new Map<string, Row>();
  for (const row of list) {
    const date = String(row.date || row.datetime || '');
    const close = num(row.close ?? row.price);
    if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(date) || close === null) continue;
    byDate.set(date, { date, close, open: num(row.open), high: num(row.high), low: num(row.low) });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function dateLabel(value: string, intraday = false, full = false): string {
  if (intraday && !full) return value.slice(11, 16);
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  const label = date.toLocaleDateString('en-US', full
    ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return intraday && full ? `${label}, ${value.slice(11, 16)}` : label;
}

const hasOHLC = (r: Row) => [r.open, r.high, r.low, r.close].every((v) => Number.isFinite(v as number));

function combineCandles(rows: Row[], count: number): Row[] {
  if (rows.length <= count) return rows;
  const size = Math.ceil(rows.length / count);
  const out: Row[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    out.push({
      date: chunk[chunk.length - 1].date, startDate: chunk[0].date,
      open: chunk[0].open, close: chunk[chunk.length - 1].close,
      high: Math.max(...chunk.map((r) => r.high as number)), low: Math.min(...chunk.map((r) => r.low as number)),
    });
  }
  return out;
}

/* One cache for every chart on the page: a wider, previously fetched daily
   window is reused when a reader zooms in, for ten minutes, per key. */
const LOCAL = new Map<string, { symbol: string; intraday: boolean; from: string; to: string; response: FeedResult; at: number; key: string }>();

async function loadHistory(symbol: string, range: Range): Promise<{ result: FeedResult; rows: Row[] }> {
  const from = startFor(range);
  const to = dateKey(new Date());
  const intraday = range === '1D';
  const credential = getApiKey();
  const hit = [...LOCAL.values()].find((e) => e.symbol === symbol && e.intraday === intraday && e.from <= from && e.to === to
    && e.key === credential && Date.now() - e.at < 600000);
  let response = hit?.response;
  try {
    if (!response) {
      response = await fetchFor(intraday ? 'marketIntraday' : 'marketHistory', symbol, { from, to });
      // Some FMP plans expose closes, but no full OHLC history.
      if (!intraday && response.status !== 'skipped' && (response.status !== 'ok' || !observations(response.data).length)) {
        const fallback = await fetchFor('prices', symbol, { from, to });
        if (fallback.status === 'ok' && observations(fallback.data).length) response = fallback;
      }
      if (response.status === 'ok') LOCAL.set(`${symbol}|${intraday}|${from}|${to}`, { symbol, intraday, from, to, response, at: Date.now(), key: credential });
    }
  } catch {
    response = { status: 'error', data: null, message: 'The history could not be loaded.' };
  }
  let rows = observations(response.data).filter((r) => r.date.slice(0, 10) >= from && r.date.slice(0, 10) <= to);
  if (intraday && rows.length) {
    const latest = rows[rows.length - 1].date.slice(0, 10);
    rows = rows.filter((r) => r.date.startsWith(latest));
  }
  return { result: response, rows };
}

/** A candlestick drawn over a [low, high] range bar: wick first, body on top. */
function Candle(props: any) {
  const { x, width, payload, background } = props;
  if (!payload || !hasOHLC(payload)) return null;
  // Recharts hands the bar's pixel box for [low, high]; map open and close into it.
  const { y, height } = props;
  const lo = payload.low as number;
  const hi = payload.high as number;
  const toY = (v: number) => (hi === lo ? y + height / 2 : y + ((hi - v) / (hi - lo)) * height);
  const up = payload.close >= payload.open;
  const color = up ? '#089981' : '#f23645';
  const bodyW = Math.max(2, Math.min(12, width * 0.67));
  const cx = x + width / 2;
  const top = Math.min(toY(payload.open), toY(payload.close));
  const bodyH = Math.max(1, Math.abs(toY(payload.open) - toY(payload.close)));
  void background;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyW / 2} y={top} width={bodyW} height={bodyH} fill={color} stroke={color} strokeWidth={1} />
    </g>
  );
}

function ChartBody({
  meta, range, setRange, style, setStyle, expanded, onToggleExpand, height,
}: {
  meta: ChartMeta; range: Range; setRange: (r: Range) => void; style: 'area' | 'candles'; setStyle: (s: 'area' | 'candles') => void;
  expanded: boolean; onToggleExpand: () => void; height: number;
}) {
  const { epoch } = useDataEpoch();
  const [state, setState] = React.useState<{ loading: boolean; result: FeedResult | null; rows: Row[] }>({ loading: true, result: null, rows: [] });
  const [selected, setSelected] = React.useState(-1);
  const plotRef = React.useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = React.useState(1000);

  React.useEffect(() => {
    let live = true;
    setState({ loading: true, result: null, rows: [] });
    setSelected(-1);
    loadHistory(meta.symbol, range).then((r) => { if (live) setState({ loading: false, ...r }); });
    return () => { live = false; };
  }, [meta.symbol, range, epoch]);

  React.useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPlotWidth(el.clientWidth || 1000));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const records = state.rows;
  const supportsCandles = records.length > 0 && records.every(hasOHLC);
  const effectiveStyle = style === 'candles' && !supportsCandles ? 'area' : style;
  const rows = React.useMemo(() => (effectiveStyle === 'candles'
    ? combineCandles(records, Math.max(30, Math.floor((plotWidth - 96) / 6)))
    : records), [records, effectiveStyle, plotWidth]);

  const format = (value: number | null | undefined) => {
    if (!Number.isFinite(value as number)) return '—';
    const v = value as number;
    const decimals = meta.kind === 'forex' || (Math.abs(v) > 0 && Math.abs(v) < 1) ? 4 : 2;
    return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const intraday = range === '1D';
  const row = selected >= 0 ? rows[selected] : null;
  const first = records[0]?.close;
  const last = row?.close ?? records[records.length - 1]?.close;
  const value = row?.close ?? records[records.length - 1]?.close ?? num(meta.quote?.price);
  const delta = Number.isFinite(first) && Number.isFinite(last) ? (last as number) - (first as number) : null;
  const percent = delta !== null && first ? (delta / Math.abs(first)) * 100 : null;

  let detail: React.ReactNode = ' ';
  if (row) {
    const date = row.startDate && row.startDate !== row.date
      ? `${dateLabel(row.startDate, intraday, true)} – ${dateLabel(row.date, intraday, true)}` : dateLabel(row.date, intraday, true);
    detail = (
      <>
        <span>{date}</span>
        {hasOHLC(row)
          ? (['open', 'high', 'low', 'close'] as const).map((k) => <span key={k}><i className="not-italic opacity-65">{k[0].toUpperCase()}</i> {format(row[k])}</span>)
          : <span>Close {format(row.close)}</span>}
      </>
    );
  } else if (records.length) {
    detail = `${intraday ? 'Latest session' : range === 'ALL' ? 'All available history' : `${range} performance`} · `
      + `${dateLabel(records[0].date, intraday, true)} – ${dateLabel(records[records.length - 1].date, intraday, true)}`;
  }

  let message: React.ReactNode = null;
  if (records.length < 2) {
    if (state.loading) {
      message = (<><span className="size-[22px] animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" aria-hidden="true" /><span>Loading {meta.name || meta.symbol} history…</span></>);
    } else if (state.result) {
      let copy = intraday ? 'Intraday history is unavailable for this symbol.' : 'Price history is unavailable for this symbol.';
      if (state.result.status === 'gated') copy = `${intraday ? 'Intraday' : 'This price'} history is not available for this symbol.`;
      if (state.result.status === 'skipped') copy = 'This chart is unavailable right now.';
      if (state.result.status === 'error') copy = state.result.message || 'Price history could not be loaded. Try again.';
      if (records.length === 1) copy = 'Only one observation came back for this period. Choose a longer range.';
      message = (
        <>
          <strong className="text-[15px] font-semibold text-foreground">No chart data</strong>
          <span className="max-w-[370px] leading-relaxed">{copy}</span>
          <button type="button" onClick={() => setRange(range)} className="mt-1 rounded-md border border-border px-3.5 py-[7px] text-tiny text-foreground hover:border-muted-foreground">Try again</button>
        </>
      );
    }
  }

  const values = rows.flatMap((r) => (effectiveStyle === 'candles' ? [r.high as number, r.low as number] : [r.close]));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = (max - min || Math.abs(max) * 0.02 || 1) * 0.13;
  const lo = min - pad;
  const hi = max + pad;
  const ticks = [0, 1, 2, 3, 4].map((i) => hi - ((hi - lo) * i) / 4);
  const labelCount = plotWidth < 520 ? 3 : 6;
  const xTicks = rows.length ? [...new Set(Array.from({ length: labelCount }, (_, i) => Math.round((i / (labelCount - 1)) * (rows.length - 1))))] : [];
  const tickLabel = (i: number) => {
    const d = rows[i]?.date;
    if (!d) return '';
    if (['1M', '3M'].includes(range)) return new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return dateLabel(d, intraday);
  };
  const data = rows.map((r, i) => ({ ...r, i, range: [r.low, r.high] }));
  const lastClose = rows[rows.length - 1]?.close;
  const gid = React.useId().replace(/:/g, '');

  const tools = 'inline-flex size-[34px] items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-foreground/[.07] hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent max-sm:size-[29px] max-sm:p-1.5';

  return (
    <div className="w-full min-w-0 tnum">
      <div className="flex items-start justify-between gap-4 px-0.5 pt-[21px] max-sm:gap-2 max-sm:pt-4">
        <div>
          <button type="button" disabled={!meta.onOpen} onClick={() => meta.onOpen?.(meta.symbol)}
            className="text-left text-sm font-semibold leading-normal enabled:hover:text-primary max-sm:text-tiny">
            {meta.name || meta.symbol}{meta.name && meta.name !== meta.symbol ? ` · ${meta.symbol}` : ''}
          </button>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2 max-sm:gap-1.5">
            <span className="text-[29px] font-semibold leading-tight tracking-[-.8px] max-sm:text-2xl">{format(value)}</span>
            <span className="text-tiny text-muted-foreground">{meta.currency || 'USD'}</span>
            {percent !== null ? (
              <span className={cn('ml-1 text-13 font-medium max-sm:ml-0 max-sm:text-micro', (delta as number) < 0 ? 'text-[#f23645]' : 'text-[#089981]')}>
                {(delta as number) >= 0 ? '+' : '−'}{format(Math.abs(delta as number))} ({percent >= 0 ? '+' : '−'}{Math.abs(percent).toFixed(2)}%)
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Chart appearance">
          <button type="button" title="Area chart" aria-label="Area chart" aria-pressed={effectiveStyle === 'area'} onClick={() => setStyle('area')}
            className={cn(tools, effectiveStyle === 'area' && 'bg-foreground/[.07] text-foreground')}>
            <svg viewBox="0 0 24 24" className="size-[19px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l5-6 4 3 8-10M3 21h18" /></svg>
          </button>
          <button type="button" disabled={!supportsCandles} aria-label="Candlestick chart" aria-pressed={effectiveStyle === 'candles'}
            title={supportsCandles ? 'Candlestick chart' : 'OHLC prices are unavailable for this series'} onClick={() => setStyle('candles')}
            className={cn(tools, effectiveStyle === 'candles' && 'bg-foreground/[.07] text-foreground')}>
            <svg viewBox="0 0 24 24" className="size-[19px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v4m0 10v4m10-18v7m0 7v4M4 7h6v10H4zM14 10h6v7h-6z" /></svg>
          </button>
          <button type="button" title={expanded ? 'Close expanded chart' : 'Expand chart'} aria-label={expanded ? 'Close expanded chart' : 'Expand chart'}
            onClick={onToggleExpand} className={tools}>
            {expanded ? <Minimize2 className="size-[18px]" /> : <Maximize2 className="size-[18px]" />}
          </button>
        </div>
      </div>
      <div className="mx-0.5 mt-[7px] flex min-h-7 flex-wrap items-center gap-[13px] text-micro leading-snug text-muted-foreground max-sm:gap-[7px] max-sm:text-[10px]">{detail}</div>

      <div
        ref={plotRef}
        tabIndex={0}
        role="group"
        aria-label={row ? `${meta.name || meta.symbol}, ${dateLabel(row.date, intraday, true)}, ${format(row.close)} ${meta.currency || 'USD'}. Use arrow keys to inspect prices.`
          : 'Price history. Use the left and right arrow keys to inspect prices.'}
        aria-busy={state.loading || undefined}
        className="relative min-w-0 touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-primary"
        style={{ height }}
        onKeyDown={(e) => {
          if (!rows.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return;
          e.preventDefault();
          if (e.key === 'Escape') { setSelected(-1); return; }
          const at = selected < 0 ? rows.length - 1 : selected;
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : at + (e.key === 'ArrowLeft' ? -1 : 1);
          setSelected(Math.max(0, Math.min(rows.length - 1, next)));
        }}
        onBlur={() => setSelected(-1)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows.length >= 2 ? data : []} margin={{ top: 24, right: 0, bottom: 0, left: 8 }}
            onMouseMove={(s: any) => { const i = Number(s?.activeTooltipIndex); if (Number.isFinite(i)) setSelected(i); }}
            onMouseLeave={() => setSelected(-1)}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.015} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={0.65} />
            <XAxis dataKey="i" type="number" domain={[0, Math.max(rows.length - 1, 1)]} ticks={xTicks} tickFormatter={tickLabel}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} height={32} />
            <YAxis orientation="right" domain={[lo, hi]} ticks={ticks} tickFormatter={(v: number) => format(v)} width={Math.min(88, plotWidth * 0.23)}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDataOverflow />
            <Tooltip content={() => null} cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '4 4', strokeWidth: 0.8 }} isAnimationActive={false} />
            {effectiveStyle === 'area' ? (
              <Area type="linear" dataKey="close" stroke="var(--primary)" strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false}
                activeDot={{ r: 4.5, fill: 'var(--primary)', stroke: 'var(--background)', strokeWidth: 2 }} dot={false} />
            ) : (
              <Bar dataKey="range" shape={<Candle />} isAnimationActive={false} />
            )}
            {Number.isFinite(lastClose) ? (
              <ReferenceLine y={lastClose} stroke="var(--primary)" strokeDasharray="3 3" strokeWidth={0.8} strokeOpacity={0.65}
                label={(p: any) => {
                  const vb = p.viewBox || {};
                  const w = Math.min(88, plotWidth * 0.23) - 5;
                  const x0 = (vb.x ?? 0) + (vb.width ?? 0) + 3;
                  return (
                    <g>
                      <rect x={x0} y={(vb.y ?? 0) - 11} width={w} height={22} rx={3} fill="var(--primary)" />
                      <text x={x0 + w / 2} y={(vb.y ?? 0) + 4} textAnchor="middle" fontSize={11} fill="#fff">{format(lastClose)}</text>
                    </g>
                  );
                }} />
            ) : null}
            {row && effectiveStyle === 'candles' ? <ReferenceDot x={selected} y={row.close} r={4.5} fill="var(--primary)" stroke="var(--background)" strokeWidth={2} /> : null}
          </ComposedChart>
        </ResponsiveContainer>
        {message ? (
          <div role="status" aria-live="polite" className="absolute inset-y-0 left-0 right-[85px] flex flex-col items-center justify-center gap-2.5 bg-background/70 p-8 text-center text-tiny text-muted-foreground max-sm:right-[55px] max-sm:p-[18px]">
            {message}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pb-[5px] pt-[13px]">
        <div role="group" aria-label="Chart time range" className="flex gap-[5px] max-sm:w-full max-sm:justify-between max-sm:gap-0">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={r === range} onClick={() => setRange(r)}
              className={cn('rounded-[5px] px-2.5 py-1.5 text-tiny font-medium leading-normal text-muted-foreground hover:bg-foreground/5 hover:text-foreground max-sm:px-2 max-sm:text-micro',
                r === range && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary')}>
              {r}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground opacity-80">
          {records.length
            ? `${intraday ? '5-minute prices' : supportsCandles ? 'Daily prices' : 'Daily close'} · ${dateLabel(records[records.length - 1].date, false, true)}`
            : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * `initialRange` defaults to one session, as TradingView's page does.
 * `height` is the plot's height; the expanded view takes most of the screen.
 */
export function MarketChart({ meta, initialRange = '1D', height = 385, className }: {
  meta: ChartMeta; initialRange?: Range; height?: number; className?: string;
}) {
  const [range, setRangeState] = React.useState<Range>(initialRange);
  const [style, setStyle] = React.useState<'area' | 'candles'>('area');
  const [expanded, setExpanded] = React.useState(false);
  // "Try again" re-requests the same range, so a remount key forces the load.
  const [nonce, setNonce] = React.useState(0);
  const setRange = (r: Range) => { if (r === range) setNonce((n) => n + 1); setRangeState(r); };

  const body = (big: boolean) => (
    <ChartBody key={`${meta.symbol}-${nonce}-${big}`} meta={meta} range={range} setRange={setRange} style={style} setStyle={setStyle}
      expanded={big} onToggleExpand={() => setExpanded((v) => !v)} height={big ? Math.min(700, typeof window !== 'undefined' ? window.innerHeight * 0.68 : 600) : height} />
  );

  return (
    <div className={className}>
      {expanded ? (
        <div className="grid place-items-center text-13 text-muted-foreground" style={{ height: height + 150 }}>Chart open in the expanded view.</div>
      ) : body(false)}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent hideClose className="w-[min(1450px,calc(100vw-64px))] max-w-none px-[26px] py-5 max-sm:w-[calc(100vw-20px)] max-sm:p-2.5">
          <DialogTitle className="sr-only">{meta.name || meta.symbol} expanded chart</DialogTitle>
          {expanded ? body(true) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
