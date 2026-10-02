'use client';

/* ==========================================================================
   Maz Vantage — the Calendar (`/calendar?kind=&week=&day=`)

   One page, five calendars, a week at a time — TradingView's shape: the week
   as a strip of day cards counting what is on each day across every kind, the
   kinds as pills, and the selected day as one table whose columns change
   with the kind.

   Five requests a week, one per kind, because the strip counts all five
   whichever is open. After that nothing: changing the kind, the day or a
   filter redraws what is here, and a week already seen is instant. Names and
   sizes come from two screener calls, never a profile per row. Economic
   releases are instants in UTC, shown at the reader's clock and filed under
   the reader's day; company dates are dates and stay as the vendor dates them.
   ========================================================================== */

import * as React from 'react';
import { dec, isNum, trim } from '@/lib/format';
import { hasApiKey } from '@/lib/fmp';
import {
  DASH, DAY_MS, G20, US, addDays, big, compare, countdown, countryName, dedupeEvents, econValue, fromIso, iso, loadDirectory,
  loadKind, localTime, longDay, mondayOf, perShare, rangeLabel, ratioOf, shortDate, shortSymbol, surprise, todayUtc, unitOf,
  weekday, zoneLabel,
} from '@/lib/calendar';
import { CountryFlag, EmptyState, InstrumentMark } from '@/components/market/market-ui';
import { PageFrame, useHasKey, useQueryState } from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { Input, Skeleton } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

type KindKey = 'economic' | 'earnings' | 'dividends' | 'ipos' | 'splits';
type Res = { status: string; message?: string; rows: any[] };
type Col = { key: string; label: string; left?: boolean; center?: boolean; grow?: boolean; numeric?: boolean; title?: string; sort: (r: any) => any; cell?: (r: any) => React.ReactNode };

/* ---------- cells ---------------------------------------------------------------- */

/** A figure with its unit set small after it, the way TradingView prints money. */
const Fig = ({ text, unit = '' }: { text: string | null | undefined; unit?: string }) =>
  (text == null || text === '' ? <>{DASH}</> : <span>{text}{unit ? <small className="ml-1 text-micro text-muted-foreground">{unit}</small> : null}</span>);

function Signed({ v }: { v: number | null }) {
  if (!isNum(v)) return <>{DASH}</>;
  return <span className={cn(v > 0 && 'text-up', v < 0 && 'text-down')}>{`${v > 0 ? '+' : v < 0 ? '−' : ''}${trim(Math.abs(v) * 100, 2)}%`}</span>;
}

const Ico = ({ d, className }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-4 fill-none stroke-current stroke-2', className)} dangerouslySetInnerHTML={{ __html: d }} />
);
const ICON = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
};

function ReportTime({ time }: { time: string }) {
  if (time === 'bmo') return <span className="inline-flex items-center gap-1.5"><Ico d={ICON.sun} className="text-warning" />Before open</span>;
  if (time === 'amc') return <span className="inline-flex items-center gap-1.5"><Ico d={ICON.moon} className="text-primary" />After close</span>;
  return <>{DASH}</>;
}

/** Three bars, filled to the release's importance — the vendor's own grade. */
function Impact({ r }: { r: any }) {
  if (r.holiday) return <span className="rounded bg-accent px-1.5 py-0.5 text-micro font-semibold">Holiday</span>;
  const label = ['No impact rating', 'Low impact', 'Medium impact', 'High impact'][r.impact];
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex items-end gap-0.5">
      {[1, 2, 3].map((n) => <i key={n} className={cn('w-1 rounded-sm', n === 1 ? 'h-2' : n === 2 ? 'h-3' : 'h-4', n <= r.impact ? (r.impact === 3 ? 'bg-down' : r.impact === 2 ? 'bg-warning' : 'bg-muted-foreground') : 'bg-accent')} />)}
    </span>
  );
}

/* ---------- the kinds: name, noun, default sort, columns ------------------------- */

const company: Col = { key: 'company', label: 'Symbol', left: true, numeric: false, sort: (r) => (r.name || r.symbol).toUpperCase() };
const capColumn: Col = { key: 'cap', label: 'Market cap', sort: (r) => r.cap, cell: (r) => <Fig text={big(r.cap)} unit={r.cap ? 'USD' : ''} /> };

const KINDS: Record<KindKey, { key: KindKey; label: string; title: string; noun: [string, string]; defaultSort: { key: string; dir: 1 | -1 }; dayLabel?: string; noReport?: boolean; columns: Col[] }> = {
  economic: {
    key: 'economic', label: 'Economic', title: 'Economic calendar', noun: ['release', 'releases'], defaultSort: { key: 'time', dir: 1 },
    columns: [
      { key: 'time', label: 'Time', left: true, sort: (r) => (r.holiday ? -Infinity : r.at.getTime()) },
      { key: 'country', label: 'Country', left: true, numeric: false, sort: (r) => countryName(r.country),
        cell: (r) => <span className="inline-flex items-center gap-2"><CountryFlag code={r.country} /><span>{countryName(r.country)}</span></span> },
      { key: 'impact', label: 'Impact', center: true, sort: (r) => r.impact, cell: (r) => <Impact r={r} /> },
      { key: 'event', label: 'Event', left: true, grow: true, numeric: false, sort: (r) => r.event.toUpperCase(),
        cell: (r) => <span title={r.event} className="line-clamp-1">{r.event}</span> },
      { key: 'actual', label: 'Actual', sort: (r) => r.actual },
      { key: 'estimate', label: 'Forecast', sort: (r) => r.estimate, cell: (r) => econValue(r.estimate, r.unit) },
      { key: 'previous', label: 'Prior', sort: (r) => r.previous, cell: (r) => econValue(r.previous, r.unit) },
    ],
  },
  earnings: {
    key: 'earnings', label: 'Earnings', title: 'Earnings calendar', noun: ['company', 'companies'], defaultSort: { key: 'cap', dir: -1 },
    columns: [
      company,
      { key: 'when', label: 'Time', left: true, sort: (r) => ({ bmo: 0, amc: 2 } as Record<string, number>)[r.time] ?? 1, cell: (r) => <ReportTime time={r.time} /> },
      { key: 'period', label: 'Period', left: true, numeric: false, sort: (r) => r.periodEnding || '',
        cell: (r) => (r.fiscalPeriod ? <span title={r.periodEnding ? `Period ending ${shortDate(r.periodEnding)}` : undefined}>{`${r.fiscalPeriod} ${r.fiscalYear || ''}`.trim()}</span> : DASH) },
      { key: 'epsEst', label: 'EPS estimate', sort: (r) => r.epsEstimated, cell: (r) => <Fig text={perShare(r.epsEstimated)} unit={unitOf(r)} /> },
      { key: 'eps', label: 'EPS reported', sort: (r) => r.epsActual, cell: (r) => <Fig text={perShare(r.epsActual)} unit={unitOf(r)} /> },
      { key: 'epsSurprise', label: 'Surprise', sort: (r) => surprise(r.epsActual, r.epsEstimated), cell: (r) => <Signed v={surprise(r.epsActual, r.epsEstimated)} /> },
      { key: 'revEst', label: 'Revenue estimate', sort: (r) => r.revenueEstimated, cell: (r) => <Fig text={big(r.revenueEstimated)} unit={unitOf(r)} /> },
      { key: 'rev', label: 'Revenue reported', sort: (r) => r.revenueActual, cell: (r) => <Fig text={big(r.revenueActual)} unit={unitOf(r)} /> },
      { key: 'revSurprise', label: 'Surprise', sort: (r) => surprise(r.revenueActual, r.revenueEstimated, 0), cell: (r) => <Signed v={surprise(r.revenueActual, r.revenueEstimated, 0)} /> },
      capColumn,
    ],
  },
  dividends: {
    key: 'dividends', label: 'Dividends', title: 'Dividend calendar', noun: ['payer', 'payers'], defaultSort: { key: 'cap', dir: -1 }, dayLabel: 'Ex-dividend',
    columns: [
      company,
      { key: 'amount', label: 'Amount', sort: (r) => r.dividend, cell: (r) => <Fig text={perShare(r.dividend)} unit={unitOf(r)} /> },
      // Already a percentage in the vendor's feed, not a fraction.
      { key: 'yield', label: 'Yield', sort: (r) => (isNum(r.yield) && r.yield > 0 ? r.yield : null), cell: (r) => (isNum(r.yield) && r.yield > 0 ? `${trim(r.yield, 2)}%` : DASH) },
      { key: 'freq', label: 'Frequency', left: true, numeric: false, sort: (r) => r.frequency || '', cell: (r) => r.frequency || DASH },
      { key: 'record', label: 'Record date', numeric: false, sort: (r) => r.recordDate || '', cell: (r) => shortDate(r.recordDate) || DASH },
      { key: 'pay', label: 'Payment date', numeric: false, sort: (r) => r.paymentDate || '', cell: (r) => shortDate(r.paymentDate) || DASH },
      capColumn,
    ],
  },
  ipos: {
    key: 'ipos', label: 'IPO', title: 'IPO calendar', noun: ['listing', 'listings'], defaultSort: { key: 'cap', dir: -1 },
    // Not yet trading, so there is no report to open.
    noReport: true,
    columns: [
      company,
      { key: 'exchange', label: 'Exchange', left: true, numeric: false, sort: (r) => r.exchange, cell: (r) => r.exchange || DASH },
      { key: 'status', label: 'Status', left: true, numeric: false, sort: (r) => r.status,
        cell: (r) => (r.status ? <span className="rounded bg-accent px-1.5 py-0.5 text-micro font-semibold">{r.status}</span> : DASH) },
      { key: 'range', label: 'Price range', sort: (r) => r.low,
        cell: (r) => <Fig text={r.low == null ? null : r.low === r.high ? dec(r.low, 2) : `${dec(r.low, 2)} – ${dec(r.high, 2)}`} unit="USD" /> },
      { key: 'shares', label: 'Shares offered', sort: (r) => r.shares, cell: (r) => (r.shares ? r.shares.toLocaleString('en-US') : DASH) },
      { key: 'deal', label: 'Deal size', title: 'Shares offered at the midpoint of the price range', sort: (r) => r.deal, cell: (r) => <Fig text={big(r.deal)} unit="USD" /> },
      { ...capColumn, title: 'The published valuation of the offer' },
    ],
  },
  splits: {
    key: 'splits', label: 'Splits', title: 'Split calendar', noun: ['split', 'splits'], defaultSort: { key: 'cap', dir: -1 },
    columns: [
      company,
      { key: 'ratio', label: 'Ratio', sort: (r) => ratioOf(r)?.forOne, cell: (r) => ratioOf(r)?.text || DASH },
      { key: 'type', label: 'Type', left: true, sort: (r) => ratioOf(r)?.forOne ?? 0,
        cell: (r) => { const s = ratioOf(r); return s ? (s.forOne >= 1 ? 'Split' : 'Reverse split') : DASH; } },
      capColumn,
    ],
  },
};
const KIND_ORDER: KindKey[] = ['economic', 'earnings', 'dividends', 'ipos', 'splits'];

/** How many rows a day shows before the reader asks for the rest. */
const LIMIT = 100;

const COVERAGE: Record<KindKey, string[]> = {
  economic: [
    'From the economic calendar. Each release is timed in UTC and shown here at your own clock time, filed under your own day; public holidays stay on their date.',
    'Impact is the calendar’s own three-level grade. Actual, forecast and prior are printed as published, with the published unit; nothing is coloured as better or worse, because whether a higher number is good news depends on the release.',
  ],
  earnings: [
    'From the earnings calendar, with report times where one is published: before the open, or after the close.',
    'Surprise is (reported − estimate) ÷ |estimate|, left empty when the estimate is too small to divide by.',
  ],
  dividends: ['From the dividend calendar, by ex-dividend date — the first day the shares trade without the payment. Buying on this day does not earn it. Yield is the published figure.'],
  ipos: ['From the IPO calendar, which names each company itself. Deal size is the shares offered at the midpoint of the price range, so it is shown only where both are published; market cap is the published valuation of the offer.'],
  splits: ['From the split calendar, by effective date. A split changes the number of shares and the price per share and nothing else.'],
};

/* ==========================================================================
   The page
   ========================================================================== */

export function CalendarPage() {
  const nav = useNav();
  const q = useQueryState();
  const has = useHasKey();

  const today = todayUtc();
  const kindKey: KindKey = (KINDS as any)[String(q.get('kind') || '').toLowerCase()] ? (String(q.get('kind')).toLowerCase() as KindKey) : 'earnings';
  const week = mondayOf(fromIso(q.get('week')) || today);
  const askedDay = fromIso(q.get('day'));
  const day = iso(askedDay && iso(mondayOf(askedDay)) === iso(week) ? askedDay : iso(mondayOf(today)) === iso(week) ? today : week);
  const kind = KINDS[kindKey];

  // The US by default: where the directory has names and sizes.
  const [market, setMarket] = React.useState<string>(US);
  const [country, setCountry] = React.useState('all');
  const [impact, setImpact] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [sortState, setSortState] = React.useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const [now, setNow] = React.useState(() => Date.now());

  // Weeks, loaded once each; a kind's result lands and redraws.
  const weeks = React.useRef(new Map<string, Partial<Record<KindKey, Res>>>());
  // Symbol -> name and size. Null while in flight; empty without a key.
  const [directory, setDirectory] = React.useState<Map<string, { name: string; cap: number | null }> | null>(null);

  const go = (w: Date, d: string, k: KindKey = kindKey) => {
    setExpanded(false);
    q.set({ kind: k, week: iso(w), day: d });
  };
  // Keep the URL on what is being read, so a copied link lands there.
  React.useEffect(() => {
    if (q.get('kind') !== kindKey || q.get('week') !== iso(week) || q.get('day') !== day) q.set({ kind: kindKey, week: iso(week), day });
  }, [q, kindKey, day]); // eslint-disable-line react-hooks/exhaustive-deps -- week is keyed by its ISO string below
  React.useEffect(() => { document.title = `${kind.title} — Maz Vantage`; }, [kind.title]);

  React.useEffect(() => {
    if (!has) { setDirectory(new Map()); return; }
    let live = true;
    loadDirectory().catch(() => new Map()).then((m: any) => { if (live) setDirectory(m); });
    return () => { live = false; };
  }, [has]);

  const weekKey = iso(week);
  React.useEffect(() => {
    if (!has) return;
    if (weeks.current.has(weekKey)) return;
    const w: Partial<Record<KindKey, Res>> = {};
    weeks.current.set(weekKey, w);
    for (const k of KIND_ORDER) {
      loadKind(k, fromIso(weekKey)!).then((res: any) => { w[k] = res; bump(); });
    }
  }, [weekKey, has]);
  const w: Partial<Record<KindKey, Res>> = has ? weeks.current.get(weekKey) || {} : Object.fromEntries(KIND_ORDER.map((k) => [k, { status: 'skipped', rows: [] }]));

  // The countdowns and the "now" line on today's economic calendar.
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  /** The kind's rows under the page's filters, one per company. */
  const scoped = (k: KindKey, rows: any[]) => {
    if (k === 'economic') {
      const min = ({ all: -1, medium: 2, high: 3 } as Record<string, number>)[impact];
      return { rows: rows.filter((r) => (r.holiday ? impact === 'all' : r.impact >= min) && (country === 'all' || (country === 'g20' ? G20.has(r.country) : r.country === country))), removed: 0 };
    }
    const kept = rows.filter((r) => market === 'all' || r.market === market);
    return k === 'ipos' ? { rows: kept, removed: 0 } : dedupeEvents(kept, k);
  };
  const split: Partial<Record<KindKey, { days: Map<string, any[]>; removed: number }>> = {};
  for (const k of KIND_ORDER) {
    const res = w[k];
    if (!res || res.status !== 'ok') continue;
    const { rows, removed } = scoped(k, res.rows);
    const days = new Map<string, any[]>();
    for (const r of rows) { if (!days.has(r.day)) days.set(r.day, []); days.get(r.day)!.push(r); }
    split[k] = { days, removed };
  }

  const pickerRef = React.useRef<HTMLInputElement>(null);
  const stripRef = React.useRef<HTMLDivElement>(null);
  // On a phone the strip scrolls sideways: centre the chosen day inside it.
  React.useEffect(() => {
    const strip = stripRef.current;
    const card = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !card || strip.scrollWidth <= strip.clientWidth) return;
    const s = strip.getBoundingClientRect(); const c = card.getBoundingClientRect();
    strip.scrollLeft += c.left - s.left - (s.width - c.width) / 2;
  }, [day]);

  /* ---- filters ---- */
  const res = w[kindKey];
  const kindRows = res?.status === 'ok' ? res.rows : [];
  const selCls = 'h-9 rounded-md border border-border bg-background px-2 text-13';
  let filterControls: React.ReactNode;
  if (kindKey === 'economic') {
    const counts = new Map<string, number>();
    for (const r of kindRows) counts.set(r.country, (counts.get(r.country) || 0) + 1);
    const countries = [...counts.entries()].sort((a, b) => b[1] - a[1] || countryName(a[0]).localeCompare(countryName(b[0])));
    const value = country !== 'all' && country !== 'g20' && !counts.has(country) ? 'all' : country;
    filterControls = (
      <>
        <select aria-label="Country" value={value} onChange={(e) => { setCountry(e.target.value); setExpanded(false); }} className={selCls}>
          <option value="all">All countries</option><option value="g20">G20 economies</option>
          {countries.map(([code, n]) => <option key={code} value={code}>{countryName(code)} ({n})</option>)}
        </select>
        <select aria-label="Impact" value={impact} onChange={(e) => { setImpact(e.target.value); setExpanded(false); }} className={selCls}>
          <option value="all">All impact</option><option value="medium">Medium and high</option><option value="high">High impact</option>
        </select>
      </>
    );
  } else {
    const counts = new Map<string, number>();
    for (const r of kindRows) counts.set(r.market, (counts.get(r.market) || 0) + 1);
    const others = [...counts.entries()].filter(([m]) => m !== US).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const value = market !== 'all' && market !== US && !counts.has(market) ? US : market;
    filterControls = (
      <select aria-label="Market" value={value} onChange={(e) => { setMarket(e.target.value); setExpanded(false); }} className={selCls}>
        <option value={US}>{US}</option><option value="all">All markets</option>
        {others.map(([m, n]) => <option key={m} value={m}>{m} ({n.toLocaleString('en-US')})</option>)}
      </select>
    );
  }

  /* ---- the table ---- */
  const table = () => {
    const date = fromIso(day)!;
    const Bar = ({ count, note }: { count: number | null; note?: React.ReactNode }) => (
      <div className="flex flex-wrap items-baseline gap-3 border-b border-border pb-3">
        <span className="text-[15px] font-bold">{kind.dayLabel ? `${kind.dayLabel} · ` : ''}{longDay(date)}</span>
        {count != null ? <span className="text-13 text-muted-foreground">{count.toLocaleString('en-US')} {kind.noun[count === 1 ? 0 : 1]}</span> : null}
        {note}
      </div>
    );
    if (!res || (kindKey !== 'economic' && !kind.noReport && directory === null)) {
      return <><Bar count={null} /><div aria-busy="true" className="grid gap-2.5 pt-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-5" />)}</div></>;
    }
    if (res.status !== 'ok') {
      // The calendars are date-relative and cannot be bundled: a saved week of
      // events is wrong by the week after, so there is no offline fallback.
      const name = kind.title.toLowerCase();
      const message = res.status === 'skipped'
        ? 'The calendar is unavailable right now. There is no saved copy: a saved week of events would be wrong by the week after.'
        : res.status === 'gated' ? `The ${name} is not available right now.` : `The ${name} could not be loaded${res.message ? ` — ${res.message}` : ''}.`;
      return <><Bar count={null} /><EmptyState status={res.status === 'skipped' ? 'skipped' : res.status === 'gated' ? 'gated' : 'error'} message={message} compact /></>;
    }
    const all = split[kindKey]?.days.get(day) || [];
    const removed = split[kindKey]?.removed || 0;
    const needle = query.trim().toUpperCase();
    // The directory's name and size joined on, for this draw only.
    let rows = all.map((r) => (kindKey === 'economic' || kindKey === 'ipos' ? r : { ...r, name: directory?.get(String(r.symbol).toUpperCase())?.name || '', cap: directory?.get(String(r.symbol).toUpperCase())?.cap ?? null }));
    if (needle) rows = rows.filter((r) => (kindKey === 'economic' ? `${r.event} ${countryName(r.country)} ${r.country}` : `${r.symbol} ${r.name || ''}`).toUpperCase().includes(needle));
    const sort = sortState || kind.defaultSort;
    const column = kind.columns.find((c) => c.key === sort.key) || kind.columns[0];
    rows.sort((a, b) => compare(column.sort(a), column.sort(b), sort.dir)
      || (kindKey === 'economic' ? b.impact - a.impact : 0)
      || String(a.symbol || a.event).localeCompare(String(b.symbol || b.event)));

    if (!rows.length) {
      const line = query ? `Nothing on this day matches “${query}”.` : all.length ? 'Nothing on this day passes the filters above.' : `Nothing on the ${kind.title.toLowerCase()} for ${longDay(date)}.`;
      // The US filter is the default, so an empty US day with rows elsewhere says so.
      const elsewhere = !query && kindKey !== 'economic' && market === US ? (res.rows || []).filter((r: any) => r.day === day && r.market !== US).length : 0;
      return (
        <>
          <Bar count={0} />
          <div role="status" className="grid justify-items-center gap-3 py-10 text-center">
            <strong className="text-sm">{line}</strong>
            {elsewhere ? <Button variant="outline" size="sm" onClick={() => setMarket('all')}>Show {elsewhere.toLocaleString('en-US')} in other markets</Button> : null}
          </div>
        </>
      );
    }
    const shown = expanded ? rows : rows.slice(0, LIMIT);
    // Today's economic calendar in time order: the first release still to come gets the marker.
    const live = kindKey === 'economic' && day === iso(todayUtc()) && column.key === 'time' && sort.dir === 1;
    const next = live ? shown.find((r) => !r.holiday && r.at.getTime() > now) : null;
    const also = (r: any) => (r.alsoListed?.length ? ` · also listed as ${[...new Set(r.alsoListed)].sort().join(', ')}` : '');

    const cellFor = (c: Col, r: any): React.ReactNode => {
      if (c.key === 'company') {
        const parts = (
          <>
            <InstrumentMark row={{ symbol: r.symbol, kind: 'stock' }} />
            <span className="font-bold">{shortSymbol(r.symbol)}</span>
            <span className="max-w-[220px] truncate text-muted-foreground">{r.name || (r.market !== US ? r.market : '')}</span>
          </>
        );
        if (kind.noReport) return <span className="flex items-center gap-2" title={`${r.symbol}${r.name ? ` · ${r.name}` : ''}`}>{parts}</span>;
        return <button type="button" title={`Open ${r.symbol}${r.name ? ` · ${r.name}` : ''}${also(r)}`} onClick={() => nav.goSymbol(r.symbol)} className="flex items-center gap-2 text-left hover:text-primary">{parts}</button>;
      }
      if (c.key === 'time') return r.holiday ? 'All day' : <span className={cn(r === next && 'font-bold text-primary')}>{localTime(r.at)}</span>;
      if (c.key === 'actual') {
        if (isNum(r.actual)) return <strong>{econValue(r.actual, r.unit)}</strong>;
        const wait = !r.holiday ? r.at.getTime() - now : -1;
        return wait > 0 && wait < DAY_MS ? <span className="text-primary">{countdown(wait)}</span> : DASH;
      }
      return c.cell ? c.cell(r) : DASH;
    };

    return (
      <>
        <Bar count={rows.length} note={removed && kindKey !== 'economic'
          ? <span className="text-tiny text-muted-foreground">{removed.toLocaleString('en-US')} duplicate listing{removed === 1 ? '' : 's'} merged this week</span> : null} />
        <div role="region" aria-label={`${kind.title}, ${longDay(date)}`} tabIndex={0} className="overflow-x-auto scroll-thin">
          <table className="w-full border-collapse text-13 tnum">
            <thead>
              <tr className="border-b border-border">
                {kind.columns.map((c) => {
                  const on = c.key === sort.key;
                  return (
                    <th key={c.key} scope="col" title={c.title} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}
                      className={cn('whitespace-nowrap px-3 py-2 text-micro font-medium uppercase tracking-[.05em] text-muted-foreground first:pl-0', c.left || c.grow ? 'text-left' : c.center ? 'text-center' : 'text-right')}>
                      <button type="button" className={cn('uppercase hover:text-foreground', on && 'text-foreground')}
                        onClick={() => {
                          const numeric = c.numeric !== false && c.key !== 'time';
                          setSortState(on ? { key: c.key, dir: sort.dir === 1 ? -1 : 1 } : { key: c.key, dir: numeric ? -1 : 1 });
                        }}>
                        {c.label}{on ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <React.Fragment key={`${r.symbol || r.event}-${i}`}>
                  {next && r === next ? (
                    <tr aria-hidden="true"><td colSpan={kind.columns.length} className="relative h-0 p-0"><span className="absolute -top-2.5 left-0 z-[1] rounded bg-primary px-1.5 text-micro font-bold text-primary-foreground">Now {localTime(new Date(now))}</span><div className="h-0.5 bg-primary" /></td></tr>
                  ) : null}
                  <tr className={cn('border-b border-border hover:bg-accent/60', r.holiday && 'text-muted-foreground', r === next && 'bg-primary/5')}>
                    {kind.columns.map((c) => (
                      <td key={c.key} className={cn('whitespace-nowrap px-3 py-2 first:pl-0', c.left ? 'text-left' : c.center ? 'text-center' : c.grow ? 'w-full whitespace-normal text-left' : 'text-right')}>
                        {cellFor(c, r)}
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > shown.length ? <Button variant="outline" className="mt-4" onClick={() => setExpanded(true)}>Show all {rows.length.toLocaleString('en-US')}</Button> : null}
      </>
    );
  };

  const todayIso = iso(today);
  const coverage = [...COVERAGE[kindKey]];
  if (kindKey === 'economic') coverage[0] = coverage[0].replace('your own clock time,', `your own clock time (${zoneLabel()}),`);
  if (kindKey !== 'economic' && kindKey !== 'ipos') {
    coverage.push('The feed carries a ticker and a date and nothing else. US names and market caps come from two screener calls — companies and funds — so a listing outside the US, or one the screener does not carry, shows its ticker and market only and sorts after the rest.');
    coverage.push('One row per company: the same company listed on several exchanges, or as a second share class, is merged into its plainest listing, and the bar above the table says how many were.');
  }
  coverage.push('Market-wide data, which may be delayed. Nothing here is ranked for you, scored or recommended.');

  return (
    <PageFrame id="calendar" className="pt-8">
      <header className="grid gap-4 pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[32px] font-bold tracking-[-.03em]">Calendar</h1>
          <span className="text-tiny text-muted-foreground">Times in your time zone · {zoneLabel()}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => go(mondayOf(todayUtc()), iso(todayUtc()))}>Today</Button>
          <span className="relative">
            <Button variant="outline" size="icon" className="size-8" aria-label="Go to a date" title="Go to a date"
              onClick={() => { const p = pickerRef.current; if (!p) return; p.value = day; try { p.showPicker(); } catch { p.focus(); } }}>
              <Ico d={ICON.calendar} />
            </Button>
            <input ref={pickerRef} type="date" tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0"
              onChange={(e) => { const d = fromIso(e.target.value); if (d) go(mondayOf(d), iso(d)); }} />
          </span>
          <Button variant="outline" size="icon" className="size-8" aria-label="Previous week" title="Previous week"
            onClick={() => go(addDays(week, -7), iso(addDays(fromIso(day)!, -7)))}><Ico d={ICON.prev} /></Button>
          <Button variant="outline" size="icon" className="size-8" aria-label="Next week" title="Next week"
            onClick={() => go(addDays(week, 7), iso(addDays(fromIso(day)!, 7)))}><Ico d={ICON.next} /></Button>
          <h2 className="ml-2 text-lg font-semibold">{rangeLabel(week)}</h2>
        </div>
      </header>

      <div ref={stripRef} role="group" aria-label="Days of the week" className="grid grid-cols-7 gap-2 overflow-x-auto pb-1 scroll-none max-md:grid-flow-col max-md:grid-cols-none max-md:auto-cols-[150px]">
        {[0, 1, 2, 3, 4, 5, 6].map((n) => {
          const d = addDays(week, n);
          const dayIso = iso(d);
          const selected = dayIso === day;
          const lines = KIND_ORDER.map((k) => {
            if (!w[k]) return <span key={k} className="flex items-center justify-between gap-2 text-tiny text-muted-foreground"><span>{KINDS[k].label}</span><Skeleton className="h-3 w-6" /></span>;
            const count = split[k]?.days.get(dayIso)?.length || 0;
            if (!count) return null;
            return (
              <span key={k} className={cn('flex items-center justify-between gap-2 text-tiny', k === kindKey ? 'font-semibold' : 'text-muted-foreground', selected && 'text-inherit')}>
                <span>{KINDS[k].label}</span><span className="tnum">{count.toLocaleString('en-US')}</span>
              </span>
            );
          }).filter(Boolean);
          return (
            <button key={dayIso} type="button" aria-pressed={selected} onClick={() => { if (day !== dayIso) go(week, dayIso); }}
              className={cn('grid min-h-[120px] content-start gap-2 rounded-xl border border-border p-3 text-left hover:bg-accent',
                selected && 'border-foreground bg-foreground text-background hover:bg-foreground', !selected && dayIso === todayIso && 'border-primary')}>
              <span className="flex items-center justify-between">
                <span className="text-13 font-bold">{weekday(d)} {d.getUTCDate()}</span>
                {dayIso === todayIso ? <span className={cn('rounded px-1.5 text-[10px] font-bold', selected ? 'bg-background text-foreground' : 'bg-primary text-primary-foreground')}>Today</span> : null}
              </span>
              <span className="grid gap-1">{lines.length ? lines : <span className="text-tiny text-muted-foreground">{hasApiKey() ? 'Nothing scheduled' : 'No data'}</span>}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Calendar" className="flex flex-wrap gap-2">
          {KIND_ORDER.map((k) => (
            <button key={k} type="button" aria-pressed={k === kindKey}
              onClick={() => { if (k === kindKey) return; setSortState(null); setQuery(''); go(week, day, k); }}
              className={cn('rounded-full border border-border px-4 py-1.5 text-13 font-semibold hover:bg-accent', k === kindKey && 'border-foreground bg-foreground text-background hover:bg-foreground')}>
              {KINDS[k].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filterControls}
          <Input type="search" placeholder={kindKey === 'economic' ? 'Search events' : 'Search symbols'} aria-label="Search this day" value={query}
            onChange={(e) => { setQuery(e.target.value); setExpanded(false); }} className="h-9 w-48" />
        </div>
      </div>

      <section aria-live="polite" className="mt-5">{table()}</section>

      <details className="mt-8 rounded-xl border border-border px-4 py-3 text-13 text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">Where this calendar comes from</summary>
        <div className="mt-3 grid max-w-[100ch] gap-2 leading-relaxed">{coverage.map((l, i) => <p key={i}>{l}</p>)}</div>
      </details>
    </PageFrame>
  );
}
