'use client';

/* The report head's own actions: watch it, write a note on it, compare it.
   One component for both heads (the Overview's and every other tab's), so
   the three never drift apart. Compare seeds the comparison with the
   vendor's first three peers — a starting set the page lets the reader edit. */

import { Columns3 } from 'lucide-react';
import type { Analysis } from '@/lib/model';
import { WatchButton } from '@/components/watch-button';
import { NotesButton } from '@/components/notes-button';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

export function ReportActions({ a, className }: { a: Analysis; className?: string }) {
  const nav = useNav();
  const f = a.facts;
  const peers = ((a.peers?.peers || []) as any[]).map((p) => p?.symbol).filter((s): s is string => !!s && s !== f.symbol).slice(0, 3);
  return (
    <div className={cn('flex flex-wrap items-center gap-2 no-print', className)}>
      <WatchButton symbol={f.symbol} />
      <NotesButton symbol={f.symbol} name={f.name} />
      <button type="button" onClick={() => nav.goView('stocks', 'compare', { symbols: [f.symbol, ...peers].join(',') })}
        title={`Compare ${f.symbol} side by side${peers.length ? ` with ${peers.join(', ')}` : ''}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-tiny font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">
        <Columns3 className="size-[15px]" strokeWidth={1.8} />Compare
      </button>
    </div>
  );
}
