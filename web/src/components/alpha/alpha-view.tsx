'use client';

/* ==========================================================================
   Maz Vantage — Alpha Signal components

   The pieces both surfaces (the report tab and the Alpha desk) are built
   from: the score block, the category card, the evidence drawer, and the
   badges that keep a fact, a calculation, an interpretation and an attention
   measure visually distinct.

   The badge is the load-bearing piece of design. Every number carries one of
   five words — VERIFIED FACT, CALCULATED SIGNAL, MODEL INTERPRETATION,
   ATTENTION DATA, INSUFFICIENT DATA — and colour is not used to carry the
   distinction, only weight, dashes and the word itself. Green and red are
   reserved for direction, because that is what they mean everywhere else.
   ========================================================================== */

import * as React from 'react';
import { dec, fmtDate, isNum } from '@/lib/format';
import { CATEGORY_BY_ID } from '@/lib/alpha-signals';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Chevron } from '@/components/market/market-ui';
import { cn } from '@/lib/cn';

/* ==========================================================================
   Small parts
   ========================================================================== */

const BADGE_HELP: Record<string, string> = {
  verified: 'A figure as filed or published. Reproduced here, not adjusted.',
  calculated: 'Arithmetic this app did on filed figures. The calculation is stated in full.',
  estimated: 'A figure somebody else modelled — a consensus, a rating, a target.',
  attention: 'A measure of how closely the company is followed. Not evidence about the business.',
  unavailable: 'No data behind this. The provider that would supply it is named.',
};

type BadgeTone = 'fact' | 'model' | 'attn' | 'gap';
const BADGE: Record<BadgeTone, string> = {
  fact: 'text-foreground border-foreground/40',
  model: 'text-muted-foreground',
  attn: 'border-dashed',
  gap: 'border-dashed opacity-75',
};

export const badgeTone = (q: string): BadgeTone => (q === 'unavailable' ? 'gap' : q === 'attention' ? 'attn' : q === 'estimated' ? 'model' : 'fact');

export function Badge({ tone, children, title }: { tone: BadgeTone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title}
      className={cn('inline-block cursor-help whitespace-nowrap rounded border border-border px-[7px] py-0.5 text-[9px] font-bold leading-[1.6] tracking-[.07em] text-muted-foreground', BADGE[tone])}>
      {children}
    </span>
  );
}

/** The provenance badge. One per signal, always. */
export const QualityBadge = ({ sig }: { sig: any }) =>
  <Badge tone={badgeTone(sig.dataQuality)} title={BADGE_HELP[sig.dataQuality] || ''}>{sig.qualityLabel}</Badge>;

export const ConfidencePill = ({ level }: { level: string }) => (
  <span className={cn('inline-block whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tracking-[.03em] text-muted-foreground',
    level === 'high' && 'text-foreground', (level === 'low' || level === 'none') && 'italic opacity-80')}>
    {level} confidence
  </span>
);

/** A direction dot: green up, red down, hollow for neutral, dashed for a gap. */
export const StatusDot = ({ status, className }: { status: string; className?: string }) => (
  <span aria-hidden="true" className={cn('size-2 flex-none rounded-full border-[1.5px] border-muted-foreground',
    status === 'positive' && 'border-up bg-up', status === 'negative' && 'border-down bg-down',
    status === 'insufficient_data' && 'border-dashed opacity-60', className)} />
);

export const STATUS_WORD: Record<string, string> = {
  positive: 'Positive', negative: 'Negative', neutral: 'Neutral', insufficient_data: 'No data',
};

/**
 * A source, printed the same way everywhere. The link is rendered only when a
 * feed supplied one: a constructed EDGAR URL that is right most of the time is
 * not a citation.
 */
export function SourceLine({ src, compact = false }: { src: any; compact?: boolean }) {
  if (!src) return <p className="text-tiny italic text-muted-foreground">No source attached.</p>;
  return (
    <p className="flex flex-wrap items-center gap-2 text-tiny">
      <span className={cn('rounded border border-border px-1.5 py-px text-[10px] font-semibold text-muted-foreground',
        src.reliabilityTier === 'primary' && 'border-foreground/40 text-foreground', src.reliabilityTier === 'contextual' && 'border-dashed')}>
        {src.typeLabel}
      </span>
      <span className="font-medium">{src.publisher}</span>
      {!compact && src.publicationDate ? <span className="text-muted-foreground">Published {src.publicationDate}</span> : null}
      {src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View original source →</a> : null}
    </p>
  );
}

/* ==========================================================================
   The evidence drawer — one per page, opened from anywhere under it
   ========================================================================== */

const EvidenceContext = React.createContext<(sig: any) => void>(() => {});
export const useEvidence = () => React.useContext(EvidenceContext);

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1.5 border-t border-border pt-3">
      <h4 className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

const PCT_UNITS = new Set(['margin', 'growth rate', 'return', 'share of revenue', 'spread']);

function NumCell({ label, value, unit, signed = false }: { label: string; value: unknown; unit?: string; signed?: boolean }) {
  let text = '—';
  if (isNum(value)) {
    if (unit && PCT_UNITS.has(unit)) text = `${signed && value > 0 ? '+' : ''}${dec(value * 100, 2)}%`;
    else if (unit === 'currency') text = Math.abs(value) >= 1e6 ? `${value < 0 ? '−' : ''}${dec(Math.abs(value) / 1e9, 2)}bn` : dec(value, 2);
    else if (Math.abs(value) >= 1000) text = value.toLocaleString('en-US');
    else text = `${signed && value > 0 ? '+' : ''}${dec(value, 2)}`;
  } else if (typeof value === 'string') text = value;
  return (
    <div className="grid gap-0.5 rounded-lg bg-muted p-3">
      <span className="text-micro text-muted-foreground">{label}</span>
      <strong className={cn('text-lg font-bold tnum', signed && isNum(value) && (value > 0 ? 'text-up' : value < 0 ? 'text-down' : ''))}>{text}</strong>
      {unit ? <small className="text-[10px] text-muted-foreground">{unit}</small> : null}
    </div>
  );
}

/*
  Everything behind one signal, in the order a sceptic reads it: fact before
  calculation before interpretation, and the limitations last but never
  optional — "there is nothing to qualify here" is itself a claim.
*/
function EvidenceBody({ sig }: { sig: any }) {
  if (sig.status === 'insufficient_data') {
    return (
      <div className="grid gap-3">
        <div><QualityBadge sig={sig} /></div>
        <Sec title="What this would measure"><p className="text-13">{CATEGORY_BY_ID[sig.category]?.question || ''}</p></Sec>
        <Sec title="Why it is missing"><p className="text-13">{sig.unavailable?.note || 'No source for this measurement is available.'}</p></Sec>
        <Sec title="What would fill it"><p className="text-13 font-semibold">{sig.unavailable?.provider || 'A source not yet chosen.'}</p></Sec>
        <p className="text-tiny italic text-muted-foreground">
          Nothing is substituted for this measurement. It lowers the data coverage of the score rather than being approximated from something else.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <QualityBadge sig={sig} />
        <ConfidencePill level={sig.confidence} />
        <span className={cn('text-tiny font-semibold', sig.status === 'positive' && 'text-up', sig.status === 'negative' && 'text-down')}>{STATUS_WORD[sig.status]}</span>
      </div>
      <Sec title="The figures">
        <div className="grid grid-cols-3 gap-2">
          <NumCell label="Current" value={sig.raw} unit={sig.unit} />
          <NumCell label="Prior" value={sig.previous} unit={sig.unit} />
          <NumCell label="Change" value={sig.change} unit={sig.unit} signed />
        </div>
      </Sec>
      <Sec title="Platform calculation"><p className="font-mono text-tiny leading-relaxed">{sig.calculation}</p></Sec>
      {sig.historical ? <Sec title="Historical comparison"><p className="text-13">{sig.historical}</p></Sec> : null}
      <Sec title="Model interpretation">
        <p className="text-13"><Badge tone="model">MODEL INTERPRETATION</Badge> {sig.interpretation || 'No interpretation was recorded.'}</p>
      </Sec>
      <Sec title="Source">
        <SourceLine src={sig.source} />
        <p className="text-tiny text-muted-foreground">
          {sig.sourceDate
            ? `Source dated ${fmtDate(sig.sourceDate)} — ${sig.freshness?.text || ''}. Retrieved ${fmtDate(sig.retrievedAt)}.`
            : `Undated source. Retrieved ${fmtDate(sig.retrievedAt)}.`}
        </p>
      </Sec>
      <Sec title="Limitations">
        <p className="text-13 text-muted-foreground">
          {sig.limitations || 'The provider recorded no specific limitation for this signal. That is not the same as there being none — read the calculation above and judge it yourself.'}
        </p>
      </Sec>
    </div>
  );
}

export function EvidenceHost({ children }: { children: React.ReactNode }) {
  const [sig, setSig] = React.useState<any>(null);
  return (
    <EvidenceContext.Provider value={setSig}>
      {children}
      <Dialog open={Boolean(sig)} onOpenChange={(o) => { if (!o) setSig(null); }}>
        <DialogContent className="max-h-[86vh] max-w-2xl overflow-y-auto">
          <DialogTitle className="pr-8 text-lg font-bold">{sig?.name}</DialogTitle>
          {sig ? <EvidenceBody sig={sig} /> : null}
        </DialogContent>
      </Dialog>
    </EvidenceContext.Provider>
  );
}

/* ==========================================================================
   The score block

   Coverage and confidence sit inside the block: a 78 computed from two
   categories and a 78 computed from nine are different claims, and the reader
   has to meet both facts at once.
   ========================================================================== */

function Meter({ label, pct, value, help }: { label: string; pct: number; value: string; help: string }) {
  return (
    <div className="grid cursor-help gap-1" title={help}>
      <div className="flex justify-between gap-2.5 text-micro"><span className="text-muted-foreground">{label}</span><span className="tnum">{value}</span></div>
      <div className="h-1 overflow-hidden rounded-[3px] bg-accent">
        <div className="h-full bg-foreground opacity-55" style={{ width: `${Math.max(2, Math.min(100, pct || 0))}%` }} />
      </div>
    </div>
  );
}

// The band tints the border only: a filled block behind a large number reads
// as a verdict, and this number is not one.
const DIAL: Record<string, string> = {
  high: 'border-up', mid: 'border-up/45', low: 'border-down/35', weak: 'border-down', na: 'border-dashed border-border',
};

export function ScoreBlock({ result, quantScore = null, compact = false }: { result: any; quantScore?: number | null; compact?: boolean }) {
  const score = result.score;
  const band = !isNum(score) ? 'na' : score >= 70 ? 'high' : score >= 55 ? 'mid' : score >= 40 ? 'low' : 'weak';
  return (
    <div className={cn('flex items-center gap-5 rounded-[14px] border border-border bg-muted', compact ? 'p-4' : 'px-6 py-5')}>
      <div className={cn('flex items-baseline gap-0.5 rounded-xl border-2 bg-background px-4 py-3.5', DIAL[band])}>
        <strong className={cn('font-bold leading-none tracking-[-.04em] tnum', compact ? 'text-3xl' : 'text-[44px]')}>{isNum(score) ? String(score) : '—'}</strong>
        <span className="text-sm text-muted-foreground">/100</span>
      </div>
      <div className="grid min-w-0 flex-1 gap-2.5">
        <p className="text-micro font-bold uppercase tracking-[.1em] text-muted-foreground">Alpha Signal</p>
        <div className="grid gap-2">
          <Meter label="Data coverage" pct={result.coveragePct} value={`${result.coveragePct}%`}
            help="The share of the model's weight that could actually be measured. Categories with no data are dropped from the score, not scored zero." />
          <Meter label="Signals" pct={Math.min(100, (result.counts.total / 20) * 100)}
            value={`${result.counts.positive}+ · ${result.counts.negative}− · ${result.counts.missing} gaps`}
            help="Positive, negative, and the ones no provider could fill." />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ConfidencePill level={result.confidence} />
          {isNum(quantScore) ? (
            <span className="inline-flex cursor-help items-baseline gap-1.5 rounded-full border border-dashed border-border px-2.5 py-0.5"
              title="The existing quant rating, on its own 0-5 scale. A different question, deliberately a different scale.">
              <i className="text-[10px] not-italic text-muted-foreground">Quant</i><b className="text-tiny tnum">{dec(quantScore, 2)}/5</b>
            </span>
          ) : null}
          <span className="cursor-help text-[10px] text-muted-foreground tnum" title={`Weighting version ${result.version}. Two scores from different versions are not comparable.`}>v{result.version}</span>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   The classification
   ========================================================================== */

export function ArchetypeBlock({ classification }: { classification: any }) {
  const { primary, others, supporting, opposing } = classification;
  const list = (title: string, cats: any[], tone: 'up' | 'down') => (cats.length ? (
    <div>
      <h4 className="mb-2 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{title}</h4>
      <ul className="grid gap-1.5">
        {cats.slice(0, 4).map((c) => (
          <li key={c.id || c.title} className="flex justify-between gap-2.5 text-13">
            <span>{c.title}</span><span className={cn('font-semibold tnum', tone === 'up' ? 'text-up' : 'text-down')}>{Math.round(c.score)}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null);
  return (
    <section className="grid content-start gap-4 rounded-[14px] border border-border px-6 py-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">Primary classification</p>
        <h3 className="mt-1 text-2xl font-bold tracking-[-.02em]">{primary.label}</h3>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">{primary.blurb}</p>
        {others.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[.06em] text-muted-foreground">Also matches</span>
            {others.map((o: any) => <span key={o.label} title={o.blurb} className="cursor-help whitespace-nowrap rounded-full bg-accent px-2.5 py-[3px] text-micro font-medium">{o.label}</span>)}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[18px]">
        {list('Supporting evidence', supporting, 'up')}
        {list('Counter-evidence', opposing, 'down')}
      </div>
    </section>
  );
}

/* ==========================================================================
   A category card — the card shows what the category concluded, each row what
   it concluded it from, and the drawer behind a row shows the arithmetic.
   ========================================================================== */

/** One signal, as a row that opens its own evidence. */
export function SignalRow({ sig }: { sig: any }) {
  const open = useEvidence();
  const gap = sig.status === 'insufficient_data';
  return (
    <button type="button" onClick={() => open(sig)} title={gap ? 'No data — open to see what would be needed' : 'Open the evidence behind this signal'}
      className={cn('flex w-full items-start gap-2.5 rounded-[7px] px-2 py-[9px] text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary', gap && 'opacity-70')}>
      <StatusDot status={sig.status} className="mt-[5px]" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-13 font-medium">{sig.name}</span>
        <span className="text-tiny leading-normal text-muted-foreground">{gap ? `Needs ${sig.unavailable?.provider || 'a provider'}` : (sig.interpretation || '')}</span>
      </span>
      <span className="flex flex-none items-center gap-[7px]">
        <QualityBadge sig={sig} />
        {isNum(sig.score) ? <span className="min-w-6 text-right text-13 font-semibold tnum">{Math.round(sig.score)}</span> : null}
      </span>
    </button>
  );
}

// A hairline on the leading edge, not a fill: the card is a measurement, and a
// coloured panel would read as a recommendation.
const EDGE: Record<string, string> = {
  up: 'shadow-[inset_3px_0_0_var(--up)]', down: 'shadow-[inset_3px_0_0_var(--down)]',
  flat: 'shadow-[inset_3px_0_0_var(--border)]', na: 'shadow-[inset_3px_0_0_var(--border)] opacity-80',
};

export function CategoryCard({ cat, defaultOpen = false }: { cat: any; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const spec = CATEGORY_BY_ID[cat.id];
  const band = !isNum(cat.score) ? 'na' : cat.score >= 65 ? 'up' : cat.score <= 35 ? 'down' : 'flat';
  const n = cat.signals.length;
  return (
    <article data-category={cat.id} className={cn('grid content-start gap-2.5 rounded-xl border border-border px-5 py-[18px]', EDGE[band])}>
      <header className="flex items-start justify-between gap-3.5">
        <div>
          <h3 className="text-[15px] font-bold">{cat.title}</h3>
          <p className="mt-1 text-tiny leading-normal text-muted-foreground">{spec?.question || ''}</p>
        </div>
        <div className="flex-none text-right">
          <strong className="block text-[26px] font-bold tracking-[-.03em] tnum">{isNum(cat.score) ? String(Math.round(cat.score)) : '—'}</strong>
          <small className="text-[10px] text-muted-foreground">{Math.round(cat.weight * 100)}% weight</small>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-1.5">
        {cat.evidence === 'attention' ? <Badge tone="attn" title={BADGE_HELP.attention}>ATTENTION DATA</Badge> : null}
        {cat.evidence === 'context' ? <Badge tone="model" title="A fact about the sector, not about this company.">CONTEXT</Badge> : null}
        <ConfidencePill level={cat.confidence} />
        <span className="text-micro text-muted-foreground tnum">{cat.counts.positive}+ · {cat.counts.negative}− · {cat.counts.missing} gaps</span>
        {cat.asOf ? <span className="text-micro text-muted-foreground">to {cat.asOf}</span> : null}
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 justify-self-start text-tiny text-primary">
        <span>{open ? 'Hide signals' : `${n} signal${n === 1 ? '' : 's'}`}</span>
        <Chevron className={cn('transition-transform', open && 'rotate-90')} />
      </button>
      {open ? <div className="grid gap-0.5 border-t border-border pt-1.5">{cat.signals.map((s: any) => <SignalRow key={s.id} sig={s} />)}</div> : null}
    </article>
  );
}

/* ==========================================================================
   The standing notice — the three things a reader has to hold to read the
   number correctly, and they are things the engine genuinely cannot do.
   ========================================================================== */

export function StandingNotice() {
  return (
    <div className="grid gap-2.5 rounded-xl border border-border bg-muted px-5 py-4 text-13 leading-relaxed text-muted-foreground [&_b]:text-foreground">
      <p><b>What this score is. </b>A weighted reading of recent, dated evidence about a company — not a forecast, and not a rating of the company&apos;s quality. It is deliberately a different question from the quant rating, on a different scale, so the two cannot be averaged.</p>
      <p><b>The weights are unvalidated. </b>They are a stated starting allocation with a reason behind each one. No backtest supports them, because this app stores no history to backtest against. Treat the category scores as more informative than the composite.</p>
      <p><b>Missing data is shown, never filled. </b>Signals with no provider behind them are listed with the integration that would supply them, and they lower the coverage figure. Nothing here is approximated from social media, forums or rumour.</p>
    </div>
  );
}
