'use client';

/* ==========================================================================
   Maz Vantage — the dense market table

   Column-set tabs over the same rows, a sticky identity column, every column
   sortable, tabular numerals right-aligned with colour only on change. A tab
   that needs per-company data loads for the rows on screen, when the reader
   asks, after saying what it will cost — the consent rule the screens and the
   sector page already follow.

   State (tab, sort, page) is the caller's when it passes `state` and
   `onStateChange`, so a filter above the table can rebuild the rows without
   throwing away which tab and which sort the reader had chosen; otherwise the
   table keeps its own. None of it is in the URL, deliberately.
   ========================================================================== */

import * as React from 'react';
import { num } from '@/lib/format';
import { hasApiKey } from '@/lib/fmp';
import { PAGE, STOCK_COLUMN_SETS, exportColumns, fillBags, newTableState, sortRows, type Cell, type ColumnSet, type TableState } from '@/lib/market-table';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/report/ui';
import { CsvButton } from '@/components/csv-button';
import { WatchStar } from '@/components/watch-button';
import { cn } from '@/lib/cn';

export type { ColumnSet, TableState } from '@/lib/market-table';

function CellText({ cell }: { cell: Cell }) {
  if (typeof cell === 'string') return <>{cell}</>;
  return <span className={cn(cell.tone === 'na' && 'text-muted-foreground/70', cell.tone === 'pos' && 'text-up', cell.tone === 'neg' && 'text-down')}>{cell.text}</span>;
}

export function MarketTable({
  rows,
  sets = STOCK_COLUMN_SETS,
  identity,
  perPage = PAGE,
  emptyText = 'Nothing matches that.',
  costNote = null,
  state: controlled,
  onStateChange,
  showTabs = true,
  onFill,
  exportName = 'table',
  watch = true,
}: {
  rows: any[];
  sets?: ColumnSet[];
  /** The sticky first cell: a caller decides whether a symbol is a link or plain text. */
  identity: (row: any) => React.ReactNode;
  perPage?: number;
  emptyText?: string;
  costNote?: string | null;
  state?: TableState;
  onStateChange?: (s: TableState) => void;
  showTabs?: boolean;
  /** Called after a bought tab loads — for a caller with something computed from the same bags. */
  onFill?: () => void;
  /** What the CSV file is called; `null` hides the export. */
  exportName?: string | null;
  /** A star on each row that adds it to the active watchlist. */
  watch?: boolean;
}) {
  const [own, setOwn] = React.useState<TableState>(() => newTableState(sets));
  const state = controlled ?? own;
  const setState = (next: TableState) => (onStateChange ? onStateChange(next) : setOwn(next));
  // `fillBags` mutates the rows; this is what makes the table notice.
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  const [filling, setFilling] = React.useState<string | null>(null);

  const set = sets.find((s) => s.key === state.set) || sets[0];
  const col = set.columns.find((c) => c.key === state.sort) || set.columns[0];
  const sorted = sortRows(rows, col, state.dir);
  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const page = Math.min(Math.max(1, state.page), pages);
  const slice = sorted.slice((page - 1) * perPage, page * perPage);
  const missing = set.bags.length ? slice.filter((r) => set.bags.some((b) => !r.bags?.[b])) : [];

  const pickSet = (s: ColumnSet) => {
    if (s.key === set.key) return;
    // A bought tab keeps whatever sort still makes sense; a column that no
    // longer exists falls back to the first one in the new set.
    const keeps = s.columns.some((c) => c.key === state.sort);
    setState({ ...state, set: s.key, page: 1, sort: keeps ? state.sort : s.columns[0].key, dir: keeps ? state.dir : -1 });
  };
  const sortBy = (key: string) => setState(state.sort === key ? { ...state, dir: state.dir === 1 ? -1 : 1 } : { ...state, sort: key, dir: -1 });

  const fill = async () => {
    if (filling !== null) return;
    setFilling('');
    await fillBags(missing, set.bags, (done, total) => setFilling(` ${done} of ${total}…`));
    setFilling(null);
    bump();
    onFill?.();
  };

  /* Every row in the table's order, not just this page, with the columns of
     the tab on screen. Rows a bought tab has not filled go out blank. */
  const exportButton = exportName && sorted.length ? (
    <CsvButton name={`${exportName} ${set.label}`}
      title={`Download all ${sorted.length} rows with the ${set.label} columns, in the order shown. Values not loaded yet are left blank.`}
      build={() => exportColumns(set.columns, sorted)} />
  ) : null;

  return (
    <div className="min-w-0">
      {showTabs ? (
        <div className="mb-3 flex items-end gap-2 border-b border-border">
          <div role="tablist" aria-label="Column sets" className="flex min-w-0 flex-1 gap-1 overflow-x-auto scroll-none">
            {sets.map((s) => {
              const on = s.key === set.key;
              const free = !s.bags.length;
              return (
                <button key={s.key} type="button" role="tab" aria-selected={on} onClick={() => pickSet(s)}
                  title={free ? 'Already loaded with the company list' : 'Loads for the page you are on, when you ask'}
                  className={cn('-mb-px inline-flex items-center gap-1 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-13 font-medium text-muted-foreground hover:text-foreground',
                    on && 'border-foreground text-foreground')}>
                  {s.label}
                  {free ? null : <i className="not-italic text-muted-foreground/70" title="Loads when opened">·</i>}
                </button>
              );
            })}
          </div>
          {exportButton ? <div className="flex-none pb-1">{exportButton}</div> : null}
        </div>
      ) : exportButton ? <div className="mb-2 flex justify-end">{exportButton}</div> : null}

      {/* The consent bar: nothing fetches until this is clicked, and the
          arithmetic is stated before a metered key spends it. */}
      {missing.length ? (
        !hasApiKey() ? (
          <Notice className="mb-3">
            <b>{set.label}</b> needs live data for each company, which is unavailable right now. The Overview tab still works.
          </Notice>
        ) : (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-muted px-4 py-3">
            <div>
              <p className="text-13 font-semibold">{set.label} is not loaded for this page yet.</p>
              <p className="mt-0.5 max-w-[80ch] text-tiny text-muted-foreground">
                This tab loads for the {missing.length} rows on this page. Rows already loaded are reused, and paging back here later is instant.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={filling !== null} onClick={fill}>
                {filling !== null ? 'Loading…' : `Load ${set.label.toLowerCase()} for these ${missing.length}`}
              </Button>
              {filling ? <span className="text-tiny text-muted-foreground">{filling}</span> : null}
            </div>
          </div>
        )
      ) : null}

      {slice.length ? (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full border-collapse text-13 tnum">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="sticky left-0 z-[1] bg-background py-2 pr-4 text-left text-micro font-medium uppercase tracking-[.05em] text-muted-foreground">Symbol</th>
                {set.columns.map((c) => {
                  const on = state.sort === c.key;
                  return (
                    <th key={c.key} scope="col" aria-sort={on ? (state.dir === 1 ? 'ascending' : 'descending') : 'none'}
                      className={cn('whitespace-nowrap px-3 py-2 text-micro font-medium uppercase tracking-[.05em] text-muted-foreground', c.num ? 'text-right' : 'text-left')}>
                      <button type="button" title={`Sort by ${c.label}`} onClick={() => sortBy(c.key)}
                        className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground', on && 'text-foreground')}>
                        {c.label}
                        <i aria-hidden="true" className="w-2 text-[9px] not-italic">{on ? (state.dir === 1 ? '▲' : '▼') : ''}</i>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slice.map((r, i) => (
                <tr key={r.symbol || i} className="group border-b border-border last:border-b-0 hover:bg-accent/60">
                  <td className="sticky left-0 z-[1] bg-background py-2 pr-4 group-hover:bg-accent">
                    {watch && r.symbol ? (
                      <div className="flex items-center gap-1"><WatchStar symbol={r.symbol} className="-ml-1" />{identity(r)}</div>
                    ) : identity(r)}
                  </td>
                  {set.columns.map((c) => (
                    <td key={c.key} className={cn('whitespace-nowrap px-3 py-2', c.num ? 'text-right' : 'max-w-[220px] truncate text-left')}>
                      {c.render ? (c.render(c.get(r), r) as React.ReactNode) : <CellText cell={c.fmt(c.get(r))} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>}

      {pages > 1 ? (
        <nav aria-label="Table pages" className="mt-4 flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setState({ ...state, page: page - 1 })}>← Previous</Button>
          <span className="text-tiny text-muted-foreground tnum">
            {num((page - 1) * perPage + 1, 0)}–{num(Math.min(page * perPage, sorted.length), 0)} of {num(sorted.length, 0)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setState({ ...state, page: page + 1 })}>Next →</Button>
        </nav>
      ) : null}
      {costNote ? <p className="mt-2 text-tiny text-muted-foreground/80">{costNote}</p> : null}
    </div>
  );
}
