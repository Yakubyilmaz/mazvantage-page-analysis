'use client';

/* ==========================================================================
   How anything on any page sends the reader somewhere else.

   The legacy views received a `nav` object — `goView`, `goSymbol`,
   `goSymbolTab`, `goIdea`, `goIndustry`, `goQuery`, `openSettings` — and the
   port keeps exactly those names, so a ported view reads like its original.
   The implementation is the Next router plus `routes.ts`.

   The company report provides a nested `NavProvider` that overrides three of
   them (`goSymbolTab` for its own symbol is a panel switch, not a navigation;
   `openAnalysis` and `openFactor` jump inside the report). Everything below it
   gets the override for free.
   ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { viewHref, stockHref, DEFAULT_SYMBOL, type QueryParams } from '@/lib/routes';
import { queryToParams } from '@/lib/taxonomy';

export interface Nav {
  goView: (view: string, sub?: string | null, params?: QueryParams | null) => void;
  /** The Research feed's filters: a query object, written into the URL. */
  goQuery: (view: string, sub: string | null, query: Record<string, any>) => void;
  goSymbol: (symbol: string) => void;
  goSymbolTab: (tab: string | null, symbol?: string | null) => void;
  goIdea: (key: string, extra?: QueryParams | null) => void;
  openIdea: (key: string) => void;
  openIdeas: () => void;
  goIndustry: (name: string) => void;
  openSettings: () => void;
  /** Report-only: switch to the Analysis tab and jump to an anchor. */
  openAnalysis?: (anchor?: string | null) => void;
  /** Report-only: open a factor's own tab. */
  openFactor?: (key: string) => void;
  /** The href a destination resolves to, for real links. */
  hrefFor: { view: typeof viewHref; symbol: typeof stockHref };
}

const NavContext = React.createContext<Nav | null>(null);

/* The company a reader last opened. The legacy build kept `?symbol=` in the
   URL across every page, so "Stock Analysis" in the Research menu opened the
   report you had just been reading; with real routes the symbol leaves the
   URL, so it is remembered here instead. */
const LAST_SYMBOL_KEY = 'mazvantage.lastSymbol';
export function rememberSymbol(symbol: string) {
  try { sessionStorage.setItem(LAST_SYMBOL_KEY, symbol.toUpperCase()); } catch { /* not remembered */ }
}
export function lastSymbol(): string {
  try { return sessionStorage.getItem(LAST_SYMBOL_KEY) || DEFAULT_SYMBOL; } catch { return DEFAULT_SYMBOL; }
}

export function RootNavProvider({ children, openSettings }: { children: React.ReactNode; openSettings: () => void }) {
  const router = useRouter();

  const nav = React.useMemo<Nav>(() => {
    const goView: Nav['goView'] = (view, sub = null, params = null) => {
      // A push, not a replace: a page somebody arrived at deliberately is one
      // the browser's back button should leave.
      router.push(viewHref(view, sub, params));
    };
    return {
      goView,
      goQuery: (view, sub, query) => goView(view, sub, queryToParams(query || {}) as QueryParams),
      goSymbol: (symbol) => router.push(stockHref(symbol)),
      goSymbolTab: (tab, symbol = null) => router.push(stockHref(symbol || lastSymbol(), tab)),
      // A portfolio is page state, not a section, so it travels in the query.
      goIdea: (key, extra = null) => goView('ideas', null, { idea: key, ...(extra || {}) }),
      openIdea: (key) => goView('ideas', null, { idea: key }),
      openIdeas: () => goView('ideas', 'all'),
      // An industry is page state for the same reason: the vendor publishes
      // about a hundred and thirty and renames them, so there is no fixed list.
      goIndustry: (name) => goView('sectors', 'industry', { industry: name }),
      openSettings,
      hrefFor: { view: viewHref, symbol: stockHref },
    };
  }, [router, openSettings]);

  return <NavContext.Provider value={nav}>{children}</NavContext.Provider>;
}

/** A scoped override — the report uses this to keep its own tabs in-page. */
export function NavOverride({ override, children }: { override: Partial<Nav>; children: React.ReactNode }) {
  const parent = useNav();
  const value = React.useMemo(() => ({ ...parent, ...override }), [parent, override]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const nav = React.useContext(NavContext);
  if (!nav) throw new Error('useNav() needs a RootNavProvider above it');
  return nav;
}
