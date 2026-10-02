'use client';

/* ==========================================================================
   Maz Vantage — one idea's results (the view half of ideas.js)

   The table of companies that passed, which rule did the excluding (or, for
   a ranked idea, eligibility then ranking), and what a result does and does
   not mean. Every score here is the reduced one, and the count of ratios
   behind it prints under it — the thing that keeps it apart from a full
   Ratings-tab grade.
   ========================================================================== */

import * as React from 'react';
import { isNum, money, num } from '@/lib/format';
import { letterFor, MAX_SCORE } from '@/lib/grading';
import { FACTOR_BY_KEY, FACTOR_KEYS } from '@/lib/factors';
import { LITE_DEPTH } from '@/lib/model';
import { COLUMNS, LITE_TOTAL, MAX_CANDIDATES, MIN_CANDIDATES, universeLine } from '@/lib/ideas';
import { DataTable, Limits, Notice, OCard, OHead, OMore, Pill, StatLine, StatLines } from '@/components/report/ui';
import { GradeBar, GradePill, OSub } from '@/components/report/grade-parts';
import { TickIcon } from '@/components/shell/icons';
import { useNav } from '@/components/nav-context';

const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';

function ScoreCell({ score, count }: { score: unknown; count: React.ReactNode }) {
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <GradePill score={score as number} letter={letterFor(score as number)} />
      <i className="text-micro not-italic text-muted-foreground">{count}</i>
    </span>
  );
}

/** The whole funnel in one sentence. The headline count means little alone. */
function funnelLine(result: any) {
  const dropped = result.listings - result.universeSize;
  return `The screener found ${result.listings} listings matching the universe`
    + (dropped > 0
      ? `, of which ${dropped} were a second listing or share class of a company already in the set — leaving ${result.universeSize} companies. `
      : `, which deduplicated to ${result.universeSize} companies. `)
    + `The largest ${result.tested} were analysed and `
    + (result.idea.ranked
      ? `ranked on ${result.idea.sortLabel} — the top ${result.rows.length} are held. `
      : `tested against the rules. ${result.passedCount} passed, and the top ${result.rows.length} by ${result.idea.sortLabel} are shown. `)
    + `Companies past the first ${result.cap} were never scored, so this is the best of a sample rather than the best of the market.`;
}

export function ResultCard({ result }: { result: any }) {
  const nav = useNav();
  const idea = result.idea;
  if (result.state !== 'ok') {
    const message: Record<string, string> = {
      gated: 'The company screener is not available right now, so this idea cannot be run.',
      skipped: 'This screen needs live market data, which is unavailable right now.',
      empty: 'The screener returned no companies for this idea’s universe. That is a filter question rather than a market one — the size floor or the sector is excluding everything before a single rule is tested.',
    };
    return (
      <OCard span={12} id="idea-result">
        <OHead title="Results" />
        <Notice error={result.state === 'error'}>{message[result.state] || `The screen could not be run — ${result.message || 'unknown error'}.`}</Notice>
      </OCard>
    );
  }
  const cols = (idea.columns || []).map((k: string) => COLUMNS[k]).filter(Boolean);
  // A score screen prints all five factors: the four it did not test are the
  // context a reader needs to judge the one it did.
  const factorCols = idea.scoreIdea ? FACTOR_KEYS : [];
  const n = result.rows.length;
  return (
    <OCard span={12} id="idea-result">
      <OHead title={idea.ranked ? `${n} holding${n === 1 ? '' : 's'}` : `${n} compan${n === 1 ? 'y' : 'ies'} pass`}
        aside={<Pill tone="gold">sorted by {idea.sortLabel}</Pill>}
        info={`Click a row to open that company’s full report. Every score here is the reduced one — up to ${LITE_TOTAL} ratios against the company’s own sector, where a Ratings tab grades 77 off a full pull. The number under each score is how many it actually managed.`} />
      {n ? (
        <DataTable
          headers={[{ label: 'Company' }, { label: 'Market cap', num: true }, ...cols.map((c: any) => ({ label: c.label, num: true })),
            ...factorCols.map((k) => ({ label: FACTOR_BY_KEY[k].title, num: true })), { label: 'Overall', num: true }]}
          rows={result.rows.map((c: any) => [
            <button key="id" type="button" title={`Open the full ${c.symbol} report`} onClick={() => nav.goSymbol(c.symbol)}
              className="grid text-left hover:text-primary">
              <b className="text-13">{c.symbol}</b>
              <span className="max-w-[240px] truncate text-tiny text-foreground">{c.name}</span>
              <span className="text-micro text-muted-foreground">{c.industry || c.sector || ''}</span>
            </button>,
            money(c.marketCap),
            ...cols.map((col: any) => { const v = col.get(c); return isNum(v) ? col.fmt(v) : 'n/a'; }),
            ...factorCols.map((k) => {
              const f = c.lite?.factors?.[k];
              return f && isNum(f.score) ? <ScoreCell key={k} score={f.score} count={String(f.scoredOn)} /> : <span key={k} className="text-muted-foreground">n/a</span>;
            }),
            <ScoreCell key="o" score={c.lite?.score} count={c.lite?.scoredOn ? `${c.lite.scoredOn} ratios` : 'not scored'} />,
          ])} />
      ) : <Notice>No company in the tested sample passed all of this idea’s rules. The card below shows which rule did most of the excluding.</Notice>}
      <p className="mt-3 text-tiny leading-relaxed text-muted-foreground/80">{funnelLine(result)}</p>
    </OCard>
  );
}

const RuleList = ({ rules }: { rules: any[] }) => (
  <ul className="grid gap-1.5">
    {rules.map((r, i) => (
      <li key={i} className="flex items-start gap-2 text-13"><TickIcon kind="pass" className="mt-0.5 size-4 text-up" /><span>{r.label}</span></li>
    ))}
  </ul>
);

/**
 * What a ranked idea did, since it has no rules to break down: the
 * eligibility filters are ordinary screening, and the ranking is this
 * report's own composite and is nobody else's model.
 */
export function RankedCard({ result }: { result: any }) {
  const idea = result.idea;
  const u = idea.universe;
  const filters: [string, string][] = [
    ['Sector', u.sector || 'any'],
    ['Region', 'United States'],
    ['Market capitalisation', isNum(u.marketCapMoreThan) && isNum(u.marketCapLowerThan)
      ? `${money(u.marketCapMoreThan)} to ${money(u.marketCapLowerThan)}` : isNum(u.marketCapMoreThan) ? `over ${money(u.marketCapMoreThan)}` : 'any'],
    ['Share price', isNum(u.priceMoreThan) ? `over $${u.priceMoreThan}` : 'any'],
    ['Daily volume', isNum(u.volumeMoreThan) ? `over ${num(u.volumeMoreThan, 0)}` : 'any'],
    ['Holdings kept', String(idea.resultLimit)],
  ];
  return (
    <OCard span={12} id="idea-rules">
      <OHead title="Eligibility, then ranking" info="Two separate steps. The first is ordinary screening and is exactly reproducible; the second is this report’s own composite, and is not a stand-in for anybody else’s model." />
      <OSub className="mt-0">Who is eligible</OSub>
      <StatLines>{filters.map(([k, v]) => <StatLine key={k} label={k} value={v} />)}</StatLines>
      {idea.rules.length ? <><OSub>Then filtered on</OSub><RuleList rules={idea.rules} /></> : null}
      <OSub>How the eligible are ranked</OSub>
      <p className="max-w-[90ch] text-13 leading-relaxed text-muted-foreground">
        By the overall score — the mean of every metric this path can grade, each one a percentile against the company’s own sector. That is a
        description of where a company stands today, not a forecast of what it does next, and no part of it is trained on realised returns. A
        published AI portfolio learns its weights from decades of forward performance, which is a different question; the two lists will differ,
        and neither is a check on the other.
      </p>
      {idea.note ? <p className="mt-3 text-13 text-muted-foreground">{idea.note}</p> : null}
    </OCard>
  );
}

/** The rules alone, for a screen that has not run. */
export function RulesListCard({ idea }: { idea: any }) {
  return (
    <OCard span={12} id="idea-rules">
      <OHead title="What this idea tests" info="Each rule runs against the company’s trailing figures. All of them have to pass." />
      <RuleList rules={idea.rules} />
      <p className="mt-4 text-13 text-muted-foreground">{universeLine(idea)}</p>
      {idea.note ? <p className="mt-2 text-13 text-muted-foreground">{idea.note}</p> : null}
    </OCard>
  );
}

/**
 * Which rule did the excluding. A screen returning three names is more often
 * one rule doing all the work than a strict screen.
 */
export function RulesCard({ result }: { result: any }) {
  const idea = result.idea;
  const tested: any[] = result.all || [];
  return (
    <OCard span={12} id="idea-rules">
      <OHead title="The rules, and what they cost" info="How many of the tested companies cleared each rule on its own. A rule that almost nobody passes is the one deciding the whole screen." />
      <div className="grid gap-2.5">
        {idea.rules.map((r: any, i: number) => {
          const passed = tested.filter((c) => c.passes?.[i]).length;
          const share = tested.length ? (passed / tested.length) * 100 : 0;
          return (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(120px,240px)_56px] items-center gap-3 text-13">
              <span>{r.label}</span>
              <GradeBar tone={share >= 50 ? 'good' : share >= 20 ? 'mid' : 'weak'} share={share} className="mt-0" />
              <span className="text-right text-muted-foreground tnum">{passed}/{tested.length}</span>
            </div>
          );
        })}
      </div>
      {idea.note ? <p className="mt-4 text-13 text-muted-foreground">{idea.note}</p> : null}
    </OCard>
  );
}

export function IdeaBasisCard({ result }: { result?: any }) {
  const depth = FACTOR_KEYS.map((k) => `${FACTOR_BY_KEY[k].title} ${(LITE_DEPTH as any)[k] || 0}`).join(' · ');
  return (
    <OCard span={12} id="idea-basis">
      <OHead title="How these screens work" />
      <StatLines>
        <StatLine label="Universe" value="Company screener" note="size, sector, country" />
        <StatLine label="Duplicate listings" value="Removed" note="one row per company" />
        <StatLine label="Companies tested per idea" value={`${MIN_CANDIDATES}–${MAX_CANDIDATES}`} note="largest first, fewer when an idea reads more" />
        <StatLine label="Score" value="Reduced, sector-relative" note={`0–${MAX_SCORE}, up to ${LITE_TOTAL} ratios`} />
        <StatLine label="Ratios per factor" value={depth} note="at best, on this path" />
      </StatLines>
      <OSub>What a result does not mean</OSub>
      <Limits items={[
        'It is not the best of the market. The screener filters on size and sector but not on ratios, so every rule runs on a sample taken largest first. A company below the cap is never tested, however well it would have scored.',
        'The scores are the reduced ones. A factor graded here on six ratios and the same factor graded on a Ratings tab from twenty-four share a scale and a set of sector distributions, but they are not the same measurement — the count beside each score is what keeps the two apart.',
        'A company that could not be measured on a factor fails any rule about it rather than passing. That is deliberate, and it means a thinly covered company can be missing from a screen it would have passed.',
        'Deduplication is a judgement. Second listings are matched on the ticker before its exchange suffix, and share classes on a normalised company name — which could in principle merge two genuinely different companies. The count removed is printed under every result so that a wrong merge is at least visible.',
        'Every rule is a trailing figure. Nothing here knows what a company announced last week, and nothing here is a forecast.',
        'The ideas are editorial. The thresholds are round numbers chosen because they are defensible, not because they were backtested — this repo runs no backtest.',
        'Passing a screen is a reason to open the report, not a reason to buy anything. None of this is investment advice.',
      ]} />
      {result ? null : (
        <p className="mt-3 text-tiny text-muted-foreground/80">
          Each idea tests the largest companies in its universe; how many is printed beside its rules.
        </p>
      )}
    </OCard>
  );
}

/** One idea's result, whole. */
export function IdeaResult({ result, back = true }: { result: any; back?: boolean }) {
  const nav = useNav();
  const idea = result.idea;
  return (
    <div>
      <div className="pb-5 pt-6">
        {back ? <OMore onClick={() => nav.openIdeas()} className="mb-3 pt-0">← All investment ideas</OMore> : null}
        <h1 className="text-[28px] font-bold tracking-[-.02em]">{idea.title}</h1>
        <p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">{idea.thesis}</p>
      </div>
      <div className={grid}>
        <ResultCard result={result} />
        {/* A ranked idea has no rules to break down; the others only get the
            breakdown when something was actually tested. */}
        {idea.ranked ? <RankedCard result={result} />
          : result.state === 'ok' && result.all?.length ? <RulesCard result={result} /> : <RulesListCard idea={idea} />}
        <IdeaBasisCard result={result} />
      </div>
    </div>
  );
}
