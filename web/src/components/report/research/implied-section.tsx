'use client';

/* The Research tab's "What the Price Implies": the reverse DCF in
   `lib/implied-expectations.ts`, set as prose, a comparison table and a
   growth-against-margin grid with today's price marked. */

import * as React from 'react';
import { curSymbol, isNum, pct, price } from '@/lib/format';
import { HORIZON, impliedExpectations, impliedProse, type Implied } from '@/lib/implied-expectations';
import type { Analysis } from '@/lib/model';
import { cn } from '@/lib/cn';
import { DocTable, Exhibit, Para, Section, Small, type Narrative } from './doc';

export const shortName = (f: any) => String(f?.name || f?.symbol || '')
  .replace(/,? (Inc|Corp|Corporation|Company|Co|Ltd|Limited|plc|PLC|SA|NV|AG|Holdings?)\.?$/i, '').trim() || f?.symbol;

export function useImplied(a: Analysis) {
  return React.useMemo(() => impliedExpectations(a), [a]);
}

export function ImpliedSection({ a, nar, ex }: { a: Analysis; nar: Narrative; ex: number }) {
  const im = useImplied(a);
  const cur = curSymbol(a.facts.currency);
  if (!im.available) {
    return (
      <Section id="rsr-implied" title="What the Price Implies" a={a} nar={nar} signed={false}>
        <Small>{im.why}</Small>
      </Section>
    );
  }
  const paras = impliedProse(im, shortName(a.facts), cur);
  return (
    <Section id="rsr-implied" title="What the Price Implies" a={a} nar={nar} signed={false}>
      {paras.map((p, i) => <Para key={i}>{p}</Para>)}
      <ImpliedTable im={im} ex={ex} />
      <ImpliedGrid im={im} ex={ex + 1} cur={cur} />
    </Section>
  );
}

const cell = (v: number | null | undefined, bold = false) =>
  (isNum(v) ? (bold ? <b>{pct(v)}</b> : pct(v)) : 'n/a');

function ImpliedTable({ im, ex }: { im: Implied; ex: number }) {
  const i = im.inputs;
  const L = ({ children }: { children: React.ReactNode }) => <span className="block min-w-[11rem] whitespace-normal">{children}</span>;
  const W = ({ children }: { children: React.ReactNode }) => <span className="block min-w-[7rem] whitespace-normal">{children}</span>;
  const sub = (t: string) => <span className="block text-tiny text-muted-foreground">{t}</span>;
  const rows: React.ReactNode[][] = [
    [<L key="l">Revenue growth a year</L>, cell(im.growth, true), cell(im.consensusGrowth),
      im.publishedSpan ? <W key="p">{cell(im.publishedGrowth)}{sub(im.publishedSpan)}</W> : 'n/a',
      im.history5 ? <W key="h">{pct(im.history5.rate)}{sub(`FY${im.history5.from}–FY${im.history5.to}`)}</W> : 'n/a'],
    [<L key="l">Operating margin</L>, cell(im.margin, true), <W key="c">{pct(im.consensusMargin)}{sub(`FY${i.marginYear}`)}</W>, '—',
      isNum(im.filedMargins.peak)
        ? <W key="m">{pct(im.filedMargins.latest)} latest{sub(im.filedMargins.latest === im.filedMargins.peak ? 'also the peak' : `peak ${pct(im.filedMargins.peak)}, FY${im.filedMargins.peakYear}`)}</W>
        : 'n/a'],
    [<L key="l">Return a year on the consensus cash flows</L>, cell(im.impliedReturn, true), <W key="w">{pct(i.wacc)}{sub('the models’ rate')}</W>, '—', '—'],
  ];
  return (
    <Exhibit n={ex} title="What the price needs, against the forecast and the record"
      source="Maz Vantage reverse discounted cash flow on the ten-year model’s inputs; consensus estimates as published; company filings.">
      <DocTable first="Solved for" head={['Price implies', 'Consensus', 'Published years', 'Filed record']} rows={rows} />
      <Small className="mt-1.5">
        Each figure in the first column is solved with every other input held where the ten-year perpetuity model puts it: {HORIZON} years from
        trailing revenue, tax at {pct(i.tax)}, capital spending at {pct(i.capexRate)} of revenue, depreciation at {pct(i.dnaRate)}, terminal
        growth {pct(i.g)}, and the net debt and share count the models use. The consensus column is that model’s own path; the published
        years are the analysts’ rows alone, before the models extend them.
      </Small>
    </Exhibit>
  );
}

/** Value per share for each growth and margin pair; cells at or above the price are shaded, the consensus margin column is outlined. */
function ImpliedGrid({ im, ex, cur }: { im: Implied; ex: number; cur: string }) {
  const { growths, margins, values } = im.grid;
  if (!growths.length || !margins.length) return null;
  const mid = margins.findIndex((m) => Math.abs(m - Math.round(im.consensusMargin * 100) / 100) < 1e-6);
  return (
    <Exhibit n={ex} title={`Value per share at each pair of ten-year revenue growth and operating margin, against ${price(im.price, cur)}`}
      source="Maz Vantage reverse discounted cash flow; every other input as in the ten-year perpetuity model.">
      <div className="scroll-none overflow-x-auto">
        <table className="w-full border-collapse text-13 tnum">
          <thead>
            <tr className="border-b border-foreground/70">
              <th className="px-2 py-1.5 text-left text-tiny font-semibold text-muted-foreground">Growth a year ↓ · margin →</th>
              {margins.map((m, j) => (
                <th key={m} className={cn('px-2 py-1.5 text-right text-tiny font-semibold text-muted-foreground', j === mid && 'text-foreground')}>
                  {pct(m, { dp: 0 })}{j === mid ? ' (consensus)' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {growths.map((g, r) => (
              <tr key={g} className="border-b border-border last:border-foreground/70">
                <td className="px-2 py-1.5 text-left">{pct(g, { dp: 0 })}</td>
                {values[r].map((v, j) => {
                  const covers = isNum(v) && v >= im.price;
                  return (
                    <td key={j} className={cn('px-2 py-1.5 text-right', covers && 'bg-up/10 font-semibold', j === mid && 'border-x border-border')}>
                      {isNum(v) ? price(v, cur) : 'n/a'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Small className="mt-1.5">
        Shaded cells are worth at least today’s price. Read across a row to see what margin a growth rate needs, or down a column to see what
        growth a margin needs. {isNum(im.consensusGrowth) ? `The consensus path grows ${pct(im.consensusGrowth)} a year; the price needs ${pct(im.growth)} at the consensus margin.` : ''}
      </Small>
    </Exhibit>
  );
}
