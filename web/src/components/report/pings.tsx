'use client';

/* ==========================================================================
   Price-chart pings — the markers that say *when* somebody bought or sold,
   and the legend that doubles as their controls.

   Three charts mount this: the Overview's price card, the Analysis tab's price
   history, and the Research tab's price-against-fair-value. **The fund markers
   cost eight requests**, so `FUND_CACHE` memoises the promise per symbol:
   whichever chart the reader presses the button on, the others get it free.

   A ping is a **time**, never scaled by size. A triangle is a Form 4 (the day
   the trade happened); a diamond is a 13F (the quarter end it was reported
   for — not a trade date, filed up to 45 days later).
   ========================================================================== */

import * as React from 'react';
import { fetchHolderQuarters, hasApiKey } from '@/lib/fmp';
import { fundMarkersForQuarter, type Analysis } from '@/lib/model';
import type { ChartMarker } from '@/components/charts/charts';
import { cn } from '@/lib/cn';

const QUARTERS = 8;
const FUND_CACHE = new Map<string, Promise<ChartMarker[]>>();

function loadFunds(symbol: string) {
  if (!FUND_CACHE.has(symbol)) {
    FUND_CACHE.set(symbol, fetchHolderQuarters(symbol, QUARTERS).then((results) => {
      const out: ChartMarker[] = [];
      for (const r of results) if (r.status === 'ok') out.push(...(fundMarkersForQuarter(r.data) as ChartMarker[]));
      return out;
    }).catch(() => []));
  }
  return FUND_CACHE.get(symbol)!;
}

const GLYPH: Record<string, string> = {
  insiderBuy: 'inline-block size-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-up',
  insiderSell: 'inline-block size-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-down',
  fundBuy: 'inline-block size-2 rotate-45 border-[1.6px] border-up',
  fundSell: 'inline-block size-2 rotate-45 border-[1.6px] border-down',
};

export function usePings(a: Analysis) {
  const symbol = a.facts.symbol;
  const insider = a.insiderMarkers || { markers: [], excluded: 0, filings: 0 };
  const [showInsider, setShowInsider] = React.useState(insider.markers.length > 0);
  const [funds, setFunds] = React.useState<ChartMarker[] | null>(null);
  const [showFunds, setShowFunds] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const markers: ChartMarker[] = [
    ...(showInsider ? insider.markers : []),
    ...(showFunds && funds ? funds : []),
  ];

  const pull = async () => {
    setBusy(true);
    setStatus(`Reading ${QUARTERS} quarters of 13F filings…`);
    const f = await loadFunds(symbol);
    setFunds(f);
    setShowFunds(true);
    setStatus(f.length ? '' : 'No fund position changes were reported.');
  };

  const chip = (kind: string, label: string, on: boolean, toggle: () => void, title: string) => (
    <button key={kind} type="button" title={title} onClick={toggle}
      className={cn('inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-tiny text-muted-foreground hover:text-foreground',
        on ? 'bg-accent text-foreground' : 'opacity-60')}>
      <i className={GLYPH[kind]} />
      <span>{label}</span>
    </button>
  );

  const buys = insider.markers.filter((m: ChartMarker) => m.kind === 'insiderBuy').length;
  const sells = insider.markers.length - buys;
  const adds = funds ? funds.filter((m) => m.kind === 'fundBuy').length : 0;

  const legend = (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {insider.markers.length ? (
        <>
          {chip('insiderBuy', `Insider buys (${buys})`, showInsider, () => setShowInsider((v) => !v),
            'Open-market purchases on Form 4, at the date on the filing. Awards, option exercises and tax withholdings are not marked.')}
          {chip('insiderSell', `Insider sells (${sells})`, showInsider, () => setShowInsider((v) => !v),
            'Open-market sales on Form 4, at the date on the filing.')}
        </>
      ) : (
        <span className="text-tiny text-muted-foreground">
          {insider.filings ? `${insider.filings} Form 4 filings, none of them an open-market trade` : 'No insider filings returned'}
        </span>
      )}
      {funds === null ? (
        hasApiKey() ? (
          <button type="button" disabled={busy} onClick={pull}
            className="rounded-full border border-dashed border-border px-2.5 py-1 text-tiny text-muted-foreground hover:text-foreground disabled:opacity-50">
            {FUND_CACHE.has(symbol) ? 'Show fund positions' : 'Load fund positions'}
          </button>
        ) : <span className="text-tiny text-muted-foreground">Fund positions need live data</span>
      ) : funds.length ? (
        <>
          {chip('fundBuy', `Funds added (${adds})`, showFunds, () => setShowFunds((v) => !v),
            'A 13F position increase, placed at the quarter end it was reported for — not a trade date. Index managers are excluded.')}
          {chip('fundSell', `Funds cut (${funds.length - adds})`, showFunds, () => setShowFunds((v) => !v),
            'A 13F position decrease, placed at the quarter end it was reported for — not a trade date. Index managers are excluded.')}
        </>
      ) : null}
      {status ? <span className="text-tiny text-muted-foreground">{status}</span> : null}
    </div>
  );

  const bits: string[] = [];
  if (insider.filings) {
    bits.push(`${insider.markers.length} of ${insider.filings} Form 4 filing${insider.filings === 1 ? ' is' : 's are'} marked`
      + (insider.excluded
        ? `; ${insider.excluded} ${insider.excluded === 1 ? 'was' : 'were'} left off. Awards, option exercises, gifts and shares withheld `
          + 'to pay tax on a vesting grant are not decisions to buy or sell, and counting them would turn one vesting date into a cluster of "insider buying".'
        : '.'));
  }
  if (funds?.length) {
    bits.push('Fund markers are diamonds because a 13F reports what a manager held at a quarter end, not when they traded — and it is filed '
      + 'up to 45 days later. Index managers are excluded: a tracker’s position moves with the index, not with a view.');
  }
  bits.push('Nothing is scaled by size. A marker says when, not how much.');
  const note = <p className="mt-4 text-tiny text-muted-foreground/80">{bits.join(' ')}</p>;

  return { markers, legend, note };
}
