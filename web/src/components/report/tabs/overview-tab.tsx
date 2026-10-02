'use client';

/* ==========================================================================
   Maz Vantage — the stock page (Overview)

   The company's front page, laid out against TradingView's symbol page: a
   breadcrumb into the sector, an identity block with the price beside it, a
   full-width chart, then a run of labelled sections — each a flat four-column
   grid of label-over-value rather than a card. Boxes are reserved for real
   objects (the chart, a peer, the flake).

   Not from TradingView: anything the vendor does not give us. Its page
   carries a pre-market print, a community idea stream and a bond ladder;
   FMP supplies none of those, and the coverage note at the foot says so by
   name. Its technicals gauge and seasonality are computed here now, but on
   their own tab, away from the grades.

   And one thing TradingView has no equivalent for: the five factor grades sit
   where its page puts a technicals gauge. Its page answers "what is this
   doing"; this product answers "what is this worth".
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, fmtDate, isNum, money, mult, num, pct, price, titleCase } from '@/lib/format';
import { hasApiKey, logoUrl } from '@/lib/fmp';
import { normalisePrices, type Analysis } from '@/lib/model';
import { FACTOR_KEYS } from '@/lib/factors';
import { MAX_SCORE, letterFor, verdictTone, verdictWord } from '@/lib/grading';
import { SHARIAH_STANDARDS, shariahVerdict } from '@/lib/shariah';
import { MarketChart } from '@/components/market/market-chart';
import { MarketHeading, StoryRow } from '@/components/market/market-ui';
import { LineChart } from '@/components/charts/charts';
import { Snowflake } from '@/components/charts/snowflake';
import { GradePill } from '@/components/report/grade-parts';
import { FeedGate, Notice } from '@/components/report/ui';
import { RelatedResearchCard, useTickerArticles } from '@/components/research/feed-parts';
import { ReportActions } from '@/components/report/report-actions';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

const PEERS = 4;
const STORIES = 5;
const YEARS = 5;
const DASH = '—';

/* ---- the two pieces every section is built from ------------------------- */

/** A label over a value, the unit tucked after it. */
function Stat({ label, value, unit, tone, note }: {
  label: string; value: React.ReactNode; unit?: string | null; tone?: 'up' | 'down' | null; note?: string | null;
}) {
  return (
    <div className="grid min-w-0 gap-[3px] border-t border-border pt-[11px]">
      <span className="text-tiny text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-baseline gap-[5px]">
        <b className={cn('truncate text-[19px] font-semibold tracking-[-.01em] tnum', tone === 'up' && 'text-up', tone === 'down' && 'text-down')}>{value ?? DASH}</b>
        {unit ? <i className="text-micro not-italic text-muted-foreground">{unit}</i> : null}
      </span>
      {note ? <span className="text-micro text-muted-foreground">{note}</span> : null}
    </div>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-4 gap-x-[26px] gap-y-7 max-[1100px]:grid-cols-3 max-md:grid-cols-2 max-md:gap-x-[18px] max-md:gap-y-5">{children}</div>
);

/** A titled section; `onAll` turns the title into the way into its own tab. */
function Section({ title, onAll, blurb, children }: { title: string; onAll?: () => void; blurb?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="grid min-w-0 gap-[18px]">
      <MarketHeading title={title} onClick={onAll} className="mb-0" />
      {blurb ? <p className="-mt-1 max-w-[96ch] text-13 text-muted-foreground">{blurb}</p> : null}
      {children}
    </section>
  );
}

/* ==========================================================================
   The head — above the tab strip
   ========================================================================== */

export function OverviewHead({ a }: { a: Analysis }) {
  const nav = useNav();
  const f = a.facts;
  const overall = a.scores?.overall || ({} as any);
  const up = isNum(f.change) && f.change > 0;
  const down = isNum(f.change) && f.change < 0;
  const [logoFailed, setLogoFailed] = React.useState(false);

  const crumb = (text: string, onClick?: () => void) => (onClick
    ? <button type="button" onClick={onClick} className="hover:text-primary hover:underline">{text}</button>
    : <span>{text}</span>);

  const crumbs = [
    crumb('Markets', () => nav.goView('markets', 'overview')),
    crumb(f.country || 'Stocks', () => nav.goView('markets', 'stocks')),
    f.sector ? crumb(f.sector, () => nav.goView('sectors')) : null,
    f.industry ? crumb(f.industry) : null,
    crumb(f.symbol),
  ].filter(Boolean);

  return (
    <div className="px-6 pb-[18px] pt-5">
      {/* Markets / country / Stocks / sector / industry / symbol — the path
          TradingView prints, over the two fields the profile actually carries. */}
      <nav aria-label="Breadcrumb" className="mb-[18px] flex flex-wrap items-center gap-1.5 text-tiny text-muted-foreground">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <span className={cn(i === crumbs.length - 1 && 'font-semibold text-foreground')}>{c}</span>
            {i < crumbs.length - 1 ? <span className="text-border">/</span> : null}
          </React.Fragment>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-[18px]">
        <span aria-hidden="true" className="relative inline-grid size-[62px] flex-none place-items-center overflow-hidden rounded-full bg-muted text-[15px] font-bold text-muted-foreground max-md:size-12">
          <span>{String(f.symbol || '?').slice(0, 3)}</span>
          {!logoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.image || logoUrl(f.symbol)!} alt="" loading="lazy" decoding="async" onError={() => setLogoFailed(true)}
              className="absolute inset-0 size-full bg-white object-contain p-1.5" />
          ) : null}
        </span>
        <div className="mr-auto min-w-0">
          <h1 className="text-[34px] font-[650] leading-[1.15] tracking-[-.03em] max-md:text-[26px]">{f.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-13 text-muted-foreground">
            <b className="font-semibold text-foreground">{f.symbol}</b>
            <span aria-hidden="true">·</span>
            <span>{f.exchangeFull || f.exchange || 'Listed'}</span>
            {a.execs?.capBand ? (
              <span className="rounded-full border border-border px-[9px] py-0.5 text-micro">{titleCase(a.execs.capBand.label.replace('-', ' '))}</span>
            ) : null}
          </div>
          <ReportActions a={a} className="mt-3" />
        </div>
        <div className="grid gap-0.5">
          <div className="flex flex-wrap items-baseline gap-[7px]">
            <b className="text-[30px] font-[650] tracking-[-.02em] tnum">{isNum(f.price) ? price(f.price, '') : DASH}</b>
            <i className="text-tiny not-italic text-muted-foreground">{f.currency || 'USD'}</i>
            {isNum(f.change) ? (
              <span className={cn('whitespace-pre text-[15px] font-semibold tnum', up && 'text-up', down && 'text-down')}>
                {`${up ? '+' : ''}${dec(f.change, 2)}  ${pct(f.changePct ?? 0, { sign: true })}`}
              </span>
            ) : null}
          </div>
          <p className="text-micro text-muted-foreground">
            {f.quoteTime
              ? `Last trade ${fmtDate(f.quoteTime, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'Delayed quote'}
          </p>
        </div>
        {/* Where TradingView puts a "technicals" dial, this page puts the thing
            it exists to say: the grade, and the word for it. */}
        <button type="button" aria-label="Open the Analysis tab" onClick={() => nav.openAnalysis?.()}
          className="grid flex-none justify-items-center gap-[5px] rounded-[14px] border border-border bg-muted px-5 py-3 hover:bg-accent max-md:px-3.5 max-md:py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[.09em] text-muted-foreground">Maz Vantage score</span>
          <GradePill score={overall.score} letter={letterFor(overall.score)} size="lg" />
          <span className={cn('text-tiny font-semibold', verdictTone(overall.score) === 'good' && 'text-up', verdictTone(overall.score) === 'bad' && 'text-down')}>
            {verdictWord(overall.score) || 'Not rated'}
          </span>
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
   The page — below the tab strip
   ========================================================================== */

/** The bundled dataset's own price history, for the disconnected page. */
function SnapshotChart({ a }: { a: Analysis }) {
  const f = a.facts;
  const points = normalisePrices(a.ds.get('prices'));
  return (
    <div className="rounded-[14px] border border-border px-[18px] py-4">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
        <b className="text-[15px] font-[650]">{f.name} · {f.symbol}</b>
        <span className="text-micro text-muted-foreground">Saved copy — the live chart and its ranges return when live data is available.</span>
      </div>
      {points.length > 1 ? (
        <LineChart height={300} series={points.map((p: any) => ({ date: p.date, value: p.price }))}
          valueFmt={(v) => price(v, curSymbol(f.currency))} labelFmt={(d) => fmtDate(d, { month: 'short', year: '2-digit' })} />
      ) : a.ds.status('prices') !== 'ok' ? <FeedGate a={a} feed="prices" what="Price history" /> : <Notice>No price history in this dataset.</Notice>}
    </div>
  );
}

function ChartSection({ a }: { a: Analysis }) {
  const nav = useNav();
  const f = a.facts;
  const m = a.momentum || {};
  const windows = ([['1 month', m.r1m], ['3 months', m.r3m], ['6 months', m.r6m], ['Year to date', m.rYtd], ['1 year', m.r1y]] as [string, unknown][])
    .filter(([, v]) => isNum(v)) as [string, number][];
  return (
    <section aria-label="Price" className="grid min-w-0">
      {/* The market chart fetches its own series — the right chart with a key,
          no chart at all without one. The bundled snapshot is what a developer
          opens first, so without a key this is the report's own line. */}
      {hasApiKey() ? (
        <div className="rounded-[14px] border border-border px-4">
          <MarketChart height={380} meta={{
            symbol: f.symbol, name: f.name, shortName: f.name, kind: 'stock', currency: f.currency,
            quote: { price: f.price, previousClose: f.previousClose },
          }} />
        </div>
      ) : <SnapshotChart a={a} />}
      <button type="button" onClick={() => nav.goSymbolTab('Technicals', f.symbol)}
        className="mt-2 justify-self-end text-tiny font-semibold text-primary hover:underline">
        Indicators, drawing tools and seasonality on the Technicals tab ›
      </button>
      {windows.length ? (
        <div className="mt-3.5 grid grid-cols-5 gap-px overflow-hidden rounded-xl border border-border bg-border max-md:grid-cols-2">
          {windows.map(([label, value]) => (
            <div key={label} className="grid gap-[3px] bg-background px-4 py-3">
              <span className="text-micro text-muted-foreground">{label}</span>
              <b className={cn('text-base font-semibold tnum', value > 0 && 'text-up', value < 0 && 'text-down')}>{pct(value, { sign: true })}</b>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PeerCard({ p }: { p: any }) {
  const nav = useNav();
  const [failed, setFailed] = React.useState(false);
  return (
    <button type="button" aria-label={`Open ${p.name || p.symbol}`} onClick={() => nav.goSymbol(p.symbol)}
      className="grid gap-3 rounded-xl border border-border bg-background p-3.5 text-left hover:bg-accent">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="relative inline-grid size-8 flex-none place-items-center overflow-hidden rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
          <span>{String(p.symbol).slice(0, 3)}</span>
          {!failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl(p.symbol)!} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 size-full bg-white object-contain p-[3px]" />
          ) : null}
        </span>
        <div className="grid min-w-0 gap-px">
          <strong className="text-13 font-[650]">{p.symbol}</strong>
          <small className="truncate text-micro text-muted-foreground" title={p.name || p.symbol}>{p.name || p.symbol}</small>
        </div>
      </div>
      {/* TradingView prints the day's move here. The peers feed carries no
          change, and quoting four symbols to print one would cost a request
          each — so the card shows the multiple and the size. */}
      <div className="flex items-baseline gap-2 tnum">
        <b className="text-base font-semibold">{isNum(p.price) ? price(p.price, '') : DASH}</b>
        <span className="text-tiny text-muted-foreground">{isNum(p.pe) ? `${mult(p.pe)} P/E` : money(p.marketCap)}</span>
      </div>
    </button>
  );
}

function GradeSection({ a }: { a: Analysis }) {
  const nav = useNav();
  const scores = Object.fromEntries(FACTOR_KEYS.map((k) => [k, a.scores?.[k]?.score]));
  const overall = a.scores?.overall || ({} as any);
  const shariah = SHARIAH_STANDARDS.map((std) => shariahVerdict(a, std));
  const passed = shariah.filter((r) => r.state === 'pass').length;
  return (
    <Section title="Factor grades" onAll={() => nav.openAnalysis?.()}
      blurb={`Each factor is a percentile against the ${a.facts.sector || 'wider'} sector, on a scale of 0 to ${MAX_SCORE}. Click a spoke or a row to open it.`}>
      <div className="grid grid-cols-[280px_minmax(0,1fr)] items-center gap-[26px] rounded-[14px] border border-border p-5 max-[1100px]:grid-cols-1">
        <div className="grid place-items-center max-[1100px]:order-first">
          <Snowflake scores={scores} size={250} onSelect={(ax) => nav.openFactor?.(ax.key)} />
        </div>
        <div className="grid min-w-0 gap-2.5">
          {FACTOR_KEYS.map((k) => {
            const s: any = a.scores?.[k] || {};
            const tone = verdictTone(s.score);
            return (
              <button key={k} type="button" aria-label={`Open the ${s.title || k} tab`} onClick={() => nav.openFactor?.(k)}
                className="grid grid-cols-[130px_minmax(0,1fr)_42px] items-center gap-3 rounded-lg px-1.5 py-1 text-left hover:bg-accent max-md:grid-cols-[112px_minmax(0,1fr)_34px] max-md:gap-2">
                <span className="truncate text-13">{s.title || titleCase(k)}</span>
                <span className="h-[7px] overflow-hidden rounded-full bg-muted">
                  <i className={cn('block h-full rounded-full', tone === 'good' ? 'bg-up' : tone === 'bad' ? 'bg-down' : 'bg-muted-foreground')}
                    style={{ width: `${Math.max(0, Math.min(1, (s.score || 0) / MAX_SCORE)) * 100}%` }} />
                </span>
                <b className="text-right text-13 font-semibold tnum">{isNum(s.score) ? dec(s.score, 1) : DASH}</b>
              </button>
            );
          })}
          <div className="mt-1.5 grid grid-cols-3 gap-[18px] max-md:grid-cols-1 [&_b]:text-base">
            <Stat label="Overall" value={isNum(overall.score) ? dec(overall.score, 2) : DASH} unit={`/ ${MAX_SCORE}`} />
            <Stat label="Shariah screens" value={`${passed} of ${shariah.length}`} note="standards passed" />
            <Stat label="Sector" value={a.facts.sector || 'Unclassified'} note={`graded against ${a.sectorTable?.count || 0} peers`} />
          </div>
        </div>
      </div>
    </Section>
  );
}

/** The financial history, as bars over the annual series the report derives. */
function FinancialsSection({ a }: { a: Analysis }) {
  const nav = useNav();
  const rows = (a.series?.rows || []).filter((r: any) => isNum(r.revenue)).slice(-YEARS);
  if (rows.length < 2) return null;
  const peak = Math.max(...rows.map((r: any) => Math.max(r.revenue || 0, Math.abs(r.netIncome || 0))));
  const height = (v: unknown) => (peak > 0 && isNum(v) ? `${Math.max(1, (Math.abs(v) / peak) * 100)}%` : '0%');
  const last = rows[rows.length - 1];
  return (
    <Section title="Financials" onAll={() => nav.goSymbolTab('Financials', a.facts.symbol)}>
      <div className="grid h-[210px] auto-cols-[minmax(0,1fr)] grid-flow-col items-end gap-[18px] border-b border-border pb-2 max-md:h-40 max-md:gap-2.5">
        {rows.map((r: any) => (
          <div key={r.year} className="grid h-full min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-2">
            <div className="flex h-full items-end justify-center gap-1.5">
              <span title={`Revenue ${money(r.revenue)}`} className="block min-h-0.5 w-[26px] rounded-t bg-primary max-md:w-4" style={{ height: height(r.revenue) }} />
              <span title={`Net income ${money(r.netIncome)}`} className={cn('block min-h-0.5 w-[26px] rounded-t max-md:w-4', (r.netIncome || 0) < 0 ? 'bg-down' : 'bg-up')} style={{ height: height(r.netIncome) }} />
            </div>
            <span className="text-center text-micro text-muted-foreground">{r.year}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-[18px] text-micro text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-primary" />Revenue</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-up" />Net income</span>
      </div>
      <Grid>
        <Stat label="Revenue, latest year" value={money(last?.revenue)} unit={a.facts.currency} />
        <Stat label="Net income, latest year" value={money(last?.netIncome)} unit={a.facts.currency} />
        <Stat label="Net margin" value={pct(a.facts.netMargin, { dp: 1 })} />
        <Stat label="Free cash flow (TTM)" value={money(a.facts.fcf)} unit={a.facts.currency} />
      </Grid>
    </Section>
  );
}

/** Our own research on this company. The article store loads separately and
    the page must not wait for it; the slot stays absent when nothing is filed. */
function ResearchSlot({ a }: { a: Analysis }) {
  const sym = a.facts?.symbol;
  const rows = useTickerArticles(sym, 4);
  if (!rows?.length) return null;
  return (
    <div className="grid grid-cols-12 gap-6">
      <RelatedResearchCard articles={rows} span={12} title={`Maz Vantage research on ${a.facts?.name || sym}`} />
    </div>
  );
}

export function OverviewTab({ a }: { a: Analysis }) {
  const nav = useNav();
  const f = a.facts;
  const q = a.quarter || {};
  const next = a.forecast?.rows?.find((r: any) => r.year >= new Date().getUTCFullYear()) || null;
  const peers = (a.peers?.peers || []).filter((p: any) => p.symbol).slice(0, PEERS);
  const empRows = a.employees?.rows || [];
  const latestEmp = empRows[empRows.length - 1];
  const priorEmp = empRows[empRows.length - 2];
  const empChange = latestEmp && priorEmp && isNum(latestEmp.count) && isNum(priorEmp.count) ? latestEmp.count - priorEmp.count : null;
  const m = a.momentum || {};
  const words = ['Strong sell', 'Sell', 'Hold', 'Buy', 'Strong buy'];
  const consensus = isNum(m.analystScore) ? words[Math.max(0, Math.min(4, Math.round(m.analystScore) - 1))] : null;
  const site = f.website ? String(f.website).replace(/^https?:\/\//, '').replace(/\/$/, '') : null;
  const stories = (a.news?.articles || []).slice(0, STORIES);
  // The one symbol this page is already about, so the tick carries its move
  // without a request: the quote is in `facts`.
  const quotes = new Map([[String(f.symbol).toUpperCase(), { changesPercentage: isNum(f.changePct) ? f.changePct * 100 : null }]]);

  return (
    <div className="grid gap-[58px] pt-2.5 max-md:gap-[42px]">
      <ChartSection a={a} />

      {peers.length ? (
        <Section title={`Compare with ${f.name}`}>
          <div className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2">
            {peers.map((p: any) => <PeerCard key={p.symbol} p={p} />)}
          </div>
        </Section>
      ) : null}

      <GradeSection a={a} />

      <Section title="Key stats" onAll={() => nav.openAnalysis?.()}>
        <Grid>
          <Stat label="Market capitalisation" value={money(f.marketCap)} unit={f.currency} />
          <Stat label="Dividend yield (TTM)" value={pct(f.dividendYield, { dp: 2 })} />
          <Stat label="Price to earnings (TTM)" value={mult(f.pe)} />
          <Stat label="Earnings per share (TTM)" value={isNum(f.eps) ? dec(f.eps, 2) : DASH} unit={f.currency} />
          <Stat label="Net income (TTM)" value={money(f.netIncome)} unit={f.currency} />
          <Stat label="Revenue (TTM)" value={money(f.revenue)} unit={f.currency} />
          <Stat label="Shares outstanding" value={isNum(f.shares) ? num(f.shares, 2) : DASH} />
          <Stat label="Beta" value={dec(f.beta, 2)} />
          <Stat label="52-week range" value={isNum(f.yearLow) && isNum(f.yearHigh) ? `${dec(f.yearLow, 2)} – ${dec(f.yearHigh, 2)}` : DASH} unit={f.currency} />
          <Stat label="Day range" value={isNum(f.dayLow) && isNum(f.dayHigh) ? `${dec(f.dayLow, 2)} – ${dec(f.dayHigh, 2)}` : DASH} unit={f.currency} />
          <Stat label="Volume" value={isNum(f.volume) ? num(f.volume, 1) : DASH} />
          <Stat label="Price to book" value={mult(f.pb)} />
        </Grid>
      </Section>

      {q.next || q.available || next ? (
        <Section title="Upcoming earnings" onAll={() => nav.goSymbolTab('Analysts Forecast', f.symbol)}>
          <Grid>
            <Stat label="Next report date" value={q.next ? fmtDate(q.next, { day: 'numeric', month: 'long', year: 'numeric' }) : DASH} />
            <Stat label="Last reported" value={q.date ? fmtDate(q.date, { day: 'numeric', month: 'short', year: 'numeric' }) : DASH} />
            <Stat label="EPS estimate" value={isNum(next?.eps) ? dec(next.eps, 2) : DASH} unit={f.currency} note={next?.analystsEps ? `${next.analystsEps} analysts` : null} />
            <Stat label="Revenue estimate" value={money(next?.revenue)} unit={f.currency} note={next?.analystsRevenue ? `${next.analystsRevenue} analysts` : null} />
            <Stat label="Last EPS surprise" value={isNum(q.epsSurprise) ? pct(q.epsSurprise, { sign: true, dp: 1 }) : DASH}
              tone={isNum(q.epsSurprise) ? (q.epsSurprise >= 0 ? 'up' : 'down') : null} />
            <Stat label="Last revenue surprise" value={isNum(q.revenueSurprise) ? pct(q.revenueSurprise, { sign: true, dp: 1 }) : DASH}
              tone={isNum(q.revenueSurprise) ? (q.revenueSurprise >= 0 ? 'up' : 'down') : null} />
          </Grid>
        </Section>
      ) : null}

      {latestEmp || isNum(f.employees) ? (
        <Section title="Employees">
          <Grid>
            <Stat label="Employees" value={isNum(latestEmp?.count) ? num(latestEmp.count, 0) : (isNum(f.employees) ? num(f.employees, 0) : DASH)}
              note={latestEmp?.year ? `FY ${latestEmp.year}` : 'latest filing'} />
            <Stat label="Change on the year" value={isNum(empChange) ? `${empChange > 0 ? '+' : ''}${num(empChange, 0)}` : DASH}
              tone={isNum(empChange) ? (empChange > 0 ? 'up' : empChange < 0 ? 'down' : null) : null}
              note={isNum(empChange) && priorEmp?.count ? pct(empChange / priorEmp.count, { sign: true, dp: 1 }) : null} />
            <Stat label="Revenue per employee" value={money(latestEmp?.revenuePerHead)} unit={f.currency} />
            <Stat label="Profit per employee" value={money(latestEmp?.profitPerHead)} unit={f.currency} />
          </Grid>
        </Section>
      ) : null}

      <FinancialsSection a={a} />

      {/* The vendor's consensus, kept clearly separate from our own grade: two
          different opinions, and a reader who conflates them is being misled. */}
      {isNum(m.analystScore) || isNum(m.targetPrice) ? (
        <Section title="Analyst consensus" onAll={() => nav.goSymbolTab('Ratings', f.symbol)}
          blurb="The analyst consensus and price target. This is the sell side’s view, not the Maz Vantage score above it.">
          <Grid>
            <Stat label="Consensus" value={consensus || DASH} note={m.analystTotal ? `${m.analystTotal} ratings` : null} />
            <Stat label="Average price target" value={isNum(m.targetPrice) ? price(m.targetPrice, '') : DASH} unit={f.currency} />
            <Stat label="Implied upside" value={isNum(m.targetUpside) ? pct(m.targetUpside, { sign: true, dp: 1 }) : DASH}
              tone={isNum(m.targetUpside) ? (m.targetUpside >= 0 ? 'up' : 'down') : null} />
            <Stat label="Cost of equity (CAPM)" value={pct(m.costOfEquity, { dp: 1 })} />
          </Grid>
        </Section>
      ) : null}

      <Section title="Company info">
        <Grid>
          <Stat label="Sector" value={f.sector || DASH} />
          <Stat label="Industry" value={f.industry || DASH} />
          <Stat label="CEO" value={f.ceo || DASH} />
          <Stat label="Website" value={site || DASH} />
          <Stat label="Headquarters" value={f.address ? f.address.split(',').slice(1, 3).join(',').trim() || f.country : (f.country || DASH)} />
          <Stat label="Listed since" value={f.ipoDate ? fmtDate(f.ipoDate, { day: 'numeric', month: 'short', year: 'numeric' }) : DASH} />
          <Stat label="ISIN" value={f.isin || DASH} />
          <Stat label="CIK" value={f.cik || DASH} />
        </Grid>
        {f.description ? <p className="mt-1 max-w-[92ch] text-13 leading-[1.65] text-muted-foreground">{f.description}</p> : null}
      </Section>

      {stories.length ? (
        <Section title="News" onAll={() => nav.goSymbolTab('News', f.symbol)}>
          <div className="border-t border-border">
            {stories.map((item: any, i: number) => (
              <StoryRow key={item.url || i} quotes={quotes} item={{
                title: item.title, url: item.url, date: item.date, source: item.source, text: item.text, image: item.image,
                marks: [{ symbol: f.symbol, shortName: f.symbol, kind: 'stock' }],
              }} />
            ))}
          </div>
        </Section>
      ) : null}

      <ResearchSlot a={a} />

      {/* The standing rule: a surface says what it cannot measure. Everything
          named is on the reference page and absent here because the vendor
          does not supply it — not because it was forgotten. */}
      <details className="rounded-xl border border-border px-4 py-3">
        <summary className="cursor-pointer text-13 font-semibold">What this page does not show</summary>
        <div className="mt-2 grid gap-2 text-13 leading-relaxed text-muted-foreground">
          <p>Pre- and post-market prints, an order book and per-exchange volume: the quote is one consolidated, delayed print.</p>
          <p>
            A technical-rating gauge on this page: the grades above read the accounts against the sector, and a chart signal printed beside them would
            be read as part of them. The technical summary, pivots, candlestick patterns, a study chart and seasonality are on the{' '}
            <button type="button" onClick={() => nav.goSymbolTab('Technicals', f.symbol)} className="font-semibold text-primary hover:underline">Technicals tab</button>,
            kept apart and labelled as the price series alone.
          </p>
          <p>Community ideas and discussion: there is no such feed, and an empty one would be worse than none.</p>
          <p>The bond ladder and the funds holding the stock: not fetched for the company report.</p>
        </div>
      </details>
    </div>
  );
}
