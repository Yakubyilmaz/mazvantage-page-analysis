'use client';

/* ==========================================================================
   Maz Vantage — the dividend composites, drawn in the report's grade design

   Two surfaces, one load:

   - **The Analysis tab**: an overview section and one section per composite,
     the shape the five factors use minus the flake. Every line's ratio table
     lives here.
   - **The Dividends tab**: each composite laid out as a factor tab lays out a
     factor — hero, the four composites beside it, the lines at both ends — and
     no ratio tables, which are one click away through each hero's link.

   Nothing here is a total: safety, growth and yield pull against each other
   by construction, and the page says so rather than averaging them.
   ========================================================================== */

import * as React from 'react';
import { dec, isNum } from '@/lib/format';
import { toneForLetter } from '@/lib/grading';
import { DIV_FACTORS } from '@/lib/dividend-lines';
import { DIV_MAX } from '@/lib/dividend-score';
import {
  basisLine, disclosureParas, divCheckCounts, divGroups, divLeaders, divLines, loadDividendScores,
  type DivFactor, type DivResult,
} from '@/lib/dividend-grades';
import type { Analysis } from '@/lib/model';
import { Block, Card, CardHead, Notice, OCard, OHead, OMore, SectionIntro } from '@/components/report/ui';
import { GradeBar, GradePill, OSub } from '@/components/report/grade-parts';
import { GradeTable, SubtopicSummary } from '@/components/report/grade-table';
import { LeadColumn } from '@/components/report/factor-view';
import { TickIcon } from '@/components/shell/icons';
import { useNav, type Nav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

/* ---------- the shared load, and "filled" -------------------------------------- */

type DivState = { status: 'loading' } | { status: 'ok'; r: DivResult } | { status: 'error'; error: string };

export function useDividendScores(a: Analysis): DivState {
  const [state, setState] = React.useState<DivState>({ status: 'loading' });
  React.useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadDividendScores(a)
      .then((r) => live && setState({ status: 'ok', r }))
      .catch((e) => live && setState({ status: 'error', error: String(e?.message || e) }));
    return () => { live = false; };
  }, [a]);
  return state;
}

/*
  Resolves once the Analysis sections have their contents. The four fill at the
  same moment, and the ones above a jump target grow by thousands of pixels as
  they do — so a jump that landed on an empty section is several screens wrong
  a beat later. The jump is repeated once they have filled.
*/
const FILLED = new WeakMap<object, { promise: Promise<void>; resolve: () => void }>();
function filledFor(a: object) {
  let d = FILLED.get(a);
  if (!d) {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => { resolve = res; });
    d = { promise, resolve };
    FILLED.set(a, d);
  }
  return d;
}

const ANCHORS = new Set(['dividend-grades', ...DIV_FACTORS.map((f) => f.anchor)]);

/**
 * Hold a jump that the sections are about to grow out from under — unless the
 * reader has moved in the meantime. The guard watches their input (wheel,
 * touch, key, mouse) rather than `scrollY`, which the browser moves on its own
 * to keep the view stable as content above grows.
 */
function keepAnchored(anchor: string, pending: Promise<void>) {
  let moved = false;
  const stop = () => { moved = true; };
  const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
  for (const name of events) window.addEventListener(name, stop, { passive: true });
  pending.then(() => {
    // After the commit that filled them, not before it.
    setTimeout(() => {
      for (const name of events) window.removeEventListener(name, stop);
      if (!moved) document.getElementById(anchor)?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
    }, 0);
  });
}

/** Open one composite on the Analysis tab, from a surface that is not it. */
export function openDividendSection(nav: Partial<Nav>, a: Analysis, anchor: string) {
  nav.openAnalysis?.(anchor);
  keepAnchored(anchor, filledFor(a).promise);
}

/* ---------- the parts both surfaces share ------------------------------------------ */

/** The score header — `FactorPanel`'s markup with the dividend's basis line. */
export function DivScorePanel({ f, r }: { f: DivFactor; r: DivResult }) {
  return (
    <div className="mt-4 rounded-[10px] bg-accent p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-13 text-muted-foreground">
          {f.title} grade <b className="text-foreground">{isNum(f.score) ? `${dec(f.score, 2)} / ${DIV_MAX}` : 'not assessed'}</b>
        </p>
        <GradePill score={f.score} letter={f.letter} size="lg" />
      </div>
      <GradeBar tone={toneForLetter(f.letter)} share={isNum(f.score) ? (f.score / DIV_MAX) * 100 : 0} />
      <p className="mt-2 text-tiny text-muted-foreground/80">{basisLine(f, r)}</p>
    </div>
  );
}

/** The four grades as one list, with one picked out — the flake's job, unflaked. */
export function DivGradeList({ r, hrefFor, highlight }: { r: DivResult; hrefFor?: (f: DivFactor) => string; highlight?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {r.order.map((key) => {
        const s = r.factors[key];
        const row = (
          <>
            <span className={cn('text-13 font-semibold', key === highlight ? 'text-foreground' : 'text-muted-foreground', 'group-hover:text-primary')}>{s.title}</span>
            <GradeBar tone={toneForLetter(s.letter)} share={isNum(s.score) ? (s.score / DIV_MAX) * 100 : 0} className="mt-0 h-2 rounded" />
            <GradePill score={s.score} letter={s.letter} />
          </>
        );
        const cls = cn('group grid grid-cols-[150px_1fr_auto] items-center gap-4 rounded-lg px-2 py-2 max-md:grid-cols-[110px_1fr_auto] max-md:gap-3',
          key === highlight && 'bg-accent');
        const href = hrefFor?.(s);
        return href ? <a key={key} href={href} className={cls}>{row}</a> : <div key={key} className={cls}>{row}</div>;
      })}
    </div>
  );
}

const md = (text: string) => text.split(/(\*\*.+?\*\*)/g).map((part, i) =>
  part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part);

function DisclosureBody({ r, className }: { r: DivResult; className?: string }) {
  return (
    <div className={cn('grid max-w-[94ch] gap-3 [&_b]:font-semibold [&_b]:text-foreground', className)}>
      {disclosureParas(r).map((t, i) => <p key={i} className="text-tiny leading-[1.65] text-muted-foreground">{md(t)}</p>)}
    </div>
  );
}

function LapsedNotice({ r }: { r: DivResult }) {
  const last = r.inputs.lastPaymentAt
    ? new Date(r.inputs.lastPaymentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'some time ago';
  return (
    <Notice warn className="mt-4">
      <b>This dividend is lapsing.</b> The last regular payment was {last}, more than two expected intervals ago.
      The forward lines report nothing rather than annualising a payment that has stopped being declared, and the
      trailing lines are falling toward zero on their own.
    </Notice>
  );
}

function ReitNotice() {
  return (
    <Notice warn className="mt-4">
      <b>Read the safety grade with care for a REIT.</b> A property trust pays out of funds from operations, and
      depreciation drives its net income far below the cash it collects — so a payout ratio measured on earnings
      reads well above 100% for a perfectly sound trust. The ranking is against other property payers, which absorbs
      some of this, but the specification is explicit that these formulas misread for the sector until funds from
      operations replaces the denominator.
    </Notice>
  );
}

/** The seed-table warning, worded as the Ratings tab words the equity one. */
function SeedNotice({ r }: { r: DivResult }) {
  if (r.table.quality !== 'seed') return null;
  return (
    <Notice className="mt-4">
      The payer distributions behind these grades are <b>modelled, not measured</b> — shaped from sector norms so
      the module ranks sensibly. The ordering within a sector is meaningful; the exact percentile is not yet.
    </Notice>
  );
}

/** Why the four do not add up to one number. Printed, not left to be noticed. */
function NoTotalLine({ r }: { r: DivResult }) {
  return (
    <p className="mt-2 text-sm leading-relaxed">
      Four composites on a 1 to 5 scale, each ranked against the dividend payers in <b>{r.inputs.sector || 'this sector'}</b>.
      There is deliberately no overall dividend grade: safety, growth and yield pull against each other by
      construction, so an average of the four would hide the very tension worth reading.
    </p>
  );
}

function NotAPayer({ a, r }: { a: Analysis; r: DivResult }) {
  return (
    <p className="mt-2 text-sm leading-relaxed">
      <b>{a.facts?.name || 'This company'} is not in the dividend universe.</b> {r.why}
    </p>
  );
}

function Warnings({ r }: { r: DivResult }) {
  return (
    <>
      <SeedNotice r={r} />
      {r.lapsed ? <LapsedNotice r={r} /> : null}
      {r.inputs.sector === 'Real Estate' ? <ReitNotice /> : null}
    </>
  );
}

const INTRO = 'Four composites from the dividend module, each the weighted average of its own lines and each '
  + 'ranked against the dividend payers in this sector rather than against the whole of it.';

/* ==========================================================================
   The Analysis tab — one overview section, one section per composite
   ========================================================================== */

export function DividendGradeSections({ a }: { a: Analysis }) {
  const state = useDividendScores(a);
  const name = a.facts.name;

  // The boot-time hash jump into one of these sections, held the same way.
  React.useEffect(() => {
    const wanted = window.location.hash.slice(1);
    if (ANCHORS.has(wanted)) keepAnchored(wanted, filledFor(a).promise);
  }, [a]);
  React.useEffect(() => {
    if (state.status !== 'loading') filledFor(a).resolve();
  }, [a, state.status]);

  /* Built empty before the payer table lands: every other anchor on the tab
     exists the moment the tab does, and a section that appeared a fetch later
     would swallow every link to it. */
  if (state.status === 'loading') {
    return (
      <>
        {[{ anchor: 'dividend-grades', title: 'Dividend Grades', question: INTRO }, ...DIV_FACTORS].map((f) => (
          <Card key={f.anchor} id={f.anchor}>
            <CardHead title={`${name} ${f.title}`} sub={f.question} />
            <p className="mt-2 text-sm text-muted-foreground">Ranking against sector payers…</p>
          </Card>
        ))}
      </>
    );
  }
  if (state.status === 'error') {
    return (
      <Card id="dividend-grades">
        <CardHead title={`${name} Dividend Grades`} />
        <Notice error>The dividend grades could not be built — {state.error}.</Notice>
      </Card>
    );
  }

  const { r } = state;
  return (
    <>
      <Card id="dividend-grades">
        <CardHead title={`${name} Dividend Grades`} sub={INTRO} />
        {r.pays ? <NoTotalLine r={r} /> : <NotAPayer a={a} r={r} />}
        {r.pays ? (
          <>
            <Warnings r={r} />
            <Block title="Dividend Grades" desc={`Each grade is the weighted average of its lines, on a scale of 1 to ${DIV_MAX}.`}>
              <DivGradeList r={r} hrefFor={(s) => `#${s.anchor}`} />
            </Block>
            <Block title="Where these grades come from" desc="The universe, the arithmetic and the two figures that stand in for feeds this data source does not carry.">
              <DisclosureBody r={r} className="[&_p]:text-13" />
            </Block>
          </>
        ) : null}
      </Card>
      {/* A non-payer has no composites at all — the overview says so in one
          line, and four empty sections under it would say it four more times. */}
      {r.pays ? r.order.map((key) => {
        const f = r.factors[key];
        return (
          <Card key={key} id={f.anchor}>
            {/* The factor section with the flake taken out, and nothing else:
                the intro keeps the width a wedge would have taken. */}
            <SectionIntro title={`${name} ${f.title}`}>
              <p className="mt-1 text-13 text-muted-foreground">{f.question}</p>
              <p className="mt-2 text-sm leading-relaxed">{f.blurb}</p>
              <DivScorePanel f={f} r={r} />
            </SectionIntro>
            {divGroups(f, r).map((g) => (
              <Block key={g.name} title={g.name} desc={g.desc}>
                <SubtopicSummary a={a} metrics={g.metrics} />
                <GradeTable a={a} metrics={g.metrics} />
              </Block>
            ))}
          </Card>
        );
      }) : null}
    </>
  );
}

/* ==========================================================================
   The Dividends tab — each composite as a factor tab lays out a factor
   ========================================================================== */

const heroId = (key: string) => `dvg-${key}`;

function Hero({ a, r, f }: { a: Analysis; r: DivResult; f: DivFactor }) {
  const nav = useNav();
  const share = isNum(f.coverage) ? Math.round(f.coverage * 100) : null;
  const checks = divCheckCounts(divLines(f, r));
  const tile = (state: 'pass' | 'fail' | 'na', count: number, label: string) => (
    <div className="flex items-center gap-3 rounded-[10px] border border-border bg-muted p-3">
      <TickIcon kind={state} className={cn('size-5', state === 'pass' ? 'text-up' : state === 'fail' ? 'text-down' : 'text-muted-foreground/60')} />
      <div>
        <b className="block text-[21px] font-bold leading-[1.1] tnum">{count}</b>
        <span className="mt-0.5 block text-micro text-muted-foreground">{label}</span>
      </div>
    </div>
  );
  return (
    <OCard span={8} id={heroId(f.key)}>
      <OHead title={f.title} aside={<GradePill score={f.score} letter={f.letter} size="lg" />} />
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{f.question}</p>
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-4xl font-bold leading-none tracking-[-.02em] tnum">{isNum(f.score) ? dec(f.score, 2) : '—'}</b>
        <i className="text-sm not-italic text-muted-foreground">/{DIV_MAX}</i>
        <span className="ml-auto text-tiny text-muted-foreground/80">
          {f.gradedLines} of {f.totalLines} lines weighted
          {isNum(share) ? ` · ${share}% of the designed weight` : ''}
          {f.rank ? ` · ${f.rank.text} of ${r.inputs.sector || 'sector'} payers` : ''}
        </span>
      </div>
      <GradeBar tone={toneForLetter(f.letter)} share={isNum(f.score) ? (f.score / DIV_MAX) * 100 : 0} />
      <OSub info="How many of this composite’s lines fall on the better side of the median across sector payers. A reading aid only: the tick is never summed into a grade, and the score above is the weighted mean of the line percentiles rather than of these.">
        Against the payer median
      </OSub>
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        {tile('pass', checks.pass, 'beat the median')}
        {tile('fail', checks.fail, 'below it')}
        {tile('na', checks.na, 'not ranked')}
      </div>
      <OMore onClick={() => openDividendSection(nav, a, f.anchor)}>Read every line</OMore>
    </OCard>
  );
}

function Composite({ a, r, f }: { a: Analysis; r: DivResult; f: DivFactor }) {
  const { above, below } = divLeaders(divLines(f, r), f.score);
  return (
    <>
      <Hero a={a} r={r} f={f} />
      <OCard span={4} id={`dvg-peers-${f.key}`}>
        <OHead title="Against the other composites" info="The four are deliberately not averaged. Safety, growth and yield pull against each other by construction, and the tension between them is the finding." />
        <DivGradeList r={r} hrefFor={(s) => `#${heroId(s.key)}`} highlight={f.key} />
      </OCard>
      {/* One card, because the split is the point: the same columns down both
          halves, so a line carrying the grade and one dragging it read together. */}
      {above.length || below.length ? (
        <OCard span={12} id={`dvg-${f.key}-lines`}>
          <OHead title="Lines behind the grade" info={`Split at the composite’s own score: every line on the left grades at or above it, every one on the right below it. Five of each at most, out of ${f.totalLines}. Every line, with its weight and the sentence behind it, is under Dividend Grades on the Analysis tab.`} />
          <div className="grid gap-8 lg:grid-cols-2">
            <LeadColumn a={a} title={`Carrying the ${f.title.toLowerCase()} grade`} metrics={above} empty="No line falls on this side of the grade." />
            <LeadColumn a={a} title="Holding it back" metrics={below} empty="No line falls on this side of the grade." />
          </div>
        </OCard>
      ) : null}
    </>
  );
}

/**
 * The panel. A nested grid rather than cards spread into the tab's own: the
 * panel is one thing, and its cards keep their twelve columns whatever the
 * panel above them is doing.
 */
export function DividendScoresPanel({ a }: { a: Analysis }) {
  const state = useDividendScores(a);
  const grid = 'col-span-12 grid grid-cols-12 gap-6 max-lg:col-span-1 max-lg:grid-cols-1';
  if (state.status !== 'ok') {
    return (
      <div className={grid}>
        <OCard span={12} id={state.status === 'error' ? 'dvg-error' : 'dvg-loading'}>
          <OHead title="Dividend grades" />
          {state.status === 'error'
            ? <Notice error>The dividend grades could not be built — {state.error}.</Notice>
            : <p className="text-sm text-muted-foreground">Ranking against sector payers…</p>}
        </OCard>
      </div>
    );
  }
  const { r } = state;
  return (
    <div className={grid}>
      <OCard span={12} id="dvg-overview">
        <OHead title="Dividend grades" />
        <p className="text-sm leading-relaxed text-muted-foreground">{INTRO}</p>
        {r.pays ? <NoTotalLine r={r} /> : <NotAPayer a={a} r={r} />}
        {r.pays ? (
          <>
            <Warnings r={r} />
            {/* Folded away: the grades are what a reader came for. */}
            <details className="group mt-4">
              <summary className="cursor-pointer text-13 font-semibold text-muted-foreground marker:text-muted-foreground/60 hover:text-foreground">
                Where these grades come from
              </summary>
              <DisclosureBody r={r} className="mt-3" />
            </details>
          </>
        ) : null}
      </OCard>
      {r.pays ? r.order.map((key) => <Composite key={key} a={a} r={r} f={r.factors[key]} />) : null}
    </div>
  );
}
