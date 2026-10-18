/* ==========================================================================
   Maz Vantage — the Research tab's document parts

   The type of the report, shared by every section: paragraphs, numbered
   exhibits, hairline tables, a signed section head, and the pull quotes the
   outside voices are set as. Moved out of research-tab.tsx (2026-10-12) so
   the sections that live in their own files set the same type.
   ========================================================================== */

import * as React from 'react';
import { fmtDate, isNum, pct } from '@/lib/format';
import { KIND_LABEL, RELATION_LABEL, linkOf, voicesFor, type Voice, type VoiceSection } from '@/lib/research-voices';
import type { Analysis } from '@/lib/model';
import type { researchRatings } from '@/lib/research-model';
import { cn } from '@/lib/cn';

export type Ratings = ReturnType<typeof researchRatings>;
export type Narrative = {
  sections: Record<string, any>; model?: string; generatedAt?: string; source?: string;
  /** sections dropped because they cite a figure or a rating the page no longer shows */
  stale?: { section: string; reasons: string[] }[];
} | null;

export const SEG_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--muted-foreground)'];

/* ---------- type ------------------------------------------------------------------ */

export const Para = ({ children }: { children: React.ReactNode }) =>
  <p className="mb-3.5 text-[14.5px] leading-[1.75] text-foreground/90 last:mb-0">{children}</p>;

export const Small = ({ children, className }: { children: React.ReactNode; className?: string }) =>
  <p className={cn('text-tiny leading-relaxed text-muted-foreground', className)}>{children}</p>;

export const Signed = ({ v }: { v: number | null | undefined }) =>
  <span className={isNum(v) ? (v >= 0 ? 'text-up' : 'text-down') : ''}>{isNum(v) ? pct(v, { sign: true }) : 'n/a'}</span>;

/** The paragraphs of one section: the narrative's if it wrote this section, else the generated form, which is complete prose. */
export function Prose({ a, nar, k, fallback }: { a: Analysis; nar: Narrative; k: VoiceSection; fallback: string[] }) {
  const paras = nar?.sections?.[k];
  const written = Array.isArray(paras) && paras.length > 0;
  const use: string[] = written ? paras : fallback;
  // Quotes are anchored to the written narrative's paragraphs; over the generated form they gather at the end.
  return <WithVoices items={use.map((p, i) => ({ key: i, node: <Para key={i}>{p}</Para> }))} voices={voicesFor(a.facts.symbol, k)} anchored={written} />;
}

export const REL_RULE: Record<string, string> = { confirms: 'border-up', challenges: 'border-down', adds: 'border-muted-foreground/40' };
export const REL_TEXT: Record<string, string> = { confirms: 'text-up', challenges: 'text-down', adds: 'text-muted-foreground' };

/** `2026-07-30` → 30 Jul 2026; a month-only `2026-01` → Jan 2026. */
export const voiceDate = (d: string) => (d.length === 7 ? fmtDate(`${d}-01`, { month: 'short', year: 'numeric' }) : fmtDate(d));

/*
  One outside voice, set as a pull quote under the paragraph it bears on:
  whether it confirms, challenges or adds context, who said it and where,
  then one line of ours on why it is there.
*/
export function VoiceQuote({ v }: { v: Voice }) {
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
export function WithVoices({ items, voices, anchored }: { items: { key: number | string; node: React.ReactNode }[]; voices: Voice[]; anchored: boolean }) {
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
export const authorOf = (nar: Narrative) => (nar?.model ? `${nar.model}, for Maz Vantage` : 'Maz Vantage model');
export const dateOf = (a: Analysis, nar: Narrative) => fmtDate(nar?.generatedAt || a.ds.asOf);

/** The narrative key behind each signed section; a section the narrative did not write (or wrote stale) is signed by the model. */
export const NARRATIVE_KEY: Record<string, string> = {
  'rsr-note': 'note', 'rsr-strategy': 'strategy', 'rsr-bullbear': 'bulls', 'rsr-moat': 'moat',
  'rsr-fv': 'fairValue', 'rsr-risk': 'risk', 'rsr-capital': 'capital',
};
export const STALE_TITLE: Record<string, string> = {
  note: 'Analyst Note', strategy: 'Business Strategy & Outlook', bulls: 'Bulls Say / Bears Say', bears: 'Bulls Say / Bears Say',
  moat: 'Economic Moat', fairValue: 'Fair Value and Profit Drivers', risk: 'Risk and Uncertainty', capital: 'Capital Allocation',
};
export const staleTitles = (nar: Narrative) => [...new Set((nar?.stale || []).map((x) => STALE_TITLE[x.section] || x.section))];
/** ‘Fair Value and Profit Drivers’ and ‘Risk and Uncertainty’: the titles carry their own "and"s, so each is quoted. */
export const titleList = (ts: string[]) => {
  const q = ts.map((t) => `‘${t}’`);
  return q.length < 2 ? q.join('') : `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`;
};

/** A section: the title on a rule, the byline beside it, then the argument. */
export function Section({ id, title, a, nar, signed = true, children }: {
  id: string; title: string; a: Analysis; nar: Narrative; signed?: boolean; children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-24 border-t border-foreground/80 pt-3 first:mt-0">
      <h2 className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[17px] font-bold tracking-[-.01em]">{title}</span>
        {signed ? (() => {
          const k = NARRATIVE_KEY[id];
          const own = k && nar?.sections?.[k] ? nar : null;
          return <span className="text-tiny text-muted-foreground">{authorOf(own)}, {dateOf(a, own)}</span>;
        })() : null}
      </h2>
      {children}
    </section>
  );
}

/** A numbered exhibit, the way broker research carries its charts: title above, source below. */
export function Exhibit({ n, title, source, children }: { n?: number; title: string; source: string; children: React.ReactNode }) {
  return (
    <figure className="my-5 border-y border-border py-3">
      <figcaption className="mb-2 text-13 font-semibold">{n ? `Exhibit ${n}: ` : ''}{title}</figcaption>
      {children}
      <Small className="mt-2">Source: {source}</Small>
    </figure>
  );
}

/** A report table: hairline rules, figures right-aligned, no card around it. */
export function DocTable({ head, rows, first = 'Figure' }: { head: string[]; rows: React.ReactNode[][]; first?: string }) {
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


export const NoteHead = ({ children }: { children: React.ReactNode }) =>
  <h3 className="mb-2 mt-7 border-t border-border pt-3 text-[15px] font-bold">{children}</h3>;
