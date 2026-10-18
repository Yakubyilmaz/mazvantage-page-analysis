/* The written research narratives against the page (2026-10-11). The prompt's
   first rule is that every figure in the prose appears, as written, in the
   brief; this holds the saved narratives to it, pins the ratings they name,
   and checks the page-side guard that drops a section once its figures move.
   A failure here means a narrative needs rewriting, not the test loosening. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { researchRatings } from '@/lib/research-model';
import { buildBrief, figuresIn, freshSections, paragraphsOf, ratingConflicts, unbackedFigures } from '@/lib/narrative';
import { price, dec } from '@/lib/format';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = (f: string) => JSON.parse(readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
const sectorStats = load('sector-stats.json');
const report = (sym: string) => {
  const snap = load(`${sym}.json`);
  return analyse(
    makeDataset(sym, Object.fromEntries(Object.entries(snap.feeds).map(([k, v]) => [k, { status: 'ok', data: v }])) as any),
    { sectorStats, benchmarks: snap.extras.benchmarks, peerRatios: snap.extras.peerRatios, peerGrowth: snap.extras.peerGrowth, peerMetrics: snap.extras.peerMetrics },
  ) as any;
};
const narratives = load('research.json');
const SYMBOLS = Object.keys(narratives).filter((k) => !k.startsWith('_'));

describe('reading figures out of prose', () => {
  it('takes money, percentages, multiples and decimals in the forms the brief prints', () => {
    expect(figuresIn('Revenue of US$109.4b, a 6.9% surprise, on 35.3x earnings and a beta of 1.09.'))
      .toEqual(['US$109.4b', '6.9%', '35.3x', '1.09']);
  });

  it('drops the sign, so a fall the brief prints as -4.8% can be written "lagging by 4.8%"', () => {
    expect(figuresIn('down -4.8% and up +3.1%')).toEqual(['4.8%', '3.1%']);
  });

  it('leaves years, counts and product names alone', () => {
    expect(figuresIn('In fiscal 2026 the 30 analysts saw GB10 and M5 chips, 128 GB of memory.')).toEqual([]);
  });
});

describe.each(SYMBOLS)('the %s narrative', (sym) => {
  const a = report(sym);
  const r = researchRatings(a);
  const brief = buildBrief(a, r);
  const entry = narratives[sym];

  it('cites no figure the page does not show', () => {
    expect(unbackedFigures(entry.sections, brief).map((u) => `${u.key}: ${u.figure}`)).toEqual([]);
  });

  it('names no rating other than the one the page shows', () => {
    expect(ratingConflicts(entry.sections, r).map((c) => `${c.key}: “${c.said}”, page shows ${c.is}`)).toEqual([]);
  });

  it('records the figures it was written against, and they are still the page’s', () => {
    expect(entry.basis.fairValue).toBe(price(r.fve.value));
    expect(entry.basis.quantRating).toBe(`${r.quant.verdict} · ${r.quant.letter} · ${dec(r.quant.score, 2)} of 5`);
    expect(entry.basis.price).toBe(price(a.facts.price));
  });

  it('survives the page-side check whole', () => {
    const { sections, stale } = freshSections(entry.sections, brief, r);
    expect(stale).toEqual([]);
    expect(Object.keys(sections).sort()).toEqual(Object.keys(entry.sections).sort());
  });
});

describe('the page-side check', () => {
  const a = report('AAPL');
  const r = researchRatings(a);
  const brief = buildBrief(a, r);
  const sections = structuredClone(narratives.AAPL.sections);

  it('drops a section that cites a figure from before the estimate moved, and keeps the rest', () => {
    const s = structuredClone(sections);
    s.fairValue[0] = s.fairValue[0].replace('US$191.80', 'US$186.53');
    const out = freshSections(s, brief, r);
    expect(out.stale).toEqual([{ section: 'fairValue', reasons: ['US$186.53'] }]);
    expect(out.sections.fairValue).toBeUndefined();
    expect(out.sections.moat).toEqual(sections.moat);
  });

  it('drops a section that names a rating the page no longer shows', () => {
    const s = structuredClone(sections);
    s.risk[0] = s.risk[0].replace('Low uncertainty', 'Medium uncertainty');
    const out = freshSections(s, brief, r);
    expect(out.stale.map((x) => x.section)).toEqual(['risk']);
    expect(ratingConflicts(s, r)[0]).toMatchObject({ said: 'Medium uncertainty', is: 'uncertainty Low' });
  });

  it('takes bulls and bears down together, because the page prints them as one section', () => {
    const s = structuredClone(sections);
    s.bulls[0] = `${s.bulls[0]} It also trades at 99.9x.`;
    const out = freshSections(s, brief, r);
    expect(out.sections.bulls).toBeUndefined();
    expect(out.sections.bears).toBeUndefined();
  });

  it('checks every paragraph, the Analyst Note’s parts included', () => {
    const keys = paragraphsOf(sections).map((p) => p.key);
    expect(keys).toContain('note.headline');
    expect(keys).toContain('note.bottomLine');
    expect(keys).toContain('capital[5]');
  });
});

describe('the brief', () => {
  it('carries the readings the Research tab prints beside the prose', () => {
    const a = report('NVDA');
    const b = buildBrief(a, researchRatings(a));
    expect(b.profitDrivers.length).toBeGreaterThan(0);
    expect(b.valuationDetail!.models.length).toBeGreaterThan(0);
    expect(b.valuationDetail!.setAside.map((m: any) => m.model)).toContain('Price / Book Multiples');
    expect(b.scenarios!.bull!.fairValue).toMatch(/^US\$/);
    expect(b.peers!.ratios.length).toBe(12);
    expect(b.events.map((e: any) => e.deal?.headlineValue).filter(Boolean)).toContain('US$12.93b');
  });
});
