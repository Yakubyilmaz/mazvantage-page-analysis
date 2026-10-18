"""Save the data connector's replies from a Claude session log, byte for byte.

When the market data is read through the connector in a session (no key on
disk), every reply is recorded in the session's log. This walks the log and
writes each JSON reply to a file named after the call that produced it, so
nothing is ever retyped:

    <endpoint>_<SYMBOL>[_<year>_<quarter>][_<period>].json

which is the name `capture_snapshot.py dir` and `consensus_ledger.py fold`
read. Replies too large to come back inline were already saved by the
harness under the session's tool-results/ folder; those are copied too.

    python tools/research/recover_connector.py OUT_DIR                 # newest session log of this project
    python tools/research/recover_connector.py OUT_DIR --log PATH.jsonl
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

PROJECTS = Path.home() / '.claude' / 'projects'


def newest_log() -> Path:
    here = re.sub(r'[^A-Za-z0-9]', '-', str(Path(__file__).resolve().parents[2]))
    folder = next((p for p in PROJECTS.iterdir() if p.name.lower() == here.lower()), None)
    if not folder:
        raise SystemExit(f'No session folder for this project under {PROJECTS}; pass --log.')
    logs = sorted(folder.glob('*.jsonl'), key=lambda p: p.stat().st_mtime)
    if not logs:
        raise SystemExit(f'No session log in {folder}; pass --log.')
    return logs[-1]


def name_of(inp: dict) -> str:
    sym = inp.get('symbol') or '-'.join(inp.get('symbols', []) or []) or 'ALL'
    parts = [inp.get('endpoint', 'reply'), sym]
    if inp.get('year') and inp.get('quarter'):
        parts += [str(inp['year']), str(inp['quarter'])]
    if inp.get('period'):
        parts.append(str(inp['period']))
    return '_'.join(parts)


def text_of(content) -> str | None:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ''.join(x.get('text', '') for x in content if isinstance(x, dict))
    return None


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('out')
    p.add_argument('--log')
    p.add_argument('--match', default='', help='only tools whose name contains this (default: every connector call with an endpoint)')
    args = p.parse_args()
    log = Path(args.log) if args.log else newest_log()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    results = log.parent / log.stem / 'tool-results'

    calls: dict[str, tuple[str, dict]] = {}
    saved = 0
    for line in log.read_text(encoding='utf-8').splitlines():
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        content = (entry.get('message') or {}).get('content')
        if not isinstance(content, list):
            continue
        for block in content:
            if block.get('type') == 'tool_use':
                calls[block['id']] = (block.get('name', ''), block.get('input') or {})
            elif block.get('type') == 'tool_result' and block.get('tool_use_id') in calls:
                tool, inp = calls[block['tool_use_id']]
                if 'endpoint' not in inp or args.match not in tool:
                    continue
                body = text_of(block.get('content'))
                if not body:
                    continue
                # A reply the harness saved to a file: the body names it.
                m = re.search(r'saved to:?\s*(\S+\.(?:json|txt))', body)
                if m and Path(m.group(1)).exists():
                    body = Path(m.group(1)).read_text(encoding='utf-8')
                    try:
                        wrapped = json.loads(body)
                        if isinstance(wrapped, list) and wrapped and isinstance(wrapped[0], dict) and wrapped[0].get('type') == 'text':
                            body = wrapped[0]['text']
                    except json.JSONDecodeError:
                        pass
                try:
                    data = json.loads(body)
                except json.JSONDecodeError:
                    continue
                (out / f'{name_of(inp)}.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
                saved += 1
    print(f'{saved} replies saved to {out} from {log.name}' + ('' if results.exists() else ''))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
