/* ==========================================================================
   Vanlior — the dividend model's inputs

   Everything the dividend lines read, derived once from the dataset the
   report already fetched. `MAZ_DIVIDEND_SPEC_FULL.md` is the specification;
   this file is the part of it that turns feeds into figures, and
   `dividend-lines.js` is the part that turns figures into ranked lines.

   ---------------------------------------------------------------------------
   Only payers are scored
   ---------------------------------------------------------------------------

   A company that pays nothing is **excluded from the dividend universe**, not
   given a low dividend score. A zero-yield non-payer ranked against payers
   would come last on every line and read as a bad dividend rather than as no
   dividend, which is a different statement. `inputs.pays` is that gate.

   ---------------------------------------------------------------------------
   Special dividends are separated first, and everything downstream depends
   on it
   ---------------------------------------------------------------------------

   A one-off payment makes the following year read as a cut, which wrecks
   both the growth CAGRs and every consistency line. So the record is split
   once, here: `regular` feeds every other line, `specials` feeds exactly one
   (Special-Dividend Reliance). Two rules, because the vendor labels specials
   inconsistently — the row's own `frequency`, and an amount far outside the
   run rate.

   ---------------------------------------------------------------------------
   The two workarounds, and what they cost
   ---------------------------------------------------------------------------

   FMP publishes no forward DPS consensus and no forward cash-flow consensus.
   The spec specifies substitutes for both, and both are computed here:

     A  DPS_fwd  = the latest regular declared payment × its frequency — an
                   indicated annualised rate, not a forecast.
     B  OCF/FCF  = netIncomeAvg(FY1) × the company's own cash conversion,
        (FY1)      averaged over three years rather than a single TTM point,
                   because a one-year conversion ratio drifts.

   Anything a workaround produces is marked on the line that uses it, so a
   modelled figure never reads as a reported one.
   ========================================================================== */

import { isNum, mean, stdev, cagr } from './util.js';
import { fetchFor, loadSnapshot, mapLimited } from './fmp.js';

/**
 * The quarterly statements, which a company report does not load.
 *
 * `incomeQ` and `cashflowQ` are `onDemand` feeds, so `loadDataset` never asks
 * for them — but every trailing-twelve-month figure in the specification is a
 * Σ4Q, and without them fourteen of the safety factor's twenty-seven lines go
 * dark. Two requests, paid only by a reader who opens this panel.
 *
 * The same three-step `loadAlphaBag` uses, and for the same reason: whatever
 * the dataset already holds, then live, then the bundled snapshot — so a
 * reader with no API key still sees the module work on the captured company.
 * A configured key always wins; the snapshot only fills what it could not.
 */
const QUARTERLY = ['incomeQ', 'cashflowQ'];

export async function loadDividendFeeds(symbol, ds = null) {
  const bag = {};
  const toFetch = [];
  for (const name of QUARTERLY) {
    const have = ds?.feeds?.[name];
    if (have && have.status === 'ok') bag[name] = have.data;
    else toFetch.push(name);
  }

  if (toFetch.length) {
    const results = await mapLimited(toFetch, (name) => fetchFor(name, symbol).catch(() => null), 2);
    toFetch.forEach((name, i) => {
      if (results[i]?.status === 'ok') bag[name] = results[i].data;
    });
  }

  const unfilled = QUARTERLY.filter((name) => !bag[name]);
  if (unfilled.length) {
    const snap = await loadSnapshot(symbol).catch(() => null);
    for (const name of unfilled) {
      if (snap?.feeds?.[name] != null) bag[name] = snap.feeds[name];
    }
  }
  return bag;
}

/** Payments a year, by the vendor's own frequency word. */
const PER_YEAR = {
  monthly: 12, quarterly: 4, 'semi-annual': 2, semiannual: 2, biannual: 2,
  annual: 1, yearly: 1,
};

/** Frequencies that are not a cadence at all — these rows are specials. */
const IRREGULAR = /special|irregular|one[- ]?time|interim bonus/i;

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (isNum(v) ? v : null);
const abs = (v) => (isNum(v) ? Math.abs(v) : null);

/** a ÷ b, or null unless both are numbers and the denominator is usable. */
function over(a, b, { denomMustBePositive = true } = {}) {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  if (denomMustBePositive && b < 0) return null;
  return a / b;
}

const DAY = 86400000;
const dateOf = (s) => {
  const t = Date.parse(String(s || ''));
  return Number.isNaN(t) ? null : t;
};

/** Sum one field over the first `n` rows, or null if any of them is missing. */
function sumOf(rows, field, n = 4) {
  const xs = rows.slice(0, n).map((r) => r?.[field]).filter(isNum);
  return xs.length === n ? xs.reduce((a, b) => a + b, 0) : null;
}

/* ==========================================================================
   The payment record
   ========================================================================== */

/**
 * Split the dividend record into the regular cadence and the specials.
 *
 * The amount rule uses the **median** of the record rather than the mean, so
 * one enormous special cannot drag the threshold up past itself. 2.5× is the
 * spec's shape: a genuine special is a multiple of the run rate, while a
 * normal raise is a few per cent.
 */
export function splitPayments(rows) {
  const clean = arr(rows)
    .map((d) => ({
      at: dateOf(d.date ?? d.paymentDate ?? d.recordDate),
      amount: num(d.adjDividend ?? d.dividend),
      frequency: d.frequency || '',
      raw: d,
    }))
    .filter((d) => d.at && isNum(d.amount) && d.amount > 0)
    .sort((a, b) => b.at - a.at);

  const labelled = clean.filter((d) => IRREGULAR.test(d.frequency));
  const rest = clean.filter((d) => !IRREGULAR.test(d.frequency));

  const amounts = rest.map((d) => d.amount).sort((a, b) => a - b);
  const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : null;
  const outsized = median ? rest.filter((d) => d.amount > median * 2.5) : [];

  const specials = [...labelled, ...outsized].sort((a, b) => b.at - a.at);
  const regular = rest.filter((d) => !outsized.includes(d));
  return { regular, specials, all: clean };
}

/** Payments a year, from the cadence the vendor states on the regular rows. */
function frequencyOf(regular) {
  for (const d of regular) {
    const n = PER_YEAR[String(d.frequency).trim().toLowerCase()];
    if (n) return n;
  }
  // No word to read: infer from the gap between the last two payments.
  if (regular.length >= 2) {
    const gap = (regular[0].at - regular[1].at) / DAY;
    if (gap > 0) return Math.max(1, Math.min(12, Math.round(365 / gap)));
  }
  return null;
}

/** Sum of the regular payments whose ex-date falls in `[from, to)`. */
const sumBetween = (regular, from, to) =>
  regular.filter((d) => d.at >= from && d.at < to).reduce((a, d) => a + d.amount, 0);

/**
 * Dividend per share by calendar year, regular payments only.
 *
 * **Both ends are trimmed, and the far end matters more than it looks.** The
 * current year is dropped until it is complete, or a company three quarters
 * through its year reads as having cut by a quarter. The *oldest* year is
 * dropped on the same test, because the feed returns a fixed number of rows
 * and that window almost always opens mid-year: Apple's record starts with a
 * single payment in 2015, and using 0.13 as the base of a ten-year CAGR
 * reported 23% a year for a dividend that has grown about 7%.
 *
 * Only the ends are trimmed. A short year inside the record is real — a
 * missed payment is information, and Payment Regularity is where it counts.
 */
function dpsByYear(regular, freq) {
  const map = new Map();
  for (const d of regular) {
    const y = new Date(d.at).getUTCFullYear();
    const cur = map.get(y) || { dps: 0, n: 0 };
    cur.dps += d.amount;
    cur.n += 1;
    map.set(y, cur);
  }
  const thisYear = new Date().getUTCFullYear();
  const years = [...map.entries()]
    .filter(([y]) => y < thisYear)
    .sort((a, b) => a[0] - b[0])
    .map(([year, v]) => ({ year, dps: v.dps, payments: v.n }));

  // Trim truncated years off the old end, where the feed's window cut them.
  const expected = isNum(freq) && freq > 0 ? freq : 1;
  let from = 0;
  while (from < years.length && years[from].payments < expected) from += 1;
  return years.slice(from);
}

/** DPS `back` full years before the latest complete one. */
const dpsYearsAgo = (byYear, back) => {
  if (!byYear.length) return null;
  const target = byYear.at(-1).year - back;
  return byYear.find((r) => r.year === target)?.dps ?? null;
};

/* ==========================================================================
   The inputs
   ========================================================================== */

/**
 * Everything the lines read, from the analysis object the report already has.
 *
 * Nothing here fetches. Where a figure needs a feed the report does not load,
 * the field is simply absent and the line that wanted it reports NM with its
 * own reason — which is the spec's rule and the app's.
 */
export function dividendInputs(a, extra = {}) {
  const ds = a.ds;
  const f = a.facts || {};
  // `extra` carries the quarterly statements `loadDividendFeeds` fetched, which
  // the report's own dataset does not hold.
  const get = (name) => extra[name]
    ?? (ds && typeof ds.get === 'function' ? ds.get(name) : null);

  const ratios = get('ratiosTtm') || {};
  const metrics = get('metricsTtm') || {};
  const income = arr(get('income'));
  const balance = arr(get('balance'));
  const cash = arr(get('cashflow'));
  const incomeQ = arr(get('incomeQ'));
  const cashQ = arr(get('cashflowQ'));
  const earnings = arr(get('earnings'));
  const metricsHist = arr(get('metricsHist'));
  const estimates = arr(get('estimates'));
  const prices = arr(get('prices'));

  const { regular, specials, all } = splitPayments(get('dividends'));
  const freq = frequencyOf(regular);
  const byYear = dpsByYear(regular, freq);

  const now = Date.now();
  const dpsTtm = regular.length ? sumBetween(regular, now - 365 * DAY, now + DAY) : null;
  const dpsPriorTtm = regular.length ? sumBetween(regular, now - 730 * DAY, now - 365 * DAY) : null;

  /* A payer whose last payment is more than two expected intervals old is
     lapsing. The spec's rule is to **flag it, not score the lapse as a zero**,
     so it stays inside the universe: a company that has stopped paying is a
     different thing from one that never paid, and only the record can say
     which. Its trailing yield really is heading toward zero and ranks there
     honestly; the flag is what stops that reading as a normal bad yield. */
  const lastRegular = regular[0] || null;
  const intervalDays = freq ? 365 / freq : null;
  const sinceLast = lastRegular ? (now - lastRegular.at) / DAY : null;
  const lapsed = isNum(sinceLast) && isNum(intervalDays) ? sinceLast > intervalDays * 2 : false;

  /* Workaround A — the indicated forward rate: the latest regular payment
     annualised at its own cadence. Not a forecast, and labelled as such
     wherever it is printed.

     A lapsing payer has no indicated rate. Annualising a payment that stopped
     being declared would put a forward yield on a dividend nobody is
     receiving, so every forward line goes NM instead. */
  const dpsFwd = lastRegular && freq && !lapsed ? lastRegular.amount * freq : null;

  /* ---- trailing twelve months, from the quarterly statements -------------
     The quarterly cash-flow statement carries no dividends-paid line, so the
     dividend side of every payout ratio is rebuilt as TTM DPS × diluted
     shares. The denominators are real Σ4Q figures. */
  const fcfTtm = sumOf(cashQ, 'freeCashFlow');
  const ocfTtm = sumOf(cashQ, 'operatingCashFlow') ?? sumOf(cashQ, 'netCashProvidedByOperatingActivities');
  const niTtm = sumOf(cashQ, 'netIncome') ?? sumOf(incomeQ, 'netIncome');
  const revenueTtm = sumOf(incomeQ, 'revenue');
  const ebitTtm = sumOf(incomeQ, 'ebit') ?? sumOf(incomeQ, 'operatingIncome');
  const ebitdaTtm = sumOf(incomeQ, 'ebitda');
  const shares = num(incomeQ[0]?.weightedAverageShsOutDil ?? incomeQ[0]?.weightedAverageShsOut)
    ?? num(income[0]?.weightedAverageShsOutDil ?? income[0]?.weightedAverageShsOut);

  // The prior twelve months, for the lines that measure a change in TTM.
  const priorOf = (rows, field) => {
    const xs = rows.slice(4, 8).map((r) => r?.[field]).filter(isNum);
    return xs.length === 4 ? xs.reduce((x, y) => x + y, 0) : null;
  };
  const revenuePriorTtm = priorOf(incomeQ, 'revenue');
  const ebitPriorTtm = priorOf(incomeQ, 'ebit') ?? priorOf(incomeQ, 'operatingIncome');

  /* Non-GAAP trailing EPS: the four most recent reported quarters on the
     earnings calendar, which is where the actual — rather than the filed —
     figure lives. */
  const epsNonGaapTtm = (() => {
    const xs = earnings
      .filter((r) => r && r.date && isNum(r.epsActual))
      .sort((x, y) => Date.parse(y.date) - Date.parse(x.date))
      .slice(0, 4)
      .map((r) => r.epsActual);
    return xs.length === 4 ? xs.reduce((x, y) => x + y, 0) : null;
  })();

  /** Dividends paid in cash, TTM: the per-share rate against the share count. */
  const dividendsPaidTtm = isNum(dpsTtm) && isNum(shares) ? dpsTtm * shares : null;

  /* ---- the latest filed year, as the fallback and for the annual lines --- */
  const fy = {
    income: income[0] || {},
    balance: balance[0] || {},
    cash: cash[0] || {},
  };
  const dividendsPaidFy = abs(fy.cash.commonDividendsPaid ?? fy.cash.netDividendsPaid);

  /* ---- forward estimates ------------------------------------------------- */
  const forward = estimates
    .filter((r) => r && r.date && Date.parse(r.date) > now)
    .sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
  const fy1 = forward[0] || null;
  const fy3 = forward[2] || null;              // FY+2 in the spec's numbering

  /* Workaround B — forward cash flow at the company's own conversion rate,
     averaged over three filed years rather than one so a single odd year of
     working capital cannot set the forward figure. */
  const conversion = (field) => {
    const rates = cash.slice(0, 3)
      .map((r) => over(r?.[field], r?.netIncome))
      .filter(isNum);
    return rates.length ? mean(rates) : null;
  };
  const ocfConversion = conversion('operatingCashFlow');
  const fcfConversion = conversion('freeCashFlow');
  const ocfFy1 = isNum(fy1?.netIncomeAvg) && isNum(ocfConversion) ? fy1.netIncomeAvg * ocfConversion : null;
  const fcfFy1 = isNum(fy1?.netIncomeAvg) && isNum(fcfConversion) ? fy1.netIncomeAvg * fcfConversion : null;

  /* ---- the annual yield record ------------------------------------------
     Dividends paid over the market capitalisation of the same filed year:
     a dividend yield per fiscal year, without a price history to read it off.
     `metricsHist` carries the year-end capitalisation. */
  const capByYear = new Map(metricsHist
    .filter((r) => r && isNum(r.marketCap))
    .map((r) => [r.fiscalYear ?? new Date(r.date).getUTCFullYear(), r.marketCap]));
  const yieldByYear = cash
    .map((r) => {
      const year = r.fiscalYear ?? new Date(r.date).getUTCFullYear();
      const paid = abs(r.commonDividendsPaid ?? r.netDividendsPaid);
      const cap = capByYear.get(year);
      return { year, y: over(paid, cap) };
    })
    .filter((r) => isNum(r.y));

  /** The share price at the end of filed year `back` years ago, from that
      year's capitalisation and share count — an approximation, and marked. */
  const priceYearsAgo = (back) => {
    const row = income[back];
    const year = row?.fiscalYear ?? (row ? new Date(row.date).getUTCFullYear() : null);
    const cap = year != null ? capByYear.get(year) : null;
    const sh = num(row?.weightedAverageShsOutDil ?? row?.weightedAverageShsOut);
    return over(cap, sh);
  };

  /* ---- price series ------------------------------------------------------ */
  const closes = prices
    .map((p) => ({ at: dateOf(p.date), close: num(p.price ?? p.close) }))
    .filter((p) => p.at && isNum(p.close))
    .sort((x, y) => x.at - y.at);
  const last90 = closes.slice(-90).map((p) => p.close);

  const price = num(f.price) ?? num(get('quote')?.price) ?? closes.at(-1)?.close ?? null;

  /* ---- the consistency record -------------------------------------------- */
  const growthRates = [];
  for (let i = 1; i < byYear.length; i++) {
    const prev = byYear[i - 1].dps;
    if (prev > 0) growthRates.push(byYear[i].dps / prev - 1);
  }

  /** Annual payout ratio per filed year, for the stability line. */
  const payoutByYear = cash
    .map((r) => over(abs(r.commonDividendsPaid ?? r.netDividendsPaid), r.netIncome))
    .filter(isNum);

  return {
    /* The gate. A record of regular payments, ever — not payments *lately*,
       which is what `lapsed` is for. A company with no record at all is the
       only one outside the universe. */
    pays: regular.length > 0,
    lapsed,
    sector: f.sector || null,
    symbol: f.symbol || null,
    name: f.name || f.symbol || null,

    /* the record */
    regular, specials, allPayments: all, freq, byYear, growthRates, payoutByYear, yieldByYear,
    dpsTtm, dpsPriorTtm, dpsFwd, lastPaymentAt: lastRegular?.at ?? null,
    dpsYearsAgo: (n) => dpsYearsAgo(byYear, n),

    /* trailing twelve months */
    fcfTtm, ocfTtm, niTtm, revenueTtm, ebitTtm, ebitdaTtm, shares,
    revenuePriorTtm, ebitPriorTtm, epsNonGaapTtm, dividendsPaidTtm,

    /* the filed year */
    fy, dividendsPaidFy,

    /* forward */
    fy1, fy3, ocfFy1, fcfFy1, ocfConversion, fcfConversion,

    /* market and balance sheet */
    price, marketCap: num(metrics.marketCap) ?? num(f.marketCap),
    enterpriseValue: num(metrics.enterpriseValueTTM),
    ratios, metrics,
    totalDebt: num(fy.balance.totalDebt),
    netDebt: num(fy.balance.netDebt),
    cashAndInvestments: num(fy.balance.cashAndShortTermInvestments),
    equity: num(fy.balance.totalStockholdersEquity),
    totalAssets: num(fy.balance.totalAssets),

    /* price-derived */
    closes, last90, priceYearsAgo,

    /* helpers the lines share */
    over, mean, stdev, cagr,
  };
}
