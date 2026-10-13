/* ==========================================================================
   Maz Vantage — compliance changes

   A halal label changes without the company filing anything: both ratios
   divide by market value, so a falling price can push a company over a debt
   limit overnight. A holder wants to be told. Two places tell them:

   - **In the browser, today**: the watchlist's Compliance block remembers the
     labels it last showed (`mazvantage.halal.seen`) and lists what changed
     since, until the reader marks them seen. Per browser, and only as often
     as the reader looks.
   - **On the server, once there is one** (BACKEND_CONTRACT.md §2): a nightly
     job stores every company's label and sends alerts. It should import this
     file, so "changed" means the same thing in both places.

   A change is a different tone (good / warn / bad / muted) or a different
   short label. Up and down are by tone; a move to or from "not screened" is
   neither, because missing data is not news about the company.
   ========================================================================== */

import type { HalalLabel, HalalTone } from './halal-label';

export interface LabelRecord {
  symbol: string;
  tone: HalalTone;
  word: string;
  headline: string;
  /** ISO date the label was read */
  at: string;
}

export type Direction = 'better' | 'worse' | 'other';

export interface ComplianceChange {
  symbol: string;
  from: LabelRecord;
  to: LabelRecord;
  direction: Direction;
}

const RANK: Partial<Record<HalalTone, number>> = { bad: 0, warn: 1, good: 2 };

export const recordOf = (symbol: string, label: HalalLabel, at: string): LabelRecord =>
  ({ symbol, tone: label.tone, word: label.word, headline: label.headline, at });

export function direction(from: HalalTone, to: HalalTone): Direction {
  const a = RANK[from];
  const b = RANK[to];
  if (a == null || b == null || a === b) return 'other';
  return b > a ? 'better' : 'worse';
}

/** What changed between two sets of labels. Symbols in only one set are not changes. */
export function diffLabels(prev: Record<string, LabelRecord>, next: Record<string, LabelRecord>): ComplianceChange[] {
  const out: ComplianceChange[] = [];
  for (const [symbol, to] of Object.entries(next)) {
    const from = prev[symbol];
    if (!from || (from.tone === to.tone && from.word === to.word)) continue;
    out.push({ symbol, from, to, direction: direction(from.tone, to.tone) });
  }
  const order: Record<Direction, number> = { worse: 0, better: 1, other: 2 };
  return out.sort((x, y) => order[x.direction] - order[y.direction] || x.symbol.localeCompare(y.symbol));
}
