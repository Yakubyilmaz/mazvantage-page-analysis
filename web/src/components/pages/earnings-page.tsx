'use client';

/* ==========================================================================
   Maz Vantage — the Earnings desk (`/earnings/<sub>`)

   Four tabs: the earnings calendar as a table with six screens over it,
   written insights from the research store, the transcript library, and the
   method.

   The calendar is a screen, so it is a table: every question anyone asks of
   it is a filter over four numbers. Two requests fill it — the calendar, and
   one screener call for the name, sector and size the calendar lacks. That
   join is also the filter: a Toronto or OTC row finds no US listing and is
   counted rather than shown.

   "Insight" means a surprise measured against consensus plus the summaries
   people wrote. It does not mean a model reading the call — nothing here runs
   sentiment over a transcript, and the Method tab says so.
   ========================================================================== */

import * as React from 'react';
import { fmtDate, isNum, money } from '@/lib/format';
import { fetchCalendar, fetchScreener, fetchTranscriptList, hasApiKey } from '@/lib/fmp';
import { dedupeStocks } from '@/lib/markethub-data';
import { SAMPLE_NOTICE, articlesReady, loadArticles, queryArticles } from '@/lib/articles';
import { CATEGORY_BY_KEY } from '@/lib/taxonomy';
import { EmptyState, InstrumentMark } from '@/components/market/market-ui';
import { ArticleCard, type Article } from '@/components/research/feed-parts';
import {
  ChipRail, ConnectionButton, Grid, MetaDivider, PageFrame, PageHero, Panel, Para, SectionBar, Warn, useHasKey, useQueryState,
} from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

/* ==========================================================================
   The screens — `reported` says whether a screen needs a result in hand;
   `Double beat` last because it is the strictest.
   ========================================================================== */

type ERow = {
  symbol: string; name: string; sector: string; marketCap: number | null; kind: 'stock'; date: string; ahead: boolean;
  eps: number | null; epsEstimate: number | null; surprise: number | null; revenue: number | null; revenueEstimate: number | null;
  revSurprise: number | null; hasResult: boolean;
};

export const EARNINGS_SCREENS: { id: string; label: string; tag: string; reported: boolean; line: string; test?: (r: ERow) => boolean }[] = [
  { id: 'upcoming', label: 'Upcoming', tag: 'Scheduled', reported: false,
    line: 'Scheduled to report in the window, with the consensus that stands going in.' },
  { id: 'reported', label: 'Reported', tag: 'Results in', reported: true,
    line: 'Already reported in the window. Everything with an actual against it.' },
  { id: 'beats', label: 'EPS beats', tag: 'Beat', reported: true,
    line: 'Reported earnings per share above the estimate that preceded them.', test: (r) => isNum(r.surprise) && r.surprise > 0 },
  { id: 'misses', label: 'EPS misses', tag: 'Miss', reported: true,
    line: 'Reported earnings per share below the estimate that preceded them.', test: (r) => isNum(r.surprise) && r.surprise < 0 },
  { id: 'revbeats', label: 'Revenue beats', tag: 'Top line', reported: true,
    line: 'Reported revenue above the estimate. A different question from the earnings line, and often a different answer.',
    test: (r) => isNum(r.revSurprise) && r.revSurprise > 0 },
  { id: 'double', label: 'Double beats', tag: 'Both lines', reported: true,
    line: 'Beat on earnings and on revenue at once — growth that reached the bottom line rather than a cost line that came in light.',
    test: (r) => isNum(r.surprise) && r.surprise > 0 && isNum(r.revSurprise) && r.revSurprise > 0 },
];
export const earningsScreen = (id: string | null | undefined) => EARNINGS_SCREENS.find((s) => s.id === id) || EARNINGS_SCREENS[0];

/** How far the window reaches, in days. One request each. */
export const WINDOWS = [7, 14, 30, 90];
const PAGE = 50;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The calendar for a window, joined to the listings that identify it. */
async function loadWindow(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 864e5);
  const ahead = new Date(to.getTime() + days * 864e5);
  const [calendar, universe]: any[] = await Promise.all([
    fetchCalendar('earnings', iso(from), iso(ahead)),
    fetchScreener({ isEtf: false, isFund: false, isActivelyTrading: true, includeAllShareClasses: false, country: 'US', limit: 5000 }),
  ]);
  if (calendar.status !== 'ok') return { status: calendar.status, message: calendar.message, rows: [] as ERow[], unmatched: 0, today: iso(to) };
  const listings = universe.status === 'ok' ? dedupeStocks(universe.data || [], { usOnly: true }) : [];
  const by = new Map(listings.map((r: any) => [String(r.symbol).toUpperCase(), r]));
  const today = iso(to);
  let unmatched = 0;
  const rows: ERow[] = [];
  for (const entry of calendar.data || []) {
    if (!entry?.symbol || !entry.date) continue;
    const listing: any = by.get(String(entry.symbol).toUpperCase());
    if (!listing) { unmatched += 1; continue; }
    const est = isNum(entry.epsEstimated) ? entry.epsEstimated : null;
    const actual = isNum(entry.epsActual) ? entry.epsActual : null;
    /* A surprise needs an estimate with enough size to divide by: consensus
       of a cent turns any result into a four-figure percentage. */
    const pct = actual != null && est != null && Math.abs(est) > 0.005 ? (actual - est) / Math.abs(est) : null;
    const revActual = isNum(entry.revenueActual) ? entry.revenueActual : null;
    const revEst = isNum(entry.revenueEstimated) ? entry.revenueEstimated : null;
    rows.push({
      symbol: listing.symbol, name: listing.companyName || listing.name || listing.symbol, sector: listing.sector || '',
      marketCap: Number(listing.marketCap) || null, kind: 'stock', date: entry.date, ahead: entry.date > today,
      eps: actual, epsEstimate: est, surprise: pct, revenue: revActual, revenueEstimate: revEst,
      revSurprise: revActual != null && revEst != null && revEst > 0 ? revActual / revEst - 1 : null, hasResult: actual != null,
    });
  }
  return {
    status: universe.status === 'ok' ? 'ok' : universe.status, message: universe.status === 'ok' ? '' : universe.message || '',
    rows, unmatched, today,
  };
}

const NA = <span className="text-muted-foreground/70">—</span>;
const num2 = (v: unknown) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null);

/** A surprise, signed and coloured; capped in the display, raw in the title. */
function Surprise({ v }: { v: number | null }) {
  if (!isNum(v)) return NA;
  const shown = v * 100;
  const sign = shown > 0 ? '+' : shown < 0 ? '−' : '';
  return (
    <span title={`${shown.toFixed(1)}%`} className={cn(shown > 0 && 'text-up', shown < 0 && 'text-down')}>
      {Math.abs(shown) >= 999 ? `${sign}999%+` : `${sign}${Math.abs(shown).toFixed(1)}%`}
    </span>
  );
}

type Col = { key: string; label: string; num?: boolean; get: (r: ERow) => any; cell: (r: ERow) => React.ReactNode };
const moneyCell = (v: unknown) => (isNum(v) ? money(v, { currency: '$' }) : NA);
const columnsFor = (screen: (typeof EARNINGS_SCREENS)[number]): Col[] => [
  { key: 'date', label: 'Date', get: (r) => r.date, cell: (r) => (r.date ? fmtDate(r.date, { day: 'numeric', month: 'short' }) : '—') },
  ...(screen.reported ? [
    { key: 'epsEstimate', label: 'EPS est.', num: true, get: (r: ERow) => r.epsEstimate, cell: (r: ERow) => num2(r.epsEstimate) ?? NA },
    { key: 'eps', label: 'EPS actual', num: true, get: (r: ERow) => r.eps, cell: (r: ERow) => (isNum(r.eps) ? <b>{num2(r.eps)}</b> : NA) },
    { key: 'surprise', label: 'EPS surprise', num: true, get: (r: ERow) => r.surprise, cell: (r: ERow) => <Surprise v={r.surprise} /> },
    { key: 'revenue', label: 'Revenue', num: true, get: (r: ERow) => r.revenue, cell: (r: ERow) => moneyCell(r.revenue) },
    { key: 'revSurprise', label: 'Rev. surprise', num: true, get: (r: ERow) => r.revSurprise, cell: (r: ERow) => <Surprise v={r.revSurprise} /> },
  ] : [
    { key: 'epsEstimate', label: 'EPS est.', num: true, get: (r: ERow) => r.epsEstimate, cell: (r: ERow) => num2(r.epsEstimate) ?? NA },
    { key: 'revenueEstimate', label: 'Revenue est.', num: true, get: (r: ERow) => r.revenueEstimate, cell: (r: ERow) => moneyCell(r.revenueEstimate) },
  ]),
  { key: 'marketCap', label: 'Market cap', num: true, get: (r) => r.marketCap, cell: (r) => moneyCell(r.marketCap) },
  { key: 'sector', label: 'Sector', get: (r) => r.sector, cell: (r) => <span className="text-muted-foreground">{r.sector || '—'}</span> },
];

/** A sortable header button. */
function SortHead({ label, active, dir, onClick, num }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void; num?: boolean }) {
  return (
    <th scope="col" aria-sort={active ? (dir === 1 ? 'ascending' : 'descending') : 'none'}
      className={cn('whitespace-nowrap px-3 py-2 text-micro font-medium uppercase tracking-[.05em] text-muted-foreground first:pl-0', num ? 'text-right' : 'text-left')}>
      <button type="button" onClick={onClick} className={cn('uppercase hover:text-foreground', active && 'text-foreground')}>
        {label}{active ? (dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

function Identity({ row, onClick }: { row: { symbol: string; name: string; kind: string }; onClick: () => void }) {
  return (
    <button type="button" title={row.name} onClick={onClick} className="flex max-w-[300px] items-center gap-2 text-left hover:text-primary">
      <InstrumentMark row={row} />
      <span className="truncate text-13">{row.name}</span>
      <span className="text-micro font-semibold text-muted-foreground">{row.symbol}</span>
    </button>
  );
}

function Coverage({ title, lines }: { title: string; lines: string[] }) {
  return (
    <details className="mt-6 rounded-xl border border-border px-4 py-3 text-13 text-muted-foreground">
      <summary className="cursor-pointer font-semibold text-foreground">{title}</summary>
      <div className="mt-3 grid max-w-[100ch] gap-2 leading-relaxed">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
    </details>
  );
}

/* ---------- the screener tab ----------------------------------------------------- */

function ScreenerTab() {
  const nav = useNav();
  const q = useQueryState();
  const has = useHasKey();
  const screen = earningsScreen(q.get('screen'));
  const days = WINDOWS.includes(Number(q.get('days'))) ? Number(q.get('days')) : WINDOWS[0];
  const [data, setData] = React.useState<Awaited<ReturnType<typeof loadWindow>> | null>(null);
  const [error, setError] = React.useState<{ status: string; message?: string } | null>(null);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState('date');
  const [dir, setDir] = React.useState<1 | -1>(-1);
  const [shown, setShown] = React.useState(PAGE);

  // Always written, so the menu highlights the open screen on a bare `/earnings`.
  React.useEffect(() => { if (!q.get('screen')) q.set({ screen: screen.id }); }, [q, screen.id]);
  React.useEffect(() => { document.title = `${screen.label} earnings — Maz Vantage`; }, [screen.label]);

  React.useEffect(() => {
    if (!has) return;
    let live = true;
    setData(null); setError(null);
    loadWindow(days).then((r) => {
      if (!live) return;
      if (r.status !== 'ok' && !r.rows.length) setError({ status: r.status, message: r.message || 'The earnings calendar returned nothing for this window.' });
      else { setData(r); setShown(PAGE); }
    }).catch((e) => { if (live) setError({ status: 'error', message: String(e?.message || e) }); });
    return () => { live = false; };
  }, [days, has]);

  const choose = (id: string) => {
    const next = earningsScreen(id);
    // A column that exists on one screen and not the other cannot stay sorted.
    if (!columnsFor(next).some((c) => c.key === sort) && sort !== 'name') setSort('date');
    setShown(PAGE);
    q.set({ screen: next.id });
  };
  const columns = columnsFor(screen);
  const pool = (data?.rows || []).filter((r) => (screen.reported ? r.hasResult : r.ahead && !r.hasResult)).filter((r) => !screen.test || screen.test(r));
  const needle = query.trim().toLowerCase();
  const read = sort === 'name' ? (r: ERow) => r.name : columns.find((c) => c.key === sort)?.get || ((r: ERow) => r.date);
  const rows = pool.filter((r) => !needle || `${r.symbol} ${r.name}`.toLowerCase().includes(needle)).sort((a, b) => {
    const x = read(a); const y = read(b);
    if (x == null || x === '') return y == null || y === '' ? 0 : 1;
    if (y == null || y === '') return -1;
    return (typeof x === 'string' ? x.localeCompare(String(y)) : x - y) * dir;
  });
  const reported = (data?.rows || []).filter((r) => r.hasResult);
  const beat = reported.filter((r) => isNum(r.surprise) && r.surprise > 0).length;
  const measured = reported.filter((r) => isNum(r.surprise)).length;
  const sortBy = (key: string) => {
    if (sort === key) setDir(dir === 1 ? -1 : 1);
    else { setSort(key); setDir(key === 'name' || key === 'sector' ? 1 : -1); }
    setShown(PAGE);
  };

  return (
    <div className="grid gap-5 pt-6">
      <Para>The earnings calendar as one table. Pick a screen; the window, the columns and the search stay where they are. Every figure is as published — the reported actual, and the consensus that stood before the result.</Para>
      <ChipRail label="Earnings screens" items={EARNINGS_SCREENS.map((s) => ({ id: s.id, label: s.label, tag: s.tag }))} active={screen.id} onChoose={choose} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">
          Window
          <select value={days} onChange={(e) => q.set({ days: Number(e.target.value) === WINDOWS[0] ? null : e.target.value })}
            className="h-9 rounded-md border border-border bg-background px-2 text-13 font-normal normal-case tracking-normal text-foreground">
            {WINDOWS.map((n) => <option key={n} value={n}>{n} days</option>)}
          </select>
        </label>
        <label className="grid flex-1 gap-1 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">
          Search
          <Input type="search" placeholder="Search company or symbol" aria-label="Search these results" value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} className="h-9 max-w-md font-normal normal-case tracking-normal" />
        </label>
      </div>
      {!has ? (
        <EmptyState status="skipped" message="The earnings calendar is market-wide data and is unavailable right now." />
      ) : error ? <EmptyState status={error.status} message={error.message} />
        : !data ? <EmptyState status="loading" message={`Loading ${days} days either side of today…`} /> : (
          <>
            <div className="grid gap-2 rounded-xl border border-border bg-muted p-5">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h2 className="text-xl font-bold tracking-[-.02em]">{screen.label}</h2>
                <span className="rounded-full bg-background px-2.5 py-0.5 text-micro font-semibold text-muted-foreground">{screen.tag}</span>
              </div>
              <p className="text-sm leading-relaxed">{screen.line}</p>
              <p className="flex flex-wrap items-center gap-2 text-13 text-muted-foreground">
                <span><b className="text-foreground">{pool.length}</b> {screen.reported ? 'results' : 'scheduled'}</span>
                <MetaDivider />
                <span>{days} days either side of {fmtDate(data.today, { day: 'numeric', month: 'short' })}</span>
                {measured ? <><MetaDivider /><span><b className="text-foreground">{Math.round((beat / measured) * 100)}%</b> of the {measured} measurable results beat</span></> : null}
                {data.unmatched ? (
                  <><MetaDivider /><span title="The calendar covers Toronto, the venture board and the OTC sheets as well. A row the US screener does not return has no name, sector or size to show, so it is left out.">
                    {data.unmatched.toLocaleString('en-US')} non-US rows dropped</span></>
                ) : null}
              </p>
            </div>
            {!rows.length ? (
              <EmptyState status="ok" compact message={query ? 'Nothing in this screen matches that.' : screen.reported
                ? 'Nothing in this window matched this screen. A quiet stretch between reporting seasons really is empty — widen the window.'
                : 'Nothing is scheduled in this window that the US listings cover.'} />
            ) : (
              <>
                <div className="overflow-x-auto scroll-thin">
                  <table className="w-full border-collapse text-13 tnum">
                    <thead>
                      <tr className="border-b border-border">
                        <SortHead label="Company" active={sort === 'name'} dir={dir} onClick={() => sortBy('name')} />
                        {columns.map((c) => <SortHead key={c.key} label={c.label} num={c.num} active={sort === c.key} dir={dir} onClick={() => sortBy(c.key)} />)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, shown).map((r) => (
                        <tr key={`${r.symbol}-${r.date}`} className="border-b border-border hover:bg-accent/60">
                          <td className="py-2 pr-3"><Identity row={r} onClick={() => nav.goSymbol(r.symbol)} /></td>
                          {columns.map((c) => <td key={c.key} className={cn('whitespace-nowrap px-3 py-2', c.num ? 'text-right' : 'text-left')}>{c.cell(r)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > shown ? (
                  <Button variant="outline" className="justify-self-start" onClick={() => setShown((n) => n + PAGE)}>
                    Show {Math.min(PAGE, rows.length - shown)} more — {rows.length - shown} left
                  </Button>
                ) : null}
                <Coverage title="Where these numbers come from" lines={[
                  'The earnings calendar: one row per company per report, carrying the date, the consensus estimate that stood before the result, and the actual once it lands. A row without an actual has not reported yet, which is what separates the Upcoming screen from the other five.',
                  'The calendar carries a symbol and nothing else about the company, so it is joined to one screener call for the name, the sector and the size. That join is also the filter: the calendar covers Toronto, the venture board and the OTC sheets, and a row the US screener does not return is counted above rather than shown with three empty columns.',
                  'A surprise is the actual against the estimate, divided by the size of the estimate. Where consensus was within half a cent of zero the division is left empty — any result over an estimate that small is a four-figure percentage, which is arithmetic rather than news.',
                  'A beat rate above half is the market’s normal state, not a signal: consensus is guided by the companies it measures, and one that expects to miss usually resets the estimate first. Read the distance from the usual, not the direction.',
                  'Nothing here reads a transcript. No model scores management tone, counts hedging words or produces a sentiment reading — none is published, and this app runs none.',
                ]} />
              </>
            )}
          </>
        )}
    </div>
  );
}

/* ---------- insights — a view of the research store, not a second store ---------- */

/** Articles per press of the button. Small: these are long reads. */
const INSIGHT_PAGE = 6;

function InsightsTab() {
  const nav = useNav();
  const [all, setAll] = React.useState<Article[] | null>(() => articlesReady() || null);
  const [failed, setFailed] = React.useState(false);
  const [type, setType] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState(INSIGHT_PAGE);
  React.useEffect(() => {
    if (all) return;
    loadArticles().then(() => setAll(articlesReady() || [])).catch(() => setFailed(true));
  }, [all]);

  const pool = (all || []).filter((a) => a.primaryCategory === 'earnings');
  const types: any[] = (CATEGORY_BY_KEY as any).earnings?.types || [];
  // A type nobody has written for yet is left off rather than shown as a zero.
  const chips = [{ id: null as string | null, label: 'All', tag: String(pool.length) },
    ...types.map((t) => ({ id: t.key as string | null, label: t.label, tag: String(pool.filter((a) => a.articleType === t.key).length) }))]
    .filter((c) => c.id === null || Number(c.tag) > 0);
  const { items, total } = all ? queryArticles({ category: 'earnings', ...(type ? { type } : {}) }, { perPage: shown, list: all }) : { items: [], total: 0 };

  return (
    <section aria-label="Earnings insights" className="grid gap-5 pt-6">
      <Para>Written work on results: what the consensus expected, what landed against it, and what management said about the quarter after. These are read and written by people — nothing here is a model summarising a call, for the same reason the Method tab gives.</Para>
      {failed ? <EmptyState status="error" message="The research store could not be loaded — /data/articles.json is missing or malformed." />
        : !all ? <p className="text-13 text-muted-foreground">Loading written work …</p>
          : !pool.length ? <EmptyState status="empty" message="No earnings articles are in the store. The research fixture ships none filed under Earnings." /> : (
            <>
              <ChipRail label="Insight types" items={chips} active={type} onChoose={(id) => { setType(id); setShown(INSIGHT_PAGE); }} />
              {items.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">{items.map((a: Article) => <ArticleCard key={a.slug} a={a} />)}</div>
              ) : <EmptyState status="empty" message="Nothing filed under that type yet. The other types above still have articles." />}
              <div className="grid justify-items-start gap-3">
                {total > items.length ? <Button variant="outline" size="sm" onClick={() => setShown((n) => n + INSIGHT_PAGE)}>Show {Math.min(INSIGHT_PAGE, total - items.length)} more</Button> : null}
                <p className="text-tiny text-muted-foreground">{items.length} of {total} article{total === 1 ? '' : 's'} filed under Earnings.</p>
                <div className="text-tiny text-muted-foreground [&_b]:text-foreground" dangerouslySetInnerHTML={{ __html: SAMPLE_NOTICE }} />
                <button type="button" onClick={() => nav.goQuery('research', 'latest', { category: 'earnings' })} className="text-13 font-semibold text-primary hover:underline">Open these in the research feed ›</button>
              </div>
            </>
          )}
    </section>
  );
}

/* ---------- transcripts: the written summaries and the call library -------------- */

let summariesPromise: Promise<Record<string, any>> | null = null;
const loadSummaries = () => (summariesPromise ??= fetch('/data/summaries.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({})));

/* The only thing on this desk a person wrote, each with its byline: an
   unattributed summary of a call is indistinguishable from a generated one. */
function Summaries() {
  const nav = useNav();
  const [entries, setEntries] = React.useState<any[] | null>(null);
  React.useEffect(() => {
    loadSummaries().then((s) => setEntries(Object.entries(s || {}).filter(([k]) => !k.startsWith('_')).map(([key, v]: [string, any]) => {
      const [symbol, year, quarter] = key.split('|');
      return { key, symbol, year: Number(year), quarter: Number(quarter), ...v };
    }).sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter))));
  }, []);
  if (!entries) return null;
  return (
    <section aria-label="Written summaries" className="grid gap-3 rounded-xl border border-border p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-bold">Calls somebody read</h3>
        <span className="text-tiny text-muted-foreground">{entries.length} call{entries.length === 1 ? '' : 's'}</span>
      </div>
      <p className="max-w-[90ch] text-13 leading-relaxed text-muted-foreground">Written by hand from the transcript and shipped with the repo, each with its byline. There is no model reading transcripts in the background — a call without an entry here shows its transcript alone, which was always the point.</p>
      {entries.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {entries.map((e) => (
            <button key={e.key} type="button" onClick={() => nav.goSymbolTab('Transcripts', e.symbol)} className="grid content-start gap-1.5 rounded-lg border border-border p-3.5 text-left hover:bg-accent">
              <div className="flex items-baseline justify-between"><b>{e.symbol}</b><span className="text-tiny text-muted-foreground">Q{e.quarter} {e.year}</span></div>
              {e.headline ? <p className="line-clamp-3 text-13 leading-snug">{e.headline}</p> : null}
              <span className="text-micro text-muted-foreground">{e.writtenBy || 'unattributed'}{e.writtenAt ? ` · ${fmtDate(e.writtenAt)}` : ''}</span>
            </button>
          ))}
        </div>
      ) : <p className="text-13 text-muted-foreground">No summaries are shipped yet.</p>}
    </section>
  );
}

function TranscriptsTab() {
  const nav = useNav();
  const has = useHasKey();
  const [rows, setRows] = React.useState<{ symbol: string; name: string; kind: 'stock'; calls: number | null }[] | null>(null);
  const [error, setError] = React.useState<{ status: string; message?: string } | null>(null);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<'calls' | 'name'>('calls');
  const [dir, setDir] = React.useState<1 | -1>(-1);
  const [shown, setShown] = React.useState(PAGE);
  React.useEffect(() => {
    if (!has) return;
    let live = true;
    fetchTranscriptList().then((r: any) => {
      if (!live) return;
      if (r.status !== 'ok') { setError({ status: r.status, message: r.message || 'The call library could not be loaded.' }); return; }
      setRows((r.data || []).filter((x: any) => x?.symbol).map((x: any) => ({
        symbol: x.symbol, name: x.companyName || x.name || x.symbol, kind: 'stock' as const,
        calls: Number(x.noOfTranscripts ?? x.count ?? x.transcripts) || null,
      })));
    }).catch((e) => { if (live) setError({ status: 'error', message: String(e?.message || e) }); });
    return () => { live = false; };
  }, [has]);

  const needle = query.trim().toLowerCase();
  const list = (rows || []).filter((r) => !needle || `${r.symbol} ${r.name}`.toLowerCase().includes(needle)).sort((a, b) => {
    const x = sort === 'name' ? a.name : a.calls;
    const y = sort === 'name' ? b.name : b.calls;
    if (x == null) return y == null ? 0 : 1;
    if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number)) * dir;
  });
  const sortBy = (k: 'calls' | 'name') => { if (sort === k) setDir(dir === 1 ? -1 : 1); else { setSort(k); setDir(k === 'name' ? 1 : -1); } setShown(PAGE); };

  return (
    <div className="grid gap-5 pt-6">
      <Summaries />
      <Para>Which companies have earnings calls on record, and how many each. A transcript is about one company and there is nothing useful to say about eighty of them at once, so this is a way in rather than a reader — the text opens on that company’s own Transcripts tab.</Para>
      <Input type="search" placeholder="Search company or symbol" aria-label="Search the transcript library" value={query}
        onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} className="h-9 max-w-md" />
      {!has ? <EmptyState status="skipped" message="The call library is a market-wide list and is unavailable right now." />
        : error ? <EmptyState status={error.status} message={error.message} />
          : !rows ? <EmptyState status="loading" message="Loading the call library…" /> : (
            <>
              <p className="flex items-center gap-2 text-13 text-muted-foreground">
                <span><b className="text-foreground">{list.length.toLocaleString('en-US')}</b> companies</span><MetaDivider /><span>{rows.length.toLocaleString('en-US')} in the library</span>
              </p>
              {!list.length ? <EmptyState status="ok" compact message={rows.length ? 'No company in the library matches that.' : 'No companies came back.'} /> : (
                <>
                  <div className="overflow-x-auto scroll-thin">
                    <table className="w-full border-collapse text-13 tnum">
                      <thead>
                        <tr className="border-b border-border">
                          <SortHead label="Company" active={sort === 'name'} dir={dir} onClick={() => sortBy('name')} />
                          <SortHead label="Calls held" num active={sort === 'calls'} dir={dir} onClick={() => sortBy('calls')} />
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {list.slice(0, shown).map((r) => (
                          <tr key={r.symbol} className="border-b border-border hover:bg-accent/60">
                            <td className="py-2 pr-3"><Identity row={r} onClick={() => nav.goSymbolTab('Transcripts', r.symbol)} /></td>
                            <td className="px-3 py-2 text-right">{isNum(r.calls) ? r.calls.toLocaleString('en-US') : NA}</td>
                            <td className="px-3 py-2 text-right"><button type="button" onClick={() => nav.goSymbolTab('Transcripts', r.symbol)} className="text-13 font-semibold text-primary hover:underline">Read the calls ›</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {list.length > shown ? <Button variant="outline" className="justify-self-start" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more — {list.length - shown} left</Button> : null}
                </>
              )}
            </>
          )}
    </div>
  );
}

/* ---------- method ------------------------------------------------------------------ */

function MethodTab() {
  const nav = useNav();
  return (
    <div className="grid gap-5 pt-6">
      <Panel title="What this desk measures">
        <Para>Two things, both of them checkable: a result measured against the estimate that preceded it, and a summary somebody wrote after reading the call.</Para>
        <Grid heads={['It does', 'It does not']} rows={[
          ['Compare reported earnings per share with the consensus that stood before the result.', 'Read the transcript. No model here scores management tone, counts hedging words or produces a sentiment reading — none is published, and this app runs none.'],
          ['Show the surprise on both lines, with the actual and the estimate beside the percentage, sortable in either direction.', 'Claim a surprise caused a price move. The two are not matched anywhere on this desk.'],
          ['List the calls that have a written summary, with who wrote it and when.', 'Summarise the rest. A call without an entry shows its transcript alone.'],
        ]} />
      </Panel>
      <Panel title="How to read a beat rate">
        <Warn>A beat rate above half is the market’s <b>normal state, not a signal</b>. Consensus is guided by the companies it measures, and one that expects to miss usually resets the estimate first. Read the distance from the usual, not the direction.</Warn>
        <Para>The rate printed above the table is over the results in the window that had a usable estimate behind them — not over everything that reported. A company with no consensus on record cannot beat or miss, and counting it as either would move the rate for a reason that has nothing to do with the quarter.</Para>
      </Panel>
      <Panel title="Where each column comes from">
        <Grid heads={['Column', 'Source']} rows={[
          ['Date', 'The calendar’s own date for the report. The session — before the open or after the close — is on the Calendar page, where one is published; this table does not show it yet.'],
          ['EPS estimate and actual', 'The consensus and the reported figure, both as filed on the calendar row.'],
          ['EPS surprise', 'Actual minus estimate, over the size of the estimate. Left empty where consensus was within half a cent of zero.'],
          ['Revenue and revenue surprise', 'The same pair on the top line, where both are published.'],
          ['Market cap and sector', 'Joined from one screener call. The calendar itself carries neither.'],
        ]} />
      </Panel>
      <Panel title="What is not here">
        <Grid heads={['Missing', 'Why']} rows={[
          ['Report time (before open or after close)', 'Not in this table yet. The calendar carries it where one is published, and the Calendar page shows it.'],
          ['Guidance', 'Forward guidance is given on the call and in the release, not on this feed. The Analysts Forecast tab on a company report carries the estimates that follow it.'],
          ['Price reaction', 'Matching a surprise to the next session’s move needs a quote per company per date, and the causal claim it invites would not survive the arithmetic.'],
        ]} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => nav.goSymbolTab('Analysts Forecast')}>A company’s forecast tab →</Button>
          <Button size="sm" variant="outline" onClick={() => nav.goView('calendar')}>The full calendar →</Button>
        </div>
      </Panel>
    </div>
  );
}

/* ---------- the page ----------------------------------------------------------------- */

type TabId = 'screener' | 'insights' | 'transcripts' | 'method';
/* Insights second: the screener says what happened, this says what it was
   worth, and the transcript is the source under both. */
const TABS: { id: TabId; label: string }[] = [
  { id: 'screener', label: 'Earnings Screener' },
  { id: 'insights', label: 'Insights' },
  { id: 'transcripts', label: 'Transcripts' },
  { id: 'method', label: 'Method' },
];

export function EarningsPage({ sub }: { sub: string | null }) {
  const nav = useNav();
  const tab: TabId = TABS.some((t) => t.id === sub) ? (sub as TabId) : 'screener';
  return (
    <PageFrame id="earnings-desk">
      <PageHero eyebrow="Earnings" title="Earnings"
        strap="The calendar as a table: who reports next, who has reported, and how each result landed against the consensus that preceded it. Plus the library of calls with a transcript on record."
        meta={<><ConnectionButton /><MetaDivider /><span>Surprises against consensus — no model reads the call</span></>} />
      <SectionBar label="Earnings sections" items={TABS} active={tab} onSelect={(id) => nav.goView('earnings', id)} />
      {tab === 'screener' ? <ScreenerTab /> : tab === 'insights' ? <InsightsTab /> : tab === 'transcripts' ? <TranscriptsTab /> : <MethodTab />}
    </PageFrame>
  );
}
