import assert from 'node:assert/strict';
import { economyRates } from '../assets/js/economy-data.js';

const release = (country, event, actual, date = '2026-09-01 08:00:00', extra = {}) => ({ country, event, actual, date, unit: '%', ...extra });
const rates = economyRates([
  release('US', 'GDP Growth Annualized (Q2)', 3),
  release('GB', 'GDP Growth Rate QoQ (Q2)', .2),
  release('GB', 'GDP Growth Rate YoY (Q2)', 1.2),
  release('GB', 'GDP Growth Rate YoY (Q2)', 1.3, '2026-09-02 08:00:00'),
  release('DE', 'Inflation Rate YoY (Aug)', 0),
  release('FR', 'CPI YoY (Aug)', -0.4),
  release('US', 'Core Inflation Rate YoY (Aug)', 99),
  release('US', 'GDP Price Index YoY (Q2)', 99),
  release('US', 'Inflation Rate MoM (Aug)', 99),
  release('CN', 'Inflation Rate YoY (Aug)', null, undefined, { estimate: 2, previous: 1 }),
  release('IN', 'Inflation Rate YoY (Aug)', '', undefined),
  release('JP', 'Inflation Rate YoY (Aug)', 9, '2026-09-15 08:00:00'),
  release('BR', 'Inflation Rate YoY (Aug)', 9, '2025-09-01 08:00:00'),
  release('EU', 'Inflation Rate YoY (Aug)', 2),
], new Date('2026-09-14T12:00:00Z'));
assert.equal(rates.gdp.GB.value, 1.3);
assert.equal(rates.gdpQuarterly.GB.value, .2);
assert.equal(rates.gdpAnnualized.US.value, 3);
assert.equal(rates.gdp.US, undefined);
assert.deepEqual(Object.keys(rates.inflation).sort(), ['DE', 'FR']);
assert.equal(rates.inflation.DE.value, 0);
assert.equal(rates.inflation.FR.value, -.4);
console.log('Passed economic rate selection checks: revisions, frequencies, zero, negative, missing, future, stale, and regional exclusions.');
