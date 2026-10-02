import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeForm, filterFilings, normaliseFilings, summariseFilings } from '@/lib/sec-filings';

const snap = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/AAPL.json'), 'utf8'));
const row = (formType: string, filingDate: string, extra: Record<string, unknown> = {}) =>
  ({ formType, filingDate: `${filingDate} 00:00:00`, acceptedDate: `${filingDate} 16:30:00`, link: 'https://www.sec.gov/x-index.htm', finalLink: 'https://www.sec.gov/x.htm', ...extra });

describe('a form code', () => {
  it('is grouped by purpose', () => {
    expect(describeForm('10-K').group).toBe('reports');
    expect(describeForm('8-K').group).toBe('current');
    expect(describeForm('4').group).toBe('insider');
    expect(describeForm('DEF 14A').group).toBe('proxy');
    expect(describeForm('SC 13G').group).toBe('ownership');
    expect(describeForm('424B2').group).toBe('offerings');
  });
  it('keeps an amendment in its family and says it is one', () => {
    const d = describeForm('8-K/A');
    expect(d).toMatchObject({ form: '8-K/A', group: 'current', amended: true });
    expect(d.what).toMatch(/^Amendment — /);
  });
  it('never guesses an unknown form into a group', () => {
    expect(describeForm('N-PX')).toMatchObject({ form: 'N-PX', group: 'other' });
  });
});

describe('the vendor rows', () => {
  it('drop a link that is not http(s), so it never reaches an href', () => {
    const [f] = normaliseFilings([row('8-K', '2026-01-02', { finalLink: 'javascript:alert(1)', link: 'javascript:alert(1)' })]);
    expect(f.url).toBeNull();
    expect(f.index).toBeNull();
  });
  it('drop rows with no form or no date, and sort newest first', () => {
    const list = normaliseFilings([row('4', '2026-01-02'), { formType: '', filingDate: '2026-01-03' }, row('10-Q', '2026-02-01'), null]);
    expect(list.map((f) => f.form)).toEqual(['10-Q', '4']);
  });
});

describe('the summary', () => {
  const now = new Date('2026-09-22T00:00:00Z').getTime();
  const list = normaliseFilings([
    row('10-K', '2025-10-31'), row('10-K/A', '2025-12-01'), row('10-Q', '2026-07-31'),
    row('8-K', '2026-07-30'), row('8-K', '2026-01-29'), row('4', '2026-09-01'), row('144', '2026-09-01'),
  ]);
  const s = summariseFilings(list, { now });
  it('finds the latest original annual and quarterly reports, not an amendment', () => {
    expect(s.lastAnnual?.filed).toBe('2025-10-31');
    expect(s.lastQuarterly?.filed).toBe('2026-07-31');
  });
  it('counts 90-day windows against the date it is given', () => {
    expect(s.current90).toBe(1);
    // A Form 144 is a notice of a planned sale, not an insider holdings filing.
    expect(s.insider90).toBe(1);
  });
  it('says when the vendor cap cut the window short', () => {
    expect(summariseFilings(list, { cap: 7 }).capped).toBe(true);
    expect(s.capped).toBe(false);
  });
  it('filters by group, then form', () => {
    expect(filterFilings(list, 'reports').length).toBe(3);
    expect(filterFilings(list, 'reports', '10-K').length).toBe(1);
  });
});

describe('the bundled Apple capture', () => {
  const list = normaliseFilings(snap.feeds.secFilings);
  it('ends at the capture date, like the rest of the snapshot', () => {
    expect(list[0].filed <= snap.capturedAt).toBe(true);
  });
  it('holds two 10-Ks and every row links to sec.gov', () => {
    expect(list.filter((f) => f.form === '10-K').length).toBe(2);
    expect(list.every((f) => f.url?.startsWith('https://www.sec.gov/'))).toBe(true);
  });
});
