/* ==========================================================================
   Maz Vantage — researched screen: Walmart Inc., the second stress test

   Written 2026-10-31. Where Amazon hid its prohibited lines in seven broad
   categories, Walmart sells the classic ones openly — alcohol, tobacco, pork,
   lottery tickets — at a scale no other issuer in the record approaches, and
   renamed the one category that said so: Sam's Club's "Fuel, tobacco and
   other categories" (FY2024 10-K, XBRL member FueltobaccoandothercategoriesMember)
   has been "Fuel and other" since the FY2025 10-K. Around the stores sit a
   fintech (OnePay: Synchrony cards, Klarna loans, earned wage access, crypto),
   an Indian payments group with a lending and an insurance-broking arm
   (PhonePe), a licensed lender (Flipkart Finance), a TV maker and ad network
   (Vizio), and shares in a bank (Green Dot) and a lender (Klarna). It also
   re-screens the legacy v3.0 Walmart report the master lists as owed.

   Same shape and rules as the other records; `shariah-v5.ts` does the
   arithmetic. US$ millions unless a field says otherwise.
   ========================================================================== */

import type { IssuerRecord } from './shariah-issuers';
import type { BalanceSheet } from './shariah-v5';

const SEC = 'https://www.sec.gov/Archives/edgar/data/104169';

// Cash, plus $1,226m of debt investments measured on Level-3 inputs (trading, in other long-term assets).
const DEBT_INV = 1_226;

const WMT_BS: BalanceSheet = {
  date: '2026-07-31',
  totalAssets: 293_914,
  totalLiabilities: 293_914 - 104_506 - 293,
  equity: 104_506,
  cashIbs: 11_529 + DEBT_INV,
  cash: 11_529,
  // Receivables, net — pharmacy, insurer and supplier receivables are not split out; counted whole.
  ar: 11_075,
  // Short-term borrowings (commercial paper) $10,479m + long-term debt due within a year $3,470m + $36,462m.
  borrowings: 10_479 + 3_470 + 36_462,
  financeLeases: 880 + 5_952,
  operatingLeases: 1_714 + 14_798,
  goodwill: 28_260,
  // Other acquired intangibles sit inside other long-term assets and are not presented; a placeholder.
  intangibles: 4_000,
};

const quarterEnd = (date: string, o: Partial<BalanceSheet>): BalanceSheet => ({ ...WMT_BS, date, ...o });

export const WMT: IssuerRecord = {
  symbol: 'WMT',
  name: 'Walmart Inc.',
  version: 'v5.0',
  screened: '2026-10-31',
  period: { label: 'Twelve months to 31 July 2026 (Q3 FY2026 – Q2 FY2027)', start: '2025-08-01', end: '2026-07-31' },
  summary: 'Walmart\'s business clears the activity screen and its balance sheet passes at Scenarios A to C: debt is 6.3% '
    + 'and cash 1.4% of its 12-month average market value. What it sells decides it. Alcohol, tobacco and pork — none named '
    + 'in the 10-K, and Sam\'s Club\'s "Fuel, tobacco and other" category renamed "Fuel and other" — come to about 4% of '
    + 'revenue on their own; with lottery commissions, card and lender revenue shares, insurance broking and advertising '
    + 'the estimate is 4.1% at Scenario A and 4.2% at Scenario B, the AAOIFI-based reading. That is under the 5% cap, but '
    + 'the alcohol, tobacco and pork lines rest on the same category benchmarks, and at the top of their bands together '
    + 'they carry both over — so both scenarios are on watch, not passed (Δ61, Δ66). Meat not slaughtered Islamically and '
    + 'GLP-1 medicines carry Scenario C and Strictest far over; Strictest also fails on debt with leases, 25.1% of total assets.',
  ratioNote: 'Debt is commercial paper $10.5b, long-term debt $39.9b and finance leases $6.8b; Strictest adds $16.5b of '
    + 'operating leases. Commercial paper swings with the seasons ($6.6b at 31 January, $10.5b at 31 July) and no average '
    + 'is disclosed, so the period-end balance is used (Δ44). Cash and securities are cash plus $1.2b of debt investments '
    + 'measured on Level-3 inputs. Receivables are counted whole. Intangibles other than goodwill are not presented; a $4b '
    + 'placeholder is used.',
  methodsNote: 'Every index family that divides by market value passes Walmart\'s balance sheet: debt and cash are a few '
    + 'percent of a $0.7–1.0t company, and MSCI\'s total-asset tests pass too. The income test is the open one: on each '
    + 'family\'s own scope the estimate sits near the 5% line, inside its band. Neither Shariah index fund holds Walmart at '
    + '27 October 2026 (SPUS, HLAL); Musaffa rates it doubtful (August 2026).',
  filings: [
    { form: '10-K', period: 'FY2026 (to 31 Jan 2026)', accession: '0000104169-26-000055', href: `${SEC}/000010416926000055/wmt-20260131.htm` },
    { form: '10-Q', period: 'Q1 FY2027 (to 30 Apr 2026)', accession: '0000104169-26-000102', href: `${SEC}/000010416926000102/wmt-20260430.htm` },
    { form: '10-Q', period: 'Q2 FY2027 (to 31 Jul 2026)', accession: '0000104169-26-000154', href: `${SEC}/000010416926000154/wmt-20260731.htm` },
  ],
  // FY2026 + H1 FY2027 − H1 FY2026. Revenue is total revenues (net sales + membership and other income).
  income: {
    revenue: 713_163 + 365_688 - 343_011,
    netIncome: 21_893 + 11_696 - 11_513,
    pretax: 29_469 + 15_160 - 15_313,
    tax: 7_199 + 3_141 - 3_523,
    epsDiluted: 2.73 + 1.46 - 1.43,
    dilutedShares: 7_978,
    dps: 0.99,
  },
  bs: WMT_BS,
  history: [
    quarterEnd('2025-07-31', {
      totalAssets: 270_837, cashIbs: 9_431 + DEBT_INV, ar: 10_518, borrowings: 3_837 + 4_011 + 35_640,
      financeLeases: 828 + 5_947, operatingLeases: 1_580 + 13_171, goodwill: 29_060,
    }),
    quarterEnd('2026-01-31', {
      totalAssets: 284_668, cashIbs: 10_727 + 1_176, ar: 11_172, borrowings: 6_596 + 3_542 + 34_624,
      financeLeases: 856 + 5_905, operatingLeases: 1_631 + 13_941, goodwill: 28_735,
    }),
    WMT_BS,
  ],
  mcap: { m12: 912_603, m24: 836_536, m36: 725_891, spot: 982_399, spotDate: '2026-10-30' },
  l1: {
    point: 352 + 40, low: 352 + 15, high: 352 + 90,
    status: 'disclosed (Layer 1) · estimated (Layer 7, Flipkart Finance)',
    basis: 'Interest income, a separate line: $368m in FY2026 + $171m in H1 FY2027 − $187m in H1 FY2026 = $352m. Layer 7 '
      + 'adds Flipkart Finance, licensed by the RBI in March 2025 to lend on its own book (est. $15–90m).',
  },
  l2: {
    point: 1_859 + 496, low: 1_859 + 496, high: 1_859 + 496,
    basis: 'Interest on debt $1,859m and on finance leases $496m in the window, disclosed.',
  },
  layers: [
    { key: 'L1', label: 'Interest income (gross)', value: '$352m · 0.05%', note: 'Disclosed.' },
    { key: 'L2', label: 'Interest expense', value: '$2.36b · 0.32%', note: 'Disclosed; under the Δ20 trigger.' },
    { key: 'L3', label: 'Capitalised interest', value: 'not disclosed', note: 'Information only.' },
    { key: 'L4', label: 'Pension interest', value: 'none material', note: 'International plans only.' },
    { key: 'L5', label: 'Lease interest', value: '$496m', note: 'Finance leases; operating-lease interest sits in rent. Information only.' },
    { key: 'L6', label: 'Derivative carry', value: 'hedging', note: 'Interest-rate and currency swaps on debt: Tier 0.' },
    { key: 'L7', label: 'Financing income', value: '~$40m', note: 'Flipkart Finance lends directly since 2025. Card, deposit and BNPL shares are Gate-4 lines (Δ46, Δ55).' },
    { key: 'L8', label: 'Cash-vehicle yield', value: 'inside L1', note: 'Cash equivalents; $1.2b of Level-3 debt investments.' },
  ],
  gate1: [
    { step: '1', test: 'Primary business', finding: 'Retail: Walmart U.S. $492.3b, International $139.8b, Sam\'s Club $96.4b of net sales in the window.', result: 'Not P1 — pass' },
    { step: '2', test: 'Own P1 segment > 5% (U2)', finding: 'Three segments. What Walmart conducts itself — retailing alcohol, tobacco and pork inside its grocery categories, lottery agency, Flipkart Finance\'s lending — sits inside retail segments; U2 applies to segments, not categories (§49).', result: 'Pass — Gate 4' },
    { step: '3', test: 'Facilitation (Δ14)', finding: 'Card, deposit and BNPL revenue shares, insurance broking and PhonePe\'s loan distribution: well under 1% of revenue.', result: '< 50% — standard Gate 4' },
    { step: '4', test: 'Sector routing', finding: 'Retail and distribution (§49, §53); advertising Δ31/Δ51; Walmart+ streaming Δ52; pharmacy U1; payments and lending §54.', result: 'Proceed' },
    { step: '5', test: 'Special classes', finding: 'Not a health payer, takaful operator or holding company.', result: 'n/a' },
    { step: '6', test: 'Sub-industry (Δ5, Δ13)', finding: 'The grocery category holds the P1 goods; a category renamed to drop "tobacco" (Δ64).', result: 'Re-routed to §49' },
    { step: '7', test: 'Client elections', finding: 'None.', result: 'n/a' },
  ],
  g1: 'pass',
  gate5: {
    screenable: true,
    finding: 'Screenable — audited 10-K and quarterly 10-Qs with merchandise categories per segment — but the categories hold the P1 goods without naming them, so every Gate-4 line except interest is an estimate.',
    gaps: [
      'Alcohol, tobacco and pork sales are not disclosed; "Grocery" lists alcoholic beverages and meat among its contents, and tobacco is named nowhere since the FY2025 10-K.',
      'Financial-services revenue (OnePay, money services, PhonePe, Flipkart Finance) is not split out.',
      'Advertising ($6.4b in FY2026, including Vizio) is given in earnings materials only, not by format.',
      'Commercial paper has no disclosed average balance; intangibles other than goodwill are not presented.',
    ],
  },
  lines: [
    {
      key: 'interest', label: 'Interest income (Layer 1)', rule: 'Gate 3, D5', tier: 'Tier 1', interest: true,
      base: { point: 352, low: 352, high: 352 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'disclosed', basis: 'See Layer 1.',
    },
    {
      key: 'flipkartLend', wholeLine: true, interest: true, label: 'Flipkart Finance — lending on its own book (Layer 7)', rule: 'Layer 7; U2 (far below 5%)', tier: 'Tier 1',
      base: { point: 40, low: 15, high: 90 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'The RBI registered Flipkart Finance Private Limited as a non-deposit-taking NBFC on 13 March 2025, letting Flipkart '
        + 'lend directly to buyers and sellers (EMIs, BNPL) instead of through Axis and IDFC First. Early in its first full year.',
    },
    {
      key: 'alcUS', wholeLine: true, group: 'category-shares', label: 'Alcohol in Walmart U.S. stores and online', rule: 'P1-ALC, §49', tier: 'Tier 1',
      base: { point: 7_600, low: 5_800, high: 10_200 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Walmart U.S. Grocery ($291.4b) "includes … alcoholic and nonalcoholic beverages". US off-premise alcohol was $89.8b '
        + 'in 2023 (NIQ) and Walmart has called itself the largest US beer retailer; 2.6% of Grocery (band 2.0–3.5%), about 8–9% of '
        + 'US off-premise sales.',
    },
    {
      key: 'alcSams', wholeLine: true, group: 'category-shares', label: 'Alcohol at Sam\'s Club', rule: 'P1-ALC, §49', tier: 'Tier 1',
      base: { point: 1_650, low: 1_320, high: 2_320 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Sam\'s Club Grocery ($66.2b) lists alcoholic beverages; 2.5% of it (band 2.0–3.5%).',
    },
    {
      key: 'alcIntl', wholeLine: true, group: 'category-shares', label: 'Alcohol in Walmart International (Mexico, China, Canada, Chile and others)', rule: 'P1-ALC, §49', tier: 'Tier 1',
      base: { point: 4_000, low: 2_700, high: 5_500 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Mexico and Central America $56.4b (beer is a core category), China $28.1b (Sam\'s Club China), Canada $24.6b '
        + '(provincial limits), Other $30.7b; 3–6%, 2–4%, 0.5–1.5% and 1–2% respectively.',
    },
    {
      key: 'tobUS', wholeLine: true, group: 'category-shares', label: 'Tobacco in Walmart U.S. stores', rule: 'P1-TOB, §49 (Δ64)', tier: 'Tier 1',
      base: { point: 3_000, low: 2_000, high: 4_500 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Walmart sells cigarettes in most US stores (it stopped in select stores in California, Florida, Arkansas and New '
        + 'Mexico in 2022). The 10-K names tobacco nowhere; 3–5% of US cigarette retail.',
    },
    {
      key: 'tobOther', wholeLine: true, group: 'category-shares', label: 'Tobacco at Sam\'s Club ("Fuel and other") and International', rule: 'P1-TOB, §49, Δ64', tier: 'Tier 1',
      base: { point: 1_200, low: 550, high: 2_300 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Sam\'s Club\'s category was "Fuel, tobacco and other categories" until the FY2025 10-K renamed it "Fuel and other" '
        + '($13.3b in the window); Sam\'s cut tobacco to fewer than 40 of ~600 clubs after 2018. International stores sell '
        + 'cigarettes in Mexico, China and elsewhere.',
    },
    {
      key: 'porkUS', wholeLine: true, group: 'category-shares', label: 'Pork in Walmart U.S.', rule: 'P1-PRK, §49', tier: 'Tier 1',
      base: { point: 6_400, low: 4_700, high: 8_200 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Grocery lists meat and deli. US retail meat was $112b in 2025 (Power of Meat 2026); pork runs 9–18% of meat dollars '
        + 'before bacon, ham and sausage. 2.2% of Walmart U.S. Grocery (band 1.6–2.8%).',
    },
    {
      key: 'porkOther', wholeLine: true, group: 'category-shares', label: 'Pork at Sam\'s Club and International (China above all)', rule: 'P1-PRK, §49', tier: 'Tier 1',
      base: { point: 5_240, low: 3_410, high: 7_000 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Sam\'s Club 2.2% of Grocery ($1.5b). China, where pork is the main meat, 4–8% of sales; Mexico 1.5–3.5%; Canada '
        + '1–2%; Other 0.5–1.5%.',
    },
    {
      key: 'meat', label: 'Meat not slaughtered Islamically (beef, poultry, lamb)', rule: 'D13 — Sc C and Strictest only', tier: 'Tier 1 at Sc C+',
      base: { point: 31_000, low: 24_000, high: 38_000 }, rate: { A: 0, B: 0, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Meat other than pork, ~7.5% of Walmart U.S. and Sam\'s Club Grocery, plus ~3% of International sales.',
    },
    {
      key: 'gelatin', label: 'Gelatin of unstated source (confectionery, capsules)', rule: '§48 mushbooh row (Δ60)', tier: 'Tier 2',
      base: { point: 3_000, low: 2_000, high: 5_000 }, rate: { A: 0, B: 0, C: 0.025, S: 0.05 },
      status: 'estimated — wide band', basis: 'Gummies, marshmallows and capsules whose gelatin source is not stated.',
    },
    {
      key: 'lottery', wholeLine: true, label: 'Lottery commissions (select stores)', rule: '§49, P1-GMB', tier: 'Tier 1',
      base: { point: 60, low: 20, high: 150 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'State lotteries sell through select Walmart stores (Florida, Arkansas, Oklahoma, Michigan, Louisiana and others); '
        + 'retailer commissions of ~5–6% of ticket sales.',
    },
    {
      key: 'retailAds', label: 'Walmart Connect sponsored ads (retail media)', rule: 'Δ51 — retail media by catalogue share', tier: 'Tier 1 by advertised product',
      base: { point: 5_000, low: 4_300, high: 5_700 },
      rate: { A: { point: 0.02, high: 0.035 }, B: { point: 0.02, high: 0.035 }, C: { point: 0.02, high: 0.035 }, S: { point: 0.02, high: 0.035 } },
      status: 'estimated',
      basis: 'Global advertising was ~$6.4b in FY2026 including Vizio and grew ~40%; on-site retail media is most of it. The '
        + 'store sells alcohol and pork, so its sponsored listings carry them: 2% (to 3.5%).',
    },
    {
      key: 'vizioAds', wholeLine: true, label: 'Vizio connected-TV advertising', rule: 'Δ31 — advertising pass-through', tier: 'Tier 1 by advertised product',
      base: { point: 1_500, low: 1_100, high: 2_000 },
      rate: { A: { point: 0.075, high: 0.10 }, B: { point: 0.175, high: 0.22 }, C: { point: 0.175, high: 0.22 }, S: { point: 0.175, high: 0.22 } },
      status: 'estimated — wide band',
      basis: 'Vizio\'s platform advertising grew triple digits after the acquisition (closed December 2024). Δ31\'s TV benchmarks: '
        + 'alcohol and sportsbooks at Sc A; conventional finance and insurance added at Sc B+.',
    },
    {
      key: 'displayAds', label: 'Off-site display advertising', rule: 'Δ31 — advertising pass-through', tier: 'Tier 1 by advertised product',
      base: { point: 700, low: 500, high: 1_000 },
      rate: { A: { point: 0.06, high: 0.09 }, B: { point: 0.16, high: 0.21 }, C: { point: 0.16, high: 0.21 }, S: { point: 0.16, high: 0.21 } },
      status: 'estimated — wide band', basis: 'Walmart Connect\'s off-site inventory; digital benchmarks.',
    },
    {
      key: 'streaming', wholeLine: true, label: 'Paramount+ or Peacock inside Walmart+', rule: 'F12, Δ28, Δ52 — general-entertainment SVOD archetype', tier: 'Tier 2',
      base: { point: 550, low: 240, high: 980 }, rate: { A: 0.30, B: 0.35, C: 0.40, S: 0.50 },
      status: 'estimated — wide band',
      basis: 'Membership fees were $4.4b in FY2026, Walmart+ about half. Since 15 September 2025 members choose Paramount+ or '
        + 'Peacock ($7.99–10.99 a month value). Its slice, triangulated (Δ52): value ~35%, cost ~25%, usage ~15% → median 25%, '
        + 'band 15–35%.',
    },
    {
      key: 'glp1', label: 'GLP-1 and ED medicines (Walmart and Sam\'s Club pharmacies)', rule: 'U1 (lock)', tier: 'Tier 2',
      base: { point: 7_000, low: 5_000, high: 9_500 }, rate: { A: 0, B: 0, C: 0.30, S: 1 },
      status: 'estimated — wide band',
      basis: 'Health and wellness was $74.5b in the window, led by pharmacy; GLP-1s are 10–15% of US prescription dollars.',
    },
    {
      key: 'insurance', wholeLine: true, label: 'Insurance broking (PhonePe Insurance Broking)', rule: '§31, P1-INS (Δ54)', tier: 'Tier 1',
      base: { point: 25, low: 18, high: 40 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'PhonePe\'s insurance-broking subsidiary reported ₹191 crore of revenue in FY2026 (Mar 2026); at ~₹86 to the dollar.',
    },
    {
      key: 'phonepeLend', wholeLine: true, label: 'PhonePe loan distribution', rule: 'Δ46 — a share of partners\' lending income', tier: 'Tier 1 at Sc B+',
      base: { point: 110, low: 80, high: 150 }, rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'PhonePe\'s lending subsidiary\'s revenue more than doubled to ₹945 crore in FY2026; read as distribution for partner '
        + 'lenders. If it lends on its own book it is Layer 7 at every scenario instead.',
    },
    {
      key: 'onepayCard', wholeLine: true, label: 'OnePay card programme (Synchrony) and deposit shares', rule: 'Δ46', tier: 'Tier 1 at Sc B+',
      base: { point: 120, low: 40, high: 300 }, rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'OnePay, Walmart\'s majority-owned fintech, runs Walmart\'s card programme from fall 2025: a Walmart card and a '
        + 'Mastercard, issued and carried by Synchrony. Walmart\'s share is undisclosed.',
    },
    {
      key: 'greenDot', wholeLine: true, label: 'Walmart MoneyCard and prepaid access (Green Dot Bank)', rule: 'Δ46 — deposit referral share', tier: 'Tier 1 at Sc B+',
      base: { point: 120, low: 50, high: 250 }, rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'The 10-K lists "prepaid access" among Walmart U.S. financial services; the Walmart MoneyCard is issued by Green Dot '
        + 'Bank, whose shares Walmart also holds (13F, $13.2m).',
    },
    {
      key: 'klarna', ownRule: true, label: 'Klarna warrants earned for OnePay Later loans', rule: 'Δ55 — consideration in kind from a lender', tier: 'Tier 1 at Sc B+',
      base: { point: 80, low: 30, high: 200 }, rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Klarna issued warrants over 15,343,932 shares at ~$34 to OnePay "in exchange for certain services" when it became '
        + 'Walmart\'s exclusive installment lender (2025); Affirm valued them at $200–300m. Vesting value in the window; Walmart '
        + 'holds $48.6m of Klarna shares (13F).',
    },
    {
      key: 'moneySvc', label: 'Cheque cashing at a discount', rule: 'Δ65 — sale of a debt (bayʿ al-dayn)', tier: 'Tier 1 at Sc B+',
      base: { point: 100, low: 50, high: 200 }, rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Walmart U.S. offers "money orders, prepaid access, money transfers, check cashing, bill payment". Transfer and '
        + 'money-order fees are Tier 0; cashing a cheque for less than its face buys a debt at a discount.',
    },
    {
      key: 'lookThrough', ownRule: true, label: 'Green Dot and Klarna look-through', rule: 'U4, Δ57', tier: 'Tier 1',
      base: { point: 5, low: 2, high: 15 }, rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated', basis: 'Walmart\'s pro-rata share of a bank\'s and a lender\'s interest income: both stakes are small.',
    },
  ],
  sensitivities: [
    {
      label: 'Movies, music and video games sold in the stores, at the studio archetype',
      note: 'General merchandise includes "video games, movies, music and books"; §52 is silent on a retailer\'s media sales.',
      lines: [{
        key: 'media', label: 'Media goods', rule: 'F12 by analogy', tier: 'Tier 2',
        base: { point: 6_000, low: 4_000, high: 9_000 }, rate: { A: 0.18, B: 0.22, C: 0.28, S: 0.38 },
        status: 'estimated — wide band', basis: 'No published split.',
      }],
    },
    {
      label: 'Walmart U.S. alcohol and tobacco at the high edge of their bands',
      note: 'These two lines alone, at the top of their bands, add about 0.6 points: Scenarios A and B stay under 5%. It takes the whole category group (Δ66) to cross.',
      lines: [
        { key: 'alcUS', label: 'Alcohol in Walmart U.S.', rule: 'P1-ALC', tier: 'Tier 1', base: { point: 10_200, low: 10_200, high: 10_200 }, rate: { A: 1, B: 1, C: 1, S: 1 }, status: 'estimated', basis: 'High edge.' },
        { key: 'tobUS', label: 'Tobacco in Walmart U.S.', rule: 'P1-TOB', tier: 'Tier 1', base: { point: 4_500, low: 4_500, high: 4_500 }, rate: { A: 1, B: 1, C: 1, S: 1 }, status: 'estimated', basis: 'High edge.' },
      ],
    },
  ],
  standards: [
    { name: 'MSCI Islamic M-Series', tests: 'Debt, cash + securities, receivables + cash < 33.33% of average market cap', result: 'pass', deciding: 'Debt 7.9%, cash 1.8%, receivables + cash 3.3% of the 36-month average' },
    { name: 'Securities Commission Malaysia', tests: 'Debt and conventional cash < 33% of total assets; 5% / 20% activity benchmarks', result: 'pass', deciding: 'Debt 19.5% of total assets; alcohol, tobacco and pork each under 5%' },
    { name: 'OJK / DSN-MUI (Indonesia)', tests: 'Interest debt ≤ 45% of total assets; non-halal income ≤ 10%', result: 'pass', deciding: 'Debt 19.5%; income 4.2%' },
    { name: 'SECP Pakistan (KMI)', tests: 'Debt < 37% and non-compliant investments < 33% of total assets; illiquid assets ≥ 25%', result: 'pass', deciding: 'Debt 19.5%; investments 4.3%' },
  ],
  gflags: [
    'A category relabelled to drop a prohibited word: Sam\'s Club "Fuel, tobacco and other categories" (to FY2024) became "Fuel and other" (Δ64).',
    'OnePay offers "limited access to cryptocurrency" and earned wage access; neither is sized.',
    'Walmart holds Green Dot (a bank holding company) and Klarna (a lender) shares, both from commercial partnerships.',
    'The Walton family controls about 45% of the shares; single class of stock.',
  ],
  monitoring: [
    'Scenarios A and B at 4.1–4.2% against 5%, on watch (Δ66): the seven alcohol, tobacco and pork lines share one set of category benchmarks; at the top of their bands together they add 1.5 points, to 5.6–5.7%. Scanner data (NielsenIQ, Circana) or a disclosure would settle it.',
    'Strictest debt with leases at 25.1% of total assets, carried over by the July commercial-paper peak ($10.5b against $6.6b in January).',
    'PhonePe\'s IPO prospectus (filed 2026): its lending and insurance figures, and whether its lending arm lends on its own book.',
    'OnePay\'s card economics and the Klarna warrant vesting; Flipkart Finance\'s loan book.',
  ],
  openQuestions: [
    'Δ64: a category renamed to drop "tobacco" — sized from the last disclosure and benchmarks; interim.',
    'Δ66: lines sized from one shared source tested together under Δ61 — it moves Walmart\'s Scenarios A and B from PASS to MIXED — Watch; interim.',
    'Δ65: cheque cashing as bayʿ al-dayn at Sc B+ — interim.',
    'Earned wage access (OnePay): an advance on earned wages for a fee — qarḍ with a fee, or a service? Not sized.',
    'Crypto trading through OnePay (Δ7): access only, unsized.',
  ],
  reconciliation: [
    { field: 'Revenue', reference: 'Net sales $728.5b', filing: 'Total revenues $735.8b including $7.4b of membership and other income', effect: 'Total revenues are the denominator (§6).' },
    { field: 'Tobacco', reference: 'Not named in the FY2025 or FY2026 10-K', filing: 'Sam\'s "Fuel, tobacco and other categories" in the FY2024 10-K (XBRL member)', effect: 'Kept as a Gate-4 line (Δ64).' },
    { field: 'Legacy v3.0 report', reference: 'Pork + alcohol 3.0–3.6%; with tobacco and poultry 6.7–8.3%', filing: 'Pork + alcohol 3.4% (point); tobacco 0.6%; other meat at Sc C+ only', effect: 'Consistent; the v3.0 "Sc A without tobacco" stays withdrawn (§49).' },
    { field: 'Musaffa', reference: 'Doubtful (August 2026)', filing: 'Sc A and B on watch (4.1–4.2%, estimate-dependent); Sc C and Strictest fail', effect: 'Not reconciled (§39(iv)).' },
  ],
  sources: [
    { label: 'Walmart FY2026 Form 10-K', href: `${SEC}/000010416926000055/wmt-20260131.htm` },
    { label: 'Walmart Q2 FY2027 Form 10-Q', href: `${SEC}/000010416926000154/wmt-20260731.htm` },
    { label: 'Walmart FY2024 Form 10-K ("Fuel, tobacco and other categories")', href: `${SEC}/000010416924000056/wmt-20240131.htm` },
    { label: 'Walmart 13F-HR, 30 June 2026', href: `${SEC}/000112329226001072/form13fInfoTable.xml` },
    { label: 'PhonePe FY2026 revenue by subsidiary (Outlook Business)', href: 'https://www.outlookbusiness.com/corporate/phonepe-fy26-losses-rs-2792-cr-revenue-rises-11-pc-lending-wealth-insurance-grow-ipo-plans' },
    { label: 'Flipkart Finance NBFC licence (Business Standard)', href: 'https://www.business-standard.com/amp/companies/news/walmart-s-flipkart-secures-approval-for-direct-lending-in-india-report-125060500781_1.html' },
    { label: 'OnePay and Synchrony card programme', href: 'https://www.fintechfutures.com/partnerships/walmart-reunites-with-synchrony-financial-for-onepay-credit-card-issuance' },
    { label: 'Klarna warrants to OnePay (NBC News)', href: 'https://www.nbcnews.com/business/business-news/klarna-nearing-ipo-plucks-lucrative-walmart-fintech-partnership-rival-rcna196764' },
    { label: 'Walmart+ adds Peacock alongside Paramount+', href: 'https://corporate.walmart.com/news/2025/09/01/walmart-plus-celebrates-5th-anniversary-with-expanded-video-streaming-choices' },
    { label: 'Walmart global advertising ~$6.4b (FY2026)', href: 'https://ppc.land/walmart-connect-hits-41-growth-as-ad-business-nears-6-4b/' },
    { label: 'Walmart stops cigarettes in select stores (2022)', href: 'https://m.washingtontimes.com/news/2022/mar/29/walmart-to-stop-selling-cigarettes-in-some-stores/' },
    { label: 'Sam\'s Club tobacco in fewer than 40 clubs (RetailWire)', href: 'https://retailwire.com/discussion/walmart-appears-ready-to-quit-its-cigarette-habit/' },
    { label: 'NIQ: off-premise alcohol $89.8b (2023)', href: 'https://www.brewbound.com/news/niq-off-premise-total-alcohol-sales-reach-89-8-billion-in-2023-beer-sales-47-9-billion' },
    { label: 'Walmart lottery partnerships (Oklahoma)', href: 'https://www.kjrh.com/news/state/walmart-partners-with-oklahoma-lottery-to-offer-ticket-kiosks' },
    { label: 'Musaffa — WMT', href: 'https://musaffa.com/stock/WMT/' },
  ],
};
