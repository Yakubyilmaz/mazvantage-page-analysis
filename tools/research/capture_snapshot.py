"""Capture everything a company's Research tab needs, for any symbol.

Writes three files under web/public/data/:

    <SYMBOL>.json            the bundled snapshot: every report feed, the peer
                             rows and the benchmark series, so the report renders
                             with no key (the same shape Settings -> Save
                             snapshot writes from a live session)
    history/<SYMBOL>.json    ten years of daily closes, split-adjusted, for
                             Valuation History and Our Record
    ownership.json           this symbol's 13F top holders and holder summary
                             for the last complete quarter (merged, other
                             symbols kept)

Two ways in (run from the repository root):

    # 1. live, with a key in the environment (never written to disk)
    FMP_API_KEY=... python tools/research/capture_snapshot.py live MSFT

    # 2. from replies saved out of the data connector in a session:
    #    tools/research/recover_connector.py writes them as
    #    <endpoint>_<SYMBOL>[_year_quarter][_period].json; files named after a
    #    feed (income.json, quote.json, ...) are read too.
    python tools/research/capture_snapshot.py dir MSFT path/to/replies

In dir mode a reply for another symbol is routed by what it is: TTM ratios,
TTM key metrics and growth rows for a peer go to the peer extras; daily
prices for SPY or the sector fund go to the benchmarks. The file names no
provider: it is served to readers.

Feeds and parameters mirror `FEEDS` in web/src/lib/fmp.ts — change one, change
both. One thing is deliberately left out of a snapshot by default:
`earnings` for a company that already has an edition on record, because it
rates `peNonGaapTtm` and moves the quant rating the edition was graded on
(pass --with-earnings to include it; a new company should include it).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'web' / 'public' / 'data'
BASE = 'https://financialmodelingprep.com/stable'

SECTOR_ETF = {
    'Technology': 'XLK', 'Communication Services': 'XLC', 'Consumer Cyclical': 'XLY', 'Consumer Defensive': 'XLP',
    'Healthcare': 'XLV', 'Financial Services': 'XLF', 'Industrials': 'XLI', 'Energy': 'XLE', 'Basic Materials': 'XLB',
    'Utilities': 'XLU', 'Real Estate': 'XLRE',
}
MARKET_ETF = 'SPY'
YEARS = 10

# feed -> (path, params(symbol, ctx), pick-first)
def feeds(ctx: dict) -> dict:
    q = ctx['lastQuarter']
    return {
        'quote': ('quote', lambda s: {'symbol': s}, True),
        'profile': ('profile', lambda s: {'symbol': s}, True),
        'ratiosTtm': ('ratios-ttm', lambda s: {'symbol': s}, True),
        'metricsTtm': ('key-metrics-ttm', lambda s: {'symbol': s}, True),
        'scores': ('financial-scores', lambda s: {'symbol': s}, True),
        'income': ('income-statement', lambda s: {'symbol': s, 'period': 'annual', 'limit': YEARS}, False),
        'balance': ('balance-sheet-statement', lambda s: {'symbol': s, 'period': 'annual', 'limit': YEARS}, False),
        'cashflow': ('cash-flow-statement', lambda s: {'symbol': s, 'period': 'annual', 'limit': YEARS}, False),
        'ratiosHist': ('ratios', lambda s: {'symbol': s, 'period': 'annual', 'limit': YEARS}, False),
        'metricsHist': ('key-metrics', lambda s: {'symbol': s, 'period': 'annual', 'limit': YEARS}, False),
        'growth': ('financial-growth', lambda s: {'symbol': s, 'period': 'annual', 'limit': YEARS}, False),
        'ownerEarnings': ('owner-earnings', lambda s: {'symbol': s, 'limit': 8}, False),
        'employees': ('historical-employee-count', lambda s: {'symbol': s, 'limit': 15}, False),
        'ratings': ('ratings-snapshot', lambda s: {'symbol': s}, True),
        'transcriptDates': ('earning-call-transcript-dates', lambda s: {'symbol': s}, False),
        'segProduct': ('revenue-product-segmentation', lambda s: {'symbol': s, 'period': 'annual', 'structure': 'flat'}, False),
        'segProductQ': ('revenue-product-segmentation', lambda s: {'symbol': s, 'period': 'quarter', 'structure': 'flat'}, False),
        'segGeography': ('revenue-geographic-segments', lambda s: {'symbol': s, 'period': 'annual', 'structure': 'flat'}, False),
        'estimates': ('analyst-estimates', lambda s: {'symbol': s, 'period': 'annual', 'limit': 6}, False),
        'priceTarget': ('price-target-consensus', lambda s: {'symbol': s}, True),
        'grades': ('grades-consensus', lambda s: {'symbol': s}, True),
        'dcfLevered': ('levered-discounted-cash-flow', lambda s: {'symbol': s}, True),
        'prices': ('historical-price-eod/light', lambda s: {'symbol': s, 'from': ctx['from6'], 'to': ctx['to']}, False),
        'dividends': ('dividends', lambda s: {'symbol': s, 'limit': 60}, False),
        'peers': ('stock-peers', lambda s: {'symbol': s}, False),
        'executives': ('key-executives', lambda s: {'symbol': s}, False),
        'execComp': ('governance-executive-compensation', lambda s: {'symbol': s}, False),
        'sharesFloat': ('shares-float', lambda s: {'symbol': s}, True),
        'insiderTrades': ('insider-trading/search', lambda s: {'symbol': s, 'limit': 100}, False),
        'insiderStats': ('insider-trading/statistics', lambda s: {'symbol': s}, False),
        'institutional': ('institutional-ownership/extract-analytics/holder',
                          lambda s: {'symbol': s, 'year': q['year'], 'quarter': q['quarter'], 'limit': 20}, False),
        'news': ('news/stock', lambda s: {'symbols': s, 'limit': 100}, False),
        'pressReleases': ('news/press-releases', lambda s: {'symbols': s, 'limit': 50}, False),
        'earnings': ('earnings', lambda s: {'symbol': s, 'limit': 12}, False),
        'incomeQ': ('income-statement', lambda s: {'symbol': s, 'period': 'quarter', 'limit': 12}, False),
        'cashflowQ': ('cash-flow-statement', lambda s: {'symbol': s, 'period': 'quarter', 'limit': 12}, False),
        'gradesHistorical': ('historical-grades', lambda s: {'symbol': s, 'limit': 24}, False),
        'targetSummary': ('price-target-summary', lambda s: {'symbol': s}, True),
        'holdersSummary': ('institutional-ownership/symbol-positions-summary',
                           lambda s: {'symbol': s, 'year': q['year'], 'quarter': q['quarter']}, True),
        'gradeActions': ('grades', lambda s: {'symbol': s}, False),
        'secFilings': ('sec-filings-search/symbol', lambda s: {'symbol': s, 'from': ctx['from2'], 'to': ctx['to'], 'page': 0, 'limit': 300}, False),
        'marketCapHist': ('historical-market-capitalization', lambda s: {'symbol': s, 'from': ctx['from3'], 'to': ctx['to'], 'limit': 1000}, False),
        'insiderHistory': ('insider-trading/search', lambda s: {'symbol': s, 'page': 0, 'limit': 500}, False),
    }

# The data connector's endpoint names -> feeds. `period` splits annual from quarterly.
CONNECTOR = {
    ('income-statement', 'annual'): 'income', ('income-statement', 'quarter'): 'incomeQ',
    ('balance-sheet-statement', 'annual'): 'balance',
    ('cashflow-statement', 'annual'): 'cashflow', ('cashflow-statement', 'quarter'): 'cashflowQ',
    ('metrics-ratios', 'annual'): 'ratiosHist', ('key-metrics', 'annual'): 'metricsHist',
    ('metrics-ratios-ttm', None): 'ratiosTtm', ('key-metrics-ttm', None): 'metricsTtm',
    ('financial-scores', None): 'scores', ('financial-statement-growth', 'annual'): 'growth',
    ('financial-statement-growth', None): 'growth', ('owner-earnings', None): 'ownerEarnings',
    ('revenue-product-segmentation', 'annual'): 'segProduct', ('revenue-product-segmentation', 'quarter'): 'segProductQ',
    ('revenue-geographic-segments', 'annual'): 'segGeography',
    ('quote', None): 'quote', ('profile-symbol', None): 'profile', ('peers', None): 'peers',
    ('company-executives', None): 'executives', ('executive-compensation', None): 'execComp',
    ('historical-employee-count', None): 'employees', ('shares-float', None): 'sharesFloat',
    ('historical-market-cap', None): 'marketCapHist',
    ('financial-estimates', 'annual'): 'estimates', ('price-target-consensus', None): 'priceTarget',
    ('grades-summary', None): 'grades', ('historical-grades', None): 'gradesHistorical',
    ('price-target-summary', None): 'targetSummary', ('ratings-snapshot', None): 'ratings', ('grades', None): 'gradeActions',
    ('historical-price-eod-light', None): 'prices', ('earnings-company', None): 'earnings',
    ('dividends-company', None): 'dividends', ('insider-trade-statistics', None): 'insiderStats',
    ('search-insider-trades', None): 'insiderTrades', ('positions-summary', None): 'holdersSummary',
    ('filings-extract-with-analytics-by-holder', None): 'institutional', ('search-stock-news', None): 'news',
    ('search-press-releases', None): 'pressReleases', ('transcripts-dates-by-symbol', None): 'transcriptDates',
}
PICK = {'quote', 'profile', 'ratiosTtm', 'metricsTtm', 'scores', 'ratings', 'priceTarget', 'grades', 'dcfLevered',
        'sharesFloat', 'targetSummary', 'holdersSummary'}


def context(today: dt.date) -> dict:
    ago = lambda days: (today - dt.timedelta(days=days)).isoformat()
    # The newest 13F quarter whose filings are all in: 47 days after quarter end (lastCompleteQuarter in fmp.ts).
    y, qn = today.year, (today.month - 1) // 3 + 1
    for _ in range(8):
        qn -= 1
        if qn == 0:
            qn, y = 4, y - 1
        end = dt.date(y, qn * 3, 1) + dt.timedelta(days=31)
        end = end.replace(day=1) - dt.timedelta(days=1)
        if today >= end + dt.timedelta(days=47):
            break
    return {'to': today.isoformat(), 'from6': ago(6 * 365), 'from3': ago(3 * 365 + 45), 'from2': ago(730),
            'from10': ago(10 * 365 + 30), 'lastQuarter': {'year': y, 'quarter': qn}}


def pick(name: str, data):
    return (data[0] if data else None) if name in PICK and isinstance(data, list) else data


def get(path: str, params: dict, key: str):
    qs = urllib.parse.urlencode({**params, 'apikey': key})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(f'{BASE}/{path}?{qs}', timeout=60) as res:
                return json.loads(res.read().decode('utf-8'))
        except Exception as e:  # noqa: BLE001 — report and carry on; a missing feed degrades, it does not fail the capture
            if attempt == 2:
                print(f'  {path}: {e}', file=sys.stderr)
                return None
            time.sleep(1.5 * (attempt + 1))


def live(symbol: str, args) -> dict:
    key = os.environ.get('FMP_API_KEY')
    if not key:
        sys.exit('Set FMP_API_KEY in the environment; it is never written to disk.')
    ctx = context(dt.date.today())
    out = {'feeds': {}, 'peers': {'ratios': {}, 'metrics': {}, 'growth': {}}, 'bench': {}, 'history': None}
    for name, (path, params, _) in feeds(ctx).items():
        if name == 'earnings' and not args.with_earnings:
            continue
        data = get(path, params(symbol), key)
        if data not in (None, [], {}):
            out['feeds'][name] = pick(name, data)
            print(f'  {name}')
    if out['feeds'].get('dcfLevered') is None:
        alt = get('levered-discounted-cash-flow', {'symbol': symbol}, key)
        if alt:
            out['feeds']['dcfLevered'] = pick('dcfLevered', alt)
    for p in [r.get('symbol') for r in (out['feeds'].get('peers') or [])[:8] if r.get('symbol')]:
        r = get('ratios-ttm', {'symbol': p}, key)
        m = get('key-metrics-ttm', {'symbol': p}, key)
        g = get('financial-growth', {'symbol': p, 'period': 'annual', 'limit': 1}, key)
        if r: out['peers']['ratios'][p] = pick('ratiosTtm', r)
        if m: out['peers']['metrics'][p] = pick('metricsTtm', m)
        if g: out['peers']['growth'][p] = g[0]
    sector = (out['feeds'].get('profile') or {}).get('sector')
    for role, etf in (('market', MARKET_ETF), ('industry', SECTOR_ETF.get(sector))):
        if etf:
            series = get('historical-price-eod/light', {'symbol': etf, 'from': ctx['from6'], 'to': ctx['to']}, key)
            if series:
                out['bench'][role] = series
                out.setdefault('etfs', {})[role] = etf
    out['history'] = get('historical-price-eod/light', {'symbol': symbol, 'from': ctx['from10'], 'to': ctx['to']}, key)
    holders = get('institutional-ownership/extract-analytics/holder',
                  {'symbol': symbol, 'year': ctx['lastQuarter']['year'], 'quarter': ctx['lastQuarter']['quarter'], 'limit': 40}, key)
    out['holders'] = holders
    return out


NAME = re.compile(r'^(?P<endpoint>[a-z0-9-]+?)_(?P<symbol>[A-Z0-9.^-]+)(?:_(?P<year>\d{4})_(?P<quarter>\d))?(?:_(?P<period>annual|quarter|FY|Q\d))?$')


def from_dir(symbol: str, folder: Path, args) -> dict:
    out = {'feeds': {}, 'peers': {'ratios': {}, 'metrics': {}, 'growth': {}}, 'bench': {}, 'history': None, 'holders': None}
    for f in sorted(folder.glob('*.json')):
        data = json.loads(f.read_text(encoding='utf-8'))
        stem = f.stem
        if stem in feeds(context(dt.date.today())) or stem == 'dcfLevered':
            out['feeds'][stem] = pick(stem, data)
            if stem == 'prices':
                out['history'] = data
            continue
        m = NAME.match(stem)
        if not m:
            print(f'  skipped {f.name}: not a feed name or a connector reply name')
            continue
        endpoint, sym, period = m['endpoint'], m['symbol'], m['period']
        if endpoint == 'historical-price-eod-light' and sym != symbol:
            role = 'market' if sym == MARKET_ETF else 'industry'
            out['bench'][role] = data
            out.setdefault('etfs', {})[role] = sym
            continue
        if sym != symbol:
            if endpoint == 'metrics-ratios-ttm': out['peers']['ratios'][sym] = pick('ratiosTtm', data)
            elif endpoint == 'key-metrics-ttm': out['peers']['metrics'][sym] = pick('metricsTtm', data)
            elif endpoint == 'financial-statement-growth' and data: out['peers']['growth'][sym] = data[0]
            else: print(f'  skipped {f.name}: another symbol')
            continue
        if endpoint == 'filings-extract-with-analytics-by-holder':
            out['holders'] = data
        feed = CONNECTOR.get((endpoint, period)) or CONNECTOR.get((endpoint, None))
        if not feed:
            print(f'  skipped {f.name}: no feed for {endpoint}/{period}')
            continue
        if feed == 'earnings' and not args.with_earnings:
            print(f'  left out {f.name}: earnings (pass --with-earnings)')
            continue
        if feed == 'prices':
            out['history'] = data  # the longest series given is the history; the snapshot keeps six years of it
        out['feeds'][feed] = pick(feed, data)
        print(f'  {feed} <- {f.name}')
    return out


def write(symbol: str, cap: dict, today: str, data: Path = DATA) -> None:
    feeds_ = cap['feeds']
    rows = sorted((r for r in (cap.get('history') or []) if r.get('date') and r.get('price') is not None), key=lambda r: r['date'])
    hist = [(r['date'], r['price']) for r in rows]
    if hist:
        six = (dt.date.fromisoformat(today) - dt.timedelta(days=6 * 365)).isoformat()
        # Six years, as a live report fetches; the rows as the feed gave them (with volume), newest last.
        feeds_['prices'] = [r for r in rows if r['date'] >= six]
        (data / 'history').mkdir(parents=True, exist_ok=True)
        hpath = data / 'history' / f'{symbol}.json'
        old = json.loads(hpath.read_text(encoding='utf-8')).get('closes', []) if hpath.exists() else []
        # Never trade a longer saved history for a shorter capture.
        if not old or hist[0][0] <= old[0][0]:
            hpath.write_text(json.dumps({
                'symbol': symbol, 'capturedAt': today,
                'about': 'Daily closes, split-adjusted. Dividends are not added back.',
                'closes': [[d, p] for d, p in hist]}, separators=(',', ':')), encoding='utf-8')
        else:
            print(f'  history/{symbol}.json kept: it reaches back to {old[0][0]}, this capture only to {hist[0][0]}')
    etfs = cap.get('etfs') or {}
    if cap['bench']:
        cap['bench']['note'] = (f"Sector benchmark: {etfs['industry']}. Market benchmark: {etfs.get('market', MARKET_ETF)}."
                                if etfs.get('industry') else f"Market benchmark: {etfs.get('market', MARKET_ETF)}.")
    snap = {
        'symbol': symbol, 'capturedAt': today,
        'note': f'Captured {today} for the bundled report; feeds absent here returned nothing and read "not assessed".',
        'extras': {'peerRatios': cap['peers']['ratios'], 'peerMetrics': cap['peers']['metrics'], 'peerGrowth': cap['peers']['growth'],
                   'peersCapturedAt': today, 'benchmarks': cap['bench']},
        'feeds': feeds_, 'feedDates': {},
    }
    (data / f'{symbol}.json').write_text(json.dumps(snap, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{symbol}.json: {len(feeds_)} feeds, {len(cap["peers"]["ratios"])} peers, benchmarks {sorted(cap["bench"])}, {len(hist)} closes')

    summary, holders = feeds_.get('holdersSummary'), cap.get('holders')
    if summary or holders:
        path = data / 'ownership.json'
        own = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'symbols': {}}
        keep = ['investorName', 'cik', 'filingDate', 'sharesNumber', 'lastSharesNumber', 'changeInSharesNumberPercentage',
                'marketValue', 'ownership', 'isNew', 'isSoldOut', 'firstAdded', 'putCallShare']
        rows = [{k: h.get(k) for k in keep} for h in (holders or []) if h.get('putCallShare', 'Share') == 'Share']
        sk = ['date', 'investorsHolding', 'lastInvestorsHolding', 'numberOf13Fshares', 'lastNumberOf13Fshares', 'ownershipPercent',
              'lastOwnershipPercent', 'newPositions', 'closedPositions', 'increasedPositions', 'reducedPositions', 'putCallRatio', 'lastPutCallRatio']
        entry = own['symbols'].get(symbol, {})
        if summary: entry['summary'] = {k: summary.get(k) for k in sk}
        if rows: entry['holders'] = sorted(rows, key=lambda h: -(h.get('marketValue') or 0))[:12]
        own['symbols'][symbol] = entry
        own['capturedAt'] = today
        if summary and summary.get('date'): own['quarter'] = summary['date']
        path.write_text(json.dumps(own, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'ownership.json: {symbol} {"summary " if summary else ""}{len(rows)} holders')


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('mode', choices=['live', 'dir'])
    p.add_argument('symbol')
    p.add_argument('folder', nargs='?')
    p.add_argument('--with-earnings', action='store_true', help='include the earnings feed (moves the quant rating)')
    p.add_argument('--date', help='the capture date to record, default today')
    p.add_argument('--out', help='write into this folder instead of web/public/data (for a trial run)')
    args = p.parse_args()
    sym = args.symbol.upper()
    if args.mode == 'dir' and not args.folder:
        p.error('dir mode needs the folder of saved replies')
    cap = live(sym, args) if args.mode == 'live' else from_dir(sym, Path(args.folder), args)
    write(sym, cap, args.date or dt.date.today().isoformat(), Path(args.out) if args.out else DATA)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
