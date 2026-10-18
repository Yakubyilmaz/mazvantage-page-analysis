*Shariah Screening Master Methodology v5.0 — Definitive Consolidated Edition*

# SHARIAH EQUITY SCREENING — MASTER METHODOLOGY

## v5.0 Definitive Consolidated Edition

**Status:** ACTIVE. Supersedes v4.4.4 Consolidated (locked 30 May 2026) and, through it, v4.4.3 (28 May), v4.4.2 (23 May), v4.4.1 (18 May), v4.4 (17 May), v4.3 (12 May), v4.2 (2 May 2026) and the "Master Methodology v3.0" used for the PepsiCo and Walmart reports.
**Locked:** 7 October 2026.
**Owner:** Shariah Methodology Council (platform Shariah supervisor).
**Classification:** Internal — institutional Shariah screening reference.
**Interim delta Δ40 (18 October 2026, owner decision).** Cash + IBS is tested against the **12-month average market capitalisation at every scenario**, as AAOIFI Shariah Standard No. 21 does: R8 decides at Sc A, Sc B, Sc C and Strictest, each at its own limit. R9–R10 (24- and 36-month windows), R11 (Cash + IBS / total assets) and R12 (Cash + IBS / tangible market cap) are computed and reported at every scenario and decide nothing. The debt tests (R1–R7, R19) and the scenario windows for them are unchanged. Implemented in `web/src/lib/shariah-v5.ts` (`THRESHOLDS`, `ratioTests`). Issuer reports screened before this date carry an amendment note.

**Interim deltas Δ41–Δ48 (18 October 2026, owner decision).** Hidden-interest rules drawn from the ADP, Airbnb and Deere screens (`HIDDEN_INTEREST_Shariah_Screening_v5_0.md`): interest booked inside revenue, client funds and float balances, lessor income, revenue shares from a partner's lending, pass-throughs and embedded insurance. Full text in §56.1.

**Next scheduled review:** 7 January 2027 (quarterly cycle). Interim deltas (Δ40+) may be added between reviews; each is flagged in the issuer report that needs it and consolidated at the next review.

**What this edition is.** v4.4.4 rewritten as one internally consistent rulebook. Every gate, scenario, delta (Δ1–Δ38), framework (F1–F12, the F6/F7 Modifier Rules) and worked example is carried forward. Where v4.4.4, its worked examples or the eighteen issuer reports contradicted each other, v5.0 states one rule, says which way it went and why (Part 0), and restates every number the change touches (Part XIII). The issuer figures in Part XIII were re-checked against the companies' own SEC XBRL filings on 7 October 2026. Part XII is new: the data-sourcing manual (which filing, which section, which XBRL tag, which free database) that earlier editions only gestured at.

**Doctrinal anchors** (unchanged from v4.4.4):
- AAOIFI Shariah Standard No. 21 (Financial Papers — Shares and Bonds) — the binding reference for Sc B; AAOIFI Shariah Standard No. 9 (Ijārah) for lease questions.
- Pharmaceutical necessity: Rashid, R. (2025). *The Five Islamic Legal Conditions for Permitting Prohibited Medicines (Tadāwī bil-Muḥarram)*. Al Balagh Academy, Department of Sharīʿah, November 2025 / Jumādā al-Ākhirah 1447 AH.
- Cosmetic enhancement: Qur'an 4:119; Bukhārī/Muslim ḥadīth on tattooing and tooth-filing; al-Marghīnānī, *al-Hidāyah*; Ibn Qudāmah, *al-Mughnī*; Ibn ʿĀbidīn, *Radd al-Muḥtār*; contemporary fatāwā (ECFR, Dār al-Iftāʾ Egypt, JAKIM).
- Media (F12): Qur'an 31:6 (*lahw al-ḥadīth*) and the *malāhī* corpus; the *samāʿ* and animate-imagery debate across the schools; *ijārah* of permissible capacity to a mixed-use lessee; *iʿānah ʿalā al-maʿṣiyah*; AAOIFI SS 21's silence on general media; institutional practice (DJIM, S&P, FTSE, MSCI).

### How to read this document

- **As a methodology** (onboarding, supervisor review): Parts I–XI in order.
- **As a screening manual** (a new issuer): the threshold table in **§3 is the only place numbers live**; walk the decision tree in **Appendix B**; look up any delta in the **Part IX register**; pull data with **Part XII**.
- **As Claude's instruction set:** sections carry *[Operational Note for Claude]* blocks addressed to a future Claude instance opening an issuer screen. Default to v5.0. If the user names an older version, comply, but list every v5.0 rule that would have changed the result. Never silently downgrade.
- **As the record:** Part XIII is the only cross-issuer table. Cross-issuer tables inside individual reports (JNJ §16, ABBV §15, NVO §8 and others) are void.

[Operational Note for Claude] Before any screen: (1) confirm v5.0 is the version in force; (2) read §0.4 (user-locked calls) — they override every default in this document; (3) run the Appendix B tree top to bottom; (4) compute every gate for every scenario even when one gate is already a categorical fail (the S8 rule, §4); (5) state every delta you applied by number.

---

# PART 0 — WHAT v5.0 FIXES

## §0.1 How conflicts were resolved

Each conflict was settled by the first rule that decides it:

1. **A user-locked call wins** over any default (§0.4).
2. **The later, more specific rule wins** over the earlier general one — unless it breaks a principle the methodology states for itself (for example v4.4.4 §51.4, now §16: a present Tier-1 impurity may never be sized to zero). Then the principle wins.
3. **Keep the gradient monotone.** Sc A is never stricter than Sc B, Sc B never stricter than Sc C, Sc C never stricter than Strictest. Where a choice was still open, v5.0 took the reading that preserves this and logged it as a decision (§0.3) the Council can flip.
4. **Numbers:** the audited filing beats any feed; the footnote's gross figure beats a netted face-of-statement line; a disclosed figure beats an estimate.

## §0.2 Findings and fixes register

"Impact" says whether any scenario verdict in the eighteen-issuer record changes. F1–F14 are the problems logged on 7 October 2026 before this rewrite; F15 onward were found while re-checking the record against the filings.

**Verdicts that change in v5.0:** RXST "split" → FAIL at all four scenarios (F19); VEEV Sc A "mixed / hold with purification" → FAIL (F20); **SNY Sc C PASS → FAIL** on the Hanbali ratio (F42); HIMS Sc B "MIXED" → FAIL (label only — the ratio is 16pp over the cap). Everything else is a corrected figure or a corrected reason behind an unchanged verdict. JNJ remains the only issuer that passes all four scenarios.

| # | What was wrong | Where | v5.0 fix | Impact |
|---|---|---|---|---|
| F1 | **Δ28 used twice.** v4.4.3 assigned Δ28 to Universal Content-Impurity Attribution; the MRNA report (and the Sector Data Maps / Free Sources notes) proposed a "Δ28 Post-Windfall Treasury Mitigation". | MRNA report §12.4; source-map notes | Δ28 stays content attribution. The treasury proposal is registered as **Δ39 — PROPOSED, NOT RATIFIED, does not apply** (Part IX). | None. Even if ratified as drafted, MRNA would still fail on Gate 2 liquidity (F6). |
| F2 | **Strictest Gate-4 cap** is 5% in §2 but 3% in §45.6, the JNJ, DIS, NFLX and AMC reports. | §2 vs §45.6 | **3%** (D2). | None. No Strictest figure in the record falls between 3% and 5%. |
| F3 | The standalone **ABBV report is the superseded v4.4.1 draft** (Sc C / Strictest 7.96%); v4.4.4 §44.7 restates 4.87% / 8.11% under Δ27. | ABBV report vs §44.7 | Record uses Δ27 figures, plus Creon at Δ25 (F24): **Sc C 4.93%, Strictest 8.23%**. | ABBV Sc C Gate 4 passes; Sc C still fails on Gate 2. |
| F4 | **Cross-issuer tables in reports are wrong:** JNJ §16 shows EXLS, MLNK and VEEV as clean passes and NVO "borderline"; ABBV §15 calls NVO a "uniform PASS". | JNJ §16; ABBV §15 | Part XIII is the only cross-issuer table; report tables are void. | Record corrected. |
| F5 | **NVO states three Sc C figures** — TL;DR 21.4% / DKK 11.66, synthesis 22.6%, body 23.2% / DKK 12.65 — and puts Wegovy + Saxenda at 20% although the locked band is 25–40%. It also calls Roche's 32.2% and HIMS's 58.6% "IBD/MCAP"; both are IBD/total assets. | NVO TL;DR, §7.2, §6 | Body method with the lock's floor (Wegovy + Saxenda 25%): **Sc C 24.5%**. Labels corrected. | None (Sc C fails either way). |
| F6 | **MRNA's thresholds drift from §2** (Sc A 33% IBD/TA; Sc C 33% on 24m MCAP; Strictest 30% lease-inclusive), it uses a "70% Hanafi limb" that exists nowhere in the methodology, and it leaves non-current debt securities out of Cash + IBS. | MRNA §7, §11 | §3 thresholds. Cash + IBS includes non-current debt securities: $8,135M = **41.7% of MCAP, 65.9% of total assets**. | MRNA still fails all four, but on **two** gates (Gate 2 liquidity and Gate 3 Layer 1), not "Layer 1 only". |
| F7 | **Δ6-RE treats impure revenue as 100%-margin profit** (NPI% × revenue × (1 − ETR) / shares), so purification can exceed earnings: NFLX Sc B $2.66 vs EPS $2.53; EXLS $3.82 / $5.88 vs $1.54; MELI $210.66 vs $39.39; NVO Strictest DKK 41.59 vs 23.03. Reports also used four different bases (dividend, cumulative net income, revenue, capital gain). | §29; most reports | **Two-component Δ6** (Part X): interest at (1 − t); impure operating revenue at the issuer's after-tax margin excluding interest; loss years purify interest only; Δ6-D splits by payout. For interest-only NPI the old and new formulas agree. | All purification figures restated (Part XIII §XIII.3). |
| F8 | **Layer-1 interest is inside the Gate-4 total for pharma** (SNY, ABBV, JNJ, HIMS, NVO) **but not for media** (DIS, NFLX, AMC). NFLX §11 then lists $295M + $300M + $13.3B (≈30.8%) yet states 29.4%; Sc B content is $12,996M (82.18% × 35% × $45,183M), not $13.3B. | §45.6 step 9; DIS, NFLX, AMC | **Gate-4 NPI always includes gross Layer-1 interest** (D5). DIS, NFLX and AMC restated. | None (all fail). |
| F9 | **Eight-layer numbering drifted.** NFLX/AMC: L3 = interest-bearing investments, L5 = FX, L7 = leases. HIMS: L3 = customer financing, L4 = hedging, L5 = pension, L6 = tax interest. §7: L3 = capitalised interest, L4 = pension, L5 = leases, L6 = derivatives, L7 = receivable financing, L8 = cash vehicles. | §7 vs reports | §7 numbering is canonical, with fixed machine keys (Part IV). | Labels only. |
| F10 | **Warner Bros. Discovery** — the NFLX dossier (Feb 2026) has a pending all-cash $27.75/share deal; the NFLX report says Netflix withdrew. | NFLX dossier vs report | Verified: on 26 Feb 2026 WBD declared Paramount Skydance's $31/share cash bid a superior proposal; Netflix declined to match and received the **$2.8B termination fee** (funded by Paramount). It is FY2026 non-operating income: Tier 0 compensation under a permissible contract, excluded from the NPI denominator (D14); the *gharāmah* vs *taʿwīḍ* question is logged as open. | None for FY2025. |
| F11 | **Does Sc A test total-asset ratios?** §2 says 33% "across all denominators"; §4 calls IBD/TA "informational under Sc A" yet applies Cash+IBS/TA at 33% to Sc A; the reports pass Sc A on market cap alone. | §2 vs §4 | **Sc A is market-cap denominated** (DJIM/S&P lineage); total-asset ratios are informational at Sc A (D1). | Confirms HIMS and ABBV Sc A passes. VEEV and RXST fail Sc A on Layer 1 instead (F19, F20). |
| F12 | **GLP-1 / ED stated three ways** — §2 (obesity 20% / diabetes 35%), F5 table (25–40%), Δ18 ("30%; GLP-1 same"), HIMS (35%), NVO (20% / 35%) — and Strictest is 100% under the lock but capped at the "pre-v4.4 mid-band" (25/35/30%) by §44.5. | §2, §17, Δ18, §44.5 | **The lock governs (U1):** GLP-1 Sc C band 25–40%, ED 20–50%, default 30%; Δ19 evidence may move the point inside the band; Δ8 elevation counts inside the band; **Strictest 100% of the GLP-1/ED product line.** The §44.5 ceiling applies only to categories that are not locked. F5 rows corrected. | NVO Sc C 23.2% → 24.5%; HIMS unchanged. |
| F13 | **HIMS purification** ($1.85–2.30 at Sc C) comes from the revenue formula, although the text attributes it to cumulative net income ($254.4M × 20.7% / 258.2M = $0.20), and Strictest is shown equal to Sc C. | HIMS §10; §29 | Δ6 v5: **Sc A/B $0.09, Sc C $0.17, Strictest $0.33.** | Figures only. |
| F14 | **"Twelve standards" differ in every report** (§30's list; HIMS adds Russell-Jadwa, IdealRatings, Refinitiv; MRNA adds ISRA, Bursa, STOXX, Meezan, ICD-Refinitiv, Dar Al-Istithmar; BRK adds AMF, JASDAQ, Wahed; JNJ lists twelve *ratios*), so tallies cannot be compared (HIMS 2/0/10 vs §30's 2/5/5). §30 itself lists JAKIM (a halal-food certifier, not an equity screen), SAC Bank Negara Malaysia (governs Islamic banking, publishes no equity screen) and "IIFA Resolution 108 tracks AAOIFI" (unverified; IIFA's resolution on company shares is stricter, not a ratio screen). HIMS marks S&P "non-compliant" though S&P's market-cap tests pass. | §30; all reports | **Canonical twelve** (Part XI §60) with thresholds checked against the index rulebooks. **All earlier tallies are void until re-run.** HIMS under S&P passes the ratio tests. | Tallies only. |
| F15 | **HIMS IBD of $1,263.8M includes the operating-lease liability and counts its $143.2M non-current part twice.** The 10-K shows the convertible at $972.6M carried / $1,000M principal, operating-lease liabilities of $148.0M and no finance leases. | HIMS §4 | Borrowings-only IBD **$1,000M → IBD/TA 46.4%**; lease-inclusive 53.3%. Sc B remediation: ~$354M paydown with assets constant, ~$505M if repaid from cash, or total assets ≥ $3.33B. | None (Sc B/C/Strictest still fail; Cash+IBS/TA 43.1% fails on its own). |
| F16 | **Δ37 says the lease-inclusive track is "considered at Sc-C/Strictest" but not what it decides.** AMC used it for Strictest only, and AMC's "borrowings-only" omitted its $52.5M finance leases although §55.4 puts true finance leases in track (a). | §55.4; AMC | **Track (a)** = borrowings + finance-lease liabilities, used at Sc A/B/C; **track (b)** = (a) + operating-lease liabilities, used at Strictest; applied to **every** issuer (D4). | AMC (a) 51.0%. NVO Strictest Gate 2 now fails (25.7%), NFLX (b) 30.5%, JNJ (b) 24.8% still passes. No verdict changes. |
| F17 | **Δ22's scope is undefined** — "within 2pp of its threshold" never says which scenarios accept a sensitivity zone. | §6 | Δ22 applies at **Sc A and Sc B only**; Sc C and Strictest are bright-line (D3). | Roche Sc B MIXED-Watch, Sc C FAIL (as reported). JNJ Strictest passes bright-line. |
| F18 | **Δ38 calls market-cap ratios "undefined" when book equity is negative.** Market cap is never negative, and ABBV's own Sc A was decided on IBD/MCAP. | §55.5 | **Undefined** = any ratio whose denominator is book equity or is ≤ 0 (for example MCAP − goodwill − intangibles at AMC, where goodwill exceeds MCAP). Market-cap ratios are computed and tested. Negative equity stays an independent flag. | None. |
| F19 | **RXST** — TL;DR "SPLIT, compliant under 24m/36m windows" and §30's "4/4/4", but the audited Layer 1 ($9.332M / $134.5M = **6.94%**) breaks the 5% cap at every scenario and window. | RXST TL;DR; §30 | **FAIL all four.** Window sensitivity applies to the cash ratio only. | Verdict corrected (from split to FAIL). |
| F20 | **VEEV** — Sc A shown "MIXED → hold with purification" although Layer 1 is 8.36%. The Layer-1 cap binds at every scenario. | VEEV §9 | **FAIL all four.** | Sc A corrected (MIXED → FAIL). |
| F21 | **MLNK** — ~85% of revenue comes from lenders; Δ14 (v4.3) says ≥80% facilitation is a Gate-1 fail, but the record never applied it; the report's Sc A also used a total-asset test. | §27 Δ14; MLNK report | **Gate 1 FAIL all four (Δ14).** | Basis corrected; verdict unchanged. |
| F22 | **MELI** — §1 says it "failed G1 under wasīṭ-equivalence"; §27 says Δ14 is not triggered at ~30%; the MELI report passes Gate 1 and fails Gate 4. | §1 vs §27 vs report | MELI lends on its own balance sheet through a regulated subsidiary (credits revenue $5,395M = 18.7%). That is **direct conduct of an enumerated-prohibited activity above 5% → Gate-1 categorical fail under the multi-segment rule (U2)**, not Δ14. | Basis corrected; verdict unchanged. |
| F23 | **EXLS** is called "100% BFSI" (§1, §11) and "~37% insurance" (§25); its report has insurance at 34.0% and total financial-industry client exposure at ~59%. | §1, §11, §25 | Record uses the report: Δ16 "recommended" band (50–80%); Δ14 not triggered. | None. |
| F24 | **ABBV:** IBD/TA 51.6% in the report vs **50.4%** from the 10-K ($2,499M short-term borrowings + $64,997M debt and finance leases = $67,496M / $133,960M). Creon (porcine pancrelipase, $1,512M) is treated as Δ23 in the report but is a canonical Δ25 case in §38. | ABBV §6, §14 | 50.4%. Creon at **Δ25 (0 / 0 / 2.5 / 5%)** unless a life-saving (cystic-fibrosis) share is disclosed. | None. |
| F25 | **Sizing moved with the lens.** DIS: alcohol 0.70/0.90/1.10/1.48, gambling 0.40/0.40/0.50/0.60, pork 0.00/0.20/0.30/0.40. AMC: alcohol 1.72/2.59/3.45/3.45, pork 0.00/0.52/0.69/1.03. A sub-line's size is a fact; sizing a present Tier-1 impurity to zero at Sc A is exactly the leniency hole §51.4 forbids. | DIS §52.4; AMC §56.3 | **Sc A and Sc B use the point estimate; Sc C and Strictest use the conservative edge of the band; a present Tier-1 sub-line is never zero** (D9). DIS restated to 7.06 / 9.18 / 11.70 / 14.68%; AMC to 8.31 / 9.86 / 14.19 / 17.14% (both including Layer 1). | None (all fail). |
| F26 | **Pork and non-zabīḥah meat share one line**, and pork gets 0% at Sc A. | DIS; AMC | **Pork is Tier 1 at every scenario.** Meat of halal species not slaughtered Islamically is attributed at Sc C and Strictest only (D13). | None. |
| F27 | **HIMS Strictest attributes 100% of alcohol-denat skincare** (5.25% of group) although F6 calls non-consumption alcohol Tier 0 at Sc A/B/C and only a "minor flag" at Strictest. | HIMS §6 | **"Minor flag" = 5% of the affected line** (the Δ24 Strictest rate) (D8) → 0.26%. HIMS Strictest **65.0% → 60.0%**. | None. |
| F28 | **Gate-1 logic is scattered** across §1 (primary business), Δ14 (≥80% facilitation), Δ5/Δ13, the BRK lock (>5% prohibited segment) and F12 Reading (c), with no decision order. | §1, §25, §27, §45 | **One Gate-1 decision table** (§5). | None. |
| F29 | The **AMC report numbers the exhibitor rule "Δ35"** and calls itself v4.4.3; v4.4.4 numbers it Δ36 (Δ35 is viewing-weighted flags). | AMC report | v4.4.4 numbering governs. | Labels only. |
| F30 | **PEP and WMT run on "Master Methodology v3.0"**: total assets as the AAOIFI base, WMT's Sc A excludes tobacco, Sc B adds non-halal poultry. Incompatible with the four v4.x/v5.0 scenarios. | PEP, WMT reports | **Legacy.** Not part of the eighteen-issuer record; re-screen required (preliminary flags in §XIII.4). | Not in record. |
| F31 | **Cash+IBS/MCAP at Sc B** is 33% in the §4 table but AAOIFI's literal test is 30% (§30). | §4 vs §30 | **Sc B 30%** (D12). | None. |
| F32 | **§1's "eight-issuer precedent" lines are stale** — e.g. "EXLS, MLNK, EVER, RXST, HIMS all failed Gate 2"; EVER passes Gate 2 by wide margins and RXST fails only its 12-month cash ratio. | §1 | Precedents restated from the corrected record. | Text only. |
| F33 | **Khums approximated** as revenue × operating margin × (1 − ETR), which ignores non-operating items; reports use three per-share bases (company-level, 20% × EPS × (1 − payout) in MELI, one-off 20% × retained earnings per share in VEEV). | §31; reports | 20% × **reported** net income attributable (company level); per share 20% × diluted EPS, marked informational. | Display only. |
| F34 | **NFLX's Δ35 rates are presented as "measured"**, but the dossier says the viewing-weighted maturity split is a reconstruction (Netflix discloses only kids & family = 15% of viewing). | §53.4, §54.4 | Every Δ35 output labels each component **measured or estimated**. NFLX = estimated; sourcing pass recommended (tag the top ~200 titles). | None. |
| F35 | **LLY has no four-scenario Gate-4 computation** ("did not reach Gate 4"), contrary to the S8 rule. | LLY record | Flagged for re-screen; the Gate-2 fail at Sc B/C/Strictest stands. | Sc A provisional. |
| F36 | **Governance flags filed under the wrong deltas**: dual-class control under "Δ11" (fee structure, HIMS) and "Δ4" (litigation interest, §5). | §5; HIMS | Governance items go on a **Gate-5 non-attributing register** (G-flags, §2). Δ4 keeps litigation contingencies (interest → Layer 7; JNJ talc Options A/B/C). | None. |
| F37 | **JNJ describes Sc A Gate 4 as "no formal limit; 5% guidance".** | JNJ §8.2 | The 5% cap binds at Sc A. | None. |
| F38 | **Ratio 19 duplicates ratio 7** (both IBD / (MCAP − GW − intangibles)). | §4 | Ratio 19 becomes the Δ37 lease-inclusive IBD / TA (track b). | None. |
| F39 | **"Layers 2–8 combined 5% of revenue"** mixes expense layers (interest expense, capitalised interest, pension and lease interest) with income layers. | §1 G3 | Only **income-type** layers (L1, L7 and speculative L6) count toward the 5% Layer-1 cap and the Gate-4 numerator; expense layers are informational / Δ20 cross-reference. | None. |
| F40 | **Ja'fari mapped two ways**: Sc B + khums (§31, HIMS, NVO, RHHBY) vs Sc C + khums (MELI). | MELI §10 | **Sc B + khums.** | None (MELI categorical). |
| F41 | **Which market-cap window decides each scenario was never stated**, so window-sensitive issuers (RXST, MLNK) were reported as "split". | §5 | **Primary windows** (D16): Sc A 24-month average; Sc B 12-month; Sc C the worst of 12/24/36; Strictest the worst of 12/24/36 and spot. A window disagreement adds a Watch flag. | None. |
| F42 | **The Hanbali-strict ratio was not applied in two Gate-2 verdicts.** Ratio 7 (IBD ÷ (MCAP − goodwill − intangibles)) has been a Sc C (30%) and Strictest (25%) test since v4.3, but the SNY and DIS screens show Gate 2 clean at every lens. Sanofi: IBD €18.7B, goodwill + intangibles €67.6B → passes 30% only above ~€130B of MCAP; its market cap ran ~€104–139B through 2025. Disney: $42.2B ÷ (~$179B − $82.6B) = 43.8%. | §43; §52.2 | Apply R7 / R12 at Sc C and Strictest for every issuer (§3, §7). | **SNY Sc C PASS → FAIL.** DIS Sc C / Strictest Gate 2 now fail (Gate 4 already did). ABBV R7 ≈ 31% (already failing). |

## §0.3 Decisions register (the Council can flip any of these)

| # | Decision | Alternative rejected | Why | Effect of flipping |
|---|---|---|---|---|
| D1 | Sc A is market-cap denominated; total-asset ratios informational at Sc A. | Sc A tests all denominators at 33%. | Sc A is the DJIM/S&P (Hanafi-permissive) lens; the record's Sc A verdicts already assume it; keeps Sc A distinct from Sc B. | HIMS (46.4% TA) and ABBV (50.4%) would fail Sc A. |
| D2 | Strictest Gate-4 cap 3%. | 5% everywhere. | Matches the Gate-2 gradient (33/30/30/25) and the five latest reports. | None in record; JNJ talc Option C (4.33%) would pass. |
| D3 | Δ22 sensitivity zone at Sc A and Sc B only. | All four scenarios. | Sc C and Strictest are defined by rejecting tolerance; v4.4.4 §6 itself notes strict schools reject the zone. | Roche Sc C → MIXED; JNJ Strictest → MIXED. |
| D4 | Δ37: track (a) at Sc A/B/C, track (b) at Strictest, every issuer. | Track (b) only for asset-heavy lessees. | An operating lease is closer to *ijārah* than *qarḍ*, yet the strictest lens keeps the disguised-financing concern; a rule that depends on "asset-heavy" is a judgment call screens cannot reproduce. | NVO Strictest Gate 2 back to PASS. |
| D5 | Gate-4 NPI includes gross Layer-1 interest. | Interest only at Gate 3. | AAOIFI's 5% test is on all non-permissible income, interest first. | Media totals ~0.2–0.7pp lower. |
| D6 | Two-component Δ6 purification. | Revenue × (1 − t). | Purification cannot exceed the earnings it purifies. | Restores old (overstated) figures. |
| D7 | GLP-1/ED: lock band + default 30%; Strictest 100% of the line. | The v4.4.4 §44.5 mid-band ceiling (now §33.5) at Strictest. | User lock outranks defaults. | NVO Strictest 76.3% → ~25.8%; HIMS 60.0% → ~17.1% (both still FAIL). |
| D8 | F6 "minor flag" = 5% of the affected line. | 100% of the line (HIMS) or 0%. | 5% is the Δ24 Strictest rate for non-active problematic content; whole-line flagging is what Δ33 forbids. | HIMS Strictest back to 65%. |
| D9 | Sizing: point estimate at Sc A/B, conservative band edge at Sc C/Strictest; no zero for a present Tier-1 line. | Low edge at Sc A. | §16 (v4.4.4 §51.4). | DIS/AMC Sc A ~1pp lower. |
| D10 | Δ39 treasury mitigation registered, not ratified. | Ratify the MRNA draft. | Riba income is riba whatever caused the cash pile; the draft re-anchors the numerator to a past year, which no external standard does. | MRNA still fails Gate 2. |
| D11 | Canonical twelve standards (§60). | Per-report choice. | Comparability. | — |
| D12 | Sc B Cash+IBS/MCAP 30%. | 33%. | AAOIFI SS 21 literal. | None in record. |
| D13 | Pork Tier 1 at every scenario; non-zabīḥah halal-species meat at Sc C/Strictest only. | One merged line. | Pork is enumerated; meat of the People of the Book is permitted by the majority with conditions. | — |
| D14 | One-off non-operating items (termination fees, litigation receipts, disposal gains) are excluded from the NPI denominator; the termination fee itself is Tier 0. | Count them in total income. | Keeps NPI% about the operating business; avoids a one-off gain diluting impurity. | — |
| D15 | Gate-1 decision table order (§5). | — | One reproducible order. | — |
| D16 | Primary MCAP windows per scenario (F41). | All windows equal. | Decides the "split" cases reproducibly. | RXST/MLNK reported as split again. |
| D17 | Intoxicants include recreational cannabis (with alcohol); medical cannabinoids stay in F5. | Silent. | *kullu muskirin khamr*; REIT and retail screens meet dispensaries. | — |
| D18 | REIT tenant rule (§51) mirrors Δ31: Sc A attributes rent only from premises used to sell or conduct the prohibited activity itself; Sc B+ attributes rent from every enumerated-prohibited tenant. Pending the first REIT screen. | No rule. | Same *ijārah* logic the media framework already uses. | — |

## §0.4 User-locked calls U1–U11 (binding; unchanged by v5.0)

Labelled **U** so they cannot be confused with the Gate-3 layers L1–L8.

| # | Lock | Origin |
|---|---|---|
| U1 | **GLP-1 and ED drugs:** Sc A/B Tier 0 (0%). Sc C Tier 2 band — GLP-1 25–40%, ED 20–50% — default point 30%, the Δ8 elevation counting inside the band. **Strictest: 100% of the GLP-1 and ED product lines.** | HIMS, NVO ("mirror HIMS exactly"), LLY |
| U2 | **Multi-segment Gate 1 = categorical block:** an issuer that itself conducts an enumerated-prohibited activity in a segment above 5% of consolidated revenue fails Gate 1 at every scenario (Sc A may attempt hybrid attribution but is bound by the same 5% threshold). | BRK |
| U3 | **Insurance float = hybrid:** interest on float → Layer 1; equity dividends → look-through; capital gains documented, not capped. | BRK |
| U4 | **Look-through = material:** equity positions above 5% of the portfolio (or equity-method investees above 5% of group revenue, or controlling / prohibited stakes) are screened and flow up proportionally. | BRK; v4.4.4 §45.7 |
| U5 | **Holding company = ordinary issuer**, not a fund. | BRK |
| U6 | **JNJ talc = Option A** (governance flag only; no revenue attribution). | JNJ |
| U7 | **Δ26 temporal scope = reading (c) hybrid:** Δ26 governs only inside a formally declared public-health emergency window (COVID: WHO PHEIC 30 Jan 2020 – 5 May 2023; US PHE 31 Jan 2020 – 11 May 2023); outside it, Δ23 + F7 Modifier. | MRNA |
| U8 | **HEK293 = reading (ii) production-line-only:** the Strictest flag attaches only where HEK293 (or HEK-lineage, e.g. PER.C6) is used in commercial drug-substance production. | MRNA |
| U9 | **Media:** F12 Reading (c) default; background/incidental music excluded from the Δ35 flags; clean-tier ceilings TV-PG and below (streaming) and PG-13 and below (theatrical). | DIS, NFLX, AMC |
| U10 | **Topical alcohol denat.** is permissible at Sc C (non-consumption, *istihlāk*). | HIMS |
| U11 | **Gate-1 enumerated list** (§5) cannot be overridden by any user lock. | §34 |

## §0.5 Open items v5.0 does not settle

1. **Δ39 treasury mitigation** — registered, not ratified (Part IX).
2. **Music as the product** (Spotify-class issuers) — fresh election among categorical lahw at strict lenses / the §37 music archetype / a split by music type; and **podcasts / spoken word** (§39(vi)).
3. **Healthy-exhibitor test** — does an exhibitor with a clean balance sheet still fail on content + alcohol at 5%? (first Cinemark-class screen).
4. **HEK293 Strictest band** — currently 5–10% Tier 3; proposed 0–15% with triangulation.
5. **Cannabinoid pharma** full screen (Epidiolex class).
6. **S&P Shariah and DJIM caps** — S&P DJI published updates to both methodologies on 20 Aug 2026 (announcements 1484595 and 1484596). Search summaries of the September 2026 rulebooks report the leverage cap (and for DJIM the cash cap) at **30%**, down from 33%. spglobal.com refuses automated downloads, so this is **not verified**; confirm from the PDFs before the next tally.
7. **Termination fees at Strictest** — compensation (*taʿwīḍ*) or penalty (*gharāmah*)?
8. **Loot boxes without cash-out** (gaming) — open election (§52).
9. **Δ27 graduated temporal scale** (≤6m / 6–24m / >24m).
10. **Re-screens owed:** LLY (Gate-4 S8), SNY (exact R7 windows), RHHBY (R7 never computed), NFLX (Δ35 sourcing pass), PEP and WMT (legacy v3.0), DIS (FY2026 after the disclosure sunset and the Fubo carve-out).

---

# PART I — CORE ARCHITECTURE

## §1 — Scope, authority and update cycle

**Scope.** Listed common equity and depositary receipts (ADR/GDR) of operating companies and holding companies. Funds and ETFs are scored separately (MAZ_ETF_SCORING_SPEC.md); sukuk are out of scope.

**Authority.** The Council owns the methodology and may revise it at the quarterly review or by interim delta. **User-locked overrides** (§0.4) bind for the user who set them and must be named in every report that applies them; they cannot override the Gate-1 enumerated list. **Analyst deviations** must be disclosed in the issuer report and reviewed before publication.

**What cannot be overridden:** the Gate-1 enumerated list; the 5% Layer-1 cap; the AAOIFI 5% NPI cap at Sc B; the Δ15 disclosure protocol; the Δ19 triangulation requirement for contested Tier-2 rates; the Δ20 substance-over-form rule on debt.

**Supersession.** Every screen dated after 7 October 2026 uses v5.0. Earlier reports stay valid for their date but are re-screened if held longer than one quarter, and immediately if Part 0 lists a correction that touches them.

[Operational Note for Claude] When a user hands you an older report, do not repeat its numbers. Look the issuer up in Part XIII first; if Part XIII restates a figure, use the restated one and say why.

## §2 — The five gates

| Gate | Question | Inputs | Fail type | Detail |
|---|---|---|---|---|
| **G1 Categorical** | Is the business itself prohibited, or does it conduct / facilitate a prohibited activity at a disqualifying scale? | 10-K Item 1 / 20-F Item 4; segment note; GICS/SIC; Exhibit 21 subsidiaries | CATEGORICAL FAIL (all scenarios) | §5 |
| **G2 Financial ratios** | Is leverage, liquidity or receivables exposure within the scenario caps? | Balance sheet; debt, lease and investments notes; market cap over three windows | FAIL / MIXED-Watch per scenario | §6–§11 |
| **G3 Hidden interest** | Is interest-type income within 5% of revenue, and is the debt picture internally consistent? | Income statement; investments, debt, lease, pension notes | FAIL (Layer 1 > 5%) at every scenario | Part IV |
| **G4 Revenue purity** | Is non-permissible income (interest included) within the scenario cap? | Product / segment / customer revenue; tier attribution | FAIL per scenario | Part V–VIII |
| **G5 Disclosure & governance** | Can the issuer be screened at all, and what governance facts must the reader see? | Audited statements; FPI status; feed reconciliation; governance facts | NOT SCREENABLE (not a compliance verdict) | below |

**Gate 5 contents.** (a) Disclosure adequacy: audited annual statements (10-K, 20-F, 40-F or home-jurisdiction annual report under Δ15), interim cadence, segment granularity. (b) **Data reconciliation log**: every feed figure that differed from the filing, with both values (§XII.10). (c) **Governance register (G-flags, non-attributing):** dual-class or founder control (HIMS Class V 175 votes; NVO A-shares), going-concern language (AMC), material litigation without interest accrual (JNJ talc under Option A), regulatory enforcement (HIMS compounded GLP-1), restatements. G-flags never change a verdict; they are shown beside it.

## §3 — The four scenarios and the master threshold table

| Scenario | Doctrinal anchor | Used by |
|---|---|---|
| **Sc A — Hanafi / Liberal** | Hanafi readings on *istihlāk*, indirect derivation and contested drug categories; DJIM/S&P market-cap lineage. | Hanafi-aligned retail investors; DJIM-style mandates. |
| **Sc B — AAOIFI Mainstream** | AAOIFI SS 21 with *maṣlaḥah* deference; the asset-denominator alternative as a second test. Maliki and Shafi'i investors map here. | AAOIFI mandates; GCC institutions; sukuk underwriters. |
| **Sc C — Hanbali-Strict** | Hanbali *sadd al-dharāʾiʿ*; elevated *iʿānah* scrutiny; the F5 Tier-2 table; deep customer-mix attribution. | Strict-leaning retail; Hanbali-aligned boards. |
| **Strictest Supervisor** | Most conservative reading: categorical exclusions, strictest *sadd al-dharāʾiʿ*, certification demands where animal derivatives may be involved. | Maximum-caution boards ("Wahed-strict"). |

**THE MASTER THRESHOLD TABLE — the only place thresholds live.** "info" = computed and reported, never decisive at that scenario. "≤" means pass at or below.

| Test (Part III key) | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| IBD track used (Δ37) | (a) borrowings + finance leases | (a) | (a) | **(b)** = (a) + operating leases |
| Primary MCAP window (D16) | 24-month avg | 12-month avg | worst of 12/24/36 | worst of 12/24/36 and spot |
| R1–R3 IBD / MCAP | ≤ 33% | ≤ 30% | ≤ 30% | ≤ 25% |
| R4 IBD / total assets | info | ≤ 30% | ≤ 30% | ≤ 25% |
| R7 IBD / (MCAP − GW − intangibles) | info | info | ≤ 30% | ≤ 25% |
| R8 Cash + IBS / **12-month avg** MCAP, at every scenario (Δ40) | ≤ 33% | ≤ 30% | ≤ 30% | ≤ 25% |
| R9–R10 Cash + IBS / 24m, 36m MCAP (Δ40) | info | info | info | info |
| R11 Cash + IBS / total assets (Δ40) | info | info | info | info |
| R12 Cash + IBS / (MCAP − GW − intangibles) (Δ40) | info | info | info | info |
| R13 (Cash + IBS + AR) / MCAP | ≤ 50% | ≤ 50% | ≤ 50% | ≤ 50% |
| R14–R15 AR / MCAP | ≤ 33% | ≤ 33% | ≤ 33% | ≤ 25% |
| R16 AR / total assets | info | info | ≤ 33% | ≤ 25% |
| R17 Layer-1 interest income / revenue (Gate 3) | ≤ 5% | ≤ 5% | ≤ 5% | ≤ 5% |
| **Gate-4 NPI / revenue (Layer 1 included)** | ≤ 5% | ≤ 5% | ≤ 5% | **≤ 3%** |
| Δ22 Watch zone (Gate 2 only) | ± 2pp | ± 2pp | none (bright-line) | none (bright-line) |
| Tier-2 contested categories | 0% (F5 Sc A column) | 0% (F5 Sc B column) | F5 Sc C column / lock U1 | F5 Strictest column / lock U1 |
| Tier-3 remote flags | 0% | 0% | 5–15% (F5) | 25–40% (F5) |
| Δ31 advertising | direct prohibited-good promotion only | full advertised-product look-through | full look-through, conservative edge | full look-through, conservative edge |
| Sizing of contaminated sub-lines (D9) | point estimate | point estimate | conservative edge | conservative edge |

[Operational Note for Claude] Never write a threshold from memory or from an old report. Read it from this table. If a report you are extending uses a different number, the report is wrong — log it in the Gate-5 reconciliation section.

## §4 — Verdict vocabulary and aggregation

| Verdict | Meaning |
|---|---|
| **PASS** | Every test applicable at that scenario passes. |
| **MIXED — Watch** | A Gate-2 ratio sits inside the Δ22 zone at Sc A or Sc B, or the primary-window result disagrees with another window, and nothing fails outright. Quarterly re-review; legacy holdings may be kept, no new accumulation; two consecutive years in the zone → supervisor ruling. |
| **FAIL** | At least one test fails at that scenario. |
| **CATEGORICAL FAIL** | Gate 1 fails. Applies to all four scenarios. Purification is not a remedy; the guidance is to divest (purification figures are shown only to clean up a legacy exit). |
| **NOT SCREENABLE** | Gate 5 fails (disclosure inadequate). Not a compliance finding; request disclosure. |

**Aggregation per scenario:** CATEGORICAL FAIL > FAIL > MIXED-Watch > PASS — the worst gate wins.

**The S8 rule (standing):** compute every gate at every scenario even when Gate 1 has already failed. The full matrix is the deliverable; the divergence pattern itself is information (Δ1).

**Bright-line first.** Where Δ22 converts a FAIL into MIXED, state the bright-line result first ("32.2% IBD/TA exceeds 30% by 2.2pp — bright-line FAIL"), then the Δ22 reading, and say plainly that the zone is a platform refinement, not an AAOIFI rule. If the user asks for bright-line treatment, give it.

---

# PART II — GATE 1: CATEGORICAL SCREEN

## §5 — The enumerated list and the Gate-1 decision table

**Enumerated-prohibited activities (Tier P1).** No user lock can override this list (U11).

| Code | Activity | Includes | Notes |
|---|---|---|---|
| P1-FIN | Conventional (interest-based) banking and lending | Commercial and retail banks; consumer and SME lenders; credit cards; BNPL with interest or late-fee economics; mortgage lenders and servicers; pawn and payday lenders; captive auto, home and furniture finance arms | Algorithmic stablecoins are categorically excluded (Δ7). |
| P1-INS | Conventional insurance and reinsurance | P&C, life and health underwriting; reinsurance; actuarial services as primary business (Δ9) | Health payers per Δ10; takaful is Tier 0 (Δ12). |
| P1-ALC | Intoxicants | Alcohol production, bottling, import, wholesale, and retail as primary business; recreational cannabis (D17) | Medical cannabinoids → F5. |
| P1-PRK | Pork | Pig farming; pork slaughter, processing and distribution | Porcine pharma ingredients → F6 / Δ24 / Δ25. |
| P1-TOB | Tobacco and nicotine | Cigarettes, cigars, smokeless, e-cigarette and vape products | |
| P1-GMB | Gambling (*maysir*) | Casinos, sportsbooks, lotteries, real-money and social-casino gaming | Media-gambling integration → Δ32. |
| P1-ADT | Adult entertainment | Pornography production and distribution; adult venues | General media is NOT here (F12 Reading (c)). |
| P1-WMD | Weapons of mass destruction | Nuclear, biological and chemical weapons and their key components | Conventional defence is not enumerated; DJIM and S&P exclude broader defence, which shows only in the twelve-standard columns. |

**Gate-1 decision table.** Walk it in order; stop at the first CATEGORICAL FAIL.

| Step | Test | Rule | Outcome |
|---|---|---|---|
| 1 | **Primary business** | The issuer's primary business (largest segment by revenue, or the business 10-K Item 1 / 20-F Item 4 describes as primary) is P1. | CATEGORICAL FAIL, all four scenarios. |
| 2 | **Direct-conduct segment (U2)** | The issuer itself conducts a P1 activity (underwrites insurance, lends on its own balance sheet, sells alcohol, runs a casino) in a segment above **5%** of consolidated revenue. | CATEGORICAL FAIL, all four (Sc A is bound by the same 5%). At or below 5%, the line goes to Gate 4 as Tier 1 at 100%. Precedents: BRK (insurance 23.9%), MELI (credits revenue 18.7%). |
| 3 | **Facilitation — Δ14 *wasīṭ*-equivalence** | The issuer does not conduct P1 itself but earns revenue by facilitating P1 transactions (lead generation, brokerage, loan-origination software, policy administration). | **≥ 80%** of revenue: CATEGORICAL FAIL (EVER 100%, MLNK ~85%). **50–80%**: Gate 4 with Δ16 deep customer-mix **mandatory**. **< 50%**: standard Gate 4. |
| 4 | **Sector routing** | Healthcare (manufacturers, biotech, devices, diagnostics, hospitals, services, distributors, healthcare REITs, telehealth, health-tech) is permissible by default under the *maqāṣid* of preserving life and health → Part VI. Media and entertainment → F12 Reading (c), Gate 1 passes → Part VII. Software, e-commerce, consumer staples, industrials, energy and utilities are conditionally permissible → Gates 2–4 (Part VIII for the hard sectors). | Proceed. |
| 5 | **Special classes** | Health payers (Δ10): Sc A/B Tier 0 if positioned as health-service delivery; Sc C/Strictest treat as P1-INS → CATEGORICAL FAIL. Takaful (Δ12): Tier 0, applied only to the takaful part. Holding companies (U5): ordinary issuer plus look-through (U4). | As stated. |
| 6 | **Sub-industry reconsideration (Δ5, Δ13)** | GICS or SIC hides a doctrinal difference (HIMS is "Health Care Services" but is a DTC prescriber-dispenser). | Re-route to the right framework. |
| 7 | **Client mandate elections** | A client may elect a stricter reading (for example F12 Reading (a), categorical *lahw*). | Apply and document; never apply silently. |

[Operational Note for Claude] The most expensive error is running Gates 2–4 on an issuer that fails Gate 1. Before anything else, compute the P1 revenue share two ways: what the issuer does itself (step 2) and what it facilitates (step 3). They are different tests. MELI fails step 2 on its own loan book even though its facilitation share is far below 80%.

---

# PART III — GATE 2: FINANCIAL RATIOS

## §6 — Definitions

**Interest-bearing debt (IBD), track (a), used at Sc A/B/C:** short-term borrowings and commercial paper; current and non-current long-term debt (notes, bonds, term loans, revolver drawings); **convertible notes at principal, zero-coupon included** (Δ20 substance over form: the HIMS 2030 notes carry a 0% coupon and a 0.64% effective rate, and the $1,000M principal counts); subordinated and high-yield debt; mandatorily redeemable preferred stock; **finance-lease liabilities**; interest-bearing vendor or supplier financing owed by the issuer.

**Track (b), used at Strictest:** track (a) **plus operating-lease liabilities** (ASC 842 / IFRS 16).

**Excluded from both tracks:** trade payables; accruals; deferred revenue and contract liabilities; deferred taxes; pension obligations (unless the issuer classifies them as debt); non-interest-bearing content or programming liabilities; contingent consideration; undrawn facilities; guarantees; and **sukuk or other financing whose Shariah-compliant structure is verified** (MSCI excludes these too).

**Cash + interest-bearing securities (Cash + IBS):** cash and cash equivalents; money-market funds; T-bills and government securities; commercial paper; corporate bonds; term deposits; **current and non-current** debt securities (AFS, HTM, trading); restricted cash invested in any of these (client funds matched by an equal obligation: Δ43; balances that swing within the year: Δ44); and **interest-bearing customer financing receivables** (loan books such as MELI's), which count here rather than in AR. Excluded: equity securities, equity-method investments and strategic stakes (Δ3), and verified Shariah-compliant placements.

**Accounts receivable (AR):** trade receivables net of allowances. Interest-bearing customer loans sit in Cash + IBS.

**Market capitalization (MCAP):** every share class with economic rights, valued at the listed-class price (Roche bearer shares + participation certificates; Novo A + B; HIMS Class A + Class V). Voting differences go on the G-flag register, never into MCAP. For ADRs, use the ordinary-share MCAP. **Windows:** trailing 12-, 24- and 36-month averages of month-end MCAP (month-end close × shares outstanding that month), plus the latest spot value. The primary window for each scenario is in §3.

**Hanbali-strict denominator:** MCAP − goodwill − intangible assets (book values). If it is ≤ 0, the ratio is **undefined and disqualifying** at Sc C and Strictest (Δ38).

**Revenue:** total revenue as reported (operating). Interest income is not added to the denominator; interest already reported inside revenue is not taken out of it (Δ42). One-off non-operating items (termination fees, litigation receipts, disposal gains) are excluded (D14).

## §7 — The twenty-two ratios

The thresholds for every ratio are in §3. The keys are the machine names the platform uses.

| # | Key | Ratio | Role |
|---|---|---|---|
| R1 | `ibd_mcap_12m` | IBD / 12-month average MCAP | Test (Sc B primary window) |
| R2 | `ibd_mcap_24m` | IBD / 24-month average MCAP | Test (Sc A primary window) |
| R3 | `ibd_mcap_36m` | IBD / 36-month average MCAP | Test (in the Sc C / Strictest worst-of) |
| R4 | `ibd_ta` | IBD (track a) / total assets | Test at Sc B/C; info at Sc A |
| R5 | `ibd_equity` | IBD / book equity | Info (undefined if equity ≤ 0) |
| R6 | `net_ibd_equity` | (IBD − cash − IBS) / book equity | Info (undefined if equity ≤ 0) |
| R7 | `ibd_hanbali` | IBD / (MCAP − GW − intangibles) | Test at Sc C / Strictest |
| R8 | `cash_ibs_mcap_12m` | Cash + IBS / 12m MCAP | Test at every scenario (Δ40) |
| R9 | `cash_ibs_mcap_24m` | Cash + IBS / 24m MCAP | Info (Δ40) |
| R10 | `cash_ibs_mcap_36m` | Cash + IBS / 36m MCAP | Info (Δ40) |
| R11 | `cash_ibs_ta` | Cash + IBS / total assets | Info at every scenario (Δ40; was a test at Sc B/C/Strictest) |
| R12 | `cash_ibs_hanbali` | Cash + IBS / (MCAP − GW − intangibles) | Info at every scenario (Δ40; was a test at Sc C / Strictest) |
| R13 | `liquid_mcap_12m` | (Cash + IBS + AR) / 12m MCAP | Test, ≤ 50% everywhere |
| R14 | `ar_mcap_12m` | AR / 12m MCAP | Test |
| R15 | `ar_mcap_24m` | AR / 24m MCAP | Test |
| R16 | `ar_ta` | AR / total assets | Test at Sc C / Strictest; info at Sc A/B |
| R17 | `l1_revenue` | Layer-1 interest-type income / revenue | **Gate-3 cap, 5% at every scenario** |
| R18 | `l2_revenue` | Interest expense / revenue | Info; Δ20 trigger |
| R19 | `ibd_b_ta` | IBD (track b) / total assets | **Strictest test** (replaces the duplicate Hanbali ratio, F38) |
| R20 | `net_debt_mcap_12m` | (IBD − cash) / 12m MCAP | Info |
| R21 | `tl_ta` | Total liabilities / total assets | Info (strictest boards watch 70%) |
| R22 | `net_interest_revenue` | (Interest expense − interest income) / revenue | Info; Δ20 |

A ratio passes at a scenario when it passes on that scenario's primary window (§3). If another window disagrees, the scenario is MIXED-Watch unless something else fails.

## §8 — Market-cap triangulation

1. Shares: the SEC cover page (`dei:EntityCommonStockSharesOutstanding`) and every 10-Q, 10-K or 20-F; sum all classes per §6.
2. Prices: month-end closes for the last 36 months (sources in §XII.6). Show the arithmetic in the report.
3. Compute the 12-, 24- and 36-month averages and spot; apply every MCAP ratio at all four bases; report the window matrix.
4. A window-sensitive issuer (RXST: Cash + IBS 36.8% on 12m vs 19.0% on 24m) is reported per window and decided on the primary window, with a Watch flag.

## §9 — Δ22: the ±2pp sensitivity zone (Sc A and Sc B only)

**Trigger:** a Gate-2 ratio tested at Sc A or Sc B lies within 2 percentage points of that scenario's threshold. **Rule:** MIXED-Watch instead of PASS or FAIL; quarterly re-review; once the ratio leaves the zone (below 28% or above 32% against a 30% cap) it becomes PASS or FAIL; two consecutive years in the zone go to a supervisor ruling; legacy holdings may stay, but no new accumulation. **Sc C and Strictest are bright-line** (D3). Precedent: Roche IBD/TA 32.2% → Sc B MIXED-Watch, Sc C FAIL, Strictest FAIL.

## §10 — Δ20: Layer-2 cross-reference to Gate 2

**Trigger:** interest expense above 0.5% of revenue, or any IBD ratio above 25%. **Rule:** implied coupon = (interest expense + Layer-3 capitalised interest) / average IBD; reconcile it to the debt schedule within 100bp. If it is lower than the schedule implies, check timing (recent issuance), capitalisation and zero-coupon instruments (HIMS). If it is higher, look for off-balance-sheet financing, factoring discounts, vendor finance or misclassified debt. Precedents: Roche (CHF 32.4B × ~4.2% ≈ CHF 1,361M vs CHF 1,349M reported — consistent); NVO and LLY (Layer 2 > Layer 1); JNJ, the first reversal (interest income $1,056M > interest expense $971M).

## §11 — Δ38: negative book equity

Where book equity is negative:
1. Ratios whose denominator is book equity, and any ratio whose denominator is ≤ 0 (the Hanbali denominator when goodwill + intangibles exceed MCAP), are **undefined and disqualifying** at every scenario that tests them.
2. **MCAP- and total-asset-denominated ratios are computed and tested normally** (F18). An IBD/MCAP of 444% (AMC) is a real, failing value, not an artefact.
3. Negative equity is logged as an independent disqualifying flag at Sc C and Strictest, and as a G-flag at Sc A/B.
4. The TL;DR says so in plain words.

Precedents: ABBV (−$3,270M; screened on MCAP and assets); AMC (−$1,894.8M; goodwill of $2,416M exceeds the ~$0.9B MCAP, so R7 and R12 are undefined).

---

# PART IV — GATE 3: THE EIGHT-LAYER HIDDEN-INTEREST FRAMEWORK

## §12 — Canonical layers (F9)

Only **income-type** layers (L1, L7 and speculative L6) count toward the 5% cap and enter the Gate-4 numerator (F39). Expense-type layers are informational and feed the Δ20 cross-reference.

| Layer | Key | Definition | Type | Rule |
|---|---|---|---|---|
| **L1** | `l1_interest_income_gross` | Interest income on cash, deposits, money-market funds, T-bills, bonds, loan books and float, taken **gross** from the investments or other-income footnote **and from any revenue line earned as interest or yield (Δ41)** — never from an FX-netted "interest and other income" line (§39(i)) | Income | **≤ 5% of revenue at every scenario.** Enters Gate-4 NPI at 100%. |
| **L2** | `l2_interest_expense` | Interest expense on borrowings | Expense | Info; Δ20. |
| **L3** | `l3_capitalized_interest` | Interest capitalised into PP&E or inventory | Expense | Info; if above 1% of revenue, add to L2 for Δ20. |
| **L4** | `l4_pension_interest_cost` | Interest cost on defined-benefit obligations | Expense | Info; disclose if above 0.5% of revenue. |
| **L5** | `l5_lease_interest` | Interest on finance leases; implicit interest in operating-lease cost | Expense | Info; do not double-count with IBD tracks (a)/(b). |
| **L6** | `l6_derivative_carry` | Net interest from swaps, forwards and hedge ineffectiveness | Mixed | Commercial hedging is Tier 0 (*ḥājah*); **speculative** derivative interest income is income-type and counts with L1. |
| **L7** | `l7_financing_income` | Revenue from acting as a lender to customers: instalment and BNPL fees, financing spreads, late fees, receivable-financing income, and interest accruing on litigation or regulatory contingencies (Δ4) | Income | Counts with L1 toward the 5% cap and Gate 4. Precedent: MELI's credit revenues, large enough to trip Gate 1 step 2. |
| **L8** | `l8_cash_vehicle_yield` | Yield on cash-management vehicles | Subset of L1 | Disclose the composition (T-bills, MMF, corporate paper, bonds); never add it to L1 a second time. |

**Δ2 marginal yield over fee:** where an operating account's interest credit is netted against bank fees under the same contract, only the net credit counts. This is rare; document the contract.

**Δ4 litigation and regulatory contingencies:** the principal of a contingency is not IBD; interest that accrues on it is L7. A contingency with no interest attached is a G-flag. User-elected options for attributing harm (JNJ talc: Option A, flag only — locked U6; Option B, 1pp governance attribution at Sc C; Option C, up to 3pp harm-causation at Strictest) are shown as sensitivities.

**Gross-vs-net precedents:** NFLX — $295M gross vs $172.5M FX-depressed net (the net line understates L1 by ~40%); RXST — feed $2.508M vs audited $9.332M (this flipped PASS to FAIL); PEP — the feed showed $0 interest income (net), the 10-K shows $719M gross; NVO — IFRS "finance income" of DKK 9,660M includes FX gains, while interest income is DKK 1,269M; DIS — the face line is "interest expense, net" (−$1,305M = −$1,812M expense + $507M interest and investment income).

## §13 — Worked example (Roche FY2025)

| Layer | Item | CHF | % of revenue | Result |
|---|---|---|---|---|
| L1 | Interest income (est.) | ~250M | 0.41% | PASS |
| L2 | Interest expense | 1,349M | 2.19% | Info (Δ20: consistent with CHF 32.4B IBD at ~4.2%) |
| L3 | Capitalised interest | n/d | < 0.1% | Info |
| L4 | Pension interest | de minimis | < 0.1% | Info |
| L5 | Lease interest | ~50M | 0.08% | Info |
| L6 | Derivative carry (hedging) | < 100M | < 0.16% | Tier 0 |
| L7 | Financing income | none | < 0.05% | PASS |
| L8 | Cash-vehicle yield (inside L1) | ~200M | 0.32% | Disclosed |

[Operational Note for Claude] Take L1 from the investments or "other income" footnote of the filing — not from the face of the income statement, and never from a feed. Then read the revenue lines and the revenue-disaggregation note for interest booked as revenue (Δ41). A feed's "interest income" of zero is not evidence of no interest: it was $0 for Deere and Paylocity and carried only corporate interest for ADP. If only a net figure is available, say so and treat the gross figure as unknown rather than using the net one.

---

# PART V — GATE 4: REVENUE PURITY

## §14 — Non-permissible income (NPI) and the caps

**NPI% = (L1 + L7 + speculative L6 interest-type income, gross) + Σ (impure operating revenue line × attribution rate) — all divided by total revenue (§6).**

- Caps: **5% at Sc A, Sc B and Sc C; 3% at Strictest** (§3). Bright-line. A result within 0.5pp of a cap is reported as a monitoring flag; the verdict does not change.
- Interest income is **always** in the numerator (D5), even though Gate 3 also caps it on its own.
- Every line carries a basis (disclosed / back-solved / benchmark), a point estimate and a band (§16).
- Report all four scenarios even when Gate 1 has already failed (S8).

## §15 — The three-tier *iʿānah* framework

| Tier | Meaning | Default attribution | Examples |
|---|---|---|---|
| **Tier 0** | Permissible or neutral | 0% | Oncology, insulin, diagnostics for permissible purposes, vision devices, on-label T2D GLP-1 at Sc A/B |
| **Tier 1** | Direct prohibited revenue | **100% at every scenario** — no discount, no *maṣlaḥah* mitigation | Interest income; gambling; alcohol, pork, tobacco sales; adult content; conventional insurance premiums; cannabinoid pharma at Sc C/Strictest |
| **Tier 2** | Enabling but not direct | Scenario-calibrated rate (F5 table, lock U1, Δ19 evidence) | Analytics/BPO to insurers (EXLS); off-label vanity GLP-1; recreational ED; lifestyle use through a weak prescriber gate |
| **Tier 3** | Remote or contextual | Sc A/B 0%; Sc C 5–15%; Strictest 25–40% | NIPT used for termination decisions; HIV/HCV testing (Strictest only); fertility panels (Strictest only) |

Deltas modify these defaults by rule (Δ23–Δ27 collapse or fix rates in pharma; Δ28–Δ38 in media; Δ31 in advertising; Δ33 in contaminated lines).

## §16 — Sizing discipline (Δ33 as amended by v5.0)

1. **Attribute the sized sub-share, never the whole line.** An impure sub-component of a revenue line (alcohol inside resort F&B; pork inside concessions; a sportsbook licence inside a sports network) is attributed at its sized share. Whole-line "contamination flagging" is rejected — it is the defining weakness of commercial screeners (Musaffa DIS 77.9% vs the platform's line-item 8.3% at Sc B under v4.4.4 — 9.18% under v5.0; both NOT HALAL).
2. **Size once.** A sub-line's size is a fact about the business; it does not change with the lens. Give a point estimate and a band, with sources.
3. **Which edge each lens uses (D9).** Sc A and Sc B use the **point estimate**; Sc C and Strictest use the **conservative edge** of the band (*sadd al-dharāʾiʿ* applied to estimation uncertainty).
4. **No zero for a present Tier-1 line** (v4.4.4 §51.4). Sizing a present impurity to 0% at any lens is the leniency hole in a different guise.
5. **Robustness.** Confirm the verdict holds across the band; if it does not, say which assumption decides it.

Calibration anchors so far: Disney parks/resorts/cruise alcohol 0.7–1.5% of group (cruise beverage ~30–33% of onboard revenue at non-family lines, discounted for Disney's family skew); AMC concessions alcohol 5–10% of F&B (MacGuffins bars in about two-thirds of US theatres), pork 0–3% of F&B; NRA public figures (alcohol ≈ 21% of full-service sales at alcohol-serving operators, ≈ 6% limited-service); NACS (tobacco ≈ 34% of c-store in-store sales; beer 10.9% of sales where sold); cruise onboard revenue ≈ 30–34% of brand revenue (2024 sell-side estimates).

## §17 — Customer exposure: F11, Δ16 and Δ8

**F11 — B2B vs B2C.** For **B2B vendors** (EXLS, VEEV, MLNK) the customer's business drives attribution — but tier the *service sold*, not the customer's identity (AML-compliance software sold to a bank enables a Tier-0 purpose). For **B2C** issuers (HIMS, NVO), the end-user's use case drives attribution and the channel (wholesaler, PBM, pharmacy) is irrelevant. Hybrids (DTC pharmacy-prescribers) get both analyses.

**Δ16 — deep customer-mix attribution.** **Mandatory** when ≥ 80% of revenue comes from one vertical, or when 50–80% comes from a P1 vertical (§5 step 3); recommended at 50–80% for other verticals; not required below 50%. For each named customer or bucket:

> attribution = (customer's contested-product share of its revenue) × (customer's share of issuer revenue) × (scenario tier rate)

Sum across buckets. Sources: 10-K Item 1A / segment note (customers ≥ 10%), named-customer disclosures, industry buckets (IQVIA, EvaluatePharma, BCG, McKinsey — check sponsorship). Precedents: VEEV (95% life sciences): Sc A 0.04%, Sc B 0.55%, Sc C 2.0%, Strictest 3.2%. EXLS (financial-industry clients ~59%; insurance IMU 34.0%): 2.49% / 16.37% / 37.24% / 57.33%.

**Δ8 — wakālah-AI elevation (prescriber / decision gate).** Added inside the applicable Tier-2 band, never beyond it (U1):

| Gate strength | Description | Δ8 |
|---|---|---|
| Strong | In-person examination, BMI and comorbidities verified, coverage criteria enforced | +0pp |
| Medium | Synchronous video consultation, documented history | +0 to +3pp |
| Weak | Asynchronous algorithmic intake, self-reported history, auto-refill (HIMS) | +5pp |
| AI underwriting / lead-matching at contract formation (MLNK-adjacent, EVER) | — | +5pp |
| Absent | Cash-pay with no prescriber (grey-market peptides) | Tier 1 |

Branded manufacturers selling through wholesalers (NVO, RHHBY) get +0pp: the gate is downstream.

## §18 — Look-through (U4)

Screen and flow up proportionally: equity positions above 5% of the investment portfolio; equity-method investees above 5% of group revenue; and any controlling, insurance or enumerated-prohibited stake. Immaterial stakes are documented, not looked through. Dividends from looked-through positions follow the investee's NPI%; interest on float is L1 (U3). Precedent: BRK's 13F book — ~38% of $274.2B in non-compliant financials (AXP 20.5%, BAC 10.4%, MCO ~2.4%, Chubb, Capital One).

---

# PART VI — PHARMACEUTICALS, BIOTECH, DEVICES AND DIAGNOSTICS

## §19 — F1: industry-benchmark triangulation (Δ19)

Every Sc C or Strictest Tier-2 rate for a contested category needs **at least three independent sources from different classes**:

1. Peer-reviewed primary research (JAMA, NEJM, Lancet, BMJ, Frontiers, PubMed-indexed journals).
2. Institutional health-policy research (KFF polls, IQVIA, Truveta, Trilliant Health, FDA enforcement records).
3. Real-world claims or registry data (Merative MarketScan, national registries such as Denmark's).
4. Consultant reports (McKinsey, BCG, EvaluatePharma — check sponsorship).
5. Issuer-disclosed real-world data (trial baselines; manufacturer-sponsored studies — weight down).

Take the convergent range and its mid-point; if the sources diverge, weight to the issuer's geography. Disclose every source, the band, the source quality and the verdict at each end of the band. If three sources cannot be found, label the rate **ESTIMATED — WIDE BAND** and use the locked or default mid-point.

**Precedent — ED (HIMS):** Aldridge & Measham (BMJ 1999; 10% recreational use among UK men 19–34); Musacchio et al. (J Adolesc Health 2006; 4% lifetime / 2.2% current among US undergraduates); Atsbeha et al. (Front Med 2021; 66.2% recreational in an Ethiopian community-pharmacy sample); Burgener et al. 2022 (93% of 15 US DTC ED platforms used online intake only) → base 25% + Δ8 5pp = **30%**.

**Precedent — GLP-1 (NVO, HIMS):** Truveta 2020–23 (81% of Wegovy patients on-label; 56% of Ozempic/Mounjaro patients without T2D); AJMC/MarketScan (non-diabetic off-label semaglutide 3.6% → 30%); Trilliant/CNN (~33% of Ozempic users without diabetes, 2023); Mailhac et al. 2024 (Denmark: on-label T2D share 99% → 67% → 87%); KFF Nov 2025 (38% took GLP-1s solely for weight loss; 17% obtained online, 9% from medspas); Hendrix et al. 2025 (compounded-only patients 13.5% T2D vs 50.5% brand-only). → Wegovy/Saxenda **25%** (evidence ~19%, floored at the lock); Ozempic/Rybelsus/Victoza **35%**; HIMS compounded GLP-1 **35%**.

## §20 — F2: vanity versus therapeutic

Where one molecule has therapeutic and lifestyle uses:

| Category | Therapeutic (Tier 0) | Lifestyle / vanity |
|---|---|---|
| GLP-1 (semaglutide, tirzepatide, liraglutide) | T2D; medical obesity (BMI ≥ 30, or ≥ 27 with comorbidity) | Cosmetic weight loss (BMI < 27) |
| ED drugs (sildenafil, tadalafil, vardenafil) | Documented ED | Recreational / performance |
| Growth hormone | Paediatric and adult deficiency | Anti-ageing, bodybuilding |
| Botulinum toxin | Dystonia, migraine, spasticity | Aesthetic (→ Δ27) |
| Compounded hormones (TRT, oestrogen) | Documented deficiency | Anti-ageing, non-medical |
| Topical retinoids | Acne | Cosmetic anti-ageing (minor Strictest flag) |
| Peptides (BPC-157 etc.) | Investigational therapy | Bodybuilding, longevity |

Sc A/B: Tier 0 regardless of the on/off-label split (access to care is the *maṣlaḥah*; FDA labelling is not Shariah-binding). Sc C: Tier 2 on the off-label / vanity share. Strictest: Tier 1 (100%) **for the locked GLP-1 and ED categories (U1)**; for other categories, the Δ19 rate with the pre-v4.4 mid-band as a ceiling (§33.5).

## §21 — F3: recreational / enhancer drugs

| Category | Examples | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|---|
| Benzodiazepines | Valium, Xanax, Ativan | Tier 0 | Tier 0 | 1–3% Tier 2 | 5–10% Tier 2 |
| Opioid analgesics | Oxycodone, hydrocodone, fentanyl | Tier 0 | Tier 0 | 5–15% Tier 2 | 15–30% Tier 2, or Tier 1 if misuse dominates |
| Schedule II stimulants | Adderall, Ritalin, Vyvanse | Tier 0 | Tier 0 | 5–10% Tier 2 | 10–20% Tier 2 |
| ED drugs | Sildenafil, tadalafil | Tier 0 | Tier 0 | **20–50% band, default 30% (U1)** | **100% (U1)** |
| Anabolic steroids | Testosterone (TRT) | Tier 0 | Tier 0 | 10–20% Tier 2 | 20–40% Tier 2 |
| Anaesthetics with abuse potential | Ketamine, propofol | Tier 0 | Tier 0 | Minor flag if material non-anaesthesia revenue | Minor flag |

Triangulate when a category exceeds 2% of revenue (DEA enforcement data, SAMHSA NSDUH, ONDCP, misuse-prevalence studies, pharmacovigilance).

## §22 — F4: FDA and regulatory events

| Event | Shariah relevance |
|---|---|
| New indication approved | Widens Tier 0 for that product (Wegovy CV outcomes, 2024) |
| Removed from the shortage list | Triggers enforcement against compounded copies (semaglutide off the list 21 Feb 2025; 503A deadline 22 Apr 2025, 503B 22 May 2025) |
| Warning letter | May indicate *iʿānah* if it concerns off-label promotion (HIMS topical finasteride, Apr 2025: 32 adverse events) |
| Enforcement against compounders | Tier 2 / Tier 1 pressure on the compounder; branded manufacturers unaffected |
| REMS programme | Stronger prescriber gate → lower Δ8 |
| Accelerated approval | Watch the confirmatory trial |
| Breakthrough designation | Reinforces Tier-0 *maṣlaḥah* |
| Recall / biosimilar entry | Commercial, not Shariah-relevant |

Check the FDA shortage list, 503A/503B status, warning letters and post-period 8-K / 6-K events before publishing.

## §23 — F5: drug-category calibration table (Δ18) — corrected

Defaults; user locks override (U1 rows are locked).

| Category | Sc A | Sc B | Sc C | Strictest | Status / evidence |
|---|---|---|---|---|---|
| Oncology | 0 | 0 | 0 | 0 | Universal Tier 0 (*ḥifẓ al-nafs*) |
| Immunology (RA, IBD, MS) | 0 | 0 | 0 | 0 | Tier 0 |
| Insulin | 0 | 0 | 0 | 0 (yeast / E. coli rDNA, Δ21); flag only if porcine excipient confirmed | Tier 0 |
| Oral T2D (non-GLP-1) | 0 | 0 | 0 | 0 | Tier 0 |
| **GLP-1 — any indication (U1)** | 0 | 0 | **Band 25–40%, default 30%**, Δ19 point per product (Wegovy/Saxenda 25%; Ozempic/Rybelsus/Victoza 35%; compounded 35%) | **100% of the GLP-1 line** | Locked (HIMS, NVO, LLY) |
| **ED drugs (U1)** | 0 | 0 | **Band 20–50%, default 30%** incl. Δ8 | **100% of the ED line** | Locked (HIMS) |
| Hair loss (finasteride, minoxidil) | 0 | 0 | 0; topical compounded finasteride 5% | 0 + topical compounded flag | FDA Apr 2025 warning |
| Mental health (SSRIs, anxiolytics) | 0 | 0 | 0 | 0 | *ḥifẓ al-ʿaql* |
| Benzodiazepines | 0 | 0 | 1–3% | 5–10% | F3 |
| Opioids (medical) | 0 | 0 | 5–15% | 15–30%, or Tier 1 | F3 |
| Hormonal contraception | 0 | 0 | 30–50% Tier 2 | 100% Tier 1 | Δ16 customer-mix precedent (Bayer via VEEV) |
| Emergency contraception | 0 | 0 (some restriction) | Tier 1 | Tier 1 | Pre-codified |
| Mifepristone / abortifacients | Tier 1 | Tier 1 | Tier 1 | Tier 1 | Universal Tier 1 unless *ḍarūra* is documented |
| Fertility / IVF (married couples) | 0 | 0 | Minor flag (ART outside marriage) | Strictest flag | Tier 3 |
| NIPT | 0 | 0 | 8–15% Tier 3 (mid 12%) | 25–40% Tier 2 (mid 30%) | Bowman-Smart et al. 2020 |
| HIV / HCV / HBV testing | 0 | 0 | 0 | 5–10% Tier 3 | Mainstream: medical knowledge |
| HPV screening | 0 | 0 | 0 | 0 | Cancer prevention |
| COVID vaccines / antivirals | 0 | 0 | 0 | 0 (platform check, Δ21; HEK293 per U8) | Δ23/Δ26 |
| Paediatric vaccines | 0 | 0 | 0 | 0 (verify porcine-gelatin-free) | Δ23 |
| Cannabinoid pharma (Epidiolex, Marinol) | 0 (*ḍarūra*) | 0 | Tier 1, or Tier 2 ≥ 50% | Tier 1 | Pre-codified |
| Anti-ageing / longevity peptides | 0 | 0 | Tier 2 | Tier 1 | Future codification |

[Operational Note for Claude] Walk every top-20 product through this table. For any Tier-2 or Tier-3 cell, name the Δ19 sources and the band. For U1 categories, the band is fixed by the user; your evidence only chooses the point inside it.

## §24 — F6: animal-derived ingredients, excipients and sourcing (with Δ21)

**Step 1 — production platform (Δ21).** Recombinant proteins made in industrial bioreactors are **Tier 0 at every scenario**: *S. cerevisiae* (yeast), *E. coli*, CHO, Sf9, HEK293 (Strictest flag only under U8), egg embryo, mRNA-LNP (synthetic), viral vectors (check the propagation line). Whole-animal extraction: porcine = Tier 1 (unless Δ23/Δ25); bovine with halal slaughter = Tier 0. Porcine-pancreas insulin is obsolete in current major issuers.

**Step 2 — excipients** (FDA label section 11 via DailyMed; EMA SmPC section 6.1):

| Excipient | Typical source | Default |
|---|---|---|
| Glycerol / glycerin | Plant (palm, coconut) | Tier 0; minor flag if explicitly porcine |
| Magnesium stearate, stearic acid | Plant (palm, coconut, cottonseed); tallow rare | Tier 0 default; verify per product (mushbooh until sourced) |
| Gelatin (capsules, stabiliser) | Bovine, porcine, fish, plant | Bovine halal-certified 0; bovine uncertified 0 at Sc A/B, minor flag Sc C/Strictest; **porcine Tier 1** (→ Δ24 if trace); fish / plant 0 |
| Propylene glycol, phenol, m-cresol | Synthetic | Tier 0 |
| Polysorbate 20/80 | Plant / synthetic | Tier 0 default; verify |
| Cellulose derivatives | Plant | Tier 0 |
| Lactose | Bovine milk | Tier 0 (milk is not subject to slaughter rules) |
| Ethanol, isopropyl alcohol (non-consumption: topical, injectable) | Synthetic / fermentation | Tier 0 at Sc A/B/C (*istihlāk*; U10); **minor flag at Strictest = 5% of the line (D8)** |
| Heparin | Porcine mucosa, bovine lung | Porcine active → Δ25 (or Δ23 when acute life-saving use) |
| Protamine sulfate | Salmon | Tier 0 |
| Pancrelipase (Creon) | Porcine pancreas | Active ingredient → Δ25 (Δ23 for a disclosed life-saving share) |
| Conjugated oestrogens (Premarin) | Pregnant-mare urine | Mushbooh; Sc A/B 0, Sc C/Strictest Δ24-pattern rates pending first issuer |

**Step 3 — capsules and coatings:** hard / soft gelatin per the gelatin row; HPMC, film and enteric coatings, povidone are Tier 0.

**F6 Modifier Rule (Reading 2):** all excipients clean **and** a therapeutic use case → F6 = 0 at every scenario. F6 attribution activates only when at least one problematic excipient is identified and Δ23/Δ24/Δ25 do not displace it.

Worked example — NVO insulin and GLP-1 (FY2025): yeast platform with synthetic constructs (Δ21); excipients glycerol, phenol, metacresol, zinc, propylene glycol, disodium phosphate, protamine (fish), SNAC, magnesium stearate (plant per industry standard; supplier redacted in the NDA). **Tier 0 at every scenario on sourcing.** NVO's Strictest result is driven by U1, not by excipients.

## §25 — F7: vaccines and biologic substrates

| Platform | Status |
|---|---|
| Egg embryo | Tier 0 |
| Vero / MDCK cell culture | Tier 0 |
| mRNA + LNP | Tier 0 |
| Adenoviral vector | Tier 0; check the propagation line (HEK293T / PER.C6 → L8 Strictest flag) |
| Whole inactivated, recombinant subunit | Tier 0 (Δ21) |
| Live attenuated in WI-38 / MRC-5 | Tier 0; contested at Strictest (Δ24 if residual) |

| Vaccine excipient | Treatment |
|---|---|
| Porcine gelatin (some MMR, varicella, FluMist) | Tier 1 unless trace (Δ24) or Δ23/Δ26 applies; porcine-free alternatives exist for several (Merck MMR-II uses bovine gelatin) |
| Bovine gelatin | Halal-certified 0; uncertified 0 at Sc A/B/C, minor flag at Strictest |
| Aluminium adjuvants, thimerosal | Tier 0 |
| Squalene (MF59) | Verify the source (shark-liver or synthetic) |
| Human serum albumin | Tier 0 (human-derived material is not *najis*) |
| Bovine serum albumin residue | Trace → Tier 0 / Δ24 |

**F7 Modifier Rule:** F7(b) excipient result = 0 → F7 = 0 at every scenario (herd-immunity *maṣlaḥah ʿāmmah*). F7(b) > 0 → Δ23 or Δ26 first (both give 0); else Δ24 if trace; else F7(a) elective share × F7(b) rate; if F7(a) = 0 (universally indicated), the F7(b) rate. Sources: CDC Pink Book Appendix B (vaccine excipient summary), EMA SmPCs.

## §26 — F8: oncology excipients

Oncology is Tier 0 at every scenario (*ḥifẓ al-nafs*). Cremophor EL, polysorbate 80, buffer salts, sugars, human albumin (Abraxane), amino-acid stabilisers, PEG and ADC linkers are all Tier 0; legacy BSA residue is trace. Strictest: a 1–3% Tier-2 flag only if a porcine derivative is explicitly confirmed and no alternative exists — and Δ23 then usually applies anyway. For oncology issuers the verdict is decided at Gate 2, not Gate 4.

## §27 — F9: diagnostics

| Category | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| Clinical chemistry, haematology, coagulation, tissue diagnostics, sequencing, point-of-care, blood-donor screening, HPV, STI panels | 0 | 0 | 0 | 0 |
| Immunochemistry | 0 | 0 | 0 | 0 (2% Tier-2 flag on fertility hormones if material) |
| Molecular viral load (HIV, HCV, HBV) | 0 | 0 | 0 | 5–10% Tier 3 |
| **NIPT** | 0 | 0 | **8–15% Tier 3 (mid 12%)** | **25–40% Tier 2 (mid 30%)** |
| Consumer ancestry DNA | 0 medical / Tier-3 flag for ancestry-only use | same | Tier-3 flag | same |

NIPT materiality: < 1% of group → non-material; 1–5% → calibrate carefully; > 5% → primary driver needing full Δ19. Anchor: Bowman-Smart et al., *Prenatal Diagnosis* 2020;40(7):832–841 — evidence of NIPT-driven sex-selective termination "remains largely anecdotal". Roche Harmony ≈ CHF 250M (0.41% of group): even at 30% Strictest, < 0.13% of consolidated.

## §28 — F10: legitimate therapeutic focus

Indicators of therapeutic focus: on-label revenue ≥ 80% of contested-category revenue; WHO Essential Medicines List; national formularies and reimbursement; takaful coverage; clinical-guideline inclusion (ADA, AHA, NCCN); marketing around the condition. Indicators of lifestyle focus: DTC aesthetic marketing; off-label exceeding on-label; medspa / cash-pay channels (KFF: 17% online, 9% medspa); no insurance coverage. Classify the issuer therapeutic-dominant / mixed / lifestyle-dominant and move the Δ19 point **within its band** accordingly; write the reasoning down.

## §29 — F11: prescription-medicine channel

The prescriber-gate analysis applies only to issuers that are the prescriber or materially steer the prescriber (DTC prescriber-dispensers; DTC manufacturers with direct-to-physician sales). For manufacturers selling through wholesalers and pharmacies the gate is downstream (+0pp Δ8). Gate strengths and Δ8 values: §17.

## §30 — Acquisition financing and treasury classification

| Treasury holding | Layer-1 treatment |
|---|---|
| T-bills, notes, bonds, money-market funds, commercial paper, corporate bonds, conventional deposits | Counted (L1 / L8) |
| Equity securities | Not counted (dividends follow look-through) |
| Verified sukuk / Islamic deposits | Not counted |
| Non-interest operating balances | Not counted |

| Acquisition financing | Gate-2 effect |
|---|---|
| Cash on hand, stock issuance | No IBD effect; Tier 0 |
| Verified sukuk | Excluded from IBD |
| Bonds, bank facilities, term loans | IBD (model pro-forma ratios for deals > 5% of MCAP) |
| Convertible notes | IBD at principal (Δ20) |
| Earn-outs, deferred consideration | Not IBD unless interest-bearing |

For a deal above 5% of MCAP: is the target Tier 0? how is it financed? do the ratios move post-close? does the deal widen the *iʿānah* surface? Precedents: NVO–Catalent (DKK 73B new debt FY2024; IBD up 3.1×, still within caps); Roche–Telavant (CHF 4.5B new debt); HIMS 0% convertible (May 2025).

## §31 — Insurance analysis

| Exposure | Treatment |
|---|---|
| Conventional underwriting as primary business | P1-INS → CATEGORICAL FAIL |
| Underwriting as a segment > 5% | CATEGORICAL FAIL (U2; BRK) |
| Distribution / brokerage / lead generation as primary business | Δ14 → CATEGORICAL FAIL at ≥ 80% (EVER) |
| Analytics / BPO / software sold to insurers | Δ16 customer-mix at Sc B+ (EXLS) |
| Insurance for the issuer's own staff | Tier 0 |
| Healthcare provider paid by insurers; pharma reimbursed by insurers | Tier 0 — the payment channel does not classify the product |
| Health payers | Δ10 (§5 step 5) |
| Takaful / retakaful | Tier 0 (Δ12) |
| Reinsurance (conventional) | P1-INS |

## §32 — The pharmaceutical necessity framework (Δ23–Δ26, F6/F7 Modifier Rules)

**Δ23 — Necessity Override (life-saving).** Collapses Δ18/F5/F6/F7 attribution to **0% at every scenario** when **all four** hold: (1) the condition carries material risk of death, irreversible organ failure or severe permanent disability without treatment; (2) the product is standard of care or a recognised alternative within it; (3) the attributed population is medically indicated; (4) any off-label, cosmetic or elective share is analysed separately under Δ19 and does not inherit Δ23. Canonical: paediatric combination vaccines, rabies vaccine and immunoglobulin, meningococcal vaccines, infant RSV immunisation (Beyfortus), insulin for T1D, oncology, haemophilia factor, acute MI/PE anticoagulation, HIV antiretrovirals, TB treatment. Not Δ23: healthy-adult seasonal flu (→ F7 Modifier or Δ26), cosmetic GLP-1, recreational ED, cosmetic dermatology, mild atopic dermatitis. *Maṣlaḥah* (welfare) weighs toward permissibility but does not collapse attribution; only *ḍarūra* (necessity) does. Write the four-part bar out in every report that uses it. (Rashid Condition 1.)

**Δ24 — Trace De Minimis.** If the problematic substance is (a) not the active ingredient, (b) < 1% of the final product by mass, volume or composition, and (c) unrelated to the therapeutic purpose → fixed Tier-2 rates **1% / 1% / 2.5% / 5%** on the exact product line (segment line if product revenue is undisclosed). Basis: *istihlāk* / *istihālah*. Yes: porcine-gelatin stabiliser in a flu vaccine; BSA residue; magnesium stearate; trace porcine processing enzymes. No: porcine heparin or porcine pepsin as the active (→ Δ25). Fetal cell-line residue (MRC-5, WI-38) where Δ23 does not apply: case by case (Δ24 if residual).

**Δ25 — No-Alternative Rule.** The problematic material is the active or > 1% (Δ24 fails), the use is therapeutic but not life-saving (Δ23 fails), and **no halal alternative exists at clinical scale** → **0% / 0% / 2.5% / 5%**. Affordability of an existing alternative is not a ground (Rashid Condition 4's affordability extension was rejected). Canonical: enoxaparin (Lovenox) prophylaxis — global heparin supply is > 95% porcine; Creon / pancrelipase; animal-lung surfactants for prophylactic use. Cite at least one source for the no-alternative finding. (IIFA Resolution 67/4; ECFR Stockholm 2003.)

**Δ26 — Communal Benefit Override.** Collapses to **0% at every scenario** when: (1) the target disease carries material aggregate mortality risk at population level; (2) a competent authority (WHO, CDC ACIP, ECDC, a national ministry) recommends the intervention at population scale; and (3) no halal alternative exists at scale, or the collective benefit (herd immunity, transmission reduction, antimicrobial stewardship) cannot be substituted by individual-only interventions. Δ23 is individual; Δ26 is collective (*al-ḥājah al-ʿāmmah tunazzal manzilat al-ḍarūrah*; Rashid p. 14). Temporal scope per U7: the declared emergency window only. First application: MRNA FY2020–FY2022 (~$38.5B, 0%).

**F6 and F7 Modifier Rules (Reading 2):** §24 and §25. Ingredient-clean + therapeutic → 0.

**Doctrinal anchor — Rashid's five conditions.** (1) sufficient medical necessity → Δ23; (2) proven effectiveness → regulatory approval plus real-world evidence (flag experimental use); (3) benefit outweighs harm → embedded in the regulatory benefit-risk review; (4) no readily available halal alternative → Δ25 (no affordability extension); (5) permissibility lasts only as long as the need → quarterly re-screening. *Farḍ kifāyah* to develop halal medicines is acknowledged but not a screening factor (ESG-style halal-certification scoring was rejected). Citation: Rashid, R. (2025), *The Five Islamic Legal Conditions for Permitting Prohibited Medicines*, Al Balagh Academy; https://halalmed.org/wp-content/uploads/2026/02/The_Five_Islamic_Legal_Conditions_for_Pe.pdf

## §33 — Δ27: on-label cosmetic enhancement

**§33.1 Reconstructive Carve-Out (Δ27(a)).** Therapeutic restoration of structure or function lost to disease, injury, congenital defect or surgery → **0% at every scenario**, even for cosmetic-labelled products (post-mastectomy AlloDerm, hernia repair, scar revision, cleft palate, post-trauma reconstruction, HIV facial lipoatrophy).

**§33.2 Temporal Modifier (Δ27(b)).**

| Use | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| Temporary cosmetic (reverses unaided, or the label states an effect ≤ 24 months) | 0% | 0% | **50%** | 100% |
| Permanent cosmetic (needs surgery or intervention to reverse; destroys cells; implants; tattoo) | 0% | 0% | **100%** | 100% |

**§33.3 Temporal test.** Reverses unaided within 24 months → temporary (Botox 3–6 months; HA fillers 6–18 months; Latisse on discontinuation). Needs ongoing application to maintain → temporary (SkinMedica, Diamond Glow). Permanently alters anatomy or destroys tissue → permanent (CoolSculpting, implants, PMMA / silicone fillers, permanent-makeup tattoo). Surgical alteration → permanent. Boundary products (Radiesse up to 18 months; Sculptra up to 24 months) follow the label.

**§33.4 Anchors.** Qur'an 4:119 (*taghyīr khalq Allāh*); the ḥadīth on tattooing and tooth-filing (permanent alteration); Hanafi (*al-Hidāyah*, *Radd al-Muḥtār*) and Hanbali (*al-Mughnī*) positions; ECFR, Dār al-Iftāʾ Egypt and JAKIM fatāwā converging on the temporary / permanent line.

**§33.5 On-label vs off-label (Δ27(c)).** On-label cosmetic products → Δ27. Off-label cosmetic use of a therapeutic drug → **Δ19 empirical attribution**: the strongest real-world share becomes the Sc C rate; at Strictest the pre-v4.4 mid-band is the ceiling (25% obesity GLP-1, 35% T2D GLP-1 off-label, 30% ED recreational) — **except for the categories locked by U1 (GLP-1, ED), which take 100% of the line at Strictest.** Hybrid products: Δ27 on the cosmetic-labelled share, carve-out on a documented reconstructive share. AbbVie reports Botox Therapeutic and Botox Cosmetic separately; treat Botox Cosmetic as 100% on-label cosmetic.

**§33.6 Empirical proportions.** Botox FY2025: therapeutic $3.769B / cosmetic $2.602B (59.2 / 40.8, disclosed). Juvederm: 100% cosmetic except HIV lipoatrophy (< 2%). CoolSculpting: permanent. AlloDerm: ~85% reconstructive / ~15% cosmetic (Margulies et al., *Gland Surgery* 2018; PMC7732151). Natrelle implants: use the issuer's split, else 60% cosmetic / 40% reconstructive (IMARC 2024: 65.7 / 34.3; MRFR 2023: 57 / 43). Every carve-out estimate needs at least two sources and a ±10pp sensitivity.

## §34 — Pharmaceutical rule hierarchy (walk per revenue line)

1. **Δ23** life-saving → 0%, stop.
2. **Δ26** declared public-health emergency (inside the U7 window) → 0%, stop.
3. **Δ27(a)** reconstructive use → 0%, stop.
4. **F6 / F7 Modifier** ingredient-clean + therapeutic → 0%, stop.
5. **Δ27(b)** on-label cosmetic → 0 / 0 / 50 or 100 / 100%, stop for that line.
6. **Δ19 / U1** off-label, cosmetic, recreational or vanity share of a therapeutic drug → empirical rate inside its band (U1 categories: Strictest 100%); the therapeutic remainder continues to step 7.
7. **Δ24** trace excipient → 1 / 1 / 2.5 / 5%, stop.
8. **Δ25** active ingredient, no halal alternative → 0 / 0 / 2.5 / 5%, stop.
9. **F5 / F6 / F7 / Δ18** defaults for whatever is left.

Never cross-apply this hierarchy to media issuers (Part VII has its own).

## §35 — Worked examples

**§35.1 Sanofi (SNY) FY2025 under the necessity framework.** Revenue €43,626M.

| Line | €M | Rule | Sc A / B / C / Strictest |
|---|---|---|---|
| Dupixent | 15,714 | Δ19 (mild-AD off-label, Eichenfield 2022) | 0 / 0 / 5 / 15% |
| Beyfortus | 1,781 | Δ23 | 0 |
| Flu vaccines (Fluzone, Flublok) | 2,314 | F7 Modifier | 0 |
| Paediatric combinations, rabies, meningitis, travel | ~3,841 | Δ23 | 0 |
| Insulin franchise | 3,078 | Δ23 + Δ21 | 0 |
| Rare disease, oncology, haemophilia, specialty | various | Δ23 | 0 |
| Lovenox (porcine heparin, prophylactic share) | 822 | Δ25 | 0 / 0 / 2.5 / 5% |
| Plavix and other cardiometabolic | 910 | F6 Modifier | 0 |
| Layer-1 interest | 330 | Tier 1 | 100% |
| **NPI** | | | **0.76% / 0.76% / 2.61% / 6.25%** |

Gate 4: PASS / PASS / PASS / **FAIL (6.25% > 3%)**. Gate 2 (20-F XBRL): IBD €18,702M / TA €126,805M = 14.7% (track b 16.1%) — but goodwill €41,300M + intangibles €26,261M leave a Hanbali denominator of only ~€37–71B across 2025's market-cap range, so **R7 exceeds 30% at Sc C** below ~€130B of MCAP (F42). **Verdict v5.0: PASS / PASS / FAIL (Gate 2, R7) / FAIL (Gate 2 + Gate 4).** Trajectory of Sc C: 12.6% (v4.3) → 5.79% (v4.4) → 2.61% (v4.4.1) — a correction of over-strictness, not a relaxation. Purification: Part XIII.

**§35.2 AbbVie (ABBV) FY2025 under Δ27 — restated (F3, F24).** Revenue $61,160M.

| Aesthetics line | $M | Sc C | Strictest |
|---|---|---|---|
| Botox Cosmetic (temporary) | 2,602 | 50% → 1,301 | 100% → 2,602 |
| Juvederm (temporary) | 993 | 50% → 497 | 100% → 993 |
| CoolSculpting (~50% of Other Aesthetics, permanent) | ~632 | 100% → 632 | 632 |
| AlloDerm reconstructive (85%) | ~108 | 0 | 0 |
| AlloDerm cosmetic (15%, permanent) | ~19 | 19 | 19 |
| Latisse, SkinMedica, Diamond Glow (temporary) | ~367 | 50% → 184 | 367 |
| Natrelle reconstructive (40%) | ~56 | 0 | 0 |
| Natrelle cosmetic (60%, permanent) | ~83 | 83 | 83 |
| **Aesthetics subtotal** | 4,860 | **2,716 (4.44%)** | **4,696 (7.68%)** |
| Creon (porcine pancrelipase, Δ25) | 1,512 | 2.5% → 38 (0.06%) | 5% → 76 (0.12%) |
| Layer-1 interest | 266 | 0.43% | 0.43% |
| **NPI** | | **4.93%** | **8.23%** |

Sc A / Sc B NPI 0.43%. Gate 2 (10-K XBRL): IBD $67,496M (short-term $2,499M + debt and finance leases $64,997M) / TA $133,960M = **50.4%** (the report's 51.6% superseded); book equity −$3,270M (Δ38: equity ratios undefined; MCAP ratios valid; Sc A IBD/MCAP ~22% passes). **Verdict:** Sc A PASS; Sc B FAIL (Gate 2); Sc C FAIL (Gate 2; Gate 4 passes at 4.93%, within 0.5pp of the cap — monitoring flag); Strictest FAIL (Gate 2 + Gate 4). Likely next Δ27 issuers: Galderma, Bausch + Lomb, Establishment Labs, InMode, cosmetic dentistry channels.

---

# PART VII — MEDIA AND ENTERTAINMENT (F12, Δ28–Δ38)

## §36 — F12: statement, scope and readings

**Holding:** general media and entertainment is **not** a categorically prohibited industry. A media issuer passes Gate 1 and is screened at Gate 4 for the specific impure lines its catalogue, hospitality, advertising and any gambling integration generate.

**In scope:** film studios; TV and episodic producers; SVOD / AVOD / FAST streaming; music labels and music streaming; sports media; broadcast and cable networks; theme parks and experiences; licensing and syndication; exhibitors; conglomerates combining these. **Adjacent (screen under other rules):** casino and sportsbook operators (P1-GMB); adult producers (P1-ADT); ad-tech intermediaries (F11 + Δ14 if ≥ 80% toward a P1 vertical); game publishers whose revenue is mainly real-money or loot-box mechanics (P1-GMB / §52).

| Reading | Position | Gate 1 | Gate 4 | Status |
|---|---|---|---|---|
| (a) Categorical *lahw* | General entertainment is idle diversion and impermissible per se | CATEGORICAL FAIL | n/a | Documented minority position (strict Hanbali / Deobandi); only when a client mandate elects it |
| (b) Blanket attribution | Attribute all entertainment revenue at one rate | PASS | One rate | Fallback only, when no per-service or per-catalogue split can be recovered |
| **(c) Default-permissible with specific content attribution** | Conditionally permissible (AAOIFI SS 21 silence; DJIM / S&P / FTSE / MSCI practice); attribute genuinely impure content line by line | PASS | Per-service measured rates (Δ35), archetype card as fallback | **Platform default (U9)** |

Reading (c) is a *pricing* doctrine, not a permission doctrine: it does not say all content is ḥalāl; it says impurity is line-specific and must be attributed line by line.

Anchors: Qur'an 31:6 and the *malāhī* corpus (blame attaches to specific impure content, not to the medium); the *samāʿ* and animate-imagery debate (F12 prices it, it does not resolve it); *ijārah* of permissible capacity to a mixed-use lessee (grounds the Sc A advertising carve-out); *iʿānah ʿalā al-maʿṣiyah* (grounds Tier-1 treatment of alcohol and gambling promotion); AAOIFI SS 21 does not enumerate general media.

## §37 — Content rates: the archetype card and the decomposition order

The **archetype card** is the first-pass anchor, the fallback where measurement is impossible, and the cross-issuer calibration reference. Measured Δ35 rates replace it wherever data allows. Rates rise across lenses because the set of flags counted widens (§46), not because the catalogue changes. **Background and incidental music is never a flag** (U9).

| Archetype | Sc A | Sc B | Sc C | Strictest | Examples |
|---|---|---|---|---|---|
| Family / walled garden | 4% | 5% | 7% | 12% | Disney+ (Marvel, Pixar, Star Wars, Nat Geo); kids and faith services |
| General-entertainment SVOD (mature content present) | 30% | 35% | 40% | 50% | Hulu SVOD; Netflix; Max; Paramount+ with Showtime |
| vMVPD / live-linear bundle (Δ30) | 12% | 15% | 20% | 28% | Hulu + Live TV; YouTube TV; Fubo; Sling |
| International music / dance-heavy catalogue | 12% | 15% | 20% | 30% | Hotstar residual; Bollywood-weighted services |
| Studio content sales / licensing (blended slate) | 18% | 22% | 28% | 38% | Mixed family + mature slates (attribute by label where disclosed) |
| Music label / music streaming | 20% | 25% | 30% | 40% | Placeholder only — music-as-product is an open election (§39(vi)) |
| Pure sports content | 0% | 0% | 0% | 3% | Live sport is Tier 0; gambling (Δ32) and advertising (Δ31) are separate lines |
| News / documentary / factual | 0% | 0% | 2% | 5% | Strictest residual for ideological content |

**Measured NFLX-calibrated anchors:** streaming TV-MA-weighted 35 / 40 / 60 / 78% (estimated components — F34); theatrical R-rated base 35 / 45 / 65 / 85%.

**Decomposition order:** (1) per-service subscription revenue, disclosed or back-solved (Δ29); (2) per-segment or per-label revenue; (3) Reading (b) blended fallback. Always separate **subscription / content-access** revenue (content rate), **advertising** (Δ31), **gambling integration** (Δ32), **hospitality / F&B** (Δ33) and **financial income** (Gate 3), so nothing is counted twice.

## §38 — Media decision tree (v5.0)

1. **Gate 1.** Pure-play casino or sportsbook, adult producer, or other P1 primary business → CATEGORICAL FAIL; stop. Otherwise PASS.
2. **Client reading.** Reading (a) elected → document a categorical fail under that mandate; stop. Otherwise Reading (c).
3. **Decompose** revenue into content (per service / segment), hospitality and experiences, advertising, gambling integration, licensing, and financial lines.
4. **Content.** Assign each content line an archetype (first pass); apply at all four scenarios (Δ28); replace with measured Δ35 rates wherever data permits, labelling every component measured or estimated; exhibitors use the box-office-by-rating base (Δ36); apply the vMVPD distribution rate (Δ30) and its forward carve-out; carve clean tiers only under the strict Δ34 bar and the clean-tier ceiling registry (§39(v)).
5. **Advertising** (Δ31): by advertised product; Sc A *ijārah* carve-out; Sc B+ full look-through.
6. **Gambling integration** (Δ32): Tier-1 *maysir* at 100% at every scenario, sized granularly.
7. **Hospitality / F&B** (Δ33, §16): size alcohol, pork, non-zabīḥah meat and bar sub-shares once; point estimate at Sc A/B, conservative edge at Sc C/Strictest; pork and alcohol at every lens; non-zabīḥah only at Sc C/Strictest (D13).
8. **Financial lines.** Gross L1 into Gate 3 and the Gate-4 numerator (D5); equity-method look-through only if material (U4); IBD on the Δ37 tracks; Δ38 for negative equity.
9. **Aggregate** NPI per scenario against 5 / 5 / 5 / 3% and report the full four-scenario table (S8).

Common failure modes: defaulting to a categorical *lahw* fail; giving a mature SVOD a 0% Sc A rate (the Δ28 hole); counting advertising twice (once in ARPU-based content, once in Δ31); flagging a whole resort or F&B line because it has a bar; leaving Layer-1 interest out of the total (F8); letting the lens move a sub-line's size (F25); cross-applying the pharma hierarchy.

## §39 — Media data disciplines (cross-cutting)

1. **Gross vs net interest:** Layer 1 and purification use gross interest income from the footnotes, never an FX-netted "interest and other income" line (NFLX: $295M gross vs $172.5M net). Applies beyond media.
2. **F&B calibration registry:** Disney parks / cruise alcohol 0.7–1.5% of group; AMC concessions alcohol 5–10% of F&B, pork 0–3% of F&B. State the band every time (§16).
3. **Feed verification:** reconcile aggregator feeds to the 10-K before computing any gate (AMC: the feed showed +$1,848.6M operating income and a +$1,946.3M "gain" where the 10-K showed an operating loss of ~$17.4M and ~$196M of debt-extinguishment losses; it also folded ~$4.0B of operating leases into "capital lease obligations" against $52.5M of true finance leases). See §XII.10.
4. **Competitor figures:** reconcile or footnote as an unreconciled artefact; never adopt, average or "split the difference" (Musaffa's NFLX "interest and other income 18% of revenue" is impossible as an income item — gross interest is 0.65% of revenue). When the verdict agrees but the attribution differs (DIS: platform Sc B 8.3% vs Musaffa 77.9%), document the reconciliation.
5. **Clean-tier ceiling registry:** streaming / episodic — TV-PG and below (NFLX); theatrical — PG-13 and below (AMC). A per-issuer deviation needs a logged analyst election.
6. **Music-as-product register (open):** the Δ35 music exclusion covers music incidental to video only. A music label or music-streaming issuer needs a fresh election among (a) categorical *lahw* at strict lenses, (b) the archetype rate, or (c) a split by music type (instrumental / nasheed / recitation vs mainstream vocal vs explicit). Podcasts and audiobooks are a second open election.
7. **Measured vs estimated (F34):** every Δ35 component (maturity split, flag prevalences, overlap adjustment) is labelled measured or estimated, with its source. A rate built on a reconstruction is "estimated" whatever its precision.

## §40 — Δ28: universal content-impurity attribution

A service or catalogue that carries materially impure content is attributed **at all four scenarios, including Sc A**. The lens changes the rate (which flags count), never whether attribution happens. Only family / walled-garden (non-zero floor), pure sports and news / factual archetypes can sit at or near zero at Sc A. If you write 0% at Sc A for a mature-content service you have made the Δ28 error. Precedent: Hulu SVOD contributed 1.68pp at Sc A alone (5.6% of group × 30%), pushing DIS over the Sc A cap.

## §41 — Δ29: per-service back-solve and disclosure sunset

Where per-service revenue decides the verdict and is not disclosed: **service revenue ≈ average monthly ARPU × average paid subscribers × 12**, computed per quarter and **tied to the disclosed segment total within ~2%** (otherwise the ARPU basis or subscriber averaging is wrong — fix it before publishing). Commission the sourcing pass only when a service is the swing input or when one disclosure line mixes archetypes. **Double-count fix:** disclosed ARPU includes advertising, so the content rate applies to subscription-only revenue (net the allocated advertising out, or use the disclosed subscription-fees line) and all advertising flows through Δ31. **Disclosure sunset:** when an issuer stops disclosing subscribers and ARPU, the last disclosed quarter becomes the permanent anchor and a standing staleness caveat (Disney after FY2025 Q4; Netflix after 2024). DIS back-solve: Disney+ ~$11.7B total / ~$10.5B subscription-only; Hulu SVOD ~$7.8B / ~$5.3B; Hulu + Live TV ~$5.3B / ~$5.0B; sum ~$24.6B vs disclosed DTC revenue $24.614B (within 1.6%) and subscription-only ~$20.8B vs disclosed subscription fees $20.772B.

## §42 — Δ30: vMVPD distribution rate and merged-entity carve-out

A live-linear bundle delivered over IP is a carriage business, not an own catalogue: it takes the distribution archetype (12 / 15 / 20 / 28%), not the SVOD rate. When such a unit merges into a separately consolidated entity, score it at the distribution rate for the final in-house fiscal year, then carve it out and screen the merged entity on its own (no double screening). Precedent: Hulu + Live TV (~5.3% of DIS) at the distribution rate for FY2025; forward carve-out from FY2026 after the Fubo combination (70% Disney / 30% Fubo, closed 29 Oct 2025).

## §43 — Δ31: advertising pass-through

Impure advertising is attributed by the **nature of the advertised product** (conventional finance, alcohol, gambling, tobacco, other P1 goods), never by the advertiser's identity.

| Lens | Treatment | Basis |
|---|---|---|
| Sc A | **Ijārah carve-out:** attribute only direct promotion of prohibited goods (alcohol, gambling, tobacco ads); conventional-finance ads are a permissible lease of display capacity | *Ijārah* of capacity to a mixed-use lessee |
| Sc B | Full look-through: finance + alcohol + gambling + tobacco ads | AAOIFI look-through to the promoted activity |
| Sc C / Strictest | Full look-through at the conservative edge of the benchmark band | Strict *iʿānah* |

Apply the attributable share to the consolidated advertising base (linear + digital + DTC ad tier + sports advertising). Without issuer disclosure, use TV ad-category benchmarks (financial services ~8–12% of US linear ad spend; alcohol ~4–7%; sportsbook varies by property), triangulated per Δ19, with source and band. Apply the Sc A carve-out the same way for every issuer. DIS: ad base ~$11.1B → 0.30 / 1.50 / 2.00 / 2.50% of group. NFLX: ad base ~$1.5B (gambling, tobacco, adult and crypto ads banned) → 0.20 / 0.66 / 0.83 / 1.00%.

## §44 — Δ32: media-gambling integration (*maysir*)

Sportsbook licensing and branding fees, gambling-operator integration economics, and sportsbook / gambling advertising inside a media property are **Tier-1 *maysir* at 100% at every scenario**, sized granularly (Δ33). The line is **structural**: replacing one sportsbook partner with another does not reduce it (ESPN BET / PENN, terminated 1 Dec 2025, replaced the same day by an exclusive DraftKings sportsbook and odds deal); only exiting gambling integration altogether removes it. DIS: PENN licence ~$150M/yr + estimated ESPN sportsbook advertising ~$200M → band 0.4–0.6% of group (point 0.5%). Sports content itself stays Tier 0.

## §45 — Δ33 and Δ34: contaminated lines and clean tiers

**Δ33 — granular sub-line attribution:** the full rule, with the v5.0 sizing amendment, is §16.

**Δ34 — intra-service clean-tier carve-out:** a clean tier inside one undifferentiated service is carved to **0% at every scenario** only if **all four** hold: (1) a curated, separately navigable walled garden (a Kids profile, not a genre filter); (2) a platform-enforced rating ceiling per the registry (§39(v)); (3) genuinely clean, not merely less impure (G / PG / TV-Y / TV-G / TV-PG); (4) a disclosed or independently measurable share, taken at its conservative edge. Use viewing share as a revenue proxy only for a single-SKU service, and say so. The residual is attributed in full under Δ28 with no spillover credit. Precedent: Netflix kids & family = 15% of viewing (point figure; band 12–18%) → 14.50% of group carved; residual non-kids subscription base = 82.18% of group.

## §46 — Δ35 and Δ36: measured content flags and the exhibitor rule

**Δ35 — viewing-weighted content-flag attribution.** The content rate is built bottom-up from (i) a **viewing-weighted** (streaming: hours per title) or **box-office-weighted** (theatrical) maturity decomposition — catalogue counts are not acceptable, because long tails of little-watched mature titles overstate the mature share — and (ii) a cumulative flag taxonomy, combined as an **overlap-adjusted union** (flags co-occur heavily; nudity and profanity ~80%), never a naive sum:

| Flag | Counted from | Definition |
|---|---|---|
| (a) Explicit sexual content / nudity | Sc A | The permissive-lens floor |
| (b) Broader sexual content | Sc B | Sexual themes beyond the explicit subset |
| (c) Meaningfully immodest imagery | Sc C | Revealing or sexualised dress, dance, intimate non-explicit scenes — NOT "any uncovered person" (that collapses Sc C toward 100% and is rejected) |
| (d) Graphic violence; ideological / blasphemous content | Strictest | Gratuitous violence; content gravely contrary to creed |

Music incidental to video is excluded at every lens (U9). Protocol: base after Δ34 and Δ29 → viewing-weighted maturity split with bands → per-flag prevalence (rating studies, parental-guide aggregations, academic literature) → overlap-adjusted union per lens → attribution = base × flagged share → report the band and confirm robustness → where measurement is impossible, use the archetype card, label it a fallback, and log a sourcing pass. NFLX: non-kids viewing ~45–55% TV-MA / R, ~35–45% TV-14 / PG-13, ~10–15% TV-PG → 35 / 40 / 60 / 78% (bands 30–45 / 35–48 / 52–68 / 70–85), **estimated** (F34).

**Δ36 — exhibitor sub-rule (pass-through content).** An exhibitor authors no content but earns admissions from it, so the content base is the **box-office-by-rating mix it exhibits, revenue-weighted** (R tickets price above children's PG tickets; record both the revenue and admissions bases where they differ). Apply the theatrical clean-tier ceiling (G + PG + PG-13 → 0%); score the residual R / NC-17 / adult-NR share at the theatrical per-flag rates (35 / 45 / 65 / 85%, violence-heavy). Expect an exhibitor's main impurity to sit in concessions (Δ33) and its decisive test to be financial. Extends to other exhibitors (Cinemark, Marcus, Cineworld / Cineplex) and live-event venues.

**Δ37 (dual-track leverage) and Δ38 (negative equity)** apply to every issuer: §6 and §11.

## §47 — Media worked examples (restated under v5.0)

**§47.1 Disney (DIS) FY2025** — revenue $94,425M; IBD $42,026M + finance leases $162M = 21.4% of TA $197,514M (track b with ~$3,235M operating leases: 23.0%); MCAP ~$179B → IBD/MCAP 23.5%. Gate 2 passes at Sc A and Sc B; at Sc C and Strictest the Hanbali ratio fails (goodwill $73.3B + intangibles $9.3B → R7 = 43.8%; F42). Layer 1: gross interest and investment income $507M (0.54%; the footnote splits ~$246M investment income — confirm the interest-only part at re-screen).

| Line (% of group) | Sc A | Sc B | Sc C | Strictest | Basis |
|---|---|---|---|---|---|
| Disney+ (family, 11.1%) | 0.44 | 0.56 | 0.78 | 1.33 | Archetype |
| Hulu SVOD (5.6%) | 1.68 | 1.96 | 2.24 | 2.80 | Archetype (Δ28) |
| Hulu + Live TV (5.3%) | 0.64 | 0.80 | 1.06 | 1.48 | Δ30 |
| Hotstar residual (0.3%) | 0.04 | 0.05 | 0.06 | 0.10 | Archetype |
| Studio licensing (9.0%) | 1.62 | 1.98 | 2.52 | 3.42 | Archetype |
| **Content subtotal** | **4.42** | **5.34** | **6.66** | **9.14** | |
| Alcohol — parks / resorts / cruise (band 0.7–1.5) | 1.10 | 1.10 | 1.50 | 1.50 | Δ33, D9 |
| Sportsbook licensing + ads (band 0.4–0.6) | 0.50 | 0.50 | 0.60 | 0.60 | Δ32, D9 |
| Advertising pass-through | 0.30 | 1.50 | 2.00 | 2.50 | Δ31 |
| Pork / non-zabīḥah F&B (band 0.0–0.4) | 0.20 | 0.20 | 0.40 | 0.40 | D9, D13 |
| Layer-1 interest | 0.54 | 0.54 | 0.54 | 0.54 | D5 |
| **NPI (v5.0)** | **7.06%** | **9.18%** | **11.70%** | **14.68%** | v4.4.4: 5.82 / 8.34 / 10.56 / 14.14 |

**Verdict: FAIL all four** (Gate 4); leverage clean. Competitors: Musaffa 77.9% (whole-line flagging; both financial screens pass); not held by SPUS or HLAL. Monitoring: per-service disclosure sunset; Fubo carve-out; ESPN gambling continuity; any ESPN divestiture (−0.5pp); MCAP below ~$127B lifts IBD/MCAP toward 33%.

**§47.2 Netflix (NFLX) FY2025** — revenue $45,183M (subscription ~$43,683M; advertising ~$1,500M); net income $10,981.2M; diluted EPS $2.53. IBD $14,462.9M (notes; no finance leases) / TA $55,597M = **26.0%** (track b with $2,513M operating leases: 30.5%); IBD/MCAP ~4.0% (MCAP ~$363B). Gate 2: PASS Sc A/B/C, **FAIL Strictest**. Layer 1: $295M gross (0.65%).

| Line | Base | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|---|
| Kids & family (Δ34) | 14.50% | 0 | 0 | 0 | 0 |
| Non-kids content (Δ35, estimated) | 82.18% | 28.76% (35%) | 32.87% (40%) | 49.31% (60%) | 64.10% (78%) |
| Advertising (Δ31) | 3.32% | 0.20% | 0.66% | 0.83% | 1.00% |
| Layer-1 interest | — | 0.65% | 0.65% | 0.65% | 0.65% |
| **NPI (v5.0)** | | **29.61%** | **34.18%** | **50.79%** | **65.75%** |

**Verdict: FAIL all four.** Superseded figures: the archetype version (24.85 / 29.43 / 33.70 / 42.09%) and the v4.4.4 restatement without Layer 1 (28.96 / 33.53 / 50.14 / 65.10%). The report's §11 arithmetic error is corrected (F8). WBD: terminated; $2.8B fee in Q1 2026 (F10, D14). Δ35 components are estimated (F34).

**§47.3 AMC Entertainment (AMC) FY2025** — revenue $4,848.9M (admissions 54.71%, F&B 34.47%, screen advertising 3.14%, other 7.69%). Track (a) IBD $4,038.5M + finance leases $52.5M = $4,091.0M / TA $8,017.8M = **51.0%**; track (b) $8,136.0M = **101.5%**; book equity −$1,894.8M (accumulated deficit −$8,979.2M); goodwill $2,416M exceeds MCAP ~$0.9B, so the Hanbali ratios are undefined (Δ38); IBD/MCAP ~444% (a real, failing value). Interest expense $530.2M (10.9% of revenue). Going-concern-type language in the 10-K (G-flag).

| Line | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| Admissions — R-rated content (Δ36 / Δ35; R base 14.22% of group) | 4.98 | 6.40 | 9.25 | 12.09 |
| F&B alcohol (band 5–10% of F&B) | 2.59 | 2.59 | 3.45 | 3.45 |
| F&B pork / non-zabīḥah (band 0–3% of F&B) | 0.52 | 0.52 | 1.03 | 1.03 |
| Screen advertising (Δ31) | 0.06 | 0.19 | 0.25 | 0.31 |
| Other (strict residual) | 0 | 0 | 0.05 | 0.10 |
| Layer-1 interest ($8.0M) | 0.16 | 0.16 | 0.16 | 0.16 |
| **NPI (v5.0)** | **8.31%** | **9.86%** | **14.19%** | **17.14%** |

**Verdict: FAIL all four** — overdetermined (Gate 2 at every lens, the negative-equity flag, and Gate 4). The v4.4.4 figures (6.76 / 9.69 / 13.68 / 16.99%) are superseded. No dividend. Re-screen trigger: a recapitalisation that restores positive equity **and** brings leverage below the caps **and** addresses alcohol.

---

# PART VIII — OTHER SECTORS: THE HARD CASES

No issuer in the eighteen-issuer record comes from these sectors, so each rule below is a **default pending its first screen**; the first issuer in each sector ratifies or amends it. The rules reuse machinery the record has already tested (Tier 1 at 100%, Δ24 rates, Δ31's *ijārah* logic, Δ33 sizing). The three data-gap types from the sector maps recur throughout: **Type 1** (a prohibited sub-line buried in a multi-line company — solved with a category-mix benchmark × reported revenue), **Type 2** (a prohibited input inside a permissible product — solved with SKU-to-flag mapping × brand revenue), **Type 3** (hidden financial income — solved by footnote parsing, Part IV).

## §48 — Food and beverage manufacturers (Type 2)

| Ingredient situation | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| Product whose character is prohibited (pork products, alcoholic beverages) | 100% | 100% | 100% | 100% |
| Royalties, licences or flavour sales made specifically for alcoholic products (PEP: Hard MTN Dew, Lipton Hard Iced Tea) | 100% | 100% | 100% | 100% |
| Porcine gelatin, lard or other porcine ingredient > 1% of the product | 100% | 100% | 100% | 100% |
| Problematic ingredient that is a trace component (< 1%, not the character) — porcine enzymes, ethanol as a flavour carrier | 1% | 1% | 2.5% | 5% (Δ24 pattern) |
| Mushbooh (source unknown: E471 mono- and diglycerides, glycerin, stearates, L-cysteine, carmine) until sourced | 0% | 0% | 2.5% | 5% |
| Meat of halal species not slaughtered Islamically | 0% | 0% | 100% of the sized share | 100% (D13) |

Formula: NPI_input = Σ (brand or SKU revenue × rate) ÷ total revenue. Sources: ingredients from USDA FoodData Central (CC0) and, quarantined, Open Food Facts; brand weights from 10-K segment and brand disclosures (FactSet RBICS with Tradenames when licensed); sourcing checks via ImportYeti / UN Comtrade (gelatin, pork inputs); halal and kosher certifiers as positive confirmation only (absence of certification ≠ ḥarām). Legacy flag: PEP (v3.0) — alcohol-brand licensing confirmed; IBD/TA 45.8%.

## §49 — Retail, grocery, convenience and drug chains (Type 1)

Merchandise categories inside a retail segment go to Gate 4 (U2 applies to reported segments, not to categories inside one). Attribute at 100% at every scenario: alcohol, tobacco / nicotine, pork, lottery-ticket commissions and gaming machines; non-zabīḥah meat at Sc C / Strictest only (D13); store-card and instalment financing income is L7. Formula: NPI = Σ (category share × relevant revenue). Category shares: issuer disclosure first; otherwise NACS (c-store tobacco ≈ 34% of in-store sales; beer 10.9% where sold), state liquor-licence data to confirm which banners sell alcohol, and scanner panels (NielsenIQ / Circana, licensed) for flagship verdicts. Always label modelled shares as estimates. Legacy flag: WMT (v3.0) — pork + alcohol ≈ 3.0–3.6%; with tobacco and poultry ≈ 6.7–8.3%; tobacco is P1 at every scenario, so WMT's v3.0 "Sc A without tobacco" is withdrawn.

## §50 — Restaurants, hotels, integrated resorts, cruise lines and airlines (Type 1)

- **Hotel:** NPI ≈ F&B segment share × alcohol share of F&B (benchmark) + casino segment (Tier 1; a casino *segment* above 5% → U2 categorical) + in-room adult or mature entertainment (F12) + minibar.
- **Restaurant:** NPI ≈ alcohol mix × revenue, concept-matched (NRA public figures: ≈ 21% of full-service sales at alcohol-serving operators, ≈ 6% limited-service; bar-forward casual dining higher, coffee / QSR ≈ 0) + pork menu share + non-zabīḥah (Sc C / Strictest).
- **Cruise:** NPI = onboard share × [(F&B share of onboard × alcohol share of F&B) + casino share of onboard] + in-cabin entertainment. Onboard ≈ 30–34% of brand revenue (2024 sell-side estimates for Carnival, Norwegian, Royal Caribbean); the casino is typically the second-largest onboard department after F&B. Trace where drink packages are booked (ticket or onboard) in the revenue-recognition note.
- **Airline:** ancillary alcohol + non-halal catering; usually tiny, but compute it so the four-scenario table shows the number.

## §51 — REITs: rent from prohibited tenants (D18)

The REIT's own balance sheet goes through Gates 2 and 3 as usual (REITs often fail Gate 2 on leverage). **Mortgage REITs are P1-FIN** (lending) → CATEGORICAL FAIL. For equity REITs, classify tenants:

| Tenant | Sc A | Sc B | Sc C | Strictest |
|---|---|---|---|---|
| Premises used to sell or conduct the prohibited activity (liquor store, casino, bar / nightclub, adult venue, cannabis dispensary, betting shop, pork butcher) | 100% of that rent | 100% | 100% | 100% |
| Office or branch of a P1 business (bank branch, insurer, consumer lender) | 0% (*ijārah* of permissible space — Abū Ḥanīfa) | 100% | 100% | 100% |
| Mixed tenant (supermarket selling alcohol and pork, cinema, hotel with bar, restaurant serving alcohol) | 0% | 0% | rent × the tenant's own NPI% (or its category benchmark) | same, conservative edge |

NPI_rent = Σ attributed rent ÷ total revenue. A REIT whose rent comes ≥ 80% from P1 premises (gaming REITs leasing casinos) fails Gate 1 under Δ14. Data: 10-K top-tenant tables, tenant-industry charts and supplemental packages (EDGAR); OpenStreetMap for the long tail (ODbL — keep it isolated); CoStar / Placer.ai only as licensed internal cross-checks. Where rent by tenant is undisclosed, use GLA or store-count proxies and label them.

## §52 — Gaming, apps and digital platforms

- Real-money gaming, sportsbooks and social casino → P1-GMB (categorical if primary or a > 5% segment; otherwise Tier 1 sized).
- Loot boxes or gacha **with cash-out or secondary-market value** → Tier-1 *maysir* at 100% of the attributed bookings.
- Loot boxes **without cash-out** → **open election.** Until the first gaming screen settles it: Sc A / Sc B 0%; at Sc C and Strictest report the gacha share as its own line under three readings (0% / 50% / 100%) and show whether the verdict depends on the choice.
- Platform take (app stores, payment rails) from prohibited apps — mirror Δ31: Sc A attributes the take from apps whose product is itself prohibited (gambling, adult, alcohol delivery); Sc B+ adds conventional-finance apps.
- In-app advertising → Δ31. Game content → F12 by analogy (ESRB ratings as the maturity base).

Data: bookings by franchise and ad-vs-IAP splits from filings and earnings calls; app-store metadata (category, age rating, IAP presence); ESRB rating search; regulator loot-box decisions (Belgian Gaming Commission 2018; Dutch Kansspelautoriteit; UK DCMS 2022 response) as doctrinal grounding; Sensor Tower / AppMagic (licensed) for title-level revenue estimates.

## §53 — Distributors and wholesalers (throughput)

Distributing P1 goods is a P1 activity. A reported segment distributing P1 goods above 5% of revenue → U2 categorical; P1 categories inside a broadline segment → Gate 4 at 100% at every scenario. Formula: NPI ≈ Σ (alcohol + tobacco + pork throughput) ÷ distribution revenue, using **sales** shares (never gross-profit shares). C-store distributors: NACS mix; foodservice: Technomic / Datassential (licensed). Pharma distributors (McKesson, Cardinal, Cencora): tier the products they move per Part VI (Tier 0 by default). Precedent: McLane inside BRK (a major US tobacco distributor).

## §54 — Payments, client float, brokers and fintech

**Client float** (balances a company holds but does not own — payroll processors, payment wallets, brokers). Three positions from v4.2 §7.5.15, now mapped to scenarios:

| Position | Reading | Scenario |
|---|---|---|
| 1 — AAOIFI plain reading | Float yield is *ribā*; 100% into L1 | Sc B (default) |
| 2 — Agency carve-out | Where the issuer is a documented agent (*wakīl*) and the yield is contractually the client's or passed through, it is not the issuer's income | Sc A |
| 3 — Structural (Usmani-strict) | Where interest-bearing custody is structurally inseparable from the business model (float yield above 5% of revenue, or the model depends on it), Gate 1 is reconsidered | Sc C / Strictest |

BNPL and instalment economics → L7 (and L2 categorical if a lending segment exceeds 5%). Stablecoins → Δ7. Insurance-adjacent → §31. Precedents: MELI (float yield ~$3.5B; Positions 1/2/3 applied, before the v5.0 categorical finding on its loan book); ADP-type payroll float (sector maps).

## §55 — Conglomerates, holding companies and the rest

- **Holding companies:** ordinary issuers (U5); segment test per U2; material look-through per U4; float per U3. BRK is the precedent (insurance 23.9% → categorical).
- **Utilities and energy:** Tier 0. Coal and gas flags are ESG, not Shariah; show them informationally if a client asks.
- **Defence:** conventional defence is not enumerated; WMD and key components are P1-WMD (categorical if primary or a > 5% segment, otherwise Tier 1 sized). DJIM and S&P exclusions of broader defence appear only in the standards columns.
- **Telecom and cable:** content through F12; advertising through Δ31; handset financing → L7.
- **Suppliers to P1 industries** (filters for tobacco, brewing equipment, cannabis hydroponics): Δ14 if ≥ 80% of revenue serves the P1 industry, Δ16 at 50–80%, otherwise Tier 2 at the F5-style rate set at the first screen.

[Operational Note for Claude] When you screen the first issuer in any Part VIII sector, treat the rule as a proposal: apply it, show the four-scenario result, and list the rule in the report's open-questions section for ratification. Do not invent benchmark percentages — use the issuer's own disclosure or a cited benchmark, and label every modelled share as an estimate.

---

# PART IX — THE DELTA REGISTER (Δ1–Δ48)

## §56.1 — Every delta

Format: **trigger → rule (v5.0)** · scenarios · precedent · status. "Amended" means v5.0 changed the rule.

- **Δ1 Bifurcated verdicts.** Scenarios disagree → report all four with the rationale for each; never collapse to one verdict. · all · EXLS (2.49 / 16.37 / 37.24 / 57.33%). · Active.
- **Δ2 Marginal yield over fee.** Interest credit netted against bank fees under one contract → count the net credit only. · all · none yet. · Active.
- **Δ3 Operating-only-asset carve-out.** Strategic equity stakes and equity-method investments are not Cash + IBS; restricted operating deposits are not Cash + IBS. · all · RHHBY, NVO. · Active.
- **Δ4 Litigation / regulatory contingency.** Principal is not IBD; interest accruing on it is L7; harm-attribution options A / B / C shown as sensitivities. · all · JNJ talc (Option A locked, L6); HIMS Sookdeo class action (flag). · Amended: governance items without interest go to G-flags (F36).
- **Δ5 Sub-industry reconsideration.** GICS masks a doctrinal difference → re-route. Healthcare is split ten ways: pharma, biotech, devices, diagnostics, hospitals, services, distributors, healthcare REITs, DTC telehealth, health-tech / SaaS. · all · HIMS. · Active.
- **Δ6 Per-share purification.** Two-component formula (Part X §57); Δ6-RE for all profitable issuers, Δ6-D split for dividend payers; loss years purify interest only. · all · every issuer. · **Amended (F7).**
- **Δ7 Stablecoins.** Algorithmic stablecoins are categorically excluded; fiat-backed coins are cash equivalents carrying the underlying's interest character (an issuer's reserve yield is L1). · all · MELI (Meli Dólar flagged). · Active.
- **Δ8 Wakālah-AI elevation.** Weak prescriber or decision gate → +5pp; medium +0 to +3pp; strong +0pp; absent → Tier 1; always inside the applicable band. · Sc C / Strictest · HIMS, EVER, MLNK. · Amended (band cap, U1).
- **Δ9 Actuarial services.** Primary business → P1-INS. · all · none. · Active.
- **Δ10 Health payers.** Sc A/B Tier 0 if positioned as health-service delivery; Sc C / Strictest P1-INS. · per scenario · none (pre-codified for UnitedHealth, Cigna, Humana, Elevance). · Active.
- **Δ11 Fee-structure sensitivity.** Fees are Tier 0 unless the facilitated transaction is P1 (loan origination fees → Tier 2); volume-linked pricing adds +5 to +10pp to Tier 2. · Sc B+ · MLNK (+7.5pp), EVER. · Active (not a governance delta — F36).
- **Δ12 Takaful.** Tier 0; segment-report and apply only to the takaful part of a mixed insurer. · all · none. · Active.
- **Δ13 Fine-grained bifurcation.** Disaggregate below GICS (pharma → F5; diagnostics → F9). · all · VEEV, RHHBY. · Active.
- **Δ14 Wasīṭ-equivalence.** Facilitation of P1 transactions ≥ 80% of revenue → CATEGORICAL FAIL; 50–80% → Δ16 mandatory. · all · EVER (100%), **MLNK (~85%, applied in v5.0 — F21)**. · Active.
- **Δ15 Foreign-private-issuer protocol.** 20-F replaces 10-K; home annual report (IFRS-EU etc.) replaces Item 1; 6-K replaces 10-Q; Rule 12g3-2(b) unlisted ADRs acceptable with audited statements; confirm audit, cadence and standard. · Gate 5 · RHHBY (unlisted ADR, OTCQX), NVO (20-F), SNY (20-F). · Active.
- **Δ16 Deep customer-mix.** §17. · Sc B+ in practice · VEEV, EXLS. · Amended (mandatory band for P1 verticals).
- **Δ17 ADR ratio.** Per-ADR purification = per-ordinary-share figure × ordinary shares per ADR; confirm the ratio with the depositary bank. · all · RHHBY (8 ADRs = 1 ROP), NVO (1:1), SNY (2 ADS = 1 share). · Active.
- **Δ18 Drug-category table.** §23. · per scenario · HIMS, NVO, LLY, SNY. · Amended (U1 rows, F12).
- **Δ19 Triangulation.** §19; ≥ 3 independent sources for any contested Tier-2 rate. · Sc C / Strictest · HIMS, NVO. · Active (cannot be overridden).
- **Δ20 Layer-2 cross-reference.** §10. · Gate 3 · RHHBY, NVO, LLY, JNJ (reversal). · Active (substance over form cannot be overridden).
- **Δ21 Recombinant platforms.** Tier 0 universally; HEK293 per U8. · all · NVO (yeast), RHHBY (CHO), MRNA (cell-free IVT). · Active.
- **Δ22 Sensitivity zone.** ±2pp around Gate-2 thresholds → MIXED-Watch, **Sc A and Sc B only**. · Sc A/B · RHHBY. · **Amended (F17).**
- **Δ23 Necessity override.** §32. · all → 0% · SNY vaccines, insulin. · Active.
- **Δ24 Trace de minimis.** §32; 1 / 1 / 2.5 / 5%. · per scenario · SNY (pattern), HIMS (minor-flag rate, D8). · Active.
- **Δ25 No alternative.** §32; 0 / 0 / 2.5 / 5%. · per scenario · SNY Lovenox; **ABBV Creon (F24)**. · Active.
- **Δ26 Communal benefit.** §32; temporal scope U7. · all → 0% · MRNA FY2020–22. · Active.
- **Δ27 On-label cosmetic.** §33. · per scenario · ABBV. · Active.
- **Δ28 Universal content attribution.** §40. · all · DIS, NFLX. · Active (number reserved — F1).
- **Δ29 Per-service back-solve and disclosure sunset.** §41. · Gate 4 · DIS. · Active.
- **Δ30 vMVPD distribution rate and merged-entity carve-out.** §42. · Gate 4 · DIS (Hulu + Live TV / Fubo). · Active.
- **Δ31 Advertising pass-through.** §43. · per scenario · DIS, NFLX, AMC. · Active.
- **Δ32 Media-gambling integration.** §44. · all at 100% · DIS (ESPN). · Active.
- **Δ33 Granular sub-line attribution.** §16. · per scenario · DIS, AMC. · **Amended (D9 sizing).**
- **Δ34 Intra-service clean tier.** §45. · all → 0% · NFLX (15%). · Active.
- **Δ35 Viewing-weighted content flags.** §46; music excluded (U9); measured / estimated labels. · per scenario · NFLX, AMC. · Amended (F34 labelling).
- **Δ36 Exhibitor sub-rule.** §46. · per scenario · AMC. · Active (the AMC report's "Δ35" label is superseded — F29).
- **Δ37 Dual-track lease leverage.** §6: track (a) at Sc A/B/C, track (b) at Strictest, every issuer. · Gate 2 · AMC; applied record-wide in v5.0. · **Amended (F16).**
- **Δ38 Negative equity.** §11: equity and non-positive denominators undefined; MCAP and TA ratios tested. · Gate 2 · ABBV, AMC. · **Amended (F18).**
- **Δ39 Post-windfall treasury mitigation — PROPOSED, NOT RATIFIED, DOES NOT APPLY.** Draft (MRNA report): where Layer 1 breaks the cap *solely* because cash was accumulated in a Δ23 / Δ26 emergency window and no new debt-investment policy was adopted, re-anchor the Layer-1 numerator to a three-year operating-cycle benchmark, subject to a 36-month cash-deployment plan and short-duration Treasuries only. **Council analysis:** (1) no external standard re-anchors the numerator to a past year; (2) *ribā* income is *ribā* whatever produced the cash pile; (3) it would not change MRNA, which also fails Gate 2 liquidity (Cash + IBS 41.7% of MCAP, 65.9% of assets). **Recommendation:** do not ratify as drafted. If the Council wants a remedy, consider a *remediation Watch* instead: the issuer stays FAIL, is monitored quarterly, and re-enters only after two consecutive quarters with Layer 1 < 5% and Cash + IBS inside the caps. · none · MRNA. · Open (§0.5).
- **Δ40 Cash on the 12-month average market cap.** §3, §7: R8 decides at every scenario, each at its own limit; R9–R12 are information only. · Gate 2, all · AAPL. · **Interim (18 Oct 2026).**
- **Δ41 Interest booked inside revenue.** Trigger: a revenue line earned as interest or yield — "interest on funds held for clients", stablecoin reserve revenue (Δ7), "finance and interest income", interest on customer balances inside a services line. Rule: it is Layer 1 (Layer 7 where it is lending), counted gross wherever it is reported; the revenue lines and the revenue-disaggregation note are searched as well as the investments and other-income notes. · all · ADP ($1,354.8m on client funds), Deere ($5,526m), Coinbase (sweep). · **Interim (18 Oct 2026).**
- **Δ42 Revenue that contains interest.** Rule: the denominator is revenue as reported; interest booked inside it is not taken out (one definition across issuers, and the conservative edge is not the point of a denominator). · all · ADP: 7.86% as reported, 8.38% with the interest removed. · **Interim (18 Oct 2026).**
- **Δ43 Client funds matched by an equal obligation.** Trigger: restricted funds held for clients or customers, invested in interest-bearing instruments and matched by a client-fund obligation (payroll processors, marketplaces, payment companies). Rule: Sc A excludes the matched amount from Cash + IBS and from (Cash + IBS + AR) — the funds are the clients', held as agent; Sc B, Sc C and Strictest count it (§6, the plain reading). The yield stays Layer 1 at every scenario unless §54 Position 2 applies. · Gate 2, per scenario · ADP (49.6% of 12-month MCAP counted, 4.4% excluded), Airbnb (28.9% / 14.4%). · **Interim (18 Oct 2026).**
- **Δ44 Average balances where they swing.** Trigger: client funds or short-term borrowings whose disclosed average for the window differs from the period end (float businesses borrow to fund obligations between collection and payment). Rule: IBD and Cash + IBS take, line by line, the higher of the period-end balance and the disclosed average. · Gate 2, all · ADP: commercial paper nil at 30 June against a $4.2b average, reverse repos $139.3m against $3.6b — IBD $12,764m rather than $5,103m; client funds kept at the period end ($44.0b > $40.4b average). · **Interim (18 Oct 2026).**
- **Δ45 Lessor income: rent is not interest.** Trigger: an issuer that both leases assets out and finances customers, reporting one finance-income line. Rule: operating-lease rentals received as lessor are *ijārah* (AAOIFI SS 9), Tier 0; finance-lease income and loan interest are Layer 7. Where the filing does not separate them, Layer 7 is a band whose low edge removes an estimate of rentals, stated as such. The U2 test is unaffected: a lending segment is P1 whatever its rental share. · Gate 3/4, all · Deere ($3.9–5.5b). · **Interim (18 Oct 2026).**
- **Δ46 A share of a partner's lending income.** Trigger: credit-card profit sharing, co-brand card or savings revenue shares, loan or deposit referral shares tied to a bank's interest income. Rule: Layer 7 at 100% at Sc B, Sc C and Strictest; at Sc A, payment for promotional capacity under the Δ31 carve-out (0%). · per scenario · Target ($522m, 0.5%), Apple Card (est. $0.3–1.0b). · **Interim (18 Oct 2026).** The app sizes it at Gate 4; adding it to the Gate-3 cap by scenario is not yet implemented (Apple: +0.1–0.2pp, no verdict change).
- **Δ47 Zero-margin pass-throughs.** Trigger: costs re-billed at no margin and reported gross in revenue (PEO benefits, premiums collected for insurers). Rule: the denominator is as reported (Δ42); Gate 4 counts the issuer's margin on a P1 pass-through, not the gross amount, and the gross reading is shown as a sensitivity. · Gate 4, all · ADP ($4,607.3m; +21pp if counted gross). · **Interim (18 Oct 2026).**
- **Δ48 Insurance inside a service fee.** Trigger: an issuer that underwrites or retains insurance risk for customers without a separately billed premium. Rule: where the cover is priced inside fees and can be estimated, size it at 100% under §31 (Tier 1), banded; where no charge exists (a free guarantee with risk retained), G-flag only. · Gate 4, all · ADP Indemnity (est. $330–900m), Airbnb Host Damage Protection (G-flag). · **Interim (18 Oct 2026).**

## §56.2 — Trigger matrix (find every delta before Gate 2)

| Issuer characteristic | Deltas / rules |
|---|---|
| Non-US issuer with an ADR | Δ15, Δ17 |
| Profitable; pays a dividend | Δ6 (RE and D) |
| Any debt; IBD/TA > 15%; Layer 2 > 0.5% of revenue | Δ20; Δ22 if near a Sc A/B threshold; Δ37 always |
| Negative book equity; goodwill > MCAP | Δ38 |
| Leases material | Δ37 track (b) at Strictest |
| Conducts a P1 activity in a segment | §5 step 2 (U2) |
| ≥ 50% of revenue from one vertical | Δ16; Δ14 if the vertical is P1 and ≥ 80% |
| DTC prescriber, AI decisioning at contract formation | Δ8, F11 |
| Contested drug category | Δ18, Δ19, U1 |
| Recombinant biologics | Δ21; L8 for HEK293 |
| Life-saving / epidemic / reconstructive / ingredient-clean products | Δ23 / Δ26 / Δ27(a) / F6–F7 Modifier |
| Trace or active haram ingredient | Δ24 / Δ25 |
| On-label cosmetic products | Δ27 |
| Cash > 10% of total assets | L1 / L8 review; Cash + IBS ratios |
| Material acquisition financed by debt | §30, Δ20 |
| Litigation with interest accrual | Δ4 |
| Stablecoins / crypto | Δ7 |
| Health payer; takaful; actuarial | Δ10; Δ12; Δ9 |
| Fee revenue tied to P1 transactions | Δ11 |
| Strategic equity / equity-method stakes | Δ3; U4 |
| Media, streaming, studios, parks, exhibitors, sports media | F12, Δ28–Δ36 |
| F&B, resorts, cruise, concessions | Δ33 / §16 |
| Advertising revenue | Δ31 |
| Sportsbook partnerships | Δ32 |
| Window-sensitive MCAP ratios | §8, D16 |
| Food, retail, REIT, gaming, distributor, fintech float | Part VIII |
| A revenue line earned as interest or yield (client funds, stablecoin reserves, finance income) | Δ41, Δ42 |
| Restricted funds held for clients or customers, with a matching obligation | Δ43, Δ44, §54 |
| Commercial paper or repos that fund client obligations; balances that swing within the year | Δ44 |
| Equipment leased out by an issuer that also finances customers | Δ45, U2 |
| Credit-card profit sharing; co-brand card or savings revenue shares | Δ46 |
| Costs re-billed at zero margin and reported gross (PEO, insurance premiums) | Δ47 |
| A captive insurer or self-insured guarantee inside a service | Δ48, §31 |

---

# PART X — PURIFICATION AND KHUMS

## §57 — Δ6 per-share purification (v5.0 two-component formula)

**Why it changed (F7).** The old Δ6-RE took NPI% × revenue × (1 − ETR) as if every dollar of impure revenue were pure profit. Interest income really does drop to the bottom line; impure *operating* revenue does not — it carries costs like any other sale. The result overstated purification for every issuer with impure operating revenue, and in several cases exceeded earnings per share.

**Definitions** (reporting currency; per scenario):

- I = gross interest-type income (L1 + L7 + speculative L6)
- t = effective tax rate = income-tax expense ÷ pre-tax income, **floored at 0** (a tax-benefit year uses t = 0)
- NI = net income attributable to shareholders; R = total revenue (§6)
- R_imp = attributed impure operating revenue = (NPI% − I / R) × R
- m = after-tax margin excluding interest = max(0, (NI − I × (1 − t)) ÷ R)

**Impure earnings:** IE = I × (1 − t) + R_imp × m when NI > 0. **Loss year:** IE = I × (1 − t) — the *ribā* is purified even when there is no profit.

**Per-share purification:** P = IE ÷ diluted weighted-average shares.

**Properties.** When NPI is interest only (most Sc A/B pharma), the new and old formulas give the same answer. When NI > 0, P never exceeds EPS unless interest alone exceeds earnings — in which case the interest is purified in full.

**Δ6-D dividend split.** Payout p = min(1, DPS ÷ diluted EPS). Dividend-attributable purification = P × p (purify on receipt); retained-earnings-attributable = P × (1 − p) (purify at sale, or annually, per the investor's school).

**Δ17 ADR adjustment.** Per ADR = P × ordinary shares per ADR (Roche: 1/8; Sanofi: 1/2; Novo: 1). Confirm the ratio with the depositary bank.

**Currency.** Compute in the reporting currency; translate at the spot rate on the computation date (Federal Reserve H.10 or ECB reference rates); show both.

**Categorical fails.** Purification is not a remedy for a Gate-1 fail; the instruction is to divest. Figures are shown only for cleaning a legacy exit.

**Worked example — HIMS FY2025, Sc C.** I = $23.1M (other non-operating income, 10-K); t = 0 (tax benefit of $4.4M on pre-tax $123.9M); NI = $128.4M; R = $2,347.6M; NPI = 20.76% → R_imp = (20.76% − 0.98%) × 2,347.6 = $464.4M; m = (128.4 − 23.1) ÷ 2,347.6 = 4.49%; IE = 23.1 + 464.4 × 4.49% = $43.9M; ÷ 258.2M shares = **$0.17 per share** (the old formula gave $1.85–2.30).

## §58 — Khums (Jaʿfari overlay)

Company level: **20% × reported net income attributable to shareholders** (F33); none in a loss year. Per share, informational: 20% × diluted EPS. The individual obligation is personal: it falls on the investor's annual surplus and depends on their *marjaʿ al-taqlīd* and holding-period rules. Show it next to the **Sc B** verdict (F40). FY2025 company-level examples: VEEV $181.8M; HIMS $25.7M; RHHBY CHF 2,576M; NVO DKK 20,487M; JNJ $5,361M; NFLX $2,196M.

## §59 — Cross-check: the AAOIFI dividend-ratio method

Most retail screeners show purification as **DPS × NPI%**. For dividend payers, report it beside the Δ6-D dividend-attributable figure so a user can reconcile the two. They differ because interest is a larger share of profit than of revenue (JNJ: 1.12% × $5.14 = $0.058 by the ratio method; Δ6-D dividend part $0.17 under v5.0).

---

# PART XI — VERDICT STANDARDS AND OUTPUT

## §60 — The canonical twelve standards (F14)

Every report's twelve-standard matrix uses this list, in this order, with these tests. Earlier tallies are void until re-run.

| # | Standard | Financial tests | Activity test | Verification note |
|---|---|---|---|---|
| 1 | **AAOIFI Shariah Standard 21** | Interest-bearing borrowings < 30% of MCAP; interest-bearing deposits / securities < 30% of MCAP | Non-permissible income < 5% of revenue | Literal AAOIFI; platform Sc B adds the total-asset alternative |
| 2 | **Dow Jones Islamic Market (DJIM)** | Debt, cash + IBS and AR each < 33% of 24-month average MCAP | Sector exclusions per the DJIM rulebook (includes defence) | S&P DJI updated the methodology on 20 Aug 2026; summaries of the Sept 2026 rulebook show **30%** caps — **verify against the PDF** |
| 3 | **S&P Shariah** | Debt < 33% of 36-month average MCAP; cash + IBS < 33%; AR < 49% | Non-permissible income other than interest < 5% | Same 20 Aug 2026 update; leverage reportedly **30%** from Sept 2026 — **verify** |
| 4 | **MSCI Islamic** | Debt, cash + IBS, and (AR + cash) each < 33.33% of total assets | Prohibited activities < 5% of revenue | Sharia-compliant debt and instruments are excluded from the ratios |
| 5 | **MSCI Islamic M-Series** | Same three tests on average MCAP | Same | Confirm the averaging window in the MSCI rulebook |
| 6 | **FTSE Shariah (IdealRatings)** | Debt < 33.333% of TA; cash + interest-bearing items < 33.333% of TA; (AR + cash) < 50% of TA | Interest + non-compliant income < 5% of revenue | FTSE Yasaar became FTSE Shariah / IdealRatings |
| 7 | **Securities Commission Malaysia (SAC)** | Cash in conventional accounts < 33% of TA; interest-bearing debt < 33% of TA | 5% benchmark (banking, insurance, gambling, liquor, pork, non-halal F&B, non-compliant entertainment, tobacco, conventional interest income); 20% benchmark (share trading, stockbroking, rent from non-compliant activities) | Replaces §30's "JAKIM" and "SAC Bank Negara" rows |
| 8 | **OJK / DSN-MUI (Indonesia)** | Interest-based debt ≤ 45% of TA | Interest + other non-halal income ≤ 10% of revenue | |
| 9 | **SECP Pakistan (KMI / Meezan)** | Interest-bearing debt < 37% of TA; non-compliant investments < 33% of TA; illiquid assets ≥ 25% of TA; net liquid assets per share < share price | Non-compliant income < 5% | |
| 10 | **Platform Sc A (Hanafi / Liberal)** | §3 | §3 | |
| 11 | **Platform Sc C (Hanbali-Strict)** | §3 | §3 | |
| 12 | **Platform Strictest** | §3 | §3 | |

Each cell: PASS / MIXED / FAIL / CATEGORICAL FAIL, with the deciding ratio. Tally bands: ≥ 10 PASS "broadly compliant"; 6–9 "split"; ≤ 5 "narrow"; 0 "non-investable". A standard's own sector list decides its business screen (DJIM and S&P exclude defence; the platform does not).

## §61 — Six-school mapping

| School | Scenario |
|---|---|
| Hanafi | Sc A |
| Maliki | Sc B |
| Shāfiʿī | Sc B |
| Hanbali | Sc C |
| Jaʿfari (Twelver) | Sc B + khums (§58) |
| Strictest supervisor | Strictest |

## §62 — Issuer report: required structure

1. **TL;DR** — verdict per scenario, the deciding gate for each, one line on purification.
2. **Key findings** — 8–12, numbered, each with a source.
3. **Issuer overview and doctrinal positioning.**
4. **Financial summary** — income statement, balance sheet and cash flow, each figure with its filing and accession number.
5. **Data reconciliation log** (Gate 5) — every feed figure that differed from the filing, both values (§XII.10).
6. **Market-cap triangulation** — 12 / 24 / 36-month and spot; the primary window per scenario.
7. **Gate 1** — the §5 decision table, step by step.
8. **Gate 2** — all twenty-two ratios, both IBD tracks, every scenario.
9. **Debt structure and acquisition financing.**
10. **Gate 3** — the eight layers with canonical keys; Δ20 reconciliation.
11. **Revenue mapping** — sector framework (pharma: platforms, excipients, F5 rows; media: decomposition, Δ29 back-solve, Δ35 components labelled measured / estimated; Part VIII sectors: formulas and benchmarks).
12. **Gate 4** — the four-scenario table with every line's basis, point estimate and band (S8).
13. **Customer exposure** (Δ16, F11, Δ8).
14. **Purification** — Δ6 v5.0, Δ6-D, Δ17, currency, AAOIFI dividend-ratio cross-check (§59).
15. **Six-school verdict** (§61) with khums.
16. **Twelve-standard matrix** (§60).
17. **Competitor comparison** — reconciled or footnoted, never averaged.
18. **G-flags** (governance register).
19. **Monitoring triggers.**
20. **Open scholarly questions** (feeds the next review).
21. **Final verdict matrix** — gates × scenarios.
22. **Recommendations and caveats.**

**Required disclosures:** a source for every number (filing and accession number where it exists); every delta named by number; every user lock named; every Tier-2 / Tier-3 rate with its Δ19 sources, band and verdict at both ends; every Δ35 component labelled measured or estimated; the primary MCAP window.

## §63 — Confidence bands and length

For each Tier-2 rate and each sized sub-line: the point used, the band, the source quality (peer-reviewed / institutional / consultant / estimate), and whether the verdict survives at both ends. Typical length: B2B or simple issuers 10,000–14,000 words; pharma or device issuers 14,000–18,000; complex multi-segment issuers 16,000–22,000.

[Operational Note for Claude] The report structure is how supervisors compare issuers. Follow it exactly; if you have to deviate, say why in the caveats.

---

# PART XII — DATA SOURCING MANUAL

## §XII.1 — Source hierarchy

1. **The audited filing** (10-K, 20-F, 40-F, home-jurisdiction annual report) beats everything else.
2. **The issuer's own XBRL** in that filing (SEC APIs) is the filing in machine-readable form — but tags change and some figures are only in the notes (§XII.4).
3. **Footnote gross figures** beat netted face-of-statement lines (Layer 1 especially).
4. **Interim filings** (10-Q, 6-K) and **8-K earnings releases** (Item 2.02, Exhibit 99.1) for Watch updates, product revenue and key metrics.
5. **Aggregator feeds** (the platform's licensed data provider, or any other) are inputs to verify, never facts to transcribe (§XII.10).
6. **Government and open databases** (§XII.7) to flag activities, ingredients, licences and tenants.
7. **Benchmarks** (trade associations, peer-reviewed literature) to size sub-lines the issuer does not disclose — always labelled estimates.
8. **Competitor screens** only as a cross-check, reconciled or footnoted (§39(iv)).

## §XII.2 — Where each input lives in an SEC filing

| Input (methodology use) | Filing | Where to look | XBRL tags (us-gaap unless noted) |
|---|---|---|---|
| Business, segments, primary activity (Gate 1) | 10-K | Item 1 Business; Item 7 MD&A; segment note (ASC 280) | Segment revenue facts on the segment axis |
| Revenue by product, geography, channel (Gate 4) | 10-K, 10-Q, 8-K | Revenue note (ASC 606 disaggregation); MD&A product tables; earnings release (8-K Item 2.02, Ex. 99.1) | `RevenueFromContractWithCustomerExcludingAssessedTax`, `Revenues` with product / segment dimensions |
| Hidden prohibited subsidiaries (banks, insurers, lenders, casinos) | 10-K | **Exhibit 21** (list of subsidiaries) | — |
| Major customers ≥ 10% (Δ16) | 10-K | Segment note "major customers"; Item 1A | `ConcentrationRiskPercentage1` (customer-concentration member) |
| Interest income — L1 | 10-K, 10-Q | "Other income (expense), net" note; cash and investments note; MD&A "interest income"; Item 7A | `InvestmentIncomeInterest`, `InterestIncomeOther`, `InvestmentIncomeInterestAndDividend` (includes dividends), `InterestAndOtherIncome` (includes other items); often only the net `NonoperatingIncomeExpense` / `OtherNonoperatingIncomeExpense` |
| Interest expense — L2 | 10-K | Income statement; debt note | `InterestExpense`, `InterestExpenseNonoperating`, `InterestExpenseDebt`; net-presentation issuers: `InterestIncomeExpenseNonoperatingNet` |
| Capitalised interest — L3 | 10-K | PP&E note | `InterestCostsCapitalized` |
| Pension interest — L4 | 10-K | Retirement-benefits note | `DefinedBenefitPlanInterestCost` |
| Leases — Δ37 | 10-K | Leases note (ASC 842): liabilities, maturity table, weighted rates | `OperatingLeaseLiability` (+ `Current` / `Noncurrent`), `FinanceLeaseLiability` (+ `Current` / `Noncurrent`), `FinanceLeaseInterestExpense`, `LesseeOperatingLeaseLiabilityPaymentsDue`, `LesseeOperatingLeaseLiabilityUndiscountedExcessAmount` |
| Debt — IBD | 10-K, 10-Q, 8-K | Balance sheet; debt note (instrument table with coupons, effective rates, maturities); **Exhibit 4** (indentures); 8-K Items 1.01 and 2.03 (new debt) | `ShortTermBorrowings`, `CommercialPaper`, `DebtCurrent`, `LongTermDebtCurrent`, `LongTermDebtNoncurrent`, `LongTermDebt`, `DebtLongtermAndShorttermCombinedAmount`, `LongTermDebtAndCapitalLeaseObligations` (+ `Current`), `DebtAndCapitalLeaseObligations`, `ConvertibleDebtNoncurrent`, `ConvertibleNotesPayable`, `DebtInstrumentFaceAmount`, `DebtInstrumentInterestRateEffectivePercentage` |
| Cash and interest-bearing securities | 10-K | Balance sheet; cash, cash equivalents and investments note; fair-value note (ASC 820) | `CashAndCashEquivalentsAtCarryingValue`, `ShortTermInvestments`, `MarketableSecuritiesCurrent` / `Noncurrent`, `AvailableForSaleSecuritiesDebtSecuritiesCurrent` / `Noncurrent`, `HeldToMaturitySecurities`, `RestrictedCash` |
| Receivables; customer loan books | 10-K | Balance sheet; credit-loss note; financing-receivables note | `AccountsReceivableNetCurrent`, `ReceivablesNetCurrent`; loan books `NotesAndLoansReceivableNetCurrent` / `Noncurrent` (→ IBS) |
| Goodwill and intangibles (Hanbali denominator) | 10-K | Goodwill and intangibles note (ASC 350) | `Goodwill`, `IntangibleAssetsNetExcludingGoodwill`, `FiniteLivedIntangibleAssetsNet`, `IndefiniteLivedIntangibleAssetsExcludingGoodwill` |
| Total assets, equity | 10-K | Balance sheet | `Assets`, `StockholdersEquity`, `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest` |
| Net income, EPS, shares, tax (purification) | 10-K | Income statement; EPS note; income-tax note | `NetIncomeLoss`, `EarningsPerShareDiluted`, `WeightedAverageNumberOfDilutedSharesOutstanding`, `IncomeTaxExpenseBenefit`, `IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest` |
| Shares outstanding (MCAP) | 10-K / 10-Q cover | Cover page, per class | `dei:EntityCommonStockSharesOutstanding` |
| Dividends (Δ6-D) | 10-K, 8-K | Item 5; equity note; 8-K dividend declarations | `CommonStockDividendsPerShareDeclared`, `CommonStockDividendsPerShareCashPaid` |
| Litigation and contingencies (Δ4) | 10-K, 10-Q | Item 3 Legal Proceedings; commitments and contingencies note | `LossContingencyAccrualAtCarryingValue`, `LossContingencyEstimateOfPossibleLoss` |
| Control, dual-class (G-flags) | DEF 14A; 10-K | Security-ownership table (Item 12); cover page share classes | — |
| Equity-portfolio look-through (U4) | 13F-HR; 10-K | 13F information table; investments note | 13F XML |
| Large holders, activists | SC 13D / 13G | — | — |
| Subsequent events | 10-K, 10-Q, 8-K | Subsequent-events note; 8-K items | — |
| Insurance premiums and float (U3) | 10-K | Insurance segment note | `PremiumsEarnedNet` |
| Pharma product revenue; media subscribers and ARPU | 10-K, 8-K Ex. 99.1 | Product revenue tables; key-metric tables (until a disclosure sunset, Δ29) | Product-dimension facts; ARPU often untagged |

**Foreign private issuers (Δ15):** 20-F Item 4 (business), Item 5 (operating and financial review), Item 7 (major shareholders), Item 18 (financial statements), Exhibit 8 (subsidiaries); 6-K for interim results; 40-F for Canadian MJDS filers. IFRS tags: `ifrs-full:Revenue`, `FinanceIncome` (**includes FX and fair-value gains — not interest**), `FinanceCosts`, `InterestExpense`, `Borrowings`, `ShorttermBorrowings`, `LongtermBorrowings`, `LeaseLiabilities`, `CashAndCashEquivalents`, `CurrentTradeReceivables`, `Goodwill`, `IntangibleAssetsOtherThanGoodwill`, `EquityAttributableToOwnersOfParent`, `ProfitLossAttributableToOwnersOfParent`, `DilutedEarningsLossPerShare`, `AdjustedWeightedAverageShares`.

## §XII.3 — Getting the data out of EDGAR (all endpoints tested 7 Oct 2026)

| Purpose | Endpoint |
|---|---|
| Ticker → CIK | `https://www.sec.gov/files/company_tickers.json` |
| Filing index for a company | `https://data.sec.gov/submissions/CIK##########.json` |
| Every XBRL fact a company has filed | `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` |
| One tag's history for one company | `https://data.sec.gov/api/xbrl/companyconcept/CIK##########/us-gaap/{Tag}.json` |
| One tag across every filer for one period (universe screens) | `https://data.sec.gov/api/xbrl/frames/us-gaap/{Tag}/USD/CY2025.json` (instants: `CY2025Q4I`) |
| Full-text search, 2001 onward (keyword screens) | UI `https://www.sec.gov/edgar/search/`; API `https://efts.sec.gov/LATEST/search-index?q=%22MeridianLink%22&forms=10-K` |
| Browse by industry code | `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&SIC=2082&type=10-K` |
| Bulk: every company's facts | `https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip` |
| Bulk: Financial Statement (and Notes) Data Sets | `https://www.sec.gov/data-research/sec-markets-data/financial-statement-data-sets` |
| Bulk: 13F holdings | `https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets` |

**Fair-access rules:** send a `User-Agent` header naming the organisation and a contact email; stay under 10 requests per second.

**Full-text screens that pay off** (restrict to `forms=10-K,20-F`): `"pork"`, `"porcine"`, `"gelatin"`, `"alcoholic beverages"`, `"spirits"`, `"casino"`, `"sportsbook"`, `"sports betting"`, `"tobacco" "excise"`, `"loot box"`, `"interest income" "money market"`, `"buy now, pay later"`, `"captive finance"`, `"funds held for clients"`, `"interest on funds held"`, `"amounts held on behalf of customers"`, `"finance and interest income"`, `"credit card profit sharing"`, `"stablecoin revenue"`, `"zero-margin"`, `"Shariah"`, `"halal"`. The search returns the exact filing and paragraph — cite it.

**MeridianLink precedent:** the company was taken private, so it drops out of the ticker file; full-text search still finds its filings (CIK 0001834494).

## §XII.4 — XBRL pitfalls seen in this record

1. **Tags change between years.** MRNA's revenue moved from `Revenues` (last used FY2022) to `RevenueFromContractWithCustomerExcludingAssessedTax`. Take the latest period across all candidate tags, not the first tag found.
2. **Gross interest income is often untagged.** HIMS, NFLX (FY2025), LLY (FY2025) and DIS tag only a net non-operating figure. Go to the footnote; never use the net figure as L1.
3. **`InvestmentIncomeInterestAndDividend` includes dividends; `InterestAndOtherIncome` includes other items.** Check the note before using either as L1.
4. **IFRS `FinanceIncome` is not interest:** NVO DKK 9,660M vs interest income DKK 1,269M.
5. **`LongTermDebt` may or may not include the current portion.** Reconcile to the debt note (JNJ: `DebtCurrent` $8,500M + `LongTermDebtNoncurrent` $39,438M = $47,938M).
6. **Convertibles are tagged at carrying value** (`ConvertibleDebtNoncurrent` $972.6M at HIMS); IBD uses principal ($1,000M, `DebtInstrumentFaceAmount`).
7. **Feeds fold operating leases into debt** (HIMS, AMC). Rebuild IBD from the debt and lease notes every time.
8. **Tax-benefit years** make ETR negative (HIMS, DIS, EVER): floor t at 0 for purification.
9. **Multi-currency facts:** NVO's `Borrowings` returned a EUR-denominated tranche; filter by unit.
10. **Fiscal years differ** (VEEV ends 31 Jan; DIS on the Saturday nearest 30 Sep; JNJ 28 Dec 2025): label every figure with its period end.

## §XII.5 — Non-US issuers

- **SEC-registered foreign private issuers:** 20-F, 6-K and 40-F on EDGAR; IFRS XBRL appears in companyfacts under `ifrs-full`.
- **Not SEC-registered** (Roche): the home annual report and half-year report. EU issuers publish ESEF XBRL, collected free at `https://filings.xbrl.org`.
- **Home registries:** UK Companies House (`https://find-and-update.company-information.service.gov.uk`); Canada SEDAR+ (`https://www.sedarplus.ca`); Japan EDINET (`https://disclosure2.edinet-fsa.go.jp`); Korea DART (`https://dart.fss.or.kr`); Hong Kong HKEXnews (`https://www.hkexnews.hk`); Saudi Exchange (`https://www.saudiexchange.sa`); Bursa Malaysia (`https://www.bursamalaysia.com`).
- **Securities Commission Malaysia** publishes its list of Shariah-compliant securities twice a year, free — a useful cross-check for standard #7.
- **ADR ratios:** the depositary bank's DR directory (BNY Mellon, J.P. Morgan, Citi).

## §XII.6 — Market data for the MCAP windows

Month-end closes for 36 months from an exchange or a free history source (Nasdaq.com historical quotes, Yahoo Finance history, Stooq CSV), or from the platform's licensed price feed after reconciliation. Shares: cover pages and 10-Qs (all classes). FX: Federal Reserve H.10 (`https://www.federalreserve.gov/releases/h10/`) or ECB euro reference rates. Show every monthly figure in the report appendix.

## §XII.7 — Free databases by sector

| Sector / question | Source | What it answers | Limits and licence |
|---|---|---|---|
| **Alcohol — who holds federal permits** | TTB List of Permittees — `https://www.ttb.gov/public-information/foia/list-of-permittees` | Wineries, distilled-spirits plants, importers and wholesalers holding Federal Alcohol Administration Act permits; CSV and JSON; updated weekly | **Excludes brewers, industrial-alcohol users and tobacco permittees** (IRC §6103). US public domain. |
| **Alcohol — which brands belong to whom** | TTB Public COLA Registry — `https://www.ttbonline.gov/colasonline/publicSearchColasBasic.do` | Every approved alcohol label with its permit holder and brand name — links consumer brands to companies (catches licensing like PEP's Hard MTN Dew via the brewer) | Search interface; public domain. |
| Alcohol — national context | TTB statistics — `https://www.ttb.gov/data` | Production and tax collections by commodity | Aggregate only; no retailer data. |
| Alcohol — retail licences | State alcohol-beverage-control licence lookups (e.g. California ABC licence query) | Which banners and addresses hold off- or on-premise liquor licences | State by state. |
| **Tobacco / nicotine** | FDA Center for Tobacco Products — `https://www.fda.gov/tobacco-products` (marketing orders, authorised products); NAAG Master Settlement Agreement participating-manufacturer list; state tobacco-retailer licences | Who makes and sells authorised products | TTB tobacco permits are not published. |
| **Gambling** | UK Gambling Commission public register — `https://www.gamblingcommission.gov.uk/public-register`; Nevada Gaming Control Board (`https://gaming.nv.gov`) revenue reports and licensees; New Jersey Division of Gaming Enforcement monthly revenue by licensee (casino, online, sports wagering); Pennsylvania Gaming Control Board; Malta Gaming Authority register; AGA "State of the States" | Licensed operators and partners; revenue by licensee | Per jurisdiction. |
| **Pork and meat** | USDA FSIS Meat, Poultry and Egg Product Inspection Directory + Establishment Demographic Data — `https://www.fsis.usda.gov/inspection/establishments/meat-poultry-and-egg-product-inspection-directory` | Every federally inspected establishment, **species slaughtered**, production categories; CSV, weekly | US public domain. Pair with USDA NASS hog reports for context. |
| Food ingredients | USDA FoodData Central branded foods — `https://fdc.nal.usda.gov` | Ingredient lists by brand (pork, lard, gelatin, ethanol, carmine…) | CC0. Freshness degrading since the Label Insight feed stopped (Nov 2023). |
| Food ingredients (enrichment) | Open Food Facts | 3M+ products; ingredients and additives | **ODbL share-alike — keep isolated, never merge into a redistributed database.** |
| Halal / kosher confirmation | IFANCA, JAKIM Verify Halal, MUIS, HFA / HMC, BPJPH / MUI; OU and other kosher databases | Positive confirmation that a product or plant is certified | **Positive-only: absence ≠ ḥarām.** Web portals, no bulk API. |
| **Weapons** | ATF Federal Firearms Licensee listing — `https://www.atf.gov/firearms/listing-federal-firearms-licensees` (monthly, by licence type incl. manufacturers and importers); ATF Annual Firearms Manufacturing and Export Report; SIPRI Arms Industry Database — `https://www.sipri.org/databases/armsindustry` (arms sales and share of revenue, Top 100); USAspending.gov (federal awards by recipient); DoD daily contract announcements — `https://www.defense.gov/News/Contracts/`; PAX / ICAN "Don't Bank on the Bomb" (nuclear-weapons producers) | Who makes arms, and how much of their revenue it is; WMD producers for P1-WMD | Public / NGO. |
| Cannabis | State cannabis regulators' licence searches; Health Canada list of licensed cultivators, processors and sellers | Licensed operators | Per jurisdiction. |
| **Conventional finance** | FDIC BankFind Suite (+ API) — `https://banks.data.fdic.gov/bankfind-suite/`; FFIEC National Information Center — `https://www.ffiec.gov/npw` (holding-company structure: finds banks inside groups); FFIEC call reports — `https://cdr.ffiec.gov`; NMLS Consumer Access — `https://www.nmlsconsumeraccess.org` (state-licensed mortgage and consumer lenders: finds captive finance arms such as Clayton's Vanderbilt and 21st Mortgage); NCUA credit-union data; SEC adviser search `https://adviserinfo.sec.gov`; FINRA BrokerCheck `https://brokercheck.finra.org`; CFPB enforcement actions | Whether a group contains a bank, lender, broker or adviser; customer bases of lending-software vendors | Public. |
| **Insurance** | NAIC Consumer Insurance Search — `https://content.naic.org/cis_consumer_information.htm`; NIPR producer licensing — `https://nipr.com` (agencies, lead-gen, brokers); state insurance-department lookups | Whether a subsidiary is a licensed insurer or producer | Some NIPR lookups are paid. |
| **Pharma — labels and ingredients** | openFDA — `https://open.fda.gov`; DailyMed — `https://dailymed.nlm.nih.gov` (SPL XML incl. **inactive ingredients**; bulk ZIPs); RxNorm — `https://www.nlm.nih.gov/research/umls/rxnorm/`; NDC Directory; Drugs@FDA — `https://www.accessdata.fda.gov/scripts/cder/daf/`; Orange Book — `https://www.accessdata.fda.gov/scripts/cder/ob/`; Purple Book — `https://purplebooksearch.fda.gov` | Products → manufacturers → active and inactive ingredients → approval and indication | US public domain. Labels give ingredient identity, rarely species origin (mushbooh). |
| Pharma — regulatory events (F4) | FDA drug-shortage database — `https://dps.fda.gov/drugshortages`; 503B outsourcing-facility list; FDA warning-letter database | Shortage status, compounding enforcement, warning letters | Public. |
| Vaccines (F7) | CDC *Pink Book* Appendix B (vaccine excipient summary); EMA EPARs and SmPCs — `https://www.ema.europa.eu` | Excipients and substrates per vaccine | Public. |
| Indication shares (Δ19) | CMS Medicare Part D prescribers by drug — `https://data.cms.gov`; Medicaid State Drug Utilization Data — `https://data.medicaid.gov`; ClinicalTrials.gov — `https://clinicaltrials.gov`; WHO Essential Medicines List | Utilisation by drug and prescriber; indications in development | Public; a proxy, not an indication split. |
| Pharma reference | DrugBank (academic dataset) | Curated drug and excipient data | **CC BY-NC — R&D and taxonomy validation only, never in the product.** |
| **Media — ratings** | MPA film ratings — `https://www.filmratings.com` (rating and rating reasons per title); TV Parental Guidelines; ESRB rating search — `https://www.esrb.org` | Maturity rating per title (Δ35, Δ36) | Public lookups. |
| Media — viewing weights | Netflix engagement reports ("What We Watched", semi-annual hours per title); Netflix Tudum Top 10 (weekly hours) — `https://www.netflix.com/tudum/top10` | Viewing-weighted base for Δ35 | Issuer-published. |
| Media — box office by rating | The Numbers — `https://www.the-numbers.com` (market share by MPAA rating); Box Office Mojo | Revenue-weighted exhibitor base (Δ36) | Check terms before reuse. |
| Media — per-flag prevalence | Kids-In-Mind — `https://kids-in-mind.com` (per-title 0–10 scores for sex / nudity, violence / gore, language); IMDb Non-Commercial Datasets — `https://developer.imdb.com/non-commercial-datasets/`; Common Sense Media | Flag prevalence for the top-viewed titles | **IMDb datasets are non-commercial and exclude the Parents Guide; Common Sense and Kids-In-Mind need permission to reuse.** Internal calibration only. |
| Hospitality, cruise, restaurants | Issuer 10-K revenue-recognition notes (onboard, F&B, gaming lines); CLIA; NRA and NACS public headline statistics | Revenue bases and category-mix seeds | NRA / NACS full reports are paid; cite only the public figures. |
| REIT tenants | 10-K top-tenant tables, tenant-industry charts, supplemental packages (EDGAR); OpenStreetMap | Rent by tenant and tenant business | OSM is ODbL — isolate it. |
| Gaming and apps | App Store / Google Play listings (category, age rating, IAP); ESRB; regulator loot-box decisions (Belgian Gaming Commission 2018; Dutch Kansspelautoriteit; UK DCMS 2022) | Mechanic classification; doctrinal grounding | Respect store terms. |
| Sourcing (Type 2) | UN Comtrade — `https://comtradeplus.un.org`; Eurostat Comext; ImportYeti — `https://www.importyeti.com` (US bills of lading) | Gelatin, heparin, pork-input trade flows; supplier tracing | Public / FOIA'd. |
| Competitor and index checks | Shariah ETF holdings via SEC N-PORT filings (e.g. HLAL, SPUS); SC Malaysia list | What the index world holds | Public. |

**Paid feeds** (from the sector maps; display derived verdicts only, never raw rows): ESG business-involvement feeds (ISS ESG sector-based screening with explicit pork and Islamic-finance categories; MSCI BISR and Sharia feed; Sustainalytics product involvement) — the highest-leverage first purchase; FactSet RBICS with Revenue + Tradenames (revenue weighting); Evaluate / IQVIA / Citeline (pharma product sales); NielsenIQ / Circana (retail category sales); Technomic / Datassential (foodservice); Sensor Tower / AppMagic (app revenue); STR / HotStats (hotel F&B); CoStar / Placer.ai (tenants — CoStar's terms are the tightest).

## §XII.8 — Industry codes for finding P1 candidates

Codes find candidates; Gate 1 decides. Browse EDGAR by SIC (§XII.3).

| P1 area | SIC (EDGAR) | NAICS (2022) |
|---|---|---|
| Alcohol | 2082 malt beverages; 2084 wines and brandy; 2085 distilled and blended liquors; 5180 beer, wine and liquor wholesale; 5921 liquor stores | 312120 breweries; 312130 wineries; 312140 distilleries; 424810 / 424820 beer and wine / spirits wholesalers; 445320 beer, wine and liquor retailers; 722410 drinking places |
| Tobacco | 2111 cigarettes; 2121 cigars; 2131 chewing and smoking tobacco; 5194 tobacco wholesale | 312230 tobacco manufacturing; 424940 tobacco wholesale; 459991 tobacco and vape retailers |
| Gambling | 7990 amusement and recreation services (casinos); 7011 hotels (casino hotels) | 713210 casinos; 721120 casino hotels; 713290 other gambling |
| Pork | 2011 meat packing; 2013 sausages and prepared meats (check species) | 112210 hog and pig farming; 311611 animal slaughtering; 311612 meat processed from carcasses |
| Banking and lending | 6021 / 6022 commercial banks; 6035 / 6036 savings institutions; 6141 personal credit; 6153 / 6159 business credit; 6162 / 6163 mortgage bankers and brokers; 6199 finance services; 6211 brokers and dealers | 522110 commercial banking; 522130 credit unions; 522291 consumer lending; 522292 real-estate credit |
| Insurance | 6311 life; 6321 accident and health; 6324 hospital and medical plans; 6331 fire, marine and casualty; 6351 surety; 6361 title; 6399 other carriers; 6411 agents and brokers | 524113 / 524114 / 524126 direct insurers; 524130 reinsurance; 524210 agencies and brokerages |
| Weapons | 3480 / 3482 / 3484 / 3489 ordnance and small arms; 3760 / 3761 guided missiles | 332992–332994 ammunition and small arms; 336414 guided missiles |
| REITs (tenant analysis needed) | 6798 | 531120 and related |

## §XII.9 — Licensing and display rules

- **Public-domain government data** (SEC, TTB, USDA, FDA / NLM, ATF, FDIC): display and redistribute raw, with attribution.
- **Open data:** CC0 (FoodData Central) is free to use; **ODbL** (Open Food Facts, OpenStreetMap) can force you to open-license a merged database — keep it logically isolated.
- **Non-commercial:** DrugBank academic, IMDb Non-Commercial Datasets, Kilts / Nielsen academic panels — R&D only, never in the shipped product.
- **Trade associations:** NRA and NACS — cite public headline figures; never reproduce purchased tables.
- **Licensed feeds:** internal analysis plus display of your own computed verdict only; get the "derived data" clause in writing for each contract.
- **Certifiers:** positive confirmation only.

## §XII.10 — Feed reconciliation protocol

Before any gate is computed, pull these fields from the filing and compare them with the feed: revenue; gross interest income; interest expense; net income; diluted EPS and shares; total assets; cash and IBS (current and non-current); AR; each debt line; finance and operating lease liabilities; goodwill; intangibles; equity; dividends per share. Any gap above 1% goes into the report's reconciliation log with both values; **the filing wins.**

Known feed failure modes in this record:

| Issuer | Feed showed | Filing showed | Effect |
|---|---|---|---|
| RXST | Interest income $2.508M | $9.332M | Layer 1 1.86% → 6.94%: PASS became FAIL |
| PEP | Interest income $0 (a net figure) | $719M gross | Layer 1 understated |
| AMC | Operating income +$1,848.6M; "gain" +$1,946.3M | Operating loss ~$17.4M; ~$196M debt-extinguishment losses | Sign errors |
| AMC | "Capital lease obligations" ~$4.10B | Finance leases $52.5M; the rest operating leases | IBD track confusion |
| HIMS | "Long-term debt" $1,115.7M (convertible + operating lease) | Convertible $972.6M carried / $1,000M principal; operating leases $148.0M | IBD overstated and double-counted |
| NFLX | "Interest and other income" $172.5M | Gross interest $295M | Layer 1 understated ~40% |
| NVO | "Finance income" DKK 9,660M | Interest income DKK 1,269M | Layer 1 overstated if used raw |

[Operational Note for Claude] Run §XII.10 before anything else and put the log in the report. If the SEC API is reachable, pull the companyfacts JSON and the filing itself; quote accession numbers. When a field exists only in a note, read the note — do not substitute a nearby tag.

---

# PART XIII — THE ISSUER RECORD (CORRECTED)

All figures FY2025 unless stated. Balance-sheet and income figures were re-checked against each issuer's SEC XBRL filing on 7 October 2026 (accession numbers in §XIII.2); market caps, product splits and attribution rates come from the issuer reports as corrected in Part 0. "CAT" = categorical fail.

## §XIII.1 — Verdicts

| # | Ticker | Issuer / business | FY | Sc A | Sc B | Sc C | Strictest | What decides it | Changed in v5.0 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | MELI | MercadoLibre — e-commerce + fintech | 2025 | CAT | CAT | CAT | CAT | G1 step 2: own loan book (credits revenue 18.7%); G4 28.0 / 37.0 / 37.2 / 37.9% | Basis (F22) |
| 2 | EXLS | ExlService — analytics / BPM to financial industries | 2025 | **PASS** | FAIL | FAIL | FAIL | G4 2.49 / 16.37 / 37.24 / 57.33% (Δ16); G2 clean (IBD/TA 17.7%) | Description (F23) |
| 3 | MLNK | MeridianLink — lending software (taken private 2025) | 2024 | CAT | CAT | CAT | CAT | G1 Δ14 (~85% from lenders); G2 IBD/TA 48.8%; G4 5.18 / 33.0 / 59.3 / 77.2% | Basis (F21) |
| 4 | EVER | EverQuote — insurance lead generation | 2025 | CAT | CAT | CAT | CAT | G1 Δ14 (100% insurance) | — |
| 5 | RXST | RxSight — ophthalmic devices | 2025 | FAIL | FAIL | FAIL | FAIL | G3 Layer 1 6.94% (all windows); G2 Cash + IBS 36.8% of 12m MCAP (Sc B/C/Strictest), 73.2% of TA | **Yes — was "split" (F19)** |
| 6 | VEEV | Veeva — life-sciences SaaS | Jan 2026 | FAIL | FAIL | FAIL | FAIL | G3 Layer 1 8.36%; G2 Cash + IBS 73.1% of TA (Sc B+) | **Yes — Sc A was "mixed" (F20)** |
| 7 | HIMS | Hims & Hers — DTC telehealth | 2025 | **PASS** | FAIL | FAIL | FAIL | G2 IBD/TA 46.4% (track a) / 53.3% (b); Cash + IBS/TA 43.1%; G4 Sc C 20.8%, Strictest 60.0% | Sc B label MIXED → FAIL; figures (F15, F27) |
| 8 | RHHBY | Roche — pharma + diagnostics | 2025 | **PASS** | MIXED-Watch | FAIL | FAIL | G2 IBD/TA 32.2% (Δ22 at Sc B; bright-line at Sc C / Strictest); G4 0.41 / 0.41 / 0.46 / 0.69% | — |
| 9 | NVO | Novo Nordisk — GLP-1 + insulin | 2025 | **PASS** | **PASS** | FAIL | FAIL | G4 Sc C 24.5%, Strictest 76.3% (U1 lock); G2 Strictest track (b) 25.7% | Sc C figure (F5); Strictest G2 (F16) |
| 10 | LLY | Eli Lilly — GLP-1, diabetes, ED | 2025 | PASS (provisional) | FAIL | FAIL | FAIL | G2 IBD/TA 37.8% (a) / 39.0% (b); G4 never computed (F35) | Flagged |
| 11 | SNY | Sanofi — pharma + vaccines | 2025 | **PASS** | **PASS** | FAIL | FAIL | **G2 Hanbali ratio R7: IBD €18.7B ÷ (MCAP − €67.6B goodwill + intangibles) > 30% at any MCAP below ~€130B (F42)**; G4 0.76 / 0.76 / 2.61 / 6.25% | **Yes — Sc C was PASS (F42)** |
| 12 | JNJ | Johnson & Johnson — pharma + MedTech | 2025 | **PASS** | **PASS** | **PASS** | **PASS** | G2 IBD/TA 24.1% (a) / 24.8% (b); R7 ~15%; G4 1.12 / 1.12 / 1.33 / 1.33% | — |
| 13 | ABBV | AbbVie — immunology, oncology, aesthetics | 2025 | **PASS** | FAIL | FAIL | FAIL | G2 IBD/TA 50.4%; G4 0.43 / 0.43 / 4.93 / 8.23% | Figures (F3, F24) |
| 14 | MRNA | Moderna — mRNA vaccines | 2025 | FAIL | FAIL | FAIL | FAIL | G3 Layer 1 16.15%; **G2 Cash + IBS 41.7% of MCAP, 65.9% of TA** | Basis (F6): two gates |
| 15 | BRK | Berkshire Hathaway — conglomerate | 2025 | CAT | CAT | CAT | CAT | G1 U2: insurance premiums 23.9% of revenue; look-through (~38% of the 13F book in non-compliant financials); T-bill interest | — |
| 16 | DIS | Walt Disney — media, parks | Sep 2025 | FAIL | FAIL | FAIL | FAIL | G4 7.06 / 9.18 / 11.70 / 14.68%; G2 R7 43.8% fails Sc C / Strictest | Figures (F8, F25, F42) |
| 17 | NFLX | Netflix — SVOD | 2025 | FAIL | FAIL | FAIL | FAIL | G4 29.61 / 34.18 / 50.79 / 65.75%; G2 Strictest 26.0% (a) / 30.5% (b) | Figures (F8) |
| 18 | AMC | AMC Entertainment — exhibitor | 2025 | FAIL | FAIL | FAIL | FAIL | G2 51.0% (a) / 101.5% (b); negative equity; G4 8.31 / 9.86 / 14.19 / 17.14% | Figures (F16, F25) |

**Passes by scenario:** Sc A — 8 (EXLS, HIMS, RHHBY, NVO, LLY provisional, SNY, JNJ, ABBV); Sc B — 3 (NVO, SNY, JNJ) plus Roche MIXED; Sc C — 1 (JNJ); Strictest — 1 (JNJ). **JNJ is the only issuer that passes all four.**

## §XIII.2 — Issuer notes (what changed and why)

- **MELI** (10-K 0001099590-26-000006). Revenue $28,893M; credits revenue ~$5,395M (18.7%) from a regulated lending subsidiary — direct conduct of P1-FIN above 5% → Gate 1 categorical (U2). Float yield ~$3.5B and AUM pass-through analysed under §54. Report NPI kept (28.0 / 37.0 / 37.2 / 37.9%; the report's §8 variant 37.4 / 38.1% is a rounding of the same model). Ja'fari mapping corrected to Sc B + khums (F40).
- **EXLS** (0001297989-26-000008). Revenue $2,087.7M; net income $251.0M; EPS $1.54; IBD $298.6M + finance leases $2.2M = 17.7% of TA $1,702.2M; interest income $9.6M (0.46%). Insurance IMU 34.0%; financial-industry clients ~59% → Δ16. Report NPI kept.
- **MLNK** (FY2024 10-K 0001834494-25-000018). Net loss $29.77M; Layer 1 $4.924M (1.56%); ~85% of revenue from banks, credit unions and mortgage lenders → Δ14 categorical. Taken private in 2025: record closed.
- **EVER** (0001193125-26-066957). Revenue $692.5M; 100% insurance lead generation → Δ14 categorical. Gate 2 passes by wide margins (the old §1 precedent line was wrong — F32).
- **RXST** (0001193125-26-071775). Revenue $134.5M; `InterestAndOtherIncome` $9.332M → **Layer 1 6.94%: FAIL at every scenario and window**; Cash + IBS $228.1M = 73.2% of TA $311.8M; 36.8% of 12m MCAP (fails Sc B / C / Strictest), 19.0% of 24m (passes the Sc A cash test). Net loss $38.9M.
- **VEEV** (0001393052-26-000014). Revenue $3,195.3M; interest income (net, debt-free) $267.2M = **8.36%**; Cash + IBS $6,560.8M = 73.1% of TA; no borrowings (operating leases $95.9M). Δ16 customer mix 0.04 / 0.55 / 2.0 / 3.2%. NPI 8.40 / 8.91 / 10.36 / 11.56%.
- **HIMS** (0001773751-26-000022). Revenue $2,347.6M; net income $128.4M; EPS $0.51; TA $2,154.7M. **IBD: convertible $1,000M principal ($972.6M carried); operating leases $148.0M; no finance leases** (F15). IBD/MCAP 9.5% / 13.9% / 19.6% (12 / 24 / 36m) — passes Sc A. Other non-operating income $23.1M ≈ 0.98% (Layer 1). Sc C NPI: ED 6.0% + GLP-1 13.5% + hair 0.24% + skincare 0.04% + L1 0.98% = **20.8%**. Strictest: ED 20% + GLP-1 38.5% + hair 0.2% + skincare 0.26% (D8) + L1 0.98% = **60.0%**. S&P Shariah: market-cap tests pass (F14). Class V supervoting → G-flag (F36).
- **RHHBY** (no SEC filing; Annual Report 2025, IFRS). IBD CHF 32.4B / TA CHF 100.7B = 32.2%. The R7 Hanbali ratio was not computed in the report — compute it at re-screen. Purification uses an estimated tax rate of ~18%.
- **NVO** (20-F 0000353278-26-000012). Revenue DKK 309,064M; net income DKK 102,434M; EPS DKK 23.03; ETR 21.5%. Borrowings DKK 130,958M / TA DKK 542,902M = 24.1% (track a); + lease liabilities DKK 8,572M = **25.7% (track b) → Strictest Gate-2 FAIL**. Interest income DKK 1,269M (the IFRS finance-income line of DKK 9,660M includes FX). Sc C: Wegovy + Saxenda DKK 82,347M × 25% + Ozempic / Rybelsus / Victoza DKK 152,202M × 35% + L1 + other flags = **24.5%**.
- **LLY** (0000059478-26-000013). Revenue $65,179M; net income $20,640M; EPS $22.95; DPS $6.23; debt $42,503M / TA $112,476M = 37.8%. Gate-4 NPI never computed (F35): under U1 the GLP-1 and ED lines take 30% (Sc C default) and 100% (Strictest), so both scenarios fail Gate 4 as well; Sc A is provisional on Layer 1.
- **SNY** (20-F 0001628280-26-008403). Net income €7,813M; EPS €6.37; borrowings €18,702M / TA €126,805M = 14.7%; **goodwill €41,300M + intangibles €26,261M = €67.6B**. R7 needs MCAP ≥ €67.6B + €18.7B / 0.30 ≈ **€130B** to pass at 30%; Sanofi's market cap was ~€104–139B through 2025 (≈ €138.5B in March, ≈ $121.6B in December), so the Sc C worst-of-window test fails (F42). Recompute the exact 12/24/36-month averages at re-screen; Sc C stays FAIL unless every window average is above ~€130B.
- **JNJ** (0000200406-26-000016). Revenue $94,193M; interest income $1,056M (1.12%); interest expense $971M; net income $26,804M (lifted by ~$7B talc-reserve reversals); EPS $11.03; dividends paid $5.14; debt $47,938M / TA $199,210M = 24.1%; + operating leases $1,400M = 24.8%; capitalised interest $114M (L3 0.12%). Talc Option A (U6). The report's §16 cross-issuer table is void (F4).
- **ABBV** (0001551152-26-000008; the report cites a different accession number). Revenue $61,160M; interest income $266M; EPS $2.36; DPS declared $6.65 (payout > 100%); debt and finance leases $67,496M / TA $133,960M = **50.4%**; equity −$3,270M. R7 ≈ $67.5B / (~$305B − $88.3B) ≈ 31% also fails Sc C.
- **MRNA** (0001682852-26-000033). Revenue $1,944M; interest income $314M = **16.15%**; net loss $2,822M; Cash $2,595M + current investments $3,204M + non-current investments $2,336M = **$8,135M → 41.7% of MCAP (~$19.5B), 65.9% of TA $12,338M**; term loan $590M carried + finance leases $45M. Δ26 (U7) and HEK293 reading (ii) (U8) keep Gate 4 at 0%. The proposed treasury rule is Δ39 (not ratified).
- **BRK** (0001193125-26-083899). Revenue $371,444M; premiums earned ~$88.9B (23.9%) → U2 categorical. Purification is not a remedy: divest.
- **DIS** (0001744489-25-000155). See §47.1. Goodwill $73,294M + intangibles $9,272M; R7 at ~$179B MCAP = 43.8% → Sc C / Strictest Gate 2 fail (F42). Per-service disclosure ended after FY2025 Q4 (Δ29 sunset).
- **NFLX** (0001065280-26-000034). See §47.2. Content assets ($32.8B) are productive assets, not intangibles, for R7.
- **AMC** (0001411579-26-000016). See §47.3.

## §XIII.3 — Purification restated (Δ6 v5.0, per share, reporting currency)

| Issuer | Sc A | Sc B | Sc C | Strictest | Superseded figures | EPS | Δ6-D dividend part (payout) |
|---|---|---|---|---|---|---|---|
| HIMS | $0.09 | $0.09 | $0.17 | $0.33 | $0.07–0.10 / same / $1.85–2.30 / $1.85–2.30 | $0.51 | no dividend |
| NVO (per share = per ADR) | DKK 0.22 | DKK 0.22 | DKK 5.72 | DKK 17.53 | 0.22 / 0.22 / 12.65 / 41.59 | DKK 23.03 | 50.8%: DKK 0.11 / 0.11 / 2.91 / 8.90 |
| ABBV | $0.10 | $0.10 | $0.20 | $0.27 | $0.028 / 0.028 / 0.522 / 0.522 (dividend ratio) | $2.36 | 100% (DPS > EPS): all dividend-attributable |
| JNJ | $0.36 | $0.36 | $0.38 | $0.38 | $0.057 / 0.057 / 0.068 / 0.068 (dividend ratio) | $11.03 | 46.6%: $0.17 / 0.17 / 0.18 / 0.18 |
| SNY (per ADS = ½ share) | €0.22 (€0.11) | €0.22 (€0.11) | €0.33 (€0.17) | €0.56 (€0.28) | €0.22 / 0.22 / 0.75 / 1.80 | €6.37 | — |
| RHHBY (per ROP; ADR = ⅛) | CHF 0.25 | CHF 0.25 | CHF 0.26 | CHF 0.30 | 0.25 / 0.25 / 0.32 / 0.55 | ~CHF 15.9 | 61.6% |
| VEEV | $1.22 | $1.24 | $1.30 | $1.35 | $1.21 / 1.21 / 4.95 / 5.40 | $5.44 | no dividend |
| EXLS | $0.08 | $0.29 | $0.60 | $0.90 | $0.26 / 1.68 / 3.82 / 5.88 | $1.54 | no dividend |
| NFLX | $0.77 | $0.89 | $1.30 | $1.67 | Sc B $2.66 (above EPS) | $2.53 | no dividend |
| DIS | $0.71 | $0.85 | $1.01 | $1.21 | ~$0.05–0.08 (dividend ratio) | $6.85 | 21.9%: $0.16 / 0.19 / 0.22 / 0.27 |
| MRNA (loss year) | $0.81 | $0.81 | $0.81 | $0.81 | "16.15% of dividends" (no dividend) | −$7.26 | — |
| RXST (loss year) | $0.23 | $0.23 | $0.23 | $0.23 | ~$0.23 | −$0.95 | — |
| AMC (loss year) | $0.02 | $0.02 | $0.02 | $0.02 | "academic" | −$1.34 | — |
| MELI (categorical — exit only) | $12.23 | $15.60 | $15.68 | $15.94 | $159.28 / 210.66 / 212.24 / 216.19 | $39.39 | — |
| MLNK (categorical, FY2024) | $0.06 | $0.06 | $0.06 | $0.06 | $0.057 | loss | — |
| EVER, BRK (categorical) | divest — not computed | | | | | | |
| LLY | re-screen (F35) | | | | | | |

AAOIFI dividend-ratio cross-check (§59), DPS × NPI%: JNJ $0.058 / 0.058 / 0.068 / 0.068; ABBV $0.029 / 0.029 / 0.33 / 0.55; DIS $0.106 / 0.138 / 0.176 / 0.220; NVO DKK 0.05 / 0.05 / 2.87 / 8.93.

## §XIII.4 — Legacy reports (v3.0) — preliminary only

- **PEP** (10-K 0000077476-26-000007): debt $49,182M / TA $107,399M = 45.8% → Sc B / C / Strictest Gate-2 FAIL; IBD / MCAP ~25.0% passes Sc A; Layer 1 "interest income and other" $719M (0.77%; the gross interest split needs the note); alcohol-brand licensing (Hard MTN Dew, Lipton Hard Iced Tea) is Tier 1 at 100% (§48); Sc A NPI ~0.9% → **preliminary: Sc A PASS, Sc B / C / Strictest FAIL.**
- **WMT** (10-K 0000104169-26-000055): debt $38,166M + finance leases $6,761M = 15.8% of TA $284,668M (track b with operating leases $15,572M: 21.2%); Gate 2 passes. Gate 4: alcohol (~2.5%) + tobacco (~2.7%) + pork are Tier 1 at **every** scenario (P1), so Sc A is already above 5%; non-halal meat adds more at Sc C / Strictest → **preliminary: FAIL all four.**

Both need a full v5.0 re-screen before they enter the record.

## §XIII.5 — Twelve-standard tallies

Every tally in the earlier reports and in v4.4.4 §30 used a different list of standards (F14) and is void. Re-run each issuer against the §60 list at its next re-screen. Until then, quote only the four-scenario verdicts above.

---

# PART XIV — APPLYING THIS IN THE MAZ VANTAGE APP

The app's halal screen today (`shariahRules` and `SHARIAH_NOTE` in `web/src/lib/ideas.ts`) applies three rules: spot debt / MCAP, cash / MCAP, and an industry keyword list. Mapped onto this methodology it is a partial **Sc A Gate 2** (spot MCAP instead of the 24-month average, no AR test) plus a coarse **Gate 1 step 1**. It has no Layer-1 test, no total-asset ratios, no Gate-4 attribution and no purification, and its own note says so.

What the free data in Part XII could add, in order of value per unit of work:

1. **Layer 1 (R17)** from SEC XBRL, with the §XII.4 caveats — it alone catches MRNA, VEEV and RXST.
2. **Total-asset and Hanbali ratios (R4, R7, R11, R12, R19)** from XBRL balance-sheet tags — they catch HIMS, ABBV, LLY, Roche, SNY, DIS and AMC at Sc B / C / Strictest.
3. **24-month average MCAP** for Sc A instead of spot.
4. **Gate 1 steps 2–3** from segment facts plus Exhibit 21 and EDGAR full-text search.

Gate 4 product attribution, Δ16 customer mix and Δ35 content measurement stay per-issuer research; the app should show them only where a report exists, labelled with its date and version. Machine keys for every ratio and layer are in §7 and §12.

---

# APPENDIX A — GLOSSARY

- **AAOIFI** — Accounting and Auditing Organization for Islamic Financial Institutions (Bahrain); SS 21 governs shares.
- **Archetype card** — §37 per-service content rates; fallback to measured Δ35 rates.
- **CAT** — categorical fail (Gate 1).
- **Cash + IBS** — cash plus interest-bearing securities (§6).
- **Ḍarūra** — necessity; collapses attribution (Δ23).
- **G-flag** — non-attributing governance item on the Gate-5 register.
- **Ḥājah (ʿāmmah)** — need (collective); Δ25 / Δ26.
- **IBD** — interest-bearing debt; tracks (a) and (b) (§6, Δ37).
- **Iʿānah** — assisting in a prohibition; basis of Tiers 2–3.
- **Ijārah** — lease; basis of the Δ31 Sc A carve-out and the REIT rule.
- **Istihlāk / istihālah** — consumption / transformation into something else; basis of Δ24.
- **Khums** — Jaʿfari one-fifth on annual surplus (§58).
- **Lahw / malāhī** — idle diversion; the F12 question.
- **Maṣlaḥah (ʿāmmah)** — (public) welfare.
- **Maysir** — gambling.
- **Mushbooh** — doubtful (origin unknown).
- **NPI** — non-permissible income (§14).
- **P1** — enumerated-prohibited activity (§5).
- **R1–R22** — Gate-2 ratios (§7). **L1–L8** — Gate-3 layers (§12).
- **S8 rule** — compute every gate at every scenario regardless of an earlier fail.
- **Sadd al-dharāʾiʿ** — blocking the means; basis for conservative edges at Sc C / Strictest.
- **Tier 0–3** — the *iʿānah* framework (§15).
- **Track (a) / (b)** — borrowings + finance leases / plus operating leases.
- **Wakālah** — agency; Δ8 and the float carve-out (§54).
- **Wasīṭ** — intermediary; Δ14.

# APPENDIX B — QUICK-START DECISION TREE

1. Confirm v5.0; read §0.4 (locks).
2. Pull the filing; run the §XII.10 reconciliation; log every feed gap.
3. Walk the §56.2 trigger matrix; list every delta that applies.
4. **Gate 1** (§5): primary business → own P1 segment > 5% → facilitation ≥ 80% → sector routing → special classes → sub-industry → client elections.
5. **Gate 2** (§6–§11): IBD tracks (a) and (b); Cash + IBS; AR; MCAP windows; all twenty-two ratios at all four scenarios on their primary windows; Δ22 at Sc A / B; Δ38 if equity ≤ 0.
6. **Gate 3** (§12): gross L1 (+ L7, speculative L6) ≤ 5%; Δ20 cross-reference.
7. **Gate 4**: pharma → §34 hierarchy; media → §38 tree; other sectors → Part VIII; customer mix → §17; size sub-lines per §16; NPI incl. L1 against 5 / 5 / 5 / 3%.
8. **Gate 5**: disclosure adequacy (Δ15), reconciliation log, G-flags.
9. Aggregate per scenario (§4); report all four (S8).
10. Purification (§57) with Δ6-D, Δ17 and currency; khums (§58); AAOIFI cross-check (§59).
11. Six-school mapping (§61); twelve-standard matrix (§60).
12. Monitoring triggers; open questions; write the report to §62.

# APPENDIX C — SOURCE FILES BEHIND THIS EDITION

In `C:\Users\yilma\Downloads`: `Shariah_Screening_Master_Methodology_v4_4_4_Consolidated.md.pdf` (superseded by this edition); `..._v4_4_2_Consolidated.md`; `..._v4_3_Consolidated.docx`; `..._v4_4_1_Consolidated.md`; v4.2 and v4 files; `Shariah_Screening_Master_Methodology_v3.docx` (legacy). Issuer reports: MELI and EXLS (`*_Shariah_Analysis_v4_2.docx`); MLNK `compass_artifact_wf-294dae85…`; EVER `…3c581b89…`; RXST `…53569e6c…`; VEEV `…7938ef3c…`; HIMS `…75c7bd29…`; RHHBY `…86c3e1df…`; NVO `…20bf6a1f…`; JNJ `…7e6d279e…`; ABBV `…19f7fddd…` (superseded v4.4.1 draft); MRNA `…1f5fffab…`; BRK `…8dfdf616…`; NFLX `Netflix_NFLX_Shariah_Screening_v4_4_3_Issuer17.md` and dossier `…cc61d698…`; AMC `AMC_Entertainment_Shariah_Screening_v4_4_3_Issuer18.md`; legacy `PEP_Shariah_Analysis_FY2025.docx`, `WMT_Shariah_FY2026_v3.docx`. LLY, SNY and DIS survive only as worked examples inside v4.4.4. Sourcing: `Shariah_Screening_Sector_Data_Maps.md`, `Shariah_Screening_Free_Sources.md`, `Shariah-Compliant Equity Screening_ Data Source Map … .pdf`. Where a file has a "(1)" copy, the copies differ only by added citation markers.

# APPENDIX D — CONCORDANCE: v4.4.4 SECTIONS → v5.0

Part 0's "Where" column cites v4.4.4 numbering. The rest of this edition uses its own.

| v4.4.4 | Subject | v5.0 |
|---|---|---|
| §1 | Five gates | §2, §5 |
| §2 | Four scenarios | §3 |
| §3, §26–§28 | Delta lists, trigger matrix | §56 |
| §4 | 22 ratios | §6, §7 |
| §5 | MCAP triangulation | §8 |
| §6 | Δ22 | §9 |
| §7–§8 | Eight layers; Roche example | §12, §13 |
| §9 | Δ20 | §10 |
| §10–§12 | Tiers; Δ16; F11 | §15, §17 |
| §13–§23 | F1–F11 | §19–§29 |
| §24 | Acquisition financing / treasury | §30 |
| §25 | Insurance | §31 |
| §29 | Purification | §57 |
| §30 | Twelve standards | §60 |
| §31 | Khums | §58 |
| §32 | Report structure | §62 |
| §33–§35 | Roadmap, authority | §0.5, §1 |
| §36–§41 | Δ23–Δ26, Modifier Rules, Rashid | §32 |
| §42 | Pharma hierarchy | §34 |
| §43 | Sanofi example | §35.1 |
| §44 | Δ27 and AbbVie example | §33, §35.2 |
| §45 | F12 (incl. §45.8 data disciplines) | §36–§39 |
| §46–§51 | Δ28–Δ33 | §40–§44, §16 |
| §52 | Disney example | §47.1 |
| §53 | Δ34 and Netflix | §45, §47.2 |
| §54 | Δ35 | §46 |
| §55 | Δ36–Δ38 | §46, §6, §11 |
| §56 | AMC example | §47.3 |

**END OF v5.0 DEFINITIVE CONSOLIDATED EDITION**
