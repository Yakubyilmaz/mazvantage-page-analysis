"""Turn saved earnings-call replies into the text files the call reader takes.

`recover_connector.py` saves each transcript as search-transcripts_<SYM>_<year>_<quarter>.json
(a one-element list: symbol, period, year, date, content). The management-voice
reader (web/tests/management-voice.test.ts, VOICE_CALLS=...) and the quote
checker want plain text, one call per file:

    symbol: NVDA
    period: 2027 Q2
    date: 2026-08-26
    ---
    Colette Kress: Thanks, Toshiya. ...

The text stays in a git-ignored work folder: transcripts are the company's
property ("It can't be reproduced or transcribed without our prior written
consent"), so the app keeps scores and short quotes, never the call.

    python tools/research/transcripts_to_txt.py REPLIES_DIR OUT_DIR [--symbol NVDA]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('replies')
    p.add_argument('out')
    p.add_argument('--symbol')
    args = p.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for f in sorted(Path(args.replies).glob('search-transcripts_*.json')):
        rows = json.loads(f.read_text(encoding='utf-8'))
        for r in rows if isinstance(rows, list) else [rows]:
            sym = r.get('symbol')
            if args.symbol and sym != args.symbol.upper():
                continue
            year, q = r.get('year'), str(r.get('period', '')).lstrip('Q')
            head = f"symbol: {sym}\nperiod: {year} Q{q}\ndate: {r.get('date')}\n---\n"
            body = str(r.get('content', '')).replace('\r\n', '\n')
            (out / f'{sym}-{year}-Q{q}.txt').write_text(head + body + '\n', encoding='utf-8')
            n += 1
    print(f'{n} call(s) written to {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
