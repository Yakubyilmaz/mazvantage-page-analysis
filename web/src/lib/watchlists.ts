/* ==========================================================================
   Maz Vantage — the reader's watchlists, one store for every surface

   There used to be two lists. The market rail kept one list of symbols under
   `mazvantage.watchlist`, seeded with five megacaps; the Watchlist page kept
   named lists under `mazvantage.watchlists`. Clicking the rail's "Watchlist"
   title opened a page showing different companies. Now the page's store is
   the only store: the rail shows its **active** list, the star on a report or
   a table row adds to that list, and the page manages all of them.

   The migration runs once per browser and loses nothing:
   - neither key stored   -> one list, "Watchlist", holding the five the rail
                             always showed, so the rail looks as it did;
   - only the rail's key  -> that list becomes "Watchlist";
   - both keys            -> the page's lists are kept as they are, and the
                             rail's symbols become a list of their own unless
                             an existing list already holds exactly those;
   - the old key is read and **never written or removed** — a stored key is
     never wiped, which is also why every key keeps the `mazvantage.` prefix.

   Holdings are per list and per symbol. `shares` is the old single number
   the page's blocks always read; `lots` are dated purchases, and once a
   holding has lots the shares held are their sum — so cost basis, gain and
   a value history can be computed without a second source of truth.
   ========================================================================== */

import * as React from 'react';
import { newId, readJson, readRaw, useStoredJson, writeJson } from './local-store';

export const WATCHLISTS_KEY = 'mazvantage.watchlists';
/** The rail's list before the two were unified. Read by the migration only. */
export const RAIL_LIST_KEY = 'mazvantage.watchlist';
const UNIFIED_KEY = 'mazvantage.watchlists.unified';
export const WATCHLIST_SEED = ['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL'];

export interface Lot {
  id: string;
  /** The purchase date, `YYYY-MM-DD`, or null when the reader did not give one. */
  date: string | null;
  shares: number;
  /** Price paid per share, or null when not given — a lot without one has no cost basis. */
  price: number | null;
}
export interface Holding { shares?: number | null; impure?: number | null; lots?: Lot[] }
export interface WatchList { id: string; name: string; symbols: string[]; holdings: Record<string, Holding> }
export interface WatchStore { active: string | null; lists: WatchList[] }

/* ---------- symbols ------------------------------------------------------------ */

/** A symbol as the vendor spells it: upper case, no spaces, no $ prefix. */
export const cleanSymbol = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/^\$/, '').replace(/\s+/g, '');

/** Letters, digits and the punctuation real tickers use (BRK-B, MC.PA, ^GSPC, BTC-USD). */
export const isSymbol = (s: string) => /^[A-Z0-9^][A-Z0-9.\-^=/]{0,19}$/.test(s);

const uniqueSymbols = (xs: unknown[]) => [...new Set(xs.map(cleanSymbol).filter(isSymbol))];

/* ---------- parsing ------------------------------------------------------------- */

const isoDay = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function parseLot(raw: any): Lot | null {
  if (!raw || typeof raw !== 'object') return null;
  const shares = Number(raw.shares);
  if (!Number.isFinite(shares) || shares <= 0) return null;
  const price = raw.price == null || raw.price === '' ? null : Number(raw.price);
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('lot'),
    date: isoDay(raw.date),
    shares,
    price: price != null && Number.isFinite(price) && price >= 0 ? price : null,
  };
}

function parseHolding(raw: any): Holding {
  if (!raw || typeof raw !== 'object') return {};
  const out: Holding = {};
  if (raw.shares != null && raw.shares !== '') out.shares = Number.isFinite(Number(raw.shares)) ? Number(raw.shares) : null;
  if (raw.impure != null && raw.impure !== '') out.impure = Number.isFinite(Number(raw.impure)) ? Number(raw.impure) : null;
  if (Array.isArray(raw.lots)) {
    const lots = raw.lots.map(parseLot).filter(Boolean) as Lot[];
    if (lots.length) out.lots = lots;
  }
  return out;
}

/** Whatever is stored, as a store every surface can trust. */
export function parseStore(raw: unknown): WatchStore {
  const r: any = raw;
  if (!r || !Array.isArray(r.lists)) return { active: null, lists: [] };
  const lists: WatchList[] = r.lists
    .filter((l: any) => l && typeof l.name === 'string')
    .map((l: any) => ({
      id: typeof l.id === 'string' && l.id ? l.id : newId('wl'),
      name: l.name,
      symbols: uniqueSymbols(Array.isArray(l.symbols) ? l.symbols : []),
      // Keyed by symbol, so removing a ticker and adding it back does not
      // shuffle someone's share count onto another company.
      holdings: l.holdings && typeof l.holdings === 'object'
        ? Object.fromEntries(Object.entries(l.holdings).map(([k, v]) => [cleanSymbol(k), parseHolding(v)]))
        : {},
    }));
  return { lists, active: lists.some((l) => l.id === r.active) ? r.active : lists[0]?.id || null };
}

/* ---------- the one-off migration ------------------------------------------------ */

const sameSymbols = (a: string[], b: string[]) => a.length === b.length && a.every((s) => b.includes(s));

let migrated = false;

/** Fold the rail's old list into the store, once per browser. Safe to call often. */
export function ensureUnified() {
  if (migrated || typeof window === 'undefined') return;
  migrated = true;
  if (readRaw(UNIFIED_KEY) === '1') return;

  const pageRaw = readRaw(WATCHLISTS_KEY);
  const railList = readJson<unknown>(RAIL_LIST_KEY, null);
  const rail = Array.isArray(railList) ? uniqueSymbols(railList) : null;

  let store: WatchStore;
  if (pageRaw == null) {
    const id = newId('wl');
    store = { active: id, lists: [{ id, name: 'Watchlist', symbols: rail ?? WATCHLIST_SEED, holdings: {} }] };
  } else {
    store = parseStore(readJson<unknown>(WATCHLISTS_KEY, null));
    if (rail?.length && !store.lists.some((l) => sameSymbols(l.symbols, rail))) {
      store.lists.push({ id: newId('wl'), name: store.lists.length ? 'Rail watchlist' : 'Watchlist', symbols: rail, holdings: {} });
      if (!store.active) store.active = store.lists[0].id;
    }
  }
  if (writeJson(WATCHLISTS_KEY, store)) {
    try { window.localStorage.setItem(UNIFIED_KEY, '1'); } catch { /* retried next load */ }
  }
}

/* ---------- reading and writing ---------------------------------------------------- */

export function readStore(): WatchStore {
  ensureUnified();
  return parseStore(readJson<unknown>(WATCHLISTS_KEY, null));
}

export function writeStore(store: WatchStore) {
  writeJson(WATCHLISTS_KEY, store);
}

/** Read, change, write — every action goes through here so none works on a stale copy. */
export function updateStore(change: (s: WatchStore) => WatchStore) {
  writeStore(change(readStore()));
}

export const activeList = (s: WatchStore): WatchList | null => s.lists.find((l) => l.id === s.active) || s.lists[0] || null;
export const listById = (s: WatchStore, id: string | null | undefined): WatchList | null => s.lists.find((l) => l.id === id) || null;

/* ---------- actions ------------------------------------------------------------------ */

export function setActiveList(id: string) {
  updateStore((s) => (s.lists.some((l) => l.id === id) ? { ...s, active: id } : s));
}

/** A new list, made active. Returns its id. */
export function createList(name: string, symbols: string[] = []): string {
  const id = newId('wl');
  updateStore((s) => ({
    active: id,
    lists: [...s.lists, { id, name: name.trim() || `Watchlist ${s.lists.length + 1}`, symbols: uniqueSymbols(symbols), holdings: {} }],
  }));
  return id;
}

export function renameList(id: string, name: string) {
  const v = name.trim();
  if (!v) return;
  updateStore((s) => ({ ...s, lists: s.lists.map((l) => (l.id === id ? { ...l, name: v } : l)) }));
}

/** Deleting the last list leaves none rather than resurrecting a default. */
export function deleteList(id: string) {
  updateStore((s) => {
    const lists = s.lists.filter((l) => l.id !== id);
    return { lists, active: s.active === id ? lists[0]?.id ?? null : s.active };
  });
}

/**
 * Add symbols to a list — the active one unless another is named. With no list
 * at all, the first add makes one: a star that did nothing because no list
 * existed would be a star that lies.
 */
export function addSymbols(symbols: unknown[], listId?: string | null) {
  const clean = uniqueSymbols(symbols);
  if (!clean.length) return;
  updateStore((s) => {
    if (!s.lists.length) {
      const id = newId('wl');
      return { active: id, lists: [{ id, name: 'Watchlist', symbols: clean, holdings: {} }] };
    }
    const target = listById(s, listId)?.id ?? activeList(s)!.id;
    return { ...s, lists: s.lists.map((l) => (l.id === target ? { ...l, symbols: [...new Set([...l.symbols, ...clean])] } : l)) };
  });
}

export function removeSymbol(symbol: string, listId?: string | null) {
  const sym = cleanSymbol(symbol);
  updateStore((s) => {
    const target = listById(s, listId)?.id ?? activeList(s)?.id;
    return { ...s, lists: s.lists.map((l) => (l.id === target ? { ...l, symbols: l.symbols.filter((x) => x !== sym) } : l)) };
  });
}

export function toggleSymbol(symbol: string, listId?: string | null) {
  const s = readStore();
  const list = listById(s, listId) ?? activeList(s);
  const sym = cleanSymbol(symbol);
  if (list?.symbols.includes(sym)) removeSymbol(sym, list.id);
  else addSymbols([sym], list?.id);
}

export function setHolding(listId: string, symbol: string, patch: Holding) {
  const sym = cleanSymbol(symbol);
  updateStore((s) => ({
    ...s,
    lists: s.lists.map((l) => (l.id === listId ? { ...l, holdings: { ...l.holdings, [sym]: { ...l.holdings[sym], ...patch } } } : l)),
  }));
}

export function addLot(listId: string, symbol: string, lot: Omit<Lot, 'id'>) {
  const parsed = parseLot({ ...lot, id: newId('lot') });
  if (!parsed) return;
  const sym = cleanSymbol(symbol);
  updateStore((s) => ({
    ...s,
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      const held = l.holdings[sym] || {};
      return {
        ...l,
        symbols: l.symbols.includes(sym) ? l.symbols : [...l.symbols, sym],
        holdings: { ...l.holdings, [sym]: { ...held, lots: [...(held.lots || []), parsed] } },
      };
    }),
  }));
}

export function removeLot(listId: string, symbol: string, lotId: string) {
  const sym = cleanSymbol(symbol);
  updateStore((s) => ({
    ...s,
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      const held = l.holdings[sym] || {};
      const lots = (held.lots || []).filter((x) => x.id !== lotId);
      const next: Holding = { ...held };
      if (lots.length) next.lots = lots; else delete next.lots;
      return { ...l, holdings: { ...l.holdings, [sym]: next } };
    }),
  }));
}

/** Replace a holding's lots wholesale — what an import does for the symbols it carries. */
export function setLots(listId: string, symbol: string, lots: Omit<Lot, 'id'>[]) {
  const sym = cleanSymbol(symbol);
  const parsed = lots.map((x) => parseLot({ ...x, id: newId('lot') })).filter(Boolean) as Lot[];
  updateStore((s) => ({
    ...s,
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      const held = { ...(l.holdings[sym] || {}) };
      if (parsed.length) held.lots = parsed; else delete held.lots;
      return { ...l, symbols: l.symbols.includes(sym) ? l.symbols : [...l.symbols, sym], holdings: { ...l.holdings, [sym]: held } };
    }),
  }));
}

/* ---------- position size ------------------------------------------------------------ */

/**
 * The shares held: the lots' sum once there are lots, otherwise the single
 * figure the page always stored. Null when the reader has not sized it — a
 * size is never invented.
 */
export function sharesHeld(h: Holding | null | undefined): number | null {
  if (h?.lots?.length) {
    const total = h.lots.reduce((a, l) => a + l.shares, 0);
    return total > 0 ? total : null;
  }
  const v = Number(h?.shares);
  return h?.shares != null && Number.isFinite(v) && v > 0 ? v : null;
}

/* ---------- the hook ------------------------------------------------------------------ */

/**
 * The store, following every write from any surface. `ready` turns true once
 * the component has mounted and the migration has run — before that the
 * server's empty render is all there is, and a page should say "loading"
 * rather than "you have no lists".
 */
export function useWatchlists(): WatchStore & { ready: boolean } {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => { ensureUnified(); setReady(true); }, []);
  const raw = useStoredJson<unknown>(WATCHLISTS_KEY, null);
  const store = React.useMemo(() => parseStore(raw), [raw]);
  return { ...store, ready };
}
