"""
Maz Vantage — events: follow a headline to the company's own announcement.

    python tools/events/follow.py URL [URL ...] [--symbols NVDA MSFT AAPL] [--hops 1]

For each URL:

  1. Fetch it (robots.txt honoured, through tools/letters/common.py).
  2. Decide whose voice it is. A company's own newsroom, investor site or
     blog, or a press-release wire carrying the company's release, is a
     **primary** source. Anything else is **press** coverage.
  3. Primary: store the full text in the document corpus (work/corpus.sqlite)
     as a press release, so a reading can quote and cite it.
     Press: store the title, date and link only, never the article, and look
     through its links for a primary source to follow (one hop by default).

The point is the hop. A headline is usually a news article; the facts worth
recording are in the release it was written from, and the record should cite
that, labelled `confirmed`, rather than the article, labelled `reported`.
"""
import argparse
import re
import sys
import urllib.parse
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Both tool folders have a `common.py`: the corpus one is imported by name
# (store.py needs it), the letters one is loaded by path under its own name.
sys.path.insert(0, str(HERE.parent / 'corpus'))
from common import chunk, html_to_text  # noqa: E402  corpus: HTML to text, chunker
from store import connect, put  # noqa: E402

import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location('letters_common', HERE.parent / 'letters' / 'common.py')
letters_common = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(letters_common)
anchors, get = letters_common.anchors, letters_common.get  # polite fetch, robots.txt

sys.stdout.reconfigure(encoding='utf-8')

# The companies' own channels. A host matches when it is, or ends with, one of these.
ISSUERS = {
    'NVDA': ['nvidianews.nvidia.com', 'investor.nvidia.com', 'blogs.nvidia.com', 'nvidia.com'],
    'MSFT': ['news.microsoft.com', 'blogs.microsoft.com', 'blogs.windows.com', 'microsoft.com'],
    'AAPL': ['apple.com'],
    'AMD': ['amd.com', 'ir.amd.com'],
    'INTC': ['intel.com', 'newsroom.intel.com'],
    'QCOM': ['qualcomm.com'],
}
# Wires carry the issuer's own words: primary when the release is the company's.
WIRES = ['businesswire.com', 'globenewswire.com', 'prnewswire.com', 'accesswire.com', 'newsfilecorp.com']


def host_of(url):
    return urllib.parse.urlsplit(url).netloc.lower().removeprefix('www.')


def issuer_of(url):
    h = host_of(url)
    for sym, hosts in ISSUERS.items():
        if any(h == d or h.endswith('.' + d) for d in hosts):
            return sym
    return None


def is_wire(url):
    h = host_of(url)
    return any(h == d or h.endswith('.' + d) for d in WIRES)


TITLE = re.compile(r'<title[^>]*>(.*?)</title>', re.I | re.S)
META_DATE = re.compile(r'(?:article:published_time|datePublished|pubdate|publish-date)["\']?\s*(?:content=|:)\s*["\']?(\d{4}-\d{2}-\d{2})', re.I)
URL_DATE = re.compile(r'/(20\d\d)/(\d{1,2})/(\d{1,2})/')


def published(url, page):
    m = META_DATE.search(page)
    if m:
        return m.group(1)
    m = URL_DATE.search(url)
    if m:
        return f'{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}'
    # Investor-relations pages often carry the date only as text above the headline.
    body = letters_common.text(page[:400_000])
    full = [d for d in letters_common.parse_dates(body[:6000]) if len(d) == 10]
    return full[0] if full else None


# A bot check or a paywall answers with a page of its own; it is not the article.
BLOCKED = re.compile(r'pardon our interruption|just a moment|access denied|are you a robot|attention required|subscribe to continue', re.I)


def fetch(url):
    status, final, ctype, raw = get(url)
    if 'html' not in ctype and 'xml' not in ctype:
        raise ValueError(f'not a page: {ctype}')
    page = raw.decode('utf-8', 'replace')
    t = TITLE.search(page)
    title = re.sub(r'\s+', ' ', letters_common.text(t.group(1))).strip() if t else final
    if BLOCKED.search(title):
        raise PermissionError(f'blocked by the site ({title})')
    return final, page, title


def store_primary(db, url, page, title, symbols):
    sym = issuer_of(url) or (symbols[0] if symbols else 'UNKNOWN')
    text = html_to_text(page)
    pieces = chunk(text)
    pub = published(url, page) or date.today().isoformat()
    put(db, {'doc_id': f'web:{url}', 'symbol': sym, 'source': 'newsroom', 'kind': 'press-release',
             'title': title, 'published_at': pub, 'period': None, 'url': url}, pieces)
    return sym, pub, len(pieces), sum(len(p[2]) for p in pieces)


def store_press(db, url, page, title):
    """Coverage: the title and link, so the event can say who reported it. Not the article."""
    pub = published(url, page) or date.today().isoformat()
    put(db, {'doc_id': f'web:{url}', 'symbol': 'PRESS', 'source': 'press', 'kind': 'article',
             'title': title, 'published_at': pub, 'period': None, 'url': url},
        [('', 0, title)])
    return pub


def primary_links(url, page, symbols):
    """Links on a press page that point at a covered company's own channel or a wire."""
    out = []
    for href, label, _ in anchors(url, page):
        sym = issuer_of(href)
        if (sym and (not symbols or sym in symbols)) or is_wire(href):
            # Skip navigation: home pages, careers, privacy, investor landing pages.
            path = urllib.parse.urlsplit(href).path.strip('/')
            if path.count('/') >= 1 or re.search(r'\d{4}', path):
                out.append((href, label))
    seen, uniq = set(), []
    for h, l in out:
        if h not in seen:
            seen.add(h)
            uniq.append((h, l))
    return uniq


def follow(db, url, symbols, hops, depth=0, done=None):
    done = done if done is not None else set()
    if url in done:
        return
    done.add(url)
    pad = '  ' * depth
    try:
        final, page, title = fetch(url)
    except PermissionError as e:
        print(f'{pad}- skipped {url}: {e}')
        return
    except Exception as e:
        print(f'{pad}! {url}: {e}')
        return
    if issuer_of(final) or is_wire(final):
        sym, pub, n, chars = store_primary(db, final, page, title, symbols)
        print(f'{pad}PRIMARY {sym:<5} {pub}  {n} chunks, {chars:,} chars  {title[:90]}')
        return
    pub = store_press(db, final, page, title)
    links = primary_links(final, page, symbols)
    print(f'{pad}press   {host_of(final):<22} {pub}  {title[:80]}  ({len(links)} primary links)')
    if depth < hops:
        for href, label in links[:6]:
            print(f'{pad}  -> {label[:60] or href}')
            follow(db, href, symbols, hops, depth + 1, done)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('urls', nargs='+')
    ap.add_argument('--symbols', nargs='*', default=[])
    ap.add_argument('--hops', type=int, default=1)
    a = ap.parse_args()
    db = connect()
    done = set()
    for u in a.urls:
        follow(db, u, [s.upper() for s in a.symbols], a.hops, 0, done)


if __name__ == '__main__':
    main()
