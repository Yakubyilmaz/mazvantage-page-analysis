'use client';

/* ==========================================================================
   Maz Vantage — the Financials tab

   The filed statements, as filed: income, balance sheet and cash flow, each
   as charts of the shape and a table of the lines. Nothing here is graded or
   compared to a sector — every other tab is an opinion about a number; this
   one is the number. The only arithmetic is subtraction between two filed
   lines, and each such row says it is derived.

   - **Annual only.** A column is a fiscal year and the newest can be eleven
     months old; the TTM figures the report runs on are not here on purpose.
   - **The feed is narrower than a filing.** A row with no figure in any year
     is dropped rather than printed as a row of n/a.
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, fmtDate, isNum, money, num, pct, signClass, trim, yearOf, yoy } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { ColumnChart, MultiLineChart, WaterfallChart } from '@/components/charts/charts';
import { FeedGate, Notice, OCard, OHead, OMore, PerfCagr, StatLine, StatLines, toneClass } from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { BeneishCard } from '@/components/report/beneish-card';
import { cn } from '@/lib/cn';

const DEFAULT_YEARS = 6;
const statementRows = (a: Analysis, which: string): any[] => a.facts.statements[which] || [];
const moneyIn = (a: Analysis) => (v: number | null | undefined) => money(v, { currency: curSymbol(a.facts.currency) });
const seriesOf = (rows: any[], get: (r: any) => unknown) => rows.map((r) => { const v = get(r); return isNum(v) ? v : null; });

/* Matched by fiscal year, not array position: the two feeds can return
   different numbers of years, and position would divide 2018's cash by
   2016's revenue and print it as a margin. */
const incomeByYear = (a: Analysis) => new Map(statementRows(a, 'income').map((r) => [yearOf(r.date), r]));

/** Perf / CAGR over the filed history alone, never over a forecast tail. */
function RunBadges({ rows, get, invert }: { rows: any[]; get: (r: any) => unknown; invert?: boolean }) {
  const vals = rows.map(get).map((v) => (isNum(v) ? v : null));
  const from = vals.findIndex(isNum);
  if (from < 0) return null;
  const to = vals.length - 1 - [...vals].reverse().findIndex(isNum);
  if (to <= from) return null;
  return <PerfCagr first={vals[from]} last={vals[to]} years={to - from} invert={invert} />;
}

/** The consensus years strictly after the last filed one — never drawn twice. */
function forecastTail(a: Analysis, lastFiledYear: number | null, get: (r: any) => unknown) {
  return (a.forecast?.rows || [])
    .filter((r: any) => isNum(r.year) && isNum(lastFiledYear) && r.year > lastFiledYear && isNum(get(r)))
    .sort((x: any, y: any) => x.year - y.year)
    .map((r: any) => ({ year: r.year as number, value: get(r) as number }));
}

interface RowDef { label: string; get: (r: any) => unknown; strong?: boolean; derived?: boolean; group?: string; fmt?: (v: number, a: Analysis) => string }

const INCOME_ROWS: RowDef[] = [
  { label: 'Revenue', get: (r) => r.revenue, strong: true },
  { label: 'Cost of revenue', get: (r) => r.costOfRevenue },
  { label: 'Gross profit', get: (r) => r.grossProfit, strong: true },
  { label: 'Research & development', get: (r) => r.researchAndDevelopmentExpenses },
  { label: 'Selling, general & admin', get: (r) => r.sellingGeneralAndAdministrativeExpenses },
  { label: 'Operating income', get: (r) => r.operatingIncome, strong: true },
  { label: 'EBITDA', get: (r) => r.ebitda },
  { label: 'Interest expense', get: (r) => r.interestExpense },
  { label: 'Net income', get: (r) => r.netIncome, strong: true },
  { label: 'Earnings per share (diluted)', get: (r) => r.epsDiluted ?? r.eps, fmt: (v, a) => `${curSymbol(a.facts.currency)}${dec(v, 2)}` },
  { label: 'Diluted shares', get: (r) => r.weightedAverageShsOutDil, fmt: (v) => num(v, 2) },
  { label: 'Gross margin', derived: true, group: 'Margins', fmt: (v) => pct(v), get: (r) => (r.revenue > 0 && isNum(r.grossProfit) ? r.grossProfit / r.revenue : null) },
  { label: 'Operating margin', derived: true, fmt: (v) => pct(v), get: (r) => (r.revenue > 0 && isNum(r.operatingIncome) ? r.operatingIncome / r.revenue : null) },
  { label: 'Net margin', derived: true, fmt: (v) => pct(v), get: (r) => (r.revenue > 0 && isNum(r.netIncome) ? r.netIncome / r.revenue : null) },
];

const CASHFLOW_ROWS: RowDef[] = [
  { label: 'Net income', get: (r) => r.netIncome },
  { label: 'Operating cash flow', get: (r) => r.operatingCashFlow, strong: true },
  { label: 'Capital expenditure', get: (r) => r.capitalExpenditure },
  { label: 'Free cash flow', get: (r) => r.freeCashFlow, strong: true },
  { label: 'Dividends paid', get: (r) => r.commonDividendsPaid ?? r.netDividendsPaid },
  { label: 'Stock issued', get: (r) => r.commonStockIssuance },
  { label: 'Share repurchases', get: (r) => r.commonStockRepurchased },
  // Only meaningful when the company made a profit — dividing cash flow by a
  // loss returns a number, and it means nothing.
  { label: 'Cash conversion', derived: true, group: 'Quality', fmt: (v) => pct(v),
    get: (r) => (isNum(r.operatingCashFlow) && isNum(r.netIncome) && r.netIncome > 0 ? r.operatingCashFlow / r.netIncome : null) },
];

const BALANCE_ROWS: RowDef[] = [
  { label: 'Cash & short-term investments', get: (r) => r.cashAndShortTermInvestments },
  { label: 'Total current assets', get: (r) => r.totalCurrentAssets },
  { label: 'Total assets', get: (r) => r.totalAssets, strong: true },
  { label: 'Total current liabilities', get: (r) => r.totalCurrentLiabilities },
  { label: 'Total liabilities', get: (r) => r.totalLiabilities, strong: true },
  { label: 'Total debt', get: (r) => r.totalDebt },
  { label: 'Net debt', get: (r) => r.netDebt },
  { label: 'Shareholders’ equity', get: (r) => r.totalStockholdersEquity, strong: true },
  { label: 'Working capital', derived: true, group: 'Derived',
    get: (r) => (isNum(r.totalCurrentAssets) && isNum(r.totalCurrentLiabilities) ? r.totalCurrentAssets - r.totalCurrentLiabilities : null) },
  { label: 'Debt / equity', derived: true, fmt: (v) => `${dec(v, 2)}x`,
    get: (r) => (r.totalStockholdersEquity > 0 && isNum(r.totalDebt) ? r.totalDebt / r.totalStockholdersEquity : null) },
];

/* ---------- the statement table --------------------------------------------
   Most recent first — the column almost every reader wants sits where the eye
   lands. A named group opens a labelled band, so nothing computed here is
   mistaken for something filed. */

function StatementCard({ a, which, title, defs, info }: { a: Analysis; which: string; title: string; defs: RowDef[]; info: string }) {
  const rows = [...statementRows(a, which)].reverse();
  const fmtMoney = moneyIn(a);
  const [showAll, setShowAll] = React.useState(rows.length <= DEFAULT_YEARS);
  const live = defs.map((d) => ({ ...d, values: seriesOf(rows, d.get) })).filter((d) => d.values.some(isNum));

  if (!rows.length || !live.length) {
    const feed = which === 'cash' ? 'cashflow' : which;
    return (
      <OCard span={12} id={`fin-stmt-${which}`}>
        <OHead title={title} />
        {a.ds.status(feed) !== 'ok' ? <FeedGate a={a} feed={feed} what={`The ${title.toLowerCase()}`} />
          : <Notice>No {title.toLowerCase()} lines were returned for this company.</Notice>}
      </OCard>
    );
  }
  const n = showAll ? rows.length : DEFAULT_YEARS;
  const shown = rows.slice(0, n);
  let group: string | null = null;

  return (
    <OCard span={12} id={`fin-stmt-${which}`}>
      <OHead title={title} info={info} aside={rows.length > DEFAULT_YEARS ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-13 font-semibold text-primary hover:underline">
          {showAll ? `Show last ${DEFAULT_YEARS} years` : `Show all ${rows.length} years`}
        </button>
      ) : null} />
      <div className="overflow-x-auto scroll-thin">
        <table className="text-13">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
              <th className="sticky left-0 border-b border-border bg-background px-3 py-2 text-left font-semibold">Line item</th>
              {shown.map((r) => <th key={r.date} className="border-b border-border px-3 py-2 text-right font-semibold">{yearOf(r.date) ?? '—'}</th>)}
            </tr>
          </thead>
          <tbody>
            {live.flatMap((d) => {
              const out: React.ReactNode[] = [];
              if (d.group && d.group !== group) {
                group = d.group;
                out.push(
                  <tr key={`g-${d.group}`}>
                    <td colSpan={shown.length + 1} className="border-b border-border bg-muted px-3 py-1.5 text-micro font-semibold uppercase tracking-[.05em] text-muted-foreground">
                      {d.group} · calculated from the lines above
                    </td>
                  </tr>,
                );
              }
              const fmt = d.fmt || ((v: number) => fmtMoney(v));
              out.push(
                <tr key={d.label} className={cn('hover:bg-accent/60', d.strong && 'font-semibold')}>
                  <td className="sticky left-0 whitespace-nowrap border-b border-border bg-background px-3 py-2">{d.label}</td>
                  {d.values.slice(0, shown.length).map((v, i) => {
                    const change = i + 1 < shown.length ? yoy(v, d.values[i + 1]) : null;
                    return (
                      <td key={i} title={isNum(change) ? `${pct(change, { sign: true })} on ${yearOf(shown[i + 1].date)}` : undefined}
                        className={cn('whitespace-nowrap border-b border-border px-3 py-2 text-right tnum', !d.derived && toneClass(signClass(v)))}>
                        {isNum(v) ? fmt(v, a) : '—'}
                      </td>
                    );
                  })}
                </tr>,
              );
              return out;
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-tiny text-muted-foreground/80">
        Fiscal years ending {fmtDate(rows[rows.length - 1].date)} to {fmtDate(rows[0].date)}. Figures in {a.facts.currency || 'the reporting currency'}, as
        reported — lines this data plan does not return are left out rather than shown empty.
      </p>
    </OCard>
  );
}

/* ---------- income -------------------------------------------------------- */

function IncomePanel({ a }: { a: Analysis }) {
  const rows = statementRows(a, 'income');
  const fmt = moneyIn(a);
  const cur = curSymbol(a.facts.currency);
  const last = rows[rows.length - 1] || {};
  const prev = rows[rows.length - 2];
  const lastYear = yearOf(last.date);

  // Revenue and earnings: grouped, not stacked — net income is not a part of
  // revenue; the gap between the two bars is what is worth looking at.
  const revTail = forecastTail(a, lastYear, (r) => r.revenue);
  const niTail = forecastTail(a, lastYear, (r) => r.netIncome);
  const tailYears = [...new Set([...revTail, ...niTail].map((t) => t.year))].sort((x, y) => x - y);
  const at = (tail: { year: number; value: number }[], year: number) => tail.find((t) => t.year === year)?.value ?? null;
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
      <OCard span={8} id="fin-revenue">
        <OHead title="Revenue and earnings" info="Filed fiscal years, oldest on the left, and then the consensus years — drawn hatched, because a forecast is not a filing. The Perf and CAGR figures under the chart are measured over the filed years alone." />
        <ColumnChart height={280} valueFmt={fmt} forecastFrom={tailYears.length ? rows.length : null}
          categories={[...rows.map((r) => String(yearOf(r.date))), ...tailYears.map(String)]} series={[
            { name: 'Revenue', color: 'var(--chart-1)', values: [...seriesOf(rows, (r) => r.revenue), ...tailYears.map((y) => at(revTail, y))] },
            { name: 'Net income', color: 'var(--up)', values: [...seriesOf(rows, (r) => r.netIncome), ...tailYears.map((y) => at(niTail, y))] },
          ]} />
        <RunBadges rows={rows} get={(r) => r.revenue} />
        <StatLines split>
          <StatLine label={`Revenue, fiscal ${lastYear ?? 'n/a'}`} value={fmt(last.revenue)} note={isNum(revChange) ? `${pct(revChange, { sign: true })} YoY` : ''} tone={signClass(revChange)} />
          <StatLine label={`Net income, fiscal ${lastYear ?? 'n/a'}`} value={fmt(last.netIncome)} note={isNum(niChange) ? `${pct(niChange, { sign: true })} YoY` : ''} tone={signClass(niChange)} />
          {tailYears.length ? <StatLine label="Consensus to" value={String(tailYears[tailYears.length - 1])} note={`${tailYears.length} forecast year${tailYears.length === 1 ? '' : 's'}`} /> : null}
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-income-year">
        <OHead title={`Fiscal ${lastYear ?? 'year'}`} info="The last filed year of the statement beside it, top to bottom. Annual and as filed, so these are the figures in the final column of the table below rather than the trailing twelve months the report grades on." />
        <StatLines>
          <StatLine label="Revenue" value={fmt(last.revenue)} note={delta((r) => r.revenue)} />
          <StatLine label="Gross profit" value={fmt(last.grossProfit)} note={delta((r) => r.grossProfit)} />
          <StatLine label="Operating income" value={fmt(last.operatingIncome)} note={delta((r) => r.operatingIncome)} />
          <StatLine label="Net income" value={fmt(last.netIncome)} note={delta((r) => r.netIncome)} />
          <StatLine label="Earnings per share" value={isNum(epsOf(last)) ? `${cur}${dec(epsOf(last), 2)}` : 'n/a'} note="diluted" />
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

      <OCard span={4} id="fin-growth">
        <OHead title="Growth" info="Filed year against the year before it. The multi-year figures are annualised, so a 5-year rate is the constant rate that would have got from the first year to the last rather than the sum of five annual steps." />
        <StatLines>
          {gLine('Revenue', g.revenueYoy, onPrior)}
          {gLine('Revenue, 3-year', g.revenue3y, 'annualised')}
          {gLine('Revenue, 5-year', g.revenue5y, 'annualised')}
          {gLine('EBITDA', g.ebitda, onPrior)}
          {gLine('Operating income', g.ebit, onPrior)}
          {gLine('Net income', g.netIncome, onPrior)}
          {gLine('Earnings per share', g.epsDiluted ?? g.eps, onPrior)}
          {gLine('Research & development', g.rdExpense, onPrior)}
        </StatLines>
      </OCard>

      <OCard span={8} id="fin-eps">
        <OHead title="Earnings per share" info="Diluted, as filed. This is the same figure as the earnings-per-share row of the table below, drawn so a run of years reads as a shape." />
        <ColumnChart height={250} legend={false} valueFmt={(v) => `${cur}${dec(v, 2)}`} categories={rows.map((r) => String(yearOf(r.date) ?? '—'))}
          series={[{ name: 'Diluted EPS', color: 'var(--chart-5)', values: seriesOf(rows, epsOf) }]} />
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

      <StatementCard a={a} which="income" title="Income statement" defs={INCOME_ROWS}
        info="Annual, as filed. The report’s ratios run on trailing twelve months and will not tie to these columns." />
    </>
  );
}

/* ---------- balance sheet ---------------------------------------------------- */

function BalancePanel({ a }: { a: Analysis }) {
  const f = a.facts;
  const rows = statementRows(a, 'balance');
  const fmt = moneyIn(a);
  const cur = curSymbol(f.currency);
  const last = rows[rows.length - 1] || {};
  const prev = rows[rows.length - 2];
  const line = (name: string, color: string, get: (r: any) => unknown) => ({ name, color, points: rows.map((r) => ({ date: r.date, value: get(r) as number })) });
  const netCash = isNum(last.netDebt) && last.netDebt < 0;
  const wc = isNum(last.totalCurrentAssets) && isNum(last.totalCurrentLiabilities) ? last.totalCurrentAssets - last.totalCurrentLiabilities : null;
  const ratio = last.totalCurrentLiabilities > 0 && isNum(last.totalCurrentAssets) ? last.totalCurrentAssets / last.totalCurrentLiabilities : null;
  const eqGrowth = yoy(last.totalStockholdersEquity, prev?.totalStockholdersEquity);
  const ofAssets = last.totalAssets > 0 && isNum(last.totalStockholdersEquity) ? last.totalStockholdersEquity / last.totalAssets : null;
  const perShare = (v: unknown) => (isNum(v) ? `${cur}${dec(v, 2)}` : 'n/a');
  const x = (v: unknown) => (isNum(v) ? `${dec(v, 2)}x` : 'n/a');

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
        <OHead title="Position today" info="Trailing twelve months, not the last filed year — the same basis the rest of the report grades on, and more recent than the final column of the tables." />
        <StatLines>
          <StatLine label="Cash & equivalents" value={fmt(f.cash)} />
          <StatLine label="Total debt" value={fmt(f.totalDebt)} />
          <StatLine label="Net debt" value={fmt(f.netDebt)} tone={isNum(f.netDebt) && f.netDebt < 0 ? 'pos' : ''} note={isNum(f.netDebt) && f.netDebt < 0 ? 'net cash' : ''} />
          <StatLine label="Working capital" value={fmt(f.workingCapital)} />
          <StatLine label="Shareholders’ equity" value={fmt(f.equity)} />
          {/* `dec`, not `trim`: a current ratio of 1.0033 printed as "1x" reads as
              a round number the company hit rather than the coin-flip it is. */}
          <StatLine label="Current ratio" value={x(f.currentRatio)} />
          <StatLine label="Debt / equity" value={x(f.debtToEquity)} />
          <StatLine label="Book value / share" value={perShare(f.bookValuePerShare)} />
        </StatLines>
      </OCard>

      <OCard span={8} id="fin-cash-debt">
        <OHead title="Cash against debt" info="Both as filed at each year end, so neither is the position today — the trailing-twelve figures under “Position today” are more recent than the last pair of bars here." />
        <ColumnChart height={280} valueFmt={fmt} categories={rows.map((r) => String(yearOf(r.date) ?? '—'))} series={[
          { name: 'Cash & short-term investments', color: 'var(--up)', values: seriesOf(rows, (r) => r.cashAndShortTermInvestments) },
          { name: 'Total debt', color: 'var(--chart-6)', values: seriesOf(rows, (r) => r.totalDebt) },
        ]} />
        <StatLines split>
          <StatLine label={`Net debt, fiscal ${yearOf(last.date) ?? 'year'}`} value={fmt(last.netDebt)} tone={netCash ? 'pos' : ''} note={netCash ? 'net cash' : 'debt over cash'} />
          <StatLine label="Net debt / EBITDA" value={x(f.netDebtToEbitda)} note="TTM"
            title="Roughly how many years of earnings before interest, tax and depreciation the net debt represents. Negative where the company holds more cash than debt." />
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
          <StatLine label="Interest coverage" value={x(f.interestCover)} note="TTM"
            title="Operating profit over the interest bill. Not shown where the company reports no interest expense, which is not the same as covering it infinitely." />
          <StatLine label="Debt / assets" value={x(f.debtToAssets)} note="TTM" />
          <StatLine label="Debt / capital" value={x(f.debtToCapital)} note="TTM" />
          <StatLine label="Quick ratio" value={x(f.quickRatio)} note="TTM" title="The current ratio with inventory taken out — what could be paid without selling stock first." />
          <StatLine label="Cash ratio" value={x(f.cashRatio)} note="TTM" />
          <StatLine label="Financial leverage" value={x(f.financialLeverage)} note="TTM" title="Total assets over equity: how many units of balance sheet each unit of shareholders’ money is carrying." />
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
          <StatLine label="Current ratio, that year" value={x(ratio)} note="filed, not TTM" />
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-equity">
        <OHead title="Equity and book value" info="A low or negative equity is normal for a company that has returned more to shareholders than it has retained, and is not on its own a solvency problem — the card beside this one is where solvency is answered." />
        <StatLines>
          <StatLine label={`Equity, fiscal ${yearOf(last.date) ?? 'year'}`} value={fmt(last.totalStockholdersEquity)} />
          <StatLine label="Change on the year" value={isNum(eqGrowth) ? pct(eqGrowth, { sign: true }) : 'n/a'} tone={signClass(eqGrowth)} />
          <StatLine label="Equity / assets" value={pct(ofAssets)} note="filed" title="The share of the balance sheet the shareholders own outright. The rest is funded by somebody else." />
          <StatLine label="Book value / share" value={perShare(f.bookValuePerShare)} note="TTM" />
          <StatLine label="Tangible book value / share" value={perShare(f.tangibleBookValuePerShare)} note="TTM"
            title="Book value with goodwill and other intangibles removed — what would be left if the acquisitions were written off." />
          <StatLine label="Price / book" value={x(f.pb)} note="TTM" />
          <StatLine label="Return on equity" value={pct(f.roe)} note="TTM" />
        </StatLines>
      </OCard>

      <BeneishCard a={a} />

      <StatementCard a={a} which="balance" title="Balance sheet" defs={BALANCE_ROWS}
        info="Position at each fiscal year end, as filed. The headline figures elsewhere in the report are trailing twelve months and will be more recent than the last column here." />
    </>
  );
}

/* ---------- cash flow ----------------------------------------------------------- */

function CashPanel({ a }: { a: Analysis }) {
  const f = a.facts;
  const rows = statementRows(a, 'cash');
  const fmt = moneyIn(a);
  const last = rows[rows.length - 1] || {};
  const year = yearOf(last.date);
  const abs = (v: unknown) => (isNum(v) ? Math.abs(v) : null);
  const conversion = isNum(last.operatingCashFlow) && isNum(last.netIncome) && last.netIncome > 0 ? last.operatingCashFlow / last.netIncome : null;

  // Returned to shareholders: filed minus signs off, read against free cash flow.
  const divOf = (r: any) => abs(r.commonDividendsPaid ?? r.netDividendsPaid);
  const bbOf = (r: any) => abs(r.commonStockRepurchased);
  const capexOf = (r: any) => abs(r.capitalExpenditure);
  const total = (get: (r: any) => number | null) => { const xs = rows.map(get).filter(isNum); return xs.length ? xs.reduce((p, q) => p + q, 0) : null; };
  const lastDiv = divOf(last);
  const lastBb = bbOf(last);
  const lastTotal = (lastDiv ?? 0) + (lastBb ?? 0);
  const share = (returned: number, fcf: unknown) => (isNum(fcf) && fcf > 0 && returned > 0 ? returned / fcf : null);
  const lifeTotal = (total(divOf) ?? 0) + (total(bbOf) ?? 0);
  const lifeShare = share(lifeTotal, total((r) => (isNum(r.freeCashFlow) ? r.freeCashFlow : null)));
  const lastShare = share(lastTotal, last.freeCashFlow);
  const span = rows.length ? `${yearOf(rows[0].date)}–${yearOf(rows[rows.length - 1].date)}` : 'the filed years';
  const coverTone = (v: unknown) => (isNum(v) && v > 1 ? 'neg' : '');
  const coverTitle = 'Over 100% means the payouts cost more than the free cash flow of the same period, so the difference came from cash on hand or from borrowing.';

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
        <OHead title="Cash generation" info="Operating cash flow less capital expenditure is free cash flow. Capital expenditure is shown as the statement files it — negative, because it is money going out." />
        <ColumnChart height={280} valueFmt={fmt} categories={rows.map((r) => String(yearOf(r.date)))} series={[
          { name: 'Operating cash flow', color: 'var(--chart-1)', values: seriesOf(rows, (r) => r.operatingCashFlow) },
          { name: 'Capital expenditure', color: 'var(--chart-6)', values: seriesOf(rows, (r) => r.capitalExpenditure) },
          { name: 'Free cash flow', color: 'var(--up)', values: seriesOf(rows, (r) => r.freeCashFlow) },
        ]} />
        <RunBadges rows={rows} get={(r) => r.freeCashFlow} />
        <StatLines split>
          <StatLine label={`Free cash flow, fiscal ${year ?? 'n/a'}`} value={fmt(last.freeCashFlow)} />
          <StatLine label="Cash conversion" value={isNum(conversion) ? pct(conversion) : 'n/a'} note="operating cash / net income"
            title="Above 100% means the business collected more cash than it booked as profit. Not shown in a loss-making year, where the ratio has no meaning." />
        </StatLines>
      </OCard>

      <OCard span={4} id="fin-returns">
        <OHead title="Returned to shareholders" info="Dividends and buybacks with their filed minus signs removed, so they can be read against the free cash flow that funded them." />
        <StatLines>
          <StatLine label="Dividends paid" value={fmt(lastDiv)} note={`fiscal ${year ?? 'n/a'}`} />
          <StatLine label="Share repurchases" value={fmt(lastBb)} note={`fiscal ${year ?? 'n/a'}`} />
          <StatLine label="Total returned" value={lastTotal > 0 ? fmt(lastTotal) : 'nil'} />
          <StatLine label="Share of free cash flow" value={isNum(lastShare) ? pct(lastShare) : 'n/a'} tone={coverTone(lastShare)} title={coverTitle} />
        </StatLines>
        <StatLines split>
          <StatLine label="Returned in total" value={lifeTotal > 0 ? fmt(lifeTotal) : 'nil'} note={span} />
          <StatLine label="Share of free cash flow" value={isNum(lifeShare) ? pct(lifeShare) : 'n/a'} note={span} tone={coverTone(lifeShare)} title={coverTitle} />
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
          <StatLine label="Free cash flow margin" value={pct(ofRevenue(last.freeCashFlow))} note={basis} />
          <StatLine label="Cash conversion" value={pct(conversion)} note="operating cash / net income"
            title="Above 100% means the business collected more cash than it booked as profit. Not shown in a loss-making year, where the ratio has no meaning." />
          <StatLine label="Free cash flow / operating cash flow" value={pct(f.fcfToOcf)} note="TTM" />
          <StatLine label="Capital expenditure / revenue" value={pct(ofRevenue(abs(last.capitalExpenditure)))} note={basis} />
          <StatLine label="Capital expenditure / operating cash flow" value={pct(capexOfOcf)} note={basis} />
          <StatLine label="Income quality" value={isNum(f.incomeQuality) ? `${dec(f.incomeQuality, 2)}x` : 'n/a'} note="TTM"
            title="Operating cash flow over net income. Below 1 for long means profit is being booked faster than it is collected." />
          <StatLine label="Stock compensation / revenue" value={pct(f.sbcToRevenue)} note="TTM"
            title="A non-cash charge added back inside operating cash flow, so it flatters every ratio on this card." />
        </StatLines>
      </OCard>

      <OCard span={12} id="fin-cash-margins">
        <OHead title="Cash margins" info="Each year’s cash flow over the same year’s revenue. The margins graded under Profitability are trailing twelve months and computed from the published ratios, so they will not land exactly on the last point of these lines." />
        {charted.length >= 2 ? (
          <MultiLineChart height={280} valueFmt={(v) => pct(v, { dp: 0 })} series={[
            mline('Operating cash flow', 'var(--chart-1)', (r) => r.operatingCashFlow),
            mline('Free cash flow', 'var(--up)', (r) => r.freeCashFlow),
            mline('Capital expenditure', 'var(--chart-6)', (r) => (isNum(r.capitalExpenditure) ? Math.abs(r.capitalExpenditure) : null)),
          ]} />
        ) : <Notice>At least two fiscal years present on both the cash flow statement and the income statement are needed to chart a cash margin.</Notice>}
      </OCard>

      <StatementCard a={a} which="cash" title="Cash flow statement" defs={CASHFLOW_ROWS}
        info="As filed, which means money leaving the company is negative — capital expenditure, dividends and buybacks all print with a minus." />
    </>
  );
}

/** The basis card: the period, the source, and where these will not tie to the rest. */
function BasisCard({ a }: { a: Analysis }) {
  const nav = useNav();
  const f = a.facts;
  const income = statementRows(a, 'income');
  const span = income.length ? `${yearOf(income[0].date)}–${yearOf(income[income.length - 1].date)}` : 'n/a';
  return (
    <OCard span={12} id="fin-basis">
      <OHead title="About these figures" />
      {(['income', 'balance', 'cashflow'] as const).filter((feed) => a.ds.status(feed) !== 'ok').map((feed) => (
        <FeedGate key={feed} a={a} feed={feed} what={feed === 'income' ? 'The income statement' : feed === 'balance' ? 'The balance sheet' : 'The cash flow statement'} />
      ))}
      <StatLines>
        <StatLine label="Period" value="Annual" note="not quarterly" />
        <StatLine label="Fiscal years shown" value={span} note={`${income.length} filed`} />
        <StatLine label="Last filed year end" value={fmtDate(f.lastReported)} />
        <StatLine label="Reporting currency" value={f.currency || 'n/a'} />
      </StatLines>
      <OSub>Where these will not tie to the rest of the report</OSub>
      <ul className="grid gap-2">
        {[
          'The ratios, grades and headline figures elsewhere are trailing twelve months. These columns are fiscal years, so the two are different periods and will not reconcile.',
          'Every year-on-year line in the graded factors is therefore FY0 against FY−1, one reporting period behind the spec’s trailing-twelve comparison.',
          'The feed returns a subset of the lines a filing carries. Rows it never returns are dropped from these tables, so a shorter table is a narrower feed and not a simpler company.',
        ].map((t) => (
          <li key={t} className="flex gap-3 text-13 leading-normal text-muted-foreground before:mt-2 before:size-1.5 before:flex-none before:rounded-full before:bg-border before:content-['']">{t}</li>
        ))}
      </ul>
      {nav.openAnalysis ? <OMore onClick={() => nav.openAnalysis?.('data-status')}>See which feeds loaded</OMore> : null}
    </OCard>
  );
}

/* Three statements, one at a time: nobody reads three statements at once;
   they open one. Each panel has the same rhythm, so the strip changes the
   subject rather than the layout. */
export function FinancialsTab({ a }: { a: Analysis }) {
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
  return (
    <div>
      <Tabs defaultValue="income">
        <TabsList aria-label="Financial statement">
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="balance">Balance sheet</TabsTrigger>
          <TabsTrigger value="cash">Cash flow</TabsTrigger>
        </TabsList>
        <TabsContent value="income" className={grid}><IncomePanel a={a} /></TabsContent>
        <TabsContent value="balance" className={grid}><BalancePanel a={a} /></TabsContent>
        <TabsContent value="cash" className={grid}><CashPanel a={a} /></TabsContent>
      </Tabs>
      <div className={cn(grid, 'mt-6')}><BasisCard a={a} /></div>
    </div>
  );
}
