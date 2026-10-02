'use client';

/* ==========================================================================
   Maz Vantage — Calculators (Research → Calculators)

   Four tools that need no market data: what a plan of saving grows to, what
   reinvesting dividends adds, how many shares a stop-loss allows, and what a
   start and end value come to a year. The arithmetic is `lib/calculators.ts`;
   every convention that changes an answer is printed under the result, since
   two calculators that disagree usually differ in one of those and say so in
   neither.

   Nothing typed here leaves the browser or is stored.
   ========================================================================== */

import * as React from 'react';
import { dec, isNum, money, pct } from '@/lib/format';
import { annualisedReturn, dividendReinvestment, investmentGrowth, positionSize } from '@/lib/calculators';
import { ColumnChart, MultiLineChart } from '@/components/charts/charts';
import { ChipRail, PageFrame, useQueryState } from '@/components/pages/page-parts';
import { ResearchHero, ResearchStrip } from '@/components/research/feed-parts';
import { Notice, OBig, OCard, OHead, StatLine, StatLines } from '@/components/report/ui';
import { Input, Label, Switch } from '@/components/ui/primitives';

type CalcId = 'growth' | 'drip' | 'position' | 'return';

const CALCS: { id: CalcId; label: string; tag: string }[] = [
  { id: 'growth', label: 'Investment growth', tag: 'Savings and compounding' },
  { id: 'drip', label: 'Dividend reinvestment', tag: 'Reinvest or take cash' },
  { id: 'position', label: 'Position size', tag: 'Shares for a given stop' },
  { id: 'return', label: 'Annualised return', tag: 'Start, end and years' },
];

/* ---------- fields --------------------------------------------------------------- */

const whole = (v: number | null | undefined) => (isNum(v) ? Math.round(v).toLocaleString('en-US') : 'n/a');
const compact = (v: number) => money(v, { currency: '', dp: 1 });

/** A number field kept as the text typed, so "0." and "" are not fought over mid-edit. */
function useNumber(initial: number) {
  const [text, setText] = React.useState(String(initial));
  const value = text.trim() === '' ? NaN : Number(text);
  return { text, setText, value };
}

function Field({ id, label, f, suffix, hint, step = 'any', min }: {
  id: string; label: string; f: ReturnType<typeof useNumber>; suffix?: string; hint?: string; step?: string; min?: number;
}) {
  const bad = !Number.isFinite(f.value) || (min != null && f.value < min);
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type="number" inputMode="decimal" step={step} min={min} value={f.text} onChange={(e) => f.setText(e.target.value)}
          aria-invalid={bad || undefined} className={bad ? 'border-down' : undefined} />
        {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-tiny text-muted-foreground">{suffix}</span> : null}
      </div>
      {hint ? <span className="text-micro text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function Toggle({ id, label, on, set }: { id: string; label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={on} onCheckedChange={set} />
    </div>
  );
}

const ok = (...vals: number[]) => vals.every(Number.isFinite);
const Conventions = ({ items }: { items: string[] }) => (
  <ul className="mt-4 grid list-disc gap-1 pl-5 text-tiny leading-relaxed text-muted-foreground">{items.map((t) => <li key={t}>{t}</li>)}</ul>
);
const Fix = () => <Notice>Fill in every field with a number to see the result.</Notice>;

/* ---------- 1. growth ----------------------------------------------------------- */

function GrowthCalc() {
  const initial = useNumber(10000);
  const monthly = useNumber(500);
  const rate = useNumber(7);
  const years = useNumber(25);
  const fee = useNumber(0.5);
  const stepUp = useNumber(0);
  const [atStart, setAtStart] = React.useState(false);
  const valid = ok(initial.value, monthly.value, rate.value, years.value, fee.value, stepUp.value) && years.value > 0 && years.value <= 100;
  const g = valid ? investmentGrowth({
    initial: initial.value, monthly: monthly.value, rate: rate.value / 100, years: years.value,
    fee: fee.value / 100, atStart, stepUp: stepUp.value / 100,
  }) : null;

  return (
    <>
      <OCard span={4} id="calc-growth-in">
        <OHead title="Your plan" />
        <div className="grid gap-3">
          <Field id="g-initial" label="Starting amount" f={initial} min={0} />
          <Field id="g-monthly" label="Added each month" f={monthly} min={0} />
          <Field id="g-step" label="Monthly amount rises each year by" f={stepUp} suffix="%" hint="0 to keep it flat" />
          <Field id="g-rate" label="Annual return" f={rate} suffix="%" hint="Before fees. Nobody knows this number; try several." />
          <Field id="g-fee" label="Annual fee" f={fee} suffix="%" hint="Fund charges, platform fees" min={0} />
          <Field id="g-years" label="Years" f={years} step="1" min={1} />
          <Toggle id="g-start" label="Add at the start of each month" on={atStart} set={setAtStart} />
        </div>
      </OCard>
      <OCard span={8} id="calc-growth-out">
        <OHead title="What it grows to" />
        {g ? (
          <>
            <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
              <OBig label={`After ${Math.round(years.value)} years`} value={whole(g.final)} />
              <OBig label="You put in" value={whole(g.contributed)} />
              <OBig label="Growth" value={whole(g.growth)} note={g.contributed > 0 ? `${dec(g.final / g.contributed, 2)}× what went in` : undefined} />
            </div>
            <ColumnChart height={260} stacked valueFmt={compact} categories={g.rows.slice(1).map((r) => r.year)} series={[
              { name: 'Put in', color: 'var(--chart-1)', values: g.rows.slice(1).map((r) => r.contributed) },
              { name: 'Growth', color: 'var(--up)', values: g.rows.slice(1).map((r) => r.growth) },
            ]} />
            <StatLines split>
              <StatLine label="Return after fees" value={pct(g.netRate, { dp: 2 })} note="a year" />
              {g.feeCost > 0 ? <StatLine label="What the fee cost" value={whole(g.feeCost)} tone="neg" note="against the same plan with no fee" /> : null}
            </StatLines>
            <Conventions items={[
              'The annual return compounds monthly as (1 + r)^(1/12) − 1, so a 7% year is 7% — not the 7.23% that 7%/12 compounded twelve times gives.',
              'The fee comes off the return, (1 + r)(1 − fee) − 1, as a fund’s ongoing charge does.',
              'A steady return every month. Real markets do not deliver one, and the order of good and bad years changes what a plan with contributions ends at.',
              'No tax and no inflation: the result is in today’s money only if the return you entered is already a real return.',
            ]} />
          </>
        ) : <Fix />}
      </OCard>
    </>
  );
}

/* ---------- 2. dividend reinvestment --------------------------------------------- */

function DripCalc() {
  const amount = useNumber(10000);
  const priceF = useNumber(50);
  const yieldF = useNumber(3.5);
  const divGrowth = useNumber(5);
  const priceGrowth = useNumber(4);
  const years = useNumber(20);
  const tax = useNumber(15);
  const valid = ok(amount.value, priceF.value, yieldF.value, divGrowth.value, priceGrowth.value, years.value, tax.value)
    && priceF.value > 0 && years.value > 0 && years.value <= 100;
  const d = valid ? dividendReinvestment({
    amount: amount.value, price: priceF.value, yieldPct: yieldF.value / 100, divGrowth: divGrowth.value / 100,
    priceGrowth: priceGrowth.value / 100, years: years.value, tax: tax.value / 100,
  }) : null;

  return (
    <>
      <OCard span={4} id="calc-drip-in">
        <OHead title="The holding" />
        <div className="grid gap-3">
          <Field id="d-amount" label="Amount invested" f={amount} min={0} />
          <Field id="d-price" label="Share price today" f={priceF} min={0} />
          <Field id="d-yield" label="Dividend yield today" f={yieldF} suffix="%" />
          <Field id="d-dgrowth" label="Dividend grows each year by" f={divGrowth} suffix="%" />
          <Field id="d-pgrowth" label="Share price grows each year by" f={priceGrowth} suffix="%" />
          <Field id="d-tax" label="Tax on dividends" f={tax} suffix="%" hint="Withholding or income tax, when paid" min={0} />
          <Field id="d-years" label="Years" f={years} step="1" min={1} />
        </div>
      </OCard>
      <OCard span={8} id="calc-drip-out">
        <OHead title="Reinvest, or take the cash" />
        {d ? (
          <>
            <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
              <OBig label="Reinvested" value={whole(d.reinvested)} />
              <OBig label="Taken as cash" value={whole(d.cash)} note="shares plus the dividends collected" />
              <OBig label="Reinvesting adds" value={whole(d.advantage)} noteTone="pos"
                note={d.cash > 0 ? `${pct(d.advantage / d.cash)} more` : undefined} />
            </div>
            <MultiLineChart height={260} valueFmt={compact} labelFmt={(y) => `Y${y}`} series={[
              { name: 'Reinvested', color: 'var(--up)', points: d.rows.map((r) => ({ date: String(r.year), value: r.value })) },
              { name: 'Taken as cash', color: 'var(--chart-1)', points: d.rows.map((r) => ({ date: String(r.year), value: r.cashValue })) },
            ]} />
            <StatLines split>
              <StatLine label={`Dividends in year ${Math.round(years.value)}, reinvested`} value={whole(d.finalIncome)} note="after tax" />
              <StatLine label="As a yield on what you put in" value={isNum(d.yieldOnCost) ? pct(d.yieldOnCost) : 'n/a'} note="yield on cost" />
              <StatLine label={`Dividends in year ${Math.round(years.value)}, cash`} value={whole(d.rows.at(-1)?.cashIncome)} note="after tax" />
            </StatLines>
            <Conventions items={[
              'Paid quarterly, taxed when paid, and reinvested at that quarter’s price, with fractional shares and no trading cost.',
              'The cash case holds the cash: dividends taken out earn nothing here, which is the comparison reinvesting is usually sold against.',
              'The dividend grows once a year and the price a little every quarter, both at the steady rates you entered. A cut, a special dividend or a bad year for the price is not modelled.',
            ]} />
          </>
        ) : <Fix />}
      </OCard>
    </>
  );
}

/* ---------- 3. position size ------------------------------------------------------ */

function PositionCalc() {
  const account = useNumber(50000);
  const risk = useNumber(1);
  const entry = useNumber(100);
  const stop = useNumber(95);
  const target = useNumber(115);
  const valid = ok(account.value, risk.value, entry.value, stop.value);
  const p = valid ? positionSize({
    account: account.value, riskPct: risk.value / 100, entry: entry.value, stop: stop.value,
    target: Number.isFinite(target.value) ? target.value : null,
  }) : null;

  return (
    <>
      <OCard span={4} id="calc-pos-in">
        <OHead title="The trade" />
        <div className="grid gap-3">
          <Field id="p-account" label="Account size" f={account} min={0} />
          <Field id="p-risk" label="Risk per trade" f={risk} suffix="%" hint="What you will lose if the stop is hit" />
          <Field id="p-entry" label="Entry price" f={entry} min={0} />
          <Field id="p-stop" label="Stop-loss price" f={stop} min={0} hint="Below the entry for a long, above it for a short" />
          <Field id="p-target" label="Target price (optional)" f={target} min={0} />
        </div>
      </OCard>
      <OCard span={8} id="calc-pos-out">
        <OHead title="How many shares" />
        {!p ? <Fix /> : !p.ok ? <Notice warn>{p.errors.join(' ')}</Notice> : (
          <>
            <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
              <OBig label={`Shares, ${p.direction}`} value={whole(p.shares)} />
              <OBig label="Position value" value={whole(p.value)} note={isNum(p.accountShare) ? `${pct(p.accountShare)} of the account` : undefined}
                noteTone={p.leveraged ? 'warn' : undefined} />
              <OBig label="Lost at the stop" value={whole(p.atRisk)} note={`budget ${whole(p.budget)}`} />
            </div>
            <StatLines>
              <StatLine label="Risk per share" value={dec(p.perShare, 2)} note={`${pct(p.stopDistance)} from the entry`} />
              <StatLine label="Reward to risk" value={isNum(p.rewardRisk) ? `${dec(p.rewardRisk, 2)} : 1` : 'n/a'}
                note={p.targetWarning || (isNum(p.rewardRisk) ? 'to the target' : 'enter a target')} tone={p.targetWarning ? 'warn' : ''} />
            </StatLines>
            {p.leveraged ? (
              <Notice warn className="mt-3">
                At this stop the position costs more than the account holds, so it needs margin. A tighter risk budget or a wider stop brings it inside the account.
              </Notice>
            ) : null}
            <Conventions items={[
              'Shares are rounded down, so the loss at the stop never exceeds the budget.',
              'The stop is assumed to fill at its price. A gap through it — overnight, or on news — loses more than this says.',
              'No commission, spread or borrowing cost, which a short also pays.',
            ]} />
          </>
        )}
      </OCard>
    </>
  );
}

/* ---------- 4. annualised return -------------------------------------------------- */

function ReturnCalc() {
  const start = useNumber(10000);
  const end = useNumber(18000);
  const years = useNumber(6);
  const inflation = useNumber(2.5);
  const valid = ok(start.value, end.value, years.value, inflation.value);
  const r = valid ? annualisedReturn({ start: start.value, end: end.value, years: years.value, inflation: inflation.value / 100 }) : null;

  return (
    <>
      <OCard span={4} id="calc-ret-in">
        <OHead title="The investment" />
        <div className="grid gap-3">
          <Field id="r-start" label="Value at the start" f={start} min={0} />
          <Field id="r-end" label="Value at the end" f={end} min={0} hint="Including dividends received, for a total return" />
          <Field id="r-years" label="Years held" f={years} min={0} hint="Fractions are fine: 18 months is 1.5" />
          <Field id="r-infl" label="Inflation over the period" f={inflation} suffix="%" hint="a year" />
        </div>
      </OCard>
      <OCard span={8} id="calc-ret-out">
        <OHead title="What that is a year" />
        {!valid ? <Fix /> : !r ? <Notice warn>The start value and the years held have to be above zero.</Notice> : (
          <>
            <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
              <OBig label="A year, compounded" value={pct(r.cagr, { dp: 2 })} />
              <OBig label="In total" value={pct(r.total, { sign: true })} />
              <OBig label="A year, after inflation" value={pct(r.real, { dp: 2 })} />
            </div>
            <StatLines>
              <StatLine label="Years to double at this rate" value={isNum(r.doubling) ? dec(r.doubling, 1) : 'n/a'}
                note={isNum(r.rule72) ? `the rule of 72 says ${dec(r.rule72, 1)}` : 'does not double'} />
            </StatLines>
            <Conventions items={[
              'The compound annual rate is the steady return that turns the start into the end: (end / start)^(1 / years) − 1.',
              'Inflation is taken out by division, (1 + r) / (1 + inflation) − 1, not by subtracting one rate from the other.',
              'Money added or taken out along the way is not handled: with contributions, this overstates the return. The Watchlist’s portfolio history measures that case properly.',
            ]} />
          </>
        )}
      </OCard>
    </>
  );
}

/* ---------- the page -------------------------------------------------------------- */

export function CalculatorsPage() {
  const q = useQueryState();
  const raw = q.get('calc');
  const active: CalcId = CALCS.some((c) => c.id === raw) ? (raw as CalcId) : 'growth';
  return (
    <PageFrame id="research-calculators">
      <ResearchHero title="Calculators" blurb="Four sums a spreadsheet would do, with the conventions that change the answer printed beside each. Nothing typed here is stored or sent anywhere." />
      <ResearchStrip active="calculators" />
      <div className="pt-6">
        <ChipRail label="Calculator" items={CALCS} active={active} onChoose={(id) => q.set({ calc: id === 'growth' ? null : id })} />
      </div>
      <div className="grid grid-cols-12 gap-6 pt-6 max-lg:grid-cols-1">
        {active === 'growth' ? <GrowthCalc /> : active === 'drip' ? <DripCalc /> : active === 'position' ? <PositionCalc /> : <ReturnCalc />}
      </div>
    </PageFrame>
  );
}
