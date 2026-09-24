/* ==========================================================================
   Vanlior — the Research feed and the pieces it is built from

   `?view=research` — the editorial feed — on the market canvas, laid out the
   way TradingView lays out its ideas: a large title, the sections as a strip
   under it, pills for the section's own kinds, and the pieces as a grid of
   cards led by one featured piece. The article page and Investing Strategy
   share the head and the strip, so the three read as one section.

   ---------------------------------------------------------------------------
   The filter state is the URL. There is no other copy of it.
   ---------------------------------------------------------------------------

   Every tab, pill, chip, select and page link in this file does exactly one
   thing: it computes a new query and hands it to `nav.goQuery`, which pushes a
   URL and re-renders. Nothing holds a filter in a variable, and nothing
   re-filters a list it is already holding. That is what makes a filtered feed
   shareable, the back button step through filters, and a link like
   `?view=research&category=shariah&type=shariah-idea` a landing page.

   The one exception is `moreOpen` — whether the filter drawer is open. That is
   a preference about the furniture, not the results, and putting it in the URL
   would make every shared link share the state of somebody's drawer.

   ---------------------------------------------------------------------------
   What a card prints, and what it leaves to the article
   ---------------------------------------------------------------------------

   TradingView's idea cards lead with a picture of a chart. These pieces have
   no picture, so the top of a card is the thing a reader scanning research
   decides on first: which companies it is about, and how the two ratings
   stand. Then the kind of piece, the headline, two lines of summary, and who
   wrote it when. Sectors, industries, themes and the full ticker list are on
   the article page.
   ========================================================================== */

import { el, ago } from './util.js';
import { card, ohead, logo } from './ui.js';
import { logoUrl } from './fmp.js';
import { instrumentMark } from './markethub-ui.js';
import {
  CATEGORIES, TOPIC_PILLS, THEMES, SORTS, SECTORS, QUANT_FILTERS, SHARIAH_FILTERS,
  CATEGORY_BY_KEY, typePath, quantVerdict, quantTone, shariahLabel, shariahTone,
  mergeQuery, activeChips, isFiltered,
} from './taxonomy.js';
import {
  loadArticles, articlesReady, queryArticles, companyName, articleUrl,
  SAMPLE_NOTICE, PER_PAGE,
} from './articles.js';

/** Is the filter drawer open? Module-level: the page is rebuilt on every
    filter click, and a drawer that closed itself each time would be unusable. */
let moreOpen = false;

/* ==========================================================================
   1. The small reusable pieces
   ========================================================================== */

/**
 * A ticker, as a link to that company's report — the load-bearing half of the
 * internal-linking graph. Every ticker printed anywhere in Research goes
 * through this, so an article always offers a route into the data behind it.
 */
export function tickerLink(ticker, nav = {}, { tab = null, withName = false } = {}) {
  const name = companyName(ticker);
  return el('button', {
    type: 'button', class: 'tkr',
    title: `Open the ${name} report`,
    onclick: (e) => { e.stopPropagation(); e.preventDefault(); nav.goSymbolTab?.(tab, ticker); },
  }, [
    // A pill that already prints the ticker gains nothing from a letter
    // square, so a symbol the vendor has no logo for is a pill without one.
    logo(logoUrl(ticker), ticker, { size: 'xs', fallback: 'none' }),
    el('b', { text: ticker }),
    withName && name !== ticker ? el('span', { text: name }) : null,
  ].filter(Boolean));
}

/**
 * The quant score badge: score, then the word — never the word alone. The word
 * is five bands over a continuous score, so "Buy" spans 3.00 to 3.99.
 */
export function quantBadge(score, letter = null, { compact = false } = {}) {
  if (typeof score !== 'number') return null;
  const word = quantVerdict(score);
  return el('span', {
    class: `qchip is-${quantTone(score)}`,
    title: `Vanlior quant composite: ${score.toFixed(2)} of 5${letter ? ` (${letter})` : ''} — ${word}`,
  }, [
    el('i', { text: 'Quant' }),
    el('b', { text: score.toFixed(2) }),
    compact ? null : el('span', { text: word }),
  ]);
}

/**
 * The Shariah badge, with the pass count beside the word wherever it is
 * known — the word is *defined* as that count (`shariahStatusFromCounts`).
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

/** Up to three company marks, overlapped, for the top of a card. */
function marks(tickers, large = false) {
  const shown = tickers.slice(0, 3);
  return el('span', { class: `rs-marks${large ? ' rs-marks--large' : ''}`, 'aria-hidden': 'true' },
    shown.map((t) => instrumentMark({ symbol: t, kind: 'stock' }, large)));
}

/** "NVDA", "NVDA · AMD", "NVDA · AMD · +2". */
function tickerLine(tickers) {
  if (!tickers.length) return 'Market-wide';
  const head = tickers.slice(0, 2).join(' · ');
  return tickers.length > 2 ? `${head} · +${tickers.length - 2}` : head;
}

/** The quant score as the top of a card prints it: the figure, then its word. */
function scoreBlock(a, large = false) {
  if (typeof a.quantRating !== 'number') return null;
  return el('span', { class: `rs-score is-${quantTone(a.quantRating)}${large ? ' rs-score--large' : ''}`,
    title: `Vanlior quant composite ${a.quantRating.toFixed(2)} of 5${a.quantLetter ? ` (${a.quantLetter})` : ''}` }, [
    el('b', { text: a.quantRating.toFixed(2) }),
    el('span', { text: quantVerdict(a.quantRating) }),
  ]);
}

function byline(a) {
  return el('p', { class: 'rs-by' }, [
    el('span', { class: 'rs-by__av', 'aria-hidden': 'true' }, [el('img', { src: 'assets/img/vanlior-mark-white.svg', alt: '' })]),
    el('span', { class: 'rs-by__name', text: a.author }),
    el('span', { class: 'rs-by__dot', text: '·' }),
    el('time', { datetime: a.publishedAt, text: ago(a.publishedAt) }),
    a.readingMinutes ? el('span', { class: 'rs-by__dot', text: '·' }) : null,
    a.readingMinutes ? el('span', { text: `${a.readingMinutes} min read` }) : null,
  ]);
}

/**
 * One article, as a card.
 *
 * The headline is the link, stretched over the whole card, so the browser's
 * own affordances work — middle-click, copy link address, the status bar. The
 * ticker buttons sit above the stretched link and open the company instead.
 */
export function articleCard(a, nav = {}) {
  const single = a.tickers.length === 1;
  return el('article', { class: 'rs-card' }, [
    el('div', { class: 'rs-card__top' }, [
      marks(a.tickers),
      el('span', { class: 'rs-card__subject' }, [
        el('b', { text: tickerLine(a.tickers) }),
        single ? el('small', { text: companyName(a.tickers[0]) }) : null,
      ]),
      scoreBlock(a),
    ]),
    el('div', { class: 'rs-card__body' }, [
      el('p', { class: 'rs-kicker', text: typePath(a) }),
      el('h3', { class: 'rs-card__title' }, [
        el('a', { href: articleUrl(a.slug), onclick: openArticle(a, nav), text: a.title }),
      ]),
      a.summary ? el('p', { class: 'rs-card__sum', text: a.summary }) : null,
    ]),
    el('div', { class: 'rs-card__foot' }, [
      byline(a),
      shariahBadge(a.shariahStatus, { passed: a.standardsPassed, of: a.standardsOf }),
    ]),
  ]);
}

/** The featured piece: the headline given room, and the ratings beside it. */
function leadCard(a, nav) {
  return el('article', { class: 'rs-lead' }, [
    el('div', { class: 'rs-lead__text' }, [
      el('p', { class: 'rs-kicker', text: typePath(a) }),
      el('h2', { class: 'rs-lead__title' }, [
        el('a', { href: articleUrl(a.slug), onclick: openArticle(a, nav), text: a.title }),
      ]),
      a.subtitle || a.summary ? el('p', { class: 'rs-lead__dek', text: a.subtitle || a.summary }) : null,
      a.tickers.length ? el('div', { class: 'rs-lead__tickers' },
        a.tickers.slice(0, 4).map((t) => tickerLink(t, nav, { tab: a.stockTab, withName: a.tickers.length <= 2 }))) : null,
      byline(a),
    ]),
    el('div', { class: 'rs-lead__panel' }, [
      marks(a.tickers, true),
      el('p', { class: 'rs-lead__subject', text: a.tickers.length === 1 ? companyName(a.tickers[0]) : tickerLine(a.tickers) }),
      el('div', { class: 'rs-lead__ratings' }, [
        typeof a.quantRating === 'number' ? el('div', { class: 'rs-rating' }, [
          el('span', { class: 'rs-rating__k', text: 'Quant rating' }),
          scoreBlock(a, true),
        ]) : null,
        shariahLabel(a.shariahStatus) ? el('div', { class: 'rs-rating' }, [
          el('span', { class: 'rs-rating__k', text: 'Shariah screen' }),
          el('span', { class: `rs-rating__v is-${shariahTone(a.shariahStatus)}` }, [
            el('b', { text: shariahLabel(a.shariahStatus) }),
            a.standardsPassed != null ? el('span', { text: `${a.standardsPassed} of ${a.standardsOf} standards` }) : null,
          ]),
        ]) : null,
      ]),
    ]),
  ]);
}

/**
 * The compact variant: a headline and its meta. Used by Related research and
 * by the company tabs that list research without giving it a column.
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

/** Real `href`s, intercepted: a plain click routes in-app, a modifier click
    is left alone so ctrl/cmd-click opens a new tab. */
function openArticle(a, nav) {
  return (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    nav.goQuery?.('research', 'article', { slug: a.slug });
  };
}

/* ==========================================================================
   2. The head and the strip every Research page shares
   ========================================================================== */

const DEFAULT_BLURB = 'News says what happened. Research says what it means for the numbers.';

/** The big title, the way the market canvas opens a page. */
export function researchHero(title, blurb = DEFAULT_BLURB) {
  return el('header', { class: 'mh-hero rs-hero' }, [
    el('div', { class: 'mh-eyebrow', text: 'RESEARCH' }),
    el('h1', { class: 'rs-title', text: title }),
    blurb ? el('div', { class: 'mh-hero__meta' }, [el('span', { text: blurb })]) : null,
  ]);
}

/**
 * The sections, as the canvas's sticky strip: the feed, its seven categories,
 * and Investing Strategy. `active` is a category key, 'latest' or 'strategy'.
 * A tab is a navigation: from the feed it keeps the other filters, from
 * anywhere else it opens that section clean.
 */
export function researchStrip(active, nav = {}, query = null) {
  const to = (category) => () => nav.goQuery?.('research', 'latest',
    query ? mergeQuery(query, { category, type: null }) : (category ? { category } : {}));
  const tab = (key, label, onclick) => el('button', {
    type: 'button', class: key === active ? 'is-active' : '',
    'aria-current': key === active ? 'page' : null, text: label, onclick,
  });
  return el('nav', { class: 'mh-navigation rs-strip', 'aria-label': 'Research sections' }, [
    tab('latest', 'Latest', to(null)),
    ...CATEGORIES.map((c) => tab(c.key, c.label, to(c.key))),
    tab('strategy', 'Investing Strategy', () => nav.goView?.('research', 'strategy')),
  ]);
}

/** The standing disclosure, as one quiet line rather than a warning box. */
export function sampleBanner() {
  return el('div', { class: 'rs-sample', role: 'note' }, [
    el('span', { class: 'rs-sample__i', 'aria-hidden': 'true', text: 'i' }),
    el('p', { html: SAMPLE_NOTICE }),
  ]);
}

/* ==========================================================================
   3. The filter controls
   ========================================================================== */

/** A pill: TradingView's rounded toggle, filled when on. */
function pill(label, { active = false, onclick, title = null }) {
  return el('button', {
    type: 'button', class: `rs-pill${active ? ' is-active' : ''}`,
    'aria-pressed': String(active), title, onclick,
  }, [label]);
}

/**
 * The pill row under the strip. With a category chosen it is that category's
 * kinds of piece; without one it is the topic shortcuts, each just a partial
 * query — a theme, a sector, an industry and a type side by side, because a
 * reader scanning shortcuts is not thinking in the data model's terms.
 */
function pillRow(query, nav) {
  const cat = CATEGORY_BY_KEY[query.category];
  const go = (change) => () => nav.goQuery?.('research', 'latest', mergeQuery(query, change));
  if (cat) {
    return el('div', { class: 'rs-pills', role: 'group', 'aria-label': `${cat.label} kinds` }, [
      pill(`All ${cat.label}`, { active: !query.type, onclick: go({ type: null }) }),
      ...cat.types.map((t) => pill(t.label, { active: query.type === t.key, onclick: go({ type: t.key }) })),
    ]);
  }
  const on = (q) => Object.entries(q).every(([k, v]) => query[k] === v);
  return el('div', { class: 'rs-pills', role: 'group', 'aria-label': 'Topics' },
    TOPIC_PILLS.map((t) => pill(t.label, {
      active: on(t.query),
      // A second click on an active shortcut clears it.
      onclick: go(on(t.query) ? Object.fromEntries(Object.keys(t.query).map((k) => [k, null])) : t.query),
    })));
}

/** A labelled select that writes one query key. */
function filterSelect(label, key, options, query, nav, placeholder) {
  const id = `rs-${key}`;
  const sel = el('select', {
    id, class: 'rs-input',
    onchange: (e) => nav.goQuery?.('research', 'latest', mergeQuery(query, { [key]: e.target.value || null })),
  }, [
    el('option', { value: '', text: placeholder }),
    ...options.map((o) => el('option', { value: o.value, text: o.label })),
  ]);
  // Set as a property too: the attribute alone can be ignored once live.
  sel.value = query[key] || '';
  return el('label', { class: 'rs-field', for: id }, [el('span', { text: label }), sel]);
}

/** A text box that writes one query key on Enter. */
function filterText(label, key, query, nav, { placeholder, upper = false }) {
  const id = `rs-${key}`;
  const input = el('input', {
    type: 'search', id, class: 'rs-input', placeholder, value: query[key] || '',
    autocomplete: 'off', spellcheck: 'false',
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = input.value.trim();
    nav.goQuery?.('research', 'latest', mergeQuery(query, { [key]: (upper ? v.toUpperCase() : v) || null }));
  });
  return el('label', { class: 'rs-field', for: id }, [el('span', { text: label }), input]);
}

/** Filters other than the pills, in a drawer. The type select is grouped by
    category, so all thirty-eight kinds are reachable without choosing one. */
function drawer(query, nav, industries) {
  const typeSel = el('select', {
    id: 'rs-type', class: 'rs-input',
    onchange: (e) => nav.goQuery?.('research', 'latest', mergeQuery(query, { type: e.target.value || null })),
  }, [
    el('option', { value: '', text: 'Any kind' }),
    ...CATEGORIES.map((c) => el('optgroup', { label: c.label },
      c.types.map((t) => el('option', { value: t.key, text: t.label })))),
  ]);
  typeSel.value = query.type || '';

  return el('div', { class: 'rs-drawer', id: 'research-filters', hidden: !moreOpen }, [
    el('label', { class: 'rs-field', for: 'rs-type' }, [el('span', { text: 'Kind of piece' }), typeSel]),
    filterSelect('Sector', 'sector', SECTORS.map((s) => ({ value: s, label: s })), query, nav, 'Any sector'),
    filterSelect('Industry', 'industry', industries.map((s) => ({ value: s, label: s })), query, nav, 'Any industry'),
    filterSelect('Theme', 'theme', THEMES.map((t) => ({ value: t.key, label: t.label })), query, nav, 'Any theme'),
    filterSelect('Quant rating', 'rating', QUANT_FILTERS.map((r) => ({ value: r.key, label: r.label })), query, nav, 'Any rating'),
    filterSelect('Shariah status', 'shariah', SHARIAH_FILTERS.map((s) => ({ value: s.key, label: s.label })), query, nav, 'Any status'),
    filterText('Ticker', 'ticker', query, nav, { placeholder: 'e.g. NVDA', upper: true }),
    filterText('Search', 'q', query, nav, { placeholder: 'Headline or company' }),
    el('p', { class: 'rs-drawer__note', text: 'Search covers the headline, subtitle, summary and company '
      + 'names — not the article body. Press Enter to apply a text box.' }),
  ]);
}

/** Sort, and the drawer toggle with a count of what is set inside it. */
function tools(query, nav) {
  const inDrawer = ['sector', 'industry', 'theme', 'rating', 'shariah', 'ticker', 'q'].filter((k) => query[k]).length;
  const sort = el('select', {
    class: 'rs-input rs-sort', 'aria-label': 'Sort',
    onchange: (e) => nav.goQuery?.('research', 'latest', mergeQuery(query, { sort: e.target.value })),
  }, SORTS.map((s) => el('option', { value: s.key, text: s.label })));
  sort.value = query.sort || 'latest';

  const toggle = el('button', {
    type: 'button', class: `rs-btn${moreOpen ? ' is-open' : ''}`,
    'aria-expanded': String(moreOpen), 'aria-controls': 'research-filters',
    onclick: (e) => {
      moreOpen = !moreOpen;
      const panel = document.getElementById('research-filters');
      if (panel) panel.hidden = !moreOpen;
      e.currentTarget.setAttribute('aria-expanded', String(moreOpen));
      e.currentTarget.classList.toggle('is-open', moreOpen);
    },
  }, [filterIcon(), 'Filters', inDrawer ? el('span', { class: 'rs-btn__n', text: String(inDrawer) }) : null]);

  return el('div', { class: 'rs-tools' }, [sort, toggle]);
}

function filterIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'rs-btn__i');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M4 6h16M7 12h10M10 18h4"/>';
  return svg;
}

/** The removable chips, plus Clear all. */
function chipRow(query, nav) {
  const chips = activeChips(query);
  if (!chips.length) return null;
  return el('div', { class: 'rs-chips' }, [
    ...chips.map((c) => el('button', {
      type: 'button', class: 'rs-chip', 'aria-label': `Remove filter ${c.label}`,
      onclick: () => nav.goQuery?.('research', 'latest', mergeQuery(query, { [c.key]: null })),
    }, [el('span', { text: c.label }), el('i', { text: '×', 'aria-hidden': 'true' })])),
    el('button', {
      type: 'button', class: 'rs-chip rs-chip--clear', text: 'Clear all',
      onclick: () => nav.goQuery?.('research', 'latest', { sort: query.sort }),
    }),
  ]);
}

/** Newer / Older and a position. The store returns a page and a total, and a
    numbered strip on a feed that will run to hundreds of pages goes unclicked. */
function pager(result, query, nav) {
  if (result.pages <= 1) return null;
  const go = (page) => () => {
    nav.goQuery?.('research', 'latest', { ...query, page });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  return el('nav', { class: 'rs-pager', 'aria-label': 'Feed pages' }, [
    el('button', { type: 'button', class: 'rs-btn', text: '← Newer', disabled: result.page <= 1 ? true : null, onclick: go(result.page - 1) }),
    el('span', { text: `Page ${result.page} of ${result.pages}` }),
    el('button', { type: 'button', class: 'rs-btn', text: 'Older →', disabled: result.page >= result.pages ? true : null, onclick: go(result.page + 1) }),
  ]);
}

/* ==========================================================================
   4. The page
   ========================================================================== */

/**
 * `?view=research&sub=latest`. Synchronous once the store is in memory, which
 * it is on every render after the first — a skeleton between two identical
 * feeds on every pill click would be the wrong trade.
 */
export function renderResearchFeed(query, nav = {}) {
  const cat = CATEGORY_BY_KEY[query.category];
  const host = el('div', { class: 'rs-feed' });
  const draw = () => host.replaceChildren(...feedBody(query, nav));
  if (articlesReady()) draw();
  else {
    host.append(skeleton());
    loadArticles().then(draw);
  }
  return el('main', { class: 'mh-page rs-page', id: 'research' }, [
    researchHero(cat ? cat.label : 'Latest research', cat ? cat.blurb : DEFAULT_BLURB),
    researchStrip(cat ? cat.key : 'latest', nav, query),
    host,
  ]);
}

function skeleton() {
  return el('div', { class: 'rs-grid', 'aria-busy': 'true' }, Array.from({ length: 6 }, () =>
    el('div', { class: 'rs-card rs-card--sk' }, [
      el('span', { class: 'sk', style: { width: '40%', height: '14px' } }),
      el('span', { class: 'sk', style: { width: '90%', height: '18px' } }),
      el('span', { class: 'sk', style: { width: '70%', height: '12px' } }),
    ])));
}

function feedBody(query, nav) {
  const all = articlesReady() || [];
  const result = queryArticles(query, { perPage: PER_PAGE, list: all });
  // Offered industries come from the loaded set, so the select never lists an
  // industry that would return nothing.
  const industries = [...new Set(all.flatMap((a) => a.industries))].sort();

  const items = result.items;
  // The first page opens on a featured piece and the two after it, the way
  // TradingView opens its ideas; every later page is the grid alone.
  const featured = result.page === 1 && items.length >= 3;
  const [lead, ...rest] = items;

  return [
    el('div', { class: 'rs-bar' }, [pillRow(query, nav), tools(query, nav)]),
    drawer(query, nav, industries),
    chipRow(query, nav),
    el('div', { class: 'rs-count' }, [
      el('p', {}, [
        el('b', { text: result.total.toLocaleString('en-US') }),
        ` ${result.total === 1 ? 'piece' : 'pieces'}${isFiltered(query) ? ' matching these filters' : ''}`,
      ]),
    ]),
    sampleBanner(),
    result.total
      ? el('div', { class: 'rs-results' }, [
        featured ? el('div', { class: 'rs-featured' }, [
          leadCard(lead, nav),
          el('div', { class: 'rs-featured__side' }, rest.slice(0, 2).map((a) => articleCard(a, nav))),
        ]) : null,
        el('div', { class: 'rs-grid' }, (featured ? rest.slice(2) : items).map((a) => articleCard(a, nav))),
      ])
      : emptyState(query, nav),
    pager(result, query, nav),
    el('details', { class: 'mh-coverage' }, [
      el('summary', { text: 'How research is filed here' }),
      el('div', {}, [
        el('p', { text: 'Seven sections, and inside each the kinds of piece it carries — thirty-eight in all. '
          + 'Nothing finer than a kind is a kind: a piece on halal semiconductor stocks is Shariah, a halal idea, '
          + 'and an industry that comes from its tickers.' }),
        el('p', { text: 'Sectors and industries come from the companies a piece is about, never from a tag, so '
          + 'they cannot disagree with the company data. The quant words are the report’s own bands, and a '
          + 'Shariah status is defined as how many of the five published methodologies the company passes.' }),
        el('p', { text: 'Every filter is part of the address, so a filtered view can be shared and the back button '
          + 'steps back through filters.' }),
      ]),
    ]),
  ].filter(Boolean);
}

/** Nothing matched: name the filter most likely responsible and offer to drop it. */
function emptyState(query, nav) {
  const chips = activeChips(query);
  const last = chips[chips.length - 1];
  return el('div', { class: 'mh-empty rs-empty', role: 'status' }, [
    el('strong', { text: 'No research matches these filters.' }),
    el('p', { text: chips.length > 1
      ? 'The combination is narrower than the sample set covers. Try dropping one.'
      : 'Nothing in the sample set is filed under this yet.' }),
    el('div', { class: 'rs-empty__a' }, [
      last ? el('button', {
        type: 'button', class: 'rs-btn', text: `Remove “${last.label}”`,
        onclick: () => nav.goQuery?.('research', 'latest', mergeQuery(query, { [last.key]: null })),
      }) : null,
      el('button', {
        type: 'button', class: 'rs-btn rs-btn--primary', text: 'Clear all filters',
        onclick: () => nav.goQuery?.('research', 'latest', { sort: query.sort }),
      }),
    ]),
  ]);
}

/* ==========================================================================
   5. Reusable elsewhere
   ========================================================================== */

/**
 * "Latest research on NVDA" — for a company surface. Returns null when the
 * store has nothing for the ticker, rather than an empty box.
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

