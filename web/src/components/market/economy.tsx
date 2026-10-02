'use client';

/* ==========================================================================
   The Economy blocks

   Port of the legacy `economy-chart.js`, `economy-us.js`,
   `economy-country.js` and `economy-maps.js`:

     EconomyIndicators   a rail of US series above one chart of the chosen one
     UsEconomy           the United States indicator board, by group
     CountryEconomy      another country's board, read off its release calendar
     EconomyMaps         GDP growth and inflation on world maps (GeoChart)

   FMP's `economic-indicators` feed is a US dataset — there is no equivalent
   series for any other country — which is why the chart and the board are
   labelled United States whichever country the picker holds, and why another
   country gets its release calendar read as a board instead.

   **What a range costs.** The feed answers one series per request and clips
   any window wider than ninety days — asking for ten years does not fail, it
   silently returns the last quarter — so history is bought a window at a
   time. A range states its arithmetic before it is clicked, and the chart
   opens on the widest range already paid for, so arriving spends nothing.
   Every plotted point is an observation FMP returned; nothing is interpolated.
   ========================================================================== */

import * as React from 'react';
import { Chart as GoogleChart } from 'react-google-charts';
import {
  CartesianGrid, Line, LineChart as RLineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Maximize2, Minimize2 } from 'lucide-react';
import { isNum } from '@/lib/format';
import { US_INDICATORS, US_INDICATOR_GROUPS, INDICATOR_WINDOW_DAYS, indicatorSpan } from '@/lib/markethub-data';
import {
  INDICATOR_RANGES, indicatorValue, periodOf, releaseAgainst, releaseDate, releaseMovement, reading, requestNote,
  usMovement, windowsFor, type IndicatorRange, type Point, type SeriesEntry,
} from '@/lib/economy-format';
import { number } from '@/lib/market-format';
import { EconomicIndicators, dateLabel, type IndicatorCard } from '@/components/market/widgets';
import { ConsentPanel } from '@/components/market/canvas';
import { Carousel, CountryFlag } from '@/components/market/market-ui';
import { TipBox } from '@/components/charts/chart-tip';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

export type SeriesMap = Map<string, SeriesEntry>;
export type LoadRange = (name: string, windows: number, onProgress: (done: number, total: number) => void) =>
  Promise<{ status: string; points: Point[]; windows: number; message?: string }>;

/** The block heading these four share (`.em-heading`): a title and its scope. */
function EmHeading({ title, scope, children }: { title: React.ReactNode; scope?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 className="text-[26px] font-bold max-sm:text-[22px]">{title}</h2>
      {children || (scope ? <span className="rounded-full bg-accent px-2.5 py-1 text-micro font-medium text-muted-foreground">{scope}</span> : null)}
    </div>
  );
}

/* ==========================================================================
   The indicator chart
   ========================================================================== */

const at = (date: string) => new Date(`${String(date).slice(0, 10)}T12:00:00Z`);
const daysBetween = (a: string, b: string) => Math.abs(+at(b) - +at(a)) / 864e5;

/** Axis dates: years over a long run, months over a short one, days for weeks. */
function axisLabel(date: string, span: number, step?: string) {
  const when = at(date);
  if (Number.isNaN(when.getTime())) return String(date);
  if (span > 1100) return String(when.getUTCFullYear());
  if (span > 400 || step !== 'week') return dateLabel(date, { day: undefined, month: 'short', year: '2-digit' });
  return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

type Bought = Map<string, { windows: number; points: Point[] }>;

function IndicatorChart({ series, loadRange }: { series: SeriesEntry; loadRange?: LoadRange | null }) {
  /* Per series: the widest window count paid for, and every point it bought.
     Stepping back down from ten years to one redraws from this rather than
     asking FMP for windows it has already answered. */
  const bought = React.useRef<Bought>(new Map());
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const widestPaid = () => {
    const paid = bought.current.get(series.name)?.windows || 1;
    return [...INDICATOR_RANGES].reverse().find((r) => windowsFor(r) <= paid) || INDICATOR_RANGES[0];
  };
  if (series.points?.length && !bought.current.has(series.name)) {
    bought.current.set(series.name, { windows: series.windows || 1, points: series.points });
  }
  const [range, setRangeState] = React.useState<IndicatorRange>(widestPaid);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState('');
  const [failure, setFailure] = React.useState<{ status: string; message: string } | null>(null);
  const [style, setStyle] = React.useState<'line' | 'step'>('line');
  const [hover, setHover] = React.useState<number | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const request = React.useRef(0);

  // A new series opens on the widest range already paid for.
  React.useEffect(() => {
    request.current += 1;
    setRangeState(widestPaid());
    setBusy(null); setWarning(''); setFailure(null); setHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.name]);

  const paid = bought.current.get(series.name)?.windows || 0;
  const format = (v: number) => indicatorValue(v, series.unit);

  /* Cut the bought history to the range asked for. A quarterly series over
     three months can come back with one point or none; the last two keep the
     readout truthful rather than blank. */
  const points = bought.current.get(series.name)?.points || series.points || [];
  const floor = Date.now() - range.days * 864e5;
  let rows = points.filter((p) => +at(p.date) >= floor);
  if (rows.length < 2 && points.length >= 2) rows = points.slice(-2);

  const setRange = async (next: IndicatorRange) => {
    if (busy) return;
    setRangeState(next);
    setWarning('');
    const needed = windowsFor(next);
    if (needed <= paid || !loadRange) return;
    const current = ++request.current;
    const name = series.name;
    const label = series.label || name;
    setBusy(`Loading ${next.label} of ${label} — ${requestNote(needed - paid)}…`);
    const result = await loadRange(name, needed, (done, total) => {
      if (current === request.current) setBusy(`Loading ${next.label} of ${label} — window ${done} of ${total}…`);
    });
    if (current !== request.current) return;
    setBusy(null);
    if (result?.points?.length) bought.current.set(name, { windows: result.windows || needed, points: result.points });
    else setWarning(result?.message || `Nothing came back for ${next.label}.`);
    setFailure(result?.status && result.status !== 'ok' ? { status: result.status, message: result.message || '' } : null);
    bump();
  };

  const shown = hover != null && rows[hover] ? rows[hover] : rows.at(-1) || null;
  const first = rows[0]?.value;
  const last = shown?.value;
  const delta = isNum(first) && isNum(last) ? last - first : null;
  // The move across the range, in the unit the series is reported in: a rate
  // moves in percentage points, everything else in its own scale.
  const change = delta == null || !rows.length ? ''
    : series.unit === 'percent' ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(2)} pp over ${range.label}`
      : first ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta / first * 100).toFixed(2)}% over ${range.label}` : '';

  const body = (height: number) => {
    if (busy) {
      return (
        <div role="status" aria-live="polite" className="grid place-items-center gap-2 text-13 text-muted-foreground" style={{ height }}>
          <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" />{busy}</span>
        </div>
      );
    }
    if (rows.length < 2) {
      const copy = failure?.status === 'skipped' || series.status === 'skipped' ? 'This series is unavailable right now.'
        : failure?.status === 'gated' ? 'This series is not available.'
          : failure?.status === 'error' ? (failure.message || 'This series could not be loaded. Try again.')
            : rows.length === 1 ? 'Only one observation came back for this range. Choose a longer one.'
              : (series.message || 'No observation came back for this series in this range.');
      return (
        <div role="status" className="grid place-content-center justify-items-center gap-1.5 text-center text-13 text-muted-foreground" style={{ height }}>
          <strong className="text-foreground">No observations</strong>
          <span className="max-w-[48ch]">{copy}</span>
          {loadRange ? (
            <button type="button" className="mt-1 text-primary hover:underline" onClick={() => { bought.current.delete(series.name); setRange(range); }}>Try again</button>
          ) : null}
        </div>
      );
    }
    const values = rows.map((r) => r.value);
    const min = Math.min(...values), max = Math.max(...values);
    const pad = (max - min || Math.abs(max) * 0.02 || 1) * 0.13;
    const span = daysBetween(rows[0].date, rows.at(-1)!.date);
    const labels = typeof window !== 'undefined' && window.innerWidth < 520 ? 3 : 6;
    const lastValue = rows.at(-1)!.value;
    return (
      <div role="group" aria-label={`${series.label || series.name} observation history. Use the arrow keys to read the series.`}>
        <ResponsiveContainer width="100%" height={height}>
          <RLineChart data={rows} margin={{ top: 20, right: 0, bottom: 0, left: 8 }}
            onMouseMove={(s: any) => setHover(s?.activeTooltipIndex != null ? Number(s.activeTooltipIndex) : null)}
            onMouseLeave={() => setHover(null)}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="date" tickFormatter={(d: string) => axisLabel(d, span, series.step)} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.ceil(rows.length / labels) - 1)} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} height={28} />
            <YAxis orientation="right" domain={[min - pad, max + pad]} tickCount={5} tickFormatter={format} axisLine={false} tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={Math.min(96, 16 + format(max).length * 7)} />
            <Tooltip cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
              content={(p: any) => (p.active && p.payload?.length
                ? <TipBox title={periodOf(p.payload[0].payload.date, series.step)} lines={[{ label: `${series.label}: `, value: format(p.payload[0].value) }]} />
                : null)} />
            <ReferenceLine y={lastValue} stroke="var(--primary)" strokeDasharray="2 3" strokeOpacity={0.6}
              label={{ value: format(lastValue), position: 'right', fill: 'var(--primary)', fontSize: 11, fontWeight: 600 }} />
            {/* A step line is the honest shape for a series that holds a level
                between releases; a straight line between quarters is a reading of the trend. */}
            <Line dataKey="value" name={series.label} type={style === 'step' ? 'stepAfter' : 'linear'} stroke="var(--primary)" strokeWidth={2}
              isAnimationActive={false} dot={rows.length <= 45 ? { r: 4, fill: 'var(--primary)', stroke: 'var(--background)', strokeWidth: 1.5 } : false}
              activeDot={{ r: 5 }} />
          </RLineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const toolBtn = (on: boolean) => cn('rounded-md border border-transparent px-2 py-1 text-tiny font-medium text-muted-foreground hover:bg-accent', on && 'border-border bg-background text-foreground');
  const chrome = (height: number) => (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-13 font-semibold">{series.label || series.name} · United States</span>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-[28px] font-semibold tracking-[-.02em] tnum">{shown ? format(shown.value) : '—'}</span>
            {series.note ? <span className="text-tiny text-muted-foreground">{series.note}</span> : null}
            {change ? <span className={cn('text-13 tnum', delta! > 0 && 'text-up', delta! < 0 && 'text-down')}>{change}</span> : null}
          </div>
        </div>
        <div role="group" aria-label="Chart appearance" className="flex gap-1">
          <button type="button" aria-pressed={style === 'line'} className={toolBtn(style === 'line')} onClick={() => setStyle('line')}>Line</button>
          <button type="button" aria-pressed={style === 'step'} className={toolBtn(style === 'step')} onClick={() => setStyle('step')}>Steps</button>
          <button type="button" aria-label={expanded ? 'Close expanded chart' : 'Expand chart'} title={expanded ? 'Close expanded chart' : 'Expand chart'}
            className={toolBtn(false)} onClick={() => setExpanded((v) => !v)}>
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        </div>
      </div>
      <div className="min-h-5 text-tiny text-muted-foreground">
        {hover != null && rows[hover] ? <span>{periodOf(rows[hover].date, series.step)}</span> : rows.length ? (
          <>
            <span>{`${periodOf(rows[0].date, series.step)} – ${periodOf(rows.at(-1)!.date, series.step)} · ${rows.length} observations${series.note ? ` · ${series.note}` : ''}`}</span>
            {warning ? <span className="ml-2 text-warning">{warning}</span> : null}
          </>
        ) : null}
      </div>
      {body(height)}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2.5">
        <div role="group" aria-label="Chart time range" className="flex flex-wrap gap-0.5">
          {INDICATOR_RANGES.map((r) => {
            const need = windowsFor(r);
            const free = need <= paid;
            return (
              <button key={r.id} type="button" aria-pressed={r.id === range.id} disabled={!!busy} onClick={() => setRange(r)}
                title={free ? `${r.label} · already loaded` : `${r.label} · ${requestNote(need - paid)} more`}
                className={cn('rounded-md px-2.5 py-1 text-tiny font-medium text-muted-foreground hover:bg-accent disabled:opacity-50', r.id === range.id && 'bg-accent text-foreground')}>
                {r.id}
              </button>
            );
          })}
        </div>
        <span className="text-micro text-muted-foreground">{indicatorSpan(paid || 1)} days loaded</span>
      </div>
    </div>
  );

  return (
    <>
      {expanded
        ? <div className="grid h-[440px] place-items-center text-13 text-muted-foreground">Chart open in the expanded view.</div>
        : chrome(385)}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[min(1200px,calc(100vw-32px))]" hideClose>
          <DialogTitle className="sr-only">{series.label || 'Indicator'} expanded chart</DialogTitle>
          {expanded ? chrome(typeof window !== 'undefined' ? Math.min(640, window.innerHeight * 0.62) : 560) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The block: the rail of US series, the chart of the chosen one, and the note
 * that says what a range costs. `data` grows when the board below buys more.
 */
export function EconomyIndicators({ data, status, loadRange }: { data: SeriesMap; status: string; loadRange?: LoadRange | null }) {
  const list = US_INDICATORS.map((item) => (data.get(item.name) ? { ...item, ...data.get(item.name)! } : null))
    .filter((e): e is SeriesEntry & (typeof US_INDICATORS)[number] => !!e && e.status === 'ok' && !!e.points?.length);
  const [active, setActive] = React.useState<string | null>(null);
  const chosen = list.find((e) => e.name === active) || list[0];

  if (!list.length) {
    return (
      <section id="economy-chart" aria-label="United States indicator charts">
        <p className="py-[18px] text-13 text-muted-foreground">{status === 'skipped'
          ? 'The US indicator series are unavailable right now.'
          : 'No observations came back to chart for these series.'}</p>
      </section>
    );
  }
  const onKey = (e: React.KeyboardEvent, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
    setActive(list[next].name);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <section id="economy-chart" aria-label="United States indicator charts" className="grid scroll-mt-[126px] gap-5">
      <Carousel label="United States indicator series" className="gap-2">
        {list.map((entry, i) => {
          const on = entry.name === chosen.name;
          return (
            <button key={entry.name} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} aria-label={`Chart ${entry.label}`}
              onClick={() => setActive(entry.name)} onKeyDown={(e) => onKey(e, i)}
              className={cn('flex min-w-[190px] flex-none snap-start items-center gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-left hover:bg-accent', on && 'border-border bg-muted')}>
              <CountryFlag code="US" />
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate text-13 font-semibold">US {entry.label}</span>
                <span className="flex items-baseline gap-2 text-13">
                  <span className="tnum">{indicatorValue(entry.latest?.value, entry.unit)}</span>
                  <small className="text-micro text-muted-foreground">{periodOf(entry.latest?.date, entry.step)}</small>
                </span>
              </span>
            </button>
          );
        })}
      </Carousel>
      <IndicatorChart series={chosen} loadRange={loadRange} />
      <p className="text-micro leading-relaxed text-muted-foreground">
        A range loads {INDICATOR_WINDOW_DAYS} days at a time — ten years of one series is {requestNote(windowsFor(INDICATOR_RANGES.at(-1)!))}.
        Each range opens on what is already loaded, and every window is kept for ten minutes.
      </p>
    </section>
  );
}

/* ==========================================================================
   The United States board
   ========================================================================== */

function usCard(entry: SeriesEntry & { label?: string }): IndicatorCard {
  const failed = entry.status !== 'ok';
  return {
    key: entry.name,
    name: entry.label || entry.name,
    note: failed ? entry.message : entry.note,
    display: failed ? '—' : indicatorValue(entry.latest?.value, entry.unit),
    change: failed ? null : usMovement(entry),
    history: entry.points || [],
    date: entry.latest?.date || null,
    // The date on one of these is the period observed, not the day it was
    // published — printing it as a release date would be a different claim.
    dateText: entry.latest ? `${entry.step === 'week' ? 'Week of' : 'Period ·'} ${periodOf(entry.latest.date, entry.step)}`
      : 'No observation in the loaded windows',
  };
}

/**
 * Six series lead because they are the ones a reader opens the page for. The
 * other seventeen cost a request per 90-day window each, so they wait behind
 * a button that says what they cost.
 */
export function UsEconomy({ data, status, loadMore }: {
  data: SeriesMap; status: string; loadMore?: ((names: string[], onProgress: (done: number, total: number) => void) => Promise<void>) | null;
}) {
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const missing = US_INDICATORS.filter((item) => !data.has(item.name));
  const groups = US_INDICATOR_GROUPS.map((group) => ({
    group,
    rows: US_INDICATORS.filter((item) => item.group === group && data.has(item.name)).map((item) => usCard({ ...item, ...data.get(item.name)! })),
  })).filter((g) => g.rows.length);

  return (
    <section id="economy-us" className="scroll-mt-[126px] pb-3 pt-8">
      <EmHeading title="United States" scope="US series only" />
      <p className="my-3.5 text-13 text-muted-foreground">Economic indicator series, published for the United States and no other country. Each figure is the latest observation in the series, in the unit it is reported in; the move is against the observation before it.</p>
      <div className="grid gap-[26px]">
        {groups.length ? groups.map((g) => (
          <div key={g.group}>
            <h3 className="border-b border-border pb-0.5 text-tiny font-semibold uppercase tracking-[.08em] text-muted-foreground">{g.group}</h3>
            <EconomicIndicators rows={g.rows} />
          </div>
        )) : (
          <p className="py-[18px] text-13 text-muted-foreground">{status === 'skipped'
            ? 'The US indicator series are unavailable right now.'
            : 'No observation came back for any of these series.'}</p>
        )}
        {missing.length && status !== 'skipped' && loadMore ? (
          <ConsentPanel title={`${missing.length} more series are not loaded yet.`} action={`Load the other ${missing.length} series`}
            busy={busy} busyText="Loading…" progress={progress}
            onClick={async () => {
              setBusy(true);
              await loadMore(missing.map((m) => m.name), (done, total) => setProgress(`${done} of ${total}…`));
              setBusy(false); setProgress(null);
            }}>
            Each series loads 90 days at a time, so the rest of the board takes a moment. Loaded series are kept for ten minutes.
          </ConsentPanel>
        ) : null}
      </div>
    </section>
  );
}

/* ==========================================================================
   Another country's board

   The latest reported actual for each series the country published in the
   loaded history, the move against the print before it, and the earlier
   prints of the same series as its line. The ordering (impact), the unit and
   the estimate are the vendor's; a release with no unit prints a bare number.
   ========================================================================== */

export function CountryEconomy({ country, series, status, message }: {
  country: { code: string; name: string }; series: any[]; status: string; message?: string;
}) {
  const cards: IndicatorCard[] = (series || []).map((entry) => ({
    key: entry.event,
    name: entry.event,
    note: releaseAgainst(entry),
    display: reading(entry.latest?.value),
    unit: entry.unit || '',
    change: releaseMovement(entry),
    history: (entry.points || []).map((p: any) => ({ date: p.date, value: p.value })),
    date: entry.latest?.date || null,
    dateText: `Released ${releaseDate(entry.latest?.date)}`,
  }));
  return (
    <section id="economy-country" className="pb-3 pt-8">
      <EmHeading title={country.name} scope="From the release calendar" />
      <p className="my-3.5 text-13 text-muted-foreground">The latest reported figure for each series {country.name} published in the past 180 days, highest impact first, as its release stated it. The indicator series — the charted board — are published for the United States only, so this country is read from its calendar instead: the move is against the previous release, and the line is the earlier releases of the same series.</p>
      {cards.length ? <EconomicIndicators rows={cards} /> : (
        <p className="py-[18px] text-13 text-muted-foreground">{status === 'skipped'
          ? `${country.name}'s releases are unavailable right now.`
          : message || `No release carrying a reported figure came back for ${country.name} in the past 180 days.`}</p>
      )}
    </section>
  );
}

/* ==========================================================================
   The world maps

   GeoChart in place of the legacy d3 projection. The scale is fixed and
   binned — five steps, printed in the legend — rather than a gradient: a
   gradient makes 2.1% and 2.4% inflation look like different colours of the
   same thing, and the bins are what a reader compares. GeoChart draws with
   presentation attributes, which do not resolve CSS variables, so the empty
   colour is read from the theme at render time.
   ========================================================================== */

const MAPS = {
  gdp: { title: 'GDP growth rate', colors: ['#b94257', '#df8791', '#b4dcd1', '#48ae94', '#08745f'], limits: [-3, 0, 3, 6],
    labels: ['< -3%', '-3 to 0%', '0 to 3%', '3 to 6%', '6% +'] },
  inflation: { title: 'Inflation rate', colors: ['#488da7', '#91c5cb', '#ecd37d', '#e88a62', '#b8415a'], limits: [0, 2, 5, 10],
    labels: ['< 0%', '0 to 2%', '2 to 5%', '5 to 10%', '10% +'] },
} as const;
type MapMetric = keyof typeof MAPS;

const regionName = (code: string) => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
};

function useEmptyColour() {
  const [colour, setColour] = React.useState('#e2e5e9');
  React.useEffect(() => {
    const read = () => setColour(document.documentElement.dataset.theme === 'dark' ? '#343b43' : '#e2e5e9');
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return colour;
}

function WorldMap({ metric, data, status, onRetry }: { metric: MapMetric; data: any; status: string; onRetry?: () => void }) {
  const spec = MAPS[metric];
  const [basis, setBasis] = React.useState<string>(metric);
  const [selected, setSelected] = React.useState('');
  const [query, setQuery] = React.useState('');
  const empty = useEmptyColour();
  const values: Record<string, any> = data?.worldRates?.[basis] || {};
  const codes = Object.keys(values).filter((c) => /^[A-Z]{2}$/.test(c));
  const bin = (v: number) => spec.limits.filter((l) => v >= l).length;

  const table = [
    ['Country', 'Band', { role: 'tooltip' }],
    ...codes.map((code) => {
      const row = values[code];
      return [code, bin(row.value), `${regionName(code)}: ${number(row.value)}% · ${row.basis} · ${String(row.date).slice(0, 10)}`];
    }),
  ];
  // Why a map is empty belongs above the map, with the way to try again.
  const trouble = status === 'skipped' ? 'Country rates are unavailable right now.'
    : data?.mapStatus && data.mapStatus.status !== 'ok' ? data.mapStatus.message
      : !codes.length ? 'No actual was reported for this rate in any country over the past 180 days.' : '';
  const row = selected ? values[selected] : null;
  const rows = codes.map((c) => values[c]).filter((r) => `${r.country} ${regionName(r.country)}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.value - a.value);
  const choices = [...new Set([...codes])].map((c) => [c, regionName(c)] as const).sort((a, b) => a[1].localeCompare(b[1]));
  const select = 'h-9 rounded-md border border-border bg-background px-2.5 text-13';

  return (
    <section id={`economy-map-${metric}`} className="scroll-mt-[110px] border-b border-border pb-9 pt-7">
      <EmHeading title={spec.title}>
        {metric === 'gdp' ? (
          <select aria-label="GDP growth basis" value={basis} onChange={(e) => setBasis(e.target.value)} className={select}>
            <option value="gdp">Year over year</option>
            <option value="gdpQuarterly">Quarter over quarter</option>
            <option value="gdpAnnualized">Annualized quarterly</option>
          </select>
        ) : <span className="rounded-full bg-accent px-2.5 py-1 text-micro font-medium text-muted-foreground">Year over year</span>}
      </EmHeading>
      <div className="my-3.5 flex flex-wrap justify-between gap-2.5 text-13 text-muted-foreground">
        <span>Latest actual releases · Past 180 days</span>
        <span>{codes.length} countries with data</span>
      </div>
      {trouble ? (
        <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-border bg-muted px-4 py-3 text-13 text-muted-foreground">
          <span>{trouble}</span>
          {onRetry && status !== 'skipped' ? <button type="button" onClick={onRetry} className="rounded-md border border-border bg-background px-3 py-1.5 text-tiny text-foreground">Retry</button> : null}
        </div>
      ) : null}
      <div className="aspect-[2] min-h-[180px] w-full">
        <GoogleChart chartType="GeoChart" width="100%" height="100%" data={table}
          loader={<div className="grid size-full place-items-center text-13 text-muted-foreground">Loading map…</div>}
          errorElement={(
            <div role="status" className="grid size-full place-content-center justify-items-center gap-1 rounded-[10px] bg-muted p-6 text-center text-13 text-muted-foreground">
              <strong className="text-foreground">The map could not be drawn</strong>
              <span>Google’s chart library did not load. The country data below is unaffected.</span>
            </div>
          )}
          options={{
            colorAxis: { values: [0, 1, 2, 3, 4], colors: spec.colors },
            legend: 'none',
            datalessRegionColor: empty,
            defaultColor: empty,
            backgroundColor: 'transparent',
            keepAspectRatio: true,
            tooltip: { isHtml: false },
          }}
          chartEvents={[{
            eventName: 'select',
            callback: ({ chartWrapper }) => {
              const sel = (chartWrapper?.getChart() as any)?.getSelection?.()?.[0];
              if (sel && sel.row != null) setSelected(String(table[sel.row + 1][0]));
            },
          }]} />
      </div>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-3 py-4 text-tiny text-muted-foreground">
        {spec.labels.map((label, i) => (
          <span key={label} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-3.5" style={{ background: spec.colors[i] }} />{label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-3.5" style={{ background: empty }} />No reported value</span>
      </div>
      <div className="flex min-h-[94px] items-center gap-5 py-[18px] max-sm:flex-col max-sm:items-start max-sm:gap-3">
        <select aria-label={`${spec.title} country`} value={selected} onChange={(e) => setSelected(e.target.value)} className={cn(select, 'w-full max-w-[240px]')}>
          <option value="">Select country</option>
          {choices.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <div aria-live="polite" className="flex flex-col gap-1.5 text-13 [overflow-wrap:anywhere]">
          {selected ? (
            <>
              <strong className="text-[17px]">{regionName(selected)}</strong>
              <span>{row ? `${number(row.value)}% · ${row.basis} · ${row.event} · Released ${String(row.date).slice(0, 10)}` : 'No reported actual for this rate in the past 180 days'}</span>
            </>
          ) : <span className="text-muted-foreground">{codes.length ? 'No country selected' : 'No reported actuals available for this rate.'}</span>}
        </div>
      </div>
      <details>
        <summary className="cursor-pointer py-3.5 font-semibold">Country data</summary>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search country" aria-label={`Search ${spec.title} countries`}
          className="my-3 h-9 w-full max-w-[320px] rounded-md border border-border bg-background px-3 text-13" />
        <div className="overflow-auto scroll-thin">
          <table className="w-full border-collapse text-left text-13">
            <thead><tr>{['Country', 'Rate', 'Release', 'Event'].map((h) => <th key={h} className="whitespace-nowrap border-b border-border px-3.5 py-3 font-medium text-muted-foreground first:pl-0">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.country}>
                  <td className="whitespace-nowrap border-b border-border px-3.5 py-3 first:pl-0"><button type="button" onClick={() => setSelected(r.country)} className="text-left hover:text-primary">{regionName(r.country)}</button></td>
                  <td className="whitespace-nowrap border-b border-border px-3.5 py-3 tnum">{number(r.value)}%</td>
                  <td className="whitespace-nowrap border-b border-border px-3.5 py-3">{String(r.date).slice(0, 10)}</td>
                  <td className="whitespace-nowrap border-b border-border px-3.5 py-3">{r.event}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="my-3.5 text-13 text-muted-foreground">No matching reported values.</p> : null}
        </div>
      </details>
    </section>
  );
}

/** `metrics` narrows the board to one map — the front page shows inflation. */
export function EconomyMaps({ data, status, onRetry, metrics = ['gdp', 'inflation'] }: {
  data: any; status: string; onRetry?: () => void; metrics?: MapMetric[];
}) {
  return (
    <div>
      {metrics.map((m) => <WorldMap key={m} metric={m} data={data} status={status} onRetry={onRetry} />)}
      <p className="py-[18px] text-tiny text-muted-foreground">Source: economic data releases calendar. Actuals only; reporting periods and release dates vary by country. Map: Google GeoChart.</p>
    </div>
  );
}
