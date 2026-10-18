"""Compare a company's risk factors between two 10-Ks.

    python risk_factors.py NEW.htm OLD.htm          # local files (e.g. work/raw/)
    python risk_factors.py https://www.sec.gov/... https://www.sec.gov/...

Splits Item 1A into its headed risk factors, matches each to last year's by
heading and opening, and compares sentence by sentence. Prints the counts the
Research tab's review records (`web/src/lib/risk-factors.ts`) and, for each
risk factor, the sentences added and dropped, for a person to read. The
reading of which changes matter, and the words describing them, stay ours;
nothing this prints is copied into the app.

Two heading styles are handled: Apple's (groups bold, risk factors bold
italic) and NVIDIA's (groups "Risks Related to ..." bold, risk factors
bold). Check the printed count against the filing's own before trusting a
new company's split. URLs go through common.get, so www.sec.gov needs a real
contact in SEC_USER_AGENT.

The same method was first run in the app's browser on 2026-10-12, for the
AAPL FY2025/FY2024 and NVDA FY2026/FY2025 reviews.
"""
import re
import sys
from html import unescape
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import get  # noqa: E402

BLOCKS = {'div', 'p'}


class Leaves(HTMLParser):
    """Leaf div/p blocks, each with its text and whether every styled run in it is bold / italic."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []   # one dict per open div/p
        self.out = []
        self.styles = []  # open span styles

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in BLOCKS:
            if self.stack:
                self.stack[-1]['parent'] = True
            self.stack.append({'text': [], 'runs': [], 'parent': False})
        elif tag == 'span':
            self.styles.append(a.get('style') or '')

    def handle_endtag(self, tag):
        if tag in BLOCKS and self.stack:
            b = self.stack.pop()
            if not b['parent']:
                text = re.sub(r'\s+', ' ', ''.join(b['text'])).strip()
                runs = [r for r in b['runs'] if r[0].strip()]
                self.out.append({
                    'text': text,
                    'bold': bool(runs) and all(re.search(r'font-weight:\s*(700|bold)', s) for _, s in runs),
                    'italic': bool(runs) and all(re.search(r'font-style:\s*italic', s) for _, s in runs),
                })
        elif tag == 'span' and self.styles:
            self.styles.pop()

    def handle_data(self, data):
        if self.stack:
            self.stack[-1]['text'].append(data)
            self.stack[-1]['runs'].append((data, self.styles[-1] if self.styles else ''))


def risk_factors(raw):
    p = Leaves()
    p.feed(raw)
    bl = p.out
    ts = [b['text'] for b in bl]
    a1 = next(i for i, t in enumerate(ts) if re.match(r'^Item 1A\.\s*Risk Factors$', t, re.I) and any(len(x) > 80 for x in ts[i + 1:i + 6]))
    end = next(i for i in range(a1 + 1, len(ts)) if re.match(r'^Item 1B\.', ts[i], re.I))
    start = max([i for i in range(a1, end) if ts[i] == 'Risk Factors'] or [a1])
    items, cur, group = [], None, None
    for b in bl[start + 1:end]:
        t = b['text']
        if not t or t.isdigit() or t == 'Table of Contents' or re.search(r'Form 10-K \| \d+$', t):
            continue
        if b['bold'] and (t.startswith('Risks Related to') or (not b['italic'] and len(t) < 90 and not t.endswith('.'))):
            group = t
            continue
        if b['bold']:
            cur = {'group': group, 'heading': t, 'body': []}
            items.append(cur)
            continue
        if cur:
            cur['body'].append(t)
    return [{**x, 'body': ' '.join(x['body'])} for x in items]


def norm(s):
    return re.sub(r'\s+', ' ', re.sub(r"[^a-z0-9' ]+", ' ', s.lower().replace('’', "'"))).strip()


def toks(s):
    return {w for w in norm(s).split() if len(w) > 2}


def jac(a, b):
    A, B = toks(a), toks(b)
    i = len(A & B)
    return i / ((len(A) + len(B) - i) or 1)


def sents(s):
    return [x.strip() for x in re.split(r'(?<=[.;])\s+(?=[A-Z“"(])', s) if len(x.strip()) > 30]


def compare(new, old):
    used, rows = set(), []
    for n in new:
        best, score = None, 0.0
        for j, o in enumerate(old):
            if j in used:
                continue
            s = max(jac(n['heading'], o['heading']), 0.9 * jac(n['heading'] + ' ' + n['body'][:600], o['heading'] + ' ' + o['body'][:600]))
            if s > score:
                best, score = j, s
        if score < 0.35:
            rows.append({'status': 'new', 'new': n, 'old': None, 'added': sents(n['body']), 'dropped': []})
            continue
        used.add(best)
        o = old[best]
        ns, os_ = sents(n['body']), sents(o['body'])
        added = [x for x in ns if max([jac(x, y) for y in os_] or [0]) < 0.6]
        dropped = [x for x in os_ if max([jac(x, y) for y in ns] or [0]) < 0.6]
        rows.append({'status': 'same heading' if norm(n['heading']) == norm(o['heading']) else 'reworded', 'new': n, 'old': o, 'added': added, 'dropped': dropped})
    gone = [o for j, o in enumerate(old) if j not in used]
    return rows, gone


def load(src):
    return get(src) if src.startswith('http') else Path(src).read_text(encoding='utf-8', errors='replace')


def main(new_src, old_src):
    new, old = risk_factors(load(new_src)), risk_factors(load(old_src))
    rows, gone = compare(new, old)
    count = lambda s: sum(r['status'] == s for r in rows)  # noqa: E731
    print(f'risk factors: {len(new)} now, {len(old)} before')
    print(f"counts: sameHeading {count('same heading')}, reworded {count('reworded')}, added {count('new')}, dropped {len(gone)}")
    for i, r in enumerate(rows):
        print(f"\n[{i}] {r['status'].upper()}  ({r['new']['group']})\n    {r['new']['heading'][:200]}")
        if r['status'] == 'reworded':
            print(f"    was: {r['old']['heading'][:200]}")
        for x in r['added'][:6]:
            print(f'    + {x[:240]}')
        for x in r['dropped'][:4]:
            print(f'    - {x[:240]}')
    for o in gone:
        print(f"\nDROPPED  ({o['group']})\n    {o['heading'][:200]}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
