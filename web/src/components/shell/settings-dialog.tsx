'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/primitives';
import { getApiKey } from '@/lib/fmp';
import { loadBenchmarks, saveBenchmarks, resetBenchmarks } from '@/lib/model';
import { useDataEpoch, useLoadedReport, type LoadedReport } from '@/components/providers';

/** The benchmarks a reader can move. Decimals, not percentages. */
const FIELDS: [string, string, string][] = [
  ['riskFreeRate', 'Risk-free / savings rate', 'e.g. 0.042 for 4.2%'],
  ['equityRiskPremium', 'Equity risk premium', 'with beta, sets the cost of equity'],
  ['terminalGrowth', 'Terminal growth rate', 'perpetual growth in the DCF models'],
  ['marketEarningsGrowth', 'Market forecast earnings growth', ''],
  ['marketRevenueGrowth', 'Market forecast revenue growth', ''],
  ['highGrowth', 'High-growth threshold', ''],
  ['roeBar', 'High ROE threshold', ''],
  ['dividendNotable', 'Notable dividend yield', ''],
  ['dividendTopTier', 'Top-tier dividend yield', ''],
  ['netDebtToEquityCeiling', 'Net debt / equity ceiling', ''],
];

/**
 * Serialise whatever the live connection returned into the shape
 * `public/data/<SYMBOL>.json` expects, so a report can be pinned for offline
 * use or review. Operator-only: the section shows only when a key was set
 * through the hidden `?apikey=` link, and its wording names no provider,
 * because the file it writes is served to readers.
 */
function saveSnapshot({ ds, extras }: LoadedReport) {
  const feeds: Record<string, unknown> = {};
  let live = 0;
  for (const [name, r] of Object.entries(ds.feeds)) {
    if (r.status !== 'ok' || r.data == null) continue;
    feeds[name] = r.data;
    if (!r.fromSnapshot) live++;
  }
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    symbol: ds.symbol,
    capturedAt: today,
    note: `Captured on ${today} by Maz Vantage. ${live} feed${live === 1 ? '' : 's'} came back live; `
      + 'feeds absent here returned nothing, and degrade to "not assessed" in the report.',
    extras: {
      peerRatios: extras?.peerRatios || {},
      peerGrowth: extras?.peerGrowth || {},
      benchmarks: extras?.benchmarks || {},
    },
    feeds,
  };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${ds.symbol}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/*
  Readers are not told where the data comes from, so there is no key field
  here: the operator's key lives on the server, and a key of one's own is set
  through the hidden `?apikey=` link (see `getApiKey`). `serverKey` is still
  passed in by the shell and no longer read.
*/
export function SettingsDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void; serverKey?: boolean }) {
  const { reload } = useDataEpoch();
  const { report } = useLoadedReport();
  const [operator, setOperator] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>({});

  // Read fresh every time it opens: another tab may have changed either.
  React.useEffect(() => {
    if (!open) return;
    setOperator(!!getApiKey());
    const bm = loadBenchmarks() as Record<string, unknown>;
    setValues(Object.fromEntries(FIELDS.map(([k]) => [k, String(bm[k])])));
  }, [open]);

  const save = () => {
    const patch: Record<string, number> = {};
    for (const [k] of FIELDS) {
      const v = parseFloat(values[k]);
      if (Number.isFinite(v)) patch[k] = v;
    }
    saveBenchmarks(patch);
    onOpenChange(false);
    reload();
  };

  const symbol = report?.ds.symbol || 'SYMBOL';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">Model benchmarks.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Benchmarks</h3>
          <p className="text-tiny text-muted-foreground">
            Thresholds used by the fair-ratio model, the dividend notes and the management checks. Enter decimals, not percentages.
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-4 gap-y-3">
            {FIELDS.map(([k, label, hint]) => (
              <div key={k} className="grid content-start gap-1">
                <Label htmlFor={`bm-${k}`}>{label}</Label>
                <Input id={`bm-${k}`} type="number" step="0.001" value={values[k] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
                {hint ? <p className="text-micro text-muted-foreground">{hint}</p> : null}
              </div>
            ))}
          </div>
        </div>

        {operator ? (
          <div className="grid gap-2">
            <h3 className="mt-2 text-sm font-semibold">Snapshot</h3>
            <p className="text-tiny text-muted-foreground">
              Save everything this report loaded as <code>{symbol}.json</code>. Placed in <code>web/public/data/</code>, the
              ticker renders without live data — useful for pinning a point in time.
            </p>
            <div>
              <Button size="sm" disabled={!report} onClick={() => report && saveSnapshot(report)}>
                Save {report?.ds.symbol || 'snapshot'}.json
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter className="mt-2">
          <Button onClick={() => { resetBenchmarks(); onOpenChange(false); reload(); }}>Reset benchmarks</Button>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="default" onClick={save}>Save &amp; reload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
