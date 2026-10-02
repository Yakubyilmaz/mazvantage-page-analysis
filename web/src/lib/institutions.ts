/* ==========================================================================
   Maz Vantage — the big banks' 13F holdings, for "Following the big banks"

   Nine global banks file a Form 13F every quarter listing the US-listed
   shares they hold. Read two consecutive quarters of all nine and the
   question "what are the big banks buying?" has an answer per company: how
   many of them hold it, how many added to it, and by how much their combined
   holding grew. The Investment Ideas engine (`runIdea`) uses that table as
   the portfolio's universe; this module builds it.

   What a bank's 13F is, which is not what a fund's is:
   - **Three businesses in one filing.** Asset management (index and active
     funds), the private bank's discretionary client accounts, and the
     trading desk's inventory — including the shares held to hedge
     derivatives sold to clients. A rising share count is any mix of client
     money arriving, an index rebalancing, and a desk hedging. It is not a
     house view, and the page says so.
   - **Big.** Four to ten thousand lines each, 2–5 MB a quarter. The read is
     the costliest thing on the portfolio page, and it is done once per run
     and cached by `fmp.ts`.
   - **Several filers per bank.** BNP Paribas files under three entities
     (the group, its markets arm and its asset manager); they are added up,
     because none of them includes another's positions.

   Two things make a share count rise with nobody buying, and both are
   handled rather than footnoted:
   - **Stock splits.** Booking split 25-for-1 and KLA 10-for-1 in Q2 2026, so
     every bank "added" to both. The previous quarter's shares are multiplied
     by every split with an ex-date after the previous quarter end and on or
     before the latest one, from the vendor's split calendar.
   - **Mergers paid in shares, bonus issues, spin-offs** — anything that
     hands every holder new shares. No calendar lists all of these, so the
     portfolio compares the banks against **all 13F filers** in the same
     company (`withBaseline`): if every institution's holding doubled, the
     banks' doubling is not accumulation. Devon (all nine banks up ~77% after
     its all-stock merger, all filers up ~92%) is the case that showed it.

   Only long stock counts. Option lines are left out (a put is a bet against
   the stock, and a bank's are mostly hedges), as are lines reported in
   principal amount (bonds, convertibles) and CUSIPs the vendor maps to no
   ticker. Positions are matched across quarters by CUSIP, as filed, and only
   then rolled up to the vendor's ticker. The issuer *name* as filed is not
   used anywhere: BNP Paribas's own filing pairs CUSIPs with the wrong names
   ("APPLE INCPUT" on Apple's CUSIP, "NASDAQ INCPUT" on Eaton's), so names
   come from the screener instead.
   ========================================================================== */

import { isNum } from './format';
import { fetchCalendar, fetchFund13F, mapLimited, type FeedResult } from './fmp';
import { quarterLabel, quartersOf, type Quarter } from './superinvestors';

export interface BankFiler { cik: string; name: string }
export interface Bank { key: string; name: string; short: string; filers: BankFiler[] }

/**
 * The banks followed. Goldman Sachs, JPMorgan and BNP Paribas were the
 * reader's request; the other six complete the global investment banks that
 * file a 13F the vendor carries. On 2026-10-01 every CIK was checked against
 * the SEC's company record and every filer had Q2 2026 on the vendor. HSBC
 * is absent because the vendor holds no 13F for HSBC Holdings (CIK 1089113);
 * BNP Paribas's other SEC registrants either stopped filing (Asset Management
 * Europe, last 13F Q3 2008) or have no 13F on the vendor at all.
 */
export const BANKS: Bank[] = [
  { key: 'gs', name: 'Goldman Sachs', short: 'GS', filers: [{ cik: '0000886982', name: 'The Goldman Sachs Group, Inc.' }] },
  { key: 'jpm', name: 'JPMorgan Chase', short: 'JPM', filers: [{ cik: '0000019617', name: 'JPMorgan Chase & Co.' }] },
  {
    key: 'bnp', name: 'BNP Paribas', short: 'BNP',
    filers: [
      { cik: '0000872786', name: 'BNP Paribas' },
      { cik: '0001166588', name: 'BNP Paribas Financial Markets' },
      { cik: '0001520354', name: 'BNP Paribas Asset Management Holding S.A.' },
    ],
  },
  { key: 'ms', name: 'Morgan Stanley', short: 'MS', filers: [{ cik: '0000895421', name: 'Morgan Stanley' }] },
  { key: 'bac', name: 'Bank of America', short: 'BofA', filers: [{ cik: '0000070858', name: 'Bank of America Corporation' }] },
  { key: 'citi', name: 'Citigroup', short: 'Citi', filers: [{ cik: '0000831001', name: 'Citigroup Inc.' }] },
  { key: 'ubs', name: 'UBS', short: 'UBS', filers: [{ cik: '0001610520', name: 'UBS Group AG' }] },
  { key: 'barc', name: 'Barclays', short: 'Barc', filers: [{ cik: '0000312069', name: 'Barclays PLC' }] },
  { key: 'db', name: 'Deutsche Bank', short: 'DB', filers: [{ cik: '0000948046', name: 'Deutsche Bank AG' }] },
];

export const BANK_FILERS = BANKS.reduce((n, b) => n + b.filers.length, 0);

/** Two quarters of holdings and the dates list per filer, plus the split calendar in two halves. */
export const BANK_REQUESTS = BANK_FILERS * 3 + 2;

/** "Most of the banks" everywhere this portfolio counts them. */
export const BANK_QUORUM = 2 / 3;
export const quorumOf = (read: number) => Math.ceil(BANK_QUORUM * read);

/* ---------- quarters ----------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar quarter before. */
export const prevQuarter = (q: Pick<Quarter, 'year' | 'quarter'>) =>
  (q.quarter === 1 ? { year: q.year - 1, quarter: 4 } : { year: q.year, quarter: q.quarter - 1 });

/** The quarter's last day, as a 13F's "period of report" is dated. */
export function quarterEnd(q: Pick<Quarter, 'year' | 'quarter'>): string {
  const month = q.quarter * 3;
  const day = new Date(Date.UTC(q.year, month, 0)).getUTCDate();
  return `${q.year}-${pad(month)}-${pad(day)}`;
}

const qKey = (q: Pick<Quarter, 'year' | 'quarter'>) => `${q.year}-${q.quarter}`;
const qFrom = (q: Pick<Quarter, 'year' | 'quarter'>): Quarter => ({ ...q, date: quarterEnd(q) });

/**
 * The quarter pair to read: the newest quarter that most banks have filed
 * *and* filed the quarter before. Taking simply the newest filing would, a
 * week into a filing season, compare two banks and leave seven out; taking
 * a quarter one bank lacks would count that bank as holding nothing.
 */
export function pickQuarter(datesByBank: Quarter[][][]): Quarter | null {
  const has = (dates: Quarter[], q: Pick<Quarter, 'year' | 'quarter'>) => dates.some((d) => d.year === q.year && d.quarter === q.quarter);
  const pairOk = (dates: Quarter[], q: Quarter) => has(dates, q) && has(dates, prevQuarter(q));
  const all = new Map<string, Quarter>();
  for (const filers of datesByBank) for (const dates of filers) for (const d of dates) all.set(qKey(d), qFrom(d));
  const need = quorumOf(datesByBank.length);
  const newestFirst = [...all.values()].sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  return newestFirst.find((q) => datesByBank.filter((filers) => filers.some((dates) => pairOk(dates, q))).length >= need) ?? null;
}

/* ---------- one filing to long stock positions ---------------------------------- */

export interface StockLine { cusip: string; symbol: string | null; shares: number; value: number }

/**
 * A filing's long stock lines, merged by CUSIP. One filer reports the same
 * security several times over (once per manager it includes), so the merge
 * is what turns lines into positions.
 */
export function longStock(rows: unknown): Map<string, StockLine> {
  const out = new Map<string, StockLine>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows as any[]) {
    if (!r || String(r.putCallShare || '').trim()) continue;   // an option, of either kind
    if (String(r.sharesType || 'SH').toUpperCase() !== 'SH') continue; // principal amount: a bond or convertible
    if (!isNum(r.shares) || r.shares <= 0) continue;
    const cusip = String(r.securityCusip || r.cusip || '').trim().toUpperCase();
    const symbol = typeof r.symbol === 'string' && r.symbol.trim() ? r.symbol.trim().toUpperCase() : null;
    const key = cusip || symbol;
    if (!key) continue;
    const hit = out.get(key);
    if (hit) {
      hit.shares += r.shares;
      hit.value += isNum(r.value) ? r.value : 0;
      hit.symbol ??= symbol;
    } else {
      out.set(key, { cusip, symbol, shares: r.shares, value: isNum(r.value) ? r.value : 0 });
    }
  }
  return out;
}

/** One position as a bank holds it: both quarter ends, previous not yet split-adjusted. */
export interface RawHolding { shares: number; prevShares: number; value: number }

/**
 * One filer's two quarters, matched by CUSIP and rolled up to the ticker.
 * The ticker is the latest quarter's mapping where there is one, so a
 * renamed company is still one position rather than a sale and a purchase.
 */
export function filerHoldings(now: unknown, prev: unknown): Map<string, RawHolding> {
  const a = longStock(now);
  const b = longStock(prev);
  const out = new Map<string, RawHolding>();
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const n = a.get(key);
    const p = b.get(key);
    const symbol = n?.symbol ?? p?.symbol;
    if (!symbol) continue;
    const h = out.get(symbol) ?? { shares: 0, prevShares: 0, value: 0 };
    h.shares += n?.shares ?? 0;
    h.prevShares += p?.shares ?? 0;
    h.value += n?.value ?? 0;
    out.set(symbol, h);
  }
  return out;
}

/** Several filers of one bank, added together. */
export function mergeFilers(parts: Map<string, RawHolding>[]): Map<string, RawHolding> {
  const out = new Map<string, RawHolding>();
  for (const part of parts) {
    for (const [symbol, h] of part) {
      const t = out.get(symbol) ?? { shares: 0, prevShares: 0, value: 0 };
      t.shares += h.shares;
      t.prevShares += h.prevShares;
      t.value += h.value;
      out.set(symbol, t);
    }
  }
  return out;
}

/* ---------- splits ---------------------------------------------------------------- */

/**
 * Ticker -> how many shares one share before became, for every split with an
 * ex-date after `after` and on or before `through`. Reverse splits come out
 * below one. Two splits in the window multiply.
 */
export function splitFactors(rows: unknown, after: string, through: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(rows)) return out;
  const seen = new Set<string>();
  for (const r of rows as any[]) {
    const date = String(r?.date || '').slice(0, 10);
    if (!(date > after && date <= through)) continue;
    if (!isNum(r.numerator) || !isNum(r.denominator) || r.numerator <= 0 || r.denominator <= 0) continue;
    const symbol = String(r.symbol || '').trim().toUpperCase();
    // The calendar is read in two overlapping-safe halves; never apply one split twice.
    const k = `${symbol}|${date}|${r.numerator}|${r.denominator}`;
    if (!symbol || seen.has(k)) continue;
    seen.add(k);
    out.set(symbol, (out.get(symbol) ?? 1) * (r.numerator / r.denominator));
  }
  return out;
}

/* ---------- across banks ------------------------------------------------------------ */

export type BankMove = 'new' | 'added' | 'reduced' | 'sold' | 'unchanged' | 'none';

export function moveOf(shares: number, prevShares: number): BankMove {
  if (shares > 0 && prevShares <= 0) return 'new';
  if (shares <= 0 && prevShares > 0) return 'sold';
  if (shares <= 0) return 'none';
  return shares > prevShares ? 'added' : shares < prevShares ? 'reduced' : 'unchanged';
}

/** One company, across every bank read. */
export interface Stake {
  symbol: string;
  /** banks whose filings were read for both quarters — every count is "of" this */
  read: number;
  /** banks holding any shares at the latest quarter end */
  holders: number;
  /** banks with more shares than the quarter before, after splits; new positions included */
  adders: number;
  /** banks with fewer, sold-out positions included */
  cutters: number;
  /** the banks' combined shares at the latest quarter end */
  shares: number;
  /** and at the previous one, in today's shares (split-adjusted) */
  prevShares: number;
  /** shares / prevShares − 1; null when no bank held it before */
  change: number | null;
  /** the banks' combined reported value at the latest quarter end */
  value: number;
  /** the split factor applied to the previous quarter (1 when none) */
  split: number;
  byBank: Record<string, { shares: number; prevShares: number; value: number; move: BankMove }>;
  /* Filled per candidate by `withBaseline`, from the all-filer summary. */
  /** every 13F filer's combined share change, on the same split basis */
  allChange?: number | null;
  /** how much faster the banks accumulated than all filers: (1 + change) / (1 + allChange) − 1 */
  excess?: number | null;
  /** the banks' shares as a fraction of shares outstanding at the quarter end */
  ofCompany?: number | null;
  /** the same at the previous quarter end, against that day's share count */
  ofCompanyBefore?: number | null;
  /** ofCompany − ofCompanyBefore: how much more of the company the banks own, as a fraction */
  stakeGain?: number | null;
}

/** Every company any bank read holds or held, with the counts the rules test. */
export function stakesOf(banks: { key: string; holdings: Map<string, RawHolding> }[], splits: Map<string, number>): Map<string, Stake> {
  const out = new Map<string, Stake>();
  const read = banks.length;
  for (const { key, holdings } of banks) {
    for (const [symbol, h] of holdings) {
      let s = out.get(symbol);
      if (!s) {
        s = { symbol, read, holders: 0, adders: 0, cutters: 0, shares: 0, prevShares: 0, change: null, value: 0, split: splits.get(symbol) ?? 1, byBank: {} };
        out.set(symbol, s);
      }
      const prevShares = h.prevShares * s.split;
      const move = moveOf(h.shares, prevShares);
      s.byBank[key] = { shares: h.shares, prevShares, value: h.value, move };
      if (h.shares > 0) s.holders += 1;
      if (move === 'new' || move === 'added') s.adders += 1;
      if (move === 'sold' || move === 'reduced') s.cutters += 1;
      s.shares += h.shares;
      s.prevShares += prevShares;
      s.value += h.value;
    }
  }
  for (const s of out.values()) s.change = s.prevShares > 0 ? s.shares / s.prevShares - 1 : null;
  return out;
}

/**
 * The banks against every 13F filer in the same company, from the vendor's
 * per-symbol summary for the same quarter. The summary's previous count is
 * split-adjusted by the same factor as the banks', so a split cancels out
 * either way; a merger paid in shares raises both and cancels too.
 *
 * Shares outstanding come from the same row — the vendor's filer total over
 * its ownership percentage, at each quarter end — so the banks' stake is
 * measured on the day it describes, not against today's share count. The
 * previous stake uses the previous quarter's shares as filed (before the
 * split restatement), because that day's share count is pre-split too.
 *
 * Why the rule is the all-filer comparison and not the stake: in Devon's
 * all-stock merger the banks' stake of the enlarged company *rose* (they had
 * held more of the target), though none of them bought a share. Every other
 * holder received merger shares as well, which is what the comparison sees.
 */
export function withBaseline(stake: Stake, summary: any): Stake {
  const now = summary?.numberOf13Fshares;
  const last = summary?.lastNumberOf13Fshares;
  const allChange = isNum(now) && isNum(last) && last > 0 ? now / (last * stake.split) - 1 : null;
  const excess = isNum(stake.change) && isNum(allChange) && allChange > -1 ? (1 + stake.change) / (1 + allChange) - 1 : null;
  const outstanding = (shares: unknown, pctHeld: unknown) => (isNum(shares) && isNum(pctHeld) && pctHeld > 0 ? shares / (pctHeld / 100) : null);
  const outNow = outstanding(now, summary?.ownershipPercent);
  const outBefore = outstanding(last, summary?.lastOwnershipPercent);
  const ofCompany = outNow ? stake.shares / outNow : null;
  const ofCompanyBefore = outBefore ? stake.prevShares / stake.split / outBefore : null;
  return {
    ...stake, allChange, excess, ofCompany, ofCompanyBefore,
    stakeGain: isNum(ofCompany) && isNum(ofCompanyBefore) ? ofCompany - ofCompanyBefore : null,
  };
}

/* ---------- reading the banks ---------------------------------------------------------- */

export type FilerState = 'read' | 'behind' | 'failed';

export interface FilerRead extends BankFiler {
  state: FilerState;
  message: string | null;
  filedOn: string | null;
  filingUrl: string | null;
  /** long stock positions with a ticker, latest quarter */
  positions: number;
  /** every line's reported value, options and bonds included — the filing's own total */
  value: number;
}

export interface BankRead {
  key: string;
  name: string;
  short: string;
  read: boolean;
  filers: FilerRead[];
  positions: number;
  value: number;
  adds: number;
  cuts: number;
}

export interface BankBook {
  status: FeedResult['status'];
  message: string | null;
  latest: Quarter | null;
  previous: Quarter | null;
  banks: BankRead[];
  /** banks read for both quarters */
  read: number;
  stakes: Map<string, Stake>;
  /** whether the split calendar answered, and how many tickers it adjusted */
  splits: { read: boolean; applied: string[] };
  requests: number;
}

const safeLink = (u: unknown) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

const emptyBook = (status: FeedResult['status'], message: string | null, banks: BankRead[] = [], requests = 0): BankBook => ({
  status, message, latest: null, previous: null, banks, read: 0, stakes: new Map(), splits: { read: false, applied: [] }, requests,
});

/**
 * Read every bank's latest two 13Fs and the split calendar between them.
 *
 * Fails closed: if fewer than two-thirds of the banks can be read for the
 * chosen quarter pair, the book is an error rather than a thinner table,
 * because "most of the banks" over three of them is a different claim.
 */
export async function loadBankBook({ onProgress }: { onProgress?: (done: number, total: number) => void } = {}): Promise<BankBook> {
  let done = 0;
  let requests = 0;
  const tick = () => onProgress?.(++done, BANK_REQUESTS);
  const filers = BANKS.flatMap((b) => b.filers.map((f) => ({ bank: b.key, ...f })));

  const dated = await mapLimited(filers, async (f) => {
    const r = await fetchFund13F('dates', f.cik);
    requests += 1;
    tick();
    return { ...f, result: r, quarters: r.status === 'ok' ? quartersOf(r.data) : [] };
  }, 4);

  if (dated.every((d) => d.result.status === 'gated')) {
    return emptyBook('gated', dated[0]?.result.message || 'not part of the current data coverage', [], requests);
  }
  if (dated.every((d) => d.result.status !== 'ok')) {
    const first = dated.find((d) => d.result.status !== 'ok')?.result;
    return emptyBook(first?.status === 'skipped' ? 'skipped' : 'error', first?.message || 'No 13F filing dates were returned.', [], requests);
  }

  const latest = pickQuarter(BANKS.map((b) => dated.filter((d) => d.bank === b.key).map((d) => d.quarters)));
  if (!latest) {
    return emptyBook('error', `Fewer than ${quorumOf(BANKS.length)} of the ${BANKS.length} banks have two consecutive quarters of 13F filings on file.`, [], requests);
  }
  const previous = qFrom(prevQuarter(latest));
  const hasPair = (qs: Quarter[]) => [latest, previous].every((q) => qs.some((d) => d.year === q.year && d.quarter === q.quarter));

  const loaded = await mapLimited(dated, async (d) => {
    const base: FilerRead = { cik: d.cik, name: d.name, state: 'behind', message: null, filedOn: null, filingUrl: null, positions: 0, value: 0 };
    // Nothing to fetch for this filer: its two holdings requests count as done.
    const skip = (read: FilerRead) => { tick(); tick(); return { d, read, holdings: null }; };
    if (d.result.status !== 'ok') return skip({ ...base, state: 'failed', message: d.result.message ?? null });
    if (!hasPair(d.quarters)) return skip({ ...base, message: `No ${quarterLabel(latest)} and ${quarterLabel(previous)} pair on file.` });
    const [now, prev] = await Promise.all([
      fetchFund13F('holdings', d.cik, latest).finally(tick),
      fetchFund13F('holdings', d.cik, previous).finally(tick),
    ]);
    requests += 2;
    const bad = [now, prev].find((r) => r.status !== 'ok');
    if (bad) return { d, read: { ...base, state: 'failed', message: bad.message ?? null } as FilerRead, holdings: null };
    const rows = now.data as any[];
    const first = rows[0];
    const holdings: Map<string, RawHolding> | null = filerHoldings(rows, prev.data);
    return {
      d,
      holdings,
      read: {
        ...base,
        state: 'read' as const,
        filedOn: typeof first?.filingDate === 'string' ? first.filingDate.slice(0, 10) : null,
        filingUrl: safeLink(first?.link),
        positions: [...holdings.values()].filter((h) => h.shares > 0).length,
        value: rows.reduce((s, r) => s + (isNum(r?.value) ? r.value : 0), 0),
      },
    };
  }, 4);

  /* The split calendar, in two halves of the quarter: the vendor caps some
     calendar ranges at about ninety days, and a split it silently dropped
     would come back as every bank "buying" the stock. */
  const start = previous.date;
  const mid = new Date(Date.parse(`${start}T00:00:00Z`) + 46 * 864e5).toISOString().slice(0, 10);
  const dayAfter = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
  const halves = await Promise.all([
    fetchCalendar('splits', dayAfter(start), mid).finally(tick),
    fetchCalendar('splits', dayAfter(mid), latest.date).finally(tick),
  ]);
  requests += 2;
  const splitsRead = halves.every((h) => h.status === 'ok');
  const splits = splitFactors(halves.flatMap((h) => (h.status === 'ok' ? h.data! : [])), start, latest.date);

  // A bank is read when at least one of its filers is; BNP Paribas's three are added together.
  const merged = BANKS.map((b) => {
    const parts = loaded.filter((l) => l.d.bank === b.key && l.holdings).map((l) => l.holdings!);
    return { key: b.key, holdings: parts.length ? mergeFilers(parts) : null };
  });
  const stakes = stakesOf(merged.filter((m) => m.holdings).map((m) => ({ key: m.key, holdings: m.holdings! })), splits);

  const banks: BankRead[] = BANKS.map((b) => {
    const mine = loaded.filter((l) => l.d.bank === b.key);
    const row: BankRead = {
      key: b.key, name: b.name, short: b.short,
      read: !!merged.find((m) => m.key === b.key)?.holdings,
      filers: mine.map((l) => l.read),
      positions: 0, value: mine.reduce((s, l) => s + l.read.value, 0), adds: 0, cuts: 0,
    };
    for (const s of stakes.values()) {
      const m = s.byBank[b.key];
      if (!m) continue;
      if (m.shares > 0) row.positions += 1;
      if (m.move === 'new' || m.move === 'added') row.adds += 1;
      if (m.move === 'sold' || m.move === 'reduced') row.cuts += 1;
    }
    return row;
  });

  const read = banks.filter((b) => b.read).length;
  const applied = [...splits.keys()].filter((s) => stakes.has(s)).sort();
  if (read < quorumOf(BANKS.length)) {
    const missing = banks.filter((b) => !b.read).map((b) => b.name).join(', ');
    return {
      ...emptyBook('error', `Only ${read} of the ${BANKS.length} banks could be read for ${quarterLabel(latest)} (not read: ${missing}). The portfolio needs at least ${quorumOf(BANKS.length)}.`, banks, requests),
      latest, previous,
    };
  }
  return { status: 'ok', message: null, latest, previous, banks, read, stakes, splits: { read: splitsRead, applied }, requests };
}
