# Maz Vantage — Stock Analysis

A full stock research report in one page: a five-factor score, 34 pass/fail
checks, valuation against fair value and peers, an analyst-backed growth
outlook, balance-sheet health, dividend cover, management, and ownership.

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

So all 34 checks resolve, and the **Data Status** section at the bottom of
every report shows the state of all 28 feeds for whatever ticker you loaded.

The plan-degradation machinery still matters, though. FMP gates by endpoint,
coverage varies by ticker and exchange, and any feed can simply return
nothing for a small or foreign listing. When that happens the dependent
checks report **"not assessed"**, never **"failed"** — a missing feed lowers
confidence in a score rather than silently pushing it down. Each affected
block names the feed it needs.

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

The flake in the left rail has one spoke per factor, scored 0–6. Radius is
`17 × (score + 1)`, so a zero still shows as a small nub and a six reaches the
outer ring. Click a spoke to jump to its section.

Management is a sixth section scored 0–4; it does not appear on the flake.

### Valuation

| Check | Passes when |
| --- | --- |
| Below Future Cash Flow Value | price < DCF fair value |
| Significantly Below Future Cash Flow Value | price is 20%+ below fair value |
| Price-To-Earnings vs Peers | P/E below the average of FMP's peer list |
| Price-To-Earnings vs Industry | P/E below the sector benchmark |
| Price-To-Earnings vs Fair Ratio | P/E below the fair ratio implied by forecast growth |
| Analyst Forecast | consensus target 20%+ above price **and** analysts broadly agree |

The **fair ratio** uses the revised Graham formula, `(8.5 + 2g) × 4.4 / Y`,
where `g` is forecast annual earnings growth in whole percent and `Y` the AAA
yield from Settings. Growth is clamped to −5…25% and the result to 5…60x, so
a hyper-growth forecast cannot manufacture an arbitrarily generous multiple.

### Future Growth

Earnings vs Savings Rate · Earnings vs Market · High Growth Earnings ·
Revenue vs Market · High Growth Revenue · Future ROE.

Growth rates are the **median year-on-year step** across the three-year
consensus window, not an endpoint CAGR. Consensus paths routinely carry one
bad year because a different subset of analysts covers each horizon — Apple's
2029 revenue consensus currently sits *below* its 2028 figure. An endpoint
CAGR inherits that wholesale; a median shrugs it off. With fewer than three
steps available it falls back to endpoint CAGR.

Future ROE projects equity forward by retaining earnings. With a cash flow
statement it nets off real dividends *and* buybacks; without one it can only
use the dividend payout ratio, which overstates retention for a company that
buys back heavily — the section says so where that applies.

### Past Performance

Quality Earnings · Growing Profit Margin · Earnings Trend · Accelerating
Growth · Earnings vs Industry · High ROE.

Four of these need annual income statements. Where those are unavailable,
only Quality Earnings (from `incomeQuality`) and High ROE resolve; the rest
report *not assessed*.

### Financial Health

Short Term Liabilities · Long Term Liabilities · Debt Level · Reducing Debt ·
Debt Coverage · Interest Coverage.

Interest Coverage reports *not assessed* rather than failing when FMP returns
a zero interest-coverage ratio, which it does for companies with no material
interest expense.

### Dividend

Notable Dividend · High Dividend · Stable Dividend · Growing Dividend ·
Earnings Coverage · Cash Flow Coverage.

Stability tolerates no annual cut deeper than 20% across the last ten complete
calendar years. The current, partial year is always excluded, otherwise every
payer looks like it just cut.

### Management

Compensation vs Market · Compensation vs Earnings · Experienced Management ·
Experienced Board.

CEO pay is compared against a market-cap band (mega / large / mid / small /
micro), with the band and its benchmark shown in the key-information tiles.
*Compensation vs Earnings* compares the year-on-year change in the package
against the change in earnings, with five percentage points of slack — pay
climbing while profits fall is the case it exists to catch.

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

Two lookup tables in the same file are code-only: `industryPe` and
`industryEarningsGrowth`, keyed by FMP `sector`. They back "P/E vs Industry"
and "Earnings vs Industry". They are static benchmark figures, not live
aggregates — the report says so wherever it uses them. Edit them to match
whatever universe you actually benchmark against.

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
assets/js/fmp.js            FMP connector: 28 feeds, caching, plan-gate detection
assets/js/model.js          the analysis model — facts, forecast, 34 checks, scores
assets/js/charts.js         SVG primitives: line, column, forecast, range, gauge, donut
assets/js/snowflake.js      the Vantage Flake radar
assets/js/sections.js       one renderer per report section
assets/js/util.js           formatting and DOM helpers
assets/data/AAPL.json       bundled snapshot, so the app works with no key
```

The layering matters: `fmp.js` is the only file that knows a URL, `model.js`
is the only file that decides what passes, and `sections.js` only formats.
Adding a check means touching `model.js` alone.

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

---

## Performance and quota

A report fires up to 28 feed requests, five at a time, plus one per peer for
the P/E comparison and two benchmark price series (SPY and the matching SPDR
sector ETF) for the returns table. Results are cached per ticker and feed for
ten minutes, so moving between sections and back costs nothing. **Refresh** in
the header clears the cache and refetches.

---

## Known limits

- **Industry benchmarks are static.** A real industry aggregate would mean
  screening the whole sector on every load. The tables in `model.js` are
  deliberately visible and editable instead.
- **Volatility is a simple estimator** — the standard deviation of
  non-overlapping five-day returns over the last year. It needs about three
  months of prices before it reports anything.
- **`na` is not a failure.** A factor showing 2/6 with four checks unassessed
  is not the same as 2/6 with four failures. The score header carries a
  "not assessed" chip whenever they differ.
- **Not investment advice.** Everything here is generated from vendor data and
  the model in this repo, with no view on your circumstances. Verify anything
  you intend to act on against primary filings.
