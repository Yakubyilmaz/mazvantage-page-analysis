'use client';

/* ==========================================================================
   Add to watchlist — the star on every quote

   Two forms of one control over the shared store (`lib/watchlists.ts`):
   - `WatchStar`, a bare star for a table row, toggles the symbol in the
     **active** list — the one the market rail shows — so a click in a
     screener lands where the reader will see it;
   - `WatchButton`, for the report head, does the same and opens a picker
     for every list, with a way to start a new one.

   Neither fetches anything: a list is symbols, and the rail and the
   Watchlist page price whatever is in it.
   ========================================================================== */

import * as React from 'react';
import { Check, ChevronDown, Plus, Star } from 'lucide-react';
import {
  activeList, addSymbols, cleanSymbol, createList, removeSymbol, setActiveList, toggleSymbol, useWatchlists,
} from '@/lib/watchlists';
import { Input, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

/** The star for a table row. Clicking it does not open the row. */
export function WatchStar({ symbol, className }: { symbol: string; className?: string }) {
  const store = useWatchlists();
  const sym = cleanSymbol(symbol);
  const list = activeList(store);
  const on = !!list?.symbols.includes(sym);
  const listName = list?.name || 'a new watchlist';
  return (
    <button
      type="button"
      data-csv-skip=""
      aria-pressed={on}
      aria-label={on ? `Remove ${sym} from ${listName}` : `Add ${sym} to ${listName}`}
      title={on ? `In ${listName} — click to remove` : `Add to ${listName}`}
      onClick={(e) => { e.stopPropagation(); toggleSymbol(sym); }}
      className={cn('inline-grid size-6 flex-none place-items-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-warning',
        on && 'text-warning', !store.ready && 'invisible', className)}
    >
      <Star className="size-[15px]" strokeWidth={1.8} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

/** The report head's control: toggle in the active list, and a picker for all of them. */
export function WatchButton({ symbol, className }: { symbol: string; className?: string }) {
  const nav = useNav();
  const store = useWatchlists();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const sym = cleanSymbol(symbol);
  const list = activeList(store);
  const on = !!list?.symbols.includes(sym);
  const holding = store.lists.filter((l) => l.symbols.includes(sym));

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    createList(name.trim() || `Watchlist ${store.lists.length + 1}`, [sym]);
    setName('');
  };

  return (
    <div className={cn('inline-flex items-stretch no-print', !store.ready && 'invisible', className)}>
      <button
        type="button"
        aria-pressed={on}
        onClick={() => toggleSymbol(sym)}
        title={on ? `In ${list?.name} — click to remove` : `Add ${sym} to ${list?.name || 'a new watchlist'}`}
        className={cn('inline-flex h-8 items-center gap-1.5 rounded-l-full border border-border px-3 text-tiny font-semibold hover:bg-accent',
          on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
      >
        <Star className={cn('size-[15px]', on && 'text-warning')} strokeWidth={1.8} fill={on ? 'currentColor' : 'none'} />
        {on ? 'Watching' : 'Watch'}
        {holding.length > 1 ? <span className="rounded-full bg-accent px-1.5 text-[10px] tnum">{holding.length}</span> : null}
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`Choose which watchlists hold ${sym}`}
            className="inline-flex h-8 items-center rounded-r-full border border-l-0 border-border px-2 text-muted-foreground hover:bg-accent hover:text-foreground">
            <ChevronDown className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <p className="mb-2 text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">{sym} in your lists</p>
          {store.lists.length ? (
            <ul className="grid gap-0.5">
              {store.lists.map((l) => {
                const inIt = l.symbols.includes(sym);
                return (
                  <li key={l.id} className="flex items-center gap-1">
                    <button type="button" role="checkbox" aria-checked={inIt}
                      onClick={() => (inIt ? removeSymbol(sym, l.id) : addSymbols([sym], l.id))}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-13 hover:bg-accent">
                      <span aria-hidden="true" className={cn('grid size-4 flex-none place-items-center rounded border border-border', inIt && 'border-primary bg-primary text-white')}>
                        {inIt ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="truncate">{l.name}</span>
                      <span className="ml-auto text-micro text-muted-foreground tnum">{l.symbols.length}</span>
                    </button>
                    {l.id === store.active ? (
                      <span title="The rail shows this list" className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Rail</span>
                    ) : (
                      <button type="button" onClick={() => setActiveList(l.id)} title="Show this list in the market rail"
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">Show</button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-13 text-muted-foreground">No lists yet.</p>}
          <form onSubmit={create} className="mt-3 flex gap-2 border-t border-border pt-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name" aria-label="New list name" className="h-8" maxLength={60} />
            <button type="submit" className="inline-flex h-8 flex-none items-center gap-1 rounded-md bg-primary px-2.5 text-tiny font-semibold text-white hover:brightness-110">
              <Plus className="size-3.5" />Create
            </button>
          </form>
          <button type="button" onClick={() => { setOpen(false); nav.goView('watchlist'); }}
            className="mt-2 text-tiny font-semibold text-primary hover:underline">Open your watchlists ›</button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
