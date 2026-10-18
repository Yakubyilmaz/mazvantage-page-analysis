/* ==========================================================================
   Maz Vantage — researched screens: three companies where interest hides

   Written 2026-10-18 from a sweep for interest that sits inside revenue or
   on customers' money rather than in a plain "interest income" line:

   - ADP earns the yield on the payroll money clients hand over before
     payday, and books it as revenue (§54, client float).
   - Airbnb earns interest on guests' payments it holds between booking and
     check-in, on top of its own cash.
   - Deere lends to the farmers and dealers who buy its equipment through
     John Deere Financial, a captive finance arm (P1-FIN, U2).

   Same shape and rules as Apple's record in `shariah-issuers.ts`; the engine
   in `shariah-v5.ts` does the arithmetic. Figures are from each issuer's
   filings (10-K, 10-Q, earnings release), named in `filings`; where a figure
   came from the data feed instead, the reconciliation table says so. US$
   millions unless a field says otherwise.
   ========================================================================== */

import type { IssuerRecord } from './shariah-issuers';
import type { BalanceSheet } from './shariah-v5';

const EDGAR = 'https://www.sec.gov/Archives/edgar/data';

/* ---------- ADP (Automatic Data Processing) ------------------------------------ */

const ADP_BS: BalanceSheet = {
  date: '2026-06-30',
  totalAssets: 63_193.3,
  totalLiabilities: 57_162.1,
  equity: 6_031.2,
  // ADP's own cash ($4,230.1m) plus funds held for clients ($43,957.8m): restricted, and invested
  // in cash equivalents and available-for-sale debt securities, so §6 counts them.
  cashIbs: 4_230.1 + 43_957.8,
  cash: 4_230.1,
  ar: 3_521.1,
  // Δ43: matched by $44,415.5m of client fund obligations; out of the cash tests at Scenario A.
  clientFunds: 43_957.8,
  // Δ44, line by line the higher of the year-end and the year's average: senior notes $4,964.1m
  // (year-end), commercial paper $4,200m (average; nil at 30 June), reverse repos $3,600m
  // (average; $139.3m at 30 June).
  borrowings: 4_964.1 + 4_200 + 3_600,
  financeLeases: 0,
  // Non-current operating lease liabilities; the current portion sits inside accrued expenses.
  operatingLeases: 306.7,
  goodwill: 3_284.4,
  intangibles: 1_653.3,
};

export const ADP: IssuerRecord = {
  symbol: 'ADP',
  name: 'Automatic Data Processing, Inc.',
  version: 'v5.0',
  screened: '2026-10-18',
  period: { label: 'Fiscal 2026 (twelve months to 30 June 2026)', start: '2025-07-01', end: '2026-06-30' },
  summary: 'ADP\'s business — payroll, HR software and outsourced employment — clears the activity screen, but it earns '
    + 'interest on the payroll money clients hand over before payday: $1,354.8m in fiscal 2026 on an average $40.4b of '
    + 'client funds, booked as revenue, plus $371.0m on its own cash. Together that is 7.9% of revenue, over the 5% cap '
    + 'at every scenario. Under §6 the $44.0b of client funds also counts as cash and interest-bearing securities — '
    + '49.6% of the 12-month average market cap, against a 30% limit (Δ43 leaves them out at Scenario A only). Its PEO business also underwrites workers\' '
    + 'compensation through its own insurer, ADP Indemnity.',
  ratioNote: 'Cash + IBS is ADP\'s own cash ($4,230.1m) plus $43,957.8m of funds held for clients, invested in cash '
    + 'equivalents and available-for-sale securities ($37,701.3m of the latter); Scenario A leaves them out (Δ43). Debt '
    + 'follows Δ44, the higher of year-end and average balance: $4,964.1m of senior notes, $4.2b of commercial paper (nil at '
    + '30 June) and $3.6b of reverse repos ($139.3m at 30 June), both funding client obligations — $12.8b in all. Operating leases: the non-current $306.7m only. Client '
    + 'balances swing with payroll dates (total assets were $84.6b at 31 December 2025), so the trend shows the two fiscal '
    + 'year-ends from the 10-K rather than the quarter-ends.',
  methodsNote: 'Each index row applies Maz Vantage\'s §6 definition, so the $44.0b of client funds counts as cash and every '
    + 'methodology fails ADP on cash. Index providers\' own data generally carries ADP\'s corporate cash only; on that '
    + 'reading the cash ratios are about 4% and the market-value methodologies pass the balance sheet. The income test '
    + 'fails either way: interest is 7.9% of revenue.',
  filings: [
    { form: '10-K', period: 'FY2026 (to 30 Jun 2026)', accession: '0000008670-26-000030', href: `${EDGAR}/8670/000000867026000030/adp-20260630.htm` },
  ],
  income: {
    revenue: 21_947.4,
    netIncome: 4_413.5,
    pretax: 5_730.3,
    tax: 1_316.8,
    epsDiluted: 10.94,
    dilutedShares: 403.3,
    // Declared in the fiscal year: $1.54 (August 2025), then $1.70 three times.
    dps: 6.64,
  },
  bs: ADP_BS,
  history: [
    {
      ...ADP_BS, date: '2025-06-30', totalAssets: 53_369.3, totalLiabilities: 47_181.3, equity: 6_188.0,
      cashIbs: 3_347.8 + 30_985.7, cash: 3_347.8, ar: 3_579.1, clientFunds: 30_985.7,
      // Δ44: notes and commercial paper at the year-end (above their averages), reverse repos at the $2.9b average.
      borrowings: 3_974.7 + 4_769.5 + 2_900,
      operatingLeases: 321.2, goodwill: 3_273.5, intangibles: 1_603.0,
    },
    ADP_BS,
  ],
  mcap: { m12: 97_123, m24: 110_395, m36: 107_364, spot: 115_395, spotDate: '2026-10-16' },
  l1: {
    point: 1_725.8, low: 1_725.8, high: 1_725.8,
    status: 'disclosed',
    basis: 'Interest on funds held for clients, $1,354.8m — a revenue line, on an average $40,410.7m of client funds at '
      + '3.4% — plus interest income on corporate funds, $371.0m (other (income)/expense, net). Both from the FY2026 10-K.',
  },
  l2: {
    point: 459.3, low: 459.3, high: 459.3,
    basis: 'Interest expense as reported: the senior notes, plus commercial paper (average $4.2b at 4.0%) and reverse '
      + 'repurchase agreements (average $3.6b at 4.1%) used to fund client obligations before client investments mature.',
  },
  layers: [
    { key: 'L1', label: 'Interest income (gross)', value: '$1,725.8m · 7.86%', note: 'Disclosed: $1,354.8m on client funds (inside revenue) + $371.0m on corporate funds. Fails the 5% cap at every scenario.' },
    { key: 'L2', label: 'Interest expense', value: '$459.3m · 2.09%', note: 'Δ20: implied cost ~3.7% on ~$12.3b average borrowings (notes, commercial paper, repos) — consistent with the 4.0–4.1% short-term rates disclosed.' },
    { key: 'L3', label: 'Capitalised interest', value: 'not disclosed', note: 'Information only.' },
    { key: 'L4', label: 'Pension interest', value: 'not quantified here', note: 'ADP sponsors defined-benefit plans; information only.' },
    { key: 'L5', label: 'Lease interest', value: 'small', note: 'On ~$0.4b of operating leases. Information only.' },
    { key: 'L6', label: 'Derivative carry', value: 'none identified', note: 'Information only.' },
    { key: 'L7', label: 'Financing income', value: 'none identified', note: 'The Wisely pay card earns fees, not interest, on what the filing says.' },
    { key: 'L8', label: 'Cash-vehicle yield', value: 'inside L1', note: 'Client funds: cash equivalents and $37,701.3m of available-for-sale securities at 30 Jun 2026.' },
  ],
  gate1: [
    { step: '1', test: 'Primary business', finding: 'Payroll, HR and benefits software and services: Employer Services $14,831.4m, PEO Services $7,128.1m.', result: 'Not P1 — pass' },
    { step: '2', test: 'Own P1 segment > 5% (U2)', finding: 'ADP Indemnity, Inc. insures workers\' compensation for PEO worksite employees (unpaid losses $774.3m; reinsured with Chubb). It sits inside the PEO segment and its premium base is not disclosed — estimated at 1.5–4% of revenue.', result: 'Below 5% — pass, G-flag' },
    { step: '3', test: 'Facilitation (Δ14)', finding: 'An insurance agency (Automatic Data Processing Insurance Agency, Inc.) arranges workers\' compensation and group health cover for 280,000+ small clients; commissions are not disclosed.', result: '< 50% — standard Gate 4' },
    { step: '4', test: 'Sector routing', finding: 'Payroll processing with client float → §54. Interest on client funds is Layer 1 at Scenario B (Position 1).', result: 'Proceed' },
    { step: '5', test: 'Special classes', finding: 'Not a health payer, takaful operator or holding company.', result: 'n/a' },
    { step: '6', test: 'Sub-industry (Δ5, Δ13)', finding: 'The software classification hides the float: interest on client funds is 6.2% of revenue on its own.', result: 'Re-routed to §54' },
    { step: '7', test: 'Client elections', finding: 'None.', result: 'n/a' },
  ],
  g1: 'pass',
  gate5: {
    screenable: true,
    finding: 'Screenable — audited 10-K. Interest on client funds is a revenue line and corporate interest is disclosed in a note, so Layer 1 needs no estimate; the insurance lines do.',
    gaps: [
      'Workers\' compensation charged to PEO clients (ADP Indemnity\'s premium base): not disclosed.',
      'Insurance agency commissions: not disclosed.',
      'Client funds at the quarter-ends: the reference data files them under different lines each quarter; only the fiscal year-ends are used.',
      'The current portion of operating lease liabilities: inside accrued expenses.',
    ],
  },
  lines: [
    {
      key: 'interest', label: 'Interest on client funds and corporate cash (Layer 1)', rule: 'Gate 3, D5; §54 Position 1', tier: 'Tier 1', interest: true,
      base: { point: 1_725.8, low: 1_725.8, high: 1_725.8 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'disclosed',
      basis: 'See Layer 1. §54 Position 2 (the agency carve-out) does not apply: ADP keeps the yield as its own revenue.',
    },
    {
      key: 'workcomp', wholeLine: true, label: 'Workers\' compensation insurance underwritten by ADP Indemnity', rule: '§31, P1-INS', tier: 'Tier 1',
      base: { point: 600, low: 330, high: 900 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'ADP Indemnity reimburses PEO worksite employees\' workers\' compensation claims up to $1m per occurrence and '
        + 'reinsures with Chubb (a $327.8m premium paid in July 2026 for the next policy year). What PEO clients are charged '
        + 'for this cover is inside PEO revenue and not disclosed; the band runs from the reinsurance premium to ~4% of revenue.',
    },
    {
      key: 'agency', wholeLine: true, label: 'Insurance agency commissions', rule: '§31 — insurance broking', tier: 'Tier 1',
      base: { point: 100, low: 50, high: 200 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Automatic Data Processing Insurance Agency, Inc. arranges workers\' compensation and group health insurance for '
        + 'more than 280,000 small and mid-sized clients; the 10-K does not say what it earns.',
    },
  ],
  sensitivities: [
    {
      label: 'PEO benefits pass-throughs counted as insurance revenue',
      note: 'ADP books $4,607.3m of zero-margin benefits pass-throughs (worksite employees\' health and other cover) as PEO '
        + 'revenue. Read here as reimbursement; if the Council reads it as insurance revenue, it enters Gate 4 whole.',
      lines: [{
        key: 'passthrough', label: 'PEO zero-margin benefits pass-throughs', rule: '§31 (if insurance revenue)', tier: 'Tier 1',
        base: { point: 4_607.3, low: 4_607.3, high: 4_607.3 }, rate: { A: 1, B: 1, C: 1, S: 1 },
        status: 'disclosed', basis: 'FY2026 10-K, revenue reconciliation.',
      }],
    },
  ],
  standards: [],
  gflags: [
    'Client funds of $44.0b (30 June 2026) are held for clients and invested in debt securities; ADP keeps the yield and reports it as revenue.',
    'ADP Indemnity, Inc. is ADP\'s own insurer for PEO workers\' compensation, reinsured with Chubb.',
    'Commercial paper (average $4.2b) and reverse repurchase agreements (average $3.6b) fund client obligations between collection and payment.',
  ],
  monitoring: [
    'Layer 1 would have to fall below $1,097m (5% of revenue) — 36% under fiscal 2026\'s $1,725.8m — to clear Gate 3.',
    'Interest on client funds moves with rates and balances: the average yield was 3.4% in fiscal 2026 against 3.2% the year before.',
    'Client funds: counted at Scenarios B to Strictest, left out at Scenario A (Δ43), where the cash ratio is 4.4% of the 12-month average market cap.',
  ],
  openQuestions: [
    '§54 Position 3: float yield above 5% of revenue — should Gate 1 be reconsidered at Scenario C and Strictest? Not applied; the verdict fails regardless.',
    'Zero-margin PEO benefits pass-throughs ($4,607.3m): reimbursement or insurance revenue? Shown as a sensitivity.',
  ],
  reconciliation: [
    { field: 'Interest income', reference: '$375.6m (corporate only)', filing: '$1,354.8m on client funds (a revenue line) + $371.0m on corporate funds', effect: 'Layer 1 is 4.6 times the reference figure; a screen reading the reference line passes ADP.' },
    { field: 'Funds held for clients', reference: 'Filed under other current or other non-current assets, by quarter', filing: '$43,957.8m at 30 Jun 2026', effect: 'Counted in Cash + IBS (§6).' },
    { field: 'Total debt', reference: '$5,270.8m including $306.7m of leases', filing: '$4,964.1m notes + $139.3m reverse repos at the year-end; commercial paper averaged $4.2b and reverse repos $3.6b', effect: 'Δ44: the averages are used — $12,764.1m, 13.1% of the 12-month market cap rather than 5.3%.' },
  ],
  sources: [
    { label: 'ADP FY2026 Form 10-K', href: `${EDGAR}/8670/000000867026000030/adp-20260630.htm` },
    { label: 'ADP FY2026 annual report', href: `${EDGAR}/8670/000130817926000411/adp015474-ars.pdf` },
  ],
};

/* ---------- Airbnb ------------------------------------------------------------------- */

const ABNB_BS: BalanceSheet = {
  date: '2026-06-30',
  totalAssets: 28_754,
  totalLiabilities: 20_955,
  equity: 7_799,
  // Cash $6,821m + short-term investments $5,248m + funds receivable and amounts held on behalf of
  // customers $12,224m (held in cash, money-market funds, CDs, government debt and commercial paper).
  cashIbs: 6_821 + 5_248 + 12_224,
  cash: 6_821,
  ar: 209,
  // Δ43: matched by $12,224m payable to customers; out of the cash tests at Scenario A.
  clientFunds: 12_224,
  // Senior notes issued March 2026: $2,500m principal, $2,476m net.
  borrowings: 2_476,
  financeLeases: 0,
  operatingLeases: 272,
  // "Goodwill and intangible assets, net" is one line; the split does not move any ratio.
  goodwill: 0,
  intangibles: 765,
};

export const ABNB: IssuerRecord = {
  symbol: 'ABNB',
  name: 'Airbnb, Inc.',
  version: 'v5.0',
  screened: '2026-10-18',
  period: { label: 'Twelve months to 30 June 2026 (Q3 2025 – Q2 2026)', start: '2025-07-01', end: '2026-06-30' },
  summary: 'Airbnb\'s business — a marketplace for stays and experiences — clears the activity screen, but it fails Gate 3 '
    + 'by a narrow margin: interest income was $680m in the twelve months to June 2026, 5.17% of revenue against a 5% cap. '
    + 'Airbnb earns it on its own cash and on guests\' payments it holds between booking and check-in ($12.2b at 30 June). '
    + 'Counting those funds as cash under §6 also puts Cash + IBS at 28.9% of the 12-month average market cap: on watch '
    + 'under Scenario B\'s 30% and over Strictest\'s 25%.',
  ratioNote: 'Cash + IBS is cash ($6,821m), short-term investments ($5,248m) and funds receivable and amounts held on '
    + 'behalf of customers ($12,224m, matched by $12,224m payable to customers). How much of the last is invested rather '
    + 'than due from payment processors is not disclosed; it is counted whole. Debt is $2.5b of senior notes issued in March '
    + '2026 (4.40% 2029, 4.65% 2031, 5.25% 2036). Operating leases ($272m) are the 31 December 2025 figure. Only the 30 June '
    + 'balance sheet is shown: the reference data files customer funds under different lines each quarter.',
  methodsNote: 'The index rows apply §6, so customer funds count as cash; on Airbnb\'s own cash and investments alone the '
    + 'ratio is 14.4% of the 12-month average market cap. Its debt is 3% of market value. What decides Airbnb is income, '
    + 'not the balance sheet: interest is 5.17% of revenue.',
  filings: [
    { form: '10-K', period: 'FY2025 (to 31 Dec 2025)', accession: '0001559720-26-000004', href: `${EDGAR}/1559720/000155972026000004/abnb-20251231.htm` },
    { form: '10-Q', period: 'Q2 2026 (to 30 Jun 2026)', accession: '0001559720-26-000027', href: `${EDGAR}/1559720/000155972026000027/abnb-20260630.htm` },
  ],
  // FY2025 + H1 2026 − H1 2025.
  income: {
    revenue: 12_241 + 6_286 - 5_368,
    netIncome: 2_511 + 976 - 796,
    pretax: 3_137 + 1_178 - 952,
    tax: 626 + 202 - 156,
    epsDiluted: 4.03 + 1.62 - 1.27,
    dilutedShares: 614,
    dps: 0,
  },
  bs: ABNB_BS,
  history: [ABNB_BS],
  mcap: { m12: 83_961, m24: 82_232, m36: 84_563, spot: 102_830, spotDate: '2026-10-16' },
  l1: {
    point: 680, low: 680, high: 680,
    status: 'disclosed',
    basis: 'Interest income, a separate line on the income statement: $705m in 2025 + $338m in H1 2026 − $363m in H1 2025. '
      + 'The 10-K: interest income "consists primarily of interest earned on our cash, cash equivalents" and investments, '
      + 'which hold both corporate funds and funds held on behalf of hosts and guests.',
  },
  l2: {
    point: 35, low: 25, high: 45,
    basis: 'Not broken out in the window: the 0% convertible notes matured in March 2026, and the new $2.5b of notes '
      + '(4.40–5.25%) have accrued for about three and a half months.',
  },
  layers: [
    { key: 'L1', label: 'Interest income (gross)', value: '$680m · 5.17%', note: 'Disclosed. Over the 5% cap at every scenario, by $22m.' },
    { key: 'L2', label: 'Interest expense', value: '~$35m · 0.27%', note: 'Estimated. Below the Δ20 trigger.' },
    { key: 'L3', label: 'Capitalised interest', value: 'none material', note: 'Information only.' },
    { key: 'L4', label: 'Pension interest', value: 'none', note: 'No defined-benefit plans of note.' },
    { key: 'L5', label: 'Lease interest', value: 'small', note: 'On ~$0.3b of operating leases.' },
    { key: 'L6', label: 'Derivative carry', value: 'FX hedging', note: 'Commercial hedging is Tier 0.' },
    { key: 'L7', label: 'Financing income', value: 'none identified', note: 'Pay-over-time options are run by third parties; no Airbnb lending is described.' },
    { key: 'L8', label: 'Cash-vehicle yield', value: 'inside L1', note: 'Money-market funds, certificates of deposit, US government debt and commercial paper.' },
  ],
  gate1: [
    { step: '1', test: 'Primary business', finding: 'An online marketplace for stays, experiences and services; revenue is service fees from guests and hosts.', result: 'Not P1 — pass' },
    { step: '2', test: 'Own P1 segment > 5% (U2)', finding: 'One reportable segment. Host Damage Protection reimburses hosts up to $3m and Airbnb "retains risk" with third-party cover per claim — a self-insured service with no premium.', result: 'Below 5% — pass, G-flag' },
    { step: '3', test: 'Facilitation (Δ14)', finding: 'Alcohol-centred experiences (tastings, bar tours) are a small share of a small Experiences business.', result: '< 50% — standard Gate 4' },
    { step: '4', test: 'Sector routing', finding: 'Platform (§52) holding customer funds in transit (§54).', result: 'Proceed' },
    { step: '5', test: 'Special classes', finding: 'Not a health payer, takaful operator or holding company.', result: 'n/a' },
    { step: '6', test: 'Sub-industry (Δ5, Δ13)', finding: 'The float: guests pay at booking and hosts are paid after check-in; Airbnb keeps the interest on the money in between.', result: 'Re-routed to §54' },
    { step: '7', test: 'Client elections', finding: 'None.', result: 'n/a' },
  ],
  g1: 'pass',
  gate5: {
    screenable: true,
    finding: 'Screenable — audited 10-K and quarterly 10-Qs. Interest income is a separate disclosed line; its split between corporate and customer funds is not.',
    gaps: [
      'Interest income by source (corporate cash and investments vs funds held for customers): not disclosed.',
      'How much of the $12.2b held on behalf of customers is invested rather than due from payment processors.',
      'Experiences revenue, and the alcohol-centred share of it.',
    ],
  },
  lines: [
    {
      key: 'interest', label: 'Interest income (Layer 1)', rule: 'Gate 3, D5; §54 Position 1', tier: 'Tier 1', interest: true,
      base: { point: 680, low: 680, high: 680 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'disclosed',
      basis: 'See Layer 1. Airbnb acts as payment agent but keeps the yield, so the agency carve-out (§54 Position 2) does not apply.',
    },
    {
      key: 'alcohol', label: 'Alcohol-centred experiences (tastings, bar and pub tours)', rule: 'P1-ALC facilitation, Δ14', tier: 'Tier 1',
      base: { point: 15, low: 5, high: 40 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated — wide band',
      basis: 'Experiences relaunched in May 2025 and are not reported separately; taken as under 1% of revenue, with '
        + 'alcohol-centred listings a tenth of that.',
    },
  ],
  sensitivities: [],
  standards: [],
  gflags: [
    'Customer funds of $12.2b (30 June 2026) are held between booking and check-in and invested with corporate cash.',
    'Host Damage Protection and host liability cover: Airbnb retains part of the risk itself.',
  ],
  monitoring: [
    'Interest income has to fall below $658m (5% of revenue) — $22m under the twelve-month figure — to clear Gate 3. It fell from $363m in H1 2025 to $338m in H1 2026.',
    'Cash + IBS sits 1.1 points under Scenario B\'s 30% limit, inside the watch zone: a fall in the market value or a rise in customer funds moves it.',
  ],
  openQuestions: [
    'Funds held on behalf of customers: counted at Scenarios B to Strictest and left out at Scenario A (Δ43); the share due from payment processors rather than invested is not disclosed.',
    '§54: Airbnb collects as its hosts\' payment agent; does an agent\'s float yield belong to the agent? Read as yes, because Airbnb reports it as its own income.',
  ],
  reconciliation: [
    { field: 'Revenue, 2025', reference: '$12,305m', filing: '$12,241m (10-K)', effect: 'The filing figure is used; the twelve months to June are $13,159m.' },
    { field: 'Interest income', reference: '$705m (2025)', filing: '$680m for the twelve months to 30 Jun 2026', effect: 'Twelve months to the latest quarter used.' },
    { field: 'Funds held on behalf of customers', reference: 'Filed under other receivables or other current assets, by quarter', filing: '$12,224m, matched by $12,224m payable to customers', effect: 'Counted in Cash + IBS (§6).' },
  ],
  sources: [
    { label: 'Airbnb 2025 Form 10-K', href: `${EDGAR}/1559720/000155972026000004/abnb-20251231.htm` },
    { label: 'Airbnb Q2 2026 Form 10-Q', href: `${EDGAR}/1559720/000155972026000027/abnb-20260630.htm` },
  ],
};

/* ---------- Deere & Company ------------------------------------------------------------- */

const DE_BS: BalanceSheet = {
  date: '2026-08-02',
  totalAssets: 107_607,
  totalLiabilities: 79_566,
  equity: 27_990,
  // Cash $8,928m + marketable securities $1,350m + financing receivables $42,860m + securitized
  // financing receivables $6,316m: interest-bearing customer loans count here, not in AR (§6).
  cashIbs: 8_928 + 1_350 + 42_860 + 6_316,
  cash: 8_928,
  ar: 7_723,
  // Short-term borrowings $17,115m + short-term securitization borrowings $6,439m + long-term $40,626m.
  borrowings: 17_115 + 6_439 + 40_626,
  financeLeases: 0,
  operatingLeases: 0,
  goodwill: 4_466,
  intangibles: 940,
};

export const DE: IssuerRecord = {
  symbol: 'DE',
  name: 'Deere & Company',
  version: 'v5.0',
  screened: '2026-10-18',
  period: { label: 'Twelve months to 2 August 2026 (Q4 FY2025 – Q3 FY2026)', start: '2025-07-28', end: '2026-08-02' },
  summary: 'Deere makes farm, construction and forestry equipment, which is permissible, but it also lends to the farmers '
    + 'and dealers who buy it. John Deere Financial — retail notes, revolving charge accounts, wholesale and lease '
    + 'financing — earned $5,821m of revenue in fiscal 2025, 12.7% of the total. The methodology names captive finance '
    + 'arms as conventional lending, and a lending segment above 5% of revenue fails every scenario outright (U2). The '
    + 'balance sheet would fail on its own: $64.2b of interest-bearing debt is 41.9% of the 12-month average market cap, '
    + 'and the $49.2b loan book counts as interest-bearing assets.',
  ratioNote: 'Cash + IBS is cash ($8,928m), marketable securities ($1,350m) and financing receivables ($42,860m, plus '
    + '$6,316m securitized) — interest-bearing customer loans, which §6 counts here rather than in receivables. Debt is '
    + 'short-term borrowings ($17,115m) and long-term borrowings ($40,626m) from the 10-Q, plus $6,439m of short-term '
    + 'securitization borrowings — the reference data\'s total debt ($64,180m) less those two lines. Operating lease liabilities are not in the condensed balance sheet and are left out; they would only '
    + 'raise the debt ratios.',
  methodsNote: 'Every methodology fails Deere on debt, which is 37–50% of market value whichever window is used, and '
    + 'every one excludes conventional finance whole. The verdict does not depend on the denominator.',
  filings: [
    { form: '10-K', period: 'FY2025 (to 2 Nov 2025)', accession: '0001104659-25-122321', href: `${EDGAR}/315189/000110465925122321/de-20251102x10k.htm` },
    { form: '8-K', period: 'Q4 FY2025 results (Exhibit 99.1)', accession: '0001104659-25-116130', href: `${EDGAR}/315189/000110465925116130/de-20251126xex99d1.htm` },
    { form: '10-Q', period: 'Q3 FY2026 (to 2 Aug 2026)', accession: '0001104659-26-102213', href: `${EDGAR}/315189/000110465926102213/de-20260802x10q.htm` },
  ],
  // FY2025 + nine months FY2026 − nine months FY2025.
  income: {
    revenue: 45_684 + 35_589 - 33_290,
    netIncome: 5_027 + 3_808 - 3_962,
    pretax: 6_257 + 5_011 - 4_832,
    tax: 1_259 + 1_243 - 905,
    epsDiluted: 18.50 + 14.06 - 14.57,
    dilutedShares: 270.9,
    dps: 6.48 + 4.86 - 4.86,
  },
  bs: DE_BS,
  history: [DE_BS],
  mcap: { m12: 153_015, m24: 140_391, m36: 128_957, spot: 173_174, spotDate: '2026-10-16' },
  l1: {
    point: 5_526, low: 3_900, high: 5_526,
    status: 'disclosed — composition estimated',
    basis: '"Finance and interest income" for the twelve months: $5,748m in fiscal 2025 + $4,011m in the nine months to '
      + 'August 2026 − $4,233m a year earlier. It is interest on retail notes, revolving accounts and wholesale financing '
      + '(Layer 7) and on cash and securities (Layer 1). If rentals on the $7.4b of equipment on operating leases sit inside '
      + 'it, the interest share is lower — the low edge assumes ~$1.6b of rentals. Every edge is over 5% of revenue.',
  },
  l2: {
    point: 2_903, low: 2_903, high: 2_903,
    basis: 'Interest expense as reported: $3,170m in fiscal 2025 + $2,141m − $2,408m for the nine-month periods.',
  },
  layers: [
    { key: 'L1+L7', label: 'Finance and interest income', value: '$5,526m · 11.5%', note: 'Disclosed as one line; lending (L7) and interest on cash (L1) together. Over the 5% cap at every scenario.' },
    { key: 'L2', label: 'Interest expense', value: '$2,903m · 6.05%', note: 'Δ20: ~4.5% on ~$64b of borrowings — consistent with a finance company\'s funding cost.' },
    { key: 'L3', label: 'Capitalised interest', value: 'not disclosed', note: 'Information only.' },
    { key: 'L4', label: 'Pension interest', value: 'not quantified here', note: 'Deere sponsors defined-benefit plans; information only.' },
    { key: 'L5', label: 'Lease interest', value: 'not quantified here', note: 'Information only.' },
    { key: 'L6', label: 'Derivative carry', value: 'hedging', note: 'Interest-rate and FX derivatives hedge the finance book. Tier 0.' },
    { key: 'L7', label: 'Financing income', value: 'inside the line above', note: 'Retail notes, revolving charge accounts, wholesale and financing leases.' },
    { key: 'L8', label: 'Cash-vehicle yield', value: 'inside L1', note: 'Cash and $1,350m of marketable securities.' },
  ],
  gate1: [
    { step: '1', test: 'Primary business', finding: 'Agricultural, turf, construction, forestry and roadbuilding equipment: net sales $41,358m in the twelve months.', result: 'Not P1 — pass' },
    { step: '2', test: 'Own P1 segment > 5% (U2)', finding: 'Financial Services (John Deere Financial) lends on its own balance sheet — retail notes, revolving charge accounts, wholesale and lease financing — with revenues of $5,821m in fiscal 2025, 12.7% of $45,684m. The methodology lists captive finance arms among the conventional lenders it excludes (P1-FIN).', result: 'CATEGORICAL FAIL' },
    { step: '3', test: 'Facilitation (Δ14)', finding: 'Not reached.', result: 'n/a' },
    { step: '4', test: 'Sector routing', finding: 'Not reached.', result: 'n/a' },
    { step: '5', test: 'Special classes', finding: 'Not a holding company; the finance arm is consolidated.', result: 'n/a' },
    { step: '6', test: 'Sub-industry (Δ5, Δ13)', finding: 'The machinery classification hides a ~$49b loan book.', result: 'Re-routed' },
    { step: '7', test: 'Client elections', finding: 'None.', result: 'n/a' },
  ],
  g1: 'categorical',
  gate5: {
    screenable: true,
    finding: 'Screenable — audited 10-K, quarterly 10-Qs and results releases. Finance income is reported as one line, without its split between interest and lease rentals.',
    gaps: [
      'Finance and interest income by type (retail notes, revolving accounts, wholesale, leases): not in the condensed quarterly statements.',
      'Operating lease liabilities: not in the condensed balance sheet.',
    ],
  },
  lines: [
    {
      key: 'interest', label: 'Finance and interest income (Layers 1 and 7)', rule: 'Gate 3, D5; P1-FIN', tier: 'Tier 1', interest: true,
      base: { point: 5_526, low: 3_900, high: 5_526 },
      rate: { A: 1, B: 1, C: 1, S: 1 },
      status: 'estimated',
      basis: 'See Layer 1. The line is disclosed; only its split between interest and lease rentals is estimated.',
    },
  ],
  sensitivities: [],
  standards: [],
  gflags: [
    'John Deere Financial funds itself with ~$64b of borrowings, including securitizations of its own receivables.',
  ],
  monitoring: [
    'The verdict changes only if the financing business is separated from Deere; none is announced.',
  ],
  openQuestions: [
    'How much of "finance and interest income" is rental on operating leases (ijārah-like) rather than interest? The quarterly statements do not say; the band runs from ~$3.9b to $5.5b, and every edge is over 5% of revenue.',
  ],
  reconciliation: [
    { field: 'Interest income', reference: '$0', filing: 'Finance and interest income $5,526m for the twelve months', effect: 'The reference data omits the line; a screen reading it sees no interest at all.' },
    { field: 'Financial services revenue', reference: '"Financial Products" $6,296m (fiscal 2025)', filing: 'Financial Services revenues $5,821m (fiscal 2025 results release)', effect: 'The filing figure is used for the U2 test; both are over 5%.' },
    { field: 'Financing receivables', reference: 'Mixed into other assets', filing: '$42,860m + $6,316m securitized', effect: 'Counted in Cash + IBS as interest-bearing customer loans (§6).' },
  ],
  sources: [
    { label: 'Deere Q4 FY2025 results (8-K, Exhibit 99.1)', href: `${EDGAR}/315189/000110465925116130/de-20251126xex99d1.htm` },
    { label: 'Deere Q3 FY2026 Form 10-Q', href: `${EDGAR}/315189/000110465926102213/de-20260802x10q.htm` },
    { label: 'Deere FY2025 Form 10-K', href: `${EDGAR}/315189/000110465925122321/de-20251102x10k.htm` },
  ],
};
