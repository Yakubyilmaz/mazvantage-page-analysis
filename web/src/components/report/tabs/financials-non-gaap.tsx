'use client';

/* ==========================================================================
   Maz Vantage — the Financials tab, non-GAAP

   The other side of the basis switch. Two kinds of figure, and every card
   says which one it holds:

   - **Reported by the company** — adjusted EPS, quarter by quarter, joined
     to the filed quarter it covers (`lib/gaap.ts`), and summed into fiscal
     years only where all four quarters were reported.
   - **Calculated here** — EBITDA, free cash flow, net debt, tangible book
     value: one fixed formula for every company, printed under each row.

   Every figure sits beside the GAAP line it starts from. A non-GAAP number
   on its own invites the reader to forget what was taken out of it; the
   reconciliation is the point of this side, not a footnote to it.
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, fmtDate, isNum, pct, signClass, yearOf, yoy } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { ColumnChart, MultiLineChart } from '@/components/charts/charts';
import { FeedGate, Notice, OCard, OHead, StatLine, StatLines } from '@/components/report/ui';
import {
  FORMULA, adjustedYears, basisYears, joinQuarters, sameUnit, trailingFour, type AdjustedYear, type BasisYear,
} from '@/lib/gaap';
import {
  ReconLine, RunBadges, StatementCard, epsFmt, moneyIn, pctFmt, statementRows, timesFmt, timesOf, useBasisNames, type RowDef,
} from './financials-parts';

export interface Quarterly { loading: boolean; rows: any[] | null }

const CALC_FOOT = '. Calculated rows use the formula printed under them, the same for every company; adjusted EPS is the company’s own figure, its four reported quarters summed.';

/** A per-share amount with its sign spelt out — an adjustment is a direction. */
const signedIn = (a: Analysis) => (v: number | null | undefined) => {
  if (!isNum(v)) return 'n/a';
  const sign = v > 0.00001 ? '+' : v < -0.00001 ? '−' : '';
  return `${sign}${curSymbol(a.facts.currency)}${dec(Math.abs(v), 2)}`;
};

const NO_YEARS: AdjustedYear[] = [];

function useYears(a: Analysis, adjusted: AdjustedYear[] = NO_YEARS): BasisYear[] {
  return React.useMemo(() => basisYears({
    income: statementRows(a, 'income'), balance: statementRows(a, 'balance'), cash: statementRows(a, 'cash'),
  }, adjusted), [a, adjusted]);
}

/* ---------- income ---------------------------------------------------------- */

export function IncomeNonGaap({ a, quarterly }: { a: Analysis; quarterly: Quarterly }) {
  const names = useBasisNames();
  const fmt = moneyIn(a);
  const eps = (v: number | null | undefined) => (isNum(v) ? epsFmt(v, a) : 'n/a');
  const signed = signedIn(a);

  const join = React.useMemo(() => {
    const reporting = statementRows(a, 'income').at(-1)?.reportedCurrency;
    const comparable = sameUnit(a.facts.currency, reporting);
    const quarters = comparable && quarterly.rows ? joinQuarters(a.ds.get('earnings'), quarterly.rows) : [];
    return {
      comparable, reporting, quarters,
      years: adjustedYears(quarters),
      ttm: quarterly.rows ? trailingFour(quarters, quarterly.rows) : null,
    };
  }, [a, quarterly.rows]);
  const ys = useYears(a, join.years);

  // One reason, in one place, for every EPS card that cannot be drawn.
  const epsGate: React.ReactNode = a.ds.status('earnings') !== 'ok' ? <FeedGate a={a} feed="earnings" what="Reported earnings" />
    : !join.comparable ? (
      <Notice>Reported EPS for this company is quoted per listed share in {a.facts.currency}, and the statements are in {join.reporting} per
        ordinary share, so the two are not set side by side — the gap between them would be a currency and a share ratio, not an adjustment.</Notice>
    ) : quarterly.loading ? <Notice>Loading the quarterly statements…</Notice>
      : !quarterly.rows ? <Notice>The quarterly income statements could not be loaded, so reported EPS cannot be set against filed EPS quarter by quarter.</Notice>
        : !join.quarters.length ? <Notice>None of the reported quarters could be matched to a filed quarter, so adjusted EPS is not shown against filed EPS.</Notice>
          : null;

  const qs = join.quarters.slice(-12);
  const lq = qs[qs.length - 1];
  const gapOf = (adj: number, filed: number | null) => (isNum(filed) ? adj - filed : null);
  const shareOf = (gap: number | null, adj: number) => (isNum(gap) && adj > 0 ? `${pct(gap / adj)} of adjusted EPS` : '');
  const lqGap = lq ? gapOf(lq.adjusted, lq.gaap) : null;

  const t = join.ttm;
  const tGap = t ? gapOf(t.adjusted, t.gaap) : null;
  const price = a.facts.price;
  const pe = (e: number | null | undefined) => (isNum(price) && isNum(e) && e > 0 ? price / e : null);

  // Fiscal years of adjusted EPS, then the consensus — the one place a
  // forecast is drawn on the end of a history, because both are adjusted.
  const filedEps = new Map(statementRows(a, 'income').map((r) => [yearOf(r.date), r.epsDiluted ?? r.eps]));
  const lastAdj = join.years[join.years.length - 1];
  const after = lastAdj?.year ?? yearOf(a.facts.lastReported);
  const tail = (a.forecast?.rows || [])
    .filter((r: any) => isNum(r.year) && isNum(after) && r.year > after && isNum(r.eps))
    .sort((x: any, y: any) => x.year - y.year);
  const next = tail[0];
  const nextGrowth = next && lastAdj ? yoy(next.eps, lastAdj.adjusted) : null;
  // Like for like: the adjusted year is four quarters summed, so the GAAP
  // side is too. The annual filed EPS divides by the year's average share
  // count and can sit a cent away — a cent that is not an adjustment.
  const filedOf = (y: AdjustedYear) => y.gaapQuarters ?? filedEps.get(y.year) ?? null;
  const lastFiled = lastAdj ? filedOf(lastAdj) : null;
  const lastAnnual = lastAdj ? filedEps.get(lastAdj.year) : null;
  const lastFiledGap = lastAdj ? gapOf(lastAdj.adjusted, lastFiled) : null;

  // EBITDA, calculated.
  const withEbitda = ys.filter((y) => isNum(y.ebitda));
  const ey = withEbitda[withEbitda.length - 1];
  const eyPrev = withEbitda[withEbitda.length - 2];
  const anySbc = ys.some((y) => isNum(y.ebitdaExSbc));

  const group = { eps: 'Earnings per share · adjusted as the company reported it, against filed', calc: 'Calculated here from the filed lines' };
  const defs: RowDef[] = [
    { label: 'Adjusted EPS', hint: 'its four reported quarters summed', get: (y) => y.epsAdjusted, fmt: epsFmt, strong: true, group: group.eps },
    { label: `Diluted EPS (${names.filed})`, hint: 'its four filed quarters summed', get: (y) => y.epsGaapQuarters, fmt: epsFmt, group: group.eps },
    { label: 'Adjustments per share', hint: 'adjusted − filed', get: (y) => y.epsAdjustment, fmt: (v) => signed(v), derived: true, group: group.eps },
    { label: `Operating income (${names.filed})`, get: (y) => y.operatingIncome, group: group.calc },
    { label: `Depreciation & amortisation (${names.filed})`, get: (y) => y.da, group: group.calc },
    { label: 'EBITDA', hint: FORMULA.ebitda, get: (y) => y.ebitda, strong: true, group: group.calc },
    { label: 'EBITDA margin', hint: 'EBITDA / revenue', get: (y) => y.ebitdaMargin, fmt: pctFmt, derived: true, group: group.calc },
    { label: `Stock-based compensation (${names.filed})`, get: (y) => y.sbc, group: group.calc },
    { label: 'EBITDA before stock compensation', hint: FORMULA.ebitdaExSbc, get: (y) => y.ebitdaExSbc, group: group.calc },
  ];

  return (
    <>
      <OCard span={8} id="fin-ng-eps-quarters">
        <OHead title={`Adjusted EPS against ${names.filed} EPS, by quarter`}
          info={`Each quarter twice: the EPS the company reported and was measured against consensus on, and the diluted EPS it filed for the same quarter. The gap between the bars is what the company took out — usually stock compensation, amortisation of acquired intangibles and one-off charges. Where a company publishes no adjusted figure the two bars match, except when the market strips out a one-off.`} />
        {epsGate ?? (
          <>
            <ColumnChart height={280} valueFmt={eps} categories={qs.map((q) => q.label)} series={[
              { name: `Diluted EPS, ${names.filed}`, color: 'var(--chart-1)', values: qs.map((q) => q.gaap) },
              { name: 'Adjusted EPS, as reported', color: 'var(--chart-5)', values: qs.map((q) => q.adjusted) },
            ]} />
            <StatLines split>
              <StatLine label={`Adjusted EPS, ${lq.label}`} value={eps(lq.adjusted)} note={`reported ${fmtDate(lq.announced)}`} />
              <StatLine label={`Diluted EPS, ${lq.label}`} value={eps(lq.gaap)} note={`${names.filed}, as filed`} />
              <StatLine label="Adjustments" value={signed(lqGap)} note={shareOf(lqGap, lq.adjusted)} />
            </StatLines>
          </>
        )}
      </OCard>

      <OCard span={4} id="fin-ng-eps-ttm">
        <OHead title="Trailing four quarters" info={`The four newest filed quarters on both bases, and the price today over each. Only formed when all four have a reported figure — three quarters annualised would not be a trailing twelve months.`} />
        {epsGate ?? (t ? (
          <StatLines>
            <StatLine label="Adjusted EPS" value={eps(t.adjusted)} note={`${t.first.label} – ${t.last.label}`} />
            <StatLine label={`Diluted EPS, ${names.filed}`} value={eps(t.gaap)} note="the same four quarters, as filed" />
            <StatLine label="Adjustments" value={signed(tGap)} note={shareOf(tGap, t.adjusted)} />
            <StatLine label="P/E on adjusted EPS" value={timesOf(pe(t.adjusted))} note="price today" />
            <StatLine label={`P/E on ${names.filed} EPS`} value={timesOf(pe(t.gaap))} note="price today"
              title="Not shown where the trailing earnings are a loss — a negative multiple is a number, and it means nothing." />
          </StatLines>
        ) : <Notice>The four newest filed quarters are not all matched to a reported figure, so no trailing sum is formed.</Notice>)}
      </OCard>

      <OCard span={8} id="fin-ng-eps-years">
        <OHead title="Adjusted EPS by fiscal year, then consensus"
          info={`Fiscal years with all four quarters reported, then the consensus years after them — drawn hatched, because a forecast is not a result. Consensus EPS is on the adjusted basis, so this is the one chart a forecast continues: drawn on the end of ${names.filed} EPS it would show the definition changing as if it were growth.`} />
        {epsGate ?? (join.years.length || tail.length ? (
          <>
            {!join.years.length ? <Notice className="mb-3">No fiscal year has all four quarters reported yet, so the consensus is drawn without an adjusted year to join it to.</Notice> : null}
            <ColumnChart height={260} valueFmt={eps} forecastFrom={tail.length ? join.years.length : null}
              categories={[...join.years.map((y) => String(y.year)), ...tail.map((r: any) => String(r.year))]} series={[
                { name: 'Adjusted EPS', color: 'var(--chart-5)', values: [...join.years.map((y) => y.adjusted), ...tail.map((r: any) => r.eps)] },
                { name: `Diluted EPS, ${names.filed}`, color: 'var(--chart-1)', values: [...join.years.map(filedOf), ...tail.map(() => null)] },
              ]} />
            <StatLines split>
              {lastAdj ? <StatLine label={`Adjusted EPS, fiscal ${lastAdj.year}`} value={eps(lastAdj.adjusted)} note="four reported quarters" /> : null}
              {next ? (
                <StatLine label={`Consensus, fiscal ${next.year}`} value={eps(next.eps)} tone={signClass(nextGrowth)}
                  note={[isNum(nextGrowth) ? `${pct(nextGrowth, { sign: true })} on adjusted FY${lastAdj!.year}` : '', isNum(next.analystsEps) ? `${next.analystsEps} analysts` : ''].filter(Boolean).join(' · ')} />
              ) : <StatLine label="Consensus" value="n/a" note="no estimate after the last reported year" />}
            </StatLines>
          </>
        ) : <Notice>No fiscal year of adjusted EPS and no consensus estimate are available.</Notice>)}
      </OCard>

      <OCard span={4} id="fin-ng-eps-reconcile">
        <OHead title={lastAdj ? `Fiscal ${lastAdj.year}, reconciled` : 'Fiscal year, reconciled'}
          info={`From the diluted EPS the company filed to the adjusted EPS it reported, for the last fiscal year with all four quarters. Both sides are the four quarters summed, so the gap is the adjustments alone; the year’s own filed EPS is printed under them and can sit a cent away, because it divides by the year’s average share count.`} />
        {epsGate ?? (lastAdj ? (
          <StatLines>
            <ReconLine label="Diluted EPS, four quarters" filed value={eps(lastFiled)} />
            <ReconLine op="+" label="Adjustments" value={signed(lastFiledGap)} />
            <ReconLine op="=" label="Adjusted EPS" value={eps(lastAdj.adjusted)} note="four reported quarters" />
            <StatLine label="Adjustments, share of adjusted EPS" value={isNum(lastFiledGap) && lastAdj.adjusted > 0 ? pct(lastFiledGap / lastAdj.adjusted) : 'n/a'} />
            <StatLine label="Quarters with an adjustment" value={`${lastAdj.adjustedQuarters} of 4`}
              note={lastAdj.adjustedQuarters === 0 ? 'reported EPS equalled filed EPS' : 'by a cent or more'} />
            <StatLine label={`Diluted EPS for the year, ${names.filed}`} value={eps(lastAnnual)}
              note={isNum(lastAnnual) && isNum(lastFiled) && Math.abs(lastAnnual - lastFiled) >= 0.005 ? 'as filed; the quarters sum differently' : 'as filed'} />
          </StatLines>
        ) : <Notice>No fiscal year has all four quarters reported, so there is no year to reconcile.</Notice>)}
      </OCard>

      <OCard span={8} id="fin-ng-ebitda">
        <OHead title="EBITDA" info={`Calculated here: ${FORMULA.ebitda}, the depreciation taken from the cash flow statement. The company’s own EBITDA can differ where it adjusts it further. Operating income is drawn beside it as the ${names.filed} line it starts from.`} />
        {withEbitda.length ? (
          <>
            <ColumnChart height={280} valueFmt={fmt} categories={ys.map((y) => String(y.year))} series={[
              { name: `Operating income, ${names.filed}`, color: 'var(--chart-1)', values: ys.map((y) => y.operatingIncome) },
              { name: 'EBITDA', color: 'var(--chart-2)', values: ys.map((y) => y.ebitda) },
              ...(anySbc ? [{ name: 'EBITDA before stock compensation', color: 'var(--chart-5)', values: ys.map((y) => y.ebitdaExSbc) }] : []),
            ]} />
            <RunBadges rows={ys} get={(y) => y.ebitda} />
            <StatLines split>
              <StatLine label={`EBITDA, fiscal ${ey.year}`} value={fmt(ey.ebitda)} tone={signClass(yoy(ey.ebitda, eyPrev?.ebitda))}
                note={isNum(yoy(ey.ebitda, eyPrev?.ebitda)) ? `${pct(yoy(ey.ebitda, eyPrev?.ebitda), { sign: true })} YoY` : ''} />
              <StatLine label="EBITDA margin" value={pct(ey.ebitdaMargin)} note={`fiscal ${ey.year}`} />
            </StatLines>
          </>
        ) : <Notice>Depreciation and amortisation was not returned for this company, so EBITDA cannot be calculated from its filed lines.</Notice>}
      </OCard>

      <OCard span={4} id="fin-ng-ebitda-reconcile">
        <OHead title={ey ? `EBITDA, fiscal ${ey.year}` : 'EBITDA'} info={`From the operating income the company filed to EBITDA, step by step. Stock compensation is a real cost paid in shares rather than cash; adding it back is the most common adjustment companies make, and the most argued over.`} />
        {ey ? (
          <StatLines>
            <ReconLine label="Operating income" filed value={fmt(ey.operatingIncome)} />
            <ReconLine op="+" label="Depreciation & amortisation" filed value={fmt(ey.da)} />
            <ReconLine op="=" label="EBITDA" value={fmt(ey.ebitda)} />
            {isNum(ey.sbc) ? <ReconLine op="+" label="Stock-based compensation" filed value={fmt(ey.sbc)} /> : null}
            {isNum(ey.ebitdaExSbc) ? <ReconLine op="=" label="EBITDA before stock compensation" value={fmt(ey.ebitdaExSbc)} /> : null}
            <StatLine label="EBITDA margin" value={pct(ey.ebitdaMargin)} />
          </StatLines>
        ) : <Notice>No year has both operating income and depreciation filed.</Notice>}
      </OCard>

      <StatementCard a={a} rows={ys} feed="income" id="fin-ng-stmt-income" title={`${names.adjusted} income measures`} defs={defs}
        foot={CALC_FOOT}
        info={`Every measure with the ${names.filed} line it starts from. Adjusted EPS appears only in fiscal years with all four quarters reported.`} />
    </>
  );
}

/* ---------- balance sheet --------------------------------------------------- */

export function BalanceNonGaap({ a }: { a: Analysis }) {
  const names = useBasisNames();
  const fmt = moneyIn(a);
  const cur = curSymbol(a.facts.currency);
  const ys = useYears(a);
  const nd = ys.filter((y) => isNum(y.netDebt));
  const last = nd[nd.length - 1];
  const tb = ys.filter((y) => isNum(y.tangibleBook));
  const tLast = tb[tb.length - 1];
  const tbPerShare = tLast && isNum(tLast.tangibleBook) && isNum(tLast.shares) && tLast.shares > 0 ? tLast.tangibleBook / tLast.shares : null;
  const pTb = isNum(a.facts.price) && isNum(tbPerShare) && tbPerShare > 0 ? a.facts.price / tbPerShare : null;
  const intangibleShare = tLast && isNum(tLast.intangibles) && isNum(tLast.equity) && tLast.equity > 0 ? tLast.intangibles / tLast.equity : null;
  const netCash = (v: unknown) => isNum(v) && v < 0;

  const g = { debt: 'Net debt · calculated here from the filed lines', book: 'Tangible book value · calculated here from the filed lines' };
  const defs: RowDef[] = [
    { label: `Total debt (${names.filed})`, get: (y) => y.totalDebt, group: g.debt },
    { label: `Cash & short-term investments (${names.filed})`, get: (y) => y.cashSti, group: g.debt },
    { label: 'Net debt', hint: FORMULA.netDebt, get: (y) => y.netDebt, strong: true, group: g.debt },
    { label: 'EBITDA', hint: FORMULA.ebitda, get: (y) => y.ebitda, group: g.debt },
    { label: 'Net debt / EBITDA', get: (y) => y.netDebtToEbitda, fmt: timesFmt, derived: true, group: g.debt },
    { label: `Shareholders’ equity (${names.filed})`, get: (y) => y.equity, group: g.book },
    { label: `Goodwill & intangibles (${names.filed})`, get: (y) => y.intangibles, group: g.book },
    { label: 'Tangible book value', hint: FORMULA.tangibleBook, get: (y) => y.tangibleBook, strong: true, group: g.book },
  ];

  return (
    <>
      <OCard span={8} id="fin-ng-net-debt">
        <OHead title="Net debt" info={`Calculated here: ${FORMULA.netDebt}, at each year end. Below zero the company holds more cash than it owes, which is net cash. The two ${names.filed} lines it is built from are drawn on the ${names.filed} side.`} />
        {nd.length ? (
          <>
            <ColumnChart height={280} legend={false} valueFmt={fmt} categories={ys.map((y) => String(y.year))}
              series={[{ name: 'Net debt', color: 'var(--chart-4)', values: ys.map((y) => y.netDebt) }]} />
            <StatLines split>
              <StatLine label={`Net debt, fiscal ${last.year}`} value={fmt(last.netDebt)} tone={netCash(last.netDebt) ? 'pos' : ''} note={netCash(last.netDebt) ? 'net cash' : 'debt over cash'} />
              <StatLine label="Net debt / EBITDA" value={timesOf(last.netDebtToEbitda)} note={`fiscal ${last.year}`}
                title="Roughly how many years of EBITDA the net debt represents, both calculated here from the same year’s filed lines. Not shown where EBITDA is a loss." />
            </StatLines>
          </>
        ) : <Notice>Total debt and cash were not both returned for any year, so net debt cannot be calculated.</Notice>}
      </OCard>

      <OCard span={4} id="fin-ng-net-debt-reconcile">
        <OHead title={last ? `Net debt, fiscal ${last.year}` : 'Net debt'} info="From the two filed lines to net debt. The figure for today uses the same formula over trailing-twelve-month figures, so it is more recent than the last year end." />
        {last ? (
          <StatLines>
            <ReconLine label="Total debt" filed value={fmt(last.totalDebt)} />
            <ReconLine op="−" label="Cash & short-term investments" filed value={fmt(last.cashSti)} />
            <ReconLine op="=" label="Net debt" value={fmt(last.netDebt)} tone={netCash(last.netDebt) ? 'pos' : ''} />
            <StatLine label="Net debt / EBITDA" value={timesOf(last.netDebtToEbitda)} />
            <StatLine label="Net debt today" value={fmt(a.facts.netDebt)} note="same formula, trailing twelve months" tone={netCash(a.facts.netDebt) ? 'pos' : ''} />
          </StatLines>
        ) : <Notice>No year has both total debt and cash filed.</Notice>}
      </OCard>

      <OCard span={8} id="fin-ng-tangible">
        <OHead title="Tangible book value" info={`Calculated here: ${FORMULA.tangibleBook}. What would be left of the shareholders’ funds if every acquisition premium and bought-in intangible were written off. Equity is drawn beside it as the ${names.filed} line it starts from.`} />
        {tb.length ? (
          <>
            <ColumnChart height={280} valueFmt={fmt} categories={ys.map((y) => String(y.year))} series={[
              { name: `Shareholders’ equity, ${names.filed}`, color: 'var(--up)', values: ys.map((y) => y.equity) },
              { name: 'Tangible book value', color: 'var(--chart-5)', values: ys.map((y) => y.tangibleBook) },
            ]} />
            <StatLines split>
              <StatLine label={`Tangible book value, fiscal ${tLast.year}`} value={fmt(tLast.tangibleBook)} tone={signClass(tLast.tangibleBook)} />
              <StatLine label="Goodwill & intangibles / equity" value={pct(intangibleShare)} note={`fiscal ${tLast.year}`} />
            </StatLines>
          </>
        ) : <Notice>Goodwill and intangibles were not returned for this company, so tangible book value cannot be calculated.</Notice>}
      </OCard>

      <OCard span={4} id="fin-ng-tangible-reconcile">
        <OHead title={tLast ? `Tangible book, fiscal ${tLast.year}` : 'Tangible book'} info="Per share on the year’s weighted average diluted share count, the one the income statement files. The price is today’s, the book value the year end’s." />
        {tLast ? (
          <StatLines>
            <ReconLine label="Shareholders’ equity" filed value={fmt(tLast.equity)} />
            <ReconLine op="−" label="Goodwill & intangibles" filed value={fmt(tLast.intangibles)} />
            <ReconLine op="=" label="Tangible book value" value={fmt(tLast.tangibleBook)} />
            <StatLine label="Per diluted share" value={isNum(tbPerShare) ? `${cur}${dec(tbPerShare, 2)}` : 'n/a'} />
            <StatLine label="Price / tangible book" value={timesOf(pTb)} note="price today"
              title="Not shown where tangible book value is negative — a company whose equity is mostly acquired goodwill has no meaningful multiple here." />
          </StatLines>
        ) : <Notice>No year has both equity and intangibles filed.</Notice>}
      </OCard>

      <StatementCard a={a} rows={ys} feed="balance" id="fin-ng-stmt-balance" title={`${names.adjusted} balance sheet measures`} defs={defs}
        foot={CALC_FOOT} info={`Every measure with the ${names.filed} lines it starts from, at each fiscal year end.`} />
    </>
  );
}

/* ---------- cash flow ---------------------------------------------------------- */

export function CashNonGaap({ a }: { a: Analysis }) {
  const names = useBasisNames();
  const fmt = moneyIn(a);
  const cur = curSymbol(a.facts.currency);
  const ys = useYears(a);
  const withFcf = ys.filter((y) => isNum(y.fcf));
  const fy = withFcf[withFcf.length - 1];
  const fyPrev = withFcf[withFcf.length - 2];
  const fcfGrowth = fy ? yoy(fy.fcf, fyPrev?.fcf) : null;
  const ofOcf = fy && isNum(fy.fcf) && isNum(fy.ocf) && fy.ocf > 0 ? fy.fcf / fy.ocf : null;

  const sumOf = (get: (y: BasisYear) => number | null) => { const xs = withFcf.map(get).filter(isNum); return xs.length ? xs.reduce((p, q) => p + q, 0) : null; };
  const lifeReturned = sumOf((y) => y.returned);
  const lifeFcf = sumOf((y) => y.fcf);
  const lifeShare = isNum(lifeReturned) && lifeReturned > 0 && isNum(lifeFcf) && lifeFcf > 0 ? lifeReturned / lifeFcf : null;
  const span = withFcf.length ? `${withFcf[0].year}–${fy.year}` : 'the filed years';
  const coverTone = (v: unknown) => (isNum(v) && v > 1 ? 'neg' : '');
  const coverTitle = 'Over 100% means the payouts cost more than the free cash flow of the same period, so the difference came from cash on hand or from borrowing.';

  const marginLine = (name: string, color: string, get: (y: BasisYear) => number | null) => ({ name, color, points: ys.map((y) => ({ date: y.date, value: get(y) })) });
  const charted = ys.filter((y) => isNum(y.fcfMargin));

  const g = { fcf: 'Free cash flow · calculated here from the filed lines', sbc: 'After stock compensation', ret: 'Returned to shareholders' };
  const defs: RowDef[] = [
    { label: `Operating cash flow (${names.filed})`, get: (y) => y.ocf, group: g.fcf },
    { label: `Capital expenditure (${names.filed})`, get: (y) => y.capex, group: g.fcf },
    { label: 'Free cash flow', hint: FORMULA.fcf, get: (y) => y.fcf, strong: true, group: g.fcf },
    { label: 'Free cash flow margin', hint: 'free cash flow / revenue', get: (y) => y.fcfMargin, fmt: pctFmt, derived: true, group: g.fcf },
    { label: 'Free cash flow per share', hint: 'over diluted shares', get: (y) => y.fcfPerShare, fmt: epsFmt, derived: true, group: g.fcf },
    { label: `Stock-based compensation (${names.filed})`, get: (y) => y.sbc, group: g.sbc },
    { label: 'Free cash flow after stock compensation', hint: FORMULA.fcfExSbc, get: (y) => y.fcfExSbc, group: g.sbc },
    { label: 'Margin after stock compensation', get: (y) => y.fcfExSbcMargin, fmt: pctFmt, derived: true, group: g.sbc },
    { label: `Dividends + buybacks (${names.filed})`, get: (y) => y.returned, group: g.ret },
    { label: 'Share of free cash flow', get: (y) => y.returnedOfFcf, fmt: pctFmt, derived: true, group: g.ret },
  ];

  if (!withFcf.length) {
    return (
      <OCard span={12} id="fin-ng-fcf">
        <OHead title="Free cash flow" />
        {a.ds.status('cashflow') !== 'ok' ? <FeedGate a={a} feed="cashflow" what="The cash flow statement" />
          : <Notice>Operating cash flow and capital expenditure were not both returned for any year, so free cash flow cannot be calculated.</Notice>}
      </OCard>
    );
  }

  return (
    <>
      <OCard span={8} id="fin-ng-fcf">
        <OHead title="Free cash flow" info={`Calculated here: ${FORMULA.fcf}, both as filed. The SEC counts free cash flow as a non-GAAP liquidity measure: it is not a line on any statement, and companies define it differently. The two ${names.filed} lines are drawn beside it.`} />
        <ColumnChart height={280} valueFmt={fmt} categories={ys.map((y) => String(y.year))} series={[
          { name: `Operating cash flow, ${names.filed}`, color: 'var(--chart-1)', values: ys.map((y) => y.ocf) },
          { name: `Capital expenditure, ${names.filed}`, color: 'var(--chart-6)', values: ys.map((y) => y.capex) },
          { name: 'Free cash flow', color: 'var(--up)', values: ys.map((y) => y.fcf) },
        ]} />
        <RunBadges rows={ys} get={(y) => y.fcf} />
        <StatLines split>
          <StatLine label={`Free cash flow, fiscal ${fy.year}`} value={fmt(fy.fcf)} tone={signClass(fcfGrowth)} note={isNum(fcfGrowth) ? `${pct(fcfGrowth, { sign: true })} YoY` : ''} />
          <StatLine label="Free cash flow margin" value={pct(fy.fcfMargin)} note={`fiscal ${fy.year}`} />
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-ng-fcf-reconcile">
        <OHead title={`Free cash flow, fiscal ${fy.year}`} info="From the operating cash flow the company filed to free cash flow, then on past the stock compensation that operating cash flow added back — paid in shares rather than cash, and diluting the holders instead." />
        <StatLines>
          <ReconLine label="Operating cash flow" filed value={fmt(fy.ocf)} />
          <ReconLine op="−" label="Capital expenditure" filed value={fmt(isNum(fy.capex) ? Math.abs(fy.capex) : null)} />
          <ReconLine op="=" label="Free cash flow" value={fmt(fy.fcf)} />
          {isNum(fy.sbc) ? <ReconLine op="−" label="Stock-based compensation" filed value={fmt(fy.sbc)} /> : null}
          {isNum(fy.fcfExSbc) ? <ReconLine op="=" label="After stock compensation" value={fmt(fy.fcfExSbc)} /> : null}
          <StatLine label="Per diluted share" value={isNum(fy.fcfPerShare) ? `${cur}${dec(fy.fcfPerShare, 2)}` : 'n/a'} />
          <StatLine label="Free cash flow / operating cash flow" value={pct(ofOcf)} />
        </StatLines>
      </OCard>

      <OCard span={8} id="fin-ng-fcf-returned">
        <OHead title="Free cash flow and what was returned" info={`Dividends and buybacks, ${names.filed} lines with their minus signs removed, against the free cash flow calculated for the same year. A bar of returns above the bar of free cash flow is a year funded from the balance sheet.`} />
        <ColumnChart height={280} valueFmt={fmt} categories={ys.map((y) => String(y.year))} series={[
          { name: 'Free cash flow', color: 'var(--up)', values: ys.map((y) => y.fcf) },
          { name: 'Dividends + buybacks', color: 'var(--chart-5)', values: ys.map((y) => y.returned) },
        ]} />
      </OCard>

      <OCard span={4} id="fin-ng-returned">
        <OHead title="Returned against free cash flow" info="What the company paid out as a share of the free cash flow that funded it, in the last filed year and across every year shown." />
        <StatLines>
          <StatLine label="Dividends + buybacks" value={isNum(fy.returned) && fy.returned > 0 ? fmt(fy.returned) : 'nil'} note={`fiscal ${fy.year}`} />
          <StatLine label="Share of free cash flow" value={isNum(fy.returnedOfFcf) ? pct(fy.returnedOfFcf) : 'n/a'} tone={coverTone(fy.returnedOfFcf)} title={coverTitle} />
        </StatLines>
        <StatLines split>
          <StatLine label="Returned in total" value={isNum(lifeReturned) && lifeReturned > 0 ? fmt(lifeReturned) : 'nil'} note={span} />
          <StatLine label="Share of free cash flow" value={isNum(lifeShare) ? pct(lifeShare) : 'n/a'} note={span} tone={coverTone(lifeShare)} title={coverTitle} />
        </StatLines>
      </OCard>

      <OCard span={12} id="fin-ng-fcf-margins">
        <OHead title="Free cash flow margin" info="Each year’s free cash flow over the same year’s revenue, before and after stock compensation. The gap between the two lines is what paying staff in shares is worth to the margin." />
        {charted.length >= 2 ? (
          <MultiLineChart height={280} valueFmt={(v) => pct(v, { dp: 0 })} series={[
            marginLine('Free cash flow', 'var(--up)', (y) => y.fcfMargin),
            marginLine('After stock compensation', 'var(--chart-5)', (y) => y.fcfExSbcMargin),
          ]} />
        ) : <Notice>At least two fiscal years with free cash flow and revenue are needed to chart a margin.</Notice>}
      </OCard>

      <StatementCard a={a} rows={ys} feed="cashflow" id="fin-ng-stmt-cash" title={`${names.adjusted} cash flow measures`} defs={defs}
        foot={CALC_FOOT} info={`Every measure with the ${names.filed} lines it starts from. Capital expenditure prints as filed, negative; the formula takes its size.`} />
    </>
  );
}
