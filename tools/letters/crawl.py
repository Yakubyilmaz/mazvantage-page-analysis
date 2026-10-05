#!/usr/bin/env python3
"""
Maz Vantage — Letters & Outlooks crawler.

Firm name -> its own website -> its letters / insights page -> recent
documents, each one opened to read its title and date. Only the names come
from outside; everything kept is read off the firm's own site.

    python tools/letters/crawl.py names.txt
    python tools/letters/crawl.py names.txt --since 2026-07-01 --work tools/letters/work
    python tools/letters/crawl.py names.txt --stage docs        # resume after the site stage

Then review what it found and paste the result into web/src/lib/letters-index.ts:

    python tools/letters/review.py

Stages (each writes into --work, so a run can be resumed):
  1. dns    every guessed address for every name (smeadcapital.com, smeadcap.com,
            smead.co.uk ...) is looked up; the ones that exist are kept.  dns.json
  2. sites  each existing address is opened and scored: the firm's name must be on
            the page and the page must be about money. Best scorer wins.     sites.json
  3. docs   the winner's homepage is read for its letters / insights links (or the
            usual addresses when the menu is built by script), those pages are read
            for dated links, and up to nine are opened. A document is kept only if
            its date is in the window and it has a real title.                docs.jsonl

Politeness: robots.txt is honoured; one firm's requests run one after another
with a pause; at most ~15 requests per site. Lookups run at most 48 at a time —
a burst of 160 once made the Windows resolver fail every lookup for an hour.

PDFs: when `pdftotext` (poppler) is on PATH, a PDF's first page is read for its
date and title; without it, a PDF needs a date on the page that links to it.
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.parse

from common import GENERIC, Window, anchors, fold, get, registrable, same_site, text, tokens

TLDS = ['com', 'co.uk', 'com.au', 'ca', 'ch', 'de', 'co', 'net', 'io', 'fr', 'es']

# ---------------------------------------------------------------- 1. addresses


def guesses(name):
    """Likely domains for a firm, most likely first."""
    t = tokens(name)
    core = [w for w in t if w not in GENERIC] or t[:1]
    out = []

    def add(s):
        if s and s not in out and 3 <= len(s) <= 40:
            out.append(s)
    add(''.join(core))
    add(''.join(t))
    for suf in ['capital', 'cap', 'funds', 'invest', 'investments', 'am', 'partners', 'group']:
        add(''.join(core) + suf)
    if len(core) > 1:
        add('-'.join(core))
    return [f'{b}.{tld}' for b in out[:9] for tld in TLDS]


def resolves(host):
    try:
        socket.getaddrinfo(host, 443)
        return True
    except Exception:
        return False


def stage_dns(names, work):
    path = os.path.join(work, 'dns.json')
    done = json.load(open(path)) if os.path.exists(path) else {}
    todo = [n for n in names if n not in done]
    pairs = [(n, h) for n in todo for h in guesses(n)]
    socket.setdefaulttimeout(4)
    hits = {n: [] for n in todo}
    with cf.ThreadPoolExecutor(48) as ex:
        for i, ((n, h), ok) in enumerate(zip(pairs, ex.map(lambda p: resolves(p[1]), pairs))):
            if ok:
                hits[n].append(h)
            if i % 5000 == 0:
                print(f'dns {i}/{len(pairs)} lookups', flush=True)
    socket.setdefaulttimeout(None)
    done.update(hits)
    json.dump(done, open(path, 'w'))
    return done

# ---------------------------------------------------------------- 2. sites


PARKED = re.compile(r'domain (is )?for sale|buy this domain|hugedomains|sedo\.com|dan\.com|godaddy|parkingcrew|this domain|'
                    r'domain name is|coming soon|under construction|account suspended', re.I)
FINWORDS = re.compile(r'invest|fund|capital|asset|portfolio|wealth|letter|equit|research|partners|advis', re.I)


def score_site(name, host):
    core = [w for w in tokens(name) if w not in GENERIC] or tokens(name)[:1]
    st = None
    for scheme in ('https://', 'http://'):
        try:
            st, final, ctype, raw = get(scheme + host + '/', limit=1_500_000, timeout=15)
            break
        except Exception:
            st = None
    if not st or 'html' not in ctype:
        return None
    h = raw.decode('utf-8', 'replace')
    t = re.search(r'<title[^>]*>(.*?)</title>', h, re.I | re.S)
    title = text(t.group(1)) if t else ''
    og = re.search(r'og:site_name["\'][^>]+content=["\']([^"\']+)', h, re.I)
    body = text(re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', h, flags=re.S | re.I))[:6000]
    hay = fold(' '.join([title, og.group(1) if og else '', body]))
    if PARKED.search(hay[:3000]) or len(body) < 200:
        return None
    found = sum(1 for w in core if re.search(rf'\b{re.escape(w)}', hay))
    if found < len(core):
        return None
    head = fold(title + ' ' + (og.group(1) if og else ''))
    s = 2 * found + (3 if all(w in head for w in core) else 0) + (2 if FINWORDS.search(hay) else -5)
    return {'host': urllib.parse.urlsplit(final).netloc, 'final': final, 'title': title[:160], 'score': s}


def stage_sites(names, dns, work, threads):
    path = os.path.join(work, 'sites.json')
    done = json.load(open(path)) if os.path.exists(path) else {}
    todo = [n for n in names if n not in done and dns.get(n)]

    def one(n):
        best = None
        for host in dns[n][:8]:
            r = score_site(n, host)
            if r and (not best or r['score'] > best['score']):
                best = r
            time.sleep(0.2)
        return n, best if best and best['score'] >= 5 else None
    with cf.ThreadPoolExecutor(threads) as ex:
        for i, (n, r) in enumerate(ex.map(one, todo)):
            done[n] = r
            if i % 25 == 0:
                json.dump(done, open(path, 'w'), indent=0)
                print(f'sites {i + 1}/{len(todo)} confirmed={sum(1 for v in done.values() if v)}', flush=True)
    json.dump(done, open(path, 'w'), indent=0)
    return done

# ---------------------------------------------------------------- 3. documents


INDEX_WORDS = re.compile(r'letter|commentar|perspective|insight|thinking|memo|missive|outlook|research|library|publication|'
                         r'article|views|blog|news|literature|documents|reports|market-update|quarterly', re.I)
INDEX_RANK = ['letter', 'commentar', 'memo', 'missive', 'perspective', 'insight', 'outlook', 'thinking', 'research', 'article',
              'views', 'publication', 'library', 'literature', 'documents', 'reports', 'blog', 'news']
NOT_INDEX = re.compile(r'login|log-in|sign-?in|career|job|contact|privacy|cookie|terms|legal|disclaimer|team|people|about|'
                       r'subscribe|signup|podcast|video|event|webinar|press|media-kit|esg-policy|stewardship-policy|#', re.I)
JUNK = re.compile(r'form ?crs|form ?adv|adv part|privacy|cookie|prospectus|statement of additional|\bsai\b|fact ?sheet|factsheet|'
                  r'holdings|distribution|proxy|webinar|webcast|podcast|video|event|conference call|award|career|\bjobs?\b|press release|'
                  r'announce|appoint|hire|joins|launch|\bnav\b|tax|13f|terms|login|subscribe|kiid|\bkid\b|priips|financial statements|'
                  r'code of ethics|best execution|pillar 3|modern slavery|gender pay|remuneration|voting|engagement report|'
                  r'stewardship report|application form|policy|brochure|presentation deck|investor day|careers', re.I)
GENERIC_ANCHOR = re.compile(r'^(read more|learn more|download|pdf|view|view pdf|click here|here|more|read|open|read the article|'
                            r'read article|full report|read full report|see more|continue reading|explore now)$', re.I)
DOCWORDS = re.compile(r'letter|commentar|memo|missive|outlook|quarterly|review|update|perspective|insight|view|thought|report|'
                      r'market|economy|econom|rates|inflation|equit|credit|bond|ai\b|investor', re.I)
STRONG = re.compile(r'letter|commentar|memo|missive|outlook|quarterly|perspective|insight', re.I)
FALLBACK_PATHS = ['/letters', '/investor-letters', '/insights', '/commentary', '/research', '/perspectives', '/blog', '/news']
HAS_PDFTOTEXT = bool(shutil.which('pdftotext'))


def trim_brand(t):
    """'What Tight Credit Spreads Mean | Thornburg' -> 'What Tight Credit Spreads Mean'."""
    t = re.sub(r'\s+', ' ', t).strip(' |-–—:')
    for sep in [' | ', ' - ', ' – ', ' — ']:
        if sep in t:
            parts = t.split(sep)
            if len(parts[-1]) < 40 and len(parts[0]) >= 12:
                t = sep.join(parts[:-1]).strip()
    return t[:220]


def open_doc(href, label, ctx, win):
    """Open one candidate. Returns {url, title, date, format} or None."""
    st, final, ctype, raw = get(href, limit=15_000_000, timeout=30)
    if st != 200:
        return None
    listing_date = win.first(label) or win.first(ctx)
    if 'pdf' in ctype or raw[:5] == b'%PDF-':
        fmt, doc_date = 'pdf', None
        title = label if label and not GENERIC_ANCHOR.match(label) and len(label) >= 10 else ''
        if HAS_PDFTOTEXT:
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
                f.write(raw)
            try:
                out = subprocess.run(['pdftotext', '-l', '2', '-layout', f.name, '-'], capture_output=True, timeout=60).stdout
                head = [l.strip() for l in out.decode('utf-8', 'replace').splitlines() if l.strip()][:20]
                doc_date = win.first(' '.join(head[:12]))
                if not title:
                    cand = [l for l in head[:6] if 10 <= len(l) <= 120 and not re.search(r'www\.|@|\d{3}[.-]\d{3}', l)]
                    title = ' — '.join(cand[:2])
            finally:
                os.remove(f.name)
    else:
        fmt = 'web'
        h = raw.decode('utf-8', 'replace')
        og = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', h, re.I)
        tt = re.search(r'<title[^>]*>(.*?)</title>', h, re.I | re.S)
        h1 = re.search(r'<h1[^>]*>(.*?)</h1>', h, re.I | re.S)
        h1t = text(h1.group(1)) if h1 else ''
        title = h1t if 10 <= len(h1t) <= 200 else (text(og.group(1)) if og else (text(tt.group(1)) if tt else ''))
        if not title and label and not GENERIC_ANCHOR.match(label) and 10 <= len(label) <= 200:
            title = label
        meta = re.findall(r'(?:article:published_time|datePublished|publish[_-]?date)["\']?\s*(?:content=|:)\s*["\'](20\d\d-\d\d-\d\d)', h, re.I)
        body = text(re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', h, flags=re.S | re.I))
        # The date a reader sees beats page metadata, which is often a template's creation date.
        doc_date = win.first(body[:4000]) or (meta[0] if meta and win.ok(meta[0]) else None)
    date = listing_date or doc_date
    if not date or not title:
        return None
    title = trim_brand(title)
    if len(title) < 8 or JUNK.search(title) or GENERIC_ANCHOR.match(title):
        return None
    return {'url': final if fmt == 'web' else href, 'title': title, 'date': date, 'format': fmt}


def crawl_firm(name, site, win):
    root = registrable(site['host'])
    rec = {'name': name, 'host': site['host'], 'site_title': site['title'], 'index': [], 'docs': [], 'err': None}
    st, final, ctype, raw = get(site['final'], limit=3_000_000)
    home = anchors(final, raw.decode('utf-8', 'replace'))

    def index_links(links, base):
        found = {}
        for href, label, _ in links:
            if not same_site(href, root) or href.rstrip('/') == base.rstrip('/'):
                continue
            path = urllib.parse.urlsplit(href).path
            lab_hit = INDEX_WORDS.search(label) and len(label) < 40
            if NOT_INDEX.search(label) or (NOT_INDEX.search(path) and not lab_hit):
                continue
            if lab_hit or INDEX_WORDS.search(path):
                key = fold(label + ' ' + href)
                found[href] = min(next((i for i, w in enumerate(INDEX_RANK) if w in key), 99), found.get(href, 99))
        return [h for h, _ in sorted(found.items(), key=lambda kv: kv[1])]

    idx = index_links(home, final)[:3]
    if not idx:  # nothing in the markup — a menu built by script: try the usual addresses once each
        for path in FALLBACK_PATHS:
            try:
                time.sleep(0.3)
                s2, f2, c2, _ = get(urllib.parse.urljoin(final, path), limit=3_000_000, timeout=15)
                if s2 == 200 and 'html' in c2 and f2.rstrip('/') != final.rstrip('/'):
                    idx.append(f2)
            except Exception:
                pass
            if len(idx) >= 2:
                break
    rec['index'] = idx

    pool, visited, queue = list(home), set(), list(idx)
    while queue and len(visited) < 5:  # the index pages, and one level of their own sub-sections
        h = queue.pop(0)
        if h in visited:
            continue
        visited.add(h)
        time.sleep(0.4)
        try:
            s2, f2, c2, r2 = get(h, limit=3_000_000)
            if 'html' in c2:
                got = anchors(f2, r2.decode('utf-8', 'replace'))
                pool += got
                if len(visited) <= 2:
                    queue += [x for x in index_links(got, f2)[:2] if x not in visited and x not in idx]
        except Exception:
            pass

    # One entry per address, pooling every link that points at it: the dated
    # "Read more" and the titled link are often two different anchors.
    merged = {}
    for href, label, ctx in pool:
        m = merged.setdefault(href, {'labels': [], 'ctx': []})
        if label:
            m['labels'].append(label)
        m['ctx'].append(ctx)
    idx_set = {i.rstrip('/') for i in idx}
    cands = []
    for href, m in merged.items():
        labels = [l for l in m['labels'] if not GENERIC_ANCHOR.match(l)]
        label = max(labels, key=len) if labels else ''
        every = ' '.join(m['labels'])
        pdf = href.lower().split('?')[0].endswith('.pdf')
        if not (same_site(href, root) or pdf):
            continue
        if JUNK.search(href + ' ' + every) or (NOT_INDEX.search(urllib.parse.urlsplit(href).path) and not pdf):
            continue
        if href.rstrip('/') in idx_set or href.rstrip('/') == final.rstrip('/'):
            continue
        if win.only_old(label + ' ' + href):
            continue
        dated = win.first(every) or next((win.first(c) for c in m['ctx'] if win.first(c)), None) or win.in_url.search(href)
        strong = STRONG.search(href + ' ' + every)
        if not dated and not (strong and len(label) >= 12):
            continue
        if not (pdf or DOCWORDS.search(href + ' ' + every) or len(urllib.parse.urlsplit(href).path) > 25):
            continue
        pri = 0 if re.search(r'letter', href + every, re.I) else 1 if re.search(r'commentar|quarterly|outlook|memo|missive', href + every, re.I) else 2
        cands.append((pri + (0 if dated else 2), href, label, ' '.join(m['ctx'])[:4000]))
    cands.sort(key=lambda c: c[0])
    for _, href, label, ctx in cands[:9]:
        time.sleep(0.4)
        try:
            d = open_doc(href, label, ctx, win)
            if d:
                rec['docs'].append(d)
        except Exception:
            pass
        if len(rec['docs']) >= 5:
            break
    return rec


def stage_docs(sites, work, threads, win):
    path = os.path.join(work, 'docs.jsonl')
    seen = set()
    if os.path.exists(path):
        seen = {json.loads(l)['name'] for l in open(path, encoding='utf-8') if l.strip()}
    todo = [(n, s) for n, s in sites.items() if s and n not in seen]
    lock = threading.Lock()
    with open(path, 'a', encoding='utf-8') as out:
        def one(item):
            name, site = item
            try:
                rec = crawl_firm(name, site, win)
            except Exception as e:
                rec = {'name': name, 'host': site['host'], 'site_title': site['title'], 'index': [], 'docs': [],
                       'err': f'{type(e).__name__}: {str(e)[:80]}'}
            with lock:
                out.write(json.dumps(rec, ensure_ascii=False) + '\n')
                out.flush()
            return rec
        n_ok = 0
        with cf.ThreadPoolExecutor(threads) as ex:
            for i, rec in enumerate(ex.map(one, todo)):
                n_ok += bool(rec['docs'])
                if i % 20 == 0:
                    print(f'docs {i + 1}/{len(todo)} firms-with-documents={n_ok}', flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('names', help='a text file, one firm name per line')
    ap.add_argument('--work', default=os.path.join(os.path.dirname(__file__), 'work'))
    ap.add_argument('--since', help='earliest document date, YYYY-MM-DD (default: nine months ago)')
    ap.add_argument('--stage', choices=['all', 'dns', 'sites', 'docs'], default='all')
    ap.add_argument('--threads', type=int, default=10, help='firms crawled at once (default 10)')
    args = ap.parse_args()
    os.makedirs(args.work, exist_ok=True)
    win = Window(since=args.since)
    names = [l.strip() for l in open(args.names, encoding='utf-8') if l.strip() and not l.startswith('#')]
    print(f'{len(names)} names; documents dated {win.since} to {win.until}', flush=True)
    dns_path = os.path.join(args.work, 'dns.json')
    dns = stage_dns(names, args.work) if args.stage in ('all', 'dns') else json.load(open(dns_path))
    print(f'dns done: {sum(1 for n in names if dns.get(n))} of {len(names)} names have an address', flush=True)
    if args.stage == 'dns':
        return
    sites_path = os.path.join(args.work, 'sites.json')
    sites = stage_sites(names, dns, args.work, args.threads) if args.stage in ('all', 'sites') else json.load(open(sites_path))
    print(f'sites done: {sum(1 for v in sites.values() if v)} confirmed', flush=True)
    if args.stage == 'sites':
        return
    stage_docs(sites, args.work, args.threads, win)
    print('done — now run tools/letters/review.py', flush=True)


if __name__ == '__main__':
    main()
