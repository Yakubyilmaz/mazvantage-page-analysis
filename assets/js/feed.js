/* ==========================================================================
   Maz Vantage — the Research feed and the pieces it is built from

   Two things live here: the reusable article components, and the `/research`
   feed page that assembles them.

   ---------------------------------------------------------------------------
   The filter state is the URL. There is no other copy of it.
   ---------------------------------------------------------------------------

   Every pill, chip, select and page link in this file does exactly one thing:
   it computes a new query object and hands it to `nav.goQuery`, which pushes a
   URL and re-renders. Nothing here holds a filter in a variable, and nothing
   here re-filters a list it is already holding.

   That is what buys three properties for free: a filtered feed is shareable by
   copying the address bar, the browser's back button steps back through
   filters, and a link like `?view=research&category=shariah&type=shariah-idea`
   is a landing page rather than a redirect to an unfiltered feed.

   The one exception is `moreOpen` below — whether the extra-filters drawer is
   expanded. That is a preference about the furniture, not about the results,
   and putting it in the URL would mean every shared link also shared the state
   of somebody's disclosure triangle.

   ---------------------------------------------------------------------------
   Why the card never prints every field it has
   ---------------------------------------------------------------------------

   An article carries a category, a type, up to eight tickers, sectors,
   industries, themes, a quant score, a Shariah status, an author, a reading
   time and two dates. A card that printed all of that would be a table row
   with ambitions. The card prints the four things a reader scanning a feed
   actually decides on — who it is about, what kind of piece it is, how old it
   is, and the two ratings — and the article page has the rest.
   ========================================================================== */

import { el, ago } from './util.js';
import { card, notice, ohead, logo } from './ui.js';
import { logoUrl } from './fmp.js';
import { pageHead } from './nav.js';
import {
  CATEGORIES, TOPIC_PILLS, THEMES, SORTS, SECTORS, QUANT_FILTERS, SHARIAH_FILTERS,
  CATEGORY_BY_KEY, typePath, quantVerdict, quantTone, shariahLabel, shariahTone,
  mergeQuery, activeChips, isFiltered,
} from './taxonomy.js';
import {
  loadArticles, articlesReady, queryArticles, companyName, articleUrl,
  SAMPLE_NOTICE, PER_PAGE,
} from './articles.js';

/**
 * Is the extra-filters drawer expanded?
 *
 * Module-level rather than in the URL, and module-level rather than in the
 * page, because the page is rebuilt on every filter click and a drawer that
 * closed itself each time you used it would be unusable. Modules are evaluated
 * once, so this survives every navigation inside the session and nothing else.
 */
let moreOpen = false;

/* ==========================================================================
   1. The small reusable pieces
   ========================================================================== */

/**
 * A ticker, as a link to that company's report.
 *
 * The load-bearing half of the internal-linking graph. Every ticker printed
 * anywhere in the feed goes through this, so an article always offers a route
 * into the company data behind it and never renders a ticker as dead text.
 */
export function tickerLink(ticker, nav = {}, { tab = null, withName = false } = {}) {
  const name = companyName(ticker);
  return el('button', {
    type: 'button', class: 'tkr',
    title: `Open the ${name} report`,
    onclick: (e) => { e.stopPropagation(); nav.goSymbolTab?.(tab, ticker); },
  }, [
    // The vendor has a logo for most listed companies and not for all of them.
    // A pill that already prints the ticker gains nothing from a letter square,
    // so a symbol without an image is a pill without one.
    logo(logoUrl(ticker), ticker, { size: 'xs', fallback: 'none' }),
    el('b', { text: ticker }),
    withName && name !== ticker ? el('span', { text: name }) : null,
  ].filter(Boolean));
}

/**
 * The quant score badge.
 *
 * Score, then the word for it — never the word alone. The word is five bands
 * over a continuous score, so "Buy" spans 3.00 to 3.99 and a reader who sees
 * only the word cannot tell 3.02 from 3.98. Printing both costs four
 * characters.
 */
export function quantBadge(score, letter = null, { compact = false } = {}) {
  if (typeof score !== 'number') return null;
  const word = quantVerdict(score);
  return el('span', {
    class: `qchip is-${quantTone(score)}`,
    title: `Vantace quant composite: ${score.toFixed(2)} of 5${letter ? ` (${letter})` : ''} — ${word}`,
  }, [
    el('i', { text: 'Quant' }),
    el('b', { text: score.toFixed(2) }),
    compact ? null : el('span', { text: word }),
  ]);
}

/**
 * The Shariah badge.
 *
 * Prints the pass count beside the word wherever it is known, because the word
 * is *defined* as that count — see `shariahStatusFromCounts` in taxonomy.js —
 * and the count is the thing a reader following one particular methodology
 * needs. "Questionable" on its own hides that it means three standards passed
 * and two did not.
 */
export function shariahBadge(status, { passed = null, of = null } = {}) {
  const label = shariahLabel(status);
  if (!label) return null;
  const count = passed != null && of != null ? `${passed}/${of}` : null;
  return el('span', {
    class: `schip is-${shariahTone(status)}`,
    title: count
      ? `${label} — passes ${passed} of ${of} published screening methodologies`
      : `${label} — mechanical screen, not a scholarly ruling`,
  }, [
    el('i', { text: 'Shariah' }),
    el('b', { text: label }),
    count ? el('span', { text: count }) : null,
  ]);
}

/**
 * One article, as a feed card.
 *
 * The whole card is a link. Anchors rather than a clickable div, so the
 * browser's own affordances work — middle-click, copy link address, and the
 * status bar showing where it goes. The ticker buttons inside stop
 * propagation, which is why they are buttons: a link inside a link is invalid
 * HTML and browsers resolve it unpredictably.
 */
export function articleCard(a, nav = {}) {
  const meta = [
    el('span', { class: 'acard__type', text: typePath(a) }),
    el('span', { class: 'acard__dot', text: '·' }),
    el('time', { datetime: a.publishedAt, text: ago(a.publishedAt) }),
    a.readingMinutes ? el('span', { class: 'acard__dot', text: '·' }) : null,
    a.readingMinutes ? el('span', { text: `${a.readingMinutes} min read` }) : null,
  ];

  const badges = [
    quantBadge(a.quantRating, a.quantLetter),
    shariahBadge(a.shariahStatus, { passed: a.standardsPassed, of: a.standardsOf }),
  ].filter(Boolean);

  return el('article', { class: 'acard' }, [
    a.tickers.length ? el('div', { class: 'acard__tickers' },
      a.tickers.slice(0, 3).map((t) => tickerLink(t, nav, { withName: a.tickers.length === 1 }))
        .concat(a.tickers.length > 3
          ? [el('span', { class: 'acard__more', text: `+${a.tickers.length - 3}` })]
          : [])) : null,

    el('a', { class: 'acard__title', href: articleUrl(a.slug), onclick: openArticle(a, nav) },
      [a.title]),

    a.summary ? el('p', { class: 'acard__sum', text: a.summary }) : null,

    el('div', { class: 'acard__meta' }, meta),
    badges.length ? el('div', { class: 'acard__badges' }, badges) : null,
  ]);
}

/**
 * The compact variant: a headline and its meta, no summary.
 *
 * Used by Related Research and by anything on a company surface that wants to
 * list research without giving it a column. Same link semantics as the card.
 */
export function articleRow(a, nav = {}) {
  return el('a', {
    class: 'arow', href: articleUrl(a.slug), onclick: openArticle(a, nav),
  }, [
    el('span', { class: 'arow__t', text: a.title }),
    el('span', { class: 'arow__m' }, [
      el('span', { text: typePath(a) }),
      el('span', { class: 'acard__dot', text: '·' }),
      el('time', { datetime: a.publishedAt, text: ago(a.publishedAt) }),
    ]),
  ]);
}

/**
 * The click handler every article link shares.
 *
 * Real `href`s, intercepted. A plain click routes in-app; a modifier click is
 * left alone so ctrl/cmd-click opens a new tab, which is how anyone reads a
 * feed.
 */
function openArticle(a, nav) {
  return (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    nav.goQuery?.('research', 'article', { slug: a.slug });
  };
}

/* ==========================================================================
   2. The filter controls
   ========================================================================== */

/**
 * One pill. `count` prints beside the label where the facet is known.
 *
 * The explicit `aria-label` is not redundant with the visible text. The count
 * renders as a bare number beside the label, so the computed name would be
 * "Earnings 5" — and where a `title` carries the category's description, that
 * description wins the accessible name outright and a screen reader announces
 * a sentence instead of a control. Naming it here settles both.
 */
function pill(label, { active = false, count = null, onclick, title = null }) {
  return el('button', {
    type: 'button',
    class: `fpill ${active ? 'is-active' : ''}`.trim(),
    'aria-pressed': active ? 'true' : 'false',
    'aria-label': count == null ? label : `${label}, ${count} article${count === 1 ? '' : 's'}`,
    title,
    onclick,
  }, [
    el('span', { text: label }),
    count != null ? el('i', { class: 'fpill__n', text: String(count) }) : null,
  ]);
}

/**
 * The primary row: All, then the seven categories.
 *
 * Counts come from `facets`, which is computed with every filter *except* the
 * category applied — so the numbers say "how much of what you have already
 * filtered to is in this category", which is the only reading that stays true
 * as other filters are added.
 */
function categoryPills(query, facets, nav) {
  const go = (category) => () => nav.goQuery?.('research', 'latest',
    mergeQuery(query, { category }));

  return el('div', { class: 'fpills', role: 'group', 'aria-label': 'Research categories' }, [
    pill('All', { active: !query.category, count: facets.all, onclick: go(null) }),
    ...CATEGORIES.map((c) => pill(c.label, {
      active: query.category === c.key,
      count: facets[c.key],
      title: c.blurb,
      onclick: go(c.key),
    })),
  ]);
}

/**
 * The secondary row: the chosen category's article types.
 *
 * Only rendered once a category is chosen. Seven categories' types at once is
 * thirty-eight pills, which is the thing the spec for this page most wanted to
 * avoid — the full set is still reachable, from the grouped select in the
 * drawer.
 */
function typePills(query, nav) {
  const cat = CATEGORY_BY_KEY[query.category];
  if (!cat) return null;

  const go = (type) => () => nav.goQuery?.('research', 'latest', mergeQuery(query, { type }));

  return el('div', { class: 'fpills fpills--sub', role: 'group', 'aria-label': `${cat.label} types` }, [
    pill(`All ${cat.label}`, { active: !query.type, onclick: go(null) }),
    ...cat.types.map((t) => pill(t.label, { active: query.type === t.key, onclick: go(t.key) })),
  ]);
}

/**
 * The topic row: shortcuts that are each just a query.
 *
 * Mixed deliberately — a theme, a sector, an industry and a type sit side by
 * side — because a reader scanning shortcuts is not thinking in the data
 * model's terms. Nothing here has its own code path; `TOPIC_PILLS` is data.
 */
function topicPills(query, nav) {
  const on = (q) => Object.entries(q).every(([k, v]) => query[k] === v);

  return el('div', { class: 'fpills fpills--topic', role: 'group', 'aria-label': 'Topics' },
    TOPIC_PILLS.map((t) => pill(t.label, {
      active: on(t.query),
      onclick: () => nav.goQuery?.('research', 'latest',
        // A second click on an active shortcut clears it, which is what a
        // toggle-looking control has to do.
        mergeQuery(query, on(t.query)
          ? Object.fromEntries(Object.keys(t.query).map((k) => [k, null]))
          : t.query)),
    }))
    .concat([el('button', {
      type: 'button',
      class: `fpill fpill--more ${moreOpen ? 'is-open' : ''}`.trim(),
      'aria-expanded': moreOpen ? 'true' : 'false',
      'aria-controls': 'research-more',
      onclick: (e) => {
        moreOpen = !moreOpen;
        const panel = document.getElementById('research-more');
        if (panel) panel.hidden = !moreOpen;
        e.currentTarget.setAttribute('aria-expanded', moreOpen ? 'true' : 'false');
        e.currentTarget.classList.toggle('is-open', moreOpen);
      },
    }, [el('span', { text: 'More filters' }), caret()])]));
}

function caret() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'fpill__c');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M6 9l6 6 6-6');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '2');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}

/** A labelled select that writes one query key. */
function filterSelect(label, key, options, query, nav, { placeholder = 'Any' } = {}) {
  const id = `rf-${key}`;
  const sel = el('select', {
    id, class: 'fsel__i',
    onchange: (e) => nav.goQuery?.('research', 'latest',
      mergeQuery(query, { [key]: e.target.value || null })),
  }, [
    el('option', { value: '', text: placeholder }),
    ...options.map((o) => el('option', {
      value: o.value, text: o.label, selected: query[key] === o.value ? true : null,
    })),
  ]);
  // `selected` as an attribute is ignored once the element is live in some
  // paths, so set the property too. Cheap, and the alternative is a select
  // that silently resets to "Any" on every render.
  sel.value = query[key] || '';

  return el('div', { class: 'fsel' }, [
    el('label', { class: 'fsel__l', for: id, text: label }),
    sel,
  ]);
}

/**
 * The drawer: everything that is a filter but not a pill.
 *
 * Grouped into the three questions a reader asks separately — what is it
 * about, what does the company look like, and free text. The article-type
 * select is grouped by category so every one of the thirty-eight types is
 * reachable without the category being chosen first.
 */
function moreFilters(query, nav, { industries }) {
  const typeOptions = el('select', {
    id: 'rf-type', class: 'fsel__i',
    onchange: (e) => nav.goQuery?.('research', 'latest',
      mergeQuery(query, { type: e.target.value || null })),
  }, [
    el('option', { value: '', text: 'Any type' }),
    ...CATEGORIES.map((c) => el('optgroup', { label: c.label },
      c.types.map((t) => el('option', { value: t.key, text: t.label })))),
  ]);
  typeOptions.value = query.type || '';

  const search = el('input', {
    type: 'search', id: 'rf-q', class: 'fsel__i',
    placeholder: 'Headline or company…', value: query.q || '',
    autocomplete: 'off', spellcheck: 'false',
  });
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    nav.goQuery?.('research', 'latest', mergeQuery(query, { q: search.value.trim() || null }));
  });

  const ticker = el('input', {
    type: 'search', id: 'rf-ticker', class: 'fsel__i',
    placeholder: 'e.g. NVDA', value: query.ticker || '',
    autocomplete: 'off', spellcheck: 'false',
  });
  ticker.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    nav.goQuery?.('research', 'latest',
      mergeQuery(query, { ticker: ticker.value.trim().toUpperCase() || null }));
  });

  return el('div', {
    class: 'fmore', id: 'research-more', hidden: !moreOpen,
  }, [
    el('div', { class: 'fmore__grp' }, [
      el('p', { class: 'fmore__h', text: 'What it is about' }),
      el('div', { class: 'fmore__row' }, [
        el('div', { class: 'fsel' }, [
          el('label', { class: 'fsel__l', for: 'rf-type', text: 'Article type' }),
          typeOptions,
        ]),
        filterSelect('Sector', 'sector', SECTORS.map((s) => ({ value: s, label: s })), query, nav,
          { placeholder: 'Any sector' }),
        filterSelect('Industry', 'industry', industries.map((s) => ({ value: s, label: s })), query, nav,
          { placeholder: 'Any industry' }),
        filterSelect('Theme', 'theme', THEMES.map((t) => ({ value: t.key, label: t.label })), query, nav,
          { placeholder: 'Any theme' }),
      ]),
    ]),

    el('div', { class: 'fmore__grp' }, [
      el('p', { class: 'fmore__h', text: 'What the company looks like' }),
      el('div', { class: 'fmore__row' }, [
        filterSelect('Quant rating', 'rating',
          QUANT_FILTERS.map((r) => ({ value: r.key, label: r.label })), query, nav,
          { placeholder: 'Any rating' }),
        filterSelect('Shariah status', 'shariah',
          SHARIAH_FILTERS.map((s) => ({ value: s.key, label: s.label })), query, nav,
          { placeholder: 'Any status' }),
        el('div', { class: 'fsel' }, [
          el('label', { class: 'fsel__l', for: 'rf-ticker', text: 'Ticker' }),
          ticker,
        ]),
        el('div', { class: 'fsel' }, [
          el('label', { class: 'fsel__l', for: 'rf-q', text: 'Search' }),
          search,
        ]),
      ]),
      el('p', { class: 'fmore__n', text: 'Search covers the headline, subtitle, summary and company '
        + 'names — not the article body, which is not loaded for a feed row. Press Enter to apply.' }),
    ]),
  ]);
}

/** The removable-chip row, plus Clear all. */
function chipRow(query, nav) {
  const chips = activeChips(query);
  if (!chips.length) return null;

  return el('div', { class: 'fchips' }, [
    ...chips.map((c) => el('button', {
      type: 'button', class: 'fchip',
      'aria-label': `Remove filter ${c.label}`,
      onclick: () => nav.goQuery?.('research', 'latest', mergeQuery(query, { [c.key]: null })),
    }, [el('span', { text: c.label }), el('i', { text: '×', 'aria-hidden': 'true' })])),

    el('button', {
      type: 'button', class: 'fchip fchip--clear',
      text: 'Clear all',
      onclick: () => nav.goQuery?.('research', 'latest', { sort: query.sort }),
    }),
  ]);
}

/** Latest / Popular / Top Quant. */
function sortControl(query, nav) {
  return el('div', { class: 'rangesel', role: 'group', 'aria-label': 'Sort' },
    SORTS.map((s) => el('button', {
      type: 'button',
      class: query.sort === s.key ? 'is-active' : '',
      'aria-pressed': query.sort === s.key ? 'true' : 'false',
      text: s.label,
      onclick: () => nav.goQuery?.('research', 'latest', mergeQuery(query, { sort: s.key })),
    })));
}

/**
 * Pagination.
 *
 * Deliberately previous/next plus a position rather than a numbered strip: the
 * store returns a page and a total, and a numbered strip on a feed that will
 * eventually run to hundreds of pages is a row of numbers nobody clicks.
 */
function pager(result, query, nav) {
  if (result.pages <= 1) return null;
  const go = (page) => () => {
    nav.goQuery?.('research', 'latest', { ...query, page });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return el('nav', { class: 'fpager', 'aria-label': 'Feed pages' }, [
    el('button', {
      type: 'button', class: 'btn', text: '← Newer',
      disabled: result.page <= 1 ? true : null, onclick: go(result.page - 1),
    }),
    el('span', { class: 'fpager__n', text: `Page ${result.page} of ${result.pages}` }),
    el('button', {
      type: 'button', class: 'btn', text: 'Older →',
      disabled: result.page >= result.pages ? true : null, onclick: go(result.page + 1),
    }),
  ]);
}

/* ==========================================================================
   3. The page
   ========================================================================== */

/**
 * `?view=research&sub=latest` — the feed.
 *
 * Synchronous when the store is already in memory, which it is on every render
 * after the first. The store is fetched once per session; putting a skeleton
 * on screen between two identical feeds every time somebody clicks a pill
 * would be the wrong trade.
 */
export function renderResearchFeed(query, nav = {}) {
  const host = el('div', { class: 'ovw' });

  const draw = () => host.replaceChildren(...feedBody(query, nav));

  if (articlesReady()) draw();
  else {
    host.append(loadingCard());
    loadArticles().then(draw);
  }

  return el('div', {}, [
    pageHead('research', 'latest', nav),
    host,
  ]);
}

function loadingCard() {
  return card('rf-loading', [
    el('div', { class: 'sk sk--line', style: { width: '240px', height: '22px' } }),
    el('div', { class: 'sk sk--block', style: { marginTop: '16px' } }),
  ], 'ocard ovw__c12');
}

function feedBody(query, nav) {
  const all = articlesReady() || [];
  const result = queryArticles(query, { perPage: PER_PAGE, list: all });

  // Offered industries come from the loaded set rather than from the company
  // directory, so the select never lists an industry that would return
  // nothing.
  const industries = [...new Set(all.flatMap((a) => a.industries))].sort();

  return [
    card('rf-filters', [
      el('div', { class: 'rfhead' }, [
        el('div', {}, [
          el('h2', { class: 'rfhead__t', text: 'Latest Research' }),
          // One line. `pageHead` above has already described the section; two
          // stacked descriptions is the thing that makes a page feel padded.
          el('p', { class: 'rfhead__b', text: 'News says what happened. Research says what it '
            + 'means for the numbers.' }),
        ]),
      ]),

      categoryPills(query, result.facets, nav),
      typePills(query, nav),
      topicPills(query, nav),
      moreFilters(query, nav, { industries }),
      chipRow(query, nav),
    ], 'ocard ovw__c12 rfcard'),

    card('rf-notice', [notice(SAMPLE_NOTICE)], 'ocard ovw__c12 ovw--tight'),

    card('rf-feed', [
      el('div', { class: 'rfbar' }, [
        el('p', { class: 'rfbar__n' }, [
          el('b', { text: String(result.total) }),
          ` article${result.total === 1 ? '' : 's'}`,
          isFiltered(query) ? ' matching these filters' : '',
        ]),
        sortControl(query, nav),
      ]),

      result.total
        ? el('div', { class: 'afeed' }, result.items.map((a) => articleCard(a, nav)))
        : emptyState(query, nav),

      pager(result, query, nav),
    ], 'ocard ovw__c12'),
  ];
}

/**
 * Nothing matched.
 *
 * Names the filter that is most likely responsible and offers to drop it,
 * rather than printing "no results" and leaving the reader to unpick a
 * four-part query by hand.
 */
function emptyState(query, nav) {
  const chips = activeChips(query);
  const last = chips[chips.length - 1];

  return el('div', { class: 'fempty' }, [
    el('p', { class: 'fempty__t', text: 'No articles match these filters.' }),
    el('p', { class: 'fempty__b', text: chips.length > 1
      ? 'The combination is narrower than the sample store covers. Try dropping one.'
      : 'Nothing in the sample store is filed under this yet.' }),
    el('div', { class: 'fempty__a' }, [
      last ? el('button', {
        type: 'button', class: 'btn',
        text: `Remove “${last.label}”`,
        onclick: () => nav.goQuery?.('research', 'latest', mergeQuery(query, { [last.key]: null })),
      }) : null,
      el('button', {
        type: 'button', class: 'btn btn--primary', text: 'Clear all filters',
        onclick: () => nav.goQuery?.('research', 'latest', { sort: query.sort }),
      }),
    ]),
  ]);
}

/* ==========================================================================
   4. Reusable elsewhere
   ========================================================================== */

/**
 * "Latest research on NVDA" — for a company surface.
 *
 * Exported from here rather than built inline on the stock page, so the two
 * halves of the internal link graph are written once each: articles link out
 * through `tickerLink`, company surfaces link in through this.
 *
 * Returns null when the store has nothing for that ticker, which is the
 * correct behaviour for a card that would otherwise be an empty box.
 */
export function relatedResearchCard(articles, nav, { title = 'Latest research', cls = 'ocard ovw__c6' } = {}) {
  if (!articles?.length) return null;
  return card('rel-research', [
    ohead(title),
    el('div', { class: 'arows' }, articles.map((a) => articleRow(a, nav))),
    el('button', {
      type: 'button', class: 'btn btn--ghost', text: 'All research →',
      onclick: () => nav.goQuery?.('research', 'latest', {}),
    }),
  ], cls);
}
