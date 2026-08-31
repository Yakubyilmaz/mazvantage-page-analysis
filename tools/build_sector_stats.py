#!/usr/bin/env python3
"""
Maz Vantage — sector distribution builder.

Writes assets/data/sector-stats.json: for every sector, for every ratio the
report grades on, the distribution of that ratio across the sector, stored as
21 percentile breakpoints (p0, p5, p10 … p100).

The browser never computes this. It loads the table and interpolates, which is
why a report costs no extra requests no matter how many ratios it grades.

    python tools/build_sector_stats.py --apikey $FMP_KEY
    python tools/build_sector_stats.py --apikey $FMP_KEY --sample-per-sector 400
    python tools/build_sector_stats.py --apikey $FMP_KEY --sectors Technology Healthcare

Two passes:

  1. **Quotes** — one `full-exchange-quotes` call per exchange returns every
     listed name at once, giving P/E and the whole momentum family (price vs
     the 50- and 200-day averages, position in the 52-week range) for the full
     universe at a cost of three requests.

  2. **Fundamentals** — the margin, return, leverage and growth ratios need a
     per-symbol call, so this pass samples up to `--sample-per-sector` names
     per sector. Sampling is stratified by market cap decile rather than
     "biggest N", because a top-N sample would put the megacaps at the median
     and make every large company look reasonably priced.

Only stdlib, like serve.py — no install step.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Iterable

BASE = "https://financialmodelingprep.com/stable"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "data", "sector-stats.json")

EXCHANGES = ["NASDAQ", "NYSE", "AMEX"]
SECTORS = [
    "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
    "Consumer Defensive", "Industrials", "Energy", "Basic Materials",
    "Real Estate", "Utilities", "Communication Services",
]

QUANTILE_STEP = 5           # percent; 21 breakpoints per metric
MIN_SAMPLE = 20             # below this a distribution is not worth shipping
SIGFIGS = 5


# ==========================================================================
# Metric definitions
#
# `src` names the feed the value comes from, `f` pulls it out of that feed's
# row. A metric whose `f` returns None for a company simply drops out of that
# company's contribution — distributions are built per metric, not per row, so
# a gap in one ratio never costs us the others.
# ==========================================================================

def _div(a, b):
    try:
        if a is None or b is None:
            return None
        a, b = float(a), float(b)
        return a / b if b else None
    except (TypeError, ValueError):
        return None


def _get(row, *keys):
    for k in keys:
        v = row.get(k)
        if v is not None:
            return v
    return None


# metric id -> (feed, extractor)
QUOTE_METRICS: dict[str, Callable[[dict], Any]] = {
    # No P/E here: the batch quote payload carries price and averages but not
    # earnings, so peGaapTtm is collected in the ratios pass instead.
    "priceToAvg50":   lambda q: _div(_get(q, "price"), _get(q, "priceAvg50")),
    "priceToAvg200":  lambda q: _div(_get(q, "price"), _get(q, "priceAvg200")),
    "offYearHigh":    lambda q: (lambda r: None if r is None else 1 - r)(
                          _div(_get(q, "price"), _get(q, "yearHigh"))),
    "aboveYearLow":   lambda q: (lambda r: None if r is None else r - 1)(
                          _div(_get(q, "price"), _get(q, "yearLow"))),
}

RATIO_METRICS: dict[str, Callable[[dict], Any]] = {
    # valuation
    "peGaapTtm":            lambda r: _get(r, "priceToEarningsRatioTTM"),
    "priceToSalesTtm":      lambda r: _get(r, "priceToSalesRatioTTM"),
    "priceToBookTtm":       lambda r: _get(r, "priceToBookRatioTTM"),
    "priceToCashFlowTtm":   lambda r: _get(r, "priceToOperatingCashFlowRatioTTM"),
    "pegGaap":              lambda r: _get(r, "priceToEarningsGrowthRatioTTM"),
    # profitability
    "grossMargin":          lambda r: _get(r, "grossProfitMarginTTM"),
    "ebitdaMargin":         lambda r: _get(r, "ebitdaMarginTTM"),
    "ebitMargin":           lambda r: _get(r, "ebitMarginTTM"),
    "netMargin":            lambda r: _get(r, "netProfitMarginTTM"),
    "assetTurnover":        lambda r: _get(r, "assetTurnoverTTM"),
    "fixedAssetTurnover":   lambda r: _get(r, "fixedAssetTurnoverTTM"),
    "cashPerShare":         lambda r: _get(r, "cashPerShareTTM"),
    "effectiveTaxRate":     lambda r: _get(r, "effectiveTaxRateTTM"),
    "fcfToOcf":             lambda r: _get(r, "freeCashFlowOperatingCashFlowRatioTTM"),
    # health
    "currentRatio":         lambda r: _get(r, "currentRatioTTM"),
    "quickRatio":           lambda r: _get(r, "quickRatioTTM"),
    "cashRatio":            lambda r: _get(r, "cashRatioTTM"),
    "debtToEquity":         lambda r: _get(r, "debtToEquityRatioTTM"),
    "debtToAssets":         lambda r: _get(r, "debtToAssetsRatioTTM"),
    "financialLeverage":    lambda r: _get(r, "financialLeverageRatioTTM"),
    "longTermDebtToCapital": lambda r: _get(r, "longTermDebtToCapitalRatioTTM"),
    "interestCoverage":     lambda r: _get(r, "interestCoverageRatioTTM"),
    "solvencyRatio":        lambda r: _get(r, "solvencyRatioTTM"),
    "debtServiceCoverage":  lambda r: _get(r, "debtServiceCoverageRatioTTM"),
    "bookValuePerShare":    lambda r: _get(r, "bookValuePerShareTTM"),
    "tangibleBookValuePerShare": lambda r: _get(r, "tangibleBookValuePerShareTTM"),
    "dividendYieldTtm":     lambda r: _get(r, "dividendYieldTTM"),
}

METRIC_METRICS: dict[str, Callable[[dict], Any]] = {
    "earningsYieldTtm":     lambda m: _get(m, "earningsYieldTTM"),
    "fcfYieldTtm":          lambda m: _get(m, "freeCashFlowYieldTTM"),
    "evToSalesTtm":         lambda m: _get(m, "evToSalesTTM"),
    "evToEbitdaTtm":        lambda m: _get(m, "evToEBITDATTM"),
    "netDebtToEbitda":      lambda m: _get(m, "netDebtToEBITDATTM"),
    "returnOnEquity":       lambda m: _get(m, "returnOnEquityTTM"),
    "returnOnAssets":       lambda m: _get(m, "returnOnAssetsTTM"),
    "returnOnInvestedCapital": lambda m: _get(m, "returnOnInvestedCapitalTTM"),
    "returnOnTangibleAssets": lambda m: _get(m, "returnOnTangibleAssetsTTM"),
    "returnOnCapitalEmployed": lambda m: _get(m, "returnOnCapitalEmployedTTM"),
    "incomeQuality":        lambda m: _get(m, "incomeQualityTTM"),
    "capexToRevenue":       lambda m: _get(m, "capexToRevenueTTM"),
    "rdToRevenue":          lambda m: _get(m, "researchAndDevelopementToRevenueTTM"),
    "sbcToRevenue":         lambda m: _get(m, "stockBasedCompensationToRevenueTTM"),
    "netCurrentAssetValue": lambda m: _get(m, "netCurrentAssetValueTTM"),
}

SCORE_METRICS: dict[str, Callable[[dict], Any]] = {
    "altmanZScore":  lambda s: _get(s, "altmanZScore"),
    "piotroskiScore": lambda s: _get(s, "piotroskiScore"),
}

# Field names below are the ones `financial-growth` actually returns — the
# casing is inconsistent in the vendor payload (`ebitgrowth`, `epsgrowth` and
# `epsdilutedGrowth` are lowercase where their neighbours are not), so these
# are transcribed from a live response rather than guessed.
GROWTH_METRICS: dict[str, Callable[[dict], Any]] = {
    "revenueGrowthYoy":   lambda g: _get(g, "revenueGrowth"),
    "ebitdaGrowth":       lambda g: _get(g, "ebitdaGrowth"),
    "ebitGrowth":         lambda g: _get(g, "ebitgrowth", "operatingIncomeGrowth"),
    "epsGrowth":          lambda g: _get(g, "epsgrowth"),
    "epsDilutedGrowth":   lambda g: _get(g, "epsdilutedGrowth"),
    "ocfGrowth":          lambda g: _get(g, "operatingCashFlowGrowth"),
    "fcfGrowth":          lambda g: _get(g, "freeCashFlowGrowth"),
    "netIncomeGrowth":    lambda g: _get(g, "netIncomeGrowth"),
    "capexGrowth":        lambda g: _get(g, "growthCapitalExpenditure"),
    "rdExpenseGrowth":    lambda g: _get(g, "rdexpenseGrowth"),
    "bookValueGrowth":    lambda g: _get(g, "bookValueperShareGrowth"),
    "dpsGrowth":          lambda g: _get(g, "dividendsPerShareGrowth"),
    # Cumulative multi-year growth per share, not annualised — named to match.
    "revenueGrowth3y":    lambda g: _get(g, "threeYRevenueGrowthPerShare"),
    "revenueGrowth5y":    lambda g: _get(g, "fiveYRevenueGrowthPerShare"),
    "netIncomeGrowth5y":  lambda g: _get(g, "fiveYNetIncomeGrowthPerShare"),
    "dividendGrowth3y":   lambda g: _get(g, "threeYDividendperShareGrowthPerShare"),
}

PROFILE_METRICS: dict[str, Callable[[dict], Any]] = {
    "beta": lambda p: _get(p, "beta"),
}

# Values outside these bounds are vendor noise or a degenerate denominator
# (a near-zero equity base turning P/B into four figures). Clipping the tails
# stops one bad row from stretching a whole sector's percentile ladder.
BOUNDS: dict[str, tuple[float, float]] = {
    "peGaapTtm": (0, 500), "priceToSalesTtm": (0, 200), "priceToBookTtm": (0, 100),
    "priceToCashFlowTtm": (0, 300), "pegGaap": (-20, 20),
    "evToSalesTtm": (0, 200), "evToEbitdaTtm": (-100, 300),
    "earningsYieldTtm": (-2, 2), "fcfYieldTtm": (-2, 2), "dividendYieldTtm": (0, 0.5),
    "grossMargin": (-2, 1), "ebitdaMargin": (-5, 1), "ebitMargin": (-5, 1), "netMargin": (-5, 1),
    "returnOnEquity": (-5, 5), "returnOnAssets": (-2, 2),
    "returnOnInvestedCapital": (-2, 2), "returnOnTangibleAssets": (-3, 3),
    "returnOnCapitalEmployed": (-2, 2),
    "assetTurnover": (0, 10), "fixedAssetTurnover": (0, 100),
    "currentRatio": (0, 50), "quickRatio": (0, 50), "cashRatio": (0, 50),
    "debtToEquity": (0, 30), "debtToAssets": (0, 3), "financialLeverage": (0, 50),
    "longTermDebtToCapital": (0, 3), "interestCoverage": (-100, 500),
    "solvencyRatio": (-5, 10), "debtServiceCoverage": (-50, 200),
    "netDebtToEbitda": (-30, 50), "altmanZScore": (-20, 60), "piotroskiScore": (0, 9),
    "incomeQuality": (-20, 20), "fcfToOcf": (-10, 10),
    "capexToRevenue": (0, 5), "rdToRevenue": (0, 5), "sbcToRevenue": (0, 2),
    "effectiveTaxRate": (-1, 1.5),
    "priceToAvg50": (0.2, 5), "priceToAvg200": (0.2, 5),
    "offYearHigh": (0, 1), "aboveYearLow": (0, 20), "beta": (-3, 5),
}
# Metrics where a smaller number is the better one. Mirrors `better: 'low'` in
# assets/js/factors.js — the two lists have to agree or the overall histogram
# below would rank companies the opposite way from the report itself.
LOWER_IS_BETTER = {
    "peGaapTtm", "priceToSalesTtm", "priceToBookTtm", "priceToCashFlowTtm", "pegGaap",
    "evToSalesTtm", "evToEbitdaTtm", "evToEbitTtm",
    "capexToRevenue", "sbcToRevenue", "effectiveTaxRate",
    "debtToEquity", "debtToAssets", "financialLeverage", "longTermDebtToCapital",
    "netDebtToEbitda",
    "offYearHigh", "beta", "volatility", "maxDrawdown1y",
}

# The overall-score histogram: 20 buckets of 0.25 across the 0-5 scale.
OVERALL_BINS = 20
MIN_METRICS_FOR_SCORE = 8       # below this a company's average is noise

GROWTH_BOUNDS = (-1.0, 10.0)     # -100% to +1000% a year
for _k in GROWTH_METRICS:
    BOUNDS.setdefault(_k, GROWTH_BOUNDS)


# ==========================================================================
# HTTP
# ==========================================================================

class Client:
    def __init__(self, apikey: str, retries: int = 3, pause: float = 0.0):
        self.apikey = apikey
        self.retries = retries
        self.pause = pause

    def get(self, path: str, **params) -> Any:
        params["apikey"] = self.apikey
        url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
        last = None
        for attempt in range(self.retries):
            try:
                req = urllib.request.Request(url, headers={"Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = json.load(r)
                if isinstance(data, dict) and (data.get("Error Message") or data.get("error")):
                    raise RuntimeError(data.get("Error Message") or data.get("error"))
                if self.pause:
                    time.sleep(self.pause)
                return data
            except urllib.error.HTTPError as e:
                last = f"HTTP {e.code}"
                if e.code in (401, 402, 403):
                    raise RuntimeError(f"{path}: {last} — key rejected or endpoint not on this plan") from e
                time.sleep(1.5 * (attempt + 1))
            except Exception as e:                       # noqa: BLE001 — retry anything transient
                last = str(e)
                time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"{path}: gave up after {self.retries} attempts ({last})")


# ==========================================================================
# Statistics
# ==========================================================================

def sigfig(x: float, digits: int = SIGFIGS) -> float:
    if x == 0 or not isinstance(x, (int, float)):
        return 0.0
    from math import floor, log10
    try:
        return round(x, -int(floor(log10(abs(x)))) + (digits - 1))
    except (ValueError, OverflowError):
        return float(x)


def breakpoints(values: list[float]) -> list[float] | None:
    """21 ascending quantiles at 0, 5 … 100 percent."""
    xs = sorted(v for v in values if isinstance(v, (int, float)) and v == v and abs(v) != float("inf"))
    if len(xs) < MIN_SAMPLE:
        return None
    steps = 100 // QUANTILE_STEP
    out = []
    for i in range(steps + 1):
        pos = (i / steps) * (len(xs) - 1)
        lo, hi = int(pos), min(int(pos) + 1, len(xs) - 1)
        val = xs[lo] if lo == hi else xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)
        out.append(sigfig(val))
    # Interpolation can leave a pair out of order at the last significant digit.
    for i in range(1, len(out)):
        if out[i] < out[i - 1]:
            out[i] = out[i - 1]
    return out


def percentile_of(value: float, breaks: list[float]) -> float | None:
    """Where `value` sits in a breakpoint ladder, 0-1. Mirrors grading.js."""
    n = len(breaks)
    if n < 2:
        return None
    if value < breaks[0]:
        return 0.0
    if value > breaks[-1]:
        return 1.0
    step = 1.0 / (n - 1)
    for i in range(n - 1):
        lo, hi = breaks[i], breaks[i + 1]
        if value < lo or value > hi:
            continue
        if hi == lo:
            j = i
            while j < n - 1 and breaks[j + 1] == lo:
                j += 1
            return (i / (n - 1) + j / (n - 1)) / 2
        return i / (n - 1) + ((value - lo) / (hi - lo)) * step
    return None


def overall_histogram(samples_by_symbol: dict[str, dict[str, float]],
                      metrics: dict[str, dict]) -> dict | None:
    """
    Score every company the same way the report does — percentile per metric,
    oriented so high is good, averaged — then bucket the results.

    This is what the Score Distribution chart plots, so it has to be built the
    same way the single company on screen is graded, or the marker would sit in
    a histogram it does not belong to.
    """
    scores = []
    for values in samples_by_symbol.values():
        grades = []
        for mid, v in values.items():
            dist = metrics.get(mid)
            if not dist:
                continue
            pct = percentile_of(v, dist["p"])
            if pct is None:
                continue
            if mid in LOWER_IS_BETTER:
                pct = 1 - pct
            grades.append(pct * 5)
        if len(grades) >= MIN_METRICS_FOR_SCORE:
            scores.append(sum(grades) / len(grades))

    if len(scores) < MIN_SAMPLE:
        return None

    bins = [0] * OVERALL_BINS
    for sc in scores:
        idx = min(OVERALL_BINS - 1, max(0, int(sc / 5 * OVERALL_BINS)))
        bins[idx] += 1
    return {"n": len(scores), "bins": bins, "max": 5}


def clean(metric: str, value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v != v or abs(v) == float("inf"):
        return None
    lo, hi = BOUNDS.get(metric, (-float("inf"), float("inf")))
    return v if lo <= v <= hi else None


def stratified_sample(rows: list[dict], cap: int, seed: int = 7) -> list[dict]:
    """
    Sample across the market-cap range rather than off the top of it.

    Ten deciles by market cap, an equal quota drawn from each, leftovers
    redistributed. A plain "largest N" sample would place the megacaps at the
    median and quietly flatter every big company the report grades.
    """
    if len(rows) <= cap:
        return rows
    rnd = random.Random(seed)
    ordered = sorted(rows, key=lambda r: r.get("marketCap") or 0)
    deciles = [ordered[i::10] for i in range(10)]
    quota, out = cap // 10, []
    for d in deciles:
        rnd.shuffle(d)
        out.extend(d[:quota])
    if len(out) < cap:
        rest = [r for r in ordered if r not in out]
        rnd.shuffle(rest)
        out.extend(rest[: cap - len(out)])
    return out


# ==========================================================================
# Passes
# ==========================================================================

def sector_map(client: Client, sectors: list[str], min_cap: float) -> dict[str, list[dict]]:
    """symbol -> sector, plus market cap, via the screener (one call per sector)."""
    out: dict[str, list[dict]] = {}
    for s in sectors:
        rows = client.get(
            "company-screener", sector=s, marketCapMoreThan=int(min_cap),
            isActivelyTrading="true", limit=5000,
        ) or []
        rows = [r for r in rows if r.get("symbol") and not r.get("isEtf") and not r.get("isFund")]
        out[s] = rows
        print(f"  {s:24s} {len(rows):5d} companies", flush=True)
    return out


def quote_pass(client: Client, exchanges: list[str]) -> dict[str, dict]:
    """Every listed quote, keyed by symbol. Three requests for the whole market."""
    # FMP has renamed this endpoint across versions; try the spellings in turn
    # rather than hard-failing the whole run over a path.
    candidates = ["batch-exchange-quote", "full-exchange-quotes", "quotes"]
    quotes: dict[str, dict] = {}

    for ex in exchanges:
        rows = None
        for path in candidates:
            try:
                rows = client.get(path, exchange=ex) or []
                if rows:
                    candidates = [path]          # lock in whichever worked
                    break
            except RuntimeError:
                continue
        if not rows:
            print(f"  ! {ex}: no exchange-quote endpoint responded; "
                  f"momentum ratios will fall back to peer grading", file=sys.stderr)
            continue
        for r in rows:
            if r.get("symbol"):
                quotes[r["symbol"]] = r
        print(f"  {ex:8s} {len(rows):5d} quotes", flush=True)
    return quotes


def fundamentals_pass(client: Client, symbols: list[str], workers: int) -> dict[str, dict]:
    """
    Per-symbol ratios / metrics / scores / growth. The slow pass — four calls
    per company, run `workers` at a time.
    """
    feeds = [
        ("ratiosTtm", "ratios-ttm"),
        ("metricsTtm", "key-metrics-ttm"),
        ("scores", "financial-scores"),
        ("growth", "financial-growth"),
    ]
    out: dict[str, dict] = {}
    done = 0

    def one(sym: str) -> tuple[str, dict]:
        bundle: dict[str, Any] = {}
        for name, path in feeds:
            try:
                params = {"symbol": sym}
                if name == "growth":
                    params.update(period="annual", limit=1)
                data = client.get(path, **params)
                if isinstance(data, list):
                    data = data[0] if data else None
                bundle[name] = data or {}
            except RuntimeError:
                bundle[name] = {}
        return sym, bundle

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for sym, bundle in pool.map(one, symbols):
            out[sym] = bundle
            done += 1
            if done % 50 == 0:
                print(f"    {done}/{len(symbols)}", flush=True)
    return out


# ==========================================================================
# Assembly
# ==========================================================================

def collect(sector_rows: dict[str, list[dict]], quotes: dict[str, dict],
            fundamentals: dict[str, dict]) -> dict[str, dict]:
    sectors: dict[str, dict] = {}

    for sector, rows in sector_rows.items():
        samples: dict[str, list[float]] = {}
        # Kept alongside `samples` so the overall histogram can re-score each
        # company once the breakpoints exist. The distributions come first;
        # a company cannot be ranked until there is something to rank it in.
        per_symbol: dict[str, dict[str, float]] = {}

        for row in rows:
            sym = row["symbol"]
            mine = per_symbol.setdefault(sym, {})

            def add(metric: str, value: Any) -> None:
                v = clean(metric, value)
                if v is not None:
                    samples.setdefault(metric, []).append(v)
                    mine[metric] = v

            q = quotes.get(sym)
            if q:
                for mid, fn in QUOTE_METRICS.items():
                    add(mid, fn(q))
            for mid, fn in PROFILE_METRICS.items():
                add(mid, fn(row))

            f = fundamentals.get(sym)
            if not f:
                continue
            for feed, table in (
                ("ratiosTtm", RATIO_METRICS), ("metricsTtm", METRIC_METRICS),
                ("scores", SCORE_METRICS), ("growth", GROWTH_METRICS),
            ):
                src = f.get(feed) or {}
                for mid, fn in table.items():
                    add(mid, fn(src))

        metrics = {}
        for mid, vals in sorted(samples.items()):
            bp = breakpoints(vals)
            if bp:
                metrics[mid] = {"n": len(vals), "p": bp}

        if metrics:
            entry: dict[str, Any] = {"count": len(rows), "metrics": metrics}
            overall = overall_histogram(per_symbol, metrics)
            if overall:
                entry["overall"] = overall
            sectors[sector] = entry
            scored = f", {overall['n']} companies scored" if overall else ""
            print(f"  {sector:24s} {len(metrics):3d} metrics{scored}", flush=True)

    return sectors


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apikey", default=os.environ.get("FMP_KEY", ""), help="FMP API key (or set FMP_KEY)")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--sectors", nargs="*", default=SECTORS)
    ap.add_argument("--exchanges", nargs="*", default=EXCHANGES)
    ap.add_argument("--min-market-cap", type=float, default=50e6)
    ap.add_argument("--sample-per-sector", type=int, default=250,
                    help="companies per sector in the fundamentals pass (0 = quotes only)")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--pause", type=float, default=0.0, help="seconds between requests, if rate-limited")
    args = ap.parse_args()

    if not args.apikey:
        print("No API key. Pass --apikey or set FMP_KEY.", file=sys.stderr)
        return 2

    client = Client(args.apikey, pause=args.pause)
    started = time.time()

    print("Universe")
    rows = sector_map(client, args.sectors, args.min_market_cap)

    print("\nQuotes")
    quotes = quote_pass(client, args.exchanges)

    fundamentals: dict[str, dict] = {}
    if args.sample_per_sector > 0:
        print("\nFundamentals")
        picked: list[str] = []
        for sector, rs in rows.items():
            chosen = stratified_sample(rs, args.sample_per_sector)
            picked.extend(r["symbol"] for r in chosen)
            print(f"  {sector:24s} sampling {len(chosen)}", flush=True)
        print(f"  {len(picked)} companies x 4 feeds", flush=True)
        fundamentals = fundamentals_pass(client, picked, args.workers)

    print("\nDistributions")
    sectors = collect(rows, quotes, fundamentals)
    if not sectors:
        print("Nothing collected — no file written.", file=sys.stderr)
        return 1

    payload = {
        "generatedAt": time.strftime("%Y-%m-%d"),
        "source": "measured",
        "universe": {
            "exchanges": args.exchanges,
            "minMarketCap": args.min_market_cap,
            "samplePerSector": args.sample_per_sector,
            "quantileStep": QUANTILE_STEP / 100,
        },
        "sectors": sectors,
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))

    size = os.path.getsize(args.out) / 1024
    print(f"\nWrote {args.out} — {len(sectors)} sectors, {size:.0f} KB, "
          f"{time.time() - started:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
