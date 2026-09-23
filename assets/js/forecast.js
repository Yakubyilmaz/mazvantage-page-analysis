/* ==========================================================================
   Maz Vantage — the Analysts Forecast tab

   What the sell side expects, and what the company did against what they
   expected last time.

   Everything here is somebody else's number. The estimates are the vendor's
   aggregate of published analyst models; the price target is their mean; the
   consensus word is a tally of ratings. None of it is the report's own view,
   and none of it is graded — the one place the report does form a view on a
   forecast is the pair of hurdles in the first card, which come straight from
   the Momentum factor rather than being invented here.

   Two things shape the whole tab:

   - **A consensus is a mean of models, not a forecast.** Different analysts
     cover different horizons, so the far year is a thinner sample than the
     near one. The estimates table prints the analyst count per year for
     exactly this reason.
   - **Targets run optimistic across the board.** A +12% implied upside is not
     a bullish signal on its own; it is roughly what every name carries. That
     is why the first card measures it against the sector median rather than
     against zero.
   ========================================================================== */

import { el, isNum, money, pct, dec, cagr, price, fmtDate, ago, parseDate, signClass } from './util.js';
import { card, notice, feedGate, statLine, ohead, table, curSymbol } from './ui.js';
import { forecastChart, columnChart } from './charts.js';
import { analystForecastPanel } from './gradeview.js';

/* ==========================================================================
   The tab
   ========================================================================== */

export function renderForecastTab(a) {
  const fc = a.forecast || {};

  if (!fc.available || !fc.rows?.length) {
    return el('div', { class: 'ovw' }, [
      card('fx-none', [
        ohead('Analyst forecasts'),
        feedGate(a, 'estimates', 'Analyst estimates')
          || notice('No analyst estimates were returned for this company. Coverage is thin or '
            + 'absent for most companies outside the large caps.'),
      ], 'ocard ovw__c12'),
    ]);
  }

  return el('div', { class: 'ovw' }, [
    targetCard(a),
    consensusCard(a),
    outlookCard(a, 'revenue', 'Revenue outlook', {
      series: 'revenue', low: 'revenueLow', high: 'revenueHigh',
      info: 'Filed revenue to the left of the split, consensus to the right. The band is the '
        + 'spread between the lowest and highest estimate for that year.',
    }),
    outlookCard(a, 'eps', 'Earnings per share outlook', {
      series: 'eps', low: 'epsLow', high: 'epsHigh', perShare: true,
      info: 'Filed diluted EPS against consensus EPS. Consensus is usually a non-GAAP number '
        + 'and the filed figure is GAAP, so the step across the split is not purely a forecast.',
    }),
    surpriseCard(a),
    ratingCard(a),
    estimatesCard(a),
    quarterCard(a),
    basisCard(a),
  ]);
}

/* ---------- how often the consensus has been wrong ------------------------ */

/**
 * Reported quarters against what the street expected them to be.
 *
 * The point of the card is the calibration, not the beat. A company that
 * clears the consensus every quarter by four per cent is not outperforming —
 * it is guiding the consensus down, and the number under the chart that
 * matters is the *median* surprise rather than the hit rate. Both are shown,
 * because the hit rate is what everybody quotes.
 *
 * Bars are the surprise, not the EPS: two bars a hair apart on an absolute
 * scale hide the whole question, which is the gap between them.
 */
function surpriseCard(a) {
  const sp = a.surprises || { available: false, rows: [] };
  const rows = sp.rows.filter((r) => isNum(r.epsSurprise)).slice(-12);

  if (rows.length < 2) {
    return card('fx-surprise', [
      ohead('Against consensus'),
      feedGate(a, 'earnings', 'The earnings history')
        || notice('Not enough reported quarters with an estimate beside them to compare.'),
    ], 'ocard ovw__c8');
  }

  const cur = curSymbol(a.facts.currency);
  const values = rows.map((r) => r.epsSurprise);
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const beats = values.filter((v) => v >= 0).length;

  return card('fx-surprise', [
    ohead('Against consensus', null,
      'Each reported quarter’s earnings per share over the estimate that stood before it. '
      + 'A quarter is labelled by the calendar quarter the results were announced in — the feed '
      + 'carries no fiscal period, and inferring one from a date is guesswork for any company '
      + 'whose year does not end in December.'),

    columnChart(rows.map((r) => r.label), [{
      name: 'Surprise', color: 'var(--good)',
      colors: values.map((v) => (v < 0 ? 'var(--bad)' : 'var(--good)')),
      values,
    }], { height: 260, valueFmt: (v) => pct(v, { sign: true, dp: 1 }), legend: false }),

    el('div', { class: 'ostats ostats--split' }, [
      statLine('Beat the estimate', `${beats} of ${values.length}`, {
        note: pct(beats / values.length, { dp: 0 }),
        tone: beats === values.length ? 'pos' : '',
      }),
      statLine('Median surprise', pct(mid, { sign: true }), {
        tone: signClass(mid),
        title: 'The middle quarter, not the average — one blowout does not move it. A company '
          + 'that beats by the same small margin every quarter is being guided to, not '
          + 'outperforming.',
      }),
      statLine('Last quarter', isNum(rows.at(-1).eps) ? `${cur}${dec(rows.at(-1).eps, 2)}` : 'n/a', {
        note: isNum(rows.at(-1).epsEstimate)
          ? `against ${cur}${dec(rows.at(-1).epsEstimate, 2)} expected` : '',
      }),
    ]),
  ], 'ocard ovw__c8');
}

/* ---------- the vendor's own scorecard ------------------------------------ */

/**
 * FMP's rating, broken into the six tests behind it.
 *
 * Here because a reader who sees a letter grade at the top of a page is owed
 * the components, and because these are *not* the report's own grades — they
 * are scored against fixed thresholds rather than against a sector, which is
 * why a company like this one scores five for returns and one for price to
 * book in the same breath. Both facts are true and neither is the verdict.
 */
function ratingCard(a) {
  const r = a.ratings || { available: false, scores: [] };

  if (!r.available) {
    return card('fx-rating', [
      ohead('Vendor rating'),
      feedGate(a, 'ratings', 'The vendor rating')
        || notice('No vendor rating was returned for this company.'),
    ], 'ocard ovw__c4');
  }

  const MAX = 5;
  const tone = (v) => (v >= 4 ? 'strong' : v >= 3 ? 'mid' : v >= 2 ? 'weak' : 'poor');

  return card('fx-rating', [
    ohead('Vendor rating', r.rating
      ? el('span', { class: 'vpill vpill--score', text: r.rating }) : null,
      'Financial Modeling Prep’s own scorecard, one to five per test, scored against fixed '
      + 'thresholds rather than against a sector. It is not the Maz Vantage grade and the two '
      + 'will disagree — the Ratings tab is where this report answers for itself.'),

    el('div', { class: 'scorebars' }, r.scores.map((sc) => el('div', {
      class: 'scorebar', title: sc.note || null,
    }, [
      el('span', { class: 'scorebar__label', text: sc.label }),
      el('span', { class: 'scorebar__track' }, [
        el('span', {
          class: `scorebar__fill is-${tone(sc.value)}`,
          style: { width: `${(sc.value / MAX) * 100}%` },
        }),
      ]),
      el('b', { class: 'scorebar__value', text: String(sc.value) }),
    ]))),

    el('p', { class: 't-tiny subtle mt2', text: `Each test is scored out of ${MAX}. Hover a row `
      + 'for what it is measuring.' }),
  ], 'ocard ovw__c4');
}

/* ---------- 1. the price target ------------------------------------------- */

/**
 * The consensus target and the two hurdles the report holds it to.
 *
 * `analystForecastPanel` is the Momentum factor's own panel, reused whole
 * rather than reimplemented: it already asks the two questions worth asking
 * of a target — is the street keener on this name than on the sector, and
 * does the implied return pay for the risk of holding it — and having two
 * copies of that reasoning drift apart would be worse than the import.
 */
function targetCard(a) {
  return card('fx-target', [
    ohead('Price target', null,
      'The vendor’s mean of published targets, against two hurdles: the sector’s median implied '
      + 'upside, and this company’s own cost of equity.'),
    analystForecastPanel(a),
  ], 'ocard ovw__c8');
}

/* ---------- 2. the ratings tally ------------------------------------------ */

const RATING_BUCKETS = [
  { key: 'strongBuy', label: 'Strong buy', tone: 'strong' },
  { key: 'buy', label: 'Buy', tone: 'good' },
  { key: 'hold', label: 'Hold', tone: 'mid' },
  { key: 'sell', label: 'Sell', tone: 'weak' },
  { key: 'strongSell', label: 'Strong sell', tone: 'poor' },
];

/**
 * The ratings mix as bars.
 *
 * A consensus word alone hides its own margin: "Buy" from forty analysts who
 * all agree and "Buy" from a even split between strong buys and holds are
 * different facts. The bars are shares of the total, so the shape of the
 * disagreement is the thing on screen.
 */
function consensusCard(a) {
  const grades = a.ds.get('grades');
  const m = a.momentum || {};

  if (!grades || !isNum(m.analystTotal) || m.analystTotal <= 0) {
    return card('fx-consensus', [
      ohead('Analyst ratings'),
      feedGate(a, 'grades', 'Analyst ratings')
        || notice('No ratings breakdown is available for this company.'),
    ], 'ocard ovw__c4');
  }

  const total = m.analystTotal;

  return card('fx-consensus', [
    ohead('Analyst ratings', el('span', {
      class: 'pill pill--gold', text: grades.consensus || 'n/a',
    }), 'Every published rating the vendor tracks, bucketed. The score beside it puts the mix on '
      + 'a 1–5 scale, so a wall of strong buys reads as 5.'),

    el('div', { class: 'fxmix' }, RATING_BUCKETS.map((b) => {
      const n = isNum(grades[b.key]) ? grades[b.key] : 0;
      const share = (n / total) * 100;
      return el('div', { class: 'fxmix__row' }, [
        el('span', { class: 'fxmix__k', text: b.label }),
        el('span', { class: 'gradebar' }, [
          el('span', { class: `gradebar__fill is-${b.tone}`, style: { width: `${share}%` } }),
        ]),
        el('span', { class: 'fxmix__n', text: n ? String(n) : '—' }),
      ]);
    })),

    el('div', { class: 'ostats ostats--split' }, [
      statLine('Analysts rating', String(total)),
      statLine('Consensus score', isNum(m.analystScore) ? `${dec(m.analystScore, 2)} / 5` : 'n/a', {
        title: 'Strong buy counts 5, strong sell 1. The mean of every rating in the mix above.',
      }),
    ]),
  ], 'ocard ovw__c4');
}

/* ---------- 3. the outlook charts ----------------------------------------- */

/**
 * Filed history joined to the consensus path, with the estimate band.
 *
 * One chart, one split line. The alternative — history and forecast side by
 * side — makes the reader do the join themselves, and the join is the whole
 * question: does the consensus continue the line the company is already on,
 * or bend it.
 *
 * The two sources are not the same measure. Filed revenue is what the company
 * reported; consensus revenue is a mean of models, and consensus EPS is
 * usually non-GAAP where the filed figure is GAAP. The step across the split
 * therefore carries a definition change as well as a forecast, and each card
 * says so.
 */
function outlookCard(a, key, title, { series, low, high, perShare = false, info }) {
  const cur = curSymbol(a.facts.currency);
  const fmt = perShare ? (v) => price(v, cur) : (v) => money(v, { currency: cur });

  // Filed years first, then only the estimate years that come after them, so
  // the split lands where the last filing does and no year is drawn twice.
  const filedField = perShare ? 'epsDiluted' : 'revenue';
  const filed = (a.facts.statements.income || [])
    .filter((r) => isNum(r[filedField]))
    .slice(-6)
    .map((r) => ({ year: yearLabel(r.date), value: r[filedField] }));

  const lastFiled = filed.length ? Number(filed.at(-1).year) : null;
  const ahead = (a.forecast.rows || []).filter((r) => !isNum(lastFiled) || r.year > lastFiled);

  const points = [...filed.map((r) => r.year), ...ahead.map((r) => String(r.year))];
  const values = [...filed.map((r) => r.value), ...ahead.map((r) => r[series] ?? null)];
  const nulls = filed.map(() => null);

  if (points.length < 2 || !values.some(isNum)) {
    return card(`fx-${key}`, [
      ohead(title),
      notice('Not enough filed history and consensus to draw an outlook.'),
    ], 'ocard ovw__c12');
  }

  const chart = forecastChart(points, [{
    name: title,
    color: 'var(--brand-01)',
    values,
    low: [...nulls, ...ahead.map((r) => r[low] ?? null)],
    high: [...nulls, ...ahead.map((r) => r[high] ?? null)],
  }], { height: 300, valueFmt: fmt, splitAt: Math.max(filed.length - 1, 0) });

  const first = ahead[0];
  const last = ahead.at(-1);
  const bandWidth = first && isNum(first[low]) && isNum(first[high]) && isNum(first[series]) && first[series] > 0
    ? (first[high] - first[low]) / first[series] : null;

  // The three compound rates the band implies, from the last filed year to the
  // furthest estimate. Not from the first consensus year: the interesting
  // number is the rate off what the company has actually done, which is the
  // step the chart's split line draws.
  const base = filed.at(-1)?.value ?? null;
  const span = last && isNum(lastFiled) ? last.year - lastFiled : 0;
  const rate = (v) => cagr(base, v, span);
  const badges = span > 0 && isNum(base) && last ? el('div', { class: 'perfrow' }, [
    ['High', last[high], 'is-up'],
    ['Consensus', last[series], 'is-mid'],
    ['Low', last[low], 'is-down'],
  ].map(([label, v, cls]) => el('span', {
    class: `perfpill ${cls}`,
    title: `Compounded from filed ${lastFiled} to the ${last.year} estimate.`,
  }, [
    el('i', { text: `${label} CAGR` }),
    el('b', { text: isNum(rate(v)) ? pct(rate(v), { sign: true }) : 'n/a' }),
  ]))) : null;

  return card(`fx-${key}`, [
    ohead(title, null, info),
    chart,
    badges,
    el('div', { class: 'ostats ostats--split' }, [
      statLine(first ? `Consensus, ${first.year}` : 'Consensus', fmt(first?.[series]), {
        note: first ? analystNote(first, perShare) : '',
      }),
      statLine(last && last !== first ? `Consensus, ${last.year}` : 'Furthest estimate',
        fmt(last?.[series]), { note: last ? analystNote(last, perShare) : '' }),
      statLine('Spread of estimates', isNum(bandWidth) ? pct(bandWidth) : 'n/a', {
        note: first ? `of the ${first.year} consensus` : '',
        title: 'Highest estimate less lowest, over the mean. The wider it is, the less agreement '
          + 'sits behind the single line.',
      }),
    ]),
  ], 'ocard ovw__c12');
}

const yearLabel = (date) => String(new Date(date).getUTCFullYear());

/**
 * How far off a future date is.
 *
 * `ago()` in util.js measures backwards and returns "1m ago" for anything
 * under an hour — which is what it does with a date three months in the
 * future, because the difference goes negative and falls through its first
 * branch. This counts forward instead.
 */
function until(date) {
  const t = parseDate(date);
  if (!t) return '';
  const days = Math.round((t.getTime() - Date.now()) / 86400000);
  if (days < 0) return 'date has passed';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 45) return `in ${days} days`;
  const months = Math.round(days / 30);
  return `in about ${months} month${months === 1 ? '' : 's'}`;
}

const analystNote = (r, perShare) => {
  const n = perShare ? r.analystsEps : r.analystsRevenue;
  return isNum(n) ? `${n} analyst${n === 1 ? '' : 's'}` : '';
};

/* ---------- 4. the estimates themselves ----------------------------------- */

/**
 * Every estimate year the feed returned, as filed by the vendor.
 *
 * The analyst counts are the reason this table exists rather than only the
 * charts: a 2029 revenue line drawn from four models and a 2026 line drawn
 * from thirty look identical on a chart and are not the same claim.
 */
function estimatesCard(a) {
  const cur = curSymbol(a.facts.currency);
  const rows = a.forecast.rows || [];
  const m = (v) => money(v, { currency: cur });

  const body = rows.map((r) => [
    el('b', { text: String(r.year) }),
    m(r.revenue),
    isNum(r.revenueLow) && isNum(r.revenueHigh) ? `${m(r.revenueLow)} – ${m(r.revenueHigh)}` : 'n/a',
    m(r.netIncome),
    m(r.ebitda),
    isNum(r.eps) ? price(r.eps, cur) : 'n/a',
    isNum(r.epsLow) && isNum(r.epsHigh) ? `${price(r.epsLow, cur)} – ${price(r.epsHigh, cur)}` : 'n/a',
    isNum(r.analystsRevenue) || isNum(r.analystsEps)
      ? `${r.analystsRevenue ?? '—'} / ${r.analystsEps ?? '—'}` : 'n/a',
  ]);

  return card('fx-estimates', [
    ohead('Consensus estimates by year', null,
      'As the vendor aggregates them. The last column is how many analysts contributed a revenue '
      + 'estimate and how many an EPS estimate — the far years are usually a much thinner sample.'),

    table([
      { label: 'Fiscal year' },
      { label: 'Revenue', num: true }, { label: 'Revenue range', num: true },
      { label: 'Net income', num: true }, { label: 'EBITDA', num: true },
      { label: 'EPS', num: true }, { label: 'EPS range', num: true },
      { label: 'Analysts (rev / EPS)', num: true },
    ], body),

    el('p', { class: 't-tiny subtle mt2', text: 'Estimate years are fiscal, matching the '
      + 'company’s own year end rather than the calendar. Ranges are the lowest and highest '
      + 'individual estimate the vendor holds, not a confidence interval.' }),
  ], 'ocard ovw__c12');
}

/* ---------- 5. the last quarter ------------------------------------------- */

/**
 * Actual against estimate for the last reported quarter.
 *
 * The only quarterly figure in the whole dataset — every statement this app
 * fetches is annual — and the one place a forecast can be marked against what
 * actually happened. A surprise is divided by the magnitude of the estimate,
 * so a company expected to lose 20c and losing 10c reads as a beat.
 */
function quarterCard(a) {
  const q = a.quarter || {};
  const cur = curSymbol(a.facts.currency);

  if (!q.available) {
    return card('fx-quarter', [
      ohead('Last reported quarter'),
      feedGate(a, 'earnings', 'The earnings calendar')
        || notice('No reported quarter is available for this company.'),
    ], 'ocard ovw__c12');
  }

  const line = (label, actual, est, surprise, fmt) => el('div', { class: 'fxbeat' }, [
    el('p', { class: 'osub', text: label }),
    el('div', { class: 'fxbeat__figs' }, [
      el('div', {}, [
        el('b', { text: isNum(actual) ? fmt(actual) : 'n/a' }),
        el('i', { text: 'reported' }),
      ]),
      el('div', {}, [
        el('b', { class: 'subtle', text: isNum(est) ? fmt(est) : 'n/a' }),
        el('i', { text: 'expected' }),
      ]),
      el('div', {}, [
        el('b', { class: signClass(surprise), text: isNum(surprise) ? pct(surprise, { sign: true }) : 'n/a' }),
        el('i', { text: isNum(surprise) ? (surprise >= 0 ? 'beat' : 'missed') : 'surprise' }),
      ]),
    ]),
  ]);

  return card('fx-quarter', [
    ohead(`Last reported quarter — ${fmtDate(q.date)}`, null,
      'From the earnings calendar, the only quarterly figure in this dataset. A surprise is '
      + 'measured against the magnitude of the estimate, so beating a forecast loss counts as a '
      + 'beat.'),

    el('div', { class: 'fxbeats' }, [
      line('Earnings per share', q.eps, q.epsEstimate, q.epsSurprise, (v) => price(v, cur)),
      line('Revenue', q.revenue, q.revenueEstimate, q.revenueSurprise, (v) => money(v, { currency: cur })),
    ]),

    el('div', { class: 'ostats ostats--split' }, [
      statLine('Reported', fmtDate(q.date), { note: ago(q.date) }),
      statLine('Next expected report', q.next ? fmtDate(q.next) : 'not scheduled', {
        note: until(q.next),
      }),
    ]),
  ], 'ocard ovw__c12');
}

/* ---------- 6. what a consensus is ---------------------------------------- */

function basisCard(a) {
  const fc = a.forecast;
  const m = a.momentum || {};

  return card('fx-basis', [
    ohead('About these forecasts'),

    el('div', { class: 'ostats' }, [
      statLine('Estimate years', fc.rows.length ? `${fc.rows[0].year}–${fc.rows.at(-1).year}` : 'n/a'),
      statLine('Growth window', fc.base && fc.target ? `${fc.base.year}–${fc.target.year}` : 'n/a', {
        note: 'used for the headline growth rates',
      }),
      statLine('Analysts covering', isNum(fc.analystCount) ? String(fc.analystCount) : 'n/a', {
        note: 'most-covered estimate year',
      }),
      statLine('Implied upside', isNum(m.targetUpside) ? pct(m.targetUpside, { sign: true }) : 'n/a', {
        note: 'to consensus target',
      }),
    ]),

    el('p', { class: 'osub', text: 'How to read them' }),
    el('ul', { class: 'rlimits' }, [
      'Headline growth rates are the median year-on-year step across the window, not an '
        + 'endpoint-to-endpoint rate. Consensus paths often carry one bad year because a '
        + 'different subset of analysts covers each horizon, and a CAGR would inherit it whole.',
      'The estimate ranges are the lowest and highest individual model the vendor holds. They '
        + 'are a spread of opinion, not a probability interval.',
      'Consensus EPS is normally a non-GAAP figure. The filed EPS it is charted against is '
        + 'GAAP, so part of the step at the split line is a change of definition.',
      'Nothing on this tab is graded. The report scores the analyst view in one place only — '
        + 'the two hurdles at the top, which sit inside the Momentum factor.',
    ].map((text) => el('li', { text }))),
  ], 'ocard ovw__c12');
}
