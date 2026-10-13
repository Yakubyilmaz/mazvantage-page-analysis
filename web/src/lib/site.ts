/* ==========================================================================
   Maz Vantage — the public address

   Search engines need absolute URLs (canonical links, the sitemap, robots).
   Set `NEXT_PUBLIC_SITE_URL` to the production origin, e.g.
   `https://www.example.com`, with no trailing slash. Without it the local
   development address is used, which is right for `npm run dev` and wrong
   anywhere public: a sitemap pointing at localhost is ignored.
   ========================================================================== */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');

export const absolute = (path: string) => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
