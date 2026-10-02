'use client';

/* ==========================================================================
   Maz Vantage — graded factor views

   A factor on the Analysis tab (a header with its 0-5 score and letter, then
   a block per subtopic holding its ratio table), the Ratings section, a
   factor as its own tab, and the Ratings tab. Nothing here re-grades
   anything: `gradeAll()` has already run and this is `a.scores` laid out.
   ========================================================================== */

import * as React from 'react';
import { dec, fmtDate, isNum, money, mult } from '@/lib/format';
import { MAX_SCORE, histogramRank, letterFor, rankLabel, toneForLetter, verdictTone, verdictWord } from '@/lib/grading';
import { FACTOR_BY_KEY, type FactorKey, type FactorScore, type GradedMetric } from '@/lib/factors';
import type { Analysis } from '@/lib/model';
import { AXES, Snowflake } from '@/components/charts/snowflake';
import { Block, Card, KeyInfo, Notice, OCard, OHead, OMore, SectionIntro } from '@/components/report/ui';
import { GradeBar, GradePill, MedianCell, OSub, RankBar } from '@/components/report/grade-parts';
import { GradeTable, SubtopicSummary } from '@/components/report/grade-table';
import { EXTRAS, GROUP_PANELS } from '@/components/report/factor-panels';
import { FairValuePanel } from '@/components/report/fair-value';
import { TickIcon } from '@/components/shell/icons';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

const flakeScores = (a: Analysis) => Object.fromEntries(AXES.map((x) => [x.key, (a.scores as any)[x.key]?.score ?? null]));

/* ==========================================================================
   The factor section (Analysis tab)
   ========================================================================== */

/** The score header at the top of a factor. */
function FactorPanel({ f }: { f: FactorScore }) {
  const missing = f.total - f.graded;
  return (
    <div className="mt-4 rounded-[10px] bg-accent p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-13 text-muted-foreground">
          {f.title} grade <b className="text-foreground">{isNum(f.score) ? `${dec(f.score, 2)} / ${MAX_SCORE}` : 'not assessed'}</b>
        </p>
        <GradePill score={f.score} letter={f.letter} size="lg" />
      </div>
      <GradeBar score={f.score} letter={f.letter} />
      <p className="mt-2 text-tiny text-muted-foreground/80">
        Averaged across {f.graded} of {f.total} ratios{missing ? `; ${missing} could not be assessed from the available data.` : '.'}
      </p>
    </div>
  );
}

export function FactorSection({ a, factorKey }: { a: Analysis; factorKey: FactorKey }) {
  const meta = FACTOR_BY_KEY[factorKey];
  const f = a.scores[factorKey];
  if (!meta || !f) return null;
  return (
    <Card id={meta.anchor}>
      <SectionIntro
        title={meta.title}
        // The flake repeats in every factor section, with this factor's spoke
        // picked out — where this grade sits against the other four without
        // scrolling back to the overview.
        aside={<Snowflake scores={flakeScores(a)} size={300} highlight={factorKey} />}
        className="max-md:flex-col max-md:items-stretch"
      >
        <p className="mt-1 text-13 text-muted-foreground">{meta.question.replace('{SYM}', a.facts.symbol)}</p>
        <FactorPanel f={f} />
      </SectionIntro>
      {/* Subtopics carry no grade of their own: the factor grade is the mean
          of the ratio rows rather than of the subtopics. */}
      {f.groups.map((group) => {
        const Panel = group.panel ? GROUP_PANELS[group.panel] : null;
        const extra = Panel ? null : EXTRAS[`${factorKey}.${group.key}`]?.(a) ?? null;
        return (
          <Block key={group.key} title={group.title} desc={group.desc}>
            {Panel ? <Panel a={a} /> : (
              <>
                <SubtopicSummary a={a} metrics={group.metrics} />
                <GradeTable a={a} metrics={group.metrics} />
                {extra ? <div className="mt-6">{extra}</div> : null}
              </>
            )}
          </Block>
        );
      })}
    </Card>
  );
}

/* ==========================================================================
   Ratings (Analysis tab section)
   ========================================================================== */

function FactorGradeList({ a }: { a: Analysis }) {
  return (
    <div className="flex flex-col gap-3">
      {Object.values(FACTOR_BY_KEY).map((meta) => {
        const s = a.scores[meta.key];
        return (
          <a key={meta.key} href={`#${meta.anchor}`}
            className="group grid grid-cols-[150px_1fr_auto] items-center gap-4 py-2 max-md:grid-cols-[110px_1fr_auto] max-md:gap-3">
            <span className="text-13 font-semibold group-hover:text-primary">{meta.title}</span>
            <GradeBar score={s.score} letter={s.letter} className="mt-0 h-2 rounded" />
            <GradePill score={s.score} letter={s.letter} />
          </a>
        );
      })}
    </div>
  );
}

const BANDS = ['Strong sell', 'Sell', 'Hold', 'Buy', 'Strong buy'];
const BAND_TONE = ['var(--grade-poor)', 'var(--grade-weak)', 'var(--grade-mid)', 'var(--grade-good)', 'var(--grade-strong)'];

function distributionLine(a: Analysis, overall: any, rank: ReturnType<typeof histogramRank>) {
  const t = a.sectorTable;
  const sector = a.facts.sector || 'listed';
  if (!isNum(overall.score)) return 'Not enough graded ratios to place this company in its sector.';
  if (!rank) {
    return isNum(t.count)
      ? `Grades ${dec(overall.score, 2)} out of ${MAX_SCORE}. No score distribution is loaded for the ${sector} sector, so this is the grade alone rather than a ranking.`
      : `Grades ${dec(overall.score, 2)} out of ${MAX_SCORE}.`;
  }
  const label = rankLabel(rank.pctile)!;
  const claim = `${label.text} of the ${sector} sector — ranked better than ${rank.better.toLocaleString('en-US')} of ${rank.total.toLocaleString('en-US')} companies.`;
  // On the seed table that count is a modelled shape, not a census — and a
  // precise-looking "better than 627 of 930" is exactly the number people quote.
  return t.quality === 'seed' ? `${claim} Both the spread and the count come from the modelled seed distribution, not a measured one.` : claim;
}

/**
 * The sector's whole score distribution, with the company's bucket picked out.
 * Height is share of the sector scaled to the tallest bucket: the shape is the
 * point, and the absolute counts are in the caption.
 */
function DistributionChart({ a, rank }: { a: Analysis; rank: ReturnType<typeof histogramRank> }) {
  const hist = a.sectorTable.overall;
  const bins: number[] | undefined = hist?.bins;
  if (!Array.isArray(bins) || !bins.length) return null;
  const peak = Math.max(...bins);
  if (!(peak > 0)) return null;
  const W = 100;
  const H = 34;
  const GAP = 0.35;
  const barW = W / bins.length;
  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[92px] w-full" role="img"
        aria-label={rank ? `Distribution of grades across the ${a.facts.sector || 'sector'}: ${a.facts.symbol} sits in the bucket better than ${rank.better} of ${rank.total} companies.` : `Distribution of grades across the ${a.facts.sector || 'sector'}.`}>
        {bins.map((count, i) => {
          const h = (count / peak) * (H - 1);
          const lo = (i * (hist.max ?? MAX_SCORE)) / bins.length;
          const hi = ((i + 1) * (hist.max ?? MAX_SCORE)) / bins.length;
          return (
            <rect key={i} x={i * barW + GAP / 2} y={H - h} width={Math.max(0.1, barW - GAP)} height={Math.max(0.4, h)}
              fill={rank && i === rank.binIndex ? 'var(--primary)' : 'var(--border)'}>
              <title>{`${dec(lo, 2)}–${dec(hi, 2)}: ${count.toLocaleString('en-US')} companies`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-2 flex items-baseline justify-between text-tiny text-muted-foreground/80 tnum">
        <span>0</span>
        <span className="text-muted-foreground">
          {a.sectorTable.quality === 'seed' ? `${a.facts.sector || 'Sector'} grade distribution (modelled)` : `${a.facts.sector || 'Sector'} grade distribution`}
        </span>
        <span>{MAX_SCORE}</span>
      </div>
    </div>
  );
}

export function DistributionStrip({ a, overall }: { a: Analysis; overall: any }) {
  const pos = isNum(overall.score) ? (overall.score / MAX_SCORE) * 100 : null;
  const rank = histogramRank(overall.score, a.sectorTable.overall);
  return (
    <div>
      <div className="relative pt-[46px]">
        <div className="flex gap-[3px]">
          {BANDS.map((label, i) => (
            <span key={label} className="flex flex-1 flex-col gap-1 rounded-md bg-muted px-3 py-2 text-center">
              <i className="text-13 font-bold not-italic" style={{ color: BAND_TONE[i] }}>{i + 1}</i>
              <span className="text-tiny text-muted-foreground max-md:hidden">{label}</span>
            </span>
          ))}
        </div>
        {pos == null ? null : (
          <div className="absolute top-0 -translate-x-1/2 after:mx-auto after:mt-1 after:block after:h-3 after:w-0.5 after:bg-border after:content-['']" style={{ left: `${pos}%` }}>
            <GradePill score={overall.score} letter={overall.letter} size="lg" />
          </div>
        )}
      </div>
      <DistributionChart a={a} rank={rank} />
      <p className="mt-6 text-13 text-muted-foreground">{distributionLine(a, overall, rank)}</p>
    </div>
  );
}

/**
 * The count that used to sit in a "ratios used" column — the same number
 * repeated down the table — belongs in the description once instead.
 */
function competitorNote(a: Analysis) {
  const n = a.peers.self?.common ?? a.peers.self?.scoredOn ?? null;
  const basis = isNum(n) && n > 0
    ? `the ${n} trailing ratio${n === 1 ? '' : 's'} all of them share`
    : 'the trailing ratios this report already fetches for each of them';
  return `${a.facts.symbol} and its peers scored on the same reduced set — ${basis}. That is far short of the full model, so read this as a sort order rather than a verdict.`;
}

function CompetitorTable({ a }: { a: Analysis }) {
  const nav = useNav();
  const rows = [...a.peers.peers]
    .map((p: any) => ({ ...p }))
    .concat([{
      symbol: a.facts.symbol, name: a.facts.name, marketCap: a.facts.marketCap, pe: a.facts.pe, self: true,
      // The reduced score, not the full-model one, so the column compares like with like.
      score: a.peers.self?.score ?? null,
    }])
    .sort((x: any, y: any) => (y.score ?? -1) - (x.score ?? -1));
  if (rows.length < 2) return <Notice>No peer list is available for this company.</Notice>;
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="text-13">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
            <th className="border-b border-border px-3 py-2 text-left font-semibold">Company</th>
            <th className="border-b border-border px-3 py-2 text-right font-semibold">Market cap</th>
            <th className="border-b border-border px-3 py-2 text-right font-semibold">P/E</th>
            <th className="border-b border-border px-3 py-2 text-right font-semibold">Grade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p: any) => (
            <tr key={p.symbol} className={cn('hover:bg-accent/60', p.self && 'bg-primary/5')}>
              <td className="border-b border-border p-3">
                {p.self ? <b className="text-primary">{p.symbol}</b> : (
                  <button type="button" className="font-bold hover:text-primary" onClick={() => nav.goSymbol(p.symbol)}>{p.symbol}</button>
                )}
                <span className="ml-2 text-tiny text-muted-foreground">{p.name || ''}</span>
              </td>
              <td className="border-b border-border p-3 text-right tnum">{money(p.marketCap)}</td>
              <td className="border-b border-border p-3 text-right tnum">{isNum(p.pe) ? mult(p.pe) : 'n/a'}</td>
              <td className="border-b border-border p-3 text-right"><GradePill score={p.score} letter={letterFor(p.score)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RatingsSection({ a }: { a: Analysis }) {
  const f = a.facts;
  const t = a.sectorTable;
  return (
    <Card id="ratings">
      <div className="mb-4">
        <h2 className="text-lg font-[650] tracking-[-.02em]">{f.name} Factor Grades</h2>
        <p className="mt-1 text-13 text-muted-foreground">
          Every ratio in this report is ranked against the {f.sector || 'wider'} sector, then averaged up into the five factor grades below.
        </p>
      </div>
      {t.quality === 'seed' ? (
        <Notice className="mb-6">
          The sector distributions behind these grades are <b>modelled, not measured</b> — shaped around published sector medians so
          the report grades sensibly.
        </Notice>
      ) : null}
      <Block title="Factor Grades" desc={`Each grade is the mean of its ratios, on a scale of 0 to ${MAX_SCORE}.`}>
        <FactorGradeList a={a} />
      </Block>
      <Block title="Score Distribution" desc={t.available
        ? `Where ${f.symbol}'s overall grade falls among the ${f.sector || 'listed'} sector.`
        : 'No sector distribution is loaded, so the overall grade is shown without a ranking.'}>
        <DistributionStrip a={a} overall={a.scores.overall} />
      </Block>
      <Block title="Competitor Ranking" desc={competitorNote(a)}>
        <CompetitorTable a={a} />
      </Block>
    </Card>
  );
}

/* ==========================================================================
   A factor as its own tab

   The same graded ratios, opened out: a hero with the grade, the handful of
   ratios carrying it and the handful dragging it, then the panels only this
   factor has. Two factors show only summaries by choice — the Analysis tab is
   where every ratio table lives, and repeating them made two tabs the same
   page twice.
   ========================================================================== */

const groupId = (key: string, groupKey: string) => `ft-${key}-${groupKey}`;

/**
 * The tick, counted. Never summed into a grade; `ungraded` metrics are left
 * out so the three counts total the set "N of M ratios graded" describes.
 */
function countChecks(f: FactorScore) {
  const out = { pass: 0, fail: 0, na: 0 };
  for (const g of f.groups) {
    for (const m of g.metrics) {
      if (m.ungraded) continue;
      if (m.vsMedian === 'pass') out.pass++;
      else if (m.vsMedian === 'fail') out.fail++;
      else out.na++;
    }
  }
  return out;
}

function FactorHero({ a, factorKey, f }: { a: Analysis; factorKey: FactorKey; f: FactorScore }) {
  const nav = useNav();
  const meta = FACTOR_BY_KEY[factorKey];
  const missing = f.total - f.graded;
  const checks = countChecks(f);
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
    <OCard span={8} id={`ft-${factorKey}`}>
      <OHead title={meta.title} aside={<GradePill score={f.score} letter={f.letter} size="lg" />} />
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{meta.question.replace('{SYM}', a.facts.symbol)}</p>
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="text-4xl font-bold leading-none tracking-[-.02em] tnum">{isNum(f.score) ? dec(f.score, 2) : '—'}</b>
        <i className="text-sm not-italic text-muted-foreground">/{MAX_SCORE}</i>
        <span className="ml-auto text-tiny text-muted-foreground/80">
          {f.graded} of {f.total} ratios graded{missing ? ` · ${missing} not assessed` : ''}
        </span>
      </div>
      <GradeBar score={f.score} letter={f.letter} />
      <OSub info="How many of this factor’s ratios fall on the better side of the sector median. A reading aid only: the tick is never summed into a grade, and the score above is the mean of the ratio percentiles rather than of these.">
        Against the sector median
      </OSub>
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        {tile('pass', checks.pass, 'beat the median')}
        {tile('fail', checks.fail, 'below it')}
        {tile('na', checks.na, 'not assessed')}
      </div>
      <OMore onClick={() => nav.openAnalysis?.(meta.anchor)}>Read the full analysis</OMore>
    </OCard>
  );
}

function FlakeCard({ a, id, title, highlight }: { a: Analysis; id: string; title: string; highlight?: string }) {
  const nav = useNav();
  return (
    <OCard span={4} id={id}>
      <OHead title={title} />
      {/* The wedges open their own tab here: their default scrolls to an anchor
          on the Analysis panel, which is not what the reader is looking at. */}
      <div className="grid place-items-center">
        <Snowflake scores={flakeScores(a)} size={268} highlight={highlight} onSelect={(ax) => nav.openFactor?.(ax.key)} />
      </div>
    </OCard>
  );
}

/** Figure, what it was measured against, where that puts it, and the grade. */
function LeadRow({ m, factor }: { m: GradedMetric; factor?: string }) {
  const fmt = m.fmt || ((v: number) => dec(v, 2));
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_auto_126px_auto] items-center gap-3 border-b border-border py-[9px] text-13 last:border-b-0">
      <span className="leading-snug" title={m.label}>
        {m.label}
        {factor ? <i className="mt-px block text-micro not-italic text-muted-foreground/70">{factor}</i> : null}
      </span>
      <span className="whitespace-nowrap text-right font-semibold tnum">{isNum(m.value) ? fmt(m.value) : 'n/a'}</span>
      <span className="whitespace-nowrap text-right text-muted-foreground tnum"><MedianCell m={m} fmt={fmt} /></span>
      <RankBar m={m} className="min-w-0" />
      <span className="text-right"><GradePill score={m.grade} letter={m.letter} /></span>
    </li>
  );
}

/**
 * One half of a "ratios behind the grade" card: a heading, a column head, and
 * its ratios. Exported for the dividend composites, which put their own lines
 * through it.
 */
export function LeadColumn({ a, title, metrics, withFactor = false, empty = 'No ratio falls on this side of the grade.' }: {
  a: Analysis; title: string; metrics: (GradedMetric & { factor?: string })[]; withFactor?: boolean; empty?: string;
}) {
  return (
    <div className="min-w-0">
      <OSub className="mt-0">{title}</OSub>
      {metrics.length ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_126px_auto] items-center gap-3 border-b border-border py-2 text-micro font-medium uppercase tracking-[.05em] text-muted-foreground">
            <span>Ratio</span><span className="text-right">{a.facts.symbol}</span><span className="text-right">Median</span><span>Ranking</span><span className="text-right">Grade</span>
          </div>
          <ul className="grid">{metrics.map((m) => <LeadRow key={`${m.id}-${m.factor ?? ''}`} m={m} factor={withFactor ? m.factor : undefined} />)}</ul>
        </>
      ) : <p className="py-3 text-13 text-muted-foreground">{empty}</p>}
    </div>
  );
}

function GroupCard({ a, factorKey, group }: { a: Analysis; factorKey: FactorKey; group: FactorScore['groups'][number] }) {
  const Panel = group.panel ? GROUP_PANELS[group.panel] : null;
  const extra = Panel ? null : EXTRAS[`${factorKey}.${group.key}`]?.(a) ?? null;
  return (
    <OCard span={12} id={groupId(factorKey, group.key)}>
      <OHead title={group.title} aside={isNum(group.score) ? <GradePill score={group.score} letter={group.letter} /> : null} />
      {group.desc ? <p className="-mt-1 mb-4 text-13 leading-relaxed text-muted-foreground">{group.desc}</p> : null}
      {Panel ? <Panel a={a} /> : (
        <>
          <SubtopicSummary a={a} metrics={group.metrics} />
          <GradeTable a={a} metrics={group.metrics} />
          {extra ? <div className="mt-6">{extra}</div> : null}
        </>
      )}
    </OCard>
  );
}

function fairValueCard(a: Analysis) {
  const m = (a.scores.valuation?.groups || []).flatMap((g) => g.metrics).find((x) => x.id === 'dcfDiscount');
  if (!m) return null;
  return (
    <OCard span={12} id="ft-valuation-fairvalue" key="fv">
      <OHead title="Fair value models" />
      <FairValuePanel a={a} m={m} />
    </OCard>
  );
}

const onlyGroups = (key: FactorKey, wanted: string[]) => (a: Analysis) =>
  wanted.map((gk) => {
    const g = (a.scores[key]?.groups || []).find((x) => x.key === gk);
    return g ? <GroupCard key={gk} a={a} factorKey={key} group={g} /> : null;
  });

const FACTOR_TAB_DETAIL: Partial<Record<FactorKey, (a: Analysis) => React.ReactNode[]>> = {
  growth: () => [],
  // The three that keep something keep what exists nowhere else in the
  // product: the thirteen fair-value models, and the two Sankeys.
  valuation: (a) => [fairValueCard(a)],
  profitability: onlyGroups('profitability', ['flow', 'costofcapital']),
  health: onlyGroups('health', ['sheet']),
};

export function FactorTab({ a, factorKey }: { a: Analysis; factorKey: FactorKey }) {
  const meta = FACTOR_BY_KEY[factorKey];
  const f = a.scores[factorKey];
  if (!meta || !f) return null;

  const ranked = f.groups.flatMap((g) => g.metrics)
    .filter((m) => !m.ungraded && isNum(m.grade) && isNum(m.pctile))
    .sort((x, y) => (y.grade as number) - (x.grade as number));
  // Split at the factor's own score, so both headings are true by construction.
  const above = ranked.filter((m) => (m.grade as number) >= (f.score as number)).slice(0, 5);
  const below = ranked.filter((m) => (m.grade as number) < (f.score as number))
    .sort((x, y) => (x.grade as number) - (y.grade as number)).slice(0, 5);
  const detail = FACTOR_TAB_DETAIL[factorKey]
    ? FACTOR_TAB_DETAIL[factorKey]!(a)
    : f.groups.map((g) => <GroupCard key={g.key} a={a} factorKey={factorKey} group={g} />);

  return (
    <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
      <FactorHero a={a} factorKey={factorKey} f={f} />
      <FlakeCard a={a} id={`ft-flake-${factorKey}`} title="Against the other factors" highlight={factorKey} />
      {above.length || below.length ? (
        <OCard span={12} id={`ft-${factorKey}-ratios`}>
          <OHead title="Ratios behind the grade"
            info="Split at the factor’s own score: every ratio on the left grades at or above it, every one on the right below it. Five of each at most." />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(470px,100%),1fr))] gap-x-8 gap-y-2">
            <LeadColumn a={a} title={`Carrying the ${meta.title.toLowerCase()} grade`} metrics={above} />
            <LeadColumn a={a} title="Holding it back" metrics={below} />
          </div>
        </OCard>
      ) : null}
      {detail}
    </div>
  );
}

/* ==========================================================================
   Ratings as its own tab — the grade, taken apart: the five factors with the
   question each was asked, the spread of the graded ratios, the ends of the
   whole report, the peer sort, and a card saying what the number is and is not.
   ========================================================================== */

function allGraded(a: Analysis) {
  const out: (GradedMetric & { factor: string; factorKey: FactorKey })[] = [];
  for (const meta of Object.values(FACTOR_BY_KEY)) {
    for (const g of a.scores[meta.key]?.groups || []) {
      for (const m of g.metrics) {
        if (m.ungraded) continue;
        out.push({ ...m, factor: meta.title, factorKey: meta.key });
      }
    }
  }
  return out;
}

function countShown(a: Analysis) {
  let n = 0;
  for (const meta of Object.values(FACTOR_BY_KEY)) {
    for (const g of a.scores[meta.key]?.groups || []) for (const m of g.metrics) if (m.ungraded) n += 1;
  }
  return n;
}

const VERDICT_CLASS: Record<string, string> = { good: 'text-up', warn: 'text-grade-mid', bad: 'text-down', muted: 'text-muted-foreground' };

const SPREAD_BANDS = [
  { tone: 'strong', label: 'A band', note: 'Top of the sector' },
  { tone: 'good', label: 'B band', note: 'Better than most of the sector' },
  { tone: 'mid', label: 'C band', note: 'Around the sector middle' },
  { tone: 'weak', label: 'D band', note: 'Below most of the sector' },
  { tone: 'poor', label: 'F band', note: 'Bottom of the sector' },
] as const;

export function RatingsTab({ a }: { a: Analysis }) {
  const nav = useNav();
  const f = a.facts;
  const t = a.sectorTable;
  const overall = a.scores.overall || ({} as any);
  const rows = allGraded(a);
  const graded = rows.filter((m) => isNum(m.grade));
  const verdict = verdictWord(overall.score);

  const ranked = [...graded].filter((m) => isNum(m.pctile)).sort((x, y) => (y.grade as number) - (x.grade as number));
  const best = ranked.slice(0, 5);
  // Off the other end, and never the same rows.
  const worst = ranked.slice(Math.max(best.length, ranked.length - 5)).reverse();

  const counts: Record<string, number> = Object.fromEntries(SPREAD_BANDS.map((b) => [b.tone, 0]));
  for (const m of graded) {
    const tone = toneForLetter(m.letter ?? letterFor(m.grade));
    if (tone in counts) counts[tone] += 1;
  }
  const missing = rows.length - graded.length;
  const unassessed = rows.filter((m) => !isNum(m.grade)).map((m) => m.label);

  return (
    <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
      <OCard span={8} id="rt-overall">
        <OHead title={`${f.name} rating`} aside={<GradePill score={overall.score} letter={overall.letter} size="lg" />}
          info={`The mean of the five factor grades, each of them the mean of its ratios, each of those a percentile against the ${f.sector || 'wider'} sector. The five factors are weighted equally.`} />
        {verdict ? <p className={cn('mb-3 text-lg font-bold leading-tight', VERDICT_CLASS[verdictTone(overall.score)])}>{verdict}</p> : null}
        <div className="flex flex-wrap items-baseline gap-2">
          <b className="text-4xl font-bold leading-none tracking-[-.02em] tnum">{isNum(overall.score) ? dec(overall.score, 2) : '—'}</b>
          <i className="text-sm not-italic text-muted-foreground">/{MAX_SCORE}</i>
          <span className="ml-auto text-tiny text-muted-foreground/80">{graded.length} of {rows.length} ratios graded, across {overall.factors ?? 0} factors</span>
        </div>
        <GradeBar score={overall.score} letter={overall.letter} />
        <OSub info="The strip is the 0-5 scale in fifths, with the grade marked on it. The histogram under it is the spread of overall grades across the sector, with this company’s bucket picked out.">
          Where that sits in the sector
        </OSub>
        <DistributionStrip a={a} overall={overall} />
      </OCard>

      <FlakeCard a={a} id="rt-flake" title="The five factors" />

      <OCard span={12} id="rt-factors">
        <OHead title="Factor grades"
          info={`Each grade is the mean of that factor’s ratio percentiles, on a scale of 0 to ${MAX_SCORE}. The median tally beside it counts the same ratios a different way and is never summed into the grade.`} />
        <div className="grid">
          {Object.values(FACTOR_BY_KEY).map((meta) => {
            const s = a.scores[meta.key];
            if (!s) return null;
            const checks = countChecks(s);
            return (
              <button key={meta.key} type="button" title={`Open the ${meta.title} tab`} onClick={() => nav.openFactor?.(meta.key)}
                className="group grid grid-cols-[minmax(0,1fr)_200px_auto] items-center gap-4 border-b border-border py-3 text-left last:border-b-0 max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-2">
                <span className="min-w-0">
                  <b className="block text-sm font-semibold group-hover:text-primary">{meta.title}</b>
                  <i className="mt-0.5 block text-13 not-italic leading-snug text-muted-foreground">{meta.question.replace('{SYM}', f.symbol)}</i>
                </span>
                <span className="max-sm:order-last max-sm:col-span-2">
                  <GradeBar score={s.score} letter={s.letter} className="mt-0" />
                  <span className="mt-[5px] block text-micro text-muted-foreground/80">{s.graded} of {s.total} graded · {checks.pass} beat the median</span>
                </span>
                <span className="text-right"><GradePill score={s.score} letter={s.letter} /></span>
              </button>
            );
          })}
        </div>
      </OCard>

      {ranked.length ? (
        <OCard span={12} id="rt-leaders">
          <OHead title="What moves the rating"
            info="The five highest and five lowest graded ratios anywhere in the report. Ratios shown but not scored, and ratios with no data, have no position to be either." />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(470px,100%),1fr))] gap-x-8 gap-y-2">
            <LeadColumn a={a} title="Carrying the rating" metrics={best} withFactor empty="Nothing on this side of the report graded." />
            <LeadColumn a={a} title="Holding it back" metrics={worst} withFactor empty="Nothing on this side of the report graded." />
          </div>
        </OCard>
      ) : null}

      <OCard span={4} id="rt-spread">
        <OHead title="Grade spread"
          info="The graded ratios by letter band. The rating above is their mean, which says nothing about whether they agree with each other — this says how much they do." />
        {graded.length ? (
          <div className="grid gap-3">
            {SPREAD_BANDS.map((b) => {
              const n = counts[b.tone];
              const share = (n / graded.length) * 100;
              return (
                <div key={b.tone} title={b.note} className="grid grid-cols-[54px_minmax(0,1fr)_62px] items-center gap-3 text-13">
                  <span className="font-semibold">{b.label}</span>
                  <GradeBar tone={b.tone} share={share} className="mt-0" />
                  <span className="text-right text-tiny text-muted-foreground tnum">{n ? `${n} · ${Math.round(share)}%` : '—'}</span>
                </div>
              );
            })}
          </div>
        ) : <p className="text-13 text-muted-foreground">No ratio in the report could be graded.</p>}
        <p className="mt-4 text-tiny text-muted-foreground/80">
          {missing ? `${graded.length} of ${rows.length} ratios graded; the ${missing} that could not be assessed are left out of the bars above.`
            : `All ${graded.length} ratios graded.`}
        </p>
      </OCard>

      <OCard span={8} id="rt-peers">
        <OHead title="Competitor ranking" info={competitorNote(a)} />
        <CompetitorTable a={a} />
      </OCard>

      <OCard span={12} id="rt-basis">
        <OHead title="How this rating is built" />
        <KeyInfo items={[
          ['Ratios graded', `${graded.length} of ${rows.length}`],
          ['Shown, not scored', String(countShown(a))],
          ['Ranked against', f.sector || 'no sector'],
          ['Companies in that sector', isNum(t.count) ? t.count.toLocaleString('en-US') : 'n/a'],
        ]} />
        {t.quality === 'seed' ? (
          <Notice className="mt-4">
            The sector distributions this report grades against are <b>modelled, not measured</b> — shaped around published sector
            medians so the rating is sensible. Every percentile, ranking and company count on this page inherits that.
          </Notice>
        ) : null}
        {!t.available ? (
          <Notice className="mt-4">
            No sector distribution is loaded for <b>{f.sector || 'this company’s sector'}</b>, so each ratio falls back to the live
            peer sample where there is one and goes ungraded where there is not.
          </Notice>
        ) : null}
        <OSub>What this rating does not do</OSub>
        <ul className="mt-1 grid gap-2">
          {[
            'Weights the five factors equally. The master spec weights Momentum double.',
            'Weights every ratio inside a factor equally. The spec gives each line its own weight, from 0.9% to 25.9%.',
            'Applies no sector mask: EV multiples and Altman Z are graded in Financials, and the leverage cluster is not suppressed where the spec suppresses it.',
            'Reads annual statements, so every year-on-year line is FY0 against FY−1 rather than the trailing twelve months against the prior twelve.',
          ].map((text) => (
            <li key={text} className="flex gap-3 text-13 leading-normal text-muted-foreground before:mt-2 before:size-1.5 before:flex-none before:rounded-full before:bg-border before:content-['']">
              {text}
            </li>
          ))}
        </ul>
        {unassessed.length ? (
          <div>
            <OSub>Not assessed ({unassessed.length})</OSub>
            <p className="text-13 text-muted-foreground">
              {unassessed.slice(0, 10).join(', ')}{unassessed.length > 10 ? `, and ${unassessed.length - 10} more.` : '.'}
            </p>
            <p className="mt-2 text-tiny text-muted-foreground/80">
              These are dropped from the mean rather than scored zero: a figure the data plan does not return should lower confidence
              in the grade, not manufacture a bad one.
            </p>
          </div>
        ) : null}
        {t.generatedAt ? <p className="mt-4 text-tiny text-muted-foreground/80">Sector table generated {fmtDate(t.generatedAt)}.</p> : null}
      </OCard>
    </div>
  );
}
