/* The 2026-10-28 Amazon stress screen, pinned to the figures read from its
   filings and Anthropic's S-1, and to the interim deltas it added (Δ50, Δ58,
   Δ59 in the arithmetic). If the record or the engine is edited, these say
   what moved. */

import { describe, expect, it } from 'vitest';
import { SCENARIOS, gate4, type Scenario } from '@/lib/shariah-v5';
import { AMZN } from '@/lib/shariah-issuers-amazon';
import { AAPL, issuerRecord, screenIssuer, withLines } from '@/lib/shariah-issuers';
import { answerTone, halalAnswer, labelFromIssuer } from '@/lib/halal-label';

const sc = screenIssuer(AMZN).scenarios;
const test = (s: Scenario, key: string) => sc[s].tests.find((t) => t.key === key)!;
const REV = 716_924 + 382_125 - 323_369;

describe('the record is on the Shariah tab', () => {
  it('AMZN finds its record', () => {
    expect(issuerRecord('amzn')?.symbol).toBe('AMZN');
  });
});

describe('Amazon — twelve months to 30 June 2026', () => {
  it('revenue $775.7b; interest $4.66b plus Axio\'s lending, 0.61% of revenue', () => {
    expect(AMZN.income.revenue).toBe(775_680);
    expect(AMZN.income.revenue).toBe(REV);
    expect(test('B', 'l1_revenue').value).toBeCloseTo((4_660 + 65) / REV, 9);
  });
  it('Δ59: debt includes the current notes, short-term facilities and financing obligations filed elsewhere', () => {
    expect(AMZN.bs.borrowings).toBe(128_894 + 3_330 + 325 + 415 + 8_900);
    expect(test('B', 'ibd_mcap').value).toBeCloseTo((141_864 + 13_451) / 2_615_018, 9);
  });
  it('the Anthropic notes are not Cash + IBS: they bear no interest (S-1)', () => {
    expect(AMZN.bs.cashIbs).toBe(121_015 + 2_900);
    expect(test('B', 'cash_mcap').value).toBeCloseTo(123_915 / 2_615_018, 9);
  });
});

describe('Δ50 — Level-3 mark-ups out of total assets at Scenario C and Strictest', () => {
  it('Anthropic\'s $172.4b of mark-ups are the gap between its carrying value and the cash put in', () => {
    expect(AMZN.bs.level3Gains).toBe(97_900 + 92_500 - 18_000);
  });
  it('Scenario B divides by total assets as reported; Strictest without the mark-ups, and fails', () => {
    expect(test('B', 'ibd_ta').value).toBeCloseTo(155_315 / 1_095_689, 9);
    expect(test('S', 'ibd_ta').value).toBeCloseTo((155_315 + 96_320) / (1_095_689 - 172_400), 9);
    expect(test('S', 'ibd_ta').state).toBe('fail');
    // As reported it would pass: 22.97%.
    expect((155_315 + 96_320) / 1_095_689).toBeLessThan(0.25);
  });
  it('a record without mark-ups is untouched (Apple\'s Strictest debt test)', () => {
    const apple = screenIssuer(AAPL).scenarios.S.tests.find((t) => t.key === 'ibd_ta')!;
    const bs = AAPL.bs;
    expect(apple.value).toBeCloseTo((bs.borrowings + bs.financeLeases + bs.operatingLeases) / bs.totalAssets, 12);
  });
});

describe('Gate 4 — thirty estimated lines', () => {
  it('passes A to C and fails Strictest, robust across the bands', () => {
    expect(SCENARIOS.map((s) => sc[s].verdict)).toEqual(['PASS', 'PASS', 'PASS', 'FAIL']);
    expect(sc.A.g4.npi).toBeCloseTo(0.01957, 4);
    expect(sc.B.g4.npi).toBeCloseTo(0.02489, 4);
    expect(sc.C.g4.npi).toBeCloseTo(0.04284, 4);
    expect(sc.S.g4.npi).toBeCloseTo(0.04782, 4);
    for (const s of SCENARIOS) expect(sc[s].g4.robust).toBe(true);
  });
  it('card revenue shares and Affirm warrants count from Scenario B (Δ46, Δ55); insurance agency everywhere (Δ54)', () => {
    const at = (key: string, s: Scenario) => gate4(AMZN.lines.filter((l) => l.key === key), REV, s).npi * REV;
    expect(at('cards', 'A')).toBe(0);
    expect(at('cards', 'B')).toBeCloseTo(1_300, 6);
    expect(at('affirm', 'B')).toBeCloseTo(200, 6);
    expect(at('insurance', 'A')).toBeCloseTo(250, 6);
  });
  it('non-zabīḥah meat and the gelatin mushbooh row count at Scenario C and Strictest only', () => {
    const at = (key: string, s: Scenario) => gate4(AMZN.lines.filter((l) => l.key === key), REV, s).npi * REV;
    expect(at('meat', 'B')).toBe(0);
    expect(at('meat', 'C')).toBeCloseTo(3_631, 6);
    expect(at('gelatin', 'S')).toBeCloseTo(3_000 * 0.05, 6);
  });
  it('Δ58: purification\'s margin leaves out the $62.3b of after-tax valuation gains', () => {
    const t = AMZN.income.tax / AMZN.income.pretax;
    const margin = (AMZN.income.netIncome - 4_725 * (1 - t) - AMZN.income.nonOperatingGains!) / REV;
    expect(sc.B.purification.margin).toBeCloseTo(margin, 12);
    expect(sc.B.purification.margin).toBeCloseTo(0.0894, 3);
    expect(sc.B.purification.perShare).toBeCloseTo(0.455, 3);
  });
});

describe('the two proposed deltas, priced', () => {
  const shift = (label: RegExp) => screenIssuer(AMZN).sensitivities.find((x) => label.test(x.label))!.shift;
  it('Δ49 (Anthropic conversions as a loan with a benefit) adds 0.88 points from Scenario B and carries C over', () => {
    expect(shift(/Δ49/).A).toBe(0);
    expect(shift(/Δ49/).B).toBeCloseTo(6_800 / REV, 9);
    expect(sc.C.g4.npi + shift(/Δ49/).C).toBeGreaterThan(0.05);
  });
  it('Δ56 (cloud capacity rented to P1 businesses) adds 2.8 points at Scenario C', () => {
    expect(shift(/Δ56/).C).toBeCloseTo((1_500 + 20_000) / REV, 9);
  });
  it('both together carry Scenario B over its cap', () => {
    const extra = AMZN.sensitivities.filter((x) => /Δ49|Δ56/.test(x.label)).flatMap((x) => x.lines);
    expect(gate4(withLines(AMZN.lines, extra), REV, 'B').npi).toBeGreaterThan(0.05);
  });
});

describe('the index families and the answer', () => {
  it('FTSE\'s whole-line count straddles its 5% line; the market-value families pass', () => {
    const ix = screenIssuer(AMZN).indexes;
    expect(ix.find((x) => x.rule.key === 'ftse')!.state).toBe('borderline');
    expect(ix.find((x) => x.rule.key === 'aaoifi')!.state).toBe('pass');
  });
  it('the tab answers on Standard 21\'s own row', () => {
    const label = labelFromIssuer('AMZN')!;
    expect(halalAnswer(label, AMZN.name, 'AMZN', null)).toMatch(/^Yes\. As of October 2026, Amazon\.com, Inc\. \(AMZN\)/);
    expect(answerTone(label)).toBe('good');
  });
});
