/* ==========================================================================
   Maz Vantage — the Research tab's Fair Value and Profit Drivers, in depth

   Two readings the section's prose rests on, built for any company:

   - **valuationParameters**: for each model kept in the estimate, the inputs
     that decide it (the discount rate and how it is built, the horizon, the
     terminal assumption and how much of the value rests on it, the target
     multiple and where it comes from), so the reader can see why a model
     says what it says.
   - **profitDrivers**: how operating profit got from a past year to the
     latest one, split into growth at the old margin and the margin itself
     widening, with each segment's part in the revenue added and its share of
     the mix before and after.

   Arithmetic over filed figures and the models' own steps; nothing here is a
   forecast and nothing enters a grade.
   ========================================================================== */

import { cagr, isNum, median } from './format';
import { modelById } from './valuation-models';

/* ---------- valuation parameters ----------------------------------------- */

export interface ModelParams {
  id: string;
  label: string;
  family: 'dcf' | 'multiple';
  value: number;
  /** the one input that moves this model most, in words */
  key: string;
  /** share of enterprise value resting on the terminal value (DCFs) */
  terminalShare: number | null;
}

export interface ValuationParams {
  wacc: number | null;
  waccNote: string | null;
  horizonNote: string | null;
  rows: ModelParams[];
}

const stepOf = (steps: any[], label: string) => (steps || []).find((s: any) => s.label === label) || null;

export function valuationParameters(a: any, fve: any): ValuationParams {
  let wacc: number | null = null;
  let waccNote: string | null = null;
  let horizonNote: string | null = null;
  const rows: ModelParams[] = [];
  for (const m of fve?.models || []) {
    const model: any = modelById(m.id);
    if (!model || model.id !== m.id) continue;
    let res: any = null;
    try {
      res = model.relative ? (model.fairValue(a, { basis: 'sector' }) || model.fairValue(a)) : model.fairValue(a);
    } catch { res = null; }
    if (!res) continue;
    const steps = res.steps || [];
    if (model.relative) {
      const t = steps[0];
      const drv = steps[1];
      rows.push({
        id: m.id, label: m.full || m.label, family: 'multiple', value: m.value, terminalShare: null,
        key: isNum(t?.value) ? `${Number(t.value.toFixed(1))}x, the ${t.note || res.basisLabel || 'sector median'}, on ${drv?.label?.toLowerCase() || 'the driver'}` : 'target multiple',
      });
    } else if (m.id === 'fmpLevered') {
      rows.push({ id: m.id, label: m.full || m.label, family: 'dcf', value: m.value, terminalShare: null, key: 'the published levered model, inputs not disclosed' });
    } else {
      const w = stepOf(steps, 'Discount rate (WACC)');
      const h = stepOf(steps, 'Forecast horizon');
      const tv = stepOf(steps, 'Terminal value');
      const pvtv = stepOf(steps, 'Present value of terminal value');
      const ev = stepOf(steps, 'Enterprise value');
      if (w && wacc === null) { wacc = w.value; waccNote = w.note || null; }
      if (h && model.years === 10) horizonNote = h.note || horizonNote;
      if (h && !horizonNote) horizonNote = h.note || null;
      rows.push({
        id: m.id, label: m.full || m.label, family: 'dcf', value: m.value,
        key: tv?.note || '',
        terminalShare: isNum(pvtv?.value) && isNum(ev?.value) && ev.value > 0 ? pvtv.value / ev.value : null,
      });
    }
  }
  return { wacc, waccNote, horizonNote, rows };
}

/* ---------- profit drivers ------------------------------------------------- */

export interface SegmentMove { name: string; from: number | null; to: number | null; shareFrom: number | null; shareTo: number | null; added: number | null }

export interface ProfitDrivers {
  available: boolean;
  from: number;
  to: number;
  revenue: [number, number];
  opIncome: [number, number];
  margin: [number, number];
  grossMargin: [number | null, number | null];
  rndShare: [number | null, number | null];
  /** operating profit added by selling more at the starting margin */
  volume: number;
  /** operating profit added by the margin itself moving */
  marginEffect: number;
  revenueCagr: number | null;
  trough: { year: number; margin: number } | null;
  segments: SegmentMove[];
  fcfConversion: number | null;
}

/**
 * The window runs from four filed years before the latest (or the earliest
 * available) to the latest: long enough to see the mix move, short enough to
 * be about the business as it is.
 */
export function profitDrivers(a: any, span = 4): ProfitDrivers {
  const rows: any[] = (a.series?.rows || []).filter((r: any) => isNum(r.revenue) && r.revenue > 0 && isNum(r.operatingMargin));
  const none = { available: false } as ProfitDrivers;
  if (rows.length < 2) return none;
  const end = rows[rows.length - 1];
  const start = rows[Math.max(0, rows.length - 1 - span)];
  if (start === end) return none;

  const op0 = start.revenue * start.operatingMargin;
  const op1 = end.revenue * end.operatingMargin;
  const volume = (end.revenue - start.revenue) * start.operatingMargin;
  const marginEffect = end.revenue * (end.operatingMargin - start.operatingMargin);

  const window = rows.filter((r) => r.year >= start.year && r.year <= end.year);
  const low = window.reduce((m, r) => (r.operatingMargin < m.operatingMargin ? r : m), window[0]);
  const trough = low.year !== start.year && low.year !== end.year && low.operatingMargin < 0.6 * start.operatingMargin
    ? { year: low.year, margin: low.operatingMargin } : null;

  const seg = a.segments?.product;
  const segRows: any[] = seg?.available ? seg.rows : [];
  const s0 = segRows.find((r) => r.year === start.year);
  const s1 = segRows.find((r) => r.year === end.year);
  const segments: SegmentMove[] = [];
  if (s0 && s1) {
    for (const name of seg.names) {
      const from = s0.values[name];
      const to = s1.values[name];
      if (!isNum(from) && !isNum(to)) continue;
      segments.push({
        name,
        from: isNum(from) ? from : null,
        to: isNum(to) ? to : null,
        shareFrom: isNum(from) && s0.total > 0 ? from / s0.total : null,
        shareTo: isNum(to) && s1.total > 0 ? to / s1.total : null,
        added: isNum(from) && isNum(to) ? to - from : null,
      });
    }
    segments.sort((x, y) => (y.added ?? -Infinity) - (x.added ?? -Infinity));
  }

  return {
    available: true,
    from: start.year,
    to: end.year,
    revenue: [start.revenue, end.revenue],
    opIncome: [op0, op1],
    margin: [start.operatingMargin, end.operatingMargin],
    grossMargin: [start.grossMargin ?? null, end.grossMargin ?? null],
    rndShare: [isNum(start.rnd) ? start.rnd / start.revenue : null, isNum(end.rnd) ? end.rnd / end.revenue : null],
    volume,
    marginEffect,
    revenueCagr: cagr(start.revenue, end.revenue, end.year - start.year),
    trough,
    segments,
    fcfConversion: isNum(end.fcf) && isNum(end.netIncome) && end.netIncome > 0 ? end.fcf / end.netIncome : null,
  };
}

/* ---------- prose ------------------------------------------------------------ */

const usd = (v: number) => (Math.abs(v) >= 1e12 ? `US$${(v / 1e12).toFixed(2)}t` : Math.abs(v) >= 1e9 ? `US$${(v / 1e9).toFixed(1)}b` : `US$${(v / 1e6).toFixed(0)}m`);
const pc = (v: number, dp = 0) => `${(v * 100).toFixed(dp)}%`;
const FY = (y: number) => `FY${y}`;

export function profitDriverProse(a: any, d = profitDrivers(a)): string[] {
  if (!d.available) return [];
  const name = a.facts?.name || a.facts?.symbol || 'The company';
  const out: string[] = [];
  const added = d.opIncome[1] - d.opIncome[0];
  out.push(
    `Between ${FY(d.from)} and ${FY(d.to)} revenue went from ${usd(d.revenue[0])} to ${usd(d.revenue[1])}`
    + `${isNum(d.revenueCagr) ? `, ${pc(d.revenueCagr)} a year compounded,` : ''} and operating profit from ${usd(d.opIncome[0])} to `
    + `${usd(d.opIncome[1])}. Of the ${usd(added)} added, ${usd(d.volume)} came from selling more at the ${FY(d.from)} margin of `
    + `${pc(d.margin[0], 1)}, and ${usd(d.marginEffect)} from the margin itself ${d.margin[1] >= d.margin[0] ? 'widening' : 'narrowing'} to `
    + `${pc(d.margin[1], 1)}. ${Math.abs(d.marginEffect) > Math.abs(d.volume)
      ? 'More of the gain came from the margin than from the growth, which is the signature of pricing power or a richer mix.'
      : 'Most of the gain came from growth rather than from a wider margin.'}`,
  );

  const grown = d.segments.filter((s) => isNum(s.added) && s.added! > 0);
  const totalAdded = d.revenue[1] - d.revenue[0];
  if (grown.length && totalAdded > 0) {
    const top = grown[0];
    const parts = [`${top.name} supplied ${pc(top.added! / totalAdded)} of the revenue added, going from ${usd(top.from!)} to ${usd(top.to!)}`
      + `${isNum(top.shareFrom) && isNum(top.shareTo) ? ` and from ${pc(top.shareFrom!)} of revenue to ${pc(top.shareTo!)}` : ''}.`];
    // The segment that lost the most share: outgrown, or actually shrinking.
    const loser = d.segments
      .filter((s) => s !== top && isNum(s.shareFrom) && isNum(s.shareTo))
      .sort((x, y) => (x.shareTo! - x.shareFrom!) - (y.shareTo! - y.shareFrom!))[0];
    if (loser && loser.shareFrom! - loser.shareTo! > 0.05) {
      parts.push(isNum(loser.added) && loser.added! >= 0
        ? `${loser.name} still grew, from ${usd(loser.from!)} to ${usd(loser.to!)}, but its share fell from ${pc(loser.shareFrom!)} to ${pc(loser.shareTo!)}: it was outgrown, not abandoned.`
        : `${loser.name} shrank, from ${usd(loser.from!)} to ${usd(loser.to!)}, and its share fell from ${pc(loser.shareFrom!)} to ${pc(loser.shareTo!)}.`);
    }
    out.push(parts.join(' '));
  }

  const [g0, g1] = d.grossMargin;
  const [r0, r1] = d.rndShare;
  if (isNum(g0) && isNum(g1) && isNum(r0) && isNum(r1)) {
    out.push(
      `Gross margin moved from ${pc(g0!, 1)} to ${pc(g1!, 1)}, while research and development ${r1! < r0! ? 'fell' : 'rose'} from ${pc(r0!, 1)} of revenue to `
      + `${pc(r1!, 1)}${r1! < r0! ? ': the spending rose, but revenue rose faster' : ''}. ${r1! < r0! && g1! >= g0!
        ? 'A richer gross margin and a lighter cost base on top of it is operating leverage working in both directions at once.'
        : g1! < g0! ? 'The margin gain came below the gross line, from spreading fixed costs over more revenue, not from pricing.' : ''}`.trim(),
    );
  }

  if (d.trough) {
    out.push(`The path was not a straight line: operating margin fell to ${pc(d.trough.margin, 1)} in ${FY(d.trough.year)} before recovering, a reminder that the same operating leverage works in reverse when revenue stalls.`);
  }
  if (isNum(d.fcfConversion)) {
    out.push(`In ${FY(d.to)} free cash flow was ${pc(d.fcfConversion!)} of net income${d.fcfConversion! >= 0.9 ? ', so the profit is arriving as cash' : ', so a part of the profit is still tied up in working capital or investment'}.`);
  }
  return out;
}

export function parameterProse(a: any, p: ValuationParams, fve: any): string[] {
  const out: string[] = [];
  if (isNum(p.wacc)) {
    out.push(`Every discounted cash flow here uses the same discount rate, ${pc(p.wacc!, 1)}: ${p.waccNote || ''}. `
      + `${p.horizonNote ? `The cash flows are ${p.horizonNote}. ` : ''}`
      + 'The rate comes from the market’s own pricing of risk (beta against the index) rather than a house view, so a more volatile share is discounted harder.');
  }
  const dcfs = p.rows.filter((r) => r.family === 'dcf' && isNum(r.terminalShare));
  if (dcfs.length) {
    const share = median(dcfs.map((r) => r.terminalShare!))!;
    out.push(`On the median model ${pc(share)} of the value rests on the years after the forecast, the terminal value. `
      + `${share > 0.7 ? 'That is most of it: the estimate is more a judgement on how long the returns last than a sum of the next few years.'
        : share > 0.5 ? 'More than half: the estimate depends as much on how long the returns last as on the consensus years themselves.'
          : 'Most of the value is in the forecast years themselves, so the estimate leans on the consensus more than on the terminal assumption.'}`);
  }
  if (fve?.setAside?.length) {
    out.push(`${fve.setAside.length === 1 ? 'One model was' : `${fve.setAside.length} models were`} set aside as not describing this company, and the estimate is the median of the ${fve.count} that do; each is listed below with the reason.`);
  }
  return out;
}
