import { NextRequest, NextResponse } from 'next/server';
import { legacyTarget } from '@/lib/routes';

/**
 * Legacy links.
 *
 * The old build lived on one page and routed by query string —
 * `/?symbol=AAPL&tab=valuation`, `/?view=markets&sub=gainers&country=DE`. Any
 * such link still lands: it is redirected to the route that page now has,
 * with whatever page state it carried kept in the query.
 */
export function middleware(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  if (!searchParams.has('view') && !searchParams.has('symbol')) return NextResponse.next();
  const target = legacyTarget(searchParams);
  if (!target) return NextResponse.next();
  return NextResponse.redirect(new URL(target, req.url), 308);
}

export const config = { matcher: '/' };
