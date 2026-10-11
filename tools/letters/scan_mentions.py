"""
Maz Vantage — Letters & Outlooks: which documents discuss which companies.

The library's `mentions` were read off titles and trade lists ("we bought…",
"we sold…"), so a letter that spends three paragraphs on Apple without trading
it never showed up on Apple's page. This reads each document's own text and
lists every passage that names a company on the watch list, for a person to
read and turn into a mention with a stance and a one-line view of our own.

It writes nothing the app reads. The text and the passages stay in `work/`,
which is git-ignored: the documents are the firms' copyright, and the library
links to them rather than hosting them. What goes into `letters.ts` is a
ticker, an action, a stance and a sentence we wrote.

    python tools/letters/scan_mentions.py fetch     # text of every document → work/text/
    python tools/letters/scan_mentions.py scan      # passages → work/mentions-scan.json and .txt
    python tools/letters/scan_mentions.py scan --ticker AAPL

`work/library.json` is the library as the app holds it (exported by the
letters test helper — see the README). Standard library plus `pdftotext`.
"""
import argparse
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
from common import get, text  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'work')
TEXT = os.path.join(WORK, 'text')

# Companies to look for, by the names a letter would use. Case-sensitive and
# whole-word, so "Meta" is not "metadata" and "Apple" is not "pineapple".
# Names that are ordinary words in a sentence — Target, Block, Shell, Visa,
# Oracle at the start of one — are left out rather than guessed at; the
# existing mentions' own names are added below at run time.
WATCH = {
    'AAPL': ['Apple'], 'MSFT': ['Microsoft'], 'NVDA': ['Nvidia', 'NVIDIA'], 'GOOGL': ['Alphabet', 'Google'],
    'AMZN': ['Amazon'], 'META': ['Meta Platforms', 'Meta', 'Facebook'], 'TSLA': ['Tesla'], 'AVGO': ['Broadcom'],
    'TSM': ['TSMC', 'Taiwan Semiconductor'], 'BRK-B': ['Berkshire Hathaway', 'Berkshire'], 'JPM': ['JPMorgan Chase'],
    'LLY': ['Eli Lilly', 'Lilly'], 'V': ['Visa Inc'], 'MA': ['Mastercard'], 'UNH': ['UnitedHealth'], 'XOM': ['ExxonMobil', 'Exxon'],
    'COST': ['Costco'], 'WMT': ['Walmart'], 'NFLX': ['Netflix'], 'ORCL': ['Oracle Corp', 'Oracle’s', "Oracle's"], 'AMD': ['Advanced Micro Devices', 'AMD'],
    'ADBE': ['Adobe'], 'CRM': ['Salesforce'], 'INTC': ['Intel'], 'QCOM': ['Qualcomm'], 'NKE': ['Nike'], 'SBUX': ['Starbucks'],
    'MCD': ['McDonald’s', "McDonald's"], 'KO': ['Coca-Cola'], 'PEP': ['PepsiCo'], 'PG': ['Procter & Gamble'], 'JNJ': ['Johnson & Johnson'],
    'NVO': ['Novo Nordisk'], 'ASML': ['ASML'], 'PLTR': ['Palantir'], 'UBER': ['Uber'], 'SHOP': ['Shopify'], 'MU': ['Micron'],
    'BA': ['Boeing'], 'GE': ['GE Aerospace'], 'GEV': ['GE Vernova'], 'CAT': ['Caterpillar'], 'DIS': ['Disney'], 'IBM': ['IBM'],
    'GS': ['Goldman Sachs'], 'MS': ['Morgan Stanley'], 'BAC': ['Bank of America'], 'BX': ['Blackstone'], 'KKR': ['KKR'],
    'SPGI': ['S&P Global'], 'MCO': ["Moody's", 'Moody’s'], 'BKNG': ['Booking Holdings'], 'ABNB': ['Airbnb'], 'PYPL': ['PayPal'],
    'ARM': ['Arm Holdings'], 'SMCI': ['Supermicro', 'Super Micro'], 'ANET': ['Arista'], 'CRWD': ['CrowdStrike'], 'NOW': ['ServiceNow'],
    'INTU': ['Intuit'], 'ZTS': ['Zoetis'], 'ISRG': ['Intuitive Surgical'], 'MRK': ['Merck'], 'PFE': ['Pfizer'], 'ABBV': ['AbbVie'],
    'TXN': ['Texas Instruments'], 'LRCX': ['Lam Research'], 'AMAT': ['Applied Materials'], 'KLAC': ['KLA Corp'], 'CSCO': ['Cisco'],
    'BABA': ['Alibaba'], 'PDD': ['PDD Holdings', 'Temu'], 'TCEHY': ['Tencent'], 'SONY': ['Sony'], 'TM': ['Toyota'], 'SAP': ['SAP'],
    'APP': ['AppLovin'], 'COIN': ['Coinbase'], 'HOOD': ['Robinhood'], 'CMG': ['Chipotle'], 'LULU': ['Lululemon'], 'TJX': ['TJX'],
}

SENT = re.compile(r'(?<=[.!?])\s+(?=[A-Z“"‘(])')


def load_library():
    with open(os.path.join(WORK, 'library.json'), encoding='utf-8') as f:
        return json.load(f)


def patterns(library):
    pats = {t: list(n) for t, n in WATCH.items()}
    for l in library['letters']:
        for m in l.get('mentions') or []:
            if m.get('ticker') and m['name'] not in pats.setdefault(m['ticker'], []):
                pats[m['ticker']].append(m['name'])
    return {t: re.compile(r'(?<![\w-])(' + '|'.join(re.escape(n) for n in sorted(ns, key=len, reverse=True)) + r')(?![\w-])')
            for t, ns in pats.items()}


# ---------------------------------------------------------------- fetch

_last, _lock = {}, threading.Lock()


def polite(host, gap=2.0):
    """One request per host every `gap` seconds."""
    while True:
        with _lock:
            wait = _last.get(host, 0) + gap - time.time()
            if wait <= 0:
                _last[host] = time.time()
                return
        time.sleep(wait)


def pdf_text(raw):
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
        f.write(raw)
        path = f.name
    try:
        out = subprocess.run(['pdftotext', '-enc', 'UTF-8', path, '-'], capture_output=True, timeout=120)
        return out.stdout.decode('utf-8', 'replace')
    finally:
        os.unlink(path)


def page_text(raw):
    s = raw.decode('utf-8', 'replace')
    s = re.sub(r'<(script|style|noscript|svg|nav|footer|header)\b.*?</\1>', ' ', s, flags=re.S | re.I)
    return text(s)


def fetch_one(l):
    dest = os.path.join(TEXT, f"{l['id']}.txt")
    if os.path.exists(dest) and os.path.getsize(dest) > 200:
        return l['id'], 'cached'
    url = l.get('pdf') or l['url']
    polite(urllib.parse.urlsplit(url).netloc)
    try:
        status, final, ctype, raw = get(url, limit=25_000_000, timeout=40)
    except Exception as e:  # noqa: BLE001 — any failure is reported, the run continues
        return l['id'], f'error {type(e).__name__}: {e}'[:120]
    body = pdf_text(raw) if ('pdf' in ctype.lower() or raw[:5] == b'%PDF-') else page_text(raw)
    if len(body) < 200:
        return l['id'], f'empty ({len(body)} chars, {ctype})'
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(body)
    return l['id'], f'ok {len(body)} chars'


def stage_fetch(library, threads):
    os.makedirs(TEXT, exist_ok=True)
    report = {}
    with ThreadPoolExecutor(threads) as pool:
        for i, (lid, status) in enumerate(pool.map(fetch_one, library['letters']), 1):
            report[lid] = status
            print(f'[{i}/{len(library["letters"])}] {lid}: {status}', flush=True)
    with open(os.path.join(WORK, 'fetch-report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1)
    ok = sum(1 for s in report.values() if s.startswith(('ok', 'cached')))
    print(f'\n{ok} of {len(report)} documents read')


# ---------------------------------------------------------------- scan

def stage_scan(library, only=None, per=4):
    pats = patterns(library)
    if only:
        pats = {t: p for t, p in pats.items() if t in only}
    out, lines = [], []
    for l in library['letters']:
        path = os.path.join(TEXT, f"{l['id']}.txt")
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            body = re.sub(r'\s+', ' ', html.unescape(f.read()))
        sentences = SENT.split(body)
        for ticker, rx in pats.items():
            hits = [s.strip() for s in sentences if rx.search(s)]
            if not hits:
                continue
            row = {'id': l['id'], 'firm': l['firm'], 'kind': l['kind'], 'date': l['date'], 'title': l['title'],
                   'ticker': ticker, 'count': len(hits), 'passages': [h[:600] for h in hits[:per]]}
            out.append(row)
            lines.append(f"\n=== {ticker} · {l['firm']} · {l['kind']} · {l['date']} · {l['id']} · {len(hits)} sentence(s)\n"
                         + '\n'.join(f'  - {h[:600]}' for h in hits[:per]))
    out.sort(key=lambda r: (r['ticker'], -r['count']))
    with open(os.path.join(WORK, 'mentions-scan.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    with open(os.path.join(WORK, 'mentions-scan.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    by = {}
    for r in out:
        by[r['ticker']] = by.get(r['ticker'], 0) + 1
    print(f'{len(out)} (document, company) pairs; most discussed: '
          + ', '.join(f'{t} {n}' for t, n in sorted(by.items(), key=lambda x: -x[1])[:15]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('stage', choices=['fetch', 'scan'])
    ap.add_argument('--threads', type=int, default=6)
    ap.add_argument('--ticker', action='append')
    a = ap.parse_args()
    library = load_library()
    if a.stage == 'fetch':
        stage_fetch(library, a.threads)
    else:
        stage_scan(library, set(a.ticker) if a.ticker else None)


if __name__ == '__main__':
    main()
