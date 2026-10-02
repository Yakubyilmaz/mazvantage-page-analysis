'use client';

/* ==========================================================================
   Maz Vantage — Investment Ideas (`/ideas/<group>`, one portfolio at `?idea=<key>`)

   The directory of portfolios, and one portfolio with the companies that
   currently pass it. Portfolios are Maz Vantage's own, so a reader sees the
   rules and the result but cannot change either: a screen with a threshold
   moved is a different screen, and it would still carry this portfolio's
   name. Building a screen of one's own is what the Stock Screener is for,
   and the page links there.

   Links written while portfolios were editable carried the edits in the
   query (`f`, `mcmin`, `mcmax`, `sec`). They are ignored, so an old link
   opens the portfolio as published.
   ========================================================================== */

import * as React from 'react';
import { isNum, money } from '@/lib/format';
// At call time, for the guard inside `run` (the hook's value can lag a Settings change).
import { hasApiKey as hasKeyNow } from '@/lib/fmp';
import { IDEA_GROUPS, ideaGroupSlug } from '@/lib/nav';
import { IDEAS, IDEA_BY_KEY, capFor, runIdea, universeLine } from '@/lib/ideas';
import { BANKS } from '@/lib/institutions';
import { BANK_COLUMN_SET, SCREENER_COLUMN_SETS, newTableState, type TableState } from '@/lib/market-table';
import { MarketTable } from '@/components/market/market-table';
import { InstrumentMark } from '@/components/market/market-ui';
import { IdeaBasisCard, RankedCard, ResultCard, RulesCard, RulesListCard } from '@/components/ideas/idea-result';
import { BankLimitsCard, BankMatrix, BanksCard } from '@/components/ideas/bank-cards';
import { PageFrame, useHasKey, useQueryState } from '@/components/pages/page-parts';
import { PageHead } from '@/components/shell/page-head';
import { Notice, OCard, OHead, OMore, Pill } from '@/components/report/ui';
import { Button } from '@/components/ui/button';
import { Input, Skeleton } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { Trash2 } from 'lucide-react';
import { writeJson } from '@/lib/local-store';
import {
  AddToListButton, SAVED_SCREENS_KEY, describeScreen, readSavedScreens, useOpenSaved, useSavedScreens,
} from '@/components/market/screen-actions';
import { cn } from '@/lib/cn';
import { SuperinvestorsPage } from '@/components/pages/superinvestors-page';

const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';

/* ==========================================================================
   1. The directory
   ========================================================================== */

/** Group the pool, preserving `IDEA_GROUPS` order and collecting strays. */
function sectionsOf(pool: any[]) {
  const seen = new Map<string, any[]>();
  for (const idea of pool) {
    const g = idea.group || 'More';
    if (!seen.has(g)) seen.set(g, []);
    seen.get(g)!.push(idea);
  }
  const ordered = IDEA_GROUPS.filter((g) => seen.has(g));
  const rest = [...seen.keys()].filter((g) => !(IDEA_GROUPS as readonly string[]).includes(g));
  return [...ordered, ...rest].map((name) => ({ name, ideas: seen.get(name)! }));
}

/** Every thesis is written claim-first, so the first sentence is the summary. */
const firstSentence = (text: string) => String(text || '').match(/^[^.]+\./)?.[0] || String(text || '');

function universeShort(idea: any) {
  const u = idea.universe || {};
  if (idea.symbols) return `${idea.symbols.length} named companies`;
  if (idea.banks) return `${BANKS.length} banks’ 13F holdings`;
  if (u.sector) return u.sector;
  if (isNum(u.marketCapMoreThan) && isNum(u.marketCapLowerThan)) return `${money(u.marketCapMoreThan)}–${money(u.marketCapLowerThan)}`;
  if (isNum(u.marketCapMoreThan)) return `over ${money(u.marketCapMoreThan)}`;
  return 'US-listed';
}

/** A row rather than a tile: forty portfolios is a list to scan down. */
function PortfolioRow({ idea }: { idea: any }) {
  const nav = useNav();
  const rules = idea.ranked ? `Ranked, top ${idea.resultLimit}` : `${idea.rules.length} rule${idea.rules.length === 1 ? '' : 's'}`;
  return (
    <button type="button" onClick={() => nav.goIdea(idea.key)}
      className="grid w-full grid-cols-[minmax(0,1fr)_110px_170px_90px_16px] items-center gap-4 border-b border-border px-2 py-3.5 text-left last:border-b-0 hover:bg-accent max-md:grid-cols-[minmax(0,1fr)_16px]">
      <span className="grid min-w-0 gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-semibold">{idea.title}</strong>
          {idea.tag ? <Pill tone={idea.scoreIdea ? 'gold' : 'muted'}>{idea.tag}</Pill> : null}
        </span>
        <span className="line-clamp-2 text-13 text-muted-foreground">{firstSentence(idea.thesis)}</span>
      </span>
      <span className="text-tiny text-muted-foreground max-md:hidden">{rules}</span>
      <span className="truncate text-tiny text-muted-foreground max-md:hidden">{universeShort(idea)}</span>
      <span className="text-tiny text-muted-foreground/80 max-md:hidden">tests {capFor(idea)}</span>
      <span aria-hidden="true" className="text-lg text-muted-foreground">›</span>
    </button>
  );
}

/** Screens the reader saved on the screener, listed like portfolios; opening one reruns it there. */
function YourScreens({ query }: { query: string }) {
  const screens = useSavedScreens();
  const open = useOpenSaved();
  const shown = screens.filter((s) => !query || s.name.toLowerCase().includes(query) || describeScreen(s).toLowerCase().includes(query));
  if (!shown.length) return null;
  return (
    <section className="col-span-12 max-lg:col-span-1">
      <h3 className="mb-1 flex items-baseline gap-2 text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">
        <span>Your saved screens</span><i className="not-italic text-muted-foreground/70">{shown.length}</i>
      </h3>
      <div className="rounded-xl border border-border">
        {[...shown].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).map((s) => (
          <div key={s.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <button type="button" onClick={() => open(s)} className="grid min-w-0 flex-1 gap-0.5 text-left">
              <span className="text-13 font-semibold hover:text-primary">{s.name}</span>
              <span className="truncate text-tiny text-muted-foreground">{describeScreen(s)} · saved {new Date(s.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </button>
            <button type="button" aria-label={`Delete the saved screen ${s.name}`} onClick={() => writeJson(SAVED_SCREENS_KEY, readSavedScreens().filter((x) => x.id !== s.id))}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-down"><Trash2 className="size-3.5" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function IndexPage({ sub }: { sub: string | null }) {
  const has = useHasKey();
  const group = sub && sub !== 'all' ? IDEA_GROUPS.find((g) => ideaGroupSlug(g) === sub) || null : null;
  const [q, setQ] = React.useState('');
  const query = q.trim().toLowerCase();
  const match = (i: any) => !query || i.title.toLowerCase().includes(query) || i.thesis.toLowerCase().includes(query)
    || (i.tag || '').toLowerCase().includes(query) || (i.group || '').toLowerCase().includes(query);
  const pool = (IDEAS as any[]).filter((i) => (!group || i.group === group) && match(i));
  return (
    <>
      <PageHead view="ideas" sub={sub || 'all'} />
      <div className={grid}>
        <OCard span={12} id="pf-head">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{group || 'All portfolios'}</h2>
              <p className="mt-1 max-w-[80ch] text-13 text-muted-foreground">
                {group
                  ? `${pool.length} portfolio${pool.length === 1 ? '' : 's'} in this group. Open one to see its rules and the companies that pass them.`
                  : `${IDEAS.length} screens over the whole listed market, filed in ${IDEA_GROUPS.length} groups. Each is a thesis expressed as rules this data can actually test — open one to see the companies that pass it today.`}
              </p>
            </div>
            {/* In memory over a few dozen items: nothing to debounce, nothing to spend. */}
            <Input type="search" placeholder="Search portfolios…" autoComplete="off" spellCheck={false} aria-label="Search portfolios"
              value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-64" />
          </div>
        </OCard>
        {has ? null : (
          <div className="col-span-12 max-lg:col-span-1">
            <Notice>
              These screens run across the whole listed market, which needs live market data, and it is unavailable right now. Every
              portfolio below still shows its thesis and the exact rules it tests.
            </Notice>
          </div>
        )}
        {/* The reader's own screens, saved from the Stock and ETF screeners, first. */}
        {!group ? <YourScreens query={query} /> : null}
        {pool.length ? sectionsOf(pool).map(({ name, ideas }) => (
          <section key={name} className="col-span-12 max-lg:col-span-1">
            <h3 className="mb-1 flex items-baseline gap-2 text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">
              <span>{name}</span><i className="not-italic text-muted-foreground/70">{ideas.length}</i>
            </h3>
            <div className="rounded-xl border border-border">{ideas.map((idea) => <PortfolioRow key={idea.key} idea={idea} />)}</div>
          </section>
        )) : (
          <OCard span={12} id="pf-empty">
            <p className="text-sm font-semibold">No portfolio matches that.</p>
            <p className="text-13 text-muted-foreground">Try a shorter term, or clear the box to see all {IDEAS.length}.</p>
          </OCard>
        )}
      </div>
    </>
  );
}

/* ==========================================================================
   2. One portfolio — its rules, fixed
   ========================================================================== */

/** The universe in chips: what the vendor screens on before any rule runs. */
function universeChips(idea: any): string[] {
  const u = idea.universe || {};
  const out: string[] = [];
  if (idea.symbols) out.push(`${idea.symbols.length} named companies`);
  if (idea.banks) out.push(`Held in ${BANKS.length} banks’ latest 13Fs`);
  if (u.industry) out.push(u.industry);
  if (u.sector) out.push(u.sector);
  if (isNum(u.marketCapMoreThan) && isNum(u.marketCapLowerThan)) out.push(`Market cap ${money(u.marketCapMoreThan)}–${money(u.marketCapLowerThan)}`);
  else if (isNum(u.marketCapMoreThan)) out.push(`Market cap over ${money(u.marketCapMoreThan)}`);
  else if (isNum(u.marketCapLowerThan)) out.push(`Market cap under ${money(u.marketCapLowerThan)}`);
  if (isNum(u.priceMoreThan)) out.push(`Over $${u.priceMoreThan} a share`);
  if (isNum(u.dividendMoreThan)) out.push('Pays a dividend');
  out.push('US-listed');
  return out;
}

const chipCls = 'inline-flex h-8 items-center rounded-md border px-3 text-13';

function RulesStrip({ idea, has, busy, onRun }: { idea: any; has: boolean; busy: boolean; onRun: () => void }) {
  const nav = useNav();
  const rules: any[] = idea.rules || [];
  return (
    <OCard span={12} id="pf-rules">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ul aria-label="The portfolio's rules" className="flex flex-wrap items-center gap-2">
          {universeChips(idea).map((c) => (
            <li key={c} className={cn(chipCls, 'border-border text-muted-foreground')}>{c}</li>
          ))}
          {rules.map((r, i) => (
            <li key={i} className={cn(chipCls, 'border-primary/40 bg-primary/5')}>{r.label}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="muted">Curated by Maz Vantage</Pill>
          <Button size="sm" disabled={!has || busy} title={has ? undefined : 'Live market data is unavailable right now'} onClick={onRun}>
            {busy ? 'Running…' : 'Run again'}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-tiny text-muted-foreground/80">
        {idea.ranked ? 'Eligibility rules, then ranked' : 'Every rule must pass'} ·{' '}
        {idea.banks ? `reads ${BANKS.length} banks’ latest two 13F filings first, then ` : ''}tests the{' '}
        {idea.prerank ? `${capFor(idea)} strongest` : `largest ${capFor(idea)}`} of the universe. The rules are fixed — to build a screen of your own, use the{' '}
        <button type="button" onClick={() => nav.goView('stocks', 'screener')} className="font-semibold text-primary hover:underline">Stock Screener</button>.
      </p>
    </OCard>
  );
}

function PortfolioPage({ idea }: { idea: any }) {
  const nav = useNav();
  const has = useHasKey();
  const [result, setResult] = React.useState<any>(null);
  const [progress, setProgress] = React.useState<string | null>(null);
  /* The table keeps its tab, sort and page across re-runs: a reader who sorted
     by yield and ran it again gets the new result in the view they set. */
  // The big-banks portfolio leads with its own tab: the 13F figures are already on every row.
  const sets = React.useMemo(() => (idea.banks ? [BANK_COLUMN_SET, ...SCREENER_COLUMN_SETS] : SCREENER_COLUMN_SETS), [idea.banks]);
  const [table, setTable] = React.useState<TableState>(() => newTableState(sets));
  const running = React.useRef(false);
  const ran = React.useRef<string | null>(null);

  React.useEffect(() => { document.title = `${idea.title} — Maz Vantage Investment Ideas`; }, [idea.title]);

  const run = React.useCallback(async () => {
    if (running.current || !hasKeyNow()) return;
    running.current = true;
    setProgress('Screening…');
    let r: any;
    try {
      r = await runIdea(idea, {
        onProgress: (done: number, total: number, stage?: string) => setProgress(stage === 'filings'
          ? `Reading the banks’ 13F filings… ${Math.round((done / total) * 100)}%`
          : `Testing ${done} of ${total} companies…`),
      });
    } catch (err: any) {
      console.error(err);
      r = { state: 'error', idea, message: err?.message };
    }
    running.current = false;
    setProgress(null);
    setResult(r);
  }, [idea]);

  // Run on arrival: a shared link should land on the answer, not on a form.
  React.useEffect(() => {
    if (has && ran.current !== idea.key) { ran.current = idea.key; run(); }
  }, [has, idea.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = result?.idea || idea;
  const rows = result?.state === 'ok'
    ? result.rows.map((c: any) => ({ ...c, bags: { ratios: c.ratios, metrics: c.metrics, growth: c.growth, returns: c.returns, banks: c.banks } }))
    : [];
  // A portfolio whose filings could not be read has no screener result to explain.
  const bookFailed = result?.book && result.book.status !== 'ok';

  return (
    <>
      <PageHead view="ideas" sub={ideaGroupSlug(idea.group || '')} />
      <div className={grid}>
        <OCard span={12} id="pf-top">
          <OMore onClick={() => nav.goView('ideas', 'all')} className="mb-2 pt-0">← All portfolios</OMore>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[26px] font-bold tracking-[-.02em]">{idea.title}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                {idea.tag ? <Pill tone={idea.scoreIdea ? 'gold' : 'muted'}>{idea.tag}</Pill> : null}
                {/* Dropped when it repeats the tag: two identical chips read as a fault. */}
                {idea.group && idea.group !== idea.tag ? (
                  <button type="button" onClick={() => nav.goView('ideas', ideaGroupSlug(idea.group))}
                    className="rounded-md border border-border px-2 py-0.5 text-micro font-semibold hover:bg-accent">{idea.group}</button>
                ) : null}
              </div>
            </div>
            <label className="grid gap-1 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">
              Portfolio
              <select aria-label="Switch portfolio" value={idea.key} onChange={(e) => { if (e.target.value !== idea.key) nav.goIdea(e.target.value); }}
                className="h-9 max-w-[320px] rounded-md border border-border bg-background px-2 text-13 font-normal normal-case tracking-normal text-foreground">
                {sectionsOf(IDEAS as any[]).map(({ name, ideas }) => (
                  <optgroup key={name} label={name}>{ideas.map((i) => <option key={i.key} value={i.key}>{i.title}</option>)}</optgroup>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-4 max-w-[90ch] text-sm leading-relaxed">{idea.thesis}</p>
          {idea.note ? <p className="mt-2 text-tiny text-muted-foreground">{idea.note}</p> : null}
        </OCard>

        <RulesStrip idea={idea} has={has} busy={!!progress} onRun={run} />

        {!has ? (
          <OCard span={12} id="pf-nokey">
            <OHead title={idea.title} />
            <Notice>
              This screen runs across the whole market and needs live market data, which is unavailable right now.
            </Notice>
          </OCard>
        ) : progress ? (
          <OCard span={12} id="pf-running">
            <Skeleton className="h-4 w-2/5" /><Skeleton className="mt-4 h-40" />
            <p className="mt-3 text-center text-13 text-muted-foreground">{progress}</p>
          </OCard>
        ) : result ? (
          <>
            {result.state === 'ok' && rows.length ? (
              <OCard span={12} id="pf-table">
                <OHead title={`${rows.length} ${rows.length === 1 ? 'company' : 'companies'}`}
                  aside={(
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-tiny text-muted-foreground">{result.passedCount} of {result.tested} tested passed every rule</span>
                      <AddToListButton symbols={rows.map((r: any) => r.symbol)} />
                    </span>
                  )} />
                {/* `runIdea` already filled the bags its rules needed, so the
                    Valuation and Profitability tabs are free here. */}
                <MarketTable rows={rows} sets={sets} state={table} onStateChange={setTable} emptyText="No company cleared every rule."
                  identity={(row) => (
                    <button type="button" aria-label={`Open ${row.symbol}`} onClick={() => nav.goSymbol(row.symbol)} className="flex items-center gap-2 text-left">
                      <InstrumentMark row={{ symbol: row.symbol, kind: 'stock' }} />
                      <span className="grid"><strong className="text-13">{row.symbol}</strong><small className="max-w-[180px] truncate text-micro text-muted-foreground">{row.name || ''}</small></span>
                    </button>
                  )} />
              </OCard>
            ) : bookFailed ? null : <ResultCard result={result} />}
            {shown.banks ? <><BanksCard result={result} /><BankMatrix result={result} /></> : null}
            {shown.ranked ? <RankedCard result={result} />
              : result.state === 'ok' && result.all?.length ? <RulesCard result={result} /> : <RulesListCard idea={shown} />}
            {shown.banks ? <BankLimitsCard /> : null}
            <IdeaBasisCard result={result} />
          </>
        ) : null}
      </div>
    </>
  );
}

/** A portfolio's published rules in one line, for anywhere that lists screens. */
export function portfolioSummary(idea: any) {
  return `${firstSentence(idea.thesis)} ${universeLine(idea)}`;
}

export function IdeasPage({ sub }: { sub: string | null }) {
  const nav = useNav();
  const q = useQueryState();
  const key = q.get('idea');
  const idea = key ? (IDEA_BY_KEY as any)[key] : null;
  return (
    <PageFrame>
      {key && !idea ? (
        <div className={cn(grid, 'pt-6')}>
          <OCard span={12} id="pf-404">
            <OHead title="No such portfolio" />
            <Notice>Nothing is filed under <code>{key}</code>.</Notice>
            <div className="mt-3"><Button onClick={() => nav.goView('ideas', 'all')}>All portfolios →</Button></div>
          </OCard>
        </div>
      ) : idea ? <PortfolioPage key={idea.key} idea={idea} /> : sub === 'superinvestors' ? <SuperinvestorsPage /> : <IndexPage sub={sub} />}
    </PageFrame>
  );
}
