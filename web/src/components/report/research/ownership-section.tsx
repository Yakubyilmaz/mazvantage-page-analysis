'use client';

/* The Research tab's "Ownership and Positioning": 13F holders, the largest
   holders' moves, fund letters that name the company, and insiders' own
   trades. Model in `lib/ownership.ts`. */

import * as React from 'react';
import { curSymbol, fmtDate, isNum, money, num, pct } from '@/lib/format';

const int = (v: number) => Math.round(v).toLocaleString('en-US');
import { holderChange, holderName, loadOwnership, ownershipOf, type Ownership, type OwnershipFile } from '@/lib/ownership';
import { lettersFor } from '@/lib/firm-views';
import { STANCE_LABEL, firmOf, type Letter, type Mention } from '@/lib/letters';
import { fromBag, loadFeeds, type Bag } from '@/lib/research-feeds';
import { useNav } from '@/components/nav-context';
import type { Analysis } from '@/lib/model';
import { ColumnChart } from '@/components/charts/charts';
import { DocTable, Exhibit, Para, Section, Signed, Small, type Narrative } from './doc';
import { shortName } from './implied-section';

type Hit = { letter: Letter; mention?: Mention | null };

const firmName = (h: Hit) => firmOf(h.letter)?.name || h.letter.firm;
/** "all six we have read lean positive (A, B, …)", or the stances grouped when they differ. */
function stanceLine(read: Hit[]): string {
  const groups = new Map<string, string[]>();
  for (const h of read) {
    const k = STANCE_LABEL[h.mention!.stance!].toLowerCase();
    groups.set(k, [...(groups.get(k) || []), firmName(h)]);
  }
  if (groups.size === 1) {
    const [[k, names]] = [...groups];
    return `${read.length === 1 ? 'the one' : `all ${read.length}`} we have read lean${read.length === 1 ? 's' : ''} ${k} (${names.join(', ')})`;
  }
  return `of the ${read.length} we have read, ${[...groups].map(([k, names]) => `${names.length} lean ${k} (${names.join(', ')})`).join('; ')}`;
}

export function ownershipProse(o: Ownership, named: Hit[], name: string): string[] {
  const out: string[] = [];
  const s = o.summary;
  if (s) {
    const d = s.investorsHolding - s.lastInvestorsHolding;
    out.push(
      `${int(s.investorsHolding)} institutions reported a position in ${name} in their 13F filings for the quarter ended ${fmtDate(s.date)}, `
      + `${d >= 0 ? `${int(d)} more` : `${int(-d)} fewer`} than a quarter earlier, and between them held ${pct(s.ownershipPercent / 100)} of the shares, against ${pct(s.lastOwnershipPercent / 100)}. `
      + `${int(s.increasedPositions)} added to their holdings and ${int(s.reducedPositions)} cut them; ${int(s.newPositions)} opened a position and ${int(s.closedPositions)} closed one. `
      + (s.increasedPositions > s.reducedPositions
        ? 'More institutions added than cut.'
        : s.increasedPositions < s.reducedPositions
          ? `More institutions cut than added${s.ownershipPercent > s.lastOwnershipPercent ? ', yet the share they hold together rose: the buyers bought more than the sellers sold' : ''}.`
          : ''),
    );
  }
  const moves = o.holders.map((h) => ({ h, c: holderChange(h) })).filter((x) => isNum(x.c)) as { h: any; c: number }[];
  if (moves.length) {
    const up = moves.reduce((p, x) => (x.c > p.c ? x : p));
    const down = moves.reduce((p, x) => (x.c < p.c ? x : p));
    const flat = moves.filter((x) => Math.abs(x.c) < 0.0005);
    out.push(
      `Most of the largest holders are index and asset managers whose positions follow their funds’ flows rather than a view. Among the ten largest, `
      + `${holderName(up.h.investorName)} added most (${pct(up.c, { sign: true })} in shares)`
      + (down.c < 0 ? ` and ${holderName(down.h.investorName)} cut most (${pct(down.c)})` : '')
      + (flat.length ? `; ${flat.map((x) => holderName(x.h.investorName)).join(' and ')} held ${flat.length === 1 ? 'its' : 'their'} shares unchanged` : '')
      + '.',
    );
  }
  if (named.length) {
    const read = named.filter((x) => x.mention?.stance);
    out.push(
      `${named.length === 1 ? 'One document' : `${named.length} documents`} in the Letters & Outlooks library name${named.length === 1 ? 's' : ''} ${name}`
      + (read.length ? `; ${stanceLine(read)}.` : '.'),
    );
  }
  if (o.insiders.length) {
    const p = o.insiders.reduce((t, q) => t + q.purchases, 0);
    const sl = o.insiders.reduce((t, q) => t + q.sales, 0);
    const f = o.insiders[0];
    out.push(
      `Insiders reported ${p === 0 ? 'no' : int(p)} open-market purchase${p === 1 ? '' : 's'} and ${int(sl)} open-market sale${sl === 1 ? '' : 's'} on Form 4 over the ${o.insiders.length} quarters from Q${f.quarter} ${f.year}. `
      + (p === 0 ? 'Sales by executives paid in stock are routine and often pre-planned; a purchase would be the signal, and there has not been one.' : 'A purchase with the insider’s own money is the rarer and more telling signal.'),
    );
  }
  out.push('Short interest is not in the data this report reads, so what short sellers are doing is not shown.');
  return out;
}

export function OwnershipSection({ a, nar, ex }: { a: Analysis; nar: Narrative; ex: number }) {
  const nav = useNav();
  const [file, setFile] = React.useState<OwnershipFile | null>(null);
  const [bag, setBag] = React.useState<Bag | null>(null);
  const sym = a.facts.symbol;
  React.useEffect(() => {
    let live = true;
    loadOwnership().then((f) => { if (live) setFile(f); });
    loadFeeds(sym, ['insiderStats'], a.ds).then((b) => { if (live) setBag(b); });
    return () => { live = false; };
  }, [sym, a.ds]);
  const o = React.useMemo(() => ownershipOf(sym, file, fromBag(bag, a)('insiderStats')), [sym, file, bag, a]);
  const named = React.useMemo(() => lettersFor(sym, a.facts.sector, 8).filter((h) => h.why === 'names it'), [sym, a.facts.sector]);
  const cur = curSymbol(a.facts.currency);
  if (!o.summary && !o.holders.length && !o.insiders.length) return null;
  const paras = ownershipProse(o, named, shortName(a.facts));
  return (
    <Section id="rsr-owners" title="Ownership and Positioning" a={a} nar={nar} signed={false}>
      {paras.map((p, i) => <Para key={i}>{p}</Para>)}
      {o.holders.length ? (
        <Exhibit n={ex} title={`The ten largest 13F holders, quarter ended ${fmtDate(o.quarter)}`}
          source={`13F filings as filed${file ? `, captured ${fmtDate(file.capturedAt)}` : ''}; Maz Vantage.`}>
          <DocTable first="Holder" head={['Shares', 'Value', 'Of the company', 'Change in shares', 'Filed']} rows={o.holders.map((h) => {
            const c = holderChange(h);
            return [
              holderName(h.investorName), num(h.sharesNumber, 1), money(h.marketValue, { currency: cur }), pct(h.ownership / 100, { dp: 2 }),
              isNum(c) ? <Signed key="c" v={c} /> : <span key="c" className="text-muted-foreground">no prior filing under this number</span>,
              fmtDate(h.filingDate),
            ];
          })} />
          <Small className="mt-1.5">
            A filer with no position under the same 13F number a quarter earlier shows no change: managers re-register under new numbers when
            they reorganise, and the filing cannot tell that from a purchase. Values are at the quarter-end price.
          </Small>
        </Exhibit>
      ) : null}
      {o.insiders.length ? (
        <Exhibit n={ex + 1} title="Insiders’ open-market trades by quarter" source="Form 4 filings, as counted in published insider statistics; Maz Vantage.">
          <ColumnChart height={190} categories={o.insiders.map((q) => `Q${q.quarter} ’${String(q.year).slice(2)}`)} valueFmt={(v) => String(Math.round(v))}
            series={[
              { name: 'Purchases', color: 'var(--up)', values: o.insiders.map((q) => q.purchases) },
              { name: 'Sales', color: 'var(--down)', values: o.insiders.map((q) => q.sales) },
            ]} />
          <Small className="mt-1">
            Counts of open-market transactions; grants, option exercises and shares withheld for tax are not trades and are not counted.{' '}
            <button type="button" onClick={() => nav.goSymbolTab('Insider Trading', sym)} className="font-semibold text-primary hover:underline">Every filing, on the Insider Trading tab ›</button>
          </Small>
        </Exhibit>
      ) : null}
      {named.length ? (
        <>
          <p className="mb-1.5 mt-4 text-[14.5px] font-semibold">Documents in the library that name {sym}</p>
          <ul className="mb-3 grid gap-1.5 text-13 leading-relaxed">
            {named.map((h) => (
              <li key={h.letter.id}>
                <a href={h.letter.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-border underline-offset-2 hover:text-primary">{firmOf(h.letter)?.name || h.letter.firm}, {h.letter.title}</a>
                <span className="text-muted-foreground">, {fmtDate(h.letter.date.length === 7 ? `${h.letter.date}-01` : h.letter.date, h.letter.date.length === 7 ? { month: 'short', year: 'numeric' } : undefined)}</span>
                {h.mention?.stance ? <span className="text-tiny font-semibold uppercase text-muted-foreground"> · {STANCE_LABEL[h.mention.stance]}</span> : null}
                {h.mention?.view ? <span className="block text-tiny text-muted-foreground">{h.mention.view}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Section>
  );
}
