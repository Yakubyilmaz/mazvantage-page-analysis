'use client';

/* ==========================================================================
   Maz Vantage — the Alpha Signal tab

   ARCHIVED as a tab on 2026-10-13. The reading now sits inside the Research
   report (`components/report/research/alpha-section.tsx`), which builds it
   with `useAlphaReading` below — the same feeds, providers, score and brief —
   and reuses `HowBuilt`. The tab component is kept, unmounted, so the
   reading can be shown on its own again without rebuilding it.

   One question: is something changing that the market has not priced yet?
   The page answers it in the order a reader needs it (rebuilt 2026-10-09):

     1. The answer — a direction, a headline built from the facts, and the
        dates the inputs are true as of.
     2. Three blocks, one per part of the question: the business, the
        expectations, the market. Each states its answer, the facts behind it,
        and the signals behind those, every one opening its own evidence.
     3. What management said and what the firms publish — outside the score.
     4. What would confirm the reading.
     5. How the reading is built, folded away: weights, every category, what
        it could not see, and the sources.

   It fetches after it renders — five of its feeds are not in the report's
   dataset — and the report keeps a visited panel mounted, so this happens on
   first visit and never again for that company.
   ========================================================================== */

import * as React from 'react';
import { fmtDate, isNum } from '@/lib/format';
import { hasApiKey } from '@/lib/fmp';
import { bagCapturedAt, loadAlphaBag, runProviders } from '@/lib/alpha-providers';
import { CALC_VERSION, classify, scoreAlpha } from '@/lib/alpha-score';
import { narrate } from '@/lib/alpha-narrative';
import { buildBrief, DIRECTION_LABEL, type Block, type Brief, type Direction } from '@/lib/alpha-brief';
import type { Analysis } from '@/lib/model';
import { CategoryCard, EvidenceHost, SignalRow, SourceLine, StandingNotice, useEvidence } from '@/components/alpha/alpha-view';
import { EventTag } from '@/components/report/tabs/news-tab';
import { useNav } from '@/components/nav-context';
import { FirmViews, ManagementVoice } from '@/components/alpha/outside-views';
import { Notice, OCard, OHead } from '@/components/report/ui';
import { Chevron } from '@/components/market/market-ui';
import { Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

export type Built = { result: any; classification: any; story: any; brief: Brief; quant: number | null; capturedAt: string | null; bag: any };

const SecTitle = ({ children }: { children: React.ReactNode }) => <h2 className="text-[19px] font-bold tracking-[-.02em]">{children}</h2>;
const SecBody = ({ children }: { children: React.ReactNode }) => <p className="max-w-[100ch] text-13 leading-[1.7] text-muted-foreground">{children}</p>;
const Fine = ({ children }: { children: React.ReactNode }) => <p className="max-w-[100ch] text-tiny italic leading-[1.7] text-muted-foreground">{children}</p>;

/* Direction words carry the colour; the number never does. */
const DIRECTION_TONE: Record<Direction, string> = {
  improving: 'bg-up/12 text-up border-up/40',
  deteriorating: 'bg-down/10 text-down border-down/40',
  mixed: 'bg-accent text-foreground border-border',
  unmeasured: 'bg-muted text-muted-foreground border-dashed border-border',
};

function DirectionChip({ direction, size = 'sm' }: { direction: Direction; size?: 'sm' | 'lg' }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border font-semibold', DIRECTION_TONE[direction],
      size === 'lg' ? 'px-3.5 py-1 text-[15px]' : 'px-2.5 py-0.5 text-tiny')}>
      {DIRECTION_LABEL[direction]}
    </span>
  );
}

/* ---- 1. the answer ---------------------------------------------------------- */

function Answer({ state }: { state: Built }) {
  const { brief, result, classification } = state;
  const a = brief.asOf;
  const dates = [
    a.prices ? `prices to ${fmtDate(a.prices)}` : null,
    a.statements ? `filings to ${fmtDate(a.statements)}` : null,
    a.thirteenF ? `13F for the quarter to ${fmtDate(a.thirteenF)}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <section className="grid gap-4 rounded-[14px] border border-border px-6 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-micro font-bold uppercase tracking-[.1em] text-muted-foreground">Alpha Signal</span>
        <DirectionChip direction={brief.direction} size="lg" />
        <div className="ml-auto flex flex-wrap gap-1.5">
          {brief.blocks.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1.5 text-tiny text-muted-foreground">
              {b.id === 'business' ? 'Business' : b.id === 'expectations' ? 'Expectations' : 'Market'}
              <DirectionChip direction={b.direction} />
            </span>
          ))}
        </div>
      </div>
      <p className="max-w-[90ch] text-[17px] font-medium leading-[1.6]">{brief.headline}</p>
      {classification.primary.id !== 'none' ? (
        <p className="text-13 text-muted-foreground">
          Pattern: <b className="font-semibold text-foreground">{classification.primary.label}</b> — {classification.primary.blurb}
        </p>
      ) : null}
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-tiny text-muted-foreground">
        <span title="The weighted reading the direction is cut from: improving at 58 and up, deteriorating at 42 and down. The weights are a stated allocation, not yet tested against returns.">
          Reading {isNum(result.score) ? result.score : '—'}/100 · {result.coveragePct}% measured · v{result.version}
        </span>
        {dates ? <span>{dates}</span> : null}
      </p>
    </section>
  );
}

/* ---- 2. the three blocks ------------------------------------------------------ */

/**
 * What happened, from the headlines: under the market block, because a market
 * that sold a report usually sold it on something a headline named. Tagged by
 * event, with an arrow only where the words carry one; not scored.
 */
export function WhatHappened({ news, symbol }: { news: Brief['news']; symbol: string }) {
  const nav = useNav();
  if (!news.articles) return null;
  return (
    <div className="mt-4 grid gap-2 border-t border-border pt-3">
      <h4 className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">What happened recently, from the headlines</h4>
      {news.stories.length ? (
        <ul className="grid">
          {news.stories.map((st) => (
            <li key={st.lead.url || st.lead.title} className="grid gap-1 border-b border-border py-2 last:border-b-0">
              <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <EventTag reading={st.reading} />
                {fmtDate(st.lead.date)} · {st.lead.source}{st.outlets.length > 1 ? ` · reported by ${st.outlets.length} outlets` : ''}
              </span>
              {st.lead.url
                ? <a href={st.lead.url} target="_blank" rel="noopener noreferrer" className="text-13 font-medium leading-snug hover:text-primary">{st.lead.title}</a>
                : <span className="text-13 font-medium leading-snug">{st.lead.title}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="text-tiny italic text-muted-foreground">No headline in the newest month named an event — ratings, results, supply, products, deals, legal, management or capital returns.</p>}
      <p className="text-[11px] text-muted-foreground">
        From {news.articles} articles {news.from ? `between ${fmtDate(news.from)} and ${fmtDate(news.to)}` : ''}; holder filings, law-firm adverts, previews and price
        recaps set aside. Tags read the headline&apos;s words by fixed rules and are not part of the reading above.{' '}
        <button type="button" onClick={() => nav.goSymbolTab?.('News', symbol)} className="text-primary hover:underline">All news ›</button>
      </p>
    </div>
  );
}

function BlockCard({ block, result, index, news, symbol }: { block: Block; result: any; index: Map<string, any>; news?: Brief['news']; symbol?: string }) {
  const open = useEvidence();
  const [more, setMore] = React.useState(false);
  const cats = result.categories.filter((c: any) => block.categories.includes(c.id));
  const signals = cats.flatMap((c: any) => c.signals).filter((s: any) => s.status !== 'insufficient_data');
  const gaps = cats.flatMap((c: any) => c.signals).filter((s: any) => s.status === 'insufficient_data');
  const byKey = (k?: string) => (k ? [...index.values()].find((s) => s.key === k) : null);
  /* One row per question, full width: the answer on the left, the facts it
     rests on to its right, so the three questions read down the page in the
     same shape. The container, not the window, decides when it splits — the
     market column takes a different share of the window on every page. */
  return (
    <article className="@container rounded-xl border border-border px-5 py-[18px]">
      <div className="grid gap-x-8 gap-y-3.5 @2xl:grid-cols-[minmax(220px,1fr)_minmax(0,1.5fr)]">
      <header className="grid content-start gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-[15px] font-bold leading-snug">{block.question}</h3>
          <DirectionChip direction={block.direction} />
        </div>
        <p className="text-13 leading-relaxed">{block.answer}</p>
        {block.asOf ? <p className="text-[11px] text-muted-foreground">As of {fmtDate(block.asOf)}</p> : null}
      </header>
      {block.facts.length ? (
        <ul className="grid self-start border-t border-border @2xl:border-t-0">
          {block.facts.map((f) => {
            const sig = byKey(f.signalKey);
            const body = (
              <>
                <span className="text-tiny text-muted-foreground">{f.label}</span>
                <span className={cn('text-right text-13 font-semibold tnum', f.tone === 'up' && 'text-up', f.tone === 'down' && 'text-down')}>{f.value}</span>
                {f.note ? <span className="col-span-2 text-[11px] leading-snug text-muted-foreground">{f.note}</span> : null}
              </>
            );
            return (
              <li key={f.label} className="border-b border-border last:border-b-0">
                {sig ? (
                  <button type="button" onClick={() => open(sig)} title="Open the evidence behind this figure"
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-1 py-2 text-left hover:bg-accent">
                    {body}
                  </button>
                ) : <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-1 py-2">{body}</div>}
              </li>
            );
          })}
        </ul>
      ) : <Fine>Nothing in this part of the question could be measured for this company.</Fine>}
      </div>
      <button type="button" aria-expanded={more} onClick={() => setMore((o) => !o)}
        className="mt-3 inline-flex items-center gap-1 justify-self-start text-tiny text-primary">
        {more ? 'Hide the signals' : `${signals.length} signal${signals.length === 1 ? '' : 's'} behind this`}
        <Chevron className={cn('transition-transform', more && 'rotate-90')} />
      </button>
      {news && symbol ? <WhatHappened news={news} symbol={symbol} /> : null}
      {more ? (
        <div className="mt-2 grid gap-0.5 border-t border-border pt-1.5">
          {signals.map((s: any) => <SignalRow key={s.id} sig={s} />)}
          {gaps.length ? <p className="px-2 pt-1.5 text-[11px] text-muted-foreground">Not measured: {gaps.map((g: any) => g.name).join(', ')}.</p> : null}
        </div>
      ) : null}
    </article>
  );
}

/* ---- 5. how it is built, folded away --------------------------------------------- */

export function HowBuilt({ state }: { state: Built }) {
  const { result, story } = state;
  const gaps: any[] = story.unconfirmed;
  const cats = result.categories.slice().sort((x: any, y: any) => y.weight - x.weight);
  return (
    <details className="group rounded-[14px] border border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-[15px] font-bold">
        How this reading is built
        <Chevron className="transition-transform group-open:rotate-90" />
      </summary>
      <div className="grid gap-6 border-t border-border px-6 py-5">
        <StandingNotice />
        <section className="grid gap-3">
          <h3 className="text-13 font-bold">Every category, by weight</h3>
          <SecBody>
            Version {CALC_VERSION}. The direction above is cut from the weighted mean of the categories that apply; the blocks group them by question.
            Workforce and industry show their reading as context and carry no weight. A category that does not apply to this company — attention, above
            $50bn — leaves the reading rather than counting as a gap.
          </SecBody>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 max-sm:grid-cols-1">
            {cats.map((c: any) => <CategoryCard key={c.id} cat={c} />)}
          </div>
        </section>
        <section className="grid gap-3">
          <h3 className="text-13 font-bold">What it could not see</h3>
          {gaps.length ? (
            <ul className="grid gap-3">
              {gaps.map((g, i) => (
                <li key={i} className="border-t border-border pt-2.5 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-13 font-semibold">{g.name}</span>
                    <span className="text-micro uppercase tracking-[.05em] text-muted-foreground">{g.categoryTitle}</span>
                  </div>
                  {g.note ? <p className="mt-1 max-w-[100ch] text-tiny leading-[1.65] text-muted-foreground">{g.note}</p> : null}
                  <p className="mt-1 text-tiny"><i className="not-italic text-muted-foreground">Would need: </i>{g.provider}</p>
                </li>
              ))}
            </ul>
          ) : <SecBody>Every measurement the engine looks for was available.</SecBody>}
        </section>
        <section className="grid gap-3">
          <h3 className="text-13 font-bold">Sources</h3>
          <ul className="grid">
            {story.sources.map((s: any, i: number) => (
              <li key={i} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <SourceLine src={s} />
                <span className="flex-none text-micro text-muted-foreground">{s.uses} signal{s.uses === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
          <Fine>A link appears only where a feed supplied one; this app does not construct filing URLs.</Fine>
        </section>
      </div>
    </details>
  );
}

/* ---- the page ------------------------------------------------------------------ */

function Page({ state, a }: { state: Built; a: Analysis }) {
  const { result, story, brief, capturedAt } = state;
  /* Facts and rows carry a signal key, never a copy of the signal, so the
     drawer opened from a fact and from a signal row shows the same object. */
  const index = React.useMemo(
    () => new Map<string, any>(result.categories.flatMap((c: any) => c.signals).map((s: any) => [s.id, s])),
    [result],
  );

  return (
    <div className="grid gap-[34px] pb-12">
      <Answer state={state} />
      <section className="grid gap-[18px]">
        {brief.blocks.map((b) => (
          <BlockCard key={b.id} block={b} result={result} index={index}
            news={b.id === 'market' ? brief.news : undefined} symbol={String(a.facts?.symbol || '')} />
        ))}
      </section>
      {/* Outside the score: what management and the firms say, each quoted
          or named and dated. */}
      <ManagementVoice a={a} />
      <FirmViews a={a} bag={state.bag} capturedAt={capturedAt} />
      {story.whatWouldConfirm.length ? (
        <section className="grid gap-3.5">
          <SecTitle>What would confirm this</SecTitle>
          <SecBody>The measurement that would settle each question the reading rests on, and when it next arrives.</SecBody>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            {story.whatWouldConfirm.map((w: any, i: number) => (
              <div key={i} className="rounded-xl border border-border px-4 py-3.5">
                <h4 className="mb-1.5 text-13 font-bold">{w.categoryTitle}</h4>
                <p className="text-13 leading-relaxed text-muted-foreground">{w.text}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <HowBuilt state={state} />
      {hasApiKey() ? null : (
        <Fine>
          Live data is unavailable, so this reading is built from a saved copy{capturedAt ? ` of ${capturedAt}` : ''}, with prices, the 13F
          aggregate, ratings and the earnings calendar refreshed to the dates shown above. Every figure is real filed or published data; what it is
          not is live.
        </Fine>
      )}
    </div>
  );
}

/* ---- the tab --------------------------------------------------------------------- */

/**
 * The reading for one company: its feeds (some fetched now — they are not in
 * the report's dataset), the eleven providers, the score, the classification,
 * the narrative and the three-question brief. One build, shared by every view.
 */
export function useAlphaReading(a: Analysis): { state: Built | null; error: string | null } {
  const symbol = a.facts?.symbol || a.ds?.symbol || '';
  const [state, setState] = React.useState<Built | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    setState(null);
    setError(null);
    // The report's own benchmark series, so the price and macro providers get
    // a relative reading; `analyse` already paid for these.
    const benchmarks = a.benchmarks || (a.ds as any)?.snapshotExtras?.benchmarks || null;
    loadAlphaBag(symbol, { ds: a.ds })
      .then((bag: any) => {
        if (!live) return;
        const quant = a.scores?.overall?.score ?? null;
        const signals = runProviders(bag, { symbol, marketCap: a.facts?.marketCap ?? null, benchmarks, quantScore: quant });
        const result = scoreAlpha(signals);
        const classification = classify(result, quant);
        const story = narrate(result, classification, symbol);
        const brief = buildBrief({ ...bag, __benchmarks: benchmarks || bag.__benchmarks }, result);
        setState({ result, classification, story, brief, quant, capturedAt: bagCapturedAt(bag), bag });
      })
      .catch((err: any) => {
        console.error('alpha reading', err);
        if (live) setError(String(err?.message || err));
      });
    return () => { live = false; };
  }, [a, symbol]);

  return { state, error };
}

export function AlphaTab({ a }: { a: Analysis }) {
  const symbol = a.facts?.symbol || a.ds?.symbol || '';
  const { state, error } = useAlphaReading(a);

  if (error) {
    return (
      <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
        <OCard span={12} id="alpha-error">
          <OHead title="Alpha Signal" />
          <Notice error>The Alpha Signal could not be built for this company — {error}. Every other tab on this report is unaffected.</Notice>
        </OCard>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
        <OCard span={12} id="alpha-loading">
          <OHead title="Alpha Signal" />
          <p className="text-sm text-muted-foreground">Reading the evidence for {symbol}…</p>
          <p className="mt-1 text-tiny text-muted-foreground/80">
            Quarterly statements, the analyst grade history, price targets, 13F aggregates and insider filings. Some of these feeds are not part of a
            company report, so they are being fetched now.
          </p>
          <Skeleton className="mt-4 h-24" />
          <Skeleton className="mt-2.5 h-3.5" />
          <Skeleton className="mt-2.5 h-3.5 w-[70%]" />
        </OCard>
      </div>
    );
  }
  return <EvidenceHost><Page state={state} a={a} /></EvidenceHost>;
}
