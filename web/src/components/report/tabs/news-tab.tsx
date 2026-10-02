'use client';

/* ==========================================================================
   Maz Vantage — the News tab

   Two streams, deliberately not merged: what other people wrote about the
   company, and what the company said about itself. This is the only place in
   the report the reader meets unprocessed text, and the design problem is
   keeping the line between reporting and self-description visible.

   A third tab lists what the company filed with the SEC. It is neither
   reporting nor marketing but the legal record both are written from, so it
   sits beside them rather than in either stream.

   What this tab does **not** do, and says so on the page:

   - **No sentiment.** FMP supplies none and this app runs no model; a
     green/red tag on a headline makes a reader believe the page has an opinion.
   - **No ranking.** Newest first, always.
   - **No price attribution.** The price is charted over the same window, once,
     above the stream — never against an individual headline.

   The stream is other people's text, rendered as text at every point — React
   escapes it — so a headline is a headline and not markup.
   ========================================================================== */

import * as React from 'react';
import { ago, curSymbol, fmtDate, isNum, num, pct, price } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { LineChart } from '@/components/charts/charts';
import { DataTable, FeedGate, Notice, OCard, OHead, Pill, StatLine, StatLines } from '@/components/report/ui';
import { OSub } from '@/components/report/grade-parts';
import { RelatedResearchCard, useTickerArticles } from '@/components/research/feed-parts';
import { SecFilingsStream } from '@/components/report/sec-filings';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/** How many stories a panel shows before the reader has to ask for more. */
const PAGE = 12;

/* ---------- one story ---------------------------------------------------------- */

/**
 * The headline is the link and the only link — a card-wide click target would
 * make an accidental navigation off the report out of every stray click, and
 * these all leave the site. Exported for the market-wide News page, which
 * renders the same row over the same normalised shape.
 */
export function NewsStory({ r }: { r: any }) {
  // `no-referrer` so opening the report does not tell every publisher which
  // page the reader was on; a 404 removes the image rather than leaving a box.
  const [imgOk, setImgOk] = React.useState(Boolean(r.image));
  return (
    <article className="grid grid-cols-[minmax(0,1fr)] gap-4 border-b border-border py-4 last:border-b-0 sm:grid-cols-[132px_minmax(0,1fr)] [&:not(:has(img))]:grid-cols-[minmax(0,1fr)]">
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)}
          className="aspect-[16/10] w-full rounded-lg bg-muted object-cover max-sm:hidden" />
      ) : null}
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-micro">
          <span className={cn('font-semibold', r.kind === 'release' ? 'text-primary' : 'text-foreground')}>{r.source || 'Unattributed'}</span>
          <span className="text-muted-foreground"
            title={fmtDate(r.date, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}>
            {ago(r.date)}
          </span>
        </div>
        {r.url
          ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold leading-snug hover:text-primary hover:underline">{r.title}</a>
          : <span className="text-[15px] font-semibold leading-snug">{r.title}</span>}
        {r.text ? <p className="mt-1.5 line-clamp-3 text-13 leading-relaxed text-muted-foreground">{r.text}</p> : null}
      </div>
    </article>
  );
}

/* ---------- 1. coverage ------------------------------------------------------- */

/*
  The price series clipped to the span the news stream covers. A stream that is
  one busy afternoon gets a floor of a fortnight; and a price series that ends
  before the newest story (the bundled snapshot does) falls back to the last
  quarter of closes, with `matched` false so the caption says so.
*/
function windowPrices(a: Analysis) {
  const pts: any[] = a.momentum?.points || [];
  const n = a.news;
  if (pts.length < 2) return { pts: [] as any[], matched: false };
  if (n.oldest) {
    const from = Math.min(new Date(n.oldest).getTime(), Date.now() - 14 * 864e5);
    const clip = pts.filter((p) => new Date(p.date).getTime() >= from);
    if (clip.length > 1) return { pts: clip, matched: true };
  }
  return { pts: pts.slice(-65), matched: false };
}

function CoverageCard({ a }: { a: Analysis }) {
  const n = a.news;
  const { pts, matched } = windowPrices(a);
  const move = pts.length > 1 && pts[0].price > 0 ? pts.at(-1).price / pts[0].price - 1 : null;
  const span = isNum(n.spanDays) ? (n.spanDays >= 60 ? `${Math.round(n.spanDays / 30)} months` : `${n.spanDays} days`) : null;

  return (
    <OCard span={8} id="news-coverage">
      <OHead title="Coverage" aside={n.newest ? <Pill tone="muted">latest {ago(n.newest)}</Pill> : null}
        info="Counts of what came back, not of what was published. The wire carries a subset of the financial press, so this is a sample of coverage and not a census of it." />
      <StatLines>
        <StatLine label="Stories returned" value={String(n.articles.length)} note={span ? `over ${span}` : ''} />
        <StatLine label="Mastheads" value={String(n.publishers.length)} />
        <StatLine label="Company releases" value={String(n.releases.length)} />
        <StatLine label="Rate" value={isNum(n.perDay) ? `${num(n.perDay, 1)} a day` : 'n/a'} note="across the window" />
      </StatLines>
      {pts.length > 1 ? (
        <div className="mt-4">
          <OSub>{matched ? `Price over the same window${span ? ` — ${span}` : ''}` : 'Price — most recent closes on file'}</OSub>
          <LineChart height={180} series={pts.map((p) => ({ date: p.date, value: p.price }))}
            valueFmt={(v) => price(v, curSymbol(a.facts.currency))} labelFmt={(d) => fmtDate(d, { day: 'numeric', month: 'short' })} />
          <p className="mt-2 text-tiny text-muted-foreground/80">
            {!isNum(move)
              ? 'Price history is not loaded for this window.'
              : matched
                ? `The shares ${move >= 0 ? 'rose' : 'fell'} ${pct(Math.abs(move))} across the stretch these stories cover. Which of them moved it, if any did, is not something this page can tell you — no headline below is matched to a day’s move.`
                : `The price series ends ${fmtDate(pts.at(-1).date)}, before the newest story below, so this is the last stretch of closes on file rather than the window the headlines cover. Across it the shares ${move >= 0 ? 'rose' : 'fell'} ${pct(Math.abs(move))}.`}
          </p>
        </div>
      ) : null}
    </OCard>
  );
}

/* ---------- 2. publishers ----------------------------------------------------- */

function PublishersCard({ a }: { a: Analysis }) {
  const rows = a.news.publishers.slice(0, 12);
  return (
    <OCard span={4} id="news-publishers">
      <OHead title="Who is covering it" info="Story count per masthead in the window above. A count of attention, not of quality or of agreement — two pieces from one outlet outrank one from another here, and that is all it means." />
      {rows.length ? (
        <div className="grid">
          {rows.map((p: any) => (
            <div key={p.source} className="flex items-center justify-between gap-3 border-b border-border py-2 text-13 last:border-b-0">
              <span className="truncate" title={p.source}>{p.source}</span>
              <span className="font-semibold tnum">{p.count}</span>
            </div>
          ))}
        </div>
      ) : <p className="text-13 text-muted-foreground">No publisher was named on any story.</p>}
    </OCard>
  );
}

/* ---------- 3. the two streams ------------------------------------------------ */

const STREAMS = [
  {
    key: 'press', title: 'In the press', feed: 'news', what: 'Company news',
    empty: 'No press coverage was returned.',
    lede: 'Third-party reporting, newest first. Headlines and summaries are the publisher’s own words, reproduced as sent — nothing here is written, edited or scored by this report.',
  },
  {
    key: 'releases', title: 'Company releases', feed: 'pressReleases', what: 'Company press releases',
    empty: 'No company releases are available for this company.',
    lede: 'The company’s own announcements, newest first. These are primary sources and they are also marketing: a release says what the company chose to say, in the words it chose, which is exactly why it is kept apart from the coverage beside it.',
  },
] as const;

/** One stream, paged — "show me more" lets the reader say how deep to go. */
function StreamCard({ a, spec, rows }: { a: Analysis; spec: (typeof STREAMS)[number]; rows: any[] }) {
  const [shown, setShown] = React.useState(PAGE);
  const left = rows.length - Math.min(shown, rows.length);
  return (
    <OCard span={12} id={`news-${spec.key}`}>
      <OHead title={spec.title} />
      <p className="-mt-1 mb-2 text-13 leading-relaxed text-muted-foreground">{spec.lede}</p>
      {rows.length ? (
        <div>
          <div className="grid">{rows.slice(0, shown).map((r, i) => <NewsStory key={r.url || `${r.title}-${i}`} r={r} />)}</div>
          {left > 0 ? (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShown((s) => s + PAGE)}>
              Show {Math.min(left, PAGE)} more — {left} left
            </Button>
          ) : null}
        </div>
      ) : a.ds.status(spec.feed) !== 'ok' ? <FeedGate a={a} feed={spec.feed} what={spec.what} /> : <Notice>{spec.empty}</Notice>}
    </OCard>
  );
}

/* ---------- 4. what this is --------------------------------------------------- */

function BasisCard({ a }: { a: Analysis }) {
  const n = a.news;
  return (
    <OCard span={12} id="news-basis">
      <OHead title="What this page is" />
      <p className="-mt-1 mb-4 text-13 leading-relaxed text-muted-foreground">
        A news wire, printed. Every other tab in this report turns filed figures into a grade with a stated basis; this one carries text
        written by other people and does nothing to it.
      </p>
      <DataTable headers={['Question', 'Answer']} rows={[
        ['Where the stories come from', 'A stock news wire and the company’s press releases. The wire aggregates a subset of the financial press — absence from this list is not absence from the news.'],
        ['How they are ordered', 'Newest first, in both streams. Nothing is promoted, and nothing is scored.'],
        ['Whether they are rated', 'No. There is no sentiment tag, no relevance score and no attempt to say which story matters. This report has no model that could produce one.'],
        ['Whether the price is attributed', 'No. The chart above spans the same window as the stream and is not matched to any individual story.'],
        ['How current it is', n.newest ? `Newest story ${ago(n.newest)}, fetched when this report loaded. Feeds are cached for ten minutes.` : 'Nothing was returned.'],
        ['Where the filings come from', 'An index of EDGAR, two years deep, fetched when the SEC filings tab is opened. Each form’s meaning is the SEC’s; no filing is read or summarised.'],
      ]} />
      <Notice className="mt-4">
        Headlines and summaries belong to their publishers and are reproduced from the wire. Follow the link for the full article;
        the snippet here is the wire’s summary, not this report’s.
      </Notice>
    </OCard>
  );
}

/*
  Maz Vantage research on this company, under the streams. Per company, not per
  headline: nothing in the article store records which news item an article
  was written from, and matching by ticker and date would attach an article to
  a story it may have nothing to do with.
*/
function ResearchSlot({ a }: { a: Analysis }) {
  const rows = useTickerArticles(a.facts?.symbol || a.ds?.symbol, 4);
  if (!rows?.length) return null;
  return <RelatedResearchCard articles={rows} span={12} title="What it means for the numbers" />;
}

/* ==========================================================================
   The tab
   ========================================================================== */

export function NewsTab({ a }: { a: Analysis }) {
  const n = a.news;
  const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';
  if (!n.available) {
    return (
      <div className={grid}>
        <OCard span={12} id="news-none">
          <OHead title="News" />
          {a.ds.status('news') !== 'ok' ? <FeedGate a={a} feed="news" what="Company news" /> : <Notice>No news was returned for this company.</Notice>}
          <p className="mt-4 text-tiny text-muted-foreground/80">
            The saved copy carries only a couple of stories, because a news archive is the one part of this report that is stale the day
            it is saved. The live stream returns when live data is available.
          </p>
        </OCard>
        {/* No news is not no filings: a quiet small cap still files. */}
        <SecFilingsStream symbol={a.facts.symbol || a.ds.symbol} />
      </div>
    );
  }
  const rowsFor = (key: string) => (key === 'press' ? n.articles : n.releases);
  return (
    <div>
      <div className={grid}>
        <CoverageCard a={a} />
        <PublishersCard a={a} />
      </div>
      {/* A strip rather than two stacked lists: "what is being said about this
          company" and "what has the company announced" are not one scroll. */}
      <Tabs defaultValue="press" className="mt-6">
        <TabsList aria-label="News source">
          {STREAMS.map((s) => {
            const count = rowsFor(s.key).length;
            return <TabsTrigger key={s.key} value={s.key}>{s.title}{count ? ` (${count})` : ''}</TabsTrigger>;
          })}
          <TabsTrigger value="sec">SEC filings</TabsTrigger>
        </TabsList>
        {STREAMS.map((s) => (
          <TabsContent key={s.key} value={s.key} className={grid}>
            <StreamCard a={a} spec={s} rows={rowsFor(s.key)} />
          </TabsContent>
        ))}
        {/* Radix mounts only the open panel, so the filing list is fetched on
            the first open and not as part of the report's load. */}
        <TabsContent value="sec" className={grid}>
          <SecFilingsStream symbol={a.facts.symbol || a.ds.symbol} />
        </TabsContent>
      </Tabs>
      <div className={cn(grid, 'mt-6')}>
        <ResearchSlot a={a} />
        <BasisCard a={a} />
      </div>
    </div>
  );
}
