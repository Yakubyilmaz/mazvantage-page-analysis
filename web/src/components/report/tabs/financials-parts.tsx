'use client';

/* ==========================================================================
   Maz Vantage — the Financials tab's shared parts

   What the GAAP and the non-GAAP panels both draw with: the statement table,
   the run badges, and the names of the two bases. Kept apart from both so
   neither panel file reaches into the other.
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, fmtDate, isNum, money, pct, signClass, yearOf, yoy } from '@/lib/format';
import type { Analysis } from '@/lib/model';
import { FeedGate, Notice, OCard, OHead, PerfCagr, StatLine, toneClass } from '@/components/report/ui';
import { cn } from '@/lib/cn';

export const DEFAULT_YEARS = 6;
export const statementRows = (a: Analysis, which: 'income' | 'balance' | 'cash'): any[] => a.facts.statements[which] || [];
export const moneyIn = (a: Analysis) => (v: number | null | undefined) => money(v, { currency: curSymbol(a.facts.currency) });
export const perShareIn = (a: Analysis) => (v: number | null | undefined) => (isNum(v) ? `${curSymbol(a.facts.currency)}${dec(v, 2)}` : 'n/a');
export const seriesOf = (rows: any[], get: (r: any) => unknown) => rows.map((r) => { const v = get(r); return isNum(v) ? v : null; });
export const timesOf = (v: unknown) => (isNum(v) ? `${dec(v, 2)}x` : 'n/a');

/* Matched by fiscal year, not array position: the two feeds can return
   different numbers of years, and position would divide 2018's cash by
   2016's revenue and print it as a margin. */
export const incomeByYear = (a: Analysis) => new Map(statementRows(a, 'income').map((r) => [yearOf(r.date), r]));

/* ---------- the two bases ----------------------------------------------------
   What the filed figures are called. "GAAP" unless the filing's own tags say
   IFRS, in which case the company's adjusted figures are non-IFRS — SAP calls
   them exactly that — and calling either side "GAAP" would be wrong. */

export interface BasisNames { filed: string; adjusted: string }
export const GAAP_NAMES: BasisNames = { filed: 'GAAP', adjusted: 'Non-GAAP' };
export const IFRS_NAMES: BasisNames = { filed: 'IFRS', adjusted: 'Non-IFRS' };
export const BasisContext = React.createContext<BasisNames>(GAAP_NAMES);
export const useBasisNames = () => React.useContext(BasisContext);

/** Perf / CAGR over the filed history alone, never over a forecast tail. */
export function RunBadges({ rows, get, invert }: { rows: any[]; get: (r: any) => unknown; invert?: boolean }) {
  const vals = rows.map(get).map((v) => (isNum(v) ? v : null));
  const from = vals.findIndex(isNum);
  if (from < 0) return null;
  const to = vals.length - 1 - [...vals].reverse().findIndex(isNum);
  if (to <= from) return null;
  return <PerfCagr first={vals[from]} last={vals[to]} years={to - from} invert={invert} />;
}

/**
 * One step of a reconciliation: a filed figure, what is added or taken away,
 * and what that comes to. The first line says which basis it is on, because
 * the point of the card is the distance between the two.
 */
export function ReconLine({ op, label, value, filed, note, tone, title }: {
  op?: '+' | '−' | '='; label: string; value: string; filed?: boolean; note?: React.ReactNode; tone?: 'pos' | 'neg' | ''; title?: string;
}) {
  const names = useBasisNames();
  return (
    <StatLine title={title} tone={tone} note={note} value={value}
      className={cn(op === '=' && '[&>span:first-child]:font-semibold [&>span:first-child]:text-foreground')}
      label={(
        <>
          {op ? <span className="mr-1.5 inline-block w-2.5 font-mono text-muted-foreground">{op}</span> : null}
          {label}
          {filed ? <span className="ml-1.5 text-micro font-semibold uppercase tracking-[.05em] text-muted-foreground/70">{names.filed}</span> : null}
        </>
      )} />
  );
}

/* ---------- the statement table --------------------------------------------
   Most recent first — the column almost every reader wants sits where the eye
   lands. A named group opens a labelled band, so nothing computed here is
   mistaken for something filed. */

export interface RowDef {
  label: string;
  /** The formula, printed under the label, for a figure calculated here. */
  hint?: string;
  get: (r: any) => unknown;
  strong?: boolean;
  derived?: boolean;
  group?: string;
  fmt?: (v: number, a: Analysis) => string;
}

export const epsFmt = (v: number, a: Analysis) => `${curSymbol(a.facts.currency)}${dec(v, 2)}`;
export const pctFmt = (v: number) => pct(v);
export const timesFmt = (v: number) => `${dec(v, 2)}x`;

export function StatementCard({ a, rows: chron, feed, id, title, defs, info, foot }: {
  a: Analysis; rows: any[]; feed: string; id: string; title: string; defs: RowDef[]; info: string; foot?: string;
}) {
  const rows = [...chron].reverse();
  const fmtMoney = moneyIn(a);
  const [showAll, setShowAll] = React.useState(rows.length <= DEFAULT_YEARS);
  const live = defs.map((d) => ({ ...d, values: seriesOf(rows, d.get) })).filter((d) => d.values.some(isNum));

  if (!rows.length || !live.length) {
    return (
      <OCard span={12} id={id}>
        <OHead title={title} />
        {a.ds.status(feed) !== 'ok' ? <FeedGate a={a} feed={feed} what={`The ${title.toLowerCase()}`} />
          : <Notice>No {title.toLowerCase()} lines were returned for this company.</Notice>}
      </OCard>
    );
  }
  const n = showAll ? rows.length : DEFAULT_YEARS;
  const shown = rows.slice(0, n);
  let group: string | null = null;

  return (
    <OCard span={12} id={id}>
      <OHead title={title} info={info} aside={rows.length > DEFAULT_YEARS ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-13 font-semibold text-primary hover:underline">
          {showAll ? `Show last ${DEFAULT_YEARS} years` : `Show all ${rows.length} years`}
        </button>
      ) : null} />
      <div className="overflow-x-auto scroll-thin">
        <table className="text-13">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
              <th className="sticky left-0 border-b border-border bg-background px-3 py-2 text-left font-semibold">Line item</th>
              {shown.map((r) => <th key={r.date} className="border-b border-border px-3 py-2 text-right font-semibold">{yearOf(r.date) ?? '—'}</th>)}
            </tr>
          </thead>
          <tbody>
            {live.flatMap((d) => {
              const out: React.ReactNode[] = [];
              if (d.group && d.group !== group) {
                group = d.group;
                out.push(
                  <tr key={`g-${d.group}`}>
                    <td colSpan={shown.length + 1} className="border-b border-border bg-muted px-3 py-1.5 text-micro font-semibold uppercase tracking-[.05em] text-muted-foreground">
                      {d.group}
                    </td>
                  </tr>,
                );
              }
              const fmt = d.fmt || ((v: number) => fmtMoney(v));
              out.push(
                <tr key={d.label} className={cn('hover:bg-accent/60', d.strong && 'font-semibold')}>
                  <td className="sticky left-0 whitespace-nowrap border-b border-border bg-background px-3 py-2">
                    {d.label}
                    {d.hint ? <span className="block text-micro font-normal text-muted-foreground">= {d.hint}</span> : null}
                  </td>
                  {d.values.slice(0, shown.length).map((v, i) => {
                    const change = i + 1 < shown.length ? yoy(v, d.values[i + 1]) : null;
                    return (
                      <td key={i} title={isNum(change) ? `${pct(change, { sign: true })} on ${yearOf(shown[i + 1].date)}` : undefined}
                        className={cn('whitespace-nowrap border-b border-border px-3 py-2 text-right tnum', !d.derived && toneClass(signClass(v)))}>
                        {isNum(v) ? fmt(v, a) : '—'}
                      </td>
                    );
                  })}
                </tr>,
              );
              return out;
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-tiny text-muted-foreground/80">
        Fiscal years ending {fmtDate(rows[rows.length - 1].date)} to {fmtDate(rows[0].date)}. Figures in {a.facts.currency || 'the reporting currency'}
        {foot ?? ', as reported — lines this data plan does not return are left out rather than shown empty.'}
      </p>
    </OCard>
  );
}
