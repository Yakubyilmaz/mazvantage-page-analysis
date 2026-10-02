# Maz Vantage — Alpha Signal, Full Specification

The Alpha Signal asks a different question from the quant rating. The quant rating (0–5) asks
*how good is this company against its sector, right now*. The Alpha Signal (0–100) asks *how
much has recently changed, and how little is anyone looking*. **Eleven categories, 33 signals on
the AAPL capture, one transparent weighted composite**, with coverage and confidence printed beside
every score. The two ratings use different scales on purpose so nobody averages them.

This file has three parts:
1. **The logic as built**, precise enough to rebuild the engine in any language.
2. **The model prompt**: how to put a language model on top without letting it invent facts. The
   shipped app does not call a model; its written summary is deterministic (§10).
3. **Appendix A**: the original master prompt the feature was built from, verbatim.

Source of truth: `web/src/lib/alpha-signals.ts` (vocabulary), `alpha-providers.ts` (the eleven
providers), `alpha-disclosures.ts` (hand-captured signals), `alpha-score.ts` (reduction,
archetypes), `alpha-narrative.ts` (written view), `components/pages/alpha-page.tsx` (market scan).
Regression suite: `web/tests/alpha.test.ts` (50 checks). Calculation version **1.0.0**.

## Build tags
- ✅ **FMP**: computed from a market-data feed.
- ✍️ **Captured**: read by hand from a primary source into `web/public/data/alpha-disclosures.json`.
  It replaces the matching gap only for symbols that have an entry (today: AAPL).
- ⛔ **Unavailable**: no provider is connected. The signal is still shown, as `insufficient_data`,
  naming the integration that would close it. It counts against coverage and is never filled.

---

# 1. THE SIGNAL (the unit everything is built from)

A signal is **a claim with its basis attached**. The factory refuses to build one without a source,
a stated calculation and a data-quality label.

| Field | Meaning |
|---|---|
| `category`, `name`, `symbol` | Which of the eleven categories, what it measures, for whom |
| `score` | 0–100 in the signal's own terms, or `null` (descriptive or unavailable) |
| `status` | `positive` / `negative` / `neutral` / `insufficient_data` |
| `raw`, `previous`, `change`, `unit` | The filed figures, unmodified, and the change the score reads |
| `source` | `{id, sourceType, reliabilityTier, publisher, title, url, publicationDate, retrievedAt}` |
| `sourceDate` | When the fact became known (freshness is measured from this) |
| `calculation` | The arithmetic, in a sentence a reader can check |
| `interpretation` | What the app makes of it, always separate from the fact |
| `limitations` | What the measurement cannot see |
| `dataQuality` | `verified` · `calculated` · `estimated` · `attention` · `unavailable` |
| `confidence` | `high` / `medium` / `low` / `none` |

**Four kinds of statement are never mixed.** VERIFIED FACT (filed or published), CALCULATED SIGNAL
(our arithmetic on those), MODEL INTERPRETATION (a third party's model: consensus, ratings) and
ATTENTION DATA (how much notice the market takes, never evidence about the business). Each prints as
a badge.

**Source tiers.** `primary`: SEC filing, company IR, earnings release, transcript, government data.
`secondary`: a data vendor or licensed provider. `contextual`: news, attention data. A contextual
source can never carry `high` confidence.

---

# 2. THE ARITHMETIC

### 2.1 Band score: every measured change maps linearly onto 0–100
```
bandScore(value; mid, span, invert) = clamp(0, 100, 50 + ((value − mid) / span) × 50)   (sign flipped if invert)
```
`mid` scores 50 ("no change"). `±span` saturates the scale. The scale is linear, not a curve, so
the page can print "the full scale is ±4 points".

### 2.2 Status from score
`score ≥ 58` → positive · `score ≤ 42` → negative · otherwise neutral (a dead zone of ±8). No score
→ `insufficient_data`.

### 2.3 Freshness
```
days ≤ 35          → factor 1.00
35 < days < 730    → factor = 1 − ((days − 35) / 695) × 0.65      (straight line)
days ≥ 730         → factor 0.35  (floor: old is not wrong)
undated            → factor 0.35
```
13F signals are dated **quarter end + 45 days**, when the filing became public, not the quarter end.

### 2.4 Category score
```
w_i   = confidenceMultiplier(signal_i) × freshness_i        high 1 · medium 0.8 · low 0.55 · none 0
score = Σ (score_i × w_i) / Σ w_i                            over signals with a numeric score
```
Unscored signals (descriptive ones, gaps) count for coverage but not for the mean.
**Category confidence** is the best signal confidence, capped by source tier (contextual → medium
at most). A category resting on **one** scored signal is capped at `medium`.

### 2.5 Composite, coverage, confidence
```
Alpha Signal = round( Σ_live (categoryScore_c × weight_c) / Σ_live weight_c )
coverage     = Σ_live weight_c / Σ_all weight_c
```
`live` means categories with a numeric score. **A category with no data is dropped and its weight
redistributed. It is never scored zero.** No live category gives `null`: "no score", not a low one.

**Overall confidence** = min(ceiling, own):
- ceiling from coverage: ≥ 65% → high · ≥ 40% → medium · below → low (applied last, so nothing can
  route around it)
- own = weighted mean of category confidence (high 3, medium 2, low 1) using category weights:
  ≥ 2.5 → high · ≥ 1.6 → medium · below → low

### 2.6 Weights (sum = 1; starting values, **not validated**, no backtest has been run)

| Category | Weight | Why |
|---|:--:|---|
| Fundamental inflection | **0.20** | The only category made entirely of filed figures about the business |
| Revision momentum | 0.14 | The fastest-moving evidence that is still professional judgement |
| Commercial momentum | 0.12 | Revenue mix and announcement cadence: filed, but coarse |
| Institutional activity | 0.10 | Large and informed, but 45 days late |
| Insider conviction | 0.10 | Small samples, but the only own-money signal |
| Catalysts | 0.09 | Forward-looking, but scheduling rather than news |
| Price and volume | 0.08 | Confirmation, never cause |
| Investor attention | 0.07 | The undercoverage leg; not evidence about the business |
| Product and investment | 0.05 | R&D spend: real, filed, slow |
| Workforce | 0.03 | Annual 10-K headcount, almost a year stale |
| Industry context | 0.02 | Applies to every company in the sector equally |

Bump `CALC_VERSION` whenever a weight, band or category changes. The version is printed beside every
score, so scores from different versions are never compared silently.

---

# 3. THE ELEVEN CATEGORIES, SIGNAL BY SIGNAL

`q[0]` is the newest quarter, `q[4]` the same quarter a year earlier. Growth uses
`growthOf(now, prior) = (now − prior) / prior`. It returns null when the prior is 0, or when only
the prior is negative. When both are negative it gives the shrinkage of the loss.

### 3.1 Fundamental inflection (0.20) · feeds `incomeQ`, `cashflowQ` (12 quarters), else `income`, `cashflow` (annual)
Quarterly when there are ≥ 8 quarters. Otherwise an annual fallback when there are ≥ 3 years: revenue
acceleration, gross margin and FCF only (no operating margin), same bands, confidence `low`.

| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| Revenue growth acceleration | ✅ | YoY(q0 vs q4) − YoY(q1 vs q5) | mid 0, span 0.10 | high |
| Gross margin expansion | ✅ | GP/Rev(q0) − GP/Rev(q4) | span 0.04 (±4 pts) | high |
| Operating margin expansion | ✅ | OpInc/Rev(q0) − OpInc/Rev(q4) | span 0.04 | high |
| Free cash flow inflection | ✅ | (FCF last 4q − FCF prior 4q) ÷ revenue last 4q | span 0.05 | high |

Every comparison is year on year, never sequential (seasonality). Acquisitions and currency are not
stripped out.

### 3.2 Revision momentum (0.14) · feeds `gradesHistorical` (24 months), `targetSummary`, `estimates`
| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| Analyst rating mix shift | ✅ | netRating(month 0) − netRating(month 3), netRating = (2·SB + B − S − 2·SS) / n | span 0.40 | medium |
| Price target momentum | ✅ | (avg target last month − avg last quarter) ÷ avg last quarter | span 0.12 | medium (low if < 4 targets last month) |
| Consensus dispersion | ✅ | (EPS high − low) ÷ \|EPS avg\|, nearest forecast year | **descriptive, never scored** | medium |
| EPS consensus drift, 90 days | ✍️ | mean over forward fiscal years of (consensus now ÷ 90 days ago − 1); current quarter excluded | span 0.05 | high |
| EPS revision breadth, 30 days | ✍️ | (ups − downs) ÷ (ups + downs) | span 0.50 | high |
| EPS and revenue consensus revisions | ⛔ | FMP has no consensus time series. Needs Visible Alpha, Refinitiv, FactSet or similar | — | — |

### 3.3 Commercial momentum (0.12) · feeds `segProduct`, `pressReleases`
| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| Revenue mix shift | ✅ | the segment whose **share** of revenue moved most: share_now − share_prior | span 0.06 | medium |
| Announcement cadence | ✅ | releases last 90 days vs the 90 before: (recent − prior) ÷ prior (needs ≥ 6 releases, prior > 0) | span 1 (a doubling) | low |
| Total deferred revenue growth | ✍️ | YoY growth of the filed figure | span 0.20 | medium |
| Backlog disclosure | ✍️ | count of "backlog" in the 10-K: a *measured absence*, descriptive | — | high |
| Contracts, backlog and book-to-bill | ⛔ | needs a contract-award or backlog provider, or 10-K/10-Q text parsing | — | — |

### 3.4 Institutional activity (0.10) · feed `holdersSummary` (13F aggregate; Ultimate plan)
| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| Institutional ownership change | ✅ | `ownershipPercentChange` (points of shares, quarter on quarter) | span 3 | medium |
| Accumulation breadth | ✅ | (increased − reduced) ÷ (increased + reduced) positions | span 0.30 | medium |

### 3.5 Insider conviction (0.10) · feed `insiderStats` (last 4 quarters)
| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| Open-market insider activity | ✅ | tilt = (P − S) ÷ (P + S), Form 4 codes P and S only (grants and exercises excluded); no trades → 50 | **mid −0.6**, span 1.2 (asymmetric: selling is routine) | medium |
| Acquired-to-disposed tilt | ✅ | latest acquired/disposed ratio − mean of prior 2–3 quarters | span 1 | low (cross-check only) |

### 3.6 Product and investment (0.05) · feeds `incomeQ` or `income`
| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| R&D intensity change | ✅ | R&D ÷ revenue (trailing 4q, or annual) minus a year earlier; skipped when both are 0 | span 0.02 | medium (annual: low) |
| Granted patent output | ✍️ | granted US patents in the last complete 12 months vs the 12 before (the newest partial window is ignored) | span 0.25 | medium |
| Product launch cadence | ✍️ | dated product announcements in the 30 days to capture | mid 1, span 2 | medium |
| Product launches, approvals and patents | ⛔ | needs a patent database and a regulatory-decision feed | — | — |

### 3.7 Workforce (0.03) · feed `employees`
| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| Reported headcount growth | ✅ | 10-K headcount YoY | span 0.15 | low |
| Job posting growth by function | ⛔ (✍️ when captured) | needs a job-postings provider (LinkUp, Revelio…) | — | — |

### 3.8 Price and volume (0.08) · feeds `prices` (daily closes), `quote`; benchmark SPY
| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| 3-month relative strength | ✅ | return over 92 days − SPY's (absolute if no benchmark) | span 0.15 | high (absolute: medium) |
| 6-month relative strength | ✅ | 183 days | span 0.22 | same |
| 12-month relative strength | ✅ | 365 days | span 0.30 | same |
| Relative volume | ✅ | today's volume ÷ average volume | mid 1, span 1.5 | low |

Returns use the close on or before the target date, not "N rows back". A series needs more than 30
points.

### 3.9 Catalysts (0.09) · feed `earnings`
| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| Next earnings date | ✅ | score = clamp(30, 70, 70 − days/90 × 40): never above 70, a date is not news | — | medium |
| Last earnings surprise | ✅ | (EPS actual − estimate) ÷ \|estimate\| | span 0.20 | high |
| Dividend action | ✍️ | latest quarterly dividend vs the last different amount | span 0.15 | high |
| Investor days, regulatory decisions, corporate actions | ⛔ | needs a corporate-events calendar plus 8-K parsing | — | — |

### 3.10 Investor attention (0.07) · feeds `estimates`, `news`, `quote`/`profile`, `holdersSummary`
Higher score = **less** attention = more room for it to arrive.

| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| Analyst coverage versus size | ✅ | (expected − analysts) ÷ expected; expected by cap: >$200bn 40 · $50–200bn 30 · $10–50bn 20 · $2–10bn 12 · <$2bn 6 | span 1 | medium |
| News volume versus size | ✅ | (max(6, expected) − articles in 90 days) ÷ that; feed saturated at 100 rows → score 5 | span 1 | low |
| Institutional ownership level | ✅ | (60 − ownership %) ÷ 60 | span 1 | medium |
| Search interest versus its own year | ✍️ | mean of last 4 weeks ÷ mean of the window, **inverted** | mid 1, span 0.5 | medium |
| Search and retail attention | ⛔ | needs a search-interest source under its own terms. Social media is never read | — | — |

The coverage brackets are a stated assumption, not a fitted distribution. They are the crudest part
of the score, and the page says so.

### 3.11 Industry context (0.02) · sector ETF vs SPY daily closes
| Signal | Tag | Formula | Band | Conf. |
|---|:--:|---|---|:--:|
| Sector relative performance | ✅ | sector ETF 183-day return − SPY's | span 0.15 | medium |

### 3.12 Failure rule
A provider that throws is reported as one `insufficient_data` signal naming itself
(`<id> provider (failed)`), and the run continues. One bad feed costs its own category only.

---

# 4. ARCHETYPES (first match wins; `needs` must have scored first)

`c.x` is category x's score, `q` the company's 0–5 quant rating (an archetype that reads `q` is
skipped when it's missing, never defaulted).

| # | Label | Needs | Rule |
|:--:|---|---|---|
| 1 | Fundamental inflection | fundamental | c.fundamental ≥ 65 and (c.revisions ≥ 55 or c.commercial ≥ 60) |
| 2 | Emerging compounder | fundamental | q ≥ 3.5 and c.fundamental ≥ 60 |
| 3 | Turnaround watch | fundamental | q < 2.5 and c.fundamental ≥ 60 |
| 4 | Fallen leader | fundamental, priceVolume | q ≥ 3.2 and c.priceVolume ≤ 35 |
| 5 | Smart money accumulation | institutional | c.institutional ≥ 70 and (c.insider ?? 50) ≥ 45 |
| 6 | Insider conviction | insider | c.insider ≥ 75 |
| 7 | Catalyst setup | catalysts | c.catalysts ≥ 70 and (c.fundamental ?? 50) ≥ 45 |
| 8 | Undercovered growth | attention, fundamental | c.attention ≥ 65 and c.fundamental ≥ 55 |
| 9 | Crowded winner | attention, priceVolume | c.attention ≤ 30 and c.priceVolume ≥ 65 |
| 10 | Deteriorating leader | fundamental | q ≥ 3.2 and c.fundamental ≤ 35 |
| 11 | No clear setup | — | always (the most common outcome, not a negative finding) |

Other matches print as secondary tags. **Supporting** categories are those scoring ≥ 60, and
**opposing** those ≤ 40. Both print under the label, because a label without its counter-evidence
is just a headline.

**Quant and Alpha pair note** (printed wherever both appear), quant ≥ 3 and alpha ≥ 60:
- **Good and high:** both agree, the least common case.
- **Good and low:** established and not inflecting, which is not a criticism of either.
- **Poor and high:** an early turnaround *or* a dead-cat bounce; the evidence tells them apart.
- **Poor and low:** neither rating argues for it.

---

# 5. HAND-CAPTURED DISCLOSURES (✍️)

`web/public/data/alpha-disclosures.json`, one block per symbol. Four rules apply, enforced in code:
1. Every signal carries the real source URL.
2. The capture date is the signal date, so freshness ages it like a filing.
3. A symbol with no entry gets nothing; nothing is borrowed from peers or sector averages.
4. An absence is recorded as an absence ("backlog" appears 0 times in the 10-K).

A capture **supersedes** the matching ⛔ gap (for example, `estimateRevisions` replaces "EPS and
revenue consensus revisions") and adds a narrower residual gap for whatever it did not reach.
`tools/capture/README.md` records the query behind every field. Each block has the shape a real
provider would return, so swapping the JSON for an integration only changes the loader.

---

# 6. THE MARKET SCAN (Alpha Scanner, `/alpha/scan`)

1. Universe: `company-screener` with `country=US, isEtf=false, isFund=false, isActivelyTrading=true,
   limit=5000`, an optional size floor (any · > $300m · > $2bn · > $10bn) and an optional sector.
2. Sort by market cap, descending; keep the top **60 / 150 (default) / 300**.
3. Per company, **7 requests**: `incomeQ`, `gradesHistorical`, `targetSummary`, `insiderStats`,
   `estimates`, `quote`, plus `ratios-ttm` for the lite quant score.
4. `runProviders` → `scoreAlpha` → `classify`. Each row prints its own coverage, because the scan
   depth is lower than a company page's.

Known bias, stated on the Limits tab: largest-first sampling favours names already well covered.
Inconsistency to fix: the pricing page promises "40 market scans a month, **500 companies each**",
but the scanner's largest setting is 300.

On a company page the Alpha tab reuses the report's feeds and adds 5: `incomeQ`, `cashflowQ`,
`gradesHistorical`, `targetSummary`, `holdersSummary`.

---

# 7. VALIDATION ANCHOR: AAPL, bundled capture (as of 2026-09-22)

Computed by `runProviders` + `scoreAlpha` over `web/public/data/AAPL.json` plus the AAPL
disclosures, with `now = 2026-09-22` and no quant rating. To reproduce, run the same with that `now`.

**Alpha Signal 60 / 100 · coverage 98% · confidence medium · 33 signals (14 positive, 7 negative,
4 unavailable) on 10 of 11 categories.** The pattern it best matches is Fundamental inflection;
it also matches Undercovered growth.

| Category | Score | Conf. | Scored / total |
|---|:--:|:--:|:--:|
| Fundamental inflection | 81.6 | high | 4/4 |
| Revision momentum | 46.4 | high | 4/5 |
| Commercial momentum | 65.7 | medium | 2/3 |
| Institutional activity | 36.2 | medium | 2/2 |
| Insider conviction | 32.6 | medium | 2/2 |
| Product and investment | 74.4 | medium | 3/4 |
| Workforce | 54.1 | low | 1/2 |
| Price and volume | 73.7 | medium | 2/2 |
| Catalysts | 61.6 | high | 3/4 |
| Investor attention | 66.7 | medium | 4/4 |
| Industry context | n/a (no sector series in the capture) | none | 0/1 |

Signal-level anchors: revenue growth acceleration 48.8 · gross margin expansion 94.6 · operating
margin expansion 82.9 · FCF inflection 100.0 · rating mix shift 33.6 · price target momentum 76.6 ·
revenue mix shift 63.6 · ownership change 36.7 · accumulation breadth 35.7 · open-market insider
33.3 · R&D intensity 75.1 · headcount 54.1 · 3-month RS 54.8 · 6-month RS 92.5 · next earnings 53.6 ·
last surprise 67.2 · coverage vs size 62.5 · news volume 97.5 · ownership level 46.7.

The capture holds one year of prices with no SPY series, so 12-month relative strength is missing
and 3- and 6-month are absolute returns at medium confidence. Live data reads relative strength.

---

# 8. REPLICATION CHECKLIST

1. Implement the signal factory (§1). Refuse any signal without a source, a calculation and a
   quality label.
2. Implement `bandScore`, `statusFor`, `freshness` and the confidence tables exactly (§2).
3. Implement the eleven providers (§3), each returning ⛔ signals for what it cannot reach.
4. Reduce: category means weighted by confidence × freshness, then the redistributed composite,
   then the coverage-capped confidence (§2.4–2.5).
5. Classify (§4) and print the supporting and opposing categories.
6. Check against §7 and against `web/tests/alpha.test.ts`. Its core properties: empty input gives
   a null score; coverage is the share of weight measured; low coverage cannot reach high
   confidence; fresh evidence outvotes stale; no NaN scores.
7. Version the weights; store `CALC_VERSION` with every score.

---

# 9. WHAT THE MASTER PROMPT ASKED FOR AND WHAT WAS NOT BUILT

| Asked for (Appendix A) | State |
|---|---|
| Transparent 0–100 score, central versioned weights, coverage, confidence, freshness | Built |
| Eleven categories with source-backed signals and an evidence drawer | Built; 6 gaps shown as ⛔ |
| Archetypes with supporting and counter-evidence | Built (10 + "No clear setup") |
| Estimate revision momentum | ⛔ from FMP, which has no consensus history; ✍️ for AAPL |
| Hiring, patents, search interest, corporate events | ⛔ (no provider); ✍️ for AAPL only |
| AI narrative with citations | Deterministic narrative (§10); model prompt in Part 2 |
| Database: signal history, score snapshots, scheduled updates | **Not built.** No server storage; nothing persists between visits |
| Backtesting and validation | **Not built.** No stored history to test against; weights unvalidated |
| Real-time "smart money" | Refused on purpose: 13F is a 45-day-late snapshot and is labelled so |

---

# 10. THE WRITTEN SUMMARY AS SHIPPED (no model)

`narrate(result, classification, symbol)` returns
`{summary, improving, deteriorating, watch, unconfirmed, risks, whatWouldConfirm, sources}`.
Every sentence comes from the signal that owns the fact, so no number is composed and no citation is
invented.

- **summary**, three sentences:
  1. "`SYM` scores `S` out of 100 on `n` of the eleven signal categories, covering `C`% of the
     model's weight at `conf` confidence."
  2. Either "The pattern it best matches is `label`: `blurb`" or "The evidence does not group into
     a pattern this engine names, which is the most common outcome and not a negative finding."
  3. "`p` signals read positive, `n` negative, and `m` could not be measured at all."
- **improving / deteriorating**: positive and negative signals, strongest first, then freshest.
  Each item carries `signalId`, its interpretation, calculation, quality, confidence, source and
  freshness.
- **watch**: neutral signals that have a score.
- **unconfirmed**: every ⛔ signal, with the provider it needs.
- **risks**: the negative evidence, plus every signal that is low-confidence or more than a year old.
- **whatWouldConfirm**: one fixed sentence per scored category, in weight order. Example for
  fundamental: "Whether the next quarterly filing extends the direction or reverses it. One quarter
  of acceleration is a data point; two is a trend."
- **sources**: every distinct source cited, with how many signals use it.

It refuses to write a verdict, a target or "buy".

---

# PART 2 — THE MODEL PROMPT (for wiring a language model later)

**Not used by the app today.** If a model is added, it takes `narrate()`'s output as its *only*
input and rewrites the sentences; it never sources new facts. The app must then **check the output
before showing it**: reject any cited `signalId` that is not in the input, and any number that does
not appear in an input field.

### System prompt
```text
You are the editor of the Maz Vantage Alpha Signal summary for one company. You rewrite
structured evidence into clear, neutral research prose. You are an editor, not an analyst:
you add no facts.

INPUT: one JSON object with the fields summary, improving, deteriorating, watch, unconfirmed,
risks, whatWouldConfirm and sources. Every evidence item has a signalId, a name, text (the
interpretation), detail (the calculation), qualityLabel, confidence, source and freshness.

RULES
1. Use only facts present in the input. Never introduce a number, date, name, product or event
   that does not appear in an input field. If you cannot say something from the input, leave
   it out.
2. Every sentence that states a fact ends with the signalId(s) it comes from, in square
   brackets, e.g. [fundamental.gross-margin-expansion.12]. Use only ids present in the input.
   Never invent or alter an id.
3. Keep the four kinds apart and say which one a statement is when it matters: VERIFIED FACT,
   CALCULATED SIGNAL, MODEL INTERPRETATION, ATTENTION DATA. Never present attention data as
   evidence about the business.
4. Open with how much was measured (coverage and confidence) before the score.
5. For every item in `unconfirmed`, state that the evidence is unavailable and name the
   provider it needs. Never estimate or fill it.
6. Where positive and negative evidence conflict, say so and explain what would separate the two
   readings, using `whatWouldConfirm`.
7. Mention low confidence or staleness whenever you rely on a signal listed in `risks`.
8. No predictions, price targets, ratings or recommendations (no "buy", "sell", "will rise").
   No sensational language ("multibagger", "next Nvidia", "risk-free", "certain winner").
   No generic clichés ("strong fundamentals", "well positioned", "headwinds and tailwinds").
9. Plain English, short sentences, no markdown emphasis.

OUTPUT: JSON only, matching this schema:
{
  "summary": string,                     // 2-4 sentences, facts cited
  "positiveEvidence":   [{ "text": string, "signalIds": string[] }],
  "negativeEvidence":   [{ "text": string, "signalIds": string[] }],
  "unresolvedQuestions":[{ "text": string, "signalIds": string[] }],   // from unconfirmed + whatWouldConfirm
  "keyRisks":           [{ "text": string, "signalIds": string[] }],
  "sourceReferences":   [{ "id": string, "publisher": string, "title": string|null, "url": string|null }]
}
sourceReferences lists only sources present in the input `sources` array.
```

### User message
```text
Company: {SYMBOL}. Calculation version: {CALC_VERSION}. Today: {YYYY-MM-DD}.
Evidence (from narrate()):
{JSON}
```

### Guard (in code, after the model answers)
1. Parse the JSON. On failure, show the deterministic narrative.
2. Every `signalIds` entry must exist in the input; otherwise drop the item.
3. Every number in the output text must appear in some input `detail`, `text` or `name`;
   otherwise drop the item.
4. Show the model's text with a "Rewritten by a language model from the evidence below" label,
   and keep the deterministic evidence list under it.

---

# APPENDIX A — THE ORIGINAL MASTER PROMPT (verbatim, as given on 2026-09-21)

The feature was built from this prompt. Where the build departs from it, §9 says so and why.

````markdown
# MASTER PROMPT — Build the Hidden Gem Discovery Engine

## 1. ROLE AND OBJECTIVE

You are a senior full-stack engineer, quantitative financial data engineer, product designer, and financial research systems architect.

You are working on my existing stock-analysis platform, which is inspired by:

- Seeking Alpha Quant
- Simply Wall St
- TradingView
- Institutional-quality equity research platforms

The platform already has:

- FMP market data integration
- A proprietary Quant Score system
- Stock pages
- Financial data and fundamental metrics
- A potential Shariah-compliance angle
- An existing frontend and backend that you must inspect before modifying

Your task is to design and implement a new major feature called:

# DISCOVERY ENGINE
### Find undercovered companies with improving fundamentals and early-stage investment signals.

The goal is not to predict the next Nvidia with certainty. The goal is to identify companies that show a combination of **early measurable improvements, limited market attention, favorable business developments, and potential catalysts** before these signals become widely recognized.

The engine must be evidence-driven. It must not rely on rumors, fabricated data, unsupported assumptions, or vague opinions from social media.

Build this as a serious financial-research product, not a generic stock screener.

---

# 2. FIRST: INSPECT THE EXISTING PROJECT

Before writing code:

1. Inspect the complete repository structure.
2. Identify the frontend framework, backend framework, database, routing, styling system, and deployment setup.
3. Identify all existing FMP API integrations.
4. Identify the current Quant Score implementation.
5. Identify existing stock pages, chart components, financial tables, filters, and reusable UI components.
6. Identify authentication, user settings, subscription logic, and feature-access controls if they exist.
7. Identify existing API routes, cron jobs, background workers, and database schemas.
8. Review existing design patterns and maintain visual consistency.
9. Determine whether the project already uses TypeScript, validation libraries, caching, testing, or a job queue.

Do not replace the existing architecture unnecessarily.

Do not delete or rewrite existing features without a clear reason.

Before implementation, provide a short technical assessment:

- Existing architecture
- Relevant files
- Existing reusable components
- Missing infrastructure
- Recommended implementation plan
- Potential risks and API limitations

Then proceed with implementation unless a critical blocker exists.

---

# 3. CORE PRODUCT PRINCIPLES

The Discovery Engine must follow these principles.

## 3.1 Evidence first

Every meaningful signal must be connected to a source.

For each signal, show:

- Signal name
- Source
- Source type
- Publication or filing date
- Raw value
- Previous value
- Historical comparison
- Platform calculation
- Confidence level
- Data freshness
- Interpretation

Example:

```text
Signal: Greater China Revenue Momentum

Raw fact:
Greater China revenue declined by 13% year over year on a currency-neutral basis.

Source:
Nike annual report / SEC filing

Date:
FY2026

Platform interpretation:
Negative regional revenue momentum.

Confidence:
High

Calculation:
Current period revenue versus comparable prior-year period.
```

Do not display interpretations as if they were verified facts.

Clearly separate:

- Verified Fact
- Calculated Signal
- Model Interpretation
- Market Attention Signal
- Analyst/AI Summary

## 3.2 No rumors as evidence

Do not use Reddit, X, anonymous forums, message boards, or unverified rumors as factual evidence.

Do not scrape Reddit or social media to make fundamental investment claims.

If social sentiment or online attention is eventually added, it must be:

- Optional
- Clearly labeled as attention/sentiment data
- Separated from fundamental evidence
- Never used as proof of a company's financial condition
- Never presented as verified information

Prioritize:

1. SEC filings and other regulatory filings
2. Company investor relations releases
3. Official earnings releases
4. Earnings call transcripts from licensed sources
5. Government and official databases
6. FMP structured financial data
7. Official company career pages
8. Reputable news sources for context
9. Market data providers
10. Optional alternative-data providers with documented methodology

Never fabricate unavailable data.

If a data source is not available, display:

```text
Data unavailable
Source integration required
```

Do not fill the missing field with an invented estimate.

---

# 4. SEPARATE QUANT SCORE FROM DISCOVERY SCORE

The existing Quant Score must remain separate from the new Discovery Score.

## Existing Quant Score

Measures the current quality of a stock using dimensions such as:

- Valuation
- Growth
- Profitability
- Financial health
- Momentum
- Earnings metrics

Do not modify the existing score unless explicitly required.

## New Discovery Score

Measures the strength of early-stage signals that may indicate:

- Fundamental improvement
- Positive estimate revisions
- Business inflection
- Institutional accumulation
- Insider conviction
- Commercial recovery
- New products or markets
- Catalysts
- Limited investor attention
- Undercoverage
- Improving market behavior

The Discovery Score must not be described as a guaranteed forecast of future returns.

Display both scores independently:

```text
Quant Score: 78/100
Discovery Score: 71/100
```

Explain why the two scores can differ.

Examples:

- High Quant Score + Low Discovery Score = established quality company with limited new inflection.
- Low Quant Score + High Discovery Score = potentially improving turnaround or early inflection.
- High Quant Score + High Discovery Score = quality company with additional emerging signals.
- Low Quant Score + Low Discovery Score = weak current fundamentals and limited positive evidence.

---

# 5. DISCOVERY ENGINE SIGNAL CATEGORIES

Build the engine with modular signal providers. Each provider must have a consistent interface and return structured data.

Every signal should include:

```typescript
type DiscoverySignal = {
  id: string;
  stockSymbol: string;
  category: SignalCategory;
  name: string;
  status: "positive" | "negative" | "neutral" | "insufficient_data";
  rawValue?: number | string | null;
  previousValue?: number | string | null;
  change?: number | null;
  unit?: string | null;
  sourceName: string;
  sourceUrl?: string | null;
  sourceType: string;
  sourceDate?: string | null;
  retrievedAt: string;
  confidence: "high" | "medium" | "low";
  calculationMethod?: string;
  historicalComparison?: string;
  interpretation?: string;
  dataQuality?: "verified" | "calculated" | "estimated" | "unavailable";
};
```

Use a typed category system.

## 5.1 Fundamental Inflection

Detect meaningful changes in the underlying business.

Potential signals:

- Revenue growth acceleration
- Organic growth acceleration
- Gross margin expansion
- Operating margin expansion
- EBITDA margin improvement
- Free cash flow improvement
- Earnings growth acceleration
- Improving return on invested capital
- Improving cash conversion
- Debt reduction
- Improving working capital
- Improving segment performance
- New positive revenue contribution from a segment
- Stabilization after a period of deterioration

Compare:

- Latest quarter versus prior-year quarter
- Latest quarter versus previous quarter where appropriate
- Trailing twelve months versus previous TTM period
- Multi-year trends where available

Do not automatically classify a company as improving based on one isolated metric.

Use multiple periods where possible.

## 5.2 Earnings Estimate Revision Momentum

Detect changes in forward expectations.

Potential signals:

- EPS estimate increases
- Revenue estimate increases
- Number of upward analyst revisions
- Number of downward analyst revisions
- Consensus estimate dispersion
- Forward earnings growth changes
- Changes in price targets, where licensed and available
- Estimate revisions following earnings releases

Clearly identify whether data comes from:

- FMP
- Another licensed provider
- A third-party data integration
- Internal calculations

Do not pretend that FMP provides a field if it does not.

If analyst revision data is unavailable, implement an adapter interface so a provider can be added later.

## 5.3 Smart Money / Institutional Activity

Analyze available institutional ownership information.

Potential signals:

- Changes in institutional ownership
- New institutional positions
- Increases in existing positions
- Decreases in existing positions
- Number of institutions accumulating
- Concentration of institutional ownership
- 13F filing changes
- Institutional ownership trend over time

Important limitations:

- 13F filings are delayed.
- They do not represent real-time positions.
- They do not reveal every short position or derivative exposure.
- Filing dates and reporting periods must be displayed.
- Do not call delayed data “live smart money activity.”

Display:

```text
Institutional ownership change
Reporting period
Filing date
Number of reporting institutions
Source
Limitations
```

Do not overinterpret a single institution's purchase.

## 5.4 Insider Conviction

Where reliable insider transaction data is available:

- Detect insider purchases
- Detect insider sales
- Identify transaction value
- Identify insider role
- Identify transaction date
- Distinguish open-market transactions from compensation-related activity
- Track repeated transactions
- Track the number of insiders involved

Do not classify all insider selling as negative.

Do not classify all insider buying as proof that a stock will rise.

Show the raw transaction details and the platform's calculation separately.

## 5.5 Commercial and Business Momentum

Detect business-level developments using verifiable information.

Potential signals:

- New contracts
- Customer wins
- Partnerships
- Backlog changes
- Order growth
- Book-to-bill ratio
- New distribution agreements
- Expansion into new markets
- Customer concentration changes
- Official product launches
- Capacity expansion
- Revenue growth from a new segment

Prioritize company announcements, regulatory filings, and official documentation.

Do not infer a major customer relationship unless it is supported by a source.

## 5.6 Product, Innovation, and Competitive Position

Potential signals:

- New product launches
- Product adoption metrics
- Patent activity, if a reliable source is available
- R&D spending changes
- R&D efficiency
- New manufacturing capacity
- New technology deployment
- Official regulatory approvals
- Product revenue contribution
- Expansion into high-growth end markets

Use concrete facts, not vague statements such as:

```text
Management appears very bullish.
```

Prefer:

```text
The company reported that product X generated €Y in revenue, compared with €Z in the prior period.
```

If the source only contains management commentary, label it as management commentary.

## 5.7 Hiring and Workforce Signals

Where data is available from official sources or licensed providers:

- Job posting growth
- Hiring by department
- Engineering hiring
- Sales hiring
- Manufacturing hiring
- Geographic expansion
- Changes in job posting composition

Important limitations:

- Job postings are not equivalent to confirmed hiring.
- Duplicate postings may distort the data.
- Job postings can reflect replacement hiring.
- Third-party job data may be incomplete.

Use cautious language:

```text
Increase in publicly visible engineering job postings.
```

Not:

```text
The company is definitely preparing for explosive growth.
```

## 5.8 Price and Volume Behavior

Analyze market data without confusing price momentum with business quality.

Potential signals:

- Relative strength versus sector
- Relative strength versus benchmark
- Volume expansion
- Breakout from a defined price range
- Accumulation/distribution proxies
- Volatility changes
- Price reaction to earnings
- Price behavior after catalysts
- New highs or lows
- Relative performance over multiple periods

Use configurable periods:

- 1 month
- 3 months
- 6 months
- 12 months

Do not present technical signals as guarantees.

## 5.9 Catalyst Detection

Identify upcoming or recently announced events:

- Earnings date
- Investor day
- Product launch
- Regulatory decision
- Contract announcement
- New facility opening
- Management transition
- Capital allocation announcement
- Debt refinancing
- Share buyback
- Strategic review
- Spin-off
- Acquisition announcement

Every catalyst must have:

- Event type
- Expected date, if known
- Source
- Confidence
- Status: upcoming, completed, delayed, or unknown

Avoid speculative catalysts unless explicitly labeled as scenarios.

## 5.10 Macro and Industry Context

Provide context for sectors and industries.

Potential factors:

- Industry growth
- Commodity prices
- Interest rates
- Currency movements
- Government incentives
- Regulation
- Supply chain trends
- AI infrastructure demand
- Consumer demand
- Energy demand
- Semiconductor cycle
- Geopolitical exposure

Separate:

- External macro fact
- Company exposure
- Platform interpretation

Do not automatically assume that an industry tailwind benefits every company in that industry.

## 5.11 Investor Attention and Undercoverage

This is an important component of the Discovery Engine.

Potential measurable metrics:

- Number of analyst estimates, where available
- Number of analysts covering the stock
- News article volume
- Change in news volume
- Search interest trends, if a compliant data source is available
- Trading volume relative to historical average
- Institutional ownership
- Market capitalization
- Investor presentation frequency
- Number of earnings-related mentions
- Relative attention compared with sector peers

Undercoverage should not simply mean “few news articles.”

A stock can have low media coverage but still be widely followed by institutions.

Create a transparent Undercoverage Score based on available data.

Example:

```text
Undercoverage Score: 74/100

Contributing factors:
- Low analyst coverage relative to sector peers
- Low news volume relative to market capitalization
- Limited search attention
- Low institutional ownership relative to comparable companies

Data availability:
Partial

Confidence:
Medium
```

Do not use fabricated Google Trends or analyst coverage values.

If attention data is unavailable, clearly display the missing provider.

---

# 6. DISCOVERY SCORE METHODOLOGY

Build a transparent scoring engine.

Do not create an opaque AI-generated score.

Each signal category should have:

- A normalized score from 0 to 100
- A weight
- A confidence multiplier
- A freshness factor
- A data availability indicator

Example architecture:

```text
Discovery Score =
  Fundamental Inflection
  + Estimate Revision Momentum
  + Business Momentum
  + Institutional Activity
  + Insider Conviction
  + Catalysts
  + Price/Volume Confirmation
  + Undercoverage
  + Industry Tailwind
```

The exact weights should be configurable and stored centrally.

Do not claim that the initial weights are statistically optimal.

Make the weighting system easy to modify and version.

Example configuration:

```typescript
const discoveryWeights = {
  fundamentalInflection: 0.20,
  estimateRevisionMomentum: 0.15,
  businessMomentum: 0.15,
  institutionalActivity: 0.10,
  insiderConviction: 0.10,
  catalysts: 0.10,
  priceVolumeConfirmation: 0.08,
  undercoverage: 0.07,
  industryTailwind: 0.05,
};
```

These are starting values only. Document that they require validation and backtesting.

The score should include:

```text
Discovery Score
Data Coverage
Confidence
Signal Count
Signal Freshness
Last Updated
```

Example:

```text
Discovery Score: 72/100
Confidence: Medium
Data Coverage: 68%
Active Positive Signals: 7
Negative Signals: 3
Last Updated: September 21, 2026
```

Do not assign a high confidence rating when the data coverage is low.

---

# 7. STOCK ARCHETYPES

Create a classification layer based on measurable signals.

Possible archetypes:

1. Emerging Compounder
2. Fundamental Inflection
3. Turnaround Watch
4. Fallen Leader
5. Smart Money Accumulation
6. Catalyst Setup
7. Undercovered Growth
8. Crowded Winner
9. Deteriorating Leader
10. No Clear Setup

A stock may have multiple applicable tags, but the primary classification must be explainable.

Example:

```text
Primary Classification:
Fundamental Inflection

Supporting evidence:
- Revenue growth acceleration
- Improving operating margin
- Positive EPS revisions
- Increased commercial activity

Counter-evidence:
- High valuation
- Weak relative price performance
- Limited data coverage
```

Do not use sensational language such as:

- Guaranteed multibagger
- Next Nvidia
- Risk-free opportunity
- Certain winner

Use neutral, research-oriented terminology.

---

# 8. USER INTERFACE AND DESIGN

Create a premium dark financial terminal interface inspired by TradingView and modern institutional research platforms.

Do not copy TradingView's branding, logos, or proprietary interface exactly.

Use the existing project's design system where possible.

The interface should feel:

- Professional
- Data-dense but readable
- Fast
- Trustworthy
- Research-oriented
- Suitable for desktop and responsive on mobile

## 8.1 Discovery Dashboard

Create a dedicated page such as:

```text
/discovery
```

Include:

### Header

- Discovery Engine title
- Description
- Last data update
- Data coverage indicator
- Search field
- Market/region selector
- Sector selector
- Market-cap selector

### Main KPI cards

- Stocks analyzed
- Emerging setups
- High-confidence signals
- Recent fundamental inflections
- Average data coverage
- Last engine update

### Discovery filters

Allow users to filter by:

- Discovery Score
- Quant Score
- Market capitalization
- Sector
- Country
- Industry
- Revenue growth
- EPS growth
- Free cash flow
- Profitability
- Analyst coverage
- Insider activity
- Institutional activity
- Catalyst proximity
- Undercoverage
- Risk level
- Data confidence
- Shariah-compliance status, if the existing platform supports this

Use filter pills and a clear reset option.

### Stock discovery table

Columns:

- Company
- Symbol
- Price
- Quant Score
- Discovery Score
- Primary Archetype
- Fundamental Inflection
- Estimate Revisions
- Smart Money
- Insider Activity
- Undercoverage
- Catalyst
- Confidence
- Updated

Make the table sortable and responsive.

Do not overwhelm users with unexplained numbers. Provide tooltips and expandable signal details.

### Discovery opportunity cards

Create optional cards for:

- Emerging Compounders
- Undercovered Growth
- Turnaround Watch
- Fundamental Inflection
- Catalyst Setups
- Smart Money Activity

Each card must include an explanation of why the stock appears in that category.

---

# 9. STOCK DISCOVERY DETAIL PAGE

Create a dedicated stock-level discovery experience.

Possible route:

```text
/stock/[symbol]/discovery
```

Or integrate it into the existing stock page using a Discovery tab.

## Header

Show:

- Company name
- Ticker
- Current price
- Existing Quant Score
- Discovery Score
- Primary archetype
- Data confidence
- Last updated
- Watchlist button, if available

Example:

```text
Nike, Inc. — NKE

Quant Score: 61/100
Discovery Score: 48/100
Classification: Turnaround Watch
Confidence: Medium
```

## Main sections

### 1. Discovery Summary

Display:

- What is improving?
- What is deteriorating?
- What could become a catalyst?
- What remains unconfirmed?
- Why the stock appears in the Discovery Engine

The summary must be generated from structured signals and source-backed data.

Avoid generic AI financial commentary.

### 2. Signal Overview

Create visual cards for each category:

- Fundamental Inflection
- Estimate Revision Momentum
- Institutional Activity
- Insider Conviction
- Commercial Momentum
- Product/Innovation
- Hiring
- Price/Volume
- Catalysts
- Investor Attention
- Undercoverage
- Macro Context

Each card should display:

- Score
- Status
- Confidence
- Latest change
- Source
- Expandable calculation explanation

### 3. Signal Timeline

Display a chronological timeline of important events:

- Earnings releases
- Revenue inflections
- Estimate revisions
- Insider transactions
- Institutional filings
- Product launches
- Partnerships
- Regulatory events
- Price/volume reactions

Each timeline item must have a source and date.

### 4. Evidence Drawer

When a user clicks on a signal, open an evidence drawer or modal.

Display:

```text
Signal:
Revenue Growth Acceleration

Verified Fact:
Reported revenue increased from X to Y.

Source:
Company filing

Source Date:
YYYY-MM-DD

Raw Data:
Current revenue: X
Prior revenue: Y

Platform Calculation:
Revenue growth = ((X - Y) / Y) × 100

Historical Comparison:
Growth versus previous three comparable periods.

Interpretation:
Positive / negative / neutral

Limitations:
Data may be affected by currency, acquisitions, or reporting changes.
```

Include a link to the original source wherever possible.

### 5. Bull Case / Bear Case

Create a structured evidence-based view.

Do not make unsupported investment recommendations.

#### Positive Evidence

List only source-backed positive factors.

#### Negative Evidence

List only source-backed risks or negative factors.

#### What Needs Confirmation

List measurable future indicators:

- Next quarter revenue growth
- Margin improvement
- EPS estimate direction
- Regional recovery
- Cash flow improvement
- Price/volume confirmation

Avoid writing a simplistic “Buy” or “Sell” verdict.

### 6. Catalyst Calendar

Display upcoming and recent catalysts with:

- Event
- Date
- Source
- Status
- Potential affected signal category
- Confidence

---

# 10. AI ANALYSIS REQUIREMENTS

Use AI only after collecting and validating structured data.

The AI layer must:

1. Read structured signal data.
2. Read source metadata.
3. Identify meaningful changes.
4. Distinguish facts from interpretation.
5. Explain conflicting signals.
6. Highlight missing data.
7. Avoid hallucinating values.
8. Cite the source associated with each factual statement.
9. Avoid making guaranteed predictions.
10. Avoid using generic financial clichés.

Use a structured output schema.

Example:

```typescript
type DiscoveryNarrative = {
  summary: string;
  positiveEvidence: EvidenceItem[];
  negativeEvidence: EvidenceItem[];
  unresolvedQuestions: EvidenceItem[];
  keyRisks: EvidenceItem[];
  sourceReferences: SourceReference[];
};
```

Every factual statement in the generated analysis should reference one or more source IDs.

Do not allow the AI to invent citations.

If a source is missing, the AI must state that the evidence is unavailable.

---

# 11. DATA ARCHITECTURE

Create modular provider interfaces.

Example:

```typescript
interface FundamentalDataProvider {
  getFundamentals(symbol: string): Promise<FundamentalData>;
}

interface EstimateRevisionProvider {
  getEstimateRevisions(symbol: string): Promise<EstimateRevisionData>;
}

interface InstitutionalActivityProvider {
  getInstitutionalActivity(symbol: string): Promise<InstitutionalActivityData>;
}

interface InsiderActivityProvider {
  getInsiderActivity(symbol: string): Promise<InsiderActivityData>;
}

interface MarketDataProvider {
  getPriceVolumeData(symbol: string): Promise<MarketData>;
}

interface CatalystProvider {
  getCatalysts(symbol: string): Promise<CatalystData[]>;
}

interface AttentionProvider {
  getAttentionData(symbol: string): Promise<AttentionData>;
}
```

Use FMP where the required data is available.

Do not assume that every signal can be obtained from FMP.

For unavailable providers:

- Implement a clean adapter interface.
- Return a clear unavailable status.
- Do not use fake values in production.
- Allow mock data only in development and label it clearly.

## Data storage

Design suitable database models for:

- Discovery signals
- Signal history
- Source references
- Score snapshots
- Stock classifications
- Catalyst events
- Data provider status
- Calculation versions
- Last updated timestamps

Avoid recalculating expensive data on every page load.

Use caching and scheduled updates where appropriate.

Track:

- Provider response timestamps
- Data freshness
- Calculation version
- Failed provider requests
- Rate limits
- Retry attempts
- API errors

---

# 12. SOURCE AND DATA QUALITY SYSTEM

Implement a source registry.

Example:

```typescript
type SourceReference = {
  id: string;
  sourceType:
    | "sec_filing"
    | "company_ir"
    | "earnings_release"
    | "transcript"
    | "fmp"
    | "government"
    | "licensed_provider"
    | "news"
    | "attention_data";
  publisher: string;
  title?: string;
  url?: string;
  publicationDate?: string;
  retrievedAt: string;
  reliabilityTier: "primary" | "secondary" | "contextual";
};
```

Every signal should reference a source record.

Source quality rules:

- Primary sources are preferred.
- News sources provide context and must not replace company filings when primary data exists.
- Attention data must be labeled as attention data.
- The system must record when a source is unavailable or stale.
- Links must point to the original source.
- Never create fake source URLs.

Build a reusable source component:

```text
Source: Nike FY2026 Annual Report
Type: SEC Filing
Published: YYYY-MM-DD
View Original Source →
```

---

# 13. BACKTESTING AND VALIDATION

Do not claim that the Discovery Engine works without validation.

Create the infrastructure for historical testing.

Potential tests:

- Did positive fundamental inflections precede subsequent earnings improvements?
- Did estimate revisions correlate with later earnings surprises?
- Did undercovered companies show different subsequent performance?
- Did high Discovery Score stocks outperform a defined benchmark after controlling for sector and market-cap exposure?
- How often did positive signals reverse?
- How did the system perform during different market regimes?

Track:

- Universe definition
- Historical date
- Look-ahead bias
- Survivorship bias
- Transaction costs
- Sector exposure
- Market-cap exposure
- Missing data
- Signal availability at the time
- Benchmark
- Holding period

Do not display backtest performance unless the methodology is properly documented.

Do not use future information in historical signals.

Add a section marked:

```text
Experimental
Not investment advice
Historical results do not guarantee future performance
```

If a full backtest cannot be implemented now, build the data structures and clearly mark the feature as planned.

---

# 14. PERFORMANCE, SECURITY, AND RELIABILITY

Requirements:

- Avoid unnecessary API requests.
- Cache FMP responses where appropriate.
- Respect API rate limits.
- Use environment variables for secrets.
- Never expose API keys in frontend code.
- Validate all external API responses.
- Handle missing, malformed, and delayed data.
- Add loading, empty, and error states.
- Avoid blocking the entire dashboard when one provider fails.
- Use pagination for large stock universes.
- Add database indexes for frequent queries.
- Prevent duplicate scheduled jobs.
- Log provider failures without exposing secrets.
- Add unit tests for score calculations.
- Add integration tests for provider adapters.
- Add tests for missing and stale data.

---

# 15. DESIGN AND UX REQUIREMENTS

The design should resemble a premium financial analytics terminal.

Visual direction:

- Dark theme
- Clear hierarchy
- Neutral financial colors
- Green/red only when meaningful
- High readability
- Compact but not cluttered
- Responsive layout
- Professional charts
- Consistent typography
- Subtle borders and panels
- Clear source indicators
- Distinct badges for facts, calculations, and interpretations

Use these visual labels:

```text
VERIFIED FACT
CALCULATED SIGNAL
MODEL INTERPRETATION
ATTENTION DATA
INSUFFICIENT DATA
```

Do not make the interface look like a casino or hype-driven stock-picking website.

Avoid excessive animations and decorative graphics that reduce clarity.

Use accessible contrast, keyboard navigation, and responsive behavior.

---

# 16. IMPLEMENTATION PHASES

Implement the feature in manageable phases.

## Phase 1 — Architecture and UI foundation

- Inspect existing project
- Create Discovery Engine routes
- Create reusable dashboard components
- Create stock discovery detail components
- Create signal card components
- Create source/evidence drawer
- Add initial mocked development data, clearly marked as mock data
- Ensure the design works with the existing application

## Phase 2 — FMP integration

- Connect available FMP endpoints
- Normalize data into provider interfaces
- Implement fundamentals
- Implement market data
- Implement earnings and estimates where available
- Implement insider and institutional data where available
- Add error handling and caching
- Store source references

## Phase 3 — Signal calculation engine

- Implement modular signal calculations
- Implement historical comparisons
- Implement freshness and confidence
- Implement Discovery Score
- Implement archetype classification
- Add unit tests
- Add calculation versioning

## Phase 4 — Source-backed AI analysis

- Build structured AI input
- Build structured AI output
- Add source references
- Add evidence-based summary generation
- Add conflicting signal explanations
- Add missing-data handling
- Prevent unsupported factual claims

## Phase 5 — Advanced providers

Create optional adapters for:

- 13F data
- Analyst estimate revisions
- Search attention
- Job posting data
- Patents
- Supply chain relationships
- Industry and macro data
- Licensed transcript data

Do not add an external provider unless its data rights, API access, and reliability are documented.

## Phase 6 — Validation and optimization

- Add automated tests
- Validate score calculations
- Test API failures
- Test stale data
- Test missing data
- Optimize queries
- Add monitoring
- Document limitations
- Prepare backtesting infrastructure

---

# 17. ACCEPTANCE CRITERIA

The feature is not complete until:

- The existing application still works.
- The Discovery Engine has a dedicated, polished user interface.
- Users can filter and sort stocks.
- The existing Quant Score remains separate.
- Discovery Scores are transparent and explainable.
- Each meaningful signal has a source or an explicit unavailable status.
- The system does not fabricate data.
- The system does not use Reddit or rumors as factual evidence.
- Source dates and data freshness are visible.
- The user can inspect the calculation behind a signal.
- The user can distinguish facts from interpretations.
- Missing provider data is handled gracefully.
- API secrets remain secure.
- Score calculations have automated tests.
- Loading, error, and empty states exist.
- The interface is responsive.
- The architecture supports future data providers.
- The system documents its limitations.
- No unsupported financial guarantees or exaggerated claims are displayed.

---

# 18. DEVELOPMENT RULES

Follow these rules throughout implementation:

1. Reuse existing components where possible.
2. Keep business logic separate from UI components.
3. Use strong typing.
4. Avoid duplicated calculation logic.
5. Create small, testable functions.
6. Add comments only where they clarify non-obvious decisions.
7. Do not use hardcoded production data.
8. Do not invent API responses.
9. Do not hide unavailable data.
10. Do not silently change existing scoring logic.
11. Use clear naming conventions.
12. Keep the implementation maintainable.
13. Document assumptions.
14. Show me the files changed after each meaningful phase.
15. Run linting, type checks, and tests.
16. Fix errors rather than ignoring them.
17. If a requested data source is unavailable, implement an adapter interface and explain the limitation.
18. Do not stop at a static mockup if the underlying architecture can be implemented.
19. Do not overengineer features that cannot currently be supported by reliable data.
20. Prioritize correctness and source transparency over the number of signals.

---

# 19. FINAL DELIVERABLE

After implementation, provide:

1. Summary of what was built.
2. Files created and modified.
3. Database schema changes.
4. API integrations implemented.
5. Signals currently supported.
6. Signals requiring additional providers.
7. Discovery Score methodology.
8. Source hierarchy.
9. Known limitations.
10. Test results.
11. Commands to run the feature locally.
12. Recommended next steps.
13. Screenshots or a walkthrough of the completed UI, if supported by the environment.

Start by inspecting the repository and producing the technical assessment. Then begin implementation in phases.

Do not invent data, sources, financial results, or completed functionality.
````
