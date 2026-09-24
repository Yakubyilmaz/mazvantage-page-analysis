/* ==========================================================================
   Vanlior — the Stock Screener pages

   One menu, one engine. Every list here is a screen over the market, graded
   on the way through by the same lite path the Investment Ideas page uses,
   plus the directory it all ranks and two pages that point elsewhere.

   Quant and Shariah used to share this file. Each is its own canvas now —
   `quant.js` and `shariahdesk.js` — because both were sets of near-identical
   run-a-screen pages, and as one table with the screen as a control they are
   comparable in a way separate pages never were. Nothing moved but the
   presentation: Quant runs the same entries in `ideas.js` these ones run, and
   the Shariah screens moved whole into `shariah-screens.js`, where
   `screener-presets.js` registers them so a desk's table can run them.

   Nothing here re-implements that engine. `runIdea()` and `renderIdeaResult()`
   in `ideas.js` do the work; this file defines the screens, maps a
   `(view, sub)` pair onto one, and adds the pages that are explanation rather
   than list.

   ---------------------------------------------------------------------------
   Why several sections point at an existing idea
   ---------------------------------------------------------------------------

   "Top Stocks" here and "Top Signal Stocks" on the Quant desk are the same
   question asked from two menus, and `score-all-round` already answers it.
   Rather than write a second screen that drifts from the first, both open the
   same one and say so. The alternative — near-duplicate screens with slightly
   different thresholds — is how a product ends up with two rankings that
   disagree and no way to say which is right.

   ========================================================================== */

import { el, num, price } from './util.js';
import { card, notice, ohead, table } from './ui.js';
import { IDEA_BY_KEY, runIdea, renderIdeaResult, LISTED, rule } from './ideas.js';
import { hasApiKey, fetchScreener } from './fmp.js';
import { marketTable, newTableState, STOCK_COLUMN_SETS } from './markettable.js';
import { pageHead } from './nav.js';
import { renderDedicatedScreener } from './screener.js';
import { renderEtfScreenerPage } from './etfscreener.js';
import { SHARIAH_STANDARDS, SHARIAH_INFO, EXCLUDED_ACTIVITIES } from './shariah.js';

/* ==========================================================================
   What each section runs
   ========================================================================== */

/**
 * `(view, sub)` -> a screen.
 *
 * `idea` names an existing entry in `IDEAS`; `build` returns a fresh one.
 * `also` is the sentence explaining why a section shares a screen with
 * another, printed above the result.
 */
const SCREENS = {
  'stocks/top': {
    idea: 'score-all-round',
    also: 'Stocks → Top Quant Stocks and Quant → Top Quant Stocks are the same destination under '
      + 'the same name, reached from two menus. One screen rather than two that could disagree.',
  },
  'stocks/wallstreet': {
    idea: 'top-wallstreet-stocks',
    also: 'The one screen in this menu that ranks on somebody else’s opinion. Every other list '
      + 'here is built from ratios this report measured; this is a tally of published analyst '
      + 'recommendations, put on the same 0-5 scale so it can be sorted. The two disagree often, '
      + 'and where they do, neither is evidence about the other.',
  },
  'stocks/growth': { idea: 'compounding-growth' },
  'stocks/value': { idea: 'us-value-top20' },
  'stocks/dividend': { idea: 'dividend-compounders' },

};

/* ==========================================================================
   The pages
   ========================================================================== */

export function renderStocksPage(sub, nav = {}) {
  const view = 'stocks';
  if (sub === 'all') return page(view, sub, nav, allStocksSection(nav));
  /* A link written before funds got their own menu can still say
     `?view=stocks&sub=screener&kind=etfs`. It means the ETF screener, so it
     opens the ETF screener rather than a stock page showing funds. */
  if ((!sub || sub === 'screener') && new URLSearchParams(location.search).get('kind') === 'etfs') {
    return renderEtfScreenerPage(sub, nav);
  }
  if (!sub || sub === 'screener') return renderDedicatedScreener(nav);
  if (sub === 'compare') return page(view, sub, nav, compareSection(nav));
  return page(view, sub, nav, screenSection(`${view}/${sub}`, nav));
}

function page(view, sub, nav, body) {
  return el('div', {}, [pageHead(view, sub, nav), body]);
}

/* ---------- running a screen ------------------------------------------------ */

/**
 * A screen, run live.
 *
 * These cost real quota — a screener call plus two to five per candidate —
 * so nothing runs until the reader asks. The button is the consent.
 */
function screenSection(routeKey, nav) {
  const spec = SCREENS[routeKey];
  if (!spec) {
    return el('div', { class: 'ovw' }, [
      card('scr-none', [
        ohead('Not available'),
        notice('No screen is defined for this section.'),
      ], 'ocard ovw__c12'),
    ]);
  }

  const idea = spec.idea ? IDEA_BY_KEY[spec.idea] : spec.build();
  const host = el('div');

  const draw = () => {
    if (!hasApiKey()) {
      host.replaceChildren(el('div', { class: 'ovw' }, [
        card('scr-key', [
          ohead(idea.title),
          el('p', { class: 'fgroup__desc', text: idea.thesis }),
          notice('This screen runs across the whole market and needs a live FMP connection. '
            + 'Add your API key in <code>Settings</code>. The bundled snapshot covers one '
            + 'company, so there is nothing to screen offline.'),
          rulesPreview(idea),
        ], 'ocard ovw__c12'),
      ]));
      return;
    }

    const progress = el('p', { class: 't-xs softer center' });
    const run = el('button', {
      type: 'button', class: 'btn btn--primary',
      text: `Run this screen`,
      onclick: async () => {
        run.disabled = true;
        run.textContent = 'Running…';
        const result = await runIdea(idea, {
          onProgress: (done, total) => {
            progress.textContent = `Testing ${done} of ${total} companies…`;
          },
        });
        host.replaceChildren(renderIdeaResult(result, nav));
      },
    });

    host.replaceChildren(el('div', { class: 'ovw' }, [
      card('scr-intro', [
        ohead(idea.title, idea.tag ? el('span', { class: 'pill pill--gold', text: idea.tag }) : null),
        el('p', { class: 'fgroup__desc', text: idea.thesis }),
        spec.also ? notice(spec.also) : null,
        rulesPreview(idea),
        el('div', { class: 'mt2' }, [run, progress]),
        el('p', { class: 't-tiny subtle mt2', text: 'Running this fetches the screener once and '
          + 'then several feeds per candidate, which is the expensive part. Results are cached '
          + 'for ten minutes.' }),
      ], 'ocard ovw__c12'),
    ]));
  };

  draw();
  return host;
}

function rulesPreview(idea) {
  if (!idea.rules?.length) return null;
  return el('div', { class: 'mt2' }, [
    el('p', { class: 'osub', text: 'The rules' }),
    el('ul', { class: 'rsrbul' }, idea.rules.map((r) => el('li', { text: r.label }))),
    idea.note ? el('p', { class: 't-tiny subtle mt2', text: idea.note }) : null,
  ]);
}

/* ---------- Stocks → Stock Screener ----------------------------------------- */

/**
 * The screener, pointed at Investment Ideas.
 *
 * This **was** a deliberate non-build, on the argument that a blank query
 * builder is worse than a set of screens that explain their own thresholds.
 * The query builder now exists: every portfolio page renders its rules as
 * controls, so picking a field, an operator and a number is a thing this
 * product does — it just starts from a portfolio rather than from nothing,
 * and clearing that portfolio's rules leaves the blank form.
 *
 * So this page still points at Investment Ideas, but for a different reason.
 * It is no longer "we did not build that"; it is "the screener is over there,
 * and it opens with something in it".
 */
function screenerSection(nav) {
  return el('div', { class: 'ovw' }, [
    card('scr-screener', [
      ohead('Stock screener'),
      el('p', { class: 'fgroup__desc', text: 'The screener lives on Investment Ideas. Open any '
        + 'portfolio and its rules are controls: change a threshold, drop a rule, add one from '
        + 'forty metrics, and run it again across every listed US company over the size floor '
        + 'you set. Every result is graded on the way through against its own sector.' }),

      el('div', { class: 'mt2' }, [
        el('button', {
          type: 'button', class: 'btn btn--primary',
          text: 'Open the portfolios →',
          onclick: () => nav.goView?.('ideas', 'all'),
        }),
        el('button', {
          type: 'button', class: 'btn',
          text: 'Start from an empty screen',
          title: 'Opens the all-factor portfolio with its rules cleared',
          onclick: () => nav.goIdea?.('score-all-round', { f: '' }),
        }),
      ]),

      el('p', { class: 't-tiny subtle mt3', text: 'Starting from a portfolio rather than from a '
        + 'blank form is deliberate: a screen arrives with its thresholds already argued for, and '
        + 'clearing them is one click if you would rather not have them. What no screener here '
        + 'can do is filter on the vendor’s side beyond size and sector — everything else runs '
        + 'in your browser over a capped sample, and every result says how big that sample was.' }),
    ], 'ocard ovw__c12'),
  ]);
}

/* ---------- Stocks → Stock Comparison --------------------------------------- */

/**
 * Comparison, pointed at the peer table.
 *
 * Same reasoning as the screener: the company report already compares a
 * company against its peers on every ratio, with sector percentiles behind
 * each. A standalone two-ticker comparison would duplicate that with less
 * context.
 */
function compareSection(nav) {
  return el('div', { class: 'ovw' }, [
    card('scr-compare', [
      ohead('Stock comparison'),
      el('p', { class: 'fgroup__desc', text: 'Every company report carries a peer comparison: the '
        + 'vendor’s peer set with market cap, multiples and this report’s own composite score for '
        + 'each, plus a full ratio-by-ratio ranking against the sector on the Ratings tab.' }),

      el('div', { class: 'mt2' }, [
        el('button', {
          type: 'button', class: 'btn btn--primary',
          text: 'Open the peer comparison →',
          onclick: () => nav.goSymbolTab?.('Research'),
        }),
        el('button', {
          type: 'button', class: 'btn btn--ghost',
          text: 'Or the full ratio ranking',
          onclick: () => nav.goSymbolTab?.('Ratings'),
        }),
      ]),

      el('p', { class: 't-tiny subtle mt3', text: 'A side-by-side of two arbitrary tickers is not '
        + 'built. It would need every ratio fetched twice and would still say less than one '
        + 'company’s sector percentile does, because two companies agreeing tells you nothing '
        + 'about whether either is good.' }),
    ], 'ocard ovw__c12'),
  ]);
}

/* ---------- Stocks → All Stocks ---------------------------------------------

   The directory: every listing the screener returns for the US market, in the
   dense table the ETF directory uses. One request buys the whole list — the
   screener answers with name, size, price, sector and exchange in a single
   call — and the column tabs beyond Overview cost two to five requests *per
   company*, which is why `marketTable` loads only the rows on screen when a
   tab is opened and says what that costs first.

   Search is local, over the rows already in hand, so typing costs nothing.
   -------------------------------------------------------------------------- */

function allStocksSection(nav) {
  const host = el('div', { class: 'ovw' });

  if (!hasApiKey()) {
    host.append(card('all-key', [
      ohead('All stocks'),
      el('p', { class: 'fgroup__desc', text: 'Every US-listed company the vendor returns, with '
        + 'its size, price and sector. A directory — the screens on this menu are the ones that '
        + 'rank it.' }),
      notice('<b>The listing directory</b> is market-wide data and needs a live FMP connection. '
        + 'Add your API key in <code>Settings</code>. The bundled snapshot covers one company, so '
        + 'there is nothing to fall back to here.'),
    ], 'ocard ovw__c12'));
    return host;
  }

  host.append(card('all-loading', [
    el('div', { class: 'sk sk--line', style: { width: '200px', height: '22px' } }),
    el('div', { class: 'sk sk--block', style: { marginTop: '16px' } }),
  ], 'ocard ovw__c12'));

  const state = { q: '', sector: '', table: newTableState(STOCK_COLUMN_SETS) };

  fetchScreener({ ...LISTED, marketCapMoreThan: 0 })
    .then((res) => {
      if (res.status !== 'ok') {
        host.replaceChildren(card('all-err', [
          ohead('All stocks'),
          notice(`The listing directory could not be loaded — ${res.message || res.status}.`,
            'notice--error'),
        ], 'ocard ovw__c12'));
        return;
      }
      const companies = (res.data || []).filter((r) => r?.symbol && !r.isEtf && !r.isFund);
      const sectors = [...new Set(companies.map((r) => r.sector).filter(Boolean))].sort();
      const draw = () => host.replaceChildren(
        directoryCard(companies, companies.length, sectors, state, draw, nav));
      draw();
    })
    .catch((err) => host.replaceChildren(card('all-err', [
      ohead('All stocks'),
      notice(`The listing directory could not be loaded — ${String(err.message)}.`, 'notice--error'),
    ], 'ocard ovw__c12')));

  return host;
}

function directoryCard(companies, listingCount, sectors, state, redraw, nav) {
  const q = state.q.trim().toLowerCase();
  const rows = companies.filter((c) => (!state.sector || c.sector === state.sector)
    && (!q || (c.symbol || '').toLowerCase().includes(q)
      || (c.companyName || '').toLowerCase().includes(q)));

  /* The input is rebuilt with the card, so focus and caret position have to be
     put back by hand — without it the field loses focus after every keystroke,
     which makes the search unusable at exactly the moment it is being used. */
  const search = el('input', {
    type: 'search', class: 'pfsearch__i', id: 'all-q', value: state.q,
    placeholder: 'Symbol or company name…', autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'Search companies',
  });
  search.addEventListener('input', () => {
    state.q = search.value; state.table.page = 1; redraw();
    const next = document.getElementById('all-q');
    if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
  });

  const sector = el('select', {
    class: 'pfsearch__i', 'aria-label': 'Sector',
    onchange: (e) => { state.sector = e.target.value; state.table.page = 1; redraw(); },
  }, [el('option', { value: '', text: 'Every sector' }),
    ...sectors.map((s) => el('option', { value: s, text: s }))]);
  sector.value = state.sector;

  return card('all-dir', [
    el('div', { class: 'pfhead' }, [
      el('div', {}, [
        el('h2', { class: 'pfhead__t', text: 'All stocks' }),
        el('p', { class: 'pfhead__b', text: 'Every US-listed company the vendor returns. A '
          + 'directory rather than a screen — nothing here is filtered on quality, and nothing '
          + 'is ranked. The screens on this menu are what rank it.' }),
      ]),
      el('div', { class: 'pfsearch' }, [search, sector]),
    ]),

    el('div', { class: 'asbar' }, [
      el('p', { class: 'rfbar__n' }, [
        el('b', { text: num(rows.length, 0) }), ` compan${rows.length === 1 ? 'y' : 'ies'}`,
        rows.length === listingCount ? '' : ` of ${num(listingCount, 0)}`,
      ]),
    ]),

    marketTable({
      rows,
      sets: STOCK_COLUMN_SETS,
      state: state.table,
      identity: (c) => el('button', {
        type: 'button', class: 'mtid', title: c.companyName,
        onclick: () => nav.goSymbol?.(c.symbol),
      }, [
        el('span', { class: 'mtid__s', text: c.symbol }),
        el('span', { class: 'mtid__n', text: c.companyName || '' }),
      ]),
      emptyText: 'No company matches that.',
    }),

    notice('One screener call returns this whole list, which is why the Overview columns are '
      + 'free. Every other column set is two to five requests <b>per company</b>, so opening one '
      + 'loads the rows on screen and nothing else — the table says what it is about to spend '
      + 'before it spends it.'),
  ], 'ocard ovw__c12');
}
