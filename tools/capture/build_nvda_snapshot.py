"""
Assemble the bundled NVDA snapshot from feeds read through the authenticated
market-data connector on 2026-10-10 (the same feeds a live session pulls).

    python tools/capture/build_nvda_snapshot.py <capture-dir> web/public/data/NVDA.json web/public/data/AAPL.json

<capture-dir> holds the feed files as captured: income.json, balance.json,
cashflow.json, ratiosHist.json, metricsHist.json, small1.json (segments,
scores, growth), small2.json (quote, profile, TTM rows, estimates, targets,
grades, levered DCF, peers and peer rows) and prices.csv (date,price,volume).

Two deliberate choices, both recorded in tools/capture/README.md:
- the peer list keeps the six listed chip designers from the vendor's list
  (AMD, Broadcom, Intel, Qualcomm, Arm, Marvell) and drops the sub-US$1b and
  non-chip names it also returned;
- the market and sector benchmark series are AAPL's, because both companies
  sit in Technology and those series are the same index and sector fund.
"""
import json
import sys
from pathlib import Path

R_FIELDS = ['grossProfitMarginTTM', 'ebitMarginTTM', 'ebitdaMarginTTM', 'operatingProfitMarginTTM', 'netProfitMarginTTM',
            'currentRatioTTM', 'quickRatioTTM', 'cashRatioTTM', 'priceToEarningsRatioTTM', 'priceToEarningsGrowthRatioTTM',
            'priceToBookRatioTTM', 'priceToSalesRatioTTM', 'priceToFreeCashFlowRatioTTM', 'priceToOperatingCashFlowRatioTTM',
            'debtToAssetsRatioTTM', 'debtToEquityRatioTTM', 'financialLeverageRatioTTM', 'longTermDebtToCapitalRatioTTM',
            'interestCoverageRatioTTM', 'solvencyRatioTTM', 'debtServiceCoverageRatioTTM', 'enterpriseValueMultipleTTM',
            'dividendYieldTTM', 'dividendPayoutRatioTTM', 'assetTurnoverTTM', 'fixedAssetTurnoverTTM', 'effectiveTaxRateTTM',
            'freeCashFlowOperatingCashFlowRatioTTM']
M_FIELDS = ['returnOnInvestedCapitalTTM', 'returnOnEquityTTM', 'returnOnAssetsTTM', 'freeCashFlowYieldTTM', 'earningsYieldTTM',
            'evToSalesTTM', 'evToEBITDATTM', 'netDebtToEBITDATTM', 'researchAndDevelopementToRevenueTTM',
            'stockBasedCompensationToRevenueTTM', 'capexToRevenueTTM']
CAPTURED = '2026-10-10'


def main(src, out, aapl):
    d = Path(src)
    load = lambda n: json.loads((d / n).read_text(encoding='utf-8'))
    s1, s2 = load('small1.json'), load('small2.json')
    prices = []
    for line in (d / 'prices.csv').read_text(encoding='utf-8').split():
        date, price, vol = line.split(',')
        prices.append({'symbol': 'NVDA', 'date': date, 'price': float(price), 'volume': int(vol)})
    feeds = {
        'quote': s2['quote'], 'profile': s2['profile'], 'ratiosTtm': s2['ratiosTtm'], 'metricsTtm': s2['metricsTtm'],
        'scores': s1['scores'], 'estimates': s2['estimates'], 'priceTarget': s2['priceTarget'], 'grades': s2['grades'],
        'dcfLevered': s2['dcfLevered'], 'prices': prices, 'peers': s2['peers'],
        'income': load('income.json'), 'balance': load('balance.json'), 'cashflow': load('cashflow.json'),
        'ratiosHist': load('ratiosHist.json'), 'metricsHist': load('metricsHist.json'), 'growth': s1['growth'],
        'segProduct': s1['segProduct'], 'segGeography': s1['segGeography'],
    }
    peer_ratios, peer_metrics, peer_growth = {}, {}, {}
    for sym, row in s2['peerRows'].items():
        peer_ratios[sym] = {'symbol': sym, **dict(zip(R_FIELDS, row['r']))}
        peer_metrics[sym] = {'symbol': sym, **dict(zip(M_FIELDS, row['m']))}
        date, fy, rev, eps = row['g']
        peer_growth[sym] = {'symbol': sym, 'date': date, 'fiscalYear': fy, 'revenueGrowth': rev, 'epsdilutedGrowth': eps}
    bench = json.loads(Path(aapl).read_text(encoding='utf-8'))['extras']['benchmarks']
    snap = {
        'symbol': 'NVDA',
        'capturedAt': CAPTURED,
        'note': 'Bundled so the NVDA report renders without a key. Read through the market-data connector on 2026-10-10; '
                'see tools/capture/README.md. Peers trimmed to six listed chip designers; benchmarks shared with AAPL.',
        'extras': {'peerRatios': peer_ratios, 'peerMetrics': peer_metrics, 'peerGrowth': peer_growth,
                   'peersCapturedAt': CAPTURED, 'benchmarks': bench},
        'feeds': feeds,
        'feedDates': {},
    }
    Path(out).write_text(json.dumps(snap, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{out}: {len(feeds)} feeds, {len(prices)} closes, {len(peer_ratios)} peers')


if __name__ == '__main__':
    main(*sys.argv[1:4])
