import { describe, expect, it } from 'vitest';
import {
  CHECKED, FIRMS, FIRM_BY_KEY, KINDS, LETTERS, REGIONS, TOPICS,
  companyRows, dateLabel, facetCounts, firmOf, firmShelf, groupLetters, investorRows, isCurated, lettersForTicker,
  mergeLetterQuery, monthLabel, overlaps, parseLetterQuery, queryLetters,
} from '@/lib/letters';
import { INDEX_LETTERS } from '@/lib/letters-index';
import { FUNDS } from '@/lib/superinvestors';
import { hasSub } from '@/lib/nav';

const ids = (list: { id: string }[]) => list.map((l) => l.id);

describe('the curated list', () => {
  it('uses only its own vocabulary', () => {
    const kinds = new Set(KINDS.map((k) => k.key));
    const topics = new Set<string>(TOPICS.map((t) => t.key));
    const regions = new Set<string>(REGIONS.map((r) => r.key));
    for (const l of LETTERS) {
      expect(FIRM_BY_KEY[l.firm], l.id).toBeTruthy();
      expect(kinds.has(l.kind), l.id).toBe(true);
      expect(l.topics.length, l.id).toBeGreaterThan(0);
      expect(l.regions.length, l.id).toBeGreaterThan(0);
      l.topics.forEach((t) => expect(topics.has(t), `${l.id} ${t}`).toBe(true));
      l.regions.forEach((r) => expect(regions.has(r), `${l.id} ${r}`).toBe(true));
    }
  });

  it('never prints a day it was not given, and nothing dated after the check', () => {
    for (const l of LETTERS) {
      expect(l.date, l.id).toMatch(/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/);
      expect(l.date.localeCompare(CHECKED), l.id).toBeLessThanOrEqual(0);
    }
    expect(dateLabel('2026-07')).toBe('July 2026');
    expect(dateLabel('2026-09-02')).toBe('2 Sep 2026');
  });

  it('links out over https and nowhere on this site', () => {
    for (const l of LETTERS) {
      for (const u of [l.url, l.pdf].filter(Boolean) as string[]) {
        const url = new URL(u);
        expect(url.protocol, l.id).toBe('https:');
        expect(url.hostname, l.id).not.toMatch(/mazvantage|localhost/);
      }
      if (l.format === 'pdf') expect(l.url, l.id).toMatch(/\.pdf(\?|$)/i);
    }
    for (const f of FIRMS) expect(new URL(f.home).protocol, f.key).toBe('https:');
  });

  it('has unique ids, and every firm on the shelf has something on it', () => {
    expect(new Set(ids(LETTERS)).size).toBe(LETTERS.length);
    expect(new Set(FIRMS.map((f) => f.key)).size).toBe(FIRMS.length);
    for (const s of firmShelf()) expect(s.count, s.firm.key).toBeGreaterThan(0);
  });

  it('names each company once per letter, with a ticker only in US-listing shape', () => {
    for (const l of LETTERS) {
      const names = (l.mentions || []).map((x) => x.name);
      expect(new Set(names).size, l.id).toBe(names.length);
      for (const x of l.mentions || []) if (x.ticker) expect(x.ticker, `${l.id} ${x.name}`).toMatch(/^[A-Z]{1,5}(-[A-Z])?$/);
    }
  });

  it('sends a 13F link only to a fund the Superinvestors page carries', () => {
    const ciks = new Set(FUNDS.map((f) => f.cik));
    for (const f of FIRMS) if (f.cik) expect(ciks.has(f.cik), f.key).toBe(true);
  });

  it('keeps the provider out of reader-visible text', () => {
    for (const l of LETTERS) expect(`${l.title} ${l.about}`, l.id).not.toMatch(/\bFMP\b|\bAPI\b|vendor/i);
  });

  it('is a routable Research section', () => {
    expect(hasSub('research', 'letters')).toBe(true);
  });
});

describe('the query', () => {
  it('drops values outside the vocabulary rather than matching nothing', () => {
    expect(parseLetterQuery('kind=letters&topic=ai&firm=nobody&sort=best&ticker=nflx')).toEqual({ topic: 'ai', ticker: 'NFLX', sort: 'latest' });
  });

  it('writes only what is set, and never the default sort', () => {
    expect(mergeLetterQuery({ sort: 'latest', kind: 'memo', topic: 'ai' }, { topic: null, firm: 'oaktree' }))
      .toEqual({ kind: 'memo', firm: 'oaktree' });
    expect(mergeLetterQuery({ sort: 'oldest' }, {})).toEqual({ sort: 'oldest' });
  });

  it('filters on the letter and on its firm', () => {
    expect(queryLetters({ kind: 'letter', sort: 'latest' }).every((l) => l.kind === 'letter')).toBe(true);
    const official = queryLetters({ who: 'official', sort: 'latest' });
    expect(official.length).toBeGreaterThan(0);
    expect(official.every((l) => firmOf(l).type === 'official')).toBe(true);
    expect(official.length).toBe(LETTERS.filter((l) => firmOf(l).type === 'official').length);
    const marks = ids(queryLetters({ q: 'howard marks', sort: 'latest' }));
    expect(marks).toEqual(expect.arrayContaining(['oaktree-repeal-laws-iii', 'oaktree-private-credit', 'oaktree-ai-hurtles-ahead']));
    expect(marks.every((id) => LETTERS.find((l) => l.id === id)!.firm === 'oaktree')).toBe(true);
  });

  it('finds a company through what the letters name', () => {
    expect(ids(lettersForTicker('nflx'))).toEqual(['pershing-2026-interim', 'fundsmith-2026-h1']);
    expect(lettersForTicker('ZZZZ')).toEqual([]);
  });

  it('sorts newest first by default, with month-only dates inside their month', () => {
    const all = queryLetters({ sort: 'latest' });
    expect(all[0].date).toBe([...LETTERS].map((l) => l.date).sort().pop());
    for (let i = 1; i < all.length; i++) expect(all[i - 1].date.slice(0, 7) >= all[i].date.slice(0, 7)).toBe(true);
    expect(ids(queryLetters({ sort: 'oldest' }))).toEqual(ids(all).reverse());
  });

  it('groups into runs, so no heading appears twice', () => {
    for (const sort of ['latest', 'oldest', 'firm'] as const) {
      const keys = groupLetters(queryLetters({ sort }), sort).map((g) => g.key);
      expect(new Set(keys).size, sort).toBe(keys.length);
    }
    const all = queryLetters({ sort: 'latest' });
    expect(groupLetters(all, 'latest')[0].label).toBe(monthLabel(all[0].date));
  });
});

describe('where the letters agree', () => {
  it('counts firms, not letters, and only listed companies', () => {
    expect(overlaps().map((o) => `${o.action}:${o.ticker}:${o.firms.join('+')}`))
      .toEqual(['bought:MA:pershing+fundsmith', 'bought:NFLX:pershing+fundsmith']);
  });

  it('does not count one firm twice', () => {
    const one = LETTERS.find((l) => l.id === 'fundsmith-2026-h1')!;
    expect(overlaps([one, { ...one, id: 'copy' }])).toEqual([]);
  });
});

describe('the indexed tier', () => {
  it('has no summary of its own: nobody has read it for us', () => {
    expect(INDEX_LETTERS.length).toBeGreaterThan(50);
    for (const l of INDEX_LETTERS) expect(l.about, l.id).toBeUndefined();
    expect(LETTERS.filter(isCurated).length).toBe(LETTERS.length - INDEX_LETTERS.length);
  });

  it('only names firms the shelf knows', () => {
    for (const l of INDEX_LETTERS) expect(FIRM_BY_KEY[l.firm], l.id).toBeTruthy();
  });

  it('keeps crawled entries to what a crawler can know', () => {
    for (const l of INDEX_LETTERS.filter((x) => x.auto)) {
      expect(l.about, l.id).toBeUndefined();
      expect(l.mentions, l.id).toBeUndefined();
      expect(l.authors, l.id).toBeUndefined();
      expect(l.date.startsWith('2026'), l.id).toBe(true);
    }
  });

  it('never reuses an address for two entries', () => {
    const urls = LETTERS.map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('the Investors and Companies tables, and the counts', () => {
  it('counts every document exactly once per firm', () => {
    const rows = investorRows(LETTERS);
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(LETTERS.length);
    expect(rows.length).toBe(new Set(LETTERS.map((l) => l.firm)).size);
    for (const r of rows) expect(r.first <= r.latest.date, r.firm.key).toBe(true);
  });

  it('lists each listed company once, with actions counted by firm', () => {
    const rows = companyRows(LETTERS);
    expect(new Set(rows.map((r) => r.ticker)).size).toBe(rows.length);
    const nflx = rows.find((r) => r.ticker === 'NFLX')!;
    expect(nflx.bought).toBe(2);
    expect(nflx.firms.sort()).toEqual(['fundsmith', 'pershing']);
  });

  it('promises only what a click delivers', () => {
    const q = { topic: 'ai' as const, sort: 'latest' as const };
    const kinds = facetCounts(q, 'kind');
    for (const [kind, n] of Object.entries(kinds)) {
      expect(queryLetters({ ...q, kind: kind as any }).length, kind).toBe(n);
    }
    // A facet ignores its own filter, so picking one kind does not zero the others.
    expect(facetCounts({ ...q, kind: 'memo' }, 'kind')).toEqual(kinds);
  });

  it('reads the tab from the address and drops one it does not know', () => {
    expect(parseLetterQuery('tab=investors').tab).toBe('investors');
    expect(parseLetterQuery('tab=stocks').tab).toBeUndefined();
  });
});
