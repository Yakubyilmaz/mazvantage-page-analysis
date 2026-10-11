/* ==========================================================================
   Maz Vantage — the bull and bear case in management's own words

   Demand Discovery quotes what management said about demand for the
   companies in its chains. This is the same reader pointed at every company with an
   earnings-call transcript, and at the whole business rather than demand
   alone: growth, margins, guidance, costs, competition, regulation.

   It reads the newest call and the one before, and returns:

   - the strongest sentences management said for the business (the bull case
     in their words) and against it (what they conceded);
   - what the analysts on the call pressed on — their sentences that carry a
     negative word, with the firm the operator named. Management rarely
     argues its own bear case; the questions are where it is put to them;
   - a tone score, −100 to +100, and its change from the previous call.

   ---------------------------------------------------------------------------
   Three differences from Demand Discovery's reader, all deliberate
   ---------------------------------------------------------------------------

   1. **A wider topic.** A business sentence, not only a demand sentence.
   2. **A supply constraint counts against.** For Demand Discovery "supply
      constrained" means demand is ahead of supply, the thing it looks for.
      On a company's own call it is revenue the company could not book, and
      the strength of demand shows in its own words ("high levels of
      demand"). "Sold out" stays positive. The flag is still counted.
   3. **Analysts are found by introduction** as well as by their share of
      questions (`parseCall`), so an analyst's preamble is never quoted as
      management.

   It also skips the safe-harbour paragraph, splits "95%. iPad revenue" as
   two sentences, and drops a quote that mostly repeats one already chosen.

   Rule-based, like the reader it extends: the same text always scores the
   same, and every point traces to a quoted sentence and a listed word. Never
   part of the Alpha Signal score — management is never more upbeat than at
   a peak. Quotes are cut to 25 words and the transcript itself is not kept.
   ========================================================================== */

import {
  BOILERPLATE, NEGATIVE, POSITIVE, TOPIC, cut, parseCall, readTranscript, scoreSentence,
  type LanguageReading, type Lexicon, type ScoredSentence,
} from '@/lib/demand-language';

export const VOICE_VERSION = '1.0';

/** Demand Discovery's topic plus the rest of a business. */
export const BUSINESS_TOPIC = new RegExp(`${TOPIC.source}|\\b(guidance|guide[ds]?|outlook|margins?|growth|gr[eo]w\\w*|revenues?|sales|earnings|eps|profit\\w*|customers?|subscri\\w*|users?|market share|share gains?|competi\\w*|costs?|expenses?|cash flow|repurchas\\w*|buybacks?|dividends?|tariffs?|regulat\\w*|currency|foreign exchange|fx|headwinds?|tailwinds?|records?|install(ed)? base|retention|churn|pricing)\\b`, 'i');

/* Words that change meaning between a demand reading and a company's own
   case (note 2), and words that are mostly something else in a business
   sentence: "noise cancellation", "excess cash", "not to beat this to death". */
const NOT_HERE = new Set([
  'tight', 'tighter', 'tightness', 'tightening', 'shortage', 'shortages', 'constrained', 'constraint', 'constraints', 'constraining',
  'allocation', 'allocated', 'cancellation', 'cancellations', 'cancelled', 'canceled', 'excess', 'moderate',
  // Whose price? "Memory price increases exceeded our expectations" is a cost.
  'price increase', 'price increases', 'higher pricing',
]);

export const BUSINESS_LEXICON: Lexicon = {
  positive: [
    ...POSITIVE.filter((w) => !NOT_HERE.has(w)),
    'records', 'all-time high', 'all-time record', 'gained share', 'share gains', 'tailwind', 'tailwinds', 'improved', 'improving',
    'improvement', 'expanded', 'expansion', 'outperformed', 'double-digit growth', 'grew', 'margin expansion', 'high levels of demand',
  ],
  negative: [
    ...NEGATIVE.filter((w) => !NOT_HERE.has(w)),
    'constraint', 'constraints', 'constrained', 'constraining', 'shortage', 'shortages',
    'order cancellations', 'cancelled orders', 'canceled orders', 'excess inventory', 'excess capacity',
    'deceleration', 'decel', 'decelerate', 'decelerating', 'pull forward', 'pull-forward',
    'pressure', 'pressures', 'pressured', 'compression', 'contraction', 'shortfall', 'fell', 'was down', 'were down', 'is down', 'are down', 'difficult', 'tough', 'losses',
    'impairment', 'inflation', 'delays', 'delayed', 'scrambling', 'less flexibility', 'limited flexibility', 'higher costs',
    'memory costs', 'input costs', 'commodity costs', 'component costs', 'cost inflation', 'cost increases',
  ],
  // "no evidence of a slowdown": the negator sits four words back.
  negationWindow: 4,
};

/** The safe-harbour paragraph and the call's housekeeping. */
const SKIP = /(risks and uncertainties|differ materially|risk factors|form 10-[kq]|form 8-k|assumes no obligation|limit yourself)/i;

/* The shared splitter wants a capital after the full stop; product names
   such as iPad and iPhone start with a small letter and a capital. */
export const splitBusiness = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z"']|[a-z][A-Z])/).map((x) => x.trim()).filter((x) => x.length > 3);

const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9']+/g) || []);

/** Share of the smaller sentence's words found in the other. */
function overlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  if (!small.size) return 0;
  let n = 0;
  for (const w of small) if (big.has(w)) n += 1;
  return n / small.size;
}

/** Keep the strongest, skipping any that mostly repeats one already kept. */
function distinct<T extends { text: string }>(list: T[], keep: number): T[] {
  const out: T[] = [];
  for (const x of list) {
    if (out.length >= keep) break;
    if (out.some((y) => overlap(x.text, y.text) > 0.6)) continue;
    out.push(x);
  }
  return out;
}

export interface Concern {
  analyst: string;
  /** the firm the operator named, when it named one */
  firm: string | null;
  text: string;
  negatives: string[];
}

/* ==========================================================================
   The case in points

   Every management sentence that scored either way is filed under the
   subjects it names — supply, costs, currency and so on — and each subject
   becomes one bullet on the side the sentences fell: "Supply is limiting
   what they can sell · 13 sentences". The wording is fixed per subject and
   side, so a bullet says only what any sentence filed under it must mean;
   the count and the quotes beside it are the evidence. A sentence naming
   several subjects counts under each. Growth and the outlook are the
   catch-alls — nearly every sentence on a call is about one or the other —
   so a sentence lands there only when it names nothing more specific.
   ========================================================================== */

interface Theme { id: string; re: RegExp; bull: string; bear: string; fallback?: boolean }

export const THEMES: Theme[] = [
  { id: 'supply', re: /\b(supply|constrain\w*|constraints?|shortages?|capacity|flexibility|allocation)\b/i, bull: 'Supply is keeping up with orders', bear: 'Supply is limiting what they can sell' },
  { id: 'costs', re: /\b(costs?|expenses?|inflation|memory|commodit\w*|components?|opex)\b/i, bull: 'Costs are under control', bear: 'Costs are rising' },
  { id: 'margin', re: /\b(margins?|profitab\w*)\b/i, bull: 'Margins are holding or widening', bear: 'Margins are under pressure' },
  { id: 'fx', re: /\b(foreign exchange|currenc\w*|fx)\b/i, bull: 'Currency is helping', bear: 'Currency is a headwind' },
  { id: 'pricing', re: /\bpric(e|es|ing)\b/i, bull: 'They have room on price', bear: 'Pricing is a pressure point' },
  { id: 'rules', re: /\b(regulat\w*|courts?|ruling|legal|antitrust|tariffs?|commission|sanctions?|export controls?)\b/i, bull: 'Tariffs or rulings went their way', bear: 'Regulation, courts or tariffs weigh on them' },
  { id: 'share', re: /\b(market share|gained share|share gains?|competi\w*|rivals?)\b/i, bull: 'They are winning share', bear: 'Competition is biting' },
  { id: 'customers', re: /\b(install(ed)? base|users?|subscri\w*|accounts?|retention|churn|upgraders?)\b/i, bull: 'The customer base is growing', bear: 'Customers are slipping or churning' },
  { id: 'regions', re: /\b(china|emerging markets?|developed markets?|europe\w*|india|japan|international|geograph\w*|regions?|countries)\b/i, bull: 'Strength across regions', bear: 'Weak spots by region' },
  { id: 'products', re: /\b(ai|artificial intelligence|new products?|product cycle|lineup|roadmap|innovation)\b/i, bull: 'New products are landing well', bear: 'New products face hurdles' },
  { id: 'demand', re: /\b(demand|orders?|bookings?|backlog|pipeline)\b/i, bull: 'Demand is strong', bear: 'Demand is softening' },
  { id: 'capital', re: /\b(repurchas\w*|buybacks?|dividends?|cash flow|balance sheet)\b/i, bull: 'Cash generation and returns to shareholders', bear: 'Cash or the balance sheet is under strain' },
  { id: 'outlook', re: /\b(guid\w*|outlook|expect\w*|forecast\w*|next quarter|going forward)\b/i, bull: 'The outlook is good', bear: 'The outlook is weaker', fallback: true },
  { id: 'growth', re: /\b(revenues?|sales|growth|gr[eo]w\w*|records?|earnings|eps)\b/i, bull: 'Revenue and earnings are growing, with records set', bear: 'Growth is slowing or falling in places', fallback: true },
];

export interface CasePoint {
  theme: string;
  /** the fixed wording for this subject and side */
  text: string;
  /** management sentences filed under it */
  count: number;
  /** the scored words those sentences used most, at most three */
  words: string[];
  /** the strongest of them, cut to 25 words */
  example: string;
  speaker: string;
}

/**
 * Which subjects a sentence names: every specific one, else the first
 * catch-all. `against` is the scored words pulling the other way: a subject
 * only they name is not this side's — "record revenue despite supply
 * constraints" is a bull sentence, but not one about supply. And a
 * constraint is about supply even when it names the demand behind it.
 */
export function themesOf(text: string, against: string[] = []): string[] {
  const theirs = (t: Theme) => against.some((w) => t.re.test(w));
  const specific = THEMES.filter((t) => !t.fallback && t.re.test(text) && !theirs(t)).map((t) => t.id);
  const own = specific.includes('supply') ? specific.filter((id) => id !== 'demand') : specific;
  if (own.length) return own;
  const loose = THEMES.find((t) => t.fallback && t.re.test(text) && !theirs(t));
  return loose ? [loose.id] : [];
}

/** One bullet per subject on one side, most sentences first. */
export function casePoints(scored: ScoredSentence[], side: 'bull' | 'bear', keep = 5): CasePoint[] {
  const sel = scored.filter((s) => (side === 'bull' ? s.polarity > 0 : s.polarity < 0));
  const by = new Map<string, ScoredSentence[]>();
  for (const s of sel) {
    for (const id of themesOf(s.text, side === 'bull' ? s.negatives : s.positives)) by.set(id, [...(by.get(id) || []), s]);
  }
  const points = THEMES.filter((t) => by.has(t.id)).map((t): CasePoint => {
    const list = by.get(t.id)!;
    const tally = new Map<string, number>();
    for (const s of list) for (const w of side === 'bull' ? s.positives : s.negatives) tally.set(w, (tally.get(w) || 0) + 1);
    const best = list.slice().sort((a, b) => Math.abs(b.polarity) - Math.abs(a.polarity) || b.text.length - a.text.length)[0];
    return {
      theme: t.id,
      text: side === 'bull' ? t.bull : t.bear,
      count: list.length,
      words: [...tally].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w),
      example: cut(best.text),
      speaker: best.speaker,
    };
  }).sort((a, b) => b.count - a.count);
  // A subject one sentence touched is a mention, not a case — unless that is all there is.
  const solid = points.filter((p) => p.count >= 2);
  return (solid.length >= 2 ? solid : points).slice(0, keep);
}

export interface VoiceReading extends LanguageReading {
  /** analysts' sentences that carry a negative word, strongest first, at most four */
  concerns: Concern[];
  /** how many analysts asked */
  analysts: number;
  /** management's case grouped by subject; absent on readings saved before it existed */
  points?: { bull: CasePoint[]; bear: CasePoint[] };
}

export interface VoiceCall {
  symbol: string;
  /** "2026 Q3": the company's fiscal year and quarter */
  period: string;
  /** the day of the call */
  date: string;
  reading: VoiceReading;
}

/** Read one call for the company's case, both ways. */
export function readCall(raw: string): VoiceReading {
  const { scored = [], ...base } = readTranscript(raw, {
    topic: BUSINESS_TOPIC, lexicon: BUSINESS_LEXICON, top: 12, introduced: true, skip: SKIP, split: splitBusiness, keepScored: true,
  });
  const points = { bull: casePoints(scored, 'bull'), bear: casePoints(scored, 'bear') };
  const topPositive = distinct(base.topPositive, 4);
  const topNegative = distinct(base.topNegative, 4);
  const { turns, analysts, firms } = parseCall(raw, true);

  const asked: (Concern & { weight: number })[] = [];
  const seen = new Set<string>();
  for (const { speaker, text } of turns) {
    if (!analysts.has(speaker) || /operator/i.test(speaker)) continue;
    for (const s of splitBusiness(text)) {
      if (BOILERPLATE.test(s) || SKIP.test(s) || !BUSINESS_TOPIC.test(s)) continue;
      const sc: ScoredSentence = scoreSentence(s, speaker, BUSINESS_LEXICON);
      if (sc.polarity >= 0 || seen.has(s)) continue;
      seen.add(s);
      asked.push({ analyst: speaker, firm: firms.get(speaker) || null, text: cut(s), negatives: sc.negatives, weight: -sc.polarity });
    }
  }
  /* One per analyst first, so a single persistent questioner cannot fill
     the list; then the rest by strength. */
  asked.sort((a, b) => b.weight - a.weight || b.text.length - a.text.length);
  const firstEach = asked.filter((c, i) => asked.findIndex((x) => x.analyst === c.analyst) === i);
  const concerns = distinct([...firstEach, ...asked.filter((c) => !firstEach.includes(c))], 4)
    .map(({ weight, ...c }) => c);
  const askers = new Set([...analysts].filter((n) => !/operator/i.test(n)));
  return { ...base, topPositive, topNegative, concerns, analysts: askers.size, points };
}

/** A row of the transcript index, as the dataset carries it. */
export interface CallDate { year: number; quarter: number; date: string }

/** The newest `n` calls on or before `asOf`, newest first. */
export function latestCalls(index: unknown, n = 2, asOf: string | null = null): CallDate[] {
  if (!Array.isArray(index)) return [];
  return index
    .map((r: any) => ({ year: Number(r?.fiscalYear ?? r?.year), quarter: Number(r?.quarter), date: String(r?.date || '').slice(0, 10) }))
    .filter((r) => Number.isFinite(r.year) && r.quarter >= 1 && r.quarter <= 4 && r.date && (!asOf || r.date <= asOf))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
}

/** The change in tone from one call to the next, in words. */
export function toneShift(latest: VoiceReading | null, previous: VoiceReading | null): { delta: number | null; text: string } {
  if (!latest || latest.score === null) return { delta: null, text: 'Too few business sentences on the newest call to read a tone.' };
  if (!previous || previous.score === null) return { delta: null, text: 'No earlier call to compare it with.' };
  const delta = latest.score - previous.score;
  const size = Math.abs(delta);
  const word = size < 10 ? 'about the same as' : delta > 0 ? (size >= 30 ? 'much more upbeat than' : 'more upbeat than') : (size >= 30 ? 'much more cautious than' : 'more cautious than');
  return { delta, text: `${word} the call before (${previous.score >= 0 ? '+' : ''}${previous.score} → ${latest.score >= 0 ? '+' : ''}${latest.score})` };
}
