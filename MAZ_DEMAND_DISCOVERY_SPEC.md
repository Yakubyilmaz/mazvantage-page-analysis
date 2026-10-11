# Maz Vantage — Demand Discovery Engine, Full Specification

**Version:** 1.1 (engine `DEMAND_CALC_VERSION = '1.1.0'`)
**Date:** 2026-10-08
**Status:** built in `web/`, pilot run and backtested; see `DEMAND_DISCOVERY_PILOT_REPORT.md` for results
**Supersedes:** the user's v1.0 brief of the same date, kept verbatim as **Appendix A**

This document is the engine as built: what it measures, how every number is computed, what was changed
from the original brief and why, and how to reproduce the pilot. Everything here is implemented in
`web/src/lib/demand-*.ts`; where this text and the code disagree, the code is right and this file is stale.

---

## Build tags

| Tag | Meaning |
|---|---|
| ✅ | Built and tested |
| 🧪 | Built; evidence for it from the backtest is mixed or thin |
| ✍️ | Hand-entered data (chains, evidence register) — each row says how it is known |
| ⛔ | Not built, stated as a gap |

---

# 1. WHAT CHANGED FROM THE ORIGINAL BRIEF (and why)

The original brief (Appendix A) is a good research design. Six changes were made before building, because
as written it would mostly have confirmed trends that are already priced in:

| # | Original | Changed to | Why |
|---|---|---|---|
| 1 | Institutional sources (IEA, WSTS, IFR, USGS) are Tier A and drive detection | They **confirm and size**; **filings detect** | Those sources publish once or twice a year and are read by everyone. The AI-memory move showed up first in company figures — revenue, margins, prepayments — not in a forecast. |
| 2 | Pre-named themes (robotics, AI, copper) | Pre-named chains **plus a cohort scanner** that needs no theme (`scanCohorts`) | Choosing famous themes up front cannot discover anything. The scanner ranks any set of cohorts (layers today; whole industries when a full universe is wired). |
| 3 | "Market expectation gap" weighted 5% | A **priced-in gate** that multiplies the score down (reverse DCF) | A weighted sum lets a crowded, fully priced theme still score ~78. Opportunity is an AND. |
| 4 | No way to say a trend is ending | A **glut warning** shown beside every score, and phases (`overbuilding`, `downturn`) | Lithium demand grew after 2022 while prices fell by more than 80% (IEA GCMO 2025). Supply answers. |
| 5 | Copper as a demand story | Copper as a **supply** story: mine output, lead times, price | 26.7 → 31.3 Mt demand by 2030 is ~2.7%/yr (IEA). The copper price moves on supply. |
| 6 | Source adapters for each institution | A **hand-entered evidence register**, dated and typed | A few numbers a year do not justify scrapers, and the brief rightly forbids reproducing paid reports. |

And two changes **after** the pilot backtest (version 1.1), both stated in the code where they live:

| # | Change | Evidence |
|---|---|---|
| 7 | **Supply discipline** phase: capex cut ≥20% at a capital-intensive company whose revenue is not growing | Conceived from 2019–2026 (Micron 2023, Albemarle 2025); kept because it also held on **1998–2017**, which the rules never saw: median 12-month excess **+13%** vs **+4%** (n=55 vs 303), 24-month **+30%** vs **+5%**. |
| 8 | Phase labels say what the backtest found: "Tight" warns that buying there lagged for cyclicals; "late cycle" renamed **Downturn** (it fires during the bust, not before it); **Overbuilding** added as the pre-glut phase | Out of sample, Tight → 24-month median **−15%**; Overbuilding → 12-month **−16%**, hit rate 38% (n=39). |

The score weights, bands and gate factors were **not** changed after the backtest.

---

# 2. THE PIPELINE

```
hand-written chains (demand-chains.ts) ✍️          evidence register (public/data/demand-evidence.json) ✍️
        │                                                         │
        ▼                                                         ▼
company quarters ── pointInTime(asOf) ──► metrics ──► shortage signature ─┐        evidence confidence
(demand-data.ts)                         (demand-      glut warning        │        (independent origins,
                                          metrics.ts)  phase               │         recency, quality)
                                                       quality proxy       │               │
                                                       priced-in gate      │               │
        │                                                                  ▼               ▼
        └──► layer cohorts (demand-cohort.ts) ──► upstream flags ──► opportunity score + confidence
                                                                         (demand-score.ts)
                                                                                │
                                                       transcript reader ───────┤ (shown, not scored)
                                                       (demand-language.ts)     ▼
                                                                    ChainResult JSON (demand-engine.ts)
                                                                                │
                                                     point-in-time backtest ◄───┘ (demand-backtest.ts)
```

Every function is pure and date-driven. The page calls `analyseAll` with today's date; the backtest calls the
same functions with past dates.

| File | Responsibility |
|---|---|
| `demand-data.ts` | Company/quarter shape, capture reader, live-statement adapter, `pointInTime`, price lookups, calendar-quarter alignment |
| `demand-metrics.ts` | TTM, YoY, growth profile, gross-margin shift, inventory days, contract liabilities, capex profile, cash margins, net cash |
| `demand-signals.ts` | Data types, source quality, readings, banding, evidence confidence |
| `demand-cycle.ts` | Shortage signature, glut warning, capex floors, supply discipline, phases |
| `demand-cohort.ts` | Layer/industry cohorts, breadth, the cohort scanner |
| `demand-chains.ts` | The five chains, members, exposure, lags, lead times ✍️ |
| `demand-pricedin.ts` | Reverse DCF and the priced-in gate |
| `demand-score.ts` | Financial-quality proxy, opportunity score, confidence, version |
| `demand-language.ts` | Rule-based transcript reader |
| `demand-engine.ts` | Orchestration, assembled thesis/bear text, the §45 JSON |
| `demand-backtest.ts` | Point-in-time backtest, buckets, rank correlation, first signals |
| `components/pages/demand-page.tsx` | The page: `/alpha/demand` |

---

# 3. DATA ✅

## 3.1 Company quarters

One shape for everything (`Quarter` in `demand-data.ts`), money in USD millions:

`date` (period end), `filed` (the day it became public), `rev`, `gp`, `oi`, `ni`, `inv` (inventory),
`cl` (contract liabilities = deferred revenue current + non-current — customer prepayments live here),
`cash` (cash + short-term investments), `debt`, `ocf`, `capex` (positive), `sh` (diluted weighted shares, millions).

Sources: the bundled capture `web/public/data/demand-capture.json` (16 companies, 2017–2026, weekly closes from
2018), or live quarterly statements (12 quarters) via the data proxy feeds `incomeQ`, `balanceQ`, `cashflowQ`,
`prices`. The out-of-sample history is a test fixture, `web/tests/fixtures/demand-history.json` (8 companies,
1996–2018). Both are built by `tools/capture/build_demand_capture.py` (see `tools/capture/README.md` §3).

## 3.2 Point in time

`pointInTime(company, asOf)` keeps quarters with `filed ≤ asOf` and prices with `date ≤ asOf`. Nothing
downstream reads raw arrays. Filing-date floors applied at capture: Sandisk's carve-out quarters are treated as
public at the spin (2025-02-24); Vertiv's 2019 rows at the merger (2020-02-10); in the 1996–2018 history, a
missing or non-positive filing lag is replaced by period end + 60 days (72 rows, mostly Eaton) — later than the
10-Q deadline, so the test can only be late.

## 3.3 Guards in every calculation

- **Consecutive:** a trailing twelve months is four quarters whose period ends are 60–120 days apart; a gap → null.
- **A year apart:** year-on-year compares quarters whose ends are 330–400 days apart.
- **No growth on a non-positive base** → null.
- **Missing → dropped, never zero.** Every mean reports its coverage.

---

# 4. THE MEASUREMENTS ✅ (`demand-metrics.ts`)

| Measure | Formula |
|---|---|
| Growth profile | `recent` = mean YoY growth of the two newest quarters; `base` = mean YoY of the four before (≥3 needed); `acceleration = recent − base`; plus TTM-on-TTM growth |
| Gross-margin shift | GM of the two newest quarters combined − GM of the same two a year earlier |
| Inventory days | `inv / (rev − gp) × 91.25`; change = days now / days a year ago − 1; null when no inventory |
| Contract liabilities | growth over a year, only when ≥1% of TTM revenue at both ends |
| Capex profile | TTM capex growth; intensity = TTM capex / TTM revenue; intensity vs mean of 1/2/3 years earlier |
| Cash margins | TTM FCF margin `(ocf − capex)/rev`; **through-cycle** = median TTM margin over up to 20 quarters |
| Net cash | `(cash − debt) / TTM revenue` |

---

# 5. SHORTAGE SIGNATURE, GLUT WARNING, PHASES ✅ (`demand-cycle.ts`)

Each test maps a value linearly to 0–100 between two stated points (`DEMAND_BANDS`), clamped.

## 5.1 Shortage signature (mean of available tests)

| Test | Value | 0 at | 100 at |
|---|---|---|---|
| Demand acceleration | `acceleration` | −15 pts | +15 pts |
| Pricing power | GM shift | −5 pts | +5 pts |
| Inventory tightness | inventory-days change | +30% | −30% |
| Customer prepayments | contract-liability growth | −20% | +60% |
| Capacity build | TTM capex growth (only if capex ≥ **3%** of revenue) | −10% | +50% |

## 5.2 Glut warning (risk; mean of available tests)

| Test | Value | 0 at | 100 at |
|---|---|---|---|
| Capex outrunning revenue | capex growth − revenue growth (only if capex ≥ **6%** of revenue) | 0 | +40 pts |
| Inventory building | inventory-days change; **halved** if GM widened >2 pts; **halved** if prepayments outgrew inventory | 0 | +40% |
| Margin rolling over | GM shift | 0 | −6 pts |
| Growth slowing | acceleration | 0 | −25 pts |
| Capex heavy vs own history | intensity ratio (only if capex ≥ 6%) | 1.0× | 1.8× |

Level: risk <35 low, 35–55 elevated, ≥55 high; coverage <40% → unknown.

The capex floors and the inventory discounts were added after the first run read Vertiv (capex 3.7% of sales,
up 130%) as a glut and Sandisk (fabs in a joint venture) as missing a capacity build — **before** the backtest
was looked at.

## 5.3 Supply discipline 🧪 (v1.1)

`supplyDiscipline(qs)`: capex ≥6% of revenue now or on average over three years, TTM capex growth ≤ −20%,
TTM revenue growth ≤ 0. Post-hoc; validated only in the sense that it held on 1998–2017.

## 5.4 Phases (first match wins)

1. `unknown` — shortage coverage < 40%
2. `early-cycle` (**Supply cut**) — supply discipline
3. `downturn` — glut level high
4. `overbuilding` — capex-outrunning test ≥70 while TTM revenue still growing
5. `tight` — shortage ≥60 and recent growth ≥20%
6. `inflection` — shortage ≥55 and acceleration > 0
7. `cooling` — acceleration < −10 pts and shortage < 45
8. `quiet` (**No signal**)

---

# 6. COHORTS AND THE SCANNER ✅ (`demand-cohort.ts`)

- Members are summed by **calendar quarter** of `periodEnd − 45 days` (so Micron's June–August and Vertiv's
  April–June quarters line up with their calendar quarters).
- A quarter's growth uses only members present in it and a year earlier; the newest quarter read is the newest
  reported by ≥60% of measured members.
- Members are **weighted** by their disclosed/estimated share of revenue in the layer, else exposure ladder/100.
  An `indirect` member weighs **0** (listed, never measured) — Teradyne's AI-driven test revenue must not credit
  robotics.
- **Breadth** = weighted share of members whose own growth is accelerating.
- Cohort demand score = mean of `band(recent growth, −10%, +40%)`, `band(acceleration, −15, +15 pts)`, breadth×100.
- `scanCohorts` ranks by 60% demand score + 40% members' mean shortage signature, with word flags
  ("Demand acceleration detected", "Most members accelerating", "Shortage signature", "Glut warning", "Decelerating").

---

# 7. THE CHAINS ✍️ (`demand-chains.ts`)

| Chain | Layers (metric) — members |
|---|---|
| AI compute build-out | Cloud capex (capex) — MSFT, GOOGL, AMZN, META · Accelerators — NVDA (core, Data Center 89.7% FY26), AVGO (high) · Memory — MU (core), SNDK (core) · Semiconductor test — TER (high, 79%) · Power & cooling — VRT (core, ~85% est.), ETN (meaningful) |
| Copper & electrification | Grid equipment — ETN (high, 73%) · Copper miners — FCX (core, 74.5%), SCCO (core); commodity HGUSD |
| Industrial robotics | Automation — ROK (high), TER (**indirect**, robotics ~10% of 2025 revenue) |
| Lithium (control) | Lithium producers — ALB |
| Residential solar (control) | Inverters — ENPH |

Edges carry lags in quarters (e.g. cloud capex → power & cooling 2–6, accelerators → memory 1–4). Layers carry
supply lead times (memory clean rooms 2–3 years; copper mines 10–17 years — IEA: >16 years discovery to
production for 2010–2019 mines). Every layer lists the companies it cannot measure (SK hynix, Samsung, Kioxia,
BHP, Rio Tinto, Fanuc, Yaskawa, ABB, MP Materials, SQM …).

**Upstream flag:** an edge fires when the upstream cohort's acceleration > +5 pts with demand score ≥55 and the
downstream layer's acceleration is at least 5 pts lower.

Exposure ladder (the brief's): core 100, high 75, meaningful 50, indirect 25. Basis per membership:
ACTUAL (segment reporting), ESTIMATE (rounded secondary figure), INFERRED (stated products).

---

# 8. THE PRICED-IN GATE ✅ (`demand-pricedin.ts`)

Solve for constant ten-year revenue growth `g` such that

```
EV = Σ_{t=1..10} R₀(1+g)^t·m/(1+r)^t + [R₀(1+g)^10·m·(1+gT)/(r−gT)]/(1+r)^10,   r = 9%, gT = 3%
```

by bisection, once with the trailing FCF margin and once with the through-cycle median; the gate reads the
midpoint. EV = price × diluted shares + debt − cash.

| Level | Implied 10-yr growth | Factor |
|---|---|---|
| Not priced in (`modest`) | ≤ 8% | ×1.00 |
| Partly priced in (`demanding`) | ≤ 15% | ×0.85 |
| Priced in (`aggressive`) | ≤ 25% | ×0.60 |
| Beyond the evidence (`extreme`) | > 25% | ×0.40 |

Eased one level when a sourced long-run growth figure for the layer (a FORECAST evidence row) exceeds the implied
growth. A business with **non-positive through-cycle cash** is read as at least "priced in" whatever the
trailing margin says (the cyclical-peak value trap).

---

# 9. THE SCORE AND CONFIDENCE ✅ (`demand-score.ts`)

**Components (0–100):**

- **Demand** = mean of `band(recent growth, −10%, +40%)`, `band(acceleration)`, layer cohort demand score
- **Supply** = mean of the company's shortage signature and the layer's supply score
  (layer supply = 60% members' shortage + 40% `band(mean lead time, 0.25, 12 years)`)
- **Exposure** = ladder value
- **Quality** (filed-figure proxy) = mean of `band(TTM operating margin, 0, 30%)`,
  `band(through-cycle FCF margin, −5%, 20%)`, `band(net cash / revenue, −1, +0.3)`

**Score** = weighted geometric mean (weights demand .35, supply .25, exposure .20, quality .20; each floored at 5;
missing dropped and renormalised) × priced-in factor × glut factor (low 1, elevated .85, high .6, unknown .9).

**Confidence** starts high; each rule can only lower it: evidence confidence for the layer (none → low);
component coverage <100% → medium, <75% → low; shortage coverage <60% → medium; newest filing >150 days old →
medium; exposure INFERRED → medium; priced-in unreadable → medium.

**Evidence confidence:** distinct origins (a newspaper repeating the IEA is one source); high needs two independent
sources of quality ≥85 and the newest ≤540 days old; rows not yet published at `asOf` do not count. Source quality:
official 100, company filing 95, industry body 90, research firm 85, financial media 65, other 30.

**Version:** `DEMAND_CALC_VERSION` is printed with every score.

---

# 10. THE TRANSCRIPT READER 🧪 (`demand-language.ts`)

Rule-based, deterministic: management sentences only (a speaker with ≥25% questions is treated as an analyst;
any sentence ending "?" is skipped; boilerplate dropped), topic filter (demand, orders, backlog, capacity,
supply, pricing, inventory, …), lexicon polarity with **shortage words positive**, negation within three tokens,
flags (acceleration, deceleration, capacity constraint, supply shortage, pricing power, backlog increase, order
cancellation, inventory correction). Score = `100·(P−N)/(P+N) · n/(n+5)`. Snippets ≤25 words. **Shown, not
scored.** Transcripts are never stored in the repo; `public/data/demand-language.json` holds scores and snippets
for six calls.

---

# 11. OUTPUT ✅ (the brief's §45 JSON, as `ChainResult`)

```json
{
  "theme": "ai-compute", "name": "...", "kind": "theme|control", "asOf": "2026-10-08", "calcVersion": "1.1.0",
  "demand_score": 90.3, "acceleration_score": 94.2, "supply_constraint_score": 41.4,
  "confidence": "high", "confidence_score": 85,
  "layers": [{ "layer": {...}, "cohort": {...}, "supplyScore": 0, "evidence": [...], "upstream": [...] }],
  "companies": [{ "symbol": "MU", "phase": "tight", "shortage": {...}, "glut": {...}, "pricedIn": {...},
                  "quality": {...}, "opportunity": { "base": 87.3, "score": 52.4, "factors": {...} },
                  "confidence": { "level": "high", "reasons": [] }, "language": {...},
                  "thesis": ["..."], "bear": ["..."] }],
  "signals": [...evidence rows...], "supply_chain": [...edges...], "sources": [...],
  "commodity": { "symbol": "HGUSD", "change1y": 0.30, "change3y": 0.83 },
  "thesis": ["..."], "bear": ["..."]
}
```

Thesis and bear bullets are **assembled** from readings and evidence rows — no model writes text. The type of
every number (ACTUAL / ESTIMATE / FORECAST / INFERRED / AI_DERIVED) is printed on the page.

---

# 12. THE BACKTEST ✅ (`demand-backtest.ts`, `web/tests/demand-pilot.test.ts`)

Protocol: for every company and filing, run as of the filing date; enter at the first weekly close after the
filing (must be within 14 days); measure 6/12/24-month return minus SPY over the same dates. Buckets report
count, mean, **median**, hit rate; rank correlation for direction. Overlapping windows → no t-statistics.

Periods: **out of sample** 1999-01 → 2017-06 filings (MU, NVDA, FCX, ALB, TER, ROK, SCCO, ETN; 584 filings);
**in sample** 2019-06 → 2026-09 (all captured companies with prices; 315 filings).

Headline (full tables in the report and on the page):

| | Out of sample 1999–2017 | In sample 2019–2026 |
|---|---|---|
| Rank corr. shortage → 12m excess | **−0.10** | −0.03 |
| Rank corr. implied growth → 12m excess | **−0.10** | +0.13 |
| Median 12m / 24m excess, all filings | +6% / +10% | +14% / +25% |
| Tight | +5% / **−15%** | +10% / +10% |
| Overbuilding | **−16% / −16%** (hit 38%) | +66% / +84% (n=10) |
| Supply cut | **+13% / +30%** (hit 67%) | +25% / +72% (n=9) |
| Priced in: beyond the evidence | +1% / **−22%** | +64% / +138% |

---

# 13. REPLICATION CHECKLIST

1. Rebuild captures: `python tools/capture/build_demand_capture.py <capture-dir>` and `… --history`.
2. Run `cd web && npx vitest run tests/demand.test.ts tests/demand-pilot.test.ts` — 33 unit checks + 5 pilot checks.
3. Regenerate outputs: `DEMAND_PILOT=1 DEMAND_TRANSCRIPTS=<folder of SYMBOL-YEAR-Qn.txt> npx vitest run tests/demand-pilot.test.ts`
   → `public/data/demand-backtest.json`, `public/data/demand-language.json`.
4. Open `/alpha/demand`. The bundled reading shows "captured 2026-10-08"; with live data connected, "Re-read with
   live filings" re-runs on 12 fresh quarters per company.
5. Anchor values at `asOf = 2026-10-08` (v1.1.0): AI compute demand 90.3, acceleration 94.2, supply 41.4;
   MU shortage 87.3, glut 1.0, priced in (22.5%/yr implied), base 87.3 → score 52.4, high confidence;
   ENPH phase Downturn, glut 66.7, score 14.7.

---

# 14. NOT BUILT ⛔

- **A full-universe scanner.** `scanCohorts` works on any cohorts, but running it on every industry needs
  thousands of statements per run and a server-side cache (the app has none — `HANDOVER.md` §8).
- **Estimate revisions, orders, book-to-bill as series.** The data plan has no time series of consensus estimates
  and no structured backlog; the brief's "forward-looking company signals" rely on them.
- **Source adapters, patents, hiring.** The register is hand-entered; patents and job postings are not read.
- **Alerts.** No stored history between sessions, so no "inflection detected" alerts (same constraint as the
  Alpha Signal's rating changes).
- **A language model.** The transcript reader is rule-based; the thesis is assembled. The brief's
  AI-generation rules (§39) are enforced by having no model.
- **Non-US suppliers** (SK hynix, Samsung, Kioxia, Fanuc, Yaskawa, ABB, BHP, Rio Tinto, Glencore).

---

# APPENDIX A — THE ORIGINAL BRIEF (verbatim, as given on 2026-10-08)

````markdown
# Maz Vantage — Demand Discovery Engine
## Detect structural demand growth early, map the supply chain, and identify investable companies

**Version:** 1.0  
**Date:** 2026-10-08  
**Purpose:** Implementation specification for Claude Code

---

# 1. Objective

Build a **Demand Discovery Engine** inside Maz Vantage that attempts to detect industries, technologies, commodities, and supply-chain bottlenecks where future demand is accelerating **before the investment opportunity becomes obvious to the broad market**.

The engine should answer:

> **What is likely to experience strong future demand, why is demand increasing, what parts/materials/services are required, where are the bottlenecks, and which publicly traded companies are financially attractive and exposed to the opportunity?**

This is not intended to predict stock prices.

It is intended to identify **structural demand inflections** and then combine those signals with Maz Vantage's existing company/quant analysis.

---

# 2. Core investment concept

The engine should follow the economic chain:

```text
MACRO / STRUCTURAL DRIVER
        ↓
EMERGING TECHNOLOGY / MARKET
        ↓
DEMAND GROWTH
        ↓
REQUIRED PRODUCTS / COMPONENTS
        ↓
MATERIALS / RAW MATERIALS
        ↓
SUPPLY CONSTRAINTS / BOTTLENECKS
        ↓
PUBLIC COMPANIES EXPOSED
        ↓
FINANCIAL QUALITY
        ↓
VALUATION
        ↓
MARKET EXPECTATIONS
        ↓
DEMAND DISCOVERY INVESTMENT IDEA
```

Example:

```text
AI
↓
AI inference + training
↓
Data center construction
↓
GPU demand
↓
HBM demand
↓
DRAM demand
↓
Advanced semiconductor manufacturing
↓
Semiconductor equipment
↓
Specialty chemicals / gases / materials
↓
Power / cooling / networking
```

Another:

```text
Robotics
↓
More robots deployed
↓
More motors / actuators / sensors
↓
Permanent magnets
↓
Rare earth materials
↓
Mining + separation + magnet manufacturing
↓
Public companies exposed to the bottleneck
```

Another:

```text
Electrification
↓
Grid expansion + EVs + renewable generation + data centers
↓
Copper demand
↓
Mine supply constraints
↓
Copper price / margins
↓
Copper miners + equipment suppliers
```

---

# 3. Why this is different from a normal stock screener

Do NOT build this as:

> "Find robotics stocks."

Instead:

> "Detect whether robotics demand is accelerating, determine which parts of the robotics value chain will experience the strongest incremental demand, then find the companies with the best combination of exposure, financial quality and valuation."

A theme can grow while a stock performs badly.

Therefore:

```text
Theme Growth ≠ Stock Opportunity
```

The engine must separately evaluate:

1. Future demand
2. Supply constraints
3. Company exposure
4. Earnings impact
5. Competitive position
6. Financial health
7. Valuation
8. Existing market expectations

---

# 4. Source hierarchy

Use sources in the following hierarchy.

## Tier A — Primary / institutional sources

Highest priority.

### Critical minerals / commodities

- IEA
- USGS
- U.S. Department of Energy
- European Commission
- EIA
- national geological surveys
- OECD
- World Bank

### Semiconductors

- WSTS
- SEMI
- company filings
- company earnings calls
- government semiconductor programs

### Robotics

- International Federation of Robotics (IFR)
- government industrial statistics
- company filings
- company earnings calls

### Technology

- Gartner
- IDC
- Omdia
- Counterpoint
- Canalys
- official government agencies
- company filings

### Corporate primary sources

- SEC filings / EDGAR
- annual reports
- quarterly reports
- investor presentations
- earnings-call transcripts
- company press releases

---

# 5. Important source examples

## IEA Critical Minerals Data Explorer

Official source:

https://www.iea.org/data-and-statistics/data-tools/critical-minerals-data-explorer

The IEA's Critical Minerals Data Explorer provides global demand projections for 37 critical minerals across multiple scenarios and technology cases.

Useful for:

- copper
- lithium
- nickel
- cobalt
- graphite
- aluminium
- rare earth elements
- clean-energy-related mineral demand

The data explorer should be treated as a high-value source for long-term commodity demand signals.

---

## IEA Global Critical Minerals Outlook

https://www.iea.org/reports/global-critical-minerals-outlook-2025

Use for:

- supply/demand outlook
- bottlenecks
- concentration risk
- supply-chain risks
- projected demand
- technology-specific demand

---

## U.S. Geological Survey

https://www.usgs.gov/centers/national-minerals-information-center

Use USGS Mineral Commodity Summaries and related publications for:

- production
- reserves
- imports/exports
- consumption
- supply concentration
- mineral-specific structural trends

---

## WSTS

https://www.wsts.org/

Example:

https://www.wsts.org/76/103/WSTS-Semiconductor-Market-Forecast-Spring-2025

WSTS provides semiconductor market forecasts.

Useful dimensions:

- total semiconductor market
- logic
- memory
- analog
- sensors
- discrete
- regional demand
- annual growth

The engine should preserve the distinction between:

```text
Total semiconductor growth
```

and:

```text
Memory growth
Logic growth
AI-related growth
```

because individual companies have different exposures.

---

## International Federation of Robotics

https://ifr.org/

Example:

https://ifr.org/ifr-press-releases/news/presidents-report-by-jane-heffner-3-2026

IFR is a primary source for robotics adoption.

As of 2025, IFR reported:

- 603,000 industrial robots installed
- +11% YoY
- more than 5 million robots in operational stock
- electronics installations +10%
- automotive installations +10%
- metal and machinery +22%
- China +20%
- United States +12%

These statistics are examples of the type of demand evidence the engine should ingest.

Do not hard-code these numbers. Retrieve current data and store the source/date.

---

## Gartner

https://www.gartner.com/en/research/methodologies/market-forecast

Gartner forecasts cover hundreds of IT market segments and use market models based on supply/demand dynamics, primary and secondary research, analyst analysis and industry contacts.

Gartner data may be paid.

Do NOT scrape or reproduce copyrighted reports.

Use:

- public Gartner summaries
- permitted API/data access
- public press releases
- licensed datasets if available

The same rule applies to other paid market research providers.

---

# 6. Market research source universe

Build a source registry.

Suggested sources:

```text
IEA
USGS
WSTS
IFR
SEMI
EIA
DOE
European Commission
OECD
World Bank
Gartner
IDC
Omdia
Counterpoint
Canalys
BloombergNEF
S&P Global
Wood Mackenzie
Rystad Energy
McKinsey
BCG
Deloitte
PwC
company filings
earnings calls
investor presentations
government publications
patent databases
```

Not all sources need to be connected initially.

Build the architecture so sources can be added later.

---

# 7. The most important concept: signal aggregation

Do NOT rely on a single market forecast.

A statement such as:

> "Robotics market expected to grow 20%"

is insufficient.

Instead, aggregate independent signals.

Example:

```text
Robotics installations             +11%
Industry CAPEX                     +24%
Robotics-related hiring            +37%
Company demand mentions            +42%
Patent activity                     +29%
Market forecast CAGR                +18%
Supply constraint                   HIGH
```

This creates a much stronger signal.

---

# 8. Demand Signal Score

Create a score from 0–100.

Suggested initial weighting:

```text
Demand growth evidence              25%
Forward-looking company signals     20%
Industry CAPEX / capacity           15%
External market forecasts           15%
Supply constraint                   10%
Technology adoption                 5%
Government / policy support         5%
Attention / market awareness        5%
```

Important:

These weights are a starting point.

Make them configurable.

---

# 9. Demand Growth Evidence

Measure:

### Historical

- revenue growth
- shipment growth
- unit growth
- installations
- consumption
- production
- bookings
- orders
- backlog

### Forward-looking

- forecast CAGR
- future market size
- expected shipments
- expected installations
- capacity plans
- company guidance

Calculate:

```text
Demand Growth Score
```

Example:

```text
Historical demand CAGR:       +8%
Latest YoY demand growth:     +18%
Forecast CAGR:                +15%
Acceleration:                 +10 percentage points
```

Acceleration should matter more than simply having a high CAGR.

---

# 10. Demand acceleration

A crucial feature.

The engine should distinguish:

```text
Stable growth
```

from:

```text
Accelerating growth
```

Example:

```text
2023: +5%
2024: +7%
2025: +13%
2026: +21%
```

This is more interesting than:

```text
2023: +15%
2024: +15%
2025: +15%
2026: +15%
```

Create:

```text
Demand Acceleration Score
```

Possible calculation:

```text
Acceleration =
Latest Growth Rate - Multi-Year Average Growth Rate
```

Normalize it to 0–100.

---

# 11. Company evidence

Search company filings and transcripts for demand-related language.

Important keywords:

```text
demand
strong demand
accelerating demand
orders
bookings
backlog
capacity
capacity expansion
sold out
lead times
shortage
supply constrained
customer demand
customer orders
order growth
book-to-bill
utilization
inventory
inventory build
production
shipments
volume
pricing
market growth
secular growth
```

Use NLP to classify context.

Do NOT count every occurrence.

For example:

> "Demand remains weak"

must produce a negative signal.

Whereas:

> "Demand remains exceptionally strong"

must produce a positive signal.

---

# 12. Earnings-call demand sentiment

Create a company-level score:

```text
Demand Commentary Score = -100 to +100
```

Possible categories:

```text
Strongly negative
Negative
Neutral
Positive
Strongly positive
```

Also detect:

```text
Acceleration
Deceleration
Capacity constraint
Supply shortage
Pricing power
Backlog increase
Order cancellation
Customer inventory correction
```

Store the actual sentence/snippet and source.

Every AI-generated claim must have source attribution.

---

# 13. CAPEX signal

CAPEX can reveal what companies are preparing for before revenue arrives.

Track:

```text
CAPEX
CAPEX growth
CAPEX / revenue
PP&E growth
Factory construction
Capacity additions
New facilities
Equipment purchases
```

Example:

```text
CAPEX:
2023 $5B
2024 $8B
2025 $13B
2026 $20B
```

This can indicate that an industry is preparing for future demand.

Aggregate CAPEX growth across companies in the same industry.

Create:

```text
Industry CAPEX Acceleration Score
```

---

# 14. Capacity expansion

Look for:

```text
new factory
new fab
new mine
new plant
production expansion
capacity expansion
manufacturing expansion
new facility
additional production line
```

This is particularly useful for:

- semiconductors
- batteries
- chemicals
- robotics
- industrial equipment
- commodities

---

# 15. Supply constraint score

Demand growth alone is not enough.

The engine should determine whether supply can satisfy demand.

Create:

```text
Supply Constraint Score: 0–100
```

Potential evidence:

- projected supply deficit
- low inventories
- long lead times
- limited production capacity
- geographic concentration
- permitting difficulty
- long mine development timelines
- specialized manufacturing
- high barriers to entry
- company commentary about shortages
- price increases
- capacity utilization

A theme with:

```text
Demand growth: 90/100
Supply constraint: 90/100
```

is more interesting than:

```text
Demand growth: 90/100
Supply constraint: 10/100
```

---

# 16. Supply-chain mapping

This is a core feature.

For each emerging market, build:

```text
End market
↓
Product
↓
Component
↓
Subcomponent
↓
Material
↓
Raw material
```

Example:

## Robotics

```text
Robotics
├── Motors
├── Actuators
├── Gearboxes
├── Bearings
├── Sensors
├── Cameras
├── Semiconductors
├── Power electronics
├── Batteries
└── Permanent magnets
        ↓
    Rare earths
        ↓
    Mining / separation
```

Example:

## AI data centers

```text
AI
├── GPUs
├── HBM
├── DRAM
├── Networking
├── Optical components
├── Power semiconductors
├── Cooling
├── Transformers
├── Switchgear
└── Copper
```

The system should eventually allow a user to click a node and see:

- demand growth
- forecast
- bottleneck level
- public companies
- company exposure
- valuation
- financial quality

---

# 17. Company exposure

Do not assume that a company belongs to an industry just because its FMP industry says so.

FMP's industry taxonomy may not contain themes such as:

```text
Robotics
Humanoid robotics
AI infrastructure
HBM
Rare-earth magnets
Grid modernization
```

Therefore create a separate:

```text
Maz Theme Classification
```

A company can belong to multiple themes.

Example:

```text
Company: Micron

Themes:
- Semiconductors
- Memory
- HBM
- AI infrastructure
- Data centers
```

Each theme should have an exposure score.

---

# 18. Exposure Score

Score each company:

```text
0 = no exposure
25 = indirect exposure
50 = meaningful exposure
75 = high exposure
100 = core business exposure
```

Better:

Estimate revenue exposure if reliable.

Example:

```text
AI revenue exposure: 35%
AI-related growth exposure: high
```

Never invent revenue percentages.

If exposure is inferred, label it:

```text
Estimated / inferred
```

and explain the evidence.

---

# 19. FMP integration

Use FMP for the financial-company layer.

The Demand Discovery Engine should NOT replace the existing FMP infrastructure.

Use FMP for:

- company profiles
- sector
- industry
- market capitalization
- revenue
- earnings
- EPS
- EBITDA
- EBIT
- FCF
- margins
- ROE
- debt
- cash
- balance sheet
- valuation
- analyst estimates
- historical financial statements
- stock price
- company news
- SEC-related data available through FMP
- ratios
- growth metrics

The external-source layer provides:

```text
Theme demand
Market forecasts
Industry adoption
Supply constraints
Government spending
Technology trends
```

FMP provides:

```text
Which public companies can potentially monetize this?
```

---

# 20. Company financial filter

Once companies are discovered, run them through the existing Maz Vantage quantitative system.

At minimum:

```text
Growth
Profitability
Financial Health
Valuation
Momentum
Earnings
Cash Flow
```

Do not recommend a company solely because it is exposed to a growing market.

---

# 21. Final Opportunity Score

Create a separate score:

```text
Demand Opportunity Score: 0–100
```

Suggested formula:

```text
30% Demand Growth
15% Demand Acceleration
15% Supply Constraint
15% Company Exposure
10% Financial Quality
10% Valuation
5% Market Expectation Gap
```

Make weights configurable.

---

# 22. Market Expectation Gap

This is important.

A great industry does not necessarily mean a great stock.

The engine should ask:

> "How much of this future growth does the market already expect?"

Possible indicators:

- valuation
- forward P/E
- EV/EBITDA
- price/sales
- analyst growth expectations
- earnings revisions
- historical valuation
- implied growth expectations

Conceptually:

```text
Future demand growth
        ↓
Expected earnings growth
        ↓
Current valuation
        ↓
What is already priced in?
```

The ideal situation may be:

```text
Demand growth: HIGH
Supply constraint: HIGH
Company exposure: HIGH
Financial quality: HIGH
Valuation: reasonable
Market expectations: relatively low
```

---

# 23. Discovery Engine output

The engine should produce a theme page.

Example:

# Robotics

```text
Demand Score                 87/100
Acceleration Score           91/100
Supply Constraint             74/100
Investment Opportunity        84/100
Confidence                    88/100
```

## Why is demand growing?

- Factory automation
- labor shortages
- AI-enabled robotics
- reshoring
- productivity requirements
- declining cost of automation

## Evidence

Each statement should have:

```text
Source
Publication date
URL
Source type
Data point
```

---

# 24. Evidence cards

Create evidence cards like:

```text
+11%

Global industrial robot installations

Source:
International Federation of Robotics

Period:
2025

Source type:
Industry organization

Confidence:
High
```

Another:

```text
+20%

China robot installations

Source:
IFR

Period:
2025

Confidence:
High
```

Another:

```text
+15%

Expected robotics market CAGR

Source:
[licensed/public market research source]

Period:
2026–2030

Confidence:
Medium
```

---

# 25. Evidence quality

Every signal receives:

```text
Source Quality
Data Recency
Directness
Independence
Confidence
```

Example:

```text
IEA official dataset:
Source Quality = 100
```

```text
Company 10-K:
Source Quality = 95
```

```text
Industry association:
Source Quality = 90
```

```text
Major research firm:
Source Quality = 85
```

```text
Financial media:
Source Quality = 65
```

```text
Blog:
Source Quality = 30
```

These are starting values and should be configurable.

---

# 26. Source independence

Avoid double-counting.

For example:

```text
Reuters says:
"IEA expects copper demand to increase."

IEA says:
"Copper demand expected to increase."
```

These are NOT two independent signals.

They are one underlying signal.

The system should link secondary articles back to the original source where possible.

---

# 27. Data model

Suggested entities.

## Theme

```json
{
  "id": "robotics",
  "name": "Robotics",
  "category": "technology",
  "description": "...",
  "demand_score": 87,
  "acceleration_score": 91,
  "supply_constraint_score": 74,
  "opportunity_score": 84,
  "confidence_score": 88,
  "updated_at": "..."
}
```

## Demand Signal

```json
{
  "theme_id": "robotics",
  "signal_type": "installations_growth",
  "metric": "industrial_robot_installations",
  "value": 603000,
  "growth_rate": 0.11,
  "period": "2025",
  "source_name": "International Federation of Robotics",
  "source_url": "...",
  "source_date": "...",
  "source_quality": 95,
  "confidence": 95
}
```

## Company Theme Exposure

```json
{
  "ticker": "MU",
  "theme_id": "ai_semiconductors",
  "exposure_score": 90,
  "exposure_type": "direct",
  "evidence": "...",
  "source_url": "..."
}
```

## Supply Chain Node

```json
{
  "theme_id": "robotics",
  "parent": "robotics",
  "node": "permanent_magnets",
  "level": 2,
  "importance": 85,
  "supply_constraint_score": 78
}
```

---

# 28. Source ingestion architecture

Build a source adapter system.

```text
Source Registry
      ↓
Source Adapter
      ↓
Raw Document / API Data
      ↓
Extraction
      ↓
Structured Signal
      ↓
Validation
      ↓
Deduplication
      ↓
Scoring
      ↓
Theme
      ↓
Supply Chain
      ↓
Companies
      ↓
Quant Score
      ↓
Discovery Opportunity
```

Each source should have:

```text
source_id
name
type
url
access_method
license
last_updated
reliability_score
```

---

# 29. Do not scrape blindly

Important implementation rule:

Do not scrape copyrighted paid reports.

Prefer:

1. Official APIs
2. Public datasets
3. Public reports
4. Official press releases
5. Public abstracts
6. Licensed data
7. FMP data
8. SEC public filings

Store source attribution.

The AI should summarize information rather than reproduce long copyrighted passages.

---

# 30. Initial pilot

Do not attempt to build the entire world immediately.

Build the first version around these themes:

### Theme 1 — AI / Semiconductor Demand

Track:

- AI compute
- GPUs
- HBM
- DRAM
- NAND
- advanced semiconductor manufacturing
- semiconductor equipment
- networking
- data centers

Candidate companies for testing:

```text
NVDA
AMD
MU
SNDK
TSM
ASML
AMAT
LRCX
KLAC
AVGO
```

These are test candidates, NOT recommendations.

---

### Theme 2 — Robotics

Track:

- industrial robots
- humanoids
- cobots
- warehouse automation
- motors
- actuators
- gearboxes
- bearings
- sensors
- machine vision
- power electronics
- permanent magnets
- rare earths

Potential test universe:

```text
TER
ROK
ABB
FANUY
YASKY
HON
MP
```

Ticker availability and exchange coverage must be verified through FMP before using any company.

These are test candidates, NOT recommendations.

---

### Theme 3 — Copper / Electrification

Track:

- copper demand
- grid investment
- EV demand
- data center power demand
- renewable infrastructure
- mine supply
- new mine projects
- inventories
- copper prices

Potential test universe:

```text
FCX
SCCO
RIO
BHP
TECK
GLNCY
```

Again, verify ticker availability through FMP.

---

# 31. Initial implementation priority

Build in this order.

## Phase 1

Create:

```text
Theme database
Source database
Demand signal database
Company-theme mapping
```

## Phase 2

Implement:

```text
IEA
USGS
WSTS
IFR
SEC/company filings
FMP
```

Do not attempt 20 sources immediately.

## Phase 3

Build:

```text
Demand growth calculation
Demand acceleration
Supply constraint
Source confidence
```

## Phase 4

Build:

```text
Supply-chain graph
```

## Phase 5

Map:

```text
Theme → components → materials → public companies
```

## Phase 6

Run the companies through:

```text
Maz Vantage Quant Score
```

## Phase 7

Build the UI.

---

# 32. UI concept

Theme page:

```text
--------------------------------------------------
ROBOTICS
Structural Demand Discovery
--------------------------------------------------

Demand                     87
Acceleration               91
Supply Constraint          74
Investment Opportunity     84
Confidence                 88

[Demand Growth Chart]

WHY NOW?

• Robot installations accelerating
• Electronics automation rising
• Labor shortages
• AI improving robot capability
• Manufacturing investment increasing

--------------------------------------------------
SUPPLY CHAIN
--------------------------------------------------

Robotics
   ├── Motors       82
   ├── Actuators    89
   ├── Sensors      71
   ├── Chips        85
   ├── Magnets      92
   └── Bearings     78

--------------------------------------------------
TOP PUBLIC COMPANIES
--------------------------------------------------

Company     Exposure    Quality    Valuation    Score
--------------------------------------------------
Company A      95          A+          B+         91
Company B      82          A           A          89
Company C      91          B+          A-         87
```

---

# 33. Discovery alerts

Eventually create alerts.

Examples:

```text
Demand acceleration detected
```

```text
Supply shortage detected
```

```text
Industry CAPEX acceleration detected
```

```text
New major government investment detected
```

```text
Multiple companies report accelerating demand
```

```text
New market forecast materially revised upward
```

```text
Supply-chain bottleneck emerging
```

---

# 34. The ideal alert

Example:

> ## New Demand Inflection Detected
>
> **Theme:** Robotics
>
> Demand signal increased from **68 → 82**
>
> Main drivers:
>
> - Global robot installations +11%
> - China installations +20%
> - Electronics installations +10%
> - Metal/machinery +22%
> - Operational robot stock >5 million
>
> **Potential bottlenecks**
>
> Permanent magnets
> Actuators
> Precision components
>
> **Companies with highest exposure**
>
> [Company list]
>
> **Maz Vantage Quant filter**
>
> [Filtered companies]
>
> **Confidence:** High
>
> [View evidence]

---

# 35. Historical backtesting

This is essential.

The engine should eventually test:

> "Would this signal have identified important demand trends before the associated stocks moved?"

Examples:

### AI / semiconductor cycle

Try to reconstruct signals before:

- NVIDIA's explosive AI acceleration
- memory recovery
- HBM demand

### Copper

Test whether:

- electrification forecasts
- supply constraints
- grid investment

provided useful signals before copper-related equities moved.

### Robotics

Test:

- robot installations
- automation CAPEX
- labor shortages
- robotics investment

against robotics-related stocks.

Do NOT optimize the system to one historical winner.

Use multiple themes and periods.

---

# 36. Avoid look-ahead bias

When backtesting:

Only use information that was publicly available at the historical date.

Example:

If testing a signal as of:

```text
2023-01-01
```

you cannot use a 2025 report describing what happened in 2023.

Store:

```text
publication_date
data_period
source_date
```

and filter accordingly.

This is extremely important.

---

# 37. Do not confuse forecast with fact

Every data point should have a type:

```text
ACTUAL
ESTIMATE
FORECAST
INFERRED
AI_DERIVED
```

Example:

```text
2025 robot installations = ACTUAL

2028 robot installations = FORECAST

Company robotics exposure = INFERRED

AI-generated theme explanation = AI_DERIVED
```

The UI should make this distinction visible.

---

# 38. Confidence system

Every conclusion should have:

```text
Confidence = f(
    source quality,
    number of independent sources,
    data recency,
    agreement between sources,
    directness,
    historical reliability
)
```

Example:

```text
High confidence
```

requires multiple high-quality independent sources.

A single analyst forecast should never create a High-confidence theme.

---

# 39. AI generation rules

The AI should NOT invent facts.

Every factual claim must be traceable to a structured signal.

The AI may:

- synthesize
- compare
- explain
- identify relationships
- generate hypotheses

The AI must NOT:

- invent market size
- invent CAGR
- invent company exposure
- invent supplier relationships
- invent demand
- present assumptions as facts

For inferred relationships use language such as:

> "This suggests..."

> "Potentially benefits from..."

> "Indirect exposure..."

> "Based on the company's stated products..."

---

# 40. Source citation requirements

Every external factual statement should store:

```text
source_name
source_url
publication_date
access_date
source_type
source_quality
```

Frontend should display:

> Source: IEA — Critical Minerals Data Explorer

and allow the user to open the original source.

---

# 41. Search/query strategy

For each theme, generate queries dynamically.

Example robotics:

```text
robotics demand forecast
industrial robot installations
humanoid robot demand
robotics CAPEX
robotics capacity expansion
robotics orders
robotics backlog
robotics components demand
actuator demand robotics
permanent magnet robotics
rare earth robotics
robotics labor shortage
robotics manufacturing investment
```

Copper:

```text
copper demand forecast
copper supply deficit
copper mine supply
copper inventories
grid copper demand
data center copper demand
EV copper demand
copper CAPEX
copper mine expansion
copper project pipeline
```

Semiconductors:

```text
AI semiconductor demand
HBM demand forecast
DRAM demand forecast
NAND demand forecast
semiconductor CAPEX
foundry capacity
advanced node demand
semiconductor equipment demand
AI server demand
data center semiconductor demand
```

---

# 42. Search scoring

When collecting external sources, rank results by:

```text
Official primary source
↓
Industry organization
↓
Government / international organization
↓
Major research firm
↓
Company filing
↓
Major financial publication
↓
Other publication
```

Prefer the original source over articles quoting the original.

---

# 43. Discovery Engine philosophy

The goal is NOT:

> "Predict the next NVIDIA."

The goal is:

> **Find measurable evidence that an economic transition is occurring, identify where the incremental economic value is likely to accumulate, and determine which public companies are positioned to capture it.**

This is a research tool.

Not a prediction engine.

---

# 44. Future advanced features

After the MVP works, add:

## A. Theme emergence detector

Automatically detect new themes from thousands of signals.

Example:

```text
AI
Robotics
Grid modernization
Nuclear
Space infrastructure
Defense autonomy
Industrial automation
Data-center power
Rare-earth magnets
```

---

## B. Supply-chain graph

Automatically construct:

```text
Theme → Product → Component → Material → Company
```

---

## C. Demand anomaly detection

Detect:

```text
Growth significantly above historical trend
```

---

## D. Consensus gap

Compare:

```text
External demand forecast
vs
company guidance
vs
analyst estimates
vs
market valuation
```

---

## E. Early signal ranking

Rank themes by:

```text
Signal strength
Signal acceleration
Supply constraint
Company exposure
Valuation gap
```

---

# 45. Recommended first deliverable from Claude Code

Do NOT build the full UI first.

First produce a working backend/research pipeline that outputs JSON for:

```text
Robotics
AI Semiconductors
Copper / Electrification
```

For each theme return:

```json
{
  "theme": "...",
  "demand_score": 0,
  "acceleration_score": 0,
  "supply_constraint_score": 0,
  "confidence_score": 0,
  "signals": [],
  "supply_chain": [],
  "companies": [],
  "sources": []
}
```

Then inspect the quality manually.

Only after the data and reasoning are trustworthy should the UI be built.

---

# 46. Success criteria

The MVP is successful if Claude Code can take:

```text
Theme = Robotics
```

and automatically produce:

1. Current demand evidence
2. Historical demand trend
3. Forward demand forecast
4. Demand acceleration
5. Supply constraints
6. Important components
7. Important materials
8. Public companies exposed
9. FMP financial metrics
10. Maz Vantage quant score
11. Valuation
12. Confidence
13. Source attribution
14. A concise AI-generated investment thesis
15. A concise bear case
16. Clear separation between facts, forecasts and inference

The same architecture must then work for:

```text
Copper
Semiconductors
AI infrastructure
Batteries
Robotics
Grid infrastructure
```

without hard-coded theme-specific logic.

---

# 47. First implementation instruction to Claude Code

Start with the existing Maz Vantage codebase.

Do not rebuild the existing stock-analysis system.

First inspect:

- current FMP integration
- current stock/company database
- current quant scoring
- current news system
- current article generation
- current database/schema
- current frontend architecture
- existing API routes
- existing environment variables

Then implement the Demand Discovery Engine as a modular feature.

Create clear modules for:

```text
/sources
/signals
/themes
/supply-chain
/company-exposure
/scoring
/discovery
```

Keep external source ingestion separate from FMP.

The first working prototype should analyze:

```text
ROBOTICS
AI / SEMICONDUCTORS
COPPER / ELECTRIFICATION
```

and produce structured JSON before building the final UI.

---

# 48. Important investment disclaimer

The Discovery Engine should present its output as:

```text
research / analytical signal
```

not:

```text
guaranteed investment opportunity
```

A high Demand Opportunity Score does not mean a stock will outperform.

The system must explicitly communicate uncertainty.

---

# 49. Primary source URLs

## IEA

https://www.iea.org/data-and-statistics/data-tools/critical-minerals-data-explorer

https://www.iea.org/reports/global-critical-minerals-outlook-2025

## USGS

https://www.usgs.gov/centers/national-minerals-information-center

## WSTS

https://www.wsts.org/

https://www.wsts.org/76/103/WSTS-Semiconductor-Market-Forecast-Spring-2025

## IFR

https://ifr.org/

https://ifr.org/ifr-press-releases/news/presidents-report-by-jane-heffner-3-2026

## Gartner

https://www.gartner.com/en/research/methodologies/market-forecast

## SEC / EDGAR

https://www.sec.gov/edgar

---

# END

````
