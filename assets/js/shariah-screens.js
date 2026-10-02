/* ==========================================================================
   Vanlior — the Shariah screens

   Two balance-sheet ratios against market capitalisation, plus the activity
   keywords. AAOIFI's limits are the strictest of the five published sets, so
   they are the ones screened on — a company clearing AAOIFI clears the other
   four, which makes a single list defensible where five overlapping ones
   would not be.

   ---------------------------------------------------------------------------
   Why these left `screens.js`
   ---------------------------------------------------------------------------

   They were five sections, each a page with its own run button. They are one
   table with the screen as a control now, the same move the Quant desk made,
   and a table needs its screens as **screener presets** rather than as page
   sections. So the definitions live here, `screener-presets.js` registers
   them, and `shariahdesk.js` lists them on a rail. One definition, three
   places that read it, and no threshold that can drift between them.

   The compliance rules moved to `ideas.js` when Investment Ideas gained a
   Halal group of its own: both surfaces build on them, and `ideas.js` is the
   one module both can import without a cycle.
   ========================================================================== */

import {
  F, atLeast, atMost, between, scoreAtLeast, sortByFactor, halalIdea, SHARIAH_NOTE,
} from './ideas.js';

/**
 * A Shariah screen with whatever extra rules the section wants on top.
 *
 * The compliance rules themselves live in `ideas.js` beside `halalIdea`,
 * because the Halal group of Investment Ideas is built on the same three —
 * one definition, so a threshold cannot say one thing on the desk and another
 * on the ideas page.
 */
const shariahIdea = (opts) => halalIdea({ ...opts, group: 'Shariah' });

/* ==========================================================================
   The five screens
   ========================================================================== */

/**
 * Every Shariah screen, in the order the rail reads.
 *
 * `id` is what the screener preset is called and what travels in `?collection=`;
 * `line` is the one sentence printed on the chip. The thesis, the rules and
 * the caveat all come from the idea itself, so a chip can never describe a
 * screen the table is not running.
 *
 * Compliance first, then the four that narrow it. A reader filtering for halal
 * names thinks "compliant, and then also cheap" rather than the other way
 * round, and the funnel under the table reads in that order because the
 * compliance rules are always first in `shariahIdea`.
 */
export const SHARIAH_SCREENS = [
  { id: 'halal-screener', sub: 'screener', label: 'Halal Screener', tag: 'Compliance',
    line: 'Every listed US company over a billion dollars that clears the two AAOIFI balance-sheet ratios and is not in an excluded line of business.' },
  { id: 'halal-top', sub: 'top', label: 'Top Halal Stocks', tag: 'Quality',
    line: 'Compliant on the two ratios, and scoring four or better out of five on this report’s composite.' },
  { id: 'halal-dividend', sub: 'dividend', label: 'Halal Dividend Stocks', tag: 'Income',
    line: 'Compliant names yielding between 2% and 8%, covered by earnings and by the cash that pays it.' },
  { id: 'halal-growth', sub: 'growth', label: 'Halal Growth Stocks', tag: 'Growth',
    line: 'Compliant names growing revenue and earnings at a double-digit rate.' },
  { id: 'halal-value', sub: 'value', label: 'Halal Value Stocks', tag: 'Value',
    line: 'Compliant names on a below-market earnings multiple that are still profitable.' },
];

/** The runnable screens, keyed the way `SHARIAH_SCREENS` names them. */
export const SHARIAH_IDEAS = [
  shariahIdea({
      key: 'halal-screener',
      title: 'Halal stock screener',
      tag: 'Compliance',
      thesis: 'Every listed US company over a billion dollars that clears the two AAOIFI '
        + 'balance-sheet ratios and is not in an excluded line of business. No quality filter at '
        + 'all — this is the compliance universe, and the other Shariah sections narrow it.',
      columns: ['debtToEquity', 'netDebtToEbitda'],
    }),
  shariahIdea({
      key: 'halal-top',
      title: 'Top halal stocks',
      tag: 'Compliance',
      thesis: 'Shariah-compliant on the two ratios, and scoring four or better out of five on '
        + 'our composite. Compliance first, quality second.',
      extra: [scoreAtLeast('profitability', 3.5), scoreAtLeast('health', 3.5)],
      note: 'The quality half of this screen is the report’s own profitability and financial '
        + 'health scores, each graded against the company’s sector.',
    }),
  shariahIdea({
      key: 'halal-dividend',
      title: 'Halal dividend stocks',
      tag: 'Income',
      thesis: 'Compliant names paying a yield between 2% and 8%, covered by earnings and by the '
        + 'cash that pays it.',
      extra: [
        between('Yield between 2% and 8%', F.dividendYield, 0.02, 0.08),
        atMost('Pays out under 65% of earnings', F.payout, 0.65),
      ],
      sort: (c) => F.dividendYield(c) ?? -1,
      sortLabel: 'dividend yield',
      columns: ['dividendYield', 'payout'],
      note: 'A dividend from a compliant company is not automatically compliant income in full — '
        + 'see Purification.',
    }),
  shariahIdea({
      key: 'halal-growth',
      title: 'Halal growth stocks',
      tag: 'Growth',
      thesis: 'Compliant names growing revenue and earnings at a double-digit rate.',
      extra: [
        atLeast('Revenue growing 10%+', F.revenueGrowth, 0.10),
        atLeast('Earnings per share growing 10%+', F.epsGrowth, 0.10),
      ],
      sort: sortByFactor('growth'),
      sortLabel: 'growth score',
      columns: ['revenueGrowth', 'epsGrowth'],
    }),
  shariahIdea({
      key: 'halal-value',
      title: 'Halal value stocks',
      tag: 'Value',
      thesis: 'Compliant names on a below-market earnings multiple that are still profitable — '
        + 'cheap, rather than merely fallen.',
      extra: [
        atMost('Price/earnings under 18x', F.pe, 18),
        atLeast('Return on equity of 10%+', F.roe, 0.10),
      ],
      sort: sortByFactor('valuation'),
      sortLabel: 'valuation score',
      columns: ['pe', 'roe'],
      note: 'A low multiple on a compliant balance sheet is a narrower universe than it sounds: '
        + 'the debt limit already excludes most of what screens cheap on leverage alone.',
    }),
];

export const shariahIdeaFor = (id) => SHARIAH_IDEAS.find((idea) => idea.key === id) || SHARIAH_IDEAS[0];
export const shariahScreen = (id) =>
  SHARIAH_SCREENS.find((screen) => screen.id === id) || SHARIAH_SCREENS[0];
/** The slug a menu item still travels as, to the screen it now opens. */
export const shariahScreenForSub = (sub) =>
  SHARIAH_SCREENS.find((screen) => screen.sub === sub) || null;

export { SHARIAH_NOTE };
