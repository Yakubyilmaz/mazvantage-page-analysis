'use client';

/* ==========================================================================
   The frame every page shares: the black rail, the content column (utility
   bar, page, footer), and the market rail.

   The footer closes the content column rather than spanning all three: the
   rails either side are sticky, and a full-width footer would pull them off
   screen as it scrolled in.

   The market rail's column narrows to a 44px strip when the reader puts the
   rail away — read off the rail itself with `:has()`, and only at widths where
   the rail shows at all (under 1280px it is hidden, and a strip for a hidden
   rail would be an empty stripe down the page).
   ========================================================================== */

import { Suspense } from 'react';
import { SideNav } from '@/components/shell/side-nav';
import { UtilBar } from '@/components/shell/util-bar';
import { SiteFooter } from '@/components/shell/site-footer';
import { MarketRail } from '@/components/shell/market-rail';

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={[
        'grid min-h-screen',
        'grid-cols-[var(--sidenav-w)_minmax(0,1fr)_296px]',
        'min-[1281px]:has-[>aside[data-closed]]:grid-cols-[var(--sidenav-w)_minmax(0,1fr)_44px]',
        'max-[1280px]:grid-cols-[var(--sidenav-w)_minmax(0,1fr)]',
        'max-[900px]:grid-cols-[minmax(0,1fr)]',
      ].join(' ')}
    >
      <Suspense fallback={<aside className="bg-rail" />}>
        <SideNav />
      </Suspense>
      <div className="flex min-w-0 flex-col">
        <UtilBar />
        {children}
        <SiteFooter />
      </div>
      <MarketRail />
    </div>
  );
}
