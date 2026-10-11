/* Company events (2026-10-10): the record's rules, pinned on the first one,
   NVIDIA's RTX Spark launch with Microsoft. A fact names its source; a
   "confirmed" event rests on a company's own announcement; a vendor's
   performance claim is never filed as a fact; every party reads it from its
   own side. */

import { describe, expect, it } from 'vitest';
import { EVENTS, dealMath, eventsFor } from '@/lib/events';
import { readHeadline } from '@/lib/news-events';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const words = (s: string) => s.trim().split(/\s+/).length;

describe('every event', () => {
  for (const e of EVENTS) {
    describe(e.id, () => {
      it('is dated, and announced no later than it happened', () => {
        expect(e.date).toMatch(ISO);
        if (e.announced) {
          expect(e.announced).toMatch(ISO);
          expect(e.announced <= e.date).toBe(true);
        }
      });

      it('points every fact, claim and quote at a source it lists', () => {
        const n = e.sources.length;
        for (const f of e.facts) expect(f.source, f.label).toBeLessThan(n);
        for (const c of e.claims || []) expect(c.source, c.claim).toBeLessThan(n);
        for (const q of e.quotes || []) expect(q.source, q.text).toBeLessThan(n);
      });

      it('calls itself confirmed only when a company announced it', () => {
        if (e.confidence === 'confirmed') expect(e.sources.some((s) => s.kind === 'primary')).toBe(true);
      });

      it('rests its facts on primary sources, not on the press', () => {
        if (e.confidence === 'confirmed') for (const f of e.facts) expect(e.sources[f.source].kind, f.label).toBe('primary');
      });

      it('keeps comparative performance claims out of the facts', () => {
        for (const f of e.facts) expect(`${f.label} ${f.value}`, f.label).not.toMatch(/\d(\.\d)?x faster|faster than|brighter than/i);
      });

      it('says what it means for every listed party, in a paragraph of its own', () => {
        for (const p of e.parties.filter((x) => x.symbol)) expect(p.why.length, p.name).toBeGreaterThan(120);
        expect(new Set(e.parties.map((p) => p.name)).size).toBe(e.parties.length);
      });

      it('quotes briefly, with any cut marked', () => {
        for (const q of e.quotes || []) {
          expect(words(q.text), q.text).toBeLessThanOrEqual(35);
          expect(q.text, q.text).not.toMatch(/^[a-z]/);
        }
      });

      it('links every source over https', () => {
        for (const s of e.sources) {
          expect(s.url).toMatch(/^https:\/\//);
          expect(s.date).toMatch(ISO);
        }
      });
    });
  }
});

describe('the RTX Spark launch', () => {
  it('appears on each company it touches, with its role there', () => {
    const role = (sym: string) => eventsFor(sym).find((x) => x.event.id === 'nvda-msft-rtx-spark-launch-2026-10')?.party.role;
    expect(role('NVDA')).toBe('maker');
    expect(role('MSFT')).toBe('design partner');
    expect(role('AAPL')).toBe('competitor');
    expect(role('QCOM')).toBe('competitor');
    expect(eventsFor('TSLA')).toHaveLength(0);
  });

  it('dates the launch to October and the unveiling to June', () => {
    const e = EVENTS.find((x) => x.id === 'nvda-msft-rtx-spark-launch-2026-10')!;
    expect(e.date).toBe('2026-10-07');
    expect(e.announced).toBe('2026-06-01');
  });
});

describe('detection', () => {
  it('flags the launch headlines as product events, the step that sends the follower', () => {
    for (const t of [
      'Microsoft and Nvidia launch Surface Laptop Ultra with RTX Spark starting at $2,599',
      'Microsoft Launches Surface Laptop Ultra, Surface RTX Spark Dev Box',
    ]) expect(readHeadline(t).event, t).toBe('product');
  });

  it('misses a press release written as a slogan, which is why company releases are followed regardless of their wording', () => {
    // The June unveiling's own title names no launch. tools/events treats every
    // release on a company's channel or a wire as a candidate, so it is still caught.
    expect(readHeadline('NVIDIA and Microsoft Reinvent Windows PCs for the Age of Personal AI').event).toBeNull();
  });

  it('sets an opinion piece about the same news aside rather than following it', () => {
    expect(readHeadline('Is Microsoft Stock a Buy After Expanding Its Nvidia Partnership?').event).toBeNull();
  });
});

describe('deals', () => {
  const deal = (id: string) => EVENTS.find((x) => x.id === id)!.deal!;

  it('HomeTrust–Blue Ridge: premium, today’s stock value, spread, annualised', () => {
    const m = dealMath(deal('htb-brbs-merger-2026-08'));
    expect(m.premium).toBeCloseTo(4.28 / 3.69 - 1, 6);          // 16.0%
    expect(m.offerNow).toBeCloseTo(0.086 * 45.71, 6);            // US$3.93
    expect(m.valueNow! / 1e6).toBeCloseTo(448.1 * 45.71 / 49.82, 3);
    expect(m.spread).toBeCloseTo((0.086 * 45.71) / 3.84 - 1, 6); // 2.4%
    expect(m.daysToClose).toBe(173);
    expect(m.spreadAnnual!).toBeGreaterThan(m.spread!);
    expect(m.spreadAnnual!).toBeCloseTo(0.0507, 3);
    expect(m.materiality).toBeNull();
    expect(m.stage).toBe('filed');
  });

  it('NVIDIA–Hugging Face: size against NVIDIA, and no spread for a private target', () => {
    const m = dealMath(deal('nvda-hugging-face-2026-09'));
    expect(m.materiality).toBeCloseTo(12.9303 / 5428.4779, 6);  // 0.24%
    expect(m.premium).toBeNull();
    expect(m.spread).toBeNull();
    expect(m.stage).toBe('filed');
  });

  it('dates its stages in order, done ones first', () => {
    for (const e of EVENTS.filter((x) => x.deal)) {
      const steps = e.deal!.steps;
      for (let i = 1; i < steps.length; i++) expect(steps[i].date >= steps[i - 1].date, e.id).toBe(true);
      const firstOpen = steps.findIndex((s) => !s.done);
      if (firstOpen >= 0) expect(steps.slice(firstOpen).every((s) => !s.done), e.id).toBe(true);
      for (const s of steps) expect(s.source).toBeLessThan(e.sources.length);
    }
  });

  it('marks a deal reported in the press before a company confirmed it', () => {
    const steps = deal('nvda-hugging-face-2026-09').steps;
    expect(steps[0].stage).toBe('reported');
    const e = EVENTS.find((x) => x.id === 'nvda-hugging-face-2026-09')!;
    expect(e.sources[steps[0].source].kind).toBe('press');
  });

  it('gives every deal a Shariah reading, pro forma', () => {
    for (const e of EVENTS.filter((x) => x.deal)) expect(e.deal!.shariah.length, e.id).toBeGreaterThan(40);
  });

  it('shows on both sides', () => {
    expect(eventsFor('HTB')[0].party.role).toBe('acquirer');
    expect(eventsFor('BRBS')[0].party.role).toBe('target');
    expect(eventsFor('NVDA').map((x) => x.party.role)).toEqual(['maker', 'acquirer']);
  });
});

describe('deal detection', () => {
  it('flags an acquisition headline as a deal', () => {
    expect(readHeadline('HomeTrust Bancshares, Inc. Expands into Attractive Virginia Markets Through Acquisition of Blue Ridge Bankshares, Inc.').event).toBe('deal');
    expect(readHeadline('Nvidia confirms it will buy Hugging Face for $12.9 billion').event).toBe('deal');
  });

  it('sets the law firms’ merger “investigations” aside as advertising', () => {
    const r = readHeadline('Blue Ridge Bankshares, Inc. (BRBS) Investigation: Halper Sadeh LLC Investigates Whether the Proposed Sale of Blue Ridge Bankshares, Inc. Is Fair to Shareholders');
    expect(r.event).toBeNull();
  });
});
