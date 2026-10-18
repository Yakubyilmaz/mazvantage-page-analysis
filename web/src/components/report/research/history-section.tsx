'use client';

/* The Research tab's "Valuation History": today's multiples against the
   company's own fiscal-year record, the deepest falls in the daily closes,
   and how the shares have met each earnings report. Model in
   `lib/valuation-history.ts`. */

import * as React from 'react';
import { curSymbol, fmtDate, isNum, mult, pct, price } from '@/lib/format';
import {
  bands, drawdowns, earningsReactions, loadCloses, multiplesByYear, reactionSummary, trailingReturn,
  type Band, type Close, type Drawdown, type ReactionSummary,
} from '@/lib/valuation-history';
import { loadLedger, type Ledger } from '@/lib/street-view';
import { hasApiKey } from '@/lib/fmp';
import { loadDailyHistory } from '@/lib/price-history';
import type { Analysis } from '@/lib/model';
import { ColumnChart } from '@/components/charts/charts';
import { DocTable, Exhibit, Para, Section, Signed, Small, type Narrative } from './doc';
import { shortName } from './implied-section';

const fmtOf = (b: Band) => (v: number | null | undefined) => (isNum(v) ? (b.key === 'fcfYield' ? pct(v) : mult(v)) : 'n/a');

export function historyProse(bs: Band[], dds: Drawdown[], rets: { y: number; r: number | null }[], rs: ReactionSummary | null, name: string, first: string | null, cur = 'US$'): string[] {
  const out: string[] = [];
  const live = bs.filter((b) => isNum(b.today) && b.years >= 3);
  if (live.length) {
    const lines = live.map((b) => {
      const f = fmtOf(b);
      const yieldLike = b.key === 'fcfYield';
      const where = b.cheaperYears === b.years
        ? (yieldLike ? `lower than at every one of the ${b.years} fiscal year ends on record` : `dearer than at every one of the ${b.years} fiscal year ends on record`)
        : b.cheaperYears === 0
          ? (yieldLike ? `higher than at any of the ${b.years} fiscal year ends on record` : `cheaper than at any of the ${b.years} fiscal year ends on record`)
          : `${yieldLike ? 'lower' : 'dearer'} than at ${b.cheaperYears} of the ${b.years}`;
      const label = b.key === 'pe' || b.key === 'evEbitda' ? b.label : b.label.toLowerCase();
      return `${label} of ${f(b.today)} is ${where} (median ${f(b.median)}, range ${f(b.low)} in FY${b.lowYear} to ${f(b.high)} in FY${b.highYear})`;
    });
    const dear = live.filter((b) => isNum(b.vsMedian) && b.vsMedian > 0.1).length;
    const cheap = live.filter((b) => isNum(b.vsMedian) && b.vsMedian < -0.1).length;
    out.push(
      `Against its own record, ${name}’s ${lines.join('; its ')}. `
      + (dear === live.length ? 'On every measure the shares are dearer than usual for this company.'
        : cheap === live.length ? 'On every measure the shares are cheaper than usual for this company.'
          : dear > cheap ? 'On most measures the shares are dearer than usual for this company.'
            : cheap > dear ? 'On most measures the shares are cheaper than usual for this company.'
              : 'The measures disagree, which usually means the earnings base has moved faster than the price.'),
    );
  }
  const rr = rets.filter((x) => isNum(x.r));
  if (rr.length) {
    out.push(`The shares returned ${rr.map((x) => `${pct(x.r)} a year over ${x.y === 1 ? 'the last year' : `${x.y} years`}`).join(', ')}, price only, dividends excluded.`);
  }
  if (dds.length) {
    const d = dds[0];
    out.push(
      `Holding them has not been smooth. The deepest fall in the record${first ? ` since ${fmtDate(first, { month: 'short', year: 'numeric' })}` : ''} was ${pct(-d.depth)}, from ${price(d.peak, cur)} on ${fmtDate(d.peakDate)} to ${price(d.trough, cur)} on ${fmtDate(d.troughDate)}`
      + (d.recoveredDate ? `, and the old high was not regained until ${fmtDate(d.recoveredDate)}, ${d.days} days after it was set.` : ', and the old high has not been regained.')
      + (dds.length > 1 ? ` ${dds.length - 1 === 1 ? 'One other fall' : `${dds.length - 1} other falls`} went deeper than ${Math.floor(-dds[dds.length - 1].depth * 100)}%.` : ''),
    );
  }
  if (rs && rs.count) {
    const b = rs.biggest!;
    out.push(
      `Across the ${rs.count} earnings reports on record, the shares moved a median ${pct(rs.medianAbs)} either way in the next session, rose after ${rs.up} and fell after ${rs.down}`
      + (rs.beatButFell ? `, and ${rs.beatButFell === rs.down ? 'every one of the falls' : `${rs.beatButFell} of the falls`} came after a quarter that beat the EPS consensus` : '')
      + `. The largest move was ${pct(b.move, { sign: true })}, after the report of ${fmtDate(b.date)}${isNum(b.epsSurprise) ? `, which ${b.epsSurprise >= 0 ? 'beat' : 'missed'} the EPS consensus by ${pct(Math.abs(b.epsSurprise))}` : ''}. `
      + 'A beat is expected; what moves the shares is the guide and the size of the beat against the habit.',
    );
  }
  return out;
}

export function HistorySection({ a, nar, ex }: { a: Analysis; nar: Narrative; ex: number }) {
  const [closes, setCloses] = React.useState<Close[] | null>(null);
  const [ledger, setLedger] = React.useState<Ledger | null>(null);
  const sym = a.facts.symbol;
  React.useEffect(() => {
    let live = true;
    (async () => {
      let c: Close[] | null = null;
      if (hasApiKey()) {
        const h = await loadDailyHistory(sym).catch(() => null);
        if (h?.status === 'ok' && h.source === 'live') c = h.bars.map((b: any) => [b.date, b.close] as Close).sort((x, y) => x[0].localeCompare(y[0]));
      }
      if (!c) c = await loadCloses(sym);
      if (live) setCloses(c);
    })();
    loadLedger().then((l) => { if (live) setLedger(l); });
    return () => { live = false; };
  }, [sym]);
  const years = React.useMemo(() => multiplesByYear((n) => a.ds.get(n)), [a]);
  const bs = React.useMemo(() => bands(a, years), [a, years]);
  const dds = React.useMemo(() => (closes ? drawdowns(closes) : []), [closes]);
  const rets = React.useMemo(() => [10, 5, 1].map((y) => ({ y, r: closes ? trailingReturn(closes, y) : null })), [closes]);
  const reactions = React.useMemo(() => {
    if (!closes) return [];
    const own = a.ds.get('earnings');
    const rep = ledger?.reported?.[sym];
    const rows = Array.isArray(own) && own.length ? own : rep && typeof rep === 'object' ? rep.rows : [];
    return earningsReactions(closes, rows);
  }, [closes, ledger, a, sym]);
  const rs = reactions.length ? reactionSummary(reactions) : null;
  const cur = curSymbol(a.facts.currency);
  if (!years.length && !closes) return null;
  const paras = historyProse(bs, dds, rets, rs, shortName(a.facts), closes?.[0]?.[0] || null, cur);
  const pe = bs.find((b) => b.key === 'pe');
  return (
    <Section id="rsr-history" title="Valuation History" a={a} nar={nar} signed={false}>
      {paras.map((p, i) => <Para key={i}>{p}</Para>)}
      {bs.some((b) => b.years) ? (
        <Exhibit n={ex} title="Today’s multiples against the company’s own fiscal-year record"
          source="company filings and market value at each fiscal year end; today’s trailing multiples as the report computes them; Maz Vantage.">
          <DocTable first="Multiple" head={['Today', 'Median', 'Low', 'High', 'Years cheaper than today']} rows={bs.filter((b) => b.years).map((b) => {
            const f = fmtOf(b);
            return [
              b.label, <b key="t">{f(b.today)}</b>, f(b.median), `${f(b.low)} (FY${b.lowYear})`, `${f(b.high)} (FY${b.highYear})`,
              isNum(b.cheaperYears) ? `${b.key === 'fcfYield' ? b.years - b.cheaperYears : b.cheaperYears} of ${b.years}` : 'n/a',
            ];
          })} />
          <Small className="mt-1.5">
            Each year’s multiple is the market value at the fiscal year end over that year’s filed figures; today’s is trailing twelve months. For the
            free cash flow yield, a lower figure is the dearer one, and “cheaper” counts the years that yielded more.
          </Small>
        </Exhibit>
      ) : null}
      {pe && pe.years > 2 ? (
        <Exhibit n={ex + 1} title="P/E at each fiscal year end, against today’s" source="company filings; Maz Vantage.">
          <ColumnChart height={210} legend={false} categories={years.filter((y) => isNum(y.pe)).map((y) => `FY${y.year}`)} valueFmt={(v) => mult(v)}
            series={[{ name: 'P/E', color: 'var(--chart-1)', values: years.filter((y) => isNum(y.pe)).map((y) => y.pe) }]}
            refLine={isNum(pe.today) ? { value: pe.today, label: `Today ${mult(pe.today)}` } : null} />
        </Exhibit>
      ) : null}
      {dds.length ? (
        <Exhibit n={ex + 2} title="The deepest falls in the daily closes" source={`daily closing prices, split-adjusted, ${closes ? `${fmtDate(closes[0][0])} to ${fmtDate(closes[closes.length - 1][0])}` : ''}; Maz Vantage.`}>
          <DocTable first="Peak" head={['Trough', 'Fall', 'Old high regained', 'Days, peak to recovery']} rows={dds.map((d) => [
            `${fmtDate(d.peakDate)}, ${price(d.peak, cur)}`, `${fmtDate(d.troughDate)}, ${price(d.trough, cur)}`, <Signed key="d" v={d.depth} />,
            d.recoveredDate ? fmtDate(d.recoveredDate) : 'Not yet', isNum(d.days) ? String(d.days) : '—',
          ])} />
        </Exhibit>
      ) : null}
      {reactions.length ? (
        <Exhibit n={ex + 3} title="The next session’s move after each earnings report" source="daily closes and reported results against the consensus; Maz Vantage.">
          <ColumnChart height={200} legend={false} categories={reactions.map((r) => fmtDate(r.date, { month: 'short', year: '2-digit' }))} valueFmt={(v) => pct(v)}
            series={[{ name: 'Move', color: 'var(--chart-1)', values: reactions.map((r) => r.move), colors: reactions.map((r) => (r.move < 0 ? 'var(--down)' : 'var(--up)')) }]} />
          <Small className="mt-1">From the close on the report date to the next close, which assumes the company reports after the market closes, as {a.facts.symbol} does.</Small>
        </Exhibit>
      ) : null}
    </Section>
  );
}
