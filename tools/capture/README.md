# The Alpha Signal captures

Two files in `assets/data/` are hand-captured rather than fetched, and this is
the record of where every figure came from so each can be re-read and re-typed.

Neither is a feed. Both are frozen at their `capturedAt` date, and the UI
prints that date beside anything built from them.

---

## 1. `assets/data/AAPL.json` — the bundled snapshot

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

## 2. `assets/data/alpha-disclosures.json` — read by hand

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
