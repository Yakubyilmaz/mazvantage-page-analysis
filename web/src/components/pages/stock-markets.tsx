'use client';

/* ==========================================================================
   Maz Vantage — the Stocks board (`/markets/stocks`)

   Port of the view half of the legacy `stockmarkets.js`: one market's
   equities, picked from a country select that is the page title. Five tabs,
   carried in `?board=`:

     Overview              summary chart, calendars, most traded, sector
                           performance, movers, the biggest companies and
                           employers, the prefiltered screens, ideas and news
     Quotes                the stock screener, embedded on this page
     Sectors & Industries  the market's companies filtered by classification
     Beat the Market       the three-year basket
     News                  the wire for this market's largest companies

   The prefiltered screens are the ones FMP's screener can answer by itself —
   size, price, beta, dividend, volume, sector and industry — so each costs
   the one request the page was already making (`lib/stock-collections.ts`).
   ========================================================================== */

import * as React from 'react';
import { fetchFor, fetchNewsFeed, fetchScreener, logoUrl } from '@/lib/fmp';
import { COUNTRIES, countryOf, dedupeStocks, loadHubSection } from '@/lib/markethub-data';
import { changeOf, shortNumber, storedCountry, rememberCountry } from '@/lib/market-format';
import { COLLECTIONS, aggregatePerformance, loadCountryPerformance, stockScreenParams } from '@/lib/stock-collections';
import { SCREENER_COLUMN_SETS, newTableState, type TableState } from '@/lib/market-table';
import { IDEAS } from '@/lib/ideas';
import { Carousel, EmptyState, InstrumentMark, MarketHeading, PriceText, Signed, Chevron } from '@/components/market/market-ui';
import { MarketTable } from '@/components/market/market-table';
import { CompareChart } from '@/components/market/compare-chart';
import { CalendarStrip } from '@/components/market/widgets';
import { BeatTheMarket } from '@/components/market/beat-market';
import { DedicatedScreener } from '@/components/market/dedicated-screener';
import { CanvasFooter, SeeAll } from '@/components/market/canvas';
import { Logo } from '@/components/report/ui';
import { PageFrame, SectionBar, useHasKey, useQueryState } from '@/components/pages/page-parts';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

type Board = 'overview' | 'screener' | 'sectors' | 'beat' | 'news';
const BOARDS: { id: Board; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'screener', label: 'Quotes' },
  { id: 'sectors', label: 'Sectors & Industries' },
  { id: 'beat', label: 'Beat the Market' },
  { id: 'news', label: 'News' },
];

const titleFor = (code: string) => (code === 'WORLD' ? 'World stocks' : `${countryOf(code).short} stocks`);
const rowsOf = (r: any): any[] => (Array.isArray(r?.data) ? r.data : []);
const sorted = (rows: any[], key: string) => [...rows].sort((a, b) => (b[key] || 0) - (a[key] || 0));
const safeUrl = (v: unknown) => { try { const u = new URL(String(v)); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 border-border pt-[61px] [&+&]:mt-5 [&+&]:border-t max-sm:pt-10', className)}>
      <MarketHeading level="h2" title={title} />
      {children}
    </section>
  );
}

/** Six companies, with the figure the list is ranked on. */
function Listing({ rows, metric = 'marketCap' }: { rows: any[]; metric?: string }) {
  const nav = useNav();
  return (
    <div>
      {rows.slice(0, 6).map((row) => (
        <button key={row.symbol} type="button" onClick={() => nav.goSymbol(row.symbol)}
          className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto_minmax(60px,auto)] items-center gap-3 border-b border-border py-[13px] text-left hover:bg-muted">
          <InstrumentMark row={row} />
          <span className="min-w-0"><strong className="block truncate text-13 font-medium">{row.companyName || row.name || row.symbol}</strong><small className="text-micro text-muted-foreground">{row.symbol}</small></span>
          <span className="flex flex-col items-end gap-[3px] text-13"><PriceText row={row} /><Signed value={changeOf(row)} /></span>
          <strong className="text-right text-13 font-medium tnum">{shortNumber(row[metric])}</strong>
        </button>
      ))}
    </div>
  );
}

/** One story: the symbol leads the meta line with the vendor's logo beside it. */
function StoryCard({ a }: { a: any }) {
  const href = safeUrl(a.url);
  const image = safeUrl(a.image);
  return (
    <a href={href || undefined} target="_blank" rel="noopener noreferrer" className="group grid content-start gap-2">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" className="aspect-[16/9] w-full rounded-lg bg-muted object-cover" />
      ) : null}
      <small className="flex items-center gap-1.5 text-micro text-muted-foreground">
        {a.symbol ? <Logo url={logoUrl(a.symbol)} label={a.symbol} size="sm" fallback="none" className="size-4" /> : null}
        <span>{[a.site, a.symbol, a.publishedDate].filter(Boolean).join(' · ')}</span>
      </small>
      <h3 className="text-[15px] font-semibold leading-snug group-hover:text-primary">{a.title}</h3>
    </a>
  );
}

function newsArticles(result: any, symbols: string[] | null, limit = 60) {
  const seen = new Set<string>();
  return rowsOf(result).filter((a) => {
    const url = safeUrl(a.url);
    if (!url || seen.has(url) || (symbols && !symbols.includes(a.symbol))) return false;
    seen.add(url);
    return true;
  }).sort((a, b) => String(b.publishedDate).localeCompare(String(a.publishedDate))).slice(0, limit);
}

const StoryGrid = ({ articles }: { articles: any[] }) => (
  <div className="grid grid-cols-3 gap-x-8 gap-y-8 max-lg:grid-cols-2 max-sm:grid-cols-1">{articles.map((a, i) => <StoryCard key={a.url || i} a={a} />)}</div>
);

/* ---------- the overview --------------------------------------------------------------- */

function Overview({ code }: { code: string }) {
  const nav = useNav();
  const has = useHasKey();
  const world = code === 'WORLD';
  const [base, setBase] = React.useState<any>(null);
  const [perf, setPerf] = React.useState<any>(null);
  const [extra, setExtra] = React.useState<{ news: any[]; newsStatus: string; heads: any[] } | null>(null);

  React.useEffect(() => {
    let live = true;
    setBase(null); setPerf(null); setExtra(null);
    (async () => {
      const [stock, index, universe] = await Promise.all([
        loadHubSection(world ? 'world' : 'stocks', { country: code }),
        loadHubSection('indices', { country: world ? 'US' : code }),
        has ? fetchScreener(stockScreenParams(code, 'large')) : Promise.resolve({ status: 'skipped', data: [] } as any),
      ]);
      if (!live) return;
      const data = stock.data || {};
      const largest = world ? data.lists?.largest || [] : sorted(dedupeStocks(rowsOf(universe), { usOnly: code === 'US' }), 'marketCap');
      const active = sorted(world ? data.lists?.largest || [] : data.lists?.volume || [], 'volume');
      const indices = world ? [...(index.data?.quotes || []).filter((r: any) => r.meta?.primary), ...(index.data?.worldIndices || [])]
        : (index.data?.quotes || []).filter((r: any) => !r.meta?.volatility);
      setBase({ stock, data, largest, active, indices });

      loadCountryPerformance(code).then((r) => { if (live) setPerf(r); }).catch((e) => { if (live) setPerf({ status: 'error', message: String(e?.message || e), rows: [] }); });

      const symbols = [...new Set([...largest, ...active].map((r: any) => r.symbol))].slice(0, 30);
      const [newsResult, profiles] = await Promise.all([
        !has ? Promise.resolve({ status: 'skipped', data: [] }) : world ? fetchNewsFeed('stock', { limit: 40 })
          : symbols.length ? fetchFor('news', symbols.join(',')) : Promise.resolve({ status: 'empty', data: [] }),
        world ? Promise.resolve([]) : Promise.all(largest.slice(0, 12).map((r: any) => fetchFor('profile', r.symbol))),
      ]);
      if (!live) return;
      const heads = world ? data.lists?.employers || []
        : (profiles as any[]).flatMap((p, i) => (p.status === 'ok' && p.data ? [{ ...largest[i], employees: Number(p.data.fullTimeEmployees) || null }] : [])).filter((r) => r.employees);
      setExtra({ news: newsArticles(newsResult, world ? null : symbols, 9), newsStatus: (newsResult as any).status, heads });
    })().catch((e) => { if (live) setBase({ error: String(e?.message || e) }); });
    return () => { live = false; };
  }, [code, has, world]);

  if (!base) return <EmptyState status="loading" message="Loading this stock market…" />;
  if (base.error) return <EmptyState status="error" message={base.error} />;
  const { stock, data, largest, active, indices } = base;
  const gate = (msg = 'No listings returned for this market.') => <EmptyState status={stock.status} compact message={stock.message || msg} />;
  const openScreen = (collection: string) => nav.goView('stocks', 'screener', { country: code, collection });
  const candidates = world ? perf?.rows : null;
  const gainers = candidates ? sorted(candidates.filter((r: any) => changeOf(r)! > 0), 'changesPercentage') : data.lists?.gainers || [];
  const losers = candidates ? sorted(candidates.filter((r: any) => changeOf(r)! < 0), 'changesPercentage').reverse() : data.lists?.losers || [];
  const groups = perf ? aggregatePerformance(perf.rows, 'sector') : [];
  const collectionGroups = [...new Set(COLLECTIONS.map((c) => c.group))];

  return (
    <>
      <Section title="Market summary">
        {indices.length ? <CompareChart series={indices.slice(0, 6)} /> : gate()}
      </Section>
      <Section title="IPO Calendar">
        {data.ipos?.length ? <CalendarStrip rows={data.ipos} kind="ipos" onSymbol={(s) => nav.goSymbol(s)} />
          : <EmptyState status={data.iposStatus?.status || stock.status} compact message="No upcoming IPOs returned for this market." />}
      </Section>
      <Section title="Earnings Calendar">
        {data.earnings?.length ? <CalendarStrip rows={data.earnings} onSymbol={(s) => nav.goSymbol(s)} />
          : <EmptyState status={data.earningsStatus?.status || stock.status} compact message="No upcoming earnings returned for this market." />}
      </Section>
      <Section title="Most traded">
        {active.length ? (
          <Carousel label="Most traded stocks" className="gap-3">
            {active.slice(0, 12).map((row: any) => (
              <button key={row.symbol} type="button" onClick={() => nav.goSymbol(row.symbol)}
                className="grid w-[180px] flex-none snap-start justify-items-start gap-1.5 rounded-xl border border-border p-4 text-left hover:bg-muted">
                <InstrumentMark row={row} large />
                <strong className="w-full truncate text-13 font-semibold">{row.name || row.companyName || row.symbol}</strong>
                <small className="text-micro text-muted-foreground">{row.symbol}</small>
                <span className="flex items-baseline gap-2 text-13"><PriceText row={row} /><Signed value={changeOf(row)} /></span>
              </button>
            ))}
          </Carousel>
        ) : gate()}
      </Section>
      <Section title="Sector performance">
        {!perf ? <EmptyState status="loading" compact message="Loading sector performance…" /> : (
          <>
            <p className="-mt-3 mb-6 text-tiny text-muted-foreground">Equal-weight session change among up to 250 largest companies returned for this market. Only companies with a reported change are included.</p>
            {groups.length ? (
              <div className="grid gap-x-10 md:grid-cols-2">
                {groups.map((g) => (
                  <div key={g.name} className="relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border py-2.5 text-13">
                    <strong className="truncate font-medium">{g.name}</strong>
                    <span className="text-micro text-muted-foreground">{g.count} stocks</span>
                    <Signed value={g.change} />
                    <span aria-hidden="true" className="absolute bottom-0 left-0 h-0.5" style={{ width: `${Math.min(100, Math.abs(g.change) * 10)}%`, background: g.change >= 0 ? 'var(--up)' : 'var(--down)' }} />
                  </div>
                ))}
              </div>
            ) : <EmptyState status={perf.status} compact message="No classified stock performance is available for this market." />}
          </>
        )}
        <SeeAll onClick={() => nav.goView('markets', 'stocks', { country: code, board: 'sectors' })}>Explore sectors &amp; industries</SeeAll>
      </Section>
      <div className="mt-5 grid gap-x-12 border-t border-border md:grid-cols-2">
        {([['Gainers', gainers], ['Losers', losers]] as const).map(([title, rows]) => (
          <section key={title} className="min-w-0 pt-[61px] max-sm:pt-10">
            <MarketHeading level="h2" title={title} />
            {!perf && world ? <EmptyState status="loading" compact /> : rows.length ? <Listing rows={rows} metric="volume" />
              : <EmptyState status={stock.status} compact message={`No ${title.toLowerCase()} returned for this market.`} />}
          </section>
        ))}
      </div>
      <div className="mt-5 grid gap-x-12 border-t border-border md:grid-cols-2">
        <section className="min-w-0 pt-[61px] max-sm:pt-10">
          <MarketHeading level="h2" title={world ? 'World biggest companies' : 'Biggest companies'} />
          {largest.length ? <Listing rows={largest} /> : gate()}
          <SeeAll onClick={() => openScreen('large')}>See all large-cap stocks</SeeAll>
        </section>
        <section className="min-w-0 pt-[61px] max-sm:pt-10">
          <MarketHeading level="h2" title="Largest employers" />
          {!extra ? <EmptyState status="loading" compact message="Loading reported headcounts…" />
            : extra.heads.length ? <Listing rows={sorted(extra.heads, 'employees')} metric="employees" />
              : <EmptyState status={stock.status} compact message="No reported headcounts available." />}
          <p className="mt-3 text-tiny text-muted-foreground">Reported headcounts among the largest companies shown; reporting dates vary.</p>
        </section>
      </div>
      <Section title="Stock collections">
        <div className="grid gap-5">
          {collectionGroups.map((group) => (
            <div key={group}>
              <p className="mb-2 text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">{group}</p>
              <div className="flex flex-wrap gap-2">
                {COLLECTIONS.filter((c) => c.group === group).map((c) => (
                  <button key={c.id} type="button" title={c.note} onClick={() => openScreen(c.id)}
                    className="rounded-lg border border-border px-3.5 py-2 text-13 font-medium hover:border-foreground hover:bg-accent">{c.title}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Stock Ideas">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {['us-tech-top15', 'us-value-top20', 'dividend-compounders', 'compounding-growth'].map((k) => (IDEAS as any[]).find((i) => i.key === k)).filter(Boolean).map((idea: any) => (
            <button key={idea.key} type="button" onClick={() => nav.goIdea(idea.key)}
              className="grid content-start gap-2 rounded-xl border border-border p-4 text-left hover:border-foreground">
              <small className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{idea.group}</small>
              <h3 className="text-[15px] font-semibold leading-snug">{idea.title}</h3>
              <p className="line-clamp-3 text-tiny leading-relaxed text-muted-foreground">{idea.thesis}</p>
              <span className="inline-flex items-center gap-1 text-13 font-medium text-primary">Explore portfolio<Chevron /></span>
            </button>
          ))}
        </div>
        <SeeAll onClick={() => nav.goView('ideas', 'all')}>Explore more investment ideas</SeeAll>
      </Section>
      <Section title={`${titleFor(code)} news`}>
        {!extra ? <EmptyState status="loading" compact message="Loading stock news…" />
          : extra.news.length ? <StoryGrid articles={extra.news} /> : <EmptyState status={extra.newsStatus} compact message="No stock news returned for companies in this market." />}
      </Section>
      <p className="mt-6 text-tiny text-muted-foreground">{world ? 'Selected leading US and international companies. Market caps shown in USD.' : 'Rankings cover the listed companies, with one listing per company.'}</p>
    </>
  );
}

/* ---------- sectors and industries ------------------------------------------------------ */

function screenerIdentity(row: any, goSymbol: (s: string) => void) {
  return (
    <button type="button" title={row.companyName || row.name || row.symbol} onClick={() => goSymbol(row.symbol)}
      className="flex min-w-0 max-w-[280px] items-center gap-2.5 text-left">
      <InstrumentMark row={row} className="size-7" />
      <strong className="text-13 font-semibold hover:text-primary">{row.symbol}</strong>
      <span className="truncate text-tiny text-muted-foreground">{row.companyName || row.name || ''}</span>
    </button>
  );
}

/* This tab filters by sector and industry and nothing else; the size,
   dividend and volatility screens live on the Quotes tab. */
function SectorsTab({ code }: { code: string }) {
  const nav = useNav();
  const has = useHasKey();
  const [result, setResult] = React.useState<any>(null);
  const [sector, setSector] = React.useState('');
  const [industry, setIndustry] = React.useState('');
  const [state, setState] = React.useState<TableState>(() => newTableState(SCREENER_COLUMN_SETS));
  React.useEffect(() => {
    let live = true;
    setResult(null);
    (has ? fetchScreener(stockScreenParams(code)) : Promise.resolve({ status: 'skipped', data: [] } as any))
      .then((r) => { if (live) setResult(r); }).catch((e) => { if (live) setResult({ status: 'error', message: String(e?.message || e), data: [] }); });
    return () => { live = false; };
  }, [code, has]);
  const companies = React.useMemo(() => sorted(dedupeStocks(rowsOf(result), { usOnly: code === 'US' }), 'marketCap'), [result, code]);
  if (!result) return <EmptyState status="loading" message="Loading sectors and industries…" />;
  const sectors = [...new Set(companies.map((r) => r.sector).filter(Boolean))].sort() as string[];
  const industries = [...new Set(companies.filter((r) => !sector || r.sector === sector).map((r) => r.industry).filter(Boolean))].sort() as string[];
  const rows = companies.filter((r) => (!sector || r.sector === sector) && (!industry || r.industry === industry));
  const pill = (on: boolean) => cn('rounded-full border border-border px-3 py-1.5 text-13 font-medium hover:bg-accent', on && 'border-foreground bg-foreground text-background hover:bg-foreground');
  return (
    <div className="pt-8">
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={pill(!sector)} onClick={() => { setSector(''); setIndustry(''); setState((s) => ({ ...s, page: 1 })); }}>All sectors</button>
        {sectors.map((s) => <button key={s} type="button" className={pill(sector === s)} onClick={() => { setSector(s); setIndustry(''); setState((st) => ({ ...st, page: 1 })); }}>{s}</button>)}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select aria-label="Industry" value={industries.includes(industry) ? industry : ''} onChange={(e) => { setIndustry(e.target.value); setState((s) => ({ ...s, page: 1 })); }}
          className="h-9 rounded-md border border-border bg-background px-2.5 text-13">
          <option value="">All industries ({industries.length})</option>
          {industries.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <p className="text-13 text-muted-foreground">{rows.length.toLocaleString()} of {companies.length.toLocaleString()} companies</p>
      </div>
      <p className="mb-4 text-tiny text-muted-foreground">{titleFor(code)} · up to 5,000 listed companies, grouped by sector and industry. The size, income and volatility screens are on the Quotes tab.</p>
      {result.status !== 'ok' ? <EmptyState status={result.status} message={result.message || 'Company data is unavailable right now.'} /> : (
        <MarketTable rows={rows} sets={SCREENER_COLUMN_SETS} state={state} onStateChange={setState}
          identity={(r) => screenerIdentity(r, nav.goSymbol)} emptyText="No company matches that combination." />
      )}
    </div>
  );
}

/* ---------- news -------------------------------------------------------------------------- */

function NewsTab({ code }: { code: string }) {
  const has = useHasKey();
  const [state, setState] = React.useState<{ status: string; articles: any[]; message?: string } | null>(null);
  React.useEffect(() => {
    let live = true;
    setState(null);
    (async () => {
      if (!has) return { status: 'skipped', articles: [] };
      if (code === 'WORLD') { const r = await fetchNewsFeed('stock', { limit: 60 }); return { status: r.status, articles: newsArticles(r, null) }; }
      const universe = await fetchScreener(stockScreenParams(code));
      const symbols = sorted(dedupeStocks(rowsOf(universe), { usOnly: code === 'US' }), 'marketCap').slice(0, 50).map((r) => r.symbol);
      if (!symbols.length) return { status: universe.status, articles: [] };
      const r = await fetchFor('news', symbols.join(','));
      return { status: r.status, articles: newsArticles(r, symbols) };
    })().then((s) => { if (live) setState(s); }).catch((e) => { if (live) setState({ status: 'error', articles: [], message: String(e?.message || e) }); });
    return () => { live = false; };
  }, [code, has]);
  return (
    <Section title={`${titleFor(code)} news`}>
      {!state ? <EmptyState status="loading" message="Loading stock news…" />
        : state.articles.length ? <StoryGrid articles={state.articles} />
          : <EmptyState status={state.status} message={state.message || 'No stock news returned for this market.'} />}
    </Section>
  );
}

/* ---------- the page ------------------------------------------------------------------------ */

export function StockMarkets() {
  const nav = useNav();
  const q = useQueryState();
  const stored = storedCountry(q.params);
  const code = stored === 'WORLD' ? 'WORLD' : countryOf(stored).code;
  const board: Board = BOARDS.some((b) => b.id === q.get('board')) ? q.get('board') as Board : 'overview';

  React.useEffect(() => { document.title = `${titleFor(code)} — Maz Vantage`; }, [code]);

  const go = (params: Record<string, string | null>) => nav.goView('markets', 'stocks', { country: code, ...params });
  const pickCountry = (next: string) => { rememberCountry(next); go({ country: next, board: board === 'overview' ? null : board }); };

  return (
    <PageFrame id="market-stocks">
      <header className="pb-7 pt-12 max-md:pt-9">
        <nav aria-label="Breadcrumb" className="mb-[11px] text-micro font-semibold uppercase tracking-[.16em] text-muted-foreground">
          <button type="button" className="uppercase hover:text-primary" onClick={() => nav.goView('markets', 'overview')}>Market Data</button>
          <span aria-hidden="true"> / </span>
          <button type="button" className="uppercase hover:text-primary" onClick={() => go({})}>Stocks</button>
        </nav>
        <h1>
          <select aria-label="Stock market" value={code} onChange={(e) => pickCountry(e.target.value)}
            className="max-w-full cursor-pointer appearance-none bg-transparent pr-2 text-[clamp(32px,3.8vw,58px)] font-bold leading-[1.2] tracking-[-.045em] hover:text-primary max-sm:text-[32px]">
            <option value="WORLD">World stocks</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.short} stocks</option>)}
          </select>
        </h1>
        <div className="mt-4 text-13 text-muted-foreground">Quotes may be delayed</div>
      </header>
      <SectionBar label="Stocks navigation" active={board} items={BOARDS}
        onSelect={(id) => q.set({ board: id === 'overview' ? null : id, collection: id === 'screener' ? q.get('collection') : null })} />
      {board === 'overview' ? <Overview code={code} /> : null}
      {board === 'screener' ? (
        <div className="pt-6">
          <DedicatedScreener kind="stocks" country={code} collection={q.get('collection') || 'all'} chrome={false}
            onNavigate={(next) => q.set({ country: next.country, collection: next.collection === 'all' ? null : next.collection })} />
        </div>
      ) : null}
      {board === 'sectors' ? <SectorsTab code={code} /> : null}
      {board === 'beat' ? <BeatTheMarket kind="stocks" country={code === 'WORLD' ? 'US' : code} /> : null}
      {board === 'news' ? <NewsTab code={code} /> : null}
      <CanvasFooter>Quotes may be delayed.</CanvasFooter>
    </PageFrame>
  );
}
