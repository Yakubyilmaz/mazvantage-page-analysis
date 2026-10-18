"""The consensus ledger: dated captures of what the analysts expect.

Estimate revisions are among the most informative signals there are, and no
feed here keeps their history: `analyst-estimates` returns only today's
consensus. So the history has to be built forward, one capture at a time.
This appends a capture to web/public/data/consensus-ledger.json, which the
Research tab's "Street View" reads: per fiscal year, revenue and EPS (average,
low, high, analyst count), plus the price-target consensus and the rating
counts where the capture carried them.

Three ways in (run from the repository root):

    # 1. live, with a key in the environment (never written to disk)
    FMP_API_KEY=... python tools/capture/consensus_ledger.py live AAPL NVDA

    # 2. from replies saved from the data connector in a session
    python tools/capture/consensus_ledger.py fold AAPL 2026-10-12 \
        --estimates est.json [--target target.json] [--grades grades.json] [--price 336.64]

    # 3. from a snapshot (the bundled web/public/data/<SYMBOL>.json, or one
    #    read out of git history), dated by the caller
    python tools/capture/consensus_ledger.py snapshot AAPL 2026-08-24 path/to/AAPL.json [--estimates-only]

A capture for a symbol and date that is already on the ledger is replaced,
so a re-run is safe. Captures are kept oldest first. Nothing here is
smoothed or filled: a field the source did not carry stays absent.

Schedule it daily (Task Scheduler, cron, or a scheduled session) and the
revision history accrues; the tab says how many captures it has and over
what span, and draws nothing from a single one.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

LEDGER = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "consensus-ledger.json"
BASE = "https://financialmodelingprep.com/stable"

ABOUT = (
    "Dated captures of the analyst consensus, built forward one capture at a time by "
    "tools/capture/consensus_ledger.py. Each capture holds what its source carried that day and nothing more."
)


def estimate_rows(raw: list) -> list:
    """The consensus per fiscal year, in the ledger's shape; years without a revenue average are dropped."""
    out = []
    for r in raw or []:
        if not isinstance(r, dict) or r.get("revenueAvg") in (None, 0):
            continue
        out.append({
            "fy": r["date"],
            "revenue": r.get("revenueAvg"), "revenueLow": r.get("revenueLow"), "revenueHigh": r.get("revenueHigh"),
            "eps": r.get("epsAvg"), "epsLow": r.get("epsLow"), "epsHigh": r.get("epsHigh"),
            "ebit": r.get("ebitAvg"),
            "analystsRevenue": r.get("numAnalystsRevenue"), "analystsEps": r.get("numAnalystsEps"),
        })
    return sorted(out, key=lambda x: x["fy"])


def target_of(raw) -> dict | None:
    r = raw[0] if isinstance(raw, list) and raw else raw
    if not isinstance(r, dict) or r.get("targetConsensus") is None:
        return None
    return {"consensus": r.get("targetConsensus"), "median": r.get("targetMedian"), "high": r.get("targetHigh"), "low": r.get("targetLow")}


def grades_of(raw) -> dict | None:
    r = raw[0] if isinstance(raw, list) and raw else raw
    if not isinstance(r, dict) or r.get("buy") is None:
        return None
    return {k: r.get(k) for k in ("strongBuy", "buy", "hold", "sell", "strongSell")}


def load() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    return {"about": ABOUT, "symbols": {}}


def save(ledger: dict) -> None:
    LEDGER.write_text(json.dumps(ledger, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def add(ledger: dict, symbol: str, capture: dict) -> None:
    rows = ledger.setdefault("symbols", {}).setdefault(symbol, [])
    rows[:] = [c for c in rows if c["date"] != capture["date"]]
    rows.append(capture)
    rows.sort(key=lambda c: c["date"])
    print(f"{symbol} {capture['date']}: {len(capture['estimates'])} fiscal years"
          f"{', target' if capture.get('target') else ''}{', ratings' if capture.get('grades') else ''}"
          f" ({len(rows)} captures on the ledger)")


def capture(date: str, source: str, estimates: list, target=None, grades=None, price=None, note=None) -> dict:
    c = {"date": date, "source": source, "estimates": estimate_rows(estimates)}
    if target:
        c["target"] = target
    if grades:
        c["grades"] = grades
    if price is not None:
        c["price"] = price
    if note:
        c["note"] = note
    return c


def get(path: str, key: str):
    sep = "&" if "?" in path else "?"
    with urllib.request.urlopen(f"{BASE}/{path}{sep}apikey={key}", timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


def cmd_live(args) -> int:
    key = os.environ.get("FMP_API_KEY")
    if not key:
        print("Set FMP_API_KEY in the environment; it is never written to disk.", file=sys.stderr)
        return 2
    ledger = load()
    today = dt.date.today().isoformat()
    for sym in args.symbols:
        est = get(f"analyst-estimates?symbol={sym}&period=annual&limit=10", key)
        tgt = target_of(get(f"price-target-consensus?symbol={sym}", key))
        grd = grades_of(get(f"grades-consensus?symbol={sym}", key))
        q = get(f"quote-short?symbol={sym}", key)
        px = q[0].get("price") if isinstance(q, list) and q else None
        add(ledger, sym, capture(today, "live", est, tgt, grd, px))
    save(ledger)
    return 0


def read(path: str | None):
    return json.loads(Path(path).read_text(encoding="utf-8")) if path else None


def cmd_fold(args) -> int:
    ledger = load()
    add(ledger, args.symbol, capture(args.date, "connector", read(args.estimates), target_of(read(args.target)),
                                     grades_of(read(args.grades)), args.price, args.note))
    save(ledger)
    return 0


def cmd_snapshot(args) -> int:
    snap = read(args.path)
    feeds = snap.get("feeds", snap)
    ledger = load()
    add(ledger, args.symbol, capture(
        args.date, "snapshot", feeds.get("estimates") or [],
        None if args.estimates_only else target_of(feeds.get("priceTarget")),
        None if args.estimates_only else grades_of(feeds.get("grades")),
        None, args.note,
    ))
    save(ledger)
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    lv = sub.add_parser("live")
    lv.add_argument("symbols", nargs="+")
    fd = sub.add_parser("fold")
    fd.add_argument("symbol")
    fd.add_argument("date")
    fd.add_argument("--estimates", required=True)
    fd.add_argument("--target")
    fd.add_argument("--grades")
    fd.add_argument("--price", type=float)
    fd.add_argument("--note")
    sn = sub.add_parser("snapshot")
    sn.add_argument("symbol")
    sn.add_argument("date")
    sn.add_argument("path")
    sn.add_argument("--estimates-only", action="store_true")
    sn.add_argument("--note")
    args = p.parse_args()
    return {"live": cmd_live, "fold": cmd_fold, "snapshot": cmd_snapshot}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
