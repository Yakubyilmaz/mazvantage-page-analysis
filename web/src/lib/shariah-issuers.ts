/* ==========================================================================
   Maz Vantage — researched Shariah screens, one record per issuer

   Each record carries the inputs of one v5.0 screen (`shariah-v5.ts` does the
   arithmetic) and the parts of it that are judgement: the Gate-1 walk, the
   Gate-5 disclosure finding, and the evidence behind every Gate-4 line. The
   matching long-form report lives in the repository root
   (`AAPL_Shariah_Screening_v5_0.md`); the numbers on the tab and in that file
   come from the same computation, and `tests/shariah-v5.test.ts` holds them
   together.

   Every amount is US$ millions unless a field says otherwise.
   ========================================================================== */

import {
  INDEX_RULES, SCENARIOS, TEST_INFO, aggregate, gate4, indexScreen, khums, purify, ratioTests, scenarioMcap, sizeAt, worstOf,
  type Band, type BalanceSheet, type Gate4Total, type Income, type IndexResult, type McapWindows, type Purification,
  type RevenueLine, type Scenario, type TestResult, type Verdict,
} from './shariah-v5';
// Type-only the other way, so there is no import cycle at run time.
import { ABNB, ADP, DE } from './shariah-issuers-hidden-interest';
import { AMZN } from './shariah-issuers-amazon';

export interface Filing { form: string; period: string; accession: string; href: string }
export interface Source { label: string; href: string }
export interface GateStep { step: string; test: string; finding: string; result: string }
export interface Standard { name: string; tests: string; result: 'pass' | 'fail' | 'mixed'; deciding: string }
export interface Reconciliation { field: string; reference: string; filing: string; effect: string }
/**
 * A reading the Council has not settled, expressed as lines that replace (same
 * key) or join the base set. The engine prices it, so the shift on the tab is
 * always the shift the arithmetic gives.
 */
export interface Sensitivity { label: string; note: string; lines: RevenueLine[] }

export interface IssuerRecord {
  symbol: string;
  name: string;
  version: string;
  screened: string;
  period: { label: string; start: string; end: string };
  /** Two or three sentences: what passes, what fails and why, in plain words. */
  summary: string;
  /** What the balance-sheet inputs contain, printed under the ratio table. */
  ratioNote: string;
  /** Why the methodologies agree or part company, printed under the comparison table. */
  methodsNote: string;
  filings: Filing[];
  income: Income;
  bs: BalanceSheet;
  /** The four quarter-ends inside the window, for the trend of the deciding ratios. */
  history: BalanceSheet[];
  mcap: McapWindows;
  /** Layer 1, gross. Estimated when the issuer stopped disclosing it. */
  l1: Band & { status: string; basis: string };
  l2: Band & { basis: string };
  layers: { key: string; label: string; value: string; note: string }[];
  gate1: GateStep[];
  /** The outcome of the Gate-1 walk; categorical binds every lens. */
  g1: 'pass' | 'categorical';
  gate5: { screenable: boolean; finding: string; gaps: string[] };
  lines: RevenueLine[];
  sensitivities: Sensitivity[];
  standards: Standard[];
  gflags: string[];
  monitoring: string[];
  openQuestions: string[];
  reconciliation: Reconciliation[];
  sources: Source[];
}

const SEC = 'https://www.sec.gov/Archives/edgar/data/320193';

/* ---------- Apple Inc. ---------------------------------------------------------- */

const AAPL_BS: BalanceSheet = {
  date: '2026-06-27',
  totalAssets: 383_266,
  totalLiabilities: 275_746,
  equity: 107_520,
  cashIbs: 146_517,
  cash: 39_544,
  ar: 31_398,
  borrowings: 1_997 + 11_007 + 71_340,
  // Lease liabilities are disclosed annually only: the FY2025 10-K figures are the latest.
  financeLeases: 1_230,
  operatingLeases: 12_490,
  // Not disclosed since FY2017 ($5,717m then); a deliberately high placeholder. At Apple's
  // market cap it moves the Hanbali ratios by hundredths of a point.
  goodwill: 10_000,
  intangibles: 25_417,
};

const quarterEnd = (date: string, totalAssets: number, cashIbs: number, borrowings: number, ar: number): BalanceSheet =>
  ({ ...AAPL_BS, date, totalAssets, cashIbs, borrowings, ar });

export const AAPL: IssuerRecord = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  version: 'v5.0',
  screened: '2026-10-07',
  period: { label: 'Twelve months to 27 June 2026 (Q4 FY2025 – Q3 FY2026)', start: '2025-06-29', end: '2026-06-27' },
  summary: 'The business clears the activity screen, and against its 12-month average market value its debt (2.0%) and '
    + 'its cash and interest-bearing securities (3.5%) are small, so Scenario B, the AAOIFI reading, passes: the '
    + 'estimated non-permissible income is 3.7% of revenue, under the 5% cap. Scenario C and Strictest take the '
    + 'conservative edge of that estimate — interest, social-casino commissions, insurance distribution, media and '
    + 'finance advertising — and it runs over their caps; Strictest also counts operating leases, which put debt at '
    + '25.6% of total assets, over its 25%. Cash and securities are tested against the 12-month average market cap at '
    + 'every scenario, as AAOIFI Standard 21 does (since 18 October 2026); against total assets they are 38.2%, shown '
    + 'for information.',
  methodsNote: 'Every methodology that divides by market value passes Apple: its debt and cash are a few percent of a '
    + '$3.5–4.9t company. MSCI Islamic divides by total assets and fails it, because cash and interest-bearing '
    + 'securities are 38.2% of what Apple owns; Maz Vantage\'s scenarios test cash against the 12-month average market '
    + 'cap, as AAOIFI does. FTSE\'s revenue test counts music, film and insurance broking whole, which puts Apple on its '
    + '5% line within the range of the estimates; its index holds Apple.',
  ratioNote: 'Debt is commercial paper and notes ($84.3b) plus finance leases ($1.2b); Strictest adds operating leases '
    + '($12.5b, September 2025 — leases are disclosed yearly). Cash and interest-bearing securities ($146.5b) include the '
    + '$84.1b of non-current debt securities that a cash-and-short-term figure leaves out. Receivables are trade receivables '
    + 'only. Goodwill has not been presented since FY2017; a $10b placeholder is used, immaterial at this market cap.',
  filings: [
    { form: '10-K', period: 'FY2025 (to 27 Sep 2025)', accession: '0000320193-25-000079', href: `${SEC}/000032019325000079/aapl-20250927.htm` },
    { form: '10-Q', period: 'Q1 FY2026 (to 27 Dec 2025)', accession: '0000320193-26-000006', href: `${SEC}/000032019326000006/aapl-20251227.htm` },
    { form: '10-Q', period: 'Q2 FY2026 (to 28 Mar 2026)', accession: '0000320193-26-000013', href: `${SEC}/000032019326000013/aapl-20260328.htm` },
    { form: '10-Q', period: 'Q3 FY2026 (to 27 Jun 2026)', accession: '0000320193-26-000020', href: `${SEC}/000032019326000020/aapl-20260627.htm` },
  ],
  income: {
    revenue: 466_823,
    netIncome: 128_930,
    pretax: 155_906,
    tax: 26_976,
    epsDiluted: 8.72,
    dilutedShares: 14_778.6,
    dps: 1.05,
  },
  bs: AAPL_BS,
  history: [
    quarterEnd('2025-09-27', 359_241, 132_420, 7_979 + 12_350 + 78_328, 39_777),
    quarterEnd('2025-12-27', 379_297, 144_795, 1_997 + 11_827 + 76_685, 39_921),
    quarterEnd('2026-03-28', 371_082, 146_595, 1_997 + 8_310 + 74_404, 30_339),
    AAPL_BS,
  ],
  mcap: { m12: 4_190_300, m24: 3_792_400, m36: 3_527_300, spot: 4_911_960, spotDate: '2026-10-07' },
  l1: {
    point: 4_200, low: 3_600, high: 4_800,
    status: 'estimated',
    basis: 'Apple last disclosed gross interest and dividend income in FY2023 ($3,750m on ~$166b of cash and '
      + 'securities, 2.3%). Two routes since: ~$140.7b average cash and debt securities over the five quarter-ends '
      + 'at a 2.8–3.4% book yield gives $3.9–4.8b; other income/(expense), net of +$1,047m plus ~$2.7b of note '
      + 'interest gives ~$3.8–4.2b before realised losses. Point $4.2b.',
  },
  l2: {
    point: 2_700, low: 2_500, high: 2_950,
    basis: 'Not disclosed since FY2023. The FY2025 10-K puts interest on the notes at $2.6b over the next twelve '
      + 'months on $91.3b of principal (2.85%), plus commercial paper at 4.19%.',
  },
  layers: [
    { key: 'L1', label: 'Interest income (gross)', value: '~$4.2b · 0.90%', note: 'Estimated (see Layer 1). Inside the Gate-4 total (D5).' },
    { key: 'L2', label: 'Interest expense', value: '~$2.7b · 0.58%', note: 'Estimated. Δ20 trigger (> 0.5% of revenue): implied coupon ~3.0% on ~$90.8b average debt against 2.85% scheduled — consistent within 100bp.' },
    { key: 'L3', label: 'Capitalised interest', value: 'not disclosed', note: 'Information only.' },
    { key: 'L4', label: 'Pension interest', value: 'none material', note: 'No material defined-benefit plans.' },
    { key: 'L5', label: 'Lease interest', value: '~$0.5b · 0.10%', note: '3.4% discount rate on $13.7b of lease liabilities. Information only.' },
    { key: 'L6', label: 'Derivative carry', value: 'hedging', note: 'FX and interest-rate hedges ($136b notional). Commercial hedging is Tier 0.' },
    { key: 'L7', label: 'Financing income', value: 'none in the window', note: 'Apple Pay Later (Apple Financing LLC lent directly) closed in June 2024. Apple Card is a co-brand fee — Gate 4.' },
    { key: 'L8', label: 'Cash-vehicle yield', value: 'inside L1', note: 'Money-market funds $7.8b, commercial paper $3.8b, time deposits $3.0b at 27 Jun 2026.' },
  ],
  gate1: [
    { step: '1', test: 'Primary business', finding: 'Consumer hardware: iPhone is 52.6% of revenue, products 74.2%.', result: 'Not P1 — pass' },
    { step: '2', test: 'Own P1 segment > 5% (U2)', finding: 'Segments are geographic. What Apple conducts itself — AppleCare service contracts, an insurance captive (Apple Insurance Company, Inc.), insurance intermediation — is ~2–3% of revenue even taken whole.', result: 'Below 5% — pass, G-flag' },
    { step: '3', test: 'Facilitation (Δ14)', finding: 'Revenue that facilitates P1 activity (insurance distribution, Apple Card, social-casino commissions, finance and gambling advertising) is ~2–3% of revenue.', result: '< 50% — standard Gate 4' },
    { step: '4', test: 'Sector routing', finding: 'Hardware and digital platforms: conditionally permissible. Apple TV and Apple Music go to Part VII (F12); the App Store to §52; payments to §54; advertising to Δ31; AppleCare to §31.', result: 'Proceed' },
    { step: '5', test: 'Special classes', finding: 'Not a health payer, takaful operator or holding company.', result: 'n/a' },
    { step: '6', test: 'Sub-industry (Δ5, Δ13)', finding: 'The hardware classification hides a 25.8%-of-revenue services business with media, advertising, payments and insurance lines — disaggregated at Gate 4.', result: 'Re-routed' },
    { step: '7', test: 'Client elections', finding: 'None.', result: 'n/a' },
  ],
  g1: 'pass',
  gate5: {
    screenable: true,
    finding: 'Screenable — audited 10-K and quarterly 10-Qs — but Apple discloses less than any issuer in the record, so every Gate-4 line and Layer 1 are estimates.',
    gaps: [
      'Gross interest income and interest expense: not disclosed since FY2023.',
      'Goodwill: not presented separately since FY2017.',
      'Services revenue: one line ($120.5b in the window); no figure for any single service.',
      'Lease liabilities: annual only; the 27 Jun 2026 figures are the 27 Sep 2025 ones.',
      'A $12.8b addition to intangible assets in Q2 FY2026, matched by a ~$13.5b rise in other non-current liabilities, is not explained.',
    ],
  },
  lines: [
    {
      key: 'interest', label: 'Interest income (Layer 1)', rule: 'Gate 3, D5', tier: 'Tier 1', interest: true,
      base: { point: 4_200, low: 3_600, high: 4_800 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'See Layer 1.',
    },
    {
      key: 'casino', wholeLine: true, label: 'App Store commission on social-casino games', rule: '§52, P1-GMB', tier: 'Tier 1',
      base: { point: 1_500, low: 1_100, high: 2_100 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'AppMagic puts 2025 casino-genre App Store revenue at $4.2b net of store fees (−7.6%), so ~$5.6–6.0b gross '
        + 'and $1.4–1.8b to Apple. Real-money gambling cannot use in-app purchase, so Apple earns nothing on it. '
        + 'The upper edge adds casual-casino titles; US link-out payments since May 2025 pull the lower edge down.',
    },
    {
      key: 'insurance', wholeLine: true, label: 'Insurance distribution (AppleCare+ where it is insurance; Theft & Loss)', rule: '§31, P1-INS', tier: 'Tier 1',
      base: { point: 1_900, low: 1_050, high: 3_800 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'In the UK (and other insurance-format markets) AppleCare+ is an AIG policy and Apple sells it as an insurance '
        + 'intermediary for a commission plus a per-policy claims fee. In the US, Theft & Loss cover is underwritten by '
        + 'New Hampshire Insurance Company and sold by Apple\'s AppleCare Service Company. AppleCare is ~$9–12b; '
        + '10–25% of it in insurance format (point 15%) plus $0.2–0.8b of Theft & Loss.',
    },
    {
      key: 'music', wholeLine: true, label: 'Apple Music subscriptions', rule: 'F12, Δ28 — music archetype (placeholder, §39(vi))', tier: 'Tier 2',
      base: { point: 10_000, low: 8_500, high: 11_500 },
      rate: { A: 0.20, B: 0.25, C: 0.30, S: 0.40 },
      status: 'estimated',
      basis: 'MIDiA: 116.1m subscribers at Q4 2025; at a ~$7 blended monthly price that is ~$9.7b. Published estimates '
        + 'run $8.5–11.3b. Music-as-product is an open election, so the archetype is a placeholder.',
    },
    {
      key: 'tv', wholeLine: true, label: 'Apple TV subscriptions', rule: 'F12, Δ28 — general-entertainment SVOD archetype', tier: 'Tier 2',
      base: { point: 4_500, low: 3_500, high: 5_500 },
      rate: { A: 0.30, B: 0.35, C: 0.40, S: 0.50 },
      status: 'estimated',
      basis: '~45m subscribers in 2024 (The Information); $12.99 a month since August 2025, much of it sold in bundles '
        + 'and at discounts. Mature-rated drama dominates the catalogue; no measured Δ35 rate exists, so the archetype '
        + 'is the fallback. Live sport inside the subscription (MLS, F1 from 2026) is Tier 0 and is not carved out.',
    },
    {
      key: 'video', wholeLine: true, label: 'Film and TV rentals, sales and Channels', rule: 'F12 — studio content sales archetype', tier: 'Tier 2',
      base: { point: 1_500, low: 1_000, high: 2_500 },
      rate: { A: 0.18, B: 0.22, C: 0.28, S: 0.38 },
      status: 'estimated — wide band',
      basis: 'Apple\'s take on transactional video and third-party Channels subscriptions; no public figure. Blended slate.',
    },
    {
      key: 'google', label: 'Search licensing (Google default placement)', rule: 'Δ31 — advertising pass-through', tier: 'Tier 1 by advertised product',
      base: { point: 24_000, low: 20_000, high: 28_000 },
      rate: { A: { point: 0.02, high: 0.035 }, B: { point: 0.14, high: 0.185 }, C: { point: 0.14, high: 0.185 }, S: { point: 0.14, high: 0.185 } },
      status: 'estimated — wide band',
      basis: 'Google paid Apple $20b in 2022 (trial filings) — 36% of search-ad revenue from Safari; Apple\'s 10-K files it '
        + 'under advertising. Grown with Google Search to $20–28b. Sc A counts alcohol and gambling ads (2%, band '
        + '1.3–3.5%); Sc B+ adds conventional finance and insurance, the largest search vertical (~11% in the last '
        + 'public split) — 14%, band 11.3–18.5%.',
    },
    {
      key: 'ads', label: 'Apple Ads (App Store and other own placements)', rule: 'Δ31 — advertising pass-through', tier: 'Tier 1 by advertised product',
      base: { point: 8_000, low: 6_000, high: 11_000 },
      rate: { A: { point: 0.05, high: 0.08 }, B: { point: 0.15, high: 0.23 }, C: { point: 0.15, high: 0.23 }, S: { point: 0.15, high: 0.23 } },
      status: 'estimated — wide band',
      basis: 'Forecasts for 2025 ran $6–11b; Apple names advertising as the leading Services growth driver. Sc A counts '
        + 'gambling (search results only, licence-checked) and social-casino app ads (5%); Sc B+ adds banking, '
        + 'trading, lending and insurance apps (15%).',
    },
    {
      key: 'card', wholeLine: true, label: 'Apple Card, savings and credit broking', rule: 'Δ31 / §52 — conventional finance', tier: 'Tier 1 at Sc B+',
      base: { point: 500, low: 300, high: 1_000 },
      rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Apple designs and markets an interest-bearing co-brand card (Goldman Sachs, moving to JPMorgan Chase over '
        + '~24 months from January 2026) and an Apple-branded savings account. Apple\'s share is undisclosed; '
        + 'forecasts at launch were ~$1b. Sc A treats it as a lease of promotional capacity (Δ31 carve-out).',
    },
    {
      key: 'pay', label: 'Apple Pay fees, by what is bought', rule: '§52 (mirrors Δ31)', tier: 'Tier 1 on the P1 share',
      base: { point: 2_500, low: 1_000, high: 4_500 },
      rate: { A: { point: 0.03, high: 0.05 }, B: { point: 0.04, high: 0.06 }, C: { point: 0.04, high: 0.06 }, S: { point: 0.04, high: 0.06 } },
      status: 'estimated — wide band',
      basis: 'Issuers pay ~0.15% of credit and ~0.5¢ per debit purchase; estimates run $1–4.5b a year. Attributed by the '
        + 'product bought, never the payer\'s identity (Δ31): alcohol, tobacco, gambling deposits and pork (~3%), plus '
        + 'conventional-finance payments at Sc B+ (~1%).',
    },
    {
      key: 'gacha', label: 'Loot boxes and gacha (no cash-out)', rule: '§52 — open election', tier: 'Election',
      base: { point: 3_000, low: 2_000, high: 4_500 },
      rate: { A: 0, B: 0, C: 0, S: 0 },
      election: [0, 0.5, 1],
      status: 'estimated — wide band',
      basis: 'Loot boxes were forecast at ~$20b across all platforms for 2025 (Juniper); RPG and strategy are ~42% of '
        + 'mobile game spending. Apple\'s commission on the iOS share: $2–4.5b. Sc A/B 0%; Sc C/Strictest shown at '
        + '0 / 50 / 100% and kept out of the total until the Council elects.',
    },
  ],
  sensitivities: [
    {
      label: 'AppleCare service contracts counted as insurance',
      note: 'If the Council reads Apple\'s own repair-and-damage contracts (~$8.5b outside the insurance-format markets) '
        + 'as commercial insurance rather than an IIFA Resolution 103 maintenance contract.',
      lines: [{
        key: 'applecare', label: 'AppleCare service contracts', rule: '§31 (if insurance)', tier: 'Tier 1',
        base: { point: 8_500, low: 7_000, high: 10_000 }, rate: { A: 1, B: 1, C: 1, S: 1 },
        status: 'estimated — wide band', basis: 'AppleCare ~$9–12b less the insurance-format share.',
      }],
    },
    {
      label: 'Apple Pay attributed by the paying bank instead',
      note: 'Every issuer fee treated as take from a conventional-finance product at Sc B+, replacing the by-product line. '
        + 'Sc A keeps the by-product share: the bank\'s identity attributes nothing there (Δ31 carve-out).',
      lines: [{
        key: 'pay', label: 'Apple Pay fees, by issuer', rule: '§52', tier: 'Tier 1 at Sc B+',
        base: { point: 2_500, low: 1_000, high: 4_500 }, rate: { A: { point: 0.03, high: 0.05 }, B: 1, C: 1, S: 1 },
        status: 'estimated — wide band', basis: 'As the base line.',
      }],
    },
    {
      label: 'Music as categorical lahw under Scenario C and Strictest',
      note: 'Reading (a) of the open music election: Apple Music at 100% at Sc C and Strictest.',
      lines: [{
        key: 'music', label: 'Apple Music subscriptions', rule: 'F12 reading (a) under Scenario C and Strictest', tier: 'Tier 1 at Sc C+',
        base: { point: 10_000, low: 8_500, high: 11_500 }, rate: { A: 0.20, B: 0.25, C: 1, S: 1 },
        status: 'estimated', basis: 'As the base line.',
      }],
    },
  ],
  standards: [
    { name: 'MSCI Islamic M-Series', tests: 'Debt, cash + securities, receivables + cash < 33.33% of average market cap', result: 'pass', deciding: 'All three under 5%' },
    { name: 'Securities Commission Malaysia', tests: 'Debt and conventional cash < 33% of total assets; 5% / 20% activity benchmarks', result: 'fail', deciding: 'Conventional cash and instruments 38.2% of total assets' },
    { name: 'OJK / DSN-MUI (Indonesia)', tests: 'Interest debt ≤ 45% of total assets; non-halal income ≤ 10%', result: 'pass', deciding: 'Debt 22.3% of total assets; income 3.7%' },
    { name: 'SECP Pakistan (KMI)', tests: 'Debt < 37% and non-compliant investments < 33% of total assets; illiquid assets ≥ 25%', result: 'pass', deciding: 'Investments 31.2% of total assets — 38.2%, a fail, if bank cash counts' },
  ],
  gflags: [
    'Apple Insurance Company, Inc. (Arizona) is listed as a significant subsidiary in Exhibit 21; what it insures is not disclosed.',
    'Regulatory: EU DMA €500m fine (April 2025, under appeal) and an open Article 6(4) case; US DOJ monopolisation suit (March 2024); Epic contempt ruling, Supreme Court review granted 30 June 2026.',
    'Revenue concentration on Google search licensing, which the September 2025 remedies order allows to continue; both sides have appealed.',
    'Apple Card issuer moving from Goldman Sachs to JPMorgan Chase (announced 7 January 2026, ~24-month transition).',
    'Single class of common stock — no dual-class control flag.',
  ],
  monitoring: [
    'Sc B non-permissible income at 3.7% of revenue against the 5% cap: the casino-commission, insurance-distribution and advertising lines are what would move it.',
    'Track-(b) debt under 25% of total assets lifts one Strictest fail: ~$3b of net repayment; $11.0b of notes fall due within a year.',
    'The FY2026 10-K (due late October 2026): lease liabilities, the Q2 intangible addition, and any return of an interest-income line.',
    'The D.C. Circuit appeal in the Google search case, and the JPMorgan terms on Apple Card.',
    'App Store commission rulings (Epic, EU DMA), which move the casino and gacha lines.',
  ],
  openQuestions: [
    'Is a traffic-acquisition revenue share (Google) "advertising" under Δ31? Applied here as yes.',
    'Payment rails: attribute by what is bought (Δ31\'s "never by identity", applied) or by the paying bank?',
    'Manufacturer service contracts: IIFA Resolution 103 maintenance contract (Tier 0, applied) or insurance-like ḍamān?',
    'Music as the product (§39(vi)) and loot boxes without cash-out (§52) remain open elections.',
    'Should a platform\'s take from mature-rated games and video, dating apps or e-books carry F12 content attribution? §52 is silent; not sized.',
    '§60 row 6 describes FTSE Yasaar\'s total-asset ratios; FTSE\'s IdealRatings screen (v1.4, March 2026) uses 24-month market cap and excludes music, film and insurance broking whole-line.',
  ],
  reconciliation: [
    { field: 'Interest income', reference: '$0 (TTM and FY2025)', filing: 'Not disclosed since FY2023', effect: 'A zero would pass Layer 1 on no evidence; the screen uses an estimate (~$4.2b).' },
    { field: 'Cash + interest-bearing securities', reference: '$62.4b (cash and short-term only)', filing: '$146.5b with $84.1b of non-current debt securities', effect: 'The reference figure understates the cash ratios by 57%.' },
    { field: 'Total debt', reference: '$84.3b', filing: '$84.3b borrowings + $1.2b finance leases (track a)', effect: 'Leases are left out: +1.5% on track (a), +16% on track (b).' },
    { field: 'Goodwill', reference: '$0', filing: 'Not presented since FY2017', effect: 'A placeholder of $10b is used; immaterial at this market cap.' },
    { field: 'Intangible assets', reference: '$20.3b (non-current only)', filing: '$25.4b including $5.1b current', effect: 'The tangible-market-cap ratios use $25.4b.' },
    { field: 'Receivables', reference: '$58.9b', filing: '$31.4b trade + $27.5b non-trade (from manufacturing partners)', effect: 'Only trade receivables are AR (§6).' },
  ],
  sources: [
    { label: 'Exhibit 21 — subsidiaries (FY2025 10-K)', href: `${SEC}/000032019325000079/a10-kexhibit21109272025.htm` },
    { label: 'Q3 FY2026 results (8-K, Exhibit 99.1)', href: `${SEC}/000032019326000018/a8-kex991q3202606272026.htm` },
    { label: 'SEC XBRL company facts (CIK 0000320193)', href: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json' },
    { label: 'AppMagic — mobile games monetization 2025 (casino genre)', href: 'https://gamedevreports.substack.com/p/appmagic-mobile-games-monetization' },
    { label: 'Google paid Apple $20b in 2022 (trial filings)', href: 'https://www.phonearena.com/news/google-paid-apple-20-billion-in-2022-to-be-default-safari-search-engine_id157925' },
    { label: 'Bernstein: $18–20b a year from Google', href: 'https://www.theregister.com/2023/10/10/google_pays_apple_18_20_claims_bernstein/' },
    { label: 'WordStream: finance & insurance the largest search-ad vertical', href: 'https://wordstream.com/blog/ws/2012/01/23/google-revenues' },
    { label: 'Apple Music subscriber estimates (MIDiA, Q4 2025)', href: 'https://sqmagazine.co.uk/apple-music-subscriber-statistics/' },
    { label: 'Apple TV+: ~45m subscribers, >$1b annual loss', href: 'https://au.variety.com/2025/digital/news/apple-tv-plus-streaming-losses-1-billion-per-year-21094/' },
    { label: 'AppleCare+ UK — Apple as AIG\'s insurance intermediary', href: 'https://www.apple.com/legal/sales-support/applecare/applecareplus/docs/applecareplus_uk_idd.html' },
    { label: 'AppleCare+ with Theft and Loss (US underwriter)', href: 'https://www.apple.com/shop/product/sx4q2ll/a/applecare-with-theft-and-loss-for-iphone-air' },
    { label: 'AppleCare revenue (Warranty Week)', href: 'https://www.warrantyweek.com/archive/ww20211104.html' },
    { label: 'Apple Card moves to JPMorgan Chase', href: 'https://www.mactrast.com/2026/01/jpmorgan-chase-reaches-deal-to-take-over-apple-card-from-goldman-sachs/' },
    { label: 'Apple ad business forecasts (JPMorgan)', href: 'https://searchengineland.com/apples-ad-business-may-reach-6b-by-2025-385837' },
    { label: 'Loot boxes ~$20b by 2025 (Juniper Research)', href: 'https://www.businesswire.com/news/home/20210308005767/en/Juniper-Research-Video-Game-Loot-Boxes-to-Generate-over-%2420-Billion-in-Revenue-by-2025-but-Tightening-Legislation-Will-Slow-Growth' },
    { label: 'FTSE IdealRatings Islamic indices screening, v1.4', href: 'https://www.lseg.com/content/dam/ftse-russell/en_us/documents/policy-documents/ftse-idealratings-islamic-indexes-screening-guide.pdf' },
    { label: 'S&P DJI — DJIM update, 20 Aug 2026', href: 'https://www.spglobal.com/spdji/en/documents/indexnews/announcements/20260820-1484596/1484596_djim-indices-update-20260820.pdf' },
    { label: 'MSCI Islamic index methodology', href: 'https://www.msci.com/eqb/methodology/meth_docs/MSCI_May16_Islamic_Indexes_Methodology.pdf' },
    { label: 'HLAL holdings (FTSE USA Shariah)', href: 'https://equibles.com/etfs/hlal' },
    { label: 'Musaffa — AAPL', href: 'https://musaffa.com/stock/AAPL/' },
  ],
};

// Three more, from the 2026-10-18 hidden-interest sweep.
export const SHARIAH_ISSUERS: Record<string, IssuerRecord> = { AAPL, ADP, ABNB, DE, AMZN };

export const issuerRecord = (symbol: string | null | undefined): IssuerRecord | null =>
  (symbol && SHARIAH_ISSUERS[symbol.toUpperCase()]) || null;

/* ---------- the computed screen ---------------------------------------------------- */

export interface ScenarioResult {
  s: Scenario;
  verdict: Verdict;
  mcapWindow: string;
  tests: TestResult[];
  g2: 'pass' | 'watch' | 'fail';
  g3: 'pass' | 'fail';
  g4: Gate4Total;
  /** The open-election line at each reading, as a share of revenue. */
  election: { reading: number; npi: number; state: 'pass' | 'fail' }[];
  purification: Purification;
  deciding: string;
}

export interface Screen {
  record: IssuerRecord;
  scenarios: Record<Scenario, ScenarioResult>;
  khums: { company: number; perShare: number };
  /** Each unsettled reading's shift in the Gate-4 total, in share of revenue. */
  sensitivities: { label: string; note: string; shift: Record<Scenario, number> }[];
  /** The five index families on their own rules, against the same figures. */
  indexes: IndexResult[];
}

const PCT = (v: number) => `${(v * 100).toFixed(1)}%`;

/** The ratio's name for a verdict line; at Strictest the total-asset debt test includes operating leases (R19). */
export const testName = (t: TestResult, s: Scenario) =>
  (t.key === 'ibd_ta' && s === 'S' ? 'Debt incl. leases / total assets' : TEST_INFO[t.key].label);

/** Base lines with a sensitivity's lines swapped in by key, or added. */
export function withLines(base: RevenueLine[], swap: RevenueLine[]): RevenueLine[] {
  const keys = new Set(swap.map((l) => l.key));
  return [...base.filter((l) => !keys.has(l.key)), ...swap];
}

export function screenIssuer(r: IssuerRecord): Screen {
  const rev = r.income.revenue;
  const out = {} as Record<Scenario, ScenarioResult>;
  for (const s of SCENARIOS) {
    const l1 = sizeAt(r.l1, s);
    const tests = ratioTests(r.bs, r.mcap, l1, rev, s);
    const g2 = worstOf(tests.filter((t) => t.key !== 'l1_revenue').map((t) => t.state));
    const g3 = worstOf(tests.filter((t) => t.key === 'l1_revenue').map((t) => t.state)) === 'fail' ? 'fail' : 'pass';
    const g4 = gate4(r.lines, rev, s);
    const open = r.lines.find((l) => l.election);
    const election = (open?.election ?? []).map((reading) => {
      const npi = g4.npi + (s === 'C' || s === 'S' ? (sizeAt(open!.base, s) * reading) / rev : 0);
      return { reading, npi, state: (npi <= g4.cap ? 'pass' : 'fail') as 'pass' | 'fail' };
    });
    const failing = tests.filter((t) => t.state === 'fail' || t.state === 'undefined');
    const reasons = [
      ...failing.map((t) => `Gate ${TEST_INFO[t.key].gate}: ${testName(t, s)} ${PCT(t.value ?? 0)} > ${PCT(t.limit ?? 0)}`),
      ...(g4.state === 'fail' ? [`Gate 4: income ${PCT(g4.npi)} > ${PCT(g4.cap)}`] : []),
    ];
    out[s] = {
      s,
      verdict: aggregate({ g1: r.g1 === 'categorical' ? 'categorical' : 'pass', g2, g3, g4: g4.state, screenable: r.gate5.screenable }),
      mcapWindow: scenarioMcap(r.mcap, s).window,
      tests, g2, g3, g4, election,
      purification: purify(r.income, sizeAt(r.l1, s), g4.impure, g4.npi),
      deciding: reasons.length ? reasons.join('; ') : 'All five gates pass',
    };
  }
  const sensitivities = r.sensitivities.map((x) => {
    const lines = withLines(r.lines, x.lines);
    const shift = {} as Record<Scenario, number>;
    for (const s of SCENARIOS) shift[s] = gate4(lines, rev, s).npi - out[s].g4.npi;
    return { label: x.label, note: x.note, shift };
  });
  const indexes = INDEX_RULES.map((rule) => indexScreen(rule, r.bs, r.mcap, r.lines, rev));
  return { record: r, scenarios: out, khums: khums(r.income), sensitivities, indexes };
}
