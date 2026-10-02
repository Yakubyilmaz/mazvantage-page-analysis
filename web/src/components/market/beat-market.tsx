'use client';

/* ==========================================================================
   Beat the Market (the view)

   Port of the view half of the legacy `beatmarket.js`. `kind` is `stocks` or
   `etfs` and is the only difference between the two copies: the universe it
   screens and one column. The benchmark and the candidate count travel in
   the URL (`bench`, `sample`), so a basket somebody sends is the same basket.
   The rule and its caveats are in `lib/beat-market.ts`.
   ========================================================================== */

import * as React from 'react';
import { isNum, money } from '@/lib/format';
import { BENCHMARKS, CHUNK, SAMPLES, benchmarkOf, loadBasket, type Basket, type BasketRow } from '@/lib/beat-market';
import { EmptyState, InstrumentMark } from '@/components/market/market-ui';
import { Coverage } from '@/components/market/canvas';
import { useHasKey, useQueryState } from '@/components/pages/page-parts';
import { useNav } from '@/components/nav-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const PAGE = 50;

function Pc({ value }: { value: number | null | undefined }) {
  if (!isNum(value)) return <span className="text-muted-foreground">—</span>;
  const mark = value > 0 ? '+' : value < 0 ? '−' : '';
  return (
    <span className={cn('tnum', value > 0 && 'text-up', value < 0 && 'text-down')}>
      {mark}{Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
    </span>
  );
}

interface Col { key: keyof BasketRow; label: string; num?: boolean; cell: (r: BasketRow) => React.ReactNode }

export function BeatTheMarket({ kind = 'stocks', country = 'US' }: { kind?: 'stocks' | 'etfs'; country?: string }) {
  const nav = useNav();
  const has = useHasKey();
  const q = useQueryState();
  const funds = kind === 'etfs';
  const noun = funds ? 'fund' : 'stock';
  const benchmark = benchmarkOf(q.get('bench'));
  const sampleParam = Number(q.get('sample'));
  const sample = SAMPLES.includes(sampleParam) ? sampleParam : SAMPLES[1];

  const [data, setData] = React.useState<Basket | null>(null);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<{ key: keyof BasketRow; dir: 1 | -1 }>({ key: 'y3', dir: -1 });
  const [shown, setShown] = React.useState(PAGE);
  const [showShort, setShowShort] = React.useState(false);

  React.useEffect(() => {
    setData(null); setShown(PAGE);
    let live = true;
    loadBasket({ kind, country, benchmark, sample })
      .then((r) => { if (live) setData(r); })
      .catch((e) => { if (live) setData({ status: 'error', message: String(e?.message || e) }); });
    return () => { live = false; };
  }, [kind, country, benchmark, sample, has]);

  const columns: Col[] = [
    { key: 'y3', label: '3Y return', num: true, cell: (r) => <Pc value={r.y3} /> },
    { key: 'excess', label: `vs ${benchmark.label}`, num: true,
      // Percentage points, not per cent: the gap between two returns.
      cell: (r) => (
        <span title={`${r.excess.toFixed(1)} percentage points ahead of ${benchmark.label} over three years`} className={cn('tnum', r.excess > 0 ? 'text-up' : 'text-down')}>
          {r.excess > 0 ? '+' : '−'}{Math.abs(r.excess).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          <span className="ml-0.5 text-micro text-muted-foreground">pp</span>
        </span>
      ) },
    { key: 'y1', label: '1Y', num: true, cell: (r) => <Pc value={r.y1} /> },
    { key: 'ytd', label: 'YTD', num: true, cell: (r) => <Pc value={r.ytd} /> },
    { key: 'm1', label: '1M', num: true, cell: (r) => <Pc value={r.m1} /> },
    { key: 'price', label: 'Price', num: true,
      cell: (r) => (isNum(r.price) ? <span>{r.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> : <span className="text-muted-foreground">—</span>) },
    { key: 'marketCap', label: funds ? 'Fund size' : 'Market cap', num: true,
      cell: (r) => (isNum(r.marketCap) ? <span>{money(r.marketCap, { currency: '$' })}</span> : <span className="text-muted-foreground">—</span>) },
    ...(funds ? [] : [{ key: 'sector' as const, label: 'Sector', cell: (r: BasketRow) => <span className="text-muted-foreground">{r.sector || '—'}</span> }]),
  ];

  const select = 'h-9 rounded-md border border-border bg-background px-2.5 text-13';
  const controls = (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-micro font-medium text-muted-foreground">Benchmark
        <select aria-label="Benchmark" className={select} value={benchmark.symbol}
          onChange={(e) => q.set({ bench: e.target.value === BENCHMARKS[0].symbol ? null : e.target.value })}>
          {BENCHMARKS.map((b) => <option key={b.symbol} value={b.symbol}>{b.label} ({b.symbol})</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-micro font-medium text-muted-foreground">Candidates
        <select aria-label="Candidates tested" className={select} value={sample}
          onChange={(e) => q.set({ sample: Number(e.target.value) === SAMPLES[1] ? null : e.target.value })}>
          {SAMPLES.map((n) => <option key={n} value={n}>Largest {n.toLocaleString('en-US')}</option>)}
        </select>
      </label>
      <label className="grid min-w-[200px] flex-1 gap-1 text-micro font-medium text-muted-foreground">Search
        <input type="search" value={query} placeholder={`Search ${noun} or symbol`} aria-label="Search the basket"
          onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} className={cn(select, 'w-full px-3')} />
      </label>
    </div>
  );

  const body = () => {
    if (!data) return <EmptyState status="loading" message={`Measuring ${sample.toLocaleString('en-US')} ${noun}s against ${benchmark.label}…`} />;
    if (data.status !== 'ok' || !('rows' in data)) return <EmptyState status={data.status} message={data.message} />;
    const marked = data.rows.filter((r) => r.short === 'possible').length;
    const needle = query.trim().toLowerCase();
    const rows = data.rows
      .filter((r) => showShort || r.short !== 'possible')
      .filter((r) => !needle || `${r.symbol} ${r.name}`.toLowerCase().includes(needle))
      .sort((a, b) => {
        const x = a[sort.key] as any, y = b[sort.key] as any;
        if (x == null || x === '') return y == null || y === '' ? 0 : 1;
        if (y == null || y === '') return -1;
        return (typeof x === 'string' ? x.localeCompare(String(y)) : x - y) * sort.dir;
      });
    const pick = (key: keyof BasketRow) => {
      setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' || key === 'sector' ? 1 : -1 }));
      setShown(PAGE);
    };
    const th = (key: keyof BasketRow, label: string, num?: boolean, extra?: string) => (
      <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        className={cn('whitespace-nowrap border-b border-border px-3 py-2.5 text-micro font-medium text-muted-foreground', num ? 'text-right' : 'text-left', extra)}>
        <button type="button" onClick={() => pick(key)} className={cn('hover:text-foreground', sort.key === key && 'font-semibold text-foreground')}>
          {label}{sort.key === key ? <span aria-hidden="true">{sort.dir === 1 ? ' ↑' : ' ↓'}</span> : null}
        </button>
      </th>
    );
    return (
      <>
        <div aria-live="polite" className="mb-4 grid gap-1.5 rounded-[10px] border border-border bg-muted px-4 py-3 text-13">
          <p><b>{benchmark.label}</b> returned <Pc value={data.benchY3} /> over three years. <b>{data.rows.length.toLocaleString('en-US')} {noun}{data.rows.length === 1 ? '' : 's'}</b> of the {data.tested.toLocaleString('en-US')} measured beat it.</p>
          <p className="text-tiny text-muted-foreground">{[
            `Largest ${Math.min(sample, data.universe).toLocaleString('en-US')} of ${data.universe.toLocaleString('en-US')} listings by size`,
            data.dropped ? `${data.dropped} dropped for reporting less than three years of history` : null,
            'Price return on both sides — dividends are in neither',
            data.message ? `Some returns could not be loaded: ${data.message}` : null,
          ].filter(Boolean).join(' · ')}</p>
          {marked ? (
            <label className="flex items-center gap-2 text-tiny">
              <input type="checkbox" checked={showShort} onChange={(e) => { setShowShort(e.target.checked); setShown(PAGE); }} />
              <span>Include {marked} listed within the last five years, whose three-year base may be shorter than three years</span>
            </label>
          ) : null}
        </div>
        {!rows.length ? (
          <EmptyState status="ok" compact message={query ? `No ${noun} in the basket matches that.`
            : `Nothing in the sample beat ${benchmark.label} over three years. Raising the number of candidates widens the net; a benchmark that has run hot makes for a short list, and an empty one is a real answer rather than a broken screen.`} />
        ) : (
          <>
            <p className="mb-2 text-tiny text-muted-foreground">{rows.length.toLocaleString('en-US')} in the basket{query ? ' matching your search' : ''}</p>
            <div className="overflow-x-auto rounded-xl border border-border scroll-thin">
              <table className="w-max min-w-full border-collapse text-13 tnum">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-border px-3 py-2.5 text-left text-micro font-medium text-muted-foreground">#</th>
                    {th('name', funds ? 'Fund' : 'Company', false, 'sticky left-0 z-[1] bg-background')}
                    {columns.map((c) => th(c.key, c.label, c.num))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((r, i) => (
                    <tr key={r.symbol} className="group">
                      <td className="border-b border-border px-3 py-2.5 text-muted-foreground group-hover:bg-muted">{i + 1}</td>
                      <td className="sticky left-0 z-[1] border-b border-border bg-background px-3 py-2 group-hover:bg-muted">
                        <button type="button" title={r.name} onClick={() => nav.goSymbol(r.symbol)} className="flex min-w-0 items-center gap-2.5 text-left">
                          <InstrumentMark row={r} className="size-7" />
                          <span className="grid min-w-0 max-w-[260px]">
                            <span className="truncate font-medium hover:text-primary">{r.name}</span>
                            <span className="flex items-center gap-1.5 text-micro text-muted-foreground">
                              {r.symbol}
                              {r.short === 'possible' ? <span className="rounded bg-warning/15 px-1 text-warning" title="Listed within the last five years — the three-year figure may be measured over a shorter window">short history</span> : null}
                            </span>
                          </span>
                        </button>
                      </td>
                      {columns.map((c) => (
                        <td key={c.key} className={cn('whitespace-nowrap border-b border-border px-3 py-2.5 group-hover:bg-muted', c.num && 'text-right')}>{c.cell(r)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > shown ? (
              <Button variant="outline" className="mt-4" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, rows.length - shown)} more — {rows.length - shown} left
              </Button>
            ) : null}
          </>
        )}
        <Coverage title="How this basket is built, and what it cannot see" notes={[
          `The rule: three-year price return greater than ${benchmark.label}'s. Both figures come from the same price-change data, so they are measured the same way from the same date, and the comparison is like-for-like.`,
          'Price return, not total return. Dividends are in neither side of the comparison, so a company paying four per cent a year has handed its owners roughly twelve per cent over three years that this column cannot see. Income names are understated here and the basket under-counts them.',
          `Candidates are taken largest-first and cut at ${sample.toLocaleString('en-US')}, which is the real distortion in this list: the biggest three-year returns in any market are usually not in the biggest names. Raising the candidate count widens the net.`,
          'A listing younger than three years is reported with its whole history in the three-year field rather than as missing. Where that is certain — the three and five year figures identical — the row is dropped. Where the listing is under five years old but the two differ, the row is kept and marked "short history", because most of those are genuine four-year listings.',
          'Anything delisted, acquired or wound up in the last three years is absent, because the universe is whatever the screener returns today. So this answers "what beat the market and is still listed", which is an easier question than it looks.',
          "No membership is stored. The basket is recomputed on every visit, so it can never be stale — and it cannot tell you when something joined or left, because that needs yesterday's list and this app keeps no history.",
        ]} />
      </>
    );
  };

  return (
    <div className="pt-10">
      <h2 className="mb-2 text-2xl font-[650] tracking-[-.025em]">Beat the Market</h2>
      <p className="mb-5 max-w-[90ch] text-13 leading-relaxed text-muted-foreground">
        Every {noun} whose three-year price return is higher than the benchmark&apos;s. There is no saved list: the rule is the membership, so a {noun} that falls below the line is simply not here next time you look. {benchmark.note}
      </p>
      {controls}
      {has ? <p className="mb-3 text-tiny text-muted-foreground">Testing the largest {sample.toLocaleString('en-US')} companies.</p> : null}
      {body()}
    </div>
  );
}
