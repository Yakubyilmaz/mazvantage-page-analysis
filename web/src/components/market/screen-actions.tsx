'use client';

/* ==========================================================================
   The screener's own shelf: save a screen, reopen it, and send what it
   found to a watchlist

   - A **saved screen** is every setting the table filters on — the preset,
     the country, the free filters (ranges, sector, industry, exchange,
     search) and the company filters — stored in this browser under
     `mazvantage.screens.saved`. Reopening one travels as `?saved=<id>`, so
     it lands on the right screener even across stocks and funds. The
     figures behind company filters are not stored: they are measured again
     on the reopened screen, because a price-sensitive figure from last week
     is not today's.
   - **Add to a list** puts the matching symbols, in the order shown, into a
     watchlist — the first hundred, because a watchlist is priced fifty
     symbols per request and a list of thousands is a screener, not a list.
   ========================================================================== */

import * as React from 'react';
import { Bookmark, ListPlus, Trash2 } from 'lucide-react';
import type { ScreenFilter } from '@/lib/screener-filters';
import { newId, readJson, useStoredJson, writeJson } from '@/lib/local-store';
import { activeList, addSymbols, createList, useWatchlists } from '@/lib/watchlists';
import { Button } from '@/components/ui/button';
import { Input, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';

export const SAVED_SCREENS_KEY = 'mazvantage.screens.saved';
const MAX_TO_LIST = 100;

export type Range = [number | null, number | null] | null;

export interface SavedScreen {
  id: string;
  name: string;
  kind: 'stocks' | 'etfs';
  country: string;
  collection: string;
  collectionTitle?: string;
  filters: ScreenFilter[];
  ranges: Record<string, Range>;
  sector: string;
  industry: string;
  exchange: string;
  search: string;
  savedAt: string;
}

/** Every saved screen, oldest first, dropping anything that is not one. */
function parseScreens(raw: unknown): SavedScreen[] {
  return (Array.isArray(raw) ? raw : []).filter((s: any) => s && typeof s.id === 'string' && typeof s.name === 'string'
    && (s.kind === 'stocks' || s.kind === 'etfs') && typeof s.collection === 'string') as SavedScreen[];
}

export const readSavedScreens = () => parseScreens(readJson<unknown>(SAVED_SCREENS_KEY, []));
export const useSavedScreens = () => {
  const raw = useStoredJson<unknown>(SAVED_SCREENS_KEY, []);
  return React.useMemo(() => parseScreens(raw), [raw]);
};

/** A saved screen by id, for a screener opening with `?saved=`. */
export const savedScreen = (id: string | null | undefined) => (id ? readSavedScreens().find((s) => s.id === id) || null : null);

/** What a saved screen filters on, in a line. */
export function describeScreen(s: SavedScreen): string {
  const parts = [s.kind === 'etfs' ? 'ETFs' : 'Stocks', s.collectionTitle || s.collection, s.country === 'WORLD' ? 'World' : s.country];
  const free = Object.values(s.ranges || {}).filter(Boolean).length + [s.sector, s.industry, s.exchange, s.search].filter(Boolean).length;
  if (s.filters?.length) parts.push(`${s.filters.length} company ${s.filters.length === 1 ? 'filter' : 'filters'}`);
  if (free) parts.push(`${free} list ${free === 1 ? 'filter' : 'filters'}`);
  return parts.join(' · ');
}

/** Open a saved screen on whichever screener it belongs to. */
export function useOpenSaved() {
  const nav = useNav();
  return (s: SavedScreen) => nav.goView(s.kind === 'etfs' ? 'etfs' : 'stocks', 'screener', {
    country: s.country, kind: s.kind, collection: s.collection, saved: s.id,
  });
}

/* ---------- save ------------------------------------------------------------------------------ */

export function SaveScreenButton({ current }: { current: () => Omit<SavedScreen, 'id' | 'name' | 'savedAt'> }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [saved, setSaved] = React.useState<string | null>(null);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const screen = current();
    const label = name.trim() || `${screen.collectionTitle || screen.collection} screen`;
    const all = readSavedScreens().filter((s) => s.name !== label);
    writeJson(SAVED_SCREENS_KEY, [...all, { ...screen, id: newId('scr'), name: label, savedAt: new Date().toISOString() }]);
    setSaved(label);
    setName('');
  };
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSaved(null); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9"><Bookmark className="size-3.5" />Save screen</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        {saved ? (
          <p role="status" className="text-13">Saved as <b>{saved}</b>. It is listed under Saved screens here and on Investment Ideas.</p>
        ) : (
          <form onSubmit={save} className="grid gap-2">
            <label className="grid gap-1 text-tiny font-semibold">Name this screen
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} placeholder="e.g. Cheap profitable small caps" className="h-8" />
            </label>
            <p className="text-micro text-muted-foreground">Keeps the preset, country and every filter. The company figures are measured again when you reopen it.</p>
            <Button type="submit" size="sm" variant="default">Save</Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- reopen ----------------------------------------------------------------------------- */

export function SavedScreensMenu({ kind }: { kind: 'stocks' | 'etfs' }) {
  const screens = useSavedScreens();
  const open = useOpenSaved();
  const [openMenu, setOpenMenu] = React.useState(false);
  if (!screens.length) return null;
  return (
    <Popover open={openMenu} onOpenChange={setOpenMenu}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9">Saved screens<span className="rounded-full bg-accent px-1.5 text-[10px] tnum">{screens.length}</span></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <ul className="grid">
          {[...screens].sort((a, b) => (a.kind === kind ? 0 : 1) - (b.kind === kind ? 0 : 1) || b.savedAt.localeCompare(a.savedAt)).map((s) => (
            <li key={s.id} className="flex items-start gap-1">
              <button type="button" onClick={() => { setOpenMenu(false); open(s); }} className="grid min-w-0 flex-1 gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                <span className="truncate text-13 font-semibold">{s.name}</span>
                <span className="truncate text-micro text-muted-foreground">{describeScreen(s)}</span>
              </button>
              <button type="button" aria-label={`Delete the saved screen ${s.name}`}
                onClick={() => writeJson(SAVED_SCREENS_KEY, readSavedScreens().filter((x) => x.id !== s.id))}
                className="mt-1 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-down"><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- send to a list ------------------------------------------------------------------------ */

export function AddToListButton({ symbols, noun = 'companies' }: { symbols: string[]; noun?: string }) {
  const store = useWatchlists();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [done, setDone] = React.useState<string | null>(null);
  const take = symbols.slice(0, MAX_TO_LIST);
  const current = activeList(store);
  if (!symbols.length) return null;
  const toList = (id: string, listName: string) => { addSymbols(take, id); setDone(`${take.length} added to ${listName}.`); };
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setDone(null); }}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-micro font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">
          <ListPlus className="size-3.5" />Add to a list
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        {done ? <p role="status" className="text-13">{done}</p> : (
          <div className="grid gap-2">
            <p className="text-13">
              {symbols.length > MAX_TO_LIST
                ? <>The first <b>{MAX_TO_LIST}</b> of {symbols.length.toLocaleString()} {noun}, in the order shown.</>
                : <>All <b>{symbols.length}</b> {noun} shown.</>}
            </p>
            {store.lists.length ? (
              <ul className="grid">
                {store.lists.map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => toList(l.id, l.name)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-13 hover:bg-accent">
                      <span>{l.name}{l.id === current?.id ? <span className="ml-1.5 text-micro text-muted-foreground">in the rail</span> : null}</span>
                      <span className="text-micro text-muted-foreground tnum">{l.symbols.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <form onSubmit={(e) => { e.preventDefault(); const n = name.trim() || 'Screen results'; createList(n, take); setDone(`${take.length} added to a new list, “${n}”, now the one the rail shows.`); }}
              className="flex gap-2 border-t border-border pt-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Or a new list" aria-label="New list name" className="h-8" maxLength={60} />
              <Button type="submit" size="sm" variant="default">Create</Button>
            </form>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
