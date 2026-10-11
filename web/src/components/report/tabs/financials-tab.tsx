'use client';

/* ==========================================================================
   Maz Vantage — the Financials tab

   The filed statements, as filed: income, balance sheet and cash flow, each
   as charts of the shape and a table of the lines. Nothing here is graded or
   compared to a sector — every other tab is an opinion about a number; this
   one is the number.

   Two bases, switched across all three statements, and never mixed:

   - **GAAP** (IFRS, where the filing's tags say so) — filed lines, and ratios
     of two filed lines, each marked as calculated. No EBITDA, no free cash
     flow, no net debt, no consensus: every one of those is something other
     than what the company filed.
   - **Non-GAAP** — `financials-non-gaap.tsx`. Adjusted EPS as the company
     reported it, and the standard measures calculated from the filed lines,
     each beside the GAAP figure it starts from.

   - **Annual only.** A column is a fiscal year and the newest can be eleven
     months old; the TTM figures the report runs on are not here on purpose.
   - **The feed is narrower than a filing.** A row with no figure in any year
     is dropped rather than printed as a row of n/a.
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, fmtDate, isNum, num, pct, signClass, trim, yearOf, yoy } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { ColumnChart, MultiLineChart, WaterfallChart } from '@/components/charts/charts';
import { FeedGate, Notice, OCard, OHead, OMore, Pill, StatLine, StatLines } from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { Hint, Tabs, TabsContent, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { BeneishCard } from '@/components/report/beneish-card';
import { accountingStandard, loadBasisFeed, type BasisFeed, type StandardRead } from '@/lib/gaap';
import {
  BasisContext, GAAP_NAMES, IFRS_NAMES, RunBadges, StatementCard, epsFmt, incomeByYear, moneyIn, pctFmt, seriesOf,
  statementRows, timesFmt, timesOf, useBasisNames, type RowDef,
} from './financials-parts';
import { BalanceNonGaap, CashNonGaap, IncomeNonGaap } from './financials-non-gaap';
import { cn } from '@/lib/cn';

const INCOME_ROWS: RowDef[] = [
  { label: 'Revenue', get: (r) => r.revenue, strong: true },
  { label: 'Cost of revenue', get: (r) => r.costOfRevenue },
  { label: 'Gross profit', get: (r) => r.grossProfit, strong: true },
  { label: 'Research & development', get: (r) => r.researchAndDevelopmentExpenses },
  { label: 'Selling, general & admin', get: (r) => r.sellingGeneralAndAdministrativeExpenses },
  { label: 'Operating income', get: (r) => r.operatingIncome, strong: true },
  // No EBITDA: it is a non-GAAP measure, and it is on the other side.
  { label: 'Interest expense', get: (r) => r.interestExpense },
  { label: 'Net income', get: (r) => r.netIncome, strong: true },
  { label: 'Earnings per share (diluted)', get: (r) => r.epsDiluted ?? r.eps, fmt: epsFmt },
  { label: 'Diluted shares', get: (r) => r.weightedAverageShsOutDil, fmt: (v) => num(v, 2) },
  ...([
    ['Gross margin', (r: any) => r.grossProfit],
    ['Operating margin', (r: any) => r.operatingIncome],
    ['Net margin', (r: any) => r.netIncome],
  ] as const).map(([label, line]): RowDef => ({
    label, derived: true, group: 'Margins · calculated from the lines above', fmt: pctFmt,
    get: (r) => (r.revenue > 0 && isNum(line(r)) ? line(r) / r.revenue : null),
  })),
];

const CASHFLOW_ROWS: RowDef[] = [
  { label: 'Net income', get: (r) => r.netIncome },
  { label: 'Operating cash flow', get: (r) => r.operatingCashFlow, strong: true },
  { label: 'Capital expenditure', get: (r) => r.capitalExpenditure },
  // No free cash flow: the SEC counts it as a non-GAAP liquidity measure.
  { label: 'Dividends paid', get: (r) => r.commonDividendsPaid ?? r.netDividendsPaid },
  { label: 'Stock issued', get: (r) => r.commonStockIssuance },
  { label: 'Share repurchases', get: (r) => r.commonStockRepurchased },
  // Only meaningful when the company made a profit — dividing cash flow by a
  // loss returns a number, and it means nothing.
  { label: 'Cash conversion', derived: true, group: 'Quality · calculated from the lines above', fmt: pctFmt,
    get: (r) => (isNum(r.operatingCashFlow) && isNum(r.netIncome) && r.netIncome > 0 ? r.operatingCashFlow / r.netIncome : null) },
];

const BALANCE_ROWS: RowDef[] = [
  { label: 'Cash & short-term investments', get: (r) => r.cashAndShortTermInvestments },
  { label: 'Total current assets', get: (r) => r.totalCurrentAssets },
  { label: 'Total assets', get: (r) => r.totalAssets, strong: true },
  { label: 'Total current liabilities', get: (r) => r.totalCurrentLiabilities },
  { label: 'Total liabilities', get: (r) => r.totalLiabilities, strong: true },
  { label: 'Total debt', get: (r) => r.totalDebt },
  // No net debt: debt less cash is a non-GAAP measure, and on the other side.
  { label: 'Shareholders’ equity', get: (r) => r.totalStockholdersEquity, strong: true },
  { label: 'Working capital', derived: true, group: 'Derived · calculated from the lines above',
    get: (r) => (isNum(r.totalCurrentAssets) && isNum(r.totalCurrentLiabilities) ? r.totalCurrentAssets - r.totalCurrentLiabilities : null) },
  { label: 'Debt / equity', derived: true, group: 'Derived · calculated from the lines above', fmt: timesFmt,
    get: (r) => (r.totalStockholdersEquity > 0 && isNum(r.totalDebt) ? r.totalDebt / r.totalStockholdersEquity : null) },
];

/* ---------- income -------------------------------------------------------- */

function IncomePanel({ a }: { a: Analysis }) {
  const names = useBasisNames();
  const rows = statementRows(a, 'income');
  const fmt = moneyIn(a);
  const cur = curSymbol(a.facts.currency);
  const last = rows[rows.length - 1] || {};
  const prev = rows[rows.length - 2];
  const lastYear = yearOf(last.date);

  const revChange = yoy(last.revenue, prev?.revenue);
  const niChange = yoy(last.netIncome, prev?.netIncome);
  const margin = (line: unknown) => (last.revenue > 0 && isNum(line) ? line / last.revenue : null);
  const delta = (get: (r: any) => unknown) => {
    const v = yoy(get(last) as number, prev ? (get(prev) as number) : null);
    return isNum(v) ? `${pct(v, { sign: true })} YoY` : '';
  };

  // The bridge's last step is a residual — tax, interest and non-operating
  // income are not all reliably returned, and a bar labelled "tax" that is
  // actually three things would be worse than one that says so.
  const out = (v: unknown) => (isNum(v) ? -v : null);
  const below = isNum(last.operatingIncome) && isNum(last.netIncome) ? last.netIncome - last.operatingIncome : null;
  const kept = last.revenue > 0 && isNum(last.netIncome) ? last.netIncome / last.revenue : null;

  const g = a.growth || {};
  const filedYear = yearOf(a.facts.lastReported);
  const onPrior = isNum(filedYear) ? `FY${filedYear} vs prior` : 'vs prior year';
  const gLine = (label: string, v: unknown, note: string) => (
    <StatLine label={label} value={isNum(v) ? pct(v, { sign: true }) : 'n/a'} note={note} tone={signClass(v as number)} />
  );

  // EPS: the gap between how fast EPS and net income grew is the share count.
  const epsOf = (r: any) => r.epsDiluted ?? r.eps;
  const epsGrowth = yoy(epsOf(last), prev ? epsOf(prev) : null);
  const gap = isNum(epsGrowth) && isNum(niChange) ? epsGrowth - niChange : null;

  // Share count: fewer shares is the good direction, so the tone is inverted.
  const shareRows = rows.filter((r) => isNum(r.weightedAverageShsOutDil));
  const sLast = shareRows[shareRows.length - 1];
  const sFirst = shareRows[0];
  const sFive = shareRows.length > 5 ? shareRows[shareRows.length - 6] : sFirst;
  const changeFrom = (from: any) => (from && sLast ? yoy(sLast.weightedAverageShsOutDil, from.weightedAverageShsOutDil) : null);
  const over5 = changeFrom(sFive);
  const overAll = changeFrom(sFirst);
  const shrinkTone = (v: unknown) => (isNum(v) && v !== 0 ? (v < 0 ? 'pos' : 'neg') : '');

  const marginLine = (name: string, color: string, get: (r: any) => unknown) => ({
    name, color, points: rows.filter((r) => r.revenue > 0).map((r) => ({ date: r.date, value: get(r) as number | null })),
  });

  return (
    <>
      {/* Filed years only. The consensus tail this chart used to carry was
          adjusted earnings drawn on the end of filed earnings — it extends
          the adjusted series on the other side now. */}
      <OCard span={8} id="fin-revenue">
        <OHead title="Revenue and earnings" info={`Filed fiscal years, oldest on the left. No forecast is drawn here: consensus earnings are on the adjusted basis, not ${names.filed}, so they continue the adjusted series under ${names.adjusted} instead. The Perf and CAGR figures under the chart are measured over the filed years.`} />
        <ColumnChart height={280} valueFmt={fmt}
          categories={rows.map((r) => String(yearOf(r.date)))} series={[
            { name: 'Revenue', color: 'var(--chart-1)', values: seriesOf(rows, (r) => r.revenue) },
            { name: 'Net income', color: 'var(--up)', values: seriesOf(rows, (r) => r.netIncome) },
          ]} />
        <RunBadges rows={rows} get={(r) => r.revenue} />
        <StatLines split>
          <StatLine label={`Revenue, fiscal ${lastYear ?? 'n/a'}`} value={fmt(last.revenue)} note={isNum(revChange) ? `${pct(revChange, { sign: true })} YoY` : ''} tone={signClass(revChange)} />
          <StatLine label={`Net income, fiscal ${lastYear ?? 'n/a'}`} value={fmt(last.netIncome)} note={isNum(niChange) ? `${pct(niChange, { sign: true })} YoY` : ''} tone={signClass(niChange)} />
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-income-year">
        <OHead title={`Fiscal ${lastYear ?? 'year'}`} info="The last filed year of the statement beside it, top to bottom. Annual and as filed, so these are the figures in the final column of the table below rather than the trailing twelve months the report grades on." />
        <StatLines>
          <StatLine label="Revenue" value={fmt(last.revenue)} note={delta((r) => r.revenue)} />
          <StatLine label="Gross profit" value={fmt(last.grossProfit)} note={delta((r) => r.grossProfit)} />
          <StatLine label="Operating income" value={fmt(last.operatingIncome)} note={delta((r) => r.operatingIncome)} />
          <StatLine label="Net income" value={fmt(last.netIncome)} note={delta((r) => r.netIncome)} />
          <StatLine label="Earnings per share" value={isNum(epsOf(last)) ? `${cur}${dec(epsOf(last), 2)}` : 'n/a'} note={`diluted, ${names.filed}`} />
          <StatLine label="Gross margin" value={pct(margin(last.grossProfit))} />
          <StatLine label="Operating margin" value={pct(margin(last.operatingIncome))} />
          <StatLine label="Net margin" value={pct(margin(last.netIncome))} />
        </StatLines>
      </OCard>

      <OCard span={8} id="fin-bridge">
        <OHead title={`How revenue became earnings, fiscal ${lastYear ?? 'year'}`} info="Each cost bar hangs off the running total of the bar before it, so its height is what that cost took out. The last step is everything between operating income and net income — mostly tax, but not only tax." />
        <WaterfallChart height={300} valueFmt={fmt} steps={[
          { label: 'Revenue', value: last.revenue ?? null, kind: 'total', color: 'var(--primary)' },
          { label: 'Cost of revenue', value: out(last.costOfRevenue), kind: 'delta' },
          { label: 'Gross profit', value: last.grossProfit ?? null, kind: 'total', color: 'var(--chart-1)' },
          { label: 'R&D', value: out(last.researchAndDevelopmentExpenses), kind: 'delta' },
          { label: 'SG&A', value: out(last.sellingGeneralAndAdministrativeExpenses), kind: 'delta' },
          { label: 'Operating income', value: last.operatingIncome ?? null, kind: 'total', color: 'var(--chart-1)' },
          { label: 'Tax & other', value: below, kind: 'delta' },
          { label: 'Net income', value: last.netIncome ?? null, kind: 'total', color: 'var(--up)' },
        ]} />
        <StatLines split>
          <StatLine label="Kept as profit" value={pct(kept)} note="of every unit of revenue" />
          <StatLine label="Below the operating line" value={fmt(below)} note="tax, interest and other" />
        </StatLines>
      </OCard>

      {/* Operating income from the statements themselves: the growth feed's
          "EBIT" is pre-tax income plus interest, which is not the filed
          operating line, and EBITDA is on the other side. */}
      <OCard span={4} id="fin-growth">
        <OHead title="Growth" info="Filed year against the year before it. The multi-year figures are annualised, so a 5-year rate is the constant rate that would have got from the first year to the last rather than the sum of five annual steps." />
        <StatLines>
          {gLine('Revenue', g.revenueYoy, onPrior)}
          {gLine('Revenue, 3-year', g.revenue3y, 'annualised')}
          {gLine('Revenue, 5-year', g.revenue5y, 'annualised')}
          {gLine('Operating income', yoy(last.operatingIncome, prev?.operatingIncome), onPrior)}
          {gLine('Net income', g.netIncome, onPrior)}
          {gLine('Earnings per share', g.epsDiluted ?? g.eps, onPrior)}
          {gLine('Research & development', g.rdExpense, onPrior)}
        </StatLines>
      </OCard>

      <OCard span={8} id="fin-eps">
        <OHead title="Earnings per share" info={`Diluted and ${names.filed}, as filed. This is the same figure as the earnings-per-share row of the table below, drawn so a run of years reads as a shape. The company's adjusted figure is under ${names.adjusted}.`} />
        <ColumnChart height={250} legend={false} valueFmt={(v) => `${cur}${dec(v, 2)}`} categories={rows.map((r) => String(yearOf(r.date) ?? '—'))}
          series={[{ name: `Diluted EPS, ${names.filed}`, color: 'var(--chart-5)', values: seriesOf(rows, epsOf) }]} />
        <RunBadges rows={rows} get={epsOf} />
        <StatLines split>
          <StatLine label="Earnings per share grew" value={isNum(epsGrowth) ? pct(epsGrowth, { sign: true }) : 'n/a'} note="on the year before" tone={signClass(epsGrowth)} />
          <StatLine label="Earnings grew" value={isNum(niChange) ? pct(niChange, { sign: true }) : 'n/a'} note="on the year before" tone={signClass(niChange)} />
          {/* Points, not per cent: one rate subtracted from another. */}
          <StatLine label="The difference" value={isNum(gap) ? `${gap > 0 ? '+' : ''}${trim(gap * 100, 1)} pp` : 'n/a'} tone={signClass(gap)} note="is the share count"
            title="Earnings per share grows faster than earnings when the share count falls, and slower when it rises. This is the gap between the two rates." />
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-shares">
        {shareRows.length ? (
          <>
            <OHead title="Share count" info="Weighted average diluted shares, as the income statement files them — an average over the year rather than the count on the last day of it, which is why it will not match the shares outstanding below." />
            <StatLines>
              <StatLine label={`Diluted shares, fiscal ${yearOf(sLast.date) ?? 'year'}`} value={num(sLast.weightedAverageShsOutDil, 2)} />
              {sFive && sFive !== sLast ? <StatLine label={`Diluted shares, fiscal ${yearOf(sFive.date) ?? 'year'}`} value={num(sFive.weightedAverageShsOutDil, 2)} /> : null}
              <StatLine label="Change over five years" value={isNum(over5) ? pct(over5, { sign: true }) : 'n/a'} tone={shrinkTone(over5)} />
              <StatLine label="Change over the filed years" value={isNum(overAll) ? pct(overAll, { sign: true }) : 'n/a'} note={shareRows.length > 1 ? `since ${yearOf(sFirst.date)}` : ''} tone={shrinkTone(overAll)} />
              <StatLine label="Shares outstanding" value={num(a.facts.shares, 2)} note="latest reported" />
              <StatLine label="Buyback yield" value={pct(a.val?.buybackYield)} note="against market cap"
                title="Shares bought back over the filed year as a share of today’s market capitalisation. Cash spent, not shares retired — the two differ when a buyback only offsets issuance." />
            </StatLines>
          </>
        ) : (<><OHead title="Share count" /><Notice>The income statements returned for this company carry no share count.</Notice></>)}
      </OCard>

      {/* Lines, not bars: the question is whether the gaps between the margins
          are holding, which is a shape over time. */}
      <OCard span={12} id="fin-margins">
        <OHead title="Margins" info="Each margin is that year’s filed line over that year’s filed revenue. The trailing-twelve margins graded under Profitability are computed from a different period and will differ." />
        {rows.filter((r) => r.revenue > 0).length >= 2 ? (
          <MultiLineChart height={280} valueFmt={(v) => pct(v, { dp: 0 })} series={[
            marginLine('Gross', 'var(--chart-2)', (r) => (isNum(r.grossProfit) ? r.grossProfit / r.revenue : null)),
            marginLine('Operating', 'var(--chart-1)', (r) => (isNum(r.operatingIncome) ? r.operatingIncome / r.revenue : null)),
            marginLine('Net', 'var(--up)', (r) => (isNum(r.netIncome) ? r.netIncome / r.revenue : null)),
          ]} />
        ) : <Notice>At least two filed years are needed to chart a margin trend.</Notice>}
      </OCard>

      <StatementCard a={a} rows={rows} feed="income" id="fin-stmt-income" title="Income statement" defs={INCOME_ROWS}
        info="Annual, as filed. The report’s ratios run on trailing twelve months and will not tie to these columns." />
    </>
  );
}

/* ---------- balance sheet ---------------------------------------------------- */

function BalancePanel({ a }: { a: Analysis }) {
  const names = useBasisNames();
  const f = a.facts;
  const rows = statementRows(a, 'balance');
  const fmt = moneyIn(a);
  const cur = curSymbol(f.currency);
  const last = rows[rows.length - 1] || {};
  const prev = rows[rows.length - 2];
  const line = (name: string, color: string, get: (r: any) => unknown) => ({ name, color, points: rows.map((r) => ({ date: r.date, value: get(r) as number })) });
  const wc = isNum(last.totalCurrentAssets) && isNum(last.totalCurrentLiabilities) ? last.totalCurrentAssets - last.totalCurrentLiabilities : null;
  const ratio = last.totalCurrentLiabilities > 0 && isNum(last.totalCurrentAssets) ? last.totalCurrentAssets / last.totalCurrentLiabilities : null;
  const eqGrowth = yoy(last.totalStockholdersEquity, prev?.totalStockholdersEquity);
  const ofAssets = last.totalAssets > 0 && isNum(last.totalStockholdersEquity) ? last.totalStockholdersEquity / last.totalAssets : null;
  const perShare = (v: unknown) => (isNum(v) ? `${cur}${dec(v, 2)}` : 'n/a');
  const covers = last.totalDebt > 0 && isNum(last.cashAndShortTermInvestments) ? last.cashAndShortTermInvestments / last.totalDebt : null;

  return (
    <>
      {/* Lines, not stacked: assets = liabilities + equity, so stacking would
          draw the same total twice; as lines the gap between the top two IS equity. */}
      <OCard span={8} id="fin-balance-history">
        <OHead title="Balance sheet over time" info="Assets equal liabilities plus equity, so the gap between the top two lines is the equity line drawn a second way." />
        {rows.length >= 2 ? (
          <MultiLineChart height={280} valueFmt={fmt} series={[
            line('Total assets', 'var(--chart-1)', (r) => r.totalAssets),
            line('Total liabilities', 'var(--chart-6)', (r) => r.totalLiabilities),
            line('Shareholders’ equity', 'var(--up)', (r) => r.totalStockholdersEquity),
            line('Total debt', 'var(--chart-4)', (r) => r.totalDebt),
          ]} />
        ) : <Notice>At least two filed balance sheets are needed to chart a history.</Notice>}
      </OCard>

      {/* Deliberately the odd card out: the company as it stands now (TTM), not
          a filed year — the figure a reader wants after eight columns of history. */}
      <OCard span={4} id="fin-position">
        <OHead title="Position today" info={`Trailing twelve months, not the last filed year — the same basis the rest of the report grades on, and more recent than the final column of the tables. Net debt is under ${names.adjusted}.`} />
        <StatLines>
          <StatLine label="Cash & equivalents" value={fmt(f.cash)} />
          <StatLine label="Total debt" value={fmt(f.totalDebt)} />
          <StatLine label="Working capital" value={fmt(f.workingCapital)} />
          <StatLine label="Shareholders’ equity" value={fmt(f.equity)} />
          {/* `dec`, not `trim`: a current ratio of 1.0033 printed as "1x" reads as
              a round number the company hit rather than the coin-flip it is. */}
          <StatLine label="Current ratio" value={timesOf(f.currentRatio)} />
          <StatLine label="Debt / equity" value={timesOf(f.debtToEquity)} />
          <StatLine label="Book value / share" value={perShare(f.bookValuePerShare)} />
        </StatLines>
      </OCard>

      <OCard span={8} id="fin-cash-debt">
        <OHead title="Cash against debt" info={`Both as filed at each year end, so neither is the position today — the trailing-twelve figures under “Position today” are more recent than the last pair of bars here. The difference between the two, net debt, is a ${names.adjusted} measure and is drawn there.`} />
        <ColumnChart height={280} valueFmt={fmt} categories={rows.map((r) => String(yearOf(r.date) ?? '—'))} series={[
          { name: 'Cash & short-term investments', color: 'var(--up)', values: seriesOf(rows, (r) => r.cashAndShortTermInvestments) },
          { name: 'Total debt', color: 'var(--chart-6)', values: seriesOf(rows, (r) => r.totalDebt) },
        ]} />
        <StatLines split>
          <StatLine label={`Cash & short-term investments, fiscal ${yearOf(last.date) ?? 'year'}`} value={fmt(last.cashAndShortTermInvestments)} />
          <StatLine label={`Total debt, fiscal ${yearOf(last.date) ?? 'year'}`} value={fmt(last.totalDebt)} />
          <StatLine label="Cash / debt" value={timesOf(covers)} note="filed, not TTM"
            title="Cash and short-term investments over total debt at the year end. Above 1x the company could repay every borrowing from what it holds." />
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-strength">
        <OHead title="Financial strength" info="Published scores plus the ratios they are built from. The two scores are as of the last filed year; the ratios are trailing twelve months." />
        <StatLines>
          <StatLine label="Altman Z-score" value={isNum(f.altmanZ) ? dec(f.altmanZ, 2) : 'n/a'} note="latest filed"
            title="A bankruptcy-distance score. Above 3 is conventionally safe and under 1.8 distressed. Built for manufacturers, and misleading for banks and for asset-light businesses." />
          <StatLine label="Piotroski F-score" value={isNum(f.piotroski) ? `${dec(f.piotroski, 0)} / 9` : 'n/a'} note="latest filed"
            title="Nine pass/fail accounting tests. Counts how many the company passes, not how well it passes them." />
          <StatLine label="Beneish M-Score" value={isNum(a.beneish?.latest?.m) ? dec(a.beneish.latest!.m!, 2) : 'n/a'}
            note={isNum(a.beneish?.latest?.year) ? `FY${a.beneish.latest!.year} vs prior` : 'last two filed years'}
            title="An earnings-manipulation screen: above −1.78 the accounts share a pattern with companies later caught. Broken down below the balance sheet charts." />
          <StatLine label="Interest coverage" value={timesOf(f.interestCover)} note="TTM"
            title="Operating profit over the interest bill. Not shown where the company reports no interest expense, which is not the same as covering it infinitely." />
          <StatLine label="Debt / assets" value={timesOf(f.debtToAssets)} note="TTM" />
          <StatLine label="Debt / capital" value={timesOf(f.debtToCapital)} note="TTM" />
          <StatLine label="Quick ratio" value={timesOf(f.quickRatio)} note="TTM" title="The current ratio with inventory taken out — what could be paid without selling stock first." />
          <StatLine label="Cash ratio" value={timesOf(f.cashRatio)} note="TTM" />
          <StatLine label="Financial leverage" value={timesOf(f.financialLeverage)} note="TTM" title="Total assets over equity: how many units of balance sheet each unit of shareholders’ money is carrying." />
        </StatLines>
      </OCard>

      <OCard span={8} id="fin-working-capital">
        <OHead title="Working capital" info="Current assets against current liabilities at each year end. A ratio under 1x is not by itself a warning — a business paid before it pays its own suppliers runs there on purpose — but it does mean the year’s bills are not covered by the year’s assets alone." />
        <ColumnChart height={280} valueFmt={fmt} categories={rows.map((r) => String(yearOf(r.date) ?? '—'))} series={[
          { name: 'Current assets', color: 'var(--chart-1)', values: seriesOf(rows, (r) => r.totalCurrentAssets) },
          { name: 'Current liabilities', color: 'var(--chart-4)', values: seriesOf(rows, (r) => r.totalCurrentLiabilities) },
        ]} />
        <StatLines split>
          <StatLine label={`Working capital, fiscal ${yearOf(last.date) ?? 'year'}`} value={fmt(wc)} tone={isNum(wc) && wc < 0 ? 'neg' : ''} />
          <StatLine label="Current ratio, that year" value={timesOf(ratio)} note="filed, not TTM" />
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-equity">
        <OHead title="Equity and book value" info={`A low or negative equity is normal for a company that has returned more to shareholders than it has retained, and is not on its own a solvency problem — the card beside this one is where solvency is answered. Tangible book value is under ${names.adjusted}.`} />
        <StatLines>
          <StatLine label={`Equity, fiscal ${yearOf(last.date) ?? 'year'}`} value={fmt(last.totalStockholdersEquity)} />
          <StatLine label="Change on the year" value={isNum(eqGrowth) ? pct(eqGrowth, { sign: true }) : 'n/a'} tone={signClass(eqGrowth)} />
          <StatLine label="Equity / assets" value={pct(ofAssets)} note="filed" title="The share of the balance sheet the shareholders own outright. The rest is funded by somebody else." />
          <StatLine label="Book value / share" value={perShare(f.bookValuePerShare)} note="TTM" />
          <StatLine label="Price / book" value={timesOf(f.pb)} note="TTM" />
          <StatLine label="Return on equity" value={pct(f.roe)} note="TTM" />
        </StatLines>
      </OCard>

      <BeneishCard a={a} />

      <StatementCard a={a} rows={rows} feed="balance" id="fin-stmt-balance" title="Balance sheet" defs={BALANCE_ROWS}
        info="Position at each fiscal year end, as filed. The headline figures elsewhere in the report are trailing twelve months and will be more recent than the last column here." />
    </>
  );
}

/* ---------- cash flow ----------------------------------------------------------- */

function CashPanel({ a }: { a: Analysis }) {
  const names = useBasisNames();
  const f = a.facts;
  const rows = statementRows(a, 'cash');
  const fmt = moneyIn(a);
  const last = rows[rows.length - 1] || {};
  const year = yearOf(last.date);
  const abs = (v: unknown) => (isNum(v) ? Math.abs(v) : null);
  const conversion = isNum(last.operatingCashFlow) && isNum(last.netIncome) && last.netIncome > 0 ? last.operatingCashFlow / last.netIncome : null;

  // Returned to shareholders: filed minus signs off, read against the filed
  // profit — the total payout ratio, a ratio of two GAAP lines.
  const divOf = (r: any) => abs(r.commonDividendsPaid ?? r.netDividendsPaid);
  const bbOf = (r: any) => abs(r.commonStockRepurchased);
  const capexOf = (r: any) => abs(r.capitalExpenditure);
  const total = (get: (r: any) => number | null) => { const xs = rows.map(get).filter(isNum); return xs.length ? xs.reduce((p, q) => p + q, 0) : null; };
  const lastDiv = divOf(last);
  const lastBb = bbOf(last);
  const lastTotal = (lastDiv ?? 0) + (lastBb ?? 0);
  const share = (returned: number, base: unknown) => (isNum(base) && base > 0 && returned > 0 ? returned / base : null);
  const lifeTotal = (total(divOf) ?? 0) + (total(bbOf) ?? 0);
  const lifeShare = share(lifeTotal, total((r) => (isNum(r.netIncome) ? r.netIncome : null)));
  const lastShare = share(lastTotal, last.netIncome);
  const span = rows.length ? `${yearOf(rows[0].date)}–${yearOf(rows[rows.length - 1].date)}` : 'the filed years';
  const coverTone = (v: unknown) => (isNum(v) && v > 1 ? 'neg' : '');
  const coverTitle = 'Dividends and buybacks over net income. Over 100% means the company returned more than it earned in the same period, so the difference came from cash on hand or from borrowing.';

  const spent = [capexOf(last), divOf(last), bbOf(last)].filter(isNum).reduce((p, q) => p + q, 0);
  const ofOcf = last.operatingCashFlow > 0 && spent > 0 ? spent / last.operatingCashFlow : null;

  const income = incomeByYear(a);
  const revenue = income.get(year)?.revenue ?? null;
  const ofRevenue = (v: unknown) => (isNum(v) && revenue > 0 ? v / revenue : null);
  const capexOfOcf = last.operatingCashFlow > 0 && isNum(last.capitalExpenditure) ? Math.abs(last.capitalExpenditure) / last.operatingCashFlow : null;
  const basis = isNum(year) ? `fiscal ${year}` : 'last filed year';

  const ratio = (r: any, get: (r: any) => unknown) => {
    const rev = income.get(yearOf(r.date))?.revenue ?? null;
    const v = get(r);
    return rev > 0 && isNum(v) ? v / rev : null;
  };
  const mline = (name: string, color: string, get: (r: any) => unknown) => ({ name, color, points: rows.map((r) => ({ date: r.date, value: ratio(r, get) })) });
  const charted = rows.filter((r) => isNum(ratio(r, (q) => q.operatingCashFlow)));

  return (
    <>
      <OCard span={8} id="fin-cash">
        <OHead title="Cash generation" info={`Operating cash flow and capital expenditure, both as filed — capital expenditure negative, because it is money going out. The one less the other is free cash flow, which is a ${names.adjusted} measure and is drawn there.`} />
        <ColumnChart height={280} valueFmt={fmt} categories={rows.map((r) => String(yearOf(r.date)))} series={[
          { name: 'Operating cash flow', color: 'var(--chart-1)', values: seriesOf(rows, (r) => r.operatingCashFlow) },
          { name: 'Capital expenditure', color: 'var(--chart-6)', values: seriesOf(rows, (r) => r.capitalExpenditure) },
        ]} />
        <RunBadges rows={rows} get={(r) => r.operatingCashFlow} />
        <StatLines split>
          <StatLine label={`Operating cash flow, fiscal ${year ?? 'n/a'}`} value={fmt(last.operatingCashFlow)} />
          <StatLine label="Cash conversion" value={isNum(conversion) ? pct(conversion) : 'n/a'} note="operating cash / net income"
            title="Above 100% means the business collected more cash than it booked as profit. Not shown in a loss-making year, where the ratio has no meaning." />
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-returns">
        <OHead title="Returned to shareholders" info={`Dividends and buybacks with their filed minus signs removed, read against the net income of the same years. Against free cash flow is under ${names.adjusted}.`} />
        <StatLines>
          <StatLine label="Dividends paid" value={fmt(lastDiv)} note={`fiscal ${year ?? 'n/a'}`} />
          <StatLine label="Share repurchases" value={fmt(lastBb)} note={`fiscal ${year ?? 'n/a'}`} />
          <StatLine label="Total returned" value={lastTotal > 0 ? fmt(lastTotal) : 'nil'} />
          <StatLine label="Share of net income" value={isNum(lastShare) ? pct(lastShare) : 'n/a'} tone={coverTone(lastShare)} title={coverTitle} />
        </StatLines>
        <StatLines split>
          <StatLine label="Returned in total" value={lifeTotal > 0 ? fmt(lifeTotal) : 'nil'} note={span} />
          <StatLine label="Share of net income" value={isNum(lifeShare) ? pct(lifeShare) : 'n/a'} note={span} tone={coverTone(lifeShare)} title={coverTitle} />
        </StatLines>
      </OCard>

      <OCard span={8} id="fin-allocation">
        <OHead title="Where the cash went" info="Capital expenditure, dividends and buybacks with their filed minus signs removed, so the height of a bar is what the year spent. Debt repayment and acquisitions are not in the stack — this data plan does not return them separately." />
        <ColumnChart stacked height={280} valueFmt={fmt} categories={rows.map((r) => String(yearOf(r.date) ?? '—'))} series={[
          { name: 'Capital expenditure', color: 'var(--chart-1)', values: seriesOf(rows, capexOf) },
          { name: 'Dividends', color: 'var(--chart-2)', values: seriesOf(rows, divOf) },
          { name: 'Buybacks', color: 'var(--chart-5)', values: seriesOf(rows, bbOf) },
        ]} />
        <StatLines split>
          <StatLine label={`Spent, fiscal ${year ?? 'year'}`} value={spent > 0 ? fmt(spent) : 'nil'} />
          <StatLine label="Operating cash flow, that year" value={fmt(last.operatingCashFlow)} note={isNum(ofOcf) ? `${pct(ofOcf)} of it used` : ''}
            tone={isNum(ofOcf) && ofOcf > 1 ? 'neg' : ''}
            title="Over 100% means the three uses cost more than the year’s operating cash, so the difference came from cash on hand, from borrowing, or from selling something." />
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-cash-quality">
        <OHead title="Cash quality" info="Cash flow against the revenue that produced it and the profit it is supposed to correspond to. Where a row says a fiscal year, both halves come from that year’s statements." />
        <StatLines>
          <StatLine label="Operating cash flow margin" value={pct(ofRevenue(last.operatingCashFlow))} note={basis} />
          <StatLine label="Cash conversion" value={pct(conversion)} note="operating cash / net income"
            title="Above 100% means the business collected more cash than it booked as profit. Not shown in a loss-making year, where the ratio has no meaning." />
          <StatLine label="Capital expenditure / revenue" value={pct(ofRevenue(abs(last.capitalExpenditure)))} note={basis} />
          <StatLine label="Capital expenditure / operating cash flow" value={pct(capexOfOcf)} note={basis} />
          <StatLine label="Income quality" value={isNum(f.incomeQuality) ? `${dec(f.incomeQuality, 2)}x` : 'n/a'} note="TTM"
            title="Operating cash flow over net income. Below 1 for long means profit is being booked faster than it is collected." />
          <StatLine label="Stock compensation / revenue" value={pct(f.sbcToRevenue)} note="TTM"
            title="A non-cash charge added back inside operating cash flow, so it flatters every ratio on this card." />
        </StatLines>
      </OCard>

      <OCard span={12} id="fin-cash-margins">
        <OHead title="Cash margins" info={`Each year’s cash flow over the same year’s revenue. The margins graded under Profitability are trailing twelve months and computed from the published ratios, so they will not land exactly on the last point of these lines. The free cash flow margin is under ${names.adjusted}.`} />
        {charted.length >= 2 ? (
          <MultiLineChart height={280} valueFmt={(v) => pct(v, { dp: 0 })} series={[
            mline('Operating cash flow', 'var(--chart-1)', (r) => r.operatingCashFlow),
            mline('Capital expenditure', 'var(--chart-6)', (r) => (isNum(r.capitalExpenditure) ? Math.abs(r.capitalExpenditure) : null)),
          ]} />
        ) : <Notice>At least two fiscal years present on both the cash flow statement and the income statement are needed to chart a cash margin.</Notice>}
      </OCard>

      <StatementCard a={a} rows={rows} feed="cashflow" id="fin-stmt-cash" title="Cash flow statement" defs={CASHFLOW_ROWS}
        info="As filed, which means money leaving the company is negative — capital expenditure, dividends and buybacks all print with a minus." />
    </>
  );
}

/* ---------- the basis --------------------------------------------------------- */

type Basis = 'filed' | 'adjusted';

/** One on-demand feed, loaded once the reader needs it and not before. */
function useBasisFeed(a: Analysis, name: BasisFeed, enabled: boolean) {
  const [got, setGot] = React.useState<{ for: Analysis; data: any[] | null } | null>(null);
  React.useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    loadBasisFeed(name, a.facts.symbol, a.ds).then((data) => { if (live) setGot({ for: a, data }); });
    return () => { live = false; };
  }, [a, name, enabled]);
  const mine = got?.for === a ? got : null;
  return { loading: enabled && !mine, data: mine?.data ?? null };
}

/** What the view on screen is, in one line under the switch. */
function BasisLine({ basis, std, checking }: { basis: Basis; std: StandardRead; checking: boolean }) {
  const names = useBasisNames();
  let pill: React.ReactNode;
  let text: React.ReactNode;
  if (basis === 'adjusted') {
    pill = <Pill tone="gold">{names.adjusted}</Pill>;
    text = <>Two kinds, labelled apart and never combined: <b>adjusted EPS as the company reported it</b> each quarter, and measures <b>calculated here by a fixed formula</b> from the filed lines. Each sits beside the {names.filed} figure it starts from.</>;
  } else if (std.standard) {
    const tags = std.tags.slice(0, 3).join(', ');
    pill = (
      <Hint text={`Read off the ${std.fiscalYear ? `FY${std.fiscalYear} ` : ''}annual filing’s XBRL tags: ${std.tags.join(', ')}.`}>
        <span><Pill tone="good">{std.standard}</Pill></span>
      </Hint>
    );
    text = <>As filed. The standard is read off the filing’s own tags ({tags}…), not assumed from where the company is listed. EBITDA, free cash flow, net debt and tangible book value are not {names.filed} measures, and are under {names.adjusted}.</>;
  } else if (checking) {
    pill = <Pill tone="muted">Checking</Pill>;
    text = <>Reading the accounting standard off the latest annual filing.</>;
  } else {
    pill = <Pill tone="warn">Standard not confirmed</Pill>;
    text = <>The statements as the company filed them. No tagged annual filing was found, so whether they are US GAAP, IFRS or a local standard is not confirmed — {names.filed} here means as filed, and nothing more.</>;
  }
  return (
    <div className="mt-4 flex items-start gap-3 text-13 leading-normal text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
      <span className="flex-none pt-px">{pill}</span>
      <p className="min-w-0">{text}</p>
    </div>
  );
}

/** The basis card: the period, the source, and where these will not tie to the rest. */
function BasisCard({ a, basis, std }: { a: Analysis; basis: Basis; std: StandardRead }) {
  const names = useBasisNames();
  const nav = useNav();
  const f = a.facts;
  const income = statementRows(a, 'income');
  const span = income.length ? `${yearOf(income[0].date)}–${yearOf(income[income.length - 1].date)}` : 'n/a';
  const notes = basis === 'filed' ? [
    'The ratios, grades and headline figures elsewhere are trailing twelve months. These columns are fiscal years, so the two are different periods and will not reconcile.',
    'Every year-on-year line in the graded factors is therefore FY0 against FY−1, one reporting period behind the spec’s trailing-twelve comparison.',
    'The feed returns a subset of the lines a filing carries. Rows it never returns are dropped from these tables, so a shorter table is a narrower feed and not a simpler company.',
  ] : [
    `Adjusted EPS is the company’s own definition, and it changes between companies and sometimes between years. Two companies’ ${names.adjusted} figures are not on one basis because both are called adjusted.`,
    'A fiscal year of adjusted EPS is its four reported quarters summed, and only where all four were reported. It can differ from an annual figure by a cent, because each quarter divides by its own share count.',
    'The calculated measures use one formula for every company, written under each row. A company’s own EBITDA or free cash flow can differ from these where it adjusts them further.',
    `Consensus estimates are on the adjusted basis, so a forecast extends the adjusted series here and never the ${names.filed} one.`,
  ];
  return (
    <OCard span={12} id="fin-basis">
      <OHead title="About these figures" />
      {(['income', 'balance', 'cashflow'] as const).filter((feed) => a.ds.status(feed) !== 'ok').map((feed) => (
        <FeedGate key={feed} a={a} feed={feed} what={feed === 'income' ? 'The income statement' : feed === 'balance' ? 'The balance sheet' : 'The cash flow statement'} />
      ))}
      <StatLines>
        <StatLine label="Basis" value={basis === 'filed' ? (std.standard ?? `${names.filed}, as filed`) : names.adjusted}
          note={basis === 'filed' ? (std.standard ? 'from the filing’s tags' : 'standard not confirmed') : `beside its ${names.filed} starting point`} />
        <StatLine label="Period" value="Annual" note={basis === 'adjusted' ? 'adjusted EPS also by quarter' : 'not quarterly'} />
        <StatLine label="Fiscal years shown" value={span} note={`${income.length} filed`} />
        <StatLine label="Last filed year end" value={fmtDate(f.lastReported)} />
        <StatLine label="Reporting currency" value={f.currency || 'n/a'} />
      </StatLines>
      <OSub>Where these will not tie to the rest of the report</OSub>
      <ul className="grid gap-2">
        {notes.map((t) => (
          <li key={t} className="flex gap-3 text-13 leading-normal text-muted-foreground before:mt-2 before:size-1.5 before:flex-none before:rounded-full before:bg-border before:content-['']">{t}</li>
        ))}
      </ul>
      {nav.openAnalysis ? <OMore onClick={() => nav.openAnalysis?.('data-status')}>See which feeds loaded</OMore> : null}
    </OCard>
  );
}

/* Three statements, one at a time: nobody reads three statements at once;
   they open one. Each panel has the same rhythm, so the strip changes the
   subject rather than the layout — and the basis switch beside it changes
   the basis of whichever statement is open, without moving the reader. */
export function FinancialsTab({ a }: { a: Analysis }) {
  const [basis, setBasis] = React.useState<Basis>('filed');
  const asReported = useBasisFeed(a, 'incomeAsReported', a.facts.hasStatements);
  // The quarterly statements only matter to the adjusted EPS cards, so they
  // are fetched the first time a reader opens the non-GAAP side.
  const [wanted, setWanted] = React.useState(false);
  React.useEffect(() => { if (basis === 'adjusted') setWanted(true); }, [basis]);
  const incomeQ = useBasisFeed(a, 'incomeQ', wanted);

  const std = React.useMemo(() => accountingStandard(asReported.data), [asReported.data]);
  const names = std.standard === 'IFRS' ? IFRS_NAMES : GAAP_NAMES;

  if (!a.facts.hasStatements) {
    return (
      <div className="grid grid-cols-12 gap-6">
        <OCard span={12} id="fin-none">
          <OHead title="Financial statements" />
          {a.ds.status('income') !== 'ok' ? <FeedGate a={a} feed="income" what="Annual financial statements" />
            : <Notice>No annual financial statements were returned for this company.</Notice>}
        </OCard>
      </div>
    );
  }
  const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';
  const quarterly = { loading: incomeQ.loading, rows: incomeQ.data };
  return (
    <BasisContext.Provider value={names}>
      <Tabs defaultValue="income">
        {/* The strip keeps its own rule; the switch sits at its end, and
            drops under it rather than splitting it when the column is narrow. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <TabsList aria-label="Financial statement" className="shrink-0 grow">
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="balance">Balance sheet</TabsTrigger>
            <TabsTrigger value="cash">Cash flow</TabsTrigger>
          </TabsList>
          <ToggleGroup type="single" value={basis} aria-label="Accounting basis"
            onValueChange={(v) => { if (v) setBasis(v as Basis); }} className="flex-none">
            <ToggleGroupItem value="filed" className="px-3.5 text-13">{names.filed}</ToggleGroupItem>
            <ToggleGroupItem value="adjusted" className="px-3.5 text-13">{names.adjusted}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <BasisLine basis={basis} std={std} checking={asReported.loading} />
        <TabsContent value="income" className={grid}>
          {basis === 'filed' ? <IncomePanel a={a} /> : <IncomeNonGaap a={a} quarterly={quarterly} />}
        </TabsContent>
        <TabsContent value="balance" className={grid}>
          {basis === 'filed' ? <BalancePanel a={a} /> : <BalanceNonGaap a={a} />}
        </TabsContent>
        <TabsContent value="cash" className={grid}>
          {basis === 'filed' ? <CashPanel a={a} /> : <CashNonGaap a={a} />}
        </TabsContent>
      </Tabs>
      <div className={cn(grid, 'mt-6')}><BasisCard a={a} basis={basis} std={std} /></div>
    </BasisContext.Provider>
  );
}
