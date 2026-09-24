/* ==========================================================================
   Vanlior — the Research menu

   This module is the **router for the Research section**, plus the one page
   that has nowhere else to live.

   Three kinds of destination hang off `?view=research`:

     &sub=latest    the editorial article feed          -> feed.js
     &sub=article   one article, by &slug=              -> articlepage.js
     &sub=strategy  Investing Strategy, below

   and five more items in the menu are destinations that already exist
   elsewhere — the company report's Research, Valuation and Dividends tabs, the
   Investment Ideas page, the earnings Calendar and the sector pages. The bar
   sends the reader straight to those rather than building second copies.

   ---------------------------------------------------------------------------
   Two things called research, and why both are here
   ---------------------------------------------------------------------------

   **The feed** is editorial: articles about companies, filtered by a taxonomy.
   **Investing Strategy** is the page that says what this product believes —
   why a grade is a sector percentile, why fair values never feed one, what the
   report refuses to do. It was the default before the feed existed and keeps
   its own section; every link to `&sub=strategy` still lands on it.

   The feed is first in the menu, so a bare `?view=research` opens it. That is
   the only behaviour that changed.
   ========================================================================== */

import { el } from './util.js';
import { card, notice, ohead, table } from './ui.js';
import { NAV_BY_VIEW } from './nav.js';
import { FACTOR_KEYS, FACTOR_BY_KEY } from './factors.js';
import { parseQuery } from './taxonomy.js';
import { renderResearchFeed, researchHero, researchStrip } from './feed.js';
import { renderArticlePage } from './articlepage.js';

/**
 * `?view=research&sub=…`.
 *
 * The feed and the article page read their own state out of the URL — the
 * query for one, the slug for the other — because that state is the URL and
 * threading it through here would create a second copy of it.
 */
export function renderResearchHubPage(sub, nav = {}) {
  if (sub === 'article') {
    return renderArticlePage(new URLSearchParams(location.search).get('slug'), nav);
  }
  if (sub === 'strategy') {
    // On the canvas with the rest of Research. The cards below are the report's
    // own primitives, which `reportcanvas.css` restyles inside `.mh-page`.
    return el('main', { class: 'mh-page rs-page rs-page--strategy', id: 'research-strategy' }, [
      researchHero('Investing Strategy', 'What this product believes about a company, and what it refuses to do.'),
      researchStrip('strategy', nav),
      el('div', { class: 'rs-strategy' }, [strategySection(nav)]),
    ]);
  }
  return renderResearchFeed(parseQuery(), nav);
}

function strategySection(nav) {
  return el('div', { class: 'ovw' }, [
    principlesCard(),
    factorsCard(nav),
    ratingsCard(nav),
    refusalsCard(),
    whereToGoCard(nav),
  ]);
}

/* ---------- 1. the principles ----------------------------------------------- */

function principlesCard() {
  return card('rh-principles', [
    ohead('How this report thinks about a company'),

    el('p', { class: 'rsrp', text: 'A company is judged against its own sector, on as many '
      + 'ratios as the filings support, and never against an absolute threshold. A 30% operating '
      + 'margin is exceptional in a grocer and unremarkable in a software business, so a single '
      + 'cut-off would be measuring the industry rather than the company. Every ratio is ranked '
      + 'as a percentile within its sector, and that percentile is the grade.' }),

    el('p', { class: 'rsrp', text: 'Ratios are grouped into five factors and the five average '
      + 'into one composite. Averaging is a deliberate refusal to be clever: a weighting scheme '
      + 'that says profitability matters twice as much as valuation is a view about markets, not '
      + 'a fact about the company, and it would be doing the reader’s thinking for them. Where '
      + 'this report does hold a view, it says so in words rather than burying it in a weight.' }),

    el('p', { class: 'rsrp', text: 'Nothing is scored that cannot be measured. A ratio the data '
      + 'does not support is dropped from the average rather than filled with a zero or a sector '
      + 'median, and the count of what was actually graded prints beside every score. A factor '
      + 'graded on four ratios and one graded on twenty are not the same measurement.' }),
  ], 'ocard ovw__c12');
}

/* ---------- 2. the five factors --------------------------------------------- */

function factorsCard(nav) {
  return card('rh-factors', [
    ohead('The five factors'),
    el('p', { class: 'fgroup__desc', text: 'Each asks one question. Together they are most of '
      + 'what a set of accounts can answer about a business.' }),

    table([{ label: 'Factor' }, { label: 'The question' }], FACTOR_KEYS.map((k) => {
      const f = FACTOR_BY_KEY[k];
      return [
        el('button', {
          type: 'button', class: 'mkticker', text: f.title,
          title: `Open the ${f.title} factor on the company report`,
          onclick: () => nav.goSymbolTab?.(f.title),
        }),
        f.question || f.blurb || '—',
      ];
    })),

    el('p', { class: 't-tiny subtle mt2', text: 'Momentum is the shortest of the five by some '
      + 'distance, because price history answers fewer questions than a balance sheet does. It '
      + 'is included because a company whose shares have already run is a different proposition '
      + 'from one whose have not, whatever the accounts say.' }),
  ], 'ocard ovw__c12');
}

/* ---------- 3. the two ratings ---------------------------------------------- */

function ratingsCard(nav) {
  return card('rh-ratings', [
    ohead('Two ratings, deliberately not merged'),

    table([{ label: '' }, { label: 'Quant rating' }, { label: 'Valuation zone' }], [
      ['The question it answers',
        'How do this company’s ratios rank against its sector?',
        'Is the price below a modelled estimate of what the business is worth?'],
      ['What goes in',
        'Every rankable ratio, including price multiples, as sector percentiles.',
        'The median of thirteen fair-value models, banded by an uncertainty rating.'],
      ['What never goes in',
        'A fair value estimate.',
        'Any sector ranking.'],
      ['What it says',
        'A verdict word, a letter, and a score out of five.',
        'Undervalued, fairly valued, or overvalued.'],
    ]),

    el('p', { class: 'rsrp mt2', text: 'They disagree often, and the disagreement is the useful '
      + 'part. A company can rank near the top of its sector and still cost more than any '
      + 'reasonable estimate of its worth; another can be cheap because it deserves to be. '
      + 'Collapsing both into one number would hide exactly the case a reader most needs to see.' }),

    notice('No fair value estimate feeds any grade anywhere in this report. That is a standing '
      + 'rule rather than an implementation detail: a valuation is a set of assumptions the '
      + 'reader chooses, and letting a chosen assumption move a sector-relative grade would make '
      + 'the grade mean something different for every reader.'),

    el('div', { class: 'mt2' }, [
      el('button', {
        type: 'button', class: 'btn btn--primary',
        text: 'See both on a company →',
        onclick: () => nav.goSymbolTab?.('Research'),
      }),
      el('button', {
        type: 'button', class: 'btn btn--ghost',
        text: 'How the quant rating is built',
        onclick: () => nav.goView?.('quant', 'ratings'),
      }),
    ]),
  ], 'ocard ovw__c12');
}

/* ---------- 4. what it refuses to do ---------------------------------------- */

function refusalsCard() {
  return card('rh-refusals', [
    ohead('What this report will not do'),

    table([{ label: 'It does not' }, { label: 'Why' }], [
      ['Give investment advice',
        'A verdict word on a scorecard is a summary of ratios against a sector. It is not a '
        + 'recommendation, it knows nothing about the reader, and it should not be read as one.'],
      ['Score a fair value',
        'Thirteen models produce thirteen answers. Publishing the range and the median is honest; '
        + 'grading a company on whichever one you picked is not.'],
      ['Fill a gap with an estimate',
        'A missing ratio is dropped and the count says so. Substituting a sector median would '
        + 'make an unmeasurable company look average rather than unmeasured.'],
      ['Smooth the analyst tail',
        'Consensus estimates wobble in the outer years as coverage thins. That noise is the '
        + 'vendor’s actual data, and hiding it would invent a confidence nobody has.'],
      ['Tag news with sentiment',
        'The vendor supplies none and this report runs no model that could produce one. A green '
        + 'or red chip on a headline is the easiest way to imply an opinion the page does not '
        + 'hold.'],
      ['Issue a Shariah ruling',
        'The compliance screen is two balance-sheet ratios and a keyword test. Three of the tests '
        + 'the index providers run are not run here at all, and a scholar is the authority.'],
    ]),
  ], 'ocard ovw__c12');
}

/* ---------- 5. the rest of the menu ----------------------------------------- */

function whereToGoCard(nav) {
  const menu = NAV_BY_VIEW.research;

  return card('rh-where', [
    ohead('The rest of this menu'),
    el('p', { class: 'fgroup__desc', text: 'Every other item here opens something that already '
      + 'exists elsewhere in the product rather than a second copy of it.' }),

    el('div', { class: 'rhlinks' }, menu.items
      // Everything that is *not* a section of this page. Was `i.sub !==
      // 'strategy'` when Strategy was the only section; there are now three,
      // and the two new ones have no `view` or `symbolTab` to click through
      // to, so they would render as dead tiles.
      .filter((i) => !i.sub)
      .map((item) => el('button', {
        type: 'button', class: 'rhlink',
        onclick: () => {
          if (item.symbolTab) nav.goSymbolTab?.(item.symbolTab);
          else if (item.view) nav.goView?.(item.view, null);
        },
      }, [
        el('b', { text: item.label }),
        el('span', { text: DESTINATION_NOTE[item.label] || '' }),
      ]))),
  ], 'ocard ovw__c12');
}

const DESTINATION_NOTE = {
  'Stock Analysis': 'The full equity research report on the company you have open, with the '
    + 'long-form narrative.',
  'Investment Ideas': 'Twenty screens across the market, each with its rules and thresholds '
    + 'argued for.',
  Earnings: 'The calendar: who reports when, plus dividends and splits, a week at a time.',
  Valuation: 'Thirteen fair-value models on the open company, with the range they span.',
  Dividends: 'Yield history, cover, growth and the record on the open company.',
  'Sectors & Industries': 'One page per sector: what it did, and the distribution every grade '
    + 'in it is measured against.',
};
