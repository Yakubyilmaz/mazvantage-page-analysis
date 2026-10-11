# Data provenance (repo only — not served)

The files under `public/data/` are served to readers, who are not told where the
data comes from (2026-10-01). Their `note` fields were rewritten in neutral terms;
the original notes are kept here verbatim. All market data comes from Financial
Modeling Prep (FMP) through the server proxy at `/api/data` (key: `FMP_API_KEY`).
Check FMP's terms for any attribution your plan requires before publishing.

## public/data/13f-capture.json

Berkshire Hathaway Inc (CIK 0001067983), captured from Financial Modeling Prep on 2026-10-01 through the FMP connector (Ultimate tier), so the Superinvestors page renders one fund with no API key. Holdings are the Q2 and Q1 2026 13F extracts, trimmed to the fields the page reads; their values sum to the vendor's own portfolio totals (US$299,253,556,246 and US$263,095,703,570). The performance rows are the vendor's last eight quarters. Every figure is filed or FMP-published — none is synthesised — but it is a point-in-time capture, not a live read.

## public/data/AAPL.json

Captured from Financial Modeling Prep on 2026-09-22 through the FMP-moi connector (Ultimate tier), so every feed the report uses is present. Statement, dividend and ownership rows are trimmed to the fields the app reads. The five Alpha Signal feeds (incomeQ, cashflowQ, gradesHistorical, targetSummary, holdersSummary) were added on 2026-09-22 so the Alpha Signal tab renders at full category coverage with no API key. The insiderStats rows were re-captured on 2026-09-22 with the open-market Form 4 fields (totalPurchases / totalSales) the earlier trim dropped, so insider conviction is measured from codes P and S rather than reported unavailable. Every figure is Apple's filed or FMP-published data as of that date — none of it is synthesised — but it is a point-in-time capture, not a live read, and any date-relative reading on the page (freshness, days-until-earnings) is measured against today rather than against the capture date. The secFilings rows (every SEC filing from 2024-10-01 to the 2026-09-22 capture date, trimmed to form type, dates and links) were captured on 2026-10-01 and cut at the capture date, so the list ends where the rest of the snapshot does. The balance rows gained netReceivables, propertyPlantEquipmentNet, longTermInvestments and longTermDebt, and the cash-flow rows depreciationAndAmortization, on 2026-10-01 for the Beneish M-Score; the fiscal years are unchanged since the capture, as Apple had filed no new 10-K in between. On 2026-10-07 the cash-flow rows gained stockBasedCompensation, the balance rows goodwill, intangibleAssets and goodwillAndIntangibleAssets, and a new incomeAsReported feed holds the FY2025 10-K income statement as tagged (income-statement tags only, other comprehensive income dropped), read through the same connector for the Financials tab's GAAP / non-GAAP split. On 2026-10-07, for the Insider Trading tab, two on-demand feeds were read through the same connector and cut at the 2026-09-22 capture date: insiderHistory (`insider-trading/search`, the latest 500 Form 3 and 4 rows; the October 2022 rows were dropped because the pull ended part-way through that month, so it runs from November 2022; the CIK fields dropped) and gradeActions (`grades`, every rating action by a named firm from 22 September 2023 to the capture date, trimmed to date, firm, previous and new rating, and action).

On 2026-10-09 the time-sensitive feeds the Alpha Signal reads were refreshed through the same connector and folded in with `tools/capture/fold_alpha_refresh.py`, which records each one's refresh date under `feedDates` and leaves `capturedAt` at 2026-09-22: prices (daily closes 2025-09-02 to 2026-10-09; they had stopped at 2026-08-21), the SPY and XLK benchmark series under `extras.benchmarks` (same span; the sector series had also stopped at 21 August, the market one at the capture date, so relative strength compared different windows), holdersSummary (the June 2026 13F quarter; it was March), gradesHistorical (to October 2026), targetSummary, earnings (the next report moved from 29 October to 2 November), estimates, insiderStats and gradeActions (to 1 October 2026, from 22 September 2023), and a new segProductQ feed — revenue by product segment per fiscal quarter, Q3 FY2023 to Q3 FY2026 — so the revenue-mix reading is quarterly rather than a year old. The statements were not touched: Apple filed no new 10-Q or 10-K in between. Later the same day the news feed was refreshed the same way: the 100 newest stories on AAPL from the stock-news wire (3 to 9 October 2026, headlines, summaries and links as sent; the capture had held two), so the News tab's event tags and the Alpha Signal's "what happened recently" have something to read without live data.

## public/data/sector-stats.json

Modelled distributions, not measured ones. Sector P/E centres are anchored on FMP's sector P/E snapshot for 2026-08-27; the rest are market-wide shapes with per-sector adjustments. Run tools/build_sector_stats.py with an FMP key to replace this with measured data.

## public/data/MAP-SOURCES.md

Rates are loaded from FMP's Economic Data Releases Calendar using the app's configured connection.

## public/data/alpha-disclosures.json

"no FMP endpoint can fill: …" and "which is the series FMP does not publish."

## public/data/management-voice.json

The saved readings behind the Alpha Signal tab's "In management's words" section and the Demand Discovery
"Bull case and bear case" block: Apple's fiscal 2026 Q2 and Q3 earnings calls (2026-10-08), and from 2026-10-09 the
newest call of each of the 25 revenue-layer chain companies (July–September 2026; Micron's is the item the
connector lists for fiscal Q4, labelled a post-earnings analyst call). Read from Financial Modeling Prep's
`earning-call-transcript` through the FMP connector (Ultimate tier) and run through `lib/management-voice.ts` by
`web/tests/management-voice.test.ts` (`VOICE_CALLS=<dir> VOICE_WRITE=1`). The transcripts are not stored — only the
tone scores, counts, flags and quotes of at most 25 words, each with its speaker (and, for analysts, the firm the
operator named). With live data the tab reads the two newest calls itself and this file is not used.

## public/data/demand-capture.json, demand-backtest.json, demand-language.json, demand-evidence.json

Demand Discovery's pilot data (2026-10-08). `demand-capture.json` holds quarterly income, balance-sheet and cash-flow
figures (2017–2026) and weekly closes (2018–2026) for 29 companies (16 on 2026-10-08, 13 more on 2026-10-09) plus SPY
and copper (HGUSD), read from Financial
Modeling Prep through the FMP connector (Ultimate tier): quarterly `income-statement`, `balance-sheet-statement`,
`cash-flow-statement` (limit 120), quarterly `enterprise-values`, and `historical-price-eod/light` /
`commodities-historical-price-eod-light`. Large replies were kept as raw JSON; short ones (Vertiv's and Sandisk's
statements, every company's enterprise values) were typed from the connector's reply into pipe-separated files;
`tools/capture/build_demand_capture.py` folds both. Sandisk's pre-spin quarters and prices and Vertiv's
blank-cheque-era rows are floored as described in that script. `web/tests/fixtures/demand-history.json` is the
same for 8 companies, 1996–2018 (test fixture, not served); 72 old rows with no usable filing date are treated as
filed 60 days after the period end. `demand-backtest.json` and `demand-language.json` are derived by
`web/tests/demand-pilot.test.ts`; the language file was computed from six FMP earnings-call transcripts (`earning-call-transcript`), which are
not stored — only scores and snippets of at most 25 words. `demand-evidence.json` is hand-entered from IEA, USGS,
WSTS, IFR and Micron pages, each row with its URL and publication date; none of it comes from FMP.
