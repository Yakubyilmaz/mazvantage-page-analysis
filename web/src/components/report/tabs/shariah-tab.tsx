'use client';

/* The Shariah Compliance tab: the verdict as a count, the five standards, the
   arithmetic, purification for one share, the activity screen, and — listed,
   not summarised — what the quick screen still approximates. Where an issuer
   has a researched v5.0 screen, that screen is the tab and the quick one is
   not shown. */

import * as React from 'react';
import { money, pct } from '@/lib/format';
import {
  EXCLUDED_ACTIVITIES, INCOME_CAP, SHARIAH_INFO, SHARIAH_STANDARDS, basisLabel, quickInputs, quickPurification, quickScreen,
  type QuickResult, type QuickState, type QuickTest,
} from '@/lib/shariah';
import type { Analysis } from '@/lib/model';
import { CheckRow, DataTable, Notice, OCard, OHead, Pill, StatLine, StatLines } from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { TickIcon } from '@/components/shell/icons';
import { cn } from '@/lib/cn';
import { issuerRecord } from '@/lib/shariah-issuers';
import { labelFromQuick } from '@/lib/halal-label';
import { ShariahIssuerReport } from './shariah-issuer';
import { useMcapHistory } from '@/components/report/use-mcap-history';

const VERDICT_TONE: Record<string, string> = { good: 'text-up', bad: 'text-down', warn: 'text-grade-mid', muted: 'text-muted-foreground' };
const stateText = (s: QuickState) => (s === 'pass' ? 'Pass' : s === 'fail' ? 'Fail' : 'n/a');
const stateClass = (s: QuickState) => (s === 'pass' ? 'text-up' : s === 'fail' ? 'text-down' : 'text-muted-foreground/70');
const usd = (v: number | null) => money(v, { currency: 'US$' });
const perShare = (v: number) => money(v, { plain: true, dp: v < 0.1 ? 3 : 2 });
const fmtDay = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

export function ShariahTab({ a }: { a: Analysis }) {
  const record = issuerRecord(a.facts.symbol);

  // A researched screen replaces the quick one outright; every other ticker gets the quick screen.
  return (
    <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
      <h2 className="col-span-12 text-[26px] font-bold tracking-[-.025em] max-lg:col-span-1">Is {a.facts.name} ({a.facts.symbol}) halal?</h2>
      {record ? <ShariahIssuerReport record={record} /> : <QuickScreen a={a} />}
    </div>
  );
}

function Cell({ t }: { t: QuickTest | undefined }) {
  if (!t) return <span className="text-muted-foreground/50">—</span>;
  if (t.value == null) {
    return <span className="text-tiny text-muted-foreground/70">{t.key === 'interest' ? 'not reported' : 'n/a'}</span>;
  }
  return (
    <span className={cn('inline-grid justify-items-end whitespace-nowrap', t.state === 'pass' ? 'text-up' : 'text-down')}>
      <b className="font-semibold">{pct(t.value, { dp: 2 })}</b>
      <i className="text-micro not-italic text-muted-foreground">limit {pct(t.limit, { dp: t.limit * 100 % 1 > 1e-6 ? 1 : 0 })}</i>
    </span>
  );
}

/* The quick screen's cards, for tickers without a researched screen. */
function QuickScreen({ a }: { a: Analysis }) {
  const f = a.facts;
  const history = useMcapHistory(a);
  const inp = React.useMemo(() => quickInputs(a as any, history.rows), [a, history.rows]);
  const rows: QuickResult[] = SHARIAH_STANDARDS.map((std) => quickScreen(inp, std));
  const passed = rows.filter((r) => r.state === 'pass').length;
  const failed = rows.filter((r) => r.state === 'fail').length;
  const unknown = rows.filter((r) => r.state === 'na').length;
  const excluded = rows[0]?.excluded ?? null;
  const purification = quickPurification(inp);
  const test = (r: QuickResult, key: QuickTest['key']) => r.tests.find((t) => t.key === key);
  const averaged = inp.mcap.m24 != null;

  // The headline is a count rather than a word: the five providers can and do
  // disagree on identical financials, so "compliant" would be true of some
  // readers' standard and false of others'. The same label as the verdict
  // card and the server summary (`lib/halal-label.ts`).
  const { tone, headline } = labelFromQuick(rows, f.name);

  const limits = [
    { label: 'Income from excluded activities', detail: 'Interest income is tested above wherever the company reports it. Income from alcohol, gambling, music and film, conventional finance and the like needs a revenue breakdown by activity that no statement line carries; where a researched screen exists it is at the top of this tab. Elsewhere, a company clearing everything here could still fail on this test.' },
    { label: 'Interest income not reported', detail: 'Some companies stop reporting gross interest income — Apple has not since fiscal 2023. A zero in the statement is read as "not reported", never as a pass, and the interest test and purification are then left blank rather than filled with nothing.' },
    { label: 'Cash and investments', detail: 'Long-term investments are counted in full, because long-dated bonds belong in the test. Where a company also holds equity stakes there, which are not interest-bearing, the cash ratio here overstates.' },
    { label: 'Purification is a floor', detail: 'It covers the interest one share earned. Income from excluded activities would add to it, at the company\'s margin, and is not measured here.' },
    ...(averaged ? [] : [{ label: 'Averaged market capitalisation', detail: history.loading
      ? 'The market-cap history is loading; until it does, today\'s market cap stands in for the providers\' 12-, 24- and 36-month averages.'
      : 'The market-cap history did not load, so today\'s market cap stands in for the providers\' 12-, 24- and 36-month averages — a company whose price has just moved sharply screens differently here than at the provider.' }]),
  ];

  return (
    <>
      <OCard span={8} id="sh-verdict">
        <OHead title={`${f.name} Shariah screen`} info={SHARIAH_INFO}
          aside={<Pill tone={failed ? 'bad' : passed ? 'good' : 'muted'}>{passed} of {rows.length} pass</Pill>} />
        <p className={cn('mb-3 text-lg font-bold leading-tight', VERDICT_TONE[tone])}>{headline}</p>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {excluded
            ? `The screen stops at the business itself: ${f.industry || f.sector} is an excluded activity under every one of these methodologies, and no balance-sheet ratio can reverse that.`
            : 'Each provider asks how much of the company is funded by interest-bearing debt, how much of it is cash and interest-bearing securities, and — some of them — how much is owed to it and how much of its income is interest. They draw the lines in different places and divide by different things.'}
        </p>
        <StatLines split>
          <StatLine label="Business activity" value={excluded ? 'Excluded' : 'Not excluded'} tone={excluded ? 'neg' : ''}
            note={excluded ? `matched “${excluded}”` : 'by sector and industry keyword'} />
          <StatLine label="Total debt" value={usd(inp.totalDebt)} note={inp.asOf ? `balance sheet, ${fmtDay(inp.asOf)}` : 'latest'} />
          <StatLine label="Cash & investments" value={usd(inp.cashIbs)} note="cash, short- and long-term investments" />
          <StatLine label="Receivables" value={usd(inp.ar)} note="trade receivables" />
          <StatLine label="Market capitalisation" value={usd(inp.mcap.m24 ?? inp.mcap.spot)}
            note={averaged ? `24-month average · ${usd(inp.mcap.m12)} over 12 · ${usd(inp.mcap.m36)} over 36 · ${usd(inp.mcap.spot)} today` : history.loading ? 'today — averages loading' : 'today — no history loaded'} />
          <StatLine label="Total assets" value={usd(inp.totalAssets)} />
          <StatLine label="Interest income" value={inp.interestIncome != null ? usd(inp.interestIncome) : 'Not reported'}
            note={inp.interestIncome != null && inp.revenue ? `${pct(inp.interestIncome / inp.revenue, { dp: 2 })} of revenue` : 'the latest income statement carries none'} />
        </StatLines>
        {unknown ? <p className="mt-4 text-tiny text-muted-foreground/80">{unknown} of the {rows.length} standards could not be measured from the balance sheet that loaded.</p> : null}
      </OCard>

      <OCard span={4} id="sh-standards">
        <OHead title="By standard" info="The same company against five published methodologies. A disagreement between them is not an error — it is the point of listing five." />
        <ul className="grid flex-1 content-between">
          {rows.map((r) => (
            <li key={r.std.key} title={`${r.std.note} ${r.note}`} className="flex items-center gap-3 border-b border-border py-[9px] text-13 last:border-b-0">
              <TickIcon kind={r.state} className={stateClass(r.state)} />
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{r.std.name}</b>
                <i className="block text-micro not-italic text-muted-foreground">limits {pct(r.std.debt, { dp: 0 })} of {basisLabel(r.std).toLowerCase()}</i>
              </span>
              <span className={cn('text-tiny font-semibold', stateClass(r.state))}>{stateText(r.state)}</span>
            </li>
          ))}
        </ul>
      </OCard>

      <OCard span={12} id="sh-ratios">
        <OHead title="The tests, standard by standard"
          info="Debt, cash and investments, and receivables over each provider's own denominator; interest income over revenue for the providers whose revenue test includes interest. A dash means the provider runs no such test." />
        <DataTable dense
          headers={[{ label: 'Standard' }, { label: 'Debt', num: true }, { label: 'Cash & investments', num: true }, { label: 'Receivables', num: true }, { label: 'Interest income', num: true }, { label: 'Verdict', num: true }]}
          rows={rows.map((r) => [
            <span key="n" className="grid" title={r.std.note}>
              <b className="font-semibold">{r.std.fullName}</b>
              <i className="text-micro not-italic text-muted-foreground">{r.basis}{r.averaged || r.std.divisor === 'assets' ? '' : ' (no history)'}</i>
            </span>,
            <Cell key="d" t={test(r, 'debt')} />,
            <Cell key="c" t={test(r, 'cash')} />,
            <span key="a" className="inline-grid justify-items-end">
              <Cell t={test(r, 'ar')} />
              {r.std.ar?.withCash && test(r, 'ar')?.value != null ? <i className="text-micro not-italic text-muted-foreground">with cash</i> : null}
            </span>,
            r.std.income === 'sector'
              ? <span key="i" className="text-tiny text-muted-foreground">sector list</span>
              : r.std.income === 'npi-ex-interest'
                ? <span key="i" className="text-tiny text-muted-foreground">tested via cash</span>
                : <Cell key="i" t={test(r, 'interest')} />,
            <span key="v" className={cn('text-tiny font-semibold', stateClass(r.state))}>{stateText(r.state)}</span>,
          ])}
        />
        <p className="mt-4 text-tiny text-muted-foreground/80">
          Balance-sheet figures are the latest annual statement{inp.asOf ? ` (${fmtDay(inp.asOf)})` : ''}.
          {averaged ? ` Market cap is each provider's own trailing average of the daily figure, ${fmtDay(inp.mcap.from)} to ${fmtDay(inp.mcap.to)}.` : ' Market cap is today\'s figure — the history did not load.'}
          {' '}Interest income is held to {pct(INCOME_CAP, { dp: 0 })} of revenue; the rest of the revenue test is not run here.
        </p>
      </OCard>

      <OCard span={12} id="sh-purify">
        <OHead title="Purification, for one share"
          info="What one share earned from interest over the year, after tax, and how much of it arrives with the dividend. It is a floor: income from excluded activities would add to it and is not measured here." />
        {'reason' in purification ? (
          <p className="text-13 leading-relaxed text-muted-foreground">{purification.reason} Where the company does report it, this is
            the interest one share earned after tax, split between the dividend and the retained earnings.</p>
        ) : (
          <>
            <StatLines>
              <StatLine label="Interest earned per share, after tax" value={perShare(purification.perShare)} note={`tax rate ${pct(purification.taxRate)}`} />
              <StatLine label={`With the ${perShare(purification.dps)} dividend`} value={perShare(purification.dividendPart)}
                note={`${pct(purification.payout)} of earnings is paid out — give this when the dividend arrives`} />
              <StatLine label="On the retained earnings" value={perShare(purification.perShare - purification.dividendPart)}
                note="at sale, or yearly — by the holder's practice" />
              <StatLine label="Shortcut: dividend × interest share of revenue" value={perShare(purification.ratioMethod)}
                note="what most retail screeners print; it understates when interest is a larger share of profit than of revenue" />
            </StatLines>
            <p className="mt-3 text-tiny text-muted-foreground/80">
              For 100 shares, multiply by 100. Purification applies where a standard passes; where it fails, the guidance is to exit,
              and this is what to give on the way out.
            </p>
          </>
        )}
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
          this data says the segment exists. That takes a revenue breakdown by activity, which is per-company research.
        </p>
      </OCard>

      <OCard span={12} id="sh-limits">
        <OHead title="What this screen still approximates" />
        <p className="-mt-1 mb-4 text-13 leading-relaxed text-muted-foreground">
          Debt, cash, receivables and interest income are tested against each provider&apos;s own limits and denominators, and
          purification is worked out for one share. What remains approximate, and which way it pushes:
        </p>
        <ul className="mb-4 grid gap-1 sm:grid-cols-2">
          {limits.map((g) => <CheckRow key={g.label} state="na" label={g.label} note={g.detail} />)}
        </ul>
        <Notice>
          This is a screening aid built from public financial data, not a fatwa and not investment advice. A scholar or the index
          provider’s own published constituent list is the authority; where this disagrees with either, they are right and this is wrong.
        </Notice>
      </OCard>
    </>
  );
}
