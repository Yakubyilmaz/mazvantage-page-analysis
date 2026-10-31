# Walmart Inc. (WMT) — Shariah Screening Report (second methodology stress test)

**Methodology:** Shariah Screening Master Methodology **v5.0**, with interim deltas Δ40–Δ63, F13 and Part XV, plus **Δ64–Δ66**, which came out of this screen (31 October 2026, interim).
**Screened:** 31 October 2026.
**Issuer:** Walmart Inc., CIK 0000104169 (NYSE: WMT), Delaware. Single class of common stock; the Walton family holds about 45%.
**Period:** the twelve months to **31 July 2026** ("TTM"), built as FY2026 + H1 FY2027 − H1 FY2026. Walmart's fiscal year ends on 31 January.
**Balance sheet:** 31 July 2026 (Q2 FY2027 10-Q), with 31 July 2025 and 31 January 2026 for trend.
**Market cap:** 12-, 24- and 36-month averages to September 2026, plus the 30 October 2026 close.
**User locks applied:**
- **U1** (GLP-1 and ED medicines) — applied to the Walmart and Sam's Club pharmacies.
- **U2** (P1 segments over 5%) — tested on reported segments, not on categories inside them.
- **U4** (look-through) — applied to the Green Dot and Klarna stakes.
- **U11** (the Gate-1 list cannot be overridden) — respected.

**Record in the app:** `web/src/lib/shariah-issuers-walmart.ts`. WMT's Shariah tab reads it, and `web/tests/shariah-walmart.test.ts` pins the figures below.

The engine, `web/src/lib/shariah-v5.ts`, gained one thing: **Δ66**, an optional `group` on a revenue line, which the Δ61 watch test moves as one. Only Walmart's lines carry it, so no other verdict moved. The suite passes: 758 tests.

This screen also does the **legacy v3.0 Walmart re-screen** that the master owed (§0.5 item 10, Fd30). It supersedes both the v3.0 report and the preliminary flag in §XIII.4.

---

## 1. Why Walmart

Amazon tested whether the methodology can find prohibited revenue *hidden* inside broad categories. Walmart tests something different:

- **The classic prohibited goods, sold openly and at scale.** Walmart sells alcohol, tobacco, pork and lottery tickets in its own stores. At $736b of revenue, even small category shares are billions of dollars. Yet the 10-K names none of them as a figure.
- **A category renamed to drop a prohibited word.** Sam's Club reported "Fuel, tobacco and other categories" up to its FY2024 10-K. It has been "Fuel and other" since the FY2025 10-K. The word "tobacco" appears **zero times** in the FY2025 and FY2026 10-Ks.
- **A fintech and a payments group around the stores.** These are:
  - **OnePay** — Synchrony-issued cards, Klarna instalment loans, earned wage access, "limited access to cryptocurrency".
  - **PhonePe** — loan distribution and insurance broking.
  - **Flipkart Finance** — licensed in 2025 to lend on its own book.
  - **Money services** in US stores, including cheque cashing.
- **Shares in a bank and a lender** (Green Dot, Klarna), both acquired through commercial partnerships.
- **The verdict is close.** The two point-estimate scenarios land just under the 5% cap. Most of the figure rests on one set of category benchmarks. This is exactly the case Δ61's watch zone was built for, and it turned out to need Δ66.

## 2. TL;DR

| Scenario | Verdict | Deciding | Gate 4 NPI | Disclosed | Purification / share |
|---|---|---|---|---|---|
| Scenario A | **MIXED — Watch** | Gate 4: 4.08% under 5%, but the category group at its high edge crosses (Δ61, Δ66) | 4.08% | 1.2% | $0.15 |
| **Scenario B · AAOIFI-based** (preferred) | **MIXED — Watch** | Gate 4: 4.18% under 5%, but the category group at its high edge crosses (Δ61, Δ66) | 4.18% | 1.1% | $0.15 |
| Scenario C | **FAIL** | Gate 4: 11.41% > 5% | 11.41% | 0.4% | $0.35 |
| Strictest | **FAIL** | Gate 2, R19: 25.09% > 25%; Gate 4: 12.35% > 3% | 12.35% | 0.4% | $0.38 |

- **Business (Gate 1) and balance sheet (Gate 2) pass at A, B and C.**
  - Debt is 6.3% of the 12-month average market value. Cash and securities are 1.4%.
  - Strictest fails R19 by 0.09 points, because the July commercial-paper peak lifts debt with leases to 25.1% of total assets.
- **Hidden interest (Gate 3) is negligible.** It is $392m, 0.05% of revenue.
- **What Walmart sells decides it (Gate 4).** At Scenario B:
  - Alcohol is about **1.80%** of revenue.
  - Pork is **1.58%**.
  - Tobacco is **0.57%**.
  - Together they are **3.95%**. The rest — lottery, advertising, streaming, card and lender shares, insurance broking, cheque cashing — adds 0.23 points.
- **Why A and B are on watch, not passed.**
  - No single estimated line, moved to either edge of its band, carries Scenario B over 5%. Plain Δ61 would therefore pass it.
  - But the seven alcohol, tobacco and pork lines are all sized from the same benchmarks: category shares of each segment's Grocery sales. If those benchmarks run high, they run high together.
  - At the top of their bands together they add **1.49 points**, taking A to 5.56% and B to 5.67%.
  - **Δ66** makes the watch test move such a group as one. Under it, A and B read **MIXED — Watch**.
- **C and Strictest fail by a wide margin.** Meat not slaughtered Islamically (D13, about $38b at the conservative edge) and GLP-1 medicines (U1) add more than 5 points on their own.
- **Almost none of the figure is disclosed (Δ63).** Only the interest line is: 1.1% of the Scenario B figure.
- **The tab's answer.** On Standard 21's own row it reads "It is on the line", with the "On watch · AAOIFI-based" label.

## 3. Every prohibited or doubtful line, and the words that hide it

US$ millions, TTM to 31 July 2026. "B" is the Scenario B amount; C and Strictest take the conservative edge of each band (D9).

### 3.A Interest and conventional finance

| Line | Filing wording | Rule | Point (band) | B |
|---|---|---|---|---|
| Interest income | "Interest income", a separate line | Gate 3, D5 | 352 (disclosed) | 352 |
| Flipkart Finance lending | *(not in the 10-K)* — the RBI registered Flipkart Finance as a non-deposit-taking NBFC on 13 March 2025, so it can lend to buyers and sellers directly | Layer 7 | 40 (15–90) | 40 |
| OnePay card programme | "OnePay", "financial services" — Synchrony issues and carries the Walmart card and Mastercard; Walmart's share is undisclosed | Δ46 | 120 (40–300) | 120 |
| Walmart MoneyCard | "**prepaid access**" — issued by Green Dot Bank | Δ46 | 120 (50–250) | 120 |
| PhonePe loan distribution | PhonePe's lending subsidiary: ₹945 crore of revenue in FY2026, more than double | Δ46 | 110 (80–150) | 110 |
| Klarna warrants | *(not in the 10-K)* — warrants over 15.3m Klarna shares at about $34, given to OnePay "in exchange for certain services" when Klarna became Walmart's exclusive instalment lender | Δ55, own rule (Δ62) | 80 (30–200) | 80 |
| Cheque cashing | "money orders, prepaid access, money transfers, **check cashing**, bill payment" | **Δ65** (new) | 100 (50–200) | 100 |
| Green Dot and Klarna look-through | 13F: Green Dot $13.2m, Klarna $48.6m | U4, Δ57, own rule | 5 (2–15) | 5 |
| Insurance broking | PhonePe Insurance Broking: ₹191 crore of revenue in FY2026 | §31, Δ54 | 25 (18–40) | 25 |

- **Earned wage access** (OnePay) is an advance on wages already earned, for a fee. Whether that is *qarḍ* with a fee or a service is an open question; it is not sized.
- **Crypto access** through OnePay is access only (Δ7); it is not sized.

### 3.B Alcohol, tobacco and pork (the category group, Δ66)

The 10-K's Grocery category "includes … alcoholic and nonalcoholic beverages … meat" without a figure for either. Each line is a share of the segment's Grocery or net sales.

| Line | Basis | Point (band) | % of revenue |
|---|---|---|---|
| Alcohol, Walmart U.S. | 2.6% of Grocery ($291.4b), band 2.0–3.5%. US off-premise alcohol was $89.8b in 2023 (NIQ); this is about 8–9% of it, consistent with Walmart calling itself the largest US beer retailer | 7,600 (5,800–10,200) | 1.03% |
| Alcohol, Sam's Club | 2.5% of Grocery ($66.2b), band 2.0–3.5% | 1,650 (1,320–2,320) | 0.22% |
| Alcohol, International | Mexico and Central America 3–6% (beer is core), China 2–4%, Canada 0.5–1.5% (provincial limits), Other 1–2% | 4,000 (2,700–5,500) | 0.54% |
| Tobacco, Walmart U.S. | Sold in most US stores (pulled from select stores in four states in 2022); 3–5% of US cigarette retail | 3,000 (2,000–4,500) | 0.41% |
| Tobacco, Sam's Club and International | Inside "**Fuel and other**" ($13.3b) since the rename. Sam's cut tobacco to fewer than 40 of about 600 clubs after 2018; International stores sell cigarettes | 1,200 (550–2,300) | 0.16% |
| Pork, Walmart U.S. | 2.2% of Grocery, band 1.6–2.8%. US retail meat was $112b in 2025, and pork is 9–18% of meat dollars before bacon, ham and sausage | 6,400 (4,700–8,200) | 0.87% |
| Pork, Sam's Club and International | Sam's 2.2% of Grocery; China (pork is the main meat) 4–8% of sales; Mexico 1.5–3.5%; Canada 1–2%; Other 0.5–1.5% | 5,240 (3,410–7,000) | 0.71% |
| **Group** | One family of benchmarks (Δ66) | **29,090 (20,480–40,020)** | **3.95% (2.78–5.44%)** |

- **Δ64 — the renamed category.** Sam's Club's "Fuel, tobacco and other categories" (FY2024 10-K, XBRL member `FueltobaccoandothercategoriesMember`) became "Fuel and other". The rename removes the word, not the goods.
  - Under Δ64, a category relabelled to drop a prohibited word keeps its Gate-4 line. The line is sized from the last disclosure and benchmarks, and the rename is a G-flag.
  - Walmart U.S. never named tobacco in a category, so its line rests on benchmarks alone.

### 3.C Meat and ingredients of unknown source

| Line | Rule | Point (band) | A / B / C / S |
|---|---|---|---|
| Meat not slaughtered Islamically (beef, poultry, lamb) | D13, Sc C and Strictest only | 31,000 (24,000–38,000) | 0 / 0 / 38,000 / 38,000 |
| Gelatin of unstated source (gummies, marshmallows, capsules) | §48 mushbooh row (Δ60) | 3,000 (2,000–5,000) | 0 / 0 / 125 / 250 |

The meat line is about 7.5% of US and Sam's Grocery plus about 3% of International sales.

### 3.D Media and streaming

| Line | Rule | Point (band) | A / B / C / S |
|---|---|---|---|
| Paramount+ or Peacock inside Walmart+ | F12, Δ28, Δ52 (triangulated) | 550 (240–980) | 165 / 193 / 392 / 490 |

- **Base.** Membership fees were $4.4b in FY2026, and Walmart+ is about half of that. Since 15 September 2025, members choose Paramount+ or Peacock.
- **The streaming slice, triangulated (Δ52).** Value about 35%, cost about 25%, usage about 15%. The median is 25%, with a band of 15–35%.
- **Sensitivity, not counted.** The movies, music and video games sold in the stores (about $6b), at the studio archetype by analogy, would add 0.15–0.46 points. §52 is silent on a retailer's media sales.

### 3.E Advertising and lottery

| Line | Rule | Point (band) | A / B / C / S |
|---|---|---|---|
| Walmart Connect sponsored ads | Δ51, 2% (to 3.5%) of the catalogue | 5,000 (4,300–5,700) | 100 / 100 / 200 / 200 |
| Vizio connected-TV advertising | Δ31, TV benchmarks | 1,500 (1,100–2,000) | 113 / 263 / 440 / 440 |
| Off-site display | Δ31, digital benchmarks | 700 (500–1,000) | 42 / 112 / 210 / 210 |
| Lottery commissions | §49, P1-GMB | 60 (20–150) | 60 / 60 / 150 / 150 |

Global advertising was about $6.4b in FY2026, including Vizio (acquired December 2024). State lotteries sell through select stores in Florida, Arkansas, Oklahoma, Michigan, Louisiana and other states, at retailer commissions of about 5–6%.

### 3.F Pharmacy

| Line | Rule | Point (band) | A / B / C / S |
|---|---|---|---|
| GLP-1 and ED medicines | U1 (lock) | 7,000 (5,000–9,500) | 0 / 0 / 2,850 / 9,500 |

Health and wellness was $74.5b in the window, led by pharmacy. GLP-1s are 10–15% of US prescription dollars.

### 3.G Lines that are not prohibited, and why

- **Money transfers, money orders and bill payment.** These are fee-for-service (Tier 0). Only cheque cashing — buying a cheque for less than its face — is a debt sale (Δ65).
- **Fuel** at Sam's Club and Walmart U.S.: permissible goods.
- **Interest-rate and currency swaps** hedging the debt: Tier 0 (Layer 6).
- **Membership fees** other than the streaming slice: a service.
- **Not found:** casinos, adult content, weapons manufacturing, own-book insurance underwriting. Firearms and ammunition sold to civilians are not on the methodology's P1 list.

## 4. Financial summary (TTM to 31 July 2026)

| Item | US$m | Note |
|---|---|---|
| Total revenues | 735,840 | Net sales $728.5b + membership and other income $7.4b; the denominator (§6) |
| Net sales by segment | 492.3b / 139.8b / 96.4b | Walmart U.S. / International / Sam's Club |
| Net income | 22,076 | |
| Pretax income | 29,316 | |
| Income tax | 6,817 | 23.3% effective |
| Diluted EPS | $2.76 | 7,978m diluted shares |
| Dividends per share | $0.99 | Payout 35.9% |
| Interest expense | 2,355 | Debt $1,859m + finance leases $496m; 0.32% of revenue |
| Total assets | 293,914 | 31 July 2026 |
| Equity | 104,506 | |
| Commercial paper | 10,479 | $6,596m at 31 January 2026 |
| Long-term debt | 39,932 | $3,470m due within a year + $36,462m |
| Finance leases | 6,832 | |
| Operating leases | 16,512 | Strictest only |
| Cash + debt investments | 12,755 | Cash $11,529m + $1,226m measured on Level-3 inputs |
| Receivables, net | 11,075 | Counted whole |
| Goodwill | 28,260 | Other intangibles not presented: $4b placeholder |

## 5. Data reconciliation (Gate 5, §XII.10)

| Field | Reference | Filing | Effect |
|---|---|---|---|
| Revenue | Net sales $728.5b | Total revenues $735.8b, including $7.4b of membership and other income | Total revenues are the denominator (§6) |
| Tobacco | Not named in the FY2025 or FY2026 10-K | Sam's "Fuel, tobacco and other categories" in the FY2024 10-K (XBRL member) | Kept as a Gate-4 line (Δ64) |
| Legacy v3.0 report | Pork + alcohol 3.0–3.6%; with tobacco and poultry 6.7–8.3% | Pork + alcohol 3.4% (point); tobacco 0.6%; other meat at Sc C+ only | Consistent. The v3.0 "Sc A without tobacco" stays withdrawn (§49) |
| §XIII.4 preliminary flag | Alcohol ~2.5% + tobacco ~2.7% → Sc A above 5%, "FAIL all four" | Alcohol 1.8%, tobacco 0.57% | **Superseded.** See below |
| Debt / total assets | §XIII.4: 15.8% (FY2026 10-K) | 19.5% at 31 July 2026 | Commercial paper rose $3.9b, and total assets moved |
| Musaffa | Doubtful (August 2026) | Sc A and B on watch (4.1–4.2%); Sc C and Strictest fail | Not reconciled (§39(iv)) |

**Why the preliminary flag is withdrawn.**
- **Tobacco.** A tobacco share of 2.7% of revenue would be about $20b. That is roughly a quarter of all US cigarette retail sales, from a retailer that has pulled cigarettes from stores in four states and from more than 90% of Sam's Clubs. Convenience stores sell most US cigarettes. The figure is not supportable from any benchmark the master lists.
- **Alcohol.** 2.5% of total revenue would be about $18b, more than 20% of US off-premise alcohol. Most of Walmart's revenue is not Grocery, so a grocery-level share must not be applied to total revenue.
- **The test.** Rebuilt by segment and category, the four lines sit just under 5% at A and B. The verdict there is a watch, not a fail.

## 6. Market-cap windows (§8, D16)

| Window | US$b | Used at |
|---|---|---|
| 12-month average | 912.6 | Scenario B; cash at every scenario |
| 24-month average | 836.5 | Scenario A |
| 36-month average | 725.9 | Scenario C and Strictest (the worst of the windows) |
| Spot, 30 October 2026 | 982.4 | Strictest's comparison; not the worst |

Walmart's value has roughly doubled in three years, so the 36-month window is the strictest by a wide margin.

## 7. Gate 1 — the §5 decision table

| Step | Test | Finding | Result |
|---|---|---|---|
| 1 | Primary business | Retail: Walmart U.S. $492.3b, International $139.8b, Sam's Club $96.4b | Not P1 — pass |
| 2 | Own P1 segment > 5% (U2) | Three segments. Alcohol, tobacco, pork, lottery agency and Flipkart Finance's lending all sit inside retail segments; U2 applies to segments, not categories (§49) | Pass — to Gate 4 |
| 3 | Facilitation (Δ14) | Card, deposit and BNPL shares, insurance broking and PhonePe's loan distribution: well under 1% of revenue | < 50% — standard Gate 4 |
| 4 | Sector routing | Retail and distribution (§49, §53); advertising Δ31/Δ51; Walmart+ streaming Δ52; pharmacy U1; payments and lending §54 | Proceed |
| 5 | Special classes | Not a health payer, takaful operator or holding company | n/a |
| 6 | Sub-industry (Δ5, Δ13) | The grocery category holds the P1 goods; one category renamed to drop "tobacco" (Δ64) | Re-routed to §49 |
| 7 | Client elections | None | n/a |

## 8. Gate 2 — the ratios at each scenario

Debt is borrowings $50,411m + finance leases $6,832m = **$57,243m**. Strictest adds operating leases: $73,755m.

| Ratio | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| R1–R3 Debt / market cap | 6.84% (< 33%) | 6.27% (< 30%) | 7.89% (< 30%) | 10.16% (< 25%) |
| R4 / R19 Debt / total assets | 19.48% (info) | 19.48% (< 30%) | 19.48% (< 30%) | **25.09% (> 25%) — fail** |
| R7 Debt / tangible market cap | 7.12% (info) | 6.50% (info) | 8.25% (< 30%) | 10.63% (< 25%) |
| R8–R10 Cash & securities / 12-month market cap | 1.40% | 1.40% | 1.40% | 1.40% |
| R11 Cash & securities / total assets | 4.34% (info) | 4.34% | 4.34% | 4.34% |
| R13 Cash, securities & receivables / market cap | 2.85% (< 50%) | 2.61% | 3.28% | 3.28% |
| AR / market cap | 1.32% | 1.21% | 1.53% | 1.53% |
| AR / total assets | 3.77% (info) | 3.77% (info) | 3.77% (< 33%) | 3.77% (< 25%) |
| **Gate 2** | **Pass** | **Pass** | **Pass** | **Fail** |

**Strictest's R19 over time.** Debt with leases as a share of total assets was:
- 24.00% at 31 July 2025;
- 23.57% at 31 January 2026;
- **25.09%** at 31 July 2026.

Commercial paper is seasonal: $3.8b, then $6.6b, then $10.5b. Walmart discloses no average balance, so the period-end figure is used (Δ44). The fail is real at the period end, but it sits within a quarter's commercial-paper swing of passing. It does not decide Strictest, which fails Gate 4 anyway.

## 9. Gate 3 — the eight layers (§12)

| Layer | Item | Value | Note |
|---|---|---|---|
| L1 | Interest income (gross) | $352m · 0.05% | Disclosed |
| L2 | Interest expense | $2.36b · 0.32% | Disclosed; under the Δ20 trigger |
| L3 | Capitalised interest | Not disclosed | Information only |
| L4 | Pension interest | None material | International plans only |
| L5 | Lease interest | $496m | Finance leases. Information only |
| L6 | Derivative carry | Hedging | Swaps on debt: Tier 0 |
| L7 | Financing income | ~$40m | Flipkart Finance has lent directly since 2025. Card, deposit and BNPL shares are Gate-4 lines (Δ46, Δ55) |
| L8 | Cash-vehicle yield | Inside L1 | Cash equivalents; $1.2b of Level-3 debt investments |

**Gate 3: $392m = 0.05% of revenue (0.06% at the high edge). Pass at every scenario.**

## 10. Gate 4 — the four-scenario table

US$m. A and B use point estimates; C and Strictest use the conservative edge (D9).

| Line | A | B | C | Strictest |
|---|---|---|---|---|
| Interest + Flipkart Finance | 392 | 392 | 442 | 442 |
| Alcohol (three lines) | 13,250 | 13,250 | 18,020 | 18,020 |
| Tobacco (two lines) | 4,200 | 4,200 | 6,800 | 6,800 |
| Pork (two lines) | 11,640 | 11,640 | 15,200 | 15,200 |
| Meat not slaughtered Islamically | — | — | 38,000 | 38,000 |
| Gelatin | — | — | 125 | 250 |
| Lottery | 60 | 60 | 150 | 150 |
| Advertising (three lines) | 255 | 475 | 850 | 850 |
| Walmart+ streaming | 165 | 193 | 392 | 490 |
| GLP-1 and ED | — | — | 2,850 | 9,500 |
| Insurance broking | 25 | 25 | 40 | 40 |
| Card, deposit and loan-distribution shares (Δ46) | — | 350 | 700 | 700 |
| Klarna warrants (Δ55) | — | 80 | 200 | 200 |
| Cheque cashing (Δ65) | — | 100 | 200 | 200 |
| Look-through | 5 | 5 | 15 | 15 |
| **Total** | **29,992** | **30,770** | **83,984** | **90,857** |
| **% of revenue** | **4.08%** | **4.18%** | **11.41%** | **12.35%** |
| Cap | 5% | 5% | 5% | 3% |
| **Result** | **Watch** | **Watch** | **Fail** | **Fail** |
| Disclosed share (Δ63) | 1.2% | 1.1% | 0.4% | 0.4% |

## 11. The watch zone — Δ61 and the new Δ66

**What Δ61 alone says.** Move any one estimated line to either edge of its band. Does Scenario B's result flip? It does not:
- The widest single line, Walmart U.S. alcohol, adds 0.35 points at its high edge.
- Walmart U.S. alcohol and tobacco together add 0.56 points, leaving B at 4.74%.

On Δ61 as first written, Walmart would pass.

**Why that is the wrong answer here.** The seven alcohol, tobacco and pork lines are not independent estimates. All seven are category shares of segment sales, drawn from the same family of sources: NIQ and Circana category data, the Power of Meat survey, and national cigarette and alcohol totals. If Walmart's grocery mix is richer in alcohol than the benchmark assumes, it is likely richer in pork too, and the error runs the same way across segments. Testing them one by one treats correlated errors as if they cancel.

**Δ66.** Lines sized from one shared source carry a common `group`, and the Δ61 test moves each group to its edge as one.

| | Point | Group at low edge | Group at high edge |
|---|---|---|---|
| Category group | 29,090 | 20,480 (−1.17 pts) | 40,020 (+1.49 pts) |
| Scenario A | 4.08% | 2.91% | **5.56%** |
| Scenario B | 4.18% | 3.01% | **5.67%** |

At the high edge both cross 5%, so A and B are **MIXED — Watch**. That is a verdict of compliant at the point estimate but not robust to it. The tab says so in words.

**What would settle it.**
- **To pass outright.** Scanner data (NielsenIQ or Circana, licensed) or a Walmart disclosure would narrow the bands. The top of the group's band must sit no more than $6.0b above its point; today it sits $10.9b above.
- **To fail.** The point estimates would have to rise by $6.0b (0.82 points). That is the whole group moving 55% of the way from its point to the top of its band.

## 12. Purification (Δ6 v5.0, with Δ58) and khums

| Scenario | Per share | Dividend part | Retained part | Ratio method (NPI × DPS) |
|---|---|---|---|---|
| A | $0.148 | $0.053 | $0.095 | $0.040 |
| B | $0.150 | $0.054 | $0.096 | $0.041 |
| C | $0.352 | $0.126 | $0.226 | $0.113 |
| Strictest | $0.377 | $0.135 | $0.242 | $0.122 |

- **Margin.** Purification uses the net margin on prohibited revenue, 2.96%. It is not purifying gross sales.
- **No non-operating gains to deduct.** Walmart has no Δ49 conversion gains, and the Δ58 field is not used.
- **Khums.** Khums on the TTM is $4,415m for the company, **$0.55 per share**.

## 13. Index families and national standards (Δ62: each on its own scope)

| Family | Basis | Debt | Cash | Receivables | Income | Result |
|---|---|---|---|---|---|---|
| AAOIFI Standard 21 | 12-month market cap | 6.27% | 1.40% | — | 4.17% (2.93–5.78%) | **Borderline** |
| S&P Shariah | 36-month market cap | 7.89% | 1.76% | 1.53% | 4.12% ex-interest (2.88–5.72%) | **Borderline** |
| Dow Jones Islamic Market | 24-month market cap | 6.84% | 1.52% | 1.32% | Sector screen only | **Pass** |
| FTSE Shariah (IdealRatings) | 24-month market cap | 6.84% | 1.52% | — | 4.34% whole-line (3.04–6.02%) | **Borderline** |
| MSCI Islamic | Total assets | 19.48% | 4.34% | 7.69% with cash | 4.17% (2.93–5.78%) | **Borderline** |

The AAOIFI row sits 0.01 points under Scenario B. The difference is the Klarna warrants and the look-through, which run under Maz Vantage's own rules (Δ62). Every family passes the balance sheet. Every family with an income percentage puts Walmart inside its band around 5%. DJIM, whose business test is a sector list, passes it.

| National standard | Tests | Result | Deciding |
|---|---|---|---|
| MSCI Islamic M-Series | Debt, cash + securities, receivables + cash < 33.33% of the 36-month average | Pass | 7.9%, 1.8%, 3.3% |
| Securities Commission Malaysia | Debt and cash < 33% of total assets; 5% / 20% activity benchmarks | Pass | Debt 19.5%; alcohol, tobacco and pork each under 5% |
| OJK / DSN-MUI (Indonesia) | Debt ≤ 45% of total assets; non-halal income ≤ 10% | Pass | 19.5%; 4.2% |
| SECP Pakistan (KMI) | Debt < 37%, non-compliant investments < 33% of total assets | Pass | 19.5%; 4.3% |

Malaysia passes because its 5% benchmark is tested per activity: alcohol, tobacco and pork each stay under it. On a combined test, it would sit near the line like the others.

## 14. Outside views (reconciled, not averaged)

- **Musaffa: doubtful** (August 2026). This is consistent with a figure near the line. Its line items are not public, so it is not reconciled (§39(iv)).
- **Shariah index funds.** Neither SPUS nor HLAL held Walmart on 27 October 2026. That is consistent with the borderline index rows, though index providers' data and timing differ.
- **Legacy v3.0 report** (`WMT_Shariah_FY2026_v3.docx`). Its pork + alcohol range of 3.0–3.6% brackets this screen's 3.4%. Its tobacco-free Scenario A is withdrawn (§49), and its total-asset AAOIFI base is replaced by market value.
- **§XIII.4 preliminary flag: FAIL all four.** Superseded (§5 above).

## 15. G-flags (never change a verdict)

- A category relabelled to drop a prohibited word: Sam's Club's "Fuel, tobacco and other categories" became "Fuel and other" (Δ64).
- OnePay offers "limited access to cryptocurrency" and earned wage access; neither is sized.
- Walmart holds Green Dot (a bank holding company) and Klarna (a lender) shares, both from commercial partnerships.
- The Walton family controls about 45% of the shares; single class of stock.

## 16. Monitoring triggers

- **Scenarios A and B at 4.1–4.2% against 5%, on watch (Δ66).** At the top of their bands together, the seven category lines add 1.49 points, to 5.6–5.7%. Scanner data or a disclosure would settle it.
- **Strictest debt with leases at 25.1% of total assets.** Re-test at 31 January 2027, when commercial paper is seasonally lower.
- **PhonePe's IPO prospectus** (filed 2026). It should give the lending and insurance figures, and show whether the lending arm lends on its own book. If it does, that line moves to Layer 7 at every scenario.
- **OnePay's card economics, the Klarna warrant vesting, and Flipkart Finance's loan book** as it scales. A large own-book lending arm would move Gate 3, not just Gate 4.
- **Advertising.** Grew about 40% in FY2026; Vizio's TV inventory carries the alcohol, sportsbook and finance rates.
- **Any 10-K that names a category share** for alcohol, tobacco or pork.

## 17. What this screen added to the methodology

| Item | What | Status |
|---|---|---|
| **Δ64** | A category relabelled to drop a prohibited word keeps its Gate-4 line, sized from the last disclosure and benchmarks; the rename is a G-flag | Interim |
| **Δ65** | Cheque cashing at a discount is the sale of a debt for less than its face (*bayʿ al-dayn*): a Gate-4 line from Scenario B. Money transfers, money orders and bill payment stay Tier 0 | Interim |
| **Δ66** | Lines sized from one shared source carry a common group; the Δ61 watch test moves each group to its edge as one | Interim; in the engine |
| Part XV, entries 161–165 | "Fuel and other" (renamed category); "prepaid access" / MoneyCard; earned wage access; "debt investments" on Level-3 inputs; "limited access to cryptocurrency" | Added |
| §XIII.4 | Walmart's preliminary flag superseded | Updated |
| §0.5 item 10 | WMT legacy re-screen done; PEP still owed | Updated |

## 18. Open questions for the Council

1. **Δ64.** Should a renamed category be sized from its last disclosure indefinitely, or should the line lapse after a set number of filings without the word?
2. **Δ65.** Is cheque cashing *bayʿ al-dayn*, or a service with a fee (the cheque is honoured at face, and the fee is for the service)? It is interim at Scenario B and above.
3. **Δ66.** How are groups drawn? Here the shared source is obvious. The rule needs a test for when two estimates are "one source".
4. **Earned wage access.** An advance on wages already earned, for a fee: *qarḍ* with a fee, or a service? Not sized.
5. **Crypto access through OnePay** (Δ7). Access only; unsized.
6. **Retailers' media sales.** §52 is silent; the sensitivity adds 0.15–0.46 points.

## 19. Final verdict matrix

| | Gate 1 | Gate 2 | Gate 3 | Gate 4 | Gate 5 | **Verdict** |
|---|---|---|---|---|---|---|
| Scenario A | Pass | Pass | Pass (0.05%) | Watch (4.08%) | Screenable | **MIXED — Watch** |
| **Scenario B · AAOIFI-based** | Pass | Pass | Pass (0.05%) | Watch (4.18%) | Screenable | **MIXED — Watch** |
| Scenario C | Pass | Pass | Pass (0.06%) | Fail (11.41%) | Screenable | **FAIL** |
| Strictest | Pass | Fail (R19 25.09%) | Pass (0.06%) | Fail (12.35%) | Screenable | **FAIL** |

## 20. Caveats

- **This is a screening opinion under Maz Vantage's methodology, not a fatwa.** Where it differs from an index provider, the provider's own constituent list is the authority for that index.
- **Every Gate-4 line except interest is an estimate.** Walmart does not disclose alcohol, tobacco or pork sales. Each estimate carries a stated band, and the verdict at A and B depends on where in those bands the truth sits. That is why it is a watch, not a pass.
- **Walmart's Q3 FY2027 results** (quarter to 31 October 2026) are due in November 2026. The screen should be re-run on them.

## Appendix — Sources

**Filings (SEC EDGAR, CIK 0000104169):**
- FY2026 Form 10-K, accession 0000104169-26-000055.
- Q1 FY2027 Form 10-Q, 0000104169-26-000102.
- Q2 FY2027 Form 10-Q, 0000104169-26-000154.
- FY2024 Form 10-K, 0000104169-24-000056 ("Fuel, tobacco and other categories").
- 13F-HR for 30 June 2026, 0001123292-26-001072.

**Other sources:**
- PhonePe FY2026 revenue by subsidiary (Outlook Business).
- Flipkart Finance NBFC licence (Business Standard).
- OnePay and Synchrony card programme (FinTech Futures).
- Klarna warrants to OnePay (NBC News).
- Walmart+ adds Peacock alongside Paramount+ (Walmart corporate, September 2025).
- Walmart global advertising about $6.4b (PPC Land).
- Walmart stops cigarettes in select stores (Washington Times, 2022).
- Sam's Club tobacco in fewer than 40 clubs (RetailWire).
- NIQ off-premise alcohol $89.8b in 2023 (Brewbound).
- Walmart lottery kiosks (KJRH, Oklahoma).
- Power of Meat 2026.
- Musaffa — WMT.

The record's `sources` field carries the links.
