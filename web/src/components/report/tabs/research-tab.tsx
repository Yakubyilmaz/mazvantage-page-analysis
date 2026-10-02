'use client';

/* ==========================================================================
   Maz Vantage — the Research tab

   An equity research report in the Morningstar house shape: a rating band
   across the top, a price-against-fair-value chart, an analyst note, then
   moat, fair value, risk, capital allocation and the financials.

   **The layout is theirs. The ratings are ours.** The headline is the quant
   rating `gradeAll` already computes; the valuation zone beside it is the only
   place a fair value estimate is used, and no fair value ever feeds a grade.
   The ratings model and the generated prose live in `lib/research-model.ts`;
   this file lays them out.
   ========================================================================== */

import * as React from 'react';
import { clamp, curSymbol, dec, fmtDate, isNum, money, mult, num, pct, price, yearOf } from '@/lib/format';
import { MAX_SCORE, toneForLetter } from '@/lib/grading';
import { buildPrompt, fetchNarrative } from '@/lib/narrative';
import {
  SAFETY_BANDS, analystNote, capitalProse, fairValueProse, moatProse, researchRatings, riskProse, strategyProse,
} from '@/lib/research-model';
import { getApiKey, logoUrl } from '@/lib/fmp';
import type { Analysis } from '@/lib/model';
import { priceTimeline, type PeriodChange, type PeriodKey } from '@/lib/price-timeline';
import { LineChart } from '@/components/charts/charts';
import { DataTable, FeedGate, KeyInfo, Notice, OCard, OHead, Pill, toneClass } from '@/components/report/ui';
import { GradeBar, GradePill, OSub } from '@/components/report/grade-parts';
import { usePings } from '@/components/report/pings';
import { ScenarioCard } from '@/components/report/scenario-card';
import { Button } from '@/components/ui/button';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

type Ratings = ReturnType<typeof researchRatings>;
type Narrative = { sections: Record<string, any>; model?: string; generatedAt?: string; source?: string } | null;

const Tiny = ({ children, className }: { children: React.ReactNode; className?: string }) =>
  <p className={cn('mt-2 text-tiny text-muted-foreground/80', className)}>{children}</p>;
const Para = ({ children }: { children: React.ReactNode }) =>
  <p className="mb-3 max-w-[80ch] text-sm leading-[1.7] last:mb-0">{children}</p>;
const Signed = ({ v }: { v: number | null | undefined }) =>
  <span className={isNum(v) ? (v >= 0 ? 'text-up' : 'text-down') : ''}>{isNum(v) ? pct(v, { sign: true }) : 'n/a'}</span>;

/**
 * One section's paragraphs: the narrative if it has this section, else the
 * generated form. The fallback is not a placeholder — it is complete prose.
 */
function Prose({ nar, k, fallback }: { nar: Narrative; k: string; fallback: string[] }) {
  const paras = nar?.sections?.[k];
  const use: string[] = Array.isArray(paras) && paras.length ? paras : fallback;
  return <div className="mt-2">{use.map((p, i) => <Para key={i}>{p}</Para>)}</div>;
}

/*
  The byline. A Morningstar note is signed by a named analyst, and signing a
  generated report with anything resembling a name would be the one genuinely
  misleading thing this page could do — so it says what it is, and a model's
  byline carries its date, because prose written weeks ago beside a price that
  moves every day is the one way this page can mislead.
*/
function Byline({ a, nar }: { a: Analysis; nar: Narrative }) {
  const src = a.ds.source === 'snapshot' ? 'a saved copy of the data' : 'live market data';
  return (
    <p className="mb-3 text-tiny text-muted-foreground">
      {nar ? (
        <>
          <b className="font-semibold text-foreground">Written by {nar.model}</b>
          {nar.generatedAt ? ` · ${fmtDate(nar.generatedAt)}` : ''}
          {nar.source === 'live' ? ' · generated on demand' : ' · pre-generated'}
          {` · figures from ${src}, quoted as they stood when it was written · not an analyst opinion`}
        </>
      ) : (
        <>
          <b className="font-semibold text-foreground">Maz Vantage model</b>
          {` · assembled ${fmtDate(a.ds.asOf)} from ${src} · no narrative model for this company · no analyst opinion`}
        </>
      )}
    </p>
  );
}

/* ---------- the rating band ---------------------------------------------------- */

const QTONE: Record<string, string> = {
  good: 'border-up/30 bg-up/10 text-up',
  warn: 'border-grade-mid/30 bg-grade-mid/10 text-grade-mid',
  bad: 'border-down/30 bg-down/10 text-down',
  muted: 'border-border bg-accent text-muted-foreground',
};

/** Verdict word, letter and score together: the word alone is too coarse, the number alone meaningless without the scale. */
function QuantBadge({ q, size }: { q: Ratings['quant']; size?: 'lg' }) {
  if (!isNum(q.score)) return <span className="text-tiny text-muted-foreground">Not rated</span>;
  return (
    <span title={`${dec(q.score, 2)} out of ${q.max}, grade ${q.letter}, from ${q.graded} ranked ratios`}
      className={cn('inline-flex items-center gap-2.5 rounded-lg border px-3 py-1.5', QTONE[q.tone] || QTONE.muted, size === 'lg' && 'px-4 py-2')}>
      <b className={cn('font-bold', size === 'lg' ? 'text-lg' : 'text-sm')}>{q.verdict}</b>
      <span className="flex items-baseline gap-1.5 text-foreground">
        <i className="text-13 font-bold not-italic">{q.letter}</i>
        <em className="text-tiny not-italic text-muted-foreground tnum">{dec(q.score, 2)}/{q.max}</em>
      </span>
    </span>
  );
}

/** A 0–5 score as a filled track — the scale drawn rather than stated. */
function ScoreBar({ score, letter, label }: { score: number | null; letter: string | null; label: string }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)_40px] items-center gap-3 text-13">
      <span className="truncate text-muted-foreground">{label}</span>
      <GradeBar tone={toneForLetter(letter)} share={isNum(score) ? clamp((score / MAX_SCORE) * 100, 0, 100) : 0} className="mt-0" />
      <span className="text-right font-semibold tnum">{isNum(score) ? dec(score, 2) : 'n/a'}</span>
    </div>
  );
}

function BandCell({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="bg-background p-3">
      <div className="text-micro font-medium uppercase tracking-[.05em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[15px] font-bold tnum">{value}</div>
      {note ? <div className="mt-0.5 text-micro text-muted-foreground">{note}</div> : null}
    </div>
  );
}

/** The nine-box grid with the company's cell lit. */
function StyleGrid({ style }: { style: Ratings['style'] }) {
  const sizes = ['Large', 'Mid', 'Small'];
  const styles = ['Value', 'Blend', 'Growth'];
  return (
    <div className="flex items-center gap-4">
      <div className="grid grid-cols-3 gap-0.5">
        {sizes.flatMap((s) => styles.map((t) => (
          <i key={`${s}${t}`} title={`${s} ${t}`}
            className={cn('size-5 rounded-[3px] bg-accent', s === style.size && t === style.style && 'bg-primary')} />
        )))}
      </div>
      <div className="grid gap-0.5">
        <span className="text-13 font-semibold">{style.label}</span>
        <span className="text-tiny text-muted-foreground">
          {isNum(style.valuationScore) && isNum(style.growthScore) ? `valuation ${dec(style.valuationScore, 1)} vs growth ${dec(style.growthScore, 1)}` : ''}
        </span>
      </div>
    </div>
  );
}

const ZONE: Record<string, string> = { good: 'text-up', bad: 'text-down', neutral: 'text-grade-mid', muted: 'text-muted-foreground' };

function RatingBandCard({ a, r }: { a: Analysis; r: Ratings }) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const [logoOk, setLogoOk] = React.useState(true);
  const logo = f.image || logoUrl(f.symbol);
  return (
    <OCard span={12} id="rsr-band">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && logoOk ? <img src={logo} alt="" loading="lazy" onError={() => setLogoOk(false)} className="size-11 rounded-lg bg-white object-contain p-1" /> : null}
          <div>
            <h2 className="text-xl font-bold tracking-[-.02em]">{f.name}</h2>
            <p className="text-13 text-muted-foreground">{[f.symbol, f.exchange, f.sector, f.industry].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="grid justify-items-end gap-1">
          <QuantBadge q={r.quant} size="lg" />
          <p className="text-tiny text-muted-foreground">{r.quant.verdict ? `Maz Vantage Quant Rating · ${fmtDate(a.ds.asOf)}` : 'Not rated'}</p>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        <BandCell label="Quant Rating" value={r.quant.verdict || 'n/a'} note={isNum(r.quant.score) ? `${r.quant.letter} · ${dec(r.quant.score, 2)} of ${r.quant.max}` : 'not rated'} />
        <BandCell label="Last Price" value={price(f.price, cur)} note={fmtDate(f.quoteTime || a.ds.asOf)} />
        <BandCell label="Fair Value Estimate" value={isNum(r.fve.value) ? price(r.fve.value, cur) : 'n/a'} note={r.fve.count ? `median of ${r.fve.count} models` : 'not modelled'} />
        <BandCell label="Price/FVE" value={isNum(r.zone.ratio) ? dec(r.zone.ratio, 2) : 'n/a'} note={r.zone.label || ''} />
        <BandCell label="Market Cap" value={money(f.marketCap, { currency: cur })} />
        <BandCell label="Economic Moat" value={r.moat.label} note={r.moat.key ? `${r.moat.positive}/${r.moat.years} years` : 'not rated'} />
        <BandCell label="Uncertainty" value={r.unc.label} note={r.unc.key ? `${r.unc.measured}/${r.unc.of} drivers` : ''} />
        <BandCell label="Capital Allocation" value={r.capital.label} note={isNum(r.capital.total) ? `${dec(r.capital.total, 1)}/6` : ''} />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div>
          <OSub className="mt-0">Quant rating — the company against its sector</OSub>
          <div className="mb-4 flex items-center gap-3">
            <QuantBadge q={r.quant} />
            <GradePill score={r.quant.score} letter={r.quant.letter} size="lg" />
          </div>
          <div className="grid gap-2.5">
            {r.quant.factors.map((x: any) => <ScoreBar key={x.key} score={x.score} letter={x.letter} label={x.title} />)}
          </div>
          <Tiny className="mt-3">
            {r.quant.graded} of {r.quant.of} ratios ranked, each as a percentile against the sector, averaged within a factor and then across
            the five. Price multiples count here, inside the Valuation factor; no fair value estimate does.
          </Tiny>
        </div>
        <div>
          <OSub className="mt-0">Valuation — the price against the estimate</OSub>
          <p className={cn('text-2xl font-bold', ZONE[r.zone.tone || 'muted'] || ZONE.muted)}>{r.zone.label || 'Not rated'}</p>
          <Tiny>
            {isNum(r.zone.low)
              ? `Undervalued below ${price(r.zone.low, cur)}, overvalued above ${price(r.zone.high, cur)}, on the ${r.unc.label} uncertainty band around a ${price(r.fve.value, cur)} estimate.`
              : 'No fair value estimate, so no valuation zone.'}
          </Tiny>
          <OSub>Style</OSub>
          <StyleGrid style={r.style} />
        </div>
      </div>

      <Notice className="mt-6">
        The <b>quant rating</b> is the rating on this report: every ratio that could be ranked, scored as a percentile against the sector.
        Price multiples are part of it, inside the Valuation factor. The <b>valuation zone</b> beside it is a separate reading and the only
        place a fair value estimate is used — the price against thirteen models of what the business is worth. One asks whether the
        multiples are dear against peers, the other whether the price is above intrinsic value; they can and do disagree.
      </Notice>
    </OCard>
  );
}

/* ---------- price vs fair value ------------------------------------------------ */

/** Calendar-year price return; each year opens on the previous year's close. */
function yearlyReturns(pts: any[]) {
  if (pts.length < 2) return [];
  const byYear = new Map<number, { year: number; first: number; last: number }>();
  for (const p of pts) {
    const y = yearOf(p.date);
    if (!isNum(y)) continue;
    if (!byYear.has(y)) byYear.set(y, { year: y, first: p.price, last: p.price });
    else byYear.get(y)!.last = p.price;
  }
  const rows = [...byYear.values()].sort((x, y) => x.year - y.year);
  return rows.map((row, i) => {
    const open = i > 0 ? rows[i - 1].last : row.first;
    return { year: row.year, ret: open > 0 ? row.last / open - 1 : null };
  }).slice(-6);
}

/** A signed price move in the report's currency: +US$12.40, -US$3.10 — the same sign glyphs `pct` prints beside it. */
const signedPrice = (v: number, cur: string) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${price(Math.abs(v), cur)}`;

/**
 * The quote's price change over each period, as a strip of tabs: each shows
 * its own change, and the selected one is what the chart draws. A period the
 * loaded closes cannot reach is disabled rather than quietly shortened.
 */
function PriceTimeline({ periods, value, onChange, firstDate }: {
  periods: PeriodChange[]; value: PeriodKey; onChange: (k: PeriodKey) => void; firstDate: string | null;
}) {
  return (
    <div role="tablist" aria-label="Price change by period"
      // One row that scrolls on a phone, rather than wrapping into ragged rows.
      className="scroll-none mb-3 flex gap-px overflow-x-auto rounded-[10px] border border-border bg-border">
      {periods.map((p) => {
        const on = p.key === value;
        return (
          <button key={p.key} type="button" role="tab" aria-selected={on} disabled={!p.available} onClick={() => onChange(p.key)}
            title={p.available
              ? `${p.long}: ${p.from!.date.slice(0, 10)} to ${p.to!.date.slice(0, 10)}${p.approx ? ' (from the first close loaded)' : ''}`
              : `Not enough history: the loaded closes start ${firstDate ? fmtDate(firstDate) : 'too late'}`}
            className={cn('grid min-w-[58px] flex-1 gap-0.5 bg-background px-1 py-2 text-center transition-colors enabled:hover:bg-accent disabled:cursor-not-allowed',
              on && 'bg-accent shadow-[inset_0_-2px_0_var(--primary)]')}>
            <span className={cn('text-micro font-semibold uppercase tracking-[.04em]', on ? 'text-foreground' : 'text-muted-foreground')}>{p.label}</span>
            <span className={cn('text-13 font-semibold tnum', !p.available ? 'text-muted-foreground/50'
              : (p.pct as number) > 0 ? 'text-up' : (p.pct as number) < 0 ? 'text-down' : 'text-muted-foreground')}>
              {p.available ? pct(p.pct, { sign: true }) : '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PF_TONE: Record<string, string> = {
  good: 'text-up', bad: 'text-down', anchor: 'text-primary', self: 'text-foreground', '': 'text-muted-foreground',
};

/*
  One fair value estimate — today's — drawn across the whole window. The
  source reports carry the estimate as it stood each year; this report has no
  archive of past estimates and does not invent one.
*/
function PriceVsFairValueCard({ a, r }: { a: Analysis; r: Ratings }) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const pts: any[] = a.momentum?.points || [];
  const years = yearlyReturns(pts);
  const pings = usePings(a);
  const periods = React.useMemo(() => priceTimeline(pts), [pts]);
  // A year by default, the window this card always drew; everything loaded when a year is not there.
  const [period, setPeriod] = React.useState<PeriodKey>('1Y');
  const sel = periods.find((p) => p.key === period && p.available) || periods.find((p) => p.key === 'ALL')!;
  const short = sel.available && sel.window.length > 1
    && new Date(sel.window[sel.window.length - 1].date).getTime() - new Date(sel.window[0].date).getTime() < 200 * 864e5;
  const cell = (label: string, value: string, tone: string) => (
    <div key={label} className="bg-background p-3 text-center">
      <div className={cn('text-[15px] font-bold tnum', PF_TONE[tone])}>{value}</div>
      <div className="mt-0.5 text-micro text-muted-foreground">{label}</div>
    </div>
  );
  return (
    <OCard span={12} id="rsr-pfv">
      <OHead title="Price vs. Fair Value" info="One fair value estimate — today’s — drawn across the whole window. Morningstar’s version of this chart carries the estimate as it stood in each year; this report has no archive of past estimates and does not invent one." />
      {pts.length > 1 && sel.available ? (
        <>
          {/* The quote over the chosen period: the last close, and the change since the period's base close. */}
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold tracking-[-.02em] tnum">{price(sel.to!.price, cur)}</span>
            <span className={cn('text-[15px] font-semibold tnum', sel.change! > 0 ? 'text-up' : sel.change! < 0 ? 'text-down' : 'text-muted-foreground')}>
              {signedPrice(sel.change!, cur)} ({pct(sel.pct, { sign: true })})
            </span>
            <span className="text-13 text-muted-foreground">
              {sel.long} · since {fmtDate(sel.from!.date)}{sel.approx ? ', the first close loaded' : ''} · close of {fmtDate(sel.to!.date)}
            </span>
          </div>
          <PriceTimeline periods={periods} value={sel.key} onChange={setPeriod} firstDate={pts[0]?.date ?? null} />
          <LineChart height={300} series={sel.window.map((p) => ({ date: p.date, value: p.price }))} valueFmt={(v) => price(v, cur)}
            labelFmt={(d) => fmtDate(d, short ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' })} markers={pings.markers}
            refLine={isNum(r.fve.value) ? { value: r.fve.value, label: `Fair value ${price(r.fve.value, cur)}` } : null} />
        </>
      ) : a.ds.status('prices') !== 'ok' ? <FeedGate a={a} feed="prices" what="Price history" /> : <Notice>No price history was returned.</Notice>}
      {pings.legend}
      {pings.note}
      {years.length ? (
        <div className="mt-4">
          <DataTable headers={[{ label: '' }, ...years.map((y) => ({ label: String(y.year), num: true }))]}
            rows={[['Total Return %', ...years.map((y) => <Signed key={y.year} v={y.ret} />)]]} />
          <Tiny>Price return by calendar year from the closing series, dividends excluded. The current year is year to date.</Tiny>
        </div>
      ) : null}
      {/* Reference prices, not a ladder: nothing guarantees they stay in this
          order, so each cell says what it is rather than relying on position. */}
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-px overflow-hidden rounded-[10px] border border-border bg-border">
        {cell('Model low', isNum(r.fve.low) ? price(r.fve.low, cur) : 'n/a', '')}
        {cell('Undervalued below', isNum(r.zone.low) ? price(r.zone.low, cur) : 'n/a', 'good')}
        {cell('Fair value estimate', isNum(r.fve.value) ? price(r.fve.value, cur) : 'n/a', 'anchor')}
        {cell('Overvalued above', isNum(r.zone.high) ? price(r.zone.high, cur) : 'n/a', 'bad')}
        {cell('Last price', price(f.price, cur), 'self')}
      </div>
      <Tiny>
        {isNum(r.zone.low) && r.unc.band
          ? `The undervalued and overvalued thresholds are the ${r.unc.label} uncertainty band — a ${pct(1 - r.unc.band.lo)} discount and a ${pct(r.unc.band.hi - 1)} premium — applied to the fair value estimate. A wider uncertainty rating widens both, because a less reliable estimate earns less confidence that any given price is wrong.`
          : 'No fair value estimate could be produced, so no thresholds are drawn.'}
      </Tiny>
    </OCard>
  );
}

/* ---------- the narrative sections ------------------------------------------------ */

function AnalystNoteCard({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  const gen = analystNote(a, r);
  const n = nar?.sections?.note;
  const headline = n?.headline || gen.headline;
  const bullets: string[] = (n?.why?.length ? n.why : gen.bullets) || [];
  const bottom = n?.bottomLine || gen.bottom;
  return (
    <OCard span={12} id="rsr-note">
      <OHead title="Analyst Note" />
      <Byline a={a} nar={nar} />
      <h3 className="mb-3 text-lg font-bold leading-snug tracking-[-.01em]">{headline}</h3>
      {bullets.length ? (
        <div className="mb-3">
          <p className="mb-1 text-13 font-semibold">Why it matters:</p>
          <ul className="grid max-w-[80ch] list-disc gap-1.5 pl-5 text-sm leading-relaxed">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      ) : null}
      <p className="max-w-[80ch] text-sm leading-relaxed"><b>The bottom line: </b>{bottom}</p>
    </OCard>
  );
}

function BusinessCard({ a }: { a: Analysis }) {
  const f = a.facts;
  return (
    <OCard span={12} id="rsr-business">
      <OHead title="Business Description" />
      {f.description ? <Para>{f.description}</Para> : <Notice>No business description was returned for this company.</Notice>}
      <div className="mt-3">
        <KeyInfo items={[
          ['Sector', f.sector || 'n/a'],
          ['Industry', f.industry || 'n/a'],
          ['Employees', isNum(f.employees) ? num(f.employees, 0) : 'n/a'],
          ['Country', f.country || 'n/a'],
          f.ipoDate ? ['Listed', fmtDate(f.ipoDate)] : null,
          ['CEO', f.ceo || 'n/a'],
        ]} />
      </div>
    </OCard>
  );
}

function StrategyCard({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  return (
    <OCard span={12} id="rsr-strategy">
      <OHead title="Business Strategy & Outlook" />
      <Byline a={a} nar={nar} />
      <Prose nar={nar} k="strategy" fallback={strategyProse(a, r)} />
    </OCard>
  );
}

/** Bulls Say / Bears Say, off the graded ratios furthest either side of the sector median. */
function BullsBearsCard({ a, nar }: { a: Analysis; nar: Narrative }) {
  const bulls: string[] = nar?.sections?.bulls?.length ? nar.sections.bulls : (a.rewards || []);
  const bears: string[] = nar?.sections?.bears?.length ? nar.sections.bears : (a.risks || []);
  const side = (title: string, items: string[], kind: 'bull' | 'bear', empty: string) => (
    <div className={cn('rounded-[10px] border-t-[3px] bg-muted p-4', kind === 'bull' ? 'border-up' : 'border-down')}>
      <p className={cn('mb-2 text-13 font-bold', kind === 'bull' ? 'text-up' : 'text-down')}>{title}</p>
      {items.length
        ? <ul className="grid list-disc gap-1.5 pl-5 text-13 leading-relaxed">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
        : <p className="text-tiny text-muted-foreground">{empty}</p>}
    </div>
  );
  return (
    <OCard span={12} id="rsr-bullbear">
      <OHead title="Bulls Say / Bears Say" info={nar?.sections?.bulls
        ? 'The case each way, written from the ranked ratios and the filed run. Three points a side, because a list that runs to ten is not an argument.'
        : 'The graded ratios that sit furthest above and furthest below the sector median, with the sentence each carries elsewhere in the report. Not a summary of the investment case — a list of what the numbers are strongest and weakest on.'} />
      <Byline a={a} nar={nar} />
      <div className="grid gap-4 md:grid-cols-2">
        {side('Bulls Say', bulls, 'bull', 'No ratio grades far enough above its sector median to list.')}
        {side('Bears Say', bears, 'bear', 'No ratio grades far enough below its sector median to list.')}
      </div>
    </OCard>
  );
}

const gradedCount = (a: Analysis) => (['valuation', 'growth', 'health', 'profitability', 'momentum'] as const)
  .reduce((t, k) => t + ((a.scores as any)[k]?.graded || 0), 0);

function CompetitorsCard({ a }: { a: Analysis }) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const peers: any[] = a.peers?.peers || [];
  if (!peers.length) {
    return (
      <OCard span={12} id="rsr-peers">
        <OHead title="Competitors" />
        {a.ds.status('peers') !== 'ok' ? <FeedGate a={a} feed="peers" what="Peer companies" /> : <Notice>No peer companies were returned.</Notice>}
      </OCard>
    );
  }
  const rows = [{ ...f, self: true, pe: f.pe, score: a.peers.self?.score ?? null, scoredOn: a.peers.self?.scoredOn ?? null }, ...peers];
  // The per-peer `ratios-ttm` row is the only place a peer's book value or
  // yield exists; a peer whose request failed prints n/a, not a sector fill.
  const ratioOf = (sym: string) => (sym === f.symbol ? a.ds.get('ratiosTtm') : a.peerRatios?.[sym]) || null;
  return (
    <OCard span={12} id="rsr-peers">
      <OHead title="Competitors" info={`The published peer list. The composite column is scored only on the ratios every row has in common, so it is a like-for-like comparison between these companies and will not tie to the ${gradedCount(a)}-ratio grade at the top of this page.`} />
      <DataTable
        headers={[{ label: 'Company' }, { label: 'Ticker' }, { label: 'Market Cap', num: true }, { label: 'P/E', num: true }, { label: 'P/B', num: true }, { label: 'Dividend Yield', num: true }, { label: 'Composite', num: true }]}
        rows={rows.map((p: any) => {
          const rt = ratioOf(p.symbol);
          const pb = rt?.priceToBookRatioTTM ?? null;
          const dy = rt?.dividendYieldTTM ?? null;
          return [
            <span key="n" className={p.self ? 'font-bold text-primary' : ''}>{p.name || p.symbol}</span>,
            p.symbol || '—',
            isNum(p.marketCap) ? money(p.marketCap, { currency: cur }) : 'n/a',
            isNum(p.pe) ? mult(p.pe) : 'n/a',
            isNum(pb) ? mult(pb) : 'n/a',
            isNum(dy) ? pct(dy) : 'n/a',
            // The ratio count is not decoration: a 5-ratio score and a
            // 40-ratio score are not the same measurement.
            <span key="s" className="inline-flex items-baseline gap-1.5">
              <b className="tnum">{isNum(p.score) ? dec(p.score, 2) : 'n/a'}</b>
              {isNum(p.scoredOn) && p.scoredOn > 0 ? <i className="text-micro not-italic text-muted-foreground">on {p.scoredOn}</i> : null}
            </span>,
          ];
        })} />
      {isNum(a.peers.self?.score) && a.peers.self.score !== a.scores.overall?.score ? (
        <Tiny>
          {f.symbol} scores {dec(a.peers.self.score, 2)} in this column against {dec(a.scores.overall?.score, 2)} at the top of the page. Both are
          right: the column grades it on the ratios shared with these peers, the headline grades it on every ratio the report could fill. Where the
          shared set is mostly valuation lines, a company that is expensive and excellent will score low here and high there.
        </Tiny>
      ) : null}
      <Tiny>
        Morningstar’s equivalent table carries a fair value and a star rating for every peer, because an analyst covers each one. Producing those
        here would mean running all thirteen valuation models against every peer, so the peer columns stay factual.
      </Tiny>
    </OCard>
  );
}

function MoatCard({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  const m = r.moat;
  const rows = (a.series?.rows || []).filter((x: any) => isNum(x.spread));
  return (
    <OCard span={12} id="rsr-moat">
      <OHead title="Economic Moat" aside={<Pill tone={m.key === 'wide' ? 'good' : m.key === 'narrow' ? 'gold' : 'muted'}>{m.label}</Pill>}
        info="Return on invested capital against the weighted average cost of capital, year by year. A moat is a forecast; this is the record it would be forecast from." />
      <Byline a={a} nar={nar} />
      <Prose nar={nar} k="moat" fallback={moatProse(a, r)} />
      {rows.length ? (
        <div className="mt-4">
          <OSub>Return on invested capital against its cost</OSub>
          <DataTable headers={[{ label: 'Year' }, { label: 'ROIC', num: true }, { label: 'WACC', num: true }, { label: 'Spread', num: true }, { label: '' }]}
            rows={rows.map((x: any) => [
              String(x.year), pct(x.roic), pct(x.wacc),
              <Signed key="s" v={x.spread} />,
              <span key="n" className="text-tiny text-muted-foreground">{x.spread >= 0 ? 'earns its cost' : 'below cost'}</span>,
            ])} />
          <Tiny>
            The cost of equity leg is CAPM on today’s beta and today’s rates, because neither is published per historical year — so the hurdle is
            “what this mix would cost at today’s prices”, not what it cost at the time. The mix, the tax rate and the cost of debt are each year’s own.
          </Tiny>
        </div>
      ) : null}
    </OCard>
  );
}

function FairValueCard({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  const nav = useNav();
  const cur = curSymbol(a.facts.currency);
  return (
    <OCard span={12} id="rsr-fv">
      <OHead title="Fair Value and Profit Drivers" aside={isNum(r.fve.value) ? <Pill tone="gold">{price(r.fve.value, cur)}</Pill> : null}
        info="The median of every valuation model that produced a number, with the range they span." />
      <Byline a={a} nar={nar} />
      <Prose nar={nar} k="fairValue" fallback={fairValueProse(a, r)} />
      {r.fve.models.length ? (
        <div className="mt-4">
          <OSub>The {r.fve.count} models behind the estimate</OSub>
          <DataTable headers={[{ label: 'Model' }, { label: 'Family' }, { label: 'Fair value', num: true }, { label: 'vs price', num: true }]}
            rows={r.fve.models.map((m: any) => {
              const gap = isNum(a.facts.price) && a.facts.price > 0 ? m.value / a.facts.price - 1 : null;
              return [m.full || m.label, m.family === 'dcf' ? 'Discounted cash flow' : 'Relative multiple', price(m.value, cur), <Signed key="g" v={gap} />];
            })} />
        </div>
      ) : null}
      {nav.openFactor ? (
        <Button variant="ghost" size="sm" className="mt-3 self-start" onClick={() => nav.openFactor?.('valuation')}>Open the Valuation factor →</Button>
      ) : null}
    </OCard>
  );
}

const DOT: Record<string, string> = { lo: 'text-up', mid: 'text-grade-mid', hi: 'text-down', na: 'text-muted-foreground' };
const Dot = ({ kind, children }: { kind: 'lo' | 'mid' | 'hi' | 'na'; children: React.ReactNode }) => (
  <span className={cn('inline-flex items-center gap-1.5 text-13 font-semibold', DOT[kind])}>
    <i className="size-2 rounded-full bg-current" />{children}
  </span>
);

function RiskCard({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  const u = r.unc;
  return (
    <OCard span={12} id="rsr-risk">
      <OHead title="Risk and Uncertainty" aside={<Pill tone={!u.key ? 'muted' : u.key === 'low' ? 'good' : u.key === 'medium' ? 'gold' : 'bad'}>{u.label}</Pill>}
        info="Six measurable drivers of how wide the range of plausible values is. The rating is the mean of the ones that could be measured, so a missing input does not read as certainty." />
      <Byline a={a} nar={nar} />
      <Prose nar={nar} k="risk" fallback={riskProse(a, r)} />
      <OSub>What the rating is built from</OSub>
      <DataTable headers={[{ label: 'Driver' }, { label: 'Reading', num: true }, { label: 'Contribution' }, { label: 'What it measures' }]}
        rows={u.drivers.map((d: any) => [
          d.label,
          isNum(d.value) ? d.fmt(d.value) : 'n/a',
          <Dot key="d" kind={d.points === 0 ? 'lo' : d.points === 1 ? 'mid' : d.points === 2 ? 'hi' : 'na'}>
            {d.points === 0 ? 'Contained' : d.points === 1 ? 'Moderate' : d.points === 2 ? 'Wide' : 'Not measured'}
          </Dot>,
          <span key="b" className="text-tiny text-muted-foreground">{d.basis}</span>,
        ])} />
      <OSub>The margin of safety each rating demands</OSub>
      <DataTable headers={[{ label: 'Uncertainty' }, { label: 'Undervalued below', num: true }, { label: 'Overvalued above', num: true }]}
        rows={Object.entries(SAFETY_BANDS).map(([k, b]: [string, any]) => [
          <span key="l" className={k === u.key ? 'font-bold text-primary' : ''}>{b.label}</span>, pct(1 - b.lo), pct(b.hi - 1),
        ])} />
      <Tiny>
        A discount and a premium against the fair value estimate, widening as the estimate becomes less reliable. The ladder is Morningstar’s
        published margin-of-safety table, used unchanged — it is a sensible scale and there is no reason to invent another. What differs is how
        the row is chosen: theirs from an analyst’s scenario analysis, this one from the six drivers above. These bands set the valuation zone
        only. They do not touch the quant rating.
      </Tiny>
    </OCard>
  );
}

function CapitalCard({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  const c = r.capital;
  return (
    <OCard span={12} id="rsr-capital">
      <OHead title="Capital Allocation" aside={<Pill tone={!c.key ? 'muted' : c.key === 'exemplary' ? 'good' : c.key === 'poor' ? 'bad' : 'neutral'}>{c.label}</Pill>}
        info="The three legs Morningstar names — balance sheet, investment, shareholder distributions — each scored from figures already in this report." />
      <Byline a={a} nar={nar} />
      <Prose nar={nar} k="capital" fallback={capitalProse(a, r)} />
      <div className="mt-4">
        <DataTable headers={[{ label: 'Leg' }, { label: 'Assessment' }, { label: 'On what' }]}
          rows={c.legs.map((l: any) => [
            l.label,
            <Dot key="d" kind={l.points === 2 ? 'lo' : l.points === 1 ? 'mid' : l.points === 0 ? 'hi' : 'na'}>{l.verdict}</Dot>,
            <span key="w" className="text-tiny text-muted-foreground">{l.detail || 'not measured'}</span>,
          ])} />
      </div>
    </OCard>
  );
}

/** Filed years beside the consensus years, with the boundary marked E. */
function FinancialsCard({ a }: { a: Analysis }) {
  const rows: any[] = (a.series?.rows || []).slice(-5);
  const fc: any[] = (a.forecast?.rows || []).filter((x: any) => isNum(x.year) && x.year > (rows.at(-1)?.year ?? 0)).slice(0, 3);
  const cur = curSymbol(a.facts.currency);
  if (!rows.length) {
    return (
      <OCard span={12} id="rsr-fin">
        <OHead title="Financials" />
        {a.ds.status('income') !== 'ok' ? <FeedGate a={a} feed="income" what="Annual financial statements" /> : <Notice>No annual statements were returned.</Notice>}
      </OCard>
    );
  }
  const dash = <span className="text-muted-foreground">—</span>;
  const line = (label: string, pick: (x: any) => unknown, fmt: (v: unknown) => string, fcPick?: (x: any) => unknown): React.ReactNode[] => [
    label, ...rows.map((x) => fmt(pick(x))), ...fc.map((x) => (fcPick ? fmt(fcPick(x)) : dash)),
  ];
  const m = (v: unknown) => (isNum(v) ? money(v, { currency: cur }) : 'n/a');
  const p = (v: unknown) => (isNum(v) ? pct(v) : 'n/a');
  const e = (v: unknown) => (isNum(v) ? price(v, cur) : 'n/a');
  const growth = (x: any, prev: any) => (prev && prev.revenue > 0 && isNum(x.revenue) ? x.revenue / prev.revenue - 1 : null);
  return (
    <OCard span={12} id="rsr-fin">
      <OHead title="Financials" info="Annual, as filed, with the consensus years marked E. The report’s trailing-twelve ratios will not tie to the last filed column." />
      <DataTable
        headers={[{ label: '' }, ...rows.map((x) => ({ label: String(x.year), num: true })), ...fc.map((x) => ({ label: `${x.year}E`, num: true }))]}
        rows={[
          line('Revenue', (x) => x.revenue, m, (x) => x.revenue),
          ['Revenue growth %',
            ...rows.map((x, i) => <Signed key={`h${i}`} v={growth(x, rows[i - 1])} />),
            ...fc.map((x, i) => <Signed key={`f${i}`} v={growth(x, i > 0 ? fc[i - 1] : rows.at(-1))} />)],
          line('Gross profit', (x) => x.grossProfit, m),
          line('Operating income', (x) => x.ebit, m, (x) => x.ebit),
          line('Operating margin %', (x) => x.operatingMargin, p),
          line('EBITDA', (x) => x.ebitda, m, (x) => x.ebitda),
          line('Net income', (x) => x.netIncome, m, (x) => x.netIncome),
          line('Net margin %', (x) => x.netMargin, p),
          line('EPS (diluted)', (x) => x.eps, e, (x) => x.eps),
          line('Free cash flow', (x) => x.fcf, m),
          line('Return on invested capital %', (x) => x.roic, p),
          line('Return on equity %', (x) => x.roe, p),
          line('Debt / equity', (x) => x.debtToEquity, (v) => (isNum(v) ? dec(v, 2) : 'n/a')),
        ]} />
      <Tiny>
        {fc.length
          ? `Estimate columns are the consensus from ${a.forecast.analystCount || 'the'} contributing analysts, used as filed. The outer years wobble as coverage thins; they are not smoothed here, on purpose.`
          : 'No consensus estimates were returned, so every column is a filed year.'}
      </Tiny>
    </OCard>
  );
}

/* ---------- methodology ------------------------------------------------------------- */

/*
  The developer's way in: the exact payload `narrative.ts` would POST to a
  narrative service, for this company. `buildPrompt` makes no network call, so
  this reveals nothing and costs nothing.
*/
function PromptTools({ a, r }: { a: Analysis; r: Ratings }) {
  const [status, setStatus] = React.useState('');
  // Operator-only (a key set through the hidden `?apikey=` link): it names services and storage keys readers are not told about.
  const [operator, setOperator] = React.useState(false);
  React.useEffect(() => { setOperator(!!getApiKey()); }, []);
  const copy = async () => {
    const payload = JSON.stringify(buildPrompt(a, r), null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setStatus(`Copied — ${Math.round(payload.length / 1024)}KB of JSON.`);
    } catch {
      // Clipboard access can be refused outright; hand over a file instead.
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${a.facts.symbol}-narrative-prompt.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('Clipboard refused — downloaded instead.');
    }
  };
  if (!operator) return null;
  return (
    <div className="mt-6 border-t border-border pt-4">
      <OSub className="mt-0">For the developer</OSub>
      <p className="max-w-[90ch] text-tiny leading-relaxed text-muted-foreground">
        The narrative is loaded by <code>src/lib/narrative.ts</code>, which tries a configured endpoint first, then the bundled{' '}
        <code>/data/research.json</code>, then falls back to the generated prose. To make it live, stand up a service that accepts the payload
        below, forwards <code>system</code> and <code>user</code> to a model, and returns <code>{'{ sections: … }'}</code>; then set{' '}
        <code>localStorage[&quot;mazvantage.narrative.endpoint&quot;]</code> to its URL. The key stays on your server — the browser never holds one.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={copy}>Copy the model prompt for this company</Button>
        <span className="text-tiny text-muted-foreground">{status}</span>
      </div>
    </div>
  );
}

function MethodologyCard({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  return (
    <OCard span={12} id="rsr-method">
      <OHead title="Research Methodology" />
      <p className="-mt-1 mb-4 max-w-[90ch] text-13 leading-relaxed text-muted-foreground">
        This report follows the layout and the section order of a Morningstar equity analyst report because that is a good structure for the
        argument. What sits inside the sections is arrived at differently, and the difference is worth being explicit about.
      </p>
      <DataTable headers={['Element', 'How a house like Morningstar arrives at it', 'How this report does']} rows={[
        ['The headline rating',
          'A star rating: the analyst’s price against the analyst’s own fair value, with a margin of safety that widens as their uncertainty rating rises.',
          `The Maz Vantage quant rating. ${r.quant.graded} ratios ranked as percentiles against the sector, averaged into five factor scores and then across them. Price multiples count, inside the Valuation factor; no fair value estimate does. It answers a different question from a star rating — how the company ranks against peers, not whether it is below intrinsic value.`],
        ['Fair value estimate',
          'One discounted cash flow, built and maintained by a named analyst who sets the revenue, margin and terminal assumptions.',
          `The median of ${r.fve.count || 'up to thirteen'} models — six DCFs, six relative multiples and a published levered DCF — run on consensus estimates. No assumption is set by hand, and it feeds the valuation zone only, never the rating.`],
        ['Uncertainty rating',
          'An analyst’s scenario analysis of the business, expressed as the interquartile range of possible intrinsic values.',
          'Six measured drivers — model spread, volatility, beta, leverage, margin variability and consensus dispersion — averaged. Catches a volatile, geared, hard-to-forecast company; misses a contingent risk not yet in the numbers.'],
        ['Economic moat',
          'A forecast that excess returns on capital persist ten years (narrow) or twenty (wide), reasoned from a named source of advantage.',
          'A measurement of how many of the last ten filed years earned more on capital than that capital cost. Backward-looking by construction, and it names no source of advantage.'],
        ['Capital allocation',
          'An analyst’s assessment of the balance sheet, investment record and distribution policy, including judgement on management.',
          'The same three legs, each scored from filed figures. No assessment of management is made or implied.'],
        ['The narrative',
          'Written by a named analyst who follows the company and signs the note.',
          nar
            ? `Written by ${nar.model} from a brief of pre-computed figures, under instructions to quote them verbatim and invent nothing. The model was given numbers and asked for prose; it was never asked for a number. No person reviewed it before publication.`
            : 'Assembled from the numbers on this page. Every sentence is built from a figure shown here, and a sentence whose inputs are missing is not written.'],
      ]} />
      <Notice className="mt-4">
        <b>This is not investment advice.</b> The ratings are arithmetic over filed accounts and published consensus, and each is reproducible from
        the table beside it — which is the one thing this report can offer that a signed analyst note cannot. What it cannot offer in return is
        the analyst’s judgement: no one here has met the management, read the contracts, or formed a view the numbers do not already contain.
      </Notice>
      {nar ? (
        <Notice className="mt-3">
          The prose on this page was <b>written by a language model</b>, not by a person, and was not reviewed by one. It is constrained to the
          figures in the tables and instructed to add no facts of its own, and the sections are rejected rather than shown if they come back
          malformed — but a model that follows those instructions perfectly is still summarising, and a summary can mislead by emphasis without
          stating anything false. Where the prose and the tables disagree, the tables are right.
        </Notice>
      ) : null}
      {a.sectorTable?.quality === 'seed' ? (
        <Notice error className="mt-3">
          The sector distributions behind the <b>quant rating</b> are <b>modelled, not measured</b> — see the sector-statistics builder. The
          rating, its factor scores and the ranked ratios all inherit that. The fair value, the uncertainty rating and the moat rating do not:
          none of them touches the sector table.
        </Notice>
      ) : null}
      <PromptTools a={a} r={r} />
    </OCard>
  );
}

/* ==========================================================================
   The tab — section order follows the source reports' contents page
   ========================================================================== */

export function ResearchTab({ a }: { a: Analysis }) {
  const r = React.useMemo(() => researchRatings(a), [a]);
  const [nar, setNar] = React.useState<Narrative>(null);

  /* The generated short form renders first; the narrative swaps in when it
     lands. A failure is silent: the short form is a complete report. */
  React.useEffect(() => {
    let live = true;
    setNar(null);
    fetchNarrative(a, r).then((n: any) => { if (live && n?.sections) setNar(n); }).catch(() => { /* keep the generated prose */ });
    return () => { live = false; };
  }, [a, r]);

  return (
    <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
      <RatingBandCard a={a} r={r} />
      <PriceVsFairValueCard a={a} r={r} />
      <AnalystNoteCard a={a} r={r} nar={nar} />
      <BusinessCard a={a} />
      <StrategyCard a={a} r={r} nar={nar} />
      <BullsBearsCard a={a} nar={nar} />
      <ScenarioCard a={a} />
      <CompetitorsCard a={a} />
      <MoatCard a={a} r={r} nar={nar} />
      <FairValueCard a={a} r={r} nar={nar} />
      <RiskCard a={a} r={r} nar={nar} />
      <CapitalCard a={a} r={r} nar={nar} />
      <FinancialsCard a={a} />
      <MethodologyCard a={a} r={r} nar={nar} />
    </div>
  );
}
