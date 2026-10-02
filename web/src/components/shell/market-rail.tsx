'use client';

/* ==========================================================================
   The market rail

   A sticky column down the right of every page: the local index board, the
   reader's watchlist, the day's movers, and what reports next. TradingView's
   watchlist panel is the reference.

   Each section's title opens the page behind it; the caret beside the title
   folds the section. The button at the top right puts the whole rail away to
   a slim strip and brings it back, and that choice is remembered.

   It lives in the root layout, which Next keeps mounted across navigations —
   so the rail is the singleton the legacy build had to engineer: scroll
   position, folded sections and fetched quotes all survive a page change,
   and the rail loads once per session and then only when asked.

   The scroll contract (rail scrolls under the cursor, page scrolls
   otherwise) is four properties, all load-bearing: sticky + top, a
   viewport's height, `overflow-y: auto`, and `overscroll-behavior: contain`
   — without the last, reaching the end of the rail hands the remaining wheel
   delta to the page behind it.
   ========================================================================== */

import * as React from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { fetchMarket, fetchCalendar, fetchBatchQuotes, hasApiKey } from '@/lib/fmp';
import { normalizeHubQuote, loadHubSection, countryOf } from '@/lib/markethub-data';
import { storedCountry } from '@/lib/market-format';
import { ago, isNum } from '@/lib/format';
import { EmptyState, InstrumentMark, PriceText, Signed, Chevron } from '@/components/market/market-ui';
import { changeOf } from '@/lib/market-format';
import { activeList, addSymbols, cleanSymbol, isSymbol, removeSymbol, setActiveList, useWatchlists } from '@/lib/watchlists';
import { useNav } from '@/components/nav-context';
import { useDataEpoch } from '@/components/providers';
import { cn } from '@/lib/cn';

const ROWS = 6;
const SUMMARY_ROWS = 5;
const CALENDAR_ROWS = 6;
/* The watchlist section shows the **active** list of the one store the
   Watchlist page and every star share (`lib/watchlists.ts`). It used to keep
   a list of its own under `mazvantage.watchlist`, which the store folded in
   once and never deletes. */
/** Sections the reader has collapsed, so the rail reopens as they left it. */
const COLLAPSED_KEY = 'mazvantage.rail.collapsed';
/** Whether the reader has put the whole rail away. Same prefix as every other
    key, deliberately: renaming stored keys would wipe what readers saved. */
const CLOSED_KEY = 'mazvantage.rail.closed';

/* Every read is wrapped: a private window or blocked site data throws on
   access, and a rail that cannot remember a watchlist should still show one. */
function readList(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
}
function writeList(key: string, value: string[]) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* not stored this session */ }
}

type Loadable = { status: string; message?: string; rows: any[] };
const LOADING: Loadable = { status: 'loading', rows: [] };

/** One quote as a rail row. An index leads with its name — "S&P 500" is what a
    reader looks for, not "GSPC". */
function RailRow({ row, onPick, trailing }: { row: any; onPick: () => void; trailing?: React.ReactNode }) {
  const symbol = String(row.symbol || '').replace(/^\^/, '');
  const name = row.shortName || row.name || '';
  const [main, sub] = row.kind === 'index' && name ? [name, symbol] : [symbol, name];
  return (
    <button type="button" aria-label={`Open ${main}`} onClick={onPick}
      className="grid w-full grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-[9px] px-3 py-[7px] text-left hover:bg-accent">
      <InstrumentMark row={row} className="size-[26px] text-[8px]" />
      <span className="grid min-w-0 gap-px">
        <strong className="text-13 font-semibold">{main}</strong>
        <small className="truncate text-[10px] text-muted-foreground">{sub}</small>
      </span>
      {trailing ?? (
        <span className="grid justify-items-end gap-px whitespace-nowrap tnum">
          <PriceText row={row} className="text-tiny" />
          <Signed value={changeOf(row)} className="text-micro" />
        </span>
      )}
    </button>
  );
}

function Section({
  id, title, collapsed, onToggle, onOpen, children,
}: { id: string; title: string; collapsed: boolean; onToggle: () => void; onOpen: () => void; children: React.ReactNode }) {
  return (
    <section data-section={id} className="border-b border-border pb-2">
      <div className="flex items-center gap-0.5 pl-1.5 pr-2">
        {/* The caret folds the section; the title beside it is a link to its
            page — one button doing both made "Watchlist" a fold rather than a
            way to the Watchlist page. */}
        <button type="button" aria-expanded={!collapsed} aria-label={`Show or hide ${title}`} onClick={onToggle}
          className="group flex w-[22px] flex-none items-center justify-center rounded-[5px] py-[11px]">
          <span aria-hidden="true" className={cn('text-13 leading-none text-muted-foreground transition-transform group-hover:text-foreground', collapsed && '-rotate-90')}>⌄</span>
        </button>
        <button type="button" onClick={onOpen} className="group min-w-0 flex-1 px-0.5 py-[11px] text-left">
          <span className="text-micro font-semibold uppercase tracking-[.07em] text-muted-foreground group-hover:text-primary">{title}</span>
        </button>
        <button type="button" aria-label={`See all ${title}`} onClick={onOpen}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <Chevron />
        </button>
      </div>
      {collapsed ? null : children}
    </section>
  );
}

function Rows({ data, onPick, emptyMessage }: { data: Loadable; onPick: (row: any) => void; emptyMessage: string }) {
  if (!data.rows.length) {
    return <EmptyState status={data.status} message={data.status === 'loading' ? '' : data.message || emptyMessage} compact className="min-h-0 bg-transparent p-3 text-left [&_strong]:text-tiny" />;
  }
  return <div className="grid">{data.rows.map((row, i) => <RailRow key={`${row.symbol}-${i}`} row={row} onPick={() => onPick(row)} />)}</div>;
}

export function MarketRail() {
  const nav = useNav();
  const { epoch } = useDataEpoch();
  const [closed, setClosed] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [ready, setReady] = React.useState(false);

  const [country, setCountry] = React.useState(() => countryOf('US'));
  const [summary, setSummary] = React.useState<Loadable>(LOADING);
  const [watch, setWatch] = React.useState<Loadable>(LOADING);
  const [gainers, setGainers] = React.useState<Loadable>(LOADING);
  const [losers, setLosers] = React.useState<Loadable>(LOADING);
  const [active, setActive] = React.useState<Loadable>(LOADING);
  const [calendar, setCalendar] = React.useState<Loadable>(LOADING);
  const [adding, setAdding] = React.useState('');

  // Stored state is read after mount: the server has no localStorage.
  React.useEffect(() => {
    try { setClosed(localStorage.getItem(CLOSED_KEY) === '1'); } catch { /* default open */ }
    setCollapsed(new Set(readList(COLLAPSED_KEY, [])));
    setReady(true);
  }, []);

  const toggleSection = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    writeList(COLLAPSED_KEY, [...next]);
    return next;
  });

  const store = useWatchlists();
  const list = activeList(store);
  const listSymbols = React.useMemo(() => list?.symbols ?? [], [list?.symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadWatchlist = React.useCallback(async (symbols: string[]) => {
    // No message of its own: the section says which list is empty.
    if (!symbols.length) { setWatch({ status: 'unavailable', message: '', rows: [] }); return; }
    if (!hasApiKey()) {
      // Named, unpriced: the list is the reader's own and still worth showing.
      setWatch({ status: 'ok', rows: symbols.map((symbol) => normalizeHubQuote({}, { symbol, kind: 'stock' })) });
      return;
    }
    const res = await fetchBatchQuotes(symbols).catch(() => null);
    const by = new Map((Array.isArray(res?.data) ? res!.data : []).map((r: any) => [String(r.symbol).toUpperCase(), r]));
    setWatch({ status: 'ok', rows: symbols.map((symbol) => normalizeHubQuote(by.get(symbol) || {}, { symbol, kind: 'stock' })) });
  }, []);

  const load = React.useCallback((force = false) => {
    /* A section that throws says so. Swallowing it leaves the rail showing
       "Loading market data" for the rest of the session, which reads as a
       slow network rather than as the bug it is. */
    const guard = (set: (d: Loadable) => void, run: () => Promise<void>) =>
      run().catch((error) => set({ status: 'error', message: String(error?.message || error), rows: [] }));

    // World has no index board of its own, so the summary reads it as the US.
    const stored = storedCountry(new URLSearchParams());
    const c = countryOf(stored === 'WORLD' ? 'US' : stored);
    setCountry(c);

    guard(setSummary, async () => {
      if (!hasApiKey()) { setSummary({ status: 'skipped', message: 'The market summary is unavailable right now.', rows: [] }); return; }
      const res: any = await loadHubSection('indices', { country: c.code, refresh: force });
      const rows = (res.data?.quotes || []).filter((row: any) => row.available).slice(0, SUMMARY_ROWS);
      setSummary({ status: res.status, message: res.message || 'No index quotes returned.', rows });
    });
    guard(setGainers, async () => {
      if (!hasApiKey()) {
        const skip = { status: 'skipped', message: 'The day’s movers are unavailable right now.', rows: [] };
        setGainers(skip); setLosers(skip); setActive(skip);
        return;
      }
      const [g, l, a] = await Promise.all([fetchMarket('gainers'), fetchMarket('losers'), fetchMarket('active')]);
      const rows = (res: any) => (Array.isArray(res?.data) ? res.data : [])
        .map((r: any) => normalizeHubQuote(r, { kind: 'stock' })).filter((r: any) => r.available).slice(0, ROWS);
      setGainers({ status: g.status, message: g.message || 'No gainers returned.', rows: rows(g) });
      setLosers({ status: l.status, message: l.message || 'No losers returned.', rows: rows(l) });
      setActive({ status: a.status, message: a.message || 'No active listings returned.', rows: rows(a) });
    });
    guard(setCalendar, async () => {
      if (!hasApiKey()) { setCalendar({ status: 'skipped', message: 'Upcoming earnings are unavailable right now.', rows: [] }); return; }
      const iso = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
      const res = await fetchCalendar('earnings', iso(0), iso(7));
      const rows = (Array.isArray(res?.data) ? res.data : [])
        .filter((r: any) => r.symbol && /^[A-Z]{1,5}$/.test(r.symbol))
        .sort((x: any, y: any) => String(x.date).localeCompare(String(y.date)))
        .slice(0, CALENDAR_ROWS);
      setCalendar({ status: res.status, message: 'No reports scheduled in the next week.', rows });
    });
  }, []);

  /* Loaded once, and again only when asked or after Settings changed the key.
     A rail that starts closed fetches nothing until it is opened. */
  const loadedAt = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!ready || closed) return;
    if (loadedAt.current === epoch) return;
    const force = loadedAt.current !== null;
    loadedAt.current = epoch;
    load(force);
  }, [ready, closed, epoch, load]);

  /* The watchlist follows the store instead: a star clicked on a report, or a
     list switched on the Watchlist page, redraws this section at once. One
     batch request per change of symbols, and none while the rail is shut. */
  React.useEffect(() => {
    if (!ready || closed || !store.ready) return;
    loadWatchlist(listSymbols).catch((error) => setWatch({ status: 'error', message: String(error?.message || error), rows: [] }));
  }, [ready, closed, store.ready, listSymbols, epoch, loadWatchlist]);

  const refresh = () => {
    load(true);
    loadWatchlist(listSymbols).catch(() => { /* the section says so on its next load */ });
  };

  const setRailClosed = (v: boolean) => {
    setClosed(v);
    try { localStorage.setItem(CLOSED_KEY, v ? '1' : '0'); } catch { /* not remembered */ }
  };

  const openSymbol = (row: any) => nav.goSymbol(row.symbol || row);
  const openIndices = () => nav.goView('markets', 'indices', { country: country.code });

  return (
    <aside
      aria-label="Market rail"
      data-closed={closed || undefined}
      className={cn(
        'sticky top-0 h-screen overflow-y-auto overflow-x-hidden overscroll-contain border-l border-border bg-background text-13 scroll-thin no-print',
        'max-[1280px]:hidden',
      )}
    >
      <div className={cn('sticky top-0 z-[2] flex min-h-[var(--utilbar-h)] items-center gap-2.5 border-b border-border bg-background px-3.5',
        closed ? 'justify-center px-0' : 'justify-between')}>
        {closed ? null : (
          <>
            <span className="text-tiny font-semibold uppercase tracking-[.09em] text-muted-foreground">Markets</span>
            <button type="button" aria-label="Refresh the rail" onClick={refresh}
              className="ml-auto size-[26px] flex-none rounded-md text-sm leading-none text-muted-foreground hover:bg-accent hover:text-foreground">↻</button>
          </>
        )}
        <button
          type="button"
          aria-expanded={!closed}
          aria-controls="market-rail-body"
          aria-label={closed ? 'Show the market panel' : 'Hide the market panel'}
          title={closed ? 'Show the market panel' : 'Hide the market panel'}
          onClick={() => setRailClosed(!closed)}
          className={cn('inline-flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', !closed && '-ml-1.5')}
        >
          {closed ? <PanelRightOpen className="size-[18px]" strokeWidth={1.8} /> : <PanelRightClose className="size-[18px]" strokeWidth={1.8} />}
        </button>
      </div>

      {closed ? null : (
        <div id="market-rail-body" className="grid">
          <Section id="summary" title={`${country.short} market summary`} collapsed={collapsed.has('summary')}
            onToggle={() => toggleSection('summary')} onOpen={openIndices}>
            <Rows data={summary} onPick={openIndices} emptyMessage="No index quotes returned." />
          </Section>

          <Section id="watchlist" title="Watchlist" collapsed={collapsed.has('watchlist')}
            onToggle={() => toggleSection('watchlist')} onOpen={() => nav.goView('watchlist')}>
            {/* Which list this is, and a way to switch — the same "active" list
                the Watchlist page opens on and every star adds to. */}
            {store.lists.length > 1 ? (
              <div className="px-3 pb-1.5">
                <select aria-label="Which watchlist the rail shows" value={list?.id || ''} onChange={(e) => setActiveList(e.target.value)}
                  className="w-full truncate rounded-[7px] border border-border bg-background px-2 py-1 text-tiny font-semibold">
                  {store.lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.symbols.length})</option>)}
                </select>
              </div>
            ) : null}
            {watch.rows.length && listSymbols.length ? (
              <div className="grid">
                {watch.rows.map((row) => (
                  // The remove button rides on top of the row: a button inside a
                  // button is invalid HTML that browsers resolve differently.
                  <div key={row.symbol} className="group relative [&>button:first-child]:pr-[30px]">
                    <RailRow row={row} onPick={() => openSymbol(row)} />
                    <button type="button" aria-label={`Remove ${row.symbol} from ${list?.name || 'the watchlist'}`}
                      onClick={() => removeSymbol(row.symbol)}
                      className="absolute right-1.5 top-1/2 size-5 -translate-y-1/2 rounded-[5px] text-[15px] leading-none text-muted-foreground opacity-0 hover:bg-accent hover:text-down focus-visible:opacity-100 group-hover:opacity-100">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Rows data={watch} onPick={openSymbol}
                emptyMessage={store.ready && !store.lists.length ? 'No watchlist yet — add a symbol to start one.' : `Add a symbol to ${list?.name || 'start a list'}.`} />
            )}
            <form className="px-3 pb-1.5 pt-1" onSubmit={(e) => {
              e.preventDefault();
              const symbol = cleanSymbol(adding);
              if (!isSymbol(symbol)) return;
              addSymbols([symbol]);
              setAdding('');
            }}>
              <input type="search" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add symbol"
                aria-label="Add a symbol to the watchlist" maxLength={12} autoComplete="off" spellCheck={false}
                className="w-full rounded-[7px] border border-border bg-muted px-2.5 py-[7px] text-tiny uppercase placeholder:normal-case placeholder:text-muted-foreground" />
            </form>
          </Section>

          <Section id="gainers" title="Gainers" collapsed={collapsed.has('gainers')}
            onToggle={() => toggleSection('gainers')} onOpen={() => nav.goView('markets', 'gainers')}>
            <Rows data={gainers} onPick={openSymbol} emptyMessage="No gainers returned." />
          </Section>
          <Section id="losers" title="Losers" collapsed={collapsed.has('losers')}
            onToggle={() => toggleSection('losers')} onOpen={() => nav.goView('markets', 'losers')}>
            <Rows data={losers} onPick={openSymbol} emptyMessage="No losers returned." />
          </Section>
          <Section id="active" title="Most active" collapsed={collapsed.has('active')}
            onToggle={() => toggleSection('active')} onOpen={() => nav.goView('markets', 'active')}>
            <Rows data={active} onPick={openSymbol} emptyMessage="No active listings returned." />
          </Section>

          <Section id="calendar" title="Stocks calendar" collapsed={collapsed.has('calendar')}
            onToggle={() => toggleSection('calendar')} onOpen={() => nav.goView('calendar')}>
            {calendar.rows.length ? (
              <div className="grid">
                {calendar.rows.map((r) => (
                  <RailRow key={`${r.symbol}-${r.date}`} row={{ symbol: r.symbol, kind: 'stock', name: r.date ? ago(r.date) : '' }} onPick={() => openSymbol(r)}
                    trailing={<span className="whitespace-nowrap text-micro text-muted-foreground tnum">{isNum(r.epsEstimated) ? `${r.epsEstimated.toFixed(2)} est` : ''}</span>}
                  />
                ))}
              </div>
            ) : (
              <Rows data={calendar} onPick={openSymbol} emptyMessage="No reports scheduled in the next week." />
            )}
          </Section>
        </div>
      )}
    </aside>
  );
}

