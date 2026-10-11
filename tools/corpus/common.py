"""
Maz Vantage — the document corpus: shared plumbing.

Polite HTTP for EDGAR, filing HTML to plain text (tables kept as
`cell | cell` rows, inline-XBRL headers dropped), and the chunker.
Only stdlib, like the other tools.
"""
import html
import os
import re
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE / 'work'
RAW = WORK / 'raw'
DB = WORK / 'corpus.sqlite'

# SEC asks for at most ten requests a second and a User-Agent naming a
# contact email. data.sec.gov answers without one; the filing archive on
# www.sec.gov returns 403 until SEC_USER_AGENT is set ("Name email@domain").
UA = os.environ.get('SEC_USER_AGENT', '').strip() or 'MazVantage research tools'
_last = [0.0]


def get(url, binary=False, tries=3):
    if url.startswith('https://www.sec.gov/') and '@' not in UA:
        raise SystemExit('The SEC filing archive needs a contact email in the User-Agent. '
                         'Set SEC_USER_AGENT, e.g. "Maz Vantage you@example.com", and run again.')
    for i in range(tries):
        wait = 0.15 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            return body if binary else body.decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and i < tries - 1:
                time.sleep(2 * (i + 1))
                continue
            raise
        except urllib.error.URLError:
            if i < tries - 1:
                time.sleep(2 * (i + 1))
                continue
            raise


# ---------------------------------------------------------------- HTML to text

BLOCK = {'p', 'div', 'br', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'section', 'ul', 'ol', 'hr', 'center'}
SKIP = {'script', 'style', 'head', 'title'}
HIDDEN_XBRL = re.compile(r'<ix:header>.*?</ix:header>', re.S | re.I)


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines, self.cur, self.skip, self.cells = [], [], 0, None

    def flush(self):
        if self.cells is not None:
            return
        s = re.sub(r'\s+', ' ', ''.join(self.cur)).strip()
        if s:
            self.lines.append(s)
        self.cur = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP:
            self.skip += 1
        elif tag == 'tr':
            self.flush()
            self.cells = []
        elif tag in ('td', 'th') and self.cells is not None:
            self.cur = []
        elif tag in BLOCK and self.cells is None:
            self.flush()

    def handle_endtag(self, tag):
        if tag in SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in ('td', 'th') and self.cells is not None:
            self.cells.append(re.sub(r'\s+', ' ', ''.join(self.cur)).strip())
            self.cur = []
        elif tag == 'tr' and self.cells is not None:
            row = _row(self.cells)
            if row:
                self.lines.append(row)
            self.cells, self.cur = None, []
        elif tag in BLOCK and self.cells is None:
            self.flush()

    def handle_data(self, data):
        if not self.skip:
            self.cur.append(data)


def _row(cells):
    """A table row as 'label | 1,234 | (56)': currency signs, stray parens and empty cells folded in."""
    out = []
    for c in cells:
        c = c.replace('​', '').strip()
        if not c:
            continue
        if out and c in (')', '%', ')%') and out[-1]:
            out[-1] += c
        elif out and out[-1] in ('$', '€', '£', '(', '$(') :
            out[-1] += c
        else:
            out.append(c)
    out = [c for c in out if c not in ('$',)]
    return ' | '.join(out) if out else ''


def html_to_text(raw):
    raw = HIDDEN_XBRL.sub(' ', raw)
    p = _Text()
    p.feed(raw)
    p.flush()
    lines = [html.unescape(x) for x in p.lines]
    # Page furniture: bare page numbers and the running "Apple Inc. | Q3 2026 Form 10-Q | 12" footers.
    lines = [x for x in lines if not re.fullmatch(r'\d{1,3}|Table of Contents|.*\|\s*Form 10-[KQ]\s*\|\s*\d+', x)]
    return '\n'.join(lines)


# ---------------------------------------------------------------- chunks

HEADING = re.compile(r'^(item\s+\d+[a-c]?\.?|note\s+\d+\s*[–—\-.:]|part\s+i{1,3}v?\b)', re.I)


def chunk(text, target=2200, hard=3600):
    """
    Paragraph-aligned chunks of about `target` characters, each with the most
    recent Item / Note heading it sits under and its character offset in the
    document — the offset is the citation that survives a re-chunk.
    """
    out, buf, size, heading, start, pos = [], [], 0, '', 0, 0
    cur_heading = ''
    for line in text.split('\n'):
        ln = len(line) + 1
        if HEADING.match(line) and len(line) < 160:
            if buf and size > target * 0.35:
                out.append((heading, start, '\n'.join(buf)))
                buf, size, start = [], 0, pos
            cur_heading = line
            if not buf:
                heading = cur_heading
        if not buf:
            heading, start = cur_heading, pos
        buf.append(line)
        size += ln
        pos += ln
        is_row = ' | ' in line
        if size >= hard or (size >= target and not is_row):
            out.append((heading, start, '\n'.join(buf)))
            buf, size = [], 0
    if buf:
        out.append((heading, start, '\n'.join(buf)))
    return out
