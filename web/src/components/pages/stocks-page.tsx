'use client';

/* ==========================================================================
   Maz Vantage — the Stock Screener pages (`/stocks/<sub>`)

   One menu, one engine. The screener is the default; the old section slugs
   run an existing idea (never a second screen that could drift from the
   first); All Stocks is the directory; Compare is its own page
   (`compare-page.tsx`), two to five companies side by side.

   A screen costs real quota — a screener call plus two to five per
   candidate — so nothing runs until the reader asks. The button is the consent.
   ========================================================================== */

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchScreener, hasApiKey } from '@/lib/fmp';
import { num } from '@/lib/format';
import { IDEA_BY_KEY, LISTED, runIdea } from '@/lib/ideas';
import { STOCK_COLUMN_SETS, newTableState, type TableState } from '@/lib/market-table';
import { DedicatedScreener } from '@/components/market/dedicated-screener';
import { MarketTable } from '@/components/market/market-table';
import { IdeaResult } from '@/components/ideas/idea-result';
import { EtfsPage } from '@/components/pages/etfs-page';
import { ComparePage } from '@/components/pages/compare-page';
import { PageFrame, useHasKey } from '@/components/pages/page-parts';
import { PageHead } from '@/components/shell/page-head';
import { Notice, OCard, OHead, Pill } from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { Button } from '@/components/ui/button';
import { Input, Skeleton } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';


/* `(view, sub)` -> a screen. `also` says why a section shares a screen with
   another, printed above the result. */
const SCREENS: Record<string, { idea: string; also?: string }> = {
  top: {
    idea: 'score-all-round',
    also: 'Stocks → Top Quant Stocks and Quant → Top Quant Stocks are the same destination under the same name, reached from two menus. One screen rather than two that could disagree.',
  },
  wallstreet: {
    idea: 'top-wallstreet-stocks',
    also: 'The one screen in this menu that ranks on somebody else’s opinion. Every other list here is built from ratios this report measured; this is a tally of published analyst recommendations, put on the same 0-5 scale so it can be sorted. The two disagree often, and where they do, neither is evidence about the other.',
  },
  growth: { idea: 'compounding-growth' },
  value: { idea: 'us-value-top20' },
  dividend: { idea: 'dividend-compounders' },
};

const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';

function RulesPreview({ idea }: { idea: any }) {
  if (!idea.rules?.length) return null;
  return (
    <div className="mt-4">
      <OSub className="mt-0">The rules</OSub>
      <ul className="grid list-disc gap-1 pl-5 text-13">{idea.rules.map((r: any, i: number) => <li key={i}>{r.label}</li>)}</ul>
      {idea.note ? <p className="mt-3 text-tiny text-muted-foreground/80">{idea.note}</p> : null}
    </div>
  );
}

function ScreenSection({ sub }: { sub: string }) {
  const spec = SCREENS[sub];
  const idea: any = spec ? (IDEA_BY_KEY as any)[spec.idea] : null;
  const has = useHasKey();
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState('');
  const [result, setResult] = React.useState<any>(null);
  React.useEffect(() => { setResult(null); setRunning(false); setProgress(''); }, [sub]);

  if (!spec || !idea) {
    return <div className={grid}><OCard span={12} id="scr-none"><OHead title="Not available" /><Notice>No screen is defined for this section.</Notice></OCard></div>;
  }
  if (result) return <IdeaResult result={result} />;
  if (!has) {
    return (
      <div className={grid}>
        <OCard span={12} id="scr-key">
          <OHead title={idea.title} />
          <p className="mb-3 text-13 leading-relaxed text-muted-foreground">{idea.thesis}</p>
          <Notice>
            This screen runs across the whole market and needs live market data, which is unavailable right now.
          </Notice>
          <RulesPreview idea={idea} />
        </OCard>
      </div>
    );
  }
  const run = async () => {
    setRunning(true);
    const r = await runIdea(idea, { onProgress: (done: number, total: number) => setProgress(`Testing ${done} of ${total} companies…`) });
    setResult(r);
  };
  return (
    <div className={grid}>
      <OCard span={12} id="scr-intro">
        <OHead title={idea.title} aside={idea.tag ? <Pill tone="gold">{idea.tag}</Pill> : null} />
        <p className="mb-3 text-13 leading-relaxed text-muted-foreground">{idea.thesis}</p>
        {spec.also ? <Notice>{spec.also}</Notice> : null}
        <RulesPreview idea={idea} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={running} onClick={run}>{running ? 'Running…' : 'Run this screen'}</Button>
          {progress ? <span className="text-tiny text-muted-foreground">{progress}</span> : null}
        </div>
        <p className="mt-3 text-tiny text-muted-foreground/80">
          Running this fetches the screener once and then several feeds per candidate, which is the expensive part. Results are cached for ten minutes.
        </p>
      </OCard>
    </div>
  );
}

/* The directory: every listing the screener returns, in the dense table.
   One request buys the whole list; search is local, so typing costs nothing. */
function AllStocksSection() {
  const nav = useNav();
  const has = useHasKey();
  const [load, setLoad] = React.useState<{ status: string; rows: any[]; message?: string } | null>(null);
  const [q, setQ] = React.useState('');
  const [sector, setSector] = React.useState('');
  const [table, setTable] = React.useState<TableState>(() => newTableState(STOCK_COLUMN_SETS));

  React.useEffect(() => {
    if (!has) return;
    let live = true;
    fetchScreener({ ...LISTED, marketCapMoreThan: 0 })
      .then((res: any) => {
        if (!live) return;
        if (res.status !== 'ok') { setLoad({ status: 'error', rows: [], message: res.message || res.status }); return; }
        setLoad({ status: 'ok', rows: (res.data || []).filter((r: any) => r?.symbol && !r.isEtf && !r.isFund) });
      })
      .catch((e: any) => live && setLoad({ status: 'error', rows: [], message: String(e?.message || e) }));
    return () => { live = false; };
  }, [has]);

  const companies = load?.rows || [];
  const sectors = React.useMemo(() => [...new Set(companies.map((r) => r.sector).filter(Boolean))].sort(), [companies]);
  const query = q.trim().toLowerCase();
  const rows = React.useMemo(() => companies.filter((c) => (!sector || c.sector === sector)
    && (!query || (c.symbol || '').toLowerCase().includes(query) || (c.companyName || '').toLowerCase().includes(query))), [companies, sector, query]);

  if (!has) {
    return (
      <div className={grid}>
        <OCard span={12} id="all-key">
          <OHead title="All stocks" />
          <p className="mb-3 text-13 text-muted-foreground">Every US-listed company, with its size, price and sector. A directory — the screens on this menu are the ones that rank it.</p>
          <Notice>
            <b>The listing directory</b> is market-wide data and is unavailable right now.
          </Notice>
        </OCard>
      </div>
    );
  }
  if (!load) {
    return <div className={grid}><OCard span={12} id="all-loading"><Skeleton className="h-6 w-52" /><Skeleton className="mt-4 h-64" /></OCard></div>;
  }
  if (load.status !== 'ok') {
    return <div className={grid}><OCard span={12} id="all-err"><OHead title="All stocks" /><Notice error>The listing directory could not be loaded — {load.message}.</Notice></OCard></div>;
  }
  return (
    <div className={grid}>
      <OCard span={12} id="all-dir">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">All stocks</h2>
            <p className="mt-1 max-w-[80ch] text-13 text-muted-foreground">
              Every US-listed company. A directory rather than a screen — nothing here is filtered on quality, and nothing is
              ranked. The screens on this menu are what rank it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input type="search" placeholder="Symbol or company name…" autoComplete="off" spellCheck={false} aria-label="Search companies"
              value={q} onChange={(e) => { setQ(e.target.value); setTable((t) => ({ ...t, page: 1 })); }} className="h-9 w-60" />
            <select aria-label="Sector" value={sector} onChange={(e) => { setSector(e.target.value); setTable((t) => ({ ...t, page: 1 })); }}
              className="h-9 rounded-md border border-border bg-background px-2 text-13">
              <option value="">Every sector</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <p className="mb-3 text-13 text-muted-foreground">
          <b className="text-foreground">{num(rows.length, 0)}</b> compan{rows.length === 1 ? 'y' : 'ies'}{rows.length === companies.length ? '' : ` of ${num(companies.length, 0)}`}
        </p>
        <MarketTable rows={rows} sets={STOCK_COLUMN_SETS} state={table} onStateChange={setTable} emptyText="No company matches that."
          identity={(c) => (
            <button type="button" title={c.companyName} onClick={() => nav.goSymbol(c.symbol)} className="grid text-left hover:text-primary">
              <span className="text-13 font-bold">{c.symbol}</span>
              <span className="max-w-[200px] truncate text-micro text-muted-foreground">{c.companyName || ''}</span>
            </button>
          )} />
        <Notice className="mt-4">
          The whole list arrives at once, which is why the Overview columns are instant. Every other column set loads <b>per company</b>, so
          opening one loads the rows on screen and nothing else.
        </Notice>
      </OCard>
    </div>
  );
}

export function StocksPage({ sub }: { sub: string | null }) {
  const params = useSearchParams();
  /* A link written before funds got their own menu can still say
     `/stocks/screener?kind=etfs`. It means the ETF screener. */
  if ((!sub || sub === 'screener') && params?.get('kind') === 'etfs') return <EtfsPage />;
  if (!sub || sub === 'screener') {
    return <PageFrame className="pt-6"><DedicatedScreener /></PageFrame>;
  }
  if (sub === 'compare') return <ComparePage />;
  return (
    <PageFrame>
      <PageHead view="stocks" sub={sub} />
      {sub === 'all' ? <AllStocksSection /> : <ScreenSection sub={sub} />}
    </PageFrame>
  );
}
