'use client';

/* ==========================================================================
   Maz Vantage — Market News (`/news/<category>`)

   One stream, six categories: a topic strip across the top and the stories
   under it, newest first. What the market did while they were written is in
   the market rail beside every page, so this page carries no rail of its own.
   Every category says where it came from — a wire, a vendor tag, or a keyword
   filter with its pattern printed.
   ========================================================================== */

import * as React from 'react';
import { quoteMap } from '@/lib/markethub-data';
import { NEWS_CATEGORIES, categoryStories, newsCategoryOf, type StoryResult } from '@/lib/news-stories';
import { EmptyState, FeaturedNews, StoryRow, type QuoteMap } from '@/components/market/market-ui';
import { PageFrame, PageHero, SectionBar, useHasKey } from '@/components/pages/page-parts';
import { Button } from '@/components/ui/button';
import { useNav } from '@/components/nav-context';

/** Stories shown before the reader asks for more. */
const PAGE = 12;
/** The latest few, given the room to be read, above the rest as headlines. */
const FEATURED = 4;

const symbolsOf = (items: any[]) => items.flatMap((i) => (i.marks || []).map((m: any) => m.symbol)).filter(Boolean);

export function NewsPage({ sub }: { sub: string | null }) {
  const nav = useNav();
  const has = useHasKey();
  const category = newsCategoryOf(sub || 'latest');
  const [result, setResult] = React.useState<StoryResult | { status: string; message?: string } | null>(null);
  const [shown, setShown] = React.useState(PAGE);
  const [quotes, setQuotes] = React.useState<QuoteMap>(null);

  React.useEffect(() => {
    setResult(null); setShown(PAGE); setQuotes(null);
    if (!has) return;
    let live = true;
    categoryStories(category)
      .then((r) => { if (live) setResult(r); })
      .catch((e) => { if (live) setResult({ status: 'error', message: String(e?.message || e) }); });
    return () => { live = false; };
  }, [category, has]);

  const stories = result && 'stories' in result ? result.stories : [];
  const lead = stories.slice(0, FEATURED);
  const tail = stories.slice(FEATURED, FEATURED + shown);

  /* The chips carry what the tagged symbol did: one batch quote per page of
     rows (`quoteMap` asks fifty symbols at a time), never one per story. */
  const wanted = symbolsOf([...lead, ...tail]).join(',');
  React.useEffect(() => {
    if (!wanted) return;
    let live = true;
    quoteMap(wanted.split(',')).then((q: any) => { if (live && q?.size) setQuotes(q); }).catch(() => { /* chips carry no change */ });
    return () => { live = false; };
  }, [wanted]);

  const coverage = () => {
    const lines = [...((result as StoryResult | null)?.notes || [])];
    if (category.wires) lines.push(`Read from the ${category.wires.join(' and ')} ${category.wires.length > 1 ? 'wires' : 'wire'}, merged and de-duplicated by URL. Headlines and summaries are the publisher’s own words and open on the publisher’s site.`);
    if (category.any) lines.push(`Stories carry no topic classification, so this category is a keyword filter run in your browser over that wire: ${String(category.any)}. It reads the headline and the one-line summary, never the article body, so it misses a story that avoids these words and catches one that mentions them in passing.`);
    lines.push('Nothing here is ranked, scored or sentiment-tagged, and no story is promoted.');
    return (
      <details className="mt-8 rounded-xl border border-border px-4 py-3 text-13 text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">Where these stories come from</summary>
        <div className="mt-3 grid max-w-[100ch] gap-2 break-words leading-relaxed">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      </details>
    );
  };

  const body = () => {
    if (!has) return <EmptyState status="skipped" message="Market News is market-wide data and is unavailable right now." />;
    if (!result) return <EmptyState status="loading" compact />;
    if (!stories.length) {
      return (
        <>
          <EmptyState status={result.status} message={result.message || (category.any
            ? 'Nothing in the fetched window matched this category. The wire goes back only so far, so a quiet stretch really can be empty.'
            : 'The wire returned nothing for this category.')} />
          {'stories' in result ? coverage() : null}
        </>
      );
    }
    const r = result as StoryResult;
    const left = stories.length - FEATURED - tail.length;
    return (
      <>
        <p className="mb-5 text-13 text-muted-foreground">
          {stories.length.toLocaleString()} {stories.length === 1 ? 'story' : 'stories'}
          {r.scanned && (category.any || category.load) ? ` matched from the ${r.scanned.toLocaleString()} latest` : ''}
        </p>
        {/* The latest four lead — one with room to be read, three headlines
            beside it — and the rest runs under them as the same rows every page prints. */}
        <FeaturedNews stories={lead} below={0} aside={FEATURED - 1} quotes={quotes} />
        <div className="mt-6">{tail.map((item, i) => <StoryRow key={item.url || i} item={item} quotes={quotes} />)}</div>
        {left > 0 ? (
          <Button variant="outline" className="mt-5" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(left, PAGE)} more — {left} left</Button>
        ) : null}
        {coverage()}
      </>
    );
  };

  return (
    <PageFrame id="market-news">
      <PageHero eyebrow="Market news" title={category.title} meta={<span>{category.blurb}</span>} />
      <SectionBar label="News categories" active={category.id}
        items={NEWS_CATEGORIES.filter((c) => !c.hidden).map((c) => ({ id: c.id, label: c.label || c.id }))}
        onSelect={(id) => nav.goView('news', id)} />
      <div className="pt-6">{body()}</div>
    </PageFrame>
  );
}
