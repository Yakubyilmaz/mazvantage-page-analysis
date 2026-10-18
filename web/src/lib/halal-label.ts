/* ==========================================================================
   Maz Vantage — the halal label

   The one reading every free surface prints: the verdict card at the top of
   the report, the server-rendered summary search engines read, the
   portfolio's compliance column and the fund holdings check. One function,
   so the label cannot say one thing on the report and another in a list.

   Two sources, in order:
   1. **A researched v5.0 screen** (`shariah-issuers.ts`), where one exists.
      Its preferred scenario (B, AAOIFI) is the label, with the methodology
      version and the screening date beside it.
   2. **The quick screen** (`shariah.ts`) on everything else: the five
      published index methodologies on the latest balance sheet. Its headline
      is a count, never a single word — the Shariah tab's rule, kept here:
      the providers can and do disagree on identical financials, so
      "compliant" alone would be true under some readers' standard and false
      under others'.

   `word` is the short form a table cell or chip has room for. For the quick
   screen it says how many standards agree ("Halal · 5 of 5"), not a ruling.
   ========================================================================== */

import { SHARIAH_STANDARDS, quickInputs, quickScreen, type QuickInputs, type QuickResult } from './shariah';
import { PREFERRED, type Verdict } from './shariah-v5';
import { issuerRecord, screenIssuer } from './shariah-issuers';

export type HalalTone = 'good' | 'warn' | 'bad' | 'muted';

export interface HalalLabel {
  tone: HalalTone;
  /** compact: for a chip or a table cell */
  word: string;
  /** the headline: "Passes all 5 standards", "Compliant under AAOIFI" */
  headline: string;
  /** one plain sentence a reader (or a search engine) can quote */
  sentence: string;
  source: 'researched' | 'quick';
  /** quick screen only */
  passed: number;
  failed: number;
  total: number;
  /** the matched excluded activity, if the business itself is excluded */
  excluded: string | null;
  /** researched screens: the record's own two or three sentences */
  detail?: string;
  /** researched screens: methodology version and screening date */
  version?: string;
  screened?: string;
}

/** The label from the quick screen's five rows. */
export function labelFromQuick(rows: QuickResult[], name = 'The company'): HalalLabel {
  const total = rows.length;
  const passed = rows.filter((r) => r.state === 'pass').length;
  const failed = rows.filter((r) => r.state === 'fail').length;
  const unknown = rows.filter((r) => r.state === 'na').length;
  const excluded = rows[0]?.excluded ?? null;
  const base = { source: 'quick' as const, passed, failed, total, excluded };
  if (excluded) {
    return { ...base, tone: 'bad', word: 'Not halal · activity', headline: 'Excluded on activity',
      sentence: `${name} is not Shariah-compliant: its line of business (${excluded}) is excluded under every published methodology, whatever its balance sheet.` };
  }
  if (unknown === total) {
    return { ...base, tone: 'muted', word: 'Not screened', headline: 'Cannot be screened',
      sentence: `${name} cannot be screened: not enough of its balance sheet is available.` };
  }
  if (failed === 0 && unknown === 0) {
    return { ...base, tone: 'good', word: `Halal · ${passed} of ${total}`, headline: `Passes all ${total} standards`,
      sentence: `${name} passes all ${total} published Shariah screening standards on its latest balance sheet (AAOIFI, S&P, Dow Jones, FTSE and MSCI).` };
  }
  if (passed === 0) {
    return { ...base, tone: 'bad', word: `Not halal · 0 of ${total}`, headline: `Fails all ${total} standards`,
      sentence: `${name} fails every published Shariah screening standard it could be measured against on its latest balance sheet.` };
  }
  return { ...base, tone: 'warn', word: `Mixed · ${passed} of ${total}`, headline: `Passes ${passed} of ${total} standards`,
    sentence: `${name} passes ${passed} of ${total} published Shariah screening standards: the methodologies divide by different things and draw their limits in different places, so they disagree on this company.` };
}

const V5_WORD: Record<Verdict, { tone: HalalTone; word: string; headline: string; phrase: string }> = {
  PASS: { tone: 'good', word: 'Halal · AAOIFI', headline: 'Compliant under AAOIFI', phrase: 'is Shariah-compliant under AAOIFI' },
  'MIXED — Watch': { tone: 'warn', word: 'On watch · AAOIFI', headline: 'On watch under AAOIFI', phrase: 'is on watch under AAOIFI: compliant, but close to a limit' },
  FAIL: { tone: 'bad', word: 'Not halal · AAOIFI', headline: 'Not compliant under AAOIFI', phrase: 'is not Shariah-compliant under AAOIFI' },
  'CATEGORICAL FAIL': { tone: 'bad', word: 'Not halal · activity', headline: 'Excluded on activity', phrase: 'is not Shariah-compliant: its business activity is excluded' },
  'NOT SCREENABLE': { tone: 'muted', word: 'Not screened', headline: 'Not screenable', phrase: 'cannot be screened from what it discloses' },
};

/** The label from a researched v5.0 screen, read at the preferred scenario. */
export function labelFromIssuer(symbol: string): HalalLabel | null {
  const record = issuerRecord(symbol);
  if (!record) return null;
  const screen = screenIssuer(record);
  const v = screen.scenarios[PREFERRED].verdict;
  const w = V5_WORD[v];
  return {
    tone: w.tone, word: w.word, headline: w.headline, source: 'researched', passed: 0, failed: 0, total: 0, excluded: null,
    version: record.version, screened: record.screened,
    sentence: `${record.name} ${w.phrase}, in a researched screen of its filings (methodology ${record.version}, screened ${record.screened}).`,
    detail: record.summary,
  };
}

/** The quick screen's five rows on prepared inputs. */
export const quickRows = (inp: QuickInputs) => SHARIAH_STANDARDS.map((std) => quickScreen(inp, std));

/**
 * The label for a loaded company: the researched screen where there is one,
 * else the quick screen (on the averaged market cap when `mcapRows` is given).
 */
export function halalLabel(
  a: { facts: any; ds?: { get: (n: string) => any } },
  mcapRows?: { date: string; marketCap: number }[] | null,
): HalalLabel {
  const symbol = String(a.facts?.symbol || '').toUpperCase();
  return labelFromIssuer(symbol) ?? labelFromQuick(quickRows(quickInputs(a, mcapRows)), a.facts?.name || symbol || 'The company');
}
