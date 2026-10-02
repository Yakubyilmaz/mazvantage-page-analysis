'use client';

/* ==========================================================================
   The board's dense table (`.mi-table`)

   Given rows and columns: every column sorts, the identity column sticks to
   the left, and the whole thing scrolls sideways inside its own scroller
   rather than widening the page. The sector breakdown, the group pages and
   the Market Data boards all draw their tables through this one.

   A missing value sorts last in either direction — a column of n/a at the
   top of a "highest first" sort answers nothing.
   ========================================================================== */

import * as React from 'react';
import { isNum } from '@/lib/format';
import { TableCsv } from '@/components/csv-button';
import { cn } from '@/lib/cn';

export interface DenseColumn<R> {
  key: string;
  label: React.ReactNode;
  /** The first, sticky column; sorts A→Z on its first click. */
  identity?: boolean;
  numeric?: boolean;
  /** What the column sorts by, when it is not `row[key]`. */
  value?: (row: R) => unknown;
  render?: (row: R) => React.ReactNode;
  title?: string;
}

export interface Sort { key: string; dir: 1 | -1 }

const sortable = (v: unknown) => isNum(v) || (typeof v === 'string' && v !== '');

export function DenseTable<R>({ columns, rows, initialSort, rowKey, className, exportName }: {
  columns: DenseColumn<R>[];
  rows: R[];
  initialSort?: Sort | null;
  rowKey?: (row: R, i: number) => string;
  className?: string;
  /** The CSV file's name (else the heading above); `null` hides the export. */
  exportName?: string | null;
}) {
  const table = <DenseTableBody columns={columns} rows={rows} initialSort={initialSort} rowKey={rowKey} className={className} />;
  return exportName === null || rows.length < 2 ? table : <TableCsv name={exportName}>{table}</TableCsv>;
}

function DenseTableBody<R>({ columns, rows, initialSort, rowKey, className }: {
  columns: DenseColumn<R>[];
  rows: R[];
  initialSort?: Sort | null;
  rowKey?: (row: R, i: number) => string;
  className?: string;
}) {
  // `null` keeps the rows in the order given until a header is clicked — a
  // table whose rows are a fixed comparison should not open alphabetised.
  const [sort, setSort] = React.useState<Sort | null>(initialSort === undefined ? { key: columns[0].key, dir: 1 } : initialSort);
  const column = sort ? columns.find((c) => c.key === sort.key) || columns[0] : null;
  const valueOf = (row: R, c: DenseColumn<R>) => (c.value ? c.value(row) : (row as any)[c.key]);

  const ordered = React.useMemo(() => (!sort || !column ? rows : [...rows].sort((a, b) => {
    const av = valueOf(a, column), bv = valueOf(b, column);
    if (!sortable(av)) return sortable(bv) ? 1 : 0;
    if (!sortable(bv)) return -1;
    return (typeof av === 'string' ? av.localeCompare(String(bv)) : (av as number) - (bv as number)) * sort.dir;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [rows, sort, column]);

  const pick = (c: DenseColumn<R>) => setSort((s) => (s?.key === c.key
    ? { key: c.key, dir: (s.dir * -1) as 1 | -1 }
    : { key: c.key, dir: c.identity ? 1 : -1 }));

  return (
    <div className={cn('min-w-0 overflow-x-auto rounded-xl border border-border scroll-thin', className)}>
      <table className="w-max min-w-full border-collapse tnum">
        <thead>
          <tr>
            {columns.map((c, i) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" title={c.title}
                  aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  className={cn('sticky top-0 z-[2] whitespace-nowrap border-b border-border bg-background px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground max-sm:px-3 max-sm:py-2.5',
                    c.numeric && 'text-right', active && 'text-foreground', i === 0 && 'left-0 z-[3]')}>
                  <button type="button" onClick={() => pick(c)}
                    className={cn('inline-flex items-center gap-1 uppercase hover:text-foreground', c.numeric && 'flex-row-reverse')}>
                    {c.label}
                    {active ? <span aria-hidden="true" className="text-[10px]">{sort!.dir === 1 ? '↑' : '↓'}</span> : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row, r) => (
            <tr key={rowKey ? rowKey(row, r) : r} className="group">
              {columns.map((c, i) => (
                <td key={c.key}
                  className={cn('whitespace-nowrap border-b border-border px-4 py-3 text-13 group-last:border-b-0 group-hover:bg-muted max-sm:px-3 max-sm:py-2.5',
                    c.numeric && 'text-right', i === 0 && 'sticky left-0 z-[1] bg-background')}>
                  {c.render ? c.render(row) : <Plain value={(row as any)[c.key]} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Plain = ({ value }: { value: unknown }) => (value == null || value === ''
  ? <span className="text-muted-foreground">n/a</span>
  : <span>{String(value)}</span>);

/** A quiet placeholder for a figure the feed did not carry. */
export const NA = ({ text = 'n/a' }: { text?: string }) => <span className="text-muted-foreground">{text}</span>;

/** A ticker or name that opens something: the canvas's blue text button. */
export function TickerButton({ children, onClick, title, className }: {
  children: React.ReactNode; onClick: () => void; title?: string; className?: string;
}) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={cn('text-left text-13 font-semibold text-primary hover:underline', className)}>
      {children}
    </button>
  );
}
