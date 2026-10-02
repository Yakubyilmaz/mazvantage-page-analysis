/* ==========================================================================
   The market canvas's formatters and country memory.

   The non-DOM half of the legacy `markethub-ui.js`. Nothing here fetches;
   every value arrives from the data adapter (`markethub-data.ts`).
   ========================================================================== */

import { isNum } from './format';
import { DEFAULT_COUNTRY } from './markethub-data';

const COUNTRY_KEY = 'mazvantage.market.country';

/** The vendor spells a country two ways on the calendar feed, one of them not ISO. */
export const COUNTRY_ALIAS: Record<string, string> = { USA: 'US', UK: 'GB', EL: 'GR', UAE: 'AE' };

export const flagUrl = (iso: string) => `https://flagcdn.com/${iso.toLowerCase()}.svg`;

/**
 * The country a visit opens on: the one in the link, else the last one chosen
 * here, else the United States. Neither store is required to be readable.
 */
export function storedCountry(search?: string | URLSearchParams | null): string {
  try {
    const qs = search instanceof URLSearchParams
      ? search
      : new URLSearchParams(search ?? (typeof window !== 'undefined' ? window.location.search : ''));
    const asked = qs.get('country');
    if (asked) return asked;
  } catch { /* no query string to read */ }
  try {
    return (typeof window !== 'undefined' && window.localStorage.getItem(COUNTRY_KEY)) || DEFAULT_COUNTRY;
  } catch {
    return DEFAULT_COUNTRY;
  }
}

/** Keep the choice across visits. (The page puts it in the URL itself, so a link carries it.) */
export function rememberCountry(code: string) {
  try { window.localStorage.setItem(COUNTRY_KEY, code); } catch { /* storage unavailable */ }
}

export const shortNumber = (value: unknown) =>
  !isNum(value) ? '—' : Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);

export const number = (value: unknown, dp = 2) =>
  !isNum(value) ? '—' : value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const percent = (value: unknown) =>
  !isNum(value) ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${number(Math.abs(value))}%`;

export const changeOf = (row: any): number | null | undefined => row?.changesPercentage ?? row?.changePercentage;

/** A publishing time as a reader says it, not as a clock does. */
export function when(value: unknown): string {
  const at = value ? new Date(String(value).replace(' ', 'T')) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  const hours = Math.floor((Date.now() - at.getTime()) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function metricValue(row: any, spec: { metricKey?: string | null }): string | null {
  const key = spec.metricKey;
  if (!key) return null;
  const value = row[key];
  if (/yield|rangePct/i.test(key)) return isNum(value) ? `${number(value)}%` : '—';
  if (/change|return|yield|volatility|growth|Pct/i.test(key)) return percent(value);
  if (/date/i.test(key)) return value || '—';
  return shortNumber(value);
}

export type LoadStatus = 'loading' | 'skipped' | 'gated' | 'unavailable' | 'error' | 'ok' | 'empty' | string;

export function emptyTitle(status: LoadStatus): string {
  return status === 'loading' ? 'Loading market data'
    : status === 'skipped' ? 'Market data is unavailable right now'
      : status === 'gated' ? 'Not available here'
        : status === 'unavailable' ? 'Not available for this market'
          : status === 'error' ? 'Data could not be loaded'
            : 'No results available';
}
