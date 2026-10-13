import type { MetadataRoute } from 'next';
import { NAV } from '@/lib/nav';
import { stockHref, viewHref } from '@/lib/routes';
import { absolute } from '@/lib/site';
import { loadUniverse } from '@/lib/server/universe';

/* Every menu section a reader can reach (hidden aliases left out, so one
   page is never listed under two addresses), then each company's report and
   its "Is <company> halal?" tab — the page people search for by name. */

export const revalidate = 86_400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages = new Set<string>(['/', viewHref('pricing'), viewHref('calendar')]);
  for (const menu of NAV) {
    pages.add(viewHref(menu.view));
    for (const item of menu.items) {
      if (item.hidden || !item.sub || item.params || item.symbolTab || item.built === false) continue;
      pages.add(viewHref(item.view || menu.view, item.sub));
    }
  }
  const symbols = await loadUniverse();
  return [
    ...[...pages].map((p) => ({ url: absolute(p), lastModified: now, changeFrequency: 'daily' as const, priority: p === '/' ? 1 : 0.6 })),
    ...symbols.flatMap((s) => [
      { url: absolute(stockHref(s)), lastModified: now, changeFrequency: 'daily' as const, priority: 0.7 },
      { url: absolute(stockHref(s, 'Shariah Compliance')), lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 },
    ]),
  ];
}
