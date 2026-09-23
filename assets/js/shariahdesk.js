/* ==========================================================================
   Maz Vantage — the Shariah desk

   `?view=shariah`. One canvas, four tabs:

     screener      the five compliance screens, in one table
     methodology   the five published standards and what they measure
     purification  what to do with the income the screen cannot remove
     changes       why a compliance-change list needs a database

   ---------------------------------------------------------------------------
   Why this is a table
   ---------------------------------------------------------------------------

   The five screens were five pages, each with a run button, and every one of
   them is the same three compliance rules with something bolted on top. As
   separate pages you could not get from Halal Value to Halal Growth without
   losing your filters and re-running the compliance test from scratch; as one
   table with the screen as a control, the compliance universe is the constant
   and the extra rule is the variable, which is the way the screen actually
   works.

   ---------------------------------------------------------------------------
   The caveat travels with the table, not with the page
   ---------------------------------------------------------------------------

   `shariah.js` is explicit that this screen is mechanical rather than a
   ruling, and that three of the tests the index providers run are not run at
   all. Running it across a whole market does not weaken that — it applies it
   to more companies at once. So the caveat is printed above the results on
   every screen rather than once at the top of a page somebody may have
   scrolled past, and it comes from the idea's own `note`, which is the same
   string the portfolio page prints.
   ========================================================================== */

import { el } from './util.js';
import { hasApiKey } from './fmp.js';
import { arrow } from './markethub-ui.js';
import { renderDedicatedScreener } from './screener.js';
import { SHARIAH_SCREENS, SHARIAH_IDEAS, shariahScreen, shariahScreenForSub } from './shariah-screens.js';
import { SHARIAH_STANDARDS, SHARIAH_INFO, EXCLUDED_ACTIVITIES } from './shariah.js';

const IDEA_BY_ID = Object.fromEntries(SHARIAH_IDEAS.map((idea) => [idea.key, idea]));

/** The tabs across the top, and which `sub` each answers to. */
const TABS = [
  { id: 'screener', label: 'Halal Screener' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'purification', label: 'Purification' },
  { id: 'changes', label: 'Compliance Changes' },
];

/* ==========================================================================
   The page
   ========================================================================== */

export function renderShariahDesk(sub, nav = {}) {
  /* Four of the menu's eight items are screens rather than sections, and they
     still travel under their old slugs. A slug that names a screen opens the
     screener on that screen; anything else is a tab. */
  const fromSub = shariahScreenForSub(sub);
  let tab = fromSub ? 'screener' : (TABS.some((item) => item.id === sub) ? sub : 'screener');
  let screen = fromSub
    ? fromSub.id
    : shariahScreen(new URLSearchParams(location.search).get('collection')).id;

  /* The screen has to be in the query before the rail is built, or the flyout
     marks nothing active. The page renders before the bar does, so writing it
     here is early enough — the same move the Quant desk makes. */
  if (tab === 'screener') remember({ collection: screen });

  const page = el('main', { class: 'mh-page qd-page sd-page', id: 'shariah-desk' });
  const views = {};
  const resources = new Set();
  const track = (node) => { resources.add(node); return node; };

  const navigation = el('nav', { class: 'mh-navigation', 'aria-label': 'Shariah sections' });
  const body = el('div', { class: 'qd-body' });

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'SHARIAH' }),
      el('h1', { class: 'qd-title', text: 'Halal screening' }),
      el('p', { class: 'qd-strap', text: 'Two balance-sheet ratios against market capitalisation '
        + 'and a test on the line of business, run across every listed US company over a billion '
        + 'dollars. Screened on AAOIFI’s limits, which are the strictest of the five published '
        + 'sets — a company clearing them clears the other four on these ratios as well.' }),
      el('div', { class: 'mh-hero__meta' }, [
        el('button', {
          type: 'button', class: `mh-connection ${hasApiKey() ? 'is-connected' : ''}`,
          text: hasApiKey() ? 'FMP connected' : 'Connect FMP',
          onclick: () => nav.openSettings?.(),
        }),
        el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
        el('span', { class: 'qd-meta', text: 'A mechanical screen, not a scholarly ruling' }),
      ]),
    ]),
    navigation, body,
  );

  navigation.replaceChildren(...TABS.map((item) => el('button', {
    type: 'button', 'data-tab': item.id, text: item.label,
    class: item.id === tab ? 'is-active' : '',
    onclick: () => setTab(item.id),
  })));

  function remember(changes) {
    try {
      const url = new URL(location.href);
      for (const [key, value] of Object.entries(changes)) {
        if (value == null || value === '') url.searchParams.delete(key);
        else url.searchParams.set(key, String(value));
      }
      history.replaceState(history.state, '', url);
    } catch { /* history unavailable */ }
  }

  function setTab(id) {
    tab = TABS.some((item) => item.id === id) ? id : 'screener';
    remember({ sub: tab, collection: tab === 'screener' ? screen : null });
    for (const button of navigation.querySelectorAll('[data-tab]')) {
      const active = button.dataset.tab === tab;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    views[tab] ||= track(buildTab(tab));
    body.replaceChildren(views[tab]);
    page.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  function buildTab(id) {
    if (id === 'screener') return screenerTab();
    if (id === 'methodology') return methodologyTab();
    if (id === 'purification') return purificationTab(nav);
    return changesTab(nav);
  }

  /* ---- the screener tab --------------------------------------------------- */

  function screenerTab() {
    const host = el('div', { class: 'qd-screener' });
    const rail = el('div', { class: 'qd-rail', role: 'tablist', 'aria-label': 'Shariah screens' });
    const intro = el('div', { class: 'qd-screen' });
    const table = el('div', { class: 'qd-table' });
    let live = null;

    const chips = SHARIAH_SCREENS.map((item) => el('button', {
      type: 'button', role: 'tab', 'data-screen': item.id,
      class: 'qd-chip', 'aria-selected': 'false', tabIndex: -1,
      onclick: () => choose(item.id),
    }, [
      el('span', { class: 'qd-chip__t', text: item.label }),
      el('span', { class: 'qd-chip__g', text: item.tag }),
    ]));
    rail.replaceChildren(...chips);

    rail.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1
        : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : 0;
      if (!step) return;
      event.preventDefault();
      const at = SHARIAH_SCREENS.findIndex((item) => item.id === screen);
      const next = step === 'first' ? 0 : step === 'last' ? chips.length - 1
        : (at + step + chips.length) % chips.length;
      chips[next].focus();
      choose(SHARIAH_SCREENS[next].id);
    });

    function choose(id) {
      screen = shariahScreen(id).id;
      remember({ collection: screen });
      draw();
    }

    function draw() {
      const item = shariahScreen(screen);
      const idea = IDEA_BY_ID[item.id] || null;
      document.title = `${item.label} — Maz Vantage`;

      for (const chip of chips) {
        const active = chip.dataset.screen === screen;
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-selected', String(active));
        chip.tabIndex = active ? 0 : -1;
      }

      intro.replaceChildren(...[
        el('div', { class: 'qd-screen__head' }, [
          el('h2', { class: 'qd-screen__t', text: item.label }),
          el('span', { class: 'qd-screen__tag', text: item.tag }),
        ]),
        el('p', { class: 'qd-screen__b', text: item.line }),
        idea?.rules?.length
          ? el('ul', { class: 'qd-rules', 'aria-label': 'The rules this screen applies' },
            idea.rules.map((rule, index) => el('li', {
              /* The first three are the compliance test itself and are the
                 same on every screen; the rest are what this one adds. Marked
                 rather than separated, so the funnel under the table still
                 reads in the order the rules are applied. */
              class: index < 3 ? 'qd-rules__core' : '',
              text: rule.label,
            })))
          : null,
        idea?.note ? el('p', { class: 'qd-screen__n', text: idea.note }) : null,
      ].filter(Boolean));

      live?.dispose?.();
      resources.delete(live);
      live = track(renderDedicatedScreener(nav, {
        kind: 'stocks', collection: screen, chrome: false, picker: false,
        onNavigate: (next) => {
          if (next.kind === 'etfs') { nav.goView?.('etfs', 'screener', next); return; }
          if (next.collection && next.collection !== screen
            && SHARIAH_SCREENS.some((s) => s.id === next.collection)) { choose(next.collection); return; }
          remember({ country: next.country });
          draw();
        },
      }));
      table.replaceChildren(live);
    }

    host.append(
      el('p', { class: 'qd-lede', text: 'Five screens over the same compliance universe. The '
        + 'first three rules are the compliance test and never change; each screen adds its own '
        + 'on top, so the funnel under the table reads "this many were compliant, then this many '
        + 'of those were also cheap".' }),
      rail, intro, table,
    );
    draw();
    host.dispose = () => live?.dispose?.();
    return host;
  }

  /* ---- go ----------------------------------------------------------------- */

  views[tab] = track(buildTab(tab));
  body.replaceChildren(views[tab]);
  navigation.querySelector(`[data-tab="${tab}"]`)?.setAttribute('aria-current', 'page');

  page.dispose = () => {
    for (const node of resources) node.dispose?.();
    resources.clear();
  };
  return page;
}

/* ==========================================================================
   The three reading tabs
   ========================================================================== */

const panel = (title, children, className = '') =>
  el('section', { class: `qd-panel ${className}`.trim(), 'aria-label': title }, [
    el('h2', { class: 'qd-panel__t', text: title }),
    ...[].concat(children).filter(Boolean),
  ]);

const grid = (heads, rows) => el('div', { class: 'qd-scroll' }, [
  el('table', { class: 'qd-grid' }, [
    el('thead', {}, [el('tr', {}, heads.map((head) => el('th', { scope: 'col', text: head })))]),
    el('tbody', {}, rows.map((row) => el('tr', {}, row.map((cell) =>
      el('td', {}, [cell instanceof Node ? cell : document.createTextNode(String(cell))]))))),
  ]),
]);

const percent = (value) => `${Math.round(value * 100)}%`;

function methodologyTab() {
  return el('div', { class: 'qd-read' }, [
    panel('The five published standards', [
      el('p', { class: 'qd-p', text: SHARIAH_INFO }),
      grid(['Standard', 'Debt limit', 'Liquid assets limit', 'Divided by'],
        SHARIAH_STANDARDS.map((standard) => [
          el('b', { text: standard.name }),
          percent(standard.debt),
          percent(standard.liquid),
          standard.divisor === 'assets' ? 'Total assets' : 'Market capitalisation',
        ])),
      el('p', { class: 'qd-note', text: 'The divisor is not a detail. Two of these five divide by '
        + 'total assets rather than by market capitalisation, which is a different test on the '
        + 'same company — a business trading well above book clears the market-cap version far '
        + 'more easily than the asset one. The screener runs AAOIFI’s pair, the tightest of the '
        + 'market-cap set, so a company passing here clears S&P’s and Dow Jones’s limits too. It '
        + 'says nothing about the two asset-based standards, and nothing about whether a provider '
        + 'would include the company: each of them runs tests this screen does not.' }),
    ]),

    panel('What the screen tests', [
      grid(['Test', 'How it is run here'], [
        ['Interest-bearing debt', 'Total debt from the balance sheet, divided by market '
          + 'capitalisation as the screener reports it today.'],
        ['Cash and interest-bearing securities', 'Cash and short-term investments over the same '
          + 'market capitalisation.'],
        ['Line of business', el('span', {}, ['A keyword test on the vendor’s sector and industry '
          + 'strings against ', el('b', { text: `${EXCLUDED_ACTIVITIES.length} excluded terms` }),
        '. It reads a classification, never the company’s actual revenue mix.']),
        ],
      ]),
    ]),

    panel('What it does not test, and why that matters', [
      el('p', { class: 'qd-warn', html: 'Three of the tests the index providers actually run are '
        + '<b>absent here</b>, and any one of them could exclude a company this screen passes.' }),
      grid(['Missing test', 'Why'], [
        ['Non-compliant income', 'The share of revenue from interest or from an excluded activity '
          + 'has to be read out of the filings line by line. The vendor publishes no such field, '
          + 'and a segment breakdown does not separate interest income.'],
        ['Receivables', 'Accounts receivable over market capitalisation, which AAOIFI caps. The '
          + 'balance-sheet field exists but the cap is applied on a basis this screen does not '
          + 'reproduce, so running it half-right would be worse than saying it is absent.'],
        ['An averaged market capitalisation', 'Providers use a trailing average — 24 or 36 months '
          + 'depending on the standard — rather than today’s price. A company can pass here and '
          + 'fail there purely on the day you looked.'],
      ]),
      el('p', { class: 'qd-note', text: 'This is why nothing on this desk says "compliant". It '
        + 'says the company clears the two ratios this screen can measure and is not in a line of '
        + 'business the keyword list catches. Verify against the provider before relying on it.' }),
    ]),
  ]);
}

function purificationTab(nav) {
  return el('div', { class: 'qd-read' }, [
    panel('Why a compliant company still pays some income that is not', [
      el('p', { class: 'qd-p', text: 'The ratio tests admit a company with some interest-bearing '
        + 'debt and some interest-bearing cash, because the limits are thresholds rather than '
        + 'zeroes. A company inside them still earns a little interest, and a share of any '
        + 'dividend it pays is that interest passed through.' }),
      el('p', { class: 'qd-p', text: 'Purification is the practice of giving that share away '
        + 'rather than keeping it. The share is the company’s non-compliant income over its total '
        + 'income, applied to the dividend received — which is the same figure this screen cannot '
        + 'measure, for the same reason it cannot run the income test.' }),
    ]),

    panel('What this product can and cannot give you', [
      grid(['You need', 'Where it comes from'], [
        ['The dividend you received', 'Your own records, or the company’s Dividends tab for the '
          + 'per-share amounts and dates.'],
        ['The non-compliant share of income', 'Not here. It is read out of the filings, and most '
          + 'index providers publish a purification ratio per constituent — that published figure '
          + 'is the one to use.'],
        ['The amount to purify', 'The two multiplied together. This desk can supply the first and '
          + 'never the second, so it does not print a total that would look authoritative.'],
      ]),
      el('div', { class: 'qd-actions' }, [
        el('button', { type: 'button', class: 'qd-btn qd-btn--primary',
          onclick: () => nav.goSymbolTab?.('Dividends') }, ['A company’s dividend record', arrow()]),
        el('button', { type: 'button', class: 'qd-btn',
          onclick: () => nav.goSymbolTab?.('Shariah Compliance') }, ['Its compliance tab', arrow()]),
      ]),
    ]),

    panel('Capital gains are a separate question', [
      el('p', { class: 'qd-p', text: 'Scholars differ on whether a gain on the share price needs '
        + 'purifying at all, and those who say it does differ on the basis. This desk takes no '
        + 'position: it is a screening tool, and the question is a ruling rather than a '
        + 'calculation.' }),
    ]),
  ]);
}

function changesTab(nav) {
  return el('div', { class: 'qd-read' }, [
    panel('Compliance changes', [
      el('p', { class: 'qd-warn', html: '<b>Not available.</b> A compliance change is the '
        + 'difference between today’s verdict and a previous one, and this app keeps no history — '
        + 'every screen you see is run in your browser from live feeds and discarded when you '
        + 'reload. There is nothing to compare against.' }),
      el('p', { class: 'qd-p', text: 'This one is worth having more than most, because both '
        + 'ratios move with the market price as well as with the balance sheet. A company can '
        + 'cross the debt limit without filing anything at all — its market capitalisation simply '
        + 'fell — which is exactly the change a holder would want to be told about.' }),
    ]),

    panel('What would make it work', [
      grid(['Piece', 'What it does'], [
        ['A nightly job', 'Runs the compliance test across the covered universe and writes one '
          + 'row per company per day: symbol, the two ratios, and the verdict.'],
        ['A table to write to', 'Anything that persists. The row is small — a few dozen bytes per '
          + 'company per day.'],
        ['A diff endpoint', 'Returns companies whose verdict changed between two dates, which is '
          + 'what this tab would render.'],
      ]),
      el('p', { class: 'qd-note', text: 'The same three pieces the Quant desk’s Rating Changes tab '
        + 'asks for, against the same missing database. Building it once would answer both.' }),
    ]),

    panel('Until then', [
      el('p', { class: 'qd-p', text: 'Re-run the screen. A company that has left the compliance '
        + 'universe is simply absent from it, and one that has entered is there — you cannot see '
        + 'the moment it happened, but the list itself is never stale.' }),
      el('div', { class: 'qd-actions' }, [
        el('button', { type: 'button', class: 'qd-btn qd-btn--primary',
          onclick: () => nav.goView?.('shariah', 'screener') }, ['Run the halal screener', arrow()]),
      ]),
    ]),
  ]);
}
