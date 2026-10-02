/* ==========================================================================
   Maz Vantage — a company's long daily history, for the Technicals tab

   One request: fifteen years of daily open/high/low/close/volume from
   `historical-price-eod/full`. Everything on the tab — the summary, pivots,
   patterns, the study chart, seasonality and the history table — reads the
   same bars, so the tab costs one call however much of it is opened.

   Three answers, and the tab says which it got:
   - **full**: open, high, low and close — everything computes;
   - **close only**: a plan with closes but no OHLC history, or the bundled
     snapshot with no key — the close-based studies run, and the ones that
     need a day's range (stochastics, ADX, candles, pivots) say so;
   - nothing: the vendor's own reason, printed.
   ========================================================================== */

import { fetchFor, hasApiKey, type FeedResult } from './fmp';
import { barsFromFeed, hasOHLC, type Bar } from './technicals';

export const HISTORY_YEARS = 15;

export interface HistoryLoad {
  status: 'loading' | 'ok' | 'gated' | 'error' | 'skipped' | 'empty';
  bars: Bar[];
  /** Every bar carries open, high and low. */
  ohlc: boolean;
  source: 'live' | 'snapshot' | null;
  message?: string;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function loadDailyHistory(symbol: string, snapshotPrices?: unknown): Promise<HistoryLoad> {
  if (!hasApiKey()) {
    const bars = barsFromFeed(snapshotPrices);
    return bars.length
      ? { status: 'ok', bars, ohlc: hasOHLC(bars), source: 'snapshot' }
      : { status: 'skipped', bars: [], ohlc: false, source: null, message: 'Price history is unavailable right now.' };
  }
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - HISTORY_YEARS);
  const range = { from: day(from), to: day(to) };

  let res: FeedResult = await fetchFor('marketHistory', symbol, range);
  let bars = res.status === 'ok' ? barsFromFeed(res.data) : [];
  // Some plans carry closes but not OHLC history: take the light feed rather than nothing.
  if (!bars.length) {
    const light = await fetchFor('prices', symbol, range);
    const lightBars = light.status === 'ok' ? barsFromFeed(light.data) : [];
    if (lightBars.length) { res = light; bars = lightBars; }
  }
  if (!bars.length) {
    const status = res.status === 'ok' ? 'empty' : (res.status as HistoryLoad['status']);
    return {
      status, bars: [], ohlc: false, source: null,
      message: res.status === 'gated' ? 'Daily price history is not available for this symbol.'
        : res.message || 'No daily history came back for this symbol.',
    };
  }
  return { status: 'ok', bars, ohlc: hasOHLC(bars), source: 'live' };
}
