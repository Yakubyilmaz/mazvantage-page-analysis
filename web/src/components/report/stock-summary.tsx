/* ==========================================================================
   Maz Vantage — the company summary, rendered on the server

   Two server components over `lib/server/stock-summary.ts`:

   - `StockSummaryBlock` is what the report shows while it loads, in place of
     a bare skeleton: the halal label, the sentence behind it, and who the
     company is. It is in the HTML a search engine fetches, and it is the
     same reading the verdict card prints once the report is up, so the page
     never says one thing to a crawler and another to a reader.
   - `StockJsonLd` is the structured data for the company as an
     organisation. Rendered outside the report so it stays in the page after
     the report replaces the summary. The FAQ markup lives with the FAQ
     itself (`halal-faq.tsx`, Shariah tab only), so it is only ever on a page
     that prints the same questions.

   No logo, no data-provider name, no figure the label did not read.
   ========================================================================== */

import * as React from 'react';
import { cache } from 'react';
import { loadStockSummary, type StockSummary } from '@/lib/server/stock-summary';
import { stockHref } from '@/lib/routes';
import { absolute } from '@/lib/site';
import { BRAND_NAME } from '@/lib/brand';
import { cn } from '@/lib/cn';

/** One read per request, however many components and metadata calls ask. */
export const getStockSummary = cache((symbol: string) => loadStockSummary(symbol));

const TONE: Record<string, string> = { good: 'text-up', bad: 'text-down', warn: 'text-warning', muted: 'text-muted-foreground' };

const clip = (s: string | null, n: number) => (!s ? '' : s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n))}…`);

export function halalQuestion(s: Pick<StockSummary, 'name' | 'symbol'>) {
  return `Is ${s.name} (${s.symbol}) halal?`;
}

export async function StockSummaryBlock({ symbol }: { symbol: string }) {
  const s = await getStockSummary(symbol);
  if (!s) return null;
  return (
    <section aria-labelledby="stock-summary-q" className="max-w-[var(--shell-max)] px-6 pt-6">
      <div className="rounded-xl border border-border p-5">
        <p className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">
          {[s.exchange, s.sector, s.industry].filter(Boolean).join(' · ')}
        </p>
        <h2 id="stock-summary-q" className="mt-1 text-xl font-bold tracking-[-.02em]">{halalQuestion(s)}</h2>
        <p className={cn('mt-2 text-lg font-bold', TONE[s.label.tone])}>{s.label.headline}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.label.sentence}</p>
        <p className="mt-2 text-tiny text-muted-foreground">
          {s.asOf ? `Balance sheet of ${s.asOf}. ` : ''}A screen against published methodologies, not a ruling.{' '}
          <a className="text-primary hover:underline" href={stockHref(s.symbol, 'Shariah Compliance')}>The full Shariah screen</a>
        </p>
        {s.description ? <p className="mt-4 border-t border-border pt-4 text-13 leading-relaxed">{clip(s.description, 420)}</p> : null}
      </div>
    </section>
  );
}

export async function StockJsonLd({ symbol }: { symbol: string }) {
  const s = await getStockSummary(symbol);
  if (!s) return null;
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${s.name} (${s.symbol}) stock analysis and Shariah screen`,
      url: absolute(stockHref(s.symbol)),
      publisher: { '@type': 'Organization', name: BRAND_NAME },
      about: { '@type': 'Corporation', name: s.name, tickerSymbol: s.symbol, description: clip(s.description, 300) || undefined },
    },
  ];
  // `<` escaped so a description can never close the script element.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
