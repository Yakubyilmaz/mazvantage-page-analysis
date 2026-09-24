/* ==========================================================================
   Vanlior — Markets Data

   Ten sections off one page: the overview, four asset-class pages (indices,
   equities, funds, the economy), the three mover lists, and the sector and
   industry snapshots. All ten read market-wide FMP feeds, none of them is
   about a single company, and none of them is graded — a mover list is a fact
   about a trading day, not an assessment.

   The four asset-class pages live in `marketpages.js`; this file keeps the
   sections it always had, plus the dispatch and the shared row components
   that the Home page also reads.

   ---------------------------------------------------------------------------
   The one thing worth knowing before reading a mover list
   ---------------------------------------------------------------------------

   `biggest-gainers` and its siblings return **whatever traded**, which on any
   given day means leveraged ETFs, SPAC rights, warrants and sub-dollar
   shells alongside real companies. A list topped by a 175% move in a rights
   line is not a market story, and presenting it as one is the single easiest
   way for a page like this to mislead.

   So the lists filter, by default, to things that look like common stock, and
   the count removed is printed rather than hidden. `looksLikeStock()` below is
   the whole of that judgement and it is deliberately conservative.
   ========================================================================== */

import { el, isNum, pct, price, num, dec, fmtDate, signClass } from './util.js';
import { card, notice, ohead, table } from './ui.js';
import { fetchMarket, hasApiKey, logoUrl } from './fmp.js';
import { pageHead, SECTORS, sectorSlug } from './nav.js';
import { renderMarketHub } from './markethub.js';
import { renderMarketIndices } from './marketindices.js';
import { renderMarketFutures } from './marketfutures.js';
import { renderStockMarkets } from './stockmarkets.js';
import { renderEtfScreenerPage } from './etfscreener.js';
import {
  stocksSection, etfsSection, economySection, overviewSections,
} from './marketpages.js';

/* ==========================================================================
   Shared plumbing
   ========================================================================== */

/**
 * Render a placeholder, then swap in the real thing when the fetch lands.
 *
 * Every section on this page is one or two requests deep, so they all want
 * the same three states: loading, loaded, and the reason it could not load.
 */
function hydrate(build) {
  const host = el('div', { class: 'ovw' }, [
    card('mk-loading', [
      el('div', { class: 'sk sk--line', style: { width: '220px', height: '22px' } }),
      el('div', { class: 'sk sk--block', style: { marginTop: '16px' } }),
    ], 'ocard ovw__c12'),
  ]);

  build()
    .then((nodes) => host.replaceChildren(...[].concat(nodes).filter(Boolean)))
    .catch((err) => host.replaceChildren(card('mk-error', [
      ohead('Could not load'),
      notice(`This section failed to load — ${String(err?.message || err)}.`, 'notice--error'),
    ], 'ocard ovw__c12')));

  return host;
}

/** The gate message for a market feed, or null when it came back fine. */
function marketGate(res, what) {
  if (res.status === 'ok') return null;
  if (res.status === 'skipped' || !hasApiKey()) {
    return notice(`<b>${what}</b> is market-wide data and needs a live FMP connection. `
      + 'Add your API key in <code>Settings</code> to load it. The bundled snapshot covers one '
      + 'company only, so there is nothing to fall back to here.');
  }
  if (res.status === 'gated') {
    return notice(`<b>${what}</b> is not included in your current FMP plan.`);
  }
  return notice(`<b>${what}</b> could not be loaded — ${res.message || 'unknown error'}.`, 'notice--error');
}

/**
 * Does this row look like ordinary common stock?
 *
 * Name-pattern matching, which is as far as these feeds allow — they carry no
 * `isEtf` flag, unlike the screener. It catches the categories that actually
 * crowd a mover list: leveraged and inverse ETFs, SPAC rights and warrants,
 * unit lines, and preferred shares. It will not catch an operating company
 * with an unusual name, and it may drop a legitimate company whose name
 * happens to contain one of these words.
 *
 * Conservative on purpose: a filter that is wrong in the direction of showing
 * too much is recoverable by the reader, one that silently hides real
 * companies is not. Hence the toggle, and the printed count.
 */
export function looksLikeStock(row) {
  const name = String(row.name || '');
  const sym = String(row.symbol || '');

  // Ticker shape: a trailing R / W / U on a five-letter NASDAQ symbol is a
  // right, warrant or unit.
  if (/^[A-Z]{4}[RWU]$/.test(sym)) return false;
  if (/\.(WS|U|R)$/i.test(sym)) return false;

  return !/\b(ETF|ETN|Rights?|Warrants?|Units?|Preferred|Depositary|Bull|Bear|Daily|[0-9](?:\.[0-9])?X|Leverage[d]?|Ultra|ProShares|Direxion|GraniteShares|T-REX)\b/i.test(name);
}

/* ==========================================================================
   The page
   ========================================================================== */

export function renderMarketsPage(sub, nav = {}) {
  if (sub === 'country') {
    const url = new URL(location.href);
    url.searchParams.set('sub', 'overview');
    url.searchParams.set('country', 'US');
    history.replaceState(history.state, '', url);
    return renderMarketHub(nav);
  }
  if (sub === 'futures') return renderMarketFutures(nav);
  /* The ETFs page used to carry the screener as a third tab, so a link
     written then says `&board=screener`. The screener is a page of its own
     now, and that link means it — with whatever collection and country it was
     carrying. Rewritten rather than redirected, because a redirect here would
     re-enter the router mid-render; the same move `sub === 'country'` above
     makes. The rail marks Markets Data until the next navigation, which is
     the price of not re-entering. */
  if (sub === 'etfs' && new URLSearchParams(location.search).get('board') === 'screener') {
    const url = new URL(location.href);
    url.searchParams.set('view', 'etfs');
    url.searchParams.set('sub', 'screener');
    url.searchParams.set('kind', 'etfs');
    url.searchParams.delete('board');
    history.replaceState(history.state, '', url);
    return renderEtfScreenerPage('screener', nav);
  }
  if (['corporate', 'etfs', 'economy'].includes(sub)) return renderMarketHub(nav, { section: sub });
  // The two market-canvas pages own their whole screen — no page head, no
  // section strip — so they are returned before the shared page frame.
  if (!sub || sub === 'overview') return renderMarketHub(nav);
  if (sub === 'indices') return renderMarketIndices(nav);
  if (sub === 'stocks' || sub === 'world') return renderStockMarkets(nav);
  const section = SECTIONS[sub] || SECTIONS.overview;
  return el('div', {}, [
    pageHead('markets', sub, nav),
    section(nav),
  ]);
}

const SECTIONS = {
  overview:   (nav) => hydrate(() => overviewSection(nav)),
  // The four asset-class pages live in `marketpages.js`. ETFs is the one that
  // is not `async`: it owns its own loading state because its single screener
  // call feeds a table the reader then searches and pages through locally.
  stocks:     (nav) => hydrate(() => stocksSection(nav)),
  etfs:       (nav) => etfsSection(nav),
  economy:    (nav) => hydrate(() => economySection(nav)),
  gainers:    (nav) => hydrate(() => moversSection('gainers', nav)),
  losers:     (nav) => hydrate(() => moversSection('losers', nav)),
  active:     (nav) => hydrate(() => moversSection('active', nav)),
  sectors:    (nav) => hydrate(() => performanceSection('sector', nav)),
  industries: (nav) => hydrate(() => performanceSection('industry', nav)),
};

/* ---------- 1. the overview ------------------------------------------------ */

/**
 * The whole market on one screen: how the sectors moved, and the top of each
 * mover list.
 *
 * Five of each rather than fifty. This section exists to answer "what
 * happened today" in one look; a reader who wants the full list has three
 * menu items for it.
 */
/**
 * The hub.
 *
 * Every section it renders lives in `marketpages.js` — indices, equities, the
 * three mover lists, funds, rates, earnings and news, each with its own way
 * through to the page behind it. This file keeps the dispatch and the row
 * components the Home page shares; the hub's content is not its business.
 *
 * The mover lists this page used to own are still here, rendered by the same
 * shape from the same feeds. Nothing it showed was dropped — it was
 * reorganised into a section per dataset and six more sections added around
 * it.
 */
const overviewSection = (nav) => overviewSections(nav);

function miniMovers(title, res, sub, nav) {
  const rows = (res.status === 'ok' ? res.data : []).filter(looksLikeStock).slice(0, 6);

  return card(`mk-mini-${sub}`, [
    ohead(title, el('button', {
      type: 'button', class: 'btn btn--ghost', text: 'See all',
      onclick: () => nav.goView?.('markets', sub),
    })),
    marketGate(res, title) || (rows.length
      ? el('div', { class: 'mklist' }, rows.map((r) => moverRow(r, nav)))
      : notice('Nothing was returned for this list.')),
  ], 'ocard ovw__c4');
}

/* ---------- 2. the mover lists --------------------------------------------- */

const MOVERS = {
  gainers: {
    title: 'Biggest gainers',
    blurb: 'The largest one-day percentage rises FMP reports across the US exchanges.',
    caution: 'A big one-day rise on a small company is usually one piece of news, and sometimes '
      + 'it is one trade. Nothing in this list is a recommendation, and nothing in it is graded.',
  },
  losers: {
    title: 'Biggest losers',
    blurb: 'The largest one-day percentage falls FMP reports across the US exchanges.',
    caution: 'A fall of this size is normally a specific event — a failed trial, a guidance cut, '
      + 'a dilutive raise — and the list says nothing about which. Read it as a list of questions '
      + 'rather than of opportunities.',
  },
  active: {
    title: 'Most active',
    blurb: 'The heaviest traded names of the session by volume.',
    caution: 'Volume is not direction. A name here may have risen, fallen or gone nowhere; what '
      + 'it has done is change hands.',
  },
};

async function moversSection(kind, nav) {
  const res = await fetchMarket(kind);
  const spec = MOVERS[kind];
  const all = res.status === 'ok' ? res.data : [];

  let filtered = true;
  const body = el('div');

  const draw = () => {
    const rows = filtered ? all.filter(looksLikeStock) : all;
    const removed = all.length - all.filter(looksLikeStock).length;

    body.replaceChildren(
      rows.length
        ? table([
            { label: 'Symbol' }, { label: 'Company' }, { label: 'Price', num: true },
            { label: 'Change', num: true }, { label: '% Change', num: true }, { label: 'Exchange' },
          ], rows.map((r) => [
            tickerButton(r.symbol, nav),
            el('span', { class: 'mkname', title: r.name, text: r.name || '—' }),
            isNum(r.price) ? price(r.price) : 'n/a',
            el('span', { class: signClass(r.change), text: isNum(r.change) ? dec(r.change, 2) : 'n/a' }),
            el('span', { class: signClass(r.changesPercentage),
              text: isNum(r.changesPercentage) ? pct(r.changesPercentage, { already: true, sign: true }) : 'n/a' }),
            r.exchange || '—',
          ]))
        : notice('Nothing was returned for this list.'),
      el('p', { class: 't-tiny subtle mt2', text: filtered
        ? `Showing ${rows.length} of ${all.length} rows. ${removed} were filtered out as ETFs, `
          + 'rights, warrants, units or preferred lines — see the note below.'
        : `Showing all ${all.length} rows, unfiltered.` }),
    );
  };

  const toggle = el('button', {
    type: 'button', class: 'btn btn--ghost',
    text: 'Show everything the feed returned',
    onclick: () => {
      filtered = !filtered;
      toggle.textContent = filtered ? 'Show everything the feed returned' : 'Filter to common stock';
      draw();
    },
  });

  draw();

  return [
    card(`mk-${kind}`, [
      ohead(spec.title, all.length ? toggle : null, spec.blurb),
      marketGate(res, spec.title) || body,
    ], 'ocard ovw__c12'),

    card(`mk-${kind}-basis`, [
      ohead('How to read this'),
      el('p', { class: 'fgroup__desc', text: spec.caution }),
      el('p', { class: 't-tiny subtle mt2', text: 'The feed carries no fund flag, so the default '
        + 'filter is name and ticker pattern matching: it drops leveraged and inverse ETFs, SPAC '
        + 'rights and warrants, unit lines and preferred shares. It is deliberately conservative '
        + 'and will occasionally drop a real company whose name contains one of those words, '
        + 'which is why the unfiltered list is one click away.' }),
    ], 'ocard ovw__c12'),
  ];
}

function tickerButton(symbol, nav) {
  if (!symbol) return '—';
  return el('button', {
    type: 'button', class: 'mkticker', text: symbol,
    title: `Open the ${symbol} report`,
    onclick: () => nav.goSymbol?.(symbol),
  });
}

export function moverRow(r, nav) {
  return el('div', { class: 'mkrow' }, [
    logoImg(r.symbol),
    el('div', { class: 'mkrow__b' }, [
      el('button', {
        type: 'button', class: 'mkrow__s', text: r.symbol,
        onclick: () => nav.goSymbol?.(r.symbol),
      }),
      el('span', { class: 'mkrow__n', title: r.name, text: r.name || '' }),
    ]),
    el('span', { class: `mkrow__v ${signClass(r.changesPercentage)}`.trim(),
      text: isNum(r.changesPercentage) ? pct(r.changesPercentage, { already: true, sign: true }) : 'n/a' }),
  ]);
}

function logoImg(symbol) {
  const src = logoUrl(symbol);
  if (!src) return null;
  const fb = () => el('span', { class: 'mkrow__logo mkrow__logo--fb', text: (symbol || '?')[0] });
  const img = el('img', { class: 'mkrow__logo', src, alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(fb()));
  return img;
}

/* ---------- 3. sectors and industries -------------------------------------- */

/**
 * Group the per-exchange rows into one row per sector, averaged.
 *
 * Exported because the Home page shows the same bars in a narrower column,
 * and the grouping is real logic — FMP returns one row per sector *per
 * exchange*, so a page that skipped this would show Technology three times.
 */
export function sectorRows(res) {
  if (res.status !== 'ok') return [];
  const by = new Map();
  for (const r of res.data || []) {
    const name = r.sector || r.industry;
    if (!name || !isNum(r.averageChange)) continue;
    const cur = by.get(name) || { sector: name, total: 0, n: 0 };
    cur.total += r.averageChange;
    cur.n += 1;
    by.set(name, cur);
  }
  return [...by.values()]
    .map((x) => ({ sector: x.sector, change: x.total / x.n, exchanges: x.n }))
    .sort((a, b) => b.change - a.change);
}

async function performanceSection(kind, nav) {
  const isSector = kind === 'sector';
  const [perf, pe] = await Promise.all([
    fetchMarket(isSector ? 'sectorPerf' : 'industryPerf'),
    fetchMarket(isSector ? 'sectorPe' : 'industryPe'),
  ]);

  const rows = sectorRows(perf);

  // The P/E snapshot is keyed the same way, so it folds in by name.
  const peBy = new Map();
  if (pe.status === 'ok') {
    for (const r of pe.data || []) {
      const name = r.sector || r.industry;
      if (name && isNum(r.pe)) {
        const cur = peBy.get(name) || { total: 0, n: 0 };
        cur.total += r.pe; cur.n += 1;
        peBy.set(name, cur);
      }
    }
  }

  const title = isSector ? 'Sector performance' : 'Industry performance';

  return [
    card(`mk-${kind}-perf`, [
      ohead(title, perf.date ? el('span', { class: 'pill pill--muted', text: fmtDate(perf.date) }) : null,
        'Average change across the constituents of each '
        + `${kind}, for the last session FMP has data for. Averaged across every exchange the `
        + 'feed returns, which is why a row can differ from the headline index for the same '
        + 'group — this counts members equally, an index weights them by size.'),

      marketGate(perf, title) || (rows.length
        ? el('div', {}, [
            changeBars(rows, nav, { linkSectors: isSector }),
            el('p', { class: 't-tiny subtle mt2', text: `${rows.length} ${kind}s, sorted by the `
              + 'session move. Bars share one scale.' }),
          ])
        : notice(`No ${kind} performance was returned for the last five sessions.`)),
    ], 'ocard ovw__c12'),

    rows.length ? card(`mk-${kind}-table`, [
      ohead(`${isSector ? 'Sectors' : 'Industries'} in full`, null,
        peBy.size ? 'The price/earnings column is the same snapshot’s aggregate multiple, '
          + 'averaged the same way.' : null),
      table([
        { label: isSector ? 'Sector' : 'Industry' },
        { label: 'Session change', num: true },
        ...(peBy.size ? [{ label: 'Aggregate P/E', num: true }] : []),
      ], rows.map((r) => {
        const p = peBy.get(r.sector);
        return [
          isSector && SECTORS.includes(r.sector)
            ? el('button', {
                type: 'button', class: 'mkticker',
                text: r.sector,
                title: `Open the ${r.sector} sector page`,
                onclick: () => nav.goView?.('sectors', sectorSlug(r.sector)),
              })
            : r.sector,
          el('span', { class: signClass(r.change), text: pct(r.change, { already: true, sign: true }) }),
          ...(peBy.size ? [p ? dec(p.total / p.n, 1) : 'n/a'] : []),
        ];
      })),
    ], 'ocard ovw__c12') : null,
  ];
}

/**
 * One bar per row, diverging from a centre line.
 *
 * Diverging rather than left-anchored because these are signed: a sector that
 * fell and one that rose should not both grow rightwards from the same edge.
 */
export function changeBars(rows, nav, { linkSectors = true, tight = false } = {}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.change)), 0.1);

  return el('div', { class: `mkbars ${tight ? 'mkbars--tight' : ''}`.trim() }, rows.map((r) => {
    const w = (Math.abs(r.change) / max) * 50;
    const up = r.change >= 0;
    const label = (linkSectors && SECTORS.includes(r.sector))
      ? el('button', {
          type: 'button', class: 'mkbars__k mkbars__k--link', text: r.sector,
          title: `Open the ${r.sector} sector page`,
          onclick: () => nav.goView?.('sectors', sectorSlug(r.sector)),
        })
      : el('span', { class: 'mkbars__k', title: r.sector, text: r.sector });

    return el('div', { class: 'mkbars__row' }, [
      label,
      el('span', { class: 'mkbars__track' }, [
        el('i', {
          class: `mkbars__fill ${up ? 'is-up' : 'is-down'}`,
          style: up ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` },
        }),
      ]),
      el('span', { class: `mkbars__v ${signClass(r.change)}`.trim(),
        text: pct(r.change, { already: true, sign: true }) }),
    ]);
  }));
}
