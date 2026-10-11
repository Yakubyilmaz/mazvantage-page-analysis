"""Fold a refresh of the time-sensitive Alpha Signal feeds into a bundled snapshot.

The bundled snapshot (web/public/data/<SYMBOL>.json) is a capture: every feed
in it was true on `capturedAt`. Prices, 13F aggregates, rating history and the
earnings calendar go stale within weeks, while the filed statements do not.
This replaces only the feeds named in the drop file and records the date each
one was refreshed under `feedDates`, so the app can say "prices as of X" without
claiming the whole capture is newer than it is. `capturedAt` is left alone.

The drop file is JSON keyed by feed name, holding the rows exactly as the data
connector returned them. Two keys are special:

    __bench_market, __bench_industry   the benchmark price series, which live
                                       under extras.benchmarks rather than feeds

Usage (from the repository root):
    python tools/capture/fold_alpha_refresh.py web/public/data/AAPL.json drop.json 2026-10-09
"""
from __future__ import annotations

import json
import sys

BENCH = {"__bench_market": "market", "__bench_industry": "industry"}


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    snap_path, drop_path, refreshed = sys.argv[1:]
    with open(snap_path, encoding="utf-8") as f:
        snap = json.load(f)
    with open(drop_path, encoding="utf-8") as f:
        drop = json.load(f)

    dates = snap.setdefault("feedDates", {})
    for name, rows in drop.items():
        if rows is None:
            continue
        if name in BENCH:
            snap.setdefault("extras", {}).setdefault("benchmarks", {})[BENCH[name]] = rows
            dates[f"benchmarks.{BENCH[name]}"] = refreshed
        else:
            snap["feeds"][name] = rows
            dates[name] = refreshed
        print(f"{name}: {len(rows) if isinstance(rows, list) else 1} row(s)")

    with open(snap_path, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
