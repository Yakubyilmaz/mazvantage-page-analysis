'use client';

/* ==========================================================================
   Maz Vantage — shared report building blocks

   Port of the legacy `ui.js` (cards, blocks, notices, stat lines, tables,
   comparison bars, the feed gate, the heatmap) plus the dashboard grid the
   overview-style tabs are laid out on. Every report panel is assembled from
   these, which is what let the legacy build move all fifteen tabs onto the
   market canvas by changing tokens alone — and what keeps the port's panels
   consistent now.

   On the canvas a section is a bordered box or nothing at all, never a
   filled card on a tinted page: boxes are reserved for real objects.
   ========================================================================== */

import * as React from 'react';
import { Info } from 'lucide-react';
import { isNum, mult, pct, cagr, clamp, type Maybe } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Hint } from '@/components/ui/primitives';
import { TickIcon } from '@/components/shell/icons';
import { TableCsv } from '@/components/csv-button';
import type { GradeTone } from '@/lib/grading';

/* ---------- cards ----------------------------------------------------------- */

/** A report section: a bordered box with an anchor id (`card()` in the legacy). */
export const Card = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { compact?: boolean }>(
  ({ className, compact, ...props }, ref) => (
    <section ref={ref}
      className={cn('mb-6 scroll-mt-[126px] rounded-xl border border-border bg-transparent',
        compact ? 'p-4' : 'p-6', className)}
      {...props} />
  ),
);
Card.displayName = 'Card';

/** The intro band at the top of a section: heading, sentence, and a rule under it. */
export function SectionIntro({ title, children, aside, className }: {
  title: React.ReactNode; children?: React.ReactNode; aside?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('mb-[18px] flex items-center gap-6 border-b border-border pb-3.5', className)}>
      <div className="min-w-0 flex-1">
        <h2 className="text-[21px] font-[650] tracking-[-.025em]">{title}</h2>
        {children}
      </div>
      {aside ? <div className="flex flex-none justify-center">{aside}</div> : null}
    </div>
  );
}

export function CardHead({ title, sub, className }: { title: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4', className)}>
      <h2 className="text-lg font-[650] tracking-[-.02em]">{title}</h2>
      {sub ? <p className="mt-1 text-13 text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/**
 * A subtopic inside a section: title, one sentence, the body — with a rule
 * between consecutive blocks (`blockEl()` in the legacy).
 */
export function Block({ title, desc, aside, children, className, id }: {
  title: React.ReactNode; desc?: React.ReactNode; aside?: React.ReactNode; children?: React.ReactNode; className?: string; id?: string;
}) {
  return (
    <div id={id} className={cn('mt-6 border-t border-border pt-6 first:mt-0 first:border-t-0 first:pt-0', className)}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[200px] flex-1">
          <h3 className="text-base font-semibold">{title}</h3>
          {desc ? <p className="mt-[3px] text-13 text-muted-foreground">{desc}</p> : null}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/* ---------- the dashboard grid --------------------------------------------- */

/**
 * The twelve-column card grid of the dashboard tabs. No `align-items: start`:
 * grid items stretch, so every card in a row ends on the same line and a
 * short card carries the slack inside itself.
 */
export function OGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-12 gap-6 max-lg:grid-cols-1', className)}>{children}</div>;
}

const SPAN: Record<3 | 4 | 6 | 8 | 12, string> = {
  3: 'col-span-3 max-xl:col-span-6 max-lg:col-span-1',
  4: 'col-span-4 max-xl:col-span-6 max-lg:col-span-1',
  6: 'col-span-6 max-lg:col-span-1',
  8: 'col-span-8 max-xl:col-span-12 max-lg:col-span-1',
  12: 'col-span-12 max-lg:col-span-1',
};

/** One dashboard card (`card(…, 'ocard ovw__cN')`). A column, so the slack has somewhere to go. */
export const OCard = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { span?: 3 | 4 | 6 | 8 | 12 }>(
  ({ span = 4, className, ...props }, ref) => (
    <section ref={ref}
      className={cn('flex min-w-0 scroll-mt-[126px] flex-col rounded-xl border border-border p-4', SPAN[span], className)}
      {...props} />
  ),
);
OCard.displayName = 'OCard';

/**
 * Card head: title on the left, whatever the card wants on the right.
 *
 * `info` is the small print — what a figure is measured against, what the
 * card deliberately does not claim. It hangs off an icon beside the title
 * rather than sitting under the card as a grey paragraph: on a grid of a
 * dozen cards every one of those competes with the numbers it qualifies.
 */
export function OHead({ title, aside, info, className }: {
  title: React.ReactNode; aside?: React.ReactNode; info?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)}>
      <h2 className="inline-flex min-w-0 items-center gap-[5px] text-base font-semibold tracking-[-.01em]">
        {title}
        {info ? (
          <Hint text={info}>
            <button type="button" aria-label="About this card" className="text-muted-foreground/70 hover:text-muted-foreground">
              <Info className="size-[13px]" />
            </button>
          </Hint>
        ) : null}
      </h2>
      {aside}
    </div>
  );
}

/** "See all" at the foot of a card, which claims the card's slack. (`.omore`) */
export function OMore({ children, onClick, href, className }: {
  children: React.ReactNode; onClick?: () => void; href?: string; className?: string;
}) {
  const cls = cn('mt-auto inline-flex items-center gap-1 self-start pt-3 text-13 font-semibold text-primary hover:underline', className);
  if (href) return <a href={href} className={cls}>{children} <span aria-hidden="true">→</span></a>;
  return <button type="button" onClick={onClick} className={cls}>{children} <span aria-hidden="true">→</span></button>;
}

/* ---------- stat lines ------------------------------------------------------ */

export type Tone = 'pos' | 'neg' | 'good' | 'bad' | 'warn' | 'muted' | '' | null | undefined;

export const toneClass = (tone: Tone) =>
  tone === 'pos' || tone === 'good' ? 'text-up'
    : tone === 'neg' || tone === 'bad' ? 'text-down'
      : tone === 'warn' ? 'text-warning'
        : tone === 'muted' ? 'text-muted-foreground' : '';

/**
 * Label / value line — the workhorse of every small card.
 *
 * `note` is the qualifier that belongs to the figure rather than to the row
 * — the period it covers, what it excludes — and prints small beside it.
 */
export function StatLine({ label, value, tone, note, title, className }: {
  label: React.ReactNode; value: React.ReactNode; tone?: Tone; note?: React.ReactNode; title?: string; className?: string;
}) {
  const row = (
    <div className={cn('flex items-center justify-between gap-3 border-b border-border py-[7px] text-13 tnum last:border-b-0', className)}>
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right font-semibold">
        {typeof value === 'string' || typeof value === 'number' || value == null
          ? <span className={toneClass(tone)}>{String(value ?? 'n/a')}</span>
          : value}
        {note ? <i className="basis-full text-micro font-normal not-italic text-muted-foreground">{note}</i> : null}
      </span>
    </div>
  );
  return title ? <Hint text={title}>{row}</Hint> : row;
}

export function StatLines({ children, split, className }: { children: React.ReactNode; split?: boolean; className?: string }) {
  return <div className={cn('grid', split && 'mt-3 border-t border-border pt-0.5', className)}>{children}</div>;
}

/** The headline figure at the top of a small card. (`.obig`) */
export function OBig({ label, value, note, noteTone, className }: {
  label: React.ReactNode; value: React.ReactNode; note?: React.ReactNode; noteTone?: Tone; className?: string;
}) {
  return (
    <div className={cn('mb-3 grid gap-px rounded-[10px] bg-muted p-3', className)}>
      <span className="text-micro uppercase tracking-[.06em] text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tracking-[-.02em] tnum">{value}</span>
      {note ? <span className={cn('text-tiny font-semibold', toneClass(noteTone))}>{note}</span> : null}
    </div>
  );
}

/** A thin 0-5 bar in the grade's colour. (`.otrack`) */
export function ScoreTrack({ score, max = 5, tone, className }: { score: Maybe<number>; max?: number; tone: GradeTone; className?: string }) {
  const w = isNum(score) ? clamp((score / max) * 100, 2, 100) : 0;
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-[3px] bg-border', className)}>
      <span className="block h-full rounded-[3px]" style={{ width: `${w}%`, background: `var(--grade-${tone})` }} />
    </span>
  );
}

/* ---------- pills and notices ----------------------------------------------- */

const PILL: Record<string, string> = {
  good: 'bg-up/12 text-up',
  bad: 'bg-down/12 text-down',
  neutral: 'bg-accent text-muted-foreground',
  gold: 'bg-primary/12 text-primary',
  muted: 'bg-accent text-muted-foreground',
  warn: 'bg-warning/12 text-warning',
};

export function Pill({ tone = 'muted', children, className, title }: {
  tone?: keyof typeof PILL | string; children: React.ReactNode; className?: string; title?: string;
}) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-[5px] whitespace-nowrap rounded-md px-2 py-[3px] text-micro font-semibold tracking-[.02em]',
      PILL[tone] || PILL.muted, className)}>
      {children}
    </span>
  );
}

/** The standing notice (`notice()`): an icon and a sentence, `error` for a failure. */
export function Notice({ children, error, warn, className }: { children: React.ReactNode; error?: boolean; warn?: boolean; className?: string }) {
  return (
    <div role="note" className={cn('flex gap-2.5 rounded-xl border border-border bg-muted px-4 py-3 text-13 leading-relaxed text-muted-foreground',
      warn && 'border-warning/35 bg-warning/8',
      '[&_b]:font-semibold [&_b]:text-foreground [&_code]:font-mono [&_code]:text-tiny [&_code]:text-primary', className)}>
      <TickIcon kind="info" className={cn('mt-0.5', error ? 'text-down' : warn ? 'text-warning' : 'text-grade-mid')} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** One pass / fail / not-assessed line with its label and note. */
export function CheckRow({ state, label, note, why }: { state: 'pass' | 'fail' | 'na'; label: React.ReactNode; note?: React.ReactNode; why?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 py-[5px]">
      <TickIcon kind={state} className={cn('mt-[3px]', state === 'pass' ? 'text-up' : state === 'fail' ? 'text-down' : 'text-muted-foreground/60')} />
      <div>
        <p className="text-13 leading-relaxed">{label}</p>
        {note ? <p className="text-tiny leading-normal text-muted-foreground">{note}</p> : null}
        {state === 'na' && why ? <p className="text-tiny leading-normal text-muted-foreground/70">{why}</p> : null}
      </div>
    </li>
  );
}

/* ---------- key info tiles, comparison bars, tables ------------------------ */

export function KeyInfo({ items }: { items: ([React.ReactNode, React.ReactNode] | null | false | undefined)[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-px overflow-hidden rounded-[10px] border border-border bg-border">
      {items.filter(Boolean).map((it, i) => {
        const [k, v] = it as [React.ReactNode, React.ReactNode];
        return (
          <div key={i} className="bg-background p-3">
            <div className="text-lg font-semibold tnum">{v}</div>
            <div className="mt-px text-tiny text-muted-foreground">{k}</div>
          </div>
        );
      })}
    </div>
  );
}

export interface CmpRow { label: string; value: Maybe<number>; self?: boolean; tone?: 'good' | 'bad' | 'muted' }

/** Horizontal comparison bars sharing one scale. */
export function CmpBars({ rows, fmt = (v: number) => mult(v) }: { rows: CmpRow[]; fmt?: (v: number) => string }) {
  const vals = rows.map((r) => r.value).filter(isNum);
  const max = vals.length ? Math.max(...vals) : 1;
  return (
    <div className="grid gap-3">
      {rows.map((r, i) => {
        const w = isNum(r.value) && max > 0 ? clamp((r.value / max) * 100, 1.5, 100) : 0;
        return (
          <div key={i} className="grid grid-cols-[150px_minmax(0,1fr)_82px] items-center gap-3 text-13 max-sm:grid-cols-[100px_minmax(0,1fr)_64px]">
            <div className={cn('truncate text-muted-foreground', r.self && 'font-semibold text-foreground')} title={r.label}>{r.label}</div>
            <div className="relative h-[22px] overflow-hidden rounded-md bg-accent">
              <div className={cn('absolute inset-y-0 left-0 min-w-0.5 rounded-md',
                r.self ? 'bg-primary' : r.tone === 'good' ? 'bg-up' : r.tone === 'bad' ? 'bg-down' : r.tone === 'muted' ? 'border border-border bg-accent' : 'bg-chart-1')}
                style={{ width: `${w}%` }} />
            </div>
            <div className="text-right tnum">{isNum(r.value) ? fmt(r.value) : 'n/a'}</div>
          </div>
        );
      })}
    </div>
  );
}

export interface Column { label: React.ReactNode; num?: boolean; className?: string }

/**
 * The generic data table (`table()`): headers, rows of cells, numbers
 * right-aligned. Every one carries a CSV export of what it shows, named after
 * the heading above it; `exportName={null}` turns that off.
 */
export function DataTable({ headers, rows, className, dense, exportName }: {
  headers: (Column | string)[]; rows: React.ReactNode[][]; className?: string; dense?: boolean; exportName?: string | null;
}) {
  const table = <DataTableBody headers={headers} rows={rows} className={className} dense={dense} />;
  if (exportName === null || rows.length < 2) return table;
  return <TableCsv name={exportName}>{table}</TableCsv>;
}

function DataTableBody({ headers, rows, className, dense }: {
  headers: (Column | string)[]; rows: React.ReactNode[][]; className?: string; dense?: boolean;
}) {
  const cols = headers.map((h) => (typeof h === 'string' ? { label: h } : h));
  return (
    <div className={cn('overflow-x-auto scroll-thin', className)}>
      <table className="text-13">
        <thead>
          <tr>
            {cols.map((h, i) => (
              <th key={i} className={cn('whitespace-nowrap border-b border-border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground',
                h.num && 'text-right', h.className)}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="hover:bg-accent/60">
              {r.map((c, ci) => (
                <td key={ci} className={cn('border-b border-border align-top tnum', dense ? 'px-3 py-2' : 'p-3', cols[ci]?.num && 'text-right')}>
                  {c ?? 'n/a'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- the feed gate ---------------------------------------------------- */

/**
 * The gated / unavailable message for a feed, or null when it is fine.
 * "Not on this plan", "needs a key" and "failed" read very differently, and
 * a page that says which one it got is one a reader can act on.
 */
export function FeedGate({ a, feed, what }: { a: { ds: { status: (f: string) => string; message: (f: string) => string } }; feed: string; what: string }) {
  const s = a.ds.status(feed);
  if (s === 'ok') return null;
  if (s === 'gated') {
    return <Notice><b>{what}</b> is not available for this report. The rest of the report is unaffected.</Notice>;
  }
  if (s === 'skipped') {
    return <Notice><b>{what}</b> needs live data, which is unavailable right now.</Notice>;
  }
  return <Notice error><b>{what}</b> could not be loaded — {a.ds.message(feed) || 'unknown error'}.</Notice>;
}

/** Is a feed usable? The boolean half of `FeedGate`. */
export const feedOk = (a: { ds: { status: (f: string) => string } }, feed: string) => a.ds.status(feed) === 'ok';

/* ---------- performance pills ------------------------------------------------ */

/**
 * The two numbers that summarise a run of bars: what it did in total, and
 * what that is a year — together, because either alone misleads. Both refuse
 * a sign flip: a series that starts at or below zero has no compound rate.
 *
 * `invert` for a series whose welcome direction is down — a share count, a
 * debt pile: the sign printed is still the sign; only the colour turns over.
 */
export function PerfCagr({ first, last, years, fmt = (v: number) => pct(v, { sign: true }), invert = false }: {
  first: Maybe<number>; last: Maybe<number>; years: number; fmt?: (v: number) => string; invert?: boolean;
}) {
  const total = isNum(first) && isNum(last) && first > 0 ? last / first - 1 : null;
  const rate = cagr(first, last, years);
  if (!isNum(total) && !isNum(rate)) return null;
  const good = (v: number) => (invert ? v < 0 : v > 0);
  const pill = (label: string, v: number | null, title: string) => (
    <Hint text={title}>
      <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-micro',
        isNum(v) && !good(v) ? 'bg-down/12 text-down' : 'bg-up/12 text-up')}>
        <i className="font-medium not-italic opacity-75">{label}</i>
        <b className="font-bold tnum">{isNum(v) ? fmt(v) : 'n/a'}</b>
      </span>
    </Hint>
  );
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {pill('Perf', total, `The whole span, start to finish, over ${years} year${years === 1 ? '' : 's'}.`)}
      {pill('CAGR', rate, 'The constant annual rate that would have produced the same finish. Not shown where the series starts at or below zero, which has no compound rate.')}
    </div>
  );
}

/* ---------- logos ---------------------------------------------------------------- */

/**
 * An asset's logo, with a letter behind it. A failed load swaps itself for
 * the symbol's first letter on a neutral square so a row keeps its rhythm;
 * `fallback="none"` drops the tile (a ticker chip already prints the symbol).
 */
export function Logo({ url, label = '', size, fallback = 'letter', className }: {
  url: string | null | undefined; label?: string; size?: 'sm' | 'lg'; fallback?: 'letter' | 'none'; className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const dims = size === 'sm' ? 'size-5 text-[9px]' : size === 'lg' ? 'size-10 text-sm' : 'size-7 text-tiny';
  if (!url || failed) {
    if (fallback === 'none') return null;
    const letter = String(label || '?').replace(/[^A-Za-z0-9]/g, '')[0]?.toUpperCase() || '?';
    return <span aria-hidden="true" className={cn('grid flex-none place-items-center rounded-md bg-accent font-semibold text-muted-foreground', dims, className)}>{letter}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" loading="lazy" onError={() => setFailed(true)}
    className={cn('flex-none rounded-md bg-white object-contain p-0.5', dims, className)} />;
}

/* ---------- heatmap ---------------------------------------------------------------- */

/**
 * A grid of tiles coloured by how far each moved.
 *
 * The buckets are **fixed**, not relative to the biggest move on screen:
 * scaled to the best tile, a flat day renders deep green and the page looks
 * like a rally. Fixed thresholds mean a quiet day *looks* quiet. Four steps
 * either side of zero, at 0.5 / 1 / 2 / 3 per cent.
 */
const HEAT_STEPS = [0.5, 1, 2, 3];

export function heatTone(change: Maybe<number>): string {
  if (!isNum(change)) return 'na';
  const a = Math.abs(change);
  let step = 0;
  for (const t of HEAT_STEPS) if (a >= t) step += 1;
  if (step === 0) return 'flat';
  return `${change >= 0 ? 'up' : 'down'}-${step}`;
}

const HEAT_BG: Record<string, string> = {
  flat: 'var(--accent)',
  na: 'var(--muted)',
  'up-1': 'color-mix(in srgb, var(--up) 12%, transparent)',
  'up-2': 'color-mix(in srgb, var(--up) 22%, transparent)',
  'up-3': 'color-mix(in srgb, var(--up) 34%, transparent)',
  'up-4': 'color-mix(in srgb, var(--up) 48%, transparent)',
  'down-1': 'color-mix(in srgb, var(--down) 12%, transparent)',
  'down-2': 'color-mix(in srgb, var(--down) 22%, transparent)',
  'down-3': 'color-mix(in srgb, var(--down) 34%, transparent)',
  'down-4': 'color-mix(in srgb, var(--down) 48%, transparent)',
};
export const heatBg = (change: Maybe<number>) => HEAT_BG[heatTone(change)];

export interface HeatRow { label: string; change: Maybe<number>; note?: string }

/** `change` already in per cent. `onPick` makes a tile a button; without it tiles are plain. */
export function Heatmap<R extends HeatRow>({ rows, onPick, title = (r) => r.label }: {
  rows: R[]; onPick?: (r: R) => void; title?: (r: R) => string;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-1.5">
      {rows.map((r, i) => {
        const inner = (
          <>
            <span className="truncate text-13 font-semibold">{r.label}</span>
            <span className="text-13 font-semibold tnum">{isNum(r.change) ? pct(r.change, { already: true, sign: true }) : 'n/a'}</span>
            {r.note ? <i className="text-[10px] not-italic text-muted-foreground">{r.note}</i> : null}
          </>
        );
        const cls = cn('grid min-h-[68px] content-center gap-0.5 rounded-lg border border-transparent p-2.5 text-left', heatTone(r.change) === 'na' && 'opacity-55');
        return onPick ? (
          <button key={i} type="button" title={title(r)} onClick={() => onPick(r)} className={cn(cls, 'hover:border-border')} style={{ background: heatBg(r.change) }}>{inner}</button>
        ) : (
          <div key={i} title={title(r)} className={cls} style={{ background: heatBg(r.change) }}>{inner}</div>
        );
      })}
    </div>
  );
}

/** The legend that says what the colours mean, since the scale is fixed.
    `bg` is the palette the tiles beside it use — the treemap's is solid. */
export function HeatLegend({ bg = heatBg, className }: { bg?: (change: number) => string; className?: string } = {}) {
  const sw = (change: number, label: string) => (
    <span className="inline-flex items-center gap-[5px]">
      <i className="inline-block size-3 rounded-[3px]" style={{ background: bg(change) }} />
      <span>{label}</span>
    </span>
  );
  return (
    <div className={cn('mt-2 flex flex-wrap items-center gap-3 text-tiny text-muted-foreground', className)}>
      {sw(-3.5, '−3%')}{sw(-1.5, '−1%')}{sw(0, '0')}{sw(1.5, '+1%')}{sw(3.5, '+3%')}
      <span className="text-muted-foreground/70">fixed scale, so a quiet day looks quiet</span>
    </div>
  );
}

/* ---------- loading --------------------------------------------------------------- */

export function SkeletonReport({ symbol }: { symbol: string }) {
  return (
    <div className="max-w-[var(--shell-max)] p-6">
      <div className="mb-3 h-7 w-[260px] animate-pulse rounded-md bg-accent" />
      <div className="mb-6 h-3 w-2/5 animate-pulse rounded-md bg-accent" />
      <div className="mb-6 h-[220px] animate-pulse rounded-xl bg-accent" />
      <div className="mb-3 h-3 animate-pulse rounded-md bg-accent" />
      <div className="mb-6 h-3 w-4/5 animate-pulse rounded-md bg-accent" />
      <p className="text-center text-tiny text-muted-foreground">Loading {symbol}…</p>
    </div>
  );
}

/* ---------- caveat lists ------------------------------------------------------ */

/** The bulleted "what this does not do / how to read it" list (`.rlimits`). */
export function Limits({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={cn('grid gap-2', className)}>
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-13 leading-normal text-muted-foreground before:mt-2 before:size-1.5 before:flex-none before:rounded-full before:bg-border before:content-['']">
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** A labelled figure pill (`.perfpill`): up, down or middle. */
export function PerfPill({ label, value, tone, title }: { label: string; value: string; tone: 'up' | 'down' | 'mid'; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-micro',
      tone === 'up' ? 'bg-up/12 text-up' : tone === 'down' ? 'bg-down/12 text-down' : 'bg-accent text-muted-foreground')}>
      <i className="font-medium not-italic opacity-75">{label}</i>
      <b className="font-bold tnum">{value}</b>
    </span>
  );
}
