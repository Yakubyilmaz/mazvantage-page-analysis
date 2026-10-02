/* ==========================================================================
   Maz Vantage — how an economic series is printed

   Port of the formatting halves of the legacy `economy-us.js`,
   `economy-country.js` and `economy-chart.js`. The views are in
   `components/market/economy.tsx`; Home reads `indicatorValue` and
   `periodOf` from here as well.

   Scales are this file's, not the vendor's: `economic-indicators` returns a
   bare number and `US_INDICATORS` records which unit each series is in. A
   value is printed in the unit it was reported in, never rebased.
   ========================================================================== */

import { isNum } from './format';

type Fmt = (value: number) => string;

const FORMAT: Record<string, Fmt> = {
  percent: (v) => `${v.toFixed(2)}%`,
  index: (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }),
  usd: (v) => `$${Math.round(v).toLocaleString('en-US')}`,
  usdBn: (v) => `${v < 0 ? '−' : ''}$${(Math.abs(v) / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}T`,
  usdMn: (v) => `${v < 0 ? '−' : ''}$${(Math.abs(v) / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`,
  jobs: (v) => `${(v / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`,
  people: (v) => Math.round(v).toLocaleString('en-US'),
  thousandUnits: (v) => `${Math.round(v).toLocaleString('en-US')}K`,
  millionUnits: (v) => `${v.toFixed(2)}M`,
};

/* A change is a different size from a level: a quarter of real GDP moves by
   billions, not by trillions, so a delta is printed at the scale it lands on
   rather than at the scale of the level above it. */
const DELTA: Record<string, Fmt> = {
  ...FORMAT,
  usdBn: (v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}B`,
  usdMn: (v) => (v >= 1000 ? `$${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}B` : `$${Math.round(v).toLocaleString('en-US')}M`),
  jobs: (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M` : `${Math.round(v).toLocaleString('en-US')}K`),
};

/** A reading in the unit its series is reported in. The chart and the board print through this one table. */
export const indicatorValue = (value: unknown, unit?: string | null): string =>
  (!isNum(value) ? '—' : (FORMAT[unit || ''] || FORMAT.index)(value));

const at = (date: unknown) => new Date(`${String(date).slice(0, 10)}T12:00:00Z`);

/** The period an observation covers, said the way its release says it. */
export function periodOf(date: unknown, step?: string | null): string {
  const when = at(date);
  if (Number.isNaN(when.getTime())) return String(date ?? '');
  if (step === 'quarter') return `Q${Math.floor(when.getUTCMonth() / 3) + 1} ${when.getUTCFullYear()}`;
  if (step === 'week') return when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return when.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export interface Point { date: string; value: number }
export interface SeriesEntry {
  name: string; label?: string; group?: string; unit?: string; note?: string; step?: string; windows?: number;
  status?: string; message?: string; points?: Point[]; latest?: Point | null; previous?: Point | null;
}
export interface Movement { direction: '' | 'is-up' | 'is-down'; text: string }

/** A US series' move since its previous observation, in the unit it was measured in. */
export function usMovement(entry: SeriesEntry): Movement | null {
  if (!entry.latest || !entry.previous || !isNum(entry.latest.value) || !isNum(entry.previous.value)) return null;
  const delta = entry.latest.value - entry.previous.value;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const size = entry.unit === 'percent'
    ? `${sign}${Math.abs(delta).toFixed(2)} pp`
    : `${sign}${(DELTA[entry.unit || ''] || DELTA.index)(Math.abs(delta))}`;
  const relative = entry.unit !== 'percent' && entry.previous.value !== 0
    ? ` (${sign}${Math.abs(delta / entry.previous.value * 100).toFixed(2)}%)` : '';
  return { direction: delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : '',
    text: `${size}${relative} since ${periodOf(entry.previous.date, entry.step)}` };
}

/* ---------- a country's releases ---------------------------------------------- */

export const reading = (value: unknown) => (!isNum(value) ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }));

export function releaseDate(date: unknown): string {
  const when = new Date(`${String(date || '').replace(' ', 'T').slice(0, 19)}Z`);
  return Number.isNaN(when.getTime()) ? String(date || '')
    : when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/* The move since the previous print. A percentage series moves in percentage
   points, not per cent of itself — inflation going from 2.1% to 2.4% is
   +0.30 pp, and calling that +14% would be a different and much more alarming
   statement. */
export function releaseMovement(entry: any): Movement | null {
  if (!entry.previous || !isNum(entry.latest?.value) || !isNum(entry.previous.value)) return null;
  const delta = entry.latest.value - entry.previous.value;
  const sign = delta > 0 ? '+' : '−';
  const size = delta === 0 ? 'Unchanged'
    : entry.unit === '%' ? `${sign}${Math.abs(delta).toFixed(2)} pp`
      : `${sign}${Math.abs(delta).toLocaleString('en-US', { maximumFractionDigits: 2 })}${entry.unit || ''}`;
  return { direction: delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : '', text: `${size} since ${releaseDate(entry.previous.date)}` };
}

const IMPACT_LABEL: Record<string, string> = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' };

/** What the vendor expected, where it published an expectation. */
export function releaseAgainst(entry: any): string {
  const estimate = entry.latest?.estimate;
  const label = IMPACT_LABEL[entry.impact];
  if (!isNum(estimate)) return label || '';
  return `${label ? `${label} · ` : ''}Forecast ${reading(estimate)}${entry.unit || ''}`;
}

/* ---------- what a chart range costs ------------------------------------------------ */

/* There is no "All": `economic-indicators` clips any window wider than ninety
   days, so "all" is an unbounded number of requests, and a button that cannot
   say what it spends does not belong on the page. */
export const INDICATOR_RANGES = [
  { id: '3M', days: 92, label: '3 months' },
  { id: '6M', days: 183, label: '6 months' },
  // Three windows is what the board already buys for a quarterly series.
  { id: '9M', days: 275, label: '9 months' },
  { id: '1Y', days: 366, label: '1 year' },
  { id: '3Y', days: 1096, label: '3 years' },
  { id: '5Y', days: 1827, label: '5 years' },
  { id: '10Y', days: 3653, label: '10 years' },
] as const;
export type IndicatorRange = (typeof INDICATOR_RANGES)[number];

/** Windows the ladder needs to reach back this far: the first covers 95 days. */
export const windowsFor = (range: { days: number }) => Math.max(1, Math.ceil((range.days - 95) / 90) + 1);
// Readers are not shown request counts (2026-10-01); kept for any caller as a neutral phrase.
export const requestNote = (count: number) => `${count} ${count === 1 ? 'series window' : 'series windows'}`;
