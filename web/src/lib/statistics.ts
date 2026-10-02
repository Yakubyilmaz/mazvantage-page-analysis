// Ported from assets/js/statistics.js (the data half) — the metric groups of the
// Statistics & Metrics tab. The view is components/report/tabs/statistics-tab.tsx.
import { isNum, money, num, pct, dec, price, yearOf, parseDate, fmtDate, curSymbol } from './format';

/* ==========================================================================
   Formatting

   Bound to the company once, so a row definition never has to reach for the
   reporting currency itself.
   ========================================================================== */

export function formatters(a: any) {
  const cur = curSymbol(a.facts.currency);
  return {
    money: (v: any) => money(v, { currency: cur }),
    price: (v: any) => price(v, cur),
    pct: (v: any, dp = 1) => (isNum(v) ? pct(v, { dp }) : 'n/a'),
    signed: (v: any) => (isNum(v) ? pct(v, { sign: true }) : 'n/a'),
    mult: (v: any) => (isNum(v) ? `${dec(v, 2)}x` : 'n/a'),
    ratio: (v: any) => (isNum(v) ? dec(v, 2) : 'n/a'),
    count: (v: any) => (isNum(v) ? num(v, 2) : 'n/a'),
    days: (v: any) => (isNum(v) ? `${dec(v, 0)} days` : 'n/a'),
    perShare: (v: any) => (isNum(v) ? `${cur}${dec(v, 2)}` : 'n/a'),
    whole: (v: any) => (isNum(v) ? v.toLocaleString('en-US') : 'n/a'),
    text: (v: any) => (v == null || v === '' ? 'n/a' : String(v)),
    yesNo: (v: any) => (v == null ? 'n/a' : v ? 'Yes' : 'No'),
  };
}

/**
 * A range printed as one value: "US$169.21 – US$260.10".
 *
 * Two statLines would take twice the height for a pair nobody reads apart,
 * and the low on its own is not a statistic anybody wants.
 */
const range = (f: any, lo: any, hi: any) => (isNum(lo) && isNum(hi) ? `${f.price(lo)} – ${f.price(hi)}` : 'n/a');

/* ==========================================================================
   The groups

   One entry per card. `rows` is built at render time because every value
   comes off the analysis; the shape is flat on purpose — a row is a label, a
   printed value, the period it covers, and an optional sentence on hover.

   `dir` is the raw number behind a figure that has a direction, and is what
   the green/red colouring reads. It is kept beside the printed string rather
   than parsed back out of it: "US$-1.95 (-0.6%)" and "-35 days" and "+6.4%"
   are three different shapes of the same question, and a regular expression
   over all of them would be a bug waiting for the first unusual formatter.
   ========================================================================== */

const row = (label: any, value: any, basis = '', title = '', dir: any = null) => ({ label, value, basis, title, dir });

/**
 * A row that also keeps the number it printed.
 *
 * `raw` is what the Stock Screener filters on and `kind` is the formatter that
 * printed it, which tells the screener what unit a typed threshold is in. Kept
 * beside the string for the same reason `dir` is: parsing "US$1.2b" back out
 * of the printed value would be a second definition of every figure here.
 */
const withRaw = (r: any, raw: any, kind: StatKind) => ({ ...r, raw: isNum(raw) ? raw : null, kind });

/* ==========================================================================
   The metric groups
   ========================================================================== */

/** The formatter a row's figure went through; `text` and `yesNo` are never screened. */
export type StatKind = 'money' | 'price' | 'pct' | 'signed' | 'mult' | 'ratio' | 'count' | 'days' | 'perShare' | 'whole' | 'year';

export interface StatRow {
  label: string; value: string; basis: string; title: string; dir: number | null | undefined;
  /** the number behind `value`, for rows that have one */
  raw?: number | null;
  kind?: StatKind;
}

export interface StatGroup {
  key: string;
  title: string;
  /** span on the twelve-column grid */
  c: 4 | 12;
  info: string;
  rows: StatRow[];
  /** the operating expense series, for the one card that is a chart */
  opex?: any;
  /** what to say when the group's feed is missing, rather than dropping the card */
  gate?: { feed: string; what: string; missing: string };
}

export function buildGroups(a: any): StatGroup[] {
  const f = a.facts;
  const v = a.val || {};
  const g = a.growth || {};
  const fc = a.forecast || {};
  const m = a.momentum || {};
  const d = a.dividends || {};
  const q = a.quarter || {};
  const oe = a.ownerEarnings || {};
  const ins = a.insiders || {};
  const fmt = formatters(a);

  // Read straight off the feeds for the fields `model.js` has no reason to
  // normalise — this page is the only consumer of most of them, and lifting
  // sixty pass-through fields into `facts` would be sixty lines that say
  // nothing but their own name.
  const r = a.ds.get('ratiosTtm') || {};
  const km = a.ds.get('metricsTtm') || {};
  const profile = a.ds.get('profile') || {};
  const sc = a.ds.get('scores') || {};
  const float = a.ds.get('sharesFloat') || null;
  const grades = a.ds.get('grades') || null;
  const target = a.ds.get('priceTarget') || null;
  const holders = a.ds.get('institutional');
  const estimates = a.ds.get('estimates');

  // The newest annual row of the growth feed. `a.growth` carries the dozen
  // fields the rest of the report grades on, with fallbacks; these are the
  // rest of the row, which have no fallback and simply go missing when the
  // feed does.
  const gr = (() => {
    const rows = a.ds.get('growth');
    if (!Array.isArray(rows) || !rows.length) return {};
    return [...rows].sort((x, y) => +new Date(y.date) - +new Date(x.date))[0] || {};
  })();

  /** A row printed by one of the formatters, keeping the number it printed. */
  const nrow = (label: any, kind: Exclude<StatKind, 'year'> | 'text' | 'yesNo', x: any, basis = '', title = '', dir: any = null) => {
    const r = row(label, (fmt as any)[kind](x), basis, title, dir);
    return kind === 'text' || kind === 'yesNo' ? r : withRaw(r, x, kind);
  };

  /** A row whose figure is a change, printed signed and coloured by direction. */
  const drow = (label: any, x: any, basis = '', title = '') => nrow(label, 'signed', x, basis, title, x);

  // The fiscal year the filed statements end on, for rows that are not TTM.
  const filedYear = yearOf(f.lastReported);
  const filed = isNum(filedYear) ? `FY${filedYear}` : 'last filed year';
  const onPrior = `${filed} vs prior`;

  const lastExDate = (d.rows || [])
    .map((x: any) => parseDate(x.date))
    .filter(Boolean)
    .sort((x: any, y: any) => y - x)[0] || null;

  const outstanding = float?.outstandingShares ?? f.shares ?? null;
  const freeFloat = float?.floatShares ?? null;
  const closelyHeld = isNum(outstanding) && isNum(freeFloat)
    ? Math.max(outstanding - freeFloat, 0) : null;

  const avgVolume = profile.averageVolume ?? null;
  const volumeVsAvg = isNum(f.volume) && avgVolume > 0 ? f.volume / avgVolume - 1 : null;

  const nextEst = Array.isArray(estimates)
    ? [...estimates].sort((x, y) => +new Date(x.date) - +new Date(y.date))
      .find((e) => yearOf(e.date)! >= (fc.base?.year ?? -Infinity)) || null
    : null;

  const topHolder = Array.isArray(holders) && holders.length
    ? [...holders].sort((x, y) => (y.marketValue ?? 0) - (x.marketValue ?? 0))[0] : null;

  return [
    {
      key: 'company', title: 'Company', c: 4,
      info: 'Identity and registration, as the company profile carries it. Nothing here '
        + 'is a measurement — it is what the rest of the page is measuring.',
      rows: [
        nrow('Name', 'text', f.name),
        nrow('Ticker', 'text', f.symbol),
        nrow('Exchange', 'text', f.exchangeFull || f.exchange),
        nrow('Sector', 'text', f.sector),
        nrow('Industry', 'text', f.industry),
        nrow('Country', 'text', profile.country),
        nrow('Chief executive', 'text', profile.ceo),
        nrow('Employees', 'whole', f.employees, 'latest reported'),
        withRaw(row('Listed since', f.ipoDate ? fmtDate(f.ipoDate) : 'n/a'), yearOf(f.ipoDate), 'year'),
        nrow('Reporting currency', 'text', f.currency),
        nrow('Actively trading', 'yesNo', profile.isActivelyTrading),
        nrow('CIK', 'text', f.cik, '', 'The SEC’s own identifier for the filer.'),
        nrow('ISIN', 'text', f.isin),
        nrow('CUSIP', 'text', profile.cusip),
      ],
    },

    {
      key: 'price', title: 'Share price', c: 4,
      info: 'Straight off the quote, so this is the only group on the page that moves during a '
        + 'trading session.',
      rows: [
        nrow('Price', 'price', f.price, 'current'),
        withRaw(row('Change today', isNum(f.change)
          ? `${fmt.price(f.change)} (${fmt.signed(f.changePct)})` : 'n/a', 'current', '', f.changePct), f.changePct, 'signed'),
        nrow('Open', 'price', f.open, 'today'),
        nrow('Previous close', 'price', f.previousClose, 'previous session'),
        row('Day range', range(fmt, f.dayLow, f.dayHigh), 'today'),
        row('52-week range', range(fmt, f.yearLow, f.yearHigh), 'trailing year'),
        nrow('50-day average', 'price', f.avg50, 'trailing 50 sessions'),
        nrow('200-day average', 'price', f.avg200, 'trailing 200 sessions'),
        nrow('Volume', 'count', f.volume, 'last session'),
        nrow('Average volume', 'count', avgVolume, 'trailing'),
        drow('Volume against average', volumeVsAvg, 'last session',
          'How busy the last session was against the usual day. Green is heavier than normal, '
          + 'which is a fact about attention rather than about direction.'),
        nrow('Beta', 'ratio', f.beta, '5-year',
          'How far the share has historically moved for a given move in the market. Above 1 is '
          + 'more volatile than the index, below 1 less.'),
        row('Quote taken', f.quoteTime
          ? fmtDate(f.quoteTime, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'n/a', ''),
      ],
    },

    {
      key: 'size', title: 'Size and shares', c: 4,
      info: 'Enterprise value is market capitalisation plus net debt — what the whole business '
        + 'costs, rather than what the equity costs.',
      rows: [
        nrow('Market capitalisation', 'money', f.marketCap, 'current'),
        nrow('Enterprise value', 'money', v.ev, 'current'),
        nrow('Shares outstanding', 'count', outstanding, 'latest reported'),
        nrow('Free float', 'count', freeFloat, 'latest reported',
          'Shares available to trade, after those held by insiders and other restricted holders.'),
        // Screened on the share, not the count: "closely held above 20%" is the
        // question, and a share count means nothing across companies.
        withRaw(row('Closely held', isNum(closelyHeld) && outstanding > 0
          ? `${fmt.count(closelyHeld)} (${fmt.pct(closelyHeld / outstanding)})` : 'n/a', 'latest reported'),
        isNum(closelyHeld) && outstanding > 0 ? closelyHeld / outstanding : null, 'pct'),
        withRaw(row('Float share', isNum(float?.freeFloat) ? fmt.pct(float.freeFloat / 100) : 'n/a', 'latest reported'),
          isNum(float?.freeFloat) ? float.freeFloat / 100 : null, 'pct'),
        drow('Diluted share count growth', gr.weightedAverageSharesDilutedGrowth, onPrior,
          'Green is a rising count, which is dilution — the one row on this page where the '
          + 'pleasant colour is the unwelcome direction. Read the sign, not the hue.'),
        nrow('Employees', 'whole', f.employees, 'latest reported'),
        nrow('Revenue per employee', 'money', isNum(f.revenue) && f.employees > 0 ? f.revenue / f.employees : null,
          'TTM over headcount'),
      ],
    },

    {
      key: 'multiples', title: 'Valuation multiples', c: 4,
      info: 'Forward figures divide today’s price by the current fiscal year’s consensus, which '
        + 'is the convention the sell side quotes.',
      rows: [
        nrow('P/E', 'mult', f.pe, 'TTM'),
        nrow('P/E (diluted)', 'mult', r.priceToEarningsDilutedRatioTTM, 'TTM'),
        nrow('P/E (forward)', 'mult', v.peFwd, 'current FY consensus'),
        nrow('PEG', 'mult', f.peg, 'TTM'),
        nrow('PEG (diluted)', 'mult', r.priceToEarningsDilutedGrowthRatioTTM, 'TTM'),
        nrow('PEG (forward, non-GAAP)', 'mult', v.pegNonGaap, 'current FY consensus'),
        nrow('Price / book', 'mult', f.pb, 'TTM'),
        nrow('Price / sales', 'mult', f.ps, 'TTM'),
        nrow('Price / sales (forward)', 'mult', v.psFwd, 'current FY consensus'),
        nrow('Price / free cash flow', 'mult', f.pfcf, 'TTM'),
        nrow('Price / operating cash flow', 'mult', v.priceToCashFlow, 'TTM'),
        nrow('EV / sales', 'mult', v.evToSales, 'TTM'),
        nrow('EV / EBITDA', 'mult', v.evToEbitda, 'TTM'),
        nrow('EV / EBIT', 'mult', v.evToEbit, 'TTM'),
        nrow('EV / operating cash flow', 'mult', km.evToOperatingCashFlowTTM, 'TTM'),
        nrow('EV / free cash flow', 'mult', km.evToFreeCashFlowTTM, 'TTM'),
        nrow('Enterprise value multiple', 'mult', r.enterpriseValueMultipleTTM, 'TTM',
          'Enterprise value over EBITDA, as published. The same figure as EV / '
          + 'EBITDA above, from a different feed — where they differ, they were computed at '
          + 'different moments.'),
        nrow('Debt / market capitalisation', 'mult', r.debtToMarketCapTTM, 'TTM'),
      ],
    },

    {
      key: 'fairvalue', title: 'Fair value estimates', c: 4,
      info: 'Model output, not measurement. Every figure here is somebody’s arithmetic about the '
        + 'future — the report’s own thirteen-model range lives on the Valuation tab.',
      rows: [
        nrow('Discounted cash flow', 'price', a.fairValue, 'reference model',
          'A published levered discounted cash flow. One model, shown as a reference point rather '
          + 'than as the report’s answer.'),
        drow('Discount to that value', a.discount, 'current',
          'Positive means the share trades below the model’s number.'),
        nrow('Price / fair value', 'mult', r.priceToFairValueTTM, 'TTM'),
        nrow('Graham number', 'perShare', v.grahamNumber, 'TTM',
          'A textbook fair value for a defensive investor: the square root of 22.5 × earnings '
          + 'per share × book value per share.'),
        nrow('Graham net-net', 'perShare', km.grahamNetNetTTM, 'TTM',
          'Current assets less every liability, per share. Graham’s liquidation floor, and '
          + 'deeply negative for almost any asset-light company — which is not a fault.'),
        nrow('Fair P/E for this growth', 'mult', a.fairPe, 'model',
          'The multiple the report’s own fair-ratio model considers justified by the forecast '
          + 'growth rate.'),
        nrow('Price target (consensus)', 'price', m.targetPrice, 'current'),
        nrow('Price target (median)', 'price', target?.targetMedian, 'current'),
        row('Price target range', range(fmt, target?.targetLow, target?.targetHigh), 'current'),
        drow('Implied upside', m.targetUpside, 'to consensus target'),
        drow('Implied total return', m.expectedTotalReturn, 'target plus yield'),
      ],
    },

    {
      key: 'yields', title: 'Yields', c: 4,
      info: 'The same multiples inverted. A yield is what one unit of price buys, which is the '
        + 'easier direction to compare against a bond.',
      rows: [
        nrow('Earnings yield', 'pct', v.earningsYield, 'TTM'),
        nrow('Free cash flow yield', 'pct', v.fcfYield, 'TTM'),
        nrow('Owner earnings yield', 'pct', oe.yield, 'TTM',
          'Owner earnings over market capitalisation — earnings plus non-cash charges, less the '
          + 'capital spending needed to stand still.'),
        nrow('Dividend yield', 'pct', f.dividendYield, 'TTM'),
        nrow('Buyback yield', 'pct', v.buybackYield, filed,
          'Shares bought back over the filed year, as a share of today’s market capitalisation.'),
        nrow('Shareholder yield', 'pct', v.shareholderYield, `TTM + ${filed}`,
          'Dividend yield plus buyback yield — the whole of what was returned, however it was '
          + 'returned. The two legs are measured over different periods.'),
      ],
    },

    {
      key: 'pershare', title: 'Per share', c: 4,
      info: 'Every headline divided by the share count. The denominator is the diluted average, '
        + 'so these move when the company issues or retires stock even if nothing else changed.',
      rows: [
        nrow('Revenue per share', 'perShare', r.revenuePerShareTTM, 'TTM'),
        nrow('Earnings per share', 'perShare', f.eps, 'TTM'),
        nrow('Net income per share', 'perShare', r.netIncomePerShareTTM, 'TTM'),
        nrow('Operating cash flow per share', 'perShare', r.operatingCashFlowPerShareTTM, 'TTM'),
        nrow('Free cash flow per share', 'perShare', r.freeCashFlowPerShareTTM, 'TTM'),
        nrow('Owner earnings per share', 'perShare', oe.perShare, 'TTM'),
        nrow('Capital expenditure per share', 'perShare', r.capexPerShareTTM, 'TTM'),
        nrow('Book value per share', 'perShare', f.bookValuePerShare, 'TTM'),
        nrow('Tangible book value per share', 'perShare', f.tangibleBookValuePerShare, 'TTM'),
        nrow('Shareholders’ equity per share', 'perShare', r.shareholdersEquityPerShareTTM, 'TTM'),
        nrow('Cash per share', 'perShare', f.cashPerShare, 'TTM'),
        nrow('Interest-bearing debt per share', 'perShare', r.interestDebtPerShareTTM, 'TTM'),
        nrow('Dividend per share', 'perShare', f.dividendPerShare, 'TTM'),
      ],
    },

    {
      key: 'margins', title: 'Margins', c: 4,
      info: 'Trailing twelve months. The Financials tab has the same margins per fiscal year, '
        + 'computed off the filed statements, and the two will not match exactly.',
      rows: [
        nrow('Gross margin', 'pct', f.grossMargin, 'TTM'),
        nrow('Operating margin', 'pct', f.operatingMargin, 'TTM'),
        nrow('EBIT margin', 'pct', r.ebitMarginTTM, 'TTM'),
        nrow('EBITDA margin', 'pct', f.ebitdaMargin, 'TTM'),
        nrow('Pre-tax margin', 'pct', r.pretaxProfitMarginTTM, 'TTM'),
        nrow('Net margin', 'pct', f.netMargin, 'TTM'),
        nrow('Continuing operations margin', 'pct', r.continuousOperationsProfitMarginTTM, 'TTM',
          'Net margin with discontinued operations taken out — the margin the business will '
          + 'still have next year.'),
        nrow('Bottom-line margin', 'pct', r.bottomLineProfitMarginTTM, 'TTM',
          'After minority interests and every other deduction below net income.'),
        nrow('Operating cash flow margin', 'pct', r.operatingCashFlowSalesRatioTTM, 'TTM'),
        nrow('Effective tax rate', 'pct', f.effectiveTaxRate, 'TTM'),
        nrow('Tax burden', 'pct', km.taxBurdenTTM, 'TTM',
          'Net income over pre-tax income — the share of profit that survives tax.'),
        nrow('Interest burden', 'pct', km.interestBurdenTTM, 'TTM',
          'Pre-tax income over operating income — the share of operating profit that survives '
          + 'the interest bill.'),
      ],
    },

    {
      key: 'returns', title: 'Returns on capital', c: 4,
      info: 'What the business earns on the money tied up in it. These are the figures the '
        + 'Profitability factor grades against the sector.',
      rows: [
        nrow('Return on equity', 'pct', f.roe, 'TTM'),
        nrow('Return on assets', 'pct', f.roa, 'TTM'),
        nrow('Return on invested capital', 'pct', f.roic, 'TTM'),
        nrow('Return on capital employed', 'pct', f.roce, 'TTM'),
        nrow('Return on tangible assets', 'pct', f.returnOnTangibleAssets, 'TTM'),
        nrow('Operating return on assets', 'pct', km.operatingReturnOnAssetsTTM, 'TTM'),
        nrow('Invested capital', 'money', km.investedCapitalTTM, 'TTM'),
        nrow('Retained earnings', 'money', sc.retainedEarnings, 'latest filed',
          'Every profit the company has ever kept, less every dividend it has ever paid. '
          + 'Negative after enough buybacks, which is a bookkeeping fact rather than a loss.'),
      ],
    },

    // The one card in the grid that is a chart. It sits here rather than in a
    // panel of its own because its rows are genuinely metrics — R&D as a share
    // of revenue is something people look up — where a segment mix is not.
    opexGroup(a, a.opex || { available: false, rows: [], latest: null }, fmt),

    {
      key: 'efficiency', title: 'Efficiency', c: 4,
      info: 'How hard the balance sheet is working and how long cash is tied up in the operating '
        + 'cycle.',
      rows: [
        nrow('Asset turnover', 'mult', f.assetTurnover, 'TTM'),
        nrow('Fixed asset turnover', 'mult', f.fixedAssetTurnover, 'TTM'),
        nrow('Working capital turnover', 'mult', r.workingCapitalTurnoverRatioTTM, 'TTM',
          'Revenue over working capital. Enormous where working capital is near zero, which is '
          + 'arithmetic rather than efficiency.'),
        nrow('Receivables turnover', 'mult', r.receivablesTurnoverTTM, 'TTM'),
        nrow('Inventory turnover', 'mult', r.inventoryTurnoverTTM, 'TTM'),
        nrow('Payables turnover', 'mult', r.payablesTurnoverTTM, 'TTM'),
        nrow('Days sales outstanding', 'days', km.daysOfSalesOutstandingTTM, 'TTM'),
        nrow('Days inventory outstanding', 'days', km.daysOfInventoryOutstandingTTM, 'TTM'),
        nrow('Days payables outstanding', 'days', km.daysOfPayablesOutstandingTTM, 'TTM'),
        nrow('Operating cycle', 'days', km.operatingCycleTTM, 'TTM',
          'Days from paying for inventory to collecting on the sale, before any credit the '
          + 'company itself takes.'),
        nrow('Cash conversion cycle', 'days', km.cashConversionCycleTTM, 'TTM',
          'The operating cycle less the credit taken from suppliers. Negative means the company '
          + 'is paid before it pays, which is a funding advantage.'),
        nrow('Average receivables', 'money', km.averageReceivablesTTM, 'TTM'),
        nrow('Average inventory', 'money', km.averageInventoryTTM, 'TTM'),
        nrow('Average payables', 'money', km.averagePayablesTTM, 'TTM'),
        nrow('Capex / revenue', 'pct', f.capexToRevenue, 'TTM'),
        nrow('Capex / operating cash flow', 'pct', km.capexToOperatingCashFlowTTM, 'TTM'),
        nrow('Capex / depreciation', 'mult', km.capexToDepreciationTTM, 'TTM',
          'Under 1x for long enough means the asset base is shrinking faster than it is replaced.'),
        nrow('R&D / revenue', 'pct', km.researchAndDevelopementToRevenueTTM, 'TTM'),
        nrow('SG&A / revenue', 'pct', km.salesGeneralAndAdministrativeToRevenueTTM, 'TTM'),
        nrow('Stock compensation / revenue', 'pct', f.sbcToRevenue, 'TTM'),
      ],
    },

    {
      key: 'position', title: 'Liquidity and leverage', c: 4,
      info: 'All trailing twelve months, so these are more recent than the balance sheet columns '
        + 'on the Financials tab.',
      rows: [
        nrow('Cash & equivalents', 'money', f.cash, 'TTM'),
        nrow('Total debt', 'money', f.totalDebt, 'TTM'),
        nrow('Net debt', 'money', f.netDebt, 'TTM'),
        nrow('Working capital', 'money', f.workingCapital, 'TTM'),
        nrow('Current ratio', 'mult', f.currentRatio, 'TTM'),
        nrow('Quick ratio', 'mult', f.quickRatio, 'TTM'),
        nrow('Cash ratio', 'mult', f.cashRatio, 'TTM'),
        nrow('Debt / equity', 'mult', f.debtToEquity, 'TTM'),
        nrow('Debt / assets', 'mult', f.debtToAssets, 'TTM'),
        nrow('Debt / capital', 'mult', f.debtToCapital, 'TTM'),
        nrow('Long-term debt / capital', 'mult', f.longTermDebtToCapital, 'TTM'),
        nrow('Financial leverage', 'mult', f.financialLeverage, 'TTM'),
        nrow('Net debt / EBITDA', 'mult', f.netDebtToEbitda, 'TTM'),
        nrow('Interest coverage', 'mult', f.interestCover, 'TTM'),
        nrow('Debt service coverage', 'mult', f.debtServiceCoverage, 'TTM'),
        nrow('Solvency ratio', 'mult', f.solvencyRatio, 'TTM'),
        nrow('Operating cash flow ratio', 'mult', r.operatingCashFlowRatioTTM, 'TTM',
          'Operating cash flow over current liabilities — the year’s bills against the year’s '
          + 'cash, rather than against the assets that might cover them.'),
        nrow('Operating cash flow / debt', 'mult', r.operatingCashFlowCoverageRatioTTM, 'TTM'),
        nrow('Short-term debt coverage', 'mult', r.shortTermOperatingCashFlowCoverageRatioTTM, 'TTM'),
        nrow('Capital expenditure coverage', 'mult', r.capitalExpenditureCoverageRatioTTM, 'TTM',
          'Operating cash flow over capital expenditure — how many times the year’s investment '
          + 'was covered by the year’s cash.'),
        nrow('Dividend and capex coverage', 'mult', r.dividendPaidAndCapexCoverageRatioTTM, 'TTM',
          'The same, with the dividend added to what has to be covered.'),
      ],
    },

    {
      key: 'quality', title: 'Quality and strength', c: 4,
      info: 'Published composite scores, plus the earnings-quality reads. Shown as '
        + 'reference figures — the report’s own grade is on the Ratings tab.',
      rows: [
        nrow('Altman Z-score', 'ratio', f.altmanZ, 'latest filed',
          'A bankruptcy-distance score. Above 3 is conventionally safe, under 1.8 distressed. '
          + 'Built for manufacturers, and misleading for banks and asset-light businesses.'),
        withRaw(row('Piotroski F-score', isNum(f.piotroski) ? `${dec(f.piotroski, 0)} / 9` : 'n/a', 'latest filed',
          'Nine pass/fail accounting tests. Counts how many the company passes, not how well.'), f.piotroski, 'count'),
        nrow('Beneish M-Score', 'ratio', a.beneish?.latest?.m,
          isNum(a.beneish?.latest?.year) ? `FY${a.beneish.latest.year} vs prior` : 'last two filed years',
          'Eight accounting ratios that, in Beneish’s 1999 sample, separated companies later caught '
          + 'manipulating earnings from those that were not. Above −1.78 flags the pattern, which honest '
          + 'fast growth can produce too; it is not evidence. Not meaningful for banks and insurers.'),
        nrow('Income quality', 'mult', f.incomeQuality, 'TTM',
          'Operating cash flow over net income. Below 1 for long means profit is being booked '
          + 'faster than it is collected.'),
        nrow('Free cash flow / operating cash flow', 'pct', f.fcfToOcf, 'TTM'),
        nrow('Owner earnings', 'money', oe.ttm, oe.available ? oe.span : 'TTM',
          'Reported earnings plus non-cash charges, less the capital spending needed to hold '
          + 'position. Summed from four filed quarters.'),
        nrow('Free cash flow to equity', 'money', km.freeCashFlowToEquityTTM, 'TTM',
          'The cash left for shareholders after debt is serviced.'),
        nrow('Free cash flow to firm', 'money', km.freeCashFlowToFirmTTM, 'TTM',
          'The cash left for everyone who funded the business, lenders included.'),
        nrow('Intangibles / total assets', 'pct', km.intangiblesToTotalAssetsTTM, 'TTM'),
        nrow('Tangible asset value', 'money', km.tangibleAssetValueTTM, 'TTM'),
        // A total, not a per-share figure, despite reading like one — the
        // vendor's field is the whole amount.
        nrow('Net current asset value', 'money', km.netCurrentAssetValueTTM, 'TTM',
          'Current assets less every liability. Benjamin Graham’s liquidation floor; deeply '
          + 'negative for almost any asset-light company, which is not a fault.'),
      ],
    },

    {
      key: 'growth', title: 'Growth', c: 4,
      info: 'Year-on-year figures compare the last filed fiscal year with the one before it, not '
        + 'trailing twelve months against the prior twelve. Multi-year figures are annualised.',
      rows: [
        drow('Revenue growth', g.revenueYoy, onPrior),
        drow('Revenue growth, 3-year', g.revenue3y, 'annualised'),
        drow('Revenue growth, 5-year', g.revenue5y, 'annualised'),
        drow('Gross profit growth', gr.grossProfitGrowth, onPrior),
        drow('EBITDA growth', g.ebitda, onPrior),
        drow('EBIT growth', gr.ebitgrowth, onPrior),
        drow('Operating income growth', g.ebit, onPrior),
        drow('Net income growth', g.netIncome, onPrior),
        drow('Net income growth, 5-year', g.netIncome5y, 'cumulative'),
        drow('EPS growth', g.eps, onPrior),
        drow('Diluted EPS growth', g.epsDiluted, onPrior),
        drow('Operating cash flow growth', g.ocf, onPrior),
        drow('Free cash flow growth', g.fcf, onPrior),
        drow('Capital expenditure growth', g.capex, onPrior),
        drow('R&D growth', g.rdExpense, onPrior),
        drow('SG&A growth', gr.sgaexpensesGrowth, onPrior),
        drow('Receivables growth', gr.receivablesGrowth, onPrior),
        drow('Inventory growth', gr.inventoryGrowth, onPrior),
        drow('Total asset growth', gr.assetGrowth, onPrior),
        drow('Debt growth', gr.debtGrowth, onPrior),
        drow('Book value per share growth', g.bookValue, onPrior),
        drow('Dividend per share growth', g.dps, 'last full year'),
        drow('Dividend growth, 3-year', g.dividend3y, 'cumulative'),
      ],
    },

    {
      key: 'pershare-growth', title: 'Growth per share', c: 4,
      info: 'Cumulative growth in each figure divided by the share count — so a buyback shows up '
        + 'here and does not in the group above. Not annualised: a 10-year figure of 174% means '
        + 'the per-share number is 2.74 times what it was, over the whole decade.',
      rows: [
        drow('Revenue per share, 3-year', gr.threeYRevenueGrowthPerShare, 'cumulative'),
        drow('Revenue per share, 5-year', gr.fiveYRevenueGrowthPerShare, 'cumulative'),
        drow('Revenue per share, 10-year', gr.tenYRevenueGrowthPerShare, 'cumulative'),
        drow('Net income per share, 3-year', gr.threeYNetIncomeGrowthPerShare, 'cumulative'),
        drow('Net income per share, 5-year', gr.fiveYNetIncomeGrowthPerShare, 'cumulative'),
        drow('Net income per share, 10-year', gr.tenYNetIncomeGrowthPerShare, 'cumulative'),
        drow('Operating cash flow per share, 3-year', gr.threeYOperatingCFGrowthPerShare, 'cumulative'),
        drow('Operating cash flow per share, 5-year', gr.fiveYOperatingCFGrowthPerShare, 'cumulative'),
        drow('Operating cash flow per share, 10-year', gr.tenYOperatingCFGrowthPerShare, 'cumulative'),
        drow('Equity per share, 3-year', gr.threeYShareholdersEquityGrowthPerShare, 'cumulative'),
        drow('Equity per share, 5-year', gr.fiveYShareholdersEquityGrowthPerShare, 'cumulative'),
        drow('Equity per share, 10-year', gr.tenYShareholdersEquityGrowthPerShare, 'cumulative'),
        drow('Dividend per share, 3-year', gr.threeYDividendperShareGrowthPerShare, 'cumulative'),
        drow('Dividend per share, 5-year', gr.fiveYDividendperShareGrowthPerShare, 'cumulative'),
        drow('Dividend per share, 10-year', gr.tenYDividendperShareGrowthPerShare, 'cumulative'),
      ],
    },

    {
      key: 'forecast', title: 'Consensus and forecast', c: 4,
      info: 'Analyst estimates as aggregated. Growth rates are the median annual '
        + 'step across the estimate window, not an endpoint-to-endpoint rate.',
      rows: [
        nrow('Analysts covering (earnings)', 'whole', fc.analystCount, 'latest estimates'),
        nrow('Analysts covering (revenue)', 'whole', nextEst?.numAnalystsRevenue, 'latest estimates'),
        row('Forecast window', fc.available && fc.base && fc.target
          ? `${fc.base.year}–${fc.target.year}` : 'n/a', ''),
        drow('Forecast revenue growth', fc.revenueGrowth, 'annual, median step'),
        drow('Forecast earnings growth', fc.earningsGrowth, 'annual, median step'),
        drow('Forecast EPS growth', fc.epsGrowth, 'annual, median step'),
        nrow('Forecast revenue', 'money', nextEst?.revenueAvg, 'next estimate year'),
        row('Forecast revenue range', isNum(nextEst?.revenueLow) && isNum(nextEst?.revenueHigh)
          ? `${fmt.money(nextEst.revenueLow)} – ${fmt.money(nextEst.revenueHigh)}` : 'n/a', 'next estimate year'),
        nrow('Forecast EBITDA', 'money', nextEst?.ebitdaAvg, 'next estimate year'),
        nrow('Forecast EBIT', 'money', nextEst?.ebitAvg, 'next estimate year'),
        nrow('Forecast net income', 'money', nextEst?.netIncomeAvg, 'next estimate year'),
        nrow('Forecast EPS', 'perShare', nextEst?.epsAvg, 'next estimate year'),
        row('Forecast EPS range', isNum(nextEst?.epsLow) && isNum(nextEst?.epsHigh)
          ? `${fmt.perShare(nextEst.epsLow)} – ${fmt.perShare(nextEst.epsHigh)}` : 'n/a', 'next estimate year'),
        nrow('Forecast return on equity', 'pct', fc.futureRoe, 'end of window',
          'Forecast earnings over equity projected forward by retaining profit net of dividends '
          + 'and buybacks.'),
        nrow('Earnings retention', 'pct', fc.retention, filed,
          fc.retentionIsGross
            ? 'No cash flow statement, so buybacks could not be netted off — this is the dividend '
              + 'payout alone and overstates what is retained.'
            : 'Share of profit kept after dividends and buybacks.'),
        row('Analyst consensus', grades?.consensus || 'n/a', 'current'),
        row('Analyst mix', grades && m.analystTotal > 0
          ? `${grades.strongBuy ?? 0} / ${grades.buy ?? 0} / ${grades.hold ?? 0} / `
            + `${grades.sell ?? 0} / ${grades.strongSell ?? 0}`
          : 'n/a', 'strong buy → strong sell'),
      ],
    },

    {
      key: 'quarter', title: 'Last reported quarter', c: 4,
      info: 'The most recent quarter with actuals against what the street expected. A surprise is '
        + 'the actual over the estimate, so it is a percentage of the estimate rather than of '
        + 'the prior year.',
      rows: [
        row('Reported on', q.date ? fmtDate(q.date) : 'n/a', ''),
        nrow('Earnings per share', 'perShare', q.eps, 'actual'),
        nrow('Earnings per share expected', 'perShare', q.epsEstimate, 'consensus'),
        drow('Earnings surprise', q.epsSurprise, 'against consensus'),
        nrow('Revenue', 'money', q.revenue, 'actual'),
        nrow('Revenue expected', 'money', q.revenueEstimate, 'consensus'),
        drow('Revenue surprise', q.revenueSurprise, 'against consensus'),
        row('Next report expected', q.next ? fmtDate(q.next) : 'n/a', ''),
      ],
    },

    {
      key: 'momentum', title: 'Returns and risk', c: 4,
      info: 'Price returns, close to close, excluding dividends. The sector benchmark is the SPDR '
        + 'sector ETF and the market is SPY; both need live data.',
      rows: [
        drow('Return, 1 month', m.r1m, 'to latest close'),
        drow('Return, 3 months', m.r3m, 'to latest close'),
        drow('Return, 6 months', m.r6m, 'to latest close'),
        drow('Return, 9 months', m.r9m, 'to latest close'),
        drow('Return, 1 year', m.r1y, 'to latest close'),
        drow('Return, year to date', m.rYtd, 'from 1 January'),
        drow('Sector return, 1 year', m.sectorReturn, 'benchmark ETF'),
        drow('Market return, 1 year', m.marketReturn, 'SPY'),
        drow('Excess over sector', m.excessSector, '1 year'),
        drow('Excess over market', m.excessMarket, '1 year'),
        nrow('Price / 50-day average', 'mult', m.toAvg50, 'current'),
        nrow('Price / 200-day average', 'mult', m.toAvg200, 'current'),
        nrow('Below 52-week high', 'pct', m.offHigh, 'current'),
        nrow('Above 52-week low', 'pct', m.aboveLow, 'current'),
        nrow('Weekly volatility', 'pct', m.volatility, 'annualised',
          'Standard deviation of weekly returns, annualised.'),
        nrow('Maximum drawdown', 'pct', m.drawdown, 'trailing year',
          'The deepest peak-to-trough fall inside the window.'),
        nrow('Cost of equity', 'pct', m.costOfEquity, 'CAPM',
          'Risk-free rate plus beta times the equity risk premium, both set in Settings.'),
      ],
    },

    {
      key: 'dividends', title: 'Dividends', c: 4,
      info: 'History is aggregated by calendar year, and the current year is excluded until it is '
        + 'complete so a part-year does not read as a cut.',
      rows: [
        nrow('Dividend yield', 'pct', f.dividendYield, 'TTM'),
        nrow('Dividend per share', 'perShare', f.dividendPerShare, 'TTM'),
        nrow('Last dividend', 'perShare', profile.lastDividend, 'per share'),
        nrow('Payout ratio', 'pct', f.payoutRatio, 'TTM',
          'Dividends as a share of earnings.'),
        nrow('Cash payout ratio', 'pct', f.cashPayoutRatio, 'TTM',
          'Dividends as a share of free cash flow — the cash that actually pays them.'),
        withRaw(row('Years of history', d.years ? String(d.years) : 'n/a', 'complete calendar years'), d.years || null, 'count'),
        drow('Dividend growth', d.growth, 'annualised over the history'),
        // Screened as 0 where the history shows no cut, and as unknown where there
        // is no history to look at — the printed "none" covers both.
        withRaw(row('Deepest annual cut', isNum(d.worstDrop) && d.worstDrop < 0 ? fmt.signed(d.worstDrop) : 'none',
          'over the history', '', isNum(d.worstDrop) && d.worstDrop < 0 ? d.worstDrop : null),
        isNum(d.worstDrop) ? Math.min(d.worstDrop, 0) : null, 'signed'),
        // The feed's order is the vendor's, so take the latest date rather
        // than the first row and hope.
        row('Last ex-dividend date', lastExDate ? fmtDate(lastExDate) : 'n/a', ''),
      ],
    },

    {
      key: 'ownership', title: 'Insiders and institutions', c: 4,
      info: 'Insider dealing over the last four filed quarters, and the institutional register as '
        + 'of the last complete 13F quarter. Most insider selling is vesting and tax, not a view '
        + 'on the business.',
      rows: [
        nrow('Insider shares acquired', 'count', ins.acquired, ins.span || 'last four quarters'),
        nrow('Insider shares disposed', 'count', ins.disposed, ins.span || 'last four quarters'),
        nrow('Insider net', 'count', ins.net, ins.span || 'last four quarters', '', ins.net),
        nrow('Acquired / disposed', 'mult', ins.ratio, ins.span || 'last four quarters',
          'Above 1x means insiders bought more shares than they sold over the window.'),
        withRaw(row('Institutional holders listed', Array.isArray(holders) ? String(holders.length) : 'n/a',
          'last complete quarter',
          'How many came back, not how many exist — the list is capped at twenty.'),
        Array.isArray(holders) ? holders.length : null, 'count'),
        nrow('Largest institutional holder', 'text', topHolder?.investorName, 'last complete quarter'),
        nrow('Largest holder’s stake', 'pct', isNum(topHolder?.ownership) ? topHolder.ownership / 100 : null,
          'last complete quarter'),
        nrow('Largest holder’s position', 'money', topHolder?.marketValue, 'last complete quarter'),
      ],
    },
  ];
}

/* ==========================================================================
   The operating expense card

   The one chart in the metrics grid. It earns its place because the rows
   under it are genuinely metrics — R&D as a share of revenue is a figure
   people look up — and the chart is what turns "8.3% of revenue" from a fact
   about one year into a direction.
   ========================================================================== */

const OTHER_COLOR = 'var(--text-subtle)';


function opexGroup(a: any, o: any, fmt: any): StatGroup {
  const rows: any[] = [];
  const last = o.available ? o.latest : null;

  if (last) {
    const basis = isNum(last.year) ? `FY${last.year}` : 'latest filed year';
    // Every line against the revenue it was spent to earn, which is the only
    // way two companies of different sizes can be read side by side.
    const share = (x: any) => (isNum(x) && last.revenue > 0
      ? ` · ${fmt.pct(x / last.revenue)} of revenue` : '');
    const line = (label: any, x: any, title = '', withShare = true) => rows.push(withRaw(row(
      label, isNum(x) ? `${fmt.money(x)}${withShare ? share(x) : ''}` : 'n/a', basis, title), x, 'money'));

    // The denominator, carried at the top so the percentages under it have
    // something visible to be percentages of. No share of its own: "100% of
    // revenue" beside revenue is a row that has said nothing.
    line('Revenue', last.revenue, 'What every share below is measured against.', false);
    line('Cost of revenue', last.costOfRevenue,
      'Not an operating expense — it sits above gross profit — and here for the whole cost '
      + 'picture rather than as part of the total below.');
    line('Research & development', last.rnd);
    line('Selling & marketing', last.sm,
      'Reported separately by some filers only. Where it is missing it is inside the combined '
      + 'line below rather than absent.');
    line('General & administrative', last.ga,
      'Reported separately by some filers only. Where it is missing it is inside the combined '
      + 'line below rather than absent.');
    line('Selling, general & administrative', last.sga,
      o.splitReported ? 'The two lines above, as the filing also reports them combined.' : '');
    line('Other operating expenses', last.other,
      'The residual — total operating expenses less the named lines. Left out where it rounds '
      + 'to nothing, which for most companies it does.');
    line('Total operating expenses', last.total,
      'Everything between gross profit and operating income. Taken from the filed total where '
      + 'the feed carries one, and otherwise from gross profit less operating income, which is '
      + 'the same figure by the statement’s own identity.');
    line('Depreciation & amortisation', last.dna,
      'Non-cash, and already inside the lines above rather than additional to them.');
    line('Total costs & expenses', last.costAndExpenses,
      'Cost of revenue plus operating expenses — everything revenue has to cover before '
      + 'interest and tax.');
    line('Operating income', last.operatingIncome,
      'Gross profit less total operating expenses. The line the breakdown adds up to.');
  }

  return {
    key: 'opex', title: 'Operating expenses', c: 12,
    info: 'The filed fiscal year, not trailing twelve months, and every line shown against that '
      + 'year’s revenue. R&D and SG&A as a share of revenue also appear under Efficiency, on a '
      + 'trailing-twelve basis, and the two will differ.',
    opex: o.available ? o : null,
    gate: { feed: 'income', what: 'The income statement', missing: 'No operating expense lines were returned for this company.' },
    rows,
  };
}
