'use client';

/* ==========================================================================
   Maz Vantage — the screener, as its own page or inside one (from screener.js)

   Stocks are screens and funds are collections: a fund is selected, never
   scored. A preset that is an idea runs the Maz Vantage model over its universe
   and ranks by it; every other preset is one vendor screener request.

   Two kinds of filter. The row of range buttons, sector, industry and
   exchange read what the screener list already carries, so they filter the
   whole list instantly. **Company filters** (+ Add filters) can be any of our
   scores, Wall Street's rating, or any figure on the Statistics & Metrics
   tab, and each costs requests per company — so they are tested on a click,
   largest companies first, and the table shows the ones tested that pass.
   See `lib/screener-filters.ts`.

   An embedding page overrides the query string with `kind`, `country` and
   `collection`, drops the title row with `chrome={false}`, drops the preset
   dropdown with `picker={false}` (a host that lists the screens itself — the
   Quant desk's rail — would otherwise offer a second, disagreeing answer), and
   keeps a change of collection inside itself with `onNavigate`.
   ========================================================================== */

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchScreener, hasApiKey } from '@/lib/fmp';
import { COUNTRIES, dedupeStocks } from '@/lib/markethub-data';
import { FUND_COLUMN_SETS, SCREENER_COLUMN_SETS, exportColumns, fillBags, type Cell, type Column, type ColumnSet } from '@/lib/market-table';
import { CsvButton } from '@/components/csv-button';
import { WatchStar } from '@/components/watch-button';
import { AddToListButton, SaveScreenButton, SavedScreensMenu, savedScreen } from '@/components/market/screen-actions';
import { COLLECTIONS } from '@/lib/stock-collections';
import { SCREENER_PRESETS, runScreenerPreset, screenerPreset } from '@/lib/screener-presets';
import { ETF_COLLECTIONS, etfCollection } from '@/lib/etf-collections';
import { MAX_SCORE, verdictWord } from '@/lib/grading';
import {
  formatValue, isActive, isMeasured, measureRows, passes, runCap, runCost, screenMetric, valueOf,
  type ScreenFilter, type ScreenMetric,
} from '@/lib/screener-filters';
import { FilterChip, MetricPicker, newFilter } from '@/components/market/screen-filters';
import { EmptyState, InstrumentMark } from '@/components/market/market-ui';
import { Button } from '@/components/ui/button';
import { Input, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 50;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

type ScreenerColumn = Column;
type ScreenerSet = Omit<ColumnSet, 'columns'> & { columns: ScreenerColumn[] };

const QUANT_BAND = ['bg-grade-poor/15 text-grade-poor', 'bg-grade-weak/15 text-grade-weak', 'bg-grade-mid/15 text-grade-mid', 'bg-grade-good/15 text-grade-good', 'bg-grade-strong/15 text-grade-strong'];
function QuantBadge({ value }: { value: unknown }) {
  const valid = finite(value) && value >= 0 && value <= MAX_SCORE;
  return (
    <strong title={valid ? `${verdictWord(value)} · ${value.toFixed(2)} out of ${MAX_SCORE}` : 'Maz Vantage Quant score unavailable'}
      className={cn('inline-block min-w-[46px] rounded-md px-1.5 py-0.5 text-center text-tiny font-bold tnum', valid ? QUANT_BAND[Math.min(4, Math.floor(value))] : 'bg-accent text-muted-foreground')}>
      {valid ? value.toFixed(2) : '—'}
    </strong>
  );
}

const numberText = (v: unknown) => (finite(v) ? new Intl.NumberFormat('en', { maximumFractionDigits: 2, notation: Math.abs(v) >= 1e6 ? 'compact' : 'standard' }).format(v) : '—');
const plainColumn = (key: string, label: string, get: (r: any) => any, percent = false): ScreenerColumn =>
  ({ key, label, num: true, get, fmt: (v) => (finite(v) ? `${numberText(v)}${percent ? '%' : ''}` : '—') });
const quote = (key: string) => (row: any) => row.bags?.quote?.[key];
const change = (row: any) => row.bags?.quote?.changePercentage ?? row.bags?.quote?.changesPercentage;
const overview = SCREENER_COLUMN_SETS[0].columns;
const pick = (key: string) => overview.find((c) => c.key === key)!;

const STOCK_OVERVIEW: ScreenerSet = {
  key: 'overview', label: 'Overview', bags: ['quote', 'ratios', 'growth', 'grades'],
  columns: [
    pick('price'), plainColumn('change', 'Chg %', change, true), pick('volume'),
    plainColumn('relativeVolume', 'Rel vol', (row) => (row.bags?.quote?.avgVolume > 0 ? row.volume / row.bags.quote.avgVolume : null)),
    { ...pick('marketCap'), label: 'Mkt cap' },
    plainColumn('pe', 'P/E', (row) => row.bags?.ratios?.priceToEarningsRatioTTM),
    plainColumn('eps', 'EPS dil TTM', quote('eps')),
    plainColumn('epsGrowth', 'EPS dil growth', (row) => (finite(row.bags?.growth?.growthEPSDiluted) ? row.bags.growth.growthEPSDiluted * 100 : null), true),
    pick('divYield'), pick('sector'),
    { key: 'rating', label: 'Analyst rating', get: (row) => row.bags?.grades?.consensus, fmt: (v) => v || '—' },
  ],
};

export function screenerParams(country: string, kind: string, collection = 'all') {
  return {
    isEtf: kind === 'etfs', ...(kind === 'etfs' ? {} : { isFund: false }), isActivelyTrading: true,
    ...(country === 'WORLD' ? {} : { country }),
    ...(kind === 'etfs' ? {} : COLLECTIONS.find((c) => c.id === collection)?.params), limit: 5000,
  };
}

function CellOut({ col, row }: { col: ScreenerColumn; row: any }) {
  const v = col.get(row);
  if (col.render) return <>{col.render(v, row) as React.ReactNode}</>;
  const out: Cell = col.fmt(v);
  const text = typeof out === 'string' ? out : out.text;
  const tone = col.key === 'change' && finite(v) ? (v >= 0 ? 'text-up' : 'text-down') : typeof out !== 'string' && out.tone === 'na' ? 'text-muted-foreground/70' : '';
  return <span className={tone}>{text}</span>;
}

/** A min/max range filter in a popover. */
function RangeFilter({ label, value, onApply }: { label: string; value: [number | null, number | null] | null; onApply: (v: [number | null, number | null] | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const [low, setLow] = React.useState('');
  const [high, setHigh] = React.useState('');
  const [error, setError] = React.useState('');
  React.useEffect(() => { if (!value) { setLow(''); setHigh(''); } }, [value]);
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const min = low === '' ? null : Number(low);
    const max = high === '' ? null : Number(high);
    if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max)) || (min !== null && max !== null && min > max)) {
      setError('Enter a valid minimum and maximum.');
      return;
    }
    setError('');
    onApply(min === null && max === null ? null : [min, max]);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('h-8 rounded-md border border-border px-3 text-13 hover:bg-accent', value && 'border-primary text-primary')}>
          {value ? `${label}: ${value[0] ?? 'Any'} – ${value[1] ?? 'Any'}` : label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <form onSubmit={apply} className="grid gap-2.5">
          <strong className="text-13">{label}</strong>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" step="any" placeholder="Min" aria-label={`${label} minimum`} value={low} onChange={(e) => setLow(e.target.value)} />
            <Input type="number" step="any" placeholder="Max" aria-label={`${label} maximum`} value={high} onChange={(e) => setHigh(e.target.value)} />
          </div>
          {error ? <span role="alert" className="text-tiny text-down">{error}</span> : null}
          <Button type="submit" size="sm">Apply</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

const FILTER_SPECS: [string, string, (row: any) => any][] = [
  ['price', 'Price', (row) => row.price],
  ['marketCap', 'Mkt cap', (row) => row.marketCap],
  ['volume', 'Volume', (row) => row.volume],
  ['yield', 'Div yield %', (row) => (row.price > 0 && finite(row.lastAnnualDividend) ? (row.lastAnnualDividend / row.price) * 100 : null)],
  ['beta', 'Beta', (row) => row.beta],
];

const selectCls = 'h-8 rounded-md border border-border bg-background px-2 text-13';

/** The line under the company filters: what has been tested, what passed, and what the next run costs. */
function FilterStatus({ measuring, error, active, passed, tested, listed, unmeasured, next, cost, onRun }: {
  measuring: { done: number; total: number } | null; error: string; active: number; passed: number;
  tested: number; listed: number; unmeasured: number; next: number; cost: number; onRun: () => void;
}) {
  const n = (v: number) => v.toLocaleString();
  // Readers are not shown request counts (2026-10-01); `cost` only says whether anything is left to load.
  const price = cost ? '' : 'already loaded';
  let text: React.ReactNode;
  if (measuring) text = `Testing ${n(measuring.done)} of ${n(measuring.total)} companies…`;
  else if (!active) {
    text = unmeasured
      ? 'Type a number in a filter to apply it. Its figures can be loaded now, so the Filters tab has a column to sort on.'
      : 'Type a number in a filter to apply it.';
  } else if (!tested) {
    text = <>Company filters need figures the screener list does not carry, so each company is tested on its own. The largest {n(next)} of the {n(listed)} listed here come first.</>;
  } else {
    text = (
      <>
        <b className="text-foreground">{n(passed)}</b> pass {active === 1 ? 'the filter' : `all ${active} filters`} · {n(tested)} of {n(listed)} tested, largest first
        {unmeasured ? '' : ' — every company listed has been tested'}
      </>
    );
  }
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-13 text-muted-foreground">
      <span className="min-w-0 flex-1">{text}{error ? <span className="text-down"> · {error}</span> : null}</span>
      {!measuring && unmeasured ? (
        <Button size="sm" variant={active ? 'default' : 'outline'} onClick={onRun}>
          {tested && active ? `Test the next ${n(next)}` : `Test ${n(next)} companies`}{price ? ` · ${price}` : ''}
        </Button>
      ) : null}
    </div>
  );
}

export interface ScreenerTarget { country: string; kind: string; collection: string }

export function DedicatedScreener({ kind: kindProp, country: countryProp, collection: collectionProp, chrome = true, picker = true, onNavigate }: {
  kind?: string; country?: string; collection?: string; chrome?: boolean; picker?: boolean; onNavigate?: (next: ScreenerTarget) => void;
}) {
  const nav = useNav();
  const params = useSearchParams();
  const asked = countryProp ?? params?.get('country') ?? null;
  const country = COUNTRIES.some((c) => c.code === asked) ? asked! : asked === 'WORLD' ? 'WORLD' : 'US';
  const kind = (kindProp ?? params?.get('kind')) === 'etfs' ? 'etfs' : 'stocks';
  const askedCollection = collectionProp ?? params?.get('collection') ?? null;
  const preset: any = kind === 'etfs' ? etfCollection(askedCollection) : screenerPreset(askedCollection);
  const collection: string = preset.id;

  const [filters, setFilters] = React.useState<ScreenFilter[]>([]);
  const chipMetrics = React.useMemo(
    () => (kind === 'stocks' ? [...new Set(filters.map((f) => f.metric))].map(screenMetric).filter(Boolean) as ScreenMetric[] : []),
    [filters, kind],
  );

  const sets = React.useMemo<ScreenerSet[]>(() => {
    const base: ScreenerSet[] = kind === 'stocks'
      ? SCREENER_COLUMN_SETS.map((s) => (s.key === 'overview' ? STOCK_OVERVIEW : s))
      : [FUND_COLUMN_SETS[0], ...SCREENER_COLUMN_SETS.filter((s) => ['performance', 'technicals'].includes(s.key))];
    if (preset.idea) {
      base[0] = { ...base[0], columns: [
        plainColumn('presetRank', 'Rank', (row) => row.presetRank),
        { ...plainColumn('quantScore', 'Maz Vantage Quant', (row) => row.lite?.score), render: (v) => <QuantBadge value={v} /> },
        ...base[0].columns,
      ] };
    }
    // One column per company filter, read off what a run measured. Nothing to
    // buy here: a company not yet tested simply reads n/a.
    if (chipMetrics.length) {
      base.push({ key: 'filters', label: `Filters (${chipMetrics.length})`, bags: [], columns: [
        { ...pick('marketCap'), label: 'Mkt cap' },
        ...chipMetrics.map((m): ScreenerColumn => ({
          key: m.id, label: m.label, num: true, get: (row) => valueOf(row, m.id),
          fmt: (v) => (finite(v) ? formatValue(m.kind, v) : { text: 'n/a', tone: 'na' }),
        })),
      ] });
    }
    return base;
  }, [kind, preset, chipMetrics]);

  const [activeKey, setActiveKey] = React.useState(sets[0].key);
  const active = sets.find((s) => s.key === activeKey) || sets[0];
  const [sort, setSort] = React.useState<string>(preset.idea ? 'presetRank' : preset.sort?.key || 'marketCap');
  const [dir, setDir] = React.useState<1 | -1>(preset.idea ? 1 : preset.sort?.direction ?? -1);
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<any[]>([]);
  const [load, setLoad] = React.useState<{ status: string; message?: string } | null>(null);
  const [progress, setProgress] = React.useState('');
  const [coverage, setCoverage] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [sector, setSector] = React.useState('');
  const [industry, setIndustry] = React.useState('');
  const [exchange, setExchange] = React.useState('');
  const [measuring, setMeasuring] = React.useState<{ done: number; total: number } | null>(null);
  const [measureError, setMeasureError] = React.useState('');
  const [ranges, setRanges] = React.useState<Record<string, [number | null, number | null] | null>>({});
  const [fillStatus, setFillStatus] = React.useState('');
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  // Never retry an unavailable bag in a render loop.
  const attempted = React.useRef(new WeakMap<object, Set<string>>());

  /* A saved screen opens as `?saved=<id>`: its filters are put back once,
     after the preset, country and kind have already been set by the URL. */
  const savedId = picker ? params?.get('saved') ?? null : null;
  React.useEffect(() => {
    const s = savedScreen(savedId);
    if (!s) return;
    setFilters(Array.isArray(s.filters) ? s.filters : []);
    setRanges(s.ranges && typeof s.ranges === 'object' ? s.ranges : {});
    setSector(s.sector || ''); setIndustry(s.industry || ''); setExchange(s.exchange || ''); setSearch(s.search || '');
    setPage(1);
  }, [savedId]);

  const navigate = (changes: Partial<ScreenerTarget>) => {
    const next = { country, kind, collection, ...changes };
    if (onNavigate) onNavigate(next);
    else nav.goView(next.kind === 'etfs' ? 'etfs' : 'stocks', 'screener', next);
  };

  React.useEffect(() => {
    let live = true;
    setRows([]); setLoad(null); setCoverage(''); setProgress('');
    setActiveKey(sets[0].key); setPage(1);
    setSort(preset.idea ? 'presetRank' : preset.sort?.key || 'marketCap');
    setDir(preset.idea ? 1 : preset.sort?.direction ?? -1);
    if (preset.unavailable) { setLoad({ status: 'unavailable', message: preset.unavailable }); return; }
    if (!hasApiKey()) { setLoad({ status: 'skipped', message: 'The screener is unavailable right now.' }); return; }
    const run: Promise<any> = preset.idea
      ? runScreenerPreset(preset, country, { onProgress: (done: number, total: number, stage?: string) => { if (live) setProgress(stage === 'filings' ? `Reading 13F filings ${done} of ${total}` : `Screening ${done} of ${total} companies`); } })
        .then((result: any) => {
          if (live) setCoverage(`${result.tested || 0} tested of ${result.universeSize || 0} candidates · Maz Vantage model`);
          return { status: result.state === 'empty' ? 'ok' : result.state, message: result.message, data: result.rows };
        })
      : fetchScreener(screenerParams(country, kind, collection));
    run.then((result: any) => {
      if (!live) return;
      if (result.status !== 'ok') { setLoad(result); return; }
      const data: any[] = Array.isArray(result.data) ? result.data : [];
      setRows(preset.idea ? data
        : kind === 'etfs' ? [...new Map(data.filter((r) => r?.symbol).map((r) => [r.symbol, r])).values()]
          : dedupeStocks(data, { usOnly: country === 'US' }));
      setLoad({ status: 'ok' });
    }).catch((e: any) => { if (live) setLoad({ status: 'error', message: e?.message }); });
    return () => { live = false; };
  }, [kind, country, collection]); // eslint-disable-line react-hooks/exhaustive-deps

  const sectors = React.useMemo(() => [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort(), [rows]);
  const industries = React.useMemo(
    () => [...new Set(rows.filter((r) => !sector || r.sector === sector).map((r) => r.industry).filter(Boolean))].sort(),
    [rows, sector],
  );
  const exchanges = React.useMemo(() => [...new Set(rows.map((r) => r.exchangeShortName || r.exchange).filter(Boolean))].sort(), [rows]);

  const query = search.trim().toLowerCase();
  // Everything the screener list can answer on its own: free, and instant.
  const listed = rows.filter((row) => (!query || `${row.symbol} ${row.companyName || row.name || ''}`.toLowerCase().includes(query))
    && (!preset.test || preset.test(row))
    && (!sector || row.sector === sector)
    && (!industry || row.industry === industry)
    && (!exchange || (row.exchangeShortName || row.exchange) === exchange)
    && FILTER_SPECS.every(([key, , get]) => {
      const r = ranges[key];
      if (!r) return true;
      const v = get(row);
      return finite(v) && (r[0] === null || v >= r[0]) && (r[1] === null || v <= r[1]);
    }));

  // Then the company filters, over the companies a run has measured. A
  // company not yet measured is neither in nor out — it is untested, and the
  // status line says how many of those are left.
  const activeFilters = filters.filter((f) => isActive(f) && chipMetrics.some((m) => m.id === f.metric));
  const activeMetrics = chipMetrics.filter((m) => activeFilters.some((f) => f.metric === m.id));
  const tested = activeFilters.length ? listed.filter((r) => activeMetrics.every((m) => isMeasured(r, m))) : listed;
  const matching = activeFilters.length
    ? tested.filter((r) => activeFilters.every((f) => passes(f, screenMetric(f.metric)!, valueOf(r, f.metric))))
    : [...listed];
  const unmeasured = chipMetrics.length ? listed.filter((r) => !chipMetrics.every((m) => isMeasured(r, m))) : [];
  const nextBatch = chipMetrics.length
    ? [...unmeasured].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, runCap(chipMetrics))
    : [];
  const nextCost = runCost(nextBatch, chipMetrics);
  const coverageOf = (f: ScreenFilter) => {
    const m = screenMetric(f.metric);
    const measured = m ? listed.filter((r) => isMeasured(r, m)) : [];
    return { tested: measured.length, missing: measured.filter((r) => !finite(valueOf(r, f.metric))).length };
  };

  const runFilters = async () => {
    if (measuring || !nextBatch.length) return;
    setMeasureError('');
    setMeasuring({ done: 0, total: nextBatch.length });
    try {
      await measureRows(nextBatch, chipMetrics, { onProgress: (done, total) => setMeasuring({ done, total }) });
    } catch (e: any) {
      setMeasureError(e?.message || String(e));
    }
    setMeasuring(null);
    setPage(1);
    setActiveKey('filters');
    bump();
  };

  const column = active.columns.find((c) => c.key === sort) || active.columns[0];
  const missing = (v: unknown) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
  matching.sort((a, b) => {
    const x = column.get(a);
    const y = column.get(b);
    if (missing(x)) return missing(y) ? 0 : 1;
    if (missing(y)) return -1;
    return dir * (column.num ? x - y : String(x).localeCompare(String(y)));
  });
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = matching.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const visibleKey = visible.map((r) => r.symbol).join(',');

  // Enrich only visible listings.
  React.useEffect(() => {
    const needed = visible.filter((row) => active.bags.some((b) => !row.bags?.[b] && !attempted.current.get(row)?.has(b)));
    if (!needed.length) return;
    let live = true;
    for (const row of needed) {
      const tried = attempted.current.get(row) || new Set<string>();
      active.bags.forEach((b) => tried.add(b));
      attempted.current.set(row, tried);
    }
    setFillStatus('Loading metrics…');
    fillBags(needed, [...active.bags])
      .then(() => { if (live) { setFillStatus(''); bump(); } })
      .catch(() => { if (live) setFillStatus('Some metrics are unavailable.'); });
    return () => { live = false; };
  }, [visibleKey, active.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setRanges({}); setSector(''); setIndustry(''); setExchange(''); setSearch(''); setFilters([]); setPage(1); };
  const presets: any[] = kind === 'stocks' ? SCREENER_PRESETS : ETF_COLLECTIONS;
  const noun = kind === 'etfs' ? 'ETF' : 'stock';

  return (
    <div className="grid min-w-0 gap-3" onKeyDown={(e) => { if (e.key === 'Escape') (document.activeElement as HTMLElement | null)?.blur(); }}>
      <header className="grid gap-3">
        {chrome ? (
          <h1>
            <select aria-label="Screener type" value={kind} onChange={(e) => navigate({ kind: e.target.value, collection: 'all' })}
              className="-ml-1 cursor-pointer rounded-md bg-transparent pr-1 text-[26px] font-bold tracking-[-.02em] hover:bg-accent">
              <option value="stocks">Stock Screener</option>
              <option value="etfs">ETF Screener</option>
            </select>
          </h1>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {picker ? (
            <select aria-label="Screener preset" value={collection} title={preset.title} onChange={(e) => navigate({ collection: e.target.value })}
              className={cn(selectCls, 'h-9 max-w-[340px] font-semibold')}>
              {[...new Set(presets.map((p) => p.group))].map((group) => (
                <optgroup key={group} label={group}>
                  {presets.filter((p) => p.group === group).map((p) => <option key={p.id} value={p.id} title={p.unavailable || p.note || undefined}>{p.title}</option>)}
                </optgroup>
              ))}
            </select>
          ) : null}
          <Input type="search" placeholder="Search symbol or name" aria-label="Search screener" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-9 w-64" />
          {picker ? (
            <div className="ml-auto flex items-center gap-1">
              <SavedScreensMenu kind={kind} />
              <SaveScreenButton current={() => ({
                kind, country, collection, collectionTitle: preset.title, filters, ranges, sector, industry, exchange, search,
              })} />
            </div>
          ) : null}
        </div>
      </header>
      {/* The rule a collection selects on, printed where it is applied: a
          reader cannot check a rule they cannot see. */}
      {preset.note && !preset.unavailable && picker ? <p className="max-w-[100ch] text-13 text-muted-foreground">{preset.note}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Country" value={country} onChange={(e) => navigate({ country: e.target.value })} className={selectCls}>
          <option value="WORLD">World</option>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        {FILTER_SPECS.map(([key, label]) => (
          <RangeFilter key={key} label={label} value={ranges[key] ?? null} onApply={(v) => { setRanges((r) => ({ ...r, [key]: v })); setPage(1); }} />
        ))}
        {kind === 'stocks' ? (
          <select aria-label="Sector" value={sector} onChange={(e) => { setSector(e.target.value); setIndustry(''); setPage(1); }} className={selectCls}>
            <option value="">Sector</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : null}
        {kind === 'stocks' ? (
          <select aria-label="Industry" value={industry} onChange={(e) => { setIndustry(e.target.value); setPage(1); }} className={cn(selectCls, 'max-w-[220px]')}>
            <option value="">Industry</option>
            {industries.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : null}
        <select aria-label="Exchange" value={exchange} onChange={(e) => { setExchange(e.target.value); setPage(1); }} className={selectCls}>
          <option value="">Exchange</option>
          {exchanges.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" onClick={reset} className="h-8 px-2 text-13 font-semibold text-primary hover:underline">Reset</button>
      </div>

      {kind === 'stocks' ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => (
              <FilterChip key={f.id} filter={f} coverage={coverageOf(f)}
                onChange={(next) => { setFilters((all) => all.map((x) => (x.id === f.id ? next : x))); setPage(1); }}
                onRemove={() => { setFilters((all) => all.filter((x) => x.id !== f.id)); setPage(1); }} />
            ))}
            <MetricPicker selected={filters.map((f) => f.metric)}
              onApply={(ids) => {
                setFilters((all) => [...all.filter((f) => ids.includes(f.metric)), ...ids.filter((id) => !all.some((f) => f.metric === id)).map(newFilter)]);
                setPage(1);
              }} />
          </div>
          {chipMetrics.length && load?.status === 'ok' ? (
            <FilterStatus measuring={measuring} error={measureError} active={activeFilters.length} passed={matching.length}
              tested={tested.length} listed={listed.length} unmeasured={unmeasured.length} next={nextBatch.length} cost={nextCost} onRun={runFilters} />
          ) : null}
        </div>
      ) : null}

      <nav role="tablist" aria-label="Screener views" className="flex gap-1 overflow-x-auto border-b border-border scroll-none">
        {sets.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={s.key === active.key}
            onClick={() => { setActiveKey(s.key); setPage(1); if (!s.columns.some((c) => c.key === sort)) setSort(s.columns[0].key); }}
            className={cn('-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-13 font-medium text-muted-foreground hover:text-foreground',
              s.key === active.key && 'border-foreground text-foreground')}>
            {s.label}
          </button>
        ))}
      </nav>

      {load?.status !== 'ok' ? (
        <>
          {progress ? <span aria-live="polite" className="text-tiny text-muted-foreground">{progress}</span> : null}
          <EmptyState status={load ? load.status : 'loading'} message={load?.message || 'Loading listings'} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span aria-live="polite" className="text-tiny text-muted-foreground">
              {matching.length.toLocaleString()} {noun}{matching.length === 1 ? '' : 's'}
              {coverage ? ` · ${coverage}` : rows.length === 5000 ? ' · First 5,000 listings' : ''}
            </span>
            {matching.length ? (
              <div className="flex items-center gap-1">
                <AddToListButton symbols={matching.map((r) => r.symbol)} noun={kind === 'etfs' ? 'funds' : 'companies'} />
                <CsvButton name={`${preset.title || noun} ${active.label}`}
                  title={`Download all ${matching.length.toLocaleString()} matching rows with the ${active.label} columns, in the order shown. Metrics load per page, so values not loaded yet are left blank.`}
                  build={() => exportColumns(active.columns, matching)} />
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full border-collapse text-13 tnum">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="sticky left-0 z-[1] bg-background py-2 pr-4 text-left text-micro font-medium uppercase tracking-[.05em] text-muted-foreground">Symbol</th>
                  {active.columns.map((c) => (
                    <th key={c.key} scope="col" aria-sort={sort === c.key ? (dir === 1 ? 'ascending' : 'descending') : 'none'}
                      className={cn('whitespace-nowrap px-3 py-2 text-micro font-medium uppercase tracking-[.05em] text-muted-foreground', c.num ? 'text-right' : 'text-left')}>
                      <button type="button" className={cn('uppercase hover:text-foreground', sort === c.key && 'text-foreground')}
                        onClick={() => { setDir(sort === c.key ? (dir === 1 ? -1 : 1) : -1); setSort(c.key); }}>
                        {sort === c.key ? (dir === 1 ? '↑ ' : '↓ ') : ''}{c.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.symbol} className="group border-b border-border hover:bg-accent/60">
                    <td className="sticky left-0 z-[1] bg-background py-1.5 pr-4 group-hover:bg-accent">
                      <div className="flex items-center gap-1">
                        <WatchStar symbol={row.symbol} className="-ml-1" />
                        <button type="button" title={row.companyName || row.name || row.symbol} onClick={() => nav.goSymbol(row.symbol)}
                          className="flex max-w-[260px] items-center gap-2 text-left">
                          <InstrumentMark row={row} />
                          <strong className="text-13 font-bold">{row.symbol}</strong>
                          <span className="truncate text-tiny text-muted-foreground">{row.companyName || row.name || ''}</span>
                        </button>
                      </div>
                    </td>
                    {active.columns.map((c) => (
                      <td key={c.key} className={cn('whitespace-nowrap px-3 py-1.5', c.num ? 'text-right' : 'max-w-[200px] truncate text-left')}>
                        <CellOut col={c} row={row} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {matching.length ? (
            <nav aria-label="Screener pages" className="flex flex-wrap items-center justify-end gap-3 text-tiny text-muted-foreground">
              <span aria-live="polite">{fillStatus}</span>
              <span className="tnum">{(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, matching.length)} of {matching.length.toLocaleString()}</span>
              <Button variant="outline" size="xs" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button>
              <Button variant="outline" size="xs" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button>
            </nav>
          ) : (
            <p className="py-6 text-center text-13 text-muted-foreground">
              {activeFilters.length && !tested.length ? 'No company has been tested against these filters yet.' : 'No matches. Adjust your filters.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
