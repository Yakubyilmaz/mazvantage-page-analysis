'use client';

/* ==========================================================================
   The page head every nav page shares: title, blurb, and the section strip.

   The strip repeats the menu's items along the top of the page, which is what
   makes a section switchable without going back to the rail — and, below
   900px where the flyouts are off, the only way a touch reader reaches them.
   One tab stop for the whole strip, arrow keys inside it.
   ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { NAV_BY_VIEW, matchesDestination, type NavItem } from '@/lib/nav';
import { viewHref } from '@/lib/routes';
import { cn } from '@/lib/cn';

const hrefOf = (view: string, item: NavItem) => viewHref(view, item.sub || null, item.params || null);

export function SectionStrip({ view, sub, className }: { view: string; sub: string | null; className?: string }) {
  const menu = NAV_BY_VIEW[view];
  const query = useSearchParams();
  const router = useRouter();
  if (!menu) return null;
  // Hidden sections are routable but not listed.
  const sections = menu.items.filter((i) => i.sub && !i.hidden);
  if (sections.length < 2) return null;
  const at = sections.findIndex((s) => matchesDestination(s, sub, query));

  return (
    <div
      role="tablist"
      aria-label={menu.label}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = sections[(Math.max(at, 0) + step + sections.length) % sections.length];
        router.push(hrefOf(view, next));
      }}
      className={cn('flex flex-wrap gap-x-[22px] border-b border-border', className)}
    >
      {sections.map((item, i) => {
        const on = i === at;
        return (
          <Link
            key={i}
            href={hrefOf(view, item)}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={cn('-mb-px border-b-[3px] border-transparent py-3 text-13 font-semibold text-muted-foreground hover:text-foreground',
              on && 'border-foreground text-foreground')}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function PageHead({ view, sub, title, blurb }: { view: string; sub: string | null; title?: string; blurb?: string | null }) {
  const menu = NAV_BY_VIEW[view];
  if (!menu && !title) return null;
  return (
    <div className="pb-4 pt-6">
      <h1 className="text-[28px] font-semibold leading-[1.15]">{title ?? menu?.label}</h1>
      {(blurb ?? menu?.blurb) ? <p className="mt-2 max-w-[70ch] text-sm text-muted-foreground">{blurb ?? menu?.blurb}</p> : null}
      <SectionStrip view={view} sub={sub} className="mt-4" />
    </div>
  );
}
