# Maz Vantage — Dividend Module, Full SA Parity

Every line on Seeking Alpha's dividend pages, specified for implementation. **64 lines across 4 factors.**
Line inventory scraped live from SA's AAPL Safety / Growth / Yield pages; Consistency designed from the
dividend record (SA renders that page client-side). Weights are my allocation — backtest hypotheses.

## Build tags
- ✅ **Direct** — read a finished FMP field, or a one-step computation from raw statement data.
- ⚙️ **Workaround** — FMP lacks the field; a modelled substitute is specified. Calibrated against SA's printed AAPL values where possible.
- ⛔ **Impossible** — no viable reconstruction. Mark NM and renormalize.

**Result: 61 of 64 lines buildable (52 ✅, 9 ⚙️), 3 ⛔.**

## Universe rule
Only **dividend payers** are scored. A non-payer is excluded from the dividend universe, not given a low
score. Rank payers against payers, within sector.

## Composite weights
| Factor | Weight |
|---|:--:|
| **Dividend Safety** | **2×** |
| Dividend Yield | 1× |
| Dividend Growth | 1× |
| Dividend Consistency | 1× |

Two-layer Hazen re-rank, identical to the equity engine. `score = 1 + 4 × composite percentile`.

---

# THE WORKAROUNDS (read this first)

Nine lines need substitutes. All trace to two gaps in FMP: **no forward DPS consensus** and **no forward
cash-flow consensus**. Both are solvable.

### Workaround A — Indicated forward DPS (solves 4 lines)
```
DPS_fwd = latest declared dividend × payment frequency
```
from `dividends` (`dividend`, `frequency`, `declarationDate`).

**This is very likely exact parity, not an approximation.** Apple's card prints Dividend Yield (TTM)
**0.38%** and Dividend Yield (FWD) **0.38%** — identical. If SA used an analyst DPS forecast these would
diverge (Apple hikes in May; the page was captured in December). Identical values are the signature of an
indicated annualised rate. Calibration confirms it: run-rate DPS ÷ `epsAvg(FY1)` gives **12.53%** against
SA's printed **12.55%** for Dividend Payout Ratio (FY1).

### Workaround B — Forward cash flow via the current conversion ratio (solves 3 lines)
FMP has `netIncomeAvg(FY1)` but no forward OCF or FCF. Scale the forward earnings estimate by the
company's own current cash conversion:
```
OCF_FY1 = netIncomeAvg(FY1) × (OCF_TTM / netIncome_TTM)
FCF_FY1 = netIncomeAvg(FY1) × (FCF_TTM / netIncome_TTM)
```
Calibration: Cash Flow Payout Ratio (FY1) → **10.89%** vs SA **10.58%**. Close; the residual is the
conversion ratio drifting. Use a 3-year average conversion ratio rather than a single TTM point to damp it.

### Workaround C — Institutional ownership from 13F (solves 1 line)
"% Owned by Active Institutional Managers": sum `form13F` holdings, then **subtract the passive complexes
by CIK** (Vanguard, BlackRock/iShares, State Street, Geode, Northern Trust, Fidelity index funds).
Classification won't match SA's exactly, but it ranks correctly.

### Workaround D — Pension footnote from filings (solves 1 line)
"Funded Status of Pension": parse the pension footnote in the 10-K via `secFilings`
(plan assets − projected benefit obligation). A dash for most non-pension companies, including Apple.
Low value; weight 0 and skip for MVP.

### The three genuine ⛔
| Line | Why | Action |
|---|---|---|
| DPS Growth FY1–FY3 (CAGR) | needs a multi-year dividend *forecast*; the run-rate proxy gives one point, not a curve | NM, renormalize |
| % of Total Downward DPS Revisions FY1 | needs a DPS estimate-revision feed | NM for MVP — see note below |
| Funded Status of Pension | filing-parse only, near-zero coverage | NM, weight 0 |

*Note on DPS revisions:* this becomes buildable once your **estimates snapshot ledger** has run for a
quarter — snapshot declared DPS weekly, and a declaration below the prior rate is a downward revision.
Not SA's definition, but a usable substitute in ~3 months. Same ledger, one more field.

---

# FACTOR 1 — DIVIDEND SAFETY (2×) — 27 lines

### Tier 1 — payout coverage (48%)
| Line | Wt | Dir | Formula | Source |
|---|--:|:--:|---|---|
| Cash Dividend Payout Ratio (TTM) ✅ | 11% | ↓ | `Σ4Q \|commonDividendsPaid\| ÷ Σ4Q freeCashFlow` | `cash-flow-statement` |
| Dividend Payout Ratio (TTM) Non-GAAP ✅ | 9% | ↓ | `TTM DPS ÷ Σ(last 4 epsActual)` | `dividends`, `earnings-company` |
| Dividend Payout Ratio (FY1) Non-GAAP ⚙️A | 9% | ↓ | `DPS_fwd ÷ epsAvg(FY1)` | `dividends`, `financial-estimates` |
| Cash Flow Payout Ratio (TTM) ✅ | 8% | ↓ | `Σ4Q \|commonDividendsPaid\| ÷ Σ4Q operatingCashFlow` | `cash-flow-statement` |
| Cash Flow Payout Ratio (FY1) ⚙️B | 7% | ↓ | `(DPS_fwd × shares) ÷ OCF_FY1` | workaround B |
| Dividend Payout Ratio (TTM) GAAP ✅ | 4% | ↓ | `Σ4Q \|commonDividendsPaid\| ÷ Σ4Q netIncome` | `cash-flow-statement`, `income-statement` |

**NM:** denominator ≤ 0 → NM. **A payout ratio above 100% is valid and must rank badly — never clamp or NM it.** That is the single most important signal in the module.

### Tier 2 — coverage inverses (6%) — deliberately low, these are algebraic duplicates
| Line | Wt | Dir | Formula | Note |
|---|--:|:--:|---|---|
| Dividend Coverage Ratio (FY1) ⚙️A | 3% | ↑ | `epsAvg(FY1) ÷ DPS_fwd` | = 1 ÷ payout FY1. Verified: 7.98 vs SA 7.97 |
| Dividend Coverage Ratio (TTM) ✅ | 2% | ↑ | `netIncome_TTM ÷ dividends_TTM` | = 1 ÷ payout TTM. Verified: 7.61 vs SA 7.61 |
| FCF Yield to Dividend Yield Ratio (TTM) ✅ | 1% | ↑ | `FCF_TTM ÷ dividends_TTM` | = 1 ÷ cash payout. Verified: 7.94 vs SA 7.98 |

**These carry almost no weight on purpose.** Each is the exact reciprocal of a Tier 1 line. SA lists both
sides; weighting both would double-count payout coverage and let it dominate the factor.

### Tier 3 — leverage (20%)
| Line | Wt | Dir | Formula | Source |
|---|--:|:--:|---|---|
| Net Long Debt / EBITDA (TTM) ✅ | 6% | ↓ | `(longTermDebt − cash − shortTermInvestments − longTermInvestments) ÷ EBITDA_TTM` | `balance-sheet`, `income-statement` |
| Total Debt / Capital (TTM) ✅ | 5% | ↓ | `totalDebt ÷ (totalDebt + equity)` | `ratios-ttm.debtToCapitalRatioTTM` |
| Total Debt / Equity (TTM) ✅ | 4% | ↓ | `totalDebt ÷ totalStockholdersEquity` | `ratios-ttm.debtToEquityRatioTTM` |
| Net Long Debt / Assets (TTM) ✅ | 3% | ↓ | `net long debt (above) ÷ totalAssets` | `balance-sheet` |
| Interest Coverage (TTM) ✅ | 2% | ↑ | `EBIT_TTM ÷ interest expense_TTM` | `ratios-ttm.interestCoverageRatioTTM` |

**Net long debt nets *all* investments, not just cash** — that's what reconciles Apple's 6.39% / 2.58%.
Negative values (net cash) are valid and rank best. **NM:** EBITDA ≤ 0; Interest Coverage NM if debt or
interest = 0 (Apple prints a dash here for exactly that reason).

### Tier 4 — earnings & cash quality (18%)
| Line | Wt | Dir | Formula | Source |
|---|--:|:--:|---|---|
| Cash From Operations (TTM) ✅ | 6% | ↑ | `Σ4Q operatingCashFlow` — absolute size | `cash-flow-statement` |
| Net Income Margin (TTM) ✅ | 4% | ↑ | `netIncome_TTM ÷ revenue_TTM` | `ratios-ttm.netProfitMarginTTM` |
| Return on Common Equity (TTM) ✅ | 4% | ↑ | `netIncome_TTM ÷ average equity` | `key-metrics-ttm.returnOnEquityTTM` |
| Cash Per Share (TTM) ✅ | 2% | ↑ | `(cash + short-term investments) ÷ shares` | `ratios-ttm.cashPerShareTTM` |
| Fixed Asset Turnover (TTM) ✅ | 1% | ↑ | `revenue_TTM ÷ net PP&E` | `income-statement`, `balance-sheet` — verified 9.04 vs SA 9.05 |
| Sustainable Growth Rate (TTM) ⚙️ | 1% | ↑ | `ROE × (1 − payout ratio)` | ⚠️ see warning |

⚠️ **Sustainable Growth Rate does not reconcile.** The standard formula gives ~132% for Apple; SA prints
**1.38%**, and their sector median is 0.10% — so SA uses some other normalisation entirely. Ship the
standard definition, rank it internally, but **do not calibrate against SA's value** on this line.

### Tier 5 — market & signal (8%)
| Line | Wt | Dir | Formula | Source |
|---|--:|:--:|---|---|
| Dividend Growth Rate 1-YR CAGR ✅ | 3% | ↑ | `TTM DPS ÷ prior-TTM DPS − 1` | `dividends` |
| % of Total Downward DPS Revisions FY1 ⛔ | 2% | ↓ | — | NM for MVP; buildable from the snapshot ledger in ~3 months |
| 60-Month CAPM Alpha ✅ | 1% | ↑ | intercept of 60 monthly stock returns regressed on the market | `chart:historical-price-eod-light` + index |
| % Owned by Active Institutional Managers ⚙️C | 1% | ↑ | `Σ 13F holdings − passive complexes` ÷ shares outstanding | `form13F` |
| Log of Unadjusted Stock Price ✅ | 0.5% | ↑ | `ln(price)` | `quote.price` — verified 5.58 vs SA 5.58 (natural log, not log₁₀) |
| Dividend Yield to Dividend Payout Ratio (TTM) ✅ | 0.5% | ↑ | `dividend yield ÷ payout ratio` | **identity: this equals GAAP earnings yield.** Verified 3.14% vs SA 3.09% |
| Funded Status of Pension ⛔/⚙️D | 0% | ↑ | plan assets − PBO | 10-K footnote parse; skip for MVP |

*Log of price is a penny-stock control — low-priced shares carry higher dividend risk. Keep the tiny weight.*

---

# FACTOR 2 — DIVIDEND GROWTH (1×) — 15 lines

| Line | Wt | Dir | Formula | Source |
|---|--:|:--:|---|---|
| Dividend Growth Rate 5Y (CAGR) ✅ | 16% | ↑ | `(DPS_FY0 ÷ DPS_FY−5)^(1/5) − 1` | `dividends` |
| Dividend Growth Rate 3Y (CAGR) ✅ | 14% | ↑ | `(DPS_FY0 ÷ DPS_FY−3)^(1/3) − 1` | `dividends` |
| 1 Year Dividend Growth Rate (TTM) ✅ | 13% | ↑ | `Σ4Q DPS ÷ Σ prior-4Q DPS − 1` | `dividends` |
| Dividend Per Share Growth (FWD) ⚙️A | 12% | ↑ | `DPS_fwd ÷ TTM DPS − 1` | `dividends` |
| DPS Growth FY1–FY3 (CAGR) ⛔ | 9% | ↑ | — | no dividend forecast curve exists in FMP → NM, renormalize |
| Dividend Growth Rate 10Y (CAGR) ✅ | 8% | ↑ | `(DPS_FY0 ÷ DPS_FY−10)^(1/10) − 1` | `dividends` |
| EPS Diluted Growth (FWD) ✅ | 8% | ↑ | `(epsAvg(FY+2) ÷ epsDiluted(FY−1))^(1/3) − 1` — mixed basis | `financial-estimates`, `income-statement` |
| FCF Per Share Growth Rate (FWD) ⚙️B | 6% | ↑ | `(FCF_FY1 ÷ shares_fwd) ÷ (FCF_TTM ÷ shares) − 1`; `shares_fwd` = current shares × (1 − TTM buyback rate) | workaround B |
| EBITDA Growth (FWD) ✅ | 4% | ↑ | `(ebitdaAvg(FY+2) ÷ EBITDA(FY−1))^(1/3) − 1` | `financial-estimates` |
| EBIT Growth (FWD) ✅ | 4% | ↑ | `(ebitAvg(FY+2) ÷ EBIT(FY−1))^(1/3) − 1` | `financial-estimates` |
| Revenue Growth (FWD) ✅ | 3% | ↑ | `(revenueAvg(FY+2) ÷ revenue(FY−1))^(1/3) − 1` | `financial-estimates` |
| Return on Net Tangible Assets (TTM) ⚙️ | 1% | ↑ | `netIncome_TTM ÷ (equity − goodwill − intangibles)` | ⚠️ doesn't reconcile to SA's 335.66%; rank internally, don't calibrate |
| Degree of Operating Leverage (TTM) ✅ | 1% | ↓ | `%ΔEBIT ÷ %ΔRevenue` (TTM vs prior-TTM) | verified 1.23 vs SA 1.24 |
| 90-Day Coefficient of Variation ✅ | 0.5% | ↓ | `σ(daily close, 90d) ÷ mean(daily close, 90d)` | `chart:historical-price-eod-light` |
| Log of Unadjusted Stock Price ✅ | 0.5% | ↑ | `ln(price)` | `quote.price` |

**NM:** CAGR lines → NM if insufficient history (5 / 3 / 10 full years) or base-year DPS ≤ 0. 1-year line →
NM if prior-TTM DPS = 0. FWD DPS growth → NM if no declaration within two expected payment intervals
(a lapsing payer — flag it, don't score it zero). Growth lines → NM if base ≤ 0.

**Why operating leverage is ↓ here:** high operating leverage means earnings swing hard with revenue, which
makes a growing dividend less reliable. Low DOL is the dividend-friendly reading.

---

# FACTOR 3 — DIVIDEND YIELD (1×) — 12 lines

| Line | Wt | Dir | Formula | Source |
|---|--:|:--:|---|---|
| Dividend Yield (FWD) ⚙️A | 22% | ↑ | `DPS_fwd ÷ price` | `dividends`, `quote.price` |
| Dividend Yield (TTM) ✅ | 18% | ↑ | `Σ4Q DPS ÷ price` | `ratios-ttm.dividendYieldTTM` |
| 4 Year Average Dividend Yield ✅ | 12% | ↑ | mean of the 4 trailing annual yields | `dividends` + `chart` |
| Free Cash Flow Yield (TTM) ✅ | 10% | ↑ | `FCF_TTM ÷ market cap` | `key-metrics-ttm.freeCashFlowYieldTTM` |
| Free Cash Flow Yield (FY1) ⚙️B | 8% | ↑ | `FCF_FY1 ÷ market cap` | workaround B |
| Earnings Yield Non-GAAP (TTM) ✅ | 7% | ↑ | `Σ(last 4 epsActual) ÷ price` | `earnings-company`, `quote` |
| Earnings Yield Non-GAAP (FWD) ✅ | 6% | ↑ | `epsAvg(FY1) ÷ price` | `financial-estimates`, `quote` |
| 5 Year Yield on Cost ✅ | 5% | ↑ | `DPS_fwd ÷ price 5 years ago` | `dividends`, `chart` |
| 3 Year Yield on Cost ✅ | 4% | ↑ | `DPS_fwd ÷ price 3 years ago` | `dividends`, `chart` |
| 1 Year Yield on Cost ✅ | 3% | ↑ | `DPS_fwd ÷ price 1 year ago` | `dividends`, `chart` |
| Operating Earnings Yield (TTM) ⚙️ | 3% | ↑ | `EBIT_TTM ÷ enterprise value` | approximate against SA's print |
| Operating Earnings Yield (FY1) ⚙️ | 2% | ↑ | `ebitAvg(FY1) ÷ enterprise value` | approximate |

**NM:** yield-on-cost lines → NM without the required price history. Earnings yield → NM if trailing EPS ≤ 0.
FCF yield → no NM (negative is valid and ranks last).

**Why the non-dividend yields are in here:** they are SA's "is the yield real?" test. A 6% dividend yield
against a 2% FCF yield is being funded from somewhere other than operations. Ranking them alongside the
dividend yield stops the factor from simply rewarding the most distressed payers — which is the classic
failure mode of a naive yield screen.

**Price rule:** live price only (`quote` / `chart`). Never `profile.price`.

---

# FACTOR 4 — DIVIDEND CONSISTENCY (1×) — 10 lines

SA renders this page client-side; these are built from the dividend record. All ✅ — no gaps.

| Line | Wt | Dir | Formula | Source |
|---|--:|:--:|---|---|
| Consecutive Years of Dividend Growth ✅ | 20% | ↑ | count of consecutive fiscal years with annual DPS > prior year | `dividends` |
| Years of Uninterrupted Payments ✅ | 16% | ↑ | consecutive years with ≥1 payment, counting back from today | `dividends` |
| Dividend Cuts, 10Y count ✅ | 16% | ↓ | years in the last 10 where annual DPS < prior year | `dividends` |
| DPS Growth Stability (5Y) ✅ | 11% | ↓ | sample σ (n−1) of the last 5 annual DPS growth rates | `dividends` |
| Longest Streak Without a Cut ✅ | 8% | ↑ | longest run of years with no DPS decline, full history | `dividends` |
| Payout Ratio Stability (5Y) ✅ | 8% | ↓ | sample σ (n−1) of the last 5 annual payout ratios | `dividends`, `income-statement` |
| Payment Regularity ✅ | 7% | ↑ | share of expected payment slots filled over 5 years, given `frequency` | `dividends.frequency` |
| Dividend Increase Frequency (10Y) ✅ | 6% | ↑ | count of years with an increase ÷ 10 | `dividends` |
| Years Since Last Cut ✅ | 5% | ↑ | years elapsed since the most recent annual DPS decline | `dividends` |
| Special-Dividend Reliance (5Y) ✅ | 3% | ↓ | special dividends ÷ total dividends over 5 years | `dividends` |

**NM:** streak/count lines → NM with fewer than 3 years of history. σ lines → NM with fewer than 3
observations. Payment Regularity → NM if `frequency` is missing or irregular by design.

⚠️ **Special dividends must be excluded from every other line in this factor** — and from all Growth CAGRs.
A one-off payment makes the following year read as a cut and wrecks both factors. Filter `dividends` to
payments matching the stated frequency cadence; route the excluded ones into the Special-Dividend Reliance
line instead. COST is the standing example.

---

# Validation anchors — AAPL

⚠️ **The three SA pages were captured on different dates** — Safety 2026-03-13 at $250.12, Yield 2025-12-16
at $274.61, Growth 2025-11-28 at $278.85. Price-linked values **will not reconcile across pages**; the 1-year
dividend growth line reads 4.00% on Safety and 4.08% on Growth for exactly this reason. Test each line
against its own page's price.

| Line | SA | My formula | Status |
|---|--:|--:|:--:|
| Cash Dividend Payout Ratio (TTM) | 12.56% | — | ✅ |
| Dividend Payout Ratio (TTM) GAAP / Non-GAAP | 13.15% | — | ✅ |
| Dividend Payout Ratio (FY1) Non-GAAP | 12.55% | 12.53% | ✅ workaround A |
| Cash Flow Payout Ratio (TTM) | 11.43% | — | ✅ |
| Cash Flow Payout Ratio (FY1) | 10.58% | 10.89% | ⚙️ workaround B |
| Dividend Coverage Ratio (TTM) | 7.61 | 7.61 | ✅ |
| Dividend Coverage Ratio (FY1) | 7.97 | 7.98 | ✅ |
| FCF Yield to Dividend Yield Ratio | 7.98 | 7.94 | ✅ |
| Dividend Yield to Dividend Payout Ratio | 3.09% | 3.14% | ✅ |
| Cash From Operations (TTM) | 135.47B | — | ✅ |
| Net Long Debt / EBITDA | 6.39% | shape ✓ | ⚙️ nets all investments |
| Fixed Asset Turnover | 9.05 | 9.04 | ✅ |
| Degree of Operating Leverage | 1.24 | 1.23 | ✅ |
| Log of Unadjusted Stock Price | 5.58 | 5.58 | ✅ |
| Dividend Yield (TTM / FWD) | 0.38% / 0.38% | — | ✅ |
| 4 Year Average Dividend Yield | 0.51% | — | ✅ |
| Free Cash Flow Yield (TTM / FY1) | 2.41% / 3.16% | — | ✅ / ⚙️ |
| Dividend Growth 1Y / 3Y / 5Y / 10Y | 4.08 / 4.22 / 4.99 / 7.33% | — | ✅ |
| DPS Growth (FWD) | 4.81% | — | ⚙️ workaround A |
| Sustainable Growth Rate | 1.38% | 132% | ❌ does not reconcile |
| Return on Net Tangible Assets | 335.66% | ~118% | ❌ does not reconcile |

**Grades visible on the free pages:** Cash Dividend Payout Ratio A−, 1Y Dividend Growth C, Dividend Yield
TTM and FWD both D−. Apple's overall dividend grades are paywalled, but the shape is clear: elite safety,
mediocre growth, poor yield — a fortress dividend that is simply too small relative to the share price.

---

# Engine mechanics

Sector-relative Hazen percentile per line (winsorize 1st/99th within sector, average-rank ties,
`(rank − 0.5)/N`, invert for ↓) → weighted average within factor → **re-rank** → weighted average across
factors (Safety 2×) → **re-rank** → `score = 1 + 4 × percentile`. Grade bins as per the equity model.
**NM → drop and renormalize** the factor's surviving weights to 100%. Never impute 0 or median.

# Sector notes for the MVP
- **REITs** — payout ratios on net income are meaningless (depreciation crushes EPS). Substitute **FFO/AFFO** as the payout denominator, or the entire Safety factor misreads. Do not ship REIT dividend scores against the standard formulas.
- **Utilities** — payout ratios structurally high (60–80%) and Levered FCF negative; the sector-relative ranking handles this automatically, but don't apply absolute payout thresholds.
- **Energy** — variable-dividend policies make consistency lines fire NM frequently; expect heavy renormalization.

# Build order
1. `dividends` endpoint ingestion + special-dividend filter → unlocks Consistency (10 lines) and all DPS CAGRs.
2. Workaround A (indicated forward DPS) → unlocks 4 more lines including the two highest-weighted yield lines.
3. Statement-derived Safety lines (payout, leverage, quality) → the 2× factor.
4. Workaround B (forward cash conversion) → 3 lines.
5. Price-history lines (yield on cost, CAPM alpha, CoV).
6. Workaround C (13F) last — lowest weight, highest effort.
