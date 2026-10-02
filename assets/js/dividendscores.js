/* ==========================================================================
   Vanlior — the dividend scores panel

   The third panel of the Dividends tab: the four composites from
   `dividend-score.js`, laid out exactly as the Valuation, Growth,
   Profitability and Financial Health tabs lay out a factor —

     the hero, with the grade, the scale, the bar and how the lines sit
     against the sector median
     the four composites beside it, with this one picked out
     the lines carrying the grade and the lines holding it back

   — and, like those four tabs, **no ratio tables**. `FACTOR_TAB_DETAIL` in
   `gradeview.js` states the rule this follows: the Analysis tab is where
   every line's table already lives, and repeating all sixty-four here made
   the two surfaces the same page twice. Every line, its sector median, its
   ranking and the sentence explaining it are under Dividend Grades on the
   Analysis tab, one click away through each hero's own link.

   ---------------------------------------------------------------------------
   The one card a factor tab has that this cannot
   ---------------------------------------------------------------------------

   A factor tab pairs its hero with the flake, highlighting the factor being
   read. The dividend is not an axis of that flake and will not become one —
   different universe, different scale, nothing in `scores` reads it — so the
   slot carries the four dividend composites instead, which answers the same
   question the flake is there to answer: where does this grade sit against
   the others without scrolling back.
   ========================================================================== */

import { el, isNum, dec } from './util.js';
import { card, notice, icon } from './ui.js';
import { gradePill, leadColumn } from './gradeview.js';
import { toneForLetter } from './grading.js';
import { DIV_MAX } from './dividend-score.js';
import {
  loadDividendScores, openDividendSection, divLines, divLeaders, divCheckCounts, divGradeList,
  lapsedNotice, reitNotice, seedNotice, disclosureBody, noTotalLine, notAPayer,
} from './dividend-grades.js';

/** The card id one composite's hero gets, so the grade lists can reach it. */
const heroId = (key) => `dvg-${key}`;

/**
 * The panel. Returns its host synchronously and fills it once the payer table
 * lands — the rest of the tab is already on screen by then, and a skeleton is
 * less use than the cards arriving.
 *
 * A nested grid rather than a run of cards spread into the tab's own: the
 * panel is one thing, and its cards should keep their twelve columns whatever
 * the panel above them is doing.
 */
export function dividendScoresPanel(a, nav = {}) {
  const host = el('div', { class: 'ovw ovw__c12 dvg' }, [
    card('dvg-loading', [
      el('div', { class: 'ocard__head' }, [el('h2', { text: 'Dividend grades' })]),
      el('p', { class: 'fhero__q', text: 'Ranking against sector payers…' }),
    ], 'ocard ovw__c12'),
  ]);

  loadDividendScores(a)
    .then((r) => host.replaceChildren(...cards(a, r, nav)))
    .catch((error) => host.replaceChildren(card('dvg-error', [
      el('div', { class: 'ocard__head' }, [el('h2', { text: 'Dividend grades' })]),
      notice(`The dividend grades could not be built — ${String(error?.message || error)}.`, 'notice--error'),
    ], 'ocard ovw__c12')));

  return [host];
}

function cards(a, r, nav) {
  if (!r.pays) return [overviewCard(a, r)];
  return [
    overviewCard(a, r),
    ...r.order.flatMap((key) => composite(a, r, r.factors[key], nav)),
  ];
}

/* ==========================================================================
   The overview

   The reason there is no fifth number, the warnings this company earns, and
   every disclosure the module owes — folded away, because the grades are what
   a reader came for. The four grades themselves are not here: each hero
   carries them beside it, picked out.
   ========================================================================== */

function overviewCard(a, r) {
  return card('dvg-overview', [
    el('div', { class: 'ocard__head' }, [el('h2', { text: 'Dividend grades' })]),
    el('p', { class: 'fhero__q', text: 'Four composites from the dividend module, each the weighted '
      + 'average of its own lines and each ranked against the dividend payers in this sector rather '
      + 'than against the whole of it.' }),

    r.pays ? noTotalLine(r) : notAPayer(a, r),

    r.pays ? seedNotice(r) : null,
    r.pays && r.lapsed ? lapsedNotice(r) : null,
    r.pays && r.inputs.sector === 'Real Estate' ? reitNotice() : null,

    r.pays ? el('details', { class: 'dvg-disc' }, [
      el('summary', { text: 'Where these grades come from' }),
      disclosureBody(r),
    ]) : null,
  ], 'ocard ovw__c12');
}

/* ==========================================================================
   One composite, as a factor tab lays out a factor
   ========================================================================== */

function composite(a, r, f, nav) {
  const metrics = divLines(f, r);
  const { above, below } = divLeaders(metrics, f.score);

  return [
    heroCard(a, r, f, metrics, nav),
    peersCard(r, f),
    (above.length || below.length) ? linesCard(a, f, above, below) : null,
  ].filter(Boolean);
}

/** Grade, how the lines sit against the payer median, and the way out. */
function heroCard(a, r, f, metrics, nav) {
  const width = isNum(f.score) ? (f.score / DIV_MAX) * 100 : 0;
  const share = isNum(f.coverage) ? Math.round(f.coverage * 100) : null;
  const checks = divCheckCounts(metrics);

  const tile = (state, count, label) => el('div', { class: `fcheck is-${state}` }, [
    icon(state, `fcheck__icon ${state}`),
    el('div', {}, [
      el('b', { text: String(count) }),
      el('span', { text: label }),
    ]),
  ]);

  return card(heroId(f.key), [
    el('div', { class: 'ocard__head' }, [
      el('h2', { text: f.title }),
      gradePill(f.score, f.letter, { size: 'lg' }),
    ]),
    el('p', { class: 'fhero__q', text: f.question }),

    el('div', { class: 'fhero__score' }, [
      el('b', { text: isNum(f.score) ? dec(f.score, 2) : '—' }),
      el('i', { text: `/${DIV_MAX}` }),
      el('span', { class: 'fhero__basis', text: `${f.gradedLines} of ${f.totalLines} lines weighted`
        + (isNum(share) ? ` · ${share}% of the designed weight` : '')
        + (f.rank ? ` · ${f.rank.text} of ${r.inputs.sector || 'sector'} payers` : '') }),
    ]),
    el('div', { class: 'gradebar' }, [
      el('div', {
        class: `gradebar__fill is-${toneForLetter(f.letter)}`,
        style: { width: `${width}%` },
      }),
    ]),

    el('p', { class: 'osub' }, [
      'Against the payer median',
      icon('info', 'ocard__info', 'How many of this composite’s lines fall on the better side of '
        + 'the median across sector payers. A reading aid only: the tick is never summed into a grade, '
        + 'and the score above is the weighted mean of the line percentiles rather than of these.'),
    ]),
    el('div', { class: 'fchecks' }, [
      tile('pass', checks.pass, 'beat the median'),
      tile('fail', checks.fail, 'below it'),
      tile('na', checks.na, 'not ranked'),
    ]),

    el('button', {
      type: 'button', class: 'omore', text: 'Read every line',
      onclick: () => openDividendSection(nav, f.anchor),
    }),
  ], 'ocard ovw__c8');
}

/** Where this grade sits against the other three. The flake's slot, unflaked. */
function peersCard(r, f) {
  return card(`dvg-peers-${f.key}`, [
    el('div', { class: 'ocard__head' }, [
      el('h2', {}, [
        'Against the other composites',
        icon('info', 'ocard__info', 'The four are deliberately not averaged. Safety, growth and yield '
          + 'pull against each other by construction, and the tension between them is the finding.'),
      ]),
    ]),
    divGradeList(r, { hrefFor: (s) => `#${heroId(s.key)}`, highlight: f.key }),
  ], 'ocard ovw__c4');
}

/**
 * The lines at both ends of the composite, in one card.
 *
 * One block rather than two, because the split is the point: the same columns
 * down both halves, so a line carrying the grade and one dragging it can be
 * read against each other without moving between cards.
 */
function linesCard(a, f, above, below) {
  return card(`dvg-${f.key}-lines`, [
    el('div', { class: 'ocard__head' }, [
      el('h2', {}, [
        'Lines behind the grade',
        icon('info', 'ocard__info', 'Split at the composite’s own score: every line on the left '
          + 'grades at or above it, every one on the right below it. Five of each at most, out of '
          + `${f.totalLines}. Every line, with its weight and the sentence behind it, is under `
          + 'Dividend Grades on the Analysis tab.'),
      ]),
    ]),
    el('div', { class: 'fleadgrid' }, [
      leadColumn(a, `Carrying the ${f.title.toLowerCase()} grade`, above),
      leadColumn(a, 'Holding it back', below),
    ]),
  ], 'ocard ovw__c12');
}
