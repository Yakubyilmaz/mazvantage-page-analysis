/* Outside voices in the Research report (2026-10-09): the rules every quote
   keeps — short, attributed, dated, linked where a public copy exists, cut
   only with an ellipsis — and anchors that land on a paragraph that exists. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { VOICES, linkOf, wordCount } from '@/lib/research-voices';

const ROOT = path.resolve(import.meta.dirname, '..');
const research = JSON.parse(readFileSync(path.join(ROOT, 'public/data/research.json'), 'utf8'));
const QUANT_KEYS = ['lead', 'factors', 'valuation', 'profitability', 'growth', 'health', 'closing'];

describe('every quote', () => {
  it('is a sentence or less', () => {
    for (const v of VOICES) expect(wordCount(v.quote), v.quote).toBeLessThanOrEqual(35);
  });

  it('marks a cut at the start with an ellipsis', () => {
    // A quote that opens mid-sentence starts lower case; it must say so.
    for (const v of VOICES) if (/^[a-z]/.test(v.quote)) throw new Error(`unmarked cut: ${v.quote}`);
  });

  it('carries no straight quote marks that would collide with the typeset ones', () => {
    for (const v of VOICES) expect(v.quote).not.toMatch(/"/);
  });

  it('names who said it, where and when', () => {
    for (const v of VOICES) {
      expect(v.speaker, v.quote).toBeTruthy();
      expect(v.source, v.quote).toBeTruthy();
      expect(v.date, v.quote).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
      expect(v.note.length, v.quote).toBeGreaterThan(20);
    }
  });

  it('links a competitor’s or the press’s words to where they were published', () => {
    for (const v of VOICES.filter((x) => x.kind === 'competitor' || x.kind === 'press')) expect(linkOf(v), v.source).toMatch(/^https:\/\//);
  });

  it('links every letter and research quote to the publisher, through the library', () => {
    for (const v of VOICES.filter((x) => x.kind === 'letter' || x.kind === 'research')) {
      expect(v.letterId, v.source).toBeTruthy();
      expect(linkOf(v), v.source).toMatch(/^https:\/\//);
    }
  });
});

describe('anchors', () => {
  it('land on a paragraph the written narrative has', () => {
    for (const v of VOICES.filter((x) => x.section !== 'quant')) {
      const sec = research[v.symbol]?.sections?.[v.section];
      const paras = v.section === 'note' ? sec?.why : sec;
      expect(Array.isArray(paras), `${v.symbol} ${v.section}`).toBe(true);
      expect(typeof v.after).toBe('number');
      expect(v.after as number).toBeLessThan(paras.length);
    }
  });

  it('use the quant section’s paragraph keys', () => {
    for (const v of VOICES.filter((x) => x.section === 'quant')) expect(QUANT_KEYS).toContain(v.after);
  });

  it('weigh both ways: some quotes challenge the paragraph, not only confirm it', () => {
    const rel = new Set(VOICES.map((v) => v.relation));
    expect(rel).toEqual(new Set(['confirms', 'challenges', 'adds']));
  });

  it('draw on the four core kinds of source', () => {
    const kinds = new Set(VOICES.map((v) => v.kind));
    for (const k of ['management', 'letter', 'research', 'analyst']) expect(kinds.has(k as any), k).toBe(true);
  });
});
