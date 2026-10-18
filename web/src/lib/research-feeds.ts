/* ==========================================================================
   Maz Vantage — the on-demand feeds the Research tab reads

   A company report does not load the `onDemand` feeds (rating history,
   target summary, 13F aggregates, insider statistics, quarterly statements,
   quarterly segments), so a section that needs one asks for it here, the same
   three steps `loadDividendFeeds` and `loadAlphaBag` take: whatever the
   dataset already holds, then live, then the bundled snapshot. A configured
   key always wins; the snapshot only fills what it could not.
   ========================================================================== */

import { fetchFor, loadSnapshot, mapLimited } from './fmp';

export type Bag = Record<string, any>;

const cache = new Map<string, Promise<Bag>>();

export function loadFeeds(symbol: string, names: string[], ds: any = null): Promise<Bag> {
  const key = `${symbol}|${names.join(',')}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const bag: Bag = {};
      const toFetch: string[] = [];
      for (const name of names) {
        const have = ds?.feeds?.[name];
        if (have && have.status === 'ok') bag[name] = have.data;
        else toFetch.push(name);
      }
      if (toFetch.length) {
        const results = await mapLimited(toFetch, (name: string) => fetchFor(name, symbol).catch(() => null), 3);
        toFetch.forEach((name, i) => { if ((results as any)[i]?.status === 'ok') bag[name] = (results as any)[i].data; });
      }
      const unfilled = names.filter((n) => bag[n] == null);
      if (unfilled.length) {
        const snap: any = await loadSnapshot(symbol).catch(() => null);
        for (const name of unfilled) if (snap?.feeds?.[name] != null) bag[name] = snap.feeds[name];
      }
      return bag;
    })());
  }
  return cache.get(key)!;
}

/** The feeds a bag holds, read like a dataset: the bag first, then the dataset itself. */
export const fromBag = (bag: Bag | null, a: any) => (name: string) => (bag?.[name] ?? a?.ds?.get?.(name) ?? null);
