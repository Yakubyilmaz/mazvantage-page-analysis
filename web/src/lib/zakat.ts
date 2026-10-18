/* ==========================================================================
   Maz Vantage — zakat on shares

   The arithmetic of zakat on a share portfolio, on the methods the published
   rulings give. It takes no position between them: the reader chooses, and
   the page names the ruling behind each choice.

   Sources (read 2026-10-17):
   - International Islamic Fiqh Academy (OIC), Resolution No. 28 (3/4),
     "Zakāh on Company Shares", Jeddah, 6–11 February 1988
     (https://iifa-aifi.org/en/32294.html). Where the company does not pay
     zakat (no US-listed company does), the shareholder pays. If the holder
     can work out the zakat owed from the company's accounts, he pays that.
     If not: shares held for trading pay 2.5% on market value; shares held for
     annual income pay nothing on the share value — only on the dividends,
     which join the holder's other wealth.
   - Fiqh Council of North America, "Zakāh on Stocks"
     (https://fiqhcouncil.org/zakah-on-stocks/). Trading: the full market
     value. Long-term: the company's zakatable assets — cash, receivables and
     inventory — over the company's value, applied to the market value held;
     where the balance sheet is unavailable, it takes 30% of market value as
     a reasonable estimate (from recent S&P 500 averages, its footnote says).
   - Nisab: 85 g of gold or 595 g of silver (20 mithqal, 200 dirham).
   - Rate: 2.5% for a lunar (Hijri) year. Paid on a Gregorian year, the rate
     is commonly scaled by the extra days, 2.5% × 365 ÷ 354 (about 2.578%,
     often quoted 2.577%).

   A calculation, not a ruling. Nothing here decides which method a reader's
   scholar would choose, whether the year (hawl) has passed, or what else the
   reader owns; the page asks for the other wealth so the nisab test is about
   the whole, not the portfolio alone.
   ========================================================================== */

export const TROY_OUNCE_GRAMS = 31.1034768;
export const NISAB_GRAMS = { gold: 85, silver: 595 } as const;
export type NisabMetal = keyof typeof NISAB_GRAMS;

export const LUNAR_RATE = 0.025;
export const SOLAR_RATE = (0.025 * 365) / 354;
export type YearBasis = 'lunar' | 'solar';
export const rateFor = (basis: YearBasis) => (basis === 'solar' ? SOLAR_RATE : LUNAR_RATE);

/** The share of market value the FCNA treats as zakatable when the balance sheet is unavailable. */
export const FCNA_PROXY = 0.3;

export type Intention = 'trading' | 'long';
/** How a long-term holding is assessed. */
export type LongMethod = 'lookthrough' | 'proxy' | 'dividends';

export const LONG_METHODS: { id: LongMethod; label: string; basis: string }[] = [
  { id: 'lookthrough', label: 'The company’s zakatable assets',
    basis: 'Your share of the company’s cash, receivables and inventory. The first course in both the Fiqh Academy’s resolution and the Fiqh Council’s ruling.' },
  { id: 'proxy', label: '30% of market value',
    basis: 'The Fiqh Council’s estimate where the company’s balance sheet is unavailable.' },
  { id: 'dividends', label: 'Dividends only',
    basis: 'The Fiqh Academy’s course where the holder cannot work out the company’s figures: nothing on the share value; the dividends join your cash.' },
];

/* ---------- one company -------------------------------------------------------------- */

export interface CompanyFigures {
  cash?: number | null;
  receivables?: number | null;
  inventory?: number | null;
  marketCap?: number | null;
  /** the balance sheet's date */
  asOf?: string | null;
}

export interface LookThrough {
  /** zakatable assets ÷ market capitalisation, capped at 1 */
  share: number | null;
  assets: number | null;
  /** lines the balance sheet did not carry, counted as zero */
  missing: ('cash' | 'receivables' | 'inventory')[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The share of a company's market value that is zakatable on the look-through
 * method. Cash is required; a receivables or inventory line the data does not
 * carry counts as zero and is named, so the figure is a floor, never inflated.
 */
export function lookThrough(c: CompanyFigures | null | undefined): LookThrough {
  if (!c || !finite(c.cash) || !finite(c.marketCap) || c.marketCap <= 0) return { share: null, assets: null, missing: [] };
  const missing: LookThrough['missing'] = [];
  const part = (v: number | null | undefined, name: 'receivables' | 'inventory') => {
    if (finite(v) && v >= 0) return v;
    missing.push(name);
    return 0;
  };
  const assets = Math.max(0, c.cash) + part(c.receivables, 'receivables') + part(c.inventory, 'inventory');
  return { share: Math.min(1, assets / c.marketCap), assets, missing };
}

/** The balance-sheet lines this method reads, from one row of the statement feed. */
export function figuresFrom(balance: any, marketCap: number | null | undefined): CompanyFigures {
  const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    cash: n(balance?.cashAndShortTermInvestments ?? balance?.cashAndCashEquivalents),
    receivables: n(balance?.netReceivables ?? balance?.accountsReceivables),
    inventory: n(balance?.inventory),
    marketCap: finite(marketCap) ? marketCap : null,
    asOf: balance?.date ?? null,
  };
}

/* ---------- one holding -------------------------------------------------------------- */

export interface HoldingInput {
  value: number | null;
  intention: Intention;
  method: LongMethod;
  /** the look-through share for this company, when its figures are loaded */
  look: number | null;
}

export interface HoldingZakat {
  /** the fraction of the market value that counts */
  share: number | null;
  /** the amount that counts towards zakatable wealth */
  base: number | null;
  /** why the share is what it is */
  basis: string;
}

export function holdingBase(h: HoldingInput): HoldingZakat {
  if (h.intention === 'trading') {
    return { share: 1, base: finite(h.value) ? h.value : null, basis: 'Held to sell: the whole market value, as trade goods.' };
  }
  if (h.method === 'dividends') return { share: 0, base: finite(h.value) ? 0 : null, basis: 'Dividends only: count the dividends with your cash.' };
  const share = h.method === 'proxy' ? FCNA_PROXY : h.look;
  const basis = h.method === 'proxy' ? 'Long-term, 30% of market value (FCNA estimate).' : 'Long-term, your share of the company’s zakatable assets.';
  if (share == null) return { share: null, base: null, basis: `${basis} The company’s figures are not loaded.` };
  return { share, base: finite(h.value) ? h.value * share : null, basis };
}

/* ---------- the whole ---------------------------------------------------------------- */

export interface OtherWealth {
  cash?: number | null;
  metals?: number | null;
  owedToYou?: number | null;
  goods?: number | null;
  /** debts due now, deducted */
  debts?: number | null;
}

export interface ZakatResult {
  shares: number;
  other: number;
  debts: number;
  wealth: number;
  nisab: number | null;
  /** null when the nisab cannot be valued (no metal price) */
  aboveNisab: boolean | null;
  rate: number;
  due: number | null;
}

export function nisabValue(metal: NisabMetal, pricePerGram: number | null | undefined): number | null {
  return finite(pricePerGram) && pricePerGram > 0 ? NISAB_GRAMS[metal] * pricePerGram : null;
}

/** Price per gram from a price per troy ounce. */
export const perGram = (perOunce: number | null | undefined) => (finite(perOunce) && perOunce > 0 ? perOunce / TROY_OUNCE_GRAMS : null);

export function zakatDue(bases: (number | null)[], other: OtherWealth, nisab: number | null, basis: YearBasis): ZakatResult {
  const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, v) => a + (finite(v) && v > 0 ? v : 0), 0);
  const shares = sum(bases);
  const others = sum([other.cash, other.metals, other.owedToYou, other.goods]);
  const debts = sum([other.debts]);
  const wealth = Math.max(0, shares + others - debts);
  const rate = rateFor(basis);
  const aboveNisab = nisab == null ? null : wealth >= nisab;
  return { shares, other: others, debts, wealth, nisab, aboveNisab, rate, due: aboveNisab === false ? 0 : aboveNisab === true ? wealth * rate : null };
}
