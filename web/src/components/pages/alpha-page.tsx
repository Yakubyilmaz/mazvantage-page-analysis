'use client';

/* ==========================================================================
   Maz Vantage — the Alpha Signal desk (`/alpha/<sub>`)

   The market-wide half of the feature: a capped scan over a screened
   universe, ranked by the Alpha Signal, with every row's coverage and
   confidence beside its score. Three tabs: the scanner, the method, the limits.

   A company's Alpha Signal costs seven requests, so a full-market scan is
   tens of thousands from a browser — impossible inside any plan's rate limit.
   So it screens server-side, sorts by market cap, tests the top N, and **says
   so above every table**. That biases the result toward companies you have
   already heard of, and the Limits tab says that too.

   The Quant column is `scoreFromRatios` — the same lite grader the Investment
   Ideas screens call — not a second implementation that could drift.
   ========================================================================== */

import * as React from 'react';
import { dec, isNum } from '@/lib/format';
import { fetchFor, fetchScreener, hasApiKey, mapLimited } from '@/lib/fmp';
import { dedupeStocks } from '@/lib/markethub-data';
import { loadSectorStats, MAX_SCORE, sectorLookup } from '@/lib/grading';
import { scoreFromRatios } from '@/lib/model';
import { SECTORS } from '@/lib/nav';
import { SCAN_FEEDS, runProviders } from '@/lib/alpha-providers';
import { ALPHA_WEIGHTS, CALC_VERSION, classify, scoreAlpha } from '@/lib/alpha-score';
import { CATEGORIES } from '@/lib/alpha-signals';
import { ConfidencePill, StandingNotice } from '@/components/alpha/alpha-view';
import { EmptyState } from '@/components/market/market-ui';
import {
  ConnectionButton, MetaDivider, PageFrame, PageHero, Panel, Para, SectionBar, Warn, useHasKey, useQueryState,
} from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

/* 150 as the default: at seven requests each that is about a thousand calls,
   a minute of wall clock and a visible dent in a day's quota. */
const CAPS = [60, 150, 300];
const DEFAULT_CAP = 150;
const SIZE_FLOORS = [
  { id: 'all', label: 'Any size', min: 0 },
  { id: 'micro', label: 'Above $300m', min: 300e6 },
  { id: 'small', label: 'Above $2bn', min: 2e9 },
  { id: 'mid', label: 'Above $10bn', min: 10e9 },
];

type TabId = 'scan' | 'method' | 'limits';
const TABS: { id: TabId; label: string }[] = [
  { id: 'scan', label: 'Scanner' },
  { id: 'method', label: 'Method' },
  { id: 'limits', label: 'Limits' },
];
const TAB_ALIAS: Record<string, TabId> = { screener: 'scan', methodology: 'method', backtest: 'limits' };

const W = ALPHA_WEIGHTS as Record<string, number>;
const CATS = CATEGORIES as any[];

const band = (v: unknown) => (!isNum(v) ? 'na' : v >= 70 ? 'high' : v >= 55 ? 'mid' : v >= 40 ? 'low' : 'weak');
const BAND: Record<string, string> = {
  high: 'bg-up/15 text-up', mid: 'bg-up/8 text-up', low: 'bg-down/8 text-down', weak: 'bg-down/15 text-down', na: 'bg-accent text-muted-foreground',
};
const short = (t: string) => t.replace('Fundamental inflection', 'Fundamentals').replace('Revision momentum', 'Revisions')
  .replace('Commercial momentum', 'Commercial').replace('Institutional activity', 'Institutions').replace('Insider conviction', 'Insiders');

type Row = {
  symbol: string; name: string; sector: string; price: number | null; marketCap: number | null; quant: number | null; quantOn: number;
  alpha: number; coverage: number; confidence: string; archetype: any; categories: Record<string, number | null>; counts: any;
};

function sortValue(r: Row, key: string) {
  if (key === 'alpha') return r.alpha ?? -1;
  if (key === 'coverage') return r.coverage ?? -1;
  if (key === 'quant') return r.quant ?? -1;
  return r.categories?.[key] ?? -1;
}

/* ---------- the scanner ------------------------------------------------------ */

function ScanTab() {
  const nav = useNav();
  const q = useQueryState();
  const has = useHasKey();
  const sector = (SECTORS as readonly string[]).includes(q.get('industry') || '') ? q.get('industry')! : '';
  const size = SIZE_FLOORS.some((s) => s.id === q.get('screen')) ? q.get('screen')! : 'small';
  const cap = CAPS.includes(Number(q.get('days'))) ? Number(q.get('days')) : DEFAULT_CAP;
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [state, setState] = React.useState<{ status: string; message?: string } | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState('alpha');
  const [running, setRunning] = React.useState(false);
  const generation = React.useRef(0);
  React.useEffect(() => () => { generation.current += 1; }, []);

  const start = async () => {
    if (!hasApiKey()) { setState({ status: 'skipped', message: 'A market scan needs live data, which is unavailable right now.' }); return; }
    const mine = ++generation.current;
    setRows(null); setSummary(null); setRunning(true); setState({ status: 'loading', message: 'Building the candidate list.' });
    setProgress(null);
    try {
      const floor = SIZE_FLOORS.find((s) => s.id === size) || SIZE_FLOORS[0];
      const hits: any = await fetchScreener({
        country: 'US', isEtf: false, isFund: false, isActivelyTrading: true,
        ...(floor.min ? { marketCapMoreThan: floor.min } : {}), ...(sector ? { sector } : {}), limit: 5000,
      });
      if (mine !== generation.current) return;
      if (hits.status !== 'ok') { setState({ status: hits.status, message: hits.message || 'The screener did not answer.' }); return; }
      const universe = dedupeStocks(hits.data.filter((h: any) => h.symbol && !h.isEtf && !h.isFund));
      const candidates = [...universe].sort((x: any, y: any) => (y.marketCap ?? 0) - (x.marketCap ?? 0)).slice(0, cap);
      if (!candidates.length) { setState({ status: 'unavailable', message: 'No companies matched that universe.' }); return; }

      const stats = await loadSectorStats();
      const lookups = new Map<string, any>();
      const lookupFor = (s: string) => { if (!lookups.has(s)) lookups.set(s, sectorLookup(stats, s)); return lookups.get(s); };
      let done = 0;
      setProgress({ done: 0, total: candidates.length });

      const scored = await mapLimited(candidates, async (h: any) => {
        const results: any[] = await Promise.all([...SCAN_FEEDS.map((f: string) => fetchFor(f, h.symbol)), fetchFor('ratiosTtm', h.symbol)]);
        done += 1;
        if (done % 5 === 0 || done === candidates.length) { if (mine === generation.current) setProgress({ done, total: candidates.length }); }
        if (mine !== generation.current) return null;
        const bag: Record<string, any> = {};
        SCAN_FEEDS.forEach((f: string, i: number) => { bag[f] = results[i]; });
        const ratios = results[SCAN_FEEDS.length];
        const quant: any = ratios?.status === 'ok' && ratios.data ? scoreFromRatios(ratios.data, lookupFor(h.sector || '')) : { score: null, scoredOn: 0 };
        const signals = runProviders(bag, { symbol: h.symbol, marketCap: isNum(h.marketCap) ? h.marketCap : null, quantScore: quant.score });
        const result: any = scoreAlpha(signals);
        const cls: any = classify(result, quant.score);
        return {
          symbol: h.symbol, name: h.companyName || h.symbol, sector: h.sector || '',
          price: isNum(h.price) ? h.price : null, marketCap: isNum(h.marketCap) ? h.marketCap : null,
          quant: quant.score, quantOn: quant.scoredOn, alpha: result.score, coverage: result.coveragePct, confidence: result.confidence,
          archetype: cls.primary, categories: Object.fromEntries(result.categories.map((c: any) => [c.id, c.score])), counts: result.counts,
        } as Row;
      }, 3);
      if (mine !== generation.current) return;
      const out = (scored as (Row | null)[]).filter((r): r is Row => Boolean(r) && isNum(r!.alpha));
      setRows(out);
      setState(null);
      setSummary(`${candidates.length} tested of ${universe.length} in the screened universe, largest first. ${universe.length - candidates.length} were not tested.`);
    } catch (err: any) {
      if (mine !== generation.current) return;
      console.error('alpha scan', err);
      setState({ status: 'error', message: err?.message });
    } finally {
      if (mine === generation.current) { setRunning(false); setProgress(null); }
    }
  };

  const shown = (rows || []).filter((r) => !search || r.symbol.toLowerCase().includes(search) || r.name.toLowerCase().includes(search))
    .sort((x, y) => sortValue(y, sort) - sortValue(x, sort));
  const selCls = 'h-9 rounded-md border border-border bg-background px-2 text-13';
  const Head = ({ label, k, help }: { label: string; k?: string; help?: string }) => (
    <th scope="col" title={help} aria-sort={k && sort === k ? 'descending' : undefined}
      className={cn('whitespace-nowrap px-3 py-2 text-left text-micro font-medium uppercase tracking-[.05em] text-muted-foreground', k && 'cursor-pointer hover:text-foreground', k && sort === k && 'text-foreground')}
      onClick={k ? () => setSort(k) : undefined}>
      {label}{k && sort === k ? ' ↓' : ''}
    </th>
  );

  const kpi = (k: string, v: string, help: string) => (
    <div key={k} title={help} className="grid gap-0.5 rounded-xl border border-border p-4">
      <strong className="text-2xl font-bold tnum">{v}</strong><span className="text-tiny text-muted-foreground">{k}</span>
    </div>
  );

  return (
    <div className="grid gap-5 pt-6">
      <p className="max-w-[90ch] text-sm leading-relaxed text-muted-foreground">
        The screener narrows the universe server-side; the Alpha Signal is then computed in your browser for the largest companies that survive, up
        to the cap you choose. A scan takes a while, which is why it runs on a button rather than on arrival.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        {([
          ['Sector', sector, [{ value: '', label: 'All sectors' }, ...SECTORS.map((s) => ({ value: s, label: s }))], (v: string) => q.set({ industry: v || null })],
          ['Minimum size', size, SIZE_FLOORS.map((s) => ({ value: s.id, label: s.label })), (v: string) => q.set({ screen: v })],
          ['Companies tested', String(cap), CAPS.map((c) => ({ value: String(c), label: `${c} largest` })), (v: string) => q.set({ days: v })],
        ] as [string, string, { value: string; label: string }[], (v: string) => void][]).map(([label, value, options, onChange]) => (
          <label key={label} className="grid gap-1 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">
            {label}
            <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(selCls, 'font-normal normal-case tracking-normal text-foreground')}>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
        <Button disabled={running} onClick={start}>{running ? 'Scanning…' : 'Run scan →'}</Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {kpi('Categories', String(CATS.length), 'Each with its own provider and weight.')}
        {kpi('Readings per company', '7', 'Six signal sources plus the ratios the quant rating reads.')}
        {kpi('Weighting', `v${CALC_VERSION}`, 'Unvalidated. No backtest supports these weights.')}
        {kpi('Stored history', 'None', 'This app persists nothing, so there are no score changes to show.')}
      </div>
      {progress ? (
        <div className="grid gap-2">
          <p className="text-13 text-muted-foreground">Scoring {progress.done} of {progress.total} companies…</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-accent"><div className="h-full bg-primary transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
        </div>
      ) : null}
      {summary && rows ? <p className="text-13"><b>{rows.length} scored</b><span className="text-muted-foreground"> · {summary}</span></p> : null}
      <div className="flex justify-end">
        <Input type="search" placeholder="Filter results…" aria-label="Filter results" value={search} onChange={(e) => setSearch(e.target.value.trim().toLowerCase())} className="h-9 w-60" />
      </div>
      {state ? <EmptyState status={state.status} message={state.message} />
        : !rows ? (
          <EmptyState status="skipped" message={has ? 'Choose a universe and run a scan.'
            : 'A market scan needs live data, which is unavailable right now. The company-level Alpha Signal tab still works on the example report.'} />
        ) : !shown.length ? (
          <EmptyState status="unavailable" message={rows.length ? 'No company matches that filter.' : 'No company in the tested set produced a scoreable Alpha Signal.'} />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full border-collapse text-13 tnum">
              <thead>
                <tr className="border-b border-border">
                  <Head label="Company" />
                  <Head label="Alpha" k="alpha" help="The Alpha Signal, 0–100." />
                  <Head label="Coverage" k="coverage" help="Share of the model's weight that could be measured for this company." />
                  <Head label="Quant" k="quant" help={`The existing quant rating, 0–${MAX_SCORE}, from the lite grader — fewer ratios than a company report grades.`} />
                  <Head label="Classification" />
                  {CATS.slice(0, 5).map((c) => <Head key={c.id} label={short(c.title)} k={c.id} help={c.question} />)}
                  <Head label="Signals" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.symbol} className="border-b border-border hover:bg-accent/60">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => nav.goSymbolTab('Alpha Signal', r.symbol)} className="grid text-left hover:text-primary">
                        <strong>{r.symbol}</strong><small className="max-w-[200px] truncate text-micro text-muted-foreground">{r.name}</small>
                      </button>
                    </td>
                    <td className="px-3 py-2"><span className={cn('inline-block min-w-9 rounded-md px-1.5 py-0.5 text-center font-bold', BAND[band(r.alpha)])}>{r.alpha}</span></td>
                    <td className="px-3 py-2"><span className="mr-1.5">{r.coverage}%</span><ConfidencePill level={r.confidence} /></td>
                    <td className="px-3 py-2" title={r.quantOn ? `${r.quantOn} ratios graded` : 'Not graded'}>{isNum(r.quant) ? dec(r.quant, 2) : '—'}</td>
                    <td className="px-3 py-2"><span title={r.archetype?.blurb} className="whitespace-nowrap rounded-full bg-accent px-2.5 py-0.5 text-micro font-medium">{r.archetype?.label}</span></td>
                    {CATS.slice(0, 5).map((c) => {
                      const v = r.categories[c.id];
                      return (
                        <td key={c.id} className="px-3 py-2">
                          {isNum(v)
                            ? <span className={cn('inline-block min-w-8 rounded px-1 text-center text-tiny font-semibold', BAND[band(v)])}>{Math.round(v)}</span>
                            : <span title="Not measurable for this company" className="text-muted-foreground">—</span>}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-2 text-tiny text-muted-foreground">{r.counts.positive}+ {r.counts.negative}− {r.counts.missing}?</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <StandingNotice />
    </div>
  );
}

/* ---------- method ------------------------------------------------------------ */

function MethodTab() {
  const nav = useNav();
  return (
    <div className="grid gap-5 pt-6">
      <Panel title="What the number is">
        <Para>The Alpha Signal is a weighted reading of recent, dated evidence about a company: eleven categories, each scored 0–100 from its own signals, combined by the weights below. It is not a forecast and it is not a quality rating.</Para>
        <Para>It is deliberately on a different scale from the quant rating, which is 0–5. The two answer different questions — “how good is this company relative to its sector” and “how much has recently changed here” — and a shared scale would invite averaging them, which produces a number that answers neither.</Para>
      </Panel>
      <Panel title="The eleven categories and their weights">
        {/* Weight order here: the one table whose subject *is* the weight. */}
        <div className="grid gap-3">
          {[...CATS].sort((x, y) => W[y.id] - W[x.id]).map((c) => (
            <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,200px)_44px] items-center gap-4">
              <div className="grid gap-0.5"><strong className="text-13">{c.title}</strong><span className="text-tiny text-muted-foreground">{c.question}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-accent"><div className="h-full rounded-full bg-primary" style={{ width: `${(W[c.id] / 0.2) * 100}%` }} /></div>
              <div className="text-right text-13 font-semibold tnum">{Math.round(W[c.id] * 100)}%</div>
            </div>
          ))}
        </div>
        <p className="text-tiny text-muted-foreground">Weighting version {CALC_VERSION}. The version is printed beside every score, because two numbers produced under different weights are not comparable and nothing else would reveal it.</p>
      </Panel>
      <Panel title="How a category becomes a score">
        <ul className="grid gap-3">
          {[
            ['Each signal scores 0–100 through a stated band.', 'The band is printed in the signal’s own calculation — “the full scale is ±4 points of margin” — so a reader can check whether it is reasonable rather than trusting a curve.'],
            ['Signals are averaged by confidence × freshness.', 'A fresh, high-confidence measurement outvotes a stale, low-confidence one inside the same category. Freshness decays from full weight at 35 days to a floor at two years.'],
            ['A category with no data is dropped, not scored zero.', 'Its weight is redistributed across the categories that did score, and the share that was dropped becomes the coverage figure. Missing data lowers confidence; it never manufactures a bad score.'],
            ['Confidence is capped by coverage, last.', 'Below 40% coverage the answer is low confidence and below 65% it cannot be high, whatever the evidence quality. The cap is applied after everything else so no combination of inputs can route around it.'],
          ].map(([h, b]) => <li key={h} className="grid gap-0.5"><strong className="text-13">{h}</strong><span className="max-w-[90ch] text-13 leading-relaxed text-muted-foreground">{b}</span></li>)}
        </ul>
      </Panel>
      <Panel title="What counts as evidence">
        <Para>In order of preference: SEC filings, company releases, earnings releases, structured financial data, then market data. News is used for context and counting only, never as a fact about the business.</Para>
        <Warn><b>No social media, ever.</b> Reddit, X and message boards are not read by any provider in this engine and will not be. If a sentiment or attention source is ever added it will be labelled as attention data, kept out of the fundamental categories, and never presented as evidence about a company’s financial condition.</Warn>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => nav.goSymbolTab('Alpha Signal')}>See it on a company →</Button>
          <Button size="sm" variant="outline" onClick={() => nav.goView('quant', 'ratings')}>The quant rating →</Button>
        </div>
      </Panel>
    </div>
  );
}

/* ---------- limits ------------------------------------------------------------ */

function LimitsTab() {
  const nav = useNav();
  return (
    <div className="grid gap-5 pt-6">
      <Panel title="The weights are not validated">
        <Warn><b>No backtest supports them.</b> They are a stated starting allocation with an argument behind each one, and nothing more. Anyone presenting a hand-set weight vector as optimal is guessing; this page says so rather than implying otherwise by omission.</Warn>
        <Para>The category scores are more informative than the composite, because a category is a measurement and the composite is a measurement plus an opinion about what measurements are worth.</Para>
      </Panel>
      <Panel title="There is no history, so there is no backtest">
        <Para>Every score on this page is computed in your browser from live feeds and discarded when you reload. Nothing is stored between sessions, which is the same constraint the quant desk’s rating-changes tab runs into, and it has the same two consequences: no score history, and no way to test whether any of this works.</Para>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {[
            ['A nightly job', 'Runs the eleven providers across a defined universe and writes one row per company per day: the composite, the eleven category scores, the coverage, and the calculation version.'],
            ['Somewhere to write', 'The row is small. A year of daily scores for a thousand companies is a few hundred megabytes.'],
            ['Point-in-time storage', 'The hard part, and the one that makes a backtest honest: signals have to be stored as they were known on the day, not recomputed later from restated filings. Recomputing is look-ahead bias wearing a timestamp.'],
            ['A survivorship-safe universe', 'Including companies that were later delisted or acquired. A universe built from today’s listings has already dropped every failure.'],
          ].map(([h, b]) => <div key={h} className="rounded-xl border border-border p-4"><h4 className="mb-1 text-13 font-bold">{h}</h4><p className="text-13 leading-relaxed text-muted-foreground">{b}</p></div>)}
        </div>
        <p className="text-tiny text-muted-foreground">Until those exist, this feature makes no performance claim of any kind — not a hit rate, not a return, not a comparison with a benchmark. The structures are defined in alpha-score.ts and the scores are reproducible; what is missing is somewhere to put them.</p>
      </Panel>
      <Panel title="What the providers cannot see">
        <Para>Each of these is reported on a company’s page as a named gap that lowers coverage, rather than being approximated from something else:</Para>
        <ul className="flex flex-wrap gap-1.5">
          {['Consensus EPS and revenue revision history', 'Contract awards, backlog and book-to-bill', 'Patents and regulatory decisions', 'Job postings by function', 'Search and retail attention', 'Investor days and corporate actions', 'Supply-chain relationships']
            .map((t) => <li key={t} className="rounded-md border border-dashed border-border px-2 py-0.5 text-tiny">{t}</li>)}
        </ul>
        <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">The first of those is worth singling out. The market data carries today’s consensus and a monthly history of analyst ratings, but no time series of consensus estimates — so “estimate revision momentum”, which is what this category is usually named for, is not computable here. What the engine measures instead is the rating mix and the price-target trend, and it says so on the card rather than letting one measurement wear the other’s name.</p>
      </Panel>
      <Panel title="The scan is capped, and that biases it">
        <Para>A scan sorts the screened universe by market capitalisation and tests the largest companies up to the cap. That is the only ranking the screener gives away for free, and it means the tested set is skewed toward companies you have already heard of — close to the opposite of what a discovery tool should do.</Para>
        <Para>The honest workarounds available today are to narrow the universe first, with the sector and size controls, so the cap bites on a smaller list. Scanning “Healthcare, above $300m, 300 companies” tests a much larger share of that universe than an unfiltered scan does of the market.</Para>
        <div><Button size="sm" onClick={() => nav.goView('alpha', 'scan')}>Back to the scanner →</Button></div>
      </Panel>
    </div>
  );
}

export function AlphaPage({ sub }: { sub: string | null }) {
  const nav = useNav();
  const asked = (sub && TAB_ALIAS[sub]) || sub;
  const tab: TabId = TABS.some((t) => t.id === asked) ? (asked as TabId) : 'scan';
  return (
    <PageFrame id="alpha-desk">
      <PageHero eyebrow="Maz Vantage Alpha Signal" title="Alpha Signal"
        strap="Companies where something measurable has recently changed, and where fewer people than usual are looking. Eleven categories of dated, sourced evidence, scored 0–100 with the share of it that could actually be measured printed beside every number."
        meta={<><ConnectionButton /><MetaDivider /><span>{CATS.length} categories · weighting v{CALC_VERSION} · unvalidated</span></>} />
      <SectionBar label="Alpha Signal sections" items={TABS} active={tab} onSelect={(id) => nav.goView('alpha', id)} />
      {tab === 'scan' ? <ScanTab /> : tab === 'method' ? <MethodTab /> : <LimitsTab />}
    </PageFrame>
  );
}
