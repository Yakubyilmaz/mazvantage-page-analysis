/* ==========================================================================
   Maz Vantage — the Insider Trading tab's arithmetic

   Two record sets, both read as filed and neither graded:

   - **Form 3 and Form 4 rows** — what directors, officers and 10% holders
     reported doing with the company's stock. A Form 4 also carries awards,
     option exercises, gifts and shares withheld to pay tax on a vesting, and
     none of those is a decision to buy or sell. So every row keeps its SEC
     transaction code, and the chart and the summary count only `P` and `S`
     as trades unless the reader asks for everything.
   - **Rating actions** — each firm's own call on the stock, dated: who moved
     from what to what. The firms' words are kept as published: Overweight,
     Outperform and Buy are three firms' names for roughly the same view.

   Pure functions over plain rows, so the tests can pin them without a page.
   ========================================================================== */

import { isNum, type Maybe } from './format';

/* ---------- transaction codes -------------------------------------------- */

export type TxCategory = 'buy' | 'sell' | 'award' | 'exercise' | 'tax' | 'gift' | 'other' | 'holding';

/**
 * The SEC's Form 4 transaction codes, in the words a reader needs. `P` and
 * `S` are the only two that are somebody choosing to trade.
 */
export const TX_CODES: Record<string, { label: string; category: TxCategory; meaning: string }> = {
  P: { label: 'Purchase', category: 'buy', meaning: 'Bought on the open market or in a private deal.' },
  S: { label: 'Sale', category: 'sell', meaning: 'Sold on the open market or in a private deal.' },
  A: { label: 'Award', category: 'award', meaning: 'Granted or awarded by the company — pay, not a purchase.' },
  M: { label: 'Exercise / vesting', category: 'exercise', meaning: 'An option exercised or a stock unit converted into shares.' },
  X: { label: 'Option exercise', category: 'exercise', meaning: 'An in-the-money or at-the-money option exercised.' },
  O: { label: 'Option exercise', category: 'exercise', meaning: 'An out-of-the-money option exercised.' },
  C: { label: 'Conversion', category: 'exercise', meaning: 'A derivative security converted into shares.' },
  F: { label: 'Tax withholding', category: 'tax', meaning: 'Shares handed back to pay an exercise price or the tax on a vesting.' },
  G: { label: 'Gift', category: 'gift', meaning: 'A gift, given or received.' },
  D: { label: 'Returned to company', category: 'other', meaning: 'Shares disposed of to the company itself.' },
  E: { label: 'Expiry', category: 'other', meaning: 'A short derivative position expired.' },
  H: { label: 'Expiry', category: 'other', meaning: 'A long derivative position expired or was cancelled.' },
  I: { label: 'Discretionary', category: 'other', meaning: 'A discretionary transaction under a benefit plan.' },
  J: { label: 'Other', category: 'other', meaning: 'Another acquisition or disposition, described in the filing.' },
  K: { label: 'Equity swap', category: 'other', meaning: 'An equity swap or similar instrument.' },
  L: { label: 'Small acquisition', category: 'other', meaning: 'A small acquisition the rules let an insider report late.' },
  U: { label: 'Tender', category: 'other', meaning: 'Shares tendered in a change of control.' },
  V: { label: 'Voluntary report', category: 'other', meaning: 'A transaction reported voluntarily.' },
  W: { label: 'Inheritance', category: 'other', meaning: 'Acquired or disposed of by will or the laws of descent.' },
  Z: { label: 'Voting trust', category: 'other', meaning: 'Deposited into or withdrawn from a voting trust.' },
};

/** The table's filter chips, in reading order. */
export const TX_CATEGORIES: { id: TxCategory; label: string; blurb: string }[] = [
  { id: 'buy', label: 'Purchases', blurb: 'Open-market and private purchases (code P) — an insider spending their own money on the stock.' },
  { id: 'sell', label: 'Sales', blurb: 'Open-market and private sales (code S). Much of this is pre-arranged under a 10b5-1 plan, which the filing does not always flag.' },
  { id: 'award', label: 'Awards', blurb: 'Shares and units granted by the company (code A). Pay arriving, not a view on the price.' },
  { id: 'exercise', label: 'Exercises & vesting', blurb: 'Options exercised and stock units converted into shares (codes M, X, O, C).' },
  { id: 'tax', label: 'Tax withholding', blurb: 'Shares handed back to the company to cover the tax on a vesting or an exercise price (code F). The insider did not choose to sell them.' },
  { id: 'gift', label: 'Gifts', blurb: 'Gifts given or received (code G), often to family trusts or charities.' },
  { id: 'other', label: 'Other', blurb: 'Every other code: returns to the company, expiries, inheritances, trusts.' },
  { id: 'holding', label: 'Holdings statements', blurb: 'Form 3: what a new insider owned on joining. A starting position, not a trade.' },
];

/* ---------- one row ------------------------------------------------------- */

export interface InsiderTx {
  /** the trade date; the filing date when the row carries none */
  date: string;
  filed: string | null;
  /** as filed with the SEC — surname first — title-cased when it arrives in capitals */
  name: string;
  role: string;
  /** the SEC transaction code, `''` for a holdings statement */
  code: string;
  label: string;
  category: TxCategory;
  /** `A` acquired, `D` disposed, null when the filing says neither */
  direction: 'A' | 'D' | null;
  shares: number | null;
  /** null when the filing carries a zero — an award or an exercise has no trade price */
  price: number | null;
  value: number | null;
  /** what the insider held of this security after the transaction */
  owned: number | null;
  security: string;
  /** units, options and the like: they mirror a common-stock row, so they never chart */
  derivative: boolean;
  indirect: boolean;
  form: string;
  url: string | null;
}

const ENTITY = /\b(inc|llc|lp|llp|ltd|plc|corp|co|trust|fund|partners|holdings|capital|management|group|foundation)\b/i;
const UPPER_WORDS = /\b(Llc|Lp|Llp|Plc|Ii|Iii|Iv|Vi|Usa|Uk)\b/g;

/**
 * A filer's name, readable. The SEC files people surname first and often in
 * capitals ("COOK TIMOTHY D"). The order is kept — reordering is guesswork
 * for double surnames and fails outright on a trust or a fund — and only the
 * capitals are undone. A name that arrives in mixed case is the filer's own
 * and is left alone.
 */
export function insiderName(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Unnamed filer';
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase()
    .replace(/(^|[\s\-'(/&.])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .replace(/\bMc([a-z])/g, (_m, c: string) => `Mc${c.toUpperCase()}`)
    .replace(UPPER_WORDS, (w) => w.toUpperCase());
}

/** Whether a filer is an entity rather than a person — a fund, a trust, a holding company. */
export const isEntity = (name: string) => ENTITY.test(name);

/** "director, officer: Executive Chair" -> "Director, Executive Chair". */
export function insiderRole(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\b(officer|other):\s*/gi, '')
    .replace(/\b(10|ten) ?(percent|%) owner\b/gi, '10% owner')
    .replace(/\bdirector\b/g, 'Director')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
}

const DERIVATIVE = /\bunits?\b|option|\bright|warrant|phantom|swap|\bcall\b|\bput\b|\bnotes?\b|debenture/i;

const num = (v: unknown): number | null => (isNum(v) ? v : null);

/** One filed row, read. */
export function readInsiderRow(r: any): InsiderTx | null {
  if (!r || typeof r !== 'object') return null;
  const date = r.transactionDate || r.filingDate;
  if (!date) return null;

  const code = String(r.transactionType || '').split('-')[0].trim().toUpperCase();
  const known = TX_CODES[code];
  const form = String(r.formType || '').trim();
  // A row with no code is a holdings statement on a Form 3 — what a new
  // insider already owned — and on any other form an unexplained entry.
  const category: TxCategory = known ? known.category : !code && form === '3' ? 'holding' : 'other';
  const label = known ? known.label : category === 'holding' ? 'Holdings statement' : code ? `Code ${code}` : 'Unspecified';

  const ad = String(r.acquisitionOrDisposition || '').trim().toUpperCase();
  const shares = num(r.securitiesTransacted);
  const price = isNum(r.price) && r.price > 0 ? r.price : null;
  const security = String(r.securityName || '').trim() || 'Not stated';

  return {
    date: String(date).slice(0, 10),
    filed: r.filingDate ? String(r.filingDate).slice(0, 10) : null,
    name: insiderName(r.reportingName),
    role: insiderRole(r.typeOfOwner),
    code,
    label,
    category,
    direction: ad === 'A' || ad === 'D' ? ad : null,
    shares,
    price,
    value: shares != null && price != null ? shares * price : null,
    owned: num(r.securitiesOwned),
    security,
    derivative: DERIVATIVE.test(security),
    indirect: String(r.directOrIndirect || '').trim().toUpperCase() === 'I',
    form,
    url: typeof r.url === 'string' && /^https:\/\/www\.sec\.gov\//.test(r.url) ? r.url : null,
  };
}

/** Every row, newest trade first; a tie goes to the later filing. */
export function normaliseInsiderTrades(raw: unknown): InsiderTx[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(readInsiderRow).filter((r): r is InsiderTx => r !== null)
    .sort((x, y) => (y.date.localeCompare(x.date)) || ((y.filed || '').localeCompare(x.filed || '')));
}

/* ---------- months -------------------------------------------------------- */

/** "2026-09-17" -> "2026-09". */
export const monthOf = (date: string) => date.slice(0, 7);

/** The month `n` months after `month` ("2026-01", -2 -> "2025-11"). */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Every month from `from` to `to`, both included. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 1200; m = addMonths(m, 1)) out.push(m);
  return out;
}

export interface MonthFlow {
  month: string;
  /** open-market purchases (code P) */
  buyShares: number;
  buyValue: number;
  buys: number;
  /** open-market sales (code S) */
  sellShares: number;
  sellValue: number;
  sells: number;
  /** every other acquisition: awards, exercises, gifts received */
  otherInShares: number;
  /** every other disposal: tax withholding, gifts given, returns */
  otherOutShares: number;
}

const emptyMonth = (month: string): MonthFlow => ({
  month, buyShares: 0, buyValue: 0, buys: 0, sellShares: 0, sellValue: 0, sells: 0, otherInShares: 0, otherOutShares: 0,
});

/**
 * Shares and money moved per month, from `from` to `to`. Only rows in the
 * stock itself count: a vesting files twice, once as units going out and
 * once as shares coming in, and charting both would draw every vesting as
 * a buy and a sale of the same size. Holdings statements are not trades.
 */
export function monthlyFlows(rows: InsiderTx[], from: string, to: string): MonthFlow[] {
  const months = monthsBetween(from, to);
  const at = new Map(months.map((m) => [m, emptyMonth(m)]));
  for (const r of rows) {
    if (r.derivative || r.category === 'holding' || !isNum(r.shares)) continue;
    const b = at.get(monthOf(r.date));
    if (!b) continue;
    if (r.category === 'buy') {
      b.buys += 1; b.buyShares += r.shares; b.buyValue += r.value ?? 0;
    } else if (r.category === 'sell') {
      b.sells += 1; b.sellShares += r.shares; b.sellValue += r.value ?? 0;
    } else if (r.direction === 'A') {
      b.otherInShares += r.shares;
    } else if (r.direction === 'D') {
      b.otherOutShares += r.shares;
    }
  }
  return months.map((m) => at.get(m)!);
}

/* ---------- the summary --------------------------------------------------- */

export interface Side { trades: number; shares: number; value: number; insiders: number }
export interface InsiderSummary {
  buys: Side;
  sells: Side;
  /** open-market value bought less sold */
  net: number;
  /** shares withheld for tax (code F) */
  withheld: number;
  /** shares awarded or vested (codes A, M, X, O, C, acquired) */
  awarded: number;
  /** people and entities who filed anything in the window */
  filers: number;
  /** the largest open-market traders, by money moved */
  top: { name: string; role: string; bought: number; sold: number; trades: number; last: string }[];
}

/** What insiders did from `since` (inclusive) on, counting the stock itself only. */
export function summariseInsiders(rows: InsiderTx[], since: string): InsiderSummary {
  const inWindow = rows.filter((r) => r.date >= since && !r.derivative && r.category !== 'holding');
  const side = (cat: 'buy' | 'sell'): Side => {
    const list = inWindow.filter((r) => r.category === cat);
    return {
      trades: list.length,
      shares: list.reduce((t, r) => t + (r.shares ?? 0), 0),
      value: list.reduce((t, r) => t + (r.value ?? 0), 0),
      insiders: new Set(list.map((r) => r.name)).size,
    };
  };
  const buys = side('buy');
  const sells = side('sell');

  const people = new Map<string, InsiderSummary['top'][number]>();
  for (const r of inWindow) {
    if (r.category !== 'buy' && r.category !== 'sell') continue;
    const p = people.get(r.name) ?? { name: r.name, role: r.role, bought: 0, sold: 0, trades: 0, last: r.date };
    if (r.category === 'buy') p.bought += r.value ?? 0; else p.sold += r.value ?? 0;
    p.trades += 1;
    if (r.date > p.last) p.last = r.date;
    people.set(r.name, p);
  }

  return {
    buys,
    sells,
    net: buys.value - sells.value,
    withheld: inWindow.filter((r) => r.category === 'tax').reduce((t, r) => t + (r.shares ?? 0), 0),
    awarded: inWindow.filter((r) => (r.category === 'award' || r.category === 'exercise') && r.direction !== 'D')
      .reduce((t, r) => t + (r.shares ?? 0), 0),
    filers: new Set(inWindow.map((r) => r.name)).size,
    top: [...people.values()].sort((x, y) => (y.bought + y.sold) - (x.bought + x.sold)).slice(0, 5),
  };
}

/* ==========================================================================
   Rating actions — each firm's dated call
   ========================================================================== */

export type RatingAction = 'upgrade' | 'downgrade' | 'maintain' | 'initiate';

export const ACTION_LABEL: Record<RatingAction, string> = {
  upgrade: 'Upgrades',
  downgrade: 'Downgrades',
  maintain: 'Maintains',
  initiate: 'Initiates',
};

export interface RatingChange {
  date: string;
  firm: string;
  from: string | null;
  to: string | null;
  action: RatingAction;
}

/**
 * The action as a word the page can colour. A row with no earlier rating is
 * a firm starting coverage, whatever the action field says: there is nothing
 * for it to have maintained.
 */
export function readAction(action: unknown, from: string | null): RatingAction {
  const a = String(action ?? '').trim().toLowerCase();
  if (/^up/.test(a)) return 'upgrade';
  if (/^down/.test(a)) return 'downgrade';
  if (/^(init|start|coverage)/.test(a) || !from) return 'initiate';
  return 'maintain';
}

const grade = (v: unknown) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s || null;
};

export function normaliseRatingActions(raw: unknown): RatingChange[] {
  if (!Array.isArray(raw)) return [];
  const out: RatingChange[] = [];
  for (const r of raw) {
    const date = r?.date ? String(r.date).slice(0, 10) : '';
    const firm = String(r?.gradingCompany ?? '').trim();
    if (!date || !firm) continue;
    const from = grade(r.previousGrade);
    out.push({ date, firm, from, to: grade(r.newGrade), action: readAction(r.action, from) });
  }
  return out.sort((x, y) => y.date.localeCompare(x.date) || x.firm.localeCompare(y.firm));
}

export type RatingSide = 'buy' | 'hold' | 'sell';

/**
 * Which side of the fence a firm's own word falls on. Sell first, because
 * "Underperform" contains "perform"; then buy; then hold. A word none of the
 * three knows stays unplaced rather than guessed.
 */
export function ratingSide(word: Maybe<string>): RatingSide | null {
  const w = String(word ?? '').toLowerCase();
  if (!w) return null;
  if (/\b(strong sell|sell|underweight|underperform|reduce|negative|trim)\b/.test(w)) return 'sell';
  if (/\b(strong buy|buy|outperform|overweight|positive|accumulate|add|top pick|conviction)\b/.test(w)) return 'buy';
  if (/\b(hold|neutral|perform|equal[ -]weight|sector weight|market weight|peer weight|in[ -]line|mixed|fair value)\b/.test(w)) return 'hold';
  return null;
}

/** Counts of each action from `since` (inclusive) on. */
export function actionCounts(rows: RatingChange[], since: string): Record<RatingAction, number> {
  const out: Record<RatingAction, number> = { upgrade: 0, downgrade: 0, maintain: 0, initiate: 0 };
  for (const r of rows) if (r.date >= since) out[r.action] += 1;
  return out;
}

/**
 * Each firm's latest call, for the firms that published one from `since` on.
 * A firm that last spoke three years ago has no current view worth quoting.
 */
export function latestByFirm(rows: RatingChange[], since: string): RatingChange[] {
  const seen = new Map<string, RatingChange>();
  for (const r of rows) {
    if (r.date < since) continue;
    const prev = seen.get(r.firm);
    if (!prev || r.date > prev.date) seen.set(r.firm, r);
  }
  return [...seen.values()].sort((x, y) => y.date.localeCompare(x.date) || x.firm.localeCompare(y.firm));
}

/** An ISO date `days` before `now`. */
export const isoBefore = (now: number, days: number) => new Date(now - days * 864e5).toISOString().slice(0, 10);
