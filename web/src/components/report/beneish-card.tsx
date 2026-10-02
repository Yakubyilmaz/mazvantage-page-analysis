'use client';

/* ==========================================================================
   Maz Vantage — the Beneish M-Score card (Financials tab, balance sheet)

   The score, its eight inputs and what each one weighs, and the score across
   every pair of filed years. The breakdown is the point: −2.1 on its own says
   nothing about *which* accounts moved, and a reader who sees the accrual
   index carrying the whole score knows where to look in the filing.
   ========================================================================== */

import * as React from 'react';
import { dec, isNum } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { BENEISH_INDICES, BENEISH_THRESHOLD, contribution } from '@/lib/beneish';
import { LineChart } from '@/components/charts/charts';
import { OSub } from '@/components/report/grade-parts';
import { DataTable, Notice, OCard, OHead, Pill, StatLine, StatLines } from '@/components/report/ui';

const signed = (v: number | null | undefined, dp = 2) => (isNum(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${dec(Math.abs(v), dp)}` : 'n/a');
const score = (v: number | null | undefined) => (isNum(v) ? `${v < 0 ? '−' : ''}${dec(Math.abs(v), 2)}` : 'n/a');

export function BeneishCard({ a }: { a: Analysis }) {
  const b = a.beneish;
  const head = (
    <OHead title="Beneish M-Score"
      info="Beneish’s 1999 model of earnings manipulation, fitted on manufacturers and service companies: eight ratios comparing the last filed year with the one before. A reference figure like the Altman Z-score beside it — it is not in any factor grade." />
  );
  if (!b?.available) {
    return (
      <OCard span={12} id="fin-beneish">
        {head}
        <Notice>The M-Score needs two consecutive annual income statements, balance sheets and cash-flow statements; fewer than two were filed together here.</Notice>
      </OCard>
    );
  }
  const y = b.latest!;
  const flagged = b.zone === 'flag';
  const pts = b.history.filter((h) => isNum(h.m)).map((h) => ({ date: h.date, value: h.m as number }));

  return (
    <OCard span={12} id="fin-beneish">
      {head}
      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 max-lg:grid-cols-1">
        <div>
          <StatLines>
            <StatLine label={`M-Score, FY${y.year ?? ''} vs FY${isNum(y.year) ? y.year - 1 : ''}`}
              value={(
                <span className="inline-flex items-center gap-2">
                  <span className="text-lg">{score(y.m)}</span>
                  {y.m == null ? null : !b.applicable
                    ? <Pill tone="muted">not meaningful here</Pill>
                    : <Pill tone={flagged ? 'warn' : 'good'}>{flagged ? 'above the flag line' : 'below the flag line'}</Pill>}
                </span>
              )} />
            <StatLine label="Flag line" value={score(BENEISH_THRESHOLD)} note="Beneish’s cut-off for the eight-variable model" />
            <StatLine label="Years on file" value={String(pts.length)} note={pts.length > 1 ? `FY${b.history[0].year}–FY${y.year}` : ''} />
          </StatLines>
          <p className="mt-3 text-13 leading-relaxed text-muted-foreground">
            {y.m == null
              ? `Not computed: ${y.missing.length === 1 ? 'one input was' : `${y.missing.length} inputs were`} not reported — ${y.missing.map((k) => BENEISH_INDICES.find((i) => i.key === k)!.label.toLowerCase()).join(', ')}. A blank is never filled with a guess.`
              : !b.applicable
                ? 'This is a financial company. The model was fitted without banks or insurers, whose receivables and margins mean something else, so the number is printed for completeness and should not be read.'
                : flagged
                  ? 'Above −1.78 the accounts share a pattern with companies later caught manipulating earnings in Beneish’s sample. Fast honest growth produces the same pattern; the table shows which inputs carry it, and the filing is where to check them.'
                  : 'Below −1.78 the accounts look more like the companies in Beneish’s sample that were not later caught manipulating earnings. It is a screen, not an audit: it can miss what it was not built to see.'}
          </p>
          {y.neutral.length ? (
            <p className="mt-2 text-tiny leading-relaxed text-muted-foreground/80">
              {y.neutral.map((k) => BENEISH_INDICES.find((i) => i.key === k)!.label).join(' and ')} set to a neutral 1: the line is zero in both years, Beneish’s own convention.
            </p>
          ) : null}
          {pts.length > 1 ? (
            <div className="mt-4">
              <OSub info="One score per pair of consecutive filed years, against the flag line.">The score over time</OSub>
              <LineChart height={170} fill={false} series={pts} valueFmt={(v) => score(v)} labelFmt={(d) => `FY${String(d).slice(0, 4)}`}
                refLine={{ value: BENEISH_THRESHOLD, label: 'flag line', color: 'var(--warning)' }} />
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <DataTable dense exportName={`beneish m-score FY${y.year ?? ''}`}
            headers={['Index', { label: 'Value', num: true }, { label: 'Weight', num: true }, { label: 'Adds', num: true }, 'What above 1 means']}
            rows={[
              ...BENEISH_INDICES.map((i) => {
                const val = y.indices[i.key];
                return [
                  <span key="l" title={i.what} className="font-medium">{i.label}{y.neutral.includes(i.key) ? ' *' : ''}</span>,
                  isNum(val) ? dec(val, i.key === 'tata' ? 3 : 2) : 'n/a',
                  signed(i.weight, 3),
                  signed(contribution(i.key, val)),
                  <span key="h" className="text-tiny leading-snug text-muted-foreground">{i.high}</span>,
                ];
              }),
              ['Constant', '', '', signed(-4.84), <span key="c" className="text-tiny text-muted-foreground">The model’s intercept.</span>],
            ]} />
        </div>
      </div>
    </OCard>
  );
}
