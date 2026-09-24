/* ==========================================================================
   Vanlior — the dividend lines

   The 64 lines of `MAZ_DIVIDEND_SPEC_FULL.md`, as data. Four factors, each a
   weighted set of lines; every line says where its figure comes from, which
   way is good, and what it is worth inside its factor.

   ---------------------------------------------------------------------------
   Weights are the spec's, and they sum to 100 inside each factor
   ---------------------------------------------------------------------------

   `tools/test_dividends.mjs` asserts that, because a weight typed wrong is
   the one error in a file like this that produces a plausible score rather
   than an obvious break.

   ---------------------------------------------------------------------------
   `na` is a line that cannot be built, and it says why
   ---------------------------------------------------------------------------

   A line carrying `na` is never computed: it reports not-meaningful with that
   reason, and its weight is renormalised across the lines that did compute.
   That is the spec's rule — **never impute a zero or a median** — and it is
   why the panel can tell a reader which four lines are missing rather than
   quietly scoring the company on sixty.

   ---------------------------------------------------------------------------
   Three things a reader of this file should not have to re-derive
   ---------------------------------------------------------------------------

   1. **A payout ratio above 100% is valid and must rank badly.** It is never
      clamped and never NM'd. The spec calls it the single most important
      signal in the module, and a clamp at 1.0 would put a company paying
      140% of its cash flow level with one paying exactly all of it.
   2. **The coverage inverses carry almost no weight on purpose.** Each is the
      exact reciprocal of a Tier 1 payout line. Seeking Alpha lists both
      sides; weighting both would count payout coverage twice.
   3. **Operating leverage is "lower is better" here**, which is the opposite
      of how a growth investor reads it. High operating leverage means
      earnings swing hard with revenue, and a dividend paid out of swinging
      earnings is less reliable.
   ========================================================================== */

import { isNum, pct, dec, money, mult, trim } from './util.js';

const FMT = {
  pct:   (v) => pct(v),
  pct2:  (v) => pct(v, { dp: 2 }),
  sign:  (v) => pct(v, { sign: true }),
  x:     (v) => mult(v),
  x2:    (v) => (isNum(v) ? `${dec(v, 2)}x` : 'n/a'),
  num:   (v) => (isNum(v) ? dec(v, 2) : 'n/a'),
  int:   (v) => (isNum(v) ? trim(v, 0) : 'n/a'),
  years: (v) => (isNum(v) ? `${trim(v, 0)} ${v === 1 ? 'year' : 'years'}` : 'n/a'),
  money: (v) => money(v),
};

/** The four factors. Safety counts double, per the spec's composite weights. */
export const DIV_FACTORS = [
  {
    key: 'safety', title: 'Dividend Safety', weight: 2,
    question: 'Can the company keep paying this dividend?',
    blurb: 'Payout coverage out of cash, earnings and the forward estimate, then the '
      + 'balance sheet behind it. Weighted double: a dividend that is not safe makes '
      + 'the other three factors moot.',
  },
  {
    key: 'growth', title: 'Dividend Growth', weight: 1,
    question: 'Has the payment been rising, and can it keep rising?',
    blurb: 'The dividend’s own CAGRs over one, three, five and ten years, then the '
      + 'forward earnings and cash-flow growth that would have to fund the next raise.',
  },
  {
    key: 'yield', title: 'Dividend Yield', weight: 1,
    question: 'How much does it pay for the price?',
    blurb: 'The forward and trailing yields, ranked beside the free-cash-flow and '
      + 'earnings yields — the test of whether the dividend yield is being funded '
      + 'from operations or from somewhere else.',
  },
  {
    key: 'consistency', title: 'Dividend Consistency', weight: 1,
    question: 'How dependable has the record been?',
    blurb: 'Streaks, cuts and the steadiness of both the payment and the payout ratio, '
      + 'built from the payment record with special dividends taken out.',
  },
];

export const DIV_FACTOR_KEYS = DIV_FACTORS.map((f) => f.key);
export const DIV_FACTOR_BY_KEY = Object.fromEntries(DIV_FACTORS.map((f) => [f.key, f]));

/* ==========================================================================
   FACTOR 1 — DIVIDEND SAFETY (2×) — 27 lines
   ========================================================================== */

const SAFETY = [
  /* ---- Tier 1: payout coverage (48%) ----------------------------------- */
  {
    id: 'cashDividendPayoutTtm', label: 'Cash Dividend Payout Ratio (TTM)',
    group: 'Payout coverage', weight: 11, better: 'low', fmt: FMT.pct2,
    desc: 'The dividend against the free cash flow that has to pay for it.',
    get: (x) => x.over(x.dividendsPaidTtm, x.fcfTtm),
  },
  {
    id: 'payoutNonGaapTtm', label: 'Dividend Payout Ratio (TTM) Non-GAAP',
    group: 'Payout coverage', weight: 9, better: 'low', fmt: FMT.pct2,
    desc: 'Trailing dividend per share against the four reported quarters of earnings.',
    get: (x) => x.over(x.dpsTtm, x.epsNonGaapTtm),
  },
  {
    id: 'payoutNonGaapFy1', label: 'Dividend Payout Ratio (FY1) Non-GAAP',
    group: 'Payout coverage', weight: 9, better: 'low', fmt: FMT.pct2, workaround: 'A',
    desc: 'The indicated forward rate against next year’s consensus earnings.',
    get: (x) => x.over(x.dpsFwd, x.fy1?.epsAvg),
  },
  {
    id: 'cashFlowPayoutTtm', label: 'Cash Flow Payout Ratio (TTM)',
    group: 'Payout coverage', weight: 8, better: 'low', fmt: FMT.pct2,
    desc: 'The dividend against operating cash flow, before capital spending.',
    get: (x) => x.over(x.dividendsPaidTtm, x.ocfTtm),
  },
  {
    id: 'cashFlowPayoutFy1', label: 'Cash Flow Payout Ratio (FY1)',
    group: 'Payout coverage', weight: 7, better: 'low', fmt: FMT.pct2, workaround: 'B',
    desc: 'The forward dividend bill against forward operating cash flow.',
    get: (x) => x.over(isNum(x.dpsFwd) && isNum(x.shares) ? x.dpsFwd * x.shares : null, x.ocfFy1),
  },
  {
    id: 'payoutGaapTtm', label: 'Dividend Payout Ratio (TTM) GAAP',
    group: 'Payout coverage', weight: 4, better: 'low', fmt: FMT.pct2,
    desc: 'The same question against filed net income rather than adjusted earnings.',
    get: (x) => x.over(x.dividendsPaidTtm, x.niTtm),
  },

  /* ---- Tier 2: coverage inverses (6%) ----------------------------------- */
  {
    id: 'coverageFy1', label: 'Dividend Coverage Ratio (FY1)',
    group: 'Coverage', weight: 3, better: 'high', fmt: FMT.x2, workaround: 'A',
    desc: 'Forward earnings over the forward dividend — the reciprocal of the payout ratio above.',
    get: (x) => x.over(x.fy1?.epsAvg, x.dpsFwd),
  },
  {
    id: 'coverageTtm', label: 'Dividend Coverage Ratio (TTM)',
    group: 'Coverage', weight: 2, better: 'high', fmt: FMT.x2,
    desc: 'Trailing net income over the trailing dividend bill.',
    get: (x) => x.over(x.niTtm, x.dividendsPaidTtm),
  },
  {
    id: 'fcfToDividends', label: 'FCF Yield to Dividend Yield Ratio (TTM)',
    group: 'Coverage', weight: 1, better: 'high', fmt: FMT.x2,
    desc: 'How many times over free cash flow covers the payment.',
    get: (x) => x.over(x.fcfTtm, x.dividendsPaidTtm),
  },

  /* ---- Tier 3: leverage (20%) ------------------------------------------- */
  {
    id: 'netDebtToEbitda', label: 'Net Debt / EBITDA (TTM)',
    group: 'Leverage', weight: 6, better: 'low', fmt: FMT.x2, approximate: true,
    desc: 'Borrowings net of cash against a year of EBITDA. Net cash is negative and ranks best.',
    note: 'The spec nets long-term investments too; the balance-sheet feed this report loads '
      + 'carries cash and short-term investments only, so this is net debt on the narrower definition.',
    get: (x) => {
      const nd = isNum(x.netDebt) ? x.netDebt
        : (isNum(x.totalDebt) && isNum(x.cashAndInvestments) ? x.totalDebt - x.cashAndInvestments : null);
      // EBITDA at or below zero has no meaning as a denominator here.
      return isNum(nd) && isNum(x.ebitdaTtm) && x.ebitdaTtm > 0 ? nd / x.ebitdaTtm : null;
    },
  },
  {
    id: 'debtToCapital', label: 'Total Debt / Capital (TTM)',
    group: 'Leverage', weight: 5, better: 'low', fmt: FMT.pct2,
    desc: 'Borrowings as a share of all the capital funding the business.',
    get: (x) => x.ratios.debtToCapitalRatioTTM ?? null,
  },
  {
    id: 'debtToEquity', label: 'Total Debt / Equity (TTM)',
    group: 'Leverage', weight: 4, better: 'low', fmt: FMT.x2,
    desc: 'Borrowings against the shareholders’ own stake.',
    get: (x) => x.ratios.debtToEquityRatioTTM ?? null,
  },
  {
    id: 'netDebtToAssets', label: 'Net Debt / Assets (TTM)',
    group: 'Leverage', weight: 3, better: 'low', fmt: FMT.pct2,
    desc: 'The same borrowings against everything the company owns.',
    get: (x) => {
      const nd = isNum(x.netDebt) ? x.netDebt
        : (isNum(x.totalDebt) && isNum(x.cashAndInvestments) ? x.totalDebt - x.cashAndInvestments : null);
      return isNum(nd) && isNum(x.totalAssets) && x.totalAssets > 0 ? nd / x.totalAssets : null;
    },
  },
  {
    id: 'interestCoverage', label: 'Interest Coverage (TTM)',
    group: 'Leverage', weight: 2, better: 'high', fmt: FMT.x2,
    desc: 'Operating profit over the interest bill. A company with no debt prints no ratio.',
    get: (x) => {
      const v = x.ratios.interestCoverageRatioTTM;
      if (!isNum(v) || !Number.isFinite(v)) return null;
      /* Exactly zero is the vendor's empty cell, not a company earning nothing
         against its interest: it is what a net interest bill of zero reports,
         and the spec says Apple prints a dash here for that reason. Scoring it
         as an F would put a debt-free company at the bottom of the leverage
         tier. A *negative* ratio is real — losses against a real interest
         bill — and is kept, because it should rank badly. */
      return v === 0 ? null : v;
    },
  },

  /* ---- Tier 4: earnings and cash quality (18%) --------------------------- */
  {
    id: 'cashFromOperations', label: 'Cash From Operations (TTM)',
    group: 'Earnings quality', weight: 6, better: 'high', fmt: FMT.money,
    desc: 'The absolute size of the cash the business throws off in a year.',
    get: (x) => x.ocfTtm,
  },
  {
    id: 'netIncomeMargin', label: 'Net Income Margin (TTM)',
    group: 'Earnings quality', weight: 4, better: 'high', fmt: FMT.pct2,
    desc: 'What is left of each pound of revenue after everything.',
    get: (x) => x.ratios.netProfitMarginTTM ?? null,
  },
  {
    id: 'returnOnEquity', label: 'Return on Common Equity (TTM)',
    group: 'Earnings quality', weight: 4, better: 'high', fmt: FMT.pct2,
    desc: 'What the business earns on the shareholders’ capital.',
    get: (x) => x.metrics.returnOnEquityTTM ?? null,
  },
  {
    id: 'cashPerShare', label: 'Cash Per Share (TTM)',
    group: 'Earnings quality', weight: 2, better: 'high', fmt: FMT.num,
    desc: 'Cash and short-term investments behind each share.',
    get: (x) => x.ratios.cashPerShareTTM ?? null,
  },
  {
    id: 'fixedAssetTurnover', label: 'Fixed Asset Turnover (TTM)',
    group: 'Earnings quality', weight: 1, better: 'high', fmt: FMT.x2,
    desc: 'Revenue produced per pound of plant and equipment.',
    get: (x) => x.ratios.fixedAssetTurnoverTTM ?? null,
  },
  {
    id: 'sustainableGrowth', label: 'Sustainable Growth Rate (TTM)',
    group: 'Earnings quality', weight: 1, better: 'high', fmt: FMT.pct2, approximate: true,
    desc: 'Return on equity times the share of earnings retained — growth the company can fund itself.',
    note: 'The standard textbook definition. Seeking Alpha prints a much smaller number from some other '
      + 'normalisation, so this line is ranked internally and is not calibrated against theirs.',
    get: (x) => {
      const roe = x.metrics.returnOnEquityTTM;
      const payout = x.over(x.dividendsPaidTtm, x.niTtm);
      return isNum(roe) && isNum(payout) ? roe * (1 - payout) : null;
    },
  },

  /* ---- Tier 5: market and signal (8%) ------------------------------------ */
  {
    id: 'dividendGrowth1yCagrSafety', label: 'Dividend Growth Rate 1-YR CAGR',
    group: 'Market signal', weight: 3, better: 'high', fmt: FMT.sign,
    desc: 'The trailing year of payments against the year before it.',
    get: (x) => x.over(x.dpsTtm, x.dpsPriorTtm) != null ? x.dpsTtm / x.dpsPriorTtm - 1 : null,
  },
  {
    id: 'dpsRevisionsDown', label: '% of Total Downward DPS Revisions (FY1)',
    group: 'Market signal', weight: 2, better: 'low',
    na: 'No dividend-estimate revision feed exists in this data source. The spec notes this becomes '
      + 'buildable once a weekly snapshot ledger of declared rates has run for a quarter.',
  },
  {
    id: 'capmAlpha60m', label: '60-Month CAPM Alpha',
    group: 'Market signal', weight: 1, better: 'high',
    na: 'Needs sixty months of prices against the market; the report fetches a single year of price '
      + 'history, so the regression cannot be run here.',
  },
  {
    id: 'activeInstitutional', label: '% Owned by Active Institutional Managers',
    group: 'Market signal', weight: 1, better: 'high',
    na: 'Needs the full 13F holdings list with the passive complexes classified out by CIK. The report '
      + 'loads the top twenty holders only, which cannot be split into active and passive.',
  },
  {
    id: 'logPriceSafety', label: 'Log of Unadjusted Stock Price',
    group: 'Market signal', weight: 0.5, better: 'high', fmt: FMT.num,
    desc: 'A penny-stock control — low-priced shares carry higher dividend risk.',
    get: (x) => (isNum(x.price) && x.price > 0 ? Math.log(x.price) : null),
  },
  {
    id: 'yieldToPayout', label: 'Dividend Yield to Dividend Payout Ratio (TTM)',
    group: 'Market signal', weight: 0.5, better: 'high', fmt: FMT.pct2,
    desc: 'Yield divided by payout ratio, which is identically the GAAP earnings yield.',
    get: (x) => {
      const y = x.ratios.dividendYieldTTM;
      const payout = x.over(x.dividendsPaidTtm, x.niTtm);
      return isNum(y) && isNum(payout) && payout > 0 ? y / payout : null;
    },
  },
  {
    id: 'pensionFunded', label: 'Funded Status of Pension',
    group: 'Market signal', weight: 0, better: 'high',
    na: 'A 10-K footnote parse with near-zero coverage. The spec weights it zero and skips it, and so '
      + 'does this build.',
  },
];

/* ==========================================================================
   FACTOR 2 — DIVIDEND GROWTH (1×) — 15 lines
   ========================================================================== */

const GROWTH = [
  {
    id: 'dividendGrowth5y', label: 'Dividend Growth Rate 5Y (CAGR)',
    group: 'The dividend’s own record', weight: 16, better: 'high', fmt: FMT.sign,
    desc: 'Compound annual growth in the annual payment over five full years.',
    get: (x) => x.cagr(x.dpsYearsAgo(5), x.dpsYearsAgo(0), 5),
  },
  {
    id: 'dividendGrowth3y', label: 'Dividend Growth Rate 3Y (CAGR)',
    group: 'The dividend’s own record', weight: 14, better: 'high', fmt: FMT.sign,
    desc: 'The same over three full years.',
    get: (x) => x.cagr(x.dpsYearsAgo(3), x.dpsYearsAgo(0), 3),
  },
  {
    id: 'dividendGrowth1yTtm', label: '1 Year Dividend Growth Rate (TTM)',
    group: 'The dividend’s own record', weight: 13, better: 'high', fmt: FMT.sign,
    desc: 'The trailing twelve months of payments against the twelve before them.',
    get: (x) => (isNum(x.dpsTtm) && isNum(x.dpsPriorTtm) && x.dpsPriorTtm > 0
      ? x.dpsTtm / x.dpsPriorTtm - 1 : null),
  },
  {
    id: 'dpsGrowthFwd', label: 'Dividend Per Share Growth (FWD)',
    group: 'The dividend’s own record', weight: 12, better: 'high', fmt: FMT.sign, workaround: 'A',
    desc: 'The indicated forward rate against the trailing twelve months.',
    get: (x) => (isNum(x.dpsFwd) && isNum(x.dpsTtm) && x.dpsTtm > 0 ? x.dpsFwd / x.dpsTtm - 1 : null),
  },
  {
    id: 'dpsGrowthFy1Fy3', label: 'DPS Growth FY1–FY3 (CAGR)',
    group: 'The dividend’s own record', weight: 9, better: 'high',
    na: 'Needs a multi-year dividend forecast. The indicated forward rate gives one point, not a curve, '
      + 'and no dividend estimate series exists in this data source.',
  },
  {
    id: 'dividendGrowth10y', label: 'Dividend Growth Rate 10Y (CAGR)',
    group: 'The dividend’s own record', weight: 8, better: 'high', fmt: FMT.sign,
    desc: 'Compound annual growth over ten full years.',
    get: (x) => x.cagr(x.dpsYearsAgo(10), x.dpsYearsAgo(0), 10),
  },
  {
    id: 'epsDilutedGrowthFwd', label: 'EPS Diluted Growth (FWD)',
    group: 'What would fund the next raise', weight: 8, better: 'high', fmt: FMT.sign,
    desc: 'Consensus earnings two years out against the last filed year.',
    get: (x) => x.cagr(x.fy.income.epsDiluted, x.fy3?.epsAvg, 3),
  },
  {
    id: 'fcfPerShareGrowthFwd', label: 'FCF Per Share Growth Rate (FWD)',
    group: 'What would fund the next raise', weight: 6, better: 'high', fmt: FMT.sign, workaround: 'B',
    desc: 'Forward free cash flow per share against the trailing figure.',
    get: (x) => {
      if (!isNum(x.fcfFy1) || !isNum(x.fcfTtm) || !isNum(x.shares) || x.shares <= 0) return null;
      const now = x.fcfTtm / x.shares;
      if (!(now > 0)) return null;
      return (x.fcfFy1 / x.shares) / now - 1;
    },
  },
  {
    id: 'ebitdaGrowthFwd', label: 'EBITDA Growth (FWD)',
    group: 'What would fund the next raise', weight: 4, better: 'high', fmt: FMT.sign,
    desc: 'Consensus EBITDA two years out against the last filed year.',
    get: (x) => x.cagr(x.fy.income.ebitda, x.fy3?.ebitdaAvg, 3),
  },
  {
    id: 'ebitGrowthFwd', label: 'EBIT Growth (FWD)',
    group: 'What would fund the next raise', weight: 4, better: 'high', fmt: FMT.sign,
    desc: 'Consensus operating profit two years out against the last filed year.',
    get: (x) => x.cagr(x.fy.income.ebit ?? x.fy.income.operatingIncome, x.fy3?.ebitAvg, 3),
  },
  {
    id: 'revenueGrowthFwd', label: 'Revenue Growth (FWD)',
    group: 'What would fund the next raise', weight: 3, better: 'high', fmt: FMT.sign,
    desc: 'Consensus revenue two years out against the last filed year.',
    get: (x) => x.cagr(x.fy.income.revenue, x.fy3?.revenueAvg, 3),
  },
  {
    id: 'returnOnNetTangibleAssets', label: 'Return on Net Tangible Assets (TTM)',
    group: 'What would fund the next raise', weight: 1, better: 'high',
    na: 'Needs goodwill and intangibles separated out of the balance sheet; the feed this report loads '
      + 'carries neither line.',
  },
  {
    id: 'degreeOperatingLeverage', label: 'Degree of Operating Leverage (TTM)',
    group: 'What would fund the next raise', weight: 1, better: 'low', fmt: FMT.x2,
    desc: 'How hard operating profit swings for a given move in revenue. Lower is the dividend-friendly reading.',
    get: (x) => {
      const { ebitTtm, ebitPriorTtm, revenueTtm, revenuePriorTtm } = x;
      if (![ebitTtm, ebitPriorTtm, revenueTtm, revenuePriorTtm].every(isNum)) return null;
      if (!(ebitPriorTtm > 0) || !(revenuePriorTtm > 0)) return null;
      const dRev = revenueTtm / revenuePriorTtm - 1;
      if (Math.abs(dRev) < 0.001) return null;      // a flat top line gives no reading
      return (ebitTtm / ebitPriorTtm - 1) / dRev;
    },
  },
  {
    id: 'coefficientOfVariation90d', label: '90-Day Coefficient of Variation',
    group: 'What would fund the next raise', weight: 0.5, better: 'low', fmt: FMT.pct2,
    desc: 'How much the share price has wandered relative to its own average over the quarter.',
    get: (x) => {
      if (x.last90.length < 30) return null;
      const m = x.mean(x.last90);
      return isNum(m) && m > 0 ? x.stdev(x.last90) / m : null;
    },
  },
  {
    id: 'logPriceGrowth', label: 'Log of Unadjusted Stock Price',
    group: 'What would fund the next raise', weight: 0.5, better: 'high', fmt: FMT.num,
    desc: 'The same penny-stock control the safety factor carries.',
    get: (x) => (isNum(x.price) && x.price > 0 ? Math.log(x.price) : null),
  },
];

/* ==========================================================================
   FACTOR 3 — DIVIDEND YIELD (1×) — 12 lines
   ========================================================================== */

const YIELD = [
  {
    id: 'dividendYieldFwd', label: 'Dividend Yield (FWD)',
    group: 'What it pays', weight: 22, better: 'high', fmt: FMT.pct2, workaround: 'A',
    desc: 'The indicated forward rate against today’s price.',
    get: (x) => x.over(x.dpsFwd, x.price),
  },
  {
    id: 'dividendYieldTtm', label: 'Dividend Yield (TTM)',
    group: 'What it pays', weight: 18, better: 'high', fmt: FMT.pct2,
    desc: 'The last twelve months of payments against today’s price.',
    get: (x) => x.ratios.dividendYieldTTM ?? x.over(x.dpsTtm, x.price),
  },
  {
    id: 'avgYield4y', label: '4 Year Average Dividend Yield',
    group: 'What it pays', weight: 12, better: 'high', fmt: FMT.pct2, approximate: true,
    desc: 'The mean of the last four annual yields — what the shares have usually paid.',
    note: 'Each year’s yield is that year’s dividends paid over that year’s market '
      + 'capitalisation, because the report holds one year of daily prices rather than four.',
    get: (x) => {
      const ys = x.yieldByYear.slice(0, 4).map((r) => r.y);
      return ys.length >= 3 ? x.mean(ys) : null;
    },
  },
  {
    id: 'fcfYieldTtm', label: 'Free Cash Flow Yield (TTM)',
    group: 'Is the yield real?', weight: 10, better: 'high', fmt: FMT.pct2,
    desc: 'Free cash flow against the market value. Negative is valid and ranks last.',
    get: (x) => x.metrics.freeCashFlowYieldTTM ?? x.over(x.fcfTtm, x.marketCap),
  },
  {
    id: 'fcfYieldFy1', label: 'Free Cash Flow Yield (FY1)',
    group: 'Is the yield real?', weight: 8, better: 'high', fmt: FMT.pct2, workaround: 'B',
    desc: 'The same on next year’s modelled free cash flow.',
    get: (x) => x.over(x.fcfFy1, x.marketCap),
  },
  {
    id: 'earningsYieldNonGaapTtm', label: 'Earnings Yield Non-GAAP (TTM)',
    group: 'Is the yield real?', weight: 7, better: 'high', fmt: FMT.pct2,
    desc: 'The four reported quarters of earnings against the price.',
    get: (x) => (isNum(x.epsNonGaapTtm) && x.epsNonGaapTtm > 0 ? x.over(x.epsNonGaapTtm, x.price) : null),
  },
  {
    id: 'earningsYieldNonGaapFwd', label: 'Earnings Yield Non-GAAP (FWD)',
    group: 'Is the yield real?', weight: 6, better: 'high', fmt: FMT.pct2,
    desc: 'Next year’s consensus earnings against the price.',
    get: (x) => (isNum(x.fy1?.epsAvg) && x.fy1.epsAvg > 0 ? x.over(x.fy1.epsAvg, x.price) : null),
  },
  {
    id: 'yieldOnCost5y', label: '5 Year Yield on Cost',
    group: 'What it would have paid', weight: 5, better: 'high', fmt: FMT.pct2, approximate: true,
    desc: 'Today’s forward rate against what the shares cost five years ago.',
    note: 'The historical price is that fiscal year’s market capitalisation over its share count, '
      + 'because the report holds one year of daily prices.',
    get: (x) => x.over(x.dpsFwd, x.priceYearsAgo(5)),
  },
  {
    id: 'yieldOnCost3y', label: '3 Year Yield on Cost',
    group: 'What it would have paid', weight: 4, better: 'high', fmt: FMT.pct2, approximate: true,
    desc: 'The same against the price three years ago.',
    get: (x) => x.over(x.dpsFwd, x.priceYearsAgo(3)),
  },
  {
    id: 'yieldOnCost1y', label: '1 Year Yield on Cost',
    group: 'What it would have paid', weight: 3, better: 'high', fmt: FMT.pct2, approximate: true,
    desc: 'And against the price a year ago.',
    get: (x) => x.over(x.dpsFwd, x.priceYearsAgo(1)),
  },
  {
    id: 'operatingEarningsYieldTtm', label: 'Operating Earnings Yield (TTM)',
    group: 'Is the yield real?', weight: 3, better: 'high', fmt: FMT.pct2, approximate: true,
    desc: 'Operating profit against the whole enterprise, debt included.',
    get: (x) => x.over(x.ebitTtm, x.enterpriseValue),
  },
  {
    id: 'operatingEarningsYieldFy1', label: 'Operating Earnings Yield (FY1)',
    group: 'Is the yield real?', weight: 2, better: 'high', fmt: FMT.pct2, approximate: true,
    desc: 'The same on next year’s consensus operating profit.',
    get: (x) => x.over(x.fy1?.ebitAvg, x.enterpriseValue),
  },
];

/* ==========================================================================
   FACTOR 4 — DIVIDEND CONSISTENCY (1×) — 10 lines

   All ten are built from the payment record, with special dividends already
   taken out upstream — which is what stops a one-off payment reading as a cut
   in the following year.
   ========================================================================== */

const CONSISTENCY = [
  {
    id: 'consecutiveGrowthYears', label: 'Consecutive Years of Dividend Growth',
    group: 'Streaks', weight: 20, better: 'high', fmt: FMT.years,
    desc: 'Years in a row, counting back from the last complete one, with a higher annual payment.',
    get: (x) => {
      const y = x.byYear;
      if (y.length < 3) return null;
      let n = 0;
      for (let i = y.length - 1; i > 0; i--) {
        if (y[i].dps > y[i - 1].dps) n++; else break;
      }
      return n;
    },
  },
  {
    id: 'uninterruptedYears', label: 'Years of Uninterrupted Payments',
    group: 'Streaks', weight: 16, better: 'high', fmt: FMT.years,
    desc: 'Years in a row with at least one payment.',
    get: (x) => {
      const y = x.byYear;
      if (y.length < 3) return null;
      let n = 0;
      for (let i = y.length - 1; i >= 0; i--) {
        const expected = y.at(-1).year - (y.length - 1 - i);
        if (y[i].year === expected && y[i].dps > 0) n++; else break;
      }
      return n;
    },
  },
  {
    id: 'cuts10y', label: 'Dividend Cuts, 10Y count',
    group: 'Cuts', weight: 16, better: 'low', fmt: FMT.int,
    desc: 'Years in the last ten where the annual payment fell.',
    get: (x) => {
      const y = x.byYear.slice(-11);
      if (y.length < 3) return null;
      let n = 0;
      for (let i = 1; i < y.length; i++) if (y[i].dps < y[i - 1].dps) n++;
      return n;
    },
  },
  {
    id: 'dpsGrowthStability5y', label: 'DPS Growth Stability (5Y)',
    group: 'Steadiness', weight: 11, better: 'low', fmt: FMT.pct2,
    desc: 'The spread of the last five annual growth rates. A steady riser scores low.',
    get: (x) => {
      const g = x.growthRates.slice(-5);
      return g.length >= 3 ? x.stdev(g) : null;
    },
  },
  {
    id: 'longestNoCutStreak', label: 'Longest Streak Without a Cut',
    group: 'Streaks', weight: 8, better: 'high', fmt: FMT.years,
    desc: 'The longest run of years, over the whole record, with no decline.',
    get: (x) => {
      const y = x.byYear;
      if (y.length < 3) return null;
      let best = 1;
      let run = 1;
      for (let i = 1; i < y.length; i++) {
        if (y[i].dps >= y[i - 1].dps) { run++; best = Math.max(best, run); } else run = 1;
      }
      return best;
    },
  },
  {
    id: 'payoutStability5y', label: 'Payout Ratio Stability (5Y)',
    group: 'Steadiness', weight: 8, better: 'low', fmt: FMT.pct2,
    desc: 'The spread of the last five annual payout ratios.',
    get: (x) => {
      const p = x.payoutByYear.slice(0, 5);
      return p.length >= 3 ? x.stdev(p) : null;
    },
  },
  {
    id: 'paymentRegularity', label: 'Payment Regularity',
    group: 'Steadiness', weight: 7, better: 'high', fmt: FMT.pct,
    desc: 'The share of expected payment slots actually filled over five years.',
    get: (x) => {
      if (!x.freq || !x.regular.length) return null;
      const years = 5;
      const since = Date.now() - years * 365 * 86400000;
      const paid = x.regular.filter((d) => d.at >= since).length;
      const expected = x.freq * years;
      // A payer younger than the window is measured against its own life.
      const oldest = x.regular.at(-1).at;
      const lived = Math.min(years, Math.max(0.5, (Date.now() - oldest) / (365 * 86400000)));
      const slots = Math.round(x.freq * lived);
      return slots > 0 ? Math.min(1, paid / Math.min(expected, slots)) : null;
    },
  },
  {
    id: 'increaseFrequency10y', label: 'Dividend Increase Frequency (10Y)',
    group: 'Streaks', weight: 6, better: 'high', fmt: FMT.pct,
    desc: 'The share of the last ten years in which the payment rose.',
    get: (x) => {
      const y = x.byYear.slice(-11);
      if (y.length < 3) return null;
      let n = 0;
      for (let i = 1; i < y.length; i++) if (y[i].dps > y[i - 1].dps) n++;
      return n / (y.length - 1);
    },
  },
  {
    id: 'yearsSinceLastCut', label: 'Years Since Last Cut',
    group: 'Cuts', weight: 5, better: 'high', fmt: FMT.years,
    desc: 'How long since the annual payment last fell. A record with no cut at all scores its full length.',
    get: (x) => {
      const y = x.byYear;
      if (y.length < 3) return null;
      for (let i = y.length - 1; i > 0; i--) {
        if (y[i].dps < y[i - 1].dps) return y.at(-1).year - y[i].year;
      }
      return y.at(-1).year - y[0].year;
    },
  },
  {
    id: 'specialReliance5y', label: 'Special-Dividend Reliance (5Y)',
    group: 'Steadiness', weight: 3, better: 'low', fmt: FMT.pct,
    desc: 'How much of the last five years of payments came from one-off specials.',
    get: (x) => {
      const since = Date.now() - 5 * 365 * 86400000;
      const sum = (rows) => rows.filter((d) => d.at >= since).reduce((a, d) => a + d.amount, 0);
      const special = sum(x.specials);
      const total = special + sum(x.regular);
      return total > 0 ? special / total : null;
    },
  },
];

/** Every line, keyed by factor. */
export const DIV_LINES = {
  safety: SAFETY,
  growth: GROWTH,
  yield: YIELD,
  consistency: CONSISTENCY,
};

export const DIV_LINE_BY_ID = Object.fromEntries(
  Object.values(DIV_LINES).flat().map((l) => [l.id, l]));

/** How many lines the module defines, and how many it can actually compute. */
export const DIV_LINE_COUNT = Object.values(DIV_LINES).flat().length;
export const DIV_BUILDABLE = Object.values(DIV_LINES).flat().filter((l) => !l.na).length;
