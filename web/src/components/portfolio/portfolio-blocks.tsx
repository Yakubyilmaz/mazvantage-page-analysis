'use client';

/* ==========================================================================
   The watchlist as a portfolio: holdings at cost, and what they did

   Two blocks on the Watchlist page, both reading the list's `holdings`:

   - **Holdings** — shares, average cost, cost basis, value, gain, the day in
     money, and the purchase lots behind them, editable, importable from a
     broker's CSV and exportable. Free: the prices arrived with the list.
   - **Performance** — the value history since the first dated purchase, a
     time-weighted return against the S&P 500, and its risk. That needs a
     price history per holding, so it waits for a click that states the cost.

   The arithmetic is `lib/portfolio.ts`, which states its rules; this file
   prints them where they bite.
   ========================================================================== */

import * as React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Plus, Trash2, Upload } from 'lucide-react';
import { fetchFor } from '@/lib/fmp';
import { loadBenchmarks } from '@/lib/model';
import { barsFromFeed } from '@/lib/technicals';
import {
  holdingsFromCsv, holdingsToRows, portfolioHistory, portfolioTotals, positionOf, riskStats,
  type ImportResult, type PortfolioHistory, type RiskStats,
} from '@/lib/portfolio';
import { addLot, createList, removeLot, setLots, type WatchList } from '@/lib/watchlists';
import { TipBox } from '@/components/charts/chart-tip';
import { CsvButton } from '@/components/csv-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const money = (v: unknown, dp = 2) => (finite(v) ? `${v < 0 ? '−' : ''}US$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}` : '—');
const signedMoney = (v: unknown) => (finite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}US$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
const pct = (v: unknown, dp = 2, sign = true) => (finite(v) ? `${sign && v > 0 ? '+' : ''}${(v * 100).toFixed(dp)}%` : '—');
const tone = (v: unknown) => (finite(v) ? (v > 0 ? 'text-up' : v < 0 ? 'text-down' : '') : 'text-muted-foreground');
const today = () => new Date().toISOString().slice(0, 10);

function Block({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="grid gap-3 border-t border-border pt-10">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[26px] font-bold tracking-[-.025em]">{title}</h2>{aside}</div>
      {children}
    </section>
  );
}
const Desc = ({ children }: { children: React.ReactNode }) => <p className="max-w-[100ch] text-13 leading-relaxed text-muted-foreground">{children}</p>;

/* ==========================================================================
   Holdings
   ========================================================================== */

export function HoldingsBlock({ list, rows, onOpen }: { list: WatchList; rows: any[]; onOpen: (s: string) => void }) {
  const [importing, setImporting] = React.useState(false);
  const priceOf = new Map(rows.map((r) => [r.symbol, r.price]));
  const dayOf = Object.fromEntries(rows.map((r) => [r.symbol, r.changePercentage]));
  const positions = list.symbols.map((s) => positionOf(s, list.holdings[s], priceOf.get(s) ?? null));
  const t = portfolioTotals(positions, dayOf);
  const anyLots = positions.some((p) => p.lots.length);
  const anySize = positions.some((p) => finite(p.shares));

  const aside = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setImporting(true)}><Upload className="size-3.5" />Import CSV</Button>
      {anySize ? (
        <CsvButton name={`${list.name} holdings`} label="Export" title="Download every lot (or each holding's size) as a CSV file"
          build={() => ({ headers: ['Symbol', 'Shares', 'Price paid', 'Date'], rows: holdingsToRows(list.symbols, list.holdings) })} />
      ) : null}
    </div>
  );

  return (
    <Block id="watchlist-holdings" title="Holdings" aside={aside}>
      <Desc>
        What you hold and what it cost, from the purchases you enter below or import from a broker’s export. A purchase without a price has no cost,
        so its holding shows a value and no gain; one without a date is left out of the performance history. Kept in this browser only.
      </Desc>

      {anySize ? (
        <>
          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            {([
              ['Value', t.complete ? money(t.value) : '—', t.complete ? `${t.holdings} holdings` : `${t.sized} of ${t.holdings} sized — no total over part of a list`],
              ['Cost basis', t.costComplete ? money(t.cost) : '—', t.costComplete ? 'every lot priced' : 'needs a price on every lot'],
              ['Unrealised gain', t.costComplete ? signedMoney(t.gain) : '—', t.costComplete ? pct(t.gainPct) : ''],
              ['Today', t.complete ? signedMoney(t.dayGain) : '—', 'from each holding’s session move'],
            ] as [string, string, string][]).map(([label, value, note], i) => (
              <div key={label} className="grid gap-0.5 bg-background px-4 py-3">
                <span className="text-micro text-muted-foreground">{label}</span>
                <b className={cn('text-lg font-semibold tnum', i === 2 && tone(t.gain), i === 3 && tone(t.dayGain))}>{value}</b>
                <span className="text-micro text-muted-foreground">{note}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full border-collapse text-13 tnum">
              <thead>
                <tr className="border-b border-border text-micro uppercase tracking-[.05em] text-muted-foreground">
                  {['Holding', 'Shares', 'Avg cost', 'Cost basis', 'Price', 'Value', 'Gain', 'Gain %', 'Weight'].map((h, i) => (
                    <th key={h} scope="col" className={cn('py-2 font-medium', i ? 'px-3 text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.symbol} className={cn('border-b border-border', !finite(p.shares) && 'text-muted-foreground')}>
                    <td className="py-2"><button type="button" onClick={() => onOpen(p.symbol)} className="font-bold hover:text-primary">{p.symbol}</button></td>
                    <td className="px-3 py-2 text-right">{finite(p.shares) ? p.shares.toLocaleString('en-US') : '—'}</td>
                    <td className="px-3 py-2 text-right">{money(p.avgCost)}</td>
                    <td className="px-3 py-2 text-right" title={p.unpriced ? `${p.unpriced} lot${p.unpriced === 1 ? '' : 's'} without a price` : undefined}>
                      {money(p.costBasis)}{p.unpriced ? <span className="ml-1 text-micro text-warning">·</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{money(priceOf.get(p.symbol))}</td>
                    <td className="px-3 py-2 text-right">{money(p.value)}</td>
                    <td className={cn('px-3 py-2 text-right', tone(p.gain))}>{signedMoney(p.gain)}</td>
                    <td className={cn('px-3 py-2 text-right', tone(p.gainPct))}>{pct(p.gainPct)}</td>
                    {/* A weight only on a fully sized list — see portfolioTotals. */}
                    <td className="px-3 py-2 text-right">{t.complete && finite(p.value) && finite(t.value) && t.value > 0 ? pct(p.value / t.value, 1, false) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-13 text-muted-foreground">
          No purchases entered yet. Add them below one at a time, or import a CSV — a broker’s positions export, or three columns: symbol, shares, price paid.
        </p>
      )}

      <LotsEditor list={list} open={!anyLots} />
      <ImportDialog list={list} open={importing} onOpenChange={setImporting} />
    </Block>
  );
}

/* ---------- the lots, by hand -------------------------------------------------------------------- */

function LotForm({ list, symbols }: { list: WatchList; symbols: string[] }) {
  const [symbol, setSymbol] = React.useState(symbols[0] || '');
  const [date, setDate] = React.useState(today());
  const [shares, setShares] = React.useState('');
  const [priceText, setPriceText] = React.useState('');
  const [error, setError] = React.useState('');
  React.useEffect(() => { if (!symbols.includes(symbol)) setSymbol(symbols[0] || ''); }, [symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(shares);
    const p = priceText.trim() === '' ? null : Number(priceText);
    if (!symbol) { setError('Choose a holding.'); return; }
    if (!Number.isFinite(n) || n <= 0) { setError('Shares must be a positive number.'); return; }
    if (p !== null && (!Number.isFinite(p) || p < 0)) { setError('The price must be a number, or left blank.'); return; }
    if (date && date > today()) { setError('A purchase cannot be dated in the future.'); return; }
    addLot(list.id, symbol, { date: date || null, shares: n, price: p });
    setShares(''); setPriceText(''); setError('');
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-micro text-muted-foreground">Holding
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-13 text-foreground">
          {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-micro text-muted-foreground">Bought on
        <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
      </label>
      <label className="grid gap-1 text-micro text-muted-foreground">Shares
        <Input type="number" step="any" min={0} value={shares} onChange={(e) => setShares(e.target.value)} className="h-8 w-28 tnum" />
      </label>
      <label className="grid gap-1 text-micro text-muted-foreground">Price paid (optional)
        <Input type="number" step="any" min={0} value={priceText} onChange={(e) => setPriceText(e.target.value)} className="h-8 w-32 tnum" />
      </label>
      <Button type="submit" size="sm"><Plus className="size-3.5" />Add purchase</Button>
      {error ? <span role="alert" className="basis-full text-tiny text-down">{error}</span> : null}
    </form>
  );
}

function LotsEditor({ list, open }: { list: WatchList; open: boolean }) {
  const lotted = list.symbols.filter((s) => list.holdings[s]?.lots?.length);
  return (
    <details open={open} className="rounded-xl border border-border px-4 py-3">
      <summary className="cursor-pointer text-13 font-semibold">Purchases {lotted.length ? `· ${lotted.length} ${lotted.length === 1 ? 'holding' : 'holdings'}` : ''}</summary>
      <div className="mt-3 grid gap-4">
        {list.symbols.length ? <LotForm list={list} symbols={list.symbols} /> : <p className="text-13 text-muted-foreground">Add a symbol to the list first.</p>}
        {lotted.map((s) => (
          <div key={s} className="grid gap-1">
            <b className="text-13">{s}</b>
            <ul className="grid gap-0.5">
              {list.holdings[s]!.lots!.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 text-13 tnum">
                  <span className="w-28 text-muted-foreground">{l.date || 'no date'}</span>
                  <span className="w-28">{l.shares.toLocaleString('en-US')} sh</span>
                  <span className="w-32">{finite(l.price) ? `at ${money(l.price)}` : <span className="text-warning">no price</span>}</span>
                  <button type="button" aria-label={`Delete the ${s} purchase of ${l.shares} shares`} onClick={() => removeLot(list.id, s, l.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-down"><Trash2 className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-tiny text-muted-foreground">A holding with purchases is sized by them — the single “Shares held” figure below becomes their sum.</p>
      </div>
    </details>
  );
}

/* ---------- the lots, from a file ---------------------------------------------------------------- */

type Mode = 'add' | 'replace' | 'new';

function ImportDialog({ list, open, onOpenChange }: { list: WatchList; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [text, setText] = React.useState('');
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [mode, setMode] = React.useState<Mode>('add');
  const [name, setName] = React.useState('Imported portfolio');
  const [done, setDone] = React.useState<string | null>(null);
  const reset = () => { setText(''); setResult(null); setDone(null); setMode('add'); };
  const read = (value: string) => { setText(value); setResult(value.trim() ? holdingsFromCsv(value) : null); setDone(null); };
  const onFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) { setResult({ rows: [], errors: [{ line: 0, message: 'That file is over 2 MB — a holdings export is far smaller. Check it is the right file.' }], columns: null }); return; }
    read(await file.text());
  };
  const apply = () => {
    if (!result?.rows.length) return;
    const bySymbol = new Map<string, typeof result.rows>();
    for (const r of result.rows) bySymbol.set(r.symbol, [...(bySymbol.get(r.symbol) || []), r]);
    let target = list.id;
    if (mode === 'new') target = createList(name.trim() || 'Imported portfolio', [...bySymbol.keys()]);
    if (mode === 'replace') {
      for (const [s, rs] of bySymbol) setLots(target, s, rs.map((r) => ({ date: r.date, shares: r.shares, price: r.price })));
    } else {
      for (const r of result.rows) addLot(target, r.symbol, { date: r.date, shares: r.shares, price: r.price });
    }
    setDone(`${result.rows.length} ${result.rows.length === 1 ? 'purchase' : 'purchases'} across ${bySymbol.size} ${bySymbol.size === 1 ? 'holding' : 'holdings'} imported${mode === 'new' ? ` into “${name.trim() || 'Imported portfolio'}”, now the open list` : ` into ${list.name}`}.`);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import holdings</DialogTitle>
          <DialogDescription>
            A CSV from your broker, or pasted cells from a spreadsheet. Columns are found by name — symbol or ticker, shares or quantity, price or average cost
            (or total cost basis), date — and without a header are read as symbol, shares, price, date. Nothing is uploaded: the file is read in this browser.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-13 font-semibold hover:bg-accent">
            <Upload className="size-4" />Choose a file
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <span className="text-tiny text-muted-foreground">or paste below</span>
        </div>
        <textarea value={text} onChange={(e) => read(e.target.value)} rows={5} spellCheck={false} placeholder={'Symbol,Shares,Price,Date\nAAPL,10,150.25,2024-03-14'}
          aria-label="Holdings to import" className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-tiny" />
        {result ? (
          <div className="grid gap-2">
            <p className="text-tiny text-muted-foreground">
              {result.columns ? `Read ${Object.entries(result.columns).filter(([, v]) => v).map(([k, v]) => `${k} from “${v}”`).join(', ')}.` : 'No header found — read as symbol, shares, price, date.'}
              {' '}{result.rows.length} {result.rows.length === 1 ? 'row' : 'rows'} ready.
            </p>
            {result.rows.length ? (
              <div className="max-h-48 overflow-y-auto rounded-md border border-border scroll-thin">
                <table className="w-full text-tiny tnum">
                  <thead className="sticky top-0 bg-background"><tr className="text-muted-foreground">
                    {['Symbol', 'Shares', 'Price', 'Date'].map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>{result.rows.map((r) => (
                    <tr key={r.line} className="border-t border-border">
                      <td className="px-2 py-1 font-semibold">{r.symbol}</td><td className="px-2 py-1">{r.shares}</td>
                      <td className="px-2 py-1">{finite(r.price) ? r.price : <span className="text-warning">none</span>}</td>
                      <td className="px-2 py-1">{r.date || <span className="text-warning">none</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : null}
            {result.errors.length ? (
              <ul className="grid gap-0.5 text-tiny text-warning">{result.errors.slice(0, 8).map((e, i) => <li key={i}>{e.line ? `Line ${e.line}: ` : ''}{e.message}</li>)}
                {result.errors.length > 8 ? <li>…and {result.errors.length - 8} more.</li> : null}</ul>
            ) : null}
            {result.rows.length ? (
              <fieldset className="grid gap-1.5 text-13">
                <legend className="mb-1 text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">Where they go</legend>
                <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'add'} onChange={() => setMode('add')} />Add as purchases to {list.name}</label>
                <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />Replace the purchases of these symbols in {list.name}</label>
                <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === 'new'} onChange={() => setMode('new')} />A new list:
                  <Input value={name} onChange={(e) => setName(e.target.value)} disabled={mode !== 'new'} className="h-7 w-56" maxLength={60} aria-label="New list name" />
                </label>
              </fieldset>
            ) : null}
            {done ? <p role="status" className="rounded-md bg-up/10 px-3 py-2 text-13 text-up">{done}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>{done ? 'Close' : 'Cancel'}</Button>
              {!done ? <Button variant="default" disabled={!result.rows.length} onClick={apply}>Import {result.rows.length || ''}</Button> : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ==========================================================================
   Performance
   ========================================================================== */

const BENCHMARK = 'SPY';

export function PerformanceBlock({ list }: { list: WatchList }) {
  const dated = list.symbols.filter((s) => list.holdings[s]?.lots?.some((l) => l.date));
  const lotsKey = JSON.stringify(dated.map((s) => [s, list.holdings[s]?.lots]));
  const [state, setState] = React.useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; history?: PortfolioHistory; stats?: RiskStats; bench?: { date: string; close: number }[]; message?: string }>({ status: 'idle' });
  const [progress, setProgress] = React.useState('');
  // A new purchase makes the drawn history stale: show the consent again rather than a wrong chart.
  React.useEffect(() => { setState({ status: 'idle' }); }, [lotsKey]);

  if (!dated.length) {
    return (
      <Block id="watchlist-performance" title="Performance">
        <Desc>The value of these holdings over time, their return against the S&P 500 and their risk — once purchases with dates are entered under Holdings. A purchase without a date cannot be placed in a history, so none is drawn until one has a date.</Desc>
      </Block>
    );
  }

  const first = dated.flatMap((s) => list.holdings[s]!.lots!.map((l) => l.date).filter(Boolean) as string[]).sort()[0];
  const load = async () => {
    setState({ status: 'loading' });
    try {
      const range = { from: first, to: today() };
      const symbols = [...dated, BENCHMARK];
      let done = 0;
      const results = await Promise.all(symbols.map(async (s) => {
        const r = await fetchFor('prices', s, range);
        setProgress(`${++done} of ${symbols.length}`);
        return [s, r.status === 'ok' ? barsFromFeed(r.data).map((b) => ({ date: b.date, close: b.close })) : []] as const;
      }));
      const closes = Object.fromEntries(results);
      const lots = Object.fromEntries(dated.map((s) => [s, list.holdings[s]!.lots!]));
      const history = portfolioHistory(lots, closes);
      const stats = riskStats(history.points, closes[BENCHMARK] || [], Number(loadBenchmarks().riskFreeRate) || 0);
      setState({ status: history.points.length ? 'ok' : 'error', history, stats, bench: closes[BENCHMARK], message: history.points.length ? undefined : 'No price history came back for these holdings.' });
    } catch (e: any) {
      setState({ status: 'error', message: String(e?.message || e) });
    } finally { setProgress(''); }
  };

  return (
    <Block id="watchlist-performance" title="Performance">
      <Desc>
        Since the first dated purchase ({first}): what the holdings were worth each day against what went in, and a time-weighted return — money added on a day
        is taken out of that day’s return, so buying more is not mistaken for performance — beside the S&P 500 (SPY, dividends excluded from both).
      </Desc>
      {state.status === 'idle' || state.status === 'loading' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={state.status === 'loading'} onClick={load}>
            {state.status === 'loading' ? 'Loading…' : `Load daily prices for ${dated.length} ${dated.length === 1 ? 'holding' : 'holdings'} and the S&P 500`}
          </Button>
          {progress ? <span aria-live="polite" className="text-tiny text-muted-foreground">{progress}</span> : null}
        </div>
      ) : state.status === 'error' ? (
        <p className="text-13 text-down">{state.message}</p>
      ) : state.history && state.stats ? (
        <PerformanceView history={state.history} stats={state.stats} bench={state.bench || []} />
      ) : null}
    </Block>
  );
}

function PerformanceView({ history, stats, bench }: { history: PortfolioHistory; stats: RiskStats; bench: { date: string; close: number }[] }) {
  const pts = history.points;
  const benchMap = new Map(bench.map((b) => [b.date, b.close]));
  const b0 = benchMap.get(pts[0].date) ?? bench.find((b) => b.date >= pts[0].date)?.close;
  let lastB = b0 ?? null;
  const data = pts.map((p) => {
    const b = benchMap.get(p.date);
    if (finite(b)) lastB = b;
    return {
      date: p.date, value: p.value, invested: p.invested,
      twr: (p.twr - 1) * 100,
      bench: finite(lastB) && finite(b0) && b0 > 0 ? (lastB / b0 - 1) * 100 : null,
    };
  });
  const lastPt = data[data.length - 1];
  const tick = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const riskFree = Number(loadBenchmarks().riskFreeRate) || 0;
  const cells: [string, string, string | null][] = [
    ['Return, annualised', pct(stats.annualReturn), stats.benchmarkReturn != null ? `S&P 500 ${pct(stats.benchmarkReturn)}` : null],
    ['Volatility', pct(stats.volatility, 1, false), 'annualised, daily'],
    ['Sharpe ratio', finite(stats.sharpe) ? stats.sharpe.toFixed(2) : '—', `over a ${(riskFree * 100).toFixed(1)}% risk-free rate`],
    ['Beta to the S&P 500', finite(stats.beta) ? stats.beta.toFixed(2) : '—', '1 moves with the market'],
    ['Worst fall', pct(stats.maxDrawdown, 1, false), 'peak to trough'],
  ];
  return (
    <div className="grid gap-6">
      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        {[
          ['Time-weighted return', pct(lastPt.twr / 100), tone(lastPt.twr)],
          ['S&P 500 over the same days', pct(lastPt.bench == null ? null : lastPt.bench / 100), tone(lastPt.bench)],
          ['Value against money in', `${money(lastPt.value, 0)} / ${money(lastPt.invested, 0)}`, ''],
        ].map(([label, value, cls]) => (
          <div key={label} className="grid gap-0.5 bg-background px-4 py-3">
            <span className="text-micro text-muted-foreground">{label}</span>
            <b className={cn('text-lg font-semibold tnum', cls)}>{value}</b>
          </div>
        ))}
      </div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={tick} axisLine={false} tickLine={false} minTickGap={40} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
            <YAxis orientation="right" width={56} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
            <Tooltip content={(p: any) => (p.active && p.payload?.length ? (
              <TipBox title={p.label} lines={[
                { label: 'Portfolio ', value: `${p.payload[0]?.payload.twr.toFixed(2)}%` },
                { label: 'S&P 500 ', value: p.payload[0]?.payload.bench == null ? '—' : `${p.payload[0].payload.bench.toFixed(2)}%` },
                { label: 'Value ', value: money(p.payload[0]?.payload.value, 0) },
                { label: 'Money in ', value: money(p.payload[0]?.payload.invested, 0) },
              ]} />
            ) : null)} />
            <Line dataKey="twr" name="Portfolio" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="bench" name="S&P 500" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-5">
        {cells.map(([label, value, note]) => (
          <div key={label} className="grid gap-0.5 bg-background px-4 py-3">
            <span className="text-micro text-muted-foreground">{label}</span>
            <b className="text-base font-semibold tnum">{value}</b>
            {note ? <span className="text-micro text-muted-foreground">{note}</span> : null}
          </div>
        ))}
      </div>
      <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">
        {stats.days >= 60
          ? `Risk is measured over the last ${stats.days} sessions${stats.from ? `, from ${stats.from}` : ''}, and annualised on 252 trading days.`
          : `Risk needs sixty sessions of history and this portfolio has ${stats.days}, so none is printed — a volatility or a beta over a few weeks is mostly noise.`}
        {history.undated.length ? ` Left out of the history because a purchase has no date: ${history.undated.join(', ')}.` : ''}
        {history.unpriced.length ? ` No price history came back for ${history.unpriced.join(', ')}, so ${history.unpriced.length === 1 ? 'it is' : 'they are'} left out too.` : ''}
        {' '}Closing prices, dividends excluded; a purchase without a price is counted at that day’s close. A description of what happened, not a forecast.
      </p>
    </div>
  );
}
