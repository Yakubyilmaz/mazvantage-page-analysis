import * as React from 'react';
import { ReportShell } from '@/components/report/report-shell';
import { StockJsonLd, StockSummaryBlock } from '@/components/report/stock-summary';

/* The report lives in the layout, not the page: a layout persists while its
   child segment changes, so moving between tabs (`/stock/AAPL` →
   `/stock/AAPL/growth`) keeps every panel already built instead of
   remounting the report and refetching 30 feeds.

   The report renders in the browser. What the server adds is the summary a
   search engine can read — shown while the report loads — and the structured
   data. Each streams behind its own Suspense boundary, so a slow read never
   holds up the page. Titles and descriptions are per tab, in the page. */

type Props = { params: { symbol: string }; children: React.ReactNode };

export default function StockLayout({ params, children }: Props) {
  const symbol = decodeURIComponent(params.symbol);
  return (
    <>
      <React.Suspense fallback={null}><StockJsonLd symbol={symbol} /></React.Suspense>
      <ReportShell symbol={symbol} preface={<React.Suspense fallback={null}><StockSummaryBlock symbol={symbol} /></React.Suspense>} />
      {children}
    </>
  );
}
