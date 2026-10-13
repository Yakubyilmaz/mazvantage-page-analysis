/* The plan seam (2026-10-13): the halal label is free, the analysis paid,
   and nothing is locked while gating is off. */

import { describe, expect, it } from 'vitest';
import { FEATURE_PLAN, canUse, planFor } from '@/lib/access';

describe('canUse', () => {
  it('opens everything while gating is off', () => {
    for (const f of Object.keys(FEATURE_PLAN) as (keyof typeof FEATURE_PLAN)[]) expect(canUse(f, null, false)).toBe(true);
  });

  it('keeps every halal surface free, and the analysis behind Pro, when gating is on', () => {
    for (const f of ['halalLabel', 'shariahScreen', 'etfHalalCheck', 'purification', 'zakat', 'portfolioCompliance'] as const) {
      expect(canUse(f, null, true), f).toBe(true);
      expect(planFor(f)).toBeNull();
    }
    for (const f of ['grade', 'impliedGrowth', 'risks'] as const) {
      expect(canUse(f, null, true), f).toBe(false);
      expect(canUse(f, 'free', true), f).toBe(false);
      expect(canUse(f, 'pro', true), f).toBe(true);
      expect(canUse(f, 'proPlus', true), f).toBe(true);
    }
    expect(canUse('scoreHistory', 'pro', true)).toBe(false);
    expect(canUse('scoreHistory', 'proPlus', true)).toBe(true);
  });
});
