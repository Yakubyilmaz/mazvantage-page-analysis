'use client';

/* ==========================================================================
   Maz Vantage — the SEC filings stream (News tab, third tab)

   What the company filed, newest first, filterable by what a filing is for
   and then by form. Fetched when the reader opens the tab — it is one request,
   but a report is already thirty-odd and most readers never open this one.

   The list is EDGAR's record, not a summary of it: each row is a form code,
   the day it was filed, the SEC's meaning of that form and a link to the
   document. Nothing here reads a filing, so nothing here says what one
   contains — "8-K" says something material happened, and the reader has to
   open it to learn what.
   ========================================================================== */

import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { fetchFor, loadSnapshot, SEC_FILINGS_CAP, type FeedResult } from '@/lib/fmp';
import { fmtDate } from '@/lib/format';
import {
  FILING_GROUPS, filterFilings, normaliseFilings, summariseFilings,
  type Filing, type FilingGroup,
} from '@/lib/sec-filings';
import { useDataEpoch } from '@/components/providers';
import { CsvButton } from '@/components/csv-button';
import { ChipRail } from '@/components/pages/page-parts';
import { FeedGate, Notice, OCard, OHead, Pill, StatLine, StatLines } from '@/components/report/ui';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const PAGE = 25;

type Load = { result: FeedResult | null; rows: Filing[] };

/** The live feed, falling back to the bundled capture — the rule every on-demand feed follows. */
function useFilings(symbol: string): Load {
  const { epoch } = useDataEpoch();
  const [state, setState] = React.useState<Load>({ result: null, rows: [] });
  React.useEffect(() => {
    let live = true;
    setState({ result: null, rows: [] });
    (async () => {
      let r = await fetchFor('secFilings', symbol);
      if (r.status !== 'ok') {
        const snap = await loadSnapshot(symbol);
        if (snap?.feeds?.secFilings) r = { status: 'ok', data: snap.feeds.secFilings, fromSnapshot: true, date: snap.capturedAt };
      }
      if (live) setState({ result: r, rows: r.status === 'ok' ? normaliseFilings(r.data) : [] });
    })();
    return () => { live = false; };
  }, [symbol, epoch]);
  return state;
}

function DocLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
      {children}<ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}

function RecordCard({ rows, result }: { rows: Filing[]; result: FeedResult }) {
  // Measured against the capture date for a capture, or "the last 90 days"
  // would count nothing on a snapshot that ages a day at a time.
  const now = result.fromSnapshot && result.date ? new Date(result.date).getTime() : Date.now();
  const s = summariseFilings(rows, { cap: result.fromSnapshot ? Infinity : SEC_FILINGS_CAP, now });
  const window90 = result.fromSnapshot ? '90 days to the save date' : 'last 90 days';
  return (
    <OCard span={4} id="news-sec-record">
      <OHead title="Filing record"
        info="Counts of filings, not of events: one Form 4 can report several trades, and one 8-K can carry results and a board change together. The trades themselves, with prices and codes, are in the Ownership section of the Analysis tab." />
      <StatLines>
        <StatLine label="Filings returned" value={String(s.total)}
          note={s.oldest ? `since ${fmtDate(s.oldest)}` : ''} />
        <StatLine label="Latest annual report" value={s.lastAnnual ? fmtDate(s.lastAnnual.filed) : 'none in window'}
          note={s.lastAnnual?.form} />
        <StatLine label="Latest quarterly report" value={s.lastQuarterly ? fmtDate(s.lastQuarterly.filed) : 'none in window'} />
        <StatLine label="Current reports" value={String(s.current90)} note={window90} />
        <StatLine label="Insider filings (3, 4, 5)" value={String(s.insider90)} note={window90} />
      </StatLines>
      {s.capped ? (
        <p className="mt-3 text-tiny leading-relaxed text-warning">
          The list holds at most {SEC_FILINGS_CAP.toLocaleString('en-US')} filings, and this company reached that cap, so the list goes back
          to {fmtDate(s.oldest)} rather than the two years asked for. Older filings are on EDGAR.
        </p>
      ) : null}
    </OCard>
  );
}

function ListCard({ symbol, rows, result }: { symbol: string; rows: Filing[]; result: FeedResult }) {
  const [group, setGroup] = React.useState<FilingGroup | 'all'>('all');
  const [form, setForm] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState(PAGE);
  const s = React.useMemo(() => summariseFilings(rows), [rows]);

  const inGroup = filterFilings(rows, group);
  const forms = summariseFilings(inGroup).forms;
  const list = filterFilings(rows, group, form);
  const left = list.length - Math.min(shown, list.length);

  const chips = [
    { id: 'all' as const, label: 'All', tag: `${s.total}` },
    ...FILING_GROUPS.filter((g) => s.byGroup[g.id]).map((g) => ({ id: g.id, label: g.label, tag: `${s.byGroup[g.id]}` })),
  ];
  const blurb = group === 'all' ? null : FILING_GROUPS.find((g) => g.id === group)?.blurb;

  const choose = (g: FilingGroup | 'all') => { setGroup(g); setForm(null); setShown(PAGE); };

  return (
    <OCard span={8} id="news-sec-list">
      <OHead title="Filings"
        aside={(
          <div className="flex items-center gap-2">
            {result.fromSnapshot ? <Pill tone="muted" title="Live data is unavailable, so this is a saved copy">saved {fmtDate(result.date)}</Pill> : null}
            <CsvButton name={`${symbol} sec filings${group === 'all' ? '' : ` ${group}`}${form ? ` ${form}` : ''}`}
              build={() => ({
                headers: ['Filed', 'Accepted', 'Form', 'Group', 'What it is', 'Document', 'Index'],
                rows: list.map((f) => [f.filed, f.accepted, f.form, FILING_GROUPS.find((g) => g.id === f.group)?.label, f.what, f.url, f.index]),
              })} />
          </div>
        )} />
      <ChipRail label="Filing type" items={chips} active={group} onChoose={choose} />
      {blurb ? <p className="mt-3 text-13 leading-relaxed text-muted-foreground">{blurb}</p> : null}
      {/* Forms only inside a group: across all of them it is twenty chips, most
          of which a reader would never filter to on their own. */}
      {group !== 'all' && forms.length > 1 ? (
        <div role="group" aria-label="Form" className="mt-3 flex flex-wrap gap-1.5">
          {[{ form: null as string | null, count: inGroup.length }, ...forms].map((f) => (
            <button key={f.form ?? 'all'} type="button" aria-pressed={form === f.form}
              onClick={() => { setForm(f.form); setShown(PAGE); }}
              className={cn('rounded-md border border-border px-2 py-1 text-micro font-semibold tnum hover:bg-accent',
                form === f.form && 'border-foreground bg-foreground text-background hover:bg-foreground')}>
              {f.form ? `Form ${f.form}` : 'Every form'} · {f.count}
            </button>
          ))}
        </div>
      ) : null}

      {list.length ? (
        <div className="mt-4 overflow-x-auto scroll-thin">
          <table className="w-full text-13">
            <thead>
              <tr>
                {['Filed', 'Form', 'What it is', ''].map((h, i) => (
                  <th key={i} className="whitespace-nowrap border-b border-border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground first:pl-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, shown).map((f, i) => (
                <tr key={`${f.index || f.url || f.form}-${i}`} className="hover:bg-accent/60">
                  <td className="whitespace-nowrap border-b border-border py-2.5 pl-0 pr-3 align-top tnum" title={f.accepted ? `Accepted by EDGAR ${f.accepted} (US Eastern)` : undefined}>
                    {fmtDate(f.filed)}
                  </td>
                  <td className="whitespace-nowrap border-b border-border px-3 py-2.5 align-top font-semibold">{f.form}</td>
                  <td className="border-b border-border px-3 py-2.5 align-top text-muted-foreground">{f.what}</td>
                  <td className="whitespace-nowrap border-b border-border px-3 py-2.5 text-right align-top">
                    <span className="inline-flex gap-3">
                      <DocLink href={f.url}>Document</DocLink>
                      {f.index && f.index !== f.url ? <DocLink href={f.index}>Exhibits</DocLink> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {left > 0 ? (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(left, PAGE)} more — {left} left
            </Button>
          ) : null}
        </div>
      ) : <Notice className="mt-4">No filings of this kind in the window.</Notice>}

      <p className="mt-4 text-tiny leading-relaxed text-muted-foreground/80">
        The form’s meaning is the SEC’s, printed beside the code; nothing on this page reads a filing, so nothing here says what one contains.
        Links open the document and its exhibit index on sec.gov.
      </p>
    </OCard>
  );
}

export function SecFilingsStream({ symbol }: { symbol: string }) {
  const { result, rows } = useFilings(symbol);
  if (!result) {
    return (
      <OCard span={12} id="news-sec-loading">
        <OHead title="SEC filings" />
        <p className="text-13 text-muted-foreground">Loading the filing list…</p>
      </OCard>
    );
  }
  if (result.status !== 'ok') {
    return (
      <OCard span={12} id="news-sec-none">
        <OHead title="SEC filings" />
        <FeedGate a={{ ds: { status: () => result.status, message: () => result.message || '' } }} feed="secFilings" what="SEC filings" />
      </OCard>
    );
  }
  if (!rows.length) {
    return (
      <OCard span={12} id="news-sec-empty">
        <OHead title="SEC filings" />
        <Notice>No SEC filings were returned for the last two years. A company listed outside the US files with its home regulator instead, and none of that is on EDGAR.</Notice>
      </OCard>
    );
  }
  return (
    <>
      <ListCard symbol={symbol} rows={rows} result={result} />
      <RecordCard rows={rows} result={result} />
    </>
  );
}
