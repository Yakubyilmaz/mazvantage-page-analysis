'use client';

/* ==========================================================================
   Maz Vantage — the sector pages (`/sectors/<sub>`)

   Port of the legacy `sectorpage.js`. Three destinations, all on the market
   canvas and all owning their own screen:

     /sectors                          the breakdown across all eleven
     /sectors/technology               one sector
     /sectors/industry?industry=…      one industry

   An industry has no fixed list to slug against — the vendor publishes about
   130 of them and renames them — so its name travels in the query rather than
   in the path, and `industry` is a hidden nav entry for exactly this reason.

   The breakdown ranks the sectors on what this report actually knows about
   them. Session performance and an aggregate multiple come from the vendor and
   are the same figures anyone has; the **median composite score** is ours,
   read off the distribution each sector's grades are computed against.

   **Why the grades are behind a button.** A group's table is one screener
   call. Grading it is two more per company — a hundred requests for fifty
   rows — so it does not happen until somebody asks, and the button says what
   it will cost. Same rule for the industry index and the fund search.
   ========================================================================== */

import * as React from 'react';
import { ago, dec, fmtDate, isNum, money, pct } from '@/lib/format';
import { fetchFor, logoUrl, mapLimited, type FeedResult } from '@/lib/fmp';
import { MAX_SCORE, letterFor, sectorLookup, type Histogram, type SectorStats } from '@/lib/grading';
import { computeReturns, normalisePrices, RETURN_SPANS, scoreLite } from '@/lib/model';
import { FACTOR_KEYS, FACTOR_BY_KEY } from '@/lib/factors';
import { SECTORS, MARKET_ETF, sectorFromSlug, sectorSlug } from '@/lib/nav';
import {
  CHART_POINTS, EXPOSURE_MEMBERS, INDEX_MEMBERS, SECTOR_BLURB, TOP_N, WINDOWS,
  align, averageFor, buildMemberIndex, fundsHolding, loadBreakdown, loadCountryRows, loadGroup, loadGroupNews,
  medianOfBins, quoteFunds, thin, windowStart,
  type Breakdown, type BuiltIndex, type CountryRow, type GroupData, type IndustryRow, type Member, type Point,
  type QuotedFund, type SectorRow, type Universe, type WindowKey,
} from '@/lib/sectors';
import { MultiLineChart } from '@/components/charts/charts';
import { DenseTable, NA, TickerButton, type DenseColumn } from '@/components/market/dense-table';
import {
  CanvasFooter, CanvasSection, Chip, ChipRow, ConsentButton, Coverage, Description, PanelNote, RangeSelect,
  SeeAll, SignedPct, SignedReturn, StatGrid,
} from '@/components/market/canvas';
import { EmptyState } from '@/components/market/market-ui';
import { SectorsBlock } from '@/components/market/sectors-block';
import { GradePill } from '@/components/report/grade-parts';
import { Logo, Notice } from '@/components/report/ui';
import { ConnectionButton, Crumb, MetaDivider, PageFrame, PageHero, SectionBar, useHasKey, useQueryState } from '@/components/pages/page-parts';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

export function SectorsPage({ sub }: { sub: string | null }) {
  const q = useQueryState();
  if (sub === 'industry') {
    const name = q.get('industry');
    return name ? <GroupPage key={`i:${name}`} kind="industry" name={name} /> : <BreakdownPage />;
  }
  const sector = sub ? sectorFromSlug(sub) : null;
  return sector ? <GroupPage key={`s:${sector}`} kind="sector" name={sector} /> : <BreakdownPage />;
}

/** Jump to a section, and keep the bar's underline on it. */
function useJumpBar<T extends string>(first: T) {
  const [active, setActive] = React.useState<T>(first);
  const jump = (id: T) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return { active, jump };
}

/* ==========================================================================
   1. The breakdown — every sector on one canvas

   The block leads, because it is the only thing here that shows what the
   market is *made of* rather than only how it moved; the table under it
   carries the measure a bar chart never had: the tracking ETF's return over
   five windows, which is what "the sector was up 12%" means.
   ========================================================================== */

type Grain = 'sectors' | 'industries' | 'countries';

function BreakdownPage() {
  const nav = useNav();
  const has = useHasKey();
  const bar = useJumpBar<'market-sectors' | 'sector-performance'>('market-sectors');
  const [grain, setGrain] = React.useState<Grain>('sectors');
  const [loaded, setLoaded] = React.useState<Breakdown | { error: string } | null>(null);
  // The country grain is two requests of its own, so it is fetched the first
  // time it is asked for rather than with the page.
  const [countries, setCountries] = React.useState<CountryRow[] | { error: string } | null>(null);

  React.useEffect(() => { document.title = 'Sectors — Maz Vantage'; }, []);

  React.useEffect(() => {
    setLoaded(null); setCountries(null);
    let live = true;
    loadBreakdown()
      .then((r) => { if (live) setLoaded(r); })
      .catch((e) => { if (live) setLoaded({ error: String(e?.message || e) }); });
    return () => { live = false; };
  }, [has]);

  React.useEffect(() => {
    if (grain !== 'countries' || countries) return;
    let live = true;
    loadCountryRows()
      .then((r) => { if (live) setCountries(r); })
      .catch((e) => { if (live) setCountries({ error: String(e?.message || e) }); });
    return () => { live = false; };
  }, [grain, countries]);

  const ok = loaded && !('error' in loaded) ? loaded : null;
  const NOTES: Record<Grain, string> = {
    sectors: 'Eleven sectors, each measured twice: the Day column is the session snapshot, which counts every member equally, and the return windows are the tracking ETF’s, which weight members by size. On a day the megacaps move against the tail the two disagree, and that disagreement is the point rather than an error.',
    industries: `${ok?.industries.length ?? 0} industries, and six of the sector columns are gone rather than empty: no fund tracks a single industry, so the return windows, fund size and fee have no source, and this report’s grade distributions are held per sector. Market weight is each industry’s share of the whole listed market, computed from its members.`,
    countries: 'Every market the Market Data picker offers, through the US-listed fund that tracks it — which is what makes the return windows real here and absent from the industries beside them. Prices are the fund’s, in dollars, so an unhedged fund carries the currency as well as the market. Click a country for its market page, or its fund for the fund’s own report.',
  };

  const table = () => {
    if (!loaded) return <EmptyState status="loading" compact />;
    if ('error' in loaded) return <EmptyState status="error" message={loaded.error} />;
    if (grain === 'countries') {
      if (!countries) return <EmptyState status="loading" compact />;
      if ('error' in countries) return <EmptyState status="error" message={countries.error} />;
      return <DenseTable columns={countryColumns(nav)} rows={countries} initialSort={{ key: 'ytd', dir: -1 }} rowKey={(r) => r.code} />;
    }
    return grain === 'sectors'
      ? <DenseTable columns={sectorColumns(nav)} rows={loaded.rows} initialSort={{ key: 'session', dir: -1 }} rowKey={(r) => r.sector} />
      : <DenseTable columns={industryColumns(nav)} rows={loaded.industries} initialSort={{ key: 'weight', dir: -1 }} rowKey={(r) => r.industry} />;
  };

  return (
    <PageFrame id="sectors-breakdown">
      <PageHero eyebrow="Sectors" title="Sectors" meta={(
        <>
          <span>What the market is made of, and how each part of it has done</span>
          {ok?.date ? <><MetaDivider /><span>{fmtDate(ok.date)}</span></> : null}
          <MetaDivider />
          <ConnectionButton />
        </>
      )} />
      <SectionBar label="Sector sections" active={bar.active} onSelect={bar.jump}
        items={[{ id: 'market-sectors', label: 'Breakdown' }, { id: 'sector-performance', label: 'Performance' }]} />

      {/* The block Market Data leads with, leading here too — and here it is
          the subject of the page, so its heading says what it shows. */}
      <SectorsBlock first title="Market weight and the year"
        onSectorPage={(sector) => nav.goView('sectors', sectorSlug(sector))}
        onIndustry={(industry) => nav.goIndustry(industry)} />

      <CanvasSection id="sector-performance" title="Performance" mark="↗">
        <ChipRow label="Sectors, industries or countries" className="-mt-2 mb-[18px]">
          {([['sectors', 'Sectors'], ['industries', 'Industries'], ['countries', 'Countries']] as [Grain, string][]).map(([id, label]) => (
            <Chip key={id} active={grain === id} onClick={() => setGrain(id)}>{label}</Chip>
          ))}
        </ChipRow>
        {ok ? <Description>{NOTES[grain]}</Description> : null}
        {table()}
        {ok ? (
          <Coverage notes={[
            ok.live
              ? 'Returns are the tracking ETF’s total price return to its last close, so they include the fund’s fee and exclude its distributions.'
              : 'The ETF columns need live data, which is unavailable right now.',
            'Stocks, median net margin and median composite are read off this report’s own sector distribution: the companies it can rank, the middle of their net margins, and the middle of their composite scores.',
            ok.seeded
              ? 'The sector distribution table is modelled rather than measured, so those last three columns inherit that. The ETF columns do not — those are live market data.'
              : null,
          ]} />
        ) : null}
      </CanvasSection>

      <CanvasFooter>Distribution columns are this report’s own. Quotes may be delayed.</CanvasFooter>
    </PageFrame>
  );
}

type Nav = ReturnType<typeof useNav>;

const pctCell = (v: unknown) => <SignedPct value={v} />;
const text = (v: string | null | undefined) => (v ? <span>{v}</span> : <NA />);

/** The sector grain: the vendor's session, the fund's five windows, and this report's own distribution. */
function sectorColumns(nav: Nav): DenseColumn<SectorRow>[] {
  return [
    { key: 'sector', label: 'Sector', identity: true,
      render: (r) => <TickerButton title={`Open the ${r.sector} page`} onClick={() => nav.goView('sectors', sectorSlug(r.sector))}>{r.sector}</TickerButton> },
    { key: 'session', label: 'Day', numeric: true, render: (r) => pctCell(r.session) },
    // Every window on this row arrives as a percentage, the day's included.
    { key: 'r1m', label: '1M', numeric: true, render: (r) => pctCell(r.r1m) },
    { key: 'r6m', label: '6M', numeric: true, render: (r) => pctCell(r.r6m) },
    { key: 'ytd', label: 'YTD', numeric: true, render: (r) => pctCell(r.ytd) },
    { key: 'r1y', label: '1Y', numeric: true, render: (r) => pctCell(r.r1y) },
    { key: 'etf', label: 'ETF',
      render: (r) => (r.etf ? <TickerButton title={`Open the ${r.etf} report`} onClick={() => nav.goSymbol(r.etf!)}>{r.etf}</TickerButton> : <NA text="—" />) },
    { key: 'aum', label: 'AUM', numeric: true, render: (r) => text(isNum(r.aum) ? money(r.aum, { currency: '' }) : null) },
    { key: 'fee', label: 'Fee', numeric: true, render: (r) => text(isNum(r.fee) ? pct(r.fee, { already: true, dp: 2 }) : null) },
    { key: 'count', label: 'Stocks', numeric: true, render: (r) => text(isNum(r.count) ? dec(r.count, 0) : null) },
    { key: 'netMargin', label: 'Median net margin', numeric: true, render: (r) => text(isNum(r.netMargin) ? pct(r.netMargin) : null) },
    // Drawn as well as printed: eleven sectors inside a point and a half of
    // each other are hard to rank from decimals alone.
    { key: 'median', label: 'Median composite', numeric: true,
      render: (r) => (isNum(r.median) ? (
        <span className="inline-flex items-center justify-end gap-2">
          <i className="block h-1.5 min-w-0.5 max-w-[74px] flex-none rounded-full bg-primary" style={{ width: `${(r.median / MAX_SCORE) * 74}px` }} />
          <b className="font-semibold tnum">{dec(r.median, 2)}</b>
        </span>
      ) : <NA />) },
  ];
}

/* The industry view of the same table. No fund tracks a single industry and
   the grade distributions are per sector, so the columns that would need
   either are not shown as a row of n/a — the note above the table says which
   measures did not travel and why. */
function industryColumns(nav: Nav): DenseColumn<IndustryRow>[] {
  return [
    { key: 'industry', label: 'Industry', identity: true,
      render: (r) => <TickerButton title={`Open the ${r.industry} page`} onClick={() => nav.goIndustry(r.industry)}>{r.industry}</TickerButton> },
    { key: 'sector', label: 'Sector',
      render: (r) => (r.sector
        ? <TickerButton title={`Open the ${r.sector} sector page`} onClick={() => nav.goView('sectors', sectorSlug(r.sector!))}>{r.sector}</TickerButton>
        : <NA />) },
    { key: 'session', label: 'Day', numeric: true, render: (r) => pctCell(r.session) },
    { key: 'pe', label: 'Aggregate P/E', numeric: true, render: (r) => text(isNum(r.pe) ? dec(r.pe, 1) : null) },
    { key: 'weight', label: 'Market weight', numeric: true, render: (r) => text(isNum(r.weight) ? pct(r.weight, { already: true, dp: 2 }) : null) },
    { key: 'cap', label: 'Market cap', numeric: true, render: (r) => text(r.cap > 0 ? money(r.cap) : null) },
    { key: 'count', label: 'Companies', numeric: true, render: (r) => text(isNum(r.count) ? dec(r.count, 0) : null) },
  ];
}

/* The country grain: a country *is* a fund here. A country's own page is its
   market page, where the picker, the indices and the listings already live. */
function countryColumns(nav: Nav): DenseColumn<CountryRow>[] {
  return [
    { key: 'country', label: 'Country', identity: true,
      render: (r) => <TickerButton title={`Open the ${r.country} market page`} onClick={() => nav.goView('markets', 'overview', { country: r.code })}>{r.country}</TickerButton> },
    { key: 'fund', label: 'ETF',
      render: (r) => (r.fund ? <TickerButton title={r.fundName} onClick={() => nav.goSymbol(r.fund!)}>{r.fund}</TickerButton> : <NA text="none" />) },
    { key: 'price', label: 'Price', numeric: true, render: (r) => text(isNum(r.price) ? dec(r.price, 2) : null) },
    { key: 'change', label: 'Day', numeric: true, render: (r) => pctCell(r.change) },
    { key: 'm1', label: '1M', numeric: true, render: (r) => pctCell(r.m1) },
    { key: 'm6', label: '6M', numeric: true, render: (r) => pctCell(r.m6) },
    { key: 'ytd', label: 'YTD', numeric: true, render: (r) => pctCell(r.ytd) },
    { key: 'y1', label: '1Y', numeric: true, render: (r) => pctCell(r.y1) },
    { key: 'region', label: 'Region' },
  ];
}

/* ==========================================================================
   2. One group — a sector, or an industry inside one

   Sector and industry are the same page with two differences, and both are
   differences in the data rather than in the design:

     - **A sector has a fund and an industry does not.** So the sector gets a
       real comparison against the S&P 500 drawn from its tracking ETF, and
       the industry says plainly that no fund tracks it.
     - **Grades are distributed per sector.** An industry's companies are
       graded against their parent sector's distribution, so the industry
       page says whose distribution it is and links to it.
   ========================================================================== */

type GroupSection = 'group-summary' | 'group-performance' | 'group-industries' | 'group-companies' | 'group-news' | 'group-grades';

function GroupPage({ kind, name }: { kind: 'sector' | 'industry'; name: string }) {
  const nav = useNav();
  const has = useHasKey();
  const isSector = kind === 'sector';
  const bar = useJumpBar<GroupSection>('group-summary');
  const [data, setData] = React.useState<GroupData | { error: string } | null>(null);
  const [news, setNews] = React.useState<(FeedResult<any[]> & { symbols: string[] }) | null>(null);

  // The route names the tab from the nav entry, and an industry's entry is
  // the hidden one called "Industry" — useless with three of these open.
  React.useEffect(() => { document.title = `${name} — Maz Vantage`; }, [name]);

  React.useEffect(() => {
    setData(null); setNews(null);
    let live = true;
    loadGroup(kind, name)
      .then((d) => {
        if (!live) return;
        setData(d);
        return loadGroupNews(d.universe).then((n) => { if (live) setNews(n); });
      })
      .catch((e) => { if (live) setData({ error: String(e?.message || e) }); });
    return () => { live = false; };
  }, [kind, name, has]);

  const d = data && !('error' in data) ? data : null;
  const u = d?.universe;
  const parent = d?.parent || null;
  const pending = (el: React.ReactNode) => (data && 'error' in data
    ? <EmptyState status="error" message={data.error} compact />
    : d ? el : <EmptyState status="loading" compact />);

  const sections: { id: GroupSection; label: string }[] = [
    { id: 'group-summary', label: 'Summary' },
    { id: 'group-performance', label: 'Performance' },
    ...(isSector ? [{ id: 'group-industries' as const, label: 'Industries' }] : []),
    { id: 'group-companies', label: 'Companies' },
    { id: 'group-news', label: 'News' },
    { id: 'group-grades', label: 'Grades' },
  ];

  return (
    <PageFrame id="sector-group">
      <PageHero
        eyebrow={(
          <span className="inline-flex flex-wrap items-center gap-3 normal-case tracking-normal">
            <Crumb onClick={() => nav.goView('sectors', 'all')}>Sectors</Crumb>
            {!isSector && parent ? <Crumb onClick={() => nav.goView('sectors', sectorSlug(parent))}>{parent}</Crumb> : null}
          </span>
        )}
        title={name}
        meta={d ? (
          <>
            <span>{u?.ok ? `${dec(u.companyCount, 0)} companies · ${money(u.total)}` : 'Live data unavailable'}</span>
            <MetaDivider />
            <span>{isSector ? 'Sector' : `Industry${parent ? ` in ${parent}` : ''}`}</span>
            {d.etf ? (
              <>
                <MetaDivider />
                <button type="button" className="font-medium text-foreground hover:text-primary" onClick={() => nav.goSymbol(d.etf!)}>{d.etf} →</button>
              </>
            ) : null}
            {!has ? <><MetaDivider /><ConnectionButton /></> : null}
          </>
        ) : <span>Loading…</span>}
      />
      <SectionBar label={`${name} sections`} active={bar.active} onSelect={bar.jump} items={sections} />

      <CanvasSection first id="group-summary" title="Summary" mark="◳">
        {pending(d ? <Summary d={d} /> : null)}
      </CanvasSection>

      <CanvasSection id="group-performance" title="Performance" mark="↗">
        {pending(d ? (isSector
          ? <VersusBlock sector={name} etf={d.etf} etfPrices={d.etfPrices} spyPrices={d.spyPrices} />
          : <IndustryPerformance industry={name} parent={parent} universe={d.universe} />) : null)}
      </CanvasSection>

      {isSector ? (
        <CanvasSection id="group-industries" title="Industries" mark="▦">
          {pending(d ? (u?.ok
            ? <IndustryMix universe={u} indPerf={d.indPerf} />
            : <EmptyState status={d.screenerStatus} compact message={d.screenerMessage || 'The industry breakdown is unavailable right now.'} />) : null)}
        </CanvasSection>
      ) : null}

      <CanvasSection id="group-companies" title={`Largest ${name} companies`} mark="▤">
        {pending(d ? (u?.ok
          ? <CompanyTable universe={u} stats={d.stats} parent={parent} />
          : <EmptyState status={d.screenerStatus} compact message={d.screenerMessage || 'This company table is unavailable right now.'} />) : null)}
      </CanvasSection>

      <CanvasSection id="group-news" title="News" mark="◈">
        {pending(d ? (news ? <NewsBlock name={name} news={news} /> : <EmptyState status="loading" compact />) : null)}
      </CanvasSection>

      <CanvasSection id="group-grades" title={isSector ? 'Grade distribution' : 'How this industry is graded'} mark="◷">
        {pending(d ? (isSector ? <DistributionBlock sector={name} stats={d.stats} /> : (
          <>
            <Description>Grades are distributed per sector, not per industry: every company here is ranked against {parent || 'its parent sector'}’s distribution rather than against its industry peers. A page that drew an industry histogram would be inventing a distribution this report does not hold.</Description>
            {parent ? <SeeAll onClick={() => nav.goView('sectors', sectorSlug(parent))}>See the {parent} distribution</SeeAll> : null}
          </>
        )) : null)}
      </CanvasSection>

      <CanvasSection id="group-siblings" title={isSector ? 'Every other sector' : 'Its neighbours'} mark="◉">
        {pending(d ? (isSector ? <SiblingSectors sector={name} perf={d.perf} /> : parent ? (
          <>
            <Description>The other industries inside {parent} are listed on its page, with the session snapshot for each.</Description>
            <SeeAll onClick={() => nav.goView('sectors', sectorSlug(parent))}>Open {parent}</SeeAll>
          </>
        ) : <EmptyState status="unavailable" compact message="This industry’s parent sector could not be read from its members, so its neighbours are unknown." />) : null)}
      </CanvasSection>

      <CanvasFooter>Grades and distributions are this report’s own. Quotes may be delayed.</CanvasFooter>
    </PageFrame>
  );
}

/* ---------- summary ----------------------------------------------------------- */

function Summary({ d }: { d: GroupData }) {
  const isSector = d.kind === 'sector';
  const u = d.universe;
  const blurb = isSector ? SECTOR_BLURB[d.name] : null;
  const median = medianOfBins(d.parent ? d.stats?.sectors?.[d.parent]?.overall : null);
  const info = d.etfInfo;
  return (
    <>
      {blurb ? <Description>{blurb}</Description> : null}
      <StatGrid items={[
        ['Companies', u.ok ? dec(u.companyCount, 0) : 'n/a', u.ok ? `${dec(u.listingCount, 0)} listings, cross-listings collapsed` : 'needs live data'],
        ['Market capitalisation', u.ok && u.total > 0 ? money(u.total) : 'n/a', 'summed from the members themselves'],
        ['Day, members counted equally', <SignedPct key="s" value={d.session} />, 'the session snapshot'],
        ['Day, largest 50 by size', <SignedPct key="c" value={d.capWeighted} />, 'the fifty quoted below, weighted'],
        ['Aggregate P/E', isNum(d.multiple) ? dec(d.multiple, 1) : 'n/a', 'the session snapshot'],
        isSector
          ? ['Year to date', <SignedReturn key="y" value={d.ytd} />, d.etf ? `${d.etf}, the tracking fund` : 'no fund']
          : ['Tracking fund', 'none', 'no ETF tracks a single industry'],
        ['Median composite', isNum(median) ? `${dec(median, 2)} of ${MAX_SCORE}` : 'n/a',
          isSector ? 'the middle of this sector’s scores' : `from ${d.parent || 'the parent sector'}`],
        isSector && info ? ['Fund assets', isNum(info.assetsUnderManagement) ? money(info.assetsUnderManagement) : 'n/a',
          isNum(info.expenseRatio) ? `${pct(info.expenseRatio, { already: true, dp: 2 })} expense ratio` : ''] : null,
      ]} />
    </>
  );
}

/* ---------- performance --------------------------------------------------------- */

/** A basket against the market on the chosen window, with the return grid under it. */
function Comparison({ a, b, aName, note }: { a: Point[]; b: Point[]; aName: string; note: string }) {
  const [active, setActive] = React.useState<WindowKey>('1Y');
  const w = WINDOWS.find((x) => x.key === active)!;
  const pair = align(a, b, windowStart(active));
  let body: React.ReactNode;
  if (pair.length < 2) {
    body = <EmptyState status="unavailable" compact message="Not enough overlapping price history for this window." />;
  } else {
    const base = { a: pair[0].a, b: pair[0].b };
    const pick = thin(pair, CHART_POINTS);
    const ra = pair.at(-1)!.a / base.a - 1;
    const rm = pair.at(-1)!.b / base.b - 1;
    body = (
      <>
        <MultiLineChart height={300}
          valueFmt={(v) => pct(v, { sign: true, dp: 0 })}
          labelFmt={(dt) => fmtDate(dt, { month: 'short', year: '2-digit' })}
          series={[
            { name: aName, color: 'var(--primary)', points: pick.map((p) => ({ date: p.date, value: p.a / base.a - 1 })) },
            { name: `S&P 500 (${MARKET_ETF})`, color: 'var(--chart-4)', points: pick.map((p) => ({ date: p.date, value: p.b / base.b - 1 })) },
          ]} />
        <StatGrid items={[
          [`${aName} return`, <SignedReturn key="a" value={ra} />, `over ${w.label}`],
          ['S&P 500 return', <SignedReturn key="m" value={rm} />, `over ${w.label}`],
          ['Excess', <SignedReturn key="x" value={ra - rm} />, note],
        ]} />
      </>
    );
  }
  return (
    <div className="grid gap-2.5">
      <RangeSelect label="Comparison window" items={WINDOWS} active={active} onChange={setActive} className="w-fit" />
      {body}
    </div>
  );
}

/** The sector against the market, from the fund that tracks it. */
function VersusBlock({ sector, etf, etfPrices, spyPrices }: { sector: string; etf: string | null; etfPrices: FeedResult; spyPrices: FeedResult }) {
  if (etfPrices.status !== 'ok' || spyPrices.status !== 'ok') {
    return <EmptyState status={etfPrices.status} compact message="The comparison is drawn from the sector fund and the S&P 500 fund, which are unavailable right now." />;
  }
  const a = normalisePrices(etfPrices.data) as Point[];
  const b = normalisePrices(spyPrices.data) as Point[];
  const ra = computeReturns(a, RETURN_SPANS);
  const rb = computeReturns(b, RETURN_SPANS);
  const spans = ['1M', '6M', '1Y', '3Y', '5Y'];
  const label = `${sector} (${etf})`;

  return (
    <div>
      <Description>Both lines are price return from the first close in the window, so two funds on very different price scales can share an axis. Distributions are excluded, and the sector line carries its fund’s fee.</Description>
      <Comparison a={a} b={b} aName={label} note="sector less market" />
      <DenseTable className="mt-[18px]" rows={[
        { label, set: ra as Record<string, number> },
        { label: `S&P 500 (${MARKET_ETF})`, set: rb as Record<string, number> },
        { label: 'Excess', set: Object.fromEntries(spans.map((s) => [s, isNum(ra[s]) && isNum(rb[s]) ? ra[s] - rb[s] : null])) as Record<string, number> },
      ]} columns={[
        { key: 'label', label: 'At fixed horizons', identity: true },
        ...spans.map((span) => ({ key: span, label: span, numeric: true, value: (r: any) => r.set[span], render: (r: any) => <SignedReturn value={r.set[span]} /> })),
      ]} rowKey={(r) => r.label} initialSort={null} />
      <PanelNote>A window the price history is too short to cover reads n/a rather than being computed from whatever is there — six years of closes are fetched, so the five-year column is the first to run out.</PanelNote>
    </div>
  );
}

/* An industry's performance, when nothing published follows one: a line
   built from its own members, and the funds that hold them — each bought,
   and each saying what it costs first. */
function IndustryPerformance({ industry, parent, universe }: { industry: string; parent: string | null; universe: Universe }) {
  const nav = useNav();
  const moved = (universe.ok ? universe.rows : []).filter((r) => r.quoted && isNum(r.change)).sort((a, b) => b.change! - a.change!);
  const movers = (list: Member[], title: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <p className="basis-full text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{title}</p>
      {list.map((r) => (
        <Chip key={r.symbol} title={r.name} onClick={() => nav.goSymbol(r.symbol)}>
          <span>{r.symbol}</span><SignedPct value={r.change} className="ml-1" />
        </Chip>
      ))}
    </div>
  );
  return (
    <div>
      <Description>No index and no fund follow {industry} on its own{parent ? `, and the nearest published line is ${parent}’s` : ''} — so what is here is built from the industry’s own members, and it is bought rather than loaded.</Description>
      <IndexBlock industry={industry} universe={universe} />
      <ExposureBlock industry={industry} universe={universe} />
      <div className="mt-6">
        {moved.length >= 2 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-[26px] gap-y-4">
            {movers(moved.slice(0, 5), 'Up most today')}
            {movers(moved.slice(-5).reverse(), 'Down most today')}
          </div>
        ) : <EmptyState status="skipped" compact message="Member quotes are unavailable right now." />}
      </div>
      {parent ? <SeeAll onClick={() => nav.goView('sectors', sectorSlug(parent))}>See {parent} against the S&amp;P 500</SeeAll> : null}
    </div>
  );
}

function IndexBlock({ industry, universe }: { industry: string; universe: Universe }) {
  const has = useHasKey();
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [built, setBuilt] = React.useState<BuiltIndex | { error: string } | null>(null);
  const members = (universe.ok ? universe.rows : [])
    .filter((r) => isNum(r.marketCap) && r.marketCap > 0 && isNum(r.price) && r.price > 0)
    .slice(0, INDEX_MEMBERS);
  if (!members.length || !has) return <EmptyState status="skipped" compact message="Building an index needs live member prices, which are unavailable right now." className="mt-[18px]" />;
  const covered = members.reduce((t, r) => t + r.marketCap!, 0) / ((universe.ok && universe.total) || 1) * 100;

  if (built) {
    if ('error' in built) return <div className="mt-[18px]"><EmptyState status="error" compact message={built.error} /></div>;
    return (
      <div className="mt-[18px] grid gap-1">
        <Comparison a={built.points} b={built.market} aName={`${industry} (${built.basket.length} members)`} note="industry less market" />
        <PanelNote>{[
          `This index is this report’s own, not a published one: a share-weighted basket of ${built.basket.length} of the ${members.length} largest members — ${pct(covered, { already: true, dp: 0 })} of the industry’s market value — with share counts derived from today’s capitalisation and held fixed.`,
          built.dropped.length ? `${built.dropped.map((m) => m.symbol).join(', ')} ${built.dropped.length === 1 ? 'was' : 'were'} left out: too little price history to span the others.` : '',
          'Membership is today’s, so a company that has left the industry is absent from its own past, and the basket carries no distributions.',
        ].filter(Boolean).join(' ')}</PanelNote>
      </div>
    );
  }
  return (
    <div className="mt-[18px] grid gap-1">
      <ConsentButton busy={busy} busyText="Building…" progress={progress} onClick={async () => {
        setBusy(true);
        const result = await buildMemberIndex(members, (done, total) => setProgress(`${done} of ${total}…`));
        setProgress(null);
        setBuilt(result);
      }}>
        Build a {industry} index from its {members.length} largest
      </ConsentButton>
      <PanelNote>These {members.length} companies are {pct(covered, { already: true, dp: 0 })} of the industry’s market value. Their daily closes are kept for the session once loaded.</PanelNote>
    </div>
  );
}

function ExposureBlock({ industry, universe }: { industry: string; universe: Universe }) {
  const nav = useNav();
  const has = useHasKey();
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<QuotedFund[] | null>(null);
  const members = (universe.ok ? universe.rows : []).slice(0, EXPOSURE_MEMBERS);
  if (!members.length || !has) return null;

  if (rows) {
    if (!rows.length) {
      return <div className="mt-[18px]"><EmptyState status="unavailable" compact message={`No fund holds more than one of ${industry}’s largest members at a weight this feed reports and quotes.`} /></div>;
    }
    return (
      <div className="mt-[18px] grid gap-1">
        <DenseTable rows={rows} rowKey={(r) => r.fund} initialSort={{ key: 'weight', dir: -1 }} columns={[
          { key: 'fund', label: 'Fund', identity: true, render: (r) => <TickerButton title={r.name} onClick={() => nav.goSymbol(r.fund)}>{r.fund}</TickerButton> },
          { key: 'name', label: 'Name', render: (r) => <span className="block max-w-[34ch] truncate text-muted-foreground">{r.name}</span> },
          { key: 'count', label: 'Members held', numeric: true, value: (r) => r.held.length,
            render: (r) => <span title={r.held.join(', ')}>{r.held.length} of {members.length}</span> },
          { key: 'weight', label: 'Combined weight', numeric: true, render: (r) => <span>{pct(r.weight, { already: true, dp: 1 })}</span> },
          { key: 'price', label: 'Price', numeric: true, render: (r) => text(isNum(r.price) ? dec(r.price, 2) : null) },
          { key: 'change', label: 'Day', numeric: true, render: (r) => pctCell(r.change) },
        ]} />
        <PanelNote>Combined weight is the sum of this fund’s weights in the {members.length} members asked about, so a fund concentrated in {industry} scores high and a broad market fund holding all {members.length} at a fraction of a per cent does not. It is a ranking of exposure, not a recommendation, and the funds are not graded — nothing in this report scores a basket.</PanelNote>
      </div>
    );
  }
  return (
    <div className="mt-[18px] grid gap-1">
      <ConsentButton busy={busy} busyText="Searching…" progress={progress} onClick={async () => {
        setBusy(true);
        const found = await fundsHolding(members, (done, total) => setProgress(`${done} of ${total}…`));
        setProgress('Quoting…');
        const quoted = found.length ? await quoteFunds(found) : [];
        setProgress(null);
        setRows(quoted);
      }}>
        Find the funds holding {industry}
      </ConsentButton>
      <PanelNote>Asked of {members.map((m) => m.symbol).join(', ')} — the industry’s largest — and kept where a fund holds more than one of them. This is established from what the funds hold, not from what they are called.</PanelNote>
    </div>
  );
}

/* ---------- what a sector is made of --------------------------------------------- */

function IndustryMix({ universe, indPerf }: { universe: Extract<Universe, { ok: true }>; indPerf: FeedResult<any[]> }) {
  const nav = useNav();
  // The vendor's industry snapshot, folded in by name where it matches.
  const rows = universe.industries.map((r) => ({ ...r, day: averageFor(indPerf, r.industry, 'averageChange') }));
  return (
    <>
      <Description>{rows.length} industries, weighted by each one’s share of the sector’s market capitalisation rather than by how many companies it holds. The session column is the industry snapshot, which counts members equally, so it will not agree with the weight beside it.</Description>
      <DenseTable rows={rows} rowKey={(r) => r.industry} initialSort={{ key: 'weight', dir: -1 }} columns={[
        { key: 'industry', label: 'Industry', identity: true,
          render: (r) => <TickerButton title={`Open the ${r.industry} page`} onClick={() => nav.goIndustry(r.industry)}>{r.industry}</TickerButton> },
        { key: 'weight', label: 'Weight', numeric: true, render: (r) => text(isNum(r.weight) ? pct(r.weight) : null) },
        { key: 'cap', label: 'Market cap', numeric: true, render: (r) => text(r.cap > 0 ? money(r.cap) : null) },
        { key: 'n', label: 'Companies', numeric: true, render: (r) => <span>{dec(r.n, 0)}</span> },
        { key: 'day', label: 'Day', numeric: true, render: (r) => pctCell(r.day) },
      ]} />
    </>
  );
}

/* ---------- the members ------------------------------------------------------------ */

const SHORT_FACTOR: Record<string, string> = { valuation: 'Val', growth: 'Grw', profitability: 'Prof', health: 'Health', momentum: 'Mom' };
const smallPill = (v: unknown) => (isNum(v)
  ? <GradePill score={v} letter={letterFor(v)} className="px-[5px] py-0.5 [&_i]:hidden" />
  : <NA text="—" />);

/**
 * The biggest companies, and optionally their grades. The rows come from the
 * screener call the whole page shares, so they cost nothing extra; grading is
 * two feeds per company, which is why it waits for a click.
 */
function CompanyTable({ universe, stats, parent }: { universe: Extract<Universe, { ok: true }>; stats: SectorStats | null; parent: string | null }) {
  const nav = useNav();
  const rows = universe.rows.slice(0, TOP_N);
  const [lite, setLite] = React.useState<Map<string, any> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);

  const grade = async () => {
    setBusy(true);
    const lookup = sectorLookup(stats, parent);
    let done = 0;
    const out = new Map<string, any>();
    await mapLimited(rows, async (r) => {
      const [ratios, metrics] = await Promise.all([fetchFor('ratiosTtm', r.symbol), fetchFor('metricsTtm', r.symbol)]);
      out.set(r.symbol, scoreLite({
        ratios: ratios.status === 'ok' ? ratios.data : null,
        metrics: metrics.status === 'ok' ? metrics.data : null,
      }, lookup));
      setProgress(`${++done} of ${rows.length}…`);
    }, 4);
    setProgress(null);
    setLite(out);
  };

  const columns: DenseColumn<Member>[] = [
    { key: 'name', label: 'Company', identity: true, value: (r) => r.name,
      render: (r) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          <Logo url={logoUrl(r.symbol)} label={r.symbol} size="sm" />
          <span className="flex min-w-0 flex-col items-start">
            <TickerButton title={`Open the ${r.symbol} report`} onClick={() => nav.goSymbol(r.symbol)}>{r.symbol}</TickerButton>
            <span className="max-w-[26ch] truncate text-micro text-muted-foreground" title={`${r.name}${r.industry ? ` · ${r.industry}` : ''}`}>{r.name}</span>
          </span>
        </span>
      ) },
    { key: 'price', label: 'Price', numeric: true, render: (r) => text(isNum(r.price) ? dec(r.price, 2) : null) },
    { key: 'change', label: 'Day', numeric: true, render: (r) => pctCell(r.change) },
    { key: 'marketCap', label: 'Market cap', numeric: true, render: (r) => text(isNum(r.marketCap) ? money(r.marketCap) : null) },
    { key: 'weight', label: 'Weight', numeric: true, render: (r) => text(isNum(r.weight) ? pct(r.weight) : null) },
    ...(lite ? [
      { key: 'quant', label: 'Quant', numeric: true, value: (r: Member) => lite.get(r.symbol)?.score ?? null,
        render: (r: Member) => smallPill(lite.get(r.symbol)?.score) },
      ...FACTOR_KEYS.map((k) => ({
        key: `f:${k}`, label: SHORT_FACTOR[k] || FACTOR_BY_KEY[k]?.title || k, numeric: true,
        value: (r: Member) => lite.get(r.symbol)?.factors?.[k]?.score ?? null,
        render: (r: Member) => smallPill(lite.get(r.symbol)?.factors?.[k]?.score),
      })),
    ] : []),
  ];

  return (
    <>
      <DenseTable key={lite ? 'graded' : 'plain'} columns={columns} rows={rows} rowKey={(r) => r.symbol} initialSort={{ key: 'marketCap', dir: -1 }} />
      {lite ? null : (
        <ConsentButton busy={busy} busyText="Grading…" progress={progress} onClick={grade}>
          Grade these {rows.length} — two feeds per company
        </ConsentButton>
      )}
      <PanelNote>{[
        universe.listingCount !== universe.companyCount
          ? `${dec(universe.listingCount, 0)} listings collapsed to ${dec(universe.companyCount, 0)} companies; the largest ${rows.length} are shown.`
          : `The largest ${rows.length} of ${dec(universe.companyCount, 0)} companies.`,
        'Weight is the share of the group’s total market capitalisation, so the column sums to less than 100% — the tail below the top fifty is the rest.',
        lite
          ? `Grades are the reduced-set score — a handful of ratios per factor against ${parent || 'the parent sector'}’s distribution — not the full report grade. Open a company for that.`
          : 'Grading fetches two feeds per company, so it waits until you ask.',
      ].join(' ')}</PanelNote>
    </>
  );
}

/* ---------- the wire ------------------------------------------------------------------ */

function NewsBlock({ name, news }: { name: string; news: FeedResult<any[]> & { symbols: string[] } }) {
  const nav = useNav();
  if (news.status !== 'ok') {
    return <EmptyState status={news.status} compact message={news.status === 'skipped'
      ? 'Company news is unavailable right now.'
      : news.message || `No news was returned for ${name}’s companies.`} />;
  }
  const stories = (news.data || [])
    .filter((n) => n && (n.title || n.text))
    .sort((a, b) => +new Date(b.publishedDate) - +new Date(a.publishedDate))
    .slice(0, 12);
  return (
    <>
      <Description>News is not tagged by sector or industry, so this is coverage of the {news.symbols.length} largest {name} companies by market capitalisation rather than a group wire. It will miss a story about a smaller constituent, and it will miss macro coverage that names no company at all. Not scored, not ranked and not sentiment-tagged.</Description>
      {stories.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-x-8 max-sm:grid-cols-1">
          {stories.map((n, i) => {
            const tickers = String(n.symbol || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
            return (
              <article key={n.url || i} className="flex flex-col gap-1 border-b border-border py-3">
                <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
                  <span className="font-semibold">{n.site || n.publisher || 'Unknown outlet'}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={n.publishedDate || ''}>{ago(n.publishedDate)}</time>
                </div>
                {n.url
                  ? <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-13 font-semibold leading-[1.45] hover:text-primary hover:underline">{n.title || '(untitled)'}</a>
                  : <span className="text-13 font-semibold leading-[1.45]">{n.title || '(untitled)'}</span>}
                {tickers.length ? (
                  <div className="flex flex-wrap gap-2">
                    {tickers.map((t) => (
                      <button key={t} type="button" title={`Open the ${t} report`} onClick={() => nav.goSymbol(t)}
                        className="inline-flex items-center gap-1 text-tiny font-semibold text-primary hover:underline">
                        <Logo url={logoUrl(t)} label={t} size="sm" fallback="none" className="size-4" />{t}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : <EmptyState status="ok" compact message={`No recent stories for ${name}’s largest companies.`} />}
    </>
  );
}

/* ---------- the distribution behind every grade ------------------------------------- */

function DistributionBlock({ sector, stats }: { sector: string; stats: SectorStats | null }) {
  const tbl = stats?.sectors?.[sector];
  const seeded = stats?.source === 'seed';
  if (!tbl) {
    return <EmptyState status="unavailable" message={`No distribution is loaded for ${sector}, so nothing in this sector can be ranked. Every ratio for a company here shows its figure with no grade beside it.`} />;
  }
  const overall = tbl.overall;
  return (
    <>
      <Description>What every grade for a company in this sector is measured against. A ratio is ranked as a percentile within this distribution, and the percentile becomes the grade.</Description>
      <StatGrid items={[
        ['Companies in the sample', isNum(tbl.count) ? dec(tbl.count, 0) : 'n/a'],
        ['Ratios with a distribution', String(Object.keys(tbl.metrics || {}).length), 'anything outside this list cannot be graded'],
        ['Table built', stats?.generatedAt ? fmtDate(stats.generatedAt) : 'n/a'],
        ['Source', seeded ? 'Modelled seed' : 'Measured from listed companies', seeded ? 'not measured' : 'measured'],
      ]} />
      {overall?.bins?.length ? (
        <div className="mt-[18px]">
          <PanelNote className="mt-0">How composite scores are spread across this sector — {dec(overall.n, 0)} companies, {overall.bins.length} bins from 0 to {overall.max ?? MAX_SCORE}.</PanelNote>
          <ScoreHistogram overall={overall} />
        </div>
      ) : null}
      {seeded ? (
        <Notice error className="mt-4"><b>This distribution is modelled, not measured.</b> Its smooth symmetry is the giveaway — a real sector is lumpy. Every grade for every company in this sector inherits that, including the ones in the table above.</Notice>
      ) : null}
    </>
  );
}

function ScoreHistogram({ overall }: { overall: Histogram }) {
  const bins = overall.bins || [];
  const max = Math.max(...bins, 1);
  const step = (overall.max ?? MAX_SCORE) / bins.length;
  return (
    <div className="relative mt-2 flex h-[132px] items-end gap-[3px] pb-[18px]">
      {bins.map((n, i) => {
        const lo = (i * step).toFixed(1);
        const hi = ((i + 1) * step).toFixed(1);
        return (
          <div key={i} title={`${n} companies scoring ${lo}–${hi}`} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
            <i className="block w-full rounded-t-[2px] bg-primary opacity-80 group-hover:opacity-100" style={{ height: `${(n / max) * 100}%` }} />
            <span className="absolute -bottom-[18px] left-0 text-micro text-muted-foreground">{i % 4 === 0 ? lo : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- where else to go ------------------------------------------------------------ */

function SiblingSectors({ sector, perf }: { sector: string; perf: FeedResult<any[]> }) {
  const nav = useNav();
  const rows = SECTORS.map((s) => ({ sector: s, change: averageFor(perf, s, 'averageChange') }))
    .sort((a, b) => (b.change ?? -99) - (a.change ?? -99));
  return (
    <ChipRow label="Every sector">
      {rows.map((r) => (
        <Chip key={r.sector} active={r.sector === sector} onClick={() => nav.goView('sectors', sectorSlug(r.sector))}>
          <span>{r.sector}</span>
          <SignedPct value={r.change} className={cn('ml-1', r.sector === sector && 'text-background')} />
        </Chip>
      ))}
    </ChipRow>
  );
}
