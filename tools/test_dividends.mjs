// Offline checks over the dividend module — no network, no DOM, no key.
//
//   node tools/test_dividends.mjs
//
// What is worth testing here is not the arithmetic of any one line; it is the
// handful of rules in MAZ_DIVIDEND_SPEC_FULL.md that produce a *plausible*
// wrong answer when they break. A payout ratio silently clamped at 100%, a
// special dividend read as a cut, an NM line imputed to a median, a weight
// typed wrong — none of those throw. They just quietly score companies wrong.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const { DIV_FACTORS, DIV_LINES, DIV_LINE_COUNT, DIV_BUILDABLE } =
  await import('../assets/js/dividend-lines.js');
const { splitPayments, dividendInputs } = await import('../assets/js/dividend-model.js');
const { scoreDividends, gradeLine, composeFactor, dividendLookup, dividendLetter, scoreFromPercentile } =
  await import('../assets/js/dividend-score.js');

const stats = load('assets/data/dividend-stats.json');

let count = 0;
const test = (name, fn) => { fn(); count += 1; console.log(`ok ${count} - ${name}`); };

/** A dataset stub: the snapshot's feeds, with overrides. */
const dataset = (feeds, facts = {}) => ({
  ds: { get: (n) => (n in feeds ? feeds[n] : null), symbol: facts.symbol || 'TEST' },
  facts: { symbol: 'TEST', name: 'Test Co', sector: 'Technology', price: 100, ...facts },
});

/** A quarterly dividend record going back `years`, growing at `growth` a year. */
function record(years, { start = 0.20, growth = 0.08, from = Date.UTC(2026, 7, 10) } = {}) {
  const rows = [];
  for (let q = 0; q < years * 4; q++) {
    const d = new Date(from);
    d.setUTCMonth(d.getUTCMonth() - q * 3);
    rows.push({
      date: d.toISOString().slice(0, 10),
      dividend: start * (1 + growth) ** ((years * 4 - 1 - q) / 4),
      adjDividend: start * (1 + growth) ** ((years * 4 - 1 - q) / 4),
      frequency: 'Quarterly',
    });
  }
  return rows;
}

/* ========================================================================== */

test('every factor’s weights sum to 100, and the four factors are the spec’s', () => {
  assert.deepEqual(DIV_FACTORS.map((f) => f.key), ['safety', 'growth', 'yield', 'consistency']);
  // Safety counts double in the spec's composite weighting.
  assert.deepEqual(DIV_FACTORS.map((f) => f.weight), [2, 1, 1, 1]);
  for (const f of DIV_FACTORS) {
    const sum = DIV_LINES[f.key].reduce((a, l) => a + l.weight, 0);
    assert.equal(Math.round(sum * 10) / 10, 100, `${f.key} weights sum to ${sum}, not 100`);
  }
  // The spec is 64 lines across the four factors.
  assert.equal(DIV_LINE_COUNT, 64);
  assert.deepEqual(DIV_LINES.safety.length, 27);
  assert.deepEqual(DIV_LINES.growth.length, 15);
  assert.deepEqual(DIV_LINES.yield.length, 12);
  assert.deepEqual(DIV_LINES.consistency.length, 10);
});

test('every buildable line has a distribution in every sector', () => {
  const buildable = Object.values(DIV_LINES).flat().filter((l) => !l.na);
  assert.equal(buildable.length, DIV_BUILDABLE);
  for (const sector of Object.keys(stats.sectors)) {
    for (const line of buildable) {
      const d = stats.sectors[sector].lines[line.id];
      assert.ok(d && Array.isArray(d.p) && d.p.length === 21,
        `${sector} has no distribution for ${line.id}`);
      // Ascending, or percentileOf cannot place a value in it.
      for (let i = 1; i < d.p.length; i++) {
        assert.ok(d.p[i] >= d.p[i - 1], `${sector}/${line.id} breakpoints go backwards at ${i}`);
      }
    }
    for (const f of DIV_FACTORS) {
      assert.ok(Array.isArray(stats.sectors[sector].composites[f.key]),
        `${sector} has no composite spread for ${f.key}`);
    }
  }
  // The table is payers only; the spec's universe rule depends on it.
  assert.equal(stats.universe.payersOnly, true);
});

test('a line that cannot be built reports NM with a reason and is never computed', () => {
  const na = Object.values(DIV_LINES).flat().filter((l) => l.na);
  // The three genuine impossibles, plus the ones this data source cannot reach.
  assert.ok(na.length >= 3);
  for (const l of na) {
    assert.ok(typeof l.na === 'string' && l.na.length > 40, `${l.id} has no reason`);
    assert.equal(typeof l.get, 'undefined', `${l.id} is NM but still has a getter`);
    const graded = gradeLine(l, {}, dividendLookup(stats, 'Technology'));
    assert.equal(graded.state, 'nm');
    assert.equal(graded.score, null);
    assert.equal(graded.pctile, null);
  }
  // The pension line is weighted zero, per the spec.
  assert.equal(DIV_LINES.safety.find((l) => l.id === 'pensionFunded').weight, 0);
});

test('NM lines are dropped and the surviving weights renormalise to one', () => {
  const lines = [
    { state: 'ok', pctile: 1.0, weight: 30 },
    { state: 'ok', pctile: 0.0, weight: 30 },
    { state: 'nm', pctile: null, weight: 40 },
  ];
  const { composite, coverage, used, designed } = composeFactor(lines);
  // The two survivors are equally weighted, so the composite is their mean —
  // the dropped 40 is renormalised away rather than scored as a zero.
  assert.equal(composite, 0.5);
  assert.equal(used, 60);
  assert.equal(designed, 100);
  assert.equal(coverage, 0.6);

  // Nothing survives: a null composite, never a zero.
  const dead = composeFactor([{ state: 'nm', pctile: null, weight: 100 }]);
  assert.equal(dead.composite, null);
  assert.equal(dead.coverage, 0);
});

test('a payout ratio above 100% is kept, ranks badly, and is never clamped', () => {
  const lookup = dividendLookup(stats, 'Technology');
  const line = DIV_LINES.safety.find((l) => l.id === 'cashDividendPayoutTtm');
  const at = (paid, fcf) => gradeLine(line, {
    dividendsPaidTtm: paid, fcfTtm: fcf,
    over: (a, b) => (b > 0 ? a / b : null),
  }, lookup);

  const covered = at(30, 100);        // 30% of free cash flow
  const stretched = at(140, 100);     // 140% — paying more than it earns in cash
  assert.equal(covered.state, 'ok');
  assert.equal(stretched.state, 'ok', 'an over-100% payout must rank, not report NM');
  assert.ok(stretched.value > 1, `value was clamped to ${stretched.value}`);
  assert.ok(stretched.score < covered.score,
    `140% payout scored ${stretched.score}, not worse than 30% at ${covered.score}`);
  // Direction: lower is better on a payout line.
  assert.equal(line.better, 'low');

  // A negative denominator is not a good payout ratio, it is no ratio.
  assert.equal(at(30, -100).state, 'missing');
});

test('special dividends are split out of the record, by label and by size', () => {
  const rows = [
    ...record(3),
    { date: '2025-01-15', dividend: 10.0, adjDividend: 10.0, frequency: 'Quarterly' },  // outsized
    { date: '2024-06-15', dividend: 0.30, adjDividend: 0.30, frequency: 'Special' },    // labelled
  ];
  const { regular, specials } = splitPayments(rows);
  assert.equal(specials.length, 2, 'both the labelled and the outsized payment are specials');
  assert.ok(specials.some((s) => s.amount === 10.0));
  assert.ok(specials.some((s) => s.frequency === 'Special'));
  assert.ok(!regular.some((r) => r.amount === 10.0), 'an outsized payment stayed in the regular record');
  assert.equal(regular.length, 12);
});

test('a special dividend does not make the following year read as a cut', () => {
  const clean = dataset({ dividends: record(6) });
  const withSpecial = dataset({
    dividends: [...record(6), { date: '2023-06-15', dividend: 9.0, adjDividend: 9.0, frequency: 'Quarterly' }],
  });
  const cuts = (a) => {
    const x = dividendInputs(a);
    const line = DIV_LINES.consistency.find((l) => l.id === 'cuts10y');
    return line.get(x);
  };
  // Without the filter the year after a 9.00 special would show a fall, and
  // this company has never cut.
  assert.equal(cuts(clean), 0);
  assert.equal(cuts(withSpecial), 0, 'a one-off payment was read as a cut the next year');
});

test('the consistency lines read a steady riser correctly', () => {
  const x = dividendInputs(dataset({ dividends: record(8, { growth: 0.10 }) }));
  const line = (id) => DIV_LINES.consistency.find((l) => l.id === id).get(x);

  assert.ok(x.byYear.length >= 6, `only ${x.byYear.length} complete years`);
  assert.equal(line('cuts10y'), 0);
  assert.equal(line('consecutiveGrowthYears'), x.byYear.length - 1);
  assert.equal(line('increaseFrequency10y'), 1);
  assert.equal(line('specialReliance5y'), 0);
  // Never cut, so "years since last cut" is the whole record.
  assert.equal(line('yearsSinceLastCut'), x.byYear.at(-1).year - x.byYear[0].year);
  assert.ok(line('paymentRegularity') > 0.9);
  // A perfectly steady 10% riser has near-zero spread in its growth rates.
  assert.ok(line('dpsGrowthStability5y') < 0.02);
});

test('a short record reports NM rather than a confident streak of one', () => {
  const x = dividendInputs(dataset({ dividends: record(1) }));
  for (const id of ['consecutiveGrowthYears', 'uninterruptedYears', 'cuts10y', 'longestNoCutStreak']) {
    assert.equal(DIV_LINES.consistency.find((l) => l.id === id).get(x), null,
      `${id} produced a figure from under three years of history`);
  }
});

test('a truncated first year is dropped, so a long CAGR is not measured off a part-year', () => {
  // The feed returns a fixed number of rows, so its window opens mid-year: the
  // oldest bucket holds one payment, not four. Apple's real record does exactly
  // this, and using that quarter as the base of a ten-year CAGR reported 23% a
  // year for a dividend growing about seven.
  const full = record(11, { growth: 0.07 });
  const truncated = full.slice(0, full.length - 3);   // oldest year keeps 1 of 4
  const x = dividendInputs(dataset({ dividends: truncated }));

  const oldest = x.byYear[0];
  assert.equal(oldest.payments, 4, `the oldest kept year has ${oldest.payments} payments, not a full four`);

  // Every surviving year is a full one, so a CAGR off any of them is real.
  const five = DIV_LINES.growth.find((l) => l.id === 'dividendGrowth5y').get(x);
  assert.ok(five > 0.05 && five < 0.09, `5Y CAGR came out at ${five}, not near the 7% the record grows at`);

  // And a base year that was trimmed away reports nothing rather than guessing.
  const deep = dividendInputs(dataset({ dividends: record(4) }));
  assert.equal(DIV_LINES.growth.find((l) => l.id === 'dividendGrowth10y').get(deep), null);
});

test('the forward rate is the declared payment annualised, and a lapsed payer is flagged', () => {
  const live = dividendInputs(dataset({ dividends: record(5) }));
  assert.equal(live.freq, 4);
  // Four quarterly payments at the latest rate.
  assert.ok(Math.abs(live.dpsFwd - live.regular[0].amount * 4) < 1e-9);
  assert.equal(live.lapsed, false);

  // Last payment two years ago: more than two expected intervals.
  const stale = dividendInputs(dataset({
    dividends: record(5, { from: Date.UTC(2024, 7, 10) }),
  }));
  assert.equal(stale.lapsed, true, 'a payer that stopped paying was not flagged as lapsing');
  assert.equal(stale.pays, true, 'a lapsing payer is flagged, not removed from the universe');
});

test('a non-payer is excluded from the universe, not scored last in it', () => {
  const r = scoreDividends(dataset({ dividends: [] }), stats);
  assert.equal(r.pays, false);
  assert.deepEqual(r.factors, {});
  assert.ok(r.why.includes('outside the dividend universe'));
  // And no score of any kind was invented for it.
  assert.equal(r.score, undefined);
  assert.equal(r.overall, undefined);
});

test('there is no total dividend score anywhere in the result', () => {
  const snap = load('assets/data/AAPL.json');
  const r = scoreDividends(dataset(snap.feeds, {
    symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', price: snap.feeds.quote.price,
  }), stats);
  assert.equal(r.pays, true);
  for (const key of ['overall', 'total', 'score', 'composite', 'grade']) {
    assert.equal(r[key], undefined, `the result carries a top-level "${key}"`);
  }
  // Four composites, and every one of them on the 1-5 scale.
  assert.deepEqual(r.order, ['safety', 'growth', 'yield', 'consistency']);
  for (const k of r.order) {
    const f = r.factors[k];
    assert.ok(f.score >= 1 && f.score <= 5, `${k} scored ${f.score}, outside 1-5`);
    assert.ok(f.letter, `${k} has no letter`);
    assert.ok(f.coverage > 0.5, `${k} only covered ${f.coverage} of its designed weight`);
  }
});

test('Apple reads as the spec describes it: strong safety, weak yield', () => {
  const snap = load('assets/data/AAPL.json');
  const r = scoreDividends(dataset(snap.feeds, {
    symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', price: snap.feeds.quote.price,
  }), stats);

  const safety = r.factors.safety.score;
  const yld = r.factors.yield.score;
  // "elite safety, mediocre growth, poor yield — a fortress dividend that is
  // simply too small relative to the share price."
  assert.ok(safety > yld + 0.5,
    `safety ${safety.toFixed(2)} should sit well above yield ${yld.toFixed(2)}`);

  // The payout lines are the ones the spec calibrates; Apple's are tiny.
  const payout = r.factors.safety.lines.find((l) => l.id === 'cashDividendPayoutTtm');
  assert.equal(payout.state, 'ok');
  assert.ok(payout.value > 0.05 && payout.value < 0.30,
    `cash payout ratio was ${payout.value}, outside the range the spec anchors near 12.6%`);

  // And the forward yield is well under one per cent.
  const yfwd = r.factors.yield.lines.find((l) => l.id === 'dividendYieldFwd');
  assert.equal(yfwd.state, 'ok');
  assert.ok(yfwd.value > 0 && yfwd.value < 0.01, `forward yield was ${yfwd.value}`);
});

test('the scale maps percentiles to 1-5 and the letters sit the right way up', () => {
  assert.equal(scoreFromPercentile(0), 1);
  assert.equal(scoreFromPercentile(1), 5);
  assert.equal(scoreFromPercentile(0.5), 3);
  assert.equal(scoreFromPercentile(null), null);
  assert.equal(dividendLetter(5), 'A+');
  assert.equal(dividendLetter(3), 'C+');
  assert.equal(dividendLetter(1), 'F');
  // The bands descend, so a higher score never earns a worse letter.
  const letters = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1].map(dividendLetter);
  assert.equal(new Set(letters).size, letters.length, 'two scores share a letter band');
});

console.log(`\nPassed ${count} dividend checks: weights, the payer universe, the special-dividend `
  + `filter, NM renormalisation, the over-100% payout rule, and the four composites with no total.`);
