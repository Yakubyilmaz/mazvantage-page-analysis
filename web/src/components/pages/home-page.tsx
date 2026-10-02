'use client';

/* ==========================================================================
   Maz Vantage — Home (`/`)

   Port of the legacy `home.js`. The market's front page: a banner of what the
   indices and the busiest listings are doing, the wire, and then a section per
   part of the market — the world, US stocks, funds, commodities, the economy.

   **Every section is a section that already exists somewhere in the
   product**, loaded through the same adapter and drawn with the same rows, so
   the front page cannot drift away from the pages it summarises. Nothing is
   computed here and nothing is ranked here.

   It is a **market** page: without a key it says so once, at the top, rather
   than printing the same box five times. Sections below the fold load when
   they are reached, the way the Market Data hub loads its own.

   **The front page is the world, and it stays there.** The country is fixed
   to the United States, whatever the Market Data picker last held: a picker
   is the state of the page it sits on, and a front page is where somebody
   lands without having chosen anything.

   **The reader arranges it.** Customize shows, hides and reorders the blocks
   (`lib/home-layout.ts`), and three of them are the reader's own — the
   active watchlist, recent notes, saved screens — which need no key and so
   still show when the market blocks cannot.
   ========================================================================== */

import * as React from 'react';
import { fetchMarket } from '@/lib/fmp';
import { DEFAULT_COUNTRY, HUB_SECTIONS, countryOf, loadHubSection, normalizeHubQuote, quoteMap } from '@/lib/markethub-data';
import { newsStories } from '@/lib/news-stories';
import { indicatorValue, periodOf } from '@/lib/economy-format';
import { COLLECTIONS } from '@/lib/stock-collections';
import { IDEAS, IDEA_BY_KEY } from '@/lib/ideas';
import { letterFor } from '@/lib/grading';
import { isNum } from '@/lib/format';
import { changeOf } from '@/lib/market-format';
import {
  Chevron, EmptyState, FeaturedNews, InstrumentMark, MarketHeading, PriceText, QuoteRow, Signed, StoryRow, type QuoteMap,
} from '@/components/market/market-ui';
import { MarketChart } from '@/components/market/market-chart';
import { CalendarStrip, EconomicReleaseCards } from '@/components/market/widgets';
import { EconomyMaps } from '@/components/market/economy';
import { SeeAll } from '@/components/market/canvas';
import { Snowflake, AXES } from '@/components/charts/snowflake';
import { GradePill } from '@/components/report/grade-parts';
import { PageFrame, SectionBar, useHasKey } from '@/components/pages/page-parts';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';
import { useHomeLayout, type BlockId } from '@/lib/home-layout';
import { CustomizeHome, NotesBlock, ScreensBlock, WatchlistBlock } from '@/components/pages/home-personal';

/** Rows in a ranking column. */
const RANK = 5;
/** The front page's own block: one lead, three cards under it, four beside. */
const TOP_STORIES = 8;
const MORE_STORIES = 6;
const SECTION_STORIES = 3;
/** Cards in a calendar strip before the reader is sent to the full calendar. */
const CALENDAR_EVENTS = 12;
/** Benchmarks listed beside the chart, and the same board over a section's own instruments. */
const MAJOR_INDICES = 7;
const MAJOR_QUOTES = 8;
const HOME_IDEAS = ['us-tech-top15', 'us-value-top20', 'dividend-compounders', 'compounding-growth'];
const HEADLINE_SERIES = ['realGDP', 'inflationRate', 'unemploymentRate', 'federalFunds'];

/* ---- the quant showcase ---------------------------------------------------
   Six companies with their five factor scores. A **fixture**, not a
   computation: the block ships with a sample set to show the card, the flake
   and the grade working, and says so underneath rather than letting a
   plausible-looking score imply a ranking that did not run. Each overall grade
   is the mean of its five, which is what the report does. */
const SAMPLE_QUANT = [
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'Technology', scores: { valuation: 2.75, growth: 5.0, profitability: 4.9, momentum: 4.8, health: 4.6 } },
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'Communication Services', scores: { valuation: 3.6, growth: 3.9, profitability: 4.5, momentum: 3.6, health: 4.25 } },
  { symbol: 'TSM', name: 'Taiwan Semiconductor', sector: 'Technology', scores: { valuation: 3.8, growth: 4.1, profitability: 4.3, momentum: 3.6, health: 3.75 } },
  { symbol: 'META', name: 'Meta Platforms', sector: 'Communication Services', scores: { valuation: 3.7, growth: 4.0, profitability: 4.6, momentum: 3.3, health: 3.8 } },
  { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology', scores: { valuation: 2.9, growth: 4.6, profitability: 3.5, momentum: 4.3, health: 3.8 } },
  { symbol: 'QCOM', name: 'Qualcomm', sector: 'Technology', scores: { valuation: 4.3, growth: 3.2, profitability: 4.2, momentum: 3.1, health: 3.9 } },
];
const overallOf = (scores: Record<string, number>) => {
  const values = AXES.map((a) => scores[a.key]).filter(isNum);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
};

const tabOf = (id: string, tab: string): any => HUB_SECTIONS.find((s) => s.id === id)?.tabs.find((t: any) => t.id === tab) || {};
/** The rows a quote feed actually filled, capped to a board. */
const quoted = (rows: any[] | undefined) => (rows || []).filter((r) => r.available).slice(0, MAJOR_QUOTES);
const marksOf = (items: any[]) => items.flatMap((i) => (i.marks || []).map((m: any) => m.symbol)).filter(Boolean);

/* ---------- building blocks ------------------------------------------------------ */

/**
 * One instrument charted, its peers listed beside it, and the list is the
 * chart's own control. The chart is the one the asset pages use, so its
 * ranges, crosshair and expanded view come with it.
 */
function SummaryBoard({ rows, label, seeAll, onAll }: { rows: any[]; label: string; seeAll: string; onAll: () => void }) {
  const lead = rows.find((r) => isNum(r.price)) || rows[0];
  const [symbol, setSymbol] = React.useState<string>(lead.symbol);
  const chosen = rows.find((r) => r.symbol === symbol) || lead;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-8 max-lg:grid-cols-1">
      <div className="min-w-0"><MarketChart meta={{ ...chosen, quote: chosen }} /></div>
      <section aria-label={label} className="min-w-0">
        <h3 className="mb-2 text-13 font-semibold text-muted-foreground">{label}</h3>
        <div>
          {rows.map((row) => {
            const on = row.symbol === chosen.symbol;
            const name = row.shortName || row.name || row.symbol;
            const ticker = String(row.symbol || '').replace(/^\^/, '');
            return (
              <button key={row.symbol} type="button" aria-pressed={on} aria-label={`Chart ${name}`} onClick={() => setSymbol(row.symbol)}
                className={cn('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-2 py-2.5 text-left hover:bg-muted', on && 'bg-muted')}>
                <span className="flex min-w-0 items-center gap-2.5"><InstrumentMark row={row} />
                  <span className="grid min-w-0"><strong className="truncate text-13 font-medium">{name}</strong>{ticker ? <small className="text-micro text-muted-foreground">{ticker}</small> : null}</span>
                </span>
                <span className="flex flex-col items-end gap-0.5 text-13"><PriceText row={row} /><Signed value={changeOf(row)} /></span>
              </button>
            );
          })}
        </div>
        <SeeAll onClick={onAll}>{seeAll}</SeeAll>
      </section>
    </div>
  );
}

function RankingList({ title, rows, spec, onAll, status }: { title: string; rows: any[]; spec: any; onAll?: () => void; status?: any }) {
  const nav = useNav();
  return (
    <section aria-label={title} className="min-w-0">
      <MarketHeading title={title} onClick={rows.length && onAll ? onAll : undefined} className="mb-3" />
      {rows.length ? rows.slice(0, RANK).map((r) => <QuoteRow key={r.symbol} row={r} spec={spec} onPick={(row) => nav.goSymbol(row.symbol)} />)
        : <EmptyState status={status?.status || 'unavailable'} compact message={status?.message || ''} />}
    </section>
  );
}

function CalendarBlock({ title, rows, kind, onAll, status, fallback }: { title: string; rows: any[]; kind: string; onAll: () => void; status?: any; fallback: string }) {
  const nav = useNav();
  return (
    <section className="mt-12">
      <MarketHeading title={title} onClick={rows.length ? onAll : undefined} />
      {rows.length ? <CalendarStrip rows={rows.slice(0, CALENDAR_EVENTS)} kind={kind} onSymbol={(s) => nav.goSymbol(s)} onAll={onAll} />
        : <EmptyState status={status?.status || 'unavailable'} compact message={status?.message || fallback} />}
    </section>
  );
}

/** The three newest stories of a category, under whatever they belong to. */
function StoryStrip({ category, label }: { category: string; label: string }) {
  const nav = useNav();
  const [result, setResult] = React.useState<any>(null);
  const [quotes, setQuotes] = React.useState<QuoteMap>(null);
  React.useEffect(() => {
    let live = true;
    newsStories(category).then((r) => {
      if (!live) return;
      setResult(r);
      // Three stories' symbols is one batch quote, asked for after the strip draws.
      const symbols = marksOf(r.stories.slice(0, SECTION_STORIES));
      if (symbols.length) quoteMap(symbols).then((q: any) => { if (live && q?.size) setQuotes(q); }).catch(() => { /* no change on the chips */ });
    }).catch((e) => { if (live) setResult({ status: 'error', message: String(e?.message || e), stories: [] }); });
    return () => { live = false; };
  }, [category]);
  const rows = (result?.stories || []).slice(0, SECTION_STORIES);
  return (
    <div className="mt-12">
      <MarketHeading title={label} onClick={() => nav.goView('news', category)} />
      {!result ? <EmptyState status="loading" compact />
        : rows.length ? <div>{rows.map((item: any, i: number) => <StoryRow key={item.url || i} item={item} quotes={quotes} />)}</div>
          : <EmptyState status={result.status} compact message={result.message || 'The wire returned nothing for this part of the market.'} />}
    </div>
  );
}

function QuantBlock() {
  const nav = useNav();
  return (
    <section aria-label="Top quant stocks" className="mt-12">
      <MarketHeading title="Top quant stocks" onClick={() => nav.goView('quant', 'top')} />
      <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        {SAMPLE_QUANT.map((row) => {
          const overall = overallOf(row.scores);
          return (
            <button key={row.symbol} type="button" aria-label={`${row.name} (${row.symbol}) — open the report`} onClick={() => nav.goSymbol(row.symbol)}
              className="grid justify-items-center gap-3 rounded-xl border border-border p-4 text-left hover:border-foreground">
              <span className="flex w-full min-w-0 items-center gap-2.5">
                <InstrumentMark row={{ ...row, kind: 'stock' }} />
                <span className="grid min-w-0"><strong className="truncate text-13 font-semibold">{row.name}</strong><small className="truncate text-micro text-muted-foreground">{row.sector}</small></span>
              </span>
              <span aria-hidden="true"><Snowflake scores={row.scores} size={168} labels={false} interactive={false} /></span>
              <span className="flex w-full items-center justify-between">
                <GradePill score={overall} letter={letterFor(overall)} />
                <small className="text-micro text-muted-foreground">{AXES.length} factors</small>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 max-w-[92ch] text-tiny leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
        These six are <b>sample engine output</b>, shipped so the card, the factor flake and the grade can be seen working. The tickers are real and the scores are realistic, but <b>nothing here was computed on this page</b> — open a company to see grades that were.
      </p>
    </section>
  );
}

function CollectionsBlock() {
  const nav = useNav();
  const open = (collection: string) => nav.goView('stocks', 'screener', { collection });
  return (
    <section aria-label="Stock collections" className="mt-12">
      <MarketHeading title="Stock collections" onClick={() => open('all')} />
      <div className="flex flex-wrap gap-2">
        {COLLECTIONS.map((c) => (
          <button key={c.id} type="button" title={c.note} onClick={() => open(c.id)}
            className="rounded-lg border border-border px-3.5 py-2 text-13 font-medium hover:border-foreground hover:bg-accent">{c.title}</button>
        ))}
      </div>
    </section>
  );
}

function IdeasBlock() {
  const nav = useNav();
  const picks = HOME_IDEAS.map((k) => (IDEA_BY_KEY as any)[k] || (IDEAS as any[]).find((i) => i.key === k)).filter(Boolean);
  return (
    <section aria-label="Stock ideas" className="mt-12">
      <MarketHeading title="Stock ideas" onClick={() => nav.goView('ideas', 'all')} />
      {picks.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {picks.map((idea: any) => (
            <button key={idea.key} type="button" onClick={() => nav.goIdea(idea.key)}
              className="grid content-start gap-2 rounded-xl border border-border p-4 text-left hover:border-foreground">
              <small className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{idea.group}</small>
              <h3 className="text-[15px] font-semibold leading-snug">{idea.title}</h3>
              <p className="line-clamp-3 text-tiny leading-relaxed text-muted-foreground">{idea.thesis}</p>
              <span className="inline-flex items-center gap-1 text-13 font-medium text-primary">Explore portfolio<Chevron /></span>
            </button>
          ))}
        </div>
      ) : <EmptyState status="unavailable" compact message="No investment ideas are defined." />}
    </section>
  );
}

/* ---------- a section: built empty, filled when the reader reaches it --------------- */

function HomeSection({ id, title, blurb, onOpen, mark, requested, children }: {
  id: string; title: string; blurb: string; onOpen: () => void; mark?: string; requested: boolean; children: () => React.ReactNode;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const [reached, setReached] = React.useState(requested);
  React.useEffect(() => { if (requested) setReached(true); }, [requested]);
  React.useEffect(() => {
    if (reached || !ref.current) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setReached(true); }, { rootMargin: '400px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [reached]);
  return (
    <section ref={ref} id={`home-${id}`} aria-label={title} className="min-h-[300px] scroll-mt-[126px] border-t border-border pb-8 pt-[61px] max-sm:pt-10">
      <h2 className="mb-2 flex items-center gap-2.5 text-[32px] font-[650] tracking-[-.035em] max-sm:text-2xl">
        {mark ? <span aria-hidden="true" className="text-primary">{mark}</span> : null}
        <button type="button" aria-label={`${title} — open the board`} onClick={onOpen} className="inline-flex items-center gap-1 hover:text-primary">{title}<Chevron /></button>
      </h2>
      <p className="mb-7 max-w-[92ch] text-tiny text-muted-foreground">{blurb}</p>
      {reached ? children() : <EmptyState status="loading" compact />}
    </section>
  );
}

/** Loads one hub section for a block that has been reached. */
function useHub(id: string, active = true) {
  const [res, setRes] = React.useState<any>(null);
  React.useEffect(() => {
    if (!active) return;
    let live = true;
    loadHubSection(id, { country: DEFAULT_COUNTRY }).then((r: any) => { if (live) setRes(r); })
      .catch((e: any) => { if (live) setRes({ status: 'error', message: String(e?.message || e), data: {} }); });
    return () => { live = false; };
  }, [id, active]);
  return res;
}

function MarketsBody() {
  const nav = useNav();
  const indices = useHub('indices');
  const economy = useHub('economy');
  if (!indices || !economy) return <EmptyState status="loading" compact />;
  /* One benchmark per country, which is what the hub's World view shows: the
     US primary first and the rest of the world after it. */
  const seen = new Set<string>();
  const world = [...(indices.data?.quotes || []).filter((r: any) => r.meta?.primary || r.primary), ...(indices.data?.worldIndices || [])]
    .filter((r: any) => r.available && !seen.has(r.symbol) && seen.add(r.symbol));
  const series = HEADLINE_SERIES.map((n) => economy.data?.usIndicators?.get(n)).filter(Boolean);
  return (
    <>
      {world.length ? <SummaryBoard rows={world.slice(0, MAJOR_INDICES)} label="Major indices" seeAll="See all major indices" onAll={() => nav.goView('markets', 'indices')} />
        : <EmptyState status={indices.status} compact message={indices.message || 'No index quotes came back for this market.'} />}
      <section className="mt-12">
        <MarketHeading title="The US economy" onClick={() => nav.goView('markets', 'economy')} />
        {series.length ? (
          <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {series.map((e: any) => (
              <div key={e.name} className="grid gap-1 rounded-xl border border-border px-4 py-3.5">
                <span className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{e.label}</span>
                <strong className="text-[22px] font-[650] tracking-[-.02em] tnum">{indicatorValue(e.latest?.value, e.unit)}</strong>
                <span className="text-micro text-muted-foreground">{e.latest ? periodOf(e.latest.date, e.step) : '—'}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState status={economy.status} compact message="No observation came back for the headline US series." />}
      </section>
      <StoryStrip category="indices" label="Index news" />
    </>
  );
}

function StocksBody() {
  const nav = useNav();
  const result = useHub('stocks');
  if (!result) return <EmptyState status="loading" compact />;
  const lists = result.data?.lists || {};
  const status = result.data?.listStatus || {};
  const majors = quoted(result.data?.quotes);
  const short = countryOf(DEFAULT_COUNTRY).short;
  const openStocks = () => nav.goView('markets', 'stocks');
  return (
    <>
      {majors.length ? <SummaryBoard rows={majors} label={`Major ${short} stocks`} seeAll={`See all ${short} stocks`} onAll={openStocks} />
        : <EmptyState status={result.status} compact message={result.message || 'No quotes came back for this market’s largest listings.'} />}
      <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
        {([['gainers', 'Gainers', 'gainers'], ['losers', 'Losers', 'losers'], ['volume', 'Highest volume', 'active'], ['volatility', 'Most volatile', null]] as const).map(([id, title, view]) => (
          <RankingList key={id} title={title} rows={lists[id] || []} spec={tabOf('stocks', id)} status={status[id]}
            onAll={view ? () => nav.goView('markets', view) : openStocks} />
        ))}
      </div>
      {/* Both calendars ride along with the rankings: the stocks adapter returns them with the movers. */}
      <CalendarBlock title="Earnings calendar" rows={result.data?.earnings || []} kind="earnings" onAll={() => nav.goView('calendar')}
        status={result.data?.earningsStatus} fallback="No upcoming reports were returned for this period." />
      <CalendarBlock title="IPO calendar" rows={result.data?.ipos || []} kind="ipo" onAll={openStocks}
        status={result.data?.iposStatus} fallback="No upcoming listings were returned for this period." />
      <QuantBlock />
      <CollectionsBlock />
      <IdeasBlock />
      <StoryStrip category="stocks" label="Stock news" />
    </>
  );
}

function EtfsBody() {
  const nav = useNav();
  const result = useHub('etfs');
  if (!result) return <EmptyState status="loading" compact />;
  const lists = result.data?.lists || {};
  const status = result.data?.listStatus || {};
  const majors = quoted(result.data?.quotes);
  const open = () => nav.goView('markets', 'etfs');
  return (
    <>
      {majors.length ? <SummaryBoard rows={majors} label="Major ETFs" seeAll="See all ETFs" onAll={open} />
        : <EmptyState status={result.status} compact message={result.message || 'No quotes came back for this market’s funds.'} />}
      <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
        {['volume', 'returns', 'dividendYield', 'aum'].map((id) => (
          <RankingList key={id} title={tabOf('etfs', id).label || id} rows={lists[id] || []} spec={tabOf('etfs', id)} status={status[id]} onAll={open} />
        ))}
      </div>
      <StoryStrip category="etfs" label="ETF news" />
    </>
  );
}

function CommoditiesBody() {
  const nav = useNav();
  const result = useHub('futures');
  if (!result) return <EmptyState status="loading" compact />;
  const lists = result.data?.lists || {};
  const status = result.data?.listStatus || {};
  const open = () => nav.goView('markets', 'futures');
  // The futures catalog carries the index contracts too; they belong to the hub's board, not to Commodities.
  const majors = quoted((result.data?.quotes || []).filter((r: any) => r.category !== 'indices'));
  return (
    <>
      {majors.length ? <SummaryBoard rows={majors} label="Major commodities" seeAll="See all commodities" onAll={open} />
        : <EmptyState status={result.status} compact message={result.message || 'No contract quotes came back for this period.'} />}
      <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
        {['energy', 'metals'].map((id) => (
          <RankingList key={id} title={tabOf('futures', id).label || id} rows={lists[id] || []} spec={tabOf('futures', id)} status={status[id]} onAll={open} />
        ))}
      </div>
      <StoryStrip category="futures" label="Commodities news" />
    </>
  );
}

function EconomyBody() {
  const nav = useNav();
  const result = useHub('economy');
  if (!result) return <EmptyState status="loading" compact />;
  const releases = result.data?.worldCalendar || result.data?.calendar || [];
  return (
    <>
      <EconomyMaps data={result.data || {}} status={result.status} metrics={['inflation']} />
      <section className="mt-12">
        <MarketHeading title="Economic calendar" onClick={() => nav.goView('markets', 'economy')} />
        {releases.length ? <EconomicReleaseCards rows={releases} limit={12} onAll={() => nav.goView('markets', 'economy')} />
          : <EmptyState status={result.data?.calendarStatus?.status || result.status} compact message={result.data?.calendarStatus?.message || 'No releases were returned for this period.'} />}
      </section>
      <StoryStrip category="economy" label="Economy news" />
    </>
  );
}

/* ---------- the banner and the wire ---------------------------------------------------- */

function Banner() {
  const nav = useNav();
  const [state, setState] = React.useState<{ strip: any[]; status: string; message?: string } | null>(null);
  React.useEffect(() => {
    let live = true;
    Promise.all([loadHubSection('indices', { country: DEFAULT_COUNTRY }), fetchMarket('active')]).then(([indices, active]: any[]) => {
      if (!live) return;
      const movers = (Array.isArray(active.data) ? active.data : []).map((r: any) => normalizeHubQuote(r, { kind: 'stock' })).filter((r: any) => r.available);
      const levels = (indices.data?.quotes || []).filter((r: any) => r.available);
      setState({ strip: [...levels.slice(0, 7), ...movers.slice(0, 7)], status: indices.status, message: indices.message });
    }).catch((e) => { if (live) setState({ strip: [], status: 'error', message: String(e?.message || e) }); });
    return () => { live = false; };
  }, []);
  if (!state) return <div className="h-[62px] animate-pulse rounded-lg bg-muted" />;
  if (!state.strip.length) return <EmptyState status={state.status} compact message={state.message || ''} />;
  return (
    <div tabIndex={0} role="group" aria-label="Indices and active listings" className="flex gap-2 overflow-x-auto py-1 scroll-none">
      {state.strip.map((row) => {
        const change = changeOf(row);
        return (
          <button key={row.symbol} type="button" onClick={() => (row.kind === 'index' ? nav.goView('markets', 'indices') : nav.goSymbol(row.symbol))}
            className={cn('grid min-w-[150px] flex-none gap-0.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted',
              isNum(change) && (change < 0 ? 'border-l-[3px] border-l-down' : 'border-l-[3px] border-l-up'))}>
            <span className="truncate text-tiny font-semibold">{row.shortName || row.symbol}</span>
            <span className="flex items-baseline gap-2 text-13"><PriceText row={row} /><Signed value={change} /></span>
          </button>
        );
      })}
    </div>
  );
}

function TopStories() {
  const nav = useNav();
  const [news, setNews] = React.useState<any>(null);
  const [quotes, setQuotes] = React.useState<QuoteMap>(null);
  React.useEffect(() => {
    let live = true;
    newsStories('latest').then((r) => {
      if (!live) return;
      setNews(r);
      // One batch quote for the symbols on screen; drawn without it first, filled when it lands.
      const symbols = marksOf(r.stories.slice(0, TOP_STORIES + MORE_STORIES));
      if (symbols.length) quoteMap(symbols).then((q: any) => { if (live && q?.size) setQuotes(q); }).catch(() => { /* no change on the chips */ });
    }).catch((e) => { if (live) setNews({ status: 'error', message: String(e?.message || e), stories: [] }); });
    return () => { live = false; };
  }, []);
  const featured = (news?.stories || []).slice(0, TOP_STORIES);
  const rows = (news?.stories || []).slice(featured.length, featured.length + MORE_STORIES);
  return (
    <>
      <section aria-label="Top stories" className="pt-10">
        <MarketHeading level="h2" title="Top stories" onClick={() => nav.goView('news', 'latest')} />
        {!news ? <EmptyState status="loading" compact />
          : featured.length ? <FeaturedNews stories={featured} below={3} aside={4} quotes={quotes} />
            : <EmptyState status={news.status} compact message={news.message || 'The wire returned nothing.'} />}
      </section>
      {rows.length ? (
        <section className="pb-6 pt-12">
          <MarketHeading level="h2" title="More stories" onClick={() => nav.goView('news', 'latest')} />
          <div>{rows.map((item: any, i: number) => <StoryRow key={item.url || i} item={item} quotes={quotes} />)}</div>
          <button type="button" onClick={() => nav.goView('news', 'latest')} className="mt-5 rounded-md border border-border px-4 py-2 text-13 font-medium hover:bg-accent">More market news</button>
        </section>
      ) : null}
    </>
  );
}

/* ---------- the page -------------------------------------------------------------------- */

const SECTIONS = [
  { id: 'markets', title: 'Markets summary', nav: 'Markets summary', blurb: 'Every index quoted, and the United States series behind them.', view: 'overview', Body: MarketsBody },
  { id: 'stocks', title: 'US stocks', nav: 'US stocks', mark: 'US', blurb: 'The session’s movers, the busiest books and the widest ranges, and who is due to report or list.', view: 'stocks', Body: StocksBody },
  { id: 'etfs', title: 'ETFs', nav: 'ETFs', mark: '▦', blurb: 'The funds this market trades most, and what they cost to hold in performance and distributions.', view: 'etfs', Body: EtfsBody },
  { id: 'commodities', title: 'Commodities', nav: 'Commodities', mark: '◈', blurb: 'Energy and metals contracts, quoted in US dollars or US cents, and the wire that follows them.', view: 'futures', Body: CommoditiesBody },
  { id: 'economy', title: 'Economy', nav: 'Economy', blurb: 'Headline inflation as the release calendar reports it, country by country, and what is due next.', view: 'economy', Body: EconomyBody },
] as const;

export function HomePage() {
  const nav = useNav();
  const has = useHasKey();
  const [ready, setReady] = React.useState(false);
  const [active, setActive] = React.useState<string>('markets');
  const [requested, setRequested] = React.useState<string | null>(null);
  const layout = useHomeLayout();
  // The key lives in the reader's browser, so the page decides after mounting.
  React.useEffect(() => { setReady(true); }, []);
  const shown = layout.filter((e) => e.on).map((e) => e.id);
  const marketSections = shown.map((id) => SECTIONS.find((s) => s.id === id)).filter((s): s is (typeof SECTIONS)[number] => !!s);

  // Whichever section is topmost under the strip owns the mark.
  React.useEffect(() => {
    if (!has) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActive(visible[0].target.id.replace('home-', ''));
    }, { rootMargin: '-120px 0px -65% 0px', threshold: 0 });
    for (const s of SECTIONS) { const n = document.getElementById(`home-${s.id}`); if (n) io.observe(n); }
    return () => io.disconnect();
  }, [has, shown.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = (id: string) => {
    // A jump lands on a section that has not been reached yet, so it pays for itself here.
    setRequested(id);
    setActive(id);
    document.getElementById(`home-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // `has` follows Settings, so connecting a key fills the page without a reload.
  const live = ready && has;
  const PERSONAL: Partial<Record<BlockId, () => React.ReactNode>> = {
    watchlist: () => <WatchlistBlock />,
    notes: () => <NotesBlock />,
    screens: () => <ScreensBlock />,
  };
  const block = (id: BlockId) => {
    if (PERSONAL[id]) return <React.Fragment key={id}>{PERSONAL[id]!()}</React.Fragment>;
    if (!live) return null;
    if (id === 'banner') return <div key={id} className="pt-5"><Banner /></div>;
    if (id === 'stories') return <TopStories key={id} />;
    const s = SECTIONS.find((x) => x.id === id);
    return s ? (
      <HomeSection key={s.id} id={s.id} title={s.title} blurb={s.blurb} mark={'mark' in s ? s.mark : undefined}
        requested={requested === s.id} onOpen={() => nav.goView('markets', s.view)}>
        {() => <s.Body />}
      </HomeSection>
    ) : null;
  };
  return (
    <PageFrame id="home">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-7 pt-12 max-md:pt-9">
        <div>
          <div className="mb-[11px] text-micro font-semibold uppercase tracking-[.16em] text-muted-foreground">Maz Vantage</div>
          <h1 className="text-[clamp(32px,3.8vw,58px)] font-bold leading-[1.2] tracking-[-.045em] max-sm:text-[32px]">Today’s market</h1>
          <p className="mt-4 max-w-[78ch] text-13 text-muted-foreground">Quotes, rankings and the wire. Every section below is the page it summarises, loaded as you reach it.</p>
        </div>
        {ready ? <CustomizeHome /> : null}
      </header>
      {!ready ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : (
        <>
          {!live ? (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-muted px-4 py-3 text-13 text-muted-foreground">
              <span>Live market data is unavailable right now, so quotes, rankings and the wire cannot load. Your own blocks below still work.</span>
            </div>
          ) : marketSections.length ? (
            <SectionBar label="Home sections" active={active} onSelect={jump} items={marketSections.map((s) => ({ id: s.id, label: s.nav }))} />
          ) : null}
          {shown.map(block)}
          {!shown.length ? <EmptyState status="ok" message="Every block is hidden. Customize brings them back." /> : null}
        </>
      )}
    </PageFrame>
  );
}
