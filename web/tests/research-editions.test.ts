/* The Research report's editions and earnings note (2026-10-12). The latest
   edition must still be what the bundled copy shows, so a change to the
   model that moves a rating fails here until someone records a new edition
   with the reason. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeDataset } from '@/lib/fmp';
import { analyse } from '@/lib/model';
import { researchRatings } from '@/lib/research-model';
import { buildBrief, briefFigures, figuresIn } from '@/lib/narrative';
import { EDITIONS, changeProse, earningsNote, editionsFor, readingOf, sameReading, sinceLastEdition, type Edition } from '@/lib/research-editions';
import { dec, price } from '@/lib/format';

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
const calls = load('management-voice.json').calls;
const SYMBOLS = [...new Set(EDITIONS.map((e) => e.symbol))];

describe.each(SYMBOLS)('%s editions', (sym) => {
  const a = report(sym);
  const r = researchRatings(a);
  const eds = editionsFor(sym);

  it('ends on the reading the bundled copy shows', () => {
    expect(sameReading(eds[0], readingOf(a, r))).toBe(true);
  });

  it('is dated, newest first, with a reason on every edition after the first', () => {
    for (let i = 0; i < eds.length; i++) {
      expect(eds[i].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (i < eds.length - 1) expect(eds[i].date > eds[i + 1].date).toBe(true);
      if (i === eds.length - 1) expect(eds[i].changed).toBeUndefined();
      else expect(eds[i].changed, eds[i].date).toBeTruthy();
    }
  });

  it('carries the narrative’s headline on the latest edition', () => {
    expect(eds[0].headline).toBe(load('research.json')[sym]?.sections.note.headline);
  });

  it('gives reasons whose figures are the page’s or the edition before’s', () => {
    const ok = briefFigures(buildBrief(a, r));
    for (let i = 0; i < eds.length - 1; i++) {
      const prev = eds[i + 1];
      for (const f of [price(prev.fairValue), price(prev.price), dec(prev.quant.score!, 2)]) ok.add(f);
      expect(figuresIn(eds[i].changed!).filter((f) => !ok.has(f))).toEqual([]);
    }
  });
});

describe('since the last edition', () => {
  const a = report('AAPL');
  const r = researchRatings(a);
  const now = readingOf(a, r);

  it('shows the latest edition against the one before when the page has not moved', () => {
    const s = sinceLastEdition('AAPL', now)!;
    expect(s.against).toBe('edition');
    expect(s.base.date).toBe('2026-09-08');
    expect(s.rows.filter((c) => c.moved).map((c) => c.label)).toEqual(['Quant rating', 'Fair value estimate', 'Models in the estimate', 'Uncertainty']);
    expect(s.prose[0]).toMatch(/change of method/);
  });

  it('shows today against the latest edition, in words from the figures, once a live price has moved', () => {
    const moved = { ...now, price: 250, zone: 'Fairly valued' };
    const s = sinceLastEdition('AAPL', moved)!;
    expect(s.against).toBe('today');
    expect(s.base.date).toBe('2026-10-12');
    expect(s.prose.join(' ')).toMatch(/The price moved from US\$309\.35 to US\$250\.00 \(-19\.2%\), and the shares now screen fairly valued rather than overvalued\./);
  });

  it('names the factor that moved the quant score most, where both editions recorded it', () => {
    const prev = editionsFor('AAPL')[0];
    const next = { ...prev, quant: { ...prev.quant, score: 3.10 }, factors: { ...prev.factors, momentum: 4.2 } };
    expect(changeProse(prev, next, prev.date)[0]).toMatch(/still Hold, grade B, but its score went from 2\.98 to 3\.10; the largest move was in momentum, 3\.66 to 4\.20\./);
  });

  it('says so when nothing moved', () => {
    const prev = editionsFor('AAPL')[0];
    expect(changeProse(prev, prev, prev.date)).toEqual(['No rating or estimate has moved since the 12 Oct 2026 edition.']);
  });

  it('is absent for a company with no edition on record', () => {
    expect(sinceLastEdition('ZZZZ', now)).toBeNull();
  });
});

describe('the earnings note', () => {
  const a = report('AAPL');

  it('dates the note by the results and reads the call held that day', () => {
    const n = earningsNote(a, calls)!;
    expect(n.date).toBe(a.quarter.date);
    expect(n.paras[0]).toMatch(/^Apple reported on .*earnings per share were US\$2\.02 against a US\$1\.89 consensus, 6\.9% ahead/);
    expect(n.paras[0]).toMatch(/13 beats on earnings in 13 scored quarters/);
    expect(n.paras[1]).toMatch(/\(2026 Q3\).*more cautious than the call before \(\+39 on 30 Apr 2026\)/);
    expect(n.paras[1]).toMatch(/Against it they named: supply is limiting what they can sell/);
  });

  it('quotes only forward-looking lines, at most two, none longer than 25 words', () => {
    const n = earningsNote(a, calls)!;
    expect(n.outlook.length).toBeGreaterThan(0);
    expect(n.outlook.length).toBeLessThanOrEqual(2);
    for (const o of n.outlook) {
      expect(o.text).toMatch(/expect|guid|outlook|forecast|anticipate|quarter/i);
      expect(o.text.replace(/…$/, '').trim().split(/\s+/).length).toBeLessThanOrEqual(25);
    }
  });

  it('says there is no before-and-after when every edition came after the call', () => {
    expect(earningsNote(a, calls)!.paras.join(' ')).toMatch(/No edition of this report predates the call/);
  });

  it('gives the estimate across the call when editions sit on both sides', () => {
    const [latest, first] = editionsFor('AAPL');
    const before: Edition = { ...first, date: '2026-07-01', dataAsOf: '2026-07-01' };
    const n = earningsNote(a, calls, [latest, before])!;
    expect(n.paras.join(' ')).toMatch(/our fair value estimate went from US\$186\.53 \(the 1 Jul 2026 edition\) to US\$191\.80 \(12 Oct 2026\)/);
  });

  it('leaves the call out when the saved reading is not of this quarter', () => {
    const later = { ...a, quarter: { ...a.quarter, date: '2026-11-02' } };
    const n = earningsNote(later, calls)!;
    expect(n.paras.join(' ')).not.toMatch(/On the call/);
    expect(n.outlook).toEqual([]);
  });

  it('falls back to the call alone when the results are not in the data', () => {
    const nvda = report('NVDA');
    const n = earningsNote(nvda, calls);
    if (nvda.quarter?.available) return;
    expect(n!.paras[0]).toMatch(/not in this copy of the data/);
    expect(n!.paras[1]).toMatch(/On the call/);
  });
});
