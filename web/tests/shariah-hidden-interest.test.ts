/* The 2026-10-18 hidden-interest screens: ADP, Airbnb and Deere, pinned to
   the figures read from their filings. If a record is edited, these say what
   moved. */

import { describe, expect, it } from 'vitest';
import { SCENARIOS, type Scenario } from '@/lib/shariah-v5';
import { ABNB, ADP, DE } from '@/lib/shariah-issuers-hidden-interest';
import { issuerRecord, screenIssuer } from '@/lib/shariah-issuers';
import { answerTone, halalAnswer, labelFromIssuer } from '@/lib/halal-label';

const verdicts = (r: typeof ADP) => SCENARIOS.map((s: Scenario) => screenIssuer(r).scenarios[s].verdict);
const test = (r: typeof ADP, s: Scenario, key: string) => screenIssuer(r).scenarios[s].tests.find((t) => t.key === key)!;

describe('the records are on the Shariah tab', () => {
  it('each symbol finds its record', () => {
    for (const s of ['ADP', 'ABNB', 'DE']) expect(issuerRecord(s)?.symbol).toBe(s);
  });
});

describe('ADP — interest on client funds', () => {
  it('Layer 1 is the client-fund interest (a revenue line) plus corporate interest: 7.9% of revenue', () => {
    expect(ADP.l1.point).toBeCloseTo(1_354.8 + 371.0, 6);
    expect(test(ADP, 'B', 'l1_revenue').value).toBeCloseTo(0.07863, 4);
  });
  it('client funds count as Cash + IBS (§6): 49.6% of the 12-month market cap', () => {
    expect(test(ADP, 'B', 'cash_mcap').value).toBeCloseTo(0.4962, 3);
    expect(test(ADP, 'B', 'cash_mcap').state).toBe('fail');
  });
  it('Δ43: client funds leave the cash tests at Scenario A only, and Gate 2 passes there', () => {
    expect(test(ADP, 'A', 'cash_mcap').value).toBeCloseTo(4_230.1 / 97_123, 9);
    expect(screenIssuer(ADP).scenarios.A.g2).toBe('pass');
    expect(screenIssuer(ADP).scenarios.B.g2).toBe('fail');
    expect(test(ABNB, 'A', 'cash_mcap').value).toBeCloseTo((6_821 + 5_248) / 83_961, 9);
  });
  it('Δ44: debt takes the year\'s average commercial paper and repos, not the year-end nil', () => {
    expect(ADP.bs.borrowings).toBeCloseTo(4_964.1 + 4_200 + 3_600, 6);
    expect(test(ADP, 'B', 'ibd_mcap').value).toBeCloseTo(12_764.1 / 97_123, 9);
    expect(test(ADP, 'B', 'ibd_mcap').state).toBe('pass');
  });
  it('fails every scenario, with Gate 3 deciding on its own', () => {
    expect(verdicts(ADP)).toEqual(['FAIL', 'FAIL', 'FAIL', 'FAIL']);
    for (const s of SCENARIOS) expect(screenIssuer(ADP).scenarios[s].g3).toBe('fail');
  });
});

describe('Airbnb — interest on its cash and on guests\' payments', () => {
  it('twelve months to June 2026: $680m of interest on $13,159m of revenue, 5.17%', () => {
    expect(ABNB.income.revenue).toBe(13_159);
    expect(test(ABNB, 'B', 'l1_revenue').value).toBeCloseTo(680 / 13_159, 9);
  });
  it('fails Gate 3 by a narrow margin at every scenario; the balance sheet passes A to C', () => {
    expect(verdicts(ABNB)).toEqual(['FAIL', 'FAIL', 'FAIL', 'FAIL']);
    const sc = screenIssuer(ABNB).scenarios;
    expect(sc.A.g2).toBe('pass');
    expect(sc.B.g2).toBe('watch');
    expect(sc.C.g2).toBe('pass');
    expect(sc.S.g2).toBe('fail');
  });
});

describe('Deere — a captive finance arm', () => {
  it('is categorical at every scenario (U2: Financial Services is 12.7% of revenue)', () => {
    expect(verdicts(DE)).toEqual(['CATEGORICAL FAIL', 'CATEGORICAL FAIL', 'CATEGORICAL FAIL', 'CATEGORICAL FAIL']);
  });
  it('fails on debt and on finance income besides', () => {
    expect(test(DE, 'B', 'ibd_mcap').value).toBeCloseTo(64_180 / 153_015, 9);
    expect(test(DE, 'B', 'l1_revenue').value).toBeCloseTo(5_526 / 47_983, 9);
  });
  it('the tab answers on the business, not the ratios', () => {
    const label = labelFromIssuer('DE')!;
    expect(halalAnswer(label, DE.name, 'DE', null)).toMatch(/^No\. As of October 2026, Deere & Company \(DE\) is classified as NOT HALAL by Maz Vantage: the company itself conducts an excluded activity\. Financial Services/);
    expect(answerTone(label)).toBe('bad');
  });
});
