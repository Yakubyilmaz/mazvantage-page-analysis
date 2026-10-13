/* ==========================================================================
   Maz Vantage — the seam to the application back end

   Everything that needs memory across days — accounts, alerts, stored
   history — lives in a back end this repository does not contain
   (BACKEND_CONTRACT.md at the repository root says what it must serve).
   Set `NEXT_PUBLIC_BACKEND_URL` to its base address; until then every call
   here returns null without making a request, and the surfaces that read
   them stay hidden rather than showing an empty box.
   ========================================================================== */

import type { Period } from './track-record';

export const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || '').replace(/\/+$/, '') || null;

async function getJson<T>(path: string): Promise<T | null> {
  if (!BACKEND_URL) return null;
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** An Investment Ideas portfolio's recorded periods (contract §3), or null. */
export async function fetchTrackRecord(ideaKey: string): Promise<Period[] | null> {
  const body = await getJson<{ periods?: Period[] }>(`/ideas/${encodeURIComponent(ideaKey)}/track-record`);
  return Array.isArray(body?.periods) && body!.periods.length ? body!.periods : null;
}
