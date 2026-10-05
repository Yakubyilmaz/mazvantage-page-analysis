'use client';

/* ==========================================================================
   Maz Vantage — the Research menu (`/research/<sub>`)

   Four destinations: the editorial feed (`latest`), one article (`article`,
   by `?slug=`), Letters & Outlooks (`letters`, other houses' published work,
   in `components/research/letters-page.tsx`), and Investing Strategy — the
   page that says what this product believes. The rest of the menu opens
   things that already exist elsewhere.

   The feed's filters are the URL: filtering thirty articles in memory is free,
   so every pill click writes the address and the back button steps back
   through filters. The article body is typed blocks, never HTML — a store a
   language model may one day write into cannot inject markup, and an unknown
   block renders nothing rather than breaking the page.
   ========================================================================== */

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { ago, fmtDate } from '@/lib/format';
import { toneForLetter } from '@/lib/grading';
import { FACTOR_BY_KEY, FACTOR_KEYS } from '@/lib/factors';
import { NAV_BY_VIEW } from '@/lib/nav';
import {
  CATEGORIES, CATEGORY_BY_KEY, MAX_SCORE, QUANT_FILTERS, SECTORS, SHARIAH_FILTERS, SORTS, THEMES, TOPIC_PILLS,
  activeChips, categoryLabel, isFiltered, mergeQuery, parseQuery, sectorSlug, themeLabel, typeLabel, typePath,
} from '@/lib/taxonomy';
import { PER_PAGE, articleBySlug, articlesReady, loadArticles, queryArticles, relatedArticles } from '@/lib/articles';
import {
  ArticleCard, ArticleRow, Field, FilterText, LeadCard, QuantBadge, ResearchHero, ResearchStrip, RsPill, SampleBanner, ShariahBadge, TickerLink,
  inputCls, type Article,
} from '@/components/research/feed-parts';
import { PageFrame } from '@/components/pages/page-parts';
import { DataTable, Notice, OCard, OHead, StatLine, StatLines } from '@/components/report/ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { CalculatorsPage } from '@/components/pages/calculators-page';
import { ResearchReportTab } from '@/components/pages/research-report-tab';
import dynamic from 'next/dynamic';

/* Letters & Outlooks carries its whole library in code (hundreds of entries), so
   it loads only when its section opens rather than with every Research page. */
const LettersPage = dynamic(() => import('@/components/research/letters-page').then((m) => m.LettersPage), {
  loading: () => <div aria-busy="true" className="min-h-[60vh]" />,
});
import { cn } from '@/lib/cn';
import { BrandMark } from '@/components/shell/brand';

const DEFAULT_BLURB = 'News says what happened. Research says what it means for the numbers.';

/** The article store: `null` until loaded, then every article. */
function useArticleStore(): Article[] | null {
  const [all, setAll] = React.useState<Article[] | null>(() => articlesReady() || null);
  React.useEffect(() => {
    if (all) return;
    let live = true;
    loadArticles().then(() => { if (live) setAll(articlesReady() || []); }).catch(() => live && setAll([]));
    return () => { live = false; };
  }, [all]);
  return all;
}

/* ==========================================================================
   The feed
   ========================================================================== */

/* Module-level, like the legacy: a drawer that closed itself on every filter
   click would be unusable. */
let drawerOpen = false;

function Feed() {
  const nav = useNav();
  const params = useSearchParams();
  const query: any = React.useMemo(() => parseQuery(params?.toString() || ''), [params]);
  const all = useArticleStore();
  const [open, setOpen] = React.useState(drawerOpen);
  const go = (change: Record<string, any>) => nav.goQuery('research', 'latest', mergeQuery(query, change));
  const cat: any = (CATEGORY_BY_KEY as any)[query.category];

  const body = () => {
    if (!all) {
      return (
        <div aria-busy="true" className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5 pt-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="grid gap-2.5 rounded-xl border border-border p-4"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-5 w-11/12" /><Skeleton className="h-3 w-3/4" /></div>
          ))}
        </div>
      );
    }
    const result = queryArticles(query, { perPage: PER_PAGE, list: all });
    // Offered industries come from the loaded set, so none returns nothing.
    const industries = [...new Set(all.flatMap((a: any) => a.industries || []))].sort() as string[];
    const items: Article[] = result.items;
    // The first page opens on a featured piece and the two after it.
    const featured = result.page === 1 && items.length >= 3;
    const [lead, ...rest] = items;
    const chips = activeChips(query) as { key: string; label: string }[];
    const inDrawer = ['sector', 'industry', 'theme', 'rating', 'shariah', 'ticker', 'q'].filter((k) => query[k]).length;
    const on = (q: Record<string, any>) => Object.entries(q).every(([k, v]) => query[k] === v);

    return (
      <div className="grid gap-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {cat ? (
            <div role="group" aria-label={`${cat.label} kinds`} className="flex flex-wrap gap-2">
              <RsPill active={!query.type} onClick={() => go({ type: null })}>All {cat.label}</RsPill>
              {cat.types.map((t: any) => <RsPill key={t.key} active={query.type === t.key} onClick={() => go({ type: t.key })}>{t.label}</RsPill>)}
            </div>
          ) : (
            <div role="group" aria-label="Topics" className="flex flex-wrap gap-2">
              {/* A second click on an active shortcut clears it. */}
              {TOPIC_PILLS.map((t: any) => (
                <RsPill key={t.label} active={on(t.query)}
                  onClick={() => go(on(t.query) ? Object.fromEntries(Object.keys(t.query).map((k) => [k, null])) : t.query)}>{t.label}</RsPill>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <select aria-label="Sort" value={query.sort || 'latest'} onChange={(e) => go({ sort: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-13">
              {SORTS.map((s: any) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <Button variant="outline" size="sm" aria-expanded={open} aria-controls="research-filters"
              onClick={() => { drawerOpen = !open; setOpen(!open); }} className={cn(open && 'bg-accent')}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-none stroke-current stroke-2"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              Filters
              {inDrawer ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{inDrawer}</span> : null}
            </Button>
          </div>
        </div>

        {open ? (
          <div id="research-filters" className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 rounded-xl border border-border bg-muted p-4">
            <Field label="Kind of piece">
              <select value={query.type || ''} onChange={(e) => go({ type: e.target.value || null })} className={cn(inputCls, 'font-normal normal-case tracking-normal')}>
                <option value="">Any kind</option>
                {CATEGORIES.map((c: any) => <optgroup key={c.key} label={c.label}>{c.types.map((t: any) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>)}
              </select>
            </Field>
            {([
              ['Sector', 'sector', SECTORS.map((s: string) => ({ value: s, label: s })), 'Any sector'],
              ['Industry', 'industry', industries.map((s) => ({ value: s, label: s })), 'Any industry'],
              ['Theme', 'theme', THEMES.map((t: any) => ({ value: t.key, label: t.label })), 'Any theme'],
              ['Quant rating', 'rating', QUANT_FILTERS.map((r: any) => ({ value: r.key, label: r.label })), 'Any rating'],
              ['Shariah status', 'shariah', SHARIAH_FILTERS.map((s: any) => ({ value: s.key, label: s.label })), 'Any status'],
            ] as [string, string, { value: string; label: string }[], string][]).map(([label, key, options, placeholder]) => (
              <Field key={key} label={label}>
                <select value={query[key] || ''} onChange={(e) => go({ [key]: e.target.value || null })} className={cn(inputCls, 'font-normal normal-case tracking-normal')}>
                  <option value="">{placeholder}</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            ))}
            <FilterText label="Ticker" value={query.ticker || ''} placeholder="e.g. NVDA" onApply={(v) => go({ ticker: v.toUpperCase() || null })} />
            <FilterText label="Search" value={query.q || ''} placeholder="Headline or company" onApply={(v) => go({ q: v || null })} />
            <p className="col-span-full text-tiny text-muted-foreground">
              Search covers the headline, subtitle, summary and company names — not the article body. Press Enter to apply a text box.
            </p>
          </div>
        ) : null}

        {chips.length ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c.key} type="button" aria-label={`Remove filter ${c.label}`} onClick={() => go({ [c.key]: null })}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-13 hover:bg-accent/70">
                <span>{c.label}</span><i aria-hidden="true" className="not-italic text-muted-foreground">×</i>
              </button>
            ))}
            <button type="button" onClick={() => nav.goQuery('research', 'latest', { sort: query.sort })} className="px-2 text-13 font-semibold text-primary hover:underline">Clear all</button>
          </div>
        ) : null}

        <p className="text-13 text-muted-foreground">
          <b className="text-foreground">{result.total.toLocaleString('en-US')}</b> {result.total === 1 ? 'piece' : 'pieces'}{isFiltered(query) ? ' matching these filters' : ''}
        </p>
        <SampleBanner />

        {result.total ? (
          <div className="grid gap-6">
            {featured ? (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <LeadCard a={lead} />
                <div className="grid content-start gap-5">{rest.slice(0, 2).map((a) => <ArticleCard key={a.slug} a={a} />)}</div>
              </div>
            ) : null}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
              {(featured ? rest.slice(2) : items).map((a) => <ArticleCard key={a.slug} a={a} />)}
            </div>
          </div>
        ) : (
          // Nothing matched: name the filter most likely responsible and offer to drop it.
          <div role="status" className="grid justify-items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <strong>No research matches these filters.</strong>
            <p className="text-13 text-muted-foreground">
              {chips.length > 1 ? 'The combination is narrower than the sample set covers. Try dropping one.' : 'Nothing in the sample set is filed under this yet.'}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {chips.length ? <Button variant="outline" size="sm" onClick={() => go({ [chips[chips.length - 1].key]: null })}>Remove “{chips[chips.length - 1].label}”</Button> : null}
              <Button size="sm" onClick={() => nav.goQuery('research', 'latest', { sort: query.sort })}>Clear all filters</Button>
            </div>
          </div>
        )}

        {result.pages > 1 ? (
          <nav aria-label="Feed pages" className="flex items-center justify-center gap-4">
            <Button variant="outline" size="sm" disabled={result.page <= 1}
              onClick={() => { nav.goQuery('research', 'latest', { ...query, page: result.page - 1 }); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }}>← Newer</Button>
            <span className="text-13 text-muted-foreground">Page {result.page} of {result.pages}</span>
            <Button variant="outline" size="sm" disabled={result.page >= result.pages}
              onClick={() => { nav.goQuery('research', 'latest', { ...query, page: result.page + 1 }); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }}>Older →</Button>
          </nav>
        ) : null}

        <details className="mt-4 rounded-xl border border-border px-4 py-3 text-13 text-muted-foreground">
          <summary className="cursor-pointer font-semibold text-foreground">How research is filed here</summary>
          <div className="mt-3 grid max-w-[90ch] gap-2 leading-relaxed">
            <p>Seven sections, and inside each the kinds of piece it carries — thirty-eight in all. Nothing finer than a kind is a kind: a piece on halal semiconductor stocks is Shariah, a halal idea, and an industry that comes from its tickers.</p>
            <p>Sectors and industries come from the companies a piece is about, never from a tag, so they cannot disagree with the company data. The quant words are the report’s own bands, and a Shariah status is defined as how many of the five published methodologies the company passes.</p>
            <p>Every filter is part of the address, so a filtered view can be shared and the back button steps back through filters.</p>
          </div>
        </details>
      </div>
    );
  };

  return (
    <PageFrame id="research">
      <ResearchHero title={cat ? cat.label : 'Latest research'} blurb={cat ? cat.blurb : DEFAULT_BLURB} />
      <ResearchStrip active={cat ? cat.key : 'latest'} query={query} />
      {body()}
    </PageFrame>
  );
}

/* ==========================================================================
   One article
   ========================================================================== */

function BlockTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">{children}</p>;
}

/** One body block. The vocabulary is `articles.json`'s `_schema`; anything else renders nothing. */
function Block({ b }: { b: any }) {
  switch (b.type) {
    case 'p': return <p className="text-[16px] leading-[1.75]">{b.text}</p>;
    case 'h': return <h2 className="pt-3 text-xl font-bold tracking-[-.015em]">{b.text}</h2>;
    case 'note': return <Notice>{b.text}</Notice>;
    // Text quoted verbatim from a source this product actually holds. The
    // sample store ships none on purpose: a plausible quote attributed to a
    // real company's management is a fabricated statement by a real person.
    case 'quote':
      return (
        <blockquote className="border-l-[3px] border-primary pl-4 text-[16px] italic leading-relaxed">
          <p>{b.text}</p>
          {b.cite ? <cite className="mt-1 block text-13 not-italic text-muted-foreground">{b.cite}</cite> : null}
        </blockquote>
      );
    case 'metrics':
      return (
        <div>
          {b.title ? <BlockTitle>{b.title}</BlockTitle> : null}
          <StatLines split>{(b.items || []).map(([label, value, note]: [string, string, string], i: number) => <StatLine key={i} label={label} value={value} note={note || ''} />)}</StatLines>
        </div>
      );
    case 'table': {
      const from = Number.isInteger(b.numFrom) ? b.numFrom : 1;
      return (
        <div>
          {b.title ? <BlockTitle>{b.title}</BlockTitle> : null}
          <DataTable headers={(b.headers || []).map((h: string, i: number) => ({ label: h, num: i >= from }))} rows={b.rows || []} />
        </div>
      );
    }
    case 'bullbear': {
      const side = (title: string, items: string[] | undefined, tone: 'up' | 'warn') => (
        <div>
          <h3 className="mb-2 text-13 font-bold">{title}</h3>
          {items?.length ? (
            <ul className="grid gap-1.5">
              {items.map((t, i) => (
                <li key={i} className="flex gap-2.5 text-13 leading-relaxed">
                  <span className={cn('mt-2 size-1.5 flex-none rounded-full', tone === 'up' ? 'bg-up' : 'bg-warning')} /><span>{t}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-13 text-muted-foreground">Nothing material to report.</p>}
        </div>
      );
      return (
        <div className="rounded-xl border border-border p-4">
          <BlockTitle>{b.title || 'Bull and bear case'}</BlockTitle>
          <div className="grid gap-5 md:grid-cols-2">{side('Bull case', b.bull, 'up')}{side('Bear case', b.bear, 'warn')}</div>
        </div>
      );
    }
    case 'quant':
      return (
        <div className="rounded-xl border border-border p-4">
          <BlockTitle>{b.title || 'Maz Vantage quant rating'}</BlockTitle>
          <div className="mb-3 flex items-center gap-2"><QuantBadge score={b.score} letter={b.letter} /><span className="text-13 text-muted-foreground">of {MAX_SCORE}</span></div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {(b.factors || []).map(([name, letter]: [string, string]) => {
              const tone = toneForLetter(letter);
              return (
                <div key={name} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-13">
                  <span>{name}</span>
                  <b className={cn('rounded px-1.5 text-tiny', `bg-grade-${tone === 'na' ? 'mid' : tone}/15 text-grade-${tone === 'na' ? 'mid' : tone}`)}>{letter}</b>
                </div>
              );
            })}
          </div>
        </div>
      );
    default: return null;
  }
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5 border-b border-border pb-5 last:border-b-0">
      <h2 className="text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
const SideNote = ({ children }: { children: React.ReactNode }) => <p className="text-tiny leading-relaxed text-muted-foreground">{children}</p>;

function ArticleView({ a }: { a: Article }) {
  const nav = useNav();
  React.useEffect(() => { document.title = `${a.seoTitle || a.title} — Maz Vantage Research`; }, [a]);
  const crumb = (label: string | null, query: Record<string, any>) => (
    <button type="button" onClick={() => nav.goQuery('research', 'latest', query)} className="hover:text-foreground hover:underline">{label}</button>
  );
  const updated = a.updatedAt && a.updatedAt !== a.publishedAt;
  const blocks = (a.body || []).map((b: any, i: number) => <Block key={i} b={b} />);
  // Sector, industry and theme, deduped by printed label: the industry wins,
  // because it came from the company data rather than a tag.
  const seen = new Set<string>();
  const topics = [
    ...(a.sectors || []).map((s: string) => [s, { sector: sectorSlug(s) }]),
    ...(a.industries || []).map((i: string) => [i, { industry: i }]),
    ...(a.themes || []).map((t: string) => [themeLabel(t), { theme: t }]),
  ].filter(([label]) => { const k = String(label).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }) as [string, Record<string, any>][];
  const related: Article[] = relatedArticles(a, 5);

  return (
    <div className="grid gap-10 pt-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <article className="min-w-0 max-w-[760px]">
        {/* Every crumb is a real filter: a breadcrumb that does not navigate is a heading with arrows. */}
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-13 text-muted-foreground">
          {crumb('Research', {})}<span aria-hidden="true">›</span>
          {crumb(categoryLabel(a.primaryCategory), { category: a.primaryCategory })}
          {a.articleType ? <><span aria-hidden="true">›</span>{crumb(typeLabel(a.articleType), { category: a.primaryCategory, type: a.articleType })}</> : null}
        </nav>
        <header className="grid gap-3">
          <p className="text-micro font-semibold uppercase tracking-[.08em] text-primary">{typePath(a)}</p>
          <h1 className="text-[clamp(28px,3vw,40px)] font-bold leading-tight tracking-[-.03em]">{a.title}</h1>
          {a.subtitle ? <p className="text-lg leading-relaxed text-muted-foreground">{a.subtitle}</p> : null}
          <div className="mt-1 flex items-center gap-3">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-foreground text-background">
              <BrandMark className="w-[22px]" />
            </span>
            <span className="grid text-13">
              <b>{a.author}</b>
              <span className="text-muted-foreground">
                <time dateTime={a.publishedAt} title={fmtDate(a.publishedAt)}>{fmtDate(a.publishedAt)} · {ago(a.publishedAt)}</time>
                {updated ? ` · updated ${fmtDate(a.updatedAt)}` : ''}
                {a.readingMinutes ? ` · ${a.readingMinutes} min read` : ''}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {a.tickers.map((t) => <TickerLink key={t} ticker={t} tab={a.stockTab} withName />)}
            <QuantBadge score={a.quantRating} letter={a.quantLetter} />
            <ShariahBadge status={a.shariahStatus} passed={a.standardsPassed} of={a.standardsOf} />
          </div>
        </header>
        <SampleBanner />
        <div className="grid gap-5">{blocks.some(Boolean) ? blocks : <p className="text-[16px] leading-[1.75]">{a.summary || 'This article has no body text.'}</p>}</div>
      </article>

      <aside aria-label="About this article" className="grid content-start gap-5 lg:sticky lg:top-[calc(var(--utilbar-h)+64px)] lg:self-start">
        {/* The two ratings, restated with what each is and is not: the commonest
            misreading of a page carrying both is that one is evidence for the other. */}
        {typeof a.quantRating === 'number' || a.shariahStatus ? (
          <SidePanel title="The two ratings">
            {typeof a.quantRating === 'number' ? (
              <div className="grid gap-1.5">
                <p className="text-tiny font-semibold">Maz Vantage quant composite</p>
                <div><QuantBadge score={a.quantRating} letter={a.quantLetter} /></div>
                <SideNote>A sector-relative ranking of measurable ratios across the factors. No fair value estimate enters it.</SideNote>
              </div>
            ) : null}
            {a.shariahStatus ? (
              <div className="grid gap-1.5">
                <p className="text-tiny font-semibold">Shariah screen</p>
                <div><ShariahBadge status={a.shariahStatus} passed={a.standardsPassed} of={a.standardsOf} /></div>
                <SideNote>{a.standardsPassed != null
                  ? `Passes ${a.standardsPassed} of ${a.standardsOf} published methodologies. A mechanical screen, not a scholarly ruling.`
                  : 'A mechanical screen against published limits, not a scholarly ruling.'}</SideNote>
              </div>
            ) : null}
            <SideNote>These answer different questions, and neither is evidence for the other.</SideNote>
            <button type="button" onClick={() => nav.goView('quant', 'ratings')} className="justify-self-start text-13 font-semibold text-primary hover:underline">How the quant rating is built ›</button>
          </SidePanel>
        ) : null}
        {a.tickers.length ? (
          <SidePanel title={a.tickers.length === 1 ? 'The company' : 'Companies in this piece'}>
            <div className="grid gap-1">
              {(a.companies || []).map((c: any) => (
                <button key={c.ticker} type="button" title={`Open the ${c.name} report${a.stockTab ? ` — opens the ${a.stockTab} tab` : ''}`}
                  onClick={() => nav.goSymbolTab(a.stockTab || null, c.ticker)}
                  className="grid rounded-lg px-2 py-1.5 text-left hover:bg-accent">
                  <b className="text-13">{c.ticker}</b>
                  <span className="text-tiny">{c.name}</span>
                  {c.industry ? <i className="text-micro not-italic text-muted-foreground">{c.industry}</i> : null}
                </button>
              ))}
            </div>
            <SideNote>{a.stockTab ? `Each opens the ${a.stockTab} tab of that company’s report.` : 'Each opens that company’s report.'}</SideNote>
          </SidePanel>
        ) : null}
        {topics.length ? (
          <SidePanel title="More on these topics">
            <div className="flex flex-wrap gap-2">
              {topics.map(([label, query]) => <RsPill key={label} onClick={() => nav.goQuery('research', 'latest', query)}>{label}</RsPill>)}
            </div>
            <SideNote>Sector and industry come from the companies above rather than a tag, so they cannot disagree with the company data.</SideNote>
          </SidePanel>
        ) : null}
        {related.length ? (
          <SidePanel title="Related research"><div className="grid">{related.map((r) => <ArticleRow key={r.slug} a={r} />)}</div></SidePanel>
        ) : null}
      </aside>
    </div>
  );
}

function ArticlePage() {
  const nav = useNav();
  const params = useSearchParams();
  const slug = params?.get('slug') || '';
  const all = useArticleStore();
  const a: Article | null = all ? articleBySlug(slug) : null;
  return (
    <PageFrame id="research-article">
      <ResearchStrip active={a ? a.primaryCategory : 'latest'} />
      {!all ? (
        <div aria-busy="true" className="grid max-w-[760px] gap-4 pt-10"><Skeleton className="h-3.5 w-[30%]" /><Skeleton className="h-9 w-4/5" /><Skeleton className="h-4 w-3/5" /></div>
      ) : a ? <ArticleView a={a} /> : (
        <div role="status" className="mt-10 grid justify-items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <strong>Article not found</strong>
          <p className="text-13 text-muted-foreground">No article is filed under “{slug}”. Slugs are permanent here, so this is more likely a typo than a moved page.</p>
          <Button size="sm" className="mt-2" onClick={() => nav.goQuery('research', 'latest', {})}>Back to Latest research</Button>
        </div>
      )}
    </PageFrame>
  );
}

/* ==========================================================================
   Investing Strategy — what this product believes, and refuses to do
   ========================================================================== */

const DESTINATION_NOTE: Record<string, string> = {
  'Stock Analysis': 'The full equity research report on the company you have open, with the long-form narrative.',
  'Investment Ideas': 'Twenty screens across the market, each with its rules and thresholds argued for.',
  Earnings: 'The calendar: who reports when, plus dividends and splits, a week at a time.',
  'Sectors & Industries': 'One page per sector: what it did, and the distribution every grade in it is measured against.',
};

const P = ({ children }: { children: React.ReactNode }) => <p className="mb-3 max-w-[85ch] text-sm leading-[1.75] last:mb-0">{children}</p>;

function Strategy() {
  const nav = useNav();
  const menu = NAV_BY_VIEW.research;
  return (
    <PageFrame id="research-strategy">
      <ResearchHero title="Investing Strategy" blurb="What this product believes about a company, and what it refuses to do." />
      <ResearchStrip active="strategy" />
      <div className="grid grid-cols-12 gap-6 pt-6 max-lg:grid-cols-1">
        <OCard span={12} id="rh-principles">
          <OHead title="How this report thinks about a company" />
          <P>A company is judged against its own sector, on as many ratios as the filings support, and never against an absolute threshold. A 30% operating margin is exceptional in a grocer and unremarkable in a software business, so a single cut-off would be measuring the industry rather than the company. Every ratio is ranked as a percentile within its sector, and that percentile is the grade.</P>
          <P>Ratios are grouped into five factors and the five average into one composite. Averaging is a deliberate refusal to be clever: a weighting scheme that says profitability matters twice as much as valuation is a view about markets, not a fact about the company, and it would be doing the reader’s thinking for them. Where this report does hold a view, it says so in words rather than burying it in a weight.</P>
          <P>Nothing is scored that cannot be measured. A ratio the data does not support is dropped from the average rather than filled with a zero or a sector median, and the count of what was actually graded prints beside every score. A factor graded on four ratios and one graded on twenty are not the same measurement.</P>
        </OCard>
        <OCard span={12} id="rh-factors">
          <OHead title="The five factors" />
          <p className="mb-3 text-13 text-muted-foreground">Each asks one question. Together they are most of what a set of accounts can answer about a business.</p>
          <DataTable headers={['Factor', 'The question']} rows={FACTOR_KEYS.map((k) => {
            const f: any = FACTOR_BY_KEY[k];
            return [
              <button key="f" type="button" title={`Open the ${f.title} factor on the company report`} onClick={() => nav.goSymbolTab(f.title)}
                className="font-semibold text-primary hover:underline">{f.title}</button>,
              String(f.question || f.blurb || '—').replace(/\{SYM\}/g, 'the company'),
            ];
          })} />
          <p className="mt-3 text-tiny text-muted-foreground/80">
            Momentum is the shortest of the five by some distance, because price history answers fewer questions than a balance sheet does. It is
            included because a company whose shares have already run is a different proposition from one whose have not, whatever the accounts say.
          </p>
        </OCard>
        <OCard span={12} id="rh-ratings">
          <OHead title="Two ratings, deliberately not merged" />
          <DataTable headers={['', 'Quant rating', 'Valuation zone']} rows={[
            ['The question it answers', 'How do this company’s ratios rank against its sector?', 'Is the price below a modelled estimate of what the business is worth?'],
            ['What goes in', 'Every rankable ratio, including price multiples, as sector percentiles.', 'The median of thirteen fair-value models, banded by an uncertainty rating.'],
            ['What never goes in', 'A fair value estimate.', 'Any sector ranking.'],
            ['What it says', 'A verdict word, a letter, and a score out of five.', 'Undervalued, fairly valued, or overvalued.'],
          ]} />
          <div className="mt-4"><P>They disagree often, and the disagreement is the useful part. A company can rank near the top of its sector and still cost more than any reasonable estimate of its worth; another can be cheap because it deserves to be. Collapsing both into one number would hide exactly the case a reader most needs to see.</P></div>
          <Notice>
            No fair value estimate feeds any grade anywhere in this report. That is a standing rule rather than an implementation detail: a valuation
            is a set of assumptions the reader chooses, and letting a chosen assumption move a sector-relative grade would make the grade mean
            something different for every reader.
          </Notice>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => nav.goSymbolTab('Research')}>See both on a company →</Button>
            <Button size="sm" variant="ghost" onClick={() => nav.goView('quant', 'ratings')}>How the quant rating is built</Button>
          </div>
        </OCard>
        <OCard span={12} id="rh-refusals">
          <OHead title="What this report will not do" />
          <DataTable headers={['It does not', 'Why']} rows={[
            ['Give investment advice', 'A verdict word on a scorecard is a summary of ratios against a sector. It is not a recommendation, it knows nothing about the reader, and it should not be read as one.'],
            ['Score a fair value', 'Thirteen models produce thirteen answers. Publishing the range and the median is honest; grading a company on whichever one you picked is not.'],
            ['Fill a gap with an estimate', 'A missing ratio is dropped and the count says so. Substituting a sector median would make an unmeasurable company look average rather than unmeasured.'],
            ['Smooth the analyst tail', 'Consensus estimates wobble in the outer years as coverage thins. That noise is the actual published data, and hiding it would invent a confidence nobody has.'],
            ['Tag news with sentiment', 'None is published and this report runs no model that could produce one. A green or red chip on a headline is the easiest way to imply an opinion the page does not hold.'],
            ['Issue a Shariah ruling', 'The compliance screen is two balance-sheet ratios and a keyword test. Three of the tests the index providers run are not run here at all, and a scholar is the authority.'],
          ]} />
        </OCard>
        <OCard span={12} id="rh-where">
          <OHead title="The rest of this menu" />
          <p className="mb-3 text-13 text-muted-foreground">Every other item here opens something that already exists elsewhere in the product rather than a second copy of it.</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {menu.items.filter((i: any) => !i.sub).map((item: any) => (
              <button key={item.label} type="button" onClick={() => { if (item.symbolTab) nav.goSymbolTab(item.symbolTab); else if (item.view) nav.goView(item.view, null); }}
                className="grid gap-1 rounded-xl border border-border p-4 text-left hover:bg-accent">
                <b className="text-13">{item.label}</b>
                <span className="text-tiny leading-relaxed text-muted-foreground">{DESTINATION_NOTE[item.label] || ''}</span>
              </button>
            ))}
          </div>
        </OCard>
      </div>
    </PageFrame>
  );
}

export function ResearchPage({ sub }: { sub: string | null }) {
  if (sub === 'article') return <ArticlePage />;
  if (sub === 'letters') return <LettersPage />;
  if (sub === 'strategy') return <Strategy />;
  if (sub === 'calculators') return <CalculatorsPage />;
  if (sub === 'valuation' || sub === 'dividends') return <ResearchReportTab tab={sub} />;
  return <Feed />;
}
