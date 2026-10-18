'use client';

/* The Research tab's "Key Debates": the questions that decide the value,
   each argued from both sides in the words of the people with a stake in
   it, with a consensus map above them. Records live in `lib/debates.ts`;
   which side the price pays for is computed here from the reverse DCF. */

import * as React from 'react';
import { fmtDate, isNum, pct } from '@/lib/format';
import { MAP_GROUPS, cellOf, debatesFor, type Cell, type Debate, type Side } from '@/lib/debates';
import type { Implied } from '@/lib/implied-expectations';
import { KIND_LABEL, linkOf } from '@/lib/research-voices';
import type { Analysis } from '@/lib/model';
import { cn } from '@/lib/cn';
import { Exhibit, Para, Section, Small, voiceDate, type Narrative } from './doc';
import { useImplied } from './implied-section';

const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const SIDE_WORD: Record<Side, string> = { bull: 'Bull', bear: 'Bear' };
const SIDE_TONE: Record<string, string> = { bull: 'text-up', bear: 'text-down', split: 'text-muted-foreground', mixed: 'text-muted-foreground' };
const SIDE_RULE: Record<Side, string> = { bull: 'border-up', bear: 'border-down' };

/** Which side today's price already pays for, from the reverse DCF: a debate the price has settled in the bulls' favour is the one with the most to lose. */
export function pricedSide(d: Debate, im: Implied | null): { side: Side | 'mixed' | null; text: string } {
  if (!im || !d.measure) return { side: null, text: 'The price does not settle this one on its own: it turns on events, not on a figure the model solves for.' };
  if (d.measure === 'growth') {
    if (!isNum(im.growth) || !isNum(im.consensusGrowth) || !im.lean) return { side: null, text: 'The implied growth could not be solved for.' };
    const s = `The price needs ${pct(im.growth)} a year for ten years at the consensus margin; the consensus path grows ${pct(im.consensusGrowth)}.`;
    return im.lean === 'more'
      ? { side: 'bull', text: `${s} The bull case is already in the price.` }
      : im.lean === 'less'
        ? { side: 'bear', text: `${s} The price allows for the bears being right.` }
        : { side: 'mixed', text: `${s} The price sits on the consensus.` };
  }
  if (!isNum(im.margin)) return { side: null, text: 'The implied margin could not be solved for.' };
  const s = `On the consensus revenue path the price needs an operating margin of ${pct(im.margin)}, against ${pct(im.consensusMargin)} in the forecast`
    + (isNum(im.filedMargins.peak) ? ` and a filed peak of ${pct(im.filedMargins.peak)}.` : '.');
  return im.margin > im.consensusMargin + 0.01
    ? { side: 'bull', text: `${s} The bull case is already in the price.` }
    : im.margin < im.consensusMargin - 0.01
      ? { side: 'bear', text: `${s} The price allows for the bears being right.` }
      : { side: 'mixed', text: `${s} The price sits on the consensus.` };
}

const nextDate = (d: Debate, a: Analysis) => (d.next.date === 'next' ? (a.quarter?.next || null) : d.next.date);

export function DebatesSection({ a, nar, ex }: { a: Analysis; nar: Narrative; ex: number }) {
  const list = debatesFor(a.facts.symbol);
  const imAll = useImplied(a);
  const im = imAll.available ? imAll : null;
  if (!list.length) return null;
  const priced = list.map((d) => pricedSide(d, im));
  const bullPriced = list.filter((_, i) => priced[i].side === 'bull').map((d) => d.short.toLowerCase());
  return (
    <Section id="rsr-debates" title="Key Debates" a={a} nar={nar} signed={false}>
      <Para>
        {WORDS[list.length] || list.length} questions decide what {a.facts.symbol} is worth, and the people with a stake in the answer disagree on each. Below, each is argued
        from both sides in their own words: management on its call, the analysts questioning it, fund managers and researchers in what they
        publish, and competitors where they take aim. Beside the quotes sit what our own figures show and which side today’s price already
        pays for.{bullPriced.length ? ` On ${bullPriced.join(' and ')}, the price has already sided with the bulls, so that is where a disappointment would cost most.` : ''}
      </Para>
      <ConsensusMap list={list} priced={priced} ex={ex} />
      {list.map((d, i) => <DebateBlock key={d.id} d={d} a={a} priced={priced[i]} n={i + 1} />)}
      <Small className="mt-4">
        Which debates matter, which quotes argue them and every line labelled ours are Maz Vantage’s choice. Quotes are verbatim and a sentence
        or two at most; an analyst’s question is filed as the concern it raises, not as a rating. No one quoted has reviewed this report. Not scored.
      </Small>
    </Section>
  );
}

const CELL_MARK: Record<string, string> = { bull: '▲ Bull', bear: '▼ Bear', split: '◆ Split', mixed: '◆ Mixed' };

function MapCell({ c }: { c: Cell | 'mixed' }) {
  if (!c) return <span className="text-muted-foreground/60">—</span>;
  return <span className={cn('font-semibold', SIDE_TONE[c])}>{CELL_MARK[c]}</span>;
}

/* Sources down the side, debates across the top. The last two rows are not
   quotes: what our figures say, and which side the price already pays for. */
function ConsensusMap({ list, priced, ex }: { list: Debate[]; priced: ReturnType<typeof pricedSide>[]; ex: number }) {
  const rows: { label: string; cells: (Cell | 'mixed')[]; ours?: boolean }[] = [
    ...MAP_GROUPS.map((g) => ({ label: g.label, cells: list.map((d) => cellOf(d, g.kinds)) }))
      .filter((r) => r.cells.some(Boolean)),
    { label: 'Our figures', cells: list.map((d) => d.ours.side), ours: true },
    { label: 'Today’s price', cells: priced.map((p) => p.side), ours: true },
  ];
  return (
    <Exhibit n={ex} title="Consensus map: who takes which side of each debate"
      source="earnings calls, fund letters, published research and company announcements as quoted below; Maz Vantage reverse DCF for the price row.">
      <div className="scroll-none overflow-x-auto">
        <table className="w-full border-collapse text-13">
          <thead>
            <tr className="border-b border-foreground/70">
              <th className="px-2 py-1.5 text-left text-tiny font-semibold text-muted-foreground">Source</th>
              {list.map((d) => <th key={d.id} className="px-2 py-1.5 text-center text-tiny font-semibold text-muted-foreground">{d.short}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={cn('border-b border-border last:border-foreground/70', r.ours && 'bg-muted/40')}>
                <td className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{r.label}</td>
                {r.cells.map((c, i) => <td key={i} className="whitespace-nowrap px-2 py-1.5 text-center"><MapCell c={c} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Small className="mt-1.5">
        ▲ the group’s quotes support the bull side, ▼ the bear side, ◆ both. A dash: that group is not quoted on the debate. Where the quoted
        voices agree, the view is probably in the price already; where they split, the answer is still open. The last row is not an opinion:
        it is which side the price needs to be right, from the reverse DCF.
      </Small>
    </Exhibit>
  );
}

function EvidenceQuote({ e }: { e: Debate['evidence'][number] }) {
  const link = linkOf({ letterId: e.letterId, url: e.url } as any);
  return (
    <blockquote className={cn('my-3 ml-1 border-l-[3px] py-0.5 pl-4', SIDE_RULE[e.side])}>
      <p className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{KIND_LABEL[e.kind]}</p>
      <p className="mt-1 font-serif text-[15px] italic leading-[1.6] text-foreground">“{e.quote}”</p>
      <p className="mt-1.5 text-tiny text-muted-foreground">
        — <span className="font-semibold text-foreground">{e.speaker}</span>{e.role ? `, ${e.role}` : ''} ·{' '}
        {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">{e.source}</a> : e.source}, {voiceDate(e.date)}
      </p>
      <p className="mt-1 text-tiny leading-relaxed text-muted-foreground">{e.point}</p>
    </blockquote>
  );
}

function DebateBlock({ d, a, priced, n }: { d: Debate; a: Analysis; priced: ReturnType<typeof pricedSide>; n: number }) {
  const date = nextDate(d, a);
  const side = (s: Side) => d.evidence.filter((e) => e.side === s);
  return (
    <article className="mt-7 border-t border-border pt-3">
      <p className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">Debate {n} · {d.short}</p>
      <h3 className="mb-2 mt-1 text-[18px] font-bold leading-snug tracking-[-.01em]">{d.question}</h3>
      <Para><b>Why it matters.</b> {d.why}</Para>
      <div className="grid gap-x-8 @3xl:grid-cols-2">
        {(['bull', 'bear'] as const).map((s) => (
          <div key={s}>
            <p className={cn('mt-2 text-13 font-bold', SIDE_TONE[s])}>{s === 'bull' ? 'The bull side' : 'The bear side'}</p>
            {side(s).length ? side(s).map((e, i) => <EvidenceQuote key={i} e={e} />) : <Small className="mt-2">No one quoted takes this side.</Small>}
          </div>
        ))}
      </div>
      <Para>
        <b>What our figures say</b> <span className={cn('text-tiny font-semibold uppercase', SIDE_TONE[d.ours.side])}>({d.ours.side === 'mixed' ? 'mixed' : SIDE_WORD[d.ours.side].toLowerCase()})</span>. {d.ours.text}
      </Para>
      <Para>
        <b>What the price assumes</b>{priced.side ? <span className={cn('text-tiny font-semibold uppercase', SIDE_TONE[priced.side])}> ({priced.side === 'mixed' ? 'on the consensus' : `${priced.side} side`})</span> : null}. {priced.text}
      </Para>
      <Para>
        <b>What would settle it.</b> {d.settle}{' '}
        <span className="text-muted-foreground">
          Next test: {d.next.what}{date ? `, ${fmtDate(date)}` : ''} ({d.next.basis}).
        </span>
      </Para>
    </article>
  );
}
