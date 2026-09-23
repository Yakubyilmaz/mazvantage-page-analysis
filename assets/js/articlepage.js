/* ==========================================================================
   Maz Vantage — the research article page

   `?view=research&sub=article&slug=…`. One article, its data blocks, and the
   routes out of it.

   ---------------------------------------------------------------------------
   The body is blocks, not HTML
   ---------------------------------------------------------------------------

   An article's `body` is an array of typed blocks — `p`, `h`, `table`,
   `metrics`, `bullbear`, `quant`, `note`, `quote` — and this file is the only
   place that knows how each one draws. Two reasons, and the second is the one
   that matters:

   1. A store that ships HTML has to be trusted, and a research pipeline that
      eventually writes into it is a language model. Typed blocks with typed
      fields cannot inject markup, because nothing here ever sets `innerHTML`
      from article content.
   2. A table in an article and a table on the company report should look and
      behave the same. Blocks route to the *existing* primitives in `ui.js` —
      `table`, `notice` — rather than to a second set of article-only styles.
      The bull/bear block reuses `.rrgrid`, which the Overview already uses for
      exactly this shape.

   An unknown block type renders nothing rather than throwing, so a store
   written against a newer vocabulary degrades one block instead of the page.

   ---------------------------------------------------------------------------
   Where an article is allowed to send the reader
   ---------------------------------------------------------------------------

   Four routes out, and all four are links into things that already exist:
   the company report (per ticker, and at the tab the piece is about), the
   filtered feed (per category, type, sector, industry and theme), the
   related articles, and the product surface the subject belongs to. None of
   them is a new page.
   ========================================================================== */

import { el, fmtDate, ago } from './util.js';
import { card, notice, ohead, table as uiTable, statLine } from './ui.js';
import { toneForLetter } from './grading.js';
import {
  typePath, categoryLabel, typeLabel, themeLabel, sectorSlug, MAX_SCORE,
} from './taxonomy.js';
import {
  loadArticles, articlesReady, articleBySlug, relatedArticles, SAMPLE_NOTICE,
} from './articles.js';
import { tickerLink, quantBadge, shariahBadge, articleRow } from './feed.js';

/* ==========================================================================
   The page
   ========================================================================== */

export function renderArticlePage(slug, nav = {}) {
  const host = el('div', { class: 'ovw' });

  const draw = () => {
    const a = articleBySlug(slug);
    host.replaceChildren(...(a ? articleBody(a, nav) : notFound(slug, nav)));
    if (a) document.title = `${a.seoTitle || a.title} — Vantace Research`;
  };

  if (articlesReady()) draw();
  else {
    host.append(card('ap-loading', [
      el('div', { class: 'sk sk--line', style: { width: '60%', height: '28px' } }),
      el('div', { class: 'sk sk--line', style: { width: '40%' } }),
      el('div', { class: 'sk sk--block', style: { marginTop: '16px' } }),
    ], 'ocard ovw__c12'));
    loadArticles().then(draw);
  }

  return host;
}

function notFound(slug, nav) {
  return [card('ap-404', [
    ohead('Article not found'),
    notice(`No article is filed under <code>${String(slug || '').replace(/[<>&]/g, '')}</code>. `
      + 'It may have been renamed — slugs are permanent identities here, so this is more likely a '
      + 'typo than a moved page.'),
    el('button', {
      type: 'button', class: 'btn btn--primary mt2', text: 'Back to Latest Research →',
      onclick: () => nav.goQuery?.('research', 'latest', {}),
    }),
  ], 'ocard ovw__c12')];
}

/* ==========================================================================
   The header
   ========================================================================== */

function articleBody(a, nav) {
  return [
    card('ap-head', [breadcrumb(a, nav), headerBlock(a, nav)], 'ocard ovw__c12 apcard'),
    card('ap-body', bodyBlocks(a, nav), 'ocard ovw__c8 apbody'),
    el('div', { class: 'ovw__c4 apside' }, [
      ratingsCard(a, nav),
      subjectCard(a, nav),
      topicsCard(a, nav),
      relatedCard(a, nav),
    ].filter(Boolean)),
    card('ap-disclosure', [notice(SAMPLE_NOTICE)], 'ocard ovw__c12 ovw--tight'),
  ];
}

/**
 * Breadcrumb.
 *
 * Every crumb is a real filter rather than a decorative path: Research goes to
 * the unfiltered feed, the category goes to that category's feed, and the type
 * goes to the two-filter feed. A breadcrumb that does not navigate is a
 * heading with extra arrows.
 */
function breadcrumb(a, nav) {
  const crumb = (label, query) => el('button', {
    type: 'button', class: 'apcrumb', text: label,
    onclick: () => nav.goQuery?.('research', 'latest', query),
  });

  return el('nav', { class: 'apcrumbs', 'aria-label': 'Breadcrumb' }, [
    crumb('Research', {}),
    el('span', { class: 'apcrumbs__s', text: '/', 'aria-hidden': 'true' }),
    crumb(categoryLabel(a.primaryCategory), { category: a.primaryCategory }),
    a.articleType ? el('span', { class: 'apcrumbs__s', text: '/', 'aria-hidden': 'true' }) : null,
    a.articleType
      ? crumb(typeLabel(a.articleType), { category: a.primaryCategory, type: a.articleType })
      : null,
  ]);
}

function headerBlock(a, nav) {
  const updated = a.updatedAt && a.updatedAt !== a.publishedAt;

  return el('header', { class: 'aphead' }, [
    a.tickers.length ? el('div', { class: 'aphead__tickers' },
      a.tickers.map((t) => tickerLink(t, nav, { tab: a.stockTab, withName: true }))) : null,

    el('h1', { class: 'aphead__t', text: a.title }),
    a.subtitle ? el('p', { class: 'aphead__s', text: a.subtitle }) : null,

    el('div', { class: 'aphead__meta' }, [
      el('span', { class: 'aphead__by', text: a.author }),
      el('span', { class: 'acard__dot', text: '·' }),
      el('span', { class: 'pill pill--muted', text: typePath(a) }),
      el('span', { class: 'acard__dot', text: '·' }),
      el('time', {
        datetime: a.publishedAt,
        title: fmtDate(a.publishedAt),
        text: `${fmtDate(a.publishedAt)} (${ago(a.publishedAt)})`,
      }),
      updated ? el('span', { class: 'acard__dot', text: '·' }) : null,
      updated ? el('span', { text: `updated ${fmtDate(a.updatedAt)}` }) : null,
      a.readingMinutes ? el('span', { class: 'acard__dot', text: '·' }) : null,
      a.readingMinutes ? el('span', { text: `${a.readingMinutes} min read` }) : null,
    ]),

    el('div', { class: 'aphead__badges' }, [
      quantBadge(a.quantRating, a.quantLetter),
      shariahBadge(a.shariahStatus, { passed: a.standardsPassed, of: a.standardsOf }),
    ].filter(Boolean)),
  ]);
}

/* ==========================================================================
   The body blocks
   ========================================================================== */

function bodyBlocks(a, nav) {
  const nodes = a.body.map((b) => block(b, nav)).filter(Boolean);
  if (!nodes.length) {
    nodes.push(el('p', { class: 'appara', text: a.summary || 'This article has no body text.' }));
  }
  return nodes;
}

/**
 * One block.
 *
 * The switch is exhaustive over the vocabulary in `articles.json`'s `_schema`.
 * An unrecognised type returns null — a store written against a newer
 * vocabulary loses one block rather than the page.
 */
function block(b, nav) {
  switch (b.type) {
    case 'p':        return el('p', { class: 'appara', text: b.text });
    case 'h':        return el('h2', { class: 'aph2', text: b.text });
    case 'note':     return el('div', { class: 'apnote' }, [notice(escapeText(b.text))]);
    // `quote` is for text quoted verbatim from a source this product actually
    // holds — an earnings call transcript. The sample store ships none on
    // purpose: a plausible-sounding quote attributed to a real company's
    // management is a fabricated statement by a real person, which is a
    // different and worse thing than a fabricated ratio.
    case 'quote':    return quoteBlock(b);
    case 'metrics':  return metricsBlock(b);
    case 'table':    return tableBlock(b);
    case 'bullbear': return bullBearBlock(b);
    case 'quant':    return quantBlock(b);
    default:         return null;
  }
}

/**
 * `notice()` takes HTML, and article text is data.
 *
 * Every other block sets `text`, which the DOM escapes for us. This one has to
 * escape by hand because the notice primitive is shared with places that
 * legitimately pass markup.
 */
function escapeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function quoteBlock(b) {
  return el('blockquote', { class: 'apquote' }, [
    el('p', { text: b.text }),
    b.cite ? el('cite', { text: b.cite }) : null,
  ]);
}

/**
 * A run of label/value/note lines.
 *
 * `statLine` is the same primitive every card on every company tab uses, so a
 * figure in an article and the same figure on the report are laid out
 * identically — which is most of what makes the two feel like one product.
 */
function metricsBlock(b) {
  return el('div', { class: 'apmetrics' }, [
    b.title ? el('p', { class: 'apblock__t', text: b.title }) : null,
    el('div', { class: 'ostats ostats--split' },
      (b.items || []).map(([label, value, note]) => statLine(label, value, { note: note || '' }))),
  ]);
}

/**
 * A table.
 *
 * `numFrom` is the first column index that holds a figure; everything from
 * there right is right-aligned with tabular numerals, which is the one thing a
 * financial table has to get right to be scannable. Routes to `ui.js`'s
 * `table` so the borders, hover and horizontal scroll are the report's.
 */
function tableBlock(b) {
  const from = Number.isInteger(b.numFrom) ? b.numFrom : 1;
  const headers = (b.headers || []).map((h, i) => ({ label: h, num: i >= from }));
  return el('div', { class: 'aptable' }, [
    b.title ? el('p', { class: 'apblock__t', text: b.title }) : null,
    uiTable(headers, b.rows || []),
  ]);
}

/**
 * The bull and bear cases, side by side.
 *
 * Reuses `.rrgrid` / `.rr--reward` / `.rr--risk`, which the Overview's reward
 * and risk lists already use. Two bullet lists with a green dot and an amber
 * dot — the separation is structural, and the colour is one 6px dot per line
 * rather than two tinted panels.
 */
function bullBearBlock(b) {
  const side = (cls, title, items) => el('div', { class: `rr ${cls}` }, [
    el('h3', { text: title }),
    items?.length
      ? el('ul', {}, items.map((t) => el('li', {}, [el('span', { text: t })])))
      : el('p', { class: 'rr__empty', text: 'Nothing material to report.' }),
  ]);

  return el('div', { class: 'apbb' }, [
    el('p', { class: 'apblock__t', text: b.title || 'Bull and bear case' }),
    el('div', { class: 'rrgrid' }, [
      side('rr--reward', 'Bull case', b.bull),
      side('rr--risk', 'Bear case', b.bear),
    ]),
  ]);
}

/**
 * The quant summary block: the composite, then the factor letters.
 *
 * Letters go through `.grade` and `toneForLetter`, the same pair the Ratings
 * tab uses, so an A− in an article is the same chip in the same colour as an
 * A− on the report.
 */
function quantBlock(b) {
  return el('div', { class: 'apquant' }, [
    el('p', { class: 'apblock__t', text: b.title || 'Vantace quant rating' }),
    el('div', { class: 'apquant__hero' }, [
      quantBadge(b.score, b.letter),
      el('span', { class: 'apquant__of', text: `of ${MAX_SCORE}` }),
    ]),
    el('div', { class: 'apquant__f' }, (b.factors || []).map(([name, letter]) => el('div', {
      class: 'apquant__fi',
    }, [
      el('span', { text: name }),
      el('span', { class: `grade grade--${toneForLetter(letter)}` }, [el('b', { text: letter })]),
    ]))),
  ]);
}

/* ==========================================================================
   The side column
   ========================================================================== */

/**
 * The two ratings, restated with what each one is and is not.
 *
 * The single most common misreading of a page that carries both is that one is
 * evidence for the other. The card says so in one line rather than relying on
 * the reader having read the methodology page.
 */
function ratingsCard(a, nav) {
  if (typeof a.quantRating !== 'number' && !a.shariahStatus) return null;

  return card('ap-ratings', [
    ohead('The two ratings'),

    typeof a.quantRating === 'number' ? el('div', { class: 'aprate' }, [
      el('p', { class: 'aprate__k', text: 'Vantace quant composite' }),
      quantBadge(a.quantRating, a.quantLetter),
      el('p', { class: 'aprate__b', text: 'A sector-relative ranking of measurable ratios across '
        + 'six factors. No fair value estimate enters it.' }),
    ]) : null,

    a.shariahStatus ? el('div', { class: 'aprate' }, [
      el('p', { class: 'aprate__k', text: 'Shariah screen' }),
      shariahBadge(a.shariahStatus, { passed: a.standardsPassed, of: a.standardsOf }),
      el('p', { class: 'aprate__b', text: a.standardsPassed != null
        ? `Passes ${a.standardsPassed} of ${a.standardsOf} published methodologies. A mechanical `
          + 'screen, not a scholarly ruling.'
        : 'A mechanical screen against published limits, not a scholarly ruling.' }),
    ]) : null,

    el('p', { class: 't-tiny subtle mt2', text: 'These answer different questions — whether the '
      + 'company is permissible under the chosen methodology, and how its ratios rank against its '
      + 'sector. Neither is evidence for the other.' }),

    el('button', {
      type: 'button', class: 'btn btn--ghost', text: 'How the quant rating is built →',
      onclick: () => nav.goView?.('quant', 'ratings'),
    }),
  ], 'ocard');
}

/** The companies the piece is about, and the tab on each that it is about. */
function subjectCard(a, nav) {
  if (!a.tickers.length) return null;
  const tabNote = a.stockTab ? ` — opens the ${a.stockTab} tab` : '';

  return card('ap-subject', [
    ohead(a.tickers.length === 1 ? 'The company' : 'Companies in this piece'),
    el('div', { class: 'apsubs' }, a.companies.map((c) => el('button', {
      type: 'button', class: 'apsub',
      title: `Open the ${c.name} report${tabNote}`,
      onclick: () => nav.goSymbolTab?.(a.stockTab, c.ticker),
    }, [
      el('b', { text: c.ticker }),
      el('span', { text: c.name }),
      c.industry ? el('i', { text: c.industry }) : null,
    ]))),
    el('p', { class: 't-tiny subtle', text: a.stockTab
      ? `Each opens the ${a.stockTab} tab of that company's report.`
      : 'Each opens that company\'s report.' }),
  ], 'ocard');
}

/**
 * Sector, industry and theme — as links back into the filtered feed.
 *
 * This is the half of the internal-link graph that makes the taxonomy worth
 * having: an article about a semiconductor company is one click from every
 * other article about semiconductors, without anything having been tagged
 * "semiconductors" by hand — the industry came from the ticker.
 */
function topicsCard(a, nav) {
  const link = (label, query) => el('button', {
    type: 'button', class: 'aptopic', text: label,
    onclick: () => nav.goQuery?.('research', 'latest', query),
  });

  // Deduped by the *printed label*, not by the filter. An industry and a theme
  // can share a name — a semiconductor company carries the Semiconductors
  // industry from its ticker and often the semiconductors theme from its
  // editor — and two identical chips pointing at two different filters reads
  // as a bug. The industry wins, because it came from the company data rather
  // than from a tag.
  const seen = new Set();
  const once = (label, query) => {
    const k = label.toLowerCase();
    if (seen.has(k)) return null;
    seen.add(k);
    return link(label, query);
  };

  const items = [
    ...a.sectors.map((s) => once(s, { sector: sectorSlug(s) })),
    ...a.industries.map((i) => once(i, { industry: i })),
    ...a.themes.map((t) => once(themeLabel(t), { theme: t })),
  ].filter(Boolean);
  if (!items.length) return null;

  return card('ap-topics', [
    ohead('More on these topics'),
    el('div', { class: 'aptopics' }, items),
    el('p', { class: 't-tiny subtle', text: 'Sector and industry come from the companies named '
      + 'above rather than from a tag, so they cannot disagree with the company data.' }),
  ], 'ocard');
}

function relatedCard(a, nav) {
  const rel = relatedArticles(a, 5);
  if (!rel.length) return null;

  return card('ap-related', [
    ohead('Related research'),
    el('div', { class: 'arows' }, rel.map((r) => articleRow(r, nav))),
  ], 'ocard');
}
