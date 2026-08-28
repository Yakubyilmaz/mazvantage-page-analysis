/* ==========================================================================
   Maz Vantage — metric definitions

   The five factors are built from metrics, and a metric is one of two kinds:

     relative   graded by where the company sits in its peer cohort. This is
                the default, because almost every ratio is only meaningful
                against companies with the same economics.

     absolute   graded against documented bands. Used where no comparable peer
                figure exists — forward consensus growth, technical position,
                analyst revisions — and the bands are visible in this file so
                nothing is a black box.

   Each metric supplies:
     self(c)     the subject's value, from the context object
     peer(row)   the same value for a cohort member, from its merged ratios
     bands       for absolute metrics: [[threshold, grade], …] ascending
     say(m, c)   the plain-English sentence shown under the metric

   `c` is the metric context: { facts, forecast, history, momentum, bm }.
   ========================================================================== */

import { isNum, pct, mult, money, trim, dec } from './util.js';

/* ---------- small helpers ------------------------------------------------- */

const ok = (v) => (isNum(v) && Number.isFinite(v) ? v : null);

/** Positive-only guard: a negative P/E is meaningless, not "cheap". */
const pos = (v) => (isNum(v) && v > 0 ? v : null);

/** Cumulative n-year growth -> annualised. */
const annualise = (cum, years) =>
  (isNum(cum) && cum > -1 ? Math.pow(1 + cum, 1 / years) - 1 : null);

const asMult = (v) => mult(v, 1);
const asPct = (v) => pct(v, { dp: 1 });
const asPctSigned = (v) => pct(v, { dp: 1, sign: true });
const asNum = (v) => dec(v, 2);

/* ==========================================================================
   VALUE — is it cheap for what it is?
   ========================================================================== */

const VALUE = [
  {
    id: 'pe', label: 'Price / Earnings', fmt: asMult, higherIsBetter: false, weight: 1.0,
    self: (c) => pos(c.facts.pe),
    peer: (r) => pos(r.priceToEarningsRatioTTM),
    trend: (c) => ({ label: 'own 10-year median', value: c.history.peMedian }),
    say: (m, c) => `${c.facts.symbol} earns ${money(c.facts.netIncome)} on a ${money(c.facts.marketCap)} market value.`,
  },
  {
    id: 'evEbitda', label: 'EV / EBITDA', fmt: asMult, higherIsBetter: false, weight: 1.0,
    self: (c) => pos(c.facts.evToEbitda),
    peer: (r) => pos(r.evToEBITDATTM ?? r.enterpriseValueMultipleTTM),
    say: () => 'Capital-structure neutral, so it compares leveraged and unleveraged companies fairly.',
  },
  {
    id: 'pfcf', label: 'Price / Free cash flow', fmt: asMult, higherIsBetter: false, weight: 1.0,
    self: (c) => pos(c.facts.pfcf),
    peer: (r) => pos(r.priceToFreeCashFlowRatioTTM),
    say: () => 'Harder to manage than earnings, so a useful cross-check on the P/E.',
  },
  {
    id: 'fcfYield', label: 'Free cash flow yield', fmt: asPct, higherIsBetter: true, weight: 0.9,
    self: (c) => ok(c.facts.fcfYield),
    peer: (r) => ok(r.freeCashFlowYieldTTM),
    say: (m, c) => `Every ${money(c.facts.marketCap)} of market value throws off ${money(c.facts.fcf)} of free cash a year.`,
  },
  {
    id: 'ps', label: 'Price / Sales', fmt: asMult, higherIsBetter: false, weight: 0.6,
    self: (c) => pos(c.facts.ps),
    peer: (r) => pos(r.priceToSalesRatioTTM),
    say: () => 'The fallback multiple when earnings are negative or depressed.',
  },
  {
    id: 'peg', label: 'PEG ratio', fmt: asNum, higherIsBetter: false, weight: 0.7,
    self: (c) => pos(c.facts.peg),
    peer: (r) => pos(r.priceToEarningsGrowthRatioTTM),
    say: () => 'The earnings multiple set against the growth rate that has to justify it.',
  },
  {
    id: 'dcfDiscount', label: 'Discount to DCF fair value', fmt: asPctSigned, higherIsBetter: true, weight: 0.8,
    absolute: true,
    bands: [[-0.40, 1], [-0.20, 2], [0, 3], [0.20, 4], [0.40, 5]],
    self: (c) => ok(c.facts.dcfDiscount),
    say: (m, c) => isNum(c.facts.fairValue)
      ? `A levered discounted cash flow model puts fair value at ${money(c.facts.fairValue, { plain: true })} against a ${money(c.facts.price, { plain: true })} share price.`
      : 'No discounted cash flow estimate is available.',
  },
];

/* ==========================================================================
   GROWTH — is the business getting bigger, and will it keep doing so?
   ========================================================================== */

const GROWTH = [
  {
    id: 'revGrowth1y', label: 'Revenue growth (1y)', fmt: asPctSigned, higherIsBetter: true, weight: 1.0,
    self: (c) => ok(c.history.revenueGrowth1y),
    peer: (r) => ok(r.revenueGrowth),
    say: (m, c) => `Revenue reached ${money(c.facts.revenue)} over the trailing twelve months.`,
  },
  {
    id: 'revGrowth3y', label: 'Revenue growth (3y p.a.)', fmt: asPctSigned, higherIsBetter: true, weight: 1.0,
    self: (c) => ok(c.history.revenueGrowth3y),
    peer: (r) => annualise(r.threeYRevenueGrowthPerShare, 3),
    say: () => 'A three-year rate smooths out one exceptional or one lost year.',
  },
  {
    id: 'epsGrowth1y', label: 'Earnings growth (1y)', fmt: asPctSigned, higherIsBetter: true, weight: 1.0,
    self: (c) => ok(c.history.growth1y),
    peer: (r) => ok(r.netIncomeGrowth),
    say: (m, c) => `Net income of ${money(c.facts.netIncome)} on the latest twelve months.`,
  },
  {
    id: 'epsGrowth5y', label: 'Earnings growth (5y p.a.)', fmt: asPctSigned, higherIsBetter: true, weight: 0.8,
    self: (c) => ok(c.history.growth5y),
    peer: (r) => annualise(r.fiveYNetIncomeGrowthPerShare, 5),
    say: () => 'Long enough to cover a full cycle for most businesses.',
  },
  {
    id: 'fwdRevGrowth', label: 'Forecast revenue growth (3y p.a.)', fmt: asPctSigned, higherIsBetter: true, weight: 0.8,
    absolute: true,
    bands: [[0, 1], [0.04, 2], [0.09, 3], [0.16, 4], [0.25, 5]],
    self: (c) => ok(c.forecast.revenueGrowth),
    say: (m, c) => c.forecast.analystCount
      ? `Consensus of ${c.forecast.analystCount} analysts over the next ${c.forecast.span || 3} years.`
      : 'No consensus revenue forecast is available.',
  },
  {
    id: 'fwdEpsGrowth', label: 'Forecast earnings growth (3y p.a.)', fmt: asPctSigned, higherIsBetter: true, weight: 1.0,
    absolute: true,
    bands: [[0, 1], [0.05, 2], [0.11, 3], [0.18, 4], [0.28, 5]],
    self: (c) => ok(c.forecast.earningsGrowth),
    say: () => 'Taken as the median year-on-year step across the consensus window, so one bad analyst year cannot dominate.',
  },
];

/* ==========================================================================
   PROFITABILITY — how much of each sale survives, and what the capital earns
   ========================================================================== */

const PROFITABILITY = [
  {
    id: 'grossMargin', label: 'Gross margin', fmt: asPct, higherIsBetter: true, weight: 0.8,
    self: (c) => ok(c.facts.grossMargin),
    peer: (r) => ok(r.grossProfitMarginTTM),
    say: () => 'The clearest read on pricing power before the cost base gets involved.',
  },
  {
    id: 'operatingMargin', label: 'Operating margin', fmt: asPct, higherIsBetter: true, weight: 1.0,
    self: (c) => ok(c.facts.operatingMargin),
    peer: (r) => ok(r.operatingProfitMarginTTM),
    trend: (c) => ({ label: '5 years ago', value: c.history.operatingMargin5y }),
    say: () => 'What the business earns from operations, before financing and tax.',
  },
  {
    id: 'netMargin', label: 'Net margin', fmt: asPct, higherIsBetter: true, weight: 0.9,
    self: (c) => ok(c.facts.netMargin),
    peer: (r) => ok(r.netProfitMarginTTM),
    trend: (c) => ({ label: 'last year', value: c.history.marginPrev }),
    say: () => 'The bottom line as a share of revenue.',
  },
  {
    id: 'roic', label: 'Return on invested capital', fmt: asPct, higherIsBetter: true, weight: 1.2,
    self: (c) => ok(c.facts.roic),
    peer: (r) => ok(r.returnOnInvestedCapitalTTM),
    say: () => 'The single best test of whether the business creates value: what every dollar put to work earns back.',
  },
  {
    id: 'roe', label: 'Return on equity', fmt: asPct, higherIsBetter: true, weight: 0.9,
    self: (c) => ok(c.facts.roe),
    peer: (r) => ok(r.returnOnEquityTTM),
    say: () => 'Flattered by leverage, so it is read alongside return on invested capital rather than instead of it.',
  },
  {
    id: 'fcfMargin', label: 'Free cash flow margin', fmt: asPct, higherIsBetter: true, weight: 1.0,
    self: (c) => (isNum(c.facts.fcf) && isNum(c.facts.revenue) && c.facts.revenue > 0
      ? c.facts.fcf / c.facts.revenue : null),
    peer: (r) => (isNum(r.freeCashFlowPerShareTTM) && isNum(r.revenuePerShareTTM) && r.revenuePerShareTTM > 0
      ? r.freeCashFlowPerShareTTM / r.revenuePerShareTTM : null),
    say: () => 'How much of each sale ends up as cash the company can actually spend.',
  },
  {
    id: 'earningsQuality', label: 'Earnings quality', fmt: (v) => `${dec(v, 2)}x`, higherIsBetter: true, weight: 0.6,
    self: (c) => ok(c.facts.incomeQuality),
    peer: (r) => ok(r.incomeQualityTTM),
    say: () => 'Operating cash flow divided by reported profit. Below 1x means the earnings are not arriving as cash.',
  },
];

/* ==========================================================================
   HEALTH — could the balance sheet survive a bad year?
   ========================================================================== */

const HEALTH = [
  {
    id: 'netDebtEbitda', label: 'Net debt / EBITDA', fmt: (v) => `${dec(v, 2)}x`, higherIsBetter: false, weight: 1.2,
    self: (c) => ok(c.facts.netDebtToEbitda),
    peer: (r) => ok(r.netDebtToEBITDATTM),
    say: (m, c) => isNum(c.facts.netDebt) && c.facts.netDebt < 0
      ? `${c.facts.symbol} holds ${money(Math.abs(c.facts.netDebt))} more cash than debt.`
      : 'Years of earnings it would take to clear the net debt.',
  },
  {
    id: 'debtEquity', label: 'Debt / equity', fmt: asPct, higherIsBetter: false, weight: 0.8,
    self: (c) => ok(c.facts.debtToEquity),
    peer: (r) => ok(r.debtToEquityRatioTTM),
    trend: (c) => ({ label: '5 years ago', value: c.history.de5 }),
    say: () => 'How much of the balance sheet is funded by lenders rather than owners.',
  },
  {
    id: 'currentRatio', label: 'Current ratio', fmt: (v) => `${dec(v, 2)}x`, higherIsBetter: true, weight: 0.8,
    self: (c) => ok(c.facts.currentRatio),
    peer: (r) => ok(r.currentRatioTTM),
    say: (m, c) => `Short term assets of ${money(c.facts.currentAssets)} against ${money(c.facts.currentLiabilities)} falling due.`,
  },
  {
    id: 'interestCover', label: 'Interest coverage', fmt: (v) => `${dec(v, 1)}x`, higherIsBetter: true, weight: 1.0,
    self: (c) => pos(c.facts.interestCover),
    peer: (r) => pos(r.interestCoverageRatioTTM),
    say: () => 'How many times over operating profit covers the interest bill.',
  },
  {
    id: 'ocfToDebt', label: 'Operating cash flow / debt', fmt: asPct, higherIsBetter: true, weight: 1.0,
    self: (c) => (isNum(c.facts.ocf) && isNum(c.facts.totalDebt) && c.facts.totalDebt > 0
      ? c.facts.ocf / c.facts.totalDebt : null),
    peer: (r) => ok(r.operatingCashFlowCoverageRatioTTM),
    say: () => 'The share of total borrowings the business generates in cash each year.',
  },
  {
    id: 'altmanZ', label: 'Altman Z-score', fmt: asNum, higherIsBetter: true, weight: 0.8,
    absolute: true,
    bands: [[1.8, 1], [2.7, 2], [3.5, 3], [5.0, 4], [8.0, 5]],
    self: (c) => ok(c.facts.altmanZ),
    say: () => 'A published distress model. Below 1.8 is the classic warning zone, above 3 is considered safe.',
  },
];

/* ==========================================================================
   MOMENTUM — what the market and the analysts have been doing lately

   Graded against the sector's own return rather than a peer cohort, because
   the comparison that matters is "did it beat the group it trades with".
   ========================================================================== */

const MOMENTUM = [
  {
    id: 'rel12m1', label: '12-1 month relative return', fmt: asPctSigned, higherIsBetter: true, weight: 1.2,
    absolute: true,
    bands: [[-0.20, 1], [-0.05, 2], [0.05, 3], [0.20, 4], [0.40, 5]],
    self: (c) => ok(c.momentum.rel12m1),
    say: () => 'Return over the last twelve months excluding the most recent one, against the sector. '
      + 'Skipping the latest month is the standard construction — it strips out short-term reversal.',
  },
  {
    id: 'rel6m', label: '6-month relative return', fmt: asPctSigned, higherIsBetter: true, weight: 1.0,
    absolute: true,
    bands: [[-0.15, 1], [-0.04, 2], [0.04, 3], [0.15, 4], [0.30, 5]],
    self: (c) => ok(c.momentum.rel6m),
    say: () => 'Six-month excess return over the sector.',
  },
  {
    id: 'rel3m', label: '3-month relative return', fmt: asPctSigned, higherIsBetter: true, weight: 0.8,
    absolute: true,
    bands: [[-0.10, 1], [-0.03, 2], [0.03, 3], [0.10, 4], [0.20, 5]],
    self: (c) => ok(c.momentum.rel3m),
    say: () => 'Three-month excess return over the sector.',
  },
  {
    id: 'vs200d', label: 'Price vs 200-day average', fmt: asPctSigned, higherIsBetter: true, weight: 1.0,
    absolute: true,
    bands: [[-0.15, 1], [-0.02, 2], [0.05, 3], [0.15, 4], [0.30, 5]],
    self: (c) => ok(c.momentum.vs200d),
    say: (m, c) => isNum(c.facts.avg200)
      ? `Trading at ${money(c.facts.price, { plain: true })} against a 200-day average of ${money(c.facts.avg200, { plain: true })}.`
      : 'No 200-day average available.',
  },
  {
    id: 'rangePos', label: 'Position in 52-week range', fmt: asPct, higherIsBetter: true, weight: 0.7,
    absolute: true,
    bands: [[0.20, 1], [0.40, 2], [0.60, 3], [0.80, 4], [0.95, 5]],
    self: (c) => ok(c.momentum.rangePos),
    say: (m, c) => `The 52-week range runs ${money(c.facts.yearLow, { plain: true })} to ${money(c.facts.yearHigh, { plain: true })}.`,
  },
  {
    id: 'revisions', label: 'Analyst revisions (3m)', fmt: (v) => (isNum(v) ? `${v > 0 ? '+' : ''}${trim(v, 0)} net` : 'n/a'),
    higherIsBetter: true, weight: 1.0,
    absolute: true,
    bands: [[-3, 1], [-1, 2], [1, 3], [4, 4], [8, 5]],
    self: (c) => ok(c.momentum.netUpgrades),
    say: (m, c) => isNum(c.momentum.netUpgrades)
      ? `${c.momentum.upgrades} upgrades against ${c.momentum.downgrades} downgrades over the past three months.`
      : 'No rating changes recorded in the period.',
  },
  {
    id: 'surprise', label: 'Earnings surprise streak', fmt: (v) => (isNum(v) ? `${trim(v, 0)} of 4 beats` : 'n/a'),
    higherIsBetter: true, weight: 0.8,
    absolute: true,
    bands: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    self: (c) => ok(c.momentum.beats),
    say: (m, c) => isNum(c.momentum.beats)
      ? `Beat consensus EPS in ${c.momentum.beats} of the last ${c.momentum.reported} reported quarters.`
      : 'Not enough reported quarters to judge.',
  },
];

export const METRICS = {
  value: VALUE,
  growth: GROWTH,
  profitability: PROFITABILITY,
  health: HEALTH,
  momentum: MOMENTUM,
};

export const FACTOR_META = [
  { key: 'value',         label: 'Value',         weight: 0.20, anchor: 'value',
    question: 'Is it cheap relative to the companies it competes with?' },
  { key: 'growth',        label: 'Growth',        weight: 0.20, anchor: 'growth',
    question: 'Is the business getting bigger, and is it forecast to keep going?' },
  { key: 'profitability', label: 'Profitability', weight: 0.25, anchor: 'profitability',
    question: 'How much of each sale survives, and what does the capital earn?' },
  { key: 'health',        label: 'Health',        weight: 0.20, anchor: 'health',
    question: 'Could the balance sheet absorb a bad year?' },
  { key: 'momentum',      label: 'Momentum',      weight: 0.15, anchor: 'momentum',
    question: 'What have the market and the analysts been doing lately?' },
];

/** Grade an absolute metric against its bands. */
export function gradeFromBands(value, bands) {
  if (!isNum(value) || !bands?.length) return null;
  // bands are ascending [threshold, grade]; interpolate between them
  if (value <= bands[0][0]) return bands[0][1];
  if (value >= bands.at(-1)[0]) return bands.at(-1)[1];
  for (let i = 1; i < bands.length; i++) {
    const [t0, g0] = bands[i - 1], [t1, g1] = bands[i];
    if (value <= t1) {
      const f = (value - t0) / (t1 - t0 || 1);
      return g0 + (g1 - g0) * f;
    }
  }
  return null;
}
