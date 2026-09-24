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
   ========================================================================== */

import { isNum, pct } from './util.js';
import {
  F, LISTED, BILLION, rule, atLeast, atMost, between, scoreAtLeast,
  sortByScore, sortByFactor,
} from './ideas.js';
import { SHARIAH_STANDARDS, EXCLUDED_ACTIVITIES } from './shariah.js';


const AAOIFI = SHARIAH_STANDARDS.find((s) => s.key === 'aaoifi');

/** Debt over market capitalisation, from the balance sheet and the screener. */
const debtRatio = (c) => {
  const d = F.totalDebt(c);
  return (isNum(d) && isNum(c.marketCap) && c.marketCap > 0) ? d / c.marketCap : null;
};

const cashRatio = (c) => {
  const cash = F.cashAndShortTerm(c);
  return (isNum(cash) && isNum(c.marketCap) && c.marketCap > 0) ? cash / c.marketCap : null;
};

const shariahRules = () => [
  rule(`Interest-bearing debt under ${pct(AAOIFI.debt)} of market cap`, ['balance'],
    (c) => { const v = debtRatio(c); return isNum(v) && v <= AAOIFI.debt; }),
  rule(`Cash and short-term investments under ${pct(AAOIFI.liquid)} of market cap`, ['balance'],
    (c) => { const v = cashRatio(c); return isNum(v) && v <= AAOIFI.liquid; }),
  rule('Business activity not excluded', [], (c) => {
    const hay = `${c.industry || ''} ${c.sector || ''}`.toLowerCase();
    return !EXCLUDED_ACTIVITIES.some((w) => hay.includes(w));
  }),
];

const SHARIAH_NOTE = 'Screened on AAOIFI’s limits, the strictest of the five published sets, so a '
  + 'company here clears the other four on these two ratios as well. This is a mechanical screen '
  + 'and not a ruling: the non-compliant-income test, the receivables test and the averaged '
  + 'market-capitalisation basis the providers use are all absent, and any of the three could '
  + 'exclude a company that passes here. Verify against the provider before relying on it.';

/**
 * A Shariah screen with whatever extra rules the section wants on top.
 *
 * The compliance rules always come first so the funnel on the result page
 * reads as "this many were compliant, then this many of those were also
 * cheap" rather than the other way round — which is the order a reader
 * filtering for halal names actually thinks in.
 */
function shariahIdea({ key, title, tag, thesis, extra = [], sort, sortLabel, columns = [], note }) {
  return {
    key,
    group: 'Shariah',
    title,
    tag,
    thesis,
    universe: { ...LISTED, marketCapMoreThan: 1 * BILLION },
    rules: [...shariahRules(), ...extra],
    sort: sort || sortByScore,
    sortLabel: sortLabel || 'overall score',
    columns,
    note: `${note ? `${note} ` : ''}${SHARIAH_NOTE}`,
  };
}

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
