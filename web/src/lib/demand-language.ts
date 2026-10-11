/* ==========================================================================
   Maz Vantage — Demand Discovery: what management says about demand

   A deterministic reader for earnings-call transcripts. It finds the
   sentences that talk about demand, supply, orders, pricing or inventory,
   decides whether each argues demand is outrunning supply or the reverse,
   and reports a score from −100 to +100 with the sentences that drove it.

   ---------------------------------------------------------------------------
   Why not a language model
   ---------------------------------------------------------------------------

   No model service is wired into this app (see `narrative.ts`), and a
   rule-based reader has two properties a model does not: the same text
   always scores the same, and every point of the score traces to a quoted
   sentence and a listed word. The rules are crude and say so. "Demand
   remains weak" scores negative and "demand remains exceptionally strong"
   positive, as the spec asks; sarcasm, hedged guidance and numbers without
   adjectives are missed.

   ---------------------------------------------------------------------------
   Three choices that matter
   ---------------------------------------------------------------------------

   1. **Only management counts.** Analysts' questions are full of demand
      words ("are you seeing weakness?") that are not evidence. A speaker
      most of whose sentences are questions is treated as an analyst and
      skipped, and so is any sentence ending in a question mark.
   2. **Shortage words are positive.** "Supply constrained", "sold out",
      "allocation" sound bad and mean demand is ahead of supply — the thing
      this feature looks for.
   3. **Negation flips a word** within the three tokens before it, so "not
      seeing any weakness" counts for demand, not against it.

   The score is shrunk toward zero when few sentences qualify, so a call
   with two upbeat sentences cannot read as strongly positive.

   Language is the weakest evidence the engine reads and is weighted that
   way: management is never more upbeat than at a peak. Albemarle's
   February 2023 call, near the top of lithium, is in the pilot for that
   reason.
   ========================================================================== */

export type LanguageCategory = 'strongly positive' | 'positive' | 'neutral' | 'negative' | 'strongly negative' | 'no signal';

export type LanguageFlag =
  | 'acceleration' | 'deceleration' | 'capacityConstraint' | 'supplyShortage' | 'pricingPower'
  | 'backlogIncrease' | 'orderCancellation' | 'inventoryCorrection';

export const FLAG_LABELS: Record<LanguageFlag, string> = {
  acceleration: 'Acceleration',
  deceleration: 'Deceleration',
  capacityConstraint: 'Capacity constraint',
  supplyShortage: 'Supply shortage',
  pricingPower: 'Pricing power',
  backlogIncrease: 'Backlog increase',
  orderCancellation: 'Order cancellation',
  inventoryCorrection: 'Customer inventory correction',
};

export const TOPIC = /\b(demand|orders?|order book|bookings?|backlog|book-to-bill|capacity|sold out|lead times?|shortages?|supply|constrain\w*|tight\w*|allocat\w*|pricing|prices?|inventor(y|ies)|utili[sz]ation|shipments?|pipeline|volumes?)\b/i;

export const POSITIVE = [
  'strong', 'stronger', 'strongest', 'robust', 'record', 'accelerate', 'accelerated', 'accelerating', 'acceleration',
  'tight', 'tighter', 'tightness', 'tightening', 'sold out', 'shortage', 'shortages', 'constrained', 'constraint', 'constraints', 'constraining',
  'exceeded', 'exceeding', 'healthy', 'momentum', 'upside', 'raised', 'raising', 'surge', 'surging', 'unprecedented',
  'pent-up', 'latent demand', 'allocation', 'allocated', 'committed', 'higher pricing', 'price increases', 'price increase',
  'increasing demand', 'demand growth', 'strengthening', 'strengthened', 'outpacing', 'insatiable', 'booming',
];

export const NEGATIVE = [
  'weak', 'weaker', 'weakness', 'soft', 'softer', 'softness', 'softening', 'slowdown', 'slowing', 'slower', 'declined', 'decline',
  'declining', 'digestion', 'digesting', 'destock', 'destocking', 'correction', 'excess', 'oversupply', 'glut', 'cancellation',
  'cancellations', 'cancelled', 'canceled', 'push-out', 'push-outs', 'pushouts', 'headwind', 'headwinds', 'cautious', 'caution',
  'uncertainty', 'uncertain', 'lower pricing', 'price declines', 'price decline', 'pricing pressure', 'moderation', 'moderate',
  'normalization', 'normalizing', 'deteriorat*', 'challenging', 'sluggish',
];

const FLAGS: [LanguageFlag, RegExp][] = [
  ['acceleration', /\baccelerat\w*/i],
  ['deceleration', /\b(decelerat\w*|slowing|slowdown)\b/i],
  ['capacityConstraint', /\b(capacity[- ]constrain\w*|constrain\w* (the )?supply|supply[- ]constrain\w*|clean ?room|tight supply|supply is tight|running at full utili[sz]ation|fully utili[sz]ed)\b/i],
  ['supplyShortage', /\b(shortages?|sold out|on allocation|allocat\w* (with|to) (our )?customers)\b/i],
  ['pricingPower', /\b(price increases?|higher pricing|raised prices|pricing (is )?(up|increas\w*)|increased (that )?pricing)\b/i],
  ['backlogIncrease', /\b(record backlog|backlog (grew|increas\w*|expand\w*)|book-to-bill (above|of|was) 1\.[1-9])\b/i],
  ['orderCancellation', /\b(cancel\w*|push-?outs?)\b/i],
  ['inventoryCorrection', /\b(destock\w*|inventory correction|excess inventor\w*|digest\w* (of )?inventor\w*|inventor\w* (build|digestion|elevated|too high))\b/i],
];

const NEGATORS = /^(not|no|never|without|hardly|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|haven't|hasn't|won't|nor|less)$/i;
export const BOILERPLATE = /(forward-looking|safe harbor|cautionary language|non-gaap|reconciliation|webcast|replay|press release)/i;

export interface ScoredSentence {
  speaker: string;
  text: string;
  /** −2..+2 */
  polarity: number;
  positives: string[];
  negatives: string[];
  flags: LanguageFlag[];
}

export interface LanguageReading {
  score: number | null;
  category: LanguageCategory;
  sentences: number;
  positive: number;
  negative: number;
  flags: Partial<Record<LanguageFlag, number>>;
  /** at most three each way, each cut to 25 words */
  topPositive: ScoredSentence[];
  topNegative: ScoredSentence[];
  speakersSkipped: string[];
  /** every scored sentence, uncut, only when `keepScored` asks for it */
  scored?: ScoredSentence[];
}

/** The words a reader scores with. Demand Discovery's is the default. */
export interface Lexicon {
  positive: string[];
  negative: string[];
  /** how many tokens before a word a negator may sit; 3 unless set */
  negationWindow?: number;
}
export const DEMAND_LEXICON: Lexicon = { positive: POSITIVE, negative: NEGATIVE };

/**
 * How a reader differs from Demand Discovery's. Every field is optional and
 * the defaults are that reader exactly, so the pilot's scores cannot move
 * when another page asks for a different reading.
 */
export interface ReaderOptions {
  /** which sentences count at all */
  topic?: RegExp;
  lexicon?: Lexicon;
  /** quotes kept each way */
  top?: number;
  /** treat anyone the operator introduces as an analyst (see `parseCall`) */
  introduced?: boolean;
  /** sentences to skip on top of the shared boilerplate */
  skip?: RegExp;
  /** how a turn is cut into sentences */
  split?: (text: string) => string[];
  /** also return every scored sentence, for a caller that groups them */
  keepScored?: boolean;
}

const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9'\- ]+/g, ' ').split(/\s+/).filter(Boolean);

/**
 * Find each lexicon phrase in a sentence, honouring a negator in the three
 * tokens before it. Words match exactly; a trailing `*` marks a stem.
 */
function hits(tokens: string[], lexicon: string[], window = 3): { plain: string[]; negated: string[] } {
  const plain: string[] = [];
  const negated: string[] = [];
  for (const phrase of lexicon) {
    const parts = phrase.split(' ');
    for (let i = 0; i + parts.length <= tokens.length; i++) {
      const ok = parts.every((p, k) => (p.endsWith('*') ? tokens[i + k].startsWith(p.slice(0, -1)) : tokens[i + k] === p));
      if (!ok) continue;
      const before = tokens.slice(Math.max(0, i - window), i);
      (before.some((t) => NEGATORS.test(t)) ? negated : plain).push(phrase);
      i += parts.length - 1;
    }
  }
  return { plain, negated };
}

export function scoreSentence(text: string, speaker = '', lexicon: Lexicon = DEMAND_LEXICON): ScoredSentence {
  const tokens = tokenize(text);
  const pos = hits(tokens, lexicon.positive, lexicon.negationWindow);
  const neg = hits(tokens, lexicon.negative, lexicon.negationWindow);
  const positives = [...pos.plain, ...neg.negated.map((w) => `not ${w}`)];
  const negatives = [...neg.plain, ...pos.negated.map((w) => `not ${w}`)];
  const raw = positives.length - negatives.length;
  const flags = FLAGS.filter(([, re]) => re.test(text)).map(([f]) => f);
  return { speaker, text, polarity: Math.max(-2, Math.min(2, raw)), positives, negatives, flags };
}

export function cut(text: string, words = 25): string {
  const w = text.trim().split(/\s+/);
  return w.length <= words ? text.trim() : `${w.slice(0, words).join(' ')} …`;
}

export function categoryOf(score: number | null): LanguageCategory {
  if (score === null) return 'no signal';
  if (score >= 50) return 'strongly positive';
  if (score >= 15) return 'positive';
  if (score > -15) return 'neutral';
  if (score > -50) return 'negative';
  return 'strongly negative';
}

export interface CallTurn { speaker: string; text: string }

export interface ParsedCall {
  turns: CallTurn[];
  /** speakers treated as asking, not answering: the operator and the analysts */
  analysts: Set<string>;
  /** analyst → firm, where the operator named one ("… from Amit Daryanani of Evercore") */
  firms: Map<string, string>;
}

export const splitSentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z"'])/).map((s) => s.trim()).filter((s) => s.length > 3);

/* "our first question from Amit Daryanani from Evercore", "comes from the
   line of Ben Reitzes with Melius Research", "is from Michael Ng of Goldman
   Sachs", "we will now go to Samik Chatterjee of JPMorgan". Only names after
   "question", "line" or "go to": an operator also says "turn the call over
   to Tim Cook", and that name is management's. */
const INTRO = /(?:\b(?:question|line)\b[^.]*?\b(?:from|of)|\bgo to)\s+(?:the line of\s+)?([A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,3}?)(?:\s+(?:from|of|with|at)\s+((?:[A-Z]\.(?:[A-Z]\.)*|[A-Z](?:[\w&'-]|\.(?=\S))*)(?:\s+(?:of|and|&|[A-Z]\.(?:[A-Z]\.)*|[A-Z](?:[\w&'-]|\.(?=\S))*)){0,4}))?(?=[.,]|\s+(?:please|go ahead|your line)|$)/g;

/**
 * Split a transcript into speaker turns and decide who is asking. Lines are
 * `Speaker: text`; anything before a line of three dashes is a header.
 *
 * `introduced` also counts as an analyst anyone the operator introduces with
 * a question. Without it a speaker is an analyst only when a quarter of their
 * sentences are questions — and an analyst who opens with four sentences of
 * thanks and context before one question falls under that line and is read
 * as management. Demand Discovery's stored readings were made without it.
 */
export function parseCall(text: string, introduced = false): ParsedCall {
  // A file saved on Windows ends its lines in \r\n, and `.` stops at \r.
  const raw = text.replace(/\r\n?/g, '\n');
  const body = raw.includes('\n---\n') ? raw.split('\n---\n').slice(1).join('\n') : raw;
  const turns: CallTurn[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*([A-Z][\w.'\- ]{1,60}?):\s+(.*)$/);
    if (m) turns.push({ speaker: m[1].trim(), text: m[2] });
    else if (turns.length && line.trim()) turns[turns.length - 1].text += ` ${line.trim()}`;
  }

  const asks = new Map<string, { q: number; n: number }>();
  for (const { speaker, text } of turns) {
    const s = splitSentences(text);
    const a = asks.get(speaker) || { q: 0, n: 0 };
    a.n += s.length;
    a.q += s.filter((x) => x.endsWith('?')).length;
    asks.set(speaker, a);
  }
  const analysts = new Set([...asks].filter(([name, a]) => /operator/i.test(name) || (a.n > 0 && a.q / a.n >= 0.25)).map(([n]) => n));
  const firms = new Map<string, string>();
  if (introduced) {
    const speakers = new Set(asks.keys());
    for (const { speaker, text } of turns) {
      if (!/operator/i.test(speaker)) continue;
      for (const m of text.matchAll(INTRO)) {
        const name = m[1].trim();
        if (!speakers.has(name)) continue;
        analysts.add(name);
        if (m[2]) firms.set(name, m[2].trim());
      }
    }
  }
  return { turns, analysts, firms };
}

/**
 * Read one transcript: management's sentences on the topic, scored, with the
 * strongest each way quoted.
 */
export function readTranscript(raw: string, opts: ReaderOptions = {}): LanguageReading {
  const topic = opts.topic || TOPIC;
  const lexicon = opts.lexicon || DEMAND_LEXICON;
  const keep = opts.top ?? 3;
  const { turns, analysts } = parseCall(raw, opts.introduced);
  const split = opts.split || splitSentences;

  const scored: ScoredSentence[] = [];
  for (const { speaker, text } of turns) {
    if (analysts.has(speaker)) continue;
    for (const s of split(text)) {
      if (s.endsWith('?') || BOILERPLATE.test(s) || opts.skip?.test(s) || !topic.test(s)) continue;
      scored.push(scoreSentence(s, speaker, lexicon));
    }
  }

  const flags: Partial<Record<LanguageFlag, number>> = {};
  for (const s of scored) for (const f of s.flags) flags[f] = (flags[f] || 0) + 1;
  const P = scored.filter((s) => s.polarity > 0).length;
  const N = scored.filter((s) => s.polarity < 0).length;
  const n = P + N;
  const score = n ? Math.round(((100 * (P - N)) / n) * (n / (n + 5))) : null;
  const byStrength = (a: ScoredSentence, b: ScoredSentence) => Math.abs(b.polarity) - Math.abs(a.polarity) || b.text.length - a.text.length;
  const top = (sel: ScoredSentence[]) => sel.sort(byStrength).slice(0, keep).map((s) => ({ ...s, text: cut(s.text) }));
  return {
    score,
    category: categoryOf(score),
    sentences: scored.length,
    positive: P,
    negative: N,
    flags,
    topPositive: top(scored.filter((s) => s.polarity > 0)),
    topNegative: top(scored.filter((s) => s.polarity < 0)),
    speakersSkipped: [...analysts],
    ...(opts.keepScored ? { scored } : {}),
  };
}
