/* ==========================================================================
   Vanlior — hand-captured disclosures

   Six of the eleven Alpha Signal categories have gaps no FMP endpoint fills.
   Where a primary source publishes the fact for free, it is read by hand into
   `assets/data/alpha-disclosures.json` and turned into signals here.

   ---------------------------------------------------------------------------
   Why this is allowed to exist, and what keeps it honest
   ---------------------------------------------------------------------------

   The precedent is `assets/data/summaries.json`: earnings-call summaries read
   from the transcript by hand, each printing its byline, because the app ships
   no model. This is the same trade one level down — the app ships no scraper,
   so a fact that needs a human to read a filing says so and carries the link.

   Four rules make it a capture rather than a fabrication, and all four are
   enforced in code below rather than promised in a comment:

     1. **Every signal carries the real source URL.** Not a constructed one —
        the SEC document, the Google Patents query, the Apple IR page. A reader
        can open it and check the number. `signal()` already refuses a claim
        with no source; these are the only signals in the engine whose source
        has a URL a reader can actually click.

     2. **The capture date travels with the signal** and is what freshness is
        measured from. A hand capture from six months ago is weighted as a
        six-month-old fact, exactly like a filing would be.

     3. **A symbol with no entry gets nothing.** No defaulting, no borrowing a
        sector average, no carrying a figure over from another company. The
        gap is reported exactly as it was before this file existed.

     4. **An absence is recorded as an absence.** Apple does not disclose
        backlog — the word appears zero times in its FY2025 10-K — and that is
        captured as a *measured absence in a primary source*, which is a
        different and more useful thing than "no provider connected".

   ---------------------------------------------------------------------------
   The intended end state
   ---------------------------------------------------------------------------

   This file is scaffolding. Each block below is shaped like what a real
   provider would return, so replacing the JSON with an integration is a
   change of loader and nothing else. `tools/capture/README.md` records the
   source and query behind every field so each can be re-read.
   ========================================================================== */

import { isNum, mean, sum } from './util.js';
import { signal, unavailableSignal, source, bandScore, statusFor } from './alpha-signals.js';

/* ==========================================================================
   Loading
   ========================================================================== */

let discPromise = null;

/** Fetch the capture file once per page load. */
export function loadDisclosures(url = 'assets/data/alpha-disclosures.json') {
  discPromise ??= fetch(url, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return discPromise;
}

/** Only for tests, which need a clean slate between cases. */
export function _resetDisclosures(value = null) {
  discPromise = value === null ? null : Promise.resolve(value);
}

export const disclosuresFor = (all, symbol) =>
  (all && symbol && all[String(symbol).toUpperCase()]) || null;

/* ==========================================================================
   Shared source construction
   ========================================================================== */

/**
 * Turn a captured source block into a real source record.
 *
 * The URL is passed straight through — these are read from the page they name,
 * so the link is the one the number came from rather than one assembled from a
 * template. That is the whole reason a hand capture is worth more than a
 * guessed API path.
 */
function capturedSource(block, capturedAt, key) {
  const src = block?.source;
  if (!src) return null;
  return source({
    id: `capture:${key}`,
    type: src.type,
    publisher: src.publisher,
    title: src.title,
    url: src.url || null,
    publicationDate: src.publicationDate || capturedAt,
    retrievedAt: `${capturedAt}T00:00:00.000Z`,
  });
}

/** The sentence appended to every captured signal's limitations. */
const CAPTURE_NOTE = (capturedAt) => 'Read by hand from the linked source on '
  + `${capturedAt} and frozen there — this is a capture, not a feed, so it does not update `
  + 'until somebody re-reads it. Freshness weighting already discounts it from that date.';

const pctText = (v) => (isNum(v) ? `${(v * 100).toFixed(1)}%` : 'n/a');

/* ==========================================================================
   1. Consensus estimate revisions  →  `revisions`
   ========================================================================== */

/**
 * The measurement FMP does not publish: where consensus EPS sat 30, 60 and 90
 * days ago, and how many analysts moved which way.
 *
 * Two signals, because they answer different questions. The **drift** is where
 * the number went; the **breadth** is how many analysts moved. A consensus can
 * drift up because one optimist replaced one pessimist, and breadth is what
 * distinguishes that from a broad mark-up.
 *
 * Both read the forward-year periods only. The current quarter is excluded on
 * purpose: it is the most heavily revised and the least informative, because
 * analysts converge on guidance in the last weeks before a print and that
 * convergence reads as momentum when it is really just the calendar.
 */
export function estimateRevisionSignals(disc, ctx) {
  const block = disc?.estimateRevisions;
  const periods = (block?.periods || []).filter((p) => /year/i.test(p.label));
  if (!periods.length) return [];

  const src = capturedSource(block, disc.capturedAt, 'estimateRevisions');
  if (!src) return [];

  const out = [];

  /* ---- drift: consensus now against consensus 90 days ago ---- */
  const drifts = periods
    .filter((p) => isNum(p.current) && isNum(p.d90) && p.d90 !== 0)
    .map((p) => ({ label: p.label, now: p.current, then: p.d90, change: (p.current - p.d90) / Math.abs(p.d90) }));

  if (drifts.length) {
    const avg = mean(drifts.map((d) => d.change));
    const score = bandScore(avg, { mid: 0, span: 0.05 });
    out.push(signal({
      category: 'revisions',
      name: 'EPS consensus drift, 90 days',
      symbol: ctx.symbol,
      status: statusFor(score),
      score,
      raw: drifts[0].now,
      previous: drifts[0].then,
      change: avg,
      unit: 'EPS',
      sourceRef: src,
      sourceDate: disc.capturedAt,
      dataQuality: 'estimated',
      confidence: 'high',
      calculation: `Consensus EPS now against the same consensus 90 days ago, averaged across `
        + `the ${drifts.length} forward fiscal years. `
        + drifts.map((d) => `${d.label}: ${d.then} → ${d.now} (${pctText(d.change)})`).join('; ')
        + `. Mean drift ${pctText(avg)}; the full scale is ±5%. The current quarter is excluded `
        + 'because analysts converge on guidance before a print, and that convergence reads as '
        + 'momentum when it is only the calendar.',
      historical: periods.map((p) => `${p.label}: 90d ${p.d90} · 60d ${p.d60} · 30d ${p.d30} · now ${p.current}`).join(' — '),
      interpretation: avg > 0
        ? 'Consensus earnings expectations have been marked up over the quarter.'
        : 'Consensus earnings expectations have been marked down over the quarter.',
      limitations: 'Consensus composition changes between the two dates, so part of any move is '
        + 'a change in who is contributing rather than a change of mind. '
        + CAPTURE_NOTE(disc.capturedAt),
    }));
  }

  /* ---- breadth: how many analysts moved, and which way ---- */
  const ups = sum(periods.map((p) => p.up30).filter(isNum));
  const downs = sum(periods.map((p) => p.down30).filter(isNum));
  if (ups + downs > 0) {
    const breadth = (ups - downs) / (ups + downs);
    const score = bandScore(breadth, { mid: 0, span: 0.5 });
    out.push(signal({
      category: 'revisions',
      name: 'EPS revision breadth, 30 days',
      symbol: ctx.symbol,
      status: statusFor(score),
      score,
      raw: ups,
      previous: downs,
      change: breadth,
      unit: 'analysts',
      sourceRef: src,
      sourceDate: disc.capturedAt,
      dataQuality: 'estimated',
      confidence: 'high',
      calculation: `${ups} upward and ${downs} downward EPS revisions across the forward fiscal `
        + `years in the last 30 days. Breadth is (up − down) ÷ (up + down) = ${breadth.toFixed(3)}; `
        + 'the full scale is ±0.50. '
        + periods.map((p) => `${p.label}: ${p.up30}↑/${p.down30}↓`).join('; ') + '.',
      interpretation: breadth > 0
        ? 'More analysts raised their numbers than cut them.'
        : 'More analysts cut their numbers than raised them.',
      limitations: 'Counts analysts, not conviction or size of change: a one-cent trim and a '
        + 'wholesale downgrade each count once. ' + CAPTURE_NOTE(disc.capturedAt),
    }));
  }

  return out;
}

/* ==========================================================================
   2. Backlog and the nearest disclosed measure  →  `commercial`
   ========================================================================== */

/**
 * Two signals where there used to be one gap.
 *
 * The first is the **measured absence**: this company does not disclose
 * backlog, established by reading its annual report rather than by failing to
 * find a feed. That is worth stating plainly, because "we could not get the
 * data" and "the company does not publish it" are different facts about the
 * world and only one of them is the reader's problem.
 *
 * The second is the nearest thing the company *does* publish. For a filer
 * under ASC 606 that is deferred revenue, which is a contract liability and
 * not an order book — scored, but with the difference stated rather than
 * quietly treated as a backlog proxy.
 */
export function backlogSignals(disc, ctx) {
  const block = disc?.backlog;
  if (!block) return [];
  const src = capturedSource(block, disc.capturedAt, 'backlog');
  if (!src) return [];

  const out = [];

  out.push(signal({
    category: 'commercial',
    name: 'Backlog disclosure',
    symbol: ctx.symbol,
    status: 'neutral',
    score: null,
    raw: block.disclosed ? 'Disclosed' : 'Not disclosed',
    previous: null,
    change: null,
    unit: null,
    sourceRef: src,
    sourceDate: src.publicationDate,
    dataQuality: 'verified',
    confidence: 'high',
    calculation: `The word "backlog" appears ${block.mentions} times in the annual report linked `
      + 'above. This is a reading of a primary source, not a failed lookup.',
    interpretation: block.disclosed
      ? 'The company discloses a backlog figure.'
      : 'The company does not disclose backlog, so there is no figure for this engine to omit.',
    limitations: 'Deliberately unscored: the absence of a disclosure is neither good nor bad '
      + 'news about the business. It is here so the category reports a fact rather than a gap. '
      + CAPTURE_NOTE(disc.capturedAt),
  }));

  const near = block.nearestDisclosed;
  if (near && isNum(near.current) && isNum(near.previous) && near.previous !== 0) {
    const g = (near.current - near.previous) / near.previous;
    const score = bandScore(g, { mid: 0, span: 0.20 });
    out.push(signal({
      category: 'commercial',
      name: `${near.name} growth`,
      symbol: ctx.symbol,
      status: statusFor(score),
      score,
      raw: near.current,
      previous: near.previous,
      change: g,
      unit: 'currency',
      sourceRef: src,
      sourceDate: src.publicationDate,
      dataQuality: 'verified',
      confidence: 'medium',
      calculation: `As filed: "${near.quote}" That is ${pctText(g)} year on year, against a full `
        + `scale of ±20%. ${near.realisation || ''}`.trim(),
      historical: near.why || null,
      interpretation: g > 0
        ? `${near.name} grew year on year — more revenue is contracted and not yet recognised.`
        : `${near.name} fell year on year.`,
      limitations: `${near.name} is a contract liability under the revenue standard, not an order `
        + 'book. It moves with the mix of services and bundled warranties as much as with demand, '
        + 'and it is not a substitute for the backlog figure this category would prefer. '
        + CAPTURE_NOTE(disc.capturedAt),
    }));
  }

  return out;
}

/* ==========================================================================
   3. Patents and launches  →  `product`
   ========================================================================== */

/**
 * Granted patents, compared between two **settled** windows only.
 *
 * The trap this avoids is the obvious one: a trailing-twelve-month patent
 * count always looks like a collapse, because patents publish months after
 * grant and the index lags further behind that. Comparing the newest window
 * with anything produces a large fake decline.
 *
 * So the capture marks each window `settled`, the comparison uses the two that
 * are, and the unsettled one is reported as a count with no reading attached.
 */
export function patentSignals(disc, ctx) {
  const block = disc?.patents;
  const windows = block?.windows || [];
  const settled = windows.filter((w) => w.settled && isNum(w.count));
  if (settled.length < 2) return [];

  const src = capturedSource(block, disc.capturedAt, 'patents');
  if (!src) return [];

  const [now, prior] = settled;
  const g = prior.count !== 0 ? (now.count - prior.count) / prior.count : null;
  if (!isNum(g)) return [];

  const partial = windows.find((w) => !w.settled);
  const score = bandScore(g, { mid: 0, span: 0.25 });

  return [signal({
    category: 'product',
    name: 'Granted patent output',
    symbol: ctx.symbol,
    status: statusFor(score),
    score,
    raw: now.count,
    previous: prior.count,
    change: g,
    unit: 'patents',
    sourceRef: src,
    sourceDate: now.to,
    dataQuality: 'verified',
    confidence: 'medium',
    calculation: `${now.count.toLocaleString('en-US')} granted US patents published between `
      + `${now.from} and ${now.to}, against ${prior.count.toLocaleString('en-US')} in the `
      + `12 months before that — ${pctText(g)}, on a full scale of ±25%. `
      + (partial
        ? `The most recent window (${partial.from} to ${partial.to}) shows `
          + `${partial.count.toLocaleString('en-US')} and is deliberately NOT used: patents `
          + 'publish months after grant, so the newest window always undercounts and comparing '
          + 'it would manufacture a decline.'
        : ''),
    historical: windows.map((w) => `${w.from}→${w.to}: ${w.count.toLocaleString('en-US')}`
      + (w.settled ? '' : ' (incomplete)')).join(' · '),
    interpretation: g > 0
      ? 'Granted patent output rose between the two settled years.'
      : 'Granted patent output fell between the two settled years.',
    limitations: 'Patent counts measure filing and prosecution activity from several years ago, '
      + 'not current research, and they say nothing about the value of what was granted. '
      + 'Non-US family members are excluded so one invention is not counted ten times. '
      + CAPTURE_NOTE(disc.capturedAt),
  })];
}

/**
 * How often the company shipped something, from its own newsroom.
 *
 * Counts dated announcements in a 30-day window. Deliberately does not read
 * them: classifying "major" from a headline is exactly the judgement this
 * engine has no basis for, so the signal measures cadence and says so.
 */
export function launchSignals(disc, ctx) {
  const block = disc?.launches;
  const events = (block?.events || []).filter((e) => e.date);
  if (!events.length) return [];

  const src = capturedSource(block, disc.capturedAt, 'launches');
  if (!src) return [];

  const anchor = new Date(disc.capturedAt);
  const within = (days) => events.filter((e) => {
    const d = new Date(e.date);
    return !Number.isNaN(d.getTime()) && (anchor - d) / 864e5 <= days && d <= anchor;
  });

  const recent = within(30);
  const products = recent.filter((e) => e.kind === 'product').length;
  // Three or more shipped products in a month is the top of the scale. Set
  // from what a launch cadence looks like, not fitted to anything.
  const score = bandScore(products, { mid: 1, span: 2 });

  return [signal({
    category: 'product',
    name: 'Product launch cadence',
    symbol: ctx.symbol,
    status: statusFor(score),
    score,
    raw: products,
    previous: null,
    change: null,
    unit: 'launches per 30 days',
    sourceRef: src,
    sourceDate: recent[0]?.date || disc.capturedAt,
    dataQuality: 'verified',
    confidence: 'medium',
    calculation: `${products} dated product announcement${products === 1 ? '' : 's'} in the 30 `
      + `days to ${disc.capturedAt}, out of ${recent.length} company announcements of any kind. `
      + 'One a month sits at the midpoint; three or more saturates the scale.',
    historical: recent.slice(0, 6).map((e) => `${e.date} — ${e.title}`).join(' · '),
    interpretation: products > 1
      ? 'Shipping more often than a once-a-month cadence.'
      : 'Shipping at or below a once-a-month cadence.',
    limitations: 'Counts announcements, does not read them. A launch is not revenue, cadence is '
      + 'seasonal — hardware companies cluster launches in autumn — and this window may sit on a '
      + 'peak or a trough for that reason alone. ' + CAPTURE_NOTE(disc.capturedAt),
  })];
}

/* ==========================================================================
   4. Corporate actions  →  `catalysts`
   ========================================================================== */

/**
 * The most recent dividend decision, and whether it was a raise.
 *
 * A raise is a board decision about future cash, which is one of the few
 * genuinely forward-looking things a company publishes. It is scored modestly:
 * a dividend increase is evidence of confidence, not evidence of growth, and
 * a company can raise into a decline for a long time.
 */
export function corporateActionSignals(disc, ctx) {
  const block = disc?.corporateActions;
  const divs = (block?.dividends || []).filter((d) => d.declared && isNum(d.amount));
  if (divs.length < 2) return [];

  const src = capturedSource(block, disc.capturedAt, 'corporateActions');
  if (!src) return [];

  const sorted = divs.slice().sort((a, b) => new Date(b.declared) - new Date(a.declared));
  const latest = sorted[0];
  // The last declaration at a different amount — the raise, whenever it was.
  const priorDifferent = sorted.find((d) => d.amount !== latest.amount);
  if (!priorDifferent) return [];

  const g = (latest.amount - priorDifferent.amount) / priorDifferent.amount;
  const raisedOn = sorted.filter((d) => d.amount === latest.amount).slice(-1)[0];
  const score = bandScore(g, { mid: 0, span: 0.15 });

  return [signal({
    category: 'catalysts',
    name: 'Dividend action',
    symbol: ctx.symbol,
    status: statusFor(score),
    score,
    raw: latest.amount,
    previous: priorDifferent.amount,
    change: g,
    unit: 'per share',
    sourceRef: src,
    sourceDate: raisedOn?.declared || latest.declared,
    dataQuality: 'verified',
    confidence: 'high',
    calculation: `The quarterly dividend moved from ${priorDifferent.amount} to ${latest.amount} `
      + `per share — ${pctText(g)} — first declared at the new rate on `
      + `${raisedOn?.declared || latest.declared}. The most recent declaration is `
      + `${latest.declared}, payable ${latest.payable}. The full scale is ±15%.`,
    historical: sorted.slice(0, 6).map((d) => `${d.declared}: ${d.amount}`).join(' · '),
    interpretation: g > 0
      ? 'The board raised the dividend, which is a decision about future cash.'
      : 'The board cut the dividend.',
    limitations: 'A dividend decision is evidence of board confidence, not of growth. Companies '
      + 'raise into declines for years, and a small routine annual increase carries far less '
      + 'information than its percentage suggests. ' + CAPTURE_NOTE(disc.capturedAt),
  })];
}

/* ==========================================================================
   5. Search interest  →  `attention`
   ========================================================================== */

/**
 * Recent search interest against its own year.
 *
 * Inverted like the rest of the attention category: **less** attention scores
 * higher, because the category measures how much room there is for attention
 * to arrive. This is the one signal in the engine most likely to be misread as
 * a popularity score, so the interpretation says which direction is which.
 *
 * The index is relative to its own peak week and is not comparable between
 * companies — which is why it is read as a ratio against its own average
 * rather than as a level.
 */
export function searchInterestSignals(disc, ctx) {
  const block = disc?.searchInterest;
  const weekly = (block?.weekly || []).filter((w) => Array.isArray(w) && isNum(w[1]));
  if (weekly.length < 12) return [];

  const src = capturedSource(block, disc.capturedAt, 'searchInterest');
  if (!src) return [];

  const values = weekly.map((w) => w[1]);
  const recent = values.slice(-4);
  const recentMean = mean(recent);
  const yearMean = mean(values);
  if (!isNum(recentMean) || !isNum(yearMean) || yearMean === 0) return [];

  const ratio = recentMean / yearMean;
  // Inverted: below its own average is "room for attention", which this
  // category treats as the positive direction.
  const score = bandScore(ratio, { mid: 1, span: 0.5, invert: true });

  return [signal({
    category: 'attention',
    name: 'Search interest versus its own year',
    symbol: ctx.symbol,
    status: statusFor(score),
    score,
    raw: Math.round(recentMean * 10) / 10,
    previous: Math.round(yearMean * 10) / 10,
    change: ratio - 1,
    unit: 'index',
    sourceRef: src,
    sourceDate: weekly[weekly.length - 1][0],
    dataQuality: 'attention',
    confidence: 'medium',
    calculation: `Mean search interest over the last four weeks (${recentMean.toFixed(1)}) against `
      + `the mean of all ${values.length} weeks in the window (${yearMean.toFixed(1)}) — a ratio `
      + `of ${ratio.toFixed(2)}. Scored inverted: **below** its own average scores higher, `
      + 'because this category measures how much room there is for attention to arrive, not how '
      + `popular the company is. Term "${block.term}", geography ${block.geo}.`,
    historical: `Peak week ${weekly.find((w) => w[1] === Math.max(...values))?.[0]} at 100; `
      + `trough ${weekly.find((w) => w[1] === Math.min(...values))?.[0]} at ${Math.min(...values)}.`,
    interpretation: ratio < 1
      ? 'Searched less than its own 12-month average — retail attention has cooled.'
      : 'Searched more than its own 12-month average — retail attention has picked up.',
    limitations: 'Attention data, never evidence about the business. The index is relative to '
      + 'this series\' own peak week and is not comparable between companies or between windows. '
      + 'Ticker searches also spike on news of any kind, good or bad. '
      + CAPTURE_NOTE(disc.capturedAt),
  })];
}

/* ==========================================================================
   6. Job postings — captured as unavailable, with the reason
   ========================================================================== */

/**
 * The one gap the capture could not close, recorded with what was tried.
 *
 * Worth keeping as a first-class entry rather than silently leaving the
 * generic gap in place: "the official source caps its count and does not move
 * with the filter" is a specific, checkable finding about the source, and it
 * tells whoever picks this up next not to spend the afternoon on it again.
 */
export function jobPostingSignals(disc, ctx) {
  const block = disc?.jobPostings;
  if (!block || block.available) return [];
  return [unavailableSignal({
    category: 'hiring',
    name: 'Job posting growth by function',
    symbol: ctx.symbol,
    provider: block.wouldNeed || 'A job-postings provider',
    note: `${block.reason} Source checked: ${block.source?.url || 'the company careers page'} `
      + `on ${disc.capturedAt}.`,
  })];
}

/* ==========================================================================
   Residual gaps — what the capture still does not cover
   ========================================================================== */

/**
 * The narrowed gap a capture leaves behind.
 *
 * The feed provider's product gap reads "Product launches, approvals and
 * patents". Once launches and patents are captured, leaving that sentence up
 * would overstate what is missing, and suppressing it silently would
 * understate it — regulatory approvals really are still absent. So the broad
 * gap is superseded and this narrower one replaces it.
 */
export function residualGapSignals(disc, ctx) {
  const out = [];

  if (disc?.patents || disc?.launches) {
    out.push(unavailableSignal({
      category: 'product',
      name: 'Regulatory approvals and clearances',
      symbol: ctx.symbol,
      provider: 'A regulatory-decision feed (FDA, FCC, EMA or sector equivalent)',
      note: 'Patents and dated product launches are captured for this company; approvals are '
        + 'not. They matter far more in some sectors than others — a medical-device clearance '
        + 'is a catalyst, an FCC filing usually is not — and no single feed covers the range.',
    }));
  }

  /* The catalysts gap, narrowed to what the capture did *not* reach.
     Dividend declarations are captured, so the original sentence would now
     name something the page is already showing. Buybacks are called out
     specifically: the authorisation is an 8-K and a board vote, which is a
     different disclosure from the repurchase line in the cash flow statement
     that the fundamentals already read. */
  if (disc?.corporateActions) {
    out.push(unavailableSignal({
      category: 'catalysts',
      name: 'Investor days, buyback authorisations and strategic reviews',
      symbol: ctx.symbol,
      provider: 'A corporate-events calendar, plus 8-K event parsing',
      note: 'Dividend declarations are captured for this company from its own investor '
        + 'relations page. What is still missing is everything announced as prose in an 8-K '
        + 'rather than published as a dated, typed event: investor days, buyback '
        + 'authorisations, spin-offs, strategic reviews and regulatory decision dates.',
    }));
  }

  return out;
}

/* ==========================================================================
   The run
   ========================================================================== */

/** Every captured signal for one symbol. Empty when there is no entry. */
export function disclosureSignals(disc, ctx) {
  if (!disc) return [];
  const builders = [
    estimateRevisionSignals, backlogSignals, patentSignals, launchSignals,
    corporateActionSignals, searchInterestSignals, jobPostingSignals, residualGapSignals,
  ];
  const out = [];
  for (const build of builders) {
    try {
      out.push(...(build(disc, ctx) || []).filter(Boolean));
    } catch (err) {
      // Same rule the feed providers follow: one bad block costs its own
      // signal, never the page.
      console.warn('alpha capture block failed', build.name, err);
    }
  }
  return out;
}
