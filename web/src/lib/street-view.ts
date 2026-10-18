/* ==========================================================================
   Maz Vantage — the Street's view, and how it is moving

   What the analysts expect and whether they are raising or cutting it. Five
   readings, each from data the page already has or the consensus ledger
   (public/data/consensus-ledger.json, built forward by
   tools/capture/consensus_ledger.py):

   - **revisions**: each fiscal year's consensus revenue and EPS at the first
     capture on the ledger against the latest, with the span between them;
   - **dispersion**: the spread between the lowest and highest published
     estimate, as a share of the average: a wide spread says the analysts
     disagree, a narrow one that the number is well anchored;
   - **targets**: the price-target consensus, median, high and low against the
     price, and the average target over the last month, quarter and year;
   - **ratings mix**: the share of buy ratings each month on record;
   - **the record**: how often results beat the consensus, and by how much.

   A single capture says nothing about direction, and the page says so rather
   than drawing a line from one point. Nothing here enters a grade.
   ========================================================================== */

import { fmtDate, isNum, median, pct, price } from './format';

export interface LedgerEstimate {
  fy: string; revenue: number | null; revenueLow: number | null; revenueHigh: number | null;
  eps: number | null; epsLow: number | null; epsHigh: number | null; ebit: number | null;
  analystsRevenue: number | null; analystsEps: number | null;
}
export interface LedgerCapture {
  date: string; source: string; estimates: LedgerEstimate[]; price?: number;
  target?: { consensus: number; median: number; high: number; low: number };
  grades?: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number };
  note?: string;
}
export interface Ledger {
  symbols: Record<string, LedgerCapture[]>;
  reported?: Record<string, { date: string; rows: any[] } | string>;
}

let ledgerLoad: Promise<Ledger | null> | null = null;
export const loadLedger = () => (ledgerLoad ||= fetch('/data/consensus-ledger.json')
  .then((r) => (r.ok ? r.json() : null)).catch(() => null));

const change = (from: number | null | undefined, to: number | null | undefined) =>
  (isNum(from) && isNum(to) && from !== 0 ? to / Math.abs(from) - 1 : null);

const fyYear = (fy: string) => Number(fy.slice(0, 4));

/** Three or more analysts on both revenue and EPS: below that, one model moving is not the consensus moving. */
const covered = (e: LedgerEstimate) => (e.analystsEps ?? 0) >= 3 && (e.analystsRevenue ?? 0) >= 3;

/* ---------- revisions ----------------------------------------------------- */

export interface Revision {
  fy: string; year: number;
  revenueFrom: number | null; revenueTo: number | null; revenueChange: number | null;
  epsFrom: number | null; epsTo: number | null; epsChange: number | null;
  analysts: number | null;
}

export interface Revisions {
  captures: number;
  from: string | null;
  to: string | null;
  rows: Revision[];
}

/**
 * Each fiscal year still ahead (or the one just closing), at the first capture
 * that carried it against the latest. Years with an analyst count below three
 * are left out: one analyst's model moving is not the consensus moving.
 */
export function revisions(caps: LedgerCapture[] | undefined, fromYear: number | null): Revisions {
  const list = [...(caps || [])].sort((x, y) => x.date.localeCompare(y.date));
  if (!list.length) return { captures: 0, from: null, to: null, rows: [] };
  const last = list[list.length - 1];
  const rows: Revision[] = [];
  for (const e of last.estimates) {
    const year = fyYear(e.fy);
    if (isNum(fromYear) && year < fromYear) continue;
    if (!covered(e)) continue;
    // The first capture that carried the year with the same coverage: a year
    // read by two analysts then and thirty now has not been revised, it has
    // been joined.
    const first = list.find((c) => c.estimates.some((x) => x.fy === e.fy && covered(x)));
    const f = first?.estimates.find((x) => x.fy === e.fy);
    if (!first || !f || first === last) {
      rows.push({ fy: e.fy, year, revenueFrom: null, revenueTo: e.revenue, revenueChange: null, epsFrom: null, epsTo: e.eps, epsChange: null, analysts: e.analystsEps ?? e.analystsRevenue });
      continue;
    }
    rows.push({
      fy: e.fy, year,
      revenueFrom: f.revenue, revenueTo: e.revenue, revenueChange: change(f.revenue, e.revenue),
      epsFrom: f.eps, epsTo: e.eps, epsChange: change(f.eps, e.eps),
      analysts: e.analystsEps ?? e.analystsRevenue,
    });
  }
  return { captures: list.length, from: list[0].date, to: last.date, rows };
}

/* ---------- dispersion ---------------------------------------------------- */

export interface Spread { fy: string; year: number; revenue: number | null; eps: number | null; analysts: number | null }

/** (high − low) / average, per fiscal year, on the latest capture. */
export function dispersion(cap: LedgerCapture | undefined, fromYear: number | null): Spread[] {
  if (!cap) return [];
  return cap.estimates
    .filter((e) => (!isNum(fromYear) || fyYear(e.fy) >= fromYear) && covered(e))
    .map((e) => ({
      fy: e.fy, year: fyYear(e.fy),
      revenue: isNum(e.revenueHigh) && isNum(e.revenueLow) && isNum(e.revenue) && e.revenue > 0 ? (e.revenueHigh - e.revenueLow) / e.revenue : null,
      eps: isNum(e.epsHigh) && isNum(e.epsLow) && isNum(e.eps) && e.eps > 0 ? (e.epsHigh - e.epsLow) / e.eps : null,
      analysts: e.analystsEps ?? e.analystsRevenue,
    }));
}

/* ---------- targets -------------------------------------------------------- */

export interface Targets {
  consensus: number | null; median: number | null; high: number | null; low: number | null;
  upside: number | null; highUpside: number | null; lowUpside: number | null;
  windows: { label: string; average: number | null; count: number | null }[];
  date: string | null;
}

type Get = (name: string) => any;
const dsGet = (a: any): Get => (name) => a?.ds?.get?.(name) ?? null;

export function targetsOf(a: any, cap: LedgerCapture | undefined, get: Get = dsGet(a)): Targets {
  const px = a?.facts?.price;
  const t = cap?.target || get('priceTarget') || null;
  const c = t ? (t.consensus ?? t.targetConsensus) : null;
  const m = t ? (t.median ?? t.targetMedian) : null;
  const hi = t ? (t.high ?? t.targetHigh) : null;
  const lo = t ? (t.low ?? t.targetLow) : null;
  const up = (v: number | null) => (isNum(v) && isNum(px) && px > 0 ? v / px - 1 : null);
  const s = get('targetSummary') || null;
  const windows = s ? [
    { label: 'Last month', average: s.lastMonthAvgPriceTarget ?? null, count: s.lastMonthCount ?? null },
    { label: 'Last quarter', average: s.lastQuarterAvgPriceTarget ?? null, count: s.lastQuarterCount ?? null },
    { label: 'Last year', average: s.lastYearAvgPriceTarget ?? null, count: s.lastYearCount ?? null },
  ].filter((w) => isNum(w.average) && (w.count ?? 0) > 0) : [];
  return {
    consensus: isNum(c) ? c : null, median: isNum(m) ? m : null, high: isNum(hi) ? hi : null, low: isNum(lo) ? lo : null,
    upside: up(c), highUpside: up(hi), lowUpside: up(lo), windows, date: cap?.target ? cap.date : null,
  };
}

/* ---------- ratings mix ------------------------------------------------------ */

export interface MixPoint { date: string; buy: number; hold: number; sell: number; total: number; buyShare: number }

/** The monthly rating counts, oldest first, with the share rating it a buy. */
export function ratingsMix(get: Get): MixPoint[] {
  const rows: any[] = get('gradesHistorical') || [];
  return rows
    .map((r) => {
      const buy = (r.analystRatingsStrongBuy || 0) + (r.analystRatingsBuy || 0);
      const hold = r.analystRatingsHold || 0;
      const sell = (r.analystRatingsSell || 0) + (r.analystRatingsStrongSell || 0);
      const total = buy + hold + sell;
      return { date: r.date, buy, hold, sell, total, buyShare: total ? buy / total : 0 };
    })
    .filter((x) => x.date && x.total > 0)
    .sort((x, y) => x.date.localeCompare(y.date));
}

/* ---------- the record --------------------------------------------------- */

export interface Record_ {
  quarters: number; epsBeats: number; revenueBeats: number;
  medianEpsSurprise: number | null; medianRevenueSurprise: number | null;
  latest: { date: string; epsSurprise: number | null; revenueSurprise: number | null } | null;
  from: string | null; to: string | null;
}

/** Results against the consensus, from the snapshot's earnings feed or, failing that, the ledger's reported rows. */
export function beatRecord(a: any, ledger: Ledger | null, n = 12): Record_ | null {
  let rows: any[] = (a?.surprises?.rows || []).filter((r: any) => isNum(r.epsSurprise));
  if (!rows.length) {
    const rep = ledger?.reported?.[a?.facts?.symbol];
    const raw: any[] = rep && typeof rep === 'object' ? rep.rows : [];
    rows = raw.filter((r) => isNum(r.epsActual) && isNum(r.epsEstimated) && r.epsEstimated !== 0)
      .map((r) => ({
        date: r.date,
        epsSurprise: r.epsActual / Math.abs(r.epsEstimated) - 1,
        revenueSurprise: isNum(r.revenueActual) && isNum(r.revenueEstimated) && r.revenueEstimated ? r.revenueActual / r.revenueEstimated - 1 : null,
      }))
      .sort((x, y) => x.date.localeCompare(y.date));
  }
  rows = rows.slice(-n);
  if (!rows.length) return null;
  const rev = rows.filter((r) => isNum(r.revenueSurprise));
  const last = rows[rows.length - 1];
  return {
    quarters: rows.length,
    epsBeats: rows.filter((r) => r.epsSurprise >= 0).length,
    revenueBeats: rev.filter((r) => r.revenueSurprise >= 0).length,
    medianEpsSurprise: median(rows.map((r) => r.epsSurprise)),
    medianRevenueSurprise: rev.length ? median(rev.map((r) => r.revenueSurprise)) : null,
    latest: { date: last.date, epsSurprise: last.epsSurprise, revenueSurprise: isNum(last.revenueSurprise) ? last.revenueSurprise : null },
    from: rows[0].date, to: last.date,
  };
}

/* ---------- all together --------------------------------------------------- */

export interface StreetView {
  revisions: Revisions;
  dispersion: Spread[];
  targets: Targets;
  mix: MixPoint[];
  record: Record_ | null;
  grades: LedgerCapture['grades'] | null;
}

export function streetView(a: any, ledger: Ledger | null, get: Get = dsGet(a)): StreetView {
  const caps = ledger?.symbols?.[a?.facts?.symbol] || [];
  const latest = caps.length ? [...caps].sort((x, y) => x.date.localeCompare(y.date)).at(-1) : undefined;
  const fromYear = isNum(a?.forecast?.base?.year) ? a.forecast.base.year : null;
  const g = latest?.grades || get('grades') || null;
  return {
    revisions: revisions(caps, fromYear),
    dispersion: dispersion(latest, fromYear),
    targets: targetsOf(a, [...caps].reverse().find((c) => c.target), get),
    mix: ratingsMix(get),
    record: beatRecord(a, ledger),
    grades: g ? { strongBuy: g.strongBuy, buy: g.buy, hold: g.hold, sell: g.sell, strongSell: g.strongSell } : null,
  };
}

/* ---------- the prose ------------------------------------------------------ */


/** A revision: "unchanged" below half a basis point, else signed to one decimal. */
export const revisionText = (v: number) => (Math.abs(v) < 0.0005 ? 'unchanged' : pct(v, { sign: true }));
const days = (from: string, to: string) => Math.round((+new Date(to) - +new Date(from)) / 864e5);

/** The section's paragraphs, each written only where its figures exist. */
export function streetProse(sv: StreetView, name: string, px: number | null, cur = 'US$'): string[] {
  const out: string[] = [];
  const rv = sv.revisions;
  const moved = rv.rows.filter((r) => isNum(r.epsChange) || isNum(r.revenueChange));
  if (rv.captures < 2 || !moved.length) {
    out.push(rv.captures
      ? `The consensus ledger holds ${rv.captures === 1 ? 'one capture' : `${rv.captures} captures`}, from ${fmtDate(rv.from!)}${rv.captures > 1 ? ` to ${fmtDate(rv.to!)}` : ''}, and no fiscal year carried by more than one, so it cannot yet say whether the analysts are raising or cutting. It is built forward one capture at a time and will.`
      : 'No consensus captures are on the ledger for this company yet, so revisions cannot be read.');
  } else {
    const up = moved.filter((r) => (r.epsChange ?? 0) > 0.0005).length;
    const down = moved.filter((r) => (r.epsChange ?? 0) < -0.0005).length;
    const span = days(rv.from!, rv.to!);
    const near = moved[0];
    const far = moved.length > 1 ? moved[moved.length - 1] : null;
    const line = (r: Revision) => `FY${r.year} ${isNum(r.epsChange) ? `EPS ${revisionText(r.epsChange)}` : ''}${isNum(r.epsChange) && isNum(r.revenueChange) ? ' and ' : ''}${isNum(r.revenueChange) ? `revenue ${revisionText(r.revenueChange)}` : ''}`;
    out.push(
      `Between ${fmtDate(rv.from!)} and ${fmtDate(rv.to!)}, ${span} days across ${rv.captures} captures, the analysts `
      + (up > down ? 'raised their earnings estimates' : down > up ? 'cut their earnings estimates' : 'left their earnings estimates broadly unchanged')
      + `: of the ${moved.length} fiscal years with three or more analysts in both captures, ${up} moved up, ${down} down`
      + `${moved.length - up - down ? ` and ${moved.length - up - down} held` : ''}. `
      + `For FY${near.year}: ${line(near).replace(/^FY\d+ /, '')}${far ? `; for FY${far.year}, the furthest so covered: ${line(far).replace(/^FY\d+ /, '')}` : ''}. `
      + (span < 90 ? 'That is a short window: the ledger is built forward, and the direction means more as it lengthens.' : ''),
    );
  }
  const sp = sv.dispersion.filter((d) => isNum(d.eps));
  if (sp.length > 1) {
    const tight = sp.reduce((p, x) => (x.eps! < p.eps! ? x : p));
    const wide = sp.reduce((p, x) => (x.eps! > p.eps! ? x : p));
    out.push(
      `The published estimates agree most on FY${tight.year}, where the highest EPS estimate sits ${pct(tight.eps)} of the average above the lowest, `
      + `and least on FY${wide.year}, at ${pct(wide.eps)}${isNum(wide.analysts) ? ` across ${wide.analysts} analysts` : ''}. A wide spread is where a result can surprise most in either direction.`,
    );
  }
  const t = sv.targets;
  if (isNum(t.consensus) && isNum(px)) {
    const trend = t.windows.length >= 2 ? t.windows : [];
    out.push(
      `The analysts’ price-target consensus is ${price(t.consensus, cur)}, ${pct(Math.abs(t.upside!))} ${t.upside! >= 0 ? 'above' : 'below'} the ${price(px, cur)} price`
      + (isNum(t.low) && isNum(t.high) ? `, within a published range of ${price(t.low, cur)} to ${price(t.high, cur)}` : '')
      + '. '
      + (trend.length
        ? `Targets set in the ${trend.map((w) => `${w.label.toLowerCase()} average ${price(w.average, cur)} (${w.count})`).join(', ')}: `
          + (trend[0].average! > trend[trend.length - 1].average! ? 'the newer the target, the higher it is.' : trend[0].average! < trend[trend.length - 1].average! ? 'the newer the target, the lower it is.' : 'no direction between them.')
        : ''),
    );
  }
  if (sv.mix.length >= 2) {
    const first = sv.mix[0];
    const last = sv.mix[sv.mix.length - 1];
    out.push(
      `${pct(last.buyShare, { dp: 0 })} of the ${last.total} ratings on record in ${fmtDate(last.date, { month: 'long', year: 'numeric' })} were buys, `
      + `against ${pct(first.buyShare, { dp: 0 })} of ${first.total} in ${fmtDate(first.date, { month: 'long', year: 'numeric' })}. `
      + (last.buyShare > 0.85 ? 'With so few dissenters there is little room left for upgrades to lift the shares; downgrades have more room to move them.' : ''),
    );
  }
  const r = sv.record;
  if (r) {
    out.push(
      `${name} beat the EPS consensus in ${r.epsBeats} of the ${r.quarters} quarters on record${r.from ? ` from ${fmtDate(r.from, { month: 'short', year: 'numeric' })}` : ''}, by a median ${pct(r.medianEpsSurprise)}`
      + (isNum(r.medianRevenueSurprise) ? `, and the revenue consensus in ${r.revenueBeats}, by a median ${pct(r.medianRevenueSurprise)}` : '')
      + '. A company that beats this reliably is one the consensus has learned to under-forecast, so the beat itself is partly expected; what moves the shares is its size against that habit.',
    );
  }
  return out;
}
