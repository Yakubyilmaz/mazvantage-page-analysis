/* ==========================================================================
   Vanlior — analysis model

   Turns a raw FMP `Dataset` into the numbers the report renders:

     facts     normalised fundamentals (TTM), reconstructed from ratio feeds
               when the statement endpoints are not on the caller's plan
     forecast  three-year analyst-consensus outlook
     checks    34 pass/fail tests grouped into six factors
     scores    Value / Future / Past / Health / Dividend (0-6) + Management (0-4)
     rewards   plain-language highlights, derived from the checks
     risks

   Every check carries `state` ('pass' | 'fail' | 'na'), the sentence shown
   under it, and — when it could not be evaluated — why. A check that cannot
   be evaluated never counts toward the score, so a gated feed lowers
   confidence rather than silently scoring zero.
   ========================================================================== */

import { isNum, cagr, mean, median, pct, mult, money, price, trim, dec, yearOf, yoy, fmtDate, clamp } from './util.js';
import { logoUrl } from './fmp.js';
import { sectorLookup } from './grading.js';
import { gradeAll, FACTOR_KEYS, FACTORS, METRICS } from './factors.js';

/* ==========================================================================
   Benchmarks
   Editable defaults. Anything here can be overridden per-report through
   Settings, which writes to localStorage under `mazvantage.benchmarks`.
   ========================================================================== */

export const DEFAULT_BENCHMARKS = {
  riskFreeRate: 0.042,          // 10y treasury — "savings rate" hurdle
  terminalGrowth: 0.025,        // perpetual growth past the forecast horizon.
                                // Held below the risk-free rate on purpose: a
                                // company growing faster than the economy for
                                // ever eventually becomes the economy.
  equityRiskPremium: 0.045,     // excess return demanded for holding equities;
                                // with beta this gives a cost of equity, the
                                // risk-adjusted bar a forecast return must clear
  marketEarningsGrowth: 0.147,  // forecast annual earnings growth, US market
  marketRevenueGrowth: 0.095,   // forecast annual revenue growth, US market
  highGrowth: 0.20,             // "high growth" bar for earnings and revenue
  futureRoeBar: 0.20,           // forecast ROE considered high
  roeBar: 0.20,                 // trailing ROE considered high
  dividendNotable: 0.014,       // bottom quartile yield among market payers
  dividendTopTier: 0.036,       // top quartile yield among market payers
  payoutCeiling: 0.90,          // above this, a dividend is not covered
  netDebtToEquityCeiling: 0.40, // "appropriate" leverage
  debtCoverageFloor: 0.20,      // operating cash flow / total debt
  interestCoverFloor: 3,        // EBIT / interest expense
  managementTenureBar: 2,       // years
  boardTenureBar: 3,            // years
  grahamYield: 4.4,             // AAA corporate yield used by the fair-ratio model
  // Industry P/E fallbacks, used for "Price-To-Earnings vs Industry" when a
  // live industry aggregate is not available. Keyed by FMP `sector`.
  industryPe: {
    'Technology': 32.0, 'Communication Services': 21.0, 'Consumer Cyclical': 22.0,
    'Consumer Defensive': 19.5, 'Healthcare': 24.0, 'Financial Services': 13.5,
    'Industrials': 23.0, 'Energy': 13.0, 'Basic Materials': 17.0,
    'Utilities': 18.0, 'Real Estate': 32.0, _default: 20.0,
  },
  industryEarningsGrowth: {
    'Technology': 0.194, 'Communication Services': 0.135, 'Consumer Cyclical': 0.118,
    'Consumer Defensive': 0.068, 'Healthcare': 0.142, 'Financial Services': 0.091,
    'Industrials': 0.105, 'Energy': 0.032, 'Basic Materials': 0.076,
    'Utilities': 0.074, 'Real Estate': 0.055, _default: 0.10,
  },
};

const BM_STORAGE = 'mazvantage.benchmarks';

export function loadBenchmarks() {
  try {
    const raw = JSON.parse(localStorage.getItem(BM_STORAGE) || '{}');
    return { ...DEFAULT_BENCHMARKS, ...raw };
  } catch { return { ...DEFAULT_BENCHMARKS }; }
}

export function saveBenchmarks(patch) {
  const cur = loadBenchmarks();
  localStorage.setItem(BM_STORAGE, JSON.stringify({ ...cur, ...patch }));
}

/* ==========================================================================
   Fact extraction
   ========================================================================== */

const arr = (v) => (Array.isArray(v) ? v : []);

/** Statements come back newest-first; give callers oldest-first. */
const chron = (rows) => arr(rows).slice().sort((a, b) => new Date(a.date) - new Date(b.date));

function deriveFacts(ds, bm) {
  const quote = ds.get('quote') || {};
  const profile = ds.get('profile') || {};
  const r = ds.get('ratiosTtm') || {};
  const km = ds.get('metricsTtm') || {};
  const sc = ds.get('scores') || {};

  const income = chron(ds.get('income'));
  const balance = chron(ds.get('balance'));
  const cash = chron(ds.get('cashflow'));

  const latestI = income.at(-1) || null;
  const latestB = balance.at(-1) || null;
  const latestC = cash.at(-1) || null;

  const priceNow = quote.price ?? profile.price ?? null;
  const marketCap = quote.marketCap ?? profile.marketCap ?? sc.marketCap ?? null;

  // Share count: the anchor for every per-share reconstruction below.
  const shares =
    (isNum(marketCap) && isNum(priceNow) && priceNow > 0) ? marketCap / priceNow
    : (isNum(sc.revenue) && isNum(r.revenuePerShareTTM) && r.revenuePerShareTTM > 0) ? sc.revenue / r.revenuePerShareTTM
    : latestI?.weightedAverageShsOutDil ?? null;

  const perShare = (v) => (isNum(v) && isNum(shares) ? v * shares : null);

  // Trailing-twelve-month figures come first everywhere. The annual statements
  // can be almost a year stale by the time they are the newest filing, and the
  // headline balance sheet should describe the company as it is now — the
  // statements are the source for *history*, not for the current position.
  const revenue     = sc.revenue                          ?? perShare(r.revenuePerShareTTM)               ?? latestI?.revenue;
  const netIncome   = perShare(r.netIncomePerShareTTM)    ?? latestI?.netIncome                           ?? null;
  const equity      = perShare(r.bookValuePerShareTTM)    ?? latestB?.totalStockholdersEquity             ?? null;
  const cashOnHand  = perShare(r.cashPerShareTTM)         ?? latestB?.cashAndShortTermInvestments         ?? null;
  const ocf         = perShare(r.operatingCashFlowPerShareTTM) ?? latestC?.operatingCashFlow              ?? null;
  const fcf         = perShare(r.freeCashFlowPerShareTTM) ?? latestC?.freeCashFlow                        ?? null;
  const totalDebt   = (isNum(r.debtToEquityRatioTTM) && isNum(equity) ? r.debtToEquityRatioTTM * equity : null)
                      ?? latestB?.totalDebt ?? null;
  const totalAssets = sc.totalAssets ?? latestB?.totalAssets ?? null;
  const totalLiab   = sc.totalLiabilities ?? latestB?.totalLiabilities ?? null;
  const ebit        = sc.ebit ?? latestI?.operatingIncome ?? null;

  // Current assets / liabilities: from the balance sheet when we have it,
  // otherwise solved from working capital and the current ratio. That solve is
  // ill-conditioned as the current ratio approaches 1, so the result is only
  // accepted when it lands inside total liabilities.
  let currentAssets = null;
  let currentLiab = null;
  const wc = km.workingCapitalTTM ?? sc.workingCapital ?? null;
  const cr = r.currentRatioTTM ?? null;
  if (isNum(wc) && isNum(cr) && cr !== 1) {
    const solved = wc / (cr - 1);
    const plausible = isNum(solved) && solved > 0
      && (!isNum(totalLiab) || solved <= totalLiab * 1.02);
    if (plausible) {
      currentLiab = solved;
      currentAssets = cr * solved;
    }
  }
  currentAssets ??= latestB?.totalCurrentAssets ?? null;
  currentLiab ??= latestB?.totalCurrentLiabilities ?? null;
  const longTermLiab = isNum(totalLiab) && isNum(currentLiab) ? totalLiab - currentLiab : null;

  const netDebt = isNum(totalDebt) && isNum(cashOnHand) ? totalDebt - cashOnHand : null;

  // Interest: FMP reports 0 when a company has no meaningful interest expense.
  const interestExpense = latestI?.interestExpense ?? null;
  const interestCover = (isNum(r.interestCoverageRatioTTM) && r.interestCoverageRatioTTM > 0)
    ? r.interestCoverageRatioTTM
    : (isNum(ebit) && isNum(interestExpense) && interestExpense > 0 ? ebit / interestExpense : null);

  const eps = r.netIncomePerShareTTM ?? (isNum(netIncome) && isNum(shares) ? netIncome / shares : null);
  const pe  = r.priceToEarningsRatioTTM ?? (isNum(priceNow) && isNum(eps) && eps > 0 ? priceNow / eps : null);

  return {
    symbol: ds.symbol,
    name: profile.companyName ?? quote.name ?? ds.symbol,
    exchange: profile.exchange ?? quote.exchange ?? '',
    exchangeFull: profile.exchangeFullName ?? '',
    currency: profile.currency ?? 'USD',
    sector: profile.sector ?? '',
    industry: profile.industry ?? '',
    country: profile.country ?? '',
    ceo: profile.ceo ?? '',
    website: profile.website ?? '',
    description: profile.description ?? '',
    employees: profile.fullTimeEmployees ? Number(profile.fullTimeEmployees) : null,
    ipoDate: profile.ipoDate ?? null,
    image: profile.image ?? null,
    address: [profile.address, profile.city, profile.state, profile.zip, profile.country]
      .filter(Boolean).join(', '),
    isin: profile.isin ?? null,
    cik: profile.cik ?? null,
    beta: profile.beta ?? null,

    price: priceNow,
    change: quote.change ?? null,
    changePct: isNum(quote.changePercentage) ? quote.changePercentage / 100 : null,
    open: quote.open ?? null, previousClose: quote.previousClose ?? null,
    // Seconds since the epoch, as the vendor sends it. Kept as an ISO string
    // so every date helper in util.js can read it without a special case.
    quoteTime: isNum(quote.timestamp) ? new Date(quote.timestamp * 1000).toISOString() : null,
    dayLow: quote.dayLow ?? null, dayHigh: quote.dayHigh ?? null,
    yearLow: quote.yearLow ?? null, yearHigh: quote.yearHigh ?? null,
    avg50: quote.priceAvg50 ?? null, avg200: quote.priceAvg200 ?? null,
    volume: quote.volume ?? null,
    marketCap, shares,

    revenue, netIncome, equity, cash: cashOnHand, ocf, fcf,
    totalDebt, netDebt, totalAssets, totalLiabilities: totalLiab,
    currentAssets, currentLiabilities: currentLiab, longTermLiabilities: longTermLiab,
    workingCapital: wc, ebit, interestExpense, interestCover,

    eps, pe,
    pb: r.priceToBookRatioTTM ?? null,
    ps: r.priceToSalesRatioTTM ?? null,
    pfcf: r.priceToFreeCashFlowRatioTTM ?? null,
    peg: r.priceToEarningsGrowthRatioTTM ?? null,
    grossMargin: r.grossProfitMarginTTM ?? null,
    operatingMargin: r.operatingProfitMarginTTM ?? null,
    netMargin: r.netProfitMarginTTM ?? null,
    ebitdaMargin: r.ebitdaMarginTTM ?? null,
    roe: km.returnOnEquityTTM ?? null,
    roa: km.returnOnAssetsTTM ?? null,
    roic: km.returnOnInvestedCapitalTTM ?? null,
    roce: km.returnOnCapitalEmployedTTM ?? null,
    returnOnTangibleAssets: km.returnOnTangibleAssetsTTM ?? null,

    // Efficiency and earnings quality.
    assetTurnover: r.assetTurnoverTTM ?? null,
    fixedAssetTurnover: r.fixedAssetTurnoverTTM ?? null,
    cashPerShare: r.cashPerShareTTM ?? null,
    capexToRevenue: km.capexToRevenueTTM ?? null,
    sbcToRevenue: km.stockBasedCompensationToRevenueTTM ?? null,
    effectiveTaxRate: r.effectiveTaxRateTTM ?? null,
    fcfToOcf: r.freeCashFlowOperatingCashFlowRatioTTM
      ?? (isNum(fcf) && isNum(ocf) && ocf > 0 ? fcf / ocf : null),

    // Liquidity, leverage and coverage.
    currentRatio: cr,
    quickRatio: r.quickRatioTTM ?? null,
    cashRatio: r.cashRatioTTM ?? null,
    debtToEquity: r.debtToEquityRatioTTM ?? null,
    debtToAssets: r.debtToAssetsRatioTTM ?? null,
    financialLeverage: r.financialLeverageRatioTTM ?? null,
    longTermDebtToCapital: r.longTermDebtToCapitalRatioTTM ?? null,
    debtToCapital: r.debtToCapitalRatioTTM ?? null,
    netDebtToEbitda: km.netDebtToEBITDATTM ?? null,
    solvencyRatio: r.solvencyRatioTTM ?? null,
    debtServiceCoverage: r.debtServiceCoverageRatioTTM ?? null,
    bookValuePerShare: r.bookValuePerShareTTM ?? null,
    tangibleBookValuePerShare: r.tangibleBookValuePerShareTTM ?? null,
    incomeQuality: km.incomeQualityTTM ?? (isNum(ocf) && isNum(netIncome) && netIncome > 0 ? ocf / netIncome : null),
    dividendYield: r.dividendYieldTTM ?? null,
    dividendPerShare: r.dividendPerShareTTM ?? null,
    payoutRatio: r.dividendPayoutRatioTTM ?? null,
    cashPayoutRatio: (isNum(r.dividendPerShareTTM) && isNum(r.freeCashFlowPerShareTTM) && r.freeCashFlowPerShareTTM > 0)
      ? r.dividendPerShareTTM / r.freeCashFlowPerShareTTM : null,
    altmanZ: sc.altmanZScore ?? null,
    piotroski: sc.piotroskiScore ?? null,

    lastReported: latestI?.date ?? null,
    fiscalYearEnd: latestI?.date ?? null,

    statements: { income, balance, cash },
    hasStatements: income.length > 0,
  };
}

/* ==========================================================================
   Forecast extraction
   ========================================================================== */

function deriveForecast(ds, facts) {
  const est = chron(ds.get('estimates'));
  if (!est.length) return { available: false, rows: [] };

  const thisYear = new Date().getUTCFullYear();
  // The consensus set spans the current fiscal year forward.
  const rows = est.map((e) => ({
    date: e.date,
    year: yearOf(e.date),
    revenue: e.revenueAvg ?? null,
    revenueLow: e.revenueLow ?? null,
    revenueHigh: e.revenueHigh ?? null,
    netIncome: e.netIncomeAvg ?? null,
    netIncomeLow: e.netIncomeLow ?? null,
    netIncomeHigh: e.netIncomeHigh ?? null,
    ebitda: e.ebitdaAvg ?? null,
    ebit: e.ebitAvg ?? null,
    eps: e.epsAvg ?? null,
    epsLow: e.epsLow ?? null,
    epsHigh: e.epsHigh ?? null,
    analystsRevenue: e.numAnalystsRevenue ?? null,
    analystsEps: e.numAnalystsEps ?? null,
  })).filter((r) => isNum(r.year));

  const base = rows.find((r) => r.year >= thisYear) || rows[0];
  const horizon = 3;
  const target = rows.find((r) => r.year === base.year + horizon)
    || rows.filter((r) => r.year > base.year).at(-1)
    || null;
  const span = target ? target.year - base.year : 0;

  // Consensus paths often carry one bad year, because a different subset of
  // analysts covers each horizon. An endpoint CAGR would inherit that error
  // wholesale, so the headline growth rate is the *median* year-on-year step
  // across the window, falling back to endpoint CAGR when there are too few
  // steps to take a median.
  const window = target ? rows.filter((r) => r.year >= base.year && r.year <= target.year) : [];
  const growth = (field) => {
    if (!target || span <= 0) return null;
    const steps = [];
    for (let i = 1; i < window.length; i++) {
      const prev = window[i - 1][field], cur = window[i][field];
      if (isNum(prev) && isNum(cur) && prev > 0) steps.push(cur / prev - 1);
    }
    if (steps.length >= 3) return median(steps);
    return cagr(base[field], target[field], span);
  };

  // Project equity forward by retaining earnings net of shareholder returns.
  // With a cash flow statement we use actual dividends + buybacks; otherwise
  // we fall back to the dividend payout ratio alone.
  const latestC = facts.statements.cash.at(-1);
  let retention = null;
  if (latestC && isNum(facts.netIncome) && facts.netIncome > 0) {
    const dividends = latestC.netDividendsPaid ?? latestC.commonDividendsPaid ?? 0;
    const buybacks = latestC.commonStockRepurchased ?? latestC.netCommonStockIssuance ?? 0;
    const returned = Math.abs(dividends) + Math.abs(buybacks);
    retention = clamp(1 - returned / facts.netIncome, 0, 1);
  } else if (isNum(facts.payoutRatio)) {
    retention = clamp(1 - facts.payoutRatio, 0, 1);
  }

  let futureRoe = null;
  if (target && isNum(facts.equity) && isNum(retention)) {
    const path = rows.filter((r) => r.year > base.year && r.year <= target.year && isNum(r.netIncome));
    const retained = path.reduce((acc, r) => acc + r.netIncome * retention, 0);
    const projectedEquity = facts.equity + retained;
    if (projectedEquity > 0 && isNum(target.netIncome)) futureRoe = target.netIncome / projectedEquity;
  }

  return {
    available: true,
    rows,
    base, target, span,
    revenueGrowth: growth('revenue'),
    earningsGrowth: growth('netIncome'),
    epsGrowth: growth('eps'),
    futureRoe,
    retention,
    /** true when buybacks could not be netted off, so retention is overstated */
    retentionIsGross: !facts.statements.cash.at(-1),
    analystCount: Math.max(base?.analystsEps ?? 0, base?.analystsRevenue ?? 0) || null,
  };
}

/* ==========================================================================
   History

   Every field here is independently optional. Annual statements are the best
   source, but the `financial-growth`, `ratios` and `key-metrics` feeds carry
   pre-computed growth rates and multiples, so a plan that gates statements
   can still answer some of the Past Performance and Health checks. Callers
   test the individual field, never a single `available` flag.
   ========================================================================== */

function deriveHistory(ds, facts) {
  const income = facts.statements.income;
  const balance = facts.statements.balance;
  const cash = facts.statements.cash;

  const growthRows = chron(ds.get('growth'));
  const ratioRows = chron(ds.get('ratiosHist'));
  const metricRows = chron(ds.get('metricsHist'));

  const h = {
    available: income.length >= 2,     // full statement history
    income, balance, cash,
    marginNow: null, marginPrev: null,
    growth1y: null, growth5y: null, revenueGrowth5y: null,
    debtSeries: [], deNow: null, de5: null,
    peSeries: [], roeSeries: [],
  };

  /* ---- preferred: annual statements ---- */
  if (income.length >= 2) {
    const last = income.at(-1);
    const prev = income.at(-2);
    const fiveBack = income.length >= 6 ? income.at(-6) : income[0];
    const years5 = Math.min(Math.max(income.length - 1, 1), 5);

    h.marginNow = last.revenue > 0 ? last.netIncome / last.revenue : null;
    h.marginPrev = prev.revenue > 0 ? prev.netIncome / prev.revenue : null;
    h.growth1y = (prev.netIncome > 0 && isNum(last.netIncome)) ? last.netIncome / prev.netIncome - 1 : null;
    h.growth5y = cagr(fiveBack.netIncome, last.netIncome, years5);
    h.revenueGrowth5y = cagr(fiveBack.revenue, last.revenue, years5);
  }

  /* ---- fallback: the pre-computed growth feed ---- */
  const g = growthRows.at(-1);
  if (g) {
    h.growth1y ??= isNum(g.netIncomeGrowth) ? g.netIncomeGrowth : null;
    h.growth5y ??= isNum(g.fiveYNetIncomeGrowthPerShare)
      ? Math.pow(1 + g.fiveYNetIncomeGrowthPerShare, 1 / 5) - 1 : null;
    h.revenueGrowth5y ??= isNum(g.fiveYRevenueGrowthPerShare)
      ? Math.pow(1 + g.fiveYRevenueGrowthPerShare, 1 / 5) - 1 : null;
  }

  /* ---- leverage over time ---- */
  if (balance.length) {
    h.debtSeries = balance.map((b) => ({
      date: b.date,
      debtToEquity: b.totalStockholdersEquity > 0 ? (b.totalDebt ?? 0) / b.totalStockholdersEquity : null,
      totalDebt: b.totalDebt ?? null,
      equity: b.totalStockholdersEquity ?? null,
    }));
  } else if (ratioRows.length) {
    h.debtSeries = ratioRows.map((r) => ({
      date: r.date,
      debtToEquity: r.debtToEquityRatio ?? r.debtEquityRatio ?? null,
      totalDebt: null, equity: null,
    }));
  }
  const withDe = h.debtSeries.filter((d) => isNum(d.debtToEquity));
  h.deNow = withDe.at(-1)?.debtToEquity ?? null;
  h.de5 = (withDe.length >= 6 ? withDe.at(-6) : withDe[0])?.debtToEquity ?? null;

  /* ---- multiples and returns over time ---- */
  h.peSeries = ratioRows
    .map((r) => ({ date: r.date, pe: r.priceToEarningsRatio ?? r.priceEarningsRatio ?? null }))
    .filter((r) => isNum(r.pe) && r.pe > 0);

  if (income.length && balance.length) {
    const byYear = new Map(income.map((i) => [yearOf(i.date), i.netIncome]));
    h.roeSeries = balance.map((b) => {
      const ni = byYear.get(yearOf(b.date));
      return {
        date: b.date,
        roe: isNum(ni) && b.totalStockholdersEquity > 0 ? ni / b.totalStockholdersEquity : null,
      };
    }).filter((r) => isNum(r.roe));
  } else if (metricRows.length) {
    h.roeSeries = metricRows
      .map((m) => ({ date: m.date, roe: m.returnOnEquity ?? null }))
      .filter((r) => isNum(r.roe));
  }

  return h;
}

/* ==========================================================================
   Peer aggregates
   ========================================================================== */

function derivePeers(ds, facts, bm) {
  const raw = arr(ds.get('peers')).filter((p) => p.symbol && p.symbol !== facts.symbol);
  const peers = raw.slice(0, 8).map((p) => ({
    symbol: p.symbol,
    name: p.companyName ?? p.symbol,
    price: p.price ?? null,
    marketCap: p.mktCap ?? p.marketCap ?? null,
    pe: p.pe ?? null,   // filled in later by app.js if peer ratios are fetched
    // The peers feed carries no logo, so this is built from the symbol. It
    // may not resolve; the view falls back to an initial.
    image: logoUrl(p.symbol),
  }));
  return { peers, peerPe: null };
}

/* ==========================================================================
   Fair ratio
   Revised Graham: fair P/E = (8.5 + 2g) x 4.4 / Y, where g is the forecast
   annual earnings growth in whole percent and Y the prevailing AAA yield.
   Bounded to keep hyper-growth and shrinking businesses in a sane range.
   ========================================================================== */

function fairPe(growth, bm) {
  if (!isNum(growth)) return null;
  const g = clamp(growth * 100, -5, 25);
  const raw = (8.5 + 2 * g) * (4.4 / bm.grahamYield);
  return clamp(raw, 5, 60);
}

/* ==========================================================================
   Dividend history
   ========================================================================== */

function deriveDividends(ds) {
  const rows = arr(ds.get('dividends'));
  if (!rows.length) {
    return { available: false, rows: [], byYear: [], stable: null, growing: null, growth: null, years: 0, worstDrop: null };
  }

  // Aggregate to calendar years so quarterly / irregular payers compare fairly.
  const map = new Map();
  for (const d of rows) {
    const y = yearOf(d.date ?? d.paymentDate ?? d.recordDate);
    const amt = d.adjDividend ?? d.dividend ?? 0;
    if (!isNum(y) || !isNum(amt)) continue;
    map.set(y, (map.get(y) || 0) + amt);
  }
  const thisYear = new Date().getUTCFullYear();
  const byYear = [...map.entries()]
    .filter(([y]) => y < thisYear)          // drop the incomplete current year
    .sort((a, b) => a[0] - b[0])
    .slice(-10)
    .map(([year, amount]) => ({ year, amount }));

  if (byYear.length < 2) {
    return { available: true, rows, byYear, stable: null, growing: null, growth: null, years: byYear.length, worstDrop: null };
  }

  let worstDrop = 0;
  for (let i = 1; i < byYear.length; i++) {
    const prev = byYear[i - 1].amount, cur = byYear[i].amount;
    if (prev > 0) worstDrop = Math.min(worstDrop, cur / prev - 1);
  }
  const span = byYear.at(-1).year - byYear[0].year;
  const growth = cagr(byYear[0].amount, byYear.at(-1).amount, span || 1);

  return {
    available: true, rows, byYear,
    years: byYear.length,
    worstDrop,
    stable: worstDrop > -0.20,          // no annual cut deeper than 20%
    growing: isNum(growth) ? growth > 0 : null,
    growth,
  };
}

/* ==========================================================================
   The last quarter
   ========================================================================== */

/**
 * The most recently reported quarter, from the earnings calendar.
 *
 * Every statement this app fetches is annual, so the calendar is the only
 * quarterly thing in the dataset — and what it carries is exactly what "how
 * did the last quarter go" means to a reader: the actual against what the
 * street was expecting. Rows with no actual are quarters that have not
 * happened yet, and are the *next* report rather than the last one.
 */
function deriveQuarter(ds) {
  const rows = arr(ds.get('earnings')).filter((r) => r && r.date);
  const now = Date.now();

  const reported = rows
    .filter((r) => isNum(r.epsActual) || isNum(r.revenueActual))
    .sort((x, y) => new Date(y.date) - new Date(x.date));
  const upcoming = rows
    .filter((r) => !isNum(r.epsActual) && new Date(r.date).getTime() > now)
    .sort((x, y) => new Date(x.date) - new Date(y.date));

  const last = reported[0] || null;

  // Divided by the magnitude of the estimate, not the estimate itself: a
  // company expected to lose 20c and losing 10c beat, and a plain ratio
  // would report that as a miss.
  const surprise = (actual, est) =>
    (isNum(actual) && isNum(est) && est !== 0) ? (actual - est) / Math.abs(est) : null;

  return {
    available: !!last,
    date: last?.date ?? null,
    eps: last?.epsActual ?? null,
    epsEstimate: last?.epsEstimated ?? null,
    epsSurprise: surprise(last?.epsActual, last?.epsEstimated),
    revenue: last?.revenueActual ?? null,
    revenueEstimate: last?.revenueEstimated ?? null,
    revenueSurprise: surprise(last?.revenueActual, last?.revenueEstimated),
    next: upcoming[0]?.date ?? null,
  };
}

/* ==========================================================================
   Insider dealing
   ========================================================================== */

/* ==========================================================================
   Trade markers — when somebody bought or sold

   Two sources, two very different kinds of evidence, and the difference is
   the whole reason these are derived separately.

   ---------------------------------------------------------------------------
   Insiders: an exact date
   ---------------------------------------------------------------------------

   A Form 4 carries the day the transaction happened. That is a real date and
   a marker can sit on it.

   **Only open-market purchases and sales are marked.** A Form 4 also reports
   awards, option exercises, gifts and shares withheld to pay tax on a vesting
   grant, and none of those is a decision to buy or sell — an award is
   compensation arriving, and a tax withholding is a sale the recipient did not
   choose. Counting them as insider buying is how a page ends up showing a
   "cluster of insider buys" that is one vesting date. `INSIDER_INTENT` below
   is the whole of that filter and the count it excludes is reported.

   ---------------------------------------------------------------------------
   Funds: a quarter, not a date
   ---------------------------------------------------------------------------

   A 13F says what a manager held on the last day of a quarter. It does not
   say when they traded, and the filing itself lands up to 45 days later. So a
   fund marker is placed at the quarter end and drawn as a diamond rather than
   a triangle, because **the date is a reporting date, not a trade date** — the
   position could have changed on any day in those three months.

   Index managers are excluded. BlackRock's position in a large company moves
   because the index moved, not because anyone formed a view, and a "super
   investor sold" ping from a tracker is noise dressed as signal.
   ========================================================================== */

/**
 * Form 4 transaction codes worth marking.
 *
 * `P` and `S` are open-market decisions. Everything else — `A` award,
 * `M` exercise, `F` tax withholding, `G` gift, `C` conversion — happens for
 * reasons that have nothing to do with a view on the price.
 */
const INSIDER_INTENT = { P: 'buy', S: 'sell' };

/**
 * Managers whose 13F changes track an index rather than a decision.
 *
 * Substring matching on the filer name, which is crude in one known
 * direction: "Vanguard Capital Management LLC" is a different firm from the
 * Vanguard Group and gets excluded with it. That is the safe way round — a
 * missing marker is a smaller error than a tracker's rebalancing presented as
 * a super-investor's conviction — but it is a filter on names, not on what
 * the manager actually does.
 */
const INDEX_MANAGERS = [
  'blackrock', 'vanguard', 'state street', 'geode', 'northern trust',
  'charles schwab', 'dimensional', 'invesco', 'ssga', 'fmr llc', 'fidelity',
  'bank of new york mellon', 'norges', 'legal & general', 'ubs asset',
];

const isIndexManager = (name) => {
  const n = String(name || '').toLowerCase();
  return INDEX_MANAGERS.some((m) => n.includes(m));
};

/**
 * Insider trades as dated markers.
 *
 * Returns `{ markers, excluded, kinds }`. `excluded` is how many Form 4 rows
 * were dropped for being awards or tax withholdings rather than trades — the
 * chart prints it, because "12 markers from 47 filings" is a materially
 * different picture from "12 filings".
 */
function deriveInsiderMarkers(ds) {
  const rows = arr(ds.get('insiderTrades'));
  const markers = [];
  let excluded = 0;

  for (const r of rows) {
    const date = r?.transactionDate;
    if (!date) continue;

    const code = String(r.transactionType || '').split('-')[0].trim().toUpperCase();
    const intent = INSIDER_INTENT[code];
    if (!intent) { excluded += 1; continue; }

    const who = r.reportingName || 'An insider';
    const role = r.typeOfOwner ? String(r.typeOfOwner).replace(/^officer:\s*/i, '') : '';
    // `dec`, not `num`: a share count is a count. `num` scales through k/m/b
    // and would render 1,439 shares as "1k", which is both less useful and
    // less true than the figure on the filing.
    const size = isNum(r.securitiesTransacted) ? `${dec(r.securitiesTransacted, 0)} shares` : '';

    markers.push({
      date,
      kind: intent === 'buy' ? 'insiderBuy' : 'insiderSell',
      label: `${who}${role ? ` (${role})` : ''} — ${intent === 'buy' ? 'bought' : 'sold'}`
        + `${size ? ` ${size}` : ''}`,
    });
  }

  return {
    markers: markers.sort((a, b) => new Date(a.date) - new Date(b.date)),
    excluded,
    filings: rows.length,
  };
}

/**
 * One quarter of 13F holders, as markers at that quarter's end.
 *
 * `rows` is a single `institutional-ownership/extract-analytics/holder`
 * payload. Only holders whose share count actually moved are marked, and only
 * by more than a token amount: a 0.2% drift in a billion-share position is
 * rounding, not a decision.
 */
export function fundMarkersForQuarter(rows, { minChange = 0.05, cap = 12 } = {}) {
  const out = [];

  for (const r of arr(rows)) {
    const date = r?.date;
    const pctRaw = r?.changeInSharesNumberPercentage;
    if (!date || !isNum(pctRaw)) continue;
    if (isIndexManager(r.investorName)) continue;

    // The vendor publishes this already in percent, not as a fraction.
    const change = pctRaw / 100;
    if (Math.abs(change) < minChange) continue;

    out.push({
      date,
      kind: change > 0 ? 'fundBuy' : 'fundSell',
      weight: Math.abs(change) * (isNum(r.marketValue) ? r.marketValue : 0),
      label: `${r.investorName || 'A holder'} — ${change > 0 ? 'added' : 'cut'} `
        + `${pct(Math.abs(change))} of its position`
        + `${isNum(r.ownership) ? `, now ${pct(r.ownership / 100)} of the company` : ''}`,
    });
  }

  // The biggest movers in the quarter, by how much money moved. Twelve
  // diamonds on one quarter end is already a stack; forty is a smear.
  return out.sort((a, b) => b.weight - a.weight).slice(0, cap);
}

/**
 * Insider buying and selling, rolled up to a trailing four quarters.
 *
 * FMP reports one row per calendar quarter. The most recent quarter on its
 * own is often empty, or is one vesting event, so summing four of them makes
 * the headline a trailing-twelve-month picture rather than whatever happened
 * since the last quarter turned.
 */
function deriveInsiders(ds) {
  const raw = ds.get('insiderStats');
  const rows = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const trades = arr(ds.get('insiderTrades'));

  if (!rows.length) return { available: false, trades, quarters: 0 };

  const recent = rows.slice()
    .sort((x, y) => (y.year - x.year) || (y.quarter - x.quarter))
    .slice(0, 4);

  const acquired = recent.reduce((t, r) => t + (r.totalAcquired || 0), 0);
  const disposed = recent.reduce((t, r) => t + (r.totalDisposed || 0), 0);
  const net = acquired - disposed;

  // Only claim a four-quarter span when four quarters were actually there.
  const span = recent.length === 4
    ? `${recent.at(-1).year} Q${recent.at(-1).quarter} – ${recent[0].year} Q${recent[0].quarter}`
    : 'the reported period';
  const over = recent.length === 4 ? 'the last four quarters' : span;

  return {
    available: true,
    quarters: recent.length,
    span,
    acquired,
    disposed,
    net,
    ratio: disposed > 0 ? acquired / disposed : null,
    trades,
    /* The caveat travels with the number. A net disposal at a large employer
       is mostly vesting and tax withholding, and a figure reported without
       that reads as insiders heading for the exit. */
    note: net >= 0
      ? `Insiders have been net acquirers of ${ds.symbol} stock over ${over}.`
      : `Insiders disposed of ${Math.abs(net).toLocaleString('en-US')} more shares than they acquired `
        + `over ${over}. Much of that is usually vesting and tax-related selling rather than a view `
        + 'on the business.',
  };
}

/* ==========================================================================
   Management / executives
   ========================================================================== */

function deriveExecs(ds, facts, bm, history) {
  const list = arr(ds.get('executives'));
  const comp = arr(ds.get('execComp'));

  const ceo = list.find((e) => /chief executive|(^|\W)ceo(\W|$)/i.test(e.title || ''))
    || (facts.ceo ? { name: facts.ceo, title: 'Chief Executive Officer', pay: null } : null);

  const tenureOf = (e) => {
    const since = e.titleSince ? new Date(e.titleSince) : null;
    if (!since || Number.isNaN(since.getTime())) return null;
    return (Date.now() - since.getTime()) / (365.25 * 24 * 3600 * 1000);
  };

  const isBoard = (e) => /director|chair|board/i.test(e.title || '');
  const mgmt = list.filter((e) => !isBoard(e));
  const board = list.filter(isBoard);

  const managementTenure = mean(mgmt.map(tenureOf));
  const boardTenure = mean(board.map(tenureOf));

  // CEO pay: prefer the governance feed (total comp, multi-year), else the
  // key-executives `pay` field (salary-ish). The feed repeats a year whenever
  // more than one proxy statement discloses it, so collapse to one row per
  // year before reading a year-on-year change off it.
  const isCeoRow = (c) => /chief executive|(^|\W)ceo(\W|$)/i.test(c.nameAndPosition || c.position || '');
  const byYear = new Map();
  for (const c of comp.filter(isCeoRow)) {
    if (!isNum(c.year)) continue;
    const seen = byYear.get(c.year);
    // keep the most recently filed disclosure for the year
    if (!seen || new Date(c.filingDate || 0) > new Date(seen.filingDate || 0)) byYear.set(c.year, c);
  }
  const ceoComp = [...byYear.values()].sort((a, b) => a.year - b.year);
  const compChron = ceoComp;
  const latestComp = ceoComp.at(-1) || null;
  const prevComp = ceoComp.at(-2) || null;

  const ceoTotal = latestComp?.total ?? (isNum(ceo?.pay) ? ceo.pay : null);
  const ceoSalary = latestComp?.salary ?? null;

  // "Compensation vs Market": compare total pay against a size-based
  // expectation. Companies above US$8b market cap are large-cap; the median
  // large-cap US CEO package runs around US$16m.
  const capBand = !isNum(facts.marketCap) ? null
    : facts.marketCap >= 200e9 ? { label: 'mega-cap', typical: 25e6 }
    : facts.marketCap >= 8e9   ? { label: 'large-cap', typical: 16e6 }
    : facts.marketCap >= 2e9   ? { label: 'mid-cap', typical: 7e6 }
    : facts.marketCap >= 300e6 ? { label: 'small-cap', typical: 3.5e6 }
    : { label: 'micro-cap', typical: 1.5e6 };

  let ceoCompState = null, ceoCompNote = 'CEO compensation is not reported for this company.', ceoCompWhy = 'Needs the executive-compensation feed.';
  if (isNum(ceoTotal) && capBand) {
    ceoCompState = ceoTotal <= capBand.typical * 1.25;
    ceoCompNote = `${ceo?.name || 'The CEO'}'s total compensation (${money(ceoTotal)}) is ${ceoCompState ? 'below' : 'above'} the ${capBand.label} benchmark of about ${money(capBand.typical)}.`;
    ceoCompWhy = '';
  }

  // "Compensation vs Earnings": a raise is fine when profits rose at least as
  // fast. Pay climbing while earnings fall is the case this check exists for.
  let ceoCompChangeState = null;
  let ceoCompChangeNote = 'There is not enough compensation history to judge whether pay has moved in step with results.';
  let ceoCompChangeWhy = 'Needs two or more years of executive compensation.';
  if (latestComp && prevComp && isNum(latestComp.total) && isNum(prevComp.total) && prevComp.total > 0) {
    const payChange = latestComp.total / prevComp.total - 1;
    const earnChange = history?.growth1y ?? null;
    const moved = `${ceo?.name || 'CEO'} compensation moved ${pct(payChange, { sign: true })} to ${money(latestComp.total)} year on year`;

    if (isNum(earnChange)) {
      // 5 percentage points of slack, so a rounding-scale gap is not a failure
      ceoCompChangeState = payChange <= earnChange + 0.05;
      ceoCompChangeNote = `${moved}, against an earnings change of ${pct(earnChange, { sign: true })} — pay `
        + `${ceoCompChangeState ? 'has not outpaced' : 'has outpaced'} results.`;
    } else {
      ceoCompChangeState = payChange <= 0.10;
      ceoCompChangeNote = `${moved}. No earnings history is available to compare it against, so this falls back to a flat 10% ceiling.`;
    }
    ceoCompChangeWhy = '';
  }

  return {
    ceo, list, mgmt, board,
    managementTenure, boardTenure,
    ceoTotal, ceoSalary, capBand,
    ceoTenure: ceo ? tenureOf(ceo) : null,
    compHistory: compChron,
    ceoCompState, ceoCompNote, ceoCompWhy,
    ceoCompChangeState, ceoCompChangeNote, ceoCompChangeWhy,
  };
}

/* ==========================================================================
   Price series

   Shared with the price-history section, which used to keep private copies.
   ========================================================================== */

export function normalisePrices(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => ({ date: r.date, price: r.price ?? r.close ?? r.adjClose ?? null }))
    .filter((r) => r.date && isNum(r.price))
    .sort((x, y) => new Date(x.date) - new Date(y.date));
}

export const RETURN_SPANS = { '7D': 7, '1M': 30, '3M': 92, '6M': 183, '1Y': 365, '3Y': 1095, '5Y': 1825 };

/**
 * Total return over each named span, keyed the same way as `spans`.
 * A span the series is too short to cover is simply absent.
 */
export function computeReturns(pts, spans = RETURN_SPANS) {
  const out = {};
  if (!pts.length) return out;
  const last = pts.at(-1);
  const lastT = new Date(last.date).getTime();
  const firstT = new Date(pts[0].date).getTime();

  for (const [k, days] of Object.entries(spans)) {
    const target = lastT - days * 864e5;
    // nearest observation at or before the target date
    let ref = null;
    for (const p of pts) { if (new Date(p.date).getTime() <= target) ref = p; else break; }
    // A series that starts a few days inside the window would otherwise drop
    // the period entirely. Fall back to the earliest point when it covers at
    // least 90% of the span, which is close enough to quote.
    if (!ref && lastT - firstT >= days * 0.9 * 864e5) ref = pts[0];
    if (ref && ref.price > 0) out[k] = last.price / ref.price - 1;
  }
  return out;
}

/** Return since 1 January of the latest year in the series. */
export function ytdReturn(pts) {
  if (pts.length < 2) return null;
  const last = pts.at(-1);
  const jan1 = new Date(new Date(last.date).getUTCFullYear(), 0, 1).getTime();
  let ref = null;
  for (const p of pts) { if (new Date(p.date).getTime() <= jan1) ref = p; else break; }
  ref ??= pts.find((p) => new Date(p.date).getTime() >= jan1) || null;
  return ref && ref.price > 0 ? last.price / ref.price - 1 : null;
}

/** Standard deviation of non-overlapping five-day returns over the last year. */
export function weeklyVolatility(pts) {
  if (pts.length < 60) return null;
  const year = pts.slice(-260);
  const weekly = [];
  for (let i = 5; i < year.length; i += 5) {
    const a = year[i - 5].price, b = year[i].price;
    if (a > 0) weekly.push(b / a - 1);
  }
  if (weekly.length < 8) return null;
  const m = mean(weekly);
  return Math.sqrt(mean(weekly.map((r) => (r - m) ** 2)));
}

/** Worst peak-to-trough fall in the window, as a positive fraction. */
export function maxDrawdown(pts, days = 365) {
  if (pts.length < 10) return null;
  const cutoff = Date.now() - days * 864e5;
  const win = pts.filter((p) => new Date(p.date).getTime() >= cutoff);
  if (win.length < 10) return null;
  let peak = -Infinity, worst = 0;
  for (const p of win) {
    if (p.price > peak) peak = p.price;
    if (peak > 0) worst = Math.max(worst, 1 - p.price / peak);
  }
  return worst || null;
}

/* ==========================================================================
   Derived inputs for the graded factors

   Everything the metric registry in factors.js reads, assembled once so the
   registry entries stay one-liners.
   ========================================================================== */

function deriveValuation(ds, facts, forecast) {
  const km = ds.get('metricsTtm') || {};
  const r = ds.get('ratiosTtm') || {};
  const latestC = facts.statements.cash.at(-1) || null;

  const ev = km.enterpriseValueTTM ?? r.enterpriseValueTTM
    ?? (isNum(facts.marketCap) && isNum(facts.netDebt) ? facts.marketCap + facts.netDebt : null);

  // "Forward" means the current fiscal year's consensus — the same convention
  // the sell side quotes, and what `forecast.base` already resolves to.
  const fwd = forecast.base || null;
  const over = (num, den) => (isNum(num) && isNum(den) && den > 0 ? num / den : null);

  const peFwd = over(facts.price, fwd?.eps);

  // Buybacks: only computed when the cash flow statement actually carries the
  // line. Treating a missing field as zero would report "no buybacks" for
  // every company whose statements are gated.
  let buybackYield = null;
  if (latestC && latestC.commonStockRepurchased != null && isNum(facts.marketCap) && facts.marketCap > 0) {
    buybackYield = Math.abs(latestC.commonStockRepurchased) / facts.marketCap;
  }
  const shareholderYield = (isNum(buybackYield) || isNum(facts.dividendYield))
    ? (buybackYield ?? 0) + (facts.dividendYield ?? 0)
    : null;

  return {
    ev,
    evToSales:      km.evToSalesTTM ?? over(ev, facts.revenue),
    evToSalesFwd:   over(ev, fwd?.revenue),
    evToEbitda:     km.evToEBITDATTM ?? null,
    evToEbitdaFwd:  over(ev, fwd?.ebitda),
    evToEbit:       over(ev, facts.ebit),
    evToEbitFwd:    over(ev, fwd?.ebit),
    peFwd,
    psFwd:          over(facts.marketCap, fwd?.revenue),
    // PEG wants growth in whole percent, so a 20% grower divides by 20, not 0.2.
    pegNonGaap:     (isNum(peFwd) && isNum(forecast.epsGrowth) && forecast.epsGrowth > 0)
                      ? peFwd / (forecast.epsGrowth * 100) : null,
    priceToCashFlow: r.priceToOperatingCashFlowRatioTTM ?? null,
    earningsYield:  km.earningsYieldTTM ?? (isNum(facts.pe) && facts.pe > 0 ? 1 / facts.pe : null),
    fcfYield:       km.freeCashFlowYieldTTM ?? null,
    grahamNumber:   km.grahamNumberTTM ?? null,
    buybackYield,
    shareholderYield,
  };
}

function deriveGrowth(ds, facts, history) {
  const g = chron(ds.get('growth')).at(-1) || {};
  const inc = facts.statements.income;
  const cash = facts.statements.cash;

  /** Year-on-year change in one statement line, from the annual filings. */
  const yoy = (rows, field) => {
    if (rows.length < 2) return null;
    const cur = rows.at(-1)?.[field], prev = rows.at(-2)?.[field];
    return isNum(cur) && isNum(prev) && prev > 0 ? cur / prev - 1 : null;
  };
  /** Cumulative change over `n` years, matching the vendor's multi-year fields. */
  const over = (rows, field, n) => {
    if (rows.length < n + 1) return null;
    const cur = rows.at(-1)?.[field], back = rows.at(-1 - n)?.[field];
    return isNum(cur) && isNum(back) && back > 0 ? cur / back - 1 : null;
  };
  /** Compound annual rate across `n` fiscal years of the statements. */
  const cagrOver = (rows, field, n) => {
    if (rows.length < n + 1) return null;
    const cur = rows.at(-1)?.[field];
    const back = rows.at(-1 - n)?.[field];
    return isNum(cur) && isNum(back) && back > 0 ? cagr(back, cur, n) : null;
  };
  const fcfOf = (row) => (row && isNum(row.freeCashFlow) ? row.freeCashFlow : null);

  return {
    // The growth feed is preferred where present; the annual statements are
    // the fallback, which is what keeps this working from a snapshot that
    // predates the feed being fetched at all.
    revenueYoy:   g.revenueGrowth        ?? yoy(inc, 'revenue'),
    // Annualised, not cumulative, and on total revenue rather than the
    // vendor's per-share fields. Three rows in one subtopic have to be the
    // same measure over different lengths of run, or the reader is comparing
    // a one-year rate against a three-year total against a per-share figure
    // and none of the three answers the same question.
    revenue3y:    cagrOver(inc, 'revenue', 3),
    revenue5y:    cagrOver(inc, 'revenue', 5),
    ebitda:       g.ebitdaGrowth         ?? yoy(inc, 'ebitda'),
    ebit:         g.ebitgrowth ?? g.operatingIncomeGrowth ?? yoy(inc, 'operatingIncome'),
    eps:          g.epsgrowth            ?? yoy(inc, 'eps'),
    epsDiluted:   g.epsdilutedGrowth     ?? yoy(inc, 'epsDiluted'),
    netIncome:    g.netIncomeGrowth      ?? history.growth1y,
    netIncome5y:  g.fiveYNetIncomeGrowthPerShare ?? over(inc, 'netIncome', 5),
    ocf:          g.operatingCashFlowGrowth ?? yoy(cash, 'operatingCashFlow'),
    fcf:          g.freeCashFlowGrowth   ?? (cash.length >= 2
                    ? (() => {
                        const a = fcfOf(cash.at(-2)), b = fcfOf(cash.at(-1));
                        return isNum(a) && isNum(b) && a > 0 ? b / a - 1 : null;
                      })() : null),
    // Capex is reported as a negative outflow, so compare magnitudes: the
    // question is whether spending rose, not whether the sign flipped.
    capex:        g.growthCapitalExpenditure
                    ?? yoy(cash.map((c) => ({ v: Math.abs(c.capitalExpenditure ?? NaN) })), 'v'),
    rdExpense:    g.rdexpenseGrowth      ?? yoy(inc, 'researchAndDevelopmentExpenses'),
    bookValue:    g.bookValueperShareGrowth ?? bookValueGrowth(ds, facts),
    dps:          g.dividendsPerShareGrowth ?? dpsGrowthFromFeed(ds, 1),
    dividend3y:   g.threeYDividendperShareGrowthPerShare ?? dpsGrowthFromFeed(ds, 3),
  };
}

/** Book value per share year on year, from whichever history feed is present. */
function bookValueGrowth(ds, facts) {
  const rows = chron(ds.get('ratiosHist'));
  const series = rows
    .map((r) => r.bookValuePerShare ?? null)
    .filter(isNum);
  if (series.length >= 2) {
    const [prev, cur] = [series.at(-2), series.at(-1)];
    if (prev > 0) return cur / prev - 1;
  }
  const bal = facts.statements.balance;
  if (bal.length >= 2 && isNum(facts.shares) && facts.shares > 0) {
    const prev = bal.at(-2)?.totalStockholdersEquity, cur = bal.at(-1)?.totalStockholdersEquity;
    if (isNum(prev) && isNum(cur) && prev > 0) return cur / prev - 1;
  }
  return null;
}

/**
 * Dividend-per-share growth over `years`, summed by calendar year from the
 * dividend feed. The most recent year is skipped unless it is complete, so a
 * company three quarters into its year does not look like it halved the payout.
 */
function dpsGrowthFromFeed(ds, years) {
  const rows = arr(ds.get('dividends'))
    .map((d) => ({ year: yearOf(d.date), amount: d.adjDividend ?? d.dividend ?? null }))
    .filter((d) => isNum(d.year) && isNum(d.amount) && d.amount > 0);
  if (!rows.length) return null;

  const byYear = new Map();
  const counts = new Map();
  for (const d of rows) {
    byYear.set(d.year, (byYear.get(d.year) || 0) + d.amount);
    counts.set(d.year, (counts.get(d.year) || 0) + 1);
  }
  const ordered = [...byYear.keys()].sort((a, b) => a - b);
  if (ordered.length < years + 1) return null;

  let last = ordered.at(-1);
  const typical = median(ordered.slice(0, -1).map((y) => counts.get(y)));
  if (isNum(typical) && counts.get(last) < typical) last = ordered.at(-2);

  const base = last - years;
  if (!byYear.has(base) || !byYear.has(last)) return null;
  const from = byYear.get(base);
  return from > 0 ? byYear.get(last) / from - 1 : null;
}

function deriveMomentum(ds, facts, benchmarks, bm) {
  const pts = normalisePrices(ds.get('prices'));
  const rets = computeReturns(pts, { r1m: 30, r3m: 92, r6m: 183, r9m: 274, r1y: 365 });

  const benchOneYear = (raw) => {
    const p = normalisePrices(raw);
    return p.length ? (computeReturns(p, { r1y: 365 }).r1y ?? null) : null;
  };
  const sectorReturn = benchOneYear(benchmarks?.industry);
  const marketReturn = benchOneYear(benchmarks?.market);

  const pt = ds.get('priceTarget') || null;
  const targetPrice = pt?.targetConsensus ?? null;
  const targetUpside = isNum(targetPrice) && isNum(facts.price) && facts.price > 0
    ? targetPrice / facts.price - 1 : null;

  // Analyst mix on a 1-5 scale, so a wall of strong buys reads as 5.
  const gr = ds.get('grades') || null;
  let analystScore = null, analystTotal = 0;
  if (gr) {
    const buckets = [[gr.strongBuy, 5], [gr.buy, 4], [gr.hold, 3], [gr.sell, 2], [gr.strongSell, 1]];
    let weighted = 0;
    for (const [n, w] of buckets) {
      if (isNum(n)) { weighted += n * w; analystTotal += n; }
    }
    if (analystTotal > 0) analystScore = weighted / analystTotal;
  }

  return {
    points: pts,
    r1m: rets.r1m ?? null,
    r3m: rets.r3m ?? null,
    r6m: rets.r6m ?? null,
    r9m: rets.r9m ?? null,
    r1y: rets.r1y ?? null,
    rYtd: ytdReturn(pts),
    sectorReturn,
    marketReturn,
    excessSector: isNum(rets.r1y) && isNum(sectorReturn) ? rets.r1y - sectorReturn : null,
    excessMarket: isNum(rets.r1y) && isNum(marketReturn) ? rets.r1y - marketReturn : null,
    toAvg50:  isNum(facts.price) && isNum(facts.avg50) && facts.avg50 > 0 ? facts.price / facts.avg50 : null,
    toAvg200: isNum(facts.price) && isNum(facts.avg200) && facts.avg200 > 0 ? facts.price / facts.avg200 : null,
    offHigh:  isNum(facts.price) && isNum(facts.yearHigh) && facts.yearHigh > 0 ? 1 - facts.price / facts.yearHigh : null,
    aboveLow: isNum(facts.price) && isNum(facts.yearLow) && facts.yearLow > 0 ? facts.price / facts.yearLow - 1 : null,
    volatility: weeklyVolatility(pts),
    drawdown: maxDrawdown(pts),
    targetPrice,
    targetUpside,
    // A price target is a price, so it says nothing about the dividend. Adding
    // the yield back gives the total return the forecast actually implies,
    // which is the only thing comparable to a cost of equity.
    expectedTotalReturn: isNum(targetUpside) ? targetUpside + (facts.dividendYield ?? 0) : null,
    // CAPM: what holding this particular share ought to earn, given its beta.
    costOfEquity: isNum(facts.beta) && isNum(bm?.riskFreeRate) && isNum(bm?.equityRiskPremium)
      ? bm.riskFreeRate + facts.beta * bm.equityRiskPremium
      : null,
    analystScore,
    analystTotal,
  };
}

/* ==========================================================================
   Peer samples

   The grader falls back to the live peer set wherever the sector table has
   nothing for a metric. Only ratios readable straight off `ratios-ttm` can
   be sampled this way — one request per peer is already what the report
   spends, and re-deriving a peer's cash flow statement is not worth it.
   ========================================================================== */

const PEER_SAMPLE_FIELDS = {
  peGaapTtm: 'priceToEarningsRatioTTM',
  priceToSalesTtm: 'priceToSalesRatioTTM',
  priceToBookTtm: 'priceToBookRatioTTM',
  priceToCashFlowTtm: 'priceToOperatingCashFlowRatioTTM',
  pegGaap: 'priceToEarningsGrowthRatioTTM',
  grossMargin: 'grossProfitMarginTTM',
  ebitdaMargin: 'ebitdaMarginTTM',
  ebitMargin: 'ebitMarginTTM',
  netMargin: 'netProfitMarginTTM',
  assetTurnover: 'assetTurnoverTTM',
  fixedAssetTurnover: 'fixedAssetTurnoverTTM',
  cashPerShare: 'cashPerShareTTM',
  effectiveTaxRate: 'effectiveTaxRateTTM',
  fcfToOcf: 'freeCashFlowOperatingCashFlowRatioTTM',
  currentRatio: 'currentRatioTTM',
  quickRatio: 'quickRatioTTM',
  cashRatio: 'cashRatioTTM',
  debtToEquity: 'debtToEquityRatioTTM',
  debtToAssets: 'debtToAssetsRatioTTM',
  financialLeverage: 'financialLeverageRatioTTM',
  longTermDebtToCapital: 'longTermDebtToCapitalRatioTTM',
  interestCoverage: 'interestCoverageRatioTTM',
  solvencyRatio: 'solvencyRatioTTM',
  debtServiceCoverage: 'debtServiceCoverageRatioTTM',
  bookValuePerShare: 'bookValuePerShareTTM',
  tangibleBookValuePerShare: 'tangibleBookValuePerShareTTM',
  dividendYieldTtm: 'dividendYieldTTM',
};

function buildPeerSamples(peerRatios) {
  const out = {};
  for (const row of Object.values(peerRatios || {})) {
    if (!row) continue;
    for (const [id, field] of Object.entries(PEER_SAMPLE_FIELDS)) {
      const v = row[field];
      if (isNum(v)) (out[id] ??= []).push(v);
    }
  }
  return out;
}


/** Which of the reduced-set metrics one `ratios-ttm` payload can actually fill. */
function usableFields(row) {
  const ids = new Set();
  if (!row) return ids;
  for (const [id, field] of Object.entries(PEER_SAMPLE_FIELDS)) {
    if (isNum(row[field]) && METRICS[id]) ids.add(id);
  }
  return ids;
}

/** Grade one `ratios-ttm` payload over a fixed set of metric ids. */
function scoreOver(row, ids, lookup) {
  if (!row || !ids.size) return { score: null, scoredOn: 0 };
  const grades = [];
  for (const id of ids) {
    const def = METRICS[id];
    const v = row[PEER_SAMPLE_FIELDS[id]];
    if (!isNum(v) || !def) continue;
    const g = lookup.grade(def.dist || id, v, def.better);
    if (isNum(g.grade)) grades.push(g.grade);
  }
  return grades.length
    ? { score: mean(grades), scoredOn: grades.length }
    : { score: null, scoredOn: 0 };
}

/* ==========================================================================
   The lite grader

   A second, much cheaper way into the same grading machinery, for callers
   that hold a handful of feeds for a lot of companies rather than 27 feeds
   for one. The Investment Ideas screens are the only caller.

   The trade is depth for breadth, and it is a real one: the full walk in
   `factors.js` grades 77 ratios off 27 feeds; this grades up to 56 off four.
   What it keeps is the part that makes a score comparable — the same metric
   definitions, the same `better` directions, the same sector distributions,
   the same 0-MAX_SCORE scale. What it loses is most of the evidence. Every
   surface printing one of these is expected to print the ratio count beside
   it.

   `PEER_SAMPLE_FIELDS` above is deliberately left alone. It feeds the peer
   sampler and the Competitor Ranking, and widening it there would quietly
   change a number already on the report.
   ========================================================================== */

/** Metric id -> the factor that owns it, read off the tree rather than typed. */
const FACTOR_OF_METRIC = (() => {
  const out = {};
  for (const f of FACTORS) for (const g of f.groups) for (const id of g.metrics) out[id] = f.key;
  return out;
})();

/**
 * Metric id -> where to read it from, across the four bags a screen can fill.
 *
 * `from` names the bag: `ratios` is `ratios-ttm`, `metrics` is
 * `key-metrics-ttm`, `growth` is the latest `financial-growth` row, and
 * `returns` is computed in the browser from a price series. Anything absent
 * from this table is not graded on this path — which is most of the factor
 * tree, and why the count travels with the score.
 */
const LITE_METRICS = {
  /* ---- valuation ---- */
  peGaapTtm:           { from: 'ratios',  field: 'priceToEarningsRatioTTM' },
  pegGaap:             { from: 'ratios',  field: 'priceToEarningsGrowthRatioTTM' },
  priceToSalesTtm:     { from: 'ratios',  field: 'priceToSalesRatioTTM' },
  priceToBookTtm:      { from: 'ratios',  field: 'priceToBookRatioTTM' },
  priceToCashFlowTtm:  { from: 'ratios',  field: 'priceToOperatingCashFlowRatioTTM' },
  dividendYieldTtm:    { from: 'ratios',  field: 'dividendYieldTTM' },
  earningsYieldTtm:    { from: 'metrics', field: 'earningsYieldTTM' },
  fcfYieldTtm:         { from: 'metrics', field: 'freeCashFlowYieldTTM' },
  evToSalesTtm:        { from: 'metrics', field: 'evToSalesTTM' },
  evToEbitdaTtm:       { from: 'metrics', field: 'evToEBITDATTM' },

  /* ---- profitability ---- */
  grossMargin:             { from: 'ratios',  field: 'grossProfitMarginTTM' },
  ebitdaMargin:            { from: 'ratios',  field: 'ebitdaMarginTTM' },
  ebitMargin:              { from: 'ratios',  field: 'ebitMarginTTM' },
  netMargin:               { from: 'ratios',  field: 'netProfitMarginTTM' },
  assetTurnover:           { from: 'ratios',  field: 'assetTurnoverTTM' },
  fixedAssetTurnover:      { from: 'ratios',  field: 'fixedAssetTurnoverTTM' },
  cashPerShare:            { from: 'ratios',  field: 'cashPerShareTTM' },
  effectiveTaxRate:        { from: 'ratios',  field: 'effectiveTaxRateTTM' },
  fcfToOcf:                { from: 'ratios',  field: 'freeCashFlowOperatingCashFlowRatioTTM' },
  returnOnEquity:          { from: 'metrics', field: 'returnOnEquityTTM' },
  returnOnInvestedCapital: { from: 'metrics', field: 'returnOnInvestedCapitalTTM' },
  returnOnAssets:          { from: 'metrics', field: 'returnOnAssetsTTM' },
  returnOnTangibleAssets:  { from: 'metrics', field: 'returnOnTangibleAssetsTTM' },
  returnOnCapitalEmployed: { from: 'metrics', field: 'returnOnCapitalEmployedTTM' },
  capexToRevenue:          { from: 'metrics', field: 'capexToRevenueTTM' },
  incomeQuality:           { from: 'metrics', field: 'incomeQualityTTM' },
  sbcToRevenue:            { from: 'metrics', field: 'stockBasedCompensationToRevenueTTM' },

  /* ---- health ---- */
  currentRatio:              { from: 'ratios',  field: 'currentRatioTTM' },
  quickRatio:                { from: 'ratios',  field: 'quickRatioTTM' },
  cashRatio:                 { from: 'ratios',  field: 'cashRatioTTM' },
  debtToEquity:              { from: 'ratios',  field: 'debtToEquityRatioTTM' },
  debtToAssets:              { from: 'ratios',  field: 'debtToAssetsRatioTTM' },
  financialLeverage:         { from: 'ratios',  field: 'financialLeverageRatioTTM' },
  longTermDebtToCapital:     { from: 'ratios',  field: 'longTermDebtToCapitalRatioTTM' },
  debtToCapital:             { from: 'ratios',  field: 'debtToCapitalRatioTTM' },
  interestCoverage:          { from: 'ratios',  field: 'interestCoverageRatioTTM' },
  solvencyRatio:             { from: 'ratios',  field: 'solvencyRatioTTM' },
  debtServiceCoverage:       { from: 'ratios',  field: 'debtServiceCoverageRatioTTM' },
  bookValuePerShare:         { from: 'ratios',  field: 'bookValuePerShareTTM' },
  tangibleBookValuePerShare: { from: 'ratios',  field: 'tangibleBookValuePerShareTTM' },
  netDebtToEbitda:           { from: 'metrics', field: 'netDebtToEBITDATTM' },

  /* ---- growth, from the latest `financial-growth` row ---- */
  revenueGrowthYoy: { from: 'growth', field: 'revenueGrowth' },
  ebitdaGrowth:     { from: 'growth', field: 'ebitdaGrowth' },
  ebitGrowth:       { from: 'growth', field: 'ebitgrowth', alt: 'operatingIncomeGrowth' },
  epsGrowth:        { from: 'growth', field: 'epsgrowth' },
  epsDilutedGrowth: { from: 'growth', field: 'epsdilutedGrowth' },
  ocfGrowth:        { from: 'growth', field: 'operatingCashFlowGrowth' },
  fcfGrowth:        { from: 'growth', field: 'freeCashFlowGrowth' },
  rdExpenseGrowth:  { from: 'growth', field: 'rdexpenseGrowth' },
  bookValueGrowth:  { from: 'growth', field: 'bookValueperShareGrowth' },
  dpsGrowth:        { from: 'growth', field: 'dividendsPerShareGrowth' },

  /* ---- momentum, computed here from the price series ---- */
  return1m:      { from: 'returns', field: 'r1m' },
  return3m:      { from: 'returns', field: 'r3m' },
  return6m:      { from: 'returns', field: 'r6m' },
  return9m:      { from: 'returns', field: 'r9m' },
  return1y:      { from: 'returns', field: 'r1y' },
  returnYtd:     { from: 'returns', field: 'ytd' },
  volatility:    { from: 'returns', field: 'volatility' },
  maxDrawdown1y: { from: 'returns', field: 'drawdown' },
};

/**
 * Which bags a factor needs before it can be scored at all.
 *
 * Derived rather than declared, so adding a metric above automatically tells
 * the caller which feed it now has to pay for.
 */
export const LITE_SOURCES = (() => {
  const out = {};
  for (const [id, spec] of Object.entries(LITE_METRICS)) {
    const factor = FACTOR_OF_METRIC[id];
    if (!factor) continue;
    (out[factor] ??= new Set()).add(spec.from);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
})();

/** How many metrics this path can grade per factor, at best. */
export const LITE_DEPTH = (() => {
  const out = {};
  for (const id of Object.keys(LITE_METRICS)) {
    const factor = FACTOR_OF_METRIC[id];
    if (factor) out[factor] = (out[factor] || 0) + 1;
  }
  return out;
})();

/** Returns a price series can answer, in the shape `LITE_METRICS` expects. */
export function returnsFromPrices(raw) {
  const pts = normalisePrices(raw);
  if (pts.length < 2) return null;
  const r = computeReturns(pts, { r1m: 30, r3m: 92, r6m: 183, r9m: 274, r1y: 365 });
  return {
    ...r,
    ytd: ytdReturn(pts),
    volatility: weeklyVolatility(pts),
    drawdown: maxDrawdown(pts),
  };
}

/* ---------- bag builders -------------------------------------------------
   The screens pull a few feeds that need shaping before a rule can read them,
   the same way `returnsFromPrices` shapes a price series. They live here
   rather than in the view for the same reason everything else here does: this
   is the only file that reads a vendor field name.
   ------------------------------------------------------------------------- */

/**
 * Discount to the vendor's own discounted cash flow.
 *
 * Positive is cheap: a fair value of 140 against a price of 100 is a 29%
 * discount. The report never grades this — §8 of the handover, fair values
 * are display only — and a screen is not a grade, so using it as a filter is
 * consistent with that. It is still one vendor's model with one set of
 * assumptions, which is why the ideas that use it say so.
 */
export function dcfFromFeed(row, price) {
  const fair = row?.dcf ?? row?.equityValuePerShare ?? null;
  const now = isNum(price) ? price : (row?.['Stock Price'] ?? null);
  if (!isNum(fair) || fair <= 0 || !isNum(now) || now <= 0) return null;
  return { fairValue: fair, price: now, discount: 1 - now / fair };
}

/**
 * Insider dealing over the last four reported quarters.
 *
 * Summed rather than taken from the newest quarter: a single quarter is often
 * empty, or one vesting event, and the question a screen is asking is about a
 * pattern. `net` is shares acquired less shares disposed.
 *
 * The caveat that travels with every insider number applies here too — most
 * net selling at a large employer is vesting and tax withholding rather than
 * a view — which is why the buying side is the only one any idea screens on.
 */
export function insiderFromStats(rows) {
  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
  if (!list.length) return null;

  const recent = list
    .slice()
    .sort((x, y) => (y.year - x.year) || (y.quarter - x.quarter))
    .slice(0, 4);

  const acquired = recent.reduce((t, r) => t + (r.totalAcquired || 0), 0);
  const disposed = recent.reduce((t, r) => t + (r.totalDisposed || 0), 0);
  return {
    quarters: recent.length,
    acquired,
    disposed,
    net: acquired - disposed,
    ratio: disposed > 0 ? acquired / disposed : (acquired > 0 ? Infinity : null),
  };
}

/**
 * What share of the company is not freely traded.
 *
 * The vendor gives free float as a percentage, so closely held is its
 * complement. It is a proxy for insider and strategic ownership rather than a
 * measure of it — a founder's stake, a family trust and a government holding
 * all land in the same bucket, and the feed does not say which.
 */
export function floatFromFeed(row) {
  if (!row || !isNum(row.freeFloat)) return null;
  const free = row.freeFloat / 100;
  return {
    freeFloat: free,
    closelyHeld: Math.max(0, 1 - free),
    floatShares: row.floatShares ?? null,
    outstanding: row.outstandingShares ?? null,
  };
}

/**
 * The sell side's rating mix, reduced to one number.
 *
 * `grades-consensus` returns a tally — how many analysts say strong buy, buy,
 * hold, sell, strong sell — and a consensus word. `score` puts that tally on
 * the same 0-5 scale the report's own composite uses, which is the only way to
 * rank companies against each other on it.
 *
 * **Putting it on our scale does not make it our rating**, and this is the one
 * thing to be careful about wherever it is printed. A 3.6 here is a hundred
 * analysts averaging out just above Buy; a 3.6 on the composite is a ranking of
 * measurable ratios against a sector. They are different claims about different
 * things and they disagree often. `deriveForecast` computes the same figure for
 * the company report's consensus card — this is the screening path's copy,
 * shaped for a candidate rather than for a dataset.
 *
 * `total` travels with it because a mean of four opinions and a mean of a
 * hundred are not the same measurement, and a screen has to be able to require
 * coverage before it trusts the average.
 */
export function gradesFromFeed(row) {
  if (!row) return null;
  const buckets = [[row.strongBuy, 5], [row.buy, 4], [row.hold, 3], [row.sell, 2], [row.strongSell, 1]];
  let weighted = 0, total = 0, bullish = 0;
  for (const [n, w] of buckets) {
    if (!isNum(n) || n <= 0) continue;
    weighted += n * w;
    total += n;
    if (w >= 4) bullish += n;
  }
  if (total <= 0) return null;
  return {
    score: weighted / total,
    total,
    buyShare: bullish / total,
    consensus: row.consensus || null,
    strongBuy: row.strongBuy ?? 0,
    buy: row.buy ?? 0,
    hold: row.hold ?? 0,
    sell: row.sell ?? 0,
    strongSell: row.strongSell ?? 0,
  };
}

/**
 * Consensus growth from the analyst estimate rows.
 *
 * The median year-on-year step across the window rather than an endpoint
 * CAGR, matching `deriveForecast` — a consensus path often carries one bad
 * year because a different subset of analysts covers each horizon, and an
 * endpoint rate would inherit that error whole.
 */
export function estimatesFromFeed(rows) {
  const list = (Array.isArray(rows) ? rows : [rows])
    .filter((r) => r && r.date)
    .map((r) => ({
      year: yearOf(r.date),
      revenue: r.revenueAvg ?? null,
      eps: r.epsAvg ?? null,
      netIncome: r.netIncomeAvg ?? null,
      analysts: Math.max(r.numAnalystsEps ?? 0, r.numAnalystsRevenue ?? 0) || null,
    }))
    .filter((r) => isNum(r.year))
    .sort((x, y) => x.year - y.year);

  if (list.length < 2) return null;

  const step = (fieldName) => {
    const steps = [];
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1][fieldName];
      const cur = list[i][fieldName];
      if (isNum(prev) && isNum(cur) && prev > 0) steps.push(cur / prev - 1);
    }
    if (steps.length >= 3) return median(steps);
    const first = list[0][fieldName];
    const last = list.at(-1)[fieldName];
    const span = list.at(-1).year - list[0].year;
    return cagr(first, last, span);
  };

  return {
    years: list.length,
    from: list[0].year,
    to: list.at(-1).year,
    analysts: Math.max(...list.map((r) => r.analysts || 0)) || null,
    revenueGrowth: step('revenue'),
    epsGrowth: step('eps'),
    earningsGrowth: step('netIncome'),
  };
}

/**
 * Grade one company per factor, from whatever bags the caller managed to fill.
 *
 * `bags` is `{ ratios, metrics, growth, returns }`, any of which may be null —
 * a company whose growth feed failed scores no growth rather than scoring
 * badly at it. A factor with nothing behind it comes back
 * `{ score: null, scoredOn: 0 }`, and that has to stay distinct from a low
 * score: a screen asking for 4 out of 5 on momentum must drop the company it
 * could not measure, not rank it last.
 *
 * The overall score is the mean of the metric grades rather than of the five
 * factor scores — the same rule `gradeAll` uses, so a factor that filled two
 * metrics does not weigh as much as one that filled fourteen.
 */
export function scoreLite(bags, lookup) {
  const perFactor = {};
  const all = [];

  for (const [id, spec] of Object.entries(LITE_METRICS)) {
    const def = METRICS[id];
    const factor = FACTOR_OF_METRIC[id];
    if (!def || !factor) continue;

    const bag = bags?.[spec.from];
    if (!bag) continue;
    const raw = bag[spec.field] ?? (spec.alt ? bag[spec.alt] : undefined);
    if (!isNum(raw)) continue;

    const g = lookup.grade(def.dist || id, raw, def.better);
    if (!isNum(g.grade)) continue;

    (perFactor[factor] ??= []).push(g.grade);
    all.push(g.grade);
  }

  const factors = {};
  for (const key of FACTOR_KEYS) {
    const grades = perFactor[key] || [];
    factors[key] = { score: grades.length ? mean(grades) : null, scoredOn: grades.length };
  }

  return { score: all.length ? mean(all) : null, scoredOn: all.length, factors };
}

/**
 * The reduced-set score for a single `ratios-ttm` payload.
 *
 * The public form of `scoreOver`, for callers that hold one company's ratios
 * and its sector lookup and want a comparable number — the Investment Ideas
 * screens, which cannot afford the 27 feeds a full `analyse()` costs per
 * company.
 *
 * This is **not** the report's grade. It is the mean of whichever of the 27
 * ratios in `PEER_SAMPLE_FIELDS` that payload can fill, ranked against the
 * company's own sector, and it is the same number the Competitor Ranking
 * table prints. `scoredOn` says how many ratios it was, and every surface
 * showing it is expected to show that too — a score built from four ratios
 * and one built from twenty-two are not comparable, and only the count says
 * which you are looking at.
 */
export function scoreFromRatios(row, lookup) {
  return scoreOver(row, usableFields(row), lookup);
}

/**
 * Grade the peer group and the company on one common set of ratios.
 *
 * The company has a full feed; a peer may have far less, especially from a
 * snapshot. Scoring each on whatever it happens to carry would let a peer
 * known only by its cheap multiples outrank a company measured on everything.
 * So the comparison runs over the intersection — the ratios *every* row can
 * fill — and the table reports how many that was.
 *
 * Peers too sparse to reach `MIN_COMMON` are left out of the intersection so
 * one thin row cannot collapse the basis for everyone; they still appear,
 * ungraded.
 */
const MIN_COMMON = 3;

function scorePeers(list, peerRatios, ownRatios, lookup) {
  const own = usableFields(ownRatios);
  const peerSets = new Map();
  for (const p of list) {
    const ids = usableFields(peerRatios?.[p.symbol]);
    if (ids.size >= MIN_COMMON) peerSets.set(p.symbol, ids);
  }

  let common = new Set(own);
  for (const ids of peerSets.values()) {
    common = new Set([...common].filter((id) => ids.has(id)));
  }
  // Nothing shared: fall back to grading each row on its own coverage, which
  // the "ratios used" column then makes legible.
  const basis = common.size >= MIN_COMMON ? common : null;

  for (const p of list) {
    const row = peerRatios?.[p.symbol];
    const ids = basis && peerSets.has(p.symbol) ? basis : usableFields(row);
    Object.assign(p, ids.size >= MIN_COMMON ? scoreOver(row, ids, lookup) : { score: null, scoredOn: 0 });
  }

  return {
    ...scoreOver(ownRatios, basis || own, lookup),
    common: basis ? basis.size : null,
  };
}

/* ==========================================================================
   Revenue mix and the operating cost stack

   Where the revenue came from, and what it cost to earn — the two shapes the
   filed statements imply but never print as a table of their own.

   Both are annual and both are read off the filed fiscal year, so they line
   up with the Financials tab rather than with the trailing-twelve ratios the
   rest of the report grades on. Neither is graded, ranked or compared to a
   sector: a segment mix is a fact about what a company chose to disclose, not
   a position in a distribution.
   ========================================================================== */

/** Segments drawn as a band of their own. The chart palette carries six. */
const MAX_SEGMENTS = 6;

/** Fiscal years a mix or a cost stack is charted over. */
const MIX_YEARS = 6;

/**
 * The two segmentation feeds, normalised into the same shape.
 *
 * Segment names are the company's own words, taken verbatim: "Greater China
 * Segment", "Wearables, Home and Accessories". Tidying them would be this
 * file inventing a taxonomy the filing does not have.
 */
function deriveSegments(ds) {
  return {
    product: segmentSeries(ds.get('segProduct')),
    geography: segmentSeries(ds.get('segGeography')),
  };
}

/**
 * One segmentation feed as a chartable series plus a readable latest year.
 *
 * Two things make this more than a reshape:
 *
 * - **The names change.** A company renames, merges and drops segments, and
 *   the feed reports whatever the filing said that year. The band order comes
 *   from the newest year, with anything only older years reported appended —
 *   so a discontinued segment still charts in the years it existed instead of
 *   leaving those years short of their own total.
 * - **There can be more segments than colours.** Past six the tail folds into
 *   "Other" — except where the tail is a single segment, since folding one
 *   thing hides a name to save no space.
 *
 * The folding is for the chart alone. `latest.parts` stays unfolded, because
 * the rows under the chart are what someone came to look a segment up in.
 */
function segmentSeries(raw) {
  const filed = chron(raw).map((r) => {
    const parts = Object.entries(r && r.data && typeof r.data === 'object' ? r.data : {})
      .filter(([, v]) => isNum(v))
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    return {
      year: yearOf(r.date) ?? (Number.isFinite(+r.fiscalYear) ? +r.fiscalYear : null),
      date: r.date,
      parts,
      total: parts.reduce((t, p) => t + p.value, 0),
    };
  }).filter((r) => r.parts.length);

  if (!filed.length) {
    return { available: false, names: [], rows: [], latest: null, foldedInto: null, span: '' };
  }

  const rows = filed.slice(-MIX_YEARS);
  const latest = rows.at(-1);
  const prev = new Map((rows.at(-2)?.parts || []).map((p) => [p.name, p.value]));

  const ranked = latest.parts.map((p) => p.name);
  for (const r of rows) for (const p of r.parts) if (!ranked.includes(p.name)) ranked.push(p.name);

  // The chart is capped at six years so the bars stay readable; the table
  // under it is not, because a table is scanned rather than looked at and the
  // year a segment first appeared is exactly the sort of thing it is scanned
  // for. Its own name order is built the same way — newest year first, then
  // anything only the older years reported.
  const allNames = latest.parts.map((p) => p.name);
  for (const r of [...filed].reverse()) {
    for (const p of r.parts) if (!allNames.includes(p.name)) allNames.push(p.name);
  }

  const named = ranked.length <= MAX_SEGMENTS + 1 ? ranked : ranked.slice(0, MAX_SEGMENTS);
  const folded = ranked.filter((n) => !named.includes(n));
  // Plenty of companies file a segment of their own called "Other", and a
  // band of that name holding the fold would silently overwrite it.
  const rest = folded.length
    ? (named.includes('Other') ? 'Other segments' : 'Other')
    : null;

  return {
    available: true,
    names: rest ? [...named, rest] : named,
    rows: rows.map((r) => {
      const by = new Map(r.parts.map((p) => [p.name, p.value]));
      const values = Object.fromEntries(named.map((n) => [n, by.has(n) ? by.get(n) : null]));
      if (rest) {
        const tail = folded.map((n) => by.get(n)).filter(isNum);
        values[rest] = tail.length ? tail.reduce((x, y) => x + y, 0) : null;
      }
      return { year: r.year, date: r.date, total: r.total, values };
    }),
    /** the band holding everything past the palette, or null when nothing folded */
    foldedInto: rest,
    latest: {
      year: latest.year,
      date: latest.date,
      total: latest.total,
      parts: latest.parts.map((p) => ({
        name: p.name,
        value: p.value,
        share: latest.total > 0 ? p.value / latest.total : null,
        change: prev.has(p.name) ? yoy(p.value, prev.get(p.name)) : null,
      })),
    },
    span: rows.length > 1 ? `${rows[0].year}–${latest.year}` : String(latest.year ?? ''),

    /** every filed year and every name it reported, newest first, unfolded */
    all: {
      names: allNames,
      years: [...filed].reverse().map((r) => ({
        year: r.year,
        date: r.date,
        total: r.total,
        values: Object.fromEntries(r.parts.map((p) => [p.name, p.value])),
      })),
      span: filed.length > 1
        ? `${filed[0].year}–${filed.at(-1).year}` : String(latest.year ?? ''),
    },
  };
}

/**
 * Owner earnings, summed to a trailing twelve months.
 *
 * Buffett's measure: reported earnings plus non-cash charges, less the
 * capital spending the business needs to hold its position. FMP publishes it
 * per quarter, so four of them make the figure the rest of the report is on.
 * Fewer than four is not a partial answer, it is a different period, so the
 * card goes unavailable rather than printing three quarters as a year.
 *
 * The vendor's `maintenanceCapex` and `growthCapex` are deliberately not
 * carried through. Their sign flips between quarters on the same symbol,
 * which means a sum of them is not a number anybody should act on — and a
 * split that cannot be added up is worse than no split.
 */
function deriveOwnerEarnings(ds, facts) {
  const rows = arr(ds.get('ownerEarnings'))
    .filter((r) => r && isNum(r.ownersEarnings))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);

  if (rows.length < 4) return { available: false, ttm: null, perShare: null, yield: null, span: '' };

  const total = rows.reduce((t, r) => t + r.ownersEarnings, 0);
  const perShare = rows.every((r) => isNum(r.ownersEarningsPerShare))
    ? rows.reduce((t, r) => t + r.ownersEarningsPerShare, 0)
    : (isNum(facts.shares) && facts.shares > 0 ? total / facts.shares : null);

  const oldest = rows.at(-1);
  return {
    available: true,
    ttm: total,
    perShare,
    yield: facts.marketCap > 0 ? total / facts.marketCap : null,
    span: `${oldest.fiscalYear} ${oldest.period} – ${rows[0].fiscalYear} ${rows[0].period}`,
  };
}

/**
 * The operating expense lines, per filed year.
 *
 * The feed carries a running total (`operatingExpenses`) for most companies
 * and not for all, so where it is missing the income statement's own identity
 * gives it back: operating income is gross profit less operating expenses,
 * and both of those come back on every row. That is what fills this in on the
 * bundled snapshot, whose income rows carry neither the total nor the
 * selling / administrative split.
 *
 * "Other operating expenses" is a residual rather than a filed line — the
 * total less the lines that are named — which is the only way to make the
 * breakdown add up to the total the statement prints. A residual under half a
 * percent of that total is the vendor's rounding rather than an expense, and
 * is dropped instead of charted as a sliver.
 */
function deriveOpex(facts) {
  const rows = facts.statements.income.map((r) => {
    const n = (v) => (isNum(v) ? v : null);
    const sm = n(r.sellingAndMarketingExpenses);
    const ga = n(r.generalAndAdministrativeExpenses);
    const rnd = n(r.researchAndDevelopmentExpenses);
    const sga = n(r.sellingGeneralAndAdministrativeExpenses)
      ?? (isNum(sm) && isNum(ga) ? sm + ga : null);

    const total = n(r.operatingExpenses)
      ?? (isNum(r.grossProfit) && isNum(r.operatingIncome) ? r.grossProfit - r.operatingIncome : null);

    const named = [rnd, sga].filter(isNum);
    const rest = isNum(total) && named.length
      ? total - named.reduce((x, y) => x + y, 0) : null;

    return {
      year: yearOf(r.date),
      date: r.date,
      revenue: n(r.revenue),
      costOfRevenue: n(r.costOfRevenue),
      rnd, sm, ga, sga, total,
      other: isNum(rest) && Math.abs(rest) >= Math.abs(total) * 0.005 ? rest : null,
      dna: n(r.depreciationAndAmortization),
      costAndExpenses: n(r.costAndExpenses),
      operatingIncome: n(r.operatingIncome),
    };
  });

  const charted = rows.slice(-MIX_YEARS);
  const latest = rows.at(-1) || null;

  return {
    available: rows.some((r) => isNum(r.total)),
    rows: charted,
    latest,
    /** true when the feed splits selling from administrative, as not every plan does */
    splitReported: isNum(latest?.sm) && isNum(latest?.ga),
    span: charted.length > 1 ? `${charted[0].year}–${charted.at(-1).year}` : String(latest?.year ?? ''),
  };
}

/* ==========================================================================
   The per-year series

   One row per filed fiscal year with every cross-statement ratio the charts
   draw: returns on capital, the expense burden, the cost of capital, the
   share count, the headcount. The three statements each answer part of each
   of these and none answers any of them alone, which is why this is a join
   rather than another accessor.

   Every field follows the same rule: take the vendor's own figure where the
   annual key-metrics feed carries it, and fall back to the identity the
   statements imply where it does not. That is what keeps these charts drawn
   on a narrow plan and on the bundled snapshot, both of which return a
   fraction of the metrics feed.
   ========================================================================== */

/** Fiscal years the performance charts run over. */
const SERIES_YEARS = 11;

function deriveSeries(ds, facts, bm) {
  const income = facts.statements.income;
  const balance = new Map(facts.statements.balance.map((r) => [yearOf(r.date), r]));
  const cash = new Map(facts.statements.cash.map((r) => [yearOf(r.date), r]));
  const metrics = new Map(chron(ds.get('metricsHist')).map((r) => [yearOf(r.date), r]));
  const ratios = new Map(chron(ds.get('ratiosHist')).map((r) => [yearOf(r.date), r]));

  const n = (v) => (isNum(v) ? v : null);
  const over = (a, b) => (isNum(a) && isNum(b) && b > 0 ? a / b : null);

  const rows = income.map((inc) => {
    const year = yearOf(inc.date);
    const b = balance.get(year) || {};
    const c = cash.get(year) || {};
    const km = metrics.get(year) || {};
    const r = ratios.get(year) || {};

    const revenue = n(inc.revenue);
    const ebit = n(inc.operatingIncome);
    const equity = n(b.totalStockholdersEquity);
    const debt = n(b.totalDebt);
    const ocf = n(c.operatingCashFlow);
    const fcf = n(c.freeCashFlow);
    const capex = isNum(c.capitalExpenditure) ? Math.abs(c.capitalExpenditure) : null;

    // Invested capital: the vendor's where it has one, otherwise the textbook
    // debt-plus-equity. They differ — the vendor nets off cash and some
    // operating liabilities — so a chart that mixed the two between years
    // would show a step nobody took.
    const invested = n(km.investedCapital)
      ?? (isNum(debt) && isNum(equity) ? debt + equity : null);
    const taxRate = over(n(inc.incomeTaxExpense), n(inc.incomeBeforeTax))
      ?? (isNum(km.taxBurden) ? 1 - km.taxBurden : null);
    const nopat = isNum(ebit) && isNum(taxRate) ? ebit * (1 - taxRate) : ebit;

    // Cost of debt from what the company actually paid on what it actually
    // owes. Zero is not an answer: plenty of filers report no interest line
    // at all, and taking that as free borrowing drags the whole weighted cost
    // toward nothing — which is how a company with more debt than equity ends
    // up looking like it funds itself for 3%.
    const paid = isNum(inc.interestExpense) ? Math.abs(inc.interestExpense) : null;
    const rd = over(paid, debt);
    const costOfDebt = isNum(rd) && rd > 0 ? rd : null;

    return {
      year,
      date: inc.date,
      revenue,
      netIncome: n(inc.netIncome),
      grossProfit: n(inc.grossProfit),
      ebit,
      ebitda: n(inc.ebitda),
      eps: n(inc.epsDiluted ?? inc.eps),
      shares: n(inc.weightedAverageShsOutDil),
      rnd: n(inc.researchAndDevelopmentExpenses),
      equity, debt, invested, taxRate, costOfDebt,
      assets: n(b.totalAssets),
      marketCap: n(km.marketCap),
      currentLiabilities: n(b.totalCurrentLiabilities),
      ocf, fcf, capex,
      dividends: isNum(c.commonDividendsPaid ?? c.netDividendsPaid)
        ? Math.abs(c.commonDividendsPaid ?? c.netDividendsPaid) : null,
      buybacks: isNum(c.commonStockRepurchased) ? Math.abs(c.commonStockRepurchased) : null,
      // Stock compensation is on neither statement this app fetches in a form
      // it can total, so this is the metrics feed's ratio turned back into an
      // amount. Absent on a plan that gates that feed, which the chart says.
      sbc: isNum(km.stockBasedCompensationToRevenue) && isNum(revenue)
        ? km.stockBasedCompensationToRevenue * revenue : null,

      grossMargin: over(n(inc.grossProfit), revenue),
      operatingMargin: over(ebit, revenue),
      netMargin: over(n(inc.netIncome), revenue),

      roe: n(km.returnOnEquity) ?? over(n(inc.netIncome), equity),
      roa: n(km.returnOnAssets) ?? over(n(inc.netIncome), n(b.totalAssets)),
      roic: n(km.returnOnInvestedCapital) ?? over(nopat, invested),
      roce: n(km.returnOnCapitalEmployed)
        ?? over(ebit, isNum(b.totalAssets) && isNum(b.totalCurrentLiabilities)
          ? b.totalAssets - b.totalCurrentLiabilities : null),

      capexToOcf: n(km.capexToOperatingCashFlow) ?? over(capex, ocf),
      rndToOcf: over(n(inc.researchAndDevelopmentExpenses), ocf),
      sbcToFcf: over(isNum(km.stockBasedCompensationToRevenue) && isNum(revenue)
        ? km.stockBasedCompensationToRevenue * revenue : null, fcf),

      debtToEquity: n(r.debtToEquityRatio) ?? over(debt, equity),
    };
  });

  // The weighted average cost of capital, per year.
  //
  // The equity leg is CAPM on today's beta and today's rates, because neither
  // is published per historical year — so this is "what this company's mix
  // would have cost at today's prices", not what it cost at the time. The
  // mix, the tax rate and the cost of debt are that year's own. The chart
  // says as much: it is a bar to clear, not a measurement.
  const costOfEquity = isNum(facts.beta)
    ? bm.riskFreeRate + facts.beta * bm.equityRiskPremium
    : bm.riskFreeRate + bm.equityRiskPremium;

  const charted = rows.slice(-SERIES_YEARS);

  // Weight the two legs by what the equity is worth, not by what it is
  // carried at. A company that has bought back more stock than it has
  // retained profit has almost no book equity and is still overwhelmingly
  // equity-funded — book weights would hand its cost of capital to the debt
  // leg and report a hurdle a third of the real one.
  //
  // All-or-nothing across the charted years: a chart that switched basis
  // half way along would show a step the company never took. Where the
  // metrics feed carries no market capitalisation the whole run falls back
  // to book equity, and `waccBasis` says so on the card.
  const marketWeighted = charted.length > 0 && charted.every((r) => r.marketCap > 0);

  for (const row of charted) {
    const e = marketWeighted ? row.marketCap : Math.max(row.equity ?? 0, 0);
    const d = isNum(row.debt) ? row.debt : 0;
    const total = (isNum(e) ? e : 0) + d;
    if (!(total > 0)) { row.wacc = null; row.spread = null; continue; }
    // No observable cost of debt falls back to the risk-free rate: the
    // cheapest anything can be borrowed at, so the hurdle is understated
    // rather than invented.
    const rd = isNum(row.costOfDebt) ? row.costOfDebt : bm.riskFreeRate;
    const tax = isNum(row.taxRate) ? clamp(row.taxRate, 0, 0.5) : 0.21;
    row.wacc = (e / total) * costOfEquity + (d / total) * rd * (1 - tax);
    row.spread = isNum(row.roic) ? row.roic - row.wacc : null;
  }

  return {
    available: rows.length > 0,
    rows: charted,
    latest: charted.at(-1) || null,
    costOfEquity,
    /** 'market' when the equity leg is market capitalisation, else 'book' */
    waccBasis: marketWeighted ? 'market' : 'book',
    span: charted.length > 1 ? `${charted[0].year}–${charted.at(-1).year}` : String(rows.at(-1)?.year ?? ''),
  };
}

/**
 * Headcount as each annual filing reported it, oldest first.
 *
 * A separate feed rather than a field on the profile, because the profile
 * carries only today's number and the interesting thing about a headcount is
 * its slope — and because revenue per employee is only meaningful when the
 * employee count is the one from the same year as the revenue.
 */
function deriveEmployees(ds, series) {
  const byYear = new Map();
  for (const r of arr(ds.get('employees'))) {
    const y = yearOf(r?.periodOfReport || r?.filingDate);
    if (isNum(y) && isNum(r.employeeCount)) byYear.set(y, r.employeeCount);
  }

  const rows = series.rows
    .map((r) => {
      const count = byYear.get(r.year) ?? null;
      return {
        year: r.year,
        count,
        revenuePerHead: count > 0 && isNum(r.revenue) ? r.revenue / count : null,
        profitPerHead: count > 0 && isNum(r.netIncome) ? r.netIncome / count : null,
        fcfPerHead: count > 0 && isNum(r.fcf) ? r.fcf / count : null,
      };
    })
    .filter((r) => isNum(r.count));

  return {
    available: rows.length > 0,
    rows,
    latest: rows.at(-1) || null,
    span: rows.length > 1 ? `${rows[0].year}–${rows.at(-1).year}` : String(rows.at(-1)?.year ?? ''),
  };
}

/* ==========================================================================
   What went back to shareholders

   Dividends and buybacks are one policy with two instruments, and a report
   that shows only the first understates by a factor of four at a company like
   this one. So every figure here is computed twice — once for the dividend
   alone, once for the whole of what was returned — and the cards say which
   they are printing.

   Buybacks are cash spent, not shares retired. A company that buys back
   exactly as much stock as it issues to staff has a large buyback yield and
   an unchanged share count, and the share-count chart is what tells the
   reader which of those they are looking at.
   ========================================================================== */

function deriveShareholder(series, facts) {
  const rows = series.rows.map((r) => {
    const div = isNum(r.dividends) && r.dividends > 0 ? r.dividends : null;
    const buy = isNum(r.buybacks) && r.buybacks > 0 ? r.buybacks : null;
    const returned = isNum(div) || isNum(buy) ? (div ?? 0) + (buy ?? 0) : null;
    const of = (part, whole) => (isNum(part) && isNum(whole) && whole > 0 ? part / whole : null);

    return {
      year: r.year,
      date: r.date,
      dividends: div,
      buybacks: buy,
      returned,
      // Against the market capitalisation of the year that paid it, not
      // today's — a yield on a price the buyer could actually have paid.
      dividendYield: of(div, r.marketCap),
      buybackYield: of(buy, r.marketCap),
      shareholderYield: of(returned, r.marketCap),
      dividendEarningsPayout: of(div, r.netIncome),
      dividendFcfPayout: of(div, r.fcf),
      shareholderEarningsPayout: of(returned, r.netIncome),
      shareholderFcfPayout: of(returned, r.fcf),
    };
  });

  const total = (get) => {
    const xs = rows.map(get).filter(isNum);
    return xs.length ? xs.reduce((x, y) => x + y, 0) : null;
  };
  const stat = (get) => {
    const xs = rows.map(get).filter(isNum);
    if (!xs.length) return { median: null, high: null, low: null };
    return { median: median(xs), high: Math.max(...xs), low: Math.min(...xs) };
  };

  const last = rows.at(-1) || null;
  return {
    available: rows.some((r) => isNum(r.returned)),
    rows,
    latest: last,
    lifetimeDividends: total((r) => r.dividends),
    lifetimeBuybacks: total((r) => r.buybacks),
    lifetimeReturned: total((r) => r.returned),
    yieldStat: stat((r) => r.shareholderYield),
    span: rows.length > 1 ? `${rows[0].year}–${rows.at(-1).year}` : String(last?.year ?? ''),
  };
}

/**
 * The dividend yield, day by day, over whatever price history was fetched.
 *
 * A yield is a dividend over a price, and only the price moves daily — so
 * this is the trailing twelve months of declared dividends at each date
 * divided by the close on that date. The steps in the line are the quarters
 * dropping in and out of the trailing window; the slopes between them are the
 * share price.
 *
 * Deliberately not the vendor's own yield series, which does not exist: this
 * is the only way to see whether today's yield is high or low *for this
 * company*, which is the question a single current yield cannot answer.
 */
function deriveYieldHistory(ds, dividends) {
  const YEAR_MS = 365 * 24 * 3600 * 1000;

  const prices = chron(ds.get('prices')).filter((p) => isNum(p.price) && p.price > 0);
  const paid = arr(dividends.rows)
    .map((d) => ({ at: parseDateMs(d.date), amount: d.adjDividend ?? d.dividend }))
    .filter((d) => isNum(d.at) && isNum(d.amount) && d.amount > 0)
    .sort((a, b) => a.at - b.at);

  if (prices.length < 20 || !paid.length) {
    return { available: false, points: [], median: null, high: null, low: null, span: '' };
  }

  const points = [];
  for (const p of prices) {
    const at = parseDateMs(p.date);
    if (!isNum(at)) continue;
    let ttm = 0;
    for (const d of paid) {
      if (d.at > at) break;
      if (d.at > at - YEAR_MS) ttm += d.amount;
    }
    if (ttm > 0) points.push({ date: p.date, value: ttm / p.price });
  }

  if (points.length < 20) {
    return { available: false, points: [], median: null, high: null, low: null, span: '' };
  }

  const vals = points.map((x) => x.value);
  return {
    available: true,
    points,
    median: median(vals),
    high: Math.max(...vals),
    low: Math.min(...vals),
    current: vals.at(-1),
    span: `${fmtDate(points[0].date)} – ${fmtDate(points.at(-1).date)}`,
  };
}

/** Milliseconds from a date-ish value, or null. */
function parseDateMs(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * The vendor's own scorecard, one to five per test.
 *
 * Not the report's grade and not related to it: these are FMP's, computed
 * from a fixed rule per ratio rather than from a sector distribution, and
 * they are here because a reader comparing the two should be able to see
 * both rather than wonder which one the letter at the top came from.
 */
function deriveRatings(ds) {
  const r = ds.get('ratings');
  if (!r) return { available: false, rating: null, scores: [] };

  const scores = [
    ['Overall', r.overallScore, 'FMP’s own composite of the six below.'],
    ['Discounted cash flow', r.discountedCashFlowScore, 'Price against the vendor’s DCF value.'],
    ['Return on equity', r.returnOnEquityScore],
    ['Return on assets', r.returnOnAssetsScore],
    ['Debt to equity', r.debtToEquityScore, 'Scored low for a company carrying more debt than equity, '
      + 'which a buyback-heavy balance sheet will be whatever its cash position.'],
    ['Price to earnings', r.priceToEarningsScore],
    ['Price to book', r.priceToBookScore, 'Scored low for almost any asset-light business, where book '
      + 'value is a small number that says little about what the company is worth.'],
  ]
    .filter(([, v]) => isNum(v))
    .map(([label, value, note]) => ({ label, value, note: note || '' }));

  return { available: scores.length > 0, rating: r.rating || null, scores };
}

/**
 * Reported quarters against what the street expected.
 *
 * Only quarters with an actual: a row with an estimate and no actual is the
 * next report, and drawing it as a bar of zero would read as a miss.
 *
 * The quarter label is the calendar quarter the results were *announced* in,
 * not the fiscal quarter they cover — the earnings feed carries no fiscal
 * period, and inferring one from a date is guesswork for any company whose
 * year does not end in December.
 */
function deriveSurprises(ds) {
  const rows = arr(ds.get('earnings'))
    .filter((r) => r && r.date && isNum(r.epsActual))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((r) => {
      const d = new Date(r.date);
      const surprise = (actual, est) => (isNum(actual) && isNum(est) && est !== 0
        ? actual / Math.abs(est) - 1 : null);
      return {
        date: r.date,
        label: `Q${Math.floor(d.getUTCMonth() / 3) + 1} ’${String(d.getUTCFullYear()).slice(2)}`,
        eps: r.epsActual,
        epsEstimate: isNum(r.epsEstimated) ? r.epsEstimated : null,
        epsSurprise: surprise(r.epsActual, r.epsEstimated),
        revenue: isNum(r.revenueActual) ? r.revenueActual : null,
        revenueEstimate: isNum(r.revenueEstimated) ? r.revenueEstimated : null,
        revenueSurprise: surprise(r.revenueActual, r.revenueEstimated),
      };
    });

  const scored = rows.filter((r) => isNum(r.epsSurprise));
  const beats = scored.filter((r) => r.epsSurprise >= 0).length;

  return {
    available: rows.length > 0,
    rows,
    scored: scored.length,
    beats,
    misses: scored.length - beats,
    beatRate: scored.length ? beats / scored.length : null,
  };
}

/**
 * The quarters a transcript exists for, newest first.
 *
 * The index only. The text of one is a request of its own, made when a reader
 * opens it, because a company has eighty of them and each is a novella.
 */
function deriveTranscripts(ds) {
  const rows = arr(ds.get('transcriptDates'))
    .map((r) => ({
      year: isNum(+r?.fiscalYear) ? +r.fiscalYear : null,
      quarter: isNum(+r?.quarter) ? +r.quarter : null,
      date: r?.date || null,
    }))
    .filter((r) => isNum(r.year) && isNum(r.quarter) && r.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return { available: rows.length > 0, rows };
}

/* ==========================================================================
   News

   Two feeds, kept apart. `news/stock` is coverage — what other people wrote
   about the company. `news/press-releases` is the company's own words. They
   are never merged into one stream, because the difference between "Reuters
   reports margins are under pressure" and "the company announces a record
   quarter" is most of what a reader is trying to judge, and a merged list
   with a small publisher label under each headline loses it.

   Nothing here is scored, ranked or sentiment-tagged. The vendor supplies no
   sentiment and this app runs no model, so the only honest ordering is the
   one the publisher gave it: newest first.
   ========================================================================== */

/** Trim a vendor snippet to a readable length without cutting mid-word. */
function clip(text, max = 320) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = cut.lastIndexOf(' ');
  return `${cut.slice(0, stop > max * 0.6 ? stop : max)}…`;
}

/**
 * One feed's rows, normalised.
 *
 * FMP spells the publisher differently between the two endpoints — the news
 * feed carries `publisher` and `site`, the press-release feed only `title`
 * and `text` with the company as the implied source — so both spellings are
 * read and the company name is the fallback.
 */
function newsRows(raw, { kind, fallbackSource }) {
  return arr(raw)
    .map((r) => ({
      kind,
      date: r?.publishedDate || r?.date || null,
      title: String(r?.title || '').trim(),
      text: clip(r?.text || r?.content || ''),
      url: r?.url || null,
      // `site` is the domain, `publisher` the masthead. The masthead is the
      // better label and the domain is the reliable one, so it is the
      // fallback rather than the other way round.
      source: r?.publisher || r?.site || fallbackSource || '',
      site: r?.site || null,
      image: r?.image || null,
      symbol: r?.symbol || null,
    }))
    .filter((r) => r.title && r.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function deriveNews(ds, facts) {
  const articles = newsRows(ds.get('news'), { kind: 'article' });
  const releases = newsRows(ds.get('pressReleases'), { kind: 'release', fallbackSource: facts.name });

  // Who is covering it, and how much. A count per masthead is the only
  // measure of attention this data supports — there is no readership figure
  // and no sentiment, so anything richer would be invented.
  const tally = new Map();
  for (const r of articles) {
    if (!r.source) continue;
    const cur = tally.get(r.source) || { source: r.source, site: r.site, count: 0, latest: r.date };
    cur.count += 1;
    if (new Date(r.date) > new Date(cur.latest)) cur.latest = r.date;
    tally.set(r.source, cur);
  }
  const publishers = [...tally.values()].sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));

  const newest = articles[0]?.date || releases[0]?.date || null;
  const oldest = articles.at(-1)?.date || null;
  const spanDays = (newest && oldest)
    ? Math.max(1, Math.round((new Date(newest) - new Date(oldest)) / 864e5))
    : null;

  return {
    available: articles.length > 0 || releases.length > 0,
    articles,
    releases,
    publishers,
    newest,
    oldest,
    spanDays,
    /** Articles a day across the window — the only "how loud is this" figure here. */
    perDay: (spanDays && articles.length) ? articles.length / spanDays : null,
  };
}

/* ==========================================================================
   Rewards & risks

   Pulled straight off the graded metrics: what this company does best, and
   what it does worst, ranked by how far from the sector median each sits.
   ========================================================================== */

function deriveRewards(scores) {
  const all = [];
  for (const key of FACTOR_KEYS) {
    for (const g of scores[key].groups) {
      for (const m of g.metrics) {
        if (m.state === 'ok' && isNum(m.grade) && m.explanation) all.push(m);
      }
    }
  }

  const byStrength = [...all].sort((a, b) => b.grade - a.grade);
  const rewards = byStrength.filter((m) => m.grade >= 3.75).slice(0, 5).map((m) => m.explanation);
  const risks = [...byStrength].reverse().filter((m) => m.grade <= 1.5).slice(0, 5).map((m) => m.explanation);

  return { rewards, risks };
}

/* ==========================================================================
   Entry point
   ========================================================================== */

export function analyse(ds, { peerRatios = null, peerGrowth = null, sectorStats = null, benchmarks = null } = {}) {
  const bm = loadBenchmarks();

  const facts = deriveFacts(ds, bm);
  const forecast = deriveForecast(ds, facts);
  const history = deriveHistory(ds, facts);
  const segments = deriveSegments(ds);
  const opex = deriveOpex(facts);
  const ownerEarnings = deriveOwnerEarnings(ds, facts);
  const series = deriveSeries(ds, facts, bm);
  const employees = deriveEmployees(ds, series);
  const shareholder = deriveShareholder(series, facts);
  const ratings = deriveRatings(ds);
  const surprises = deriveSurprises(ds);
  const transcripts = deriveTranscripts(ds);
  const news = deriveNews(ds, facts);
  const dividends = deriveDividends(ds);
  // After `dividends`, which it reads: the yield is recomputed at every close
  // from the payments that had been declared by that date.
  const yieldHistory = deriveYieldHistory(ds, dividends);
  const execs = deriveExecs(ds, facts, bm, history);
  const insiders = deriveInsiders(ds);
  const insiderMarkers = deriveInsiderMarkers(ds);
  const quarter = deriveQuarter(ds);
  const peers = derivePeers(ds, facts, bm);

  // Peer P/E ratios are fetched separately (one request per peer) and folded
  // in here so the peer comparison can use live numbers.
  if (peerRatios) {
    for (const p of peers.peers) {
      const pr = peerRatios[p.symbol];
      if (pr && isNum(pr.priceToEarningsRatioTTM) && pr.priceToEarningsRatioTTM > 0) p.pe = pr.priceToEarningsRatioTTM;
    }
  }
  peers.peerPe = mean(peers.peers.map((p) => p.pe).filter((v) => isNum(v) && v > 0 && v < 300));

  const val = deriveValuation(ds, facts, forecast);
  const growth = deriveGrowth(ds, facts, history);
  const momentum = deriveMomentum(ds, facts, benchmarks, bm);

  const dcfRow = ds.get('dcfLevered') || ds.get('dcf');
  const fairValue = dcfRow ? (dcfRow.dcf ?? dcfRow.equityValuePerShare ?? null) : null;

  const lookup = sectorLookup(sectorStats, facts.sector, buildPeerSamples(peerRatios));
  peers.self = scorePeers(peers.peers, peerRatios, ds.get('ratiosTtm'), lookup);

  const context = {
    ds, bm, facts, forecast, history, dividends, execs, insiders, quarter, peers, val, growth,
    momentum, lookup, segments, opex, ownerEarnings, series, employees,
    shareholder, yieldHistory, ratings, surprises, transcripts, news, insiderMarkers,
    // Raw peer ratios, kept whole rather than only folded into `peers`. The
    // valuation models build a peer-median target multiple from them, which
    // needs every field on the row, not just the P/E the peer table shows.
    peerRatios,
    /** Latest annual growth row per peer, for the "vs peers" comparisons. */
    peerGrowth,
    /* The sector and market benchmark price series, as handed in. Kept on the
       result rather than only passed to `deriveMomentum`, because the Alpha
       Signal tab needs the same two series for its relative-strength reading
       and a tab is only ever handed `(a, nav)`. Exposing what was already
       fetched is cheaper than a second pair of requests, and nothing that
       read this object before can see a difference. */
    benchmarks,
    fairValue,
    discount: (isNum(fairValue) && isNum(facts.price) && fairValue > 0) ? 1 - facts.price / fairValue : null,
    fairPe: fairPe(forecast.epsGrowth ?? forecast.earningsGrowth, bm),
  };

  const scores = gradeAll(context, lookup);
  const { rewards, risks } = deriveRewards(scores);

  return {
    ...context,
    scores,
    rewards, risks,
    sectorTable: {
      available: lookup.available,
      quality: lookup.quality,
      generatedAt: lookup.generatedAt,
      count: lookup.count,
      /** histogram of overall scores across the sector, for the distribution chart */
      overall: lookup.overall,
    },
    /** headline sentence under the company name */
    verdict: verdictLine(scores, facts),
  };
}

function verdictLine(scores, facts) {
  const named = FACTOR_KEYS
    .map((k) => ({ title: scores[k].title, score: scores[k].score }))
    .filter((f) => isNum(f.score));
  if (!named.length) return 'Not enough data to grade this company.';

  const strong = named.filter((f) => f.score >= 3.75).sort((a, b) => b.score - a.score);
  const weak = named.filter((f) => f.score <= 1.65).sort((a, b) => a.score - b.score);
  const lower = (s) => s.toLowerCase();

  if (strong.length && weak.length) {
    return `Strong on ${lower(strong[0].title)}, weak on ${lower(weak[0].title)}.`;
  }
  if (strong.length >= 2) return `Strong on ${lower(strong[0].title)} and ${lower(strong[1].title)}.`;
  if (strong.length) return `Strongest on ${lower(strong[0].title)}.`;
  if (weak.length) return `Held back by ${lower(weak[0].title)}.`;
  return `Middling across all ${named.length} factors relative to its sector.`;
}
