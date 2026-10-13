'use client';

/* An Investment Ideas portfolio's record since it was first published:
   `lib/track-record.ts` on the periods the back end stores
   (BACKEND_CONTRACT.md §3). Renders nothing until the back end serves a
   record, so no portfolio shows an empty "track record" box. */

import * as React from 'react';
import { fmtDate, pct } from '@/lib/format';
import { fetchTrackRecord } from '@/lib/backend';
import { trackRecord, type TrackRecord } from '@/lib/track-record';
import { OCard, OHead, StatLine, StatLines } from '@/components/report/ui';
import { cn } from '@/lib/cn';

const signed = (v: number | null) => pct(v, { sign: true });
const tone = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : '');

export function TrackRecordCard({ ideaKey }: { ideaKey: string }) {
  const [rec, setRec] = React.useState<TrackRecord | null>(null);
  React.useEffect(() => {
    let live = true;
    setRec(null);
    fetchTrackRecord(ideaKey).then((p) => { if (live && p) setRec(trackRecord(p)); });
    return () => { live = false; };
  }, [ideaKey]);
  if (!rec) return null;
  return (
    <OCard span={12} id="pf-track-record">
      <OHead title="Track record"
        info="Price return of the published list, equal weight, chained from one rebalance to the next; dividends not included. The benchmark is chained over the same dates." />
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border max-sm:grid-cols-1">
        {[['This portfolio', rec.portfolio], [rec.benchmarkSymbol, rec.benchmark], ['Difference', rec.excess]].map(([label, v]) => (
          <div key={String(label)} className="bg-background p-4">
            <div className="text-tiny text-muted-foreground">{label}</div>
            <div className={cn('text-2xl font-bold tnum', tone(v as number))}>{signed(v as number)}</div>
          </div>
        ))}
      </div>
      <StatLines split>
        <StatLine label="Recorded since" value={fmtDate(rec.since)} note={`${rec.periods} ${rec.periods === 1 ? 'list' : 'lists'} published`} />
        <StatLine label="A year, compounded" value={rec.annualised == null ? 'After a full year' : signed(rec.annualised)} />
        {rec.missing ? <StatLine label="Left out for want of a price" value={String(rec.missing)} note="holdings in a period with no closing price" /> : null}
      </StatLines>
      <p className="mt-3 text-tiny text-muted-foreground">Past results of a screen, not a forecast and not advice.</p>
    </OCard>
  );
}
