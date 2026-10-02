'use client';

/* ==========================================================================
   Maz Vantage — the Transcripts tab

   What management said, quarter by quarter, next to what the quarter actually
   did. Two states behind one tab: the index of calls, and one call open.

   - **The index is cheap and the text is not.** The dataset carries only the
     index; the text of one call arrives when somebody opens it, cached for the
     session.
   - **A transcript alone is not worth much.** Every row carries the quarter's
     own surprise against consensus and its growth on the same quarter a year
     before, matched out of the earnings feed by report date.
   - **FMP gates transcripts to its top plans**, and the tab says so plainly
     rather than showing an empty list.
   - **The summary is written, not generated.** Summaries live in
     `/data/summaries.json`, written from the transcript by hand, and every one
     prints who wrote it and when. This report runs no language model.
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, fmtDate, isNum, money, pct, signClass } from '@/lib/format';
import { fetchTranscript, logoUrl, type FeedResult } from '@/lib/fmp';
import type { Analysis } from '@/lib/model';
import { ColumnChart } from '@/components/charts/charts';
import { FeedGate, Logo, Notice, OCard, OHead, StatLine, StatLines, toneClass } from '@/components/report/ui';
import { Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/** Calls listed before the reader asks for the rest. */
const DEFAULT_CALLS = 12;
/** Paragraphs shown before the "read the rest" control. */
const DEFAULT_PARAGRAPHS = 14;

type CallRow = { year: number; quarter: number; date: string };

/*
  The written summaries, fetched once per session. A failed fetch is not an
  error — it means none are shipped, and the transcript renders on its own.
*/
let summariesPromise: Promise<Record<string, any>> | null = null;
const loadSummaries = () => (summariesPromise ??= fetch('/data/summaries.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({})));

/* ==========================================================================
   Joining a call to its quarter
   ========================================================================== */

const msOf = (v: unknown) => {
  const t = new Date(v as string).getTime();
  return Number.isFinite(t) ? t : null;
};

/*
  The earnings row that belongs to a call, matched by date: the index dates a
  call by the day it was held and the earnings feed by the day it was
  reported, the same day for most companies and one apart for the rest. A week
  either side catches that and cannot reach the next quarter.
*/
function quarterFor(earnings: any[], date: unknown) {
  const at = msOf(date);
  if (!isNum(at)) return null;
  const WEEK = 7 * 24 * 3600 * 1000;
  let best: any = null;
  let bestGap = Infinity;
  for (const r of earnings) {
    const t = msOf(r.date);
    if (!isNum(t)) continue;
    const gap = Math.abs(t - at);
    if (gap <= WEEK && gap < bestGap) { best = r; bestGap = gap; }
  }
  return best;
}

/** Growth is against the same quarter a year earlier — the comparison every company makes on the call. */
function callMetrics(earnings: any[], date: unknown) {
  const now = quarterFor(earnings, date);
  if (!now) return null;
  const at = msOf(now.date);
  const YEAR = 365 * 24 * 3600 * 1000;
  const priorYear = quarterFor(earnings, isNum(at) ? new Date(at - YEAR).toISOString().slice(0, 10) : null);
  const surprise = (actual: unknown, est: unknown) => (isNum(actual) && isNum(est) && est !== 0 ? actual / Math.abs(est) - 1 : null);
  const growth = (v: unknown, was: unknown) => (isNum(v) && isNum(was) && was > 0 ? v / was - 1 : null);
  return {
    eps: now.epsActual ?? null,
    epsEstimate: now.epsEstimated ?? null,
    epsSurprise: surprise(now.epsActual, now.epsEstimated),
    epsGrowth: growth(now.epsActual, priorYear?.epsActual),
    revenue: now.revenueActual ?? null,
    revenueEstimate: now.revenueEstimated ?? null,
    revenueSurprise: surprise(now.revenueActual, now.revenueEstimated),
    revenueGrowth: growth(now.revenueActual, priorYear?.revenueActual),
  };
}

/* ==========================================================================
   The transcript text — the transcriber's newlines where it has them, and
   four-sentence blocks where it does not, so the reader is not handed forty
   thousand words as one wall.
   ========================================================================== */

const SPEAKER = /^\s*\[?([^:[\]]{2,60}?)\]?\s*:\s*/;

function paragraphsOf(content: unknown) {
  const text = String(content || '').trim();
  if (!text) return [];
  let blocks = text.split(/\n{1,}/).map((x) => x.trim()).filter(Boolean);
  if (blocks.length < 3) {
    const sentences = text.split(/(?<=[.?!])\s+(?=[A-Z[])/);
    blocks = [];
    for (let i = 0; i < sentences.length; i += 4) blocks.push(sentences.slice(i, i + 4).join(' ').trim());
    blocks = blocks.filter(Boolean);
  }
  return blocks.map((block) => {
    const m = SPEAKER.exec(block);
    // A "speaker" of forty words is a sentence with a colon in it, not a name.
    if (m && m[1].split(/\s+/).length <= 6) return { speaker: m[1].trim(), text: block.slice(m[0].length).trim() };
    return { speaker: null as string | null, text: block };
  }).filter((p) => p.text);
}

const earningsOf = (a: Analysis): any[] => (Array.isArray(a.ds.get('earnings')) ? a.ds.get('earnings') : []);
const sameCall = (x: CallRow, y: CallRow) => x.year === y.year && x.quarter === y.quarter;

/* ==========================================================================
   The index
   ========================================================================== */

/** The consensus EPS for the quarter that has not reported yet. */
function nextEpsEstimate(a: Analysis) {
  const cur = curSymbol(a.facts.currency);
  const pending = earningsOf(a).filter((r) => r && !isNum(r.epsActual) && isNum(r.epsEstimated))
    .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())[0];
  return pending ? `${cur}${dec(pending.epsEstimated, 2)}` : 'n/a';
}

const SummaryBadge = () => <span className="rounded bg-primary/12 px-1.5 py-px text-micro font-semibold text-primary">Summary</span>;

function IndexRow({ a, row, onOpen, hasSummary }: { a: Analysis; row: CallRow; onOpen: () => void; hasSummary: boolean }) {
  const m = callMetrics(earningsOf(a), row.date);
  const Metric = ({ label, v }: { label: string; v: unknown }) => (
    <div className="grid gap-0.5 text-right">
      <i className="text-micro not-italic text-muted-foreground">{label}</i>
      <b className={cn('text-13 font-semibold tnum', isNum(v) ? toneClass(signClass(v)) : 'text-muted-foreground')}>{isNum(v) ? pct(v, { sign: true }) : 'n/a'}</b>
    </div>
  );
  return (
    <button type="button" onClick={onOpen}
      className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-2 py-3 text-left last:border-b-0 hover:bg-accent max-md:grid-cols-[36px_minmax(0,1fr)]">
      <Logo url={logoUrl(a.facts.symbol)} label={a.facts.symbol} fallback="none" />
      <div className="grid min-w-0 gap-0.5">
        <span className="flex items-center gap-2 text-sm font-semibold"><span className="truncate">{a.facts.name} — Q{row.quarter} {row.year}</span>{hasSummary ? <SummaryBadge /> : null}</span>
        <span className="text-tiny text-muted-foreground">{a.facts.exchange || ''}:{a.facts.symbol} · {fmtDate(row.date)}</span>
      </div>
      {m ? (
        <div className="grid grid-cols-4 gap-6 max-md:col-span-2 max-md:grid-cols-2 max-md:gap-3">
          <Metric label="EPS surprise" v={m.epsSurprise} />
          <Metric label="EPS growth" v={m.epsGrowth} />
          <Metric label="Revenue surprise" v={m.revenueSurprise} />
          <Metric label="Revenue growth" v={m.revenueGrowth} />
        </div>
      ) : <span className="text-tiny text-muted-foreground/80">No reported quarter matches this call</span>}
    </button>
  );
}

function IndexView({ a, rows, written, onOpen }: { a: Analysis; rows: CallRow[]; written: CallRow[]; onOpen: (r: CallRow) => void }) {
  const [showAll, setShowAll] = React.useState(rows.length <= DEFAULT_CALLS);
  const next = a.quarter?.next || null;
  const hasSummary = (r: CallRow) => written.some((w) => sameCall(w, r));
  return (
    <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
      {next ? (
        <OCard span={12} id="tr-next">
          <OHead title="Next results" info="The expected date of the next report. Companies confirm these late and move them, so it is an expectation rather than a diary entry." />
          <StatLines split>
            <StatLine label="Expected" value={fmtDate(next)} />
            <StatLine label="Consensus earnings per share" value={nextEpsEstimate(a)} note="for the quarter" />
          </StatLines>
        </OCard>
      ) : null}
      <OCard span={12} id="tr-index">
        <OHead title={`${a.facts.name} earnings calls`}
          aside={rows.length > DEFAULT_CALLS ? (
            <button type="button" className="text-13 font-semibold text-primary hover:underline" onClick={() => setShowAll((s) => !s)}>
              {showAll ? `Show the latest ${DEFAULT_CALLS}` : `Show all ${rows.length} calls`}
            </button>
          ) : null}
          info="Newest first. The figures beside each call are that quarter’s own — how it landed against the consensus that stood before it, and how it compares with the same quarter a year earlier." />
        {written.length ? (
          <p className="mb-3 flex items-center gap-1.5 text-13 text-muted-foreground">
            <SummaryBadge />
            {written.length === 1
              ? ` — one call has a written summary. Open Q${written[0].quarter} ${written[0].year} to read it above the transcript.`
              : ` — ${written.length} calls have a written summary, marked in the list.`}
          </p>
        ) : null}
        <div className="grid">
          {rows.slice(0, showAll ? rows.length : DEFAULT_CALLS).map((r) => (
            <IndexRow key={`${r.year}-${r.quarter}`} a={a} row={r} hasSummary={hasSummary(r)} onOpen={() => onOpen(r)} />
          ))}
        </div>
        <p className="mt-4 text-tiny text-muted-foreground/80">
          {rows.length} call{rows.length === 1 ? '' : 's'} on record, back to {rows.at(-1)?.year}. Opening one fetches its text; the index itself came with the report.
        </p>
      </OCard>
    </div>
  );
}

/* ==========================================================================
   One call
   ========================================================================== */

const BackButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="mb-4 inline-flex items-center gap-1 text-13 font-semibold text-primary hover:underline">
    <span aria-hidden="true">←</span> All earnings calls
  </button>
);

/*
  A written summary, above the transcript it was written from — tinted and
  boxed so it never reads as part of the call. The byline is not decoration: a
  reader who disagrees with a bullet needs to know whose reading it is.
*/
function SummaryCard({ summary }: { summary: any }) {
  return (
    <OCard id="tr-summary">
      <OHead title="Summary" aside={<span className="rounded-md bg-primary/12 px-2 py-[3px] text-micro font-semibold text-primary">Written by {summary.writtenBy || 'the desk'}</span>}
        info="A reading of the call, not a record of it. The transcript underneath is the record — where the two disagree, the transcript is right." />
      <div className="grid gap-4 rounded-[10px] bg-primary/[.05] p-4">
        {summary.headline ? <p className="text-[15px] font-semibold leading-snug">{summary.headline}</p> : null}
        {(summary.sections || []).map((sec: any) => (
          <div key={sec.title}>
            <h4 className="mb-1.5 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{sec.title}</h4>
            <ul className="grid list-disc gap-1 pl-5 text-13 leading-relaxed">{(sec.points || []).map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
          </div>
        ))}
        {summary.conclusion ? (
          <div>
            <h4 className="mb-1.5 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">In short</h4>
            <p className="text-13 leading-relaxed">{summary.conclusion}</p>
          </div>
        ) : null}
        <p className="text-tiny text-muted-foreground/80">
          Read from the transcript below{summary.writtenAt ? ` on ${fmtDate(summary.writtenAt)}` : ''}. Written by hand — this report runs no
          language model at page load — and not graded, ranked or fed into any figure elsewhere in it.
        </p>
      </div>
    </OCard>
  );
}

/** Silence would read as a bug, so a call with no summary says so and points at those that have one. */
function NoSummaryNote({ row, written, onOpen }: { row: CallRow; written: CallRow[]; onOpen: (r: CallRow) => void }) {
  const others = written.filter((w) => !sameCall(w, row));
  return (
    <p className="mb-3 text-13 text-muted-foreground">
      No written summary for this call.
      {others.length ? (
        <>
          {' '}
          {others.slice(0, 3).map((w, i) => (
            <React.Fragment key={`${w.year}-${w.quarter}`}>
              {i ? ', ' : ''}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => onOpen(w)}>Q{w.quarter} {w.year}</button>
            </React.Fragment>
          ))}
          {others.length === 1 ? ' has one.' : ' have one.'}
        </>
      ) : null}
    </p>
  );
}

/** EPS or revenue, quarter by quarter, with the call's own quarter picked out. */
function SeriesCard({ a, row, kind }: { a: Analysis; row: CallRow; kind: 'eps' | 'revenue' }) {
  const cur = curSymbol(a.facts.currency);
  const isEps = kind === 'eps';
  const earnings = earningsOf(a);
  const rows = earnings.filter((r) => r && r.date && isNum(isEps ? r.epsActual : r.revenueActual))
    .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()).slice(-10);
  const title = isEps ? 'Earnings per share' : 'Revenue';
  if (rows.length < 2) {
    return <OCard id={`tr-${kind}`}><OHead title={title} /><Notice>Not enough reported quarters to draw a history.</Notice></OCard>;
  }
  const open = quarterFor(earnings, row.date);
  const base = isEps ? 'var(--chart-4)' : 'var(--chart-1)';
  const label = (r: any) => {
    const d = new Date(r.date);
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1}’${String(d.getUTCFullYear()).slice(2)}`;
  };
  return (
    <OCard id={`tr-${kind}`}>
      <OHead title={title} info="Reported quarters, oldest on the left, with this call’s own quarter picked out in gold. Labelled by the calendar quarter the results were announced in, because the earnings feed carries no fiscal period." />
      <ColumnChart height={200} width={340} legend={false} categories={rows.map(label)}
        valueFmt={isEps ? (v) => `${cur}${dec(v, 2)}` : (v) => money(v, { currency: cur })}
        series={[{ name: title, color: base, colors: rows.map((r) => (open && r.date === open.date ? 'var(--primary)' : base)), values: rows.map((r) => (isEps ? r.epsActual : r.revenueActual)) }]} />
    </OCard>
  );
}

/** The quarter the call is about, in figures. */
function QuarterCard({ a, row }: { a: Analysis; row: CallRow }) {
  const m = callMetrics(earningsOf(a), row.date);
  const cur = curSymbol(a.facts.currency);
  if (!m) return <OCard id="tr-quarter"><OHead title="The quarter" /><Notice>No reported quarter in the earnings feed lines up with this call.</Notice></OCard>;
  const signed = (v: unknown) => (isNum(v) ? pct(v, { sign: true }) : 'n/a');
  return (
    <OCard id="tr-quarter">
      <OHead title="The quarter" info="Matched to the call by report date. Surprise is against the consensus that stood before the release; growth is against the same quarter a year earlier, which is the comparison management makes on the call." />
      <StatLines>
        <StatLine label="Earnings per share" value={isNum(m.eps) ? `${cur}${dec(m.eps, 2)}` : 'n/a'} note="reported" />
        <StatLine label="Expected" value={isNum(m.epsEstimate) ? `${cur}${dec(m.epsEstimate, 2)}` : 'n/a'} note="consensus" />
        <StatLine label="Surprise" value={signed(m.epsSurprise)} tone={signClass(m.epsSurprise)} />
        <StatLine label="Growth on the year" value={signed(m.epsGrowth)} tone={signClass(m.epsGrowth)} />
      </StatLines>
      <StatLines split>
        <StatLine label="Revenue" value={money(m.revenue, { currency: cur })} note="reported" />
        <StatLine label="Expected" value={money(m.revenueEstimate, { currency: cur })} note="consensus" />
        <StatLine label="Surprise" value={signed(m.revenueSurprise)} tone={signClass(m.revenueSurprise)} />
        <StatLine label="Growth on the year" value={signed(m.revenueGrowth)} tone={signClass(m.revenueGrowth)} />
      </StatLines>
    </OCard>
  );
}

function CallView({ a, row, result, summary, rows, written, onBack, onOpen }: {
  a: Analysis; row: CallRow; result: FeedResult | null; summary: any; rows: CallRow[]; written: CallRow[];
  onBack: () => void; onOpen: (r: CallRow) => void;
}) {
  const [showAll, setShowAll] = React.useState(false);
  React.useEffect(() => setShowAll(false), [row]);
  const heading = `Q${row.quarter} ${row.year} — ${fmtDate(row.date)}`;
  const grid = 'grid grid-cols-12 gap-6 max-lg:grid-cols-1';

  if (!result) {
    return (
      <div className={grid}>
        <OCard span={12} id="tr-loading">
          <div><BackButton onClick={onBack} /></div>
          <OHead title={heading} />
          <div className="grid gap-2.5"><Skeleton className="h-3.5" /><Skeleton className="h-3.5 w-[86%]" /><Skeleton className="h-3.5 w-[92%]" /></div>
          <p className="mt-4 text-center text-13 text-muted-foreground">Fetching the transcript…</p>
        </OCard>
      </div>
    );
  }

  const data: any = result.data || null;
  const content: string = data?.content || data?.transcript || '';
  if (result.status !== 'ok' || !content) {
    return (
      <div className={grid}>
        <OCard span={12} id="tr-missing">
          <div><BackButton onClick={onBack} /></div>
          <OHead title={heading} />
          {a.ds.status('transcriptDates') !== 'ok' ? <FeedGate a={a} feed="transcriptDates" what="The transcript" /> : (
            <Notice error={result.status === 'error'}>
              {result.status === 'gated'
                ? <><b>Earnings call transcripts</b> are not available here. The index of calls above is separate, which is why the list loaded and the text did not.</>
                : result.status === 'error'
                  ? `The transcript could not be loaded — ${(result as any).message || 'unknown error'}.`
                  : 'The feed returned no text for this quarter, though it lists the call.'}
            </Notice>
          )}
        </OCard>
      </div>
    );
  }

  const paras = paragraphsOf(content);
  const collapsible = paras.length > DEFAULT_PARAGRAPHS;
  const words = content.split(/\s+/).filter(Boolean).length;
  const others = rows.filter((r) => !sameCall(r, row)).slice(0, 6);

  return (
    // Two real columns rather than loose grid items: a transcript is metres
    // long, and left to the grid every other card would land beneath it.
    <div className={grid}>
      <div className="col-span-8 flex min-w-0 flex-col gap-6 max-lg:col-span-1">
        <div><BackButton onClick={onBack} /></div>
        {summary ? <SummaryCard summary={summary} /> : null}
        <OCard id="tr-call">
          <OHead title={`Q${row.quarter} ${row.year} earnings call`} info="The transcript as published. Speaker names are taken from the front of each paragraph where the transcriber put one there, and the text is otherwise untouched — no highlighting, nothing this report has decided is the important part." />
          <p className="mb-3 text-13 text-muted-foreground">{a.facts.name} · held {fmtDate(row.date)} · {words.toLocaleString('en-US')} words</p>
          {summary ? null : <NoSummaryNote row={row} written={written} onOpen={onOpen} />}
          <div className="grid max-w-[72ch] gap-4">
            {paras.slice(0, showAll || !collapsible ? paras.length : DEFAULT_PARAGRAPHS).map((p, i) => (
              <p key={i} className="text-sm leading-[1.7]">
                {p.speaker ? <b className="mb-0.5 block text-13 font-semibold text-primary">{p.speaker}</b> : null}
                <span>{p.text}</span>
              </p>
            ))}
          </div>
          {collapsible ? (
            <button type="button" className="mt-4 text-13 font-semibold text-primary hover:underline" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Collapse' : `Read the rest — ${paras.length - DEFAULT_PARAGRAPHS} more paragraphs`}
            </button>
          ) : null}
        </OCard>
      </div>
      <div className="col-span-4 flex min-w-0 flex-col gap-6 max-lg:col-span-1">
        <QuarterCard a={a} row={row} />
        <SeriesCard a={a} row={row} kind="eps" />
        <SeriesCard a={a} row={row} kind="revenue" />
        {others.length ? (
          <OCard id="tr-others">
            <OHead title="Other calls" />
            <div className="grid">
              {others.map((r) => (
                <button key={`${r.year}-${r.quarter}`} type="button" onClick={() => onOpen(r)}
                  className="flex items-baseline justify-between gap-3 border-b border-border px-1 py-2.5 text-left last:border-b-0 hover:bg-accent">
                  <span className="text-13 font-semibold">Q{r.quarter} {r.year}</span>
                  <span className="text-tiny text-muted-foreground">{fmtDate(r.date)}</span>
                </button>
              ))}
            </div>
          </OCard>
        ) : null}
      </div>
    </div>
  );
}

/* ==========================================================================
   The tab
   ========================================================================== */

export function TranscriptsTab({ a }: { a: Analysis }) {
  const index = a.transcripts || { available: false, rows: [] };
  const rows: CallRow[] = index.rows || [];
  const [open, setOpen] = React.useState<CallRow | null>(null);
  const [result, setResult] = React.useState<FeedResult | null>(null);
  const [summaries, setSummaries] = React.useState<Record<string, any>>({});
  /** `${year}|${quarter}` -> the fetch result, so a call re-opened is instant. */
  const loaded = React.useRef(new Map<string, FeedResult>());
  /** Which call is on screen, so a slow fetch for one the reader left is dropped. */
  const openKey = React.useRef<string | null>(null);

  // The index draws at once and again when the summaries land: waiting would
  // leave the tab blank for a file that only adds a badge.
  React.useEffect(() => { let live = true; loadSummaries().then((s) => live && setSummaries(s)); return () => { live = false; }; }, []);
  const summaryFor = (r: CallRow) => summaries[`${a.facts.symbol}|${r.year}|${r.quarter}`] || null;
  const written = rows.filter(summaryFor);

  const openCall = React.useCallback((row: CallRow) => {
    const key = `${row.year}|${row.quarter}`;
    openKey.current = key;
    setOpen(row);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    const hit = loaded.current.get(key);
    if (hit) { setResult(hit); return; }
    setResult(null);
    // A snapshot can carry a call of its own, so the shipped example is
    // readable with no key at all. Live keys never reach this branch.
    const bundled = (a.ds as any).snapshotExtras?.transcripts?.[key] || null;
    const pending: Promise<FeedResult> = bundled
      ? Promise.resolve({ status: 'ok', data: bundled, fromSnapshot: true } as unknown as FeedResult)
      : fetchTranscript(a.facts.symbol, row.year, row.quarter);
    pending.then((r) => {
      loaded.current.set(key, r);
      if (openKey.current === key) setResult(r);
    });
  }, [a]);

  const back = () => { openKey.current = null; setOpen(null); setResult(null); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); };

  if (!index.available) {
    return (
      <div className="grid grid-cols-12 gap-6 max-lg:grid-cols-1">
        <OCard span={12} id="tr-none">
          <OHead title="Earnings call transcripts" />
          {a.ds.status('transcriptDates') !== 'ok' ? <FeedGate a={a} feed="transcriptDates" what="Earnings call transcripts" /> : (
            <Notice>No earnings call transcripts are on record for this company. Coverage is thin outside the large caps, and companies that hold no call have none.</Notice>
          )}
          <p className="mt-4 text-tiny text-muted-foreground/80">
            Transcripts are not available for every company, so this can come back empty when every other tab in this report loads.
          </p>
        </OCard>
      </div>
    );
  }

  return open
    ? <CallView a={a} row={open} result={result} summary={summaryFor(open)} rows={rows} written={written} onBack={back} onOpen={openCall} />
    : <IndexView a={a} rows={rows} written={written} onOpen={openCall} />;
}
