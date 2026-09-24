/* ==========================================================================
   Vanlior — the Quant desk

   `?view=quant`. One canvas, four tabs, and the rating at the centre of all
   of them:

     screener   eight screens over the whole market, in one table
     ratings    what the composite is and how the scale reads
     factors    the five factors and the ratios inside each
     changes    what a rating change would take, and why there is none

   ---------------------------------------------------------------------------
   Why this page is a screener and not a set of pages
   ---------------------------------------------------------------------------

   Every "Top X" on this menu is the same question with one word changed: rank
   the market on a score, show the top of the list. As five separate sections
   that was five near-identical pages, each with its own run button, that could
   not be compared — you could not get from Top Growth to Top Value without
   losing your filters and your place.

   As one table with the screen as a control, they are comparable by
   construction: the columns, the size floor, the country and the search box
   are the same on all eight, so switching screens changes the ranking and
   nothing else. That is the whole redesign.

   ---------------------------------------------------------------------------
   The eight screens are existing screens, not new ones
   ---------------------------------------------------------------------------

   Each one names a portfolio that already exists in `ideas.js` and is already
   reachable from Investment Ideas. Nothing here re-implements a screen, and
   nothing here defines a threshold that a portfolio page would disagree with.
   A screen renamed on this rail is the same screen under both names, which is
   the only way two menus can point at one ranking and stay honest about it.

   ---------------------------------------------------------------------------
   What this page cannot do, and says so
   ---------------------------------------------------------------------------

   Rating upgrades and downgrades need yesterday's rating. This app stores
   nothing between sessions — every score is computed in the browser from live
   feeds and discarded on reload — so the fourth tab is an explanation rather
   than a list. It stays on the rail because a reader who came looking for it
   deserves an accurate "this needs a database" rather than a quietly missing
   menu item.
   ========================================================================== */

import { el } from './util.js';
import { hasApiKey } from './fmp.js';
import { arrow } from './markethub-ui.js';
import { renderDedicatedScreener } from './screener.js';
import { IDEA_BY_KEY } from './ideas.js';
import { FACTOR_KEYS, FACTOR_BY_KEY } from './factors.js';
import { MAX_SCORE } from './grading.js';

/* ==========================================================================
   The eight screens
   ========================================================================== */

/**
 * The rail, in the order it reads.
 *
 * `id` is a screener preset, which is an idea in `ideas.js` under another
 * name. `line` is the one sentence printed on the chip and above the table;
 * the screen's full thesis and its rules come from the idea itself, so the
 * two can never drift.
 *
 * Order is deliberate. The composite first, because it is the rating this
 * page is named after. Then the five factors in the order the report itself
 * grades them, so a reader moving down the rail is moving down the report.
 * Then income, which is a condition on the composite rather than a factor of
 * it. Then the strictest screen the model can state, last because it is the
 * one that most often comes back nearly empty.
 */
export const QUANT_SCREENS = [
  { id: 'stocks-by-quant', label: 'Top Quant Stocks', tag: 'Composite', factor: null,
    line: 'Every company in the universe ranked by the composite, with no rule to pass first.' },
  { id: 'score-valuation', label: 'Top Valuation', tag: 'Value', factor: 'valuation',
    line: 'Priced in roughly the cheapest fifth of its own sector on the multiples and yields this report grades.' },
  { id: 'score-growth', label: 'Top Growth', tag: 'Growth', factor: 'growth',
    line: 'Growing faster than most of its sector on revenue, earnings, cash flow and book value.' },
  { id: 'score-profitability', label: 'Top Profitability', tag: 'Quality', factor: 'profitability',
    line: 'Margins at every level and returns on capital in the top of its sector.' },
  { id: 'score-health', label: 'Top Health', tag: 'Safety', factor: 'health',
    line: 'Liquidity, leverage and coverage together, in the top fifth of the sector.' },
  { id: 'score-momentum', label: 'Top Momentum', tag: 'Momentum', factor: 'momentum',
    line: 'Re-rated harder than its sector over three, six, nine and twelve months.' },
  { id: 'top-quant-dividend-stocks', label: 'Top Dividend', tag: 'Income', factor: null,
    line: 'Dividend payers that also rate well on the composite — the rating decides eligibility, the yield is a condition.' },
  { id: 'score-all-round', label: 'Top Signal Stocks', tag: 'All five', factor: null,
    line: 'Four out of five on all five factors at once. The strictest thing the model can say, and the rarest.' },
];

export const QUANT_SCREEN_IDS = QUANT_SCREENS.map((screen) => screen.id);
const DEFAULT_SCREEN = QUANT_SCREENS[0].id;
export const quantScreen = (id) =>
  QUANT_SCREENS.find((screen) => screen.id === id) || QUANT_SCREENS[0];

/** The tabs across the top, and which `sub` each answers to. */
const TABS = [
  { id: 'screener', label: 'Quant Screener' },
  { id: 'ratings', label: 'The Rating' },
  { id: 'factors', label: 'Factor Grades' },
  { id: 'changes', label: 'Rating Changes' },
];
/* Two menu items land on one tab: an upgrade and a downgrade are the same
   missing feature explained once, and two tabs saying the same paragraph
   would be worse than one that covers both. */
const TAB_ALIAS = { top: 'screener', upgrades: 'changes', downgrades: 'changes' };

/* ==========================================================================
   The page
   ========================================================================== */

export function renderQuantPage(sub, nav = {}) {
  const asked = TAB_ALIAS[sub] || sub;
  let tab = TABS.some((item) => item.id === asked) ? asked : 'screener';

  /* The screen has to be in the query before the rail is built, or the flyout
     marks nothing active on a bare `?view=quant`. `bootNavPage` renders this
     page before it builds the bar, so writing it here is early enough. Same
     move `renderMarketsPage` makes for the country. */
  let screen = quantScreen(new URLSearchParams(location.search).get('collection')).id;
  if (tab === 'screener') remember({ collection: screen });

  const page = el('main', { class: 'mh-page qd-page', id: 'quant-desk' });
  const views = {};
  const resources = new Set();
  const track = (node) => { resources.add(node); return node; };

  const navigation = el('nav', { class: 'mh-navigation', 'aria-label': 'Quant sections' });
  const body = el('div', { class: 'qd-body' });

  page.append(
    el('header', { class: 'mh-hero' }, [
      el('div', { class: 'mh-eyebrow', text: 'VANLIOR QUANT' }),
      el('h1', { class: 'qd-title', text: 'Quant ratings' }),
      el('p', { class: 'qd-strap', text: 'One number between 0 and 5, built from the bottom up: '
        + 'every ratio the data supports, ranked against the company’s own sector, rolled into '
        + 'five factors and then into a composite. These are the screens that rank on it.' }),
      el('div', { class: 'mh-hero__meta' }, [
        el('button', {
          type: 'button', class: `mh-connection ${hasApiKey() ? 'is-connected' : ''}`,
          text: hasApiKey() ? 'FMP connected' : 'Connect FMP',
          onclick: () => nav.openSettings?.(),
        }),
        el('span', { class: 'mh-meta-divider', 'aria-hidden': 'true', text: '·' }),
        el('span', { class: 'qd-meta', text: `${QUANT_SCREENS.length} screens · graded against the company’s own sector` }),
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
    remember({ sub: tab === 'screener' ? 'screener' : tab, collection: tab === 'screener' ? screen : null });
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
    if (id === 'ratings') return ratingsTab(nav);
    if (id === 'factors') return factorsTab(nav);
    return changesTab(nav);
  }

  /* ---- the screener tab --------------------------------------------------- */

  function screenerTab() {
    const host = el('div', { class: 'qd-screener' });
    const rail = el('div', { class: 'qd-rail', role: 'tablist', 'aria-label': 'Quant screens' });
    const intro = el('div', { class: 'qd-screen' });
    const table = el('div', { class: 'qd-table' });
    let live = null;

    const chips = QUANT_SCREENS.map((item) => {
      const chip = el('button', {
        type: 'button', role: 'tab', 'data-screen': item.id,
        class: 'qd-chip', 'aria-selected': 'false', tabIndex: -1,
        onclick: () => choose(item.id),
      }, [
        el('span', { class: 'qd-chip__t', text: item.label }),
        el('span', { class: 'qd-chip__g', text: item.tag }),
      ]);
      return chip;
    });
    rail.replaceChildren(...chips);

    rail.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1
        : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : 0;
      if (!step) return;
      event.preventDefault();
      const at = QUANT_SCREENS.findIndex((item) => item.id === screen);
      const next = step === 'first' ? 0 : step === 'last' ? chips.length - 1
        : (at + step + chips.length) % chips.length;
      chips[next].focus();
      choose(QUANT_SCREENS[next].id);
    });

    function choose(id) {
      screen = quantScreen(id).id;
      remember({ collection: screen });
      draw();
    }

    function draw() {
      const item = quantScreen(screen);
      const idea = IDEA_BY_KEY[item.id] || null;

      for (const chip of chips) {
        const active = chip.dataset.screen === screen;
        chip.classList.toggle('is-active', active);
        chip.setAttribute('aria-selected', String(active));
        chip.tabIndex = active ? 0 : -1;
      }

      // Filtered, because `replaceChildren` turns a null argument into the
      // literal word "null" where `el` would have dropped it.
      intro.replaceChildren(...[
        el('div', { class: 'qd-screen__head' }, [
          el('h2', { class: 'qd-screen__t', text: item.label }),
          el('span', { class: 'qd-screen__tag', text: item.tag }),
          idea && idea.title !== item.label
            ? el('span', { class: 'qd-screen__alias', title: 'The portfolio this screen is, under its own name',
              text: `also “${idea.title}”` })
            : null,
        ]),
        el('p', { class: 'qd-screen__b', text: item.line }),
        idea?.rules?.length
          ? el('ul', { class: 'qd-rules', 'aria-label': 'The rules this screen applies' },
            idea.rules.map((rule) => el('li', { text: rule.label })))
          : el('p', { class: 'qd-rules qd-rules--none', text: 'No rule to pass — this one is a ranking of the whole universe.' }),
        idea?.note ? el('p', { class: 'qd-screen__n', text: idea.note }) : null,
      ].filter(Boolean));

      /* The bar set the title from the menu item before this page rendered,
         and every screen here shares one menu slug — so the desk names the
         screen itself, or eight of them would all say "Top Quant Stocks". */
      document.title = `${item.label} — Vanlior`;

      live?.dispose?.();
      resources.delete(live);
      live = track(renderDedicatedScreener(nav, {
        kind: 'stocks', collection: screen, chrome: false, picker: false,
        /* A change of country or of filter stays on this desk: the rail above
           is the screen picker, so routing away to the stock screener would
           throw the reader out of the page they are working in. */
        onNavigate: (next) => {
          if (next.kind === 'etfs') { nav.goView?.('etfs', 'screener', next); return; }
          if (next.collection && next.collection !== screen
            && QUANT_SCREEN_IDS.includes(next.collection)) { choose(next.collection); return; }
          remember({ country: next.country });
          draw();
        },
      }));
      table.replaceChildren(live);
    }

    host.append(
      el('p', { class: 'qd-lede', text: 'Eight rankings over every listed US company above the '
        + 'size floor, each one graded on the way through against its own sector. Pick a screen; '
        + 'the columns, the filters and the search stay where they are.' }),
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

/** A panel with a heading and a body, in the canvas's own furniture. */
const panel = (title, children, className = '') =>
  el('section', { class: `qd-panel ${className}`.trim(), 'aria-label': title }, [
    el('h2', { class: 'qd-panel__t', text: title }),
    ...[].concat(children).filter(Boolean),
  ]);

const table = (heads, rows) => el('div', { class: 'qd-scroll' }, [
  el('table', { class: 'qd-grid' }, [
    el('thead', {}, [el('tr', {}, heads.map((head) => el('th', { scope: 'col', text: head })))]),
    el('tbody', {}, rows.map((row) => el('tr', {}, row.map((cell) =>
      el('td', {}, [cell instanceof Node ? cell : document.createTextNode(String(cell))]))))),
  ]),
]);

function ratingsTab(nav) {
  return el('div', { class: 'qd-read' }, [
    panel('What the number is', [
      el('p', { class: 'qd-p', text: 'The quant rating is one number between 0 and 5, with a '
        + 'letter and a verdict word beside it. It is built from the bottom up: every ratio the '
        + 'data supports is ranked as a percentile against the company’s own sector, those '
        + 'percentiles become grades, the grades average into five factor scores, and the five '
        + 'factors average into the composite.' }),
      el('p', { class: 'qd-p', text: 'It measures the company against its peers. Price multiples '
        + 'are part of it, inside the Valuation factor, so a company can be downgraded purely '
        + 'for getting more expensive. What never enters it is a fair value estimate — those are '
        + 'display-only throughout this report, by design, because a valuation is a set of '
        + 'assumptions the reader chooses rather than a fact about the business.' }),
    ]),

    panel('The scale', [
      table(['Score', 'Letter', 'Verdict', 'What it means'], [
        ['4.0 – 5.0', 'A− to A+', bandTag('Strong buy', 'strong'), 'Ranks in the top of its sector on most of what could be measured.'],
        ['3.0 – 4.0', 'B− to B+', bandTag('Buy', 'good'), 'Comfortably above the sector median across the factors.'],
        ['2.0 – 3.0', 'C− to C+', bandTag('Hold', 'mid'), 'Around the sector median — strong on some factors, weak on others.'],
        ['1.0 – 2.0', 'D− to D+', bandTag('Sell', 'weak'), 'Below the sector median on most measures.'],
        ['0.0 – 1.0', 'F', bandTag('Strong sell', 'poor'), 'Near the bottom of its sector on nearly everything measurable.'],
      ]),
      el('p', { class: 'qd-note', text: `Out of ${MAX_SCORE}. The bands are the same on every `
        + 'screen in the table next door, on every company report, and in the badge beside a '
        + 'ticker — one scale, printed the same way everywhere it appears.' }),
    ]),

    panel('What the rating is only as good as', [
      el('p', { class: 'qd-warn', html: 'The rating is a percentile against a sector '
        + 'distribution, so it is only as good as that distribution. The table shipped with this '
        + 'repo is <b>modelled rather than measured</b> until the sector-statistics builder has '
        + 'been run against real data — every rating carries that caveat, and the report says so '
        + 'wherever it prints one.' }),
      el('div', { class: 'qd-actions' }, [
        el('button', { type: 'button', class: 'qd-btn qd-btn--primary',
          onclick: () => nav.goSymbolTab?.('Research') }, ['See a rating on a company', arrow()]),
        el('button', { type: 'button', class: 'qd-btn',
          onclick: () => nav.goSymbolTab?.('Ratings') }, ['The full ratio ranking', arrow()]),
      ]),
    ]),
  ]);
}

const bandTag = (text, tone) => el('span', { class: `qd-band qd-band--${tone}`, text });

function factorsTab(nav) {
  return el('div', { class: 'qd-read' }, [
    panel('The five factors', [
      el('p', { class: 'qd-p', text: 'Each factor is a group of ratios asking one question about '
        + 'the company. A factor score is the mean of its graded ratios; the composite is the '
        + 'mean of the five. Each one also has a screen of its own in the table next door.' }),
      el('div', { class: 'qd-factors' }, FACTOR_KEYS.map((key) => {
        const factor = FACTOR_BY_KEY[key];
        const count = (factor.groups || []).reduce((total, group) => total + (group.metrics?.length || 0), 0);
        const screen = QUANT_SCREENS.find((item) => item.factor === key);
        return el('article', { class: 'qd-factor' }, [
          el('h3', { class: 'qd-factor__t', text: factor.title }),
          el('p', { class: 'qd-factor__q', text: (factor.question || factor.blurb || '')
            .replace(/\{SYM\}/g, 'a company') }),
          el('p', { class: 'qd-factor__m', text: count ? `${count} ratios graded against the sector` : 'Ratio count unavailable' }),
          screen ? el('button', { type: 'button', class: 'qd-factor__go',
            onclick: () => nav.goView?.('quant', 'screener', { collection: screen.id }) },
          [screen.label, arrow()]) : null,
          el('button', { type: 'button', class: 'qd-factor__alt',
            onclick: () => nav.goSymbolTab?.(factor.title) }, ['On a company report', arrow()]),
        ]);
      })),
    ]),

    panel('What a factor score does not say', [
      el('p', { class: 'qd-p', text: 'A ratio the data cannot fill is dropped from the mean '
        + 'rather than scored zero, and the count of what was actually graded prints beside '
        + 'every factor score on the report. A factor graded on four ratios and one graded on '
        + 'twenty are not the same measurement, and the report never pretends they are.' }),
      el('p', { class: 'qd-p', text: 'The screens on this page grade fewer ratios than a company '
        + 'report does — a screen runs across hundreds of companies and cannot pay for the full '
        + 'feed on each. Every result says how many were tested, and a rating on a company page '
        + 'is the deeper one where the two differ.' }),
    ]),
  ]);
}

function changesTab(nav) {
  return el('div', { class: 'qd-read' }, [
    panel('Rating upgrades and downgrades', [
      el('p', { class: 'qd-warn', html: '<b>Not available.</b> A rating change is the difference '
        + 'between today’s score and a previous one, and this app keeps no history — every rating '
        + 'you see is computed in your browser from live feeds and discarded when you reload. '
        + 'There is nothing to compare against.' }),
      el('p', { class: 'qd-p', text: 'This is a storage problem rather than a data problem. The '
        + 'ratings themselves are reproducible: run the screen today, store the score against the '
        + 'ticker and the date, run it again tomorrow, and the difference is the upgrade list. '
        + 'That needs somewhere to write to, which a static site does not have.' }),
    ]),

    panel('What would make it work', [
      table(['Piece', 'What it does'], [
        ['A nightly job', 'Runs the composite across the covered universe and writes one row per '
          + 'company per day: symbol, score, letter, the five factor scores.'],
        ['A table to write to', 'Anything that persists. The row is small — a few hundred bytes '
          + 'per company per day.'],
        ['A diff endpoint', 'Returns companies whose letter changed between two dates, which is '
          + 'what this tab would render.'],
      ]),
    ]),

    panel('The nearest honest substitute', [
      el('p', { class: 'qd-p', text: 'Analyst ratings coverage in Market News reports other '
        + 'people’s rating changes rather than ours — a different measurement, and labelled as '
        + 'one wherever it appears.' }),
      el('div', { class: 'qd-actions' }, [
        el('button', { type: 'button', class: 'qd-btn qd-btn--primary',
          onclick: () => nav.goView?.('news', 'ratings') }, ['Analyst ratings news', arrow()]),
        el('button', { type: 'button', class: 'qd-btn',
          onclick: () => nav.goView?.('quant', 'screener', { collection: DEFAULT_SCREEN }) },
        ['Today’s rankings', arrow()]),
      ]),
      el('p', { class: 'qd-note', text: 'The rankings are today’s, not a change in today’s. A '
        + 'company that joins the top of a screen between two visits may have improved or may '
        + 'simply have been sampled this time and not last — without stored history the page '
        + 'cannot tell you which, so it does not claim to.' }),
    ]),
  ]);
}
