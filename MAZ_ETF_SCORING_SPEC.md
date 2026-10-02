# Maz Vantage — ETF Scoring, Full Specification

A fund is **never** given the company score. That score ranks a business's ratios against its own
sector, and a basket has neither. A fund has the facts a buyer compares funds on: what it costs, how
easily it trades, how much it swings, what it pays and how it has moved. Those are ranked **fund
against fund, inside a hand-picked peer group**. **Five grades, no overall total.**

Source of truth: `web/src/lib/etf-grades.ts` (facts, ranking, grades), `web/src/lib/etf-tables.ts`
(the catalogue and the board feeds), `web/src/lib/grading.ts` (the 0–5 scale and letter bands),
`web/src/components/market/etf-board.tsx` (where they are drawn). Related, not a score:
`web/src/lib/fund-xray.ts` (Appendix B).

---

# 1. THE PEER GROUP

**A peer group is one group on the ETF tables board**, for example "US equity sectors", "Gold
miners" or "Treasury bonds". Somebody chose those funds as answers to one question, which makes
them a fairer comparison set than anything a vendor field could produce.

| Catalogue fact | Value |
|---|---|
| Boards | 17: Key market data, Sectors, Themes & subsectors, Market cap, Growth vs. value, Smart beta, Dividends, Strategies, Shariah funds, Global & regional, Emerging markets, Country funds, Bond funds, Commodities, Real estate, Currency funds, Crypto funds |
| Groups | 89 |
| Distinct funds | 425 |
| Groups large enough to grade at all (≥ 5 funds) | 55 |

**Minimum peers: 5.** A grade exists only when at least 5 funds in the group have the figure. A
percentile over three funds is just first, middle and last, and that is not a grade.

Grades are **relative to the group only**. A B in "Gold miners" and a B in "US equity sectors" say
nothing about each other.

---

# 2. THE FIVE GRADES

| Grade | Built from | Better is |
|---|---|---|
| **Expenses** | expense ratio | lower |
| **Liquidity** | assets under management · average daily dollar volume | higher |
| **Risk** | 1-year annualised volatility of daily log returns · 1-year maximum drawdown | lower |
| **Dividends** | trailing-twelve-month distribution yield, **payers only** | higher |
| **Momentum** | 3-month · 6-month · 1-year return | higher |

---

# 3. THE FACTS, ONE FUND

Inputs per fund: the fund record (`etf/info`), its distribution list (`dividends`, up to 60 rows), a
year of daily closes (`historical-price-eod/light`, from today − 370 days), and the board's quote row
(`batch-quote` + `stock-price-change`).

```
price         = quote.price, else fund record nav
avgVolume     = fund record avgVolume, else quote avgVolume
expenseRatio  = fund record expenseRatio            (units as published; ranking is unit-free)
aum           = fund record assetsUnderManagement
dollarVolume  = avgVolume × price

closes        = closes dated within the last 365 days, oldest first
volatility    = stdev( ln(p_t / p_{t−1}) ) × √252   needs ≥ 120 closes, else null
drawdown      = | min over t of ( p_t / max_{s≤t} p_s − 1 ) |

paid          = Σ adjDividend (else dividend) over distributions dated in (today − 365d, today]
yieldTtm      = paid / price            when paid > 0 and price > 0
pays          = paid > 0                (null if the distribution list did not load)

m3, m6, y1    = the 3M, 6M and 1Y windows of `stock-price-change`
```
A missing input stays missing. **Nothing is zeroed.**

---

# 4. RANKING AND GRADING

### 4.1 Percentile inside the group
For one figure across the group's funds, with only the funds that have it:
```
sort worst → best
position of rank k (0-based) among n funds = k / (n − 1)
ties share the average position: for ranks k..j, position = ((k + j) / 2) / (n − 1)
```
Worst = 0, best = 1. Fewer than 2 funds with the figure → no percentiles.

### 4.2 From percentiles to a grade
```
grade (0–5) = mean of the fund's available component percentiles × 5
```
- Liquidity averages the AUM and dollar-volume percentiles; Risk averages volatility and drawdown;
  Momentum averages 3M, 6M and 1Y.
- A fund missing one component is graded on the ones it has.
- **Peers for a grade** = funds in the group with at least one of that grade's components. Below
  5, every fund in the group gets "Only *n* funds in this group have this figure; a grade needs 5."
- **Dividends:** a non-payer is not ranked. Its yield is excluded from the ranking, and it shows
  "Not graded: it paid no distribution in the last twelve months." Ranked among payers it would
  come last, which tells the reader nothing new. The dividend module uses the same payers-only
  rule.

### 4.3 Letters (the report's shared bands, display only)
| Letter | Grade ≥ |
|:--:|:--:|
| A | 4.50 |
| A− | 3.90 |
| B+ | 3.00 |
| B | 2.60 |
| B− | 2.25 |
| C+ | 2.00 |
| C | 1.80 |
| C− | 1.65 |
| D | 0.90 |
| F | below 0.90 |

---

# 5. WORKED EXAMPLE (checked against the code)

Five funds in one group:

| Fund | Expense | AUM | $ volume/day | Vol. | Max DD | TTM yield | 3M | 6M | 1Y |
|---|---|---|---|---|---|---|---|---|---|
| AAA | 0.09% | $50bn | $900m | 18% | 12% | 1.3% | 4.0 | 9.0 | 21 |
| BBB | 0.03% | $120bn | $2.1bn | 17% | 11% | 1.2% | 4.2 | 9.4 | 22 |
| CCC | 0.20% | $3bn | $40m | 24% | 19% | pays nothing | 6.0 | 14 | 30 |
| DDD | 0.35% | $0.8bn | $9m | 29% | 25% | 0.4% | −1.0 | 2.0 | 8 |
| EEE | 0.09% | $8bn | $150m | 20% | 14% | 2.1% | 2.0 | 5.0 | 15 |

Expense percentiles (lower is better): DDD 0, CCC 0.25, AAA and EEE tied at (2 + 3) / 2 / 4 =
0.625, BBB 1.

| Fund | Expenses | Liquidity | Risk | Dividends | Momentum |
|---|---|---|---|---|---|
| AAA | 3.13 B+ | 3.75 B+ | 3.75 B+ | — | 2.50 B− |
| BBB | 5.00 A | 5.00 A | 5.00 A | — | 3.75 B+ |
| CCC | 1.25 D | 1.25 D | 1.25 D | — not a payer | 5.00 A |
| DDD | 0.00 F | 0.00 F | 0.00 F | — | 0.00 F |
| EEE | 3.13 B+ | 2.50 B− | 2.50 B− | — | 1.25 D |

**Note the dividend column.** One non-payer leaves 4 payers, which is below the minimum of 5, so
*nobody* in this group gets a dividend grade. That's intended: four is not a ranking.

---

# 6. WHERE IT RUNS, AND WHAT IT COSTS

- **Surface:** ETF Screener → ETF tables board → **Grades** view. Grading runs when the reader
  clicks, for the open board only.
- **Board load** (before grading): `batch-quote` and `stock-price-change`, each in chunks of 50
  symbols. A 90-fund board costs about 4 requests.
- **Grading:** 3 requests per fund (`etf/info`, `dividends`, a year of daily closes), 4 at a time.
  A 90-fund board costs about 270 requests.
- `etf/info` is the one feed that can be plan-gated. If every fund comes back gated, the board says
  the data is unavailable instead of grading on partial facts.
- **Live only.** No bundled snapshot exists for funds.

---

# 7. REPLICATION CHECKLIST

1. Fix the peer groups (the catalogue in `etf-tables.ts`); never derive them from vendor categories.
2. Collect the facts exactly as in §3; leave anything missing as null.
3. Rank each figure inside each group (§4.1), worst = 0 and best = 1, ties averaged.
4. Average each grade's component percentiles and multiply by 5. Enforce the 5-peer minimum per
   grade, and payers-only for dividends.
5. Map to letters with §4.3.
6. Check against §5.

---

# 8. KNOWN ISSUES AND OPEN DECISIONS

1. **The "Momentum" label says total return, but the data is a price return.** The
   `stock-price-change` windows do not add back distributions; the Beat-the-Market page says this
   about the same feed. Either relabel it "price return" or add trailing distributions to each
   window.
2. **Small groups.** 34 of 89 groups have fewer than 5 funds and can never be graded. One
   non-payer can disable dividend grades for a 5-fund group (§5).
3. **There is no overall ETF score, on purpose.** Five independent grades, like the dividend
   module's four composites with no total.
4. **The expense ratio is used as published.** If the vendor reports some funds in percent and
   others as a fraction, rankings within a group could invert. This has not been seen, but there
   is no check for it.

---

# APPENDIX B — FUND X-RAY (look-through analytics, not a score)

A mix of up to 6 funds (`/etfs/xray?funds=SPY:60,QQQ:40`) read as the one portfolio it really is:
```
exposure(s)   = Σ_f  allocation_f × weight_f(s)            per holding, sector and country
overlap(a, b) = Σ_h  min( weight_a(h), weight_b(h) )        100% = the same fund twice
blended fee   = Σ_f allocation_f × expenseRatio_f ÷ Σ_f allocation_f   over funds with a known expense ratio
```
Data: `etf/holdings`, `etf/sector-weightings`, `etf/country-weightings`, `etf/info`. A fund's lines
are kept as published (cash, futures and swaps included, negative futures lines allowed) and are
never rescaled to 100%. A fund that holds other funds is not looked through a second time.
Each fund's holdings date (`updatedAt`) differs and is shown.
