'use client';

/* The market around the company, inside Business Strategy & Outlook: the
   market researchers' own headline tables, with our reading of each. */

import * as React from 'react';
import { fmtDate, pct } from '@/lib/format';
import { marketsFor } from '@/lib/industry';
import { debatesFor } from '@/lib/debates';
import { DocTable, Exhibit, Para, Signed, Small } from './doc';

export function IndustryBlock({ symbol, ex }: { symbol: string; ex: number }) {
  const list = marketsFor(symbol);
  if (!list.length) return null;
  const debates = debatesFor(symbol);
  return (
    <>
      <h3 className="mb-2 mt-6 text-[15px] font-bold">The market around it, as the researchers count it</h3>
      {list.map((m, i) => {
        const d = debates.find((x) => x.id === m.debate);
        return (
          <React.Fragment key={m.id}>
            <Para>
              <b>{m.market}, {m.period}.</b> {m.reading}{d ? <span className="text-muted-foreground"> (Key Debates: {d.short.toLowerCase()}.)</span> : null}
            </Para>
            <Exhibit n={ex + i} title={`${m.market}, ${m.period}${m.preliminary ? ', preliminary' : ''}`}
              source={`${m.publisher}, “${m.title}”, ${fmtDate(m.date)}.`}>
              {m.rows.length ? (
                <DocTable first="Company" head={[`Shipments (${m.unit})`, 'Share', 'A year earlier', 'Share then', 'Change']} rows={[
                  ...m.rows.map((r) => [
                    r.name === 'Apple' || r.name === 'NVIDIA' ? <b key="n">{r.name}</b> : r.name,
                    r.units.toFixed(1), pct(r.share), r.unitsYearAgo.toFixed(1), pct(r.shareYearAgo), <Signed key="g" v={r.growth} />,
                  ]),
                  ...(m.total ? [[<b key="t">Total</b>, m.total.units.toFixed(1), '100%', m.total.unitsYearAgo.toFixed(1), '100%', <Signed key="tg" v={m.total.growth} />]] : []),
                ]} />
              ) : (
                <DocTable first="Figure" head={['Published']} rows={(m.figures || []).map((f) => [f.label, f.value])} />
              )}
              <Small className="mt-1.5">
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">The publisher’s release</a>
                {m.preliminary ? '; the publisher calls these figures preliminary and subject to change' : ''}.
                {m.update ? <> Later, {fmtDate(m.update.date)}: “{m.update.text}” (<a href={m.update.url} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">{m.update.title}</a>).</> : null}
              </Small>
            </Exhibit>
          </React.Fragment>
        );
      })}
      <Small>Headline figures from free press releases only, copied from the publisher’s own page; the full trackers are licensed and not used here.</Small>
    </>
  );
}
