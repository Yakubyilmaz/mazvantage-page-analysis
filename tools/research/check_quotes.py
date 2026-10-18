"""Check that every quote in the report's records is word for word in its source.

Reads the `quote: '...'` strings of the given TypeScript record files
(debates.ts, research-voices.ts, events.ts) and looks for each in the source
texts: call transcripts (.txt from transcripts_to_txt.py, or the connector's
.json replies), fund letters (tools/letters/work/text/), and any page text you
saved. A quote cut with "…" is checked part by part. Curly and straight quotes,
dashes and whitespace are normalised; nothing else is.

    python tools/research/check_quotes.py web/src/lib/debates.ts web/src/lib/research-voices.ts \
        --sources tools/research/work/NVDA/calls tools/letters/work/text

Exit status 1 when any quote is missing, so it can gate a commit. A quote
from a web page (a company blog, a release) that is not saved locally will
show as missing: fetch the page, save its text into a sources folder, re-run.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

QUOTE = re.compile(r"quote: '((?:[^'\\]|\\.)*)'")


def norm(x: str) -> str:
    for a, b in (('’', "'"), ('‘', "'"), ('“', '"'), ('”', '"'), ('–', '-'), ('—', '-'), ('­', '')):
        x = x.replace(a, b)
    x = x.replace('-\n', '')
    return re.sub(r'\s+', ' ', x).strip().lower()


def load_sources(dirs: list[str]) -> list[str]:
    texts = []
    for d in dirs:
        for f in Path(d).rglob('*'):
            if not f.is_file() or f.suffix.lower() not in {'.txt', '.json', '.md', '.html', '.htm'}:
                continue
            raw = f.read_text(encoding='utf-8', errors='ignore')
            if f.suffix == '.json':
                try:
                    data = json.loads(raw)
                    rows = data if isinstance(data, list) else [data]
                    raw = '\n'.join(str(r.get('content', '')) if isinstance(r, dict) else str(r) for r in rows)
                except json.JSONDecodeError:
                    pass
            texts.append(norm(raw))
    return texts


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('records', nargs='+')
    p.add_argument('--sources', nargs='+', required=True)
    p.add_argument('--symbol', help='only records whose block names this symbol (a cheap filter on "symbol: \'X\'")')
    args = p.parse_args()
    corpus = load_sources(args.sources)
    print(f'{len(corpus)} source texts')
    missing = 0
    for rec in args.records:
        src = Path(rec).read_text(encoding='utf-8')
        for m in QUOTE.finditer(src):
            if args.symbol:
                before = src[max(0, m.start() - 1500):m.start()]
                last = re.findall(r"symbol: '([A-Z.]+)'", before)
                if last and last[-1] != args.symbol.upper():
                    continue
            q = m.group(1).replace("\\'", "'")
            parts = [norm(x) for x in q.split('…') if norm(x)]
            ok = all(any(part in c for c in corpus) for part in parts)
            words = len(q.split())
            flag = '' if words <= 35 else '  (over 35 words)'
            if not ok or flag:
                missing += 0 if ok else 1
                print(f"{'MISSING' if not ok else 'LONG   '} {Path(rec).name}: {q[:110]}{flag}")
    print(f'{missing} quote(s) not found word for word')
    return 1 if missing else 0


if __name__ == '__main__':
    raise SystemExit(main())
