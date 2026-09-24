/* ==========================================================================
   Vanlior — the Statistics & Metrics tab

   The reference sheet. Every current figure the report holds, grouped by
   subject, each one saying what period it covers — and a filter box, because
   a page of three hundred numbers is something you look things up in rather
   than something you read.

   Three panels behind one strip: the metrics grid, and a panel each for the
   two revenue breakdowns. The breakdowns were cards in the grid and did not
   belong there — a segment mix is a shape over six years with a table under
   it, and a grid built for label-and-value rows either squashes that or is
   pulled out of shape by it.

   This is deliberately the flattest surface in the app:

   - **Nothing is graded and nothing is ranked.** The factor tabs already do
     that, with a sector distribution behind every row. Here a number is just
     the number, which is what you want when you came to check one.
   - **Every row states its basis.** TTM, a named fiscal year, "current", or
     the window a return covers. Half of these figures are trailing twelve
     months and half are annual filings, and a reference sheet that mixed the
     two silently would be worse than no reference sheet.
   - **Only changes are coloured.** A growth rate, a return, a surprise
     against consensus — anything that has a direction — prints green up and
     red down. A level does not: a P/E of 35x is not "up", and colouring every
     figure on the page would leave the colour meaning nothing.
   - **Nothing here is derived that is not derived elsewhere.** Each value is
     read off `a.facts`, `a.val`, `a.growth`, `a.forecast`, `a.momentum`,
     `a.dividends`, `a.ownerEarnings` or a feed, all of which `model.js`
     already built. The one exception is a handful of shares-outstanding
     percentages, which are a division between two fields on the same row.

   Rows with no value are kept by default and can be hidden with the toggle,
   rather than dropped: on this page "the report does not have this figure" is
   itself the answer to the lookup, and a silently missing row reads as a
   metric the app never knew about.
   ========================================================================== */

import {
  el, esc, isNum, money, num, pct, dec, price, yearOf, parseDate, fmtDate, signClass,
} from './util.js';
import { card, notice, feedGate, statLine, ohead, curSymbol, perfCagr } from './ui.js';
import { columnChart, multiLineChart } from './charts.js';

/* ==========================================================================
   Formatting

   Bound to the company once, so a row definition never has to reach for the
   reporting currency itself.
   ========================================================================== */

function formatters(a) {
  const cur = curSymbol(a.facts.currency);
  return {
    money: (v) => money(v, { currency: cur }),
    price: (v) => price(v, cur),
    pct: (v, dp = 1) => (isNum(v) ? pct(v, { dp }) : 'n/a'),
    signed: (v) => (isNum(v) ? pct(v, { sign: true }) : 'n/a'),
    mult: (v) => (isNum(v) ? `${dec(v, 2)}x` : 'n/a'),
    ratio: (v) => (isNum(v) ? dec(v, 2) : 'n/a'),
    count: (v) => (isNum(v) ? num(v, 2) : 'n/a'),
    days: (v) => (isNum(v) ? `${dec(v, 0)} days` : 'n/a'),
    perShare: (v) => (isNum(v) ? `${cur}${dec(v, 2)}` : 'n/a'),
    whole: (v) => (isNum(v) ? v.toLocaleString('en-US') : 'n/a'),
    text: (v) => (v == null || v === '' ? 'n/a' : String(v)),
    yesNo: (v) => (v == null ? 'n/a' : v ? 'Yes' : 'No'),
  };
}

/**
 * A range printed as one value: "US$169.21 – US$260.10".
 *
 * Two statLines would take twice the height for a pair nobody reads apart,
 * and the low on its own is not a statistic anybody wants.
 */
const range = (f, lo, hi) => (isNum(lo) && isNum(hi) ? `${f.price(lo)} – ${f.price(hi)}` : 'n/a');

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

const row = (label, value, basis = '', title = '', dir = null) => ({ label, value, basis, title, dir });

/* ==========================================================================
   The metric groups
   ========================================================================== */

function buildGroups(a) {
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
    return [...rows].sort((x, y) => new Date(y.date) - new Date(x.date))[0] || {};
  })();

  /** A row whose figure is a change, printed signed and coloured by direction. */
  const drow = (label, x, basis = '', title = '') => row(label, fmt.signed(x), basis, title, x);

  // The fiscal year the filed statements end on, for rows that are not TTM.
  const filedYear = yearOf(f.lastReported);
  const filed = isNum(filedYear) ? `FY${filedYear}` : 'last filed year';
  const onPrior = `${filed} vs prior`;

  const lastExDate = (d.rows || [])
    .map((x) => parseDate(x.date))
    .filter(Boolean)
    .sort((x, y) => y - x)[0] || null;

  const outstanding = float?.outstandingShares ?? f.shares ?? null;
  const freeFloat = float?.floatShares ?? null;
  const closelyHeld = isNum(outstanding) && isNum(freeFloat)
    ? Math.max(outstanding - freeFloat, 0) : null;

  const avgVolume = profile.averageVolume ?? null;
  const volumeVsAvg = isNum(f.volume) && avgVolume > 0 ? f.volume / avgVolume - 1 : null;

  const nextEst = Array.isArray(estimates)
    ? [...estimates].sort((x, y) => new Date(x.date) - new Date(y.date))
      .find((e) => yearOf(e.date) >= (fc.base?.year ?? -Infinity)) || null
    : null;

  const topHolder = Array.isArray(holders) && holders.length
    ? [...holders].sort((x, y) => (y.marketValue ?? 0) - (x.marketValue ?? 0))[0] : null;

  return [
    {
      key: 'company', title: 'Company', c: 4,
      info: 'Identity and registration, as the vendor’s company profile carries it. Nothing here '
        + 'is a measurement — it is what the rest of the page is measuring.',
      rows: [
        row('Name', fmt.text(f.name)),
        row('Ticker', fmt.text(f.symbol)),
        row('Exchange', fmt.text(f.exchangeFull || f.exchange)),
        row('Sector', fmt.text(f.sector)),
        row('Industry', fmt.text(f.industry)),
        row('Country', fmt.text(profile.country)),
        row('Chief executive', fmt.text(profile.ceo)),
        row('Employees', fmt.whole(f.employees), 'latest reported'),
        row('Listed since', f.ipoDate ? fmtDate(f.ipoDate) : 'n/a'),
        row('Reporting currency', fmt.text(f.currency)),
        row('Actively trading', fmt.yesNo(profile.isActivelyTrading)),
        row('CIK', fmt.text(f.cik), '', 'The SEC’s own identifier for the filer.'),
        row('ISIN', fmt.text(f.isin)),
        row('CUSIP', fmt.text(profile.cusip)),
      ],
    },

    {
      key: 'price', title: 'Share price', c: 4,
      info: 'Straight off the quote, so this is the only group on the page that moves during a '
        + 'trading session.',
      rows: [
        row('Price', fmt.price(f.price), 'current'),
        row('Change today', isNum(f.change)
          ? `${fmt.price(f.change)} (${fmt.signed(f.changePct)})` : 'n/a', 'current', '', f.changePct),
        row('Open', fmt.price(f.open), 'today'),
        row('Previous close', fmt.price(f.previousClose), 'previous session'),
        row('Day range', range(fmt, f.dayLow, f.dayHigh), 'today'),
        row('52-week range', range(fmt, f.yearLow, f.yearHigh), 'trailing year'),
        row('50-day average', fmt.price(f.avg50), 'trailing 50 sessions'),
        row('200-day average', fmt.price(f.avg200), 'trailing 200 sessions'),
        row('Volume', fmt.count(f.volume), 'last session'),
        row('Average volume', fmt.count(avgVolume), 'trailing'),
        drow('Volume against average', volumeVsAvg, 'last session',
          'How busy the last session was against the usual day. Green is heavier than normal, '
          + 'which is a fact about attention rather than about direction.'),
        row('Beta', fmt.ratio(f.beta), '5-year',
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
        row('Market capitalisation', fmt.money(f.marketCap), 'current'),
        row('Enterprise value', fmt.money(v.ev), 'current'),
        row('Shares outstanding', fmt.count(outstanding), 'latest reported'),
        row('Free float', fmt.count(freeFloat), 'latest reported',
          'Shares available to trade, after those held by insiders and other restricted holders.'),
        row('Closely held', isNum(closelyHeld) && outstanding > 0
          ? `${fmt.count(closelyHeld)} (${fmt.pct(closelyHeld / outstanding)})` : 'n/a', 'latest reported'),
        row('Float share', isNum(float?.freeFloat) ? fmt.pct(float.freeFloat / 100) : 'n/a', 'latest reported'),
        drow('Diluted share count growth', gr.weightedAverageSharesDilutedGrowth, onPrior,
          'Green is a rising count, which is dilution — the one row on this page where the '
          + 'pleasant colour is the unwelcome direction. Read the sign, not the hue.'),
        row('Employees', fmt.whole(f.employees), 'latest reported'),
        row('Revenue per employee', isNum(f.revenue) && f.employees > 0
          ? fmt.money(f.revenue / f.employees) : 'n/a', 'TTM over headcount'),
      ],
    },

    {
      key: 'multiples', title: 'Valuation multiples', c: 4,
      info: 'Forward figures divide today’s price by the current fiscal year’s consensus, which '
        + 'is the convention the sell side quotes.',
      rows: [
        row('P/E', fmt.mult(f.pe), 'TTM'),
        row('P/E (diluted)', fmt.mult(r.priceToEarningsDilutedRatioTTM), 'TTM'),
        row('P/E (forward)', fmt.mult(v.peFwd), 'current FY consensus'),
        row('PEG', fmt.mult(f.peg), 'TTM'),
        row('PEG (diluted)', fmt.mult(r.priceToEarningsDilutedGrowthRatioTTM), 'TTM'),
        row('PEG (forward, non-GAAP)', fmt.mult(v.pegNonGaap), 'current FY consensus'),
        row('Price / book', fmt.mult(f.pb), 'TTM'),
        row('Price / sales', fmt.mult(f.ps), 'TTM'),
        row('Price / sales (forward)', fmt.mult(v.psFwd), 'current FY consensus'),
        row('Price / free cash flow', fmt.mult(f.pfcf), 'TTM'),
        row('Price / operating cash flow', fmt.mult(v.priceToCashFlow), 'TTM'),
        row('EV / sales', fmt.mult(v.evToSales), 'TTM'),
        row('EV / EBITDA', fmt.mult(v.evToEbitda), 'TTM'),
        row('EV / EBIT', fmt.mult(v.evToEbit), 'TTM'),
        row('EV / operating cash flow', fmt.mult(km.evToOperatingCashFlowTTM), 'TTM'),
        row('EV / free cash flow', fmt.mult(km.evToFreeCashFlowTTM), 'TTM'),
        row('Enterprise value multiple', fmt.mult(r.enterpriseValueMultipleTTM), 'TTM',
          'Enterprise value over EBITDA, as the vendor publishes it. The same figure as EV / '
          + 'EBITDA above, from a different feed — where they differ, they were computed at '
          + 'different moments.'),
        row('Debt / market capitalisation', fmt.mult(r.debtToMarketCapTTM), 'TTM'),
      ],
    },

    {
      key: 'fairvalue', title: 'Fair value estimates', c: 4,
      info: 'Model output, not measurement. Every figure here is somebody’s arithmetic about the '
        + 'future — the report’s own thirteen-model range lives on the Valuation tab.',
      rows: [
        row('Discounted cash flow', fmt.price(a.fairValue), 'vendor model',
          'FMP’s levered discounted cash flow. One model, shown as a reference point rather '
          + 'than as the report’s answer.'),
        drow('Discount to that value', a.discount, 'current',
          'Positive means the share trades below the model’s number.'),
        row('Price / fair value', fmt.mult(r.priceToFairValueTTM), 'TTM'),
        row('Graham number', fmt.perShare(v.grahamNumber), 'TTM',
          'A textbook fair value for a defensive investor: the square root of 22.5 × earnings '
          + 'per share × book value per share.'),
        row('Graham net-net', fmt.perShare(km.grahamNetNetTTM), 'TTM',
          'Current assets less every liability, per share. Graham’s liquidation floor, and '
          + 'deeply negative for almost any asset-light company — which is not a fault.'),
        row('Fair P/E for this growth', fmt.mult(a.fairPe), 'model',
          'The multiple the report’s own fair-ratio model considers justified by the forecast '
          + 'growth rate.'),
        row('Price target (consensus)', fmt.price(m.targetPrice), 'current'),
        row('Price target (median)', fmt.price(target?.targetMedian), 'current'),
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
        row('Earnings yield', fmt.pct(v.earningsYield), 'TTM'),
        row('Free cash flow yield', fmt.pct(v.fcfYield), 'TTM'),
        row('Owner earnings yield', fmt.pct(oe.yield), 'TTM',
          'Owner earnings over market capitalisation — earnings plus non-cash charges, less the '
          + 'capital spending needed to stand still.'),
        row('Dividend yield', fmt.pct(f.dividendYield), 'TTM'),
        row('Buyback yield', fmt.pct(v.buybackYield), filed,
          'Shares bought back over the filed year, as a share of today’s market capitalisation.'),
        row('Shareholder yield', fmt.pct(v.shareholderYield), `TTM + ${filed}`,
          'Dividend yield plus buyback yield — the whole of what was returned, however it was '
          + 'returned. The two legs are measured over different periods.'),
      ],
    },

    {
      key: 'pershare', title: 'Per share', c: 4,
      info: 'Every headline divided by the share count. The denominator is the diluted average, '
        + 'so these move when the company issues or retires stock even if nothing else changed.',
      rows: [
        row('Revenue per share', fmt.perShare(r.revenuePerShareTTM), 'TTM'),
        row('Earnings per share', fmt.perShare(f.eps), 'TTM'),
        row('Net income per share', fmt.perShare(r.netIncomePerShareTTM), 'TTM'),
        row('Operating cash flow per share', fmt.perShare(r.operatingCashFlowPerShareTTM), 'TTM'),
        row('Free cash flow per share', fmt.perShare(r.freeCashFlowPerShareTTM), 'TTM'),
        row('Owner earnings per share', fmt.perShare(oe.perShare), 'TTM'),
        row('Capital expenditure per share', fmt.perShare(r.capexPerShareTTM), 'TTM'),
        row('Book value per share', fmt.perShare(f.bookValuePerShare), 'TTM'),
        row('Tangible book value per share', fmt.perShare(f.tangibleBookValuePerShare), 'TTM'),
        row('Shareholders’ equity per share', fmt.perShare(r.shareholdersEquityPerShareTTM), 'TTM'),
        row('Cash per share', fmt.perShare(f.cashPerShare), 'TTM'),
        row('Interest-bearing debt per share', fmt.perShare(r.interestDebtPerShareTTM), 'TTM'),
        row('Dividend per share', fmt.perShare(f.dividendPerShare), 'TTM'),
      ],
    },

    {
      key: 'margins', title: 'Margins', c: 4,
      info: 'Trailing twelve months. The Financials tab has the same margins per fiscal year, '
        + 'computed off the filed statements, and the two will not match exactly.',
      rows: [
        row('Gross margin', fmt.pct(f.grossMargin), 'TTM'),
        row('Operating margin', fmt.pct(f.operatingMargin), 'TTM'),
        row('EBIT margin', fmt.pct(r.ebitMarginTTM), 'TTM'),
        row('EBITDA margin', fmt.pct(f.ebitdaMargin), 'TTM'),
        row('Pre-tax margin', fmt.pct(r.pretaxProfitMarginTTM), 'TTM'),
        row('Net margin', fmt.pct(f.netMargin), 'TTM'),
        row('Continuing operations margin', fmt.pct(r.continuousOperationsProfitMarginTTM), 'TTM',
          'Net margin with discontinued operations taken out — the margin the business will '
          + 'still have next year.'),
        row('Bottom-line margin', fmt.pct(r.bottomLineProfitMarginTTM), 'TTM',
          'After minority interests and every other deduction below net income.'),
        row('Operating cash flow margin', fmt.pct(r.operatingCashFlowSalesRatioTTM), 'TTM'),
        row('Effective tax rate', fmt.pct(f.effectiveTaxRate), 'TTM'),
        row('Tax burden', fmt.pct(km.taxBurdenTTM), 'TTM',
          'Net income over pre-tax income — the share of profit that survives tax.'),
        row('Interest burden', fmt.pct(km.interestBurdenTTM), 'TTM',
          'Pre-tax income over operating income — the share of operating profit that survives '
          + 'the interest bill.'),
      ],
    },

    {
      key: 'returns', title: 'Returns on capital', c: 4,
      info: 'What the business earns on the money tied up in it. These are the figures the '
        + 'Profitability factor grades against the sector.',
      rows: [
        row('Return on equity', fmt.pct(f.roe), 'TTM'),
        row('Return on assets', fmt.pct(f.roa), 'TTM'),
        row('Return on invested capital', fmt.pct(f.roic), 'TTM'),
        row('Return on capital employed', fmt.pct(f.roce), 'TTM'),
        row('Return on tangible assets', fmt.pct(f.returnOnTangibleAssets), 'TTM'),
        row('Operating return on assets', fmt.pct(km.operatingReturnOnAssetsTTM), 'TTM'),
        row('Invested capital', fmt.money(km.investedCapitalTTM), 'TTM'),
        row('Retained earnings', fmt.money(sc.retainedEarnings), 'latest filed',
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
        row('Asset turnover', fmt.mult(f.assetTurnover), 'TTM'),
        row('Fixed asset turnover', fmt.mult(f.fixedAssetTurnover), 'TTM'),
        row('Working capital turnover', fmt.mult(r.workingCapitalTurnoverRatioTTM), 'TTM',
          'Revenue over working capital. Enormous where working capital is near zero, which is '
          + 'arithmetic rather than efficiency.'),
        row('Receivables turnover', fmt.mult(r.receivablesTurnoverTTM), 'TTM'),
        row('Inventory turnover', fmt.mult(r.inventoryTurnoverTTM), 'TTM'),
        row('Payables turnover', fmt.mult(r.payablesTurnoverTTM), 'TTM'),
        row('Days sales outstanding', fmt.days(km.daysOfSalesOutstandingTTM), 'TTM'),
        row('Days inventory outstanding', fmt.days(km.daysOfInventoryOutstandingTTM), 'TTM'),
        row('Days payables outstanding', fmt.days(km.daysOfPayablesOutstandingTTM), 'TTM'),
        row('Operating cycle', fmt.days(km.operatingCycleTTM), 'TTM',
          'Days from paying for inventory to collecting on the sale, before any credit the '
          + 'company itself takes.'),
        row('Cash conversion cycle', fmt.days(km.cashConversionCycleTTM), 'TTM',
          'The operating cycle less the credit taken from suppliers. Negative means the company '
          + 'is paid before it pays, which is a funding advantage.'),
        row('Average receivables', fmt.money(km.averageReceivablesTTM), 'TTM'),
        row('Average inventory', fmt.money(km.averageInventoryTTM), 'TTM'),
        row('Average payables', fmt.money(km.averagePayablesTTM), 'TTM'),
        row('Capex / revenue', fmt.pct(f.capexToRevenue), 'TTM'),
        row('Capex / operating cash flow', fmt.pct(km.capexToOperatingCashFlowTTM), 'TTM'),
        row('Capex / depreciation', fmt.mult(km.capexToDepreciationTTM), 'TTM',
          'Under 1x for long enough means the asset base is shrinking faster than it is replaced.'),
        row('R&D / revenue', fmt.pct(km.researchAndDevelopementToRevenueTTM), 'TTM'),
        row('SG&A / revenue', fmt.pct(km.salesGeneralAndAdministrativeToRevenueTTM), 'TTM'),
        row('Stock compensation / revenue', fmt.pct(f.sbcToRevenue), 'TTM'),
      ],
    },

    {
      key: 'position', title: 'Liquidity and leverage', c: 4,
      info: 'All trailing twelve months, so these are more recent than the balance sheet columns '
        + 'on the Financials tab.',
      rows: [
        row('Cash & equivalents', fmt.money(f.cash), 'TTM'),
        row('Total debt', fmt.money(f.totalDebt), 'TTM'),
        row('Net debt', fmt.money(f.netDebt), 'TTM'),
        row('Working capital', fmt.money(f.workingCapital), 'TTM'),
        row('Current ratio', fmt.mult(f.currentRatio), 'TTM'),
        row('Quick ratio', fmt.mult(f.quickRatio), 'TTM'),
        row('Cash ratio', fmt.mult(f.cashRatio), 'TTM'),
        row('Debt / equity', fmt.mult(f.debtToEquity), 'TTM'),
        row('Debt / assets', fmt.mult(f.debtToAssets), 'TTM'),
        row('Debt / capital', fmt.mult(f.debtToCapital), 'TTM'),
        row('Long-term debt / capital', fmt.mult(f.longTermDebtToCapital), 'TTM'),
        row('Financial leverage', fmt.mult(f.financialLeverage), 'TTM'),
        row('Net debt / EBITDA', fmt.mult(f.netDebtToEbitda), 'TTM'),
        row('Interest coverage', fmt.mult(f.interestCover), 'TTM'),
        row('Debt service coverage', fmt.mult(f.debtServiceCoverage), 'TTM'),
        row('Solvency ratio', fmt.mult(f.solvencyRatio), 'TTM'),
        row('Operating cash flow ratio', fmt.mult(r.operatingCashFlowRatioTTM), 'TTM',
          'Operating cash flow over current liabilities — the year’s bills against the year’s '
          + 'cash, rather than against the assets that might cover them.'),
        row('Operating cash flow / debt', fmt.mult(r.operatingCashFlowCoverageRatioTTM), 'TTM'),
        row('Short-term debt coverage', fmt.mult(r.shortTermOperatingCashFlowCoverageRatioTTM), 'TTM'),
        row('Capital expenditure coverage', fmt.mult(r.capitalExpenditureCoverageRatioTTM), 'TTM',
          'Operating cash flow over capital expenditure — how many times the year’s investment '
          + 'was covered by the year’s cash.'),
        row('Dividend and capex coverage', fmt.mult(r.dividendPaidAndCapexCoverageRatioTTM), 'TTM',
          'The same, with the dividend added to what has to be covered.'),
      ],
    },

    {
      key: 'quality', title: 'Quality and strength', c: 4,
      info: 'Composite scores published by the vendor, plus the earnings-quality reads. Shown as '
        + 'reference figures — the report’s own grade is on the Ratings tab.',
      rows: [
        row('Altman Z-score', fmt.ratio(f.altmanZ), 'latest filed',
          'A bankruptcy-distance score. Above 3 is conventionally safe, under 1.8 distressed. '
          + 'Built for manufacturers, and misleading for banks and asset-light businesses.'),
        row('Piotroski F-score', isNum(f.piotroski) ? `${dec(f.piotroski, 0)} / 9` : 'n/a', 'latest filed',
          'Nine pass/fail accounting tests. Counts how many the company passes, not how well.'),
        row('Income quality', fmt.mult(f.incomeQuality), 'TTM',
          'Operating cash flow over net income. Below 1 for long means profit is being booked '
          + 'faster than it is collected.'),
        row('Free cash flow / operating cash flow', fmt.pct(f.fcfToOcf), 'TTM'),
        row('Owner earnings', fmt.money(oe.ttm), oe.available ? oe.span : 'TTM',
          'Reported earnings plus non-cash charges, less the capital spending needed to hold '
          + 'position. Summed from four filed quarters.'),
        row('Free cash flow to equity', fmt.money(km.freeCashFlowToEquityTTM), 'TTM',
          'The cash left for shareholders after debt is serviced.'),
        row('Free cash flow to firm', fmt.money(km.freeCashFlowToFirmTTM), 'TTM',
          'The cash left for everyone who funded the business, lenders included.'),
        row('Intangibles / total assets', fmt.pct(km.intangiblesToTotalAssetsTTM), 'TTM'),
        row('Tangible asset value', fmt.money(km.tangibleAssetValueTTM), 'TTM'),
        // A total, not a per-share figure, despite reading like one — the
        // vendor's field is the whole amount.
        row('Net current asset value', fmt.money(km.netCurrentAssetValueTTM), 'TTM',
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
      info: 'Analyst estimates as the vendor aggregates them. Growth rates are the median annual '
        + 'step across the estimate window, not an endpoint-to-endpoint rate.',
      rows: [
        row('Analysts covering (earnings)', fmt.whole(fc.analystCount), 'latest estimates'),
        row('Analysts covering (revenue)', fmt.whole(nextEst?.numAnalystsRevenue), 'latest estimates'),
        row('Forecast window', fc.available && fc.base && fc.target
          ? `${fc.base.year}–${fc.target.year}` : 'n/a', ''),
        drow('Forecast revenue growth', fc.revenueGrowth, 'annual, median step'),
        drow('Forecast earnings growth', fc.earningsGrowth, 'annual, median step'),
        drow('Forecast EPS growth', fc.epsGrowth, 'annual, median step'),
        row('Forecast revenue', fmt.money(nextEst?.revenueAvg), 'next estimate year'),
        row('Forecast revenue range', isNum(nextEst?.revenueLow) && isNum(nextEst?.revenueHigh)
          ? `${fmt.money(nextEst.revenueLow)} – ${fmt.money(nextEst.revenueHigh)}` : 'n/a', 'next estimate year'),
        row('Forecast EBITDA', fmt.money(nextEst?.ebitdaAvg), 'next estimate year'),
        row('Forecast EBIT', fmt.money(nextEst?.ebitAvg), 'next estimate year'),
        row('Forecast net income', fmt.money(nextEst?.netIncomeAvg), 'next estimate year'),
        row('Forecast EPS', fmt.perShare(nextEst?.epsAvg), 'next estimate year'),
        row('Forecast EPS range', isNum(nextEst?.epsLow) && isNum(nextEst?.epsHigh)
          ? `${fmt.perShare(nextEst.epsLow)} – ${fmt.perShare(nextEst.epsHigh)}` : 'n/a', 'next estimate year'),
        row('Forecast return on equity', fmt.pct(fc.futureRoe), 'end of window',
          'Forecast earnings over equity projected forward by retaining profit net of dividends '
          + 'and buybacks.'),
        row('Earnings retention', fmt.pct(fc.retention), filed,
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
        row('Earnings per share', fmt.perShare(q.eps), 'actual'),
        row('Earnings per share expected', fmt.perShare(q.epsEstimate), 'consensus'),
        drow('Earnings surprise', q.epsSurprise, 'against consensus'),
        row('Revenue', fmt.money(q.revenue), 'actual'),
        row('Revenue expected', fmt.money(q.revenueEstimate), 'consensus'),
        drow('Revenue surprise', q.revenueSurprise, 'against consensus'),
        row('Next report expected', q.next ? fmtDate(q.next) : 'n/a', ''),
      ],
    },

    {
      key: 'momentum', title: 'Returns and risk', c: 4,
      info: 'Price returns, close to close, excluding dividends. The sector benchmark is the SPDR '
        + 'sector ETF and the market is SPY; both need a live connection.',
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
        row('Price / 50-day average', fmt.mult(m.toAvg50), 'current'),
        row('Price / 200-day average', fmt.mult(m.toAvg200), 'current'),
        row('Below 52-week high', fmt.pct(m.offHigh), 'current'),
        row('Above 52-week low', fmt.pct(m.aboveLow), 'current'),
        row('Weekly volatility', fmt.pct(m.volatility), 'annualised',
          'Standard deviation of weekly returns, annualised.'),
        row('Maximum drawdown', fmt.pct(m.drawdown), 'trailing year',
          'The deepest peak-to-trough fall inside the window.'),
        row('Cost of equity', fmt.pct(m.costOfEquity), 'CAPM',
          'Risk-free rate plus beta times the equity risk premium, both set in Settings.'),
      ],
    },

    {
      key: 'dividends', title: 'Dividends', c: 4,
      info: 'History is aggregated by calendar year, and the current year is excluded until it is '
        + 'complete so a part-year does not read as a cut.',
      rows: [
        row('Dividend yield', fmt.pct(f.dividendYield), 'TTM'),
        row('Dividend per share', fmt.perShare(f.dividendPerShare), 'TTM'),
        row('Last dividend', fmt.perShare(profile.lastDividend), 'per share'),
        row('Payout ratio', fmt.pct(f.payoutRatio), 'TTM',
          'Dividends as a share of earnings.'),
        row('Cash payout ratio', fmt.pct(f.cashPayoutRatio), 'TTM',
          'Dividends as a share of free cash flow — the cash that actually pays them.'),
        row('Years of history', d.years ? String(d.years) : 'n/a', 'complete calendar years'),
        drow('Dividend growth', d.growth, 'annualised over the history'),
        row('Deepest annual cut', isNum(d.worstDrop) && d.worstDrop < 0 ? fmt.signed(d.worstDrop) : 'none',
          'over the history', '', isNum(d.worstDrop) && d.worstDrop < 0 ? d.worstDrop : null),
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
        row('Insider shares acquired', fmt.count(ins.acquired), ins.span || 'last four quarters'),
        row('Insider shares disposed', fmt.count(ins.disposed), ins.span || 'last four quarters'),
        row('Insider net', fmt.count(ins.net), ins.span || 'last four quarters', '', ins.net),
        row('Acquired / disposed', fmt.mult(ins.ratio), ins.span || 'last four quarters',
          'Above 1x means insiders bought more shares than they sold over the window.'),
        row('Institutional holders listed', Array.isArray(holders) ? String(holders.length) : 'n/a',
          'last complete quarter',
          'How many the feed returned, not how many exist — the request is capped at twenty.'),
        row('Largest institutional holder', fmt.text(topHolder?.investorName), 'last complete quarter'),
        row('Largest holder’s stake', isNum(topHolder?.ownership)
          ? fmt.pct(topHolder.ownership / 100) : 'n/a', 'last complete quarter'),
        row('Largest holder’s position', fmt.money(topHolder?.marketValue), 'last complete quarter'),
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

/**
 * What the revenue cost to earn, as three bands rather than the five rows
 * below it.
 *
 * The selling / administrative split is reported by some companies and not
 * others, and a chart whose bands change shape between two tickers is a chart
 * that has to be re-read each time. The rows carry the split where the filing
 * has it.
 *
 * Cost of revenue is a row and not a band. It sits above gross profit rather
 * than inside operating expenses, and stacking it would draw a bar that is
 * almost all cost of revenue with the operating lines as a stripe on top —
 * true, and the opposite of legible.
 */
function opexChart(o, fmt) {
  const series = [
    { name: 'Research & development', color: 'var(--chart-01)', get: (x) => x.rnd },
    { name: 'Selling, general & admin', color: 'var(--chart-02)', get: (x) => x.sga },
    { name: 'Other operating expenses', color: OTHER_COLOR, get: (x) => x.other },
  ]
    .map((sr) => ({ ...sr, values: o.rows.map(sr.get) }))
    .filter((sr) => sr.values.some(isNum));

  return columnChart(o.rows.map((x) => String(x.year ?? '—')), series,
    { height: 300, stacked: true, valueFmt: fmt.money });
}

function opexGroup(a, o, fmt) {
  const rows = [];
  const last = o.available ? o.latest : null;

  if (last) {
    const basis = isNum(last.year) ? `FY${last.year}` : 'latest filed year';
    // Every line against the revenue it was spent to earn, which is the only
    // way two companies of different sizes can be read side by side.
    const share = (x) => (isNum(x) && last.revenue > 0
      ? ` · ${fmt.pct(x / last.revenue)} of revenue` : '');
    const line = (label, x, title = '', withShare = true) => rows.push(row(
      label, isNum(x) ? `${fmt.money(x)}${withShare ? share(x) : ''}` : 'n/a', basis, title));

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
    chart: o.available ? () => opexChart(o, fmt) : null,
    gate: () => feedGate(a, 'income', 'The income statement')
      || notice('No operating expense lines were returned for this company.'),
    rows,
  };
}

/* ==========================================================================
   The Performance panel

   Six charts that all answer the same shape of question: not "what is it
   now" — the metrics grid is for that — but "which way has it been going".

   Everything here is a filed fiscal year, joined across the three statements
   by `deriveSeries`. None of it is graded and none of it is compared to a
   sector; the factor tabs already do both, with a distribution behind every
   row. What these add is the run.
   ========================================================================== */

/** A line series over the filed years, for `multiLineChart`. */
const lineOf = (rows, name, color, get) => ({
  name, color, points: rows.map((r) => ({ date: r.date, value: get(r) })),
});

/** The two figures that summarise a run, from its own first and last points. */
function runBadges(rows, get, opts = {}) {
  const vals = rows.map(get);
  const firstAt = vals.findIndex(isNum);
  if (firstAt < 0) return null;
  const lastAt = vals.length - 1 - [...vals].reverse().findIndex(isNum);
  if (lastAt <= firstAt) return null;
  return perfCagr(vals[firstAt], vals[lastAt], lastAt - firstAt, opts);
}

function performancePanel(a) {
  const fmt = formatters(a);
  const series = a.series || { available: false, rows: [] };
  const employees = a.employees || { available: false, rows: [] };

  if (!series.available || series.rows.length < 2) {
    return [card('perf-none', [
      ohead('Performance'),
      feedGate(a, 'income', 'The annual statements')
        || notice('At least two filed fiscal years are needed to draw a trend.'),
    ], 'ocard ovw__c12')];
  }

  const rows = series.rows;
  const last = series.latest || {};
  const years = rows.map((r) => String(r.year ?? '—'));
  const asPct = (v) => pct(v, { dp: 0 });

  return [
    /* ---- margins ------------------------------------------------------- */
    card('perf-margins', [
      ohead('Margins', null,
        'Each margin is that year’s filed line over that year’s filed revenue. The '
        + 'trailing-twelve margins in the metrics grid come from the vendor’s own ratios and '
        + 'will not land exactly on the last point here.'),
      multiLineChart([
        lineOf(rows, 'Gross', 'var(--chart-02)', (r) => r.grossMargin),
        lineOf(rows, 'Operating', 'var(--chart-01)', (r) => r.operatingMargin),
        lineOf(rows, 'Net', 'var(--good)', (r) => r.netMargin),
      ], { height: 280, valueFmt: asPct }),
      el('div', { class: 'ostats ostats--split' }, [
        statLine('Gross margin', fmt.pct(last.grossMargin), { note: `FY${last.year ?? ''}` }),
        statLine('Operating margin', fmt.pct(last.operatingMargin), { note: `FY${last.year ?? ''}` }),
        statLine('Net margin', fmt.pct(last.netMargin), { note: `FY${last.year ?? ''}` }),
      ]),
    ], 'ocard ovw__c8'),

    /* ---- returns on capital -------------------------------------------- */
    card('perf-returns', [
      ohead('Returns on capital', null,
        'What the business earns on the money tied up in it. Return on equity flatters a '
        + 'company that has bought back enough stock to shrink its own equity — which is why '
        + 'the other two are drawn beside it.'),
      multiLineChart([
        lineOf(rows, 'Return on equity', 'var(--chart-01)', (r) => r.roe),
        lineOf(rows, 'Return on invested capital', 'var(--chart-04)', (r) => r.roic),
        lineOf(rows, 'Return on capital employed', 'var(--chart-06)', (r) => r.roce),
      ], { height: 280, valueFmt: asPct }),
      el('div', { class: 'ostats ostats--split' }, [
        statLine('Return on equity', fmt.pct(last.roe), { note: `FY${last.year ?? ''}` }),
        statLine('Return on invested capital', fmt.pct(last.roic), { note: `FY${last.year ?? ''}` }),
        statLine('Return on capital employed', fmt.pct(last.roce), { note: `FY${last.year ?? ''}` }),
      ]),
    ], 'ocard ovw__c8'),

    /* ---- ROIC against the cost of that capital -------------------------- */
    waccCard(a, series, fmt, years),

    /* ---- what the business spends --------------------------------------- */
    card('perf-spend', [
      ohead('Expense burden', null,
        'Each cost against the cash it is spent out of, rather than against revenue — which is '
        + 'the test of whether the business can keep paying for it. All three rising together '
        + 'is a company buying its growth.'),
      multiLineChart([
        lineOf(rows, 'Capex / operating cash flow', 'var(--chart-01)', (r) => r.capexToOcf),
        lineOf(rows, 'R&D / operating cash flow', 'var(--chart-04)', (r) => r.rndToOcf),
        lineOf(rows, 'Stock comp / free cash flow', 'var(--chart-06)', (r) => r.sbcToFcf),
      ], { height: 280, valueFmt: asPct }),
      el('div', { class: 'ostats ostats--split' }, [
        statLine('Capex / operating cash flow', fmt.pct(last.capexToOcf), { note: `FY${last.year ?? ''}` }),
        statLine('R&D / operating cash flow', fmt.pct(last.rndToOcf), { note: `FY${last.year ?? ''}` }),
        statLine('Stock comp / free cash flow', fmt.pct(last.sbcToFcf), {
          note: `FY${last.year ?? ''}`,
          title: 'Reconstructed from the key-metrics feed’s ratio, so it goes missing on a plan '
            + 'that gates it rather than being computed from the cash flow statement.',
        }),
      ]),
    ], 'ocard ovw__c8'),

    /* ---- the share count ------------------------------------------------ */
    card('perf-shares', [
      ohead('Shares in issue', null,
        'Weighted average diluted shares, as the income statement files them. Falling is a '
        + 'buyback and rising is dilution — the denominator every per-share figure in the '
        + 'report is divided by.'),
      columnChart(years, [{
        name: 'Diluted shares', color: 'var(--chart-05)',
        values: rows.map((r) => r.shares),
      }], { height: 260, valueFmt: (v) => num(v, 2), legend: false }),
      // Down is the welcome direction here, so the badge colours invert.
      runBadges(rows, (r) => r.shares, { invert: true }),
    ], 'ocard ovw__c8'),

    /* ---- headcount ------------------------------------------------------ */
    employees.available && employees.rows.length >= 2
      ? card('perf-employees', [
        ohead('Headcount', null,
          'As each annual filing reported it, so this is the figure on the 10-K rather than a '
          + 'live number — and it is a point-in-time count, not an average over the year.'),
        columnChart(employees.rows.map((r) => String(r.year ?? '—')), [{
          name: 'Employees', color: 'var(--chart-06)',
          values: employees.rows.map((r) => r.count),
        }], { height: 260, valueFmt: (v) => num(v, 0), legend: false }),
        runBadges(employees.rows, (r) => r.count),
      ], 'ocard ovw__c8')
      : card('perf-employees', [
        ohead('Headcount'),
        feedGate(a, 'employees', 'The employee history')
          || notice('No filed headcount history was returned for this company.'),
      ], 'ocard ovw__c8'),

    employees.available && employees.latest
      ? card('perf-perhead', [
        ohead('Per employee', null,
          'The whole company divided by the people in it. Useful across a decade of one '
          + 'company and misleading across two — a business that contracts out its '
          + 'manufacturing has fewer employees to divide by, not more productive ones.'),
        columnChart(employees.rows.map((r) => String(r.year ?? '—')), [
          { name: 'Revenue', color: 'var(--chart-01)', values: employees.rows.map((r) => r.revenuePerHead) },
          { name: 'Net income', color: 'var(--chart-04)', values: employees.rows.map((r) => r.profitPerHead) },
          { name: 'Free cash flow', color: 'var(--chart-06)', values: employees.rows.map((r) => r.fcfPerHead) },
        ], { height: 260, valueFmt: fmt.money }),
        el('div', { class: 'ostats ostats--split' }, [
          statLine('Revenue per employee', fmt.money(employees.latest.revenuePerHead), { note: `FY${employees.latest.year}` }),
          statLine('Net income per employee', fmt.money(employees.latest.profitPerHead), { note: `FY${employees.latest.year}` }),
          statLine('Free cash flow per employee', fmt.money(employees.latest.fcfPerHead), { note: `FY${employees.latest.year}` }),
        ]),
      ], 'ocard ovw__c4')
      : null,
  ].filter(Boolean);
}

/**
 * Return on invested capital against what that capital costs.
 *
 * The one chart on this page with an opinion built into its shape: a bar
 * above the line is a year the business earned more than its funding cost,
 * and a bar below it is a year it destroyed value however profitable it
 * looked. That is the whole question, so both series are bars on one scale
 * rather than a line crossing a line.
 *
 * The cost of equity inside the WACC is CAPM on today's beta and the rates
 * set in Settings, because neither is published per historical year. The mix
 * and the tax rate are each year's own. The card says so: it is a bar to
 * clear, not a measurement.
 */
function waccCard(a, series, fmt, years) {
  const rows = series.rows;
  const last = series.latest || {};
  const spreads = rows.map((r) => r.spread).filter(isNum);
  const clearedIn = spreads.filter((v) => v > 0).length;

  return card('perf-wacc', [
    ohead('Return on capital against its cost', null,
      'The cost of equity inside the weighted cost is today’s beta and today’s risk-free rate, '
      + 'both editable in Settings — it is not what capital cost in 2018. The debt cost, the '
      + 'mix and the tax rate are each year’s own.'
      + (series.waccBasis === 'book'
        ? ' The equity leg is weighted on book value, because this data plan returns no '
          + 'market capitalisation per year — which understates the equity weight and so the '
          + 'whole hurdle.'
        : ' The equity leg is weighted on market capitalisation, which is what the equity is '
          + 'worth rather than what it is carried at.')),

    columnChart(years, [
      { name: 'Return on invested capital', color: 'var(--good)', values: rows.map((r) => r.roic) },
      { name: 'Weighted cost of capital', color: 'var(--bad)', values: rows.map((r) => r.wacc) },
    ], { height: 280, valueFmt: (v) => pct(v, { dp: 0 }) }),

    el('div', { class: 'ostats ostats--split' }, [
      statLine('Return on invested capital', fmt.pct(last.roic), { note: `FY${last.year ?? ''}` }),
      statLine('Weighted cost of capital', fmt.pct(last.wacc), {
        note: series.waccBasis === 'market' ? 'market-weighted' : 'book-weighted',
      }),
      statLine('Spread', isNum(last.spread) ? pct(last.spread, { sign: true }) : 'n/a', {
        tone: signClass(last.spread),
        note: 'earned less cost',
        title: 'Positive means the last filed year earned more on its capital than that capital '
          + 'costs. Sustained, it is the whole case for a company compounding.',
      }),
      statLine('Years above cost', spreads.length
        ? `${clearedIn} of ${spreads.length}` : 'n/a', { note: series.span }),
    ]),
  ], 'ocard ovw__c4');
}

/* ==========================================================================
   The two revenue breakdown panels

   A panel each rather than a card each. A segment mix is a shape over six
   years, the latest year read as shares, and a table of every year the
   company has ever broken out — which is three cards, not one, and none of
   them belongs in a grid built for label-and-value rows.

   Both panels are the same code with different words, because the two
   breakdowns are the same question asked along a different axis and any
   difference between them would be arbitrary.
   ========================================================================== */

/**
 * The band colours, in the order segments are ranked.
 *
 * Not `--chart-01` to `--chart-06` in order: the palette's neighbours are
 * next to each other on the wheel, which is right for two lines that cross
 * and wrong for six bands stacked touching. Reordered so adjacent bands are
 * as far apart as the palette allows, with the folded band grey — the one
 * band that is a residual rather than a name the company reported.
 */
const MIX_COLORS = [
  'var(--chart-01)', 'var(--chart-02)', 'var(--chart-04)',
  'var(--chart-05)', 'var(--chart-03)', 'var(--chart-06)',
];

/** One segmentation, stacked. The bars total revenue as the segments file it. */
function mixChart(seg, fmt) {
  return columnChart(
    seg.rows.map((x) => String(x.year ?? '—')),
    seg.names.map((name, i) => ({
      name,
      color: name === seg.foldedInto ? OTHER_COLOR : (MIX_COLORS[i] || OTHER_COLOR),
      values: seg.rows.map((x) => x.values[name]),
    })),
    { height: 320, stacked: true, valueFmt: fmt.money },
  );
}

/**
 * Every filed year as a table: a row per segment, a column per fiscal year.
 *
 * Newest first, like the statement tables on the Financials tab and for the
 * same reason — a table is scanned rather than read, and the column almost
 * every reader wants is the newest one.
 *
 * The share rows under the money rows are this app's arithmetic rather than
 * the filing's, so they open a labelled band and say so, exactly as the
 * derived rows on the statement tables do.
 */
function segmentTable(seg, fmt) {
  const { names, years } = seg.all;

  const head = el('tr', {}, [
    el('th', { class: 'fintbl__line', text: 'Segment' }),
    ...years.map((y) => el('th', { class: 'num', text: String(y.year ?? '—') })),
  ]);

  const body = [];

  for (const name of names) {
    body.push(el('tr', {}, [
      el('td', { class: 'fintbl__line', text: name }),
      ...years.map((y, i) => {
        const now = y.values[name];
        const before = years[i + 1]?.values[name];
        const change = isNum(now) && before > 0 ? now / before - 1 : null;
        return el('td', {
          class: 'num',
          text: isNum(now) ? fmt.money(now) : '—',
          title: isNum(change) ? `${pct(change, { sign: true })} on ${years[i + 1].year}` : null,
        });
      }),
    ]));
  }

  body.push(el('tr', { class: 'fintbl__strong' }, [
    el('td', { class: 'fintbl__line', text: 'Total reported' }),
    ...years.map((y) => el('td', { class: 'num', text: isNum(y.total) ? fmt.money(y.total) : '—' })),
  ]));

  body.push(el('tr', { class: 'fintbl__group' }, [
    el('td', { colspan: years.length + 1, text: 'Share of the year · calculated from the rows above' }),
  ]));

  for (const name of names) {
    body.push(el('tr', {}, [
      el('td', { class: 'fintbl__line', text: name }),
      ...years.map((y) => {
        const val = y.values[name];
        return el('td', {
          class: 'num',
          text: isNum(val) && y.total > 0 ? fmt.pct(val / y.total, 0) : '—',
        });
      }),
    ]));
  }

  return el('div', { class: 'tbl-wrap' }, [
    el('table', { class: 'tbl fintbl' }, [el('thead', {}, [head]), el('tbody', {}, body)]),
  ]);
}

/**
 * One breakdown as a whole panel: the mix, the latest year, and every year.
 *
 * `meta` carries only what differs between product and geography — the feed
 * name, the words, and the sentence to print when the company reports no
 * breakdown of that kind.
 */
function segmentPanel(a, seg, meta) {
  const fmt = formatters(a);

  if (!seg || !seg.available) {
    return [card(`${meta.key}-none`, [
      ohead(meta.title),
      feedGate(a, meta.feed, meta.title) || notice(meta.missing),
    ], 'ocard ovw__c12')];
  }

  const parts = seg.latest.parts;
  const top = parts[0] || null;
  const topThree = parts.slice(0, 3).map((p) => p.value).filter(isNum)
    .reduce((x, y) => x + y, 0);
  const basis = isNum(seg.latest.year) ? `FY${seg.latest.year}` : 'latest filed year';

  return [
    card(`${meta.key}-mix`, [
      ohead(meta.title, null, meta.info),
      mixChart(seg, fmt),
      el('p', { class: 't-tiny subtle mt2', text: `Fiscal ${seg.span}, oldest on the left. `
        + `Bands are ordered by their size in the newest year${seg.foldedInto
          ? `, with everything past the sixth largest grouped into “${seg.foldedInto}”` : ''}. `
        + 'The table below carries every year and every name, ungrouped.' }),
    ], 'ocard ovw__c8'),

    card(`${meta.key}-latest`, [
      ohead(`Fiscal ${seg.latest.year ?? 'year'}`, null,
        'The newest filed year, biggest first, with each segment’s change on the year before it.'),
      el('div', { class: 'ostats' }, [
        ...parts.map((p) => statLine(
          p.name,
          el('span', {}, [
            el('span', { text: isNum(p.share) ? fmt.pct(p.share, 0) : fmt.money(p.value) }),
          ]),
          {
            note: fmt.money(p.value),
            tone: '',
            title: isNum(p.change) ? `${pct(p.change, { sign: true })} on the year before` : '',
          },
        )),
        statLine('Total reported', fmt.money(seg.latest.total), {
          note: basis,
          title: 'The named segments added up. Where this falls short of revenue the company '
            + 'reports an unallocated or intersegment balance outside the names above.',
        }),
      ]),
      el('div', { class: 'ostats ostats--split' }, [
        statLine('Segments reported', String(parts.length), { note: basis }),
        statLine('Largest', top ? top.name : 'n/a', {
          note: top && isNum(top.share) ? fmt.pct(top.share, 0) : '',
        }),
        statLine('Top three combined', seg.latest.total > 0 && topThree > 0
          ? fmt.pct(topThree / seg.latest.total, 0) : 'n/a', {
          note: 'concentration',
          title: 'How much of the reported revenue the three largest segments account for. The '
            + 'higher it is, the more the whole company depends on fewer things.',
        }),
      ]),
    ], 'ocard ovw__c4'),

    card(`${meta.key}-table`, [
      ohead('Every filed year', null,
        'As the company reported it each year. A blank is a year in which that name was not '
        + 'reported — either because the segment did not exist yet, or because the company was '
        + 'breaking its revenue out differently then.'),
      segmentTable(seg, fmt),
      el('p', { class: 't-tiny subtle mt2', text: `Fiscal ${seg.all.span}. Figures in `
        + `${a.facts.currency || 'the reporting currency'}, as reported. Segments come from a `
        + 'different feed than the income statement, so they will not always add up to revenue '
        + 'exactly.' }),
    ], 'ocard ovw__c12'),
  ];
}

/* ==========================================================================
   The tab
   ========================================================================== */

const PANELS = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'performance', label: 'Performance' },
  { key: 'segment', label: 'Revenue by segment' },
  { key: 'geography', label: 'Revenue by geography' },
];

const SEGMENT_META = {
  segment: {
    key: 'seg-product', title: 'Revenue by segment', feed: 'segProduct',
    info: 'Product and service lines as the company itself names them in its filings, so the '
      + 'names are the filing’s words and change when the company changes them.',
    missing: 'This company does not report a product or service breakdown of its revenue.',
  },
  geography: {
    key: 'seg-geo', title: 'Revenue by geography', feed: 'segGeography',
    info: 'Regions as the company itself defines them, which is rarely a country and never a '
      + 'consistent map between two companies. “Americas” and “Europe” mean whatever the filing '
      + 'says they mean.',
    missing: 'This company does not report a geographic breakdown of its revenue.',
  },
};

export function renderStatisticsTab(a) {
  const panel = el('div', { id: 'stat-panel', role: 'tabpanel' });
  const metrics = metricsPanel(a);
  let current = PANELS[0].key;

  const buttons = PANELS.map((p) => el('button', {
    type: 'button', class: 'subtab', role: 'tab', id: `stat-tab-${p.key}`,
    'aria-controls': 'stat-panel', text: p.label,
    onclick: () => show(p.key),
  }));

  function show(key) {
    current = key;
    const chosen = PANELS.find((p) => p.key === key) || PANELS[0];
    if (chosen.key === 'metrics') {
      // The metrics panel is built once and kept: it carries the filter box,
      // and rebuilding it would throw away whatever the reader had typed
      // every time they glanced at a breakdown.
      panel.replaceChildren(metrics);
    } else if (chosen.key === 'performance') {
      panel.replaceChildren(el('div', { class: 'ovw' }, performancePanel(a)));
    } else {
      const seg = chosen.key === 'segment' ? a.segments?.product : a.segments?.geography;
      panel.replaceChildren(
        el('div', { class: 'ovw' }, segmentPanel(a, seg, SEGMENT_META[chosen.key])),
      );
    }
    panel.setAttribute('aria-labelledby', `stat-tab-${chosen.key}`);
    buttons.forEach((b, i) => {
      const on = PANELS[i].key === key;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      // One stop for the whole strip, arrow keys inside it — which is what a
      // tablist owes a keyboard, and what three tab stops in a row would not.
      b.tabIndex = on ? 0 : -1;
    });
  }

  const strip = el('div', {
    class: 'subtabs', role: 'tablist', 'aria-label': 'Statistics view',
  }, buttons);

  strip.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = PANELS.findIndex((p) => p.key === current);
    const next = (i + step + PANELS.length) % PANELS.length;
    show(PANELS[next].key);
    buttons[next].focus();
  });

  show(current);

  return el('div', {}, [strip, panel, basisNote(a)]);
}

/* ---------- the metrics grid ---------------------------------------------- */

function metricsPanel(a) {
  const groups = buildGroups(a);
  const total = groups.reduce((n, gr) => n + gr.rows.length, 0);

  const grid = el('div', { class: 'ovw ovw--dense' });
  const count = el('span', { class: 'statbar__count' });

  let query = '';
  let hideEmpty = false;

  const search = el('input', {
    type: 'search', class: 'statbar__input',
    placeholder: 'Filter metrics — try "margin", "debt", "yield"',
    'aria-label': 'Filter metrics',
    oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); },
  });

  const emptyToggle = el('label', { class: 'statbar__toggle' }, [
    el('input', {
      type: 'checkbox',
      onchange: (e) => { hideEmpty = e.target.checked; draw(); },
    }),
    el('span', { text: 'Hide unavailable' }),
  ]);

  const available = (r) => !(hideEmpty && r.value === 'n/a');

  /**
   * Metric names first, section names only if nothing is named that.
   *
   * Matching both at once looked helpful and read as a bug: "margin" returned
   * the Margins card whole, so "Effective tax rate" appeared under a search
   * for margins. So the rule is two-pass — if any metric on the page is called
   * what you typed, you get those metrics; if none is, you get the section
   * that is called that. Typing "dividends" still finds the card, and typing
   * "payout" still finds the two rows inside it.
   *
   * The basis and the tooltip are deliberately not searched: they repeat
   * "TTM" across most of the page, and matching them would return everything.
   */
  function visibleRows() {
    const byLabel = new Map();
    let hits = 0;

    for (const gr of groups) {
      const rows = gr.rows.filter((r) => available(r)
        && (!query || r.label.toLowerCase().includes(query)));
      hits += rows.length;
      byLabel.set(gr, rows);
    }
    if (!query || hits) return byLabel;

    const byTitle = new Map();
    for (const gr of groups) {
      byTitle.set(gr, gr.title.toLowerCase().includes(query) ? gr.rows.filter(available) : []);
    }
    return byTitle;
  }

  function draw() {
    let shown = 0;
    const cards = [];
    const visible = visibleRows();

    for (const gr of groups) {
      const rows = visible.get(gr) || [];
      // A group with no rows is normally a group the filter emptied, and is
      // dropped. A group with a gate is the exception: when the feed behind
      // it is unavailable, "there is no such data" is the answer to the
      // lookup, and a card that simply vanished would read as a metric this
      // page never knew about. `gr.rows`, not the filtered `rows` — the gate
      // is about missing data, not about the filter or the toggle.
      const gate = !query && !gr.rows.length && gr.gate ? gr.gate() : null;
      if (!rows.length && !gate) continue;
      shown += rows.length;

      cards.push(card(`st-${gr.key}`, [
        ohead(gr.title, null, gr.info),
        gate,
        // Charts are the shape of a whole card. A filtered card is a couple of
        // rows lifted out of it, and the shape is no longer theirs.
        !query && rows.length && gr.chart ? gr.chart() : null,
        rows.length ? el('div', { class: 'ostats' }, rows.map((r) => statLine(
          r.label,
          // `n/a` is greyed rather than printed like a figure: on a page this
          // dense the eye should be able to skip the gaps. Anything with a
          // direction is green up and red down; everything else is left the
          // colour of text, because a level has no direction to colour.
          el('span', {
            class: r.value === 'n/a' ? 'subtle' : signClass(r.dir),
            text: r.value,
          }),
          { note: r.basis, title: r.title },
        ))) : null,
      ], `ocard ovw__c${gr.c}`));
    }

    grid.replaceChildren(...(cards.length ? cards : [
      card('st-none', [notice(`No metric or section matches <b>${esc(query)}</b>`
        + `${hideEmpty ? ' among the metrics with a figure' : ''}. Try a shorter word — `
        + '"debt", "margin", "yield", "growth".')], 'ocard ovw__c12'),
    ]));

    count.textContent = query || hideEmpty
      ? `${shown} of ${total} metrics`
      : `${total} metrics`;
  }

  draw();

  return el('div', {}, [
    el('div', { class: 'statbar' }, [
      el('div', { class: 'statbar__search' }, [search]),
      emptyToggle,
      count,
    ]),
    grid,
  ]);
}

/**
 * The one paragraph this page owes the reader.
 *
 * It sits under the panel rather than above it: the page is a lookup surface,
 * and a caveat between the reader and the search box is a caveat they will
 * scroll past. Each row already carries its own period in the note beside it.
 */
function basisNote(a) {
  const filed = yearOf(a.facts.lastReported);
  return el('p', { class: 't-xs soft mt3', text: 'Every figure here is read from the same '
    + 'analysis the rest of the report is built on — nothing on this page is graded, ranked '
    + 'against a sector, or interpreted. Trailing-twelve-month figures come from the vendor’s '
    + 'TTM ratios; anything marked with a fiscal year comes from the filed annual statements'
    + (isNum(filed) ? `, the most recent of which ends in ${filed}` : '')
    + '. Where the two disagree, they are measuring different periods rather than contradicting '
    + 'each other. Green and red mark the direction of a change, never whether a level is good.' });
}
