# Apple Inc. (AAPL) — Shariah Screening Report

**Methodology:** Shariah Screening Master Methodology **v5.0** (Definitive Consolidated Edition, locked 7 October 2026). No older version was requested, so no downgrade list is needed (§0 note).
**Screened:** 7 October 2026 · **Issuer:** Apple Inc., CIK 0000320193 (Nasdaq: AAPL), California; single class of common stock.
**Period:** the last four reported quarters — Q4 FY2025 + Q1–Q3 FY2026, i.e. the twelve months to **27 June 2026** ("TTM"). Apple's fiscal year ends on the last Saturday of September; the FY2026 10-K is not yet filed.
**Balance sheet:** 27 June 2026 (Q3 FY2026 10-Q), with the three earlier quarter-ends shown for trend.
**Market cap:** month-end closes October 2023 – September 2026 plus the 7 October 2026 price (Appendix A).
**User locks applied:** none of U1–U11 binds Apple (no GLP-1/ED, no BRK-style insurance segment, no talc, no MRNA/media locks). U9's media defaults (F12 Reading (c), music incidental to video excluded) are applied to Apple TV; U11 (the Gate-1 list cannot be overridden) is respected.
**Part VIII status:** Apple is the first issuer in the record from the apps-and-platforms (§52) and payments (§54) sectors, so — per the §59 operational note — those rules are applied as proposals and listed for ratification in §20.

**Naming.** Readers see four *scenarios* — A, B · AAOIFI (the preferred reading), C and Strictest. The methodology's school mapping (§61) is kept in §15 because §62 requires it; nothing else in this report or on the app uses school names.

The same computation drives the **Shariah Compliance tab** of the AAPL stock page (`web/src/lib/shariah-v5.ts`, `web/src/lib/shariah-issuers.ts`); `web/tests/shariah-v5.test.ts` pins the figures in this report.

---

> **Amendment, 18 October 2026 (methodology Δ40).** Cash + IBS is now tested against the 12-month average market cap at every scenario, as AAOIFI Shariah Standard No. 21 does; R11 (Cash + IBS / total assets, 38.23%) is reported for information and decides nothing. On the same figures as this report, R8 is **3.50%** of the 12-month average market cap, a pass at every scenario. The verdicts become:
>
> | Scenario | Verdict | Deciding |
> |---|---|---|
> | Scenario A | **PASS** | All five gates pass |
> | **Scenario B · AAOIFI** (preferred) | **PASS** | All five gates pass; Gate 4 NPI 3.68% < 5% |
> | Scenario C | **FAIL** | Gate 4: 5.58% > 5% at the conservative edge |
> | Strictest | **FAIL** | Gate 2, R19: debt incl. operating leases 25.59% of total assets > 25%; Gate 4: 5.99% > 3% |
>
> The sections below are the report as screened on 7 October 2026; where they say R11 decides a scenario, read it as superseded by this note. The app (`web/src/lib/shariah-issuers.ts`) carries the amended verdicts.

## 1. TL;DR

| Scenario | Verdict | Deciding gate(s) | NPI (Gate 4) | Purification / share (TTM) |
|---|---|---|---|---|
| **Scenario A** | **PASS** | All five gates pass; robust across every estimate band | 2.61% (cap 5%) | **$0.38** ($0.05 via dividend) |
| **Scenario B · AAOIFI** (preferred) | **FAIL** | **Gate 2, R11:** cash + interest-bearing securities = **38.23% of total assets** > 33% (bright-line, 5.2pp over, outside the Δ22 zone) | 3.68% (passes at the point; 5.36% at the band's upper edge) | $0.47 (exit only) |
| **Scenario C** | **FAIL** | **Gate 2, R11** 38.23% > 30%; **Gate 4** 5.58% > 5% at the conservative edge | 5.58% | $0.65 (exit only) |
| **Strictest** | **FAIL** | **Gate 2, R11** 38.23% > 25% and **R19** debt incl. operating leases 25.59% > 25%; **Gate 4** 5.99% > 3% | 5.99% | $0.69 (exit only) |

One line: **Apple's business and leverage are clean; its $146.5 billion cash-and-bond pile is not.** Against market value every ratio is tiny (debt 2%, cash 4%), so AAOIFI's literal market-cap test and every market-cap index (DJIM, S&P, FTSE-IdealRatings, MSCI M-Series) pass. Measured against total assets — the alternative test Maz Vantage's Scenario B adds, and the test MSCI Islamic and SC Malaysia use — cash and interest-bearing securities are 38% of everything Apple owns. Under Scenario A Apple may be held with ~$0.38 per share per year of purification; Scenario B (AAOIFI, the preferred reading), Scenario C and Strictest do not pass on the current balance sheet.

---

## 2. Key findings

1. **R11 decides Sc B, Sc C and Strictest.** Cash $39.5b + current marketable securities $22.9b + non-current marketable securities $84.1b = **$146.5b = 38.23% of total assets ($383.3b)**. It has been above 33% at every quarter-end in the window (36.86%, 38.17%, 39.50%, 38.23%). *Source: 10-Q Q3 FY2026, 0000320193-26-000020, balance sheet and Note 4.*
2. **Market-cap ratios are trivially clean.** Debt (track a, $85.6b) is 2.0–2.4% of the 12/24/36-month average market cap ($4.19t / $3.79t / $3.53t); cash + IBS 3.5–4.2%; receivables 0.7–0.9%. *Sources: filings + month-end closes (Appendix A).*
3. **Strictest also fails on leverage including leases (R19).** Borrowings $84.3b + finance leases $1.2b + operating leases $12.5b = $98.1b = **25.59%** of total assets, 0.59pp over the 25% bright-line. ~$3b of net repayment would clear it; $11.0b of notes fall due within a year. *10-Q Q3 FY2026; lease liabilities from the FY2025 10-K Note 8 (disclosed annually only).*
4. **Apple stopped disclosing gross interest income and interest expense after FY2023** (last: $3,750m interest and dividend income; $3,933m interest expense). Layer 1 is therefore **estimated at ~$4.2b (band $3.6–4.8b) = 0.90% of revenue** — far inside the 5% cap, which would need ~$23b to bind. *FY2023 XBRL `InvestmentIncomeInterestAndDividend`; TTM other income/(expense), net +$1,047m.*
5. **Maz Vantage's reference data shows interest income of $0** for FY2025 and the TTM — the PEP/RXST feed failure mode (§XII.10). A competitor app (Zoya) prints the same $0. Logged in §5.
6. **Gate 1 passes.** iPhone is 52.6% of TTM revenue and products 74.2%. Nothing Apple conducts itself in a P1 category approaches the U2 5% segment test, and P1-facilitating revenue is ~2–3%, far below Δ14's 50%.
7. **Exhibit 21 lists "Apple Insurance Company, Inc." (Arizona) as a significant subsidiary**; its business is not disclosed. Most likely a captive or the reimbursement insurer behind AppleCare service contracts; logged as a G-flag and an open question. *FY2025 10-K Exhibit 21.*
8. **Apple is a conventional-insurance intermediary.** In the UK (and other insurance-format markets) AppleCare+ is an AIG policy and Apple sells it for a commission plus a per-policy claims fee; in the US, Theft & Loss cover is underwritten by New Hampshire Insurance Company and sold by Apple's AppleCare Service Company. Sized at ~$1.9b (band $1.05–3.8b), Tier 1. *Apple AppleCare+ UK IDD; Apple US product terms.*
9. **Gate 4 at Sc A is 2.61% and passes even at the upper edge of every band (3.68%).** The largest contributors are interest (0.90%), Apple Music (0.43%), insurance distribution (0.41%), social-casino App Store commissions (0.32%) and Apple TV (0.29%).
10. **Gate 4 at Sc C is band-sensitive:** 5.58% at the conservative edge (D9) — a FAIL — but 3.85% at the point estimate. Google search licensing ($20–28b, of which finance/insurance/gambling/alcohol advertising is 11–18.5%) and insurance distribution decide it. Sc C fails on Gate 2 regardless.
11. **Two index facts the methodology's §60 table gets wrong or leaves unverified:** (a) S&P DJI's 20 Aug 2026 announcement 1484596 lowers the DJIM leverage and cash caps to **30% of 24-month average market cap** (confirmed from the announcement text; Apple passes either way); (b) FTSE's **IdealRatings** screen (v1.4, March 2026) uses **24-month average market cap** with total assets only as a fallback, and excludes music, film and insurance broking whole-line — not the total-asset ratios §60 row 6 lists, which are FTSE Yasaar's.
12. **Twelve-standard tally: 7 PASS / 1 BORDERLINE / 4 FAIL → "split".** The fails are all total-asset cash tests (MSCI Islamic, SC Malaysia) or Maz Vantage's stricter scenarios.

---

## 3. Issuer overview and doctrinal positioning

Apple designs, manufactures (through outsourcing partners) and sells smartphones, personal computers, tablets, wearables and accessories, and sells services (10-K Item 1). TTM revenue **$466.8b**: iPhone $245.5b (52.6%), Mac $35.9b (7.7%), iPad $28.7b (6.1%), Wearables/Home/Accessories $36.3b (7.8%), **Services $120.5b (25.8%)**. The 10-K names the Services components: Advertising ("third-party licensing arrangements and the Company's own advertising platforms"), AppleCare, Cloud Services, Digital Content (App Store, Apple Arcade, Apple Fitness+, Apple Music, Apple News+, Apple TV) and Payment Services (Apple Card, Apple Pay). Reportable segments are geographic (Americas, Europe, Greater China, Japan, Rest of Asia Pacific).

**Doctrinal positioning.** Hardware is Tier 0 in every scenario. The screen is decided by (i) the *treasury* — a conventional fixed-income portfolio whose size against total assets is a Gate-2 question and whose yield is Layer 1 *ribā*; and (ii) a *services* business that touches five frameworks: media and music (F12, Δ28), advertising pass-through (Δ31), app-store take from prohibited apps (§52), payments (§54) and insurance (§31). Apple is classified by GICS as hardware, which hides all of this — a Δ5/Δ13 re-routing (Gate 1 step 6).

---

## 4. Financial summary

All figures US$ millions unless stated. Quarter splits: Q4 FY2025 = FY2025 10-K less the Q3 FY2025 10-Q nine-month figures.

**Filings used**

| Form | Period | Accession |
|---|---|---|
| 10-K | FY2025 (to 27 Sep 2025) | 0000320193-25-000079 |
| 10-Q | Q1 FY2026 (to 27 Dec 2025) | 0000320193-26-000006 |
| 10-Q | Q2 FY2026 (to 28 Mar 2026) | 0000320193-26-000013 |
| 10-Q | Q3 FY2026 (to 27 Jun 2026) | 0000320193-26-000020 |
| 10-Q | Q3 FY2025 (to 28 Jun 2025) — for the Q4 FY2025 split and the June 2025 cash balance | 0000320193-25-000073 |
| 8-K | Q3 FY2026 results (Item 2.02, Ex. 99.1) | 0000320193-26-000018 |

**Income statement**

| | Q4 FY25 | Q1 FY26 | Q2 FY26 | Q3 FY26 | **TTM** |
|---|---|---|---|---|---|
| Net sales | 102,466 | 143,756 | 111,184 | 109,417 | **466,823** |
| — of which Services | 28,750 | 30,013 | 30,976 | 30,739 | **120,478** |
| Other income/(expense), net | +377 | +150 | −52 | +572 | **+1,047** |
| Pre-tax income | 32,804 | 51,002 | 35,833 | 36,267 | **155,906** |
| Income tax | 5,338 | 8,905 | 6,255 | 6,478 | **26,976** (ETR 17.30%) |
| Net income | 27,466 | 42,097 | 29,578 | 29,789 | **128,930** |
| Diluted EPS ($) | 1.85 | 2.84 | 2.01 | 2.02 | **8.72** |
| Diluted shares (m) | 14,863.6 | 14,810.4 | 14,725.9 | 14,714.7 | 14,778.6 (avg) |
| Dividends declared / share ($) | 0.26 | 0.26 | 0.26 | 0.27 | **1.05** |

Q3 FY2026 includes tariff refunds booked against cost of sales (~2pp of gross margin, $0.11 of EPS per the 8-K); they do not touch the revenue denominator (D14 concerns non-operating items only).

**Balance sheet, 27 June 2026** — total assets **383,266**; total liabilities 275,746; equity 107,520. Cash and equivalents 39,544; current marketable securities 22,855; non-current marketable securities 84,118 (**Cash + IBS 146,517**); trade receivables 31,398; vendor non-trade receivables 27,509; inventories 11,092; PP&E 51,431; intangible assets 25,417 (current 5,075 + non-current 20,342). Commercial paper 1,997; term debt 11,007 current + 71,340 non-current (notes carried at $82.3b; fair value $71.2b).

**Cash flow, TTM** — operating cash flow 146,724; capex 10,041; buybacks 82,226; dividends paid 15,640; net debt repayment ~17,300 (term debt 9,396, commercial paper 7,878; no issuance).

---

## 5. Data reconciliation log (Gate 5, §XII.10)

Maz Vantage's licensed reference data (what the app's quick screen reads) against the filings. The filing wins.

| Field | Reference data | Filing | Effect |
|---|---|---|---|
| Interest income | **$0** (TTM and FY2025) | Not disclosed since FY2023 | A zero passes Layer 1 on no evidence. The screen uses an estimate (~$4.2b, §10). |
| Interest expense | $0 | Not disclosed since FY2023 | Estimated ~$2.7b (§10). |
| Cash + interest-bearing securities | $62.4b ("cash and short-term investments") | **$146.5b**, including $84.1b of non-current debt securities | Understates every cash ratio by 57%. The app's mechanical screen therefore shows cash/total assets at 16.3% instead of 38.2% and passes FTSE/MSCI-style tests that the filing fails. The tab's footnote has been corrected to say so. |
| Total debt | $84.3b | $84.3b borrowings + $1.23b finance leases (track a) + $12.49b operating leases (track b) | Leases omitted: track (a) +1.5%, track (b) +16%. |
| Goodwill | $0 | Not presented separately since FY2017 (last $5,717m) | Placeholder $10b (deliberately high); moves R7/R12 by < 0.01pp. |
| Intangible assets | $20.3b | $25.4b (incl. $5.1b current portion) | Tangible-market-cap ratios (R7, R12) use $25.4b. |
| Receivables | $58.9b | $31.4b trade + $27.5b non-trade from manufacturing partners | Only trade receivables are AR (§6). |
| Diluted shares | 14,750m (nine-month figure) | TTM average 14,778.6m | Purification uses the TTM average. |

---

## 6. Market-cap triangulation (§8, D16)

Shares outstanding from the cover pages (`dei:EntityCommonStockSharesOutstanding`, quarterly; interpolated monthly), month-end closes from Maz Vantage's price history (reconciled to the Q3 FY2026 10-Q's average repurchase prices of $296–297 in May–June 2026). Full table: Appendix A.

| Window | Months | Average MCAP | Used by |
|---|---|---|---|
| 12-month | Oct 2025 – Sep 2026 | **$4,190.3b** | Sc B (primary) |
| 24-month | Oct 2024 – Sep 2026 | **$3,792.4b** | Sc A (primary) |
| 36-month | Oct 2023 – Sep 2026 | **$3,527.3b** | worst-of at Sc C and Strictest |
| Spot | 7 Oct 2026, $336.57 × 14,594.2m | **$4,912.0b** | in Strictest's worst-of |

The worst-of window at Sc C and Strictest is the 36-month average (the smallest denominator). No window disagreement changes any MCAP ratio's pass/fail (all are below 6%), so no window Watch flag arises.

---

## 7. Gate 1 — the §5 decision table

| Step | Test | Finding | Result |
|---|---|---|---|
| 1 | Primary business | Consumer hardware (iPhone 52.6%, products 74.2%). | Not P1 — PASS |
| 2 | Own P1 segment > 5% (U2) | Segments are geographic. Activities Apple conducts itself: AppleCare service contracts (Apple is the obligor in the US), an insurance subsidiary (Apple Insurance Company, Inc.), insurance intermediation (UK etc.). Even taken whole (~$10b, ~2.1%) these are below 5%. Apple Pay Later — where Apple Financing LLC lent directly — closed in June 2024, before the window. | Below 5% — PASS; G-flag |
| 3 | Facilitation (Δ14) | P1-facilitating revenue — insurance distribution, Apple Card, social-casino commissions, finance/gambling/alcohol advertising — ~2–3% of revenue. | < 50% — standard Gate 4 |
| 4 | Sector routing | Hardware and digital platforms: conditionally permissible. Apple TV and Apple Music → Part VII; App Store → §52; Apple Pay/Card → §54/§52; advertising → Δ31; AppleCare → §31. | Proceed |
| 5 | Special classes | Not a health payer, takaful operator or holding company. | n/a |
| 6 | Sub-industry (Δ5, Δ13) | GICS hardware hides a 25.8% services business with media, advertising, payments and insurance lines. | Re-routed to Gate 4 line items |
| 7 | Client elections | None. | n/a |

**Gate 1: PASS at all four scenarios.**

---

## 8. Gate 2 — all twenty-two ratios

Balance sheet 27 June 2026. **Track (a)** IBD = commercial paper 1,997 + term debt 82,347 + finance leases 1,230 = **85,574**. **Track (b)** = (a) + operating leases 12,490 = **98,064** (lease liabilities as of 27 Sep 2025, the latest disclosed). Cash + IBS 146,517. AR (trade) 31,398. Goodwill placeholder 10,000; intangibles 25,417.

| # | Ratio | 12m | 24m | 36m | Spot | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|---|---|---|---|---|
| R1–R3 | IBD (a) / MCAP | 2.04% | 2.26% | 2.43% | 1.74% | 2.26% ≤ 33 ✓ | 2.04% ≤ 30 ✓ | 2.43% ≤ 30 ✓ | — |
| R1–R3 (b) | IBD (b) / MCAP | 2.34% | 2.59% | 2.78% | 2.00% | | | | 2.78% ≤ 25 ✓ |
| R4 | IBD (a) / TA | 22.33% | | | | info | ≤ 30 ✓ | ≤ 30 ✓ | — |
| R5 | IBD / equity | 79.59% | | | | info | info | info | info |
| R6 | (IBD − cash − IBS) / equity | −56.68% (net cash) | | | | info | info | info | info |
| R7 | IBD / (MCAP − GW − intangibles) | 2.06% | 2.28% | 2.45% | 1.75% | info | info | 2.45% ≤ 30 ✓ | (b) 2.81% ≤ 25 ✓ |
| R8–R10 | Cash + IBS / MCAP | 3.50% | 3.86% | 4.15% | 2.98% | 3.86% ≤ 33 ✓ | 3.50% ≤ 30 ✓ | 4.15% ≤ 30 ✓ | 4.15% ≤ 25 ✓ |
| **R11** | **Cash + IBS / TA** | **38.23%** | | | | info | **> 33 ✗** | **> 30 ✗** | **> 25 ✗** |
| R12 | Cash + IBS / (MCAP − GW − intangibles) | 3.53% | 3.90% | 4.20% | | info | info | 4.20% ≤ 30 ✓ | 4.20% ≤ 25 ✓ |
| R13 | (Cash + IBS + AR) / MCAP | 4.25% | 4.69% | 5.04% | | ≤ 50 ✓ | ≤ 50 ✓ | ≤ 50 ✓ | ≤ 50 ✓ |
| R14–R15 | AR / MCAP | 0.75% | 0.83% | 0.89% | | ≤ 33 ✓ | ≤ 33 ✓ | ≤ 33 ✓ | ≤ 25 ✓ |
| R16 | AR / TA | 8.19% | | | | info | info | ≤ 33 ✓ | ≤ 25 ✓ |
| R17 | Layer 1 / revenue (Gate 3) | 0.90% (edge 1.03%) | | | | ≤ 5 ✓ | ≤ 5 ✓ | ≤ 5 ✓ | ≤ 5 ✓ |
| R18 | Interest expense / revenue | ~0.58% (est.) | | | | info; Δ20 trigger | | | |
| **R19** | **IBD (b) / TA** | **25.59%** | | | | — | — | — | **> 25 ✗** |
| R20 | (IBD − cash) / 12m MCAP | 1.10% | | | | info | | | |
| R21 | Total liabilities / TA | 71.95% | | | | info (above the 70% watch line strict boards use) | | | |
| R22 | (Int. exp − int. inc) / revenue | −0.32% (net interest earner, est.) | | | | info | | | |

**Δ22:** no Gate-2 ratio is within 2pp of a Sc A or Sc B limit. R11 at Sc B is 5.23pp over — bright-line FAIL with no Watch reading available. **Δ38:** equity is positive ($107.5b, up from $73.7b at FY2025 year-end); not triggered.

**Trend of the deciding ratios (quarter-ends in the window):**

| | 27 Sep 2025 | 27 Dec 2025 | 28 Mar 2026 | 27 Jun 2026 |
|---|---|---|---|---|
| Total assets | 359,241 | 379,297 | 371,082 | 383,266 |
| Cash + IBS | 132,420 | 144,795 | 146,595 | 146,517 |
| R11 Cash + IBS / TA | 36.86% | 38.17% | 39.50% | 38.23% |
| R4 IBD (a) / TA | 27.81% | 24.19% | 23.16% | 22.33% |
| R19 IBD (b) / TA | 31.28% | 27.48% | 26.53% | 25.59% |

For context, R11 was ~46% at FY2023 year-end and ~43% at FY2024; Apple's net-cash run-down is bringing it toward the cap, not yet under it.

**Robustness.** Excluding all $26.8b of bank "cash" (treating it as non-interest-bearing operating balances, which §6 does not allow) would leave R11 at 31.24% — still a Sc C and Strictest FAIL, and a Sc B **MIXED-Watch** (within 2pp of 33%), not a PASS. **Remediation:** Sc B's R11 clears when Cash + IBS ≤ 33% of TA: about **$29.9b deployed off the balance sheet** (buybacks or debt repayment from cash), or TA growth of ~$60.7b with cash flat. Strictest's R19 clears with **~$3.0b of net debt repayment**; its R11 would need ~$67.6b deployed off the balance sheet (Cash + IBS down to ~$79b).

**Sensitivity — the Q2 FY2026 intangible addition.** Gross intangibles rose $12.8b in the March quarter while other non-current liabilities rose ~$13.5b over the window; the 10-Qs explain neither. If the liability were interest-bearing deferred consideration, IBD (a) would be $98.4b → R4 25.67% (still ≤ 30%) and R19 28.93% (fails anyway). No verdict changes.

**Gate 2: Sc A PASS; Sc B FAIL (R11); Sc C FAIL (R11); Strictest FAIL (R11, R19).**

---

## 9. Debt structure and acquisition financing

- **Notes:** senior unsecured fixed-rate notes, 0.000%–4.850% coupons, maturing 2025–2062 (USD, EUR, and other currencies — six series are Nasdaq-listed); principal $91.3b at FY2025 year-end, carried at $82.3b on 27 June 2026 after $8.1b of repayments in FY2026 and **no new issuance**. The May 2025 issue ($4.5b, 4.000–4.750% due 2028–2035) is the most recent. Future principal: $12.4b in FY2026, $10.1b FY2027, $9.3b FY2028.
- **Commercial paper:** $2.0b (from $8.0b), weighted rate 4.19% at FY2025 year-end; used "for general corporate purposes, including dividends and share repurchases".
- **Hedges:** interest-rate swaps converting part of the fixed notes to floating ($10.6b notional) and cross-currency swaps on foreign-currency notes; FX hedges on revenue and inventory. Commercial hedging — Tier 0 (L6).
- **No sukuk, no convertibles, no mandatorily redeemable preferred.** Leases: finance $1.23b, operating $12.49b (3.4% discount rate, 9.8-year weighted term).
- **Acquisition financing (§30):** no debt-financed acquisition in the window. The unexplained $12.8b intangible addition is ~0.3% of market cap, below §30's 5% trigger for pro-forma modelling.
- **Debt purpose:** Apple's debt finances capital return (buybacks $82.2b and dividends $15.6b in the TTM) while it holds $146.5b of securities — the structure that produces both a clean MCAP leverage ratio and a failing TA cash ratio.

---

## 10. Gate 3 — the eight layers (§12)

| Layer | Key | TTM | % revenue | Basis | Result |
|---|---|---|---|---|---|
| L1 | `l1_interest_income_gross` | **~$4,200m** (band 3,600–4,800) | **0.90%** (edge 1.03%) | **Estimated** (below) | PASS — needs ~$23.3b to bind |
| L2 | `l2_interest_expense` | ~$2,700m (2,500–2,950) | ~0.58% | Estimated: FY2025 10-K — $2.6b of note interest payable in the next 12 months on $91.3b principal (2.85%), plus CP at 4.19% | Info; Δ20 triggered |
| L3 | `l3_capitalized_interest` | n/d | — | Not disclosed | Info |
| L4 | `l4_pension_interest_cost` | — | — | No material defined-benefit plans | Info |
| L5 | `l5_lease_interest` | ~$470m | ~0.10% | 3.4% × $13.7b lease liabilities | Info |
| L6 | `l6_derivative_carry` | hedging | — | FX and rate hedges ($136b notional incl. undesignated FX) | Tier 0 |
| L7 | `l7_financing_income` | none | — | Apple Pay Later closed June 2024; Apple Card is a co-brand fee (Gate 4) | PASS |
| L8 | `l8_cash_vehicle_yield` | inside L1 | — | MMF $7.8b, CP $3.8b, time deposits $3.0b, Treasuries $20.2b, corporates $49.1b, MBS/ABS $23.7b (27 Jun 2026) | Disclosed composition |

**Layer-1 estimate.** Apple last disclosed gross interest and dividend income in FY2023 — $3,750m on an average $165.6b of cash and securities (2.26%) — and has since reported only the net "other income/(expense)". Two independent routes:

1. *Yield route:* average cash + securities over the five quarter-ends (28 Jun 2025 $133.0b; 27 Sep 2025 $132.4b; 27 Dec 2025 $144.8b; 28 Mar 2026 $146.6b; 27 Jun 2026 $146.5b) = **$140.7b**; a 2.8–3.4% book yield (low-coupon 2020–21 holdings rolled into 3.5–4.5% short rates and corporates) gives **$3.9–4.8b**.
2. *Net-line route:* TTM other income/(expense), net **+$1,047m** + interest expense ~$2.7b = ~$3.75b, before realised losses on securities and FX remeasurement (historically negative: −$382m in FY2023) → **~$3.8–4.2b**.

Point **$4.2b**, band **$3.6–4.8b**; the ~$1.1b of mutual funds may contribute dividends (immaterial). Per the §13 operational note, the netted figure is not used as L1. **Gate 3 passes at every scenario across the whole band.**

**Δ20 cross-reference.** Interest expense ~0.58% of revenue (> 0.5%) and R19 at 25.6% (> 25%) both trigger it. Implied coupon ≈ $2.7b ÷ ~$90.8b average debt ≈ 3.0% against 2.85% scheduled — consistent within 100bp; the small excess fits the fixed-to-floating swaps paying current short rates. No off-balance-sheet financing indicated.

---

## 11. Revenue mapping

Apple discloses Services as one line ($120.5b TTM). Every Gate-4 line below is therefore **sized from third-party evidence and labelled an estimate**; where three independent sources could not be found, the rate carries the §19 label **ESTIMATED — WIDE BAND**.

| Line | Size (point; band) | Framework | Evidence |
|---|---|---|---|
| Google search licensing | $24b; $20–28b | Δ31 | Google paid Apple **$20b in 2022** (trial filings; Eddy Cue), 36% of Safari search-ad revenue; Bernstein $18–20b (2023); Oppenheimer ~$20b (2024); grown with Google Search since. Apple's 10-K files it under advertising. Remedies (Sept 2025) allow payments to continue, non-exclusively. |
| Apple Ads (own) | $8b; $6–11b | Δ31 | JPMorgan forecasts for 2025: $6b (search ads $4.1b) and $11b; Apple named advertising the leading Services growth driver in FY2025–26. |
| Apple Music | $10b; $8.5–11.5b | F12 / Δ28 | MIDiA: 116.1m subscribers (Q4 2025) × ~$7 blended monthly price ≈ $9.7b; published estimates $8.5–11.3b. |
| Apple TV (subscription) | $4.5b; $3.5–5.5b | F12 / Δ28 | The Information: ~45m subscribers (2024), > $1b annual loss, ~$4.5b content spend; price $12.99 since Aug 2025; heavy bundling. |
| Film & TV rentals, sales, Channels | $1.5b; $1.0–2.5b | F12 (studio archetype) | No public figure; Apple's take on transactional video and third-party Channels. |
| App Store — social casino | $1.5b; $1.1–2.1b | §52 | AppMagic: casino genre App Store revenue **$4.2b net of fees** in 2025 (−7.6% y/y) → ~$5.6–6.0b gross → $1.4–1.8b to Apple; upper edge adds casual-casino titles (AppMagic H1 2025: $1.2b all stores); US link-out purchases since May 2025 lower the floor. Real-money gambling cannot use in-app purchase (App Review Guidelines). |
| App Store — loot boxes / gacha | $3.0b; $2.0–4.5b | §52 open election | Juniper: loot boxes ~$20b across platforms by 2025; Sensor Tower: mobile game IAP ~$82b (2025), RPG + strategy ~42%. |
| Insurance distribution | $1.9b; $1.05–3.8b | §31 | AppleCare ~$9–12b (Warranty Week $8.5b in 2020, grown); UK AppleCare+ is AIG insurance sold by Apple as intermediary (commission + claims fee); US Theft & Loss underwritten by New Hampshire Insurance Co. 10–25% of AppleCare in insurance format (point 15%) + $0.2–0.8b Theft & Loss. |
| AppleCare service contracts (remainder) | ~$8.5b | §31 — Tier 0 (proposal) | Apple's own repair/support/accidental-damage contracts (US obligor: AppleCare Service Company). Treated as an IIFA Resolution 103 *maintenance contract*; insurance reading shown as sensitivity. |
| Apple Card / savings / credit broking | $0.5b; $0.3–1.0b | Δ31 / §52 | Co-brand card (Goldman → JPMorgan Chase, announced 7 Jan 2026, ~24-month transition); launch forecasts ~$1b; Goldman lost money on the programme; UK credit broking via Apple Payments Services Ltd. |
| Apple Pay issuer fees | $2.5b; $1.0–4.5b | §52 (mirrors Δ31) | ~0.15% of credit / ~0.5¢ per debit transaction; estimates $1–4.5b (FY2025 up to $4.5b; plaintiff allegation ~$1b/yr from US issuers). |
| Everything else (hardware, iCloud, Arcade, Fitness+, News+, Books, Podcasts, enterprise) | — | Tier 0 | iCloud, Arcade (curated, no ads/IAP), Fitness+ (music incidental, U9), News+ (news archetype ~0 at Sc A/B). Books, dating-app commissions and mature-rated games are flagged in §20, not sized. |

---

## 12. Gate 4 — the four-scenario table (S8)

Share of TTM revenue ($466,823m). **D9 sizing:** Sc A/B use the point; Sc C/Strictest the conservative (upper) edge of size *and* of benchmark share. **D5:** Layer-1 interest is inside the total.

| Line | Rule · tier | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|---|
| Interest income (L1) | D5 · Tier 1 | 0.90% | 0.90% | 1.03% | 1.03% |
| Social-casino App Store take | §52 P1-GMB · Tier 1 (100%) | 0.32% | 0.32% | 0.45% | 0.45% |
| Insurance distribution | §31 P1-INS · Tier 1 (100%) | 0.41% | 0.41% | 0.81% | 0.81% |
| Apple Music | Δ28, music archetype 20/25/30/40% (placeholder) | 0.43% | 0.54% | 0.74% | 0.99% |
| Apple TV | Δ28, general SVOD archetype 30/35/40/50% | 0.29% | 0.34% | 0.47% | 0.59% |
| Film & TV rentals, Channels | studio archetype 18/22/28/38% | 0.06% | 0.07% | 0.15% | 0.20% |
| Google licensing | Δ31: Sc A alcohol+gambling 2% (1.3–3.5%); Sc B+ + finance/insurance 14% (11.3–18.5%) | 0.10% | 0.72% | 1.11% | 1.11% |
| Apple Ads | Δ31: Sc A gambling/social casino/alcohol 5% (3–8%); Sc B+ + finance apps 15% (11–23%) | 0.09% | 0.26% | 0.54% | 0.54% |
| Apple Card / savings / broking | Δ31 / §52: Sc A ijārah carve-out; Sc B+ 100% | 0.00% | 0.11% | 0.21% | 0.21% |
| Apple Pay, by product bought | §52: P1 merchants 3% (2–5%); Sc B+ + finance 4% (3–6%) | 0.02% | 0.02% | 0.06% | 0.06% |
| **NPI** | | **2.61%** | **3.68%** | **5.58%** | **5.99%** |
| Cap | | 5% | 5% | 5% | **3%** |
| **Gate 4** | | **PASS** | **PASS** | **FAIL** | **FAIL** |
| *Open election — loot boxes/gacha (not in total)* | §52: Sc A/B 0%; Sc C/Strictest at 0 / 50 / 100% | 0% | 0% | 5.58 / 6.06 / 6.54% | 5.99 / 6.48 / 6.96% |

**Robustness across the bands (§16.5).**

| | As sized | Other edge | Verdict holds? |
|---|---|---|---|
| Sc A | 2.61% | 3.68% (all upper edges) | **Yes — PASS** |
| Sc B | 3.68% | 5.36% (all upper edges) | **No** — Gate 4 would fail at the top of the bands. Sc B already fails Gate 2. |
| Sc C | 5.58% | 3.85% (all point estimates) | **No** — the deciding assumptions are the Google licensing size and its finance/insurance share (±0.4pp), insurance distribution (±0.4pp) and Apple Music. Sc C fails Gate 2 regardless. |
| Strictest | 5.99% | 4.19% | **Yes — FAIL** (cap 3%) |

**Unsettled readings (sensitivities, percentage points added to NPI):**

| Reading | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| AppleCare service contracts treated as commercial insurance (~$8.5b; $7–10b) | +1.82 | +1.82 | +2.14 | +2.14 |
| Apple Pay attributed by the paying bank rather than the product bought | 0 | +0.51 | +0.91 | +0.91 |
| Apple Music as categorical *lahw* under Scenario C and Strictest (§39(vi) reading (a)) | 0 | 0 | +1.72 | +1.48 |

Even the AppleCare-as-insurance reading leaves Sc A at 4.43% — a PASS. It would push Sc B's Gate 4 to 5.50% (fail).

---

## 13. Customer exposure (Δ16, F11, Δ8)

- **Δ16 not triggered:** no vertical supplies ≥ 50% of revenue; Apple's revenue is consumer and SMB/enterprise across regions. Direct channels 40%, indirect (carriers, resellers) 60% (FY2025 10-K). No customer is ≥ 10% of revenue; one customer (a carrier) is 18% of *trade receivables* — a credit, not a Shariah, fact.
- **F11:** B2C for devices and services — the end-use drives attribution, applied line by line in §12. Carriers and resellers are channels, not attributable customers.
- **Δ8 not applicable:** there is no prescriber or AI decision gate at contract formation. The App Store review process is a platform gate; its strength matters for §52 (what apps are admitted — Apple bans porn apps and IAP for real-money gambling, but admits social casino), already reflected in the casino and gacha lines.

---

## 14. Purification (Δ6 v5.0, Part X)

Inputs: t = 26,976 / 155,906 = **17.30%**; NI = $128,930m; R = $466,823m; diluted shares 14,778.6m; I = L1 in that scenario ($4.2b Sc A/B, $4.8b Sc C/Strictest). m = (NI − I(1 − t)) / R = **26.88%** (Sc A/B), 26.77% (Sc C/S).

| | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| I × (1 − t) | $3,473m | $3,473m | $3,970m | $3,970m |
| R_imp (impure operating revenue) | $7,975m | $12,965m | $21,230m | $23,180m |
| R_imp × m | $2,143m | $3,484m | $5,683m | $6,205m |
| **Impure earnings (IE)** | $5,617m | $6,958m | $9,652m | $10,174m |
| **Purification per share** | **$0.380** | $0.471 | $0.653 | $0.689 |
| Δ6-D dividend part (payout 1.05 / 8.72 = 12.0%) | $0.046 | $0.057 | $0.079 | $0.083 |
| Retained-earnings part | $0.334 | $0.414 | $0.575 | $0.606 |
| §59 cross-check: DPS × NPI | $0.027 | $0.039 | $0.059 | $0.063 |

- Purification is ~4.4% of EPS at Sc A; it never approaches earnings (F7 fixed).
- **Only Sc A passes**, so only the Sc A figure is a holding purification. Figures for Sc B, Sc C and Strictest are for cleaning a legacy exit (§4).
- No ADR (Δ17 n/a); reporting currency USD (no translation).
- The ratio method ($0.027) understates by ~14× because interest is a far larger share of profit than of revenue — the §59 reconciliation point.

---

## 15. Six-school verdict (§61)

| School | Scenario | Verdict |
|---|---|---|
| Hanafi | Sc A | **PASS** — purify ~$0.38/share/year |
| Maliki | Sc B | FAIL (Gate 2, R11) |
| Shāfiʿī | Sc B | FAIL (Gate 2, R11) |
| Hanbali | Sc C | FAIL (Gate 2, R11; Gate 4) |
| Jaʿfari | Sc B + khums | FAIL (Gate 2, R11). Khums, company level: 20% × $128,930m = **$25,786m**; per share (informational) 20% × $8.72 = **$1.74** — the investor's own obligation per their *marjaʿ*. |
| Strictest supervisor | Strictest | FAIL (Gate 2, R11 & R19; Gate 4) |

---

## 16. Twelve-standard matrix (§60)

| # | Standard | Result | Deciding figure |
|---|---|---|---|
| 1 | AAOIFI SS 21 (literal, market cap) | **PASS** | Borrowings 2.0%, interest-bearing deposits/securities 3.5% of 12m MCAP; NPI 3.7% (Sc B) |
| 2 | Dow Jones Islamic Market | **PASS** | 2.3% / 3.9% of 24m MCAP — passes both the old 33% and the new **30%** caps (S&P DJI announcement 1484596, 20 Aug 2026) |
| 3 | S&P Shariah | **PASS** | 2.4% / 4.2% of 36m MCAP; AR 0.9% (< 49%); NPI ex-interest 2.8% |
| 4 | MSCI Islamic | **FAIL** | Cash + IBS **38.2% of TA** > 33.33% (new-entrant cap 30%). Debt 22.3% and (AR + cash) 18.5% pass. |
| 5 | MSCI Islamic M-Series | **PASS** | All three ratios < 5% of average MCAP (window to confirm in the rulebook; passes on any) |
| 6 | FTSE Shariah (IdealRatings) | **BORDERLINE** | Ratios pass on 24m MCAP (v1.4 guide). Activity test counts music, film/TV and insurance broking whole-line: interest 0.90 + Music 2.14 + Apple TV 0.96 + video 0.32 + insurance 0.41 + social casino 0.32 + Apple Card 0.11 = **~5.2%** on these estimates — on the cap, within estimate error. Observed: the FTSE USA Shariah index (HLAL) holds Apple at ~13% (N-PORT, 31 May 2026). |
| 7 | Securities Commission Malaysia | **FAIL** | Cash in conventional accounts and instruments 38.2% of TA > 33% |
| 8 | OJK / DSN-MUI | **PASS** | Interest debt 22.3% of TA (≤ 45%); non-halal income ~3.7% (≤ 10%) |
| 9 | SECP Pakistan (KMI) | **PASS** (narrow) | IB debt 22.3% (< 37%); non-compliant investments 31.2% of TA (< 33% — fails at 38.2% if bank cash is counted); illiquid assets 46.4% (≥ 25%); net liquid assets per share negative (< price); NPI 3.7% |
| 10 | Maz Vantage — Scenario A | **PASS** | All gates |
| 11 | Maz Vantage — Scenario C | **FAIL** | R11 38.2%; NPI 5.58% |
| 12 | Maz Vantage — Strictest | **FAIL** | R11 38.2%; R19 25.6%; NPI 5.99% |

**Tally: 7 PASS · 1 BORDERLINE · 4 FAIL → "split" (6–9).** The pattern is one fact seen through two denominators: every market-cap screen passes; every total-asset cash screen fails.

---

## 17. Competitor comparison (reconciled, not averaged)

| Source | Status | Reconciliation |
|---|---|---|
| **Musaffa** | HALAL (AAOIFI method, Aug 2026); an earlier portfolio page graded Apple C+ (Mar 2025) | Agrees with our AAOIFI-literal column (#1). Musaffa's AAOIFI method is market-cap based, so it does not run the total-asset alternative Maz Vantage's Scenario B adds — the whole difference to our Scenario B. Its NPI figure is not published at line level; not reconciled. |
| **Zoya** | Shariah-compliant (undated page; internally inconsistent wording) | Shows Apple's FY2025 interest income as **$0** — the same artefact as Maz Vantage's reference data (§5). Apple's interest income is undisclosed, not zero (~$4.2b). An older Musaffa Academy article reported a Zoya "questionable, 18% non-halal" label (undated) — superseded, footnoted only. |
| **FTSE USA Shariah (HLAL)** | Constituent, ~13.2% weight | Consistent with IdealRatings' market-cap ratios. On whole-line music/film counting our estimates put Apple at ~5.2% — IdealRatings evidently sizes the media lines lower (Apple discloses none). |
| **MSCI USA Islamic** | Apple absent from an MSCI USA Islamic tracker's top ten (HSBC, Apr 2026) | Consistent with our MSCI FAIL on the TA cash ratio — an inference from holdings, not a confirmed constituent list. |

---

## 18. G-flags (Gate 5 governance register — never change a verdict)

1. **Apple Insurance Company, Inc. (Arizona)** — significant subsidiary in Exhibit 21; business undisclosed (captive or AppleCare reimbursement insurer most likely).
2. **Regulatory and litigation:** EU DMA Article 5(4) fine €500m (Apr 2025, appealed) and open Article 6(4) case (fines up to 10% of worldwide sales); US DOJ monopolisation suit (Mar 2024); Epic contempt injunction — Ninth Circuit partly upheld (Dec 2025), **Supreme Court granted review 30 Jun 2026**. No interest accrues on any of these (Δ4: no L7).
3. **Google dependence:** search-licensing revenue is subject to the D.C. Circuit appeal of the September 2025 remedies.
4. **Apple Card** issuer transition to JPMorgan Chase (~24 months from Jan 2026); Apple-branded savings to be re-launched by Chase.
5. **Disclosure regression:** gross interest income/expense dropped after FY2023; goodwill not presented since FY2017; no Services breakdown.
6. Single class of common stock; no controlling holder.

---

## 19. Monitoring triggers

1. **R11 below 33% of total assets** (now 38.2%) → Sc B Gate 2 passes and Sc B is then decided by Gate 4, whose result is band-sensitive (§12) — a firmer sizing pass would be needed before any Sc B PASS.
2. **R19 below 25%** (~$3b net repayment; $11.0b of notes mature within a year) — lifts one of Strictest's two Gate-2 fails.
3. **FY2026 10-K** (due ~late October 2026): updated lease liabilities, Exhibit 21, the Q2 intangible addition, and any return of an interest-income line → **re-screen on filing**.
4. **Google search case** (D.C. Circuit) — a ban on default payments would remove the largest Δ31 line (−0.7pp at Sc B, −1.1pp at Sc C).
5. **App Store commission rulings** (Epic at the Supreme Court; EU DMA) — move the social-casino and gacha lines.
6. **Apple Card / JPMorgan terms**, and any Apple-originated lending (a revived Pay Later would be L7 and potentially a U2 question).
7. Quarterly re-review cadence (§1): next scheduled with the Q1 FY2027 10-Q (~late January 2027).

---

## 20. Open scholarly questions (for the 7 January 2027 review)

1. **Traffic-acquisition revenue as advertising (Δ31).** Is a revenue share of a third party's search ads (Google → Apple) "advertising pass-through"? Applied here as yes; Apple's own 10-K files it under advertising.
2. **Payment rails (§52 proposal).** Attribute Apple Pay fees by the product bought (applied — Δ31's "never by the advertiser's identity") or by the paying bank? Sensitivity +0.5pp (Sc B) / +0.9pp (Sc C).
3. **Manufacturer service contracts (§31).** AppleCare as an IIFA Resolution 103 maintenance contract (Tier 0, applied) or as *gharar*-laden commercial insurance / sale of *ḍamān*? Sensitivity +1.8–2.1pp. Related: what Apple Insurance Company, Inc. underwrites.
4. **Insurance intermediation at Sc A.** Applied as Tier 1 in every scenario (agency in a prohibited contract), not given Δ31's Sc A *ijārah* carve-out. Ratify.
5. **Music as the product** (§0.5 #2, §39(vi)) — Apple Music is sized at the placeholder archetype; reading (a) adds +1.5–1.7pp under Scenario C and Strictest.
6. **Loot boxes without cash-out** (§52) — shown at 0/50/100%; does not decide any verdict here.
7. **Platform take from mature-rated content** (M-rated games, mature SVOD apps billed through IAP), **dating apps** and **e-books** (Apple Books romance/erotica) — §52 is silent on F12 content at the platform level; not sized.
8. **§60 corrections:** row 6 should describe FTSE IdealRatings (24-month MCAP; music, film, insurance broking and TV/press/billboard advertising excluded whole-line), with FTSE Yasaar's total-asset ratios as a separate note; row 2's DJIM caps are 30% from the September 2026 rebalance (announcement 1484596). The S&P Shariah announcement (1484595) could not be read (403); its 30% leverage cap remains unverified.
9. **Undisclosed interest (Layer 1).** For an issuer that reports only a netted non-operating line, should Maz Vantage standardise the yield-route estimate used here (average balances × book yield, cross-checked to the net line)?

---

## 21. Final verdict matrix

| Gate | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| G1 Categorical | PASS | PASS | PASS | PASS |
| G2 Financial ratios | PASS | **FAIL** — R11 38.23% > 33% | **FAIL** — R11 > 30% | **FAIL** — R11 > 25%; R19 25.59% > 25% |
| G3 Hidden interest | PASS — 0.90% (est.) | PASS — 0.90% | PASS — 1.03% | PASS — 1.03% |
| G4 Revenue purity | PASS — 2.61% | PASS — 3.68% (band-sensitive) | **FAIL** — 5.58% (band-sensitive) | **FAIL** — 5.99% > 3% |
| G5 Disclosure | Screenable — estimated components; G-flags §18 | same | same | same |
| **Verdict** | **PASS** | **FAIL** | **FAIL** | **FAIL** |

---

## 22. Recommendations and caveats

**Recommendations.**
- *Scenario A:* Apple is investable. Purify ~**$0.38 per share per year** on the TTM basis — about $0.05 of it on receipt of dividends and the rest annually or at sale per the investor's school.
- *Scenario B · AAOIFI (preferred), Scenario C and Strictest:* not compliant on the current balance sheet. The decisive and *verifiable* fact is R11 (38.2% of assets in cash and interest-bearing securities), which no Gate-4 estimate can change. Legacy holders exiting should purify at the figures in §14.
- *Index-tracking investors* should note why products disagree: market-cap screens (AAOIFI literal, DJIM, S&P, FTSE IdealRatings, MSCI M-Series) pass Apple; total-asset screens (MSCI Islamic, SC Malaysia, Maz Vantage's Scenarios B, C and Strictest) fail it.
- *Maz Vantage app:* the quick screen on the Shariah tab reads "cash and short-term investments" and so misses non-current debt securities; for Apple that turns a 38.2% total-asset cash ratio into 16.3%. The tab's footnote now says so; a data fix (adding non-current debt securities) is a separate change.

**Caveats.**
- **Every Gate-4 line and Layer 1 are estimates.** Apple discloses no per-service revenue and no interest income; bands are stated and the robustness test (§12) says where the verdict depends on them. The Sc A PASS and all three FAILs are robust (the FAILs rest on Gate 2); the Gate-4 results at Sc B and Sc C are not.
- Δ19 asks for three independent sources for contested rates. The advertising-mix shares (finance/insurance, gambling, alcohol in search and app-store ads) rest on fewer — WordStream's last public Google vertical split (finance & insurance ~11%, 2011) and the app-store ad policies — and are labelled **ESTIMATED — WIDE BAND**.
- Lease liabilities are the 27 Sep 2025 figures; goodwill is a placeholder. Neither changes a verdict.
- Market-cap history uses Maz Vantage's price series with cover-page share counts interpolated monthly; reconciled to Apple's disclosed repurchase prices.
- Length is below §63's 16,000–22,000-word guide for a complex multi-segment issuer: the decisive finding is a single balance-sheet ratio, and the Gate-4 lines cannot be taken further without paid app-intelligence data (Sensor Tower / AppMagic title-level revenue) or an Apple disclosure.
- This is a screening opinion under Maz Vantage's Shariah methodology, not a fatwa and not investment advice.

---

## Appendix A — Market capitalisation, month-end (US$ billions)

Shares: cover-page counts (15,552.8m at 20 Oct 2023 → 14,594.2m at 17 Jul 2026), interpolated by date.

| Month | Close ($) | Shares (m) | MCAP ($b) | | Month | Close ($) | Shares (m) | MCAP ($b) |
|---|---|---|---|---|---|---|---|---|
| Oct 2023 | 170.77 | 15,539.4 | 2,653.7 | | Apr 2025 | 212.50 | 14,923.2 | 3,171.2 |
| Nov 2023 | 189.95 | 15,502.8 | 2,944.8 | | May 2025 | 200.85 | 14,891.8 | 2,991.0 |
| Dec 2023 | 192.53 | 15,467.5 | 2,978.0 | | Jun 2025 | 205.17 | 14,859.3 | 3,048.7 |
| Jan 2024 | 184.40 | 15,427.7 | 2,844.9 | | Jul 2025 | 207.57 | 14,831.2 | 3,078.5 |
| Feb 2024 | 180.75 | 15,393.3 | 2,782.3 | | Aug 2025 | 232.14 | 14,810.8 | 3,438.2 |
| Mar 2024 | 171.48 | 15,360.1 | 2,634.0 | | Sep 2025 | 254.63 | 14,788.3 | 3,765.5 |
| Apr 2024 | 170.33 | 15,318.4 | 2,609.2 | | Oct 2025 | 270.37 | 14,761.7 | 3,991.1 |
| May 2024 | 192.25 | 15,274.1 | 2,936.4 | | Nov 2025 | 278.85 | 14,732.4 | 4,108.1 |
| Jun 2024 | 210.62 | 15,234.1 | 3,208.6 | | Dec 2025 | 271.86 | 14,697.9 | 3,995.8 |
| Jul 2024 | 222.08 | 15,192.5 | 3,373.9 | | Jan 2026 | 259.48 | 14,682.1 | 3,809.7 |
| Aug 2024 | 229.00 | 15,163.4 | 3,472.4 | | Feb 2026 | 264.18 | 14,684.0 | 3,879.2 |
| Sep 2024 | 233.00 | 15,133.3 | 3,526.1 | | Mar 2026 | 253.79 | 14,686.2 | 3,727.2 |
| Oct 2024 | 225.91 | 15,102.4 | 3,411.8 | | Apr 2026 | 271.35 | 14,674.0 | 3,981.8 |
| Nov 2024 | 237.33 | 15,072.6 | 3,577.2 | | May 2026 | 312.06 | 14,644.4 | 4,569.9 |
| Dec 2024 | 250.42 | 15,039.6 | 3,766.2 | | Jun 2026 | 289.36 | 14,611.6 | 4,228.0 |
| Jan 2025 | 236.00 | 15,008.8 | 3,542.1 | | Jul 2026 | 308.91 | 14,594.2 | 4,508.3 |
| Feb 2025 | 241.84 | 14,982.3 | 3,623.3 | | Aug 2026 | 316.85 | 14,594.2 | 4,624.2 |
| Mar 2025 | 222.13 | 14,952.9 | 3,321.5 | | Sep 2026 | 333.02 | 14,594.2 | 4,860.2 |
| | | | | | **7 Oct 2026 (spot)** | **336.57** | **14,594.2** | **4,912.0** |

Averages: 12m **4,190.3** · 24m **3,792.4** · 36m **3,527.3**.

## Appendix B — Sources

**SEC (primary).** 10-K FY2025 <https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm> · Exhibit 21 <https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/a10-kexhibit21109272025.htm> · 10-Q Q1 FY2026 <https://www.sec.gov/Archives/edgar/data/320193/000032019326000006/aapl-20251227.htm> · 10-Q Q2 FY2026 <https://www.sec.gov/Archives/edgar/data/320193/000032019326000013/aapl-20260328.htm> · 10-Q Q3 FY2026 <https://www.sec.gov/Archives/edgar/data/320193/000032019326000020/aapl-20260627.htm> · 10-Q Q3 FY2025 <https://www.sec.gov/Archives/edgar/data/320193/000032019325000073/aapl-20250628.htm> · Q3 FY2026 results <https://www.sec.gov/Archives/edgar/data/320193/000032019326000018/a8-kex991q3202606272026.htm> · XBRL company facts <https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json>

**Sizing evidence.** AppMagic 2025 monetization (casino) <https://gamedevreports.substack.com/p/appmagic-mobile-games-monetization> · AppMagic casual H1 2025 <https://appmagic.rocks/research/casual-report-h1-2025> · Sensor Tower State of Mobile 2026 <https://9to5mac.com/2026/01/21/sensor-towers-state-of-mobile-2026-tiktok-dominates-ai-apps-surge-games-lose-ground/> · Juniper loot boxes <https://www.businesswire.com/news/home/20210308005767/en/Juniper-Research-Video-Game-Loot-Boxes-to-Generate-over-%2420-Billion-in-Revenue-by-2025-but-Tightening-Legislation-Will-Slow-Growth> · Google $20b (2022) <https://www.phonearena.com/news/google-paid-apple-20-billion-in-2022-to-be-default-safari-search-engine_id157925> · Bernstein $18–20b <https://www.theregister.com/2023/10/10/google_pays_apple_18_20_claims_bernstein/> · WordStream Google verticals <https://wordstream.com/blog/ws/2012/01/23/google-revenues> · Apple ads forecasts <https://searchengineland.com/apples-ad-business-may-reach-6b-by-2025-385837>, <https://pulse2.com/jpmorgan-apple-annual-ad-revenue-2025/> · Apple Music (MIDiA via) <https://sqmagazine.co.uk/apple-music-subscriber-statistics/> · Apple TV+ <https://au.variety.com/2025/digital/news/apple-tv-plus-streaming-losses-1-billion-per-year-21094/> · AppleCare+ UK terms <https://www.apple.com/legal/sales-support/applecare/applecareplus/docs/applecareplus_uk_idd.html> · AppleCare+ Theft & Loss (US) <https://www.apple.com/shop/product/sx4q2ll/a/applecare-with-theft-and-loss-for-iphone-air> · AppleCare revenue <https://www.warrantyweek.com/archive/ww20211104.html> · Apple Card → JPMorgan <https://www.mactrast.com/2026/01/jpmorgan-chase-reaches-deal-to-take-over-apple-card-from-goldman-sachs/> · Apple Pay economics <https://www.pymnts.com/?p=132214>, <https://www.phonearena.com/news/Apple-Pay-could-generate-4-billion-in-gross-by-2023_id113975> · Apple Ads policies <https://ads.apple.com/policies>

**Standards and competitors.** S&P DJI DJIM update (20 Aug 2026) <https://www.spglobal.com/spdji/en/documents/indexnews/announcements/20260820-1484596/1484596_djim-indices-update-20260820.pdf> · S&P Shariah update <https://www.spglobal.com/spdji/en/documents/indexnews/announcements/20260820-1484595/1484595_sp-shariah-indices-update-20260820.pdf> (not readable: 403) · FTSE IdealRatings screening v1.4 <https://www.lseg.com/content/dam/ftse-russell/en_us/documents/policy-documents/ftse-idealratings-islamic-indexes-screening-guide.pdf> · MSCI Islamic methodology <https://www.msci.com/eqb/methodology/meth_docs/MSCI_May16_Islamic_Indexes_Methodology.pdf> · HLAL holdings <https://equibles.com/etfs/hlal> · Musaffa AAPL <https://musaffa.com/stock/AAPL/> · Zoya AAPL <https://zoya.finance/tr/stocks/aapl>
