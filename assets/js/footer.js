/* ==========================================================================
   Vanlior — the page footer

   A black block at the foot of every page, in the shape Seeking Alpha's
   footer uses: the brand across the top, then every section of the product
   as columns of links under small uppercase headings, then a strip with the
   copyright, the data credit and the standing disclaimer.

   The columns are **read from `NAV`**, not written out here. A footer is the
   one place a whole product's destinations are printed at once, and a
   hand-kept copy would drift from the menus the first time one changed. So a
   menu is a column, its visible items are the links, and a link goes exactly
   where the same item in the rail's flyout goes (`openNavItem`).

   What is deliberately absent: About, Careers, Terms, Privacy, social
   accounts and app badges. None of those pages or accounts exist, and a link
   to nothing is worse than no link.
   ========================================================================== */

import { el } from './util.js';
import { NAV, openNavItem, menuItems } from './nav.js';

const FMP_URL = 'https://site.financialmodelingprep.com/';

/**
 * The footer.
 *
 * `nav` is the page's router (`goView`, `goSymbolTab`). `more` is the rail's
 * shortcut group — Home, Calendar and the like — printed as a last column so
 * nothing the rail offers is missing here. `openSettings` opens the dialog
 * that holds the FMP key.
 */
export function siteFooter(nav = {}, { more = [], openSettings = null } = {}) {
  const link = (label, onclick) => el('li', {}, [
    el('button', { type: 'button', class: 'ft__link', text: label, onclick }),
  ]);

  const column = (title, links) => el('section', { class: 'ft__col' }, [
    el('h2', { class: 'ft__h', text: title }),
    el('ul', { class: 'ft__links' }, links),
  ]);

  const menus = NAV.map((menu) => column(menu.label,
    menuItems(menu).map((item) => link(item.label, () => openNavItem(nav, menu, item)))));

  const shortcuts = [
    ...more.filter((item) => item.view).map((item) => link(item.label, () => nav.goView?.(item.view, item.sub || null))),
    openSettings ? link('Settings', openSettings) : null,
  ].filter(Boolean);

  return el('footer', { class: 'ft', 'aria-label': 'Site' }, [
    el('div', { class: 'ft__top' }, [
      el('button', { type: 'button', class: 'ft__brand', 'aria-label': 'Vanlior home', onclick: () => nav.goView?.('home') }, [
        el('img', { class: 'ft__mark', src: 'assets/img/vanlior-mark-white.svg', alt: '' }),
        el('span', { class: 'ft__word', text: 'Vanlior' }),
      ]),
      el('p', { class: 'ft__tag', text: 'Every stock graded against its own sector.' }),
    ]),
    el('div', { class: 'ft__rule', role: 'presentation' }),
    el('nav', { class: 'ft__cols', 'aria-label': 'All sections' }, [
      ...menus,
      shortcuts.length ? column('More', shortcuts) : null,
    ].filter(Boolean)),
    el('div', { class: 'ft__rule', role: 'presentation' }),
    el('div', { class: 'ft__base' }, [
      el('p', { class: 'ft__copy', text: `© ${new Date().getFullYear()} Vanlior` }),
      el('p', { class: 'ft__credit' }, [
        'Market data from ',
        el('a', { href: FMP_URL, target: '_blank', rel: 'noopener', text: 'Financial Modeling Prep' }),
        '. Quotes may be delayed.',
      ]),
    ]),
    // The report's own footer carried this wording before there was a site
    // footer; it moved here so every page says it, not only the report.
    el('p', { class: 'ft__note', text: 'Vanlior is a research tool, not financial advice. Grades, ratings, fair values '
      + 'and signals are generated from that data by this product’s own models, without considering your '
      + 'objectives, financial situation or needs. Verify anything you intend to act on against primary filings.' }),
  ]);
}
