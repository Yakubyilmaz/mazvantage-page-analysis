/* ==========================================================================
   Maz Vantage — the companies the sitemap lists

   The listed US companies the stock directory covers, largest first, up to
   5,000: each gets its report and its "Is <company> halal?" page in the
   sitemap. One screener read, cached by the framework for a day.

   Without a key, the companies with a bundled snapshot in `public/data/`,
   because those are the only reports that render without live data.
   ========================================================================== */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { FMP_BASE } from '../fmp/paths';

export const UNIVERSE_CAP = 5000;

export async function loadUniverse(): Promise<string[]> {
  const key = process.env.FMP_API_KEY?.trim();
  if (key) {
    const qs = new URLSearchParams({
      country: 'US', isEtf: 'false', isFund: 'false', isActivelyTrading: 'true', limit: String(UNIVERSE_CAP), apikey: key,
    });
    try {
      const res = await fetch(`${FMP_BASE}/company-screener?${qs}`, { next: { revalidate: 86_400 } } as RequestInit);
      const rows = res.ok ? await res.json() : null;
      if (Array.isArray(rows) && rows.length) {
        return [...new Set(rows
          .filter((r: any) => typeof r?.symbol === 'string' && /^[A-Z.\-]{1,6}$/.test(r.symbol))
          .sort((x: any, y: any) => (y.marketCap ?? 0) - (x.marketCap ?? 0))
          .map((r: any) => r.symbol as string))].slice(0, UNIVERSE_CAP);
      }
    } catch { /* fall through to the bundled reports */ }
  }
  try {
    const files = await readdir(path.join(process.cwd(), 'public', 'data'));
    return files.map((f) => /^([A-Z]{1,5})\.json$/.exec(f)?.[1]).filter((s): s is string => !!s);
  } catch {
    return [];
  }
}
