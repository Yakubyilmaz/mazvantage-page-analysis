/* ==========================================================================
   Maz Vantage — the Alpha Signal brief

   The page asks one question: is something changing that the market has not
   priced yet? This file turns a scored run into the three answers that make
   that up, plus a direction and a headline, so the tab can lead with an answer
   rather than with a number and eleven cards.

     1. Is the business changing?          fundamental · commercial · product
     2. Are expectations catching up?      revisions · catalysts
     3. What has the market priced?        price and volume · institutional ·
                                           insider · attention

   Pure: reads the provider bag and the scored result, fetches nothing, and
   every fact it states is a field of a feed or of a signal already on the page
   — nothing here is written about a company in particular. The headline is
   assembled from those facts by fixed rules; no language model is involved.
   ========================================================================== */

import { isNum } from './format';
import { feedAsOf, returnOver } from './alpha-providers';
import { eventStories, groupStories, type Story } from './news-events';

export type Direction = 'improving' | 'mixed' | 'deteriorating' | 'unmeasured';

export const DIRECTION_LABEL: Record<Direction, string> = {
  improving: 'Improving',
  mixed: 'Mixed',
  deteriorating: 'Deteriorating',
  unmeasured: 'Not measured',
};

/**
 * The cut points, on the 0–100 scale every category uses. Inside 42–58 the
 * evidence does not lean far enough either way to name, which is the same dead
 * band the signal statuses use (±8), widened by half because a block averages
 * several readings that each already cleared their own.
 */
export const directionOf = (score: number | null | undefined): Direction =>
  (!isNum(score) ? 'unmeasured' : score >= 58 ? 'improving' : score <= 42 ? 'deteriorating' : 'mixed');

export interface Fact {
  label: string;
  value: string;
  /** a short qualifier under the value */
  note?: string;
  tone?: 'up' | 'down' | null;
  /** the signal this fact is read from, so the page can open its evidence */
  signalKey?: string;
}

export interface Block {
  id: 'business' | 'expectations' | 'market';
  question: string;
  categories: string[];
  score: number | null;
  direction: Direction;
  /** one sentence, the block's answer */
  answer: string;
  facts: Fact[];
  /** the day the newest input of this block is true as of */
  asOf: string | null;
}

export const BLOCKS: { id: Block['id']; question: string; categories: string[] }[] = [
  { id: 'business', question: 'Is the business changing?', categories: ['fundamental', 'commercial', 'product'] },
  { id: 'expectations', question: 'Are expectations catching up?', categories: ['revisions', 'catalysts'] },
  { id: 'market', question: 'What has the market priced?', categories: ['priceVolume', 'institutional', 'insider', 'attention'] },
];

/* ---- formatting, kept local so the page and the tests read the same text ---- */

const pctS = (v: number | null | undefined, dp = 1) => (isNum(v) ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(dp)}%` : '—');
const pts = (v: number | null | undefined, dp = 1) => (isNum(v) ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(dp)} pts` : '—');
const tone = (v: number | null | undefined): Fact['tone'] => (!isNum(v) || v === 0 ? null : v > 0 ? 'up' : 'down');
const bn = (v: number) => `${(v / 1e9).toFixed(1)}bn`;
const dayMs = 864e5;

const rows = (bag: any, feed: string): any[] => (bag?.[feed]?.status === 'ok' && Array.isArray(bag[feed].data) ? bag[feed].data : []);
const one = (bag: any, feed: string): any => (bag?.[feed]?.status === 'ok' && bag[feed].data && !Array.isArray(bag[feed].data) ? bag[feed].data : null);
const newest = (list: any[], field = 'date') => list.filter(Boolean).slice().sort((a, b) => String(b[field] || '').localeCompare(String(a[field] || '')));
const growth = (now: unknown, prior: unknown) => (isNum(now) && isNum(prior) && prior > 0 ? (now - prior) / prior : null);

/** The weighted mean of a block's scored categories, on the composite's weights. */
function blockScore(result: any, ids: string[]): number | null {
  const cats = result.categories.filter((c: any) => ids.includes(c.id) && isNum(c.score) && c.weight > 0);
  const w = cats.reduce((t: number, c: any) => t + c.weight, 0);
  return w > 0 ? cats.reduce((t: number, c: any) => t + c.score * c.weight, 0) / w : null;
}

/** Year-on-year revenue growth for the newest `n` quarters, newest first. */
export function quarterlyGrowth(bag: any, n = 4): { period: string; growth: number | null }[] {
  const q = newest(rows(bag, 'incomeQ'));
  return q.slice(0, n).map((r, i) => ({
    period: `${r.fiscalYear || String(r.date).slice(0, 4)} ${r.period || ''}`.trim(),
    growth: growth(r.revenue, q[i + 4]?.revenue),
  }));
}

/* ==========================================================================
   The three blocks
   ========================================================================== */

function business(bag: any, sig: (k: string) => any): Fact[] {
  const out: Fact[] = [];
  const g = quarterlyGrowth(bag, 4).filter((x) => isNum(x.growth));
  if (g.length) {
    out.push({
      label: 'Revenue growth, year on year',
      value: pctS(g[0].growth),
      note: g.length > 1 ? `${g[0].period}; the quarters before: ${g.slice(1).map((x) => pctS(x.growth)).join(', ')}` : g[0].period,
      // Coloured by the change in growth, and only past a point: +16.4% after
      // +16.6% is growth holding, not a red number.
      tone: g.length > 1 && isNum(g[1].growth)
        ? (Math.abs(g[0].growth! - g[1].growth!) < 0.01 ? null : tone(g[0].growth! - g[1].growth!))
        : tone(g[0].growth),
      signalKey: 'fundamental.revenue-growth-acceleration',
    });
  }
  const om = sig('fundamental.operating-margin-expansion');
  if (om && isNum(om.raw)) {
    out.push({ label: 'Operating margin', value: `${(om.raw * 100).toFixed(1)}%`, note: `${pts(om.change)} on a year ago`, tone: tone(om.change), signalKey: om.key });
  }
  const gm = sig('fundamental.gross-margin-expansion');
  if (gm && isNum(gm.raw)) {
    out.push({ label: 'Gross margin', value: `${(gm.raw * 100).toFixed(1)}%`, note: `${pts(gm.change)} on a year ago`, tone: tone(gm.change), signalKey: gm.key });
  }
  const mix = sig('commercial.revenue-mix-shift');
  if (mix && isNum(mix.change)) {
    const name = (String(mix.interpretation).match(/"([^"]+)"/) || [])[1] || 'The largest segment';
    out.push({ label: 'Biggest mix shift', value: `${name} ${pts(mix.change)}`, note: `now ${(mix.raw * 100).toFixed(1)}% of revenue`, tone: null, signalKey: mix.key });
  }
  const rd = sig('product.r-d-intensity-change');
  if (rd && isNum(rd.raw)) {
    out.push({ label: 'R&D, share of revenue', value: `${(rd.raw * 100).toFixed(1)}%`, note: `${pts(rd.change)} on a year ago, trailing twelve months`, tone: null, signalKey: rd.key });
  }
  return out;
}

function expectations(bag: any, sig: (k: string) => any, now: Date): Fact[] {
  const out: Fact[] = [];
  const earnings = newest(rows(bag, 'earnings'));
  const reported = earnings.filter((r) => isNum(r.epsActual) && isNum(r.epsEstimated) && r.epsEstimated !== 0);
  const last = reported[0];
  if (last) {
    const s = (last.epsActual - last.epsEstimated) / Math.abs(last.epsEstimated);
    const beats = reported.slice(0, 8).filter((r) => r.epsActual > r.epsEstimated).length;
    out.push({
      label: 'Last report against consensus',
      value: `EPS ${pctS(s)}`,
      note: `${last.epsActual} vs ${last.epsEstimated} on ${last.date}; ${beats} of the last ${Math.min(8, reported.length)} beat`,
      tone: tone(s),
      signalKey: 'catalysts.last-earnings-surprise',
    });
  }

  /* The bar for the next report: what consensus revenue implies for growth
     against the same quarter a year earlier, beside the growth just reported.
     A consensus well under the current rate is a low bar; one above it is a
     bet on acceleration. Described, never scored. */
  const next = earnings
    .filter((r) => !isNum(r.epsActual) && new Date(r.date) > now)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  if (next) {
    const days = Math.round((+new Date(next.date) - +now) / dayMs);
    const yearAgo = reported.find((r) => Math.abs(+new Date(r.date) - (+new Date(next.date) - 365 * dayMs)) < 50 * dayMs);
    const implied = growth(next.revenueEstimated, yearAgo?.revenueActual);
    const latest = quarterlyGrowth(bag, 1)[0]?.growth ?? null;
    out.push({
      label: 'Next report',
      value: `${next.date} · ${days} days`,
      note: [
        isNum(next.epsEstimated) ? `consensus EPS ${next.epsEstimated}` : null,
        isNum(next.revenueEstimated) ? `revenue ${bn(next.revenueEstimated)}` : null,
        isNum(implied) ? `${pctS(implied)} on a year ago${isNum(latest) ? `, against ${pctS(latest)} last quarter` : ''}` : null,
      ].filter(Boolean).join(' · '),
      tone: null,
      signalKey: 'catalysts.next-earnings-date',
    });
  }

  const mix = sig('revisions.analyst-rating-mix-shift');
  const grades = newest(rows(bag, 'gradesHistorical'));
  if (mix && grades.length >= 4) {
    const buyers = (g: any) => (g.analystRatingsStrongBuy ?? 0) + (g.analystRatingsBuy ?? 0);
    const total = (g: any) => buyers(g) + (g.analystRatingsHold ?? 0) + (g.analystRatingsSell ?? 0) + (g.analystRatingsStrongSell ?? 0);
    const share = (g: any) => (total(g) ? buyers(g) / total(g) : null);
    const d = isNum(share(grades[0])) && isNum(share(grades[3])) ? share(grades[0])! - share(grades[3])! : null;
    out.push({
      label: 'Analysts rating it a buy',
      value: `${buyers(grades[0])} of ${total(grades[0])}`,
      note: `${pts(d, 0)} of the total since ${String(grades[3].date).slice(0, 7)}`,
      tone: tone(d),
      signalKey: mix.key,
    });
  }
  const drift = sig('revisions.eps-consensus-drift-90-days');
  if (drift && isNum(drift.change)) {
    out.push({ label: 'EPS consensus, 90 days', value: pctS(drift.change), note: 'average change across the forward years', tone: tone(drift.change), signalKey: drift.key });
  }
  const t = one(bag, 'targetSummary');
  if (t && isNum(t.lastQuarterAvgPriceTarget) && t.lastQuarterAvgPriceTarget > 0) {
    out.push({
      label: 'Average price target, last quarter',
      value: t.lastQuarterAvgPriceTarget.toFixed(2),
      note: isNum(t.lastMonthAvgPriceTarget) && (t.lastMonthCount ?? 0) > 0
        ? `last month ${t.lastMonthAvgPriceTarget.toFixed(2)} across ${t.lastMonthCount} target${t.lastMonthCount === 1 ? '' : 's'}`
        : `${t.lastQuarterCount} targets`,
      tone: null,
      signalKey: 'revisions.price-target-momentum',
    });
  }
  return out;
}

function market(bag: any, sig: (k: string) => any): Fact[] {
  const out: Fact[] = [];
  const react = sig('priceVolume.reaction-to-the-last-report');
  if (react && isNum(react.raw)) {
    out.push({
      label: 'Reaction to the last report',
      value: pctS(react.raw),
      note: isNum(react.change) ? `${pts(react.change)} against the market, two days` : 'two days',
      tone: tone(isNum(react.change) ? react.change : react.raw),
      signalKey: react.key,
    });
  }
  const r3 = sig('priceVolume.3-month-relative-strength');
  const r12 = sig('priceVolume.12-month-relative-strength');
  if (r3 && isNum(r3.raw)) {
    const prices = rows(bag, 'prices');
    const end = newest(prices)[0]?.date || null;
    const sector = bag?.__benchmarks?.industry || null;
    const sec3 = sector && end && newest(sector)[0]?.date >= end ? returnOver(sector, 92, end) : null;
    out.push({
      label: 'Three months',
      value: pctS(r3.raw),
      note: [
        isNum(r3.change) ? `${pts(r3.change)} against the market` : null,
        isNum(sec3) ? `${pts(r3.raw - sec3)} against its sector` : null,
        r12 && isNum(r12.change) ? `twelve months ${pts(r12.change)} against the market` : null,
      ].filter(Boolean).join(' · '),
      tone: tone(isNum(r3.change) ? r3.change : r3.raw),
      signalKey: r3.key,
    });
  }
  const own = sig('institutional.institutional-ownership-change');
  const hs = one(bag, 'holdersSummary');
  if (own && hs) {
    out.push({
      label: `Institutions, quarter to ${hs.date}`,
      value: `${isNum(hs.ownershipPercentChange) ? `${hs.ownershipPercentChange > 0 ? '+' : ''}${hs.ownershipPercentChange.toFixed(1)} pts` : '—'}`,
      note: `${isNum(hs.ownershipPercent) ? `${hs.ownershipPercent.toFixed(1)}% owned` : ''}${isNum(hs.investorsHoldingChange) ? ` · ${hs.investorsHoldingChange > 0 ? '+' : ''}${hs.investorsHoldingChange} holders` : ''} · next 13F due ${nextThirteenF(hs.date)}`,
      tone: tone(hs.ownershipPercentChange),
      signalKey: own.key,
    });
  }
  const ins = sig('insider.open-market-insider-activity');
  if (ins && isNum(ins.raw)) {
    out.push({
      label: 'Insider buying, four quarters',
      value: ins.raw === 0 ? 'None' : `${ins.raw} purchase${ins.raw === 1 ? '' : 's'}`,
      note: ins.raw === 0 ? `${ins.previous} routine sales, not read as a signal` : `${ins.previous} sales alongside`,
      tone: ins.raw > 0 ? 'up' : null,
      signalKey: ins.key,
    });
  }
  // Context, not a vote: the sector carries every company in it alike.
  const sector = sig('macro.sector-relative-performance');
  if (sector && isNum(sector.change)) {
    out.push({ label: 'Its sector, six months', value: pctS(sector.raw), note: `${pts(sector.change)} against the market · context, not scored`, tone: null, signalKey: sector.key });
  }
  return out;
}

/** The filing deadline for the quarter after `quarterEnd`: its end plus 45 days. */
function nextThirteenF(quarterEnd: string) {
  const d = new Date(quarterEnd);
  if (Number.isNaN(d.getTime())) return '—';
  const nextEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 4, 0));
  return new Date(+nextEnd + 45 * dayMs).toISOString().slice(0, 10);
}

/* ---- each block's sentence: its strongest facts, in words ---- */

function businessAnswer(bag: any, sig: (k: string) => any): string {
  const g = quarterlyGrowth(bag, 3).filter((x) => isNum(x.growth));
  const om = sig('fundamental.operating-margin-expansion');
  const parts: string[] = [];
  if (g.length >= 2) {
    const d = g[0].growth! - g[1].growth!;
    const held = Math.abs(d) < 0.01;
    parts.push(held
      ? `Revenue growth held at ${pctS(g[0].growth, 0)}`
      : `Revenue growth ${d > 0 ? 'accelerated' : 'slowed'} to ${pctS(g[0].growth, 0)} from ${pctS(g[1].growth, 0)}`);
  } else if (g.length) parts.push(`Revenue grew ${pctS(g[0].growth, 0)} on a year ago`);
  if (om && isNum(om.change)) parts.push(`operating margin ${om.change >= 0 ? 'widened' : 'narrowed'} ${Math.abs(om.change * 100).toFixed(1)} points on a year ago`);
  return parts.length ? `${parts.join(', and ')}.` : 'No quarterly statements were available to read the business from.';
}

function expectationsAnswer(bag: any, sig: (k: string) => any, facts: Fact[]): string {
  const parts: string[] = [];
  const surprise = sig('catalysts.last-earnings-surprise');
  if (surprise && isNum(surprise.change)) parts.push(`The last report ${surprise.change >= 0 ? 'beat' : 'missed'} EPS consensus by ${Math.abs(surprise.change * 100).toFixed(1)}%`);
  const mix = sig('revisions.analyst-rating-mix-shift');
  if (mix && isNum(mix.change) && Math.abs(mix.change) >= 0.03) parts.push(`analysts have moved their ratings ${mix.change > 0 ? 'up' : 'down'} over the quarter`);
  const drift = sig('revisions.eps-consensus-drift-90-days');
  if (drift && isNum(drift.change) && Math.abs(drift.change) >= 0.005) parts.push(`EPS consensus is ${pctS(drift.change)} over 90 days`);
  const next = facts.find((f) => f.label === 'Next report');
  const bar = next?.note?.match(/([+−-]?\d+\.\d%) on a year ago, against ([+−-]?\d+\.\d%)/);
  let tail = '';
  if (bar) tail = ` Consensus for the next report implies ${bar[1]} growth, against ${bar[2]} just reported.`;
  return parts.length ? `${parts.join('; ')}.${tail}` : `No reported quarter or rating history was available.${tail}`;
}

function marketAnswer(sig: (k: string) => any): string {
  const parts: string[] = [];
  const react = sig('priceVolume.reaction-to-the-last-report');
  if (react && isNum(react.raw)) {
    const v = isNum(react.change) ? react.change : react.raw;
    parts.push(`The stock ${react.raw >= 0 ? 'rose' : 'fell'} ${Math.abs(react.raw * 100).toFixed(1)}% on the last report${isNum(react.change) ? ` (${pts(v)} against the market)` : ''}`);
  }
  const r3 = sig('priceVolume.3-month-relative-strength');
  if (r3 && isNum(r3.change)) parts.push(`it has ${r3.change >= 0 ? 'beaten' : 'trailed'} the market by ${Math.abs(r3.change * 100).toFixed(1)} points over three months`);
  const own = sig('institutional.institutional-ownership-change');
  if (own && isNum(own.change) && Math.abs(own.change) >= 0.5) parts.push(`institutions ${own.change > 0 ? 'added' : 'cut'} ${Math.abs(own.change).toFixed(1)} points of ownership in the latest 13F quarter`);
  return parts.length ? `${parts.join('; ')}.` : 'No price history was available.';
}

/* ==========================================================================
   The brief
   ========================================================================== */

export interface Brief {
  direction: Direction;
  /** the reading in one or two sentences, assembled from the blocks */
  headline: string;
  blocks: Block[];
  /** the dates the page's inputs are true as of */
  asOf: { prices: string | null; statements: string | null; thirteenF: string | null; ratings: string | null };
  /**
   * What happened, from the headlines: event-tagged stories in the newest
   * month of the news feed, copies merged. Shown under the market block;
   * never scored (see `lib/news-events`).
   */
  news: { stories: Story<NewsRow>[]; articles: number; from: string | null; to: string | null };
}

export interface NewsRow { title: string; date: string; source: string; url: string | null }

/** Event-tagged stories from the news feed, newest month only, newest first. */
export function recentEvents(bag: any, keep = 6): Brief['news'] {
  const rows: NewsRow[] = (bag?.news?.status === 'ok' && Array.isArray(bag.news.data) ? bag.news.data : [])
    .map((r: any) => ({ title: String(r?.title || '').trim(), date: String(r?.publishedDate || r?.date || ''), source: r?.publisher || r?.site || '', url: r?.url || null }))
    .filter((r: NewsRow) => r.title && r.date);
  if (!rows.length) return { stories: [], articles: 0, from: null, to: null };
  const dates = rows.map((r) => r.date).sort();
  const to = dates[dates.length - 1];
  const cut = new Date(+new Date(to) - 30 * dayMs).toISOString();
  const recent = rows.filter((r) => r.date >= cut.slice(0, 10));
  return { stories: eventStories(groupStories(recent)).slice(0, keep), articles: recent.length, from: dates[0], to };
}

export function buildBrief(bag: any, result: any, now = new Date()): Brief {
  const byKey = new Map<string, any>();
  for (const s of result.categories.flatMap((c: any) => c.signals)) if (!byKey.has(s.key)) byKey.set(s.key, s);
  const sig = (k: string) => {
    const s = byKey.get(k);
    return s && s.status !== 'insufficient_data' ? s : null;
  };

  const facts = { business: business(bag, sig), expectations: expectations(bag, sig, now), market: market(bag, sig) };
  const answers = {
    business: businessAnswer(bag, sig),
    expectations: expectationsAnswer(bag, sig, facts.expectations),
    market: marketAnswer(sig),
  };
  const lastFiled = newest(rows(bag, 'incomeQ'))[0];
  const asOf = {
    prices: newest(rows(bag, 'prices'))[0]?.date || null,
    statements: lastFiled?.filingDate || lastFiled?.date || null,
    thirteenF: one(bag, 'holdersSummary')?.date || null,
    ratings: feedAsOf(bag, 'gradesHistorical'),
  };
  const blockAsOf = { business: asOf.statements, expectations: asOf.ratings || feedAsOf(bag, 'earnings'), market: asOf.prices };

  const blocks: Block[] = BLOCKS.map((b) => {
    const score = blockScore(result, b.categories);
    return { ...b, score, direction: directionOf(score), answer: answers[b.id], facts: facts[b.id], asOf: blockAsOf[b.id] };
  });

  /* The headline: the business first, then the first sentence of every block
     that reads differently from it, because the tension between the blocks
     is the finding — a business improving under a market that already sold
     the news is a different situation from one improving unnoticed. When all
     three agree, the business sentence says it. */
  const direction = directionOf(result.score);
  const lead = blocks.find((b) => b.id === 'business')!;
  const differing = blocks.filter((b) => b.id !== 'business' && b.direction !== 'unmeasured' && b.direction !== lead.direction);
  const headline = [lead.answer, ...differing.map((b) => `${b.answer.split(/[.;] /)[0].replace(/\.$/, '')}.`)].join(' ');

  return { direction, headline, blocks, asOf, news: recentEvents(bag) };
}
