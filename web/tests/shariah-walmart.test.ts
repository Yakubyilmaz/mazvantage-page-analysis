/* The 2026-10-31 Walmart stress screen, pinned to its filings (FY2026 10-K,
   Q2 FY2027 10-Q) and to Δ64–Δ66. If the record or the engine is edited,
   these say what moved. */

import { describe, expect, it } from 'vitest';
import { SCENARIOS, gate4, type Scenario } from '@/lib/shariah-v5';
import { WMT } from '@/lib/shariah-issuers-walmart';
import { issuerRecord, screenIssuer, withLines } from '@/lib/shariah-issuers';
import { answerTone, halalAnswer, labelFromIssuer } from '@/lib/halal-label';

const sc = screenIssuer(WMT).scenarios;
const test = (s: Scenario, key: string) => sc[s].tests.find((t) => t.key === key)!;
const REV = 713_163 + 365_688 - 343_011;

describe('Walmart — twelve months to 31 July 2026', () => {
  it('is on the Shariah tab', () => {
    expect(issuerRecord('wmt')?.symbol).toBe('WMT');
  });
  it('total revenues $735.8b are the denominator; interest is 0.05% of them', () => {
    expect(WMT.income.revenue).toBe(735_840);
    expect(test('A', 'l1_revenue').value).toBeCloseTo((352 + 40) / REV, 9);
  });
  it('the balance sheet passes A to C; Strictest\'s debt with leases is 25.1% of total assets', () => {
    expect(test('B', 'ibd_mcap').value).toBeCloseTo((10_479 + 3_470 + 36_462 + 6_832) / 912_603, 9);
    expect(test('S', 'ibd_ta').value).toBeCloseTo((10_479 + 3_470 + 36_462 + 6_832 + 16_512) / 293_914, 9);
    expect(test('S', 'ibd_ta').state).toBe('fail');
    for (const s of ['A', 'B', 'C'] as Scenario[]) expect(sc[s].g2).toBe('pass');
  });
});

describe('Gate 4 and Δ66', () => {
  it('A and B sit under the cap at the point estimates', () => {
    expect(sc.A.g4.npi).toBeCloseTo(0.04076, 4);
    expect(sc.B.g4.npi).toBeCloseTo(0.04181, 4);
    expect(sc.A.g4.state).toBe('pass');
  });
  it('no single line flips them, but the category-benchmark group does: MIXED — Watch (Δ61, Δ66)', () => {
    const single = WMT.lines.map((l) => ({ ...l, group: undefined }));
    expect(gate4(single, REV, 'B').watch).toBe(false);
    expect(sc.A.g4.watch).toBe(true);
    expect(sc.B.g4.watch).toBe(true);
    expect(SCENARIOS.map((s) => sc[s].verdict)).toEqual(['MIXED — Watch', 'MIXED — Watch', 'FAIL', 'FAIL']);
  });
  it('C and Strictest fail far over, on unslaughtered meat and GLP-1s besides', () => {
    expect(sc.C.g4.npi).toBeCloseTo(0.11413, 4);
    expect(sc.S.g4.npi).toBeCloseTo(0.12347, 4);
  });
  it('almost nothing is disclosed (Δ63)', () => {
    expect(sc.B.g4.disclosed).toBeLessThan(0.02);
  });
  it('the Klarna warrants follow Δ55 and stay out of the index rows (Δ62)', () => {
    expect(gate4(WMT.lines.filter((l) => l.key === 'klarna'), REV, 'A').npi).toBe(0);
    expect(gate4(WMT.lines.filter((l) => l.key === 'klarna'), REV, 'B').npi * REV).toBeCloseTo(80, 6);
    expect(WMT.lines.find((l) => l.key === 'klarna')!.ownRule).toBe(true);
  });
  it('Walmart U.S. alcohol and tobacco alone at their high edges leave A and B under 5%', () => {
    const hi = WMT.sensitivities.find((x) => /high edge/.test(x.label))!;
    expect(gate4(withLines(WMT.lines, hi.lines), REV, 'B').npi).toBeLessThan(0.05);
  });
});

describe('the answer', () => {
  it('Standard 21\'s own row is on the line', () => {
    const label = labelFromIssuer('WMT')!;
    expect(halalAnswer(label, WMT.name, 'WMT', null)).toMatch(/^It is on the line\. As of October 2026, Walmart Inc\. \(WMT\)/);
    expect(answerTone(label)).toBe('warn');
    expect(label.word).toBe('On watch · AAOIFI-based');
  });
});
