'use client';

/* ==========================================================================
   Maz Vantage — a desk of screens over one table (Quant, Shariah)

   The screens were separate pages, each with a run button, and could not be
   compared. As one table with the screen as a control, the columns, filters,
   country and search are the same on every screen, and switching screens
   changes the ranking and nothing else.

   The screen lives in `?collection=`; a change of country or filter stays on
   the desk, because the rail is the screen picker and routing away would
   throw the reader out of the page they are working in.
   ========================================================================== */

import * as React from 'react';
import { DedicatedScreener } from '@/components/market/dedicated-screener';
import { useQueryState } from '@/components/pages/page-parts';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

export interface DeskScreen { id: string; label: string; tag: string; line: string }

export function ScreenDesk({ screens, ideaFor, lede, label, coreRules = 0, showAlias = false }: {
  screens: DeskScreen[];
  /** The idea a screen runs — its rules and its note print above the table. */
  ideaFor: (id: string) => any;
  lede: React.ReactNode;
  label: string;
  /** How many leading rules are the shared core (marked, not separated). */
  coreRules?: number;
  /** Print the portfolio's own name when it differs from the rail's. */
  showAlias?: boolean;
}) {
  const nav = useNav();
  const q = useQueryState();
  const find = (id: string | null | undefined) => screens.find((s) => s.id === id) || screens[0];
  const item = find(q.get('collection'));
  const idea = ideaFor(item.id);
  const railRef = React.useRef<HTMLDivElement>(null);

  // Every screen shares one menu slug, so the desk names the screen itself.
  React.useEffect(() => { document.title = `${item.label} — Maz Vantage`; }, [item.label]);
  // In the query from the start, or the rail marks nothing active.
  React.useEffect(() => { if (!q.get('collection')) q.set({ collection: item.id }); }, [q, item.id]);

  const choose = (id: string) => q.set({ collection: find(id).id });
  const onKey = (e: React.KeyboardEvent) => {
    const at = screens.findIndex((s) => s.id === item.id);
    const n = screens.length;
    const next = e.key === 'ArrowRight' ? (at + 1) % n : e.key === 'ArrowLeft' ? (at - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    (railRef.current?.children[next] as HTMLElement | undefined)?.focus();
    choose(screens[next].id);
  };

  return (
    <div className="grid gap-5 pt-6">
      <p className="max-w-[90ch] text-sm leading-relaxed text-muted-foreground">{lede}</p>
      <div ref={railRef} role="tablist" aria-label={label} onKeyDown={onKey} className="flex flex-wrap gap-2">
        {screens.map((s) => {
          const on = s.id === item.id;
          return (
            <button key={s.id} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => choose(s.id)}
              className={cn('grid gap-0.5 rounded-lg border border-border px-3.5 py-2 text-left hover:bg-accent', on && 'border-foreground bg-foreground text-background hover:bg-foreground')}>
              <span className="text-13 font-semibold">{s.label}</span>
              <span className={cn('text-micro', on ? 'text-background/70' : 'text-muted-foreground')}>{s.tag}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 rounded-xl border border-border bg-muted p-5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-xl font-bold tracking-[-.02em]">{item.label}</h2>
          <span className="rounded-full bg-background px-2.5 py-0.5 text-micro font-semibold text-muted-foreground">{item.tag}</span>
          {showAlias && idea && idea.title !== item.label ? (
            <span className="text-tiny text-muted-foreground" title="The portfolio this screen is, under its own name">also “{idea.title}”</span>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed">{item.line}</p>
        {idea?.rules?.length ? (
          <ul aria-label="The rules this screen applies" className="flex flex-wrap gap-1.5">
            {idea.rules.map((rule: any, i: number) => (
              <li key={i} className={cn('rounded-md border border-border bg-background px-2 py-0.5 text-tiny', i < coreRules && 'border-dashed text-muted-foreground')}>
                {rule.label}
              </li>
            ))}
          </ul>
        ) : coreRules === 0 ? <p className="text-tiny text-muted-foreground">No rule to pass — this one is a ranking of the whole universe.</p> : null}
        {idea?.note ? <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">{idea.note}</p> : null}
      </div>
      <DedicatedScreener kind="stocks" collection={item.id} country={q.get('country') || undefined} chrome={false} picker={false}
        onNavigate={(next) => {
          if (next.kind === 'etfs') { nav.goView('etfs', 'screener', next as any); return; }
          if (next.collection && next.collection !== item.id && screens.some((s) => s.id === next.collection)) { choose(next.collection); return; }
          q.set({ country: next.country });
        }} />
    </div>
  );
}
