import type { Metadata } from 'next';
import { ReportShell } from '@/components/report/report-shell';

/* The report lives in the layout, not the page: a layout persists while its
   child segment changes, so moving between tabs (`/stock/AAPL` →
   `/stock/AAPL/growth`) keeps every panel already built instead of
   remounting the report and refetching 30 feeds. */

type Props = { params: { symbol: string }; children: React.ReactNode };

export function generateMetadata({ params }: { params: { symbol: string } }): Metadata {
  return { title: `${decodeURIComponent(params.symbol).toUpperCase()} Stock Analysis` };
}

export default function StockLayout({ params, children }: Props) {
  return (
    <>
      <ReportShell symbol={decodeURIComponent(params.symbol)} />
      {children}
    </>
  );
}
