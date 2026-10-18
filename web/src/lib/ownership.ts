/* ==========================================================================
   Maz Vantage — who owns the shares, and who moved

   Three readings, none scored:

   - **13F holders in aggregate**: how many institutions filed a position, the
     share of the company they held, and whether both rose in the quarter;
   - **the largest holders**: each one's change in shares, as filed. A filer
     with no position under the same filer number a quarter earlier shows no
     change rather than a "new" position, because 13F filer numbers change
     when a manager reorganises (Vanguard split into new filers in 2026), and
     the data cannot tell a re-registration from a purchase;
   - **insiders**: open-market purchases and sales reported on Form 4, by
     quarter. Grants, exercises and tax withholding are not trades and are
     left out; only purchases count as a bet with the insider's own money.

   Data: public/data/ownership.json (a capture of the quarter's filings) and
   the snapshot's `insiderStats` / `holdersSummary` where it has them.
   ========================================================================== */

import { isNum } from './format';

export interface Holder {
  investorName: string; cik: string; filingDate: string; sharesNumber: number; lastSharesNumber: number;
  changeInSharesNumberPercentage: number; marketValue: number; ownership: number; isNew: boolean; isSoldOut: boolean; firstAdded: string;
}
export interface HoldersSummary {
  date: string; investorsHolding: number; lastInvestorsHolding: number; numberOf13Fshares: number; lastNumberOf13Fshares: number;
  ownershipPercent: number; lastOwnershipPercent: number; newPositions: number; closedPositions: number;
  increasedPositions: number; reducedPositions: number; putCallRatio: number; lastPutCallRatio: number;
}
export interface OwnershipFile {
  capturedAt: string; quarter: string;
  symbols: Record<string, { summary?: HoldersSummary; holders?: Holder[]; insiderStats?: any[] }>;
}

let load: Promise<OwnershipFile | null> | null = null;
export const loadOwnership = () => (load ||= fetch('/data/ownership.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** Change in shares, or null where the filer has no prior position under the same number. */
export const holderChange = (h: Holder) => (h.lastSharesNumber > 0 ? h.sharesNumber / h.lastSharesNumber - 1 : null);

/** A display name: the filing's capitals, made readable. */
export function holderName(raw: string): string {
  if (/^PRICE T ROWE/i.test(raw)) return 'T. Rowe Price Associates';
  const keep = new Set(['LLC', 'LP', 'PLC', 'AG', 'UBS', 'FMR', 'L.P.', 'LLP', 'II']);
  const fixed: Record<string, string> = { Jpmorgan: 'JPMorgan', Blackrock: 'BlackRock', 'Blackrock,': 'BlackRock,' };
  return String(raw || '').replace(/\\$/, '').replace(/\s*\/[A-Z]{2}\/?$/, '').split(/\s+/)
    .map((w) => (keep.has(w.replace(/[,.]$/, '')) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .map((w) => fixed[w] || w)
    .join(' ').replace(/,\s*$/, '');
}

export interface InsiderQuarter { year: number; quarter: number; purchases: number; sales: number; acquired: number; disposed: number }

export function insiderQuarters(rows: any[], n = 8): InsiderQuarter[] {
  return (rows || [])
    .filter((r) => isNum(r?.year) && isNum(r?.quarter))
    .sort((x, y) => (y.year - x.year) || (y.quarter - x.quarter))
    .slice(0, n)
    .map((r) => ({
      year: r.year, quarter: r.quarter,
      purchases: isNum(r.totalPurchases) ? r.totalPurchases : 0,
      sales: isNum(r.totalSales) ? r.totalSales : 0,
      acquired: isNum(r.totalAcquired) ? r.totalAcquired : 0,
      disposed: isNum(r.totalDisposed) ? r.totalDisposed : 0,
    }))
    .reverse();
}

export interface Ownership {
  summary: HoldersSummary | null;
  holders: Holder[];
  insiders: InsiderQuarter[];
  quarter: string | null;
}

export function ownershipOf(symbol: string, file: OwnershipFile | null, snapInsiderStats: any[] | null): Ownership {
  const e = file?.symbols?.[symbol] || {};
  return {
    summary: e.summary || null,
    holders: (e.holders || []).slice(0, 10),
    insiders: insiderQuarters(snapInsiderStats?.length ? snapInsiderStats : e.insiderStats || []),
    quarter: file?.quarter || null,
  };
}
