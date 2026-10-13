'use client';

/* ==========================================================================
   Maz Vantage — "What the price assumes", the reverse DCF as a card

   Read from `a.impliedGrowth` (`lib/implied-growth.ts`). On the Valuation tab
   beside the fair-value models, and its one line is reused by the verdict
   card at the top of the report. It is printed beside the Valuation grade
   and never inside it.
   ========================================================================== */

import * as React from 'react';
import { isNum, money, pct } from '@/lib/format';
import type { ImpliedGrowth } from '@/lib/implied-growth';
import { IMPLIED_GROWTH_NOTE } from '@/lib/implied-growth';
import type { Analysis } from '@/lib/model';
import { OBig, OCard, OHead, StatLine, StatLines, type Tone } from '@/components/report/ui';

/** good when the ask is modest, bad when it is beyond the evidence. */
export function impliedTone(g: ImpliedGrowth): Tone {
  return g.level === 'modest' ? 'good' : g.level === 'demanding' ? 'warn' : g.level === 'unknown' ? 'muted' : 'bad';
}

/** One sentence: what the price asks for, against what the business has done. */
export function impliedSentence(g: ImpliedGrowth): string {
  if (!g.available || !isNum(g.implied)) return g.reason || 'Not measured.';
  const past = isNum(g.pastGrowth)
    ? ` Over the last ${g.pastYears} years revenue grew ${pct(g.pastGrowth)} a year.`
    : '';
  return `The price asks for about ${pct(g.implied)} revenue growth a year for ten years.${past}`;
}

export function ImpliedGrowthCard({ a }: { a: Analysis }) {
  const g = a.impliedGrowth;
  if (!g) return null;
  const tone = impliedTone(g);
  return (
    <OCard span={12} id="ft-valuation-implied">
      <OHead title="What the price assumes" info={IMPLIED_GROWTH_NOTE} />
      {!g.available ? (
        <p className="text-13 leading-relaxed text-muted-foreground">{g.reason}</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-6 max-md:grid-cols-1">
          <OBig label="Implied growth, a year for ten years" value={pct(g.implied)} note={g.label} noteTone={tone} className="self-start" />
          <div className="grid gap-3">
            <p className="text-13 leading-relaxed">{impliedSentence(g)} {g.blurb}</p>
            <StatLines>
              <StatLine label="At the newest year's free-cash margin" value={pct(g.atLatest)} note={`margin ${pct(g.marginLatest)}`} />
              <StatLine label="At the median margin across the years on file" value={pct(g.atThroughCycle)}
                note={isNum(g.marginThroughCycle) ? `margin ${pct(g.marginThroughCycle)} over ${g.years} years` : 'needs four years'} />
              <StatLine label="Past revenue growth, a year" value={pct(g.pastGrowth)} note={g.pastYears ? `last ${g.pastYears} years` : undefined} />
              <StatLine label="Enterprise value" value={money(g.enterpriseValue)} note="market value plus debt, less cash" />
            </StatLines>
            {g.noCycleCash ? (
              <p className="text-tiny leading-relaxed text-muted-foreground">
                The business has not generated free cash through the cycle, so the price rests on the current margin lasting; it reads as at least priced in.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </OCard>
  );
}
