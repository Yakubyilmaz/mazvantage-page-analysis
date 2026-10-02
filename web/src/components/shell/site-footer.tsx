'use client';

/* ==========================================================================
   The page footer

   Seeking Alpha's footer is the reference: black in both themes, the brand
   across the top, every section of the product as columns of links under
   small uppercase headings, then the copyright, the data credit and the
   standing disclaimer.

   The columns are **read from `NAV`**, never hand-listed: a menu is a column,
   its visible items are the links, and a link goes exactly where the same
   item in the rail's flyout goes. About, Careers, Terms, Privacy, social
   accounts and app badges are absent on purpose — none of those exist, and a
   link to nothing is worse than no link.
   ========================================================================== */

import Link from 'next/link';
import { NAV, menuItems } from '@/lib/nav';
import { NavItemLink } from '@/components/shell/side-nav';
import { useNav } from '@/components/nav-context';
import { BrandMark, Slogan, Wordmark } from '@/components/shell/brand';
import { BRAND_NAME } from '@/lib/brand';

const link = 'text-left text-[14px] leading-4 text-white hover:underline hover:underline-offset-[3px]';

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 break-inside-avoid max-[700px]:mb-7">
      <h2 className="mb-4 text-tiny font-normal uppercase leading-[14px] tracking-[.04em] text-[#acacac]">{title}</h2>
      <ul className="grid gap-3">{children}</ul>
    </section>
  );
}

export function SiteFooter() {
  const nav = useNav();
  return (
    <footer aria-label="Site" className="mt-auto bg-black px-8 pb-8 pt-10 text-[14px] leading-snug text-white no-print max-[700px]:px-4 max-[700px]:pb-6 max-[700px]:pt-7">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="inline-flex items-center gap-3 hover:opacity-85">
          <BrandMark className="h-6 max-[700px]:h-5" />
          <Wordmark className="text-[26px] max-[700px]:text-[21px]" />
        </Link>
        <p className="text-lg leading-tight text-[#acacac] max-[700px]:text-base"><Slogan onBlack /></p>
      </div>

      <div className="my-8 h-px bg-[#2c3032] max-[700px]:my-6" role="presentation" />

      {/* Flowing columns rather than grid rows: the groups run from one link
          (Watchlist) to eighteen (ETF Screener), and in rows every short
          group sat over a hole the height of the longest one. */}
      <nav aria-label="All sections" className="[column-gap:40px] [columns:176px] max-[700px]:[column-gap:24px] max-[700px]:[columns:140px]">
        {NAV.map((menu) => (
          <Column key={menu.view} title={menu.label}>
            {menuItems(menu).map((item, i) => (
              <li key={i}><NavItemLink menu={menu} item={item} className={link}>{item.label}</NavItemLink></li>
            ))}
          </Column>
        ))}
        <Column title="More">
          <li><Link href="/" className={link}>Home</Link></li>
          <li><Link href="/calendar" className={link}>Calendar</Link></li>
          <li><Link href="/pricing" className={link}>Plans &amp; pricing</Link></li>
          <li><button type="button" className={link} onClick={nav.openSettings}>Settings</button></li>
        </Column>
      </nav>

      <div className="my-8 h-px bg-[#2c3032] max-[700px]:my-6" role="presentation" />

      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 text-tiny leading-4">
        <p>© {new Date().getFullYear()} {BRAND_NAME}</p>
        <p className="text-[#acacac]">Quotes may be delayed.</p>
      </div>
      <p className="mt-3 max-w-[92ch] text-tiny leading-[18px] text-[#8a8a8a]">
        {BRAND_NAME} is a research tool, not financial advice. Grades, ratings, fair values and signals are generated from market
        data by this product&rsquo;s own models, without considering your objectives, financial situation or needs. Verify
        anything you intend to act on against primary filings.
      </p>
    </footer>
  );
}
