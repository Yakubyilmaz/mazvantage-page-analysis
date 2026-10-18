# Hidden interest — Shariah screening reports: ADP, Airbnb, Deere

**Methodology:** v5.0 (with interim deltas Δ40–Δ48, 18 October 2026; Δ41–Δ48 came out of these three screens). **Screened:** 18 October 2026.
**Records in the app:** `web/src/lib/shariah-issuers-hidden-interest.ts` (the Shariah tab of each company reads them; `tests/shariah-hidden-interest.test.ts` pins them).

## Why these three

A feed-level sweep on 18 October 2026 looked for interest that does not appear in a plain "interest income" line: interest booked as revenue, interest on customers' money, and lending arms inside industrial companies. Most screeners read only the interest-income line, so they pass these companies. The three most widely held suspects were screened in full from their filings:

| Company | Where the interest hides | Verdict (all four scenarios) |
|---|---|---|
| **ADP** | Interest on payroll funds clients hand over before payday, booked as revenue | **FAIL** |
| **Airbnb** | Interest on its cash and on guests' payments it holds between booking and check-in | **FAIL** (narrowly) |
| **Deere** | John Deere Financial, a captive lender to the farmers and dealers who buy the equipment | **CATEGORICAL FAIL** |

---

## 1. ADP (Automatic Data Processing, Inc.)

**Period:** fiscal 2026, twelve months to 30 June 2026. **Source:** FY2026 Form 10-K (accession 0000008670-26-000030).

| Gate | Finding | Result |
|---|---|---|
| 1 Business | Payroll, HR and benefits services (Employer Services $14,831.4m; PEO $7,128.1m). ADP Indemnity, its own insurer, covers PEO workers' compensation, inside the PEO segment and estimated at 1.5–4% of revenue. | Pass, G-flag |
| 2 Balance sheet | Cash + IBS $48,187.9m — $4,230.1m own cash + **$43,957.8m funds held for clients** — **49.6%** of the 12-month average market cap ($97.1b) at Sc B to Strictest. Δ43 leaves the matched client funds out at Sc A: 4.4%. Debt on Δ44 average balances (notes $4,964.1m + commercial paper $4.2b + reverse repos $3.6b) $12,764.1m: 13.1%. | **Fail** at Sc B, C, Strictest; pass at Sc A |
| 3 Hidden interest | **Layer 1 = $1,725.8m = 7.86% of revenue**: $1,354.8m interest on client funds (a revenue line; average $40,410.7m at 3.4%) + $371.0m on corporate funds. | **Fail** (every scenario) |
| 4 Revenue purity | Interest + workers' compensation underwriting (est. $330–900m) + insurance agency commissions (est. $50–200m): 11.1% (Sc A/B), 12.9% (Sc C/Strictest). | **Fail** |
| 5 Disclosure | Screenable; the insurance lines are estimates. | — |

**Open questions.**
- **Client funds as Cash + IBS** — settled by Δ43: counted at Sc B to Strictest, left out at Sc A. Gate 3 fails either way.
- **$4,607.3m of zero-margin pass-throughs** — settled by Δ47: Gate 4 counts the margin (nil); the gross reading stays a sensitivity.
- **§54 Position 3 at Scenario C and Strictest.** Should a float yield above 5% of revenue send ADP back to Gate 1? Not applied.

**What would change it.**
- Layer 1 would have to fall below $1,097m, 36% under the fiscal 2026 figure.

## 2. Airbnb, Inc.

**Period:** twelve months to 30 June 2026 (FY2025 + H1 2026 − H1 2025). **Sources:** 2025 Form 10-K (0001559720-26-000004), Q2 2026 Form 10-Q (0001559720-26-000027).

| Gate | Finding | Result |
|---|---|---|
| 1 Business | Marketplace for stays and experiences. Host Damage Protection is self-insured in part, with no premium. | Pass, G-flag |
| 2 Balance sheet | Cash + IBS $24,293m — cash $6,821m + short-term investments $5,248m + **$12,224m held on behalf of customers** — **28.9%** of the 12-month average market cap ($84.0b); at Sc A, Δ43 leaves the customer funds out (14.4%). Debt $2,476m (3.0%). | Pass at Sc A and C; **Watch** at Sc B (within 2pp of 30%); **Fail** at Strictest (25%) |
| 3 Hidden interest | **Interest income $680m = 5.17% of revenue ($13,159m).** The 10-K: interest "consists primarily of interest earned on our cash, cash equivalents" and investments, which hold corporate funds and funds held for hosts and guests. | **Fail** (every scenario), by $22m |
| 4 Revenue purity | Interest + alcohol-centred experiences (est. $5–40m): 5.28% (Sc A/B), 5.47% (Sc C/Strictest). | **Fail** |
| 5 Disclosure | Screenable; interest income is not split by source. | — |

**Notes.**
- **The data feed's 2025 revenue ($12,305m) differs from the 10-K's ($12,241m).** The filing is used.
- **Interest income is falling:** $363m in H1 2025, $338m in H1 2026.
- **What would change it.** Under $658m over twelve months clears the 5% cap, so this verdict is the one most likely to move.

## 3. Deere & Company

**Period:** twelve months to 2 August 2026 (FY2025 + 9M FY2026 − 9M FY2025). **Sources:** Q4 FY2025 results release (8-K Ex. 99.1, 0001104659-25-116130), Q3 FY2026 Form 10-Q (0001104659-26-102213), FY2025 Form 10-K (0001104659-25-122321).

| Gate | Finding | Result |
|---|---|---|
| 1 Business | Equipment is permissible, but **Financial Services (John Deere Financial) lends on its own balance sheet**: retail notes, revolving charge accounts, wholesale and lease financing. Revenues were $5,821m in FY2025, **12.7%** of $45,684m. The methodology lists captive finance arms among excluded conventional lenders (P1-FIN); a segment above 5% fails every scenario (U2). | **CATEGORICAL FAIL** |
| 2 Balance sheet | Debt $64,180m = **41.9%** of the 12-month average market cap ($153.0b). Cash + IBS includes the $49,176m loan book (§6): 38.9%. | Fail (would fail on its own) |
| 3 Hidden interest | Finance and interest income $5,526m = **11.5%** of revenue ($47,983m). | Fail |
| 4 Revenue purity | 11.5%. | Fail |
| 5 Disclosure | Screenable; finance income is not split between interest and lease rentals in the quarterly statements. | — |

**Notes.**
- **The data feed carries $0 of interest income for Deere**, so a quick screen sees no interest at all.
- **The securitization borrowings ($6,439m) are derived:** the feed's total debt less the two lines the 10-Q gives.
- **Operating lease liabilities are left out.** They would only raise the debt ratios.

---

## Caveats

- **These are screening opinions under Maz Vantage's methodology, not fatwas.** Where they differ from an index provider, the provider's own constituent list is the authority for that index.
- **Index providers' own data generally carries ADP's and Airbnb's corporate cash only.** On that reading their balance sheets pass the market-value methodologies, and the income test decides.
- **Estimates carry stated bands.** These are the insurance lines at ADP, the Experiences line at Airbnb, and the interest share of Deere's finance income. No verdict above depends on where in its band the truth sits.
