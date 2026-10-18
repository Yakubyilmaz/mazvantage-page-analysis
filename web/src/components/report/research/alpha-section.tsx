'use client';

/* The Research tab's "Alpha Signal: Is Something Changing?" — what was the
   stock page's Alpha Signal tab (archived 2026-10-13), set in the report's
   type. Same build (`useAlphaReading`: the same feeds, eleven providers,
   score, classification, narrative and three-question brief), same
   evidence drawer, same management and firm readings; only the dress is the
   document's: prose, numbered exhibits and hairline tables instead of cards.

   Separate from the quant rating and from the fair value, and says so: the
   reading asks whether something measurable is changing that the market has
   not priced, on its own 0–100 scale, with weights that are not validated. */

import * as React from 'react';
import { fmtDate, isNum } from '@/lib/format';
import { hasApiKey } from '@/lib/fmp';
import { DIRECTION_LABEL, type Block, type Direction } from '@/lib/alpha-brief';
import type { Analysis } from '@/lib/model';
import { EvidenceHost, SignalRow, useEvidence } from '@/components/alpha/alpha-view';
import { FirmViews, ManagementVoice } from '@/components/alpha/outside-views';
import { HowBuilt, WhatHappened, useAlphaReading, type Built } from '@/components/report/tabs/alpha-tab';
import { cn } from '@/lib/cn';
import { DocTable, Exhibit, Para, Section, Small, type Narrative } from './doc';

const TONE: Record<Direction, string> = {
  improving: 'text-up', deteriorating: 'text-down', mixed: 'text-foreground', unmeasured: 'text-muted-foreground',
};
const BLOCK_NAME: Record<Block['id'], string> = { business: 'The business', expectations: 'The expectations', market: 'The market' };

/** A direction as a word, in its colour: the report carries no pills. */
const Dir = ({ d }: { d: Direction }) => <b className={TONE[d]}>{DIRECTION_LABEL[d]}</b>;

export function AlphaSection({ a, nar, ex }: { a: Analysis; nar: Narrative; ex: number }) {
  const { state, error } = useAlphaReading(a);
  const symbol = String(a.facts?.symbol || '');
  return (
    <Section id="rsr-alpha" title="Alpha Signal: Is Something Changing?" a={a} nar={nar} signed={false}>
      {error ? (
        <Small>The Alpha Signal could not be built for this company — {error}. Every other section of this report is unaffected.</Small>
      ) : !state ? (
        <Small>
          Reading the evidence for {symbol}: quarterly statements, the analyst grade history, price targets, 13F aggregates and insider filings.
          Some of these are not part of a company report, so they are being fetched now.
        </Small>
      ) : (
        <EvidenceHost><Reading state={state} a={a} ex={ex} /></EvidenceHost>
      )}
    </Section>
  );
}

function Reading({ state, a, ex }: { state: Built; a: Analysis; ex: number }) {
  const { brief, result, classification, story, capturedAt } = state;
  const symbol = String(a.facts?.symbol || '');
  const index = React.useMemo(
    () => new Map<string, any>(result.categories.flatMap((c: any) => c.signals).map((s: any) => [s.id, s])),
    [result],
  );
  const dates = [
    brief.asOf.prices ? `prices to ${fmtDate(brief.asOf.prices)}` : null,
    brief.asOf.statements ? `filings to ${fmtDate(brief.asOf.statements)}` : null,
    brief.asOf.thirteenF ? `13F holdings for the quarter to ${fmtDate(brief.asOf.thirteenF)}` : null,
  ].filter(Boolean);
  return (
    <>
      <Para>
        The quant rating ranks the company against its sector and the fair value prices its cash flows; this reading asks a third question,
        on its own 0–100 scale: is something measurable changing that the market has not priced yet? Eleven categories of dated, sourced
        evidence are grouped into three questions, about the business, the expectations and the market. The reading is{' '}
        <Dir d={brief.direction} />{isNum(result.score) ? `, at ${result.score} of 100` : ''}, with {result.coveragePct}% of the evidence it
        looks for measured{dates.length ? `, from ${dates.join(', ')}` : ''}.
      </Para>
      <Para><b>{brief.headline}</b></Para>
      {classification.primary.id !== 'none' ? (
        <Para>The pattern it fits: <b>{classification.primary.label}</b> — {classification.primary.blurb}</Para>
      ) : null}

      <Exhibit n={ex} title="The three questions, and how each reads"
        source={`Maz Vantage Alpha Signal, engine v${result.version}; filings, market data and published analyst data as dated.`}>
        <DocTable first="Question" head={['Reading', 'The answer']} rows={brief.blocks.map((b) => [
          <span key="q" className="block min-w-[11rem] whitespace-normal font-medium">{b.question}</span>,
          <Dir key="d" d={b.direction} />,
          <span key="a" className="block min-w-[16rem] whitespace-normal text-left">
            {b.answer}{b.asOf ? <span className="block text-tiny text-muted-foreground">As of {fmtDate(b.asOf)}</span> : null}
          </span>,
        ])} />
        <Small className="mt-1.5">
          Improving at 58 and up, deteriorating at 42 and down, mixed between. The weights are a stated allocation, not yet tested against
          returns; the facts below matter more than the number.
        </Small>
      </Exhibit>

      {brief.blocks.map((b, i) => (
        <BlockPart key={b.id} block={b} result={result} index={index} ex={ex + 1 + i}
          news={b.id === 'market' ? brief.news : undefined} symbol={symbol} />
      ))}

      <h3 className="mb-2 mt-7 text-[15px] font-bold">Outside the reading: management and the firms</h3>
      <div className="grid gap-[30px]">
        <ManagementVoice a={a} />
        <FirmViews a={a} bag={state.bag} capturedAt={capturedAt} />
      </div>

      {story.whatWouldConfirm.length ? (
        <>
          <h3 className="mb-2 mt-7 text-[15px] font-bold">What would confirm the reading</h3>
          <Para>The measurement that would settle each question the reading rests on, and when it next arrives:</Para>
          <ul className="mb-4 grid list-disc gap-2 pl-5 text-[14.5px] leading-[1.7]">
            {story.whatWouldConfirm.map((w: any, i: number) => <li key={i}><b>{w.categoryTitle}.</b> {w.text}</li>)}
          </ul>
        </>
      ) : null}

      <div className="mt-6 no-print"><HowBuilt state={state} /></div>
      <Small className="mt-3">
        Not scored into the quant rating and not a fair value: a separate reading, kept apart by design.
        {hasApiKey() ? '' : ` Built from a saved copy${capturedAt ? ` of ${capturedAt}` : ''}, with prices, the 13F aggregate, ratings and the earnings calendar refreshed to the dates above.`}
      </Small>
    </>
  );
}

/* One question: its reading and answer, the facts it rests on (each opening its own evidence), and the signals behind them. */
function BlockPart({ block, result, index, ex, news, symbol }: {
  block: Block; result: any; index: Map<string, any>; ex: number; news?: Built['brief']['news']; symbol: string;
}) {
  const open = useEvidence();
  const cats = result.categories.filter((c: any) => block.categories.includes(c.id));
  const signals = cats.flatMap((c: any) => c.signals).filter((s: any) => s.status !== 'insufficient_data');
  const gaps = cats.flatMap((c: any) => c.signals).filter((s: any) => s.status === 'insufficient_data');
  const byKey = (k?: string) => (k ? [...index.values()].find((s) => s.key === k) : null);
  return (
    <>
      <h3 className="mb-2 mt-7 text-[15px] font-bold">{block.question} <span className="text-13 font-normal">(<Dir d={block.direction} />)</span></h3>
      <Para>{block.answer}</Para>
      {block.facts.length ? (
        <Exhibit n={ex} title={`${BLOCK_NAME[block.id]}: the facts behind the reading`}
          source="the filings and market data each fact is read from; select a fact to open its evidence.">
          <DocTable first="Fact" head={['Figure']} rows={block.facts.map((f) => {
            const sig = byKey(f.signalKey);
            const label = (
              <span className="block min-w-[14rem] whitespace-normal">
                {f.label}{f.note ? <span className="block text-tiny text-muted-foreground">{f.note}</span> : null}
              </span>
            );
            return [
              sig ? <button key="l" type="button" onClick={() => open(sig)} title="Open the evidence behind this figure"
                className="text-left underline decoration-border underline-offset-2 hover:text-primary">{label}</button> : label,
              <b key="v" className={cn('tnum', f.tone === 'up' && 'text-up', f.tone === 'down' && 'text-down')}>{f.value}</b>,
            ];
          })} />
        </Exhibit>
      ) : <Small className="mb-3">Nothing in this part of the question could be measured for this company.</Small>}
      {news ? <WhatHappened news={news} symbol={symbol} /> : null}
      {signals.length ? (
        <details className="group mb-3 mt-2">
          <summary className="cursor-pointer list-none text-tiny font-semibold text-primary">
            {signals.length} signal{signals.length === 1 ? '' : 's'} behind this <span className="inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="mt-2 grid gap-0.5 border-t border-border pt-1.5">
            {signals.map((s: any) => <SignalRow key={s.id} sig={s} />)}
            {gaps.length ? <p className="px-2 pt-1.5 text-[11px] text-muted-foreground">Not measured: {gaps.map((g: any) => g.name).join(', ')}.</p> : null}
          </div>
        </details>
      ) : null}
    </>
  );
}
