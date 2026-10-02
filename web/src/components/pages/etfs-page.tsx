'use client';

/* ==========================================================================
   Maz Vantage — the ETF Screener page (`/etfs/screener`)

   Its own menu, beneath Stock Screener, because a fund and a company are not
   the same object. A stock is scored against its sector; a basket has no
   sector, so every ETF collection here is a selection rather than a ranking.
   The one place funds are graded is the ETF tables, fund against fund within
   a hand-picked group (`lib/etf-grades.ts`). The type dropdown inside the
   screener still moves between the two with the country intact.

   It is the whole listing, filtered by rule. The curated side — "what did gold
   do today" needs somebody to have decided that GLD stands for gold — lives on
   Market Data → ETFs as the ETF tables, and is linked from here.
   ========================================================================== */

import * as React from 'react';
import { ETF_COLLECTIONS, etfCollection } from '@/lib/etf-collections';
import { DedicatedScreener } from '@/components/market/dedicated-screener';
import { ConnectionButton, Crumb, MetaDivider, PageFrame, PageHero, useQueryState } from '@/components/pages/page-parts';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';
import { FundXrayPage } from '@/components/pages/fund-xray-page';

/* The dropdown inside the screener carries every collection; the chips up
   here carry them grouped, which a dropdown cannot do legibly. */
const GROUPS = ['Market Collections', 'What the fund holds'];

export function EtfsPage({ sub }: { sub?: string | null }) {
  if (sub === 'xray') return <FundXrayPage />;
  return <EtfScreener />;
}

function EtfScreener() {
  const nav = useNav();
  const q = useQueryState();
  const collection = etfCollection(q.get('collection')).id;
  const country = q.get('country') || 'US';
  const selected: any = etfCollection(collection);

  /* `kind` has to be in the query, or the rail marks nothing active on a bare
     `/etfs` — every item on this menu says `kind: 'etfs'`. */
  React.useEffect(() => {
    if (q.get('kind') !== 'etfs' || !q.get('collection') || !q.get('country')) q.set({ kind: 'etfs', collection, country });
  }, [q, collection, country]);
  // Every collection shares the slug `screener`, so the page names itself.
  React.useEffect(() => { document.title = `${selected.title} — Maz Vantage`; }, [selected.title]);

  return (
    <PageFrame id="etf-screener">
      <PageHero eyebrow="Funds" title="ETF screener"
        strap="Every listed exchange-traded fund, cut down by a rule you can read. A fund is selected here, not scored — the company score ranks a business against its sector, and a basket belongs to no sector. To compare funds on cost, liquidity, risk, dividends and momentum, grade a board on the ETF tables."
        meta={<><ConnectionButton /><MetaDivider /><Crumb onClick={() => nav.goView('markets', 'etfs', { board: 'tables' })}>Looking for a named board? ETF tables</Crumb></>} />

      <div className="grid gap-5">
        {GROUPS.map((group) => {
          const items = (ETF_COLLECTIONS as any[]).filter((item) => item.group === group);
          if (!items.length) return null;
          return (
            <section key={group} aria-label={group}>
              <h2 className="mb-2.5 text-micro font-semibold uppercase tracking-[.08em] text-muted-foreground">
                {group === 'What the fund holds' ? 'What the fund holds — read from its own name' : group}
              </h2>
              <div role="group" aria-label={group} className="flex flex-wrap gap-2">
                {items.map((item) => {
                  const on = item.id === collection;
                  return (
                    <button key={item.id} type="button" aria-pressed={on} title={item.unavailable || item.note || item.title}
                      onClick={() => q.set({ collection: etfCollection(item.id).id, kind: 'etfs' })}
                      className={cn('rounded-full border border-border px-3.5 py-1.5 text-13 font-medium hover:bg-accent',
                        on && 'border-foreground bg-foreground text-background hover:bg-foreground')}>
                      {item.title}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* The rule a collection selects on, printed where it is applied. */}
      {selected.unavailable || selected.note ? (
        <p className={cn('mt-5 max-w-[100ch] text-13 leading-relaxed', selected.unavailable ? 'text-warning' : 'text-muted-foreground')}>
          {selected.unavailable || selected.note}
        </p>
      ) : null}

      <div className="mt-6">
        <DedicatedScreener kind="etfs" collection={collection} country={country} chrome={false} picker={false}
          onNavigate={(next) => {
            if (next.kind !== 'etfs') { nav.goView('stocks', 'screener', next as any); return; }
            q.set({ country: next.country || country, collection: etfCollection(next.collection).id });
          }} />
      </div>
    </PageFrame>
  );
}
