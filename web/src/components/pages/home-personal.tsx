'use client';

/* ==========================================================================
   Maz Vantage — Home's personal blocks, and the dialog that arranges Home

   Three blocks read the reader's own data in this browser — the active
   watchlist, the latest private notes, the saved screens — so they work
   without a key; only the watchlist's quotes need one. A personal block with
   nothing in it renders nothing, rather than a box asking to be filled.
   ========================================================================== */

import * as React from 'react';
import { ArrowDown, ArrowUp, SlidersHorizontal } from 'lucide-react';
import { fetchBatchQuotes } from '@/lib/fmp';
import { ago, isNum, price } from '@/lib/format';
import { HOME_BLOCKS, isDefaultLayout, moveBlock, saveLayout, toggleBlock, useHomeLayout, DEFAULT_LAYOUT, type LayoutEntry } from '@/lib/home-layout';
import { useAllNotes } from '@/lib/notes';
import { activeList, useWatchlists } from '@/lib/watchlists';
import { describeScreen, useOpenSaved, useSavedScreens } from '@/components/market/screen-actions';
import { MarketHeading, Signed } from '@/components/market/market-ui';
import { useNav } from '@/components/nav-context';
import { useHasKey } from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const Block = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section aria-label={label} className="mt-12 first:mt-8">{children}</section>
);

export function WatchlistBlock() {
  const nav = useNav();
  const has = useHasKey();
  const store = useWatchlists();
  const list = store.ready ? activeList(store) : null;
  const symbols = React.useMemo(() => (list?.symbols || []).slice(0, 12), [list]);
  const [quotes, setQuotes] = React.useState<Map<string, any> | null>(null);
  React.useEffect(() => {
    if (!has || !symbols.length) return;
    let live = true;
    fetchBatchQuotes(symbols).then((r) => {
      if (live && r.status === 'ok') setQuotes(new Map((r.data || []).map((q: any) => [String(q.symbol).toUpperCase(), q])));
    });
    return () => { live = false; };
  }, [has, symbols]);
  if (!list) return null;
  return (
    <Block label="Your watchlist">
      <MarketHeading level="h2" title={list.name || 'Your watchlist'} onClick={() => nav.goView('watchlist', 'lists')} />
      {symbols.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
          {symbols.map((s) => {
            const q = quotes?.get(s);
            return (
              <button key={s} type="button" onClick={() => nav.goSymbol(s)}
                className={cn('grid gap-0.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted',
                  isNum(q?.changePercentage) && (q.changePercentage < 0 ? 'border-l-[3px] border-l-down' : 'border-l-[3px] border-l-up'))}>
                <span className="flex items-baseline justify-between gap-2"><b className="text-13">{s}</b>{q ? <Signed value={q.changePercentage} /> : null}</span>
                <span className="truncate text-tiny text-muted-foreground">{q ? `${price(q.price)} · ${q.name || ''}` : has ? 'Quoting…' : 'Quotes unavailable'}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="text-13 text-muted-foreground">This list is empty. Add a company with the star on any table or report.</p>}
      {(list.symbols.length > symbols.length) ? <p className="mt-2 text-tiny text-muted-foreground">{list.symbols.length - symbols.length} more on the list.</p> : null}
    </Block>
  );
}

export function NotesBlock() {
  const nav = useNav();
  const all = useAllNotes();
  const recent = React.useMemo(() => Object.entries(all)
    .flatMap(([symbol, notes]) => notes.map((n) => ({ symbol, ...n })))
    .sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5), [all]);
  if (!recent.length) return null;
  return (
    <Block label="Your recent notes">
      <MarketHeading level="h2" title="Your recent notes" />
      <div className="rounded-xl border border-border">
        {recent.map((n) => (
          <button key={n.id} type="button" onClick={() => nav.goSymbol(n.symbol)}
            className="grid w-full gap-1 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted">
            <span className="flex items-baseline gap-2 text-tiny"><b className="text-13">{n.symbol}</b><span className="text-muted-foreground">{ago(n.updated)}</span></span>
            <span className="line-clamp-2 text-13 leading-relaxed text-muted-foreground">{n.text}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-tiny text-muted-foreground">Kept in this browser only.</p>
    </Block>
  );
}

export function ScreensBlock() {
  const screens = useSavedScreens();
  const open = useOpenSaved();
  if (!screens.length) return null;
  return (
    <Block label="Your saved screens">
      <MarketHeading level="h2" title="Your saved screens" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
        {[...screens].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 6).map((s) => (
          <button key={s.id} type="button" onClick={() => open(s)} className="grid gap-0.5 rounded-lg border border-border px-3 py-2.5 text-left hover:bg-muted">
            <b className="text-13">{s.name}</b>
            <span className="truncate text-tiny text-muted-foreground">{describeScreen(s)}</span>
          </button>
        ))}
      </div>
    </Block>
  );
}

/* ---------- arranging Home ------------------------------------------------------------ */

export function CustomizeHome() {
  const layout = useHomeLayout();
  const [open, setOpen] = React.useState(false);
  const spec = (id: string) => HOME_BLOCKS.find((b) => b.id === id)!;
  const save = (l: LayoutEntry[]) => saveLayout(l);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><SlidersHorizontal className="size-3.5" />Customize</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Arrange Home</DialogTitle>
            <DialogDescription>Show, hide and reorder the blocks. Kept in this browser; it does not follow you to another device.</DialogDescription>
          </DialogHeader>
          <ol className="grid gap-1">
            {layout.map((e, i) => {
              const b = spec(e.id);
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <Switch checked={e.on} onCheckedChange={() => save(toggleBlock(layout, e.id))} aria-label={`Show ${b.label}`} />
                  <span className="grid min-w-0 flex-1">
                    <span className={cn('text-13 font-semibold', !e.on && 'text-muted-foreground')}>{b.label}{b.personal ? <span className="ml-2 text-micro font-normal text-muted-foreground">yours</span> : null}</span>
                    <span className="truncate text-tiny text-muted-foreground">{b.about}</span>
                  </span>
                  <button type="button" aria-label={`Move ${b.label} up`} disabled={i === 0} onClick={() => save(moveBlock(layout, e.id, -1))}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                  <button type="button" aria-label={`Move ${b.label} down`} disabled={i === layout.length - 1} onClick={() => save(moveBlock(layout, e.id, 1))}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                </li>
              );
            })}
          </ol>
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" disabled={isDefaultLayout(layout)} onClick={() => save(DEFAULT_LAYOUT)}>Reset to the default</Button>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
