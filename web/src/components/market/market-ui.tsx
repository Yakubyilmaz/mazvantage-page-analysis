'use client';

/* ==========================================================================
   The market canvas's shared parts

   Port of the legacy `markethub-ui.js`: the instrument mark, the price and
   change figures, the empty state, the carousel, the story rows and the
   featured-news block. Several pages draw on them — the Market Data hub, the
   indices board, the news desk, Home and the market rail — so they live here
   rather than inside any one of them. Nothing in this file fetches.
   ========================================================================== */

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isNum } from '@/lib/format';
import { logoUrl } from '@/lib/fmp';
import { cn } from '@/lib/cn';
import {
  COUNTRY_ALIAS, flagUrl, number, percent, changeOf, when, emptyTitle, metricValue, type LoadStatus,
} from '@/lib/market-format';
import { useNav } from '@/components/nav-context';

/* ---------- flags ----------------------------------------------------------
   An image from a flag CDN, not a regional-indicator emoji: **Windows ships
   no country-flag glyphs**, so an emoji flag renders as the bare letter pair
   it is built from. The letters stay as the fallback, so a machine with no
   network is no worse off. Never draw a flag with an emoji. */

export function CountryFlag({ code, large = false, className }: { code: unknown; large?: boolean; className?: string }) {
  const raw = String(code ?? '').trim().toUpperCase();
  const iso = COUNTRY_ALIAS[raw] || raw;
  const [failed, setFailed] = React.useState(false);
  const codeText = (t: string) => (
    <span className={cn('font-semibold tracking-[.04em] text-muted-foreground', large ? 'text-[.86em]' : 'text-micro')}>{t}</span>
  );
  return (
    <span className={cn('inline-flex flex-none items-center justify-center leading-none', className)} aria-hidden="true">
      {!/^[A-Z]{2}$/.test(iso)
        ? raw ? codeText(raw.slice(0, 3)) : null
        : failed
          ? codeText(iso)
          : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={flagUrl(iso)}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
              className={cn('block object-cover shadow-[inset_0_0_0_1px_#0000001f]',
                large ? 'h-[25px] w-[34px] rounded-[3px]' : 'h-[15px] w-[21px] rounded-[2px]')}
            />
          )}
    </span>
  );
}

/* ---------- figures -------------------------------------------------------- */

export function Signed({ value, className }: { value: unknown; className?: string }) {
  const v = isNum(value) ? value : null;
  return (
    <span className={cn('whitespace-nowrap text-13 tnum text-muted-foreground', v != null && v > 0 && 'text-up', v != null && v < 0 && 'text-down', className)}>
      {percent(value)}
    </span>
  );
}

export function Chevron({ className }: { className?: string }) {
  return <span className={cn('font-[Arial,sans-serif] text-[1.25em] leading-[.8] font-normal', className)} aria-hidden="true">›</span>;
}

export function PriceText({ row, className }: { row: any; className?: string }) {
  const currency = row.currency || row.meta?.currency || '';
  const precision = row.kind === 'forex' ? 4 : isNum(row.price) && row.price > 0 && row.price < 1 ? 5 : 2;
  return (
    <span className={cn('whitespace-nowrap tnum', className)}>
      {number(row.price, precision)}
      {currency ? <small className="ml-[3px] text-[9px] font-normal uppercase text-muted-foreground">{currency}</small> : null}
    </span>
  );
}

const CRYPTO_MARK: Record<string, string> = { BTCUSD: '₿', ETHUSD: 'Ξ', SOLUSD: '◎', XRPUSD: 'X' };

/**
 * An instrument's mark: the vendor's logo over a coloured disc with the
 * symbol's first letters. A failed logo leaves the disc — a broken image icon
 * in a row of tiles is worse than no image.
 */
export function InstrumentMark({ row, large = false, className }: { row: any; large?: boolean; className?: string }) {
  const kind = row.kind || row.meta?.kind;
  const stock = !kind || ['stock', 'equity', 'etf'].includes(kind);
  const symbol = String(row.symbol || '');
  const mark = row.mark || row.meta?.mark || (kind === 'crypto' ? CRYPTO_MARK[symbol] : null)
    || symbol.replace(/^\^/, '').replace(/USD$/, '').slice(0, 3);
  const [logoFailed, setLogoFailed] = React.useState(false);
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-grid flex-none place-items-center overflow-hidden rounded-full text-[10px] font-semibold text-white',
        large ? 'size-9' : 'size-[34px]', className)}
      style={{ background: row.color || row.meta?.color || '#4169b3' }}
    >
      <span>{mark}</span>
      {stock && symbol && !logoFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl(symbol)!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setLogoFailed(true)}
          className="absolute inset-0 size-full bg-white object-contain p-[3px]"
        />
      ) : null}
    </span>
  );
}

/* ---------- headings, empty states ----------------------------------------- */

export function MarketHeading({
  title, onClick, level = 'h3', className,
}: { title: React.ReactNode; onClick?: () => void; level?: 'h2' | 'h3'; className?: string }) {
  const Tag = level;
  return (
    <Tag className={cn(
      'font-[650]',
      level === 'h2' ? 'mb-7 flex items-center gap-2.5 text-[32px] tracking-[-.035em]' : 'mb-6 text-2xl leading-[1.3] tracking-[-.025em]',
      className,
    )}>
      {onClick ? (
        <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-left font-[inherit] hover:text-primary">
          {title}
          <Chevron />
        </button>
      ) : title}
    </Tag>
  );
}

/**
 * Why a data view is empty. An empty view must say *why* — "not on this
 * plan" and "the request failed" read very differently from "nothing today".
 */
export function EmptyState({
  status, message, compact = false, className,
}: { status: LoadStatus; message?: React.ReactNode; compact?: boolean; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-[10px] bg-muted p-6 text-center text-muted-foreground',
        compact ? 'min-h-[135px]' : 'min-h-[285px]',
        className,
      )}
    >
      <span className="text-[25px] font-normal opacity-65" aria-hidden="true">{status === 'loading' ? '◌' : '↗'}</span>
      <strong className="text-13 font-medium">{emptyTitle(status)}</strong>
      {message ? <p className="max-w-[60ch] text-tiny leading-relaxed">{message}</p> : null}
    </div>
  );
}

/* ---------- carousel --------------------------------------------------------
   Horizontal rails keep the same click targets on touch, trackpad and
   keyboard; the arrows appear only when there is somewhere to go. */

export function Carousel({
  children, label, className, step = 0.85,
}: { children: React.ReactNode; label: string; className?: string; step?: number }) {
  const track = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ prev: false, next: false });

  const sync = React.useCallback(() => {
    const t = track.current;
    if (!t) return;
    setEdges({ prev: t.scrollLeft >= 4, next: t.scrollLeft + t.clientWidth < t.scrollWidth - 4 });
  }, []);

  React.useEffect(() => {
    const t = track.current;
    if (!t) return;
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(t);
    return () => ro.disconnect();
  }, [sync]);

  const move = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * step, behavior: 'smooth' });
  const arrow = 'absolute top-1/2 z-[2] grid size-11 -translate-y-1/2 place-items-center rounded-full border border-border bg-background shadow hover:bg-accent';

  return (
    <div className="relative min-w-0">
      <div
        ref={track}
        tabIndex={0}
        aria-label={label}
        onScroll={sync}
        onKeyDown={(e) => {
          if (e.target !== track.current || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
          e.preventDefault();
          move(e.key === 'ArrowRight' ? 1 : -1);
        }}
        className={cn('flex snap-x snap-mandatory gap-6 overflow-x-auto py-0.5 scroll-none', className)}
      >
        {children}
      </div>
      {edges.prev && (
        <button type="button" aria-label={`Previous ${label}`} onClick={() => move(-1)} className={cn(arrow, '-left-[15px]')}>
          <ChevronLeft className="size-5" />
        </button>
      )}
      {edges.next && (
        <button type="button" aria-label={`Next ${label}`} onClick={() => move(1)} className={cn(arrow, '-right-[15px]')}>
          <ChevronRight className="size-5" />
        </button>
      )}
    </div>
  );
}

/* ---------- stories ---------------------------------------------------------- */

export type QuoteMap = Map<string, any> | null | undefined;

const MetaDivider = () => <span className="text-muted-foreground" aria-hidden="true">·</span>;

/** One story on the indices, futures or ETF boards: what it named, when, who. */
export function NewsCard({ item }: { item: any }) {
  return (
    <article className="grid gap-2 border-b border-border py-4">
      <div className="flex flex-wrap items-center gap-2 text-micro text-muted-foreground">
        {item.indices?.length ? (
          <span className="flex -space-x-1.5">
            {item.indices.map((row: any) => <InstrumentMark key={row.symbol} row={row} className="size-5 text-[7px]" />)}
          </span>
        ) : null}
        <span>{when(item.date)}</span>
        {item.source ? <><MetaDivider /><span className="font-medium">{item.source}</span></> : null}
      </div>
      {item.url
        ? <a className="text-[15px] font-semibold leading-snug hover:text-primary" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
        : <p className="text-[15px] font-semibold leading-snug">{item.title}</p>}
    </article>
  );
}

/* The named symbol under a story row. The wire supplies the tag; the quote is
   one batch call the row does not wait for — it arrives through `quotes`. */
function StoryTick({ mark, quotes }: { mark: any; quotes: QuoteMap }) {
  const nav = useNav();
  const symbol = String(mark.symbol || '').toUpperCase();
  const quote = quotes?.get(symbol);
  const change = quote ? changeOf(quote) : null;
  return (
    <button
      type="button"
      aria-label={`Open ${mark.symbol}`}
      onClick={() => nav.goSymbol(mark.symbol)}
      className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-2 text-tiny hover:bg-accent"
    >
      <InstrumentMark row={mark} className="size-5 text-[7px]" />
      <span className="font-semibold">{mark.shortName || mark.symbol}</span>
      {isNum(change) ? <Signed value={change} className="text-tiny" /> : null}
    </button>
  );
}

function StoryMarks({ item, quotes, limit = 1 }: { item: any; quotes: QuoteMap; limit?: number }) {
  if (!item.marks?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.marks.slice(0, limit).map((mark: any) => <StoryTick key={mark.symbol} mark={mark} quotes={quotes} />)}
    </div>
  );
}

function StoryMeta({ item }: { item: any }) {
  return (
    <div className="flex flex-wrap items-baseline gap-1.5 text-micro text-muted-foreground">
      <span className="font-semibold text-foreground/80">{item.source || 'Unattributed'}</span>
      <MetaDivider />
      <time dateTime={item.date || undefined}>{when(item.date)}</time>
    </div>
  );
}

function StoryLink({ item, className }: { item: any; className: string }) {
  return item.url
    ? <a className={cn('hover:text-primary', className)} href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
    : <span className={className}>{item.title}</span>;
}

/** The publisher's picture; a dead image removes its frame rather than leaving a grey box. */
function StoryPicture({ item, className }: { item: any; className?: string }) {
  const [dead, setDead] = React.useState(false);
  if (!item.image || dead) return null;
  return (
    <div className={cn('overflow-hidden rounded-[10px] bg-muted', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={() => setDead(true)} className="size-full object-cover" />
    </div>
  );
}

/**
 * One story, the way the news stream and the front page print it: publisher
 * and hour, the headline, the vendor's own summary, the symbols the story was
 * filed under, and the publisher's picture.
 */
export function StoryRow({ item, lead = false, quotes = null }: { item: any; lead?: boolean; quotes?: QuoteMap }) {
  return (
    <article className={cn('grid gap-4 border-b border-border py-5', lead ? 'md:grid-cols-[minmax(0,1fr)_280px]' : 'md:grid-cols-[minmax(0,1fr)_168px]')}>
      <div className="grid min-w-0 content-start gap-2">
        <StoryMeta item={item} />
        <StoryLink item={item} className={cn('font-semibold leading-snug', lead ? 'text-xl' : 'text-[16px]')} />
        {item.text ? <p className="line-clamp-3 text-13 leading-relaxed text-muted-foreground">{item.text}</p> : null}
        <StoryMarks item={item} quotes={quotes} limit={4} />
      </div>
      <StoryPicture item={item} className={cn('hidden md:block', lead ? 'h-[180px]' : 'h-[104px]')} />
    </article>
  );
}

/**
 * The block a news page leads with: one story given the room to be read, the
 * next few as cards under it, and the rest as headlines down one side.
 *
 * The lead is the first story with a picture: this layout is built around
 * one, and a lead without it is a headline in a very large font.
 */
export function FeaturedNews({
  stories, below = 3, aside = 4, quotes = null,
}: { stories: any[] | null | undefined; below?: number; aside?: number; quotes?: QuoteMap }) {
  const items = (stories || []).filter(Boolean);
  if (!items.length) return null;
  const lead = items.find((item) => item.image) || items[0];
  const rest = items.filter((item) => item !== lead);
  const cards = rest.slice(0, below);
  const briefs = rest.slice(below, below + aside);
  return (
    <div className={cn('grid gap-8', briefs.length && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
      <div className="grid min-w-0 content-start gap-6">
        <article className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
          <StoryPicture item={lead} className="aspect-[16/9]" />
          <div className="grid content-start gap-3">
            <StoryLink item={lead} className="text-2xl font-bold leading-tight tracking-[-.02em]" />
            {lead.text ? <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">{lead.text}</p> : null}
            <StoryMeta item={lead} />
            <StoryMarks item={lead} quotes={quotes} limit={2} />
          </div>
        </article>
        {cards.length ? (
          <div className="grid gap-5 sm:grid-cols-3">
            {cards.map((item, i) => (
              <article key={item.url || i} className="grid content-start gap-2.5">
                <StoryPicture item={item} className="aspect-[16/9]" />
                <StoryLink item={item} className="line-clamp-3 text-[15px] font-semibold leading-snug" />
                <StoryMeta item={item} />
                <StoryMarks item={item} quotes={quotes} />
              </article>
            ))}
          </div>
        ) : null}
      </div>
      {briefs.length ? (
        <div className="grid content-start divide-y divide-border">
          {briefs.map((item, i) => (
            <article key={item.url || i} className="grid gap-2 py-3.5 first:pt-0">
              <StoryLink item={item} className="text-sm font-semibold leading-snug" />
              <StoryMeta item={item} />
              <StoryMarks item={item} quotes={quotes} />
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- a quote as a list row ------------------------------------------ */

export function QuoteRow({ row, spec = {}, onPick }: { row: any; spec?: { metricKey?: string | null }; onPick: (row: any) => void }) {
  const metric = spec.metricKey && spec.metricKey !== 'changesPercentage';
  return (
    <button
      type="button"
      title={`${row.name || row.symbol} · ${row.symbol}`}
      onClick={() => onPick(row)}
      className={cn(
        'grid min-h-[67px] w-full items-center gap-3 border-b border-border py-[13px] text-left hover:bg-muted',
        metric ? 'grid-cols-[minmax(0,1fr)_auto_minmax(60px,auto)]' : 'grid-cols-[minmax(0,1fr)_auto]',
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <InstrumentMark row={row} />
        <span className="block min-w-0">
          <strong className="block truncate text-13 font-medium">{row.name || row.symbol}</strong>
          <small className="text-micro text-muted-foreground">{row.symbol || ''}</small>
        </span>
      </span>
      <span className="flex flex-col items-end gap-[3px] text-13">
        <PriceText row={row} />
        <Signed value={changeOf(row)} />
      </span>
      {metric ? <span className="text-right text-13 tnum">{metricValue(row, spec)}</span> : null}
    </button>
  );
}
