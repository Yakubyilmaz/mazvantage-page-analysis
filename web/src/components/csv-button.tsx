'use client';

/* ==========================================================================
   Export as CSV

   Two ways a table leaves the page:
   - `CsvButton` builds the file from data — the dense tables, where the rows
     behind a paged view are all there and each cell has a raw number;
   - `TableCsv` wraps any drawn table and exports what it shows — the
     report's tables, whose cells are formatted for reading and have nothing
     else behind them.

   Both run in the browser: no request, nothing leaves it, and the file is
   named after the table and the day.
   ========================================================================== */

import * as React from 'react';
import { Download } from 'lucide-react';
import { csvFilename, downloadCsv, headingFor, tableToRows, type CsvCell } from '@/lib/csv';
import { cn } from '@/lib/cn';

const base = 'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-micro font-semibold text-muted-foreground hover:bg-accent hover:text-foreground no-print';

/** The company a report page is about, for filenames. */
function reportSymbol(): string | null {
  const m = /^\/stock\/([^/]+)/.exec(typeof window === 'undefined' ? '' : window.location.pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

export function CsvButton({ name, build, className, label = 'CSV', title }: {
  name: string;
  build: () => { headers: string[]; rows: CsvCell[][] };
  className?: string;
  label?: string;
  title?: string;
}) {
  return (
    <button type="button" className={cn(base, className)} title={title || 'Download this table as a CSV file'}
      onClick={() => { const { headers, rows } = build(); downloadCsv(csvFilename(name), headers, rows); }}>
      <Download className="size-3.5" />{label}
    </button>
  );
}

/**
 * A drawn table with an export button over its top-right corner. The name
 * comes from `name`, else the nearest heading above it, and a report's
 * symbol leads it.
 */
export function TableCsv({ name, children, className }: { name?: string; children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const run = () => {
    const table = ref.current?.querySelector('table');
    if (!table) return;
    const { headers, rows } = tableToRows(table);
    downloadCsv(csvFilename(reportSymbol(), name || headingFor(table) || 'table'), headers, rows);
  };
  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className="flex justify-end">
        <button type="button" onClick={run} className={base} title="Download this table as a CSV file, as it is shown">
          <Download className="size-3.5" />CSV
        </button>
      </div>
      {children}
    </div>
  );
}
