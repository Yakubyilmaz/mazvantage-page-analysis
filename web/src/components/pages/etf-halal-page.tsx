'use client';

/* ==========================================================================
   Maz Vantage — ETF Halal Check (`/shariah/etf?fund=SPUS`)

   Run the company screen on every holding of one fund and add up its weight:
   how much passes all five standards, how much fails, how much could not be
   screened, and — the table readers argue about — how much each standard
   on its own would exclude. Model and caveats: `lib/etf-halal.ts`.

   Nothing runs until the reader presses the button, because a fund of two
   hundred holdings is a few hundred requests; the button says roughly how
   many.
   ========================================================================== */

import * as React from 'react';
import { pct } from '@/lib/format';
import {
  CAPS, DEFAULT_CAP, SUGGESTED_FUNDS, checkCost, checkFund, loadFund, type FundHalal, type HoldingCheck,
} from '@/lib/etf-halal';
import type { FundData } from '@/lib/fund-xray';
import type { HalalTone } from '@/lib/halal-label';
import { SHARIAH_STANDARDS } from '@/lib/shariah';
import { stockHref } from '@/lib/routes';
import { Grid, Panel, Para, Warn, useHasKey, useQueryState } from '@/components/pages/page-parts';
import { DataTable } from '@/components/report/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const BAR: Record<'good' | 'warn' | 'bad' | 'unscreened', { cls: string; label: string }> = {
  good: { cls: 'bg-up', label: 'Passes all five standards' },
  warn: { cls: 'bg-warning', label: 'Passes some, fails others' },
  bad: { cls: 'bg-down', label: 'Fails, or excluded on activity' },
  unscreened: { cls: 'bg-muted-foreground/30', label: 'Not screened' },
};
const CHIP: Record<HalalTone, string> = { good: 'bg-up/12 text-up', warn: 'bg-warning/12 text-warning', bad: 'bg-down/12 text-down', muted: 'bg-accent text-muted-foreground' };
const STATUS_WORD: Record<HoldingCheck['status'], string> = {
  screened: '', 'no-ticker': 'No ticker (cash, futures, bonds)', 'no-data': 'No balance sheet available', 'beyond-cap': 'Past the cap — not screened',
};
const ROWS_SHOWN = 60;

const clean = (s: string | null) => String(s || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);

function WeightBar({ r }: { r: FundHalal }) {
  const total = r.total > 0 ? r.total : 1;
  const parts = (['good', 'warn', 'bad', 'unscreened'] as const).map((k) => ({ k, w: r.byLabel[k] / total }));
  return (
    <div className="grid gap-2">
      <div className="flex h-3 overflow-hidden rounded-full bg-accent" role="img"
        aria-label={parts.map((p) => `${BAR[p.k].label}: ${pct(p.w)}`).join(', ')}>
        {parts.map((p) => (p.w > 0 ? <span key={p.k} className={BAR[p.k].cls} style={{ width: `${p.w * 100}%` }} /> : null))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-tiny text-muted-foreground">
        {parts.map((p) => (
          <li key={p.k} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', BAR[p.k].cls)} />{BAR[p.k].label} <b className="text-foreground tnum">{pct(p.w)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Results({ r }: { r: FundHalal }) {
  const [all, setAll] = React.useState(false);
  const total = r.total > 0 ? r.total : 1;
  const share = (w: number) => pct(w / total);
  const rows = (all ? r.holdings : r.holdings.slice(0, ROWS_SHOWN));
  const failing = r.holdings.filter((h) => h.label && h.label.tone !== 'good');
  return (
    <div className="grid gap-5">
      <Panel title={`${r.name || r.symbol} (${r.symbol})`}>
        <Para className="text-foreground">
          <b>{share(r.byLabel.good)}</b> of the fund’s weight is in companies passing all five published standards;{' '}
          <b>{share(r.byLabel.bad)}</b> fails or is excluded on its line of business; <b>{share(r.byLabel.warn)}</b> passes some
          standards and fails others; <b>{share(r.byLabel.unscreened)}</b> was not screened.
          {failing.length ? ` ${failing.length} holding${failing.length === 1 ? '' : 's'} not passing every standard ${failing.length === 1 ? 'is' : 'are'} listed below.` : ''}
        </Para>
        <WeightBar r={r} />
        <p className="text-tiny text-muted-foreground">
          Holdings {r.updatedAt ? `as the fund last reported them (${r.updatedAt})` : 'as last reported'}. The fund’s lines sum to {pct(r.total)}.
          {r.beyondCap ? ` The ${r.beyondCap} smallest holdings are past the cap of ${r.cap} and were not screened.` : ''}
        </p>
      </Panel>

      <Panel title="Under each standard on its own">
        <Para>
          A fund follows one index provider’s rules; a reader may follow another’s. This is the share of the fund’s money each standard
          would admit, holding by holding.
        </Para>
        <Grid heads={['Standard', 'Passes', 'Fails', 'Not measured']}
          rows={SHARIAH_STANDARDS.map((s) => [
            <b key="n">{s.fullName}</b>,
            <span key="p" className="text-up tnum">{share(r.byStandard[s.key].pass)}</span>,
            <span key="f" className="text-down tnum">{share(r.byStandard[s.key].fail)}</span>,
            <span key="u" className="text-muted-foreground tnum">{share(r.byStandard[s.key].na)}</span>,
          ])} />
        {r.holdings.some((h) => h.label?.source === 'researched') ? (
          <p className="text-tiny leading-relaxed text-muted-foreground">
            Each standard here is the provider’s published rule on every holding. A holding with a researched screen carries that screen’s
            label in the table below, which can be stricter than the published rule — Maz Vantage’s AAOIFI-based reading also tests total assets.
          </p>
        ) : null}
      </Panel>

      <Panel title="Holding by holding">
        <DataTable exportName={`${r.symbol} halal check`} dense
          headers={['Holding', { label: 'Weight', num: true }, 'Halal label', 'Sector']}
          rows={rows.map((h) => [
            h.symbol && h.status !== 'no-ticker'
              ? <a key="s" href={stockHref(h.symbol, 'Shariah Compliance')} className="grid hover:text-primary">
                  <b className="font-semibold">{h.symbol}</b><span className="text-micro text-muted-foreground">{h.name}</span>
                </a>
              : <span key="s" className="grid"><b className="font-semibold">{h.name}</b></span>,
            pct(h.weight, { dp: 2 }),
            h.label
              ? <span key="l" className={cn('whitespace-nowrap rounded-md px-2 py-[3px] text-micro font-semibold', CHIP[h.label.tone])} title={h.label.sentence}>{h.label.word}</span>
              : <span key="l" className="text-tiny text-muted-foreground">{STATUS_WORD[h.status]}</span>,
            h.sector || '—',
          ])} />
        {r.holdings.length > ROWS_SHOWN ? (
          <div><Button size="sm" variant="outline" onClick={() => setAll(!all)}>{all ? 'Show the largest only' : `Show all ${r.holdings.length}`}</Button></div>
        ) : null}
      </Panel>

      <Panel title="How each holding was read">
        <Grid heads={['', '']} rows={[
          ['The label', 'The same one a company’s report prints: a researched screen where one exists, else the five published standards on the latest balance sheet.'],
          ['Market cap', 'Today’s. A company’s own Shariah tab divides by the providers’ averaged market cap, so a holding near a limit can read differently there.'],
          ['Not run here', 'The interest-income test (an income statement per holding). The ratios and the activity screen decide.'],
          ['Not screened', 'Lines without a ticker — cash, futures, swaps, bonds — holdings with no balance sheet available, and holdings past the cap. Never counted as a pass or a fail.'],
        ]} />
        <p className="text-tiny text-muted-foreground">A screen against published methodologies, not a ruling.</p>
      </Panel>
    </div>
  );
}

export function EtfHalalCheck() {
  const q = useQueryState();
  const hasKey = useHasKey();
  const fundParam = clean(q.get('fund'));
  const cap = CAPS.includes(Number(q.get('cap')) as any) ? Number(q.get('cap')) : DEFAULT_CAP;
  const [draft, setDraft] = React.useState(fundParam || '');
  const [fund, setFund] = React.useState<FundData | null>(null);
  const [state, setState] = React.useState<'idle' | 'loading-fund' | 'ready' | 'running' | 'done' | 'missing'>('idle');
  const [progress, setProgress] = React.useState<[number, number]>([0, 0]);
  const [result, setResult] = React.useState<FundHalal | null>(null);

  React.useEffect(() => { setDraft(fundParam); }, [fundParam]);

  // Reading the holdings is two requests, so it happens on choosing a fund; screening them waits for the button.
  React.useEffect(() => {
    if (!fundParam || !hasKey) { setFund(null); setState('idle'); setResult(null); return; }
    let live = true;
    setState('loading-fund'); setResult(null);
    loadFund(fundParam).then((f) => {
      if (!live) return;
      setFund(f);
      setState(f ? 'ready' : 'missing');
    });
    return () => { live = false; };
  }, [fundParam, hasKey]);

  const run = async () => {
    if (!fund) return;
    setState('running');
    const r = await checkFund(fund, { cap, onProgress: (d, t) => setProgress([d, t]) });
    setResult(r);
    setState('done');
  };

  const ticked = fund ? fund.holdings.filter((h) => h.symbol).length : 0;

  return (
    <div className="grid gap-5 pt-6">
      <Panel title="Does this fund hold what you would hold?">
        <Para>
          Enter an ETF and every holding is put through the same screen as a company’s report. The result is the share of the fund’s money
          that passes, fails, or could not be screened — and how much each of the five standards would exclude on its own.
        </Para>
        {!hasKey ? <Warn><b>Needs live data.</b> Fund holdings are read live; without a connection there is nothing to screen.</Warn> : null}
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); q.set({ fund: clean(draft) || null }); }}>
          <label className="grid gap-1 text-tiny text-muted-foreground">
            Fund ticker
            <Input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} placeholder="SPUS" className="w-36" aria-label="Fund ticker" />
          </label>
          <Button type="submit" size="sm" variant="outline">Read holdings</Button>
          <label className="grid gap-1 text-tiny text-muted-foreground">
            Screen the largest
            <select value={cap} onChange={(e) => q.set({ cap: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-13">
              {CAPS.map((c) => <option key={c} value={c}>{c} holdings</option>)}
            </select>
          </label>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-tiny text-muted-foreground">
          Funds whose names state a Shariah mandate:
          {SUGGESTED_FUNDS.map((s) => (
            <button key={s} type="button" onClick={() => q.set({ fund: s })}
              className={cn('rounded-md border border-border px-2 py-1 font-semibold hover:bg-accent', s === fundParam && 'border-foreground')}>{s}</button>
          ))}
        </div>
        {state === 'loading-fund' ? <p className="text-13 text-muted-foreground">Reading {fundParam}’s holdings…</p> : null}
        {state === 'missing' ? <Warn>No holdings came back for <b>{fundParam}</b>. Check the ticker is a fund; single companies have no holdings to screen.</Warn> : null}
        {fund && (state === 'ready' || state === 'running' || state === 'done') ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={run} disabled={state === 'running'}>
              {state === 'running' ? `Screening ${progress[0]} of ${progress[1]}…` : `Screen ${fund.name || fund.symbol}`}
            </Button>
            <span className="text-tiny text-muted-foreground">
              {fund.holdings.length} lines, {ticked} with a ticker · about {checkCost(ticked, cap)} requests
            </span>
          </div>
        ) : null}
      </Panel>
      {result ? <Results r={result} /> : null}
    </div>
  );
}
