#!/usr/bin/env python3
"""
Maz Vantage — Letters & Outlooks: turn a crawl into entries a person can check.

    python tools/letters/review.py
    python tools/letters/review.py --work tools/letters/work --deny "River Global"

Reads the crawler's work folder, applies the checks in quality.py, drops what
the library already has (by address, and firms by website or name), and writes:

  work/review.txt        every firm kept: its website, the site's own title and the
                         documents found. READ IT. The automatic checks catch most
                         same-name companies, not all — on the first run eight more
                         had to be removed by hand (a UK house buyer, a Bitcoin
                         exchange, an M&A adviser...).
  work/deny.txt          one firm name per line (as written in the names file) to
                         strike after reading review.txt; rerun this script after editing it.
  work/new-entries.ts    the firms and documents as TypeScript objects, to paste at the
                         end of INDEX_FIRMS and INDEX_LETTERS in web/src/lib/letters-index.ts.

Every document comes out with `auto: true`, which the page shows as "Filed
automatically": its kind, topics and regions were guessed from the title.
"""
import argparse
import json
import os
import re

from common import fold, registrable
from quality import classify, clean, doc_ok, site_is_firm

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LIB = [os.path.join(ROOT, 'web', 'src', 'lib', f) for f in ('letters.ts', 'letters-index.ts')]

LEGAL_TAIL = re.compile(r',?\s+(LLC|L\.L\.C\.|Ltd\.?|Limited|LP|L\.P\.|LLP|Inc\.?|Pty\.?( Ltd\.?| Limited)?|Pte\.? Ltd\.?|GmbH|AG|plc|'
                        r'S\.A\.|B\.V\.|AB|SAU|SGIIC SAU|\(Pty\) Ltd)\s*$', re.I)
MEDIA_PATH = re.compile(r'/(webcasts?|webinars?|podcasts?|videos?|events?|press|news-releases?)/', re.I)
NAV = re.compile(r'^(home|insights?|news|blog|research|letters?|commentary|about( us)?|contact( us)?|our team|team|perspectives|'
                 r'publications|library|articles|investor letters|quarterly letters|fund letters|menu|search)$', re.I)


def display_name(n):
    n = n.split(' / ')[0].strip()
    for _ in range(2):
        n = LEGAL_TAIL.sub('', n).strip().rstrip(',')
    return n


def name_key(n):
    return re.sub(r'[^a-z0-9]', '', fold(display_name(n)))


def slug(s):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', fold(s))).strip('-')[:40]


def firm_type(name, site_title):
    n, t = fold(name), fold(name + ' ' + site_title)
    if re.search(r'\bresearch\b', n) and not re.search(r'capital|asset|management|investment|fund|partners', n):
        return 'independent'
    if re.search(r'partnership|\bl\.?p\.?\b|hedge|short', n) or re.search(r'hedge fund|investment partnership', t):
        return 'hedge-fund'
    return 'asset-manager'


def home_label(url):
    p = fold(url)
    for w, lab in [('letter', 'Letters'), ('commentar', 'Commentary'), ('insight', 'Insights'), ('perspective', 'Perspectives'),
                   ('research', 'Research'), ('memo', 'Memos'), ('blog', 'Blog'), ('news', 'News'), ('article', 'Articles')]:
        if w in p:
            return lab
    return 'Website'


def library():
    """What the library already holds: addresses, ids, and firms by website and by name."""
    urls, ids, by_domain, by_name = set(), set(), {}, {}
    for path in LIB:
        ts = open(path, encoding='utf-8').read()
        urls |= set(re.findall(r'(?:url|pdf): ["\']([^"\']+)["\']', ts))
        ids |= set(re.findall(r'\bid: ["\']([^"\']+)["\']', ts))
        for chunk in ts.split('{ key: ')[1:]:
            m = re.match(r'["\']([^"\']+)["\'], name: ', chunk)  # a firm object, not a type annotation or a vocabulary row
            if not m:
                continue
            key = m.group(1)
            name = re.search(r'name: ["\']([^"\']+)', chunk)
            home = re.search(r'home: ["\']https?://([^/"\']+)', chunk)
            if name:
                by_name[name_key(name.group(1))] = key
            if home:
                by_domain[registrable(home.group(1))] = key
    return urls, ids, by_domain, by_name


def q(s):
    return json.dumps(s, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--work', default=os.path.join(os.path.dirname(__file__), 'work'))
    ap.add_argument('--deny', action='append', default=[], help='a firm name to strike (repeatable); see also work/deny.txt')
    args = ap.parse_args()

    deny_path = os.path.join(args.work, 'deny.txt')
    if not os.path.exists(deny_path):
        open(deny_path, 'w', encoding='utf-8').write('# one firm name per line, as in the names file\n')
    deny = {fold(l.strip()) for l in open(deny_path, encoding='utf-8') if l.strip() and not l.startswith('#')}
    deny |= {fold(d) for d in args.deny}

    urls, ids, by_domain, by_name = library()
    records = {}
    for line in open(os.path.join(args.work, 'docs.jsonl'), encoding='utf-8'):
        if line.strip():
            r = json.loads(line)
            if r['name'] not in records or (r['docs'] and not records[r['name']]['docs']):
                records[r['name']] = r

    stats = {'firms crawled': len(records), 'wrong or denied site': 0, 'documents dropped': 0}
    firms_out, letters_out, report = [], [], []
    used_keys = set(by_domain.values()) | set(by_name.values())
    for rec in records.values():
        if fold(rec['name']) in deny or not site_is_firm(rec['name'], rec['host'], rec['site_title'] or ''):
            stats['wrong or denied site'] += 1
            continue
        name = display_name(rec['name'])
        docs, titles = [], set()
        for d in rec['docs']:
            t = clean(d['title'])
            if (d['url'] in urls or NAV.match(t) or not doc_ok(t, name) or fold(t) in titles or MEDIA_PATH.search(d['url'])
                    or d['url'].rstrip('/') in [i.rstrip('/') for i in rec['index']]):
                stats['documents dropped'] += 1
                continue
            titles.add(fold(t))
            urls.add(d['url'])
            docs.append({**d, 'title': t})
        if not docs:
            continue
        dom = registrable(rec['host'])
        key = by_domain.get(dom) or by_name.get(name_key(name))
        merged = bool(key)
        if not key:
            key = base = slug(name) or slug(dom)
            n = 2
            while key in used_keys:
                key, n = f'{base}-{n}', n + 1
            used_keys.add(key)
            by_domain[dom] = key
            home = rec['index'][0] if rec['index'] else f"https://{rec['host']}/"
            firms_out.append(f"  {{ key: {q(key)}, name: {q(name)}, type: {q(firm_type(name, rec['site_title'] or ''))}, "
                             f"home: {q(home)}, homeLabel: {q(home_label(home))} }},")
        report.append(f"{rec['name']}  ->  {rec['host']}  ({'adds to ' + key if merged else 'new firm ' + key})\n"
                      f"    site title: {rec['site_title']}")
        for d in docs:
            kind, topics, regions = classify(d['title'], d['url'])
            i = base = f"{key}-{slug(d['title'])}"
            n = 2
            while i in ids:
                i, n = f'{base}-{n}', n + 1
            ids.add(i)
            letters_out.append(f"  {{ id: {q(i)}, firm: {q(key)}, kind: {q(kind)}, title: {q(d['title'])}, date: {q(d['date'])}, "
                               f"url: {q(d['url'])}, format: {q(d['format'])}, auto: true, topics: {q(topics)}, regions: {q(regions)} }},")
            report.append(f"    {d['date']:<10}  {kind:<8}  {d['title'][:90]}\n                {d['url']}")
    stats['new firms'] = len(firms_out)
    stats['documents kept'] = len(letters_out)

    open(os.path.join(args.work, 'review.txt'), 'w', encoding='utf-8').write(
        'Read every firm below. Strike a wrong company by adding its name to deny.txt, then rerun review.py.\n\n'
        + '\n'.join(report) + '\n')
    open(os.path.join(args.work, 'new-entries.ts'), 'w', encoding='utf-8').write(
        '// Paste at the end of INDEX_FIRMS in web/src/lib/letters-index.ts:\n' + '\n'.join(firms_out)
        + '\n\n// Paste at the end of INDEX_LETTERS:\n' + '\n'.join(letters_out) + '\n')
    for k, v in stats.items():
        print(f'{k}: {v}')
    print(f"wrote {os.path.join(args.work, 'review.txt')} and new-entries.ts")


if __name__ == '__main__':
    main()
