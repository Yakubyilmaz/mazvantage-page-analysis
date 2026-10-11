"""Build web/public/data/demand-capture.json for the Demand Discovery pilot.

The pilot's companies were read through an authenticated market-data connector
on 2026-10-08 (quarterly income, balance sheet, cash flow, quarterly enterprise
values, and daily closes). Large replies were saved by the connector as raw
JSON; short ones were typed into pipe-separated files. This script folds both
into one compact file the engine and its tests read.

    python tools/capture/build_demand_capture.py <capture-dir>
    python tools/capture/build_demand_capture.py <capture-dir> --history

The second form writes web/tests/fixtures/demand-history.json instead: the
quarters before mid-2018 and weekly closes from 1998 to mid-2018 for the
companies with that much history, for the out-of-sample backtest. It is a
test fixture, not served. Where an old row's filing date is missing or not
after the period end, the quarter is treated as filed 60 days after it
closed — later than the 10-Q deadline, so the test can only be late, never
early — and the count of such rows is printed.

<capture-dir> holds, per symbol, any of:

    SYM.inc.json | SYM.inc.txt   date|filed|revenue|grossProfit|operatingIncome|netIncome[|dilutedShares]
                                 (the JSON gives diluted weighted shares; the typed file may)
    SYM.bs.json  | SYM.bs.txt    date|inventory|contractLiabilities|cash|debt
    SYM.cf.json  | SYM.cf.txt    date|operatingCashFlow|capex
    SYM.ev.txt                   date|price|shares (millions)
    SYM.px.json                  daily closes (the light end-of-day chart)

Money is stored in USD millions, rounded to 0.1. Prices are per share.
Daily closes are thinned to the last close of each week: enough to enter a
backtest within a week of a filing, at a fifth of the size.

Nothing is invented. A field the source leaves out stays null, and the
engine drops a measurement whose inputs are null rather than scoring it zero.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "data" / "demand-capture.json"
HISTORY_OUT = ROOT / "web" / "tests" / "fixtures" / "demand-history.json"
HISTORY_SYMBOLS = ["MU", "NVDA", "FCX", "ALB", "TER", "ROK", "SCCO", "ETN"]
HISTORY_END = "2018-06-30"

FIRST_PERIOD = "2017-01-01"
FIRST_PRICE = "2018-06-01"

NAMES = {
    "MSFT": "Microsoft", "GOOGL": "Alphabet", "AMZN": "Amazon", "META": "Meta Platforms",
    "NVDA": "NVIDIA", "AVGO": "Broadcom", "MU": "Micron Technology", "SNDK": "Sandisk",
    "VRT": "Vertiv Holdings", "ETN": "Eaton", "FCX": "Freeport-McMoRan", "SCCO": "Southern Copper",
    "TER": "Teradyne", "ROK": "Rockwell Automation", "ALB": "Albemarle", "ENPH": "Enphase Energy",
    # Added 2026-10-09: more companies in each layer of the AI compute chain.
    "ORCL": "Oracle", "AMD": "Advanced Micro Devices", "MRVL": "Marvell Technology", "ANET": "Arista Networks",
    "STX": "Seagate Technology", "FORM": "FormFactor", "AMAT": "Applied Materials", "LRCX": "Lam Research",
    "KLAC": "KLA", "NVT": "nVent Electric", "MOD": "Modine Manufacturing", "PWR": "Quanta Services",
    "GEV": "GE Vernova",
}

# Prices before these dates belong to something else: Vertiv traded as a
# blank-cheque company until the merger closed, and Sandisk's pre-spin rows
# carry a placeholder price.
PRICE_FLOOR = {"VRT": "2020-02-10", "SNDK": "2025-02-24", "NVT": "2018-04-30", "GEV": "2024-04-02"}

# Quarters whose "filed" date is not a filing. Sandisk's carve-out quarters
# were first published in its Form 10, so the earliest a reader could have
# seen them is the spin date. Vertiv's 2019 rows were filed by the blank-cheque
# company, not by Vertiv; its own figures appeared with the merger in 2020.
# nVent's 2017 quarters and GE Vernova's 2023 ones are carve-out figures first
# published in their spin-off filings, so they are public at the spin.
FILED_FLOOR = {"SNDK": "2025-02-24", "VRT": "2020-02-10", "NVT": "2018-04-30", "GEV": "2024-04-02"}

COLS = ["date", "filed", "rev", "gp", "oi", "ni", "inv", "cl", "cash", "debt", "ocf", "capex", "sh"]


def m(v):
    """USD -> USD millions, one decimal; None stays None."""
    if v is None:
        return None
    return round(float(v) / 1e6, 1)


def num(s: str):
    s = s.strip()
    return None if s == "" else float(s)


def read_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def read_pipe(p: Path):
    rows = []
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(line.strip().split("|"))
    return rows


def load_symbol(d: Path, sym: str, first: str = FIRST_PERIOD, last: str = "9999", lag_fix: list | None = None):
    q: dict[str, dict] = {}

    def row(date):
        return q.setdefault(date, {"date": date})

    inc_j, inc_t = d / f"{sym}.inc.json", d / f"{sym}.inc.txt"
    if inc_j.exists():
        for r in read_json(inc_j):
            x = row(r["date"])
            x.update(filed=r.get("filingDate"), rev=m(r.get("revenue")), gp=m(r.get("grossProfit")),
                     oi=m(r.get("operatingIncome")), ni=m(r.get("netIncome")),
                     sh=m(r.get("weightedAverageShsOutDil")))
    elif inc_t.exists():
        for date, filed, rev, gp, oi, ni, *rest in read_pipe(inc_t):
            row(date).update(filed=filed, rev=num(rev), gp=num(gp), oi=num(oi), ni=num(ni))
            if rest and rest[0].strip():
                row(date)["sh"] = num(rest[0])

    bs_j, bs_t = d / f"{sym}.bs.json", d / f"{sym}.bs.txt"
    if bs_j.exists():
        for r in read_json(bs_j):
            if r["date"] not in q:
                continue
            cl = (r.get("deferredRevenue") or 0) + (r.get("deferredRevenueNonCurrent") or 0)
            q[r["date"]].update(inv=m(r.get("inventory")), cl=m(cl), cash=m(r.get("cashAndShortTermInvestments")),
                                debt=m(r.get("totalDebt")))
    elif bs_t.exists():
        for date, inv, cl, cash, debt in read_pipe(bs_t):
            if date in q:
                q[date].update(inv=num(inv), cl=num(cl), cash=num(cash), debt=num(debt))

    cf_j, cf_t = d / f"{sym}.cf.json", d / f"{sym}.cf.txt"
    if cf_j.exists():
        for r in read_json(cf_j):
            if r["date"] not in q:
                continue
            capex = r.get("capitalExpenditure")
            q[r["date"]].update(ocf=m(r.get("operatingCashFlow")), capex=None if capex is None else abs(m(capex)))
    elif cf_t.exists():
        for date, ocf, capex in read_pipe(cf_t):
            if date in q:
                q[date].update(ocf=num(ocf), capex=abs(num(capex)))

    # Diluted share counts for the quarters the income file did not carry
    # them (the typed ones): the quarter-end count from the enterprise values.
    ev_t = d / f"{sym}.ev.txt"
    if ev_t.exists():
        for date, _price, shares in read_pipe(ev_t):
            if date in q and q[date].get("sh") is None:
                q[date]["sh"] = float(shares)

    floor = FILED_FLOOR.get(sym)
    out = []
    for date in sorted(q):
        x = q[date]
        if date < first or date > last or x.get("rev") in (None, 0):
            continue
        filed = x.get("filed") or date
        if lag_fix is not None and filed <= date:
            filed = (dt.date.fromisoformat(date) + dt.timedelta(days=60)).isoformat()
            lag_fix.append(f"{sym} {date}")
        if floor and filed < floor:
            filed = floor
        out.append([date, filed] + [x.get(c) for c in COLS[2:]])
    return out


def weekly(px_rows, floor: str):
    """Last close of each ISO week, oldest first."""
    by_week: dict[tuple, tuple] = {}
    for r in px_rows:
        date = r["date"]
        if date < floor:
            continue
        y, w, _ = dt.date.fromisoformat(date).isocalendar()
        prev = by_week.get((y, w))
        if prev is None or date > prev[0]:
            by_week[(y, w)] = (date, round(float(r["price"]), 4))
    return [list(v) for _, v in sorted(by_week.items())]


def ev_prices(p: Path, floor: str):
    rows = []
    for date, price, shares in read_pipe(p):
        if date >= floor:
            rows.append([date, float(price), float(shares)])
    return sorted(rows)


def history(d: Path):
    companies = {}
    fixes: list = []
    for sym in HISTORY_SYMBOLS:
        quarters = load_symbol(d, sym, first="1996-01-01", last=HISTORY_END, lag_fix=fixes)
        px = d / f"{sym}.pxh.json"
        if not quarters or not px.exists():
            print(f"! {sym}: missing history")
            continue
        companies[sym] = {"name": NAMES[sym], "quarters": quarters, "prices": weekly(read_json(px), "1998-01-01")}
        print(f"{sym}: {len(quarters)} quarters {quarters[0][0]} -> {quarters[-1][0]}, {len(companies[sym]['prices'])} prices")
    spy = d / "SPY.pxh.json"
    doc = {
        "capturedAt": "2026-10-08",
        "about": "Out-of-sample history for the Demand Discovery backtest: quarters to mid-2018 and weekly closes 1998 to mid-2018. "
                 f"{len(fixes)} quarters had no usable filing date and are treated as filed 60 days after the period end.",
        "units": "USD millions for money; USD per share for prices; shares in millions",
        "cols": COLS,
        "companies": companies,
        "benchmarks": {"SPY": {"name": "S&P 500 ETF", "prices": weekly(read_json(spy), "1998-01-01")}},
        "lagFixed": fixes,
    }
    HISTORY_OUT.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_OUT.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"{len(fixes)} rows given a 60-day filing lag")
    print(f"wrote {HISTORY_OUT.relative_to(ROOT)} ({HISTORY_OUT.stat().st_size // 1024} KB)")


def main():
    if len(sys.argv) == 3 and sys.argv[2] == "--history":
        history(Path(sys.argv[1]))
        return
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    d = Path(sys.argv[1])
    companies = {}
    for sym in NAMES:
        quarters = load_symbol(d, sym)
        if not quarters:
            print(f"! {sym}: no statements found")
            continue
        floor = max(PRICE_FLOOR.get(sym, FIRST_PRICE), FIRST_PRICE)
        px = d / f"{sym}.px.json"
        ev = d / f"{sym}.ev.txt"
        entry = {"name": NAMES[sym], "quarters": quarters}
        if px.exists():
            entry["prices"] = weekly(read_json(px), floor)
        elif ev.exists():
            entry["prices"] = [[r[0], r[1]] for r in ev_prices(ev, floor)]
            entry["pricesNote"] = "Quarter-end closes only; no daily series was captured."
        if ev.exists():
            last = ev_prices(ev, floor)
            if last:
                entry["shares"] = last[-1][2]
                entry["sharesDate"] = last[-1][0]
        companies[sym] = entry
        print(f"{sym}: {len(quarters)} quarters {quarters[0][0]} -> {quarters[-1][0]}, "
              f"{len(entry.get('prices', []))} prices")

    benchmarks = {}
    for sym, label in (("SPY", "S&P 500 ETF"), ("HGUSD", "Copper, USD per pound")):
        p = d / f"{sym}.px.json"
        if p.exists():
            benchmarks[sym] = {"name": label, "prices": weekly(read_json(p), FIRST_PRICE)}

    doc = {
        "capturedAt": "2026-10-08",
        "about": "Quarterly filed figures and weekly closes for the Demand Discovery pilot. "
                 "Frozen at the capture date; see tools/capture/README.md §3.",
        "units": "USD millions for money; USD per share for prices; shares in millions",
        "cols": COLS,
        "companies": companies,
        "benchmarks": benchmarks,
    }
    OUT.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
