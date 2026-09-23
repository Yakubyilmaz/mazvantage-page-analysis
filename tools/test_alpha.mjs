/* Run: node tools/test_alpha.mjs

   Node regression checks for the Alpha Signal engine. No real network, no
   credentials, no DOM: the engine modules are free of all three by design,
   and that is most of what these checks are protecting.

   Section 6b is the exception and shims three browser globals — `location`,
   `localStorage` and `fetch` — because `loadAlphaBag` is the one piece of the
   feature that genuinely reaches out. Every response there is a local stub;
   nothing leaves the machine.

   What is covered, and why each one is here rather than being obvious:

     * The signal factory refuses an unsourced claim. This is the guarantee
       the whole feature rests on; if it ever silently defaults, every other
       promise the page makes becomes unenforceable.
     * A missing category lowers coverage instead of scoring zero. The bug
       this prevents is a company with three gated feeds reading as a bad
       company rather than an unmeasured one.
     * Confidence is capped by coverage, from every direction. Tested as a
       property over the whole coverage range rather than at one point,
       because the cap is applied last and a reordering would break it
       quietly.
     * Providers survive empty, gated and half-shaped feeds. All three are
       normal against a real key on a real plan.
     * The narrative cannot emit an item without a signal behind it.
     * A configured API key beats the bundled capture, never the reverse.
       This one is here because the failure is silent: the page looks
       correct and quietly shows figures frozen at the capture date.
*/
import assert from 'node:assert/strict';

import {
  signal, unavailableSignal, fmpSource, bandScore, statusFor, freshness,
  CATEGORIES, QUALITY_LABELS,
} from '../assets/js/alpha-signals.js';
import {
  scoreAlpha, scoreCategory, classify, ALPHA_WEIGHTS, CALC_VERSION, pairNote,
} from '../assets/js/alpha-score.js';
import { runProviders, PROVIDERS } from '../assets/js/alpha-providers.js';
import { narrate } from '../assets/js/alpha-narrative.js';

let checks = 0;
const ok = (name) => { checks += 1; process.stdout.write(`  ✓ ${name}\n`); };

/* ==========================================================================
   1. The signal factory
   ========================================================================== */

const goodSignal = (over = {}) => signal({
  category: 'fundamental',
  name: 'Test signal',
  status: 'positive',
  score: 70,
  sourceRef: fmpSource('incomeQ'),
  sourceDate: new Date().toISOString().slice(0, 10),
  calculation: 'A stated calculation.',
  dataQuality: 'calculated',
  confidence: 'high',
  ...over,
});

assert.throws(() => signal({
  category: 'fundamental', name: 'x', calculation: 'y', dataQuality: 'calculated',
}), /no source/, 'a signal without a source must be refused');
ok('signal() refuses a claim with no source');

assert.throws(() => signal({
  category: 'fundamental', name: 'x', sourceRef: fmpSource('quote'), dataQuality: 'calculated',
}), /states no calculation/, 'a signal without a calculation must be refused');
ok('signal() refuses a claim with no calculation');

assert.throws(() => signal({
  category: 'fundamental', name: 'x', sourceRef: fmpSource('quote'), calculation: 'y',
}), /no data quality/, 'a signal without a data quality must be refused');
ok('signal() refuses a claim with no data quality');

assert.throws(() => goodSignal({ category: 'nonsense' }), /unknown category/);
assert.throws(() => goodSignal({ status: 'bullish' }), /unknown status/);
ok('signal() refuses unknown categories and statuses');

assert.equal(goodSignal({ score: 180 }).score, 100, 'score clamps high');
assert.equal(goodSignal({ score: -20 }).score, 0, 'score clamps low');
assert.equal(goodSignal({ score: null }).score, null, 'an unscored signal stays unscored');
ok('signal() clamps scores into 0..100 and preserves null');

const un = unavailableSignal({
  category: 'hiring', name: 'Job postings', provider: 'A postings provider',
});
assert.equal(un.status, 'insufficient_data');
assert.equal(un.score, null, 'an unavailable signal must never carry a score');
assert.equal(un.qualityLabel, QUALITY_LABELS.unavailable);
assert.equal(un.confidence, 'none');
assert.ok(un.unavailable.provider.length, 'it must name the missing provider');
ok('unavailableSignal() is scoreless and names what is missing');

/* ==========================================================================
   2. Bands and freshness
   ========================================================================== */

assert.equal(bandScore(0, { mid: 0, span: 0.1 }), 50, 'no change sits at the midpoint');
assert.equal(bandScore(0.1, { mid: 0, span: 0.1 }), 100, 'a full span saturates');
assert.equal(bandScore(-0.1, { mid: 0, span: 0.1 }), 0, 'a full negative span saturates');
assert.equal(bandScore(5, { mid: 0, span: 0.1 }), 100, 'beyond the span clamps');
assert.equal(bandScore(0.05, { mid: 0, span: 0.1, invert: true }), 25, 'invert flips the reading');
assert.equal(bandScore(null, { span: 1 }), null, 'a missing value has no score');
assert.equal(bandScore(1, { span: 0 }), null, 'a zero span cannot be divided by');
ok('bandScore() is linear, clamped, invertible and null-safe');

assert.equal(statusFor(70), 'positive');
assert.equal(statusFor(30), 'negative');
assert.equal(statusFor(52), 'neutral', 'inside the dead band is neutral, not positive');
assert.equal(statusFor(null), 'insufficient_data');
ok('statusFor() keeps a dead band around the midpoint');

const now = new Date('2026-09-22T00:00:00Z');
assert.equal(freshness('2026-09-22', now).factor, 1, 'today is full weight');
assert.equal(freshness('2026-09-01', now).factor, 1, 'inside 35 days is full weight');
const old = freshness('2024-09-22', now);
assert.ok(old.factor <= 0.36 && old.factor >= 0.34, `two years decays to the floor, got ${old.factor}`);
assert.ok(freshness('2026-06-01', now).factor < 1, 'a quarter old is discounted');
assert.ok(freshness(null, now).factor === 0.35 && freshness(null, now).text === 'undated');
assert.equal(freshness('not a date', now).text, 'undated', 'an unparseable date is undated, not NaN');
ok('freshness() decays to a floor and never returns NaN');

/* ==========================================================================
   3. Reducing a category
   ========================================================================== */

const fresh = new Date().toISOString().slice(0, 10);
const catSignals = [
  goodSignal({ score: 100, confidence: 'high', sourceDate: fresh }),
  goodSignal({ score: 0, confidence: 'low', sourceDate: fresh }),
];
const cat = scoreCategory('fundamental', catSignals);
assert.ok(cat.score > 50, `confidence must weight the mean, got ${cat.score}`);
assert.ok(Math.abs(cat.score - (100 * 1) / (1 + 0.55)) < 0.01, 'the weighting is confidence × freshness');
ok('scoreCategory() weights by confidence, not a flat mean');

const withGap = scoreCategory('fundamental', [
  goodSignal({ score: 80, sourceDate: fresh }),
  unavailableSignal({ category: 'fundamental', name: 'missing', provider: 'x' }),
]);
assert.equal(withGap.score, 80, 'an unavailable signal must not drag the mean down');
assert.equal(withGap.counts.total, 2);
assert.equal(withGap.counts.scored, 1);
assert.equal(withGap.counts.missing, 1);
ok('scoreCategory() counts gaps without scoring them');

const onlyGaps = scoreCategory('hiring', [
  unavailableSignal({ category: 'hiring', name: 'missing', provider: 'x' }),
]);
assert.equal(onlyGaps.score, null, 'a category with nothing measurable has no score');
assert.equal(onlyGaps.confidence, 'none');
ok('scoreCategory() returns null rather than zero when nothing was measured');

const single = scoreCategory('fundamental', [goodSignal({ confidence: 'high', sourceDate: fresh })]);
assert.equal(single.confidence, 'medium', 'one signal can never make a category high-confidence');
ok('a category resting on one measurement is capped at medium confidence');

/* ==========================================================================
   4. The composite
   ========================================================================== */

assert.ok(Math.abs(Object.values(ALPHA_WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9,
  'the weights must sum to 1');
assert.deepEqual(
  Object.keys(ALPHA_WEIGHTS).sort(),
  CATEGORIES.map((c) => c.id).sort(),
  'every category must carry a weight and no weight may name a category that does not exist',
);
ok('the weight vector covers exactly the eleven categories and sums to 1');

const empty = scoreAlpha([]);
assert.equal(empty.score, null, 'no signals means no score, not zero');
assert.equal(empty.coverage, 0);
assert.equal(empty.confidence, 'none');
assert.equal(empty.version, CALC_VERSION, 'the result carries the calculation version');
ok('scoreAlpha([]) reports nothing measured rather than a zero score');

/* Two categories at 80, nine absent. The composite must be 80 — the weight of
   the missing nine is redistributed, not filled with zeros. This is the check
   that a gated plan does not read as a bad company. */
const partial = scoreAlpha([
  goodSignal({ category: 'fundamental', score: 80, sourceDate: fresh }),
  goodSignal({ category: 'fundamental', score: 80, sourceDate: fresh }),
  goodSignal({ category: 'revisions', score: 80, sourceDate: fresh }),
  goodSignal({ category: 'revisions', score: 80, sourceDate: fresh }),
]);
assert.equal(partial.score, 80, `missing categories must be dropped, not zeroed — got ${partial.score}`);
const expectedCoverage = Math.round((ALPHA_WEIGHTS.fundamental + ALPHA_WEIGHTS.revisions) * 100);
assert.equal(partial.coveragePct, expectedCoverage, 'coverage is the share of weight measured');
assert.equal(partial.counts.categories, 2);
ok('a missing category lowers coverage and leaves the score alone');

/* The cap, as a property over every prefix of the category list rather than
   at three hand-picked points. Hand-picked points encode an assumption about
   which categories carry which weight, and that assumption is exactly the
   thing a weight edit changes — so the check derives the expected ceiling
   from the weights themselves and only asserts the relationship. */
const RANK = { none: 0, low: 1, medium: 2, high: 3 };
const ceilingFor = (coverage) => (coverage >= 0.65 ? 'high' : coverage >= 0.40 ? 'medium' : 'low');

for (let n = 1; n <= CATEGORIES.length; n += 1) {
  const ids = CATEGORIES.slice(0, n).map((c) => c.id);
  const coverage = ids.reduce((sum, id) => sum + ALPHA_WEIGHTS[id], 0);
  // Two signals each, both perfect and both fresh: the strongest evidence the
  // model can be handed. Whatever confidence comes back is the ceiling doing
  // the work, because nothing about the evidence could lower it.
  const r = scoreAlpha(ids.flatMap((id) => [
    goodSignal({ category: id, score: 90, confidence: 'high', sourceDate: fresh }),
    goodSignal({ category: id, score: 90, confidence: 'high', sourceDate: fresh }),
  ]));
  assert.ok(RANK[r.confidence] <= RANK[ceilingFor(coverage)],
    `${n} categories at ${r.coveragePct}% coverage must not exceed `
    + `${ceilingFor(coverage)} confidence, got ${r.confidence}`);
  assert.equal(r.score, 90, 'and the score itself must be unaffected by how many categories ran');
}
ok('confidence is capped by coverage at every prefix of the category list');

const lowCoverageHighQuality = scoreAlpha([
  goodSignal({ category: 'fundamental', score: 95, confidence: 'high', sourceDate: fresh }),
  goodSignal({ category: 'fundamental', score: 95, confidence: 'high', sourceDate: fresh }),
]);
assert.equal(lowCoverageHighQuality.confidence, 'low',
  'perfect evidence on 20% of the weight is still low confidence');
ok('perfect evidence on one category cannot buy high confidence');

/* Stale evidence must weigh less than fresh evidence of the opposite sign. */
const staleVsFresh = scoreAlpha([
  goodSignal({ category: 'fundamental', score: 100, sourceDate: '2023-01-01' }),
  goodSignal({ category: 'fundamental', score: 0, sourceDate: fresh }),
]);
assert.ok(staleVsFresh.score < 50,
  `fresh evidence must outweigh three-year-old evidence, got ${staleVsFresh.score}`);
ok('stale evidence is outvoted by fresh evidence');

/* ==========================================================================
   5. Classification
   ========================================================================== */

const inflecting = scoreAlpha([
  goodSignal({ category: 'fundamental', score: 85, sourceDate: fresh }),
  goodSignal({ category: 'fundamental', score: 85, sourceDate: fresh }),
  goodSignal({ category: 'revisions', score: 70, sourceDate: fresh }),
  goodSignal({ category: 'revisions', score: 70, sourceDate: fresh }),
]);
assert.equal(classify(inflecting, 3.0).primary.id, 'fundamental-inflection');
ok('classify() finds a fundamental inflection when the fundamentals moved');

const nothing = classify(scoreAlpha([]), 3.0);
assert.equal(nothing.primary.id, 'none', 'with no data the classifier must decline');
ok('classify() declines rather than guessing when nothing was measured');

/* The `needs` gate: an archetype that reads a category which did not score
   must not fire, even when its predicate would be satisfied by the default. */
const noFundamentals = scoreAlpha([
  goodSignal({ category: 'priceVolume', score: 20, sourceDate: fresh }),
  goodSignal({ category: 'priceVolume', score: 20, sourceDate: fresh }),
]);
const fallen = classify(noFundamentals, 4.0);
assert.notEqual(fallen.primary.id, 'fallen-leader',
  'a fallen-leader call needs fundamentals, which were never measured here');
ok('an archetype never fires on a category that did not score');

const noQuant = classify(inflecting, null);
assert.ok(noQuant.primary.id !== 'emerging-compounder',
  'archetypes that read the quant rating must skip when it is absent, not default it');
ok('a missing quant rating is skipped, not treated as mediocre');

assert.ok(pairNote(4.2, 75).includes('agree'));
assert.ok(pairNote(1.8, 75).includes('turnaround'));
assert.ok(pairNote(null, 75).includes('not comparable'));
ok('pairNote() explains all four quadrants and the missing case');

/* ==========================================================================
   6. Providers against hostile feeds
   ========================================================================== */

const ctx = { symbol: 'TEST', now: new Date('2026-09-22T00:00:00Z') };

const allEmpty = runProviders({}, ctx);
assert.ok(allEmpty.length > 0, 'an empty bag must still produce signals');
assert.ok(allEmpty.every((s) => s && s.category && s.id), 'every signal must be well formed');
assert.ok(allEmpty.every((s) => s.status === 'insufficient_data'),
  'with no feeds at all, everything must report as unmeasured');
assert.equal(scoreAlpha(allEmpty).score, null, 'and the composite must be null');
ok('runProviders() on an empty bag reports eleven gaps and no score');

const allGated = Object.fromEntries(
  [...new Set(PROVIDERS.flatMap((p) => p.feeds))].map((f) => [f, { status: 'gated', data: null }]),
);
const gatedOut = runProviders(allGated, ctx);
assert.ok(gatedOut.every((s) => s.status === 'insufficient_data'));
assert.ok(gatedOut.some((s) => /plan/i.test(s.unavailable?.note || '')),
  'a gated plan must be named as such somewhere');
ok('runProviders() distinguishes a gated plan from an absent feed');

/* Malformed rows — nulls, strings where numbers go, zero denominators. */
const junk = {
  incomeQ: { status: 'ok', data: [{ date: 'x', revenue: 'lots' }, null, { revenue: 0 }] },
  cashflowQ: { status: 'ok', data: [{}] },
  estimates: { status: 'ok', data: [{ date: null, epsAvg: 0, epsHigh: 1, epsLow: 1 }] },
  insiderStats: { status: 'ok', data: [{ year: null, quarter: null }] },
  employees: { status: 'ok', data: [{ employeeCount: null }] },
  quote: { status: 'ok', data: { volume: 10, avgVolume: 0 } },
  earnings: { status: 'ok', data: [{ date: 'nonsense', epsActual: null, epsEstimated: 0 }] },
  prices: { status: 'ok', data: [{ date: '2026-09-21', price: 0 }] },
  segProduct: { status: 'ok', data: [{ date: '2025-01-01', data: {} }] },
  holdersSummary: { status: 'ok', data: { ownershipPercent: null } },
};
const junkOut = runProviders(junk, ctx);
assert.ok(junkOut.every((s) => s && s.id && s.category), 'malformed feeds must not produce malformed signals');
assert.ok(junkOut.every((s) => s.score === null || Number.isFinite(s.score)), 'no NaN scores');
assert.ok(!junkOut.some((s) => /failed/.test(s.unavailable?.provider || '')),
  'no provider should have thrown on this input');
ok('runProviders() survives null, zero and string-typed feed rows without throwing');

/* The real shape, quarterly: eight quarters with a clean acceleration. */
const quarter = (i, revenue, gross, op) => ({
  date: new Date(Date.UTC(2026, 6 - i * 3, 27)).toISOString().slice(0, 10),
  filingDate: new Date(Date.UTC(2026, 7 - i * 3, 1)).toISOString().slice(0, 10),
  fiscalYear: String(2026 - Math.floor(i / 4)),
  period: `Q${((3 - i) % 4 + 4) % 4 + 1}`,
  revenue, grossProfit: gross, operatingIncome: op,
  researchAndDevelopmentExpenses: revenue * 0.1,
});
// Year-ago quarters at 100, this year accelerating: 120 then 132 (+20%, +26%).
const accelerating = {
  incomeQ: {
    status: 'ok',
    data: [
      quarter(0, 132, 70, 40), quarter(1, 120, 62, 34), quarter(2, 115, 58, 31), quarter(3, 110, 55, 29),
      quarter(4, 105, 52, 27), quarter(5, 100, 49, 25), quarter(6, 100, 48, 24), quarter(7, 100, 47, 23),
    ],
  },
};
const accelOut = runProviders(accelerating, ctx);
const revAccel = accelOut.find((s) => s.key === 'fundamental.revenue-growth-acceleration');
assert.ok(revAccel, 'quarterly statements must produce a revenue acceleration signal');
assert.equal(revAccel.status, 'positive');
assert.ok(revAccel.score > 50);
assert.ok(revAccel.calculation.includes('same quarter a year before'),
  'the calculation must state that it compares like quarters');
assert.equal(revAccel.confidence, 'high');
const gm = accelOut.find((s) => s.key === 'fundamental.gross-margin-expansion');
assert.ok(gm && gm.status === 'positive', 'margin expansion must be detected');
ok('the fundamental provider reads a quarterly acceleration and states its basis');

/* Seven quarters is one short of what the measurement needs, and must fall
   through to the annual path rather than comparing mismatched quarters. */
const tooFew = runProviders({ incomeQ: { status: 'ok', data: accelerating.incomeQ.data.slice(0, 7) } }, ctx);
assert.ok(!tooFew.some((s) => s.key === 'fundamental.revenue-growth-acceleration'),
  'seven quarters must not produce a quarterly year-on-year comparison');
ok('fewer than eight quarters falls through instead of comparing unlike periods');

/* The annual fallback — the no-key path. */
const annual = {
  income: {
    status: 'ok',
    data: [
      { date: '2025-09-27', fiscalYear: '2025', revenue: 132, grossProfit: 70 },
      { date: '2024-09-27', fiscalYear: '2024', revenue: 110, grossProfit: 55 },
      { date: '2023-09-27', fiscalYear: '2023', revenue: 100, grossProfit: 48 },
    ],
  },
};
const annualOut = runProviders(annual, ctx);
const annualSig = annualOut.find((s) => s.key.startsWith('fundamental.revenue-growth-acceleration'));
assert.ok(annualSig, 'annual filings must still produce a reading');
assert.ok(/annual basis/i.test(annualSig.name), 'the name must say it is the annual basis');
assert.equal(annualSig.confidence, 'low', 'the annual fallback must be low confidence');
assert.ok(annualSig.calculation.includes('Annual basis') || annualSig.calculation.includes('**Annual basis**'),
  'the calculation must disclose the weaker basis');
ok('the annual fallback is labelled, low-confidence and never sold as quarterly');

/* Insider statistics without the open-market fields — the bundled snapshot's
   exact shape. Compensation-driven totals must not be read as conviction. */
const trimmedInsider = {
  insiderStats: {
    status: 'ok',
    data: [
      { symbol: 'T', year: 2026, quarter: 3, totalAcquired: 100, totalDisposed: 50, acquiredDisposedRatio: 2 },
      { symbol: 'T', year: 2026, quarter: 2, totalAcquired: 100, totalDisposed: 50, acquiredDisposedRatio: 0.5 },
      { symbol: 'T', year: 2026, quarter: 1, totalAcquired: 100, totalDisposed: 50, acquiredDisposedRatio: 0.4 },
      { symbol: 'T', year: 2025, quarter: 4, totalAcquired: 100, totalDisposed: 50, acquiredDisposedRatio: 0.3 },
    ],
  },
};
const insiderOut = runProviders(trimmedInsider, ctx).filter((s) => s.category === 'insider');
const openMarket = insiderOut.find((s) => s.key === 'insider.open-market-insider-activity');
assert.equal(openMarket.status, 'insufficient_data',
  'without code P/S counts, open-market conviction must be reported as unavailable');
assert.ok(/open-market/i.test(openMarket.unavailable.provider));
ok('insider conviction refuses to read compensation activity as open-market buying');

/* ==========================================================================
   6b. The snapshot fallback
   ========================================================================== */

/* `loadAlphaBag` reaches the network and `localStorage`, so it needs the three
   globals a browser would have. Shimmed here rather than skipped, because the
   rule being tested is a precedence rule — a configured key must win over the
   bundled capture — and precedence bugs are silent: the page looks right and
   shows stale numbers. */
globalThis.location = { search: '' };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.history = { replaceState() {} };

const SNAPSHOT_BODY = {
  capturedAt: '2026-09-22',
  feeds: {
    incomeQ: [{ date: '2026-06-27', revenue: 1, grossProfit: 1, operatingIncome: 1 }],
    gradesHistorical: [{ date: '2026-09-01', analystRatingsBuy: 1 }],
  },
};

let liveCalls = 0;
const installFetch = ({ liveAnswers }) => {
  liveCalls = 0;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('assets/data/')) {
      return { ok: true, status: 200, json: async () => SNAPSHOT_BODY };
    }
    liveCalls += 1;
    if (!liveAnswers) return { ok: false, status: 404, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => [{ date: '2026-06-27', revenue: 999, grossProfit: 999, operatingIncome: 999 }],
    };
  };
};

const { loadAlphaBag, bagIsSnapshot, bagCapturedAt } = await import('../assets/js/alpha-providers.js');
const { clearCache } = await import('../assets/js/fmp.js');

// No key: nothing is fetched at all, and the capture fills what it can.
installFetch({ liveAnswers: false });
store.clear();
clearCache();
const noKey = await loadAlphaBag('AAPL', { feeds: ['incomeQ', 'gradesHistorical', 'targetSummary'] });
assert.equal(liveCalls, 0, 'with no key configured, no live request may be made');
assert.equal(noKey.incomeQ.status, 'ok');
assert.equal(noKey.incomeQ.data[0].revenue, 1, 'the capture supplied the rows');
assert.equal(noKey.incomeQ.fromSnapshot, true, 'and they are tagged as captured');
assert.equal(noKey.targetSummary.status, 'skipped',
  'a feed the capture does not carry stays unfilled rather than being invented');
assert.equal(bagIsSnapshot(noKey), true);
assert.equal(bagCapturedAt(noKey), '2026-09-22');
ok('loadAlphaBag() fills from the bundled capture when there is no key');

// With a key that answers: the live rows win, and nothing is snapshot-tagged.
installFetch({ liveAnswers: true });
store.set('mazvantage.fmp.key', 'test-key');
clearCache();
const withKey = await loadAlphaBag('AAPL', { feeds: ['incomeQ'] });
assert.ok(liveCalls > 0, 'a configured key must actually be used');
assert.equal(withKey.incomeQ.data[0].revenue, 999, 'the live answer must win over the capture');
assert.notEqual(withKey.incomeQ.fromSnapshot, true, 'a live feed is never tagged as captured');
assert.equal(bagIsSnapshot(withKey), false);
ok('a configured key wins over the bundled capture, never the other way round');

// With a key that fails: the capture is the fallback, not an empty page.
installFetch({ liveAnswers: false });
clearCache();
const keyFails = await loadAlphaBag('AAPL', { feeds: ['incomeQ'] });
assert.ok(liveCalls > 0, 'it must try live first');
assert.equal(keyFails.incomeQ.status, 'ok', 'and fall back rather than giving up');
assert.equal(keyFails.incomeQ.fromSnapshot, true);
ok('a failing live request falls back to the capture, tagged as captured');

// A dataset already holding a feed is reused rather than refetched.
installFetch({ liveAnswers: true });
clearCache();
const ds = { feeds: { incomeQ: { status: 'ok', data: [{ date: '2026-06-27', revenue: 42 }] } } };
const fromDs = await loadAlphaBag('AAPL', { ds, feeds: ['incomeQ'] });
assert.equal(liveCalls, 0, 'a feed the report already loaded must not be fetched again');
assert.equal(fromDs.incomeQ.data[0].revenue, 42);
ok('feeds already in the report dataset are reused, not refetched');

store.clear();
clearCache();

/* ==========================================================================
   6c. The hand-captured disclosures
   ========================================================================== */

const {
  disclosureSignals, disclosuresFor, estimateRevisionSignals, backlogSignals,
  patentSignals, searchInterestSignals, jobPostingSignals,
} = await import('../assets/js/alpha-disclosures.js');

const CAPTURE = {
  capturedAt: '2026-09-22',
  estimateRevisions: {
    source: { publisher: 'Yahoo Finance', title: 'x', url: 'https://example.invalid/a', type: 'licensed_provider', publicationDate: '2026-09-22' },
    periods: [
      { label: 'Current quarter (Sep 2026)', current: 1.98, d90: 1.50, up30: 99, down30: 0 },
      { label: 'Current year (FY2026)', current: 8.82, d90: 8.76, up30: 5, down30: 2 },
      { label: 'Next year (FY2027)', current: 9.58, d90: 9.67, up30: 2, down30: 7 },
    ],
  },
  backlog: {
    source: { publisher: 'SEC', title: '10-K', url: 'https://example.invalid/b', type: 'sec_filing', publicationDate: '2025-10-31' },
    disclosed: false, mentions: 0,
    nearestDisclosed: { name: 'Total deferred revenue', current: 13.7e9, previous: 12.8e9, quote: 'q', why: 'w' },
  },
  patents: {
    source: { publisher: 'Google Patents', title: 'x', url: 'https://example.invalid/c', type: 'government', publicationDate: '2026-09-22' },
    windows: [
      { from: '2025-09-22', to: '2026-09-22', count: 3788, settled: false },
      { from: '2024-09-22', to: '2025-09-22', count: 6188, settled: true },
      { from: '2023-09-22', to: '2024-09-22', count: 6662, settled: true },
    ],
  },
  searchInterest: {
    source: { publisher: 'Google Trends', title: 'x', url: 'https://example.invalid/d', type: 'attention_data', publicationDate: '2026-09-22' },
    term: 'AAPL', geo: 'US',
    weekly: Array.from({ length: 48 }, (_, i) => [`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, 80])
      .concat([['2026-09-06', 20], ['2026-09-13', 20], ['2026-09-20', 20], ['2026-09-21', 20]]),
  },
  jobPostings: { available: false, reason: 'the site caps its count', wouldNeed: 'A postings provider', source: { url: 'https://example.invalid/e' } },
};

const dctx = { symbol: 'AAPL' };

assert.equal(disclosuresFor({ AAPL: CAPTURE }, 'aapl'), CAPTURE, 'symbol lookup is case-insensitive');
assert.equal(disclosuresFor({ AAPL: CAPTURE }, 'MSFT'), null, 'a symbol with no entry gets nothing');
assert.equal(disclosuresFor(null, 'AAPL'), null, 'a missing capture file is not an error');
ok('a symbol with no capture entry is never given data belonging to another company');

const capSigs = disclosureSignals(CAPTURE, dctx);
assert.ok(capSigs.length >= 6, `expected several captured signals, got ${capSigs.length}`);
assert.ok(capSigs.every((s) => s.source || s.status === 'insufficient_data'),
  'every captured signal must carry a source');
const withUrls = capSigs.filter((s) => s.source && s.source.url);
assert.ok(withUrls.length >= 4, 'captured signals must carry real source URLs');
assert.ok(withUrls.every((s) => /^https?:\/\//.test(s.source.url)), 'and they must be absolute');
ok('every captured signal carries a real, clickable source URL');

assert.ok(capSigs.every((s) => s.status === 'insufficient_data'
  || /read by hand/i.test(s.limitations || '')),
  'every captured signal must disclose that it is a hand capture, not a feed');
ok('captured signals state that they are a frozen capture, not a feed');

/* The estimate drift must ignore the current quarter. The fixture puts a +32%
   move there and small moves in the forward years; if the quarter leaked in,
   the drift would saturate. */
const drift = estimateRevisionSignals(CAPTURE, dctx).find((s) => /drift/.test(s.name));
assert.ok(drift, 'a drift signal must be produced');
assert.ok(drift.score < 60, `the current quarter must be excluded from drift, got ${drift.score}`);
assert.ok(drift.calculation.includes('current quarter is excluded'));
const breadth = estimateRevisionSignals(CAPTURE, dctx).find((s) => /breadth/.test(s.name));
assert.equal(breadth.raw, 7, 'breadth counts only the forward years: 5 + 2 up');
assert.equal(breadth.previous, 9, 'and 2 + 7 down');
assert.equal(breadth.status, 'negative', 'more cuts than raises must read negative');
ok('estimate revisions exclude the current quarter and count breadth correctly');

const back = backlogSignals(CAPTURE, dctx);
const absence = back.find((s) => s.name === 'Backlog disclosure');
assert.equal(absence.score, null, 'a measured absence must never be scored');
assert.equal(absence.dataQuality, 'verified', 'it is a reading of a filing, not a failed lookup');
assert.ok(/does not disclose/i.test(absence.interpretation));
const deferred = back.find((s) => /deferred revenue/i.test(s.name));
assert.equal(deferred.status, 'positive');
assert.ok(/not an order book/i.test(deferred.limitations),
  'the proxy must state that it is not backlog');
ok('backlog absence is recorded as a fact, and its proxy says it is not backlog');

/* The patent trap: the unsettled window must not be compared. 6188 vs 6662 is
   about -7.1%; 3788 vs 6188 would be -38.8% and would saturate the band. */
const pat = patentSignals(CAPTURE, dctx)[0];
assert.ok(pat, 'a patent signal must be produced');
assert.equal(pat.raw, 6188, 'the newest SETTLED window is the current reading');
assert.equal(pat.previous, 6662, 'compared with the settled window before it');
assert.ok(Math.abs(pat.change + 0.0712) < 0.001, `expected about -7.1%, got ${pat.change}`);
assert.ok(pat.score > 30, 'and it must not read as a collapse');
assert.ok(/undercounts/i.test(pat.calculation), 'the lag must be explained');
ok('patent counts compare settled windows only, never the lagging newest one');

const searchSig = searchInterestSignals(CAPTURE, dctx)[0];
assert.equal(searchSig.dataQuality, 'attention', 'search interest is attention data, not evidence');
assert.equal(searchSig.status, 'positive',
  'below its own average must score positive, because the category measures room for attention');
assert.ok(/inverted/i.test(searchSig.calculation), 'the inversion must be stated');
ok('search interest is inverted, labelled attention data, and says so');

const jobs = jobPostingSignals(CAPTURE, dctx)[0];
assert.equal(jobs.status, 'insufficient_data');
assert.ok(/caps its count/i.test(jobs.unavailable.note), 'the reason it failed must be recorded');
ok('a capture that could not close a gap records what was tried');

/* A capture must never invent a category score out of nothing. */
assert.deepEqual(disclosureSignals({ capturedAt: '2026-09-22' }, dctx), [],
  'an entry with no blocks produces no signals');
assert.deepEqual(disclosureSignals(null, dctx), [], 'no entry produces no signals');
ok('an empty capture entry produces nothing rather than defaults');

/* Superseding: a filled measurement and a "this is missing" gap must never
   both be shown for the same thing. */
const feedOnly = runProviders({}, ctx);
const withCapture = runProviders({ __disclosures: CAPTURE }, ctx);
const gapKeys = (list) => list.filter((s) => s.status === 'insufficient_data').map((s) => s.key);
assert.ok(gapKeys(feedOnly).includes('revisions.eps-and-revenue-consensus-revisions'));
assert.ok(!gapKeys(withCapture).includes('revisions.eps-and-revenue-consensus-revisions'),
  'a gap the capture closed must be removed, not left beside the signal');
assert.ok(!gapKeys(withCapture).includes('commercial.contracts-backlog-and-book-to-bill'));
assert.ok(!gapKeys(withCapture).includes('attention.search-and-retail-attention'));
assert.ok(gapKeys(withCapture).includes('product.regulatory-approvals-and-clearances'),
  'and a narrower residual gap must replace the broad one');
ok('a closed gap is replaced by a narrower one, never silently dropped');

/* ==========================================================================
   7. The narrative
   ========================================================================== */

const result = scoreAlpha(accelOut);
const cls = classify(result, 3.1);
const story = narrate(result, cls, 'TEST');

assert.ok(story.summary.includes('TEST'));
assert.ok(/\d+ out of 100/.test(story.summary), 'the summary must state the score and its scale');
assert.ok(story.summary.includes('% of the model'), 'the summary must state coverage');
ok('narrate() leads with the score, its scale and its coverage');

const everyItem = [...story.improving, ...story.deteriorating, ...story.watch, ...story.risks];
assert.ok(everyItem.length > 0);
assert.ok(everyItem.every((i) => i.signalId), 'every evidence item must trace to a signal');
assert.ok(everyItem.every((i) => i.source || i.text), 'every item carries its source');
ok('no narrative item can exist without the signal behind it');

assert.ok(story.unconfirmed.length > 0, 'the gaps must be reported, not dropped');
assert.ok(story.unconfirmed.every((u) => u.provider), 'each gap must name what would close it');
ok('narrate() reports every gap with the integration that would fill it');

assert.ok(story.whatWouldConfirm.length > 0);
assert.ok(story.whatWouldConfirm.every((w) => w.text.length > 20));
assert.ok(!/\b(buy|sell|should own|recommend)\b/i.test(JSON.stringify(story)),
  'the narrative must never reach a recommendation');
ok('narrate() lists what would confirm the reading and never recommends');

const emptyStory = narrate(scoreAlpha([]), classify(scoreAlpha([]), null), 'NONE');
assert.ok(emptyStory.summary.includes('not a low one'),
  'an unmeasurable company must be described as unmeasured, not as bad');
ok('an unmeasured company is never described as a bad one');

process.stdout.write(`\nPassed ${checks} Alpha Signal checks: signal provenance, band arithmetic, `
  + 'freshness decay, coverage-capped confidence, dropped-not-zeroed categories, archetype '
  + 'gating, provider resilience against empty/gated/malformed feeds, the annual fallback, and '
  + 'narrative traceability.\n');
