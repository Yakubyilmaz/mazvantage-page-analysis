'use client';

/* ==========================================================================
   Maz Vantage — the Alpha Signal tab

   One company, full depth: every provider, every signal, and the evidence
   behind each. It fetches after it renders — five of its feeds are not in the
   report's dataset, deliberately — and the report keeps a visited panel
   mounted, so this happens on first visit and never again for that company.

   The order of the page is an argument: score, then what it is built on,
   then what it could not see, then the evidence, then the timeline, then what
   would settle it. The gaps come before the findings, because a list of
   findings read first is very hard to un-believe afterwards.
   ========================================================================== */

import * as React from 'react';
import { fmtDate, isNum } from '@/lib/format';
import { hasApiKey } from '@/lib/fmp';
import { bagCapturedAt, loadAlphaBag, runProviders } from '@/lib/alpha-providers';
import { classify, pairNote, scoreAlpha } from '@/lib/alpha-score';
import { narrate } from '@/lib/alpha-narrative';
import { CATEGORY_BY_ID } from '@/lib/alpha-signals';
import type { Analysis } from '@/lib/model';
import {
  ArchetypeBlock, Badge, CategoryCard, EvidenceHost, QualityBadge, ScoreBlock, SourceLine, StandingNotice, StatusDot,
  badgeTone, useEvidence,
} from '@/components/alpha/alpha-view';
import { Notice, OCard, OHead } from '@/components/report/ui';
import { Chevron } from '@/components/market/market-ui';
import { Skeleton } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

type Built = { result: any; classification: any; story: any; quant: number | null; capturedAt: string | null };

const SecTitle = ({ children }: { children: React.ReactNode }) => <h2 className="text-[19px] font-bold tracking-[-.02em]">{children}</h2>;
const SecBody = ({ children }: { children: React.ReactNode }) => <p className="max-w-[100ch] text-13 leading-[1.7] text-muted-foreground">{children}</p>;
const Fine = ({ children }: { children: React.ReactNode }) => <p className="max-w-[100ch] text-tiny italic leading-[1.7] text-muted-foreground">{children}</p>;

/* ---- 1. the head ----------------------------------------------------------- */

function Head({ state }: { state: Built }) {
  const nav = useNav();
  const { result, classification, quant } = state;
  return (
    <section className="grid gap-4">
      <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <ScoreBlock result={result} quantScore={quant} />
        <ArchetypeBlock classification={classification} />
      </div>
      <p className="max-w-[110ch] border-l-[3px] border-border bg-muted px-[18px] py-3.5 text-13 leading-[1.7]">
        <b>Reading the two ratings together. </b>{pairNote(quant, result.score)}
        {isNum(quant) ? (
          <button type="button" onClick={() => nav.openAnalysis?.()} className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
            See the quant rating <Chevron />
          </button>
        ) : null}
      </p>
    </section>
  );
}

/* ---- 2. what it could not see, before the findings --------------------------- */

function Coverage({ result, story }: { result: any; story: any }) {
  const gaps: any[] = story.unconfirmed;
  const dark = result.categories.filter((c: any) => !isNum(c.score));
  // Styled as a panel rather than a warning: this is information, not an
  // error, and a red box would train readers to skip it.
  return (
    <section className="grid gap-3.5 rounded-[14px] border border-dashed border-border bg-muted/70 px-6 py-5">
      <SecTitle>What this score could not see</SecTitle>
      <SecBody>
        Read before the findings, not after them. {result.coveragePct}% of the model&apos;s weight was measurable for this company; the rest is
        listed here. A category with no data is dropped from the score rather than scored zero, so the number above describes what was measured
        and nothing else.
      </SecBody>
      {dark.length ? (
        <div className="flex flex-wrap gap-[7px]">
          {dark.map((c: any) => (
            <span key={c.id} title={CATEGORY_BY_ID[c.id]?.question || ''} className="cursor-help rounded-[7px] border border-dashed border-border px-[11px] py-[5px] text-tiny text-muted-foreground">
              {c.title} · {Math.round(c.weight * 100)}% weight unmeasured
            </span>
          ))}
        </div>
      ) : <SecBody>Every category returned at least one scoreable signal.</SecBody>}
      {gaps.length ? (
        <ul className="grid gap-3.5">
          {gaps.map((g, i) => (
            <li key={i} className="border-t border-border pt-3">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="text-sm font-semibold">{g.name}</span>
                <span className="text-micro uppercase tracking-[.05em] text-muted-foreground">{g.categoryTitle}</span>
              </div>
              {g.note ? <p className="mt-1.5 max-w-[100ch] text-tiny leading-[1.65] text-muted-foreground">{g.note}</p> : null}
              <p className="mt-1.5 text-tiny"><i className="not-italic text-muted-foreground">Would need: </i>{g.provider}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ---- 5. the evidence, both ways -------------------------------------------- */

function Evidence({ story, index }: { story: any; index: Map<string, any> }) {
  const open = useEvidence();
  const col = (title: string, items: any[], tone: 'up' | 'down', empty: string) => (
    <div className="rounded-xl border border-border px-5 py-[18px]">
      <h3 className={cn('mb-3 text-13 font-bold uppercase tracking-[.06em]', tone === 'up' ? 'text-up' : 'text-down')}>{title}</h3>
      {items.length ? (
        <ul className="grid gap-1">
          {items.slice(0, 8).map((i, k) => (
            <li key={k}>
              <button type="button" onClick={() => { const sig = index.get(i.signalId); if (sig) open(sig); }}
                className="grid w-full gap-[5px] rounded-[7px] px-2 py-[9px] text-left hover:bg-accent">
                <span className="text-13 leading-[1.55]">{i.text}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{i.categoryTitle}</span>
                  <Badge tone={badgeTone(i.quality)}>{i.qualityLabel}</Badge>
                  {i.sourceDate ? <span className="text-[10px] text-muted-foreground">{i.freshness?.text || ''}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-tiny italic text-muted-foreground">{empty}</p>}
    </div>
  );
  return (
    <section className="grid gap-3.5">
      <SecTitle>The evidence</SecTitle>
      <SecBody>
        Only source-backed items appear here, in both columns. There is no verdict under them: an early-stage reading that resolves to a word is a
        word doing work the evidence has not done.
      </SecBody>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-[18px]">
        {col('Improving', story.improving, 'up', 'No positive signal cleared the threshold.')}
        {col('Deteriorating', story.deteriorating, 'down', 'No negative signal cleared the threshold.')}
      </div>
      {story.risks.length ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-4">
          <h3 className="mb-2 text-tiny font-semibold uppercase tracking-[.06em] text-muted-foreground">Read these with care</h3>
          <ul className="grid list-disc gap-[5px] pl-[18px]">
            {story.risks.slice(0, 6).map((r: any, i: number) => <li key={i} className="text-tiny leading-relaxed text-muted-foreground">{r.text}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/* ---- 6. the timeline --------------------------------------------------------- */

function Timeline({ result }: { result: any }) {
  const open = useEvidence();
  const dated = result.categories.flatMap((c: any) => c.signals)
    .filter((s: any) => s.sourceDate && !Number.isNaN(new Date(s.sourceDate).getTime()))
    .sort((x: any, y: any) => new Date(y.sourceDate).getTime() - new Date(x.sourceDate).getTime());
  return (
    <section className="grid gap-3.5">
      <SecTitle>Signal timeline</SecTitle>
      {!dated.length ? <SecBody>No dated evidence was available for this company.</SecBody> : (
        <>
          <SecBody>
            Every dated signal, newest first, by the date of the filing or publication behind it rather than by when this page read it. A 13F sits
            at its filing deadline, not at the quarter end it describes.
          </SecBody>
          <ol className="grid">
            {dated.slice(0, 14).map((s: any) => (
              <li key={s.id} className="grid grid-cols-[96px_20px_1fr] items-start gap-2.5 border-b border-border py-[11px]">
                <span className="pt-[3px] text-micro text-muted-foreground tnum">{fmtDate(s.sourceDate)}</span>
                <span className="flex justify-center pt-1.5"><StatusDot status={s.status} /></span>
                <button type="button" onClick={() => open(s)} className="group grid gap-[3px] text-left">
                  <span className="text-13 font-semibold group-hover:text-primary">{s.name}</span>
                  <span className="text-tiny leading-normal text-muted-foreground">{s.interpretation || ''}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <QualityBadge sig={s} />
                    <span className="text-[10px] text-muted-foreground">{s.source?.publisher || ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/* ---- the page ------------------------------------------------------------------ */

function Page({ state }: { state: Built }) {
  const { result, story, capturedAt } = state;
  /* Narrative items carry a signal id, never a copy of the signal, so the
     drawer opened from a summary line and from a category card show the same
     object. The index is per render, not module scope. */
  const index = React.useMemo(
    () => new Map<string, any>(result.categories.flatMap((c: any) => c.signals).map((s: any) => [s.id, s])),
    [result],
  );
  // Weight order, not score order: the page reads the same way for every
  // company rather than arguing for whatever happens to be highest.
  const cats = result.categories.slice().sort((x: any, y: any) => y.weight - x.weight);

  return (
    <div className="grid gap-[34px] pb-12">
      <Head state={state} />
      <Coverage result={result} story={story} />
      <section className="grid gap-3.5">
        <SecTitle>Summary</SecTitle>
        <p className="max-w-[96ch] text-[15px] leading-[1.75]">{story.summary}</p>
        <Fine>
          Assembled from the structured signals below — every figure in it is a field on one of them, and no sentence here was written about this
          company specifically. No language model is involved, which is why the prose is flat and why no value in it can be invented.
        </Fine>
      </section>
      <section className="grid gap-3.5">
        <SecTitle>The eleven categories</SecTitle>
        <SecBody>In weight order, which is the same on every company. Open a category for its signals, and a signal for the arithmetic and the source behind it.</SecBody>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4 max-sm:grid-cols-1">
          {cats.map((c: any) => <CategoryCard key={c.id} cat={c} />)}
        </div>
      </section>
      <Evidence story={story} index={index} />
      <Timeline result={result} />
      {story.whatWouldConfirm.length ? (
        <section className="grid gap-3.5">
          <SecTitle>What would confirm this</SecTitle>
          <SecBody>
            The measurements that would settle each question this engine asked. This is the closest the page comes to a conclusion, and it is on
            purpose: an early reading is not an answer, it is a list of things about to become answerable.
          </SecBody>
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
      <section className="grid gap-3.5">
        <SecTitle>Sources</SecTitle>
        <SecBody>
          {story.sources.length} distinct sources behind the signals above. A link appears only where a feed supplied one — this app will not
          construct a plausible filing URL, because a citation that is usually right is not a citation.
        </SecBody>
        <ul className="grid">
          {story.sources.map((s: any, i: number) => (
            <li key={i} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
              <SourceLine src={s} />
              <span className="flex-none text-micro text-muted-foreground">{s.uses} signal{s.uses === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
        <StandingNotice />
        {/* The capture notice: the figures are real but frozen, while anything
            measured against today (freshness, days until the next report)
            moves on without them. */}
        {hasApiKey() ? null : (
          <Fine>
            {capturedAt
              ? `Live data is unavailable, so this reading was built from a saved copy of ${capturedAt}. Every figure in it is real filed or published data — the quarterly statements, the analyst grade history, the price-target summary and the 13F aggregate are all present, which is why coverage is high. What it is not is live: freshness and any days-until reading are measured against today, not against the date it was saved.`
              : 'Live data is unavailable, so this reading was built from a saved copy.'}
          </Fine>
        )}
      </section>
    </div>
  );
}

/* ---- the tab --------------------------------------------------------------------- */

export function AlphaTab({ a }: { a: Analysis }) {
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
        setState({ result, classification, story, quant, capturedAt: bagCapturedAt(bag) });
      })
      .catch((err: any) => {
        console.error('alpha tab', err);
        if (live) setError(String(err?.message || err));
      });
    return () => { live = false; };
  }, [a, symbol]);

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
            Eleven signal providers over quarterly statements, the analyst grade history, price targets, 13F aggregates and insider filings. Five of
            these feeds are not part of a company report, so they are being fetched now.
          </p>
          <Skeleton className="mt-4 h-24" />
          <Skeleton className="mt-2.5 h-3.5" />
          <Skeleton className="mt-2.5 h-3.5 w-[70%]" />
        </OCard>
      </div>
    );
  }
  return <EvidenceHost><Page state={state} /></EvidenceHost>;
}
