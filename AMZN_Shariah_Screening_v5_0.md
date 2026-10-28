# Amazon.com, Inc. (AMZN) — Shariah Screening Report (methodology stress test)

**Methodology:** Shariah Screening Master Methodology **v5.0**, with interim deltas Δ40–Δ48 (18 October 2026) and **Δ49–Δ60, F13 and Part XV**, which came out of this screen (28 October 2026). Δ49 and Δ56 are *proposed* and priced as sensitivities only. The other ten are interim and applied.
**Screened:** 28 October 2026 · **Issuer:** Amazon.com, Inc., CIK 0001018724 (Nasdaq: AMZN), Delaware; single class of common stock.
**Period:** the twelve months to **30 June 2026** ("TTM"), built as FY2025 + H1 2026 − H1 2025. Q3 2026 results are due 29–30 October 2026.
**Balance sheet:** 30 June 2026 (Q2 2026 10-Q), with the three earlier quarter-ends for trend.
**Market cap:** month-end closes October 2023 – September 2026 plus the 27 October 2026 close (Appendix A).
**User locks applied:**
- **U1** (GLP-1 and ED) — applied to Amazon Pharmacy.
- **U3** (capital gains documented, not capped) — applied to the Anthropic, OpenAI, Rivian and Affirm marks.
- **U4** (look-through) — applied to Anthropic and OpenAI.
- **U9** (media defaults) — applied to Prime Video, MGM and Twitch.
- **U11** (the Gate-1 list cannot be overridden) — respected.

**Record in the app:** `web/src/lib/shariah-issuers-amazon.ts` (AMZN's Shariah tab reads it); `web/tests/shariah-amazon.test.ts` pins every figure below. The engine, `web/src/lib/shariah-v5.ts`, gained Δ50 (an optional `level3Gains`) and Δ58 (an optional `nonOperatingGains`). No other record carries either field, so no other verdict moved, and the suite passes: 745 tests.

---

## 1. Why Amazon

The record so far tests the methodology one sector at a time: pharma, media, a payroll float, a captive lender, Apple's platform. Amazon touches every part of it at once, and it was the largest name in US Shariah funds until 2025. It is:
- a grocer selling alcohol and pork (§49);
- a marketplace taking fees on other people's sales of both (new: Δ53);
- a pharmacy dispensing GLP-1s (U1);
- a studio, a streaming service, a music service and a live-streaming site (Part VII);
- a $76b advertiser with sportsbooks and brewers among its buyers (Δ31, Δ32);
- a cloud renting capacity to banks, insurers and a sportsbook (no rule existed: Δ56);
- a partner in card programmes and to a buy-now-pay-later lender (Δ46, Δ55);
- an insurance agent (§31);
- the owner of a lender in India (L7);
- the holder of the two largest private AI stakes on any balance sheet (U4; new: Δ49, Δ50, Δ57, Δ58).

**What the 10-K never says.** A keyword pass over the FY2025 10-K (288,758 characters of text) found:

| Word or phrase | Occurrences | Where the activity actually is |
|---|---|---|
| alcohol, wine, beer, spirits, liquor | **0** | Physical stores, online stores, the marketplace, advertising |
| pork, bacon, gelatin | **0** | Physical and online grocery |
| gambling, betting, casino, sportsbook, lottery | **0** | Prime Video (FanDuel), Twitch, the Appstore, advertising, AWS |
| tobacco, nicotine, cannabis | **0** | — prohibited in Amazon's own listing policies (a negative finding, §3.F) |
| lending, loans to customers, pay later, BNPL | **0** | Axio (India), Synchrony Pay Later, Affirm, seller lenders |
| underwriting, warranty | **0** | Amazon Protect, Amazon Pay India's insurance agency |
| Whole Foods | **0** | Inside "Physical stores" |
| co-brand(ed) | 3 | "Other revenue includes … our co-branded credit card agreements" |
| interest income | 4 | The one impure line Amazon discloses by name |

So every finding below rests on reading what the categories contain, and on sources outside the filing.

---

## 2. TL;DR

| Scenario | Verdict | Deciding gate(s) | Gate 4 NPI (cap) | Purification / share (TTM) |
|---|---|---|---|---|
| Scenario A | **PASS** | All five gates pass | 1.96% (5%) | $0.42 |
| **Scenario B · AAOIFI** (preferred) | **PASS** | All five gates pass | 2.49% (5%) | $0.46 |
| Scenario C | **PASS** — monitoring | All five gates pass; 0.72 points under the cap | 4.28% (5%) | $0.57 |
| Strictest | **FAIL** | Gate 2, R19: debt with leases 27.25% of total assets without the Anthropic mark-ups (Δ50) > 25%; Gate 4: 4.78% > 3% | 4.78% (3%) | $0.60 |

**The balance sheet passes at A to C, and it is not where the risk sits.** Debt is 5.9% and cash and securities 4.7% of the 12-month average market value. Interest income is 0.60% of revenue.

**The risk is in thirty lines Amazon never names.** Together they are 2.5% of revenue at Scenario B and 4.3% at Scenario C.

**Three unsettled readings decide Scenario C.** Each would carry it over 5% on its own (§20):
- the Anthropic note conversions read as qarḍ with a benefit to the lender (Δ49, proposed);
- AWS capacity rented to banks, insurers and sportsbooks (Δ56, proposed);
- the strict readings of the open music and books elections, taken together.

**Two of them together carry Scenario B over as well:** Δ49 + Δ56 give 5.15%.

**Strictest fails twice.** Its income cap is 3%, and its debt test passes only because $172.4b of unrealised Anthropic mark-ups sit in total assets. At 31 March 2026, before most of those mark-ups, debt with leases was already 25.70% of total assets as reported.

---

## 3. Every prohibited or doubtful line, and the words that hide it

US$ millions in the twelve months to 30 June 2026. Sizes are the point (Sc A and B) and the conservative edge (Sc C and Strictest, D9).

### 3.A Interest and conventional finance

| # | Line | Where it hides (filing words or the outside source) | Rule | Size: point (band) | A | B | C | S |
|---|---|---|---|---|---|---|---|---|
| 1 | Interest income (Layer 1) | "Interest income" — the one named line. It is earned on $40.8b of money-market funds, $59.4b of corporate debt, $4.5b of US government and $1.7b of asset-backed securities at ~3.7–4.0%, and on affordable-housing loans | Gate 3, D5 | 4,660 (disclosed) | 4,660 | 4,660 | 4,660 | 4,660 |
| 2 | **Axio — Amazon's own lender in India** | Not in the 10-K. Acquired 4 September 2025 after RBI approval; a non-bank lender (checkout credit, small-business loans) that powers Amazon Pay Later | Layer 7; U2 (far below 5%) | 65 (40–110) | 65 | 65 | 110 | 110 |
| 3 | **Co-brand and store cards** | "Other revenue includes … our co-branded credit card agreements" (10-K, revenue note). Chase issues Prime Visa. Synchrony pays partners a share of programme profit above a threshold (~$4.0b across all partners in 2025), and in 2025 added interest-bearing "Pay Later" loans on Amazon carts of $50+. The risk factors add "credit accounts (including promotional financing)" | Δ46 | 1,300 (700–2,200) | 0 | 1,300 | 2,200 | 2,200 |
| 4 | **Affirm warrants for new borrowers** | Not in Amazon's filings. Affirm's 10-K: warrants over 22m shares vest as Amazon customers take their first Affirm loan. The strike was cut to $63.06 from $100 with a November 2025 amendment, and Affirm expensed $199.9m for FY2026 | Δ55 (Δ46 rates) | 200 (150–260) | 0 | 200 | 260 | 260 |
| 5 | Referrals to seller lenders | Amazon stopped lending to sellers itself on 6 March 2024. Parafin, Lendistry, SellersFi and Slope now lend inside Seller Central; any referral fee is undisclosed | Δ46 | 20 (0–60) | 0 | 20 | 60 | 60 |
| 6 | Insurance distribution | Not in the 10-K. Amazon Protect plans are underwritten by insurers (London General / The Warranty Group in the UK and EU). Amazon Pay India holds an IRDAI composite corporate-agent licence (motor cover from HDFC ERGO, ACKO and ICICI Lombard; travel) | §31, Δ54 | 250 (100–500) | 250 | 250 | 500 | 500 |
| 7 | Amazon Pay merchant fees on P1 purchases | Amazon Pay on other merchants' sites. In India this includes bill payments for loan instalments and insurance premiums | §52 (mirrors Δ31) | 700 base × 2–5% | 14 | 21 | 60 | 60 |

### 3.B Alcohol

| # | Line | Where it hides | Rule | Size | A | B | C | S |
|---|---|---|---|---|---|---|---|---|
| 8 | Alcohol in Whole Foods and other physical stores | "Physical stores" ($23.0b), about 90% Whole Foods (~530 stores). Beer and wine; spirits where state law allows; taprooms in some stores | P1-ALC, §49 | 1,093 (690–1,496): 4.75% of sales, band 3–6.5% | 1,093 | 1,093 | 1,496 | 1,496 |
| 9 | Alcohol sold by Amazon online | "Online stores … a wide selection of consumable and durable goods". Amazon is the retailer of wine, beer and spirits in the UK, Germany, Japan and other European stores, and delivers beer and wine with grocery orders where licensed | P1-ALC, §49 | 1,300 (700–2,200) | 1,300 | 1,300 | 2,200 | 2,200 |
| 10 | Marketplace take on third-party alcohol | "Third-party seller services … commissions and any related fulfillment and shipping fees". Seller policy: alcohol only from "pre-approved selling partners" (US); wine under an authorisation and customs licence (Italy) | Δ53 | 300 (120–700) | 300 | 300 | 700 | 700 |

### 3.C Pork, unslaughtered meat, ingredients of unknown source

| # | Line | Where it hides | Rule | Size | A | B | C | S |
|---|---|---|---|---|---|---|---|---|
| 11 | Pork in physical stores | "Physical stores": meat counters, bacon, ham, sausage, deli and prepared foods | P1-PRK, §49 | 633 (460–920): 2.75% of sales | 633 | 633 | 920 | 920 |
| 12 | Pork online and the marketplace take | Same-day perishables in 1,000+ US cities (2025), monthly customers up 50%+ in H1 2026; center-aisle cured and canned pork | P1-PRK, §49, Δ53 | 450 (250–800) | 450 | 450 | 800 | 800 |
| 13 | Gelatin of unstated source | Gummies, marshmallows and capsules sold first- and third-party | §48 mushbooh row, Δ60 | 2,000 base × 0 / 0 / 2.5 / 5% | 0 | 0 | 75 | 150 |
| 14 | Meat not slaughtered Islamically | Whole Foods meat and poultry (no zabīḥah range) and online fresh meat | D13 (Sc C and Strictest only) | 2,656 (1,896–3,631) | 0 | 0 | 3,631 | 3,631 |

### 3.D Media content (F12)

| # | Line | Where it hides | Rule | Size | A | B | C | S |
|---|---|---|---|---|---|---|---|---|
| 15 | **Prime Video inside Prime** | "Subscription services … annual and monthly fees associated with Amazon Prime memberships, as well as digital video …". Prime fees are not allocated between benefits; video's slice is set by relative standalone price (Δ52) | Δ28, Δ52, SVOD archetype 30/35/40/50% | 9,500 (7,000–13,000) | 2,850 | 3,325 | 5,200 | 6,500 |
| 16 | Rentals, purchases and Channels | "Online stores … digital media content where we record revenue gross"; Channels inside subscriptions | Studio archetype 18/22/28/38% | 3,000 (2,000–4,500) | 540 | 660 | 1,260 | 1,710 |
| 17 | MGM and other licensing | "Other revenue … certain licensing and distribution of video content" | Studio archetype | 1,500 (800–2,500) | 270 | 330 | 700 | 950 |
| 18 | Amazon Music | "… digital music … subscription services" | Music placeholder 20/25/30/40% (§39(vi)) | 4,500 (3,500–6,000) | 900 | 1,125 | 1,800 | 2,400 |
| 19 | Twitch subscriptions and Bits | "programs that allow … Twitch streamers … to publish and sell content" | F12 by analogy, blended slate | 1,200 (900–1,500) | 216 | 264 | 420 | 570 |

### 3.E Advertising and gambling

| # | Line | Where it hides | Rule | Size | A | B | C | S |
|---|---|---|---|---|---|---|---|---|
| 20 | Sponsored ads on Amazon's own stores | "Advertising services … sponsored ads, display, and video advertising" — ~72–85% is on-store retail media | **Δ51**: the store's own mix — 0.3% (to 0.7%) alcohol and pork | 59,300 (54,800–64,700) | 178 | 178 | 453 | 453 |
| 21 | Video ads (Prime Video, Twitch, Fire TV, IMDb) | Same line; Prime Video ads began January 2024; Twitch began **gambling ads** in the US in February 2026 | Δ31: alcohol + sportsbooks 7.5% (to 10%) at Sc A; + finance and insurance at Sc B+ (17.5%, to 22%) | 5,500 (3,500–8,500) | 413 | 962 | 1,870 | 1,870 |
| 22 | Display and off-Amazon ads (DSP) | Same line | Δ31, digital benchmarks 6% → 16% (to 9% → 21%) | 11,200 (7,900–12,800) | 672 | 1,792 | 2,688 | 2,688 |
| 23 | **Sportsbook integration on Prime Video** | Not in the 10-K. FanDuel is the "official odds provider" of NBA and WNBA on Prime Video (30 September 2025): odds overlays, on-screen tracking of linked bets, and a Prime analyst as FanDuel ambassador | **Δ32** (Tier 1, structural) | 60 (25–120) | 60 | 60 | 120 | 120 |
| 24 | Social-casino apps on Fire devices | The Appstore stays on Fire tablets and TV (it left Android phones in August 2025); casino titles rank among the top grossing | §52, P1-GMB | 70 (30–150) | 70 | 70 | 150 | 150 |
| 25 | Gambling streams on Twitch | "Slots & Casino", poker and sports betting from licensed operators (policy since October 2022) | P1-GMB | 15 (5–40) | 15 | 15 | 40 | 40 |

### 3.F Pharmacy, adult-adjacent goods, look-through, and what was not found

| # | Line | Where it hides | Rule | Size | A | B | C | S |
|---|---|---|---|---|---|---|---|---|
| 26 | GLP-1 and ED medicines | The 10-K mentions pharmacy once. Amazon Pharmacy stocks the Wegovy and Foundayo pills, delivers LillyDirect orders and dispenses GLP-1s to Medicare patients; One Medical offers pay-per-visit ED care | U1 lock: 0 / 0 / 30% / 100% | 700 (350–1,200) | 0 | 0 | 360 | 1,200 |
| 27 | Sexual-wellness goods | Online stores and the marketplace | Tier 3 (contextual) | 500 (300–800) | 0 | 0 | 120 | 320 |
| 28 | **Anthropic look-through** | "Upward adjustments relating to equity investments in private companies" ($62.8b in H1 2026). Anthropic's own S-1 shows interest at **7.2% of its revenue** (would fail Gate 3) | U4, **Δ57** | 171 (143–228): 12% × $1,427m | 171 | 171 | 228 | 228 |
| 29 | OpenAI look-through | "Preferred stock in OpenAI" — $28.7b in H1 2026, then $21.3b more; OpenAI's financials are private | U4, Δ57 | 60 (20–150) | 60 | 60 | 150 | 150 |
| 30 | Loot boxes in Amazon Games titles | Lost Ark and Throne and Liberty (published in the West) and New World | §52 open election | 250 (120–500) | — | — | 0 / 250 / 500 | 0 / 250 / 500 |
| | **Total (open election out)** | | | | **15,180 · 1.96%** | **19,307 · 2.49%** | **33,231 · 4.28%** | **37,093 · 4.78%** |

**Looked for and not found** (recorded so the next screen does not re-search):
- **Tobacco and nicotine:** prohibited in Amazon's listing policy, first- and third-party; FDA-approved cessation products are allowed (Tier 0).
- **Amazon's own seller loans:** ended 6 March 2024; any residual servicing ran off before the window.
- **Real-money betting placed on Prime Video:** not offered — bets are placed on FanDuel's own platform.
- **Interest on the Anthropic notes:** they are "non-interest-bearing rollover notes" (Anthropic S-1).
- **Gambling or adult stakes among Amazon's public equities:** Amazon's 13F at 30 June 2026 lists Allegiant, Astera Labs, Beta Technologies, Marvell, Rivian and X-energy — none is P1.

### 3.G Lines that are not prohibited, and why

| Line | Where | Treatment |
|---|---|---|
| Gift-card breakage | Unredeemed gift cards $5.6b | Tier 0 — the issuer's own liability, no interest |
| Self-insurance ($10.4b, mostly automobile liability) | "Self-insurance liabilities" | Tier 0 — insurance of its own operations (§31) |
| A-to-z Guarantee; indemnity of customers for product-liability claims on third-party sales | Risk factors | Δ48: a free guarantee with risk retained → G-flag |
| Energy contracts and FX hedges | Derivatives note | Tier 0 (commercial hedging, L6) |
| Prime Video sport (TNF, NBA, NASCAR) | Subscription and advertising | Tier 0 content; its gambling and advertising are lines 21–23 |
| Amazon Monthly Payments (0% instalments on devices) | Payment methods | Tier 0 while no interest, fee or penalty accrues (Part XV) |
| Satellite launch deposits (Amazon Leo) | Other assets | Prepayments, not interest-bearing |
| Restricted cash for "amounts due to third-party sellers" | Note 1 | Inside Cash + IBS; Δ43 would carve it at Sc A if a matched obligation were disclosed (it is not) |

---

## 4. Financial summary (TTM to 30 June 2026)

| Line | FY2025 | H1 2025 | H1 2026 | TTM |
|---|---|---|---|---|
| Net sales | 716,924 | 323,369 | 382,125 | **775,680** |
| Operating income | 79,975 | 37,576 | 51,313 | 93,712 |
| Interest income | 4,381 | 2,151 | 2,430 | **4,660** |
| Interest expense | (2,274) | (1,057) | (2,114) | (3,331) |
| Other income (expense), net | 15,229 | 3,866 | 69,062 | **80,425** |
| Pre-tax income | 97,311 | 42,536 | 120,691 | 175,466 |
| Tax | 19,087 | 7,231 | 27,759 | 39,615 (22.6%) |
| Net income | 77,670 | 35,291 | 92,902 | **135,281** |
| Diluted EPS | $7.17 | $3.27 | $8.53 | $12.43 |

**By category (TTM).** Online stores 285,081 · Physical stores 23,012 · Third-party seller services 183,660 · Advertising 76,072 · Subscriptions 52,853 · AWS 148,404 · Other 6,598.
**By segment.** North America 453,670 · International 173,606 · AWS 148,404.
**By country (FY2025).** US 489,657 · Germany 45,900 · UK 43,212 · Japan 30,688 · rest of world 107,467.

**Net income nearly doubled without the business doing so.** $80.4b of other income — mostly Anthropic — is 46% of pre-tax income. That is why Δ58 exists (§13).

---

## 5. Data reconciliation (Gate 5, §XII.10)

| Field | Reference / screener figure | Filing | Effect |
|---|---|---|---|
| Interest income | 0.61% of revenue (HalalWallet, FY2025) | $4,660m TTM, 0.60% | Agrees |
| Anthropic notes | Read by screeners as interest-bearing debt securities | $97.9b at fair value, but "non-interest-bearing rollover notes" (S-1); principal $6.2b | Left out of Cash + IBS (§6); Δ49 open |
| Debt | "Long-term debt" $128.9b | $141.9b: notes incl. the $3.3b current portion inside accrued expenses, $9.3b of financing obligations inside other liabilities, $0.3b of facilities (Δ59) | Track-(a) debt +10%; every ratio still passes at A to C |
| Total assets | $1,095.7b | $923.3b without $172.4b of Anthropic mark-ups (Δ50) | Strictest debt with leases 27.25% — fail |
| Receivables | "Accounts receivable, net and other" $88.1b | Customer $49.2b; vendor $21.7b; other $9.8b; prepaid $7.4b | Only customer receivables are AR (§6) |
| Interest-bearing loans | Not shown | Affordable-housing loans ("Other assets") and Axio's book, ~$2.9b estimated | Added to Cash + IBS |
| Musaffa | Doubtful (July 2026) | Sc A–C pass, Strictest fails | Not reconciled — Musaffa publishes no line attribution (§39(iv)) |

---

## 6. Market-cap windows (§8, D16)

| Window | US$ m | Used by |
|---|---|---|
| 12-month average (Oct 2025 – Sep 2026) | 2,615,018 | Sc B; R8 at every scenario |
| 24-month average | 2,435,018 | Sc A |
| 36-month average | 2,214,564 | Sc C and Strictest (worst of the windows) |
| Spot, 27 Oct 2026 | 2,722,344 | Strictest pool (not the worst) |

---

## 7. Gate 1 — the §5 decision table

| Step | Test | Finding | Result |
|---|---|---|---|
| 1 | Primary business | Retail (North America $453.7b, International $173.6b) and cloud (AWS $148.4b) | Not P1 — pass |
| 2 | Own P1 segment > 5% (U2) | Amazon itself lends (Axio, est. $65m) and acts as an insurance agent; both under 0.1% of revenue | Pass, G-flag |
| 3 | Facilitation (Δ14) | Card and lender shares, Affirm warrants, insurance distribution, the marketplace take on alcohol, P1 ads, a sportsbook integration: ~1–3% of revenue | < 50% — standard Gate 4 |
| 4 | Sector routing | Retail §49; marketplace Δ53; media Part VII; games and Appstore §52; payments and lending §54; ads Δ31/Δ51; pharmacy U1; cloud — no rule (Δ56 proposed) | Proceed |
| 5 | Special classes | Not a health payer (One Medical is a provider), takaful operator or holding company | n/a |
| 6 | Sub-industry (Δ5, Δ13) | "Broadline retail" hides a $76b advertising business, a studio, a lender and a $224b private-stake portfolio | Re-routed — F13 decomposition |
| 7 | Client elections | None | n/a |

---

## 8. Gate 2 — the ratios at each scenario

Debt, track (a), is 155,315:
- notes 132,224 (long-term 128,894, current 3,330);
- financing obligations ~9,315;
- facilities 325;
- finance leases 13,451.

Track (b) adds operating leases of 96,320, for 251,635. Cash + IBS is 123,915: 121,015 of cash and debt securities, plus an estimated 2,900 of loans. AR is 49,200.

| Test | Sc A (24m) | Sc B (12m) | Sc C (36m, worst) | Strictest (36m, worst) |
|---|---|---|---|---|
| Debt / market cap | 6.38% ≤ 33% | 5.94% ≤ 30% | 7.01% ≤ 30% | 11.36% (track b) ≤ 25% |
| Debt / total assets | 14.18% info | 14.18% ≤ 30% | **16.82%** ≤ 30% (Δ50) | **27.25% > 25% — FAIL** (Δ50) |
| Debt / tangible market cap | 6.47% info | 6.01% info | 7.12% ≤ 30% | 11.53% ≤ 25% |
| Cash + IBS / 12m market cap | 4.74% ≤ 33% | 4.74% ≤ 30% | 4.74% ≤ 30% | 4.74% ≤ 25% |
| Cash + IBS + AR / market cap | 7.11% | 6.62% | 7.82% | 7.82% (all ≤ 50%) |
| AR / market cap | 2.02% | 1.88% | 2.22% | 2.22% |
| AR / total assets | 4.49% info | 4.49% info | 5.33% ≤ 33% | 5.33% ≤ 25% |

**The Strictest debt test, quarter by quarter.** Debt with operating leases over total assets:

| Quarter-end | As reported | Without Anthropic mark-ups (Δ50) | Mark-ups in total assets |
|---|---|---|---|
| 30 Sep 2025 | 22.04% | 23.05% | $31.9b |
| 31 Dec 2025 | 21.83% | 23.33% | $52.6b |
| 31 Mar 2026 | **25.70%** | **27.70%** | $66.2b |
| 30 Jun 2026 | 22.97% | **27.25%** | $172.4b |

The as-reported ratio fell back under 25% in Q2 2026 for one reason. Anthropic mark-ups rose $106b in a single quarter — a $50.5b upward adjustment to the preferred stock and a $55.7b rise in the notes' fair value — and swelled the asset base, while track-(a) debt rose $11b. A Level-3 estimate should not rescue a leverage test. That is Δ50, applied at Sc C and Strictest with D9's logic (the conservative edge of an estimate).

The **$25.0b of notes issued in July 2026** would put the reported ratio at 24.68%, and the Δ50 ratio at 29.17%.

---

## 9. Gate 3 — the eight layers (§12)

| Layer | Value | Note |
|---|---|---|
| L1 Interest income (gross) | $4,660m · 0.60% | Disclosed; under 5% at every scenario |
| L2 Interest expense | $3,331m · 0.43% | Under the Δ20 trigger; Q2 2026 alone was $1,314m after $66b of new notes |
| L3 Capitalised interest | not disclosed | Interest is paid "net of capitalized interest" — information only |
| L4 Pension interest | none material | |
| L5 Lease interest | ~$0.5b | $312m on finance leases and $215m on financing obligations; operating-lease interest sits in lease cost |
| L6 Derivative carry | hedging | Energy contracts and FX — Tier 0 |
| L7 Financing income | ~$65m | Axio, an RBI-registered lender owned since September 2025 |
| L8 Cash-vehicle yield | inside L1 | Money-market funds $40.8b; time deposits inside $14.5b of cash |

**Gate 3 test: (L1 + L7) / revenue = 0.61%** — pass at every scenario. Under Δ49 (proposed) the $6.8b of conversion gains would join Layer 1, giving 1.49% — still a pass.

---

## 10. Gate 4 — the four-scenario table (S8)

| Group | A | B | C | Strictest |
|---|---|---|---|---|
| Interest and own lending (1–2) | 0.609% | 0.609% | 0.615% | 0.615% |
| Card, lender and warrant shares (3–5) | — | 0.196% | 0.325% | 0.325% |
| Insurance distribution (6) | 0.032% | 0.032% | 0.064% | 0.064% |
| Alcohol (8–10) | 0.347% | 0.347% | 0.567% | 0.567% |
| Pork (11–12) | 0.140% | 0.140% | 0.222% | 0.222% |
| Gelatin, mushbooh (13) | — | — | 0.010% | 0.019% |
| Non-zabīḥah meat (14) | — | — | 0.468% | 0.468% |
| GLP-1 and ED (26) | — | — | 0.046% | 0.155% |
| Media content (15–19) | 0.616% | 0.735% | 1.209% | 1.564% |
| Advertising (20–22) | 0.163% | 0.378% | 0.646% | 0.646% |
| Gambling (23–25) | 0.019% | 0.019% | 0.040% | 0.040% |
| Payments, sexual wellness (7, 27) | 0.002% | 0.003% | 0.023% | 0.049% |
| Look-through (28–29) | 0.030% | 0.030% | 0.049% | 0.049% |
| **Total** | **1.957%** | **2.489%** | **4.284%** | **4.782%** |
| Cap | 5% | 5% | 5% | 3% |
| Other edge of the bands (§16.5) | 2.734% | 3.556% | 3.002% | 3.339% |
| Verdict holds across the band | yes | yes | yes | yes (fail) |

**The loot-box election (§52)** moves Sc C to 4.32% at 50% and 4.35% at 100%, and Strictest to 4.81% and 4.85%. It decides nothing.

**What decides Scenario C** is the media content, the advertising and the meat:
- They are 2.32 of its 4.28 points.
- The only disclosed line, interest, is 0.61.
- The verdict holds across the bands, but it does not hold across the unsettled readings (§20).

---

## 11. The Anthropic and OpenAI stakes

**What Amazon holds (30 June 2026, 10-Q Note 1 and Anthropic's S-1):**

| Instrument | Carrying value | Cash in | Notes |
|---|---|---|---|
| Anthropic convertible notes (available-for-sale, Level 3) | $97.9b fair value | $8.0b (Q3 2023 – Q4 2025) | $6.2b of principal outstanding; "**non-interest-bearing rollover notes**", reissued whenever conversion would take Amazon above **12%** of Anthropic's capitalisation; convert at the lower of a fixed price ($2.09 or $5.05) and the IPO price |
| Anthropic nonvoting preferred | $92.5b | $10.0b new (Series G and H, Q2 2026), plus notes converted in 2025–26 | Marked up $50.5b in Q2 2026 alone |
| Anthropic note facility | — | up to $20.0b ($15.0b undrawn) | Draws settle in shares at a 30-day VWAP; interest rate "N/A" (S-1) |
| OpenAI Series C preferred | ~$28.7b | $28.7b (H1 2026) + $21.3b after June | Private; no public financials |
| Equity warrants (incl. Affirm) | $4.3b | — | Gains in other income |

**Four questions, four rules:**
1. **Are the notes Cash + IBS?** No. §6 counts *interest-bearing* securities, and the S-1 is explicit that these notes bear no interest. Screeners that read them as debt securities overstate Amazon's cash ratio, from 4.7% to 8.5%. No ratio moves enough to matter.
2. **Is the conversion benefit ribā? — Δ49, proposed.** A loan may carry no stipulated benefit for the lender (AAOIFI SS 19 on qarḍ; "every loan that draws a benefit"). These notes earn nothing as interest. They earn by converting at a price fixed at signing, or the IPO price if lower: a benefit written into the loan contract.
   - Sc A can read the notes as a deferred subscription for shares (waʿd), which makes the gain equity return.
   - Sc B and stricter would read the conversion gain as Layer 1.
   - The window recognised **$6.8b** of conversion gains ($5.6b in 2025 + $4.5b in H1 2026 − $3.3b in H1 2025): +0.88 points from Scenario B. That carries Scenario C over its cap (5.16%).
   - The proposal leaves the $92.0b still unrealised in AOCI to U3 (documented, not capped), and treats the preferred stock's later mark-ups as equity gains.
3. **What does the look-through flow up? — Δ57, applied.** Anthropic is far above U4's 5% materiality and pays no dividend, so Amazon's share of the investee's impure income flows into Gate 4: 12% of $1,427m of interest, or $171m. Anthropic's S-1 also shows that it would fail Gate 3 on its own (interest 7.2% of revenue, 9.4% in 2025). The open question is whether a pro-rata flow-up is enough for a stake that fails its own screen.
4. **Do the marks belong in total assets? — Δ50, applied at Sc C and Strictest.** $172.4b of Anthropic mark-ups are Level-3 estimates on unobservable inputs. The total-asset ratios at the conservative lenses leave them out (§8).

---

## 12. Customer exposure — AWS ($148.4b) and the cloud gap

F11 tiers "the service sold, not the customer's identity", and Δ16 attributes a B2B vendor's customer mix only when a vertical reaches 50%. No AWS vertical does. So **under the rules as written AWS attributes nothing**, even though:
- FanDuel made AWS its "strategic cloud provider" in 2023, so it hosts a sportsbook's betting platform;
- banking and finance are ~20% of enterprise cloud spending.

The same methodology attributes 100% of a REIT's rent from a bank branch at Sc B+ (D18), and 100% of a finance advertiser's spend at Sc B+ (Δ31, the ijārah of ad capacity). Cloud is ijārah of compute capacity: the same contract.

**Δ56 (proposed)** harmonises the three:

| Customer | Sc A | Sc B+ |
|---|---|---|
| Sportsbooks, casinos, alcohol and tobacco producers, adult (D18 row 1: premises used for the activity) | 100% | 100% |
| Conventional banks, insurers, lenders (D18 row 2: office of a P1 business) | 0% (Abū Ḥanīfa) | 100% |
| Mixed customers | 0% | Sc C / Strictest only, at their own NPI% |

**Priced:**
- Sportsbooks, casinos and alcohol, tobacco and adult producers: $0.8b (0.45–1.5b).
- Lending and underwriting customers: $13.0b (9–20b).
- Result: **+0.10 points at Sc A, +1.78 at Sc B, +2.77 at Sc C and Strictest.** Sc B becomes 4.27% (pass) and Sc C 7.06% (fail).

**Why it is proposed and not applied:** it would move every cloud, data-centre, colocation and telecom issuer in the universe — Microsoft, Alphabet, Oracle, Equinix, the carriers. That is a Council decision, not a screen's.

---

## 13. Purification (Δ6 v5.0, with Δ58) and khums

IE = I × (1 − t) + R_imp × m, where:
- t = 22.58%;
- m = the after-tax margin, excluding interest and — **Δ58** — excluding after-tax non-operating valuation gains ($80.4b × (1 − t) = $62.3b).

| | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| Purification per share (TTM) | **$0.42** | **$0.46** | **$0.57** | **$0.60** |
| Margin used | 8.94% | 8.94% | 8.94% | 8.94% |
| Without Δ58 (margin 16.97%) | — | $0.56 | — | — |

Without Δ58 the formula would attribute Anthropic's mark-ups to Amazon's grocery and video revenue, raising Sc B purification by 24%. No revenue line earned those gains.

Amazon pays no dividend, so all purification is in retained earnings, and the AAOIFI dividend-ratio cross-check (§59) is nil.

**Khums (§58):** 20% of net income, $27.1b at company level; $2.49 a share (information).

---

## 14. Scenario-to-school mapping (§61), index families and national standards

| School (§61) | Scenario | Verdict |
|---|---|---|
| Hanafi | A | PASS |
| Maliki, Shafiʿi (AAOIFI) | B | PASS |
| Hanbali | C | PASS (monitoring) |
| Strictest supervisor | Strictest | FAIL |

**Index families, on their own rules against this record's figures (engine):**

| Family | Debt | Cash | Receivables | Income | Result |
|---|---|---|---|---|---|
| AAOIFI SS 21 | 5.94% | 4.74% | — | 2.49% (1.84–3.39) | Pass |
| S&P Shariah | 7.01% | 5.60% | 2.22% | 1.88% (1.24–2.77) | Pass |
| DJIM | 6.38% | 5.09% | 2.02% | sector screen | Pass |
| FTSE (IdealRatings) | 6.38% | 5.09% | — | **4.44% (3.19–6.28)**, whole-line | **Borderline** |
| MSCI Islamic | 14.18% of TA | 11.31% of TA | 11.63% (+cash) | 2.49% | Pass |

**Other national standards:**

| Standard | Result | Figures |
|---|---|---|
| MSCI M-Series | pass | 7.0%, 5.6%, 7.8% of the 36-month average |
| SC Malaysia | pass | Debt 14.2% and cash 11.3% of total assets |
| OJK / DSN-MUI | pass | Debt 14.2%; non-halal income 2.5% |
| SECP (KMI) | pass | Interest-bearing investments 11.3% of total assets; property 40.7% |

---

## 15. Outside views (reconciled, not averaged)

| Source | Position | Comparison |
|---|---|---|
| **S&P 500 Shariah ETF (SPUS)** | Held AMZN at 6.37% (May 2025); **holds none at 27 October 2026** (holdings file) | Its index dropped Amazon in the window. The ratios pass on any reading, so the cause is likely a business-activity screen; S&P publishes no reason |
| **FTSE USA Shariah ETF (HLAL)** | **Holds none** (27 October 2026; also absent in the 2025 snapshots) | Consistent with this record's FTSE whole-line result (borderline, 4.4% at the point, to 6.3%) |
| **Musaffa** | Doubtful (July 2026) | "Doubtful" maps to no scenario here. Musaffa publishes no line attribution; not reconciled |
| **Zoya** (via an aggregator) | Doubtful (31 March 2026) | Third-party compilation; not verified on Zoya's page |
| **HalalScreener** | Pass, A+ (July 2026); prohibited income ~0.7% | Interest alone; none of the thirty estimated lines |

The ~0.7% figure is the clearest sign of why this screen was worth doing. A screener that reads only the named interest line sees 0.6–0.7% of revenue. This record sees 2.5% at the AAOIFI reading and 4.3% at Hanbali-strict, with three unsettled readings that would each carry Scenario C over.

---

## 16. G-flags (never change a verdict)

- Free guarantees with risk retained (Δ48): the A-to-z Guarantee and Amazon's indemnity of customers for product-liability claims on third-party sales.
- Self-insurance of $10.4b, mostly automobile liability including third-party delivery partners. It covers Amazon's own operations: Tier 0.
- Anthropic and OpenAI are unconsolidated variable interests. $15.0b of the Anthropic facility is undrawn, and Anthropic's IPO converts the notes into Class N shares.
- Pending acquisition of Globalstar: ~$10.9b including its debt; signed 13 April 2026, expected to close in 2027.
- Single class of common stock.

---

## 17. Monitoring triggers

- **Scenario C at 4.28% against 5%.** The media, advertising and meat lines move it.
- **Strictest debt with leases.** 22.97% as reported, 27.25% under Δ50. The July 2026 notes ($25.0b) and the Globalstar debt add to it; further Anthropic marks lower the reported figure without changing the Δ50 figure.
- **Q3 2026 results (29–30 October 2026):**
  - the Anthropic IPO and its conversion of the notes;
  - OpenAI's $21.3b;
  - whether interest income keeps falling with rates as debt more than doubles.
- **Card and lender terms.** Synchrony's Pay Later and retailer share, Chase's Prime Visa, and Affirm tranches vesting at $63.06.
- **Sportsbook integrations.** DraftKings becomes the sportsbook and online-casino integration sponsor of NHL on Prime in Canada (2026–27 season); any FanDuel renewal. Under Δ32 the line is structural: swapping partners does not remove it.
- **Lending in India.** Axio's growth: a lending segment above 5% of revenue would be categorical (U2) — not remotely near.

---

## 18. What this screen added to the methodology

| # | Rule | Status | Effect on Amazon |
|---|---|---|---|
| Δ49 | Interest-free convertible loans with a fixed conversion price: a stipulated benefit (qarḍ jarra nafʿan) | **Proposed** — sensitivity | +0.88 points from Sc B; carries Sc C over |
| Δ50 | Level-3 mark-ups out of total assets at Sc C and Strictest | Interim — applied | Strictest R19 27.25%, fail |
| Δ51 | Retail media attributed by the store's own catalogue, not TV benchmarks | Interim — applied | Sponsored ads 0.3% impure, not 7–17% |
| Δ52 | Bundled memberships allocated by relative standalone price | Interim — applied | Prime Video's slice of Prime: 25–45% |
| Δ53 | Marketplace take on prohibited goods: Tier 1 at every scenario | Interim — applied | Lines 10, 12 |
| Δ54 | Insurance distribution inside a non-financial issuer: Tier 1 at every scenario (Apple precedent) | Interim — applied | Line 6 |
| Δ55 | Consideration in kind from P1 counterparties (warrants, credits): the vesting value at Δ46 rates | Interim — applied | Line 4 (Affirm) |
| Δ56 | Infrastructure ijārah: cloud and data-centre capacity rented to P1 businesses | **Proposed** — sensitivity | +1.78 (B), +2.77 (C, Strictest) |
| Δ57 | Look-through of private stakes that pay no dividend: the pro-rata impure income flows up | Interim — applied | Lines 28–29 |
| Δ58 | Δ6's margin excludes non-operating valuation gains | Interim — applied | Purification $0.46, not $0.56 |
| Δ59 | Debt under other names: financing obligations, current portions and facilities filed outside "debt" | Interim — applied | Track-(a) debt +10% |
| Δ60 | Mushbooh ingredients in a retailer's catalogue (the §48 row applied to §49) | Interim — applied | Line 13 |
| F13 | The platform decomposition protocol (map every category to economic lines before Gate 4) | Framework | §3 of this report |
| Part XV | The line-item lexicon: 160 financial-statement phrases that can hide a prohibited source or a debt, with the rule and the test for each | Reference | The search behind §3 |

---

## 19. Open questions for the Council

1. **Δ49** — is a non-interest-bearing note that converts at a fixed price (or the IPO price if lower) qarḍ with a benefit to the lender, or a deferred share subscription? Priced, not applied.
2. **Δ56** — should cloud capacity carry D18's tenant attribution? It would change every infrastructure issuer. Priced, not applied.
3. **Δ50** — is a Level-3 mark-up an estimate for D9's purposes? Applied as interim; ratification asked.
4. **Δ57** — Anthropic fails its own Gate 3. Is the pro-rata flow-up enough, or should a material stake in a failing investee be a G-flag, or a Gate-2 item, as well?
5. **Δ51 and Δ52** — first applications: retail media by catalogue share, and bundle allocation by standalone price.
6. **Elections (§39(vi), §52)** — music as the product; explicit books and audiobooks (Kindle Unlimited, KDP and Audible carry a large romance and erotica catalogue); loot boxes without cash-out.
7. **Index divergence** — S&P's and FTSE's Shariah funds both hold no Amazon. Neither provider says why, and the record cannot see their business screens.

---

## 20. Final verdict matrix

| Reading | Sc A | Sc B · AAOIFI | Sc C | Strictest |
|---|---|---|---|---|
| **Base (rules as they stand + interim Δ49–Δ60 where applied)** | **PASS 1.96%** | **PASS 2.49%** | **PASS 4.28%** | **FAIL** (R19 27.25%; NPI 4.78%) |
| + Δ49 (Anthropic conversions as qarḍ with benefit) | 1.96% | 3.37% | **5.16% FAIL** | 5.66% |
| + Δ56 (cloud ijārah) | 2.06% | 4.27% | **7.06% FAIL** | 7.55% |
| + Δ49 + Δ56 | 2.06% | **5.15% FAIL** | 7.93% FAIL | 8.43% |
| + music as lahw (§39(vi) a) | 1.96% | 2.49% | 4.83% | 5.25% |
| + explicit books | 1.96% | 2.49% | 4.61% | 5.10% |
| + media goods at the studio rate | 2.03% | 2.57% | 4.46% | 5.03% |
| + music + books + media goods | 2.03% | 2.57% | **5.33% FAIL** | 5.81% |
| Loot boxes at 100% (§52) | — | — | 4.35% | 4.85% |

**Reading the matrix.** Under every reading Amazon passes Scenario A and fails Strictest. Scenario B passes unless both proposed deltas are ratified together. Scenario C is the one that turns on the Council: it passes only if the Anthropic conversions are equity, cloud carries no tenant rule, and the media elections are read leniently.

---

## 21. Caveats

- **These are screening opinions under Maz Vantage's methodology, not fatwas.** Where they differ from an index provider, the provider's constituent list is the authority for that index.
- **Twenty-nine of the thirty lines are estimates.** Each carries a stated band and its basis; the verdicts hold across the bands (§10) but not across the unsettled readings (§20).
- **The S-1 is a preliminary prospectus** (filed 26 October 2026). Share counts in it are blank until pricing, so Amazon's economic share uses the 12% cap.
- **Not refreshed:**
  - Intangibles are the 31 December 2025 figure.
  - Financing obligations are rounded as the 10-Q gives them ($8.9b).
  - The affordable-housing loans and Axio's book (~$2.9b) are estimated.
- **The app's Shariah tab needs live data to render the AMZN report**, as ADP's, Airbnb's and Deere's do. The figures are pinned in `web/tests/shariah-amazon.test.ts` either way.

---

## Appendix A — Market capitalisation, month-end (US$ billions)

| Month | Cap | Month | Cap | Month | Cap |
|---|---|---|---|---|---|
| Oct 2023 | 1,378.3 | Oct 2024 | 1,966.9 | Oct 2025 | 2,615.4 |
| Nov 2023 | 1,512.9 | Nov 2024 | 2,193.7 | Nov 2025 | 2,497.6 |
| Dec 2023 | 1,573.5 | Dec 2024 | 2,326.2 | Dec 2025 | 2,479.7 |
| Jan 2024 | 1,613.0 | Jan 2025 | 2,520.1 | Jan 2026 | 2,570.8 |
| Feb 2024 | 1,837.1 | Feb 2025 | 2,250.8 | Feb 2026 | 2,256.0 |
| Mar 2024 | 1,874.7 | Mar 2025 | 2,023.8 | Mar 2026 | 2,240.2 |
| Apr 2024 | 1,828.2 | Apr 2025 | 1,961.7 | Apr 2026 | 2,851.0 |
| May 2024 | 1,843.3 | May 2025 | 2,180.7 | May 2026 | 2,911.0 |
| Jun 2024 | 2,018.9 | Jun 2025 | 2,341.8 | Jun 2026 | 2,563.6 |
| Jul 2024 | 1,963.5 | Jul 2025 | 2,498.9 | Jul 2026 | 2,921.1 |
| Aug 2024 | 1,874.4 | Aug 2025 | 2,444.3 | Aug 2026 | 2,794.1 |
| Sep 2024 | 1,966.2 | Sep 2025 | 2,351.4 | Sep 2026 | 2,679.9 |

Spot, 27 October 2026: 2,722.3. Averages: 12-month 2,615.0 · 24-month 2,435.0 · 36-month 2,214.6.

## Appendix B — Sources

**Amazon filings**
- Amazon FY2025 Form 10-K — https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm
- Amazon Q3 2025 / Q1 2026 / Q2 2026 Forms 10-Q — …/000101872425000123/amzn-20250930.htm · …/000101872426000014/amzn-20260331.htm · …/000101872426000026/amzn-20260630.htm
- Q2 2026 results (8-K Ex. 99.1) — …/000101872426000024/amzn-20260630xex991.htm
- 13F-HR, 30 June 2026 — …/000110465926092052/infotable.xml
- Globalstar merger 8-K (14 April 2026) — …/000110465926042880/tm2611746d1_8k.htm

**Counterparty filings**
- Anthropic, PBC — Form S-1 (26 October 2026) — https://www.sec.gov/Archives/edgar/data/0002130357/000162828026067168/anthropicpbc-sx1.htm
- Affirm FY2026 10-K (Amazon warrants) — https://www.sec.gov/Archives/edgar/data/0001820953/000162828026059279/afrm-20260630.htm
- Synchrony FY2025 10-K (retailer share arrangements) — https://www.sec.gov/Archives/edgar/data/1601712/000160171226000006/syf-20251231.htm

**Finance and insurance lines**
- Synchrony Pay Later on Amazon — https://www.americanbanker.com/payments/news/synchrony-beats-earnings-estimates-enters-bnpl-with-amazon
- Axio acquisition completed — https://www.crowdfundinsider.com/2025/09/250024-amazon-completes-acquisition-of-digital-lending-startup-axio/ · Axio financials — https://inc42.com/company/capital-float/financials/
- Amazon Pay India insurance (corporate agent) — https://finance.yahoo.com/sectors/healthcare/articles/amazon-pay-expands-vehicle-insurance-084914642.html
- Amazon Protect (The Warranty Group) — https://insurancebusinessmag.com/uk/news/breaking-news/whats-going-on-with-amazon-and-insurance-85374.aspx
- Seller lending after March 2024 — https://www.finder.com/business-loans-for-amazon-sellers

**Gambling, media and advertising**
- FanDuel–Prime Video NBA/WNBA — https://www.fanduel.com/about/news/fanduel-and-amazon-announce-exclusive-odds-provider-partnership-for-nba-and-wnba-on-prime-video
- DraftKings–NHL on Prime (2026–27) — https://s21.q4cdn.com/869500724/files/doc_news/DraftKings-Named-Exclusive-Sportsbook-and-Online-Casino-Integration-Sponsor-of-NHL-on-Primes-Wednesday-Night-Hockey-for-the-2026-27-S-68B3T.pdf
- FanDuel selects AWS (2023) — https://press.aboutamazon.com/2023/9/fanduel-selects-aws-as-its-strategic-cloud-provider
- Twitch gambling policy (2022) — https://www.fortune.com/2022/09/21/twitch-bans-gambling-streams-slots-announcement-pokimane-amazon · Twitch gambling ads (2026) — https://famesters.com/blog/gambling-on-twitch/
- Prime Video ad revenue — https://www.tvtechnology.com/news/forecast-amazon-prime-video-advertising-to-hit-usd806-million-in-2025 · https://www.mediapost.com/publications/article/409789/

**Retail, grocery and pharmacy**
- Amazon seller alcohol policy — https://sellercentral.amazon.com/help/hub/reference/external/G200164340 · Italy wine authorisation — https://sell.amazon.it/imparare/vendere-vino-online
- Tobacco and nicotine policy (secondary) — https://legalclarity.org/can-you-legally-buy-tobacco-on-amazon/
- NIQ 2024 alcohol channel shares — https://www.convenience.org/Media/Daily/2025/February/10/1-NIQ-C-Stores-Gain-Share-of-Wine-Spirits_Research
- Power of Meat 2026 — https://www.wlj.net/beef-drives-record-meat-sales-growth · fresh pork — https://www.provisioneronline.com/articles/115712-fresh-pork-lags-while-grinds-make-gains
- Amazon grocery >$100b — https://www.andnowuknow.com/node/98006 · Whole Foods estimates — https://www.pulse.bot/retail/news/the-friday-checkout-amazon-says-its-the-second-largest-us-grocer-stores-mostly-not-required-1e6ff328-e576-4f29-a502-754027ac4f44/
- Amazon Pharmacy and GLP-1s — https://247wallst.com/investing/2026/04/10/who-benefits-from-amazon-pharmacy-stocking-eli-lillys-new-weight-loss-pill/
- Housing Equity Fund — https://www.aboutamazon.com/news/community/amazon-launches-2-billion-housing-equity-fund-to-preserve-and-create-over-20-000-affordable-homes

**Cloud spending by industry**
- Cloud spend by industry (IDC Europe) — https://www.idc.com/resource-center/press-releases/banking-leads-european-cloud-spending-growth-while-manufacturing-industries-slow-down-says-idc/

**Outside screens and fund holdings**
- Musaffa AMZN — https://musaffa.com/stock/AMZN/ · HalalWallet — https://www.halalwallet.us/blog/is-amazon-stock-halal-2026 · HalalScreener — https://halalscreener.app/en/answers/is-amzn-halal-2026
- SPUS and HLAL holdings — https://stockanalysis.com/etf/spus/holdings/ · https://stockanalysis.com/etf/hlal/holdings/ (holdings files read through the data connector, 27 October 2026)
