/* ==========================================================================
   Maz Vantage — what this browser remembers

   Watchlists, notes, saved screens, saved comparisons, chart layouts and the
   home page's arrangement all live in `localStorage`, because there are no
   accounts. This file is the one way in and out, and it holds three rules:

   1. **Every read and write is wrapped.** A private window or blocked site
      data throws on access; the reader then gets an empty page that works,
      never a broken one.
   2. **Keys keep the `mazvantage.` prefix.** Renaming a stored key wipes what
      readers saved, so the prefix outlived the product's old name on purpose.
   3. **A write is announced.** The star on a report, the rail beside it and
      the Watchlist page can all be on screen at once; each subscribes to the
      key it shows and redraws when any of the others writes it — in this tab
      through a custom event, in other tabs through the browser's own
      `storage` event.
   ========================================================================== */

import * as React from 'react';

const EVENT = 'mazvantage:store';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The raw string under a key, or null — never throws. */
export function readRaw(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** A parsed value, or the fallback when the key is empty, unreadable or malformed. */
export function readJson<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

/** Tell every subscriber in this tab that `key` changed. */
export function announce(key: string) {
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  } catch { /* no window: nothing is listening */ }
}

/** Store a value and announce it. Returns whether the browser kept it. */
export function writeJson(key: string, value: unknown): boolean {
  let kept = false;
  try {
    const s = storage();
    if (s) {
      s.setItem(key, JSON.stringify(value));
      kept = true;
    }
  } catch { /* quota, or storage blocked: the page still works this session */ }
  announce(key);
  return kept;
}

/** Remove a key and announce it. Only for keys this app wrote as caches — never a reader's data. */
export function removeKey(key: string) {
  try { storage()?.removeItem(key); } catch { /* nothing to remove */ }
  announce(key);
}

/** Call `onChange` whenever `key` is written, here or in another tab. */
export function subscribe(key: string, onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const local = (e: Event) => { if ((e as CustomEvent).detail === key) onChange(); };
  const other = (e: StorageEvent) => { if (e.key === key || e.key === null) onChange(); };
  window.addEventListener(EVENT, local);
  window.addEventListener('storage', other);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener('storage', other);
  };
}

/**
 * A stored JSON value as React state that follows every write.
 *
 * The snapshot is the raw string, not the parsed object: `useSyncExternalStore`
 * compares snapshots by identity, and a fresh `JSON.parse` on every read would
 * never compare equal and would render forever. The server has no storage, so
 * it renders the fallback and the client catches up after hydration.
 */
export function useStoredJson<T>(key: string, fallback: T): T {
  const raw = React.useSyncExternalStore(
    React.useCallback((cb) => subscribe(key, cb), [key]),
    () => readRaw(key),
    () => null,
  );
  // `fallback` is usually a literal; keying on it would re-parse every render.
  return React.useMemo(() => {
    if (raw == null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : (parsed as T);
    } catch {
      return fallback;
    }
  }, [raw]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Whether the component has mounted — stored state is only true after that. */
export function useMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}

/** A short, collision-safe id for something a reader created. */
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
