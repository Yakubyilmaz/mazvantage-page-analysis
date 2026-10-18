/* ==========================================================================
   Maz Vantage — the Research report's editions

   A Morningstar report is a dated document: each note carries its date, and
   a change of rating or fair value is a new edition with the reason given.
   This page recomputes on every load, so without a record it has no past.
   `EDITIONS` is that record: what the report said on the day each edition
   was written, kept by hand like `lib/events.ts`, with one paragraph of ours
   on what moved and why.

   Two readings come off it:

   - **since the last edition**: the ratings now against the latest edition.
     When nothing has moved (the bundled copy, the day it was written) it
     shows the latest edition against the one before, with that edition's
     own reason. When a live key has moved something, it shows today against
     the latest edition and says what moved, in words built from the figures.
   - **the earnings note**: a dated note on the latest reported quarter, the
     results against consensus, what management said on the call (the saved
     reading in `management-voice.json`, quotes of at most 25 words), and
     how the estimate moved across it, where editions on both sides exist.

   Nothing here enters a grade, and nothing here is a forecast.
   ========================================================================== */

import { fmtDate, isNum, money, pct, price, dec, curSymbol } from './format';
import { FACTOR_TITLES } from './research-peers';
import type { VoiceCall } from './management-voice';

export type Trigger = 'initiation' | 'earnings' | 'method' | 'data' | 'event';

export const TRIGGER_LABEL: Record<Trigger, string> = {
  initiation: 'First edition', earnings: 'After earnings', method: 'Method change', data: 'Data refresh', event: 'Company event',
};

type FactorKey = 'valuation' | 'growth' | 'profitability' | 'health' | 'momentum';

/** What the report said on one day: the ratings and the figures they rest on. */
export interface EditionReading {
  price: number | null;
  fairValue: number | null;
  /** models in the fair value estimate */
  models: number | null;
  zone: string | null;
  quant: { verdict: string | null; letter: string | null; score: number | null };
  /** factor scores, where they were recorded; an edition written before they were kept may have only some */
  factors: Partial<Record<FactorKey, number>>;
  moat: string | null;
  uncertainty: string | null;
  capital: string | null;
}

export interface Edition extends EditionReading {
  symbol: string;
  /** the day it was written */
  date: string;
  /** the data it was written from, when that differs from the day */
  dataAsOf?: string;
  triggers: Trigger[];
  /** the Analyst Note's headline that day */
  headline: string;
  /** ours: what moved since the edition before, and why; absent on the first */
  changed?: string;
}

export const EDITIONS: Edition[] = [
  {
    symbol: 'AAPL', date: '2026-09-08', dataAsOf: '2026-09-08', triggers: ['initiation'],
    headline: 'Apple\'s Returns on Capital Keep Widening While the Price Runs Ahead of Every Model We Run',
    price: 309.35, fairValue: 186.53, models: 13, zone: 'Overvalued',
    quant: { verdict: 'Hold', letter: 'B', score: 2.89 },
    // The September note quoted only these two factors; the other three were not recorded.
    factors: { valuation: 1.69, profitability: 3.95 },
    moat: 'Wide', uncertainty: 'Medium', capital: 'Standard',
  },
  {
    symbol: 'AAPL', date: '2026-10-12', dataAsOf: '2026-10-09', triggers: ['method', 'data'],
    headline: 'Apple\'s Returns on Capital Keep Widening While the Price Runs Ahead of Every Model We Run',
    price: 309.35, fairValue: 191.80, models: 10, zone: 'Overvalued',
    quant: { verdict: 'Hold', letter: 'B', score: 2.98 },
    factors: { valuation: 1.69, growth: 2.79, profitability: 3.95, health: 2.79, momentum: 3.66 },
    moat: 'Wide', uncertainty: 'Low', capital: 'Standard',
    changed: 'The fair value estimate rose from US$186.53 to US$191.80 because of a change of method, not of view: since 10 October the '
      + 'estimate is the median of the models that describe the company, and three that do not were set aside (price/book, because a '
      + '137% return on equity leaves book value a small part of what Apple earns on, and the two sales multiples, because Apple keeps '
      + '28% of sales as profit against a sector median of 9%). With the outliers gone the models agree more closely, and the '
      + 'uncertainty rating fell from Medium to Low, which narrows the band the price is read against. The quant score rose from 2.89 '
      + 'to 2.98 after prices and analyst estimates were refreshed to 9 October; the verdict, Hold, and the grade, B, are unchanged, and '
      + 'so is the valuation zone.',
  },
  {
    symbol: 'NVDA', date: '2026-10-10', dataAsOf: '2026-10-10', triggers: ['initiation'],
    headline: 'NVIDIA Takes Its Data Center Franchise Into the PC While the Price Runs Ahead of the Cash Flows',
    price: 229.28, fairValue: 190.64, models: 10, zone: 'Fairly valued',
    quant: { verdict: 'Buy', letter: 'B+', score: 3.46 },
    factors: { valuation: 1.66, growth: 4.05, profitability: 3.59, health: 4.42, momentum: 3.56 },
    moat: 'Wide', uncertainty: 'Medium', capital: 'Exemplary',
  },
];

/** A company's editions, newest first. */
export function editionsFor(symbol: string): Edition[] {
  return EDITIONS.filter((e) => e.symbol === symbol).sort((x, y) => y.date.localeCompare(x.date));
}

/** The page's reading now, in the shape an edition records. */
export function readingOf(a: any, r: any): EditionReading {
  const factors: Partial<Record<FactorKey, number>> = {};
  for (const f of r?.quant?.factors || []) if (isNum(f.score)) factors[f.key as FactorKey] = Number(f.score.toFixed(2));
  return {
    price: isNum(a?.facts?.price) ? a.facts.price : null,
    fairValue: isNum(r?.fve?.value) ? Number(r.fve.value.toFixed(2)) : null,
    models: isNum(r?.fve?.count) ? r.fve.count : null,
    zone: r?.zone?.label ?? null,
    quant: { verdict: r?.quant?.verdict ?? null, letter: r?.quant?.letter ?? null, score: isNum(r?.quant?.score) ? Number(r.quant.score.toFixed(2)) : null },
    factors,
    moat: r?.moat?.key ? r.moat.label : null,
    uncertainty: r?.unc?.label ?? null,
    capital: r?.capital?.key ? r.capital.label : null,
  };
}

const cents = (v: number | null) => (isNum(v) ? Math.round(v * 100) : null);

/** Same reading, to the precision the page prints: prices to the cent, scores to two places. */
export function sameReading(x: EditionReading, y: EditionReading): boolean {
  return cents(x.price) === cents(y.price) && cents(x.fairValue) === cents(y.fairValue) && x.zone === y.zone
    && x.quant.verdict === y.quant.verdict && x.quant.letter === y.quant.letter && cents(x.quant.score) === cents(y.quant.score)
    && x.moat === y.moat && x.uncertainty === y.uncertainty && x.capital === y.capital;
}

export interface Change { label: string; from: string; to: string; moved: boolean }

/** The readings side by side, each marked moved or not. */
export function compare(prev: EditionReading, now: EditionReading, cur = 'US$'): Change[] {
  const q = (x: EditionReading) => (x.quant.verdict ? `${x.quant.verdict} · ${x.quant.letter} · ${isNum(x.quant.score) ? dec(x.quant.score, 2) : 'n/a'}` : 'n/a');
  const row = (label: string, from: string, to: string): Change => ({ label, from, to, moved: from !== to });
  return [
    row('Quant rating', q(prev), q(now)),
    row('Fair value estimate', isNum(prev.fairValue) ? price(prev.fairValue, cur) : 'n/a', isNum(now.fairValue) ? price(now.fairValue, cur) : 'n/a'),
    row('Models in the estimate', isNum(prev.models) ? String(prev.models) : 'n/a', isNum(now.models) ? String(now.models) : 'n/a'),
    row('Price', isNum(prev.price) ? price(prev.price, cur) : 'n/a', isNum(now.price) ? price(now.price, cur) : 'n/a'),
    row('Valuation zone', prev.zone || 'n/a', now.zone || 'n/a'),
    row('Uncertainty', prev.uncertainty || 'n/a', now.uncertainty || 'n/a'),
    row('Economic moat', prev.moat || 'n/a', now.moat || 'n/a'),
    row('Capital allocation', prev.capital || 'n/a', now.capital || 'n/a'),
  ];
}

const move = (from: number, to: number) => pct(to / from - 1, { sign: true });

/**
 * What moved between two readings, in words built from the figures. Used
 * when a live key has moved the page past its latest edition, where no one
 * has yet written the reason.
 */
export function changeProse(prev: EditionReading, now: EditionReading, since: string, cur = 'US$'): string[] {
  const out: string[] = [];
  const q = prev.quant;
  const n = now.quant;
  if (isNum(q.score) && isNum(n.score) && cents(q.score) !== cents(n.score)) {
    const shared = (Object.keys(now.factors) as FactorKey[]).filter((k) => isNum(prev.factors[k]) && isNum(now.factors[k]));
    const biggest = shared.sort((x, y) => Math.abs(now.factors[y]! - prev.factors[y]!) - Math.abs(now.factors[x]! - prev.factors[x]!))[0];
    out.push(`The quant rating ${n.verdict === q.verdict && n.letter === q.letter ? `is still ${n.verdict}, grade ${n.letter}, but its score` : `moved from ${q.verdict} (${q.letter}) to ${n.verdict} (${n.letter}), and its score`} `
      + `went from ${dec(q.score, 2)} to ${dec(n.score, 2)}`
      + `${biggest && Math.abs(now.factors[biggest]! - prev.factors[biggest]!) >= 0.01
        ? `; the largest move was in ${FACTOR_TITLES[biggest].toLowerCase()}, ${dec(prev.factors[biggest]!, 2)} to ${dec(now.factors[biggest]!, 2)}` : ''}.`);
  }
  if (isNum(prev.fairValue) && isNum(now.fairValue) && cents(prev.fairValue) !== cents(now.fairValue)) {
    out.push(`The fair value estimate moved from ${price(prev.fairValue, cur)} to ${price(now.fairValue, cur)} (${move(prev.fairValue, now.fairValue)}), `
      + `${isNum(prev.models) && isNum(now.models) && prev.models !== now.models
        ? `and now rests on ${now.models} models against ${prev.models}, so part of the move is which models describe the company.`
        : 'on the same set of models rerun on newer figures.'}`);
  }
  if (isNum(prev.price) && isNum(now.price) && cents(prev.price) !== cents(now.price)) {
    out.push(`The price moved from ${price(prev.price, cur)} to ${price(now.price, cur)} (${move(prev.price, now.price)})`
      + `${prev.zone && now.zone ? (prev.zone === now.zone ? `, and the shares still screen ${now.zone.toLowerCase()}.` : `, and the shares now screen ${now.zone.toLowerCase()} rather than ${prev.zone.toLowerCase()}.`) : '.'}`);
  } else if (prev.zone && now.zone && prev.zone !== now.zone) {
    out.push(`The shares now screen ${now.zone.toLowerCase()} rather than ${prev.zone.toLowerCase()}.`);
  }
  for (const [label, k] of [['uncertainty rating', 'uncertainty'], ['moat rating', 'moat'], ['capital allocation rating', 'capital']] as const) {
    if (prev[k] && now[k] && prev[k] !== now[k]) out.push(`The ${label} moved from ${prev[k]} to ${now[k]}.`);
  }
  if (!out.length) out.push(`No rating or estimate has moved since the ${fmtDate(since)} edition.`);
  return out;
}

export interface SinceLast {
  /** the edition the page is compared with */
  base: Edition;
  /** the reading compared against it: the latest edition, or today when today has moved past it */
  against: 'edition' | 'today';
  /** the latest edition, when the page still matches it */
  current: Edition | null;
  rows: Change[];
  prose: string[];
}

/** The comparison the Analyst Note prints; null when the company has no edition on record. */
export function sinceLastEdition(symbol: string, now: EditionReading, currency?: string): SinceLast | null {
  const eds = editionsFor(symbol);
  if (!eds.length) return null;
  const cur = currency ? curSymbol(currency) : 'US$';
  const [latest, previous] = eds;
  if (!sameReading(latest, now)) {
    return { base: latest, against: 'today', current: null, rows: compare(latest, now, cur), prose: changeProse(latest, now, latest.date, cur) };
  }
  if (!previous) return { base: latest, against: 'edition', current: latest, rows: [], prose: [] };
  return {
    base: previous, against: 'edition', current: latest, rows: compare(previous, latest, cur),
    prose: latest.changed ? [latest.changed] : changeProse(previous, latest, previous.date, cur),
  };
}

/* ==========================================================================
   The earnings note
   ========================================================================== */

const DAY = 864e5;
const near = (x: string, y: string, days: number) => Math.abs(Date.parse(x) - Date.parse(y)) <= days * DAY;
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const OUTLOOK = /\b(expect|guid|outlook|forecast|anticipate|next quarter|current quarter|september quarter|december quarter)/i;

export interface EarningsNote {
  date: string;
  paras: string[];
  /** forward-looking lines from the call, at most two, as saved (25 words or fewer) */
  outlook: { speaker: string; text: string }[];
}

/**
 * The note on the latest reported quarter. Built from what exists: the
 * results when the calendar carries them, the call when a reading of it is
 * saved within a week of the results, the editions either side of it when
 * there are any. Null when there is neither a result nor a call.
 */
export function earningsNote(a: any, calls: VoiceCall[], editions: Edition[] = editionsFor(a?.facts?.symbol)): EarningsNote | null {
  const f = a?.facts || {};
  const name = String(f.name || f.symbol || 'The company').replace(/,?\s+(Inc\.?|Corporation|Corp\.?|Co\.?|Ltd\.?|plc|N\.V\.|S\.A\.)$/i, '');
  const cur = curSymbol(f.currency);
  const q = a?.quarter;
  const mine = calls.filter((c) => c.symbol === f.symbol).sort((x, y) => y.date.localeCompare(x.date));
  const date: string | null = q?.available ? q.date : mine[0]?.date ?? null;
  if (!date) return null;
  const call = mine.find((c) => near(c.date, date, 7)) || null;
  const before = call ? mine.find((c) => c.date < call.date) || null : null;
  const paras: string[] = [];

  if (q?.available && (isNum(q.eps) || isNum(q.revenue))) {
    const side = (s: number) => `${pct(Math.abs(s))} ${s >= 0 ? 'ahead' : 'behind'}`;
    const parts: string[] = [];
    if (isNum(q.eps)) parts.push(`earnings per share were ${price(q.eps, cur)}${isNum(q.epsEstimate) ? ` against a ${price(q.epsEstimate, cur)} consensus${isNum(q.epsSurprise) ? `, ${side(q.epsSurprise)}` : ''}` : ''}`);
    if (isNum(q.revenue)) parts.push(`revenue was ${money(q.revenue, { currency: cur })}${isNum(q.revenueEstimate) ? ` against ${money(q.revenueEstimate, { currency: cur })} expected${isNum(q.revenueSurprise) ? `, ${side(q.revenueSurprise)}` : ''}` : ''}`);
    const s = a.surprises;
    const record = s && isNum(s.scored) && s.scored >= 4
      ? ` That makes ${s.beats} beats on earnings in ${s.scored} scored quarters${s.beats === s.scored ? ', a record that says as much about how the company guides as about how it trades' : ''}.`
      : '';
    paras.push(`${name} reported on ${fmtDate(date)}: ${parts.join(', and ')}.${record}`);
  } else {
    paras.push(`The results for the quarter are not in this copy of the data; what follows is the earnings call of ${fmtDate(date)}.`);
  }

  const outlook: { speaker: string; text: string }[] = [];
  if (call) {
    const r = call.reading;
    const tone = isNum(r.score) ? `${r.score >= 0 ? '+' : ''}${r.score}` : null;
    const shift = before && isNum(r.score) && isNum(before.reading.score)
      ? (() => {
        const d = r.score! - before.reading.score!;
        const w = Math.abs(d) < 10 ? 'about the same as' : d > 0 ? 'more upbeat than' : 'more cautious than';
        return `, ${w} the call before (${before.reading.score! >= 0 ? '+' : ''}${before.reading.score} on ${fmtDate(before.date)})`;
      })()
      : '';
    const bull = (r.points?.bull || []).slice(0, 3).map((p) => lc(p.text));
    const bear = (r.points?.bear || []).slice(0, 3).map((p) => lc(p.text));
    paras.push([
      tone ? `On the call (${call.period}), management’s language read ${r.category}, a tone of ${tone}${shift}.` : `On the call (${call.period}), too few business sentences were spoken to read a tone.`,
      bull.length ? `Their case, in our grouping of what they said: ${bull.join('; ')}.` : '',
      bear.length ? `Against it they named: ${bear.join('; ')}.` : '',
      isNum(r.analysts) && r.analysts > 0 ? `The ${r.analysts} analysts on the call asked questions${r.concerns?.length ? `, and ${r.concerns.length === 1 ? 'one of them carried' : `the sharpest ${r.concerns.length} carried`} a negative word` : ''}.` : '',
    ].filter(Boolean).join(' '));

    const pool = [...(r.points?.bull || []).map((p) => ({ speaker: p.speaker, text: p.example })), ...(r.points?.bear || []).map((p) => ({ speaker: p.speaker, text: p.example })),
      ...(r.topPositive || []).map((s: any) => ({ speaker: s.speaker, text: s.text })), ...(r.topNegative || []).map((s: any) => ({ speaker: s.speaker, text: s.text }))];
    for (const x of pool) {
      if (outlook.length >= 2) break;
      if (x?.text && OUTLOOK.test(x.text) && !outlook.some((o) => o.text === x.text)) outlook.push({ speaker: x.speaker, text: x.text });
    }
  }

  const eds = [...editions].sort((x, y) => x.date.localeCompare(y.date));
  const pre = [...eds].reverse().find((e) => (e.dataAsOf || e.date) < date) || null;
  const post = eds.find((e) => (e.dataAsOf || e.date) >= date) || null;
  if (pre && post && pre !== post) {
    paras.push(`Across the call our fair value estimate went from ${price(pre.fairValue, cur)} (the ${fmtDate(pre.date)} edition) to ${price(post.fairValue, cur)} (${fmtDate(post.date)}), `
      + `and the quant rating from ${pre.quant.verdict}, ${dec(pre.quant.score, 2)}, to ${post.quant.verdict}, ${dec(post.quant.score, 2)}.`);
  } else if (post) {
    paras.push(`No edition of this report predates the call, so there is no before-and-after for our estimate; the first edition, ${fmtDate(eds[0].date)}, was written after it.`);
  }
  if (q?.next) paras.push(`The next report is due ${fmtDate(q.next)}.`);
  return { date, paras, outlook };
}
