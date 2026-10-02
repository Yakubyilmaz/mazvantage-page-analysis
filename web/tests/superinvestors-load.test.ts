// The fund loader's live path, with the connector replaced by the bundled
// capture served as if it were live — so the request plan and the fallback
// order are checked without a key.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';

const cap = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../public/data/13f-capture.json'), 'utf8'));
const brk = cap.funds['0001067983'];
const asked: string[] = [];
let mode: 'live' | 'gated' = 'live';

vi.mock('@/lib/fmp', async (orig) => ({
  ...(await orig() as any),
  fetchFund13F: async (kind: string, cik: string, period: any) => {
    asked.push(kind);
    if (mode === 'gated') return { status: 'gated', data: null, message: 'not included in this FMP plan' };
    if (cik !== '0001067983') return { status: 'ok', data: [] };
    if (kind === 'dates') return { status: 'ok', data: brk.dates };
    if (kind === 'holdings') return { status: 'ok', data: brk.holdings[`${period.year}-${period.quarter}`] ?? [] };
    if (kind === 'performance') return { status: 'ok', data: brk.performance };
    return { status: 'ok', data: brk.industries[`${period.year}-${period.quarter}`] ?? [] };
  },
}));
globalThis.fetch = (async () => ({ ok: true, json: async () => cap })) as any;

const { loadFund } = await import('@/lib/superinvestors');

beforeEach(() => { asked.length = 0; mode = 'live'; });

test('a live read costs five requests, and three for the cross-fund table', async () => {
  const full = await loadFund('1067983');
  expect(full).toMatchObject({ status: 'ok', source: 'live' });
  expect(asked.sort()).toEqual(['dates', 'holdings', 'holdings', 'industries', 'performance']);
  expect(full.view?.counts).toMatchObject({ positions: 29, new: 1, soldOut: 1 });

  asked.length = 0;
  const lite = await loadFund('1067983', { lite: true });
  expect(asked.sort()).toEqual(['dates', 'holdings', 'holdings']);
  expect(lite.performance).toBeNull();
});

test('a gated plan falls back to the capture for the fund it holds, and says so', async () => {
  mode = 'gated';
  const r = await loadFund('0001067983');
  expect(r).toMatchObject({ status: 'ok', source: 'capture', capturedAt: '2026-10-01' });
  expect(r.latest).toMatchObject({ year: 2026, quarter: 2 });
});

test('a gated plan reports the gate for a fund the capture does not hold', async () => {
  mode = 'gated';
  const r = await loadFund('0001336528');
  expect(r.status).toBe('gated');
  expect(r.view).toBeNull();
});
