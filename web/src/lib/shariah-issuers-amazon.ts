/* ==========================================================================
   Maz Vantage — researched screen: Amazon.com, Inc., the stress test

   Written 2026-10-28 to stress the methodology: one issuer that reaches every
   part of it — retail with alcohol and pork, a marketplace, a pharmacy, a
   studio and streaming service, a live-streaming site, an advertising business
   larger than most media groups, a cloud that hosts banks and sportsbooks,
   card and lender revenue shares, an insurance agency, a lender bought in
   India, and the largest private-stake marks any issuer carries (Anthropic,
   OpenAI). The 10-K names none of the prohibited lines: every one sits inside
   seven broad categories, so the screen sizes each of them, banded, and says
   where it looked. Interim deltas Δ49–Δ60 came out of it.

   Same shape and rules as Apple's record in `shariah-issuers.ts`; the engine
   in `shariah-v5.ts` does the arithmetic. Figures are from the filings named
   in `filings` and from Anthropic's S-1 (26 October 2026); estimates say what
   they rest on. US$ millions unless a field says otherwise.
   ========================================================================== */

import type { IssuerRecord } from './shariah-issuers';
import type { BalanceSheet } from './shariah-v5';

const SEC = 'https://www.sec.gov/Archives/edgar/data/1018724';

// Anthropic carrying values (notes at fair value + nonvoting preferred) less the cash Amazon put in:
// the Level-3 mark-ups inside total assets that Δ50 takes out at Scenario C and Strictest.
const anthropicUplift = (notes: number, preferred: number, invested: number) => notes + preferred - invested;

// Cash and marketable debt securities exclude equity securities. Affordable-housing loans
// (Housing Equity Fund, below-market loans) and Axio's loan book are interest-bearing but not
// disclosed; ~$2.9b is added as an estimate at every quarter-end.
const LOANS_EST = 2_900;

const AMZN_BS: BalanceSheet = {
  date: '2026-06-30',
  totalAssets: 1_095_689,
  totalLiabilities: 544_069,
  equity: 551_620,
  // Cash and time deposits $14,497m + money-market funds $40,845m + US government and agency $4,534m +
  // corporate debt $59,431m + asset-backed $1,681m + other $27m (incl. $2,714m restricted).
  cashIbs: 121_015 + LOANS_EST,
  cash: 78_213,
  // Customer receivables only; vendor ($21.7b) and other ($9.8b) receivables and prepaid items are not AR (§6).
  ar: 49_200,
  // Δ59: notes $128,894m long-term + $3,330m current (in accrued expenses) + $325m short-term
  // facilities + financing obligations $415m current and ~$8.9b long-term (in other liabilities).
  borrowings: 128_894 + 3_330 + 325 + 415 + 8_900,
  financeLeases: 13_451,
  operatingLeases: 96_320,
  goodwill: 23_504,
  // Acquired intangibles are disclosed annually; the 31 December 2025 figure.
  intangibles: 9_197,
  // Notes $97.9b + preferred $92.5b against $18.0b invested ($8.0b of notes, $5.0b Series G, $5.0b Series H).
  level3Gains: anthropicUplift(97_900, 92_500, 8_000 + 5_000 + 5_000),
};

const quarterEnd = (date: string, o: Partial<BalanceSheet>): BalanceSheet => ({ ...AMZN_BS, date, ...o });

export const AMZN: IssuerRecord = {
  symbol: 'AMZN',
  name: 'Amazon.com, Inc.',
  version: 'v5.0',
  screened: '2026-10-28',
  period: { label: 'Twelve months to 30 June 2026 (Q3 2025 – Q2 2026)', start: '2025-07-01', end: '2026-06-30' },
  summary: 'Amazon clears the activity screen and every balance-sheet test at Scenarios A to C: debt is 5.9% and cash '
    + 'and securities 4.7% of its 12-month average market value, and interest is 0.6% of revenue. No prohibited line is '
    + 'disclosed by name, so the screen estimates thirty-five of them. Non-permissible income is 2.0% of revenue at '
    + 'Scenario A and 3.5% at Scenario B, the AAOIFI-based reading, both under the 5% cap — B includes the $6.8b of gains '
    + 'Amazon booked when its interest-free Anthropic loans converted at a fixed price, a benefit to the lender (Δ49). It '
    + 'is 7.9% at Scenario C and 8.4% at Strictest, where AWS capacity rented to banks, insurers and sportsbooks is counted '
    + 'on industry benchmarks (Δ56); at A and B only named customers count. 42% of the Scenario B figure is disclosed.',
  ratioNote: 'Debt is $132.2b of notes ($128.9b long-term and $3.3b current, inside accrued expenses), $9.3b of financing '
    + 'obligations filed under other liabilities, $0.3b of short-term facilities and $13.5b of finance leases; Strictest adds '
    + '$96.3b of operating leases (Δ59). Cash and securities ($121.0b) exclude equities; ~$2.9b of affordable-housing loans '
    + 'and Axio\'s loan book is added as an estimate. The Anthropic notes ($97.9b at fair value) are left out: Anthropic\'s '
    + 'S-1 says they bear no interest. Receivables are customer receivables only. At Scenario C and Strictest the asset base '
    + 'drops $172.4b of Anthropic mark-ups (Δ50); intangibles are the 31 December 2025 figure.',
  methodsNote: 'Every index family that divides by market value passes Amazon\'s balance sheet: debt and cash are single-digit '
    + 'percentages of a $2.2–2.7t company. FTSE\'s whole-line count (film, music, insurance broking, conventional finance, '
    + 'alcohol, pork, gambling and TV advertising counted in full) puts Amazon within the range of the estimates of its 5% '
    + 'line. The index rows apply each family\'s own scope, so they leave out the rules only Maz Vantage runs: the Anthropic '
    + 'conversions (Δ49), the Affirm warrants (Δ55), AWS customers (Δ56) and the look-throughs (Δ57). The Shariah index funds hold none: the S&P 500 Shariah ETF (SPUS) held Amazon at 6.4% in May 2025 and holds '
    + 'none at 27 October 2026, and the FTSE USA Shariah ETF (HLAL) holds none. Each provider\'s constituent list is the '
    + 'authority for its index; neither publishes its reason.',
  filings: [
    { form: '10-K', period: 'FY2025 (to 31 Dec 2025)', accession: '0001018724-26-000004', href: `${SEC}/000101872426000004/amzn-20251231.htm` },
    { form: '10-Q', period: 'Q3 2025 (to 30 Sep 2025)', accession: '0001018724-25-000123', href: `${SEC}/000101872425000123/amzn-20250930.htm` },
    { form: '10-Q', period: 'Q1 2026 (to 31 Mar 2026)', accession: '0001018724-26-000014', href: `${SEC}/000101872426000014/amzn-20260331.htm` },
    { form: '10-Q', period: 'Q2 2026 (to 30 Jun 2026)', accession: '0001018724-26-000026', href: `${SEC}/000101872426000026/amzn-20260630.htm` },
  ],
  // FY2025 + H1 2026 − H1 2025.
  income: {
    revenue: 716_924 + 382_125 - 323_369,
    netIncome: 77_670 + 92_902 - 35_291,
    pretax: 97_311 + 120_691 - 42_536,
    tax: 19_087 + 27_759 - 7_231,
    epsDiluted: 7.17 + 8.53 - 3.27,
    dilutedShares: 10_903,
    dps: 0,
    // Δ58: other income, net ($15,229m + $69,062m − $3,866m, mostly Anthropic mark-ups and note conversions), after tax.
    nonOperatingGains: (15_229 + 69_062 - 3_866) * (1 - (19_087 + 27_759 - 7_231) / (97_311 + 120_691 - 42_536)),
  },
  bs: AMZN_BS,
  history: [
    quarterEnd('2025-09-30', {
      totalAssets: 727_921, cashIbs: 97_739 - 3_220 + LOANS_EST, ar: 38_000,
      borrowings: 50_742 + 3_997 + 220 + 281 + 7_200, financeLeases: 11_765, operatingLeases: 86_233,
      goodwill: 23_260, level3Gains: anthropicUplift(23_700, 14_800, 6_600),
    }),
    quarterEnd('2025-12-31', {
      totalAssets: 818_042, cashIbs: 126_325 - 3_687 + LOANS_EST, ar: 40_400,
      borrowings: 65_648 + 2_748 + 455 + 358 + 7_800, financeLeases: 12_286, operatingLeases: 89_252,
      goodwill: 23_273, level3Gains: anthropicUplift(45_800, 14_800, 8_000),
    }),
    quarterEnd('2026-03-31', {
      totalAssets: 916_630, cashIbs: 145_965 - 2_801 + LOANS_EST, ar: 43_300,
      borrowings: 119_074 + 2_832 + 152 + 340 + 8_200, financeLeases: 13_325, operatingLeases: 91_617,
      goodwill: 23_449, level3Gains: anthropicUplift(42_200, 32_000, 8_000),
    }),
    AMZN_BS,
  ],
  mcap: { m12: 2_615_018, m24: 2_435_018, m36: 2_214_564, spot: 2_722_344, spotDate: '2026-10-27' },
  l1: {
    point: 4_660 + 65, low: 4_660 + 40, high: 4_660 + 110,
    status: 'disclosed (Layer 1) · estimated (Layer 7, Axio)',
    basis: 'Interest income, a separate line: $4,381m in 2025 + $2,430m in H1 2026 − $2,151m in H1 2025 = $4,660m, on '
      + 'money-market funds and investment-grade debt at ~3.7–4.0% and on affordable-housing loans. Layer 7 adds Axio, '
      + 'Amazon\'s Indian lender since September 2025 (est. $40–110m). The Anthropic notes earn nothing (S-1).',
  },
  l2: {
    point: 3_331, low: 3_331, high: 3_331,
    basis: 'Interest expense, disclosed: $2,274m in 2025 + $2,114m in H1 2026 − $1,057m in H1 2025. Q2 2026 alone was '
      + '$1,314m after $66b of notes in March–June 2026.',
  },
  layers: [
    { key: 'L1', label: 'Interest income (gross)', value: '$4.66b · 0.60%', note: 'Disclosed. Money-market funds, corporate, government and asset-backed debt, and affordable-housing loans.' },
    { key: 'L2', label: 'Interest expense', value: '$3.33b · 0.43%', note: 'Disclosed. Under the Δ20 trigger (0.5% of revenue); the run rate doubled in Q2 2026.' },
    { key: 'L3', label: 'Capitalised interest', value: 'not disclosed', note: 'The cash-flow note shows interest paid "net of capitalized interest". Information only.' },
    { key: 'L4', label: 'Pension interest', value: 'none material', note: 'No material defined-benefit plans.' },
    { key: 'L5', label: 'Lease interest', value: '~$0.5b', note: '$312m on finance leases (2025) and $215m paid on financing obligations; operating-lease interest sits in lease cost. Information only.' },
    { key: 'L6', label: 'Derivative carry', value: 'hedging', note: 'Energy contracts ($705m of assets) and FX: commercial hedging is Tier 0.' },
    { key: 'L7', label: 'Financing income', value: '~$65m · 0.01%', note: 'Axio, an RBI-registered lender owned since 4 September 2025. Amazon stopped lending to sellers itself in March 2024. Card and lender revenue shares are Gate-4 lines (Δ46).' },
    { key: 'L8', label: 'Cash-vehicle yield', value: 'inside L1', note: 'Money-market funds $40.8b; cash and time deposits $14.5b at 30 Jun 2026.' },
  ],
  gate1: [
    { step: '1', test: 'Primary business', finding: 'Online and physical retail (North America $453.7b, International $173.6b in the window) and cloud services (AWS $148.4b).', result: 'Not P1 — pass' },
    { step: '2', test: 'Own P1 segment > 5% (U2)', finding: 'Three segments. What Amazon conducts itself — Axio\'s lending in India (est. $65m) and insurance agency at checkout and in Amazon Pay India — is under 0.1% of revenue.', result: 'Below 5% — pass, G-flag' },
    { step: '3', test: 'Facilitation (Δ14)', finding: 'Card and lender revenue shares, Affirm warrants, insurance distribution, the marketplace take on alcohol, ads for P1 goods and a sportsbook integration: ~1–3% of revenue.', result: '< 50% — standard Gate 4' },
    { step: '4', test: 'Sector routing', finding: 'Retail §49; marketplace Δ53; Prime Video, MGM, Music and Twitch Part VII (F12); games and the Appstore §52; payments and lending §54; advertising Δ31 and Δ51; pharmacy U1; cloud and data centres Δ56.', result: 'Proceed' },
    { step: '5', test: 'Special classes', finding: 'Not a health payer (One Medical is a provider), takaful operator or holding company.', result: 'n/a' },
    { step: '6', test: 'Sub-industry (Δ5, Δ13)', finding: '"Broadline retail" hides a $76b advertising business, a studio and streaming group, a lender and a private-stake portfolio carried at $224b.', result: 'Re-routed (F13)' },
    { step: '7', test: 'Client elections', finding: 'None.', result: 'n/a' },
  ],
  g1: 'pass',
  gate5: {
    screenable: true,
    finding: 'Screenable — audited 10-K and quarterly 10-Qs with seven product-and-service categories — but no prohibited line is disclosed inside them, so every Gate-4 line except interest is an estimate.',
    gaps: [
      'Online and physical-store sales by category (alcohol, pork, meat, pharmacy): not disclosed.',
      'Other revenue ($6.6b) names co-branded credit card agreements alongside healthcare services, video licensing and shipping, with no split.',
      'Subscription revenue is not split by service, and Prime fees are not allocated between benefits.',
      'Advertising is not split by format (sponsored listings, video, display) or by advertiser category.',
      'AWS revenue by customer industry: not disclosed.',
      'OpenAI\'s financial statements are private; Anthropic\'s became public with its S-1 on 26 October 2026.',
      'Acquired intangible assets are disclosed annually (31 December 2025 used).',
    ],
  },
  lines: [
    {
      key: 'interest', label: 'Interest income (Layer 1)', rule: 'Gate 3, D5', tier: 'Tier 1', interest: true,
      base: { point: 4_660, low: 4_660, high: 4_660 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'disclosed',
      basis: 'See Layer 1.',
    },
    {
      key: 'axio', wholeLine: true, interest: true, label: 'Axio — Amazon\'s Indian lender, on its own book (Layer 7)', rule: 'Layer 7; U2 (far below 5%)', tier: 'Tier 1',
      base: { point: 65, low: 40, high: 110 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Acquired 4 September 2025 after RBI approval: a non-bank lender (checkout credit, small-business loans) that '
        + 'powers Amazon Pay Later. FY2024 revenue ₹351–384 crore on ₹2,200 crore of loans; ten months in the window at a '
        + 'likely ₹600–800 crore run rate.',
    },
    {
      key: 'cards', wholeLine: true, label: 'Co-brand and store cards (Chase Prime Visa, Synchrony Store Card and Pay Later, others)', rule: 'Δ46 — a share of a partner\'s lending income', tier: 'Tier 1 at Sc B+',
      base: { point: 1_300, low: 700, high: 2_200 },
      rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'The 10-K files "our co-branded credit card agreements" inside Other revenue ($6.6b in the window, with '
        + 'healthcare services, video licensing and shipping). Synchrony pays partners a share of program profit above a '
        + 'threshold (~$4.0b across all partners in 2025) and added interest-bearing Pay Later loans on Amazon carts of $50+ '
        + 'in 2025; Chase issues Prime Visa. No figure is published; bounded by Other revenue less its other parts. Sc A '
        + 'treats it as a lease of promotional capacity (Δ31 carve-out).',
    },
    {
      key: 'affirm', ownRule: true, label: 'Affirm warrants earned for new Affirm borrowers on Amazon', rule: 'Δ55 (Δ46 rates) — consideration in kind from a lender', tier: 'Tier 1 at Sc B+',
      base: { point: 200, low: 150, high: 260 },
      rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Affirm granted Amazon warrants over 22m shares (2021) that vest as Amazon customers take their first Affirm '
        + 'loan; with an amended agreement in November 2025 the strike on warrants vesting from February 2026 fell from $100 '
        + 'to $63.06. Affirm expensed $199.9m for warrants vesting in its year to 30 June 2026, the same window. Later '
        + 'fair-value moves are capital gains (U3), documented.',
    },
    {
      key: 'sellerloans', wholeLine: true, label: 'Referrals to seller lenders (Parafin, Lendistry, SellersFi, Slope)', rule: 'Δ46', tier: 'Tier 1 at Sc B+',
      base: { point: 20, low: 0, high: 60 },
      rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Amazon stopped lending to sellers itself on 6 March 2024 and now offers term loans, cash advances and credit '
        + 'lines from third-party lenders inside Seller Central. Whether it is paid for the referrals is not disclosed; '
        + 'the band starts at zero.',
    },
    {
      key: 'insurance', wholeLine: true, label: 'Insurance distribution (Amazon Protect plans, Amazon Pay India agency)', rule: '§31, P1-INS (Δ54)', tier: 'Tier 1',
      base: { point: 250, low: 100, high: 500 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Amazon Protect warranty and accident plans are underwritten by insurers (London General / The Warranty Group in '
        + 'the UK and EU) and sold at checkout. Amazon Pay India is an IRDAI composite corporate agent selling motor cover '
        + '(HDFC ERGO, ACKO, ICICI Lombard), travel and other insurance. Commissions are not published.',
    },
    {
      key: 'alcStores', wholeLine: true, label: 'Alcohol in Whole Foods Market and other physical stores', rule: 'P1-ALC, §49', tier: 'Tier 1',
      base: { point: 1_093, low: 690, high: 1_496 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Physical stores $23.0b in the window, ~90% Whole Foods (~530 stores; analysts put it at $22–25b). Beer and wine, '
        + 'spirits where state law allows, taprooms in some stores: 4.75% of sales, band 3.0–6.5%. Supermarkets sell ~42% of '
        + 'US off-premise wine and ~17% of spirits (NIQ 2024).',
    },
    {
      key: 'alcOnline', wholeLine: true, label: 'Alcohol sold by Amazon online (UK, Germany, Japan, Europe; US grocery delivery)', rule: 'P1-ALC, §49', tier: 'Tier 1',
      base: { point: 1_300, low: 700, high: 2_200 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Amazon is itself the retailer of wine, beer and spirits in the UK, Germany, Japan and other European stores, and '
        + 'delivers beer and wine with Whole Foods and same-day grocery orders where licensed. Germany $45.9b, UK $43.2b, '
        + 'Japan $30.7b of sales (FY2025); 0.5–1.5% of those stores\' own sales plus US delivery.',
    },
    {
      key: 'alc3p', wholeLine: true, label: 'Marketplace take on third-party alcohol (pre-approved and licensed sellers)', rule: 'Δ53 — marketplace take on prohibited goods', tier: 'Tier 1',
      base: { point: 300, low: 120, high: 700 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Third-party seller services $183.7b. In the US alcohol above 0.0% ABV is allowed only from pre-approved selling '
        + 'partners; Italy and other European stores sell wine under an authorisation and a customs licence. 0.1–0.4% of '
        + 'third-party sales.',
    },
    {
      key: 'porkStores', wholeLine: true, label: 'Pork in Whole Foods Market and other physical stores', rule: 'P1-PRK, §49', tier: 'Tier 1',
      base: { point: 633, low: 460, high: 920 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Meat departments are ~12% of US grocery sales ($112b in 2025, Power of Meat 2026); fresh pork was $8.4b, and pork '
        + 'runs 9–18% of meat dollars before bacon, ham, sausage and deli. 2.75% of store sales, band 2–4%, prepared foods '
        + 'included.',
    },
    {
      key: 'porkOnline', wholeLine: true, label: 'Pork sold online and the marketplace take on pork products', rule: 'P1-PRK, §49, Δ53', tier: 'Tier 1',
      base: { point: 450, low: 250, high: 800 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Same-day perishables reached 1,000+ US cities in 2025 and their monthly customers grew 50%+ in H1 2026; '
        + 'center-aisle grocery (jerky, canned and cured pork, pork rinds) is part of a >$100b gross grocery business '
        + '(Jassy, 2025).',
    },
    {
      key: 'gelatin', label: 'Gelatin of unstated source (gummies, marshmallows, capsules)', rule: '§48 mushbooh row (Δ60)', tier: 'Tier 2',
      base: { point: 2_000, low: 1_200, high: 3_000 },
      rate: { A: 0, B: 0, C: 0.025, S: 0.05 },
      status: 'estimated — wide band',
      basis: 'Products where gelatin is an ingredient, not the character, and its source (porcine or bovine) is not stated: '
        + '§48 sets 0 / 0 / 2.5 / 5% until sourced. Products labelled porcine belong in the pork lines at 100%.',
    },
    {
      key: 'meat', label: 'Meat not slaughtered Islamically (beef, poultry, lamb)', rule: 'D13 — Sc C and Strictest only', tier: 'Tier 1 at Sc C+',
      base: { point: 2_656, low: 1_896, high: 3_631 },
      rate: { A: 0, B: 0, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Whole Foods meat, poultry and prepared foods with meat (8.5% of store sales, band 6.5–11%) plus online fresh '
        + 'meat and meat products ($0.4–1.1b). Whole Foods carries no zabīḥah range.',
    },
    {
      key: 'glp1', label: 'GLP-1 and ED medicines (Amazon Pharmacy, One Medical)', rule: 'U1 (lock)', tier: 'Tier 2',
      base: { point: 700, low: 350, high: 1_200 },
      rate: { A: 0, B: 0, C: 0.30, S: 1 },
      status: 'estimated — wide band',
      basis: 'Amazon Pharmacy: ~$2b of revenue estimated for 2026 (Evercore). It stocks the Wegovy and Foundayo pills, '
        + 'delivers LillyDirect orders and dispenses GLP-1s to Medicare patients at $50 a month; One Medical runs a GLP-1 '
        + 'programme and pay-per-visit ED care. GLP-1 and ED at 25–45% of pharmacy dollars.',
    },
    {
      key: 'video', wholeLine: true, label: 'Prime Video inside Prime, ad-free upgrades and video-only plans', rule: 'F12, Δ28, Δ52 — general-entertainment SVOD archetype', tier: 'Tier 2',
      base: { point: 9_000, low: 5_000, high: 12_700 },
      rate: { A: 0.30, B: 0.35, C: 0.40, S: 0.50 },
      status: 'estimated',
      basis: 'Subscription services $52.9b; Prime fees ~$20–26b. Video\'s slice of Prime, triangulated (Δ52): by value 41% '
        + '(Prime Video alone $108 a year against free shipping worth ~$95 at $6.99 on half of ~28 orders, music ~$36, other '
        + '~$20); by cost 20% ($18.9b of video against $102.7b of shipping, two thirds of it Prime\'s, and $3.5b of music); by '
        + 'survey 33% (video cited by 47–61% of members against shipping\'s 73–84%). Median 33%, band 20–41%, plus ~$1–2b of '
        + 'ad-free upgrades and video-only plans. Mature originals set the archetype; live sport is not carved out.',
    },
    {
      key: 'channels', wholeLine: true, label: 'Prime Video rentals, purchases and Channels', rule: 'F12 — studio content sales archetype', tier: 'Tier 2',
      base: { point: 3_000, low: 2_000, high: 4_500 },
      rate: { A: 0.18, B: 0.22, C: 0.28, S: 0.38 },
      status: 'estimated — wide band',
      basis: 'Rentals and purchases are digital media in online stores; third-party Channels subscriptions sit in '
        + 'subscription services. No figure is published. Blended slate.',
    },
    {
      key: 'licensing', wholeLine: true, label: 'MGM and other licensing and distribution of video content', rule: 'F12 — studio content sales archetype', tier: 'Tier 2',
      base: { point: 1_500, low: 800, high: 2_500 },
      rate: { A: 0.18, B: 0.22, C: 0.28, S: 0.38 },
      status: 'estimated — wide band',
      basis: 'Named in the 10-K as part of Other revenue: Amazon MGM Studios\' sales of films and series to other broadcasters '
        + 'and platforms.',
    },
    {
      key: 'music', wholeLine: true, label: 'Amazon Music (Unlimited and the Prime share)', rule: 'F12, Δ28 — music archetype (placeholder, §39(vi))', tier: 'Tier 2',
      base: { point: 4_500, low: 3_500, high: 6_000 },
      rate: { A: 0.20, B: 0.25, C: 0.30, S: 0.40 },
      status: 'estimated',
      basis: 'Music Unlimited subscriptions plus the music slice of Prime fees. Music-as-product is an open election, so the '
        + 'archetype is a placeholder (Apple precedent).',
    },
    {
      key: 'twitch', label: 'Twitch subscriptions and Bits', rule: 'F12 by analogy — studio blended-slate rates (estimated)', tier: 'Tier 2',
      base: { point: 1_200, low: 900, high: 1_500 },
      rate: { A: 0.18, B: 0.22, C: 0.28, S: 0.38 },
      status: 'estimated — wide band',
      basis: 'Twitch revenue ~$1.8–2.2b, about three fifths subscriptions and Bits (its ads are in the Δ31 lines). M-rated '
        + 'games and mature IRL streams lead the viewing; no measured Δ35 rate exists.',
    },
    {
      key: 'retailAds', label: 'Sponsored ads on Amazon\'s own stores (retail media)', rule: 'Δ51 — retail media by catalogue share', tier: 'Tier 1 by advertised product',
      base: { point: 59_300, low: 54_800, high: 64_700 },
      rate: { A: { point: 0.003, high: 0.007 }, B: { point: 0.003, high: 0.007 }, C: { point: 0.003, high: 0.007 }, S: { point: 0.003, high: 0.007 } },
      status: 'estimated',
      basis: 'Advertising services $76.1b in the window; sponsored products, brands and display on Amazon\'s pages are ~72–85% '
        + 'of it. The advertised goods are what the store sells, so the impure share is the store\'s own mix — alcohol and '
        + 'pork, 0.3% (to 0.7%) — not a TV benchmark (Δ51). Finance and gambling are not sold in the store.',
    },
    {
      key: 'tvAds', wholeLine: true, label: 'Video ads (Prime Video, Twitch, Fire TV, IMDb)', rule: 'Δ31 — advertising pass-through', tier: 'Tier 1 by advertised product',
      base: { point: 5_500, low: 3_500, high: 8_500 },
      rate: { A: { point: 0.075, high: 0.10 }, B: { point: 0.175, high: 0.22 }, C: { point: 0.175, high: 0.22 }, S: { point: 0.175, high: 0.22 } },
      status: 'estimated — wide band',
      basis: 'Prime Video ads ran $0.8b (Kagan) to $2.1b (MoffettNathanson) in 2025 and grew; Twitch, Fire TV and IMDb add to '
        + 'them. Δ31\'s TV benchmarks: alcohol 4–7% and sportsbooks 1–3% at Sc A (beer brands and sportsbooks sponsor TNF '
        + 'and the NBA; Twitch began gambling ads in the US in February 2026); conventional finance and insurance 8–12% '
        + 'added at Sc B+.',
    },
    {
      key: 'displayAds', label: 'Display and off-Amazon ads (DSP, partner sites)', rule: 'Δ31 — advertising pass-through', tier: 'Tier 1 by advertised product',
      base: { point: 11_200, low: 7_900, high: 12_800 },
      rate: { A: { point: 0.06, high: 0.09 }, B: { point: 0.16, high: 0.21 }, C: { point: 0.16, high: 0.21 }, S: { point: 0.16, high: 0.21 } },
      status: 'estimated — wide band',
      basis: 'The remainder of advertising after sponsored listings and video. Non-endemic advertisers buy it as they buy any '
        + 'digital display: alcohol and gambling ~6% (to 9%) at Sc A; conventional finance and insurance ~10–12% more at Sc B+.',
    },
    {
      key: 'fanduel', wholeLine: true, label: 'Sportsbook integration on Prime Video (FanDuel, NBA and WNBA)', rule: 'Δ32 — media–gambling integration', tier: 'Tier 1',
      base: { point: 60, low: 25, high: 120 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'FanDuel became the official odds provider of NBA and WNBA on Prime Video on 30 September 2025: odds overlays, '
        + 'opt-in on-screen tracking of linked FanDuel bets, and a Prime analyst as FanDuel ambassador. The fee is not '
        + 'published; ESPN\'s sportsbook licence ran ~$150m a year (§44). DraftKings\' NHL integration in Canada starts with '
        + 'the 2026–27 season, after the window.',
    },
    {
      key: 'casino', wholeLine: true, label: 'Fire tablet and Fire TV Appstore take on social-casino apps', rule: '§52, P1-GMB', tier: 'Tier 1',
      base: { point: 70, low: 30, high: 150 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'The Amazon Appstore left Android phones in August 2025 but stays on Fire tablets and Fire TV, where casino titles '
        + 'rank among the top grossing; Amazon keeps up to 30%.',
    },
    {
      key: 'twitchGambling', wholeLine: true, label: 'Gambling streams on Twitch (Slots & Casino, poker, sports betting)', rule: 'P1-GMB (Δ32 by analogy)', tier: 'Tier 1',
      base: { point: 15, low: 5, high: 40 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Since October 2022 Twitch allows slots, roulette and dice sites licensed in the US or comparable jurisdictions, '
        + 'plus poker and sports betting; the category logged 353,000 broadcast hours in H1 2025. Subscriptions and Bits on '
        + 'those streams.',
    },
    {
      key: 'pay', label: 'Amazon Pay merchant fees, by what is bought', rule: '§52 (mirrors Δ31)', tier: 'Tier 1 on the P1 share',
      base: { point: 700, low: 300, high: 1_200 },
      rate: { A: { point: 0.02, high: 0.04 }, B: { point: 0.03, high: 0.05 }, C: { point: 0.03, high: 0.05 }, S: { point: 0.03, high: 0.05 } },
      status: 'estimated — wide band',
      basis: 'Amazon Pay takes payments on other merchants\' sites and, in India, bill payments that include loan instalments '
        + 'and insurance premiums. Attributed by what is bought (alcohol, licensed betting where allowed), with '
        + 'conventional-finance payments added at Sc B+.',
    },
    {
      key: 'wellness', label: 'Sexual-wellness products (own sales and marketplace take)', rule: 'Tier 3 — contextual', tier: 'Tier 3',
      base: { point: 500, low: 300, high: 800 },
      rate: { A: 0, B: 0, C: { point: 0.05, high: 0.15 }, S: { point: 0.25, high: 0.40 } },
      status: 'estimated — wide band',
      basis: 'Not an enumerated activity (P1-ADT is pornography and adult venues); a contextual flag at the strict lenses only.',
    },
    {
      key: 'anthropicLT', ownRule: true, label: 'Anthropic look-through: Amazon\'s share of its interest income', rule: 'U4, Δ57', tier: 'Tier 1',
      base: { point: 171, low: 143, high: 228 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'Anthropic\'s S-1 (26 October 2026): interest income $1,427m on revenue of $19,708m in the twelve months to June '
        + '2026 — 7.2%, so Anthropic would fail Gate 3 on its own. Amazon\'s holding is capped at 12% of the capitalisation '
        + '(band 10–16%); there are no dividends, so the share of the impure income flows up (Δ57).',
    },
    {
      key: 'openaiLT', ownRule: true, label: 'OpenAI look-through (private; estimated)', rule: 'U4, Δ57', tier: 'Tier 1',
      base: { point: 60, low: 20, high: 150 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Amazon bought $28.7b of OpenAI Series C preferred in H1 2026 and $21.3b more after June. OpenAI files nothing '
        + 'public: tens of billions of cash at ~4%, a mid-single-digit stake, pro rata for the months held.',
    },
    {
      key: 'qard', interest: true, addsToLayer1: true, ownRule: true, label: 'Anthropic note conversion gains (a lender\'s benefit)', rule: 'Δ49', tier: 'Tier 1 at Sc B+',
      base: { point: 6_800, low: 6_800, high: 6_800 },
      rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'disclosed',
      basis: 'The notes bear no interest but convert at a fixed price ($2.09 or $5.05 a share) or the IPO price if lower: a '
        + 'benefit written into a loan. The conversion gains recognised in the window — reclassification adjustments for '
        + 'gains on available-for-sale debt securities, $5.6b in 2025 + $4.5b in H1 2026 − $3.3b in H1 2025 — are Layer 1 '
        + 'at Sc B+ (Δ49). Sc A reads the notes as a deferred share subscription. The $92.0b still unrealised in AOCI is '
        + 'documented (U3).',
    },
    {
      key: 'awsP1Named', ownRule: true, label: 'AWS capacity rented to a named sportsbook (FanDuel)', rule: 'Δ56 — named customer, D18 row 1', tier: 'Tier 1',
      base: { point: 150, low: 75, high: 300 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'FanDuel made AWS its strategic cloud provider in 2023 and runs its betting platform on it (AWS press release). '
        + 'The spend is not published.',
    },
    {
      key: 'awsFinNamed', ownRule: true, label: 'AWS capacity rented to named banks and insurers (Capital One and others in AWS case studies)', rule: 'Δ56 — named customers, D18 row 2', tier: 'Tier 1 at Sc B+',
      base: { point: 1_000, low: 500, high: 2_000 },
      rate: { A: 0, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Capital One closed its data centres to run on AWS; other banks and insurers appear in AWS\'s own case studies. '
        + 'Their spend is not published. Sc A 0% (Abū Ḥanīfa, as D18 and Δ31).',
    },
    {
      key: 'awsP1Bench', ownRule: true, label: 'AWS capacity rented to other sportsbooks, casinos and alcohol, tobacco and adult producers (benchmark)', rule: 'Δ56 — benchmark sizing, Sc C and Strictest', tier: 'Tier 1 at Sc C+',
      base: { point: 650, low: 375, high: 1_200 },
      rate: { A: 0, B: 0, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Businesses whose activity is itself prohibited, 0.3–1.0% of AWS revenue ($148.4b), less the named customer.',
    },
    {
      key: 'awsFinBench', ownRule: true, label: 'AWS capacity rented to other conventional banks, insurers and lenders (benchmark)', rule: 'Δ56 — benchmark sizing, Sc C and Strictest', tier: 'Tier 1 at Sc C+',
      base: { point: 12_000, low: 8_500, high: 18_000 },
      rate: { A: 0, B: 0, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'AWS does not disclose revenue by industry. Banking and finance are ~20% of enterprise cloud spending; the '
        + 'lending and underwriting part, 6–13% of AWS revenue, less the named customers.',
    },
    {
      key: 'gacha', label: 'Loot boxes and premium currency in Amazon Games titles', rule: '§52 — open election', tier: 'Election',
      base: { point: 250, low: 120, high: 500 },
      rate: { A: 0, B: 0, C: 0, S: 0 },
      election: [0, 0.5, 1],
      status: 'estimated — wide band',
      basis: 'Amazon Games publishes Lost Ark and Throne and Liberty in the West and runs New World: randomised packs and '
        + 'premium currency without cash-out. Sc A/B 0%; Sc C/Strictest shown at 0 / 50 / 100% and kept out of the total '
        + 'until the Council elects.',
    },
  ],
  sensitivities: [
    {
      label: 'Δ56 as first adopted: AWS benchmark sizing at Scenario B as well',
      note: 'Before 31 October 2026, Scenario B counted the benchmark-sized AWS customers too, and failed at 5.1% on an '
        + 'estimate no filing supports. The narrowed rule counts only named customers at Scenario A and B.',
      lines: [
        {
          key: 'awsP1Bench', ownRule: true, label: 'AWS capacity rented to other P1 producers (benchmark)', rule: 'Δ56 as first adopted', tier: 'Tier 1',
          base: { point: 650, low: 375, high: 1_200 }, rate: { A: 1, B: 1, C: 1, S: 1 },
          status: 'estimated — wide band', basis: 'As the base line.',
        },
        {
          key: 'awsFinBench', ownRule: true, label: 'AWS capacity rented to other banks, insurers and lenders (benchmark)', rule: 'Δ56 as first adopted', tier: 'Tier 1 at Sc B+',
          base: { point: 12_000, low: 8_500, high: 18_000 }, rate: { A: 0, B: 1, C: 1, S: 1 },
          status: 'estimated — wide band', basis: 'As the base line.',
        },
      ],
    },
    {
      label: 'Music as categorical lahw under Scenario C and Strictest',
      note: 'Reading (a) of the open music election: Amazon Music at 100% at Sc C and Strictest.',
      lines: [{
        key: 'music', label: 'Amazon Music (Unlimited and the Prime share)', rule: 'F12 reading (a) under Scenario C and Strictest', tier: 'Tier 1 at Sc C+',
        base: { point: 4_500, low: 3_500, high: 6_000 }, rate: { A: 0.20, B: 0.25, C: 1, S: 1 },
        status: 'estimated', basis: 'As the base line.',
      }],
    },
    {
      label: 'Books, e-books and audiobooks with explicit content (open election, §39(vi))',
      note: 'Kindle Unlimited, Kindle Direct Publishing and Audible carry a large romance and erotica catalogue; this reading '
        + 'counts explicit titles as adult content at Sc C and Strictest. Print, e-book and audiobook sales ~$15–20b; '
        + 'explicit share 6–12%.',
      lines: [{
        key: 'books', label: 'Explicit books, e-books and audiobooks', rule: '§39(vi) reading', tier: 'Tier 1 at Sc C+',
        base: { point: 1_500, low: 900, high: 2_500 }, rate: { A: 0, B: 0, C: 1, S: 1 },
        status: 'estimated — wide band', basis: 'No published split.',
      }],
    },
    {
      label: 'DVDs, Blu-rays and mature-rated games sold in the stores, at the studio archetype',
      note: 'Physical and digital media goods carry the same content as Prime Video; §52 is silent on a retailer\'s media sales, '
        + 'so they are left out of the base.',
      lines: [{
        key: 'media', label: 'Media goods sold in the online stores', rule: 'F12 by analogy', tier: 'Tier 2',
        base: { point: 3_000, low: 2_000, high: 5_000 }, rate: { A: 0.18, B: 0.22, C: 0.28, S: 0.38 },
        status: 'estimated — wide band', basis: 'Books excluded (see the books reading).',
      }],
    },
  ],
  standards: [
    { name: 'MSCI Islamic M-Series', tests: 'Debt, cash + securities, receivables + cash < 33.33% of average market cap', result: 'pass', deciding: 'Debt 7.0%, cash 5.6%, receivables + cash 7.8% of the 36-month average' },
    { name: 'Securities Commission Malaysia', tests: 'Debt and conventional cash < 33% of total assets; 5% / 20% activity benchmarks', result: 'pass', deciding: 'Debt 14.2%, cash 11.3% of total assets; no single activity near 5%' },
    { name: 'OJK / DSN-MUI (Indonesia)', tests: 'Interest debt ≤ 45% of total assets; non-halal income ≤ 10%', result: 'pass', deciding: 'Debt 14.2% of total assets; income 5.1%' },
    { name: 'SECP Pakistan (KMI)', tests: 'Debt < 37% and non-compliant investments < 33% of total assets; illiquid assets ≥ 25%', result: 'pass', deciding: 'Interest-bearing investments 11.3% of total assets; property alone 40.7%' },
  ],
  gflags: [
    'Free guarantees with risk retained (Δ48): the A-to-z Guarantee and Amazon\'s indemnity of customers for product-liability claims on third-party sales.',
    'Self-insurance of $10.4b (31 December 2025), mostly automobile liability including third-party delivery partners: insurance of Amazon\'s own operations, Tier 0 (§31).',
    'Anthropic and OpenAI are variable interests Amazon does not consolidate; $15.0b of the Anthropic note facility is undrawn, and the notes convert into Class N shares at Anthropic\'s IPO.',
    'Pending acquisition of Globalstar (~$10.9b including its debt; signed 13 April 2026, expected to close in 2027).',
    'Single class of common stock — no dual-class control flag.',
  ],
  monitoring: [
    'Scenario B at 3.49% against the 5% cap; no single estimated line at either edge of its band would carry it over (Δ61). Counting AWS customers on benchmarks at Scenario B, as Δ56 first did, would put it at 5.1%.',
    'Q3 2026 results (released 30 October 2026, after this screen): the twelve months, Anthropic marks and debt need refreshing.',
    'The Δ49 line shrinks as the notes convert: Anthropic\'s IPO turns the remaining $6.2b into shares, after which only rollover-note conversions add to it.',
    'Strictest debt with leases is 23.0% of total assets as reported and 27.3% without the Anthropic mark-ups (Δ50); it was 25.7% as reported at 31 March 2026, before the mark-ups. $25.0b of notes issued in July 2026 add more.',
    'Anthropic\'s IPO, which converts the notes into shares, and further OpenAI funding.',
    'Synchrony and Chase card terms; the Affirm warrant tranches vesting from February 2026 at $63.06.',
    'DraftKings\' sportsbook and online-casino integration on NHL on Prime in Canada (2026–27); any FanDuel renewal.',
    'Globalstar\'s close (2027): its debt joins Amazon\'s.',
  ],
  openQuestions: [
    'Δ49 and Δ56 were adopted on 30 October 2026 and Δ56 narrowed on 31 October (owner decisions): named customers at Scenarios A and B, industry benchmarks at C and Strictest only. Every other cloud, data-centre and telecom issuer is re-screened when next opened.',
    'Δ56 sizing: AWS does not disclose revenue by industry or name its customers\' spend; the named-customer lines are estimates too.',
    'Δ50: Level-3 mark-ups taken out of total assets at Sc C and Strictest — applied as interim; ratification asked.',
    'Δ52 (bundle allocation by standalone price) and Δ51 (retail media by catalogue share) are first applications.',
    'Δ57: Anthropic\'s S-1 shows interest at 7.2% of its revenue; is flowing up the pro-rata impure income enough for a stake that fails its own Gate 3?',
    'Music as the product, explicit books and audiobooks (§39(vi)) and loot boxes without cash-out (§52) remain open elections.',
    'Both Shariah index funds dropped or exclude Amazon (SPUS held it in 2025); neither provider publishes the reason, and the record cannot see it.',
  ],
  reconciliation: [
    { field: 'Interest income', reference: '0.61% of revenue (HalalWallet, FY2025)', filing: '$4,660m in the window, 0.60%', effect: 'Agrees.' },
    { field: 'Anthropic notes', reference: 'Read by screeners as interest-bearing debt securities', filing: '$97.9b at fair value; non-interest-bearing rollover notes (Anthropic S-1)', effect: 'Left out of Cash + IBS (§6); their conversion gains are Layer 1 at Sc B+ (Δ49).' },
    { field: 'Debt', reference: 'Long-term debt $128.9b', filing: '$141.9b: notes incl. current portion $132.2b + financing obligations $9.3b + facilities $0.3b (Δ59)', effect: 'Track-(a) debt +10%; every ratio still passes at A to C.' },
    { field: 'Total assets', reference: '$1,095.7b', filing: '$923.3b without $172.4b of Anthropic mark-ups (Δ50)', effect: 'Strictest debt with leases 27.3% of total assets — a fail.' },
    { field: 'Receivables', reference: 'Accounts receivable, net and other $88.1b', filing: 'Customer $49.2b; vendor $21.7b, other $9.8b, prepaid $7.4b', effect: 'Only customer receivables are AR (§6).' },
    { field: 'Musaffa', reference: 'Doubtful (July 2026)', filing: 'Sc A passes; Sc B, C and Strictest fail on this record', effect: 'Not reconciled: Musaffa does not publish its line attribution (§39(iv)).' },
  ],
  sources: [
    { label: 'Amazon FY2025 Form 10-K', href: `${SEC}/000101872426000004/amzn-20251231.htm` },
    { label: 'Amazon Q2 2026 Form 10-Q', href: `${SEC}/000101872426000026/amzn-20260630.htm` },
    { label: 'Amazon Q2 2026 results (8-K, Exhibit 99.1)', href: `${SEC}/000101872426000024/amzn-20260630xex991.htm` },
    { label: 'Amazon 13F-HR, 30 June 2026 (public equity holdings)', href: `${SEC}/000110465926092052/infotable.xml` },
    { label: 'Amazon–Globalstar merger (8-K, 14 April 2026)', href: `${SEC}/000110465926042880/tm2611746d1_8k.htm` },
    { label: 'Anthropic, PBC — Form S-1 (26 October 2026)', href: 'https://www.sec.gov/Archives/edgar/data/0002130357/000162828026067168/anthropicpbc-sx1.htm' },
    { label: 'Affirm FY2026 Form 10-K (Amazon warrants)', href: 'https://www.sec.gov/Archives/edgar/data/0001820953/000162828026059279/afrm-20260630.htm' },
    { label: 'Synchrony FY2025 Form 10-K (retailer share arrangements)', href: 'https://www.sec.gov/Archives/edgar/data/1601712/000160171226000006/syf-20251231.htm' },
    { label: 'Synchrony Pay Later on Amazon (American Banker)', href: 'https://www.americanbanker.com/payments/news/synchrony-beats-earnings-estimates-enters-bnpl-with-amazon' },
    { label: 'Amazon completes Axio acquisition (Sept 2025)', href: 'https://www.crowdfundinsider.com/2025/09/250024-amazon-completes-acquisition-of-digital-lending-startup-axio/' },
    { label: 'Amazon Pay vehicle insurance (corporate agent)', href: 'https://finance.yahoo.com/sectors/healthcare/articles/amazon-pay-expands-vehicle-insurance-084914642.html' },
    { label: 'FanDuel — official odds provider of NBA and WNBA on Prime Video', href: 'https://www.fanduel.com/about/news/fanduel-and-amazon-announce-exclusive-odds-provider-partnership-for-nba-and-wnba-on-prime-video' },
    { label: 'DraftKings — NHL on Prime Wednesday Night Hockey (2026–27)', href: 'https://s21.q4cdn.com/869500724/files/doc_news/DraftKings-Named-Exclusive-Sportsbook-and-Online-Casino-Integration-Sponsor-of-NHL-on-Primes-Wednesday-Night-Hockey-for-the-2026-27-S-68B3T.pdf' },
    { label: 'FanDuel selects AWS as strategic cloud provider (2023)', href: 'https://press.aboutamazon.com/2023/9/fanduel-selects-aws-as-its-strategic-cloud-provider' },
    { label: 'Amazon seller policy — alcohol (pre-approved partners only)', href: 'https://sellercentral.amazon.com/help/hub/reference/external/G200164340' },
    { label: 'Power of Meat 2026 — US retail meat sales', href: 'https://www.wlj.net/beef-drives-record-meat-sales-growth' },
    { label: 'NIQ 2024 — channel shares of wine and spirits', href: 'https://www.convenience.org/Media/Daily/2025/February/10/1-NIQ-C-Stores-Gain-Share-of-Wine-Spirits_Research' },
    { label: 'Prime Video ad revenue forecasts (Kagan)', href: 'https://www.tvtechnology.com/news/forecast-amazon-prime-video-advertising-to-hit-usd806-million-in-2025' },
    { label: 'Twitch gambling policy (October 2022)', href: 'https://www.fortune.com/2022/09/21/twitch-bans-gambling-streams-slots-announcement-pokimane-amazon' },
    { label: 'Amazon grocery >$100b gross (Q1 2025 call)', href: 'https://www.andnowuknow.com/node/98006' },
    { label: 'Amazon Pharmacy and GLP-1s', href: 'https://247wallst.com/investing/2026/04/10/who-benefits-from-amazon-pharmacy-stocking-eli-lillys-new-weight-loss-pill/' },
    { label: 'Amazon Housing Equity Fund (below-market loans)', href: 'https://www.aboutamazon.com/news/community/amazon-launches-2-billion-housing-equity-fund-to-preserve-and-create-over-20-000-affordable-homes' },
    { label: 'Musaffa — AMZN', href: 'https://musaffa.com/stock/AMZN/' },
    { label: 'SPUS holdings (S&P 500 Shariah)', href: 'https://stockanalysis.com/etf/spus/holdings/' },
    { label: 'HLAL holdings (FTSE USA Shariah)', href: 'https://stockanalysis.com/etf/hlal/holdings/' },
  ],
};
