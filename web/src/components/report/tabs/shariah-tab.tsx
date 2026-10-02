'use client';

/* The Shariah Compliance tab: the verdict as a count, the five standards, the
   arithmetic, the activity screen, and — listed, not summarised — what the
   screen does not test. */

import * as React from 'react';
import { isNum, money, pct } from '@/lib/format';
import { EXCLUDED_ACTIVITIES, SHARIAH_INFO, SHARIAH_STANDARDS, excludedActivity, shariahVerdict, type ShariahVerdict } from '@/lib/shariah';
import type { Analysis } from '@/lib/model';
import { CheckRow, DataTable, Notice, OCard, OHead, Pill, StatLine, StatLines } from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { TickIcon } from '@/components/shell/icons';
import { cn } from '@/lib/cn';

const VERDICT_TONE: Record<string, string> = { good: 'text-up', bad: 'text-down', warn: 'text-grade-mid', muted: 'text-muted-foreground' };
const stateText = (s: string) => (s === 'pass' ? 'Pass' : s === 'fail' ? 'Fail' : 'n/a');
const stateClass = (s: string) => (s === 'pass' ? 'text-up' : s === 'fail' ? 'text-down' : 'text-muted-foreground/70');

/* The gaps, listed rather than summarised: a screen that reports "passes 5 of
   5" and stays quiet about the tests it never ran is a misleading one. Each
   names the test, why it is missing, and which way the omission pushes. */
const NOT_TESTED = [
  { label: 'Non-compliant income', detail: 'Providers cap income from interest and from excluded activities at 5% of total revenue. That needs a revenue breakdown by source, which this data plan does not return. A company clearing both ratios here could still fail on this test.' },
  { label: 'Accounts receivable', detail: 'AAOIFI and several index families cap receivables — sometimes receivables plus cash — as a share of market capitalisation or assets. The balance sheet feed here does not carry a receivables line, so the test is not run.' },
  { label: 'Averaged market capitalisation', detail: 'Dow Jones screens on a trailing 24-month average market cap and S&P on 36 months. This uses the current one, so a company whose share price has just moved sharply will screen differently here than at the provider — and in the direction the recent move points.' },
  { label: 'Purification', detail: 'Passing a screen does not make the whole dividend permissible; the non-compliant share is conventionally donated. The fraction itself needs the income breakdown above, so it is not computed here — the Watchlist page does the rest of the arithmetic against a fraction you supply.' },
];

export function ShariahTab({ a }: { a: Analysis }) {
  const f = a.facts;
  const rows: ShariahVerdict[] = SHARIAH_STANDARDS.map((std) => shariahVerdict(a, std));
  const passed = rows.filter((r) => r.state === 'pass').length;
  const failed = rows.filter((r) => r.state === 'fail').length;
  const unknown = rows.filter((r) => r.state === 'na').length;
  const excluded = excludedActivity(f);

  // The headline is a count rather than a word: the five providers can and do
  // disagree on identical financials, so "compliant" would be true of some
  // readers' standard and false of others'.
  const tone = excluded ? 'bad' : unknown === rows.length ? 'muted' : failed === 0 ? 'good' : passed === 0 ? 'bad' : 'warn';
  const headline = excluded ? 'Excluded on activity'
    : unknown === rows.length ? 'Cannot be screened'
      : failed === 0 ? `Passes all ${rows.length}`
        : passed === 0 ? `Fails all ${rows.length}` : `Passes ${passed} of ${rows.length}`;

  const cell = (value: number | null, limit: number, ok: boolean | null) => {
    if (!isNum(value)) return <span className="text-muted-foreground/70">n/a</span>;
    return (
      <span className={cn('inline-grid justify-items-end', ok ? 'text-up' : 'text-down')}>
        <b className="font-semibold">{pct(value)}</b>
        <i className="text-micro not-italic text-muted-foreground">limit {pct(limit, { dp: 0 })}</i>
      </span>
    );
  };

  return (
    <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
      <OCard span={8} id="sh-verdict">
        <OHead title={`${f.name} Shariah screen`} info={SHARIAH_INFO}
          aside={<Pill tone={failed ? 'bad' : passed ? 'good' : 'muted'}>{passed} of {rows.length} pass</Pill>} />
        <p className={cn('mb-3 text-lg font-bold leading-tight', VERDICT_TONE[tone])}>{headline}</p>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {excluded
            ? `The screen stops at the business itself: ${f.industry || f.sector} is an excluded activity under every one of these methodologies, and no balance-sheet ratio can reverse that.`
            : 'Each provider asks the same two questions — how much of the company is funded by interest-bearing debt, and how much of it is cash and interest-bearing securities — and draws the line in a slightly different place.'}
        </p>
        <StatLines split>
          <StatLine label="Business activity" value={excluded ? 'Excluded' : 'Not excluded'} tone={excluded ? 'neg' : ''}
            note={excluded ? `matched “${excluded}”` : 'by sector and industry keyword'} />
          <StatLine label="Total debt" value={money(f.totalDebt, { currency: 'US$' })} note="TTM" />
          <StatLine label="Cash & equivalents" value={money(f.cash, { currency: 'US$' })} note="TTM" />
          <StatLine label="Market capitalisation" value={money(f.marketCap, { currency: 'US$' })} note="current" />
          <StatLine label="Total assets" value={money(f.totalAssets, { currency: 'US$' })} note="TTM" />
        </StatLines>
        {unknown ? <p className="mt-4 text-tiny text-muted-foreground/80">{unknown} of the {rows.length} standards could not be measured from the balance sheet that loaded.</p> : null}
      </OCard>

      <OCard span={4} id="sh-standards">
        <OHead title="By standard" info="The same company against five published methodologies. A disagreement between them is not an error — it is the point of listing five." />
        <ul className="grid flex-1 content-between">
          {rows.map((r) => (
            <li key={r.std.key} title={r.note} className="flex items-center gap-3 border-b border-border py-[9px] text-13 last:border-b-0">
              <TickIcon kind={r.state} className={stateClass(r.state)} />
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{r.std.name}</b>
                <i className="block text-micro not-italic text-muted-foreground">limits {pct(r.std.debt, { dp: 0 })} of {r.basis}</i>
              </span>
              <span className={cn('text-tiny font-semibold', stateClass(r.state))}>{stateText(r.state)}</span>
            </li>
          ))}
        </ul>
      </OCard>

      <OCard span={12} id="sh-ratios">
        <OHead title="The two ratios" info="Interest-bearing debt over the divisor, and cash plus interest-bearing securities over the same divisor. Both must sit under the limit for that provider to pass." />
        {/* The figures repeat down the market-cap rows and again down the assets
            rows, because only the divisor changes — which is what the table is for. */}
        <DataTable
          headers={[{ label: 'Standard' }, { label: 'Measured against' }, { label: 'Debt ratio', num: true }, { label: 'Cash ratio', num: true }, { label: 'Verdict' }]}
          rows={rows.map((r) => [
            <b key="n">{r.std.name}</b>,
            r.basis === 'assets' ? 'Total assets' : 'Market cap',
            cell(r.debt, r.std.debt, r.debtOk),
            cell(r.liquid, r.std.liquid, r.liquidOk),
            <span key="v" className={cn('text-tiny font-semibold', stateClass(r.state))}>{stateText(r.state)}</span>,
          ])}
        />
        <p className="mt-4 text-tiny text-muted-foreground/80">
          The cash test uses cash and short-term investments as the balance sheet reports them. The providers test cash plus
          interest-bearing securities specifically, which this feed does not separate out — where a company holds
          non-interest-bearing investments, the figure here is the stricter one.
        </p>
      </OCard>

      <OCard span={12} id="sh-activity">
        <OHead title="The activity screen" aside={<Pill tone={excluded ? 'bad' : 'good'}>{excluded ? 'Excluded' : 'Not excluded'}</Pill>}
          info="Keyword matching on the company’s sector and industry — the only description of the business this data carries." />
        <StatLines>
          <StatLine label="Sector" value={f.sector || 'n/a'} />
          <StatLine label="Industry" value={f.industry || 'n/a'} />
          <StatLine label="Screen result" value={excluded ? `Excluded — matched “${excluded}”` : 'No excluded activity matched'} tone={excluded ? 'neg' : ''} />
        </StatLines>
        <OSub>Wordings that exclude a company outright</OSub>
        <div className="flex flex-wrap gap-1.5">
          {EXCLUDED_ACTIVITIES.map((w) => (
            <span key={w} className={cn('rounded-full border border-border px-2.5 py-0.5 text-tiny text-muted-foreground', excluded === w && 'border-down bg-down/10 text-down')}>{w}</span>
          ))}
        </div>
        <p className="mt-4 text-tiny text-muted-foreground/80">
          This catches a company whose whole business is excluded — a bank, a brewer, a casino operator. It cannot catch an excluded
          activity inside a diversified group, such as a manufacturer’s financing arm or a retailer’s alcohol aisle, because nothing in
          this data says the segment exists. A revenue-based screen, which is what the providers run, needs segment disclosures this
          plan does not return.
        </p>
      </OCard>

      <OCard span={12} id="sh-limits">
        <OHead title="What this screen does not test" />
        <p className="-mt-1 mb-4 text-13 leading-relaxed text-muted-foreground">
          Three of the tests the index providers run are not run here, and one input is approximated. A pass above means the company
          clears the two balance-sheet ratios and the activity keywords — nothing more than that.
        </p>
        <ul className="mb-4 grid gap-1 sm:grid-cols-2">
          {NOT_TESTED.map((g) => <CheckRow key={g.label} state="na" label={g.label} note={g.detail} />)}
        </ul>
        <Notice>
          This is a screening aid built from public financial data, not a fatwa and not investment advice. A scholar or the index
          provider’s own published constituent list is the authority; where this disagrees with either, they are right and this is wrong.
        </Notice>
      </OCard>
    </div>
  );
}
