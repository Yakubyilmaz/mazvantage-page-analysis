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
full report. Any static file server works; `serve.py`
just adds `Cache-Control: no-store`, without which an edited module keeps
serving its old version.

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
| FMP feeds | 27 |
| JS | ~8,700 lines, no dependencies |

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
assets/js/fmp.js                FMP connector: 27 feeds, caching, plan-gate detection
assets/js/model.js              facts, forecast, history, momentum — the numbers
assets/js/grading.js            percentile -> grade -> letter; the sector lookup
assets/js/factors.js            the factor/subtopic/ratio tree and its explanations
assets/js/valuation-models.js   13 fair-value models (6 multiples, 6 DCF, 1 vendor)
assets/js/gradeview.js          renders a graded factor: tables, pairs, panels
assets/js/charts.js             SVG primitives — no chart library
assets/js/snowflake.js          the Vantage Flake radar
assets/js/sections.js           narrative sections — overview, dividend, ownership
assets/js/overview.js           the Overview tab: company head, score card, card grid
assets/js/ui.js                 shared building blocks
assets/js/util.js               formatting and DOM helpers

assets/data/AAPL.json           bundled snapshot, so the app works with no key
assets/data/sector-stats.json   sector percentile table — SEEDED, see §3
assets/img/                     brand marks

tools/build_sector_stats.py     measured distributions from FMP — incomplete, see §3
tools/make_seed_stats.py        the modelled fallback shipped here
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
- **Three spec ratios are blocked by the data plan.** §5.
- **Annual, not quarterly.** §5.
- **Column-chart bars are not labelled** — a multi-series column chart relies on
  its legend rather than labelling each bar in place. Outstanding.
- **Company identity details were removed** with the "Other Information" section
  (exchange, ISIN, CIK, listing date, head office). The data is still in
  `a.facts`; nothing renders it.
- **Ten of the twelve tabs are inert.** Overview and Analysis switch panels;
  the other ten are marked `aria-disabled` and greyed, so a tab with nothing
  behind it says so. `LIVE_TABS` in `app.js` is the list that switches, and
  `selectTab()` is where a new panel is plugged in.
