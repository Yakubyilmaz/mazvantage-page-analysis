/* ==========================================================================
   Maz Vantage — reading the mover and snapshot feeds

   The pure halves of the legacy `markets.js`, shared by the Markets Data
   pages and Home.

   **Before reading a mover list.** `biggest-gainers` and its siblings return
   whatever traded — leveraged ETFs, SPAC rights, warrants and sub-dollar
   shells beside real companies. A list topped by a 175% move in a rights line
   is not a market story, so the lists filter by default to things that look
   like common stock, and the page prints the count removed.
   ========================================================================== */

import { isNum } from './format';

/**
 * Does this row look like ordinary common stock? Name and ticker patterns are
 * as far as these feeds allow — they carry no fund flag. Conservative on
 * purpose: a filter wrong in the direction of showing too much is recoverable
 * by the reader, one that silently hides real companies is not. Hence the
 * toggle, and the printed count.
 */
export function looksLikeStock(row: any): boolean {
  const name = String(row.name || '');
  const sym = String(row.symbol || '');
  // A trailing R / W / U on a five-letter NASDAQ symbol is a right, warrant or unit.
  if (/^[A-Z]{4}[RWU]$/.test(sym)) return false;
  if (/\.(WS|U|R)$/i.test(sym)) return false;
  return !/\b(ETF|ETN|Rights?|Warrants?|Units?|Preferred|Depositary|Bull|Bear|Daily|[0-9](?:\.[0-9])?X|Leverage[d]?|Ultra|ProShares|Direxion|GraniteShares|T-REX)\b/i.test(name);
}

/**
 * Group the per-exchange rows into one row per sector, averaged. FMP returns
 * one row per sector *per exchange*, so a page that skipped this would show
 * Technology three times. Home reads it too.
 */
export function sectorRows(res: any): { sector: string; change: number; exchanges: number }[] {
  if (res?.status !== 'ok') return [];
  const by = new Map<string, { sector: string; total: number; n: number }>();
  for (const r of res.data || []) {
    const name = r.sector || r.industry;
    if (!name || !isNum(r.averageChange)) continue;
    const cur = by.get(name) || { sector: name, total: 0, n: 0 };
    cur.total += r.averageChange; cur.n += 1;
    by.set(name, cur);
  }
  return [...by.values()].map((x) => ({ sector: x.sector, change: x.total / x.n, exchanges: x.n })).sort((a, b) => b.change - a.change);
}
