/* ==========================================================================
   Maz Vantage — the Alpha Signal providers

   Eleven adapters, one per category. Each takes a bag of feed results and
   returns signals; none of them knows what a score is worth, what the page
   looks like, or what any other provider found.

   ---------------------------------------------------------------------------
   Where this sits in the layering
   ---------------------------------------------------------------------------

   HANDOVER §7 says `model.js` is the only file that reads a vendor field
   name. This file breaks that rule, deliberately and narrowly: it is the
   Alpha Signal's own `model.js`. The alternative was to grow `model.js` by a
   third for a feature none of its existing consumers read, and to make every
   company report pay for quarterly statements it never opens.

   The rule the split preserves is the one that mattered: **exactly one file
   per feature knows the vendor's spelling**. `alpha-signals.js`,
   `alpha-score.js` and both views below it are vendor-agnostic, and swapping
   FMP for something else is this file and `fmp.js`.

   ---------------------------------------------------------------------------
   The adapter contract
   ---------------------------------------------------------------------------

       { id, category, label, feeds: [...], needs: [...], build(bag, ctx) }

   `feeds` is what it would like; `needs` is what it cannot work without. A
   provider whose `needs` are absent is never called — it returns an
   unavailable signal naming the integration instead, which is what keeps a
   gated plan or a missing key from reading as an absence of evidence.

   `build` must never throw on bad data. Every feed here can come back gated,
   empty, or with fields the snapshot happens not to carry, and a provider
   that throws takes the whole page down with it. `runProviders` catches
   anyway, as a second line, and reports the failure as a signal.

   ---------------------------------------------------------------------------
   Two honesty rules that shaped the signals below
   ---------------------------------------------------------------------------

   1. **FMP publishes no consensus-estimate history.** It publishes today's
      consensus and a monthly history of analyst *ratings*. Those are not the
      same measurement, and the revision provider says so in the category it
      would otherwise appear to cover, rather than quietly substituting one
      for the other.

   2. **Annual is a fallback, not a synonym.** The fundamental provider wants
      quarterly statements. Without a key — on the bundled snapshot — it falls
      back to annual filings, scores them with lower confidence, and prints
      which basis it used in the calculation line. It never presents an
      annual comparison as a quarterly one.
   ========================================================================== */

import { isNum, mean, sum } from './util.js';
import { fetchFor, mapLimited, loadSnapshot } from './fmp.js';
import { loadDisclosures, disclosuresFor, disclosureSignals } from './alpha-disclosures.js';
import {
  signal, unavailableSignal, fmpSource, source, bandScore, statusFor,
} from './alpha-signals.js';

/* ==========================================================================
   Feed sets
   ========================================================================== */

/** The five feeds nothing else in the app fetches. */
export const ALPHA_ONLY_FEEDS = [
  'incomeQ', 'cashflowQ', 'gradesHistorical', 'targetSummary', 'holdersSummary',
];

/** Feeds a company report already has, reused from its dataset when present. */
export const SHARED_FEEDS = [
  'income', 'cashflow', 'growth', 'estimates', 'insiderStats', 'employees',
  'segProduct', 'earnings', 'news', 'pressReleases', 'quote', 'profile',
  'prices', 'institutional',
];

/**
 * The reduced set a market scan pays for, per company.
 *
 * Six requests rather than nineteen. A scan tests hundreds of companies and
 * the full depth is unaffordable across that many; these six are the ones
 * that carry the categories with the most weight. The desk states the
 * resulting coverage on every row, so a scanned score is never mistaken for
 * the depth a company page gets.
 */
export const SCAN_FEEDS = [
  'incomeQ', 'gradesHistorical', 'targetSummary', 'insiderStats', 'estimates', 'quote',
];

/* ==========================================================================
   Feed plumbing
   ========================================================================== */

const empty = () => ({ status: 'skipped', data: null });

/** Newest first, defensively — a feed's order is the vendor's business. */
const byDateDesc = (rows, field = 'date') => (Array.isArray(rows) ? rows : [])
  .filter(Boolean)
  .slice()
  .sort((a, b) => new Date(b[field] || 0) - new Date(a[field] || 0));

const rowsOf = (bag, feed) => (bag[feed]?.status === 'ok' && Array.isArray(bag[feed].data)
  ? bag[feed].data : []);
const oneOf = (bag, feed) => (bag[feed]?.status === 'ok' && bag[feed].data && !Array.isArray(bag[feed].data)
  ? bag[feed].data : null);
const statusOf = (bag, feed) => bag[feed]?.status || 'skipped';

/**
 * Fetch everything a provider run needs for one symbol.
 *
 * `ds` is a company report's dataset when there is one: its feeds are reused
 * rather than refetched, so opening the Alpha tab on a report already loaded
 * costs the five on-demand feeds and nothing else.
 */
export async function loadAlphaBag(symbol, { ds = null, feeds = null, onProgress = null } = {}) {
  const wanted = feeds || [...ALPHA_ONLY_FEEDS, ...SHARED_FEEDS];
  const bag = {};
  const toFetch = [];

  for (const name of wanted) {
    const have = ds?.feeds?.[name];
    if (have && have.status !== 'skipped') bag[name] = have;
    else toFetch.push(name);
  }

  let done = 0;
  const results = await mapLimited(toFetch, async (name) => {
    const r = await fetchFor(name, symbol);
    onProgress?.(++done, toFetch.length);
    return r;
  }, 4);
  toFetch.forEach((name, i) => { bag[name] = results[i] || empty(); });

  /* Fall back to the bundled snapshot for anything still unfilled — the same
     file and the same rule `loadDataset` uses, and for the same reason.

     It matters more here than it does there. These five feeds are `onDemand`,
     so `loadDataset` never fetches them and never snapshot-fills them either;
     without this, a reader with no API key would see three of eleven
     categories permanently dark on a company the repo ships a full capture
     for. A snapshot feed is tagged `fromSnapshot`, exactly as `loadDataset`
     tags its own, so a surface that wants to say "this is a capture, not a
     live read" can.

     Deliberately *after* the live attempt, never instead of it: a configured
     key always wins, and the snapshot only fills what the key could not. */
  const unfilled = wanted.filter((name) => bag[name]?.status !== 'ok');
  if (unfilled.length) {
    const snap = await loadSnapshot(symbol);
    if (snap) {
      for (const name of unfilled) {
        if (snap.feeds?.[name] != null) {
          bag[name] = { status: 'ok', data: snap.feeds[name], fromSnapshot: true };
        }
      }
      bag.__snapshot = { capturedAt: snap.capturedAt || null };
    }
  }

  // The benchmark series a report already loaded, for relative strength.
  bag.__benchmarks = ds?.snapshotExtras?.benchmarks || null;

  /* The hand-captured disclosures, for the six categories no endpoint fills.
     One static file for the whole app, fetched once per page load and shared,
     so this costs nothing per symbol. A symbol with no entry gets `null` and
     every gap is reported exactly as it was before the file existed. */
  bag.__disclosures = disclosuresFor(await loadDisclosures(), symbol);
  return bag;
}

/** Did any signal in this bag come from the bundled capture rather than live? */
export const bagIsSnapshot = (bag) => Object.values(bag || {})
  .some((r) => r && typeof r === 'object' && r.fromSnapshot);

/** The capture date of the bundled snapshot, when one was used. */
export const bagCapturedAt = (bag) => bag?.__snapshot?.capturedAt || null;

/* ==========================================================================
   Small shared arithmetic
   ========================================================================== */

/** Percentage change, null-safe and sign-safe. */
function growthOf(now, prior) {
  if (!isNum(now) || !isNum(prior) || prior === 0) return null;
  // A sign flip has no meaningful percentage. Returning one would print
  // "revenue grew 250%" for a loss that got smaller.
  if (prior < 0 && now < 0) return (Math.abs(prior) - Math.abs(now)) / Math.abs(prior);
  if (prior < 0) return null;
  return (now - prior) / prior;
}

const ratio = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);

/** Sum a field across `count` rows starting at `from`, or null if any is missing. */
function window4(rows, field, from = 0, count = 4) {
  const slice = rows.slice(from, from + count);
  if (slice.length < count) return null;
  const vals = slice.map((r) => r?.[field]);
  return vals.every(isNum) ? sum(vals) : null;
}

const pp = (v) => (isNum(v) ? `${(v * 100).toFixed(1)} pts` : 'n/a');
const pctText = (v) => (isNum(v) ? `${(v * 100).toFixed(1)}%` : 'n/a');

/* ==========================================================================
   1. Fundamental inflection
   ========================================================================== */

const fundamentalProvider = {
  id: 'fundamental',
  category: 'fundamental',
  label: 'Fundamental inflection',
  feeds: ['incomeQ', 'cashflowQ', 'income', 'cashflow'],
  needs: [],

  build(bag, ctx) {
    const q = byDateDesc(rowsOf(bag, 'incomeQ'));
    const qc = byDateDesc(rowsOf(bag, 'cashflowQ'));
    if (q.length >= 8) return this.quarterly(q, qc, ctx);

    const a = byDateDesc(rowsOf(bag, 'income'));
    const ac = byDateDesc(rowsOf(bag, 'cashflow'));
    if (a.length >= 3) return this.annual(a, ac, ctx);

    return [unavailableSignal({
      category: 'fundamental',
      name: 'Revenue and margin inflection',
      symbol: ctx.symbol,
      provider: 'Quarterly or annual income statements (FMP)',
      note: statusOf(bag, 'incomeQ') === 'gated'
        ? 'Quarterly statements are not included in this FMP plan, and fewer than three annual '
          + 'filings came back to fall back on.'
        : 'Neither quarterly nor annual income statements were available for this company.',
    })];
  },

  /**
   * The measurement this category is actually for.
   *
   * Every comparison is a quarter against the **same quarter a year earlier**,
   * never against the quarter before it: almost every business this app covers
   * is seasonal, and a sequential comparison would report Apple's March
   * quarter as a catastrophe every year.
   *
   * Acceleration is then the second difference — this year-on-year rate
   * against the year-on-year rate one quarter ago. That is what "the business
   * changed direction" means, and it is why eight quarters are needed to say
   * anything at all.
   */
  quarterly(q, qc, ctx) {
    const out = [];
    const src = fmpSource('incomeQ', { publicationDate: q[0]?.filingDate || q[0]?.date, title: 'Quarterly income statement' });
    const period = `${q[0]?.fiscalYear || ''} ${q[0]?.period || ''}`.trim();
    const when = q[0]?.filingDate || q[0]?.date || null;

    /* ---- revenue growth acceleration ---- */
    const nowG = growthOf(q[0]?.revenue, q[4]?.revenue);
    const prevG = growthOf(q[1]?.revenue, q[5]?.revenue);
    if (isNum(nowG) && isNum(prevG)) {
      const accel = nowG - prevG;
      const score = bandScore(accel, { mid: 0, span: 0.10 });
      out.push(signal({
        category: 'fundamental',
        name: 'Revenue growth acceleration',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: nowG,
        previous: prevG,
        change: accel,
        unit: 'growth rate',
        sourceRef: src,
        sourceDate: when,
        dataQuality: 'calculated',
        confidence: 'high',
        calculation: `Year-on-year revenue growth for ${period} (${pctText(nowG)}) minus the same `
          + `measure one quarter earlier (${pctText(prevG)}). Each quarter is compared with the `
          + 'same quarter a year before, never with the quarter preceding it, because the '
          + 'businesses covered here are seasonal.',
        historical: `Latest four year-on-year rates: ${[0, 1, 2, 3]
          .map((i) => pctText(growthOf(q[i]?.revenue, q[i + 4]?.revenue)))
          .join(' · ')} (newest first).`,
        interpretation: accel > 0
          ? 'Revenue is growing faster than it was a quarter ago.'
          : 'Revenue is growing more slowly than it was a quarter ago.',
        limitations: 'Acquisitions, divestitures and currency are not stripped out. '
          + 'A company that bought revenue reads the same here as one that earned it.',
      }));
    }

    /* ---- gross margin ---- */
    const gmNow = ratio(q[0]?.grossProfit, q[0]?.revenue);
    const gmPrior = ratio(q[4]?.grossProfit, q[4]?.revenue);
    if (isNum(gmNow) && isNum(gmPrior)) {
      const d = gmNow - gmPrior;
      const score = bandScore(d, { mid: 0, span: 0.04 });
      out.push(signal({
        category: 'fundamental',
        name: 'Gross margin expansion',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: gmNow,
        previous: gmPrior,
        change: d,
        unit: 'margin',
        sourceRef: src,
        sourceDate: when,
        dataQuality: 'calculated',
        confidence: 'high',
        calculation: `Gross profit ÷ revenue for ${period} (${pctText(gmNow)}) against the same `
          + `quarter a year earlier (${pctText(gmPrior)}). The change is ${pp(d)}; the full scale `
          + 'is ±4 points.',
        interpretation: d > 0
          ? 'The company kept more of each unit of revenue than a year ago.'
          : 'The company kept less of each unit of revenue than a year ago.',
        limitations: 'Cost-of-revenue definitions differ between companies and change on '
          + 'restatement. The level is not comparable across companies; only the change is read here.',
      }));
    }

    /* ---- operating margin ---- */
    const omNow = ratio(q[0]?.operatingIncome, q[0]?.revenue);
    const omPrior = ratio(q[4]?.operatingIncome, q[4]?.revenue);
    if (isNum(omNow) && isNum(omPrior)) {
      const d = omNow - omPrior;
      const score = bandScore(d, { mid: 0, span: 0.04 });
      out.push(signal({
        category: 'fundamental',
        name: 'Operating margin expansion',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: omNow,
        previous: omPrior,
        change: d,
        unit: 'margin',
        sourceRef: src,
        sourceDate: when,
        dataQuality: 'calculated',
        confidence: 'high',
        calculation: `Operating income ÷ revenue for ${period} (${pctText(omNow)}) against the `
          + `same quarter a year earlier (${pctText(omPrior)}), a change of ${pp(d)}.`,
        interpretation: d > 0
          ? 'Operating leverage improved year on year.'
          : 'Operating leverage worsened year on year.',
        limitations: 'One-off charges sit inside operating income and are not adjusted out here.',
      }));
    }

    /* ---- free cash flow, on a trailing twelve ----
       Four quarters against the four before them, rather than quarter against
       quarter: cash flow is lumpier than earnings — one large tax payment or
       one quarter of working capital unwind moves it more than the business
       does — and a trailing twelve is the shortest window that is not mostly
       timing. */
    const fcfNow = window4(qc, 'freeCashFlow', 0);
    const fcfPrior = window4(qc, 'freeCashFlow', 4);
    const revNow = window4(q, 'revenue', 0);
    if (isNum(fcfNow) && isNum(fcfPrior) && isNum(revNow) && revNow > 0) {
      const d = (fcfNow - fcfPrior) / revNow;
      const score = bandScore(d, { mid: 0, span: 0.05 });
      out.push(signal({
        category: 'fundamental',
        name: 'Free cash flow inflection',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: fcfNow,
        previous: fcfPrior,
        change: d,
        unit: 'currency',
        sourceRef: fmpSource('cashflowQ', { publicationDate: qc[0]?.filingDate || qc[0]?.date, title: 'Quarterly cash flow statement' }),
        sourceDate: qc[0]?.filingDate || qc[0]?.date || when,
        dataQuality: 'calculated',
        confidence: 'high',
        calculation: 'Free cash flow over the last four reported quarters against the four '
          + 'before them, divided by trailing-twelve-month revenue to make the change '
          + `comparable across sizes. The swing is ${pp(d)} of revenue.`,
        interpretation: d > 0
          ? 'The business converted more of its revenue to cash than in the prior year.'
          : 'The business converted less of its revenue to cash than in the prior year.',
        limitations: 'Free cash flow here is the vendor\'s own line, which nets capital '
          + 'expenditure but not acquisitions or leases.',
      }));
    }

    return out;
  },

  /**
   * The fallback, when there is no key and only the bundled annual filings.
   *
   * Same second-difference idea one resolution down: FY0-on-FY−1 growth
   * against FY−1-on-FY−2 growth. It is a genuinely weaker measurement — a
   * year of data can hide a turn that happened in it — so confidence is
   * `low` and the calculation line says which basis was used.
   */
  annual(a, ac, ctx) {
    const out = [];
    const src = fmpSource('income', { publicationDate: a[0]?.filingDate || a[0]?.date, title: 'Annual income statement' });
    const when = a[0]?.filingDate || a[0]?.date || null;
    const fy = a[0]?.fiscalYear || (a[0]?.date || '').slice(0, 4);

    const nowG = growthOf(a[0]?.revenue, a[1]?.revenue);
    const prevG = growthOf(a[1]?.revenue, a[2]?.revenue);
    if (isNum(nowG) && isNum(prevG)) {
      const accel = nowG - prevG;
      const score = bandScore(accel, { mid: 0, span: 0.10 });
      out.push(signal({
        category: 'fundamental',
        name: 'Revenue growth acceleration (annual basis)',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: nowG,
        previous: prevG,
        change: accel,
        unit: 'growth rate',
        sourceRef: src,
        sourceDate: when,
        dataQuality: 'calculated',
        confidence: 'low',
        /* Plain prose, no markdown: every string on these surfaces is
           rendered through `text:` rather than `html:`, so an asterisk pair
           meant as emphasis reaches the reader as an asterisk pair. */
        calculation: `Annual revenue growth in FY${fy} (${pctText(nowG)}) minus the prior year's `
          + `(${pctText(prevG)}). Annual basis — quarterly statements were not available, so `
          + 'this is a year-resolution version of a measurement that wants quarters. A turn '
          + 'that happened inside the year is invisible to it.',
        interpretation: accel > 0
          ? 'Annual revenue growth was faster than the year before.'
          : 'Annual revenue growth was slower than the year before.',
        limitations: 'Annual resolution. Connect an FMP key for the quarterly measurement.',
      }));
    }

    const gmNow = ratio(a[0]?.grossProfit, a[0]?.revenue);
    const gmPrior = ratio(a[1]?.grossProfit, a[1]?.revenue);
    if (isNum(gmNow) && isNum(gmPrior)) {
      const d = gmNow - gmPrior;
      const score = bandScore(d, { mid: 0, span: 0.04 });
      out.push(signal({
        category: 'fundamental',
        name: 'Gross margin expansion (annual basis)',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: gmNow,
        previous: gmPrior,
        change: d,
        unit: 'margin',
        sourceRef: src,
        sourceDate: when,
        dataQuality: 'calculated',
        confidence: 'low',
        calculation: `Gross margin in FY${fy} (${pctText(gmNow)}) against the prior year `
          + `(${pctText(gmPrior)}), a change of ${pp(d)}. Annual basis.`,
        interpretation: d > 0 ? 'Gross margin widened year on year.' : 'Gross margin narrowed year on year.',
        limitations: 'Annual resolution.',
      }));
    }

    const fcfNow = isNum(ac[0]?.freeCashFlow) ? ac[0].freeCashFlow : null;
    const fcfPrior = isNum(ac[1]?.freeCashFlow) ? ac[1].freeCashFlow : null;
    if (isNum(fcfNow) && isNum(fcfPrior) && isNum(a[0]?.revenue) && a[0].revenue > 0) {
      const d = (fcfNow - fcfPrior) / a[0].revenue;
      const score = bandScore(d, { mid: 0, span: 0.05 });
      out.push(signal({
        category: 'fundamental',
        name: 'Free cash flow inflection (annual basis)',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: fcfNow,
        previous: fcfPrior,
        change: d,
        unit: 'currency',
        sourceRef: fmpSource('cashflow', { publicationDate: ac[0]?.filingDate || ac[0]?.date, title: 'Annual cash flow statement' }),
        sourceDate: ac[0]?.filingDate || ac[0]?.date || when,
        dataQuality: 'calculated',
        confidence: 'low',
        calculation: `Free cash flow in FY${fy} against the prior year, over FY${fy} revenue. `
          + `The swing is ${pp(d)} of revenue. Annual basis.`,
        interpretation: d > 0 ? 'Cash conversion improved.' : 'Cash conversion worsened.',
        limitations: 'Annual resolution.',
      }));
    }

    return out;
  },
};

/* ==========================================================================
   2. Revision momentum
   ========================================================================== */

/** Net rating, −2 (all strong sell) to +2 (all strong buy). */
function netRating(row) {
  const sb = row?.analystRatingsStrongBuy ?? 0;
  const b = row?.analystRatingsBuy ?? 0;
  const h = row?.analystRatingsHold ?? 0;
  const s = row?.analystRatingsSell ?? 0;
  const ss = row?.analystRatingsStrongSell ?? 0;
  const n = sb + b + h + s + ss;
  if (!n) return null;
  return (sb * 2 + b * 1 + h * 0 + s * -1 + ss * -2) / n;
}

const revisionProvider = {
  id: 'revisions',
  category: 'revisions',
  label: 'Revision momentum',
  feeds: ['gradesHistorical', 'targetSummary', 'estimates'],
  needs: [],

  build(bag, ctx) {
    const out = [];

    /* ---- analyst rating mix, three months apart ---- */
    const grades = byDateDesc(rowsOf(bag, 'gradesHistorical'));
    if (grades.length >= 4) {
      const now = netRating(grades[0]);
      const then = netRating(grades[3]);
      if (isNum(now) && isNum(then)) {
        const d = now - then;
        const score = bandScore(d, { mid: 0, span: 0.4 });
        const count = ['analystRatingsStrongBuy', 'analystRatingsBuy', 'analystRatingsHold',
          'analystRatingsSell', 'analystRatingsStrongSell']
          .reduce((t, k) => t + (grades[0][k] ?? 0), 0);
        out.push(signal({
          category: 'revisions',
          name: 'Analyst rating mix shift',
          symbol: ctx.symbol,
          status: statusFor(score),
          score,
          raw: now,
          previous: then,
          change: d,
          unit: 'net rating',
          sourceRef: fmpSource('gradesHistorical', { publicationDate: grades[0].date, title: 'Historical analyst grades' }),
          sourceDate: grades[0].date,
          dataQuality: 'estimated',
          confidence: 'medium',
          calculation: 'Each month\'s ratings are scored strong buy +2, buy +1, hold 0, sell −1, '
            + `strong sell −2 and averaged. ${grades[0].date} reads ${now.toFixed(2)} across `
            + `${count} analysts; ${grades[3].date} read ${then.toFixed(2)}. The difference is `
            + `${d.toFixed(2)}, on a full scale of ±0.40.`,
          historical: `Net rating by month, newest first: ${grades.slice(0, 6)
            .map((g) => `${g.date.slice(0, 7)} ${(netRating(g) ?? 0).toFixed(2)}`).join(' · ')}`,
          interpretation: d > 0
            ? 'The people covering this company have moved their ratings up over the quarter.'
            : 'The people covering this company have moved their ratings down over the quarter.',
          limitations: 'A rating is not an estimate. Analysts change ratings less often and '
            + 'later than they change numbers, and the mix also moves when coverage is '
            + 'initiated or dropped rather than when an opinion changes.',
        }));
      }
    } else if (statusOf(bag, 'gradesHistorical') === 'gated') {
      out.push(unavailableSignal({
        category: 'revisions',
        name: 'Analyst rating mix shift',
        symbol: ctx.symbol,
        provider: 'Historical analyst grades (FMP — not in this plan)',
      }));
    }

    /* ---- price targets ---- */
    const t = oneOf(bag, 'targetSummary');
    if (t && isNum(t.lastQuarterAvgPriceTarget) && t.lastQuarterAvgPriceTarget > 0
        && isNum(t.lastMonthAvgPriceTarget) && (t.lastMonthCount ?? 0) > 0) {
      const d = (t.lastMonthAvgPriceTarget - t.lastQuarterAvgPriceTarget) / t.lastQuarterAvgPriceTarget;
      const score = bandScore(d, { mid: 0, span: 0.12 });
      // Three targets is not a consensus. The count drives confidence rather
      // than being printed and ignored.
      const thin = (t.lastMonthCount ?? 0) < 4;
      out.push(signal({
        category: 'revisions',
        name: 'Price target momentum',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: t.lastMonthAvgPriceTarget,
        previous: t.lastQuarterAvgPriceTarget,
        change: d,
        unit: 'price',
        sourceRef: fmpSource('targetSummary', { title: 'Price target summary' }),
        sourceDate: ctx.today,
        dataQuality: 'estimated',
        confidence: thin ? 'low' : 'medium',
        calculation: `Average price target published in the last month (${t.lastMonthAvgPriceTarget} `
          + `across ${t.lastMonthCount} targets) against the last quarter's average `
          + `(${t.lastQuarterAvgPriceTarget} across ${t.lastQuarterCount}). The change is `
          + `${pctText(d)}; the full scale is ±12%.`,
        historical: `Last year averaged ${t.lastYearAvgPriceTarget} across ${t.lastYearCount} targets; `
          + `all-time ${t.allTimeAvgPriceTarget} across ${t.allTimeCount}.`,
        interpretation: d > 0
          ? 'Targets published this month sit above the quarter\'s average.'
          : 'Targets published this month sit below the quarter\'s average.',
        limitations: thin
          ? `Only ${t.lastMonthCount} target${t.lastMonthCount === 1 ? '' : 's'} were published `
            + 'in the last month, so this is a handful of analysts rather than a consensus.'
          : 'The two windows overlap and contain different analysts, so this is a shift in '
            + 'who published as much as a shift in what they think.',
      }));
    }

    /* ---- the measurement that does not exist ---- */
    out.push(unavailableSignal({
      category: 'revisions',
      name: 'EPS and revenue consensus revisions',
      symbol: ctx.symbol,
      provider: 'A consensus-estimate history provider (Visible Alpha, Refinitiv, FactSet or similar)',
      note: 'FMP publishes the current consensus and a monthly history of analyst ratings, but '
        + 'no time series of consensus EPS or revenue. Upward and downward estimate revisions — '
        + 'the measurement this category is named for — cannot be computed from the data this '
        + 'app has, and nothing here substitutes a different measurement for it.',
    }));

    /* ---- dispersion: described, never scored ---- */
    const est = byDateDesc(rowsOf(bag, 'estimates'));
    const near = est.slice().reverse().find((r) => new Date(r.date) >= ctx.now) || est[est.length - 1];
    if (near && isNum(near.epsHigh) && isNum(near.epsLow) && isNum(near.epsAvg) && near.epsAvg !== 0) {
      const spread = (near.epsHigh - near.epsLow) / Math.abs(near.epsAvg);
      out.push(signal({
        category: 'revisions',
        name: 'Consensus dispersion',
        symbol: ctx.symbol,
        status: 'neutral',
        score: null,
        raw: spread,
        previous: null,
        change: null,
        unit: 'spread',
        sourceRef: fmpSource('estimates', { publicationDate: near.date, title: 'Analyst estimates' }),
        sourceDate: ctx.today,
        dataQuality: 'estimated',
        confidence: 'medium',
        calculation: `(High EPS estimate ${near.epsHigh} − low ${near.epsLow}) ÷ |average `
          + `${near.epsAvg}| for the ${String(near.date).slice(0, 4)} forecast year, across `
          + `${near.numAnalystsEps ?? '?'} analysts. Result: ${pctText(spread)}.`,
        interpretation: 'Descriptive only. Wide disagreement is neither good nor bad evidence '
          + 'about the business, so this is deliberately left unscored and does not move the '
          + 'composite — it is here to qualify the two revision signals above it.',
        limitations: 'A wide spread often means few analysts rather than real disagreement.',
      }));
    }

    return out;
  },
};

/* ==========================================================================
   3. Commercial momentum
   ========================================================================== */

const commercialProvider = {
  id: 'commercial',
  category: 'commercial',
  label: 'Commercial momentum',
  feeds: ['segProduct', 'pressReleases'],
  needs: [],

  build(bag, ctx) {
    const out = [];

    /* ---- the revenue mix ---- */
    const segs = byDateDesc(rowsOf(bag, 'segProduct'));
    const now = segs[0]?.data;
    const prior = segs[1]?.data;
    if (now && prior && typeof now === 'object' && typeof prior === 'object') {
      const total = sum(Object.values(now).filter(isNum));
      const priorTotal = sum(Object.values(prior).filter(isNum));
      if (total > 0 && priorTotal > 0) {
        // The segment whose share of revenue moved most. Share rather than
        // absolute growth: a segment that grew while the company grew faster
        // is not a mix shift, and a mix shift is what this measures.
        const moves = Object.keys(now)
          .filter((k) => isNum(now[k]) && isNum(prior[k]))
          .map((k) => ({ name: k, share: now[k] / total, was: prior[k] / priorTotal }))
          .map((m) => ({ ...m, delta: m.share - m.was }))
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

        if (moves.length) {
          const top = moves[0];
          const score = bandScore(top.delta, { mid: 0, span: 0.06 });
          out.push(signal({
            category: 'commercial',
            name: 'Revenue mix shift',
            symbol: ctx.symbol,
            status: statusFor(score),
            score,
            raw: top.share,
            previous: top.was,
            change: top.delta,
            unit: 'share of revenue',
            sourceRef: fmpSource('segProduct', { publicationDate: segs[0].date, title: 'Revenue by product segment' }),
            sourceDate: segs[0].date,
            dataQuality: 'verified',
            confidence: 'medium',
            calculation: `"${top.name}" moved from ${pctText(top.was)} of reported revenue in `
              + `${String(segs[1].date).slice(0, 4)} to ${pctText(top.share)} in `
              + `${String(segs[0].date).slice(0, 4)}, a shift of ${pp(top.delta)}. The largest `
              + `absolute shift across ${moves.length} reported segments is the one shown.`,
            historical: moves.slice(0, 4)
              .map((m) => `${m.name}: ${pp(m.delta)}`).join(' · '),
            interpretation: top.delta > 0
              ? `The mix is moving toward "${top.name}".`
              : `The mix is moving away from "${top.name}".`,
            limitations: 'Segment definitions are the company\'s own and are re-cut without '
              + 'notice; a renamed segment reads as a new one. Annual, so up to a year stale. '
              + 'A mix shift is a fact about the mix, not a judgement that the new mix is better.',
          }));
        }
      }
    }

    /* ---- how much the company is saying ---- */
    const pr = byDateDesc(rowsOf(bag, 'pressReleases'), 'publishedDate');
    if (pr.length >= 6) {
      const cut = (days) => new Date(ctx.now.getTime() - days * 864e5);
      const recent = pr.filter((r) => new Date(r.publishedDate) >= cut(90)).length;
      const prior = pr.filter((r) => {
        const d = new Date(r.publishedDate);
        return d < cut(90) && d >= cut(180);
      }).length;
      if (prior > 0) {
        const d = (recent - prior) / prior;
        const score = bandScore(d, { mid: 0, span: 1 });
        out.push(signal({
          category: 'commercial',
          name: 'Announcement cadence',
          symbol: ctx.symbol,
          status: statusFor(score),
          score,
          raw: recent,
          previous: prior,
          change: d,
          unit: 'releases per 90 days',
          sourceRef: fmpSource('pressReleases', { publicationDate: pr[0].publishedDate, title: 'Company press releases' }),
          sourceDate: pr[0].publishedDate,
          dataQuality: 'verified',
          confidence: 'low',
          calculation: `${recent} press releases in the last 90 days against ${prior} in the 90 `
            + 'days before that. The full scale is a doubling or a halving.',
          interpretation: d > 0
            ? 'The company is publishing more than it was.'
            : 'The company is publishing less than it was.',
          limitations: 'Counts releases, does not read them. A company announcing a lot is a '
            + 'company announcing a lot — it may be launching products or it may be issuing '
            + 'shares. Confidence is deliberately low and this signal is here to be looked at, '
            + 'not leaned on.',
        }));
      }
    }

    out.push(unavailableSignal({
      category: 'commercial',
      name: 'Contracts, backlog and book-to-bill',
      symbol: ctx.symbol,
      provider: 'A contract-award or backlog provider, or parsed 10-K/10-Q text',
      note: 'Backlog, order growth and book-to-bill are disclosed in filing narrative rather '
        + 'than in any structured feed FMP publishes. Extracting them needs filing text parsing, '
        + 'which this app does not do.',
    }));

    return out;
  },
};

/* ==========================================================================
   4. Institutional activity
   ========================================================================== */

const institutionalProvider = {
  id: 'institutional',
  category: 'institutional',
  label: 'Institutional activity',
  feeds: ['holdersSummary'],
  needs: [],

  build(bag, ctx) {
    const s = oneOf(bag, 'holdersSummary');
    if (!s) {
      return [unavailableSignal({
        category: 'institutional',
        name: '13F position changes',
        symbol: ctx.symbol,
        provider: statusOf(bag, 'holdersSummary') === 'gated'
          ? 'FMP institutional ownership (Ultimate plan or above)'
          : 'FMP institutional ownership',
        note: statusOf(bag, 'holdersSummary') === 'gated'
          ? 'The 13F aggregate is not included in this FMP plan. The company report\'s '
            + 'Ownership section shows the individual holders it can reach.'
          : 'No 13F aggregate came back for this company and quarter.',
      })];
    }

    const out = [];
    const filed = s.date || null;
    const src = source({
      id: `fmp:holdersSummary:${filed}`,
      type: 'sec_filing',
      publisher: 'SEC Form 13F, aggregated by Financial Modeling Prep',
      title: `13F positions summary for the quarter ended ${filed}`,
      publicationDate: filed,
    });
    // 13Fs are due 45 days after quarter end, so the *reporting* date and the
    // date this became public are up to six weeks apart. Freshness is measured
    // from the filing deadline, not from the quarter end, or every 13F signal
    // would look six weeks older than the market's knowledge of it.
    const knownFrom = filed ? new Date(new Date(filed).getTime() + 45 * 864e5).toISOString().slice(0, 10) : null;

    const lag = 'A 13F is a snapshot of long positions at a quarter end, filed up to 45 days '
      + 'later. It is not live, it excludes shorts and most derivatives, and it covers only '
      + 'institutions above the reporting threshold. Nothing here is "live smart money".';

    if (isNum(s.ownershipPercentChange)) {
      const score = bandScore(s.ownershipPercentChange, { mid: 0, span: 3 });
      out.push(signal({
        category: 'institutional',
        name: 'Institutional ownership change',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: s.ownershipPercent,
        previous: s.lastOwnershipPercent,
        change: s.ownershipPercentChange,
        unit: '% of shares',
        sourceRef: src,
        sourceDate: knownFrom,
        dataQuality: 'verified',
        confidence: 'medium',
        calculation: `Institutional ownership was ${s.ownershipPercent}% of shares at `
          + `${filed}, against ${s.lastOwnershipPercent}% the quarter before — a change of `
          + `${s.ownershipPercentChange} points across ${s.investorsHolding} reporting `
          + 'institutions. The full scale is ±3 points.',
        interpretation: s.ownershipPercentChange > 0
          ? 'Reporting institutions held more of the company at the quarter end than three months earlier.'
          : 'Reporting institutions held less of the company at the quarter end than three months earlier.',
        limitations: lag,
      }));
    }

    if (isNum(s.increasedPositions) && isNum(s.reducedPositions)
        && (s.increasedPositions + s.reducedPositions) > 0) {
      const breadth = (s.increasedPositions - s.reducedPositions)
        / (s.increasedPositions + s.reducedPositions);
      const score = bandScore(breadth, { mid: 0, span: 0.3 });
      out.push(signal({
        category: 'institutional',
        name: 'Accumulation breadth',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: s.increasedPositions,
        previous: s.reducedPositions,
        change: breadth,
        unit: 'institutions',
        sourceRef: src,
        sourceDate: knownFrom,
        dataQuality: 'verified',
        confidence: 'medium',
        calculation: `${s.increasedPositions} institutions increased and ${s.reducedPositions} `
          + `reduced. Breadth is (increased − reduced) ÷ (increased + reduced) = `
          + `${breadth.toFixed(3)}. Also in the filing: ${s.newPositions} new positions and `
          + `${s.closedPositions} closed.`,
        interpretation: breadth > 0
          ? 'More reporting institutions added than trimmed over the quarter.'
          : 'More reporting institutions trimmed than added over the quarter.',
        limitations: `${lag} Breadth counts institutions equally — a pension fund adding one `
          + 'share counts the same as one adding a billion dollars.',
      }));
    }

    return out.length ? out : [unavailableSignal({
      category: 'institutional',
      name: '13F position changes',
      symbol: ctx.symbol,
      provider: 'FMP institutional ownership',
      note: 'The 13F aggregate came back without the change fields this category reads.',
    })];
  },
};

/* ==========================================================================
   5. Insider conviction
   ========================================================================== */

const insiderProvider = {
  id: 'insider',
  category: 'insider',
  label: 'Insider conviction',
  feeds: ['insiderStats'],
  needs: [],

  build(bag, ctx) {
    const rows = rowsOf(bag, 'insiderStats')
      .slice()
      .sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter));

    if (!rows.length) {
      return [unavailableSignal({
        category: 'insider',
        name: 'Insider transactions',
        symbol: ctx.symbol,
        provider: 'FMP insider trade statistics',
        note: statusOf(bag, 'insiderStats') === 'gated'
          ? 'Insider statistics are not included in this FMP plan.'
          : 'No insider transaction statistics came back for this company.',
      })];
    }

    const out = [];
    const year = rows.slice(0, 4);
    const src = source({
      id: 'fmp:insiderStats',
      type: 'sec_filing',
      publisher: 'SEC Form 4, aggregated by Financial Modeling Prep',
      title: 'Insider trade statistics by quarter',
      publicationDate: `${rows[0].year}-Q${rows[0].quarter}`,
    });
    const asOf = quarterEnd(rows[0].year, rows[0].quarter);

    /* ---- open-market buying, which is the only part that means much ----
       `totalPurchases` and `totalSales` count Form 4 transactions coded P and
       S — bought and sold on the open market. `acquiredTransactions` is a
       much larger number that includes option exercises and vesting grants,
       and treating those as conviction would rate every company with an
       equity comp plan as heavily bought. Many companies report zero open-
       market purchases for years; that is a real reading, not missing data. */
    const buys = year.map((r) => r.totalPurchases).filter(isNum);
    const sells = year.map((r) => r.totalSales).filter(isNum);
    if (buys.length === year.length && sells.length === year.length) {
      const b = sum(buys);
      const s = sum(sells);
      const total = b + s;
      const tilt = total > 0 ? (b - s) / total : 0;
      // Asymmetric on purpose: insider selling is routine — diversification,
      // tax, scheduled 10b5-1 plans — and insider buying is not. A quarter of
      // selling should barely move this; any buying at all should.
      const score = total === 0 ? 50 : bandScore(tilt, { mid: -0.6, span: 1.2 });
      out.push(signal({
        category: 'insider',
        name: 'Open-market insider activity',
        symbol: ctx.symbol,
        status: total === 0 ? 'neutral' : statusFor(score),
        score,
        raw: b,
        previous: s,
        change: tilt,
        unit: 'transactions',
        sourceRef: src,
        sourceDate: asOf,
        dataQuality: 'verified',
        confidence: 'medium',
        calculation: `Over the last four reported quarters: ${b} open-market purchases (Form 4 `
          + `code P) and ${s} open-market sales (code S). Option exercises and vesting grants `
          + 'are excluded — they are compensation, not a decision to buy. The scale is centred '
          + 'at 60% selling rather than at parity, because routine selling is the normal state '
          + 'and only buying is unusual.',
        historical: year.map((r) => `${r.year}Q${r.quarter}: ${r.totalPurchases ?? '?'}B/${r.totalSales ?? '?'}S`).join(' · '),
        interpretation: b === 0 && s === 0
          ? 'No open-market insider transactions in the last four quarters.'
          : b > 0
            ? 'Insiders bought on the open market in the last year.'
            : 'Open-market activity was selling only.',
        limitations: 'Counts transactions, not dollars, and does not identify who traded. '
          + 'Insider selling is not evidence of a problem and insider buying is not evidence '
          + 'that a stock will rise; both are single data points about individual people.',
      }));
    } else {
      out.push(unavailableSignal({
        category: 'insider',
        name: 'Open-market insider activity',
        symbol: ctx.symbol,
        provider: 'FMP insider trade statistics (open-market fields)',
        note: 'The rows returned carry aggregate acquired/disposed totals but not the '
          + 'open-market purchase and sale counts, so compensation-related activity cannot be '
          + 'separated out. It is not reported rather than reported wrongly.',
      }));
    }

    /* ---- the acquired/disposed tilt, as a coarse second read ---- */
    const r0 = rows[0];
    const priorRatios = rows.slice(1, 4).map((r) => r.acquiredDisposedRatio).filter(isNum);
    if (isNum(r0?.acquiredDisposedRatio) && priorRatios.length >= 2) {
      const base = mean(priorRatios);
      const d = r0.acquiredDisposedRatio - base;
      const score = bandScore(d, { mid: 0, span: 1 });
      out.push(signal({
        category: 'insider',
        name: 'Acquired-to-disposed tilt',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: r0.acquiredDisposedRatio,
        previous: base,
        change: d,
        unit: 'ratio',
        sourceRef: src,
        sourceDate: asOf,
        dataQuality: 'calculated',
        confidence: 'low',
        calculation: `${r0.year}Q${r0.quarter} acquired-to-disposed ratio is `
          + `${r0.acquiredDisposedRatio}, against an average of ${base.toFixed(2)} over the `
          + `prior ${priorRatios.length} quarters.`,
        interpretation: d > 0
          ? 'Insiders acquired more relative to disposals than in recent quarters.'
          : 'Insiders disposed more relative to acquisitions than in recent quarters.',
        limitations: 'This ratio includes grants and option exercises, so it moves with the '
          + 'compensation calendar as much as with anything else. It is scored at low '
          + 'confidence and is a cross-check on the open-market signal above, not a second vote.',
      }));
    }

    return out;
  },
};

const quarterEnd = (y, q) => {
  if (!isNum(y) || !isNum(q)) return null;
  const m = q * 3;
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
};

/* ==========================================================================
   6. Product and investment
   ========================================================================== */

const productProvider = {
  id: 'product',
  category: 'product',
  label: 'Product and investment',
  feeds: ['incomeQ', 'income'],
  needs: [],

  build(bag, ctx) {
    const out = [];
    const q = byDateDesc(rowsOf(bag, 'incomeQ'));
    const a = byDateDesc(rowsOf(bag, 'income'));

    const quarterly = q.length >= 8;
    const rows = quarterly ? q : a;
    const feed = quarterly ? 'incomeQ' : 'income';
    const step = quarterly ? 4 : 1;

    if (rows.length > step) {
      const rdNow = quarterly ? window4(rows, 'researchAndDevelopmentExpenses', 0) : rows[0]?.researchAndDevelopmentExpenses;
      const revNow = quarterly ? window4(rows, 'revenue', 0) : rows[0]?.revenue;
      const rdPrior = quarterly ? window4(rows, 'researchAndDevelopmentExpenses', step) : rows[step]?.researchAndDevelopmentExpenses;
      const revPrior = quarterly ? window4(rows, 'revenue', step) : rows[step]?.revenue;

      const nowI = ratio(rdNow, revNow);
      const priorI = ratio(rdPrior, revPrior);

      // Zero R&D is a real answer for a bank or a retailer, not a gap — but it
      // is not a signal either, so it is skipped rather than scored 50.
      if (isNum(nowI) && isNum(priorI) && (nowI > 0 || priorI > 0)) {
        const d = nowI - priorI;
        const score = bandScore(d, { mid: 0, span: 0.02 });
        out.push(signal({
          category: 'product',
          name: 'R&D intensity change',
          symbol: ctx.symbol,
          status: statusFor(score),
          score,
          raw: nowI,
          previous: priorI,
          change: d,
          unit: 'share of revenue',
          sourceRef: fmpSource(feed, { publicationDate: rows[0]?.filingDate || rows[0]?.date, title: quarterly ? 'Quarterly income statement' : 'Annual income statement' }),
          sourceDate: rows[0]?.filingDate || rows[0]?.date || null,
          dataQuality: 'calculated',
          confidence: quarterly ? 'medium' : 'low',
          calculation: `Research and development spending as a share of revenue — `
            + `${pctText(nowI)} now against ${pctText(priorI)} a year earlier, a change of `
            + `${pp(d)}, on a ${quarterly ? 'trailing twelve month' : 'annual'} basis.`,
          interpretation: d > 0
            ? 'The company is putting a larger share of revenue into development.'
            : 'The company is putting a smaller share of revenue into development.',
          limitations: 'Spending is an input, not an outcome. Rising R&D is a company '
            + 'investing more; whether it produces anything is not measurable here. Companies '
            + 'also capitalise development differently, which moves this line without '
            + 'changing behaviour.',
        }));
      }
    }

    out.push(unavailableSignal({
      category: 'product',
      name: 'Product launches, approvals and patents',
      symbol: ctx.symbol,
      provider: 'A patent database (USPTO/EPO) and a regulatory-decision feed',
      note: 'Patent grants, regulatory approvals and dated product launches have no structured '
        + 'source in this app. Company press releases carry some of them in prose, which is not '
        + 'the same as a dated, typed event.',
    }));

    return out;
  },
};

/* ==========================================================================
   7. Workforce
   ========================================================================== */

const hiringProvider = {
  id: 'hiring',
  category: 'hiring',
  label: 'Workforce',
  feeds: ['employees'],
  needs: [],

  build(bag, ctx) {
    const out = [];
    const rows = byDateDesc(rowsOf(bag, 'employees'), 'periodOfReport');

    if (rows.length >= 2 && isNum(rows[0]?.employeeCount) && isNum(rows[1]?.employeeCount)) {
      const g = growthOf(rows[0].employeeCount, rows[1].employeeCount);
      if (isNum(g)) {
        const score = bandScore(g, { mid: 0, span: 0.15 });
        out.push(signal({
          category: 'hiring',
          name: 'Reported headcount growth',
          symbol: ctx.symbol,
          status: statusFor(score),
          score,
          raw: rows[0].employeeCount,
          previous: rows[1].employeeCount,
          change: g,
          unit: 'employees',
          sourceRef: source({
            id: `fmp:employees:${rows[0].periodOfReport}`,
            type: 'sec_filing',
            publisher: 'SEC annual report, via Financial Modeling Prep',
            title: `${rows[0].formType || '10-K'} headcount as of ${rows[0].periodOfReport}`,
            publicationDate: rows[0].filingDate || rows[0].periodOfReport,
          }),
          sourceDate: rows[0].filingDate || rows[0].periodOfReport || null,
          dataQuality: 'verified',
          confidence: 'low',
          calculation: `${rows[0].employeeCount.toLocaleString('en-US')} employees reported for `
            + `${rows[0].periodOfReport} against ${rows[1].employeeCount.toLocaleString('en-US')} `
            + `for ${rows[1].periodOfReport} — ${pctText(g)}.`,
          interpretation: g > 0 ? 'The reported workforce grew.' : 'The reported workforce shrank.',
          limitations: 'This is the headcount stated in an annual filing, so it is a point-in-'
            + 'time figure up to a year old and never more current than the last 10-K. It '
            + 'includes acquisitions and excludes contractors. Freshness weighting already '
            + 'discounts it heavily, which is why the category carries only 3% of the composite.',
        }));
      }
    }

    out.push(unavailableSignal({
      category: 'hiring',
      name: 'Job posting growth by function',
      symbol: ctx.symbol,
      provider: 'A job-postings provider (LinkUp, Revelio, Greenhouse/Lever scraping)',
      note: 'Engineering, sales and manufacturing hiring velocity needs a postings feed. '
        + 'Postings are also not hires — they duplicate across boards, they include backfills, '
        + 'and they are withdrawn silently — so any future integration would be labelled as '
        + 'postings rather than as hiring.',
    }));

    return out;
  },
};

/* ==========================================================================
   8. Price and volume
   ========================================================================== */

/** Return over `days` from a light EOD series, newest-first after sorting. */
function returnOver(series, days) {
  const pts = byDateDesc(series);
  if (pts.length < 2) return null;
  const last = pts[0];
  const target = new Date(new Date(last.date).getTime() - days * 864e5);
  // The closest close at or before the target date, rather than an index —
  // holidays and suspensions make "N rows back" a different span per company.
  const back = pts.find((p) => new Date(p.date) <= target);
  if (!back) return null;
  return growthOf(last.price ?? last.close, back.price ?? back.close);
}

const priceVolumeProvider = {
  id: 'priceVolume',
  category: 'priceVolume',
  label: 'Price and volume',
  feeds: ['prices', 'quote'],
  needs: [],

  build(bag, ctx) {
    const out = [];
    const series = rowsOf(bag, 'prices');
    const bench = ctx.benchmarks?.market || bag.__benchmarks?.market || null;

    /* ---- relative strength, three windows ---- */
    if (series.length > 30) {
      const asOf = byDateDesc(series)[0]?.date || null;
      for (const [label, days, span] of [['3-month', 92, 0.15], ['6-month', 183, 0.22], ['12-month', 365, 0.30]]) {
        const mine = returnOver(series, days);
        if (!isNum(mine)) continue;
        const theirs = bench ? returnOver(bench, days) : null;
        const rel = isNum(theirs) ? mine - theirs : null;
        const score = bandScore(isNum(rel) ? rel : mine, { mid: 0, span });
        out.push(signal({
          category: 'priceVolume',
          name: `${label} relative strength`,
          symbol: ctx.symbol,
          status: statusFor(score),
          score,
          raw: mine,
          previous: theirs,
          change: rel,
          unit: 'return',
          sourceRef: fmpSource('prices', { publicationDate: asOf, title: 'Daily closing prices' }),
          sourceDate: asOf,
          dataQuality: 'calculated',
          confidence: isNum(rel) ? 'high' : 'medium',
          calculation: isNum(rel)
            ? `${pctText(mine)} over ${days} days against the market benchmark's `
              + `${pctText(theirs)} — a relative ${pp(rel)}. The full scale is ±${(span * 100).toFixed(0)} points.`
            : `${pctText(mine)} over ${days} days. No benchmark series was loaded, so this is an `
              + 'absolute return and not a relative one — it is scored on the same band, which '
              + 'is a weaker reading.',
          interpretation: (isNum(rel) ? rel : mine) > 0
            ? `Outperformed over ${label.replace('-', ' ')}.`
            : `Underperformed over ${label.replace('-', ' ')}.`,
          limitations: 'Price is confirmation, never cause. A stock that has already moved is '
            + 'the thing this feature exists to get ahead of, which is why the whole category '
            + 'carries 8% of the composite.',
        }));
      }
    }

    /* ---- participation ---- */
    const quote = oneOf(bag, 'quote');
    if (quote && isNum(quote.volume) && isNum(quote.avgVolume) && quote.avgVolume > 0) {
      const rel = quote.volume / quote.avgVolume;
      const score = bandScore(rel, { mid: 1, span: 1.5 });
      out.push(signal({
        category: 'priceVolume',
        name: 'Relative volume',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: quote.volume,
        previous: quote.avgVolume,
        change: rel - 1,
        unit: 'shares',
        sourceRef: fmpSource('quote', { title: 'Quote' }),
        sourceDate: ctx.today,
        dataQuality: 'calculated',
        confidence: 'low',
        calculation: `Today's volume ${quote.volume.toLocaleString('en-US')} against the average `
          + `${quote.avgVolume.toLocaleString('en-US')} — ${rel.toFixed(2)}×.`,
        interpretation: rel > 1 ? 'Trading above its average volume.' : 'Trading below its average volume.',
        limitations: 'One day against an average. A single session is noise on its own, and a '
          + 'partial session during market hours reads low by construction. Low confidence, and '
          + 'it is here because participation qualifies the return signals above it.',
      }));
    }

    return out;
  },
};

/* ==========================================================================
   9. Catalysts
   ========================================================================== */

const catalystProvider = {
  id: 'catalysts',
  category: 'catalysts',
  label: 'Catalysts',
  feeds: ['earnings'],
  needs: [],

  build(bag, ctx) {
    const out = [];
    const rows = byDateDesc(rowsOf(bag, 'earnings'));

    /* ---- the next scheduled report ---- */
    const upcoming = rows
      .filter((r) => new Date(r.date) > ctx.now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

    if (upcoming) {
      const days = Math.round((new Date(upcoming.date) - ctx.now) / 864e5);
      // Nearer is higher, but a date is not good news. The band tops out at 70
      // rather than 100 so a company with nothing but a calendar entry cannot
      // reach a strong category score.
      const score = Math.max(30, Math.min(70, 70 - (days / 90) * 40));
      out.push(signal({
        category: 'catalysts',
        name: 'Next earnings date',
        symbol: ctx.symbol,
        status: 'neutral',
        score,
        raw: upcoming.date,
        previous: null,
        change: days,
        unit: 'days away',
        sourceRef: fmpSource('earnings', { publicationDate: upcoming.date, title: 'Earnings calendar' }),
        sourceDate: ctx.today,
        dataQuality: 'verified',
        confidence: 'medium',
        calculation: `The next scheduled report is ${upcoming.date}, ${days} days away. `
          + 'Proximity scores between 30 and 70 — near the top when a date is imminent, never '
          + 'at the top, because a scheduled event is an opportunity for news and not news.',
        interpretation: days <= 21
          ? 'A scheduled report is close, which is when the other signals in this engine get tested.'
          : 'The next scheduled report is some way off.',
        limitations: 'Status is "upcoming" and dates move. Nothing here predicts the content of '
          + 'the report.',
      }));
    }

    /* ---- the last one, and what it did ---- */
    const reported = rows.filter((r) => isNum(r.epsActual) && isNum(r.epsEstimated) && r.epsEstimated !== 0);
    if (reported.length) {
      const last = reported[0];
      const surprise = (last.epsActual - last.epsEstimated) / Math.abs(last.epsEstimated);
      const score = bandScore(surprise, { mid: 0, span: 0.20 });
      const streak = reported.slice(0, 4).filter((r) => r.epsActual > r.epsEstimated).length;
      out.push(signal({
        category: 'catalysts',
        name: 'Last earnings surprise',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: last.epsActual,
        previous: last.epsEstimated,
        change: surprise,
        unit: 'EPS',
        sourceRef: fmpSource('earnings', { publicationDate: last.date, title: 'Reported earnings' }),
        sourceDate: last.date,
        dataQuality: 'verified',
        confidence: 'high',
        calculation: `Reported EPS ${last.epsActual} against a consensus of ${last.epsEstimated} `
          + `on ${last.date} — ${pctText(surprise)}. The full scale is ±20%.`,
        historical: `${streak} of the last ${Math.min(4, reported.length)} reports beat consensus.`,
        interpretation: surprise > 0 ? 'Beat the consensus estimate.' : 'Missed the consensus estimate.',
        limitations: 'Consensus EPS is itself an estimate, and the figure analysts are measured '
          + 'against is often an adjusted one that differs from the filed number.',
      }));
    }

    out.push(unavailableSignal({
      category: 'catalysts',
      name: 'Investor days, regulatory decisions and corporate actions',
      symbol: ctx.symbol,
      provider: 'A corporate-events calendar, plus 8-K event parsing',
      note: 'The earnings calendar is the only dated forward event this app can read. Investor '
        + 'days, regulatory decision dates, spin-offs, buyback authorisations and strategic '
        + 'reviews are announced in 8-Ks and press releases as prose, not as typed events.',
    }));

    return out;
  },
};

/* ==========================================================================
   10. Investor attention — the undercoverage leg
   ========================================================================== */

/**
 * How many analysts a company of this size would normally carry.
 *
 * Crude and stated as crude: five brackets, set from the shape of the market
 * rather than measured against it. Undercoverage is the difference between
 * what is expected here and what is observed, so the brackets are the whole
 * measurement and deserve to be printed on the page — which they are, in the
 * calculation line of the signal below.
 *
 * "Few analysts" alone is not undercoverage, which is why this category also
 * reads news volume and institutional ownership and combines the three. A
 * company can be followed closely by institutions and never written about.
 */
const COVERAGE_BRACKETS = [
  { floor: 200e9, expect: 40, label: 'mega cap (>$200bn)' },
  { floor: 50e9, expect: 30, label: 'large cap ($50-200bn)' },
  { floor: 10e9, expect: 20, label: 'mid cap ($10-50bn)' },
  { floor: 2e9, expect: 12, label: 'small cap ($2-10bn)' },
  { floor: 0, expect: 6, label: 'micro cap (<$2bn)' },
];

const attentionProvider = {
  id: 'attention',
  category: 'attention',
  label: 'Investor attention',
  feeds: ['estimates', 'news', 'quote', 'profile', 'holdersSummary'],
  needs: [],

  build(bag, ctx) {
    const out = [];
    const quote = oneOf(bag, 'quote');
    const profile = oneOf(bag, 'profile');
    const cap = [quote?.marketCap, profile?.marketCap, ctx.marketCap].find(isNum) ?? null;
    const bracket = isNum(cap) ? COVERAGE_BRACKETS.find((b) => cap >= b.floor) : null;

    const attentionSource = source({
      id: 'alpha:attention',
      type: 'attention_data',
      publisher: 'Maz Vantage, from FMP coverage and news counts',
      title: 'Attention and coverage measures',
      publicationDate: ctx.today,
    });

    /* ---- analyst coverage against size ---- */
    const est = rowsOf(bag, 'estimates');
    const analysts = est.map((r) => r.numAnalystsEps).filter(isNum).sort((a, b) => b - a)[0] ?? null;
    if (isNum(analysts) && bracket) {
      // Inverted: fewer analysts than expected is a *higher* score, because
      // this category measures how much room there is for attention to arrive.
      const shortfall = (bracket.expect - analysts) / bracket.expect;
      const score = bandScore(shortfall, { mid: 0, span: 1 });
      out.push(signal({
        category: 'attention',
        name: 'Analyst coverage versus size',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: analysts,
        previous: bracket.expect,
        change: shortfall,
        unit: 'analysts',
        sourceRef: attentionSource,
        sourceDate: ctx.today,
        dataQuality: 'attention',
        confidence: 'medium',
        calculation: `${analysts} analysts publish EPS estimates. This company is a `
          + `${bracket.label}, where this engine expects roughly ${bracket.expect}. The `
          + `shortfall is ${pctText(shortfall)} of the expectation. The five brackets are a `
          + 'stated assumption, not a measured distribution — they have not been fitted to the '
          + 'market and are the crudest part of this score.',
        interpretation: shortfall > 0
          ? 'Followed by fewer analysts than companies of its size usually are.'
          : 'Followed by at least as many analysts as its size would suggest.',
        limitations: 'Attention data, not evidence about the business. Low coverage is not a '
          + 'virtue on its own — plenty of companies are uncovered because there is nothing to '
          + 'cover.',
      }));
    } else {
      out.push(unavailableSignal({
        category: 'attention',
        name: 'Analyst coverage versus size',
        symbol: ctx.symbol,
        provider: 'FMP analyst estimates, plus a market capitalisation',
        note: !isNum(cap) ? 'No market capitalisation was available to size the expectation against.'
          : 'No analyst estimate rows carried a coverage count.',
      }));
    }

    /* ---- how much has been written ---- */
    const news = byDateDesc(rowsOf(bag, 'news'), 'publishedDate');
    if (news.length && bracket) {
      const cut = new Date(ctx.now.getTime() - 90 * 864e5);
      const recent = news.filter((r) => new Date(r.publishedDate) >= cut).length;
      // The news feed is capped at 100 rows, so a saturated count means "at
      // least this much" and is stated as such rather than treated as exact.
      const capped = news.length >= 100 && recent >= 90;
      const expect = Math.max(6, bracket.expect);
      const shortfall = (expect - recent) / expect;
      const score = capped ? 5 : bandScore(shortfall, { mid: 0, span: 1 });
      out.push(signal({
        category: 'attention',
        name: 'News volume versus size',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: recent,
        previous: expect,
        change: shortfall,
        unit: 'articles per 90 days',
        sourceRef: attentionSource,
        sourceDate: ctx.today,
        dataQuality: 'attention',
        confidence: 'low',
        calculation: capped
          ? `At least ${recent} articles in the last 90 days — the feed returns a maximum of 100 `
            + 'rows and came back saturated, so the true count is higher and this scores as '
            + 'heavily covered.'
          : `${recent} articles in the last 90 days against roughly ${expect} expected for a `
            + `${bracket.label}.`,
        interpretation: shortfall > 0 && !capped
          ? 'Written about less than its size would suggest.'
          : 'Written about at least as much as its size would suggest.',
        limitations: 'Attention data. Counts articles from the vendor\'s publisher set only, '
          + 'which is weighted toward English-language US outlets, and counts syndicated '
          + 'reprints of one story as several.',
      }));
    }

    /* ---- who owns it ---- */
    const hs = oneOf(bag, 'holdersSummary');
    if (hs && isNum(hs.ownershipPercent)) {
      const shortfall = (60 - hs.ownershipPercent) / 60;
      const score = bandScore(shortfall, { mid: 0, span: 1 });
      out.push(signal({
        category: 'attention',
        name: 'Institutional ownership level',
        symbol: ctx.symbol,
        status: statusFor(score),
        score,
        raw: hs.ownershipPercent,
        previous: 60,
        change: shortfall,
        unit: '% of shares',
        sourceRef: attentionSource,
        sourceDate: hs.date,
        dataQuality: 'attention',
        confidence: 'medium',
        calculation: `${hs.ownershipPercent}% of shares are held by ${hs.investorsHolding} `
          + 'reporting institutions, against a reference level of 60% for an established US '
          + 'listing. Lower means more room for institutional attention to arrive.',
        interpretation: hs.ownershipPercent < 60
          ? 'Less institutionally owned than a typical established listing.'
          : 'Already heavily institutionally owned.',
        limitations: 'Attention data, and it double-counts with the institutional activity '
          + 'category, which reads the *change* in the same filing while this reads the level. '
          + 'The 60% reference is an assumption, not a measurement.',
      }));
    }

    out.push(unavailableSignal({
      category: 'attention',
      name: 'Search and retail attention',
      symbol: ctx.symbol,
      provider: 'A search-interest provider (Google Trends API or similar), under its own terms',
      note: 'Search interest is part of the undercoverage picture and has no compliant source '
        + 'wired up here. Note also what this engine deliberately does not do: it reads no '
        + 'social media. Reddit, X and message boards are not evidence about a company, and no '
        + 'future version of this category will treat them as any.',
    }));

    return out;
  },
};

/* ==========================================================================
   11. Industry context
   ========================================================================== */

const macroProvider = {
  id: 'macro',
  category: 'macro',
  label: 'Industry context',
  feeds: [],
  needs: [],

  build(bag, ctx) {
    const industry = ctx.benchmarks?.industry || bag.__benchmarks?.industry || null;
    const market = ctx.benchmarks?.market || bag.__benchmarks?.market || null;

    if (!industry || !market) {
      return [unavailableSignal({
        category: 'macro',
        name: 'Sector relative performance',
        symbol: ctx.symbol,
        provider: 'Sector and market benchmark price series',
        note: 'The sector ETF series is loaded by the company report and was not available '
          + 'here. Broader macro factors — rates, currencies, commodity prices, incentives — '
          + 'are on the Economy pages and are not wired into this score, because a sector '
          + 'tailwind does not reach every company in the sector equally and this engine cannot '
          + 'measure which ones it reaches.',
      })];
    }

    const sec = returnOver(industry, 183);
    const mkt = returnOver(market, 183);
    if (!isNum(sec) || !isNum(mkt)) {
      return [unavailableSignal({
        category: 'macro',
        name: 'Sector relative performance',
        symbol: ctx.symbol,
        provider: 'Sector and market benchmark price series',
        note: 'The benchmark series did not span six months.',
      })];
    }

    const rel = sec - mkt;
    const score = bandScore(rel, { mid: 0, span: 0.15 });
    return [signal({
      category: 'macro',
      name: 'Sector relative performance',
      symbol: ctx.symbol,
      status: statusFor(score),
      score,
      raw: sec,
      previous: mkt,
      change: rel,
      unit: 'return',
      sourceRef: fmpSource('prices', { publicationDate: ctx.today, title: 'Sector and market benchmark ETFs' }),
      sourceDate: ctx.today,
      dataQuality: 'calculated',
      confidence: 'medium',
      calculation: `The company's sector ETF returned ${pctText(sec)} over six months against `
        + `the market benchmark's ${pctText(mkt)} — a relative ${pp(rel)}.`,
      interpretation: rel > 0
        ? 'The sector has been outperforming the market.'
        : 'The sector has been underperforming the market.',
      limitations: 'This is a fact about the sector, not about the company. A sector tailwind '
        + 'does not reach every company in it, and this engine makes no attempt to say whether '
        + 'it reaches this one — which is why the category carries 2% of the composite.',
    })];
  },
};

/* ==========================================================================
   The registry, and the run
   ========================================================================== */

export const PROVIDERS = [
  fundamentalProvider,
  revisionProvider,
  commercialProvider,
  institutionalProvider,
  insiderProvider,
  productProvider,
  hiringProvider,
  priceVolumeProvider,
  catalystProvider,
  attentionProvider,
  macroProvider,
];

export const PROVIDER_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/**
 * Run every provider over one bag.
 *
 * A provider that throws is reported as an unavailable signal naming itself,
 * and the rest of the run continues. One bad feed shape should cost its own
 * category and nothing else — the alternative is a blank page whenever a
 * vendor changes a field name, which is the failure mode this whole engine is
 * supposed to make visible rather than fatal.
 */
/**
 * Feed gaps that a hand capture supersedes.
 *
 * Keyed by the gap signal's `key`, valued by what in the capture has to be
 * present for it to be dropped. Without this the page would show a filled
 * signal and a "this is missing" gap for the same measurement, which is worse
 * than either alone — the reader cannot tell which one is current.
 *
 * Each superseded gap is replaced rather than merely dropped: `residualGapSignals`
 * in the capture module emits a narrower one naming what the capture did not
 * reach. Suppressing without replacing would understate what is missing, which
 * is the failure this whole feature exists to avoid.
 */
const CAPTURE_SUPERSEDES = {
  'revisions.eps-and-revenue-consensus-revisions': (d) => !!d?.estimateRevisions,
  'commercial.contracts-backlog-and-book-to-bill': (d) => !!d?.backlog,
  'product.product-launches-approvals-and-patents': (d) => !!(d?.patents || d?.launches),
  'attention.search-and-retail-attention': (d) => !!d?.searchInterest,
  'hiring.job-posting-growth-by-function': (d) => !!d?.jobPostings,
  'catalysts.investor-days-regulatory-decisions-and-corporate-actions': (d) => !!d?.corporateActions,
};

export function runProviders(bag, ctx = {}) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const full = {
    symbol: null, marketCap: null, benchmarks: null, quantScore: null,
    ...ctx,
    now,
    today: now.toISOString().slice(0, 10),
  };

  const out = [];
  for (const p of PROVIDERS) {
    try {
      const produced = p.build(bag, full) || [];
      out.push(...produced.filter(Boolean));
    } catch (err) {
      out.push(unavailableSignal({
        category: p.category,
        name: p.label,
        symbol: full.symbol,
        provider: `${p.id} provider (failed)`,
        note: `This provider threw while reading its feeds: ${err.message}. The category is `
          + 'reported as unavailable rather than partially scored.',
      }));
    }
  }

  /* The hand-captured signals, and the feed gaps they replace.
     Filtered before the capture is appended, so a superseded gap never
     survives alongside the signal that closed it. */
  const disc = bag?.__disclosures || null;
  if (disc) {
    const superseded = out.filter((sig) => CAPTURE_SUPERSEDES[sig.key]?.(disc));
    const dropped = new Set(superseded.map((sig) => sig.id));
    const kept = out.filter((sig) => !dropped.has(sig.id));
    kept.push(...disclosureSignals(disc, full));
    return kept;
  }
  return out;
}
