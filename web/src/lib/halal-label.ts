/* ==========================================================================
   Maz Vantage — the halal label

   The one reading every free surface prints: the verdict card at the top of
   the report, the server-rendered summary search engines read, the
   portfolio's compliance column and the fund holdings check. One function,
   so the label cannot say one thing on the report and another in a list.

   Two sources, in order:
   1. **A researched v5.0 screen** (`shariah-issuers.ts`), where one exists.
      Its preferred scenario (B, AAOIFI-based) is the label, with the methodology
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
import { PREFERRED, type IndexResult, type TestKey, type TestResult, type Verdict } from './shariah-v5';
import { pct } from './format';
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
  /** researched screens: what decided the verdict, in plain words */
  reason?: string;
  /** quick screen: the standards passed and failed, by name */
  passing?: string[];
  failing?: string[];
  /** researched screens: AAOIFI Shariah Standard 21 on its own rules, the row the tab's answer reads */
  standard21?: IndexResult;
  /** researched screens failed at Gate 1: the finding that excluded the business itself */
  activity?: string;
}

/** The label from the quick screen's five rows. */
export function labelFromQuick(rows: QuickResult[], name = 'The company'): HalalLabel {
  const total = rows.length;
  const passed = rows.filter((r) => r.state === 'pass').length;
  const failed = rows.filter((r) => r.state === 'fail').length;
  const unknown = rows.filter((r) => r.state === 'na').length;
  const excluded = rows[0]?.excluded ?? null;
  const base = {
    source: 'quick' as const, passed, failed, total, excluded,
    passing: rows.filter((r) => r.state === 'pass').map((r) => r.std.name),
    failing: rows.filter((r) => r.state === 'fail').map((r) => r.std.name),
  };
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
  PASS: { tone: 'good', word: 'Halal · AAOIFI-based', headline: 'Compliant, AAOIFI-based', phrase: 'is Shariah-compliant under its AAOIFI-based scenario' },
  'MIXED — Watch': { tone: 'warn', word: 'On watch · AAOIFI-based', headline: 'On watch, AAOIFI-based', phrase: 'is on watch under its AAOIFI-based scenario: compliant, but close to a limit or resting on one estimate' },
  FAIL: { tone: 'bad', word: 'Not halal · AAOIFI-based', headline: 'Not compliant, AAOIFI-based', phrase: 'is not Shariah-compliant under its AAOIFI-based scenario' },
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
    reason: researchedReason(screen.scenarios[PREFERRED]),
    standard21: screen.indexes.find((x) => x.rule.key === 'aaoifi'),
    activity: record.g1 === 'categorical' ? record.gate1.find((g) => /categorical/i.test(g.result))?.finding : undefined,
  };
}

/** The colour of the answer: Standard 21's own state where the answer reads it, else the label's. */
export function answerTone(label: HalalLabel): HalalTone {
  if (label.activity) return 'bad';
  const x = label.source === 'researched' ? label.standard21 : null;
  if (!x) return label.tone;
  return x.state === 'pass' ? 'good' : x.state === 'borderline' ? 'warn' : 'bad';
}

/**
 * The answer on AAOIFI Shariah Standard 21's own rules — debt and cash each
 * against market value, non-permissible income against revenue — in the
 * figures the Shariah tab's methodology table prints (two decimals, trimmed).
 */
function standard21Answer(x: IndexResult, who: string): string {
  const p = (v: number) => pct(v, { dp: 2 });
  const lim = (v: number) => pct(v, { dp: 1 });
  const base = x.rule.basis === 'ta' ? 'total assets' : `its ${x.rule.basisLabel.replace(/ market cap$/, ' average market value')}`;
  const debtOk = x.debt <= x.rule.debtCap;
  const cashOk = x.cash <= x.rule.cashCap;
  const sameCap = x.rule.debtCap === x.rule.cashCap;
  const balance = debtOk && cashOk && sameCap
    ? `Its interest-bearing debt is ${p(x.debt)} and its cash and interest-bearing securities ${p(x.cash)} of ${base}, both under the ${lim(x.rule.debtCap)} limit`
    : `Its interest-bearing debt is ${p(x.debt)} of ${base}, ${debtOk ? 'under' : 'over'} the ${lim(x.rule.debtCap)} limit, and its cash and interest-bearing securities ${p(x.cash)}, ${cashOk ? 'under' : 'over'} the ${lim(x.rule.cashCap)} limit`;
  const income = x.income == null ? '' : x.state === 'borderline' && x.incomeBand
    ? `; its non-permissible income is estimated at ${p(x.income)} of revenue (between ${pct(x.incomeBand[0])} and ${pct(x.incomeBand[1])}), against the 5% limit`
    : `; its non-permissible income is ${p(x.income)} of revenue, ${x.income <= 0.05 ? 'under' : 'over'} the 5% limit`;
  const name = x.rule.name;
  if (x.state === 'pass') return `Yes. ${who} is classified as HALAL by Maz Vantage under ${name}. ${balance}${income}.`;
  if (x.state === 'borderline') return `It is on the line. ${who} is borderline under ${name}. ${balance}${income}.`;
  return `No. ${who} is classified as NOT HALAL by Maz Vantage under ${name}. ${balance}${income}.`;
}

/* ---------- the answer sentence ------------------------------------------------ */

/** What each researched ratio measures, and against what, for a sentence. */
const PLAIN: Partial<Record<TestKey, { what: string; are: boolean; of: string }>> = {
  ibd_mcap: { what: 'interest-bearing debt', are: false, of: 'market value' },
  ibd_ta: { what: 'interest-bearing debt', are: false, of: 'total assets' },
  cash_mcap: { what: 'cash and interest-bearing securities', are: true, of: 'market value' },
  cash_ta: { what: 'cash and interest-bearing securities', are: true, of: 'total assets' },
  liquid_mcap: { what: 'cash, securities and receivables', are: true, of: 'market value' },
  ar_mcap: { what: 'receivables', are: true, of: 'market value' },
  l1_revenue: { what: 'interest income', are: false, of: 'revenue' },
};
const pc1 = (v: number) => `${Number((v * 100).toFixed(1))}%`;
const ratioLine = (t: TestResult, how: string) => {
  const p = PLAIN[t.key];
  return p && t.value != null && t.limit != null ? `its ${p.what} ${p.are ? 'are' : 'is'} ${pc1(t.value)} of ${p.of}, ${how} the ${pc1(t.limit)} limit` : null;
};
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** The researched screen's deciding facts, from its own figures. */
function researchedReason(sc: { verdict: Verdict; tests: TestResult[]; g4: { state: string; npi: number; cap: number } }): string {
  if (sc.verdict === 'CATEGORICAL FAIL') return 'Its business activity is excluded, whatever its balance sheet.';
  if (sc.verdict === 'NOT SCREENABLE') return 'It does not disclose enough to be screened.';
  const failing = sc.tests.filter((t) => t.state === 'fail').map((t) => ratioLine(t, 'over')).filter(Boolean) as string[];
  if (sc.g4.state === 'fail') failing.push(`its estimated non-permissible income is ${pc1(sc.g4.npi)} of revenue, over the ${pc1(sc.g4.cap)} cap`);
  if (failing.length) {
    // A company failing only on total assets passes the market-value tests most screeners run.
    const mcapTests = sc.tests.filter((t) => t.key.endsWith('_mcap') && t.limit != null);
    const onAssetsOnly = sc.tests.filter((t) => t.state === 'fail').every((t) => t.key.endsWith('_ta')) && sc.g4.state !== 'fail'
      && mcapTests.length > 0 && mcapTests.every((t) => t.state === 'pass');
    return `${cap(failing.join('; and '))}.${onAssetsOnly ? ' Measured against market value alone, as many screeners do, it passes.' : ''}`;
  }
  const watching = sc.tests.filter((t) => t.state === 'watch').map((t) => ratioLine(t, 'close to')).filter(Boolean) as string[];
  if (watching.length) return `It passes, but ${watching.join('; and ')}.`;
  return 'It passes the business-activity screen and every financial test.';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-10-07" → "October 2026" */
export const monthYear = (iso: string) => { const [y, m] = iso.slice(0, 10).split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };

/**
 * The one-paragraph answer at the top of the Shariah tab: the verdict in its
 * first word, then the date, the company, the classification and the method,
 * then what decided it. Built from the label, so it can never disagree with
 * the label printed beside it.
 */
export function halalAnswer(label: HalalLabel, name: string, symbol: string, asOf: string | null): string {
  const when = label.source === 'researched' && label.screened ? monthYear(label.screened) : asOf ? monthYear(asOf) : null;
  const who = `${when ? `As of ${when}, ` : ''}${name} (${symbol})`;
  const list = (xs: string[] = []) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  // A business excluded at Gate 1 is answered on the business first; no ratio could make it compliant.
  if (label.source === 'researched' && label.activity) {
    return `No. ${who} is classified as NOT HALAL by Maz Vantage: the company itself conducts an excluded activity. ${label.activity}`;
  }
  // A researched screen answers on AAOIFI Shariah Standard 21's own row (the owner's choice, 2026-10-18).
  if (label.source === 'researched' && label.standard21) return standard21Answer(label.standard21, who);
  if (label.source === 'researched') {
    const method = `under its AAOIFI-based Shariah screening methodology (${label.version})`;
    const reason = label.reason ? ` ${label.reason}` : '';
    if (label.tone === 'good') return `Yes. ${who} is classified as HALAL by Maz Vantage ${method}.${reason}`;
    if (label.tone === 'warn') return `Yes, for now. ${who} is classified as HALAL, ON WATCH, by Maz Vantage ${method}.${reason}`;
    if (label.tone === 'bad') return `No. ${who} is classified as NOT HALAL by Maz Vantage ${method}.${reason}`;
    return `Not yet. ${who} cannot be screened by Maz Vantage ${method}.${reason}`;
  }
  if (label.excluded) {
    return `No. ${who} is classified as NOT HALAL by Maz Vantage: its line of business (${label.excluded}) is excluded under every published Shariah methodology, whatever its balance sheet.`;
  }
  if (label.tone === 'muted') return `Not yet. ${who} cannot be screened by Maz Vantage: not enough of its balance sheet is available.`;
  if (label.tone === 'good') {
    return `Yes. ${who} is classified as HALAL by Maz Vantage: it passes all ${label.total} published Shariah screening standards it was tested against (${list(label.passing)}).`;
  }
  if (label.tone === 'bad') {
    return `No. ${who} is classified as NOT HALAL by Maz Vantage: it fails every published Shariah screening standard it could be measured against (${list(label.failing)}).`;
  }
  const unmeasured = label.total - label.passed - label.failed;
  return `It depends on the standard you follow. ${who} passes ${label.passed} of ${label.total} published Shariah screening standards checked by Maz Vantage: `
    + `it passes ${list(label.passing)}${label.failing?.length ? `, and fails ${list(label.failing)}` : ''}`
    + `${unmeasured ? `; ${unmeasured === 1 ? 'one' : unmeasured} could not be measured from the balance sheet available` : ''}.`;
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
