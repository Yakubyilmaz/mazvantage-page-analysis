/* ==========================================================================
   Maz Vantage — analysis model

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

import { isNum, cagr, mean, median, pct, mult, money, price, trim, dec, yearOf, clamp } from './util.js';
import { sectorLookup } from './grading.js';
import { gradeAll, FACTOR_KEYS, METRICS } from './factors.js';

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
  const dividends = deriveDividends(ds);
  const execs = deriveExecs(ds, facts, bm, history);
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
    ds, bm, facts, forecast, history, dividends, execs, peers, val, growth, momentum, lookup,
    // Raw peer ratios, kept whole rather than only folded into `peers`. The
    // valuation models build a peer-median target multiple from them, which
    // needs every field on the row, not just the P/E the peer table shows.
    peerRatios,
    /** Latest annual growth row per peer, for the "vs peers" comparisons. */
    peerGrowth,
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
