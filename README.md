# Vanlior — Stock Analysis

A full stock research report in one page. Five factors — **Valuation, Growth,
Profitability, Financial Health, Momentum** — each graded 0-5 from the ground
up: every ratio is ranked against its own sector, grouped into named subtopics,
and explained in a sentence saying what the number means and why it graded that
way. 115 ratios in all — 77 of them scored, the rest shown for context without
a grade — plus 13 fair-value models, income-statement and balance-sheet Sankeys,
dividend cover, management, ownership and a peer ranking.

There is also a **Research** tab, which lays the same data out as an equity
research report in the shape the big houses publish: a rating band, a
price-against-fair-value chart, an analyst note, then moat, fair value, risk,
capital allocation and the financials.

It leads with the **Vanlior quant rating** — the report's own composite,
a verdict word, a letter and a score out of five over every ratio that could be
ranked against the sector. Beside it sits a separate **valuation zone**: the
price against the median of thirteen fair-value models, banded by an
uncertainty rating. Those answer different questions and are meant to be read
together; Apple currently rates Hold while screening Overvalued, and that
disagreement is the finding. The tab also carries an economic moat rating, a
capital allocation rating and a style box, each printing the inputs it was
computed from.

The long-form narrative is **written by a language model**, not by a person and
not by a template. It is constrained to a brief of pre-computed, pre-formatted
figures and instructed to quote them verbatim and invent nothing — the model is
given numbers and asked for prose, never asked for a number. Apple ships a
~2,800-word narrative as the reference; every other ticker falls back to a
shorter deterministic prose assembled from the same figures, and the byline on
each section says which you are reading. See
[assets/js/narrative.js](assets/js/narrative.js) for the brief, the prompt and
the seam a live model service plugs into.

A **News** tab keeps press coverage and the company's own releases in two
separate streams, unscored and unranked.

Alongside the company report there is a **research feed** at `?view=research` —
original analysis filed under seven editorial categories (Stock Analysis,
Earnings, Quant Ratings, Valuation, Dividends, Investment Ideas, Shariah) and
filterable by article type, sector, industry, theme, ticker, quant rating and
Shariah status. The filters are the URL, so a filtered feed is shareable and
the back button steps through them:

```
?view=research&category=earnings&type=earnings-analysis
?view=research&category=shariah&type=shariah-idea&industry=Semiconductors
```

The taxonomy is deliberately parametric: "Top Halal Semiconductor Stocks" is
not a category and not a template, it is `shariah` + `shariah-idea` +
an industry that came from the article's tickers. Every article links into the
company reports it names, and the company Overview and News tabs link back.

**The articles that ship are sample editorial data** — thirty fixtures on real
tickers with realistic figures, so the feed, the taxonomy and the article
layout can be seen working end to end. Nothing in them is live and the page
says so. Two of the thirty quote the bundled AAPL snapshot's own numbers, so at
least one worked example agrees with what the report renders.

**Investment Ideas** at `?view=ideas` is 40 portfolio screens — a thesis, a set
of rules, and the companies that currently pass them — filed into 11 groups. The
first group, **Featured screens**, is fourteen presets named after Seeking
Alpha's published screeners, so a reader arriving from that product finds what
they know by the name they know it by. The names are theirs; the thresholds are
not published anywhere, so the rules behind each one are ours and are argued for
on the page.
Open one and its rules are **controls**: change a threshold, drop a rule, add
one from forty metrics, and run it again across every listed US company over the
size floor you set. A dropdown at the top switches to any other portfolio
without going back to the directory.

The screener is the portfolio rather than a second thing. Every rule records
what it filters on beside the closure that tests it, so a published screen can
be read out as filters, edited, and rebuilt — and the engine never learns it was
edited. Re-running is close to free because the feeds are already cached; the
first run is the expensive one, and the panel prints what it will cost.

Down the left rail sits a nav of ten pages that are not about one company:
**Markets Data** (a TradingView-style overview at `?view=markets`: indices,
US stocks, world stocks, futures and commodities, government bonds, corporate
bond ETFs, ETFs and the economy, with symbol selectors, interactive area and
candlestick charts, searchable rankings and calendars), **Market News**,
**Stock Screener**
(a directory of every listed company, plus screens over the whole market),
**ETF Screener** (the same table pointed at funds, with the collections that
cut five thousand listings down), **Sectors** (a breakdown across all eleven,
then one page each with its top 50 companies), **Investment Ideas** (40
portfolio screens, each openable as an adjustable screener), **Research** (the
article feed, plus the page that explains what the whole product believes),
**Earnings** (the transcript library and a beat/miss scorecard), **Quant** (one
table, eight rankings, and the three tabs that explain the rating behind them)
and **Shariah** (the compliance screen run market-wide, with its methodology and
purification written out). Each opens a flyout menu on hover. Three destinations
across those menus are deliberately not built — two need stored history the app
does not keep, and one points at an existing page that already does the job
better; each says so on the page rather than rendering something else under the
label.

**Stocks and funds are two menus, not one.** They used to share the Stock
Screener flyout, which quietly said they were the same kind of thing. They are
not: a company is *scored* — every ratio ranked against its own sector — and a
fund cannot be, because nothing here grades a basket. So an ETF collection is
a **selection** rather than a ranking, and it gets its own menu saying so. The
type dropdown inside the screener still moves between the two with the country,
the filters and the search intact.

**Earnings and Shariah are tables too, for the same reason.** Both were sets
of near-identical run-a-screen pages, and both are now one canvas with a rail
of screens over one table.

**Earnings** (`?view=earnings`) reads the calendar, which returns one row per
company per report: the date, the consensus that preceded it, and — once the
result is in — the actual. Every question anyone asks of it is a filter over
those four numbers, so there are six: **Upcoming, Reported, EPS beats, EPS
misses, Revenue beats** and **Double beats**, over a window of 7, 14, 30 or 90
days. A row with no actual has not reported, which is what separates Upcoming
from the other five. The calendar carries a symbol and nothing else about the
company, so it is **joined to one screener call** for the name, sector and
size — and that join is also the filter, because the calendar covers Toronto,
the venture board and the OTC sheets, and a row the US screener does not
return is counted above the table rather than shown with three empty columns.
A surprise is the actual over the size of the estimate, left empty where
consensus was within half a cent of zero, because any result over an estimate
that small is a four-figure percentage rather than news. Three more tabs:
**Insights** is the written work on results — the editorial layer over the
arithmetic, filterable by Earnings Analysis, Preview, Surprise and Guidance;
**Transcripts** is the call library as a searchable table, led by the handful
of calls somebody wrote a summary for; **Method** says what the desk measures
and what it does not — no model reads a transcript here, and a beat rate above
half is the market's normal state rather than a signal.

Insights is **a view of the research store, not a second one**. The taxonomy
has carried an Earnings category with those four types since the feed was
built, so the tab adds no schema and no fixture: it filters the same articles
through the same `matches`, renders the same card the feed renders, and links
out to `?view=research&category=earnings` for the sort, pagination and eight
other filters rather than reimplementing them. An article filed under Earnings
appears on both surfaces, and opening one from either lands on the same URL.

**Shariah** (`?view=shariah`) runs five screens over one compliance universe:
**Halal Screener, Top Halal, Halal Dividend, Halal Growth** and **Halal
Value**. The first three rules are the compliance test and never change — they
are marked as such on every screen — and each screen adds its own on top, so
the funnel under the table reads "this many were compliant, then this many of
those were also cheap", which is the order a reader filtering for halal names
actually thinks in. The screens moved whole into `shariah-screens.js` and are
registered as screener presets, so one definition serves the desk, the
screener dropdown and any link that names one. Three more tabs: **Methodology**
prints the five published standards with their limits *and their divisor* —
two of the five divide by total assets rather than market cap, which is a
different test on the same company — and lists the three tests the providers
run that this screen does not; **Purification** explains the income the
threshold admits and says plainly that the ratio needed to compute it is the
provider's, not ours; **Compliance Changes** is the honest refusal, and the
same missing database the Quant desk asks for.

**Quant is one table with the screen as a control.** `?view=quant` opens a
canvas with four tabs. The first is a screener carrying the eight rankings this
menu is named for — Top Quant Stocks, Top Valuation, Top Growth, Top
Profitability, Top Health, Top Momentum, Top Dividend and Top Signal Stocks —
each one a chip above the same table. Switching chips changes the ranking and
nothing else: the columns, the size floor, the country, the filters and the
search box stay where they are, which is what makes the eight comparable. Every
one of them **is an existing portfolio** from `ideas.js` under this menu's name,
so a threshold shown here can never drift from the one a portfolio page shows,
and each screen prints its own rules above the table — a threshold a reader
cannot see is one they cannot check. The other three tabs are the rating
explained on the product's own grade ladder, the five factors with the ratio
count behind each, and **Rating Changes**, which is the honest refusal: a
change needs yesterday's score, nothing is stored between sessions, and the tab
says what it would take instead of relabelling something else.

The **Home** page is the landing screen — a bare URL opens it, and it leads the
rail — and it is the market's front page: a banner of index levels and the
listings moving most, the wire down the middle with what is popular beside it,
then a section for each part of the market — a **market summary** that charts
one benchmark with the world's majors listed beside it, each row charting
itself, and the US series behind them; US stocks as gainers, losers, highest
volume and most volatile; ETFs; energy and metals; and the economy as the world
inflation map and the release calendar. Every section is the page it summarises, loaded
through the same adapter and rendered with the same rows, and each one loads
**when you scroll to it** rather than when the page opens. It is a market page,
so it needs a live key — and with none it says that once, at the top, instead
of printing the same box nine times.

Every page that lists a lot of companies — **All Stocks**, the **ETF
directory** — uses one dense table: column-set tabs (Overview, Valuation,
Profitability, Growth, Dividends, Performance, Analysts) over the same rows, a
sticky symbol column, and every header sorting. Overview is free because the
whole company list arrives in one request; the other tabs need two to five
requests *per company*, so each loads the fifty rows on screen when you ask and
tells you what that costs first.

The **Sectors** breakdown pairs the session bars with a **heatmap** on a fixed
colour scale — fixed rather than scaled to the best mover on screen, so a quiet
day looks quiet — and each sector's own page carries recent **news about its
largest constituents**. FMP publishes no sector-tagged news feed, so that is the
honest version of sector news: coverage of the thirty biggest companies in the
sector, and the page says so.

> **Handing this to a developer?** Read [HANDOVER.md](HANDOVER.md) first. It
> covers where to plug in your own scores, and one trap in the sector-statistics
> builder that silently un-grades the whole Momentum factor.

Built as a static ES-module app. No framework, no build step, no bundler —
open a file, edit it, reload. All data comes from **Financial Modeling Prep**.

```bash
python serve.py
```

Then `http://localhost:8792/` for the Home page, or
`http://localhost:8792/?symbol=AAPL` to open a report directly. Change
`?symbol=` for any ticker FMP covers, or use the search box in the header.

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

## The Alpha Signal

A second rating, kept deliberately separate from the quant score. The quant
rating asks *how good is this company relative to its sector, right now*. The
Alpha Signal asks *how much has recently changed here, and how few people are
looking*.

```
Quant Score:  2.89 / 5
Alpha Signal:   56 / 100   ·  74% data coverage  ·  medium confidence
```

Two scales, on purpose. A company can be excellent and static, or mediocre and
inflecting, and a shared scale would invite averaging two answers to different
questions. Every surface that prints both prints the sentence explaining which
of the four quadrants you are in.

Reach it two ways:

- **`?view=alpha`** — the desk: a capped market scan, the method, the limits.
- **the Alpha Signal tab** on any company report — full depth, one company.

### Eleven categories

| Category | Weight | What it reads |
| --- | --- | --- |
| Fundamental inflection | 20% | Quarterly revenue, margins and free cash flow |
| Revision momentum | 14% | Analyst rating mix history, price-target trend |
| Commercial momentum | 12% | Revenue mix by segment, announcement cadence |
| Institutional activity | 10% | 13F aggregate: ownership change, accumulation breadth |
| Insider conviction | 10% | Form 4 open-market purchases only |
| Catalysts | 9% | Next scheduled report, last earnings surprise |
| Price and volume | 8% | Relative strength over 3/6/12 months, participation |
| Investor attention | 7% | Analyst coverage and news volume against size |
| Product and investment | 5% | R&D intensity change |
| Workforce | 3% | Reported headcount from the last annual filing |
| Industry context | 2% | Sector ETF against the market |

The weights are a **stated starting allocation with an argument behind each
one, and nothing more**. No backtest supports them — this app stores nothing
between sessions, so there is no history to test against. The category scores
are more informative than the composite.

### Every signal carries its basis

Nothing on these pages is a bare number. Each signal records the figures it
read, the arithmetic it did, the source, the source date, its freshness, its
confidence, and what it does not prove. Click any signal for the drawer:

```
Revenue growth acceleration            CALCULATED SIGNAL   high confidence

Current 6.40%   Prior 2.00%   Change +4.40%

Platform calculation
  Year-on-year revenue growth for 2026 Q3 (6.4%) minus the same measure one
  quarter earlier (2.0%). Each quarter is compared with the same quarter a
  year before, never with the quarter preceding it, because the businesses
  covered here are seasonal.

Source
  SEC FILING · Quarterly income statement · Published 2026-07-31 — 53 days ago

Limitations
  Acquisitions, divestitures and currency are not stripped out. A company
  that bought revenue reads the same here as one that earned it.
```

Five badges keep provenance visible at a glance, and they are carried by the
word and the border weight rather than by colour — green and red are reserved
for direction everywhere in this product:

`VERIFIED FACT` · `CALCULATED SIGNAL` · `MODEL INTERPRETATION` ·
`ATTENTION DATA` · `INSUFFICIENT DATA`

### Missing data is shown, never filled

A category with no data behind it is **dropped from the score, not scored
zero** — the same rule the factor grades follow. Its weight is redistributed,
and the share that was dropped becomes the coverage figure printed beside
every score. A gated FMP plan therefore reads as an unmeasured company rather
than a bad one.

Confidence is then capped by coverage, last and unconditionally: below 40%
coverage the answer is low confidence, and below 65% it can never be high.

Each gap names the integration that would close it rather than shrugging.

For AAPL, five of the six have been closed by hand. `alpha-disclosures.json`
holds facts read from a primary source and typed in, each carrying the URL it
came from — the same trade `summaries.json` already makes for earnings-call
summaries, because the app ships no scraper:

| Gap | Closed with | Source |
| --- | --- | --- |
| Consensus EPS revisions | 90-day drift and 30-day revision breadth | Yahoo Finance |
| Backlog | A measured absence, plus deferred revenue | Apple FY2025 10-K |
| Patents | Granted US patents, two settled windows | Google Patents |
| Product launches | Dated launch cadence | Apple Newsroom |
| Corporate actions | Dividend declarations and the raise | Apple IR |
| Search attention | Weekly interest against its own year | Google Trends |
| Job postings | **Not closed** | Apple careers |

Those signals are the only ones in the engine whose source is a link you can
click and check. **Every other ticker still shows all seven gaps** — nothing is
defaulted, averaged across a sector, or carried over from another company.

Three things the capture did not paper over:

- **Apple does not disclose backlog.** The word appears zero times in its
  FY2025 10-K. That is recorded as a *measured absence in a primary source* and
  left deliberately unscored, because a missing disclosure is neither good nor
  bad news. Deferred revenue is shown beside it as the nearest thing the
  company does publish, labelled as not being an order book.
- **Patent counts lag.** A trailing-twelve-month count always undercounts, so
  comparing the newest window would show a 39% collapse that did not happen.
  Only settled windows are compared; the incomplete one is printed and
  explicitly not used.
- **Job postings could not be captured.** Apple's careers site reports "600+
  Result(s)" and returns that same capped figure for every filter, with no
  facet counts and an API that rejects unauthenticated requests. A capped total
  that does not move with the filter carries no information, so nothing was
  recorded — with the reason, so nobody repeats the investigation.

`tools/capture/README.md` has the source URL and exact query behind every
captured field.

**No social media, ever.** Reddit, X and message boards are not read by any
provider here and will not be. If an attention source is added it will be
labelled attention data, kept out of the fundamental categories, and never
presented as evidence about a company's financial condition.

### The written summary has no model behind it

Every sentence is emitted by the signal that owns the fact, with the numbers
taken from that signal's own fields. A value cannot be hallucinated because no
step composes one, and a citation cannot be invented because an evidence item
cannot be built without a real signal id. The trade is that the prose is
flatter than a language model's — it repeats sentence shapes, and it will
never notice that two findings are the same story told twice.

### It works with no API key

`assets/data/AAPL.json` bundles the five Alpha feeds as well as the report's
own, captured 2026-09-22. So `?symbol=AAPL&tab=alpha-signal` renders at **100%
data coverage across all eleven categories** before you have connected
anything — which is the quickest way to see what the feature actually does.

Every figure in that capture is real: Apple's filed quarterly statements, the
published analyst grade history, the price-target summary, and the aggregated
13F for the quarter ended 2026-03-31. None of it is synthesised. What it is
not is *live* — it is frozen at the capture date, while freshness weighting
and any days-until-earnings reading are measured against today. The page says
so under Sources.

Connect a key in Settings for a current read on any ticker; a live answer
always wins over the capture, and the capture only fills what the key could
not reach.

### The market scan is capped

The screener narrows the universe server-side; the Alpha Signal is then
computed in the browser for the largest survivors, up to a cap of 60, 150 or
300. Seven requests per company, so a scan runs on a button rather than on
arrival, and the result always states how many of how many were tested.

Sorting by market cap is the only free ranking the screener offers, and it
skews the tested set toward companies you have already heard of — close to the
opposite of what a discovery tool should do. The honest workaround is to
narrow the universe with the sector and size controls first, so the cap bites
on a shorter list.

### Running the tests

```bash
node tools/test_alpha.mjs
```

50 checks over the engine — no real network, no credentials, no DOM. They
cover signal provenance (an unsourced claim throws), the band arithmetic,
freshness decay, the coverage-capped confidence as a property across the whole
range, dropped-not-zeroed categories, archetype gating, provider resilience
against empty, gated and malformed feeds, the annual fallback, narrative
traceability, the rule that a configured key always beats the bundled capture,
and the capture layer — including the patent-lag trap and the rule that a
closed gap is replaced by a narrower one rather than silently dropped.

---

## Files

```
index.html                  shell — fonts, stylesheets, #app mount
serve.py                    local no-cache server
README.md                   this file
assets/css/tokens.css       design tokens; light theme overrides semantics only
assets/css/app.css          layout and components
assets/js/app.js            routing, chrome, settings, fetch → analyse → render
assets/js/fmp.js            FMP connector: 34 feeds, caching, plan-gate detection
assets/js/model.js          facts, forecast, history, momentum — the numbers
assets/js/grading.js        percentile -> grade -> letter; the sector lookup
assets/js/factors.js        the factor/subtopic/ratio tree and its explanations
assets/js/valuation-models.js  13 fair-value models: 6 multiples, 6 DCF, 1 vendor
assets/js/gradeview.js      renders a graded factor: score header, ratio tables
assets/js/charts.js         SVG primitives: line, column, forecast, range, gauge, donut
assets/js/snowflake.js      the Vanlior Flake radar
assets/js/sections.js       the narrative sections — overview, dividend, ownership
assets/js/research.js       the Research tab: the quant rating, the valuation zone, the report
assets/js/narrative.js      the long-form prose: the brief, the prompt, the live-model seam
assets/js/news.js           the News tab: press coverage and company releases
assets/js/nav.js            the nav bar: seven menus, their destinations, the routing model
assets/js/markets.js        Markets Data routing, movers, sectors, industries
assets/js/markethub.js      markets overview, the country picker, section
                            navigation and ranking dialogs
assets/js/markethub-data.js FMP adapters, the twenty-country model, the index
                            board, lazy loading and US-first issuer deduplication
assets/js/markethub-ui.js   the canvas's shared parts: formatters, instrument
                            marks, rails, dialogs, the remembered country
assets/js/markethub-chart.js interactive price charts, ranges and expanded view
assets/js/markethub-compare.js several instruments on one percentage axis
assets/js/markethub-widgets.js earnings/IPO calendars, yield curve and economic releases
assets/js/economy-chart.js  the Economy section's indicator rail and series chart
assets/js/etf-collections.js the ETF screener's collections, and the rule each one selects on
assets/js/marketboard.js    the board page both collections run on: summary
                            tab, a tab per collection, Overview/Performance
assets/js/marketindices.js  what that board knows about indices
assets/js/marketfutures.js  what it knows about futures contracts
assets/js/marketpages.js    US equities, ETFs and the economy
assets/js/markettable.js    the dense market table: column-set tabs, sticky
                            symbol column, every header sorts
assets/js/newsroom.js       Market News: the stream and its six categories
assets/js/marketrail.js     the market rail beside every page: the market summary,
                            the watchlist, the movers and the week's reports;
                            hides to a slim strip and remembers that it was hidden
assets/js/footer.js         the black footer on every page: every menu as a column
                            of links, read from nav.js, and the data disclaimer
assets/js/screens.js        Stock Screener — the directory and the screens over it
assets/js/quant.js          the Quant desk: eight rankings in one table, and the rating explained
assets/js/etfscreener.js    the ETF Screener page (?view=etfs)
assets/js/etf-tables.js     the seventeen curated ETF boards, and the two feeds behind them
assets/js/etf-board.js      the component that draws them: rail, catalogue search, sortable tables
assets/js/beatmarket.js     Beat the Market — the 3Y-return rule, shared by the Stocks and ETFs pages
assets/js/shariahdesk.js    the Shariah desk: five compliance screens in one table, plus method
assets/js/shariah-screens.js the AAOIFI screens themselves, registered as screener presets
assets/js/earningsdesk.js   the Earnings desk: the calendar as a screener, and the call library
assets/js/sectorpage.js     one page per sector, and the distribution behind its grades
assets/js/ideas.js          Investment Ideas: the 40 portfolios, their rules, the
                            filter registry and the screening engine
assets/js/portfolios.js     the portfolio directory, and one portfolio as a screener
assets/js/researchhub.js    the Research menu: routes the feed, an article and Strategy
assets/js/taxonomy.js       the research taxonomy: categories, article types, the query
assets/js/articles.js       the article store and the company directory behind it
assets/js/feed.js           the research feed on the canvas: hero, section strip, pills,
                            filter drawer, featured lead and card grid; the shared badges
assets/js/articlepage.js    one article: typed body blocks, ratings, related, topics
assets/js/earnings.js       the Earnings menu: transcript library, beat/miss scorecard
assets/js/pings.js          price-chart markers: insider Form 4s and 13F position changes
assets/js/calendar.js       the Calendar, on TradingView's: economic, earnings, dividends,
                            IPOs and splits; a week of day cards, one table per day
assets/js/dividend-model.js the dividend module's inputs: the payment record with specials
                            split out, the TTM sums, and the two forward workarounds
assets/js/dividend-lines.js the 64 lines of MAZ_DIVIDEND_SPEC_FULL.md, as data
assets/js/dividend-score.js the four composites: percentile per line, weighted, re-ranked
assets/js/dividendscores.js the Scores panel on the Dividends tab
assets/js/home.js           the landing page: the market banner, the wire, and a section per market
assets/data/research.json   pre-generated narratives, keyed by symbol (AAPL only)
assets/data/articles.json   SAMPLE research articles — 30 fixtures, nothing live
assets/js/alpha-signals.js  Alpha Signal vocabulary: the signal and source
                            factories, the eleven categories, the provenance
                            badges, freshness decay
assets/js/alpha-providers.js  eleven signal adapters, one per category — the
                            only Alpha file that reads a vendor field name
assets/js/alpha-score.js    weights, the reduction, coverage, the confidence
                            cap, the ten archetypes
assets/js/alpha-narrative.js  the written summary, assembled from signal
                            fields. No language model is involved
assets/js/alpha-disclosures.js  hand-captured facts for the six categories no
                            endpoint fills, and the signals built from them
assets/js/alphaview.js      components both Alpha surfaces share: score block,
                            category card, evidence drawer, badges
assets/js/alphatab.js       the Alpha Signal tab on a company report
assets/js/alphadesk.js      the Alpha Signal desk at ?view=alpha — the capped
                            scan, the method, the limits
assets/js/subscribe.js      plans and pricing at ?view=pricing: the four tiers, the
                            matrix, the checkout seam and the Offer JSON-LD
assets/js/ui.js             shared building blocks: cards, blocks, tables, notices
assets/js/util.js           formatting and DOM helpers
assets/data/AAPL.json       bundled snapshot, so the app works with no key
assets/data/sector-stats.json  sector percentile table (seeded; rebuild it)
assets/data/dividend-stats.json  dividend-PAYER percentile table (seeded; payers only)
assets/img/                 the VL monogram: white for the black rail and footer,
                            black for light backgrounds, and the favicon tile
HANDOVER.md                 integration guide for a developer taking this on
tools/build_sector_stats.py generates that table from FMP
tools/make_seed_stats.py    generates the modelled fallback shipped here
tools/test_calendar.mjs     the Calendar's dates, markets, merging and time zones
tools/make_dividend_seed.py generates the modelled dividend-payer distributions
tools/test_dividends.mjs    the dividend module: weights, the payer universe, NM rules
```

The layering matters: `fmp.js` is the only file that knows a URL, `model.js`
is the only file that reads a vendor field name, `grading.js` is the only file
that turns a number into a grade, and `gradeview.js` only formats. Adding a
ratio means touching `factors.js` alone — plus one line in `model.js` if the
underlying figure is not already derived.

The editorial side layers the same way: `taxonomy.js` is the only file that
defines a category or an article type, `articles.js` the only one that knows
where an article comes from, and the two view modules only format. Adding an
article type means one line in `taxonomy.js` and nothing else — it becomes a
filter chip, a breadcrumb and a valid URL parameter at the same moment.

Investment Ideas splits the same way: `ideas.js` is the portfolios and the
engine, `portfolios.js` only renders. Adding a screenable metric means an entry
in `COLUMNS` and one in `FILTER_META`, and it becomes a column, a filter and a
URL parameter together.

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

The Alpha Signal is priced separately and does not change a report's cost.
Its five extra feeds are marked `onDemand`, so `loadDataset` skips them and a
company report is unchanged; opening the Alpha Signal tab fetches those five
and reuses the fourteen the report already holds. A **market scan** is the
expensive one: seven requests per company, so 150 companies is about a
thousand calls. That is why it runs on a button, shows a progress bar, and
lets you pick the cap.

---

## Plans and pricing

`?view=pricing`, reached from **Plans** in the utility bar and from the footer
rather than from the rail — the rail is research destinations and a plan is not
one. Four tiers: **Reader** (free), **Investor** ($29/mo), **Analyst**
($79/mo, the recommended one) and **Desk** (a licence, from $2,400/yr).

The structure falls out of the quota arithmetic above. A reader who brings
their own FMP key costs this product **nothing** to serve and is already paying
more for the data than a subscription could charge, so that tier is free with
no expiry and no card, and it is not feature-crippled — every grade, every fair
value and every screen is the same code a paid plan runs. What a paid plan
sells is therefore the **data licence**, so nobody needs a second subscription,
plus the two things a licence cannot buy: a server that writes yesterday's
scores down, and metered model tokens for the long-form narrative.

That second one is why the Analyst tier exists at all. Three tabs in this
product refuse to render today — Quant **Rating Changes**, **Rating Upgrades
and Downgrades**, and Shariah **Compliance Changes** — because a change is the
difference between today's verdict and a previous one and nothing is stored
between sessions. They are the tier's headline feature rather than a roadmap
note, and the page says so in the same words those tabs do.

The value metric is a **person**, not a seat (nothing here is collaborative)
and not a report (a meter running while somebody reads taxes the one behaviour
this product wants). The two genuinely expensive *actions* are the tier
boundaries instead: the Alpha Signal market scan and the written narrative,
both of which already print their cost before they run.

**Nothing on the page takes a payment**, because there is no server behind this
build to take one. Rather than render a Subscribe button that quietly does
nothing, the paid CTAs open a panel naming the four missing pieces — a
processor, an account, a data proxy, and the nightly job — which is the rule
the Rating Changes and Compliance Changes tabs already follow. `CHECKOUT.href`
in [assets/js/subscribe.js](assets/js/subscribe.js) is the one edit that turns
the page live.

The prices are text in the DOM and are also emitted as `Product`/`Offer`
JSON-LD, written on every billing-toggle repaint and removed when the page is
disposed, so an assistant asked what this costs can answer without guessing.
There is deliberately no `aggregateRating`, no testimonial and no "most
popular" badge: there are no customers yet, and all three would be fabricated.
The middle tier is marked *Recommended*, which is this product's own judgement,
rather than *Most popular*, which would be a claim about other people.

---

## Known limits

- **The Alpha Signal weights are unvalidated, and there is no backtest.** They
  are a stated starting allocation with an argument behind each one. This app
  stores nothing between sessions, so there is no score history to test them
  against, and the feature therefore makes no performance claim of any kind —
  no hit rate, no return, no benchmark comparison. The `Limits` tab on
  `?view=alpha` names the four pieces a real backtest would need, including
  the hard one: point-in-time storage, because recomputing old signals from
  restated filings is look-ahead bias wearing a timestamp.
- **Six Alpha Signal categories are partly dark**, and each says which
  provider would fill it rather than approximating: consensus estimate
  revisions, contracts and backlog, patents and regulatory decisions, job
  postings, search attention, and corporate actions. `holdersSummary` — the
  13F aggregate behind the institutional category — needs an FMP Ultimate
  plan; below that the category reports gated and coverage drops 10 points.
- **The Alpha Signal market scan is capped and biased toward large
  companies.** It sorts the screened universe by market capitalisation and
  tests the top N, because that is the only ranking the screener gives away
  free. Narrow the universe with the sector and size controls first so the cap
  bites on a shorter list.
- **Market overview coverage follows FMP.** The overview uses the key in
  Settings and loads sections as they enter view. Crypto, forex and community
  ideas are omitted. Stock rankings prefer US listings and deduplicate issuers;
  world stocks also include selected international companies. World rankings
  and ETF lists state their selected universe. Corporate bonds use explicitly
  labelled bond ETFs. Global government yields show a coverage notice because
  FMP supplies the US Treasury curve only. Missing or plan-gated values stay
  empty.
- **The US indicator board is twenty-three series, six of them eager.** FMP's
  `economic-indicators` feed is a United States dataset — no other country has
  one — so the board on the Economy page is labelled United States and stays
  that way whichever country the picker holds. It answers one series per
  request and caps each at 90 days, so a series with history costs one request
  per window: six headline series load with the section and the other
  seventeen wait behind a button that prints what they cost. Each figure is the
  latest observation in its series, printed in the unit that series is reported
  in — the scale label beside it is this app's, because the feed returns a bare
  number. `inflation` is offered by the endpoint and left out: it returned
  nothing for any recent window, and `inflationRate` is the series a reader
  means.
- **A range on the indicator chart is priced before it is clicked.** Above the
  board, the Economy section charts one series at a time on the same rail-and-
  chart shape the asset sections use for quotes. Because history is capped at
  90 days a request, the ranges — 3M through 10Y — are a ladder of windows: the
  chart opens on the widest range the section has already paid for, so arriving
  spends nothing, switching series spends nothing, and every longer range
  carries its own arithmetic on the button (`5 years · 16 FMP requests more`)
  and keeps what it bought, so stepping back down is free. Ten years of one
  series is 41 requests, which is why there is no *All*: a button that cannot
  say what it spends does not belong on the page. Points are the observations
  the vendor returned and nothing between them — a line or, for a series that
  holds a level between releases, steps.
- **The release calendar is cards over a table.** The economic calendar leads
  with the same card strip the earnings and IPO calendars use — day, time,
  importance, country, then actual, forecast and prior, with the actual lit —
  and keeps the dense eight-column table behind *See all*, or under the strip
  on the World Economy page, which is the page that exists for it.
- **Market News is one stream in six categories.** `?view=news` is a topic
  strip — **Latest, Stocks, ETFs, Indices, Futures, Economy** — over a single
  column of stories. The latest four lead it as a block — one story with the
  room to be read, its picture beside a headline and the summary, three
  headlines behind a rule — and the rest run under it as rows (publisher, hour,
  headline, the vendor's two-line summary, the symbols the story was filed
  under, and the publisher's picture). The page has no rail of its own: the
  market summary, the movers and the week's reports are in the market rail
  beside every page. A
  category is one of three things and each says which: a **wire, unfiltered**
  (Latest, Stocks), the **vendor's own symbol tag or a name match** (ETFs,
  Indices, Futures — the same matchers the market boards use), or a **keyword
  filter run in your browser** (Economy), which prints its pattern, what it
  misses and what it over-catches. The four topic filters this page used to
  lead with — earnings, dividends, M&A, analyst ratings — keep their routes and
  their disclosures; they are searches over a wire rather than parts of the
  market, so they left the strip.
- **The ETF Market page is three tabs: an overview, seventeen boards and the
  wire.** `?view=markets&sub=etfs` leads with the funds this market is read by and then
  the **ETF collections** — Equity, Commodity, Bitcoin, Gold, Shariah and
  Country — six funds each, largest first, with the rule printed under the
  heading and the whole collection one click away on the ETF Screener page,
  with the country carried across. The board is built when its tab is opened
  rather than with the page.
  The screener used to be a third tab here, embedded. It is a page of its own
  now, and a tool that exists in two places is a tool whose state a reader has
  to keep track of twice — a collection picked in the tab and one picked on the
  page were two different answers to the same question. Links written while it
  was a tab still work: `&board=screener` lands on the page, carrying whatever
  collection and country it had.
  **News** is the ETF wire, read through the same function Market News reads it
  with — stories the vendor filed under one of the funds this product tracks,
  plus market-wide stories that name one — so the two can never disagree about
  what an ETF story is. It is the wire itself rather than a summary of it: a
  cut-down version would only raise the question of what was cut, and the full
  category is one click away from the tab's own heading either way.
  The page is called **ETF Market** rather than "ETFs of the United States",
  so the country it is scoped to moved into the meta line under the title
  instead of disappearing — the Overview tab is still one market at a time, and
  ETF Tables says the opposite about itself in its own header because it is the
  one tab that scope does not reach.
- **Beat the Market is one rule applied twice.** The same block sits on
  Market Data → Stocks and Market Data → ETFs: measure what the benchmark
  returned over three years, then list everything that returned more. One
  module, one benchmark and one set of caveats behind both, because two lists
  that disagreed about what beating the market meant would be worse than one
  that only covered half of it. **There is no stored membership** — the rule
  *is* the membership, recomputed from live returns on every visit, so a name
  that has fallen below the line is simply absent next time and one that has
  climbed past it is there. That is what a list that "adds and removes" does,
  with the advantage that it can never be stale and the limitation that it
  cannot say *when* something joined or left; a join date needs yesterday's
  list, and this app keeps no history.
  The benchmark is a control — S&P 500, Nasdaq 100, Russell 2000 or ACWI — and
  so is the candidate count, because the sample is the real distortion: the
  universe is taken largest-first and cut, and the biggest three-year returns
  in any market are usually not in the biggest names. Both write to the URL,
  and the request cost of a bigger sample is printed beside the control.
  Three things the column cannot see, all stated on the page:
  it is a **price return** on both sides, so a company yielding 4% has handed
  its owners roughly twelve per cent over three years that this comparison
  misses, and income names are under-counted;
  everything **delisted** in the last three years is absent, because the
  universe is whatever the screener returns today, which makes this "what beat
  the market *and is still listed*";
  and a listing **younger than the window** is reported by the vendor with its
  whole history in the three-year field rather than as missing — IBIT listed in
  January 2024 and answers a three-year return. Where that is certain (the
  three- and five-year figures identical, which only happens when both are the
  same partial history) the row is dropped; where the listing is under five
  years old but the two differ, it is kept and marked *short history*, because
  most of those are genuine four-year listings. A listing date would settle it
  and the vendor returns one only per company, which is a request each.
- **ETF Tables is the curated half, and it is what a screener cannot do.**
  Seventeen boards of funds somebody named — key market data, sectors, themes
  and subsectors, market cap, growth versus value, smart beta, dividends,
  strategies, Shariah, global and regional, emerging markets, country funds,
  bonds, commodities, real estate, currencies and crypto — grouped into tables of
  `Fund · Price · Today · 5D · 1M · YTD · 1Y · 3Y · day range · 52-week range`,
  every column sortable and the catalogue's own order always one click back.
  The point is the thing the collections above cannot reach: FMP publishes no
  asset class for a fund, so "what did gold do today" is only answerable once
  somebody has decided that **GLD stands for gold**. That decision is the
  catalogue, it is maintained by hand, and a fund that closes leaves a dimmed
  row printing dashes rather than vanishing — a gap stays visible as a gap, and
  the count above each board says how many of its funds were quoted.
  **Search reads every board at once**, not the open one: typing `gold` finds
  GLD on Key markets *and* on Commodities and the gold miners on Themes, and
  each result says which board it is filed on. It costs nothing until a key is
  pressed — the catalogue is static and the match runs in the browser — and
  only the matched symbols are then quoted. A board is two requests for the
  whole of it: `batch-quote` for the price, the session and the ranges,
  `stock-price-change` for the five windows. These are **US-listed funds and
  read the same under every country**, which the board says once at the top
  rather than seventeen times; the country picker drives the Overview tab and the
  screener, not this one. Three boards state what they left out instead of
  mixing instruments: the bond board carries the funds and points at Market
  Data → Economy for the Treasury curve, and the currency and crypto boards
  carry the funds and point at the Markets hub for spot rates and coins.
- **The Shariah board is the one that leaves the United States.** Every
  Shariah-compliant ETF and mutual fund this vendor quotes, wherever it is
  listed: the US equity and sukuk ETFs, the Amana, Iman and Azzad mutual funds,
  and the UCITS funds on London, Zurich and Paris plus the Saudi sovereign
  sukuk and the Indian Shariah tracker. A US-only list would have been short
  and misleading, because most of the world's Shariah funds are listed
  elsewhere — so every row that is not US-listed carries **its exchange and its
  currency on the row itself**, and the notes say which columns that makes
  incomparable down a group. A fund is on the board because **it states the
  mandate itself**. Nothing here re-screens a basket: the AAOIFI ratio test the
  Shariah pages run is a test on a company's balance sheet and a fund has no
  balance sheet of its own, so the board says that where it is read and sends
  you to the issuer's own disclosures. Reached from Shariah → Shariah ETFs &
  Funds as well as from the board rail, because none of the screens on that
  menu can reach a fund.
- **An ETF collection is a selection, never a score.** The collections a fund
  market is read by — largest, most traded, highest distribution yield, beta,
  and what the fund holds: equity, fixed income, commodities, gold, bitcoin,
  ethereum, real estate, total market, sector, Shariah, leveraged, inverse.
  None of them costs a request: they are rules over the listings the screener
  already returned, and the rule is printed where it is applied because a rule
  a reader cannot see is one they cannot check. Two kinds of rule, and the page
  says which it is using: a **number the feed returned** (size, volume,
  distribution yield, beta) is exact; **what the fund's own name says it holds**
  finds the funds named after their holding and misses any that are not — FMP's
  screener returns no asset class for a fund. Equity is the residue of the
  named holdings and says so; Shariah is the fund's own stated mandate, because
  the balance-sheet screen this product runs on a company cannot be run on a
  basket. Every entry in the list is a screen that runs: the collections this
  vendor cannot fill — flows, AUM growth, expense ratios, whole-market returns
  and losers, asset allocation and actively-managed mandates — are not offered
  at all, and the reason for each is recorded in `etf-collections.js` rather
  than in a dropdown a reader would pick from and get nothing.
- **The ETF news wire is the vendor's own tag.** A fund is a listed symbol, so
  FMP files stories under it: the News tab reads the stock wire as well as the
  market-wide one and keeps the stories tagged with — or naming — one of the
  funds the page tracks, marking each story with the fund it named. The indices
  and futures boards have no such tag to read and stay on name matching alone,
  which is why their sections say so.
- **The world maps are release actuals, not a macro dataset.** FMP has no
  country-level GDP or inflation series — its indicator feed is US-only — so
  the two maps on the Economy page read the *economic release calendar* and
  keep, per country, the latest reported actual for `Inflation Rate YoY` and
  for GDP growth, over the past 180 days. Year-over-year, quarter-over-quarter
  and annualized-quarterly GDP are separate bases and never mixed; a country
  whose only print falls outside the window, or that reports neither, stays
  blank rather than being estimated. Reporting periods differ by country and a
  release can be revised. The history is two three-month requests, retried in
  thirty-day slices if the vendor refuses a window, and whatever could not be
  loaded is named above the map with a retry.
- **Futures is the same board, different collections.** `?view=markets&sub=futures`
  opens on a market summary comparing the six contracts a futures board opens
  on — gold, silver, copper, platinum, WTI crude and natural gas — then a tab
  per collection: All futures, Agricultural, Energy, Currencies, Metals, World
  indices, Interest rates. The collections are this app's, because FMP's
  commodity feed carries no category; a contract it cannot place stays under
  All futures. Currency coverage there is the US Dollar index alone, which is
  what the feed carries, and the table says so. Overview closes with a news
  block — the market-wide feed filtered to stories naming a contract the board
  tracks, marked with the contracts they named — and *Keep reading* opens the
  full News tab.
- **The three mover lists left the Market Data menu.** Gainers, Losers and Most
  Active are still routable and still linked from the overview's own rankings
  and the Home page; they are `hidden` in `nav.js`, which takes them out of the
  menu and the section strip without breaking a link.
- **Market Indices is the vendor's coverage, grouped.** The indices heading on
  Market Data opens it: a market summary for the chosen country — its indices
  on one percentage axis, each line starting at zero on the first session of
  the window — then eleven boards, from All indices to Africa. A region board
  holds what the page can place from its own catalog or a listing suffix;
  anything else stays under All indices rather than being filed under a region
  it might not be in. The Overview columns arrive with the one index feed the
  page already loads; Performance costs one request per index and says so
  before spending it. Two columns other boards carry are absent because FMP
  supplies neither for an index: a technical rating and realised volatility.
- **Index news is a filter, not a feed.** FMP tags news by company and never by
  index. The News tab and the news block on Overview read the market-wide
  firehose and keep the stories whose headline or summary names an index the
  board tracks — whichever country it belongs to — marking each story with the
  indices it named and printing how many of the latest stories matched. An
  index whose name is too short to match safely is left out of that test.
- **The country picker switches facts, not grades.** The page title on Market
  Data opens twenty countries, and indices, equity rankings, funds and the
  release calendar follow the one chosen; the choice is remembered and travels
  in the URL as `?country=DE`. Three FMP feeds are US-only — the whole-market
  mover lists, the Treasury curve and the economic indicator series — so
  outside the United States equity rankings are computed over the largest
  listings the screener returns for that country, and the bond and indicator
  panels state the gap instead of showing US numbers under another flag.
  Sections that do not travel say so: World stocks and Futures are marked
  *Global*, corporate bonds *United States*. The 1D chart requires intraday access; longer ranges use daily history.
  Run `node tools/test_markethub.mjs` for isolated regression checks. The page
  at `/tools/market-hub-preview.html?all=1` uses visibly labelled synthetic
  fixtures, blocks external requests and does not store an API key; append
  `&mode=no-key` to inspect the disconnected state.
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
- **The research articles are sample data.** The thirty in
  `assets/data/articles.json` are editorial fixtures written to exercise the
  feed and the article layout. The tickers are real and the figures realistic,
  but none was generated from a filing, and the quant scores and Shariah
  statuses on those cards were typed rather than computed. The feed and every
  article print a standing notice saying so. Open a company report for figures
  that are computed.
- **Not investment advice.** Everything here is generated from vendor data and
  the model in this repo, with no view on your circumstances. Verify anything
  you intend to act on against primary filings.
