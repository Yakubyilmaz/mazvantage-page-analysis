'use client';

/* ==========================================================================
   The small parts of a graded view: the grade pill, the rank bar, the median
   tick, the median cell and the grade bar.

   Exported because the dividend module draws its composites with exactly
   these — a dividend A and a valuation A are the same green on purpose.
   ========================================================================== */

import * as React from 'react';
import { dec, isNum, type Maybe } from '@/lib/format';
import { MAX_SCORE, toneForLetter, type GradeTone } from '@/lib/grading';
import type { GradedMetric } from '@/lib/factors';
import { TickIcon } from '@/components/shell/icons';
import { Hint } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const GRADE_TONE: Record<GradeTone, string> = {
  strong: 'bg-grade-strong-bg text-grade-strong',
  good: 'bg-grade-good-bg text-grade-good',
  mid: 'bg-grade-mid-bg text-grade-mid',
  weak: 'bg-grade-weak-bg text-grade-weak',
  poor: 'bg-grade-poor-bg text-grade-poor',
  na: 'bg-grade-na-bg text-grade-na',
};

/** The coloured A/B/C pill, with the numeric score beside it. */
export function GradePill({ score, letter, size, className }: {
  score: Maybe<number>; letter: Maybe<string>; size?: 'lg'; className?: string;
}) {
  if (!isNum(score)) {
    return (
      <span title="Not assessed" className={cn('inline-flex items-baseline gap-[5px] whitespace-nowrap rounded-md px-2 py-[3px] text-tiny leading-tight', GRADE_TONE.na, className)}>
        <b className="text-13 font-bold">–</b>
      </span>
    );
  }
  return (
    <span title={`${dec(score, 2)} out of ${MAX_SCORE}`}
      className={cn('inline-flex items-baseline gap-[5px] whitespace-nowrap rounded-md leading-tight',
        size === 'lg' ? 'px-3 py-[5px]' : 'px-2 py-[3px] text-tiny', GRADE_TONE[toneForLetter(letter)], className)}>
      <b className={cn('font-bold tracking-[.01em]', size === 'lg' ? 'text-[15px]' : 'text-13')}>{letter || '–'}</b>
      <i className={cn('not-italic opacity-75 tnum', size === 'lg' && 'text-13')}>{dec(score, 2)}</i>
    </span>
  );
}

/**
 * The stand-in for a grade on a metric that is shown but never scored —
 * distinct from the `–` pill, which means the data was missing.
 */
export function NotScored({ why = 'Shown for context; deliberately outside the factor score' }: { why?: string }) {
  return (
    <span title={why} className="inline-flex rounded-md border border-dashed border-border px-2 py-[3px] text-tiny text-muted-foreground/70">
      <b className="text-13">—</b>
    </span>
  );
}

/**
 * The Top/Bottom bar. The fill always represents "how good", so a long bar is
 * a good thing on every row whichever way the underlying ratio runs.
 */
export function RankBar({ m, className }: { m: Pick<GradedMetric, 'rank' | 'pctile'>; className?: string }) {
  if (!m.rank || !isNum(m.pctile)) return <span className="text-tiny text-muted-foreground/70">n/a</span>;
  const top = m.rank.side === 'top';
  return (
    <div className={cn('flex min-w-[150px] items-center gap-3', className)}>
      <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-border">
        <div className={cn('h-full rounded-[3px]', top ? 'bg-up' : 'bg-warning')} style={{ width: `${Math.max(2, Math.round(m.pctile * 100))}%` }} />
      </div>
      <span className={cn('whitespace-nowrap text-tiny tnum', top ? 'text-up' : 'text-muted-foreground')}>{m.rank.text}</span>
    </div>
  );
}

/** The median tick — display only, never scored. */
export function MedianTick({ m, className }: { m: Pick<GradedMetric, 'vsMedian' | 'tickTitle'>; className?: string }) {
  const title = m.tickTitle
    || (m.vsMedian === 'pass' ? 'Better than the sector median'
      : m.vsMedian === 'fail' ? 'Worse than the sector median'
        : 'No sector median to compare against');
  return (
    <TickIcon kind={m.vsMedian === 'na' ? 'na' : m.vsMedian} title={title}
      className={cn('size-3.5', m.vsMedian === 'pass' ? 'text-up' : m.vsMedian === 'fail' ? 'text-down' : 'text-muted-foreground/60', className)} />
  );
}

/** A caveat that belongs to the figure itself, beside its name (set by the dividend module). */
export function RatioTag({ tag }: { tag?: { text: string; title?: string } | null }) {
  if (!tag) return null;
  return (
    <Hint text={tag.title}>
      <i className="cursor-help whitespace-nowrap rounded-full border border-border bg-muted px-1.5 py-px text-tiny font-semibold not-italic tracking-[.02em] text-muted-foreground">
        {tag.text}
      </i>
    </Hint>
  );
}

/**
 * The number the company's figure was ranked against.
 *
 * Blank for an `absolute` metric on purpose: those are graded on an invented
 * linear scale, whose middle is a midpoint and not a median — printing it in a
 * column headed "Sector Median" would state something untrue.
 */
export function MedianCell({ m, fmt }: { m: GradedMetric; fmt?: (v: number) => string }) {
  const show = fmt || m.fmt || ((v: number) => dec(v, 2));
  if (m.source === 'absolute') {
    return <span className="text-muted-foreground/70" title="Graded against a fixed scale rather than the sector, so there is no median.">—</span>;
  }
  if (!isNum(m.median)) {
    return <span className="text-muted-foreground/70" title={m.why || 'No distribution is loaded for this ratio.'}>—</span>;
  }
  return (
    <span title={isNum(m.sampleSize) ? `Median of ${m.sampleSize.toLocaleString('en-US')} companies` : undefined}>
      {show(m.median)}
    </span>
  );
}

/** A 0-5 bar in the grade's tone (`.gradebar`). */
export function GradeBar({ score, letter, tone, share, className }: {
  score?: Maybe<number>; letter?: Maybe<string>; tone?: GradeTone; share?: number; className?: string;
}) {
  const width = share ?? (isNum(score) ? (score / MAX_SCORE) * 100 : 0);
  const t = tone ?? toneForLetter(letter);
  return (
    <div className={cn('mt-3 h-1.5 overflow-hidden rounded-[3px] bg-border', className)}>
      <div className="h-full rounded-[3px]" style={{ width: `${width}%`, background: `var(--grade-${t})` }} />
    </div>
  );
}

/** The small uppercase subheading of a dashboard card (`.osub`). */
export function OSub({ children, info, className }: { children: React.ReactNode; info?: React.ReactNode; className?: string }) {
  return (
    <p className={cn('mb-2 mt-4 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground', className)}>
      {children}
      {info ? (
        <Hint text={info}>
          <button type="button" aria-label="About this" className="text-muted-foreground/70 hover:text-muted-foreground">
            <TickIcon kind="info" className="size-[13px]" />
          </button>
        </Hint>
      ) : null}
    </p>
  );
}
