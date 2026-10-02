'use client';

/* ==========================================================================
   Maz Vantage — Markets Data (`/markets/<sub>`)

   Port of the legacy `markets.js`: the dispatch, plus the sections it always
   owned — the three mover lists and the sector and industry snapshots. None
   of it is graded: a mover list is a fact about a trading day, not an
   assessment.

   **Before reading a mover list.** `biggest-gainers` and its siblings return
   whatever traded — leveraged ETFs, SPAC rights, warrants and sub-dollar
   shells beside real companies. The lists filter, by default, to things that
   look like common stock (`looksLikeStock`), and the count removed is printed
   rather than hidden.

   The legacy `marketpages.js` is not ported: its four sections were only
   reachable through a dispatch table the page resolved before consulting it,
   so none of it ever rendered.
   ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { fetchMarket, hasApiKey, logoUrl } from '@/lib/fmp';
import { dec, fmtDate, isNum, pct, price } from '@/lib/format';
import { SECTORS, sectorSlug } from '@/lib/nav';
import { looksLikeStock, sectorRows } from '@/lib/movers';
import { viewHref } from '@/lib/routes';
import { PageHead } from '@/components/shell/page-head';
import { MarketHub } from '@/components/pages/market-hub';
import { FuturesPage, IndicesPage } from '@/components/pages/market-board';
import { StockMarkets } from '@/components/pages/stock-markets';
import { Card, CardHead, DataTable, Notice, Pill } from '@/components/report/ui';
import { Logo } from '@/components/report/ui';
import { Button } from '@/components/ui/button';
import { useHasKey, useQueryState } from '@/components/pages/page-parts';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

/** The gate message for a market feed, or null when it came back fine. */
function MarketGate({ res, what }: { res: any; what: string }) {
  if (res?.status === 'ok') return null;
  if (res?.status === 'skipped' || !hasApiKey()) {
    return <Notice><b>{what}</b> is market-wide data and is unavailable right now.</Notice>;
  }
  if (res?.status === 'gated') return <Notice><b>{what}</b> is not available right now.</Notice>;
  return <Notice error><b>{what}</b> could not be loaded — {res?.message || 'unknown error'}.</Notice>;
}

/**
 * One bar per row, diverging from a centre line: these are signed, so a
 * sector that fell and one that rose should not both grow rightwards.
 */
export function ChangeBars({ rows, linkSectors = true, tight = false }: { rows: { sector: string; change: number }[]; linkSectors?: boolean; tight?: boolean }) {
  const nav = useNav();
  const max = Math.max(...rows.map((r) => Math.abs(r.change)), 0.1);
  return (
    <div className={cn('grid', tight ? 'gap-1' : 'gap-1.5')}>
      {rows.map((r) => {
        const w = (Math.abs(r.change) / max) * 50;
        const up = r.change >= 0;
        const link = linkSectors && (SECTORS as readonly string[]).includes(r.sector);
        return (
          <div key={r.sector} className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_64px] items-center gap-3 text-13 max-sm:grid-cols-[minmax(0,120px)_minmax(0,1fr)_56px]">
            {link ? <button type="button" title={`Open the ${r.sector} sector page`} onClick={() => nav.goView('sectors', sectorSlug(r.sector))} className="truncate text-left hover:text-primary">{r.sector}</button>
              : <span title={r.sector} className="truncate">{r.sector}</span>}
            <span className={cn('relative block rounded-sm bg-muted', tight ? 'h-2' : 'h-3')}>
              <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <i className={cn('absolute inset-y-0 rounded-sm', up ? 'bg-up' : 'bg-down')} style={up ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
            </span>
            <span className={cn('text-right tnum', up ? 'text-up' : 'text-down')}>{pct(r.change, { already: true, sign: true })}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One mover as a compact row (logo, symbol, name, change) — Home shows these too. */
export function MoverRow({ r }: { r: any }) {
  const nav = useNav();
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border py-2 last:border-b-0">
      <Logo url={logoUrl(r.symbol)} label={r.symbol} size="sm" />
      <div className="grid min-w-0">
        <button type="button" onClick={() => nav.goSymbol(r.symbol)} className="w-fit text-13 font-semibold hover:text-primary">{r.symbol}</button>
        <span className="truncate text-micro text-muted-foreground" title={r.name}>{r.name || ''}</span>
      </div>
      <span className={cn('text-13 tnum', r.changesPercentage > 0 && 'text-up', r.changesPercentage < 0 && 'text-down')}>
        {isNum(r.changesPercentage) ? pct(r.changesPercentage, { already: true, sign: true }) : 'n/a'}
      </span>
    </div>
  );
}

/* ---------- the mover lists --------------------------------------------------------- */

const MOVERS: Record<string, { title: string; blurb: string; caution: string }> = {
  gainers: {
    title: 'Biggest gainers',
    blurb: 'The largest one-day percentage rises across the US exchanges.',
    caution: 'A big one-day rise on a small company is usually one piece of news, and sometimes it is one trade. Nothing in this list is a recommendation, and nothing in it is graded.',
  },
  losers: {
    title: 'Biggest losers',
    blurb: 'The largest one-day percentage falls across the US exchanges.',
    caution: 'A fall of this size is normally a specific event — a failed trial, a guidance cut, a dilutive raise — and the list says nothing about which. Read it as a list of questions rather than of opportunities.',
  },
  active: {
    title: 'Most active',
    blurb: 'The heaviest traded names of the session by volume.',
    caution: 'Volume is not direction. A name here may have risen, fallen or gone nowhere; what it has done is change hands.',
  },
};

function useMarketFeed(kinds: string[]) {
  const has = useHasKey();
  const [res, setRes] = React.useState<any[] | null>(null);
  const key = kinds.join(',');
  React.useEffect(() => {
    let live = true;
    setRes(null);
    Promise.all(key.split(',').map((k) => fetchMarket(k))).then((r) => { if (live) setRes(r); })
      .catch((e) => { if (live) setRes(key.split(',').map(() => ({ status: 'error', message: String(e?.message || e), data: [] }))); });
    return () => { live = false; };
  }, [key, has]);
  return res;
}

function Movers({ kind }: { kind: 'gainers' | 'losers' | 'active' }) {
  const nav = useNav();
  const spec = MOVERS[kind];
  const res = useMarketFeed([kind]);
  const [filtered, setFiltered] = React.useState(true);
  if (!res) return <Card><div className="h-40 animate-pulse rounded-lg bg-muted" /></Card>;
  const all: any[] = res[0].status === 'ok' ? res[0].data || [] : [];
  const stocks = all.filter(looksLikeStock);
  const rows = filtered ? stocks : all;
  return (
    <div className="grid gap-4">
      <Card>
        <CardHead title={spec.title} sub={spec.blurb} />
        {all.length ? (
          <div className="mb-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setFiltered((f) => !f)}>{filtered ? 'Show everything the feed returned' : 'Filter to common stock'}</Button>
          </div>
        ) : null}
        {res[0].status !== 'ok' ? <MarketGate res={res[0]} what={spec.title} /> : rows.length ? (
          <>
            <DataTable headers={[{ label: 'Symbol' }, { label: 'Company' }, { label: 'Price', num: true }, { label: 'Change', num: true }, { label: '% Change', num: true }, { label: 'Exchange' }]}
              rows={rows.map((r) => [
                r.symbol ? <button key="s" type="button" title={`Open the ${r.symbol} report`} onClick={() => nav.goSymbol(r.symbol)} className="font-semibold text-primary hover:underline">{r.symbol}</button> : '—',
                <span key="n" className="block max-w-[34ch] truncate" title={r.name}>{r.name || '—'}</span>,
                isNum(r.price) ? price(r.price) : 'n/a',
                <span key="c" className={cn(r.change > 0 && 'text-up', r.change < 0 && 'text-down')}>{isNum(r.change) ? dec(r.change, 2) : 'n/a'}</span>,
                <span key="p" className={cn(r.changesPercentage > 0 && 'text-up', r.changesPercentage < 0 && 'text-down')}>{isNum(r.changesPercentage) ? pct(r.changesPercentage, { already: true, sign: true }) : 'n/a'}</span>,
                r.exchange || '—',
              ])} />
            <p className="mt-3 text-tiny text-muted-foreground">{filtered
              ? `Showing ${rows.length} of ${all.length} rows. ${all.length - stocks.length} were filtered out as ETFs, rights, warrants, units or preferred lines — see the note below.`
              : `Showing all ${all.length} rows, unfiltered.`}</p>
          </>
        ) : <Notice>Nothing was returned for this list.</Notice>}
      </Card>
      <Card>
        <CardHead title="How to read this" />
        <p className="text-sm leading-relaxed">{spec.caution}</p>
        <p className="mt-3 text-tiny text-muted-foreground">The feed carries no fund flag, so the default filter is name and ticker pattern matching: it drops leveraged and inverse ETFs, SPAC rights and warrants, unit lines and preferred shares. It is deliberately conservative and will occasionally drop a real company whose name contains one of those words, which is why the unfiltered list is one click away.</p>
      </Card>
    </div>
  );
}

/* ---------- sectors and industries ------------------------------------------------------ */

function Performance({ kind }: { kind: 'sector' | 'industry' }) {
  const nav = useNav();
  const isSector = kind === 'sector';
  const res = useMarketFeed(isSector ? ['sectorPerf', 'sectorPe'] : ['industryPerf', 'industryPe']);
  if (!res) return <Card><div className="h-40 animate-pulse rounded-lg bg-muted" /></Card>;
  const [perf, pe] = res;
  const rows = sectorRows(perf);
  // The P/E snapshot is keyed the same way, so it folds in by name.
  const peBy = new Map<string, { total: number; n: number }>();
  if (pe.status === 'ok') {
    for (const r of pe.data || []) {
      const name = r.sector || r.industry;
      if (!name || !isNum(r.pe)) continue;
      const cur = peBy.get(name) || { total: 0, n: 0 };
      cur.total += r.pe; cur.n += 1;
      peBy.set(name, cur);
    }
  }
  const title = isSector ? 'Sector performance' : 'Industry performance';
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardHead title={title} sub={`Average change across the constituents of each ${kind}, for the latest session. Averaged across every exchange, which is why a row can differ from the headline index for the same group — this counts members equally, an index weights them by size.`} />
          {perf.date ? <Pill>{fmtDate(perf.date)}</Pill> : null}
        </div>
        {perf.status !== 'ok' ? <MarketGate res={perf} what={title} /> : rows.length ? (
          <>
            <ChangeBars rows={rows} linkSectors={isSector} />
            <p className="mt-3 text-tiny text-muted-foreground">{rows.length} {kind === 'industry' ? 'industries' : 'sectors'}, sorted by the session move. Bars share one scale.</p>
          </>
        ) : <Notice>No {kind} performance was returned for the last five sessions.</Notice>}
      </Card>
      {rows.length ? (
        <Card>
          <CardHead title={`${isSector ? 'Sectors' : 'Industries'} in full`} sub={peBy.size ? 'The price/earnings column is the same snapshot’s aggregate multiple, averaged the same way.' : undefined} />
          <DataTable headers={[{ label: isSector ? 'Sector' : 'Industry' }, { label: 'Session change', num: true }, ...(peBy.size ? [{ label: 'Aggregate P/E', num: true }] : [])]}
            rows={rows.map((r) => {
              const p = peBy.get(r.sector);
              return [
                isSector && (SECTORS as readonly string[]).includes(r.sector)
                  ? <button key="s" type="button" title={`Open the ${r.sector} sector page`} onClick={() => nav.goView('sectors', sectorSlug(r.sector))} className="font-semibold text-primary hover:underline">{r.sector}</button>
                  : isSector ? r.sector
                    : <button key="i" type="button" title={`Open the ${r.sector} page`} onClick={() => nav.goIndustry(r.sector)} className="text-left hover:text-primary">{r.sector}</button>,
                <span key="c" className={cn(r.change > 0 && 'text-up', r.change < 0 && 'text-down')}>{pct(r.change, { already: true, sign: true })}</span>,
                ...(peBy.size ? [p ? dec(p.total / p.n, 1) : 'n/a'] : []),
              ];
            })} />
        </Card>
      ) : null}
    </div>
  );
}

/* ---------- the dispatch ----------------------------------------------------------------- */

export function MarketsPage({ sub }: { sub: string | null }) {
  const q = useQueryState();
  const router = useRouter();
  /* The ETFs page used to carry the screener as a tab, so a link written then
     says `board=screener`. The screener is a page of its own now, and that
     link means it — with whatever collection and country it carried. */
  const legacyScreener = sub === 'etfs' && q.get('board') === 'screener';
  React.useEffect(() => {
    if (!legacyScreener) return;
    router.replace(viewHref('etfs', 'screener', { kind: 'etfs', country: q.get('country'), collection: q.get('collection') }));
  }, [legacyScreener, router, q]);
  if (legacyScreener) return null;

  if (!sub || sub === 'overview') return <MarketHub />;
  if (sub === 'corporate' || sub === 'etfs' || sub === 'economy') return <MarketHub key={sub} section={sub} />;
  if (sub === 'indices') return <IndicesPage />;
  if (sub === 'futures') return <FuturesPage />;
  if (sub === 'stocks' || sub === 'world') return <StockMarkets />;
  const body = sub === 'gainers' || sub === 'losers' || sub === 'active' ? <Movers kind={sub} />
    : sub === 'sectors' ? <Performance kind="sector" />
      : sub === 'industries' ? <Performance kind="industry" /> : <MarketHub />;
  return (
    <div className="px-gutter pb-16">
      <PageHead view="markets" sub={sub} />
      {body}
    </div>
  );
}
