"""
Maz Vantage — the document corpus: ingest a company's SEC filings.

    python tools/corpus/ingest_edgar.py AAPL NVDA
    python tools/corpus/ingest_edgar.py AAPL --since 2023-10-01 --forms 10-K 10-Q

Takes the annual and quarterly reports, current reports (8-K) with their
press-release exhibits (EX-99), the proxy statement, and the subsidiaries
list (EX-21) from each 10-K. Raw HTML is cached under work/raw/ so a
re-run re-chunks without re-downloading. Filings already in the store are
skipped unless --refresh.
"""
import argparse
import json
import re
import sys
from datetime import date, timedelta

from common import RAW, WORK, chunk, get, html_to_text
from store import connect, has_doc, put

FORMS = ['10-K', '10-Q', '8-K', '8-K/A', 'DEF 14A']
EXHIBITS = {'8-K': re.compile(r'ex[-_]?99', re.I), '8-K/A': re.compile(r'ex[-_]?99', re.I), '10-K': re.compile(r'ex[-_]?21', re.I)}
ITEMS_8K = {
    '1.01': 'material agreement', '2.02': 'results of operations', '2.03': 'financial obligation',
    '5.02': 'officer change', '5.03': 'bylaws', '5.07': 'shareholder vote', '7.01': 'Regulation FD', '8.01': 'other events', '9.01': 'exhibits',
}


PILOT_CIKS = {'AAPL': 320193, 'NVDA': 1045810}


def cik_of(symbol):
    if symbol.upper() in PILOT_CIKS:
        return PILOT_CIKS[symbol.upper()]
    path = WORK / 'company_tickers.json'
    if not path.exists():
        WORK.mkdir(parents=True, exist_ok=True)
        path.write_text(get('https://www.sec.gov/files/company_tickers.json'), encoding='utf-8')
    for row in json.loads(path.read_text(encoding='utf-8')).values():
        if row['ticker'].upper() == symbol.upper():
            return int(row['cik_str'])
    raise SystemExit(f'No CIK for {symbol}')


def cached(symbol, acc, name, url):
    p = RAW / symbol / acc / name
    if p.exists():
        return p.read_text(encoding='utf-8', errors='replace')
    p.parent.mkdir(parents=True, exist_ok=True)
    body = get(url)
    p.write_text(body, encoding='utf-8')
    return body


def exhibit_kind(name):
    m = re.search(r'ex[-_]?(\d{2,3})(?:[-_.]?(\d{1,2}))?', name, re.I)
    if not m:
        return 'EX'
    major, minor = m.group(1), m.group(2)
    if len(major) == 3 and not minor:          # ex991 -> 99.1
        major, minor = major[:2], major[2:]
    return f'EX-{int(major)}.{int(minor or 1)}'


def ingest(db, symbol, since, forms, refresh):
    cik = cik_of(symbol)
    sub = json.loads(get(f'https://data.sec.gov/submissions/CIK{cik:010d}.json'))
    r = sub['filings']['recent']
    n_docs = n_chunks = 0
    for i, form in enumerate(r['form']):
        filed = r['filingDate'][i]
        if form not in forms or filed < since:
            continue
        acc, primary, period = r['accessionNumber'][i], r['primaryDocument'][i], r['reportDate'][i] or None
        base = f'https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace("-", "")}'
        items = [ITEMS_8K.get(x, x) for x in (r['items'][i] or '').split(',') if x and x != '9.01']
        title = f'{form} · {", ".join(items)}' if form.startswith('8-K') and items else f'{form}{" for " + period if period else ""}'
        targets = [(primary, form, title)]
        pat = EXHIBITS.get(form)
        if pat:
            try:
                idx = json.loads(get(f'{base}/index.json'))
                for it in idx['directory']['item']:
                    nm = it['name']
                    if pat.search(nm) and nm.lower().endswith(('.htm', '.html')) and nm != primary:
                        kind = exhibit_kind(nm)
                        targets.append((nm, kind, f'{kind} to {form} filed {filed}'))
            except Exception as e:  # an index we cannot read costs the exhibits, not the filing
                print(f'  ! {acc} index: {e}', file=sys.stderr)
        for name, kind, ttl in targets:
            doc_id = f'edgar:{acc}:{name}'
            if not refresh and has_doc(db, doc_id):
                continue
            try:
                text = html_to_text(cached(symbol, acc, name, f'{base}/{name}'))
            except Exception as e:
                print(f'  ! {acc}/{name}: {e}', file=sys.stderr)
                continue
            pieces = chunk(text)
            put(db, {'doc_id': doc_id, 'symbol': symbol, 'source': 'edgar', 'kind': kind, 'title': ttl,
                     'published_at': filed, 'period': period, 'url': f'{base}/{name}'}, pieces)
            n_docs += 1
            n_chunks += len(pieces)
            print(f'  {filed} {kind:<8} {len(pieces):>4} chunks  {name}')
    print(f'{symbol}: {n_docs} documents, {n_chunks} chunks added')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('symbols', nargs='+')
    ap.add_argument('--since', default=(date.today() - timedelta(days=3 * 365)).isoformat())
    ap.add_argument('--forms', nargs='+', default=FORMS)
    ap.add_argument('--refresh', action='store_true', help='re-chunk documents already in the store')
    a = ap.parse_args()
    db = connect()
    for s in a.symbols:
        ingest(db, s.upper(), a.since, set(a.forms), a.refresh)


if __name__ == '__main__':
    main()
