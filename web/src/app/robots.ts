import type { MetadataRoute } from 'next';
import { absolute } from '@/lib/site';

/* Everything a reader can open is crawlable; the data and image proxies are
   not pages, and a crawler walking them would only spend the data plan. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: absolute('/sitemap.xml'),
  };
}
