'use client';

/* ==========================================================================
   The product rail: the brand, Home, the menus with their flyouts, and the
   shortcut group.

   ---------------------------------------------------------------------------
   Why the panels are `position: fixed`
   ---------------------------------------------------------------------------

   The rail is `overflow-y: auto`, and CSS computes the *other* axis to `auto`
   the moment one axis is not `visible` — so an absolutely positioned flyout
   inside the rail would be clipped at the rail's right edge. The panels are
   taken out of the flow and placed against the trigger's measured rect,
   clamped to the viewport, which also buys the bottom-edge flip.

   ---------------------------------------------------------------------------
   Hover, and what it owes the people it does not work for
   ---------------------------------------------------------------------------

   An **open delay**, so sweeping down the rail does not fire seven menus in
   turn, and a **close delay**, so a fast diagonal into the panel does not lose
   it halfway. The panel is a DOM child of its group, so moving into it never
   fires `mouseleave` at all.

   Hover does not exist on a touch screen, so **clicking the item navigates**
   to that page; the destination carries the same sections in a strip.
   Keyboard focus opens the flyout without the delay, and Escape closes it.
   ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { NAV, menuItems, matchesDestination, type NavItem, type NavMenu } from '@/lib/nav';
import { viewHref } from '@/lib/routes';
import { lastSymbol, useNav } from '@/components/nav-context';
import { StrokeIcon } from '@/components/shell/icons';
import { BrandMark, Wordmark } from '@/components/shell/brand';
import { cn } from '@/lib/cn';

const OPEN_DELAY = 110;
const CLOSE_DELAY = 240;

/** The route a menu item opens. A report tab has none until clicked: it opens
 *  on the company last read, which only the browser knows. */
export function hrefForItem(menu: NavMenu, item: NavItem): string | null {
  if (item.symbolTab) return null;
  if (item.view) return viewHref(item.view, item.sub || null, item.params || null);
  return viewHref(menu.view, item.sub || null, item.params || null);
}

/** One destination as a link — or, for a report tab, a button that opens it. */
export function NavItemLink({
  menu, item, className, onClick, children, ...rest
}: { menu: NavMenu; item: NavItem; className?: string; onClick?: () => void; children: React.ReactNode }
  & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>) {
  const nav = useNav();
  const href = hrefForItem(menu, item);
  if (!href) {
    return (
      <button type="button" className={className}
        onClick={() => { onClick?.(); nav.goSymbolTab(item.symbolTab!, lastSymbol()); }}>
        {children}
      </button>
    );
  }
  return <Link href={href} onClick={onClick} className={className} {...rest}>{children}</Link>;
}

/** The `(view, sub)` the address bar is on, or null on a company report. */
export function useCurrentPage(): { view: string; sub: string | null } | null {
  const pathname = usePathname() || '/';
  const [, view, sub] = pathname.split('/');
  if (!view) return { view: 'home', sub: null };
  if (view === 'stock') return null;
  return { view, sub: sub ? decodeURIComponent(sub) : null };
}

const itemBase = 'flex w-full items-center gap-2.5 whitespace-nowrap rounded-[10px] px-2.5 py-[9px] text-left text-sm '
  + 'text-rail-fg transition-colors hover:bg-rail-hover hover:text-white';

function RailMenu({
  menu, current, open, onOpen, onClose, onScheduleOpen, onScheduleClose,
}: {
  menu: NavMenu;
  current: { view: string; sub: string | null } | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onScheduleOpen: () => void;
  onScheduleClose: () => void;
}) {
  const nav = useNav();
  const query = useSearchParams();
  const button = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const isCurrent = current?.view === menu.view;
  const items = menu.items.filter((i) => !i.hidden);

  /* Measured after it is visible, because a hidden element has no height and
     the bottom-edge clamp needs one. Anchored to the rail's edge, not the
     button's: the rail insets its items, so a panel placed against the button
     would sit that inset over the black. */
  React.useLayoutEffect(() => {
    if (!open || !button.current) { setPos(null); return; }
    const r = button.current.getBoundingClientRect();
    const host = button.current.closest('[data-sidenav]');
    const x = host ? Math.max(r.right, host.getBoundingClientRect().right) : r.right;
    const h = panel.current?.offsetHeight ?? 0;
    const maxTop = window.innerHeight - h - 8;
    setPos({ left: Math.round(x), top: Math.round(r.top > maxTop ? Math.max(8, maxTop) : r.top) });
  }, [open]);

  return (
    <div
      className="relative flex-none max-[900px]:flex-none"
      onMouseEnter={onScheduleOpen}
      onMouseLeave={onScheduleClose}
      onFocus={onOpen}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onScheduleClose(); }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-current={isCurrent ? 'page' : undefined}
        onClick={() => { onClose(); nav.goView(menu.view, null); }}
        className={cn(itemBase, 'group justify-start max-[900px]:px-3 max-[900px]:py-2',
          (isCurrent || open) && 'bg-rail-active text-white', isCurrent && 'font-semibold')}
      >
        <StrokeIcon kind={menu.icon} className="max-[900px]:hidden" />
        <span className="min-w-0 flex-1 truncate">{menu.label}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"
          className={cn('size-[15px] flex-none fill-none stroke-current stroke-2 opacity-45 transition-[transform,opacity] duration-150 group-hover:translate-x-0.5 group-hover:opacity-90 max-[900px]:hidden',
            open && 'translate-x-0.5 opacity-90')}>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        ref={panel}
        role="group"
        aria-label={menu.label}
        hidden={!open}
        style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
        className={cn(
          'fixed z-[800] ml-2 min-w-[240px] max-w-[min(520px,60vw)] rounded-[10px] border border-border bg-popover p-4 text-popover-foreground',
          'shadow-[0_16px_40px_rgba(0,0,0,.35)] max-[900px]:!hidden',
          // The bridge: the gap between rail and panel is part of the panel's
          // hit area, so crossing it does not drop the hover.
          "before:absolute before:inset-y-0 before:right-full before:w-4 before:content-['']",
        )}
      >
        <p className="text-sm font-semibold">{menu.label}</p>
        {menu.blurb ? (
          <p className="mb-3 mt-0.5 max-w-[46ch] border-b border-border pb-3 text-micro text-muted-foreground">{menu.blurb}</p>
        ) : null}
        <ul className={cn(items.length > 6 && 'grid grid-cols-2 gap-x-3')}>
          {items.map((item, i) => {
            const active = isCurrent && !!item.sub && matchesDestination(item, current?.sub, query);
            if (item.built === false) {
              return (
                <li key={i}>
                  <span aria-disabled="true" title="Not built yet"
                    className="flex w-full px-2 py-[7px] text-13 text-muted-foreground/60">{item.label}</span>
                </li>
              );
            }
            return (
              <li key={i}>
                <NavItemLink
                  menu={menu}
                  item={item}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex w-full items-baseline justify-between gap-2 whitespace-nowrap rounded-md px-2 py-[7px] text-13 text-muted-foreground hover:bg-accent hover:text-foreground',
                    active && 'font-semibold text-primary')}
                >
                  <span>{item.label}</span>
                  {item.symbolTab ? <i className="flex-none text-micro not-italic text-muted-foreground/70">on the report</i> : null}
                </NavItemLink>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function SideNav() {
  const current = useCurrentPage();
  const [open, setOpen] = React.useState<string | null>(null);
  const timers = React.useRef<{ open?: ReturnType<typeof setTimeout>; close?: ReturnType<typeof setTimeout> }>({});

  const clear = () => { clearTimeout(timers.current.open); clearTimeout(timers.current.close); };
  const close = React.useCallback(() => { clear(); setOpen(null); }, []);

  // A fixed panel is placed against a rect measured once, so anything that
  // moves the trigger invalidates it. Closing is the honest response.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', close); };
  }, [close]);

  const onHome = current?.view === 'home';
  const onCalendar = current?.view === 'calendar';

  return (
    <aside
      data-sidenav
      onScroll={close}
      className={cn(
        'z-[800] flex flex-col gap-5 bg-rail px-2 py-6 text-white scroll-thin',
        'sticky top-0 h-screen overflow-y-auto [scrollbar-color:rgba(255,255,255,.18)_transparent]',
        'max-[900px]:static max-[900px]:h-auto max-[900px]:flex-row max-[900px]:items-center max-[900px]:gap-2 max-[900px]:overflow-x-auto max-[900px]:overflow-y-hidden max-[900px]:px-4 max-[900px]:py-2',
      )}
    >
      <Link href="/" title="Home" className="flex items-center gap-2.5 px-2.5 py-2 text-white max-[900px]:hidden">
        <BrandMark className="h-[18px]" />
        <Wordmark className="text-[19px]" />
      </Link>

      <nav aria-label="Main" className="grid gap-0.5 max-[900px]:flex max-[900px]:flex-row">
        <Link href="/" aria-current={onHome ? 'page' : undefined}
          className={cn(itemBase, onHome && 'bg-rail-active font-semibold text-white', 'max-[900px]:px-3 max-[900px]:py-2')}>
          <StrokeIcon kind="dashboard" className="max-[900px]:hidden" />
          <span>Home</span>
        </Link>
        {NAV.map((menu) => (
          <RailMenu
            key={menu.view}
            menu={menu}
            current={current}
            open={open === menu.view}
            onOpen={() => { clear(); setOpen(menu.view); }}
            onClose={close}
            onScheduleOpen={() => { clear(); timers.current.open = setTimeout(() => setOpen(menu.view), OPEN_DELAY); }}
            onScheduleClose={() => { clear(); timers.current.close = setTimeout(() => setOpen(null), CLOSE_DELAY); }}
          />
        ))}
      </nav>

      <div className="-my-4 mx-4 h-px bg-white/10 max-[900px]:hidden" />

      {/* The shortcut group: Calendar alone — reached often enough to be worth
          one click from anywhere, and not an obvious place to look for. */}
      <nav aria-label="Shortcuts" className="grid gap-0.5 max-[900px]:hidden">
        <Link href="/calendar" aria-current={onCalendar ? 'page' : undefined}
          className={cn(itemBase, 'text-13 text-[#8b8b93]', onCalendar && 'bg-rail-active font-semibold text-white')}>
          <StrokeIcon kind="calendar" />
          <span>Calendar</span>
        </Link>
      </nav>
    </aside>
  );
}

export { menuItems };
