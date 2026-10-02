import { NextRequest, NextResponse } from 'next/server';
import { IMAGE_ORIGIN } from '@/lib/fmp/paths';

/* ==========================================================================
   The image route (`/api/img/<alias>/<path>`).

   Company logos and news pictures, fetched from the vendor's image host on
   the server so that no address in the page names it (see `IMAGE_HOSTS`).
   Images only, by content type; nothing else is relayed. Logos change rarely,
   so a day of caching saves the round trip on every table row.
   ========================================================================== */

const SAFE_PATH = /^[A-Za-z0-9._\-/%]+$/;

export async function GET(_req: NextRequest, { params }: { params: { alias: string; path: string[] } }) {
  const origin = IMAGE_ORIGIN[params.alias];
  const path = params.path.map(encodeURIComponent).join('/');
  if (!origin || !SAFE_PATH.test(path) || path.includes('..')) return new NextResponse(null, { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(`${origin}${path}`, { next: { revalidate: 86400 } });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  const type = upstream.headers.get('Content-Type') || '';
  if (!upstream.ok || !type.startsWith('image/')) return new NextResponse(null, { status: 404 });

  return new NextResponse(upstream.body, {
    status: 200,
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
  });
}
