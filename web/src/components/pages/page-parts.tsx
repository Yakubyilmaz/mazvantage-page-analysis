'use client';

/* ==========================================================================
   Maz Vantage — the furniture every market-canvas page shares

   The hero (eyebrow, title, strap, and a meta line with the connection
   button), the sticky section bar, the panel, and two hooks: page state in
   the query string without a history entry, and whether a key is connected —
   read after mount, because the server cannot see the reader's localStorage.
   ========================================================================== */

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { hasApiKey } from '@/lib/fmp';
import { useDataEpoch } from '@/components/providers';
import { Chevron } from '@/components/market/market-ui';
import { cn } from '@/lib/cn';

/* ---------- hooks ----------------------------------------------------------------- */

/** Page state in the address bar, replaced rather than pushed. */
export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const params = useSearchParams();
  const set = React.useCallback((changes: Record<string, string | number | null | undefined>) => {
    const next = new URLSearchParams(params?.toString() || '');
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, params]);
  const get = React.useCallback((key: string) => params?.get(key) ?? null, [params]);
  return { get, set, params };
}

/** Whether FMP is connected. `false` until mounted, then the truth; follows Settings. */
export function useHasKey() {
  const { epoch } = useDataEpoch();
  const [has, setHas] = React.useState(false);
  React.useEffect(() => { setHas(hasApiKey()); }, [epoch]);
  return has;
}

/* ---------- the hero ---------------------------------------------------------------- */

export function PageHero({ eyebrow, title, strap, meta, className }: {
  eyebrow?: React.ReactNode; title: React.ReactNode; strap?: React.ReactNode; meta?: React.ReactNode; className?: string;
}) {
  return (
    <header className={cn('pb-7 pt-12 max-md:pt-9', className)}>
      {eyebrow ? <div className="mb-[11px] text-micro font-semibold uppercase tracking-[.16em] text-muted-foreground">{eyebrow}</div> : null}
      <h1 className="text-[clamp(30px,3.4vw,48px)] font-bold leading-[1.15] tracking-[-.04em]">{title}</h1>
      {strap ? <p className="mt-3 max-w-[78ch] text-[15px] leading-relaxed text-muted-foreground">{strap}</p> : null}
      {meta ? <div className="mt-4 flex flex-wrap items-center gap-2.5 text-13 text-muted-foreground">{meta}</div> : null}
    </header>
  );
}

/**
 * Whether live data is flowing — a status, not a control. It used to open
 * Settings to connect a key; readers are no longer told a key exists.
 */
export function ConnectionButton() {
  const has = useHasKey();
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', has ? 'text-foreground' : 'text-muted-foreground')}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', has ? 'bg-up' : 'bg-muted-foreground/50')} />
      {has ? 'Live data' : 'Live data unavailable'}
    </span>
  );
}

export const MetaDivider = () => <span aria-hidden="true" className="text-muted-foreground/60">·</span>;

/** A text button that leads somewhere, with the chevron the canvas uses. */
export function Crumb({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 font-medium text-primary hover:underline', className)}>
      {children}<Chevron />
    </button>
  );
}

/* ---------- the section bar ------------------------------------------------------------ */

/** The sticky tab bar under a hero (`.mh-navigation`). */
export function SectionBar<T extends string>({ items, active, onSelect, label }: {
  items: { id: T; label: string }[]; active: T; onSelect: (id: T) => void; label: string;
}) {
  return (
    <nav aria-label={label}
      className="sticky top-[var(--utilbar-h,58px)] z-30 -mx-gutter flex gap-[25px] overflow-x-auto border-b border-border bg-background px-gutter scroll-none">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-current={item.id === active ? 'page' : undefined}
          className={cn('whitespace-nowrap border-b-[3px] border-transparent pb-[15px] pt-[18px] text-13 font-semibold text-muted-foreground hover:text-foreground',
            item.id === active && 'border-foreground text-foreground')}>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

/* ---------- panels and tables ------------------------------------------------------------ */

export function Panel({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={typeof title === 'string' ? title : undefined} className={cn('grid gap-3 rounded-xl border border-border p-6 max-sm:p-4', className)}>
      <h2 className="text-lg font-bold tracking-[-.015em]">{title}</h2>
      {children}
    </section>
  );
}

export const Para = ({ children, className }: { children: React.ReactNode; className?: string }) =>
  <p className={cn('max-w-[90ch] text-sm leading-[1.7] text-muted-foreground', className)}>{children}</p>;

export function Warn({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[90ch] rounded-lg border-l-[3px] border-warning bg-warning/8 px-4 py-3 text-sm leading-[1.7] [&_b]:font-semibold">{children}</p>;
}

export function Grid({ heads, rows }: { heads: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full border-collapse text-13">
        <thead>
          <tr className="border-b border-border">
            {heads.map((h) => <th key={h} scope="col" className="px-3 py-2 text-left text-micro font-medium uppercase tracking-[.05em] text-muted-foreground first:pl-0">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">
              {r.map((c, k) => <td key={k} className="px-3 py-2.5 align-top leading-relaxed first:pl-0">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The frame a nav page sits in. */
export function PageFrame({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return <main id={id} className={cn('min-w-0 px-gutter pb-16', className)}>{children}</main>;
}

/* ---------- the chip rail ----------------------------------------------------------- */

/** A row of screen chips (`.qd-rail`): one tab stop, arrow keys, Home and End inside it. */
export function ChipRail<T extends string | null>({ items, active, onChoose, label }: {
  items: { id: T; label: string; tag: React.ReactNode }[]; active: T; onChoose: (id: T) => void; label: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    const at = Math.max(0, items.findIndex((i) => i.id === active));
    const n = items.length;
    const next = e.key === 'ArrowRight' ? (at + 1) % n : e.key === 'ArrowLeft' ? (at - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    (ref.current?.children[next] as HTMLElement | undefined)?.focus();
    onChoose(items[next].id);
  };
  return (
    <div ref={ref} role="tablist" aria-label={label} onKeyDown={onKey} className="flex flex-wrap gap-2">
      {items.map((s) => {
        const on = s.id === active;
        return (
          <button key={String(s.id)} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => onChoose(s.id)}
            className={cn('grid gap-0.5 rounded-lg border border-border px-3.5 py-2 text-left hover:bg-accent', on && 'border-foreground bg-foreground text-background hover:bg-foreground')}>
            <span className="text-13 font-semibold">{s.label}</span>
            <span className={cn('text-micro', on ? 'text-background/70' : 'text-muted-foreground')}>{s.tag}</span>
          </button>
        );
      })}
    </div>
  );
}
