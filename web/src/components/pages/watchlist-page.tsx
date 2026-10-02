'use client';

/* ==========================================================================
   Maz Vantage — Watchlists (`/watchlist`)

   A reader's own lists of companies, in the screener's dense table and its
   column sets. The table owns sorting, paging and per-company loading; this
   page owns which companies are in it, and the blocks around it: health
   score, movers, dividends, allocation, calendar and purification.

   - **Rows**: `batch-quote` takes fifty symbols per request and carries the
     whole Overview tab, free. Everything else is per company and bought.
   - **Maz Vantage Quant**: the lite composite, ranked against the company's own
     sector — which is why the column costs a profile as well as the ratios.
   - **Position sizes** live in one `holdings` map per list. A size is never
     invented: an unsized list is counted, and **nothing weights by value on a
     partial list** — the blocks say which basis they are on.
   - **Storage**: the one store every surface shares (`lib/watchlists.ts`),
     under `mazvantage.watchlists` — the list this page has open is the one
     the market rail shows and every star adds to. Every read and write is
     wrapped, so a private window shows an empty list and a working page.
   ========================================================================== */

import * as React from 'react';
import { dec, isNum } from '@/lib/format';
import { fetchBatchQuotes, logoUrl } from '@/lib/fmp';
import { MAX_SCORE, letterFor, loadSectorStats, sectorLookup, toneForLetter } from '@/lib/grading';
import { scoreLite } from '@/lib/model';
import { SCREENER_COLUMN_SETS, fillBags, newTableState, type Cell, type ColumnSet, type TableState } from '@/lib/market-table';
import { MarketTable } from '@/components/market/market-table';
import { EmptyState } from '@/components/market/market-ui';
import { Donut } from '@/components/charts/charts';
import { GradeBar, GradePill } from '@/components/report/grade-parts';
import { Logo } from '@/components/report/ui';
import { PageFrame, useHasKey } from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { newId } from '@/lib/local-store';
import { HoldingsBlock, PerformanceBlock } from '@/components/portfolio/portfolio-blocks';
import {
  cleanSymbol, isSymbol, sharesHeld, useWatchlists, writeStore, type Holding, type WatchList, type WatchStore,
} from '@/lib/watchlists';
import { cn } from '@/lib/cn';

/* ---------- the store ------------------------------------------------------------- */

type List = WatchList;
type Store = WatchStore;

/* ---------- the Maz Vantage Quant column ------------------------------------------------ */

function liteFor(row: any, stats: any) {
  const bags = row.bags;
  if (!stats || !bags?.ratios || !bags?.metrics) return null;
  const lookup = sectorLookup(stats, bags.profile?.sector || null);
  if (!lookup.available) return null;
  return scoreLite(bags, lookup);
}
const quantScore = (row: any, stats: any) => { const l = liteFor(row, stats); return isNum(l?.score) ? l.score : null; };

const NA: Cell = { text: 'n/a', tone: 'na' };
const compact = (v: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v);

/** The screener's sets, with Overview carrying the score — which makes it a bought tab. */
function columnSets(stats: any): ColumnSet[] {
  const quote: ColumnSet = {
    key: 'overview', label: 'Overview', bags: ['profile', 'ratios', 'metrics'],
    columns: [
      { key: 'marketCap', label: 'Market cap', num: true, get: (r) => r.marketCap, fmt: (v) => (isNum(v) ? `US$${compact(v)}` : NA) },
      { key: 'price', label: 'Price', num: true, get: (r) => r.price, fmt: (v) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : NA) },
      { key: 'changePercentage', label: 'Day', num: true, get: (r) => r.changePercentage,
        fmt: (v) => (isNum(v) ? { text: `${v > 0 ? '+' : ''}${v.toFixed(2)}%`, tone: v > 0 ? 'pos' : v < 0 ? 'neg' : '' } : NA) },
      { key: 'volume', label: 'Volume', num: true, get: (r) => r.volume, fmt: (v) => (isNum(v) ? compact(v) : NA) },
      { key: 'turnover', label: 'Traded value', num: true, get: (r) => (isNum(r.volume) && isNum(r.price) ? r.volume * r.price : null), fmt: (v) => (isNum(v) ? `US$${compact(v)}` : NA) },
      { key: 'quant', label: 'Maz Vantage Quant', num: true, get: (r) => quantScore(r, stats), fmt: () => NA,
        render: (v) => (isNum(v) ? <GradePill score={v} letter={letterFor(v)} /> : <span className="text-muted-foreground/70">n/a</span>) },
      { key: 'sector', label: 'Sector', get: (r) => r.bags?.profile?.sector, fmt: (v) => v || NA },
      { key: 'exchange', label: 'Exchange', get: (r) => r.exchange, fmt: (v) => v || NA },
    ],
  };
  return SCREENER_COLUMN_SETS.map((set) => (set.key === 'overview' ? quote : set));
}

/* ---------- sizes ------------------------------------------------------------------ */

/** Lots once there are lots, the single figure otherwise — see `sharesHeld`. */
const sharesOf = (list: List, symbol: string) => sharesHeld(list.holdings?.[symbol]);
const valueOf = (list: List, row: any) => { const s = sharesOf(list, row.symbol); return isNum(s) && isNum(row.price) ? s * row.price : null; };

/** How much of the list is sized. Nothing weights by value on a partial list. */
function sizing(list: List, rows: any[]) {
  const sized = rows.filter((r) => isNum(valueOf(list, r)));
  const total = sized.reduce((a, r) => a + (valueOf(list, r) as number), 0);
  return { sized: sized.length, total: rows.length, value: total > 0 ? total : null, basis: sized.length === 0 ? 'count' : sized.length === rows.length ? 'value' : 'partial' };
}

const money0 = (v: unknown) => (isNum(v) ? `US$${Math.round(v).toLocaleString('en-US')}` : 'n/a');
const money2 = (v: unknown) => (isNum(v) ? `US$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'n/a');
const pctText = (v: unknown, dp = 2) => (isNum(v) ? `${(v * 100).toFixed(dp)}%` : 'n/a');
const signedPct = (v: unknown, dp = 2) => (isNum(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%` : 'n/a');

/* ---------- small furniture ------------------------------------------------------------ */

function Block({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-3 border-t border-border pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[26px] font-bold tracking-[-.025em]">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}
const Desc = ({ children }: { children: React.ReactNode }) => <p className="max-w-[100ch] text-13 leading-relaxed text-muted-foreground">{children}</p>;
const Ticker = ({ row, onOpen }: { row: any; onOpen: (s: string) => void }) =>
  <button type="button" title={row.companyName || row.symbol} onClick={() => onOpen(row.symbol)} className="font-bold hover:text-primary">{row.symbol}</button>;

function Toggle<T extends string>({ items, value, onChange }: { items: { id: T; label: string; blocked?: string | null }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-accent p-1">
      {items.map((i) => (
        <button key={i.id} type="button" aria-pressed={value === i.id} disabled={!!i.blocked} title={i.blocked || undefined} onClick={() => onChange(i.id)}
          className={cn('rounded-full px-3 py-1 text-13 font-semibold text-muted-foreground', value === i.id && 'bg-background text-foreground shadow-sm', i.blocked && 'cursor-not-allowed opacity-50')}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

function Consent({ label, bags, rows, onDone }: { label: string; bags: string[]; rows: any[]; onDone: () => void }) {
  const [progress, setProgress] = React.useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={progress !== null} onClick={async () => {
        setProgress('');
        await fillBags(rows, bags, (done, total) => setProgress(` ${done} of ${total}…`));
        setProgress(null);
        onDone();
      }}>{progress !== null ? 'Loading…' : label}</Button>
      {progress ? <span aria-live="polite" className="text-tiny text-muted-foreground">{progress}</span> : null}
    </div>
  );
}

/* ==========================================================================
   The health score — equal weight, stated; unscored holdings left out of the
   mean rather than counted as zero, and the card prints how many it averaged.
   ========================================================================== */

const HEALTH_FACTORS: [string, string][] = [['valuation', 'Valuation'], ['growth', 'Growth'], ['health', 'Financial Health'], ['profitability', 'Profitability'], ['momentum', 'Momentum']];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function HealthBlock({ list, rows, stats }: { list: List; rows: any[]; stats: any }) {
  const lites = rows.map((r) => liteFor(r, stats));
  const scored = lites.filter((l: any) => isNum(l?.score)) as any[];
  const score = mean(scored.map((l) => l.score));
  const factors = HEALTH_FACTORS.map(([key, title]) => ({ key, title, score: mean(lites.map((l: any) => l?.factors?.[key]?.score).filter(isNum)) }));
  // Every surface printing a lite score prints how many ratios it was built from.
  const counts = scored.map((l) => l.scoredOn).filter(isNum);
  const ratios = counts.length ? { min: Math.min(...counts), max: Math.max(...counts) } : null;

  if (!isNum(score)) {
    return (
      <Block id="watchlist-health" title="Health score">
        <Desc>{stats
          ? `Nothing in ${list.name} is scored yet. The composite ranks a company against its own sector, which costs a profile, a ratios call and a metrics call each — load them from the table below and the score fills in here.`
          : 'Loading the sector distributions the score ranks against…'}</Desc>
      </Block>
    );
  }
  const missing = factors.filter((f) => !isNum(f.score));
  const names = missing.map((f) => f.title);
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return (
    <Block id="watchlist-health" title="Health score" aside={<GradePill score={score} letter={letterFor(score)} size="lg" />}>
      <Desc>
        The mean Maz Vantage Quant across this list — every holding weighted equally, whatever it is worth. Averaged over {scored.length} of {rows.length}{' '}
        {rows.length === 1 ? 'holding' : 'holdings'}
        {scored.length < rows.length ? ', and the rest are left out rather than counted as a zero, so the score is not dragged down by a feed that did not land.' : ' — the whole list.'}
        {ratios ? ` Each holding was scored on ${ratios.min === ratios.max ? `${ratios.min} ratios` : `${ratios.min}–${ratios.max} ratios`}.` : ''}
      </Desc>
      <div className="flex items-baseline gap-1"><b className="text-4xl font-bold tnum">{dec(score, 2)}</b><i className="text-sm not-italic text-muted-foreground">/{MAX_SCORE}</i></div>
      <GradeBar tone={toneForLetter(letterFor(score))} share={(score / MAX_SCORE) * 100} />
      <p className="mt-2 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">Each factor, averaged across the same holdings</p>
      <div className="grid max-w-3xl gap-2">
        {factors.map((f) => (
          <div key={f.key} className="grid grid-cols-[150px_1fr_auto] items-center gap-4">
            <span className="text-13 font-semibold">{f.title}</span>
            <GradeBar tone={toneForLetter(letterFor(f.score))} share={isNum(f.score) ? (f.score / MAX_SCORE) * 100 : 0} className="mt-0 h-2 rounded" />
            <GradePill score={f.score} letter={letterFor(f.score)} />
          </div>
        ))}
      </div>
      {/* The factors this page cannot reach, named: Growth and Momentum need
          feeds the watchlist never buys, so a dash there is a boundary, not a gap. */}
      {missing.length ? (
        <p className="max-w-[100ch] text-tiny text-muted-foreground">
          {joined} {names.length === 1 ? 'is' : 'are'} blank because this page buys three feeds per company and neither a fiscal-year growth record nor a
          year of prices is among them. The score above is a mean of the ratios that did compute, so it is a reading of the other {5 - names.length}{' '}
          factors rather than of all five. A company’s own report grades every one.
        </p>
      ) : null}
      <p className="max-w-[100ch] text-tiny text-muted-foreground">
        The five rows do not average to the score above: the score is the mean of every ratio that graded, and the factors do not hold the same number of
        ratios each. This is the reduced composite the screens use — a handful of ratios per factor against the company’s own sector distribution, not the
        77 a company’s own Ratings tab grades. It is a reading of the list, not a recommendation about it.
      </p>
    </Block>
  );
}

/* ==========================================================================
   1. Gainers and losers — the one block that costs nothing
   ========================================================================== */

function MoversBlock({ list, rows, onOpen }: { list: List; rows: any[]; onOpen: (s: string) => void }) {
  const moved = rows.filter((r) => isNum(r.changePercentage));
  if (!moved.length) {
    return (
      <Block id="watchlist-movers" title="Gainers and losers">
        <Desc>No quotes came back with a day’s move for this list, so there is nothing to rank. The day’s change arrives with the prices — if it is missing here it is missing from the table too.</Desc>
      </Block>
    );
  }
  const up = moved.filter((r) => r.changePercentage > 0).sort((a, b) => b.changePercentage - a.changePercentage);
  const down = moved.filter((r) => r.changePercentage < 0).sort((a, b) => a.changePercentage - b.changePercentage);
  const flat = moved.length - up.length - down.length;
  const size = sizing(list, rows);
  const meanMove = moved.reduce((a, r) => a + r.changePercentage, 0) / moved.length;
  /* The value-weighted move exists only where every holding is sized — a
     partial list would weight the sized names as if the rest were worth nothing. */
  const weighted = size.basis === 'value' && size.value
    ? rows.reduce((a, r) => { const v = valueOf(list, r); return isNum(v) && isNum(r.changePercentage) ? a + (v / size.value!) * r.changePercentage : a; }, 0) : null;
  const dayMoney = isNum(weighted) && isNum(size.value) ? size.value * (weighted / 100) : null;
  const Column = ({ title, items, tone }: { title: string; items: any[]; tone: 'up' | 'down' }) => (
    <div>
      <p className="mb-2 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{title}</p>
      {items.length ? (
        <ul className="grid">
          {items.slice(0, 5).map((r) => (
            <li key={r.symbol} className="grid grid-cols-[64px_minmax(0,1fr)_auto_72px] items-center gap-3 border-b border-border py-2 text-13 tnum last:border-b-0">
              <Ticker row={r} onOpen={onOpen} />
              <span className="truncate text-muted-foreground" title={r.companyName || ''}>{r.companyName || ''}</span>
              <span>{money2(r.price)}</span>
              <span className={cn('text-right font-semibold', tone === 'up' ? 'text-up' : 'text-down')}>{signedPct(r.changePercentage)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-13 text-muted-foreground">{title === 'Gainers' ? 'Nothing in this list is up today.' : 'Nothing in this list is down today.'}</p>}
    </div>
  );
  return (
    <Block id="watchlist-movers" title="Gainers and losers">
      <Desc>
        {up.length} up, {down.length} down{flat ? `, ${flat} unchanged` : ''}. The list averages {signedPct(meanMove)} today, counting every holding once
        {isNum(weighted) ? `; weighted by what you hold it is ${signedPct(weighted)}, or ${money0(dayMoney)}.`
          : size.basis === 'partial' ? `. ${size.sized} of ${size.total} holdings are sized, so there is no figure for what the money did — a weighted average over part of a list would treat the rest as worth nothing.`
            : '. Enter shares held under Asset allocation to see what the money did.'}
      </Desc>
      <div className="grid gap-8 md:grid-cols-2"><Column title="Gainers" items={up} tone="up" /><Column title="Losers" items={down} tone="down" /></div>
    </Block>
  );
}

/* ==========================================================================
   2. Dividends — off the ratios the Overview tab already buys
   ========================================================================== */

/** The dividend a share paid over the trailing year. */
function dividendPerShare(row: any) {
  const ratios = row.bags?.ratios;
  if (!ratios) return null;
  if (isNum(ratios.dividendPerShareTTM)) return Number(ratios.dividendPerShareTTM);
  if (isNum(ratios.dividendYieldTTM) && isNum(row.price)) return Number(ratios.dividendYieldTTM) * row.price;
  return null;
}

function DividendsBlock({ list, rows, onOpen }: { list: List; rows: any[]; onOpen: (s: string) => void }) {
  const ready = rows.filter((r) => r.bags?.ratios);
  if (!ready.length) {
    return <Block id="watchlist-dividends" title="Dividends"><Desc>The payment and the yield come off the same ratios feed the Overview tab buys — load it from the table above and this fills in. Nothing extra is requested for it.</Desc></Block>;
  }
  const size = sizing(list, rows);
  const priced = ready.map((row) => {
    const dps = dividendPerShare(row);
    const r = row.bags.ratios;
    const yieldPct = isNum(Number(r.dividendYieldTTM)) ? Number(r.dividendYieldTTM) : isNum(dps) && isNum(row.price) && row.price > 0 ? dps / row.price : null;
    const shares = sharesOf(list, row.symbol);
    return { row, dps, yieldPct, shares, income: isNum(dps) && isNum(shares) ? dps * shares : null };
  }).sort((a, b) => (b.yieldPct ?? -1) - (a.yieldPct ?? -1));
  const payers = priced.filter((p) => isNum(p.dps) && p.dps > 0);
  const income = payers.map((p) => p.income).filter(isNum);
  const totalIncome = income.length ? income.reduce((a, b) => a + b, 0) : null;
  // Only where every holding is sized, for the same reason the weighted move is.
  const portfolioYield = size.basis === 'value' && isNum(totalIncome) && size.value ? totalIncome / size.value : null;
  const ys = payers.map((p) => p.yieldPct).filter(isNum);
  const avgYield = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
  return (
    <Block id="watchlist-dividends" title="Dividends">
      <Desc>
        {payers.length} of {ready.length} {ready.length === 1 ? 'holding pays' : 'holdings pay'} a dividend. Everything here is the trailing twelve months as
        filed — what was actually paid, not what is forecast.{isNum(avgYield) ? ` The payers average ${pctText(avgYield)}, counting each once.` : ''}
      </Desc>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-collapse text-13 tnum">
          <thead><tr className="border-b border-border text-micro uppercase tracking-[.05em] text-muted-foreground">
            <th className="py-2 text-left font-medium">Holding</th><th className="px-3 py-2 text-right font-medium">Yield (TTM)</th><th className="px-3 py-2 text-right font-medium">Per share</th>
            <th className="px-3 py-2 text-right font-medium">Shares</th><th className="py-2 pl-3 text-right font-medium">Income a year</th>
          </tr></thead>
          <tbody>
            {priced.map((p) => (
              <tr key={p.row.symbol} className={cn('border-b border-border', !(isNum(p.dps) && p.dps > 0) && 'text-muted-foreground')}>
                <td className="py-2"><Ticker row={p.row} onOpen={onOpen} /> <span className="text-tiny text-muted-foreground">{p.row.companyName || ''}</span></td>
                <td className="px-3 py-2 text-right">{isNum(p.yieldPct) && p.yieldPct > 0 ? pctText(p.yieldPct) : '—'}</td>
                <td className="px-3 py-2 text-right">{isNum(p.dps) && p.dps > 0 ? money2(p.dps) : '—'}</td>
                <td className="px-3 py-2 text-right">{isNum(p.shares) ? p.shares.toLocaleString('en-US') : '—'}</td>
                <td className="py-2 pl-3 text-right">{isNum(p.income) ? <strong>{money2(p.income)}</strong> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-baseline gap-3 rounded-xl bg-muted px-4 py-3">
        <span className="text-13 text-muted-foreground">Income a year</span>
        <strong className="text-xl tnum">{income.length ? money2(totalIncome) : '—'}</strong>
        <span className="text-tiny text-muted-foreground">
          {income.length ? `across ${income.length} sized ${income.length === 1 ? 'holding' : 'holdings'}${isNum(portfolioYield) ? ` · ${pctText(portfolioYield)} on what the list is worth` : ''}`
            : 'enter shares held under Asset allocation to turn the yields into money'}
        </span>
      </div>
    </Block>
  );
}

/* ==========================================================================
   3. Asset allocation — by holding, or by value once every holding is sized
   ========================================================================== */

const SECTOR_COLORS = ['var(--chart-1)', 'var(--chart-4)', 'var(--chart-2)', 'var(--chart-5)', 'var(--chart-3)', 'var(--chart-6)', 'var(--up)', 'var(--warning)', 'var(--down)', 'var(--primary)', 'var(--muted-foreground)'];

function AllocationBlock({ list, rows, onOpen, setShares }: { list: List; rows: any[]; onOpen: (s: string) => void; setShares: (symbol: string, v: number | null) => void }) {
  const [basisPick, setBasis] = React.useState<'count' | 'value'>('count');
  const [sizesOpen, setSizesOpen] = React.useState(false);
  const known = rows.filter((r) => r.bags?.profile?.sector);
  const size = sizing(list, rows);
  // A list that stops being fully sized cannot stay on the value basis.
  const basis = basisPick === 'value' && size.basis !== 'value' ? 'count' : basisPick;
  const toggle = (
    <Toggle value={basis} onChange={setBasis} items={[
      { id: 'count', label: 'By holding' },
      { id: 'value', label: 'By value', blocked: size.basis !== 'value' ? `Weighting by value needs a size on every holding — ${size.sized} of ${size.total} have one.` : null },
    ]} />
  );
  const note = known.length
    ? (basis === 'value'
      ? `Where the money sits. ${money0(size.value)} across ${size.total} holdings, each weighted by what it is worth today.`
      : `How many holdings sit in each sector — every one counted once, whatever it is worth.${size.basis === 'value' ? ' Switch to By value to weight them by what you hold.'
        : size.basis === 'partial' ? ` ${size.sized} of ${size.total} holdings are sized; enter the rest below to weight this by value.` : ' Enter shares held below to weight this by value instead.'}`)
    : 'The sector comes off the same profile feed the Overview tab buys — load it from the table above and this fills in. Nothing extra is requested for it.';

  const bySector = new Map<string, { name: string; value: number; names: string[] }>();
  for (const row of known) {
    const weight = basis === 'value' ? valueOf(list, row) : 1;
    if (!isNum(weight)) continue;
    const cell = bySector.get(row.bags.profile.sector) || { name: row.bags.profile.sector as string, value: 0, names: [] as string[] };
    cell.value += weight;
    cell.names.push(row.symbol);
    bySector.set(cell.name, cell);
  }
  const slices = [...bySector.values()].sort((a, b) => b.value - a.value).map((s, i) => ({
    ...s, color: SECTOR_COLORS[i % SECTOR_COLORS.length], display: basis === 'value' ? money0(s.value) : `${s.value} ${s.value === 1 ? 'holding' : 'holdings'}`,
  }));
  const total = slices.reduce((a, s) => a + s.value, 0);
  const unknown = rows.length - known.length;

  return (
    <Block id="watchlist-allocation" title="Asset allocation" aside={known.length ? toggle : null}>
      <Desc>{note}</Desc>
      {known.length ? (
        <>
          <div className="grid items-center gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
            <Donut slices={slices} size={220} centerValue={String(slices.length)} centerLabel={slices.length === 1 ? 'sector' : 'sectors'} />
            <ul className="grid">
              {slices.map((s) => (
                <li key={s.name} className="grid grid-cols-[12px_minmax(0,160px)_minmax(0,1fr)_60px] items-center gap-3 border-b border-border py-2 text-13 last:border-b-0">
                  <span className="size-3 rounded-sm" style={{ background: s.color }} />
                  <span className="font-semibold">{s.name}</span>
                  <span className="truncate text-tiny text-muted-foreground">{s.names.join(', ')}</span>
                  <span className="text-right tnum">{pctText(s.value / total, 1)}</span>
                </li>
              ))}
            </ul>
          </div>
          {unknown ? (
            <p className="text-tiny text-muted-foreground">
              {unknown} of {rows.length} {unknown === 1 ? 'holding has' : 'holdings have'} no sector on file and {unknown === 1 ? 'is' : 'are'} left out of the split
              rather than filed under Other — an invented sector would move every share above it.
            </p>
          ) : null}
        </>
      ) : null}
      <details open={sizesOpen} onToggle={(e) => setSizesOpen((e.target as HTMLDetailsElement).open)} className="rounded-xl border border-border px-4 py-3">
        <summary className="cursor-pointer text-13 font-semibold">Shares held</summary>
        <p className="mt-2 text-tiny text-muted-foreground">
          Kept in this browser with the list itself, and used by the day’s move, the dividend income and the allocation above. Leave a holding blank and it
          is counted rather than weighted — nothing here is estimated for you.
        </p>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
          {rows.map((row) => (
            <SharesField key={row.symbol} row={row} value={list.holdings[row.symbol]?.shares ?? null} onOpen={onOpen} onCommit={(v) => setShares(row.symbol, v)}
              lots={list.holdings[row.symbol]?.lots?.length || 0} fromLots={sharesOf(list, row.symbol)} />
          ))}
        </div>
      </details>
    </Block>
  );
}

/** Commits on change (blur or Enter), so the page redraws once a field is finished with.
    A holding with purchase lots shows their sum instead: the lots are the record,
    and a second, hand-typed figure beside them could only disagree. */
function SharesField({ row, value, onOpen, onCommit, lots = 0, fromLots = null }: {
  row: any; value: number | null | undefined; onOpen: (s: string) => void; onCommit: (v: number | null) => void; lots?: number; fromLots?: number | null;
}) {
  const [text, setText] = React.useState(value != null ? String(value) : '');
  React.useEffect(() => setText(value != null ? String(value) : ''), [value]);
  const commit = () => onCommit(text === '' ? null : Number(text));
  if (lots > 0) {
    return (
      <div className="flex items-center gap-2 text-13">
        <span className="w-16"><Ticker row={row} onOpen={onOpen} /></span>
        <span className="tnum">{isNum(fromLots) ? fromLots.toLocaleString('en-US') : '—'}</span>
        <span className="text-micro text-muted-foreground">from {lots} {lots === 1 ? 'lot' : 'lots'}</span>
      </div>
    );
  }
  return (
    <label className="flex items-center gap-2 text-13">
      <span className="w-16"><Ticker row={row} onOpen={onOpen} /></span>
      <Input type="number" min={0} step="any" value={text} aria-label={`Shares of ${row.symbol} held`} className="h-8 tnum"
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </label>
  );
}

/* ==========================================================================
   4. The calendar — each company asked for its own dates (two requests each),
   because a holding's next results are usually a quarter out.
   ========================================================================== */

const CAL_BAGS = ['earnings', 'dividends'];
const DAY = 86400000;
function utcDay(value: unknown) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function whenText(at: Date, today: Date) {
  const days = Math.round((at.getTime() - today.getTime()) / DAY);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  if (days < 14) return 'next week';
  if (days < 61) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

function CalendarBlock({ list, rows, onOpen, onLoaded }: { list: List; rows: any[]; onOpen: (s: string) => void; onLoaded: () => void }) {
  const missing = rows.filter((r) => CAL_BAGS.some((b) => !r.bags?.[b]));
  if (missing.length === rows.length) {
    return (
      <Block id="watchlist-calendar" title="Calendar">
        <Desc>The next results date and the next dividend for each company held. Each one is asked for its own dates rather than the market’s: a holding’s next results are usually a quarter out, and a week of the market’s calendar would miss almost all of them.</Desc>
        <Consent label={`Load the dates for these ${rows.length}`} bags={CAL_BAGS} rows={rows} onDone={onLoaded} />
      </Block>
    );
  }
  const today = utcDay(new Date().toISOString())!;
  const events: { at: Date; row: any; kind: string; label: string; detail: string }[] = [];
  for (const row of rows) {
    // A past "scheduled" date with no actual means the vendor never updated it.
    for (const e of Array.isArray(row.bags?.earnings) ? row.bags.earnings : []) {
      const at = utcDay(e.date);
      if (!at || at < today || e.epsActual != null) continue;
      events.push({ at, row, kind: 'earnings', label: 'Results', detail: isNum(Number(e.epsEstimated)) ? `${money2(Number(e.epsEstimated))} a share expected` : 'no estimate published' });
    }
    for (const d of Array.isArray(row.bags?.dividends) ? row.bags.dividends : []) {
      const at = utcDay(d.date);
      if (!at || at < today) continue;
      const amount = Number(d.adjDividend ?? d.dividend);
      const shares = sharesOf(list, row.symbol);
      events.push({
        at, row, kind: 'dividend', label: 'Ex-dividend',
        detail: (isNum(amount) ? `${money2(amount)} a share` : 'amount not stated') + (isNum(amount) && isNum(shares) ? ` · ${money2(amount * shares)} to you` : '') + (d.frequency ? ` · ${String(d.frequency).toLowerCase()}` : ''),
      });
    }
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime() || a.row.symbol.localeCompare(b.row.symbol));
  const noDates = rows.filter((r) => !events.some((e) => e.row.symbol === r.symbol));
  return (
    <Block id="watchlist-calendar" title="Calendar">
      <Desc>{events.length
        ? `${events.length} dated ${events.length === 1 ? 'event' : 'events'} ahead across ${new Set(events.map((e) => e.row.symbol)).size} of ${rows.length} holdings. Results dates are expected dates until the figures are filed; a dividend appears only once it has been declared.`
        : 'Nothing is scheduled ahead for these companies. Results dates appear once one is expected, and a dividend once it has been declared — neither is forecast here.'}</Desc>
      {events.length ? (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full border-collapse text-13">
            <thead><tr className="border-b border-border text-micro uppercase tracking-[.05em] text-muted-foreground">
              <th className="py-2 text-left font-medium">Date</th><th className="px-3 py-2 text-left font-medium">Holding</th><th className="px-3 py-2 text-left font-medium">Event</th><th className="py-2 text-left font-medium">Detail</th>
            </tr></thead>
            <tbody>
              {events.slice(0, 40).map((e, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2"><b className="block">{fmtDay(e.at)}</b><span className="text-tiny text-muted-foreground">{whenText(e.at, today)}</span></td>
                  <td className="px-3 py-2"><Ticker row={e.row} onOpen={onOpen} /> <span className="text-tiny text-muted-foreground">{e.row.companyName || ''}</span></td>
                  <td className="px-3 py-2"><span className={cn('rounded px-1.5 py-0.5 text-micro font-semibold', e.kind === 'dividend' ? 'bg-up/10 text-up' : 'bg-primary/10 text-primary')}>{e.label}</span></td>
                  <td className="py-2 text-muted-foreground">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {noDates.length && events.length ? (
        <p className="text-tiny text-muted-foreground">Nothing ahead for {noDates.map((r) => r.symbol).join(', ')} — either the next results date has not been published or, for a payer, the next dividend has not been declared.</p>
      ) : null}
    </Block>
  );
}

/* ==========================================================================
   Purification — the arithmetic around whichever impure fraction the reader
   supplies. FMP's `interestIncome` is populated for some filers and zero for
   others (a parsing gap, not a finding), so it is offered as a starting figure
   where the filing reports one, and the cell is editable. A calculation, not
   a ruling.
   ========================================================================== */

const PURIFY_BAGS = ['ratios', 'income'];

function reportedInterestShare(row: any) {
  const income = row.bags?.income;
  if (!income) return null;
  const interest = Number(income.interestIncome);
  const revenue = Number(income.revenue);
  if (!Number.isFinite(interest) || !Number.isFinite(revenue) || revenue <= 0) return null;
  return { share: (interest / revenue) * 100, reported: interest > 0, year: income.fiscalYear || income.date };
}

function NumCell({ value, label, max, onChange }: { value: number | null | undefined; label: string; max?: number; onChange: (v: number | null) => void }) {
  const [text, setText] = React.useState(value != null ? String(value) : '');
  React.useEffect(() => setText(value != null ? String(value) : ''), [value]);
  return (
    <Input type="number" min={0} max={max} step="any" value={text} aria-label={label} className="ml-auto h-8 w-24 text-right tnum"
      onChange={(e) => { setText(e.target.value); onChange(e.target.value === '' ? null : Number(e.target.value)); }} />
  );
}

function PurificationBlock({ list, rows, onOpen, onShariah, setHolding, onLoaded }: {
  list: List; rows: any[]; onOpen: (s: string) => void; onShariah: () => void;
  setHolding: (symbol: string, patch: Holding) => void; onLoaded: () => void;
}) {
  const [period, setPeriod] = React.useState<'annual' | 'monthly'>('annual');
  const per = period === 'annual' ? 1 : 1 / 12;
  const needsFill = rows.some((r) => PURIFY_BAGS.some((b) => !r.bags?.[b]));
  const payers = rows.filter((r) => isNum(dividendPerShare(r)));
  const toggle = <Toggle value={period} onChange={setPeriod} items={[{ id: 'annual', label: 'Annual' }, { id: 'monthly', label: 'Monthly' }]} />;
  const intro = <Desc>The share of a dividend that convention says is given away rather than kept. This page does the arithmetic — dividend per share, shares held, annually or by the month. The impure fraction itself is yours to set: the authoritative source is the company’s annual report or the purification ratio an index provider publishes, and neither is in this data plan.</Desc>;

  if (needsFill) {
    return <Block id="watchlist-purification" title="Purification" aside={toggle}>{intro}<Consent label={`Load dividends and income lines for these ${rows.length}`} bags={PURIFY_BAGS} rows={rows} onDone={onLoaded} /></Block>;
  }
  if (!payers.length) {
    return <Block id="watchlist-purification" title="Purification" aside={toggle}>{intro}<p className="text-13 text-muted-foreground">None of these companies paid a dividend over the trailing year, so there is nothing to purify from dividends. Scholars differ on whether capital gains require purification too; that question is not one this page answers.</p></Block>;
  }
  let total = 0;
  let counted = 0;
  const lines = payers.map((row) => {
    const held = list.holdings[row.symbol] || {};
    const reported = reportedInterestShare(row);
    // The filing's interest share is the starting figure, where it reports one.
    const impure = held.impure ?? (reported?.reported ? Number(reported.share.toFixed(3)) : null);
    const dps = dividendPerShare(row);
    const shares = sharesOf(list, row.symbol);
    const received = isNum(dps) && isNum(shares) ? dps * shares * per : null;
    const owed = received != null && isNum(impure) && impure > 0 ? received * (impure / 100) : null;
    if (owed != null) { total += owed; counted += 1; }
    return { row, held, reported, impure, dps, received, owed };
  });
  return (
    <Block id="watchlist-purification" title="Purification" aside={toggle}>
      {intro}
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-collapse text-13 tnum">
          <thead><tr className="border-b border-border text-micro uppercase tracking-[.05em] text-muted-foreground">
            <th className="py-2 text-left font-medium">Company</th>
            <th className="px-3 py-2 text-right font-medium">{period === 'annual' ? 'Dividend / share' : 'Dividend / share, monthly'}</th>
            <th className="px-3 py-2 text-right font-medium">Shares held</th><th className="px-3 py-2 text-right font-medium">Dividend received</th>
            <th className="px-3 py-2 text-right font-medium">Impure %</th><th className="py-2 pl-3 text-right font-medium">To purify</th>
          </tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.row.symbol} className={cn('border-b border-border', l.owed == null && 'text-muted-foreground')}>
                <td className="py-2"><Ticker row={l.row} onOpen={onOpen} /> <span className="text-tiny text-muted-foreground">{l.row.companyName || ''}</span></td>
                <td className="px-3 py-2 text-right">{isNum(l.dps) ? money2(l.dps * per) : 'n/a'}</td>
                <td className="px-3 py-2">
                  {l.held.lots?.length
                    ? <span className="block text-right tnum" title="The sum of this holding's purchase lots">{sharesOf(list, l.row.symbol)?.toLocaleString('en-US') ?? '—'}</span>
                    : <NumCell value={l.held.shares} label={`Shares of ${l.row.symbol} held`} onChange={(v) => setHolding(l.row.symbol, { shares: v })} />}
                </td>
                <td className="px-3 py-2 text-right">{l.received == null ? 'n/a' : money2(l.received)}</td>
                <td className="px-3 py-2">
                  <div className="grid justify-items-end gap-0.5">
                    <NumCell value={l.impure} max={100} label={`Impure fraction for ${l.row.symbol}, per cent`} onChange={(v) => setHolding(l.row.symbol, { impure: v })} />
                    <span className="text-[10px] text-muted-foreground" title={l.reported ? `Interest income ÷ revenue, ${l.reported.year}` : 'The income statement for this company is not loaded'}>
                      {l.reported ? (l.reported.reported ? `filing: ${l.reported.share.toFixed(2)}%` : 'filing reports none') : ''}
                    </span>
                  </div>
                </td>
                <td className="py-2 pl-3 text-right">{l.owed == null ? 'n/a' : <strong className="text-foreground">{money2(l.owed)}</strong>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-baseline gap-3 rounded-xl bg-muted px-4 py-3">
        <span className="text-13 text-muted-foreground">To purify</span>
        <strong className="text-xl tnum">{counted ? money2(total) : '—'}</strong>
        <span className="text-tiny text-muted-foreground">{counted ? `${period === 'annual' ? 'a year' : 'a month'}, across ${counted} ${counted === 1 ? 'holding' : 'holdings'}` : 'enter shares held and an impure fraction to see the amount'}</span>
      </div>
      <button type="button" onClick={onShariah} className="justify-self-start text-13 font-semibold text-primary hover:underline">Check these against the compliance screen ›</button>
      <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">
        The dividend is the trailing twelve months as reported, not a forecast, and the monthly view is that year divided by twelve rather than a
        schedule of payments. Where a filing reports an interest-income line, its share of revenue is offered as a starting figure — it covers interest only, not
        revenue from non-compliant activities, so it is a floor rather than the full fraction, and a company whose filing reports none is a gap in the data rather
        than a company with nothing to purify. This is a calculation, not a ruling.
      </p>
    </Block>
  );
}

/* ==========================================================================
   The page
   ========================================================================== */

export function WatchlistPage() {
  const nav = useNav();
  const has = useHasKey();
  // The shared store, redrawn on every write — a star clicked elsewhere, or
  // the rail, changes this page without a reload.
  const shared = useWatchlists();
  const ready = shared.ready;
  const store: Store = React.useMemo(() => ({ active: shared.active, lists: shared.lists }), [shared.active, shared.lists]);
  const [rows, setRows] = React.useState<any[]>([]);
  const [status, setStatus] = React.useState<{ state: string; message?: string }>({ state: 'loading' });
  const [stats, setStats] = React.useState<any>(null);
  const [table, setTable] = React.useState<TableState>(() => newTableState(columnSets(null)));
  const [adding, setAdding] = React.useState('');
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  // The distributions ship with the app: a file read, not a request.
  React.useEffect(() => { loadSectorStats().then(setStats).catch(() => { /* graded columns stay blank */ }); }, []);

  // Only the two stored fields are written; the hook's `ready` is not data.
  const commit = (next: Store) => writeStore({ active: next.active, lists: next.lists });
  const list = store.lists.find((l) => l.id === store.active) || null;
  const symbolsKey = list ? `${list.id}:${list.symbols.join(',')}` : '';

  /* One request per fifty symbols, only for the list on screen. */
  React.useEffect(() => {
    if (!ready) return;
    setRows([]);
    if (!list || !list.symbols.length) { setStatus({ state: 'empty' }); return; }
    if (!has) { setStatus({ state: 'skipped' }); return; }
    let live = true;
    setStatus({ state: 'loading' });
    fetchBatchQuotes(list.symbols).then((result: any) => {
      if (!live) return;
      if (result.status !== 'ok') { setStatus({ state: result.status, message: result.message || '' }); return; }
      const quoted = new Map<string, any>((result.data || []).map((q: any) => [String(q.symbol).toUpperCase(), q]));
      const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
      /* A symbol the vendor does not know still gets a row, its numbers blank:
         a list that silently drops what it cannot price loses the reader's ticker. */
      setRows(list.symbols.map((symbol) => {
        const q = quoted.get(symbol) || {};
        return {
          symbol, companyName: q.name || '', price: num(q.price), changePercentage: num(q.changePercentage ?? q.changesPercentage),
          volume: num(q.volume), marketCap: num(q.marketCap ?? q.mktCap), exchange: q.exchange || q.exchangeShortName || '', found: quoted.has(symbol), bags: {},
        };
      }));
      setStatus({ state: 'ok' });
    });
    return () => { live = false; };
  }, [symbolsKey, has, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const setHolding = (symbol: string, patch: Holding) => {
    if (!list) return;
    commit({ ...store, lists: store.lists.map((l) => (l.id === list.id ? { ...l, holdings: { ...l.holdings, [symbol]: { ...l.holdings[symbol], ...patch } } } : l)) });
  };
  const addSymbol = () => {
    const s = cleanSymbol(adding);
    if (!isSymbol(s) || !list) return;
    setAdding('');
    if (list.symbols.includes(s)) return;
    commit({ ...store, lists: store.lists.map((l) => (l.id === list.id ? { ...l, symbols: [...l.symbols, s] } : l)) });
  };
  const removeSymbol = (s: string) => list && commit({ ...store, lists: store.lists.map((l) => (l.id === list.id ? { ...l, symbols: l.symbols.filter((x) => x !== s) } : l)) });
  const open = (s: string) => nav.goSymbol(s);
  const sets = columnSets(stats);

  const body = () => {
    if (!ready) return <EmptyState status="loading" compact />;
    // First-run copy rather than an empty-result state: a page waiting to be filled in.
    if (!list) {
      return (
        <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <h2 className="text-lg font-bold">No watchlists yet</h2>
          <p className="max-w-[60ch] text-13 text-muted-foreground">A watchlist is a list of companies you choose, priced together and gradeable in the same table the screener uses. Press “New list” above to start one.</p>
        </div>
      );
    }
    if (!list.symbols.length) {
      return (
        <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <h2 className="text-lg font-bold">{list.name} is empty</h2>
          <p className="max-w-[60ch] text-13 text-muted-foreground">Add a symbol above — a ticker like AAPL, or MC.PA for a listing outside the US.</p>
        </div>
      );
    }
    if (status.state !== 'ok') return <EmptyState status={status.state === 'empty' ? 'ok' : status.state} message={status.message || (status.state === 'skipped' ? 'Quotes are unavailable right now.' : undefined)} />;
    return (
      <div className="grid gap-2">
        {/* Free, so it leads: the day's move arrived with the prices. */}
        <MoversBlock list={list} rows={rows} onOpen={open} />
        {/* Also free — cost and gain are the reader's own purchases against the
            same prices — and the performance history under it waits for a click. */}
        <HoldingsBlock list={list} rows={rows} onOpen={open} />
        <PerformanceBlock list={list} />
        <HealthBlock list={list} rows={rows} stats={stats} />
        <section className="grid gap-3 border-t border-border pt-10">
          <Desc>Your own list, in the screener’s table. Overview loads the whole list at once; every other tab loads per company, when you ask. Maz Vantage Quant is this report’s composite on the reduced set — a handful of ratios per factor against the company’s own sector distribution, not the full report grade.</Desc>
          {/* `onFill` because the health score above reads the same three bags. */}
          {/* No stars here: every row is already in this list, and the × beside it takes it out. */}
          <MarketTable rows={rows} sets={sets} state={table} onStateChange={setTable} onFill={bump} emptyText="Nothing in this list matches that."
            watch={false} exportName={list.name}
            identity={(row) => (
              <div className="flex items-center gap-2">
                <button type="button" title={row.companyName || row.symbol} onClick={() => open(row.symbol)} className="flex min-w-0 items-center gap-2 text-left hover:text-primary">
                  <Logo url={logoUrl(row.symbol)} label={row.symbol} size="sm" />
                  <strong className="text-13">{row.symbol}</strong>
                  <span className="max-w-[160px] truncate text-micro text-muted-foreground">{row.found ? row.companyName || '' : 'Symbol not found'}</span>
                </button>
                <button type="button" title={`Remove ${row.symbol}`} aria-label={`Remove ${row.symbol}`} onClick={() => removeSymbol(row.symbol)}
                  className="ml-1 rounded px-1 text-muted-foreground hover:bg-accent hover:text-down">×</button>
              </div>
            )} />
        </section>
        {/* In the order the questions get more expensive. */}
        <AllocationBlock list={list} rows={rows} onOpen={open} setShares={(s, v) => setHolding(s, { shares: v })} />
        <DividendsBlock list={list} rows={rows} onOpen={open} />
        <CalendarBlock list={list} rows={rows} onOpen={open} onLoaded={bump} />
        <PurificationBlock list={list} rows={rows} onOpen={open} onShariah={() => nav.goView('shariah', 'screener')} setHolding={setHolding} onLoaded={bump} />
      </div>
    );
  };

  return (
    <PageFrame id="watchlist">
      <header className="pb-7 pt-12">
        <div className="mb-[11px] text-micro font-semibold uppercase tracking-[.16em] text-muted-foreground">Watchlist</div>
        <h1 className="text-[clamp(30px,3.4vw,48px)] font-bold leading-[1.15] tracking-[-.04em]">{list ? list.name : 'Watchlists'}</h1>
        <p className="mt-3 text-13 text-muted-foreground">
          {list ? `${list.symbols.length} ${list.symbols.length === 1 ? 'symbol' : 'symbols'} · kept in this browser` : 'No lists yet — make one and add the companies you follow.'}
        </p>
      </header>
      <nav aria-label="Watchlists" className="sticky top-[var(--utilbar-h,58px)] z-30 -mx-gutter flex items-center gap-[25px] overflow-x-auto border-b border-border bg-background px-gutter scroll-none">
        {store.lists.map((l) => (
          <button key={l.id} type="button" aria-current={l.id === store.active ? 'page' : undefined} onClick={() => l.id !== store.active && commit({ ...store, active: l.id })}
            className={cn('inline-flex items-center gap-1.5 whitespace-nowrap border-b-[3px] border-transparent pb-[15px] pt-[18px] text-13 font-semibold text-muted-foreground hover:text-foreground', l.id === store.active && 'border-foreground text-foreground')}>
            {l.name}<span className="rounded-full bg-accent px-1.5 text-[10px]">{l.symbols.length}</span>
          </button>
        ))}
        <button type="button" onClick={() => { const l: List = { id: newId('wl'), name: `Watchlist ${store.lists.length + 1}`, symbols: [], holdings: {} }; commit({ active: l.id, lists: [...store.lists, l] }); }}
          className="whitespace-nowrap py-4 text-13 font-semibold text-primary hover:underline">+ New list</button>
      </nav>
      {list ? (
        <div className="flex flex-wrap items-center justify-between gap-3 py-5">
          {renaming !== null ? (
            <div className="flex gap-2">
              <Input value={renaming} aria-label="List name" autoFocus className="h-9 w-64" onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { const v = renaming.trim(); if (v) commit({ ...store, lists: store.lists.map((l) => (l.id === list.id ? { ...l, name: v } : l)) }); setRenaming(null); } }} />
              <Button size="sm" onClick={() => { const v = renaming.trim(); if (v) commit({ ...store, lists: store.lists.map((l) => (l.id === list.id ? { ...l, name: v } : l)) }); setRenaming(null); }}>Save</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input type="search" placeholder="Add a symbol — AAPL" aria-label="Add a symbol to this watchlist" value={adding} className="h-9 w-64"
                onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSymbol(); }} />
              <Button size="sm" onClick={addSymbol}>Add</Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRenaming(list.name)}>Rename</Button>
            {/* Deleting the last list leaves none rather than resurrecting a default. */}
            <Button variant="outline" size="sm" onClick={() => { const lists = store.lists.filter((l) => l.id !== list.id); commit({ lists, active: lists[0]?.id || null }); }}>Delete list</Button>
          </div>
        </div>
      ) : <div className="h-6" />}
      {body()}
    </PageFrame>
  );
}
