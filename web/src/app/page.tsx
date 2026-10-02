import { HomePage } from '@/components/pages/home-page';

// Spelled out: the root layout's `%s — Maz Vantage` template only reaches child
// segments, and this page is in the root segment itself.
export const metadata = { title: 'Home — Maz Vantage' };

/* The market's front page. A URL that names no view and no company is somebody
   arriving at the product rather than at a report, so it lands here. */
export default function Page() {
  return <HomePage />;
}
