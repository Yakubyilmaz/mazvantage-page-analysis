/* ==========================================================================
   Maz Vantage — analysis model

   Five factors — Value, Growth, Profitability, Health, Momentum — each graded
   1 to 5, and each decomposing into the metrics that produced it. The grade
   is the answer; the metric rows are the *why*, which is the part most quant
   screens leave out.

   Scoring is sector-relative. A metric is graded by where the company falls
   in a cohort of size-matched competitors (see cohort.js), not against a
   fixed threshold, because a 35x earnings multiple means something different
   in semiconductors than in utilities. Where no comparable peer figure exists
   — forward consensus, technical position, analyst revisions — the metric is
   graded against documented bands instead, and says so.

   Dividend and Management are kept as evidence sections but are deliberately
   NOT factors: a dividend policy is a style choice, not a quality dimension,
   and scoring it would cap every non-payer for no analytical reason.
   ========================================================================== */

import { isNum, cagr, mean, median, pct, mult, money, price, trim, dec, yearOf, clamp } from './util.js';
import { describe, gradeFrom, verdict, ordinal, buildCohort } from './cohort.js';
import { METRICS, FACTOR_META, gradeFromBands } from './metrics.js';

export { FACTOR_META, verdict };

/* ==========================================================================
   Benchmarks — only the things that genuinely have no peer comparison
   ========================================================================== */

export const DEFAULT_BENCHMARKS = {
  riskFreeRate: 0.042,
  dividendNotable: 0.014,
  dividendTopTier: 0.036,
  payoutCeiling: 0.90,
  managementTenureBar: 2,
  boardTenureBar: 3,
  // composite weighting, per factor — mirrors FACTOR_META but user-editable
  wValue: 0.20, wGrowth: 0.20, wProfitability: 0.25, wHealth: 0.20, wMomentum: 0.15,
};

const BM_STORAGE = 'mazvantage.benchmarks';

export function loadBenchmarks() {
  try { return { ...DEFAULT_BENCHMARKS, ...JSON.parse(localStorage.getItem(BM_STORAGE) || '{}') }; }
  catch { return { ...DEFAULT_BENCHMARKS }; }
}

export function saveBenchmarks(patch) {
  localStorage.setItem(BM_STORAGE, JSON.stringify({ ...loadBenchmarks(), ...patch }));
}

/* ==========================================================================
   Fact extraction
   ========================================================================== */

const arr = (v) => (Array.isArray(v) ? v : []);
const chron = (rows) => arr(rows).slice().sort((a, b) => new Date(a.date) - new Date(b.date));

function deriveFacts(ds) {
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

  const shares =
    (isNum(marketCap) && isNum(priceNow) && priceNow > 0) ? marketCap / priceNow
    : (isNum(sc.revenue) && isNum(r.revenuePerShareTTM) && r.revenuePerShareTTM > 0) ? sc.revenue / r.revenuePerShareTTM
    : latestI?.weightedAverageShsOutDil ?? null;

  const perShare = (v) => (isNum(v) && isNum(shares) ? v * shares : null);

  // Trailing twelve months first: an annual filing can be eleven months stale
  // by the time it is still the newest one. Statements drive history, not the
  // current position.
  const revenue    = sc.revenue                              ?? perShare(r.revenuePerShareTTM)       ?? latestI?.revenue;
  const netIncome  = perShare(r.netIncomePerShareTTM)        ?? latestI?.netIncome                   ?? null;
  const equity     = perShare(r.bookValuePerShareTTM)        ?? latestB?.totalStockholdersEquity     ?? null;
  const cashOnHand = perShare(r.cashPerShareTTM)             ?? latestB?.cashAndShortTermInvestments ?? null;
  const ocf        = perShare(r.operatingCashFlowPerShareTTM) ?? latestC?.operatingCashFlow          ?? null;
  const fcf        = perShare(r.freeCashFlowPerShareTTM)     ?? latestC?.freeCashFlow                ?? null;
  const totalDebt  = (isNum(r.debtToEquityRatioTTM) && isNum(equity) ? r.debtToEquityRatioTTM * equity : null)
                     ?? latestB?.totalDebt ?? null;
  const totalAssets = sc.totalAssets ?? latestB?.totalAssets ?? null;
  const totalLiab   = sc.totalLiabilities ?? latestB?.totalLiabilities ?? null;
  const ebit        = sc.ebit ?? latestI?.operatingIncome ?? null;

  let currentAssets = null, currentLiab = null;
  const wc = km.workingCapitalTTM ?? sc.workingCapital ?? null;
  const cr = r.currentRatioTTM ?? null;
  if (isNum(wc) && isNum(cr) && cr !== 1) {
    const solved = wc / (cr - 1);
    if (isNum(solved) && solved > 0 && (!isNum(totalLiab) || solved <= totalLiab * 1.02)) {
      currentLiab = solved;
      currentAssets = cr * solved;
    }
  }
  currentAssets ??= latestB?.totalCurrentAssets ?? null;
  currentLiab ??= latestB?.totalCurrentLiabilities ?? null;
  const longTermLiab = isNum(totalLiab) && isNum(currentLiab) ? totalLiab - currentLiab : null;
  const netDebt = isNum(totalDebt) && isNum(cashOnHand) ? totalDebt - cashOnHand : null;

  const interestExpense = latestI?.interestExpense ?? null;
  const interestCover = (isNum(r.interestCoverageRatioTTM) && r.interestCoverageRatioTTM > 0)
    ? r.interestCoverageRatioTTM
    : (isNum(ebit) && isNum(interestExpense) && interestExpense > 0 ? ebit / interestExpense : null);

  const eps = r.netIncomePerShareTTM ?? (isNum(netIncome) && isNum(shares) ? netIncome / shares : null);
  const pe = r.priceToEarningsRatioTTM ?? (isNum(priceNow) && isNum(eps) && eps > 0 ? priceNow / eps : null);

  const dcfRow = ds.get('dcfLevered') || ds.get('dcf');
  const fairValue = dcfRow ? (dcfRow.dcf ?? dcfRow.equityValuePerShare ?? null) : null;

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
    address: [profile.address, profile.city, profile.state, profile.zip, profile.country].filter(Boolean).join(', '),
    isin: profile.isin ?? null, cik: profile.cik ?? null, beta: profile.beta ?? null,

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
    evToEbitda: km.evToEBITDATTM ?? r.enterpriseValueMultipleTTM ?? null,
    fcfYield: km.freeCashFlowYieldTTM ?? null,
    earningsYield: km.earningsYieldTTM ?? null,
    grossMargin: r.grossProfitMarginTTM ?? null,
    operatingMargin: r.operatingProfitMarginTTM ?? null,
    netMargin: r.netProfitMarginTTM ?? null,
    roe: km.returnOnEquityTTM ?? null,
    roa: km.returnOnAssetsTTM ?? null,
    roic: km.returnOnInvestedCapitalTTM ?? null,
    netDebtToEbitda: km.netDebtToEBITDATTM ?? null,
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

    fairValue,
    dcfDiscount: (isNum(fairValue) && isNum(priceNow) && fairValue > 0) ? 1 - priceNow / fairValue : null,

    lastReported: latestI?.date ?? null,
    statements: { income, balance, cash },
    hasStatements: income.length > 0,
  };
}

/* ==========================================================================
   Forecast
   ========================================================================== */

function deriveForecast(ds, facts) {
  const est = chron(ds.get('estimates'));
  if (!est.length) return { available: false, rows: [], span: 0 };

  const thisYear = new Date().getUTCFullYear();
  const rows = est.map((e) => ({
    date: e.date, year: yearOf(e.date),
    revenue: e.revenueAvg ?? null, revenueLow: e.revenueLow ?? null, revenueHigh: e.revenueHigh ?? null,
    netIncome: e.netIncomeAvg ?? null, netIncomeLow: e.netIncomeLow ?? null, netIncomeHigh: e.netIncomeHigh ?? null,
    ebitda: e.ebitdaAvg ?? null,
    eps: e.epsAvg ?? null, epsLow: e.epsLow ?? null, epsHigh: e.epsHigh ?? null,
    analystsRevenue: e.numAnalystsRevenue ?? null, analystsEps: e.numAnalystsEps ?? null,
  })).filter((r) => isNum(r.year));

  const base = rows.find((r) => r.year >= thisYear) || rows[0];
  const target = rows.find((r) => r.year === base.year + 3)
    || rows.filter((r) => r.year > base.year).at(-1) || null;
  const span = target ? target.year - base.year : 0;
  const window = target ? rows.filter((r) => r.year >= base.year && r.year <= target.year) : [];

  // Median year-on-year step, not endpoint CAGR: consensus paths routinely
  // carry one bad year because a different subset of analysts covers each
  // horizon, and an endpoint CAGR inherits that error wholesale.
  const growth = (field) => {
    if (!target || span <= 0) return null;
    const steps = [];
    for (let i = 1; i < window.length; i++) {
      const a = window[i - 1][field], b = window[i][field];
      if (isNum(a) && isNum(b) && a > 0) steps.push(b / a - 1);
    }
    return steps.length >= 3 ? median(steps) : cagr(base[field], target[field], span);
  };

  const latestC = facts.statements.cash.at(-1);
  let retention = null;
  if (latestC && isNum(facts.netIncome) && facts.netIncome > 0) {
    const dividends = latestC.netDividendsPaid ?? latestC.commonDividendsPaid ?? 0;
    const buybacks = latestC.commonStockRepurchased ?? latestC.netCommonStockIssuance ?? 0;
    retention = clamp(1 - (Math.abs(dividends) + Math.abs(buybacks)) / facts.netIncome, 0, 1);
  } else if (isNum(facts.payoutRatio)) {
    retention = clamp(1 - facts.payoutRatio, 0, 1);
  }

  let futureRoe = null;
  if (target && isNum(facts.equity) && isNum(retention)) {
    const path = window.filter((r) => r.year > base.year && isNum(r.netIncome));
    const projected = facts.equity + path.reduce((a, r) => a + r.netIncome * retention, 0);
    if (projected > 0 && isNum(target.netIncome)) futureRoe = target.netIncome / projected;
  }

  return {
    available: true, rows, base, target, span,
    revenueGrowth: growth('revenue'),
    earningsGrowth: growth('netIncome'),
    epsGrowth: growth('eps'),
    futureRoe, retention,
    retentionIsGross: !latestC,
    analystCount: Math.max(base?.analystsEps ?? 0, base?.analystsRevenue ?? 0) || null,
  };
}

/* ==========================================================================
   History — trends the metric rows compare against
   ========================================================================== */

function deriveHistory(ds, facts) {
  const income = facts.statements.income;
  const balance = facts.statements.balance;
  const cash = facts.statements.cash;
  const growthRows = chron(ds.get('growth'));
  const ratioRows = chron(ds.get('ratiosHist'));
  const metricRows = chron(ds.get('metricsHist'));

  const h = {
    available: income.length >= 2,
    income, balance, cash,
    marginNow: null, marginPrev: null, operatingMargin5y: null,
    growth1y: null, growth5y: null, revenueGrowth1y: null, revenueGrowth3y: null, revenueGrowth5y: null,
    debtSeries: [], deNow: null, de5: null,
    peSeries: [], peMedian: null, roeSeries: [],
  };

  if (income.length >= 2) {
    const last = income.at(-1), prev = income.at(-2);
    const back = (n) => (income.length > n ? income.at(-1 - n) : income[0]);
    const yrs = (n) => Math.min(Math.max(income.length - 1, 1), n);

    h.marginNow = last.revenue > 0 ? last.netIncome / last.revenue : null;
    h.marginPrev = prev.revenue > 0 ? prev.netIncome / prev.revenue : null;
    h.growth1y = (prev.netIncome > 0 && isNum(last.netIncome)) ? last.netIncome / prev.netIncome - 1 : null;
    h.revenueGrowth1y = (prev.revenue > 0 && isNum(last.revenue)) ? last.revenue / prev.revenue - 1 : null;
    h.growth5y = cagr(back(5).netIncome, last.netIncome, yrs(5));
    h.revenueGrowth5y = cagr(back(5).revenue, last.revenue, yrs(5));
    h.revenueGrowth3y = cagr(back(3).revenue, last.revenue, yrs(3));

    const om = (row) => (row && row.revenue > 0 ? row.operatingIncome / row.revenue : null);
    h.operatingMargin5y = om(back(5));
  }

  const g = growthRows.at(-1);
  if (g) {
    h.growth1y ??= isNum(g.netIncomeGrowth) ? g.netIncomeGrowth : null;
    h.revenueGrowth1y ??= isNum(g.revenueGrowth) ? g.revenueGrowth : null;
    h.growth5y ??= isNum(g.fiveYNetIncomeGrowthPerShare) ? Math.pow(1 + g.fiveYNetIncomeGrowthPerShare, 1 / 5) - 1 : null;
    h.revenueGrowth5y ??= isNum(g.fiveYRevenueGrowthPerShare) ? Math.pow(1 + g.fiveYRevenueGrowthPerShare, 1 / 5) - 1 : null;
    h.revenueGrowth3y ??= isNum(g.threeYRevenueGrowthPerShare) ? Math.pow(1 + g.threeYRevenueGrowthPerShare, 1 / 3) - 1 : null;
  }

  if (balance.length) {
    h.debtSeries = balance.map((b) => ({
      date: b.date,
      debtToEquity: b.totalStockholdersEquity > 0 ? (b.totalDebt ?? 0) / b.totalStockholdersEquity : null,
    }));
  } else if (ratioRows.length) {
    h.debtSeries = ratioRows.map((r) => ({ date: r.date, debtToEquity: r.debtToEquityRatio ?? null }));
  }
  const withDe = h.debtSeries.filter((d) => isNum(d.debtToEquity));
  h.deNow = withDe.at(-1)?.debtToEquity ?? null;
  h.de5 = (withDe.length >= 6 ? withDe.at(-6) : withDe[0])?.debtToEquity ?? null;

  h.peSeries = ratioRows
    .map((r) => ({ date: r.date, pe: r.priceToEarningsRatio ?? null }))
    .filter((r) => isNum(r.pe) && r.pe > 0);
  h.peMedian = median(h.peSeries.map((r) => r.pe));

  if (income.length && balance.length) {
    const byYear = new Map(income.map((i) => [yearOf(i.date), i.netIncome]));
    h.roeSeries = balance.map((b) => {
      const ni = byYear.get(yearOf(b.date));
      return { date: b.date, roe: isNum(ni) && b.totalStockholdersEquity > 0 ? ni / b.totalStockholdersEquity : null };
    }).filter((r) => isNum(r.roe));
  } else if (metricRows.length) {
    h.roeSeries = metricRows.map((m) => ({ date: m.date, roe: m.returnOnEquity ?? null })).filter((r) => isNum(r.roe));
  }

  return h;
}

/* ==========================================================================
   Momentum — price and revision signals, measured against the sector
   ========================================================================== */

function normalisePrices(raw) {
  return arr(raw)
    .map((r) => ({ date: r.date, price: r.price ?? r.close ?? r.adjClose ?? null }))
    .filter((r) => r.date && isNum(r.price))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Total return over `days`, using the nearest observation at or before. */
function returnOver(pts, days, endOffsetDays = 0) {
  if (pts.length < 2) return null;
  const lastT = new Date(pts.at(-1).date).getTime();
  const endT = lastT - endOffsetDays * 864e5;
  const startT = lastT - (days + endOffsetDays) * 864e5;
  const at = (t) => {
    let ref = null;
    for (const p of pts) { if (new Date(p.date).getTime() <= t) ref = p; else break; }
    return ref;
  };
  const a = at(startT) ?? (new Date(pts[0].date).getTime() - startT < days * 0.1 * 864e5 ? pts[0] : null);
  const b = at(endT) ?? pts.at(-1);
  return (a && b && a.price > 0) ? b.price / a.price - 1 : null;
}

function deriveMomentum(ds, facts, benchSeries) {
  const self = normalisePrices(ds.get('prices'));
  const bench = normalisePrices(benchSeries);

  const rel = (days, offset = 0) => {
    const a = returnOver(self, days, offset);
    const b = returnOver(bench, days, offset);
    if (!isNum(a)) return null;
    return isNum(b) ? a - b : a;   // absolute return when no benchmark loaded
  };

  const vs = (avg) => (isNum(facts.price) && isNum(avg) && avg > 0 ? facts.price / avg - 1 : null);
  const rangePos = (isNum(facts.price) && isNum(facts.yearLow) && isNum(facts.yearHigh) && facts.yearHigh > facts.yearLow)
    ? clamp((facts.price - facts.yearLow) / (facts.yearHigh - facts.yearLow), 0, 1) : null;

  // Analyst rating changes over the last quarter.
  const gradeRows = arr(ds.get('gradesHist'));
  const cutoff = Date.now() - 92 * 864e5;
  const recent = gradeRows.filter((g) => new Date(g.date ?? g.publishedDate ?? 0).getTime() >= cutoff);
  const rank = (s) => {
    const t = String(s || '').toLowerCase();
    if (/strong buy|outperform|overweight/.test(t)) return 5;
    if (/buy|accumulate|add|positive/.test(t)) return 4;
    if (/hold|neutral|market perform|equal/.test(t)) return 3;
    if (/underweight|underperform|reduce/.test(t)) return 2;
    if (/strong sell|sell|negative/.test(t)) return 1;
    return null;
  };
  let upgrades = 0, downgrades = 0;
  for (const g of recent) {
    const to = rank(g.newGrade ?? g.gradeTo ?? g.newsTitle);
    const from = rank(g.previousGrade ?? g.gradeFrom);
    if (isNum(to) && isNum(from)) {
      if (to > from) upgrades++;
      else if (to < from) downgrades++;
    } else if (/upgrade/i.test(g.action || '')) upgrades++;
    else if (/downgrade/i.test(g.action || '')) downgrades++;
  }

  // Earnings surprise streak over the last four reported quarters.
  const earnings = arr(ds.get('earnings'))
    .filter((e) => isNum(e.epsActual) && isNum(e.epsEstimated))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);
  const beats = earnings.length ? earnings.filter((e) => e.epsActual > e.epsEstimated).length : null;

  return {
    self, bench,
    rel12m1: rel(335, 30),          // 12 months, skipping the most recent one
    rel6m: rel(183),
    rel3m: rel(92),
    rel1m: rel(30),
    abs12m: returnOver(self, 365),
    benchmarkLoaded: bench.length > 1,
    vs50d: vs(facts.avg50),
    vs200d: vs(facts.avg200),
    rangePos,
    upgrades, downgrades,
    netUpgrades: recent.length ? upgrades - downgrades : null,
    beats, reported: earnings.length,
  };
}

/* ==========================================================================
   Factor scoring
   ========================================================================== */

function scoreMetric(def, ctx, cohortStats) {
  const value = def.self(ctx);
  const row = { id: def.id, label: def.label, fmt: def.fmt, value, weight: def.weight,
                higherIsBetter: def.higherIsBetter, absolute: !!def.absolute };

  if (def.absolute) {
    row.grade = gradeFromBands(value, def.bands);
    row.basis = 'band';
    row.bands = def.bands;
  } else {
    const peerValues = Object.values(cohortStats || {}).map((r) => {
      try { return def.peer(r); } catch { return null; }
    });
    const d = describe(value, peerValues, { higherIsBetter: def.higherIsBetter });
    Object.assign(row, d);
    row.basis = d.available ? 'cohort' : 'none';
    // A metric with no usable cohort still has a value worth showing; it just
    // cannot be graded, so it drops out of the weighted average rather than
    // scoring zero.
    if (!d.available) row.grade = null;
  }

  if (def.trend) {
    const t = def.trend(ctx);
    if (t && isNum(t.value) && isNum(value)) {
      row.trend = { ...t, delta: value - t.value,
        direction: value > t.value ? 'up' : value < t.value ? 'down' : 'flat' };
    }
  }

  row.verdict = verdict(row.grade);
  row.note = def.say ? def.say(row, ctx) : '';
  return row;
}

function scoreFactor(key, ctx, cohortStats) {
  const defs = METRICS[key] || [];
  const metrics = defs.map((d) => scoreMetric(d, ctx, cohortStats));
  const scored = metrics.filter((m) => isNum(m.grade));
  const wsum = scored.reduce((a, m) => a + m.weight, 0);
  const grade = wsum > 0 ? scored.reduce((a, m) => a + m.grade * m.weight, 0) / wsum : null;
  const meta = FACTOR_META.find((f) => f.key === key);

  return {
    key, label: meta.label, question: meta.question, anchor: meta.anchor,
    grade, metrics,
    graded: scored.length, total: metrics.length,
    coverage: metrics.length ? scored.length / metrics.length : 0,
    verdict: verdict(grade),
  };
}

/** 1–5 composite -> the call your platform already shows. */
export function ratingLabel(grade) {
  if (!isNum(grade)) return 'Not rated';
  if (grade >= 4.3) return 'Strong Buy';
  if (grade >= 3.5) return 'Buy';
  if (grade >= 2.5) return 'Hold';
  if (grade >= 1.7) return 'Sell';
  return 'Strong Sell';
}

/* ==========================================================================
   Dividend & Management — evidence sections, deliberately unscored
   ========================================================================== */

function deriveDividends(ds) {
  const rows = arr(ds.get('dividends'));
  if (!rows.length) return { available: false, rows: [], byYear: [], years: 0 };

  const map = new Map();
  for (const d of rows) {
    const y = yearOf(d.date ?? d.paymentDate ?? d.recordDate);
    const amt = d.adjDividend ?? d.dividend ?? 0;
    if (!isNum(y) || !isNum(amt)) continue;
    map.set(y, (map.get(y) || 0) + amt);
  }
  const thisYear = new Date().getUTCFullYear();
  const byYear = [...map.entries()].filter(([y]) => y < thisYear)
    .sort((a, b) => a[0] - b[0]).slice(-10)
    .map(([year, amount]) => ({ year, amount }));

  if (byYear.length < 2) return { available: true, rows, byYear, years: byYear.length };

  let worstDrop = 0;
  for (let i = 1; i < byYear.length; i++) {
    const p = byYear[i - 1].amount, c = byYear[i].amount;
    if (p > 0) worstDrop = Math.min(worstDrop, c / p - 1);
  }
  const span = byYear.at(-1).year - byYear[0].year;
  const growth = cagr(byYear[0].amount, byYear.at(-1).amount, span || 1);

  return {
    available: true, rows, byYear, years: byYear.length, worstDrop,
    stable: worstDrop > -0.20, growing: isNum(growth) ? growth > 0 : null, growth,
  };
}

function deriveExecs(ds, facts, history) {
  const list = arr(ds.get('executives'));
  const comp = arr(ds.get('execComp'));

  const ceo = list.find((e) => /chief executive|(^|\W)ceo(\W|$)/i.test(e.title || ''))
    || (facts.ceo ? { name: facts.ceo, title: 'Chief Executive Officer', pay: null } : null);

  const tenureOf = (e) => {
    const since = e?.titleSince ? new Date(e.titleSince) : null;
    return since && !Number.isNaN(since.getTime())
      ? (Date.now() - since.getTime()) / (365.25 * 24 * 3600 * 1000) : null;
  };
  const isBoard = (e) => /director|chair|board/i.test(e.title || '');
  const mgmt = list.filter((e) => !isBoard(e));
  const board = list.filter(isBoard);

  const isCeoRow = (c) => /chief executive|(^|\W)ceo(\W|$)/i.test(c.nameAndPosition || c.position || '');
  const byYear = new Map();
  for (const c of comp.filter(isCeoRow)) {
    if (!isNum(c.year)) continue;
    const seen = byYear.get(c.year);
    if (!seen || new Date(c.filingDate || 0) > new Date(seen.filingDate || 0)) byYear.set(c.year, c);
  }
  const compHistory = [...byYear.values()].sort((a, b) => a.year - b.year);
  const latestComp = compHistory.at(-1) || null;
  const prevComp = compHistory.at(-2) || null;
  const ceoTotal = latestComp?.total ?? (isNum(ceo?.pay) ? ceo.pay : null);

  const capBand = !isNum(facts.marketCap) ? null
    : facts.marketCap >= 200e9 ? { label: 'mega-cap', typical: 25e6 }
    : facts.marketCap >= 8e9   ? { label: 'large-cap', typical: 16e6 }
    : facts.marketCap >= 2e9   ? { label: 'mid-cap', typical: 7e6 }
    : facts.marketCap >= 300e6 ? { label: 'small-cap', typical: 3.5e6 }
    : { label: 'micro-cap', typical: 1.5e6 };

  const payChange = (latestComp && prevComp && isNum(latestComp.total) && isNum(prevComp.total) && prevComp.total > 0)
    ? latestComp.total / prevComp.total - 1 : null;

  return {
    ceo, list, mgmt, board, compHistory, ceoTotal,
    ceoSalary: latestComp?.salary ?? null,
    capBand, payChange,
    earningsChange: history?.growth1y ?? null,
    ceoTenure: tenureOf(ceo),
    managementTenure: mean(mgmt.map(tenureOf)),
    boardTenure: mean(board.map(tenureOf)),
  };
}

/* ==========================================================================
   Highlights
   ========================================================================== */

function deriveHighlights(factors, facts, cohort) {
  const all = Object.values(factors).flatMap((f) => f.metrics.map((m) => ({ ...m, factor: f.label })));
  const graded = all.filter((m) => isNum(m.grade));
  const where = cohort.label;

  const line = (m) => {
    if (m.basis === 'cohort' && isNum(m.rank)) {
      return `${m.label} of ${m.fmt(m.value)} ranks ${ordinal(m.rank)} of ${m.total} in ${where}.`;
    }
    return `${m.label} of ${m.fmt(m.value)}.`;
  };

  const best = graded.slice().sort((a, b) => b.grade - a.grade).slice(0, 4);
  const worst = graded.slice().sort((a, b) => a.grade - b.grade).slice(0, 4);

  return {
    rewards: best.filter((m) => m.grade >= 3.4).map(line),
    risks: worst.filter((m) => m.grade < 2.6).map(line),
  };
}

function verdictLine(factors, composite) {
  const strong = Object.values(factors).filter((f) => isNum(f.grade) && f.grade >= 3.9)
    .map((f) => f.label.toLowerCase());
  const weak = Object.values(factors).filter((f) => isNum(f.grade) && f.grade < 2.3)
    .map((f) => f.label.toLowerCase());

  if (!strong.length && !weak.length) return 'Grades cluster around the sector average across all five factors.';
  const bits = [];
  if (strong.length) bits.push(`Strong on ${strong.join(' and ')}`);
  if (weak.length) bits.push(`${strong.length ? 'weak' : 'Weak'} on ${weak.join(' and ')}`);
  return bits.join(', ') + '.';
}

/* ==========================================================================
   Entry point
   ========================================================================== */

export function analyse(ds, { cohortStats = null, benchSeries = null } = {}) {
  const bm = loadBenchmarks();

  const facts = deriveFacts(ds);
  const forecast = deriveForecast(ds, facts);
  const history = deriveHistory(ds, facts);
  const momentum = deriveMomentum(ds, facts, benchSeries);
  const dividends = deriveDividends(ds);
  const execs = deriveExecs(ds, facts, history);
  const cohort = buildCohort(ds, facts);

  const ctx = { facts, forecast, history, momentum, bm, ds };

  const factors = {};
  for (const f of FACTOR_META) factors[f.key] = scoreFactor(f.key, ctx, cohortStats);

  const weights = {
    value: bm.wValue, growth: bm.wGrowth, profitability: bm.wProfitability,
    health: bm.wHealth, momentum: bm.wMomentum,
  };
  const graded = FACTOR_META.filter((f) => isNum(factors[f.key].grade));
  const wsum = graded.reduce((a, f) => a + (weights[f.key] ?? f.weight), 0);
  const composite = wsum > 0
    ? graded.reduce((a, f) => a + factors[f.key].grade * (weights[f.key] ?? f.weight), 0) / wsum
    : null;

  // Live industry P/E, which replaces the old hardcoded benchmark table.
  const industryRow = arr(ds.get('industryPe'))
    .filter((r) => r.industry === facts.industry)
    .sort((a, b) => (b.pe || 0) - (a.pe || 0))[0] || null;

  const { rewards, risks } = deriveHighlights(factors, facts, cohort);

  return {
    ds, bm, facts, forecast, history, momentum, dividends, execs,
    cohort, cohortStats: cohortStats || {},
    factors,
    composite,
    rating: ratingLabel(composite),
    weights,
    industryPe: industryRow && industryRow.pe > 0 ? industryRow.pe : null,
    industryPeHist: arr(ds.get('industryPeHist')),
    fairValue: facts.fairValue,
    discount: facts.dcfDiscount,
    rewards, risks,
    verdict: verdictLine(factors, composite),
  };
}
