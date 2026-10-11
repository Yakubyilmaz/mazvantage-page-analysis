import { describe, expect, it } from 'vitest';
import { AAPL, screenIssuer, withLines } from '@/lib/shariah-issuers';
import { NPI_CAP, SCENARIOS, THRESHOLDS, gate4, purify, scenarioMcap, type Scenario } from '@/lib/shariah-v5';

/* The v5.0 engine and the Apple record. The figures pinned here are the ones
   printed in AAPL_Shariah_Screening_v5_0.md at the repository root: if a
   record changes, the report has to change with it. */

const order: Scenario[] = ['A', 'B', 'C', 'S'];

describe('§3 threshold table', () => {
  it('keeps the gradient monotone: no lens is laxer than the one before it', () => {
    for (const row of Object.values(THRESHOLDS)) {
      const tested = order.map((s) => row[s]).filter((v): v is number => v != null);
      for (let i = 1; i < tested.length; i++) expect(tested[i]).toBeLessThanOrEqual(tested[i - 1]);
    }
    expect(order.map((s) => NPI_CAP[s])).toEqual([0.05, 0.05, 0.05, 0.03]);
  });

  it('decides each scenario on its own market-cap window (D16)', () => {
    const w = { m12: 100, m24: 90, m36: 80, spot: 70, spotDate: '' };
    expect(scenarioMcap(w, 'A').value).toBe(90);
    expect(scenarioMcap(w, 'B').value).toBe(100);
    expect(scenarioMcap(w, 'C').value).toBe(80);
    expect(scenarioMcap(w, 'S').value).toBe(70);
  });
});

describe('Δ6 purification', () => {
  it('purifies interest alone in a loss year, and never more than earnings otherwise', () => {
    const loss = purify({ revenue: 100, netIncome: -5, pretax: -5, tax: 0, epsDiluted: -1, dilutedShares: 5, dps: 0 }, 2, 20, 0.22);
    expect(loss.perShare).toBeCloseTo(0.4, 6);
    const p = purify({ revenue: 100, netIncome: 10, pretax: 12, tax: 2, epsDiluted: 2, dilutedShares: 5, dps: 1 }, 1, 90, 0.91);
    expect(p.perShare).toBeLessThan(2);
    expect(p.dividendPart + p.retainedPart).toBeCloseTo(p.perShare, 9);
  });
});

describe('Apple (AAPL), twelve months to 27 June 2026', () => {
  const sc = screenIssuer(AAPL);
  const v = (s: Scenario) => sc.scenarios[s];
  const test = (s: Scenario, key: string) => v(s).tests.find((t) => t.key === key)!;

  it('passes the Hanafi lens and fails the other three', () => {
    expect(order.map((s) => v(s).verdict)).toEqual(['PASS', 'FAIL', 'FAIL', 'FAIL']);
  });

  it('fails Sc B on cash and securities over total assets, outside the Δ22 zone', () => {
    expect(test('B', 'cash_ta').value).toBeCloseTo(0.38229, 4);
    expect(test('B', 'cash_ta').state).toBe('fail');
    expect(test('A', 'cash_ta').state).toBe('info');
    expect(v('B').g4.state).toBe('pass');
  });

  it('fails Strictest on track-(b) debt as well', () => {
    expect(test('S', 'ibd_ta').value).toBeCloseTo(0.25586, 4);
    expect(test('S', 'ibd_ta').state).toBe('fail');
    expect(test('C', 'ibd_ta').value).toBeCloseTo(0.22328, 4);
  });

  it('keeps Layer 1 far from its cap at every lens', () => {
    for (const s of SCENARIOS) expect(v(s).g3).toBe('pass');
    expect(test('A', 'l1_revenue').value).toBeCloseTo(0.009, 4);
  });

  it('prices Gate 4 at the published figures', () => {
    expect(order.map((s) => +(v(s).g4.npi * 100).toFixed(2))).toEqual([2.61, 3.68, 5.58, 5.99]);
    expect(v('A').g4.robust).toBe(true);
    expect(v('C').g4.robust).toBe(false);
    // The open loot-box election cannot rescue Sc C: it fails at the 0% reading already.
    expect(v('C').election.map((e) => e.state)).toEqual(['fail', 'fail', 'fail']);
  });

  it('purifies $0.38 a share at Sc A, an eighth of it through the dividend', () => {
    expect(v('A').purification.perShare).toBeCloseTo(0.380, 3);
    expect(v('A').purification.dividendPart).toBeCloseTo(0.0458, 3);
    expect(order.map((s) => +v(s).purification.perShare.toFixed(2))).toEqual([0.38, 0.47, 0.65, 0.69]);
    expect(sc.khums.company).toBeCloseTo(25_786, 0);
  });

  it('prices each unsettled reading by swapping lines, not by hand', () => {
    const applecare = sc.sensitivities.find((x) => x.label.startsWith('AppleCare'))!;
    expect(applecare.shift.A).toBeCloseTo(8_500 / AAPL.income.revenue, 6);
    const pay = sc.sensitivities.find((x) => x.label.startsWith('Apple Pay'))!;
    expect(pay.shift.A).toBeCloseTo(0, 9);
    const base = gate4(AAPL.lines, AAPL.income.revenue, 'C').npi;
    expect(gate4(withLines(AAPL.lines, []), AAPL.income.revenue, 'C').npi).toBe(base);
  });

  it('runs the five index families on their own rules', () => {
    const by = Object.fromEntries(sc.indexes.map((x) => [x.rule.key, x]));
    expect(by.aaoifi.state).toBe('pass');
    expect(by.sp.state).toBe('pass');
    expect(by.djim.state).toBe('pass');
    expect(by.msci.state).toBe('fail');
    expect(by.msci.cash).toBeCloseTo(0.38229, 4);
    // FTSE counts music, film and insurance broking whole: on the line within the estimates.
    expect(by.ftse.state).toBe('borderline');
    expect(by.ftse.income!).toBeCloseTo(0.0516, 3);
    expect(by.djim.income).toBeNull();
  });

  it('labels scenarios, not schools', () => {
    const text = JSON.stringify(AAPL);
    expect(text).not.toMatch(/Hanafi|Hanbali|Maliki|Sh[aā]fi|Ja.fari|Platform/);
  });
});
