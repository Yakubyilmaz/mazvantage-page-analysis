'use client';

/* The full Shariah screen on the Shariah Compliance tab — shown only for an
   issuer researched against methodology v5.0, and labelled with its date and
   version, as Part XIV of the methodology asks.

   It opens with the five index methodologies and Maz Vantage's own, run on
   the same filed figures, then walks Maz Vantage's four scenarios gate by
   gate. Scenario B is the AAOIFI one and the preferred reading. The
   methodology maps each scenario to a school of law (§61); readers see the
   scenario, which is what they act on. */

import * as React from 'react';
import { money, pct } from '@/lib/format';
import {
  PREFERRED, SCENARIOS, SCENARIO_NAME, SCENARIO_SHORT, TEST_INFO, lineAt, ratioTests, sizeAt,
  type IndexResult, type Scenario, type TestResult, type TestState, type Verdict,
} from '@/lib/shariah-v5';
import { screenIssuer, type IssuerRecord } from '@/lib/shariah-issuers';
import { DataTable, Notice, OCard, OHead, Pill } from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { TickIcon } from '@/components/shell/icons';
import { cn } from '@/lib/cn';

type Mark = TestState | 'pass' | 'fail' | 'mixed' | 'borderline';

const verdictTone = (v: Verdict) => (v === 'PASS' ? 'text-up' : v.startsWith('MIXED') ? 'text-warning' : v === 'NOT SCREENABLE' ? 'text-muted-foreground' : 'text-down');
const stateTone = (s: Mark) =>
  (s === 'pass' ? 'text-up' : s === 'fail' || s === 'undefined' ? 'text-down' : s === 'watch' || s === 'mixed' || s === 'borderline' ? 'text-warning' : 'text-muted-foreground');
const tick = (s: Mark) => (s === 'pass' ? 'pass' : s === 'fail' || s === 'undefined' ? 'fail' : s === 'info' ? 'info' : 'na');
const verdictWord = (v: Verdict) => (v === 'PASS' ? 'Compliant' : v.startsWith('MIXED') ? 'On watch' : v === 'NOT SCREENABLE' ? 'Not screenable' : 'Not compliant');

/** US$ millions → "US$146.5b". */
const usd = (m: number) => money(m * 1e6);
const perShare = (v: number) => money(v, { plain: true });
const p2 = (v: number) => pct(v, { dp: 2 });
const cap = (v: number) => pct(v, { dp: Math.abs(v * 100 - Math.round(v * 100)) > 1e-9 ? 1 : 0 });
/** A shift in share of revenue, in percentage points. */
const pp = (v: number) => (Math.abs(v) < 5e-5 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(2)}pp`);
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A value over its limit; `of` says what it was divided by where that is not obvious. */
function Ratio({ value, limit, state, of }: { value: number | null; limit: number | null; state: Mark; of?: string }) {
  return (
    <span className="inline-grid justify-items-end whitespace-nowrap">
      <b className={cn('font-semibold', stateTone(state))}>{value == null ? 'undefined' : p2(value)}</b>
      <i className="text-micro not-italic text-muted-foreground">{of ? `${of} · ` : ''}{limit == null ? 'info' : `limit ${cap(limit)}`}</i>
    </span>
  );
}

/** Bold name over a small grey qualifier — the row label used in every table here. */
const Named = ({ name, sub, title, wide }: { name: React.ReactNode; sub: React.ReactNode; title?: string; wide?: boolean }) => (
  <span className={cn('grid', wide && 'min-w-[180px] max-w-[360px]')} title={title}>
    <b className="font-semibold">{name}</b>
    <i className="text-micro not-italic text-muted-foreground">{sub}</i>
  </span>
);

const ExtLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>
);

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-1.5 text-13 leading-relaxed text-muted-foreground">
      {items.map((x) => <li key={x} className="relative pl-3.5 before:absolute before:left-0 before:top-[9px] before:size-1 before:rounded-full before:bg-muted-foreground/60">{x}</li>)}
    </ul>
  );
}

const PreferredTag = () => <Pill tone="gold" className="ml-1.5 align-middle">Preferred</Pill>;

const indexState = (x: IndexResult) => (x.state === 'borderline' ? 'Borderline' : x.state === 'pass' ? 'Pass' : 'Fail');

export function ShariahIssuerReport({ record: r }: { record: IssuerRecord }) {
  const sc = React.useMemo(() => screenIssuer(r), [r]);
  const at = (s: Scenario) => sc.scenarios[s];
  const rev = r.income.revenue;
  const pref = at(PREFERRED);
  const passing = SCENARIOS.filter((s) => at(s).verdict === 'PASS');
  const counted = r.lines.filter((l) => !l.election);
  const open = r.lines.find((l) => l.election);
  const indexPass = sc.indexes.filter((x) => x.state === 'pass').length;
  const otherPass = r.standards.filter((x) => x.result === 'pass').length;
  const scenarioHead = SCENARIOS.map((s) => ({
    label: s === PREFERRED ? <span className="text-primary">{SCENARIO_SHORT[s]}</span> : SCENARIO_SHORT[s],
    num: true,
  }));
  // Scenario B tests the same limits against market cap and total assets; show whichever binds harder.
  const binding = (keys: TestResult['key'][]) => pref.tests
    .filter((t) => keys.includes(t.key) && t.value != null && t.limit != null)
    .reduce((a, b) => ((b.value! / b.limit!) > (a.value! / a.limit!) ? b : a));
  const prefDebt = binding(['ibd_mcap', 'ibd_ta']);
  const prefCash = binding(['cash_mcap', 'cash_ta']);
  const prefAr = binding(['ar_mcap']);

  return (
    <>
      <OCard span={12} id="sh-methods">
        <OHead title="Five index methodologies and Maz Vantage"
          info="Each family's own rules — what it divides by, its limits, its revenue test — run against the same figures from the company's SEC filings. They disagree mostly over the denominator: market value or total assets."
          aside={<Pill tone={indexPass === sc.indexes.length ? 'good' : indexPass ? 'warn' : 'bad'}>{indexPass} of {sc.indexes.length} index methodologies pass</Pill>} />
        <DataTable dense exportName="shariah-methodologies"
          headers={[{ label: 'Methodology' }, { label: 'Debt', num: true }, { label: 'Cash & securities', num: true }, { label: 'Receivables', num: true }, { label: 'Income test', num: true }, { label: 'Verdict', num: true }]}
          rows={[
            ...sc.indexes.map((x) => [
              <Named key="n" name={x.rule.name} sub={x.rule.basisLabel} title={x.rule.note} />,
              <Ratio key="d" value={x.debt} limit={x.rule.debtCap} state={x.debt <= x.rule.debtCap ? 'pass' : 'fail'} />,
              <Ratio key="c" value={x.cash} limit={x.rule.cashCap} state={x.cash <= x.rule.cashCap ? 'pass' : 'fail'} />,
              x.ar == null ? <span key="a" className="text-muted-foreground/70">—</span>
                : <Ratio key="a" value={x.ar} limit={x.rule.ar!.cap} state={x.ar <= x.rule.ar!.cap ? 'pass' : 'fail'} of={x.rule.ar!.withCash ? '+ cash' : undefined} />,
              x.income == null ? <span key="i" className="text-tiny text-muted-foreground">Sector screen</span>
                : <span key="i" className="inline-grid justify-items-end whitespace-nowrap">
                  <b className={cn('font-semibold', stateTone(x.state === 'borderline' ? 'borderline' : x.income <= 0.05 ? 'pass' : 'fail'))}>{p2(x.income)}</b>
                  <i className="text-micro not-italic text-muted-foreground">{x.state === 'borderline' ? `est. ${pct(x.incomeBand![0])}–${pct(x.incomeBand![1])}` : 'limit 5%'}</i>
                </span>,
              <b key="v" className={stateTone(x.state)}>{indexState(x)}</b>,
            ]),
            [
              <Named key="n" name={<>Maz Vantage — {SCENARIO_NAME[PREFERRED]}<PreferredTag /></>} sub="Market cap and total assets" />,
              <Ratio key="d" value={prefDebt.value} limit={prefDebt.limit} state={prefDebt.state} />,
              <Ratio key="c" value={prefCash.value} limit={prefCash.limit} state={prefCash.state} />,
              <Ratio key="a" value={prefAr.value} limit={prefAr.limit} state={prefAr.state} />,
              <Ratio key="i" value={pref.g4.npi} limit={pref.g4.cap} state={pref.g4.state} />,
              <b key="v" className={verdictTone(pref.verdict)}>{pref.verdict === 'PASS' ? 'Pass' : pref.verdict.startsWith('MIXED') ? 'Watch' : 'Fail'}</b>,
            ],
          ]}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-13">
          <span className="text-muted-foreground">Maz Vantage&apos;s other scenarios:</span>
          {SCENARIOS.filter((s) => s !== PREFERRED).map((s) => (
            <Pill key={s} tone={at(s).verdict === 'PASS' ? 'good' : at(s).verdict.startsWith('MIXED') ? 'warn' : 'bad'}>
              {SCENARIO_NAME[s]} · {at(s).verdict === 'PASS' ? 'Pass' : at(s).verdict.startsWith('MIXED') ? 'Watch' : 'Fail'}
            </Pill>
          ))}
        </div>
        <p className="mt-3 text-tiny leading-relaxed text-muted-foreground/80">{r.methodsNote}</p>
      </OCard>

      <OCard span={12} id="sh-v5">
        <OHead
          title="Maz Vantage full screen"
          info={`Researched from ${r.symbol}'s SEC filings and published research against the Maz Vantage Shariah methodology ${r.version}: five gates, four scenarios. Thresholds, windows and sizing rules are the methodology's; figures the company does not disclose are estimated and labelled.`}
          aside={<Pill tone="gold" title={`Maz Vantage Shariah methodology ${r.version}, screened ${fmtDay(r.screened)}`}>{r.version} · {fmtDay(r.screened)}</Pill>}
        />
        <p className={cn('text-lg font-bold leading-tight', verdictTone(pref.verdict))}>
          {verdictWord(pref.verdict)} under {SCENARIO_NAME[PREFERRED]}
        </p>
        <p className="mb-1 text-13 font-semibold text-muted-foreground">
          {passing.length === 4 ? 'Passes every scenario.' : passing.length ? `Passes ${passing.map((s) => SCENARIO_NAME[s]).join(', ')} only.` : 'Fails every scenario.'}
        </p>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{r.summary}</p>
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-[10px] border border-border bg-border max-lg:grid-cols-2 max-sm:grid-cols-1">
          {SCENARIOS.map((s) => {
            const x = at(s);
            return (
              <div key={s} className={cn('grid content-start gap-1 bg-background p-3', s === PREFERRED && 'bg-primary/[.06] ring-2 ring-inset ring-primary/40')}>
                <span className="flex flex-wrap items-center gap-1.5 text-micro uppercase tracking-[.06em] text-muted-foreground">
                  {SCENARIO_NAME[s]}{s === PREFERRED ? <Pill tone="gold" className="normal-case tracking-normal">Preferred</Pill> : null}
                </span>
                <span className={cn('text-xl font-bold tracking-[-.01em]', verdictTone(x.verdict))}>{x.verdict}</span>
                <span className="text-tiny leading-normal text-muted-foreground">{x.deciding}</span>
                <span className="mt-1 text-tiny text-muted-foreground">
                  Non-permissible income <b className="font-semibold text-foreground">{p2(x.g4.npi)}</b> · purify <b className="font-semibold text-foreground">{perShare(x.purification.perShare)}</b>/share
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-tiny text-muted-foreground/80">
          {r.period.label}. Balance sheet at {fmtDay(r.bs.date)}; market cap {usd(r.mcap.m12)} (12-month average), {usd(r.mcap.m24)} (24),
          {' '}{usd(r.mcap.m36)} (36), {usd(r.mcap.spot)} on {fmtDay(r.mcap.spotDate)}. Filings:{' '}
          {r.filings.map((f, i) => <React.Fragment key={f.accession}>{i ? ', ' : ''}<ExtLink href={f.href}>{f.form} {f.period.split(' (')[0]}</ExtLink></React.Fragment>)}.
        </p>
      </OCard>

      <OCard span={12} id="sh-v5-gates">
        <OHead title="Gate by gate" info="Every gate is computed in every scenario even when an earlier one has already failed — where the scenarios part company is itself the finding. The worst gate decides each scenario." />
        <DataTable dense exportName="shariah-gates"
          headers={[{ label: 'Gate' }, ...scenarioHead]}
          rows={[
            [<b key="g">1 · Business activity</b>, ...SCENARIOS.map((s) => (r.g1 === 'pass'
              ? <span key={s} className="text-up">Pass</span> : <span key={s} className="text-down">Categorical fail</span>))],
            [<b key="g">2 · Financial ratios</b>, ...SCENARIOS.map((s) => {
              const bad = at(s).tests.filter((t) => TEST_INFO[t.key].gate === 2 && (t.state === 'fail' || t.state === 'watch' || t.state === 'undefined'));
              if (!bad.length) return <span key={s} className="text-up">Pass</span>;
              return (
                <span key={s} className="inline-grid justify-items-end gap-1">
                  {bad.map((t) => (
                    <span key={t.key} className="inline-grid justify-items-end">
                      <b className={cn('font-semibold', stateTone(t.state))}>{t.state === 'watch' ? 'Watch' : 'Fail'} {p2(t.value ?? 0)}</b>
                      <i className="text-micro not-italic text-muted-foreground">{t.key === 'ibd_ta' && s === 'S' ? 'debt incl. leases / assets' : TEST_INFO[t.key].label.toLowerCase()}</i>
                    </span>
                  ))}
                </span>
              );
            })],
            [<b key="g">3 · Hidden interest</b>, ...SCENARIOS.map((s) => <span key={s} className={stateTone(at(s).g3)}>{at(s).g3 === 'pass' ? 'Pass' : 'Fail'} {p2(sizeAt(r.l1, s) / rev)}</span>)],
            [<b key="g">4 · Revenue purity</b>, ...SCENARIOS.map((s) => <span key={s} className={stateTone(at(s).g4.state)}>{at(s).g4.state === 'pass' ? 'Pass' : 'Fail'} {p2(at(s).g4.npi)} <i className="not-italic text-muted-foreground">/ {pct(at(s).g4.cap, { dp: 0 })}</i></span>)],
            [<b key="g">5 · Disclosure</b>, ...SCENARIOS.map((s) => <span key={s} className="text-muted-foreground">{r.gate5.screenable ? 'Screenable, estimated' : 'Not screenable'}</span>)],
            [<b key="g">Verdict</b>, ...SCENARIOS.map((s) => <b key={s} className={verdictTone(at(s).verdict)}>{at(s).verdict}</b>)],
          ]}
        />
      </OCard>

      <OCard span={12} id="sh-v5-ratios">
        <OHead title="Gate 2 — the balance sheet" info="Each scenario decides on its own market-cap window (A the 24-month average, B the 12-month, C the worst of 12/24/36 months, Strictest the worst of those and today's) and its own debt measure (Strictest adds operating leases). A ratio within 2 points of a Scenario A or B limit is put on watch rather than passed or failed." />
        <DataTable dense exportName="shariah-ratios"
          headers={[{ label: 'Ratio' }, ...scenarioHead]}
          rows={at('A').tests.map((t0, i) => [
            <Named key="n" name={TEST_INFO[t0.key].label} sub={TEST_INFO[t0.key].code} />,
            ...SCENARIOS.map((s) => { const t = at(s).tests[i]; return <Ratio key={s} value={t.value} limit={t.limit} state={t.state} />; }),
          ])}
        />
        <p className="mt-3 text-tiny text-muted-foreground/80">{r.ratioNote}</p>
        <OSub className="mt-5" info="Lease liabilities are disclosed once a year, so every quarter carries the latest annual figures.">The two total-asset ratios, quarter by quarter</OSub>
        <DataTable dense exportName={null}
          headers={[{ label: 'Ratio' }, ...r.history.map((h) => ({ label: fmtDay(h.date), num: true }))]}
          rows={[
            [<Named key="n" name="Cash & securities / total assets" sub="limit 33% Scenario B · 30% Scenario C · 25% Strictest" />,
              ...r.history.map((h) => { const t = ratioTests(h, r.mcap, r.l1.point, rev, 'B').find((x) => x.key === 'cash_ta')!; return <b key={h.date} className={stateTone(t.state)}>{p2(t.value!)}</b>; })],
            [<Named key="n" name="Debt incl. operating leases / total assets" sub="limit 25% Strictest" />,
              ...r.history.map((h) => { const t = ratioTests(h, r.mcap, r.l1.point, rev, 'S').find((x) => x.key === 'ibd_ta')!; return <b key={h.date} className={stateTone(t.state)}>{p2(t.value!)}</b>; })],
          ]}
        />
      </OCard>

      <OCard span={12} id="sh-v5-revenue">
        <OHead title="Gate 4 — where the non-permissible income comes from"
          info="Each line as a share of twelve-month revenue. Where the company does not disclose a line it is estimated with a band: Scenarios A and B use the point, C and Strictest the conservative edge. Interest is counted here as well as at Gate 3. Hover a line for how it was sized."
          aside={<Pill tone="warn">Estimated</Pill>} />
        <DataTable dense exportName="shariah-revenue-lines"
          headers={[{ label: 'Line' }, { label: 'Size (band)', num: true }, ...scenarioHead]}
          rows={[
            ...counted.map((l) => [
              <Named key="n" name={l.label} sub={`${l.rule} · ${l.status}`} title={l.basis} wide />,
              <span key="b" className="inline-grid justify-items-end whitespace-nowrap">{usd(l.base.point)}<i className="not-italic text-micro text-muted-foreground">{usd(l.base.low)}–{usd(l.base.high)}</i></span>,
              ...SCENARIOS.map((s) => { const x = lineAt(l, s, rev); return <span key={s} className={x.amount ? '' : 'text-muted-foreground/70'}>{p2(x.share)}</span>; }),
            ]),
            [<b key="t">Non-permissible income</b>, <span key="b" className="text-micro text-muted-foreground">cap</span>,
              ...SCENARIOS.map((s) => <Ratio key={s} value={at(s).g4.npi} limit={at(s).g4.cap} state={at(s).g4.state} />)],
            ...(open ? [[
              <Named key="n" name={open.label} sub={`${open.rule} — not in the total`} title={open.basis} wide />,
              <span key="b" className="inline-grid justify-items-end whitespace-nowrap">{usd(open.base.point)}<i className="not-italic text-micro text-muted-foreground">{usd(open.base.low)}–{usd(open.base.high)}</i></span>,
              ...SCENARIOS.map((s) => <span key={s} className="text-tiny text-muted-foreground">{s === 'A' || s === 'B' ? '0%' : at(s).election.map((e) => p2(e.npi)).join(' / ')}</span>),
            ]] : []),
          ]}
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <OSub>Whether the verdict survives the band</OSub>
            <ul className="grid gap-1 text-13 leading-relaxed text-muted-foreground">
              {SCENARIOS.map((s) => (
                <li key={s}><b className="font-semibold text-foreground">{SCENARIO_NAME[s]}</b>: {p2(at(s).g4.npi)} as sized, {p2(at(s).g4.otherEdge)} at the other edge —{' '}
                  {at(s).g4.robust ? `${at(s).g4.state === 'pass' ? 'passes' : 'fails'} either way.` : 'the Gate-4 result depends on where in the band the truth sits.'}</li>
              ))}
            </ul>
          </div>
          <div>
            <OSub>Readings not yet settled</OSub>
            <ul className="grid gap-1 text-13 leading-relaxed text-muted-foreground">
              {sc.sensitivities.map((x) => (
                <li key={x.label} title={x.note}><b className="font-semibold text-foreground">{x.label}</b>: {SCENARIOS.map((s) => `${SCENARIO_SHORT[s]} ${pp(x.shift[s])}`).join(' · ')}</li>
              ))}
              {open ? <li><b className="font-semibold text-foreground">Loot boxes at 0 / 50 / 100%</b>: shown in the table; Scenario C fails at every reading.</li> : null}
            </ul>
          </div>
        </div>
        <details className="mt-4 text-13">
          <summary className="cursor-pointer font-semibold text-primary">How each line was sized</summary>
          <dl className="mt-3 grid gap-3">
            {r.lines.map((l) => (
              <div key={l.key}>
                <dt className="font-semibold">{l.label} <span className="font-normal text-muted-foreground">· {l.tier}</span></dt>
                <dd className="text-muted-foreground">{l.basis}</dd>
              </div>
            ))}
          </dl>
        </details>
      </OCard>

      <OCard span={6} id="sh-v5-gate1">
        <OHead title="Gate 1 — the business" info="The methodology's decision table, walked in order; the first categorical fail stops it. None is reached." />
        <ul className="grid">
          {r.gate1.map((g) => (
            <li key={g.step} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2 border-b border-border py-2 text-13 last:border-b-0">
              <span className="text-muted-foreground tnum">{g.step}</span>
              <span><b className="font-semibold">{g.test}</b> — <span className="text-muted-foreground">{g.finding}</span> <i className={cn('not-italic font-semibold', /categorical|fail/i.test(g.result) ? 'text-down' : g.result === 'n/a' ? 'text-muted-foreground' : 'text-up')}>{g.result}</i></span>
            </li>
          ))}
        </ul>
      </OCard>

      <OCard span={6} id="sh-v5-gate3">
        <OHead title="Gate 3 — hidden interest" info="Only income layers — interest, financing income, speculative derivative carry — count toward the 5% cap; expense layers are shown for the cross-check against the debt. Where the company has stopped disclosing a layer it is estimated, with the method below." />
        <ul className="grid">
          {r.layers.map((l) => (
            <li key={l.key} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-2 border-b border-border py-2 text-13 last:border-b-0">
              <span className="font-semibold text-muted-foreground">{l.key}</span>
              <span><b className="font-semibold">{l.label}</b> <span className="block text-tiny text-muted-foreground">{l.note}</span></span>
              <span className="whitespace-nowrap text-right font-semibold tnum">{l.value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-tiny text-muted-foreground/80">{r.l1.basis}</p>
      </OCard>

      <OCard span={12} id="sh-v5-purify">
        <OHead title="Purification" info="Interest after tax, plus each impure line at the company's after-tax margin excluding interest — so purification can never exceed what the share earned. The dividend part follows the payout ratio; the rest is due on the retained earnings, at sale or yearly." />
        <DataTable dense exportName="shariah-purification"
          headers={[{ label: 'Scenario' }, { label: 'Per share', num: true }, { label: 'Dividend', num: true }, { label: 'Retained', num: true }, { label: 'DPS × NPI', num: true }]}
          rows={SCENARIOS.map((s) => {
            const x = at(s).purification;
            return [<span key="s" className={s === PREFERRED ? 'font-semibold text-primary' : ''}>{SCENARIO_NAME[s]}</span>,
              <b key="t">{perShare(x.perShare)}</b>, perShare(x.dividendPart), perShare(x.retainedPart),
              <span key="c" className="text-muted-foreground">{perShare(x.ratioMethod)}</span>];
          })}
        />
        <p className="mt-3 text-tiny text-muted-foreground/80">
          Diluted earnings {perShare(r.income.epsDiluted)} a share; dividends {perShare(r.income.dps)}, so {pct(at('A').purification.payout)} of
          it is purified through the dividend; tax rate {pct(at('A').purification.taxRate)}. The last column is the retail screeners&apos;
          shortcut, dividend × non-permissible share, shown for reconciliation. Purification is owed only where a scenario passes — for
          the failing scenarios the figures serve an orderly exit. Khums at 20% of profit, informational: {perShare(sc.khums.perShare)} a
          share, {usd(sc.khums.company)} at company level.
        </p>
      </OCard>

      <OCard span={12} id="sh-v5-standards">
        <OHead title="Other standards" info="National and index rulebooks beyond the five above, each run on its own rules against the same figures."
          aside={<Pill tone={otherPass === r.standards.length ? 'good' : otherPass ? 'warn' : 'bad'}>{otherPass} of {r.standards.length} pass</Pill>} />
        <ul className="grid gap-x-8 md:grid-cols-2">
          {r.standards.map((x) => (
            <li key={x.name} title={x.tests} className="flex items-start gap-3 border-b border-border py-[7px] text-13">
              <TickIcon kind={tick(x.result)} className={cn('mt-[2px]', stateTone(x.result))} />
              <span className="min-w-0 flex-1"><b className="font-semibold">{x.name}</b><i className="block text-micro not-italic text-muted-foreground">{x.deciding}</i></span>
              <span className={cn('text-tiny font-semibold capitalize', stateTone(x.result))}>{x.result}</span>
            </li>
          ))}
        </ul>
      </OCard>

      <OCard span={12} id="sh-v5-notes">
        <OHead title="Disclosure, governance and what to watch" />
        <p className="mb-4 text-13 leading-relaxed text-muted-foreground"><b className="font-semibold text-foreground">Gate 5.</b> {r.gate5.finding}</p>
        <div className="grid gap-6 md:grid-cols-3">
          <div><OSub>Not disclosed</OSub><Bullets items={r.gate5.gaps} /></div>
          <div><OSub>Governance flags (never change a verdict)</OSub><Bullets items={r.gflags} /></div>
          <div><OSub>What would change the verdict</OSub><Bullets items={r.monitoring} /></div>
        </div>
        <OSub className="mt-6">Reference data against the filings</OSub>
        <DataTable dense exportName="shariah-reconciliation"
          headers={[{ label: 'Field' }, { label: 'Reference data' }, { label: 'Filing' }, { label: 'Effect' }]}
          rows={r.reconciliation.map((x) => [<b key="f">{x.field}</b>, x.reference, x.filing, <span key="e" className="text-muted-foreground">{x.effect}</span>])}
        />
        <Notice className="mt-6">
          A screening opinion under Maz Vantage&apos;s published Shariah methodology, not a fatwa and not investment advice. Lines
          the company does not disclose are estimates with stated bands; a scholar, or the index provider&apos;s own constituent
          list, is the authority where they differ.
        </Notice>
      </OCard>
    </>
  );
}
