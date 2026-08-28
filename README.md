# Maz Vantage — Stock Analysis

Five factors graded 1–5 against a size-matched peer cohort, each one
decomposing into the metrics that produced it — plus the ten-year record,
ownership, dividend and management evidence behind them.

The point of the decomposition is that a grade nobody can interrogate is just
a number. Every metric shows its value, its rank inside the cohort, the
cohort's distribution, and a sentence saying what it means.

Static ES-module app. No framework, no build step, no bundler. All data comes
from **Financial Modeling Prep**.

```bash
python serve.py
```

Then `http://localhost:8792/?symbol=AAPL`. Change `?symbol=` for any ticker
FMP covers, or use the search box.

> It must be served over `http://` — browsers refuse ES-module imports on
> `file://`. `serve.py` also sends `Cache-Control: no-store`, without which an
> edited module keeps serving its old version until a hard reload.

---

## The five factors

Value · Growth · Profitability · Health · Momentum, each graded **1 to 5**,
combined into a weighted composite that maps to Strong Sell → Strong Buy.

The set is deliberately not Simply Wall St's. Theirs spends two of five axes
on growth — Past Performance and Future Growth are both growth measures and
correlate heavily — and burns a third on Dividend, which structurally caps
every non-payer for a reason that has nothing to do with business quality.
These five are near-orthogonal and match the factor canon the quant
literature actually uses.

Dividend and Management are kept as **evidence sections, not grades**, for
that same reason.

### Scoring is relative, not absolute

A 35x earnings multiple is expensive for a utility and cheap for a
semiconductor designer, so no metric is compared to a fixed threshold. Each is
graded by where the company falls in a cohort of comparable companies:

```
grade = 1 + 4 × goodness_percentile
```

Ties count at half rank, and the percentile flips for metrics where low wins.
A factor grade is the weighted mean of its metric grades; the composite is the
weighted mean of the five factors.

### How the cohort is built

1. Screen the company's own **industry**, floored at 1/50th of its market cap
   so micro-caps do not pollute a mega-cap comparison.
2. If that yields fewer than 8 names, widen to the **sector**. Apple's
   Consumer Electronics industry has only three listed names above $2b, so it
   falls through to Technology.
3. Union in whatever FMP lists as direct peers.
4. Collapse cross-listings — MU and MU.TO are one company.
5. Keep the 14 closest in **log market cap** to the subject. Size-matched
   beats simply-biggest: comparing Apple to Apple-sized companies says more
   than comparing it to whatever happens to be largest.

The cohort is listed in full in its own section, so you can always see who the
grade was measured against.

### Where no peer comparison exists

Forward consensus growth, technical position and analyst revisions have no
directly comparable peer figure, so they are graded against **documented
bands** instead — visible in `assets/js/metrics.js`, and labelled as such in
the UI so a band-graded metric is never mistaken for a ranked one.

### The metrics

| Factor | Metrics |
| --- | --- |
| **Value** | P/E · EV/EBITDA · P/FCF · FCF yield · P/S · PEG · discount to DCF |
| **Growth** | revenue 1y and 3y · earnings 1y and 5y · forecast revenue and earnings |
| **Profitability** | gross, operating, net and FCF margin · ROIC · ROE · earnings quality |
| **Health** | net debt/EBITDA · debt/equity · current ratio · interest cover · OCF/debt · Altman Z |
| **Momentum** | 12-1m, 6m and 3m vs sector · price vs 200d · 52-week position · analyst revisions · surprise streak |

Momentum uses the **12-1** construction — twelve months excluding the most
recent one — which is the standard academic definition, because the skipped
month strips out short-term reversal.

Growth rates are the **median year-on-year step** across the consensus window,
not an endpoint CAGR. Consensus paths routinely carry one bad year because a
different subset of analysts covers each horizon; Apple's 2029 revenue
consensus currently sits *below* its 2028 figure, and an endpoint CAGR would
inherit that wholesale.

### Every grade shows its work

Each metric expands to show:

- the value and where it ranks — *"6th of 7 in Technology, against a peer
  median of 45.3%"*
- a **distribution strip**: the cohort's range, its interquartile box, its
  median, and a marker for the company
- a trend where one is computable — the current multiple against its own
  ten-year median, this year's margin against five years ago
- a sentence saying what the number actually means

A metric with no usable cohort keeps its value but drops out of the weighted
average rather than scoring zero, so missing data lowers confidence instead of
silently dragging the grade down.

---

## Connecting your FMP key

Open **Settings** and paste your key. It is written to `localStorage` and sent
only to `financialmodelingprep.com` — it never touches this repo or any other
host. You can also pass it once as `?apikey=…`; the app stores it and strips
it back out of the address bar.

With no key configured the report renders from `assets/data/AAPL.json`,
captured 24 Aug 2026.

### What your plan covers

The **FMP-moi** key is Ultimate-tier: every feed the report asks for comes
back live, including ten years of statements, dividend history, executive
compensation, insider Form 4 filings, 13F holdings, and the sector screener
the cohort is built from.

The degradation machinery still matters — coverage varies by ticker and
exchange, and any feed can return nothing for a small or foreign listing. When
that happens the dependent metric shows its value but goes ungraded, and the
**Model & Data** section lists the state of all 34 feeds.

### Trailing twelve months beats the last annual filing

Where a figure exists both as a TTM ratio and in the most recent annual
statement, the report uses the TTM one. An annual filing can be eleven months
old by the time it is still the newest, and the headline balance sheet should
describe the company as it is now. Annual statements drive *history* — trends,
growth rates, the ten-year charts — not the current position.

That ordering is what makes the headline numbers match the source data for
Apple: equity US$107.5b, debt US$84.3b, assets US$383.3b, revenue US$466.8b,
earnings US$128.9b, rather than the materially different FY2025 figures.

When statement feeds are missing entirely, the balance sheet is solved from
the ratio feeds instead — exact arithmetic, not estimation:

| Figure | Derivation |
| --- | --- |
| Shares outstanding | `marketCap / price` |
| Shareholder equity | `bookValuePerShare × shares` |
| Total debt | `debtToEquity × equity` |
| Cash | `cashPerShare × shares` |
| Operating / free cash flow | corresponding per-share figure × shares |
| Current liabilities | `workingCapital / (currentRatio − 1)` |
| Current assets | `currentRatio × currentLiabilities` |

The current-liabilities solve is ill-conditioned when the current ratio sits
near 1, so it is only accepted when the result lands inside total liabilities.

### Saving a snapshot

**Settings → Save `<SYMBOL>`.json** writes everything the report loaded,
including the cohort, to a file. Drop it in `assets/data/` and that ticker
renders with no API key — useful for pinning a point in time, or handing
someone a report without handing over your key.

---

## Tuning the model

**Settings** exposes the two things worth changing:

- **Composite weights** per factor. Defaults are Profitability 25%, Value /
  Growth / Health 20% each, Momentum 15% — quality weighted highest because it
  is the most persistent of the five. They are normalised, so they need not
  sum to 1.
- **Evidence thresholds** for the unscored Dividend and Management checks.
  Nothing else uses a threshold; every factor metric is peer-graded.

Deeper changes live in two files, both readable end to end:

- `assets/js/metrics.js` — the metric definitions. Adding a metric means
  adding one object: how to read it off the company, how to read it off a
  peer, which direction is good, its weight, and the sentence it explains
  itself with.
- `assets/js/cohort.js` — cohort construction and the percentile-to-grade
  mapping.

---

## Files

```
index.html                  shell — fonts, stylesheets, #app mount
serve.py                    local no-cache server
README.md                   this file
assets/css/tokens.css       design tokens; light theme overrides semantics only
assets/css/app.css          layout, grade bars, metric rows
assets/js/app.js            three-pass loading, chrome, settings
assets/js/fmp.js            FMP connector: 34 feeds, caching, plan-gate detection
assets/js/cohort.js         peer cohort construction + percentile statistics
assets/js/metrics.js        the metric definitions — the model's rulebook
assets/js/model.js          facts, forecast, history, momentum, factor scoring
assets/js/factors.js        factor sections, scorecard, cohort table
assets/js/sections.js       overview, price, history, dividend, management, ownership
assets/js/charts.js         SVG primitives incl. the distribution strip
assets/js/snowflake.js      the five-axis radar, 1-5 scale
assets/js/util.js           formatting and DOM helpers
assets/data/AAPL.json       bundled snapshot, so the app works with no key
```

The layering matters: `fmp.js` is the only file that knows a URL,
`metrics.js` is the only file that decides what a good number looks like, and
the render layer only formats.

---

## Performance and quota

A live report runs three passes:

1. ~28 feeds for the company itself
2. 5 sector/industry screens and benchmark feeds
3. 3 feeds for each of up to 14 cohort members

Roughly 75 requests, six at a time, cached per ticker and feed for ten
minutes. Heavier than a single-company screen — that is what buying a real
peer distribution costs. Lower `MAX_COHORT` in `cohort.js` to trade precision
for speed.

---

## Known limits

- **Cohort size is capped at 14.** A percentile from 14 names is coarser than
  one from a whole sector, but fetching ratios for 200 companies per report is
  not a trade worth making. The cohort is always listed so you can judge it.
- **A thin industry falls through to the sector.** Apple ends up compared
  against large-cap Technology rather than Consumer Electronics, which has
  three listed names. The report says which basis it used.
- **Band-graded metrics are judgement calls.** Forward growth, technical
  position and revisions have no peer equivalent; the bands are in
  `metrics.js` and should be tuned to your universe.
- **Momentum falls back to absolute return** when no sector benchmark loads,
  and says so rather than silently changing meaning.
- **Not investment advice.** Grades come from vendor data and the model in
  this repository, with no view on your circumstances.
