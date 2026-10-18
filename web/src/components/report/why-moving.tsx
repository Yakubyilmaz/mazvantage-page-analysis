'use client';

/* ==========================================================================
   Maz Vantage — "Why it's moving", the line under the stock's price

   The reading is `lib/why-moving.ts`; this gathers its feeds. Most are in the
   report already (quote, closes, benchmarks, news, releases, results,
   dividends). Rating changes are an on-demand feed, so they are fetched once
   here — live, else the saved copy — and the line is redrawn when they land.
   Intraday, the benchmarks' daily series stop at yesterday, so the two fund
   quotes are asked for in one request to measure the market's day too.
   ========================================================================== */

import * as React from 'react';
import { fetchBatchQuotes, fetchFor, hasApiKey, loadSnapshot } from '@/lib/fmp';
import { MARKET_ETF, SECTOR_ETF } from '@/lib/nav';
import { pct } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import type { Extras } from '@/lib/report-load';
import { readMove, type Cause } from '@/lib/why-moving';
import { useDataEpoch } from '@/components/providers';
import { cn } from '@/lib/cn';

/** A feed's rows when it loaded (an empty list is a loaded feed with nothing in it); null when it did not. */
function rowsOf(a: Analysis, name: string): any[] | null {
  if (a.ds.status(name) !== 'ok') return null;
  const d = a.ds.get(name);
  return Array.isArray(d) ? d : [];
}

function useRatingRows(a: Analysis): any[] | null | undefined {
  const { epoch } = useDataEpoch();
  const symbol = a.facts.symbol;
  const inReport = rowsOf(a, 'gradeActions');
  const [rows, setRows] = React.useState<any[] | null | undefined>(inReport ?? undefined);
  React.useEffect(() => {
    if (inReport) { setRows(inReport); return; }
    let live = true;
    setRows(undefined);
    (async () => {
      let out: any[] | null = null;
      if (hasApiKey()) {
        const r = await fetchFor('gradeActions', symbol).catch(() => null);
        if (r?.status === 'ok' && Array.isArray(r.data)) out = r.data;
      }
      if (!out) {
        const snap = await loadSnapshot(symbol).catch(() => null);
        const saved = snap?.feeds?.gradeActions;
        if (Array.isArray(saved)) out = saved;
      }
      if (live) setRows(out);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, epoch]);
  return rows;
}

const KIND_LABEL: Record<Cause['kind'], string> = { earnings: 'Results', 'ex-dividend': 'Ex-dividend', rating: 'Rating change', story: 'News' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day} ${MONTHS[m - 1]}`; };

export function WhyMoving({ a, extras }: { a: Analysis; extras: Extras }) {
  const f = a.facts;
  const ratings = useRatingRows(a);
  const sectorName = SECTOR_ETF[f.sector] || null;
  const [live, setLive] = React.useState<{ market: number | null; sector: number | null } | null>(null);
  const [open, setOpen] = React.useState(false);

  const reading = React.useMemo(() => readMove({
    symbol: f.symbol,
    quote: { price: f.price, changePct: f.changePct, time: f.quoteTime },
    prices: a.ds.get('prices'),
    market: extras.benchmarks?.market,
    sector: extras.benchmarks?.industry,
    sectorName,
    marketPct: live?.market ?? null,
    sectorPct: live?.sector ?? null,
    news: rowsOf(a, 'news'),
    press: rowsOf(a, 'pressReleases'),
    ratings: ratings === undefined ? [] : ratings,
    earnings: rowsOf(a, 'earnings'),
    dividends: rowsOf(a, 'dividends'),
  }), [a, extras, sectorName, live, ratings, f]);

  // Intraday: the funds' daily closes end yesterday, so ask for their quotes.
  const lastMarket = React.useMemo(() => {
    const m = extras.benchmarks?.market;
    return Array.isArray(m) && m.length ? m.map((b: any) => String(b.date).slice(0, 10)).sort().pop()! : null;
  }, [extras]);
  React.useEffect(() => {
    if (!reading || live || !hasApiKey() || (lastMarket && reading.date <= lastMarket)) return;
    let on = true;
    fetchBatchQuotes([MARKET_ETF, sectorName].filter(Boolean)).then((r) => {
      if (!on || r.status !== 'ok') return;
      const by = Object.fromEntries((r.data || []).map((q: any) => [q.symbol, Number(q.changePercentage) / 100]));
      setLive({ market: Number.isFinite(by[MARKET_ETF]) ? by[MARKET_ETF] : null, sector: sectorName && Number.isFinite(by[sectorName]) ? by[sectorName] : null });
    }).catch(() => {});
    return () => { on = false; };
  }, [reading, live, lastMarket, sectorName]);

  if (!reading) return null;
  const tone = reading.pct > 0 ? 'text-up' : reading.pct < 0 ? 'text-down' : 'text-muted-foreground';
  const quoteDay = f.quoteTime ? String(f.quoteTime).slice(0, 10) : null;
  const staleQuote = quoteDay && quoteDay < reading.date ? quoteDay : null;
  const unread = ratings === undefined ? [...reading.unread.filter((u) => u !== 'rating changes'), 'rating changes (loading)'] : reading.unread;

  return (
    <section aria-label="Why it’s moving" className="mx-6 mb-3 rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-13 leading-relaxed">
      <p>
        <span className={cn('mr-2 whitespace-nowrap text-micro font-semibold uppercase tracking-[.06em]', tone)}>Why it’s moving</span>
        <span>{reading.line}</span>
        {reading.causes.length || unread.length ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
            className="ml-2 whitespace-nowrap text-13 font-semibold text-primary hover:underline no-print">
            {open ? 'Hide' : 'What we matched'} ›
          </button>
        ) : null}
      </p>
      {open ? (
        <div className="mt-2 grid gap-2 border-t border-border pt-2">
          {reading.causes.length ? (
            <ul className="grid gap-1.5">
              {reading.causes.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="rounded-full bg-background px-2 py-0.5 text-micro font-semibold text-muted-foreground">{c.label || KIND_LABEL[c.kind]}</span>
                  <span className="text-tiny text-muted-foreground tnum">{short(c.date)}</span>
                  {c.url
                    ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.text}</a>
                    : <span>{c.text.charAt(0).toUpperCase() + c.text.slice(1)}</span>}
                  {c.direction ? <span className={cn('text-tiny', c.direction === 'up' ? 'text-up' : 'text-down')}>{c.direction === 'up' ? 'reads up' : 'reads down'}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="max-w-[110ch] text-tiny text-muted-foreground">
            Matched by date{reading.prevDate ? `, from the close on ${short(reading.prevDate)} to ${short(reading.date)}` : ''}: results, the ex-dividend date, rating
            changes, the company’s releases and the press, with commentary, holder filings and price recaps set aside. It shows what coincided
            with the move, not what caused it; a story “reads up” or “down” only where its headline’s verb has one meaning.
            {reading.typical != null ? ` A typical day for ${f.symbol} moves about ${pct(reading.typical, { dp: 1 })} either way (60 sessions).` : ''}
            {reading.sectorPct != null && reading.sectorName ? ` Sector fund ${reading.sectorName}: ${pct(reading.sectorPct, { dp: 1, sign: true })}.` : ''}
            {unread.length ? ` Not read: ${unread.join(', ')}.` : ''}
            {staleQuote ? ` The price above is the last quote on record (${short(staleQuote)}); this line reads the newer daily closes.` : ''}
          </p>
        </div>
      ) : null}
    </section>
  );
}
