'use client';

/* ==========================================================================
   Maz Vantage — the Research tab

   An equity research report, set as a document rather than a dashboard: a
   running head, a strip of ratings across the top, a contents column on
   the left, and long-form sections down the right, each argued in prose and
   supported by numbered exhibits. The shape is Morningstar's Equity Analyst
   Report; the rule for this page is more text, fewer controls.

   **The layout is theirs. The ratings are ours.** The headline is the quant
   rating `gradeAll` already computes; the valuation zone beside it is the only
   place a fair value estimate is used, and no fair value ever feeds a grade.
   The ratings model and the generated prose live in `lib/research-model.ts`;
   this file sets them in type.
   ========================================================================== */

import * as React from 'react';
import { curSymbol, dec, fmtDate, isNum, money, mult, num, pct, price, yearOf } from '@/lib/format';
import { buildPrompt, fetchNarrative } from '@/lib/narrative';
import {
  SAFETY_BANDS, analystNote, bullsBears, capitalProse, fairValueProse, moatProse, researchRatings, riskProse, strategyProse,
} from '@/lib/research-model';
import { getApiKey } from '@/lib/fmp';
import type { Analysis } from '@/lib/model';
import { ColumnChart, LineChart, MultiLineChart, WaterfallChart } from '@/components/charts/charts';
import { ValuationRangeChart } from '@/components/charts/diagrams';
import { usePings } from '@/components/report/pings';
import { scenarioReading } from '@/components/report/scenario-card';
import { buildScenarios } from '@/lib/scenarios';
import { parameterProse, profitDriverProse, profitDrivers, valuationParameters } from '@/lib/research-valuation';
import { FACTOR_TITLES, comparison, quantPeerParas } from '@/lib/research-peers';
import { KIND_LABEL, RELATION_LABEL, VOICES, linkOf, voicesFor, type Voice, type VoiceSection } from '@/lib/research-voices';
import { CONFIDENCE_LABEL, KIND_LABEL as EVENT_KIND, dealMath, eventsFor, type CorpEvent, type EventParty } from '@/lib/events';
import { TRIGGER_LABEL, earningsNote, editionsFor, readingOf, sinceLastEdition } from '@/lib/research-editions';
import { CHANGE_LABEL, riskReviewFor } from '@/lib/risk-factors';
import { discountInputs } from '@/lib/valuation-models';
import { loadDividendScores, type DivResult } from '@/lib/dividend-grades';
import { SHARIAH_STANDARDS, shariahVerdict } from '@/lib/shariah';
import { issuerRecord, screenIssuer } from '@/lib/shariah-issuers';
import { PREFERRED, SCENARIO_NAME } from '@/lib/shariah-v5';
import { useNav } from '@/components/nav-context';
import { BrandMark, Slogan, Wordmark, markDataUri } from '@/components/shell/brand';
import { BRAND_NAME } from '@/lib/brand';
import type { VoiceCall } from '@/lib/management-voice';
import { GradeBar, GradePill } from '@/components/report/grade-parts';
import { toneForLetter } from '@/lib/grading';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  DocTable, Exhibit, NoteHead, Para, Prose, SEG_COLORS, Section, Signed, Small, VoiceQuote, WithVoices,
  staleTitles, titleList, voiceDate, type Narrative, type Ratings,
} from '@/components/report/research/doc';
import { ImpliedSection } from '@/components/report/research/implied-section';
import { DebatesSection } from '@/components/report/research/debates-section';
import { debatesFor } from '@/lib/debates';
import { StreetSection } from '@/components/report/research/street-section';
import { SensitivityBlock } from '@/components/report/research/sensitivity';
import { HistorySection } from '@/components/report/research/history-section';
import { OwnershipSection } from '@/components/report/research/ownership-section';
import { ManagementSection } from '@/components/report/research/management-section';
import { IndustryBlock } from '@/components/report/research/industry-block';
import { marketsFor } from '@/lib/industry';
import { SignpostsSection } from '@/components/report/research/signposts-section';
import { AlphaSection } from '@/components/report/research/alpha-section';

/* ---------- the head of the report ---------------------------------------------- */

function RunningHead({ a }: { a: Analysis }) {
  const f = a.facts;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2 print:hidden">
      <p className="text-micro text-muted-foreground">
        Maz Vantage Equity Research Report | {f.name} ({f.symbol}) | Report as of {fmtDate(a.ds.asOf)} | Reporting currency: {f.currency || 'n/a'} | Exchange: {f.exchange || 'n/a'}
      </p>
      <button type="button" onClick={() => window.print()} className="text-tiny font-semibold text-primary hover:underline no-print"
        aria-label="Print the report or save it as a PDF">
        Print or save as PDF
      </button>
    </div>
  );
}

/*
  The brand on paper. On screen the report sits inside the site's frame,
  which carries the logo; printed, that frame is gone, so the first page
  opens on a masthead (the mark, the name in its own typeface, the slogan)
  and every page's footer carries the mark and the name. The footer lives in
  the page margin, where only CSS reaches, so it is written here from the
  brand module rather than hard-coded in the stylesheet.
*/
function PrintBrand({ a }: { a: Analysis }) {
  const f = a.facts;
  // Written into a stylesheet as raw text: keep the ticker to ticker characters.
  const sym = String(f.symbol || '').replace(/[^A-Za-z0-9.\-]/g, '');
  const footer = `@page {
  @bottom-left {
    content: url("${markDataUri('#131722', 9)}") "  ${BRAND_NAME} · Equity Research Report · ${sym} · Not investment advice";
    font: 7.5pt system-ui, sans-serif;
    color: #6b7280;
    vertical-align: middle;
  }
  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font: 7.5pt system-ui, sans-serif;
    color: #6b7280;
    vertical-align: middle;
  }
}`;
  return (
    <>
      {/* A raw-text element: set as HTML so the quotes in the CSS are not escaped into entities. */}
      <style dangerouslySetInnerHTML={{ __html: footer }} />
      <header className="mb-4 hidden items-end justify-between gap-6 border-b-2 border-foreground pb-3 print:flex">
        <div className="flex items-center gap-3 text-foreground">
          <BrandMark className="h-[30px]" title={BRAND_NAME} />
          <div className="grid gap-1">
            <Wordmark className="text-[24px]" />
            <Slogan className="text-[10.5px] text-muted-foreground" />
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Equity Research Report</p>
          <p className="mt-0.5 text-[12px] font-semibold">{f.name} ({f.symbol})</p>
          <p className="text-[10px] text-muted-foreground">
            Report as of {fmtDate(a.ds.asOf)} · {f.currency || 'n/a'} · {f.exchange || 'n/a'}
          </p>
        </div>
      </header>
    </>
  );
}

/*
  Printing: the report prints on paper-white whatever the screen theme, so
  the theme is switched to light for the print and back afterwards. Ctrl+P
  goes through the same two events as the button.
*/
function usePrintInLight() {
  React.useEffect(() => {
    const html = document.documentElement;
    let was: string | null = null;
    const before = () => {
      was = html.getAttribute('data-theme');
      if (was === 'dark') html.setAttribute('data-theme', 'light');
    };
    const after = () => {
      if (was === 'dark') html.setAttribute('data-theme', 'dark');
      was = null;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
}

function HeadStrip({ a, r }: { a: Analysis; r: Ratings }) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const q = r.quant;
  const cells: [string, React.ReactNode, string?][] = [
    ['Last Price', price(f.price, cur), fmtDate(f.quoteTime || a.ds.asOf)],
    ['Fair Value Estimate', isNum(r.fve.value) ? price(r.fve.value, cur) : 'n/a', r.fve.count ? `median of ${r.fve.count} models` : 'not modelled'],
    ['Price/FVE', isNum(r.zone.ratio) ? dec(r.zone.ratio, 2) : 'n/a', r.zone.label || ''],
    ['Market Cap', money(f.marketCap, { currency: cur })],
    ['Economic Moat', r.moat.label, r.moat.key ? `${r.moat.positive} of ${r.moat.years} years` : ''],
    ['Equity Style', r.style.label],
    ['Uncertainty', r.unc.label],
    ['Capital Allocation', r.capital.label],
  ];
  return (
    <>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-[26px] font-bold tracking-[-.02em]">
          {f.name} <span className="font-normal text-muted-foreground">{f.symbol}</span>
        </h1>
        <p className="text-13">
          <span className="text-muted-foreground">Maz Vantage Quant Rating </span>
          <b>{isNum(q.score) ? `${q.verdict} · ${q.letter} · ${dec(q.score, 2)} of ${q.max}` : 'Not rated'}</b>
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 border-y border-foreground/80 @xl:grid-cols-4 @4xl:grid-cols-8">
        {cells.map(([k, v, note]) => (
          <div key={k} className="border-b border-border px-1 py-2.5 @4xl:border-b-0">
            <dt className="text-micro text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 text-[15px] font-bold tnum">{v}</dd>
            {note ? <dd className="text-micro text-muted-foreground">{note}</dd> : null}
          </div>
        ))}
      </dl>
    </>
  );
}

/** Calendar-year price return; each year opens on the previous year's close. */
function yearlyReturns(pts: any[]) {
  if (pts.length < 2) return [];
  const byYear = new Map<number, { year: number; first: number; last: number }>();
  for (const p of pts) {
    const y = yearOf(p.date);
    if (!isNum(y)) continue;
    if (!byYear.has(y)) byYear.set(y, { year: y, first: p.price, last: p.price });
    else byYear.get(y)!.last = p.price;
  }
  const rows = [...byYear.values()].sort((x, y) => x.year - y.year);
  return rows.map((row, i) => {
    const open = i > 0 ? rows[i - 1].last : row.first;
    return { year: row.year, ret: open > 0 ? row.last / open - 1 : null };
  }).slice(-6);
}

/*
  One fair value estimate, today's, drawn across the whole window. The source
  reports carry the estimate as it stood each year; this report has no
  archive of past estimates and does not invent one.
*/
function PriceVsFairValue({ a, r }: { a: Analysis; r: Ratings }) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const pts: any[] = a.momentum?.points || [];
  const years = yearlyReturns(pts);
  // Insider trades and fund position changes on the line (restored 2026-10-18;
  // the document rebuild of 11 Oct had dropped them).
  const pings = usePings(a);
  return (
    <div className="mt-5">
      <p className="mb-1 text-13 font-semibold">Price vs. Fair Value</p>
      {pts.length > 1 ? (
        <LineChart height={240} series={pts.map((p) => ({ date: p.date, value: p.price }))} valueFmt={(v) => price(v, cur)}
          labelFmt={(d) => fmtDate(d, { month: 'short', year: '2-digit' })} markers={pings.markers}
          refLine={isNum(r.fve.value) ? { value: r.fve.value, label: `Fair value ${price(r.fve.value, cur)}` } : null} />
      ) : <Small>No price history was loaded.</Small>}
      <div className="no-print">{pings.legend}</div>
      {years.length ? (
        <div className="mt-2">
          <DocTable first="" head={years.map((y) => String(y.year))} rows={[
            ['Total Return %', ...years.map((y) => <Signed key={y.year} v={y.ret} />)],
          ]} />
          <Small className="mt-1.5">
            Price return by calendar year, dividends excluded; the current year is year to date. The fair value line is today’s estimate
            drawn across the window: there is no archive of past estimates, and the report does not invent one.
          </Small>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- the left column ----------------------------------------------------- */

const CONTENTS: [string, string][] = [
  ['rsr-note', 'Analyst Note'], ['rsr-dev', 'Recent Developments'], ['rsr-implied', 'What the Price Implies'], ['rsr-debates', 'Key Debates'], ['rsr-alpha', 'Alpha Signal'], ['rsr-strategy', 'Business Strategy & Outlook'], ['rsr-bullbear', 'Bulls Say / Bears Say'], ['rsr-street', 'Street View'], ['rsr-owners', 'Ownership and Positioning'], ['rsr-quant', 'Quant Rating and Peers'],
  ['rsr-moat', 'Economic Moat'], ['rsr-fv', 'Fair Value and Profit Drivers'], ['rsr-history', 'Valuation History'], ['rsr-risk', 'Risk and Uncertainty'],
  ['rsr-mgmt', 'Management’s Record'], ['rsr-capital', 'Capital Allocation'], ['rsr-div', 'Dividend'], ['rsr-shariah', 'Shariah Compliance'], ['rsr-signposts', 'Our Record and Signposts'], ['rsr-fin', 'Financials'],
  ['rsr-method', 'Research Methodology'],
];

function Sidebar({ a, nar }: { a: Analysis; nar: Narrative }) {
  const f = a.facts;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <aside className="text-13 @3xl:sticky @3xl:top-20 @3xl:self-start">
      <p className="border-t border-foreground/80 pt-2 text-13 font-bold no-print">Contents</p>
      <ol className="mt-1.5 grid gap-1 no-print">
        {CONTENTS.filter(([id]) => (id !== 'rsr-dev' || eventsFor(f.symbol).length) && (id !== 'rsr-debates' || debatesFor(f.symbol).length) && (id !== 'rsr-div' || paysDividend(a))).map(([id, label]) => (
          <li key={id}>
            <button type="button" onClick={() => go(id)} className="text-left hover:text-primary hover:underline">{label}</button>
          </li>
        ))}
      </ol>
      <KeyStats a={a} />
      <p className="mt-5 border-t border-foreground/80 pt-2 font-bold">Sector · Industry</p>
      <p className="mt-1">{f.sector || 'n/a'} · {f.industry || 'n/a'}</p>
      <p className="mt-5 border-t border-foreground/80 pt-2 font-bold">Business Description</p>
      <p className="mt-1 leading-relaxed text-foreground/85">{f.description || 'No business description was returned for this company.'}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-tiny">
        {([
          ['Employees', isNum(f.employees) ? num(f.employees, 0) : 'n/a'],
          ['Country', f.country || 'n/a'],
          ['Chief executive', f.ceo || 'n/a'],
          ['Listed', f.ipoDate ? fmtDate(f.ipoDate) : 'n/a'],
        ] as [string, string][]).map(([k, v]) => (
          <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></React.Fragment>
        ))}
      </dl>
      <Small className="mt-5 border-t border-border pt-2">
        {nar
          ? `The prose in this report was written by ${nar.model} from a brief of pre-computed figures and was not reviewed by a person before publication.${staleTitles(nar).length ? ` ${titleList(staleTitles(nar))} ${staleTitles(nar).length === 1 ? 'was' : 'were'} written against figures that have since moved, so ${staleTitles(nar).length === 1 ? 'it shows' : 'they show'} the generated form.` : ''} Where prose and tables disagree, the tables are right.`
          : 'The prose in this report is assembled from the figures shown in it. No analyst opinion is expressed.'}
        {' '}This is not investment advice.
      </Small>
    </aside>
  );
}

/* ---------- the sections -------------------------------------------------------- */

function AnalystNote({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  const gen = analystNote(a, r);
  const n = nar?.sections?.note;
  const bullets: string[] = (n?.why?.length ? n.why : gen.bullets) || [];
  return (
    <Section id="rsr-note" title="Analyst Note" a={a} nar={nar}>
      <h3 className="mb-3 text-[20px] font-bold leading-snug tracking-[-.01em]">{n?.headline || gen.headline}</h3>
      {bullets.length ? (
        <>
          <p className="mb-1.5 text-[14.5px] font-semibold">Why it matters:</p>
          <WithVoices items={bullets.map((b, i) => ({ key: i, node: <Para key={i}>{b}</Para> }))}
            voices={voicesFor(a.facts.symbol, 'note')} anchored={!!n?.why?.length} />
        </>
      ) : null}
      <p className="mt-1 text-[14.5px] leading-[1.75]"><b>The bottom line: </b>{n?.bottomLine || gen.bottom}</p>
      <SinceLastEdition a={a} r={r} />
      <EarningsNoteBlock a={a} />
      <EditionHistory a={a} />
    </Section>
  );
}

/* ---------- editions ------------------------------------------------------------ */

/** What moved since the last edition, with the reason: written for a recorded edition, built from the figures when today has moved past it. */
function SinceLastEdition({ a, r }: { a: Analysis; r: Ratings }) {
  const s = React.useMemo(() => sinceLastEdition(a.facts.symbol, readingOf(a, r), a.facts.currency), [a, r]);
  if (!s) return null;
  if (!s.rows.length) {
    return (
      <>
        <NoteHead>Editions</NoteHead>
        <Para>This is the first edition of this report, written {fmtDate(s.base.date)}. Later editions will say here what moved and why.</Para>
      </>
    );
  }
  const title = s.against === 'today'
    ? `What has moved since the ${fmtDate(s.base.date)} edition`
    : `What changed in this edition, ${fmtDate(s.current!.date)}, against ${fmtDate(s.base.date)}`;
  return (
    <>
      <NoteHead>{title}</NoteHead>
      {s.prose.map((p, i) => <Para key={i}>{p}</Para>)}
      <DocTable first="Reading" head={[fmtDate(s.base.date), s.against === 'today' ? 'Today' : fmtDate(s.current!.date)]}
        rows={s.rows.map((c) => [
          c.moved ? <b key="l">{c.label}</b> : c.label,
          <span key="f" className={c.moved ? 'text-muted-foreground line-through decoration-muted-foreground/50' : ''}>{c.from}</span>,
          c.moved ? <b key="t">{c.to}</b> : c.to,
        ])} />
      {s.against === 'today' ? (
        <Small className="mt-1.5">Today’s figures have moved past the last recorded edition; the reasons above are built from the figures, and a new edition records them with ours.</Small>
      ) : null}
    </>
  );
}

let savedCalls: Promise<VoiceCall[]> | null = null;
const loadSavedCalls = () => (savedCalls ||= fetch('/data/management-voice.json')
  .then((res) => (res.ok ? res.json() : { calls: [] }))
  .then((f): VoiceCall[] => (Array.isArray(f?.calls) ? f.calls : []))
  .catch(() => []));

/** The dated note on the latest quarter: results against consensus, the call in management's words, the estimate across it. */
function EarningsNoteBlock({ a }: { a: Analysis }) {
  const [calls, setCalls] = React.useState<VoiceCall[] | null>(null);
  React.useEffect(() => {
    let live = true;
    loadSavedCalls().then((c) => { if (live) setCalls(c); });
    return () => { live = false; };
  }, []);
  const note = React.useMemo(() => (calls ? earningsNote(a, calls) : null), [a, calls]);
  if (!note) return null;
  return (
    <>
      <NoteHead>Earnings note, {fmtDate(note.date)}</NoteHead>
      {note.paras.map((p, i) => <Para key={i}>{p}</Para>)}
      {note.outlook.length ? (
        <>
          <p className="mb-1.5 text-[14.5px] font-semibold">Looking ahead, in management’s words:</p>
          {note.outlook.map((o, i) => (
            <blockquote key={i} className="my-3 ml-1 border-l-[3px] border-muted-foreground/40 py-0.5 pl-4">
              <p className="font-serif text-[15.5px] italic leading-[1.6] text-foreground">“{o.text}”</p>
              <p className="mt-1 text-tiny text-muted-foreground">— <span className="font-semibold text-foreground">{o.speaker}</span>, on the call</p>
            </blockquote>
          ))}
        </>
      ) : null}
      <Small className="mt-1.5">The call is read by the same rule-based reader as the Alpha Signal tab; quotes are cut at 25 words and the transcript is not stored. Not scored.</Small>
    </>
  );
}

/** Every edition on record, newest first: the report's own past, as a Morningstar report lists its earlier notes. */
function EditionHistory({ a }: { a: Analysis }) {
  const eds = editionsFor(a.facts.symbol);
  const cur = curSymbol(a.facts.currency);
  if (eds.length < 2) return null;
  return (
    <>
      <p className="mb-1.5 mt-5 text-[14.5px] font-semibold">Editions on record</p>
      <DocTable first="Edition" head={['Why', 'Quant rating', 'Fair value', 'Price', 'Zone']}
        rows={eds.map((e) => [
          <span key="d" className="block min-w-[14rem] whitespace-normal">
            <b>{fmtDate(e.date)}</b>
            <span className="block text-tiny text-muted-foreground">{e.headline}</span>
          </span>,
          e.triggers.map((t) => TRIGGER_LABEL[t]).join(', '),
          `${e.quant.verdict} · ${e.quant.letter} · ${isNum(e.quant.score) ? dec(e.quant.score, 2) : 'n/a'}`,
          isNum(e.fairValue) ? price(e.fairValue, cur) : 'n/a',
          isNum(e.price) ? price(e.price, cur) : 'n/a',
          e.zone || 'n/a',
        ])} />
    </>
  );
}

/* ---------- recent developments ------------------------------------------------ */

const ROLE_TITLE: Record<string, string> = {
  maker: 'the maker', customer: 'the customer', 'design partner': 'the design partner', 'co-developer': 'a co-developer',
  competitor: 'a competitor', supplier: 'the supplier', partner: 'a partner', acquirer: 'the acquirer', target: 'the target',
};

const STAGE_LABEL: Record<string, string> = {
  reported: 'Reported', agreed: 'Agreed', filed: 'Filed', regulatory: 'Regulators', vote: 'Shareholder vote', closed: 'Closed', terminated: 'Terminated',
};

const usd = (v: number) => (v >= 1e12 ? `US$${dec(v / 1e12, 2)}t` : v >= 1e9 ? `US$${dec(v / 1e9, 2)}b` : `US$${dec(v / 1e6, 1)}m`);

/*
  A deal's terms beside the figures derived from them, its stages as a dated
  timeline, and what it does to the Shariah screen. The terms are the
  parties'; premium, today's value, spread and size are ours (`dealMath`),
  from prices captured on the date shown.
*/
function DealBlock({ e }: { e: CorpEvent }) {
  const d = e.deal!;
  const m = dealMath(d);
  const src = (i: number) => e.sources[i];
  const rows: React.ReactNode[][] = [
    ['Payment', d.consideration === 'undisclosed' ? 'Not stated' : `${d.consideration[0].toUpperCase()}${d.consideration.slice(1)}${d.exchangeRatio ? `, ${d.exchangeRatio} acquirer share per target share` : ''}`],
    ['Stated value', `${usd(d.value)} (${d.valueBasis})`],
  ];
  if (d.perShare) rows.push(['Per target share, as announced', price(d.perShare, 'US$')]);
  if (isNum(m.premium) && d.unaffected) rows.push(['Premium (ours)', <span key="p">{pct(m.premium, { dp: 1 })} over the {price(d.unaffected.price, 'US$')} close of {fmtDate(d.unaffected.date)}, the last before the news</span>]);
  if (isNum(m.offerNow) && d.latest) rows.push(['Offer value today (ours)', <span key="o">{price(m.offerNow, 'US$')} a share at the acquirer’s {price(d.latest.acquirer!, 'US$')} on {fmtDate(d.latest.date)}{isNum(m.valueNow) ? `; ${usd(m.valueNow)} in all` : ''}</span>]);
  if (isNum(m.spread) && d.latest) rows.push(['Spread (ours)', <span key="s">{pct(m.spread, { dp: 1, sign: true })} against the target’s {price(d.latest.target!, 'US$')}{isNum(m.spreadAnnual) ? `; ${pct(m.spreadAnnual, { dp: 1 })} a year if it closes by ${fmtDate(d.expectedBy)}` : ''}</span>]);
  if (isNum(m.materiality) && d.acquirerMarketCap) rows.push(['Size against the acquirer (ours)', <span key="z">{pct(m.materiality, { dp: 2 })} of its {usd(d.acquirerMarketCap.value)} market value on {fmtDate(d.acquirerMarketCap.date)}</span>]);
  if (d.breakFee) rows.push(['Termination fee', `${usd(d.breakFee.amount)}, ${d.breakFee.note}`]);
  rows.push(['Expected close', `${d.expectedLabel}${d.outsideDate ? `; outside date ${fmtDate(d.outsideDate)}` : ''}`]);
  rows.push(['Approvals needed', d.approvals.join('; ')]);
  return (
    <>
      <Exhibit title="The deal, and what we derive from it" source={`the parties’ filings and releases; figures marked “ours” are Maz Vantage arithmetic on market prices${d.latest ? ` captured ${fmtDate(d.latest.date)}` : ''}.`}>
        <DocTable first="Term" head={['Detail']} rows={rows.map(([k, v]) => [<span key="k" className="font-semibold">{k}</span>, <span key="v" className="whitespace-normal">{v}</span>])} />
      </Exhibit>
      <p className="mb-1.5 text-[14.5px] font-semibold">Where the deal stands{m.stage ? `: ${STAGE_LABEL[m.stage].toLowerCase()}` : ''}</p>
      <ol className="mb-4 grid gap-1 text-13 leading-relaxed">
        {d.steps.map((s, i) => (
          <li key={i} className={cn('grid grid-cols-[96px_118px_minmax(0,1fr)] gap-2', !s.done && 'text-muted-foreground')}>
            <span className="tnum">{s.done ? fmtDate(s.date) : `by ${fmtDate(s.date)}`}</span>
            <span className="font-semibold">{s.done ? '✓' : '○'} {STAGE_LABEL[s.stage]}</span>
            <span>{s.what} <span className="text-tiny text-muted-foreground">({src(s.source).publisher})</span></span>
          </li>
        ))}
      </ol>
      <Para><b>Shariah, pro forma.</b> {d.shariah}</Para>
    </>
  );
}

/** A party named with its role, linked to its own report where it has a US listing. */
function PartyName({ p }: { p: EventParty }) {
  return p.symbol
    ? <a href={`/stock/${p.symbol}/research`} className="underline decoration-border underline-offset-2 hover:text-primary">{p.name}</a>
    : <>{p.name}</>;
}

/*
  One event, from this company's side: what happened, what it means here,
  the facts with their sources, the vendors' claims kept apart, and every
  other company it touches. The record is in `lib/events.ts`.
*/
function EventEntry({ event: e, party }: { event: CorpEvent; party: EventParty }) {
  const others = e.parties.filter((p) => p !== party);
  const src = (i: number) => e.sources[i];
  const SrcLink = ({ i }: { i: number }) => (
    <a href={src(i).url} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">{src(i).publisher}</a>
  );
  return (
    <article className="mt-5 first:mt-0">
      <p className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">
        {fmtDate(e.date)} · {EVENT_KIND[e.kind]} · <span className={e.confidence === 'confirmed' ? 'text-up' : 'text-grade-mid'}>{CONFIDENCE_LABEL[e.confidence]}</span>
      </p>
      <h3 className="mb-2.5 mt-1 text-[18px] font-bold leading-snug tracking-[-.01em]">{e.title}</h3>
      <Para>{e.summary}</Para>
      <Para><b>What it means for {party.name}, as {ROLE_TITLE[party.role] || party.role}.</b> {party.why}</Para>
      {e.deal ? <DealBlock e={e} /> : null}
      {e.quotes?.map((q, i) => (
        <VoiceQuote key={i} v={{
          symbol: '', section: 'note', after: 0, relation: 'adds',
          kind: src(q.source).kind === 'press' ? 'press' : q.org === party.name ? 'management' : party.role === 'competitor' ? 'competitor' : 'company',
          quote: q.text, speaker: q.speaker, role: q.role, source: src(q.source).title, date: src(q.source).date, url: src(q.source).url,
          note: src(q.source).kind === 'press' ? 'Independent reporting.' : `From ${src(q.source).publisher}’s own announcement${q.org && q.org !== src(q.source).publisher ? `, quoting ${q.org}` : ''}.`,
        }} />
      ))}
      <Exhibit title="The facts, and where each comes from" source="the companies’ own announcements, read in full; Maz Vantage.">
        <DocTable first="Fact" head={['Source']} rows={e.facts.map((f) => [
          <span key="f"><span className="font-semibold">{f.label}.</span> {f.value}</span>, <SrcLink key="s" i={f.source} />,
        ])} />
      </Exhibit>
      {e.claims?.length ? (
        <>
          <p className="mb-1.5 text-[14.5px] font-semibold">Claims made by the companies, not tested here</p>
          <ul className="mb-4 grid list-disc gap-2 pl-5 text-[14.5px] leading-[1.7]">
            {e.claims.map((c, i) => (
              <li key={i}>{c.claim} <span className="text-tiny text-muted-foreground">{c.by}: {c.basis} (<SrcLink i={c.source} />)</span></li>
            ))}
          </ul>
        </>
      ) : null}
      {others.length ? (
        <p className="mb-3 text-13 leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Also affects: </span>
          {others.map((p, i) => <React.Fragment key={p.name}>{i ? '; ' : ''}<PartyName p={p} /> ({p.role})</React.Fragment>)}.
        </p>
      ) : null}
      <p className="text-tiny leading-relaxed text-muted-foreground">
        Sources:{' '}
        {e.sources.map((x, i) => (
          <React.Fragment key={x.url}>
            {i ? ' · ' : ''}
            <a href={x.url} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">{x.publisher}, {x.title}</a>
            {` (${x.kind === 'primary' ? 'company' : 'press'}, ${fmtDate(x.date)})`}
          </React.Fragment>
        ))}
      </p>
    </article>
  );
}

function RecentDevelopments({ a, nar }: { a: Analysis; nar: Narrative }) {
  const list = eventsFor(a.facts.symbol);
  if (!list.length) return null;
  return (
    <Section id="rsr-dev" title="Recent Developments" a={a} nar={nar} signed={false}>
      <p className="mb-4 text-13 leading-relaxed text-muted-foreground">
        Events that touch {a.facts.name}, each followed to the companies’ own announcements and written from {a.facts.symbol}’s side.
        Facts carry their source; the companies’ performance claims are kept apart and are not tested here.
      </p>
      {list.map(({ event, party }) => <EventEntry key={event.id} event={event} party={party} />)}
    </Section>
  );
}

function Strategy({ a, r, nar, ex, industryEx }: { a: Analysis; r: Ratings; nar: Narrative; ex: number; industryEx: number }) {
  const seg = a.segments?.product;
  const cur = curSymbol(a.facts.currency);
  return (
    <Section id="rsr-strategy" title="Business Strategy & Outlook" a={a} nar={nar}>
      <Prose a={a} nar={nar} k="strategy" fallback={strategyProse(a, r)} />
      {seg?.available && seg.rows.length > 1 ? (
        <Exhibit n={ex} title="Revenue by product line" source="company filings, segment disclosure as reported; Maz Vantage.">
          <ColumnChart height={240} stacked categories={seg.rows.map((x: any) => x.year)}
            series={seg.names.map((nm: string, i: number) => ({ name: nm, color: SEG_COLORS[i % SEG_COLORS.length], values: seg.rows.map((x: any) => x.values[nm]) }))}
            valueFmt={(v) => money(v, { currency: cur })} />
        </Exhibit>
      ) : null}
      <IndustryBlock symbol={a.facts.symbol} ex={industryEx} />
    </Section>
  );
}

function BullsBears({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  const gen = React.useMemo(() => bullsBears(a, r), [a, r]);
  const bulls: string[] = nar?.sections?.bulls?.length ? nar.sections.bulls : gen.bulls;
  const bears: string[] = nar?.sections?.bears?.length ? nar.sections.bears : gen.bears;
  const list = (title: string, items: string[], empty: string) => (
    <>
      <p className="mb-1.5 mt-1 text-[14.5px] font-semibold">{title}</p>
      {items.length
        ? <ul className="mb-4 grid list-disc gap-2 pl-5 text-[14.5px] leading-[1.7]">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
        : <Small className="mb-4">{empty}</Small>}
    </>
  );
  return (
    <Section id="rsr-bullbear" title="Bulls Say / Bears Say" a={a} nar={nar}>
      {list('Bulls Say', bulls, 'No ratio grades far enough above its sector median to list.')}
      {list('Bears Say', bears, 'No ratio grades far enough below its sector median to list.')}
    </Section>
  );
}

function Moat({ a, r, nar, ex }: { a: Analysis; r: Ratings; nar: Narrative; ex: number }) {
  const rows = (a.series?.rows || []).filter((x: any) => isNum(x.roic));
  const pts = (k: string) => rows.map((x: any) => ({ date: String(x.year), value: x[k] }));
  return (
    <Section id="rsr-moat" title="Economic Moat" a={a} nar={nar}>
      <Prose a={a} nar={nar} k="moat" fallback={moatProse(a, r)} />
      {rows.length > 1 ? (
        <Exhibit n={ex} title="Return on invested capital against the cost of capital"
          source="company filings; Maz Vantage. The cost of equity uses today’s beta and rates for every year.">
          <MultiLineChart height={230} labelFmt={(d) => d} valueFmt={(v) => pct(v)} series={[
            { name: 'ROIC', color: 'var(--primary)', points: pts('roic') },
            { name: 'WACC', color: 'var(--down)', points: pts('wacc') },
          ]} />
          <Small className="mt-1">
            ROIC in blue, WACC in red. {r.moat.key ? `${r.moat.positive} of the ${r.moat.years} filed years earned more on capital than that capital cost.` : ''}
          </Small>
        </Exhibit>
      ) : null}
    </Section>
  );
}

function FairValue({ a, r, nar, ex }: { a: Analysis; r: Ratings; nar: Narrative; ex: number }) {
  const cur = curSymbol(a.facts.currency);
  const hist: any[] = (a.series?.rows || []).slice(-6);
  const fc: any[] = (a.forecast?.rows || []).filter((x: any) => isNum(x.year) && x.year > (hist.at(-1)?.year ?? 0)).slice(0, 3);
  const cats = [...hist.map((x) => x.year), ...fc.map((x) => `${x.year}E`)];
  const drv = React.useMemo(() => profitDrivers(a), [a]);
  const drvParas = React.useMemo(() => profitDriverProse(a, drv), [a, drv]);
  const params = React.useMemo(() => valuationParameters(a, r.fve), [a, r]);
  const paramParas = parameterProse(a, params, r.fve);
  const m = (v: number) => money(v, { currency: cur });
  const Sub = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 mt-6 text-[15px] font-bold">{children}</h3>;
  return (
    <Section id="rsr-fv" title="Fair Value and Profit Drivers" a={a} nar={nar}>
      <Prose a={a} nar={nar} k="fairValue" fallback={fairValueProse(a, r)} />

      {drv.available ? (
        <>
          <Sub>Profit drivers, FY{drv.from} to FY{drv.to}</Sub>
          {drvParas.map((p, i) => <Para key={i}>{p}</Para>)}
          <Exhibit n={ex} title={`Operating profit, FY${drv.from} to FY${drv.to}: growth against margin`}
            source="company filings; Maz Vantage. Growth is the revenue added at the starting margin; margin is the change in margin on the latest revenue.">
            <WaterfallChart height={240} valueFmt={m} steps={[
              { label: `FY${drv.from}`, value: drv.opIncome[0], kind: 'total' },
              { label: 'Growth', value: drv.volume, kind: 'delta' },
              { label: 'Margin', value: drv.marginEffect, kind: 'delta' },
              { label: `FY${drv.to}`, value: drv.opIncome[1], kind: 'total' },
            ]} />
          </Exhibit>
          {drv.segments.length ? (
            <Exhibit n={ex + 1} title="Where the revenue came from" source="company filings, segment disclosure as reported; Maz Vantage.">
              <DocTable first="Segment" head={[`FY${drv.from}`, `FY${drv.to}`, 'Added', `Share FY${drv.from}`, `Share FY${drv.to}`]}
                rows={drv.segments.map((sg) => [
                  sg.name,
                  isNum(sg.from) ? m(sg.from) : 'n/a',
                  isNum(sg.to) ? m(sg.to) : 'n/a',
                  isNum(sg.added) ? m(sg.added) : 'n/a',
                  isNum(sg.shareFrom) ? pct(sg.shareFrom, { dp: 0 }) : 'n/a',
                  isNum(sg.shareTo) ? pct(sg.shareTo, { dp: 0 }) : 'n/a',
                ])} />
            </Exhibit>
          ) : null}
        </>
      ) : null}

      <Sub>The fair value, and what it is built on</Sub>
      {hist.length > 1 ? (
        <Exhibit n={ex + 2} title="Revenue, filed and consensus" source="company filings; consensus estimates as published; Maz Vantage.">
          <ColumnChart height={230} categories={cats} forecastFrom={fc.length ? hist.length : null}
            series={[{ name: 'Revenue', color: 'var(--chart-1)', values: [...hist.map((x) => x.revenue), ...fc.map((x) => x.revenue)] }]}
            valueFmt={m} legend={false} />
        </Exhibit>
      ) : null}
      {paramParas.map((p, i) => <Para key={i}>{p}</Para>)}
      <DiscountInputs a={a} params={params} />
      {params.rows.length ? (
        <Exhibit n={ex + 3} title={`The ${r.fve.count} models in the ${price(r.fve.value, cur)} estimate, and their key input`}
          source="Maz Vantage valuation models on consensus estimates; the estimate is their median and never reaches the quant rating.">
          <DocTable first="Model" head={['Value', 'Key input', 'Terminal share']} rows={params.rows.map((x) => [
            x.label,
            price(x.value, cur),
            <span key="k" className="whitespace-normal text-left text-muted-foreground">{x.key}</span>,
            isNum(x.terminalShare) ? pct(x.terminalShare, { dp: 0 }) : '—',
          ])} />
        </Exhibit>
      ) : null}
      {r.fve.setAside?.length ? (
        <>
          <p className="mb-1.5 text-[14.5px] font-semibold">Set aside, and why</p>
          <ul className="mb-4 grid list-disc gap-2 pl-5 text-[14.5px] leading-[1.7]">
            {r.fve.setAside.map((x: any) => (
              <li key={x.id}><b>{x.full || x.label}</b> ({price(x.value, cur)}): {x.why}</li>
            ))}
          </ul>
        </>
      ) : null}
      {r.fve.models.length ? (
        <Exhibit n={ex + 4} title={`The ${r.fve.count} models against the price`}
          source="Maz Vantage valuation models on consensus estimates.">
          <ValuationRangeChart currency={cur} current={a.facts.price}
            rows={r.fve.models.map((x: any) => ({ label: x.label, full: x.full, value: x.value }))} />
        </Exhibit>
      ) : null}
      <Cases a={a} />
      <SensitivityBlock a={a} ex={ex + 5} />
    </Section>
  );
}

/*
  Bull and bear cases: the six DCFs rerun at the lowest and the highest
  revenue any analyst publishes, margins held at consensus. The Fair Value
  section's paragraph form of the scenario card, which stays the model.
*/
function Cases({ a }: { a: Analysis }) {
  const s = React.useMemo(() => buildScenarios(a), [a]);
  const cur = curSymbol(a.facts.currency);
  const px = isNum(a.facts.price) ? a.facts.price : null;
  if (!s.available || !s.cases) return null;
  const line = scenarioReading(s.cases, px, cur);
  const target = { bear: s.targets.low, base: s.targets.consensus, bull: s.targets.high } as const;
  return (
    <>
      <p className="mb-1.5 mt-5 text-[14.5px] font-semibold">Bull case and bear case</p>
      <Para>
        The estimate above runs every model on the consensus revenue path. Rerunning the six discounted cash flows on the lowest and the
        highest revenue any analyst publishes, with margins held at consensus, gives the range of values the published forecasts support.
        {line ? ` ${line}` : ''}
      </Para>
      <DocTable first="Case" head={['Revenue path', 'Growth a year', 'Fair value', 'vs price', 'Street target']}
        rows={(['bear', 'base', 'bull'] as const).map((k) => {
          const c = s.cases![k];
          return [
            k === 'bear' ? 'Bear: lowest published revenue' : k === 'bull' ? 'Bull: highest published revenue' : 'Consensus',
            `FY${c.fromYear ?? '—'} ${money(c.revenueFrom)} → FY${c.toYear ?? '—'} ${money(c.revenueTo)}`,
            isNum(c.growth) ? pct(c.growth) : 'n/a',
            isNum(c.value) ? price(c.value, cur) : 'n/a',
            <Signed key="u" v={c.upside} />,
            isNum(target[k]) ? price(target[k], cur) : 'n/a',
          ];
        })} />
      <Small className="mt-1.5">A range of published outcomes, not anyone’s forecast. Like every fair value here, none of it reaches the quant rating.</Small>
    </>
  );
}

/* ---------- key statistics ------------------------------------------------------ */

/** The figures a broker report prints on its first page, beside the contents. */
function KeyStats({ a }: { a: Analysis }) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const rows: [string, string][] = [
    ['Last price', isNum(f.price) ? price(f.price, cur) : 'n/a'],
    ['Market cap', isNum(f.marketCap) ? money(f.marketCap, { currency: cur }) : 'n/a'],
    ['52-week range', isNum(f.yearLow) && isNum(f.yearHigh) ? `${price(f.yearLow, cur)} – ${price(f.yearHigh, cur)}` : 'n/a'],
    ['P/E, trailing', isNum(f.pe) && f.pe > 0 ? mult(f.pe) : 'n/a'],
    ['P/E, forward', isNum(a.val?.peFwd) && a.val.peFwd > 0 ? mult(a.val.peFwd) : 'n/a'],
    ['Dividend yield', isNum(f.dividendYield) && f.dividendYield > 0 ? pct(f.dividendYield) : 'None'],
    ['Beta', isNum(f.beta) ? dec(f.beta, 2) : 'n/a'],
    ['Next earnings', a.quarter?.next ? fmtDate(a.quarter.next) : 'n/a'],
  ];
  return (
    <>
      <p className="mt-5 border-t border-foreground/80 pt-2 font-bold">Key Statistics</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-tiny tnum">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></React.Fragment>
        ))}
      </dl>
    </>
  );
}

/* ---------- the valuation inputs --------------------------------------------------- */

/** Every input the discounted cash flows share, with where it comes from: what a broker report's valuation table prints. */
function DiscountInputs({ a, params }: { a: Analysis; params: ReturnType<typeof valuationParameters> }) {
  const d = React.useMemo(() => discountInputs(a), [a]);
  if (!d) return null;
  // The exit multiples, as the models' own key inputs state them: "16.9x EV/EBITDA on 2030 EBITDA, the Technology median".
  const exits = [...new Set(params.rows.filter((x) => x.family === 'dcf')
    .map((x) => x.key.match(/^([\d.]+x EV\/\w+)/)?.[1]).filter(Boolean) as string[])];
  const fc = (a.forecast?.rows || []).filter((x: any) => isNum(x.revenue) && (!isNum(a.forecast?.base?.year) || x.year >= a.forecast.base.year));
  const rows: [string, string, string][] = [
    ['Risk-free rate', isNum(d.riskFree) ? pct(d.riskFree) : 'n/a', 'The 10-year Treasury yield, a benchmark rate'],
    ['Equity risk premium', isNum(d.equityRiskPremium) ? pct(d.equityRiskPremium) : 'n/a', 'What equities are assumed to earn over the risk-free rate'],
    ['Beta', isNum(d.beta) ? dec(d.beta, 2) : 'n/a', 'The share’s sensitivity to the market, as published'],
    ['Cost of equity', pct(d.ke), 'Risk-free rate plus beta times the premium (CAPM)'],
    ['Cost of debt, before tax', pct(d.kd), d.kdFallback ? 'No interest expense is reported, so the risk-free rate plus 1%' : 'Interest expense over total debt'],
    ['Tax rate', pct(d.tax), 'The effective rate, held between 0% and 50%'],
    ['Debt weight', pct(d.weightD), 'Total debt over debt plus market value of equity'],
    ['Discount rate (WACC)', pct(d.wacc), 'The weighted cost of equity and after-tax debt'],
    ['Terminal growth', pct(d.terminalGrowth), 'Growth assumed after the forecast, for the terminal-growth models'],
    ['Analyst years used', fc.length ? `${fc.length}, FY${fc[0].year}–FY${fc[fc.length - 1].year}` : 'n/a', 'Consensus rows as published; ten-year models extend from the median step'],
    ...(exits.length ? [['Exit multiples', exits.join(', '), 'The sector medians, for the exit models'] as [string, string, string]] : []),
  ];
  return (
    <>
      <p className="mb-1.5 mt-4 text-[14.5px] font-semibold">The inputs behind every discounted cash flow</p>
      <DocTable first="Input" head={['Value', 'Where it comes from']} rows={rows.map(([k, v, w]) => [
        k, v, <span key="w" className="block min-w-[14rem] whitespace-normal text-left text-muted-foreground">{w}</span>,
      ])} />
      <Small className="mt-1.5">No input is set by hand for this company. Change the benchmark rates in Settings and every model, and the estimate, moves with them.</Small>
    </>
  );
}

/* ---------- dividend ------------------------------------------------------------- */

const paysDividend = (a: Analysis) => !!a.dividends?.available && isNum(a.facts.dividendYield) && a.facts.dividendYield > 0;

/*
  The dividend, for payers: the record in figures, then the four composites
  graded against other payers on their own 1-5 scale. No total, as on the
  Dividends tab: the four are reported side by side by design.
*/
function DividendSection({ a }: { a: Analysis }) {
  const nav = useNav();
  const [res, setRes] = React.useState<DivResult | null>(null);
  const pays = paysDividend(a);
  React.useEffect(() => {
    if (!pays) return undefined;
    let live = true;
    loadDividendScores(a).then((r) => { if (live) setRes(r); }).catch(() => { /* the figures still stand */ });
    return () => { live = false; };
  }, [a, pays]);
  if (!pays) return null;
  const f = a.facts;
  const dv = a.dividends;
  const name = String(f.name || f.symbol).replace(/,?\s+(Inc\.?|Corporation|Corp\.?)$/i, '');
  const record = [
    `${name} pays a dividend yielding ${pct(f.dividendYield)}${isNum(f.payoutRatio) ? `, ${pct(f.payoutRatio)} of earnings` : ''}.`,
    isNum(dv.growth) && dv.years > 1
      ? `Over the ${dv.years} years on record the dividend per share grew ${pct(dv.growth)} a year${isNum(dv.worstDrop) ? (dv.worstDrop < 0 ? `, and the deepest annual cut was ${pct(-dv.worstDrop)}` : ', without a single annual cut') : ''}.`
      : null,
    isNum(a.val?.buybackYield) && a.val.buybackYield > (f.dividendYield || 0)
      ? `Buybacks return more than the dividend: a ${pct(a.val.buybackYield)} buyback yield against the ${pct(f.dividendYield)} dividend yield.`
      : null,
  ].filter(Boolean).join(' ');
  const factors = res?.pays ? res.order.map((k) => res.factors[k]).filter(Boolean) : [];
  return (
    <Section id="rsr-div" title="Dividend" a={a} nar={null} signed={false}>
      <Para>{record}</Para>
      {factors.length ? (
        <DocTable first="Composite" head={['Grade and score (1–5)', 'The question it answers']} rows={factors.map((x) => [
          x.title,
          <GradePill key="g" score={x.score} letter={x.letter} />,
          <span key="q" className="block min-w-[14rem] whitespace-normal text-left text-muted-foreground">{x.question}</span>,
        ])} />
      ) : null}
      <Small className="mt-1.5">
        Graded against dividend payers only, on their own 1–5 scale, and kept apart from the quant rating. There is no total by design: the
        four composites answer different questions.{res?.lapsed ? ' The latest expected payment has not arrived; the grades are flagged as lapsing.' : ''}{' '}
        <button type="button" onClick={() => nav.goSymbolTab('Dividends', f.symbol)} className="font-semibold text-primary hover:underline">Every line behind the grades, on the Dividends tab ›</button>
      </Small>
    </Section>
  );
}

/* ---------- Shariah compliance --------------------------------------------------- */

/*
  The verdict in brief, linked to the full screen. A company with a researched
  record (AAPL) gets that record's summary and the five index families on its
  figures; every other company gets the quick screen on today's market cap,
  which the Shariah tab refines with the averaged market caps.
*/
function ShariahSection({ a }: { a: Analysis }) {
  const nav = useNav();
  const f = a.facts;
  const record = issuerRecord(f.symbol);
  const sc = React.useMemo(() => (record ? screenIssuer(record) : null), [record]);
  const quick = React.useMemo(() => (record ? [] : SHARIAH_STANDARDS.map((std) => shariahVerdict(a, std))), [a, record]);
  const word = (s: string) => (s === 'pass' ? 'Pass' : s === 'fail' ? 'Fail' : s === 'borderline' ? 'Borderline' : 'Not measured');
  const tone = (s: string) => (s === 'pass' ? 'text-up' : s === 'fail' ? 'text-down' : 'text-muted-foreground');
  const link = (
    <button type="button" onClick={() => nav.goSymbolTab('Shariah Compliance', f.symbol)} className="font-semibold text-primary hover:underline">
      The full screen, gate by gate, on the Shariah Compliance tab ›
    </button>
  );
  if (record && sc) {
    const pref = sc.scenarios[PREFERRED];
    const passed = sc.indexes.filter((x) => x.state === 'pass').length;
    return (
      <Section id="rsr-shariah" title="Shariah Compliance" a={a} nar={null} signed={false}>
        <Para>
          {record.summary} On Maz Vantage’s preferred reading ({SCENARIO_NAME[PREFERRED]}) the verdict is{' '}
          <b>{pref.verdict === 'PASS' ? 'pass' : pref.verdict.toLowerCase()}</b>, and {passed} of the {sc.indexes.length} index methodologies pass on
          the same figures.
        </Para>
        <DocTable first="Methodology" head={['Verdict']} rows={[
          ...sc.indexes.map((x) => [x.rule.name, <b key="v" className={tone(x.state)}>{word(x.state)}</b>]),
          [<span key="n">Maz Vantage, {SCENARIO_NAME[PREFERRED]}</span>, <b key="v" className={pref.verdict === 'PASS' ? 'text-up' : pref.verdict.startsWith('MIXED') ? 'text-muted-foreground' : 'text-down'}>{pref.verdict === 'PASS' ? 'Pass' : pref.verdict.startsWith('MIXED') ? 'Watch' : 'Fail'}</b>],
        ]} />
        <Small className="mt-1.5">Screened {fmtDate(record.screened)} from the company’s SEC filings, methodology {record.version.replace(/^v?/, 'v')}. A mechanical screen, not a scholarly ruling. {link}</Small>
      </Section>
    );
  }
  const passed = quick.filter((x) => x.state === 'pass').length;
  return (
    <Section id="rsr-shariah" title="Shariah Compliance" a={a} nar={null} signed={false}>
      <Para>
        On today’s market value, {f.name} passes {passed} of the {quick.length} standards’ financial screens. This is the quick screen: the
        index families divide by averaged market caps and test revenue line by line, which the Shariah tab does where the history is available.
      </Para>
      <DocTable first="Standard" head={['Verdict', 'Deciding test']} rows={quick.map((x) => [
        x.std.name,
        <b key="v" className={tone(x.state)}>{word(x.state)}</b>,
        <span key="n" className="block min-w-[14rem] whitespace-normal text-left text-muted-foreground">{x.note}</span>,
      ])} />
      <Small className="mt-1.5">A mechanical screen, not a scholarly ruling. {link}</Small>
    </Section>
  );
}

function Risk({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  const u = r.unc;
  const read = (p: number | null) => (p === 0 ? 'Contained' : p === 1 ? 'Moderate' : p === 2 ? 'Wide' : 'Not measured');
  const bands = Object.entries(SAFETY_BANDS) as [string, any][];
  return (
    <Section id="rsr-risk" title="Risk and Uncertainty" a={a} nar={nar}>
      <Prose a={a} nar={nar} k="risk" fallback={riskProse(a, r)} />
      <div className="mt-4">
        <DocTable first="Driver of the uncertainty rating" head={['Reading', 'Contribution']}
          rows={u.drivers.map((d: any) => [d.label, isNum(d.value) ? d.fmt(d.value) : 'n/a', read(d.points)])} />
        <Small className="mt-1.5">
          The rating is the mean of the drivers that could be measured: <b>{u.label}</b>. It chooses the margin of safety the valuation zone
          demands, from the published ladder — {bands.map(([, b]) => `${b.label} ${pct(1 - b.lo)} / ${pct(b.hi - 1)}`).join(', ')} — as a
          discount below and a premium above the fair value estimate. It does not touch the quant rating.
        </Small>
      </div>
      <RiskFactorChanges a={a} />
    </Section>
  );
}

/*
  What the company itself changed in its risk factors between its last two
  10-Ks: the risks no market measure sees until they happen, in its own
  filing, with the reading ours. Shown only where a review is on record.
*/
function RiskFactorChanges({ a }: { a: Analysis }) {
  const rv = riskReviewFor(a.facts.symbol);
  if (!rv) return null;
  const fy = (y: number) => `FY${y}`;
  const order = { new: 0, removed: 1, expanded: 2, reworded: 3 } as const;
  const changes = [...rv.changes].sort((x, y) => order[x.kind] - order[y.kind]);
  const link = (url: string, label: string) => (
    <a href={url} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">{label}</a>
  );
  return (
    <>
      <h3 className="mb-2 mt-7 text-[15px] font-bold">What the company changed in its own risk factors, {fy(rv.current.fiscalYear)} 10-K against {fy(rv.previous.fiscalYear)}</h3>
      <Para>{rv.summary}</Para>
      <Para>
        The {fy(rv.current.fiscalYear)} filing lists {rv.current.count} risk factors against {rv.previous.count}: {rv.counts.sameHeading} kept
        their heading word for word, {rv.counts.reworded} {rv.counts.reworded === 1 ? 'was' : 'were'} rewritten, {rv.counts.added} {rv.counts.added === 1 ? 'is' : 'are'} new
        and {rv.counts.dropped} {rv.counts.dropped === 1 ? 'was' : 'were'} dropped. These are the risks the uncertainty rating above cannot see,
        because none of them is in the market or accounting data until it happens.
      </Para>
      <DocTable first="Risk factor" head={['Change', 'What changed']} rows={changes.map((c) => [
        <span key="s" className="block min-w-[9rem] whitespace-normal"><b>{c.subject}</b><span className="block text-tiny text-muted-foreground">{c.group}</span></span>,
        CHANGE_LABEL[c.kind],
        <span key="w" className="block min-w-[16rem] whitespace-normal text-left">
          {c.what}
          {c.quote ? <span className="mt-1 block font-serif italic text-foreground/80">“{c.quote}”</span> : null}
        </span>,
      ])} />
      <Small className="mt-1.5">
        Source: the company’s 10-K filings, {link(rv.current.url, `${fy(rv.current.fiscalYear)}, filed ${fmtDate(rv.current.filed)}`)} and{' '}
        {link(rv.previous.url, `${fy(rv.previous.fiscalYear)}, filed ${fmtDate(rv.previous.filed)}`)}, Item 1A. Compared heading by heading and sentence by
        sentence on {fmtDate(rv.readOn)}; which changes matter, and the words describing them, are ours. Quotations are the company’s. Not scored.
      </Small>
    </>
  );
}

function Capital({ a, r, nar, ex }: { a: Analysis; r: Ratings; nar: Narrative; ex: number }) {
  const c = r.capital;
  const cur = curSymbol(a.facts.currency);
  const rows: any[] = (a.series?.rows || []).slice(-6).filter((x: any) => isNum(x.fcf));
  return (
    <Section id="rsr-capital" title="Capital Allocation" a={a} nar={nar}>
      <Prose a={a} nar={nar} k="capital" fallback={capitalProse(a, r)} />
      {rows.length > 1 ? (
        <Exhibit n={ex} title="Free cash flow and what was returned to shareholders" source="company cash flow statements; Maz Vantage.">
          <ColumnChart height={230} categories={rows.map((x) => x.year)} valueFmt={(v) => money(v, { currency: cur })} series={[
            { name: 'Free cash flow', color: 'var(--chart-1)', values: rows.map((x) => x.fcf) },
            { name: 'Dividends', color: 'var(--chart-2)', values: rows.map((x) => x.dividends) },
            { name: 'Buybacks', color: 'var(--chart-4)', values: rows.map((x) => x.buybacks) },
          ]} />
        </Exhibit>
      ) : null}
      <DocTable first="Leg" head={['Assessment', 'On what']}
        rows={c.legs.map((l: any) => [l.label, l.verdict, <span key="w" className="text-muted-foreground">{l.detail || 'not measured'}</span>])} />
    </Section>
  );
}

/*
  Our quant rating and the peer comparison, in one section: what the rating
  is made of, then a dozen chosen ratios read against the sector (as graded)
  and against the named peers (one TTM definition for every company). The
  model and the sentences live in `lib/research-peers.ts`.
*/
function QuantPeers({ a, nar, ex }: { a: Analysis; nar: Narrative; ex: number }) {
  const f = a.facts;
  const cur = curSymbol(f.currency);
  const cmp = React.useMemo(() => comparison(a), [a]);
  const paras = React.useMemo(() => quantPeerParas(a, cmp), [a, cmp]);
  const factors = Object.entries(FACTOR_TITLES).filter(([k]) => isNum((a.scores as any)[k]?.score));
  const cos = cmp.companies;
  const caps = new Map<string, number>([[f.symbol, f.marketCap], ...(a.peers?.peers || []).map((p: any) => [p.symbol, p.marketCap] as [string, number])]);
  const roic = cmp.rows.find((r) => r.pick.id === 'returnOnInvestedCapital');
  const pe = cmp.rows.find((r) => r.pick.id === 'peGaapTtm');
  // Sentences 0–1 describe the rating; the factor paragraphs follow the factor chart; the last paragraph closes on the peers.
  const voices = voicesFor(f.symbol, 'quant');
  const run = (keys: string[]) => (
    <WithVoices anchored voices={voices.filter((v) => keys.includes(String(v.after)))}
      items={paras.filter((p) => keys.includes(p.key)).map((p) => ({ key: p.key, node: <Para key={p.key}>{p.text}</Para> }))} />
  );
  const FACTOR_KEYS_P = ['valuation', 'profitability', 'growth', 'health'];
  const peerDate: string | null = (a.ds as any).snapshotExtras?.peersCapturedAt || null;
  return (
    <Section id="rsr-quant" title="Quant Rating and Peer Comparison" a={a} nar={nar} signed={false}>
      {run(['lead', 'factors'])}
      {factors.length ? (
        <Exhibit n={ex} title="The quant rating’s five factors against the sector"
          source="Maz Vantage quant rating; each factor is the mean percentile of its ratios against the sector, on a 0–5 scale where 2.5 is the sector median.">
          <div className="grid gap-2.5 py-1">
            {factors.map(([k, t]) => {
              const fs = (a.scores as any)[k];
              return (
                <div key={k} className="grid grid-cols-[130px_minmax(0,1fr)_auto] items-center gap-3 text-13">
                  <span className="font-medium">{t}</span>
                  <div className="relative">
                    <GradeBar score={fs.score} letter={fs.letter} className="mt-0" />
                    <i className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/40" title="Sector median" />
                  </div>
                  <GradePill score={fs.score} letter={fs.letter} />
                </div>
              );
            })}
            <div className="grid grid-cols-[130px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border pt-2 text-13">
              <span className="font-semibold">Quant rating</span>
              <GradeBar score={(a.scores as any).overall?.score} letter={(a.scores as any).overall?.letter} className="mt-0" />
              <GradePill score={(a.scores as any).overall?.score} letter={(a.scores as any).overall?.letter} size="lg" />
            </div>
          </div>
          <Small className="mt-1">The thin line marks the sector median, 2.5 of 5.</Small>
        </Exhibit>
      ) : null}
      {run(FACTOR_KEYS_P)}
      <Exhibit n={ex + 1} title={`Selected ratios: ${f.symbol} against its sector and its peers`}
        source="Maz Vantage sector distributions and quant grades; peer figures as published, trailing twelve months.">
        <DocTable first="Ratio" head={[f.symbol, 'Sector median', 'Sector percentile', 'Grade', 'Peer median', 'Rank in peers']}
          rows={cmp.rows.map((r) => [
            r.pick.label,
            <b key="v">{r.pick.fmt(r.graded.value)}</b>,
            r.pick.fmt(r.graded.median),
            isNum(r.graded.pctile) ? (
              <span key="p" className="inline-flex w-full min-w-[110px] items-center gap-2">
                <GradeBar className="mt-0 flex-1" tone={toneForLetter(r.graded.letter)} share={r.graded.pctile * 100} />
                <span className="tnum">{pct(r.graded.pctile, { dp: 0 })}</span>
              </span>
            ) : 'n/a',
            <GradePill key="g" score={r.graded.grade} letter={r.graded.letter} />,
            r.pick.fmt(r.peerMedian),
            isNum(r.rank) ? `${r.rank} of ${r.ranked}` : 'n/a',
          ])} />
        <Small className="mt-1.5">
          Percentiles are turned so that higher is always better: a P/E in the 20th percentile is dearer than four-fifths of the sector. The
          first three columns are the figures the quant rating graded; the last two put the company among its peers on the TTM figures below.
        </Small>
      </Exhibit>
      {cos.length > 1 ? (
        <Exhibit n={ex + 2} title="Peer comparison, trailing twelve months" source={`company filings via published TTM ratios${peerDate ? `; peer rows captured ${fmtDate(peerDate)}, ${f.symbol}’s with the rest of this report` : ''}; Maz Vantage.`}>
          <DocTable first="" head={[...cos.map((c) => c.symbol), 'Peer median']} rows={[
            ['Market cap', ...cos.map((c) => (isNum(caps.get(c.symbol)) ? money(caps.get(c.symbol)!, { currency: cur }) : 'n/a')), '—'],
            ...cmp.rows.map((r) => [
              r.pick.label,
              ...r.values.map((v, i) => (i === 0 ? <b key={i}>{r.pick.fmt(v)}</b> : r.pick.fmt(v))),
              r.pick.fmt(r.peerMedian),
            ]),
          ]} />
          <Small className="mt-1.5">
            One definition for every company, {f.symbol} included, so a figure here can differ from the graded one in Exhibit {ex + 1}. A
            negative P/E is shown as n/a, not as a cheap one. Growth is each company’s last fiscal year, and fiscal years end on different dates.
          </Small>
        </Exhibit>
      ) : null}
      {roic && roic.values.filter(isNum).length >= 3 ? (
        <Exhibit n={ex + 3} title="Return on invested capital and P/E across the peer set" source="published TTM ratios; Maz Vantage.">
          <ColumnChart height={220} categories={cos.map((c) => c.symbol)} valueFmt={(v) => pct(v, { dp: 0 })} legend={false}
            series={[{ name: 'ROIC', color: 'var(--chart-2)', values: roic.values, colors: cos.map((c) => (c.self ? 'var(--primary)' : null)) }]} />
          {pe ? (
            <ColumnChart height={180} categories={cos.map((c) => c.symbol)} valueFmt={(v) => mult(v)} legend={false}
              series={[{ name: 'P/E', color: 'var(--chart-4)', values: pe.values, colors: cos.map((c) => (c.self ? 'var(--primary)' : null)) }]} />
          ) : null}
          <Small className="mt-1">Return on invested capital above, P/E below; {f.symbol} in blue.</Small>
        </Exhibit>
      ) : null}
      {run(['closing'])}
    </Section>
  );
}

/** Filed years beside the consensus years, marked E. */
function Financials({ a, nar, ex }: { a: Analysis; nar: Narrative; ex: number }) {
  const rows: any[] = (a.series?.rows || []).slice(-5);
  const fc: any[] = (a.forecast?.rows || []).filter((x: any) => isNum(x.year) && x.year > (rows.at(-1)?.year ?? 0)).slice(0, 3);
  const cur = curSymbol(a.facts.currency);
  if (!rows.length) return <Section id="rsr-fin" title="Financials" a={a} nar={nar} signed={false}><Small>No annual statements were returned.</Small></Section>;
  const dash = '—';
  const m = (v: unknown) => (isNum(v) ? money(v, { currency: cur }) : 'n/a');
  const p = (v: unknown) => (isNum(v) ? pct(v) : 'n/a');
  const line = (label: string, pick: (x: any) => unknown, fmt: (v: unknown) => string, fcPick?: (x: any) => unknown): React.ReactNode[] =>
    [label, ...rows.map((x) => fmt(pick(x))), ...fc.map((x) => (fcPick ? fmt(fcPick(x)) : dash))];
  const growth = (x: any, prev: any) => (prev && prev.revenue > 0 && isNum(x.revenue) ? x.revenue / prev.revenue - 1 : null);
  const margins = (a.series?.rows || []).slice(-10);
  const mp = (k: string) => margins.map((x: any) => ({ date: String(x.year), value: x[k] }));
  return (
    <Section id="rsr-fin" title="Financials" a={a} nar={nar} signed={false}>
      <DocTable first="Fiscal year" head={[...rows.map((x) => String(x.year)), ...fc.map((x) => `${x.year}E`)]} rows={[
        line('Revenue', (x) => x.revenue, m, (x) => x.revenue),
        ['Revenue growth %', ...rows.map((x, i) => <Signed key={`h${i}`} v={growth(x, rows[i - 1])} />),
          ...fc.map((x, i) => <Signed key={`f${i}`} v={growth(x, i > 0 ? fc[i - 1] : rows.at(-1))} />)],
        line('Gross margin %', (x) => x.grossMargin, p),
        line('Operating income', (x) => x.ebit, m, (x) => x.ebit),
        line('Operating margin %', (x) => x.operatingMargin, p),
        line('Net income', (x) => x.netIncome, m, (x) => x.netIncome),
        line('EPS (diluted)', (x) => x.eps, (v) => (isNum(v) ? price(v, cur) : 'n/a'), (x) => x.eps),
        line('Free cash flow', (x) => x.fcf, m),
        line('Return on invested capital %', (x) => x.roic, p),
        line('Debt / equity', (x) => x.debtToEquity, (v) => (isNum(v) ? dec(v, 2) : 'n/a')),
      ]} />
      <Small className="mt-1.5">
        {fc.length
          ? `Columns marked E are the consensus of ${a.forecast.analystCount || 'the'} contributing analysts, used as published and not smoothed.`
          : 'No consensus estimates were returned, so every column is a filed year.'}
      </Small>
      {margins.length > 1 ? (
        <Exhibit n={ex} title="Margins over the filed record" source="company filings; Maz Vantage.">
          <MultiLineChart height={220} labelFmt={(d) => d} valueFmt={(v) => pct(v)} series={[
            { name: 'Gross', color: 'var(--chart-2)', points: mp('grossMargin') },
            { name: 'Operating', color: 'var(--primary)', points: mp('operatingMargin') },
            { name: 'Net', color: 'var(--chart-4)', points: mp('netMargin') },
          ]} />
        </Exhibit>
      ) : null}
    </Section>
  );
}

/* ---------- methodology --------------------------------------------------------- */

/*
  The developer's way in: the exact payload `narrative.ts` would POST to a
  narrative service, for this company. `buildPrompt` makes no network call.
*/
function PromptTools({ a, r }: { a: Analysis; r: Ratings }) {
  const [status, setStatus] = React.useState('');
  // Operator-only (a key set through the hidden `?apikey=` link): it names services and storage keys readers are not told about.
  const [operator, setOperator] = React.useState(false);
  React.useEffect(() => { setOperator(!!getApiKey()); }, []);
  const copy = async () => {
    const payload = JSON.stringify(buildPrompt(a, r), null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setStatus(`Copied — ${Math.round(payload.length / 1024)}KB of JSON.`);
    } catch {
      // Clipboard access can be refused outright; hand over a file instead.
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${a.facts.symbol}-narrative-prompt.json`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('Clipboard refused — downloaded instead.');
    }
  };
  if (!operator) return null;
  return (
    <div className="mt-6 border-t border-border pt-3 no-print">
      <Small>
        For the developer: the narrative is loaded by <code>src/lib/narrative.ts</code>, which tries a configured endpoint, then the bundled{' '}
        <code>/data/research.json</code>, then the generated prose. A service that accepts the payload below and returns{' '}
        <code>{'{ sections: … }'}</code> makes it live; set <code>localStorage[&quot;mazvantage.narrative.endpoint&quot;]</code> to its URL.
      </Small>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={copy}>Copy the model prompt for this company</Button>
        <span className="text-tiny text-muted-foreground">{status}</span>
      </div>
    </div>
  );
}

/** How the quotes were chosen, and every source quoted, once each. */
function OutsideVoices({ a }: { a: Analysis }) {
  const vs = VOICES.filter((v) => v.symbol === a.facts.symbol);
  if (!vs.length) return null;
  const sources = [...new Map(vs.map((v) => [`${v.source}|${v.date}`, v])).values()]
    .sort((x, y) => y.date.localeCompare(x.date));
  const count = (k: string) => vs.filter((v) => v.relation === k).length;
  return (
    <>
      <Para>
        <b>Outside voices.</b> The {vs.length} quotes set beside the paragraphs come from the company’s management on its earnings call,
        from fund managers’ letters to their investors, from published investment research, and from the sell-side analysts’ questions
        on the call. Each is verbatim, a sentence or less, attributed and dated, with any cut marked by an ellipsis. Each is labelled as
        confirming the paragraph ({count('confirms')}), challenging it ({count('challenges')}) or adding context the figures cannot carry
        ({count('adds')}). Which quotes appear is our choice and ours alone; no firm quoted has reviewed this report, and a quote is not an
        endorsement of the rating.
      </Para>
      <p className="mb-1 mt-4 text-13 font-semibold">Sources quoted</p>
      <ul className="mb-3 grid gap-1 text-tiny text-muted-foreground">
        {sources.map((v) => {
          const link = linkOf(v);
          return (
            <li key={`${v.source}${v.date}`}>
              <span className="text-foreground">{v.kind === 'management' || v.kind === 'analyst' ? `${a.facts.name}` : v.role || v.speaker}</span>
              {' · '}{link ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">{v.source}</a> : v.source}
              {', '}{voiceDate(v.date)}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Methodology({ a, r, nar }: { a: Analysis; r: Ratings; nar: Narrative }) {
  return (
    <Section id="rsr-method" title="Research Methodology" a={a} nar={nar} signed={false}>
      <Para>
        This report follows the section order of a sell-side or independent equity analyst report because it is a good structure for an
        argument. What sits inside each section is arrived at differently from a house with named analysts, and the difference matters.
      </Para>
      <Para>
        <b>The headline rating</b> is the Maz Vantage quant rating: {r.quant.graded} ratios ranked as percentiles against the sector, averaged
        into five factor scores and then across them. Price multiples count, inside the Valuation factor; no fair value estimate does. It asks
        how the company ranks against its peers, not whether the price sits below intrinsic value.
      </Para>
      <Para>
        <b>The fair value estimate</b> is the median of {r.fve.count || 'up to thirteen'} models (six discounted cash flows, six relative
        multiples and a published levered DCF) run on consensus estimates, with no assumption set by hand. It sets the valuation zone, through
        the margin of safety the uncertainty rating chooses, and never the quant rating.
      </Para>
      <Para>
        <b>The moat and capital allocation ratings</b> are measurements, not forecasts. The moat counts how many of the last ten filed years
        earned more on capital than that capital cost, and names no source of advantage. Capital allocation scores the balance sheet,
        investment record and distributions from filed figures, and makes no judgement of management.
      </Para>
      <Para>
        <b>The prose</b>{' '}
        {nar
          ? `was written by ${nar.model} from a brief of pre-computed figures, under instructions to quote them verbatim and invent nothing. The model was given numbers and asked for prose; it was never asked for a number, and no person reviewed it before publication. Every figure and rating it names is checked against the page as it loads, and a section that cites one the page no longer shows is replaced by the generated form${staleTitles(nar).length ? ` (here: ${titleList(staleTitles(nar))})` : ''}. A summary can still mislead by emphasis without stating anything false; where the prose and the tables disagree, the tables are right.`
          : 'is assembled from the numbers in this report. Every sentence is built from a figure shown here, and a sentence whose inputs are missing is not written.'}
      </Para>
      <Para>
        <b>The perspectives beyond our own model.</b> What the Price Implies runs the ten-year discounted cash flow backwards, solving for
        the growth, margin or return today’s price needs, with every other input as the models set it. Key Debates sets out the
        questions that decide the value in the words of management, sell-side analysts, fund managers, researchers and competitors, and
        which side the price already pays for; the debates, the quotes chosen and the readings are ours. Street View reads the analysts’
        consensus as captured on dated occasions in a ledger built forward from August 2026, so revisions are measured, not inferred.
        The Alpha Signal section is the reading that had its own tab until October 2026: eleven categories of dated, sourced evidence,
        grouped into three questions and read on their own 0–100 scale with weights that have not been tested against returns.
        Ownership comes from 13F and Form 4 filings as filed; Management’s Record compares each call’s guidance with the result and reads
        the pay goals from the proxy statement; the market-share tables are copied from the researchers’ own free releases. None of
        these enters the quant rating.
      </Para>
      <OutsideVoices a={a} />
      {a.sectorTable?.quality === 'seed' ? (
        <Para>
          <b>A data caveat.</b> The sector distributions behind the quant rating are modelled rather than measured, so the rating, its factor
          scores and the ranked ratios inherit that. The fair value, uncertainty and moat ratings do not touch the sector table.
        </Para>
      ) : null}
      <Small className="mt-4 border-t border-border pt-2">
        This report is not investment advice. The ratings are arithmetic over filed accounts and published consensus, and each can be
        reproduced from the figures beside it. No one has met the management or formed a view the numbers do not already contain.
      </Small>
      <PromptTools a={a} r={r} />
    </Section>
  );
}

/* ==========================================================================
   The tab — section order follows the source reports' contents page
   ========================================================================== */

export function ResearchTab({ a }: { a: Analysis }) {
  const r = React.useMemo(() => researchRatings(a), [a]);
  const [nar, setNar] = React.useState<Narrative>(null);
  usePrintInLight();

  /* The generated prose renders first; the narrative swaps in when it lands.
     A failure is silent: the generated form is a complete report. */
  React.useEffect(() => {
    let live = true;
    setNar(null);
    fetchNarrative(a, r).then((n: any) => { if (live && n?.sections) setNar(n); }).catch(() => { /* keep the generated prose */ });
    return () => { live = false; };
  }, [a, r]);

  // Exhibits are numbered in reading order, each section reserving as many numbers as it can draw; Exhibit 1 would be the
  // price chart in the head, which carries its own title instead. A section that draws fewer leaves a gap, never a repeat.
  const ex = (() => {
    let n = 1;
    const take = (k: number) => { const at = n; n += k; return at; };
    return {
      implied: take(2), debates: take(1), alpha: take(4), strategy: take(1), industry: take(marketsFor(a.facts.symbol).length), street: take(4),
      owners: take(2), quant: take(4), moat: take(1), fv: take(7), history: take(4), mgmt: take(2), capital: take(1),
      signposts: take(2), fin: take(1),
    };
  })();
  return (
    <article data-print="report" className="@container mx-auto max-w-[1180px] bg-background px-1 pb-10">
      <PrintBrand a={a} />
      <RunningHead a={a} />
      <HeadStrip a={a} r={r} />
      <PriceVsFairValue a={a} r={r} />
      <div data-print-flow className="mt-8 grid gap-8 @3xl:grid-cols-[230px_minmax(0,1fr)] @3xl:gap-10">
        <Sidebar a={a} nar={nar} />
        <div className="min-w-0">
          <AnalystNote a={a} r={r} nar={nar} />
          <RecentDevelopments a={a} nar={nar} />
          <ImpliedSection a={a} nar={nar} ex={ex.implied} />
          <DebatesSection a={a} nar={nar} ex={ex.debates} />
          <AlphaSection a={a} nar={nar} ex={ex.alpha} />
          <Strategy a={a} r={r} nar={nar} ex={ex.strategy} industryEx={ex.industry} />
          <BullsBears a={a} r={r} nar={nar} />
          <StreetSection a={a} nar={nar} ex={ex.street} />
          <OwnershipSection a={a} nar={nar} ex={ex.owners} />
          <QuantPeers a={a} nar={nar} ex={ex.quant} />
          <Moat a={a} r={r} nar={nar} ex={ex.moat} />
          <FairValue a={a} r={r} nar={nar} ex={ex.fv} />
          <HistorySection a={a} nar={nar} ex={ex.history} />
          <Risk a={a} r={r} nar={nar} />
          <ManagementSection a={a} nar={nar} ex={ex.mgmt} />
          <Capital a={a} r={r} nar={nar} ex={ex.capital} />
          <DividendSection a={a} />
          <ShariahSection a={a} />
          <SignpostsSection a={a} r={r} nar={nar} ex={ex.signposts} />
          <Financials a={a} nar={nar} ex={ex.fin} />
          <Methodology a={a} r={r} nar={nar} />
        </div>
      </div>
    </article>
  );
}
