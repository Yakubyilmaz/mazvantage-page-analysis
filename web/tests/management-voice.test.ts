/* The management-voice reader: the bull and bear case in management's words.

   Always: unit checks on small hand-written calls, and invariants on the
   bundled example file.

   With VOICE_CALLS=<dir of .txt transcripts> and VOICE_WRITE=1, it reads
   every transcript there and rewrites public/data/management-voice.json —
   scores and quotes of at most 25 words, never the transcript. With
   VOICE_MERGE=1 as well, only the calls read replace their namesakes and
   every other saved call is kept. Each file is
   `symbol: X / period: 2026 Q3 / date: YYYY-MM-DD`, a `---` line, then the
   call as `Speaker: text` lines. */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCall, readTranscript, scoreSentence } from '@/lib/demand-language';
import { BUSINESS_LEXICON, VOICE_VERSION, casePoints, latestCalls, readCall, themesOf, toneShift, type VoiceCall } from '@/lib/management-voice';

const DATA = path.resolve(import.meta.dirname, '../public/data');
const FILE = path.join(DATA, 'management-voice.json');

const CALL = [
  'symbol: X', 'period: 2026 Q3', 'date: 2026-07-30', '---',
  'Jo Ir: Welcome. Some statements are forward-looking. I will turn the call over to Sam Chief.',
  'Sam Chief: Revenue grew 20% to a record, and margins expanded on strong demand.',
  'Sam Chief: We did see softness in China, and FX remains a headwind to revenue.',
  'Ann Money: Gross margin was a record. We expect cost pressure from memory to weigh on margins next quarter.',
  'Operator: Our first question comes from Pat Analyst from Big Bank. Please go ahead.',
  'Pat Analyst: Thanks, and congratulations on the quarter. Margins are under pressure from memory costs and growth is slowing. Two things. First, the guide implies a deceleration. Can you walk us through it?',
  'Sam Chief: Demand is strong and we are not seeing any weakness.',
  'Operator: We will now go to Lee Asker of Bank of America.',
  'Lee Asker: Hi. Services growth was weaker than you guided. Is that a decline in the App Store?',
].join('\n');

describe('the management-voice reader', () => {
  it('finds analysts by introduction, with their firm', () => {
    const p = parseCall(CALL, true);
    expect(p.analysts.has('Pat Analyst')).toBe(true);
    expect(p.analysts.has('Lee Asker')).toBe(true);
    expect(p.firms.get('Pat Analyst')).toBe('Big Bank');
    expect(p.firms.get('Lee Asker')).toBe('Bank of America');
    // Named by the operator only as someone the call is turned over to.
    expect(p.analysts.has('Sam Chief')).toBe(false);
  });

  it('without introductions, an analyst with a long preamble reads as management', () => {
    // The flaw `introduced` exists to fix: one question in five sentences.
    expect(parseCall(CALL, false).analysts.has('Pat Analyst')).toBe(false);
  });

  it('quotes management both ways and never an analyst as management', () => {
    const r = readCall(CALL);
    const quoted = [...r.topPositive, ...r.topNegative];
    expect(quoted.every((s) => s.speaker === 'Sam Chief' || s.speaker === 'Ann Money')).toBe(true);
    expect(r.topPositive.length).toBeGreaterThan(0);
    expect(r.topNegative.some((s) => /softness|pressure/.test(s.text))).toBe(true);
    expect(r.analysts).toBe(2);
  });

  it('puts the analysts’ pushback in its own list, one per analyst first', () => {
    const r = readCall(CALL);
    expect(r.concerns.length).toBeGreaterThan(0);
    expect(new Set(r.concerns.slice(0, 2).map((c) => c.analyst)).size).toBe(2);
    expect(r.concerns.find((c) => c.analyst === 'Pat Analyst')?.firm).toBe('Big Bank');
  });

  it('counts a supply constraint against a company’s own case', () => {
    const raw = ['---', 'Sam Chief: Revenue was supply constrained this quarter.'].join('\n');
    expect(readCall(raw).negative).toBe(1);
    expect(readCall(raw).flags.capacityConstraint).toBe(1);
    // Demand Discovery still reads the same sentence as demand ahead of supply.
    expect(readTranscript(raw).positive).toBe(1);
  });

  it('skips the safe harbour, splits before product names and drops near-repeats', () => {
    const raw = ['---',
      'Sam Chief: These statements involve risks and uncertainties that may cause results to differ materially.',
      'Sam Chief: Mac revenue was $10bn, a record. iPad revenue was $6bn, down 6% on a difficult compare.',
      'Sam Chief: We set revenue records in every category, with records in advertising and music.',
      'Sam Chief: We set revenue records in every category, with records in advertising and video.',
      'Sam Chief: The active noise cancellation in AirPods drove record sales.',
    ].join('\n');
    const r = readCall(raw);
    const all = [...r.topPositive, ...r.topNegative].map((s) => s.text);
    expect(all.some((t) => /differ materially/.test(t))).toBe(false);
    expect(r.topNegative.map((s) => s.text)).toContain('iPad revenue was $6bn, down 6% on a difficult compare.');
    expect(all.filter((t) => t.startsWith('We set revenue records')).length).toBe(1);
    expect(r.topNegative.some((s) => /cancellation/.test(s.text))).toBe(false);
  });

  it('leaves Demand Discovery’s reader exactly as it was by default', () => {
    const r = readTranscript(CALL);
    expect(r.topPositive.length).toBeLessThanOrEqual(3);
    // Pat Analyst's preamble is still read as management there: the stored
    // pilot readings were made this way and are not silently changed.
    expect(r.speakersSkipped).not.toContain('Pat Analyst');
  });

  it('keeps firms whose names start with initials', () => {
    const raw = ['---',
      'Operator: Our next question comes from Jeff Van Sinderen with B. Riley Securities.',
      'Jeff Van Sinderen: Are there other delays?',
      'Operator: Our next question is from Matt Summerville of D.A. Davidson. Please go ahead.',
      'Matt Summerville: What happened in the supply chain?',
    ].join('\n');
    const p = parseCall(raw, true);
    expect(p.firms.get('Jeff Van Sinderen')).toBe('B. Riley Securities');
    expect(p.firms.get('Matt Summerville')).toBe('D.A. Davidson');
  });

  it('reads a negator four words back, and leaves ambiguous words out', () => {
    const r = readCall(['---',
      'Sam Chief: Cloud demand shows no evidence of a slowdown.',
      'Sam Chief: Our cost down per terabyte continued, and customers made down payments on capacity.',
      'Sam Chief: Memory price increases exceeded what we expected and pushed our costs up.',
    ].join('\n'));
    expect(r.topPositive.some((s) => /no evidence of a slowdown/.test(s.text))).toBe(true);
    expect(r.topNegative.some((s) => /cost down|down payments/.test(s.text))).toBe(false);
    // Whose price rose is not in the words, so neither way.
    expect(scoreSentence('Memory price increases hit us.', '', BUSINESS_LEXICON).positives).not.toContain('price increases');
  });

  it('groups the case into subjects, a catch-all only when nothing specific is named', () => {
    expect(themesOf('We expect supply constraints and FX headwinds next quarter.')).toEqual(['supply', 'fx']);
    expect(themesOf('Revenue grew 20% to a record.')).toEqual(['growth']);
    expect(themesOf('The sky is blue.')).toEqual([]);
    const r = readCall(CALL);
    expect(r.points?.bull.length).toBeGreaterThan(0);
    expect(r.points?.bear.some((p) => p.theme === 'costs' || p.theme === 'fx')).toBe(true);
    // Every point traces to a sentence management said on that side.
    for (const p of [...r.points!.bull, ...r.points!.bear]) expect(['Sam Chief', 'Ann Money']).toContain(p.speaker);
  });

  it('drops one-sentence subjects once two or more have a case', () => {
    const s = (text: string, polarity: number) => ({ speaker: 'A', text, polarity, positives: polarity > 0 ? ['strong'] : [], negatives: polarity < 0 ? ['weak'] : [], flags: [] });
    const pts = casePoints([s('Demand is strong.', 1), s('Demand is strong again.', 1), s('Margins were strong.', 1), s('Margins strong too.', 1), s('Pricing was strong.', 1)], 'bull');
    expect(pts.map((p) => p.theme)).toEqual(['margin', 'demand']);
    expect(pts[0].words).toEqual(['strong']);
  });

  it('picks the newest calls on or before a date', () => {
    const idx = [
      { quarter: 1, fiscalYear: 2026, date: '2026-01-29' },
      { quarter: 3, fiscalYear: 2026, date: '2026-07-30' },
      { quarter: 2, fiscalYear: 2026, date: '2026-04-30' },
    ];
    expect(latestCalls(idx, 2).map((c) => c.quarter)).toEqual([3, 2]);
    expect(latestCalls(idx, 2, '2026-05-01').map((c) => c.quarter)).toEqual([2, 1]);
    expect(latestCalls(null)).toEqual([]);
  });

  it('describes a change in tone and refuses to read one from nothing', () => {
    const r = (score: number | null) => ({ ...readCall(CALL), score });
    expect(toneShift(r(40), r(10)).text).toMatch(/^much more upbeat/);
    expect(toneShift(r(5), r(10)).text).toMatch(/^about the same/);
    expect(toneShift(r(null), r(10)).delta).toBeNull();
    expect(toneShift(r(20), null).delta).toBeNull();
  });
});

function loadCalls(): VoiceCall[] | null {
  const dir = process.env.VOICE_CALLS;
  if (!dir || !existsSync(dir)) return null;
  return readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => {
    const raw = readFileSync(path.join(dir, f), 'utf8').replace(/\r\n?/g, '\n');
    const head = Object.fromEntries(raw.split('\n---\n')[0].split('\n').map((l) => l.split(': ').map((s) => s.trim())));
    return { symbol: head.symbol, period: head.period, date: head.date, reading: readCall(raw) };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol) || b.date.localeCompare(a.date));
}

describe('the bundled example', () => {
  const fresh = loadCalls();
  if (fresh && process.env.VOICE_WRITE === '1') {
    const key = (c: VoiceCall) => `${c.symbol} ${c.period}`;
    const kept = process.env.VOICE_MERGE === '1' && existsSync(FILE)
      ? (JSON.parse(readFileSync(FILE, 'utf8')).calls as VoiceCall[]).filter((c) => !fresh.some((f) => key(f) === key(c)))
      : [];
    writeFileSync(FILE, `${JSON.stringify({
      about: 'Readings from the rule-based management-voice reader. Quotes are at most 25 words; the transcripts are not stored.',
      version: VOICE_VERSION,
      calls: [...kept, ...fresh].sort((a, b) => a.symbol.localeCompare(b.symbol) || b.date.localeCompare(a.date)),
    }, null, 1)}\n`);
  }

  it('holds readings, never transcripts', () => {
    if (!existsSync(FILE)) return;
    const file = JSON.parse(readFileSync(FILE, 'utf8'));
    expect(file.version).toBe(VOICE_VERSION);
    for (const c of file.calls as VoiceCall[]) {
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const quotes = [...c.reading.topPositive, ...c.reading.topNegative, ...c.reading.concerns];
      for (const p of [...(c.reading.points?.bull || []), ...(c.reading.points?.bear || [])]) {
        expect(p.example.replace(/ …$/, '').split(/\s+/).length).toBeLessThanOrEqual(25);
      }
      for (const q of quotes) expect(q.text.replace(/ …$/, '').split(/\s+/).length).toBeLessThanOrEqual(25);
      if (c.reading.score !== null) expect(Math.abs(c.reading.score)).toBeLessThanOrEqual(100);
    }
  });
});
