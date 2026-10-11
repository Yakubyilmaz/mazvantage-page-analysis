# Demand Discovery — Pilot Report: Is It Viable?

**Date:** 2026-10-08 · **Engine:** v1.1.0 (`web/src/lib/demand-*.ts`) · **Spec:** [`MAZ_DEMAND_DISCOVERY_SPEC.md`](MAZ_DEMAND_DISCOVERY_SPEC.md)
**Page:** `/alpha/demand` (Alpha Signal → Demand Discovery)

> Research, not investment advice. Every number below is computed from filed quarterly figures, dated
> published evidence, or the stock price, and the backtest shows where the engine was wrong as well as right.

---

## 1. The verdict, first

**As a research and monitoring tool: yes, viable.** On real data the engine places each link of a supply chain in its
cycle correctly, says how much growth each price already assumes, and lays out its evidence with dates and sources.
Two parts of it held up on 1999–2017 data that was never used to write the rules:

| What held up | 1999–2017 (out of sample) | 2019–2026 (in sample) |
|---|---|---|
| **Supply cut** — a capital-intensive company cutting capex ≥20% while revenue is not growing | median 12-month excess return **+13%** (hit rate 67%, n=55) vs **+4%** for the rest; 24-month **+30%** vs **+5%** | +25% (n=9); 24-month +72% |
| **Overbuilding warning** — capex growing much faster than revenue at a capital-intensive company | **−16%** 12-month, **−16%** 24-month, hit rate 38% (n=39) | +66% (n=10, all in the 2025 memory boom) — not yet resolved |
| **Priced-in gate** — "beyond the evidence" (price implies >25%/yr for ten years) | 24-month **−22%** vs **+16%** for "not priced in" | +138% (NVDA, VRT, MU in 2023–25) — failed in the AI boom |

**As a "predict what will blow up" signal from demand alone: no.** The headline idea — detect demand
outrunning supply in the filings and buy it — did **not** predict returns:

| Shortage signature → next-12-month excess return | 1999–2017 | 2019–2026 |
|---|---|---|
| Rank correlation | **−0.10** | −0.03 |
| Median excess when the signature is high (≥60) | +4% (24-month **−1%**) | +16% |
| Median excess when it is low (<40) | +11% (24-month **+20%**) | +20% |
| Phase **Tight**, 24 months later | **−15%** | +10% |

Why: filings arrive four to ten weeks after a quarter ends, and the market moves on guidance and orders before
that. By the time a company's own numbers scream "shortage", the price usually has too — and for cyclical
businesses the strongest-looking quarter is often near the peak. The stocks that "blew up" were mostly bought at
the **bottom** of their own filings: Micron and NVIDIA in 2022–23, when the glut tests were firing.

So the useful question is not "where is demand strongest?" but **"where has supply already been cut, where is
it being overbuilt, and how much is already in the price?"** — and, across a chain, **"which layer has not caught
up with the layer above it yet?"** Those are what the engine now leads with.

---

## 2. What was built and what it read

- **Engine:** 11 TypeScript modules (`demand-*.ts`), pure and point-in-time; 33 unit checks and 5 pilot checks
  (`web/tests/demand.test.ts`, `web/tests/demand-pilot.test.ts`); the full suite is 368 checks, all passing.
- **Companies (bundled capture, 2026-10-08):** 16 — MSFT, GOOGL, AMZN, META (capex), NVDA, AVGO, MU, SNDK, TER,
  VRT, ETN, FCX, SCCO, ROK, ALB, ENPH; quarterly statements from 2017, weekly closes from 2018.
- **Out-of-sample history:** 8 companies (MU, NVDA, FCX, ALB, TER, ROK, SCCO, ETN), quarters 1996–2018, weekly
  closes 1998–2018. Never looked at while setting any band or weight.
- **Evidence register:** 27 figures from 12 primary sources — IEA (Critical Minerals Outlooks 2025 and 2026,
  Energy and AI, Market Review 2023, Policy Tracker), USGS (Mineral Commodity Summaries 2026, copper), WSTS
  (Spring 2026 and Fall 2023 forecasts), IFR (World Robotics 2026), Micron's own calls. Each read from the
  original page, dated and typed (ACTUAL / ESTIMATE / FORECAST).
- **Management language:** six earnings calls through a rule-based reader — Micron (Sept 2026), Vertiv
  (July 2026), Freeport (July 2026), Albemarle (Feb 2023 and Aug 2026), Enphase (Feb 2023).
- **Chains (hand-written):** AI compute (cloud capex → accelerators → memory, chip test, power & cooling),
  copper & electrification, robotics, and two controls where demand grew and the stocks fell — lithium and
  residential solar.

---

## 3. The four deep dives

Numbers are the engine's reading as of 2026-10-08 unless dated. "Excess" = the stock's return minus the S&P 500
ETF's over the same dates, bought at the first weekly close after the filing.

### 3.1 Micron (MU) — memory: the user's example, and the engine's best and worst moments

**Now.** Phase **Tight**. Revenue grew 362% a year over the two newest quarters (fiscal Q4 2026: $54.2bn), against
84% over the four before — acceleration +279 points. Gross margin 85.8% against 41.5% a year earlier. Customer
prepayments (contract liabilities) **$13.7bn against $1.0bn** a year earlier. Capex up 132%, at 27.6% of
revenue — but revenue grew faster (+256%), so no overbuilding flag. Shortage signature **87**, glut risk **1**.

| | |
|---|---|
| Evidence | WSTS (June 2026): memory sales +250% in 2026 to $804bn, +32% in 2027 (FORECAST). Micron (Sept 2026): >75% of fiscal 2027 shipments committed; long-term agreements cover ~35% of bits through 2030; new clean rooms come online late 2028. |
| Management language | Strongly positive (+72): 19 demand sentences for, 1 against; flags for capacity constraint ×5 and pricing power ×6. |
| Priced in? | **Priced in.** At an enterprise value of $1.21tn the price asks for ~22.5% revenue growth a year for ten years — 6.7% at today's 39.7% cash margin, but 38.2% at the 4.0% through-cycle median. Which margin is right *is* the question. |
| Score | base 87 → **52** after the gate; confidence high. |

**What it said in the past** (point-in-time, from the backtest):

| Filed | Phase | Next 12m excess | Next 24m excess |
|---|---|---|---|
| Dec 2022 – Jun 2023 | **Downturn** (glut 68–90) | **+46% to +83%** | −16% to +53% |
| Oct 2023 – Mar 2024 | **Supply cut** (capex cut, revenue not growing) | +25%, −23%, −26% | **+138%, +184%, +203%** |
| Dec 2024 | Tight | +199% | — |
| Mar – Dec 2025 | **Overbuilding** | +296%, +661% | — |
| 1999–2017 (out of sample) | Supply cut 2012–13 | **+121% to +192%** | +32% to +434% |
| 1999–2017 | Overbuilding 2007, 2011, 2014–15 | **−22% to −62%** | mostly negative |
| 1999–2017 | Supply cut 2002 | −39%, −23% | −48%, −42% |

**Read.** The best entry in this cycle was when the glut tests were firing and capex was being cut (2023), not when
the shortage signature lit up. The 2023 "not caught up with accelerators" flag looked wrong over 12 months and
very right over 24. The 2025 overbuilding warning — which out of sample preceded every Micron bust since 2007 —
was wrong this time, because demand outran even the capex surge. Today the engine reads Micron as tight and priced
in, with no overbuilding flag; the thing to watch is that flag, and the competitors it cannot see (SK hynix,
Samsung).

### 3.2 Vertiv (VRT) — data-centre power and cooling: second-order AI

**Now.** Phase **Tight**. Revenue growing a steady ~27% (acceleration −0.6 pts), gross margin +3.9 pts, customer
prepayments **$3.76bn against $1.36bn** (+175%). Inventory days rose from 74 to 113 — read as built against prepaid
orders (glut risk halved twice; it would otherwise have read as a glut). Capex +130% but only 3.7% of sales, so not
a capacity signal. Shortage **67**, glut **9**.

| | |
|---|---|
| Chain | **Upstream flag:** cloud capex is accelerating (+19 pts) while power & cooling is +6 pts — "not caught up yet", expected lag 2–6 quarters. |
| Evidence | IEA: data-centre electricity 415 TWh (2024) → ~945 TWh (2030), ~15%/yr. Exposure ~85% data centres (ESTIMATE, company fact sheet via a secondary summary). |
| Language | Positive (+47): "further acceleration in Q3 and Q4, on strong backlog". |
| Priced in? | **Priced in**: ~16.5%/yr implied (11.3% trailing margin, 21.7% through-cycle). |
| Score | 67 → **40**; confidence high. The stock closed $246 on 2026-10-07, 26% below the June quarter-end. |

**History.** In 2022 the glut tests fired (margins squeezed by supply-chain costs) — and the next 12 months returned
**+24% to +153%** excess: a false alarm, because the "glut" was costs, not demand. April 2023 read Tight with the
price "beyond the evidence" — then **+511%** excess in 12 months. The upstream flag was wrong in 2021 (VRT −44%,
−56% over 12 months; the capex cycle rolled over in 2022) and right from mid-2024 (+33% to +234%).

**Read.** Vertiv is where the chain idea works best and the single-company tests work worst: its own filings never
showed the inflection before the stock moved; the cloud-capex layer above it did, on and off.

### 3.3 Freeport-McMoRan (FCX) — copper: a supply story the miner's revenue does not tell

**Now.** Phase **No signal**. Revenue ~flat (+2.5%), gross margin unchanged, inventory days up 17%, capex −15%.
Shortage **30**, glut **9**. Its sister miner reads differently: **Southern Copper (SCCO)** is Tight — revenue +38%,
gross margin +11.7 pts, shortage **91** — and has the pilot's highest score (**77**, "partly priced in" at 12.6%/yr),
with one caution: its capex (+60%) is outrunning revenue (+33%), the overbuilding test at 68/100.

| | |
|---|---|
| Copper | $6.65/lb; **+30%** in a year, **+83%** in three (weekly closes in the capture). |
| Evidence | IEA: demand 26.7 → 31.3 Mt by 2030 (~2.7%/yr — modest); 2035 supply shortfall ~30% (2025), **revised to 25%** (2026). USGS: world mine output **flat at ~23 Mt** in 2024 and 2025; Indonesia 1,010 → 710 kt; COMEX averaged a record ~$4.80/lb in 2025, which USGS ties mainly to tariff uncertainty. IEA: mines take >16 years from discovery to production. |
| Language | Strongly positive (+55): "a very tight … market situation". |
| Priced in? | **Priced in** for FCX (~19.6%/yr at a ~7% cash margin); partly for SCCO. |

**History.** The engine called FCX's 2022–23 downturn correctly (excess −19%, −31%, −23%, −6% over 12 months
from most of those filings), then flagged **Inflection** in 2024 — wrong (−22%, −40%, −18%) — and showed nothing
in early 2025, before +35% to +70%.

**Read.** For a miner, its own revenue mixes price, volumes and mine accidents; the variable that matters — copper
supply against demand — sits in the commodity price and the USGS/IEA figures, which the engine shows but does not
score. This is the clearest case for adding commodity series (and exchange inventories) as scored layer signals.

### 3.4 Albemarle (ALB) — lithium: the control case, where demand was right and the stock was not

**Now.** Phase **Tight**, after five filings (Feb 2025 – Feb 2026) in **Supply cut**: capex down 52% while the
industry cut investment (~40%, IEA 2026) and lithium prices more than doubled (IEA 2026). Revenue +32%, gross
margin +19.8 pts, inventory days −17%. Shortage **70**. The priced-in gate reads **Priced in** for an unusual
reason: at today's 22.7% cash margin the price implies *negative* growth (cheap), but through the cycle Albemarle
has not produced free cash (−3.5% median), so the gate refuses to call it cheap on a peak-ish margin.

**History — the test it was included for:**

| Filed | Phase | Next 12m excess | Next 24m excess |
|---|---|---|---|
| Aug 2022 – May 2023 (the peak) | **Tight** (shortage 69–80) | **−29% to −76%** | **−95% to −124%** |
| Aug – Nov 2023 | Cooling | −59%, −79% | −78%, −105% |
| Mar – Nov 2024 | Downturn — the glut warning, a year late | −65% to +2% | +6% to +15% |
| Feb – Aug 2025 | **Supply cut** | **+94%, +207%, +59%** | — |

**Read.** The engine **failed** the lithium peak: it said Tight all the way down. Albemarle's own filings showed no
overbuilding (its revenue grew faster than its capex until 2023), because the glut came from the whole industry —
the IEA counted lithium investment +50% and exploration +90% in 2022, a figure published in July 2023, after the
peak. Management language at the February 2023 call read **neutral (0)**, not euphoric: the reader picked up
customers "bringing their inventories down quite low" — a faint early tell, from one call. The recovery, though,
the engine caught: the supply cut fired before a +207% year.

### 3.5 The others, briefly

- **Enphase (solar control).** Downturn now (revenue −20%, inventory days 222 against 82). It read **Tight**
  in Feb–Jul 2023 before **−49% to −67%** — the same peak failure as lithium; its Downturn calls of July 2022 and July 2024
  preceded −59% and −88% (April 2022: −1%).
- **NVIDIA.** Tight, "priced in" at 15.7%/yr (stable 42% cash margin either way). Its 2022–23 **Downturn** filings
  preceded **+173% to +240%** excess — the glut tests fire at bottoms.
- **Sandisk.** Tight, "beyond the evidence" (28%/yr) — mostly because its through-cycle cash margin (2.5%)
  includes the carve-out years; history too short to backtest.
- **Teradyne.** Shows why exposure is measured: the stock rose on semiconductor test (79% of revenue, AI-driven);
  robotics was ~10% of revenue and **fell 15.5%** in 2025. In the robotics chain it is indirect and does not move
  the layer.

---

## 4. The chain through time

`analyseChain` was run at every quarter end from 2021 for the AI and copper chains (on the page: Backtest →
"The chain through time").

- **Memory and chip test lagged accelerators by ~4–6 quarters in the filings.** Accelerators inflected in the
  quarter to Sept 2023 (+17 pts); memory and test were flagged "not caught up" from Sept 2023 to June 2024. Twelve
  months later Micron was between +16% and −31% excess; 24 months later **+138% to +605%**.
- **Cloud capex as filed did not lead the chips.** The hyperscalers' capex re-accelerated in mid-2024, after
  NVIDIA's revenue did. The first visible inflection was in the supplier's own revenue and guidance, not the
  buyers' capex lines. The chain ordering is right for propagation *downstream* of the chips, not upstream.
- **Copper:** grid equipment → miners flagged March–Sept 2023; Southern Copper +18% to +39% excess over 12
  months, Freeport +4% to −6%.

Two lessons: propagation shows up on a **24-month** horizon, not 12; and it needs a stated exit — the 2021
power-and-cooling flags were wrong because the capex cycle turned.

---

## 5. What changed in the engine because of this test

**Before looking at any backtest result** (after the first current-date run):
- Capex is ignored as a capacity signal below 3% of revenue, and as a glut signal below 6% (Vertiv, Sandisk).
- Inventory building is discounted when margins widen and when prepayments grow faster than inventory.
- A business with no through-cycle free cash is never called cheap on its trailing margin (Albemarle).
- Layer cohorts are weighted by exposure; an indirect member weighs nothing (Teradyne in robotics).

**After the backtest** (v1.1): the **Supply cut** phase (the one rule conceived from the results, kept because it
held out of sample), the **Overbuilding** phase, "late cycle" renamed **Downturn**, and phase descriptions that say
what the backtest found. **Weights, bands and gate factors were not changed.**

---

## 6. How to make it more viable (in order)

1. **Run the scanner on every industry, point in time, with delisted companies.** Five hand-picked chains of
   famous themes cannot test *discovery* — the in-sample median excess of +14% across every filing says the
   companies were chosen knowing they worked. `scanCohorts` is ready; it needs a nightly server job and storage,
   which the app does not have yet (`HANDOVER.md` §8).
2. **Lead with cycle position on a 24-month horizon** for capital-intensive industries: supply cut, overbuilding,
   priced in. Those are the parts with out-of-sample support.
3. **Score commodity and price series as layer signals** — copper (in the capture), lithium carbonate and DRAM
   contract prices if a licensable source exists, exchange inventories. The miners' and lithium producers' own
   filings could not see their markets turning.
4. **Add estimate revisions and orders** — the data plan has no time series of consensus estimates or structured
   backlog; both lead filings.
5. **Widen the out-of-sample set**: more US cyclicals with 25 years of filings (STX, WDC, AMAT, LRCX, KLAC, CAT,
   DE, NUE, AA, CLF) before trusting any number above to a decimal.
6. **Keep management language as a cross-check.** Two peak calls (Albemarle, Enphase Feb 2023) read neutral or
   mildly positive with caution words; current calls in booms read +47 to +72. Two cases are an anecdote, not a
   signal.

---

## 7. Caveats

- Eight companies out of sample and sixteen in sample (twenty-nine from 2026-10-09, see §8); twelve-month windows overlap by nine months; no figure here
  is statistically significant, and the page and spec say so.
- The chains, exposures and lags are judgement (each membership states its basis). SK hynix, Samsung, Kioxia,
  Fanuc, Yaskawa, ABB and the diversified miners are not measured.
- The bundled reading is frozen at 2026-10-08. With live data connected the page re-reads 12 quarters per company,
  which thins the through-cycle margins.
- Evidence rows are hand-entered from public pages; Vertiv's ~85% data-centre share and the Teradyne robotics share
  came via summaries of company documents and are marked as such.

---

## 8. Addendum, 2026-10-09: more companies in the AI chain, and the bull and bear case per company

The user asked for more companies inside each layer of the AI compute chain, and for each company's detail to
carry a bull and bear case quoting management and the newest quarter.

**Thirteen companies added** (US filers only, so every layer's sum stays in US dollars), each with the segment
figure behind its membership in `lib/demand-chains.ts`:

| Layer | Before | Added |
| --- | --- | --- |
| Cloud capital spending | MSFT, GOOGL, AMZN, META | ORCL |
| Accelerators and networking | NVDA, AVGO | AMD (data centre 48%), MRVL (data center 74%), ANET |
| Memory and storage (renamed) | MU, SNDK | STX (hard drives; "meaningful") |
| Chip-making equipment and test (renamed) | TER | FORM (probe cards 81%), AMAT, LRCX, KLAC (all "meaningful") |
| Data-centre power and cooling | VRT, ETN | NVT, MOD, PWR, GEV (all "meaningful") |

Left out on purpose: Western Digital (its history holds the flash business spun off as Sandisk, so growth cannot be
read like for like); TSMC, ASML, Tokyo Electron, Advantest, SK hynix and Samsung (they report outside US dollars).
A new edge, memory → chip equipment (1–4 quarters), says memory makers buy tools once prices have risen.

**The chain as of the capture (2026-10-08):**

| Layer | Members measured | Growth, newest two quarters | Base | Acceleration | Breadth | Demand |
| --- | --- | --- | --- | --- | --- | --- |
| Cloud capital spending | 5 | 89% | 72% | +17 pts | 60% | 87 |
| Accelerators and networking | 5 | 84% | 54% | +31 pts | 78% | 93 |
| Memory and storage | 3 | 255% | 38% | +217 pts | 100% | 100 |
| Chip-making equipment and test | 5 | 23% | 12% | +11 pts | 64% | 73 |
| Data-centre power and cooling | 6 | 26% | 15% | +11 pts | 79% | 79 |

Memory's growth is mostly price, not bits (Micron's revenue is up 362%). Equipment and power are flagged as not yet
caught up with the layers above them. Every one of the nineteen companies is priced "aggressive", "demanding" or
"extreme": the price already asks for 15–32% revenue growth a year for ten years. Applied Materials is the one
"overbuilding" reading (capex outrunning revenue, glut warning elevated).

**What the bigger sample did to the backtest.** In sample (2019–2026) grew from 315 to 671 filings; out of sample
(1999–2017) is unchanged, because the history fixture still holds the original eight companies.

- The shortage signature still does not predict: rank correlation with 12-month excess return −0.017 (was −0.027).
- The in-sample median filing now beat the market by 20% over 12 months (was 14%), and every bucket is positive. A
  list of 2026's AI winners will do that whatever the signal says — the result describes the selection, not the
  engine. The page now says so in its backtest warning.
- Two striking in-sample cells shrank once they had more rows: "overbuilding" from +66% (10 filings) to +18% (17),
  and "extreme" priced-in from +64% (29) to +21% (53). Both were small-sample artefacts.
- Supply cut in a downturn: still the best-looking bucket in both periods (+24% in sample over 12 months on 10
  filings; +13% out of sample on 55).

**The bull and bear case.** Each company's detail now opens with "Bull case and bear case": for and against, each
in four groups — the newest quarter's filed figures (`lib/demand-case.ts`, with the thresholds printed on the
page), management's own sentences from the newest earnings call, the analysts' pushback with their firm, and the
engine's existing thesis and bear lines. The quotes come from `public/data/management-voice.json` (the newest call
for all 25 revenue-layer companies plus Apple's two, read with the business reader and stored as quotes of at most
25 words) or, with live data connected, from the call itself.

Two reader fixes came out of reading 26 real calls: an analyst firm that starts with initials ("B. Riley", "D.A.
Davidson") is kept whole, and a negator four words back now counts in the business reader ("no evidence of a
slowdown"). "Price increase", "cost down", "down payments", "pay more" and "risk" were taken out of the business
word lists because they cut both ways.
