'use client';

/* ==========================================================================
   The market canvas's section furniture

   The legacy `mh-*` / `mi-*` / `gp-*` classes as components: the numbered
   section with its big heading, the description and panel note under it, the
   chip rail, the stat grid, the range selector, the "bought" consent button,
   the coverage disclosure and the footer. The Sectors pages and the Market
   Data boards are built from these; the page hero and the sticky section bar
   are in `pages/page-parts.tsx`.
   ========================================================================== */

import * as React from 'react';
import { isNum, pct } from '@/lib/format';
import { Chevron } from '@/components/market/market-ui';
import { cn } from '@/lib/cn';

/* ---------- sections ------------------------------------------------------- */

/** A canvas section (`.mh-section`): a large heading with its mark, then the body. */
export function CanvasSection({ id, title, mark, onTitle, children, className, first }: {
  id?: string; title: React.ReactNode; mark?: string; onTitle?: () => void;
  children: React.ReactNode; className?: string; first?: boolean;
}) {
  const label = (
    <>
      {mark ? <span aria-hidden="true" className="text-primary">{mark}</span> : null}
      {title}
    </>
  );
  return (
    <section id={id} aria-label={typeof title === 'string' ? title : undefined}
      className={cn('min-w-0 scroll-mt-[126px] pb-[30px] pt-[61px] max-sm:pt-10', !first && 'mt-5 border-t border-border', className)}>
      <h2 className="mb-7 flex items-center gap-2.5 text-[32px] font-[650] tracking-[-.035em] max-sm:text-2xl">
        {onTitle ? (
          <button type="button" onClick={onTitle} className="inline-flex items-center gap-2.5 text-left hover:text-primary">{label}<Chevron /></button>
        ) : label}
      </h2>
      {children}
    </section>
  );
}

/** The line under a section heading (`.mh-section-description`). */
export const Description = ({ children, className }: { children: React.ReactNode; className?: string }) =>
  <p className={cn('-mt-3 mb-6 max-w-[92ch] text-tiny leading-relaxed text-muted-foreground', className)}>{children}</p>;

/** The small print under a panel (`.mh-panel-note`). */
export const PanelNote = ({ children, className }: { children: React.ReactNode; className?: string }) =>
  <p className={cn('mt-3 max-w-[100ch] text-micro leading-relaxed text-muted-foreground', className)}>{children}</p>;

/** A full-width "see all" row (`.mh-see-all`). */
export function SeeAll({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('flex w-full items-center justify-between py-[17px] text-left text-13 text-primary hover:underline', className)}>
      {children}<Chevron />
    </button>
  );
}

/** Where the data came from and what it cannot say (`.mh-coverage`). */
export function Coverage({ notes, title = 'Data coverage' }: { notes: React.ReactNode[]; title?: string }) {
  const lines = notes.filter(Boolean);
  if (!lines.length) return null;
  return (
    <details className="mt-6 text-micro text-muted-foreground">
      <summary className="w-fit cursor-pointer">{title}</summary>
      <div className="grid max-w-[100ch] gap-[5px] pt-2.5 leading-relaxed">{lines.map((n, i) => <p key={i}>{n}</p>)}</div>
    </details>
  );
}

/** The canvas footer: the source line, and the way back up. */
export function CanvasFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="mt-[50px] flex items-center justify-between gap-5 border-t border-border py-8 text-tiny text-muted-foreground max-sm:flex-col max-sm:items-start">
      <span>{children}</span>
      <button type="button" className="text-foreground" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top ↑</button>
    </footer>
  );
}

/* ---------- chips ---------------------------------------------------------- */

/** A rail of pill chips (`.mh-ideas__rail`). */
export const ChipRow = ({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) =>
  <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>{children}</div>;

/** One chip (`.mh-idea`); `active` inverts it. */
export function Chip({ children, active, onClick, title }: { children: React.ReactNode; active?: boolean; onClick: () => void; title?: string }) {
  return (
    <button type="button" aria-pressed={active} title={title} onClick={onClick}
      className={cn('inline-flex items-baseline gap-[7px] rounded-full border border-border bg-background px-[15px] py-2 text-13 font-medium hover:bg-accent',
        active && 'border-foreground bg-foreground font-semibold text-background hover:bg-foreground')}>
      {children}
    </button>
  );
}

/* ---------- figures -------------------------------------------------------- */

/** A signed, coloured percentage — `value` already in per cent — or a quiet n/a. */
export function SignedPct({ value, dp = 1, className }: { value: unknown; dp?: number; className?: string }) {
  if (!isNum(value)) return <span className={cn('text-muted-foreground', className)}>n/a</span>;
  return <span className={cn('tnum', value > 0 && 'text-up', value < 0 && 'text-down', className)}>{pct(value, { already: true, sign: true, dp })}</span>;
}

/** A signed, coloured return given as a fraction (0.12 → +12.0%). */
export function SignedReturn({ value, className }: { value: unknown; className?: string }) {
  if (!isNum(value)) return <span className={cn('text-muted-foreground', className)}>n/a</span>;
  return <span className={cn('tnum', value > 0 && 'text-up', value < 0 && 'text-down', className)}>{pct(value, { sign: true })}</span>;
}

export type Stat = [label: string, value: React.ReactNode, note?: React.ReactNode] | null | false | undefined;

/**
 * A figure, what it is, and where it came from (`.gp-stats`). Three lines,
 * because the third is what stops a number on the page being mistaken for a
 * different one.
 */
export function StatGrid({ items, className }: { items: Stat[]; className?: string }) {
  return (
    <div className={cn('my-1.5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-[22px] gap-y-3.5 max-sm:grid-cols-1 max-sm:gap-2.5', className)}>
      {items.filter((s): s is Exclude<Stat, null | false | undefined> => !!s).map(([label, value, note]) => (
        <div key={label} className="grid min-w-0 content-start gap-[3px] rounded-xl border border-border px-4 py-3.5 max-sm:px-3.5 max-sm:py-3">
          <span className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{label}</span>
          <strong className="text-[22px] font-[650] leading-tight tracking-[-.02em] max-sm:text-[19px]">{value}</strong>
          {note ? <span className="text-micro text-muted-foreground">{note}</span> : null}
        </div>
      ))}
    </div>
  );
}

/* ---------- controls ------------------------------------------------------- */

/** The pill-shaped range selector (`.rangesel`). */
export function RangeSelect<T extends string>({ items, active, onChange, label, className }: {
  items: readonly { key: T; label: string }[]; active: T; onChange: (key: T) => void; label: string; className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-0.5 rounded-full bg-accent p-[3px]', className)}>
      {items.map((w) => (
        <button key={w.key} type="button" aria-pressed={w.key === active} onClick={() => onChange(w.key)}
          className={cn('rounded-full px-3 py-1 text-tiny text-muted-foreground', w.key === active && 'bg-background font-semibold text-foreground shadow-sm')}>
          {w.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A request the reader has to ask for (`.mi-load`), with its progress beside
 * it. The label says what it will cost before it is pressed.
 */
export function ConsentButton({ children, busy, busyText, progress, onClick, className }: {
  children: React.ReactNode; busy?: boolean; busyText?: string; progress?: string | null; onClick: () => void; className?: string;
}) {
  return (
    <div className={cn('mt-3.5 flex flex-wrap items-center gap-2.5', className)}>
      <button type="button" disabled={busy} onClick={onClick}
        className="rounded-[7px] border border-primary bg-primary px-4 py-[9px] text-13 font-semibold text-primary-foreground disabled:opacity-60">
        {busy ? busyText || 'Loading…' : children}
      </button>
      {progress ? <span aria-live="polite" className="text-micro text-muted-foreground">{progress}</span> : null}
    </div>
  );
}

/**
 * The bargain stated before it is struck (`.mi-consent` / `.em-consent`): what
 * is not loaded yet, what loading it costs, and the button that pays.
 */
export function ConsentPanel({ title, children, action, busy, busyText, progress, onClick, className }: {
  title: React.ReactNode; children: React.ReactNode; action: React.ReactNode;
  busy?: boolean; busyText?: string; progress?: string | null; onClick: () => void; className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-6 rounded-[10px] border border-border bg-muted px-[18px] py-4 max-sm:gap-3.5', className)}>
      <div className="min-w-0">
        <strong className="text-13 font-semibold">{title}</strong>
        <p className="mt-[5px] max-w-[80ch] text-tiny leading-relaxed text-muted-foreground">{children}</p>
      </div>
      <ConsentButton className="mt-0" busy={busy} busyText={busyText} progress={progress} onClick={onClick}>{action}</ConsentButton>
    </div>
  );
}
