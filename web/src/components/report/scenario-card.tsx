'use client';

/* ==========================================================================
   Maz Vantage — Bull Case / Bear Case (Research tab)

   Three fair values side by side — the low, consensus and high end of the
   analysts' revenue range, each run through the report's six DCFs — with what
   has to be true for each, the Street's own targets beside them as a second
   read, and one strip that puts all of it against the price. The model is in
   `lib/scenarios.ts`; this file lays it out.
   ========================================================================== */

import * as React from 'react';
import { clamp, curSymbol, isNum, money, pct, price } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { buildScenarios, type CaseKey, type CaseResult } from '@/lib/scenarios';
import { DataTable, Notice, OCard, OHead, Pill } from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { cn } from '@/lib/cn';

const CASES: { key: CaseKey; title: string; bar: string; text: string }[] = [
  { key: 'bear', title: 'Bear case', bar: 'border-down', text: 'text-down' },
  { key: 'base', title: 'Consensus', bar: 'border-grade-mid', text: 'text-foreground' },
  { key: 'bull', title: 'Bull case', bar: 'border-up', text: 'text-up' },
];

const PATH: Record<CaseKey, string> = {
  bear: 'Every forecast year at the lowest revenue any analyst published.',
  base: 'Every forecast year at the consensus revenue — the path the report’s own DCFs use.',
  bull: 'Every forecast year at the highest revenue any analyst published.',
};

function CaseColumn({ c, t, cur, target, analysts }: {
  c: CaseResult; t: (typeof CASES)[number]; cur: string; target: number | null; analysts: number | null;
}) {
  return (
    <div className={cn('grid content-start gap-3 rounded-[10px] border-t-[3px] bg-muted p-4', t.bar)}>
      <p className={cn('text-13 font-bold', t.text)}>{t.title}</p>
      <div>
        <div className="text-2xl font-bold tracking-[-.02em] tnum">{isNum(c.value) ? price(c.value, cur) : 'n/a'}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-tiny text-muted-foreground">
          <span>median of {c.perModel.filter((m) => isNum(m.value)).length} DCFs</span>
          {isNum(c.upside) ? <Pill tone={c.upside >= 0 ? 'good' : 'bad'}>{pct(c.upside, { sign: true })} vs price</Pill> : null}
        </div>
      </div>
      <div className="text-13 leading-relaxed">
        <p className="mb-1 font-semibold">What has to be true</p>
        <p className="text-muted-foreground">{PATH[t.key]}{t.key !== 'base' && isNum(analysts) ? ` ${analysts} analysts publish a figure for the nearest year.` : ''}</p>
        <ul className="mt-2 grid gap-1 tnum">
          <li>
            Revenue FY{c.fromYear ?? '—'} → FY{c.toYear ?? '—'}: <b>{money(c.revenueFrom)} → {money(c.revenueTo)}</b>
            {isNum(c.growth) ? <span className="text-muted-foreground"> ({pct(c.growth)} a year)</span> : null}
          </li>
          <li>Operating margin: <b>consensus, each year</b></li>
          <li>EPS FY{c.epsYear ?? '—'}: <b>{isNum(c.eps) ? price(c.eps, cur) : 'n/a'}</b>{t.key === 'base' ? <span className="text-muted-foreground"> (average)</span> : <span className="text-muted-foreground"> ({t.key === 'bear' ? 'low' : 'high'} estimate)</span>}</li>
        </ul>
      </div>
      <div className="border-t border-border pt-2 text-13">
        <span className="text-muted-foreground">Street target, {t.key === 'bear' ? 'lowest' : t.key === 'bull' ? 'highest' : 'consensus'}: </span>
        <b className="tnum">{isNum(target) ? price(target, cur) : 'n/a'}</b>
      </div>
    </div>
  );
}

/** Every figure on one axis: the three cases, the Street's range, and the price. */
function RangeStrip({ cases, targets, px, cur }: {
  cases: Record<CaseKey, CaseResult>; targets: { low: number | null; consensus: number | null; high: number | null }; px: number | null; cur: string;
}) {
  const vals = [cases.bear.value, cases.base.value, cases.bull.value, targets.low, targets.high, px].filter(isNum);
  if (vals.length < 3) return null;
  const lo = Math.min(...vals) * 0.92;
  const hi = Math.max(...vals) * 1.05;
  const at = (v: number) => `${clamp(((v - lo) / (hi - lo)) * 100, 0, 100)}%`;
  const case_ = (k: CaseKey, cls: string) => (isNum(cases[k].value) ? (
    <span className={cn('absolute top-[9px] size-3 -translate-x-1/2 rounded-full ring-2 ring-background', cls)} style={{ left: at(cases[k].value!) }}
      title={`${CASES.find((c) => c.key === k)!.title}: ${price(cases[k].value, cur)}`} />
  ) : null);
  return (
    <div className="mt-5">
      <OSub info="The DCF cases are dots; the Street’s lowest-to-highest price target is the bar; the vertical line is the current price.">Against the price</OSub>
      <div className="relative mt-2 h-[30px]">
        <div className="absolute inset-x-0 top-[14px] h-0.5 bg-border" />
        {isNum(targets.low) && isNum(targets.high) ? (
          <div className="absolute top-[11px] h-2 rounded bg-chart-1/35" style={{ left: at(targets.low), width: `calc(${at(targets.high)} - ${at(targets.low)})` }}
            title={`Street targets ${price(targets.low, cur)} – ${price(targets.high, cur)}`} />
        ) : null}
        {case_('bear', 'bg-down')}
        {case_('base', 'bg-grade-mid')}
        {case_('bull', 'bg-up')}
        {isNum(px) ? <span className="absolute top-0 h-[30px] w-0.5 -translate-x-1/2 bg-foreground" style={{ left: at(px) }} title={`Price ${price(px, cur)}`} /> : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-micro text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-down" />Bear {price(cases.bear.value, cur)}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-grade-mid" />Consensus {price(cases.base.value, cur)}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-up" />Bull {price(cases.bull.value, cur)}</span>
        {isNum(targets.low) && isNum(targets.high) ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-chart-1/35" />Street {price(targets.low, cur)} – {price(targets.high, cur)}</span> : null}
        {isNum(px) ? <span className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 bg-foreground" />Price {price(px, cur)}</span> : null}
      </div>
    </div>
  );
}

/** One sentence on where the price sits against the cases — the reading the strip is for. */
function reading(cases: Record<CaseKey, CaseResult>, px: number | null, cur: string) {
  const [b, m, u] = [cases.bear.value, cases.base.value, cases.bull.value];
  if (!isNum(px) || !isNum(b) || !isNum(u)) return null;
  if (px > u) {
    return `The price is above even the bull case: at consensus margins, the highest revenue any analyst publishes is worth ${price(u, cur)} a share on these models. What the market is paying for is something these cases hold fixed — wider margins, a lower discount rate, or growth that outlasts the estimates.`;
  }
  if (px < b) {
    return `The price is below even the bear case: the lowest revenue any analyst publishes is still worth ${price(b, cur)} a share at consensus margins. The market is pricing in something worse than the estimates show — a margin squeeze, a higher discount rate, or revenue below every published figure.`;
  }
  return `The price sits inside the range: ${px >= (m ?? px) ? 'between the consensus and the bull case' : 'between the bear case and the consensus'}, so the shares are priced for revenue ${px >= (m ?? px) ? 'above' : 'below'} the consensus path at today’s margins.`;
}

export function ScenarioCard({ a }: { a: Analysis }) {
  const s = React.useMemo(() => buildScenarios(a), [a]);
  const cur = curSymbol(a.facts.currency);
  const px = isNum(a.facts.price) ? a.facts.price : null;
  const head = (
    <OHead title="Bull Case / Bear Case"
      info="Fair values at the low and high end of the analysts’ revenue range, run through the same six discounted cash flow models as the consensus. A range of published outcomes, not anyone’s forecast, and like every fair value here it never reaches a grade." />
  );
  if (!s.available || !s.cases) {
    return (
      <OCard span={12} id="rsr-cases">
        {head}
        <Notice>{s.why}</Notice>
      </OCard>
    );
  }
  const targetFor: Record<CaseKey, number | null> = { bear: s.targets.low, base: s.targets.consensus, bull: s.targets.high };
  const line = reading(s.cases, px, cur);
  const spread = isNum(s.cases.bull.value) && isNum(s.cases.bear.value) && isNum(s.cases.base.value) && s.cases.base.value > 0
    ? (s.cases.bull.value - s.cases.bear.value) / s.cases.base.value : null;

  return (
    <OCard span={12} id="rsr-cases">
      {head}
      {line ? <p className="mb-4 max-w-[80ch] text-sm leading-relaxed">{line}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        {CASES.map((t) => <CaseColumn key={t.key} c={s.cases![t.key]} t={t} cur={cur} target={targetFor[t.key]} analysts={s.analysts} />)}
      </div>
      <RangeStrip cases={s.cases} targets={s.targets} px={px} cur={cur} />

      <details className="mt-5 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer text-13 font-semibold text-primary hover:underline">Each model, each case</summary>
        <div className="mt-3">
          <DataTable dense exportName="bull bear case by model"
            headers={['Model', { label: 'Bear', num: true }, { label: 'Consensus', num: true }, { label: 'Bull', num: true }]}
            rows={s.cases.base.perModel.map((m, i) => [
              m.label,
              price(s.cases!.bear.perModel[i].value, cur),
              price(m.value, cur),
              price(s.cases!.bull.perModel[i].value, cur),
            ])} />
        </div>
      </details>

      <ul className="mt-4 grid max-w-[90ch] list-disc gap-1 pl-5 text-tiny leading-relaxed text-muted-foreground">
        <li>
          <b>Not anyone’s forecast.</b> The lowest figure for one year and the lowest for the next can come from different analysts,
          so the bear path is gloomier than any single analyst’s and the bull path brighter.
        </li>
        <li>
          <b>Revenue moves, margins do not.</b> Operating profit is scaled with revenue, so each year keeps the consensus margin. The estimates
          publish no range for margins, and a case that flexed them would be inventing one.
          {isNum(spread) ? ` On revenue alone the cases span ${pct(spread)} of the consensus value.` : ''}
        </li>
        <li>
          <b>Everything else is the consensus DCF’s:</b> the discount rate, the terminal assumptions, capex and depreciation intensity, and the
          years past the last estimate. The Street targets beside each case are the analysts’ own, a second read on the same question.
        </li>
        <li>The headline fair value above is the median of all thirteen models, multiples included, so it need not equal the consensus case here.</li>
      </ul>
    </OCard>
  );
}
