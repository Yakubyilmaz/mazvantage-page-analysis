'use client';

/* ==========================================================================
   Maz Vantage — the Market Data hub (`/markets`, `/markets/corporate|etfs|economy`)

   Port of the legacy `markethub.js`: instrument charts, rankings and
   calendars on one canvas. The data adapter (`lib/markethub-data.ts`) owns
   coverage, identities and every vendor field mapping; this file draws.

   - **The country picker is the page title**, and the only control that
     changes which market every section describes. No `country` in the link
     is the World view; the choice is written back into the link.
   - **Sections load when they are reached**, not with the page — each one is
     one or two requests deep, and a reader who stops at the indices should
     not pay for the economy.
   - **The strip is in-page navigation, every entry.** A section heading with
     a board of its own is where a "go somewhere" link belongs.
   - **World stocks and the world's funds** belong to the World view only.

   Three section pages reuse the canvas scoped to one section: Corporate
   Bonds, the ETF Market (which adds the ETF tables, Beat the Market and fund
   news as tabs) and the World Economy.
   ========================================================================== */

import * as React from 'react';
import {
  COUNTRIES, ETF_SECTIONS, HUB_SECTIONS, countryOf, loadEtfCollections, loadHubSection, loadIndicatorRange,
  loadUsIndicators, quoteMap,
} from '@/lib/markethub-data';
import { rememberCountry } from '@/lib/market-format';
import { newsStories } from '@/lib/news-stories';
import { etfCollection } from '@/lib/etf-collections';
import { sectorSlug } from '@/lib/nav';
import { isNum } from '@/lib/format';
import {
  Carousel, CountryFlag, EmptyState, FeaturedNews, InstrumentMark, MarketHeading, PriceText, QuoteRow, Signed,
  StoryRow, Chevron, type QuoteMap,
} from '@/components/market/market-ui';
import { MarketChart } from '@/components/market/market-chart';
import { CalendarStrip, EconomicCalendar, EconomicReleaseCards, YieldCurve } from '@/components/market/widgets';
import { CountryEconomy, EconomyIndicators, EconomyMaps, UsEconomy, type SeriesMap } from '@/components/market/economy';
import { EtfTablesBoard } from '@/components/market/etf-board';
import { BeatTheMarket } from '@/components/market/beat-market';
import { SectorsBlock } from '@/components/market/sectors-block';
import { CanvasFooter, Coverage, PanelNote, SeeAll } from '@/components/market/canvas';
import { changeOf } from '@/lib/market-format';
import { ConnectionButton, Crumb, MetaDivider, PageFrame, SectionBar, useHasKey, useQueryState } from '@/components/pages/page-parts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

type Spec = (typeof HUB_SECTIONS)[number];
type Place = ReturnType<typeof countryOf>;
export type HubSectionId = 'corporate' | 'etfs' | 'economy';

const NAV_LABELS: Record<string, string> = { indices: 'Indices', world: 'World stocks', futures: 'Futures', bonds: 'Government bonds',
  corporate: 'Corporate bonds', etfs: 'ETFs', worldEtfs: 'World ETFs', economy: 'Economy' };
const MARKS: Record<string, string> = { indices: '↗', stocks: 'US', world: '◎', futures: '◈', bonds: '▥', corporate: '▤', etfs: '▦', worldEtfs: '◍', economy: '◷' };
/* A section heading that leads somewhere reads as a link and behaves as one. */
const SECTION_PAGES: Record<string, string> = { indices: 'indices', stocks: 'stocks', world: 'stocks', futures: 'futures', corporate: 'corporate', etfs: 'etfs', worldEtfs: 'etfs', economy: 'economy' };
const PAGE_TITLE: Record<HubSectionId, string> = { corporate: 'Corporate Bonds', etfs: 'ETF Market', economy: 'World Economy' };
const WORLD_ONLY = ['world', 'worldEtfs'];
/* Only a handful of country names take an article, and they are the ones whose name says so. */
const countryPhrase = (p: Place) => `${['US', 'GB', 'NL', 'AE'].includes(p.code) ? 'the ' : ''}${p.name}`;

/* ---------- dialogs -------------------------------------------------------------- */

type DialogState =
  | { kind: 'instrument'; row: any }
  | { kind: 'list'; title: string; rows: any[]; spec: any }
  | { kind: 'events'; title: string; rows: any[]; eventKind: string }
  | { kind: 'releases'; title: string; rows: any[] }
  | null;

interface HubCtx {
  openInstrument: (row: any) => void;
  openList: (title: string, rows: any[], spec?: any) => void;
  showEvents: (title: string, rows: any[], kind: string) => void;
  showReleases: (title: string, rows: any[]) => void;
}

const LIST_SORT_LABELS: Record<string, string> = { name: 'Name', price: 'Price', changesPercentage: 'Daily change', volume: 'Volume', marketCap: 'Market cap' };

function ListDialogBody({ rows, spec, title, onPick }: { rows: any[]; spec: any; title: string; onPick: (row: any) => void }) {
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<string>(spec?.metricKey || 'marketCap');
  const [descending, setDescending] = React.useState(spec?.id !== 'losers');
  const keys = [...new Set(['name', 'price', 'changesPercentage', 'volume', 'marketCap', spec?.metricKey].filter(Boolean))] as string[];
  const needle = query.trim().toLowerCase();
  const filtered = rows.filter((r) => `${r.symbol} ${r.name}`.toLowerCase().includes(needle)).sort((a, b) => {
    const av = a[sort], bv = b[sort];
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    return (typeof av === 'string' ? av.localeCompare(String(bv)) : av - bv) * (descending ? -1 : 1);
  });
  const field = 'h-9 rounded-md border border-border bg-background px-2.5 text-13';
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol or company" aria-label={`Search ${title}`} className={cn(field, 'min-w-[180px] flex-1 px-3')} />
        <select aria-label="Sort results" value={sort} onChange={(e) => setSort(e.target.value)} className={field}>
          {keys.map((k) => <option key={k} value={k}>{LIST_SORT_LABELS[k] || spec?.metricLabel || k}</option>)}
        </select>
        <button type="button" aria-label={descending ? 'Sort ascending' : 'Sort descending'} onClick={() => setDescending((d) => !d)} className={cn(field, 'w-9 px-0')}>{descending ? '↓' : '↑'}</button>
        <span aria-live="polite" className="text-tiny text-muted-foreground">{filtered.length.toLocaleString()} instruments</span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto scroll-thin">
        {filtered.length ? filtered.map((r) => <QuoteRow key={r.symbol} row={r} spec={spec} onPick={onPick} />)
          : <EmptyState status="ok" compact message="Try another symbol or company name." />}
      </div>
    </div>
  );
}

function HubDialog({ state, onClose, onPick }: { state: DialogState; onClose: () => void; onPick: (row: any) => void }) {
  const nav = useNav();
  const title = !state ? '' : state.kind === 'instrument' ? state.row.name || state.row.symbol : state.title;
  return (
    <Dialog open={!!state} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={cn(state?.kind === 'instrument' || state?.kind === 'releases' || state?.kind === 'events' ? 'max-w-[min(1100px,calc(100vw-32px))]' : 'max-w-2xl')}>
        <DialogTitle className="pr-8 text-lg font-semibold">{title}</DialogTitle>
        {state?.kind === 'instrument' ? <MarketChart meta={{ ...state.row, quote: state.row }} height={420} /> : null}
        {state?.kind === 'list' ? <ListDialogBody rows={state.rows} spec={state.spec} title={state.title} onPick={onPick} /> : null}
        {state?.kind === 'events' ? <CalendarStrip rows={state.rows} kind={state.eventKind} onSymbol={(s) => { onClose(); nav.goSymbol(s); }} /> : null}
        {state?.kind === 'releases' ? <EconomicCalendar rows={state.rows} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- the country picker ------------------------------------------------------ */

function CountryPicker({ world, country, onPick }: { world: boolean; country: Place; onPick: (code: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const groups = [...new Set(COUNTRIES.map((p) => p.group))];
  const pick = (code: string) => { setOpen(false); onPick(code); };
  const item = (on: boolean) => cn('flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-13 hover:bg-accent', on && 'bg-accent font-semibold');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-haspopup="menu" aria-label={`Market data for ${world ? 'World' : country.name}. Choose another country`}
          className="flex items-center gap-3 text-left hover:text-primary">
          <h1 className="flex items-center gap-3 text-[clamp(32px,3.8vw,58px)] font-bold leading-[1.2] tracking-[-.045em] max-sm:text-[32px]">
            {world ? <span aria-hidden="true">🌐</span> : <CountryFlag code={country.code} large className="[&_img]:h-[.75em] [&_img]:w-auto" />}
            <span>{world ? 'World' : country.name}</span>
          </h1>
          <span aria-hidden="true" className="text-3xl text-muted-foreground">⌄</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[60vh] w-[320px] overflow-y-auto p-2 scroll-thin" role="menu" aria-label="Country">
        <button type="button" role="menuitemradio" aria-checked={world} className={item(world)} onClick={() => pick('WORLD')}>🌐 World</button>
        {groups.map((g) => (
          <div key={g}>
            <p className="px-2.5 pb-1 pt-3 text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">{g}</p>
            {COUNTRIES.filter((p) => p.group === g).map((p) => {
              const on = !world && p.code === country.code;
              return (
                <button key={p.code} type="button" role="menuitemradio" aria-checked={on} className={item(on)} onClick={() => pick(p.code)}>
                  <CountryFlag code={p.code} /><span>{p.name}</span>
                </button>
              );
            })}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- a section's chart: the quote tabs, and one chart under them ---------------- */

function ChartBlock({ quotes, label }: { quotes: any[]; label: string }) {
  const first = quotes.find((r) => isNum(r.price)) || quotes[0];
  const [symbol, setSymbol] = React.useState<string>(first.symbol);
  const selected = quotes.find((r) => r.symbol === symbol) || first;
  const railRef = React.useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? quotes.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + quotes.length) % quotes.length;
    setSymbol(quotes[next].symbol);
    const btn = railRef.current?.querySelectorAll<HTMLElement>('[role=tab]')[next];
    btn?.focus(); btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  };
  return (
    <div className="grid gap-4">
      <div ref={railRef}>
        <Carousel label={`${label} symbols`} className="gap-2">
          {quotes.map((row, i) => {
            const on = row.symbol === selected.symbol;
            return (
              <button key={row.symbol} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} aria-label={`Show ${row.shortName || row.name} chart`}
                onClick={() => setSymbol(row.symbol)} onKeyDown={(e) => onKey(e, i)}
                className={cn('flex min-w-[180px] flex-none snap-start items-center gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-left hover:bg-accent', on && 'border-border bg-muted')}>
                <InstrumentMark row={row} large />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-13 font-semibold">{row.shortName || row.name || row.symbol}</span>
                  <span className="flex items-baseline gap-2 text-13"><PriceText row={row} /><Signed value={changeOf(row)} /></span>
                </span>
              </button>
            );
          })}
        </Carousel>
      </div>
      <MarketChart meta={{ ...selected, quote: selected }} />
    </div>
  );
}

/* ---------- rankings -------------------------------------------------------------------- */

function Rankings({ spec, data, result, country, ctx, retry }: { spec: Spec; data: any; result: any; country: Place; ctx: HubCtx; retry: () => void }) {
  return (
    <div className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
      {(spec.tabs || []).map((list: any) => {
        const rows: any[] = data.lists?.[list.id] || [];
        const state = data.listStatus?.[list.id];
        const status = typeof state === 'string' ? state : state?.status || (rows.length ? 'ok' : result.status);
        const title = list.label || list.title;
        const scopeNote = list.note || (spec.id === 'world'
          ? (list.id === 'largest' ? 'Selected leading companies · market caps in USD' : 'Selected major employers · latest reported headcount')
          : spec.id === 'etfs' ? (country.code === 'US' ? 'Selected US-listed funds' : `Funds listed in ${country.name}`)
            : list.id === 'volatility' ? ((country as any).movers ? 'Intraday high–low range among active stocks and movers' : 'Intraday high–low range within the ranked listings above') : '');
        const onAll = () => ctx.openList(title, rows, list);
        return (
          <section key={list.id} id={`ranking-${spec.id}-${list.id}`} aria-label={title} className="min-w-0 scroll-mt-[126px]">
            <MarketHeading title={title} onClick={rows.length ? onAll : undefined} className="mb-2" />
            {scopeNote ? <PanelNote className="mb-3 mt-0">{scopeNote}</PanelNote> : null}
            {list.metricKey && list.metricKey !== 'changesPercentage' ? (
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(60px,auto)] gap-3 border-b border-border pb-2 text-micro text-muted-foreground">
                <span>Symbol</span><span className="text-right">Price &amp; change</span><span className="text-right">{list.metricLabel || list.metricKey}</span>
              </div>
            ) : null}
            {rows.length
              ? <div>{rows.slice(0, 6).map((r) => <QuoteRow key={r.symbol} row={r} spec={list} onPick={ctx.openInstrument} />)}</div>
              : <EmptyState status={status} compact message={state?.message || list.emptyMessage || ''} />}
            {rows.length ? <SeeAll onClick={onAll}>{list.seeAll || `See all ${title.toLowerCase()}`}</SeeAll> : null}
            {status === 'error' ? <SeeAll onClick={retry}>Retry</SeeAll> : null}
          </section>
        );
      })}
    </div>
  );
}

/* ---------- the ETF page's collections ----------------------------------------------------
   The funds whose own name states the holding, largest first, with the rule
   printed and the whole collection one click away in the screener. */

function EtfCollections({ country, ctx, openScreener }: { country: Place; ctx: HubCtx; openScreener: (collection: string) => void }) {
  const [result, setResult] = React.useState<any>(null);
  React.useEffect(() => {
    let live = true;
    setResult(null);
    loadEtfCollections(country.code).then((r: any) => { if (live) setResult(r); })
      .catch((e: any) => { if (live) setResult({ status: 'error', message: String(e?.message || e) }); });
    return () => { live = false; };
  }, [country.code]);
  return (
    <section aria-label="Fund collections" className="mt-14">
      <h2 className="mb-2 flex items-center gap-2.5 text-[32px] font-[650] tracking-[-.035em] max-sm:text-2xl"><span aria-hidden="true" className="text-primary">{MARKS.etfs}</span>ETF collections</h2>
      <p className="mb-6 text-tiny text-muted-foreground">{result ? result.note || result.message || '' : 'Loading the fund listings for this country…'}</p>
      <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
        {ETF_SECTIONS.map((item: any) => {
          const rows: any[] = result?.collections?.[item.id] || [];
          const open = () => openScreener(item.id);
          return (
            <section key={item.id} aria-label={item.title} className="min-w-0">
              <MarketHeading title={item.title} onClick={rows.length ? open : undefined} className="mb-2" />
              <PanelNote className="mb-3 mt-0">{etfCollection(item.id).note}</PanelNote>
              {!result ? <EmptyState status="loading" compact />
                : rows.length ? <div>{rows.map((r) => <QuoteRow key={r.symbol} row={r} onPick={ctx.openInstrument} />)}</div>
                  : <EmptyState status={result.status || 'ok'} compact message={result.message || `No fund listed in ${country.name} states this holding in its name.`} />}
              {rows.length ? <SeeAll onClick={open}>See all {item.title.toLowerCase()}</SeeAll> : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- the ETF page's news tab ----------------------------------------------------
   The same ETF wire Market News carries, read through the same function so the
   two can never disagree about what an ETF story is. */

const NEWS_LEAD = 4;
const NEWS_PAGE = 12;

function EtfNews() {
  const nav = useNav();
  const [result, setResult] = React.useState<any>(null);
  const [shown, setShown] = React.useState(NEWS_PAGE);
  const [quotes, setQuotes] = React.useState<QuoteMap>(null);
  React.useEffect(() => {
    let live = true;
    newsStories('etfs').then((r) => { if (live) setResult(r); }).catch((e) => { if (live) setResult({ status: 'error', message: String(e?.message || e), stories: [] }); });
    return () => { live = false; };
  }, []);
  const rows: any[] = result?.stories || [];
  const lead = rows.slice(0, NEWS_LEAD);
  const tail = rows.slice(NEWS_LEAD, NEWS_LEAD + shown);
  const wanted = [...lead, ...tail].flatMap((i) => (i.marks || []).map((m: any) => m.symbol)).filter(Boolean).join(',');
  React.useEffect(() => {
    if (!wanted) return;
    let live = true;
    // A page of rows is one batch quote, not one per story.
    quoteMap(wanted.split(',')).then((q: any) => { if (live && q?.size) setQuotes(q); }).catch(() => { /* chips carry no change */ });
    return () => { live = false; };
  }, [wanted]);
  const left = rows.length - NEWS_LEAD - tail.length;
  return (
    <div className="pt-10">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl font-[650] tracking-[-.025em]">ETF news</h2>
        <button type="button" onClick={() => nav.goView('news', 'etfs')} className="inline-flex items-center gap-1 text-13 text-primary hover:underline">The full wire on Market News<Chevron /></button>
      </div>
      <p className="mb-6 max-w-[90ch] text-13 leading-relaxed text-muted-foreground">Stories filed under one of the funds this product tracks, and market-wide stories that name one. Read from each story’s own symbol tag and a name match — nothing here is ranked, scored or sentiment-tagged, and no story is promoted.</p>
      {!result ? <EmptyState status="loading" compact />
        : !rows.length ? <EmptyState status={result.status} message={result.message || 'The wire returned no fund stories in the latest window.'} />
          : (
            <>
              <p className="mb-5 text-13 text-muted-foreground">{rows.length.toLocaleString()} {rows.length === 1 ? 'story' : 'stories'}</p>
              <FeaturedNews stories={lead} below={0} aside={NEWS_LEAD - 1} quotes={quotes} />
              <div className="mt-6">{tail.map((item, i) => <StoryRow key={item.url || i} item={item} quotes={quotes} />)}</div>
              {left > 0 ? <Button variant="outline" className="mt-5" onClick={() => setShown((n) => n + NEWS_PAGE)}>Show {Math.min(left, NEWS_PAGE)} more — {left} left</Button> : null}
            </>
          )}
    </div>
  );
}

/* ---------- the economy section -------------------------------------------------------- */

function EconomyBody({ data, result, country, worldScope, section, ctx, retry }: {
  data: any; result: any; country: Place; worldScope: boolean; section: HubSectionId | null; ctx: HubCtx; retry: () => void;
}) {
  // The charted series and the boarded ones are the same series: the rail
  // leads with the six that load with the section and gains the rest the
  // moment the board below buys them.
  const [us, setUs] = React.useState<SeriesMap>(() => new Map(data.usIndicators || []));
  const releases: any[] = section === 'economy' ? data.worldCalendar || [] : data.calendar || data.events || [];
  const calendarTitle = section === 'economy' ? 'World Economic Calendar' : `Economic Calendar · ${country.name}`;
  const openReleases = () => ctx.showReleases(calendarTitle, releases);
  return (
    <>
      {worldScope || country.code === 'US' ? (
        <>
          <EconomyIndicators data={us} status={result.status} loadRange={loadIndicatorRange as any} />
          {worldScope ? <EconomyMaps data={data} status={result.status} onRetry={retry} /> : null}
          <UsEconomy data={us} status={result.status} loadMore={async (names, onProgress) => {
            const extra = await loadUsIndicators(names, onProgress);
            setUs((prev) => new Map([...prev, ...extra]));
          }} />
        </>
      ) : (
        <CountryEconomy country={country} series={data.countryReleases || []}
          status={data.calendarStatus?.status || result.status} message={data.calendarStatus?.message || result.message} />
      )}
      {/* Cards for what is next, the table for everything: a strip is the wrong
          shape for comparing a hundred releases, so the table stays — under the
          strip on the page that exists for it, behind the heading elsewhere. */}
      <section className="mt-12">
        <MarketHeading title={calendarTitle} onClick={releases.length ? openReleases : undefined} />
        {releases.length ? <EconomicReleaseCards rows={releases} onAll={openReleases} />
          : <EmptyState status={data.calendarStatus?.status || result.status} compact message={data.calendarStatus?.message || (section === 'economy' ? 'No releases were returned for this period.' : `No releases tagged ${country.name} were returned for this period.`)} />}
      </section>
      {section === 'economy' && releases.length ? (
        <section className="mt-12">
          <MarketHeading title={`All ${releases.length.toLocaleString()} releases in this period`} />
          <EconomicCalendar rows={releases} />
        </section>
      ) : null}
    </>
  );
}

/* ---------- one section -------------------------------------------------------------------- */

function SectionBody({ spec, result, country, world, section, ctx, retry, openScreener }: {
  spec: Spec; result: any; country: Place; world: boolean; section: HubSectionId | null; ctx: HubCtx; retry: () => void;
  openScreener: (collection: string) => void;
}) {
  const nav = useNav();
  const data = result.data || {};
  const quotes: any[] = data.quotes || [];
  const nodes: React.ReactNode[] = [];
  const desc = (text: string) => <p key="desc" className="-mt-3 mb-6 max-w-[92ch] text-tiny leading-relaxed text-muted-foreground">{text}</p>;

  if (result.status === 'error' || result.status === 'gated') {
    nodes.push(
      <div key="err" className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-border bg-muted px-4 py-3 text-13 text-muted-foreground">
        <span>{result.message || 'Some data could not be loaded.'}</span>
        <button type="button" onClick={retry} className="rounded-md border border-border bg-background px-3 py-1.5 text-tiny text-foreground">Retry</button>
      </div>,
    );
  }
  // Only for one country: the World rail is every benchmark, and the fund is not in it.
  if (spec.id === 'indices' && !world && data.funds?.length) {
    // The fund sits last in the rail, so the line above the rail names it.
    nodes.push(desc(`Benchmark indices for ${country.name}, and last in the rail, ${data.funds[0].name} (${data.funds[0].symbol}) — the US-listed fund that tracks this market, priced in dollars rather than index points.`));
  }
  if (spec.id === 'corporate') nodes.push(desc(data.description || 'US-listed corporate bond ETFs. Individual corporate bond quotes, coupons and maturities are not available.'));
  if (spec.id === 'world') nodes.push(desc('International companies, with US-listed ADRs preferred and one listing per company.'));
  /* Futures genuinely cannot follow the picker: FMP's commodities feed is a
     fixed list of forty contracts traded on US exchanges. */
  if (spec.id === 'futures') nodes.push(desc('Forty global benchmark contracts, all traded on US exchanges and quoted in US dollars or US cents. No local contract is listed — there is no DAX, Nikkei or Euro Stoxx future here, and the index futures are the four US ones — so this section reads the same under every country.'));
  if (spec.id === 'stocks' && !(country as any).movers) nodes.push(desc(`Whole-market mover lists exist for US exchanges only. These rankings cover the largest listings in ${country.name}, ranked on the latest quotes.`));

  if (spec.id === 'bonds') {
    nodes.push(data.unavailable ? <EmptyState key="b" status="unavailable" message={data.unavailable} /> : (
      <React.Fragment key="b"><MarketHeading title="Yield curve" /><YieldCurve rows={data.curve || []} /></React.Fragment>
    ));
  } else if (spec.id === 'economy') {
    /* Two of the three blocks are not about the country in the picker: the
       charted series are a US dataset and the maps are every country at once.
       A reader who picked France came for France, so under a country the
       section is that country's own releases instead. */
    nodes.push(<EconomyBody key="e" data={data} result={result} country={country} worldScope={section === 'economy' || world} section={section} ctx={ctx} retry={retry} />);
  } else if (quotes.length) {
    nodes.push(<ChartBlock key={`chart-${country.code}`} quotes={quotes} label={spec.title} />);
  }

  const worldIndices: any[] = data.worldIndices?.length ? data.worldIndices : data.lists?.world || [];
  if (spec.id === 'indices' && worldIndices.length) {
    nodes.push(
      <section key="wi" className="mt-10">
        <MarketHeading title="World indices" onClick={() => ctx.openList('World indices', worldIndices)} />
        <Carousel label="world indices" className="gap-3">
          {worldIndices.map((row) => (
            <button key={row.symbol} type="button" onClick={() => ctx.openInstrument(row)}
              className="grid w-[210px] flex-none snap-start gap-2 rounded-xl border border-border p-3.5 text-left hover:bg-muted">
              <span className="flex min-w-0 items-center gap-2.5"><InstrumentMark row={row} />
                <span className="grid min-w-0"><strong className="truncate text-13 font-semibold">{row.shortName || row.symbol}</strong><small className="truncate text-micro text-muted-foreground">{row.name}</small></span>
              </span>
              <span className="flex items-baseline justify-between gap-2 text-13"><PriceText row={row} /><Signed value={changeOf(row)} /></span>
            </button>
          ))}
        </Carousel>
      </section>,
    );
  }
  if (spec.tabs?.length && spec.id !== 'indices') nodes.push(<Rankings key="r" spec={spec} data={data} result={result} country={country} ctx={ctx} retry={retry} />);
  // Only on the page that leads with them: the overview would be paying for listings nobody asked for.
  if (spec.id === 'etfs' && section === 'etfs') nodes.push(<EtfCollections key="ec" country={country} ctx={ctx} openScreener={openScreener} />);
  if (spec.id === 'stocks' || spec.id === 'world') {
    for (const [key, title, kind] of [['earnings', 'Earnings Calendar', 'earnings'], ['ipos', 'IPO Calendar', 'ipo']] as const) {
      const rows: any[] = data[key] || [];
      const st = data[`${key}Status`];
      nodes.push(
        <section key={key} className="mt-12">
          <MarketHeading title={title} onClick={rows.length ? () => ctx.showEvents(title, rows, kind) : undefined} />
          {rows.length
            ? <CalendarStrip rows={rows} kind={kind} onSymbol={(s) => nav.goSymbol(s)} onAll={() => ctx.showEvents(title, rows, kind)} />
            : <EmptyState status={st?.status || result.status} compact message={st?.message || (result.status === 'ok' ? `No upcoming ${kind === 'ipo' ? 'listings' : 'reports'} were returned for this period.` : '')} />}
        </section>,
      );
    }
  }
  const notes = [...(result.notes || []), ...(data.notes || [])].filter(Boolean);
  if (notes.length) nodes.push(<Coverage key="cov" notes={notes} />);
  if (!nodes.length) nodes.push(<EmptyState key="empty" status={result.status} message={result.message} />);
  return <>{nodes}</>;
}

function HubSection({ spec, country, world, section, requested, onLoaded, ctx, openScreener }: {
  spec: Spec; country: Place; world: boolean; section: HubSectionId | null; requested: boolean;
  onLoaded: (id: string) => void; ctx: HubCtx; openScreener: (collection: string) => void;
}) {
  const nav = useNav();
  const ref = React.useRef<HTMLElement>(null);
  const [wanted, setWanted] = React.useState(requested);
  const [result, setResult] = React.useState<any>(null);
  const [nonce, setNonce] = React.useState(0);

  // Load when the section comes within reach of the viewport, or when asked for.
  React.useEffect(() => { if (requested) setWanted(true); }, [requested]);
  React.useEffect(() => {
    if (wanted || !ref.current) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setWanted(true); }, { rootMargin: '350px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [wanted]);

  React.useEffect(() => {
    if (!wanted) return;
    let live = true;
    loadHubSection(spec.id, { country: country.code, refresh: nonce > 0, usSeries: section === 'economy' || world || country.code === 'US' })
      .then((r: any) => {
        if (!live) return;
        let res = { ...r };
        if (world && spec.id === 'indices') {
          const all = [...(res.data.quotes || []).filter((q: any) => q.meta?.primary || q.primary), ...(res.data.worldIndices || [])];
          res = { ...res, data: { ...res.data, quotes: all, lists: { ...res.data.lists, home: all } } };
        }
        setResult(res);
        onLoaded(spec.id);
      })
      .catch((e) => { if (live) setResult({ status: 'error', message: String(e?.message || e), data: {} }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, nonce, spec.id, country.code, world, section]);

  const local = spec.id === 'stocks' && country.code !== 'US';
  const title = spec.id === 'stocks' ? `${country.short} stocks`
    : spec.id === 'indices' ? `${world ? 'World' : country.short} indices`
      : spec.id === 'etfs' ? `ETFs of ${countryPhrase(country)}` : spec.title;
  const scope = result?.data?.scopeLabel
    || (spec.scope === 'global' ? 'Global' : spec.scope === 'us' && country.code !== 'US' ? 'United States' : null);
  const page = section ? null : SECTION_PAGES[spec.id];
  const retry = () => setNonce((n) => n + 1);

  return (
    <section ref={ref} id={`market-${spec.id}`} aria-label={`${title}${scope ? ` · ${scope}` : ''}`} aria-busy={wanted && !result}
      className="min-h-[350px] scroll-mt-[126px] border-border pb-[30px] pt-[61px] [&+&]:mt-5 [&+&]:border-t max-sm:pt-10">
      {section === 'economy' ? null : (
        <h2 className="mb-7 flex flex-wrap items-center gap-2.5 text-[32px] font-[650] tracking-[-.035em] max-sm:text-2xl">
          <span aria-hidden="true" className={cn('text-primary', local && 'rounded bg-primary/10 px-1.5 text-lg')}>{local ? country.code : MARKS[spec.id]}</span>
          {page ? (
            <button type="button" aria-label={`${title} — open the board`} className="inline-flex items-center gap-1 hover:text-primary"
              onClick={() => nav.goView('markets', page, { country: spec.id === 'world' ? 'WORLD' : country.code })}>{title}<Chevron /></button>
          ) : title}
          {scope ? <span title={`This section covers ${scope.toLowerCase() === 'global' ? 'every market' : scope}`} className="rounded-full bg-accent px-2.5 py-1 text-micro font-medium tracking-normal text-muted-foreground">{scope}</span> : null}
        </h2>
      )}
      {result ? <SectionBody spec={spec} result={result} country={country} world={world} section={section} ctx={ctx} retry={retry} openScreener={openScreener} />
        : <EmptyState status="loading" compact />}
    </section>
  );
}

/* ==========================================================================
   The page
   ========================================================================== */

const ETF_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tables', label: 'ETF Tables' },
  { id: 'beat', label: 'Beat the Market' },
  { id: 'news', label: 'News' },
] as const;
type EtfTab = (typeof ETF_TABS)[number]['id'];

export function MarketHub({ section = null }: { section?: HubSectionId | null }) {
  const nav = useNav();
  const has = useHasKey();
  const q = useQueryState();
  const asked = q.get('country');
  const world = !asked || asked.toUpperCase() === 'WORLD';
  const country = countryOf(world ? 'US' : asked);
  const specs = HUB_SECTIONS.filter((s) => s.id !== 'bonds' && (section ? s.id === section : world || !WORLD_ONLY.includes(s.id)));
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [requested, setRequested] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string>(section || specs[0]?.id);
  const pendingJump = React.useRef<string | null>(null);
  const etfTab: EtfTab = section === 'etfs' && ETF_TABS.some((t) => t.id === q.get('board')) ? q.get('board') as EtfTab : 'overview';

  React.useEffect(() => { if (section) document.title = `${PAGE_TITLE[section]} — Maz Vantage`; }, [section]);
  // A new country rebuilds every section; the one a reader jumped to under the
  // old country is not a request under the new one, and the top section is.
  React.useEffect(() => { setRequested(null); }, [world, country.code]);

  const ctx: HubCtx = React.useMemo(() => ({
    // A company opens its report; anything else opens its chart where it is.
    openInstrument: (row) => {
      const kind = row.kind || row.meta?.kind || 'stock';
      if (['stock', 'equity'].includes(kind)) nav.goSymbol(row.symbol);
      else setDialog({ kind: 'instrument', row });
    },
    openList: (title, rows, spec = {}) => setDialog({ kind: 'list', title, rows, spec }),
    showEvents: (title, rows, eventKind) => setDialog({ kind: 'events', title, rows, eventKind }),
    showReleases: (title, rows) => setDialog({ kind: 'releases', title, rows }),
  }), [nav]);

  /** Leave for the ETF Screener, on one collection, in the market this page is scoped to. */
  const openScreener = (collection = 'all') => nav.goView('etfs', 'screener', { country: country.code, kind: 'etfs', collection });

  const setCountry = (code: string) => {
    rememberCountry(code);
    q.set({ country: code === 'WORLD' ? null : code });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Scroll to a section, and pay for it on the way. Loading re-lays out the
     page and cancels an in-flight smooth scroll, so the scroll is made twice:
     once now, so the click visibly does something, and once after the load
     settles — unless the reader took the wheel in between. */
  const jump = React.useCallback((id: string) => {
    const node = document.getElementById(`market-${id}`);
    if (!node) return;
    setActive(id);
    setRequested(id);
    pendingJump.current = id;
    history.replaceState(history.state, '', `${location.pathname}${location.search}#market-${id}`);
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const takeOver = () => { pendingJump.current = null; };
    addEventListener('wheel', takeOver, { passive: true, once: true });
    addEventListener('touchstart', takeOver, { passive: true, once: true });
    addEventListener('keydown', takeOver, { once: true });
  }, []);
  const onLoaded = React.useCallback((id: string) => {
    if (pendingJump.current !== id) return;
    pendingJump.current = null;
    // After React has committed the loaded section (a timeout rather than a
    // frame: frames do not run in a background tab, and the jump must still land).
    setTimeout(() => {
      document.getElementById(`market-${id}`)?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
    }, 60);
  }, []);

  // The strip follows the reader down the page.
  React.useEffect(() => {
    if (section) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActive(visible[0].target.id.replace('market-', ''));
    }, { rootMargin: '-110px 0px -65% 0px', threshold: 0 });
    for (const s of specs) { const n = document.getElementById(`market-${s.id}`); if (n) io.observe(n); }
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, world, country.code]);

  // A link that names a section lands on it.
  React.useEffect(() => {
    const hash = location.hash.replace('#market-', '');
    if (hash && specs.some((s) => s.id === hash)) setTimeout(() => jump(hash), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navLabel = (s: Spec) => (s.id === 'stocks' ? `${country.short} stocks` : s.id === 'etfs' ? `${country.short} ETFs` : NAV_LABELS[s.id] || s.title);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const bar = () => {
    if (section === 'etfs') {
      return <SectionBar label="ETF market" active={etfTab} onSelect={(id) => q.set({ board: id === 'overview' ? null : id })} items={ETF_TABS.map((t) => ({ id: t.id, label: t.label }))} />;
    }
    if (section) {
      const items: { id: string; label: string }[] = [{ id: `market-${section}`, label: 'Overview' }];
      if (section === 'economy') {
        items.push({ id: 'economy-chart', label: 'Indicators' }, { id: 'economy-map-gdp', label: 'GDP growth' },
          { id: 'economy-map-inflation', label: 'Inflation' }, { id: 'economy-us', label: 'United States' });
      }
      for (const list of specs[0]?.tabs || []) items.push({ id: `ranking-${section}-${list.id}`, label: list.label });
      return <SectionBar label={`${PAGE_TITLE[section]} sections`} active={active.startsWith('market-') || active === section ? `market-${section}` : active}
        onSelect={(id) => { setActive(id); scrollTo(id); }} items={items} />;
    }
    return <SectionBar label="Market sections" active={active} onSelect={jump} items={specs.map((s) => ({ id: s.id, label: navLabel(s) }))} />;
  };

  const sections = specs.map((spec) => (
    <HubSection key={`${spec.id}:${world ? 'WORLD' : country.code}`} spec={spec} country={country} world={world} section={section}
      requested={requested === spec.id || (!requested && spec.id === (section || 'indices'))} onLoaded={onLoaded} ctx={ctx} openScreener={openScreener} />
  ));
  /* Sectors sits above the equity sections: it is the breakdown of the market
     those sections then rank inside. Only on the overview — a page about one
     asset class does not want a sector map of the whole market. */
  if (!section) {
    const at = specs.findIndex((s) => s.id === 'stocks');
    const openAll = () => nav.goView('sectors', 'all');
    sections.splice(at < 0 ? sections.length : at, 0, (
      <div key="sectors" className="mt-5 border-t border-border">
        <SectorsBlock onOpen={openAll} onAll={openAll} first
          onSectorPage={(s) => nav.goView('sectors', sectorSlug(s))} onIndustry={(i) => nav.goIndustry(i)} />
      </div>
    ));
  }

  return (
    <PageFrame id={section ? `market-page-${section}` : 'market-overview'}>
      <header className="pb-7 pt-12 max-md:pt-9">
        {section ? (
          <>
            <div className="mb-[11px] text-micro font-semibold uppercase tracking-[.16em] text-muted-foreground">
              <Crumb onClick={() => nav.goView('markets', 'overview')} className="uppercase">Market Data</Crumb>
            </div>
            <h1 className="text-[clamp(32px,3.8vw,58px)] font-bold leading-[1.2] tracking-[-.045em] max-sm:text-[32px]">{PAGE_TITLE[section]}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2.5 text-13 text-muted-foreground">
              <ConnectionButton />
              {section === 'etfs' ? (
                <>
                  <MetaDivider />
                  <span className="inline-flex items-center gap-1.5"><CountryFlag code={country.code} />Overview scoped to {countryPhrase(country)}</span>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="mb-[11px] text-micro font-semibold uppercase tracking-[.16em] text-muted-foreground">Market Data</div>
            <CountryPicker world={world} country={country} onPick={setCountry} />
            <div className="mt-4 flex flex-wrap items-center gap-2.5 text-13 text-muted-foreground">
              <span>{world ? 'Global markets: indices, equities, funds and releases' : `Indices, equities, funds and releases for ${country.name}`}</span>
              <MetaDivider />
              <ConnectionButton />
            </div>
          </>
        )}
      </header>
      {bar()}
      {!has ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-muted px-4 py-3 text-13 text-muted-foreground">
          <span>Live market data is unavailable right now, so quotes, charts and calendars cannot load.</span>
        </div>
      ) : null}
      <div hidden={section === 'etfs' && etfTab !== 'overview'}>{sections}</div>
      {section === 'etfs' && etfTab === 'tables' ? (
        <EtfTablesBoard initial={q.get('table')} onPick={ctx.openInstrument} onBoard={(id) => q.set({ table: id })} onScreener={() => openScreener()} />
      ) : null}
      {/* The same basket the Stocks page carries, pointed at funds: one rule, one benchmark. */}
      {section === 'etfs' && etfTab === 'beat' ? <BeatTheMarket kind="etfs" country={country.code} /> : null}
      {section === 'etfs' && etfTab === 'news' ? <EtfNews /> : null}
      <CanvasFooter>Quotes may be delayed.</CanvasFooter>
      <HubDialog state={dialog} onClose={() => setDialog(null)} onPick={ctx.openInstrument} />
    </PageFrame>
  );
}
