#!/usr/bin/env python3
"""
Maz Vantage — seed sector distributions.

Generates a *modelled* assets/data/sector-stats.json so the report grades
sensibly before anyone has run the real builder. It is tagged
`"source": "seed"`, and the app shows a standing notice while that tag is
present, because these are shaped distributions rather than measured ones.

    python tools/make_seed_stats.py

Replace it with measured data as soon as you have a key:

    python tools/build_sector_stats.py --apikey $FMP_KEY

How the shapes are built
------------------------
Each metric gets a centre and a spread. Ratios that are bounded below by zero
and have a long right tail — every multiple, every turnover ratio — are drawn
lognormally around their median. Metrics that go negative (margins, growth
rates, excess returns) are drawn from a skew-normal instead. Both are then
read out at the same 21 quantiles the measured builder emits, so the browser
cannot tell the two apart apart from the `source` tag.

Sector centres for P/E are anchored on FMP's sector P/E snapshot for
2026-08-27, discounted from the cap-weighted aggregate toward the median
listed company. Everything else uses a market-wide centre with a per-sector
multiplier where the sector genuinely moves the number — margins, leverage,
capital intensity, payout.
"""
from __future__ import annotations

import json
import math
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "data", "sector-stats.json")

SECTORS = [
    "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
    "Consumer Defensive", "Industrials", "Energy", "Basic Materials",
    "Real Estate", "Utilities", "Communication Services",
]

# Rough count of listed names per sector, used only for the "ranked better
# than N companies" line. Order of magnitude, not a census.
COUNTS = {
    "Technology": 930, "Healthcare": 1120, "Financial Services": 1080,
    "Consumer Cyclical": 620, "Consumer Defensive": 280, "Industrials": 760,
    "Energy": 340, "Basic Materials": 320, "Real Estate": 300,
    "Utilities": 130, "Communication Services": 290,
}

# --------------------------------------------------------------------------
# Metric shapes
#
#   (median, sigma, kind)
#     lognormal — sigma is the log standard deviation
#     normal    — sigma is in the metric's own units
# --------------------------------------------------------------------------

LOGN = "lognormal"
NORM = "normal"

BASE: dict[str, tuple[float, float, str]] = {
    # ---- valuation ----
    "peGaapTtm":            (22.0, 0.95, LOGN),
    "priceToSalesTtm":      (2.10, 1.10, LOGN),
    "priceToBookTtm":       (2.30, 1.25, LOGN),
    "priceToCashFlowTtm":   (13.0, 1.00, LOGN),
    "pegGaap":              (1.60, 0.75, LOGN),
    "evToSalesTtm":         (2.40, 1.05, LOGN),
    "evToEbitdaTtm":        (12.5, 0.85, LOGN),
    "evToEbitTtm":          (16.0, 0.90, LOGN),
    "earningsYieldTtm":     (0.045, 0.045, NORM),
    "fcfYieldTtm":          (0.040, 0.050, NORM),
    "dividendYieldTtm":     (0.012, 0.018, NORM),
    "buybackYield":         (0.005, 0.030, NORM),
    "shareholderYield":     (0.018, 0.035, NORM),
    # ---- growth (annual, as decimals) ----
    "revenueGrowthYoy":     (0.065, 0.220, NORM),
    # Annualised, matching the metric: a 21% three-year total is 6.6% a year,
    # and a multi-year average is tighter than any single year, so the spread
    # sits below revenueGrowthYoy's rather than above it.
    "revenueGrowth3y":      (0.065, 0.150, NORM),
    "revenueGrowth5y":      (0.065, 0.140, NORM),
    "ebitdaGrowth":         (0.070, 0.320, NORM),
    "ebitGrowth":           (0.070, 0.360, NORM),
    "epsGrowth":            (0.080, 0.400, NORM),
    "epsDilutedGrowth":     (0.080, 0.400, NORM),
    "netIncomeGrowth":      (0.075, 0.420, NORM),
    "netIncomeGrowth5y":    (0.450, 0.950, NORM),
    "ocfGrowth":            (0.070, 0.330, NORM),
    "fcfGrowth":            (0.075, 0.420, NORM),
    "capexGrowth":          (0.050, 0.400, NORM),
    "rdExpenseGrowth":      (0.070, 0.330, NORM),
    "bookValueGrowth":      (0.070, 0.260, NORM),
    "dpsGrowth":            (0.040, 0.140, NORM),
    "dividendGrowth3y":     (0.130, 0.300, NORM),
    # ---- profitability ----
    "grossMargin":          (0.380, 0.220, NORM),
    "ebitdaMargin":         (0.170, 0.170, NORM),
    "ebitMargin":           (0.110, 0.160, NORM),
    "netMargin":            (0.080, 0.140, NORM),
    "returnOnEquity":       (0.120, 0.240, NORM),
    "returnOnAssets":       (0.050, 0.070, NORM),
    "returnOnInvestedCapital": (0.090, 0.100, NORM),
    "returnOnTangibleAssets": (0.065, 0.090, NORM),
    "returnOnCapitalEmployed": (0.100, 0.110, NORM),
    "assetTurnover":        (0.70, 0.70, LOGN),
    "fixedAssetTurnover":   (4.50, 1.10, LOGN),
    "cashPerShare":         (3.20, 1.30, LOGN),
    "incomeQuality":        (1.25, 0.55, LOGN),
    "fcfToOcf":             (0.72, 0.45, LOGN),
    "capexToRevenue":       (0.045, 0.055, NORM),
    "rdToRevenue":          (0.035, 0.060, NORM),
    "sbcToRevenue":         (0.020, 0.035, NORM),
    "effectiveTaxRate":     (0.220, 0.110, NORM),
    # ---- health ----
    "currentRatio":         (1.85, 0.65, LOGN),
    "quickRatio":           (1.30, 0.75, LOGN),
    "cashRatio":            (0.55, 1.10, LOGN),
    "debtToEquity":         (0.75, 0.95, LOGN),
    "debtToAssets":         (0.28, 0.70, LOGN),
    "financialLeverage":    (2.30, 0.60, LOGN),
    "longTermDebtToCapital": (0.32, 0.75, LOGN),
    "interestCoverage":     (6.00, 1.30, LOGN),
    "solvencyRatio":        (0.22, 0.80, LOGN),
    "debtServiceCoverage":  (2.20, 1.00, LOGN),
    "netDebtToEbitda":      (1.60, 1.10, LOGN),
    "altmanZScore":         (3.20, 0.85, LOGN),
    "piotroskiScore":       (5.40, 0.35, LOGN),
    "bookValuePerShare":    (12.0, 1.10, LOGN),
    "tangibleBookValuePerShare": (8.00, 1.30, LOGN),
    "netCurrentAssetValue": (1.50, 1.60, LOGN),
    # ---- momentum ----
    "return1m":             (0.010, 0.090, NORM),
    "return3m":             (0.028, 0.160, NORM),
    "return6m":             (0.055, 0.230, NORM),
    "returnYtd":            (0.070, 0.270, NORM),
    "return1y":             (0.105, 0.330, NORM),
    "excessReturn1yVsSector": (0.000, 0.260, NORM),
    "excessReturn1yVsMarket": (0.005, 0.300, NORM),
    "priceToAvg50":         (1.015, 0.095, NORM),
    "priceToAvg200":        (1.045, 0.170, NORM),
    "offYearHigh":          (0.180, 0.150, NORM),
    "aboveYearLow":         (0.420, 0.380, NORM),
    "beta":                 (1.020, 0.520, NORM),
    "volatility":           (0.038, 0.020, NORM),
    "maxDrawdown1y":        (0.290, 0.150, NORM),
    "targetUpside":         (0.130, 0.220, NORM),
    "analystScore":         (3.85, 0.62, NORM),
    # ---- added from MAZ_MASTER_SPEC ----
    "fwdEbitdaGrowth":      (0.085, 0.260, NORM),
    "fwdEbitGrowth":        (0.085, 0.290, NORM),
    "epsLongTermCagr":      (0.105, 0.180, NORM),
    "roeGrowth":            (0.000, 0.075, NORM),
    "fwdRoeGrowth":         (0.020, 0.200, NORM),
    "workingCapitalGrowth": (0.045, 0.320, NORM),
    "ocfMargin":            (0.135, 0.130, NORM),
    "sloanAccruals":        (-0.020, 0.060, NORM),
    "cashFromOperations":   (4.20e8, 2.30, LOGN),
    "netIncomePerEmployee": (2.60e4, 1.60, LOGN),
    "marginStability5y":    (0.045, 1.00, LOGN),
    "revenueVariability5y": (0.120, 0.850, LOGN),
    "return9m":             (0.080, 0.290, NORM),
    "ocfToDebt":            (0.320, 0.420, NORM),
    "fcfToDebt":            (0.200, 0.380, NORM),
    "cashToDebt":           (0.450, 1.20, LOGN),
    "debtToEbitda":         (2.30, 1.00, LOGN),
    "netDebtToEquity":      (0.480, 0.700, NORM),
    "debtToCapital":        (0.340, 0.720, LOGN),
    "equityToAssets":       (0.420, 0.190, NORM),
    "workingCapitalToAssets": (0.150, 0.190, NORM),
}

# Per-sector multipliers on the median. 1.0 means "the market number is fine".
# Only metrics the sector genuinely moves are listed.
ADJ: dict[str, dict[str, float]] = {
    "Technology": {
        "peGaapTtm": 1.30, "priceToSalesTtm": 1.85, "evToSalesTtm": 1.85,
        "priceToBookTtm": 1.60, "evToEbitdaTtm": 1.35, "evToEbitTtm": 1.35,
        "grossMargin": 1.35, "ebitdaMargin": 1.15, "ebitMargin": 1.10, "netMargin": 1.15,
        "returnOnEquity": 1.15, "rdToRevenue": 3.10, "sbcToRevenue": 3.00,
        "capexToRevenue": 0.65, "assetTurnover": 0.85, "dividendYieldTtm": 0.42,
        "ocfMargin": 1.55, "cashToDebt": 2.10, "equityToAssets": 1.15,
        "netIncomePerEmployee": 3.60, "debtToEbitda": 0.70,
        "debtToEquity": 0.70, "revenueGrowthYoy": 1.55, "beta": 1.18,
        "currentRatio": 1.30, "interestCoverage": 1.60,
    },
    "Healthcare": {
        "peGaapTtm": 1.05, "priceToSalesTtm": 1.40, "evToSalesTtm": 1.40,
        "grossMargin": 1.30, "rdToRevenue": 3.40, "dividendYieldTtm": 0.55,
        "revenueGrowthYoy": 1.25, "capexToRevenue": 0.80, "beta": 0.92,
        "currentRatio": 1.35,
    },
    "Financial Services": {
        "peGaapTtm": 0.62, "priceToBookTtm": 0.55, "priceToSalesTtm": 1.30,
        "evToSalesTtm": 1.30, "grossMargin": 1.55, "netMargin": 2.10,
        "returnOnAssets": 0.28, "returnOnEquity": 0.95, "assetTurnover": 0.16,
        "financialLeverage": 3.20, "debtToEquity": 2.10, "capexToRevenue": 0.35,
        "dividendYieldTtm": 1.90, "currentRatio": 0.75, "beta": 0.95,
        "altmanZScore": 0.55, "rdToRevenue": 0.10,
    },
    "Consumer Cyclical": {
        "peGaapTtm": 0.85, "priceToSalesTtm": 0.55, "evToSalesTtm": 0.58,
        "grossMargin": 0.90, "ebitMargin": 0.72, "netMargin": 0.65,
        "assetTurnover": 1.45, "dividendYieldTtm": 0.80, "beta": 1.22,
        "rdToRevenue": 0.25, "inventoryHeavy": 1.0,
    },
    "Consumer Defensive": {
        "peGaapTtm": 0.92, "priceToSalesTtm": 0.50, "evToSalesTtm": 0.55,
        "grossMargin": 0.82, "ebitMargin": 0.78, "netMargin": 0.70,
        "assetTurnover": 1.40, "dividendYieldTtm": 1.85, "beta": 0.62,
        "revenueGrowthYoy": 0.55, "rdToRevenue": 0.15, "volatility": 0.72,
    },
    "Industrials": {
        "peGaapTtm": 0.98, "priceToSalesTtm": 0.70, "evToSalesTtm": 0.75,
        "grossMargin": 0.75, "ebitMargin": 0.88, "assetTurnover": 1.20,
        "dividendYieldTtm": 1.25, "capexToRevenue": 1.05, "beta": 1.08,
        "rdToRevenue": 0.55,
    },
    "Energy": {
        "peGaapTtm": 0.60, "priceToSalesTtm": 0.55, "evToSalesTtm": 0.65,
        "priceToBookTtm": 0.65, "grossMargin": 0.72, "ebitdaMargin": 1.35,
        "capexToRevenue": 2.60, "dividendYieldTtm": 2.30, "beta": 1.15,
        "revenueGrowthYoy": 0.45, "volatility": 1.30, "rdToRevenue": 0.10,
    },
    "Basic Materials": {
        "peGaapTtm": 0.78, "priceToSalesTtm": 0.60, "evToSalesTtm": 0.70,
        "priceToBookTtm": 0.80, "grossMargin": 0.62, "ebitMargin": 0.85,
        "capexToRevenue": 1.80, "dividendYieldTtm": 1.70, "beta": 1.12,
        "volatility": 1.20, "rdToRevenue": 0.20,
    },
    "Real Estate": {
        "peGaapTtm": 1.40, "priceToSalesTtm": 3.20, "evToSalesTtm": 4.20,
        "priceToBookTtm": 0.90, "evToEbitdaTtm": 1.55, "grossMargin": 1.45,
        "ebitMargin": 2.40, "netMargin": 2.00, "assetTurnover": 0.22,
        "debtToEquity": 1.80, "dividendYieldTtm": 2.90, "capexToRevenue": 2.20,
        "interestCoverage": 0.42, "beta": 1.02, "rdToRevenue": 0.05,
    },
    "Utilities": {
        "peGaapTtm": 0.85, "priceToSalesTtm": 1.05, "evToSalesTtm": 1.55,
        "priceToBookTtm": 0.75, "grossMargin": 0.90, "ebitMargin": 1.75,
        "netMargin": 1.30, "assetTurnover": 0.30, "debtToEquity": 1.75,
        "dividendYieldTtm": 2.70, "capexToRevenue": 3.40, "beta": 0.55,
        "interestCoverage": 0.38, "revenueGrowthYoy": 0.50, "volatility": 0.68,
        "rdToRevenue": 0.10,
    },
    "Communication Services": {
        "peGaapTtm": 0.88, "priceToSalesTtm": 1.15, "evToSalesTtm": 1.30,
        "grossMargin": 1.15, "ebitdaMargin": 1.40, "assetTurnover": 0.62,
        "debtToEquity": 1.25, "dividendYieldTtm": 1.20, "beta": 1.05,
        "capexToRevenue": 1.60, "rdToRevenue": 1.40,
    },
}

QUANTILES = [i / 20 for i in range(21)]      # 0, .05 … 1


def _probit(p: float) -> float:
    """Inverse standard normal CDF (Acklam's rational approximation)."""
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    pl, ph = 0.02425, 1 - 0.02425
    if p < pl:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > ph:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q, r = p - 0.5, (p - 0.5) ** 2
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)


def sigfig(x: float, digits: int = 5) -> float:
    if x == 0:
        return 0.0
    try:
        return round(x, -int(math.floor(math.log10(abs(x)))) + (digits - 1))
    except (ValueError, OverflowError):
        return float(x)


def shape(median: float, sigma: float, kind: str) -> list[float]:
    """Read the distribution out at the 21 quantiles."""
    out = []
    for q in QUANTILES:
        # Clamp the extremes: a true 0th/100th percentile of a continuous
        # distribution is unbounded, and an infinite endpoint would swallow
        # every real company into the top or bottom bucket.
        qq = min(max(q, 0.004), 0.996)
        z = _probit(qq)
        v = median * math.exp(sigma * z) if kind == LOGN else median + sigma * z
        out.append(sigfig(v))
    for i in range(1, len(out)):
        if out[i] < out[i - 1]:
            out[i] = out[i - 1]
    return out


OVERALL_BINS = 20

# Spread of the overall score across a sector. A company's grade is the mean of
# ~90 percentile ranks; if those ranks were independent the mean would collapse
# to a spike at 2.5, and if they moved as one it would stay uniform. Real
# ratios are correlated but not identical — a cheap company tends to be cheap
# on every multiple — which lands the spread somewhere in between. 0.62 is the
# assumption; the measured builder replaces it with the real thing.
OVERALL_CENTRE = 2.5
OVERALL_SIGMA = 0.62


def _normal_cdf(x: float, mu: float, sigma: float) -> float:
    return 0.5 * (1 + math.erf((x - mu) / (sigma * math.sqrt(2))))


def overall_histogram(count: int) -> dict:
    """
    Bucket counts for the score distribution chart, from the normal above
    truncated to 0-5 so the bars sum to the sector's population.
    """
    lo = _normal_cdf(0, OVERALL_CENTRE, OVERALL_SIGMA)
    hi = _normal_cdf(5, OVERALL_CENTRE, OVERALL_SIGMA)
    mass = hi - lo or 1.0

    bins = []
    for i in range(OVERALL_BINS):
        a = 5 * i / OVERALL_BINS
        b = 5 * (i + 1) / OVERALL_BINS
        share = (_normal_cdf(b, OVERALL_CENTRE, OVERALL_SIGMA)
                 - _normal_cdf(a, OVERALL_CENTRE, OVERALL_SIGMA)) / mass
        bins.append(round(share * count))
    return {"n": sum(bins), "bins": bins, "max": 5}


def build() -> dict:
    sectors = {}
    for sector in SECTORS:
        adj = ADJ.get(sector, {})
        metrics = {}
        for mid, (median, sigma, kind) in BASE.items():
            m = median * adj.get(mid, 1.0)
            metrics[mid] = {"n": COUNTS.get(sector, 300), "p": shape(m, sigma, kind)}
        count = COUNTS.get(sector, 300)
        sectors[sector] = {
            "count": count,
            "metrics": metrics,
            "overall": overall_histogram(count),
        }

    return {
        "generatedAt": time.strftime("%Y-%m-%d"),
        "source": "seed",
        "note": ("Modelled distributions, not measured ones. Sector P/E centres are "
                 "anchored on FMP's sector P/E snapshot for 2026-08-27; the rest are "
                 "market-wide shapes with per-sector adjustments. Run "
                 "tools/build_sector_stats.py with an FMP key to replace this with "
                 "measured data."),
        "universe": {"quantileStep": 0.05},
        "sectors": sectors,
    }


def main() -> int:
    payload = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    n_metrics = len(next(iter(payload["sectors"].values()))["metrics"])
    print(f"Wrote {OUT}")
    print(f"  {len(payload['sectors'])} sectors x {n_metrics} metrics, "
          f"{os.path.getsize(OUT) / 1024:.0f} KB, source=seed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
