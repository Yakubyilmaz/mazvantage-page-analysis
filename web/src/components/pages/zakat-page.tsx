'use client';

/* ==========================================================================
   Maz Vantage — Zakat on shares (`/shariah/zakat`)

   The reader lists what they hold, says why each is held, and the page
   works out the zakat: full market value for shares held to trade, the
   company's zakatable assets per share for shares held long term. Methods
   and caveats: `lib/zakat.ts`.

   The list is kept in this browser (`mazvantage.zakat`), like the
   watchlists, and can be filled from a watchlist's holdings. Nothing is read
   until the reader asks: a batch quote, then each company's balance sheet
   and income statement (for the share count), both cached and shared with
   its report.
   ========================================================================== */

import * as React from 'react';
import { isNum, money } from '@/lib/format';
import { fetchBatchQuotes, fetchFor, mapLimited } from '@/lib/fmp';
import { readJson, useStoredJson, writeJson } from '@/lib/local-store';
import { cleanSymbol, isSymbol, readStore, sharesHeld, activeList } from '@/lib/watchlists';
import { ZAKAT_RATE, zakatLine, zakatTotal, type Intent, type ZakatInput, type ZakatLine, type ZakatYear } from '@/lib/zakat';
import { Grid, Panel, Para, Warn, useHasKey } from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

export const ZAKAT_KEY = 'mazvantage.zakat';

interface Stored { rows: ZakatInput[]; year: ZakatYear; deduct: boolean }
const EMPTY: Stored = { rows: [], year: 'lunar', deduct: false };

const save = (patch: Partial<Stored>) => writeJson(ZAKAT_KEY, { ...readJson<Stored>(ZAKAT_KEY, EMPTY), ...patch });
const usd = (v: number | null) => (isNum(v) ? money(v, { plain: true }) : '—');

function newest(rows: any): any {
  return Array.isArray(rows) ? [...rows].sort((a, b) => String(b?.date).localeCompare(String(a?.date)))[0] ?? null : rows ?? null;
}

export function ZakatCalculator() {
  const hasKey = useHasKey();
  const stored = useStoredJson<Stored>(ZAKAT_KEY, EMPTY);
  const rows = stored.rows || [];
  const [draft, setDraft] = React.useState('');
  const [lines, setLines] = React.useState<ZakatLine[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const setRows = (next: ZakatInput[]) => { save({ rows: next }); setLines(null); };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const s = cleanSymbol(draft);
    if (!isSymbol(s) || rows.some((r) => r.symbol === s)) return;
    setRows([...rows, { symbol: s, shares: null, intent: 'hold' }]);
    setDraft('');
  };
  const fromWatchlist = () => {
    const list = activeList(readStore());
    if (!list) return;
    const have = new Set(rows.map((r) => r.symbol));
    const extra = list.symbols.filter((s) => !have.has(s)).map((s) => ({ symbol: s, shares: sharesHeld(list.holdings[s]), intent: 'hold' as Intent }));
    setRows([...rows, ...extra]);
  };

  const calculate = async () => {
    if (!rows.length) return;
    setBusy('Reading prices…');
    const quotes = await fetchBatchQuotes(rows.map((r) => r.symbol));
    const price = new Map<string, number>((quotes.status === 'ok' ? quotes.data || [] : []).map((q: any) => [String(q.symbol).toUpperCase(), Number(q.price)]));
    let done = 0;
    const out = await mapLimited(rows, async (r) => {
      const needSheet = r.intent === 'hold';
      const [bal, inc] = needSheet ? await Promise.all([fetchFor('balance', r.symbol), fetchFor('income', r.symbol)]) : [null, null];
      const i = newest(inc?.status === 'ok' ? inc.data : null);
      const sharesOutstanding = Number(i?.weightedAverageShsOut ?? i?.weightedAverageShsOutDil);
      setBusy(`Reading ${++done} of ${rows.length}…`);
      return zakatLine(r, {
        price: price.has(r.symbol) && Number.isFinite(price.get(r.symbol)) ? price.get(r.symbol)! : null,
        balance: newest(bal?.status === 'ok' ? bal.data : null),
        sharesOutstanding: Number.isFinite(sharesOutstanding) && sharesOutstanding > 0 ? sharesOutstanding : null,
      }, { year: stored.year || 'lunar', deductCurrentLiabilities: !!stored.deduct });
    }, 4);
    setLines(out);
    setBusy(null);
  };

  const total = lines ? zakatTotal(lines) : null;
  const rate = ZAKAT_RATE[stored.year || 'lunar'];

  return (
    <div className="grid gap-5 pt-6">
      <Panel title="Zakat on your shares">
        <Para>
          List the shares you hold and why you hold them. Shares bought to sell at a profit are trade goods: zakat is due on their market value.
          Shares held for the long term carry zakat on your part of the company’s own zakatable assets — its cash, receivables and inventory.
        </Para>
        {!hasKey ? <Warn><b>Needs live data</b> for prices and balance sheets. Your list is kept in this browser either way.</Warn> : null}
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-tiny text-muted-foreground">
            Add a company
            <Input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} placeholder="AAPL" className="w-36" aria-label="Ticker to add" />
          </label>
          <Button type="submit" size="sm" variant="outline">Add</Button>
          <Button type="button" size="sm" variant="outline" onClick={fromWatchlist}>Add my watchlist’s holdings</Button>
        </form>
        {rows.length ? (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full border-collapse text-13 tnum">
              <thead><tr className="border-b border-border text-micro uppercase tracking-[.05em] text-muted-foreground">
                <th className="py-2 text-left font-medium">Company</th>
                <th className="px-3 py-2 text-right font-medium">Shares held</th>
                <th className="px-3 py-2 text-left font-medium">Held</th>
                <th className="px-3 py-2 text-right font-medium">Market value</th>
                <th className="px-3 py-2 text-right font-medium">Zakat base</th>
                <th className="py-2 pl-3 text-right font-medium">Zakat</th>
                <th className="py-2 pl-3" />
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const l = lines?.find((x) => x.symbol === r.symbol) || null;
                  return (
                    <tr key={r.symbol} className="border-b border-border align-top">
                      <td className="min-w-[170px] py-2 font-semibold">{r.symbol}{l ? <span className="block max-w-[38ch] text-[10px] font-normal leading-snug text-muted-foreground">{l.note}</span> : null}</td>
                      <td className="px-3 py-2 text-right">
                        <Input type="number" min={0} step="any" value={r.shares ?? ''} aria-label={`Shares of ${r.symbol} held`} className="ml-auto h-8 w-28 text-right tnum"
                          onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, shares: e.target.value === '' ? null : Number(e.target.value) } : x)))} />
                      </td>
                      <td className="px-3 py-2">
                        <select value={r.intent} aria-label={`Why ${r.symbol} is held`} className="h-8 rounded-md border border-border bg-background px-2 text-13"
                          onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, intent: e.target.value as Intent } : x)))}>
                          <option value="hold">Long term</option>
                          <option value="trade">To trade</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">{l ? usd(l.value) : '—'}</td>
                      <td className="px-3 py-2 text-right">{l ? usd(l.base) : '—'}</td>
                      <td className="py-2 pl-3 text-right font-semibold">{l ? usd(l.zakat) : '—'}</td>
                      <td className="py-2 pl-3 text-right">
                        <button type="button" aria-label={`Remove ${r.symbol}`} onClick={() => setRows(rows.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-down">×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-13 text-muted-foreground">No companies yet.</p>}
        <div className="flex flex-wrap items-center gap-4 text-13">
          <label className="flex items-center gap-2">
            Year
            <select value={stored.year || 'lunar'} onChange={(e) => { save({ year: e.target.value as ZakatYear }); setLines(null); }}
              className="h-8 rounded-md border border-border bg-background px-2 text-13">
              <option value="lunar">Lunar (hijri) · 2.5%</option>
              <option value="solar">Solar · 2.577%</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!stored.deduct} onChange={(e) => { save({ deduct: e.target.checked }); setLines(null); }} />
            Deduct the company’s current liabilities (long-term holdings)
          </label>
          <Button size="sm" onClick={calculate} disabled={!rows.length || !!busy || !hasKey}>{busy || 'Calculate zakat'}</Button>
        </div>
        {total ? (
          <div className="flex flex-wrap items-baseline gap-3 rounded-xl bg-muted px-4 py-3">
            <span className="text-13 text-muted-foreground">Zakat due on these shares</span>
            <strong className="text-xl tnum">{usd(total.zakat)}</strong>
            <span className={cn('text-tiny text-muted-foreground', total.missing && 'text-warning')}>
              at {(rate * 100).toFixed(rate === 0.025 ? 1 : 3)}% · {total.counted} of {lines!.length} lines counted
              {total.missing ? ` — ${total.missing} left out (see the note under each)` : ''}
            </span>
          </div>
        ) : null}
      </Panel>
      <Panel title="Before you pay">
        <Grid heads={['', '']} rows={[
          ['The nisab', 'Zakat is due only when everything you own that is zakatable has stayed above the nisab for a full year. That needs all of your wealth, not just these shares, so it is yours to check.'],
          ['The company may pay it', 'Where a company pays zakat itself, many scholars hold that the shareholder’s share is settled. Few listed companies outside Muslim-majority markets do.'],
          ['Long-term method', 'Your part of the company’s cash, receivables and inventory, read from its newest annual balance sheet. Whether its current liabilities come off first is a point scholars differ on — it is the switch above.'],
          ['Non-compliant income', 'Purification of impure income is separate from zakat. The Purification tab and your watchlist work it out.'],
        ]} />
        <p className="text-tiny text-muted-foreground">A calculation, not a ruling. Ask a scholar you trust where your situation is not covered here.</p>
      </Panel>
    </div>
  );
}
