/* ==========================================================================
   Loading one company report: the fetch → analyse → render pipeline's first
   two thirds (the legacy `app.js` render()).

   A first `analyse()` pass tells us the sector, which says which extras to
   fetch (the peer set, the sector ETF) and which distribution to grade
   against; the second pass grades with all of it.
   ========================================================================== */

import { fetchFor, hasApiKey, loadDataset, mapLimited, type Dataset } from './fmp';
import { analyse, type Analysis } from './model';
import { loadSectorStats } from './grading';
import { MARKET_ETF, SECTOR_ETF } from './nav';

export interface Extras {
  peerRatios: Record<string, any>;
  peerGrowth: Record<string, any>;
  benchmarks: Record<string, any>;
}

/** Peer P/E ratios and benchmark price series — fetched after the main pass. */
export async function loadExtras(ds: Dataset, facts: any): Promise<Extras> {
  const out: Extras = { peerRatios: {}, peerGrowth: {}, benchmarks: {} };

  // A snapshot can ship its own peer ratios and benchmark series so the
  // offline report is complete rather than half-empty.
  if (ds.snapshotExtras) {
    Object.assign(out.peerRatios, ds.snapshotExtras.peerRatios || {});
    Object.assign(out.peerGrowth, ds.snapshotExtras.peerGrowth || {});
    Object.assign(out.benchmarks, ds.snapshotExtras.benchmarks || {});
  }

  if (!hasApiKey()) {
    out.benchmarks.note = out.benchmarks.note || 'Sector and market comparisons need live data, which is unavailable right now.';
    return out;
  }

  const peers: string[] = (ds.get('peers') || []).slice(0, 8).map((p: any) => p.symbol).filter(Boolean);
  if (peers.length) {
    const rs = await mapLimited(peers, (sym) => fetchFor('ratiosTtm', sym), 4);
    peers.forEach((sym, i) => { if (rs[i]?.status === 'ok' && rs[i].data) out.peerRatios[sym] = rs[i].data; });

    // A second call per peer, which doubles what the peer set costs. It buys
    // the only growth figure the ratios feed does not carry, and the "revenue
    // growth vs peers" line cannot be built from anything cheaper.
    const gs = await mapLimited(peers, (sym) => fetchFor('growth', sym), 4);
    peers.forEach((sym, i) => {
      const row = gs[i]?.status === 'ok' ? (gs[i].data || [])[0] : null;
      if (row) out.peerGrowth[sym] = row;
    });
  }

  const etf = SECTOR_ETF[facts.sector];
  const wanted = [MARKET_ETF, etf].filter(Boolean) as string[];
  const series = await mapLimited(wanted, (sym) => fetchFor('prices', sym), 2);
  if (series[0]?.status === 'ok') out.benchmarks.market = series[0].data;
  if (etf && series[1]?.status === 'ok') {
    out.benchmarks.industry = series[1].data;
    out.benchmarks.note = `Sector benchmark: ${etf}. Market benchmark: ${MARKET_ETF}.`;
  } else {
    out.benchmarks.note = `Market benchmark: ${MARKET_ETF}.`;
  }
  return out;
}

export type ReportLoad =
  | { status: 'ok'; a: Analysis; ds: Dataset; extras: Extras }
  | { status: 'error'; title: string; message: string; details?: string[] };

export async function loadReport(symbol: string): Promise<ReportLoad> {
  const ds = await loadDataset(symbol);
  if (ds.source === 'none') {
    return {
      status: 'error', title: `Could not build a report for ${symbol}`,
      message: 'Live data is unavailable right now, and there is no saved copy of this report.',
      details: ['Try again later, or open /stock/AAPL to see an example report.'],
    };
  }
  if (ds.source === 'error') {
    return {
      status: 'error', title: `Could not build a report for ${symbol}`,
      message: 'No data came back for this ticker. It may not exist, or live data may be unavailable right now.',
      details: [...new Set(Object.values(ds.feeds).filter((r) => r.status === 'error').map((r) => r.message).filter(Boolean))].slice(0, 2) as string[],
    };
  }
  let a = analyse(ds);
  const [extras, sectorStats] = await Promise.all([loadExtras(ds, a.facts), loadSectorStats()]);
  a = analyse(ds, { peerRatios: extras.peerRatios, peerGrowth: extras.peerGrowth, sectorStats, benchmarks: extras.benchmarks });
  return { status: 'ok', a, ds, extras };
}
