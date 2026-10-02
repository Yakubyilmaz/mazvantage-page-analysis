'use client';

/* ==========================================================================
   Maz Vantage — the company report

   `/stock/<SYMBOL>[/<tab>]`. Loads the dataset, grades it, and lays out the
   head, the tab strip and the panels.

   Panels are built on first visit and kept: the Analysis tab is ~50,000px of
   charts, and rebuilding it every time someone glances at the Overview would
   throw away every range selector and model picker they had set. Switching
   tabs replaces the URL rather than pushing it — flicking between two tabs is
   not five pages of history — but a reloaded or shared link lands on the tab.

   A tab on *this* report is a panel switch; only another company's tab goes
   through the router. That is the `NavOverride` below.
   ========================================================================== */

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ago, curSymbol, dec, isNum, money, pct, price, signClass, trim } from '@/lib/format';
import { clearCache } from '@/lib/fmp';
import { FACTOR_BY_KEY, FACTOR_KEYS, type FactorKey } from '@/lib/factors';
import type { Analysis } from '@/lib/model';
import { loadReport, type Extras, type ReportLoad } from '@/lib/report-load';
import { FACTOR_TABS, TABS, TAB_FOR_FACTOR, stockHref, tabFromSlug, type TabLabel } from '@/lib/routes';
import { NavOverride, rememberSymbol, useNav, type Nav } from '@/components/nav-context';
import { useDataEpoch, useLoadedReport } from '@/components/providers';
import { AXES, Snowflake } from '@/components/charts/snowflake';
import { Button } from '@/components/ui/button';
import { FilledIcon } from '@/components/shell/icons';
import { Notice, SkeletonReport, toneClass } from '@/components/report/ui';
import { FactorSection, FactorTab, RatingsSection, RatingsTab } from '@/components/report/factor-view';
import {
  AboutSection, CompetitorsSection, DataStatusSection, DividendSection, ManagementSection, OverviewSection,
  OwnershipSection, PriceHistorySection,
} from '@/components/report/analysis-sections';
import { OverviewHead, OverviewTab } from '@/components/report/tabs/overview-tab';
import { ShariahTab } from '@/components/report/tabs/shariah-tab';
import { FinancialsTab } from '@/components/report/tabs/financials-tab';
import { StatisticsTab } from '@/components/report/tabs/statistics-tab';
import { ForecastTab } from '@/components/report/tabs/forecast-tab';
import { DividendsTab } from '@/components/report/tabs/dividends-tab';
import { NewsTab } from '@/components/report/tabs/news-tab';
import { TranscriptsTab } from '@/components/report/tabs/transcripts-tab';
import { ResearchTab } from '@/components/report/tabs/research-tab';
import { AlphaTab } from '@/components/report/tabs/alpha-tab';
import { TechnicalsTab } from '@/components/report/tabs/technicals-tab';
import { DividendGradeSections } from '@/components/report/dividend-grades';
import { ReportActions } from '@/components/report/report-actions';
import { cn } from '@/lib/cn';

/* ---------- tab label -> panel ------------------------------------------------ */

type PanelProps = { a: Analysis; extras: Extras };
/** Every tab that is neither the Overview, the Analysis page nor a factor — a Record, so a new tab label fails to compile until it has a panel. */
type PlainTab = Exclude<TabLabel, 'Overview' | 'Analysis' | 'Valuation' | 'Growth' | 'Financial Health' | 'Profitability' | 'Momentum'>;
const PLAIN_TABS: Record<PlainTab, React.ComponentType<PanelProps>> = {
  Ratings: RatingsTab,
  'Shariah Compliance': ShariahTab,
  Financials: FinancialsTab,
  'Statistics & Metrics': StatisticsTab,
  'Analysts Forecast': ForecastTab,
  Dividends: DividendsTab,
  Transcripts: TranscriptsTab,
  News: NewsTab,
  Research: ResearchTab,
  'Alpha Signal': AlphaTab,
  // After Momentum, the one factor that also reads prices — but not a factor:
  // nothing on it grades, and it says so at the top.
  Technicals: TechnicalsTab,
};


/* ---------- the head -------------------------------------------------------- */

/**
 * The stock's headline for every tab but the Overview: who it is, what it
 * costs, and two verdicts. The "Buy" chip is **FMP's analyst consensus**, not
 * our rating — the score chip beside it is ours.
 */
function PriceHead({ a }: { a: Analysis }) {
  const f = a.facts;
  const grades = a.ds.get('grades') || {};
  const consensus = typeof grades.consensus === 'string' ? grades.consensus.trim() : '';
  const overall = a.scores?.overall;
  const up = isNum(f.change) && f.change > 0;
  const flat = !isNum(f.change) || f.change === 0;
  const word = consensus.toLowerCase();
  const tone = /strong buy|^buy/.test(word) ? 'bg-up' : /sell/.test(word) ? 'bg-down' : /hold|neutral/.test(word) ? 'bg-warning' : 'bg-muted-foreground';
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-6 pb-4 pt-5">
      <div className="flex min-w-0 items-center gap-3">
        {f.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.image} alt="" loading="lazy" className="size-10 flex-none rounded-[10px] border border-border bg-white object-contain p-1" />
        ) : null}
        <div>
          <h1 className="text-[21px] font-bold leading-[1.15] tracking-[-.02em]">{f.name} ({f.symbol})</h1>
          <p className="mt-0.5 text-tiny text-muted-foreground">{[f.exchangeFull || f.exchange, f.currency].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-[21px] font-bold tracking-[-.02em] tnum">{price(f.price, curSymbol(f.currency))}</span>
        {isNum(f.change) ? (
          <span className={cn('text-sm font-semibold text-muted-foreground', !flat && (up ? 'text-up' : 'text-down'))}>
            {`${up ? '+' : ''}${dec(f.change, 2)} (${pct(f.changePct ?? 0, { sign: true })})`}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {consensus ? <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-tiny font-semibold text-white', tone)}>{consensus}</span> : null}
        {isNum(overall?.score) ? (
          <span className="inline-flex items-center whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-tiny font-semibold text-background">
            Score: {dec(overall.score, 2)}
          </span>
        ) : null}
      </div>
      <ReportActions a={a} className="ml-auto" />
    </div>
  );
}

/** The Analysis tab's own header: crumbs, name, the two actions, the stat strip. */
function AnalysisHeader({ a, onRefresh }: { a: Analysis; onRefresh: () => void }) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const disc = a.discount;
  const cell = (label: string, value: string, extra?: React.ReactNode) => (
    <div className="bg-background p-3">
      <div className="text-tiny text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tnum">{value}</div>
      {extra ? <div className="mt-0.5 text-tiny">{extra}</div> : null}
    </div>
  );
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2 text-tiny text-muted-foreground">
        <span>Stocks</span><span className="text-muted-foreground/60">/</span>
        <span>{f.sector || 'Market'}</span><span className="text-muted-foreground/60">/</span>
        <span className="text-muted-foreground/70">Updated {ago(a.ds.asOf)}</span>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        {f.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.image} alt="" loading="lazy" className="size-[52px] flex-none rounded-[10px] bg-muted object-contain p-[5px]" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold leading-tight tracking-[-.02em] max-md:text-2xl">{f.name}</h1>
          <p className="mt-1 text-13 text-muted-foreground">{`${f.exchangeFull || f.exchange}:${f.symbol} · Stock Report · Market cap ${money(f.marketCap)}`}</p>
        </div>
        <div className="flex gap-2 no-print max-sm:w-full">
          <Button variant="pill" size="sm" title="Reload the latest data" onClick={onRefresh}><FilledIcon name="refresh" className="size-[15px]" />Refresh</Button>
          <Button variant="pill" size="sm" onClick={() => window.print()}><FilledIcon name="print" className="size-[15px]" />Print</Button>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-6 gap-px overflow-hidden rounded-[10px] border border-border bg-border max-lg:grid-cols-3 max-sm:grid-cols-2">
        {cell('Share price', price(f.price, cur), isNum(f.changePct) ? <span className={toneClass(signClass(f.changePct))}>{pct(f.changePct, { sign: true })} today</span> : null)}
        {cell('Fair value', isNum(a.fairValue) ? price(a.fairValue, cur) : 'n/a',
          isNum(disc) ? <span className={cn('rounded-full px-2 py-0.5 text-micro font-semibold', disc > 0 ? 'bg-up/12 text-up' : 'bg-down/12 text-down')}>{`${pct(Math.abs(disc))} ${disc > 0 ? 'undervalued' : 'overvalued'}`}</span> : null)}
        {cell('Market cap', money(f.marketCap))}
        {cell('P/E ratio', isNum(f.pe) ? `${dec(f.pe, 1)}x` : 'n/a')}
        {cell('Dividend yield', pct(f.dividendYield, { dp: 2 }))}
        {cell('52-week range', isNum(f.yearLow) && isNum(f.yearHigh) ? `${trim(f.yearLow, 0)}–${trim(f.yearHigh, 0)}` : 'n/a')}
      </div>
    </div>
  );
}

/**
 * The flake as a sticky column beside the Analysis tab. Its wedges scroll to
 * their factor, and it lights whichever factor is under a reading line a
 * little below the sticky chrome — one line, so exactly one section can
 * straddle it. 220px, because a jumped-to section parks at ~176px and a line
 * above that would light the *previous* section the instant a wedge is clicked.
 */
function PageFlake({ a, active }: { a: Analysis; active: boolean }) {
  const [hit, setHit] = React.useState<string | null>(null);
  const scores = Object.fromEntries(AXES.map((x) => [x.key, (a.scores as any)[x.key]?.score ?? null]));
  React.useEffect(() => {
    if (!active) return;
    const LINE = 220;
    let queued = false;
    const update = () => {
      queued = false;
      let found: string | null = null;
      for (const ax of AXES) {
        const node = document.getElementById(ax.anchor);
        if (!node) continue;
        const r = node.getBoundingClientRect();
        if (r.top <= LINE && r.bottom > LINE) { found = ax.key; break; }
      }
      setHit(found);
    };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, [active]);
  return (
    <aside className="sticky top-[calc(var(--utilbar-h)+16px)] max-lg:hidden no-print">
      <p className="mb-2 text-center text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">Factor grades</p>
      <div className="grid place-items-center"><Snowflake scores={scores} size={260} highlight={hit} /></div>
      <p className="mx-auto mt-2 max-w-[24ch] text-center text-micro text-muted-foreground/80">Click a wedge to jump to that factor.</p>
    </aside>
  );
}

/** The whole report on one scroll, with the flake beside it. */
function AnalysisPanel({ a, extras, active, onRefresh }: { a: Analysis; extras: Extras; active: boolean; onRefresh: () => void }) {
  return (
    <div className="grid max-w-[var(--shell-max)] grid-cols-[var(--flake-w)_minmax(0,1fr)] items-start gap-8 max-lg:grid-cols-1">
      <PageFlake a={a} active={active} />
      <main className="min-w-0">
        <AnalysisHeader a={a} onRefresh={onRefresh} />
        <OverviewSection a={a} />
        <RatingsSection a={a} />
        <PriceHistorySection a={a} extras={extras} />
        <AboutSection a={a} />
        {FACTOR_KEYS.map((k) => <FactorSection key={k} a={a} factorKey={k} />)}
        <DividendSection a={a} />
        {/* The dividend module's four composites, in the same grade design as the
            five factors but after the unscored dividend section: they rank a
            different universe on a different scale and are no part of the rating. */}
        <DividendGradeSections a={a} />
        <ManagementSection a={a} />
        <OwnershipSection a={a} />
        <CompetitorsSection a={a} />
        <DataStatusSection a={a} />
      </main>
    </div>
  );
}


/* ---------- the shell ---------------------------------------------------------- */

function activeTabFrom(pathname: string): TabLabel | null {
  const slug = pathname.split('/')[3];
  return tabFromSlug(slug ? decodeURIComponent(slug) : null);
}

export function ReportShell({ symbol }: { symbol: string }) {
  const sym = symbol.toUpperCase();
  const router = useRouter();
  const pathname = usePathname() || '';
  const parentNav = useNav();
  const { epoch, reload } = useDataEpoch();
  const { setReport } = useLoadedReport();
  const [load, setLoad] = React.useState<ReportLoad | null>(null);

  // Which tab: the URL names one, else a hash means Analysis (every anchor in
  // the app lives there), else the Overview.
  const [hashTab, setHashTab] = React.useState<TabLabel | null>(null);
  React.useEffect(() => { if (window.location.hash) setHashTab('Analysis'); }, []);
  const tab: TabLabel = activeTabFrom(pathname) ?? hashTab ?? 'Overview';

  const [visited, setVisited] = React.useState<Set<TabLabel>>(() => new Set([tab]));
  React.useEffect(() => { setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab))); }, [tab]);

  React.useEffect(() => {
    let live = true;
    setLoad(null);
    loadReport(sym).then((r) => {
      if (!live) return;
      setLoad(r);
      if (r.status === 'ok') {
        rememberSymbol(sym);
        setReport({ ds: r.ds, extras: r.extras });
        document.title = `${sym} — Maz Vantage Stock Analysis`;
      }
    }).catch((err) => {
      if (live) setLoad({ status: 'error', title: `Could not build a report for ${sym}`, message: `Unexpected error: ${err?.message || err}`, details: [String(err?.stack || '')] });
    });
    return () => { live = false; };
  }, [sym, epoch, setReport]);

  /* A pending jump, applied after the panel is in the document. Instant, not
     smooth: the Momentum section sits ~32,000px down the Analysis tab, and
     animating that is seconds of blur on the way somewhere already chosen. */
  const pendingAnchor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!load || load.status !== 'ok') return;
    const anchor = pendingAnchor.current ?? (window.location.hash ? window.location.hash.slice(1) : null);
    pendingAnchor.current = null;
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [tab, load]);

  const selectTab = React.useCallback((next: string, anchor: string | null = null) => {
    pendingAnchor.current = anchor;
    router.replace(stockHref(sym, next, anchor), { scroll: false });
  }, [router, sym]);

  const override = React.useMemo<Partial<Nav>>(() => ({
    openAnalysis: (anchor) => selectTab('Analysis', anchor ?? null),
    openFactor: (key) => {
      const label = TAB_FOR_FACTOR[key];
      selectTab(label || 'Analysis', label ? null : FACTOR_BY_KEY[key]?.anchor ?? null);
    },
    goSymbolTab: (t, other = null) => (!other || String(other).toUpperCase() === sym
      ? selectTab(t || 'Overview')
      : parentNav.goSymbolTab(t, other)),
  }), [selectTab, sym, parentNav]);

  const refresh = React.useCallback(() => { clearCache(); reload(); }, [reload]);

  if (!load) {
    return <SkeletonReport symbol={sym} />;
  }
  if (load.status === 'error') {
    return (
      <div className="max-w-[var(--shell-max)] p-6">
        <div className="rounded-xl border border-border p-6">
          <h2 className="mb-2 text-xl font-bold">{load.title}</h2>
          <p className="text-sm text-muted-foreground">{load.message}</p>
          {load.details?.length ? (
            <ul className="mt-4 grid gap-1 text-tiny text-muted-foreground">{load.details.map((d, i) => <li key={i} className="whitespace-pre-wrap">{d}</li>)}</ul>
          ) : null}
          <div className="mt-6 flex gap-2">
            <Button variant="default" onClick={() => parentNav.goSymbol('AAPL')}>Try AAPL</Button>
          </div>
        </div>
      </div>
    );
  }

  const { a, extras, ds } = load;
  // One banner per panel: every tab needs to say the report runs off the snapshot.
  const banner = ds.source !== 'snapshot' ? null : (
    <Notice error={!!ds.liveError} className="mb-4">
      {ds.liveError
        ? <>Live data could not be loaded — <b>{ds.liveError}</b> — so a <b>saved copy</b> of this report is shown instead.</>
        : <>Live data is unavailable right now, so a <b>saved copy</b> of this report is shown. Figures are as of the date it was saved.</>}
    </Notice>
  );

  const panelFor = (t: TabLabel) => {
    if (t === 'Overview') return <OverviewTab a={a} />;
    if (t === 'Analysis') return <AnalysisPanel a={a} extras={extras} active={tab === 'Analysis'} onRefresh={refresh} />;
    const factor = FACTOR_TABS[t];
    if (factor) return <FactorTab a={a} factorKey={factor as FactorKey} />;
    const Plain = PLAIN_TABS[t as PlainTab];
    return Plain ? <Plain a={a} extras={extras} /> : null;
  };

  return (
    <NavOverride override={override}>
      {tab === 'Overview' ? <OverviewHead a={a} /> : <PriceHead a={a} />}
      <div className="overflow-x-auto border-b border-border px-6 scroll-none no-print">
        <div className="inline-flex gap-6">
          {TABS.map((label) => (
            <button key={label} type="button" onClick={() => selectTab(label)} aria-current={label === tab ? 'page' : undefined}
              className={cn('whitespace-nowrap border-b-2 border-transparent px-2 pb-3 pt-2 text-sm font-medium text-muted-foreground hover:text-foreground',
                label === tab && 'border-foreground font-bold text-foreground')}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {[...visited].map((t) => (
        <div key={t} hidden={t !== tab} className={cn('pb-16 pt-6', t === 'Analysis' ? 'px-6' : 'max-w-[var(--shell-max)] px-6')}>
          {banner}
          {panelFor(t)}
        </div>
      ))}
    </NavOverride>
  );
}
