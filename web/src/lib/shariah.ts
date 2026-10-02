/* ==========================================================================
   Maz Vantage — the Shariah compliance screen (the model)

   Five published index methodologies, run against the balance sheet the
   report already has. Several surfaces read it — the Overview, the Shariah
   Compliance tab, the ideas engine — so the model lives apart from any view.

   What this is: a **mechanical screen** — two balance-sheet ratios and a
   business-activity keyword test, against each provider's published limits.

   What it is not: a **ruling**. Three of the tests the providers run are not
   run here at all, and one input is approximated. Every gap is named on the
   tab, because a green tick beside "compliant" gets quoted without caveats.

   AAOIFI, S&P Global and Dow Jones divide by market capitalisation; FTSE and
   MSCI by total assets. That single choice is why the same company clears one
   screen and fails another.
   ========================================================================== */

import { isNum, pct } from './format';

/**
 * Industry and sector wordings a business-activity screen excludes outright.
 * Keyword matching against the vendor's strings, which is as far as this data
 * goes: it catches a bank and a distiller, not a conglomerate's financing arm.
 */
export const EXCLUDED_ACTIVITIES = [
  'bank', 'insurance', 'capital markets', 'credit services', 'mortgage',
  'financial data', 'asset management', 'gambling', 'casino', 'tobacco',
  'brewer', 'distiller', 'winerie', 'alcoholic',
];

export interface ShariahStandard {
  key: string;
  name: string;
  divisor: 'marketCap' | 'assets';
  debt: number;
  liquid: number;
}

export const SHARIAH_STANDARDS: ShariahStandard[] = [
  { key: 'aaoifi', name: 'AAOIFI', divisor: 'marketCap', debt: 0.30, liquid: 0.30 },
  { key: 'sp', name: 'S&P Global', divisor: 'marketCap', debt: 0.33, liquid: 0.33 },
  { key: 'djim', name: 'Dow Jones', divisor: 'marketCap', debt: 0.33, liquid: 0.33 },
  { key: 'ftse', name: 'FTSE', divisor: 'assets', debt: 0.33, liquid: 0.33 },
  { key: 'msci', name: 'MSCI', divisor: 'assets', debt: 0.3333, liquid: 0.3333 },
];

export const SHARIAH_INFO = 'A mechanical screen, not a scholarly ruling. AAOIFI, S&P Global and '
  + 'Dow Jones measure debt and cash against market capitalisation; FTSE and MSCI against total '
  + 'assets, which is why the same company can pass one and fail another. Two further tests — '
  + 'non-compliant income and receivables — need fields outside the feeds loaded here and are '
  + 'not run, and the index providers screen on an averaged market cap (Dow Jones 24 months, '
  + 'S&P 36) where this has only the current one. Verify against the provider before relying '
  + 'on it.';

/** Is the business itself excluded, regardless of the balance sheet? */
export function excludedActivity(f: { industry?: string | null; sector?: string | null }): string | null {
  const hay = `${f.industry || ''} ${f.sector || ''}`.toLowerCase();
  return EXCLUDED_ACTIVITIES.find((w) => hay.includes(w)) || null;
}

export interface ShariahVerdict {
  std: ShariahStandard;
  basis: 'assets' | 'market cap';
  base: number | null | undefined;
  excluded: string | null;
  state: 'pass' | 'fail' | 'na';
  note: string;
  debt: number | null;
  liquid: number | null;
  debtOk: boolean | null;
  liquidOk: boolean | null;
}

/**
 * One standard's verdict, with the arithmetic behind it. `state` is 'na' when
 * the balance sheet is too incomplete to measure.
 */
export function shariahVerdict(a: { facts: any }, std: ShariahStandard): ShariahVerdict {
  const f = a.facts;
  const base = std.divisor === 'assets' ? f.totalAssets : f.marketCap;
  const basis = std.divisor === 'assets' ? 'assets' : 'market cap';
  const excluded = excludedActivity(f);

  if (excluded) {
    return { std, basis, base, excluded, state: 'fail', note: 'Excluded business activity', debt: null, liquid: null, debtOk: false, liquidOk: false };
  }
  if (!isNum(base) || base <= 0 || !isNum(f.totalDebt) || !isNum(f.cash)) {
    return { std, basis, base, excluded: null, state: 'na', note: 'Not enough of the balance sheet is loaded', debt: null, liquid: null, debtOk: null, liquidOk: null };
  }
  const debt = f.totalDebt / base;
  const liquid = f.cash / base;
  const debtOk = debt <= std.debt;
  const liquidOk = liquid <= std.liquid;
  return {
    std, basis, base, excluded: null, debt, liquid, debtOk, liquidOk,
    state: debtOk && liquidOk ? 'pass' : 'fail',
    note: `Debt ${pct(debt)} · cash ${pct(liquid)} of ${basis}`,
  };
}
