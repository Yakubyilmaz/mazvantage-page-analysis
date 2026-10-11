"""
Fold a captured set of peer rows into a bundled snapshot's extras.

    python tools/capture/fold_peer_rows.py web/public/data/AAPL.json tools/capture/peer-rows-2026-10-09.json

`ratios` replaces extras.peerRatios (the snapshot used to carry only P/E,
P/S and P/B per peer), `growth` fills extras.peerGrowth, and `metrics` lands
in extras.peerMetrics: the same three feeds a live session fetches per peer.
The capture date goes to feedDates so the page can print it.
"""
import json
import sys


def main(snapshot, rows):
    snap = json.load(open(snapshot, encoding='utf-8'))
    cap = json.load(open(rows, encoding='utf-8'))
    ex = snap.setdefault('extras', {})
    ex['peerRatios'] = {s: {'symbol': s, **r} for s, r in cap['ratios'].items()}
    ex['peerGrowth'] = {s: {'symbol': s, **r} for s, r in cap['growth'].items()}
    ex['peerMetrics'] = {s: {'symbol': s, **r} for s, r in cap['metrics'].items()}
    ex['peersCapturedAt'] = cap['capturedAt']
    fd = snap.setdefault('feedDates', {})
    for k in ('peerRatios', 'peerGrowth', 'peerMetrics'):
        fd[k] = cap['capturedAt']
    with open(snapshot, 'w', encoding='utf-8') as f:
        json.dump(snap, f, ensure_ascii=False, indent=1)
    print(f"{snapshot}: {len(cap['ratios'])} peers folded, captured {cap['capturedAt']}")


if __name__ == '__main__':
    main(*sys.argv[1:3])
