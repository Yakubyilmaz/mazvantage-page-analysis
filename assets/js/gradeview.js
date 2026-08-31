/* ==========================================================================
   Maz Vantage — graded factor views

   Renders one factor as: a header carrying its 0-5 score and letter, then a
   block per subtopic, then inside each block the ratio table —

     Ratio | Sector Relative Grade | AAPL | Sector Ranking

   — with a sentence under every row saying what the number means and why it
   graded the way it did.

   The tick beside each ratio name says which side of the sector median the
   company falls on. It is a reading aid and carries no weight: every score on
   the page is the mean of the metric grades above it.
   ========================================================================== */

import { el, esc, isNum, pct, dec, money, mult, yearOf, price as priceFmt } from './util.js';
import { card, blockEl, notice, icon, keyInfo, checkRow, feedGate, curSymbol } from './ui.js';
import {
  MODEL_GROUPS, MODELS, DEFAULT_MODEL_ID, DEFAULT_BASIS, modelById, allFairValues,
} from './valuation-models.js';
import { toneForLetter, letterFor, histogramRank, rankLabel, MAX_SCORE } from './grading.js';
import { FACTOR_BY_KEY } from './factors.js';
import { snowflake, AXES } from './snowflake.js';
import {
  columnChart, forecastChart, fairValueChart, rangeChart, valuationRangeChart,
  percentileStrip, sankeyChart, multiLineChart,
} from './charts.js';

/* ==========================================================================
   Small parts
   ========================================================================== */

/** The coloured A/B/C pill, with the numeric score beside it. */
export function gradePill(score, letter, { size = '' } = {}) {
  if (!isNum(score)) {
    return el('span', { class: 'grade grade--na', title: 'Not assessed' }, [
      el('b', { text: '–' }),
    ]);
  }
  return el('span', {
    class: `grade grade--${toneForLetter(letter)} ${size ? `grade--${size}` : ''}`.trim(),
    title: `${dec(score, 2)} out of ${MAX_SCORE}`,
  }, [
    el('b', { text: letter || '–' }),
    el('i', { text: dec(score, 2) }),
  ]);
}

/**
 * The Top/Bottom bar. Fill runs from the left and always represents "how
 * good", so a long bar is a good thing on every row regardless of whether the
 * underlying ratio is one you want high or low.
 */
function rankBar(m) {
  if (!m.rank || !isNum(m.pctile)) {
    return el('span', { class: 't-tiny subtle', text: 'n/a' });
  }
  return el('div', { class: 'rankbar' }, [
    el('div', { class: 'rankbar__track' }, [
      el('div', {
        class: `rankbar__fill is-${m.rank.side}`,
        style: { width: `${Math.max(2, Math.round(m.pctile * 100))}%` },
      }),
    ]),
    el('span', { class: `rankbar__label is-${m.rank.side}`, text: m.rank.text }),
  ]);
}

/**
 * The stand-in for a grade on a metric that is shown but never scored.
 *
 * Distinct from the `–` pill, which means the data was missing. This one means
 * the figure is here, it is correct, and it is deliberately outside the
 * average — see `ungraded` in factors.js.
 */
function notScored(why = 'Shown for context; deliberately outside the factor score') {
  return el('span', { class: 'grade grade--unscored', title: why }, [el('b', { text: '—' })]);
}

/** The median tick — display only, never scored. */
function medianTick(m) {
  const title = m.tickTitle
    || (m.vsMedian === 'pass' ? 'Better than the sector median'
      : m.vsMedian === 'fail' ? 'Worse than the sector median'
      : 'No sector median to compare against');
  return icon(m.vsMedian === 'na' ? 'na' : m.vsMedian, `tick tick--${m.vsMedian}`, title);
}

/* ==========================================================================
   The ratio table
   ========================================================================== */

/**
 * Header wording follows where the numbers actually came from, so the page
 * never claims a sector percentile it did not measure.
 */
function gradeColumnLabel(metrics) {
  const sources = new Set(metrics.filter((m) => m.state === 'ok').map((m) => m.source));
  if (sources.size === 1 && sources.has('peers')) return 'Peer Relative Grade';
  if (sources.size === 1 && sources.has('absolute')) return 'Grade';
  if (sources.has('peers')) return 'Relative Grade';
  return 'Sector Relative Grade';
}

function rankColumnLabel(metrics) {
  const sources = new Set(metrics.filter((m) => m.state === 'ok').map((m) => m.source));
  if (sources.size === 1 && sources.has('peers')) return 'Peer Ranking';
  if (sources.size === 1 && sources.has('absolute')) return 'Position';
  return 'Sector Ranking';
}

function gradeTable(a, metrics) {
  const sym = a.facts.symbol;

  const head = el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Ratio' }),
      el('th', { class: 'num', text: gradeColumnLabel(metrics) }),
      el('th', { class: 'num', text: sym }),
      el('th', { text: rankColumnLabel(metrics) }),
    ]),
  ]);

  const body = el('tbody', {});
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];

    // A trailing/forward pair collapses into one named block of two legs. Only
    // when its declared partner is genuinely the next metric — see RATIO_PAIRS.
    const pair = RATIO_PAIRS[m.id];
    const follow = pair && metrics[i + 1];
    if (pair && follow && follow.id === pair.with) {
      body.append(...pairRows(a, m, follow, pair));
      i++;
      continue;
    }

    const fmt = m.fmt || ((v) => dec(v, 2));

    // A ratio with its own panel takes the whole cell. Its chart already
    // states the figure and which side of fair value it falls, so a number,
    // grade pill and percentile bar beside it would only repeat that. The
    // grade still counts toward the factor average.
    const panel = METRIC_PANELS[m.id]?.(a, m) || null;
    if (panel) {
      body.append(el('tr', { class: 'ratio ratio--full' }, [
        el('td', { colspan: '4' }, [panel]),
      ]));
      continue;
    }

    body.append(el('tr', { class: `ratio ${m.state === 'ok' ? '' : 'is-na'}`.trim() }, [
      el('td', {}, [
        el('div', { class: 'ratio__name' }, [medianTick(m), el('span', { text: m.label })]),
      ]),
      el('td', { class: 'num' }, [m.ungraded ? notScored() : gradePill(m.grade, m.letter)]),
      el('td', { class: 'num ratio__value', text: isNum(m.value) ? fmt(m.value) : 'n/a' }),
      el('td', {}, [m.ungraded ? null : rankBar(m)]),
    ]));

    if (m.explanation) {
      body.append(el('tr', { class: 'ratio__whyrow' }, [
        el('td', { colspan: '4' }, [el('p', { class: 'ratio__why', text: m.explanation })]),
      ]));
    }

    // A chart that closes off a run of related rows — the trailing and
    // forward pair of one multiple — drawn after the last of them rather than
    // at the end of the whole subtopic.
    const after = ROW_CHARTS[m.id]?.(a) || null;
    if (after) {
      body.append(el('tr', { class: 'ratio__chartrow' }, [
        el('td', { colspan: '4' }, [after]),
      ]));
    }
  }

  return el('div', { class: 'tbl-wrap' }, [el('table', { class: 'tbl tbl--ratios' }, [head, body])]);
}

/* ==========================================================================
   Charts attached to particular subtopics

   Keyed `factor.group`. Everything here is optional — a missing feed returns
   null and the subtopic renders as its table alone.
   ========================================================================== */

/* ==========================================================================
   Trailing / forward pairs

   Three of the eight ratios in "What You Pay for a Single Share" are the same
   multiple twice — once on reported figures, once on next year's consensus.
   Rendered as six independent rows they read as six findings, when they are
   really three findings and a direction of travel.

   Pairing is presentation only. Both legs are still graded separately and both
   still vote in the factor average exactly as before; nothing here touches a
   score. Keyed by the leading metric, and only applied when the follower is
   the very next metric in the subtopic, so a reordered tree degrades to the
   old one-row-per-ratio layout rather than pairing the wrong two things.
   ========================================================================== */

const RATIO_PAIRS = {
  /* -- Valuation -------------------------------------------------------- */
  evToSalesTtm: {
    with: 'evToSalesFwd', label: 'EV / Sales', legs: ['TTM', 'FWD'],
    chartLabel: 'EV/Sales', sep: ' → ', delta: 'relative',
    sharedDist: true,
  },
  evToEbitdaTtm: {
    with: 'evToEbitdaFwd', label: 'EV / EBITDA', legs: ['TTM', 'FWD'],
    chartLabel: 'EV/EBITDA', sep: ' → ', delta: 'relative',
    sharedDist: true,
  },
  evToEbitTtm: {
    with: 'evToEbitFwd', label: 'EV / EBIT', legs: ['TTM', 'FWD'],
    chartLabel: 'EV/EBIT', sep: ' → ', delta: 'relative',
    sharedDist: true,
  },
  peGaapTtm: {
    with: 'peNonGaapFwd', label: 'Price / Earnings', legs: ['GAAP TTM', 'Non-GAAP FWD'],
    chartLabel: 'P/E', sep: ' → ', delta: 'relative',
    sharedDist: true,
  },
  pegGaap: {
    with: 'pegNonGaap', label: 'Price / Earnings to Growth', legs: ['GAAP TTM', 'Non-GAAP FWD'],
    chartLabel: 'PEG', sep: ' → ', delta: 'relative',
    sharedDist: true,
  },
  priceToSalesTtm: {
    with: 'priceToSalesFwd', label: 'Price / Sales', legs: ['TTM', 'FWD'],
    chartLabel: 'P/S', sep: ' → ', delta: 'relative',
    sharedDist: true,
  },
  // Two answers to one question — how dear is this P/E against everything
  // else — so they share a row and a chart. The chart is the peer one, which
  // carries the sector median as a bar of its own; drawing the default
  // two-bar pair chart here would compare two percentages against nothing.

  /* -- Valuation -------------------------------------------------------- */
  earningsYieldTtm: {
    with: 'fcfYieldTtm', label: 'Yield on the price paid', legs: ['Earnings', 'Free cash flow'],
    chartLabel: 'Yield', sep: ' → ', delta: 'points', deltaAgainst: 'earnings',
  },

  /* -- Profitability ---------------------------------------------------- */
  // Two different quantities in the same units, so no delta: the gap between a
  // margin's wobble and a growth rate's wobble is not a quantity.
  marginStability5y: {
    with: 'revenueVariability5y', label: 'Consistency (5Y)', legs: ['Net margin', 'Revenue growth'],
    chartLabel: 'Variability', delta: 'none',
  },

  /* -- Financial Health ------------------------------------------------- */
  debtToEquity: {
    with: 'netDebtToEquity', label: 'Debt / equity', legs: ['Gross', 'Net of cash'],
    chartLabel: 'Debt/equity', sep: ' → ', delta: 'relative', deltaAgainst: 'gross',
  },
  debtToEbitda: {
    with: 'netDebtToEbitda', label: 'Debt / EBITDA', legs: ['Gross', 'Net of cash'],
    chartLabel: 'Debt/EBITDA', sep: ' → ', delta: 'relative', deltaAgainst: 'gross',
  },
  longTermDebtToCapital: {
    with: 'debtToCapital', label: 'Debt / capital', legs: ['Long-term only', 'All debt'],
    chartLabel: 'Debt/capital', sep: ' → ', delta: 'points', deltaAgainst: 'long-term',
  },
  ocfToDebt: {
    with: 'fcfToDebt', label: 'Cash flow / debt', legs: ['Operating', 'Free'],
    chartLabel: 'Cash/debt', sep: ' → ', delta: 'points', deltaAgainst: 'operating',
  },
  revenueGrowthVsPeers: {
    with: 'revenueGrowthVsSector', label: 'Revenue growth against the field',
    legs: ['vs peers', 'vs sector median'], chartLabel: 'Growth gap',
    delta: 'points', deltaTone: 'neutral', deltaAgainst: 'the peer average',
    chart: (a) => peerGrowthChart(a),
  },
  peVsPeers: {
    with: 'peVsSector', label: 'P/E against the field', legs: ['vs peers', 'vs sector median'],
    chartLabel: 'P/E gap', delta: 'points', deltaTone: 'neutral', deltaAgainst: 'the peer average',
    chart: (a) => peerPeChart(a),
  },

  /* -- Growth ----------------------------------------------------------- */
  epsGrowth: {
    with: 'epsDilutedGrowth', label: 'EPS growth', legs: ['Basic', 'Diluted'],
    chartLabel: 'EPS growth', sep: ' → ', delta: 'points',
  },
  ocfGrowth: {
    with: 'fcfGrowth', label: 'Cash flow growth', legs: ['Operating', 'Free'],
    chartLabel: 'Cash flow growth', sep: ' → ', delta: 'points', deltaAgainst: 'operating',
  },
  fwdEarningsGrowth: {
    with: 'fwdEpsGrowth', label: 'Forecast growth', legs: ['Earnings', 'Per share'],
    chartLabel: 'Forecast growth', sep: ' → ', delta: 'points', deltaAgainst: 'earnings',
  },
  dpsGrowth: {
    with: 'dividendGrowth3y', label: 'Dividend growth', legs: ['1 year', '3 year'],
    chartLabel: 'Dividend growth', delta: 'points', deltaAgainst: '1 year',
    deltaTone: 'neutral',
  },

  /* -- Profitability ---------------------------------------------------- */
  assetTurnover: {
    with: 'fixedAssetTurnover', label: 'Asset turnover', legs: ['All assets', 'Fixed assets'],
    chartLabel: 'Turnover', delta: 'none',
  },

  /* -- Financial Health ------------------------------------------------- */
  bookValuePerShare: {
    with: 'tangibleBookValuePerShare', label: 'Book value per share',
    legs: ['Reported', 'Tangible'], chartLabel: 'Book / share', sep: ' → ',
    delta: 'relative', deltaAgainst: 'reported',
  },

  /* -- Momentum --------------------------------------------------------- */
  excessReturn1yVsSector: {
    with: 'excessReturn1yVsMarket', label: 'Excess return (1Y)',
    legs: ['vs sector', 'vs market'], chartLabel: 'Excess return',
    delta: 'points', deltaAgainst: 'the sector',
    deltaTone: 'neutral',
  },
  priceToAvg50: {
    with: 'priceToAvg200', label: 'Price vs moving average', legs: ['50-day', '200-day'],
    chartLabel: 'Price vs average', delta: 'relative', deltaAgainst: 'the 50-day',
    deltaTone: 'neutral',
  },
};

/** One leg of a pair: its own tick, grade, value and sector rank. */
function pairLegCells(m, pair, legLabel, twin) {
  const fmt = pair.fmt || m.fmt || ((v) => dec(v, 2));

  // The second leg carries the move against the first. That delta is the only
  // thing the second row says that the first does not.
  //
  // How to express it depends on what the ratio is. A multiple moving from
  // 36.5x to 36.2x has fallen 0.8% — a proportion. A growth rate moving from
  // 8% to 16% has not "risen 100%"; it has risen eight points. Ratios take the
  // proportion, rates take the difference, and the colour follows the metric's
  // own `better` rather than assuming lower is always the good direction.
  let delta = null;
  const mode = pair.delta || 'relative';
  if (twin && mode !== 'none' && isNum(m.value) && isNum(twin.value)) {
    let change = null;
    let text = null;
    if (mode === 'points') {
      change = m.value - twin.value;
      text = `${change > 0 ? '+' : ''}${dec(change * 100, 1)} pts`;
    } else if (twin.value !== 0) {
      change = m.value / twin.value - 1;
      text = `${change > 0 ? '+' : ''}${pct(change)}`;
    }
    if (isNum(change)) {
      // Some pairs are two alternatives rather than a progression — a one-year
      // against a three-year rate, a return measured against two different
      // benchmarks — and there the move is a fact, not an improvement.
      const good = (m.better === 'low') ? change < 0 : change > 0;
      const tone = pair.deltaTone === 'neutral' ? 'is-neutral' : good ? 'is-better' : 'is-worse';
      delta = el('span', {
        class: `pair__delta ${tone}`,
        text: `${text} vs ${pair.deltaAgainst || pair.legs[0]}`,
      });
    }
  }

  return [
    el('td', { class: 'num' }, [
      el('div', { class: 'pair__gradecell' }, [
        el('span', { class: 'pair__leg', text: legLabel }),
        medianTick(m),
        m.ungraded ? notScored() : gradePill(m.grade, m.letter),
      ]),
    ]),
    el('td', { class: 'num ratio__value' }, [
      el('span', { text: isNum(m.value) ? fmt(m.value) : 'n/a' }),
      delta,
    ]),
    el('td', {}, [m.ungraded ? null : rankBar(m)]),
  ];
}

/**
 * Two rows sharing one name cell, then one explanation, then the chart.
 *
 * `rowspan` rather than CSS, so the name genuinely spans its two legs and the
 * table keeps its four columns for every other ratio in the subtopic.
 */
function pairRows(a, lead, follow, pair) {
  const out = [];

  out.push(el('tr', { class: 'ratio ratio--pair ratio--pairtop' }, [
    el('td', { rowspan: '2' }, [
      el('div', { class: 'pair__name' }, [
        el('span', { class: 'pair__title', text: pair.label }),
        el('span', { class: 'pair__subtitle', text: pair.legs.join(pair.sep || ' · ') }),
      ]),
    ]),
    ...pairLegCells(lead, pair, pair.legs[0], null),
  ]));

  out.push(el('tr', { class: 'ratio ratio--pair ratio--pairbottom' },
    pairLegCells(follow, pair, pair.legs[1], lead)));

  // Each sentence carries its own leg's tick. The pair puts two explanations
  // in one cell, and without a marker there is nothing tying the second one
  // back to the forward row it belongs to — the reader has to infer it from
  // the wording.
  const why = [lead, follow]
    .map((m, i) => (m.explanation
      ? el('p', { class: `ratio__why ratio__why--ticked ${i ? 'pair__why--second' : ''}`.trim() }, [
        medianTick(m),
        el('span', { text: m.explanation }),
      ])
      : null))
    .filter(Boolean);
  if (why.length) {
    out.push(el('tr', { class: 'ratio__whyrow ratio__whyrow--pair' }, [
      el('td', { colspan: '4' }, why),
    ]));
  }

  const chart = pair.chart ? pair.chart(a, lead, follow) : pairChart(a, lead, follow, pair);
  if (chart) {
    out.push(el('tr', { class: 'ratio__chartrow' }, [el('td', { colspan: '4' }, [chart])]));
  }
  return out;
}

/* ==========================================================================
   Subtopic summary

   Eight rank bars in a column all look the same. This says, in one line and
   one axis, how the subtopic reads as a whole and which ratio is the outlier
   worth arguing with.
   ========================================================================== */

function subtopicSummary(a, metrics) {
  const live = metrics.filter((m) => isNum(m.pctile) && isNum(m.grade));
  if (live.length < 4) return null;

  const rows = live.map((m) => ({
    label: m.label,
    pctile: m.pctile,
    valueText: isNum(m.value) ? (m.fmt || ((v) => dec(v, 2)))(m.value) : null,
    rankText: m.rank?.text || null,
  }));

  const sorted = [...rows].sort((a2, b2) => a2.pctile - b2.pctile);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  // `vsMedian` is the display tick: 'fail' means worse than the median, which
  // already accounts for the metrics where low is the good direction. Keeping
  // the wording on that axis rather than on price is what lets one summary
  // serve a valuation subtopic and a profitability one — "more expensive" is
  // true of a high P/E and meaningless of a high return on equity.
  const worse = live.filter((m) => m.vsMedian === 'fail').length;
  const word = (n) => ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten'][n] ?? String(n);
  const where = a.facts.sector || 'sector';

  const headline = worse === live.length
    ? `All ${word(live.length)} rank worse than the ${where} median.`
    : worse === 0
      ? `All ${word(live.length)} rank better than the ${where} median.`
      : `${word(worse).replace(/^./, (ch) => ch.toUpperCase())} of the ${word(live.length)} `
        + `${worse === 1 ? 'ranks' : 'rank'} worse than the ${where} median.`;

  // Where every ratio lands in the same percentile bucket the extremes carry
  // the same label, and naming both would read as a contradiction rather than
  // as a tight spread.
  const spread = strongest.rankText && strongest.rankText === weakest.rankText
    ? ` Every one of them lands at ${strongest.rankText}.`
    : ` Strongest is ${strongest.label}${strongest.rankText ? ` at ${strongest.rankText}` : ''};`
      + ` weakest is ${weakest.label}${weakest.rankText ? ` at ${weakest.rankText}` : ''}.`;

  return el('div', { class: 'blocksum' }, [
    el('p', { class: 'blocksum__line', text: headline + spread }),
    percentileStrip(rows),
  ]);
}

/* ==========================================================================
   Full-width ratio panels

   A ratio listed here owns its whole table cell instead of filling four
   columns — see gradeTable. It gets the metric's graded result but is free to
   ignore it, which is what lets the fair-value panel swap in a different
   model's answer.
   ========================================================================== */

const METRIC_PANELS = {
  dcfDiscount: (a, m) => fairValuePanel(a, m),
};

/**
 * Fair value against the market price, under a choice of valuation model.
 *
 * The pickers drive everything below them: the chart, the tick beside the
 * heading, the sentence and the assumptions table. Two pickers, because a
 * relative multiple is two decisions — which multiple, and what to set it
 * against — and collapsing them into one menu of eighteen entries would hide
 * that the second one is a judgement call.
 *
 * The range chart underneath ignores both. It always shows every model that
 * produced a number, because the spread between them is the honest answer to
 * "what are the cash flows worth", and no single selection can state it.
 *
 * None of this touches the factor score. See `ungraded` in factors.js.
 */
function fairValuePanel(a, m) {
  const cur = curSymbol(a.facts.currency);
  const price = a.facts.price;

  const tickHost = el('span', { class: 'ratio__tickhost' });
  const why = el('p', { class: 'ratio__why' });
  const body = el('div', { class: 'ratio__chart' });
  const workings = el('div', { class: 'fv__workings' });

  const select = el('select', { class: 'ratio__model', 'aria-label': 'Valuation model' },
    MODEL_GROUPS.map((g) => el('optgroup', { label: g.label },
      g.models.map((mo) => el('option', { value: mo.id, text: mo.label })))));
  select.value = DEFAULT_MODEL_ID;

  const basisSelect = el('select', { class: 'ratio__model ratio__model--basis', 'aria-label': 'Target multiple basis' });
  const basisWrap = el('label', { class: 'fv__basis' }, [
    el('span', { class: 'fv__basislabel', text: 'against' }), basisSelect,
  ]);
  let basis = DEFAULT_BASIS;   // what the calculation actually uses
  let pinned = null;           // what the reader explicitly asked for, if anything

  /** Rebuild the basis options for the selected model, reasons and all. */
  const syncBases = (model) => {
    if (!model.relative) { basisWrap.hidden = true; return; }
    basisWrap.hidden = false;
    const opts = model.bases(a);
    basisSelect.replaceChildren(...opts.map((b) => el('option', {
      value: b.id,
      disabled: !b.available,
      title: b.why,
      text: b.available ? `${b.label} · ${mult(b.target)}` : `${b.label} — unavailable`,
    })));

    // The reader's own choice wins wherever the chosen multiple offers it, and
    // survives a detour through one that does not — pick the ten-year median on
    // P/E, look at EV/EBITDA where no history exists, come back, and P/E is
    // still on history. The fallback applies to the model that needs it and no
    // further; letting it stick would silently re-target every later model.
    const ok = (id) => opts.some((b) => b.id === id && b.available);
    const want = pinned && ok(pinned) ? pinned : DEFAULT_BASIS;
    basis = ok(want) ? want : (opts.find((b) => b.available)?.id || DEFAULT_BASIS);
    basisSelect.value = basis;
  };

  const draw = () => {
    const model = modelById(select.value);
    syncBases(model);

    let res = null;
    try { res = model.fairValue(a, { basis }); } catch { res = null; }
    const fair = res && isNum(res.value) ? res.value : null;

    // The tick follows the selected model: undervalued passes, overvalued
    // fails, and a model that cannot run is neither.
    const state = fair == null ? 'na' : fair > price ? 'pass' : 'fail';
    const title = fair == null ? 'This model has no value to compare against'
      : state === 'pass' ? 'Trades below this model’s fair value'
      : 'Trades above this model’s fair value';
    tickHost.replaceChildren(icon(state, `tick tick--${state}`, title));

    if (fair == null) {
      // Three ways to have no number, and they are not the same thing: the
      // model is unbuilt, the basis has no sample, or the company's own figure
      // makes the multiple meaningless. Each gets its own sentence.
      const blocked = res?.blocked
        || 'No target multiple is available on this basis for this company.';
      why.textContent = `${model.basis} ${blocked}`;
      body.replaceChildren(notice(
        `<b>${esc(model.label)}</b> cannot value ${esc(a.facts.symbol)}. ${esc(blocked)}`));
      workings.replaceChildren();
      return;
    }

    // Measured against fair value, not against price — the same denominator
    // the chart's own "overvalued" figure uses, so the two agree.
    const gap = fair > 0 ? 1 - price / fair : null;
    const from = res.basisLabel
      ? ` Its target ${model.short} of ${mult(res.target)} is the ${res.basisLabel}`
        + (isNum(res.n) ? ` of ${res.n} companies.` : '.')
      : '';
    why.textContent = isNum(gap)
      ? `${a.facts.symbol} trades at ${priceFmt(price, cur)}, `
        + `${pct(Math.abs(gap))} ${gap > 0 ? 'below' : 'above'} the ${priceFmt(fair, cur)} `
        + `this model puts on it. ${model.basis}${from}`
      : model.basis;
    body.replaceChildren(fairValueChart({ current: price, fair, currency: cur }));
    workings.replaceChildren(assumptions(res, cur), projectionChart(res, cur));
  };

  // The basis moves six of the dots on the range chart, and picking a model
  // can move the basis on its own — see syncBases — so both pickers redraw
  // the panel and the chart together rather than each owning half of it.
  const range = rangeBlock(a, cur, () => basis);
  const rerender = () => { draw(); range.repaint(); };

  select.addEventListener('change', rerender);
  basisSelect.addEventListener('change', () => { pinned = basisSelect.value; rerender(); });
  rerender();

  return el('div', { class: 'ratio__panel' }, [
    el('div', { class: 'ratio__panelhead' }, [
      el('div', { class: 'ratio__name' }, [tickHost, el('span', { text: m.label })]),
      el('div', { class: 'fv__pickers' }, [select, basisWrap]),
    ]),
    why,
    body,
    workings,
    range.node,
  ]);
}

/** The arithmetic behind the selected model, one row per step. */
function assumptions(res, cur) {
  if (!res.steps?.length) return el('div');

  const fmtStep = (s) => {
    if (!isNum(s.value)) return 'n/a';
    if (s.kind === 'mult') return mult(s.value);
    if (s.kind === 'pct') return pct(s.value);
    // `pct` drops trailing zeros, so a 9.00% discount rate prints as "9%" and
    // reads as if it were rounded. A DCF is sensitive enough to the rate that
    // the two decimals should always be there.
    if (s.kind === 'rate') return `${dec(s.value * 100, 2)}%`;
    if (s.kind === 'years') return `${s.value} years`;
    if (s.kind === 'money') return money(s.value, { currency: cur });
    // dp:0 collapses a 14.69b share count to "15b", which is not a share count.
    if (s.kind === 'count') return money(s.value, { currency: '', dp: 2 }).trim();
    return priceFmt(s.value, cur);
  };

  return el('details', { class: 'fv__assume', open: true }, [
    el('summary', { text: 'Assumptions' }),
    el('table', { class: 'fv__steps' }, [
      el('tbody', {}, res.steps.map((s) => el('tr', { class: s.total ? 'is-total' : '' }, [
        el('td', {}, [
          el('span', { text: s.label }),
          s.note ? el('span', { class: 'fv__stepnote', text: s.note }) : null,
        ]),
        el('td', { class: 'num', text: fmtStep(s) }),
      ]))),
    ]),
    res.note ? el('p', { class: 'fv__assumenote', text: res.note }) : null,
  ]);
}

/**
 * The free cash flow a DCF actually discounted, year by year.
 *
 * Bars past the consensus are shaded as forecasts, which is the honest way to
 * show that a ten-year model runs five years past anything an analyst said.
 */
function projectionChart(res, cur) {
  const rows = res.projection;
  if (!rows?.length) return el('div');
  const invented = rows.filter((r) => !r.estimated).length;
  const covered = rows.length - invented;

  return el('div', { class: 'fv__projection' }, [
    el('h4', { class: 'fv__rangetitle', text: 'Free cash flow discounted' }),
    columnChart(
      rows.map((r) => String(r.year)),
      [{ name: 'Free cash flow', color: 'var(--brand-01)', values: rows.map((r) => r.fcff) }],
      {
        height: 220,
        valueFmt: (v) => money(v, { currency: cur }),
        forecastFrom: invented ? covered : null,
        legend: false,
      },
    ),
    el('p', { class: 'fv__assumenote', text: invented
      ? `${covered} years from analyst consensus, used as published. The shaded ${invented} run past it.`
      : `All ${covered} years from analyst consensus, used as published.` }),
  ]);
}

/**
 * Every model that produced a number, on one axis.
 *
 * Repainted when the basis changes, because the basis moves six of the dots.
 */
function rangeBlock(a, cur, getBasis) {
  const caption = el('p', { class: 'ratio__why' });
  const chart = el('div', { class: 'ratio__chart' });
  const node = el('div', { class: 'fv__range' }, [
    el('h4', { class: 'fv__rangetitle', text: 'Every model, side by side' }),
    caption,
    chart,
  ]);

  const repaint = () => {
    const rows = allFairValues(a, { basis: getBasis() });
    chart.replaceChildren(valuationRangeChart(rows, { current: a.facts.price, currency: cur }));
    if (!rows.length) {
      caption.textContent = 'No model produced a fair value for this company.';
      return;
    }
    const lo = rows[0];
    const hi = rows[rows.length - 1];
    const under = rows.filter((r) => r.value > a.facts.price).length;
    caption.textContent = `${rows.length} of ${MODELS.length} models produced a value, from `
      + `${priceFmt(lo.value, cur)} (${lo.full}) to ${priceFmt(hi.value, cur)} (${hi.full}). `
      + (under === 0 ? 'None of them puts it above the market price.'
        : under === rows.length ? 'All of them put it above the market price.'
        : `${under} of ${rows.length} put it above the market price.`);
  };

  return { node, repaint };
}

/**
 * One multiple, trailing against forward, both against the sector.
 *
 * The forward figure is ranked against the *trailing* distribution — the same
 * ratio family, and no vendor publishes a forward one — so the median bar is
 * identical either side. That is stated under the chart rather than left to
 * look like a drawing error.
 */
/**
 * One measure, two views, against the sector.
 *
 * Each leg brings its own median rather than sharing one: a trailing/forward
 * pair genuinely does share a distribution — no vendor publishes a forward
 * one, so the forward figure borrows its trailing twin's — but a pair like
 * "excess return vs sector / vs market" is two distributions, and drawing one
 * median across both would invent a comparison. The note only appears where
 * the yardstick really is shared, which is also the only place it is true.
 */
function pairChart(a, lead, follow, pair) {
  if (!isNum(lead.value) && !isNum(follow.value)) return null;
  const valueFmt = pair.fmt || lead.fmt || follow.fmt || ((v) => dec(v, 2));
  // Declared, not inferred. Two legs can land on the same median by accident —
  // the seed table gives basic and diluted EPS growth identical distributions —
  // and that is not the same fact as a forward metric deliberately borrowing
  // its trailing twin's yardstick because no vendor publishes a forward one.
  const shared = pair.sharedDist === true;

  return el('div', {}, [
    columnChart(
      pair.legs.map((leg) => `${pair.chartLabel} · ${leg}`),
      [
        {
          name: a.facts.symbol, color: 'var(--brand-01)',
          values: [lead.value ?? null, follow.value ?? null],
        },
        {
          name: `${a.facts.sector || 'Sector'} median`, color: 'var(--chart-01)',
          values: [lead.median ?? null, follow.median ?? null],
        },
      ],
      { valueFmt, height: 240 },
    ),
    shared ? el('p', { class: 't-tiny subtle mt1', text: `Both are ranked against the trailing `
      + `${pair.chartLabel} distribution — the same yardstick, which is why the median does not `
      + 'move between them.' }) : null,
  ]);
}

/* ==========================================================================
   Subtopics that are a panel rather than a table of ratios
   ========================================================================== */

/**
 * The twelve-month analyst target range, and whether the implied upside beats
 * simply owning the market.
 *
 * Two hurdles rather than one, because a price target on its own says very
 * little: sell-side targets carry a systematic optimism, so the useful reads
 * are whether this one is keener than the sector's and whether it pays for the
 * risk. Both bars derive from Settings — the sector distribution and
 * `riskFreeRate` + `equityRiskPremium`.
 */
function analystForecastPanel(a) {
  const pt = a.ds.get('priceTarget');
  const cur = curSymbol(a.facts.currency);
  const price = a.facts.price;

  if (!pt || !isNum(pt.targetConsensus)) {
    return feedGate(a, 'priceTarget', 'Analyst price targets')
      || notice('No consensus price target is available for this company.');
  }

  const upside = a.momentum.targetUpside;
  const total = a.momentum.expectedTotalReturn;
  const sectorMedian = a.lookup?.medianFor('targetUpside') ?? null;
  const coe = a.momentum.costOfEquity;

  /**
   * Two hurdles, deliberately different in kind. The sector one asks whether
   * analysts like this name more than the average one — which is the only way
   * to read a target without being fooled by the optimism that sits in all of
   * them. The cost-of-equity one asks whether the forecast pays for the risk
   * at all, and does not move with the sector.
   */
  const checks = [
    (() => {
      const state = !isNum(upside) || !isNum(sectorMedian) ? 'na' : upside > sectorMedian ? 'pass' : 'fail';
      return {
        state,
        label: 'Forecast return vs the sector',
        why: state === 'na'
          ? 'No sector distribution of price targets is loaded to compare against.'
          : `The consensus target of ${priceFmt(pt.targetConsensus, cur)} implies `
            + `${pct(upside, { sign: true })} from ${priceFmt(price, cur)}. The median `
            + `${a.facts.sector || 'listed'} company's target implies ${pct(sectorMedian, { sign: true })}, `
            + `so the street is ${state === 'pass' ? 'keener' : 'cooler'} on ${a.facts.symbol} than on a `
            + 'typical peer. Targets run optimistic across the board, which is why this is measured '
            + 'against the sector rather than against zero.',
      };
    })(),
    (() => {
      const state = !isNum(total) || !isNum(coe) ? 'na' : total > coe ? 'pass' : 'fail';
      const gap = isNum(total) && isNum(coe) ? total - coe : null;
      return {
        state,
        label: 'Forecast return vs cost of equity',
        why: state === 'na'
          ? 'A cost of equity needs a beta, a risk-free rate and an equity risk premium.'
          : `At a beta of ${dec(a.facts.beta, 2)}, holding ${a.facts.symbol} should earn ${pct(coe)} a year `
            + `— ${pct(a.bm.riskFreeRate)} risk-free plus ${dec(a.facts.beta, 2)} times a `
            + `${pct(a.bm.equityRiskPremium)} equity risk premium. Target plus dividend implies `
            + `${pct(total, { sign: true })}, ${state === 'pass' ? 'clearing that' : 'falling short'} `
            + `by ${pct(Math.abs(gap))}.`,
      };
    })(),
  ];

  const spread = isNum(pt.targetHigh) && isNum(pt.targetLow) && pt.targetConsensus > 0
    ? (pt.targetHigh - pt.targetLow) / pt.targetConsensus : null;

  return el('div', {}, [
    ...checks.map((c) => el('div', { class: 'forecast__check' }, [
      el('div', { class: 'ratio__name' }, [
        icon(c.state, `tick tick--${c.state}`,
          c.state === 'pass' ? 'Clears this hurdle'
            : c.state === 'fail' ? 'Falls short of this hurdle'
            : 'Not enough data to judge'),
        el('span', { text: c.label }),
      ]),
      el('p', { class: 'ratio__why', text: c.why }),
    ])),

    el('div', { class: 'ratio__chart' }, [
      rangeChart({
        low: pt.targetLow, avg: pt.targetConsensus, high: pt.targetHigh,
        current: price, currency: cur,
      }),
    ]),

    keyInfo([
      ['Low target', isNum(pt.targetLow) ? priceFmt(pt.targetLow, cur) : 'n/a'],
      ['Consensus', priceFmt(pt.targetConsensus, cur)],
      ['High target', isNum(pt.targetHigh) ? priceFmt(pt.targetHigh, cur) : 'n/a'],
      ['Implied upside', isNum(upside) ? pct(upside, { sign: true }) : 'n/a'],
      ['Sector median upside', isNum(sectorMedian) ? pct(sectorMedian, { sign: true }) : 'n/a'],
      ['Cost of equity', isNum(coe) ? pct(coe) : 'n/a'],
    ]),

    isNum(spread) ? el('p', { class: 't-tiny subtle mt2', text: `Low to high spans `
      + `${pct(spread)} of the consensus — the wider that is, the less agreement there is `
      + 'behind the single number.' }) : null,
  ]);
}

/** Subtopics rendered as a panel instead of a ratio table. */
/* ==========================================================================
   Statement flows

   Two Sankeys, both display only. Nothing here is graded and nothing here
   enters a factor score — the groups that hold them carry `metrics: []`, the
   same device the analyst forecast panel uses. They answer a question the
   ratio tables cannot: not "is this margin good" but "where does the money
   actually go", which is a shape rather than a number.

   Both are drawn from the latest annual statements rather than the TTM
   figures the ratios use, because a Sankey has to balance and only a single
   filed statement is internally consistent.
   ========================================================================== */

/** The income statement, revenue down to what is left. */
function revenueFlowPanel(a) {
  const inc = a.facts.statements.income.at(-1);
  if (!inc || !isNum(inc.revenue) || inc.revenue <= 0) {
    return notice('No annual income statement is available to chart.');
  }

  const gross = isNum(inc.grossProfit) ? inc.grossProfit
    : (isNum(inc.costOfRevenue) ? inc.revenue - inc.costOfRevenue : null);
  const cost = isNum(inc.costOfRevenue) ? inc.costOfRevenue
    : (isNum(gross) ? inc.revenue - gross : null);
  const op = inc.operatingIncome;
  const rd = inc.researchAndDevelopmentExpenses;
  const sga = inc.sellingGeneralAndAdministrativeExpenses;
  const net = inc.netIncome;

  // Whatever the named operating lines do not account for. Filed statements
  // carry more expense lines than this feed publishes, so the remainder is
  // shown as its own flow rather than silently distributed over the others.
  const otherOp = (isNum(gross) && isNum(op))
    ? gross - op - (isNum(rd) ? rd : 0) - (isNum(sga) ? sga : 0) : null;
  const belowOp = (isNum(op) && isNum(net)) ? op - net : null;

  const pos = (v) => (isNum(v) && v > 0 ? v : null);
  const nodes = [
    { id: 'rev', label: 'Revenue', layer: 0, color: 'var(--brand-01)' },
    { id: 'cogs', label: 'Cost of revenue', layer: 1, color: 'var(--chart-06)' },
    { id: 'gross', label: 'Gross profit', layer: 1, color: 'var(--chart-02)' },
    { id: 'rd', label: 'Research & development', layer: 2, color: 'var(--chart-05)' },
    { id: 'sga', label: 'Selling, general & admin', layer: 2, color: 'var(--chart-03)' },
    { id: 'otherop', label: 'Other operating', layer: 2, color: 'var(--chart-04)' },
    { id: 'op', label: 'Operating income', layer: 2, color: 'var(--chart-02)' },
    { id: 'below', label: 'Tax, interest & other', layer: 3, color: 'var(--chart-06)' },
    { id: 'net', label: 'Net income', layer: 3, color: 'var(--good)' },
  ];
  const links = [
    { from: 'rev', to: 'cogs', value: pos(cost) },
    { from: 'rev', to: 'gross', value: pos(gross) },
    { from: 'gross', to: 'rd', value: pos(rd) },
    { from: 'gross', to: 'sga', value: pos(sga) },
    { from: 'gross', to: 'otherop', value: pos(otherOp) },
    { from: 'gross', to: 'op', value: pos(op) },
    { from: 'op', to: 'below', value: pos(belowOp) },
    { from: 'op', to: 'net', value: pos(net) },
  ].filter((l) => isNum(l.value));

  const loss = isNum(net) && net <= 0;
  return el('div', {}, [
    sankeyChart({ nodes, links }, { height: 340 }),
    el('p', { class: 't-tiny subtle mt1', text: `Fiscal ${yearOf(inc.date)}, as filed. `
      + `Of ${money(inc.revenue)} of revenue, ${isNum(net) ? money(net) : 'n/a'} reached the bottom line`
      + `${isNum(net) && inc.revenue > 0 ? ` — ${pct(net / inc.revenue)} of every dollar` : ''}.`
      + (loss ? ' The company lost money this year, so no profit flow is drawn past operating income.' : '')
      + ' Flows are annual, not the trailing twelve months the ratios above use, because only a filed'
      + ' statement balances.' }),
  ]);
}

/** The balance sheet: what the company owns, and whose money paid for it. */
function balanceFlowPanel(a) {
  const b = a.facts.statements.balance.at(-1);
  if (!b || !isNum(b.totalAssets) || b.totalAssets <= 0) {
    return notice('No annual balance sheet is available to chart.');
  }

  const cash = b.cashAndShortTermInvestments;
  const curAssets = b.totalCurrentAssets;
  const otherCur = (isNum(curAssets) && isNum(cash)) ? curAssets - cash : null;
  const nonCur = isNum(curAssets) ? b.totalAssets - curAssets : null;
  const curLiab = b.totalCurrentLiabilities;
  const ltLiab = (isNum(b.totalLiabilities) && isNum(curLiab)) ? b.totalLiabilities - curLiab : null;
  const equity = b.totalStockholdersEquity;

  const pos = (v) => (isNum(v) && v > 0 ? v : null);
  const nodes = [
    { id: 'cash', label: 'Cash & investments', layer: 0, color: 'var(--chart-02)' },
    { id: 'othercur', label: 'Other current assets', layer: 0, color: 'var(--chart-01)' },
    { id: 'noncur', label: 'Non-current assets', layer: 0, color: 'var(--chart-05)' },
    { id: 'assets', label: 'Total assets', layer: 1, color: 'var(--brand-01)' },
    { id: 'curliab', label: 'Current liabilities', layer: 2, color: 'var(--chart-04)' },
    { id: 'ltliab', label: 'Long-term liabilities', layer: 2, color: 'var(--chart-06)' },
    { id: 'equity', label: 'Shareholders’ equity', layer: 2, color: 'var(--good)' },
  ];
  const links = [
    { from: 'cash', to: 'assets', value: pos(cash) },
    { from: 'othercur', to: 'assets', value: pos(otherCur) },
    { from: 'noncur', to: 'assets', value: pos(nonCur) },
    { from: 'assets', to: 'curliab', value: pos(curLiab) },
    { from: 'assets', to: 'ltliab', value: pos(ltLiab) },
    { from: 'assets', to: 'equity', value: pos(equity) },
  ].filter((l) => isNum(l.value));

  const share = isNum(equity) ? equity / b.totalAssets : null;
  return el('div', {}, [
    sankeyChart({ nodes, links }, { height: 320 }),
    el('p', { class: 't-tiny subtle mt1', text: `Balance sheet at fiscal ${yearOf(b.date)} year end. `
      + `Left is what the company owns; right is whose money paid for it. `
      + (isNum(share)
        ? `Shareholders own ${pct(share)} of the ${money(b.totalAssets)} balance sheet outright, `
          + `lenders and suppliers the rest.`
        : '')
      + (isNum(equity) && equity <= 0
        ? ' Equity is negative, so no owners’ flow is drawn — liabilities exceed assets.' : '') }),
  ]);
}

/**
 * Debt and equity over the filed years, and two questions about them.
 *
 * The leverage table gives ratios at a point in time, and the debt-to-equity
 * history chart gives their quotient — but a falling ratio can mean debt came
 * down or it can mean equity grew, and those are different companies. Drawing
 * both lines separates the two.
 *
 * Display only: nothing here is graded, and the two checks below are verdicts
 * on the trend rather than sector-relative scores.
 */
function debtEquityPanel(a) {
  const s = (a.history?.debtSeries || []).filter((r) => isNum(r.totalDebt) || isNum(r.equity));
  if (s.length < 3) return notice('Not enough filed balance sheets to chart a debt history.');

  const chart = multiLineChart(
    [
      { name: 'Total debt', color: 'var(--chart-06)', points: s.map((r) => ({ date: r.date, value: r.totalDebt })) },
      { name: 'Shareholders’ equity', color: 'var(--good)', points: s.map((r) => ({ date: r.date, value: r.equity })) },
    ],
    { height: 280, valueFmt: (v) => money(v) },
  );

  /* ---- is the debt covered by the cash the business throws off? ---- */
  // Both figures come from the filed year the chart ends on, not from the TTM
  // set the ratio tables use. Mixing them put a TTM debt figure in one check
  // and a balance-sheet one in the next, a line apart and visibly different.
  const filedYear = yearOf(s.at(-1).date);
  const debt = s.at(-1).totalDebt;
  const cashRow = (a.facts.statements.cash || []).at(-1);
  const ocf = isNum(cashRow?.operatingCashFlow) ? cashRow.operatingCashFlow : null;
  const years = isNum(debt) && isNum(ocf) && ocf > 0 ? debt / ocf : null;
  const coverage = (() => {
    if (!isNum(debt) || debt <= 0) {
      return { id: 'cover', state: 'pass', label: 'Carries no debt to cover',
        note: 'There is nothing on the balance sheet for the cash flow to repay.' };
    }
    if (!isNum(ocf) || ocf <= 0) {
      return { id: 'cover', state: 'fail', label: 'Operating cash flow does not cover the debt',
        note: 'The business is not generating cash from trading, so the debt is not being serviced out of operations.' };
    }
    // Three years of operating cash flow is the line. Most solvent companies
    // carry more debt than a single year of cash, so treating "not covered in
    // one year" as a failure would fail almost everybody; three years is the
    // same comfort level the net-debt-to-EBITDA line uses. The exact figure is
    // in the label either way, and the threshold is stated in the note — a
    // verdict whose basis is not visible is not one the reader can check.
    const COMFORT_YEARS = 3;
    const ok = years <= COMFORT_YEARS;
    return {
      id: 'cover',
      state: ok ? 'pass' : 'fail',
      label: years <= 1
        ? 'One year of operating cash flow covers the whole debt'
        : `Operating cash flow would clear the debt in ${dec(years, 1)} years`,
      note: `Fiscal ${filedYear}: ${money(ocf)} of operating cash against ${money(debt)} of borrowings. `
        + `Under ${COMFORT_YEARS} years counts as covered here — and this is cash before any of it `
        + 'is spent on the business itself.',
    };
  })();

  /* ---- and is the debt coming down? ---- */
  const back = s.length >= 6 ? s.at(-6) : s[0];
  const spanYears = (yearOf(s.at(-1).date) - yearOf(back.date)) || (s.length - 1);
  const then = back.totalDebt;
  const now = s.at(-1).totalDebt;
  const trend = (() => {
    if (!isNum(then) || !isNum(now) || then <= 0) {
      return { id: 'trend', state: 'na', label: `Debt trend over ${spanYears} years`,
        why: 'No comparable debt figure that far back.' };
    }
    const change = now / then - 1;
    const down = now < then;
    return {
      id: 'trend',
      state: down ? 'pass' : 'fail',
      label: down
        ? `Debt has fallen over ${spanYears} years`
        : `Debt has risen over ${spanYears} years`,
      note: `${money(then)} in ${yearOf(back.date)} against ${money(now)} in ${filedYear}, `
        + `${pct(Math.abs(change))} ${down ? 'lower' : 'higher'}.`,
    };
  })();

  return el('div', {}, [
    chart,
    el('ul', { class: 'checks mt2' }, [coverage, trend].map(checkRow)),
  ]);
}

const GROUP_PANELS = {
  analystForecast: analystForecastPanel,
  revenueFlow: revenueFlowPanel,
  balanceFlow: balanceFlowPanel,
  debtHistory: debtEquityPanel,
};

/** Charts drawn after a particular ratio's row, closing off a related pair. */
/**
 * Annual revenue growth, the company against each named peer.
 *
 * Built like the peer P/E chart and for the same reason: one number saying
 * "four points behind the peer average" cannot show whether the average is
 * one fast peer pulling three flat ones along.
 *
 * Unlike the P/E chart this one has to cope with negative bars — a shrinking
 * peer is ordinary — so the axis is not forced through zero.
 */
function peerGrowthChart(a) {
  const self = a.growth?.revenueYoy;
  const rows = Object.entries(a.peerGrowth || {})
    .map(([sym, r]) => ({ label: sym, g: r?.revenueGrowth }))
    .filter((r) => isNum(r.g) && r.g > -1 && r.g < 10);
  if (!isNum(self) || rows.length < 2) return null;

  const sectorMed = a.lookup?.medianFor('revenueGrowthYoy');
  const all = [
    { label: a.facts.symbol, g: self, kind: 'self' },
    ...rows.map((r) => ({ ...r, kind: 'peer' })),
    ...(isNum(sectorMed) ? [{ label: 'Sector', g: sectorMed, kind: 'sector' }] : []),
  ].sort((x, y) => x.g - y.g);

  const tone = { self: 'var(--brand-01)', peer: 'var(--chart-01)', sector: 'var(--chart-03)' };
  const avg = rows.reduce((t, r) => t + r.g, 0) / rows.length;

  const faster = rows.filter((r) => r.g > self).length;
  return el('div', {}, [
    columnChart(
      all.map((r) => r.label),
      [{
        name: 'Revenue growth (YoY)',
        color: 'var(--chart-01)',
        colors: all.map((r) => tone[r.kind]),
        values: all.map((r) => r.g),
      }],
      {
        height: 260,
        valueFmt: (v) => pct(v, { sign: true }),
        legend: false,
        refLine: { value: avg, label: `peer average ${pct(avg)}`, align: 'start' },
      },
    ),
    el('p', { class: 't-tiny subtle mt1', text: `${a.facts.symbol} grew ${pct(self)} against `
      + `${rows.length} named peers. `
      + (faster === 0 ? 'It outgrew all of them.'
        : faster === rows.length ? 'Every one of them grew faster.'
        : `${faster} of ${rows.length} grew faster.`)
      + (isNum(sectorMed) ? ` The wider ${a.facts.sector || 'sector'} median is ${pct(sectorMed)}.` : '')
      + ' Peer growth is the latest reported fiscal year, so a peer with a different year end is'
      + ' measured over a slightly different window.' }),
  ]);
}

/**
 * The company's earnings multiple against each named peer.
 *
 * The `P/E vs peers` row states one number — how far above the peer average
 * the company trades — which says nothing about whether the average is one
 * expensive name dragging four cheap ones. Every peer gets a bar, sorted, so
 * the shape of the comparison is visible rather than summarised.
 *
 * The dashed line is the same average the row is graded against, so the chart
 * and the sentence above it cannot disagree.
 */
function peerPeChart(a) {
  const self = a.facts.pe;
  const peers = (a.peers?.peers || []).filter((p) => isNum(p.pe) && p.pe > 0);
  if (!isNum(self) || self <= 0 || peers.length < 2) return null;

  // The sector median rides in as a bar rather than a second line, so the
  // reader can see it ranked among the peers instead of floating over them —
  // for a megacap set it often sits below every name in the chart.
  const sectorMed = a.lookup?.medianFor('peGaapTtm');
  const rows = [
    { label: a.facts.symbol, name: a.facts.name, pe: self, kind: 'self' },
    ...peers.map((p) => ({ label: p.symbol, name: p.name, pe: p.pe, kind: 'peer' })),
    ...(isNum(sectorMed) && sectorMed > 0
      ? [{ label: 'Sector', name: `${a.facts.sector || 'Sector'} median`, pe: sectorMed, kind: 'sector' }]
      : []),
  ].sort((x, y) => x.pe - y.pe);

  const tone = { self: 'var(--brand-01)', peer: 'var(--chart-01)', sector: 'var(--chart-03)' };
  const avg = a.peers?.peerPe;
  const chart = columnChart(
    rows.map((r) => r.label),
    [{
      name: 'P/E (TTM)',
      color: 'var(--chart-01)',
      colors: rows.map((r) => tone[r.kind]),
      values: rows.map((r) => r.pe),
    }],
    {
      height: 260,
      valueFmt: (v) => mult(v),
      legend: false,
      refLine: isNum(avg) ? { value: avg, label: `peer average ${mult(avg)}`, align: 'start' } : null,
    },
  );

  // `cheaper` counts peers trading below the company, so none of them cheaper
  // makes the company the cheapest, and all of them cheaper makes it the dearest.
  // `cheaper` counts peers trading below the company, so none of them cheaper
  // makes the company the cheapest, and all of them cheaper makes it the dearest.
  const cheaper = rows.filter((r) => r.kind === 'peer' && r.pe < self).length;
  const place = cheaper === 0 ? 'It is the cheapest of them.'
    : cheaper === peers.length ? 'It is the dearest of them.'
    : `${cheaper} of ${peers.length} trade cheaper.`;
  const vsSector = isNum(sectorMed)
    ? ` The wider ${a.facts.sector || 'sector'} median sits at ${mult(sectorMed)}.` : '';

  return el('div', {}, [
    chart,
    el('p', { class: 't-tiny subtle mt1', text: `${a.facts.symbol} at ${mult(self)} against `
      + `${peers.length} named peers. ${place}${vsSector}`
      + ' Peer multiples are trailing and unadjusted, so a peer with a one-off loss will look dear.' }),
  ]);
}

// Charts that close off a single ratio row. The trailing/forward pairs used to
// live here; they are drawn by the pair itself now — see pairRows.
const ROW_CHARTS = {};

const EXTRAS = {
  /**
   * The whole return curve rather than six separate rows.
   *
   * A momentum section without a shape is a list of numbers: the useful read
   * is whether the recent windows sit above or below the long ones, which is
   * a curve, not six rankings.
   */
  'momentum.travel': (a) => {
    const spans = [
      ['1M', a.momentum.r1m, 'return1m'], ['3M', a.momentum.r3m, 'return3m'],
      ['6M', a.momentum.r6m, 'return6m'], ['9M', a.momentum.r9m, 'return9m'],
      ['YTD', a.momentum.rYtd, 'returnYtd'], ['1Y', a.momentum.r1y, 'return1y'],
    ].filter(([, v]) => isNum(v));
    if (spans.length < 3) return null;
    return columnChart(
      spans.map(([k]) => k),
      [
        { name: a.facts.symbol, color: 'var(--brand-01)', values: spans.map(([, v]) => v) },
        {
          name: `${a.facts.sector || 'Sector'} median`, color: 'var(--chart-01)',
          values: spans.map(([, , id]) => a.lookup?.medianFor(id) ?? null),
        },
      ],
      { valueFmt: (v) => pct(v, { sign: true }), height: 240 },
    );
  },

  /**
   * What the shareholder is actually handed, split into its two halves.
   *
   * Stacked because shareholder yield IS dividend plus buyback — three
   * separate rows state the identity without ever showing it. A negative
   * buyback segment is net issuance, and stacks below the line where it
   * belongs rather than being hidden.
   */
  'valuation.yields': (a) => {
    const div = a.facts.dividendYield;
    const buy = a.val.buybackYield;
    if (!isNum(div) && !isNum(buy)) return null;
    const med = (id) => a.lookup?.medianFor(id) ?? null;
    return el('div', {}, [
      columnChart(
        [a.facts.symbol, `${a.facts.sector || 'Sector'} median`],
        [
          { name: 'Dividend', color: 'var(--chart-02)', values: [div ?? null, med('dividendYieldTtm')] },
          { name: 'Buyback', color: 'var(--chart-05)', values: [buy ?? null, med('buybackYield')] },
        ],
        { stacked: true, valueFmt: (v) => pct(v), height: 240 },
      ),
      el('p', { class: 't-tiny subtle mt1', text: 'The two bars stack to shareholder yield, the '
        + 'third row above. A buyback segment below the line is net issuance — the company sold '
        + 'shares rather than retiring them.' }),
    ]);
  },

  /**
   * The return family side by side. Each measures the same profit against a
   * different denominator, so the spread between them says where the returns
   * come from — leverage, intangibles, or the operating business.
   */
  'profitability.returns': (a) => {
    const rows = [
      ['On equity', a.facts.roe, 'returnOnEquity'],
      ['On invested capital', a.facts.roic, 'returnOnInvestedCapital'],
      ['On assets', a.facts.roa, 'returnOnAssets'],
      ['On tangible assets', a.facts.returnOnTangibleAssets, 'returnOnTangibleAssets'],
      ['On capital employed', a.facts.roce, 'returnOnCapitalEmployed'],
    ].filter(([, v]) => isNum(v));
    if (rows.length < 3) return null;
    return columnChart(
      rows.map(([k]) => k),
      [
        { name: a.facts.symbol, color: 'var(--brand-01)', values: rows.map(([, v]) => v) },
        {
          name: `${a.facts.sector || 'Sector'} median`, color: 'var(--chart-01)',
          values: rows.map(([, , id]) => a.lookup?.medianFor(id) ?? null),
        },
      ],
      { valueFmt: (v) => pct(v), height: 240 },
    );
  },

  /**
   * The liquidity ladder, each rung stricter than the last: everything due
   * within the year, then without inventory, then cash alone.
   */
  'health.liquidity': (a) => {
    const rows = [
      ['Current', a.facts.currentRatio, 'currentRatio'],
      ['Quick', a.facts.quickRatio, 'quickRatio'],
      ['Cash', a.facts.cashRatio, 'cashRatio'],
    ].filter(([, v]) => isNum(v));
    if (rows.length < 2) return null;
    return el('div', {}, [
      columnChart(
        rows.map(([k]) => k),
        [
          { name: a.facts.symbol, color: 'var(--brand-01)', values: rows.map(([, v]) => v) },
          {
            name: `${a.facts.sector || 'Sector'} median`, color: 'var(--chart-01)',
            values: rows.map(([, , id]) => a.lookup?.medianFor(id) ?? null),
          },
        ],
        { valueFmt: (v) => dec(v, 2), height: 230, refLine: { value: 1, label: '1.0x — bills just covered', align: 'start' } },
      ),
      el('p', { class: 't-tiny subtle mt1', text: 'Each rung strips out assets that are harder to '
        + 'turn into cash quickly. Below the dashed line the company could not settle a year of '
        + 'bills from that class of assets alone.' }),
    ]);
  },

  /**
   * The two yields side by side, each against its sector median. They are the
   * same question asked of earnings and of cash — putting them on one scale is
   * the point, because the gap between them is what says how much of the
   * reported profit actually arrives.
   */
  'valuation.cashflows': (a) => {
    const asPct = (v) => (isNum(v) ? v * 100 : null);
    const med = (id) => asPct(a.lookup?.medianFor(id));
    const mine = [asPct(a.val.earningsYield), asPct(a.val.fcfYield)];
    if (!mine.some(isNum)) return null;

    return columnChart(
      ['Earnings yield (TTM)', 'Free cash flow yield (TTM)'],
      [
        { name: a.facts.symbol, color: 'var(--brand-01)', values: mine },
        {
          name: `${a.facts.sector || 'Sector'} median`,
          color: 'var(--chart-01)',
          values: [med('earningsYieldTtm'), med('fcfYieldTtm')],
        },
      ],
      { valueFmt: (v) => pct(v, { already: true, dp: 2 }), height: 240 },
    );
  },

  'valuation.compare': (a) => {
    const s = a.history.peSeries;
    if (s.length < 2) return null;
    return columnChart(
      s.map((r) => String(yearOf(r.date))),
      [{ name: 'Price to earnings', color: 'var(--chart-05)', values: s.map((r) => r.pe) }],
      { valueFmt: (v) => mult(v, 0), height: 220, legend: false },
    );
  },

  'growth.topline': (a) => {
    const inc = a.facts.statements.income;
    if (inc.length < 2) return null;
    return columnChart(
      inc.map((r) => String(yearOf(r.date))),
      [
        { name: 'Revenue', color: 'var(--chart-01)', values: inc.map((r) => r.revenue) },
        { name: 'Net income', color: 'var(--chart-02)', values: inc.map((r) => r.netIncome) },
      ],
      { valueFmt: (v) => money(v), height: 240 },
    );
  },

  'growth.forecast': (a) => {
    const rows = a.forecast.rows;
    if (!a.forecast.available || rows.length < 2) return null;
    const inc = a.facts.statements.income.slice(-4);
    const points = [...inc.map((r) => String(yearOf(r.date))), ...rows.map((r) => String(r.year))];
    const pad = (arr, before, after) => [...Array(before).fill(null), ...arr, ...Array(after).fill(null)];
    return forecastChart(points, [
      { name: 'Revenue', color: 'var(--chart-01)',
        values: pad([...inc.map((r) => r.revenue), ...rows.map((r) => r.revenue)], 0, 0) },
      { name: 'Earnings', color: 'var(--chart-02)',
        values: pad([...inc.map((r) => r.netIncome), ...rows.map((r) => r.netIncome)], 0, 0) },
    ], { valueFmt: (v) => money(v), splitAt: inc.length - 1, height: 260 });
  },

  'profitability.margins': (a) => {
    const inc = a.facts.statements.income;
    if (inc.length < 2) return null;
    const marginOf = (r, field) => (r.revenue > 0 && isNum(r[field]) ? (r[field] / r.revenue) * 100 : null);
    return columnChart(
      inc.map((r) => String(yearOf(r.date))),
      [
        { name: 'Gross', color: 'var(--chart-01)', values: inc.map((r) => marginOf(r, 'grossProfit')) },
        { name: 'Operating', color: 'var(--chart-04)', values: inc.map((r) => marginOf(r, 'operatingIncome')) },
        { name: 'Net', color: 'var(--chart-02)', values: inc.map((r) => marginOf(r, 'netIncome')) },
      ],
      { valueFmt: (v) => pct(v, { already: true }), height: 240 },
    );
  },

  'health.leverage': (a) => {
    const s = a.history.debtSeries.filter((d) => isNum(d.debtToEquity));
    if (s.length < 2) return null;
    return columnChart(
      s.map((r) => String(yearOf(r.date))),
      [{ name: 'Debt to equity', color: 'var(--chart-06)', values: s.map((r) => r.debtToEquity * 100) }],
      { valueFmt: (v) => pct(v, { already: true }), height: 220, legend: false },
    );
  },

  'momentum.street': (a) => {
    const pt = a.ds.get('priceTarget');
    if (!pt || !isNum(pt.targetConsensus)) return null;
    return rangeChart({
      low: pt.targetLow, avg: pt.targetConsensus, high: pt.targetHigh,
      current: a.facts.price, currency: curSymbol(a.facts.currency),
    });
  },
};

/* ==========================================================================
   The factor section
   ========================================================================== */

export function renderFactor(a, key) {
  const meta = FACTOR_BY_KEY[key];
  const f = a.scores[key];
  if (!meta || !f) return null;

  const question = meta.question.replace('{SYM}', a.facts.symbol);

  // The flake repeats in every factor section, with this factor's spoke picked
  // out — the point is not the shape again, it is where this grade sits
  // against the other four without scrolling back to the overview.
  const flakeScores = Object.fromEntries(AXES.map((x) => [x.key, a.scores[x.key].score]));

  return card(meta.anchor, [
    el('div', { class: 'sec__intro sec__intro--flake' }, [
      el('div', { class: 'sec__introtext' }, [
        el('h2', { text: meta.title }),
        el('p', { text: question }),
        factorPanel(a, f),
      ]),
      el('div', { class: 'sec__introflake' }, [
        snowflake(flakeScores, { size: 300, highlight: key }),
      ]),
    ]),

    // Subtopics carry no grade of their own and no roll-up sentence: the
    // per-ratio rows already say where each number sits, and the factor grade
    // above is the mean of those rows rather than of the subtopics.
    ...f.groups.map((group) => {
      const panel = GROUP_PANELS[group.panel];
      if (panel) return blockEl(group.title, group.desc, [panel(a)]);

      const extra = EXTRAS[`${key}.${group.key}`]?.(a) || null;
      return blockEl(
        group.title,
        group.desc,
        [
          subtopicSummary(a, group.metrics),
          gradeTable(a, group.metrics),
          extra ? el('div', { class: 'mt3' }, [extra]) : null,
        ],
      );
    }),
  ]);
}

/** The score header at the top of a factor. */
function factorPanel(a, f) {
  const missing = f.total - f.graded;
  const width = isNum(f.score) ? (f.score / MAX_SCORE) * 100 : 0;

  return el('div', { class: 'scorepanel scorepanel--graded' }, [
    el('div', { class: 'scorepanel__head' }, [
      el('p', {}, [`${f.title} grade `, el('b', { text: isNum(f.score) ? `${dec(f.score, 2)} / ${MAX_SCORE}` : 'not assessed' })]),
      gradePill(f.score, f.letter, { size: 'lg' }),
    ]),
    el('div', { class: 'gradebar' }, [
      el('div', { class: `gradebar__fill is-${toneForLetter(f.letter)}`, style: { width: `${width}%` } }),
    ]),
    el('p', { class: 't-tiny subtle mt1', text: `Averaged across ${f.graded} of ${f.total} ratios`
      + (missing ? `; ${missing} could not be assessed from the available data.` : '.') }),
  ]);
}

/* ==========================================================================
   Ratings
   ========================================================================== */

export function renderRatings(a) {
  const f = a.facts;
  const overall = a.scores.overall;
  const sectorTable = a.sectorTable;

  return card('ratings', [
    el('div', { class: 'card__head' }, [
      el('h2', { text: `${f.name} Factor Grades` }),
      el('p', { text: `Every ratio in this report is ranked against the ${f.sector || 'wider'} sector, then averaged `
        + 'up into the five factor grades below.' }),
    ]),

    sectorTable.quality === 'seed' ? notice(
      'The sector distributions shipped with this repo are <b>modelled, not measured</b> — shaped around '
      + 'published sector medians so the report grades sensibly out of the box. Run '
      + '<code>python tools/build_sector_stats.py --apikey $FMP_KEY</code> to replace them with real '
      + 'distributions built from the whole market.') : null,

    blockEl('Factor Grades',
      `Each grade is the mean of its ratios, on a scale of 0 to ${MAX_SCORE}.`,
      [factorGradeList(a)]),

    blockEl('Score Distribution',
      sectorTable.available
        ? `Where ${f.symbol}'s overall grade falls among the ${f.sector || 'listed'} sector.`
        : 'No sector distribution is loaded, so the overall grade is shown without a ranking.',
      [distributionStrip(a, overall)]),

    blockEl('Competitor Ranking', competitorNote(a), [competitorTable(a)]),
  ]);
}

function factorGradeList(a) {
  return el('div', { class: 'fgrades' }, Object.values(FACTOR_BY_KEY).map((meta) => {
    const s = a.scores[meta.key];
    const width = isNum(s.score) ? (s.score / MAX_SCORE) * 100 : 0;
    return el('a', { class: 'fgrades__row', href: `#${meta.anchor}` }, [
      el('span', { class: 'fgrades__name', text: meta.title }),
      el('span', { class: 'fgrades__track' }, [
        el('span', { class: `fgrades__fill is-${toneForLetter(s.letter)}`, style: { width: `${width}%` } }),
      ]),
      gradePill(s.score, s.letter),
    ]);
  }));
}

function distributionStrip(a, overall) {
  const f = a.facts;
  const t = a.sectorTable;
  const pos = isNum(overall.score) ? (overall.score / MAX_SCORE) * 100 : null;
  const rank = histogramRank(overall.score, t.overall);

  return el('div', {}, [
    el('div', { class: 'distrib' }, [
      el('div', { class: 'distrib__scale' }, ['Strong sell', 'Sell', 'Hold', 'Buy', 'Strong buy']
        .map((label, i) => el('span', { class: 'distrib__band' }, [
          el('i', { text: String(i + 1) }),
          el('span', { text: label }),
        ]))),
      pos == null ? null : el('div', { class: 'distrib__marker', style: { left: `${pos}%` } }, [
        gradePill(overall.score, overall.letter, { size: 'lg' }),
      ]),
    ]),

    distributionChart(a, overall, rank),
    el('p', { class: 't-xs soft mt3', text: distributionLine(a, overall, rank) }),
  ]);
}

function distributionLine(a, overall, rank) {
  const f = a.facts;
  const t = a.sectorTable;
  const sector = f.sector || 'listed';

  if (!isNum(overall.score)) return 'Not enough graded ratios to place this company in its sector.';
  if (!rank) {
    return isNum(t.count)
      ? `Grades ${dec(overall.score, 2)} out of ${MAX_SCORE}. No score distribution is loaded for the `
        + `${sector} sector, so this is the grade alone rather than a ranking.`
      : `Grades ${dec(overall.score, 2)} out of ${MAX_SCORE}.`;
  }

  const label = rankLabel(rank.pctile);
  const claim = `${label.text} of the ${sector} sector — ranked better than `
    + `${rank.better.toLocaleString('en-US')} of ${rank.total.toLocaleString('en-US')} companies.`;

  // On the seed table that count is a modelled shape, not a census. Saying so
  // here matters more than in the notice above, because a precise-looking
  // "better than 627 of 930" is exactly the sort of number people quote.
  return t.quality === 'seed'
    ? `${claim} Both the spread and the count come from the modelled seed distribution, `
      + 'not a measured one.'
    : claim;
}

/**
 * The sector's whole score distribution, with the company's bucket picked out.
 *
 * Bars run edge to edge across the same width as the band strip above, so a
 * bar sits directly under the band it belongs to. Height is share of the
 * sector, scaled to the tallest bucket rather than to the total, because the
 * shape is the point and the absolute counts are in the caption.
 */
function distributionChart(a, overall, rank) {
  const hist = a.sectorTable.overall;
  const bins = hist?.bins;
  if (!Array.isArray(bins) || !bins.length) return null;

  const peak = Math.max(...bins);
  if (!(peak > 0)) return null;

  const NS = 'http://www.w3.org/2000/svg';
  const W = 100, H = 34, GAP = 0.35;
  const barW = W / bins.length;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'distrib__chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', rank
    ? `Distribution of grades across the ${a.facts.sector || 'sector'}: `
      + `${a.facts.symbol} sits in the bucket better than ${rank.better} of ${rank.total} companies.`
    : `Distribution of grades across the ${a.facts.sector || 'sector'}.`);

  bins.forEach((count, i) => {
    const h = (count / peak) * (H - 1);
    const bar = document.createElementNS(NS, 'rect');
    bar.setAttribute('x', (i * barW + GAP / 2).toFixed(2));
    bar.setAttribute('y', (H - h).toFixed(2));
    bar.setAttribute('width', Math.max(0.1, barW - GAP).toFixed(2));
    bar.setAttribute('height', Math.max(0.4, h).toFixed(2));
    bar.setAttribute('class', `distrib__bar${rank && i === rank.binIndex ? ' is-self' : ''}`);

    const lo = (i * (hist.max ?? MAX_SCORE)) / bins.length;
    const hi = ((i + 1) * (hist.max ?? MAX_SCORE)) / bins.length;
    const title = document.createElementNS(NS, 'title');
    title.textContent = `${dec(lo, 2)}–${dec(hi, 2)}: ${count.toLocaleString('en-US')} companies`;
    bar.append(title);

    svg.append(bar);
  });

  return el('div', { class: 'distrib__chartwrap' }, [
    svg,
    el('div', { class: 'distrib__axis' }, [
      el('span', { text: '0' }),
      el('span', { class: 'distrib__axismid', text: a.sectorTable.quality === 'seed'
        ? `${a.facts.sector || 'Sector'} grade distribution (modelled)`
        : `${a.facts.sector || 'Sector'} grade distribution` }),
      el('span', { text: String(MAX_SCORE) }),
    ]),
  ]);
}


/**
 * The count that used to sit in a "ratios used" column. Every row is scored on
 * the same shared basis, so it was the same number repeated down the table —
 * it belongs in the description once instead.
 */
function competitorNote(a) {
  const sym = a.facts.symbol;
  const n = a.peers.self?.common ?? a.peers.self?.scoredOn ?? null;
  const basis = isNum(n) && n > 0
    ? `the ${n} trailing ratio${n === 1 ? '' : 's'} all of them share`
    : 'the trailing ratios this report already fetches for each of them';
  return `${sym} and its peers scored on the same reduced set — ${basis}. That is far short of the `
    + 'full model, so read this as a sort order rather than a verdict.';
}

function competitorTable(a) {
  const rows = [...a.peers.peers]
    .map((p) => ({ ...p }))
    .concat([{
      symbol: a.facts.symbol, name: a.facts.name, marketCap: a.facts.marketCap,
      pe: a.facts.pe, self: true,
      // The reduced score, not the full-model one, so the column compares
      // like with like.
      score: a.peers.self?.score ?? null,
      scoredOn: a.peers.self?.scoredOn ?? 0,
    }])
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));

  if (rows.length < 2) return notice('No peer list is available for this company.');

  return el('div', { class: 'tbl-wrap' }, [
    el('table', { class: 'tbl' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Company' }),
        el('th', { class: 'num', text: 'Market cap' }),
        el('th', { class: 'num', text: 'P/E' }),
        el('th', { class: 'num', text: 'Grade' }),
      ])]),
      el('tbody', {}, rows.map((p) => el('tr', { class: p.self ? 'is-self' : '' }, [
        el('td', {}, [
          el('b', { text: p.symbol }),
          el('span', { class: 't-tiny soft', style: { marginLeft: '8px' }, text: p.name || '' }),
        ]),
        el('td', { class: 'num', text: money(p.marketCap) }),
        el('td', { class: 'num', text: isNum(p.pe) ? mult(p.pe) : 'n/a' }),
        el('td', { class: 'num' }, [gradePill(p.score, letterFor(p.score))]),
      ]))),
    ]),
  ]);
}
