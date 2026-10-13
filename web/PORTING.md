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

### The stock report — `/stock/[symbol]/[[...tab]]` ✅ all 17 tabs (plus Technicals and Insider Trading, port-only — see below)

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
| Insider Trading | — (port-only, 2026-10-07) | tabs/insider-tab.tsx, charts/flow-chart.tsx, lib/insider-trading.ts |
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
| Insider Trading tab: monthly Form 4 flows over the share price, every filing with name, role, code, size and a sec.gov link, and each firm's dated rating actions (2026-10-07) | report, after Analysts Forecast — the report now has **19 tabs** | `tabs/insider-tab.tsx`, `charts/flow-chart.tsx`, `lib/insider-trading.ts` | 2 on demand: `insider-trading/search` (500 rows) and `grades` (new path, full history); AAPL snapshot carries both | insider-trading ✅ |
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

## Research → Letters & Outlooks (2026-10-05)

A library of other houses' published thinking, after Fiscal.ai's Fund Letters
and S&P Global's research collection: outlooks, fund letters, memos and
articles, research reports, chart books and official economic outlooks.
`/research/letters`, second item in the Research menu and a tab on the
Research strip. Three tables, like Fiscal.ai's Letters / Stocks / Investors:
**Documents** (by month), **Investors** (one row per firm) and **Companies**
(listed companies the letters name, with opened / exited / discussed counted
by firm). Every filter shows how many documents it leaves.

**352 documents from 114 firms**, all opened on 2026-10-05.

| Piece | File |
|---|---|
| Model, vocabulary, the 19 curated entries, query, facets, the three tables | `lib/letters.ts` |
| The 333 indexed entries and 100 firms — 150 picked by hand, 183 found by the crawler (`auto: true`) | `lib/letters-index.ts` |
| The crawler, the review step and a link checker | `tools/letters/` (see its README) |
| The page | `components/research/letters-page.tsx` |
| Route | `pages/research-page.tsx` (`sub === 'letters'`), `lib/nav.ts` |
| Shared filter pills / fields (moved out of the feed) | `components/research/feed-parts.tsx` |
| Tests | `tests/letters.test.ts` (24) |

- **Links, never copies.** Every entry opens the publisher's own page or file
  in a new tab. Nothing is downloaded or served from here; several documents
  say "not for distribution".
- **Two tiers.** *Curated* (19): read in full, with our own `about` line.
  *Indexed* (150): found on each firm's own letters/insights page; the link
  was opened and the title and date read from the page or the PDF's first
  page. No `about`. Where a fund letter's own trade list was read ("we
  purchased…", "we sold…") it carries `mentions`.
- **Only names from Fiscal.ai.** The user first asked to pull Fiscal.ai's
  1,157 investors and their letters; copying that index was declined (bot
  checkpoint, paid product). They then asked to use just the public investor
  list as a starting point: its firm names (not counts, tags, letters or
  links) were read once in a browser and kept outside the repo. A crawler
  then found each firm's own site, confirmed it, honoured robots.txt, read
  its letters/insights page and opened each 2026 document for title and
  date. 775 names → 655 with a resolving address → 403 sites → 172 passing
  the same-company check → 61 with a 2026 document after filtering → 52 new
  firms and 9 merged into firms already on file. Eight same-name companies
  the check let through (a UK house buyer, a Bitcoin exchange, an M&A
  adviser…) were removed by hand. Crawled entries say "Filed automatically";
  their kind, topics and regions come from the title. Rejected on the way: documents with no publication date anywhere
  (two Saga letters, the Ruffer Review, Harding Loevner's quarterly, Bank of
  Canada's FSR), a BlackRock PDF behind a terms page, and Schroders (blank to
  automated browsing).
- **Dates.** Where a page's hidden metadata disagreed with the date the firm
  shows readers, the visible date won (Smead, Brookfield, Deutsche Bank,
  First Eagle). A document dated only by month keeps `YYYY-MM`. Baron's and
  Vulcan's quarterly PDFs print no date; their month is the publisher's
  upload folder. An address reused for each edition is `rolling`.
- **Facet counts ignore their own filter**, so picking one kind never zeroes
  the others; a choice that would empty the page is disabled, not hidden.
- **Firms carry their type and 13F filer number**; the test holds every CIK to
  the Superinvestors list so "13F holdings →" always lands.
- **Filters go through `nav.goView`, not `goQuery`** — `goQuery` keeps only the
  article feed's own keys and silently dropped these.
- **No data cost**: the list is in code. A licensed feed (Fiscal.ai's
  `/v1/fund-letters`, S&P aftermarket research) would replace `LETTERS` with a
  loader; every function takes the list as an argument for that reason.
- **Keeping it current:** `tools/letters/` holds the crawler (name → address
  guesses → same-company check → index page → dated links → each link opened),
  `review.py` (checks, de-duplication, a list to read by hand, paste-ready
  entries) and `check_links.py` (re-opens every link: 345 of 355 answered on
  2026-10-05, none dead; the other ten refuse scripts and were checked in a
  browser). Names files and crawl output stay in its git-ignored `work/`.
- **The page code-splits**: `research-page.tsx` loads `letters-page.tsx` with
  `next/dynamic`, so the library's data only downloads when the section opens.

## Financials: GAAP and non-GAAP (2026-10-07)

The Financials tab has a **GAAP | Non-GAAP** switch beside the Income /
Balance sheet / Cash flow strip, and it applies to all three statements.

| Piece | File |
|---|---|
| Standard detection, quarter join, fiscal-year sums, calculated measures, loader | `lib/gaap.ts` |
| GAAP panels, the switch, the basis line and card | `components/report/tabs/financials-tab.tsx` |
| Non-GAAP panels | `components/report/tabs/financials-non-gaap.tsx` |
| Statement table, run badges, reconciliation line, basis names | `components/report/tabs/financials-parts.tsx` |
| New feed `incomeAsReported` (`income-statement-as-reported`, 1 row, on demand) | `lib/fmp.ts`, `lib/fmp/paths.ts` |
| Tests | `tests/gaap.test.ts` (23) |

- **GAAP is filed lines only**, plus ratios of two filed lines marked as
  calculated. EBITDA, free cash flow, net debt and tangible book value moved
  out: each is a non-GAAP measure under the SEC's Regulation G. The consensus
  tail on "Revenue and earnings" was removed: consensus earnings are adjusted,
  so it was adjusted figures drawn on the end of filed ones. Operating income
  growth is now the filed line's own change, not the growth feed's EBIT.
- **The standard is read off the filing's XBRL tag names**, not assumed:
  `NetIncomeLoss`-type tags are US GAAP, `ProfitLossAttributableToOwnersOfParent`-type
  tags are IFRS (`ProfitLoss` counts for neither — US GAAP has it too). For an
  IFRS filer the switch reads **IFRS | Non-IFRS**. With no tagged filing (most
  non-SEC listings) it says "Standard not confirmed" rather than guessing.
- **Non-GAAP is two kinds, labelled apart.** *Reported by the company*:
  adjusted EPS, the earnings calendar's `epsActual` — checked live on
  2026-10-07: Salesforce Q1 FY26 $2.58 against $1.59 filed, Apple Q4 FY24
  $1.64 against $0.97 filed. *Calculated here*: one formula per measure,
  printed under each row (`FORMULA` in `lib/gaap.ts`). Every figure sits
  beside the GAAP line it starts from.
- **The quarter join** matches a release to the filed quarter it covers:
  revenue within 0.5% first, else the latest quarter 7–120 days before the
  release whose 10-Q was not filed more than 45 days before it. A fiscal year
  of adjusted EPS needs all four quarters; its GAAP side is the four filed
  quarters summed too, so a share-count cent is not called an adjustment.
- **Not compared across units**: where the listing currency differs from the
  statements' (ADRs such as SAP, TSMC), adjusted and filed EPS are not set
  side by side.
- **Cost**: the as-reported row on opening the tab (1 request); the quarterly
  income statement on first opening Non-GAAP (1, shared with the dividend and
  Alpha Signal loads). The AAPL capture gained `incomeAsReported`,
  `stockBasedCompensation` and goodwill / intangibles (dated in its note).

## Shariah tab: the full v5.0 screen, per issuer (2026-10-07)

The Shariah Compliance tab now opens with a **researched screen** wherever one
exists — Apple only, so far — and keeps the mechanical five-index screen below
it as the cross-check. It follows `Shariah_Screening_Master_Methodology_v5_0.md`
(repo root) and Part XIV of it: Gate-4 attribution is per-issuer research, shown
only where a report exists, with its date and version.

- **`lib/shariah-v5.ts` is the arithmetic, `lib/shariah-issuers.ts` the inputs.**
  The engine holds the §3 threshold table (nowhere else), the per-lens market-cap
  window and debt track (D16, Δ37), the Δ22 Watch zone at Sc A/B only, D9 sizing
  (point at Sc A/B, conservative edge at Sc C/Strictest), open elections kept out
  of the total, and Δ6 v5.0 purification. A record carries filed figures, banded
  estimates with their basis, the Gate-1 walk, standards, flags and sources; an
  unsettled reading is a set of replacement lines the engine prices.
- **`AAPL_Shariah_Screening_v5_0.md`** (repo root) is the long-form report for
  the same numbers; `tests/shariah-v5.test.ts` pins them (Sc A PASS 2.61%; Sc B
  FAIL on cash + securities 38.2% of total assets; Sc C 5.58%; Strictest 5.99%;
  purification $0.38–0.69).
- **Inputs came from SEC filings, not the page's data**: the reference data has
  Apple's interest income as $0 and its cash as cash plus short-term only
  ($62.4b of $146.5b). Both are logged in the record's reconciliation table.
- The mechanical screen's footnote claimed its cash figure was "the stricter
  one"; it is the laxer one for any company holding long-dated bonds, and now
  says so. Its arithmetic is unchanged.
- No request is spent: the screen is static data. Adding an issuer is a record in
  `SHARIAH_ISSUERS` plus its report.
- **Reader-facing naming (user's call, same day):** scenarios, never schools of
  law — "Scenario A", "Scenario B · AAOIFI" (the preferred one, highlighted and
  driving the headline), "Scenario C", "Strictest"; the methodology's own label is
  "Maz Vantage", never "Platform". The tab opens with the five index families
  (`INDEX_RULES` / `indexScreen` in `shariah-v5.ts`, each on its own denominator and
  revenue test) beside Maz Vantage's Scenario B; national standards follow under
  "Other standards". No sources list on the tab (the filing links in the period
  line stay). Where a researched screen exists, the quick screen folds into a
  closed `<details>` — its cash figure and spot market cap would otherwise
  contradict the table at the top.
- **The quick screen now runs what it used to list as untested** (user's ask,
  same day). `lib/shariah.ts` holds the one definition of the five standards
  (window, receivables test, revenue test) that `shariah-v5.ts`'s `INDEX_RULES`
  now derives from. It divides by each provider's own 12/24/36-month average
  market cap from a new on-demand feed, `marketCapHist`
  (`historical-market-capitalization`, daily, three years; one request, made when
  the Shariah tab opens; today's market cap stands in, and says so, when it does
  not load). It tests trade receivables (`accountsReceivables`) where a provider
  does, interest income over revenue (a zero in the statement is "not reported",
  never a pass), and works out purification for one share and its dividend —
  interest after tax per share, the payout share of it, and the retail shortcut.
  Cash is now cash + short- + long-term investments (long-dated bonds belong in
  the test; equity stakes there overstate it, and the tab says so). Dow Jones is
  30% and FTSE divides by market cap (IdealRatings) everywhere these standards
  appear, including the Overview count and the Shariah desk. The AAPL capture
  gained month-end `marketCapHist` and the statement fields these need (dated in
  its note). `tests/shariah-quick.test.ts`.

## Alpha Signal → Demand Discovery (2026-10-08)

The user's Demand Discovery brief, built with the changes argued in `MAZ_DEMAND_DISCOVERY_SPEC.md` (repo root; the
brief is its Appendix A) and tested in `DEMAND_DISCOVERY_PILOT_REPORT.md`. Nothing in the Alpha Signal was changed;
the desk is a new tab at `/alpha/demand` (`sub: 'demand'`, in the Alpha Signal menu).

| File | What |
|---|---|
| `lib/demand-data.ts` | Quarter/company shape, capture reader, live-statement adapter, `pointInTime`, calendar-quarter alignment |
| `lib/demand-metrics.ts` | TTM/YoY with gap guards, growth profile, margins, inventory days, prepayments, capex, cash margins |
| `lib/demand-signals.ts` | Data types (ACTUAL/ESTIMATE/FORECAST/INFERRED/AI_DERIVED), source quality, evidence confidence |
| `lib/demand-cycle.ts` | Shortage signature, glut warning, capex floors, supply discipline, phases |
| `lib/demand-cohort.ts` | Layer cohorts (exposure-weighted), breadth, `scanCohorts` |
| `lib/demand-chains.ts` | Five hand-written chains (two are controls), exposures with their basis, lags, lead times |
| `lib/demand-pricedin.ts` | Reverse DCF and the priced-in gate |
| `lib/demand-score.ts` | Quality proxy, geometric opportunity score, confidence, `DEMAND_CALC_VERSION` |
| `lib/demand-language.ts` | Rule-based earnings-call reader (shown, not scored) |
| `lib/demand-engine.ts` | `analyseChain` / `analyseAll` → the brief's §45 JSON, with assembled thesis and bear text |
| `lib/demand-backtest.ts` | Point-in-time backtest, buckets, rank correlation |
| `components/pages/demand-page.tsx` | The desk: themes, backtest, evidence, method & limits |

- **Data:** `public/data/demand-capture.json` (16 companies captured 2026-10-08, 29 from 2026-10-09), `demand-evidence.json` (27 hand-read
  figures, 12 sources), `demand-language.json` (six calls, scores and ≤25-word snippets), `demand-backtest.json`
  (both periods summarised). `tests/fixtures/demand-history.json` holds 1996–2018 for the out-of-sample test.
  Built by `tools/capture/build_demand_capture.py`; see `tools/capture/README.md` §3.
- **Request cost:** none on the bundled reading. With live data, "Re-read with live filings" costs four requests per
  chain company (`incomeQ`, the new on-demand `balanceQ`, `cashflowQ`, `prices`) — 64 for the 16 companies.
- **Tests:** `tests/demand.test.ts` (33 checks: point in time, gap guards, reverse DCF, the AND property of the score,
  indirect members, evidence independence, the transcript reader, no look-ahead) and `tests/demand-pilot.test.ts`
  (5 checks on the real capture; writes the outputs with `DEMAND_PILOT=1`).
- **Not verified in the browser:** the live re-read path (no key in this environment). The bundled reading,
  every section, row expansion, and a 375px width were checked.

### Alpha Signal tab: management's words and the firms' views (2026-10-08)

Demand Discovery's management quotes, extended to every company with a transcript and placed on the company's own
Alpha Signal tab, plus what outside firms publish about it and its industry. Neither enters the score.

| File | What it does |
| --- | --- |
| `lib/management-voice.ts` | `readCall`: the bull and bear case in management's words, analysts' pushback with their firm, tone and its shift between calls |
| `lib/demand-language.ts` | `parseCall` and `ReaderOptions` added; Demand Discovery's defaults unchanged |
| `lib/firm-views.ts` | Consensus years (growth from the filed year), price-target windows, peers' consensus, chain membership, letters for a company |
| `components/alpha/outside-views.tsx` | `ManagementVoice` and `FirmViews`, rendered by `report/tabs/alpha-tab.tsx` after "The evidence" |

- **Data:** live, the two newest transcripts (`fetchTranscript`, +2 requests on opening the tab) and `gradeActions`
  (+1, shared with Insider Trading); `estimates`, `targetSummary`, `peers` and `income` are already loaded. Peers'
  consensus is a button: one `estimates` request per peer, up to eight. Without live data: `management-voice.json`
  (AAPL only), the AAPL snapshot's `gradeActions`, `demand-evidence.json` and the letters library.
- **Reader differences from Demand Discovery:** wider business topic; supply constraints count against a company's
  own case; analysts found by the operator's introduction as well as by question share (the demand reader can read
  an analyst's preamble as management — its stored readings were made that way and are unchanged); safe-harbour
  sentences skipped; near-repeat quotes dropped.
- **Tests:** `tests/management-voice.test.ts` (10) and `tests/firm-views.test.ts` (8).
- **Verified in the browser:** AAPL (saved reading) at desktop and 375px; the Demand Discovery row link. **Not
  verified:** the live transcript path, peers' consensus and the industry-figures list for a chain member (no key
  in this environment; the last is unit-tested).

`marketpages.js` is not ported: its four sections were only reachable through
`markets.js`'s `SECTIONS` table, which the dispatch resolved overview, stocks,
ETFs and economy ahead of, so none of it ever rendered in the legacy app.

### Demand Discovery: a wider AI chain and a bull and bear case per company (2026-10-09)

- **Chain:** thirteen companies added to the AI compute layers (see the pilot report §8); two layers renamed
  ("Memory and storage", "Chip-making equipment and test"); a memory → equipment edge.
- **Bull and bear case:** `lib/demand-case.ts` (`latestQuarterCase`, `CASE_BANDS`) reads the newest filed quarter
  both ways; `components/pages/demand-page.tsx` opens each company's detail with it, beside management's quotes and
  the analysts' pushback from the newest call (saved, or read live with two requests when data is connected) and the
  engine's own thesis and bear lines. The open detail is pinned to the table's visible width on narrow screens.
- **Reader:** firms with initials kept whole; a negation window option (four words in the business reader).
- **Tests:** `tests/demand-case.test.ts` (5); `tests/management-voice.test.ts` now 12; pilot and demand suites
  unchanged and passing on 29 companies.
- **Verified in the browser:** the AI chain's 19 company rows, NVDA's and MOD's bull and bear blocks, 375px.
  **Not verified:** the live call read (no key here).

## Launch focus: halal stock picking (2026-10-13)

Six changes from the product review of 2026-10-13, which set the positioning as research for the halal stock
picker: the halal label free, the analysis paid. Each has its own section below.

### 1. Demand Discovery out of the menu; "What the price assumes" on every Valuation tab

Demand Discovery's own pilot report found its headline signal (the shortage signature) did not predict returns
(rank correlation −0.10 out of sample), and it covers 29 hand-picked companies. Its reverse DCF — one of the parts
that held up — answers a question every stock picker asks, so it moved to every company.

| File | What it does |
| --- | --- |
| `lib/implied-growth.ts` | `priceImpliedGrowth`: the ten-year revenue growth the enterprise value implies, on the newest year's free-cash margin and the median across the years on file; the midpoint is read; past five-year revenue growth beside it. Refuses, with the reason, for financials, for statements reported in another currency than the price, and without positive free cash |
| `lib/demand-pricedin.ts` | `pricedInLevel` exported, so both readings share one set of cut points |
| `lib/model.ts` | `deriveImpliedGrowth` reads the annual statements (the vendor fields stay in this file) into `a.impliedGrowth`, after the grades: never an input to one |
| `components/report/implied-growth-card.tsx` | The card, first on the Valuation tab's detail; `impliedSentence` and `impliedTone` are reused by the verdict card |
| `lib/nav.ts`, `pages/alpha-page.tsx`, `alpha/outside-views.tsx` | Demand Discovery `hidden` (routable, labelled "Lab"), off the Alpha section bar, and no longer linked from non-member companies |

- **Request cost:** none — annual income, balance and cash-flow statements are already loaded.
- **Tests:** `tests/implied-growth.test.ts` (7): agreement with the gate's solver, the midpoint, the four-year
  minimum, the no-cycle-cash floor, every refusal, past growth, and the AAPL and NVDA captures.
- **Verified in the browser:** AAPL's saved report, Valuation tab (15.8% asked against 8.7% delivered, "Priced in");
  the Alpha Signal page without the Demand Discovery section. `/alpha/demand` still opens.

### 2. Search: server-rendered halal summary, per-tab titles, structured data, sitemap and robots

The report renders in the browser, so the HTML a search engine fetched for `/stock/AAPL` held a skeleton. The page
people search for — "is <company> halal?" — now answers in the server HTML.

| File | What it does |
| --- | --- |
| `lib/halal-label.ts` | `halalLabel`: the one label every free surface prints — the researched v5.0 screen where one exists (preferred scenario), else the quick screen's count. The Shariah tab's headline now comes from it too (which fixes "Passes all 5" when a standard could not be measured) |
| `lib/server/stock-summary.ts` | Server only: five reads (profile, balance, income, dividends, market-cap history) through the browser's own `FEEDS` specs, cached a day by the framework; the bundled snapshot without a key; null rather than an invented summary |
| `lib/server/universe.ts` | The sitemap's companies: one screener read (US, largest first, up to 5,000), cached a day; the bundled reports without a key |
| `components/report/stock-summary.tsx` | `StockSummaryBlock` (shown while the report loads) and `StockJsonLd` (an FAQ "Is X halal?" and the company), both streamed behind Suspense |
| `app/stock/[symbol]/layout.tsx`, `[[...tab]]/page.tsx` | The summary as the report's `preface`; per-tab titles, descriptions and canonical links ("Is Apple Inc. (AAPL) halal? Shariah compliance check") |
| `app/sitemap.ts`, `app/robots.ts`, `lib/site.ts` | Every visible menu section, then each company's report and Shariah tab; `/api/` disallowed; absolute URLs from `NEXT_PUBLIC_SITE_URL` (documented in `.env.example`) |
| `report/report-shell.tsx` | Takes `preface`; no longer overwrites the server's title on load |

- **Request cost:** five reads per company per day on the server, however many readers and crawlers open it, plus one
  screener read a day for the sitemap. Nothing new in the browser.
- **Before launch:** set `NEXT_PUBLIC_SITE_URL`, or the sitemap and canonical links point at localhost.
- **Tests:** `tests/halal-label.test.ts` (5): the count rules, the excluded activity, the researched-first order on the
  AAPL and NVDA copies, and the summary's snapshot fallback (and refusal of a symbol without one).
- **Verified:** the served HTML of `/stock/AAPL/shariah-compliance` (title, description, canonical, JSON-LD, the summary
  heading), `/robots.txt`, `/sitemap.xml` (88 URLs without a key), and the NVDA Shariah tab in the browser.

### 3. The verdict card, and the seam for plans

A reader arriving from a search lands on eighteen tabs. The Overview now opens with the two questions they came with.

| File | What it does |
| --- | --- |
| `components/report/verdict-card.tsx` | Four cells over the chart: **Is it halal?** (free; `halalLabel` on the averaged market cap), **Maz grade**, **What the price assumes** and **Watch out for** (the first sentence of the two weakest ratios), each linking to the tab that explains it |
| `lib/access.ts` | `FEATURE_PLAN` (the halal surfaces free, the analysis Pro, score history Pro+), `canUse`, `planFor`. Gating is **off** unless `NEXT_PUBLIC_PLAN_GATING=on` |
| `components/access-context.tsx` | `AccessContext` / `useAccess`: the back end provides the reader's plan here once accounts exist |
| `components/report/use-mcap-history.ts` | The Shariah tab's market-cap history hook, shared so the card and the tab print the same label |

- **Gated:** a paid cell says what it holds and links to the plans. It never shows a blurred or invented figure. The
  check is presentation only; once there are accounts, the server must withhold the paid figures too.
- **Ungated (today):** every cell shows its figures with a small "Pro" or "Free" mark.
- **Request cost:** +1 on opening a report (`marketCapHist`, which the Shariah tab already read; cached, so opening the
  tab afterwards costs nothing).
- **Tests:** `tests/access.test.ts` (2).
- **Verified in the browser:** NVDA and AAPL at 1400px and 390px, ungated and with `NEXT_PUBLIC_PLAN_GATING=on`.

### 4. ETF Halal Check (`/shariah/etf?fund=SPUS`)

Readers say Shariah ETFs hold companies that are not compliant. Often both sides are right: the fund follows one
provider's rules and the reader another's. This tab puts every holding of a fund through the company screen and adds
up the fund's weight.

| File | What it does |
| --- | --- |
| `lib/etf-halal.ts` | `loadFund` (record and holdings), `checkFund` (one screener read for sector, industry and market cap, then each holding's annual balance sheet — a profile too for holdings the screener does not list — largest first, up to the cap), `checkHolding` and `summariseFund` (pure): weight by label, and pass / fail / not measured under each of the five standards |
| `components/pages/etf-halal-page.tsx` | Ticker field, suggested funds, cap (50 / 100 / 250), a button that states the request count; the weight bar, the per-standard table, and every holding with its label and a link to its Shariah tab (CSV export) |
| `pages/shariah-page.tsx`, `lib/nav.ts` | The tab and its menu item |

- **Each holding's label** is `halalLabel`, as on its report, but on **today's market cap** (the averages would cost a
  request per holding) and without the interest-income test. The page says both. Lines with no ticker, holdings with no
  balance sheet and holdings past the cap are reported as "not screened", never as a pass or a fail.
- **Request cost:** 2 on choosing a fund; then 1 screener read plus 1 per holding screened (2 for a holding outside the
  screener's US list). About 53 for the default cap of 50. Balance sheets are cached and shared with the reports.
- **Tests:** `tests/etf-halal.test.ts` (8): pass, fail, excluded activity, mixed standards, never-screened lines, the
  weight sums by label and per standard, the cost.
- **Verified in the browser:** with live data stubbed in memory (a five-company fund plus cash, using the AAPL and NVDA
  captures and made-up rows for the rest; nothing stored or sent): the run, the bar, the table, 0 errors. **Not verified:**
  a real fund's holdings (no key in this environment).

### 5. Purification worked out automatically, and a zakat calculator

| File | What it does |
| --- | --- |
| `lib/purification.ts` | `autoImpure`: the impure share of a dividend — the researched v5.0 screen's Δ6 (interest and impure revenue after tax, over earnings) where one exists, else after-tax interest over net income from the newest annual statement; null, never zero, without an interest line or in a loss year |
| `pages/watchlist-page.tsx` | The Purification block fills each holding's impure share from `autoImpure` and labels its source ("researched" / "interest"); a reader's own figure still wins. The old hint divided interest by **revenue**, which understated the share of a dividend several times over |
| `lib/zakat.ts` | `zakatLine` / `zakatTotal`: held to trade → 2.5% of market value; held long term → 2.5% of the company's cash, receivables and inventory per share (current liabilities deducted only when the reader asks); lunar 2.5% or solar 2.577%; a line that cannot be read is left out and says why |
| `components/pages/zakat-page.tsx` | Shariah → Zakat (`/shariah/zakat`): the reader's list (kept in this browser, **new storage key `mazvantage.zakat`**), filled by hand or from the active watchlist's holdings |
| `pages/shariah-page.tsx`, `lib/nav.ts` | The Zakat tab and menu item; the Purification tab now says what is worked out and links to the watchlist |

- **Request cost:** purification, unchanged (the income bag it already loaded). Zakat: one batch quote, then a balance
  sheet and an income statement per long-term line, on the button; cached and shared with the reports.
- **Not decided here:** the nisab (needs all of a reader's wealth) and whether a company already pays zakat. The page
  says both.
- **Tests:** `tests/zakat-purification.test.ts` (7).
- **Verified in the browser** with stubbed live data (AAPL and NVDA captures, made-up rows for the rest; nothing stored
  or sent): the zakat table, both methods, a line left out, the total; the watchlist's purification shares and labels.

### 6. Portfolio compliance, compliance changes, the Ideas track record — and the back-end contract

Alerts and a track record need memory across days, which needs the back end being built separately. What could be
built without it is built; the rest is a seam and a contract (`BACKEND_CONTRACT.md` at the repository root).

| File | What it does |
| --- | --- |
| `pages/watchlist-page.tsx` → `ComplianceBlock` | Every holding's `halalLabel` (profile and balance bags, on a click), the share of the list's value passing / mixed / failing (counted equally until every holding has shares), and **"Changed since you last looked"** with "Mark as seen" |
| `lib/compliance-changes.ts` | `recordOf`, `diffLabels`, `direction`: what counts as a change and which way. The browser uses it today against `mazvantage.halal.seen` (**new storage key**); the nightly job should import it |
| `lib/track-record.ts` | `trackRecord`: equal-weight price return chained over published lists, the benchmark over the same dates, annualised after a full year, members with no end price counted in `missing`, never dropped silently |
| `lib/backend.ts` | `NEXT_PUBLIC_BACKEND_URL` and `fetchTrackRecord`; no request at all while it is unset |
| `components/ideas/track-record-card.tsx` | On every portfolio page; renders nothing until the back end serves a record |
| `BACKEND_CONTRACT.md` | Plans and `AccessContext`; the daily `halal_labels` table, changes and email alerts; the track-record endpoint and its JSON; score history; storage keys to migrate; costs |
| `.env.example` | `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_PLAN_GATING` |

- **Request cost:** the Compliance block, a profile and a balance sheet per holding on the button (both shared with
  other blocks and the reports). The track record: none until the back end exists.
- **Tests:** `tests/track-and-changes.test.ts` (4).
- **Verified in the browser** with stubbed live data (two captures, three made-up companies; nothing stored or sent but
  the in-browser last-seen labels): the labels, the value split, two changes (one worse, one better). **Not verified:**
  the track-record card with a real back end (none exists yet; the arithmetic is unit-tested).
