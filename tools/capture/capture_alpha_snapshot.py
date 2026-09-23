"""Fold the five Alpha Signal feeds into the bundled AAPL snapshot.

Every row here was returned by Financial Modeling Prep through the same
Ultimate-tier connector the rest of assets/data/AAPL.json was captured with.
Nothing is synthesised: the numbers are Apple's filed figures, the published
analyst grade history, the published price-target summary, and the aggregated
13F for the quarter FMP had current at capture time.

Run from the repository root:  python capture_alpha.py
"""
from __future__ import annotations

import json
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SNAP = os.path.join(ROOT, "assets", "data", "AAPL.json")
CAPTURED = "2026-09-22"


def q_income(date, filing, fy, period, revenue, cost, gross, rnd, sga, opex,
             dep, ebitda, ebit, op, pretax, tax, net, eps, eps_d, shs, shs_d):
    return {
        "date": date, "symbol": "AAPL", "reportedCurrency": "USD", "cik": "0000320193",
        "filingDate": filing, "fiscalYear": fy, "period": period,
        "revenue": revenue, "costOfRevenue": cost, "grossProfit": gross,
        "researchAndDevelopmentExpenses": rnd,
        "sellingGeneralAndAdministrativeExpenses": sga,
        "operatingExpenses": opex, "depreciationAndAmortization": dep,
        "ebitda": ebitda, "ebit": ebit, "operatingIncome": op,
        "incomeBeforeTax": pretax, "incomeTaxExpense": tax, "netIncome": net,
        "eps": eps, "epsDiluted": eps_d,
        "weightedAverageShsOut": shs, "weightedAverageShsOutDil": shs_d,
    }


INCOME_Q = [
    q_income("2026-06-27", "2026-07-31", "2026", "Q3", 109417000000, 54647000000, 54770000000, 11729000000, 7346000000, 19075000000, 3320000000, 39015000000, 35695000000, 35695000000, 36267000000, 6478000000, 29789000000, 2.04, 2.03, 14692515000, 14750302000),
    q_income("2026-03-28", "2026-05-01", "2026", "Q2", 111184000000, 56403000000, 54781000000, 11419000000, 7477000000, 18896000000, 3439000000, 39324000000, 35833000000, 35885000000, 35833000000, 6255000000, 29578000000, 2.02, 2.01, 14710718000, 14768115000),
    q_income("2025-12-27", "2026-01-30", "2026", "Q1", 143756000000, 74525000000, 69231000000, 10887000000, 7492000000, 18379000000, 3214000000, 54216000000, 51002000000, 50852000000, 51002000000, 8905000000, 42097000000, 2.85, 2.84, 14748158000, 14810356000),
    q_income("2025-09-27", "2025-10-31", "2025", "Q4", 102466000000, 54125000000, 48341000000, 8866000000, 7048000000, 15914000000, 3127000000, 35931000000, 32804000000, 32427000000, 32804000000, 5338000000, 27466000000, 1.85, 1.85, 14948500000, 15004697000),
    q_income("2025-06-28", "2025-08-01", "2025", "Q3", 94036000000, 50318000000, 43718000000, 8866000000, 6650000000, 15516000000, 2830000000, 30861000000, 28031000000, 28202000000, 28031000000, 4597000000, 23434000000, 1.57, 1.57, 14902886000, 14948179000),
    q_income("2025-03-29", "2025-05-02", "2025", "Q2", 95359000000, 50492000000, 44867000000, 8550000000, 6728000000, 15278000000, 2661000000, 31971000000, 29310000000, 29589000000, 29310000000, 4530000000, 24780000000, 1.65, 1.65, 14994082000, 15056133000),
    q_income("2024-12-28", "2025-01-31", "2025", "Q1", 124300000000, 66025000000, 58275000000, 8268000000, 7175000000, 15443000000, 3080000000, 45664000000, 42584000000, 42832000000, 42584000000, 6254000000, 36330000000, 2.41, 2.40, 15081724000, 15150865000),
    q_income("2024-09-28", "2024-11-01", "2024", "Q4", 94930000000, 51051000000, 43879000000, 7765000000, 6523000000, 14288000000, 2911000000, 32521000000, 29610000000, 29591000000, 29610000000, 14874000000, 14736000000, 0.97, 0.97, 15171990000, 15242853000),
    q_income("2024-06-29", "2024-08-02", "2024", "Q3", 85777000000, 46099000000, 39678000000, 8006000000, 6320000000, 14326000000, 2850000000, 28344000000, 25494000000, 25352000000, 25494000000, 4046000000, 21448000000, 1.40, 1.40, 15287521000, 15348175000),
    q_income("2024-03-30", "2024-05-03", "2024", "Q2", 90753000000, 48482000000, 42271000000, 7903000000, 6468000000, 14371000000, 2836000000, 30894000000, 28058000000, 27900000000, 28058000000, 4422000000, 23636000000, 1.53, 1.53, 15405856000, 15464709000),
    q_income("2023-12-30", "2024-02-02", "2024", "Q1", 119575000000, 64720000000, 54855000000, 7696000000, 6786000000, 14482000000, 2848000000, 43171000000, 40323000000, 40373000000, 40323000000, 6407000000, 33916000000, 2.19, 2.18, 15509763000, 15576641000),
    q_income("2023-09-30", "2023-11-03", "2023", "Q4", 89498000000, 49071000000, 40427000000, 7307000000, 6151000000, 13458000000, 2653000000, 30653000000, 28000000000, 26969000000, 26998000000, 4042000000, 22956000000, 1.47, 1.46, 15599434000, 15672400000),
]


def q_cash(date, filing, fy, period, net, dep, sbc, wc, ocf, capex, fcf):
    return {
        "date": date, "symbol": "AAPL", "reportedCurrency": "USD", "cik": "0000320193",
        "filingDate": filing, "fiscalYear": fy, "period": period,
        "netIncome": net, "depreciationAndAmortization": dep,
        "stockBasedCompensation": sbc, "changeInWorkingCapital": wc,
        "netCashProvidedByOperatingActivities": ocf,
        "operatingCashFlow": ocf, "capitalExpenditure": capex, "freeCashFlow": fcf,
    }


CASHFLOW_Q = [
    q_cash("2026-06-27", "2026-07-31", "2026", "Q3", 29789000000, 3320000000, 3401000000, -1821000000, 34369000000, -2455000000, 31914000000),
    q_cash("2026-03-28", "2026-05-01", "2026", "Q2", 29578000000, 3439000000, 3528000000, -6654000000, 28702000000, -1971000000, 26731000000),
    q_cash("2025-12-27", "2026-01-30", "2026", "Q1", 42097000000, 3214000000, 3594000000, 5548000000, 53925000000, -2373000000, 51552000000),
    q_cash("2025-09-27", "2025-10-31", "2025", "Q4", 27466000000, 3127000000, 3183000000, -5707000000, 29728000000, -3242000000, 26486000000),
    q_cash("2025-06-28", "2025-08-01", "2025", "Q3", 23434000000, 2830000000, 3168000000, -2034000000, 27867000000, -3462000000, 24405000000),
    q_cash("2025-03-29", "2025-05-02", "2025", "Q2", 24780000000, 2661000000, 3226000000, -6507000000, 23952000000, -3071000000, 20881000000),
    q_cash("2024-12-28", "2025-01-31", "2025", "Q1", 36330000000, 3080000000, 3286000000, -10752000000, 29935000000, -2940000000, 26995000000),
    q_cash("2024-09-28", "2024-11-01", "2024", "Q4", 14736000000, 2911000000, 2858000000, 6608000000, 26811000000, -2908000000, 23903000000),
    q_cash("2024-06-29", "2024-08-02", "2024", "Q3", 21448000000, 2850000000, 2869000000, 1684000000, 28858000000, -2151000000, 26707000000),
    q_cash("2024-03-30", "2024-05-03", "2024", "Q2", 23636000000, 2836000000, 2964000000, -5764000000, 22690000000, -1996000000, 20694000000),
    q_cash("2023-12-30", "2024-02-02", "2024", "Q1", 33916000000, 2848000000, 2997000000, 1123000000, 39895000000, -2392000000, 37503000000),
    q_cash("2023-09-30", "2023-11-03", "2023", "Q4", 22956000000, 2653000000, 2625000000, -6060000000, 21598000000, -2163000000, 19435000000),
]


def grade(date, sb, b, h, s, ss):
    return {
        "symbol": "AAPL", "date": date,
        "analystRatingsStrongBuy": sb, "analystRatingsBuy": b,
        "analystRatingsHold": h, "analystRatingsSell": s,
        "analystRatingsStrongSell": ss,
    }


GRADES_HISTORICAL = [
    grade("2026-09-01", 6, 19, 14, 3, 3), grade("2026-08-01", 6, 22, 14, 3, 2),
    grade("2026-07-01", 6, 23, 17, 2, 2), grade("2026-06-01", 7, 23, 16, 2, 2),
    grade("2026-05-01", 7, 25, 16, 1, 2), grade("2026-04-01", 7, 25, 15, 1, 1),
    grade("2026-03-01", 6, 25, 16, 1, 1), grade("2026-02-01", 6, 25, 16, 1, 2),
    grade("2026-01-01", 6, 24, 17, 1, 3), grade("2025-12-01", 5, 24, 15, 1, 3),
    grade("2025-11-01", 5, 24, 15, 1, 3), grade("2025-10-01", 6, 24, 15, 2, 3),
    grade("2025-09-01", 5, 23, 15, 1, 3), grade("2025-08-01", 5, 23, 15, 1, 1),
    grade("2025-07-01", 6, 23, 18, 2, 1), grade("2025-06-01", 7, 22, 17, 2, 1),
    grade("2025-05-01", 7, 23, 16, 2, 1), grade("2025-04-01", 8, 23, 16, 3, 1),
    grade("2025-03-01", 7, 21, 14, 2, 2), grade("2025-02-01", 8, 21, 14, 2, 2),
    grade("2025-01-01", 8, 24, 13, 2, 2), grade("2024-12-01", 8, 24, 12, 1, 2),
    grade("2024-11-01", 11, 24, 12, 1, 2), grade("2024-10-01", 12, 24, 12, 1, 2),
]

TARGET_SUMMARY = {
    "symbol": "AAPL",
    "lastMonthCount": 3, "lastMonthAvgPriceTarget": 354.67,
    "lastQuarterCount": 17, "lastQuarterAvgPriceTarget": 333.39,
    "lastYearCount": 69, "lastYearAvgPriceTarget": 314.6,
    "allTimeCount": 262, "allTimeAvgPriceTarget": 233.71,
    "publishers": "[\"StreetInsider\",\"Benzinga\",\"Pulse 2.0\",\"MarketWatch\","
                  "\"Investing\",\"Barrons\",\"Investor's Business Daily\"]",
}

HOLDERS_SUMMARY = {
    "symbol": "AAPL", "cik": "0000320193", "date": "2026-03-31",
    "investorsHolding": 6404, "lastInvestorsHolding": 6398, "investorsHoldingChange": 6,
    "numberOf13Fshares": 9405440940, "lastNumberOf13Fshares": 9546810294,
    "numberOf13FsharesChange": -141369354,
    "totalInvested": 2377497433164, "lastTotalInvested": 2590260442529,
    "totalInvestedChange": -212763009365,
    "ownershipPercent": 63.936, "lastOwnershipPercent": 64.7322,
    "ownershipPercentChange": -0.7962,
    "newPositions": 205, "lastNewPositions": 725, "newPositionsChange": -520,
    "increasedPositions": 2618, "lastIncreasedPositions": 2817, "increasedPositionsChange": -199,
    "closedPositions": 213, "lastClosedPositions": 211, "closedPositionsChange": 2,
    "reducedPositions": 3108, "lastReducedPositions": 2979, "reducedPositionsChange": 129,
    "totalCalls": 165833284, "lastTotalCalls": 184870650, "totalCallsChange": -19037366,
    "totalPuts": 134025688, "lastTotalPuts": 155489773, "totalPutsChange": -21464085,
    "putCallRatio": 0.8082, "lastPutCallRatio": 0.8411, "putCallRatioChange": -3.2878,
}

NOTE = (
    "Captured from Financial Modeling Prep on {captured} through the FMP-moi connector "
    "(Ultimate tier), so every feed the report uses is present. Statement, dividend and "
    "ownership rows are trimmed to the fields the app reads. The five Alpha Signal feeds "
    "(incomeQ, cashflowQ, gradesHistorical, targetSummary, holdersSummary) were added on "
    "{captured} so the Alpha Signal tab renders at full category coverage with no API key. "
    "Every figure is Apple's filed or FMP-published data as of that date — none of it is "
    "synthesised — but it is a point-in-time capture, not a live read, and any date-relative "
    "reading on the page (freshness, days-until-earnings) is measured against today rather "
    "than against the capture date."
).format(captured=CAPTURED)


def main() -> int:
    with open(SNAP, encoding="utf-8") as fh:
        snap = json.load(fh)

    snap["feeds"]["incomeQ"] = INCOME_Q
    snap["feeds"]["cashflowQ"] = CASHFLOW_Q
    snap["feeds"]["gradesHistorical"] = GRADES_HISTORICAL
    snap["feeds"]["targetSummary"] = TARGET_SUMMARY
    snap["feeds"]["holdersSummary"] = HOLDERS_SUMMARY

    snap["capturedAt"] = CAPTURED
    snap["note"] = NOTE

    extras = snap.setdefault("extras", {})
    bench = extras.setdefault("benchmarks", {})
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "spy.json"), encoding="utf-8") as fh:
        bench["market"] = json.load(fh)
    bench["note"] = (
        "Sector benchmark: XLK (Technology Select Sector SPDR). Market benchmark: SPY. "
        "Both bundled with this snapshot, so relative-strength and sector-context readings "
        "work with no API key."
    )

    with open(SNAP, "w", encoding="utf-8", newline="") as fh:
        json.dump(snap, fh, indent=1)

    print("incomeQ           %3d quarters" % len(INCOME_Q))
    print("cashflowQ         %3d quarters" % len(CASHFLOW_Q))
    print("gradesHistorical  %3d months" % len(GRADES_HISTORICAL))
    print("targetSummary       1 row")
    print("holdersSummary      1 row (quarter ended %s)" % HOLDERS_SUMMARY["date"])
    print("benchmarks.market %3d closes" % len(bench["market"]))
    print("snapshot feeds now: %d" % len(snap["feeds"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
