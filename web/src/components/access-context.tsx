'use client';

/* The reader's plan, for `lib/access.ts`. Nothing provides it yet: the back
   end will wrap the app in `<AccessContext.Provider value={{ plan }}>` once it
   knows who is signed in. Until then the plan is null, and with gating off
   (the default) that changes nothing. */

import * as React from 'react';
import { canUse, GATING_ON, type Feature, type Plan } from '@/lib/access';

export const AccessContext = React.createContext<{ plan: Plan | null }>({ plan: null });

export function useAccess() {
  const { plan } = React.useContext(AccessContext);
  return { plan, gating: GATING_ON, can: (f: Feature) => canUse(f, plan) };
}
