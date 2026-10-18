'use client';

/* The Research tab's "Our Record and Signposts": each edition against the
   price since, and the thresholds at which a rating would move. Model in
   `lib/signposts.ts`. */

import * as React from 'react';
import { curSymbol, fmtDate, isNum, pct, price } from '@/lib/format';
import { editionsFor } from '@/lib/research-editions';
import { debatesFor } from '@/lib/debates';
import { signpostProse, signposts, trackRecord, type SignInputs } from '@/lib/signposts';
import { loadCloses, type Close } from '@/lib/valuation-history';
import type { Analysis } from '@/lib/model';
import { DocTable, Exhibit, Para, Section, Signed, Small, type Narrative, type Ratings } from './doc';
import { shortName, useImplied } from './implied-section';

export function SignpostsSection({ a, r, nar, ex }: { a: Analysis; r: Ratings; nar: Narrative; ex: number }) {
  const sym = a.facts.symbol;
  const cur = curSymbol(a.facts.currency);
  const [closes, setCloses] = React.useState<Close[] | null>(null);
  React.useEffect(() => { let live = true; loadCloses(sym).then((c) => { if (live) setCloses(c); }); return () => { live = false; }; }, [sym]);
  const imAll = useImplied(a);
  const inputs: SignInputs = {
    price: isNum(a.facts.price) ? a.facts.price : null, cur,
    zone: { label: r.zone.label, low: r.zone.low, high: r.zone.high },
    quant: { score: r.quant.score, verdict: r.quant.verdict },
    implied: imAll.available ? imAll : null,
    debates: debatesFor(sym),
    nextEarnings: a.quarter?.next || null,
    fmt: { price: (v) => price(v, cur), pct: (v) => pct(v) },
  };
  const rows = signposts(inputs);
  const paras = signpostProse(shortName(a.facts), inputs);
  const record = trackRecord(editionsFor(sym), closes);
  const mismatch = record.filter((x) => isNum(x.price) && isNum(x.closeThen) && Math.abs(x.price / x.closeThen - 1) > 0.005);
  return (
    <Section id="rsr-signposts" title="Our Record and Signposts" a={a} nar={nar} signed={false}>
      {record.length ? (
        <>
          <Para>
            Every edition of this report is kept, with the price on its date, so its calls can be checked against what the shares did next.
            The record is short because the report is new{record[0].lastDate ? `; the last close on file is ${price(record[0].lastClose, cur)} on ${fmtDate(record[0].lastDate)}` : ''}.
          </Para>
          <Exhibit n={ex} title="Each edition against the price since" source="Maz Vantage editions on record; daily closes.">
            <DocTable first="Edition" head={['Price used', 'Close that day', 'Fair value', 'Zone', 'Quant verdict', 'Last close', 'Since the close']} rows={record.map((x) => [
              fmtDate(x.date), isNum(x.price) ? price(x.price, cur) : 'n/a', isNum(x.closeThen) ? price(x.closeThen, cur) : 'n/a', isNum(x.fairValue) ? price(x.fairValue, cur) : 'n/a',
              x.zone || 'n/a', x.verdict || 'n/a', isNum(x.lastClose) ? price(x.lastClose, cur) : 'n/a', <Signed key="m" v={x.move} />,
            ])} />
            <Small className="mt-1.5">
              {mismatch.length ? `The price used differs from that day’s close for ${mismatch.map((x) => fmtDate(x.date)).join(' and ')}: the bundled quote was older than the bundled price history, and the edition was written on the quote. A refreshed quote and a new edition put this right. ` : ''}
              A report that calls a share overvalued is right over time if the price falls toward the estimate, or the estimate rises to meet it. A
              month says nothing yet; the table is here so that a year will.
            </Small>
          </Exhibit>
        </>
      ) : null}
      <h3 className="mb-2 mt-6 text-[15px] font-bold">What would change the view</h3>
      {paras.map((p, i) => <Para key={i}>{p}</Para>)}
      {rows.length ? (
        <Exhibit n={ex + 1} title="Signposts: the threshold for each rating and debate, and where it stands" source="Maz Vantage, from the figures in this report; debate tests from Key Debates.">
          <DocTable first="Signpost" head={['Threshold', 'Now', 'Next test']} rows={rows.map((x) => [
            <span key="w" className="block min-w-[10rem] whitespace-normal font-medium">{x.what}</span>,
            <span key="t" className="block min-w-[14rem] whitespace-normal text-left">{x.threshold}</span>,
            <span key="n" className="block min-w-[9rem] whitespace-normal text-left text-muted-foreground">{x.now}</span>,
            x.date ? fmtDate(x.date) : '—',
          ])} />
        </Exhibit>
      ) : null}
    </Section>
  );
}
