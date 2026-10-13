/* ==========================================================================
   Maz Vantage — the halal check on a fund's holdings

   Readers who invest in Shariah ETFs complain that the funds hold companies
   that are not compliant. Often both are right: the fund follows one index
   provider's rules, and the reader follows another's. This page settles it
   for a given fund by running the company screen on every holding and
   adding up the fund's weight on each side — under each of the five
   published standards separately, so "which standard is the fund failing?"
   has an answer.

   The fund's own mandate is the fund's claim (`etf-collections.ts` says so);
   what this computes is the share of its money that each standard would
   admit, holding by holding.

   ---------------------------------------------------------------------------
   How a holding is read
   ---------------------------------------------------------------------------

   - **The label** is `halalLabel`, the one the report and the portfolio
     print: a researched v5.0 screen where one exists, else the quick screen.
   - **Inputs per holding**: the company's sector, industry and market cap
     from one screener read for the whole fund, and its latest annual balance
     sheet (one request per holding, cached, shared with its report).
     Holdings the screener does not list — most companies outside the US —
     cost a profile read as well.
   - **On today's market cap.** The report divides by the providers' averaged
     market cap; a fund of two hundred companies would cost two hundred more
     requests for that, so here it is today's, and the page says so.
   - **The interest-income test is not run** on holdings (it would cost an
     income statement each); the ratios and the activity screen decide.

   Lines with no ticker (cash, futures, swaps, a CUSIP-only bond) are not
   screened, and neither are holdings past the cap the reader chose. Both are
   reported as weight not screened — never counted as a pass or a fail.
   ========================================================================== */

import { isNum } from './format';
import { fetchEtfInfo, fetchFor, fetchHubFeed, fetchScreener, mapLimited } from './fmp';
import { fundDataOf, type FundData } from './fund-xray';
import { halalLabel, quickRows, type HalalLabel, type HalalTone } from './halal-label';
import { SHARIAH_STANDARDS, quickInputs, type QuickState } from './shariah';

export const CAPS = [50, 100, 250] as const;
export const DEFAULT_CAP = 50;

/** Funds a reader is likely to want checked first: their names state a Shariah mandate. Symbols only; the page reads the rest live. */
export const SUGGESTED_FUNDS = ['SPUS', 'HLAL', 'UMMA', 'SPTE', 'SPWO', 'ISDU'];

export type StdKey = (typeof SHARIAH_STANDARDS)[number]['key'];

export type HoldingStatus = 'screened' | 'no-ticker' | 'no-data' | 'beyond-cap';

export interface HoldingCheck {
  key: string;
  symbol: string | null;
  name: string;
  weight: number;
  status: HoldingStatus;
  label: HalalLabel | null;
  /** each standard's state, for the per-standard sums */
  byStandard: Partial<Record<StdKey, QuickState>>;
  sector: string | null;
}

export interface Weights { good: number; warn: number; bad: number; unscreened: number }

export interface FundHalal {
  symbol: string;
  name: string | null;
  updatedAt: string | null;
  holdings: HoldingCheck[];
  /** sum of the holdings' weights; funds do not always sum to 100% */
  total: number;
  /** by the label's tone; `unscreened` holds no-ticker, no-data and past-the-cap lines */
  byLabel: Weights;
  /** per standard: the weight that passes, fails, and could not be measured */
  byStandard: Record<StdKey, { pass: number; fail: number; na: number }>;
  /** holdings past the cap */
  beyondCap: number;
  cap: number;
}

const TONE_KEY: Record<HalalTone, keyof Weights> = { good: 'good', warn: 'warn', bad: 'bad', muted: 'unscreened' };

/** Adds the checked holdings up. Pure, so the arithmetic is tested without a network. */
export function summariseFund(fund: Pick<FundData, 'symbol' | 'name' | 'updatedAt'>, holdings: HoldingCheck[], cap: number): FundHalal {
  const byLabel: Weights = { good: 0, warn: 0, bad: 0, unscreened: 0 };
  const byStandard = Object.fromEntries(SHARIAH_STANDARDS.map((s) => [s.key, { pass: 0, fail: 0, na: 0 }])) as FundHalal['byStandard'];
  let total = 0;
  for (const h of holdings) {
    const w = isNum(h.weight) ? h.weight : 0;
    total += w;
    byLabel[h.status === 'screened' && h.label ? TONE_KEY[h.label.tone] : 'unscreened'] += w;
    for (const s of SHARIAH_STANDARDS) {
      const st = h.status === 'screened' ? h.byStandard[s.key] ?? 'na' : 'na';
      byStandard[s.key][st] += w;
    }
  }
  return {
    symbol: fund.symbol, name: fund.name, updatedAt: fund.updatedAt, holdings, total, byLabel, byStandard,
    beyondCap: holdings.filter((h) => h.status === 'beyond-cap').length, cap,
  };
}

/** One holding from what was read about it. Pure. */
export function checkHolding(
  h: { key: string; symbol: string | null; name: string; weight: number },
  company: { name?: string | null; sector?: string | null; industry?: string | null; marketCap?: number | null } | null,
  balance: any[] | null,
): HoldingCheck {
  const base = { key: h.key, symbol: h.symbol, name: h.name, weight: h.weight, sector: company?.sector ?? null };
  if (!h.symbol) return { ...base, status: 'no-ticker', label: null, byStandard: {} };
  if (!company || !Array.isArray(balance) || !balance.length) return { ...base, status: 'no-data', label: null, byStandard: {} };
  const a = {
    facts: { symbol: h.symbol, name: company.name || h.name, sector: company.sector, industry: company.industry, marketCap: company.marketCap ?? null },
    ds: { get: (n: string) => (n === 'balance' ? balance : null) },
  };
  const rows = quickRows(quickInputs(a));
  return {
    ...base,
    status: 'screened',
    label: halalLabel(a),
    byStandard: Object.fromEntries(rows.map((r) => [r.std.key, r.state])) as HoldingCheck['byStandard'],
  };
}

/** About how many requests a check costs, for the button. */
export const checkCost = (holdings: number, cap: number) => 3 + Math.min(holdings, cap);

/** The fund's record and holdings: two requests. */
export async function loadFund(symbol: string): Promise<FundData | null> {
  const [info, holdings] = await Promise.all([fetchEtfInfo(symbol), fetchHubFeed('etfHoldings', { symbol })]);
  if (holdings.status !== 'ok' || !Array.isArray(holdings.data) || !holdings.data.length) return null;
  return fundDataOf(symbol, info.status === 'ok' ? info.data : null, holdings.data, null, null,
    { info: info.status, holdings: holdings.status, sectors: 'skipped', countries: 'skipped' });
}

/**
 * Run the check: the screener once, then each holding's balance sheet (and a
 * profile for any the screener does not list), largest holdings first, up to
 * `cap`.
 */
export async function checkFund(fund: FundData, { cap = DEFAULT_CAP, onProgress }: { cap?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<FundHalal> {
  const lines = [...fund.holdings].sort((x, y) => y.weight - x.weight);
  const ticked = lines.filter((l) => l.symbol);
  const inCap = new Set(ticked.slice(0, cap).map((l) => l.key));

  const listed = await fetchScreener({ country: 'US', isEtf: false, isFund: false, isActivelyTrading: true, limit: 5000 });
  const bySymbol = new Map<string, any>((listed.status === 'ok' ? listed.data || [] : []).map((r: any) => [String(r.symbol).toUpperCase(), r]));

  let done = 0;
  const todo = lines.filter((l) => l.symbol && inCap.has(l.key));
  onProgress?.(0, todo.length);
  const read = new Map<string, HoldingCheck>();
  await mapLimited(todo, async (l) => {
    const sym = l.symbol!;
    let row = bySymbol.get(sym) ?? null;
    let company = row ? { name: row.companyName, sector: row.sector, industry: row.industry, marketCap: row.marketCap } : null;
    const [bal, prof] = await Promise.all([
      fetchFor('balance', sym),
      company ? Promise.resolve(null) : fetchFor('profile', sym),
    ]);
    if (!company && prof?.status === 'ok' && prof.data) {
      row = prof.data;
      company = { name: row.companyName, sector: row.sector, industry: row.industry, marketCap: row.marketCap ?? row.mktCap ?? null };
    }
    read.set(l.key, checkHolding(l, company, bal.status === 'ok' ? bal.data : null));
    onProgress?.(++done, todo.length);
  }, 5);

  const holdings: HoldingCheck[] = lines.map((l) => read.get(l.key)
    ?? (l.symbol
      ? { key: l.key, symbol: l.symbol, name: l.name, weight: l.weight, status: 'beyond-cap' as const, label: null, byStandard: {}, sector: null }
      : checkHolding(l, null, null)));
  return summariseFund(fund, holdings, cap);
}
