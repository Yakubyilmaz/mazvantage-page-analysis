'use client';

/* The Fair Value section's sensitivity: the ten-year perpetuity model on
   the consensus path with its inputs moved, as a discount-rate against
   terminal-growth grid, a tornado of one input at a time, and the three
   cases weighted. Arithmetic in `lib/implied-expectations.ts`. */

import * as React from 'react';
import { curSymbol, isNum, pct, price } from '@/lib/format';
import { CASE_WEIGHTS, sensitivity, weightedValue, type Sensitivity } from '@/lib/implied-expectations';
import { buildScenarios } from '@/lib/scenarios';
import type { Analysis } from '@/lib/model';
import { cn } from '@/lib/cn';
import { Exhibit, Para, Small } from './doc';
import { useImplied } from './implied-section';

/** The sentences: which inputs matter most, whether any tested shift reaches the price, and the weighted cases. */
export function sensitivityProse(s: Sensitivity, px: number | null, weighted: number | null, cur: string): string[] {
  const out: string[] = [];
  if (!isNum(s.base)) return out;
  const [first, second] = s.tornado;
  out.push(
    `The ten-year perpetuity model puts the consensus cash flows at ${price(s.base, cur)} a share. Moved one at a time, `
    + `${first.label.toLowerCase()} and ${second.label.toLowerCase()} matter most: ${first.step} on the ${first.label.toLowerCase()} moves the value between `
    + `${price(first.low, cur)} and ${price(first.high, cur)}, and ${second.step} on ${second.label.toLowerCase()} between ${price(second.low, cur)} and ${price(second.high, cur)}. `
    + `${s.tornado[s.tornado.length - 2].label} and ${s.tornado[s.tornado.length - 1].label.toLowerCase()} matter least.`,
  );
  if (isNum(px)) {
    const cells = s.grid.flatMap((row, i) => row.map((v, j) => ({ v, rate: s.rates[i], g: s.growths[j] })));
    const reach = cells.filter((c) => isNum(c.v) && c.v >= px);
    const tornadoReach = s.tornado.filter((t) => isNum(t.high) && t.high >= px);
    out.push(
      reach.length
        ? `In the grid, the ${price(px, cur)} price is reached only where the discount rate is ${pct(Math.max(...reach.map((c) => c.rate)))} or lower with terminal growth of at least ${pct(Math.min(...reach.map((c) => c.g)))}: `
          + `${reach.length} of the ${cells.length} pairs tested. ${tornadoReach.length ? '' : 'No single input moved by the amounts above reaches it on its own.'}`
        : `None of the ${cells.length} pairs of discount rate and terminal growth tested reaches the ${price(px, cur)} price, and ${tornadoReach.length ? 'only' : 'no'} single input moved by the amounts above ${tornadoReach.length ? `(${tornadoReach.map((t) => t.label.toLowerCase()).join(', ')}) does` : 'does either'}. `
          + 'The gap is not one assumption away: it needs the growth or the margin the previous section solved for.',
    );
  }
  if (isNum(weighted)) {
    out.push(
      `Weighting the bear, consensus and bull cases a quarter, a half and a quarter (a convention, not a forecast of the odds) gives ${price(weighted, cur)} a share`
      + (isNum(px) ? `, ${pct(Math.abs(weighted / px - 1))} ${weighted < px ? 'below' : 'above'} the price.` : '.'),
    );
  }
  return out;
}

export function SensitivityBlock({ a, ex }: { a: Analysis; ex: number }) {
  const im = useImplied(a);
  const s = React.useMemo(() => (im.available ? sensitivity(im.inputs) : null), [im]);
  const sc = React.useMemo(() => buildScenarios(a), [a]);
  if (!s || !isNum(s.base)) return null;
  const cur = curSymbol(a.facts.currency);
  const px = isNum(a.facts.price) ? a.facts.price : null;
  const weighted = sc.available ? weightedValue(sc.cases as any) : null;
  const paras = sensitivityProse(s, px, weighted, cur);
  const span = Math.max(...s.tornado.map((t) => (isNum(t.high) ? t.high : 0)), px ?? 0) - Math.min(...s.tornado.map((t) => (isNum(t.low) ? t.low : Infinity)));
  const lo = Math.min(...s.tornado.map((t) => (isNum(t.low) ? t.low : Infinity)));
  const at = (v: number) => `${((v - lo) / span) * 100}%`;
  return (
    <>
      <h3 className="mb-2 mt-6 text-[15px] font-bold">How sensitive the estimate is</h3>
      {paras.map((p, i) => <Para key={i}>{p}</Para>)}
      <Exhibit n={ex} title="What moves the value most: one input at a time"
        source="Maz Vantage ten-year perpetuity DCF on the consensus path; each bar moves one input by the step shown and holds the rest.">
        <div className="grid gap-2 py-1 text-13">
          {s.tornado.map((t) => (
            <div key={t.key} className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3 @xl:grid-cols-[150px_minmax(0,1fr)_180px]">
              <span className="font-medium">{t.label} <span className="block text-tiny font-normal text-muted-foreground">{t.step}</span></span>
              <div className="relative h-4 rounded-sm bg-muted/40">
                {isNum(t.low) && isNum(t.high) ? (
                  <i className="absolute inset-y-0 rounded-sm bg-primary/70" style={{ left: at(t.low), width: `${((t.high - t.low) / span) * 100}%` }} />
                ) : null}
                <i className="absolute inset-y-[-3px] w-px bg-foreground" style={{ left: at(s.base!) }} title="Consensus value" />
                {isNum(px) ? <i className="absolute inset-y-[-3px] w-0.5 bg-down" style={{ left: at(px) }} title="Price" /> : null}
              </div>
              <span className="hidden text-right tnum text-muted-foreground @xl:block">{price(t.low, cur)} – {price(t.high, cur)}</span>
            </div>
          ))}
        </div>
        <Small className="mt-1.5">
          The thin black line is the consensus value, {price(s.base, cur)}; {isNum(px) ? `the red line is the price, ${price(px, cur)}.` : ''}
        </Small>
      </Exhibit>
      <Exhibit n={ex + 1} title="Value per share by discount rate and terminal growth"
        source="Maz Vantage ten-year perpetuity DCF on the consensus path.">
        <div className="scroll-none overflow-x-auto">
          <table className="w-full border-collapse text-13 tnum">
            <thead>
              <tr className="border-b border-foreground/70">
                <th className="px-2 py-1.5 text-left text-tiny font-semibold text-muted-foreground">Discount rate ↓ · terminal growth →</th>
                {s.growths.map((g, j) => <th key={j} className={cn('px-2 py-1.5 text-right text-tiny font-semibold text-muted-foreground', j === 2 && 'text-foreground')}>{pct(g)}</th>)}
              </tr>
            </thead>
            <tbody>
              {s.rates.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-foreground/70">
                  <td className={cn('px-2 py-1.5 text-left', i === 2 && 'font-semibold')}>{pct(r)}</td>
                  {s.grid[i].map((v, j) => (
                    <td key={j} className={cn('px-2 py-1.5 text-right', isNum(v) && isNum(px) && v >= px && 'bg-up/10 font-semibold', i === 2 && j === 2 && 'outline outline-1 outline-foreground')}>
                      {isNum(v) ? price(v, cur) : 'n/a'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Small className="mt-1.5">The outlined cell is the model as run; shaded cells are worth at least today’s price.</Small>
      </Exhibit>
      {isNum(weighted) ? (
        <Small>
          Weights: bear {pct(CASE_WEIGHTS.bear, { dp: 0 })}, consensus {pct(CASE_WEIGHTS.base, { dp: 0 })}, bull {pct(CASE_WEIGHTS.bull, { dp: 0 })}, on the
          three cases in the table above. Like every fair value here, none of it reaches the quant rating.
        </Small>
      ) : null}
    </>
  );
}
