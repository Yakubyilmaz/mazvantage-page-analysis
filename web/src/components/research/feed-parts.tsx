'use client';

/* ==========================================================================
   The reusable pieces of the Research feed

   Ported from the first half of the legacy `feed.js`: the ticker link, the
   two rating chips, the article card, row and lead, the head and section
   strip every Research page shares, and the sample-data line. The feed page
   itself is `components/research/research-feed.tsx`.

   Every ticker printed anywhere in Research goes through `TickerLink`, so an
   article always offers a route into the data behind it.
   ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { ago } from '@/lib/format';
import { logoUrl } from '@/lib/fmp';
import { CATEGORIES, mergeQuery, quantTone, quantVerdict, shariahLabel, shariahTone, typePath } from '@/lib/taxonomy';
import { SAMPLE_NOTICE, articleUrl, articlesForTicker, articlesReady, companyName, loadArticles } from '@/lib/articles';
import { InstrumentMark } from '@/components/market/market-ui';
import { Logo, OCard, OHead } from '@/components/report/ui';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';
import { BrandMark } from '@/components/shell/brand';

export interface Article {
  slug: string;
  title: string;
  subtitle?: string;
  summary?: string;
  author: string;
  publishedAt: string;
  readingMinutes?: number;
  tickers: string[];
  quantRating?: number;
  quantLetter?: string;
  shariahStatus?: string;
  standardsPassed?: number;
  standardsOf?: number;
  stockTab?: string;
  [k: string]: any;
}

const TONE_TEXT: Record<string, string> = {
  good: 'text-up', warn: 'text-grade-mid', bad: 'text-down', muted: 'text-muted-foreground',
  pass: 'text-up', fail: 'text-down', mixed: 'text-grade-mid',
};
const TONE_CHIP: Record<string, string> = {
  good: 'bg-up/10 text-up', warn: 'bg-grade-mid-bg text-grade-mid', bad: 'bg-down/10 text-down', muted: 'bg-accent text-muted-foreground',
  pass: 'bg-up/10 text-up', fail: 'bg-down/10 text-down', mixed: 'bg-grade-mid-bg text-grade-mid',
};

/** A ticker, as a link to that company's report. */
export function TickerLink({ ticker, tab = null, withName = false }: { ticker: string; tab?: string | null; withName?: boolean }) {
  const nav = useNav();
  const name = companyName(ticker);
  return (
    <button
      type="button"
      title={`Open the ${name} report`}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); nav.goSymbolTab(tab, ticker); }}
      className="relative z-[1] inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pl-1 pr-2.5 text-tiny hover:border-primary hover:text-primary"
    >
      {/* A pill that already prints the ticker gains nothing from a letter square. */}
      <Logo url={logoUrl(ticker)} label={ticker} size="sm" fallback="none" className="size-4 rounded-full" />
      <b className="font-semibold">{ticker}</b>
      {withName && name !== ticker ? <span className="text-muted-foreground">{name}</span> : null}
    </button>
  );
}

/** Score, then the word — never the word alone: "Buy" spans 3.00 to 3.99. */
export function QuantBadge({ score, letter = null, compact = false }: { score: unknown; letter?: string | null; compact?: boolean }) {
  if (typeof score !== 'number') return null;
  const word = quantVerdict(score);
  return (
    <span title={`Maz Vantage quant composite: ${score.toFixed(2)} of 5${letter ? ` (${letter})` : ''} — ${word}`}
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-tiny', TONE_CHIP[quantTone(score)] || TONE_CHIP.muted)}>
      <i className="not-italic opacity-75">Quant</i>
      <b className="font-bold tnum">{score.toFixed(2)}</b>
      {compact ? null : <span>{word}</span>}
    </span>
  );
}

/** The Shariah badge, with the pass count beside the word wherever it is known. */
export function ShariahBadge({ status, passed = null, of = null }: { status: unknown; passed?: number | null; of?: number | null }) {
  const label = shariahLabel(status);
  if (!label) return null;
  const count = passed != null && of != null ? `${passed}/${of}` : null;
  return (
    <span title={count ? `${label} — passes ${passed} of ${of} published screening methodologies` : `${label} — mechanical screen, not a scholarly ruling`}
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-tiny', TONE_CHIP[shariahTone(status)] || TONE_CHIP.muted)}>
      <i className="not-italic opacity-75">Shariah</i>
      <b className="font-semibold">{label}</b>
      {count ? <span className="tnum">{count}</span> : null}
    </span>
  );
}

/** Up to three company marks, overlapped, for the top of a card. */
function Marks({ tickers, large = false }: { tickers: string[]; large?: boolean }) {
  return (
    <span className="flex -space-x-2" aria-hidden="true">
      {tickers.slice(0, 3).map((t) => (
        <InstrumentMark key={t} row={{ symbol: t, kind: 'stock' }} large={large} className="ring-2 ring-background" />
      ))}
    </span>
  );
}

/** "NVDA", "NVDA · AMD", "NVDA · AMD · +2". */
function tickerLine(tickers: string[]) {
  if (!tickers.length) return 'Market-wide';
  const head = tickers.slice(0, 2).join(' · ');
  return tickers.length > 2 ? `${head} · +${tickers.length - 2}` : head;
}

function ScoreBlock({ a, large = false }: { a: Article; large?: boolean }) {
  if (typeof a.quantRating !== 'number') return null;
  return (
    <span title={`Maz Vantage quant composite ${a.quantRating.toFixed(2)} of 5${a.quantLetter ? ` (${a.quantLetter})` : ''}`}
      className={cn('ml-auto grid justify-items-end leading-tight', TONE_TEXT[quantTone(a.quantRating)])}>
      <b className={cn('font-bold tnum', large ? 'text-2xl' : 'text-base')}>{a.quantRating.toFixed(2)}</b>
      <span className="text-micro font-semibold">{quantVerdict(a.quantRating)}</span>
    </span>
  );
}

function Byline({ a }: { a: Article }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-tiny text-muted-foreground">
      <span className="grid size-5 place-items-center rounded-full bg-black text-white" aria-hidden="true">
        <BrandMark className="w-3.5" />
      </span>
      <span className="font-medium text-foreground">{a.author}</span>
      <span>·</span>
      <time dateTime={a.publishedAt}>{ago(a.publishedAt)}</time>
      {a.readingMinutes ? (<><span>·</span><span>{a.readingMinutes} min read</span></>) : null}
    </p>
  );
}

/**
 * One article, as a card. The headline is a real link stretched over the
 * whole card, so middle-click and "copy link address" work; the ticker
 * buttons sit above it and open the company instead.
 */
export function ArticleCard({ a }: { a: Article }) {
  const single = a.tickers.length === 1;
  return (
    <article className="relative flex flex-col rounded-xl border border-border p-4 transition-colors hover:bg-muted">
      <div className="mb-3 flex items-center gap-2.5">
        <Marks tickers={a.tickers} />
        <span className="min-w-0 leading-tight">
          <b className="block text-13 font-semibold">{tickerLine(a.tickers)}</b>
          {single ? <small className="block truncate text-micro text-muted-foreground">{companyName(a.tickers[0])}</small> : null}
        </span>
        <ScoreBlock a={a} />
      </div>
      <div className="grid flex-1 content-start gap-1.5">
        <p className="text-micro font-semibold uppercase tracking-[.05em] text-muted-foreground">{typePath(a)}</p>
        <h3 className="text-[15px] font-semibold leading-snug">
          <Link href={articleUrl(a.slug)} className="after:absolute after:inset-0 after:content-[''] hover:text-primary">{a.title}</Link>
        </h3>
        {a.summary ? <p className="line-clamp-2 text-13 leading-relaxed text-muted-foreground">{a.summary}</p> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Byline a={a} />
        <ShariahBadge status={a.shariahStatus} passed={a.standardsPassed} of={a.standardsOf} />
      </div>
    </article>
  );
}

/** The featured piece: the headline given room, and the ratings beside it. */
export function LeadCard({ a }: { a: Article }) {
  return (
    <article className="grid overflow-hidden rounded-xl border border-border md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-3 p-6">
        <p className="text-micro font-semibold uppercase tracking-[.05em] text-muted-foreground">{typePath(a)}</p>
        <h2 className="text-2xl font-bold leading-tight tracking-[-.02em]">
          <Link href={articleUrl(a.slug)} className="hover:text-primary">{a.title}</Link>
        </h2>
        {a.subtitle || a.summary ? <p className="text-sm leading-relaxed text-muted-foreground">{a.subtitle || a.summary}</p> : null}
        {a.tickers.length ? (
          <div className="flex flex-wrap gap-1.5">
            {a.tickers.slice(0, 4).map((t) => <TickerLink key={t} ticker={t} tab={a.stockTab} withName={a.tickers.length <= 2} />)}
          </div>
        ) : null}
        <Byline a={a} />
      </div>
      <div className="grid content-center gap-4 border-border bg-muted p-6 max-md:border-t md:border-l">
        <Marks tickers={a.tickers} large />
        <p className="font-semibold">{a.tickers.length === 1 ? companyName(a.tickers[0]) : tickerLine(a.tickers)}</p>
        <div className="grid gap-3">
          {typeof a.quantRating === 'number' ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-tiny uppercase tracking-[.06em] text-muted-foreground">Quant rating</span>
              <ScoreBlock a={a} large />
            </div>
          ) : null}
          {shariahLabel(a.shariahStatus) ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-tiny uppercase tracking-[.06em] text-muted-foreground">Shariah screen</span>
              <span className={cn('grid justify-items-end leading-tight', TONE_TEXT[shariahTone(a.shariahStatus)])}>
                <b className="text-base font-bold">{shariahLabel(a.shariahStatus)}</b>
                {a.standardsPassed != null ? <span className="text-micro">{a.standardsPassed} of {a.standardsOf} standards</span> : null}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** The compact variant: a headline and its meta. */
export function ArticleRow({ a }: { a: Article }) {
  return (
    <Link href={articleUrl(a.slug)} className="group grid gap-1 border-b border-border py-3 last:border-b-0">
      <span className="text-sm font-semibold leading-snug group-hover:text-primary">{a.title}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-tiny text-muted-foreground">
        <span>{typePath(a)}</span>
        <span>·</span>
        <time dateTime={a.publishedAt}>{ago(a.publishedAt)}</time>
      </span>
    </Link>
  );
}

const DEFAULT_BLURB = 'News says what happened. Research says what it means for the numbers.';

/** The big title, the way the market canvas opens a page. */
export function ResearchHero({ title, blurb = DEFAULT_BLURB }: { title: string; blurb?: string | null }) {
  return (
    <header className="pb-7 pt-12">
      <div className="mb-[11px] text-micro font-semibold tracking-[.16em] text-muted-foreground">RESEARCH</div>
      <h1 className="text-[clamp(32px,3.8vw,58px)] font-bold leading-tight tracking-[-.045em]">{title}</h1>
      {blurb ? <div className="mt-[19px] text-tiny text-muted-foreground">{blurb}</div> : null}
    </header>
  );
}

/** The canvas's sticky section strip (`.mh-navigation`). */
export function StickyStrip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <nav aria-label={label}
      className={cn('sticky top-[var(--utilbar-h)] z-[310] -mx-gutter flex items-center gap-[25px] overflow-x-auto border-b border-border bg-background px-gutter scroll-none', className)}>
      {children}
    </nav>
  );
}

export function StripTab({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-current={active ? 'page' : undefined} onClick={onClick}
      className={cn('flex-none border-b-[3px] border-transparent py-[15px] text-[15px] text-muted-foreground hover:text-foreground',
        active && 'border-foreground font-semibold text-foreground')}>
      {children}
    </button>
  );
}

/**
 * The sections: the feed, its seven categories, and Investing Strategy. From
 * the feed a tab keeps the other filters; from anywhere else it opens clean.
 */
export function ResearchStrip({ active, query = null }: { active: string; query?: Record<string, any> | null }) {
  const nav = useNav();
  const to = (category: string | null) => () => nav.goQuery('research', 'latest',
    query ? mergeQuery(query, { category, type: null }) : (category ? { category } : {}));
  return (
    <StickyStrip label="Research sections">
      <StripTab active={active === 'latest'} onClick={to(null)}>Latest</StripTab>
      {CATEGORIES.map((c: any) => <StripTab key={c.key} active={active === c.key} onClick={to(c.key)}>{c.label}</StripTab>)}
      <StripTab active={active === 'letters'} onClick={() => nav.goView('research', 'letters')}>Letters &amp; Outlooks</StripTab>
      <StripTab active={active === 'strategy'} onClick={() => nav.goView('research', 'strategy')}>Investing Strategy</StripTab>
      <StripTab active={active === 'calculators'} onClick={() => nav.goView('research', 'calculators')}>Calculators</StripTab>
    </StickyStrip>
  );
}

/* ---------- filter controls, shared by the feed and Letters & Outlooks ---------- */

/** A filter pill; `aria-pressed` carries the state. */
export function RsPill({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={!!active} title={title} onClick={onClick}
      className={cn('whitespace-nowrap rounded-full border border-border px-3.5 py-1.5 text-13 font-medium hover:bg-accent',
        active && 'border-foreground bg-foreground text-background hover:bg-foreground')}>
      {children}
    </button>
  );
}

export const inputCls = 'h-9 w-full rounded-md border border-border bg-background px-2 text-13';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{label}{children}</label>;
}

/** A text box that writes one query key on Enter. */
export function FilterText({ label, value, placeholder, onApply }: { label: string; value: string; placeholder: string; onApply: (v: string) => void }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <Field label={label}>
      <input type="search" placeholder={placeholder} value={text} autoComplete="off" spellCheck={false} className={cn(inputCls, 'font-normal normal-case tracking-normal')}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onApply(text.trim()); }} />
    </Field>
  );
}

/** The standing disclosure, as one quiet line rather than a warning box. */
export function SampleBanner() {
  return (
    <div role="note" className="my-4 flex items-start gap-2.5 rounded-lg bg-muted px-3.5 py-2.5 text-tiny text-muted-foreground">
      <span aria-hidden="true" className="grid size-4 flex-none place-items-center rounded-full border border-muted-foreground/50 text-[10px] font-bold">i</span>
      <p className="[&_b]:text-foreground" dangerouslySetInnerHTML={{ __html: SAMPLE_NOTICE }} />
    </div>
  );
}

export function RelatedResearchCard({ articles, title = 'Latest research', span = 6 }: { articles: Article[] | null | undefined; title?: string; span?: 4 | 6 | 8 | 12 }) {
  const nav = useNav();
  if (!articles?.length) return null;
  return (
    <OCard span={span} id="rel-research">
      <OHead title={title} />
      <div className="grid">{articles.map((a) => <ArticleRow key={a.slug} a={a} />)}</div>
      <button type="button" onClick={() => nav.goQuery('research', 'latest', {})}
        className="mt-3 self-start text-13 font-semibold text-muted-foreground hover:text-foreground">
        All research →
      </button>
    </OCard>
  );
}

/**
 * Our own articles on one ticker. The article store loads separately and no
 * page waits for it: `null` until it lands, then the (possibly empty) list.
 */
export function useTickerArticles(sym: string | null | undefined, n = 4): Article[] | null {
  const [rows, setRows] = React.useState<Article[] | null>(() => (articlesReady() ? articlesForTicker(sym, n) : null));
  React.useEffect(() => {
    let live = true;
    loadArticles().then(() => { if (live) setRows(articlesForTicker(sym, n)); }).catch(() => { /* stays empty */ });
    return () => { live = false; };
  }, [sym, n]);
  return rows;
}
