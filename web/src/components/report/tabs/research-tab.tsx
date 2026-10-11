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
  SAFETY_BANDS, analystNote, capitalProse, fairValueProse, moatProse, researchRatings, riskProse, strategyProse,
} from '@/lib/research-model';
import { getApiKey } from '@/lib/fmp';
import type { Analysis } from '@/lib/model';
import { ColumnChart, LineChart, MultiLineChart, WaterfallChart } from '@/components/charts/charts';
import { ValuationRangeChart } from '@/components/charts/diagrams';
import { scenarioReading } from '@/components/report/scenario-card';
import { buildScenarios } from '@/lib/scenarios';
import { parameterProse, profitDriverProse, profitDrivers, valuationParameters } from '@/lib/research-valuation';
import { FACTOR_TITLES, comparison, quantPeerParas } from '@/lib/research-peers';
import { KIND_LABEL, RELATION_LABEL, VOICES, linkOf, voicesFor, type Voice, type VoiceSection } from '@/lib/research-voices';
import { CONFIDENCE_LABEL, KIND_LABEL as EVENT_KIND, dealMath, eventsFor, type CorpEvent, type EventParty } from '@/lib/events';
import { GradeBar, GradePill } from '@/components/report/grade-parts';
import { toneForLetter } from '@/lib/grading';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

type Ratings = ReturnType<typeof researchRatings>;
type Narrative = { sections: Record<string, any>; model?: string; generatedAt?: string; source?: string } | null;

const SEG_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--muted-foreground)'];

/* ---------- type ------------------------------------------------------------------ */

const Para = ({ children }: { children: React.ReactNode }) =>
  <p className="mb-3.5 text-[14.5px] leading-[1.75] text-foreground/90 last:mb-0">{children}</p>;

const Small = ({ children, className }: { children: React.ReactNode; className?: string }) =>
  <p className={cn('text-tiny leading-relaxed text-muted-foreground', className)}>{children}</p>;

const Signed = ({ v }: { v: number | null | undefined }) =>
  <span className={isNum(v) ? (v >= 0 ? 'text-up' : 'text-down') : ''}>{isNum(v) ? pct(v, { sign: true }) : 'n/a'}</span>;

/** The paragraphs of one section: the narrative's if it wrote this section, else the generated form, which is complete prose. */
function Prose({ a, nar, k, fallback }: { a: Analysis; nar: Narrative; k: VoiceSection; fallback: string[] }) {
  const paras = nar?.sections?.[k];
  const written = Array.isArray(paras) && paras.length > 0;
  const use: string[] = written ? paras : fallback;
  // Quotes are anchored to the written narrative's paragraphs; over the generated form they gather at the end.
  return <WithVoices items={use.map((p, i) => ({ key: i, node: <Para key={i}>{p}</Para> }))} voices={voicesFor(a.facts.symbol, k)} anchored={written} />;
}

const REL_RULE: Record<string, string> = { confirms: 'border-up', challenges: 'border-down', adds: 'border-muted-foreground/40' };
const REL_TEXT: Record<string, string> = { confirms: 'text-up', challenges: 'text-down', adds: 'text-muted-foreground' };

/** `2026-07-30` → 30 Jul 2026; a month-only `2026-01` → Jan 2026. */
const voiceDate = (d: string) => (d.length === 7 ? fmtDate(`${d}-01`, { month: 'short', year: 'numeric' }) : fmtDate(d));

/*
  One outside voice, set as a pull quote under the paragraph it bears on:
  whether it confirms, challenges or adds context, who said it and where,
  then one line of ours on why it is there.
*/
function VoiceQuote({ v }: { v: Voice }) {
  const link = linkOf(v);
  return (
    <blockquote className={cn('my-4 ml-1 border-l-[3px] py-0.5 pl-4', REL_RULE[v.relation])}>
      <p className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">
        <span className={REL_TEXT[v.relation]}>{RELATION_LABEL[v.relation]}</span> · {KIND_LABEL[v.kind]}
      </p>
      <p className="mt-1 font-serif text-[15.5px] italic leading-[1.6] text-foreground">“{v.quote}”</p>
      <p className="mt-1.5 text-tiny text-muted-foreground">
        — <span className="font-semibold text-foreground">{v.speaker}</span>{v.role ? `, ${v.role}` : ''} ·{' '}
        {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-2 hover:text-foreground">{v.source}</a> : v.source}, {voiceDate(v.date)}
      </p>
      <p className="mt-1 text-tiny leading-relaxed text-muted-foreground">{v.note}</p>
    </blockquote>
  );
}

/** Paragraphs with their quotes between them; anything unanchored, or anchored past the end, closes the run. */
function WithVoices({ items, voices, anchored }: { items: { key: number | string; node: React.ReactNode }[]; voices: Voice[]; anchored: boolean }) {
  const keys = new Set(items.map((x) => x.key));
  const placed = anchored ? voices.filter((v) => keys.has(v.after)) : [];
  const tail = voices.filter((v) => !placed.includes(v));
  return (
    <>
      {items.map((x) => (
        <React.Fragment key={x.key}>
          {x.node}
          {placed.filter((v) => v.after === x.key).map((v, i) => <VoiceQuote key={i} v={v} />)}
        </React.Fragment>
      ))}
      {tail.map((v, i) => <VoiceQuote key={`t${i}`} v={v} />)}
    </>
  );
}

/*
  Who wrote it, where an analyst report puts the analyst's name. A Morningstar
  section is signed by a named person; signing generated prose with anything
  resembling a name would be the one genuinely misleading thing this page
  could do, so it names the model and the date it wrote.
*/
const authorOf = (nar: Narrative) => (nar?.model ? `${nar.model}, for Maz Vantage` : 'Maz Vantage model');
const dateOf = (a: Analysis, nar: Narrative) => fmtDate(nar?.generatedAt || a.ds.asOf);

/** A section: the title on a rule, the byline beside it, then the argument. */
function Section({ id, title, a, nar, signed = true, children }: {
  id: string; title: string; a: Analysis; nar: Narrative; signed?: boolean; children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-24 border-t border-foreground/80 pt-3 first:mt-0">
      <h2 className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[17px] font-bold tracking-[-.01em]">{title}</span>
        {signed ? <span className="text-tiny text-muted-foreground">{authorOf(nar)}, {dateOf(a, nar)}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** A numbered exhibit, the way broker research carries its charts: title above, source below. */
function Exhibit({ n, title, source, children }: { n?: number; title: string; source: string; children: React.ReactNode }) {
  return (
    <figure className="my-5 border-y border-border py-3">
      <figcaption className="mb-2 text-13 font-semibold">{n ? `Exhibit ${n}: ` : ''}{title}</figcaption>
      {children}
      <Small className="mt-2">Source: {source}</Small>
    </figure>
  );
}

/** A report table: hairline rules, figures right-aligned, no card around it. */
function DocTable({ head, rows, first = 'Figure' }: { head: string[]; rows: React.ReactNode[][]; first?: string }) {
  return (
    <div className="scroll-none overflow-x-auto">
      <table className="w-full border-collapse text-13 tnum">
        <thead>
          <tr className="border-b border-foreground/70">
            {[first, ...head].map((h, i) => (
              <th key={i} className={cn('px-2 py-1.5 text-tiny font-semibold text-muted-foreground', i ? 'text-right' : 'text-left')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-foreground/70">
              {r.map((c, j) => <td key={j} className={cn('px-2 py-1.5', j ? 'whitespace-nowrap text-right' : 'text-left')}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- the head of the report ---------------------------------------------- */

function RunningHead({ a }: { a: Analysis }) {
  const f = a.facts;
  return (
    <p className="border-b border-border pb-2 text-micro text-muted-foreground">
      Maz Vantage Equity Research Report | Report as of {fmtDate(a.ds.asOf)} | Reporting currency: {f.currency || 'n/a'} | Exchange: {f.exchange || 'n/a'}
    </p>
  );
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
  return (
    <div className="mt-5">
      <p className="mb-1 text-13 font-semibold">Price vs. Fair Value</p>
      {pts.length > 1 ? (
        <LineChart height={240} series={pts.map((p) => ({ date: p.date, value: p.price }))} valueFmt={(v) => price(v, cur)}
          labelFmt={(d) => fmtDate(d, { month: 'short', year: '2-digit' })}
          refLine={isNum(r.fve.value) ? { value: r.fve.value, label: `Fair value ${price(r.fve.value, cur)}` } : null} />
      ) : <Small>No price history was loaded.</Small>}
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
  ['rsr-note', 'Analyst Note'], ['rsr-dev', 'Recent Developments'], ['rsr-strategy', 'Business Strategy & Outlook'], ['rsr-bullbear', 'Bulls Say / Bears Say'], ['rsr-quant', 'Quant Rating and Peers'],
  ['rsr-moat', 'Economic Moat'], ['rsr-fv', 'Fair Value and Profit Drivers'], ['rsr-risk', 'Risk and Uncertainty'],
  ['rsr-capital', 'Capital Allocation'], ['rsr-fin', 'Financials'], ['rsr-method', 'Research Methodology'],
];

function Sidebar({ a, nar }: { a: Analysis; nar: Narrative }) {
  const f = a.facts;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <aside className="text-13 @3xl:sticky @3xl:top-20 @3xl:self-start">
      <p className="border-t border-foreground/80 pt-2 text-13 font-bold">Contents</p>
      <ol className="mt-1.5 grid gap-1">
        {CONTENTS.filter(([id]) => id !== 'rsr-dev' || eventsFor(f.symbol).length).map(([id, label]) => (
          <li key={id}>
            <button type="button" onClick={() => go(id)} className="text-left hover:text-primary hover:underline">{label}</button>
          </li>
        ))}
      </ol>
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
          ? `The prose in this report was written by ${nar.model} from a brief of pre-computed figures and was not reviewed by a person before publication. Where prose and tables disagree, the tables are right.`
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
    </Section>
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

function Strategy({ a, r, nar, ex }: { a: Analysis; r: Ratings; nar: Narrative; ex: number }) {
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
    </Section>
  );
}

function BullsBears({ a, nar }: { a: Analysis; nar: Narrative }) {
  const bulls: string[] = nar?.sections?.bulls?.length ? nar.sections.bulls : (a.rewards || []);
  const bears: string[] = nar?.sections?.bears?.length ? nar.sections.bears : (a.risks || []);
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
    </Section>
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
    <div className="mt-6 border-t border-border pt-3">
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
          ? `was written by ${nar.model} from a brief of pre-computed figures, under instructions to quote them verbatim and invent nothing. The model was given numbers and asked for prose; it was never asked for a number, and no person reviewed it before publication. A summary can still mislead by emphasis without stating anything false; where the prose and the tables disagree, the tables are right.`
          : 'is assembled from the numbers in this report. Every sentence is built from a figure shown here, and a sentence whose inputs are missing is not written.'}
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

  /* The generated prose renders first; the narrative swaps in when it lands.
     A failure is silent: the generated form is a complete report. */
  React.useEffect(() => {
    let live = true;
    setNar(null);
    fetchNarrative(a, r).then((n: any) => { if (live && n?.sections) setNar(n); }).catch(() => { /* keep the generated prose */ });
    return () => { live = false; };
  }, [a, r]);

  // Exhibits are numbered in reading order; Exhibit 1 would be the price chart in the head, which carries its own title instead.
  return (
    <article className="@container mx-auto max-w-[1180px] bg-background px-1 pb-10">
      <RunningHead a={a} />
      <HeadStrip a={a} r={r} />
      <PriceVsFairValue a={a} r={r} />
      <div className="mt-8 grid gap-8 @3xl:grid-cols-[230px_minmax(0,1fr)] @3xl:gap-10">
        <Sidebar a={a} nar={nar} />
        <div className="min-w-0">
          <AnalystNote a={a} r={r} nar={nar} />
          <RecentDevelopments a={a} nar={nar} />
          <Strategy a={a} r={r} nar={nar} ex={1} />
          <BullsBears a={a} nar={nar} />
          <QuantPeers a={a} nar={nar} ex={2} />
          <Moat a={a} r={r} nar={nar} ex={6} />
          <FairValue a={a} r={r} nar={nar} ex={7} />
          <Risk a={a} r={r} nar={nar} />
          <Capital a={a} r={r} nar={nar} ex={12} />
          <Financials a={a} nar={nar} ex={13} />
          <Methodology a={a} r={r} nar={nar} />
        </div>
      </div>
    </article>
  );
}
