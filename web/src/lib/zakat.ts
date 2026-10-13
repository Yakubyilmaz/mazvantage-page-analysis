/* ==========================================================================
   Maz Vantage — zakat on shares

   Two methods, because scholars use both and the right one depends on why
   the shares are held. Each line says which it used.

   - **Held to trade** (bought to sell at a profit): the shares are trade
     goods, so zakat is due on their full market value on the zakat date.
   - **Held for the long term** (bought for the dividend and the business):
     zakat is due on the shareholder's part of the company's own zakatable
     assets — cash and short-term investments, receivables and inventory —
     per share, times shares held (AAOIFI Shari'ah Standard 35's approach).
     Whether the company's current liabilities are deducted first is a point
     scholars differ on; it is the reader's switch, off by default.
     Where the balance sheet cannot be read, the line falls back to nothing
     rather than to market value, and says so.

   The rate is 2.5% for a lunar (hijri) year, or 2.577% when the reader keeps
   a solar year (2.5% × 365.25 / 354.37). Zakat is due only when the reader's
   total zakatable wealth has stayed above the nisab for a full year; that
   test needs everything the reader owns, so it is theirs, and the page says
   so. A calculation, not a ruling.
   ========================================================================== */

import { isNum } from './format';

export const ZAKAT_RATE = { lunar: 0.025, solar: 0.02577 } as const;
export type ZakatYear = keyof typeof ZAKAT_RATE;
export type Intent = 'trade' | 'hold';

export interface ZakatInput {
  symbol: string;
  shares: number | null;
  intent: Intent;
}

export interface ZakatLine extends ZakatInput {
  price: number | null;
  value: number | null;
  /** the company's zakatable assets per share, for the long-term method */
  perShare: number | null;
  /** what the rate applies to */
  base: number | null;
  zakat: number | null;
  note: string;
}

const n = (v: unknown) => (isNum(v) ? v : null);

/** The company's zakatable assets per share, from its newest balance sheet. */
export function zakatablePerShare(balance: any, shares: number | null, { deductCurrentLiabilities = false } = {}): number | null {
  if (!balance || !isNum(shares) || shares <= 0) return null;
  const cash = n(balance.cashAndShortTermInvestments) ?? n(balance.cashAndCashEquivalents);
  if (cash == null) return null;
  const receivables = n(balance.netReceivables) ?? n(balance.accountsReceivables) ?? 0;
  const inventory = n(balance.inventory) ?? 0;
  let assets = cash + receivables + inventory;
  if (deductCurrentLiabilities) assets -= n(balance.totalCurrentLiabilities) ?? 0;
  return Math.max(0, assets) / shares;
}

export function zakatLine(
  input: ZakatInput,
  read: { price: number | null; balance: any | null; sharesOutstanding: number | null },
  { year = 'lunar' as ZakatYear, deductCurrentLiabilities = false } = {},
): ZakatLine {
  const rate = ZAKAT_RATE[year];
  const price = n(read.price);
  const shares = n(input.shares);
  const value = price != null && shares != null ? price * shares : null;
  if (shares == null || shares <= 0) {
    return { ...input, price, value: null, perShare: null, base: null, zakat: null, note: 'Enter the shares held.' };
  }
  if (input.intent === 'trade') {
    return { ...input, price, value, perShare: null, base: value, zakat: value != null ? value * rate : null,
      note: value != null ? 'Held to trade: on the full market value.' : 'No price, so no market value.' };
  }
  const perShare = zakatablePerShare(read.balance, read.sharesOutstanding, { deductCurrentLiabilities });
  const base = perShare != null ? perShare * shares : null;
  return { ...input, price, value, perShare, base, zakat: base != null ? base * rate : null,
    note: base != null
      ? `Held long term: on the company's cash, receivables and inventory per share${deductCurrentLiabilities ? ', less current liabilities' : ''}.`
      : 'The balance sheet could not be read, so this line is left out rather than guessed.' };
}

export function zakatTotal(lines: ZakatLine[]) {
  const counted = lines.filter((l) => isNum(l.zakat));
  return {
    zakat: counted.reduce((t, l) => t + (l.zakat as number), 0),
    value: lines.reduce((t, l) => t + (isNum(l.value) ? l.value : 0), 0),
    counted: counted.length,
    missing: lines.length - counted.length,
  };
}
