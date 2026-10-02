'use client';

/* ==========================================================================
   Maz Vantage — Superinvestors (Investment Ideas → Superinvestors)

   Nineteen well-known filers' 13F portfolios: what each held at the last
   quarter end it reported, what it bought and sold since the quarter before,
   and — on a click — which stocks the list holds in common. The model is
   `lib/superinvestors.ts`; this file lays it out.

   Nothing here is a recommendation and nothing here is scored. A 13F is a
   six-week-old snapshot of long positions; the page says so beside every
   number that could be mistaken for something more current.
   ========================================================================== */

import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { fmtDate, isNum, money, pct } from '@/lib/format';
import { mapLimited } from '@/lib/fmp';
import {
  FUNDS, consensusOf, fundByCik, loadFund, quarterLabel, quartersStale,
  type Consensus, type FundLoad, type Holding,
} from '@/lib/superinvestors';
import { useDataEpoch } from '@/components/providers';
import { useNav } from '@/components/nav-context';
import { useHasKey, useQueryState, Crumb } from '@/components/pages/page-parts';
import { PageHead } from '@/components/shell/page-head';
import { CsvButton } from '@/components/csv-button';
import { WatchStar } from '@/components/watch-button';
import { FeedGate, KeyInfo, Notice, OCard, OHead, Pill, StatLine, StatLines } from '@/components/report/ui';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';
const PAGE = 25;
const signedPct = (v: number | null | undefined, dp = 1) => (isNum(v) ? pct(v / 100, { sign: true, dp }) : 'n/a');

function MovePill({ h }: { h: Holding }) {
  if (h.move === 'new') return <Pill tone="good">New</Pill>;
  if (h.move === 'added') return <Pill tone="good">+{isNum(h.change) ? pct(h.change) : ''}</Pill>;
  if (h.move === 'reduced') return <Pill tone="bad">{isNum(h.change) ? pct(h.change) : 'Reduced'}</Pill>;
  return <span className="text-muted-foreground">—</span>;
}

function Company({ symbol, name }: { symbol: string | null; name: string }) {
  const nav = useNav();
  if (!symbol) return <span title="No ticker is on record for this CUSIP">{name}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <WatchStar symbol={symbol} />
      <button type="button" onClick={() => nav.goSymbol(symbol)} className="text-left hover:text-primary hover:underline" title={`Open the ${symbol} report`}>
        <b className="font-semibold">{symbol}</b> <span className="text-muted-foreground">{name}</span>
      </button>
    </span>
  );
}

const Limits = () => (
  <ul className="grid list-disc gap-1 pl-5 text-tiny leading-relaxed text-muted-foreground">
    <li><b>Long US-listed positions only.</b> No shorts, cash, bonds, foreign listings or private holdings — a mostly hedged fund looks fully long here.</li>
    <li><b>Late by design.</b> A quarter’s 13F is due 45 days after it ends and shows that day only; nothing here says what the fund holds today.</li>
    <li><b>Options are listed apart,</b> by the shares they control and flagged as puts or calls, and are never added to the stock.</li>
  </ul>
);

/* ---------- one fund --------------------------------------------------------------- */

function useFund(cik: string) {
  const { epoch } = useDataEpoch();
  const [load, setLoad] = React.useState<FundLoad | null>(null);
  React.useEffect(() => {
    let live = true;
    setLoad(null);
    loadFund(cik).then((r) => { if (live) setLoad(r); });
    return () => { live = false; };
  }, [cik, epoch]);
  return load;
}

function FundView({ cik, onBack }: { cik: string; onBack: () => void }) {
  const fund = fundByCik(cik);
  const load = useFund(cik);
  const [shown, setShown] = React.useState(PAGE);
  const back = <div className="col-span-12 max-lg:col-span-1 text-13"><Crumb onClick={onBack}>All superinvestors</Crumb></div>;

  if (!fund) {
    return <div className={grid}>{back}<OCard span={12} id="si-404"><OHead title="Not on the list" /><Notice>No fund on this page has CIK <code>{cik}</code>.</Notice></OCard></div>;
  }
  if (!load) {
    return <div className={grid}>{back}<OCard span={12} id="si-loading"><OHead title={fund.name} /><p className="text-13 text-muted-foreground">Loading the latest 13F…</p></OCard></div>;
  }
  if (load.status !== 'ok' || !load.view) {
    return (
      <div className={grid}>
        {back}
        <OCard span={12} id="si-gate">
          <OHead title={fund.name} />
          <FeedGate a={{ ds: { status: () => load.status, message: () => load.message || '' } }} feed="13f" what="13F holdings" />
          <p className="mt-3 text-tiny text-muted-foreground/80">
            13F data is unavailable right now. Berkshire Hathaway is saved with the app, so it always opens.
          </p>
        </OCard>
      </div>
    );
  }

  const v = load.view;
  const lag = load.latest ? quartersStale(load.latest) : 0;
  const p = load.performance;
  const list = v.holdings;
  const left = list.length - Math.min(shown, list.length);
  const indSum = load.industries.reduce((s, r) => s + r.weight, 0);

  return (
    <div className={grid}>
      {back}
      <OCard span={12} id="si-head">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-[-.015em]">{fund.name}</h2>
            <p className="mt-1 text-13 text-muted-foreground">{fund.person} · {fund.blurb} · CIK {fund.cik}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {load.source === 'capture' ? <Pill tone="muted" title="Live data is unavailable, so this is a saved copy">saved {fmtDate(load.capturedAt)}</Pill> : null}
            {lag > 0 ? <Pill tone="warn" title="The newest quarter any filer could have reported is later than this one">{lag} quarter{lag === 1 ? '' : 's'} behind</Pill> : null}
            {load.filingUrl ? (
              <a href={load.filingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-13 font-medium text-primary hover:underline">
                The filing on sec.gov<ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <KeyInfo items={[
            [`Reported value, ${quarterLabel(load.latest)}`, money(v.total)],
            ['Positions', String(v.counts.positions)],
            ['New / added', `${v.counts.new} / ${v.counts.added}`],
            ['Reduced / sold out', `${v.counts.reduced} / ${v.counts.soldOut}`],
            ['Top ten, share of value', pct(v.top10)],
            ['Filed', load.filedOn ? fmtDate(load.filedOn) : 'n/a'],
          ]} />
        </div>
        <p className="mt-3 text-tiny text-muted-foreground/80">
          Holdings at {load.latest ? fmtDate(load.latest.date) : 'the quarter end'}{load.previous ? `, compared with ${quarterLabel(load.previous)}` : ' — no earlier quarter is on file to compare with'}.
          A change is in shares, not value: a position whose price rose with no shares bought is unchanged.
        </p>
      </OCard>

      <OCard span={8} id="si-holdings">
        <OHead title="Holdings" aside={(
          <CsvButton name={`${fund.name} 13F ${quarterLabel(load.latest)}`} build={() => ({
            headers: ['Symbol', 'Issuer', 'Class', 'Option', 'CUSIP', 'Shares', 'Value', 'Weight', 'Prior shares', 'Move', 'Change in shares'],
            rows: list.map((h) => [h.symbol, h.name, h.cls, h.option, h.cusip, h.shares, h.value, h.weight, h.prevShares, h.move, h.change]),
          })} />
        )} />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-13">
            <thead>
              <tr>
                {['Company', 'Shares', 'Value', 'Weight', `vs ${quarterLabel(load.previous)}`].map((h, i) => (
                  <th key={h} className={cn('whitespace-nowrap border-b border-border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground first:pl-0', i > 0 && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, shown).map((h) => (
                <tr key={h.key} className="hover:bg-accent/60">
                  <td className="border-b border-border py-2 pl-0 pr-3 align-top">
                    <Company symbol={h.symbol} name={h.name} />
                    {h.option ? <Pill tone="warn" className="ml-2">{h.option}</Pill> : null}
                    {h.cls && !/^(COM|COMMON STOCK)$/i.test(h.cls) ? <span className="ml-2 text-micro text-muted-foreground">{h.cls}</span> : null}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-right align-top tnum">{h.shares.toLocaleString('en-US')}</td>
                  <td className="border-b border-border px-3 py-2 text-right align-top tnum">{money(h.value)}</td>
                  <td className="border-b border-border px-3 py-2 text-right align-top tnum">{pct(h.weight)}</td>
                  <td className="border-b border-border px-3 py-2 text-right align-top"><MovePill h={h} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {left > 0 ? <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(left, PAGE)} more — {left} left</Button> : null}
      </OCard>

      <div className="col-span-4 grid content-start gap-6 max-lg:col-span-1">
        <OCard span={12} id="si-sold" className="col-span-1">
          <OHead title="Sold out" info={`Positions in the ${quarterLabel(load.previous)} filing that are absent from ${quarterLabel(load.latest)}.`} />
          {!load.previous ? <p className="text-13 text-muted-foreground">No earlier quarter on file.</p>
            : v.soldOut.length ? (
              <StatLines>
                {v.soldOut.map((s) => <StatLine key={s.key} label={<Company symbol={s.symbol} name={s.name} />} value={money(s.value)} note={`${s.shares.toLocaleString('en-US')} shares, ${quarterLabel(load.previous)}`} />)}
              </StatLines>
            ) : <p className="text-13 text-muted-foreground">Nothing was sold out entirely.</p>}
        </OCard>

        <OCard span={12} id="si-perf" className="col-span-1">
          <OHead title="Performance, estimated from the filings"
            info="An estimate from quarter-end holdings: trading inside a quarter, fees, cash, shorts and anything not on the 13F are invisible to it. It is not the fund’s reported return." />
          {p ? (
            <StatLines>
              <StatLine label="1 year" value={signedPct(p.performancePercentage1year)} note={`vs S&P 500 ${signedPct(p.performance1yearRelativeToSP500Percentage)}`} />
              <StatLine label="3 years" value={signedPct(p.performancePercentage3year)} note={`vs S&P 500 ${signedPct(p.performance3yearRelativeToSP500Percentage)}`} />
              <StatLine label="5 years" value={signedPct(p.performancePercentage5year)} note={`vs S&P 500 ${signedPct(p.performance5yearRelativeToSP500Percentage)}`} />
            </StatLines>
          ) : <p className="text-13 text-muted-foreground">No performance summary is available for this filer.</p>}
        </OCard>

        <OCard span={12} id="si-industries" className="col-span-1">
          <OHead title="By industry" info="The SEC’s SIC industry of each holding, weighted by value, printed as published." />
          {load.industries.length ? (
            <>
              <div className="grid gap-2">
                {load.industries.slice(0, 12).map((r) => (
                  <div key={r.title} className="grid gap-1">
                    <div className="flex justify-between gap-3 text-tiny"><span className="truncate" title={r.title}>{r.title.toLowerCase()}</span><b className="tnum">{pct(r.weight / 100)}</b></div>
                    <div className="h-1.5 overflow-hidden rounded bg-accent"><div className="h-full rounded bg-chart-1" style={{ width: `${Math.min(100, r.weight)}%` }} /></div>
                  </div>
                ))}
              </div>
              {Math.abs(indSum - 100) > 0.5 ? (
                <p className="mt-3 text-tiny text-muted-foreground/80">The published weights sum to {pct(indSum / 100)}, not 100%; they are shown as published rather than rescaled.</p>
              ) : null}
            </>
          ) : <p className="text-13 text-muted-foreground">No industry breakdown was returned.</p>}
        </OCard>
      </div>

      <OCard span={12} id="si-limits"><OHead title="What a 13F can and cannot tell you" /><Limits /></OCard>
    </div>
  );
}

/* ---------- the list, and what it holds in common ---------------------------------- */

type Shared = { rows: Consensus[]; read: number; failed: string[]; latest: string | null };

function CommonCard() {
  const has = useHasKey();
  const [state, setState] = React.useState<'idle' | 'running' | Shared>('idle');
  const [done, setDone] = React.useState(0);
  const [sort, setSort] = React.useState<'holders' | 'buyers' | 'sellers'>('holders');

  const run = async () => {
    setState('running');
    setDone(0);
    let n = 0;
    const loads = await mapLimited(FUNDS, async (f) => {
      const r = await loadFund(f.cik, { lite: true });
      setDone(++n);
      return { f, r };
    }, 4);
    const ok = loads.filter(({ r }) => r.status === 'ok' && r.view && r.source === 'live');
    setState({
      rows: consensusOf(ok.map(({ f, r }) => ({ fund: f, holdings: r.view!.holdings, soldOut: r.view!.soldOut }))),
      read: ok.length,
      failed: loads.filter((x) => !ok.includes(x)).map(({ f }) => f.name),
      latest: ok.map(({ r }) => r.latest).filter(Boolean).map((q) => quarterLabel(q)).sort().at(-1) ?? null,
    });
  };

  const res = typeof state === 'object' ? state : null;
  const rows = res ? [...res.rows].sort((a, b) => b[sort] - a[sort] || b.holders - a.holders || b.value - a.value).slice(0, 40) : [];

  return (
    <OCard span={12} id="si-common">
      <OHead title="What they hold in common" aside={res ? (
        <CsvButton name="superinvestors held in common" build={() => ({
          headers: ['Symbol', 'Company', 'Funds holding', 'Bought (new or added)', 'Sold (reduced or out)', 'Combined value', 'Funds'],
          rows: res.rows.map((c) => [c.symbol, c.name, c.holders, c.buyers, c.sellers, c.value, c.funds.map((f) => f.name).join('; ')]),
        })} />
      ) : null} />
      <p className="-mt-1 mb-3 max-w-[85ch] text-13 leading-relaxed text-muted-foreground">
        Every fund above, read at once: the stocks most of them hold, and which way they moved last quarter. A count of funds, not of money —
        one vote each, so a small fund’s position counts as much as Berkshire’s.
      </p>
      {state === 'idle' ? (
        has ? (
          <Button size="sm" onClick={run}>Read {FUNDS.length} funds’ latest filings</Button>
        ) : <Notice>This reads every fund’s latest two filings, which needs live data, and it is unavailable right now. The saved copy holds one fund, and a consensus of one is not one.</Notice>
      ) : state === 'running' ? (
        <p className="text-13 text-muted-foreground">Reading filings… {done} of {FUNDS.length} funds</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-13">
            <span className="text-muted-foreground">Sort by</span>
            {(['holders', 'buyers', 'sellers'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}
                className={cn('rounded-md border border-border px-2 py-1 text-micro font-semibold hover:bg-accent', sort === k && 'border-foreground bg-foreground text-background hover:bg-foreground')}>
                {k === 'holders' ? 'Most held' : k === 'buyers' ? 'Most bought' : 'Most sold'}
              </button>
            ))}
            <span className="ml-auto text-tiny text-muted-foreground">{res!.read} of {FUNDS.length} funds read{res!.latest ? `, newest ${res!.latest}` : ''}</span>
          </div>
          {res!.failed.length ? <Notice className="mb-3">Not read: {res!.failed.join(', ')}. They are left out of every count rather than counted as holding nothing.</Notice> : null}
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-13">
              <thead>
                <tr>
                  {['Company', 'Funds holding', 'Bought', 'Sold', 'Combined value', 'Which funds'].map((h, i) => (
                    <th key={h} className={cn('whitespace-nowrap border-b border-border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground first:pl-0', i > 0 && i < 5 && 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.symbol} className="hover:bg-accent/60">
                    <td className="border-b border-border py-2 pl-0 pr-3 align-top"><Company symbol={c.symbol} name={c.name} /></td>
                    <td className="border-b border-border px-3 py-2 text-right align-top font-semibold tnum">{c.holders}</td>
                    <td className="border-b border-border px-3 py-2 text-right align-top tnum text-up">{c.buyers || '—'}</td>
                    <td className="border-b border-border px-3 py-2 text-right align-top tnum text-down">{c.sellers || '—'}</td>
                    <td className="border-b border-border px-3 py-2 text-right align-top tnum">{money(c.value)}</td>
                    <td className="border-b border-border px-3 py-2 align-top text-tiny text-muted-foreground">{c.funds.map((f) => f.name).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-tiny text-muted-foreground/80">
            “Bought” counts funds that opened or added to a position; “Sold” those that trimmed one or sold out entirely. Options are left out:
            a put is a bet against the stock, and counting it as a holder would read it backwards. Funds report on different dates, so a fund a
            quarter behind is compared against its own previous filing.
          </p>
        </>
      )}
    </OCard>
  );
}

function IndexView({ onOpen }: { onOpen: (cik: string) => void }) {
  return (
    <div className={grid}>
      <OCard span={12} id="si-intro">
        <OHead title="Superinvestors" />
        <p className="-mt-1 mb-3 max-w-[85ch] text-13 leading-relaxed text-muted-foreground">
          Every manager of more than US$100m in US equities files a Form 13F each quarter listing its long positions. These are the filings of
          nineteen funds investors follow by name. Open one to see what it held and what it changed; the table below reads them all at once.
        </p>
        <Limits />
      </OCard>
      <div className="col-span-12 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3 max-lg:col-span-1">
        {FUNDS.map((f) => (
          <button key={f.cik} type="button" onClick={() => onOpen(f.cik)}
            className="grid content-start gap-1 rounded-xl border border-border p-4 text-left hover:bg-accent">
            <b className="text-13">{f.name}</b>
            <span className="text-tiny text-muted-foreground">{f.person}</span>
            <span className="text-tiny leading-relaxed text-muted-foreground/80">{f.blurb}</span>
          </button>
        ))}
      </div>
      <CommonCard />
    </div>
  );
}

export function SuperinvestorsPage() {
  const q = useQueryState();
  const cik = q.get('fund');
  const open = (c: string | null) => { q.set({ fund: c }); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); };
  return (
    <>
      <PageHead view="ideas" sub="superinvestors" />
      {cik ? <FundView key={cik} cik={cik} onBack={() => open(null)} /> : <IndexView onOpen={open} />}
    </>
  );
}
