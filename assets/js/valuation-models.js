/* ==========================================================================
   Maz Vantage — intrinsic value models

   Every way the report can put a fair value on a share. The Valuation section
   offers these in a picker; whichever is chosen drives the fair-value chart,
   the assumptions table and the sentence beneath it. Every model that returns
   a value also lands on the range chart, so the spread between them is
   visible without clicking through the menu.

     fairValue(a, { basis }) -> Result | null
     bases(a)                -> [{ id, label, available, why }]  (relative only)
     basis                   -> one line on what the model actually does

   A model returns the whole working, not just a number:

     value      price per share
     target     the multiple applied, for the relative models
     basis      which target the multiple came from
     basisLabel how to name that target on screen
     n          sample size behind the target
     steps      the arithmetic, top to bottom, for the assumptions table
     projection the year-by-year cash flow path, for the DCF models
     blocked    why this model cannot price this company, when it cannot
     note       a caveat worth showing, or null

   NOTHING HERE IS GRADED. The factor score is deliberately blind to every
   fair value on this page — see `ungraded` on `dcfDiscount` in factors.js.
   A model is a set of assumptions, and letting a chosen assumption move a
   sector-relative grade would make the grade mean something different for
   every reader.
   ========================================================================== */

import { isNum, median } from './util.js';
import { medianOf } from './grading.js';

/* ==========================================================================
   Drivers

   The figures a multiple gets applied to. Trailing-twelve-month throughout —
   the sector table is built from TTM ratios, so a target multiple drawn from
   it has to meet a TTM driver or the two are measuring different years.
   ========================================================================== */

const ratio = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);
const times = (a, b) => (isNum(a) && isNum(b) ? a * b : null);

function drivers(a) {
  const f = a.facts;
  const r = a.ds.get('ratiosTtm') || {};
  const km = a.ds.get('metricsTtm') || {};

  const shares = f.shares;
  const revenue = f.revenue;

  // Net debt for the enterprise-to-equity bridge, taken from the vendor's own
  // enterprise value rather than the balance sheet. The sector's EV multiples
  // were built from that same enterprise value, so bridging back any other way
  // silently values the company on a different definition than the one the
  // target multiple was drawn from. For AAPL the two differ by ~13bn.
  const netDebt = (isNum(km.enterpriseValueTTM) && isNum(km.marketCap))
    ? km.enterpriseValueTTM - km.marketCap
    : f.netDebt;

  return {
    shares,
    netDebt,
    netDebtFromEv: isNum(km.enterpriseValueTTM) && isNum(km.marketCap),

    eps: f.eps,
    revenuePerShare: r.revenuePerShareTTM ?? ratio(revenue, shares),
    bookPerShare: f.bookValuePerShare ?? ratio(f.equity, shares),

    revenue,
    ebitda: times(revenue, r.ebitdaMarginTTM ?? f.ebitdaMargin),
    ebit: times(revenue, r.ebitMarginTTM ?? r.operatingProfitMarginTTM ?? f.operatingMargin),
  };
}

/* ==========================================================================
   Where a target multiple comes from

   Three answers, and which are available depends on the multiple. The sector
   table carries all six. Peer ratios are one `ratios-ttm` call per peer, so
   only the three multiples that feed publishes. The company's own history is
   thinner still: `ratios-hist` carries P/E and nothing else, and rebuilding
   the rest would need years of historical prices the report does not fetch.

   Rather than hide the unavailable ones, each is returned with the reason —
   the picker shows them greyed out, so the reader can see that the choice
   exists and why it is not on offer here.
   ========================================================================== */

export const BASES = [
  { id: 'sector',  label: 'Sector median' },
  { id: 'peers',   label: 'Peer median' },
  { id: 'history', label: 'Own 10-year median' },
];

export const DEFAULT_BASIS = 'sector';

/** A multiple only makes sense positive, and a broken one poisons a median. */
const sane = (cap) => (v) => isNum(v) && v > 0 && v < cap;

function sectorTarget(a, model) {
  // `distFor` falls back to a peer-built distribution when the sector table
  // has nothing. That fallback is right for grading and wrong here — it would
  // label a peer median as the sector's — so the source is checked.
  const found = a.lookup?.distFor?.(model.sectorMetric);
  if (!found || found.source !== 'sector') return null;
  // `p` is a ladder of quantile breakpoints, not a sample — its median is the
  // middle rung, and `sane` must not touch it. Dropping a broken tail value
  // here would shift every remaining rung and quietly move the median.
  const value = medianOf(found.dist.p);
  if (!sane(model.cap)(value)) return null;
  return {
    value,
    n: found.dist.n ?? a.lookup.count ?? null,
    label: `${a.facts.sector || 'Sector'} median`,
  };
}

function peerTarget(a, model) {
  if (!model.peerField) return null;
  const rows = Object.values(a.peerRatios || {});
  const sample = rows.map((r) => r?.[model.peerField]).filter(sane(model.cap));
  if (sample.length < 3) return null;
  return { value: median(sample), n: sample.length, label: `${sample.length}-peer median` };
}

function historyTarget(a, model) {
  if (!model.historyField) return null;
  const rows = a.ds.get('ratiosHist') || [];
  const sample = rows.map((r) => r?.[model.historyField]).filter(sane(model.cap));
  if (sample.length < 3) return null;
  const years = new Set(rows.map((r) => r?.fiscalYear).filter(Boolean));
  return {
    value: median(sample),
    n: sample.length,
    label: `own ${years.size || sample.length}-year median`,
  };
}

const TARGETS = { sector: sectorTarget, peers: peerTarget, history: historyTarget };

/** Why a basis is not on offer for this particular multiple. */
function unavailableWhy(id, model) {
  if (id === 'peers' && !model.peerField) {
    return 'Peer ratios cover P/E, P/S and P/B only — the report fetches one ratio call per peer.';
  }
  if (id === 'history' && !model.historyField) {
    return 'The historical ratio feed carries P/E only; the rest would need years of past prices.';
  }
  return 'Not enough data to build this target.';
}

/* ==========================================================================
   The relative multiples

   fair value = target multiple x driver

   For an equity multiple the driver is already per share and the answer falls
   straight out. For an enterprise multiple the product is an enterprise
   value, so net debt comes off before dividing by the share count — an
   acquirer inherits the debt, and the equity holder is behind it.
   ========================================================================== */

function relativeFairValue(model, a, basis) {
  const d = drivers(a);
  const target = TARGETS[basis]?.(a, model);
  if (!target) return null;

  const driver = model.driver(d);
  if (!isNum(driver)) {
    return { value: null, blocked: `${model.driverLabel} is not available for this company.` };
  }
  // A negative driver inverts the whole exercise: a loss-making company priced
  // on a positive earnings multiple returns a negative "fair value", which is
  // arithmetic, not a valuation. Say so instead.
  if (driver <= 0) {
    return { value: null, blocked: `${model.driverLabel} is negative, so this multiple cannot value the company.` };
  }

  const gross = target.value * driver;
  const steps = [
    { label: `Target ${model.short}`, value: target.value, kind: 'mult', note: target.label },
    { label: model.driverLabel, value: driver, kind: model.kind === 'ev' ? 'money' : 'price' },
  ];

  let equity;
  if (model.kind === 'ev') {
    if (!isNum(d.netDebt)) return { value: null, blocked: 'Net debt is not available, so enterprise value cannot be bridged to equity.' };
    equity = gross - d.netDebt;
    steps.push(
      { label: 'Implied enterprise value', value: gross, kind: 'money' },
      // Signed, so the column visibly adds up. Labelling it "Less net debt"
      // and then printing a minus sign reads as a double negative.
      { label: d.netDebt >= 0 ? 'Net debt' : 'Net cash', value: -d.netDebt, kind: 'money' },
      { label: 'Implied equity value', value: equity, kind: 'money' },
      { label: 'Shares outstanding', value: d.shares, kind: 'count' },
    );
    if (equity <= 0) {
      return { value: null, blocked: 'Net debt exceeds the implied enterprise value, so the equity is worth nothing on this multiple.' };
    }
  } else {
    equity = null;
  }

  const value = model.kind === 'ev' ? ratio(equity, d.shares) : gross;
  if (!isNum(value) || value <= 0) return { value: null, blocked: 'The calculation did not produce a usable share price.' };

  steps.push({ label: 'Fair value per share', value, kind: 'price', total: true });

  return {
    value,
    target: target.value,
    basis,
    basisLabel: target.label,
    n: target.n,
    steps,
    note: model.kind === 'ev' && d.netDebtFromEv
      ? 'Net debt is taken from the vendor’s enterprise value, matching how the sector’s EV multiples were built.'
      : null,
  };
}

/**
 * One relative-multiple model.
 *
 * @param {string} cap  the multiple above which a sample point is treated as
 *                      broken data rather than an expensive company. Medians
 *                      are robust, but a feed that reports 1e9 for a P/E on a
 *                      near-zero earnings base still drags the tail.
 */
function multiple({ id, label, short, kind, sectorMetric, peerField, historyField, driver, driverLabel, cap, basis }) {
  const model = { id, label, short, kind, sectorMetric, peerField, historyField, driver, driverLabel, cap, basis, relative: true };
  model.fairValue = (a, opts = {}) => relativeFairValue(model, a, opts.basis || DEFAULT_BASIS);
  model.bases = (a) => BASES.map((b) => {
    const t = TARGETS[b.id](a, model);
    return t
      ? { ...b, available: true, target: t.value, n: t.n, why: t.label }
      : { ...b, available: false, why: unavailableWhy(b.id, model) };
  });
  return model;
}

/* ==========================================================================
   Discounted cash flow

   Unlevered free cash flow, discounted at WACC, bridged to equity with the
   same net debt the relative multiples use so the two families are comparable.

     FCFF = EBIT x (1 - tax) + depreciation & amortisation - capex

   Working capital movements are not forecast — no feed here projects them —
   so the figure runs slightly rich for a business whose receivables grow with
   revenue. That omission is stated in the panel rather than hidden.

   The analyst years are used exactly as published. FMP's consensus thins out
   in the outer years and wobbles as a result — AAPL's 2029 revenue sits below
   2028 before jumping 43% in 2030 — and that wobble is kept rather than
   smoothed away. Where a ten-year model runs past the consensus it has to
   invent the remaining years; those are grown from the forecast's *median*
   year-on-year step, not from the last one, because anchoring invented years
   to a single wobbling step would compound the artefact rather than report it.
   ========================================================================== */

/** Sensible bounds for an extrapolated growth rate, before the fade to `g`. */
const EXTEND_GROWTH_CAP = 0.20;

/** Used when the filings report no interest expense, which FMP writes as 0. */
const DEFAULT_DEBT_SPREAD = 0.01;

function waccOf(a, d) {
  const bm = a.bm || {};
  const rf = isNum(bm.riskFreeRate) ? bm.riskFreeRate : null;

  // CAPM, the same cost of equity the Momentum section already reports, so a
  // reader who checks both does not find two different hurdle rates.
  const ke = a.momentum?.costOfEquity;
  if (!isNum(ke) || ke <= 0) return null;

  const tax = isNum(a.facts.effectiveTaxRate)
    ? Math.min(Math.max(a.facts.effectiveTaxRate, 0), 0.5)
    : 0.21;

  const debt = a.facts.totalDebt;
  const equity = isNum(a.facts.marketCap) ? a.facts.marketCap : null;
  if (!isNum(equity) || equity <= 0) return null;

  // FMP writes 0 for interest expense whenever it is not meaningful, which is
  // indistinguishable from genuinely free debt. Fall back to a spread over the
  // risk-free rate rather than pricing this company's borrowing at nothing.
  const interest = a.facts.interestExpense;
  const derived = (isNum(interest) && interest > 0 && isNum(debt) && debt > 0) ? interest / debt : null;
  const kdFallback = derived == null;
  const kd = derived ?? (isNum(rf) ? rf + DEFAULT_DEBT_SPREAD : 0.05);

  const D = isNum(debt) && debt > 0 ? debt : 0;
  const V = equity + D;
  const wacc = (ke * equity / V) + (kd * (1 - tax) * D / V);
  if (!isNum(wacc) || wacc <= 0) return null;

  return { wacc, ke, kd, kdFallback, tax, weightD: D / V };
}

/**
 * A free cash flow path `years` long.
 *
 * Analyst rows first, verbatim. Past them, revenue grows from the forecast's
 * median step and fades linearly to the terminal rate, while margins, capex
 * intensity and depreciation hold at the last published year's levels.
 */
function projectFcff(a, d, { years, g, tax }) {
  // The consensus set opens on the *current* fiscal year, and for a company
  // whose year has already closed that first row is a reported result, not a
  // forecast. Discounting it as year one would value cash that has already
  // arrived and push every later year a step too far out. `forecast.base` is
  // the first row at or after this calendar year, which is the same anchor
  // the Growth section forecasts from.
  const from = a.forecast?.base?.year;
  const src = (a.forecast?.rows || [])
    .filter((r) => isNum(r.revenue) && r.revenue > 0)
    .filter((r) => !isNum(from) || r.year >= from);
  if (!src.length) return null;

  const rows = [];
  for (const r of src.slice(0, years)) {
    const ebit = isNum(r.ebit) ? r.ebit : null;
    const dna = isNum(r.ebitda) && isNum(ebit) ? r.ebitda - ebit : null;
    rows.push({ year: r.year, revenue: r.revenue, ebitda: r.ebitda, ebit, dna, estimated: true });
  }
  if (!rows.some((r) => isNum(r.ebit))) return null;

  const last = rows[rows.length - 1];
  const lastEbitMargin = isNum(last.ebit) ? last.ebit / last.revenue : null;
  const lastDnaRate = isNum(last.dna) ? last.dna / last.revenue : 0;
  if (!isNum(lastEbitMargin)) return null;

  // Invented years, if the horizon runs past the consensus.
  const extra = years - rows.length;
  if (extra > 0) {
    const median = a.forecast?.revenueGrowth;
    const start = isNum(median) ? Math.min(Math.max(median, g), EXTEND_GROWTH_CAP) : g;
    let revenue = last.revenue;
    for (let k = 1; k <= extra; k++) {
      const rate = start + (g - start) * (k / extra);
      revenue *= 1 + rate;
      const ebit = revenue * lastEbitMargin;
      const dna = revenue * lastDnaRate;
      rows.push({
        year: last.year + k, revenue, ebitda: ebit + dna, ebit, dna,
        estimated: false, growth: rate,
      });
    }
  }

  const capexRate = isNum(a.facts.capexToRevenue) ? Math.abs(a.facts.capexToRevenue) : 0;
  for (const r of rows) {
    r.capex = r.revenue * capexRate;
    r.fcff = isNum(r.ebit) ? r.ebit * (1 - tax) + (r.dna ?? 0) - r.capex : null;
  }
  return rows.every((r) => isNum(r.fcff)) ? rows : null;
}

function dcfFairValue(model, a) {
  const d = drivers(a);
  const w = waccOf(a, d);
  if (!w) return { value: null, blocked: 'A discount rate could not be built — it needs a beta, a market cap and the benchmark rates from Settings.' };

  const g = isNum(a.bm?.terminalGrowth) ? a.bm.terminalGrowth : 0.025;
  const rows = projectFcff(a, d, { years: model.years, g, tax: w.tax });
  if (!rows) return { value: null, blocked: 'No analyst forecast of revenue and operating profit is available to discount.' };

  const pvFlows = rows.reduce((acc, r, i) => acc + r.fcff / ((1 + w.wacc) ** (i + 1)), 0);
  const last = rows[rows.length - 1];

  // Terminal value. Each method ends the stream a different way, and each is
  // an assumption about a different thing: perpetual growth assumes the
  // business keeps compounding, an exit multiple assumes someone pays a
  // sector-typical price for it.
  let tv = null;
  let tvNote = '';
  if (model.terminal === 'growth') {
    if (w.wacc <= g) {
      return { value: null, blocked: `The discount rate (${(w.wacc * 100).toFixed(1)}%) does not exceed the terminal growth rate (${(g * 100).toFixed(1)}%), so a perpetuity has no finite value. Lower the terminal growth in Settings.` };
    }
    tv = last.fcff * (1 + g) / (w.wacc - g);
    tvNote = `${(g * 100).toFixed(1)}% perpetual growth on ${last.year} cash flow`;
  } else {
    const exit = sectorTarget(a, { sectorMetric: model.exitMetric, cap: model.exitCap });
    if (!exit) return { value: null, blocked: `No ${model.exitLabel} multiple is available for this sector to exit on.` };
    const base = model.terminal === 'ebitda' ? last.ebitda : last.revenue;
    if (!isNum(base) || base <= 0) {
      return { value: null, blocked: `${model.terminal === 'ebitda' ? 'Terminal EBITDA' : 'Terminal revenue'} is not positive, so an exit multiple cannot be applied.` };
    }
    tv = exit.value * base;
    tvNote = `${trimMult(exit.value)} ${model.exitLabel} on ${last.year} ${model.terminal === 'ebitda' ? 'EBITDA' : 'revenue'}, the ${exit.label}`;
  }

  const pvTv = tv / ((1 + w.wacc) ** rows.length);
  const ev = pvFlows + pvTv;
  if (!isNum(d.netDebt)) return { value: null, blocked: 'Net debt is not available, so enterprise value cannot be bridged to equity.' };
  const equity = ev - d.netDebt;
  const value = ratio(equity, d.shares);
  if (!isNum(value) || value <= 0) {
    return { value: null, blocked: 'The discounted cash flows do not cover the debt, so this model puts no value on the equity.' };
  }

  const invented = rows.filter((r) => !r.estimated).length;
  const steps = [
    {
      label: 'Discount rate (WACC)', value: w.wacc, kind: 'rate',
      note: `cost of equity ${(w.ke * 100).toFixed(1)}%, after-tax cost of debt ${(w.kd * (1 - w.tax) * 100).toFixed(1)}%`
        + (w.kdFallback ? ' (no interest expense reported — risk-free plus 1%)' : '')
        + `, ${(w.weightD * 100).toFixed(0)}% debt-weighted`,
    },
    {
      label: 'Forecast horizon', value: rows.length, kind: 'years',
      note: invented
        ? `${rows.length - invented} analyst years, then ${invented} grown from the median forecast step and faded to ${(g * 100).toFixed(1)}%`
        : `${rows.length} analyst years, used as published`,
    },
    { label: 'Present value of forecast cash flows', value: pvFlows, kind: 'money' },
    { label: 'Terminal value', value: tv, kind: 'money', note: tvNote },
    {
      label: 'Present value of terminal value', value: pvTv, kind: 'money',
      // The share of the answer that rests on the terminal assumption is the
      // one diagnostic that says how much of this is a forecast at all.
      note: `${Math.round((pvTv / ev) * 100)}% of enterprise value`,
    },
    { label: 'Enterprise value', value: ev, kind: 'money' },
    { label: d.netDebt >= 0 ? 'Net debt' : 'Net cash', value: -d.netDebt, kind: 'money' },
    { label: 'Implied equity value', value: equity, kind: 'money' },
    { label: 'Shares outstanding', value: d.shares, kind: 'count' },
    { label: 'Fair value per share', value, kind: 'price', total: true },
  ];

  return {
    value,
    steps,
    projection: rows,
    note: 'Free cash flow is EBIT after tax, plus depreciation, less capex. Working capital movements are not forecast, '
      + 'so the cash flows run slightly rich for a business whose receivables grow with revenue.'
      + (d.netDebtFromEv ? ' Net debt is taken from the vendor’s enterprise value, matching the relative models.' : ''),
  };
}

const trimMult = (v) => `${Number(v.toFixed(1))}x`;

/** One discounted cash flow model: a horizon and a way to end the stream. */
function dcf({ id, label, short, years, terminal, exitMetric, exitLabel, exitCap, basis }) {
  const model = { id, label, short, years, terminal, exitMetric, exitLabel, exitCap, basis, dcf: true };
  model.fairValue = (a) => dcfFairValue(model, a);
  return model;
}

export const MODEL_GROUPS = [
  {
    label: 'Discounted cash flow',
    models: [
      {
        id: 'fmpLevered',
        label: 'Levered DCF (vendor)', short: 'Levered DCF',
        basis: 'Financial Modeling Prep’s levered discounted cash flow, discounting free cash flow to equity.',
        // A levered DCF on a company burning cash discounts to a negative
        // equity value per share — FMP returns it, and it is a real output of
        // the model, but it is not a price. Reporting it as one would put a
        // dot at minus several hundred dollars on the range chart and read as
        // a fair value rather than as "this model cannot price this company".
        fairValue: (a) => {
          if (!isNum(a.fairValue)) return null;
          if (a.fairValue <= 0) {
            return {
              value: null,
              blocked: 'The vendor’s model discounts to a negative value per share, '
                + 'which says the forecast cash flows do not cover the debt — not that the shares are worth less than nothing.',
            };
          }
          return {
            value: a.fairValue,
            steps: [{ label: 'Fair value per share', value: a.fairValue, kind: 'price', total: true }],
            note: 'Computed by the data vendor. Its discount rate and forecast are not published, so the assumptions below cannot be shown.',
          };
        },
      },
      dcf({
        id: 'dcf10yEbitdaExit', label: 'DCF 10 Year EBITDA Exit', years: 10, short: 'DCF 10y EBITDA exit',
        terminal: 'ebitda', exitMetric: 'evToEbitdaTtm', exitLabel: 'EV/EBITDA', exitCap: 300,
        basis: 'Ten years of forecast free cash flow, with the terminal value set by an exit EBITDA multiple.',
      }),
      dcf({
        id: 'dcf10yRevenueExit', label: 'DCF 10 Year Revenue Exit', years: 10, short: 'DCF 10y revenue exit',
        terminal: 'revenue', exitMetric: 'evToSalesTtm', exitLabel: 'EV/Revenue', exitCap: 100,
        basis: 'Ten years of forecast free cash flow, with the terminal value set by an exit revenue multiple.',
      }),
      dcf({
        id: 'dcf10yTerminalGrowth', label: 'DCF 10 Year Terminal Growth Exit', years: 10, short: 'DCF 10y perpetuity',
        terminal: 'growth',
        basis: 'Ten years of forecast free cash flow, with the terminal value from a perpetual growth rate.',
      }),
      dcf({
        id: 'dcf5yEbitdaExit', label: 'DCF 5 Year EBITDA Exit', years: 5, short: 'DCF 5y EBITDA exit',
        terminal: 'ebitda', exitMetric: 'evToEbitdaTtm', exitLabel: 'EV/EBITDA', exitCap: 300,
        basis: 'Five years of forecast free cash flow, with the terminal value set by an exit EBITDA multiple.',
      }),
      dcf({
        id: 'dcf5yRevenueExit', label: 'DCF 5 Year Revenue Exit', years: 5, short: 'DCF 5y revenue exit',
        terminal: 'revenue', exitMetric: 'evToSalesTtm', exitLabel: 'EV/Revenue', exitCap: 100,
        basis: 'Five years of forecast free cash flow, with the terminal value set by an exit revenue multiple.',
      }),
      dcf({
        id: 'dcf5yTerminalGrowth', label: 'DCF 5 Year Terminal Growth Exit', years: 5, short: 'DCF 5y perpetuity',
        terminal: 'growth',
        basis: 'Five years of forecast free cash flow, with the terminal value from a perpetual growth rate.',
      }),
    ],
  },
  {
    label: 'Relative multiples',
    models: [
      multiple({
        id: 'evRevenueMultiple', label: 'EV / Revenue Multiples', short: 'EV/Revenue', kind: 'ev',
        sectorMetric: 'evToSalesTtm', peerField: null, historyField: null, cap: 100,
        driver: (d) => d.revenue, driverLabel: 'Revenue (TTM)',
        basis: 'A target EV/Revenue multiple applied to revenue, then net debt removed to reach equity value.',
      }),
      multiple({
        id: 'evEbitdaMultiple', label: 'EV / EBITDA Multiples', short: 'EV/EBITDA', kind: 'ev',
        sectorMetric: 'evToEbitdaTtm', peerField: null, historyField: null, cap: 300,
        driver: (d) => d.ebitda, driverLabel: 'EBITDA (TTM)',
        basis: 'A target EV/EBITDA multiple applied to EBITDA, then net debt removed to reach equity value.',
      }),
      multiple({
        id: 'evEbitMultiple', label: 'EV / EBIT Multiples', short: 'EV/EBIT', kind: 'ev',
        sectorMetric: 'evToEbitTtm', peerField: null, historyField: null, cap: 400,
        driver: (d) => d.ebit, driverLabel: 'Operating profit (TTM)',
        basis: 'A target EV/EBIT multiple applied to operating profit, then net debt removed.',
      }),
      multiple({
        id: 'priceSalesMultiple', label: 'Price / Sales Multiples', short: 'P/S', kind: 'equity',
        sectorMetric: 'priceToSalesTtm', peerField: 'priceToSalesRatioTTM', historyField: null, cap: 100,
        driver: (d) => d.revenuePerShare, driverLabel: 'Revenue per share (TTM)',
        basis: 'A target Price/Sales multiple applied to revenue per share.',
      }),
      multiple({
        id: 'peMultiple', label: 'P/E Multiples', short: 'P/E', kind: 'equity',
        sectorMetric: 'peGaapTtm', peerField: 'priceToEarningsRatioTTM', historyField: 'priceToEarningsRatio', cap: 300,
        driver: (d) => d.eps, driverLabel: 'Earnings per share (TTM)',
        basis: 'A target price/earnings multiple applied to earnings per share.',
      }),
      multiple({
        id: 'priceBookMultiple', label: 'Price / Book Multiples', short: 'P/B', kind: 'equity',
        sectorMetric: 'priceToBookTtm', peerField: 'priceToBookRatioTTM', historyField: null, cap: 100,
        driver: (d) => d.bookPerShare, driverLabel: 'Book value per share (TTM)',
        basis: 'A target Price/Book multiple applied to book value per share.',
      }),
    ],
  },
];

export const MODELS = MODEL_GROUPS.flatMap((g) => g.models);

export const DEFAULT_MODEL_ID = MODELS[0].id;

export const modelById = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

/**
 * Every model that produces a number, for the range chart.
 *
 * Each relative model is run on one basis — the caller's choice where it is
 * available, its own best otherwise — so the chart shows six multiples rather
 * than the same multiple six ways.
 */
export function allFairValues(a, { basis = DEFAULT_BASIS } = {}) {
  const out = [];
  for (const m of MODELS) {
    let res = null;
    try {
      res = m.relative
        ? (m.fairValue(a, { basis }) || m.fairValue(a, { basis: DEFAULT_BASIS }))
        : m.fairValue(a);
    } catch { res = null; }
    if (res && isNum(res.value) && res.value > 0) {
      out.push({
        id: m.id,
        label: m.short || m.label,
        full: m.label,
        value: res.value,
        basisLabel: res.basisLabel || null,
        target: res.target ?? null,
        family: m.relative ? 'multiple' : 'dcf',
      });
    }
  }
  return out.sort((x, y) => x.value - y.value);
}
