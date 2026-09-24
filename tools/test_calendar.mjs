// Offline checks for the Calendar's pure helpers: the week, the markets, the
// one-row-per-company merge, and where an economic release is filed.
//
//   node tools/test_calendar.mjs
//
// Runs in Tokyo time on purpose. The rule most likely to break quietly is
// "a release is filed under the reader's own day", and it only shows in a
// zone far from UTC: a 23:01 UTC release is the next morning in Tokyo.
process.env.TZ = 'Asia/Tokyo';

import assert from 'node:assert/strict';

const {
  mondayOf, fromIso, marketOf, symbolRoot, dedupeEvents, economicRows, companyRows, ipoRows, big, countryName,
} = await import('../assets/js/calendar.js');

let count = 0;
const test = (name, fn) => { fn(); count += 1; console.log(`ok ${count} - ${name}`); };

test('a week starts on Monday, and a Sunday belongs to the week before it', () => {
  assert.equal(mondayOf(fromIso('2026-09-24')).toISOString().slice(0, 10), '2026-09-21');
  assert.equal(mondayOf(fromIso('2026-09-21')).toISOString().slice(0, 10), '2026-09-21');
  assert.equal(mondayOf(fromIso('2026-09-27')).toISOString().slice(0, 10), '2026-09-21');
  assert.equal(fromIso('2026-13-01'), null);
});

test('the exchange suffix places a listing, and a bare or hyphenated symbol is the US', () => {
  assert.equal(marketOf('RUI.PA'), 'France');
  assert.equal(marketOf('7203.T'), 'Japan');
  assert.equal(marketOf('LEN-B'), 'United States');
  assert.equal(marketOf('AAPL'), 'United States');
  assert.equal(marketOf('X.ZZ'), 'Other markets');
});

test('a ticker root drops the exchange and a short share-class tag, nothing more', () => {
  assert.equal(symbolRoot('ADBE.SW'), 'ADBE');
  assert.equal(symbolRoot('LEN-B'), 'LEN');
  assert.equal(symbolRoot('BRK-B'), 'BRK');
  assert.equal(symbolRoot('LW'), 'LW');
  assert.equal(symbolRoot('SOME-THING'), 'SOME-THING');
});

test('one row per company: by root, by share class, and by an identical revenue estimate', () => {
  const rows = companyRows([
    { symbol: 'GXI.SW', date: '2026-09-24', revenueEstimated: null },
    { symbol: 'GXI.DE', date: '2026-09-24', revenueEstimated: null },
    { symbol: 'LEN', date: '2026-09-24', revenueEstimated: 8318685000, epsEstimated: 2.1 },
    { symbol: 'LEN-B', date: '2026-09-24', revenueEstimated: 8318685000 },
    { symbol: '0JU0.L', date: '2026-09-24', revenueEstimated: 8318685000 },
    { symbol: 'KIE.L', date: '2026-09-24', revenueEstimated: 100000000 },
    { symbol: 'KIERF', date: '2026-09-24', revenueEstimated: 100000001 },
  ]);
  const { rows: kept, removed } = dedupeEvents(rows, 'earnings');
  const symbols = kept.map((r) => r.symbol).sort();
  // GXI keeps one line; LEN absorbs LEN-B and the London line; the Kier pair
  // differs by a dollar and stays two, which is the visible way to be wrong.
  assert.deepEqual(symbols, ['GXI.DE', 'KIE.L', 'KIERF', 'LEN']);
  assert.equal(removed, 3);
  assert.deepEqual(kept.find((r) => r.symbol === 'LEN').alsoListed.sort(), ['0JU0.L', 'LEN-B']);
  // The merge works on copies: the input is untouched for the next draw.
  assert.equal(rows.find((r) => r.symbol === 'LEN').alsoListed, undefined);
});

test('splits merge by root only — a ratio is no fingerprint', () => {
  const rows = companyRows([
    { symbol: 'AAA', date: '2026-09-24', numerator: 2, denominator: 1 },
    { symbol: 'BBB', date: '2026-09-24', numerator: 2, denominator: 1 },
  ]);
  assert.equal(dedupeEvents(rows, 'splits').rows.length, 2);
});

test('a release moves to the reader\'s own day; a holiday keeps its date', () => {
  const monday = fromIso('2026-09-21');
  const rows = economicRows([
    // 23:01 UTC on Thursday is Friday 08:01 in Tokyo.
    { date: '2026-09-24 23:01:00', country: 'UK', event: 'Consumer Confidence', impact: 'Medium', estimate: -16, previous: -14, unit: '%' },
    { date: '2026-09-24 12:30:00', country: 'US', event: 'Initial Jobless Claims', impact: 'High', estimate: 201, previous: 196, unit: 'K' },
    // A holiday is dated at midnight UTC; it must not drift with the zone.
    { date: '2026-09-24 00:00:00', country: 'ZA', event: 'Heritage Day', impact: 'None' },
    // Sunday 20:00 UTC is Monday morning in Tokyo, so it falls into the week.
    { date: '2026-09-20 20:00:00', country: 'JP', event: 'Early release', impact: 'Low' },
    // And the following Sunday 20:00 UTC is outside it.
    { date: '2026-09-27 20:00:00', country: 'JP', event: 'Too late', impact: 'Low' },
  ], monday);
  const by = Object.fromEntries(rows.map((r) => [r.event, r]));
  assert.equal(by['Consumer Confidence'].day, '2026-09-25');
  assert.equal(by['Initial Jobless Claims'].day, '2026-09-24');
  assert.equal(by['Heritage Day'].day, '2026-09-24');
  assert.equal(by['Heritage Day'].holiday, true);
  assert.equal(by['Initial Jobless Claims'].impact, 3);
  assert.equal(by['Early release'].day, '2026-09-21');
  assert.equal(by['Too late'], undefined);
  assert.equal(by['Consumer Confidence'].actual, null, 'a release not yet out has no actual');
});

test('an IPO deal is priced at the midpoint, and only when both halves are published', () => {
  const [priced, blank] = ipoRows([
    { symbol: 'ADRX', date: '2026-09-25', company: 'ADARx', exchange: 'NASDAQ', actions: 'Expected', shares: 21875000, priceRange: '15.00 - 17.00', marketCap: 427656250 },
    { symbol: 'TORK', date: '2026-09-24', company: 'KraneShares', exchange: 'NASDAQ', actions: 'Expected', shares: null, priceRange: null, marketCap: null },
  ]);
  assert.equal(priced.deal, 21875000 * 16);
  assert.equal(priced.low, 15);
  assert.equal(priced.high, 17);
  assert.equal(blank.deal, null);
  assert.equal(blank.cap, null);
});

test('figures read the way TradingView prints them', () => {
  assert.equal(big(427656250), '427.66 M');
  assert.equal(big(1.24e9), '1.24 B');
  assert.equal(big(-3.5e12), '−3.50 T');
  assert.equal(big(null), null);
  assert.equal(countryName('US'), 'United States');
  assert.equal(countryName('UK'), 'United Kingdom');
  assert.equal(countryName('EU'), 'Euro area');
});

console.log(`\nPassed ${count} Calendar checks.`);
