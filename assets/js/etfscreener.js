/* ==========================================================================
   Maz Vantage — the ETF Screener page

   `?view=etfs`. Its own rail menu, beneath Stock Screener, because a fund and
   a company are not the same object and the one screener that served both was
   quietly saying they were.

   ---------------------------------------------------------------------------
   Why it split out of Stock Screener
   ---------------------------------------------------------------------------

   The two screeners share an engine and almost nothing else. A stock is
   *scored* — forty screens behind the stock menu, each one a rule over ratios
   graded against a sector. A fund cannot be: nothing in this product grades a
   basket, so every ETF collection is a **selection** rather than a ranking,
   and the columns that matter are the ones the vendor returns for a listing.

   Hanging the fund collections off the stock menu made them look like two
   more screens in the same family. They are a different question, so they are
   a different menu, and the type dropdown inside the screener still moves
   between the two with the country and the search intact.

   ---------------------------------------------------------------------------
   What this page is not
   ---------------------------------------------------------------------------

   It is the whole listing, filtered by rule — five thousand funds, cut down by
   something measurable. It is not the curated side: "what did gold do today"
   needs somebody to have decided that GLD stands for gold, and that lives on
   Market Data → ETFs as the ETF tables. Both are linked from here, because a
   reader who cannot find a fund by rule usually wants the board instead.
   ========================================================================== */

import { el } from './util.js';
import { hasApiKey } from './fmp.js';
import { arrow } from './markethub-ui.js';
import { renderDedicatedScreener } from './screener.js';
import { ETF_COLLECTIONS, etfCollection } from './etf-collections.js';

/* The dropdown inside the screener carries every collection. The rail up here
   carries them grouped, which the dropdown cannot do legibly, and is the
   control a reader arriving from the menu will reach for first. */
const GROUPS = ['Market Collections', 'What the fund holds'];

/** Page state into the address bar, without a history entry. */
function writeParams(changes) {
  try {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === '') url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    history.replaceState(history.state, '', url);
  } catch { /* history unavailable */ }
}

export function renderEtfScreenerPage(sub, nav = {}) {
  const params = new URLSearchParams(location.search);
  let collection = etfCollection(params.get('collection')).id;
  let country = params.get('country') || 'US';

  /* `kind` has to be in the query before the rail is built, or the flyout
     marks nothing active on a bare `?view=etfs` — `matchesDestination` reads
     the URL and every item on this menu says `kind: 'etfs'`. The page renders
     before the bar does, so writing it here is early enough. */
  writeParams({ kind: 'etfs', collection, country });

  const page = el('main', { class: 'mh-page efs-page', id: 'etf-screener' });
  const chips = el('div', { class: 'efs-groups' });
  const rule = el('p', { class: 'efs-rule' });
  const table = el('div', { class: 'efs-table' });
  let live = null;

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'FUNDS' }),
      el('h1', { class: 'efs-title', text: 'ETF screener' }),
      el('p', { class: 'efs-strap', text: 'Every exchange-traded fund the vendor lists, cut down '
        + 'by a rule you can read. A fund is selected here, never scored — this product grades '
        + 'companies against their own sector, and a basket belongs to no sector.' }),
      el('div', { class: 'mh-hero__meta' }, [
        el('button', {
          type: 'button', class: `mh-connection ${hasApiKey() ? 'is-connected' : ''}`,
          text: hasApiKey() ? 'FMP connected' : 'Connect FMP',
          onclick: () => nav.openSettings?.(),
        }),
        el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
        el('button', { type: 'button', class: 'efs-crumb',
          onclick: () => nav.goView?.('markets', 'etfs', { board: 'tables' }) },
        ['Looking for a named board? ETF tables', arrow()]),
      ]),
    ]),
    chips, rule, table,
  );

  chips.replaceChildren(...GROUPS.map((group) => {
    const items = ETF_COLLECTIONS.filter((item) => item.group === group);
    if (!items.length) return null;
    return el('section', { class: 'efs-group', 'aria-label': group }, [
      el('h2', { class: 'efs-group__t', text: group === 'What the fund holds'
        ? 'What the fund holds — read from its own name' : group }),
      el('div', { class: 'efs-chips', role: 'group', 'aria-label': group },
        items.map((item) => el('button', {
          type: 'button', 'data-collection': item.id, class: 'efs-chip',
          'aria-pressed': 'false', title: item.unavailable || item.note || item.title,
          text: item.title, onclick: () => choose(item.id),
        }))),
    ]);
  }).filter(Boolean));

  function choose(id) {
    collection = etfCollection(id).id;
    writeParams({ collection, sub: 'screener' });
    draw();
  }

  function draw() {
    const selected = etfCollection(collection);
    // Same reason the Quant desk names its own screen: every collection on
    // this menu shares the slug `screener`, so the bar cannot tell them apart.
    document.title = `${selected.title} — Maz Vantage`;
    for (const chip of chips.querySelectorAll('[data-collection]')) {
      const active = chip.dataset.collection === collection;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
    // The rule a collection selects on, printed where it is applied.
    rule.textContent = selected.unavailable || selected.note || '';
    rule.hidden = !rule.textContent;
    rule.classList.toggle('efs-rule--off', !!selected.unavailable);

    live?.dispose?.();
    live = renderDedicatedScreener(nav, {
      kind: 'etfs', collection, country, chrome: false, picker: false,
      onNavigate: (next) => {
        if (next.kind !== 'etfs') { nav.goView?.('stocks', 'screener', next); return; }
        country = next.country || country;
        collection = etfCollection(next.collection).id;
        writeParams({ collection, country });
        draw();
      },
    });
    table.replaceChildren(live);
  }

  draw();
  page.dispose = () => live?.dispose?.();
  return page;
}
