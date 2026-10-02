# Porting status — legacy `assets/js` → `web/`

**The legacy app was deleted on 2026-10-02** at the user's request. That was
`index.html`, `assets/`, `serve.py`, `HANDOVER.md` and the Node test scripts
in `tools/`. Every legacy path this file names now lives only in git history,
at commit `e7659b5` and earlier. The Python tools stay, and now write into
`web/public/data/`. This file remains the record of what each legacy module
became; add to it in the same change as any new feature.

## How the port is done

- **Logic modules** (no DOM) are copied mechanically and made to compile
  under `strict` by a TypeScript-compiler-driven fixer: untyped parameters and
  placeholders get explicit `any`, nothing about behaviour changes. The
  contract types the view layer reads (`GradedMetric`, `FactorScore`,
  `Scores`, `Dataset`, `FeedResult`) are written by hand. The legacy Node
  regression suites are ported to Vitest (`tests/`) and run against the TS
  modules — that is the proof a port changed nothing.
- **View modules** (DOM builders) are rewritten as React components on
  Tailwind 4 + shadcn/ui (Radix). Charts move from hand-rolled SVG to
  Recharts; the world maps move from d3 to react-google-charts' GeoChart.
- **Data** goes through `/api/data/[...path]` (the key stays server-side; renamed from `/api/fmp` on 2026-10-01).

## Logic (`src/lib`)

| Legacy | Port | Tests |
|---|---|---|
| util.js | format.ts | — |
| fmp.js | fmp.ts + fmp/paths.ts + app/api/data, app/api/img | via alpha suite |
| grading.js | grading.ts (hand-typed) | — |
| factors.js | factors.ts (typed contract) | — |
| nav.js (data half) | nav.ts (hand-written) | — |
| model.js | model.ts | — |
| valuation-models.js | valuation-models.ts | — |
| dividend-lines/-model/-score.js | dividend-*.ts | dividends.test.ts ✅ 15 |
| alpha-signals/-score/-narrative/-disclosures/-providers.js | alpha-*.ts | alpha.test.ts ✅ 50 |
| economy-data.js | economy-data.ts | economy.test.ts ✅ |
| etf-collections.js | etf-collections.ts | — |
| etf-tables.js | etf-tables.ts | — |
| markethub-data.js | markethub-data.ts | markethub (pending views) |
| taxonomy.js, articles.js | taxonomy.ts, articles.ts | — |
| narrative.js | narrative.ts | — |
| ideas.js (engine) | ideas.ts | — |
| screener-presets.js, shariah-screens.js | screener-presets.ts, shariah-screens.ts | — |
| stockmarkets.js (collections) | stock-collections.ts | — |
| markettable.js (column sets) | market-table.ts | — |
| calendar.js (pure half) | calendar.ts | calendar.test.ts ✅ 8 |
| research.js (ratings model + generated prose) | research-model.ts | — |
| dividend-grades.js (adapter half) | dividend-grades.ts | — |
| statistics.js (group builders) | statistics.ts (rows also carry `raw`/`kind` for the screener) | screener-filters.test.ts ✅ 6 |
| shariah-screens.js (verdict model) | shariah.ts (hand-written) | — |
| sectorpage.js, sectorsblock.js (data halves) | sectors.ts, treemap.ts | sectors.test.ts ✅ 9 |
| markets.js (mover filter, sector averaging), beatmarket.js (rule), economy-us/-country/-chart.js (formatting) | movers.ts, beat-market.ts, economy-format.ts | markets.test.ts ✅ 6 |

## Views

### Shell

| Legacy | Port |
|---|---|
| app.js boot / routing | app/layout.tsx, middleware.ts (legacy `?symbol=` / `?view=` redirects), routes.ts |
| nav.js (rail, flyouts) | shell/side-nav.tsx, shell/util-bar.tsx |
| settings dialog | shell/settings-dialog.tsx |
| market rail | shell/market-rail.tsx |
| footer | shell/site-footer.tsx |

### The stock report — `/stock/[symbol]/[[...tab]]` ✅ all 17 tabs (plus Technicals, port-only — see below)

| Tab | Legacy | Port |
|---|---|---|
| Overview | overview.js | tabs/overview-tab.tsx |
| Analysis | app.js sections, gradeview.js, dividend-grades.js | report-shell.tsx, analysis-sections.tsx, factor-view.tsx, dividend-grades.tsx |
| Research | research.js | tabs/research-tab.tsx |
| Ratings | gradeview.js | factor-view.tsx (RatingsTab) |
| Alpha Signal | alphatab.js, alphaview.js | tabs/alpha-tab.tsx, alpha/alpha-view.tsx |
| Financials | financials.js | tabs/financials-tab.tsx |
| Statistics & Metrics | statistics.js | tabs/statistics-tab.tsx |
| Valuation … Momentum | gradeview.js factor tabs | factor-view.tsx (FactorTab) |
| Analysts Forecast | forecast.js | tabs/forecast-tab.tsx |
| Dividends | dividends.js, dividendscores.js | tabs/dividends-tab.tsx, dividend-grades.tsx |
| Transcripts | transcripts.js | tabs/transcripts-tab.tsx |
| News | news.js | tabs/news-tab.tsx |
| Shariah Compliance | shariah.js | tabs/shariah-tab.tsx |

### Pages — `/[view]/[[...sub]]`

Each registers in `components/pages/nav-page.tsx` (`PAGES`).

| Page | Legacy | Port | State |
|---|---|---|---|
| Stock Screener | screens.js, screener.js, markettable.js | pages/stocks-page.tsx, market/dedicated-screener.tsx, market/market-table.tsx | ✅ |
| ETF Screener | etfscreener.js | pages/etfs-page.tsx | ✅ |
| Investment Ideas | portfolios.js, ideas.js (views) | pages/ideas-page.tsx, ideas/idea-result.tsx | ✅ |
| Quant | quant.js | pages/quant-page.tsx, pages/screen-desk.tsx | ✅ |
| Shariah | shariahdesk.js | pages/shariah-page.tsx | ✅ |
| Alpha Signal desk | alphadesk.js | pages/alpha-page.tsx | ✅ |
| Earnings | earningsdesk.js | pages/earnings-page.tsx | ✅ |
| Research | researchhub.js, feed.js, articlepage.js | pages/research-page.tsx, pages/research-report-tab.tsx (Valuation and Dividends tabs, added after the port) | ✅ |
| Market News | newsroom.js | pages/news-page.tsx, lib/news-stories.ts | ✅ |
| Calendar | calendar.js | pages/calendar-page.tsx, lib/calendar.ts | ✅ (calendar.test.ts ✅ 8) |
| Pricing | subscribe.js | pages/pricing-page.tsx | ✅ |
| Watchlist | watchlist.js | pages/watchlist-page.tsx | ✅ |
| Sectors | sectorpage.js, sectorsblock.js | pages/sectors-page.tsx, market/sectors-block.tsx, market/dense-table.tsx, market/canvas.tsx, lib/sectors.ts, lib/treemap.ts | ✅ (sectors.test.ts ✅ 9) |
| Markets | markets.js, markethub.js, markethub-widgets.js, markethub-compare.js, marketboard.js, marketindices.js, marketfutures.js, stockmarkets.js, economy-*.js, etf-board.js, beatmarket.js | pages/markets-page.tsx (dispatch, movers, sector/industry snapshots), pages/market-hub.tsx (overview, Corporate Bonds, ETF Market, World Economy), pages/market-board.tsx (Indices, Futures), pages/stock-markets.tsx, market/widgets.tsx, market/economy.tsx (maps on GeoChart), market/compare-chart.tsx, market/etf-board.tsx, market/beat-market.tsx, lib/economy-format.ts, lib/beat-market.ts | ✅ |
| Home | home.js | pages/home-page.tsx | ✅ |

## Changes since the port (the port is now ahead of the legacy app)

These two pages behave differently from `assets/js` on purpose. The legacy
app is no longer the reference for them.

- **Investment Ideas portfolios are read-only** (`pages/ideas-page.tsx`).
  Portfolios are curated: the rules show as fixed chips, with no editor, no
  "+ Filter" and no reset. Old links that carried edits (`f`, `mcmin`,
  `mcmax`, `sec`) are ignored and open the published portfolio. The filter
  registry in `lib/ideas.ts` that powered editing (`FILTER_METRICS`,
  `filtersFor`, `ideaFromFilters`, `ruleFromFilter` …) was removed with it.
- **The Stock Screener has company filters** (`market/dedicated-screener.tsx`,
  `market/screen-filters.tsx`, `lib/screener-filters.ts`). "+ Add filters" is
  a multi-select over 244 metrics: 6 of our scores, 3 Wall Street rating
  figures, and every numeric row of the Statistics & Metrics tab (238 rows,
  less 3 the tab prints twice). An Industry dropdown joins Sector and Exchange.
  - The Statistics rows are not redefined. `statistics.ts` rows now carry
    `raw` and `kind` beside the printed value (display unchanged), and the
    screener runs each tested company's feeds through `analyse()` +
    `buildGroups()` and reads `raw`.
  - `STAT_FEEDS` in `screener-filters.ts` lists the feeds per row. It was
    derived by removing feeds from the AAPL snapshot one at a time, and
    `tests/screener-filters.test.ts` re-proves it: each list alone must
    reproduce the full report's figure. **A new numeric row on the Statistics
    tab fails that test until its feeds are listed.**
  - Cost: each run tests the largest companies in the current list, capped at
    the Investment Ideas request budget. Only missing feeds are fetched. The
    button states the request count before it spends anything.
  - For production, a server-side table (FMP's bulk endpoints or your own
    store) would let these filters cover the whole universe in one query
    instead of testing company by company. `measureRows()` is the one
    function to replace.

## Features beyond the legacy app (competitor gap list, 2026-09-30 → 10-01)

Sixteen features from the comparison against Seeking Alpha, Investing.com,
Yahoo Finance and Morningstar ("group 1": buildable on data already fetched or
on FMP). They exist only here; `assets/js` has none of them. All pass the
type checker and the suite. The first eight were built on 2026-09-30, and that
session reported Compare, the portfolio blocks and saved screens as not yet
run in a browser; those three and the last eight were run in the browser on
2026-10-01 — with no key, against the bundled captures or an in-memory `fetch`
stub that stored nothing and sent nothing.

| Feature | Where | Files | Data and cost | Tests |
|---|---|---|---|---|
| Add to watchlist everywhere; one list store for the rail and the page | star on screener/table rows, Watch in the report head | `watch-button.tsx`, `lib/watchlists.ts` | none (browser storage) | csv-watchlists ✅ |
| Private notes on a company | Notes in the report head; Home | `notes-button.tsx`, `lib/notes.ts` | none | — |
| CSV export | every `DataTable` / `DenseTable`, both screeners | `csv-button.tsx`, `lib/csv.ts` | none | csv-watchlists ✅ |
| Technicals tab (summary, pivots, patterns, seasonality, indicators, drawings) | report, after Momentum — the report now has **18 tabs** | `tabs/technicals-tab.tsx`, `charts/study-chart.tsx`, `lib/technicals.ts`, `lib/price-history.ts` | prices already loaded | technicals ✅ |
| Compare 2–5 stocks, saved comparisons; SA's order (chart, table, profile cards) and a Wall Street row in the rating block | `/stocks/compare` | `pages/compare-page.tsx`, `market/compare-chart.tsx` | 7 a company + 1 batch quote | — |
| Portfolio tracking: lots, cost basis, CSV import, time-weighted return vs S&P 500, risk | Watchlist page | `lib/portfolio.ts`, `portfolio/portfolio-blocks.tsx` | 1 + holdings, on a click | portfolio ✅ |
| Saved screens, send results to a list | both screeners, Investment Ideas, Home | `market/screen-actions.tsx` | none | — |
| SEC filings stream, by purpose then form | News tab → SEC filings | `report/sec-filings.tsx`, `lib/sec-filings.ts` | `sec-filings-search/symbol`, on demand, 2 years, ≤1,000 rows | sec-filings ✅ |
| Beneish M-Score, 8 indices, history | Financials → Balance sheet; Statistics row (screenable) | `lib/beneish.ts`, `report/beneish-card.tsx` | statements already loaded | beneish ✅, screener-filters ✅ |
| Bull case / bear case | Research tab, after Bulls Say / Bears Say | `lib/scenarios.ts`, `report/scenario-card.tsx` | none — reruns the six DCFs | scenarios ✅ |
| Calculators (growth, dividend reinvestment, position size, annualised return) | Research → Calculators | `lib/calculators.ts`, `pages/calculators-page.tsx` | none | calculators ✅ |
| Superinvestors: 19 funds' 13F holdings and changes; what they hold in common | Investment Ideas → Superinvestors | `lib/superinvestors.ts`, `pages/superinvestors-page.tsx` | 5 a fund; 3 × 19 for the common table; Ultimate plan | superinvestors ✅, superinvestors-load ✅ |
| ETF grades (expenses, liquidity, risk, dividends, momentum) | ETF tables → Grades | `lib/etf-grades.ts`, `market/etf-board.tsx` | 3 a fund, on a click | etf-grades ✅ |
| Fund X-Ray: look-through sectors, countries, holdings, overlap, fees | ETF Screener → Fund X-Ray | `lib/fund-xray.ts`, `pages/fund-xray-page.tsx` | 4 a fund | fund-xray ✅ |
| Customisable Home, plus watchlist / notes / saved-screen blocks | Home → Customize | `lib/home-layout.ts`, `pages/home-personal.tsx` | none | home-layout ✅ |

Things a reviewer should know:

- **Three rules stayed intact.** No fair value feeds a grade — the bull/bear
  cases are DCF reruns and are printed beside the grade, never inside it.
  Beneish is a reference figure like Altman and Piotroski, outside every
  factor. A fund is still never given the company score: ETF grades rank
  funds against the others in their board group, and say so.
- **New FMP paths** (all in `lib/fmp/paths.ts`, so the proxy serves them):
  `sec-filings-search/symbol`; `institutional-ownership/dates`, `/extract`,
  `/holder-performance-summary`, `/holder-industry-breakdown`;
  `etf/holdings`, `etf/sector-weightings`, `etf/country-weightings`.
- **The AAPL snapshot gained fields**, each dated in its `note`: SEC filings to
  the 2026-09-22 capture date; `netReceivables`, `propertyPlantEquipmentNet`,
  `longTermInvestments`, `longTermDebt` (balance) and `depreciationAndAmortization`
  (cash flow) for Beneish. No existing figure reads them, so nothing else moved.
  `public/data/13f-capture.json` is Berkshire's Q2 and Q1 2026 13F, whose
  values sum to the vendor's own portfolio totals.
- **The superinvestor list is hand-checked**: every CIK against the SEC
  company record, every fund's latest 13F date on the vendor (2026-10-01).
  Scion and Greenlight were dropped as stale filers.
- **Vendor quirks handled, not hidden**: country weights come as `"14.98%"`
  strings and sector weights as numbers; 13F industry weights can sum past
  100% (Berkshire: 103.2%) and are printed as published; the vendor's 13F
  turnover and holding-period fields are not shown because their units are
  undocumented.
- **Browser storage keys added**: `mazvantage.home.layout`. (The earlier
  half added `mazvantage.notes`, `mazvantage.comparisons`,
  `mazvantage.screens.saved`, `mazvantage.chart.*`.) All are per-browser
  conveniences; a production build with accounts would move them server-side.

## Following the big banks (Investment Ideas, 2026-10-01)

A portfolio built from nine global banks' 13F filings — Goldman Sachs,
JPMorgan, BNP Paribas (three filers, added together), Morgan Stanley, Bank of
America, Citigroup, UBS, Barclays, Deutsche Bank — at
`/ideas?idea=big-bank-buying`, filed in a new **Institutional holders** group.
Port-only, like the rest of this section.

| Part | Files |
|---|---|
| The 13F model: reading the banks, splits, the all-filer baseline | `lib/institutions.ts` |
| The idea, its four rules, and a hook in `runIdea` (filings read first; rules on them run before the cap; `prerank`) | `lib/ideas.ts` |
| The Banks tab, the banks card, "who added what", the limits | `lib/market-table.ts` (`BANK_COLUMN_SET`), `components/ideas/bank-cards.tsx`, `pages/ideas-page.tsx` |
| Tests, on a cut of the real Q1/Q2 2026 filings | `tests/institutions.test.ts`, `tests/fixtures/bank-13f.json` — 27 checks |

- **Cost:** 35 requests for the filings (dates and two quarters for each of
  eleven filers, the split calendar in two halves) — 2–5 MB of JSON per
  filer-quarter, ~60 MB in all — then 1 screener call and 3 requests for each
  of up to 200 companies: 636 in all. Ultimate plan (13F). Verified in the
  browser on 2026-10-01 against the full real filings served to an in-memory
  `fetch` stub: 636 requests, ~10 s, no console errors.
- **Two traps it handles, and how.** A stock split makes every bank "buy"
  (Booking 25-for-1: all nine +2,087% raw; −12.5% restated) — previous-quarter
  shares are restated from `splits-calendar`. A merger paid in shares does the
  same (Devon) — the last rule compares the banks with every 13F filer from
  `symbol-positions-summary`, which also makes it split-invariant.
- **`fmp.ts` cache key:** `institutional` and `holdersSummary` now include the
  quarter asked for, since the portfolio asks for its filings' quarter rather
  than the default.

## Research tab: price change timeline (2026-10-01)

"Price vs. Fair Value" has a period strip — 1W, 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y,
All — each cell showing the price change over that period; the selected one
redraws the chart and a quote line above it (last close, change in money and
per cent, since when). Default 1Y. `lib/price-timeline.ts`; no requests, it
reads the closes the report already holds. Periods use the Momentum tab's
arithmetic (`RETURN_SPANS`, `computeReturns`, `ytdReturn`), and
`tests/price-timeline.test.ts` holds them equal on the AAPL snapshot. A period
the loaded history cannot reach is disabled, not shortened.

## The data provider is not named to readers (2026-10-01 → 10-02)

Readers are never told where the data comes from: no provider name, no "API",
no "vendor", no key. Most of it is wording (string literals and JSX text across
`lib/`, `components/` and `public/data/`; "the vendor's" became "reference",
"published" or "reported"). Four parts change behaviour:

| Part | What changed |
|---|---|
| Key entry | Removed from Settings and from the pricing checkout (the free bring-your-own-key option is gone). The operator can still attach a key with the hidden `?apikey=` link: it is stored as `mazvantage.data.key` (moved once from `mazvantage.fmp.key`), stripped from the address bar, and sent in the `x-data-key` header. |
| Routes | `/api/fmp/[...path]` → `/api/data/[...path]`. Logos and news pictures go through `/api/img/<alias>/<path>` (`IMAGE_HOSTS` in `lib/fmp/paths.ts`); the data proxy rewrites image addresses in every response. |
| Errors | The proxy replaces the provider's error bodies (which name it, its plans and its site) with neutral ones, keeping the status the client maps: 401 refused, 402 not covered, 429 busy, 502 error. A 200 carrying an `Error Message` is classified the same way. |
| Served data | `public/data/*` notes and article text rewritten in neutral terms; the original provenance notes are in `DATA-PROVENANCE.md`, which is not served. The AAPL snapshot's logo points at `/api/img`. The Research tab's "For the developer" block shows in operator mode only. |

- **How it was checked.** A TypeScript-AST scan of every string literal and
  JSX text node in `src/` (comments and identifiers skipped) leaves only code:
  route paths, the `apikey` parameter, internal source ids that are never
  displayed, and the old storage key being migrated. In the browser with no
  key: 41 menu pages, all 18 report tabs, three edited articles, Settings and
  the checkout dialog showed no "FMP", "Financial Modeling", "API" or "vendor".
- **Not covered:** code comments and identifiers (`fmp.ts`, `FMP_API_KEY`),
  repo-only docs, and the legacy `assets/js` app.
- **Before publishing,** check the provider's terms for any attribution the
  plan requires (noted at the top of `DATA-PROVENANCE.md`).

## Brand: Maz Vantage, and the pricing page on TradingView's (2026-10-02)

The app is **Maz Vantage** again (it was Vanlior from 2026-09-24), with the
slogan "Market Research to your advantage", whose "vantage" prints in blue.
Every "Vanlior" in `src/`, `tests/` and `public/data/` became "Maz Vantage"
(202 in 110 files, feature names included: Maz Vantage Score, Quant, Flake).

| Part | Files |
|---|---|
| Name, slogan, export prefix | `lib/brand.ts` (`BRAND_NAME`, `BRAND_SLOGAN`, `BRAND_SLUG`) |
| Mark (inline, `currentColor`), wordmark, slogan | `components/shell/brand.tsx` — used by the rail, footer, pricing hero, article avatar and feed byline |
| Mark as files | `public/img/mazvantage-mark-{white,black}.svg`, `mazvantage-favicon.svg` (the mark on a black tile); the `vanlior-*` files are gone |
| Wordmark typeface | ES Klarheit Kurrent Semibold, `src/fonts/es-klarheit-kurrent-semibold.woff`, loaded by `next/font/local` in `layout.tsx` as `--font-brand` (`font-brand`); the wordmark only, the interface stays Inter |
| Blue on black | `--rail-accent: #5085f7` (6:1 on black); on themed surfaces the slogan uses `--primary` |

- **Licence:** serving the font needs a webfont licence from the foundry
  (Futur Neue). To change the typeface, swap the one `src` line in
  `layout.tsx`, or outline the wordmark into the SVG.
- CSV exports are now `mazvantage-<what>-<date>.csv`; the `mazvantage.*`
  storage keys were already that name and did not change.

**Pricing (`components/pages/pricing-page.tsx`)** is laid out after
tradingview.com/pricing on this app's tokens: a black hero (both themes) with
the brand, one headline and a Monthly / Yearly / 2 Years radio group with a
computed "Save up to" chip; both plans as columns of one gradient-edged
container — price "/ mo", amount billed, saving, a full-width button, the
plan's own numbers, then one shared feature list with what the plan lacks
greyed out (sections aligned across columns by `grid-rows-subgrid`); then a
themed "Compare plans" table whose head sticks under the utility bar, folded
to two groups behind "Show all features". **Prices, periods, the Yearly
default, `?billing=`, the comparison rows and the checkout dialog are
unchanged.** The screener's metric count is read from `screenMetrics()` (245;
the page had said 244 since the Beneish row was added).

`marketpages.js` is not ported: its four sections were only reachable through
`markets.js`'s `SECTIONS` table, which the dispatch resolved overview, stocks,
ETFs and economy ahead of, so none of it ever rendered in the legacy app.
