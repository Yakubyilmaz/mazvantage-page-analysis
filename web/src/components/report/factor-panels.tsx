'use client';

/* ==========================================================================
   Panels and charts hung off particular factor groups.

   GROUP_PANELS are subtopics rendered as a panel instead of a ratio table.
   Every one of them sits in a group with `metrics: []`, so nothing here
   enters a factor score — a Sankey is a description of a statement, and a
   hurdle rate a reader can move in Settings must not move their grade.

   EXTRAS are the charts under a subtopic's table, keyed `factor.group`.
   Everything here is optional: a missing feed returns null and the subtopic
   renders as its table alone.
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, isNum, money, mult, pct, price as priceFmt, signClass, yearOf } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { ColumnChart, ForecastChart, MultiLineChart } from '@/components/charts/charts';
import { RangeChart, SankeyChart } from '@/components/charts/diagrams';
import { CheckRow, FeedGate, KeyInfo, Notice, StatLine, StatLines } from '@/components/report/ui';
import { TickIcon } from '@/components/shell/icons';

const Small = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-2 text-tiny leading-relaxed text-muted-foreground/80">{children}</p>
);

/* ==========================================================================
   The analyst price forecast — two hurdles, deliberately different in kind.

   The sector one asks whether analysts like this name more than the average
   one — the only way to read a target without being fooled by the optimism
   that sits in all of them. The cost-of-equity one asks whether the forecast
   pays for the risk at all, and does not move with the sector.
   ========================================================================== */

export function AnalystForecastPanel({ a }: { a: Analysis }) {
  const pt = a.ds.get('priceTarget');
  const cur = curSymbol(a.facts.currency);
  const p = a.facts.price;

  if (!pt || !isNum(pt.targetConsensus)) {
    return a.ds.status('priceTarget') !== 'ok'
      ? <FeedGate a={a} feed="priceTarget" what="Analyst price targets" />
      : <Notice>No consensus price target is available for this company.</Notice>;
  }

  const upside = a.momentum.targetUpside;
  const total = a.momentum.expectedTotalReturn;
  const sectorMedian = a.lookup?.medianFor('targetUpside') ?? null;
  const coe = a.momentum.costOfEquity;

  const sectorState = !isNum(upside) || !isNum(sectorMedian) ? 'na' : upside > sectorMedian ? 'pass' : 'fail';
  const coeState = !isNum(total) || !isNum(coe) ? 'na' : total > coe ? 'pass' : 'fail';
  const gap = isNum(total) && isNum(coe) ? total - coe : null;

  const checks = [
    {
      state: sectorState,
      label: 'Forecast return vs the sector',
      why: sectorState === 'na'
        ? 'No sector distribution of price targets is loaded to compare against.'
        : `The consensus target of ${priceFmt(pt.targetConsensus, cur)} implies ${pct(upside, { sign: true })} from `
          + `${priceFmt(p, cur)}. The median ${a.facts.sector || 'listed'} company's target implies `
          + `${pct(sectorMedian, { sign: true })}, so the street is ${sectorState === 'pass' ? 'keener' : 'cooler'} on `
          + `${a.facts.symbol} than on a typical peer. Targets run optimistic across the board, which is why this is `
          + 'measured against the sector rather than against zero.',
    },
    {
      state: coeState,
      label: 'Forecast return vs cost of equity',
      why: coeState === 'na'
        ? 'A cost of equity needs a beta, a risk-free rate and an equity risk premium.'
        : `At a beta of ${dec(a.facts.beta, 2)}, holding ${a.facts.symbol} should earn ${pct(coe)} a year — `
          + `${pct(a.bm.riskFreeRate)} risk-free plus ${dec(a.facts.beta, 2)} times a ${pct(a.bm.equityRiskPremium)} `
          + `equity risk premium. Target plus dividend implies ${pct(total, { sign: true })}, `
          + `${coeState === 'pass' ? 'clearing that' : 'falling short'} by ${pct(Math.abs(gap ?? 0))}.`,
    },
  ];

  const spread = isNum(pt.targetHigh) && isNum(pt.targetLow) && pt.targetConsensus > 0
    ? (pt.targetHigh - pt.targetLow) / pt.targetConsensus : null;

  return (
    <div>
      {checks.map((c) => (
        <div key={c.label} className="[&+&]:mt-4">
          <div className="flex items-center gap-2 font-semibold">
            <TickIcon kind={c.state} className={c.state === 'pass' ? 'size-3.5 text-up' : c.state === 'fail' ? 'size-3.5 text-down' : 'size-3.5 text-muted-foreground/60'}
              title={c.state === 'pass' ? 'Clears this hurdle' : c.state === 'fail' ? 'Falls short of this hurdle' : 'Not enough data to judge'} />
            <span>{c.label}</span>
          </div>
          <p className="mt-1 max-w-[78ch] text-tiny leading-relaxed text-muted-foreground">{c.why}</p>
        </div>
      ))}
      <div className="mb-2 mt-3">
        <RangeChart low={pt.targetLow} avg={pt.targetConsensus} high={pt.targetHigh} current={p} currency={cur} />
      </div>
      <KeyInfo items={[
        ['Low target', isNum(pt.targetLow) ? priceFmt(pt.targetLow, cur) : 'n/a'],
        ['Consensus', priceFmt(pt.targetConsensus, cur)],
        ['High target', isNum(pt.targetHigh) ? priceFmt(pt.targetHigh, cur) : 'n/a'],
        ['Implied upside', isNum(upside) ? pct(upside, { sign: true }) : 'n/a'],
        ['Sector median upside', isNum(sectorMedian) ? pct(sectorMedian, { sign: true }) : 'n/a'],
        ['Cost of equity', isNum(coe) ? pct(coe) : 'n/a'],
      ]} />
      {isNum(spread) ? (
        <p className="mt-4 text-tiny text-muted-foreground/80">
          Low to high spans {pct(spread)} of the consensus — the wider that is, the less agreement there is behind the single number.
        </p>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   Statement flows — both drawn from the latest annual statement rather than
   the TTM figures the ratios use, because a Sankey has to balance and only a
   single filed statement is internally consistent.
   ========================================================================== */

const pos = (v: unknown) => (isNum(v) && v > 0 ? v : null);

/** The income statement, revenue down to what is left. */
export function RevenueFlowPanel({ a }: { a: Analysis }) {
  const inc = a.facts.statements.income.at(-1);
  if (!inc || !isNum(inc.revenue) || inc.revenue <= 0) return <Notice>No annual income statement is available to chart.</Notice>;

  const gross = isNum(inc.grossProfit) ? inc.grossProfit : (isNum(inc.costOfRevenue) ? inc.revenue - inc.costOfRevenue : null);
  const cost = isNum(inc.costOfRevenue) ? inc.costOfRevenue : (isNum(gross) ? inc.revenue - gross : null);
  const op = inc.operatingIncome;
  const rd = inc.researchAndDevelopmentExpenses;
  const sga = inc.sellingGeneralAndAdministrativeExpenses;
  const net = inc.netIncome;
  // Whatever the named operating lines do not account for, shown as its own
  // flow rather than silently distributed over the others.
  const otherOp = isNum(gross) && isNum(op) ? gross - op - (isNum(rd) ? rd : 0) - (isNum(sga) ? sga : 0) : null;
  const belowOp = isNum(op) && isNum(net) ? op - net : null;

  const nodes = [
    { id: 'rev', label: 'Revenue', layer: 0, color: 'var(--primary)' },
    { id: 'cogs', label: 'Cost of revenue', layer: 1, color: 'var(--chart-6)' },
    { id: 'gross', label: 'Gross profit', layer: 1, color: 'var(--chart-2)' },
    { id: 'rd', label: 'Research & development', layer: 2, color: 'var(--chart-5)' },
    { id: 'sga', label: 'Selling, general & admin', layer: 2, color: 'var(--chart-3)' },
    { id: 'otherop', label: 'Other operating', layer: 2, color: 'var(--chart-4)' },
    { id: 'op', label: 'Operating income', layer: 2, color: 'var(--chart-2)' },
    { id: 'below', label: 'Tax, interest & other', layer: 3, color: 'var(--chart-6)' },
    { id: 'net', label: 'Net income', layer: 3, color: 'var(--up)' },
  ];
  const links = [
    { from: 'rev', to: 'cogs', value: pos(cost) },
    { from: 'rev', to: 'gross', value: pos(gross) },
    { from: 'gross', to: 'rd', value: pos(rd) },
    { from: 'gross', to: 'sga', value: pos(sga) },
    { from: 'gross', to: 'otherop', value: pos(otherOp) },
    { from: 'gross', to: 'op', value: pos(op) },
    { from: 'op', to: 'below', value: pos(belowOp) },
    { from: 'op', to: 'net', value: pos(net) },
  ];
  const loss = isNum(net) && net <= 0;
  return (
    <div>
      <SankeyChart nodes={nodes} links={links} height={340} />
      <Small>
        Fiscal {yearOf(inc.date)}, as filed. Of {money(inc.revenue)} of revenue, {isNum(net) ? money(net) : 'n/a'} reached the
        bottom line{isNum(net) && inc.revenue > 0 ? ` — ${pct(net / inc.revenue)} of every dollar` : ''}.
        {loss ? ' The company lost money this year, so no profit flow is drawn past operating income.' : ''}
        {' '}Flows are annual, not the trailing twelve months the ratios above use, because only a filed statement balances.
      </Small>
    </div>
  );
}

/** The balance sheet: what the company owns, and whose money paid for it. */
export function BalanceFlowPanel({ a }: { a: Analysis }) {
  const b = a.facts.statements.balance.at(-1);
  if (!b || !isNum(b.totalAssets) || b.totalAssets <= 0) return <Notice>No annual balance sheet is available to chart.</Notice>;
  const cash = b.cashAndShortTermInvestments;
  const curAssets = b.totalCurrentAssets;
  const otherCur = isNum(curAssets) && isNum(cash) ? curAssets - cash : null;
  const nonCur = isNum(curAssets) ? b.totalAssets - curAssets : null;
  const curLiab = b.totalCurrentLiabilities;
  const ltLiab = isNum(b.totalLiabilities) && isNum(curLiab) ? b.totalLiabilities - curLiab : null;
  const equity = b.totalStockholdersEquity;
  const nodes = [
    { id: 'cash', label: 'Cash & investments', layer: 0, color: 'var(--chart-2)' },
    { id: 'othercur', label: 'Other current assets', layer: 0, color: 'var(--chart-1)' },
    { id: 'noncur', label: 'Non-current assets', layer: 0, color: 'var(--chart-5)' },
    { id: 'assets', label: 'Total assets', layer: 1, color: 'var(--primary)' },
    { id: 'curliab', label: 'Current liabilities', layer: 2, color: 'var(--chart-4)' },
    { id: 'ltliab', label: 'Long-term liabilities', layer: 2, color: 'var(--chart-6)' },
    { id: 'equity', label: 'Shareholders’ equity', layer: 2, color: 'var(--up)' },
  ];
  const links = [
    { from: 'cash', to: 'assets', value: pos(cash) },
    { from: 'othercur', to: 'assets', value: pos(otherCur) },
    { from: 'noncur', to: 'assets', value: pos(nonCur) },
    { from: 'assets', to: 'curliab', value: pos(curLiab) },
    { from: 'assets', to: 'ltliab', value: pos(ltLiab) },
    { from: 'assets', to: 'equity', value: pos(equity) },
  ];
  const share = isNum(equity) ? equity / b.totalAssets : null;
  return (
    <div>
      <SankeyChart nodes={nodes} links={links} height={320} />
      <Small>
        Balance sheet at fiscal {yearOf(b.date)} year end. Left is what the company owns; right is whose money paid for it.{' '}
        {isNum(share) ? `Shareholders own ${pct(share)} of the ${money(b.totalAssets)} balance sheet outright, lenders and suppliers the rest.` : ''}
        {isNum(equity) && equity <= 0 ? ' Equity is negative, so no owners’ flow is drawn — liabilities exceed assets.' : ''}
      </Small>
    </div>
  );
}

/**
 * Debt and equity over the filed years, and two questions about them. A
 * falling ratio can mean debt came down or equity grew — different companies —
 * so both lines are drawn. Display only: the checks are verdicts on the
 * trend, not sector-relative scores.
 */
export function DebtEquityPanel({ a }: { a: Analysis }) {
  const s = (a.history?.debtSeries || []).filter((r: any) => isNum(r.totalDebt) || isNum(r.equity));
  if (s.length < 3) return <Notice>Not enough filed balance sheets to chart a debt history.</Notice>;

  // Both figures from the filed year the chart ends on, not the TTM set: a line
  // apart, a TTM debt and a balance-sheet debt were visibly different numbers.
  const last = s.at(-1);
  const filedYear = yearOf(last.date);
  const debt = last.totalDebt;
  const cashRow = (a.facts.statements.cash || []).at(-1);
  const ocf = isNum(cashRow?.operatingCashFlow) ? cashRow.operatingCashFlow : null;
  const years = isNum(debt) && isNum(ocf) && ocf > 0 ? debt / ocf : null;

  // Three years of operating cash flow is the line — the same comfort level
  // the net-debt-to-EBITDA line uses. The threshold is stated in the note: a
  // verdict whose basis is not visible is not one the reader can check.
  const COMFORT_YEARS = 3;
  const coverage = !isNum(debt) || debt <= 0
    ? { state: 'pass' as const, label: 'Carries no debt to cover', note: 'There is nothing on the balance sheet for the cash flow to repay.' }
    : !isNum(ocf) || ocf <= 0
      ? { state: 'fail' as const, label: 'Operating cash flow does not cover the debt',
        note: 'The business is not generating cash from trading, so the debt is not being serviced out of operations.' }
      : {
        state: (years! <= COMFORT_YEARS ? 'pass' : 'fail') as 'pass' | 'fail',
        label: years! <= 1 ? 'One year of operating cash flow covers the whole debt' : `Operating cash flow would clear the debt in ${dec(years, 1)} years`,
        note: `Fiscal ${filedYear}: ${money(ocf)} of operating cash against ${money(debt)} of borrowings. Under ${COMFORT_YEARS} years counts as `
          + 'covered here — and this is cash before any of it is spent on the business itself.',
      };

  const back = s.length >= 6 ? s.at(-6) : s[0];
  const spanYears = ((yearOf(last.date) ?? 0) - (yearOf(back.date) ?? 0)) || (s.length - 1);
  const then = back.totalDebt;
  const now = last.totalDebt;
  const trend = !isNum(then) || !isNum(now) || then <= 0
    ? { state: 'na' as const, label: `Debt trend over ${spanYears} years`, why: 'No comparable debt figure that far back.' }
    : {
      state: (now < then ? 'pass' : 'fail') as 'pass' | 'fail',
      label: now < then ? `Debt has fallen over ${spanYears} years` : `Debt has risen over ${spanYears} years`,
      note: `${money(then)} in ${yearOf(back.date)} against ${money(now)} in ${filedYear}, ${pct(Math.abs(now / then - 1))} ${now < then ? 'lower' : 'higher'}.`,
    };

  return (
    <div>
      <MultiLineChart height={280} valueFmt={(v) => money(v)} series={[
        { name: 'Total debt', color: 'var(--chart-6)', points: s.map((r: any) => ({ date: r.date, value: r.totalDebt })) },
        { name: 'Shareholders’ equity', color: 'var(--up)', points: s.map((r: any) => ({ date: r.date, value: r.equity })) },
      ]} />
      <ul className="mt-4 grid gap-0.5">
        <CheckRow {...coverage} />
        <CheckRow {...trend} />
      </ul>
    </div>
  );
}

/* ==========================================================================
   Return on capital against what that capital costs.

   A weighted average cost of capital is an assumption wearing a decimal
   point: change the risk-free rate in Settings and every red bar moves. So
   the panel shows the whole build-up, and the group carries `metrics: []`.
   The figures printed are the ones the chart drew — `deriveSeries` keeps the
   legs it weighted on each row (`waccParts`) — so working and bar cannot
   disagree. Add a component to the formula → add it to `waccParts`.
   ========================================================================== */

function WaccWorking({ a, series, last }: { a: Analysis; series: any; last: any }) {
  const w = last.waccParts;
  if (!w) return null;
  const bm = a.bm || {};
  const rate = (v: unknown) => (isNum(v) ? `${dec(v * 100, 2)}%` : 'n/a');
  const year = isNum(last.year) ? `FY${last.year}` : 'the last filed year';
  const Step = ({ label, value, note, total = false }: { label: string; value: string; note: string; total?: boolean }) => (
    <div className={total ? 'mt-1 flex items-baseline gap-4 border-t border-border pb-2 pt-3' : 'flex items-baseline gap-4 border-b border-border py-2 last:border-b-0'}>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <b className={total ? 'text-13 font-bold text-foreground' : 'text-13 font-semibold'}>{label}</b>
        {note ? <small className="text-tiny leading-relaxed text-muted-foreground">{note}</small> : null}
      </span>
      <span className={total ? 'flex-none whitespace-nowrap text-sm font-bold text-foreground tnum' : 'flex-none whitespace-nowrap text-sm font-semibold tnum'}>{value}</span>
    </div>
  );
  // Open by default: a hurdle rate with its arithmetic hidden is exactly the
  // thing this panel exists to stop being.
  return (
    <details open className="mt-6">
      <summary className="w-fit cursor-pointer py-1 text-tiny font-semibold uppercase tracking-[.04em] text-muted-foreground marker:text-muted-foreground/60">
        How the cost of capital is built
      </summary>
      <div className="mt-3 max-w-[720px]">
        <Step label="Risk-free rate" value={rate(bm.riskFreeRate)} note="The ten-year treasury. An assumption — editable in Settings." />
        <Step label="Beta" value={isNum(a.facts.beta) ? dec(a.facts.beta, 2) : 'assumed 1.00'}
          note={isNum(a.facts.beta)
            ? 'How far the share moves for a given move in the market, from the company profile.'
            : 'No beta on the profile, so the market’s own is used and the cost of equity is the plain equity return.'} />
        <Step label="Equity risk premium" value={rate(bm.equityRiskPremium)}
          note="What holding equities rather than treasuries is expected to pay. An assumption — editable in Settings." />
        <Step label="Cost of equity" value={rate(w.costOfEquity)} note="CAPM: the risk-free rate plus beta times the premium." total />
        <Step label="Cost of debt" value={rate(w.costOfDebt)} note={w.rdSource === 'observed'
          ? `Interest paid over total borrowings, ${year}.`
          : 'No usable interest line was filed, so borrowing is priced at the risk-free rate — the cheapest anything can be '
            + 'borrowed at, which understates the hurdle rather than inventing one.'} />
        <Step label="Effective tax rate" value={rate(w.taxRate)} note={w.taxSource === 'filed'
          ? `Tax expense over pre-tax income, ${year}, capped at 50%.`
          : 'No usable tax line was filed, so the US federal rate stands in.'} />
        <Step label="After-tax cost of debt" value={rate(w.afterTaxCostOfDebt)}
          note="Interest is deductible, so the company bears the rate less the tax it saves." total />
        <Step label="Equity weight" value={pct(w.equityWeight, { dp: 0 })} note={series.waccBasis === 'market'
          ? 'Market capitalisation over market capitalisation plus debt — what the equity is worth rather than what it is carried at.'
          : 'Book equity over book equity plus debt. This data plan returns no market capitalisation per year, which understates '
            + 'the equity weight and so the whole hurdle.'} />
        <Step label="Debt weight" value={pct(w.debtWeight, { dp: 0 })} note={`Total borrowings over the same total, ${year}.`} />
        <Step label="Weighted average cost of capital" value={rate(last.wacc)}
          note="Each leg at its own cost, weighted by how much of the funding it is." total />
      </div>
      <Small>
        The cost of equity is today’s beta and today’s rates, because neither is published per historical year — so the red
        series is &ldquo;what this mix would cost at today’s prices&rdquo;, not what it cost in 2018. The borrowing cost, the tax
        rate and the mix are each year’s own. It is a bar to clear, not a measurement.
      </Small>
    </details>
  );
}

export function CostOfCapitalPanel({ a }: { a: Analysis }) {
  const series = a.series;
  const rows = series?.rows || [];
  if (!series?.available || !rows.length) {
    return a.ds.status('income') !== 'ok'
      ? <FeedGate a={a} feed="income" what="The annual statements" />
      : <Notice>No annual statement history was returned for this company, so there is no capital base to measure a return against.</Notice>;
  }
  const last = series.latest || {};
  const spreads = rows.map((r: any) => r.spread).filter(isNum);
  const cleared = spreads.filter((v: number) => v > 0).length;
  return (
    <div>
      <p className="text-13 text-muted-foreground">
        Return on invested capital against the weighted cost of the capital earning it, {series.span}. The green bar is what the
        business made; the red bar is what the money cost. Green above red is the whole case for a company compounding — and it
        has to hold for years, not once.
      </p>
      <ColumnChart categories={rows.map((r: any) => String(r.year))} height={300} valueFmt={(v) => pct(v, { dp: 0 })} series={[
        { name: 'Return on invested capital', color: 'var(--up)', values: rows.map((r: any) => r.roic) },
        { name: 'Weighted cost of capital', color: 'var(--down)', values: rows.map((r: any) => r.wacc) },
      ]} />
      <StatLines split className="mt-4">
        <StatLine label="Return on invested capital" value={pct(last.roic)} note={`FY${last.year ?? ''}`} />
        <StatLine label="Weighted cost of capital" value={pct(last.wacc)} note={series.waccBasis === 'market' ? 'market-weighted' : 'book-weighted'} />
        <StatLine label="Spread" value={isNum(last.spread) ? pct(last.spread, { sign: true }) : 'n/a'} tone={signClass(last.spread)}
          note="earned less cost"
          title="Positive means the last filed year earned more on its capital than that capital costs. Sustained, it is the whole case for a company compounding." />
        <StatLine label="Years above cost" value={spreads.length ? `${cleared} of ${spreads.length}` : 'n/a'} note={series.span} />
      </StatLines>
      <WaccWorking a={a} series={series} last={last} />
    </div>
  );
}

export const GROUP_PANELS: Record<string, React.ComponentType<{ a: Analysis }>> = {
  analystForecast: AnalystForecastPanel,
  revenueFlow: RevenueFlowPanel,
  balanceFlow: BalanceFlowPanel,
  debtHistory: DebtEquityPanel,
  costOfCapital: CostOfCapitalPanel,
};

/* ==========================================================================
   Peer charts, closing off the two "against the field" pairs
   ========================================================================== */

const PEER_TONE = { self: 'var(--primary)', peer: 'var(--chart-1)', sector: 'var(--chart-3)' } as const;

/**
 * Annual revenue growth, the company against each named peer. One number
 * ("four points behind the peer average") cannot show whether the average is
 * one fast peer pulling three flat ones along. Negative bars are ordinary here.
 */
export function PeerGrowthChart({ a }: { a: Analysis }) {
  const self = a.growth?.revenueYoy;
  const rows = Object.entries(a.peerGrowth || {})
    .map(([sym, r]: [string, any]) => ({ label: sym, g: r?.revenueGrowth }))
    .filter((r) => isNum(r.g) && r.g > -1 && r.g < 10);
  if (!isNum(self) || rows.length < 2) return null;
  const sectorMed = a.lookup?.medianFor('revenueGrowthYoy');
  const all = [
    { label: a.facts.symbol, g: self, kind: 'self' as const },
    ...rows.map((r) => ({ ...r, kind: 'peer' as const })),
    ...(isNum(sectorMed) ? [{ label: 'Sector', g: sectorMed, kind: 'sector' as const }] : []),
  ].sort((x, y) => x.g - y.g);
  const avg = rows.reduce((t, r) => t + r.g, 0) / rows.length;
  const faster = rows.filter((r) => r.g > self).length;
  return (
    <div>
      <ColumnChart categories={all.map((r) => r.label)} height={260} legend={false} valueFmt={(v) => pct(v, { sign: true })}
        refLine={{ value: avg, label: `peer average ${pct(avg)}`, align: 'start' }}
        series={[{ name: 'Revenue growth (YoY)', color: 'var(--chart-1)', colors: all.map((r) => PEER_TONE[r.kind]), values: all.map((r) => r.g) }]} />
      <Small>
        {a.facts.symbol} grew {pct(self)} against {rows.length} named peers.{' '}
        {faster === 0 ? 'It outgrew all of them.' : faster === rows.length ? 'Every one of them grew faster.' : `${faster} of ${rows.length} grew faster.`}
        {isNum(sectorMed) ? ` The wider ${a.facts.sector || 'sector'} median is ${pct(sectorMed)}.` : ''}
        {' '}Peer growth is the latest reported fiscal year, so a peer with a different year end is measured over a slightly different window.
      </Small>
    </div>
  );
}

/**
 * The company's earnings multiple against each named peer, sorted, with the
 * sector median as a bar of its own (for a megacap set it often sits below
 * every name). The dashed line is the average the row is graded against.
 */
export function PeerPeChart({ a }: { a: Analysis }) {
  const self = a.facts.pe;
  const peers = (a.peers?.peers || []).filter((p: any) => isNum(p.pe) && p.pe > 0);
  if (!isNum(self) || self <= 0 || peers.length < 2) return null;
  const sectorMed = a.lookup?.medianFor('peGaapTtm');
  const rows = [
    { label: a.facts.symbol, pe: self, kind: 'self' as const },
    ...peers.map((p: any) => ({ label: p.symbol, pe: p.pe, kind: 'peer' as const })),
    ...(isNum(sectorMed) && sectorMed > 0 ? [{ label: 'Sector', pe: sectorMed, kind: 'sector' as const }] : []),
  ].sort((x, y) => x.pe - y.pe);
  const avg = a.peers?.peerPe;
  const cheaper = rows.filter((r) => r.kind === 'peer' && r.pe < self).length;
  const place = cheaper === 0 ? 'It is the cheapest of them.'
    : cheaper === peers.length ? 'It is the dearest of them.' : `${cheaper} of ${peers.length} trade cheaper.`;
  return (
    <div>
      <ColumnChart categories={rows.map((r) => r.label)} height={260} legend={false} valueFmt={(v) => mult(v)}
        refLine={isNum(avg) ? { value: avg, label: `peer average ${mult(avg)}`, align: 'start' } : null}
        series={[{ name: 'P/E (TTM)', color: 'var(--chart-1)', colors: rows.map((r: { kind: keyof typeof PEER_TONE }) => PEER_TONE[r.kind]), values: rows.map((r) => r.pe) }]} />
      <Small>
        {a.facts.symbol} at {mult(self)} against {peers.length} named peers. {place}
        {isNum(sectorMed) ? ` The wider ${a.facts.sector || 'sector'} median sits at ${mult(sectorMed)}.` : ''}
        {' '}Peer multiples are trailing and unadjusted, so a peer with a one-off loss will look dear.
      </Small>
    </div>
  );
}

/* ==========================================================================
   EXTRAS — the chart under a subtopic's table, keyed `factor.group`
   ========================================================================== */

const vsMedian = (a: Analysis, rows: [string, unknown, string][], fmt: (v: number) => string, height = 240) => (
  <ColumnChart categories={rows.map(([k]) => k)} height={height} valueFmt={fmt} series={[
    { name: a.facts.symbol, color: 'var(--primary)', values: rows.map(([, v]) => v as number) },
    { name: `${a.facts.sector || 'Sector'} median`, color: 'var(--chart-1)', values: rows.map(([, , id]) => a.lookup?.medianFor(id) ?? null) },
  ]} />
);

export const EXTRAS: Record<string, (a: Analysis) => React.ReactNode | null> = {
  /* The whole return curve rather than six separate rows: the useful read is
     whether the recent windows sit above or below the long ones. */
  'momentum.travel': (a) => {
    const spans = ([
      ['1M', a.momentum.r1m, 'return1m'], ['3M', a.momentum.r3m, 'return3m'],
      ['6M', a.momentum.r6m, 'return6m'], ['9M', a.momentum.r9m, 'return9m'],
      ['YTD', a.momentum.rYtd, 'returnYtd'], ['1Y', a.momentum.r1y, 'return1y'],
    ] as [string, unknown, string][]).filter(([, v]) => isNum(v));
    if (spans.length < 3) return null;
    return vsMedian(a, spans, (v) => pct(v, { sign: true }));
  },

  /* Stacked because shareholder yield IS dividend plus buyback. A negative
     buyback segment is net issuance, and stacks below the line where it belongs. */
  'valuation.yields': (a) => {
    const div = a.facts.dividendYield;
    const buy = a.val.buybackYield;
    if (!isNum(div) && !isNum(buy)) return null;
    const med = (id: string) => a.lookup?.medianFor(id) ?? null;
    return (
      <div>
        <ColumnChart stacked height={240} valueFmt={(v) => pct(v)} categories={[a.facts.symbol, `${a.facts.sector || 'Sector'} median`]} series={[
          { name: 'Dividend', color: 'var(--chart-2)', values: [div ?? null, med('dividendYieldTtm')] },
          { name: 'Buyback', color: 'var(--chart-5)', values: [buy ?? null, med('buybackYield')] },
        ]} />
        <Small>
          The two bars stack to shareholder yield, the third row above. A buyback segment below the line is net issuance — the
          company sold shares rather than retiring them.
        </Small>
      </div>
    );
  },

  /* The return family side by side: the spread between them says where the
     returns come from — leverage, intangibles, or the operating business. */
  'profitability.returns': (a) => {
    const rows = ([
      ['On equity', a.facts.roe, 'returnOnEquity'],
      ['On invested capital', a.facts.roic, 'returnOnInvestedCapital'],
      ['On assets', a.facts.roa, 'returnOnAssets'],
      ['On tangible assets', a.facts.returnOnTangibleAssets, 'returnOnTangibleAssets'],
      ['On capital employed', a.facts.roce, 'returnOnCapitalEmployed'],
    ] as [string, unknown, string][]).filter(([, v]) => isNum(v));
    if (rows.length < 3) return null;
    return vsMedian(a, rows, (v) => pct(v));
  },

  /* The liquidity ladder, each rung stricter than the last. */
  'health.liquidity': (a) => {
    const rows = ([
      ['Current', a.facts.currentRatio, 'currentRatio'],
      ['Quick', a.facts.quickRatio, 'quickRatio'],
      ['Cash', a.facts.cashRatio, 'cashRatio'],
    ] as [string, unknown, string][]).filter(([, v]) => isNum(v));
    if (rows.length < 2) return null;
    return (
      <div>
        <ColumnChart categories={rows.map(([k]) => k)} height={230} valueFmt={(v) => dec(v, 2)}
          refLine={{ value: 1, label: '1.0x — bills just covered', align: 'start' }} series={[
            { name: a.facts.symbol, color: 'var(--primary)', values: rows.map(([, v]) => v as number) },
            { name: `${a.facts.sector || 'Sector'} median`, color: 'var(--chart-1)', values: rows.map(([, , id]) => a.lookup?.medianFor(id) ?? null) },
          ]} />
        <Small>
          Each rung strips out assets that are harder to turn into cash quickly. Below the dashed line the company could not settle
          a year of bills from that class of assets alone.
        </Small>
      </div>
    );
  },

  /* The same question asked of earnings and of cash, on one scale — the gap
     says how much of the reported profit actually arrives. */
  'valuation.cashflows': (a) => {
    const asPct = (v: unknown) => (isNum(v) ? v * 100 : null);
    const mine = [asPct(a.val.earningsYield), asPct(a.val.fcfYield)];
    if (!mine.some(isNum)) return null;
    return (
      <ColumnChart categories={['Earnings yield (TTM)', 'Free cash flow yield (TTM)']} height={240}
        valueFmt={(v) => pct(v, { already: true, dp: 2 })} series={[
          { name: a.facts.symbol, color: 'var(--primary)', values: mine },
          { name: `${a.facts.sector || 'Sector'} median`, color: 'var(--chart-1)',
            values: [asPct(a.lookup?.medianFor('earningsYieldTtm')), asPct(a.lookup?.medianFor('fcfYieldTtm'))] },
        ]} />
    );
  },

  'valuation.compare': (a) => {
    const s = a.history.peSeries;
    if (s.length < 2) return null;
    return <ColumnChart categories={s.map((r: any) => String(yearOf(r.date)))} height={220} legend={false}
      valueFmt={(v) => mult(v, 0)} series={[{ name: 'Price to earnings', color: 'var(--chart-5)', values: s.map((r: any) => r.pe) }]} />;
  },

  'growth.topline': (a) => {
    const inc = a.facts.statements.income;
    if (inc.length < 2) return null;
    return <ColumnChart categories={inc.map((r: any) => String(yearOf(r.date)))} height={240} valueFmt={(v) => money(v)} series={[
      { name: 'Revenue', color: 'var(--chart-1)', values: inc.map((r: any) => r.revenue) },
      { name: 'Net income', color: 'var(--chart-2)', values: inc.map((r: any) => r.netIncome) },
    ]} />;
  },

  'growth.forecast': (a) => {
    const rows = a.forecast.rows;
    if (!a.forecast.available || rows.length < 2) return null;
    const inc = a.facts.statements.income.slice(-4);
    const points = [...inc.map((r: any) => String(yearOf(r.date))), ...rows.map((r: any) => String(r.year))];
    return <ForecastChart points={points} height={260} valueFmt={(v) => money(v)} splitAt={inc.length - 1} series={[
      { name: 'Revenue', color: 'var(--chart-1)', values: [...inc.map((r: any) => r.revenue), ...rows.map((r: any) => r.revenue)] },
      { name: 'Earnings', color: 'var(--chart-2)', values: [...inc.map((r: any) => r.netIncome), ...rows.map((r: any) => r.netIncome)] },
    ]} />;
  },

  'profitability.margins': (a) => {
    const inc = a.facts.statements.income;
    if (inc.length < 2) return null;
    const marginOf = (r: any, field: string) => (r.revenue > 0 && isNum(r[field]) ? (r[field] / r.revenue) * 100 : null);
    return <ColumnChart categories={inc.map((r: any) => String(yearOf(r.date)))} height={240} valueFmt={(v) => pct(v, { already: true })} series={[
      { name: 'Gross', color: 'var(--chart-1)', values: inc.map((r: any) => marginOf(r, 'grossProfit')) },
      { name: 'Operating', color: 'var(--chart-4)', values: inc.map((r: any) => marginOf(r, 'operatingIncome')) },
      { name: 'Net', color: 'var(--chart-2)', values: inc.map((r: any) => marginOf(r, 'netIncome')) },
    ]} />;
  },

  'health.leverage': (a) => {
    const s = a.history.debtSeries.filter((d: any) => isNum(d.debtToEquity));
    if (s.length < 2) return null;
    return <ColumnChart categories={s.map((r: any) => String(yearOf(r.date)))} height={220} legend={false}
      valueFmt={(v) => pct(v, { already: true })}
      series={[{ name: 'Debt to equity', color: 'var(--chart-6)', values: s.map((r: any) => r.debtToEquity * 100) }]} />;
  },

  'momentum.street': (a) => {
    const pt = a.ds.get('priceTarget');
    if (!pt || !isNum(pt.targetConsensus)) return null;
    return <RangeChart low={pt.targetLow} avg={pt.targetConsensus} high={pt.targetHigh} current={a.facts.price} currency={curSymbol(a.facts.currency)} />;
  },
};
