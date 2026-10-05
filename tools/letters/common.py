"""
Maz Vantage — Letters & Outlooks tools: shared plumbing.

Polite HTTP (robots.txt honoured, lookup failures retried), text and date
helpers, and the name handling the crawler and the review step agree on.
Only stdlib, like the other tools.
"""
import html
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import zlib
from datetime import date, timedelta

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/128.0 Safari/537.36')

TAG = re.compile(r'<[^>]+>')
ANCHOR = re.compile(r'<a\b([^>]*)>(.*?)</a>', re.I | re.S)
HREF = re.compile(r'href\s*=\s*["\']([^"\']+)["\']', re.I)


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(TAG.sub(' ', s))).strip()


def fold(s):
    """Lower case, accents dropped: 'Bräutigam' and 'Brautigam' compare equal."""
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()


# ---------------------------------------------------------------- dates

MON = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}
MONTH = r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?'


def parse_dates(s):
    """Every full or month-level date in s, as ISO strings ('2026-07-23' or '2026-07')."""
    out = []
    for m in re.finditer(rf'\b{MONTH}\s+(\d{{1,2}}),?\s+(20\d\d)\b', s, re.I):
        out.append(f'{m.group(3)}-{MON[m.group(1)[:3].lower()]:02d}-{int(m.group(2)):02d}')
    for m in re.finditer(rf'\b(\d{{1,2}})\s+{MONTH}\s+(20\d\d)\b', s, re.I):
        out.append(f'{m.group(3)}-{MON[m.group(2)[:3].lower()]:02d}-{int(m.group(1)):02d}')
    for m in re.finditer(r'\b(20\d\d)-(\d\d)-(\d\d)\b', s):
        out.append(f'{m.group(1)}-{m.group(2)}-{m.group(3)}')
    for m in re.finditer(rf'\b{MONTH}\s+(20\d\d)\b', s, re.I):
        out.append(f'{m.group(2)}-{MON[m.group(1)[:3].lower()]:02d}')
    return out


class Window:
    """The dates a document may carry to be listed: from `since` to today."""

    def __init__(self, since=None, until=None):
        self.until = until or date.today().isoformat()
        self.since = since or (date.fromisoformat(self.until) - timedelta(days=270)).isoformat()
        years = range(int(self.since[:4]), int(self.until[:4]) + 1)
        yy = '|'.join(str(y)[2:] for y in years)
        self.in_url = re.compile(rf'({"|".join(map(str, years))})|[1-4]q({yy})\b|q[1-4]-?({yy})\b', re.I)
        self.old_year = re.compile(r'\b20\d\d\b')
        self.years = {str(y) for y in years}

    def ok(self, iso):
        if len(iso) == 7:
            return self.since[:7] <= iso <= self.until[:7]
        return self.since <= iso <= self.until and 1 <= int(iso[8:]) <= 31

    def first(self, s):
        return next((d for d in parse_dates(s) if self.ok(d)), None)

    def only_old(self, s):
        """True when s names a year, and none of them is in the window: '2024 Annual Letter'."""
        ys = set(self.old_year.findall(s))
        return bool(ys) and not (ys & self.years)


# ---------------------------------------------------------------- http

_robots, _rlock = {}, threading.Lock()


def allowed(url):
    p = urllib.parse.urlsplit(url)
    key = f'{p.scheme}://{p.netloc}'
    with _rlock:
        rp = _robots.get(key)
    if rp is None:
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(key + '/robots.txt', headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=10) as r:
                rp.parse(r.read(200_000).decode('utf-8', 'replace').splitlines())
        except Exception:
            rp.parse([])
        with _rlock:
            _robots[key] = rp
    return rp.can_fetch('*', url)


def _get(url, limit, timeout):
    if not allowed(url):
        raise PermissionError('robots.txt')
    req = urllib.request.Request(url, headers={
        'User-Agent': UA, 'Accept': 'text/html,application/pdf,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9', 'Accept-Encoding': 'gzip, deflate'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(limit)
        enc = r.headers.get('Content-Encoding', '')
        # A decompressor object, not gzip.decompress: a body cut off at `limit` is
        # still readable up to the cut, where the one-shot call raises EOFError.
        if enc == 'gzip':
            raw = zlib.decompressobj(16 + zlib.MAX_WBITS).decompress(raw)
        elif enc == 'deflate':
            raw = zlib.decompressobj().decompress(raw)
        return r.status, r.geturl(), r.headers.get('Content-Type', ''), raw


def get(url, limit=4_000_000, timeout=20):
    """GET with robots.txt honoured. A failed name lookup is retried, not believed:
    the Windows resolver throttles after a burst and then fails every lookup for a while."""
    for attempt in range(3):
        try:
            return _get(url, limit, timeout)
        except urllib.error.URLError as e:
            if 'getaddrinfo' in str(e) and attempt < 2:
                time.sleep(3 + 4 * attempt)
                continue
            raise


def anchors(base, page):
    """(absolute href, link text, ~1,000 characters around the link) for every link on a page."""
    out = []
    for m in ANCHOR.finditer(page):
        h = HREF.search(m.group(1))
        if not h:
            continue
        href = urllib.parse.urljoin(base, html.unescape(h.group(1))).split('#')[0]
        if href.startswith('http'):
            out.append((href, text(m.group(2))[:200], text(page[max(0, m.start() - 500): m.end() + 500])))
    return out


def registrable(host):
    """'www.oaktreecapital.com' -> 'oaktreecapital.com'; 'www.fundsmith.co.uk' -> 'fundsmith.co.uk'."""
    parts = host.lower().split(':')[0].split('.')
    if parts[0] == 'www':
        parts = parts[1:]
    return '.'.join(parts[-3:]) if len(parts) > 2 and parts[-2] in ('co', 'com', 'org', 'net') else '.'.join(parts[-2:])


def same_site(href, root):
    nl = urllib.parse.urlsplit(href).netloc.lower().split(':')[0]
    return nl == root or nl.endswith('.' + root)


# ---------------------------------------------------------------- names

LEGAL = (r'\b(llc|l\.l\.c\.|ltd\.?|limited|lp|l\.p\.|llp|inc\.?|incorporated|corp\.?|corporation|plc|pty|pte|gmbh|ag|sa|s\.a\.|'
         r'sau|sgiic|b\.v\.|bv|ab|co\.|company)\b')
GENERIC = {'asset', 'assets', 'management', 'investment', 'investments', 'investors', 'capital', 'partners', 'advisors', 'advisers',
           'advisory', 'group', 'funds', 'fund', 'wealth', 'global', 'research', 'associates', 'holdings', 'trust', 'the', 'and',
           'services', 'managers', 'manager', 'international', 'financial', 'equity', 'value', 'strategies', 'portfolio', 'counsel'}


def tokens(name):
    """'Smead Capital Management, LLC' -> ['smead', 'capital', 'management']."""
    n = name.split('/')[0]
    n = re.sub(r'\(.*?\)', ' ', n)
    n = fold(n).replace('&', ' and ')
    n = re.sub(LEGAL, ' ', n)
    return [t for t in re.split(r'[^a-z0-9]+', n) if t]


def core_tokens(name):
    t = tokens(name)
    return [w for w in t if w not in GENERIC] or t[:1]
