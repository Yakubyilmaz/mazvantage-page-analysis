# Handover

For the developer folding this into the Maz Vantage platform.

This repo is a **complete, working stock research report** — 115 ratios across
five factors, ~60 charts, all of it static ES modules with no build step. It is
not the scoring engine. You are expected to replace the scoring and keep the
report.

Read §3 before you touch anything. It is the one thing that will waste your
afternoon otherwise.

---

## 1. Run it

```bash
python serve.py
```

`http://localhost:8792/?symbol=AAPL`. No install, no `npm i`, no bundler — the
browser loads the ES modules directly. It opens on the **Overview** — a
dashboard of summary cards; `?tab=analysis`, or the tab strip, gets you the
full report, and every other tab has its own slug — `?tab=research`,
`ratings`, `financials`, `statistics-metrics`, `analysts-forecast`,
`dividends`, `transcripts`, `news`, `shariah-compliance`, and the five factors
(`valuation`, `growth`, `financial-health`, `profitability`, `momentum`).

**There are two kinds of URL.** `?symbol=` opens a company report with tabs.
`?view=` opens one of the pages that is not about a company — the seven in the
nav bar (`markets`, `news`, `stocks`, `sectors`, `research`, `quant`,
`shariah`), each with a `&sub=` section, plus the two older ones, `ideas` and
`calendar`. See §12.

Any static file server works; `serve.py` just adds `Cache-Control: no-store`,
without which an edited module keeps serving its old version.

**It works with no API key.** A bundled snapshot of AAPL ships in
`assets/data/AAPL.json`, and the app renders the entire report from it. You get
a standing banner saying so, and five ratios degrade to `n/a` with a stated
reason. Add a Financial Modeling Prep key under the gear icon for live data on
any ticker.

Opening `index.html` off disk does **not** work. Browsers refuse ES-module
imports on `file://`.

---

## 2. What you are actually getting

| | |
|---|---|
| Ratio definitions | 117 |
| Placed in the factor tree | 115 |
| **Graded** (feed a factor score) | **77** |
| Shown but deliberately not graded | 38 |
| Trailing/forward pairs | 22 |
| FMP feeds | 34 |
| JS | ~21,500 lines, no dependencies |

The 77 graded ratios are exactly the lines in `MAZ_MASTER_SPEC.md`. The other 38
are shown with their figure and a pass/fail tick but carry **no grade and no
sector ranking**, because they are not spec lines. That rule is enforced by
`ungraded: true` on the metric definition — see §4.

---

## 3. The trap: sector distributions

Every grade is a percentile against a sector distribution loaded from
`assets/data/sector-stats.json`.

**The file shipped here is modelled, not measured.** It is tagged
`"source": "seed"` and the app shows a standing notice while that tag is
present. It exists so the report grades sensibly before anyone has run the real
builder.

The obvious first move is to replace it with real data:

```bash
python tools/build_sector_stats.py --apikey $FMP_KEY
```

**Do not do that without reading this paragraph.** That builder covers **41 of
the 65 distributions the app needs**. Running it today silently drops 24
metrics to unrankable — including *all four graded Momentum windows* (3M, 6M,
9M, 1Y), which is the entire Momentum factor, the one your spec weights 2×.

Missing from `build_sector_stats.py`:

```
return3m  return6m  return9m  return1y          <- the whole Momentum factor
buybackYield        cashFromOperations  ocfMargin
sloanAccruals       roeGrowth           fwdRoeGrowth
epsLongTermCagr     workingCapitalGrowth
marginStability5y   revenueVariability5y
netIncomePerEmployee
ocfToDebt  fcfToDebt  cashToDebt  debtToEbitda
netDebtToEquity     debtToCapital
equityToAssets      workingCapitalToAssets
evToEbitTtm
```

The four return windows are the awkward ones: the builder's quote pass reads a
batch exchange quote, which carries price and moving averages but no price
history, so returns need a per-symbol series it does not fetch. The rest are
mechanical — add them to the appropriate `*_METRICS` map in that file.

`tools/make_seed_stats.py` has all 65 and is the reference for what shape each
distribution should be.

**If your platform already has sector distributions, you do not need either
builder.** The app only wants a JSON of the shape
`{ sectors: { <sector>: { count, metrics: { <id>: { n, p: [21 quantiles] } } } } }`,
served at `assets/data/sector-stats.json`. `p` is a ladder from p0 to p100 in
5-point steps.

---

## 4. Plugging in your own scores

**The seam is `gradeAll()` in `assets/js/factors.js`.** It returns the object
the entire render layer consumes:

```js
a.scores = {
  valuation: { key, title, anchor, score, letter, graded, total, confident,
               groups: [ { key, title, desc, score, letter, metrics: [ … ] } ] },
  growth: {…}, profitability: {…}, health: {…}, momentum: {…},
  overall: { score, letter, factors },
}
```

Every entry in `groups[].metrics[]` is one row on screen and has this shape:

```js
{
  id, label,                  // identity
  fmt,                        // (v) => string — how to print the value
  value,                      // the number, or null
  state,                      // 'ok' | 'na'
  grade, letter,              // 0-5 and A+..F, or null when ungraded
  pctile, rank,               // 0-1 and { side, pct, text }, or null
  median, source,             // what it was compared against, and where from
  vsMedian,                   // 'pass' | 'fail' | 'na' — the tick, never scored
  tickTitle,                  // optional tooltip override for that tick
  ungraded,                   // true = show it, never score it
  explanation,                // the sentence under the row
}
```

**If your engine emits that shape, every table, pair, chart, summary strip and
factor header keeps working untouched.** You do not need to read `grading.js`
at all — replace `gradeAll` with an adapter over your own scores and delete the
percentile machinery.

Three rules the render layer relies on:

- `grade: null` + `rank: null` renders the "—" unscored chip and an empty
  ranking cell. That is how the 38 non-spec ratios display.
- `vsMedian` drives the pass/fail tick and is *display only*. Nothing scores it.
  Set `tickTitle` when the default "better/worse than the sector median" wording
  would be wrong — several absolute-scaled metrics do this.
- A factor's `score` is the mean of its graded metric grades. If your engine
  applies the spec's per-line weights, compute the factor score yourself and
  put it on the factor object; the header renders whatever you give it.

---

## 5. What is NOT implemented from MAZ_MASTER_SPEC

The ratio set matches. **The engine does not.** This app grades every ratio
equally within a factor and weights the five factors equally. None of the
following is wired:

- **Per-line weights** (PEG FWD 25.9%, EV/Sales TTM 0.9%, …). A 0.9% line and a
  25.9% line currently count the same.
- **Momentum at 2×** in the composite. All five factors are equal-weighted.
- **The sector mask** — EV multiples and Altman Z are not dropped in Financials,
  the leverage cluster is not suppressed, Utilities' dividend tilt is not applied.
- **NM weight renormalisation.** Unassessed metrics are dropped from the mean,
  which is close in spirit but does not rescale survivors to 100%.
- **Hazen percentiles winsorized at 1/99.** The app interpolates a 21-point
  quantile ladder instead.

If you drop this in expecting numbers that match your engine, they will not.

**Three spec lines are missing entirely**, blocked by fields this FMP plan does
not return:

| Spec line | Blocked on |
|---|---|
| Levered FCF Growth (Growth #11) | `cash-flow-statement` has no `longTermNetDebtIssuance` or `preferredDividendsPaid` |
| Levered FCF Margin (Profitability #3) | same two fields |
| ROIC Consistency 5Y (Profitability #19) | annual `key-metrics` returns only `returnOnEquity` and `earningsYield` |

**Every statement is annual, not quarterly.** The app fetches annual statements, so
every year-on-year line is FY0 vs FY−1 rather than the spec's trailing-twelve
against the prior trailing-twelve. Same question, one reporting period of lag.
Moving to quarterly is a second call per statement and touches
`deriveFacts`/`deriveGrowth` in `model.js`.

The one exception is the earnings calendar: `deriveQuarter()` reads actual
against estimate for EPS and revenue out of the `earnings` feed, which is the
only quarterly figure in the dataset. The Overview's bull/bear case is built on
it; nothing graded is.

---

## 6. Porting the data layer

The app is FMP-shaped in exactly two places:

- **`assets/js/fmp.js`** — the feed catalogue. 27 entries, each `{ path, params,
  pick }`. This is the only file that knows a URL.
- **`assets/js/model.js`** — `deriveFacts`, `deriveForecast`, `deriveHistory`,
  `deriveMomentum`, `deriveValuation`. The only file that reads a vendor field
  name.

Everything downstream consumes `a.facts.*`, `a.forecast.*`, `a.history.*`. Point
those two files at your own data source and the rest does not care.

`analyse(ds, { peerRatios, peerGrowth, sectorStats, benchmarks })` is the entry
point. `ds` is a dataset wrapper with `.get(feedName)` and `.symbol`.

---

## 7. Layering

```
index.html                      shell — fonts, stylesheets, #app mount
serve.py                        local no-cache server

assets/css/tokens.css           design tokens; light theme overrides semantics only
assets/css/app.css              layout and components

assets/js/app.js                routing, chrome (rail/tabs/price head), tab panels, settings, boot
assets/js/fmp.js                FMP connector: 34 per-symbol feeds plus the
                                screener, the three calendars and one
                                transcript on demand, caching, plan-gate
                                detection
assets/js/model.js              facts, forecast, history, momentum — the numbers
assets/js/grading.js            percentile -> grade -> letter; the sector lookup
assets/js/factors.js            the factor/subtopic/ratio tree and its explanations
assets/js/valuation-models.js   13 fair-value models (6 multiples, 6 DCF, 1 vendor)
assets/js/gradeview.js          renders a graded factor: tables, pairs, panels,
                                the per-factor tab, and the Ratings tab
assets/js/charts.js             SVG primitives — no chart library
assets/js/snowflake.js          the Vantage Flake radar
assets/js/sections.js           narrative sections — overview, dividend, ownership
assets/js/overview.js           the Overview tab: company head, score card, card grid
assets/js/financials.js         the Financials tab: the three filed statements
                                behind an Income / Balance sheet / Cash flow
                                strip, six to eight cards each — nothing graded
assets/js/statistics.js         the Statistics & Metrics tab, four panels
                                behind a strip: 263 current figures in twenty
                                filterable groups, a Performance panel of seven
                                trend charts, and a panel each for revenue by
                                segment and by geography — nothing graded.
                                Changes print green up and red down; levels
                                are never coloured
assets/js/forecast.js           the Analysts Forecast tab: consensus estimates
                                with CAGR bands, price target, ratings mix,
                                surprise history, the vendor scorecard, last
                                quarter
assets/js/dividends.js          the Dividends tab, two panels: the dividend
                                (yield history, cover, growth, projection,
                                record) and everything returned to
                                shareholders, buybacks included
assets/js/transcripts.js        the Transcripts tab: the index of earnings
                                calls with each quarter's surprise beside it,
                                and one call opened — written summary, full
                                text, and the quarter as a run of bars.
                                Upper-plan feed; the snapshot bundles one call
assets/data/summaries.json      written summaries of earnings calls, keyed
                                SYMBOL|year|quarter. Read from the transcript
                                by hand — the report ships no model — and each
                                one prints its byline above the summary
assets/js/news.js               the News tab: two streams kept apart — the
                                press, and the company's own releases — a
                                coverage summary with the price over the same
                                window, and a masthead count. Nothing on it is
                                scored, ordered or sentiment-tagged
assets/js/research.js           the Research tab: an equity research report in
                                the Morningstar shape. Five ratings (star,
                                uncertainty, moat, capital allocation, style
                                box) and a generated narrative. The ratings
                                model is exported separately from the view.
                                Read the header comment before touching it —
                                what is Morningstar's arithmetic and what is
                                ours is the whole point of the file
assets/js/shariah.js            the Shariah screen — the model both the Overview
                                card and the Shariah Compliance tab read
assets/js/taxonomy.js           the research taxonomy: seven editorial
                                categories, their article types, themes, the
                                query object and the pure matcher/sorter. No
                                DOM, no fetching. The one place a category or
                                an article type is defined
assets/js/articles.js           the article store — the seam between the feed
                                and wherever articles come from. `loadArticles`
                                / `queryArticles` / `articleBySlug`, plus the
                                company directory the taxonomy derives sectors
                                and industries from. `queryArticles` returns a
                                *page* and a total, which is the signature a
                                server-side query has
assets/js/feed.js               the Research feed at `?view=research&sub=latest`
                                and the components both editorial surfaces
                                share: the article card and row, the ticker
                                link, the two rating chips, the pills and the
                                extra-filters drawer
assets/js/articlepage.js        one article at `&sub=article&slug=…` — the
                                typed body blocks, the two-ratings card, the
                                subject companies, the topic links and Related
assets/data/articles.json       SAMPLE editorial fixtures — thirty articles
                                across all seven categories. Real tickers,
                                realistic figures, nothing live. The feed
                                prints a standing notice saying so
assets/js/calendar.js           the Calendar off the rail: earnings, dividends
                                and splits, a week of company tiles at a time
assets/js/ideas.js              the Investment Ideas **engine and data**: the 25
                                portfolios, their rules, the filter registry
                                and `runIdea`. No longer renders the index —
                                it still renders one screen's results, which
                                `screens.js` also uses
assets/js/portfolios.js         the Investment Ideas **pages**: the portfolio
                                directory at `?view=ideas`, and one portfolio
                                as an adjustable screener at `&idea=<key>`.
                                Neither this nor the Calendar is about one
                                company; every other surface is
assets/js/alpha-signals.js      the Alpha Signal vocabulary: the signal and
                                source factories, the eleven categories, the
                                five provenance badges, freshness decay.
                                `signal()` throws on a claim with no source,
                                no calculation or no data quality
assets/js/alpha-providers.js    eleven signal adapters, one per category. The
                                Alpha Signal's own `model.js` — the only file
                                in the feature that reads a vendor field name
assets/js/alpha-score.js        the weights, the reduction, coverage, the
                                coverage-capped confidence, ten archetypes
assets/js/alpha-narrative.js    the written summary, assembled from signal
                                fields. No language model is involved
assets/js/alphaview.js          components both Alpha surfaces share
assets/js/alphatab.js           the Alpha Signal tab on a company report
assets/js/alphadesk.js          the Alpha Signal desk at `?view=alpha`
assets/js/ui.js                 shared building blocks — cards, notices, stat rows
assets/js/util.js               formatting and DOM helpers

assets/data/AAPL.json           bundled snapshot, so the app works with no key
assets/data/sector-stats.json   sector percentile table — SEEDED, see §3
assets/img/                     brand marks

tools/build_sector_stats.py     measured distributions from FMP — incomplete, see §3
tools/make_seed_stats.py        the modelled fallback shipped here
tools/test_alpha.mjs            50 checks over the Alpha Signal engine
```

The layering is deliberate: `fmp.js` is the only file that knows a URL,
`model.js` the only one that reads a vendor field name, `grading.js` the only
one that turns a number into a grade, `gradeview.js` only formats.

**Adding a ratio** means touching `factors.js` alone — a definition in `METRICS`
and its id in a group's `metrics: []` — plus one line in `model.js` if the
underlying figure is not already derived, and a shape in
`tools/make_seed_stats.py` so it has something to be ranked against.

---

## 8. Conventions

Worth knowing before you or an assistant edits this.

- **No framework, no build step, no dependencies.** Keep it that way unless
  there is a reason; the whole point is that a file edit is the whole loop.
- **Syntax-check as a module, not as a script.** `node --check foo.js` will
  pass a file the browser refuses: it fell back to script parsing and accepted
  a string literal broken across two real newlines, which the browser rejected
  with a bare `SyntaxError: Invalid or unexpected token` and no file name. Copy
  to `.mjs` and check that instead:

  ```bash
  cp assets/js/ideas.js probe.mjs && node --check probe.mjs && rm probe.mjs
  ```

  Every module in this repo parses clean that way as of 2026-09-11.
- **Charts are hand-rolled SVG** in `charts.js`. `columnChart`, `lineChart`,
  `multiLineChart`, `sankeyChart`, `percentileStrip`, `valuationRangeChart`,
  gauges and donuts. They take data and return a detached node.
- **Comments explain *why*, not what.** Several encode decisions that look
  arbitrary until they bite — why the sector median is the middle rung of a
  quantile ladder rather than the median of its entries, why net debt comes from
  the vendor's enterprise value rather than the balance sheet, why a reading line
  sits at 220px. Read them before "simplifying".
- **Every figure on screen states what it is measured against.** A tick with no
  stated basis is a bug; there is a helper (`vs()` in `factors.js`) that handles
  the graded and ungraded cases.
- **Fair values are never graded.** All 13 valuation models are display-only, by
  decision — a model is a set of assumptions the reader picks, and letting a
  chosen assumption move a sector-relative grade makes the grade mean something
  different per reader.

---

## 9. Known gaps

- **Sector distributions are modelled.** §3.
- **`build_sector_stats.py` is 24 metrics short.** §3.
- **The spec's weighting engine is not implemented.** §5.
- **The Alpha Signal weights are unvalidated and there is no backtest.** §22.
  The app stores nothing between sessions, so there is no score history to test
  against. The feature makes no performance claim of any kind.
- **Six Alpha Signal categories are partly dark.** §22 lists them: consensus
  estimate revisions, contracts and backlog, patents and approvals, job
  postings, search attention, and corporate actions. Each is reported on the
  page as a named gap that lowers data coverage, never approximated.
- **Three spec ratios are blocked by the data plan.** §5.
- **Annual, not quarterly.** §5.
- **Column-chart bars are not labelled** — a multi-series column chart relies on
  its legend rather than labelling each bar in place. Outstanding.
- **Company identity details were removed** with the "Other Information" section
  (exchange, ISIN, CIK, listing date, head office). The data is still in
  `a.facts`; nothing renders it.
- **The Investment Ideas page is live but unverified against the API.** It is
  reached from the rail (`?view=ideas`, one idea at `&idea=<key>`) and is the
  only surface that is not about a single company. It calls FMP's
  `company-screener`, which nothing else in this repo uses, and **that call has
  never been made** — there was no API key available when it was written, so
  the endpoint path, its parameter names and its response field names are all
  taken from the vendor's documentation rather than observed. The first person
  with a key should run one idea and check `fetchScreener` in `fmp.js` and the
  `field()` accessors in `ideas.js` against what actually comes back — in
  particular whether the screener honours `limit` above a few hundred, since
  the universe asks for 5000. Everything downstream of the screener — the
  per-candidate feed pulls, `scoreLite`, `dedupe`, the rendering — uses feeds
  and code paths that have been exercised against the bundled snapshot.

- **Ideas are editorial and unbacktested.** The forty in `IDEAS` are
  hand-written theses with round-number thresholds, chosen because they are
  defensible rather than because they were tested. This repo runs no backtest.
  Rewriting them is meant to be a data edit, and `IDEA_GROUPS` in `nav.js`
  decides how the index sections them.

  Two of them — `us-tech-top15` and `us-value-top20` — have a different shape:
  `ranked: true` means the universe (plus any rules) decides eligibility and
  the composite score decides the holdings, capped by `resultLimit`. A ranked
  idea may carry rules or none at all. `budget` overrides `REQUEST_BUDGET` for
  one idea, which the value screen uses: candidates are taken largest first
  and the largest companies are the least likely to be cheap, so that screen
  samples against itself and needs a deeper sample than a sector screen does. That is
  how the published retail "AI portfolio" strategies are built — an
  eligibility layer, a model that ranks inside it, a holdings cap — and the
  eligibility layer is the only half that reproduces. Their ranking learns
  weights from decades of realised forward returns; `scoreLite` is an
  equal-weighted percentile rank against the sector as it stands today, and
  is not trained on anything. The card says so rather than implying the two
  lists are comparable.

  They cover the screen archetypes the retail research products are built on —
  discount to fair value, insider buying, closely-held growth, forecast
  earnings growth, growth at a reasonable price, mid-cap momentum, dividend
  cover, balance-sheet strength.

  **This used to say they were not a copy of any competitor's catalogue and
  carried no competitor's branded strategy names. As of 2026-09-11 that is no
  longer true, by decision.** The fourteen under **Featured screens** are named
  after Seeking Alpha's published presets — *Top Rated Stocks*, *Top Yield
  Monsters*, *Stocks by Quant* and the rest — so that a reader arriving from
  that product finds what they are looking for under the name they know it by.

  What is **not** copied is the arithmetic. Those thresholds are not published,
  so every rule under Featured screens is ours and is argued for in the idea's
  own `note`, exactly like the other twenty-five. The names are a map, not a
  claim that the screens agree. If you are uncomfortable with the naming, the
  fix is a one-line `title` edit per idea and nothing else moves — which is why
  they were built as ordinary entries in `IDEAS` rather than as a special case.

- **Nine bags, five of them derived.** `BAG_FEED` maps a bag to a feed and
  `BAG_SHAPE` to the builder that shapes it. `dcfFromFeed`, `insiderFromStats`,
  `floatFromFeed`, `estimatesFromFeed` and `gradesFromFeed` live in `model.js` with the rest of
  the vendor-field knowledge, and all four are checked against the bundled
  AAPL snapshot: fair value 140.71 against a 309.35 price (a negative
  discount, so AAPL correctly fails that screen), insiders net sellers of
  1.19m shares over four quarters, 0.12% closely held, and consensus EPS
  growth of 9.6% a year across 2026-2030 from 30 analysts.

- **A screen is the best of a sample, not of the market.** FMP screens
  server-side on size, sector and country but not on ratios, so every rule runs
  in the browser over a capped candidate list taken largest first. The cap is
  derived from `REQUEST_BUDGET` (600) divided by the feeds that idea needs —
  300 companies for a ratios-only screen, 150 for one that also needs price
  history. Raising the budget widens every screen and consumes quota linearly.

- **`scoreLite` in `model.js` is a second, cheaper path into the grader.** It
  grades up to 59 metrics from four feeds instead of 77 from twenty-seven,
  using the same metric definitions, `better` directions and sector
  distributions. Six of the ideas screen on its per-factor scores. Checked
  against the bundled AAPL snapshot it reproduces the report's profitability
  score exactly (3.95) and its valuation and momentum scores within 0.2; health
  comes out lower (2.18 against 2.79) because the lite path can fill 14 of that
  factor's 23 ratios. That gap is the whole reason every score on the page
  prints the ratio count beside it. `PEER_SAMPLE_FIELDS` is deliberately
  untouched — widening it would move a number already on the Competitor
  Ranking.

- **The screener returns listings, not companies.** `dedupe` in `ideas.js`
  collapses second listings by the ticker before its exchange suffix
  (`NVDA.NE` -> `NVDA`) and share classes by a normalised company name
  (`GOOG` beside `GOOGL`, `BRK-A` beside `BRK-B`). The name pass could in
  principle merge two genuinely different companies, so the count it removes is
  printed under every result. It is exported and pure, and it is the one part
  of that module testable without an API key.

- **All sixteen tabs are live.** `PLAIN_TABS` in `app.js` maps a tab label to
  the renderer that builds its panel — every one of those takes `(a, nav)` and
  returns an `.ovw` card grid. `FACTOR_TABS` maps the five factor labels onto
  `factors.js` keys, Overview is separate because it also owns the head above
  the tab strip, and Analysis is the long report. `LIVE_TABS` is now the whole
  of `TABS`, but it is kept as its own binding because `buildTabs` still greys
  anything absent from it — that is the mechanism a seventeenth tab gets added
  through.

- **The Research tab leads with the quant rating, not a star rating.** The
  headline rating is the report's own composite — `quantRating()` in
  `research.js` reads `a.scores` and gives it a verdict word, a letter, a score
  out of five and a factor breakdown. It computes nothing new; `gradeAll` had
  already done the work for every other tab.

  **Say what enters it carefully.** Price *does* enter the quant rating: the
  Valuation factor is eighteen price-based multiples ranked against the sector.
  What never enters it is a **fair value estimate**. That distinction is the
  whole of the standing "no fair value ever feeds a grade" rule in §8, and it
  is easy to overstate into "no price enters it", which is wrong. The comments,
  the on-page notice and the methodology card all state it the careful way; if
  you edit one, edit all three.

  `valuationZone()` is the separate reading that does use a fair value — the
  price against the median of the thirteen models, banded by the uncertainty
  rating, reported as undervalued / fairly valued / overvalued. The band ladder
  is Morningstar's published margin-of-safety table, used unchanged (a 20%
  discount at Low widening to 75% at Extreme; a 25% premium widening to 300%),
  because it is a sensible scale and there was no reason to invent another. It
  feeds nothing but the zone.

  The two readings answer different questions and Apple is the worked example:
  Valuation grades C- because the multiples are dear *against Technology
  peers*, and the zone reads Overvalued because the price sits above thirteen
  models of *intrinsic value*. Two independent findings that happen to agree.

  **Everything else on the tab is ours and is backward-looking.** The fair
  value is the median of thirteen models rather than one analyst's DCF; the
  uncertainty rating is six measured drivers rather than scenario analysis; the
  moat rating counts how many of the last ten filed years earned more on
  capital than that capital cost, where Morningstar's is a forecast about the
  next ten or twenty. The methodology card states each difference in a table.
  If you change a threshold, change that card too.

- **The long-form narrative comes from a language model, through one seam.**
  `assets/js/narrative.js` owns it, and it is the file to read before touching
  any of this.

  `buildBrief(a, ratings)` reduces the analysis to the ~90 figures the prose is
  allowed to cite, **pre-formatted as strings**. That is the load-bearing
  decision: a model handed `0.27618604910212224` rounds it five different ways
  across five paragraphs, and one handed `"27.6%"` quotes `"27.6%"`. The tables
  render through the same helpers, so prose and tables agree by construction.
  The prompt's first rule is that every number must appear verbatim in the
  brief — **the model is given numbers and asked for prose, never asked for a
  number.**

  `fetchNarrative(a, ratings)` resolves in order: a configured endpoint
  (`localStorage["mazvantage.narrative.endpoint"]`), then the bundled
  `assets/data/research.json`, then null and the caller falls back to the
  deterministic short-form prose still in `research.js`. `validate()` drops any
  section that comes back malformed, per section, so a truncated response
  degrades one section rather than the page.

  **Only AAPL ships a narrative** — about 2,800 words, written by Claude Opus 5
  against the bundled snapshot, as the reference the format is defined by.
  Every other ticker renders the generated short form and the byline says which
  is which. The narrative quotes figures that were true when it was written and
  will not follow a live price; `basis` in the JSON records what they were.

  The endpoint has to be **your** service, not a model vendor directly — the
  browser cannot hold an API key and this app has no backend. The "For the
  developer" block at the foot of the tab copies the exact payload for the
  company on screen.

  **When you regenerate, re-check the figures.** The prose was verified by
  extracting every `US$…`, `…%` and `…x` token from it and asserting each
  appears in the brief; that caught nineteen mismatches on the first pass,
  nearly all of them trailing-zero differences (`43.0%` where `pct()` prints
  `43%`). Worth repeating as a test.

- **Two news feeds, deliberately not merged.** `news` is `news/stock` (what
  other people wrote) and `pressReleases` is `news/press-releases` (what the
  company said about itself). They are separate feeds, separate streams behind
  a strip, and separately labelled, because the difference between reporting
  and self-description is most of what a reader is judging. The News tab
  applies no sentiment, no ranking and no per-story price attribution — the
  price chart spans the whole news window and says so. The `news` feed limit
  went from 12 to 100 when the tab was built; the Overview's teaser only ever
  needed a handful.

---

## 12. The rail navigation and the pages behind it

`assets/js/nav.js` owns two things: **what the destinations are** and **the rail
that opens them**. No page content lives there. `NAV` is nine menus; the router
in `app.js` reads `NAV_VIEWS` from it, so the menu and the allow-list cannot
drift apart.

The nine menus sit in the **left rail**, above a short shortcut group, and each
opens a flyout to the right **on hover**. `buildRailNav()` returns the `<nav>`;
`buildSideNav()` in `app.js` wraps it with the brand and the shortcuts.

### The routing model

Two kinds of URL, and only two:

| URL | What it opens |
|---|---|
| `?symbol=AAPL&tab=research` | A company report, with a tab |
| `?view=markets&sub=gainers` | A page that is not about a company |

There are **nine** menus. `?view=` dispatches through `NAV_PAGES` in `app.js`
to one renderer per page;
that renderer dispatches on `sub`. A missing or unrecognised `sub` falls back to
the page's first section, so a stale link lands somewhere real. `calendar` predates the bar and keeps its own slug.

`ideas` used to as well, and that was the one place `goView(view, arg)`'s second
argument meant two different things — an idea key there, a section everywhere
else. Investment Ideas became a rail menu with its own sections, so `arg` is now
always the section and a portfolio travels in the third argument as
`{ idea: key }` like any other page state. The special case is gone.

One nav item carries `hidden: true` — Research → Article. It is routable
(`hasSub` accepts it) but absent from the flyout, from the section strip and
from `defaultSub`, because it is reached by clicking a card rather than by
choosing a section. That is the mechanism any future "one of these" page
should use.

Three nav items carry `symbolTab` instead of `sub` — Stock Analysis, Valuation,
Dividends. Those are tabs on the company report that already work, so the bar
sends the reader there via `goSymbolTab()` rather than building second copies.
The menu marks them "on the report" so the click is not a surprise.

### How the hover menus work

Hover opens, with two delays that are the difference between a menu and a
twitch: `OPEN_DELAY` (110ms) so sweeping the pointer down the rail does not fire
nine menus in turn, and `CLOSE_DELAY` (240ms) so a fast diagonal from the item
to the panel does not lose it. The panel is a DOM child of its group, so moving
into it never fires `mouseleave` at all, and `.railmenu::before` bridges the
8px gap the panel's own margin opens up.

**Hover does not exist on a touch screen**, so clicking a rail item *navigates*
to that page rather than toggling its menu. Every page then repeats the same
sections in a strip across the top, which is how a touch reader reaches them.
Keyboard focus opens the flyout; Escape closes it.

### Two traps, both already hit

**1. `overflow` clips flyouts.** The rail is `overflow-y: auto`, and CSS
computes the *other* axis to `auto` the moment one axis is not `visible` — so an
absolutely positioned flyout inside the rail is clipped at its right edge. The
panels are therefore `position: fixed`, placed by `place()` against the
trigger's measured rect and clamped to the viewport (which also gets the
bottom-edge flip that the eleven-item Sectors menu needs). The same trap killed
the earlier horizontal bar; do not reintroduce it.

**2. The rail's listeners must be disposed.** `buildRailNav` attaches a
`keydown` on `document` and a `resize` on `window`, and the rail is rebuilt on
every navigation — so `chrome()` calls `dispose()` on the previous rail first.
Verified at zero leaked listeners across ten navigations.

### One bug worth remembering how it was found

`goView(view, arg)` was renamed from `goView(view, idea)` but its `pushState`
still referenced `idea`, so **every navigation click threw** a `ReferenceError`
— silently, because an exception inside an event listener never reaches the code
that dispatched the click.

It survived a full "all 43 pages render" sweep because that sweep drove the
router directly with `history.pushState` + a synthetic `popstate`, never through
the UI. **Test navigation by clicking the actual elements**, or the entire
click path goes unexercised.

### What each page actually is

| Page | Sections | What it reads |
|---|---|---|
| Markets Data | 10 | The overview hub, the Market Indices and Futures boards, the asset-class pages (equities, funds, economy), the sector/industry snapshots, and the three mover lists — routable but no longer in the menu. See §19. **ETF Market** (`&sub=etfs`) is the one with tabs: Overview, ETF Tables, Beat the Market, News; **Stocks** (`&sub=stocks`) carries Beat the Market beside Overview, Quotes, Sectors and News, and both mount the same `beatmarket.js` block. Its screener was a fourth tab until it became its own view; `&board=screener` still lands on that page |
| Market News | 6 categories + 4 kept routes | The general and stock news wires, the ETF/index/futures matchers, and a quote rail |
| Stock Screener | 7 | A directory of every listed company, screens via `runIdea()`, and two pages that point elsewhere |
| ETF Screener | 1 + 15 collections | `?view=etfs` — the same screener pointed at funds. Split out of the Stocks menu: a company is scored against its sector, a fund is selected from a listing, and one menu for both said they were the same thing |
| Investment Ideas | 1 index + 11 groups | 40 portfolios, each openable as an adjustable screener. See §18 |
| Sectors | 1 index + 11 | Sector performance, the screener, plus `sector-stats.json` |
| Research | 2 + 1 hidden + 5 links | The editorial feed (default), Investing Strategy, and one article behind `&sub=article`. See §17 |
| Earnings | 3 tabs, 6 screens | `earningsdesk.js` — the calendar as one table (Upcoming, Reported, EPS beats/misses, Revenue beats, Double beats) over a 7/14/30/90-day window, joined to one screener call for name, sector and size; plus the transcript library and the method. `&sub=insights` still lands on the screener |
| Quant | 4 tabs, 8 screens | One canvas, one table. The eight screens are existing `ideas.js` entries under this menu's names — `stocks-by-quant`, the five `score-<factor>` screens, `top-quant-dividend-stocks` and `score-all-round` — so a threshold here can never disagree with a portfolio page. Plus the rating explained, the five factors, and one honest refusal |
| Shariah | 4 tabs, 5 screens + the fund board | `shariahdesk.js` — one table, the five AAOIFI screens as a rail (definitions in `shariah-screens.js`, registered in `screener-presets.js`), plus methodology, purification and the compliance-change refusal. The old five slugs each open their own screen. |


### The three things that are deliberately not built

These are listed so nobody spends a day discovering why. There were four; the
**Stock Screener** is no longer one of them — see item 3 and §18.

1. **Quant → Rating Upgrades / Downgrades.** A rating change needs yesterday's
   rating. Nothing is stored between sessions — every score is computed in the
   browser and discarded on reload. The tab says what it would take: a nightly
   job, a table, a diff endpoint. Both menu items land on the one **Rating
   Changes** tab, because an upgrade and a downgrade are the same missing
   feature explained once.
2. **Shariah → Compliance Changes.** Same storage problem. Both ratios move with
   the market price as well as the balance sheet, so a company can cross the
   line without filing anything, which is exactly why the list would be worth
   having once there is somewhere to write to.
3. ~~**Stocks → Stock Screener**~~ — **built**, and not where you would look for
   it. The query builder is the *portfolio page*: every screen on Investment
   Ideas renders its rules as controls, and clearing them leaves the blank form.
   Stocks → Stock Screener still points there, but now because that is where the
   screener is rather than because there isn't one. The page carries a "Start
   from an empty screen" button that opens a portfolio with `f=` empty. §18.
4. **Stocks → Stock Comparison** points at the peer table on the company report,
   which already compares against a whole peer set with sector percentiles.

### The one thing to be careful about on Markets Data

`biggest-gainers` returns **whatever traded** — leveraged ETFs, SPAC rights,
warrants and sub-dollar shells alongside real companies, and the feed carries no
fund flag. `looksLikeStock()` in `markets.js` filters on name and ticker
patterns, the count it removed is printed, and the unfiltered list is one click
away. It is deliberately conservative and will occasionally drop a real company
whose name contains one of the words.

### Market News: one stream, and three kinds of category

The page is a topic strip over a single column of stories with a quote rail
beside it — publisher, hour, headline, the vendor's own summary, the symbols the
story was filed under, the publisher's picture. The strip carries the six the
market is read by: **Latest, Stocks, ETFs, Indices, Futures, Economy.**

Every category **leads with its latest four**: `featuredNews()` in
`markethub-ui.js` gives one story the room to be read and stands three
headlines beside it behind a rule; the rest of the wire runs under it as the
rows every other page prints. The same component builds the front page's block,
with three cards under the lead and four headlines beside it — one layout, two
shapes, so the two pages cannot drift apart.

The **ticker chip** on a story is the symbol the wire filed it under plus what
that symbol did, which the wire does not carry: each block asks for one batch
quote covering the handful of symbols on screen, draws without it, and fills the
chips when it lands. A chip with no quote is still a chip — it just says less.

FMP publishes two wires — the market-wide firehose and the stock wire, which
tags every story with the symbol it is filed under — and **no topic
classification at all**. So a category is one of three things, and the coverage
block under the stream always says which:

| Kind | Categories | What it is |
|---|---|---|
| A wire, unfiltered | Latest, Stocks | Both wires merged and de-duplicated by URL, or the stock wire alone |
| The vendor's tag, or a name match | ETFs, Indices, Futures | The same `marketNews()` matchers the market boards read, so a story files under a fund, an index or a contract exactly as it does there |
| A keyword filter | Economy | The market-wide wire kept to rates, prices, jobs and output — the pattern is printed under the stream |

**The four topic filters are still filters.** Earnings, Dividend, M&A and
Analyst Ratings are regex searches over a wire, not vendor categories, and each
still prints its pattern, what it misses and what it over-catches. They are
searches over headlines rather than parts of the market, so they left the strip
and kept their routes — `&sub=earnings` and the other three still land, as does
`&sub=stock`, the old name for Stocks. Do not present any of them as a vendor
category.

The rail is context, not content: what the market did while those stories were
being written. Five blocks — the country's index board, the session's gainers,
losers and most active, and a **stocks calendar** — and it says quotes may be
delayed. The calendar is two feeds under one heading, because a reader watching
the week wants both and the rail has room for one block: the week's earnings
load with the rail, and the week's ex-dividend dates are fetched the first time
that tab is clicked, since a request for a list nobody looked at is one this
page should not make. Both keep one line per company and only US listings — the
calendar feed carries the same report on three exchanges, and five rows is no
place for the Swiss line of a US company's results.

### The Calendar collapses cross-listings

A week of the earnings calendar carries the same company three or four times:
the US line, the Swiss one, the German one, and a London depositary. The
`Listings` filter defaults to **One per company**; `Every listing` turns it off.

`dedupeEvents()` in `calendar.js` runs two passes, because the duplicates come
in three shapes and the symbol only identifies two of them:

| Shape | Example | Caught by |
|---|---|---|
| Same root, another exchange | `ADBE` / `ADBE.SW` / `ADBE.DE` | ticker root |
| Share class or second US line | `LEN` / `LEN-B` | ticker root |
| A different ticker entirely | `LEN` / `0JU0.L`, `HAIN` / `0J2I.L` | event fingerprint |

The third shape is the interesting one. The feed carries **no company name** —
only a symbol, a date and the figures — so nothing in `0JU0.L` connects it to
Lennar. What does connect them is a revenue estimate of exactly 8,318,685,000
on the same day: a ten-digit figure agreeing to the dollar is as good as an
identifier. `fingerprint()` therefore keys earnings on date plus revenue, and
dividends on date plus amount plus payment date. Splits get the root pass only
— half a dozen unrelated companies can run a 2-for-1 on the same morning.

Three deliberate limits:

- **EPS is not in the fingerprint.** It is quoted in the listing's own
  currency, so Lennar's London line reports the same revenue and a different
  EPS.
- **Warrant lines are left alone.** `RVSN` and `RVSNW` stay separate, because
  stripping a trailing `W` would fold `LW` into `L` and `TW` into `T`.
- **It fails visibly.** Where the vendor's two estimates differ even slightly
  (`KIE.L` and `KIERF`), the pair survives as two rows. A duplicate on screen
  beats a company silently hidden, and the count of what *was* merged prints
  under the week.

Dedupe runs **after** the market filter, not before: with a market chosen the
reader is asking for that market's listings, and collapsing them onto a primary
line somewhere else would empty the very filter they set.

The survivor carries `alsoListed`, which the tile puts on its tooltip, so a
reader who wonders where the Swiss line went can see it was merged rather than
dropped. Rows are copied before merging — the week is cached and redrawn on
every filter change, and writing onto the cached rows would accumulate
`alsoListed` across draws.


### The Sectors section has two levels

`?view=sectors` is the **breakdown** — all eleven on one page — and
`?view=sectors&sub=technology` is one sector. A bare `?view=sectors` opens the
breakdown because `Sector Breakdown` is the first item in the menu and
`defaultSub()` returns the first item with a `sub`.

The breakdown is a twelve-column table, and it mixes three sources that must
not be confused with each other:

| Columns | Source | Needs a key |
|---|---|---|
| Stocks, median net margin, median composite | `sector-stats.json` | no |
| ETF, AUM, fee, 1D/1M/6M/YTD/1Y | the tracking SPDR ETF | yes |
| "How they moved today" bars | the vendor's sector snapshot | yes |

**Returns come from the ETF, not from averaging members.** `SECTOR_ETF` in
`nav.js` maps each sector to its SPDR fund, and `etfReturns()` pulls thirteen
months of closes plus `fetchEtfInfo()`. That is what "the sector was up 12%"
means — capitalisation-weighted — whereas the vendor's snapshot averages
members equally. The two disagree on any day the megacaps move against the
tail, so they sit in different places on the page and each says which it is.

`SECTOR_ETF` moved out of `app.js` when this was built: the report's momentum
benchmark and the breakdown both read it, and two copies would drift.

`fetchEtfInfo` is deliberately **not** in `FEEDS`. `loadDataset` walks that map
for every company, and a sector fund's assets under management is not a fact
about a company — it would be one wasted request per report. It also retries
one alternative path on a 404, because a wrong endpoint here fails silently as
an all-`n/a` column rather than as anything anyone would notice.

**`rankBody()` refuses to rank when there is nothing to rank.** The shipped
seed table gives every sector the same curve, so all eleven medians come out at
2.50 and a numbered 1-to-11 list would dress an arbitrary sort order as a
finding. Below a spread of 0.05 the card says what it is looking at instead.
Once the real builder has run, the ranking appears on its own.

### The sector page

Seven cards, in the order a sector page wants to read:

1. **What the sector is** — a written blurb (`SECTOR_BLURB`, definitional not
   analytical), company and industry counts, sector market cap, tracking ETF.
2. **Sector vs. the S&P 500** — both rebased to the start of the window, with
   a 1M/6M/YTD/1Y/5Y selector and a fixed-horizon table underneath.
3. **Industries in the sector** — weight by market capitalisation, not by
   count, plus the vendor's session change per industry.
4. **Top 50 largest companies** — with market weight, and grades on request.
5. **The sector ETF** — AUM, fee, holdings, YTD, one year.
6. **The distribution** every grade in the sector is measured against.
7. **Every sector**, to move on.

**One screener call feeds cards 1, 3 and 4.** It returns every listed company
in the sector with a market cap, an industry and a day change, which is enough
for the counts, the industry mix, the weights and the top fifty without asking
again. `buildUniverse()` does that derivation once and hands the result round.
Cross-listings collapse through the same `dedupe()` the screens and the
calendar use — a company holding three lines would otherwise be counted three
times in the industry mix and take three of the fifty.

Grading the fifty is two feeds per company, so it sits behind a button. Those
grades are `scoreLite`, the reduced set, not the full report grade, and the
footnote says so.

**Two things deliberately not copied from the reference.** Seeking Alpha shows
an ETF dividend yield and P/E — FMP's `etf/info` carries neither, and both are
computed from the fund's holdings, which is a separate walk per ETF. And their
"ways to invest" lists five funds per sector; this shows one, because nothing
in the data plan produces a defensible list of every fund covering a sector and
a hand-written one would go stale and read as a recommendation.

### The return-key trap

`computeReturns(pts, RETURN_SPANS)` keys its result **by the span's own name** —
`'1M'`, `'1Y'`, `'5Y'`. Only `returnsFromPrices` produces the `r1m` / `r1y`
shape, because it passes its own span map. Reading `r.r1y` off a
`RETURN_SPANS` result returns `undefined`, which renders as `n/a` in every
cell — a silent, whole-column failure that looks exactly like missing data.
This was written wrong first time and caught by checking the key names rather
than by looking at the page.

A span the history is too short to cover is **omitted** rather than
approximated, so the 5Y column legitimately reads n/a on six years of closes
that start late. The footnote under the table says so.

**Counts use `dec(v, 0)`, not `num(v, 0)`.** `num` scales through k/m/b, which
is right for a market cap and wrong for a company count: it rendered both 1,120
and 1,080 as `1k`, making Healthcare and Financial Services look identical and
tiny. Anywhere a figure is a count of things, `dec` is the formatter.

---

## 14. Pings on the price chart

**All three price charts** mark when insiders and funds bought or sold — the
Overview's price performance card, the Analysis tab's price history, and the
Research tab's price-against-fair-value. **Timing only**: nothing is scaled by
size, because the question a ping answers is "when", and a marker sized by
value invites a reader to compare a 1,439-share sale with a 900,000-share one
on a chart that is about neither.

`lineChart` takes a `markers: [{ date, kind, label }]` option; `drawMarkers()`
in `charts.js` snaps each to the nearest charted close by binary search,
buckets by (point, kind) so a day with six filings draws one glyph, and binds
the tooltip.

`assets/js/pings.js` owns the legend, the toggles and the loading, and exists
for one reason: **the fund markers cost eight requests**, and three charts each
fetching their own would cost twenty-four. `FUND_CACHE` memoises the promise
per symbol, so whichever chart the reader presses the button on, the other two
get the answer free — the button on the others then reads "Show fund positions"
rather than "Load".

`createPings(a, { onChange, compact })` returns `{ legend, note, markers }`.
The caller owns its own redraw: `onChange` fires when a toggle flips or the
fund pull lands, and the chart re-renders with `markers()`. The Overview card
passes `compact` and leaves the note out — it is two-thirds width beside the
key statistics, and every chip carries the same caveat in its `title`.

### Two shapes, and the difference is the whole point

| Shape | Source | What the date means |
|---|---|---|
| **Triangle** | Form 4 | The day the trade happened |
| **Diamond** | 13F | The quarter **end it was reported for** |

A 13F says what a manager held on the last day of a quarter. It does not say
when they traded, and it is filed up to 45 days later. Putting a diamond on a
specific day would be inventing a date, so the marker sits at the quarter end
and the hollow shape says the date is a reporting date. Both the legend chip
title and the note under the chart say so in words.

### Only open-market trades are marked

A Form 4 also reports awards, option exercises, gifts and shares withheld to
pay tax on a vesting grant. **None of those is a decision to buy or sell** — an
award is compensation arriving, a tax withholding is a sale the recipient did
not choose. `INSIDER_INTENT` in `model.js` keeps codes `P` and `S` only, and
the note prints how many filings were left off. Counting awards as buying is
how a page ends up showing a "cluster of insider buying" that is one vesting
date.

Index managers are excluded from fund markers for the same reason: BlackRock's
position moves because the index moved. The filter is substring matching on the
filer name and is crude in one known direction — "Vanguard Capital Management
LLC" is a different firm from the Vanguard Group and is excluded with it. That
is the safe way round.

### Cost

Insider markers are free: the dataset already fetches `insiderTrades`, whose
limit went from 20 to 100 when this was built (twenty filings is a couple of
months for a company with a large board). Fund markers are **eight more
requests** — one per quarter — so they sit behind a "Load fund positions"
button rather than loading with the report.

### Two traps hit while building this

**SVG has no z-index.** The hover hit-rect is a transparent rectangle over the
whole plot, appended near the end of `lineChart`. Markers drawn before it are
painted under it and never receive a pointer event, so their tooltips silently
never fire. `drawMarkers` is therefore called *after* `g.append(hit)`.

**The tooltip must print the marker's own date**, not the charted point it
snapped to. `nearestIndex` allows four days of slack so a filing dated on a
weekend still lands on the chart — which means the snapped point's date can
differ from the filing's. The chart's `labelFmt` is also wrong for this: it is
an axis format (`"Aug 26"`) with no day in it, and the day is the part that
matters. Both were wrong in the first draft.


---

## 15. The Earnings menu

Two sections, answering different halves of one question.

**Earnings Call Transcripts** is a library. `fetchTranscriptList()` pulls FMP's
whole coverage list — several thousand rows, about 900KB, one request — and the
page searches it in the browser. **Nothing is listed until the reader types**: a
wall of two thousand tickers is not a starting point. Opening a row goes to that
company's own Transcripts tab, because a transcript is about one company and
there is nothing useful to say about eighty at once.

**Earnings Call Insights** is the arithmetic around the call. The earnings
calendar carries `epsActual` alongside `epsEstimated`, so the last week of
reported results gives a beat/miss scorecard and the largest surprises in both
directions, straight from a feed the app already had.

### What "insight" does not mean

**Nothing here reads a transcript.** No sentiment scoring, no hedging-word
counts, no management-tone reading — FMP supplies none of that and this app runs
no model that could produce it. The page says so in a table rather than leaving
the word "insights" to imply it.

The written summaries are the exception, and they are hand-written and shipped
in `assets/data/summaries.json` with a byline. A call without an entry shows its
transcript alone, which is the same rule `transcripts.js` already follows.

One caveat the scorecard prints: **a beat rate above half is the market's normal
state, not a signal.** Consensus is guided by the companies it measures, and one
expecting to miss usually resets the estimate first. The number worth reading is
the distance from the usual two-thirds.

### Two small changes it forced

`goSymbolTab(tab, symbol)` gained a second argument. It previously used
`symbolFromUrl()`, which is right when the nav bar sends a reader to the report
they already have open — but the Earnings library opens the transcripts for
*whichever row was clicked*.

The Research menu's `Earnings` item was renamed **Earnings Calendar**. With an
Earnings menu in the rail, two items called "Earnings" pointing at different
pages is a trap; the rename costs nothing and the destination is unchanged.

### "Insights" means something else now

Read the two paragraphs above as history. **Earnings Call Insights** was the
beat-and-miss arithmetic, and when the desk was rebuilt as one table that
arithmetic became the screener's surprise columns — so `sub=insights` was
aliased to `screener` and the menu item was hidden.

It is now a tab of its own, and a different thing: **written work on results**.
`insightsTab()` in `earningsdesk.js`, `.ed-ins*` in `deskpages.css`, the menu
item unhidden and renamed **Earnings Insights**, and `TAB_ALIAS` emptied so the
old slug lands on it. An old link still resolves; it arrives somewhere better.

**It is a view of the research store, not a second store.** The taxonomy has
carried an `earnings` category with four types — `earnings-analysis`,
`earnings-preview`, `earnings-surprise`, `guidance` — since the feed was built.
The tab calls `queryArticles({ category: 'earnings', type })` and renders
`articleCard` from `feed.js`, so:

* there is no second schema, no second fixture, and no second definition of
  what an earnings article is;
* an article filed under Earnings appears here *and* in the feed, and cannot
  appear on one and not the other;
* opening one from either surface lands on the same article URL.

The tab deliberately does **not** reimplement the feed's sort, pagination or
eight other filters. It offers the four type chips and a link to
`?view=research&sub=latest&category=earnings` for the rest, because a reader
who wants those wants the feed.

The cards are `.acard`, from `app.css`, unchanged. They render on this desk's
market canvas through the same token remap in `reportcanvas.css` that carried
the company report's fifteen tabs — so a research card needed no CSS of its
own here. Verified in both themes.

The articles that ship are the research feed's **sample fixtures**, so the tab
prints `SAMPLE_NOTICE` under the list, exactly as the feed does. Five are filed
under Earnings today.

---

## 16. The Home page

`assets/js/home.js`, on the market canvas. It is the landing page: a bare URL
renders it, the rail's `Home` — now the **first** item in the rail, above
Markets Data — opens it, and so does the wordmark.

It was a product tour: ten tiles on the `.ovw` grid, built around a company,
ordered by what survived without an API key. It is now the **market's front
page**, which is a different promise and a different rule.

### What it is

| Band | What it carries | Where it comes from |
|---|---|---|
| Banner | Index levels, then the listings moving most | `loadHubSection('indices')` + `most-active` |
| Top stories | The latest eight as one block: a lead with its picture, three cards under it, four headlines beside | `newsStories('latest')` + one batch quote for the chips |
| Lead | The next six as rows, and a Popular rail — trending, gainers, losers | the same wire + the three mover feeds |
| Markets summary | One benchmark charted, the world's majors listed beside it, the four headline US series, three world stories | `indices` + `economy` sections |
| US stocks | Gainers, losers, highest volume, most volatile, then three stock stories | `loadHubSection('stocks')` |
| ETFs | The four fund rankings | `loadHubSection('etfs')` |
| Commodities | Energy and metals, then three commodity stories | `loadHubSection('futures')` |
| Economy | The world **inflation** map and the release calendar as cards | `loadHubSection('economy')` |

Nothing on the page is computed here and nothing is ranked here: every row is
`quoteRow`, every story is `storyRow`, every list is a list the vendor returned
and a page elsewhere already shows. The summary's chart is `marketChart` — the
same one the asset pages use, so its ranges, crosshair and expanded view come
with it — and the **Major indices** list beside it is that chart's control:
picking a row charts it, which is one request rather than a second chart. That is what keeps the front page from
drifting away from the pages it summarises.

### The rule it is built on now

**Sections below the fold are paid for on arrival.** An `IntersectionObserver`
with a 400px margin calls each section's own `load()` once; opening the page
costs the banner, the wire and the rail, and nothing else. The map section
takes the inflation map alone — `economyMaps(data, status, retry, { metrics })`
— because the GDP map belongs to the page that can explain its three bases.

**With no key it says so once.** The market cannot be served from a one-company
snapshot, so instead of nine "connect your key" boxes the page prints a single
connection note and removes the sections entirely.

### Home no longer pays for a dataset

The old Home led with a company, so it had to wait for `analyse()` and was
dispatched late in `render()`. The new one needs no symbol, so it boots the way
every other `?view=` page does — `bootNavPage`, via `BOOT_PAGES` — and draws
before any company load starts. `NAV_PAGES` is untouched: it is still the
router's allow-list of the nine menu pages, and Home is not one of them.

### What renders on a bare URL

```
/                        Home        (neither view nor symbol named)
/?view=home              Home
/?symbol=AAPL            the report  (a company link still opens the report)
/?symbol=AAPL&view=home  Home, spotlighting AAPL
```

The rule is in one line at the top of `render()`: a URL that names neither a
view nor a company is somebody arriving at the product rather than at a
report.

### Nothing on this page is computed here

Every figure comes from the function the corresponding tab already uses —
`researchRatings`, `shariahVerdict`, `sectorRows`, `changeBars`, `moverRow`,
`looksLikeStock`, `createPings`. Three of those had to be exported from
`markets.js`, which is the only change Home made to another module. The point
is that the front page cannot drift away from the pages it summarises: if the
Research tab's valuation zone changes, so does Home's, because it is the same
call.

### Four things caught in verification, worth not re-introducing

**A caption that was a claim.** The chart asked for `SPOTLIGHT_SESSIONS = 504`
sessions — two years, the window the eight quarters of 13F markers cover — and
the caption said "two years of closes". The bundled snapshot ships about *one*
year, so the caption was false on the only data most readers will see.
`spanNote(pts)` now prints both ends of what the chart actually got. The
ceiling is still 504 because `nearestIndex` drops any marker outside the
plotted range **without saying so**, while the legend goes on counting it — so
the caption also says that.

**`hidden` does not hide a card in this grid.** `.ovw > .card { display: flex }`
outranks the `hidden` attribute's UA `display: none`. The analyst-note tile
hides itself on a company with no narrative, and without
`.ovw > .card[hidden] { display: none }` it kept its full-width row as an empty
box. Any future card that hides itself in `.ovw` inherits the fix.

**A class nothing styled.** The valuation word was given `.homezone`, which
existed in the JS and in no stylesheet, so it rendered as body text. It now
uses the Research tab's own `.rzone` scale — which is better than a duplicate
anyway: two pages cannot colour the same verdict differently.

**A modelled count is not a sample size.** `sector-stats.json` carries
`count: 930` for Technology, and the seed carries it too — nothing was
sampled to get it. Printed beside "Modelled seed" it read as evidence. The
method tile now prints `no companies were sampled` whenever the table is
seeded.

### How it was tested

By **clicking**, not by driving the router. Every one of the twenty-one
buttons on the page was `.click()`ed, and the resulting URL, title, rendered
length and error count recorded — plus the two ways in (rail item, wordmark),
the four URL shapes above, the ping toggles, and the outbound news links.
This is the lesson from §12: an exception thrown inside a click handler never
reaches the dispatcher, so a sweep that navigates by `pushState` passes on a
page where every click is silently dead.

---

## 17. The Research feed

`?view=research` now opens an **editorial article feed** rather than the
Investing Strategy page. Strategy keeps its own section and every link to
`&sub=strategy` still lands on it; only what the bare URL opens changed.

Four files, and the split between them is the point:

| | |
|---|---|
| `taxonomy.js` | what an article *can be* — categories, types, themes, the query object, the matcher. Pure; no DOM, no fetch |
| `articles.js` | where articles *come from* — the store, the company directory, the query seam |
| `feed.js` | the feed page and the components both editorial surfaces share |
| `articlepage.js` | one article |

### The data model, and the one idea behind it

**The visible filters are flat. The model underneath is not.**

```
Article {
  id, slug, title, subtitle, summary, body[],
  primaryCategory,        // one of seven
  articleType,            // one of that category's types
  tickers[],              // drives companies[], sectors[], industries[]
  themes[],
  quantRating,            // 0-5; the *word* is derived, never stored
  shariahStatus,          // compliant | questionable | non-compliant | unrated
  standardsPassed, standardsOf,
  author, sourceType, readingMinutes, views,
  publishedAt, updatedAt,
  seoTitle, metaDescription, canonicalUrl (derived),
  stockTab,               // which tab on the company report the piece is about
}
```

Seven categories, thirty-eight article types between them. **Nothing finer than
a type is a type.** "Top Halal Semiconductor Stocks" is not a template and not
a category — it is:

```
primaryCategory: 'shariah'
articleType:     'shariah-idea'
industry:        'Semiconductors'   <- from its tickers, not typed by hand
```

reachable from three different filter paths with no code written for it. Every
time you want to add a category, check whether it is an attribute combination
first. It usually is.

Three consequences worth stating:

- **The type list and the filter list are the same list.** Two lists describing
  the same thing drift — a type gets added, its filter does not, and the
  article becomes unreachable. So every type in a category is a filter chip in
  that category, full stop.
- **Sectors and industries are derived from tickers.** An article never writes
  out "NVIDIA is in Semiconductors"; `COMPANIES` in `articles.js` holds that
  once. It is why the Related and Topics links on an article page cannot
  disagree with the company data.
- **The rating vocabulary is not this module's.** A quant score's word comes
  from `verdictWord` in `grading.js`, and the four Shariah states are *defined*
  as the pass count across the five methodologies in `shariah.js`
  (`shariahStatusFromCounts`). A fixture cannot ship a score and a
  contradicting word, because it does not ship the word.

### The URL is the filter state, and there is no other copy

Every pill, chip, select and page link computes a new query object and hands it
to `nav.goQuery`, which pushes a URL and re-renders. Nothing holds a filter in
a variable.

```
?view=research&sub=latest&category=earnings&type=earnings-analysis
?view=research&category=investment-ideas&sector=technology&shariah=compliant
?view=research&sub=article&slug=is-nvidia-stock-halal
```

That buys shareable filters, a working back button and real landing pages for
free. `goView(view, arg, params)` gained a third argument for it; every
existing two-argument caller is unaffected. `RESEARCH_PARAMS` is spread into
`VIEW_PARAMS`, so a filter never survives a navigation to another page —
import it rather than repeating the list, or a filter added to the taxonomy
and forgotten in `app.js` will quietly filter the next page you open.

The **one** exception is `moreOpen` in `feed.js` — whether the extra-filters
drawer is expanded. It is module-level, so it survives the re-render that every
filter click causes, and it is not in the URL because a shared link should not
carry the state of somebody's disclosure triangle.

`queryArticles` returns a **page and a total**, not a list, even though the
sample store is small enough to filter in a `.filter()`. That is the signature
a server-side query has, and it is why no view above it holds the full article
list. Repointing the store at an endpoint should not touch the feed.

### The articles are sample data and the page says so

`assets/data/articles.json` is **thirty editorial fixtures**, not live content.
Real tickers, realistic figures, nothing generated from a filing. A standing
notice on the feed and on every article says exactly that.

Two exceptions are worth knowing: `apple-june-quarter-thirteenth-beat` and
`is-apple-overvalued-thirteen-models` quote the **bundled AAPL snapshot's own
numbers** — US$309.35 against a US$186.53 fair value, a 2.89 quant rating,
5 of 5 Shariah screens passed — so at least one worked example agrees with what
the company report actually renders. If you regenerate the snapshot, those two
go stale and should be regenerated with it.

**No article uses the `quote` block.** The renderer supports it, and it is for
text quoted verbatim from an earnings call transcript. Inventing a quotation
attributed to a named company's management is a different and worse thing than
inventing a ratio, so the sample store ships none.

### The body is typed blocks, never HTML

`p`, `h`, `metrics`, `table`, `bullbear`, `quant`, `note`, `quote`.
`articlepage.js` is the only file that knows how each draws, and it never sets
`innerHTML` from article content — which matters because the thing that will
eventually write into this store is a language model. An unknown block type
renders nothing rather than throwing.

Blocks route to the **existing** primitives: `table` to `ui.js`'s `table`,
`bullbear` to `.rrgrid`/`.rr--reward`/`.rr--risk` (the Overview's reward and
risk lists), factor letters to `.grade` and `toneForLetter`. A table in an
article and a table on the company report are the same component.

### The internal link graph, both directions

Out of an article: every ticker is a `tickerLink` into that company's report,
at the tab the piece is about (`stockTab`); every breadcrumb is a real filter;
sector, industry and theme link back into the filtered feed.

Into an article: `articlesForTicker()` plus `relatedResearchCard()` are
exported from the store and the feed so a company surface can list research
without importing any of the feed's page code. Two surfaces use it — the
company **Overview** (at the foot of the grid) and the company **News** tab
(under the streams, headed "What it means for the numbers"). Both are slots
that fill after the store loads and stay `hidden` when there is nothing, so the
twelve-column grid never opens a gap.

The News hand-off is deliberately **per company, not per headline**. The
obvious feature is a "Read Vantace analysis" button on the individual story an
article was written from, and that needs the article to record which news item
that was. Nothing does yet, and matching by ticker and date would attach an
article to a story it may have nothing to do with.

### Four things caught in verification

**`[hidden]` loses to an author `display`.** `.fmore { display: grid }` beat the
user agent's `[hidden] { display: none }`, so the filter drawer was permanently
open and its toggle silently did nothing. `.fmore[hidden] { display: none }`
fixes it. Any new component that sets `display` and toggles `hidden` needs the
same line.

**A grid item stretches to its row.** `.apside` was as tall as the article body
— 1,600px for four short cards — leaving the last one floating above several
hundred pixels of nothing. `align-self: start`.

**A `title` can steal the accessible name.** The category pills carried the
category's description as a tooltip, and a screen reader announced the whole
sentence instead of "Earnings". They now carry an explicit `aria-label` of the
label plus the count; the tooltip stays.

**An industry and a theme can print the same word.** A semiconductor company
carries the Semiconductors industry from its ticker and often the
semiconductors theme from its editor, and the article's Topics card showed two
identical chips pointing at two different filters. Deduped by printed label,
industry winning — it came from the company data rather than from a tag.

### How it was tested

By **clicking**, per the lesson in §12. The category pills, the type pills, the
topic pills, the drawer toggle, an article card, a breadcrumb, a topic chip and
a ticker link were all `.click()`ed and the resulting URL and render recorded —
plus the browser's back button, which correctly steps back through filters.

Then a URL sweep for coverage: all thirty articles render with a headline and a
body; seventeen filter URLs including three deliberately empty ones and one
made entirely of invalid values (which correctly drops every filter and shows
the whole feed); and all eleven views off the rail, to confirm nothing
regressed. Zero console errors, and no horizontal page scroll at 375px on
either surface.

---

## 18. Investment Ideas, and the screener inside it

Investment Ideas is a **top-level rail menu**. `?view=ideas` is a directory of
40 portfolios filed into 11 groups; `?view=ideas&idea=<key>` is one portfolio,
rendered as a screener whose filters can be changed and re-run.

The split between the two files matters:

| | |
|---|---|
| `ideas.js` | the **engine and the data** — 40 portfolios, their rules, the filter registry, `runIdea`, and the result cards |
| `portfolios.js` | the **pages** — the directory, and one portfolio as a screener |

`ideas.js` no longer renders an index. `renderIdeaResult` is untouched and is
still what `screens.js` uses for the Stocks, Quant and Shariah menu screens —
those are not portfolios and do not get the filter panel.

### Stocks → All Stocks, and the two named screens

Three additions to the **Stocks** menu on 2026-09-11.

**All Stocks** (`?view=stocks&sub=all`) is a *directory*, not a screen: every
listed company the vendor returns, with sector, industry, size and last price,
searchable and sortable, fifty to a page. It is first in the menu, so a bare
`?view=stocks` now opens it rather than the screener-pointer page that used to
sit there.

It is also the one page in this menu that loads on arrival, and the reason is
cost. `company-screener` returns the whole universe in **one request**, and the
search, the sector filter, the sorting and the paging all run in the browser
over that single response. Every other page here spends two to five requests
*per candidate*, which is why nothing on those runs until the reader asks. The
rule is about quota, not about consistency — do not "fix" this page to match
them.

It collapses listings to companies with `dedupe` from `ideas.js` and prints the
count it removed, because a directory that silently drops a thousand rows is
lying about the size of the universe and one that keeps them is lying about the
number of companies. A button at the foot opens Investment Ideas → All Stocks,
which is the same universe ranked by the composite over a tested sample — the
two share a name deliberately and each says which it is.

**Top Stocks was renamed Top Quant Stocks.** It ranks on *our* composite, and
the menu should say whose opinion it is now that there is a screen beside it
ranking on somebody else's. Both it and Quant → Top Quant Stocks still open
`score-all-round` — one screen, two menus, same name, and the page says so.

**Top WallStreet Stocks** is that screen beside it, and it is the only list in
this product ranked on an opinion this report did not form.

#### The analyst bag

`grades` is the ninth bag: FMP's `grades-consensus`, shaped by
`gradesFromFeed()` in `model.js` into `{ score, total, buyShare, consensus }`.
`score` puts the tally — strong buy through strong sell — on the same 0-5 scale
the composite uses, which is the only way to rank companies on it.

**Sharing the scale does not share the meaning**, and that is the thing to be
careful about wherever this is printed. A 4.2 here is analysts averaging just
above Buy. A 4.2 on the composite is a percentile ranking of measurable ratios
against a sector. They are different claims and they disagree often. This is
the same distinction the company report's price head already carries — the
"Buy" chip there is FMP's consensus, not ours.

Two biases ride along with it, and the idea's `note` states both: sell-side
ratings skew bullish, so "more than half rate it buy" is a low bar rather than a
high one; and coverage is not random, so the ten-analyst floor is also, quietly,
a size filter. Ten is there because a mean of three opinions is not a consensus.

`analystScore`, `analystCount` and `analystBuyShare` are in the filter registry
under a **Wall Street** group, so any portfolio can now screen on the sell side
without this screen being involved.

#### How it was verified without a key

The bundled snapshot covers one company, so neither the directory nor the
analyst screen can run offline. Both were exercised by stubbing `window.fetch`
for the four paths involved — `company-screener`, `grades-consensus`,
`ratios-ttm`, `key-metrics-ttm` — and driving the real UI against the stub:

- the directory rendered 600 companies from 602 listings, collapsing a second
  exchange line and a share class, excluding an ETF, with search, sector
  filter, both sorts, paging and the ticker link all exercised by clicking;
- the analyst screen ran the whole new bag path end to end, and the arithmetic
  was checked by hand against the fixture — 35 analysts at 5×5 + 25×4 + 5×3
  gives 4.00, and 30 of 35 bullish gives 86%, both of which is what printed.

That is the pattern to reuse for anything else that needs live data to be seen
working: stub the vendor at `window.fetch`, drive the real components, and
check one row's arithmetic by hand rather than trusting that it looks
plausible.

### Featured screens, and the six that are missing on purpose

The first group in the directory is **Featured screens**: fourteen presets named
after Seeking Alpha's published screeners, added 2026-09-11 at the user's
request. §9 records the decision and what it reversed.

**The names are theirs; the arithmetic is ours.** Nobody publishes the
thresholds behind a preset like *Top Yield Monsters*, so inventing a match would
be a worse kind of copy than an honest equivalent. Every rule under Featured
screens is argued for in its own `note`, exactly like the other twenty-five, and
each idea is an ordinary entry in `IDEAS` — so renaming the lot is a one-line
`title` edit each and nothing else moves.

| | |
|---|---|
| Rule-based | Top Rated Stocks, Top Dividend Stocks, Top Quant Dividend Stocks, Top Yield Monsters, High Dividend Yield Stocks, Top Dividend Growth Stocks, Top Growth Stocks, Top Value Stocks, Top Small Cap Stocks |
| Ranked (`ranked: true`) | Stocks by Quant, Top Tech Stocks, Top Biotechnology Stocks, Top Semiconductor Stocks, All Stocks |

**A sector or industry screen is ranked, not ruled.** "The best biotechnology
stocks" cannot be a ratio screen — most of that industry is pre-revenue, and any
margin or earnings rule empties the list and presents that as a finding.
Eligibility is the industry; the composite decides the order. That is also how
the products these are named after describe them.

Two new pieces of machinery came with them, both small:

- **`overallAtLeast(min)`**, beside `scoreAtLeast`. The latter takes a *factor*
  key, so it could not express "rated Buy or better overall" — which is the
  single most common thing a preset filters on. It carries the descriptor
  `score:overall`, which the registry already had.
- **`industry` on the universe.** The vendor screens on it and nothing here had
  used it before, so `universeLine` now prints it. Both strings in use —
  `Biotechnology` and `Semiconductors` — were checked against FMP's live
  `available-industries` endpoint rather than written from memory. Do the same
  before adding a third: a screener that is handed an unknown parameter value
  returns a *wider* universe rather than failing, so a typo here is a screen
  that silently stops filtering.

#### The six that are not here

Seeking Alpha's catalogue has six more. None of them is a small job, and each is
absent for a stated reason rather than an oversight:

| Missing | Why |
|---|---|
| Most Shorted Stocks | Needs short interest. None of the 34 feeds carries it. |
| Top Rated ETFs, Most Shorted ETFs, All ETFs | There is no ETF path anywhere in this app. `LISTED` sets `isEtf: false`, every grade is a company fundamental ranked against a *sector* distribution, and an ETF has neither. This is a data-layer project, not a screen. |
| Top AI Stocks | Needs a thematic classification the vendor does not publish. There is no AI industry, and approximating it with "R&D-heavy technology" would be a different screen under a misleading label. |
| Top Crypto Stocks | Same, with a trap: FMP *does* have an `Asset Management - Cryptocurrency` industry, but that is crypto **funds**, not the crypto-exposed operating companies the name implies. Using it would return the wrong list convincingly. |

The AI and crypto screens are the two worth revisiting, because they are
curated-universe shaped rather than impossible. `runIdea` currently always
starts from `fetchScreener(idea.universe)`; giving an idea an optional
`symbols: []` that skips the screener and builds candidates from profiles
instead would make both buildable as hand-picked universes, stated as such.
That is the shape those lists have on every product that publishes them.

### How a fixed rule became an editable one without rewriting 25 portfolios

This is the piece worth understanding before changing anything here.

A rule was a closure: `atLeast('Return on invested capital above 10%', F.roic,
0.10)` produced `{ label, needs, test }`, and the `0.10` was captured inside
`test` where nothing could read it. A screener needs to read it.

Two changes, both in `ideas.js`, neither touching a single portfolio:

1. **Every accessor knows its own name.** `for (const [key, get] of
   Object.entries(F)) get.key = key;` — one loop after `F` is defined.
2. **Every rule builder records what it built.** `atLeast`, `atMost`, `between`
   and `scoreAtLeast` attach a `filter` descriptor beside the closure:

   ```js
   { metric: 'roic', op: 'gte', value: 0.10 }
   ```

`filtersFor(idea)` then reads a published portfolio out as descriptors, the
panel renders them as controls, and `ruleFromFilter()` turns edited descriptors
back into rules. `ideaFromFilters()` hands `runIdea` the same shape it always
took, so **a derived screen and a published one run through identical code** —
the engine never learns that a screen was edited.

Score rules are namespaced `score:<factor>` because a factor called `growth`
would otherwise collide with the growth *ratio*. `score:overall` is new: it
filters on the composite, which `scoreAtLeast` could not express because it
takes a factor key.

### The guarantee that matters: a rule is never silently dropped

`filtersFor` returns **every** rule. One with no descriptor, or one naming a
metric the registry does not carry, comes back as `fixed: true` with the
original rule attached, and `ideaFromFilters` runs that rule verbatim. The panel
shows it as a fixed condition marked "not adjustable".

This is not defensive tidiness. A dropped rule makes the derived screen *looser*
than the published one, so the page would return companies that do not pass the
portfolio it claims to be running — a wrong answer presented as a right one. A
rule shown as un-editable is a small disappointment; a rule silently not applied
is a bug nobody would catch by looking.

**The round-trip was verified rather than assumed.** Every rule of all 40
portfolios was read out as a descriptor, rebuilt, and run against 200 synthetic
candidates whose values straddle every threshold in the set — 20,800
comparisons, and the rebuilt rule agreed with the original on all of them. That
test found the one real defect: `insiderBought` had no entry in the registry, so
`insider-buying` was rebuilding 2 of its 3 rules and would have run a looser
screen than it printed.

If you add a metric to `F` and screen on it, **add it to `COLUMNS` and
`FILTER_META` too**, or it becomes a fixed rule. Re-running that comparison is
the cheapest way to know.

### Why re-running is affordable

`runIdea` has no result cache, but `fmp.js` caches per request — so changing a
threshold and running again re-tests companies already in memory rather than
re-fetching them. The first run is the expensive one; the sixth is close to
free. That is the whole reason an adjustable screener is viable on a metered
API, and it is why the panel's cost line says so.

The exception is a filter that needs a bag the portfolio did not: `bagsFor` is
derived from the rules, so adding a momentum filter to a screen that had none
adds a feed per candidate and a real cost.

### The URL, and why it is not the Research feed's model

The Research feed pushes a URL on every pill click, because filtering thirty
articles in memory is free. Here a run costs a screener call plus several
requests per candidate, so a re-render per keystroke would spend quota on
somebody thinking.

The panel therefore holds its edits locally and **only a run writes the URL**,
via `replaceState`:

```
?view=ideas&idea=score-all-round&f=score:valuation~gte~3;roic~gte~0.15&mcmin=5000000000&sec=Technology
```

`~` separates a filter's parts and `..` the ends of a range, because a metric
key already contains a colon (`score:valuation`) and a colon separator would
split it in the wrong place.

**`f=` present and empty is not the same as `f=` absent.** Absent means "use the
portfolio's published rules"; present and empty means "this portfolio, rules
deliberately cleared" — which is the blank screener, and what Stocks → Stock
Screener's second button opens. `goView`'s params loop was changed from
`if (v == null || v === '')` to `if (v == null)` for exactly this.

### Four things caught in verification

**A deletion took a live function with it.** Removing the superseded index
renderer also removed `universeLine`, which `rulesListCard` still called — and
`rulesListCard` is rendered by `screens.js`, so this would have broken the
Stocks, Quant and Shariah screens too, not just Investment Ideas. Caught because
the module failed to load at all. Worth remembering when deleting a block: grep
for every function in it, not just the one you meant to remove.

**A proxy that returns a fresh random per read is not a fixture.** The first
round-trip test reported 1,588 mismatches, every one of them the harness reading
a different random number for the original rule than for the rebuilt one. The
fix was memoising the proxy. A test that fails that comprehensively is usually
wrong about itself.

**A tag and a group can print the same word.** Several portfolios are tagged
with the name of the group they sit in — "Income" in both — and the head showed
two identical chips. Same class of bug as the article page's duplicate topic
chip, and the same fix.

**Reset ran without a key.** The Run button is disabled without an API key, but
Reset calls the same function, so resetting replaced the "needs a connection"
card with a "skipped" result. The guard moved into `run()` itself.

### What is not built here

The vendor screens on **size and sector only**. Every other filter runs in this
browser over a candidate list capped by `REQUEST_BUDGET` and taken largest
first, so a result is the best of a sample rather than the best of the market —
which the result card has always said and still says. A filter that would be
better applied server-side, like a dividend yield floor across 5,000 companies,
cannot be.

There is also no way to **save** a tuned screen beyond copying its URL. That is
the obvious next thing and it needs somewhere to write to, same as the two
rating-change pages in §12.

---

## 19. The markets hub, the heatmap and sector news

Three changes on 2026-09-11, all modelled on the shape of other products
rather than copied from them: the columns are the ones this data source can
fill, and where a column a reader might expect is missing, the page says so.

### Markets Data grew from six sections to ten

`marketpages.js` holds the four new ones and, since 2026-09-12, the Market
Overview hub as well. `markets.js` keeps the dispatch, the three mover lists,
the sector and industry snapshots, and the row components the Home page shares.

| Section | What it reads | Cost |
|---|---|---|
| ~~Indices~~ | replaced 2026-09-13 by the Market Indices board, below | — |
| Stocks | the sector snapshot, three mover feeds, one screener call | 5 |
| ETFs | one `company-screener` call with `isEtf` inverted | 1 |
| Economy | `treasury-rates` and `economic-calendar` | 2 |

**Indices used a fixed symbol list and the ordinary `quote` path on purpose** —
the vendor's index-list endpoint would have been one more path this app had
never called, on a page that did not need it. That trade stopped paying when
the page became a world board: `batch-index-quotes` returns every index FMP
carries in one request, which no list of fixed symbols can. The fixed list
survives as the catalog identity behind those symbols, and the twelve US names
still fill the Market Overview strip. An index quote comes back in the same
shape as a stock quote, which is why either path works at all.

**ETFs is the first ETF surface in the product, and it is a directory, not a
screen.** §9 records that there is no ETF path here and §18 records skipping
Seeking Alpha's three ETF screeners for that reason — both still stand. A fund
has no ratios of its own and belongs to no sector distribution, so it cannot be
graded by anything in this repo. Listing funds is a different problem and this
page solves only that one: the symbol column is deliberately plain text,
because there is no company report behind a fund to open.

**The two Economy paths were the risk this file warned about, and one of them
was wrong.** They had been exercised through an authenticated FMP connector but
never through `request()`, and against a live key on 2026-09-14 the calendar
returned **HTTP 404**: the endpoint is `/stable/economic-calendar`, while the
documentation *page* for it — and therefore the connector's endpoint name — is
filed under `economics-calendar`. A connector's endpoint name is not a URL.
`treasury-rates` was right as written. Both are now confirmed against the
published endpoints, both cap their range at 90 days, and a test asserts the
app asks for `/stable/economic-calendar` so the plural cannot come back.

The failure is worth remembering for its shape rather than its spelling: one
wrong character in a path took out the release calendar, the world maps that
read it, and nothing else — and the maps expressed it as "no reported value"
per country, which reads like a coverage gap rather than a broken request. That
is why the maps now print the vendor's own error above them, with a retry.

### Market Overview is a hub, one section per dataset

Rebuilt 2026-09-12. Ten sections, each a card with a heading, its own content
and the way through to the page behind it:

| Section | Content | Goes to |
|---|---|---|
| Indices | six quote tiles, each with a three-month sparkline | Indices |
| US stocks | six megacap tiles, then breadth stats and the sector heatmap | Markets → Stocks |
| Gainers / Losers / Most active | six rows each | the three mover pages |
| Highest volume | six rows, the screener's whole universe by volume | Most Active |
| Most volatile | six rows, widest intraday range of the hundred most traded | All Stocks |
| ETFs | six tiles, the largest funds by size | ETFs |
| Economy | four points on the curve, next five US releases | Economy |
| Earnings this week | eight companies with an estimate | the Calendar |
| Latest market news | eight headlines | Market News |
| Everything under Markets Data | nine tiles | all of the above |

Everything the page showed before is still here — the breadth bars became the
heatmap in the US stocks section and the three mini mover lists are unchanged.
Six sections were added around them.

`markets.js` no longer builds any of it. `overviewSections(nav)` in
`marketpages.js` returns the whole array in order, because **the order is the
design** — indices, then equities, then the movers, then funds, rates,
earnings and news. `markets.js` keeps the dispatch and the row components the
Home page shares.

#### One tile treatment, three sections

`tileStrip(symbols, labelFor, onPick, { withLogo })` builds the strip, and
Indices, US stocks and ETFs all go through it. Each is six tiles: logo, name,
symbol, level, session change, and three months of closes as a sparkline.

- **Indices** — the six US benchmarks, opening the Indices page.
- **US stocks** — six megacaps, fixed rather than "the six largest the screener
  returns": a strip that reorders itself between sessions is one a reader
  cannot learn. Each opens its company report.
- **ETFs** — the six largest funds by the vendor's size field. **No `onPick`**:
  there is no company report behind a fund to open.

A strip costs **one batch quote plus one price history per symbol**. The batch
is what made reuse affordable — `fetchBatchQuotes()` in `fmp.js` takes a symbol
list, chunks it at fifty and returns the ordinary quote shape per row, so six
tiles cost one quote request rather than six. It is a new vendor path, verified
through the MCP connector but not yet through this app's own `request()`, and
flagged as such beside `treasury-rates`. Both of those have since been checked
against the published endpoint — see the Economy note above for what that check
turned up.

A failed chunk does not lose the rest: the caller renders what came back and
leaves the others `n/a`, which is what every other partial failure here does.

#### Highest volume, and the day's widest swings

Two sections under the mover lists, sharing one screener call and one batch
quote:

- **Highest volume** — the screener's own `volume` field across every US
  company over $1b. The vendor publishes its own "most active" feed and this is
  not it: that one is short and unfiltered, this is the whole universe ranked,
  and the two differ at the edges. The card says so.
- **Most volatile** — the session's high-to-low range as a share of the
  previous close, over the **hundred most-traded** companies. A real intraday
  range rather than a proxy, and a different question from the gainers and
  losers above it: a company can swing several per cent across a session and
  close where it opened, and only this section will show it.

The hundred-company pool is the compromise that makes the second affordable — a
quote per company across five thousand listings is not a page load — and
"of the hundred most traded" is stated as part of the claim rather than buried.
It is also why the two share a pool: the most traded are exactly the candidates
whose range is worth ranking.

#### Logos

`logo(url, label, { size })` in `ui.js`. It takes a **URL rather than a
symbol**, so `ui.js` goes on depending only on `util.js` — `logoUrl()` lives in
`fmp.js` and the caller pairs them.

A failed load swaps itself for the first letter of the symbol on a neutral
square. The fallback is deliberately quiet rather than a coloured avatar: a row
of twelve bright generated squares reads as decoration and competes with the
numbers beside it.

**Indices pass `withLogo: false`.** An index is not a company and the image host
has nothing for it, so asking would be six requests that can only 404; the
letter fallback draws immediately instead. That is the one case where the
fallback is the intended path rather than the error path.

Logos appear on the tile strips, the three mover lists, the volume and
volatility rows, and the earnings list. Not on the release calendar — an
economic release is not an asset.

#### What the hub costs now

Roughly **thirty-three requests** on arrival, up from eighteen before the tile
strips: three batch quotes, eighteen price histories, two screener calls, and
one each for the sector snapshot, three movers, the curve, two calendars and
the news.

The eighteen histories are the dominant half and they buy the sparklines. If
the budget ever matters more than the landing experience, that is the number to
cut — dropping the equity and fund strips to quote-only tiles saves twelve
requests and loses the shapes.

#### This page breaks the consent rule, and that is the decision

Roughly **thirty-three requests on arrival** — see the cost note above for the
breakdown.

Everywhere else in this product the expensive thing waits for a click. Here
the expensive thing *is* the page: a hub whose sections are all empty until
you press something is not a hub, it is a menu with extra steps.

#### The sparkline

`sparkline(points, { width, height, up })` in `charts.js`. No axes, no labels,
no numbers: it sits under a level and a change that already say both, so
anything else on it would compete with them. Coloured by the direction of the
**whole run** rather than the last tick, because the window it draws is three
months and that is what a reader takes from the shape.

All six index tiles carry one. An earlier cut gave sparklines to four and left
two bare, and a row where two tiles are shorter than the rest reads as two
that failed to load — not worth the two saved requests.

It is null-safe and returns an empty `<svg>` below two points; a flat series
centres rather than dividing by a zero range.

#### What is deliberately not on this hub

A markets hub elsewhere carries crypto, futures, forex and corporate bonds.
This product is a US equity research tool — the grading engine, the screens,
the Shariah model and the research feed are all company-level — so those four
would be sections that lead nowhere. Treasuries appear only because the
Economy page reads the curve; nothing else in the product does.

#### One trap

**`.omore` prints its own arrow.** `.omore::after { content: "→" }`, so a
label written as `'All ETFs →'` renders `All ETFs → →`. `sectionHead` takes
the label without one, and says so in its comment.

### The heatmap

`heatmap()` and `heatLegend()` live in **`ui.js`**, not in either page that
uses them, and they take an `onPick` callback rather than a `nav` object. That
keeps `ui.js` depending on `util.js` alone and avoids the circular import a
shared component in `markets.js` would have created with `marketpages.js`.

**The colour scale is fixed, not relative to the biggest mover on screen.** The
obvious implementation scales the tint to the best tile; it is also the wrong
one, because on a flat day the best sector at +0.2% would render deep green and
the page would look like a rally. Four steps either side of zero at 0.5 / 1 / 2
/ 3 per cent, so a quiet day looks quiet. The legend says the scale is fixed
for the same reason.

### "Best-graded sectors" was replaced by the sector heatmap

That card ranked the eleven sectors by the middle of each one's composite
distribution, and it spent most of its life **refusing to rank** — the shipped
distribution table is modelled, every sector's median comes out at 2.50, and
`rankBody()` correctly printed an explanation instead of a league table
whenever the spread came in under 0.05.

The replacement is a heatmap of the same session data the bars beside it show.
It is measured rather than modelled, and it reads at a glance where a bar chart
reads in sequence. `rankBody` and its `.secrank` styles are gone; the
distributions themselves are untouched and still on every sector's own page,
where the "Modelled"/"Measured" pill still tells the truth about them.

If `tools/build_sector_stats.py` is ever run against a live key, a median-grade
ranking becomes meaningful again — but it belongs on the sector pages beside
the distribution it describes, not in the session-performance row.

### Sector news is membership-derived, and says so

FMP publishes no sector-tagged news feed. What the sector detail page does have
is the sector's **actual membership**, from the screener call it already makes
for the company table — so "Technology news" here means, precisely, recent
stories about the thirty largest technology companies.

It is one request: `news/stock` takes a comma-separated `symbols` list, so the
whole sector's coverage arrives in a single call rather than one per company.

The claim is narrower than a sector wire and more defensible. It will miss a
story about a small constituent and it will miss macro coverage that names no
company at all, and the card states both. Nothing on it is scored, ranked or
sentiment-tagged — the same refusal the company News tab already makes, for the
same reason: the vendor supplies no sentiment and this report runs no model that
could produce one.

### The country picker on Market Data

Added 2026-09-13. The hub's title **is** the country, left-aligned under a
`MARKET DATA` eyebrow, and the arrow beside it is the only control that changes
which market the page describes. That arrow used to open a copy of the section
strip that sits three lines below it, which made it the least useful control on
the screen.

Twenty countries, in `COUNTRIES` in `markethub-data.js`: code, flag, currency,
the FMP `exchangeShortName` values and ticker suffixes that mark a listing as
local, and three flags — `movers`, `treasury`, `indicators` — for the feeds that
exist for the United States only.

The choice is kept in `localStorage` under `mazvantage.market.country` and
written to the URL as `?country=DE`, so a link carries it. `country` is in
`VIEW_PARAMS`, so it is cleared on the way to another page rather than trailing
behind; the stored value brings it back on return.

**Every section says whose market it is.** `scope` on `HUB_SECTIONS` is
`country`, `global` or `us`, and a section whose scope is not the chosen country
prints a chip beside its heading — World stocks and Futures read `Global` under
every country, Corporate bonds reads `United States` under all but one. Nothing
is relabelled to look local.

| Section | Under a country other than the US |
|---|---|
| Indices | that country's benchmarks in the chart, every other country's in the rail |
| Stocks | ranked from `company-screener?country=`, because the mover feeds are US-only |
| ETFs | the most traded funds FMP lists there, enriched exactly as the US list is |
| Economy | the release calendar filtered by country; the indicator panel states the gap |
| Government bonds | states that FMP publishes the US Treasury curve and nothing else |
| World stocks, Futures, Corporate bonds | unchanged, and labelled |

**The one thing to know before extending it.** Outside the United States there
is no whole-market gainer, loser or most-active feed, so those four lists are
ranked over the largest listings the screener returns — 120 at most — and the
section prints that above the rankings rather than implying it ranked the
exchange. Widen the universe and you widen that sentence with it.

Calendar rows are kept by `listedIn()`: ticker suffix, exchange, or the vendor's
own country field. A wrong entry in that table empties a calendar; it cannot
fill one with another country's companies. That is the intended direction to
fail in.

Section caches are keyed by country — `section:stocks:DE` — and the global and
US-only sections are keyed once rather than per country, so switching back and
forth inside the ten-minute window costs nothing.

### Market Indices, and what a region table can honestly claim

Added 2026-09-13, and it is where `?view=markets&sub=indices` now goes —
`marketindices.js`, on the same canvas as the hub rather than the card page it
replaces. The heading of the hub's indices section is the way in; it reads as a
link because it is one, and `SECTION_PAGES` in `markethub.js` is the one-line
table that decides which headings get that treatment.

**Overview is the market summary, not a twelfth table.** The chosen country's
indices on one percentage axis, their quotes beside it, the rest of the world's
benchmarks under it. `compareChart()` in `markethub-compare.js` draws it: every
line starts at zero on the first session of the window, so what is compared is
performance over that window and levels are never mixed into one scale. Six US
indices carry `summary: true` in the catalog — the volatility index is not one
of them, because an implied-volatility series on a performance axis is a
different kind of number.

**Markets keep different holidays.** The x axis is the union of the sessions the
visible series traded, and a line carries its last close across a day its own
market was shut. That is a drawn segment between two real observations rather
than an invented observation, which is the same rule the sparklines follow.

**The eleven boards are one table twice.** Overview columns — price, change,
change %, high, low — arrive with the single index feed the page already loads.
Performance is nine windows from `stock-price-change`, **one request per
index**, so it shows the arithmetic and a button before it spends anything, the
way a bought column does on the dense table (§20). Results are cached for ten
minutes and reused by every other board, so filling Europe makes All indices
cheaper. Two columns a commercial board carries are simply absent: FMP supplies
no technical rating and no realised volatility for an index, and a made-up
rating is worse than a missing column.

**A region table only claims what it can place.** `regionOf()` reads the
catalog entry first, then the country behind it, then the listing suffix —
`.JO` is Africa, `.TA` the Middle East, `.AX` the Pacific. An index the table
cannot place stays under All indices. That is the deliberate direction to fail
in: a wrong entry hides a row from one board rather than filing Cairo under
Europe. S&P sectors is the one board that is not an index table at all — FMP
publishes a sector performance snapshot, not sector index levels, so it carries
the session move and the exchange it was measured on and says why the other
columns are missing.

**News is a filter over the firehose, and says so.** FMP tags news by company
and never by index, so `loadIndexNews()` reads the two latest pages of
`news/general-latest` and keeps the stories whose headline or summary names an
index the board tracks. Each story carries the marks of the indices it named,
and the coverage note prints the arithmetic — *n* of the *m* latest stories. The
country picker is not consulted: an index story is an index story wherever it
was written.

The match list is the catalog plus `NEWS_ALIASES`, and a term under six
characters is dropped unless it is on that list. `Nifty` and `Sensex` are worth
matching; `ATX`, `SET` and `IPC` would file half the language under an index.
Dropping one costs the section a few stories, which is the cheaper mistake.

The block appears twice — nine stories under the summary with **Keep reading**,
all of them on the News tab — and the summary is drawn before the feed is asked
for, so the chart never waits on two requests it does not need.

The chosen board travels in the URL as `&board=europe`, beside `&country=`, and
is cleared by `VIEW_PARAMS` on the way to another page.

### One board, two markets

`marketboard.js` is the page; `marketindices.js` and `marketfutures.js` are two
specs handed to it. The split fell where it had to: the machine owns the tab
strip, the URL memory, the table, the sort, the cells, the bought-column
consent bar and the summary layout, and knows nothing about indices or
contracts. A spec owns its title, its collections, which rows fall under each,
what each note can honestly claim, and what the summary compares. Adding a
third market is a config file, not a page.

Futures differs from indices in exactly three places, all of them in the spec:
the collections are grouped by a symbol table rather than by region (FMP's
commodity feed carries no category), the Overview columns carry a **Delivery**
month from `commodities-list`, and its news filter matches contract names
rather than index names.

**Both boards filter the same firehose, and the terms are the difference.**
`marketNews(kind)` scans two pages of `news/general-latest` once — the feed is
cached, so the second board pays nothing — and keeps the stories whose text
names something that board tracks. The futures terms are where the boundary
rule earns its keep: `gold` must match *Gold steadies above $4,300* and must
not match *Goldman Sachs*, which is why a term followed by a letter is not a
match. `oil` on its own is not a term at all — a story about an oil company is
not a story about the crude contract — so the terms are `crude oil`, `WTI` and
`Brent`.

**A board with no performance view says so by returning no columns.** The S&P
sectors tab is a performance snapshot with no series behind it, so
`columns(id, 'performance')` returns `null` there and the filter group hides
itself. That is the one branch the machine kept, and it is driven by the spec
rather than by a tab id.

### The Economy world maps read the release calendar

FMP publishes no country-level GDP or inflation series — `economic-indicators`
is a US dataset — so a world map of either looked impossible, and for a while
the page said so. The release calendar is the way in: every row carries a
country, an event name and the **actual** that was reported. `economyRates()`
in `economy-data.js` keeps, per country, the newest actual whose event is
`Inflation Rate YoY`, `GDP Growth Rate YoY`, `… QoQ` or `GDP Growth Annualized`
inside a 180-day window. Against a live 90-day pull that is 109 countries with
an inflation print and 89 with GDP.

**The parser is deliberately narrow.** `Core Inflation Rate YoY` is a different
rate, `Inflation Rate MoM` a different frequency, `CPI` an index level rather
than a rate, `EU` a bloc rather than a country, and a scheduled row with a null
actual is not a reading. Each is rejected, and the vendor's `UK` is mapped to
`GB`. The three GDP bases are kept in separate maps because a QoQ rate on a YoY
scale is simply a wrong number.

**One window that fails must not blank the world.** `calendarHistory()` asks
for the two three-month halves — the cheap path — and, if the vendor refuses a
window, retries that half in thirty-day slices and keeps whatever comes back.
What is still missing is named in a notice above the map, with a retry, rather
than left to look like a hundred countries with nothing to report.

**Two bugs worth not repeating.** `fill="var(--em-empty)"` on an SVG `<path>`
does nothing — presentation attributes do not resolve custom properties — so
every country without a reading rendered black; it is set through
`path.style.fill` now. And the fixture harness blocked its own country
boundaries: `createFixtureFetch` refused every non-FMP request, including the
page's same-origin `world-countries.geojson`, so the map never drew under
`tools/market-hub-preview.html`. Same-origin files are the page's own assets
and are let through; the rest of the internet stays blocked.

### The US indicator board, and why it is only the US

`economic-indicators` is the other half of FMP's economics coverage and the
opposite shape from the release calendar: one **named series** per request,
United States only, capped at 90 days like every dated feed here. That cap is
the thing to design around — asking for `from=-800d` does not fail, it silently
returns the last 90 days, which is how the old four-indicator panel came to
fetch 800 days of history and draw three points from it.

So `loadUsIndicators()` walks the windows: `[-95, 0]`, `[-185, -91]`,
`[-275, -186]`, as many as the series needs. A weekly series is complete in
one; a quarterly one needs three to show the quarter before it. `US_INDICATORS`
in `markethub-data.js` records, per series, its group, its publishing step, how
many windows it takes and **what unit it is in** — the feed returns a bare
number, so every unit in that table was read off a live observation rather than
assumed: real GDP 24,269.613 (USD bn), retail sales 660,047 (USD mn), payrolls
159,075 (thousands), housing starts 1,239 (thousands of units), vehicle sales
17.19 (millions), trade balance −88,576 (USD mn).

**Six load, seventeen wait.** Real GDP, inflation, unemployment, payrolls,
claims and the funds rate are what the page is opened for: eleven requests with
the section. The rest are thirty-five more, so they sit behind a button that
states the arithmetic — the same consent rule as the dense table's bought
columns (§20). Every window is cached by name, so nothing is paid for twice and
switching country does not re-buy the board.

**A level and a change are different sizes.** A quarter of real GDP moves by
billions, not trillions, so `DELTA` in `economy-us.js` prints the move at the
scale it lands on while the level above it stays in trillions. Percent series
move in percentage points, never in percent of a percent.

**The date on one of these rows is a period, not a release.** FRED-style series
are dated on the period they observe — `2026-04-01` is Q2 — so the card says
`Period · Q2 2026`, or `Week of Sep 14, 2026`. Printing it as "Latest release"
would be a different and wrong claim.

`inflation` is in the endpoint's name list and deliberately unused: it returned
nothing for any window that was tried, and `inflationRate` is the series that
answers the question.

### The indicator chart, and what a range costs

Above the board, `economy-chart.js` charts one series at a time: a rail of
series cards over one chart, which is the shape every asset section on this
canvas already uses for its quotes. It is that shape on purpose — the rail is
`.mh-quote-tab` and the chart carries `.mhc`'s own classes — so the tools sit in
the corner a reader found them in on an index chart, and the section gains a
chart without gaining a second design.

The ninety-day cap is the whole design problem. A chart wants years and the
vendor answers quarters, so the ranges are a **ladder of windows**:
`indicatorWindows(count)` in `markethub-data.js` extends the board's own three
rungs, and both walk the same ladder keyed on `from` alone — so a window the
board bought is free to the chart and the other way round.

| Range | Windows | Reaches back |
| --- | --- | --- |
| 3M | 1 | 95 days |
| 6M | 2 | 185 days |
| 9M | 3 | 275 days — what the board already pays for a quarterly series |
| 1Y | 5 | 455 days |
| 3Y | 13 | 1,175 days |
| 5Y | 21 | 1,895 days |
| 10Y | 41 | 3,695 days |

Three rules follow, and they are what keep this honest:

1. **Arriving spends nothing.** The chart opens on the widest range already
   paid for — 9M for a quarterly series, 6M for a monthly one, 3M for a weekly
   one — and switching series is a redraw, not a purchase.
2. **A range states its arithmetic before it is clicked.** The button's title is
   `5 years · 16 FMP requests more`, counting only what is still owed, and the
   note under the chart prices the longest one. This is the same consent rule as
   the board's own "load the other seventeen" button.
3. **What was bought is kept.** Every point a range returned stays in the
   chart's own map, so stepping back down from ten years to one is free.

There is no **All**. With a ninety-day cap "all" is an unbounded number of
requests, and a button that cannot say what it spends does not belong here.

Nothing is drawn between observations: markers sit on the releases while they
can still be told apart (45 of them), and the second tool is a step line, which
is the truthful shape for a series that holds a level until the next print.

### The release calendar reads as cards

The economic calendar leads with the card strip the earnings and IPO calendars
already ride on — extracted as `filmstrip()` in `markethub-widgets.js`, so the
scrolling, the arrows and the *See all* link are one implementation rather than
three. A release card carries the day and time, the importance mark, the
country's flag and the event, then actual, forecast and prior, with the actual
lit because it is the number the market traded.

The eight-column table did not go away: it is behind *See all* everywhere, and
printed under the strip on the World Economy page, which is the page that exists
for the whole calendar. A strip is the wrong shape for comparing a hundred
releases; a table is the wrong shape for reading the next five.

### The ETFs page is tabs, not one scroll

Every other dedicated asset page on this canvas is a single scroll with an
anchor strip above it. The ETFs page is two places: **Overview** and **ETF
Screener**. The strip writes `?board=` with `replaceState`, so a tab survives a
reload and can be linked to, and the screener is built the first time its tab is
opened.

It had a third, **News**, for about a day. The wire behind it is sound — FMP
files a story under the fund it is about — but the vendor tags few enough fund
stories that the tab was usually empty, and an empty tab on a page with two good
ones is worse than no tab. The same wire is a category on Market News, where it
sits beside five others and an empty day reads as a quiet day rather than as a
broken page.

The four rankings that used to be tabs on that strip — most traded, best 1-year
performance, highest distribution yield, largest assets — were never really
tabs: they were *screens*. Three of them are now **ideas** in the screener tab,
chips that prefilter the same table. The fourth is not: a one-year return over
the whole market is a price-change request per listing, so it stays a ranking of
the funds the overview already quotes. The overview keeps all four rankings,
because ranking funds this page has already paid for costs nothing extra.

The screener in that tab is `renderDedicatedScreener` with `chrome:false` — no
title row, because the page has tabs — and an `onNavigate` that keeps a change
of collection inside the page. It owns which market it screens: its country
picker changes the screener, not the page under it, because a tool that
silently remounted the page under the reader would be worse than two scopes
that each state what they are.

### The collection sections, and where their rows come from

The overview's **ETF collections** block is five sections — Equity, Commodity,
Bitcoin, Gold, Shariah — six funds each. They cannot come from the page's own
fund set: that is twelve US catalog funds and contains no bitcoin fund at all.
So `loadEtfCollections()` pulls **one** screener page of up to a thousand
listings for the country, applies the same collection rules the ETF screener
applies, and quotes the ~30 funds actually shown in **one** batch. Two requests
for five sections, and only on the page that shows them — which is why it is
its own load rather than part of `loadEtfs`.

Each section prints the rule it selected on, and its heading and *see all* open
the screener tab on that collection, so the section and the full list can never
disagree: they are the same rule over the same feed.

### ETF collections, and the two kinds of rule

The stock screener has forty screens behind it because a stock can be graded.
A fund cannot — nothing in this product scores a basket — so `etf-collections.js`
is a list of *selections*, each one a rule over listings the ETF screener has
already returned. No collection costs a request, and the rule each one selects
on is printed under the dropdown.

There are exactly two kinds, and the difference is the file's whole point:

1. **A number the feed returned.** `marketCap`, `volume`, `beta` and
   `lastAnnualDividend` are fields on a screener row, so *largest*, *most
   traded*, *highest distribution yield*, *dividend payers* and the three beta
   collections are exact. Each one also names the column it opens sorted on.
2. **What the fund's own name says it holds.** FMP returns no asset class for a
   fund, so a gold fund is a fund that says gold. Two boundaries carry the whole
   risk of this approach and both have a test: **Goldman is not gold** — the
   same trap the futures news matcher documents — and a **short-term bond fund
   is not an inverse fund**, which the catalog's own `SJNK` would otherwise walk
   straight into. A fund that is both leveraged and inverse files under inverse:
   the direction is the more useful fact.

Two of these deserve their own note. **Equity** is the one holding a fund never
states — they are called S&P 500, Total Stock Market, Russell 2000 — so it is
the *residue*: what is left once every named holding is removed, built from the
other rules through `NON_EQUITY` so the two cannot drift apart. It is a weaker
claim than a classification and the note says so. **Shariah** is the fund's own
stated mandate and nothing more: the five-methodology screen in `shariah.js` is
two balance-sheet ratios against a company, and a basket has no balance sheet to
run them against.

Everything else TradingView files under ETF collections needs a number FMP does
not publish — flows, AUM growth, expense ratios, NAV premiums, whole-market
one-year returns and session losers, and the asset-class split that separates
allocation and actively-managed funds from the rest. **They are not offered.**
They were, briefly, as a *Not supplied by FMP* group in the dropdown; a list a
reader picks from is the wrong place for things that cannot be picked, so the
reasons now live in a comment at the foot of `etf-collections.js` where the next
person to wonder "why is there no expense-ratio screen" will find them. A
collection id the URL does not recognise — including those old ones — falls back
to All ETFs rather than an empty page, and a test holds that.

### The ETF news tab reads a tag, not a name

The indices and futures boards scan the market-wide firehose for stories that
*name* an index or a contract, because FMP tags news by company and a contract
is not a company. **A fund is.** So the ETFs page reads the stock wire as well,
where every story carries the symbol it was filed under, and a tag beats any
rule this app could write: `NEWS_WIRES` in `markethub-data.js` gives `etfs` both
wires, and `marketNews` accepts a story if the vendor tagged it with a fund in
the catalog *or* the headline named one. The note under the section says how
many of each.

No ticker is in `ETF_NEWS_ALIASES`. `SPY` is three letters that occur in half
the language once the match is case-insensitive, and the tag already answers
that question exactly; the aliases are long names a headline actually writes.

The section is registered in the page's own `sections` map, which is what makes
the News tab behave like every other tab on the page — the strip jumps to it,
the strip's active mark follows it, and it loads when it is reached rather than
when the page is. The overview page does not carry it: eight sections there
already, and none of them should pay for a wire nobody asked for.

### What these pages deliberately do not carry

- **A 52-week high/low list.** The vendor publishes no such feed and deriving
  it would mean a year of prices for every company on the exchange. The index
  board does show a 52-week position per index, where it costs one quote.
- **Non-US coverage.** Not on these four pages, and not in any grade: `LISTED`
  sets `country: 'US'`, `sector-stats.json` is built from US companies, and
  every grade is a percentile against a **US sector**. The Market Data hub is
  the single exception and only for facts — its country picker switches prices,
  rankings and calendars, none of which is scored. A graded world board would
  still invite comparisons the rest of the product cannot support.
- **Any grade at all.** A price, a yield and a fund's size are facts about a
  market, not assessments. Every assessment in this product is company-level
  and sector-relative.

### How it was verified

No API key, so every one of these pages gates. All four were exercised by
stubbing `window.fetch` across the eight paths involved and driving the real
components — the pattern §18 records. Checks that mattered:

- the heat buckets were verified against hand-computed inputs: +3.7% → `up-4`,
  +1.6% → `up-2`, −0.05% → `flat`, −2.8% → `down-3`, and "7 of 12 higher"
  counted correctly off twelve stubbed index moves;
- the ETF directory paged 400 stubbed funds, 50 to a page;
- the yield curve rendered all twelve tenors with basis-point changes against a
  week and a month earlier, and the 10y−2y spread read `+0.39% positive slope`;
- sector news rendered 12 stories from 4 outlets with the membership note.

**One bug that only a real render would have caught:** index levels were going
through `num()`, which scales like a market cap and printed the S&P 500 as
"7.67k". They use `dec()` now and print `7,672.79`. A stub with realistic
magnitudes is what surfaced it — one with values under 1,000 would not have.

---

## 20. The dense market table

`assets/js/markettable.js`. One table shape for every page that lists a lot of
companies — All Stocks and the ETF directory today, anything added later.

It is the pattern the big market sites converged on, adopted on 2026-09-12
after looking at how those pages actually work:

- **Column-set tabs** above the table. Overview, Valuation, Profitability,
  Growth, Dividends, Performance, Analysts — the *same rows*, a different set
  of columns. Far better than one forty-column table, because a reader
  comparing margins does not want P/E in the way.
- **A sticky identity column.** The symbol stays put while the rest scrolls
  sideways, so you never lose which row you are reading.
- **Every header sorts.** Click to sort, click again to reverse. The old
  "sort by" dropdowns on both directories are gone — they were a worse version
  of the same affordance.
- **Tabular numerals, right-aligned, colour only where the sign is the point.**

The geometry is the borrowed idea. The palette, type and spacing are this
product's own tokens, and the data is FMP's — so this is the shape of those
pages, not a copy of one.

### Free tabs and bought tabs, which is the whole design constraint

A site with its own data pipeline fills forty columns for five thousand rows
server-side. This app has a vendor API metered per request, and the split is
stark:

| | |
|---|---|
| the screener | **one** request, the whole universe, ~8 usable columns |
| everything else | **two to five requests per company** |

So **Overview is free and every other tab is bought.** A bought tab:

1. shows a consent bar instead of the table, stating the arithmetic — *"this
   tab costs 2 per company; filling the 50 rows on this page is about 100
   requests"*;
2. loads only the rows **on the current page**, on click;
3. keeps what it loaded on the row object, so switching tabs and paging back is
   free. `fmp.js` caches per request on top of that, so a second tab needing
   `ratios` after the first already fetched it costs nothing.

The tab strip marks a bought tab with a small dot. Overview carries none.

`Performance` is the dearest — a year of daily closes per company rather than
one TTM row — which is why it sits second from last and says so in its tooltip.

### What made this possible without new plumbing

`ideas.js` already knew how to fetch a "bag" for a symbol: `BAG_FEED` maps a
bag to a feed and `BAG_SHAPE` to the builder that shapes it. Both are now
exported, along with a small `loadBag(bag, symbol)` that applies the pair — a
caller outside the screening engine wants the result, not the two maps.

That means the table's seven column sets are declarative. A set names the bags
it needs and the columns it shows; nothing else in the file knows what a
`ratios` is.

### Two traps, both hit

**`min-width: auto` is why a wide table scrolls the whole page.** A flex or
grid item refuses to shrink below its content, so a table of twelve
`white-space: nowrap` columns pushed its card, then its grid track, then the
document wider than the viewport — and the *page* scrolled sideways instead of
the table. `.mtwrap` and `.mtscroll` both carry `min-width: 0`, and the table
itself is `width: max-content; min-width: 100%` so it takes the width its
columns need and lets the scroller scroll it. Verified at 375px: the page does
not scroll, the table does, and the sticky column holds.

**A sticky cell needs its own background.** Without one the scrolling cells
show through underneath it. `.mt__id` sets `background: var(--surface-1)` and
the hover rule has to repeat it, or a hovered row's sticky cell goes
transparent.

### Missing values sort to the bottom, both ways

A column sorted ascending would otherwise put every unmeasurable company first
and read as if they were the cheapest. They sink whichever direction the column
is sorted — an unmeasurable company is not the best or the worst, it is
unmeasured, and the existing `n/a` cell already says so.

### How it was verified

Stubbed `window.fetch` across the screener and the four per-company feeds, then
drove the real component: sorting on a free column both ways, switching to a
bought tab (consent bar, correct arithmetic), loading it, sorting on a
*bought* column, and changing a filter above the table to confirm the active
tab and sort survive the rebuild. The consent bar correctly reappeared —
asking for 40 rather than 50 — when a sector filter brought in rows whose bags
were not loaded.

Then the standing sweep: 109 destinations, zero dead, zero console errors.

---

## 22. The Alpha Signal

`?view=alpha` for the desk, `&tab=alpha-signal` on a company report. A second,
deliberately separate rating: not "how good is this company" but "how much has
recently changed here, and how few people are looking".

Nothing in the quant model was touched to build it. `factors.js`, `grading.js`
and `analyse()` are untouched except for one additive line — `analyse()` now
puts the benchmark series it was already handed onto its result, because a tab
is only ever given `(a, nav)` and the price provider needs them.

### The two ratings are on different scales on purpose

The quant rating is 0-5. The Alpha Signal is 0-100. This breaks the "one scale
everywhere" rule in §8 knowingly.

They answer different questions, and a shared scale invites averaging them —
and the average of "excellent but static" and "mediocre but inflecting" is not
a question anyone asked. Different units make the two unmixable at a glance.
`pairNote()` in `alpha-score.js` prints the sentence explaining all four
quadrants, and every surface showing both prints it.

### The file layout

```
assets/js/alpha-signals.js    the vocabulary: what a signal is, what a source
                              is, the eleven categories, the badge words,
                              freshness decay. Pure. `signal()` THROWS on a
                              claim with no source, no calculation or no data
                              quality — that refusal is the feature
assets/js/alpha-providers.js  eleven adapters, one per category. The only
                              Alpha file that knows a vendor field name —
                              this is the feature's own `model.js`, see below
assets/js/alpha-score.js      weights, the reduction, coverage, the confidence
                              cap, the ten archetypes. Pure
assets/js/alpha-narrative.js  the written view, assembled from signal fields.
                              No model. Pure
assets/js/alpha-disclosures.js  hand-captured facts for the six categories no
                              endpoint fills, and the signals built from them
assets/js/alphaview.js        components both surfaces share: score block,
                              category card, evidence drawer, the five badges
assets/js/alphatab.js         the company tab — full depth, 19 feeds
assets/js/alphadesk.js        `?view=alpha` — the capped scan, method, limits
assets/css/alphasignal.css    `as-` prefix, on the market canvas
tools/test_alpha.mjs          50 checks, stubbed network, no DOM
```

### Why `alpha-providers.js` is allowed to read vendor field names

§7 says `model.js` is the only file that does. This is a second one, and the
split is deliberate: growing `model.js` by a third for a feature none of its
existing consumers read — and making every company report pay for quarterly
statements no other tab opens — was the worse trade.

The rule the split keeps is the one that mattered: **one file per feature
knows the vendor's spelling.** Everything above `alpha-providers.js` is
vendor-agnostic. Swapping FMP out is that file and `fmp.js`.

### The bundled AAPL capture covers all eleven categories

`assets/data/AAPL.json` carries the five Alpha feeds as well, captured
2026-09-22 through the same Ultimate-tier connector the rest of the file came
from. With no API key at all, `?symbol=AAPL&tab=alpha-signal` renders at
**100% coverage, 11 of 11 categories, 28 signals** — which is what makes the
feature demonstrable to somebody who has not got a key yet.

Nothing in it is synthesised. The quarterly statements are Apple's filed
figures, the grade history and price-target summary are FMP's published rows,
and the 13F aggregate is the quarter ended 2026-03-31. `extras.benchmarks`
gained SPY alongside the XLK series that was already there, so relative
strength and sector context resolve too.

The caveat that remains, and the one the page prints, is **currency, not
authenticity**: it is frozen at the capture date while freshness weighting and
any days-until reading are measured against today. Re-capture by connecting a
key and using **Settings → Save snapshot**, or re-run the capture script.

`loadAlphaBag` falls back to this file the way `loadDataset` already does —
**after** the live attempt, never instead of it. A configured key always wins;
the capture only fills what the key could not. `test_alpha.mjs` §6b pins that
precedence with a stubbed `fetch`, because the failure mode is silent: the
page looks right and shows stale numbers.

### The six gaps, and how five of them were closed

Six categories had gaps no FMP endpoint fills. Five are now closed by
`assets/data/alpha-disclosures.json` — facts read by hand from a primary
source and typed in, each carrying the URL it came from. The precedent is
`summaries.json`: the app ships no scraper, so a fact that needs a human to
read a filing says so and carries the link.

| Gap | Closed with | Source |
| --- | --- | --- |
| Consensus EPS revisions | Drift over 90 days + revision breadth over 30 | Yahoo Finance analysis page |
| Backlog | A **measured absence** plus deferred revenue as the nearest disclosed measure | Apple FY2025 10-K on EDGAR |
| Patents | Granted US patents, two settled windows | Google Patents |
| Product launches | Dated launch cadence | Apple Newsroom |
| Corporate actions | Dividend declarations and the raise | Apple IR dividend history |
| Search attention | Weekly interest against its own year | Google Trends |
| Job postings | **Not closed** — recorded with the reason | Apple careers |

Four things keep this a capture rather than a fabrication, all enforced in
code rather than promised:

* **Every signal carries the real source URL.** These are the only signals in
  the engine whose source has a link a reader can click and check.
* **A symbol with no entry gets nothing.** No defaulting, no sector average,
  no carrying a figure across companies. Every other ticker shows the gaps
  exactly as before.
* **An absence is recorded as an absence.** The word "backlog" appears zero
  times in Apple's FY2025 10-K. That is a reading of a primary source, and it
  is a different and more useful fact than "no provider connected". It is
  deliberately unscored — a missing disclosure is neither good nor bad news.
* **A closed gap is replaced, never silently dropped.** `CAPTURE_SUPERSEDES`
  removes the broad gap and `residualGapSignals` emits a narrower one naming
  what the capture did *not* reach. Suppressing without replacing would
  understate what is missing, which is the failure this feature exists to
  avoid.

#### Two traps worth not re-introducing

**The patent lag.** Patents publish months after grant and the index lags
further, so a trailing-twelve-month count always undercounts. Comparing the
newest window with the one before it gives −38.8% for Apple — a collapse that
did not happen. Each window carries a `settled` flag and only settled windows
are compared, which gives the real −7.1%. The unsettled count is printed and
explicitly not used.

**Google Patents counts families.** Without `country=US` one invention is
counted once per jurisdiction: 30,988 instead of 3,788 for the same window.

`tools/capture/README.md` records the source URL and the exact query behind
every field, so each can be re-read. `test_alpha.mjs` §6c pins the rules above,
including the patent-lag trap and the supersede-and-replace behaviour.

### Five new feeds, all `onDemand`

`incomeQ`, `cashflowQ`, `gradesHistorical`, `targetSummary`, `holdersSummary`
are in `FEEDS` but carry `onDemand: true`, so `loadDataset` skips them exactly
as it skips `marketOnly`. A company report is unchanged at 32 requests; the
Alpha tab fetches these five on first open and reuses the dataset for the
other fourteen.

### Three arithmetic decisions worth not re-litigating

- **Every fundamental comparison is a quarter against the same quarter a year
  earlier**, never the quarter before it. A sequential comparison reports
  Apple's March quarter as a catastrophe every single year. Acceleration is
  then the second difference, which is why eight quarters are the minimum and
  why seven falls through to the annual path rather than comparing unlike
  periods.
- **Insider conviction reads `totalPurchases`/`totalSales` only** — Form 4
  codes P and S, open-market. `acquiredTransactions` is far larger and
  includes option exercises and vesting, so scoring it would rate every
  company with an equity comp plan as heavily bought. The band is also centred
  at 60% selling, not at parity: routine selling is the normal state, and only
  buying is unusual. When a feed returns rows without the P/S counts — which
  the bundled snapshot does — the signal reports unavailable rather than
  falling back to the compensation-inclusive ratio.
- **13F freshness is measured from the filing deadline, not the quarter end.**
  Quarter end plus 45 days. Measuring from the quarter end would make every
  13F signal look six weeks older than the market's knowledge of it.

### The reduction, and the two rules inside it

A category with no data is **dropped, not scored zero** — the same rule
`rollUp` follows in `grading.js`, for the same reason. Its weight is
redistributed across the categories that did score, and the dropped share
becomes the coverage figure. A gated plan therefore reads as an unmeasured
company, never as a bad one.

**Confidence is capped by coverage, and the cap is applied last.** Below 40%
coverage the answer is `low`; below 65% it cannot be `high`. `test_alpha.mjs`
checks this as a property over every prefix of the category list rather than
at hand-picked points, because hand-picked points encode an assumption about
which categories carry which weight — which is exactly what a weight edit
changes. That check caught one wrong assumption while it was being written.

### There is no AI layer, and that was the better answer

The specification asked for a model that reads the signals and writes the
summary without hallucinating values or inventing citations. There is no
server here to call one from.

`alpha-narrative.js` does it as a function instead: every sentence is emitted
**by the signal that owns the fact**, numbers come from the signal's own
fields, and an evidence item cannot be constructed without a real signal id.
A value cannot be hallucinated because no step composes one; a citation cannot
be invented because there is nowhere to put a fake.

The cost is real and is stated in the file header: the prose is flatter than a
model's and it will never notice that two findings are the same story twice.
If a model is ever wired in, it should take this structure as input and be
forbidden from adding facts to it.

### What is deliberately not built

- **No backtest, and no performance claim of any kind.** Not a hit rate, not a
  return, not a benchmark comparison. The app stores nothing between sessions,
  which is the same wall the quant desk's rating-changes tab hits. The Limits
  tab names the four pieces it would take, including the hard one:
  point-in-time storage, because recomputing old signals from restated filings
  is look-ahead bias wearing a timestamp.
- **The weights are unvalidated** and the page says so in those words, in a
  panel of its own rather than a footnote.
- **No consensus-estimate history.** FMP publishes today's consensus and a
  monthly history of analyst *ratings* — not the same measurement. The
  revision category measures the rating mix and the price-target trend and
  says so on the card, and carries a standing unavailable signal naming the
  provider an EPS revision history would need. This is the single most
  important honesty call in the feature: the obvious move is to let one
  measurement wear the other's name.
- **No social media, ever.** Not as a fallback, not behind a flag.

### The scan is capped, and that biases it toward what you already know

`?view=alpha` screens server-side, sorts by market cap, and tests the top N
(60/150/300) at seven requests each — the same shape as `runIdea`. Market cap
is the only ranking the screener gives away free.

That skews the tested set toward companies you have already heard of, which is
close to the opposite of what a discovery tool is for. The Limits tab says so
and points at the real workaround: narrow the universe with the sector and
size controls first, so the cap bites on a smaller list.

### Known gaps

What is still dark for AAPL, after the capture — three, down from seven:

- **Regulatory approvals and clearances.** Needs a decisions feed, and which
  one depends entirely on the sector.
- **Job postings by function.** Apple's careers site reports "600+ Result(s)"
  and returns that same capped figure for every filter, exposes no facet
  counts, and its search API rejects unauthenticated requests. Recorded with
  that reason so nobody re-runs the investigation. Any future integration must
  be labelled postings, not hiring.
- **Investor days, buyback authorisations and strategic reviews.** Announced
  as 8-K prose rather than as dated, typed events.

For every other symbol, all seven original gaps remain — the capture covers
AAPL only.

- `holdersSummary` is Ultimate-plan and above. Below it, the institutional
  category reports gated and coverage drops by 10 points.
- The coverage brackets in the attention provider (5 market-cap bands with an
  expected analyst count each) are a **stated assumption, not a measured
  distribution**. They are the crudest part of the score, and the calculation
  line on the signal says so.
