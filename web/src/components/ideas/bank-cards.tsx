'use client';

/* ==========================================================================
   Maz Vantage — the big banks behind "Following the big banks"

   Three cards the big-banks portfolio adds to its page: which filings were
   read and what each bank did in them; which bank added what among the
   companies that passed; and what a bank's 13F can and cannot say. The
   model is `lib/institutions.ts`; this file lays it out.
   ========================================================================== */

import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { fmtDate, isNum, money, pct } from '@/lib/format';
import { BANKS, quorumOf, type BankBook, type BankMove, type Stake } from '@/lib/institutions';
import { quarterLabel } from '@/lib/superinvestors';
import { useNav } from '@/components/nav-context';
import { CsvButton } from '@/components/csv-button';
import { Limits, Notice, OCard, OHead, Pill } from '@/components/report/ui';
import { cn } from '@/lib/cn';

const th = 'whitespace-nowrap border-b border-border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground first:pl-0';
const td = 'border-b border-border px-3 py-2 align-top first:pl-0';
/** A count in full: `num` abbreviates thousands, and "5k positions" hides the figure. */
const count = (n: number) => Math.round(n).toLocaleString('en-US');

/** The funnel, step by step. The headline count means little without it. */
function funnelLine(result: any, book: BankBook) {
  const bits = [`The ${book.read} banks’ filings name ${count(book.stakes.size)} companies.`];
  if (isNum(result.universeSize)) {
    bits.push(`${count(result.universeSize)} of them are US-listed operating companies over ${money(result.idea.universe.marketCapMoreThan)}, one row per company.`);
  }
  if (isNum(result.prefiltered)) {
    bits.push(`${count(result.prefiltered)} passed the three filing rules, which cost nothing per company.`);
  }
  if (isNum(result.tested)) {
    bits.push(`The ${count(result.tested)} most widely bought of those — most banks adding, then the biggest combined rise — were checked against all 13F filers and scored, and ${count(result.passedCount)} passed; the top ${result.rows.length} by ${result.idea.sortLabel} are shown.`);
    if (isNum(result.prefiltered) && result.prefiltered > result.tested) {
      bits.push(`The other ${count(result.prefiltered - result.tested)} were not checked: each run tests a fixed number, and they are the ones fewer banks added to.`);
    }
  }
  return bits.join(' ');
}

const stateTone = { read: 'good', behind: 'warn', failed: 'bad' } as const;

/** Which filings the portfolio read, and what each bank did across all of them. */
export function BanksCard({ result }: { result: any }) {
  const book: BankBook | null = result?.book ?? null;
  if (!book) return null;
  const span = book.latest && book.previous ? `${quarterLabel(book.latest)} against ${quarterLabel(book.previous)}` : null;
  return (
    <OCard span={12} id="pf-banks">
      <OHead title="The banks this portfolio follows"
        aside={span ? <Pill tone="muted">13F, {span}</Pill> : null}
        info="Each bank’s Form 13F for the two quarter ends named here. Positions are long stock only, matched quarter to quarter by CUSIP and adjusted for stock splits. Reported value is the filing’s own total, options and bonds included." />
      {book.status !== 'ok' ? (
        <Notice error={book.status === 'error'}>
          {book.status === 'gated'
            ? 'The banks’ 13F filings are not available right now, so the portfolio cannot be built.'
            : book.message || 'The banks’ filings could not be read.'}
        </Notice>
      ) : null}
      {book.banks.length ? (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-13">
            <thead>
              <tr>
                {['Bank', 'Filed as', 'Filed', 'Stocks held', 'Reported value', 'Adding', 'Cutting'].map((h, i) => (
                  <th key={h} className={cn(th, i > 2 && 'text-right')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {book.banks.map((b) => (
                <tr key={b.key} className={cn(!b.read && 'text-muted-foreground')}>
                  <td className={cn(td, 'font-semibold')}>{b.name}</td>
                  <td className={td}>
                    <ul className="grid gap-1">
                      {b.filers.map((f) => (
                        <li key={f.cik} className="flex flex-wrap items-center gap-2">
                          {f.filingUrl ? (
                            <a href={f.filingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                              title={`CIK ${f.cik} — the filing on sec.gov`}>
                              {f.name}<ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          ) : <span title={`CIK ${f.cik}`}>{f.name}</span>}
                          {f.state !== 'read' ? <Pill tone={stateTone[f.state]} title={f.message || undefined}>{f.state === 'behind' ? 'not filed yet' : 'not read'}</Pill> : null}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className={cn(td, 'whitespace-nowrap')}>{[...new Set(b.filers.map((f) => f.filedOn).filter(Boolean))].map((d) => fmtDate(d)).join(', ') || '—'}</td>
                  <td className={cn(td, 'text-right tnum')}>{b.read ? count(b.positions) : '—'}</td>
                  <td className={cn(td, 'text-right tnum')}>{b.read ? money(b.value) : '—'}</td>
                  <td className={cn(td, 'text-right tnum text-up')}>{b.read ? count(b.adds) : '—'}</td>
                  <td className={cn(td, 'text-right tnum text-down')}>{b.read ? count(b.cuts) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {book.status === 'ok' ? (
        <div className="mt-3 grid gap-2 text-tiny leading-relaxed text-muted-foreground/80">
          <p>
            {book.read} of {BANKS.length} banks read; “most of them” is {quorumOf(book.read)} of those {book.read}. BNP Paribas files under three
            entities, added together here. {book.splits.read
              ? `${book.splits.applied.length} held ${book.splits.applied.length === 1 ? 'company' : 'companies'} split ${book.splits.applied.length === 1 ? 'its' : 'their'} shares between the two quarter ends${book.splits.applied.length ? ` (${book.splits.applied.slice(0, 8).join(', ')}${book.splits.applied.length > 8 ? '…' : ''})` : ''}; the earlier counts are restated in today’s shares.`
              : 'The split calendar could not be read, so the “adding” counts may include stock splits; the last rule still catches them, because it compares the banks with every other holder on the same basis.'}
          </p>
          {result.state === 'ok' ? <p>{funnelLine(result, book)}</p> : null}
        </div>
      ) : null}
    </OCard>
  );
}

function MoveCell({ m }: { m?: { shares: number; prevShares: number; move: BankMove } }) {
  if (!m || m.move === 'none') return <span className="text-muted-foreground/60">—</span>;
  const title = `${Math.round(m.shares).toLocaleString('en-US')} shares, ${Math.round(m.prevShares).toLocaleString('en-US')} the quarter before (in today’s shares)`;
  if (m.move === 'new') return <span title={title} className="font-semibold text-up">New</span>;
  if (m.move === 'sold') return <span title={title} className="font-semibold text-down">Sold</span>;
  const change = m.shares / m.prevShares - 1;
  return (
    <span title={title} className={cn('tnum', m.move === 'added' ? 'text-up' : m.move === 'reduced' ? 'text-down' : 'text-muted-foreground')}>
      {m.move === 'unchanged' ? '0%' : pct(change, { sign: true, dp: change > -0.1 && change < 0.1 ? 1 : 0 })}
    </span>
  );
}

/** Company by bank: who added what, among the companies that passed. */
export function BankMatrix({ result }: { result: any }) {
  const nav = useNav();
  const book: BankBook | null = result?.book ?? null;
  const rows: { symbol: string; name: string; banks: Stake }[] = (result?.rows || []).filter((r: any) => r.banks);
  if (!book || book.status !== 'ok' || !rows.length) return null;
  const read = book.banks;
  return (
    <OCard span={12} id="pf-bank-matrix">
      <OHead title="Who added what"
        info="Each bank’s change in shares from one quarter end to the next, after splits. New: it held none before. Sold: it holds none now. Hover a cell for the share counts."
        aside={(
          <CsvButton name={`big banks 13F ${quarterLabel(book.latest)}`} build={() => ({
            headers: ['Symbol', 'Company', ...read.flatMap((b) => [`${b.name} shares`, `${b.name} shares before`])],
            rows: rows.map((r) => [r.symbol, r.name, ...read.flatMap((b) => {
              const m = r.banks.byBank[b.key];
              return [m ? Math.round(m.shares) : null, m ? Math.round(m.prevShares) : null];
            })]),
          })} />
        )} />
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-13">
          <thead>
            <tr>
              <th className={th}>Company</th>
              {read.map((b) => <th key={b.key} title={b.name} className={cn(th, 'text-right', !b.read && 'opacity-50')}>{b.short}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="hover:bg-accent/60">
                <td className={td}>
                  <button type="button" onClick={() => nav.goSymbol(r.symbol)} className="grid text-left hover:text-primary" title={`Open the ${r.symbol} report`}>
                    <b className="font-semibold">{r.symbol}</b>
                    <span className="max-w-[200px] truncate text-tiny text-muted-foreground">{r.name}</span>
                  </button>
                </td>
                {read.map((b) => (
                  <td key={b.key} className={cn(td, 'text-right')}>{b.read ? <MoveCell m={r.banks.byBank[b.key]} /> : <span className="text-muted-foreground/60">n/r</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OCard>
  );
}

/** What a bank's 13F is, which is not what a fund's is. */
export function BankLimitsCard() {
  return (
    <OCard span={12} id="pf-bank-limits">
      <OHead title="What following a bank’s 13F can and cannot tell you" />
      <Limits items={[
        <><b className="font-semibold text-foreground">It is not the bank’s view.</b> One filing covers the bank’s asset manager (index and active funds), its private bank’s client accounts and its trading desk, including shares held to hedge derivatives sold to clients. A bank “buying” is client money, index rebalancing and hedging as much as any decision — which is why this portfolio asks for most of nine banks at once rather than any one.</>,
        <><b className="font-semibold text-foreground">It is late.</b> A 13F shows the quarter-end holding and is due 45 days later. Nothing here says what any bank holds today.</>,
        <><b className="font-semibold text-foreground">Long stock only.</b> Option lines are left out — a put is a bet against the stock, and a bank’s are mostly hedges — and so are bonds and convertibles reported in principal amount, and securities with no ticker on record.</>,
        <><b className="font-semibold text-foreground">Share counts, not money.</b> A position whose price rose with no shares bought is unchanged. Splits are restated from the split calendar; a merger paid in shares, a bonus issue or a spin-off raises every holder’s count, which is what the last rule — faster than all 13F filers — is for.</>,
        <><b className="font-semibold text-foreground">Names come from the screener, not the filing.</b> Filers sometimes pair a CUSIP with the wrong issuer name (BNP Paribas’s own Q2 2026 filing does), so positions are matched on the CUSIP the bank reported and named by the ticker on record for it.</>,
      ]} />
    </OCard>
  );
}
