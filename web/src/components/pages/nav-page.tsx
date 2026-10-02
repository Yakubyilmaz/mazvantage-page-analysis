'use client';

/* The ten nav pages (plus Calendar and Pricing) and the component each one
   dispatches to. Every one renders from nothing and fetches afterwards — none
   of them pays for a company dataset. */

import * as React from 'react';
import { PageHead } from '@/components/shell/page-head';
import { EtfsPage } from '@/components/pages/etfs-page';
import { QuantPage } from '@/components/pages/quant-page';
import { ShariahPage } from '@/components/pages/shariah-page';
import { StocksPage } from '@/components/pages/stocks-page';
import { IdeasPage } from '@/components/pages/ideas-page';
import { ResearchPage } from '@/components/pages/research-page';
import { NewsPage } from '@/components/pages/news-page';
import { PricingPage } from '@/components/pages/pricing-page';
import { AlphaPage } from '@/components/pages/alpha-page';
import { EarningsPage } from '@/components/pages/earnings-page';
import { CalendarPage } from '@/components/pages/calendar-page';
import { WatchlistPage } from '@/components/pages/watchlist-page';
import { SectorsPage } from '@/components/pages/sectors-page';
import { MarketsPage } from '@/components/pages/markets-page';

type PageComponent = React.ComponentType<{ sub: string | null }>;

const PAGES: Record<string, PageComponent> = {
  etfs: EtfsPage,
  quant: QuantPage,
  shariah: ShariahPage,
  stocks: StocksPage,
  ideas: IdeasPage,
  research: ResearchPage,
  news: NewsPage,
  pricing: PricingPage,
  alpha: AlphaPage,
  earnings: EarningsPage,
  calendar: CalendarPage,
  watchlist: WatchlistPage,
  sectors: SectorsPage,
  markets: MarketsPage,
};

export function NavPage({ view, sub }: { view: string; sub: string | null }) {
  const Page = PAGES[view];
  if (Page) return <Page sub={sub} />;
  return (
    <div className="px-gutter pb-16">
      <PageHead view={view} sub={sub} />
      <p className="text-muted-foreground">This page is being ported.</p>
    </div>
  );
}
