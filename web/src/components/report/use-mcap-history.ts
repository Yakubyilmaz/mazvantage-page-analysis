'use client';

/* The market-cap history the Shariah averages divide by, shared by the
   Shariah tab and the verdict card so both print the same label. One
   on-demand request, cached by the data client: whichever opens first pays
   for it. */

import * as React from 'react';
import { fetchFor, loadSnapshot } from '@/lib/fmp';
import type { Analysis } from '@/lib/model';

/**
 * The daily market-cap history the averages need, loaded when the tab opens
 * rather than with every report: live where the data is available, else the
 * bundled capture, else nothing — and the screen then says it fell back to
 * today's market cap.
 */
export function useMcapHistory(a: Analysis) {
  const [got, setGot] = React.useState<{ for: Analysis; rows: any[] | null } | null>(null);
  React.useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetchFor('marketCapHist', a.facts.symbol).catch(() => null);
      let rows: any[] | null = res?.status === 'ok' && Array.isArray(res.data) && res.data.length ? res.data : null;
      if (!rows) {
        const snap = await loadSnapshot(a.facts.symbol).catch(() => null);
        const cap = (snap as any)?.feeds?.marketCapHist;
        rows = Array.isArray(cap) ? cap : null;
      }
      if (live) setGot({ for: a, rows });
    })();
    return () => { live = false; };
  }, [a]);
  const mine = got?.for === a ? got : null;
  return { loading: !mine, rows: mine?.rows ?? null };
}

