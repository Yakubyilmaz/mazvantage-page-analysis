/* ==========================================================================
   Maz Vantage — the impure share of a dividend, worked out automatically

   Purification gives away the part of a dividend that came from income the
   screen tolerates but does not accept. Until now the reader typed that
   fraction in, with the filing's interest-to-revenue share offered as a hint.
   That hint understated it: a dividend is paid out of earnings, not revenue,
   so the right base is net income. Methodology v5.0 (Δ6) says so, and its
   arithmetic is used here.

   In order:
   1. **A researched v5.0 screen** (`shariah-issuers.ts`): Δ6 at the preferred
      scenario — after-tax interest plus impure revenue at the company's own
      margin, per share, over earnings per share. Covers impure activities as
      well as interest.
   2. **The latest annual income statement**: after-tax interest over net
      income — Δ6 with interest as the only impurity measured, which the
      v5.0 and older formulas agree on. A floor: income from excluded
      activities would add to it, and the page says so.
   3. **Nothing**, when the statement reports no interest income or the year
      was a loss. The reader's own figure is then the only one; a missing
      interest line is a gap in the data, never "nothing to purify".

   The share applies to the dividend received. Capital gains are a separate
   question scholars answer differently, and this does not take a position.
   ========================================================================== */

import { isNum } from './format';
import { PREFERRED } from './shariah-v5';
import { issuerRecord, screenIssuer } from './shariah-issuers';

export interface AutoImpure {
  /** per cent of the dividend */
  percent: number;
  source: 'researched' | 'interest';
  /** one line: where the figure came from */
  detail: string;
}

/** The impure share of a dividend for `symbol`, from the researched screen or the newest annual income statement. */
export function autoImpure(symbol: string, income: any | null | undefined): AutoImpure | null {
  const record = issuerRecord(symbol);
  if (record) {
    const p = screenIssuer(record).scenarios[PREFERRED].purification;
    const eps = record.income.epsDiluted;
    if (isNum(p.perShare) && isNum(eps) && eps > 0) {
      return { percent: (p.perShare / eps) * 100, source: 'researched',
        detail: `Researched screen (methodology ${record.version}): interest and impure revenue, after tax, over earnings.` };
    }
  }
  const interest = Number(income?.interestIncome);
  const net = Number(income?.netIncome);
  if (!Number.isFinite(interest) || interest <= 0 || !Number.isFinite(net) || net <= 0) return null;
  const pre = Number(income?.incomeBeforeTax);
  const tax = Number(income?.incomeTaxExpense);
  const t = Number.isFinite(pre) && pre > 0 && Number.isFinite(tax) ? Math.max(0, tax / pre) : 0;
  const percent = Math.min(100, ((interest * (1 - t)) / net) * 100);
  const year = income?.fiscalYear || String(income?.date || '').slice(0, 4);
  return { percent, source: 'interest',
    detail: `Interest income after tax over net income${year ? `, ${year}` : ''}. Interest only: a floor.` };
}
