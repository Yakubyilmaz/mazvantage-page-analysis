import { NextRequest, NextResponse } from 'next/server';
import { ALLOWED_PATHS, FMP_BASE, IMAGE_HOSTS, KEY_HEADER } from '@/lib/fmp/paths';

/* ==========================================================================
   The data proxy (`/api/data/<path>`).

   Every vendor request the browser makes comes through here, which is what
   lets the operator's key stay on the server. A key set through the hidden
   `?apikey=` link arrives in a header and wins over the operator's.

   Readers are never told where the data comes from, and that includes what
   a curious one would see in the browser's network panel:
   - **Errors are classified, then replaced.** The vendor's error bodies name
     it, its plans and its website. The status keeps the meaning the client
     maps (401 refused, 402 not covered, 429 busy, anything else an error);
     the body is neutral. A 200 carrying the vendor's "Error Message" is the
     same: a plan gate becomes a 402, anything else a 502.
   - **Image addresses are rewritten** to this app's own `/api/img/` route,
     so no logo or news picture points at the vendor's image host.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const neutral = (message: string, status: number) =>
  NextResponse.json({ 'Error Message': message }, { status, headers: { 'Cache-Control': 'no-store' } });

const PLAN_GATE = /plan|subscription|upgrade|exclusive|premium/i;

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  if (!ALLOWED_PATHS.has(path)) return neutral('Not found.', 404);

  const key = req.headers.get(KEY_HEADER)?.trim() || process.env.FMP_API_KEY?.trim();
  if (!key) return neutral('Live data is not configured.', 401);

  const qs = new URLSearchParams(req.nextUrl.searchParams);
  qs.delete('apikey');
  qs.set('apikey', key);

  let upstream: Response;
  try {
    upstream = await fetch(`${FMP_BASE}/${path}?${qs}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return neutral('The connection failed.', 502);
  }

  if (upstream.status === 401) return neutral('Live data access was refused.', 401);
  if (upstream.status === 402 || upstream.status === 403) return neutral('Not part of the current data coverage.', 402);
  if (upstream.status === 429) return neutral('The data service is busy.', 429);
  if (!upstream.ok) return neutral('The data service returned an error.', upstream.status >= 500 ? 502 : upstream.status);

  let body = await upstream.text();
  // A short object body is where the vendor puts a 200-status error; data is a list.
  if (body.length < 8192 && body.trimStart().startsWith('{')) {
    try {
      const json = JSON.parse(body);
      const err = json?.['Error Message'] || json?.error;
      if (err) return PLAN_GATE.test(String(err)) ? neutral('Not part of the current data coverage.', 402) : neutral('The data service returned an error.', 502);
    } catch { /* not JSON: passed on, and the client says it was unreadable */ }
  }
  for (const [host, alias] of IMAGE_HOSTS) body = body.split(host).join(`/api/img/${alias}/`);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      // The browser client caches per request for ten minutes; the proxy adds
      // nothing on top, so a reader's Refresh button means what it says.
      'Cache-Control': 'no-store',
    },
  });
}
