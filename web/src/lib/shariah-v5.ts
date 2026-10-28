/* ==========================================================================
   Maz Vantage — the full Shariah screen (methodology v5.0)

   The mechanical screen in `shariah.ts` runs on every ticker from the data the
   report loads. This is the other kind: a per-issuer screen, researched from
   the filings, that only exists where someone has written one. Part XIV of the
   methodology says so plainly — Gate-4 attribution, customer mix and content
   measurement "stay per-issuer research; the app should show them only where
   a report exists, labelled with its date and version".

   What lives here is the arithmetic the methodology fixes, so a record only
   has to carry its inputs:

   - §3, the master threshold table. Thresholds live nowhere else.
   - Which market-cap window and which debt track each scenario tests on
     (D16, Δ37), and the ±2pp Watch zone at Sc A and Sc B only (Δ22, D3).
     Cash and securities are on the 12-month average at all four (owner, 2026-10-18).
   - Gate-4 sizing: point estimates at Sc A/B, the conservative edge of the
     band at Sc C/Strictest (D9), and open elections kept out of the total.
   - Δ6 purification, the two-component v5.0 formula, with Δ6-D and the
     AAOIFI dividend-ratio cross-check (§57–§59).

   Gates 1 and 5 are judgement walked through a decision table; the record
   states them and this file only aggregates them.
   ========================================================================== */

import { SHARIAH_STANDARDS, basisLabel } from './shariah';

export type Scenario = 'A' | 'B' | 'C' | 'S';
export const SCENARIOS: Scenario[] = ['A', 'B', 'C', 'S'];

/**
 * Readers see scenarios, not schools of law: the methodology maps each one to
 * a school (§61), but the label a reader acts on is the scenario. Scenario B is
 * the AAOIFI one and Maz Vantage's preferred reading.
 */
export const SCENARIO_NAME: Record<Scenario, string> = {
  A: 'Scenario A', B: 'Scenario B · AAOIFI', C: 'Scenario C', S: 'Strictest',
};
export const SCENARIO_SHORT: Record<Scenario, string> = { A: 'Sc A', B: 'Sc B · AAOIFI', C: 'Sc C', S: 'Strictest' };
export const PREFERRED: Scenario = 'B';

/** A figure the issuer does not disclose: the point used and the band around it. */
export interface Band { point: number; low: number; high: number }

/* ---------- §3: the master threshold table --------------------------------- */

export type TestKey =
  | 'ibd_mcap' | 'ibd_ta' | 'ibd_hanbali'
  | 'cash_mcap' | 'cash_ta' | 'cash_hanbali'
  | 'liquid_mcap' | 'ar_mcap' | 'ar_ta' | 'l1_revenue';

/** `null` is "computed and reported, never decisive at that scenario". */
export const THRESHOLDS: Record<TestKey, Record<Scenario, number | null>> = {
  ibd_mcap: { A: 0.33, B: 0.30, C: 0.30, S: 0.25 },
  ibd_ta: { A: null, B: 0.30, C: 0.30, S: 0.25 },
  ibd_hanbali: { A: null, B: null, C: 0.30, S: 0.25 },
  cash_mcap: { A: 0.33, B: 0.30, C: 0.30, S: 0.25 },
  // Owner's change, 2026-10-18: cash and securities are tested against the
  // 12-month average market cap at every scenario, as AAOIFI Standard 21 does;
  // the total-asset and tangible-market-cap versions are still computed and
  // printed, and decide nothing.
  cash_ta: { A: null, B: null, C: null, S: null },
  cash_hanbali: { A: null, B: null, C: null, S: null },
  liquid_mcap: { A: 0.50, B: 0.50, C: 0.50, S: 0.50 },
  ar_mcap: { A: 0.33, B: 0.33, C: 0.33, S: 0.25 },
  ar_ta: { A: null, B: null, C: 0.33, S: 0.25 },
  l1_revenue: { A: 0.05, B: 0.05, C: 0.05, S: 0.05 },
};

/**
 * `label` is what a reader sees first; `code` is the methodology's ratio number
 * with any qualifier, printed small beneath it.
 */
export const TEST_INFO: Record<TestKey, { r: string; label: string; code: string; gate: 2 | 3 }> = {
  ibd_mcap: { r: 'R1–R3', label: 'Debt / market cap', code: 'R1–R3 · interest-bearing debt', gate: 2 },
  ibd_ta: { r: 'R4', label: 'Debt / total assets', code: 'R4 · R19 at Strictest, operating leases included', gate: 2 },
  ibd_hanbali: { r: 'R7', label: 'Debt / tangible market cap', code: 'R7 · market cap less goodwill and intangibles', gate: 2 },
  cash_mcap: { r: 'R8–R10', label: 'Cash & securities / 12-month market cap', code: 'R8–R10 · cash plus interest-bearing securities, on the 12-month average at every scenario', gate: 2 },
  cash_ta: { r: 'R11', label: 'Cash & securities / total assets', code: 'R11', gate: 2 },
  cash_hanbali: { r: 'R12', label: 'Cash & securities / tangible market cap', code: 'R12', gate: 2 },
  liquid_mcap: { r: 'R13', label: 'Cash, securities & receivables / market cap', code: 'R13', gate: 2 },
  ar_mcap: { r: 'R14–R15', label: 'Receivables / market cap', code: 'R14–R15 · trade receivables', gate: 2 },
  ar_ta: { r: 'R16', label: 'Receivables / total assets', code: 'R16', gate: 2 },
  l1_revenue: { r: 'R17', label: 'Interest income / revenue', code: 'R17 · Gate 3, Layer 1', gate: 3 },
};

/** Gate-4 non-permissible income caps (bright-line). */
export const NPI_CAP: Record<Scenario, number> = { A: 0.05, B: 0.05, C: 0.05, S: 0.03 };

/** Δ22: the Watch zone around a Gate-2 threshold, Sc A and Sc B only (D3). */
export const WATCH_ZONE: Record<Scenario, number> = { A: 0.02, B: 0.02, C: 0, S: 0 };

/* ---------- inputs ------------------------------------------------------------ */

/** Balance sheet at one date, US$ millions. */
export interface BalanceSheet {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  /** Cash, cash equivalents and every marketable debt security, current and non-current (§6). */
  cashIbs: number;
  cash: number;
  /** Trade receivables only; vendor and other non-trade receivables are not AR (§6). */
  ar: number;
  /** Commercial paper + term debt, current and non-current, at carrying value. */
  borrowings: number;
  financeLeases: number;
  operatingLeases: number;
  goodwill: number;
  intangibles: number;
  /** Δ43: restricted client funds inside cashIbs that are matched by an equal client-fund obligation. */
  clientFunds?: number;
  /**
   * Δ50: unrealised Level-3 gains carried in total assets (private stakes marked up on unobservable
   * inputs). Sc C and Strictest divide by total assets without them; Sc A and B use total assets as reported.
   */
  level3Gains?: number;
}

/** Market-cap windows (§8), US$ millions. */
export interface McapWindows { m12: number; m24: number; m36: number; spot: number; spotDate: string }

/** Twelve-month figures for Gate 4 and purification, US$ millions except per share. */
export interface Income {
  revenue: number;
  netIncome: number;
  pretax: number;
  tax: number;
  epsDiluted: number;
  dilutedShares: number;
  dps: number;
  /** Δ58: after-tax non-operating valuation gains inside net income, kept out of the purification margin. */
  nonOperatingGains?: number;
}

/** Δ37: track (a) at Sc A/B/C, track (b) — with operating leases — at Strictest. */
export const ibdTrack = (bs: BalanceSheet, s: Scenario) =>
  bs.borrowings + bs.financeLeases + (s === 'S' ? bs.operatingLeases : 0);

/** D16: the window each scenario decides on. A ratio over market cap is worst where market cap is smallest. */
export function scenarioMcap(w: McapWindows, s: Scenario): { value: number; window: string } {
  if (s === 'A') return { value: w.m24, window: '24-month average' };
  if (s === 'B') return { value: w.m12, window: '12-month average' };
  const pool: [number, string][] = [[w.m12, '12m'], [w.m24, '24m'], [w.m36, '36m']];
  if (s === 'S') pool.push([w.spot, 'spot']);
  const [value, which] = pool.reduce((lo, x) => (x[0] < lo[0] ? x : lo));
  return { value, window: `worst of ${s === 'S' ? '12/24/36m and spot' : '12/24/36m'} (${which})` };
}

/* ---------- Gates 2 and 3 ------------------------------------------------------- */

export type TestState = 'pass' | 'watch' | 'fail' | 'info' | 'undefined';

export interface TestResult { key: TestKey; value: number | null; limit: number | null; state: TestState }

function judge(value: number | null, limit: number | null, s: Scenario, gate: 2 | 3): TestState {
  if (value == null) return limit == null ? 'info' : 'undefined';
  if (limit == null) return 'info';
  const zone = gate === 2 ? WATCH_ZONE[s] : 0;
  if (zone && Math.abs(value - limit) <= zone) return 'watch';
  return value <= limit ? 'pass' : 'fail';
}

/**
 * Every Gate-2 and Gate-3 test at one scenario, on that scenario's window and
 * debt track. `l1` is the Layer-1 figure that scenario uses (the point at Sc
 * A/B, the conservative edge at Sc C/Strictest when it is an estimate).
 */
export function ratioTests(bs: BalanceSheet, w: McapWindows, l1: number, revenue: number, s: Scenario): TestResult[] {
  const mcap = scenarioMcap(w, s).value;
  const ibd = ibdTrack(bs, s);
  const hanbali = mcap - bs.goodwill - bs.intangibles;
  // Δ38: a Hanbali denominator at or below zero is undefined, and disqualifying where tested.
  const overHanbali = (x: number) => (hanbali > 0 ? x / hanbali : null);
  // Δ43: client funds matched by an equal obligation are the clients', held as agent — out at Sc A only.
  const cashIbs = s === 'A' ? Math.max(0, bs.cashIbs - (bs.clientFunds ?? 0)) : bs.cashIbs;
  // Δ50: Level-3 mark-ups are estimates, so Sc C and Strictest take the asset base without them (D9's edge).
  const ta = edge(s) ? bs.totalAssets - (bs.level3Gains ?? 0) : bs.totalAssets;
  const values: Record<TestKey, number | null> = {
    ibd_mcap: ibd / mcap,
    ibd_ta: ibd / ta,
    ibd_hanbali: overHanbali(ibd),
    // The 12-month average at every scenario, not the scenario's window (2026-10-18).
    cash_mcap: cashIbs / w.m12,
    cash_ta: cashIbs / ta,
    cash_hanbali: overHanbali(cashIbs),
    liquid_mcap: (cashIbs + bs.ar) / mcap,
    ar_mcap: bs.ar / mcap,
    ar_ta: bs.ar / ta,
    l1_revenue: l1 / revenue,
  };
  return (Object.keys(THRESHOLDS) as TestKey[]).map((key) => {
    const limit = THRESHOLDS[key][s];
    return { key, value: values[key], limit, state: judge(values[key], limit, s, TEST_INFO[key].gate) };
  });
}

/** The worst state among tests that decide anything. */
export function worstOf(states: TestState[]): 'pass' | 'watch' | 'fail' {
  if (states.some((x) => x === 'fail' || x === 'undefined')) return 'fail';
  return states.includes('watch') ? 'watch' : 'pass';
}

/* ---------- Gate 4 ------------------------------------------------------------- */

/** An attribution rate: one number at every lens, or a banded share (Δ31 benchmarks). */
export type Rate = number | { point: number; high: number };

export interface RevenueLine {
  key: string;
  label: string;
  /** The rule that sets the rate, named by number (§62 required disclosures). */
  rule: string;
  tier: string;
  /** Size of the line, US$ millions. */
  base: Band;
  rate: Record<Scenario, Rate>;
  /** Layer-1 interest — counted at Gate 3 and inside the Gate-4 total (D5). */
  interest?: boolean;
  /** An activity index families exclude whole (music, film, insurance broking, conventional finance, gambling). */
  wholeLine?: boolean;
  /** An open election (§52 loot boxes): reported under readings, kept out of the total. */
  election?: number[];
  status: 'disclosed' | 'estimated' | 'estimated — wide band';
  basis: string;
}

const edge = (s: Scenario) => s === 'C' || s === 'S';

/** D9: point estimate at Sc A/B, the conservative edge of the band at Sc C/Strictest. */
export const sizeAt = (b: Band, s: Scenario) => (edge(s) ? b.high : b.point);
export const rateAt = (r: Rate, s: Scenario) => (typeof r === 'number' ? r : edge(s) ? r.high : r.point);

/** One line's attributed amount (US$m) and share of revenue at one scenario. */
export function lineAt(line: RevenueLine, s: Scenario, revenue: number, reading?: number) {
  const rate = line.election ? (edge(s) ? reading ?? 0 : 0) : rateAt(line.rate[s], s);
  const amount = sizeAt(line.base, s) * rate;
  return { rate, amount, share: amount / revenue };
}

export interface Gate4Total {
  npi: number;
  interest: number;
  impure: number;
  cap: number;
  state: 'pass' | 'fail';
  /** The same lines sized at the other edge: does the verdict survive the band (§16.5)? */
  otherEdge: number;
  robust: boolean;
}

export function gate4(lines: RevenueLine[], revenue: number, s: Scenario): Gate4Total {
  const counted = lines.filter((l) => !l.election);
  const sumAt = (flip: boolean) => counted.reduce((t, l) => {
    const size = flip ? (edge(s) ? l.base.point : l.base.high) : sizeAt(l.base, s);
    const r = l.rate[s];
    const rate = typeof r === 'number' ? r : (flip ? !edge(s) : edge(s)) ? r.high : r.point;
    return t + size * rate;
  }, 0);
  const amount = sumAt(false);
  const interest = counted.filter((l) => l.interest).reduce((t, l) => t + lineAt(l, s, revenue).amount, 0);
  const npi = amount / revenue;
  const otherEdge = sumAt(true) / revenue;
  const cap = NPI_CAP[s];
  return {
    npi, interest, impure: amount - interest, cap,
    state: npi <= cap ? 'pass' : 'fail',
    otherEdge,
    robust: (npi <= cap) === (otherEdge <= cap),
  };
}

/* ---------- Δ6 purification (Part X) ------------------------------------------- */

export interface Purification {
  perShare: number;
  dividendPart: number;
  retainedPart: number;
  payout: number;
  /** §59: DPS × NPI%, what most retail screeners print. */
  ratioMethod: number;
  taxRate: number;
  margin: number;
}

/**
 * IE = I × (1 − t) + R_imp × m, with t floored at 0 and m the after-tax margin
 * excluding interest — and, under Δ58, excluding non-operating valuation gains,
 * which no revenue line earned. A loss year purifies the interest alone.
 * Purification can therefore never exceed earnings unless interest alone does (F7).
 */
export function purify(inc: Income, interest: number, impure: number, npi: number): Purification {
  const t = Math.max(0, inc.tax / inc.pretax);
  const afterTaxInterest = interest * (1 - t);
  const margin = Math.max(0, (inc.netIncome - afterTaxInterest - (inc.nonOperatingGains ?? 0)) / inc.revenue);
  const ie = inc.netIncome > 0 ? afterTaxInterest + impure * margin : afterTaxInterest;
  const perShare = ie / inc.dilutedShares;
  const payout = Math.min(1, inc.dps / inc.epsDiluted);
  return {
    perShare, payout, taxRate: t, margin,
    dividendPart: perShare * payout,
    retainedPart: perShare * (1 - payout),
    ratioMethod: inc.dps * npi,
  };
}

/** §58: company-level khums is 20% of reported net income; per share is informational. */
export const khums = (inc: Income) => ({ company: 0.2 * Math.max(0, inc.netIncome), perShare: 0.2 * Math.max(0, inc.epsDiluted) });

/* ---------- aggregation (§4) ------------------------------------------------------ */

export type Verdict = 'PASS' | 'MIXED — Watch' | 'FAIL' | 'CATEGORICAL FAIL' | 'NOT SCREENABLE';

/** The worst gate wins: categorical > fail > watch > pass. Gate 5 is not a compliance finding. */
export function aggregate(gates: { g1: 'pass' | 'categorical'; g2: 'pass' | 'watch' | 'fail'; g3: 'pass' | 'fail'; g4: 'pass' | 'fail'; screenable: boolean }): Verdict {
  if (!gates.screenable) return 'NOT SCREENABLE';
  if (gates.g1 === 'categorical') return 'CATEGORICAL FAIL';
  if (gates.g2 === 'fail' || gates.g3 === 'fail' || gates.g4 === 'fail') return 'FAIL';
  return gates.g2 === 'watch' ? 'MIXED — Watch' : 'PASS';
}

/* ---------- the index families, on their own rules (§60, corrected) ----------- */

export type IndexKey = 'aaoifi' | 'sp' | 'djim' | 'ftse' | 'msci';

export interface IndexRule {
  key: IndexKey;
  name: string;
  /** What debt and cash are divided by. */
  basis: 'm12' | 'm24' | 'm36' | 'ta';
  basisLabel: string;
  debtCap: number;
  cashCap: number;
  /** Receivables test, if the family runs one; `withCash` adds cash and equivalents. */
  ar?: { cap: number; withCash?: boolean };
  /**
   * The revenue test: Scenario B's non-permissible income; the same without
   * interest; whole-line counting of the activities the family excludes; or a
   * sector screen with no revenue percentage.
   */
  income: 'npi' | 'npi-ex-interest' | 'whole-line' | 'sector';
  note: string;
}

/**
 * The five index families, read from the one definition the quick screen also
 * uses (`SHARIAH_STANDARDS` in `shariah.ts`), so no threshold can differ
 * between the two.
 */
export const INDEX_RULES: IndexRule[] = SHARIAH_STANDARDS.map((s) => ({
  key: s.key,
  name: s.fullName,
  basis: s.divisor === 'assets' ? 'ta' : s.window ?? 'm12',
  basisLabel: basisLabel(s),
  debtCap: s.debt,
  cashCap: s.liquid,
  ar: s.ar,
  income: s.income,
  note: s.note,
}));

export interface IndexResult {
  rule: IndexRule;
  debt: number;
  cash: number;
  ar: number | null;
  income: number | null;
  /** The income figure at the low and high edges of the estimates. */
  incomeBand: [number, number] | null;
  state: 'pass' | 'fail' | 'borderline';
}

/** One index family's verdict on the screen's own figures. */
export function indexScreen(rule: IndexRule, bs: BalanceSheet, w: McapWindows, lines: RevenueLine[], revenue: number): IndexResult {
  const base = rule.basis === 'ta' ? bs.totalAssets : w[rule.basis];
  const debt = (bs.borrowings + bs.financeLeases) / base;
  const cash = bs.cashIbs / base;
  const ar = rule.ar ? (bs.ar + (rule.ar.withCash ? bs.cash : 0)) / base : null;
  let income: number | null = null;
  let incomeBand: [number, number] | null = null;
  if (rule.income !== 'sector') {
    const whole = rule.income === 'whole-line';
    const inScope = (l: RevenueLine) => !l.election
      && (whole ? Boolean(l.interest || l.wholeLine) : !(rule.income === 'npi-ex-interest' && l.interest));
    const rateOf = (l: RevenueLine) => (whole ? 1 : rateAt(l.rate.B, 'B'));
    const total = (pick: (b: Band) => number) =>
      lines.filter(inScope).reduce((t, l) => t + pick(l.base) * rateOf(l), 0) / revenue;
    income = total((b) => b.point);
    incomeBand = [total((b) => b.low), total((b) => b.high)];
  }
  const ratiosPass = debt <= rule.debtCap && cash <= rule.cashCap && (ar == null || ar <= rule.ar!.cap);
  let state: IndexResult['state'] = ratiosPass && (income == null || income <= 0.05) ? 'pass' : 'fail';
  // An estimated revenue test whose band straddles the cap decides nothing on its own.
  if (ratiosPass && incomeBand && incomeBand[0] <= 0.05 && incomeBand[1] > 0.05) state = 'borderline';
  return { rule, debt, cash, ar, income, incomeBand, state };
}
