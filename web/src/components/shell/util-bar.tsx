'use client';

import * as React from 'react';
import Link from 'next/link';
import { useNav } from '@/components/nav-context';
import { useTheme } from '@/components/providers';
import { FilledIcon } from '@/components/shell/icons';

const iconBtn = 'grid size-[34px] flex-none place-content-center rounded-full border border-border text-muted-foreground '
  + 'hover:bg-muted hover:text-foreground';

/**
 * Search and the utility buttons, pinned above the scrolling page.
 *
 * Searching a ticker means "show me that company", so it leaves whatever page
 * the reader was on rather than searching inside it.
 */
export function UtilBar() {
  const nav = useNav();
  const { toggle } = useTheme();
  const [value, setValue] = React.useState('');

  return (
    <div className="sticky top-0 z-[400] flex min-h-[var(--utilbar-h)] items-center gap-3 border-b border-border bg-background px-6 py-3 no-print">
      <form
        className="relative max-w-[576px] flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const s = value.trim().toUpperCase();
          if (s) { nav.goSymbol(s); setValue(''); }
        }}
      >
        <FilledIcon name="search" className="absolute left-2.5 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search ticker…"
          aria-label="Search ticker"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-md border border-border bg-muted py-2 pl-[34px] pr-3 text-13 text-foreground placeholder:text-muted-foreground/70"
        />
      </form>
      <div className="flex-1" />
      {/* The only way into Pricing from the chrome. Text rather than an icon
          because it is the one item in this bar that is a page, and quiet,
          because a research tool that shouts about its plans is selling. */}
      <Link
        href="/pricing"
        title="Plans and pricing"
        className="whitespace-nowrap rounded-full border border-border px-[13px] py-[7px] text-tiny font-semibold text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-foreground"
      >
        Plans
      </Link>
      <button type="button" className={iconBtn} title="Toggle theme" aria-label="Toggle theme" onClick={toggle}>
        <FilledIcon name="sun" />
      </button>
      <button type="button" className={iconBtn} title="Settings" aria-label="Settings" onClick={nav.openSettings}>
        <FilledIcon name="gear" />
      </button>
    </div>
  );
}
