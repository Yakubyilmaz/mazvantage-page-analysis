'use client';

/* ==========================================================================
   Maz Vantage — the Quant desk (`/quant/<sub>`)

   One canvas, four tabs, and the rating at the centre of all of them:

     screener   eight screens over the whole market, in one table
     ratings    what the composite is and how the scale reads
     factors    the five factors and the ratios inside each
     changes    what a rating change would take, and why there is none

   Every "Top X" here is the same question with one word changed, so they are
   one table with the screen as a control: the columns, the filters, the
   country and the search stay put and only the ranking changes.

   The eight screens are existing ideas, not new ones: each names a portfolio
   in `ideas.ts`, so two menus pointing at one ranking cannot disagree.

   Rating changes need yesterday's rating, and this app stores nothing between
   sessions — so the fourth tab says "this needs a database" rather than
   quietly missing.
   ========================================================================== */

import * as React from 'react';
import { IDEA_BY_KEY } from '@/lib/ideas';
import { FACTOR_BY_KEY, FACTOR_KEYS } from '@/lib/factors';
import { MAX_SCORE } from '@/lib/grading';
import { ScreenDesk } from '@/components/pages/screen-desk';
import {
  ConnectionButton, Crumb, Grid, MetaDivider, PageFrame, PageHero, Panel, Para, SectionBar, Warn,
} from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

/* The rail, in the order it reads: the composite, then the five factors in
   the report's own order, then income, then the strictest screen last
   because it most often comes back nearly empty. */
export const QUANT_SCREENS = [
  { id: 'stocks-by-quant', label: 'Top Quant Stocks', tag: 'Composite', factor: null,
    line: 'Every company in the universe ranked by the composite, with no rule to pass first.' },
  { id: 'score-valuation', label: 'Top Valuation', tag: 'Value', factor: 'valuation',
    line: 'Priced in roughly the cheapest fifth of its own sector on the multiples and yields this report grades.' },
  { id: 'score-growth', label: 'Top Growth', tag: 'Growth', factor: 'growth',
    line: 'Growing faster than most of its sector on revenue, earnings, cash flow and book value.' },
  { id: 'score-profitability', label: 'Top Profitability', tag: 'Quality', factor: 'profitability',
    line: 'Margins at every level and returns on capital in the top of its sector.' },
  { id: 'score-health', label: 'Top Health', tag: 'Safety', factor: 'health',
    line: 'Liquidity, leverage and coverage together, in the top fifth of the sector.' },
  { id: 'score-momentum', label: 'Top Momentum', tag: 'Momentum', factor: 'momentum',
    line: 'Re-rated harder than its sector over three, six, nine and twelve months.' },
  { id: 'top-quant-dividend-stocks', label: 'Top Dividend', tag: 'Income', factor: null,
    line: 'Dividend payers that also rate well on the composite — the rating decides eligibility, the yield is a condition.' },
  { id: 'score-all-round', label: 'Top Signal Stocks', tag: 'All five', factor: null,
    line: 'Four out of five on all five factors at once. The strictest thing the model can say, and the rarest.' },
];
export const QUANT_SCREEN_IDS = QUANT_SCREENS.map((s) => s.id);
export const quantScreen = (id: string | null | undefined) => QUANT_SCREENS.find((s) => s.id === id) || QUANT_SCREENS[0];

type TabId = 'screener' | 'ratings' | 'factors' | 'changes';
const TABS: { id: TabId; label: string }[] = [
  { id: 'screener', label: 'Quant Screener' },
  { id: 'ratings', label: 'The Rating' },
  { id: 'factors', label: 'Factor Grades' },
  { id: 'changes', label: 'Rating Changes' },
];
/* An upgrade and a downgrade are the same missing feature, explained once. */
const TAB_ALIAS: Record<string, TabId> = { top: 'screener', upgrades: 'changes', downgrades: 'changes' };

/* ---------- the screener tab --------------------------------------------------- */

function ScreenerTab() {
  return (
    <ScreenDesk screens={QUANT_SCREENS} ideaFor={(id) => (IDEA_BY_KEY as any)[id] || null} label="Quant screens" showAlias
      lede="Eight rankings over every listed US company above the size floor, each one graded on the way through against its own sector. Pick a screen; the columns, the filters and the search stay where they are." />
  );
}

/* ---------- the three reading tabs ------------------------------------------------ */

const BAND: Record<string, string> = {
  strong: 'bg-grade-strong/15 text-grade-strong', good: 'bg-grade-good/15 text-grade-good', mid: 'bg-grade-mid/15 text-grade-mid',
  weak: 'bg-grade-weak/15 text-grade-weak', poor: 'bg-grade-poor/15 text-grade-poor',
};
const BandTag = ({ tone, children }: { tone: string; children: React.ReactNode }) =>
  <span className={cn('whitespace-nowrap rounded-md px-2 py-0.5 text-tiny font-semibold', BAND[tone])}>{children}</span>;

function RatingsTab() {
  const nav = useNav();
  return (
    <div className="grid gap-5 pt-6">
      <Panel title="What the number is">
        <Para>
          The quant rating is one number between 0 and 5, with a letter and a verdict word beside it. It is built from the bottom up: every
          ratio the data supports is ranked as a percentile against the company’s own sector, those percentiles become grades, the grades
          average into five factor scores, and the five factors average into the composite.
        </Para>
        <Para>
          It measures the company against its peers. Price multiples are part of it, inside the Valuation factor, so a company can be
          downgraded purely for getting more expensive. What never enters it is a fair value estimate — those are display-only throughout this
          report, by design, because a valuation is a set of assumptions the reader chooses rather than a fact about the business.
        </Para>
      </Panel>
      <Panel title="The scale">
        <Grid heads={['Score', 'Letter', 'Verdict', 'What it means']} rows={[
          ['4.0 – 5.0', 'A− to A+', <BandTag key="b" tone="strong">Strong buy</BandTag>, 'Ranks in the top of its sector on most of what could be measured.'],
          ['3.0 – 4.0', 'B− to B+', <BandTag key="b" tone="good">Buy</BandTag>, 'Comfortably above the sector median across the factors.'],
          ['2.0 – 3.0', 'C− to C+', <BandTag key="b" tone="mid">Hold</BandTag>, 'Around the sector median — strong on some factors, weak on others.'],
          ['1.0 – 2.0', 'D− to D+', <BandTag key="b" tone="weak">Sell</BandTag>, 'Below the sector median on most measures.'],
          ['0.0 – 1.0', 'F', <BandTag key="b" tone="poor">Strong sell</BandTag>, 'Near the bottom of its sector on nearly everything measurable.'],
        ]} />
        <p className="text-tiny text-muted-foreground">
          Out of {MAX_SCORE}. The bands are the same on every screen in the table next door, on every company report, and in the badge beside a
          ticker — one scale, printed the same way everywhere it appears.
        </p>
      </Panel>
      <Panel title="What the rating is only as good as">
        <Warn>
          The rating is a percentile against a sector distribution, so it is only as good as that distribution. The table shipped with this repo
          is <b>modelled rather than measured</b> until the sector-statistics builder has been run against real data — every rating carries that
          caveat, and the report says so wherever it prints one.
        </Warn>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => nav.goSymbolTab('Research')}>See a rating on a company →</Button>
          <Button size="sm" variant="outline" onClick={() => nav.goSymbolTab('Ratings')}>The full ratio ranking →</Button>
        </div>
      </Panel>
    </div>
  );
}

function FactorsTab() {
  const nav = useNav();
  return (
    <div className="grid gap-5 pt-6">
      <Panel title="The five factors">
        <Para>
          Each factor is a group of ratios asking one question about the company. A factor score is the mean of its graded ratios; the composite
          is the mean of the five. Each one also has a screen of its own in the table next door.
        </Para>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
          {FACTOR_KEYS.map((key) => {
            const factor: any = FACTOR_BY_KEY[key];
            const count = (factor.groups || []).reduce((t: number, g: any) => t + (g.metrics?.length || 0), 0);
            const screen = QUANT_SCREENS.find((s) => s.factor === key);
            return (
              <article key={key} className="grid content-start gap-2 rounded-xl border border-border p-4">
                <h3 className="text-[15px] font-bold">{factor.title}</h3>
                <p className="text-13 leading-relaxed text-muted-foreground">{String(factor.question || factor.blurb || '').replace(/\{SYM\}/g, 'a company')}</p>
                <p className="text-tiny text-muted-foreground/80">{count ? `${count} ratios graded against the sector` : 'Ratio count unavailable'}</p>
                <div className="flex flex-wrap gap-3 text-13">
                  {screen ? <Crumb onClick={() => nav.goView('quant', 'screener', { collection: screen.id })}>{screen.label}</Crumb> : null}
                  <button type="button" onClick={() => nav.goSymbolTab(factor.title)} className="text-muted-foreground hover:text-foreground">On a company report →</button>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>
      <Panel title="What a factor score does not say">
        <Para>
          A ratio the data cannot fill is dropped from the mean rather than scored zero, and the count of what was actually graded prints beside
          every factor score on the report. A factor graded on four ratios and one graded on twenty are not the same measurement, and the report
          never pretends they are.
        </Para>
        <Para>
          The screens on this page grade fewer ratios than a company report does — a screen runs across hundreds of companies and cannot pay for
          the full feed on each. Every result says how many were tested, and a rating on a company page is the deeper one where the two differ.
        </Para>
      </Panel>
    </div>
  );
}

function ChangesTab() {
  const nav = useNav();
  return (
    <div className="grid gap-5 pt-6">
      <Panel title="Rating upgrades and downgrades">
        <Warn>
          <b>Not available.</b> A rating change is the difference between today’s score and a previous one, and this app keeps no history —
          every rating you see is computed in your browser from live feeds and discarded when you reload. There is nothing to compare against.
        </Warn>
        <Para>
          This is a storage problem rather than a data problem. The ratings themselves are reproducible: run the screen today, store the score
          against the ticker and the date, run it again tomorrow, and the difference is the upgrade list. That needs somewhere to write to.
        </Para>
      </Panel>
      <Panel title="What would make it work">
        <Grid heads={['Piece', 'What it does']} rows={[
          ['A nightly job', 'Runs the composite across the covered universe and writes one row per company per day: symbol, score, letter, the five factor scores.'],
          ['A table to write to', 'Anything that persists. The row is small — a few hundred bytes per company per day.'],
          ['A comparison by date', 'Lists companies whose letter changed between two dates, which is what this tab would render.'],
        ]} />
      </Panel>
      <Panel title="The nearest honest substitute">
        <Para>
          Analyst ratings coverage in Market News reports other people’s rating changes rather than ours — a different measurement, and labelled
          as one wherever it appears.
        </Para>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => nav.goView('news', 'ratings')}>Analyst ratings news →</Button>
          <Button size="sm" variant="outline" onClick={() => nav.goView('quant', 'screener', { collection: QUANT_SCREENS[0].id })}>Today’s rankings →</Button>
        </div>
        <p className="text-tiny text-muted-foreground">
          The rankings are today’s, not a change in today’s. A company that joins the top of a screen between two visits may have improved or
          may simply have been sampled this time and not last — without stored history the page cannot tell you which, so it does not claim to.
        </p>
      </Panel>
    </div>
  );
}

/* ---------- the page ----------------------------------------------------------------- */

export function QuantPage({ sub }: { sub: string | null }) {
  const nav = useNav();
  const asked = (sub && TAB_ALIAS[sub]) || sub;
  const tab: TabId = TABS.some((t) => t.id === asked) ? (asked as TabId) : 'screener';
  return (
    <PageFrame id="quant-desk">
      <PageHero eyebrow="Maz Vantage Quant" title="Quant ratings"
        strap="One number between 0 and 5, built from the bottom up: every ratio the data supports, ranked against the company’s own sector, rolled into five factors and then into a composite. These are the screens that rank on it."
        meta={<><ConnectionButton /><MetaDivider /><span>{QUANT_SCREENS.length} screens · graded against the company’s own sector</span></>} />
      <SectionBar label="Quant sections" items={TABS} active={tab}
        onSelect={(id) => nav.goView('quant', id, id === 'screener' ? { collection: QUANT_SCREENS[0].id } : null)} />
      {tab === 'screener' ? <ScreenerTab /> : tab === 'ratings' ? <RatingsTab /> : tab === 'factors' ? <FactorsTab /> : <ChangesTab />}
    </PageFrame>
  );
}
