/* ==========================================================================
   Maz Vantage — who may see what (the seam for plans)

   The product's line: **the halal label is free; the analysis is paid.**
   This file says which surface belongs to which plan, so the line is drawn in
   one place rather than in every component.

   Gating is **off** until accounts and payments exist (HANDOVER §7): with no
   way to buy a plan, locking anything would only lock everyone out. Turn it on
   with `NEXT_PUBLIC_PLAN_GATING=on` once the back end tells the app who the
   reader is, through `AccessContext` (`components/access-context.tsx`).

   While it is off, `canUse` is true for everything and surfaces show a small
   "Pro" mark beside what will be paid, so the line is visible before it is
   enforced. The check here is presentation only: a paid figure must also be
   withheld by the server once there is one, or it is one request away.
   ========================================================================== */

export type Plan = 'free' | 'pro' | 'proPlus';

const RANK: Record<Plan, number> = { free: 0, pro: 1, proPlus: 2 };

export const PLAN_NAME: Record<Plan, string> = { free: 'Free', pro: 'Pro', proPlus: 'Pro+' };

/** Every gated surface, and the lowest plan that opens it. */
export const FEATURE_PLAN = {
  halalLabel: 'free',
  shariahScreen: 'free',
  etfHalalCheck: 'free',
  purification: 'free',
  zakat: 'free',
  portfolioCompliance: 'free',
  grade: 'pro',
  impliedGrowth: 'pro',
  risks: 'pro',
  fullReport: 'pro',
  complianceAlerts: 'pro',
  ideasTrackRecord: 'pro',
  scoreHistory: 'proPlus',
} as const satisfies Record<string, Plan>;

export type Feature = keyof typeof FEATURE_PLAN;

export const GATING_ON = process.env.NEXT_PUBLIC_PLAN_GATING === 'on';

/** Whether a reader on `plan` (null: not signed in) may see `feature`. Everything, while gating is off. */
export function canUse(feature: Feature, plan: Plan | null, gating = GATING_ON): boolean {
  if (!gating) return true;
  return RANK[plan ?? 'free'] >= RANK[FEATURE_PLAN[feature]];
}

/** The plan to name on a lock or a mark: null for the free surfaces. */
export function planFor(feature: Feature): Plan | null {
  const p = FEATURE_PLAN[feature];
  return p === 'free' ? null : p;
}
