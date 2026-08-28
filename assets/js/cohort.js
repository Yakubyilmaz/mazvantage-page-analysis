/* ==========================================================================
   Maz Vantage — peer cohort & sector-relative statistics

   Every grade in this app is relative, not absolute. A 35x P/E is expensive
   for a utility and cheap for a semiconductor designer, so the model never
   compares a company to a hardcoded threshold — it compares it to a cohort of
   companies that face the same economics.

   Cohort construction
   -------------------
   1. Screen the company's own INDUSTRY, floored at 1/50th of its market cap
      so micro-caps do not pollute a mega-cap comparison.
   2. If that yields fewer than MIN_COHORT names, widen to the SECTOR.
   3. Union in whatever FMP lists as direct peers.
   4. Drop cross-listings of the same company (MU / MU.TO), keeping the most
      liquid line.
   5. Rank by size proximity to the subject — |log(cap) − log(subjectCap)| —
      and keep the closest MAX_COHORT. Size-matched beats simply-biggest:
      comparing Apple to Apple-sized companies is more informative than
      comparing it to the largest names in tech regardless of scale.

   Statistics
   ----------
   Grades come from the subject's percentile within the cohort, mapped to the
   1–5 scale the platform already uses. Medians, quartiles and the subject's
   rank are all carried through so the UI can show its work.
   ========================================================================== */

import { isNum, median as med } from './util.js';

export const MIN_COHORT = 8;
export const MAX_COHORT = 14;

/* ==========================================================================
   Distribution helpers
   ========================================================================== */

/** Quantile of a sorted numeric array, linear interpolation. */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Describe a set of peer values plus the subject's place in it.
 * `higherIsBetter` flips the goodness scale for metrics like P/E where low wins.
 */
export function describe(value, peerValues, { higherIsBetter = true } = {}) {
  const peers = peerValues.filter(isNum).sort((a, b) => a - b);
  if (!isNum(value) || peers.length < 3) {
    return { available: false, n: peers.length, value, median: med(peers), percentile: null, rank: null, grade: null };
  }

  // Percentile of the subject among cohort members, counting ties as half —
  // the standard mid-rank convention, so identical values do not get
  // arbitrarily different grades.
  const below = peers.filter((v) => v < value).length;
  const equal = peers.filter((v) => v === value).length;
  const raw = (below + equal / 2) / peers.length;

  const goodness = higherIsBetter ? raw : 1 - raw;
  const rank = higherIsBetter
    ? peers.length - below - equal + 1      // 1 = best when high wins
    : below + 1;                            // 1 = best when low wins

  return {
    available: true,
    n: peers.length,
    value,
    median: quantile(peers, 0.5),
    q1: quantile(peers, 0.25),
    q3: quantile(peers, 0.75),
    min: peers[0],
    max: peers.at(-1),
    percentile: raw,
    goodness,
    rank: Math.max(1, Math.min(peers.length + 1, rank)),
    total: peers.length + 1,
    grade: gradeFrom(goodness),
    higherIsBetter,
  };
}

/** Map a 0–1 goodness percentile onto the platform's 1–5 grade scale. */
export function gradeFrom(goodness) {
  if (!isNum(goodness)) return null;
  return 1 + 4 * Math.max(0, Math.min(1, goodness));
}

/** Grade → the label and tone the UI paints it with. */
export function verdict(grade) {
  if (!isNum(grade)) return { label: 'No data', tone: 'muted', state: 'na' };
  if (grade >= 4.25) return { label: 'Strong', tone: 'good', state: 'pass' };
  if (grade >= 3.40) return { label: 'Good', tone: 'good', state: 'pass' };
  if (grade >= 2.60) return { label: 'Average', tone: 'neutral', state: 'mid' };
  if (grade >= 1.75) return { label: 'Weak', tone: 'bad', state: 'fail' };
  return { label: 'Poor', tone: 'bad', state: 'fail' };
}

/** Ordinal for prose: 3 -> "3rd". */
export function ordinal(n) {
  if (!isNum(n)) return '';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ==========================================================================
   Cohort construction
   ========================================================================== */

const arr = (v) => (Array.isArray(v) ? v : []);

/** Strip the exchange suffix so MU and MU.TO collapse to one company. */
const rootOf = (sym) => String(sym || '').split('.')[0].toUpperCase();

/**
 * Build the comparison cohort from the screener results and the peer list.
 * Returns { members, basis, industry, sector } where `basis` records whether
 * the industry screen was deep enough or the sector had to be used.
 */
export function buildCohort(ds, facts) {
  const subject = facts.symbol.toUpperCase();
  const industryRows = arr(ds.get('screenIndustry'));
  const sectorRows = arr(ds.get('screenSector'));
  const peerRows = arr(ds.get('peers'));

  const usable = (rows) => rows.filter((r) => r.symbol && rootOf(r.symbol) !== rootOf(subject));

  let pool = usable(industryRows);
  let basis = 'industry';
  if (pool.length < MIN_COHORT) {
    pool = usable(sectorRows);
    basis = 'sector';
  }
  if (!pool.length) {
    pool = usable(peerRows).map((p) => ({
      symbol: p.symbol, companyName: p.companyName, marketCap: p.mktCap ?? p.marketCap ?? null,
    }));
    basis = 'peers';
  }

  // Fold in FMP's own peer list — those are the names a reader expects to see.
  const seenSym = new Set(pool.map((r) => r.symbol.toUpperCase()));
  for (const p of usable(peerRows)) {
    if (seenSym.has(p.symbol.toUpperCase())) continue;
    pool.push({ symbol: p.symbol, companyName: p.companyName,
                marketCap: p.mktCap ?? p.marketCap ?? null, fromPeers: true });
    seenSym.add(p.symbol.toUpperCase());
  }

  // Collapse cross-listings: keep the largest line per company root.
  const byRoot = new Map();
  for (const r of pool) {
    const key = (r.companyName || rootOf(r.symbol)).toLowerCase().replace(/[^a-z]/g, '');
    const prev = byRoot.get(key);
    const better = !prev
      || (r.symbol.length < prev.symbol.length)             // plain ticker over suffixed
      || ((r.marketCap ?? 0) > (prev.marketCap ?? 0) && r.symbol.length <= prev.symbol.length);
    if (better) byRoot.set(key, r);
  }

  // Size-match: nearest in log market cap to the subject.
  const subjectCap = facts.marketCap;
  const members = [...byRoot.values()]
    .map((r) => ({
      symbol: r.symbol.toUpperCase(),
      name: r.companyName || r.symbol,
      marketCap: r.marketCap ?? null,
      fromPeers: !!r.fromPeers,
      distance: (isNum(subjectCap) && isNum(r.marketCap) && r.marketCap > 0 && subjectCap > 0)
        ? Math.abs(Math.log(r.marketCap) - Math.log(subjectCap))
        : Number.POSITIVE_INFINITY,
    }))
    // direct peers first, then closest in size
    .sort((a, b) => (Number(b.fromPeers) - Number(a.fromPeers)) || (a.distance - b.distance))
    .slice(0, MAX_COHORT);

  return {
    members,
    basis,
    industry: facts.industry,
    sector: facts.sector,
    label: basis === 'industry' ? facts.industry
      : basis === 'sector' ? `${facts.sector} sector`
      : 'listed peers',
  };
}

/** Market-cap floors for the two screens, derived from the subject's size. */
export function screenFloors(marketCap) {
  const cap = isNum(marketCap) && marketCap > 0 ? marketCap : 1e9;
  return {
    capFloor: Math.max(Math.round(cap / 50), 3e8),
    capFloorWide: Math.max(Math.round(cap / 50), 1e9),
  };
}

/**
 * Fold the fetched per-peer ratio payloads into a lookup the metric
 * definitions read from: { SYMBOL: { ...ratiosTtm, ...metricsTtm } }.
 */
export function mergeCohortStats(members, ratios, metrics) {
  const out = {};
  members.forEach((m) => {
    const r = ratios?.[m.symbol] || null;
    const k = metrics?.[m.symbol] || null;
    if (!r && !k) return;
    out[m.symbol] = { symbol: m.symbol, name: m.name, marketCap: m.marketCap, ...(r || {}), ...(k || {}) };
  });
  return out;
}
