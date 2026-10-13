'use client';

/* ==========================================================================
   Maz Vantage — the Alpha Signal tab's two outside views

   1. **In management's words** — the bull and bear case from the newest
      earnings call, quoted, plus what the analysts on the call pressed on
      (`lib/management-voice`).
   2. **What the firms are publishing** — rating calls, consensus forecasts
      and price targets on the company; peers' consensus, dated industry
      figures and outlooks on its industry (`lib/firm-views`).

   Both load on their own, after the score, and neither enters it. Each says
   whose view a line is and when it was published.
   ========================================================================== */

import * as React from 'react';
import { fetchFor, fetchTranscript, hasApiKey, loadSnapshot, mapLimited, type FeedResult } from '@/lib/fmp';
import { dec, fmtDate, isNum, money, price as fmtPrice } from '@/lib/format';
import { FLAG_LABELS, type LanguageFlag } from '@/lib/demand-language';
import { latestCalls, readCall, toneShift, type CasePoint, type VoiceCall } from '@/lib/management-voice';
import {
  chainsFor, consensusYears, houseViews, lettersFor, median, peerForecast, peerSymbols, reportedYears, sectorTopics, spread, targetWindows,
  type PeerForecast,
} from '@/lib/firm-views';
import { actionCounts, isoBefore, latestByFirm, normaliseRatingActions, ratingSide, type RatingAction } from '@/lib/insider-trading';
import { firmOf, kindLabel, STANCE_LABEL, topicLabel, type Letter, type Mention, type Stance } from '@/lib/letters';
import { DATA_TYPES, type EvidenceRegister } from '@/lib/demand-signals';
import type { Analysis } from '@/lib/model';
import { Pill } from '@/components/report/ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import { useNav } from '@/components/nav-context';
import { cn } from '@/lib/cn';

const SecTitle = ({ children }: { children: React.ReactNode }) => <h2 className="text-[19px] font-bold tracking-[-.02em]">{children}</h2>;
const SecBody = ({ children }: { children: React.ReactNode }) => <p className="max-w-[100ch] text-13 leading-[1.7] text-muted-foreground">{children}</p>;
const Fine = ({ children }: { children: React.ReactNode }) => <p className="max-w-[100ch] text-tiny italic leading-[1.7] text-muted-foreground">{children}</p>;
const Box = ({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <div className={cn('grid content-start gap-3 rounded-xl border border-border px-5 py-[18px]', className)}>
    <h3 className="text-13 font-bold">{title}</h3>
    {children}
  </div>
);
const More = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="justify-self-start text-tiny font-semibold text-primary hover:underline">{children}</button>
);

const pct = (v: number | null | undefined, dp = 0) => (isNum(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(dp)}%` : '—');
const signed = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}`);

/** "Today" for a feed: the capture date when it came from the saved copy, so a window does not empty as the file ages. */
const todayFor = (r: FeedResult | undefined, capturedAt: string | null) =>
  (r?.fromSnapshot && capturedAt ? capturedAt : new Date().toISOString().slice(0, 10));

/* ==========================================================================
   1. In management's words
   ========================================================================== */

type VoiceState =
  | { status: 'loading' }
  | { status: 'ok'; calls: VoiceCall[]; saved: boolean }
  | { status: 'empty'; message: string };

let savedVoice: Promise<VoiceCall[]> | null = null;
const loadSavedVoice = () => (savedVoice ||= fetch('/data/management-voice.json')
  .then((r) => (r.ok ? r.json() : { calls: [] }))
  .then((f): VoiceCall[] => (Array.isArray(f?.calls) ? f.calls : []))
  .catch(() => []));

async function loadVoice(symbol: string, index: unknown): Promise<VoiceState> {
  const wanted = latestCalls(index, 2);
  let gated = false;
  if (hasApiKey() && wanted.length) {
    const results = await Promise.all(wanted.map((c) => fetchTranscript(symbol, c.year, c.quarter)));
    const calls: VoiceCall[] = [];
    results.forEach((r, i) => {
      const content = String((r.data as any)?.content || (r.data as any)?.transcript || '');
      if (r.status === 'ok' && content) {
        const c = wanted[i];
        calls.push({ symbol, period: `${c.year} Q${c.quarter}`, date: c.date, reading: readCall(content) });
      }
      if (r.status === 'gated') gated = true;
    });
    if (calls.length) return { status: 'ok', calls, saved: false };
  }
  const saved = (await loadSavedVoice()).filter((c) => c.symbol === symbol.toUpperCase()).sort((a, b) => b.date.localeCompare(a.date));
  if (saved.length) return { status: 'ok', calls: saved.slice(0, 2), saved: true };
  if (!wanted.length) return { status: 'empty', message: `No earnings-call transcript is held for ${symbol}, so there is nothing of management's to quote.` };
  if (gated) return { status: 'empty', message: 'Earnings-call transcripts are not part of the current data coverage, so management cannot be quoted here.' };
  return { status: 'empty', message: 'Live data is unavailable, so the calls cannot be read. A saved reading ships only with the example report.' };
}

function Quote({ text, who, words, tone }: { text: string; who: React.ReactNode; words: string[]; tone: 'up' | 'down' | 'ask' }) {
  return (
    <li className="grid gap-1 border-t border-border pt-2.5 first:border-t-0 first:pt-0" title={words.length ? `Scored on: ${words.join(', ')}` : undefined}>
      <span className="text-13 leading-[1.6]">
        <span className={cn('mr-1 font-bold', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-muted-foreground')}>
          {tone === 'up' ? '+' : tone === 'down' ? '−' : '?'}
        </span>
        “{text}”
      </span>
      <span className="text-tiny text-muted-foreground">— {who}</span>
    </li>
  );
}

/** One side of the case: the subjects as bullets, then the quotes they rest on. */
function CaseRow({ title, points, quotes, tone }: {
  title: React.ReactNode; points: CasePoint[] | undefined; quotes: React.ReactNode; tone: 'up' | 'down';
}) {
  return (
    <Box title={title}>
      <div className="grid gap-x-7 gap-y-4 md:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-2">
          <h4 className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">In points</h4>
          {points?.length ? (
            <ul className="grid gap-2">
              {points.map((p) => (
                <li key={p.theme} className="grid grid-cols-[10px_minmax(0,1fr)] gap-x-2 text-13 leading-snug"
                  title={`${p.speaker}: “${p.example}”`}>
                  <span className={cn('mt-[7px] size-1.5 rounded-full', tone === 'up' ? 'bg-up' : 'bg-down')} aria-hidden />
                  <span>
                    <span className="font-semibold">{p.text}</span>
                    <span className="block text-tiny text-muted-foreground">
                      {p.count} sentence{p.count === 1 ? '' : 's'}{p.words.length ? ` · ${p.words.map((w) => `“${w}”`).join(', ')}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : <Fine>{points ? 'Nothing on this side grouped under a subject.' : 'This saved reading predates the points; the quotes stand alone.'}</Fine>}
        </div>
        <div className="grid content-start gap-2">
          <h4 className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">In their words</h4>
          {quotes}
        </div>
      </div>
    </Box>
  );
}

export function ManagementVoice({ a }: { a: Analysis }) {
  const nav = useNav();
  const symbol = String(a.facts?.symbol || a.ds?.symbol || '').toUpperCase();
  const [state, setState] = React.useState<VoiceState>({ status: 'loading' });
  const [pick, setPick] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    setPick(0);
    const index = (a.ds as any)?.get?.('transcriptDates') ?? null;
    loadVoice(symbol, index)
      .then((s) => live && setState(s))
      .catch(() => live && setState({ status: 'empty', message: 'The calls could not be read.' }));
    return () => { live = false; };
  }, [a, symbol]);

  const intro = (
    <>
      <SecTitle>In management&apos;s words</SecTitle>
      <SecBody>
        The bull and bear case as management put it on the earnings call, quoted rather than paraphrased, and what the analysts on the call
        pressed them on. Management rarely argues its own bear case; the questions are where it gets put to them.
      </SecBody>
    </>
  );
  if (state.status === 'loading') return <section className="grid gap-3.5">{intro}<Skeleton className="h-28" /></section>;
  if (state.status === 'empty') return <section className="grid gap-3.5">{intro}<Fine>{state.message}</Fine></section>;

  const call = state.calls[Math.min(pick, state.calls.length - 1)];
  const r = call.reading;
  const other = state.calls[pick === 0 ? 1 : 0] || null;
  const shift = pick === 0 ? toneShift(r, other?.reading || null) : null;
  const flags = Object.entries(r.flags) as [LanguageFlag, number][];

  return (
    <section className="grid gap-3.5">
      {intro}
      <div className="flex flex-wrap items-center gap-2.5 text-13">
        {state.calls.length > 1 ? (
          <span className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Which call">
            {state.calls.map((c, i) => (
              <button key={c.date} type="button" aria-pressed={i === pick} onClick={() => setPick(i)}
                className={cn('rounded-md px-2.5 py-1 text-tiny font-semibold', i === pick ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {c.period} call
              </button>
            ))}
          </span>
        ) : <b>{call.period} call</b>}
        <span className="text-muted-foreground">{fmtDate(call.date)}</span>
        <Pill tone={r.score === null ? 'muted' : r.score >= 15 ? 'good' : r.score <= -15 ? 'bad' : 'neutral'}
          title="−100 to +100: management's sentences for the business against those against it, shrunk toward zero when few qualify.">
          Tone {signed(r.score)} · {r.category}
        </Pill>
        {state.saved ? <Pill tone="muted" title="Live data is unavailable, so this is a saved reading">saved reading</Pill> : null}
      </div>
      <p className="max-w-[100ch] text-tiny leading-relaxed text-muted-foreground">
        {r.sentences} business sentences from management: {r.positive} for, {r.negative} against. {r.analysts} analysts asked questions.
        {shift ? ` The tone was ${shift.text}.` : ''}
        {flags.length ? ` Flags: ${flags.map(([k, n]) => `${FLAG_LABELS[k]} ×${n}`).join(', ')}.` : ''}
      </p>
      <div className="grid gap-[18px]">
        <CaseRow
          title={<span className="text-up">The bull case</span>}
          points={r.points?.bull}
          quotes={r.topPositive.length
            ? <ul className="grid gap-x-[18px] gap-y-2.5 md:grid-cols-2 [&>li]:md:border-t-0 [&>li]:md:pt-0">{r.topPositive.map((s) => <Quote key={s.text} text={s.text} who={s.speaker} words={s.positives} tone="up" />)}</ul>
            : <Fine>No sentence argued for the business clearly enough to quote.</Fine>}
          tone="up"
        />
        <CaseRow
          title={<span className="text-down">The bear case — what they conceded</span>}
          points={r.points?.bear}
          quotes={r.topNegative.length
            ? <ul className="grid gap-x-[18px] gap-y-2.5 md:grid-cols-2 [&>li]:md:border-t-0 [&>li]:md:pt-0">{r.topNegative.map((s) => <Quote key={s.text} text={s.text} who={s.speaker} words={s.negatives} tone="down" />)}</ul>
            : <Fine>Management conceded nothing the reader could find — which is worth noticing in itself.</Fine>}
          tone="down"
        />
        <Box title="What the analysts pressed on">
          {r.concerns.length
            ? <ul className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-[18px] gap-y-2.5 [&>li]:border-t-0 [&>li]:pt-0">{r.concerns.map((s) => <Quote key={s.text} text={s.text} who={s.firm ? `${s.analyst}, ${s.firm}` : s.analyst} words={s.negatives} tone="ask" />)}</ul>
            : <Fine>No analyst question carried a negative word.</Fine>}
        </Box>
      </div>
      <Fine>
        Chosen by a rule-based reader, not a person and not a language model: a sentence counts when it talks about the business and carries
        a word from a fixed list, and the strongest each way are quoted, at most 25 words, with any near-repeat dropped. Hover a quote for the
        words it was scored on. The points file every scored sentence under the subjects it names — supply, costs, currency, regions and so
        on — in wording fixed per subject and side; the count is how many sentences back each one, and hovering shows the strongest. It misses sarcasm, hedged guidance and numbers without adjectives, and it is not part of the Alpha Signal score —
        management is never more upbeat than at a peak.
      </Fine>
      <More onClick={() => nav.goSymbolTab('Transcripts', symbol)}>Read the whole call on the Transcripts tab ›</More>
    </section>
  );
}

/* ==========================================================================
   2. What the firms are publishing
   ========================================================================== */

let register: Promise<EvidenceRegister | null> | null = null;
const loadRegister = () => (register ||= fetch('/data/demand-evidence.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** The rating actions: live, then the saved copy. Same order as the Insider Trading tab. */
function useRatingActions(symbol: string) {
  const [state, setState] = React.useState<FeedResult | null>(null);
  React.useEffect(() => {
    let live = true;
    setState(null);
    (async () => {
      let r: FeedResult = await fetchFor('gradeActions', symbol).catch((): FeedResult => ({ status: 'error', data: null }));
      if (r.status !== 'ok') {
        const snap = await loadSnapshot(symbol).catch(() => null);
        const saved = snap?.feeds?.gradeActions;
        if (Array.isArray(saved)) r = { status: 'ok', data: saved, fromSnapshot: true, date: snap?.capturedAt };
      }
      if (live) setState(r);
    })();
    return () => { live = false; };
  }, [symbol]);
  return state;
}

const ACTION_TONE: Record<RatingAction, string> = { upgrade: 'good', downgrade: 'bad', initiate: 'gold', maintain: 'muted' };
const ONE: Record<RatingAction, string> = { upgrade: 'Upgrade', downgrade: 'Downgrade', initiate: 'Initiation', maintain: 'Maintained' };
const COUNTED: Record<RatingAction, (n: number) => string> = {
  upgrade: (n) => (n === 1 ? 'upgrade' : 'upgrades'),
  downgrade: (n) => (n === 1 ? 'downgrade' : 'downgrades'),
  initiate: (n) => (n === 1 ? 'new coverage' : 'new coverages'),
  maintain: () => 'kept their rating',
};

function RatingCalls({ symbol }: { symbol: string }) {
  const nav = useNav();
  const r = useRatingActions(symbol);
  if (!r) return <Box title="Rating calls, last 90 days"><Skeleton className="h-20" /></Box>;
  const rows = r.status === 'ok' ? normaliseRatingActions(r.data) : [];
  const now = r.fromSnapshot && r.date ? Date.parse(r.date) : Date.now();
  const since = isoBefore(now, 90);
  const counts = actionCounts(rows, since);
  const latest = latestByFirm(rows, since);
  const calls = Object.values(counts).reduce((s, n) => s + n, 0);
  const sides = latest.reduce((m, x) => { const s = ratingSide(x.to); if (s) m[s] += 1; return m; }, { buy: 0, hold: 0, sell: 0 });
  return (
    <Box title="Rating calls, last 90 days">
      {r.status !== 'ok' ? <Fine>The firms&apos; rating actions are not available right now.</Fine> : !latest.length ? <Fine>No firm published a rating call in the last 90 days.</Fine> : (
        <>
          <p className="text-13 leading-relaxed">
            <b>{calls}</b> calls by <b>{latest.length}</b> firms: {(['upgrade', 'downgrade', 'initiate', 'maintain'] as RatingAction[])
              .filter((k) => counts[k]).map((k) => `${counts[k]} ${COUNTED[k](counts[k])}`).join(', ')}.
            <span className="text-muted-foreground"> Their latest ratings: {sides.buy} buy-side, {sides.hold} hold, {sides.sell} sell-side.</span>
          </p>
          <ul className="grid">
            {latest.slice(0, 8).map((x) => (
              <li key={x.firm} className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-baseline gap-2 border-t border-border py-1.5 text-tiny">
                <span className="text-muted-foreground tnum">{fmtDate(x.date)}</span>
                <span className="truncate"><b className="font-semibold">{x.firm}</b> <span className="text-muted-foreground">{x.from && x.from !== x.to ? `${x.from} → ` : ''}{x.to || '—'}</span></span>
                <Pill tone={ACTION_TONE[x.action]}>{ONE[x.action]}</Pill>
              </li>
            ))}
          </ul>
          {r.fromSnapshot ? <Fine>From the saved copy of {r.date}; the 90 days are counted back from then.</Fine> : null}
        </>
      )}
      <More onClick={() => nav.goSymbolTab('Insider Trading', symbol)}>Every rating action, with history ›</More>
    </Box>
  );
}

function Consensus({ a, bag, capturedAt }: { a: Analysis; bag: any; capturedAt: string | null }) {
  const nav = useNav();
  const feed: FeedResult | undefined = bag?.estimates;
  const years = consensusYears(feed?.status === 'ok' ? feed.data : (a.ds as any)?.get?.('estimates'), todayFor(feed, capturedAt), 3,
    reportedYears((a.ds as any)?.get?.('income')));
  const cur = String(a.facts?.currency || 'USD') === 'USD' ? 'US$' : `${a.facts?.currency} `;
  return (
    <Box title="Consensus forecasts">
      {!years.length ? <Fine>No consensus forecast is published for the years ahead.</Fine> : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full border-collapse text-tiny tnum">
            <thead>
              <tr className="text-left text-micro uppercase tracking-[.05em] text-muted-foreground">
                {['Year ending', 'Revenue', 'EPS', 'Analysts'].map((h) => <th key={h} scope="col" className="py-1.5 pr-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {years.map((y) => {
                const rs = spread(y.revenue, y.revenueLow, y.revenueHigh);
                const es = spread(y.eps, y.epsLow, y.epsHigh);
                return (
                  <tr key={y.date} className="border-t border-border align-top">
                    <td className="py-1.5 pr-3">{fmtDate(y.date)}</td>
                    <td className="py-1.5 pr-3" title={isNum(rs) ? `Lowest to highest forecast: ${money(y.revenueLow, { currency: cur })} – ${money(y.revenueHigh, { currency: cur })}` : undefined}>
                      <b className="font-semibold">{money(y.revenue, { currency: cur })}</b> <span className={cn(isNum(y.revenueGrowth) && (y.revenueGrowth >= 0 ? 'text-up' : 'text-down'))}>{pct(y.revenueGrowth, 1)}</span>
                      {isNum(rs) ? <div className="text-muted-foreground">spread {Math.round(rs * 100)}%</div> : null}
                    </td>
                    <td className="py-1.5 pr-3" title={isNum(es) ? `Lowest to highest forecast: ${dec(y.epsLow, 2)} – ${dec(y.epsHigh, 2)}` : undefined}>
                      <b className="font-semibold">{isNum(y.eps) ? dec(y.eps, 2) : '—'}</b> <span className={cn(isNum(y.epsGrowth) && (y.epsGrowth >= 0 ? 'text-up' : 'text-down'))}>{pct(y.epsGrowth, 1)}</span>
                      {isNum(es) ? <div className="text-muted-foreground">spread {Math.round(es * 100)}%</div> : null}
                    </td>
                    <td className="py-1.5 pr-3">{y.analystsRevenue ?? '—'}{y.analystsEps !== null && y.analystsEps !== y.analystsRevenue ? ` / ${y.analystsEps}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Fine>The average of the published forecasts. Growth is against the year before — the filed figure where the year has been reported, otherwise its consensus; the spread is highest minus lowest over the average — a wide one is disagreement, not information. Far years rest on few analysts.</Fine>
      <More onClick={() => nav.goSymbolTab('Analysts Forecast', a.facts?.symbol)}>The full forecast page ›</More>
    </Box>
  );
}

function Targets({ a, bag, className }: { a: Analysis; bag: any; className?: string }) {
  const windows = targetWindows(bag?.targetSummary?.status === 'ok' ? bag.targetSummary.data : null, isNum(a.facts?.price) ? a.facts.price : null);
  return (
    <Box title="Price targets" className={className}>
      {!windows.length ? <Fine>No price target was published in the last year.</Fine> : (
        <ul className="grid gap-2">
          {windows.map((w) => (
            <li key={w.label} className="grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-2 text-13">
              <span className="text-tiny text-muted-foreground">{w.label}</span>
              <span>
                <b className="tnum">{fmtPrice(w.average)}</b> <span className="text-tiny text-muted-foreground">average of {w.count}</span>
                {isNum(w.upside) ? <span className={cn('ml-1.5 text-tiny font-semibold tnum', w.upside >= 0 ? 'text-up' : 'text-down')}>{pct(w.upside, 1)} vs price</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Fine>Averages of the targets firms published in each window. Which firm set which target is not in the data, so none is attributed.</Fine>
    </Box>
  );
}

function PeerConsensus({ a, bag, capturedAt }: { a: Analysis; bag: any; capturedAt: string | null }) {
  const symbol = String(a.facts?.symbol || '').toUpperCase();
  const peers = peerSymbols((a.ds as any)?.get?.('peers'), symbol);
  const [rows, setRows] = React.useState<PeerForecast[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setRows(null); }, [symbol]);
  const asOf = todayFor(bag?.estimates, capturedAt);
  const self = peerForecast(symbol, bag?.estimates?.status === 'ok' ? bag.estimates.data : (a.ds as any)?.get?.('estimates'), asOf,
    reportedYears((a.ds as any)?.get?.('income')));
  const read = async () => {
    setBusy(true);
    const got = await mapLimited(peers, async (s) => {
      const r = await fetchFor('estimates', s);
      return r.status === 'ok' ? peerForecast(s, r.data, new Date().toISOString().slice(0, 10)) : null;
    }, 3);
    setRows((got as (PeerForecast | null)[]).filter((x): x is PeerForecast => !!x && (isNum(x.revenueGrowth) || isNum(x.epsGrowth))));
    setBusy(false);
  };
  const cell = (v: number | null, mid: number | null) => (
    <span className={cn('tnum', isNum(v) && isNum(mid) && (v > mid ? 'text-up' : v < mid ? 'text-down' : ''))}>{pct(v, 1)}</span>
  );
  const midRev = rows ? median(rows.map((r) => r.revenueGrowth)) : null;
  const midEps = rows ? median(rows.map((r) => r.epsGrowth)) : null;
  return (
    <Box title="What the Street forecasts for its peers">
      <p className="text-tiny leading-relaxed text-muted-foreground">
        The same consensus for the companies the data lists as {symbol}&apos;s peers, next fiscal year against the one before — the nearest thing
        the data holds to the analysts&apos; forecast for the industry.
      </p>
      {!peers.length ? <Fine>No peer list is held for this company.</Fine>
        : !rows ? (
          hasApiKey()
            ? <Button size="sm" variant="outline" className="justify-self-start" disabled={busy} onClick={read}>{busy ? 'Reading…' : `Read ${peers.length} peers' forecasts (${peers.length} requests)`}</Button>
            : <Fine>Reading peers&apos; forecasts needs live data, which is unavailable right now. Peers: {peers.join(', ')}.</Fine>
        ) : (
          <table className="w-full border-collapse text-tiny">
            <thead>
              <tr className="text-left text-micro uppercase tracking-[.05em] text-muted-foreground">
                {['Company', 'Year ending', 'Revenue', 'EPS', 'Analysts'].map((h) => <th key={h} scope="col" className="py-1.5 pr-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border bg-accent/50 font-semibold">
                <td className="py-1.5 pr-3">{symbol}</td><td className="py-1.5 pr-3">{self.year ? fmtDate(self.year) : '—'}</td>
                <td className="py-1.5 pr-3">{cell(self.revenueGrowth, midRev)}</td><td className="py-1.5 pr-3">{cell(self.epsGrowth, midEps)}</td><td className="py-1.5 pr-3">{self.analysts ?? '—'}</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.symbol} className="border-t border-border">
                  <td className="py-1.5 pr-3">{r.symbol}</td><td className="py-1.5 pr-3">{r.year ? fmtDate(r.year) : '—'}</td>
                  <td className="py-1.5 pr-3 tnum">{pct(r.revenueGrowth, 1)}</td><td className="py-1.5 pr-3 tnum">{pct(r.epsGrowth, 1)}</td><td className="py-1.5 pr-3">{r.analysts ?? '—'}</td>
                </tr>
              ))}
              <tr className="border-t border-border text-muted-foreground">
                <td className="py-1.5 pr-3" colSpan={2}>Peer median ({rows.length})</td>
                <td className="py-1.5 pr-3 tnum">{pct(midRev, 1)}</td><td className="py-1.5 pr-3 tnum">{pct(midEps, 1)}</td><td />
              </tr>
            </tbody>
          </table>
        )}
      {rows ? <Fine>{symbol}&apos;s row is coloured against the peer median. Peers&apos; growth is consensus against consensus (their filed years would cost another request each), and their fiscal years end in different months, so the years are close, not identical.</Fine> : null}
    </Box>
  );
}

function IndustryFigures({ a }: { a: Analysis }) {
  const nav = useNav();
  const symbol = String(a.facts?.symbol || '').toUpperCase();
  const memberships = chainsFor(symbol);
  const [reg, setReg] = React.useState<EvidenceRegister | null>(null);
  React.useEffect(() => { if (memberships.length) loadRegister().then(setReg); }, [memberships.length]);
  const sector = a.facts?.sector || 'its sector';
  if (!memberships.length) {
    return (
      <Box title="Published industry figures">
        <Fine>
          No dated industry figure for {a.facts?.industry || sector} is in the register yet. It holds the forecasts and statistics behind the
          Demand Discovery chains — AI compute, copper and electrification, robotics and lithium — read by hand from WSTS, the IEA, USGS, IFR
          and the companies.
        </Fine>
      </Box>
    );
  }
  const themes = [...new Set(memberships.map((m) => m.chain.evidenceTheme))];
  const rows = (reg?.evidence || []).filter((e) => themes.includes(e.theme)).sort((x, y) => y.published.localeCompare(x.published)).slice(0, 5);
  const src = new Map((reg?.sources || []).map((s) => [s.id, s]));
  return (
    <Box title="Published industry figures">
      <p className="text-tiny leading-relaxed text-muted-foreground">
        {symbol} sits in {memberships.map((m) => `${m.chain.name.replace(/ \(control.*\)$/, '')} (${m.layerName.toLowerCase()}, ${m.exposure} exposure)`).join('; ')}.
        The newest figures published about that industry:
      </p>
      {!reg ? <Skeleton className="h-16" /> : !rows.length ? <Fine>No figure has been entered for this theme yet.</Fine> : (
        <ul className="grid">
          {rows.map((e) => (
            <li key={e.id} className="grid gap-0.5 border-t border-border py-2 first:border-t-0 first:pt-0">
              <span className="text-13 leading-snug">{e.claim}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-tiny text-muted-foreground">
                <Pill tone={e.type === 'FORECAST' ? 'gold' : 'muted'} title={DATA_TYPES[e.type]?.blurb}>{DATA_TYPES[e.type]?.label || e.type}</Pill>
                {e.period} · <a className="text-primary hover:underline" href={e.url} target="_blank" rel="noreferrer">{src.get(e.sourceId)?.name || e.sourceId}</a> · published {fmtDate(e.published)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <More onClick={() => nav.goView('alpha', 'demand', { theme: memberships[0].chain.id })}>The whole chain in Demand Discovery ›</More>
    </Box>
  );
}

const STANCE_TONE: Record<Stance, string> = { positive: 'good', negative: 'bad', mixed: 'gold', neutral: 'muted' };
const ACTION_WORD: Record<Mention['action'], string> = { bought: 'Bought', sold: 'Sold', discussed: 'Discussed' };

const DocLine = ({ l, children }: { l: Letter; children?: React.ReactNode }) => (
  <li className="grid gap-1 border-t border-border py-2.5 first:border-t-0 first:pt-0">
    <a href={l.url} target="_blank" rel="noreferrer" className="text-13 font-semibold leading-snug hover:text-primary">{l.title}</a>
    <span className="flex flex-wrap items-center gap-1.5 text-tiny text-muted-foreground">
      {firmOf(l)?.name} · {kindLabel(l.kind)} · {l.date.length > 7 ? fmtDate(l.date) : l.date}
    </span>
    {children}
  </li>
);

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="grid gap-1.5">
    <h4 className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">{title}</h4>
    {children}
  </div>
);

/**
 * Three groups, in the order they say something about this company:
 *   1. documents that discuss it by name — with the trade, the stance and
 *      our one-line reading where someone has read the passage;
 *   2. the public house view of each firm that rates it, where the library
 *      holds one — labelled as the house's view, not the analyst's note;
 *   3. sector reading, cut short once the company is named anywhere.
 */
function Outlooks({ a, className }: { a: Analysis; className?: string }) {
  const nav = useNav();
  const symbol = String(a.facts?.symbol || '').toUpperCase();
  const hits = lettersFor(symbol, a.facts?.sector);
  const named = hits.filter((h) => h.why === 'names it');
  const sectorAll = hits.filter((h) => h.why === 'sector');
  const topics = sectorTopics(a.facts?.sector);
  const ratings = useRatingActions(symbol);
  const rows = ratings?.status === 'ok' ? normaliseRatingActions(ratings.data) : [];
  const now = ratings?.fromSnapshot && ratings.date ? Date.parse(ratings.date) : Date.now();
  const latest = latestByFirm(rows, isoBefore(now, 365));
  const houses = houseViews(latest.map((x) => x.firm), undefined, topics);
  // A document shown as a house view is not repeated as sector reading.
  const houseIds = new Set(houses.map((h) => h.letter.id));
  const ratingOf = (rater: string) => latest.find((x) => x.firm === rater);
  const sector = sectorAll.filter((h) => !houseIds.has(h.letter.id));
  return (
    <Box title="Outlooks, research and letters" className={className}>
      <Group title={`Discussing ${symbol} by name`}>
        {named.length ? (
          <ul className="grid">
            {named.map(({ letter: l, mention: m }) => (
              <DocLine key={l.id} l={l}>
                {m ? (
                  <span className="flex flex-wrap items-center gap-1.5 text-tiny">
                    <span className={cn('font-semibold', m.action === 'bought' ? 'text-up' : m.action === 'sold' ? 'text-down' : 'text-muted-foreground')}>{ACTION_WORD[m.action]}</span>
                    {m.stance ? <Pill tone={STANCE_TONE[m.stance]}>{STANCE_LABEL[m.stance]}</Pill> : null}
                    {m.view ? <span className="basis-full text-13 leading-relaxed text-foreground">{m.view}</span> : null}
                  </span>
                ) : null}
              </DocLine>
            ))}
          </ul>
        ) : <Fine>No document in the library discusses {symbol} by name yet. What follows is about its sector, not about it.</Fine>}
      </Group>
      {houses.length ? (
        <Group title={`What the firms that rate ${symbol} say in public`}>
          <ul className="grid">
            {houses.map((h) => {
              const r = ratingOf(h.rater);
              return (
                <DocLine key={h.firmKey} l={h.letter}>
                  <span className="text-tiny text-muted-foreground">
                    {r ? <>{h.rater} rates {symbol} <b className="font-semibold text-foreground">{r.to || '—'}</b> ({fmtDate(r.date)}). </> : null}
                    {h.fit === 'subject' ? `Its newest public piece on ${topics.map(topicLabel).join(' and ')}` : h.fit === 'equities' ? 'Its newest public piece on equities' : 'Its newest public piece, on another subject'} — the
                    house&apos;s view, not its analyst&apos;s note on {symbol}, which goes to clients only.
                  </span>
                </DocLine>
              );
            })}
          </ul>
        </Group>
      ) : null}
      {sector.length ? (
        <Group title={topics.length ? `Sector reading — ${topics.map(topicLabel).join(' and ')}` : 'Sector reading'}>
          <ul className="grid">{sector.map(({ letter: l }) => <DocLine key={l.id} l={l} />)}</ul>
        </Group>
      ) : null}
      {!named.length && !houses.length && !sector.length ? <Fine>Nothing in the library names {symbol} or covers its sector&apos;s subject.</Fine> : null}
      <Fine>Stances and one-line readings are ours, written from reading each passage; the documents themselves are linked, never reproduced.</Fine>
      <More onClick={() => nav.goView('research', 'letters', named.length ? { ticker: symbol } : topics[0] ? { topic: topics[0] } : null)}>
        More in Letters &amp; Outlooks ›
      </More>
    </Box>
  );
}

export function FirmViews({ a, bag, capturedAt }: { a: Analysis; bag: any; capturedAt: string | null }) {
  const symbol = String(a.facts?.symbol || a.ds?.symbol || '').toUpperCase();
  return (
    <section className="grid gap-3.5">
      <SecTitle>What the firms are publishing</SecTitle>
      <SecBody>
        Other people&apos;s views, each named and dated, and none of it in the score. The data carries each firm&apos;s rating call and the
        consensus numbers but not the firms&apos; reports, so nothing here quotes a note this page cannot see.
      </SecBody>
      <h3 className="text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">On {symbol}</h3>
      <div className="grid gap-[18px] md:grid-cols-2">
        <RatingCalls symbol={symbol} />
        <Consensus a={a} bag={bag} capturedAt={capturedAt} />
        <Targets a={a} bag={bag} className="col-span-full" />
      </div>
      <h3 className="mt-2 text-micro font-semibold uppercase tracking-[.06em] text-muted-foreground">On its industry{a.facts?.industry ? ` — ${a.facts.industry}` : ''}</h3>
      <div className="grid gap-[18px] md:grid-cols-2">
        <PeerConsensus a={a} bag={bag} capturedAt={capturedAt} />
        <IndustryFigures a={a} />
        <Outlooks a={a} className="col-span-full" />
      </div>
    </section>
  );
}
