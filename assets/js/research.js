/* ==========================================================================
   Vanlior — the Research tab

   An equity research report in the Morningstar house shape: a rating band
   across the top, a price-against-fair-value chart, an analyst note, then
   moat, fair value, risk, capital allocation and the financials.

   **The layout is theirs. The ratings are ours.**

   ---------------------------------------------------------------------------
   The headline rating is the quant rating, not a star rating
   ---------------------------------------------------------------------------

   Morningstar leads with stars, which are that analyst's price against that
   analyst's fair value. This report leads with the **Vanlior quant
   rating** — the composite `gradeAll` already computes for every other tab.
   Seventy-odd ratios, each ranked as a percentile against the company's own
   sector, averaged within a factor and then across five factors, printed as a
   verdict word, a letter and a score out of five.

   The two ratings are not variants of each other, and the difference is
   easy to state wrongly. Price **does** enter the quant rating — Valuation is
   one of its five factors, eighteen price-based multiples ranked against the
   sector. What never enters it is a **fair value estimate**. So:

   * the **quant rating** asks *how do this company's ratios, price multiples
     included, rank against its sector*;
   * the **valuation zone** asks *is the price below a modelled estimate of
     what the business is worth*.

   Both can call a company expensive and mean different things by it. Apple is
   the worked example: its Valuation factor grades C- because its multiples
   are dear against Technology peers, and its zone reads Overvalued because
   the price sits above thirteen models of intrinsic value. Those are two
   independent findings that happen to agree.

   `valuationZone` puts the price against the fair value estimate inside a
   band whose width comes from the uncertainty rating. That band ladder is
   Morningstar's published margin-of-safety table (`SAFETY_BANDS`), used
   unchanged because it is a sensible scale, and it feeds nothing but the zone.

   This keeps the standing rule in `valuation-models.js` intact: **no fair
   value ever feeds a grade.** The quant rating is the grade; the thirteen
   fair-value models never touch it. `a.scores` is read here and never
   written.

   ---------------------------------------------------------------------------
   Where the prose comes from
   ---------------------------------------------------------------------------

   Two sources, and the byline on every section says which one is in use.

   1. **A language model**, via `narrative.js`. Long-form paragraphs written
      from a brief of pre-computed, pre-formatted figures, under instructions
      to quote them verbatim and add nothing. Shipped pre-generated in
      `assets/data/research.json`, or fetched live from a service the
      developer configures. **Only AAPL ships one** — it is the reference the
      format is defined by.
   2. **The generated short form** in this file, assembled deterministically
      from the numbers. This is the fallback for every other company, and it
      is a complete report rather than a placeholder: a sentence whose inputs
      are missing is not written at all.

   The narrative functions below (`strategyProse`, `moatProse`, and the rest)
   are the second of those. They stay whether or not a model is wired up, and
   `prose()` picks between them per section, so a model response that comes
   back malformed in one section degrades to generated prose for that section
   alone.

   ---------------------------------------------------------------------------
   What this report cannot do
   ---------------------------------------------------------------------------

   Every rating here is **arithmetic over filed figures and consensus
   estimates**, with its thresholds written down in this file and its inputs
   printed in a table beside the verdict. That is auditable and consistent —
   two companies with the same numbers get the same rating — and it is
   **backward-looking**. A moat rating is a claim about the next ten to twenty
   years; this measures the last ten and infers. An analyst who knows a patent
   cliff is coming downgrades a moat that still measures wide here. This file
   cannot, because nothing in a filing says so.

   The methodology card at the foot of the tab states all of this on the page,
   line by line. If you change a threshold, change that card too.
   ========================================================================== */

import {
  el, isNum, money, num, pct, mult, price, dec, fmtDate, mean, median, stdev, cagr, clamp, yearOf,
} from './util.js';
import { card, notice, ohead, table, keyInfo, curSymbol, feedGate } from './ui.js';
import { gradePill } from './gradeview.js';
import { allFairValues } from './valuation-models.js';
import { lineChart } from './charts.js';
import { logoUrl } from './fmp.js';
import { createPings } from './pings.js';
import { MAX_SCORE, verdictWord, verdictTone, toneForLetter } from './grading.js';
import { FACTOR_KEYS, FACTOR_BY_KEY } from './factors.js';
import { fetchNarrative, buildPrompt } from './narrative.js';

/* ==========================================================================
   1. THE RATINGS MODEL

   Five ratings, each a pure function of the analysis object. All are
   exported: the tab below is one reader, and a future Overview card is the
   obvious second.

   Every one returns its own drivers alongside its verdict, because a rating
   whose inputs are not on the page is an assertion rather than a measurement,
   and this whole report is built the other way round.
   ========================================================================== */

/* ---------- fair value estimate ------------------------------------------- */

/**
 * One fair value estimate out of the thirteen models.
 *
 * The **median**, not the mean and not a favourite. A Morningstar report
 * carries a single number because one analyst ran one discounted cash flow;
 * this report carries thirteen views of the same company, and the middle one
 * is the least arbitrary way to pick a single figure from them. The mean
 * would let one model that has blown up — a levered DCF on a company with
 * negative free cash flow, a P/E multiple on a loss-making year — drag the
 * headline, and choosing one model by name would make the headline depend on
 * a preference this page has no basis for.
 *
 * The spread across the models is kept and reported, because it is a real
 * measurement of how much the estimate should be trusted, and it feeds the
 * uncertainty rating directly.
 */
export function fairValueEstimate(a) {
  const models = allFairValues(a);
  const vals = models.map((m) => m.value).filter((v) => isNum(v) && v > 0);

  if (!vals.length) {
    // The vendor's own DCF is the last resort — a single model rather than a
    // consensus of them, which the caller is told about.
    const v = a.fairValue;
    return isNum(v) && v > 0
      ? { value: v, models: [], count: 0, low: null, high: null, spread: null, sole: true }
      : { value: null, models: [], count: 0, low: null, high: null, spread: null, sole: false };
  }

  const value = median(vals);
  const low = Math.min(...vals);
  const high = Math.max(...vals);

  // The middle half, not the full range.
  //
  // Morningstar states in its methodology appendix that the uncertainty
  // rating is built on "the interquartile range, or the middle 50% of
  // potential outcomes", so this follows them. It is also the more robust
  // measure by some distance: a single model that has misfired — a price/book
  // multiple on a company whose value is brands rather than plant, a levered
  // DCF on a year of negative free cash flow — moves the full range enormously
  // and the middle half hardly at all. The full span is still reported, as a
  // span; it is the quartiles that feed the rating.
  const sorted = [...vals].sort((x, y) => x - y);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);

  return {
    value,
    models,
    count: vals.length,
    low,
    high,
    q1,
    q3,
    /** Full span as a fraction of the estimate — reported, not rated. */
    spread: value > 0 ? (high - low) / value : null,
    /** Interquartile range as a fraction of the estimate — what is rated. */
    iqr: (value > 0 && isNum(q1) && isNum(q3)) ? (q3 - q1) / value : null,
    sole: false,
  };
}

/** Linear-interpolated quantile over an ascending array. */
function quantile(sorted, q) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/* ---------- uncertainty --------------------------------------------------- */

/**
 * Morningstar's published margin-of-safety table, exactly as printed in the
 * methodology appendix of every report.
 *
 * `lo` is the fraction of fair value at which a share earns five stars, `hi`
 * the multiple at which it drops to one. The two named columns there are
 * "Margin of Safety, QQQQQ Rating" and "Q Rating"; a 20% discount is 0.80 and
 * a 25% premium is 1.25.
 */
export const SAFETY_BANDS = {
  low:      { label: 'Low',       lo: 0.80, hi: 1.25 },
  medium:   { label: 'Medium',    lo: 0.70, hi: 1.35 },
  high:     { label: 'High',      lo: 0.60, hi: 1.55 },
  veryHigh: { label: 'Very High', lo: 0.50, hi: 1.75 },
  extreme:  { label: 'Extreme',   lo: 0.25, hi: 4.00 },
};

const UNCERTAINTY_ORDER = ['low', 'medium', 'high', 'veryHigh', 'extreme'];

/** Score one driver 0 (contained) / 1 (moderate) / 2 (wide), or null. */
function band(v, moderate, wide, { invert = false } = {}) {
  if (!isNum(v)) return null;
  const x = invert ? -v : v;
  const m = invert ? -moderate : moderate;
  const w = invert ? -wide : wide;
  if (x < m) return 0;
  if (x < w) return 1;
  return 2;
}

/**
 * How wide the range of plausible intrinsic values is.
 *
 * Morningstar defines this as the interquartile range of outcomes their
 * analyst's scenario analysis produces, which is a judgement about the
 * business. There is no scenario analysis here, so it is rebuilt from six
 * observable things that widen an outcome range: how far the valuation
 * models disagree, how much the share price moves, how much of the move is
 * the market's, how geared the company is, how steady its margins have been,
 * and how far apart the analysts covering it are.
 *
 * The score is the **mean** of the drivers that could be measured, not the
 * sum, so a company missing two inputs is not quietly rated as more certain
 * than one with all six. Fewer than three measurable drivers and the rating
 * is not published at all — with that little to go on, a printed "Medium"
 * would be a guess wearing a rating's clothes.
 */
export function uncertaintyRating(a, fve = fairValueEstimate(a)) {
  const f = a.facts;
  const m = a.momentum;

  // Annualised from the weekly standard deviation the momentum model already
  // computes. 52 weeks, so root-52.
  const vol = isNum(m.volatility) ? m.volatility * Math.sqrt(52) : null;

  const marginRuns = (a.series.rows || []).map((r) => r.netMargin).filter(isNum);
  const marginMean = mean(marginRuns);
  const marginSd = stdev(marginRuns);
  // Coefficient of variation: a 2pp swing means something different to a 4%
  // margin than to a 40% one.
  const marginCv = (isNum(marginSd) && isNum(marginMean) && Math.abs(marginMean) > 0.005)
    ? marginSd / Math.abs(marginMean) : null;

  const base = a.forecast.rows?.find((r) => r.year === a.forecast.base?.year) || a.forecast.base;
  const epsSpread = (base && isNum(base.epsHigh) && isNum(base.epsLow) && isNum(base.eps)
    && Math.abs(base.eps) > 0.01)
    ? (base.epsHigh - base.epsLow) / Math.abs(base.eps) : null;

  const drivers = [
    {
      key: 'models', label: 'Valuation model spread', short: 'the spread across the valuation models',
      value: fve.iqr, fmt: (v) => pct(v),
      points: band(fve.iqr, 0.20, 0.40),
      basis: 'The middle half of the fair-value models — the gap between the upper and lower '
        + 'quartile, over the estimate itself. The most direct reading of how wide the range of '
        + 'plausible values is, and robust to one model misfiring.',
    },
    {
      key: 'vol', label: 'Share price volatility', short: 'share price volatility',
      value: vol, fmt: (v) => pct(v),
      points: band(vol, 0.25, 0.40),
      basis: 'Weekly standard deviation of returns over the last year, annualised.',
    },
    {
      key: 'beta', label: 'Beta', short: 'beta',
      value: f.beta, fmt: (v) => dec(v, 2),
      points: band(f.beta, 1.1, 1.6),
      basis: 'How much of the share’s movement is the market’s. A high beta widens the range of '
        + 'prices the shares can reach for reasons that have nothing to do with the business.',
    },
    {
      key: 'leverage', label: 'Net debt / EBITDA', short: 'leverage against EBITDA',
      // Net cash is not "low leverage", it is no leverage — it belongs at the
      // bottom of the scale rather than being scored as a small positive.
      value: f.netDebtToEbitda, fmt: (v) => (v < 0 ? `${mult(v)} (net cash)` : mult(v)),
      points: isNum(f.netDebtToEbitda) ? (f.netDebtToEbitda < 0 ? 0 : band(f.netDebtToEbitda, 1.5, 3.0)) : null,
      basis: 'Financial leverage multiplies whatever the business does to equity holders, in '
        + 'both directions, so it widens the outcome range on its own.',
    },
    {
      key: 'margin', label: 'Net margin variability', short: 'the swing in net margin',
      value: marginCv, fmt: (v) => pct(v),
      points: band(marginCv, 0.20, 0.50),
      basis: `Standard deviation of net margin over ${marginRuns.length ? `${marginRuns.length} ` : ''}`
        + 'filed years, as a share of its own average. A steady margin makes next year’s earnings '
        + 'a smaller guess.',
    },
    {
      key: 'consensus', label: 'Consensus EPS dispersion', short: 'analyst dispersion',
      value: epsSpread, fmt: (v) => pct(v),
      points: band(epsSpread, 0.15, 0.35),
      basis: 'High estimate less low estimate, over the mean, for the current forecast year — '
        + 'how far apart the analysts covering it are.',
    },
  ];

  const scored = drivers.filter((d) => isNum(d.points));
  const avg = scored.length ? mean(scored.map((d) => d.points)) : null;

  if (scored.length < 3) {
    return {
      key: null, label: 'Not rated', band: null, score: avg,
      drivers, measured: scored.length, of: drivers.length, confident: false,
    };
  }

  const key = avg < 0.40 ? 'low'
    : avg < 0.85 ? 'medium'
    : avg < 1.30 ? 'high'
    : avg < 1.70 ? 'veryHigh'
    : 'extreme';

  return {
    key,
    label: SAFETY_BANDS[key].label,
    band: SAFETY_BANDS[key],
    score: avg,
    drivers,
    measured: scored.length,
    of: drivers.length,
    // Four of six is enough to publish without a caveat; three is not.
    confident: scored.length >= 4,
  };
}

/* ---------- the quant rating ----------------------------------------------- */

/**
 * The headline rating on this page: the report's own composite.
 *
 * This replaces the star rating the source reports carry, and the swap is not
 * cosmetic — the two measure different things and only one of them is ours.
 * A star rating is a statement about **price against an estimate of worth**.
 * The quant rating is a statement about **the company against its sector**:
 * seventy-odd ratios, each ranked as a percentile within the sector, rolled
 * into five factor scores and averaged.
 *
 * Nothing here is new arithmetic. `a.scores` is already computed by
 * `gradeAll` and drives every other tab; this reads it and gives it a name,
 * a verdict word and a factor breakdown so the report can lead with it.
 *
 * Price *does* enter it, through the Valuation factor's price multiples —
 * saying otherwise would be wrong, and it is an easy thing to say by mistake.
 * What never enters it is a **fair value estimate**: the thirteen models in
 * `valuation-models.js` are display-only by standing decision, and the
 * valuation zone below is the only rating built from them.
 *
 * The two readings are genuinely different questions. The Valuation factor
 * asks whether the multiples are dear *against sector peers*; the zone asks
 * whether the price is above a modelled *intrinsic* value. A company can be
 * cheap against its peers and dear against its cash flows, or the reverse.
 */
export function quantRating(a) {
  const o = a.scores?.overall || {};
  const factors = FACTOR_KEYS.map((k) => {
    const s = a.scores[k];
    return {
      key: k,
      title: FACTOR_BY_KEY[k]?.title || k,
      score: s?.score ?? null,
      letter: s?.letter ?? null,
      graded: s?.graded ?? 0,
      total: s?.total ?? 0,
    };
  });

  const rated = factors.filter((x) => isNum(x.score));
  const ranked = [...rated].sort((x, y) => y.score - x.score);

  return {
    score: o.score ?? null,
    letter: o.letter ?? null,
    verdict: verdictWord(o.score),
    tone: verdictTone(o.score),
    max: MAX_SCORE,
    factors,
    graded: factors.reduce((t, x) => t + x.graded, 0),
    of: factors.reduce((t, x) => t + x.total, 0),
    strongest: ranked[0] || null,
    weakest: ranked.at(-1) || null,
    /** How many of the five factors actually produced a score. */
    factorsRated: rated.length,
  };
}

/* ---------- the valuation zone --------------------------------------------- */

/**
 * Where the price sits against the fair value estimate, banded by uncertainty.
 *
 * What the star rating used to do, without the stars. The band is Morningstar's
 * published margin-of-safety table — a 20% discount at Low uncertainty widening
 * to 75% at Extreme, a 25% premium widening to 300% — applied to this report's
 * own fair value estimate. Below the discount the shares read undervalued,
 * above the premium overvalued, and in between fairly valued.
 *
 * Three zones rather than five stars because three is all the evidence
 * supports once the rating itself has moved to the quant score. The star
 * scale existed to rank one analyst's convictions against each other; a
 * price against a modelled range needs only to say which side of it the
 * price is on.
 */
export function valuationZone(a, fve = fairValueEstimate(a), unc = uncertaintyRating(a, fve)) {
  const p = a.facts.price;
  const fv = fve.value;

  if (!isNum(p) || !isNum(fv) || fv <= 0 || !unc.band) {
    return { label: null, ratio: null, low: null, high: null, unc };
  }

  const { lo, hi } = unc.band;
  const ratio = p / fv;

  return {
    ratio,
    low: fv * lo,
    high: fv * hi,
    label: ratio <= lo ? 'Undervalued' : ratio >= hi ? 'Overvalued' : 'Fairly valued',
    tone: ratio <= lo ? 'good' : ratio >= hi ? 'bad' : 'neutral',
    /** Discount (negative) or premium (positive) to the estimate. */
    gap: ratio - 1,
    unc,
  };
}

/* ---------- economic moat ------------------------------------------------- */

/**
 * Whether the company has earned more on its capital than that capital costs,
 * and for how long.
 *
 * This is the textbook moat test and the app already computes both halves of
 * it: `series.rows[].roic` against `series.rows[].wacc`, with the difference
 * on `spread`.
 *
 * **The honest caveat, which the card also prints.** Morningstar's Wide
 * rating means an analyst expects excess returns to persist for *twenty
 * years*, and Narrow means *ten*. Both are forecasts. This measures the run
 * that has already happened and infers from it, which is a different claim.
 * A company whose patents expire next year still measures wide here. Read it
 * as the evidence a moat rating would be built on, not as the rating itself.
 */
export function moatRating(a) {
  const rows = (a.series.rows || []).filter((r) => isNum(r.spread));
  const years = rows.length;
  const positive = rows.filter((r) => r.spread > 0).length;
  const avg = mean(rows.map((r) => r.spread));
  const now = rows.at(-1)?.spread ?? null;

  const gm = (a.series.rows || []).map((r) => r.grossMargin).filter(isNum);
  const gmNow = gm.at(-1) ?? a.facts.grossMargin ?? null;
  const gmSd = stdev(gm);

  if (years < 3) {
    return {
      key: null, label: 'Not rated', years, positive, avgSpread: avg, nowSpread: now,
      gmNow, gmSd, confident: false,
      why: 'Fewer than three years of return on invested capital and cost of capital could be '
        + 'computed, which is not a run.',
    };
  }

  const hitRate = positive / years;

  const key = (years >= 7 && hitRate >= 0.8 && isNum(avg) && avg >= 0.05) ? 'wide'
    : (hitRate >= 0.6 && isNum(avg) && avg > 0) ? 'narrow'
    : 'none';

  return {
    key,
    label: key === 'wide' ? 'Wide' : key === 'narrow' ? 'Narrow' : 'None',
    years, positive, hitRate,
    avgSpread: avg,
    nowSpread: now,
    gmNow, gmSd,
    confident: years >= 7,
    why: null,
  };
}

/* ---------- capital allocation -------------------------------------------- */

/**
 * The three legs Morningstar names: the balance sheet, the investments, and
 * the shareholder distributions.
 *
 * Each is scored 0–2 from figures already on the report, and the three are
 * summed. The legs are returned individually because the summary word hides
 * which of them is the problem, and that is usually the useful part.
 */
export function capitalAllocation(a) {
  const f = a.facts;
  const rows = a.series.rows || [];
  const last = rows.at(-1) || {};

  /* Balance sheet — can it survive a bad year without asking for money. */
  const nd = f.netDebtToEbitda;
  const cr = f.currentRatio;
  const bsPoints = (() => {
    if (!isNum(nd) && !isNum(cr)) return null;
    const geared = isNum(nd) && nd > 4;
    const tight = isNum(cr) && cr < 0.8;
    const sound = (!isNum(nd) || nd < 1.5) && (!isNum(cr) || cr >= 1.2);
    if (geared || tight) return 0;
    return sound ? 2 : 1;
  })();

  /* Investment — is the capital going in earning more than it costs. */
  const spreadNow = last.spread ?? null;
  const spreadAvg = mean(rows.map((r) => r.spread).filter(isNum));
  const invPoints = (() => {
    if (!isNum(spreadNow) && !isNum(spreadAvg)) return null;
    if (isNum(spreadNow) && spreadNow < 0) return 0;
    if (isNum(spreadNow) && spreadNow >= 0.03 && isNum(spreadAvg) && spreadAvg > 0) return 2;
    return 1;
  })();

  /* Distributions — is what goes out covered by what comes in. */
  const returned = (isNum(last.dividends) ? last.dividends : 0)
    + (isNum(last.buybacks) ? last.buybacks : 0);
  const fcf = last.fcf;
  const cover = (isNum(fcf) && fcf > 0 && returned > 0) ? returned / fcf : null;
  const distPoints = (() => {
    if (!isNum(cover) && !isNum(f.payoutRatio)) return null;
    if ((isNum(cover) && cover > 1.3) || (isNum(f.payoutRatio) && f.payoutRatio > 1)) return 0;
    if (isNum(cover) && cover >= 0.2 && cover <= 1.0) return 2;
    return 1;
  })();

  const legs = [
    {
      key: 'balance', label: 'Balance sheet', points: bsPoints,
      verdict: bsPoints === 2 ? 'Sound' : bsPoints === 1 ? 'Adequate' : bsPoints === 0 ? 'Weak' : 'Not measured',
      detail: [
        isNum(nd) ? `net debt ${nd < 0 ? 'is negative — the company holds net cash' : `${mult(nd)} EBITDA`}` : null,
        isNum(cr) ? `current ratio ${dec(cr, 2)}` : null,
        isNum(f.altmanZ) ? `Altman Z ${dec(f.altmanZ, 2)}` : null,
      ].filter(Boolean).join(', '),
    },
    {
      key: 'investment', label: 'Investment', points: invPoints,
      verdict: invPoints === 2 ? 'Exceptional' : invPoints === 1 ? 'Adequate' : invPoints === 0 ? 'Poor' : 'Not measured',
      detail: [
        isNum(spreadNow) ? `returns on capital are ${pct(Math.abs(spreadNow))} ${spreadNow >= 0 ? 'above' : 'below'} their cost` : null,
        isNum(spreadAvg) ? `${pct(Math.abs(spreadAvg))} ${spreadAvg >= 0 ? 'above' : 'below'} on average across the run` : null,
      ].filter(Boolean).join(', '),
    },
    {
      key: 'distribution', label: 'Shareholder distributions', points: distPoints,
      verdict: distPoints === 2 ? 'Appropriate' : distPoints === 1 ? 'Adequate' : distPoints === 0 ? 'Aggressive' : 'Not measured',
      // Nothing at all when the leg could not be scored. "Nothing returned
      // last year" is a finding about the company; with no cash flow
      // statement loaded it is a finding about the data, and printing it
      // beside "Not measured" says both at once.
      detail: !isNum(distPoints) ? '' : [
        returned > 0 ? `${money(returned, { currency: curSymbol(f.currency) })} returned last year` : 'nothing returned last year',
        isNum(cover) ? `${pct(cover)} of free cash flow` : null,
        isNum(f.payoutRatio) ? `dividend payout ${pct(f.payoutRatio)}` : null,
      ].filter(Boolean).join(', '),
    },
  ];

  const scored = legs.filter((l) => isNum(l.points));
  if (scored.length < 2) {
    return { key: null, label: 'Not rated', legs, total: null, of: scored.length };
  }

  // Rescaled to a six-point scale so a company missing one leg is not capped
  // out of the top rating by the absence rather than by the conduct.
  const total = (mean(scored.map((l) => l.points)) / 2) * 6;
  const key = total >= 5 ? 'exemplary' : total <= 2 ? 'poor' : 'standard';

  return {
    key,
    label: key === 'exemplary' ? 'Exemplary' : key === 'poor' ? 'Poor' : 'Standard',
    legs, total, of: scored.length,
  };
}

/* ---------- style box ----------------------------------------------------- */

/**
 * Size against style, on the nine-box grid.
 *
 * Size is market capitalisation on the conventional cutoffs. Style is the
 * report's own valuation score against its own growth score — a company that
 * ranks well on cheapness and poorly on growth is a value share, and the two
 * factor scores already measure exactly that, against its own sector.
 */
export function styleBox(a) {
  const cap = a.facts.marketCap;
  const v = a.scores.valuation?.score;
  const g = a.scores.growth?.score;

  const size = !isNum(cap) ? null : cap >= 10e9 ? 'Large' : cap >= 2e9 ? 'Mid' : 'Small';

  let style = null;
  if (isNum(v) && isNum(g)) {
    const d = v - g;
    style = d >= 0.75 ? 'Value' : d <= -0.75 ? 'Growth' : 'Blend';
  }

  const sizeIx = ['Large', 'Mid', 'Small'].indexOf(size);
  const styleIx = ['Value', 'Blend', 'Growth'].indexOf(style);
  const n = (sizeIx >= 0 && styleIx >= 0) ? sizeIx * 3 + styleIx + 1 : null;

  return {
    size, style, n,
    label: (size && style) ? `${size} ${style}` : 'Not rated',
    valuationScore: v, growthScore: g,
  };
}

/** Every rating, computed once and passed down the page. */
export function researchRatings(a) {
  const fve = fairValueEstimate(a);
  const unc = uncertaintyRating(a, fve);
  const zone = valuationZone(a, fve, unc);
  return {
    fve, unc, zone,
    quant: quantRating(a),
    moat: moatRating(a),
    capital: capitalAllocation(a),
    style: styleBox(a),
  };
}

/* ==========================================================================
   2. THE NARRATIVE

   Generated sentences, in the register of the source reports: first person
   plural, declarative, hedged where the evidence is thin, and every claim
   carrying the number it rests on.

   The rule every one of these follows: **a sentence whose inputs are missing
   is not written.** Each builder assembles a list and joins what survives, so
   a company with no segment disclosure gets a shorter Business Strategy
   section rather than one with a hole in it.
   ========================================================================== */

const join = (parts) => parts.filter(Boolean).join(' ');

/** Company name, shortened for repeated use mid-sentence. */
function shortName(f) {
  return String(f.name || f.symbol || '')
    .replace(/,? (Inc|Corp|Corporation|Company|Co|Ltd|Limited|plc|PLC|SA|NV|AG|Holdings?)\.?$/i, '')
    .trim() || f.symbol;
}

/* ---------- the analyst note ---------------------------------------------- */

/**
 * The headline and the note under it.
 *
 * Morningstar leads with whatever just happened — an earnings print, a fair
 * value change. The closest thing this report has to an event is the last
 * reported quarter, so the note leads with that where there is one and with
 * the valuation where there is not.
 */
export function analystNote(a, r) {
  const f = a.facts;
  const q = a.quarter;
  const name = shortName(f);
  const cur = curSymbol(f.currency);

  const hasQuarter = q?.available && (isNum(q.epsSurprise) || isNum(q.revenueSurprise));

  const headline = (() => {
    const val = r.zone.label ? r.zone.label.toLowerCase() : null;
    if (hasQuarter && isNum(q.epsSurprise)) {
      const beat = q.epsSurprise >= 0;
      return `${name} ${beat ? 'Beat' : 'Missed'} on Earnings by ${pct(Math.abs(q.epsSurprise))}; `
        + `Shares Screen ${val ? val.replace(/^\w/, (c) => c.toUpperCase()) : 'Unrated'} at `
        + `${price(f.price, cur)}`;
    }
    if (val && isNum(r.fve.value)) {
      return `${name} Screens ${val.replace(/^\w/, (c) => c.toUpperCase())} at ${price(f.price, cur)} `
        + `Against a ${price(r.fve.value, cur)} Fair Value Estimate`;
    }
    return `${name}: Sector-Relative Scorecard`;
  })();

  /* "Why it matters" — three bullets, drawn from the strongest and weakest of
     the graded ratios plus whatever the consensus expects next. */
  const bullets = [];

  if (hasQuarter) {
    bullets.push(join([
      isNum(q.eps) ? `The company reported ${price(q.eps, cur)} of earnings per share` : null,
      isNum(q.epsEstimate) ? `against a ${price(q.epsEstimate, cur)} consensus` : null,
      isNum(q.revenueSurprise)
        ? `and revenue ${q.revenueSurprise >= 0 ? 'ahead of' : 'behind'} expectations by ${pct(Math.abs(q.revenueSurprise))}.`
        : '.',
    ]).replace(/ \./, '.'));
  }

  const best = a.rewards?.[0];
  const worst = a.risks?.[0];
  if (best) bullets.push(best);
  if (worst) bullets.push(worst);

  if (isNum(a.forecast.revenueGrowth) || isNum(a.forecast.epsGrowth)) {
    bullets.push(join([
      a.forecast.analystCount
        ? `The ${a.forecast.analystCount} analysts covering the company expect`
        : 'Consensus expects',
      isNum(a.forecast.revenueGrowth) ? `revenue to compound at ${pct(a.forecast.revenueGrowth)} a year` : null,
      (isNum(a.forecast.revenueGrowth) && isNum(a.forecast.epsGrowth)) ? 'and' : null,
      isNum(a.forecast.epsGrowth) ? `earnings per share at ${pct(a.forecast.epsGrowth)}` : null,
      a.forecast.span ? `over the ${a.forecast.span} years to ${a.forecast.target?.year}.` : '.',
    ]).replace(/ \./, '.'));
  }

  /* The bottom line — the rating, the price that would change it, and the
     single thing this note is least sure about. */
  const bottom = join([
    isNum(r.quant.score)
      ? `Our quant rating on ${name} is ${r.quant.verdict} — grade ${r.quant.letter}, `
        + `${dec(r.quant.score, 2)} of ${r.quant.max}, from ${r.quant.graded} ranked ratios.`
      : `We cannot produce a quant rating for ${name}.`,
    r.moat.key ? `We read the business as ${r.moat.label.toLowerCase()}-moat.` : null,
    r.zone.label
      ? `Separately, the shares screen ${r.zone.label.toLowerCase()} at ${price(f.price, cur)} against a `
        + `${price(r.fve.value, cur)} fair value estimate, a ${dec(r.zone.ratio, 2)} price/fair value — `
        + `and on a ${r.unc.label} uncertainty band they would read undervalued below `
        + `${price(r.zone.low, cur)}.`
      : null,
    'The rating and the valuation answer different questions, and the price is not an input to '
      + 'the rating.',
  ]).replace(/ \./, '.');

  return { headline, bullets: bullets.filter(Boolean).slice(0, 4), bottom };
}

function gradedCount(a) {
  return ['valuation', 'growth', 'health', 'profitability', 'momentum']
    .reduce((t, k) => t + (a.scores[k]?.graded || 0), 0);
}

/* ---------- business strategy & outlook ------------------------------------ */

export function strategyProse(a, r) {
  const f = a.facts;
  const name = shortName(f);
  const seg = a.segments?.product;
  const geo = a.segments?.geography;
  const last = (a.series.rows || []).at(-1) || {};
  const paras = [];

  paras.push(join([
    `${f.name} operates in ${f.industry || f.sector || 'an unclassified industry'}`,
    f.country ? `and is domiciled in ${f.country}.` : '.',
    isNum(f.revenue) ? `It turned over ${money(f.revenue, { currency: curSymbol(f.currency) })} in the trailing twelve months` : null,
    isNum(f.employees) ? `with ${num(f.employees, 0)} employees,` : null,
    isNum(last.netMargin) ? `converting ${pct(last.netMargin)} of revenue into net income in its last filed year.` : '.',
  ]).replace(/ \./g, '.').replace(/,\./g, '.'));

  if (seg?.available && seg.latest?.parts?.length) {
    const parts = seg.latest.parts.slice(0, 3);
    const total = seg.latest.total;
    const lead = parts[0];
    paras.push(join([
      `The business reports ${seg.latest.parts.length} product lines.`,
      (lead && total > 0)
        ? `${lead.name} is the largest at ${pct(lead.value / total)} of revenue`
        : null,
      (parts[1] && total > 0) ? `, followed by ${parts[1].name} at ${pct(parts[1].value / total)}.` : '.',
      (lead && total > 0 && lead.value / total > 0.5)
        ? 'That concentration is the central fact about this company: more than half of what it '
          + 'earns depends on one line, and a forecast for the business is largely a forecast for '
          + 'that line.'
        : null,
    ]).replace(/ ,/g, ',').replace(/ \./g, '.'));
  }

  if (geo?.available && geo.latest?.parts?.length && geo.latest.total > 0) {
    const top = geo.latest.parts[0];
    paras.push(`Geographically, ${top.name} accounts for ${pct(top.value / geo.latest.total)} of `
      + `revenue across ${geo.latest.parts.length} reported regions.`);
  }

  const rows = a.series.rows || [];
  if (rows.length >= 3) {
    const first = rows[0], now = rows.at(-1);
    const g = cagr(first.revenue, now.revenue, rows.length - 1);
    paras.push(join([
      isNum(g)
        ? `Revenue has compounded at ${pct(g)} a year across the ${rows.length} filed years to `
          + `${now.year}`
        : `Revenue over the ${rows.length} filed years to ${now.year} does not compound cleanly`,
      (isNum(first.operatingMargin) && isNum(now.operatingMargin))
        ? `, with the operating margin moving from ${pct(first.operatingMargin)} to ${pct(now.operatingMargin)}.`
        : '.',
      (isNum(first.operatingMargin) && isNum(now.operatingMargin) && now.operatingMargin > first.operatingMargin + 0.02)
        ? 'The margin has widened as the business has grown, which is what operating leverage '
          + 'looks like and is the more valuable of the two facts.'
        : (isNum(first.operatingMargin) && isNum(now.operatingMargin) && now.operatingMargin < first.operatingMargin - 0.02)
          ? 'The margin has narrowed as the business has grown, so revenue growth has been bought '
            + 'rather than earned, and the earnings line has not kept pace with the top one.'
          : null,
    ]).replace(/ ,/g, ',').replace(/ \./g, '.'));
  }

  if (a.forecast.available && (isNum(a.forecast.revenueGrowth) || isNum(a.forecast.epsGrowth))) {
    paras.push(join([
      'Looking forward, we take the consensus path as filed rather than substituting a house view:',
      isNum(a.forecast.revenueGrowth)
        ? `revenue compounding at ${pct(a.forecast.revenueGrowth)} a year` : null,
      isNum(a.forecast.epsGrowth)
        ? `and earnings per share at ${pct(a.forecast.epsGrowth)}` : null,
      a.forecast.target?.year ? `through ${a.forecast.target.year}.` : '.',
      a.forecast.analystCount ? `That is the median of ${a.forecast.analystCount} contributing analysts,` : null,
      'and the outer years of any consensus thin out as coverage does.',
    ]).replace(/ \./g, '.'));
  }

  return paras;
}

/* ---------- moat prose ----------------------------------------------------- */

export function moatProse(a, r) {
  const name = shortName(a.facts);
  const m = r.moat;
  const paras = [];

  if (!m.key) {
    return [`We do not assign ${name} an economic moat rating. ${m.why}`];
  }

  paras.push(join([
    `We assign ${name} a ${m.label.toLowerCase()} economic moat rating.`,
    isNum(m.avgSpread)
      ? `Return on invested capital has exceeded our estimate of the company's weighted average `
        + `cost of capital in ${m.positive} of the last ${m.years} filed years, by an average of `
        + `${pct(Math.abs(m.avgSpread))}${m.avgSpread < 0 ? ' in the wrong direction' : ''}.`
      : null,
    isNum(m.nowSpread)
      ? `In the most recent year that spread was ${pct(Math.abs(m.nowSpread))} ${m.nowSpread >= 0 ? 'in the company’s favour' : 'against it'}.`
      : null,
  ]));

  if (m.key === 'wide') {
    paras.push('A company that out-earns its cost of capital that consistently is either '
      + 'protected by something — a brand, a patent estate, switching costs, a cost position '
      + 'rivals cannot match — or is about to attract the competition that removes the excess. '
      + 'The persistence of the record is the evidence for the former.');
  } else if (m.key === 'narrow') {
    paras.push('The excess return is real but not emphatic: either the margin over the cost of '
      + 'capital is thin, or the record has gaps in it. That is the profile of a business with a '
      + 'defensible position rather than an unassailable one.');
  } else {
    paras.push('On this evidence the company does not earn more on its capital than that capital '
      + 'costs, at least not durably. That is not a judgement on the business — plenty of '
      + 'necessary companies operate at their cost of capital — but it does mean growth adds '
      + 'little value on its own, because every extra pound invested returns roughly what it '
      + 'costs to raise.');
  }

  if (isNum(m.gmNow)) {
    paras.push(join([
      `The gross margin stands at ${pct(m.gmNow)}`,
      isNum(m.gmSd) ? `and has moved by a standard deviation of ${pct(m.gmSd)} across the run.` : '.',
      (isNum(m.gmSd) && m.gmSd < 0.03)
        ? 'A gross margin that steady through a full cycle is itself evidence of pricing power: it '
          + 'says the company has not had to buy its volume.'
        : (isNum(m.gmSd) && m.gmSd > 0.08)
          ? 'A gross margin that moves that much is the signature of a price-taker, and it argues '
            + 'against a durable advantage whatever the returns on capital say.'
          : null,
    ]).replace(/ \./g, '.'));
  }

  paras.push(`This rating is a measurement of ${m.years} years that have already happened. `
    + 'Morningstar’s equivalent is a forecast — narrow means an analyst expects excess returns to '
    + 'persist a decade, wide means two — and no arithmetic over filed accounts can make that '
    + 'claim. Read this as the evidence a moat rating would be built from.');

  return paras;
}

/* ---------- fair value prose ----------------------------------------------- */

export function fairValueProse(a, r) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const name = shortName(f);
  const paras = [];
  const fve = r.fve;

  if (!isNum(fve.value)) {
    return ['None of the valuation models produced a usable fair value for this company, so no '
      + 'fair value estimate and no star rating are published.'];
  }

  paras.push(join([
    `Our fair value estimate is ${price(fve.value, cur)} a share.`,
    fve.sole
      ? 'It comes from the vendor’s levered discounted cash flow alone — the relative models could '
        + 'not be run — so it is a single view rather than a consensus of them.'
      : `It is the median of ${fve.count} independent models — ${fve.models.filter((m) => m.family === 'dcf').length} `
        + `discounted cash flow and ${fve.models.filter((m) => m.family === 'multiple').length} relative multiples — `
        + `which span ${price(fve.low, cur)} to ${price(fve.high, cur)}.`,
    isNum(fve.iqr)
      ? `The middle half of them sits between ${price(fve.q1, cur)} and ${price(fve.q3, cur)}, a `
        + `band ${pct(fve.iqr)} wide against the estimate; that band, rather than the full span, `
        + `is what feeds the ${r.unc.label} uncertainty rating.`
      : null,
  ]));

  paras.push(join([
    isNum(f.pe) ? `At ${price(f.price, cur)} the shares trade on ${mult(f.pe)} trailing earnings` : `At ${price(f.price, cur)}`,
    isNum(a.val.peFwd) ? `and ${mult(a.val.peFwd)} forward` : null,
    isNum(a.val.fcfYield) ? `, a ${pct(a.val.fcfYield)} free cash flow yield.` : '.',
    isNum(r.zone.ratio)
      ? `That is a ${dec(r.zone.ratio, 2)} price/fair value — ${r.zone.ratio > 1
          ? `a ${pct(r.zone.ratio - 1)} premium to`
          : `a ${pct(1 - r.zone.ratio)} discount to`} our estimate.`
      : null,
  ]).replace(/ ,/g, ',').replace(/ \./g, '.'));

  /* The profit drivers — what the estimate is actually sensitive to. */
  const fc = a.forecast;
  if (fc.available) {
    paras.push(join([
      'The drivers behind it are the consensus path:',
      isNum(fc.revenueGrowth) ? `revenue compounding at ${pct(fc.revenueGrowth)} a year` : null,
      isNum(fc.epsGrowth) ? `and earnings per share at ${pct(fc.epsGrowth)}` : null,
      fc.target?.year ? `through ${fc.target.year},` : null,
      isNum(f.operatingMargin) ? `off a ${pct(f.operatingMargin)} operating margin today.` : '.',
      isNum(fc.futureRoe) ? `The path implies a ${pct(fc.futureRoe)} return on equity at the end of it.` : null,
    ]).replace(/ ,/g, ',').replace(/ \./g, '.'));
  }

  if (fve.models.length >= 3) {
    const dcfs = fve.models.filter((m) => m.family === 'dcf').map((m) => m.value);
    const mults = fve.models.filter((m) => m.family === 'multiple').map((m) => m.value);
    if (dcfs.length && mults.length) {
      const dm = median(dcfs), mm = median(mults);
      const apart = Math.abs(dm - mm) / fve.value > 0.25;
      paras.push(join([
        apart
          ? `The two families disagree: the discounted cash flows centre on ${price(dm, cur)} and `
            + `the relative multiples on ${price(mm, cur)}.`
          : `The two families agree: the discounted cash flows centre on ${price(dm, cur)} and the `
            + `relative multiples on ${price(mm, cur)}.`,
        apart
          ? 'A gap that wide usually means the market is pricing a different growth rate than the '
            + 'cash flows imply, and the reader has to decide which of the two they believe. It is '
            + 'the reason this report publishes a range rather than only a point.'
          : 'That is the more reassuring outcome — the cash flows and the market’s comparable '
            + 'multiples are telling the same story about what the business is worth.',
      ]));
    }
  }

  paras.push('No fair value on this page feeds any letter grade anywhere in this report. That is '
    + 'a deliberate separation: a valuation is a set of assumptions the reader chooses, and '
    + 'letting a chosen assumption move a sector-relative grade would make the grade mean '
    + 'something different for every reader. The star rating is the one rating built from it, '
    + 'and it is labelled as such.');

  return paras;
}

/* ---------- risk prose ------------------------------------------------------ */

export function riskProse(a, r) {
  const name = shortName(a.facts);
  const u = r.unc;
  const paras = [];

  if (!u.key) {
    return [`We do not publish an uncertainty rating for ${name}: only ${u.measured} of `
      + `${u.of} drivers could be measured, which is not enough to place it.`];
  }

  const wide = u.drivers.filter((d) => d.points === 2);
  const tight = u.drivers.filter((d) => d.points === 0);

  const named = (list) => listOf(list.map((d) => d.short || d.label.toLowerCase()));

  paras.push(join([
    `We assign ${name} a ${u.label} uncertainty rating,`,
    `built from ${u.measured} of ${u.of} measurable drivers.`,
    wide.length
      ? `The ${wide.length === 1 ? 'one that reads widest is' : 'ones that read widest are'} ${named(wide)}.`
      : 'No single driver reads as wide.',
    tight.length && wide.length
      ? `Against that, ${named(tight)} ${tight.length === 1 ? 'is' : 'are'} contained.`
      : null,
  ]));

  paras.push(join([
    'The rating is not a description of the business so much as a statement about how far the '
      + 'estimate above should be trusted, and it is what sets the width of the valuation band',
    // Only quotable as prices when there is a fair value to take a discount
    // from. Without one the rating still stands — it is measured from the
    // company, not from the estimate — but it has nothing to price.
    isNum(r.zone.low)
      ? `: at ${u.label} uncertainty the shares read undervalued below `
        + `${price(r.zone.low, curSymbol(a.facts.currency))} and overvalued above `
        + `${price(r.zone.high, curSymbol(a.facts.currency))}.`
      : `. No fair value estimate could be produced for this company, so the ${u.label} band has `
        + 'nothing to be applied to and no valuation zone is published.',
  ]).replace(' :', ':').replace(' .', '.'));

  const f = a.facts;
  const risks = [];
  if (isNum(f.netDebtToEbitda) && f.netDebtToEbitda > 3) {
    risks.push(`leverage at ${mult(f.netDebtToEbitda)} EBITDA leaves less room for a bad year than the sector median`);
  }
  if (isNum(a.momentum.drawdown) && a.momentum.drawdown > 0.3) {
    risks.push(`the shares have already fallen ${pct(a.momentum.drawdown)} peak to trough inside the last year`);
  }
  const seg = a.segments?.product;
  if (seg?.available && seg.latest?.total > 0 && seg.latest.parts[0]) {
    const share = seg.latest.parts[0].value / seg.latest.total;
    if (share > 0.5) risks.push(`${pct(share)} of revenue sits in ${seg.latest.parts[0].name} alone`);
  }
  if (risks.length) {
    paras.push(`Specific to this company: ${listOf(risks)}.`);
  }

  paras.push('Morningstar sets this rating from an analyst’s scenario analysis of the business. '
    + 'This one is measured from market and accounting data instead, which catches a volatile, '
    + 'geared, hard-to-forecast company reliably and will miss a contingent risk that has not '
    + 'shown up in the numbers yet — litigation, a regulatory decision, a single customer about '
    + 'to leave.');

  return paras;
}

function listOf(items) {
  const xs = items.filter(Boolean);
  if (!xs.length) return '';
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
}

/* ---------- capital allocation prose ---------------------------------------- */

export function capitalProse(a, r) {
  const name = shortName(a.facts);
  const c = r.capital;
  if (!c.key) {
    return [`We do not publish a capital allocation rating for ${name}: too few of the three legs `
      + 'could be measured.'];
  }

  const paras = [join([
    `We assign ${name} a ${c.label} capital allocation rating.`,
    'The rating reflects our assessment of the balance sheet, the investments management has '
      + 'made, and the policy on returning cash to shareholders —',
    // No verb between the leg and its verdict: "shareholder distributions
    // reads adequate" needs a singular the plural noun will not give, and
    // rewriting round it every time costs more than the colon-free list does.
    `${listOf(c.legs.filter((l) => isNum(l.points))
      .map((l) => `${l.label.toLowerCase()} ${l.verdict.toLowerCase()}`))}.`,
  ])];

  for (const leg of c.legs) {
    if (!isNum(leg.points) || !leg.detail) continue;
    paras.push(`${leg.label}: ${leg.verdict.toLowerCase()} — ${leg.detail}.`);
  }

  if (a.facts.ceo) {
    paras.push(`${a.facts.ceo} leads the company. This report makes no assessment of management `
      + 'quality beyond the three measured legs above: tenure, track record and the judgement '
      + 'calls behind an acquisition are not in the filings this reads, and Morningstar’s '
      + 'equivalent rating rests heavily on exactly those.');
  }

  return paras;
}

/* ==========================================================================
   3. THE REPORT

   Section order follows the source reports' contents page, which is a good
   order for the argument: what it is worth, what just happened, what the
   business is, why it might last, what it is worth again in detail, what
   could go wrong, who is running it, and the numbers underneath.
   ========================================================================== */

export function renderResearchTab(a, nav = {}) {
  const r = researchRatings(a);
  const root = el('div', { class: 'ovw rsr' });

  const build = (nar) => [
    ratingBandCard(a, r),
    priceVsFairValueCard(a, r),
    analystNoteCard(a, r, nar),
    businessCard(a, r),
    strategyCard(a, r, nar),
    bullsBearsCard(a, r, nar),
    competitorsCard(a, r),
    moatCard(a, r, nar),
    fairValueCard(a, r, nav, nar),
    riskCard(a, r, nar),
    capitalCard(a, r, nar),
    financialsCard(a, r),
    methodologyCard(a, r, nar),
  ];

  /* Render the generated short form first, then swap the whole tab when the
     narrative lands. A full rebuild rather than a per-section patch because
     nothing on this tab holds reader state — no strip, no range selector —
     and the file is local, so the swap happens before anyone has scrolled.
     A failure is silent: the short form is a complete report on its own. */
  root.replaceChildren(...build(null));
  fetchNarrative(a, r)
    .then((nar) => { if (nar?.sections) root.replaceChildren(...build(nar)); })
    .catch(() => { /* keep the generated prose */ });

  return root;
}

/* ---------- prose: the narrative if there is one, else the generated form -- */

/**
 * One section's paragraphs.
 *
 * The fallback is not a placeholder — it is the deterministic prose the tab
 * shipped with, and it is complete. A company with no narrative gets a
 * shorter report, not a broken one.
 */
function prose(nar, key, fallback) {
  const paras = nar?.sections?.[key];
  const use = (Array.isArray(paras) && paras.length) ? paras : fallback;
  return use.map((p) => el('p', { class: 'rsrp', text: p }));
}

/* ---------- the rating band ------------------------------------------------ */

/**
 * The quant rating, as the badge that leads the report.
 *
 * Verdict word, letter and score together. The word alone is too coarse to
 * be the whole rating — "Buy" spans a point and a half of a five-point scale
 * — and the number alone means nothing to a reader who has not been told the
 * scale, so all three go in one badge.
 */
function quantBadge(q, { size = '' } = {}) {
  if (!isNum(q.score)) {
    return el('span', { class: 'subtle t-tiny', text: 'Not rated' });
  }
  return el('span', {
    class: `qbadge qbadge--${q.tone} ${size ? `qbadge--${size}` : ''}`.trim(),
    title: `${dec(q.score, 2)} out of ${q.max}, grade ${q.letter}, from ${q.graded} ranked ratios`,
  }, [
    el('b', { class: 'qbadge__w', text: q.verdict }),
    el('span', { class: 'qbadge__s' }, [
      el('i', { text: q.letter }),
      el('em', { text: `${dec(q.score, 2)}/${q.max}` }),
    ]),
  ]);
}

/**
 * A 0–5 score as a filled track.
 *
 * The scale is drawn rather than stated: a bar that is always five units wide
 * makes 3.95 and 1.69 comparable at a glance in a way two printed decimals do
 * not, and it is the same reading the factor tabs already give.
 */
function scoreBar(score, letter, { label = '' } = {}) {
  const w = isNum(score) ? clamp((score / MAX_SCORE) * 100, 0, 100) : 0;
  return el('div', { class: 'qbar' }, [
    label ? el('span', { class: 'qbar__k', text: label }) : null,
    el('span', { class: 'qbar__t' }, [
      el('i', {
        class: `qbar__f is-${toneForLetter(letter)}`,
        style: { width: `${w}%` },
      }),
    ]),
    el('span', { class: 'qbar__v', text: isNum(score) ? dec(score, 2) : 'n/a' }),
  ]);
}

/**
 * The band across the top of every Morningstar page: price, fair value,
 * price/fair value, market cap, moat, style box, uncertainty, capital
 * allocation.
 *
 * The one addition is the report's own composite letter grade, sitting beside
 * the star rating rather than merged into it. They measure different things
 * and they disagree often — a company can be the best-ranked business in its
 * sector and still be priced past any estimate of its worth — so the card
 * shows both and the note under it says which is which.
 */
function ratingBandCard(a, r) {
  const f = a.facts;
  const cur = curSymbol(f.currency);

  return card('rsr-band', [
    el('div', { class: 'rsrhead' }, [
      el('div', { class: 'rsrhead__id' }, [
        logo(f),
        el('div', {}, [
          el('h2', { class: 'rsrhead__n', text: f.name }),
          el('p', { class: 'rsrhead__s', text: [
            f.symbol, f.exchange, f.sector, f.industry,
          ].filter(Boolean).join(' · ') }),
        ]),
      ]),
      el('div', { class: 'rsrhead__r' }, [
        quantBadge(r.quant, { size: 'lg' }),
        el('p', { class: 't-tiny subtle', text: r.quant.verdict
          ? `Vanlior Quant Rating · ${fmtDate(a.ds.asOf)}`
          : 'Not rated' }),
      ]),
    ]),

    el('div', { class: 'rsrband' }, [
      bandCell('Quant Rating', r.quant.verdict || 'n/a',
        isNum(r.quant.score) ? `${r.quant.letter} · ${dec(r.quant.score, 2)} of ${r.quant.max}` : 'not rated'),
      bandCell('Last Price', price(f.price, cur), fmtDate(f.quoteTime || a.ds.asOf)),
      bandCell('Fair Value Estimate', isNum(r.fve.value) ? price(r.fve.value, cur) : 'n/a',
        r.fve.count ? `median of ${r.fve.count} models` : 'not modelled'),
      bandCell('Price/FVE', isNum(r.zone.ratio) ? dec(r.zone.ratio, 2) : 'n/a',
        r.zone.label || ''),
      bandCell('Market Cap', money(f.marketCap, { currency: cur }), ''),
      bandCell('Economic Moat', r.moat.label, r.moat.key ? `${r.moat.positive}/${r.moat.years} years` : 'not rated'),
      bandCell('Uncertainty', r.unc.label, r.unc.key ? `${r.unc.measured}/${r.unc.of} drivers` : ''),
      bandCell('Capital Allocation', r.capital.label,
        isNum(r.capital.total) ? `${dec(r.capital.total, 1)}/6` : ''),
    ]),

    el('div', { class: 'rsrsplit' }, [
      el('div', { class: 'rsrsplit__c rsrsplit__c--wide' }, [
        el('p', { class: 'osub', text: 'Quant rating — the company against its sector' }),
        el('div', { class: 'qhero' }, [
          quantBadge(r.quant),
          gradePill(r.quant.score, r.quant.letter, { size: 'lg' }),
        ]),
        el('div', { class: 'qfactors' }, r.quant.factors.map((x) =>
          scoreBar(x.score, x.letter, { label: x.title }))),
        el('p', { class: 't-tiny subtle', text: `${r.quant.graded} of ${r.quant.of} ratios ranked, `
          + 'each as a percentile against the sector, averaged within a factor and then across '
          + 'the five. Price multiples count here, inside the Valuation factor; no fair value '
          + 'estimate does.' }),
      ]),
      el('div', { class: 'rsrsplit__c' }, [
        el('p', { class: 'osub', text: 'Valuation — the price against the estimate' }),
        el('p', { class: `rzone is-${r.zone.tone || 'muted'}`, text: r.zone.label || 'Not rated' }),
        el('p', { class: 't-tiny subtle', text: isNum(r.zone.low)
          ? `Undervalued below ${price(r.zone.low, cur)}, overvalued above ${price(r.zone.high, cur)}, `
            + `on the ${r.unc.label} uncertainty band around a ${price(r.fve.value, cur)} estimate.`
          : 'No fair value estimate, so no valuation zone.' }),
        el('p', { class: 'osub mt2', text: 'Style' }),
        styleGrid(r.style),
      ]),
    ]),

    notice('The <b>quant rating</b> is the rating on this report: every ratio that could be '
      + 'ranked, scored as a percentile against the sector. Price multiples are part of it, '
      + 'inside the Valuation factor. The <b>valuation zone</b> beside it is a separate reading '
      + 'and the only place a fair value estimate is used — the price against thirteen models of '
      + 'what the business is worth. One asks whether the multiples are dear against peers, the '
      + 'other whether the price is above intrinsic value; they can and do disagree.'),
  ], 'ocard ovw__c12');
}

function logo(f) {
  const src = f.image || logoUrl(f.symbol);
  if (!src) return null;
  const img = el('img', { class: 'rsrhead__logo', src, alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.remove());
  return img;
}

function bandCell(label, value, note) {
  return el('div', { class: 'rsrband__c' }, [
    el('div', { class: 'rsrband__k', text: label }),
    el('div', { class: 'rsrband__v', text: value }),
    note ? el('div', { class: 'rsrband__n', text: note }) : null,
  ]);
}

/** The nine-box grid with the company's cell lit. */
function styleGrid(style) {
  const sizes = ['Large', 'Mid', 'Small'];
  const styles = ['Value', 'Blend', 'Growth'];
  const cells = [];
  for (const s of sizes) {
    for (const t of styles) {
      cells.push(el('i', {
        class: `rsbox__c ${s === style.size && t === style.style ? 'is-on' : ''}`.trim(),
        title: `${s} ${t}`,
      }));
    }
  }
  return el('div', { class: 'rsbox' }, [
    el('div', { class: 'rsbox__g' }, cells),
    el('div', { class: 'rsbox__l' }, [
      el('span', { class: 't-tiny subtle', text: style.label }),
      el('span', { class: 't-tiny subtle', text: isNum(style.valuationScore) && isNum(style.growthScore)
        ? `valuation ${dec(style.valuationScore, 1)} vs growth ${dec(style.growthScore, 1)}`
        : '' }),
    ]),
  ]);
}

/* ---------- price vs fair value -------------------------------------------- */

/**
 * The chart Morningstar puts at the top of page one, with the honest
 * difference stated under it.
 *
 * Theirs plots the price against the fair value *as it stood at the time*,
 * which is why they can print a price/fair value ratio for every year back to
 * 2021. This report has one fair value — today's, computed from today's
 * figures — so drawing it as a flat line across five years of price would
 * assert a history of estimates that was never made. The line is drawn, and
 * labelled as today's estimate; the per-year row underneath is total return,
 * which is a fact about the price and needs no estimate at all.
 */
function priceVsFairValueCard(a, r) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const pts = a.momentum.points || [];

  const years = yearlyReturns(pts);

  // Insider and fund pings, shared with the Overview and Analysis charts.
  // The chart needs a host it can be redrawn into, because a toggle changes
  // the marker set rather than the price line.
  const chartHost = el('div', {});
  const pings = createPings(a, { onChange: () => drawChart() });

  function drawChart() {
    chartHost.replaceChildren(pts.length > 1
      ? lineChart(pts.map((p) => ({ date: p.date, value: p.price })), {
          height: 300,
          valueFmt: (v) => price(v, cur),
          labelFmt: (d) => fmtDate(d, { month: 'short', year: '2-digit' }),
          refLine: isNum(r.fve.value)
            ? { value: r.fve.value, label: `Fair value ${price(r.fve.value, cur)}` }
            : null,
          markers: pings.markers(),
        })
      : (feedGate(a, 'prices', 'Price history') || notice('No price history was returned.')));
  }
  drawChart();

  return card('rsr-pfv', [
    ohead('Price vs. Fair Value', null,
      'One fair value estimate — today’s — drawn across the whole window. Morningstar’s version '
      + 'of this chart carries the estimate as it stood in each year; this report has no archive '
      + 'of past estimates and does not invent one.'),

    chartHost,
    pings.legend,
    pings.note,

    years.length
      ? el('div', { class: 'mt2' }, [
          table(
            [{ label: '' }, ...years.map((y) => ({ label: String(y.year), num: true }))],
            [
              ['Total Return %', ...years.map((y) => el('span', {
                class: isNum(y.ret) ? (y.ret >= 0 ? 'pos' : 'neg') : '',
                text: isNum(y.ret) ? pct(y.ret, { sign: true }) : 'n/a',
              }))],
            ],
          ),
          el('p', { class: 't-tiny subtle mt2', text: 'Price return by calendar year from the '
            + 'closing series, dividends excluded. The current year is year to date.' }),
        ])
      : null,

    /* The reference prices, not a ladder. They are printed low to high as a
       reading order, but nothing guarantees they stay in that order: the
       lowest model can sit above the discount threshold on a company whose
       models agree closely, and the last price can land anywhere. Each cell
       says what it is rather than relying on its position to say it. */
    el('div', { class: 'rsrpf' }, [
      pfCell('Model low', isNum(r.fve.low) ? price(r.fve.low, cur) : 'n/a', ''),
      pfCell('Undervalued below', isNum(r.zone.low) ? price(r.zone.low, cur) : 'n/a', 'good'),
      pfCell('Fair value estimate', isNum(r.fve.value) ? price(r.fve.value, cur) : 'n/a', 'anchor'),
      pfCell('Overvalued above', isNum(r.zone.high) ? price(r.zone.high, cur) : 'n/a', 'bad'),
      pfCell('Last price', price(f.price, cur), 'self'),
    ]),

    el('p', { class: 't-tiny subtle mt2', text: isNum(r.zone.low)
      ? `The undervalued and overvalued thresholds are the ${r.unc.label} uncertainty band — a `
        + `${pct(1 - r.unc.band.lo)} discount and a ${pct(r.unc.band.hi - 1)} premium — applied to `
        + 'the fair value estimate. A wider uncertainty rating widens both, because a less '
        + 'reliable estimate earns less confidence that any given price is wrong.'
      : 'No fair value estimate could be produced, so no thresholds are drawn.' }),
  ], 'ocard ovw__c12');
}

function pfCell(label, value, tone) {
  return el('div', { class: `rsrpf__c ${tone ? `is-${tone}` : ''}`.trim() }, [
    el('div', { class: 'rsrpf__v', text: value }),
    el('div', { class: 'rsrpf__k', text: label }),
  ]);
}

/** Calendar-year price return from the daily close series. */
function yearlyReturns(pts) {
  if (pts.length < 2) return [];
  const byYear = new Map();
  for (const p of pts) {
    const y = yearOf(p.date);
    if (!isNum(y)) continue;
    if (!byYear.has(y)) byYear.set(y, { year: y, first: p.price, last: p.price });
    else byYear.get(y).last = p.price;
  }
  const rows = [...byYear.values()].sort((x, y) => x.year - y.year);
  // The opening mark for a year is the previous year's close, not the first
  // trade of January — using January's own open double-counts the new year
  // gap and reports a return the holder never had.
  return rows.map((row, i) => {
    const open = i > 0 ? rows[i - 1].last : row.first;
    return { year: row.year, ret: open > 0 ? row.last / open - 1 : null };
  }).slice(-6);
}

/* ---------- the analyst note ------------------------------------------------ */

function analystNoteCard(a, r, nar) {
  const gen = analystNote(a, r);
  const n = nar?.sections?.note;

  const headline = n?.headline || gen.headline;
  const bullets = (n?.why?.length ? n.why : gen.bullets) || [];
  const bottom = n?.bottomLine || gen.bottom;

  return card('rsr-note', [
    ohead('Analyst Note'),
    byline(a, nar),

    el('h3', { class: 'rsrnote__h', text: headline }),

    bullets.length
      ? el('div', { class: 'rsrwhy' }, [
          el('p', { class: 'rsrwhy__k', text: 'Why it matters:' }),
          el('ul', { class: 'rsrbul' }, bullets.map((b) => el('li', { text: b }))),
        ])
      : null,

    el('p', { class: 'rsrnote__b' }, [
      el('b', { text: 'The bottom line: ' }),
      bottom,
    ]),
  ], 'ocard ovw__c12');
}

/**
 * The byline.
 *
 * A Morningstar note is signed by a named analyst, and the signature is the
 * product — it is a person saying they believe this. Signing a generated
 * report with anything resembling a name would be the one genuinely
 * misleading thing this page could do, so it says what it is.
 */
function byline(a, nar) {
  const src = a.ds.source === 'snapshot' ? 'the bundled snapshot' : 'live Financial Modeling Prep data';

  // Written by a model: say which one, when, and — the part that matters —
  // that the figures it quotes were the ones on the page at generation time.
  // A narrative written weeks ago beside a price that moves every day is the
  // one way this page can mislead, so the date is not decoration.
  if (nar) {
    return el('p', { class: 'rsrby' }, [
      el('b', { text: 'Written by ' + nar.model }),
      el('span', { text: nar.generatedAt ? ` · ${fmtDate(nar.generatedAt)}` : '' }),
      el('span', { text: nar.source === 'live' ? ' · generated for this request' : ' · pre-generated' }),
      el('span', { text: ' · figures from ' + src + ', quoted as they stood when it was written' }),
      el('span', { text: ' · not an analyst opinion' }),
    ]);
  }

  return el('p', { class: 'rsrby' }, [
    el('b', { text: 'Vanlior model' }),
    el('span', { text: ` · assembled ${fmtDate(a.ds.asOf)} from ` }),
    el('span', { text: src }),
    el('span', { text: ' · no narrative model for this company · no analyst opinion' }),
  ]);
}

/* ---------- business description -------------------------------------------- */

function businessCard(a, r) {
  const f = a.facts;
  return card('rsr-business', [
    ohead('Business Description'),
    f.description
      ? el('p', { class: 'rsrp', text: f.description })
      : notice('No business description was returned for this company.'),

    keyInfo([
      ['Sector', f.sector || 'n/a'],
      ['Industry', f.industry || 'n/a'],
      ['Employees', isNum(f.employees) ? num(f.employees, 0) : 'n/a'],
      ['Country', f.country || 'n/a'],
      f.ipoDate ? ['Listed', fmtDate(f.ipoDate)] : null,
      ['CEO', f.ceo || 'n/a'],
    ]),
  ], 'ocard ovw__c12');
}

/* ---------- strategy & outlook ---------------------------------------------- */

function strategyCard(a, r, nar) {
  return card('rsr-strategy', [
    ohead('Business Strategy & Outlook'),
    byline(a, nar),
    ...prose(nar, 'strategy', strategyProse(a, r)),
  ], 'ocard ovw__c12');
}

/* ---------- bulls / bears ---------------------------------------------------- */

/**
 * Bulls Say / Bears Say, off the graded ratios.
 *
 * `a.rewards` and `a.risks` are already the strongest and weakest graded
 * metrics with their explanation sentences, which is exactly the shape this
 * section wants — a short list of specific, evidenced claims on each side.
 */
function bullsBearsCard(a, r, nar) {
  const bulls = nar?.sections?.bulls?.length ? nar.sections.bulls : (a.rewards || []);
  const bears = nar?.sections?.bears?.length ? nar.sections.bears : (a.risks || []);

  const side = (title, items, kind, empty) => el('div', { class: `rsrside is-${kind}` }, [
    el('p', { class: 'rsrside__t', text: title }),
    items.length
      ? el('ul', { class: 'rsrbul' }, items.map((t) => el('li', { text: t })))
      : el('p', { class: 'subtle t-tiny', text: empty }),
  ]);

  return card('rsr-bullbear', [
    ohead('Bulls Say / Bears Say', null, nar?.sections?.bulls
      ? 'The case each way, written from the ranked ratios and the filed run. Three points a '
        + 'side, because a list that runs to ten is not an argument.'
      : 'The graded ratios that sit furthest above and furthest below the sector median, with the '
        + 'sentence each carries elsewhere in the report. Not a summary of the investment case — a '
        + 'list of what the numbers are strongest and weakest on.'),
    byline(a, nar),

    el('div', { class: 'rsrbb' }, [
      side('Bulls Say', bulls, 'bull', 'No ratio grades far enough above its sector median to list.'),
      side('Bears Say', bears, 'bear', 'No ratio grades far enough below its sector median to list.'),
    ]),
  ], 'ocard ovw__c12');
}

/* ---------- competitors ------------------------------------------------------ */

function competitorsCard(a, r) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const peers = a.peers.peers || [];

  if (!peers.length) {
    return card('rsr-peers', [
      ohead('Competitors'),
      feedGate(a, 'peers', 'Peer companies') || notice('No peer companies were returned.'),
    ], 'ocard ovw__c12');
  }

  const rows = [
    { ...f, self: true, pe: f.pe, score: a.peers.self?.score ?? null,
      scoredOn: a.peers.self?.scoredOn ?? null },
    ...peers,
  ];

  /* The peer rows carry a symbol, a name, a market cap and the P/E app.js
     folds in — everything else on this table has to come from the raw
     `ratios-ttm` row fetched per peer, which is the only place a peer's book
     value or yield exists. Absent for a peer whose ratios request failed,
     which prints as n/a rather than being filled from the sector. */
  const ratioOf = (sym) => (sym === f.symbol ? a.ds.get('ratiosTtm') : a.peerRatios?.[sym]) || null;

  const body = rows.map((p) => {
    const rt = ratioOf(p.symbol);
    const pb = rt?.priceToBookRatioTTM ?? null;
    const dy = rt?.dividendYieldTTM ?? null;
    return [
      el('span', { class: p.self ? 'rsrself' : '', text: p.name || p.symbol }),
      p.symbol || '—',
      isNum(p.marketCap) ? money(p.marketCap, { currency: cur }) : 'n/a',
      isNum(p.pe) ? mult(p.pe) : 'n/a',
      isNum(pb) ? mult(pb) : 'n/a',
      isNum(dy) ? pct(dy) : 'n/a',
      // The ratio count is not decoration: this score is computed over the
      // ratios every peer has in common, which for a company measured against
      // a mixed peer set can be a handful of valuation lines. A 5-ratio score
      // and a 40-ratio score are not the same measurement.
      el('span', { class: 'ideascore' }, [
        el('b', { text: isNum(p.score) ? dec(p.score, 2) : 'n/a' }),
        isNum(p.scoredOn) && p.scoredOn > 0 ? el('i', { text: `on ${p.scoredOn}` }) : null,
      ]),
    ];
  });

  return card('rsr-peers', [
    ohead('Competitors', null,
      'The vendor’s peer list. The composite column is scored only on the ratios every row has '
      + 'in common, so it is a like-for-like comparison between these companies and will not tie '
      + `to the ${gradedCount(a)}-ratio grade at the top of this page.`),

    table([
      { label: 'Company' }, { label: 'Ticker' }, { label: 'Market Cap', num: true },
      { label: 'P/E', num: true }, { label: 'P/B', num: true },
      { label: 'Dividend Yield', num: true }, { label: 'Composite', num: true },
    ], body),

    isNum(a.peers.self?.score) && a.peers.self.score !== a.scores.overall?.score
      ? el('p', { class: 't-tiny subtle mt2', text: `${f.symbol} scores `
          + `${dec(a.peers.self.score, 2)} in this column against ${dec(a.scores.overall?.score, 2)} `
          + 'at the top of the page. Both are right: the column grades it on the ratios shared '
          + 'with these peers, the headline grades it on every ratio the report could fill. Where '
          + 'the shared set is mostly valuation lines, a company that is expensive and excellent '
          + 'will score low here and high there.' })
      : null,

    el('p', { class: 't-tiny subtle mt2', text: 'Morningstar’s equivalent table carries a fair '
      + 'value and a star rating for every peer, because an analyst covers each one. Producing '
      + 'those here would mean running all thirteen valuation models against every peer — a '
      + 'request per peer per feed — so the peer columns stay factual.' }),
  ], 'ocard ovw__c12');
}

/* ---------- moat --------------------------------------------------------------- */

function moatCard(a, r, nar) {
  const m = r.moat;
  const rows = (a.series.rows || []).filter((x) => isNum(x.spread));

  return card('rsr-moat', [
    ohead('Economic Moat', el('span', {
      class: `pill pill--${m.key === 'wide' ? 'good' : m.key === 'narrow' ? 'gold' : m.key === 'none' ? 'muted' : 'muted'}`,
      text: m.label,
    }), 'Return on invested capital against the weighted average cost of capital, year by year. '
      + 'A moat is a forecast; this is the record it would be forecast from.'),
    byline(a, nar),

    ...prose(nar, 'moat', moatProse(a, r)),

    rows.length
      ? el('div', { class: 'mt2' }, [
          el('p', { class: 'osub', text: 'Return on invested capital against its cost' }),
          table(
            [{ label: 'Year' }, { label: 'ROIC', num: true }, { label: 'WACC', num: true },
             { label: 'Spread', num: true }, { label: '', num: false }],
            rows.map((x) => [
              String(x.year),
              pct(x.roic), pct(x.wacc),
              el('span', { class: x.spread >= 0 ? 'pos' : 'neg', text: pct(x.spread, { sign: true }) }),
              el('span', { class: 't-tiny subtle', text: x.spread >= 0 ? 'earns its cost' : 'below cost' }),
            ]),
          ),
          el('p', { class: 't-tiny subtle mt2', text: 'The cost of equity leg is CAPM on today’s '
            + 'beta and today’s rates, because neither is published per historical year — so the '
            + 'hurdle is "what this mix would cost at today’s prices", not what it cost at the '
            + 'time. The mix, the tax rate and the cost of debt are each year’s own.' }),
        ])
      : null,
  ], 'ocard ovw__c12');
}

/* ---------- fair value --------------------------------------------------------- */

function fairValueCard(a, r, nav, nar) {
  const cur = curSymbol(a.facts.currency);

  return card('rsr-fv', [
    ohead('Fair Value and Profit Drivers',
      isNum(r.fve.value) ? el('span', { class: 'pill pill--gold', text: price(r.fve.value, cur) }) : null,
      'The median of every valuation model that produced a number, with the range they span.'),
    byline(a, nar),

    ...prose(nar, 'fairValue', fairValueProse(a, r)),

    r.fve.models.length
      ? el('div', { class: 'mt2' }, [
          el('p', { class: 'osub', text: `The ${r.fve.count} models behind the estimate` }),
          table(
            [{ label: 'Model' }, { label: 'Family' }, { label: 'Fair value', num: true },
             { label: 'vs price', num: true }],
            r.fve.models.map((m) => {
              const gap = isNum(a.facts.price) && a.facts.price > 0 ? m.value / a.facts.price - 1 : null;
              return [
                m.full || m.label,
                m.family === 'dcf' ? 'Discounted cash flow' : 'Relative multiple',
                price(m.value, cur),
                el('span', { class: isNum(gap) ? (gap >= 0 ? 'pos' : 'neg') : '',
                  text: isNum(gap) ? pct(gap, { sign: true }) : 'n/a' }),
              ];
            }),
          ),
        ])
      : null,

    nav.openFactor
      ? el('button', {
          type: 'button', class: 'btn btn--ghost mt2',
          onclick: () => nav.openFactor('valuation'),
          text: 'Open the Valuation factor →',
        })
      : null,
  ], 'ocard ovw__c12');
}

/* ---------- risk ---------------------------------------------------------------- */

function riskCard(a, r, nar) {
  const u = r.unc;

  return card('rsr-risk', [
    ohead('Risk and Uncertainty', el('span', {
      class: `pill pill--${!u.key ? 'muted' : u.key === 'low' ? 'good' : u.key === 'medium' ? 'gold' : 'bad'}`,
      text: u.label,
    }), 'Six measurable drivers of how wide the range of plausible values is. The rating is the '
      + 'mean of the ones that could be measured, so a missing input does not read as certainty.'),
    byline(a, nar),

    ...prose(nar, 'risk', riskProse(a, r)),

    el('div', { class: 'mt2' }, [
      el('p', { class: 'osub', text: 'What the rating is built from' }),
      table(
        [{ label: 'Driver' }, { label: 'Reading', num: true }, { label: 'Contribution' }, { label: 'What it measures' }],
        u.drivers.map((d) => [
          d.label,
          isNum(d.value) ? d.fmt(d.value) : 'n/a',
          el('span', {
            class: `rsrdot is-${d.points === 0 ? 'lo' : d.points === 1 ? 'mid' : d.points === 2 ? 'hi' : 'na'}`,
            text: d.points === 0 ? 'Contained' : d.points === 1 ? 'Moderate' : d.points === 2 ? 'Wide' : 'Not measured',
          }),
          el('span', { class: 't-tiny subtle', text: d.basis }),
        ]),
      ),
    ]),

    el('div', { class: 'mt2' }, [
      el('p', { class: 'osub', text: 'The margin of safety each rating demands' }),
      table(
        [{ label: 'Uncertainty' }, { label: 'Undervalued below', num: true }, { label: 'Overvalued above', num: true }],
        Object.entries(SAFETY_BANDS).map(([k, b]) => [
          el('span', { class: k === u.key ? 'rsrself' : '', text: b.label }),
          pct(1 - b.lo), pct(b.hi - 1),
        ]),
      ),
      el('p', { class: 't-tiny subtle mt2', text: 'A discount and a premium against the fair '
        + 'value estimate, widening as the estimate becomes less reliable. The ladder is '
        + 'Morningstar’s published margin-of-safety table, used unchanged — it is a sensible '
        + 'scale and there is no reason to invent another. What differs is how the row is '
        + 'chosen: theirs from an analyst’s scenario analysis, this one from the six drivers '
        + 'above. These bands set the valuation zone only. They do not touch the quant rating.' }),
    ]),
  ], 'ocard ovw__c12');
}

/* ---------- capital allocation ---------------------------------------------------- */

function capitalCard(a, r, nar) {
  const c = r.capital;

  return card('rsr-capital', [
    ohead('Capital Allocation', el('span', {
      class: `pill pill--${!c.key ? 'muted' : c.key === 'exemplary' ? 'good' : c.key === 'poor' ? 'bad' : 'neutral'}`,
      text: c.label,
    }), 'The three legs Morningstar names — balance sheet, investment, shareholder distributions — '
      + 'each scored from figures already in this report.'),
    byline(a, nar),

    ...prose(nar, 'capital', capitalProse(a, r)),

    el('div', { class: 'mt2' }, [
      table(
        [{ label: 'Leg' }, { label: 'Assessment' }, { label: 'On what' }],
        c.legs.map((l) => [
          l.label,
          el('span', {
            class: `rsrdot is-${l.points === 2 ? 'lo' : l.points === 1 ? 'mid' : l.points === 0 ? 'hi' : 'na'}`,
            text: l.verdict,
          }),
          el('span', { class: 't-tiny subtle', text: l.detail || 'not measured' }),
        ]),
      ),
    ]),
  ], 'ocard ovw__c12');
}

/* ---------- financials ------------------------------------------------------------ */

/**
 * The filed years beside the forecast ones, in the shape the source reports
 * use: one row per line item, one column per year, actuals and estimates in
 * the same table with the boundary marked.
 */
function financialsCard(a, r) {
  const rows = (a.series.rows || []).slice(-5);
  const fc = (a.forecast.rows || []).filter((x) => isNum(x.year) && x.year > (rows.at(-1)?.year ?? 0)).slice(0, 3);
  const cur = curSymbol(a.facts.currency);

  if (!rows.length) {
    return card('rsr-fin', [
      ohead('Financials'),
      feedGate(a, 'income', 'Annual financial statements')
        || notice('No annual statements were returned.'),
    ], 'ocard ovw__c12');
  }

  const headers = [
    { label: '' },
    ...rows.map((x) => ({ label: String(x.year), num: true })),
    ...fc.map((x) => ({ label: `${x.year}E`, num: true })),
  ];

  const line = (label, pick, fmt, fcPick = null) => [
    label,
    ...rows.map((x) => fmt(pick(x))),
    ...fc.map((x) => (fcPick ? fmt(fcPick(x)) : el('span', { class: 'subtle', text: '—' }))),
  ];

  const m = (v) => (isNum(v) ? money(v, { currency: cur }) : 'n/a');
  const p = (v) => (isNum(v) ? pct(v) : 'n/a');
  const e = (v) => (isNum(v) ? price(v, cur) : 'n/a');

  const growthRow = [
    'Revenue growth %',
    ...rows.map((x, i) => {
      const prev = rows[i - 1];
      const g = (prev && prev.revenue > 0) ? x.revenue / prev.revenue - 1 : null;
      return el('span', { class: isNum(g) ? (g >= 0 ? 'pos' : 'neg') : '',
        text: isNum(g) ? pct(g, { sign: true }) : 'n/a' });
    }),
    ...fc.map((x, i) => {
      const prev = i > 0 ? fc[i - 1] : rows.at(-1);
      const g = (prev && prev.revenue > 0 && isNum(x.revenue)) ? x.revenue / prev.revenue - 1 : null;
      return el('span', { class: isNum(g) ? (g >= 0 ? 'pos' : 'neg') : '',
        text: isNum(g) ? pct(g, { sign: true }) : 'n/a' });
    }),
  ];

  return card('rsr-fin', [
    ohead('Financials', null,
      'Annual, as filed, with the consensus years marked E. The report’s trailing-twelve ratios '
      + 'will not tie to the last filed column.'),

    table(headers, [
      line('Revenue', (x) => x.revenue, m, (x) => x.revenue),
      growthRow,
      line('Gross profit', (x) => x.grossProfit, m),
      line('Operating income', (x) => x.ebit, m, (x) => x.ebit),
      line('Operating margin %', (x) => x.operatingMargin, p),
      line('EBITDA', (x) => x.ebitda, m, (x) => x.ebitda),
      line('Net income', (x) => x.netIncome, m, (x) => x.netIncome),
      line('Net margin %', (x) => x.netMargin, p),
      line('EPS (diluted)', (x) => x.eps, e, (x) => x.eps),
      line('Free cash flow', (x) => x.fcf, m),
      line('Return on invested capital %', (x) => x.roic, p),
      line('Return on equity %', (x) => x.roe, p),
      line('Debt / equity', (x) => x.debtToEquity, (v) => (isNum(v) ? dec(v, 2) : 'n/a')),
    ]),

    el('p', { class: 't-tiny subtle mt2', text: fc.length
      ? `Estimate columns are the consensus from ${a.forecast.analystCount || 'the'} contributing `
        + 'analysts, used as filed. The vendor’s outer years wobble as coverage thins; they are '
        + 'not smoothed here, on purpose.'
      : 'No consensus estimates were returned, so every column is a filed year.' }),
  ], 'ocard ovw__c12');
}

/* ---------- methodology ------------------------------------------------------------ */

function methodologyCard(a, r, nar) {
  return card('rsr-method', [
    ohead('Research Methodology'),

    el('p', { class: 'fgroup__desc', text: 'This report follows the layout and the section order '
      + 'of a Morningstar equity analyst report because that is a good structure for the '
      + 'argument. What sits inside the sections is arrived at differently, and the difference '
      + 'is worth being explicit about.' }),

    table([{ label: 'Element' }, { label: 'How a house like Morningstar arrives at it' }, { label: 'How this report does' }], [
      ['The headline rating',
        'A star rating: the analyst’s price against the analyst’s own fair value, with a margin '
        + 'of safety that widens as their uncertainty rating rises.',
        `The Vanlior quant rating. ${r.quant.graded} ratios ranked as percentiles against the `
        + 'sector, averaged into five factor scores and then across them. Price multiples count, '
        + 'inside the Valuation factor; no fair value estimate does. It answers a different '
        + 'question from a star rating — how the company ranks against peers, not whether it is '
        + 'below intrinsic value.'],
      ['Fair value estimate',
        'One discounted cash flow, built and maintained by a named analyst who sets the revenue, '
        + 'margin and terminal assumptions.',
        `The median of ${r.fve.count || 'up to thirteen'} models — six DCFs, six relative multiples `
        + 'and the vendor’s levered DCF — run on consensus estimates. No assumption is set by hand, '
        + 'and it feeds the valuation zone only, never the rating.'],
      ['Uncertainty rating',
        'An analyst’s scenario analysis of the business, expressed as the interquartile range of '
        + 'possible intrinsic values.',
        'Six measured drivers — model spread, volatility, beta, leverage, margin variability and '
        + 'consensus dispersion — averaged. Catches a volatile, geared, hard-to-forecast company; '
        + 'misses a contingent risk not yet in the numbers.'],
      ['Economic moat',
        'A forecast that excess returns on capital persist ten years (narrow) or twenty (wide), '
        + 'reasoned from a named source of advantage.',
        'A measurement of how many of the last ten filed years earned more on capital than that '
        + 'capital cost. Backward-looking by construction, and it names no source of advantage.'],
      ['Capital allocation',
        'An analyst’s assessment of the balance sheet, investment record and distribution policy, '
        + 'including judgement on management.',
        'The same three legs, each scored from filed figures. No assessment of management is made '
        + 'or implied.'],
      ['The narrative',
        'Written by a named analyst who follows the company and signs the note.',
        nar
          ? `Written by ${nar.model} from a brief of pre-computed figures, under instructions to `
            + 'quote them verbatim and invent nothing. The model was given numbers and asked for '
            + 'prose; it was never asked for a number. No person reviewed it before publication.'
          : 'Assembled from the numbers on this page. Every sentence is built from a figure shown '
            + 'here, and a sentence whose inputs are missing is not written.'],
    ]),

    notice('<b>This is not investment advice.</b> The ratings are arithmetic over filed accounts '
      + 'and vendor consensus, and each is reproducible from the table beside it — which is the '
      + 'one thing this report can offer that a signed analyst note cannot. What it cannot offer '
      + 'in return is the analyst’s judgement: no one here has met the management, read the '
      + 'contracts, or formed a view the numbers do not already contain.'),

    nar
      ? notice('The prose on this page was <b>written by a language model</b>, not by a person, '
        + 'and was not reviewed by one. It is constrained to the figures in the tables and '
        + 'instructed to add no facts of its own, and the sections are rejected rather than shown '
        + 'if they come back malformed — but a model that follows those instructions perfectly is '
        + 'still summarising, and a summary can mislead by emphasis without stating anything '
        + 'false. Where the prose and the tables disagree, the tables are right.')
      : null,

    a.sectorTable && a.sectorTable.quality === 'seed'
      ? notice('The sector distributions behind the <b>quant rating</b> are <b>modelled, not '
        + 'measured</b> — see the sector-statistics builder. The rating, its factor scores and the '
        + 'ranked ratios all inherit that. The fair value, the uncertainty rating and the moat '
        + 'rating do not: none of them touches the sector table.', 'notice--error')
      : null,

    promptTools(a, r),
  ], 'ocard ovw__c12');
}

/**
 * The developer's way in.
 *
 * The exact payload `narrative.js` would POST to a narrative service, for
 * this company, copyable. It is here rather than in a README because the
 * brief is built from live analysis and changes with the ticker: a developer
 * wiring up a model wants the real thing for a real company, not a sample.
 *
 * `buildPrompt` makes no network call, so this reveals nothing and costs
 * nothing. What comes back from a model has to satisfy `NARRATIVE_SCHEMA` or
 * `validate()` drops it.
 */
function promptTools(a, r) {
  const status = el('span', { class: 't-tiny subtle' });

  const copy = el('button', {
    type: 'button', class: 'btn btn--ghost',
    text: 'Copy the model prompt for this company',
    onclick: async () => {
      const payload = JSON.stringify(buildPrompt(a, r), null, 2);
      try {
        await navigator.clipboard.writeText(payload);
        status.textContent = `Copied — ${Math.round(payload.length / 1024)}KB of JSON.`;
      } catch {
        // Clipboard access can be refused outright. Hand over a file instead
        // rather than reporting a failure the reader cannot act on.
        const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
        const link = el('a', { href: url, download: `${a.facts.symbol}-narrative-prompt.json` });
        link.click();
        URL.revokeObjectURL(url);
        status.textContent = 'Clipboard refused — downloaded instead.';
      }
    },
  });

  return el('div', { class: 'rsrdev' }, [
    el('p', { class: 'osub', text: 'For the developer' }),
    el('p', { class: 't-tiny subtle', text: 'The narrative is loaded by '
      + '`assets/js/narrative.js`, which tries a configured endpoint first, then the bundled '
      + '`assets/data/research.json`, then falls back to the generated prose. To make it live, '
      + 'stand up a service that accepts the payload below, forwards `system` and `user` to a '
      + 'model, and returns `{ sections: … }`; then set '
      + '`localStorage["mazvantage.narrative.endpoint"]` to its URL. The key stays on your '
      + 'server — the browser never holds one.' }),
    el('div', { class: 'rsrdev__row' }, [copy, status]),
  ]);
}
