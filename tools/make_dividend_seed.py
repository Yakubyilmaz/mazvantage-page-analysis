#!/usr/bin/env python3
"""
Vanlior — seed dividend-payer distributions.

Generates a *modelled* assets/data/dividend-stats.json so the dividend module
ranks sensibly before anyone has run a measured builder over a real universe.
It is tagged `"source": "seed"`, and the panel shows a standing notice while
that tag is present, because these are shaped distributions rather than
measured ones.

    python tools/make_dividend_seed.py

What makes this table different from sector-stats.json
------------------------------------------------------
**It is payers only.** MAZ_DIVIDEND_SPEC_FULL.md's universe rule: a non-payer
is excluded from the dividend universe, not given a low score. A yield
distribution that included every non-payer's zero would put a 2% yielder in the
top decile of Technology, which is exactly the misreading the rule exists to
prevent. Every centre below is therefore the centre *among payers in that
sector*, and the payer counts are a fraction of the sector's listings.

How the shapes are built
------------------------
The same machinery as make_seed_stats.py: a centre and a spread per line, read
out at the same 21 quantiles, lognormal for anything bounded below by zero with
a right tail, normal for anything that can go negative. A per-sector multiplier
is applied only where the sector genuinely moves the number — utilities and
real estate pay more and pay out more of what they earn; technology pays less
and grows it faster.

The composite spreads
---------------------
A factor composite is a weighted average of percentiles, so it cannot leave
[0, 1] and it bunches: average a dozen ranks and the extremes cancel. The
re-rank in dividend-score.js needs the spread of those composites across the
sector's payers to put the scale back, and `composites` below is that spread —
normal around 0.5 with sigma 0.17, which is what a dozen correlated ranks
average to. A measured builder should replace it with the real thing.
"""
from __future__ import annotations

import json
import math
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "data", "dividend-stats.json")

SECTORS = [
    "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
    "Consumer Defensive", "Industrials", "Energy", "Basic Materials",
    "Real Estate", "Utilities", "Communication Services",
]

# Payers per sector. Roughly the share of each sector's listed companies that
# pay a regular dividend — high in utilities and real estate, low in
# technology and healthcare, where retained cash is the norm.
PAYERS = {
    "Technology": 180, "Healthcare": 150, "Financial Services": 520,
    "Consumer Cyclical": 230, "Consumer Defensive": 170, "Industrials": 330,
    "Energy": 140, "Basic Materials": 160, "Real Estate": 210,
    "Utilities": 95, "Communication Services": 90,
}

LOGN = "lognormal"
NORM = "normal"

# --------------------------------------------------------------------------
# Line shapes: (median among payers, sigma, kind)
# --------------------------------------------------------------------------

BASE: dict[str, tuple[float, float, str]] = {
    # ---- safety: payout coverage (a ratio, right-tailed, never clamped) ----
    "cashDividendPayoutTtm":   (0.42, 0.80, LOGN),
    "payoutNonGaapTtm":        (0.38, 0.75, LOGN),
    "payoutNonGaapFy1":        (0.36, 0.72, LOGN),
    "cashFlowPayoutTtm":       (0.30, 0.78, LOGN),
    "cashFlowPayoutFy1":       (0.29, 0.75, LOGN),
    "payoutGaapTtm":           (0.44, 0.82, LOGN),
    # ---- safety: coverage inverses ----
    "coverageFy1":             (2.80, 0.72, LOGN),
    "coverageTtm":             (2.30, 0.82, LOGN),
    "fcfToDividends":          (2.40, 0.80, LOGN),
    # ---- safety: leverage ----
    "netDebtToEbitda":         (1.95, 1.60, NORM),
    "debtToCapital":           (0.42, 0.20, NORM),
    "debtToEquity":            (0.85, 0.75, NORM),
    "netDebtToAssets":         (0.16, 0.18, NORM),
    "interestCoverage":        (8.0, 1.05, LOGN),
    # ---- safety: earnings and cash quality ----
    "cashFromOperations":      (9.0e8, 1.80, LOGN),
    "netIncomeMargin":         (0.105, 0.085, NORM),
    "returnOnEquity":          (0.145, 0.105, NORM),
    "cashPerShare":            (4.20, 1.15, LOGN),
    "fixedAssetTurnover":      (3.10, 1.05, LOGN),
    "sustainableGrowth":       (0.085, 0.085, NORM),
    # ---- safety: market and signal ----
    "dividendGrowth1yCagrSafety": (0.055, 0.085, NORM),
    "logPriceSafety":          (3.55, 0.95, NORM),
    "yieldToPayout":           (0.058, 0.035, NORM),

    # ---- growth ----
    "dividendGrowth5y":        (0.061, 0.075, NORM),
    "dividendGrowth3y":        (0.058, 0.080, NORM),
    "dividendGrowth1yTtm":     (0.055, 0.090, NORM),
    "dpsGrowthFwd":            (0.050, 0.085, NORM),
    "dividendGrowth10y":       (0.064, 0.060, NORM),
    "epsDilutedGrowthFwd":     (0.082, 0.110, NORM),
    "fcfPerShareGrowthFwd":    (0.070, 0.190, NORM),
    "ebitdaGrowthFwd":         (0.068, 0.090, NORM),
    "ebitGrowthFwd":           (0.072, 0.100, NORM),
    "revenueGrowthFwd":        (0.052, 0.070, NORM),
    "degreeOperatingLeverage": (1.45, 1.40, NORM),
    "coefficientOfVariation90d": (0.068, 0.038, NORM),
    "logPriceGrowth":          (3.55, 0.95, NORM),

    # ---- yield ----
    "dividendYieldFwd":        (0.0285, 0.0180, NORM),
    "dividendYieldTtm":        (0.0275, 0.0175, NORM),
    "avgYield4y":              (0.0290, 0.0170, NORM),
    "fcfYieldTtm":             (0.0480, 0.0360, NORM),
    "fcfYieldFy1":             (0.0500, 0.0380, NORM),
    "earningsYieldNonGaapTtm": (0.0560, 0.0300, NORM),
    "earningsYieldNonGaapFwd": (0.0600, 0.0310, NORM),
    "yieldOnCost5y":           (0.0460, 0.0360, NORM),
    "yieldOnCost3y":           (0.0370, 0.0270, NORM),
    "yieldOnCost1y":           (0.0310, 0.0210, NORM),
    "operatingEarningsYieldTtm": (0.0680, 0.0340, NORM),
    "operatingEarningsYieldFy1": (0.0710, 0.0350, NORM),

    # ---- consistency (counts and shares, so mostly bounded) ----
    "consecutiveGrowthYears":  (6.0, 1.05, LOGN),
    "uninterruptedYears":      (12.0, 0.80, LOGN),
    "cuts10y":                 (0.9, 1.10, LOGN),
    "dpsGrowthStability5y":    (0.055, 0.045, NORM),
    "longestNoCutStreak":      (9.0, 0.75, LOGN),
    "payoutStability5y":       (0.085, 0.060, NORM),
    "paymentRegularity":       (0.97, 0.06, NORM),
    "increaseFrequency10y":    (0.62, 0.25, NORM),
    "yearsSinceLastCut":       (8.0, 0.90, LOGN),
    "specialReliance5y":       (0.02, 0.055, NORM),
}

# --------------------------------------------------------------------------
# Sector multipliers, applied to the median only. 1.0 everywhere it is absent.
#
# Only lines the sector genuinely moves are listed. A utility's payout ratio is
# structurally 60-80% and its dividend grows slowly; a technology payer yields
# a third of the market and raises fast. The ranking is within sector, so these
# multipliers decide what "normal" means for each one — not who wins.
# --------------------------------------------------------------------------

MULT: dict[str, dict[str, float]] = {
    "Technology": {
        "dividendYieldFwd": 0.45, "dividendYieldTtm": 0.45, "avgYield4y": 0.45,
        "yieldOnCost5y": 0.50, "yieldOnCost3y": 0.48, "yieldOnCost1y": 0.46,
        "cashDividendPayoutTtm": 0.60, "payoutNonGaapTtm": 0.58, "payoutNonGaapFy1": 0.56,
        "cashFlowPayoutTtm": 0.55, "cashFlowPayoutFy1": 0.55, "payoutGaapTtm": 0.60,
        "coverageFy1": 1.80, "coverageTtm": 1.85, "fcfToDividends": 1.90,
        "dividendGrowth5y": 1.70, "dividendGrowth3y": 1.70, "dividendGrowth10y": 1.75,
        "dividendGrowth1yTtm": 1.60, "dpsGrowthFwd": 1.60, "dividendGrowth1yCagrSafety": 1.60,
        "netDebtToEbitda": 0.35, "debtToCapital": 0.75, "netIncomeMargin": 1.60,
        "returnOnEquity": 1.45, "consecutiveGrowthYears": 0.85, "uninterruptedYears": 0.60,
        "logPriceSafety": 1.25, "logPriceGrowth": 1.25, "fixedAssetTurnover": 1.70,
    },
    "Healthcare": {
        "dividendYieldFwd": 0.75, "dividendYieldTtm": 0.75, "avgYield4y": 0.78,
        "netIncomeMargin": 1.25, "dividendGrowth5y": 1.15, "dividendGrowth3y": 1.15,
        "uninterruptedYears": 0.90,
    },
    "Financial Services": {
        "dividendYieldFwd": 1.15, "dividendYieldTtm": 1.15, "avgYield4y": 1.15,
        # Leverage is the business model here, so the usual ratios do not read
        # across; they are still ranked, but against a far higher centre.
        "debtToEquity": 2.40, "debtToCapital": 1.35, "netDebtToEbitda": 1.40,
        "fixedAssetTurnover": 0.35, "netIncomeMargin": 2.10,
        "cashFlowPayoutTtm": 0.85, "interestCoverage": 0.35,
    },
    "Consumer Cyclical": {
        "dividendYieldFwd": 0.80, "dividendYieldTtm": 0.80, "avgYield4y": 0.82,
        "degreeOperatingLeverage": 1.35, "netIncomeMargin": 0.65,
    },
    "Consumer Defensive": {
        "dividendYieldFwd": 1.05, "dividendYieldTtm": 1.05, "avgYield4y": 1.05,
        "cashDividendPayoutTtm": 1.25, "payoutNonGaapTtm": 1.30, "payoutGaapTtm": 1.30,
        "netIncomeMargin": 0.55, "consecutiveGrowthYears": 1.45, "uninterruptedYears": 1.55,
        "longestNoCutStreak": 1.45, "yearsSinceLastCut": 1.40, "increaseFrequency10y": 1.25,
        "dividendGrowth5y": 0.85, "dpsGrowthStability5y": 0.70,
    },
    "Industrials": {
        "dividendYieldFwd": 0.90, "dividendYieldTtm": 0.90, "avgYield4y": 0.92,
        "netIncomeMargin": 0.70, "degreeOperatingLeverage": 1.20,
    },
    "Energy": {
        "dividendYieldFwd": 1.45, "dividendYieldTtm": 1.45, "avgYield4y": 1.40,
        "yieldOnCost5y": 1.50, "yieldOnCost3y": 1.45, "yieldOnCost1y": 1.42,
        # Variable-dividend policies: the record is far less steady, and the
        # consistency lines fire NM often enough that the spec warns about it.
        "cuts10y": 2.20, "consecutiveGrowthYears": 0.55, "yearsSinceLastCut": 0.55,
        "dpsGrowthStability5y": 2.40, "specialReliance5y": 3.00,
        "increaseFrequency10y": 0.70, "degreeOperatingLeverage": 1.60,
        "coefficientOfVariation90d": 1.35, "netIncomeMargin": 0.85,
    },
    "Basic Materials": {
        "dividendYieldFwd": 1.10, "dividendYieldTtm": 1.10, "avgYield4y": 1.10,
        "cuts10y": 1.60, "dpsGrowthStability5y": 1.70, "netIncomeMargin": 0.80,
        "degreeOperatingLeverage": 1.45,
    },
    "Real Estate": {
        # A REIT pays out of funds from operations, so a payout ratio on net
        # income reads far above 100%. The spec is explicit that the standard
        # formulas misread here — the centre reflects that rather than hiding
        # it, and the panel carries the warning.
        "dividendYieldFwd": 1.55, "dividendYieldTtm": 1.55, "avgYield4y": 1.55,
        "yieldOnCost5y": 1.60, "yieldOnCost3y": 1.58, "yieldOnCost1y": 1.56,
        "cashDividendPayoutTtm": 1.95, "payoutNonGaapTtm": 2.30, "payoutNonGaapFy1": 2.25,
        "cashFlowPayoutTtm": 2.10, "cashFlowPayoutFy1": 2.05, "payoutGaapTtm": 2.60,
        "coverageFy1": 0.45, "coverageTtm": 0.40, "fcfToDividends": 0.45,
        "netDebtToEbitda": 2.80, "debtToCapital": 1.20, "debtToEquity": 1.35,
        "netDebtToAssets": 2.30, "interestCoverage": 0.35,
        "netIncomeMargin": 1.80, "returnOnEquity": 0.55, "fixedAssetTurnover": 0.12,
        "dividendGrowth5y": 0.65, "dividendGrowth3y": 0.65,
    },
    "Utilities": {
        "dividendYieldFwd": 1.30, "dividendYieldTtm": 1.30, "avgYield4y": 1.30,
        "yieldOnCost5y": 1.35, "yieldOnCost3y": 1.33, "yieldOnCost1y": 1.32,
        "cashDividendPayoutTtm": 1.75, "payoutNonGaapTtm": 1.70, "payoutNonGaapFy1": 1.68,
        "cashFlowPayoutTtm": 1.35, "cashFlowPayoutFy1": 1.32, "payoutGaapTtm": 1.65,
        "coverageFy1": 0.58, "coverageTtm": 0.58, "fcfToDividends": 0.35,
        "netDebtToEbitda": 2.30, "debtToCapital": 1.25, "netDebtToAssets": 1.90,
        "interestCoverage": 0.42, "fixedAssetTurnover": 0.18,
        "dividendGrowth5y": 0.75, "dividendGrowth3y": 0.75, "dividendGrowth10y": 0.75,
        "consecutiveGrowthYears": 1.55, "uninterruptedYears": 1.70, "longestNoCutStreak": 1.55,
        "yearsSinceLastCut": 1.50, "dpsGrowthStability5y": 0.60, "payoutStability5y": 0.70,
        "coefficientOfVariation90d": 0.70, "netIncomeMargin": 1.05,
        # Levered free cash flow is structurally negative for a utility in a
        # build cycle, so the FCF-based lines centre far lower.
        "fcfYieldTtm": 0.15, "fcfYieldFy1": 0.20,
    },
    "Communication Services": {
        "dividendYieldFwd": 1.05, "dividendYieldTtm": 1.05, "avgYield4y": 1.05,
        "netDebtToEbitda": 1.55, "netIncomeMargin": 1.15, "uninterruptedYears": 0.85,
    },
}

QUANTILES = [i / 20 for i in range(21)]


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


# Lines that cannot go below zero however the shape is drawn: counts, shares
# and streaks. A negative 5th percentile on "years since last cut" would be
# nonsense, and a company below the floor would rank outside the distribution.
NON_NEGATIVE = {
    "consecutiveGrowthYears", "uninterruptedYears", "cuts10y", "longestNoCutStreak",
    "yearsSinceLastCut", "increaseFrequency10y", "paymentRegularity",
    "specialReliance5y", "dpsGrowthStability5y", "payoutStability5y",
    "coefficientOfVariation90d", "cashPerShare", "fixedAssetTurnover",
}
# And the handful with a real ceiling.
CAPPED_AT_ONE = {"paymentRegularity", "increaseFrequency10y", "specialReliance5y"}
INTEGER_LINES = {"consecutiveGrowthYears", "uninterruptedYears", "cuts10y",
                 "longestNoCutStreak", "yearsSinceLastCut"}


def shape(line: str, median: float, sigma: float, kind: str) -> list[float]:
    """Read one line's distribution out at the 21 quantiles."""
    out = []
    for q in QUANTILES:
        # A true 0th/100th percentile of a continuous distribution is
        # unbounded, and an infinite endpoint would swallow every real company
        # into the end bucket.
        qq = min(max(q, 0.004), 0.996)
        z = _probit(qq)
        v = median * math.exp(sigma * z) if kind == LOGN else median + sigma * z
        if line in NON_NEGATIVE:
            v = max(0.0, v)
        if line in CAPPED_AT_ONE:
            v = min(1.0, v)
        out.append(round(v) if line in INTEGER_LINES else sigfig(v))
    for i in range(1, len(out)):
        if out[i] < out[i - 1]:
            out[i] = out[i - 1]
    return out


# A factor composite is a weighted mean of percentiles: bounded [0, 1], and it
# bunches toward the middle because averaging correlated ranks cancels the
# extremes. 0.17 is the assumed spread; a measured builder replaces it.
COMPOSITE_SIGMA = 0.17


def composite_spread() -> list[float]:
    out = []
    for q in QUANTILES:
        qq = min(max(q, 0.004), 0.996)
        v = 0.5 + COMPOSITE_SIGMA * _probit(qq)
        out.append(round(min(1.0, max(0.0, v)), 4))
    for i in range(1, len(out)):
        if out[i] < out[i - 1]:
            out[i] = out[i - 1]
    return out


FACTORS = ["safety", "growth", "yield", "consistency"]


def build() -> dict:
    sectors = {}
    for sector in SECTORS:
        mult = MULT.get(sector, {})
        lines = {}
        for line, (median, sigma, kind) in BASE.items():
            m = median * mult.get(line, 1.0)
            # A normal line's spread scales with its centre; a lognormal's
            # sigma is already in log space and must not be touched.
            s = sigma * (abs(mult.get(line, 1.0)) if kind == NORM else 1.0)
            lines[line] = {"n": PAYERS[sector], "p": shape(line, m, s, kind)}
        spread = composite_spread()
        sectors[sector] = {
            "count": PAYERS[sector],
            "lines": lines,
            "composites": {f: spread for f in FACTORS},
        }
    return {
        "generatedAt": time.strftime("%Y-%m-%d"),
        "source": "seed",
        "note": (
            "Modelled dividend-payer distributions, not measured ones. Payers only: a "
            "non-payer is outside this universe rather than at the bottom of it. Regenerate "
            "with tools/make_dividend_seed.py, or replace with a measured build."
        ),
        "universe": {"quantileStep": 0.05, "payersOnly": True},
        "spec": "MAZ_DIVIDEND_SPEC_FULL.md",
        "sectors": sectors,
    }


def main() -> int:
    payload = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    n_lines = len(BASE)
    print(f"Wrote {OUT}")
    print(f"  {len(SECTORS)} sectors x {n_lines} lines, plus {len(FACTORS)} composite spreads each")
    print(f"  payers modelled: {sum(PAYERS.values()):,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
