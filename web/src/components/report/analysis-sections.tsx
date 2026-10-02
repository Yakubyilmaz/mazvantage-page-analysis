'use client';

/* ==========================================================================
   Maz Vantage — the Analysis tab's narrative sections

   Port of the legacy `sections.js`: the stock overview with rewards and
   risks, price history and performance, the company and its fundamentals,
   the dividend (unscored — the payout ratios feed the graded factors; this is
   the detail behind them), management, ownership, competitors, and the data
   status that says where every figure came from.
   ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { curSymbol, dec, fmtDate, initials, isNum, money, mult, num, pct, price, signClass, yearOf } from '@/lib/format';
import { computeReturns, normalisePrices, weeklyVolatility, type Analysis } from '@/lib/model';
import { getApiKey } from '@/lib/fmp';
import { FACTOR_BY_KEY } from '@/lib/factors';
import { MAX_SCORE } from '@/lib/grading';
import { stockHref } from '@/lib/routes';
import { ColumnChart, Donut, LineChart, WaterfallChart } from '@/components/charts/charts';
import { Gauge, VolatilityStrip } from '@/components/charts/diagrams';
import { Block, Card, CardHead, CmpBars, DataTable, FeedGate, KeyInfo, Notice, Pill, SectionIntro, toneClass } from '@/components/report/ui';
import { GradePill } from '@/components/report/grade-parts';
import { usePings } from '@/components/report/pings';
import { cn } from '@/lib/cn';

const gate = (a: Analysis, feed: string, what: string, fallback: string) =>
  a.ds.status(feed) !== 'ok' ? <FeedGate a={a} feed={feed} what={what} /> : <Notice>{fallback}</Notice>;

const Signed = ({ v }: { v: unknown }) => (
  <span className={toneClass(signClass(v as number))}>{isNum(v) ? pct(v, { sign: true }) : 'n/a'}</span>
);

/* ==========================================================================
   1. Overview
   ========================================================================== */

function RRList({ title, items, kind }: { title: string; items: string[]; kind: 'reward' | 'risk' }) {
  return (
    <div className="rounded-[10px] bg-muted p-4">
      <h3 className={cn('mb-2 text-sm font-semibold', kind === 'reward' ? 'text-up' : 'text-down')}>{title}</h3>
      {items.length ? (
        <ul className="grid gap-2">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2 text-13 leading-relaxed">
              <span className={cn('mt-[7px] size-1.5 flex-none rounded-full', kind === 'reward' ? 'bg-up' : 'bg-down')} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-13 text-muted-foreground">
          {kind === 'reward' ? 'No standout rewards identified.' : 'No material risks flagged by the checks.'}
        </p>
      )}
    </div>
  );
}

export function OverviewSection({ a }: { a: Analysis }) {
  const f = a.facts;
  const [open, setOpen] = React.useState(false);
  const long = !!f.description && f.description.length > 420;
  const bits = [f.industry, f.sector].filter(Boolean);
  return (
    <Card id="overview">
      <CardHead title={`${f.symbol} Stock Overview`} sub={bits.length ? `${f.name} · ${bits.join(' · ')}` : f.name} />
      <p className="mt-2 text-13 leading-[1.7] text-muted-foreground">
        {f.description ? (open || !long ? f.description : `${f.description.slice(0, 420)}…`) : 'No company description available.'}
      </p>
      {long ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-tiny font-semibold text-muted-foreground hover:text-foreground">
          {open ? 'Show less' : 'Show more'}
        </button>
      ) : null}
      {/* No flake here: the sticky one beside the report carries the same five
          scores and never leaves the screen. */}
      <Block title="Maz Vantage Flake Analysis" desc={a.verdict} className="mt-6 border-t pt-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
          <RRList title="Rewards" items={a.rewards} kind="reward" />
          <RRList title="Risk Analysis" items={a.risks} kind="risk" />
        </div>
      </Block>
    </Card>
  );
}

/* ==========================================================================
   2. Price history & performance
   ========================================================================== */

const RANGES = [
  { key: '1M', days: 30 }, { key: '3M', days: 92 }, { key: '6M', days: 183 },
  { key: '1Y', days: 365 }, { key: '3Y', days: 1095 }, { key: '5Y', days: 1825 },
  { key: 'Max', days: Infinity },
];

function verdictVs(stock: unknown, bench: unknown, sym: string, what: string) {
  if (!isNum(stock) || !isNum(bench)) return `Not enough history to compare ${sym} with the ${what}.`;
  return `${sym} ${stock > bench ? 'outperformed' : 'underperformed'} the ${what}, which returned ${pct(bench)} over the past year.`;
}

function RecentNews({ a }: { a: Analysis }) {
  const news = a.ds.get('news');
  const body = !Array.isArray(news) || !news.length
    ? gate(a, 'news', 'Recent news', 'No recent headlines returned for this ticker.')
    : (
      <div className="grid gap-4">
        {news.slice(0, 8).map((n: any, i: number) => (
          <article key={n.url || i} className="flex items-start gap-3">
            <div className="grid size-9 flex-none place-items-center rounded-full bg-accent text-tiny font-semibold text-muted-foreground">
              {(n.publisher || n.site || '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-tiny text-muted-foreground">{`${n.publisher || n.site || 'News'} · ${fmtDate(n.publishedDate || n.date)}`}</div>
              <a href={n.url || '#'} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-primary">{n.title || 'Untitled'}</a>
              {n.text ? <p className="mt-1 text-tiny text-muted-foreground">{`${String(n.text).slice(0, 220)}…`}</p> : null}
            </div>
          </article>
        ))}
      </div>
    );
  return <Block title="Recent News & Updates" desc="Company headlines from the last few weeks.">{body}</Block>;
}

export function PriceHistorySection({ a, extras }: { a: Analysis; extras: { benchmarks?: Record<string, any> } | null }) {
  const f = a.facts;
  const prices = React.useMemo(() => normalisePrices(a.ds.get('prices')), [a]);
  const [active, setActive] = React.useState('1Y');
  // Shared with the Overview and Research charts: the eight-request fund pull
  // is memoised per symbol, so pressing the button on any one pays for all.
  const pings = usePings(a);

  const days = RANGES.find((r) => r.key === active)!.days;
  const cutoff = Date.now() - days * 864e5;
  const pts = prices.filter((p: any) => days === Infinity || new Date(p.date).getTime() >= cutoff);

  const returns = computeReturns(prices);
  const bench = extras?.benchmarks || {};
  const industryR = computeReturns(normalisePrices(bench.industry));
  const periods = ['7D', '1M', '3M', '1Y', '3Y', '5Y'];
  const vol = weeklyVolatility(prices);

  const rangesel = (
    <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
      {RANGES.map((r) => (
        <button key={r.key} type="button" onClick={() => setActive(r.key)}
          className={cn('rounded-md px-2.5 py-1 text-tiny font-semibold text-muted-foreground hover:text-foreground',
            active === r.key && 'bg-background text-foreground shadow-sm')}>
          {r.key}
        </button>
      ))}
    </div>
  );

  return (
    <Card id="price-history">
      <CardHead title="Price History & Performance" />
      <Block title="Share price" desc={`Closing prices${prices.length ? ` since ${fmtDate(prices[0].date)}` : ''}.`} aside={rangesel}>
        {pts.length > 1 ? (
          <LineChart series={pts.map((p: any) => ({ date: p.date, value: p.price }))} valueFmt={(v) => price(v, curSymbol(f.currency))}
            labelFmt={(d) => fmtDate(d, { month: 'short', year: '2-digit' })} markers={pings.markers} />
        ) : gate(a, 'prices', 'Price history', 'No price history for this range.')}
        {pings.legend}
        {pings.note}
      </Block>
      <Block title="Shareholder Returns" desc="Total price return over each period, against the sector.">
        <DataTable headers={[{ label: '' }, ...periods.map((p) => ({ label: p, num: true }))]} rows={[
          [<b key="s">{f.symbol}</b>, ...periods.map((p) => <Signed key={p} v={returns[p]} />)],
          [<span key="i" className="text-muted-foreground">{f.sector || 'Industry'}</span>, ...periods.map((p) => <Signed key={p} v={industryR[p]} />)],
        ]} />
        <p className="mt-4 text-13 text-muted-foreground">
          <b className="text-foreground">Return vs Industry: </b>
          {verdictVs(returns['1Y'], industryR['1Y'], f.symbol, f.sector ? `${f.sector} sector` : 'industry')}
        </p>
        {bench.note ? <p className="mt-2 text-tiny text-muted-foreground/80">{bench.note}</p> : null}
      </Block>
      <Block title="Price Volatility" desc="Weekly price movement compared with the market and the sector.">
        <VolatilityStrip stock={vol} market={weeklyVolatility(normalisePrices(bench.market))} industry={weeklyVolatility(normalisePrices(bench.industry))} />
        <p className="mt-4 text-13 text-muted-foreground">
          <b className="text-foreground">Volatility Over Time: </b>
          {isNum(vol)
            ? `${f.symbol}'s weekly volatility (${pct(vol)}) is ${vol < 0.05 ? 'in line with' : 'above'} a typical large-cap range over the past year.`
            : 'Not enough price history to measure volatility.'}
        </p>
      </Block>
      <RecentNews a={a} />
    </Card>
  );
}

/* ==========================================================================
   3. About the company + fundamentals summary
   ========================================================================== */

function splitEarnings(a: Analysis) {
  const rows = (a.ds.get('earnings') || []).filter((r: any) => r && r.date);
  const now = Date.now();
  const past = rows.filter((r: any) => new Date(r.date).getTime() <= now).sort((x: any, y: any) => +new Date(y.date) - +new Date(x.date));
  const future = rows.filter((r: any) => new Date(r.date).getTime() > now).sort((x: any, y: any) => +new Date(x.date) - +new Date(y.date));
  return { last: past[0] || null, next: future[0] || null };
}

export function AboutSection({ a }: { a: Analysis }) {
  const f = a.facts;
  const rev = f.revenue;
  const gross = isNum(rev) && isNum(f.grossMargin) ? rev * f.grossMargin : null;
  const cor = isNum(gross) ? rev - gross : null;
  const other = isNum(gross) && isNum(f.netIncome) ? gross - f.netIncome : null;
  const e = splitEarnings(a);
  return (
    <Card id="about">
      <CardHead title="About the Company" />
      <KeyInfo items={[
        // FMP reports the listing date, not the incorporation date — label it honestly.
        ['Listed since', f.ipoDate ? String(yearOf(f.ipoDate)) : 'n/a'],
        ['Employees', isNum(f.employees) ? f.employees.toLocaleString('en-US') : 'n/a'],
        ['CEO', f.ceo || 'n/a'],
        ['Website', f.website ? f.website.replace(/^https?:\/\//, '') : 'n/a'],
      ]} />
      <Block title={`${f.name} Fundamentals Summary`} desc="How the trailing twelve months translate into the headline multiples." className="mt-6 border-t pt-6">
        <KeyInfo items={[
          ['Market cap', money(f.marketCap)],
          ['Revenue (TTM)', money(f.revenue)],
          ['Earnings (TTM)', money(f.netIncome)],
          ['P/E ratio', mult(f.pe)],
          ['P/S ratio', mult(f.ps)],
        ]} />
        {isNum(rev) ? (
          <div className="mt-6">
            <h4 className="text-base font-semibold">Earnings &amp; Revenue</h4>
            <p className="mt-[3px] text-13 text-muted-foreground">
              What each dollar of revenue has to cover before it reaches {f.symbol}&apos;s bottom line, over the trailing twelve months.
            </p>
            <div className="mt-4">
              <WaterfallChart valueFmt={(v) => money(v)} steps={[
                { label: 'Revenue', value: rev, kind: 'total', color: 'var(--primary)' },
                { label: 'Cost of revenue', value: isNum(cor) ? -cor : null, kind: 'delta' },
                { label: 'Gross profit', value: gross, kind: 'total', color: 'var(--chart-1)' },
                { label: 'Other expenses', value: isNum(other) ? -other : null, kind: 'delta' },
                { label: 'Earnings', value: f.netIncome, kind: 'total', color: 'var(--up)' },
              ]} />
            </div>
          </div>
        ) : null}
        <div className="mt-6">
          <KeyInfo items={[
            ['Last reported earnings', e.last ? fmtDate(e.last.date) : (f.lastReported ? fmtDate(f.lastReported) : 'n/a')],
            ['Next earnings date', e.next ? fmtDate(e.next.date) : 'n/a'],
            ['Earnings per share (TTM)', dec(f.eps, 2)],
            ['Gross margin', pct(f.grossMargin, { dp: 2 })],
            ['Net profit margin', pct(f.netMargin, { dp: 2 })],
            ['Debt/equity ratio', pct(f.debtToEquity)],
            ['Dividend yield', pct(f.dividendYield, { dp: 2 })],
            ['Payout ratio', pct(f.payoutRatio, { dp: 0 })],
            ['Beta', dec(f.beta, 2)],
          ]} />
        </div>
      </Block>
    </Card>
  );
}

/* ==========================================================================
   Dividend — unscored; the detail behind the graded yield and payout growth.
   ========================================================================== */

const PAYOUT_BANDS = [
  { from: 0, to: 0.6, color: 'var(--up)' },
  { from: 0.6, to: 0.9, color: 'var(--grade-mid)' },
  { from: 0.9, to: 1.2, color: 'var(--down)' },
];

/** Whether reported profit covers the dividend, against the payout ceiling from Settings. */
function coverNote(a: Analysis) {
  const f = a.facts;
  if (!isNum(f.dividendYield) || f.dividendYield <= 0) return `${f.symbol} pays no dividend, so there is nothing to cover.`;
  if (!isNum(f.payoutRatio)) return 'The payout ratio needs both a dividend and trailing earnings.';
  if (f.payoutRatio < 0) return `${f.symbol} is paying a dividend out of losses, which cannot continue indefinitely.`;
  return f.payoutRatio <= a.bm.payoutCeiling
    ? `At ${pct(f.payoutRatio, { dp: 0 })} of earnings the dividend is comfortably covered, leaving ${pct(1 - f.payoutRatio, { dp: 0 })} of profit retained in the business.`
    : `At ${pct(f.payoutRatio, { dp: 0 })} of earnings the dividend is not covered by profit — it is being funded from reserves, borrowing or asset sales.`;
}

/** The same question asked of cash rather than of reported profit. */
function cashNote(a: Analysis) {
  const f = a.facts;
  if (!isNum(f.dividendYield) || f.dividendYield <= 0) return `${f.symbol} pays no dividend.`;
  if (!isNum(f.cashPayoutRatio)) return 'A cash payout ratio needs free cash flow per share, which is not available.';
  return f.cashPayoutRatio <= a.bm.payoutCeiling
    ? `Free cash flow covers the payout ${mult(1 / f.cashPayoutRatio)} over — the test that matters more than the earnings one, because dividends are paid in cash.`
    : `The dividend takes ${pct(f.cashPayoutRatio, { dp: 0 })} of free cash flow, so there is little room for it to grow without the cash generation improving first.`;
}

export function DividendSection({ a }: { a: Analysis }) {
  const f = a.facts;
  const d = a.dividends;
  const summary = !isNum(f.dividendYield) || f.dividendYield <= 0
    ? `${f.name} does not currently pay a dividend.`
    : `${f.name} is a dividend paying company with a current yield of ${pct(f.dividendYield, { dp: 2 })}.`;
  return (
    <Card id="dividend">
      <SectionIntro title={`${f.name} Dividends and Buybacks`}>
        <p className="mt-1 text-13 text-muted-foreground">How much {f.symbol} pays out, whether it is covered, and whether it has held up.</p>
        <p className="mt-3 text-13 leading-[1.65] text-muted-foreground">{summary}</p>
      </SectionIntro>
      <Block title="Key information" desc="Yield, cover and growth at a glance.">
        <KeyInfo items={[
          ['Dividend yield', pct(f.dividendYield, { dp: 2 })],
          ['Dividend per share', isNum(f.dividendPerShare) ? price(f.dividendPerShare, curSymbol(f.currency)) : 'n/a'],
          ['Payout ratio', pct(f.payoutRatio, { dp: 0 })],
          ['Cash payout ratio', pct(f.cashPayoutRatio, { dp: 0 })],
          ['Dividend growth (p.a.)', pct(d.growth, { dp: 1 })],
          ['Years of history', d.years ? String(d.years) : 'n/a'],
        ]} />
      </Block>
      <Block title="Stability and Growth of Payments" desc="Dividends per share by calendar year — the current, incomplete year is excluded.">
        {d.available && d.byYear.length > 1 ? (
          <ColumnChart categories={d.byYear.map((r: any) => String(r.year))} height={230} legend={false} valueFmt={(v) => dec(v, 2)}
            series={[{ name: 'Dividend per share', color: 'var(--primary)', values: d.byYear.map((r: any) => r.amount) }]} />
        ) : gate(a, 'dividends', 'Dividend history', 'No dividend payment history available.')}
      </Block>
      <Block title="Dividend Yield vs Market" desc={`How ${f.symbol}'s yield ranks against dividend payers generally.`}>
        <CmpBars fmt={(v) => pct(v, { dp: 2 })} rows={[
          { label: 'Bottom 25% of payers', value: a.bm.dividendNotable },
          { label: 'Top 25% of payers', value: a.bm.dividendTopTier },
          { label: f.symbol, value: f.dividendYield, self: true },
        ]} />
      </Block>
      <Block title="Earnings Payout to Shareholders" desc="The share of profit paid out as dividends.">
        <div className="flex flex-wrap items-center gap-6">
          <Gauge value={f.payoutRatio} min={0} max={1.2} label="of earnings paid out" bands={PAYOUT_BANDS} />
          <p className="max-w-[360px] text-13 text-muted-foreground">{coverNote(a)}</p>
        </div>
      </Block>
      <Block title="Cash Payout to Shareholders" desc="The share of free cash flow paid out as dividends.">
        <div className="flex flex-wrap items-center gap-6">
          <Gauge value={f.cashPayoutRatio} min={0} max={1.2} label="of free cash flow paid out" bands={PAYOUT_BANDS} />
          <p className="max-w-[360px] text-13 text-muted-foreground">{cashNote(a)}</p>
        </div>
      </Block>
    </Card>
  );
}

/* ==========================================================================
   Management
   ========================================================================== */

function Person({ name, title, pay, sub }: { name: string; title?: string; pay: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
      <div className="grid size-9 flex-none place-items-center rounded-full bg-accent text-tiny font-semibold text-muted-foreground">{initials(name)}</div>
      <div className="min-w-0 flex-1">
        <div className="text-13 font-semibold">{name}</div>
        <div className="text-tiny text-muted-foreground">{title || ''}</div>
      </div>
      <div className="text-right text-13 tnum">
        <div>{pay}</div>
        {sub ? <div className="text-tiny text-muted-foreground">{sub}</div> : null}
      </div>
    </div>
  );
}

export function ManagementSection({ a }: { a: Analysis }) {
  const f = a.facts;
  const x = a.execs;
  const people = (list: any[], empty: string) => (list.length
    ? <div className="grid">{list.map((p, i) => <Person key={`${p.name}-${i}`} name={p.name} title={p.title} pay={isNum(p.pay) ? money(p.pay) : '—'} sub={p.yearBorn ? `born ${p.yearBorn}` : null} />)}</div>
    : gate(a, 'executives', 'Leadership data', empty));
  return (
    <Card id="management">
      <SectionIntro title="Management">
        <p className="mt-1 text-13 text-muted-foreground">Who runs the company, how long they have been there, and what they are paid.</p>
      </SectionIntro>
      <Block title="Key information" desc="Tenure and pay across the leadership team.">
        <KeyInfo items={[
          ['Chief executive officer', x.ceo?.name || f.ceo || 'n/a'],
          ['Total compensation', isNum(x.ceoTotal) ? money(x.ceoTotal) : 'n/a'],
          ['CEO tenure', isNum(x.ceoTenure) ? `${dec(x.ceoTenure, 1)} yrs` : 'n/a'],
          ['Management average tenure', isNum(x.managementTenure) ? `${dec(x.managementTenure, 1)} yrs` : 'n/a'],
          ['Board average tenure', isNum(x.boardTenure) ? `${dec(x.boardTenure, 1)} yrs` : 'n/a'],
          ['Size benchmark', x.capBand ? `${x.capBand.label} · ${money(x.capBand.typical)}` : 'n/a'],
        ]} />
      </Block>
      <Block title="CEO" desc="Who runs the company.">
        {x.ceo
          ? <Person name={x.ceo.name} title={x.ceo.title || 'Chief Executive Officer'} pay={<b>{isNum(x.ceoTotal) ? money(x.ceoTotal) : 'n/a'}</b>} sub="total compensation" />
          : <Notice>No CEO detail is available for this company.</Notice>}
      </Block>
      <Block title="CEO Compensation Analysis" desc="How the package is split and how it has moved.">
        {x.compHistory.length > 1 ? (
          <ColumnChart stacked categories={x.compHistory.map((c: any) => String(c.year))} height={230} valueFmt={(v) => money(v)} series={[
            { name: 'Salary', color: 'var(--chart-1)', values: x.compHistory.map((c: any) => c.salary ?? null) },
            { name: 'Bonus & stock', color: 'var(--chart-4)', values: x.compHistory.map((c: any) => (c.total ?? 0) - (c.salary ?? 0)) },
          ]} />
        ) : gate(a, 'execComp', 'Executive compensation', 'No multi-year compensation history available.')}
      </Block>
      <Block title="Leadership Team" desc="Executives reporting into the CEO.">{people(x.mgmt, 'No executive list available.')}</Block>
      <Block title="Board Members" desc="Directors and chairs.">{people(x.board, 'No board list available.')}</Block>
    </Card>
  );
}

/* ==========================================================================
   Ownership
   ========================================================================== */

export function OwnershipSection({ a }: { a: Analysis }) {
  const f = a.facts;
  const ins = a.insiders;
  const trades = ins.trades;
  const inst = a.ds.get('institutional');
  const float = a.ds.get('sharesFloat');
  const freeFloat = float?.floatShares;
  const outstanding = float?.outstandingShares ?? f.shares;

  return (
    <Card id="ownership">
      <CardHead title="Ownership" sub="Who are the major shareholders, and have insiders been buying or selling?" />
      {ins.available ? (
        <Block title="Insider trading summary" desc={`Shares acquired against shares disposed across ${ins.span}.`}>
          <KeyInfo items={[
            ['Shares acquired', ins.acquired.toLocaleString('en-US')],
            ['Shares disposed', ins.disposed.toLocaleString('en-US')],
            ['Net', `${ins.net >= 0 ? '+' : ''}${ins.net.toLocaleString('en-US')}`],
            ['Acquired / disposed', isNum(ins.ratio) ? dec(ins.ratio, 2) : 'n/a'],
          ]} />
          <p className="mt-4 text-13 text-muted-foreground">{ins.note}</p>
        </Block>
      ) : <FeedGate a={a} feed="insiderStats" what="Insider trading summary" />}
      <Block title="Recent Insider Transactions" desc="Form 4 filings, most recent first.">
        {Array.isArray(trades) && trades.length ? (
          <DataTable
            headers={[{ label: 'Date' }, { label: 'Insider' }, { label: 'Role' }, { label: 'Type' }, { label: 'Shares', num: true }, { label: 'Value', num: true }]}
            rows={trades.slice(0, 12).map((t: any) => {
              // `acquisitionOrDisposition` is the reliable direction flag; the
              // transaction code ("S-Sale", "P-Purchase") is the label.
              const acquired = (t.acquisitionOrDisposition || '').toUpperCase() === 'A';
              return [
                fmtDate(t.transactionDate || t.filingDate),
                t.reportingName || 'n/a',
                (t.typeOfOwner || '—').replace(/^officer:\s*/i, ''),
                <Pill key="p" tone={acquired ? 'good' : 'bad'}>{(t.transactionType || (acquired ? 'Acquired' : 'Disposed')).replace(/^[A-Z]-/, '')}</Pill>,
                isNum(t.securitiesTransacted) ? t.securitiesTransacted.toLocaleString('en-US') : 'n/a',
                isNum(t.price) && t.price > 0 && isNum(t.securitiesTransacted) ? money(t.price * t.securitiesTransacted) : '—',
              ];
            })}
          />
        ) : gate(a, 'insiderTrades', 'Insider transactions', 'No insider transactions reported.')}
      </Block>
      <Block title="Ownership Breakdown" desc="Free float against closely held stock.">
        {isNum(freeFloat) && isNum(outstanding) && outstanding > 0 ? (
          <Donut centerValue={num(outstanding, 1)} centerLabel="shares out" slices={[
            { name: 'Free float', value: freeFloat, color: 'var(--chart-1)', display: num(freeFloat, 1) },
            { name: 'Closely held / insiders', value: Math.max(outstanding - freeFloat, 0), color: 'var(--primary)', display: num(Math.max(outstanding - freeFloat, 0), 1) },
          ]} />
        ) : gate(a, 'sharesFloat', 'Ownership breakdown', 'No share float breakdown available.')}
      </Block>
      <Block title="Top Shareholders" desc="Largest reported institutional positions.">
        {Array.isArray(inst) && inst.length ? (
          <DataTable headers={[{ label: 'Holder' }, { label: 'Shares', num: true }, { label: 'Value', num: true }, { label: 'Change', num: true }]}
            rows={inst.slice(0, 12).map((h: any) => [
              h.investorName || h.holder || 'n/a',
              isNum(h.sharesNumber) ? h.sharesNumber.toLocaleString('en-US') : 'n/a',
              money(h.marketValue),
              <span key="c" className={toneClass(signClass(h.changeInSharesNumberPercentage))}>{pct(h.changeInSharesNumberPercentage, { already: true, sign: true })}</span>,
            ])} />
        ) : gate(a, 'institutional', 'Top shareholders', 'No institutional holdings reported.')}
      </Block>
    </Card>
  );
}

/* ==========================================================================
   Competitors, and where every figure came from
   ========================================================================== */

export function CompetitorsSection({ a }: { a: Analysis }) {
  const peers = a.peers.peers;
  return (
    <Card id="competitors">
      <CardHead title={`${a.facts.name} Competitors`} />
      {peers.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {peers.map((p: any) => (
            <Link key={p.symbol} href={stockHref(p.symbol)} className="rounded-[10px] border border-border p-3.5 hover:bg-accent">
              <h3 className="mb-2 truncate text-sm font-semibold">{p.name}</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-tiny">
                <dt className="text-muted-foreground">Symbol</dt><dd className="text-right font-semibold">{p.symbol}</dd>
                <dt className="text-muted-foreground">Market cap</dt><dd className="text-right tnum">{money(p.marketCap)}</dd>
                <dt className="text-muted-foreground">P/E</dt><dd className="text-right tnum">{mult(p.pe)}</dd>
              </dl>
            </Link>
          ))}
        </div>
      ) : gate(a, 'peers', 'Competitors', 'No peer list available.')}
    </Card>
  );
}

/*
  Readers are not told where the data comes from, so the per-feed table —
  internal feed names and their status — shows only in operator mode (a key
  set through the hidden `?apikey=` link). Everything else here describes the
  model, not the plumbing.
*/
export function DataStatusSection({ a }: { a: Analysis }) {
  const gated = a.ds.gatedFeeds();
  const t = a.sectorTable;
  const [operator, setOperator] = React.useState(false);
  React.useEffect(() => { setOperator(!!getApiKey()); }, []);
  return (
    <Card id="data-status">
      <CardHead title="Company Analysis and Data Status"
        sub={`Generated ${fmtDate(a.ds.asOf, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${a.ds.source === 'snapshot' ? ' · saved copy' : ''}`} />
      {gated.length ? (
        <Notice className="mb-6">
          <b>Some data is not available for this report.</b> Ratios that depend on it are left out of the averages rather than scored zero,
          so grades stay honest.
        </Notice>
      ) : null}
      {operator ? (
        <Block title="Data Sources" desc="Operator view: each feed this report read. Ratios are trailing twelve month unless stated.">
          <DataTable headers={[{ label: 'Feed' }, { label: 'Status' }, { label: 'Detail' }]} dense rows={Object.entries(a.ds.feeds).map(([name, r]) => [
            name,
            <Pill key="s" tone={r.status === 'ok' ? 'good' : r.status === 'gated' ? 'neutral' : r.status === 'error' ? 'bad' : 'muted'}>{r.fromSnapshot ? 'snapshot' : r.status}</Pill>,
            r.message || (r.fromSnapshot ? 'Served from the saved copy' : ''),
          ])} />
        </Block>
      ) : null}
      <Block title="Analysis Model" desc={`Every ratio is ranked against its sector and scored 0-${MAX_SCORE}; a factor is the mean of its ratios. Ratios are trailing twelve months unless stated.`}>
        <DataTable headers={[{ label: 'Factor' }, { label: 'Ratios', num: true }, { label: 'Graded', num: true }, { label: 'Not assessed', num: true }, { label: 'Grade', num: true }]}
          rows={Object.values(FACTOR_BY_KEY).map((m) => {
            const f = a.scores[m.key];
            return [m.title, String(f.total), String(f.graded), String(f.total - f.graded), <GradePill key="g" score={f.score} letter={f.letter} />];
          })} />
      </Block>
      <Block title="Sector Distributions" desc="Where the rankings on every ratio table come from.">
        <DataTable headers={[{ label: 'Property' }, { label: 'Value' }]} rows={[
          ['Sector', a.facts.sector || 'unknown'],
          ['Table loaded', t.available ? 'yes' : 'no — ratios fall back to peer-relative grading'],
          ['Source', t.quality === 'measured' ? 'measured from listed companies' : t.quality === 'seed' ? 'modelled seed' : 'not loaded'],
          ['Built', t.generatedAt || 'n/a'],
          ['Companies in sector', isNum(t.count) ? t.count.toLocaleString('en-US') : 'n/a'],
        ]} />
      </Block>
    </Card>
  );
}
