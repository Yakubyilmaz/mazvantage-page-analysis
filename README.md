# Maz Vantage — Stock Analysis

A full stock research report in one page. Five factors — **Valuation, Growth,
Profitability, Financial Health, Momentum** — each graded 0-5 from the ground
up: every ratio is ranked against its own sector, grouped into named subtopics,
and explained in a sentence saying what the number means and why it graded that
way. 115 ratios in all — 77 of them scored, the rest shown for context without
a grade — plus 13 fair-value models, income-statement and balance-sheet Sankeys,
dividend cover, management, ownership and a peer ranking.

> **Handing this to a developer?** Read [HANDOVER.md](HANDOVER.md) first. It
> covers where to plug in your own scores, and one trap in the sector-statistics
> builder that silently un-grades the whole Momentum factor.

Built as a static ES-module app. No framework, no build step, no bundler —
open a file, edit it, reload. All data comes from **Financial Modeling Prep**.

```bash
python serve.py
```

Then `http://localhost:8792/?symbol=AAPL`. Change `?symbol=` for any ticker
FMP covers, or use the search box in the header.

> It must be served over `http://`. Opening `index.html` straight off disk
> fails, because browsers refuse ES-module imports on `file://`.
> `serve.py` also sends `Cache-Control: no-store`, without which an edited
> module keeps serving its old version until a hard reload.

---

## Connecting your FMP key

Open **Settings** (the gear, top right) and paste your key. It is written to
`localStorage` in your browser and sent only to `financialmodelingprep.com` —
it never touches this repo or any other host.

You can also pass it once as `?apikey=…`; the app stores it and immediately
strips it back out of the address bar so it does not linger in history.

With no key configured the report renders from the bundled snapshot in
`assets/data/AAPL.json`, captured 24 Aug 2026. That is what makes the app
work out of the box.

### What your plan covers

The **FMP-moi** key is on an Ultimate-tier plan: every feed the report asks
for came back live, including the ones most reports have to do without —
annual statements going back ten years, dividend history, executive
compensation, insider Form 4 filings and 13F institutional holdings.

So nearly every ratio resolves, and the **Data Status** section at the bottom
of every report shows the state of all 28 feeds for whatever ticker you loaded,
alongside how many ratios each factor was actually graded on.

The plan-degradation machinery still matters, though. FMP gates by endpoint,
coverage varies by ticker and exchange, and any feed can simply return
nothing for a small or foreign listing. When that happens the dependent ratios
are **left out of the average**, never scored zero — a missing feed lowers how
much of a factor was measured rather than silently pushing the grade down. Each
section says how many of its ratios were graded.

### Trailing twelve months beats the last annual filing

Where a figure exists both as a TTM ratio and in the most recent annual
statement, the report uses the TTM one. An annual filing can be eleven months
old by the time it is still the newest, and the headline balance sheet should
describe the company as it is now. The annual statements drive *history* —
trends, growth rates, the ten-year charts — not the current position.

That ordering is what makes the headline numbers line up with the source
data: equity US$107.5b, total debt US$84.3b, total assets US$383.3b, revenue
US$466.8b, earnings US$128.9b for Apple, rather than the FY2025 figures which
are materially different.

When the statement feeds are missing entirely, the balance sheet is instead
solved from the ratio feeds — exact arithmetic, not estimation:

| Figure | Derivation |
| --- | --- |
| Shares outstanding | `marketCap / price` |
| Shareholder equity | `bookValuePerShare × shares` |
| Total debt | `debtToEquity × equity` |
| Cash | `cashPerShare × shares` |
| Operating / free cash flow | corresponding per-share figure × shares |
| Current liabilities | `workingCapital / (currentRatio − 1)` |
| Current assets | `currentRatio × currentLiabilities` |
| Long-term liabilities | `totalLiabilities − currentLiabilities` |

The current-liabilities solve is ill-conditioned when the current ratio sits
near 1, so the result is only accepted when it lands inside total liabilities;
otherwise the dependent checks go to *not assessed*.

### Saving a snapshot

**Settings → Save `<SYMBOL>`.json** writes everything the current report
loaded to a file. Drop it in `assets/data/` and that ticker renders with no
API key at all — useful for pinning a point in time, or for handing someone a
report without handing over your key.

`assets/data/AAPL.json` ships as an example, captured 24 Aug 2026.

---

## The five factors

The flake in the left rail has one spoke per factor, each scored **0–5** as a
continuous number with a letter grade beside it. Radius runs linearly from a
small nub at 0 to the outer ring at 5, so a zero still shows. Click a spoke to
jump to its section.

| Factor | Asks |
| --- | --- |
| **Valuation** | Is it cheap for what you actually get? |
| **Growth** | Is it getting bigger, and does that reach the bottom line? |
| **Profitability** | Does it turn revenue into money, and keep it? |
| **Financial Health** | Could it survive a bad year? |
| **Momentum** | What has the market been doing with the shares? |

Dividend, Management, Ownership and Competitors remain as sections but sit off
the flake. Management keeps its own 0–4 pass/fail panel, because tenure and pay
are not ratios you can rank against a distribution.

### How a grade is built

Every one of the ~90 ratios in the report is graded the same way:

1. Read the company's figure.
2. Find where it sits in the distribution of that same ratio across its
   **sector** — the percentile.
3. Orient it so 1 is always good. A low P/E scores high; a low margin scores
   low. Each metric declares `better: 'high' | 'low'` in `factors.js`.
4. `grade = percentile × 5`, and a letter from `LETTER_BANDS` in `grading.js`.

A subtopic is the mean of its ratio grades. A factor is the mean of **all** its
ratio grades — not the mean of its subtopic scores, or a two-ratio subtopic
would outweigh an eight-ratio one and the weighting would be an accident of
page layout. The headline score is the equal-weighted mean of the five factors.

A ratio that cannot be evaluated is **left out of the average**, never scored
zero. A gated feed lowers how much of the factor was measured, which each
section states, rather than silently pushing the grade down.

### The median tick is not a score

Beside every ratio name is a tick or a cross showing which side of the sector
**median** the company falls on. It is a reading aid and carries no weight —
scores are the mean of the grades and nothing else. The two can disagree: a
ratio can sit just past the median (a cross) and still grade near 2.5, because
the tick asks *which side* and the grade asks *how far*.

### Subtopics

Each factor breaks into named subtopics, defined in `assets/js/factors.js`:

**Valuation** — What the Cash Flows Are Worth · What You Pay for the Whole
Business · What You Pay for a Single Share · How the Price Compares · What
Comes Back to You

**Growth** — Is the Top Line Still Moving · Does It Reach the Bottom Line · Is
the Growth Turning into Cash · What It Costs to Keep Growing · What the Street
Expects Next · What Reaches Shareholders

**Profitability** — Margins, Down the Income Statement · What the Capital
Actually Earns · How Hard the Assets Work · Is the Profit Real

**Financial Health** — Can It Pay the Next Bill · How Much Is Borrowed · Can It
Carry What It Owes · The Distress Screens · What Actually Sits Behind the Share

**Momentum** — How the Price Has Travelled · Versus the Field · Where It Sits in
Its Range · How Rough the Ride Is · What the Street Is Doing

### Adding or moving a ratio

One entry in `METRICS`, then its id in a subtopic's `metrics` list:

```js
peGaapTtm: {
  label: 'P/E GAAP (TTM)', fmt: FMT.x, better: 'low',
  get: (c) => c.facts.pe,
  explain: (c, m) => `…one sentence, using the graded result m…`,
},
```

`dist` points at a different distribution key when the metric borrows one — the
forward multiples grade against their trailing distribution, same ratio family.
`absolute: [lo, hi]` replaces the sector distribution with a fixed ruler, for
the few judgments that are not sector-relative: a 30% discount to fair value
means the same thing in Utilities as in Software.

---

## Sector distributions

The grades depend on knowing how the whole sector looks. That lives in
`assets/data/sector-stats.json`: per sector, per ratio, 21 percentile
breakpoints (p0, p5 … p100). The browser loads it once and interpolates, so a
report costs **no extra requests** no matter how many ratios it grades.

### Build it from real data

```bash
python tools/build_sector_stats.py --apikey $FMP_KEY
```

Two passes. One `batch-exchange-quote` call per exchange covers the whole
market for the price-based ratios; the fundamentals then need a call per
company, so that pass samples up to `--sample-per-sector` (default 250) names
per sector. Sampling is **stratified by market-cap decile**, not "biggest N" —
a top-N sample would put the megacaps at the median and quietly flatter every
large company the report grades.

```bash
python tools/build_sector_stats.py --apikey $FMP_KEY --sample-per-sector 400
python tools/build_sector_stats.py --apikey $FMP_KEY --sectors Technology
```

The output is tagged `"source": "measured"`.

### The score distribution chart

`sector-stats.json` also carries an `overall` histogram per sector — 20 buckets
across the 0–5 scale — which is what the **Score Distribution** chart plots and
what the "ranked better than N companies" line counts.

The measured builder produces it by scoring every sampled company exactly the
way the report scores the one on screen: percentile per ratio, oriented so high
is good, averaged. That matters — a histogram built any other way would put the
marker in a distribution it does not belong to. The direction table
(`LOWER_IS_BETTER` in `build_sector_stats.py`) has to stay in step with
`better: 'low'` in `factors.js` or the two would rank companies opposite ways.

### The seed table

What ships in this repo is a **seed**, tagged `"source": "seed"` and generated
by `tools/make_seed_stats.py`. The distributions are modelled — lognormal for
the bounded-below ratios, normal for those that go negative — centred on
published sector medians, with the P/E centres anchored on FMP's sector P/E
snapshot. The overall histogram is modelled too: a normal around 2.5 whose
spread assumes ratios are correlated but not identical. It exists so the report grades sensibly out of the box, and the
Factor Grades section carries a standing notice while it is in use.

**Replace it with measured data before trusting a percentile.** A seed grade is
directionally right and precisely wrong.

### When a sector is missing

If the table has no entry for a company's sector, or none for a particular
ratio, that ratio is graded against the **live peer set** instead — the
`stock-peers` list whose ratios the report already fetches. Those rows are
tagged, and the column header changes from *Sector Relative Grade* to *Peer
Relative Grade*. The report never claims a sector percentile it did not measure.

### What Momentum can and cannot measure

The range and volatility ratios — price against the 50- and 200-day averages,
position in the 52-week range, beta — are graded from the table like any other,
because the quote endpoint carries them for the whole market cheaply.

The return ratios are graded against the **sector ETF and the S&P 500**, not a
cross-section of 900 companies' price histories, which no bulk endpoint offers.
*Versus the Field* is that comparison made explicit.

---

## Tuning the model

Every threshold lives in `DEFAULT_BENCHMARKS` at the top of
`assets/js/model.js`, and the main ones are editable from **Settings** without
touching code:

- risk-free rate, market earnings and revenue growth, high-growth bar
- high-ROE bar, dividend notable / top-tier yields, payout ceiling
- net-debt-to-equity ceiling, debt and interest coverage floors
- management and board tenure bars
- the AAA yield used by the fair-ratio model

These thresholds now drive only the fair-ratio model, the dividend cover
notes and the management checks. The sector comparisons that used to rely on
the hand-typed `industryPe` table are measured from `sector-stats.json`
instead, so "P/E vs sector median" is a real aggregate rather than an estimate.

Two further knobs are code-only:

- `LETTER_BANDS` in `assets/js/grading.js` — where A stops and B begins. The
  ladder is deliberately harsher below the midpoint, which is what makes a 1.6
  read as a D rather than a C.
- the shapes in `tools/make_seed_stats.py`, if you keep using the seed table.

Settings writes to `localStorage` under `mazvantage.benchmarks`; **Reset
benchmarks** clears it.

---

## Files

```
index.html                  shell — fonts, stylesheets, #app mount
serve.py                    local no-cache server
README.md                   this file
assets/css/tokens.css       design tokens; light theme overrides semantics only
assets/css/app.css          layout and components
assets/js/app.js            routing, chrome, settings, fetch → analyse → render
assets/js/fmp.js            FMP connector: 27 feeds, caching, plan-gate detection
assets/js/model.js          facts, forecast, history, momentum — the numbers
assets/js/grading.js        percentile -> grade -> letter; the sector lookup
assets/js/factors.js        the factor/subtopic/ratio tree and its explanations
assets/js/valuation-models.js  13 fair-value models: 6 multiples, 6 DCF, 1 vendor
assets/js/gradeview.js      renders a graded factor: score header, ratio tables
assets/js/charts.js         SVG primitives: line, column, forecast, range, gauge, donut
assets/js/snowflake.js      the Vantage Flake radar
assets/js/sections.js       the narrative sections — overview, dividend, ownership
assets/js/ui.js             shared building blocks: cards, blocks, tables, notices
assets/js/util.js           formatting and DOM helpers
assets/data/AAPL.json       bundled snapshot, so the app works with no key
assets/data/sector-stats.json  sector percentile table (seeded; rebuild it)
assets/img/                 brand marks
HANDOVER.md                 integration guide for a developer taking this on
tools/build_sector_stats.py generates that table from FMP
tools/make_seed_stats.py    generates the modelled fallback shipped here
```

The layering matters: `fmp.js` is the only file that knows a URL, `model.js`
is the only file that reads a vendor field name, `grading.js` is the only file
that turns a number into a grade, and `gradeview.js` only formats. Adding a
ratio means touching `factors.js` alone — plus one line in `model.js` if the
underlying figure is not already derived.

### Adding a snapshot for another ticker

Easiest route is **Settings → Save `<SYMBOL>`.json** with the ticker loaded,
then move the file into `assets/data/`. By hand, the shape is:

```json
{
  "symbol": "MSFT",
  "capturedAt": "2026-08-24",
  "extras": { "peerRatios": { "AAPL": { "priceToEarningsRatioTTM": 35.3 } } },
  "feeds": { "quote": { }, "profile": { }, "ratiosTtm": { } }
}
```

Keys under `feeds` are the feed names from `FEEDS` in `fmp.js`; each value is
the payload that feed would have returned. Anything missing simply degrades.

Two feeds are worth capturing deliberately. `growth` fills the Growth factor
directly — without it those ratios fall back to the annual statements, which
works but covers less. And the richer `extras.peerRatios` is, the more ratios
the competitor ranking can compare peers on; the bundled AAPL snapshot carries
only three fields per peer, so that table falls back to a valuation-only sort.

`extras.benchmarks` holds the comparison price series, in the same shape as the
`prices` feed:

- `industry` — the matching SPDR sector ETF (`SECTOR_ETF` in `app.js`; XLK for
  Technology). Drives the sector row of **Shareholder Returns**, the *Return vs
  Industry* verdict, and *Excess return vs sector* under Momentum.
- `market` — SPY. Drives *Excess return vs market* under Momentum.

The bundled AAPL snapshot ships `industry` (250 daily XLK closes over the same
window as its own price series) so the sector comparison works with no key.
`market` is not bundled, so anything comparing against the S&P 500 reads
"not available" until you connect a key.

---

## Performance and quota

A report fires up to 28 feed requests, five at a time, plus one per peer for
the peer comparison and two benchmark price series (SPY and the matching SPDR
sector ETF) for the returns and *Versus the Field* rows. Results are cached per
ticker and feed for ten minutes, so moving between sections and back costs
nothing. **Refresh** in the header clears the cache and refetches.

Grading adds nothing to that. `sector-stats.json` is one static file fetched
once per page load and shared by every ratio on the page — which is the whole
reason the distributions are precomputed rather than screened live.

---

## Known limits

- **The sector table goes stale.** Grades are only as current as the last
  `build_sector_stats.py` run; ratios move with the market. Rebuild it monthly.
  The shipped table is a *modelled seed*, not measured data — see **Sector
  distributions**.
- **The fundamentals pass is a sample.** 250 companies per sector by default,
  stratified by market cap. The middle of each distribution is solid; the
  extreme tails are thin, so a p97 reading is less trustworthy than a p60 one.
  Raise `--sample-per-sector` if that matters to you.
- **Volatility is a simple estimator** — the standard deviation of
  non-overlapping five-day returns over the last year. It needs about three
  months of prices before it reports anything.
- **Ungraded is not zero.** A factor averaged over 8 of its 17 ratios is not
  the same as one averaged over all 17. Every factor header says which it is.
- **The median tick never moves a score.** It marks which side of the sector
  median a ratio falls on, nothing more.
- **Not investment advice.** Everything here is generated from vendor data and
  the model in this repo, with no view on your circumstances. Verify anything
  you intend to act on against primary filings.
