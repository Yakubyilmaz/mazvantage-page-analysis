'use client';

/* ==========================================================================
   The ETF tables board

   Port of the legacy `etf-board.js`, which draws the catalogue in
   `lib/etf-tables.ts`: a category rail, a search box over the whole
   catalogue, and one sortable table per group with the session and five
   return windows beside each fund.

   **Search is the front door, and it searches everything.** Seventeen boards
   is more than anyone will page through, so the box is a lookup over the
   whole catalogue, and a match says which board the fund is filed on.
   Typing `gold` finds GLD on Key markets *and* on Commodities.

   **One board loads at a time.** Opening a category quotes that category's
   symbols and nothing else; a board already fetched is kept for the visit.

   **Grades are a second view of the same board, bought on a click.** Each
   group's funds are graded against each other on expenses, liquidity, risk,
   dividends and momentum (`lib/etf-grades.ts`), three requests a fund, and
   the button says how many before it spends them.
   ========================================================================== */

import * as React from 'react';
import { isNum, money, pct } from '@/lib/format';
import { ETF_GRADES, gradeGroup, loadFundFacts, MIN_PEERS, type FundFacts, type FundGrades } from '@/lib/etf-grades';
import { GradePill } from '@/components/report/grade-parts';
import {
  CATALOGUE_SIZE, ETF_TABLE_CATEGORIES, ETF_TABLE_INDEX, categorySymbols, etfTableCategory, loadFundRows,
} from '@/lib/etf-tables';
import { Chevron, EmptyState, InstrumentMark } from '@/components/market/market-ui';
import { useHasKey } from '@/components/pages/page-parts';
import { cn } from '@/lib/cn';

type FundRows = { rows: Map<string, any>; status: string; message: string };
interface Entry { label: string; symbol: string; sub: string | null; order: number; row: any; grades?: FundGrades | null; facts?: FundFacts | null }
type Column = { key: string; label: string; num?: boolean; get: (e: Entry) => unknown; cell: (e: Entry) => React.ReactNode; title?: string };
type Graded = { done: number; total: number; byGroup: Map<string, Map<string, FundGrades>> | null; facts: Map<string, FundFacts> | null; gated: boolean };

const dec2 = (v: unknown) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null);

function Change({ value }: { value: unknown }) {
  if (!isNum(value)) return <span className="text-muted-foreground">—</span>;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return <span className={cn('tnum', value > 0 && 'text-up', value < 0 && 'text-down')}>{sign}{dec2(Math.abs(value))}%</span>;
}

/**
 * Low, high, and where the price sits between them. The marker is the point:
 * whether today is at the top of the range or the bottom is what a reader
 * scanning forty rows is looking for.
 */
function Range({ low, high, price }: { low: unknown; high: unknown; price: unknown }) {
  if (!isNum(low) || !isNum(high) || high <= low) return <span className="text-muted-foreground">—</span>;
  const at = isNum(price) ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)) : null;
  return (
    <div role="img" className="flex min-w-[170px] items-center gap-2 text-micro text-muted-foreground tnum"
      aria-label={at == null ? `Range ${dec2(low)} to ${dec2(high)}` : `Range ${dec2(low)} to ${dec2(high)}, currently ${Math.round(at)}% of the way up it`}>
      <span>{dec2(low)}</span>
      <span className="relative h-1 flex-1 rounded-full bg-accent">
        {at == null ? null : <i className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" style={{ left: `${at}%` }} />}
      </span>
      <span>{dec2(high)}</span>
    </div>
  );
}

const COLUMNS: Column[] = [
  { key: 'price', label: 'Price', num: true, get: (e) => e.row?.price, cell: (e) => (isNum(e.row?.price) ? <span className="font-medium">{dec2(e.row.price)}</span> : <span className="text-muted-foreground">—</span>) },
  { key: 'd1', label: 'Today', num: true, get: (e) => e.row?.d1, cell: (e) => <Change value={e.row?.d1} /> },
  { key: 'd5', label: '5D', num: true, get: (e) => e.row?.d5, cell: (e) => <Change value={e.row?.d5} /> },
  { key: 'm1', label: '1M', num: true, get: (e) => e.row?.m1, cell: (e) => <Change value={e.row?.m1} /> },
  { key: 'ytd', label: 'YTD', num: true, get: (e) => e.row?.ytd, cell: (e) => <Change value={e.row?.ytd} /> },
  { key: 'y1', label: '1Y', num: true, get: (e) => e.row?.y1, cell: (e) => <Change value={e.row?.y1} /> },
  { key: 'y3', label: '3Y', num: true, get: (e) => e.row?.y3, cell: (e) => <Change value={e.row?.y3} /> },
  { key: 'dayRange', label: 'Day range', get: (e) => e.row?.dayHigh, cell: (e) => <Range low={e.row?.dayLow} high={e.row?.dayHigh} price={e.row?.price} /> },
  { key: 'yearRange', label: '52-week range', get: (e) => e.row?.yearHigh, cell: (e) => <Range low={e.row?.yearLow} high={e.row?.yearHigh} price={e.row?.price} /> },
];

/** The figure behind each grade, printed small beside the pill so a letter is never the only thing on show. */
const BEHIND: Record<string, (f: FundFacts) => string | null> = {
  expenses: (f) => (isNum(f.expenseRatio) ? `${f.expenseRatio.toFixed(2)}%` : null),
  liquidity: (f) => (isNum(f.aum) ? `${money(f.aum)} AUM` : null),
  risk: (f) => (isNum(f.volatility) ? `${pct(f.volatility)} vol` : null),
  dividends: (f) => (isNum(f.yieldTtm) ? `${pct(f.yieldTtm, { dp: 2 })} yield` : f.pays === false ? 'no payout' : null),
  momentum: (f) => (isNum(f.y1) ? `${f.y1 > 0 ? '+' : ''}${f.y1.toFixed(1)}% 1Y` : null),
};

const GRADE_COLUMNS: Column[] = ETF_GRADES.map((g) => ({
  key: g.key, label: g.label, num: true, title: g.what,
  get: (e) => e.grades?.[g.key].grade,
  cell: (e) => {
    const x = e.grades?.[g.key];
    const behind = e.facts ? BEHIND[g.key](e.facts) : null;
    return (
      <span className="inline-flex items-center justify-end gap-2" title={x?.why || undefined}>
        {behind ? <span className="text-micro text-muted-foreground">{behind}</span> : null}
        <GradePill score={x?.grade} letter={x?.letter} />
      </span>
    );
  },
}));

/**
 * A group, sortable in place. Sort state is per table: two tables asking
 * different questions should not be forced into one order, and the
 * catalogue's own sequence is a column like any other.
 */
function GroupTable({ title, note, entries, onTitle, onPick, columns = COLUMNS }: {
  title: string; note?: string | null; entries: Entry[]; onTitle?: () => void; onPick?: (row: any) => void; columns?: Column[];
}) {
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 }>({ key: 'order', dir: 1 });
  const read = (sort.key === 'order' ? null : columns.find((c) => c.key === sort.key)?.get) || ((e: Entry) => e.order);
  const ordered = [...entries].sort((a, b) => {
    const x = read(a), y = read(b);
    // A fund with no quote sorts last whichever way the column runs: it is not
    // the worst performer, it is the one that did not come back.
    if (!isNum(x)) return isNum(y) ? 1 : a.order - b.order;
    if (!isNum(y)) return -1;
    return (x - y) * sort.dir;
  });
  const th = (key: string, label: string, num?: boolean, extra?: string, title?: string) => (
    <th key={key} scope="col" title={title} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      className={cn('whitespace-nowrap border-b border-border bg-background px-3 py-2.5 text-micro font-medium text-muted-foreground', num ? 'text-right' : 'text-left', extra)}>
      <button type="button" className={cn('hover:text-foreground', sort.key === key && 'font-semibold text-foreground')}
        onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'order' ? 1 : -1 }))}>
        {label}{sort.key === key ? <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span> : null}
      </button>
    </th>
  );
  return (
    <section aria-label={title} className="mt-8 first:mt-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        {onTitle
          ? <button type="button" onClick={onTitle} className="inline-flex items-center gap-1 text-lg font-semibold hover:text-primary">{title}<Chevron /></button>
          : <h3 className="text-lg font-semibold">{title}</h3>}
        <span className="text-tiny text-muted-foreground">{entries.length} fund{entries.length === 1 ? '' : 's'}</span>
      </div>
      {note ? <p className="mb-3 max-w-[90ch] text-tiny leading-relaxed text-muted-foreground">{note}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-border scroll-thin">
        <table className="w-max min-w-full border-collapse text-13 tnum">
          <thead><tr>{th('order', 'Fund', false, 'sticky left-0 z-[1]')}{columns.map((c) => th(c.key, c.label, c.num, undefined, c.title))}</tr></thead>
          <tbody>
            {ordered.map((e) => (
              <tr key={`${e.symbol}-${e.order}`} className={cn('group', !e.row && 'opacity-60')}>
                <td className="sticky left-0 z-[1] border-b border-border bg-background px-3 py-2 group-hover:bg-muted">
                  <button type="button" disabled={!e.row && !onPick} title={e.row?.fundName || e.label}
                    onClick={() => onPick?.(e.row || { symbol: e.symbol, name: e.label, kind: 'etf' })}
                    className="flex min-w-0 items-center gap-2.5 text-left">
                    <InstrumentMark row={{ symbol: e.symbol, kind: 'etf' }} className="size-7" />
                    <span className="grid min-w-0 max-w-[260px]">
                      <span className="truncate font-medium group-hover:text-primary">{e.label}</span>
                      <span className="truncate text-micro text-muted-foreground">{e.sub || e.row?.fundName || ''}</span>
                    </span>
                    <span className="ml-1 rounded bg-accent px-1.5 py-0.5 text-micro font-semibold">{e.symbol}</span>
                  </button>
                </td>
                {columns.map((c) => <td key={c.key} className={cn('whitespace-nowrap border-b border-border px-3 py-2.5 group-hover:bg-muted', c.num && 'text-right')}>{c.cell(e)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const LIMIT = 80;

/** The switch between the board's returns and its grades, and the button that buys the grades. */
function GradeBar({ board, state, view, setView, onGrade }: {
  board: FundRows; state: Graded | null; view: 'returns' | 'grades'; setView: (v: 'returns' | 'grades') => void; onGrade: () => void;
}) {
  const ready = !!state?.byGroup;
  const running = !!state && !state.byGroup;
  const seg = (v: 'returns' | 'grades', label: string, disabled = false) => (
    <button type="button" aria-pressed={view === v} disabled={disabled} onClick={() => setView(v)}
      className={cn('px-3 py-1.5 text-13 font-medium disabled:opacity-50', view === v ? 'bg-foreground text-background' : 'hover:bg-accent')}>
      {label}
    </button>
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Board view" className="inline-flex overflow-hidden rounded-md border border-border">
        {seg('returns', 'Returns')}
        {seg('grades', 'Grades', !ready)}
      </div>
      {ready ? (
        <span className="text-tiny text-muted-foreground">
          {state!.gated ? 'The fund records are not available, so expenses and liquidity could not be graded. ' : ''}
          Each fund is graded against the others in its group, never given the company score.
        </span>
      ) : running ? (
        <span aria-live="polite" className="text-tiny text-muted-foreground">Reading fund records… {state!.done} of {state!.total}</span>
      ) : (
        <button type="button" onClick={onGrade} className="text-13 font-semibold text-primary hover:underline"
          title="Fund record, dividends and a year of prices for every fund on this board">
          Grade these {board.rows.size} funds against their group
        </button>
      )}
    </div>
  );
}

export function EtfTablesBoard({ initial, onPick, onBoard, onScreener }: {
  initial?: string | null; onPick?: (row: any) => void; onBoard?: (id: string) => void; onScreener?: () => void;
}) {
  const has = useHasKey();
  const [current, setCurrent] = React.useState(() => etfTableCategory(initial));
  const [typed, setTyped] = React.useState('');
  const [query, setQuery] = React.useState('');
  const boards = React.useRef(new Map<string, FundRows>());
  const searched = React.useRef(new Map<string, FundRows>());
  const graded = React.useRef(new Map<string, Graded>());
  const [view, setView] = React.useState<'returns' | 'grades'>('returns');
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const railRef = React.useRef<HTMLDivElement>(null);

  // Long enough that typing a five-letter ticker is one lookup rather than five.
  React.useEffect(() => {
    const t = setTimeout(() => setQuery(typed.trim()), 220);
    return () => clearTimeout(t);
  }, [typed]);

  const grade = async (board: FundRows) => {
    const cat = current;
    const symbols = [...new Set(categorySymbols(cat) as string[])].filter((sym) => board.rows.has(sym));
    graded.current.set(cat.id, { done: 0, total: symbols.length, byGroup: null, facts: null, gated: false });
    bump();
    const { facts, gated } = await loadFundFacts(symbols, board.rows, (done, total) => {
      graded.current.set(cat.id, { done, total, byGroup: null, facts: null, gated: false });
      bump();
    });
    // One peer group per board group: the funds somebody chose as answers to one question.
    const byGroup = new Map<string, Map<string, FundGrades>>();
    for (const g of cat.groups as any[]) {
      const members = (g.funds as [string, string][]).map(([, sym]) => facts.get(sym)).filter((f): f is FundFacts => !!f);
      byGroup.set(g.title, gradeGroup(members));
    }
    graded.current.set(cat.id, { done: symbols.length, total: symbols.length, byGroup, facts, gated });
    setView('grades');
    bump();
  };

  const choose = (id: string) => {
    const next = etfTableCategory(id);
    setCurrent(next);
    if (!graded.current.get(next.id)?.byGroup) setView('returns');
    setTyped(''); setQuery('');
    // The open board goes into the address bar, so a link to one is a link to that one.
    onBoard?.(next.id);
  };

  // Mark the open board and bring it into view on the rail, without scrolling the page.
  React.useEffect(() => {
    const chip = railRef.current?.querySelector<HTMLElement>(`[data-category="${current.id}"]`);
    const track = railRef.current;
    if (!chip || !track) return;
    const box = track.getBoundingClientRect(), c = chip.getBoundingClientRect();
    if (c.left < box.left + 46 || c.right > box.right - 46) chip.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [current.id]);

  const matches = React.useMemo(() => {
    if (!query) return [];
    const needle = query.toLowerCase();
    const rank = (e: any) => (e.symbol.toLowerCase() === needle ? 0 : e.symbol.toLowerCase().startsWith(needle) ? 1 : e.label.toLowerCase().startsWith(needle) ? 2 : 3);
    return ETF_TABLE_INDEX.filter((e: any) => [e.symbol, e.label, e.group, e.category, e.hint || ''].some((s) => String(s).toLowerCase().includes(needle)))
      .sort((a: any, b: any) => rank(a) - rank(b)).slice(0, LIMIT);
  }, [query]);

  // Load the open board, or the search hits, once each per visit.
  React.useEffect(() => {
    if (!has) return;
    let live = true;
    if (query) {
      const key = query.toLowerCase();
      if (!matches.length || searched.current.has(key)) return;
      loadFundRows(matches.map((m: any) => m.symbol))
        .then((r: FundRows) => { searched.current.set(key, r); if (live) bump(); })
        .catch(() => { searched.current.set(key, { rows: new Map(), status: 'error', message: '' }); if (live) bump(); });
    } else if (!boards.current.has(current.id)) {
      loadFundRows(categorySymbols(current))
        .then((r: FundRows) => { boards.current.set(current.id, r); if (live) bump(); })
        .catch((e) => { boards.current.set(current.id, { rows: new Map(), status: 'error', message: String(e?.message || e) }); if (live) bump(); });
    }
    return () => { live = false; };
  }, [has, query, matches, current]);

  const intro = (title: string, blurb: string, note?: string | null) => (
    <div className="mb-3 mt-6">
      <h2 className="text-2xl font-[650] tracking-[-.025em]">{title}</h2>
      <p className="mt-1.5 max-w-[90ch] text-13 leading-relaxed text-muted-foreground">{blurb}</p>
      {note ? <p className="mt-2 max-w-[90ch] rounded-lg border-l-[3px] border-warning bg-warning/8 px-3 py-2 text-tiny leading-relaxed">{note}</p> : null}
    </div>
  );

  const categoryView = () => {
    const board = boards.current.get(current.id);
    if (!has) return <EmptyState status="skipped" message="These boards quote real funds, so they need live data, which is unavailable right now. The catalogue itself is part of the page — the rail above lists every board." />;
    if (!board) return <><p aria-live="polite" className="mb-3 text-tiny text-muted-foreground">Loading {categorySymbols(current).length} funds…</p><EmptyState status="loading" compact /></>;
    const total = categorySymbols(current).length;
    const missing = (categorySymbols(current) as string[]).filter((s) => !board.rows.has(s));
    return (
      <>
        <p aria-live="polite" className="mb-3 flex flex-wrap gap-1.5 text-tiny text-muted-foreground">
          {board.status === 'skipped' ? <span>{board.message}</span> : (
            <>
              <span>{total - missing.length} of {total} funds quoted</span>
              {missing.length ? <span className="text-warning" title={`No quote returned for ${missing.join(', ')}`}>· {missing.length} not returned by the feed</span> : null}
              {board.status !== 'ok' ? <span className="text-warning">· {board.message || 'partial data'}</span> : null}
            </>
          )}
        </p>
        {board.rows.size ? <GradeBar board={board} state={graded.current.get(current.id) || null} view={view} setView={setView} onGrade={() => grade(board)} /> : null}
        {board.status !== 'ok' && !board.rows.size
          ? <EmptyState status={board.status} message={board.message || 'These funds could not be quoted.'} />
          : current.groups.map((g: any) => {
            const gs = graded.current.get(current.id);
            const showGrades = view === 'grades' && !!gs?.byGroup;
            const groupGrades = gs?.byGroup?.get(g.title);
            const peers = groupGrades ? groupGrades.size : 0;
            return (
              <GroupTable key={`${g.title}-${showGrades}`} title={g.title} onPick={onPick} columns={showGrades ? GRADE_COLUMNS : COLUMNS}
                note={showGrades
                  ? `Graded against the ${peers} fund${peers === 1 ? '' : 's'} in this group${peers < MIN_PEERS ? ` — fewer than ${MIN_PEERS}, so nothing here is graded` : ''}. Hover a dash for why.`
                  : g.note}
                entries={g.funds.map(([label, symbol, hint]: [string, string, string?], i: number) => ({
                  label, symbol, sub: hint || null, order: i, row: board.rows.get(symbol) || null,
                  grades: groupGrades?.get(symbol) || null, facts: gs?.facts?.get(symbol) || null,
                }))} />
            );
          })}
      </>
    );
  };

  const searchView = () => {
    if (!matches.length) {
      return (
        <div className="grid justify-items-start gap-3">
          <EmptyState status="ok" compact className="w-full" message="Try a ticker, a holding such as “gold” or “semiconductor”, or a board name." />
          {onScreener ? <button type="button" onClick={onScreener} className="text-13 font-semibold text-primary hover:underline">Open the ETF screener →</button> : null}
        </div>
      );
    }
    const board = searched.current.get(query.toLowerCase());
    if (!board) return <><p className="mb-3 text-tiny text-muted-foreground">Quoting matches…</p><EmptyState status="loading" compact /></>;
    const boardsHit = new Set(matches.map((m: any) => m.categoryId)).size;
    return (
      <>
        <p aria-live="polite" className="mb-3 text-tiny text-muted-foreground">
          {matches.length}{matches.length === LIMIT ? '+' : ''} match{matches.length === 1 ? '' : 'es'} across {boardsHit} board{boardsHit === 1 ? '' : 's'}
        </p>
        {ETF_TABLE_CATEGORIES.map((c: any) => {
          const hits = matches.filter((m: any) => m.categoryId === c.id);
          if (!hits.length) return null;
          return (
            <GroupTable key={c.id} title={c.title} onTitle={() => choose(c.id)} onPick={onPick}
              entries={hits.map((e: any, i: number) => ({ label: e.label, symbol: e.symbol, order: i,
                sub: e.hint ? `${e.group} · ${e.hint}` : e.group, row: board.rows.get(e.symbol) || null }))} />
          );
        })}
      </>
    );
  };

  const onRailKey = (e: React.KeyboardEvent) => {
    const at = ETF_TABLE_CATEGORIES.findIndex((c: any) => c.id === current.id);
    const n = ETF_TABLE_CATEGORIES.length;
    const next = e.key === 'ArrowRight' ? (at + 1) % n : e.key === 'ArrowLeft' ? (at - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    choose(ETF_TABLE_CATEGORIES[next].id);
    railRef.current?.querySelector<HTMLElement>(`[data-category="${ETF_TABLE_CATEGORIES[next].id}"]`)?.focus();
  };

  return (
    <div className="pt-8">
      <div className="mb-4 grid gap-1.5">
        <label htmlFor="etf-table-search" className="text-13 font-semibold">Find a fund</label>
        <div className="flex max-w-[560px] gap-2">
          <input id="etf-table-search" type="search" value={typed} autoComplete="off" spellCheck={false}
            placeholder={`Search ${CATALOGUE_SIZE} funds — symbol, name or theme`} aria-describedby="etf-table-search-help"
            onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setTyped(''); setQuery(''); } }}
            className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-13" />
          {typed ? <button type="button" onClick={() => { setTyped(''); setQuery(''); }} className="rounded-md border border-border px-3 text-13 hover:bg-accent">Clear</button> : null}
        </div>
        <p id="etf-table-search-help" className="text-tiny text-muted-foreground">Searches every board at once. Results say which board each fund is filed on.</p>
      </div>
      <p className="mb-4 max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">
        <b className="text-foreground">US-listed funds, unless a row says otherwise.</b> A board is a named list rather than a screen of one market, so these read the same whichever country this page is scoped to — country is what the Overview tab and the screener’s own picker change, not this tab. Shariah is the one board that leaves the United States, because most of the world’s Shariah funds are listed elsewhere; every row on it that does carries its exchange and its currency.
      </p>
      <div ref={railRef} role="tablist" aria-label="ETF boards" onKeyDown={onRailKey}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 scroll-none">
        {ETF_TABLE_CATEGORIES.map((c: any) => {
          const on = c.id === current.id && !query;
          return (
            <button key={c.id} type="button" role="tab" data-category={c.id} aria-selected={on} tabIndex={c.id === current.id ? 0 : -1}
              title={c.blurb} onClick={() => choose(c.id)}
              className={cn('flex-none whitespace-nowrap rounded-full border border-border px-3.5 py-1.5 text-13 font-medium hover:bg-accent',
                on && 'border-foreground bg-foreground text-background hover:bg-foreground')}>
              {c.short || c.title}
            </button>
          );
        })}
      </div>
      {query ? intro(`Search: ${query}`, matches.length
        ? 'Every board searched. Each result says where it is filed — open that board for the funds beside it.'
        : 'No fund in the catalogue matches that. The ETF screener searches all five thousand listings rather than these seventeen boards.')
        : intro(current.title, current.blurb, current.note)}
      <div role="tabpanel" id="etf-table-panel">{query ? searchView() : categoryView()}</div>
    </div>
  );
}
