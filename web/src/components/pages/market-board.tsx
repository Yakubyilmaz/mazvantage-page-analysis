'use client';

/* ==========================================================================
   Maz Vantage — one market board, two pages (`/markets/indices`, `/markets/futures`)

   Port of the legacy `marketboard.js`, `marketindices.js` and
   `marketfutures.js`. Market Indices and Futures are the same machine: a
   summary tab that compares a handful of instruments on one percentage axis,
   then a tab per collection, each the same table twice — Overview columns
   that arrive with the feed the page already loads, and Performance columns
   that cost a request per row and therefore ask first.

   Everything a page knows about its own market — which tabs, which rows fall
   under each, what the note says, what the summary compares — lives in the
   spec. `MarketBoard` knows none of it.
   ========================================================================== */

import * as React from 'react';
import {
  CURRENCY_INDICES, FUTURES_BOARDS, INDEX_BOARDS, PRICE_CHANGE_COLUMNS, countryOf, loadFuturesBoard, loadFuturesNews,
  loadHubSection, loadIndexBoard, loadIndexNews, loadPriceChanges,
} from '@/lib/markethub-data';
import { number, percent, storedCountry, changeOf } from '@/lib/market-format';
import { isNum } from '@/lib/format';
import {
  Carousel, Chevron, EmptyState, InstrumentMark, MarketHeading, NewsCard, PriceText, Signed,
} from '@/components/market/market-ui';
import { MarketChart } from '@/components/market/market-chart';
import { CompareChart } from '@/components/market/compare-chart';
import { CanvasFooter, ConsentPanel, Coverage, SeeAll } from '@/components/market/canvas';
import { ConnectionButton, Crumb, MetaDivider, PageFrame, SectionBar, useHasKey, useQueryState } from '@/components/pages/page-parts';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

interface Column { key: string; label: string; numeric?: boolean; tone?: boolean; suffix?: string }

export const OVERVIEW_COLUMNS: Column[] = [
  { key: 'name', label: 'Symbol' },
  { key: 'price', label: 'Price', numeric: true },
  { key: 'changesPercentage', label: 'Chg %', numeric: true, tone: true, suffix: '%' },
  { key: 'change', label: 'Chg', numeric: true, tone: true },
  { key: 'dayHigh', label: 'High', numeric: true },
  { key: 'dayLow', label: 'Low', numeric: true },
];

interface SummaryView {
  heading: string; note: string; quotes: any[];
  seeAll?: { label: string; tab: string };
  rail?: { heading: string; rows: any[]; tab?: string };
}

export interface BoardSpec {
  id: string; title: string; meta: string; unit: string;
  boards: { id: string; label: string }[];
  news?: { load: (o: any) => Promise<any>; note: string };
  summary: { load: (refresh: boolean) => Promise<any>; pick: (data: any) => SummaryView };
  board: {
    load: (o: any) => Promise<any>;
    performance: (symbols: string[], onProgress: (done: number, total: number) => void) => Promise<Map<string, any>>;
    rows: (id: string, data: any) => any[];
    note: (id: string, count: number, result: any, label: string) => string;
    columns: (id: string, mode: 'overview' | 'performance') => Column[] | null;
  };
}

export function MarketBoard({ spec }: { spec: BoardSpec }) {
  const nav = useNav();
  const has = useHasKey();
  const q = useQueryState();
  const TABS = [{ id: 'overview', label: 'Overview' }, ...spec.boards, ...(spec.news ? [{ id: 'news', label: 'News' }] : [])];
  const tab = TABS.some((t) => t.id === q.get('board')) ? q.get('board')! : 'overview';
  const [summary, setSummary] = React.useState<any>(null);
  const [news, setNews] = React.useState<any>(null);
  const [board, setBoard] = React.useState<any>(null);
  const [columns, setColumns] = React.useState<'overview' | 'performance'>('overview');
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 }>({ key: 'changesPercentage', dir: -1 });
  const [performance, setPerformance] = React.useState<Map<string, any>>(new Map());
  const [filling, setFilling] = React.useState<string | null>(null);
  const [instrument, setInstrument] = React.useState<any>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => { document.title = `${spec.title} — Maz Vantage`; }, [spec.title]);

  const setTab = (id: string) => {
    q.set({ board: id === 'overview' ? null : id });
    setColumns('overview');
    setSort({ key: 'changesPercentage', dir: -1 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Switching boards redraws from what is already loaded; the feed behind
     them and the summary are each fetched once per visit. The summary is on
     screen before the news is asked for, so the chart never waits on it. */
  React.useEffect(() => {
    let live = true;
    const refresh = nonce > 0;
    (async () => {
      if (tab === 'overview') {
        if (!summary || refresh) { const s = await spec.summary.load(refresh); if (live) setSummary(s); }
        if (spec.news && (!news || refresh)) { const n = await spec.news.load({ refresh }); if (live) setNews(n); }
      } else if (tab === 'news') {
        if (!news || refresh) { const n = await spec.news!.load({ refresh }); if (live) setNews(n); }
      } else if (!board || refresh) {
        const b = await spec.board.load({ refresh }); if (live) setBoard(b);
      }
    })().catch((e) => { if (live) setBoard({ status: 'error', message: String(e?.message || e), data: {} }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, has, nonce]);

  const newsBlock = (limit: number, keepReading: boolean) => {
    const items: any[] = news?.data?.articles || [];
    if (!items.length) {
      return <EmptyState status={news?.status || 'loading'} compact message={news?.message
        || (news?.status === 'ok' ? `None of the latest market stories named ${spec.id === 'futures' ? 'a contract' : 'an index'} this board tracks.` : '')} />;
    }
    return (
      <div>
        <div className="grid grid-cols-3 gap-x-[46px] gap-y-8 max-lg:grid-cols-2 max-lg:gap-x-8 max-sm:grid-cols-1">
          {items.slice(0, limit).map((item, i) => <NewsCard key={item.url || i} item={item} />)}
        </div>
        {keepReading ? (
          <button type="button" onClick={() => setTab('news')} className="mt-7 inline-flex items-center gap-1 text-13 font-medium text-primary hover:underline">Keep reading<Chevron /></button>
        ) : null}
      </div>
    );
  };

  const sectionCls = 'min-w-0 border-border pt-[34px] [&+&]:mt-2 [&+&]:border-t';
  const desc = (t: string) => <p className="-mt-4 mb-6 max-w-[92ch] text-tiny leading-relaxed text-muted-foreground">{t}</p>;

  const summaryTab = () => {
    const view = spec.summary.pick(summary?.data || {});
    const quotes = view.quotes || [];
    return (
      <>
        <section className={sectionCls}>
          <MarketHeading level="h2" title={view.heading} />
          {desc(view.note)}
          {!quotes.length ? <EmptyState status={summary?.status || 'loading'} message={summary?.message || ''} /> : (
            <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-[34px] rounded-xl border border-border p-6 max-lg:grid-cols-1 max-lg:gap-2.5 max-sm:border-0 max-sm:p-0">
              <CompareChart series={quotes.map((r) => ({ symbol: r.symbol, name: r.name, shortName: r.shortName || r.name }))} />
              <div className="flex min-w-0 flex-col max-lg:grid max-lg:grid-cols-2 max-lg:gap-x-[26px] max-sm:grid-cols-1">
                {quotes.map((row) => (
                  <button key={row.symbol} type="button" onClick={() => setInstrument(row)}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-1 py-[13px] text-left hover:bg-muted">
                    <InstrumentMark row={row} large />
                    <span className="min-w-0">
                      <strong className="block truncate text-13 font-medium">{row.shortName || row.name || row.symbol}</strong>
                      <small className="mt-1 inline-block rounded bg-accent px-1.5 py-0.5 text-micro font-semibold">{row.symbol}</small>
                    </span>
                    <span className="flex flex-col items-end gap-[3px] text-13"><PriceText row={row} /><Signed value={changeOf(row)} /></span>
                  </button>
                ))}
                <SeeAll onClick={() => setTab(view.seeAll?.tab || 'all')} className="pt-5 max-lg:col-span-full">{view.seeAll?.label || 'See all'}</SeeAll>
              </div>
            </div>
          )}
        </section>
        {view.rail?.rows?.length ? (
          <section className={sectionCls}>
            <MarketHeading level="h2" title={view.rail.heading} onClick={view.rail.tab ? () => setTab(view.rail!.tab!) : undefined} />
            <Carousel label={view.rail.heading.toLowerCase()} className="gap-3">
              {view.rail.rows.map((row) => (
                <button key={row.symbol} type="button" onClick={() => setInstrument(row)}
                  className="grid w-[210px] flex-none snap-start gap-2 rounded-xl border border-border p-3.5 text-left hover:bg-muted">
                  <span className="flex min-w-0 items-center gap-2.5"><InstrumentMark row={row} />
                    <span className="grid min-w-0"><strong className="truncate text-13 font-semibold">{row.shortName || row.symbol}</strong><small className="truncate text-micro text-muted-foreground">{row.name}</small></span>
                  </span>
                  <span className="flex items-baseline justify-between gap-2 text-13"><PriceText row={row} /><Signed value={changeOf(row)} /></span>
                </button>
              ))}
            </Carousel>
          </section>
        ) : null}
        {spec.news ? (
          <section className={sectionCls}>
            <MarketHeading level="h2" title="News" onClick={() => setTab('news')} />
            {newsBlock(9, true)}
          </section>
        ) : null}
      </>
    );
  };

  const newsTab = () => (
    <section className={sectionCls}>
      <MarketHeading level="h2" title={`${spec.title} news`} />
      {desc(spec.news!.note)}
      {newsBlock(60, false)}
      {(news?.notes || []).length ? <Coverage notes={news.notes} /> : null}
    </section>
  );

  /* ---- the board tabs ---------------------------------------------------- */

  const boardRows = (id: string) => spec.board.rows(id, board?.data || {});
  const hasPerformance = (id: string) => !!spec.board.columns(id, 'performance');
  const valueOf = (row: any, key: string) => (key.startsWith('perf:') ? performance.get(row.symbol)?.values?.[key.slice(5)] ?? null
    : key === 'name' ? String(row.name || row.symbol || '') : row[key] ?? null);

  const boardTab = () => {
    const label = TABS.find((t) => t.id === tab)?.label || spec.title;
    const rows = boardRows(tab);
    const columnSet = spec.board.columns(tab, columns) || OVERVIEW_COLUMNS;
    const sorted = [...rows].sort((a, b) => {
      const av = valueOf(a, sort.key), bv = valueOf(b, sort.key);
      if (av == null || av === '') return bv == null || bv === '' ? 0 : 1;
      if (bv == null || bv === '') return -1;
      return (typeof av === 'string' ? av.localeCompare(String(bv)) : av - bv) * sort.dir;
    });
    const missing = rows.filter((r) => r.available !== false && !performance.has(r.symbol));
    const error = board && (board.status === 'error' || board.status === 'gated') ? board.message || 'Some data could not be loaded.' : null;
    const cell = (row: any, c: Column) => {
      if (c.key === 'name') {
        return (
          <button type="button" disabled={row.available === false} onClick={() => setInstrument(row)}
            className="group/name inline-flex max-w-[330px] items-center gap-[11px] text-left max-sm:max-w-[210px]">
            <InstrumentMark row={row} />
            <span className="min-w-0">
              <strong className="block truncate text-13 font-medium group-enabled/name:group-hover/name:text-primary">{row.name || row.symbol}</strong>
              {row.symbol !== row.name ? <small className="mt-[3px] inline-block rounded bg-accent px-1.5 py-0.5 text-micro font-semibold">{row.symbol}</small> : null}
            </span>
          </button>
        );
      }
      const value = valueOf(row, c.key);
      if (!c.numeric) return <span>{value == null || value === '' ? '—' : String(value)}</span>;
      const text = !isNum(value) ? '—' : c.suffix === '%' ? percent(value) : `${value > 0 && c.tone ? '+' : ''}${number(value, 2)}`;
      return <span className={cn(c.tone && isNum(value) && value > 0 && 'text-up', c.tone && isNum(value) && value < 0 && 'text-down')}>{text}</span>;
    };
    return (
      <section className={sectionCls}>
        <div className="flex flex-wrap items-center justify-between gap-5 max-sm:gap-1">
          <h2 className="mb-7 text-[32px] font-[650] tracking-[-.035em] max-sm:text-2xl">{label}</h2>
          {hasPerformance(tab) ? (
            <div role="group" aria-label="Columns" className="mb-6 flex gap-1 rounded-lg bg-muted p-[3px]">
              {(['overview', 'performance'] as const).map((id) => (
                <button key={id} type="button" aria-pressed={columns === id}
                  onClick={() => { setColumns(id); if (id === 'performance' && sort.key === 'price') setSort({ key: 'changesPercentage', dir: -1 }); }}
                  className={cn('inline-flex items-center gap-1 rounded-md px-3.5 py-[7px] text-13 font-medium text-muted-foreground hover:text-foreground', columns === id && 'bg-background text-foreground shadow-sm')}>
                  {id === 'overview' ? 'Overview' : 'Performance'}
                  {id === 'performance' ? <i title="Loads when opened" className="not-italic text-[15px] leading-none text-primary">·</i> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {desc(spec.board.note(tab, rows.length, board, label))}
        {columns === 'performance' && hasPerformance(tab) && missing.length ? (
          has ? (
            <ConsentPanel className="mb-6" title="Performance is not loaded for this board yet." action={`Load performance for ${missing.length} ${spec.unit}`}
              busy={!!filling} busyText="Loading…" progress={filling}
              onClick={async () => {
                setFilling(' ');
                const loaded = await spec.board.performance(missing.map((r) => r.symbol), (done, total) => setFilling(`${done} of ${total}…`));
                setPerformance((prev) => new Map([...prev, ...loaded]));
                setFilling(null);
              }}>
              Performance loads for these {missing.length} rows when you ask, and is kept for ten minutes and reused by every other board.
            </ConsentPanel>
          ) : <EmptyState status="skipped" compact className="mb-6" message="Performance windows are unavailable right now." />
        ) : null}
        {error ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-border bg-muted px-4 py-3 text-13 text-muted-foreground">
            <span>{error}</span>
            <button type="button" onClick={() => setNonce((n) => n + 1)} className="rounded-md border border-border bg-background px-3 py-1.5 text-tiny text-foreground">Retry</button>
          </div>
        ) : null}
        {!board ? <EmptyState status="loading" compact /> : !sorted.length ? (
          <EmptyState status={board.status === 'ok' ? 'unavailable' : board.status}
            message={board.status === 'ok' ? `The feed returned nothing this page could place under ${label}.` : board.message || ''} />
        ) : (
          <div className="min-w-0 overflow-x-auto rounded-xl border border-border scroll-thin">
            <table className="w-max min-w-full border-collapse tnum">
              <thead>
                <tr>
                  {columnSet.map((c, i) => {
                    const on = sort.key === c.key;
                    return (
                      <th key={c.key} scope="col" aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                        className={cn('sticky top-0 z-[2] whitespace-nowrap border-b border-border bg-background px-4 py-3 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground',
                          c.numeric ? 'text-right' : 'text-left', on && 'text-foreground', i === 0 && 'left-0 z-[3]')}>
                        <button type="button" className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground', c.numeric && 'flex-row-reverse')}
                          onClick={() => setSort(on ? { key: c.key, dir: (sort.dir * -1) as 1 | -1 } : { key: c.key, dir: c.key === 'name' ? 1 : -1 })}>
                          {c.label}{on ? <span aria-hidden="true">{sort.dir === 1 ? '↑' : '↓'}</span> : null}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.symbol} className="group">
                    {columnSet.map((c, i) => (
                      <td key={c.key} className={cn('whitespace-nowrap border-b border-border px-4 py-3 text-13 group-last:border-b-0 group-hover:bg-muted max-sm:px-3 max-sm:py-2.5',
                        c.numeric && 'text-right', i === 0 && 'sticky left-0 z-[1] bg-background')}>{cell(row, c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(board?.notes || []).length ? <Coverage notes={board.notes} /> : null}
      </section>
    );
  };

  return (
    <PageFrame id={`market-${spec.id}`}>
      <header className="pb-7 pt-12 max-md:pt-9">
        <div className="mb-[11px] text-micro font-semibold uppercase tracking-[.16em] text-muted-foreground">
          <Crumb onClick={() => nav.goView('markets', 'overview')} className="uppercase">Market Data</Crumb>
        </div>
        <h1 className="text-[clamp(32px,3.8vw,58px)] font-bold leading-[1.2] tracking-[-.045em] max-sm:text-[32px]">{spec.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2.5 text-13 text-muted-foreground">
          <span>{spec.meta}</span><MetaDivider /><ConnectionButton />
        </div>
      </header>
      <SectionBar label={`${spec.title} boards`} active={tab} onSelect={setTab} items={TABS} />
      <div aria-busy={tab === 'overview' ? !summary : tab === 'news' ? !news : !board}>
        {tab === 'overview' ? summaryTab() : tab === 'news' ? newsTab() : boardTab()}
      </div>
      <CanvasFooter>Quotes may be delayed.</CanvasFooter>
      <Dialog open={!!instrument} onOpenChange={(open) => { if (!open) setInstrument(null); }}>
        <DialogContent className="max-w-[min(1100px,calc(100vw-32px))]">
          <DialogTitle className="pr-8 text-lg font-semibold">{instrument?.name || instrument?.symbol}</DialogTitle>
          {instrument ? <MarketChart meta={{ ...instrument, quote: instrument }} height={420} /> : null}
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

/* ==========================================================================
   Market Indices
   ========================================================================== */

const perfColumns = (first: string): Column[] => [
  { key: 'name', label: first },
  { key: 'changesPercentage', label: 'Chg %', numeric: true, tone: true, suffix: '%' },
  ...PRICE_CHANGE_COLUMNS.map((c: any) => ({ key: `perf:${c.key}`, label: c.label, numeric: true, tone: true, suffix: '%' })),
];
const SECTOR_COLUMNS: Column[] = [
  { key: 'name', label: 'Sector' },
  { key: 'changesPercentage', label: 'Chg %', numeric: true, tone: true, suffix: '%' },
  { key: 'exchange', label: 'Exchange' },
];

export function IndicesPage() {
  const country = countryOf(storedCountry());
  const spec: BoardSpec = {
    id: 'indices', title: 'Market Indices', meta: 'Every index quoted, by region', unit: 'indices',
    boards: INDEX_BOARDS as any,
    news: {
      load: loadIndexNews,
      note: 'Market-wide stories that name an index this board tracks, newest first — whichever country the index belongs to. Each story opens on its publisher’s site.',
    },
    summary: {
      load: (refresh) => loadHubSection('indices', { country: country.code, refresh }),
      pick: (data) => {
        // The chosen country's own indices, minus the volatility index: an
        // implied-volatility series on a performance axis is another number.
        const local = (data.quotes || []).filter((r: any) => !r.volatility);
        return {
          heading: `${country.short} market summary`,
          note: `Indices measuring the ${country.name} market, each line starting at zero on the first session of the window. Levels are points; the axis is performance.`,
          quotes: local.some((r: any) => r.summary) ? local.filter((r: any) => r.summary) : local,
          seeAll: { label: 'See all indices', tab: 'all' },
          rail: { heading: 'World indices', rows: data.worldIndices || [], tab: 'major' },
        };
      },
    },
    board: {
      load: loadIndexBoard,
      performance: loadPriceChanges as any,
      rows: (id, data) => {
        const all: any[] = data.rows || [];
        if (id === 'sectors') return data.sectors || [];
        if (id === 'all') return all;
        if (id === 'major') return all.filter((r) => r.primary);
        if (id === 'us') return all.filter((r) => r.market === 'US');
        if (id === 'currencies') return all.filter((r) => CURRENCY_INDICES.includes(r.symbol));
        const b: any = INDEX_BOARDS.find((x: any) => x.id === id);
        return b?.region ? all.filter((r) => r.region === b.region) : all;
      },
      note: (id, count, result, label) => {
        if (id === 'sectors') return 'Sectors are measured by a performance snapshot rather than S&P sector index levels, so this table carries the session move and the exchange it was measured on — no price, high or low.';
        if (id === 'currencies') return 'The US Dollar index is quoted as a futures contract; broader currency index coverage is not available.';
        if (id === 'major') return 'One benchmark for each country the Market Data picker offers.';
        if (id === 'all') return result?.status === 'ok'
          ? `Every index quoted, ${count} in all, plus the benchmarks this app names.`
          : `The ${count} benchmarks this app names. The rest of the world fills in when live data is available.`;
        if (id === 'us') return 'Indices measuring the United States market, including the volatility index.';
        return `${label}: the indices this page can place there from its own catalog or the listing suffix. Anything it cannot place stays under All indices.`;
      },
      // The sector snapshot has no price and no series behind it, so no performance view either.
      columns: (id, mode) => (id === 'sectors' ? (mode === 'performance' ? null : SECTOR_COLUMNS)
        : mode === 'performance' ? perfColumns('Index') : OVERVIEW_COLUMNS),
    },
  };
  return <MarketBoard spec={spec} />;
}

/* ==========================================================================
   Futures — collections are this app's grouping, because FMP's commodity
   feed carries no category of its own.
   ========================================================================== */

const CONTRACT_COLUMNS: Column[] = [{ key: 'name', label: 'Contract' }, ...OVERVIEW_COLUMNS.slice(1), { key: 'tradeMonth', label: 'Delivery' }];

export function FuturesPage() {
  const spec: BoardSpec = {
    id: 'futures', title: 'Futures', meta: 'Every contract quoted, by collection', unit: 'contracts',
    boards: FUTURES_BOARDS as any,
    news: {
      load: loadFuturesNews,
      note: 'Market-wide stories that name a contract this board tracks, newest first. Each story opens on its publisher’s site.',
    },
    summary: {
      load: (refresh) => loadHubSection('futures', { refresh }),
      pick: (data) => {
        const quotes = (data.quotes || []).filter((r: any) => r.available !== false);
        const summary = quotes.filter((r: any) => r.summary);
        return {
          heading: 'Futures market summary',
          note: 'The six contracts a futures board opens on, each line starting at zero on the first session of the window. Prices are the continuous front-month series, in the contract’s own currency — USX is US cents.',
          quotes: summary.length ? summary : quotes.slice(0, 6),
          seeAll: { label: 'See all futures', tab: 'all' },
          rail: { heading: 'Other contracts', rows: quotes.filter((r: any) => !r.summary), tab: 'all' },
        };
      },
    },
    board: {
      load: loadFuturesBoard,
      performance: loadPriceChanges as any,
      rows: (id, data) => {
        const all: any[] = data.rows || [];
        if (id === 'all') return all;
        const b: any = FUTURES_BOARDS.find((x: any) => x.id === id);
        return b?.group ? all.filter((r) => r.group === b.group) : all;
      },
      note: (id, count, result, label) => {
        if (id === 'all') return result?.status === 'ok'
          ? `Every contract listed, ${count} in all. Prices are the continuous front-month series; USX denotes US cents.`
          : `The ${count} contracts this app names, priced when live data is available.`;
        if (id === 'currencies') return 'The US Dollar index is quoted as a futures contract. The individual currency futures a larger board carries are not available.';
        if (id === 'indices') return 'Index futures on the US benchmarks.';
        if (id === 'rates') return 'US Treasury and fed funds contracts. Government bond futures for other countries are not available.';
        return `${label}: the contracts this page can place there. Anything it cannot place stays under All futures.`;
      },
      columns: (_id, mode) => (mode === 'performance' ? perfColumns('Contract') : CONTRACT_COLUMNS),
    },
  };
  return <MarketBoard spec={spec} />;
}
