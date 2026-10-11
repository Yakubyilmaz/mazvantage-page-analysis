/* ==========================================================================
   Maz Vantage — the Research tab's quant rating and peer comparison

   Twelve ratios chosen to carry the argument, three or so per factor, each
   read two ways:

   - **against the sector** — the graded figure, the sector median and the
     percentile, exactly as the quant rating ranked it;
   - **against the named peers** — one trailing-twelve-month definition for
     every company, the company included, so the comparison is like for like.

   The two can differ for the same ratio (ROIC is the clearest case: the
   graded figure is computed from the filed statements, the peer column uses
   the published TTM figure), and the prose says which one it is quoting.
   Nothing here feeds a grade.
   ========================================================================== */

import { dec, isNum, median, mult, pct } from './format';
import { verdictWord } from './grading';

type Bag = { ratios: any; metrics: any; growth: any };
type Better = 'high' | 'low';

export interface Pick {
  id: string;            // the graded metric in factors.ts
  factor: 'valuation' | 'growth' | 'profitability' | 'health';
  label: string;
  better: Better;
  fmt: (v: number | null | undefined) => string;
  /** the like-for-like peer figure; null when absent or not meaningful */
  peer: (b: Bag) => number | null;
  /** what first and last place mean on this ratio: 'cheapest' / 'dearest' */
  ends: [string, string];
}

const num = (v: any) => (isNum(v) ? v : null);
const positive = (v: any) => (isNum(v) && v > 0 ? v : null);    // a negative P/E is not a cheap one

export const PICKS: Pick[] = [
  { id: 'peGaapTtm', factor: 'valuation', label: 'P/E (TTM)', better: 'low', fmt: mult, peer: (b) => positive(b.ratios?.priceToEarningsRatioTTM), ends: ['cheapest', 'dearest'] },
  { id: 'evToEbitdaTtm', factor: 'valuation', label: 'EV / EBITDA (TTM)', better: 'low', fmt: mult, peer: (b) => positive(b.metrics?.evToEBITDATTM ?? b.ratios?.enterpriseValueMultipleTTM), ends: ['cheapest', 'dearest'] },
  { id: 'priceToSalesTtm', factor: 'valuation', label: 'Price / sales (TTM)', better: 'low', fmt: mult, peer: (b) => positive(b.ratios?.priceToSalesRatioTTM), ends: ['cheapest', 'dearest'] },
  { id: 'fcfYieldTtm', factor: 'valuation', label: 'Free cash flow yield', better: 'high', fmt: (v) => pct(v, { dp: 1 }), peer: (b) => num(b.metrics?.freeCashFlowYieldTTM), ends: ['highest', 'lowest'] },
  { id: 'revenueGrowthYoy', factor: 'growth', label: 'Revenue growth (last FY)', better: 'high', fmt: (v) => pct(v, { dp: 1 }), peer: (b) => num(b.growth?.revenueGrowth), ends: ['fastest', 'slowest'] },
  { id: 'epsDilutedGrowth', factor: 'growth', label: 'Diluted EPS growth (last FY)', better: 'high', fmt: (v) => pct(v, { dp: 1 }), peer: (b) => num(b.growth?.epsdilutedGrowth), ends: ['fastest', 'slowest'] },
  { id: 'grossMargin', factor: 'profitability', label: 'Gross margin', better: 'high', fmt: (v) => pct(v, { dp: 1 }), peer: (b) => num(b.ratios?.grossProfitMarginTTM), ends: ['highest', 'lowest'] },
  { id: 'netMargin', factor: 'profitability', label: 'Net margin', better: 'high', fmt: (v) => pct(v, { dp: 1 }), peer: (b) => num(b.ratios?.netProfitMarginTTM), ends: ['highest', 'lowest'] },
  { id: 'returnOnInvestedCapital', factor: 'profitability', label: 'Return on invested capital', better: 'high', fmt: (v) => pct(v, { dp: 1 }), peer: (b) => num(b.metrics?.returnOnInvestedCapitalTTM), ends: ['highest', 'lowest'] },
  { id: 'returnOnEquity', factor: 'profitability', label: 'Return on equity', better: 'high', fmt: (v) => pct(v, { dp: 1 }), peer: (b) => num(b.metrics?.returnOnEquityTTM), ends: ['highest', 'lowest'] },
  { id: 'debtToEquity', factor: 'health', label: 'Debt / equity', better: 'low', fmt: (v) => (isNum(v) ? dec(v, 2) : 'n/a'), peer: (b) => num(b.ratios?.debtToEquityRatioTTM), ends: ['least geared', 'most geared'] },
  { id: 'currentRatio', factor: 'health', label: 'Current ratio', better: 'high', fmt: (v) => (isNum(v) ? dec(v, 2) : 'n/a'), peer: (b) => num(b.ratios?.currentRatioTTM), ends: ['most liquid', 'least liquid'] },
];

export const FACTOR_TITLES: Record<string, string> = {
  valuation: 'Valuation', growth: 'Growth', profitability: 'Profitability', health: 'Financial health', momentum: 'Momentum',
};

/** Every graded metric on the report, by id. */
export function gradedById(scores: any): Map<string, any> {
  const out = new Map<string, any>();
  for (const k of Object.keys(FACTOR_TITLES)) {
    for (const g of scores?.[k]?.groups || []) for (const m of g.metrics || []) out.set(m.id, m);
  }
  return out;
}

const latest = (rows: any) => (Array.isArray(rows) ? [...rows].sort((x, y) => String(y?.date).localeCompare(String(x?.date)))[0] : rows) || null;

export interface Company { symbol: string; name: string; self: boolean; bag: Bag }

/** The company and its peers, each with the three TTM rows the comparison reads. */
export function companies(a: any): Company[] {
  const f = a.facts || {};
  const self: Company = {
    symbol: f.symbol, name: f.name || f.symbol, self: true,
    bag: { ratios: a.ds?.get?.('ratiosTtm'), metrics: a.ds?.get?.('metricsTtm'), growth: latest(a.ds?.get?.('growth')) },
  };
  const peers: Company[] = (a.peers?.peers || []).map((p: any) => ({
    symbol: p.symbol, name: p.name || p.symbol, self: false,
    bag: { ratios: a.peerRatios?.[p.symbol], metrics: a.peerMetrics?.[p.symbol], growth: a.peerGrowth?.[p.symbol] },
  }));
  return [self, ...peers];
}

export interface Row {
  pick: Pick;
  /** the sector reading, as the quant rating graded it */
  graded: { value: number | null; median: number | null; pctile: number | null; grade: number | null; letter: string | null; source: string | null };
  /** the like-for-like peer reading */
  values: (number | null)[];          // one per company, company first
  peerMedian: number | null;          // the peers only, company excluded
  rank: number | null;                // 1 = best, among companies with a value
  ranked: number;
}

export function comparison(a: any) {
  const cos = companies(a);
  const byId = gradedById(a.scores);
  const rows: Row[] = PICKS.map((pick) => {
    const m = byId.get(pick.id);
    const values = cos.map((c) => pick.peer(c.bag));
    const peerVals = values.slice(1).filter(isNum) as number[];
    const own = values[0];
    const all = values.filter(isNum) as number[];
    const better = (x: number) => (pick.better === 'high' ? all.filter((v) => v > x).length : all.filter((v) => v < x).length);
    return {
      pick,
      graded: {
        value: isNum(m?.value) ? m.value : null,
        median: isNum(m?.median) ? m.median : null,
        pctile: isNum(m?.pctile) ? m.pctile : null,
        grade: isNum(m?.grade) ? m.grade : null,
        letter: m?.letter ?? null,
        source: m?.source ?? null,
      },
      values,
      peerMedian: peerVals.length >= 3 ? median(peerVals) : null,
      rank: isNum(own) ? better(own) + 1 : null,
      ranked: all.length,
    };
  });
  return { companies: cos, rows };
}

/* ---------- prose ------------------------------------------------------------ */

const ORD = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** "ranks ahead of 82% of the sector" — percentiles are already turned so that higher is better. */
const standing = (p: number) => (p >= 0.99 ? 'at the very top of the sector'
  : p <= 0.01 ? 'at the very bottom of the sector'
    : p >= 0.5 ? `ahead of ${pct(p, { dp: 0 })} of the sector` : `behind ${pct(1 - p, { dp: 0 })} of the sector`);

/** '2nd of 7, counting from the cheapest', or 'the dearest of 7'. */
const place = (r: Row) => (r.rank === 1 ? `the ${r.pick.ends[0]} of ${r.ranked}`
  : r.rank === r.ranked ? `the ${r.pick.ends[1]} of ${r.ranked}`
    : `${ORD(r.rank!)} of ${r.ranked}, counting from the ${r.pick.ends[0]}`);

function sectorClause(r: Row) {
  const g = r.graded;
  if (!isNum(g.value)) return null;
  const parts = [`${r.pick.fmt(g.value)}`];
  if (isNum(g.median)) parts.push(`against a sector median of ${r.pick.fmt(g.median)}`);
  return `${parts.join(' ')}${isNum(g.pctile) ? `, ${standing(g.pctile)}` : ''}`;
}

function peerClause(r: Row, n: number, sym: string) {
  if (!isNum(r.peerMedian) || !isNum(r.rank)) return null;
  const own = r.values[0];
  return `on the peers’ common TTM basis ${sym} reads ${r.pick.fmt(own)} against a peer median of ${r.pick.fmt(r.peerMedian)}, ${place(r)}${r.ranked < n ? ' that report it' : ''}`;
}

/** Lower-cases a leading capital unless it opens an abbreviation: 'Net margin' → 'net margin', 'P/E' stays. */
const lc = (s: string) => (/^[A-Z][a-z ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One sentence per ratio, sector reading first, peer reading second. */
function ratioSentence(r: Row, n: number, sym: string) {
  const s = sectorClause(r);
  const p = peerClause(r, n, sym);
  if (!s && !p) return null;
  if (s && p) return `${r.pick.label} is ${s}; ${p}.`;
  return s ? `${r.pick.label} is ${s}.` : `${r.pick.label}: ${p}.`;
}

/** The section's paragraphs, each keyed so an outside quote can be set beside the right one. */
export function quantPeerParas(a: any, cmp = comparison(a)): { key: string; text: string }[] {
  const sc = a.scores || {};
  const sym = a.facts?.symbol || 'the company';
  const name = a.facts?.name || sym;
  const sector = a.facts?.sector || 'its';
  const n = cmp.companies.length;
  const ov = sc.overall || {};
  const factors = Object.keys(FACTOR_TITLES)
    .map((k) => ({ k, title: FACTOR_TITLES[k], score: sc[k]?.score, letter: sc[k]?.letter, graded: sc[k]?.graded || 0 }))
    .filter((x) => isNum(x.score))
    .sort((x, y) => y.score - x.score);
  const graded = factors.reduce((t, x) => t + x.graded, 0);
  const paras: { key: string; text: string }[] = [];
  const add = (key: string, text: string) => paras.push({ key, text });

  if (isNum(ov.score)) {
    const gap = ov.score - 2.5;
    add('lead',
      `Our quant rating for ${name} is ${verdictWord(ov.score)}, grade ${ov.letter}, ${dec(ov.score, 2)} of 5, `
      + `built from ${graded} ratios each ranked as a percentile against the ${sector} sector`
      + `${isNum(a.lookup?.count) ? ` (${a.lookup.count.toLocaleString('en-US')} companies)` : ''}. `
      + `A company sitting exactly at the sector median on every ratio would score 2.5, so the rating places ${sym} `
      + `${Math.abs(gap) < 0.15 ? 'at the middle of its sector' : `${dec(Math.abs(gap), 2)} points ${gap > 0 ? 'above' : 'below'} the middle of its sector`}. `
      + 'The five factors carry equal weight, and no fair value estimate enters any of them.',
    );
  }

  if (factors.length >= 2) {
    const top = factors[0];
    const bottom = factors[factors.length - 1];
    const middle = factors.slice(1, -1).map((x) => `${lc(x.title)} ${x.letter} (${dec(x.score, 2)})`);
    add('factors',
      `The average hides a wide spread. ${top.title} is the strongest factor at ${top.letter} (${dec(top.score, 2)}), `
      + `${lc(bottom.title)} the weakest at ${bottom.letter} (${dec(bottom.score, 2)})`
      + `${middle.length ? `, with ${middle.join(', ')} in between` : ''}. `
      + `${top.score - bottom.score >= 1.5
        ? `A gap of ${dec(top.score - bottom.score, 2)} points between the best and worst factor means the headline grade is a balance of opposing readings rather than a description of a middling company.`
        : 'The factors sit close together, so the headline grade describes the company fairly on every front.'}`,
    );
  }

  const byFactor = (f: Pick['factor']) => cmp.rows.filter((r) => r.pick.factor === f);
  const para = (lead: string, f: Pick['factor']) => {
    const lines = byFactor(f).map((r) => ratioSentence(r, n, sym)).filter(Boolean);
    if (lines.length) add(f, `${lead} ${lines.join(' ')}`);
  };
  para('On valuation, the ratios the market quotes most often:', 'valuation');
  para('On profitability, what the business earns on its sales and its capital:', 'profitability');
  para('On growth, the last fiscal year:', 'growth');
  para('On the balance sheet:', 'health');

  // Where it leads and lags the peer set: the ratios on which it ranks first or last.
  const ranked = cmp.rows.filter((r) => isNum(r.rank) && r.ranked >= 4);
  const leads = ranked.filter((r) => r.rank === 1).map((r) => lc(r.pick.label));
  const lags = ranked.filter((r) => r.rank === r.ranked).map((r) => lc(r.pick.label));
  if (leads.length || lags.length) {
    add('closing',
      `Across the ${n - 1} named peers, ${sym} ${leads.length ? `ranks best on ${list(leads)}` : 'ranks best on none of these ratios'}`
      + `${lags.length ? ` and worst on ${list(lags)}` : ''}. `
      + 'The peer set is the published one, and it is broad: it mixes software, semiconductors, advertising and consumer hardware, so a peer median is a reference point, not a fair comparison on every line.',
    );
  }
  return paras;
}

export const quantPeerProse = (a: any, cmp = comparison(a)) => quantPeerParas(a, cmp).map((p) => p.text);
