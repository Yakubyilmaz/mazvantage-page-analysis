/* ==========================================================================
   Maz Vantage — the main navigation

   Ten top-level pages down the left rail, each opening a flyout menu of
   sections on hover. This file owns two things and nothing else: **what the
   destinations are**, and **the rail that opens them**. No page content
   lives here.

   ---------------------------------------------------------------------------
   The routing model
   ---------------------------------------------------------------------------

   Every destination is a `(view, sub)` pair and reaches the address bar as
   `?view=markets&sub=gainers`. `app.js` dispatches on `view`; the page module
   for that view dispatches on `sub`. A view with no `sub` opens its first
   section, so `?view=markets` and `?view=markets&sub=overview` are the same
   page.

   Three of the destinations are not new pages at all — Stock Analysis,
   Valuation and Dividends already exist as tabs on the company report. Those
   carry `symbolTab` instead of `sub`, and the rail sends the reader to the
   report with that tab open rather than building a second copy of a page that
   already works.

   ---------------------------------------------------------------------------
   Why `built` is on the data and not inferred
   ---------------------------------------------------------------------------

   A destination that is listed and does nothing is worse than one that says
   it is not ready, so an item carries `built: false` until its section
   renders something real. The rail greys those and marks them
   `aria-disabled`, which is the same rule the tab strip already follows.
   ========================================================================== */

import { el } from './util.js';

/* ==========================================================================
   The eleven sectors
   ========================================================================== */

/**
 * The sector list, in the vendor's own spelling.
 *
 * Hard-coded rather than read from `available-sectors`, because the whole
 * grading engine keys `sector-stats.json` on exactly these strings — a
 * nav that offered a twelfth spelling would open a page with no distribution
 * behind it. If FMP renames one, this list and the stats builder move
 * together or neither moves.
 */
export const SECTORS = [
  'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
  'Communication Services', 'Industrials', 'Consumer Defensive', 'Energy',
  'Basic Materials', 'Real Estate', 'Utilities',
];

/** A sector name to the slug it travels as. */
export const sectorSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const sectorFromSlug = (slug) =>
  SECTORS.find((s) => sectorSlug(s) === slug) || null;

/**
 * Sector -> the SPDR sector ETF that tracks it.
 *
 * The nearest thing to an index for each sector, and the only way to quote a
 * sector's return over a month or a year without averaging several hundred
 * companies by hand. It lives here rather than in `app.js` because two
 * unrelated surfaces read it now: the report's momentum benchmark, and the
 * sector breakdown.
 */
export const SECTOR_ETF = {
  Technology: 'XLK',
  'Communication Services': 'XLC',
  'Consumer Cyclical': 'XLY',
  'Consumer Defensive': 'XLP',
  Healthcare: 'XLV',
  'Financial Services': 'XLF',
  Industrials: 'XLI',
  Energy: 'XLE',
  'Basic Materials': 'XLB',
  Utilities: 'XLU',
  'Real Estate': 'XLRE',
};

/** The whole market, for anything a sector is measured against. */
export const MARKET_ETF = 'SPY';

/* ==========================================================================
   The portfolio groups
   ========================================================================== */

/**
 * The sections the Investment Ideas portfolios are filed under, in order.
 *
 * Here rather than in `ideas.js` for exactly the reason `SECTORS` is here: it
 * is a **destination vocabulary**. The rail builds a menu item per group and
 * the router accepts a slug per group, so a group renamed in one place and not
 * the other would be a menu item opening an empty page. `ideas.js` imports
 * this and files its portfolios against it.
 *
 * Editorial order: **Featured screens** first — the presets a reader arriving
 * from another research product will look for by name — then the screens built
 * on this report's own grades, because they are the ones nothing else here can
 * do, and the sector screens last because they only matter once you know which
 * sector you care about. A portfolio whose group is missing from this list
 * still renders, under "More".
 */
export const IDEA_GROUPS = [
  'Featured screens', 'Our ratings', 'Ranked portfolios', 'Value', 'Growth', 'Income',
  'Quality and safety', 'Insider signals', 'Momentum', 'Sectors', 'Size',
];

/** A group name to the slug it travels as. Same shape as `sectorSlug`. */
export const ideaGroupSlug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const ideaGroupFromSlug = (slug) =>
  IDEA_GROUPS.find((g) => ideaGroupSlug(g) === slug) || null;

/* ==========================================================================
   The destinations
   ========================================================================== */

/**
 * Ten pages, each with its sections.
 *
 * `view` is the page. Each entry in `items` is either:
 *   { label, sub }               — a section of that page
 *   { label, symbolTab }         — a tab on the company report
 *   { label, view }              — another page entirely
 * and `built: false` marks anything that does not render yet.
 *
 * `hidden: true` is a routable section that is not a menu item: the router
 * accepts it, the flyout and the section strip skip it. That is what a
 * destination reached *from* a page rather than from the bar needs — a single
 * article, reached by clicking a card, is one of these.
 */
export const NAV = [
  {
    view: 'markets',
    icon: 'bars',
    label: 'Markets Data',
    blurb: 'What the market did today — indices, equities, funds, rates, movers and sectors.',
    items: [
      { label: 'Market Overview', sub: 'overview' },
      { label: 'Country', sub: 'country' },
      // The four asset-class pages, in the order a markets hub reads: what the
      // indices did, then equities, then funds, then the rates underneath all
      // three.
      { label: 'Indices', sub: 'indices' },
      { label: 'Stocks', sub: 'stocks' },
      { label: 'Futures', sub: 'futures' },
      { label: 'Corporate Bonds', sub: 'corporate' },
      { label: 'ETFs', sub: 'etfs' },
      { label: 'Economy', sub: 'economy' },
      // The three mover lists are reached from the overview's own rankings and
      // from the Home page, not from the bar: `hidden` keeps the routes alive
      // and takes the entries out of the menu and the section strip.
      { label: 'Gainers', sub: 'gainers', hidden: true },
      { label: 'Losers', sub: 'losers', hidden: true },
      { label: 'Most Active', sub: 'active', hidden: true },
      { label: 'Sectors', sub: 'sectors' },
      { label: 'Industries', sub: 'industries' },
    ],
  },
  {
    view: 'news',
    icon: 'news',
    label: 'Market News',
    blurb: 'The wire, by the part of the market it is about.',
    items: [
      // The six the market is read by, in the order the Market Data sections
      // take them.
      { label: 'Latest', sub: 'latest' },
      { label: 'Stocks', sub: 'stocks' },
      { label: 'ETFs', sub: 'etfs' },
      { label: 'Indices', sub: 'indices' },
      { label: 'Futures', sub: 'futures' },
      { label: 'Economy', sub: 'economy' },
      // The keyword topics this menu used to carry. They are searches over a
      // wire rather than parts of the market, so they keep their routes and
      // leave the menu — a link written before the rebuild still lands.
      { label: 'Earnings News', sub: 'earnings', hidden: true },
      { label: 'Dividend News', sub: 'dividends', hidden: true },
      { label: 'M&A', sub: 'ma', hidden: true },
      { label: 'Analyst Ratings', sub: 'ratings', hidden: true },
      { label: 'Stock News', sub: 'stock', hidden: true },
    ],
  },
  {
    view: 'stocks',
    icon: 'trending',
    label: 'Stock Screener',
    blurb: 'Every listed company, and screens over the whole market graded on the way through.',
    /* Funds used to hang off this menu as a second "All ETFs" entry. They are
       a different question — a company is scored against its sector, a fund is
       selected from a listing — so they are their own menu underneath, and
       this one is companies only. The type dropdown inside the screener still
       moves between the two. */
    items: [
      { label: 'All Stocks', sub: 'screener', params: {country:'US',kind:'stocks',collection:'all'} },
      ...[
        ['Top Quants by Maz','stocks-by-quant'],
        ['Top Stocks by WallStreet','top-wallstreet-stocks'],
        ['Top Growth','top-growth-stocks'],
        ['Top Value','top-value-stocks'],
        ['Top Performance','score-momentum'],
        ['Top Profitability','score-profitability'],
        ['Top Health','score-health'],
      ].map(([label,collection])=>({label,sub:'screener',params:{country:'US',kind:'stocks',collection}})),
      // Preserve existing deep links outside the hover menu.
      ...[
        ['All Stocks','all'],['Top Quant Stocks','top'],['Top WallStreet Stocks','wallstreet'],
        ['Growth Stocks','growth'],['Value Stocks','value'],['Dividend Stocks','dividend'],['Stock Comparison','compare'],
      ].map(([label,sub])=>({label,sub,hidden:true})),
    ],
  },
  {
    view: 'etfs',
    icon: 'basket',
    label: 'ETF Screener',
    blurb: 'Every listed fund, and the collections that cut the list down. Funds are selected '
      + 'here, never scored — nothing in this product grades a basket.',
    /* Every item is the one screener with a collection preset, which is why
       they all share `sub: 'screener'` and differ only in `params`. The ids
       are `ETF_COLLECTIONS` keys; a rename there without one here is a menu
       item that opens the default collection, so the two move together.

       This is a curated dozen rather than all twenty-two: the flyout is a
       menu, and the screener's own dropdown carries the rest. */
    items: [
      { label: 'All ETFs', sub: 'screener', params: {country:'US',kind:'etfs',collection:'all'} },
      ...[
        ['Largest funds','largest'],
        ['Most traded','most-traded'],
        ['Highest distribution yield','highest-yield'],
        ['Equity','equity'],
        ['Fixed income','bond'],
        ['Commodities','commodities'],
        ['Gold','gold'],
        ['Bitcoin','bitcoin'],
        ['Real estate','real-estate'],
        ['World and global','global'],
        ['Country funds','country'],
        ['Sector funds','sector'],
        ['Leveraged','leveraged'],
        ['Inverse','inverse'],
        ['Shariah','shariah'],
      ].map(([label,collection])=>({label,sub:'screener',params:{country:'US',kind:'etfs',collection}})),
      // The curated side of funds, which a screener cannot do: seventeen boards
      // of named funds on the Market Data ETFs page.
      { label: 'ETF Tables', view: 'markets', sub: 'etfs', params: { board: 'tables' } },
      { label: 'Shariah ETFs', view: 'markets', sub: 'etfs', params: { board: 'tables', table: 'shariah' } },
    ],
  },
  {
    view: 'sectors',
    icon: 'layers',
    label: 'Sectors',
    blurb: 'The breakdown across all eleven, then one page per sector.',
    items: [
      // The index, and the default: a bare `?view=sectors` opens the
      // breakdown rather than dropping the reader into whichever sector
      // happens to sort first.
      { label: 'Sector Breakdown', sub: 'all' },
      ...SECTORS.map((s) => ({ label: s, sub: sectorSlug(s) })),
      // One industry. Hidden the way the Research feed's single article is:
      // it is a destination rather than a section, and there are a hundred and
      // thirty of them, so the name travels in `?industry=` rather than here.
      { label: 'Industry', sub: 'industry', hidden: true },
    ],
  },
  {
    view: 'watchlist',
    icon: 'star',
    label: 'Watchlist',
    blurb: 'The companies you follow, in the screener’s own table.',
    items: [
      { label: 'My watchlists', sub: 'lists' },
    ],
  },
  {
    view: 'ideas',
    icon: 'bulb',
    label: 'Investment Ideas',
    blurb: 'Portfolio screens over the whole market. Open one to see its rules, change them, and re-run.',
    items: [
      { label: 'All portfolios', sub: 'all' },
      ...IDEA_GROUPS.map((g) => ({ label: g, sub: ideaGroupSlug(g) })),
    ],
  },
  {
    view: 'research',
    icon: 'file',
    label: 'Research',
    blurb: 'The long-form work: the article feed, company reports, ideas and method.',
    items: [
      // First, and therefore what a bare `?view=research` opens. The editorial
      // feed is the front door of this section; Investing Strategy, which used
      // to be the default, keeps its own section immediately below and every
      // link to `&sub=strategy` still lands on it.
      { label: 'Latest Research', sub: 'latest' },
      // One article. Hidden from the menu and from the section strip — it is a
      // destination, not a section, and a strip tab called "Article" that is
      // only ever active when you are already on one is furniture.
      { label: 'Article', sub: 'article', hidden: true },
      { label: 'Stock Analysis', symbolTab: 'Research' },
      { label: 'Investing Strategy', sub: 'strategy' },
      { label: 'Investment Ideas', view: 'ideas' },
      { label: 'Earnings Calendar', view: 'calendar' },
      { label: 'Valuation', symbolTab: 'Valuation' },
      { label: 'Dividends', symbolTab: 'Dividends' },
      { label: 'Sectors & Industries', view: 'sectors' },
    ],
  },
  {
    view: 'earnings',
    icon: 'mic',
    label: 'Earnings',
    blurb: 'The calendar as a table — who reports next, who beat, and by how much — plus the '
      + 'library of calls the vendor holds a transcript for.',
    /* The six screens are one page with one table, so they share
       `sub: 'screener'` and differ in `screen`. The ids are the entries in
       `EARNINGS_SCREENS`; a screen added there without a line here is
       reachable by URL and missing from this menu. */
    items: [
      ...[
        ['Upcoming Earnings','upcoming'],
        ['Reported Earnings','reported'],
        ['EPS Beats','beats'],
        ['EPS Misses','misses'],
        ['Revenue Beats','revbeats'],
        ['Double Beats','double'],
      ].map(([label,screen])=>({label,sub:'screener',params:{screen}})),
      // Written work on results, filed under the research taxonomy's Earnings
      // category. It was hidden while the slug aliased to the screener; it is
      // a tab of its own now, so it belongs in the menu.
      { label: 'Earnings Insights', sub: 'insights' },
      { label: 'Earnings Call Transcripts', sub: 'transcripts' },
      { label: 'Method', sub: 'method' },
    ],
  },
  {
    view: 'quant',
    icon: 'target',
    label: 'Quant',
    blurb: 'The rating itself — the eight screens that rank on it, what it measures, and the '
      + 'one thing it cannot tell you.',
    /* The eight screens are one page with one table, so they share
       `sub: 'screener'` and differ in `collection`. The ids are screener
       presets, which are ideas in `ideas.js` under another name — the list is
       repeated in `quant.js` as `QUANT_SCREENS`, where each also carries its
       blurb, and a screen added there without a line here is reachable by URL
       and missing from this menu. */
    items: [
      ...[
        ['Top Quant Stocks','stocks-by-quant'],
        ['Top Valuation','score-valuation'],
        ['Top Growth','score-growth'],
        ['Top Profitability','score-profitability'],
        ['Top Health','score-health'],
        ['Top Momentum','score-momentum'],
        ['Top Dividend','top-quant-dividend-stocks'],
        ['Top Signal Stocks','score-all-round'],
      ].map(([label,collection])=>({label,sub:'screener',params:{collection}})),
      { label: 'Quant Ratings', sub: 'ratings' },
      { label: 'Factor Grades', sub: 'factors' },
      { label: 'Rating Upgrades', sub: 'upgrades' },
      { label: 'Rating Downgrades', sub: 'downgrades' },
      // The slug this menu used for its leader board before the rebuild. It
      // opens the screener on the composite, which is what it always meant.
      { label: 'Top Quant Stocks', sub: 'top', hidden: true },
      // Both rating-change items land on one tab, so `changes` is the slug the
      // page writes back and has to be routable.
      { label: 'Rating Changes', sub: 'changes', hidden: true },
    ],
  },
  {
    view: 'alpha',
    icon: 'bulb',
    label: 'Alpha Signal',
    blurb: 'Where something measurable has recently changed, and fewer people than usual are '
      + 'looking. Eleven categories of dated, sourced evidence — separate from the quant rating '
      + 'and deliberately on a different scale.',
    /* Three sections, one page. The scanner is the default because it is the
       destination; Method and Limits are what a reader opens once and then
       argues with. Limits is a real section rather than a footnote — the
       weights are unvalidated and there is no stored history to validate them
       against, and a feature that hides that is worse than one that lacks it. */
    items: [
      { label: 'Alpha Scanner', sub: 'scan' },
      { label: 'Method & Weights', sub: 'method' },
      { label: 'Limits & Validation', sub: 'limits' },
      { label: 'On a company', symbolTab: 'Alpha Signal' },
      // The slugs the three tabs also answer to, so a link written against
      // either vocabulary lands. Same trick the Quant desk plays with `top`.
      { label: 'Scanner', sub: 'screener', hidden: true },
      { label: 'Methodology', sub: 'methodology', hidden: true },
      { label: 'Backtesting', sub: 'backtest', hidden: true },
    ],
  },
  {
    view: 'shariah',
    icon: 'shield',
    label: 'Shariah',
    blurb: 'The compliance screen run across the market rather than one company, with the '
      + 'method, the purification question, and what the screen cannot test.',
    /* The five screens keep the slugs they have always had — `screener`,
       `top`, `dividend`, `growth`, `value` — and the desk maps each to the
       screen it names. A link written before the rebuild lands on the same
       list, now as one table rather than as a page of its own. */
    items: [
      { label: 'Halal Stock Screener', sub: 'screener' },
      { label: 'Top Halal Stocks', sub: 'top' },
      { label: 'Halal Dividend Stocks', sub: 'dividend' },
      { label: 'Halal Growth Stocks', sub: 'growth' },
      { label: 'Halal Value Stocks', sub: 'value' },
      { label: 'Compliance Changes', sub: 'changes' },
      { label: 'Shariah Methodology', sub: 'methodology' },
      { label: 'Purification', sub: 'purification' },
      /* Funds, which none of the screens above can reach: every screen on this
         menu is a balance-sheet test on a company, and a fund has no balance
         sheet of its own. The board on the ETFs page is the funds that state
         the mandate themselves, which is the only honest thing to list. */
      { label: 'Shariah ETFs & Funds', view: 'markets', sub: 'etfs', params: { board: 'tables', table: 'shariah' } },
    ],
  },
];

/** view slug -> its menu. */
export const NAV_BY_VIEW = Object.fromEntries(NAV.map((m) => [m.view, m]));

/** Every view the bar can open, for the router's allow-list. */
export const NAV_VIEWS = NAV.map((m) => m.view);

/** The first section of a page — what a bare `?view=` opens. */
export function defaultSub(view) {
  return NAV_BY_VIEW[view]?.items.find((i) => i.sub && !i.hidden)?.sub || null;
}

/**
 * Is `sub` a real section of `view`?
 *
 * Hidden sections count. This is the router's allow-list, and a section the
 * router refuses is a link that silently lands somewhere else — which is the
 * opposite of what `hidden` is for.
 */
export function hasSub(view, sub) {
  return !!NAV_BY_VIEW[view]?.items.some((i) => i.sub === sub);
}

function matchesDestination(item, sub) {
  if(item.sub!==sub)return false;
  const query=new URLSearchParams(location.search);
  return Object.entries(item.params||{}).every(([key,value])=>
    key==='country'||(query.get(key)||({kind:'stocks',collection:'all'}[key]))===value);
}

/** The label to print for a `(view, sub)` pair. */
export function labelFor(view, sub) {
  const menu = NAV_BY_VIEW[view];
  if (!menu) return '';
  const item = menu.items.find((i) => i.sub === sub);
  return item?.label || menu.label;
}

/* ==========================================================================
   The component

   The seven menus live in the left rail, and each opens a flyout to the right
   of it on hover.

   ---------------------------------------------------------------------------
   Why the panels are `position: fixed`
   ---------------------------------------------------------------------------

   The rail is `overflow-y: auto`, and CSS computes the *other* axis to `auto`
   the moment one axis is not `visible` — so an absolutely positioned flyout
   inside the rail would be clipped at the rail's right edge. Rather than take
   the scrolling off the rail (which a short viewport needs), the panels are
   taken out of the flow entirely and placed against the trigger's measured
   rect, clamped to the viewport. That also buys the bottom-edge flip: the
   Sectors menu is eleven items and would otherwise run off a laptop screen.

   ---------------------------------------------------------------------------
   Hover, and what it owes the people it does not work for
   ---------------------------------------------------------------------------

   Hover opens the flyout. Two delays make it usable rather than twitchy:

   * an **open delay**, so sweeping the pointer down the rail on the way to
     something else does not fire seven menus in turn, and
   * a **close delay**, so a fast diagonal from the item to the panel does not
     lose the panel halfway across.

   The panel is a DOM child of its group, so moving the pointer from the item
   into the panel never fires `mouseleave` at all — the close delay is only
   there for the gap a sloppy diagonal opens up.

   Hover does not exist on a touch screen, so **clicking the item navigates**
   to that page rather than toggling the menu. The destination then carries the
   same sections in a strip across the top, which is how a touch reader reaches
   them. Keyboard focus opens the flyout, and Escape closes it.
   ========================================================================== */

/** How long the pointer must rest on an item before its menu opens. */
const OPEN_DELAY = 110;
/** How long a menu stays open after the pointer leaves. */
const CLOSE_DELAY = 240;

/**
 * The seven menus, as rail items with flyouts.
 *
 * Returns the `<nav>`. `dispose()` on it tears the document-level listeners
 * down — the rail is rebuilt on every navigation, and without that each one
 * would leave a live keydown and resize handler behind.
 */
export function buildRailNav(current, nav = {}, icon = () => null) {
  const root = el('nav', { class: 'sidenav__nav', 'aria-label': 'Main' });
  const entries = [];

  let open = null;
  let openTimer = null;
  let closeTimer = null;

  const clearTimers = () => {
    clearTimeout(openTimer); clearTimeout(closeTimer);
    openTimer = null; closeTimer = null;
  };

  function close() {
    clearTimers();
    for (const e of entries) {
      e.panel.hidden = true;
      e.button.setAttribute('aria-expanded', 'false');
      e.group.classList.remove('is-open');
    }
    open = null;
  }

  /**
   * Show one panel against its trigger.
   *
   * Measured after it is visible, because a hidden element has no height and
   * the bottom-edge clamp needs one. Writing `top` twice in the same frame
   * costs a reflow and shows nothing: the browser paints once, at the end.
   */
  function place(entry) {
    const { button, panel } = entry;
    const r = button.getBoundingClientRect();

    // Anchor to the rail's edge, not the button's. The rail insets its items,
    // so a panel placed against the button would sit that inset over the
    // black — which reads as a misalignment rather than a flyout. Measured
    // rather than named, so it survives a change to the rail's width.
    const host = root.closest('.sidenav');
    const x = host ? Math.max(r.right, host.getBoundingClientRect().right) : r.right;

    panel.hidden = false;
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(r.top)}px`;

    const h = panel.offsetHeight;
    const maxTop = window.innerHeight - h - 8;
    if (r.top > maxTop) panel.style.top = `${Math.round(Math.max(8, maxTop))}px`;
  }

  function show(entry) {
    if (open === entry) { clearTimers(); return; }
    close();
    place(entry);
    entry.button.setAttribute('aria-expanded', 'true');
    entry.group.classList.add('is-open');
    open = entry;
  }

  const scheduleOpen = (entry) => {
    clearTimers();
    openTimer = setTimeout(() => show(entry), OPEN_DELAY);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer = setTimeout(close, CLOSE_DELAY);
  };

  for (const menu of NAV) {
    const panelId = `nav-${menu.view}`;
    const isCurrent = current?.view === menu.view;

    const button = el('button', {
      type: 'button',
      class: `sidenav__item is-live railtop ${isCurrent ? 'is-active' : ''}`.trim(),
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-controls': panelId,
      'aria-current': isCurrent ? 'page' : null,
      onclick: () => { close(); nav.goView?.(menu.view, null); },
    }, [
      icon(menu.icon),
      el('span', { class: 'railtop__l', text: menu.label }),
      caret(),
    ]);

    const panel = el('div', {
      class: `railmenu ${menu.items.length > 6 ? 'railmenu--two' : ''}`.trim(),
      id: panelId, hidden: true, role: 'group', 'aria-label': menu.label,
    }, [
      el('p', { class: 'railmenu__t', text: menu.label }),
      menu.blurb ? el('p', { class: 'railmenu__b', text: menu.blurb }) : null,
      el('ul', { class: 'railmenu__list' }, menu.items.filter((i) => !i.hidden).map((item) => {
        const active = isCurrent && item.sub && matchesDestination(item,current?.sub);

        if (item.built === false) {
          return el('li', {}, [el('span', {
            class: 'railmenu__i is-off', 'aria-disabled': 'true',
            title: 'Not built yet', text: item.label,
          })]);
        }

        return el('li', {}, [el('button', {
          type: 'button',
          class: `railmenu__i ${active ? 'is-active' : ''}`.trim(),
          'aria-current': active ? 'page' : null,
          onclick: () => {
            close();
            // A cross-page item may name a section and carry state of its own
            // — the ETF menu's last entry opens the Market Data ETFs page on
            // its tables tab, which is a `(view, sub, params)` triple like any
            // other destination rather than a bare page.
            if (item.symbolTab) nav.goSymbolTab?.(item.symbolTab);
            else if (item.view) nav.goView?.(item.view, item.sub || null, item.params || null);
            else if(item.params)nav.goView?.(menu.view, item.sub,item.params);
            else nav.goView?.(menu.view, item.sub);
          },
        }, [
          el('span', { text: item.label }),
          item.symbolTab ? el('i', { class: 'railmenu__hint', text: 'on the report' }) : null,
        ])]);
      })),
    ]);

    const group = el('div', { class: 'railgroup' }, [button, panel]);
    const entry = { menu, button, panel, group };

    group.addEventListener('mouseenter', () => scheduleOpen(entry));
    group.addEventListener('mouseleave', scheduleClose);
    // Keyboard reaches it the same way, without the delay: a reader who has
    // tabbed to the item has already made the choice the delay guards against.
    group.addEventListener('focusin', () => { clearTimers(); show(entry); });
    group.addEventListener('focusout', (e) => {
      if (!group.contains(e.relatedTarget)) scheduleClose();
    });

    entries.push(entry);
    root.append(group);
  }

  /* A fixed panel is placed against a rect measured once, so anything that
     moves the trigger invalidates it. Closing is the honest response —
     re-placing a menu under a pointer that has already moved on is worse. */
  const onKey = (e) => {
    if (e.key !== 'Escape' || !open) return;
    const btn = open.button;
    close();
    btn.focus();
  };
  const onMoved = () => { if (open) close(); };

  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onMoved);
  root.addEventListener('scroll', onMoved, true);

  root.dispose = () => {
    clearTimers();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onMoved);
    root.removeEventListener('scroll', onMoved, true);
  };

  return root;
}

function caret() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'railtop__c');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9 6l6 6-6 6');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

/* ==========================================================================
   The page head every one of these pages shares
   ========================================================================== */

/**
 * Title, blurb, and the section strip.
 *
 * The strip repeats the menu's items along the top of the page, which is what
 * makes a section switchable without going back to the bar. Same rule as the
 * Financials tab's strip: one stop for the whole thing, arrow keys inside it.
 */
export function pageHead(view, sub, nav = {}) {
  const menu = NAV_BY_VIEW[view];
  if (!menu) return null;

  // Hidden sections are routable but not listed — see `hidden` on NAV above.
  const sections = menu.items.filter((i) => i.sub && !i.hidden);
  const buttons = sections.map((item) => el('button', {
    type: 'button',
    class: `subtab ${matchesDestination(item,sub) ? 'is-active' : ''}`.trim(),
    role: 'tab',
    'aria-selected': matchesDestination(item,sub) ? 'true' : 'false',
    tabIndex: matchesDestination(item,sub) ? 0 : -1,
    text: item.label,
    onclick: () => item.params?nav.goView?.(view,item.sub,item.params):nav.goView?.(view,item.sub),
  }));

  const strip = el('div', { class: 'subtabs subtabs--wrap', role: 'tablist', 'aria-label': menu.label }, buttons);

  strip.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = sections.findIndex((s) => matchesDestination(s,sub));
    const next = (i + step + sections.length) % sections.length;
    const item=sections[next];
    if(item.params)nav.goView?.(view,item.sub,item.params);else nav.goView?.(view,item.sub);
  });

  return el('div', { class: 'pagehead' }, [
    el('h1', { class: 'pagehead__t', text: menu.label }),
    menu.blurb ? el('p', { class: 'pagehead__b', text: menu.blurb }) : null,
    sections.length > 1 ? strip : null,
  ]);
}
