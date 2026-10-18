/* ==========================================================================
   Maz Vantage — the halal checks people search for most

   The companies whose "is it halal?" page the footer links to on every
   page: the largest US names and the ones asked about most. Each link goes
   to that company's Shariah tab, where the answer and its FAQ are rendered
   on the server. `name` is what people type ("Google", not "Alphabet Inc."),
   so the link reads like the search it answers.

   US-listed only, like the sitemap's universe: a link here must open a
   report that renders.
   ========================================================================== */

import { stockHref } from './routes';

export interface HalalCheck { symbol: string; name: string }

export const POPULAR_HALAL_CHECKS: HalalCheck[] = [
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Google' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'AVGO', name: 'Broadcom' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway' },
  { symbol: 'WMT', name: 'Walmart' },
  { symbol: 'LLY', name: 'Eli Lilly' },
  { symbol: 'JPM', name: 'JPMorgan' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'MA', name: 'Mastercard' },
  { symbol: 'XOM', name: 'ExxonMobil' },
  { symbol: 'ORCL', name: 'Oracle' },
  { symbol: 'COST', name: 'Costco' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'PLTR', name: 'Palantir' },
];

export const halalCheckLabel = (c: HalalCheck) => `Is ${c.name} stock halal?`;
export const halalCheckHref = (c: HalalCheck) => stockHref(c.symbol, 'Shariah Compliance');
