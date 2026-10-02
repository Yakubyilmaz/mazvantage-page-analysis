# Data provenance (repo only — not served)

The files under `public/data/` are served to readers, who are not told where the
data comes from (2026-10-01). Their `note` fields were rewritten in neutral terms;
the original notes are kept here verbatim. All market data comes from Financial
Modeling Prep (FMP) through the server proxy at `/api/data` (key: `FMP_API_KEY`).
Check FMP's terms for any attribution your plan requires before publishing.

## public/data/13f-capture.json

Berkshire Hathaway Inc (CIK 0001067983), captured from Financial Modeling Prep on 2026-10-01 through the FMP connector (Ultimate tier), so the Superinvestors page renders one fund with no API key. Holdings are the Q2 and Q1 2026 13F extracts, trimmed to the fields the page reads; their values sum to the vendor's own portfolio totals (US$299,253,556,246 and US$263,095,703,570). The performance rows are the vendor's last eight quarters. Every figure is filed or FMP-published — none is synthesised — but it is a point-in-time capture, not a live read.

## public/data/AAPL.json

Captured from Financial Modeling Prep on 2026-09-22 through the FMP-moi connector (Ultimate tier), so every feed the report uses is present. Statement, dividend and ownership rows are trimmed to the fields the app reads. The five Alpha Signal feeds (incomeQ, cashflowQ, gradesHistorical, targetSummary, holdersSummary) were added on 2026-09-22 so the Alpha Signal tab renders at full category coverage with no API key. The insiderStats rows were re-captured on 2026-09-22 with the open-market Form 4 fields (totalPurchases / totalSales) the earlier trim dropped, so insider conviction is measured from codes P and S rather than reported unavailable. Every figure is Apple's filed or FMP-published data as of that date — none of it is synthesised — but it is a point-in-time capture, not a live read, and any date-relative reading on the page (freshness, days-until-earnings) is measured against today rather than against the capture date. The secFilings rows (every SEC filing from 2024-10-01 to the 2026-09-22 capture date, trimmed to form type, dates and links) were captured on 2026-10-01 and cut at the capture date, so the list ends where the rest of the snapshot does. The balance rows gained netReceivables, propertyPlantEquipmentNet, longTermInvestments and longTermDebt, and the cash-flow rows depreciationAndAmortization, on 2026-10-01 for the Beneish M-Score; the fiscal years are unchanged since the capture, as Apple had filed no new 10-K in between.

## public/data/sector-stats.json

Modelled distributions, not measured ones. Sector P/E centres are anchored on FMP's sector P/E snapshot for 2026-08-27; the rest are market-wide shapes with per-sector adjustments. Run tools/build_sector_stats.py with an FMP key to replace this with measured data.

## public/data/MAP-SOURCES.md

Rates are loaded from FMP's Economic Data Releases Calendar using the app's configured connection.

## public/data/alpha-disclosures.json

"no FMP endpoint can fill: …" and "which is the series FMP does not publish."
