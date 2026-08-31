/* ==========================================================================
   Maz Vantage — the five factors

   Two data structures and one walk over them.

     METRICS   every ratio the report grades: where to read it, how to print
               it, which way is "good", and the sentence that explains what
               the number means once it has been graded.

     FACTORS   Valuation / Growth / Profitability / Health / Momentum, each
               split into named subtopics, each subtopic a list of metric ids.

   `gradeAll()` walks the tree, grades each metric against its sector
   distribution (see grading.js), and rolls subtopic and factor scores up
   from the metric grades. Adding a ratio is one registry entry plus one
   sentence — which is what makes sixty of them affordable.

   Every metric also carries a pass/fail tick against the sector median.
   That tick is display only. Scores are the mean of the metric grades and
   nothing else; see the note at the top of grading.js.
   ========================================================================== */

import { isNum, mult, pct, money, price, dec, trim, mean, stdev, cagr } from './util.js';
import { rollUp, gradeMetric, letterFor, MAX_SCORE } from './grading.js';

/* ==========================================================================
   Formatting
   ========================================================================== */

const FMT = {
  x:     (v) => mult(v),
  x2:    (v) => (isNum(v) ? `${dec(v, 2)}x` : 'n/a'),
  pct:   (v) => pct(v),
  pct2:  (v) => pct(v, { dp: 2 }),
  sign:  (v) => pct(v, { sign: true }),
  // A change measured in percentage points, not a proportion — see roeGrowth.
  ppt:   (v) => (isNum(v) ? `${dec(v * 100, 1)} pts` : 'n/a'),
  num:   (v) => (isNum(v) ? dec(v, 2) : 'n/a'),
  int:   (v) => (isNum(v) ? trim(v, 0) : 'n/a'),
  money: (v) => money(v),
  price: (v) => price(v),
};

/**
 * A flat 0-5 ruler between two absolute anchors, for the handful of judgments
 * that are not sector-relative — a discount to fair value means the same
 * thing in Utilities as in Software. Shaped like a distribution so the same
 * grader handles it.
 */
export function linearDist(lo, hi) {
  return { p: Array.from({ length: 21 }, (_, i) => lo + ((hi - lo) * i) / 20), n: null, synthetic: true };
}

/* ==========================================================================
   Sentence helpers
   ========================================================================== */

/** " That is Top 12% of the Technology sector, where the median sits at 22.4x." */
function vs(c, m, fmt = FMT.x) {
  if (!isNum(m?.median) || m.source === 'absolute') return '';
  const where = m.source === 'peers'
    ? 'its peer group'
    : `the ${c.facts.sector || 'wider'} sector`;

  // An ungraded metric has no percentile to quote, but it is still ticked
  // against the median — and a pass/fail whose basis is never stated is not a
  // verdict the reader can check. Name the median, claim no ranking.
  if (!m.rank) return ` The median across ${where} is ${fmt(m.median)}.`;

  return ` That is ${m.rank.text} of ${where}, where the median sits at ${fmt(m.median)}.`;
}

const SYM = (c) => c.facts.symbol;

/* ==========================================================================
   Statement helpers

   The report fetches annual statements, so every "year on year" line below is
   FY0 against FY−1 rather than the spec's trailing-twelve against the four
   quarters before it. Same question, one reporting period of lag; a quarterly
   fetch would be a second call per statement and is not what this app buys.
   ========================================================================== */

const FY = (rows, back = 0) => (rows?.length ? rows[rows.length - 1 - back] ?? null : null);

/** Average of a balance-sheet line across FY0 and FY−1, the spec's convention. */
function avgBalance(c, field) {
  const b = c.facts.statements.balance;
  const now = FY(b)?.[field];
  const prior = FY(b, 1)?.[field];
  if (!isNum(now)) return null;
  return isNum(prior) ? (now + prior) / 2 : now;
}

/** Return on equity for one fiscal year, on that year's average equity. */
function roeFor(c, back) {
  const inc = FY(c.facts.statements.income, back);
  const b = c.facts.statements.balance;
  const eq = FY(b, back)?.totalStockholdersEquity;
  const eqPrior = FY(b, back + 1)?.totalStockholdersEquity;
  if (!isNum(inc?.netIncome) || !isNum(eq) || eq <= 0) return null;
  const avg = isNum(eqPrior) && eqPrior > 0 ? (eq + eqPrior) / 2 : eq;
  return avg > 0 ? inc.netIncome / avg : null;
}

/** Working capital at a fiscal year end. */
function wcFor(c, back) {
  const r = FY(c.facts.statements.balance, back);
  return isNum(r?.totalCurrentAssets) && isNum(r?.totalCurrentLiabilities)
    ? r.totalCurrentAssets - r.totalCurrentLiabilities : null;
}

/** Consensus row n fiscal years out, or null. FY+1 is `forecast.base`. */
function estAt(c, plus) {
  const rows = c.forecast?.rows || [];
  const base = c.forecast?.base;
  if (!base) return null;
  return rows.find((r) => r.year === base.year + (plus - 1)) || null;
}

/**
 * Forward CAGR the way the spec defines it: the FY+2 consensus against the
 * last *reported* year, annualised over the three years between them.
 */
function fwdCagr(c, estField, actualField) {
  const target = estAt(c, 2);
  const base = FY(c.facts.statements.income, 1);   // FY−1, the spec's base
  const from = base?.[actualField];
  const to = target?.[estField];
  if (!isNum(from) || from <= 0 || !isNum(to)) return null;
  return cagr(from, to, 3);
}

/** Peer rows that actually carry an annual revenue growth figure. */
function peerGrowthSample(c) {
  return Object.values(c.peerGrowth || {})
    .map((r) => r?.revenueGrowth)
    .filter((v) => isNum(v) && v > -1 && v < 10);
}

/** Mean annual revenue growth across the named peers, or null under three. */
function peerRevenueGrowth(c) {
  const sample = peerGrowthSample(c);
  return sample.length >= 3 ? mean(sample) : null;
}

/* ==========================================================================
   Metric registry

   get(c)        -> the company's figure, or null
   explain(c, m) -> one sentence; `m` is the graded result
   dist          -> distribution key in sector-stats.json, when it differs
                    from the metric id (forward multiples borrow the trailing
                    distribution — same ratio family, near-enough spread)
   absolute      -> [lo, hi] ruler instead of a sector distribution
   ========================================================================== */

export const METRICS = {

  /* ---------------------------------------------------------------- value */

  dcfDiscount: {
    label: 'Discount to DCF fair value', fmt: FMT.pct, better: 'high',
    absolute: [-0.6, 0.6],
    get: (c) => c.discount,
    // Shown, never scored. The panel this metric renders offers a dozen
    // valuation models, and the reader picks one — so any grade taken from it
    // would measure the choice of model as much as the company. Every other
    // ratio on the page is a fact about the business ranked against its
    // sector; a fair value is an assumption, and the two do not average.
    ungraded: true,
    explain: (c, m) => {
      if (!isNum(m.value)) return `No levered discounted-cash-flow estimate is available for ${SYM(c)}.`;
      const side = m.value > 0 ? 'below' : 'above';
      return `${SYM(c)} trades at ${price(c.facts.price)}, ${pct(Math.abs(m.value))} ${side} the `
        + `${price(c.fairValue)} its forecast cash flows are worth once discounted back.`;
    },
  },

  fairPeGap: {
    label: 'P/E vs fair ratio', fmt: FMT.pct, better: 'high',
    absolute: [-0.75, 0.75],
    get: (c) => (isNum(c.fairPe) && isNum(c.facts.pe) && c.facts.pe > 0 ? c.fairPe / c.facts.pe - 1 : null),
    explain: (c, m) => {
      if (!isNum(m.value)) return 'A fair ratio needs a forecast growth rate from the analyst-estimates feed.';
      const cheap = m.value > 0;
      return `Its forecast growth justifies about ${mult(c.fairPe)} of earnings; the market is paying `
        + `${mult(c.facts.pe)}, so the multiple sits ${pct(Math.abs(m.value))} ${cheap ? 'below' : 'above'} `
        + 'what the growth alone supports.';
    },
  },

  grahamUpside: {
    label: 'Graham number vs price', fmt: FMT.pct, better: 'high',
    absolute: [-0.8, 0.8],
    get: (c) => (isNum(c.val.grahamNumber) && isNum(c.facts.price) && c.facts.price > 0
      ? c.val.grahamNumber / c.facts.price - 1 : null),
    explain: (c, m) => {
      if (!isNum(m.value)) return 'The Graham number needs positive earnings and book value.';
      return `Graham's defensive ceiling — the square root of 22.5 x earnings x book value — lands at `
        + `${price(c.val.grahamNumber)}, ${pct(Math.abs(m.value))} ${m.value > 0 ? 'above' : 'below'} the market price.`;
    },
  },

  earningsYieldTtm: {
    label: 'Earnings yield (TTM)', fmt: FMT.pct2, better: 'high',
    get: (c) => c.val.earningsYield,
    explain: (c, m) => `Each dollar invested buys ${pct(m.value, { dp: 2 })} of trailing earnings — `
      + `the P/E turned upside down.${vs(c, m, FMT.pct2)}`,
  },

  fcfYieldTtm: {
    label: 'Free cash flow yield (TTM)', fmt: FMT.pct2, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.val.fcfYield,
    explain: (c, m) => `After paying for its own upkeep, ${SYM(c)} throws off ${pct(m.value, { dp: 2 })} of its `
      + `market value in cash a year.${vs(c, m, FMT.pct2)}`,
  },

  evToSalesTtm: {
    label: 'EV / Sales (TTM)', fmt: FMT.x, better: 'low',
    get: (c) => c.val.evToSales,
    explain: (c, m) => `Buying the whole business — equity plus debt, less cash — costs ${mult(m.value)} `
      + `its trailing revenue.${vs(c, m)}`,
  },
  evToSalesFwd: {
    label: 'EV / Sales (FWD)', fmt: FMT.x, better: 'low', dist: 'evToSalesTtm',
    get: (c) => c.val.evToSalesFwd,
    explain: (c, m) => `On the revenue analysts expect next year, that falls to ${mult(m.value)}`
      + `${isNum(c.val.evToSales) ? ` from ${mult(c.val.evToSales)} trailing` : ''}.${vs(c, m)}`,
  },

  evToEbitdaTtm: {
    label: 'EV / EBITDA (TTM)', fmt: FMT.x, better: 'low',
    get: (c) => c.val.evToEbitda,
    explain: (c, m) => `The enterprise costs ${mult(m.value)} its cash operating profit — the multiple an `
      + `acquirer would quote, because it ignores how the business is financed.${vs(c, m)}`,
  },
  evToEbitdaFwd: {
    label: 'EV / EBITDA (FWD)', fmt: FMT.x, better: 'low', dist: 'evToEbitdaTtm',
    get: (c) => c.val.evToEbitdaFwd,
    explain: (c, m) => `Forward consensus puts it at ${mult(m.value)}.${vs(c, m)}`,
  },

  evToEbitTtm: {
    label: 'EV / EBIT (TTM)', fmt: FMT.x, better: 'low',
    get: (c) => c.val.evToEbit,
    explain: (c, m) => `Charging depreciation as the real cost it is, the enterprise trades at ${mult(m.value)} `
      + `operating profit.${vs(c, m)}`,
  },
  evToEbitFwd: {
    label: 'EV / EBIT (FWD)', fmt: FMT.x, better: 'low', dist: 'evToEbitTtm',
    get: (c) => c.val.evToEbitFwd,
    explain: (c, m) => `On next year's consensus operating profit, ${mult(m.value)}.${vs(c, m)}`,
  },

  peGaapTtm: {
    label: 'P/E GAAP (TTM)', fmt: FMT.x, better: 'low',
    get: (c) => c.facts.pe,
    explain: (c, m) => `${SYM(c)} earned ${price(c.facts.eps)} a share over the last twelve months, so the `
      + `market is paying ${mult(m.value)} for each dollar of reported profit.${vs(c, m)}`,
  },
  peNonGaapFwd: {
    label: 'P/E Non-GAAP (FWD)', fmt: FMT.x, better: 'low', dist: 'peGaapTtm',
    get: (c) => c.val.peFwd,
    explain: (c, m) => `Against the ${price(c.forecast.base?.eps)} analysts expect for the current year, `
      + `${mult(m.value)} — consensus EPS is an adjusted figure, so this runs below the GAAP multiple.${vs(c, m)}`,
  },

  pegGaap: {
    label: 'PEG GAAP (TTM)', fmt: FMT.x2, better: 'low',
    get: (c) => c.facts.peg,
    explain: (c, m) => `Dividing the earnings multiple by the growth behind it gives ${dec(m.value, 2)}x. `
      + `Below 1x the growth is arguably free; above it you are paying ahead.${vs(c, m, FMT.x2)}`,
  },
  pegNonGaap: {
    label: 'PEG Non-GAAP (FWD)', fmt: FMT.x2, better: 'low', dist: 'pegGaap',
    get: (c) => c.val.pegNonGaap,
    explain: (c, m) => `On forward earnings and forecast growth, ${dec(m.value, 2)}x.${vs(c, m, FMT.x2)}`,
  },

  priceToSalesTtm: {
    label: 'Price / Sales (TTM)', fmt: FMT.x, better: 'low',
    get: (c) => c.facts.ps,
    explain: (c, m) => `Every dollar of revenue is priced at ${mult(m.value)} — the multiple that still works `
      + `when earnings do not.${vs(c, m)}`,
  },
  priceToSalesFwd: {
    label: 'Price / Sales (FWD)', fmt: FMT.x, better: 'low', dist: 'priceToSalesTtm',
    get: (c) => c.val.psFwd,
    explain: (c, m) => `On forecast revenue, ${mult(m.value)}.${vs(c, m)}`,
  },

  priceToBookTtm: {
    label: 'Price / Book (TTM)', fmt: FMT.x, better: 'low',
    get: (c) => c.facts.pb,
    explain: (c, m) => `The shares cost ${mult(m.value)} the accounting value of what the company owns outright. `
      + `A business whose value is people and brands rather than plant will always look expensive here.${vs(c, m)}`,
  },

  priceToCashFlowTtm: {
    label: 'Price / Cash Flow (TTM)', fmt: FMT.x, better: 'low',
    get: (c) => c.val.priceToCashFlow,
    explain: (c, m) => `Measured against cash from operations rather than reported profit, ${mult(m.value)} — `
      + `harder to flatter with accounting choices.${vs(c, m)}`,
  },

  peVsPeers: {
    label: 'P/E vs peers', fmt: FMT.pct, better: 'low',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    absolute: [-0.8, 1.2],
    // Graded on an absolute scale, so the tick cannot mean "which side of the
    // sector median" — the only threshold that means anything here is zero,
    // the point where the company and its peers are priced the same.
    tick: { at: 0, pass: 'Trades below the peer average', fail: 'Trades above the peer average' },
    get: (c) => (isNum(c.facts.pe) && isNum(c.peers.peerPe) && c.peers.peerPe > 0
      ? c.facts.pe / c.peers.peerPe - 1 : null),
    explain: (c, m) => {
      if (!isNum(m.value)) return 'No peer earnings multiples were available to compare against.';
      const n = c.peers.peers.filter((p) => isNum(p.pe)).length;
      return `Against the ${mult(c.peers.peerPe)} average of ${n} named peer${n === 1 ? '' : 's'}, `
        + `${SYM(c)} trades ${pct(Math.abs(m.value))} ${m.value > 0 ? 'richer' : 'cheaper'}.`;
    },
  },

  peVsSector: {
    label: 'P/E vs sector median', fmt: FMT.pct, better: 'low',
    absolute: [-0.8, 1.2],
    // Shown, never scored, and given no ranking of its own. `peGaapTtm` is
    // already placed in the sector's P/E distribution one subtopic above;
    // grading the same P/E against the same sector a second time counts one
    // fact twice, and ranking a "distance from the median" inside that same
    // distribution is a ranking of a ranking.
    ungraded: true,
    tick: { at: 0, pass: 'Trades below the sector median', fail: 'Trades above the sector median' },
    get: (c) => {
      const med = c.lookup.medianFor('peGaapTtm');
      return isNum(c.facts.pe) && isNum(med) && med > 0 ? c.facts.pe / med - 1 : null;
    },
    explain: (c, m) => {
      const med = c.lookup.medianFor('peGaapTtm');
      if (!isNum(m.value)) return 'No sector earnings multiple was available to compare against.';
      return `The median ${c.facts.sector || 'listed'} company trades at ${mult(med)}; ${SYM(c)} is `
        + `${pct(Math.abs(m.value))} ${m.value > 0 ? 'above' : 'below'} that.`;
    },
  },

  peVsHistory: {
    label: 'P/E vs its own history', fmt: FMT.pct, better: 'low',
    absolute: [-0.6, 0.9],
    // Shown, never scored. This one is not a sector-relative fact at all — it
    // measures the company against its own past — so a sector position for it
    // would be an invented number, and a grade would mix a self-comparison
    // into an average of peer comparisons.
    ungraded: true,
    tick: { at: 0, pass: 'Trades below its own average', fail: 'Trades above its own average' },
    get: (c) => {
      const avg = mean(c.history.peSeries.map((r) => r.pe));
      return isNum(c.facts.pe) && isNum(avg) && avg > 0 ? c.facts.pe / avg - 1 : null;
    },
    explain: (c, m) => {
      const s = c.history.peSeries;
      const avg = mean(s.map((r) => r.pe));
      if (!isNum(m.value)) return 'Not enough multiple history to compare against.';
      return `Over the last ${s.length} years ${SYM(c)} has averaged ${mult(avg)}; today's ${mult(c.facts.pe)} `
        + `is ${pct(Math.abs(m.value))} ${m.value > 0 ? 'above' : 'below'} its own norm.`;
    },
  },

  dividendYieldTtm: {
    label: 'Dividend yield (TTM)', fmt: FMT.pct2, better: 'high',
    get: (c) => c.facts.dividendYield,
    explain: (c, m) => (isNum(m.value) && m.value > 0
      ? `Cash paid out comes to ${pct(m.value, { dp: 2 })} of the share price a year.${vs(c, m, FMT.pct2)}`
      : `${SYM(c)} pays no dividend, so none of the return arrives as cash.`),
  },

  buybackYield: {
    label: 'Buyback yield', fmt: FMT.pct2, better: 'high',
    get: (c) => c.val.buybackYield,
    explain: (c, m) => (isNum(m.value) && m.value > 0
      ? `Share repurchases retired the equivalent of ${pct(m.value, { dp: 2 })} of the market value over the `
        + `last year, lifting every remaining holder's claim.${vs(c, m, FMT.pct2)}`
      : `${SYM(c)} did not shrink its share count over the period.`),
  },

  shareholderYield: {
    label: 'Shareholder yield', fmt: FMT.pct2, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.val.shareholderYield,
    explain: (c, m) => `Dividends and buybacks together return ${pct(m.value, { dp: 2 })} a year — the whole `
      + `of what reaches shareholders without selling a share.${vs(c, m, FMT.pct2)}`,
  },

  /* --------------------------------------------------------------- growth */

  revenueGrowthYoy: {
    label: 'Revenue growth (YoY)', fmt: FMT.pct, better: 'high',
    get: (c) => c.growth.revenueYoy,
    explain: (c, m) => `Sales ${m.value >= 0 ? 'grew' : 'fell'} ${pct(Math.abs(m.value))} against the year `
      + `before.${vs(c, m, FMT.pct)}`,
  },
  revenueGrowth3y: {
    label: 'Revenue growth (3Y)', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.growth.revenue3y,
    explain: (c, m) => `Revenue has compounded at ${pct(m.value, { sign: true })} a year over three years — `
      + `long enough that one strong quarter cannot carry it.${vs(c, m, FMT.pct)}`,
  },
  revenueGrowth5y: {
    label: 'Revenue growth (5Y)', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.growth.revenue5y,
    explain: (c, m) => `Over five years revenue has compounded at ${pct(m.value, { sign: true })} a year — `
      + `the length of run that separates a trend from a good couple of quarters.${vs(c, m, FMT.pct)}`,
  },

  ebitdaGrowth: {
    label: 'EBITDA growth', fmt: FMT.pct, better: 'high',
    get: (c) => c.growth.ebitda,
    explain: (c, m) => `Cash operating profit moved ${pct(m.value, { sign: true })}.${vs(c, m, FMT.pct)}`,
  },
  ebitGrowth: {
    label: 'EBIT growth', fmt: FMT.pct, better: 'high',
    get: (c) => c.growth.ebit,
    explain: (c, m) => `Operating profit after depreciation moved ${pct(m.value, { sign: true })}.${vs(c, m, FMT.pct)}`,
  },
  epsGrowth: {
    label: 'EPS growth', fmt: FMT.pct, better: 'high',
    get: (c) => c.growth.eps,
    explain: (c, m) => `Earnings per share moved ${pct(m.value, { sign: true })} — profit growth and any change `
      + `in the share count, combined.${vs(c, m, FMT.pct)}`,
  },
  epsDilutedGrowth: {
    label: 'EPS diluted growth', fmt: FMT.pct, better: 'high',
    get: (c) => c.growth.epsDiluted,
    explain: (c, m) => `On the fully diluted count, which assumes every option and convertible is exercised, `
      + `${pct(m.value, { sign: true })}.${vs(c, m, FMT.pct)}`,
  },
  netIncomeGrowth5y: {
    label: 'Net income growth (5Y)', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.growth.netIncome5y,
    explain: (c, m) => `Bottom-line profit per share is ${pct(m.value, { sign: true })} against five years ago.`
      + vs(c, m, FMT.pct),
  },

  ocfGrowth: {
    label: 'Operating cash flow growth', fmt: FMT.pct, better: 'high',
    get: (c) => c.growth.ocf,
    explain: (c, m) => `Cash actually collected from operations moved ${pct(m.value, { sign: true })}. When this `
      + `lags reported profit, the growth is sitting in receivables rather than the bank.${vs(c, m, FMT.pct)}`,
  },
  fcfGrowth: {
    label: 'Free cash flow growth', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.growth.fcf,
    explain: (c, m) => `After capital spending, free cash flow moved ${pct(m.value, { sign: true })}.${vs(c, m, FMT.pct)}`,
  },

  capexGrowth: {
    label: 'Capital expenditure growth', fmt: FMT.pct, better: 'high',
    get: (c) => c.growth.capex,
    explain: (c, m) => `Capital spending moved ${pct(m.value, { sign: true })}. Read it with revenue: rising `
      + `capex ahead of rising sales is investment, behind it is maintenance.${vs(c, m, FMT.pct)}`,
  },
  rdExpenseGrowth: {
    label: 'R&D growth', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.growth.rdExpense,
    explain: (c, m) => `Research spending moved ${pct(m.value, { sign: true })} — next decade's revenue being `
      + `paid for out of this year's.${vs(c, m, FMT.pct)}`,
  },
  bookValueGrowth: {
    label: 'Book value / share growth', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.growth.bookValue,
    explain: (c, m) => `The accounting value behind each share moved ${pct(m.value, { sign: true })}.${vs(c, m, FMT.pct)}`,
  },

  fwdRevenueGrowth: {
    label: 'Forecast revenue growth', fmt: FMT.pct, better: 'high',
    dist: 'revenueGrowthYoy',
    get: (c) => c.forecast.revenueGrowth,
    explain: (c, m) => {
      if (!isNum(m.value)) return 'No analyst revenue consensus is available.';
      return `${c.forecast.analystCount || 'The'} analyst${c.forecast.analystCount === 1 ? '' : 's'} covering `
        + `${SYM(c)} expect revenue to grow ${pct(m.value)} a year over the next ${c.forecast.span} years.`
        + vs(c, m, FMT.pct);
    },
  },
  fwdEarningsGrowth: {
    label: 'Forecast earnings growth', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    dist: 'netIncomeGrowth',
    get: (c) => c.forecast.earningsGrowth,
    explain: (c, m) => (isNum(m.value)
      ? `Profit is forecast to compound at ${pct(m.value)} a year, against ${pct(c.bm.marketEarningsGrowth)} `
        + `for the wider market.${vs(c, m, FMT.pct)}`
      : 'No analyst profit consensus is available.'),
  },
  fwdEpsGrowth: {
    label: 'Forecast EPS growth', fmt: FMT.pct, better: 'high',
    dist: 'epsGrowth',
    get: (c) => c.forecast.epsGrowth,
    explain: (c, m) => (isNum(m.value)
      ? `Per share, ${pct(m.value)} a year — buybacks make this the number that reaches you.${vs(c, m, FMT.pct)}`
      : 'No forward EPS path is available.'),
  },
  fwdRoe: {
    label: 'Forecast return on equity', fmt: FMT.pct, better: 'high',
    dist: 'returnOnEquity',
    get: (c) => c.forecast.futureRoe,
    explain: (c, m) => (isNum(m.value)
      ? `Rolling the forecast profits into retained equity implies a return on equity of ${pct(m.value)} in `
        + `${c.forecast.target?.year ?? 'the final forecast year'}.${vs(c, m, FMT.pct)}`
      : 'Projecting return on equity needs both an equity base and a forecast profit path.'),
  },

  dpsGrowth: {
    label: 'Dividend per share growth', fmt: FMT.pct, better: 'high',
    get: (c) => c.growth.dps,
    explain: (c, m) => (isNum(m.value)
      ? `The dividend moved ${pct(m.value, { sign: true })} per share.${vs(c, m, FMT.pct)}`
      : `${SYM(c)} pays no dividend, so there is no payout growth to measure.`),
  },
  dividendGrowth3y: {
    label: 'Dividend growth (3Y)', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.growth.dividend3y,
    explain: (c, m) => (isNum(m.value)
      ? `The payout is ${pct(m.value, { sign: true })} against three years ago.${vs(c, m, FMT.pct)}`
      : 'No three-year dividend record is available.'),
  },

  /* -------------------------------------------------------- profitability */

  grossMargin: {
    label: 'Gross profit margin', fmt: FMT.pct, better: 'high',
    get: (c) => c.facts.grossMargin,
    explain: (c, m) => `${pct(m.value)} of every sales dollar survives the direct cost of delivering it — the `
      + `ceiling on every margin below.${vs(c, m, FMT.pct)}`,
  },
  ebitdaMargin: {
    label: 'EBITDA margin', fmt: FMT.pct, better: 'high',
    get: (c) => c.facts.ebitdaMargin,
    explain: (c, m) => `${pct(m.value)} survives once the cost of running the business is paid, before `
      + `depreciation, interest and tax.${vs(c, m, FMT.pct)}`,
  },
  ebitMargin: {
    label: 'EBIT margin', fmt: FMT.pct, better: 'high',
    get: (c) => c.facts.operatingMargin,
    explain: (c, m) => `${pct(m.value)} is left as operating profit after wearing down the assets it took to `
      + `earn it.${vs(c, m, FMT.pct)}`,
  },
  netMargin: {
    label: 'Net income margin', fmt: FMT.pct, better: 'high',
    get: (c) => c.facts.netMargin,
    explain: (c, m) => `${pct(m.value)} of revenue reaches the bottom line after everything — lenders, the tax `
      + `authority and all.${vs(c, m, FMT.pct)}`,
  },

  returnOnEquity: {
    label: 'Return on common equity', fmt: FMT.pct, better: 'high',
    get: (c) => c.facts.roe,
    explain: (c, m) => `Shareholders' capital earns ${pct(m.value)} a year. Leverage flatters this one: a `
      + `thin equity base can lift it without the business improving at all.${vs(c, m, FMT.pct)}`,
  },
  returnOnInvestedCapital: {
    label: 'Return on invested capital', fmt: FMT.pct, better: 'high',
    get: (c) => c.facts.roic,
    explain: (c, m) => `Counting debt and equity alike, ${SYM(c)} earns ${pct(m.value)} on the capital in the `
      + `business — the cleanest read on whether it creates value.${vs(c, m, FMT.pct)}`,
  },
  returnOnAssets: {
    label: 'Return on assets', fmt: FMT.pct, better: 'high',
    get: (c) => c.facts.roa,
    explain: (c, m) => `Every dollar on the balance sheet returns ${pct(m.value)} a year.${vs(c, m, FMT.pct)}`,
  },
  returnOnTangibleAssets: {
    label: 'Return on tangible assets', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.facts.returnOnTangibleAssets,
    explain: (c, m) => `Stripping out goodwill and other intangibles left over from acquisitions, ${pct(m.value)}.`
      + vs(c, m, FMT.pct),
  },
  returnOnCapitalEmployed: {
    label: 'Return on capital employed', fmt: FMT.pct, better: 'high',
    get: (c) => c.facts.roce,
    explain: (c, m) => `Operating profit against the capital actually put to work: ${pct(m.value)}.${vs(c, m, FMT.pct)}`,
  },

  assetTurnover: {
    label: 'Asset turnover', fmt: FMT.x2, better: 'high',
    get: (c) => c.facts.assetTurnover,
    explain: (c, m) => `${SYM(c)} turns its asset base into ${dec(m.value, 2)}x its value in sales each year.`
      + vs(c, m, FMT.x2),
  },
  fixedAssetTurnover: {
    label: 'Fixed asset turnover', fmt: FMT.x2, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.facts.fixedAssetTurnover,
    explain: (c, m) => `Against property and equipment alone, ${dec(m.value, 2)}x.${vs(c, m, FMT.x2)}`,
  },
  capexToRevenue: {
    label: 'Capex / revenue', fmt: FMT.pct, better: 'low',
    get: (c) => c.facts.capexToRevenue,
    explain: (c, m) => `Keeping the business running and growing costs ${pct(m.value)} of revenue a year. `
      + `Lower means more of each sale is yours to keep.${vs(c, m, FMT.pct)}`,
  },
  cashPerShare: {
    label: 'Cash per share', fmt: FMT.price, better: 'high',
    get: (c) => c.facts.cashPerShare,
    explain: (c, m) => `${price(m.value)} of cash and short-term investments stands behind each share.`
      + vs(c, m, FMT.price),
  },

  incomeQuality: {
    label: 'Income quality (OCF / net income)', fmt: FMT.x2, better: 'high',
    get: (c) => c.facts.incomeQuality,
    explain: (c, m) => `For every dollar of reported profit, ${dec(m.value, 2)} dollars of cash came through the `
      + `door. Under 1x for long is the classic warning that earnings are an accounting event.${vs(c, m, FMT.x2)}`,
  },
  fcfToOcf: {
    label: 'Free cash flow / operating cash flow', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.facts.fcfToOcf,
    explain: (c, m) => `${pct(m.value)} of operating cash survives capital spending and is genuinely free.`
      + vs(c, m, FMT.pct),
  },
  sbcToRevenue: {
    label: 'Stock comp / revenue', fmt: FMT.pct2, better: 'low',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.facts.sbcToRevenue,
    explain: (c, m) => `Shares issued to staff cost ${pct(m.value, { dp: 2 })} of revenue — a real expense paid `
      + `in dilution rather than cash.${vs(c, m, FMT.pct2)}`,
  },
  effectiveTaxRate: {
    label: 'Effective tax rate', fmt: FMT.pct, better: 'low',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.facts.effectiveTaxRate,
    explain: (c, m) => `${pct(m.value)} of pre-tax profit goes in tax. A rate far below the statutory one is `
      + `worth understanding before assuming it lasts.${vs(c, m, FMT.pct)}`,
  },

  /* --------------------------------------------------------------- health */

  currentRatio: {
    label: 'Current ratio', fmt: FMT.x2, better: 'high',
    get: (c) => c.facts.currentRatio,
    explain: (c, m) => `${SYM(c)} holds ${dec(m.value, 2)} dollars of short-term assets for every dollar falling due `
      + `within the year.${vs(c, m, FMT.x2)}`,
  },
  quickRatio: {
    label: 'Quick ratio', fmt: FMT.x2, better: 'high',
    get: (c) => c.facts.quickRatio,
    explain: (c, m) => `Excluding inventory, which cannot always be sold in a hurry, ${dec(m.value, 2)}x.`
      + vs(c, m, FMT.x2),
  },
  cashRatio: {
    label: 'Cash ratio', fmt: FMT.x2, better: 'high',
    get: (c) => c.facts.cashRatio,
    explain: (c, m) => `On cash alone — no collections assumed — ${dec(m.value, 2)}x of near-term obligations.`
      + vs(c, m, FMT.x2),
  },

  debtToEquity: {
    label: 'Debt / equity', fmt: FMT.x2, better: 'low',
    get: (c) => c.facts.debtToEquity,
    explain: (c, m) => `${dec(m.value, 2)} dollars borrowed for every dollar of shareholders' capital.`
      + vs(c, m, FMT.x2),
  },
  financialLeverage: {
    label: 'Financial leverage', fmt: FMT.x2, better: 'low',
    get: (c) => c.facts.financialLeverage,
    explain: (c, m) => `Total assets are ${dec(m.value, 2)}x the equity underneath them — the multiplier that `
      + `works both directions.${vs(c, m, FMT.x2)}`,
  },
  netDebtToEbitda: {
    label: 'Net debt / EBITDA', fmt: FMT.x2, better: 'low',
    get: (c) => c.facts.netDebtToEbitda,
    explain: (c, m) => (isNum(m.value) && m.value < 0
      ? `${SYM(c)} holds more cash than debt, so the ratio is negative — there is nothing to pay down.`
        + vs(c, m, FMT.x2)
      : `At current cash profits it would take ${dec(m.value, 2)} years to clear net borrowings.`
        + vs(c, m, FMT.x2)),
  },
  debtToAssets: {
    label: 'Debt / assets', fmt: FMT.pct, better: 'low',
    get: (c) => c.facts.debtToAssets,
    explain: (c, m) => `${pct(m.value)} of the balance sheet is funded by debt.${vs(c, m, FMT.pct)}`,
  },
  longTermDebtToCapital: {
    label: 'Long-term debt / capital', fmt: FMT.pct, better: 'low',
    get: (c) => c.facts.longTermDebtToCapital,
    explain: (c, m) => `Of permanent capital, ${pct(m.value)} is long-dated borrowing.${vs(c, m, FMT.pct)}`,
  },

  interestCoverage: {
    label: 'Interest coverage', fmt: FMT.x, better: 'high',
    get: (c) => c.facts.interestCover,
    explain: (c, m) => (isNum(m.value)
      ? `Operating profit covers the interest bill ${mult(m.value)} over.${vs(c, m)}`
      : `${SYM(c)} reports no meaningful interest expense — there is nothing to cover.`),
  },
  solvencyRatio: {
    label: 'Solvency ratio', fmt: FMT.x2, better: 'high',
    get: (c) => c.facts.solvencyRatio,
    explain: (c, m) => `Annual profit plus depreciation comes to ${dec(m.value, 2)}x total liabilities.`
      + vs(c, m, FMT.x2),
  },
  debtServiceCoverage: {
    label: 'Debt service coverage', fmt: FMT.x2, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.facts.debtServiceCoverage,
    explain: (c, m) => `Operating income covers scheduled principal and interest ${dec(m.value, 2)}x over.`
      + vs(c, m, FMT.x2),
  },

  altmanZScore: {
    label: 'Altman Z-Score', fmt: FMT.num, better: 'high',
    get: (c) => c.facts.altmanZ,
    explain: (c, m) => {
      const zone = m.value > 2.99 ? 'the safe zone' : m.value > 1.81 ? 'the grey zone' : 'the distress zone';
      return `${dec(m.value, 2)} puts ${SYM(c)} in ${zone} of Altman's bankruptcy model, which blends working `
        + `capital, retained earnings, profitability, leverage and turnover.${vs(c, m, FMT.num)}`;
    },
  },
  piotroskiScore: {
    label: 'Piotroski F-Score', fmt: FMT.int, better: 'high',
    get: (c) => c.facts.piotroski,
    explain: (c, m) => `${trim(m.value, 0)} of 9 tests passed on profitability, leverage and operating `
      + `efficiency — a checklist of whether the fundamentals improved this year.${vs(c, m, FMT.int)}`,
  },

  bookValuePerShare: {
    label: 'Book value / share', fmt: FMT.price, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.facts.bookValuePerShare,
    explain: (c, m) => `${price(m.value)} of net assets stands behind each share on the accounts.`
      + vs(c, m, FMT.price),
  },
  tangibleBookValuePerShare: {
    label: 'Tangible book / share', fmt: FMT.price, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.facts.tangibleBookValuePerShare,
    explain: (c, m) => `Excluding goodwill and intangibles, ${price(m.value)} — what would plausibly remain in a `
      + `wind-up.${vs(c, m, FMT.price)}`,
  },

  /* ------------------------------------------------------------- momentum */

  return1m: {
    label: '1-month return', fmt: FMT.sign, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.r1m,
    explain: (c, m) => `${pct(m.value, { sign: true })} over the last month.${vs(c, m, FMT.sign)}`,
  },
  return3m: {
    label: '3-month return', fmt: FMT.sign, better: 'high',
    get: (c) => c.momentum.r3m,
    explain: (c, m) => `${pct(m.value, { sign: true })} across the quarter.${vs(c, m, FMT.sign)}`,
  },
  return6m: {
    label: '6-month return', fmt: FMT.sign, better: 'high',
    get: (c) => c.momentum.r6m,
    explain: (c, m) => `${pct(m.value, { sign: true })} over six months.${vs(c, m, FMT.sign)}`,
  },
  returnYtd: {
    label: 'Year-to-date return', fmt: FMT.sign, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.rYtd,
    explain: (c, m) => `${pct(m.value, { sign: true })} since the turn of the year.${vs(c, m, FMT.sign)}`,
  },
  return1y: {
    label: '1-year return', fmt: FMT.sign, better: 'high',
    get: (c) => c.momentum.r1y,
    explain: (c, m) => `${pct(m.value, { sign: true })} over twelve months — long enough to reflect the `
      + `business, short enough to still be sentiment.${vs(c, m, FMT.sign)}`,
  },

  excessReturn1yVsSector: {
    label: 'Excess return vs sector', fmt: FMT.sign, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.excessSector,
    explain: (c, m) => (isNum(m.value)
      ? `${SYM(c)} ${m.value >= 0 ? 'beat' : 'trailed'} its sector ETF by ${pct(Math.abs(m.value))} over the `
        + `year, which returned ${pct(c.momentum.sectorReturn)}.${vs(c, m, FMT.sign)}`
      : 'No sector benchmark series was available for the comparison.'),
  },
  excessReturn1yVsMarket: {
    label: 'Excess return vs market', fmt: FMT.sign, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.excessMarket,
    explain: (c, m) => (isNum(m.value)
      ? `Against the S&P 500's ${pct(c.momentum.marketReturn)}, ${SYM(c)} ${m.value >= 0 ? 'added' : 'gave up'} `
        + `${pct(Math.abs(m.value))}.${vs(c, m, FMT.sign)}`
      : 'No market benchmark series was available for the comparison.'),
  },

  offYearHigh: {
    label: 'Below 52-week high', fmt: FMT.pct, better: 'low',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.offHigh,
    explain: (c, m) => `The shares sit ${pct(m.value)} below their twelve-month high of `
      + `${price(c.facts.yearHigh)}.${vs(c, m, FMT.pct)}`,
  },
  aboveYearLow: {
    label: 'Above 52-week low', fmt: FMT.pct, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.aboveLow,
    explain: (c, m) => `And ${pct(m.value)} above the ${price(c.facts.yearLow)} low.${vs(c, m, FMT.pct)}`,
  },
  priceToAvg50: {
    label: 'Price vs 50-day average', fmt: FMT.x2, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.toAvg50,
    explain: (c, m) => `Trading at ${dec(m.value, 2)}x the 50-day average — the short-term trend.`
      + vs(c, m, FMT.x2),
  },
  priceToAvg200: {
    label: 'Price vs 200-day average', fmt: FMT.x2, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.toAvg200,
    explain: (c, m) => `And ${dec(m.value, 2)}x the 200-day average, the line most trend followers actually `
      + `watch.${vs(c, m, FMT.x2)}`,
  },

  beta: {
    label: 'Beta (5Y)', fmt: FMT.num, better: 'low',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.facts.beta,
    explain: (c, m) => `A one percent move in the market has historically moved ${SYM(c)} about `
      + `${dec(m.value, 2)} percent.${vs(c, m, FMT.num)}`,
  },
  volatility: {
    label: 'Weekly volatility', fmt: FMT.pct, better: 'low',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.volatility,
    explain: (c, m) => `Week to week the price has swung ${pct(m.value)} on average over the past year.`
      + vs(c, m, FMT.pct),
  },
  maxDrawdown1y: {
    label: 'Maximum drawdown (1Y)', fmt: FMT.pct, better: 'low',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.drawdown,
    explain: (c, m) => `The worst peak-to-trough fall of the last year was ${pct(m.value)} — the loss a holder `
      + `had to sit through.${vs(c, m, FMT.pct)}`,
  },

  targetUpside: {
    label: 'Upside to consensus target', fmt: FMT.sign, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.targetUpside,
    explain: (c, m) => (isNum(m.value)
      ? `The twelve-month consensus target of ${price(c.momentum.targetPrice)} implies `
        + `${pct(m.value, { sign: true })} from here.${vs(c, m, FMT.sign)}`
      : 'No consensus price target is available.'),
  },
  targetVsCostOfEquity: {
    label: 'Forecast return vs cost of equity', fmt: FMT.sign, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    // Absolute, not sector-relative: the question is whether the forecast pays
    // for the risk taken, and that hurdle does not move with the sector.
    absolute: [-0.30, 0.30],
    // With no grade left on this row the tick is the whole verdict, and the
    // only threshold that means anything is zero — the point where the
    // forecast return exactly pays for the risk.
    tick: { at: 0, pass: 'Forecast return clears the cost of equity', fail: 'Forecast return falls short of the cost of equity' },
    get: (c) => (isNum(c.momentum.expectedTotalReturn) && isNum(c.momentum.costOfEquity)
      ? c.momentum.expectedTotalReturn - c.momentum.costOfEquity : null),
    explain: (c, m) => {
      if (!isNum(m.value)) return 'This needs a consensus price target and a beta to build a cost of equity from.';
      const beta = dec(c.facts.beta, 2);
      return `At a beta of ${beta}, holding ${SYM(c)} should earn ${pct(c.momentum.costOfEquity)} a year `
        + `— ${pct(c.bm.riskFreeRate)} risk-free plus ${beta} times a ${pct(c.bm.equityRiskPremium)} equity `
        + `risk premium. The target plus the dividend implies ${pct(c.momentum.expectedTotalReturn, { sign: true })}, `
        + `${m.value >= 0 ? 'clearing that' : 'falling short'} by ${pct(Math.abs(m.value))}.`;
    },
  },

  analystScore: {
    label: 'Analyst rating', fmt: FMT.num, better: 'high',
    // Not a line in MAZ_MASTER_SPEC, so it is shown and ticked but never
    // scored: the factor grade has to be the spec's ratio set and nothing
    // else, or the number on screen is not the number the engine defines.
    ungraded: true,
    get: (c) => c.momentum.analystScore,
    explain: (c, m) => (isNum(m.value)
      ? `Across ${c.momentum.analystTotal} ratings the consensus scores ${dec(m.value, 2)} out of 5, where 5 is `
        + `a unanimous strong buy.${vs(c, m, FMT.num)}`
      : 'No analyst ratings breakdown is available.'),
  },

  /* ---------------------------------------------- spec: valuation additions */

  peNonGaapTtm: {
    label: 'P/E Non-GAAP (TTM)', fmt: FMT.x, better: 'low', dist: 'peGaapTtm',
    get: (c) => {
      // The consensus basis on reported quarters: price over the sum of the
      // last four actual EPS prints. Anything short of four quarters would be
      // an annualisation, not a trailing twelve months, so it goes unrated.
      const rows = (c.ds.get('earnings') || [])
        .filter((r) => isNum(r?.epsActual))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 4);
      if (rows.length < 4) return null;
      const eps = rows.reduce((t, r) => t + r.epsActual, 0);
      return isNum(c.facts.price) && eps > 0 ? c.facts.price / eps : null;
    },
    explain: (c, m) => (isNum(m.value)
      ? `On the last four reported quarters of adjusted earnings, ${mult(m.value)}.${vs(c, m)}`
      : 'Fewer than four quarters of reported EPS are available, so a trailing non-GAAP multiple cannot be formed.'),
  },

  /* ------------------------------------------------- spec: growth additions */

  fwdEbitdaGrowth: {
    label: 'Forecast EBITDA growth', fmt: FMT.pct, better: 'high', dist: 'ebitdaGrowth',
    get: (c) => fwdCagr(c, 'ebitda', 'ebitda'),
    explain: (c, m) => (isNum(m.value)
      ? `Consensus has EBITDA compounding at ${pct(m.value)} a year from the last reported year.${vs(c, m, FMT.pct)}`
      : 'No usable EBITDA base or forecast to annualise.'),
  },
  fwdEbitGrowth: {
    label: 'Forecast EBIT growth', fmt: FMT.pct, better: 'high', dist: 'ebitGrowth',
    get: (c) => fwdCagr(c, 'ebit', 'operatingIncome'),
    explain: (c, m) => (isNum(m.value)
      ? `Operating profit is forecast to compound at ${pct(m.value)} a year.${vs(c, m, FMT.pct)}`
      : 'No usable operating-profit base or forecast to annualise.'),
  },
  epsLongTermCagr: {
    label: 'EPS growth (long term)', fmt: FMT.pct, better: 'high',
    get: (c) => {
      // The furthest consensus year available, annualised from the current one.
      const rows = (c.forecast?.rows || []).filter((r) => isNum(r.eps));
      const base = rows.find((r) => r.year === c.forecast?.base?.year);
      const far = rows.at(-1);
      if (!base || !far || far === base || !isNum(base.eps) || base.eps <= 0) return null;
      const n = far.year - base.year;
      return n >= 3 ? cagr(base.eps, far.eps, n) : null;
    },
    explain: (c, m) => {
      const rows = (c.forecast?.rows || []).filter((r) => isNum(r.eps));
      if (!isNum(m.value)) return 'Fewer than three forward years of EPS consensus are published, so no long-term rate can be taken.';
      return `Across the consensus out to ${rows.at(-1).year}, earnings per share compound at ${pct(m.value)} a year.${vs(c, m, FMT.pct)}`;
    },
  },
  roeGrowth: {
    label: 'ROE change (YoY)', fmt: FMT.ppt, better: 'high',
    get: (c) => {
      const now = roeFor(c, 0);
      const prior = roeFor(c, 1);
      // A percentage-point change, not a ratio: going from 4% to 8% is four
      // points, and calling it "100% growth" would rank a tiny base as a triumph.
      return isNum(now) && isNum(prior) ? now - prior : null;
    },
    explain: (c, m) => {
      const now = roeFor(c, 0);
      const prior = roeFor(c, 1);
      if (!isNum(m.value)) return 'Equity was negative or missing in one of the two years, so the change cannot be measured.';
      return `Return on equity moved from ${pct(prior)} to ${pct(now)}, a change of ${dec(m.value * 100, 1)} points.${vs(c, m, FMT.ppt)}`;
    },
  },
  fwdRoeGrowth: {
    label: 'Forecast ROE growth', fmt: FMT.pct, better: 'high',
    get: (c) => {
      // Annualised over the three years the spec spans, not a point change —
      // its trailing twin `roeGrowth` is the one measured in points.
      //
      // Equity is held flat at the same average the trailing ROE uses, which
      // the spec names as the accepted fallback where no forward-equity model
      // exists. Both ends of the ratio then rest on one definition of equity;
      // taking today's book value for the forward end and an annual average
      // for the base would put most of the answer in the switch between them.
      const eq = avgBalance(c, 'totalStockholdersEquity');
      const target = estAt(c, 2);
      const prior = roeFor(c, 1);
      if (!isNum(eq) || eq <= 0 || !isNum(target?.netIncome) || !isNum(prior) || prior <= 0) return null;
      return cagr(prior, target.netIncome / eq, 3);
    },
    explain: (c, m) => (isNum(m.value)
      ? `Holding the equity base flat, consensus profits imply return on equity compounding at `
        + `${pct(m.value)} a year. Buybacks shrink that base, so for a company retiring stock this `
        + `reads as a floor rather than a forecast.${vs(c, m, FMT.pct)}`
      : 'No forward profit forecast, or equity was not positive in the base year.'),
  },
  workingCapitalGrowth: {
    label: 'Working capital growth', fmt: FMT.pct, better: 'high',
    get: (c) => {
      const now = wcFor(c, 0);
      const prior = wcFor(c, 1);
      if (!isNum(now) || !isNum(prior) || prior <= 0) return null;
      // Crossing zero makes the percentage meaningless rather than dramatic.
      if ((now < 0) !== (prior < 0)) return null;
      return now / prior - 1;
    },
    explain: (c, m) => (isNum(m.value)
      ? `The cushion between current assets and current liabilities moved ${pct(m.value)} over the year.${vs(c, m, FMT.pct)}`
      : 'Working capital was negative or crossed zero between the two years, so the change is not meaningful.'),
  },

  /* ------------------------------------------ spec: profitability additions */

  cashFromOperations: {
    label: 'Cash from operations (TTM)', fmt: FMT.money, better: 'high',
    get: (c) => c.facts.ocf,
    explain: (c, m) => (isNum(m.value)
      ? `The business collected ${money(m.value)} of cash from trading over the last twelve months. `
        + `Ranked on size, not on margin — scale is the point.${vs(c, m, FMT.money)}`
      : 'No cash flow statement is available.'),
  },
  ocfMargin: {
    label: 'Operating cash flow margin', fmt: FMT.pct, better: 'high',
    get: (c) => (isNum(c.facts.ocf) && isNum(c.facts.revenue) && c.facts.revenue > 0
      ? c.facts.ocf / c.facts.revenue : null),
    explain: (c, m) => (isNum(m.value)
      ? `${pct(m.value)} of every sales dollar arrives as operating cash.${vs(c, m, FMT.pct)}`
      : 'Revenue or operating cash flow is missing.'),
  },
  sloanAccruals: {
    label: 'Sloan accruals', fmt: FMT.pct, better: 'low',
    get: (c) => {
      const assets = avgBalance(c, 'totalAssets');
      return isNum(c.facts.netIncome) && isNum(c.facts.ocf) && isNum(assets) && assets > 0
        ? (c.facts.netIncome - c.facts.ocf) / assets : null;
    },
    explain: (c, m) => (isNum(m.value)
      ? `Reported profit runs ${pct(Math.abs(m.value))} of assets ${m.value > 0 ? 'ahead of' : 'behind'} the cash `
        + `behind it. ${m.value > 0 ? 'The gap is accrual, and large accruals tend to reverse.'
          : 'Negative is the good side: the earnings are cash-backed.'}${vs(c, m, FMT.pct)}`
      : 'Net income, operating cash flow or total assets is missing.'),
  },
  netIncomePerEmployee: {
    label: 'Net income / employee', fmt: FMT.money, better: 'high',
    get: (c) => (isNum(c.facts.netIncome) && isNum(c.facts.employees) && c.facts.employees > 0
      ? c.facts.netIncome / c.facts.employees : null),
    explain: (c, m) => (isNum(m.value)
      ? `Each of the ${trim(c.facts.employees, 0)} full-time staff carries ${money(m.value)} of annual profit.${vs(c, m, FMT.money)}`
      : 'No employee count is published for this company.'),
  },
  marginStability5y: {
    label: 'Margin stability (5Y)', fmt: FMT.ppt, better: 'low',
    get: (c) => {
      const rows = c.facts.statements.income.slice(-5)
        .filter((r) => isNum(r.netIncome) && isNum(r.revenue) && r.revenue > 0);
      return rows.length >= 3 ? stdev(rows.map((r) => r.netIncome / r.revenue)) : null;
    },
    explain: (c, m) => (isNum(m.value)
      ? `Net margin has varied by ${dec(m.value * 100, 1)} points a year around its own average. `
        + `Lower is steadier.${vs(c, m, FMT.ppt)}`
      : 'Fewer than three years of margin history.'),
  },
  revenueVariability5y: {
    label: 'Revenue variability (5Y)', fmt: FMT.ppt, better: 'low',
    get: (c) => {
      const rows = c.facts.statements.income.slice(-6).filter((r) => isNum(r.revenue));
      const steps = [];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i - 1].revenue > 0) steps.push(rows[i].revenue / rows[i - 1].revenue - 1);
      }
      return steps.length >= 3 ? stdev(steps) : null;
    },
    explain: (c, m) => (isNum(m.value)
      ? `Annual revenue growth has swung by ${dec(m.value * 100, 1)} points around its own average — `
        + `a read on how predictable the top line is.${vs(c, m, FMT.ppt)}`
      : 'Fewer than three years of revenue growth to measure.'),
  },

  /* ----------------------------------------------- spec: momentum additions */

  return9m: {
    label: '9-month return', fmt: FMT.sign, better: 'high',
    get: (c) => c.momentum.r9m,
    explain: (c, m) => (isNum(m.value)
      ? `Over nine months the shares returned ${pct(m.value, { sign: true })}.${vs(c, m, FMT.sign)}`
      : 'Not enough price history to cover nine months.'),
  },

  /* --------------------------------------- spec: financial health additions */

  ocfToDebt: {
    label: 'Operating cash flow / debt', fmt: FMT.pct, better: 'high',
    get: (c) => (isNum(c.facts.ocf) && isNum(c.facts.totalDebt) && c.facts.totalDebt > 0
      ? c.facts.ocf / c.facts.totalDebt : null),
    explain: (c, m) => (isNum(m.value)
      ? `A year of operating cash covers ${pct(m.value)} of what the company owes.${vs(c, m, FMT.pct)}`
      : 'The company carries no debt, so the ratio has no denominator.'),
  },
  fcfToDebt: {
    label: 'Free cash flow / debt', fmt: FMT.pct, better: 'high',
    get: (c) => (isNum(c.facts.fcf) && isNum(c.facts.totalDebt) && c.facts.totalDebt > 0
      ? c.facts.fcf / c.facts.totalDebt : null),
    explain: (c, m) => (isNum(m.value)
      ? `After paying for its own upkeep, one year's spare cash covers ${pct(m.value)} of the debt.${vs(c, m, FMT.pct)}`
      : 'The company carries no debt, so the ratio has no denominator.'),
  },
  cashToDebt: {
    label: 'Cash / debt', fmt: FMT.pct, better: 'high',
    get: (c) => (isNum(c.facts.cash) && isNum(c.facts.totalDebt) && c.facts.totalDebt > 0
      ? c.facts.cash / c.facts.totalDebt : null),
    explain: (c, m) => (isNum(m.value)
      ? `Cash on hand would retire ${pct(m.value)} of the debt today.${vs(c, m, FMT.pct)}`
      : 'The company carries no debt, so the ratio has no denominator.'),
  },
  debtToEbitda: {
    label: 'Debt / EBITDA', fmt: FMT.x2, better: 'low',
    get: (c) => {
      const ebitda = isNum(c.facts.revenue) && isNum(c.facts.ebitdaMargin)
        ? c.facts.revenue * c.facts.ebitdaMargin : null;
      return isNum(c.facts.totalDebt) && isNum(ebitda) && ebitda > 0 ? c.facts.totalDebt / ebitda : null;
    },
    explain: (c, m) => (isNum(m.value)
      ? `Gross debt is ${dec(m.value, 2)}x a year of EBITDA — the same test as net debt, before the `
        + `cash pile is allowed to help.${vs(c, m, FMT.x2)}`
      : 'EBITDA is not positive, so the multiple is not meaningful.'),
  },
  netDebtToEquity: {
    label: 'Net debt / equity', fmt: FMT.x2, better: 'low',
    get: (c) => (isNum(c.facts.netDebt) && isNum(c.facts.equity) && c.facts.equity > 0
      ? c.facts.netDebt / c.facts.equity : null),
    explain: (c, m) => (isNum(m.value)
      ? (m.value < 0
        ? `Cash exceeds debt: net cash of ${dec(Math.abs(m.value), 2)}x the equity base.${vs(c, m, FMT.x2)}`
        : `Borrowings net of cash come to ${dec(m.value, 2)}x the equity base.${vs(c, m, FMT.x2)}`)
      : 'Equity is negative or missing.'),
  },
  debtToCapital: {
    label: 'Debt / capital', fmt: FMT.pct, better: 'low',
    get: (c) => c.facts.debtToCapital,
    explain: (c, m) => (isNum(m.value)
      ? `${pct(m.value)} of the capital funding this business is borrowed rather than owned.${vs(c, m, FMT.pct)}`
      : 'No capital structure figure is available.'),
  },
  equityToAssets: {
    label: 'Equity / assets', fmt: FMT.pct, better: 'high',
    get: (c) => (isNum(c.facts.equity) && isNum(c.facts.totalAssets) && c.facts.totalAssets > 0
      ? c.facts.equity / c.facts.totalAssets : null),
    explain: (c, m) => (isNum(m.value)
      ? `Shareholders own ${pct(m.value)} of the balance sheet outright; the rest is other people's money.${vs(c, m, FMT.pct)}`
      : 'Equity or total assets is missing.'),
  },
  workingCapitalToAssets: {
    label: 'Working capital / assets', fmt: FMT.pct, better: 'high',
    get: (c) => (isNum(c.facts.workingCapital) && isNum(c.facts.totalAssets) && c.facts.totalAssets > 0
      ? c.facts.workingCapital / c.facts.totalAssets : null),
    explain: (c, m) => (isNum(m.value)
      ? `Short-term assets exceed short-term bills by ${pct(Math.abs(m.value))} of the balance sheet`
        + `${m.value < 0 ? ' — negative here, so the excess runs the other way' : ''}.${vs(c, m, FMT.pct)}`
      : 'Current assets or liabilities are missing.'),
  },

  /** Mean annual revenue growth across the named peers, or null. */
  revenueGrowthVsPeers: {
    label: 'Revenue growth vs peers', fmt: FMT.ppt, better: 'high',
    // Outside MAZ_MASTER_SPEC, so shown and ticked but never scored.
    ungraded: true,
    tick: { at: 0, pass: 'Growing faster than the peer average', fail: 'Growing slower than the peer average' },
    get: (c) => {
      const avg = peerRevenueGrowth(c);
      // Points, not a proportion. Growing at 6% against a peer set at 10% is
      // four points behind; calling it "40% slower" would make a low base
      // sound like a collapse and a negative peer average sound like a win.
      return isNum(c.growth.revenueYoy) && isNum(avg) ? c.growth.revenueYoy - avg : null;
    },
    explain: (c, m) => {
      const avg = peerRevenueGrowth(c);
      const n = peerGrowthSample(c).length;
      if (!isNum(m.value)) return 'No peer revenue growth was available to compare against.';
      return `${SYM(c)} grew ${pct(c.growth.revenueYoy)} against the ${pct(avg)} average of ${n} named `
        + `peers — ${dec(Math.abs(m.value) * 100, 1)} points ${m.value >= 0 ? 'ahead' : 'behind'}.`;
    },
  },
  revenueGrowthVsSector: {
    label: 'Revenue growth vs sector', fmt: FMT.ppt, better: 'high',
    ungraded: true,
    tick: { at: 0, pass: 'Growing faster than the sector median', fail: 'Growing slower than the sector median' },
    get: (c) => {
      const med = c.lookup?.medianFor('revenueGrowthYoy');
      return isNum(c.growth.revenueYoy) && isNum(med) ? c.growth.revenueYoy - med : null;
    },
    explain: (c, m) => {
      const med = c.lookup?.medianFor('revenueGrowthYoy');
      if (!isNum(m.value)) return 'No sector revenue growth figure was available to compare against.';
      return `The median ${c.facts.sector || 'listed'} company grew ${pct(med)}; ${SYM(c)} grew `
        + `${pct(c.growth.revenueYoy)}, ${dec(Math.abs(m.value) * 100, 1)} points `
        + `${m.value >= 0 ? 'ahead' : 'behind'}. The whole sector, not the handful of names beside it.`;
    },
  },
};

/* ==========================================================================
   The tree
   ========================================================================== */

export const FACTORS = [
  {
    key: 'valuation', title: 'Valuation', anchor: 'valuation',
    question: 'Is {SYM} cheap for what you actually get?',
    groups: [
      {
        key: 'cashflows', title: 'What the Cash Flows Are Worth',
        desc: 'Valuing the business from what it earns, before asking what anyone will pay for it.',
        metrics: ['dcfDiscount', 'earningsYieldTtm', 'fcfYieldTtm'],
      },
      {
        // Display only. `metrics: []` keeps it out of every average — the
        // consensus target is already graded once under Momentum, and counting
        // the same figure twice would quietly move two factor scores.
        key: 'analystForecast', title: 'Analyst Price Forecast',
        desc: 'Where the analysts covering the stock think the price goes over the next twelve months.',
        metrics: [],
        panel: 'analystForecast',
      },
      {
        key: 'enterprise', title: 'What You Pay for the Whole Business',
        desc: 'Enterprise value counts the debt an acquirer would inherit and nets off the cash they would inherit with it.',
        metrics: ['evToSalesTtm', 'evToSalesFwd', 'evToEbitdaTtm', 'evToEbitdaFwd', 'evToEbitTtm', 'evToEbitFwd'],
      },
      {
        key: 'share', title: 'What You Pay for a Single Share',
        desc: 'The multiples quoted on the screen, trailing and forward.',
        metrics: ['peNonGaapTtm', 'peGaapTtm', 'peNonGaapFwd', 'pegGaap', 'pegNonGaap', 'priceToSalesTtm',
                  'priceToSalesFwd', 'priceToBookTtm', 'priceToCashFlowTtm'],
      },
      {
        key: 'compare', title: 'How the Price Compares',
        desc: 'The same multiple set against its peers, its sector and its own past.',
        metrics: ['peVsPeers', 'peVsSector', 'peVsHistory'],
      },
      {
        key: 'yields', title: 'What Comes Back to You',
        desc: 'The share of the market value returned each year without selling anything.',
        metrics: ['dividendYieldTtm', 'buybackYield', 'shareholderYield'],
      },
    ],
  },

  {
    key: 'growth', title: 'Growth', anchor: 'growth',
    question: 'Is {SYM} getting bigger, and does that reach the bottom line?',
    groups: [
      {
        key: 'topline', title: 'Is the Top Line Still Moving',
        desc: 'Revenue over one year, three and five — long enough to tell a trend from a good quarter.',
        metrics: ['revenueGrowthYoy', 'revenueGrowth3y', 'revenueGrowth5y',
                  'revenueGrowthVsPeers', 'revenueGrowthVsSector'],
      },
      {
        key: 'bottomline', title: 'Does It Reach the Bottom Line',
        desc: 'Growth that never becomes profit is just a bigger version of the same business.',
        metrics: ['ebitdaGrowth', 'ebitGrowth', 'epsGrowth', 'epsDilutedGrowth', 'netIncomeGrowth5y',
                  'roeGrowth'],
      },
      {
        key: 'cash', title: 'Is the Growth Turning into Cash',
        desc: 'Profit is an opinion until the cash arrives.',
        metrics: ['ocfGrowth', 'fcfGrowth'],
      },
      {
        key: 'reinvestment', title: 'What It Costs to Keep Growing',
        desc: 'What has to be spent today to hold the growth in place tomorrow.',
        metrics: ['capexGrowth', 'rdExpenseGrowth', 'bookValueGrowth', 'workingCapitalGrowth'],
      },
      {
        key: 'forecast', title: 'What the Street Expects Next',
        desc: 'Analyst consensus over the forecast window, and the return on equity it implies.',
        metrics: ['fwdRevenueGrowth', 'fwdEbitdaGrowth', 'fwdEbitGrowth', 'fwdEarningsGrowth',
                  'fwdEpsGrowth', 'epsLongTermCagr', 'fwdRoe', 'fwdRoeGrowth'],
      },
      {
        key: 'shareholders', title: 'What Reaches Shareholders',
        desc: 'Growth in the part of the return that arrives as cash.',
        metrics: ['dpsGrowth', 'dividendGrowth3y'],
      },
    ],
  },

  {
    key: 'profitability', title: 'Profitability', anchor: 'profitability',
    question: 'Does {SYM} turn revenue into money, and keep it?',
    groups: [
      {
        // Display only. `metrics: []` keeps it out of every average, the same
        // device the analyst forecast panel uses: a Sankey is a description of
        // the statement, not a judgement on it.
        key: 'flow', title: 'Where the Revenue Goes',
        desc: 'Every dollar of sales, from the top line to what is left after the bills.',
        metrics: [],
        panel: 'revenueFlow',
      },
      {
        key: 'margins', title: 'Margins, Down the Income Statement',
        desc: 'Following one sales dollar from the top line to what is left at the bottom.',
        metrics: ['grossMargin', 'ebitdaMargin', 'ebitMargin', 'netMargin', 'ocfMargin'],
      },
      {
        key: 'returns', title: 'What the Capital Actually Earns',
        desc: 'Margins say a sale is profitable; these say the capital behind it was worth committing.',
        metrics: ['returnOnEquity', 'returnOnInvestedCapital', 'returnOnAssets',
                  'returnOnTangibleAssets', 'returnOnCapitalEmployed'],
      },
      {
        key: 'efficiency', title: 'How Hard the Assets Work',
        desc: 'How much revenue the balance sheet produces, and what it costs to keep it producing.',
        metrics: ['assetTurnover', 'fixedAssetTurnover', 'capexToRevenue', 'cashPerShare',
                  'netIncomePerEmployee'],
      },
      {
        key: 'quality', title: 'Is the Profit Real',
        desc: 'Whether the reported number is backed by cash, and what it quietly costs shareholders.',
        metrics: ['cashFromOperations', 'incomeQuality', 'fcfToOcf', 'sloanAccruals',
                  'sbcToRevenue', 'effectiveTaxRate', 'marginStability5y', 'revenueVariability5y'],
      },
    ],
  },

  {
    key: 'health', title: 'Financial Health', anchor: 'financial-health',
    question: 'Could {SYM} survive a bad year?',
    groups: [
      {
        // Display only, as above.
        key: 'sheet', title: 'What the Balance Sheet Holds',
        desc: 'What the company owns on the left, and whose money paid for it on the right.',
        metrics: [],
        panel: 'balanceFlow',
      },
      {
        key: 'liquidity', title: 'Can It Pay the Next Bill',
        desc: 'What is due within the year, and what is on hand to meet it.',
        metrics: ['currentRatio', 'quickRatio', 'cashRatio'],
      },
      {
        key: 'leverage', title: 'How Much Is Borrowed',
        desc: 'Debt magnifies a good year and a bad one alike.',
        metrics: ['debtToEquity', 'netDebtToEquity', 'financialLeverage', 'debtToEbitda',
                  'netDebtToEbitda', 'debtToAssets', 'longTermDebtToCapital', 'debtToCapital'],
      },
      {
        // Display only, like the balance-sheet flow above it.
        key: 'debthistory', title: 'How the Debt Has Moved',
        desc: 'Borrowings against the owners’ stake over the filed years, and whether the trend is down.',
        metrics: [],
        panel: 'debtHistory',
      },
      {
        key: 'coverage', title: 'Can It Carry What It Owes',
        desc: 'Borrowing is only a problem when the earnings behind it stop covering the payments.',
        metrics: ['interestCoverage', 'solvencyRatio', 'debtServiceCoverage',
                  'ocfToDebt', 'fcfToDebt', 'cashToDebt'],
      },
      {
        key: 'distress', title: 'The Distress Screens',
        desc: 'Two published models that compress the whole balance sheet into one number.',
        metrics: ['altmanZScore', 'piotroskiScore'],
      },
      {
        key: 'backing', title: 'What Actually Sits Behind the Share',
        desc: 'The floor under the price, before anyone values the business as a going concern.',
        metrics: ['bookValuePerShare', 'tangibleBookValuePerShare', 'equityToAssets',
                  'workingCapitalToAssets'],
      },
    ],
  },

  {
    key: 'momentum', title: 'Momentum', anchor: 'momentum',
    question: 'What has the market been doing with {SYM}?',
    groups: [
      {
        key: 'travel', title: 'How the Price Has Travelled',
        desc: 'The return over each window, with no view on whether it deserved it.',
        metrics: ['return1m', 'return3m', 'return6m', 'return9m', 'returnYtd', 'return1y'],
      },
      {
        key: 'field', title: 'Versus the Field',
        desc: 'A rising tide lifts everything; this is what is left after the tide.',
        metrics: ['excessReturn1yVsSector', 'excessReturn1yVsMarket'],
      },
      {
        key: 'range', title: 'Where It Sits in Its Range',
        desc: 'Position within the twelve-month range and against the moving averages.',
        metrics: ['offYearHigh', 'aboveYearLow', 'priceToAvg50', 'priceToAvg200'],
      },
      {
        key: 'ride', title: 'How Rough the Ride Is',
        desc: 'The same return is worth less if holding it was unbearable.',
        metrics: ['beta', 'volatility', 'maxDrawdown1y'],
      },
      {
        key: 'street', title: 'What the Street Is Doing',
        desc: 'Where the analysts covering the stock currently stand.',
        metrics: ['targetUpside', 'targetVsCostOfEquity', 'analystScore'],
      },
    ],
  },
];

export const FACTOR_KEYS = FACTORS.map((f) => f.key);

/** Lookup by key, for renderers and nav. */
export const FACTOR_BY_KEY = Object.fromEntries(FACTORS.map((f) => [f.key, f]));

/* ==========================================================================
   The walk
   ========================================================================== */

/**
 * Grade every metric in the tree and roll the scores up.
 *
 * @param {object} c        analysis context (facts, forecast, growth, momentum, …)
 * @param {object} lookup   from grading.js `sectorLookup()`
 * @returns {object} { valuation: {...}, growth: {...}, … , overall }
 */
export function gradeAll(c, lookup) {
  const out = {};

  for (const factor of FACTORS) {
    const groups = factor.groups.map((group) => {
      const metrics = group.metrics.map((id) => gradeOne(c, lookup, id));
      // `ungraded` metrics are dropped before the roll-up rather than counted
      // as missing — they are not absent data, they are deliberately outside
      // the score, and leaving them in would mark every group holding one as
      // less than fully confident.
      const roll = rollUp(metrics.filter((m) => !m.ungraded));
      return { ...group, ...roll, metrics };
    });

    // A factor is the mean of its metric grades, not the mean of its group
    // scores — otherwise a two-ratio subtopic would outweigh an eight-ratio
    // one, and the weighting would be an accident of how the page is laid out.
    const allMetrics = groups.flatMap((g) => g.metrics).filter((m) => !m.ungraded);
    const roll = rollUp(allMetrics);

    out[factor.key] = { key: factor.key, title: factor.title, anchor: factor.anchor, ...roll, groups };
  }

  // The headline score weights the five factors equally. Weighting them by
  // predictive power would need a backtest this repo does not run, so an
  // honest average beats an invented tilt.
  const scored = FACTOR_KEYS.map((k) => out[k].score).filter(isNum);
  const overall = scored.length ? mean(scored) : null;
  out.overall = { score: overall, letter: letterFor(overall), factors: scored.length };
  return out;
}

function gradeOne(c, lookup, id) {
  const def = METRICS[id];
  if (!def) return { id, label: id, state: 'na', grade: null, why: `Unknown metric "${id}".` };

  let value = null;
  try {
    value = def.get(c);
  } catch {
    value = null;                       // a missing feed anywhere upstream
  }
  if (!isNum(value)) value = null;

  const graded = def.absolute
    ? gradeMetric(value, linearDist(def.absolute[0], def.absolute[1]), { better: def.better, source: 'absolute' })
    : lookup.grade(def.dist || id, value, def.better);

  // `better` travels with the graded metric so the view can colour a
  // trailing-to-forward move without re-deriving which direction is good.
  const m = { id, label: def.label, fmt: def.fmt, better: def.better, ungraded: !!def.ungraded, ...graded };

  // An explicit threshold beats the distribution's midpoint wherever the
  // midpoint is not a real quantity — every `absolute` metric has an invented
  // scale whose middle means nothing.
  if (def.tick && isNum(m.value)) {
    const worse = def.better === 'low' ? m.value > def.tick.at : m.value < def.tick.at;
    m.vsMedian = worse ? 'fail' : 'pass';
    m.tickTitle = worse ? def.tick.fail : def.tick.pass;
  }

  // Ungraded metrics report a figure and which side of their threshold it
  // falls, and nothing else. Leaving the grade and percentile on the object
  // would put them back on screen and into every roll-up that counts them.
  if (m.ungraded) {
    m.grade = null;
    m.letter = null;
    m.pctile = null;
    m.rank = null;
  }

  m.explanation = safeExplain(def, c, m);
  return m;
}

function safeExplain(def, c, m) {
  if (m.state !== 'ok' && !isNum(m.value)) return m.why || 'Not available for this company.';
  try {
    return def.explain(c, m) || '';
  } catch {
    return '';
  }
}

export { MAX_SCORE };
