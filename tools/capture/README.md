# The Alpha Signal captures

Two files in `web/public/data/` are hand-captured rather than fetched, and this is
the record of where every figure came from so each can be re-read and re-typed.

Neither is a feed. Both are frozen at their `capturedAt` date, and the UI
prints that date beside anything built from them.

---

## 1. `web/public/data/AAPL.json` — the bundled snapshot

Captured through an authenticated FMP connector at Ultimate tier. The app's own
**Settings → Save snapshot** button produces exactly this shape from a live
session, so the supported way to refresh it is to connect a key and press that.

`tools/capture/capture_alpha_snapshot.py` folds the five Alpha-only feeds into
an existing snapshot:

```bash
python tools/capture/capture_alpha_snapshot.py .
```

| Feed | FMP endpoint | Rows |
| --- | --- | --- |
| `incomeQ` | `income-statement?period=quarter&limit=12` | 12 quarters |
| `cashflowQ` | `cash-flow-statement?period=quarter&limit=12` | 12 quarters |
| `gradesHistorical` | `historical-grades?limit=24` | 24 months |
| `targetSummary` | `price-target-summary` | 1 |
| `holdersSummary` | `institutional-ownership/symbol-positions-summary` | 1 (quarter ended 2026-03-31) |
| `insiderStats` | `insider-trading/statistics` | 8 quarters, **with** `totalPurchases`/`totalSales` |
| `extras.benchmarks.market` | `historical-price-eod/light?symbol=SPY` | 271 closes |

The `insiderStats` row matters: an earlier capture trimmed the open-market
Form 4 fields, and without `totalPurchases`/`totalSales` the insider provider
correctly refuses to read compensation activity as conviction and reports the
signal unavailable. Keep those two fields on any re-capture.

`holdersSummary` needs an FMP **Ultimate** plan. On a lower tier the feed comes
back gated and the institutional category reports it rather than guessing.

---

## 2. `web/public/data/alpha-disclosures.json` — read by hand

Six categories have gaps no FMP endpoint fills. Where a primary source
publishes the fact for free, it is read from the page below and typed in.

Captured **2026-09-22**. Every figure is re-checkable at the URL given.

### `estimateRevisions` — the measurement FMP does not publish

- **Source:** <https://finance.yahoo.com/quote/AAPL/analysis/>
- **Read:** the *EPS Trend* table (current / 7 / 30 / 60 / 90 days ago) and the
  *EPS Revisions* table (up and down counts over 7 and 30 days), for all four
  periods, plus the analyst count from *Earnings Estimate*.
- **Note:** the page shows a GAAP / Normalized toggle. The capture is the GAAP
  view, which is the default. Do not mix bases across a refresh.

### `backlog` — a measured absence, plus the nearest thing disclosed

- **Source:** Apple FY2025 Form 10-K,
  <https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm>
- **Read:** search the document for `backlog` — **zero matches**, which is the
  finding. Then the deferred-revenue sentence in the revenue note, and the
  unconditional purchase obligations table in Note 12.
- **To refresh:** find the latest 10-K via
  <https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-K>
  and repeat. If a future filing *does* disclose backlog, set `disclosed: true`
  and add the figure — the signal is written to handle both.

### `patents`

- **Source:** Google Patents, assignee `Apple Inc.`, `country=US`, `type=PATENT`
- **Query shape:**
  `https://patents.google.com/?assignee=Apple+Inc.&after=publication:YYYYMMDD&before=publication:YYYYMMDD&country=US&type=PATENT`
- **Read:** the "About N results" figure. Note the thousands separator is a
  space, not a comma — `About 6 188 results` is 6,188.
- **`settled` is load-bearing.** Patents publish months after grant and the
  index lags further, so a window ending today always undercounts. Only mark a
  window settled once it has been closed for a year, and never compare against
  an unsettled one — 3,788 vs 6,188 would read as a 39% collapse that did not
  happen.
- **Why US-only:** without `country=US` the count includes every family member
  (WO, EP, CN, JP, KR…) and one invention is counted ten times — 30,988 instead
  of 3,788 for the same window.

### `launches`

- **Source:** <https://www.apple.com/newsroom/>
- **Read:** the dated items on the landing page. `kind` is assigned by hand from
  the headline and only `product` is counted by the cadence signal; the rest are
  carried for the timeline.

### `corporateActions`

- **Source:** <https://investor.apple.com/dividend-history/default.aspx>
- **Read:** the declared / record / payable / amount rows. Amounts are not split
  adjusted, as the page states.
- **Not captured:** buyback authorisations. Those are announced in an 8-K and a
  results press release rather than on this page, and the residual gap says so.

### `searchInterest`

- **Source:** <https://trends.google.com/trends/explore?date=today%2012-m&geo=US&q=AAPL>
- **Read:** the *Interest over time* series, 53 weekly points, 0–100.
- **Note:** this is an index relative to the window's own peak week. It is not
  comparable between companies or between two captures, which is why the signal
  reads it as a ratio against its own mean rather than as a level.

### `jobPostings` — the one that could not be captured

- **Attempted:** <https://jobs.apple.com/en-us/search>
- **Finding:** the site reports `600+ Result(s)` and returns that same capped
  figure for every team and location filter, exposes no per-function facet
  counts, and `POST /api/role/search` rejects unauthenticated requests.
- **Recorded as unavailable with that reason**, so nobody spends the afternoon
  on it twice. A capped total that does not move with the filter carries no
  information, and writing it down anyway would look like a measurement.

---

## Rules for extending this

1. **One symbol, one entry.** A symbol with no entry shows the gaps exactly as
   it did before this file existed. Never default, never borrow a sector
   average, never carry a figure across companies.
2. **Every block carries its own `source` with a real URL.** The link must be
   the page the number was read from, not a constructed one.
3. **Record absences as absences.** "The filing does not contain this word" is
   a finding. "We could not find a provider" is a different finding. They are
   not interchangeable.
4. **Mark anything that lags.** The `settled` flag on patent windows exists
   because the obvious comparison is wrong. If you add a series with a
   publication lag, give it the same treatment.
5. **Re-run `node tools/test_alpha.mjs` after editing.** Ten of the fifty
   checks cover this file's shape and the rules above.

---

## 3. Demand Discovery — `web/public/data/demand-capture.json` and `web/tests/fixtures/demand-history.json`

Captured **2026-10-08** through the same connector, for the Demand Discovery pilot.

| What | Endpoint | Depth |
| --- | --- | --- |
| Quarterly statements | `income-statement`, `balance-sheet-statement`, `cash-flow-statement` with `period=quarter&limit=120` | back to 1996 where the company existed |
| Quarterly enterprise values | `enterprise-values?period=quarter&limit=32` | price, diluted shares at each quarter end |
| Daily closes | `historical-price-eod/light`, 2018-06 → 2026-10 and 1997 → 2018-06 | thinned to the last close of each week |
| Copper | `commodities-historical-price-eod-light?symbol=HGUSD` | 2018-06 → 2026-10 |

The connector saves a reply larger than ~50 KB to disk as raw JSON; those files were sorted by symbol and kind and
used as they are. Smaller replies were typed into `SYM.inc.txt` / `SYM.bs.txt` / `SYM.cf.txt` / `SYM.ev.txt`
(pipe-separated, USD millions). Then:

```bash
python tools/capture/build_demand_capture.py <capture-dir>            # the served capture, 2017 onward
python tools/capture/build_demand_capture.py <capture-dir> --history  # the 1996–2018 test fixture
```

**Point-in-time floors applied by the script:** Sandisk's carve-out quarters are treated as public at the
2025-02-24 spin, and its pre-spin placeholder prices are dropped; Vertiv's 2019 rows (filed by the blank-cheque
company) are treated as public at the 2020-02-10 merger, and its pre-merger prices are dropped. In the history
fixture, rows whose filing date is missing or not after the period end get period end + 60 days.

**To refresh:** re-read the same endpoints, rebuild, then run
`DEMAND_PILOT=1 npx vitest run tests/demand-pilot.test.ts` in `web/` to regenerate `demand-backtest.json`.
The evidence register (`demand-evidence.json`) is maintained by hand: each row carries the URL it was read from
and its publication date; add rows rather than editing old ones, so the backtest keeps what was known when.

**2026-10-09 additions.** Thirteen companies were added to the AI chain (ORCL, AMD, MRVL, ANET, STX, FORM, AMAT,
LRCX, KLAC, NVT, MOD, PWR, GEV) through the same endpoints. Enterprise values were not needed: diluted shares come
from the income statement. Statement replies under ~50 KB come back inline; nVent's income statement and GE
Vernova's three statements were typed into `.txt` files, whose income format now takes an optional seventh column
of diluted shares. nVent's 2017 quarters and GE Vernova's 2023 ones are carve-out figures, floored to the spin
dates (2018-04-30, 2024-04-02) like Sandisk's and Vertiv's. The 16 original companies rebuild byte-identical.
GE Vernova's prices were read from the full end-of-day chart (its light chart since the April 2024 listing is
small enough to come back inline) and mapped to the light shape.

The newest earnings call of each revenue-layer company was read for `management-voice.json`; replies the connector
returned inline were recovered verbatim from the session's own log rather than retyped. Regenerate with
`VOICE_CALLS=<dir> VOICE_WRITE=1 npx vitest run tests/management-voice.test.ts` in `web/`.

---

## 3. Peer rows in `AAPL.json` — `extras.peerRatios`, `peerGrowth`, `peerMetrics`

Read through the authenticated market-data connector on **2026-10-09**, one
call per peer per feed (`ratios-ttm`, `key-metrics-ttm`, latest annual
`financial-growth`) for the six listed peers. The trimmed rows are kept in
`tools/capture/peer-rows-2026-10-09.json` and folded in with:

```bash
python tools/capture/fold_peer_rows.py web/public/data/AAPL.json tools/capture/peer-rows-2026-10-09.json
```

Only ratios that compare across currencies are kept (TSM reports in TWD, SONY
in JPY). The capture date is stored as `extras.peersCapturedAt`, and the
Research tab prints it under the peer comparison: the peers are dated
2026-10-09, Apple's own figures are those of the rest of the snapshot. A live
session fetches the same three feeds per peer in `lib/report-load.ts`.

---

## 4. `web/public/data/NVDA.json` — the second bundled snapshot

Read through the market-data connector on **2026-10-10** so NVIDIA's report
renders without a key: quote, profile, TTM ratios and key metrics, financial
scores, 10 annual income / balance / cash-flow statements, 10 years of ratios
and key metrics, 3 years of growth, product and geographic segments, analyst
estimates, price-target consensus, grades consensus, levered DCF, 279 daily
closes and the peer list. The capture files sit in the session scratchpad
and are assembled by:

```bash
python tools/capture/build_nvda_snapshot.py <capture-dir> web/public/data/NVDA.json web/public/data/AAPL.json
```

Two choices to know about. The vendor's peer list also returned a few
sub-US$1b and non-chip names; the snapshot keeps the six listed chip
designers (AMD, Broadcom, Intel, Qualcomm, Arm, Marvell), each with trimmed
ratio, key-metric and growth rows. The market and sector benchmark series are
copied from AAPL's snapshot, since both companies sit in Technology. Feeds a
live session pulls that are not here (dividends, earnings history, insider
and institutional data, news) show their usual "not available" notice.

---

## 3. The Research tab's captures (2026-10-12)

Four more files in `web/public/data/`, each a capture with its date on it. All
connector replies were recovered byte-for-byte from the session log, never retyped.

| File | What | Source | Refresh |
| --- | --- | --- | --- |
| `consensus-ledger.json` | Dated captures of the analyst consensus per fiscal year (revenue, EPS, low/high, analyst counts), target consensus, rating counts; plus `reported` quarters for symbols whose snapshot has no `earnings` feed | AAPL 24 Aug 2026 (git `2f6051b` snapshot), AAPL 9 Oct (bundled snapshot, estimates only), AAPL + NVDA 12 Oct (`analyst-estimates`, `price-target-consensus`, `grades-consensus`), NVDA 10 Oct (bundled snapshot) | `python tools/capture/consensus_ledger.py live AAPL NVDA` with `FMP_API_KEY` set, daily. The history only exists if this runs. |
| `history/<SYMBOL>.json` | Ten years of daily closes, split-adjusted (`historical-price-eod/light`) | Connector, 12 Oct 2026, last close 9 Oct | Re-capture, or a live key replaces it |
| `ownership.json` | 13F top holders and holder summary for the quarter ended 30 Jun 2026; NVDA insider statistics | `filings-extract-with-analytics-by-holder`, `positions-summary`, `insider-trade-statistics`, 12 Oct 2026 | After each 13F deadline (45 days after quarter end) |
| `NVDA.json` (folded) | `gradesHistorical`, `targetSummary` | Connector, 12 Oct 2026, via `fold_alpha_refresh.py` | With the snapshot |

NVIDIA's earnings rows go in the ledger's `reported`, not in its snapshot:
adding an `earnings` feed to the snapshot would rate `peNonGaapTtm` and move the
quant rating the edition on record was graded on.

The guidance and pay records (`web/src/lib/guidance.ts`), debates
(`web/src/lib/debates.ts`) and market-share tables (`web/src/lib/industry.ts`)
are read by hand from primary sources (earnings call transcripts, DEF 14A
proxies, IDC and TrendForce releases); each record names its source.
