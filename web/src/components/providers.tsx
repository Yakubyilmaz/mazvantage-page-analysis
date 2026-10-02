'use client';

/* ==========================================================================
   App-wide state

   - the server-key flag, handed to `fmp.ts` before anything can fetch;
   - the theme (light default, `mazvantage.theme`);
   - the data epoch: saving Settings clears the fetch cache and bumps it, and
     every data view re-runs its load — the port's `boot(true)`;
   - the loaded report, so Settings can offer "Save AAPL.json";
   - the Settings dialog and the root navigation.
   ========================================================================== */

import * as React from 'react';
import { setServerKeyAvailable, clearCache } from '@/lib/fmp';
import { TooltipProvider } from '@/components/ui/primitives';
import { RootNavProvider } from '@/components/nav-context';
import { SettingsDialog } from '@/components/shell/settings-dialog';
import type { Dataset } from '@/lib/fmp';

/* ---------- theme ---------------------------------------------------------- */

type Theme = 'light' | 'dark';
const THEME_KEY = 'mazvantage.theme';

const ThemeContext = React.createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });
export const useTheme = () => React.useContext(ThemeContext);

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>('light');
  React.useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }, []);
  const toggle = React.useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch { /* not remembered */ }
      return next;
    });
  }, []);
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

/* ---------- data epoch ------------------------------------------------------ */

const EpochContext = React.createContext<{ epoch: number; reload: () => void }>({ epoch: 0, reload: () => {} });
/** Put `epoch` in a data effect's dependencies and it re-runs after Settings is saved. */
export const useDataEpoch = () => React.useContext(EpochContext);

/* ---------- the loaded report (for the snapshot button) -------------------- */

export interface LoadedReport {
  ds: Dataset;
  extras: { peerRatios?: Record<string, any>; peerGrowth?: Record<string, any>; benchmarks?: Record<string, any> } | null;
}

const ReportContext = React.createContext<{
  report: LoadedReport | null;
  setReport: (r: LoadedReport | null) => void;
}>({ report: null, setReport: () => {} });
export const useLoadedReport = () => React.useContext(ReportContext);

/* ---------- providers ------------------------------------------------------- */

export function AppProviders({ serverKey, children }: { serverKey: boolean; children: React.ReactNode }) {
  // Synchronously, before any child effect can decide between live data and
  // the bundled snapshot.
  setServerKeyAvailable(serverKey);

  const [epoch, setEpoch] = React.useState(0);
  const reload = React.useCallback(() => {
    clearCache();
    setEpoch((e) => e + 1);
  }, []);

  const [report, setReport] = React.useState<LoadedReport | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const openSettings = React.useCallback(() => setSettingsOpen(true), []);

  return (
    <ThemeProvider>
      <EpochContext.Provider value={{ epoch, reload }}>
        <ReportContext.Provider value={{ report, setReport }}>
          <RootNavProvider openSettings={openSettings}>
            <TooltipProvider delayDuration={250}>
              {children}
              <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} serverKey={serverKey} />
            </TooltipProvider>
          </RootNavProvider>
        </ReportContext.Provider>
      </EpochContext.Provider>
    </ThemeProvider>
  );
}
