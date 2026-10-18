'use client';

/* The Research tab's "Management's Record": each quarter's guidance against
   what was delivered, and what the proxy says management is paid to do.
   Records in `lib/guidance.ts`, read from the calls and the DEF 14A. */

import * as React from 'react';
import { fmtDate, isNum, pct } from '@/lib/format';
import { guideSummary, guidanceFor, marginForVerdict, payFor, verdictOf, vsMidpoint, type GuideRecord, type Range, type Verdict } from '@/lib/guidance';
import { loadLedger, type Ledger } from '@/lib/street-view';
import type { Analysis } from '@/lib/model';
import { cn } from '@/lib/cn';
import { DocTable, Exhibit, Para, Section, Small, type Narrative } from './doc';
import { shortName } from './implied-section';

const bn = (v: number) => `US$${v.toFixed(1)} billion`;
const rangeText = (g: GuideRecord, r: Range) => (g.revenueKind === 'growth'
  ? (r.words ? `${r.words} (${pct(r.low, { dp: 0 })}–${pct(r.high, { dp: 0 })}, our reading)` : `${pct(r.low, { dp: 0 })}–${pct(r.high, { dp: 0 })}`)
  : `${bn((r.low + r.high) / 2)} ± 2%`);
const marginText = (r: Range | null) => (r ? `${pct(r.low)}–${pct(r.high)}` : '—');
const VERDICT_WORD: Record<Verdict, string> = { above: 'Above', within: 'Within', below: 'Below' };
const VERDICT_TONE: Record<Verdict, string> = { above: 'text-up', within: 'text-muted-foreground', below: 'text-down' };

/** The consensus for the quarter still pending, from the earnings calendar the page carries or the ledger's reported rows. */
function pendingConsensus(a: Analysis, ledger: Ledger | null): { date: string; revenue: number } | null {
  const rows: any[] = (() => {
    const own = a.ds.get('earnings');
    if (Array.isArray(own) && own.length) return own;
    const rep = ledger?.reported?.[a.facts.symbol];
    return rep && typeof rep === 'object' ? rep.rows : [];
  })();
  const next = rows.filter((r) => !isNum(r.epsActual) && isNum(r.revenueEstimated)).sort((x, y) => x.date.localeCompare(y.date))[0];
  return next ? { date: next.date, revenue: next.revenueEstimated / 1e9 } : null;
}

export function guidanceProse(list: GuideRecord[], name: string, consensus: { date: string; revenue: number } | null): string[] {
  const s = guideSummary(list);
  if (!s) return [];
  const out: string[] = [];
  const mid = s.kind === 'growth' ? `${(Math.abs(s.medianVsMid ?? 0) * 100).toFixed(1)} points of growth` : pct(Math.abs(s.medianVsMid ?? 0));
  out.push(
    `In the ${s.resolved} quarters with results on record, ${name}’s revenue landed above the top of its own guidance ${s.revenue.above} time${s.revenue.above === 1 ? '' : 's'}, within it ${s.revenue.within} and below it ${s.revenue.below}; `
    + `gross margin, without the one-offs the company named, landed above the range ${s.margin.above} time${s.margin.above === 1 ? '' : 's'}, within it ${s.margin.within} and below it ${s.margin.below}. `
    + (isNum(s.medianVsMid) ? `The typical result came in ${mid} ${s.medianVsMid >= 0 ? 'above' : 'below'} the middle of the range. ` : '')
    + (s.revenue.below === 0 && s.revenue.above >= Math.ceil(s.resolved / 2)
      ? 'This is a management that guides conservatively, and the next guide is best read with that habit in mind.'
      : s.revenue.below > 0 ? 'The record has misses in it, so the guide is not a floor.' : ''),
  );
  const p = s.pending;
  if (p && consensus) {
    if (p.revenueKind === 'level') {
      const m = (p.revenue.low + p.revenue.high) / 2;
      const gap = consensus.revenue / m - 1;
      out.push(
        `For ${p.quarter} the company guided ${bn(m)}, plus or minus 2%. The consensus, ${bn(consensus.revenue)}, sits ${pct(Math.abs(gap))} ${gap >= 0 ? 'above' : 'below'} that midpoint`
        + (isNum(s.medianVsMid) ? `, against a typical result ${pct(s.medianVsMid)} above it: a beat of the usual size would put revenue near ${bn(m * (1 + s.medianVsMid))}, which the consensus does not assume.` : '.'),
      );
    } else if (isNum(p.base)) {
      const g = consensus.revenue / p.base - 1;
      out.push(
        `For the ${p.quarter} the company guided growth of ${rangeText(p, p.revenue)}. The consensus, ${bn(consensus.revenue)}, is ${pct(g)} growth on the same quarter a year earlier: `
        + (g > p.revenue.high ? 'above the top of the range, so the Street already counts on a beat.' : g >= (p.revenue.low + p.revenue.high) / 2 ? 'in the upper half of the range, so the Street already counts on the habit continuing.' : 'in the lower half of the range.'),
      );
    }
  }
  return out;
}

export function payProse(symbol: string, name: string): string[] {
  const p = payFor(symbol);
  if (!p) return [];
  const lines = p.goals.map((g) => {
    const vsPrior = isNum(g.priorYear) ? g.target / g.priorYear - 1 : null;
    return `${g.metric}: target ${bn(g.target)}${isNum(vsPrior) ? ` (${Math.abs(vsPrior) < 0.005 ? 'the prior year’s figure' : `${pct(Math.abs(vsPrior))} ${vsPrior > 0 ? 'above' : 'below'} the prior year’s ${bn(g.priorYear!)}`})` : ''}, achieved ${bn(g.actual!)}`;
  });
  const easy = p.goals.filter((g) => isNum(g.priorYear) && g.target <= g.priorYear * 1.01).length;
  return [
    `What ${name}’s executives are paid to deliver, from the ${p.source}: for ${p.year}, ${lines.join('; ')}. Every goal paid at its maximum. `
    + (easy ? `${easy === p.goals.length ? 'Each' : 'At least one'} target sat at or below the previous year’s result, so the annual award paid its target for standing still; the incentive to grow faster than that sits in the long-term awards. ` : '')
    + p.longTerm,
  ];
}

export function ManagementSection({ a, nar, ex }: { a: Analysis; nar: Narrative; ex: number }) {
  const sym = a.facts.symbol;
  const list = guidanceFor(sym);
  const pay = payFor(sym);
  const [ledger, setLedger] = React.useState<Ledger | null>(null);
  React.useEffect(() => { let live = true; loadLedger().then((l) => { if (live) setLedger(l); }); return () => { live = false; }; }, []);
  if (!list.length && !pay) return null;
  const consensus = pendingConsensus(a, ledger);
  const name = shortName(a.facts);
  return (
    <Section id="rsr-mgmt" title="Management’s Record" a={a} nar={nar} signed={false}>
      {guidanceProse(list, name, consensus).map((p, i) => <Para key={i}>{p}</Para>)}
      {list.length ? (
        <Exhibit n={ex} title="Guidance given on each call, against the result reported a quarter later"
          source={`${name}’s earnings calls (outlook and results as stated) and filed quarterly revenue; Maz Vantage.`}>
          <DocTable first="Quarter" head={['Guided', 'Revenue guide', 'Result', '', 'Margin guide', 'Result', '']} rows={list.map((g) => {
            const rv = verdictOf(g.revenueActual, g.revenue);
            const mv = verdictOf(marginForVerdict(g), g.margin);
            const vm = vsMidpoint(g);
            return [
              <span key="q" className="block min-w-[9rem] whitespace-normal">{g.quarter}{g.marginNote ? <span className="block text-tiny text-muted-foreground">{g.marginNote}</span> : null}</span>,
              fmtDate(g.guidedOn),
              <span key="r" className="block min-w-[8rem] whitespace-normal">{rangeText(g, g.revenue)}</span>,
              isNum(g.revenueActual) ? (g.revenueKind === 'growth' ? pct(g.revenueActual, { sign: true }) : bn(g.revenueActual)) : 'pending',
              rv ? <span key="v" className={cn('font-semibold', VERDICT_TONE[rv])}>{VERDICT_WORD[rv]}{isNum(vm) ? ` (${g.revenueKind === 'growth' ? `${vm >= 0 ? '+' : ''}${(vm * 100).toFixed(1)} pts` : pct(vm, { sign: true })} vs mid)` : ''}</span> : '—',
              marginText(g.margin),
              isNum(g.marginActual) ? (isNum(g.marginUnderlying) ? `${pct(g.marginActual)} (${pct(g.marginUnderlying)} underlying)` : pct(g.marginActual)) : 'pending',
              mv ? <span key="m" className={cn('font-semibold', VERDICT_TONE[mv])}>{VERDICT_WORD[mv]}</span> : '—',
            ];
          })} />
          <Small className="mt-1.5">
            Revenue results are the filed quarters; margins are as reported on the following call, on the basis the company guides
            {sym === 'NVDA' ? ' (non-GAAP)' : ''}. Where a guide is in words, the band is our reading of them.
          </Small>
        </Exhibit>
      ) : null}
      {pay ? (
        <>
          {payProse(sym, name).map((p, i) => <Para key={`p${i}`}>{p}</Para>)}
          <Exhibit n={ex + 1} title={`What the annual awards paid for, ${pay.year}`}
            source="the company’s proxy statement, as filed; prior-year figures from its filings; Maz Vantage.">
            <DocTable first="Goal" head={['Threshold', 'Target', 'Maximum', 'Achieved', 'Prior year', 'Payout']} rows={pay.goals.map((g) => [
              <span key="g" className="block min-w-[10rem] whitespace-normal">{g.metric}<span className="block text-tiny text-muted-foreground">{g.plan}{g.note ? `. ${g.note}` : ''}</span></span>,
              isNum(g.threshold) ? bn(g.threshold) : '—', <b key="t">{bn(g.target)}</b>, isNum(g.maximum) ? bn(g.maximum) : '—',
              isNum(g.actual) ? bn(g.actual) : '—', isNum(g.priorYear) ? bn(g.priorYear) : '—',
              <span key="p" className="block min-w-[8rem] whitespace-normal">{g.payout}</span>,
            ])} />
            <Small className="mt-1.5">
              Goals and results as the proxy states them (<a href={pay.url} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">{pay.source}, filed {fmtDate(pay.filed)}</a>);
              the prior-year column is the filed figure for the year before, added by us.
            </Small>
          </Exhibit>
        </>
      ) : null}
    </Section>
  );
}
