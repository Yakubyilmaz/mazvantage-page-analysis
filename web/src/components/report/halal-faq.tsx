/* ==========================================================================
   Maz Vantage — the halal FAQ under a company's Shariah tab

   A server component, so the questions and their answers are in the HTML a
   search engine fetches and stay on the page after the report has loaded
   (the summary above the report is replaced by it; this is not). The words
   come from `lib/halal-faq.ts`, and the structured data is built from the
   same items, so the page and its FAQ markup can never disagree.

   Native `<details>`: every answer is in the document, folded, with no
   script needed to open one. The first is open, because it is the answer to
   the question the reader searched.
   ========================================================================== */

import { ChevronDown } from 'lucide-react';
import { getStockSummary } from '@/components/report/stock-summary';
import { faqJsonLd, halalFaq } from '@/lib/halal-faq';

export async function StockHalalFaq({ symbol }: { symbol: string }) {
  const s = await getStockSummary(symbol);
  if (!s) return null;
  const items = halalFaq(s);
  // `<` escaped so an answer can never close the script element.
  const json = JSON.stringify(faqJsonLd(items)).replace(/</g, '\\u003c');
  return (
    <section aria-labelledby="halal-faq" className="max-w-[var(--shell-max)] px-6 pb-8 pt-2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      <h2 id="halal-faq" className="mb-3 text-xl font-bold tracking-[-.02em]">Questions about {s.name}’s halal status</h2>
      <div className="divide-y divide-border rounded-xl border border-border">
        {items.map((it, i) => (
          <details key={it.q} open={i === 0} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
              <h3>{it.q}</h3>
              <ChevronDown aria-hidden className="size-4 flex-none text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-2 px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
              {it.a.map((p) => <p key={p}>{p}</p>)}
              {it.list ? <ul className="grid list-disc gap-1 pl-5">{it.list.map((l) => <li key={l}>{l}</li>)}</ul> : null}
              {it.link ? <p><a href={it.link.href} className="text-primary hover:underline">{it.link.label} →</a></p> : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
