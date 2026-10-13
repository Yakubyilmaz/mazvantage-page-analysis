'use client';

/* ==========================================================================
   Maz Vantage — the verdict card, at the top of the report's Overview

   A reader arriving from a search lands on a report with eighteen tabs. This
   card answers the two questions they came with before any of them:

   1. **Is it halal?** Free, always: the same label the Shariah tab, the
      server summary and the portfolio print (`lib/halal-label.ts`), on the
      averaged market cap the providers divide by.
   2. **Is it a good business at a fair price?** The paid part, in three
      cells: the Maz grade against the sector, what growth the price already
      assumes, and the weakest ratios. Each links to the tab that explains it.

   With plan gating on (`lib/access.ts`) and a reader below Pro, the three
   paid cells say what they hold and link to the plans — they never show an
   invented or blurred-out figure. With gating off, as today, they show the
   figures with a small "Pro" mark, so the line between free and paid is
   visible before it is enforced.
   ========================================================================== */

import * as React from 'react';
import { isNum, pct } from '@/lib/format';
import { halalLabel, type HalalTone } from '@/lib/halal-label';
import { PLAN_NAME, planFor, type Feature } from '@/lib/access';
import type { Analysis } from '@/lib/model';
import { useAccess } from '@/components/access-context';
import { useNav } from '@/components/nav-context';
import { GradePill } from '@/components/report/grade-parts';
import { impliedSentence, impliedTone } from '@/components/report/implied-growth-card';
import { toneClass } from '@/components/report/ui';
import { useMcapHistory } from '@/components/report/use-mcap-history';
import { cn } from '@/lib/cn';

const LABEL_TONE: Record<HalalTone, string> = { good: 'text-up', warn: 'text-warning', bad: 'text-down', muted: 'text-muted-foreground' };
const CHIP_TONE: Record<HalalTone, string> = { good: 'bg-up/12 text-up', warn: 'bg-warning/12 text-warning', bad: 'bg-down/12 text-down', muted: 'bg-accent text-muted-foreground' };

function Cell({ title, feature, more, onMore, teaser, children }: {
  title: string; feature: Feature; more: string; onMore: () => void; teaser?: string; children: React.ReactNode;
}) {
  const nav = useNav();
  const { can } = useAccess();
  const plan = planFor(feature);
  const open = can(feature);
  return (
    <div className="flex min-w-0 flex-col gap-2 bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{title}</h3>
        {plan ? <span className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-[.06em] text-primary ring-1 ring-primary/30">{PLAN_NAME[plan]}</span>
          : <span className="rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-[.06em] text-up ring-1 ring-up/30">Free</span>}
      </div>
      {open ? (
        <>
          <div className="grid min-w-0 flex-1 content-start gap-1.5">{children}</div>
          <button type="button" onClick={onMore} className="justify-self-start self-start text-tiny font-semibold text-primary hover:underline">{more} ›</button>
        </>
      ) : (
        <div className="grid flex-1 content-start gap-2">
          <p className="text-13 leading-relaxed text-muted-foreground">{teaser || 'The full analysis behind the label.'} Part of {PLAN_NAME[plan!]}.</p>
          <button type="button" onClick={() => nav.goView('pricing')}
            className="justify-self-start rounded-md bg-primary px-3 py-1.5 text-tiny font-semibold text-primary-foreground hover:opacity-90">
            See plans
          </button>
        </div>
      )}
    </div>
  );
}

export function VerdictCard({ a }: { a: Analysis }) {
  const nav = useNav();
  const f = a.facts;
  const history = useMcapHistory(a);
  const label = React.useMemo(() => halalLabel(a, history.rows), [a, history.rows]);
  const overall = a.scores?.overall;
  const g = a.impliedGrowth;
  // The first sentence of each of the two weakest ratios: the rest, and the ranking, are on the Analysis tab.
  const risks: string[] = (a.risks || []).slice(0, 2).map((r: string) => String(r).split(/(?<=\.)\s+/)[0]);

  return (
    <section aria-label={`${f.name} at a glance`} className="grid gap-3">
      <h2 className="text-lg font-semibold tracking-[-.01em]">{f.name} at a glance</h2>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-border bg-border max-[1100px]:grid-cols-2 max-sm:grid-cols-1">
        <Cell title="Is it halal?" feature="halalLabel" more="The full Shariah screen" onMore={() => nav.goSymbolTab('Shariah Compliance')}>
          <p className={cn('text-lg font-bold leading-tight', LABEL_TONE[label.tone])}>{label.headline}</p>
          <span className={cn('self-start rounded-md px-2 py-[3px] text-micro font-semibold', CHIP_TONE[label.tone])}>{label.word}</span>
          <p className="text-tiny leading-relaxed text-muted-foreground">
            {label.source === 'researched' ? `Researched screen, methodology ${label.version}, ${label.screened}.`
              : history.loading ? 'On today’s market cap until the averages load.' : 'A screen against published methodologies, not a ruling.'}
          </p>
        </Cell>

        <Cell title="Maz grade" feature="grade" more="How it was graded" onMore={() => nav.goSymbolTab('Ratings')}
          teaser="The grade against its sector on more than a hundred ratios, and what drives it.">
          <div className="flex items-baseline gap-2">
            <GradePill score={overall?.score} letter={overall?.letter} size="lg" />
            {isNum(overall?.score) ? <span className="text-tiny text-muted-foreground">out of 5, against its sector</span> : null}
          </div>
          <p className="text-13 leading-relaxed">{a.verdict}</p>
        </Cell>

        <Cell title="What the price assumes" feature="impliedGrowth" more="The valuation" onMore={() => nav.goSymbolTab('Valuation')}
          teaser="The growth today's price already assumes, against what the company has delivered.">
          {g?.available ? (
            <>
              <p className="flex items-baseline gap-2">
                <b className="text-lg font-bold tnum">{pct(g.implied)}</b>
                <span className={cn('text-tiny font-semibold', toneClass(impliedTone(g)))}>{g.label}</span>
              </p>
              <p className="text-13 leading-relaxed">{impliedSentence(g)}</p>
            </>
          ) : <p className="text-13 leading-relaxed text-muted-foreground">{g?.reason || 'Not measured.'}</p>}
        </Cell>

        <Cell title="Watch out for" feature="risks" more="The full analysis" onMore={() => nav.openAnalysis?.()}
          teaser="The weakest ratios against its sector, in plain words.">
          {risks.length ? (
            <ul className="grid gap-1.5">
              {risks.map((r) => <li key={r} className="text-13 leading-relaxed before:mr-1.5 before:text-down before:content-['•']">{r}</li>)}
            </ul>
          ) : <p className="text-13 leading-relaxed text-muted-foreground">No ratio grades in the bottom band against its sector.</p>}
        </Cell>
      </div>
    </section>
  );
}
