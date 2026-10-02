'use client';

/* ==========================================================================
   Maz Vantage — the Technicals tab

   What the price itself has been doing: a technical summary on daily, weekly
   or monthly bars, pivot levels, candlestick patterns, a study chart with the
   reader's own drawings, seasonality, and the price history as a table that
   downloads.

   It is deliberately a tab of its own and not part of the grade. The five
   factor grades read the accounts against the sector; everything here reads
   one series of prices. Neither enters the other, and the page says so at
   the top, because "Strong Buy" printed near a quant rating would otherwise
   be read as the product's verdict. Every rule behind a signal is printed.

   One request for the whole tab (fifteen years of daily bars), cached, so
   switching between its sections costs nothing.
   ========================================================================== */

import * as React from 'react';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analysis } from '@/lib/model';
import type { Extras } from '@/lib/report-load';
import { loadDailyHistory, type HistoryLoad } from '@/lib/price-history';
import {
  VERDICT_RULE, candlePatterns, pivots, resample, seasonality, technicalSummary,
  type Action, type Bar as PriceBar, type Signal,
} from '@/lib/technicals';
import { downloadCsv, csvFilename } from '@/lib/csv';
import { useDataEpoch } from '@/components/providers';
import { StudyChart } from '@/components/charts/study-chart';
import { TipBox } from '@/components/charts/chart-tip';
import { Notice } from '@/components/report/ui';
import { CsvButton } from '@/components/csv-button';
import { Tabs, TabsContent, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type Frame = 'day' | 'week' | 'month';
const FRAME_LABEL: Record<Frame, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = (v: number | null | undefined, dp = 2) => (typeof v === 'number' && Number.isFinite(v)
  ? v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '—');
const pctText = (v: number | null | undefined, dp = 1) => (typeof v === 'number' && Number.isFinite(v)
  ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(dp)}%` : '—');
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const barsFor = (bars: PriceBar[], frame: Frame) => (frame === 'day' ? bars : resample(bars, frame));

/* ---------- small parts ------------------------------------------------------------------------ */

const ACTION_TONE: Record<Action, string> = {
  Buy: 'text-up', Sell: 'text-down', Neutral: 'text-muted-foreground', Overbought: 'text-warning', Oversold: 'text-warning',
};

function ActionText({ action }: { action: Action | null }) {
  return action ? <span className={cn('font-semibold', ACTION_TONE[action])}>{action}</span> : <span className="text-muted-foreground/70">n/a</span>;
}

const VERDICT_TONE = (v: string) => (/buy/i.test(v) ? 'text-up' : /sell/i.test(v) ? 'text-down' : 'text-foreground');

function Verdict({ title, verdict, tally, big }: { title: string; verdict: string; tally: { buy: number; sell: number; neutral: number; counted: number }; big?: boolean }) {
  return (
    <div className={cn('grid gap-1 rounded-xl border border-border p-4', big && 'bg-muted')}>
      <span className="text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">{title}</span>
      <b className={cn('font-bold tracking-[-.02em]', big ? 'text-[26px]' : 'text-lg', VERDICT_TONE(verdict))}>{verdict}</b>
      <span className="text-tiny text-muted-foreground tnum">
        Buy {tally.buy} · Sell {tally.sell} · Neutral {tally.neutral}{tally.counted ? '' : ' · nothing computed'}
      </span>
    </div>
  );
}

function SimpleTable({ heads, rows, numeric = [] }: { heads: string[]; rows: React.ReactNode[][]; numeric?: number[] }) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full border-collapse text-13 tnum">
        <thead>
          <tr className="border-b border-border">
            {heads.map((h, i) => (
              <th key={`${i}-${h}`} scope="col" className={cn('whitespace-nowrap px-3 py-2 text-micro font-medium uppercase tracking-[.05em] text-muted-foreground first:pl-0',
                numeric.includes(i) ? 'text-right' : 'text-left')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={k} className="border-b border-border last:border-b-0">
              {r.map((c, i) => <td key={i} className={cn('whitespace-nowrap px-3 py-2 first:pl-0', numeric.includes(i) && 'text-right')}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-[-.015em]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/* ---------- 1. the summary ------------------------------------------------------------------------ */

/** Monday of the week a date falls in. */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * The last complete period. Today's session is complete once the history
 * carries it (end-of-day data); the current week is complete from Saturday;
 * the current calendar month is treated as still being made.
 */
function completedBar(bars: PriceBar[], frame: Frame, now = new Date()): PriceBar | null {
  if (!bars.length) return null;
  const lastBar = bars[bars.length - 1];
  if (frame === 'day') return lastBar;
  const today = now.toISOString().slice(0, 10);
  const current = frame === 'month'
    ? today.slice(0, 7) === lastBar.date.slice(0, 7)
    : mondayOf(today) === mondayOf(lastBar.date) && ![0, 6].includes(now.getUTCDay());
  return current ? bars[bars.length - 2] ?? null : lastBar;
}

function SummaryPanel({ bars, ohlc }: { bars: PriceBar[]; ohlc: boolean }) {
  const [frame, setFrame] = React.useState<Frame>('day');
  const fb = React.useMemo(() => barsFor(bars, frame), [bars, frame]);
  const s = React.useMemo(() => technicalSummary(fb), [fb]);
  const pivotBar = completedBar(fb, frame);
  const levels = pivotBar && ohlc ? pivots(pivotBar) : [];
  const patterns = React.useMemo(() => (ohlc ? candlePatterns(fb, frame === 'day' ? 30 : 12) : []), [fb, frame, ohlc]);
  const osc = (sig: Signal) => [sig.name, fmt(sig.value), <ActionText key="a" action={sig.action} />];

  return (
    <div className="grid gap-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup type="single" value={frame} onValueChange={(v) => v && setFrame(v as Frame)} aria-label="Bar interval">
          {(['day', 'week', 'month'] as Frame[]).map((f) => <ToggleGroupItem key={f} value={f}>{FRAME_LABEL[f]}</ToggleGroupItem>)}
        </ToggleGroup>
        <span className="text-tiny text-muted-foreground">
          {s.date ? `As of the ${frame === 'day' ? 'session' : frame} ending ${day(s.date)} · close ${fmt(s.price)}` : 'No bars'}
          {' · '}{fb.length.toLocaleString()} {FRAME_LABEL[frame].toLowerCase()} bars
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr]">
        <Verdict title="Summary" verdict={s.verdict.all} tally={s.tally.all} big />
        <Verdict title="Moving averages" verdict={s.verdict.ma} tally={s.tally.ma} />
        <Verdict title="Oscillators" verdict={s.verdict.osc} tally={s.tally.osc} />
      </div>

      <div className="grid gap-9 lg:grid-cols-2">
        <Section title="Moving averages">
          <SimpleTable heads={['Period', 'Simple', '', 'Exponential', '']} numeric={[1, 3]} rows={s.movingAverages.map((m) => [
            `${m.period} bars`, fmt(m.simple.value), <ActionText key="s" action={m.simple.action} />, fmt(m.exponential.value), <ActionText key="e" action={m.exponential.action} />,
          ])} />
        </Section>
        <Section title="Oscillators">
          <SimpleTable heads={['Indicator', 'Value', 'Reading']} numeric={[1]} rows={s.oscillators.map(osc)} />
          {!ohlc ? <p className="text-tiny text-muted-foreground">This history carries closes only, so the indicators that need a day’s high and low show n/a rather than a guess.</p> : null}
        </Section>
      </div>

      <details className="rounded-xl border border-border px-4 py-3">
        <summary className="cursor-pointer text-13 font-semibold">How each signal is read</summary>
        <ul className="mt-3 grid gap-2 text-13 leading-relaxed text-muted-foreground">
          <li><b className="text-foreground">Moving averages.</b> {s.movingAverages[0]?.simple.rule} Simple and exponential, six periods each — twelve votes.</li>
          {s.oscillators.map((o) => <li key={o.name}><b className="text-foreground">{o.name}.</b> {o.rule}</li>)}
          <li><b className="text-foreground">The verdicts.</b> {VERDICT_RULE}</li>
          <li>Studies are computed on the bars shown: a weekly RSI is fourteen weeks, not fourteen days sampled weekly. A window the history cannot fill is n/a — a shorter one is never substituted.</li>
        </ul>
      </details>

      <Section title="Pivot points" aside={pivotBar ? <span className="text-tiny text-muted-foreground">From the {frame === 'day' ? 'session' : frame} ending {day(pivotBar.date)}, for the next one</span> : null}>
        {levels.length ? (
          <SimpleTable heads={['Method', 'S3', 'S2', 'S1', 'Pivot', 'R1', 'R2', 'R3']} numeric={[1, 2, 3, 4, 5, 6, 7]} rows={levels.map((l) => [
            l.name, fmt(l.s3), fmt(l.s2), fmt(l.s1), <b key="p">{fmt(l.p)}</b>, fmt(l.r1), fmt(l.r2), fmt(l.r3),
          ])} />
        ) : <Notice>Pivot levels need the period’s high, low and close, and this history {ohlc ? 'is too short' : 'carries closes only'}.</Notice>}
        <p className="text-tiny text-muted-foreground">
          Classic: P = (H + L + C) / 3. Fibonacci steps 38.2%, 61.8% and 100% of the range from P. Camarilla steps 1.1 × range / 12, 6 and 4 from the close.
          Woodie’s weights the close twice. DeMark’s depends on whether the period closed above or below its open and publishes one level each side.
        </p>
      </Section>

      <Section title="Candlestick patterns" aside={<span className="text-tiny text-muted-foreground">Last {frame === 'day' ? 30 : 12} {FRAME_LABEL[frame].toLowerCase()} bars</span>}>
        {!ohlc ? <Notice>Candlestick patterns need each bar’s open, high and low, and this history carries closes only.</Notice>
          : patterns.length ? (
            <SimpleTable heads={['Pattern', 'Signal', 'Reliability', 'Bar', 'Date']} rows={patterns.map((p) => [
              <b key="n">{p.name}</b>,
              <span key="d" className={p.direction === 'bullish' ? 'text-up' : p.direction === 'bearish' ? 'text-down' : 'text-muted-foreground'}>{p.direction === 'neutral' ? 'Indecision' : p.direction === 'bullish' ? 'Bullish reversal' : 'Bearish reversal'}</span>,
              p.reliability,
              p.barsAgo === 0 ? 'Latest' : `${p.barsAgo} ${p.barsAgo === 1 ? 'bar' : 'bars'} ago`,
              day(p.date),
            ])} />
          ) : <p className="text-13 text-muted-foreground">None of the common patterns formed in this window.</p>}
        <p className="text-tiny text-muted-foreground">
          A hammer or hanging man is the same candle read in different trends — the close before it against its ten-bar average decides which.
          Reliability is the label the pattern literature gives (single candles low, two-bar reversals medium, three-bar formations high); it is not a hit rate measured here.
        </p>
      </Section>
    </div>
  );
}

/* ---------- 3. seasonality ------------------------------------------------------------------------ */

function heat(ret: number) {
  const a = Math.min(1, Math.abs(ret) / 0.1);
  const alpha = 0.12 + a * 0.55;
  return ret >= 0 ? `color-mix(in srgb, var(--up) ${Math.round(alpha * 100)}%, transparent)` : `color-mix(in srgb, var(--down) ${Math.round(alpha * 100)}%, transparent)`;
}

function SeasonalityPanel({ bars, symbol }: { bars: PriceBar[]; symbol: string }) {
  const s = React.useMemo(() => seasonality(bars), [bars]);
  if (s.cells.length < 24) {
    return <Notice>Seasonality needs at least two years of month-end closes; this history has {s.cells.length} complete {s.cells.length === 1 ? 'month' : 'months'}.</Notice>;
  }
  const chart = s.months.map((m) => ({ name: MONTHS[m.month - 1], avg: m.average == null ? null : m.average * 100, stat: m }));
  const byKey = new Map(s.cells.map((c) => [`${c.year}-${c.month}`, c.ret]));
  const yearTotal = (y: number) => {
    const rets = s.cells.filter((c) => c.year === y).map((c) => c.ret);
    return rets.length ? rets.reduce((a, r) => a * (1 + r), 1) - 1 : null;
  };
  return (
    <div className="grid gap-8">
      <p className="max-w-[92ch] text-13 leading-relaxed text-muted-foreground">
        Each month’s last close against the previous month’s, {s.from ? `from ${s.from} to ${s.to}` : ''} — {s.years.length} years. The month in progress is left out.
        Dividends are not included. A calendar pattern in past prices is a description, not a forecast: most of them are what twelve buckets of noise look like.
      </p>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
            <YAxis orientation="right" axisLine={false} tickLine={false} width={48} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <Tooltip cursor={{ fill: 'var(--accent)' }} content={(p: any) => {
              const st = p.active && p.payload?.[0]?.payload?.stat;
              return st ? (
                <TipBox title={`${MONTHS[st.month - 1]} · ${st.years} years`} lines={[
                  { label: 'Average ', value: pctText(st.average) }, { label: 'Median ', value: pctText(st.median) },
                  { label: 'Rose in ', value: `${Math.round((st.positive ?? 0) * 100)}% of years` },
                ]} />
              ) : null;
            }} />
            <Bar dataKey="avg" isAnimationActive={false} radius={[3, 3, 0, 0]}>
              {chart.map((c) => <Cell key={c.name} fill={(c.avg ?? 0) >= 0 ? 'var(--up)' : 'var(--down)'} fillOpacity={0.8} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Section title="By calendar month" aside={
        <CsvButton name={`${symbol} seasonality`} build={() => ({
          headers: ['Month', 'Years', 'Average (%)', 'Median (%)', 'Rose in (% of years)', 'Best (%)', 'Worst (%)'],
          rows: s.months.map((m) => [MONTHS[m.month - 1], m.years, ...[m.average, m.median].map((v) => (v == null ? null : +(v * 100).toFixed(4))),
            m.positive == null ? null : +(m.positive * 100).toFixed(1), ...[m.best, m.worst].map((v) => (v == null ? null : +(v * 100).toFixed(4)))]),
        })} />
      }>
        <SimpleTable heads={['Month', 'Average', 'Median', 'Rose in', 'Best', 'Worst', 'Years']} numeric={[1, 2, 3, 4, 5, 6]} rows={s.months.map((m) => [
          MONTHS[m.month - 1],
          <span key="a" className={(m.average ?? 0) >= 0 ? 'text-up' : 'text-down'}>{pctText(m.average)}</span>,
          pctText(m.median),
          m.positive == null ? '—' : `${Math.round(m.positive * 100)}%`,
          pctText(m.best), pctText(m.worst), m.years,
        ])} />
      </Section>

      <Section title="Every month">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full border-collapse text-tiny tnum">
            <thead>
              <tr>
                <th scope="col" className="px-2 py-1.5 text-left font-medium text-muted-foreground">Year</th>
                {MONTHS.map((m) => <th key={m} scope="col" className="px-1 py-1.5 text-right font-medium text-muted-foreground">{m}</th>)}
                <th scope="col" className="px-2 py-1.5 text-right font-medium text-muted-foreground">Year</th>
              </tr>
            </thead>
            <tbody>
              {s.years.map((y) => (
                <tr key={y} className="border-t border-border">
                  <th scope="row" className="px-2 py-1 text-left font-semibold">{y}</th>
                  {MONTHS.map((_, i) => {
                    const r = byKey.get(`${y}-${i + 1}`);
                    return <td key={i} className="px-1 py-1 text-right" style={r == null ? undefined : { background: heat(r) }}>{r == null ? '' : (r * 100).toFixed(1)}</td>;
                  })}
                  <td className="px-2 py-1 text-right font-semibold">{pctText(yearTotal(y))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-tiny text-muted-foreground">Monthly returns in per cent. The year column compounds the complete months shown, so a partial first year is labelled by what it covers.</p>
      </Section>
    </div>
  );
}

/* ---------- 4. the history table ------------------------------------------------------------------ */

const HISTORY_RANGES = [['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['5Y', 60], ['All', 0]] as const;
const PAGE = 50;

function HistoryPanel({ bars, symbol, ohlc }: { bars: PriceBar[]; symbol: string; ohlc: boolean }) {
  const [frame, setFrame] = React.useState<Frame>('day');
  const [months, setMonths] = React.useState<number>(12);
  const [page, setPage] = React.useState(1);
  const fb = React.useMemo(() => barsFor(bars, frame), [bars, frame]);
  const rows = React.useMemo(() => {
    const out = fb.map((b, i) => ({ ...b, change: i > 0 && fb[i - 1].close > 0 ? b.close / fb[i - 1].close - 1 : null }));
    if (!months || !out.length) return out.reverse();
    const from = new Date(`${out[out.length - 1].date}T00:00:00Z`);
    from.setUTCMonth(from.getUTCMonth() - months);
    const cut = from.toISOString().slice(0, 10);
    return out.filter((r) => r.date > cut).reverse();
  }, [fb, months]);
  React.useEffect(() => setPage(1), [frame, months]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice((page - 1) * PAGE, page * PAGE);
  const vol = (v: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : '—');

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" value={frame} onValueChange={(v) => v && setFrame(v as Frame)} aria-label="Bar interval">
          {(['day', 'week', 'month'] as Frame[]).map((f) => <ToggleGroupItem key={f} value={f}>{FRAME_LABEL[f]}</ToggleGroupItem>)}
        </ToggleGroup>
        <ToggleGroup type="single" value={String(months)} onValueChange={(v) => v && setMonths(Number(v))} aria-label="Range">
          {HISTORY_RANGES.map(([l, m]) => <ToggleGroupItem key={l} value={String(m)}>{l}</ToggleGroupItem>)}
        </ToggleGroup>
        <Button variant="outline" size="sm" className="ml-auto" disabled={!rows.length}
          onClick={() => downloadCsv(csvFilename(symbol, `${FRAME_LABEL[frame]} prices`), ['Date', 'Open', 'High', 'Low', 'Close', 'Change (%)', 'Volume'],
            rows.map((r) => [r.date, r.open, r.high, r.low, r.close, r.change == null ? null : +(r.change * 100).toFixed(4), r.volume]))}>
          Download {rows.length.toLocaleString()} rows as CSV
        </Button>
      </div>
      <SimpleTable heads={['Date', 'Open', 'High', 'Low', 'Close', 'Change', 'Volume']} numeric={[1, 2, 3, 4, 5, 6]} rows={slice.map((r) => [
        day(r.date), fmt(r.open), fmt(r.high), fmt(r.low), <b key="c">{fmt(r.close)}</b>,
        <span key="ch" className={r.change == null ? 'text-muted-foreground' : r.change >= 0 ? 'text-up' : 'text-down'}>{pctText(r.change, 2)}</span>,
        vol(r.volume),
      ])} />
      {pages > 1 ? (
        <nav aria-label="History pages" className="flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</Button>
          <span className="text-tiny text-muted-foreground tnum">{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, rows.length)} of {rows.length.toLocaleString()}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older →</Button>
        </nav>
      ) : null}
      <p className="text-tiny text-muted-foreground">
        Prices as published; the change column is close to close and excludes dividends.
        {ohlc ? '' : ' This history carries closes only, so open, high and low are blank.'} Weekly and monthly bars roll the days up: first open, highest high,
        lowest low, last close, total volume, dated by their last session.
      </p>
    </div>
  );
}

/* ==========================================================================
   The tab
   ========================================================================== */

export function TechnicalsTab({ a }: { a: Analysis; extras: Extras }) {
  const f = a.facts;
  const { epoch } = useDataEpoch();
  const [load, setLoad] = React.useState<HistoryLoad>({ status: 'loading', bars: [], ohlc: false, source: null });
  const [sub, setSub] = React.useState('summary');

  React.useEffect(() => {
    let live = true;
    setLoad({ status: 'loading', bars: [], ohlc: false, source: null });
    loadDailyHistory(f.symbol, a.ds.get('prices'))
      .then((r) => { if (live) setLoad(r); })
      .catch((e) => { if (live) setLoad({ status: 'error', bars: [], ohlc: false, source: null, message: String(e?.message || e) }); });
    return () => { live = false; };
  }, [f.symbol, epoch]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h2 className="text-[26px] font-bold tracking-[-.025em]">Technicals</h2>
        <p className="max-w-[96ch] text-13 leading-relaxed text-muted-foreground">
          What the price has been doing, read from {f.name}’s price series alone. None of it enters the Maz Vantage score or any factor grade — those read the
          accounts against {f.sector ? `the ${f.sector} sector` : 'the company’s sector'} — and a technical “buy” here is a description of the chart, not this
          product’s view of the company.
        </p>
      </div>
      {load.status === 'loading' ? <p role="status" className="py-10 text-center text-13 text-muted-foreground">Loading {f.symbol}’s daily history…</p>
        : load.status !== 'ok' ? <Notice error={load.status === 'error'}>{load.message || 'No price history is available.'}</Notice>
          : (
            <>
              {load.source === 'snapshot' ? (
                <Notice>Live data is unavailable — this is a saved copy of {load.bars.length.toLocaleString()} daily closes{load.ohlc ? '' : ', without highs and lows'}. Fifteen years of full bars return when live data is available.</Notice>
              ) : !load.ohlc ? (
                <Notice>This history carries daily closes without opens, highs and lows, so the studies that need a day’s range say n/a.</Notice>
              ) : null}
              <Tabs value={sub} onValueChange={setSub}>
                <TabsList aria-label="Technicals sections">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="chart">Chart</TabsTrigger>
                  <TabsTrigger value="seasonality">Seasonality</TabsTrigger>
                  <TabsTrigger value="history">Historical data</TabsTrigger>
                </TabsList>
                <TabsContent value="summary"><SummaryPanel bars={load.bars} ohlc={load.ohlc} /></TabsContent>
                <TabsContent value="chart">
                  <StudyChart symbol={f.symbol} bars={load.bars} ohlc={load.ohlc} currency={f.currency || 'USD'} />
                </TabsContent>
                <TabsContent value="seasonality"><SeasonalityPanel bars={load.bars} symbol={f.symbol} /></TabsContent>
                <TabsContent value="history"><HistoryPanel bars={load.bars} symbol={f.symbol} ohlc={load.ohlc} /></TabsContent>
              </Tabs>
              <p className="text-tiny text-muted-foreground/80">
                {load.bars.length.toLocaleString()} daily bars from {day(load.bars[0].date)} to {day(load.bars[load.bars.length - 1].date)} · {load.source === 'live' ? 'live' : 'saved copy'}
              </p>
            </>
          )}
    </div>
  );
}
