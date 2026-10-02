'use client';

/* ==========================================================================
   Maz Vantage — the Shariah desk (`/shariah/<sub>`)

   One canvas, four tabs:

     screener      the five compliance screens, in one table
     methodology   the five published standards and what they measure
     purification  what to do with the income the screen cannot remove
     changes       why a compliance-change list needs a database

   The five screens are the same three compliance rules with something on
   top, so the compliance universe is the constant and the extra rule is the
   variable. The caveat — mechanical, not a ruling, three provider tests not
   run — travels with the table on every screen, from the idea's own `note`.
   ========================================================================== */

import * as React from 'react';
import { SHARIAH_IDEAS, SHARIAH_SCREENS, shariahScreenForSub } from '@/lib/shariah-screens';
import { EXCLUDED_ACTIVITIES, SHARIAH_INFO, SHARIAH_STANDARDS } from '@/lib/shariah';
import { ScreenDesk } from '@/components/pages/screen-desk';
import {
  ConnectionButton, Grid, MetaDivider, PageFrame, PageHero, Panel, Para, SectionBar, Warn, useQueryState,
} from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { useNav } from '@/components/nav-context';

const IDEA_BY_ID: Record<string, any> = Object.fromEntries((SHARIAH_IDEAS as any[]).map((idea) => [idea.key, idea]));

type TabId = 'screener' | 'methodology' | 'purification' | 'changes';
const TABS: { id: TabId; label: string }[] = [
  { id: 'screener', label: 'Halal Screener' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'purification', label: 'Purification' },
  { id: 'changes', label: 'Compliance Changes' },
];

const percent = (v: number) => `${Math.round(v * 100)}%`;

function MethodologyTab() {
  return (
    <div className="grid gap-5 pt-6">
      <Panel title="The five published standards">
        <Para>{SHARIAH_INFO}</Para>
        <Grid heads={['Standard', 'Debt limit', 'Liquid assets limit', 'Divided by']}
          rows={SHARIAH_STANDARDS.map((s) => [<b key="n">{s.name}</b>, percent(s.debt), percent(s.liquid), s.divisor === 'assets' ? 'Total assets' : 'Market capitalisation'])} />
        <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">
          The divisor is not a detail. Two of these five divide by total assets rather than by market capitalisation, which is a different test on
          the same company — a business trading well above book clears the market-cap version far more easily than the asset one. The screener
          runs AAOIFI’s pair, the tightest of the market-cap set, so a company passing here clears S&amp;P’s and Dow Jones’s limits too. It says
          nothing about the two asset-based standards, and nothing about whether a provider would include the company: each of them runs tests
          this screen does not.
        </p>
      </Panel>
      <Panel title="What the screen tests">
        <Grid heads={['Test', 'How it is run here']} rows={[
          ['Interest-bearing debt', 'Total debt from the balance sheet, divided by market capitalisation as the screener reports it today.'],
          ['Cash and interest-bearing securities', 'Cash and short-term investments over the same market capitalisation.'],
          ['Line of business', <span key="l">A keyword test on the company’s sector and industry against <b>{EXCLUDED_ACTIVITIES.length} excluded terms</b>. It reads a classification, never the company’s actual revenue mix.</span>],
        ]} />
      </Panel>
      <Panel title="What it does not test, and why that matters">
        <Warn>Three of the tests the index providers actually run are <b>absent here</b>, and any one of them could exclude a company this screen passes.</Warn>
        <Grid heads={['Missing test', 'Why']} rows={[
          ['Non-compliant income', 'The share of revenue from interest or from an excluded activity has to be read out of the filings line by line. No such figure is published, and a segment breakdown does not separate interest income.'],
          ['Receivables', 'Accounts receivable over market capitalisation, which AAOIFI caps. The balance-sheet field exists but the cap is applied on a basis this screen does not reproduce, so running it half-right would be worse than saying it is absent.'],
          ['An averaged market capitalisation', 'Providers use a trailing average — 24 or 36 months depending on the standard — rather than today’s price. A company can pass here and fail there purely on the day you looked.'],
        ]} />
        <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">
          This is why nothing on this desk says “compliant”. It says the company clears the two ratios this screen can measure and is not in a
          line of business the keyword list catches. Verify against the provider before relying on it.
        </p>
      </Panel>
    </div>
  );
}

function PurificationTab() {
  const nav = useNav();
  return (
    <div className="grid gap-5 pt-6">
      <Panel title="Why a compliant company still pays some income that is not">
        <Para>
          The ratio tests admit a company with some interest-bearing debt and some interest-bearing cash, because the limits are thresholds
          rather than zeroes. A company inside them still earns a little interest, and a share of any dividend it pays is that interest passed through.
        </Para>
        <Para>
          Purification is the practice of giving that share away rather than keeping it. The share is the company’s non-compliant income over its
          total income, applied to the dividend received — which is the same figure this screen cannot measure, for the same reason it cannot run
          the income test.
        </Para>
      </Panel>
      <Panel title="What this product can and cannot give you">
        <Grid heads={['You need', 'Where it comes from']} rows={[
          ['The dividend you received', 'Your own records, or the company’s Dividends tab for the per-share amounts and dates.'],
          ['The non-compliant share of income', 'Not here. It is read out of the filings, and most index providers publish a purification ratio per constituent — that published figure is the one to use.'],
          ['The amount to purify', 'The two multiplied together. This desk can supply the first and never the second, so it does not print a total that would look authoritative.'],
        ]} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => nav.goSymbolTab('Dividends')}>A company’s dividend record →</Button>
          <Button size="sm" variant="outline" onClick={() => nav.goSymbolTab('Shariah Compliance')}>Its compliance tab →</Button>
        </div>
      </Panel>
      <Panel title="Capital gains are a separate question">
        <Para>
          Scholars differ on whether a gain on the share price needs purifying at all, and those who say it does differ on the basis. This desk
          takes no position: it is a screening tool, and the question is a ruling rather than a calculation.
        </Para>
      </Panel>
    </div>
  );
}

function ChangesTab() {
  const nav = useNav();
  return (
    <div className="grid gap-5 pt-6">
      <Panel title="Compliance changes">
        <Warn>
          <b>Not available.</b> A compliance change is the difference between today’s verdict and a previous one, and this app keeps no history —
          every screen you see is run in your browser from live feeds and discarded when you reload. There is nothing to compare against.
        </Warn>
        <Para>
          This one is worth having more than most, because both ratios move with the market price as well as with the balance sheet. A company can
          cross the debt limit without filing anything at all — its market capitalisation simply fell — which is exactly the change a holder
          would want to be told about.
        </Para>
      </Panel>
      <Panel title="What would make it work">
        <Grid heads={['Piece', 'What it does']} rows={[
          ['A nightly job', 'Runs the compliance test across the covered universe and writes one row per company per day: symbol, the two ratios, and the verdict.'],
          ['A table to write to', 'Anything that persists. The row is small — a few dozen bytes per company per day.'],
          ['A comparison by date', 'Lists companies whose verdict changed between two dates, which is what this tab would render.'],
        ]} />
        <p className="text-tiny text-muted-foreground">
          The same three pieces the Quant desk’s Rating Changes tab asks for, against the same missing database. Building it once would answer both.
        </p>
      </Panel>
      <Panel title="Until then">
        <Para>
          Re-run the screen. A company that has left the compliance universe is simply absent from it, and one that has entered is there — you
          cannot see the moment it happened, but the list itself is never stale.
        </Para>
        <div><Button size="sm" onClick={() => nav.goView('shariah', 'screener')}>Run the halal screener →</Button></div>
      </Panel>
    </div>
  );
}

export function ShariahPage({ sub }: { sub: string | null }) {
  const nav = useNav();
  const q = useQueryState();
  /* Four of the menu's items are screens under their old slugs: a slug that
     names a screen opens the screener on it; anything else is a tab. */
  const fromSub = shariahScreenForSub(sub);
  const tab: TabId = fromSub ? 'screener' : TABS.some((t) => t.id === sub) ? (sub as TabId) : 'screener';
  React.useEffect(() => {
    if (fromSub && q.get('collection') !== fromSub.id) q.set({ collection: fromSub.id });
  }, [fromSub, q]);

  return (
    <PageFrame id="shariah-desk">
      <PageHero eyebrow="Shariah" title="Halal screening"
        strap="Two balance-sheet ratios against market capitalisation and a test on the line of business, run across every listed US company over a billion dollars. Screened on AAOIFI’s limits, which are the strictest of the five published sets — a company clearing them clears the other four on these ratios as well."
        meta={<><ConnectionButton /><MetaDivider /><span>A mechanical screen, not a scholarly ruling</span></>} />
      <SectionBar label="Shariah sections" items={TABS} active={tab} onSelect={(id) => nav.goView('shariah', id)} />
      {tab === 'screener' ? (
        <ScreenDesk screens={SHARIAH_SCREENS} ideaFor={(id) => IDEA_BY_ID[id] || null} label="Shariah screens" coreRules={3}
          lede="Five screens over the same compliance universe. The first three rules are the compliance test and never change; each screen adds its own on top, so the funnel under the table reads “this many were compliant, then this many of those were also cheap”." />
      ) : tab === 'methodology' ? <MethodologyTab /> : tab === 'purification' ? <PurificationTab /> : <ChangesTab />}
    </PageFrame>
  );
}
