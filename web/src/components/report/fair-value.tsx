'use client';

/* ==========================================================================
   Fair value against the market price, under a choice of valuation model.

   The pickers drive everything below them: the chart, the tick beside the
   heading, the sentence and the assumptions table. Two pickers, because a
   relative multiple is two decisions — which multiple, and what to set it
   against — and collapsing them into one menu of eighteen entries would hide
   that the second one is a judgement call.

   The range chart underneath always shows every model that produced a
   number, because the spread between them is the honest answer to "what are
   the cash flows worth", and no single selection can state it.

   None of this touches the factor score. See `ungraded` in factors.ts.
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, isNum, money, mult, pct, price as priceFmt } from '@/lib/format';
import { MODEL_GROUPS, MODELS, DEFAULT_MODEL_ID, DEFAULT_BASIS, modelById, allFairValues } from '@/lib/valuation-models';
import type { GradedMetric } from '@/lib/factors';
import type { Analysis } from '@/lib/model';
import { ColumnChart } from '@/components/charts/charts';
import { FairValueChart, ValuationRangeChart } from '@/components/charts/diagrams';
import { Notice } from '@/components/report/ui';
import { TickIcon } from '@/components/shell/icons';

const selectCls = 'max-w-full rounded-md border border-border bg-accent px-3 py-[5px] text-tiny text-foreground hover:border-muted-foreground/40';

function fmtStep(s: any, cur: string): string {
  if (!isNum(s.value)) return 'n/a';
  if (s.kind === 'mult') return mult(s.value);
  if (s.kind === 'pct') return pct(s.value);
  // `pct` drops trailing zeros, so a 9.00% rate would print as "9%" and read
  // as rounded. A DCF is sensitive enough that both decimals always show.
  if (s.kind === 'rate') return `${dec(s.value * 100, 2)}%`;
  if (s.kind === 'years') return `${s.value} years`;
  if (s.kind === 'money') return money(s.value, { currency: cur });
  // dp:0 would collapse a 14.69b share count to "15b", which is not a share count.
  if (s.kind === 'count') return money(s.value, { currency: '', dp: 2 }).trim();
  return priceFmt(s.value, cur);
}

/** The arithmetic behind the selected model, one row per step. */
function Assumptions({ res, cur }: { res: any; cur: string }) {
  if (!res.steps?.length) return null;
  return (
    <details open className="mt-4">
      <summary className="cursor-pointer py-1 text-tiny font-semibold uppercase tracking-[.04em] text-muted-foreground marker:text-muted-foreground/60">
        Assumptions
      </summary>
      <table className="mt-2 max-w-[520px]">
        <tbody>
          {res.steps.map((s: any, i: number) => (
            <tr key={i} className={s.total ? 'font-bold text-foreground' : ''}>
              <td className={`border-border py-1.5 pr-2 text-tiny ${s.total ? 'border-t text-foreground' : 'border-b text-muted-foreground'}`}>
                <span>{s.label}</span>
                {s.note ? <span className="mt-px block text-micro text-muted-foreground/70">{s.note}</span> : null}
              </td>
              <td className={`border-border py-1.5 text-right text-tiny text-foreground tnum ${s.total ? 'border-t' : 'border-b'}`}>{fmtStep(s, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {res.note ? <p className="mt-2 max-w-[60ch] text-micro text-muted-foreground/80">{res.note}</p> : null}
    </details>
  );
}

/**
 * The free cash flow a DCF actually discounted, year by year. Bars past the
 * consensus are shaded as forecasts — the honest way to show that a ten-year
 * model runs years past anything an analyst said.
 */
function ProjectionChart({ res, cur }: { res: any; cur: string }) {
  const rows = res.projection;
  if (!rows?.length) return null;
  const invented = rows.filter((r: any) => !r.estimated).length;
  const covered = rows.length - invented;
  return (
    <div className="mt-4">
      <h4 className="mb-1 text-13 font-semibold">Free cash flow discounted</h4>
      <ColumnChart
        categories={rows.map((r: any) => String(r.year))}
        series={[{ name: 'Free cash flow', color: 'var(--primary)', values: rows.map((r: any) => r.fcff) }]}
        height={220}
        valueFmt={(v) => money(v, { currency: cur })}
        forecastFrom={invented ? covered : null}
        legend={false}
      />
      <p className="mt-2 max-w-[60ch] text-micro text-muted-foreground/80">
        {invented
          ? `${covered} years from analyst consensus, used as published. The shaded ${invented} run past it.`
          : `All ${covered} years from analyst consensus, used as published.`}
      </p>
    </div>
  );
}

/** Every model that produced a number, on one axis. The basis moves six of the dots. */
function RangeBlock({ a, cur, basis }: { a: Analysis; cur: string; basis: string }) {
  const rows = React.useMemo(() => allFairValues(a, { basis }), [a, basis]);
  const p = a.facts.price;
  let caption: string;
  if (!rows.length) caption = 'No model produced a fair value for this company.';
  else {
    const lo = rows[0];
    const hi = rows[rows.length - 1];
    const under = rows.filter((r: any) => r.value > p).length;
    caption = `${rows.length} of ${MODELS.length} models produced a value, from ${priceFmt(lo.value, cur)} (${lo.full}) to `
      + `${priceFmt(hi.value, cur)} (${hi.full}). `
      + (under === 0 ? 'None of them puts it above the market price.'
        : under === rows.length ? 'All of them put it above the market price.'
          : `${under} of ${rows.length} put it above the market price.`);
  }
  return (
    <div className="mt-6 border-t border-border pt-4">
      <h4 className="mb-1 text-13 font-semibold">Every model, side by side</h4>
      <p className="max-w-[74ch] text-tiny leading-relaxed text-muted-foreground">{caption}</p>
      <div className="mb-2 mt-3"><ValuationRangeChart rows={rows} current={p} currency={cur} /></div>
    </div>
  );
}

export function FairValuePanel({ a, m }: { a: Analysis; m: GradedMetric }) {
  const cur = curSymbol(a.facts.currency);
  const p = a.facts.price;
  const [modelId, setModelId] = React.useState<string>(DEFAULT_MODEL_ID);
  /* The reader's own basis wins wherever the chosen multiple offers it, and
     survives a detour through one that does not; the fallback applies to the
     model that needs it and no further. */
  const [pinned, setPinned] = React.useState<string | null>(null);

  const model: any = modelById(modelId);
  const opts: any[] = model.relative ? model.bases(a) : [];
  const ok = (id: string | null) => !!id && opts.some((b) => b.id === id && b.available);
  const want = pinned && ok(pinned) ? pinned : DEFAULT_BASIS;
  const basis: string = !model.relative ? (pinned && ok(pinned) ? pinned : DEFAULT_BASIS)
    : ok(want) ? want : (opts.find((b) => b.available)?.id || DEFAULT_BASIS);

  let res: any = null;
  try { res = model.fairValue(a, { basis }); } catch { res = null; }
  const fair = res && isNum(res.value) ? res.value : null;

  // The tick follows the selected model: undervalued passes, overvalued fails.
  const state = fair == null ? 'na' : fair > p ? 'pass' : 'fail';
  const tickTitle = fair == null ? 'This model has no value to compare against'
    : state === 'pass' ? 'Trades below this model’s fair value' : 'Trades above this model’s fair value';

  let why: string;
  let body: React.ReactNode;
  if (fair == null) {
    // Three ways to have no number, and they are not the same thing: the model
    // is unbuilt, the basis has no sample, or the company's own figure makes
    // the multiple meaningless. Each gets its own sentence.
    const blocked = res?.blocked || 'No target multiple is available on this basis for this company.';
    why = `${model.basis} ${blocked}`;
    body = <Notice><b>{model.label}</b> cannot value {a.facts.symbol}. {blocked}</Notice>;
  } else {
    // Measured against fair value, not price — the denominator the chart's own
    // "overvalued" figure uses, so the two agree.
    const gap = fair > 0 ? 1 - p / fair : null;
    const from = res.basisLabel
      ? ` Its target ${model.short} of ${mult(res.target)} is the ${res.basisLabel}${isNum(res.n) ? ` of ${res.n} companies.` : '.'}`
      : '';
    why = isNum(gap)
      ? `${a.facts.symbol} trades at ${priceFmt(p, cur)}, ${pct(Math.abs(gap))} ${gap > 0 ? 'below' : 'above'} the `
        + `${priceFmt(fair, cur)} this model puts on it. ${model.basis}${from}`
      : model.basis;
    body = <FairValueChart current={p} fair={fair} currency={cur} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 max-sm:gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <TickIcon kind={state} title={tickTitle}
            className={state === 'pass' ? 'size-3.5 text-up' : state === 'fail' ? 'size-3.5 text-down' : 'size-3.5 text-muted-foreground/60'} />
          <span>{m.label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          <select aria-label="Valuation model" className={selectCls} value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {MODEL_GROUPS.map((g: any) => (
              <optgroup key={g.label} label={g.label}>
                {g.models.map((mo: any) => <option key={mo.id} value={mo.id}>{mo.label}</option>)}
              </optgroup>
            ))}
          </select>
          {model.relative ? (
            <label className="inline-flex items-center gap-2 max-sm:w-full">
              <span className="text-tiny text-muted-foreground">against</span>
              <select aria-label="Target multiple basis" className={`${selectCls} max-sm:flex-1`} value={basis}
                onChange={(e) => setPinned(e.target.value)}>
                {opts.map((b) => (
                  <option key={b.id} value={b.id} disabled={!b.available} title={b.why}>
                    {b.available ? `${b.label} · ${mult(b.target)}` : `${b.label} — unavailable`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
      <p className="mt-1.5 text-tiny leading-relaxed text-muted-foreground">{why}</p>
      <div className="mb-2 mt-3">{body}</div>
      {fair != null ? (<><Assumptions res={res} cur={cur} /><ProjectionChart res={res} cur={cur} /></>) : null}
      <RangeBlock a={a} cur={cur} basis={basis} />
    </div>
  );
}
