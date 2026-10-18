'use client';

/* The Research tab's "Street View": what the analysts expect and whether
   they are raising or cutting it, from `lib/street-view.ts` and the
   consensus ledger. */

import * as React from 'react';
import { curSymbol, fmtDate, isNum, money, pct, price } from '@/lib/format';
import { loadLedger, revisionText, streetProse, streetView, type Ledger } from '@/lib/street-view';
import { fromBag, loadFeeds, type Bag } from '@/lib/research-feeds';
import { disclosuresFor, loadDisclosures } from '@/lib/alpha-disclosures';
import type { Analysis } from '@/lib/model';
import { ColumnChart } from '@/components/charts/charts';
import { DocTable, Exhibit, Para, Section, Signed, Small, type Narrative } from './doc';
import { shortName } from './implied-section';

const Chg = ({ v }: { v: number }) => (Math.abs(v) < 0.0005
  ? <span className="text-muted-foreground">{revisionText(v)}</span>
  : <Signed v={v} />);

export function StreetSection({ a, nar, ex }: { a: Analysis; nar: Narrative; ex: number }) {
  const [ledger, setLedger] = React.useState<Ledger | null>(null);
  const [disc, setDisc] = React.useState<any>(null);
  const [bag, setBag] = React.useState<Bag | null>(null);
  React.useEffect(() => {
    let live = true;
    loadLedger().then((l) => { if (live) setLedger(l); });
    loadFeeds(a.facts.symbol, ['gradesHistorical', 'targetSummary'], a.ds).then((b) => { if (live) setBag(b); });
    loadDisclosures().then((d: any) => { if (live) setDisc(disclosuresFor(d, a.facts.symbol)); });
    return () => { live = false; };
  }, [a.facts.symbol]);
  const sv = React.useMemo(() => streetView(a, ledger, fromBag(bag, a)), [a, ledger, bag]);
  const cur = curSymbol(a.facts.currency);
  const px = isNum(a.facts.price) ? a.facts.price : null;
  const paras = streetProse(sv, shortName(a.facts), px, cur);
  const rv = sv.revisions;
  const trend = disc?.estimateRevisions;
  let n = ex;
  return (
    <Section id="rsr-street" title="Street View" a={a} nar={nar} signed={false}>
      {paras.map((p, i) => <Para key={i}>{p}</Para>)}

      {rv.rows.length ? (
        <Exhibit n={n++} title={rv.captures > 1 ? `Consensus by fiscal year, ${fmtDate(rv.from!)} against ${fmtDate(rv.to!)}` : `Consensus by fiscal year, ${fmtDate(rv.to!)}`}
          source={`the consensus ledger, ${rv.captures} capture${rv.captures === 1 ? '' : 's'} of the published analyst consensus; Maz Vantage.`}>
          <DocTable first="Fiscal year" head={['Revenue', 'Change', 'EPS', 'Change', 'EPS spread', 'Analysts']} rows={rv.rows.map((r) => {
            const sp = sv.dispersion.find((d) => d.fy === r.fy);
            return [
              `FY${r.year}`,
              isNum(r.revenueTo) ? money(r.revenueTo, { currency: cur }) : 'n/a',
              isNum(r.revenueChange) ? <Chg key="rc" v={r.revenueChange} /> : '—',
              isNum(r.epsTo) ? price(r.epsTo, cur) : 'n/a',
              isNum(r.epsChange) ? <Chg key="ec" v={r.epsChange} /> : '—',
              isNum(sp?.eps) ? pct(sp!.eps) : 'n/a',
              isNum(r.analysts) ? String(r.analysts) : 'n/a',
            ];
          })} />
          <Small className="mt-1.5">
            Change is the latest capture against the first that carried the year. EPS spread is the highest published estimate less the lowest,
            as a share of the average. Years with fewer than three analysts are left out: one analyst’s model moving is not the consensus moving.
          </Small>
        </Exhibit>
      ) : null}

      {trend?.periods?.length ? (
        <Exhibit n={n++} title={`Consensus EPS over the ninety days to ${fmtDate(trend.source.publicationDate)}, and the analysts behind the moves`}
          source={`${trend.source.publisher}, ${trend.source.title}, read ${fmtDate(trend.source.publicationDate)}.`}>
          <DocTable first="Period" head={['90 days ago', '60 days ago', '30 days ago', 'Then', 'Change', 'Up / down, 30 days']} rows={trend.periods.map((p: any) => [
            p.label,
            price(p.d90, cur), price(p.d60, cur), price(p.d30, cur), <b key="c">{price(p.current, cur)}</b>,
            <Signed key="s" v={isNum(p.d90) && p.d90 ? p.current / p.d90 - 1 : null} />,
            `${p.up30} / ${p.down30}`,
          ])} />
          <Small className="mt-1.5">A capture read by hand before the ledger existed; it shows the direction over the summer, on the GAAP basis the source displays.</Small>
        </Exhibit>
      ) : null}

      {isNum(sv.targets.consensus) ? (
        <Exhibit n={n++} title="Price targets against the price" source={`published analyst price targets${sv.targets.date ? `, captured ${fmtDate(sv.targets.date)}` : ''}; Maz Vantage.`}>
          <DocTable first="Target" head={['Value', 'Against the price']} rows={[
            ['Consensus', price(sv.targets.consensus, cur), <Signed key="u" v={sv.targets.upside} />],
            ...(isNum(sv.targets.median) ? [['Median', price(sv.targets.median, cur), <Signed key="m" v={isNum(px) ? sv.targets.median! / px - 1 : null} />]] : []),
            ...(isNum(sv.targets.high) ? [['Highest', price(sv.targets.high, cur), <Signed key="h" v={sv.targets.highUpside} />]] : []),
            ...(isNum(sv.targets.low) ? [['Lowest', price(sv.targets.low, cur), <Signed key="l" v={sv.targets.lowUpside} />]] : []),
            ...sv.targets.windows.map((w) => [`Average of targets set in the ${w.label.toLowerCase()} (${w.count})`, price(w.average, cur), <Signed key={w.label} v={isNum(px) && isNum(w.average) ? w.average / px - 1 : null} />]),
          ]} />
        </Exhibit>
      ) : null}

      {sv.mix.length >= 2 ? (
        <Exhibit n={n++} title="Analyst ratings each month" source="published analyst rating counts, monthly; Maz Vantage.">
          <ColumnChart height={210} stacked categories={sv.mix.map((m) => fmtDate(m.date, { month: 'short', year: '2-digit' }))}
            valueFmt={(v) => String(Math.round(v))} series={[
              { name: 'Buy', color: 'var(--up)', values: sv.mix.map((m) => m.buy) },
              { name: 'Hold', color: 'var(--muted-foreground)', values: sv.mix.map((m) => m.hold) },
              { name: 'Sell', color: 'var(--down)', values: sv.mix.map((m) => m.sell) },
            ]} />
          <Small className="mt-1">Strong buys are counted with buys and strong sells with sells.</Small>
        </Exhibit>
      ) : null}

      {sv.record ? (
        <Small className="mt-2">
          Results against the consensus: {sv.record.epsBeats} of {sv.record.quarters} quarters beat on EPS
          {sv.record.latest ? `; the latest, reported ${fmtDate(sv.record.latest.date)}, by ${isNum(sv.record.latest.epsSurprise) ? pct(sv.record.latest.epsSurprise, { sign: true }) : 'n/a'}` : ''}.
          {(a as any).surprises?.available ? ' The quarter-by-quarter record is on the Analysts Forecast tab.' : ''}
        </Small>
      ) : null}
      <Small className="mt-3">
        Consensus figures are the published analyst averages, used as they stand. Neither the targets nor the ratings are ours. The target
        consensus and the rating mix count inside the quant rating’s Momentum factor, under what the Street is doing, as on every tab;
        the estimate revisions above do not. Not investment advice.
      </Small>
    </Section>
  );
}
