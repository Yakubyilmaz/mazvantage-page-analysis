# Maz Vantage — Market Data Requirements (for a Financial Modeling Prep quote)

Prepared 2026-10-02 from the application code (`web/src/lib/fmp.ts`, `web/src/lib/fmp/paths.ts`).
Everything below is what the app actually calls today, against FMP's **stable** API
(`https://financialmodelingprep.com/stable/...`).

---

## 1. Who we are and what we need

**Maz Vantage** is a subscription web application for equity research ("Market Research to your
advantage"). Paying subscribers (Pro and Pro+ plans) see company reports, scores and screens
computed from market data, plus market, news, calendar and fund pages.

**We need a commercial licence, not a personal plan.** FMP's Starter, Premium and Ultimate plans
are licensed for personal, non-commercial use and do not allow integrating the data into tools that
third parties can access. We therefore need a quote for:

1. **A commercial display licence** (FMP's Data Display and Licensing Agreement, through the Build
   or Enterprise plan, whichever fits). It must cover:
   - **Display** of FMP data to paying subscribers on a public website.
   - **Derived data**: our own scores, grades, fair values and rankings, computed from FMP data and
     shown to subscribers.
   - **End-user export** (Pro+): tables exported as CSV, reports saved as a snapshot file, and
     reports exported as PDF.
   - **Storage**: we plan to store daily derived scores, and later cache raw responses on our
     server (see §5).
   - **Logos and images**: company logos and news images served from FMP's image hosts.
2. **The data scope in §3**, which today runs on the **Ultimate** plan. 13F, earnings call
   transcripts and ETF holdings all need Ultimate, and the app's bundled sample data was captured
   on Ultimate.
3. **Global coverage** (§4).
4. **Throughput and bandwidth** sized in §5.

**Real-time data is not required.** The site states "Quotes may be delayed", and delayed/EOD
quotes are acceptable if that lowers the cost. We do not use websockets or bulk endpoints today
(see §6 on bulk).

---

## 2. Questions for FMP

1. What is the price of a commercial display licence (Build or Enterprise) covering §1 for a
   subscription product, and how is it structured: per subscriber, flat, or tiered?
2. **Attribution:** is visible attribution to FMP required on pages that display the data? The
   app currently shows no data-source attribution. Tell us if we must add it.
3. Does the licence cover end-user exports (CSV, PDF, saved snapshots), or only on-screen display?
4. May we store FMP data and our derived scores in our own database, and for how long? May we
   serve one cached response to many users?
5. Are delayed quotes cheaper to license than real-time, and does that change exchange fees?
6. Is 13F (institutional ownership), earnings-call transcript and ETF holdings data included in
   the commercial tier, or priced separately?
7. Do you offer any of these, which we currently lack: a **time series of consensus EPS and
   revenue estimates** (estimate revisions), **short interest**, **pre/post-market quotes**,
   **options data**, a **corporate-events calendar** (investor days, buyback authorisations),
   **job postings**, **patent data**, **search-interest data**?
8. Rate limits and monthly bandwidth for the commercial tier, and the price of overage.

---

## 3. Endpoints used (79 allowed by our server proxy)

"Rows/params" shows what we request. "Tier" shows the minimum public plan **only where FMP's
public pages say so**; everything else must be confirmed with FMP. Everything listed works on
Ultimate today.

### 3.1 Company fundamentals (per symbol, company report)
| Endpoint | Rows / params | Used for | Tier |
|---|---|---|---|
| `profile` | 1 | Header, sector, logo, market cap | Starter |
| `income-statement` | annual × 10 · quarterly × 12 | Five-factor model, financials, Alpha Signal | annual: Starter · quarterly: Premium |
| `balance-sheet-statement` | annual × 10 | Financial health, Beneish M-Score | Starter |
| `cash-flow-statement` | annual × 10 · quarterly × 12 | Cash-flow metrics, Alpha Signal | annual: Starter · quarterly: Premium |
| `ratios` / `ratios-ttm` | annual × 10 / 1 | 115 ratios, peer comparison, screens | confirm |
| `key-metrics` / `key-metrics-ttm` | annual × 10 / 1 | Valuation and statistics | confirm |
| `financial-growth` | annual × 10 | Growth factor, peer growth | confirm |
| `financial-scores` | 1 | Altman Z, Piotroski F | confirm |
| `owner-earnings` | 8 quarters | Owner earnings | confirm |
| `revenue-product-segmentation` | annual | Revenue mix, Sankey | confirm |
| `revenue-geographic-segments` (alt: `-segmentation`) | annual | Geographic mix | confirm |
| `historical-employee-count` | 15 | Workforce | confirm |
| `discounted-cash-flow` / `levered-discounted-cash-flow` | 1 | Reference DCF beside our 13 models | confirm |
| `ratings-snapshot` | 1 | Reference rating | confirm |
| `shares-float` | 1 | Float, closely held | confirm |
| `key-executives` · `governance-executive-compensation` | all | Management section | confirm |
| `stock-peers` | all (we read up to 8) | Peer set | confirm |

### 3.2 Prices and quotes
| Endpoint | Rows / params | Used for | Tier |
|---|---|---|---|
| `quote` | 1 | Report header | confirm |
| `batch-quote` | up to 50 symbols per call | Watchlists, market rail, boards, compare | confirm |
| `historical-price-eod/light` | 6 years daily (reports) · 1 year (ETF grades) | Charts, returns, momentum, risk | Starter |
| `historical-price-eod/full` | user-chosen range | Market charts | Starter |
| `historical-chart/5min` | intraday | 1-day charts | **Premium** |
| `stock-price-change` | up to 50 symbols per call | 1D…3Y return windows | confirm |
| `batch-index-quotes` · `batch-commodity-quotes` · `commodities-list` | all | Markets hub | confirm |
| `batch-forex-quotes` · `batch-crypto-quotes` | all | Markets hub | Starter (forex, crypto) |
| `biggest-gainers` · `biggest-losers` · `most-actives` | all | Movers on every page's side panel | confirm |

### 3.3 Analyst data
| Endpoint | Rows / params | Used for | Tier |
|---|---|---|---|
| `analyst-estimates` | annual × 6 | Forecasts, dividend model, Alpha Signal | confirm |
| `price-target-consensus` · `price-target-summary` | 1 | Price target, target momentum | confirm |
| `grades-consensus` | 1 | Wall Street rating | confirm |
| `historical-grades` | 24 months | Rating-mix shift | confirm |

### 3.4 Ownership and insiders
| Endpoint | Rows / params | Used for | Tier |
|---|---|---|---|
| `insider-trading/search` | 100 | Insider table, chart markers | confirm |
| `insider-trading/statistics` | all quarters | Insider conviction | confirm |
| `institutional-ownership/extract-analytics/holder` | top 20 (report) · 100 × 8 quarters (history) | Ownership section | **Ultimate** |
| `institutional-ownership/symbol-positions-summary` | 1 quarter | Alpha Signal; big-banks portfolio baseline | **Ultimate** |
| `institutional-ownership/dates` · `/extract` | full filing per filer-quarter | Superinvestors (about 20 funds); "Following the big banks" (11 filers × 2 quarters) | **Ultimate** |
| `institutional-ownership/holder-performance-summary` · `/holder-industry-breakdown` | per fund | Superinvestor pages | **Ultimate** |

### 3.5 Earnings, dividends, calendars, transcripts
| Endpoint | Rows / params | Used for | Tier |
|---|---|---|---|
| `earnings` | 12 | Surprises, next date | confirm |
| `dividends` | 60 per symbol | Dividend module, ETF yields | confirm |
| `earnings-calendar` (`includeReportTimes=true`) · `dividends-calendar` · `splits-calendar` · `ipos-calendar` | date ranges | Calendar page, earnings desk; split restatement for 13F | **Premium** (corporate calendars) |
| `earning-call-transcript-dates` | all | Transcript index | **Ultimate** |
| `earning-call-transcript` | 1 call per open | **Full transcript text shown to readers** | **Ultimate** |
| `earnings-transcript-list` | all | Transcript library | **Ultimate** |

### 3.6 News and filings
| Endpoint | Rows / params | Used for | Tier |
|---|---|---|---|
| `news/stock` | 100 per company | News tab (headline, summary, image, link) | Starter (news) |
| `news/press-releases` | 50 per company | Company releases | confirm |
| `news/general-latest` · `news/stock-latest` | 100 per page, 2 pages | Market news, sector wires | Starter (news) |
| `news/press-releases-latest` | — | Allowed, not currently called | — |
| `sec-filings-search/symbol` | 2 years, up to 1,000 rows | SEC filings list (links to EDGAR) | confirm |

### 3.7 Screener and market structure
| Endpoint | Rows / params | Used for | Tier |
|---|---|---|---|
| `company-screener` | up to 5,000 rows per call, by country, exchange, sector, size | Directories, every screen, scans, calendars | confirm |
| `sector-performance-snapshot` · `industry-performance-snapshot` | daily | Sector pages, heatmap | confirm |
| `sector-PE-snapshot` · `industry-PE-snapshot` | daily | Sector valuation context | confirm |

### 3.8 ETFs and funds
| Endpoint | Rows / params | Used for | Tier |
|---|---|---|---|
| `etf/info` (alt: `etf-info`) | 1 per fund | ETF grades, Fund X-Ray, sectors | **Ultimate** (fund data) |
| `etf/holdings` · `etf/sector-weightings` · `etf/country-weightings` · `etf/asset-exposure` | full | Fund X-Ray look-through, sector exposure | **Ultimate** |

### 3.9 Economics
| Endpoint | Rows / params | Used for | Tier |
|---|---|---|---|
| `treasury-rates` | 35 days | Yield curve, risk-free rate | confirm |
| `economic-indicators` | by name and range | Economy pages | confirm |
| `economic-calendar` | date ranges | Calendar, economy | confirm |

### 3.10 Images
Company logos from `images.financialmodelingprep.com/symbol/{SYMBOL}.png`, plus news images. Both
are proxied through our server and cached for a day.

---

## 4. Coverage and history

- **Primary market: United States** (NASDAQ, NYSE, AMEX, NYSE Arca, BATS, CBOE). Company reports,
  screens, ideas and the Alpha Signal are US-focused.
- **Markets pages: 44 countries**, with local indices, movers and exchange screens. Americas: US,
  CA, BR, MX, AR, CL. Europe: GB, DE, FR, NL, CH, ES, IT, SE, AT, BE, CZ, DK, FI, GR, IE, IS, NO,
  PL, PT, RU, TR. Middle East and Africa: IL, AE, QA, SA, ZA. Asia-Pacific: JP, CN, HK, IN, KR, TW,
  SG, ID, MY, TH, AU, NZ. **We need global coverage.**
- **History depth:** 10 years of annual statements, 12 quarters, 6 years of daily prices on
  reports, intraday 5-minute bars, 2 years of SEC filings, and 13F for the latest two quarters
  (8 quarters of holder history).

---

## 5. Volume

### 5.1 Requests per action (live, uncached)
| Action | Requests |
|---|---|
| Open a company report | **up to 52**: 34 per-company feeds, up to 8 peers × 2, 2 benchmark price series |
| …then open its Alpha Signal tab | +5 |
| …open a transcript / the SEC filings list / the 13F history | +1 / +1 / +8 |
| Change a chart range | +1 |
| Side panel on every page (indices, watchlist, movers, earnings) | about 6–8, cached 10 minutes per browser |
| Stock directory / a screener table | 1 (`company-screener`, up to 5,000 rows) |
| Run one Investment Ideas portfolio | about 600 (a budget of 600; some screens double it) + 1 screener |
| "Following the big banks" portfolio | **636 requests, about 60 MB** (full 13F filings, 2–5 MB per filer-quarter) |
| Alpha Signal market scan (Pro+) | 1 + 7 per company: 60 / 150 / 300 companies → 421 / 1,051 / **2,101** |
| ETF tables board / grade that board | about 4 per 90 funds / 3 per fund (about 270) |
| Fund X-Ray (up to 6 funds) | about 4 per fund |

### 5.2 Peak rate
Each browser runs at most 5 requests in parallel. A 300-company Alpha scan issues about 2,100
requests within one to two minutes. That is above the published per-minute limits of the personal
Starter (300/min) and Premium (750/min) plans, and inside Ultimate's (3,000/min) for a single user.
Several users scanning at once would exceed it.

### 5.3 How volume scales today, and what we will change
Today **every reader's browser makes its own requests** through our server proxy, with a 10-minute
cache **per browser only**. Vendor calls therefore grow linearly with readers. Before launch we
plan a **shared server cache**: quotes about 1 minute, prices and fundamentals daily, 13F and
transcripts until the next filing. A popular company page would then cost FMP one fetch per
cache period, however many readers open it. Please quote for that architecture, and tell us
whether serving one cached response to many users is permitted.

### 5.4 Illustrative month (for sizing, not a forecast)
1,000 subscribers × 20 report views × 52 requests ≈ 1.0 M requests. Add market pages, screens
and scans for roughly 2–3 M requests a month uncached. A shared cache should cut this by an order
of magnitude for popular symbols. Bandwidth is driven mainly by 13F filings (60 MB per big-banks
run), the 5,000-row screener and 6-year price series.

---

## 6. What we do not use, and might

- **Bulk endpoints** (for example all profiles or TTM ratios in one file): not used. They could
  replace thousands of per-symbol calls for screens and scans, so please include their price.
- **Websockets / real-time**: not used and not required.
- **ESG, technical-indicator endpoints, mutual-fund-only data**: not used. Technical indicators
  are computed in the app from daily prices.

---

*Source of this inventory: `web/src/lib/fmp/paths.ts` (the proxy allow-list) and
`web/src/lib/fmp.ts` (the feed catalogue). Update this file whenever a path is added there.*
