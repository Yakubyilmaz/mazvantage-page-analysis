/* ==========================================================================
   Maz Vantage — the reader's Home layout

   Which blocks Home shows, in which order. Kept in this browser, like the
   watchlists and the notes: there are no accounts, so a layout is a
   per-machine convenience and nothing else reads it.

   A stored layout is always merged with the block list rather than trusted:
   a block added in a later release appears in its default place and state,
   a block that no longer exists is dropped, and a corrupt value reads as the
   default. The page can therefore never lose a section because of what an
   older version wrote.
   ========================================================================== */

import * as React from 'react';
import { readJson, useStoredJson, writeJson } from './local-store';

export const HOME_LAYOUT_KEY = 'mazvantage.home.layout';

export type BlockId = 'banner' | 'stories' | 'watchlist' | 'notes' | 'screens' | 'markets' | 'stocks' | 'etfs' | 'commodities' | 'economy';

export interface BlockSpec {
  id: BlockId;
  label: string;
  about: string;
  /** reads the reader's own data in this browser, so it needs no key */
  personal?: boolean;
  /** off until the reader turns it on */
  offByDefault?: boolean;
}

/** In default order. */
export const HOME_BLOCKS: BlockSpec[] = [
  { id: 'banner', label: 'Market banner', about: 'The indices and the busiest listings, in a strip.' },
  { id: 'watchlist', label: 'Your watchlist', about: 'The active list, quoted.', personal: true },
  { id: 'stories', label: 'Top stories', about: 'The wire, newest first.' },
  { id: 'markets', label: 'Markets summary', about: 'Major indices and the US economy.' },
  { id: 'stocks', label: 'US stocks', about: 'Movers, the busiest books, and who reports next.' },
  { id: 'etfs', label: 'ETFs', about: 'The most traded funds.' },
  { id: 'commodities', label: 'Commodities', about: 'Energy and metals contracts.' },
  { id: 'economy', label: 'Economy', about: 'Headline inflation and the release calendar.' },
  { id: 'notes', label: 'Your recent notes', about: 'The last notes you wrote on a company. Hidden while there are none.', personal: true },
  { id: 'screens', label: 'Your saved screens', about: 'Screens saved from the screeners. Hidden while there are none.', personal: true },
];

export interface LayoutEntry { id: BlockId; on: boolean }

export const DEFAULT_LAYOUT: LayoutEntry[] = HOME_BLOCKS.map((b) => ({ id: b.id, on: !b.offByDefault }));

const KNOWN = new Set<string>(HOME_BLOCKS.map((b) => b.id));

/** A stored value to a whole layout: known blocks in the stored order, new ones in their default place. */
export function normaliseLayout(raw: unknown): LayoutEntry[] {
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT.map((e) => ({ ...e }));
  const seen = new Set<string>();
  const out: LayoutEntry[] = [];
  for (const r of raw as any[]) {
    if (!r || !KNOWN.has(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, on: r.on !== false });
  }
  // Each missing block goes in after the block it follows by default, so a
  // new section lands where it was designed to rather than at the bottom.
  DEFAULT_LAYOUT.forEach((d, i) => {
    if (seen.has(d.id)) return;
    const before = DEFAULT_LAYOUT.slice(0, i).map((x) => x.id).reverse().find((id) => out.some((o) => o.id === id));
    const at = before ? out.findIndex((o) => o.id === before) + 1 : 0;
    out.splice(at, 0, { ...d });
    seen.add(d.id);
  });
  return out;
}

export const isDefaultLayout = (l: LayoutEntry[]) =>
  l.length === DEFAULT_LAYOUT.length && l.every((e, i) => e.id === DEFAULT_LAYOUT[i].id && e.on === DEFAULT_LAYOUT[i].on);

export function moveBlock(l: LayoutEntry[], id: BlockId, by: -1 | 1): LayoutEntry[] {
  const i = l.findIndex((e) => e.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= l.length) return l;
  const next = [...l];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const toggleBlock = (l: LayoutEntry[], id: BlockId) => l.map((e) => (e.id === id ? { ...e, on: !e.on } : e));

export function saveLayout(l: LayoutEntry[]) {
  // The default is stored as nothing, so a reader who resets is back on the
  // shipped layout — and gets later changes to it — rather than a frozen copy.
  writeJson(HOME_LAYOUT_KEY, isDefaultLayout(l) ? null : l);
}

export const readLayout = () => normaliseLayout(readJson<unknown>(HOME_LAYOUT_KEY, null));

export function useHomeLayout(): LayoutEntry[] {
  const raw = useStoredJson<unknown>(HOME_LAYOUT_KEY, null);
  return React.useMemo(() => normaliseLayout(raw), [raw]);
}
