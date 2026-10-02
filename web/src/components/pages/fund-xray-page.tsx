'use client';

/* ==========================================================================
   Maz Vantage — Fund X-Ray (ETF Screener → Fund X-Ray)

   Up to six funds and how much of the money each gets; out comes the one
   portfolio they add up to underneath. The arithmetic is `lib/fund-xray.ts`.
   The mix lives in the address bar (`?funds=SPY:60,QQQ:40`), so a mix is a
   link, and nothing is stored.
   ========================================================================== */

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { isNum, money, pct } from '@/lib/format';
import { MAX_FUNDS, formatMix, loadMix, lookThrough, parseMix, type FundData, type MixLine } from '@/lib/fund-xray';
import { ConnectionButton, Crumb, MetaDivider, PageFrame, PageHero, useHasKey, useQueryState } from '@/components/pages/page-parts';
import { useNav } from '@/components/nav-context';
import { CsvButton } from '@/components/csv-button';
import { DataTable, KeyInfo, Notice, OCard, OHead } from '@/components/report/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
const EXAMPLE = 'SPY:60,QQQ:20,VXUS:20';

type Row = { symbol: string; allocation: string };

/** One exposure as a bar split by the fund each part comes from. */
function Bars({ rows, colorOf, limit = 12 }: { rows: { name: string; weight: number; byFund: Record<string, number> }[]; colorOf: (s: string) => string; limit?: number }) {
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce((s, r) => s + r.weight, 0);
  const max = Math.max(...shown.map((r) => r.weight), 0.0001);
  return (
    <div className="grid gap-2">
      {shown.map((r) => (
        <div key={r.name} className="grid grid-cols-[150px_minmax(0,1fr)_56px] items-center gap-3 text-13 max-sm:grid-cols-[110px_minmax(0,1fr)_52px]">
          <span className="truncate text-muted-foreground" title={r.name}>{r.name}</span>
          <span className="flex h-[14px] overflow-hidden rounded bg-accent" style={{ width: `${(r.weight / max) * 100}%` }}>
            {Object.entries(r.byFund).map(([sym, w]) => (
              <span key={sym} title={`${sym}: ${pct(w)}`} style={{ width: `${(w / r.weight) * 100}%`, background: colorOf(sym) }} />
            ))}
          </span>
          <b className="text-right tnum">{pct(r.weight)}</b>
        </div>
      ))}
      {rest > 0.0005 ? <p className="text-tiny text-muted-foreground">{rows.length - limit} more, {pct(rest)} together</p> : null}
    </div>
  );
}

function Legend({ mix, colorOf }: { mix: MixLine[]; colorOf: (s: string) => string }) {
  return (
    <div className="mb-3 flex flex-wrap gap-3 text-micro text-muted-foreground">
      {mix.map((l) => <span key={l.symbol} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: colorOf(l.symbol) }} />{l.symbol} {pct(l.allocation)}</span>)}
    </div>
  );
}

const covered = (share: number) => (share < 0.999 ? ` Published for ${pct(share)} of the mix; the rest is left out, not guessed.` : '');

function Results({ funds, mixRaw }: { funds: Map<string, FundData>; mixRaw: MixLine[] }) {
  const nav = useNav();
  const x = React.useMemo(() => lookThrough(mixRaw, funds), [funds, mixRaw]);
  const colorOf = (s: string) => COLORS[Math.max(0, x.mix.findIndex((l) => l.symbol === s)) % COLORS.length];
  const failed = x.mix.filter((l) => !funds.get(l.symbol)?.holdings.length);
  const total = mixRaw.reduce((s, l) => s + l.allocation, 0);
  const unique = x.holdings.filter((h) => h.weight > 0).length;

  return (
    <div className={cn(grid, 'mt-6')}>
      <OCard span={12} id="xr-summary">
        <OHead title="The mix, looked through" />
        {Math.abs(total - 100) > 0.01 ? <Notice className="mb-3">The allocations add up to {+total.toFixed(2)}, not 100, so each is read as its share of that total.</Notice> : null}
        {failed.length ? <Notice warn className="mb-3">No holdings were returned for {failed.map((f) => f.symbol).join(', ')} — check the symbol. {failed.length === 1 ? 'It is' : 'They are'} left out of the look-through rather than counted as cash.</Notice> : null}
        <KeyInfo items={[
          ['Funds', String(x.mix.length)],
          ['Underlying lines', unique.toLocaleString('en-US')],
          ['Top ten, share of the mix', pct(x.top10)],
          ['Blended expense ratio', isNum(x.blendedFee) ? `${x.blendedFee.toFixed(3)}%` : 'n/a'],
          ['A year on 10,000', isNum(x.blendedFee) ? (x.blendedFee * 100).toFixed(2) : 'n/a'],
        ]} />
      </OCard>

      <OCard span={6} id="xr-sectors">
        <OHead title="Sectors" info={`The funds’ own sector weightings, blended by allocation.${covered(x.sectorsCovered)}`} />
        <Legend mix={x.mix} colorOf={colorOf} />
        {x.sectors.length ? <Bars rows={x.sectors} colorOf={colorOf} /> : <Notice>No sector weightings were returned.</Notice>}
      </OCard>
      <OCard span={6} id="xr-countries">
        <OHead title="Countries" info={`The funds’ own country weightings, blended by allocation.${covered(x.countriesCovered)}`} />
        <Legend mix={x.mix} colorOf={colorOf} />
        {x.countries.length ? <Bars rows={x.countries} colorOf={colorOf} /> : <Notice>No country weightings were returned.</Notice>}
      </OCard>

      <OCard span={8} id="xr-holdings">
        <OHead title="What it owns underneath" info={`Each line’s weight in its fund times the fund’s allocation, added up across funds.${covered(x.holdingsCovered)}`}
          aside={(
            <CsvButton name="fund x-ray holdings" build={() => ({
              headers: ['Symbol', 'Name', 'Weight in the mix', 'Held by'],
              rows: x.holdings.map((h) => [h.symbol, h.name, h.weight, h.funds.join(' ')]),
            })} />
          )} />
        <DataTable dense exportName={null}
          headers={['Holding', { label: 'Share of the mix', num: true }, 'Held by']}
          rows={x.holdings.slice(0, 25).map((h) => [
            h.symbol
              ? <button key="h" type="button" onClick={() => nav.goSymbol(h.symbol!)} className="text-left hover:text-primary hover:underline"><b>{h.symbol}</b> <span className="text-muted-foreground">{h.name}</span></button>
              : <span key="h" className="text-muted-foreground">{h.name}</span>,
            pct(h.weight, { dp: 2 }),
            <span key="f" className="inline-flex gap-1.5">{h.funds.map((s) => <span key={s} className="rounded px-1.5 py-0.5 text-micro font-semibold text-background" style={{ background: colorOf(s) }}>{s}</span>)}</span>,
          ])} />
      </OCard>

      <div className="col-span-4 grid content-start gap-6 max-lg:col-span-1">
        <OCard span={12} id="xr-overlap" className="col-span-1">
          <OHead title="Overlap" info="For each pair, the share of one fund’s money in the same holdings as the other’s, counted at the smaller of the two weights. 100% is the same fund twice." />
          {x.pairs.length ? (
            <DataTable dense exportName={null} headers={['Pair', { label: 'Overlap', num: true }, { label: 'In common', num: true }]}
              rows={x.pairs.map((p) => [`${p.a} · ${p.b}`, pct(p.overlap), String(p.common)])} />
          ) : <p className="text-13 text-muted-foreground">Overlap needs two funds with holdings.</p>}
        </OCard>
        <OCard span={12} id="xr-fees" className="col-span-1">
          <OHead title="Fees" />
          <DataTable dense exportName={null} headers={['Fund', { label: 'Allocation', num: true }, { label: 'Expense ratio', num: true }]}
            rows={x.mix.map((l) => {
              const f = funds.get(l.symbol);
              return [<span key="f" title={f?.name || ''}>{l.symbol}</span>, pct(l.allocation), isNum(f?.expenseRatio) ? `${f!.expenseRatio!.toFixed(2)}%` : 'n/a'];
            })} />
        </OCard>
      </div>

      <OCard span={12} id="xr-limits">
        <OHead title="What the look-through cannot see" />
        <ul className="grid list-disc gap-1 pl-5 text-tiny leading-relaxed text-muted-foreground">
          <li>Holdings are as each fund was last updated{[...funds.values()].some((f) => f.updatedAt) ? ` (${[...new Set([...funds.values()].map((f) => f.updatedAt).filter(Boolean))].join(', ')})` : ''}, which are not the same day for every fund.</li>
          <li>A fund’s lines need not sum to 100%: cash, futures and swaps sit beside the stocks, and a futures line can be negative. They are kept as published.</li>
          <li>A fund that holds other funds is not looked through a second time; its fund holdings appear as lines.</li>
          <li>Sectors and countries are each fund’s own classification, so two funds can file the same company differently.</li>
        </ul>
      </OCard>
    </div>
  );
}

export function FundXrayPage() {
  const nav = useNav();
  const has = useHasKey();
  const q = useQueryState();
  const applied = React.useMemo(() => parseMix(q.get('funds')), [q]);
  const [rows, setRows] = React.useState<Row[]>(() => {
    const m = parseMix(q.get('funds'));
    return m.length ? m.map((l) => ({ symbol: l.symbol, allocation: String(l.allocation) })) : [{ symbol: '', allocation: '' }, { symbol: '', allocation: '' }];
  });
  const [state, setState] = React.useState<{ key: string; funds: Map<string, FundData> } | 'loading' | null>(null);

  const draft = parseMix(rows.map((r) => `${r.symbol}:${r.allocation}`).join(','));
  const key = formatMix(applied);

  // Load whenever the applied mix changes — a shared link opens with its result.
  React.useEffect(() => {
    if (!has || !applied.length) return;
    let live = true;
    setState('loading');
    loadMix(applied.map((l) => l.symbol)).then((funds) => { if (live) setState({ key, funds }); });
    return () => { live = false; };
  }, [has, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const run = (raw: string) => q.set({ funds: raw || null });
  const useExample = () => { setRows(parseMix(EXAMPLE).map((l) => ({ symbol: l.symbol, allocation: String(l.allocation) }))); run(EXAMPLE); };

  return (
    <PageFrame id="fund-xray">
      <PageHero eyebrow="Funds" title="Fund X-Ray"
        strap="Up to six funds and how much each gets: what the mix owns underneath, which sectors and countries that adds up to, how much the funds overlap, and what it costs a year."
        meta={<><ConnectionButton /><MetaDivider /><Crumb onClick={() => nav.goView('etfs', 'screener', { country: 'US', kind: 'etfs', collection: 'all' })}>Find funds in the ETF screener</Crumb></>} />

      <div className={grid}>
        <OCard span={12} id="xr-input">
          <OHead title="The mix" />
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run(formatMix(draft)); }}>
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input aria-label={`Fund ${i + 1} symbol`} placeholder="Symbol, e.g. SPY" value={r.symbol} maxLength={12}
                  onChange={(e) => set(i, { symbol: e.target.value.toUpperCase() })} className="h-9 w-40 uppercase placeholder:normal-case" />
                <div className="relative">
                  <Input aria-label={`Fund ${i + 1} allocation`} type="number" inputMode="decimal" min={0} step="any" placeholder="Allocation" value={r.allocation}
                    onChange={(e) => set(i, { allocation: e.target.value })} className="h-9 w-32 pr-7" />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-tiny text-muted-foreground">%</span>
                </div>
                {rows.length > 1 ? (
                  <button type="button" aria-label={`Remove fund ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}
                    className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
                ) : null}
              </div>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {rows.length < MAX_FUNDS ? <Button type="button" size="sm" variant="ghost" onClick={() => setRows((rs) => [...rs, { symbol: '', allocation: '' }])}><Plus className="size-3.5" />Add a fund</Button> : null}
              <Button type="submit" size="sm" disabled={!draft.length || !has}>
                Look through
              </Button>
              <button type="button" onClick={useExample} className="text-13 font-medium text-primary hover:underline">Try SPY 60 / QQQ 20 / VXUS 20</button>
            </div>
          </form>
          {!has ? <Notice className="mt-3">The look-through reads each fund’s holdings and weightings live, which is unavailable right now.</Notice> : null}
        </OCard>
      </div>

      {state === 'loading' ? <p className="mt-6 text-13 text-muted-foreground">Reading {applied.length} fund{applied.length === 1 ? '' : 's'}…</p>
        : state && state.key === key ? <Results funds={state.funds} mixRaw={applied} /> : null}
    </PageFrame>
  );
}
