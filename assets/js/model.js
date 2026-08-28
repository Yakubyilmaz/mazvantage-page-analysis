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

/* ==========================================================================
   Benchmarks
   Editable defaults. Anything here can be overridden per-report through
   Settings, which writes to localStorage under `mazvantage.benchmarks`.
   ========================================================================== */

export const DEFAULT_BENCHMARKS = {
  riskFreeRate: 0.042,          // 10y treasury — "savings rate" hurdle
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
    roe: km.returnOnEquityTTM ?? null,
    roa: km.returnOnAssetsTTM ?? null,
    roic: km.returnOnInvestedCapitalTTM ?? null,
    currentRatio: cr,
    quickRatio: r.quickRatioTTM ?? null,
    debtToEquity: r.debtToEquityRatioTTM ?? null,
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
   Checks
   ========================================================================== */

const PASS = 'pass', FAIL = 'fail', NA = 'na';

/** Build one check. `state` may be null, meaning "not evaluable". */
function check(id, label, state, note, why) {
  return { id, label, state: state ?? NA, note: note ?? '', why: why ?? '' };
}

/** Convenience: turn a boolean-or-null into a state. */
const st = (b) => (b === null || b === undefined ? NA : b ? PASS : FAIL);

const NEED = {
  statements: 'Needs the income / balance / cash-flow feeds (FMP Starter and above).',
  dividends: 'Needs the dividend history feed (FMP Starter and above).',
  estimates: 'Needs the analyst-estimates feed.',
  dcf: 'Needs the discounted-cash-flow feed.',
  comp: 'Needs the executive-compensation feed (FMP Premium and above).',
};

function buildChecks({ facts, forecast, history, peers, dividends, execs, bm, ds }) {
  const V = [], F = [], P = [], H = [], D = [], M = [];
  const p = facts.price;

  /* ---------------- Valuation ------------------------------------------- */
  const dcfRow = ds.get('dcfLevered') || ds.get('dcf');
  const fairValue = dcfRow ? (dcfRow.dcf ?? dcfRow.equityValuePerShare ?? null) : null;
  const discount = (isNum(fairValue) && isNum(p) && fairValue > 0) ? 1 - p / fairValue : null;

  V.push(check('IsUndervaluedBasedOnDCF', 'Below Future Cash Flow Value',
    st(isNum(discount) ? discount > 0 : null),
    isNum(discount)
      ? `${facts.symbol} (${price(p)}) is trading ${pct(Math.abs(discount))} ${discount > 0 ? 'below' : 'above'} our estimate of its fair value (${price(fairValue)}).`
      : 'No discounted cash flow estimate is available for this company.',
    isNum(discount) ? '' : NEED.dcf));

  V.push(check('IsHighlyUndervaluedBasedOnDCF', 'Significantly Below Future Cash Flow Value',
    st(isNum(discount) ? discount >= 0.20 : null),
    isNum(discount)
      ? `${facts.symbol} is trading ${pct(Math.abs(discount))} ${discount > 0 ? 'below' : 'above'} fair value; a 20% or better discount is needed to pass.`
      : 'No discounted cash flow estimate is available for this company.',
    isNum(discount) ? '' : NEED.dcf));

  const peerPe = peers.peerPe;
  V.push(check('IsGoodValueComparingPreferredMultipleToPeersAverageValue', 'Price-To-Earnings vs Peers',
    st(isNum(facts.pe) && isNum(peerPe) ? facts.pe < peerPe : null),
    (isNum(facts.pe) && isNum(peerPe))
      ? `${facts.symbol} is ${facts.pe < peerPe ? 'good' : 'expensive'} value based on its Price-To-Earnings Ratio (${mult(facts.pe)}) compared to the peer average (${mult(peerPe)}) across ${peers.peers.filter((x) => isNum(x.pe)).length} peers.`
      : 'Not enough peer earnings multiples to compare against.',
    (isNum(facts.pe) && isNum(peerPe)) ? ''
      : 'Peer multiples are fetched one request per peer, so this needs a live FMP connection.'));

  const indPe = bm.industryPe[facts.sector] ?? bm.industryPe._default;
  V.push(check('IsGoodValueComparingPreferredMultipleToIndustry', 'Price-To-Earnings vs Industry',
    st(isNum(facts.pe) ? facts.pe < indPe : null),
    isNum(facts.pe)
      ? `${facts.symbol} is ${facts.pe < indPe ? 'good' : 'expensive'} value based on its Price-To-Earnings Ratio (${mult(facts.pe)}) compared to the ${facts.sector || 'market'} industry average (${mult(indPe)}).`
      : 'No positive trailing earnings, so a P/E comparison is not meaningful.'));

  const fpe = fairPe(forecast.epsGrowth ?? forecast.earningsGrowth, bm);
  V.push(check('IsGoodValueComparingRatioToFairRatio', 'Price-To-Earnings vs Fair Ratio',
    st(isNum(facts.pe) && isNum(fpe) ? facts.pe < fpe : null),
    (isNum(facts.pe) && isNum(fpe))
      ? `${facts.symbol}'s Price-To-Earnings Ratio (${mult(facts.pe)}) is ${facts.pe < fpe ? 'below' : 'above'} the fair ratio implied by its forecast growth (${mult(fpe)}).`
      : 'A fair ratio needs both a trailing P/E and a forecast growth rate.',
    (isNum(facts.pe) && isNum(fpe)) ? '' : NEED.estimates));

  const pt = ds.get('priceTarget');
  let ptState = null, ptNote = 'No analyst price target consensus is available.';
  if (pt && isNum(pt.targetConsensus) && isNum(p)) {
    const upside = pt.targetConsensus / p - 1;
    const spread = (isNum(pt.targetHigh) && isNum(pt.targetLow) && pt.targetConsensus > 0)
      ? (pt.targetHigh - pt.targetLow) / pt.targetConsensus : null;
    const agree = spread === null ? true : spread < 0.60;
    const roomy = upside > 0.20;
    ptState = roomy && agree;
    const why = ptState ? 'both conditions are met'
      : !roomy && !agree ? 'the upside is under 20% and analysts disagree too widely'
      : !roomy ? 'the upside is under the 20% required'
      : 'analysts disagree too widely (spread above 60% of the consensus)';
    ptNote = `The consensus target of ${price(pt.targetConsensus)} sits ${pct(Math.abs(upside))} ${upside > 0 ? 'above' : 'below'} the current price`
      + (spread === null ? '' : `, with a high-to-low spread of ${pct(spread)}`)
      + ` — ${why}.`;
  }
  V.push(check('IsAnalystForecastTrustworthy', 'Analyst Forecast', st(ptState), ptNote,
    ptState === null ? 'Needs the price-target consensus feed.' : ''));

  /* ---------------- Future growth ---------------------------------------- */
  const eg = forecast.earningsGrowth, rg = forecast.revenueGrowth;
  const needEst = forecast.available ? '' : NEED.estimates;

  F.push(check('IsExpectedProfitGrowthAboveRiskFreeRate', 'Earnings vs Savings Rate',
    st(isNum(eg) ? eg > bm.riskFreeRate : null),
    isNum(eg)
      ? `${facts.symbol}'s forecast earnings growth (${pct(eg)} per year) is ${eg > bm.riskFreeRate ? 'above' : 'below'} the savings rate (${pct(bm.riskFreeRate)}).`
      : 'No consensus earnings forecast is available.', needEst));

  F.push(check('IsExpectedAnnualProfitGrowthAboveMarket', 'Earnings vs Market',
    st(isNum(eg) ? eg > bm.marketEarningsGrowth : null),
    isNum(eg)
      ? `${facts.symbol}'s earnings (${pct(eg)} per year) are forecast to grow ${eg > bm.marketEarningsGrowth ? 'faster' : 'slower'} than the market (${pct(bm.marketEarningsGrowth)} per year).`
      : 'No consensus earnings forecast is available.', needEst));

  F.push(check('IsExpectedAnnualProfitGrowthHigh', 'High Growth Earnings',
    st(isNum(eg) ? eg > bm.highGrowth : null),
    isNum(eg)
      ? `Earnings are forecast to grow ${pct(eg)} per year, ${eg > bm.highGrowth ? 'above' : 'below'} the ${pct(bm.highGrowth)} high-growth threshold.`
      : 'No consensus earnings forecast is available.', needEst));

  F.push(check('IsExpectedRevenueGrowthAboveMarket', 'Revenue vs Market',
    st(isNum(rg) ? rg > bm.marketRevenueGrowth : null),
    isNum(rg)
      ? `${facts.symbol}'s revenue (${pct(rg)} per year) is forecast to grow ${rg > bm.marketRevenueGrowth ? 'faster' : 'slower'} than the market (${pct(bm.marketRevenueGrowth)} per year).`
      : 'No consensus revenue forecast is available.', needEst));

  F.push(check('IsExpectedRevenueGrowthHigh', 'High Growth Revenue',
    st(isNum(rg) ? rg > bm.highGrowth : null),
    isNum(rg)
      ? `Revenue is forecast to grow ${pct(rg)} per year, ${rg > bm.highGrowth ? 'above' : 'below'} the ${pct(bm.highGrowth)} high-growth threshold.`
      : 'No consensus revenue forecast is available.', needEst));

  F.push(check('IsReturnOnEquityForecastAboveBenchmark', 'Future ROE',
    st(isNum(forecast.futureRoe) ? forecast.futureRoe > bm.futureRoeBar : null),
    isNum(forecast.futureRoe)
      ? `Return on equity is forecast to be ${pct(forecast.futureRoe)} in ${forecast.span} years, ${forecast.futureRoe > bm.futureRoeBar ? 'above' : 'below'} the ${pct(bm.futureRoeBar)} benchmark.`
      : 'A forecast return on equity needs both consensus earnings and current shareholder equity.',
    isNum(forecast.futureRoe) ? '' : NEED.estimates));

  /* ---------------- Past performance ------------------------------------- */
  // Each field is tested on its own: some resolve from the pre-computed
  // growth feed even when the annual statements are gated.
  const hist = history;
  const needStmt = NEED.statements;

  P.push(check('HasHighQualityPastEarnings', 'Quality Earnings',
    st(isNum(facts.incomeQuality) ? facts.incomeQuality >= 1 : null),
    isNum(facts.incomeQuality)
      ? `${facts.symbol} converts ${dec(facts.incomeQuality, 2)}x of reported profit into operating cash flow — earnings are ${facts.incomeQuality >= 1 ? 'high quality' : 'not fully backed by cash'}.`
      : 'Earnings quality needs operating cash flow alongside net income.'));

  P.push(check('HasPastNetProfitMarginImprovedOverLastYear', 'Growing Profit Margin',
    st(isNum(hist.marginNow) && isNum(hist.marginPrev) ? hist.marginNow > hist.marginPrev : null),
    isNum(hist.marginNow) && isNum(hist.marginPrev)
      ? `${facts.symbol}'s current net profit margin (${pct(hist.marginNow)}) is ${hist.marginNow > hist.marginPrev ? 'higher' : 'lower'} than last year (${pct(hist.marginPrev)}).`
      : 'Comparing margins needs at least two years of income statements.', needStmt));

  P.push(check('HasGrownProfitsOverPast5Years', 'Earnings Trend',
    st(isNum(hist.growth5y) ? hist.growth5y > 0 : null),
    isNum(hist.growth5y)
      ? `${facts.symbol}'s earnings have ${hist.growth5y > 0 ? 'grown' : 'declined'} by ${pct(Math.abs(hist.growth5y))} per year over the past 5 years.`
      : 'An earnings trend needs five years of income statements.', needStmt));

  P.push(check('HasProfitGrowthAccelerated', 'Accelerating Growth',
    st(isNum(hist.growth1y) && isNum(hist.growth5y) ? hist.growth1y > hist.growth5y : null),
    isNum(hist.growth1y) && isNum(hist.growth5y)
      ? `Earnings growth over the past year (${pct(hist.growth1y)}) is ${hist.growth1y > hist.growth5y ? 'above' : 'below'} its 5-year average (${pct(hist.growth5y)} per year).`
      : 'Comparing growth rates needs five years of income statements.', needStmt));

  const indGrowth = bm.industryEarningsGrowth[facts.sector] ?? bm.industryEarningsGrowth._default;
  P.push(check('IsGrowingFasterThanIndustry', 'Earnings vs Industry',
    st(isNum(hist.growth1y) ? hist.growth1y > indGrowth : null),
    isNum(hist.growth1y)
      ? `${facts.symbol} earnings growth over the past year (${pct(hist.growth1y)}) ${hist.growth1y > indGrowth ? 'exceeded' : 'trailed'} the ${facts.sector || 'market'} industry (${pct(indGrowth)}).`
      : 'Comparing against the industry needs two years of income statements.', needStmt));

  P.push(check('IsReturnOnEquityAboveThreshold', 'High ROE',
    st(isNum(facts.roe) ? facts.roe > bm.roeBar : null),
    isNum(facts.roe)
      ? `${facts.symbol}'s return on equity (${pct(facts.roe)}) is ${facts.roe > bm.roeBar ? 'considered high' : 'below the ' + pct(bm.roeBar) + ' benchmark'}.`
      : 'Return on equity is unavailable.'));

  /* ---------------- Financial health ------------------------------------- */
  const ca = facts.currentAssets, cl = facts.currentLiabilities, ltl = facts.longTermLiabilities;

  H.push(check('AreShortTermLiabilitiesCovered', 'Short Term Liabilities',
    st(isNum(ca) && isNum(cl) ? ca > cl : null),
    (isNum(ca) && isNum(cl))
      ? `${facts.symbol}'s short term assets (${money(ca)}) ${ca > cl ? 'exceed' : 'do not cover'} its short term liabilities (${money(cl)}).`
      : 'Needs current assets and current liabilities.'));

  H.push(check('AreLongTermLiabilitiesCovered', 'Long Term Liabilities',
    st(isNum(ca) && isNum(ltl) ? ca > ltl : null),
    (isNum(ca) && isNum(ltl))
      ? `${facts.symbol}'s short term assets (${money(ca)}) ${ca > ltl ? 'exceed' : 'do not cover'} its long term liabilities (${money(ltl)}).`
      : 'Needs current assets and long term liabilities.'));

  const netDe = (isNum(facts.netDebt) && isNum(facts.equity) && facts.equity > 0)
    ? facts.netDebt / facts.equity : null;
  H.push(check('IsDebtLevelAppropriate', 'Debt Level',
    st(isNum(netDe) ? netDe < bm.netDebtToEquityCeiling : null),
    isNum(netDe)
      ? (netDe < 0
          ? `${facts.symbol} holds more cash (${money(facts.cash)}) than total debt (${money(facts.totalDebt)}).`
          : `${facts.symbol}'s net debt to equity ratio (${pct(netDe)}) is ${netDe < bm.netDebtToEquityCeiling ? 'satisfactory' : 'high'}.`)
      : 'Needs total debt, cash and shareholder equity.'));

  H.push(check('HasDebtReducedOverTime', 'Reducing Debt',
    st(isNum(hist.deNow) && isNum(hist.de5) ? hist.deNow < hist.de5 : null),
    isNum(hist.deNow) && isNum(hist.de5)
      ? `${facts.symbol}'s debt to equity ratio has ${hist.deNow < hist.de5 ? 'reduced' : 'increased'} from ${pct(hist.de5)} to ${pct(hist.deNow)} over the past 5 years.`
      : 'Tracking leverage over time needs five years of balance sheets.', needStmt));

  const debtCover = (isNum(facts.ocf) && isNum(facts.totalDebt) && facts.totalDebt > 0)
    ? facts.ocf / facts.totalDebt : null;
  H.push(check('IsDebtCoveredByCashflow', 'Debt Coverage',
    st(isNum(debtCover) ? debtCover > bm.debtCoverageFloor : null),
    isNum(debtCover)
      ? `${facts.symbol}'s debt is ${debtCover > bm.debtCoverageFloor ? 'well covered' : 'not well covered'} by operating cash flow (${pct(debtCover)}).`
      : (isNum(facts.totalDebt) && facts.totalDebt === 0 ? `${facts.symbol} carries no debt.` : 'Needs operating cash flow and total debt.')));

  H.push(check('IsInterestCoveredByProfit', 'Interest Coverage',
    st(isNum(facts.interestCover) ? facts.interestCover > bm.interestCoverFloor : null),
    isNum(facts.interestCover)
      ? `${facts.symbol}'s interest payments on its debt are ${facts.interestCover > bm.interestCoverFloor ? 'well covered' : 'not well covered'} by EBIT (${dec(facts.interestCover, 1)}x coverage).`
      : `Interest expense is not separately reported for ${facts.symbol}, so coverage cannot be measured.`));

  /* ---------------- Dividend --------------------------------------------- */
  const dy = facts.dividendYield;
  const paysDividend = isNum(dy) && dy > 0;

  D.push(check('IsDividendSignificant', 'Notable Dividend',
    st(isNum(dy) ? dy > bm.dividendNotable : null),
    isNum(dy)
      ? (paysDividend
          ? `${facts.symbol}'s dividend (${pct(dy)}) is ${dy > bm.dividendNotable ? 'above' : 'below'} the bottom 25% of dividend payers (${pct(bm.dividendNotable)}).`
          : `${facts.symbol} does not currently pay a dividend.`)
      : 'No dividend yield is available.'));

  D.push(check('IsDividendYieldTopTier', 'High Dividend',
    st(isNum(dy) ? dy > bm.dividendTopTier : null),
    isNum(dy)
      ? `${facts.symbol}'s dividend (${pct(dy)}) is ${dy > bm.dividendTopTier ? 'in' : 'below'} the top 25% of dividend payers (${pct(bm.dividendTopTier)}).`
      : 'No dividend yield is available.'));

  D.push(check('IsDividendStable', 'Stable Dividend',
    st(dividends.stable),
    dividends.available
      ? (paysDividend
          ? `${facts.symbol}'s dividend payments have ${dividends.stable ? 'been stable' : 'been volatile'} over the past ${dividends.years} years`
            + (dividends.worstDrop != null ? ` (largest annual cut ${pct(dividends.worstDrop)}).` : '.')
          : `${facts.symbol} does not pay a dividend.`)
      : 'Dividend stability needs the dividend history feed.', dividends.available ? '' : NEED.dividends));

  D.push(check('IsDividendGrowing', 'Growing Dividend',
    st(dividends.growing),
    dividends.available
      ? (isNum(dividends.growth)
          ? `${facts.symbol}'s dividend payments have ${dividends.growth > 0 ? 'increased' : 'fallen'} by ${pct(Math.abs(dividends.growth))} per year over the past ${dividends.years} years.`
          : `${facts.symbol} has no meaningful dividend growth record.`)
      : 'Dividend growth needs the dividend history feed.', dividends.available ? '' : NEED.dividends));

  D.push(check('IsDividendCovered', 'Earnings Coverage',
    st(paysDividend && isNum(facts.payoutRatio) ? facts.payoutRatio < bm.payoutCeiling : (paysDividend ? null : false)),
    isNum(facts.payoutRatio)
      ? `With a payout ratio of ${pct(facts.payoutRatio)}, dividend payments are ${facts.payoutRatio < bm.payoutCeiling ? 'well covered' : 'not covered'} by earnings.`
      : `${facts.symbol} pays no dividend, so there is nothing to cover.`));

  D.push(check('IsDividendCoveredByFreeCashFlow', 'Cash Flow Coverage',
    st(paysDividend && isNum(facts.cashPayoutRatio) ? facts.cashPayoutRatio < bm.payoutCeiling : (paysDividend ? null : false)),
    isNum(facts.cashPayoutRatio)
      ? `With a cash payout ratio of ${pct(facts.cashPayoutRatio)}, dividend payments are ${facts.cashPayoutRatio < bm.payoutCeiling ? 'well covered' : 'not covered'} by free cash flow.`
      : `${facts.symbol} pays no dividend, so there is nothing to cover.`));

  /* ---------------- Management ------------------------------------------- */
  M.push(check('IsCEOCompensationAppropriate', 'Compensation vs Market',
    st(execs.ceoCompState),
    execs.ceoCompNote, execs.ceoCompWhy));

  M.push(check('IsCEOCompensationChangeJustified', 'Compensation vs Earnings',
    st(execs.ceoCompChangeState),
    execs.ceoCompChangeNote, execs.ceoCompChangeWhy));

  M.push(check('IsManagementTeamSeasoned', 'Experienced Management',
    st(isNum(execs.managementTenure) ? execs.managementTenure >= bm.managementTenureBar : null),
    isNum(execs.managementTenure)
      ? `${facts.symbol}'s management team is ${execs.managementTenure >= bm.managementTenureBar ? 'seasoned' : 'relatively new'}, with an average tenure of ${dec(execs.managementTenure, 1)} years.`
      : 'Average management tenure is not reported for this company.',
    isNum(execs.managementTenure) ? '' : 'Needs the key-executives feed with appointment dates.'));

  M.push(check('IsBoardSeasoned', 'Experienced Board',
    st(isNum(execs.boardTenure) ? execs.boardTenure >= bm.boardTenureBar : null),
    isNum(execs.boardTenure)
      ? `The board of directors is ${execs.boardTenure >= bm.boardTenureBar ? 'seasoned and experienced' : 'relatively new'}, with an average tenure of ${dec(execs.boardTenure, 1)} years.`
      : 'Average board tenure is not reported for this company.',
    isNum(execs.boardTenure) ? '' : 'Needs the key-executives feed with appointment dates.'));

  return { value: V, future: F, past: P, health: H, dividend: D, management: M };
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
   Scoring
   ========================================================================== */

function scoreOf(checks) {
  const passed = checks.filter((c) => c.state === PASS).length;
  const evaluated = checks.filter((c) => c.state !== NA).length;
  return { passed, total: checks.length, evaluated, confident: evaluated === checks.length };
}

/* ==========================================================================
   Rewards & risks
   ========================================================================== */

function deriveRewards(checks, facts, forecast, history) {
  const rewards = [], risks = [];
  const all = Object.values(checks).flat();
  const by = (id) => all.find((c) => c.id === id);

  const add = (list, cond, text) => { if (cond) list.push(text); };

  add(rewards, by('IsUndervaluedBasedOnDCF')?.state === PASS, by('IsUndervaluedBasedOnDCF').note);
  add(rewards, by('IsGoodValueComparingPreferredMultipleToPeersAverageValue')?.state === PASS,
    `Trades below the peer group on earnings (${mult(facts.pe)}).`);
  add(rewards, isNum(forecast.earningsGrowth) && forecast.earningsGrowth > 0,
    `Earnings are forecast to grow ${pct(forecast.earningsGrowth)} per year.`);
  add(rewards, isNum(forecast.revenueGrowth) && forecast.revenueGrowth > 0,
    `Revenue is forecast to grow ${pct(forecast.revenueGrowth)} per year.`);
  add(rewards, isNum(history.growth1y) && history.growth1y > 0,
    `Earnings grew by ${pct(history.growth1y)} over the past year.`);
  add(rewards, by('IsReturnOnEquityAboveThreshold')?.state === PASS,
    `Return on equity of ${pct(facts.roe)} is well above the market.`);
  add(rewards, by('IsDebtLevelAppropriate')?.state === PASS && isNum(facts.netDebt) && facts.netDebt < 0,
    `Holds more cash than debt — a net cash position of ${money(Math.abs(facts.netDebt))}.`);
  add(rewards, by('IsDividendYieldTopTier')?.state === PASS,
    `Dividend yield of ${pct(facts.dividendYield)} ranks in the top quartile of payers.`);

  add(risks, by('IsUndervaluedBasedOnDCF')?.state === FAIL, by('IsUndervaluedBasedOnDCF').note);
  add(risks, by('IsGoodValueComparingPreferredMultipleToIndustry')?.state === FAIL,
    `Earnings multiple (${mult(facts.pe)}) is above the ${facts.sector || 'industry'} average.`);
  add(risks, by('IsExpectedAnnualProfitGrowthAboveMarket')?.state === FAIL && isNum(forecast.earningsGrowth),
    `Forecast earnings growth (${pct(forecast.earningsGrowth)}) trails the wider market.`);
  add(risks, by('AreShortTermLiabilitiesCovered')?.state === FAIL,
    by('AreShortTermLiabilitiesCovered').note);
  add(risks, by('IsDebtLevelAppropriate')?.state === FAIL,
    by('IsDebtLevelAppropriate').note);
  add(risks, by('IsInterestCoveredByProfit')?.state === FAIL,
    by('IsInterestCoveredByProfit').note);
  add(risks, by('IsDividendStable')?.state === FAIL,
    by('IsDividendStable').note);
  add(risks, isNum(history.growth1y) && history.growth1y < 0,
    `Earnings fell ${pct(Math.abs(history.growth1y))} over the past year.`);

  return { rewards: rewards.slice(0, 5), risks: risks.slice(0, 5) };
}

/* ==========================================================================
   Entry point
   ========================================================================== */

export function analyse(ds, { peerRatios = null } = {}) {
  const bm = loadBenchmarks();

  const facts = deriveFacts(ds, bm);
  const forecast = deriveForecast(ds, facts);
  const history = deriveHistory(ds, facts);
  const dividends = deriveDividends(ds);
  const execs = deriveExecs(ds, facts, bm, history);
  const peers = derivePeers(ds, facts, bm);

  // Peer P/E ratios are fetched separately (one request per peer) and folded
  // in here so "Price-To-Earnings vs Peers" can use live numbers.
  if (peerRatios) {
    for (const p of peers.peers) {
      const pr = peerRatios[p.symbol];
      if (pr && isNum(pr.priceToEarningsRatioTTM) && pr.priceToEarningsRatioTTM > 0) p.pe = pr.priceToEarningsRatioTTM;
    }
  }
  peers.peerPe = mean(peers.peers.map((p) => p.pe).filter((v) => isNum(v) && v > 0 && v < 300));

  const checks = buildChecks({ facts, forecast, history, peers, dividends, execs, bm, ds });

  const scores = {
    value: scoreOf(checks.value),
    future: scoreOf(checks.future),
    past: scoreOf(checks.past),
    health: scoreOf(checks.health),
    dividend: scoreOf(checks.dividend),
    management: scoreOf(checks.management),
  };

  const { rewards, risks } = deriveRewards(checks, facts, forecast, history);

  const dcfRow = ds.get('dcfLevered') || ds.get('dcf');
  const fairValue = dcfRow ? (dcfRow.dcf ?? dcfRow.equityValuePerShare ?? null) : null;

  return {
    ds, bm, facts, forecast, history, dividends, execs, peers, checks, scores, rewards, risks,
    fairValue,
    discount: (isNum(fairValue) && isNum(facts.price) && fairValue > 0) ? 1 - facts.price / fairValue : null,
    fairPe: fairPe(forecast.epsGrowth ?? forecast.earningsGrowth, bm),
    industryPe: bm.industryPe[facts.sector] ?? bm.industryPe._default,
    /** headline sentence under the company name */
    verdict: verdictLine(scores),
  };
}

function verdictLine(scores) {
  const flake = [scores.value, scores.future, scores.past, scores.health, scores.dividend];
  const total = flake.reduce((a, s) => a + s.passed, 0);
  const strong = [];
  if (scores.past.passed >= 5) strong.push('outstanding track record');
  else if (scores.past.passed >= 4) strong.push('solid track record');
  if (scores.health.passed >= 5) strong.push('excellent balance sheet');
  else if (scores.health.passed >= 4) strong.push('sound balance sheet');
  if (scores.future.passed >= 5) strong.push('strong growth outlook');
  if (scores.value.passed >= 4) strong.push('attractive valuation');
  if (scores.dividend.passed >= 4) strong.push('reliable dividend');

  if (!strong.length) return total >= 12 ? 'Balanced across the five factors.' : 'Few of the five factors currently screen well.';
  const s = strong.join(' with ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

export const FACTOR_META = [
  { key: 'value',      title: 'Valuation',        max: 6, anchor: 'valuation' },
  { key: 'future',     title: 'Future Growth',    max: 6, anchor: 'future-growth' },
  { key: 'past',       title: 'Past Performance', max: 6, anchor: 'past-performance' },
  { key: 'health',     title: 'Financial Health', max: 6, anchor: 'financial-health' },
  { key: 'dividend',   title: 'Dividend',         max: 6, anchor: 'dividend' },
  { key: 'management', title: 'Management',       max: 4, anchor: 'management' },
];
