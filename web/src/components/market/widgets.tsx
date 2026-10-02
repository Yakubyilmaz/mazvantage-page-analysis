'use client';

/* ==========================================================================
   The Market Data widgets

   Port of the legacy `markethub-widgets.js`: small, source-driven blocks the
   hub, the stock boards, the economy pages and Home share.

     CalendarStrip          earnings or IPO cards on a filmstrip
     EconomicReleaseCards   the release calendar as cards on the same strip
     EconomicCalendar       every release as a table, one rule per new day
     EconomicIndicators     one card per series: the reading, a sparkline, the date
     YieldCurve             US Treasury yields by maturity

   Nothing here fetches. Every widget says why it is empty rather than
   drawing a blank box.
   ========================================================================== */

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { logoUrl } from '@/lib/fmp';
import { niceDomain, ticksOf } from '@/lib/chart-scale';
import { RechartsTip } from '@/components/charts/chart-tip';
import { CountryFlag } from '@/components/market/market-ui';
import { cn } from '@/lib/cn';

const DASH = '—';

/* ---------- reading the vendor's rows -------------------------------------- */

export function toNumber(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function display(value: unknown, { decimals = 2, fixed = false, compact = false } = {}): string {
  if (value == null || value === '') return DASH;
  const n = toNumber(value);
  if (n == null) return String(value);
  return n.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: fixed ? decimals : 0,
    ...(compact && Math.abs(n) >= 1e6 ? { notation: 'compact' as const } : {}),
  });
}

/** The first of several field spellings the row carries. */
export const first = (row: any, keys: string[]) => keys.map((k) => row?.[k]).find((v) => v != null && v !== '') ?? null;

export function dateLabel(value: unknown, options: Intl.DateTimeFormatOptions = {}): string {
  if (!value) return DASH;
  const dateOnly = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const date = new Date(dateOnly ? `${dateOnly}T12:00:00Z` : String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC', ...options,
  });
}

/** Today and tomorrow by name, everything else by its date. */
function dayLabel(value: unknown, now = new Date()): string {
  const day = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return dateLabel(value, { weekday: 'short' });
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 864e5).toISOString().slice(0, 10);
  if (day === today) return 'Today';
  if (day === tomorrow) return 'Tomorrow';
  return dateLabel(day, { weekday: 'short' });
}

function releaseTime(row: any): string {
  const explicit = first(row, ['time', 'releaseTime']);
  if (explicit) return String(explicit);
  return String(first(row, ['date', 'datetime', 'eventDate']) || '').match(/[T ](\d{2}:\d{2})/)?.[1] || DASH;
}

const byDate = (a: any, b: any) => String(first(a, ['date', 'datetime', 'eventDate']) || '')
  .localeCompare(String(first(b, ['date', 'datetime', 'eventDate']) || ''));

/* ---------- small parts ------------------------------------------------------ */

export function WidgetEmpty({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('flex min-h-[164px] flex-col items-center justify-center gap-2 border-y border-border px-5 py-7 text-center text-sm text-muted-foreground', className)}>
      <span aria-hidden="true" className="text-[27px] font-light">{DASH}</span>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

function CompanyMark({ row }: { row: any }) {
  // Initials also cover companies whose listing has no provider logo.
  const symbol = String(first(row, ['symbol', 'ticker']) || '');
  const name = String(first(row, ['name', 'company', 'companyName']) || symbol || '?');
  const letters = (symbol || name).replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();
  const source = row.image || (symbol ? logoUrl(symbol) : null);
  const [failed, setFailed] = React.useState(false);
  return (
    <span aria-hidden="true" className="relative inline-flex size-9 flex-none items-center justify-center overflow-hidden rounded-full bg-primary/10 text-tiny font-bold tracking-[-.4px] text-primary">
      {letters}
      {source && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 size-full bg-white object-contain" />
      ) : null}
    </span>
  );
}

/** The vendor's impact rating as three bars; high is lit amber. */
export function Impact({ value }: { value: unknown }) {
  const level = ({ low: 1, medium: 2, moderate: 2, high: 3, 1: 1, 2: 2, 3: 3 } as Record<string, number>)[String(value ?? '').toLowerCase()];
  if (!level) return <span>{value ? String(value) : DASH}</span>;
  const word = ['', 'Low', 'Medium', 'High'][level];
  return (
    <span role="img" aria-label={`${word} impact`} title={`${word} impact`} className="inline-flex h-3.5 items-end gap-[3px]">
      {[1, 2, 3].map((i) => (
        <i key={i} className={cn('inline-block w-[3px] rounded-[1px]', i === 1 ? 'h-1.5' : i === 2 ? 'h-2.5' : 'h-3.5',
          i <= level ? (level === 3 ? 'bg-[#f59a23]' : 'bg-muted-foreground') : 'bg-border')} />
      ))}
    </span>
  );
}

/* ---------- the filmstrip ------------------------------------------------------ */

/* The strip every calendar on the canvas rides on: cards that scroll under two
   arrows and one link. Earnings, IPOs and economic releases carry different
   cards and the same behaviour, which is why the behaviour lives here once. */
const CARD = 'flex-[0_0_calc((100%-64px)/5)] min-w-[210px] snap-start overflow-hidden rounded-xl border border-border bg-background '
  + 'max-[1100px]:basis-[calc((100%-32px)/3)] max-[760px]:basis-[calc((100%-16px)/2)] max-[480px]:basis-[78%] max-[480px]:min-w-[225px]';

function Filmstrip({ children, label, onAll }: { children: React.ReactNode; label: string; onAll?: () => void }) {
  const strip = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ prev: false, next: false });
  const update = React.useCallback(() => {
    const s = strip.current;
    if (!s) return;
    setEdges({ prev: s.scrollLeft > 2, next: s.scrollLeft + s.clientWidth < s.scrollWidth - 2 });
  }, []);
  React.useEffect(() => {
    const s = strip.current;
    if (!s) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(s);
    return () => ro.disconnect();
  }, [update]);
  const move = (dir: 1 | -1) => {
    const s = strip.current;
    if (!s) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.scrollBy({ left: dir * Math.max(260, s.clientWidth * 0.8), behavior: reduce ? 'instant' : 'smooth' });
  };
  const arrow = 'inline-flex size-[35px] items-center justify-center rounded-full border border-border hover:bg-accent disabled:cursor-default disabled:opacity-30';
  return (
    <div className="min-w-0">
      <div ref={strip} tabIndex={0} role="region" aria-label={label} onScroll={update}
        onKeyDown={(e) => {
          if (e.target !== strip.current || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
          e.preventDefault();
          move(e.key === 'ArrowRight' ? 1 : -1);
        }}
        className="flex snap-x snap-proximity gap-4 overflow-x-auto overscroll-x-contain px-px pb-2.5 pt-0.5 scroll-none">
        {children}
      </div>
      <div className="flex items-center justify-between pt-2.5">
        <div className="flex gap-2">
          <button type="button" aria-label="Previous calendar events" disabled={!edges.prev} onClick={() => move(-1)} className={arrow}><ChevronLeft className="size-5" /></button>
          <button type="button" aria-label="Next calendar events" disabled={!edges.next} onClick={() => move(1)} className={arrow}><ChevronRight className="size-5" /></button>
        </div>
        {onAll ? (
          <button type="button" onClick={onAll} className="inline-flex items-center gap-1 py-2 pl-3 text-13 font-semibold text-primary hover:underline">
            See all<ChevronRight className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- earnings and IPOs ---------------------------------------------------- */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-[15px] font-semibold tnum [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function CalendarCard({ row, kind, onSymbol }: { row: any; kind: string; onSymbol?: (symbol: string, row: any) => void }) {
  const ipo = kind === 'ipo' || kind === 'ipos';
  const symbol = first(row, ['symbol', 'ticker']);
  const company = first(row, ['name', 'company', 'companyName']) || symbol || 'Company name unavailable';
  const time = first(row, ['time', 'timeOfDay']);
  const timeLabel = ({ bmo: 'Before open', amc: 'After close', dmh: 'During market hours' } as Record<string, string>)[String(time).toLowerCase()] || time;
  const date = first(row, ['date', 'ipoDate', 'filingDate']);
  const body = (
    <>
      <div className="flex min-h-[33px] flex-col gap-1 text-tiny font-semibold leading-tight">
        <time dateTime={date || undefined}>{dateLabel(date, { weekday: 'short' })}</time>
        {timeLabel ? <span className="text-micro font-normal text-muted-foreground">{timeLabel}</span> : null}
      </div>
      <div className="flex min-w-0 items-center gap-[11px]">
        <CompanyMark row={row} />
        <div className="grid min-w-0 gap-1">
          <strong className="truncate text-[17px] font-[650] leading-tight">{symbol || company}</strong>
          <span className="block truncate text-micro leading-snug text-muted-foreground" title={company}>{company}</span>
        </div>
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-3">
        {ipo ? (
          <>
            <Metric label="Price" value={display(first(row, ['priceRange', 'price', 'ipoPrice']))} />
            <Metric label="Shares" value={display(first(row, ['shares', 'sharesOffered', 'numberOfShares']), { compact: true })} />
          </>
        ) : (
          <>
            <Metric label="EPS estimate" value={display(first(row, ['epsEstimated', 'epsEstimate', 'estimatedEps']), { fixed: true })} />
            <Metric label="EPS actual" value={display(first(row, ['epsActual', 'eps', 'actualEps']), { fixed: true })} />
          </>
        )}
      </dl>
    </>
  );
  const inner = 'flex size-full min-h-[202px] flex-col gap-[23px] px-[18px] pb-[18px] pt-[19px] text-left';
  return (
    <article className={CARD}>
      {symbol && onSymbol ? (
        <button type="button" aria-label={`${company} (${symbol}), ${dateLabel(date)}. View company`} onClick={() => onSymbol(symbol, row)}
          className={cn(inner, 'hover:bg-foreground/[.03] focus-visible:-outline-offset-[3px]')}>{body}</button>
      ) : <div className={inner}>{body}</div>}
    </article>
  );
}

/** Horizontal earnings or IPO calendar; callbacks receive the vendor's symbols. */
export function CalendarStrip({ rows, kind = 'earnings', onSymbol, onAll }: {
  rows: any[] | null | undefined; kind?: string; onSymbol?: (symbol: string, row: any) => void; onAll?: () => void;
}) {
  const items = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const ipo = kind === 'ipo' || kind === 'ipos';
  if (!items.length) return <WidgetEmpty>{ipo ? 'No upcoming IPOs are available for this period.' : 'No earnings releases are available for this period.'}</WidgetEmpty>;
  return (
    <Filmstrip label={ipo ? 'IPO calendar' : 'Earnings calendar'} onAll={onAll}>
      {items.map((row, i) => <CalendarCard key={`${first(row, ['symbol', 'ticker'])}-${i}`} row={row} kind={kind} onSymbol={onSymbol} />)}
    </Filmstrip>
  );
}

/* ---------- economic releases ------------------------------------------------------ */

function ReleaseCard({ row }: { row: any }) {
  const date = first(row, ['date', 'datetime', 'eventDate']);
  const country = first(row, ['country', 'countryCode']);
  const event = first(row, ['event', 'name', 'title']) || 'Economic release';
  const unit = row.unit && row.unit !== 'N/A' ? String(row.unit) : '';
  const actual = first(row, ['actual', 'actualValue']);
  // A percentage hugs its number the way a release quotes it; every other unit is a word after one.
  const text = (v: unknown) => (v == null || v === '' ? DASH : `${display(v, { compact: true })}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`);
  const stat = (label: string, value: string, strong = false) => (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-micro text-muted-foreground">{label}</dt>
      <dd className={cn('truncate tnum', strong ? 'text-[15px] font-[650]' : 'text-13')}>{value}</dd>
    </div>
  );
  return (
    <article className={CARD}>
      <div className="flex size-full min-h-[202px] flex-col gap-[23px] px-[18px] pb-[18px] pt-[19px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-baseline gap-[7px] text-tiny font-semibold">
            <time dateTime={String(date || '').slice(0, 10) || undefined}>{dayLabel(date)}</time>
            <span className="text-micro font-normal text-muted-foreground">{releaseTime(row)}</span>
          </div>
          <Impact value={first(row, ['impact', 'importance'])} />
        </div>
        <div className="-mt-2 flex min-w-0 items-start gap-2.5">
          <CountryFlag code={country} className="mt-0.5 [&_img]:h-[17px] [&_img]:w-6" />
          <strong className="line-clamp-2 text-[15px] font-semibold leading-[1.35]" title={`${event}${country ? ` · ${country}` : ''}`}>{event}</strong>
        </div>
        {/* Actual first and lit, the way a release is read: the number that
            moved the market, then what it was measured against. */}
        <dl className="mt-auto grid gap-[7px]">
          {stat('Actual', text(actual), actual != null && actual !== '')}
          {stat('Forecast', text(first(row, ['estimate', 'consensus', 'forecast', 'estimated'])))}
          {stat('Prior', text(first(row, ['previous', 'previousValue', 'prev'])))}
        </dl>
      </div>
    </article>
  );
}

/**
 * The release calendar as cards. `limit` caps the strip; `onAll` is the way to
 * the full table, which is where a reader comparing a hundred releases belongs.
 */
export function EconomicReleaseCards({ rows, limit = 18, onAll }: { rows: any[] | null | undefined; limit?: number; onAll?: () => void }) {
  const items = (Array.isArray(rows) ? rows : []).filter(Boolean).sort(byDate);
  if (!items.length) return <WidgetEmpty>No economic releases are available for this period.</WidgetEmpty>;
  return (
    <Filmstrip label="Economic calendar" onAll={onAll}>
      {items.slice(0, limit).map((row, i) => <ReleaseCard key={i} row={row} />)}
    </Filmstrip>
  );
}

/** Every release as a compact table, with a heavier rule where a new day starts. */
export function EconomicCalendar({ rows }: { rows: any[] | null | undefined }) {
  const items = (Array.isArray(rows) ? rows : []).filter(Boolean).sort(byDate);
  if (!items.length) return <WidgetEmpty>No economic releases are available for this period.</WidgetEmpty>;
  const cell = 'border-b border-border px-3.5 py-[15px] text-left align-middle first:pl-0 last:pr-0 max-[1100px]:px-2.5';
  const num = 'text-right whitespace-nowrap';
  let prior = '';
  return (
    <div className="min-w-0">
      <div tabIndex={0} role="region" aria-label="Economic calendar table" className="w-full overflow-x-auto overscroll-x-contain scroll-thin">
        <table className="w-full border-collapse text-13 leading-[1.45] tnum">
          <caption className="sr-only">Economic releases. Times are shown as published.</caption>
          <thead>
            <tr>
              {['Date', 'Time', 'Country', 'Event', 'Actual', 'Forecast', 'Previous', 'Impact'].map((h, i) => (
                <th key={h} scope="col" className={cn(cell, 'whitespace-nowrap pb-[13px] pt-0 text-micro font-medium text-muted-foreground', i >= 4 && i <= 6 && num, i === 7 && 'text-center')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => {
              const date = first(row, ['date', 'datetime', 'eventDate']);
              const day = String(date || '').slice(0, 10);
              const newDay = !!prior && prior !== day;
              prior = day;
              const unit = row.unit && row.unit !== 'N/A' ? String(row.unit) : '';
              const value = (v: unknown) => `${display(v, { compact: true })}${v != null && v !== '' && unit ? ` ${unit}` : ''}`;
              const rule = newDay ? 'border-t-2 border-t-border' : '';
              return (
                <tr key={i} className="hover:bg-foreground/[.02]">
                  <td className={cn(cell, rule, 'w-[79px] whitespace-nowrap text-muted-foreground')}><time dateTime={day || undefined}>{dateLabel(date)}</time></td>
                  <td className={cn(cell, rule, 'w-16 whitespace-nowrap text-muted-foreground')}>{releaseTime(row)}</td>
                  <td className={cn(cell, rule, 'w-[68px] whitespace-nowrap text-muted-foreground')}>{first(row, ['country', 'countryCode']) || DASH}</td>
                  <th scope="row" className={cn(cell, rule, 'min-w-[230px] font-[550]')}>{first(row, ['event', 'name', 'title']) || 'Economic release'}</th>
                  <td className={cn(cell, rule, num, 'font-semibold')}>{value(first(row, ['actual', 'actualValue']))}</td>
                  <td className={cn(cell, rule, num)}>{value(first(row, ['estimate', 'consensus', 'forecast', 'estimated']))}</td>
                  <td className={cn(cell, rule, num)}>{value(first(row, ['previous', 'previousValue', 'prev']))}</td>
                  <td className={cn(cell, rule, 'w-[47px] text-center')}><Impact value={first(row, ['impact', 'importance'])} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-[15px] text-micro leading-normal text-muted-foreground">Release times are shown as published. All values reflect the latest available release.</p>
    </div>
  );
}

/* ---------- indicator cards ---------------------------------------------------------- */

export interface IndicatorCard {
  key?: string;
  name?: string;
  symbol?: string;
  country?: string;
  note?: string;
  value?: unknown;
  display?: React.ReactNode;
  unit?: string;
  history?: ({ date?: string; value: unknown } | number)[];
  change?: { text: string; direction?: 'is-up' | 'is-down' | string } | null;
  date?: string | null;
  dateText?: string;
}

/* A macro series has no good direction — unemployment up is not a green
   day — so the line is the canvas blue, never up/down coloured. */
function IndicatorSpark({ history }: { history: IndicatorCard['history'] }) {
  const points = (Array.isArray(history) ? history : [])
    .map((r) => (typeof r === 'number' ? { value: r } : r))
    .filter((r): r is { date?: string; value: unknown } => !!r && toNumber(r.value) != null)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (points.length < 2) return null;
  const data = points.map((p, i) => ({ i, v: toNumber(p.value) }));
  const vals = data.map((d) => d.v as number);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return (
    <div aria-hidden="true" className="h-10 w-[120px] min-w-[55px] flex-[0_1_120px] max-[1100px]:w-[85px] max-[1100px]:basis-[85px] max-[480px]:mb-3 max-[480px]:h-[30px] max-[480px]:w-full max-[480px]:basis-full">
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={hi === lo ? [lo - 1, hi + 1] : [lo, hi]} />
          <XAxis hide dataKey="i" />
          <Line type="linear" dataKey="v" stroke="var(--primary)" strokeWidth={1.8} dot={false} activeDot={false} isAnimationActive={false} />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One card per series. Country-specific: never infer world coverage from US data. */
export function EconomicIndicators({ rows, className }: { rows: IndicatorCard[] | null | undefined; className?: string }) {
  const items = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (!items.length) return <WidgetEmpty>Economic indicators are currently unavailable.</WidgetEmpty>;
  return (
    <div className={cn('grid grid-cols-3 gap-x-10 max-[1100px]:gap-x-6 max-[760px]:grid-cols-2 max-[480px]:gap-x-5', className)}>
      {items.map((row, i) => {
        const unit = row.unit || '';
        return (
          <article key={row.key || row.name || i} className="min-w-0 border-b border-border pb-[22px] pt-6 max-[480px]:py-5">
            <div className="flex items-baseline justify-between gap-2.5">
              <h3 className="text-sm font-semibold leading-[1.45] max-[480px]:text-tiny">{row.name || row.symbol || 'Economic indicator'}</h3>
              {row.country ? <span className="text-micro text-muted-foreground">{row.country}</span> : null}
            </div>
            {row.note ? <p className="mt-[5px] text-micro leading-normal text-muted-foreground">{row.note}</p> : null}
            <div className="flex min-h-[69px] items-center justify-between gap-3 max-[480px]:flex-wrap max-[480px]:gap-0">
              <p className="my-2.5 whitespace-nowrap text-[30px] font-semibold leading-tight tracking-[-1px] tnum max-[1100px]:text-[27px] max-[480px]:w-full max-[480px]:text-[28px]">
                {row.display != null ? row.display : display(row.value)}
                {unit ? (unit === '%'
                  ? <span className="ml-0.5 text-xl tracking-[-.4px]">%</span>
                  : <span className="mt-[3px] block text-micro font-normal tracking-normal text-muted-foreground">{unit}</span>) : null}
              </p>
              <IndicatorSpark history={row.history} />
            </div>
            {row.change ? (
              <p className={cn('mb-1 text-tiny tnum text-muted-foreground', row.change.direction === 'is-up' && 'text-up', row.change.direction === 'is-down' && 'text-down')}>{row.change.text}</p>
            ) : null}
            <time dateTime={row.date || undefined} className="block text-micro leading-normal text-muted-foreground max-[480px]:text-[10px]">
              {row.dateText || (row.date ? `Latest release · ${dateLabel(row.date, { year: 'numeric' })}` : 'Release date unavailable')}
            </time>
          </article>
        );
      })}
    </div>
  );
}

/* ---------- the yield curve ------------------------------------------------------------ */

/** Treasury yields are percentage points: a value of 4.25 is displayed as 4.25%. */
export function YieldCurve({ rows, height = 300 }: { rows: { label?: string; months?: number; value: unknown; date?: string }[] | null | undefined; height?: number }) {
  const points = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && toNumber(r.value) != null)
    .map((r) => ({ ...r, value: toNumber(r.value) as number, label: String(r.label || `${r.months}M`) }));
  if (!points.length) return <WidgetEmpty>Treasury yield data is currently unavailable.</WidgetEmpty>;
  if (points.every((r) => toNumber(r.months) != null)) points.sort((a, b) => (a.months as number) - (b.months as number));

  const vals = points.map((p) => p.value);
  const span = Math.max(Math.max(...vals) - Math.min(...vals), 0.5);
  const dom = niceDomain(Math.min(...vals) - span * 0.12, Math.max(...vals) + span * 0.12, 4);
  const fmt = (v: number) => `${display(Math.abs(v) < 1e-9 ? 0 : v, { decimals: 2 })}%`;
  const date = points.find((p) => p.date)?.date;

  return (
    <div className="min-w-0 pt-2 max-[480px]:overflow-x-auto">
      <div role="img" aria-label={`US Treasury yield curve. ${points.map((p) => `${p.label}: ${display(p.value)} percent`).join('; ')}`} className="max-[480px]:min-w-[520px]">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={points} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} interval={0} height={30} />
            <YAxis orientation="right" domain={[dom.lo, dom.hi]} ticks={ticksOf(dom)} tickFormatter={fmt}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={60} />
            <Tooltip content={(p: any) => <RechartsTip {...p} valueFmt={(v: number) => `${display(v, { fixed: true })}%`} names={false} />} />
            <Area type="linear" dataKey="value" name="Yield" stroke="var(--primary)" strokeWidth={2.5} fill="var(--primary)" fillOpacity={0.055}
              isAnimationActive={false} dot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--background)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between gap-4 pt-[9px] text-tiny text-muted-foreground max-[760px]:items-start max-[760px]:text-micro">
        <span className="inline-flex items-center gap-2"><i aria-hidden="true" className="inline-block size-2 rounded-full bg-primary" />U.S. Treasury yield</span>
        <span>{date ? `As of ${dateLabel(date, { year: 'numeric' })} · Maturity` : 'Maturity'}</span>
      </div>
    </div>
  );
}
