/* ==========================================================================
   Maz Vantage — the Shariah compliance screen

   Five published index methodologies, run against the balance sheet this
   report already has. The model lives here rather than inside a view because
   two surfaces read it: the Overview's summary card and the tab below.

   What this is:

     a **mechanical screen** — two balance-sheet ratios and a business-activity
     keyword test, against each provider's published limits.

   What it is not:

     a **ruling**. Three of the tests the providers actually run are not run
     here at all, and one input is approximated. Every one of those gaps is
     named on the tab, because a green tick beside the word "compliant" is
     exactly the sort of thing that gets quoted without its caveats.

   The providers differ in one structural way and one numeric one. AAOIFI, S&P
   Global and Dow Jones divide by market capitalisation; FTSE and MSCI divide
   by total assets. That single choice is why the same company clears one
   screen and fails another — a highly valued company looks lightly geared
   against its market cap and heavily geared against its books.
   ========================================================================== */

import { el, isNum, pct, money } from './util.js';
import { card, notice, icon, statLine, ohead, table } from './ui.js';

/* ==========================================================================
   The model
   ========================================================================== */

/**
 * Industry and sector wordings a business-activity screen excludes outright.
 *
 * Keyword matching against the vendor's sector and industry strings, which is
 * as far as this data goes. It catches a bank and a distiller; it will not
 * catch a conglomerate with a financing arm, because nothing in the feed says
 * that arm exists.
 */
export const EXCLUDED_ACTIVITIES = [
  'bank', 'insurance', 'capital markets', 'credit services', 'mortgage',
  'financial data', 'asset management', 'gambling', 'casino', 'tobacco',
  'brewer', 'distiller', 'winerie', 'alcoholic',
];

/**
 * The five published screens, as data. `divisor` is the only structural
 * difference: AAOIFI and the two S&P Dow Jones families measure debt and cash
 * against market capitalisation, FTSE and MSCI against total assets.
 */
export const SHARIAH_STANDARDS = [
  { key: 'aaoifi', name: 'AAOIFI',     divisor: 'marketCap', debt: 0.30,   liquid: 0.30 },
  { key: 'sp',     name: 'S&P Global', divisor: 'marketCap', debt: 0.33,   liquid: 0.33 },
  { key: 'djim',   name: 'Dow Jones',  divisor: 'marketCap', debt: 0.33,   liquid: 0.33 },
  { key: 'ftse',   name: 'FTSE',       divisor: 'assets',    debt: 0.33,   liquid: 0.33 },
  { key: 'msci',   name: 'MSCI',       divisor: 'assets',    debt: 0.3333, liquid: 0.3333 },
];

export const SHARIAH_INFO = 'A mechanical screen, not a scholarly ruling. AAOIFI, S&P Global and '
  + 'Dow Jones measure debt and cash against market capitalisation; FTSE and MSCI against total '
  + 'assets, which is why the same company can pass one and fail another. Two further tests — '
  + 'non-compliant income and receivables — need fields outside the feeds loaded here and are '
  + 'not run, and the index providers screen on an averaged market cap (Dow Jones 24 months, '
  + 'S&P 36) where this has only the current one. Verify against the provider before relying '
  + 'on it.';

/** Is the business itself excluded, regardless of the balance sheet? */
export function excludedActivity(f) {
  const hay = `${f.industry || ''} ${f.sector || ''}`.toLowerCase();
  return EXCLUDED_ACTIVITIES.find((w) => hay.includes(w)) || null;
}

/**
 * One standard's verdict, with the arithmetic behind it.
 *
 * `state` is 'pass', 'fail', or 'na' when the balance sheet is too incomplete
 * to measure. The Overview card reads `state` and `note`; the tab reads the
 * rest.
 */
export function shariahVerdict(a, std) {
  const f = a.facts;
  const base = std.divisor === 'assets' ? f.totalAssets : f.marketCap;
  const basis = std.divisor === 'assets' ? 'assets' : 'market cap';
  const excluded = excludedActivity(f);

  if (excluded) {
    return {
      std, basis, base, excluded,
      state: 'fail', note: 'Excluded business activity',
      debt: null, liquid: null, debtOk: false, liquidOk: false,
    };
  }
  if (!isNum(base) || base <= 0 || !isNum(f.totalDebt) || !isNum(f.cash)) {
    return {
      std, basis, base, excluded: null,
      state: 'na', note: 'Not enough of the balance sheet is loaded',
      debt: null, liquid: null, debtOk: null, liquidOk: null,
    };
  }

  const debt = f.totalDebt / base;
  const liquid = f.cash / base;
  const debtOk = debt <= std.debt;
  const liquidOk = liquid <= std.liquid;

  return {
    std, basis, base, excluded: null,
    debt, liquid, debtOk, liquidOk,
    state: debtOk && liquidOk ? 'pass' : 'fail',
    note: `Debt ${pct(debt)} · cash ${pct(liquid)} of ${basis}`,
  };
}

/* ==========================================================================
   The tab
   ========================================================================== */

export function renderShariahTab(a) {
  const rows = SHARIAH_STANDARDS.map((std) => shariahVerdict(a, std));

  return el('div', { class: 'ovw' }, [
    verdictCard(a, rows),
    standardsCard(a, rows),
    ratioCard(a, rows),
    activityCard(a),
    limitsCard(a),
  ]);
}

/* ---------- 1. the verdict ------------------------------------------------ */

/**
 * The headline, which is a count rather than a word.
 *
 * There is no single answer to give: the five providers can and do disagree
 * on identical financials, so "compliant" would be true of some readers'
 * standard and false of others'. The count is the honest headline, and the
 * card underneath says which is which.
 */
function verdictCard(a, rows) {
  const f = a.facts;
  const passed = rows.filter((r) => r.state === 'pass').length;
  const failed = rows.filter((r) => r.state === 'fail').length;
  const unknown = rows.filter((r) => r.state === 'na').length;
  const excluded = excludedActivity(f);

  const tone = excluded ? 'bad'
    : unknown === rows.length ? 'muted'
    : failed === 0 ? 'good'
    : passed === 0 ? 'bad' : 'warn';

  const headline = excluded ? 'Excluded on activity'
    : unknown === rows.length ? 'Cannot be screened'
    : failed === 0 ? `Passes all ${rows.length}`
    : passed === 0 ? `Fails all ${rows.length}`
    : `Passes ${passed} of ${rows.length}`;

  return card('sh-verdict', [
    ohead(`${f.name} Shariah screen`, el('span', {
      class: `pill pill--${failed ? 'bad' : passed ? 'good' : 'muted'}`,
      text: `${passed} of ${rows.length} pass`,
    }), SHARIAH_INFO),

    el('p', { class: `rverdict is-${tone}`, text: headline }),

    el('p', { class: 'fhero__q', text: excluded
      ? `The screen stops at the business itself: ${f.industry || f.sector} is an excluded `
        + 'activity under every one of these methodologies, and no balance-sheet ratio can '
        + 'reverse that.'
      : 'Each provider asks the same two questions — how much of the company is funded by '
        + 'interest-bearing debt, and how much of it is cash and interest-bearing securities — '
        + 'and draws the line in a slightly different place.' }),

    el('div', { class: 'ostats ostats--split' }, [
      statLine('Business activity', excluded ? 'Excluded' : 'Not excluded', {
        tone: excluded ? 'neg' : '',
        note: excluded ? `matched “${excluded}”` : 'by sector and industry keyword',
      }),
      statLine('Total debt', money(f.totalDebt, { currency: 'US$' }), { note: 'TTM' }),
      statLine('Cash & equivalents', money(f.cash, { currency: 'US$' }), { note: 'TTM' }),
      statLine('Market capitalisation', money(f.marketCap, { currency: 'US$' }), { note: 'current' }),
      statLine('Total assets', money(f.totalAssets, { currency: 'US$' }), { note: 'TTM' }),
    ]),

    unknown ? el('p', { class: 't-tiny subtle mt2', text: `${unknown} of the `
      + `${rows.length} standards could not be measured from the balance sheet that loaded.` }) : null,
  ], 'ocard ovw__c8');
}

/* ---------- 2. the five standards ----------------------------------------- */

function standardsCard(a, rows) {
  return card('sh-standards', [
    ohead('By standard', null,
      'The same company against five published methodologies. A disagreement between them is '
      + 'not an error — it is the point of listing five.'),

    el('ul', { class: 'ostds' }, rows.map((r) => el('li', { class: 'ostd', title: r.note }, [
      icon(r.state, `check__icon ${r.state}`),
      el('span', { class: 'ostd__n' }, [
        el('b', { text: r.std.name }),
        el('i', { class: 'ostd__sub', text: `limits ${pct(r.std.debt, { dp: 0 })} of ${r.basis}` }),
      ]),
      el('span', { class: `ostd__v is-${r.state}`,
        text: r.state === 'pass' ? 'Pass' : r.state === 'fail' ? 'Fail' : 'n/a' }),
    ]))),
  ], 'ocard ovw__c4');
}

/* ---------- 3. the arithmetic --------------------------------------------- */

/**
 * Every provider's two ratios against its two limits, in one table.
 *
 * The figures repeat down the market-cap rows and again down the assets rows,
 * because only the divisor changes — which is exactly what the table is for.
 * Seeing the same debt figure read as 1.9% against market cap and 23.5%
 * against assets is the clearest statement of why the five disagree.
 */
function ratioCard(a, rows) {
  const cell = (value, limit, ok) => {
    if (!isNum(value)) return el('span', { class: 'subtle', text: 'n/a' });
    return el('span', { class: `shcell is-${ok ? 'pass' : 'fail'}` }, [
      el('b', { text: pct(value) }),
      el('i', { text: `limit ${pct(limit, { dp: 0 })}` }),
    ]);
  };

  const body = rows.map((r) => [
    el('b', { text: r.std.name }),
    r.basis === 'assets' ? 'Total assets' : 'Market cap',
    cell(r.debt, r.std.debt, r.debtOk),
    cell(r.liquid, r.std.liquid, r.liquidOk),
    el('span', { class: `ostd__v is-${r.state}`,
      text: r.state === 'pass' ? 'Pass' : r.state === 'fail' ? 'Fail' : 'n/a' }),
  ]);

  return card('sh-ratios', [
    ohead('The two ratios', null,
      'Interest-bearing debt over the divisor, and cash plus interest-bearing securities over the '
      + 'same divisor. Both must sit under the limit for that provider to pass.'),

    table([
      { label: 'Standard' }, { label: 'Measured against' },
      { label: 'Debt ratio', num: true }, { label: 'Cash ratio', num: true },
      { label: 'Verdict' },
    ], body),

    el('p', { class: 't-tiny subtle mt2', text: 'The cash test uses cash and short-term '
      + 'investments as the balance sheet reports them. The providers test cash plus '
      + 'interest-bearing securities specifically, which this feed does not separate out — where '
      + 'a company holds non-interest-bearing investments, the figure here is the stricter one.' }),
  ], 'ocard ovw__c12');
}

/* ---------- 4. the activity screen ---------------------------------------- */

function activityCard(a) {
  const f = a.facts;
  const hit = excludedActivity(f);

  return card('sh-activity', [
    ohead('The activity screen', el('span', {
      class: `pill pill--${hit ? 'bad' : 'good'}`,
      text: hit ? 'Excluded' : 'Not excluded',
    }), 'Keyword matching on the vendor’s sector and industry strings — the only description of '
      + 'the business this data carries.'),

    el('div', { class: 'ostats' }, [
      statLine('Sector', f.sector || 'n/a'),
      statLine('Industry', f.industry || 'n/a'),
      statLine('Screen result', hit ? `Excluded — matched “${hit}”` : 'No excluded activity matched',
        { tone: hit ? 'neg' : '' }),
    ]),

    el('p', { class: 'osub', text: 'Wordings that exclude a company outright' }),
    el('div', { class: 'shwords' }, EXCLUDED_ACTIVITIES.map((w) => el('span', {
      class: `shword ${hit === w ? 'is-hit' : ''}`.trim(), text: w,
    }))),

    el('p', { class: 't-tiny subtle mt2', text: 'This catches a company whose whole business is '
      + 'excluded — a bank, a brewer, a casino operator. It cannot catch an excluded activity '
      + 'inside a diversified group, such as a manufacturer’s financing arm or a retailer’s '
      + 'alcohol aisle, because nothing in this data says the segment exists. A revenue-based '
      + 'screen, which is what the providers run, needs segment disclosures this plan does not '
      + 'return.' }),
  ], 'ocard ovw__c12');
}

/* ---------- 5. what is not tested ----------------------------------------- */

/**
 * The gaps, listed rather than summarised.
 *
 * A screen that reports "passes 5 of 5" and stays quiet about the three tests
 * it never ran is not a cautious screen, it is a misleading one. Each entry
 * names the test, why it is missing, and which direction the omission pushes
 * the result.
 */
const NOT_TESTED = [
  {
    label: 'Non-compliant income',
    detail: 'Providers cap income from interest and from excluded activities at 5% of total '
      + 'revenue. That needs a revenue breakdown by source, which this data plan does not '
      + 'return. A company clearing both ratios here could still fail on this test.',
  },
  {
    label: 'Accounts receivable',
    detail: 'AAOIFI and several index families cap receivables — sometimes receivables plus '
      + 'cash — as a share of market capitalisation or assets. The balance sheet feed here does '
      + 'not carry a receivables line, so the test is not run.',
  },
  {
    label: 'Averaged market capitalisation',
    detail: 'Dow Jones screens on a trailing 24-month average market cap and S&P on 36 months. '
      + 'This uses the current one, so a company whose share price has just moved sharply will '
      + 'screen differently here than at the provider — and in the direction the recent move '
      + 'points.',
  },
  {
    label: 'Purification',
    detail: 'Passing a screen does not make the whole dividend permissible; the non-compliant '
      + 'share is conventionally donated. The fraction itself needs the income breakdown above, '
      + 'so it is not computed here — the Watchlist page does the rest of the arithmetic against '
      + 'a fraction you supply.',
  },
];

function limitsCard(a) {
  return card('sh-limits', [
    ohead('What this screen does not test'),

    el('p', { class: 'fgroup__desc', text: 'Three of the tests the index providers run are not '
      + 'run here, and one input is approximated. A pass above means the company clears the two '
      + 'balance-sheet ratios and the activity keywords — nothing more than that.' }),

    el('div', { class: 'shgaps' }, NOT_TESTED.map((g) => el('div', { class: 'shgap' }, [
      icon('na', 'check__icon na'),
      el('div', {}, [
        el('p', { class: 'check__label', text: g.label }),
        el('p', { class: 'check__note', text: g.detail }),
      ]),
    ]))),

    notice('This is a screening aid built from public financial data, not a fatwa and not '
      + 'investment advice. A scholar or the index provider’s own published constituent list is '
      + 'the authority; where this disagrees with either, they are right and this is wrong.'),
  ], 'ocard ovw__c12');
}
